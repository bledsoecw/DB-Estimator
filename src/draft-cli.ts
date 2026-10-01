/**
 * npm run draft -- <job> [--dry-run] [--out review] [--templates id,id] [--model ...]
 *                        [--fixture path] [--capture path] [--no-photos] [--no-history]
 *                        [--learned path] [--relearn] [--relearn-after days] [--reread]
 *                        [--revise "what to change" | --revise-file path]
 *
 * One job, drafted from the budget templates the way a rep would build it:
 * which template to add, which lines to keep with what quantity, which to
 * delete, what to put in a selection group, what to write in General
 * Description, and what has no template line and goes to Carl. Writes the
 * rep's page and a JSON copy of the draft.
 *
 * <job> is a JobTread job id, the six-digit number that starts the job
 * name (261323), or the hyphenated number (26-1323).
 *
 * --revise is the rep's second pass: it reads the last draft's JSON in --out,
 * hands the model the rep's direction as a decision beside what that pass
 * kept, keeps the earlier pass on disk as -passN, and writes a page that
 * says what moved. Run as many passes as it takes.
 *
 * --dry-run reads everything and writes what the model WOULD read — the job
 * text and the template list — then stops. No key is needed and nothing
 * leaves the machine.
 *
 * Past subs' quotes are read on their own and what each said is kept in the
 * learned store by file id (readings.ts); --reread reads them again. A
 * price book answer is searched again when new sub paper for its terms came
 * in since it was learned.
 *
 * Read-only against JobTread. The job's notes, photos and files and the
 * chosen templates' line names go to Anthropic's API; that is the one thing
 * here that leaves the building, and only when a key is set.
 */

import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { anthropicFromEnv, preflight } from './anthropic.ts';
import { formatMoney } from './money.ts';
import { clientFromEnv } from './jobtread/client.ts';
import { fetchJobEvidence, resolveJobId, type JobEvidence } from './draft/evidence.ts';
import { newSince, searchHistory, type HistoryReport } from './draft/history.ts';
import { DEFAULT_RELEARN_DAYS, LearnedStore } from './draft/learned.ts';
import { fetchCostTypes } from './jobtread/queries.ts';
import type { ApiCostType } from './jobtread/types.ts';
import { fetchTemplate, fetchTemplateIndex, type Template, type TemplateSummary } from './draft/templates.ts';
import { evidenceText, templateIndexText } from './draft/prompt.ts';
import { DEFAULT_MODEL, PRICING, anthropicStructuredCall, costOf } from './draft/model.ts';
import { draftEstimate, type DraftFixture, type HistorySource } from './draft/draft.ts';
import { draftFlags, draftJson, renderDraft } from './draft/render.ts';
import { addDirection, changesText, previousFromJson, revisionText, type Revision } from './draft/revise.ts';
import { CREW_LABOR, searchCatalog, type CatalogCandidate, type CatalogSource } from './draft/catalog.ts';

/** Holds DB's pricing; git-ignored, on the machine that runs the drafter. */
export const DEFAULT_LEARNED_PATH = '.db-estimator/learned-prices.json';

export interface DraftArgs {
  job: string;
  dryRun: boolean;
  out: string;
  model: string;
  templateIds: string[];
  fixture: string | null;
  capture: string | null;
  photos: boolean;
  history: boolean;
  /** Search the rest of the catalog for each gap. */
  catalog: boolean;
  /** The learned price book. Findings are read from and written to it. */
  learned: string;
  relearn: boolean;
  relearnAfterDays: number;
  /** Read past quotes again instead of using what they said last time. */
  reread: boolean;
  /** The rep's direction for the next pass, inline or from a file. */
  revise: string | null;
  reviseFile: string | null;
}

export function parseDraftArgs(argv: string[]): DraftArgs {
  const args: DraftArgs = {
    job: '', dryRun: false, out: 'review', model: DEFAULT_MODEL, templateIds: [],
    fixture: null, capture: null, photos: true, history: true, catalog: true,
    learned: DEFAULT_LEARNED_PATH, relearn: false, relearnAfterDays: DEFAULT_RELEARN_DAYS, reread: false,
    revise: null, reviseFile: null,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    if (a === '--dry-run') args.dryRun = true;
    else if (a === '--no-catalog') args.catalog = false;
    else if (a === '--revise') {
      args.revise = argv[++i] ?? null;
      if (args.revise === null || args.revise.startsWith('--')) throw new Error('--revise needs the direction in quotes: --revise "forget the skim coat; ..."');
    } else if (a === '--revise-file') args.reviseFile = argv[++i] ?? null;
    else if (a === '--no-photos') args.photos = false;
    else if (a === '--no-history') args.history = false;
    else if (a === '--relearn') args.relearn = true;
    else if (a === '--reread') args.reread = true;
    else if (a === '--learned') args.learned = argv[++i] ?? args.learned;
    else if (a === '--relearn-after') {
      const n = Number(argv[++i]);
      if (!Number.isFinite(n) || n <= 0) throw new Error('--relearn-after needs a number of days');
      args.relearnAfterDays = n;
    }
    else if (a === '--out') args.out = argv[++i] ?? args.out;
    else if (a === '--model') args.model = argv[++i] ?? args.model;
    else if (a === '--fixture') args.fixture = argv[++i] ?? null;
    else if (a === '--capture') args.capture = argv[++i] ?? null;
    else if (a === '--templates') {
      args.templateIds = (argv[++i] ?? '').split(',').map((s) => s.trim()).filter(Boolean);
    } else if (a.startsWith('--')) throw new Error(`unknown flag ${a}`);
    else if (!args.job) args.job = a;
    else throw new Error(`unexpected argument ${a}`);
  }
  if (!args.job && !args.fixture) {
    throw new Error('usage: npm run draft -- <jobId | 261323 | 26-1323> [--dry-run] [--out review] [--templates id,id] [--revise "what to change"]');
  }
  if (args.revise !== null && args.reviseFile !== null) throw new Error('give the direction once: --revise or --revise-file, not both');
  return args;
}

/** A rough token count for the dry run. Photos dominate. */
export function estimateDraftTokens(e: JobEvidence, text: string): number {
  let n = Math.ceil(text.length / 4);
  for (const a of e.attachments) {
    if (a.file.type === 'application/pdf') n += Math.ceil(a.bytes.length / 60_000) * 2_500 + 500;
    else n += 1_600;
  }
  // A dry run may not have downloaded anything; count what would go.
  if (e.attachments.length === 0) {
    for (const f of e.included) n += f.type === 'application/pdf' ? Math.ceil(f.size / 60_000) * 2_500 + 500 : 1_600;
  }
  return n;
}

/** A fixture may also carry the history that was searched, the cost types and the catalog candidates, so a replay is offline. */
export interface DraftFixtureFile extends DraftFixture {
  history?: HistoryReport;
  costTypes?: ApiCostType[];
  catalog?: CatalogCandidate[];
}

/** A fixture's catalog candidates, filtered the way the live search would filter: by the terms, plus Crew Labor. */
export function fixtureCatalog(candidates: CatalogCandidate[]): CatalogSource {
  return {
    search: async (terms, excludeTemplateIds) => {
      const ts = terms.map((t) => t.toLowerCase());
      const exclude = new Set(excludeTemplateIds);
      return candidates.filter((c) =>
        !(c.templateId && exclude.has(c.templateId)) &&
        (c.name === CREW_LABOR || ts.some((t) => c.name.toLowerCase().includes(t) || (c.description ?? '').toLowerCase().includes(t))));
    },
  };
}

/** Everything a fixture needs, minus the photo bytes. */
export function toFixture(
  organizationId: string,
  evidence: JobEvidence,
  index: TemplateSummary[],
  templates: Template[],
  extra: { history?: HistoryReport; costTypes?: ApiCostType[]; catalog?: CatalogCandidate[] } = {},
): DraftFixtureFile {
  return {
    capturedAt: new Date().toISOString(),
    organizationId,
    evidence: { ...evidence, attachments: [] },
    index,
    templates,
    ...(extra.history ? { history: extra.history } : {}),
    ...(extra.costTypes ? { costTypes: extra.costTypes } : {}),
    ...(extra.catalog ? { catalog: extra.catalog } : {}),
  };
}

/** Each cost type's margin by name, for pricing what history proposes at the margin JobTread would apply. */
export function marginsOf(costTypes: ApiCostType[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const c of costTypes) if (c.margin !== null && c.margin !== undefined) out[c.name] = c.margin;
  return out;
}

async function main(): Promise<number> {
  const args = parseDraftArgs(process.argv.slice(2));
  const log = (s: string): void => { process.stderr.write(`${s}\n`); };

  let evidence: JobEvidence;
  let index: TemplateSummary[];
  let loadTemplate: (id: string) => Promise<Template>;
  let organizationId: string;
  const loaded: Template[] = [];

  let historySource: HistorySource | undefined;
  let catalogSource: CatalogSource | undefined;
  let costTypes: ApiCostType[] | undefined;
  const learned = args.history
    ? LearnedStore.load(args.learned, { relearnAfterDays: args.relearnAfterDays, ignore: args.relearn, reread: args.reread })
    : undefined;
  if (learned && (learned.entries.size || learned.files.size)) {
    log(
      `learned price book: ${learned.entries.size} term${learned.entries.size === 1 ? '' : 's'}${args.relearn ? ' (ignored this run: --relearn)' : ''}, ` +
        `${learned.files.size} past quote${learned.files.size === 1 ? '' : 's'} read${args.reread ? ' (read again this run: --reread)' : ''}, in ${args.learned}`,
    );
  }

  if (args.fixture) {
    const f = JSON.parse(readFileSync(args.fixture, 'utf8')) as DraftFixtureFile;
    evidence = f.evidence;
    index = f.index;
    organizationId = f.organizationId;
    costTypes = f.costTypes;
    if (args.history && f.history) {
      const saved = f.history;
      historySource = {
        search: async (terms) => ({ terms: saved.terms.filter((t) => terms.includes(t.term)) }),
        margins: marginsOf(f.costTypes ?? []),
        ...(learned ? { learned } : {}),
      };
    }
    if (args.catalog && f.catalog) catalogSource = fixtureCatalog(f.catalog);
    const byId = new Map(f.templates.map((t) => [t.id, t]));
    loadTemplate = async (id) => {
      const t = byId.get(id);
      if (!t) throw new Error(`template ${id} is not in the fixture (it holds ${[...byId.keys()].join(', ')})`);
      loaded.push(t);
      return t;
    };
    log(`fixture captured ${f.capturedAt}: ${evidence.jobName}, ${index.length} templates listed, ${f.templates.length} in full`);
  } else {
    const client = clientFromEnv();
    organizationId = client.organizationId;
    const job = await resolveJobId(client, args.job);
    log(`reading ${job.name} (${job.id})`);
    // A dry run and --no-photos read the file list but download nothing.
    evidence = await fetchJobEvidence(client, job.id, args.dryRun || !args.photos ? { download: null } : {});
    index = await fetchTemplateIndex(client);
    loadTemplate = async (id) => {
      log(`reading template ${id}`);
      const t = await fetchTemplate(client, id);
      loaded.push(t);
      return t;
    };
    if (args.history) {
      costTypes = await fetchCostTypes(client);
      const sinceCache = new Map<string, Promise<string | null>>();
      historySource = {
        search: async (terms) => {
          log(`searching past work for ${terms.map((t) => `"${t}"`).join(', ')}`);
          return searchHistory(client, terms, {
            excludeJobId: job.id,
            ...(args.photos ? {} : { download: null }),
            ...(learned ? { readingOf: (f) => { const r = learned.readingOf(f); return r ? { reading: r.reading, readAt: r.readAt } : null; } } : {}),
          });
        },
        margins: marginsOf(costTypes),
        ...(learned ? { learned } : {}),
        newSince: async (terms, since) => {
          const key = `${terms.join('|')}@${since}`;
          if (!sinceCache.has(key)) sinceCache.set(key, newSince(client, terms, since, job.id));
          return sinceCache.get(key)!;
        },
      };
    }
    if (args.catalog) {
      catalogSource = {
        search: async (terms, excludeTemplateIds) => {
          log(`searching the rest of the catalog for ${terms.map((t) => `"${t}"`).join(', ')}`);
          return searchCatalog(client, terms, { excludeTemplateIds });
        },
      };
    }
  }

  const text = evidenceText(evidence);
  const lines = [
    `${evidence.jobName} — ${evidence.projectType ?? 'no project type'}`,
    `  ${evidence.comments.length} comments, ${evidence.included.length} files to send` +
      (evidence.attachments.length ? ` (${evidence.attachments.length} downloaded)` : '') +
      (evidence.failed.length ? `, ${evidence.failed.length} failed` : '') +
      `, ${evidence.excluded.length} left out; ${index.length} budget templates`,
  ];
  for (const f of evidence.failed) lines.push(`  ! ${f.file.name}: ${f.reason}`);
  for (const x of evidence.excluded) lines.push(`  - ${x.file.name}: ${x.reason}`);
  const tokens = estimateDraftTokens(evidence, text + templateIndexText(index));
  const est = costOf(args.model, { input: tokens * 2, output: 12_000, cacheRead: 0, cacheWrite: 0 });
  lines.push(`  about ${tokens.toLocaleString()} input tokens a call, two calls; roughly $${(est ?? 0).toFixed(2)} on ${args.model}`);
  log(lines.join('\n'));

  mkdirSync(args.out, { recursive: true });
  const stem = join(args.out, `${evidence.jobId}-draft`);

  // A later pass: the rep's direction on top of what the last pass kept.
  let revision: Revision | undefined;
  if (args.revise !== null || args.reviseFile !== null) {
    const direction = args.revise ?? readFileSync(args.reviseFile!, 'utf8');
    if (!existsSync(`${stem}.json`)) {
      log(`nothing to revise: ${stem}.json does not exist. Run the draft once without --revise first.`);
      return 2;
    }
    const previous = previousFromJson(JSON.parse(readFileSync(`${stem}.json`, 'utf8')));
    revision = addDirection(previous, direction);
    log(`pass ${previous.pass + 1}: the rep's direction after pass ${previous.pass}, on ${previous.lines.length} kept lines and ${previous.gaps.length} flagged`);
  }

  if (args.dryRun) {
    writeFileSync(`${stem}-packet.txt`, `${text}\n\n${revision ? `${revisionText(revision)}\n\n` : ''}${templateIndexText(index)}\n`);
    log(`dry run: what the model would read is in ${stem}-packet.txt. Nothing was sent.`);
    return 0;
  }

  let anthropic;
  try {
    anthropic = anthropicFromEnv();
  } catch (err) {
    log(err instanceof Error ? err.message : String(err));
    return 2;
  }
  // Free, and it fails exactly where a paid call would: wrong workspace, bad
  // key, no credit. Nothing is sent to the model until this passes.
  const check = await preflight(anthropic, args.model);
  if (!check.ok) {
    log(check.reason);
    log('Nothing was sent and nothing was spent.');
    return 2;
  }
  if (!PRICING[args.model]) log(`no price table for ${args.model}; cost will not be shown`);

  log(`drafting with ${args.model}`);
  const draft = await draftEstimate(evidence, index, loadTemplate, anthropicStructuredCall(anthropic), {
    model: args.model,
    ...(args.templateIds.length ? { templateIds: args.templateIds } : {}),
    ...(historySource ? { history: historySource } : {}),
    ...(catalogSource ? { catalog: catalogSource } : {}),
    ...(revision ? { revision } : {}),
  });

  // Keep the pass that was revised: the rep may want to compare, and the JSON is the record.
  if (revision) {
    const n = revision.previous.pass;
    for (const ext of ['.json', '.html']) {
      if (existsSync(`${stem}${ext}`)) renameSync(`${stem}${ext}`, `${stem}-pass${n}${ext}`);
    }
    log(`pass ${n} kept as ${stem}-pass${n}.html`);
  }

  if (learned && draft.history) {
    learned.save(args.learned);
    log(`learned price book saved: ${learned.entries.size} term${learned.entries.size === 1 ? '' : 's'}, ${learned.files.size} past quote${learned.files.size === 1 ? '' : 's'} read`);
  }

  if (args.capture) {
    // The report minus the downloaded bytes: a fixture holds what was found, not the files.
    const extra = {
      ...(draft.history ? { history: { terms: draft.history.report.terms } } : {}),
      ...(costTypes ? { costTypes } : {}),
      ...(draft.catalog ? { catalog: draft.catalog.candidates } : {}),
    };
    writeFileSync(args.capture, JSON.stringify(toFixture(organizationId, evidence, index, loaded, extra), null, 2));
    log(`fixture written to ${args.capture}`);
  }

  writeFileSync(`${stem}.html`, renderDraft(evidence, draft));
  writeFileSync(`${stem}.json`, JSON.stringify(draftJson(draft), null, 2));

  if (draft.noFit) {
    log(`no template fits: ${draft.noFit}`);
  } else {
    log(
      `${draft.lines.length} lines from ${draft.plans.map((p) => p.template.name).join(' + ')}; ` +
        `${draft.gaps.length} gap${draft.gaps.length === 1 ? '' : 's'} for Carl, ` +
        `${draft.questions.length} question${draft.questions.length === 1 ? '' : 's'}` +
        (draft.rejected.length ? `, ${draft.rejected.length} line ids rejected` : '') +
        (draft.cost !== null ? ` ($${draft.cost.toFixed(2)})` : ''),
    );
    if (draft.history) {
      log(
        draft.history.skipped
          ? `history: searched ${draft.history.terms.length} term${draft.history.terms.length === 1 ? '' : 's'}; ${draft.history.skipped}`
          : `history: ${draft.history.findings} finding${draft.history.findings === 1 ? '' : 's'} from ${draft.history.terms.length} term${draft.history.terms.length === 1 ? '' : 's'}` +
            (draft.history.learned ? `, ${draft.history.learned} from the learned price book` : '') +
            (draft.totals.proposedForGaps.gaps ? `; proposes a price for ${draft.totals.proposedForGaps.gaps} gap${draft.totals.proposedForGaps.gaps === 1 ? '' : 's'}` : '') +
            (draft.history.regional ? `; regional ballpark for ${draft.history.regional} gap${draft.history.regional === 1 ? '' : 's'} (not DB pricing)` : ''),
      );
      const fr = draft.history.files;
      if (fr.read || fr.readBefore || fr.failed) {
        log(
          `past quotes: ${fr.read} read this run, ${fr.readBefore} read before` +
            (fr.failed ? `; ${fr.failed} could not be read on ${fr.failed === 1 ? 'its' : 'their'} own and went to the history whole` : ''),
        );
      }
      for (const r of draft.history.renewed) log(`searched again (new sub paper since the price book learned it): ${r.target}: ${r.what}`);
    }
    if (draft.catalog?.error) {
      log(`catalog: the search failed (${draft.catalog.error}); the ${draft.gaps.length} flagged item${draft.gaps.length === 1 ? ' was' : 's were'} not checked against it`);
    } else if (draft.catalog) {
      log(
        `catalog: ${draft.catalog.candidates.length} candidate${draft.catalog.candidates.length === 1 ? '' : 's'} for ${draft.catalog.terms.map((t) => `"${t}"`).join(', ')}; ` +
          `${draft.found.length} of ${draft.gaps.length} flagged item${draft.gaps.length === 1 ? '' : 's'} covered from other templates or the catalog`,
      );
    }
    if (draft.contingency) {
      const c = draft.contingency;
      log(`contingency: ${c.rate}% on ${formatMoney(c.base)} base cost = ${formatMoney(c.amount)} at cost${c.line ? '' : ' (no template line: add the group by hand)'}`);
    }
    for (const f of draftFlags(draft)) log(`${f.severity === 'problem' ? 'PROBLEM' : 'check'}: ${f.text}`);
    if (draft.revision) {
      log(`pass ${draft.revision.pass}, changed since pass ${draft.revision.pass - 1}:`);
      for (const c of changesText(draft.revision.changes)) log(`  - ${c}`);
    }
  }
  log(`page written to ${stem}.html; data in ${stem}.json`);
  return 0;
}

if (process.argv[1] && /draft-cli\.ts$/.test(process.argv[1])) {
  main().then(
    (code) => process.exit(code),
    (err) => {
      process.stderr.write(`${err instanceof Error ? err.message : String(err)}\n`);
      process.exit(1);
    },
  );
}
