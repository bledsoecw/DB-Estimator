/**
 * npm run build-budget -- [<job>] [--draft path] [--apply [--yes]] [--live] [--replace] [--no-notes] [--out review]
 *                         [--fixture path]
 *
 * Builds the last draft into the job's budget in JobTread: the "Build it in
 * JobTread" steps on the page, done by the code. It reads the draft JSON the
 * drafter wrote (review/<jobId>-draft.json, or --draft), reads the chosen
 * templates and the catalog items the draft prices from, and makes one
 * createCostGroup per template, in the shape Carl's budgets have (2026-10-02):
 * the scope group named for the job ("BASEMENT FINISH SCOPE") with the job's
 * description on it, the template's phases and sections in its order, each
 * customer selection in the section of its work with a contingency share in
 * each choice, and the base contingency at the end of Phase 1 - General
 * Requirements (no Phase 5). Open items are created on the job tagged
 * "(DRAFT - Carl confirms)". The job parameters the contingency formula reads
 * are set first. See draft/build.ts.
 *
 * <job> is the target: a job id, 250000 or 25-0000. Without it the draft's
 * own job is the target. The budget must be empty apart from the structural
 * groups the job template puts there; --replace takes down what this tool
 * built last time (recorded in <jobId>-built.json, see recordPaths) and nothing else.
 *
 * Without --apply it is a dry run: it reads everything, prints the plan,
 * writes it as a page (review/<jobId>-build-plan.html) and the exact
 * mutations as JSON (review/<jobId>-build-plan.json), and changes nothing.
 * It needs only the read key.
 *
 * With --apply it prints the plan and its checks, writes the page, and asks
 * "Write this to <job>? (y/n)" before it changes anything (Carl, 2026-10-02:
 * one run instead of a dry run and then an apply). Anything but y or yes,
 * or no answer at all, writes nothing. --yes skips the question.
 *
 * With --apply it needs JOBTREAD_WRITE_GRANT_KEY, writes, records what it
 * created in its record after every write, reads the budget
 * back and says whether each group is there with as many lines as planned,
 * on the terminal and on the page.
 * Only a test job (25-0000) is built unless --live is given.
 *
 * Each line's Internal Notes gets a note for the team under the catalog's own
 * note: what the line is for on this job, how the count was reached, where a
 * new line's price came from (Carl, 2026-10-02). --no-notes leaves them to
 * JobTread's copy of the catalog's note.
 *
 * --fixture replays a saved build fixture offline (test/fixtures): no
 * JobTread, no key, and --apply is refused.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createInterface } from 'node:readline';
import { dirname, join } from 'node:path';
import { clientFromEnv } from './jobtread/client.ts';
import { writerFromEnv } from './jobtread/writer.ts';
import { fetchBudget, type Reader } from './jobtread/queries.ts';
import type { ApiBudget } from './jobtread/types.ts';
import { resolveJobId } from './draft/evidence.ts';
import { fetchTemplate, type Template } from './draft/templates.ts';
import {
  attachNotes, catalogIdsOf, deleteMutation, fetchCatalogNotes, fetchJobHead, fetchLineNotes, fetchNameMaps, fetchPricedItems,
  gateBuild, groupMutation, parametersMutation, planBuild, planText, pricedIdsOf, verifyBuild, verifyNotes,
  type BuildPlan, type BuildRecord, type DraftFile, type JobHead, type NameMaps, type PricedInfo,
} from './draft/build.ts';
import { renderBuildPage } from './draft/build-render.ts';
import { resolveLearnedPath } from './draft-cli.ts';

export interface BuildArgs {
  job: string | null;
  draft: string | null;
  apply: boolean;
  live: boolean;
  replace: boolean;
  /** Write without asking. */
  yes: boolean;
  /** Build without the job notes in Internal Notes: JobTread copies the catalog's note as before. */
  noNotes: boolean;
  out: string;
  fixture: string | null;
}

export function parseBuildArgs(argv: string[]): BuildArgs {
  const args: BuildArgs = { job: null, draft: null, apply: false, live: false, replace: false, yes: false, noNotes: false, out: 'review', fixture: null };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    if (a === '--apply') args.apply = true;
    else if (a === '--live') args.live = true;
    else if (a === '--replace') args.replace = true;
    else if (a === '--yes' || a === '-y') args.yes = true;
    else if (a === '--no-notes') args.noNotes = true;
    else if (a === '--out') args.out = argv[++i] ?? args.out;
    else if (a === '--draft') args.draft = argv[++i] ?? null;
    else if (a === '--fixture') args.fixture = argv[++i] ?? null;
    else if (a.startsWith('--')) throw new Error(`unknown flag ${a}`);
    else if (args.job === null) args.job = a;
    else throw new Error(`unexpected argument ${a}`);
  }
  if (args.job === null && args.draft === null && args.fixture === null) {
    throw new Error('usage: npm run build-budget -- [<jobId | 250000 | 25-0000>] [--draft path] [--apply [--yes]] [--live] [--replace] [--no-notes] [--out review]');
  }
  if (args.fixture && args.apply) throw new Error('--fixture replays offline; it cannot --apply');
  if (args.yes && !args.apply) throw new Error('--yes only answers the question --apply asks; add --apply');
  return args;
}

/**
 * Ask on the terminal and wait for a line. Only y or yes is a yes; anything
 * else, or the input closing with no answer, is a no. Reads the line plainly
 * rather than as a terminal, because Git Bash on Windows hands node a pipe.
 */
export function askYesNo(question: string, input: NodeJS.ReadableStream = process.stdin, output: NodeJS.WritableStream = process.stderr): Promise<boolean> {
  return new Promise((resolve) => {
    const rl = createInterface({ input, terminal: false });
    let answered = false;
    output.write(question);
    rl.once('line', (line) => {
      answered = true;
      rl.close();
      resolve(/^\s*y(es)?\s*$/i.test(line));
    });
    rl.once('close', () => { if (!answered) resolve(false); });
  });
}

/** Everything one build read, frozen to disk: the plan can be made and tested with no JobTread. */
export interface BuildFixture {
  capturedAt: string;
  note?: string;
  job: JobHead;
  draft: DraftFile;
  templates: Template[];
  names: {
    units: Record<string, string>;
    costTypes: Record<string, string>;
    costCodes: Record<string, string>;
    generalDescriptionItemId: string | null;
    contingencyItemId: string | null;
    internalNotesFieldId?: string | null;
  };
  /** Keyed by the id the draft used; a template line's id maps to the item it prices from. */
  priced: Record<string, PricedInfo>;
  budget: ApiBudget;
}

export function namesFromFixture(n: BuildFixture['names']): NameMaps {
  const lower = (r: Record<string, string>): Map<string, string> => new Map(Object.entries(r).map(([k, v]) => [k.toLowerCase(), v]));
  return {
    units: lower(n.units),
    costTypes: lower(n.costTypes),
    costCodes: lower(n.costCodes),
    generalDescriptionItemId: n.generalDescriptionItemId,
    contingencyItemId: n.contingencyItemId,
    internalNotesFieldId: n.internalNotesFieldId ?? null,
  };
}

/** The file the exact mutations go to, apply or not. */
export function planFile(plan: BuildPlan, deletes: { id: string; name: string }[], existing: JobHead['parameters'], draftPath: string): unknown {
  return {
    plannedAt: new Date().toISOString(),
    job: { id: plan.jobId, name: plan.jobName },
    draft: draftPath,
    pass: plan.pass,
    counts: plan.counts,
    notes: plan.notes,
    plan: planText(plan),
    mutations: [
      ...deletes.map((d) => ({ note: `delete "${d.name}"`, ...deleteMutation(d.id) })),
      ...(plan.parameters.length ? [parametersMutation(plan.jobId, existing, plan.parameters)] : []),
      ...plan.groups.map((g) => groupMutation(plan.jobId, g)),
    ],
  };
}

/**
 * Where a build's record is written and looked for. 25-0000, 2026-10-03:
 * the laptop refused --replace on the group the work computer had built,
 * because the record was in the work computer's review/ folder. So the
 * record goes where the learned book goes, the shared OneDrive folder
 * (resolveLearnedPath), in builds/, and either computer can take down what
 * the other built. A computer without that folder keeps it in review/, and
 * a record left there by an older build is still read.
 */
export function recordPaths(
  jobId: string,
  out: string,
  env: NodeJS.ProcessEnv = process.env,
  exists: (path: string) => boolean = existsSync,
): { write: string; read: string[] } {
  const local = join(out, `${jobId}-built.json`);
  const learned = resolveLearnedPath(null, env, exists);
  if (!learned.shared) return { write: local, read: [local] };
  const shared = join(dirname(learned.path), 'builds', `${jobId}-built.json`);
  return { write: shared, read: [shared, local] };
}

/** The latest record among the places a build may have left one. */
export function readRecord(paths: string[], read: (path: string) => string | null = (p) => (existsSync(p) ? readFileSync(p, 'utf8') : null)): BuildRecord | null {
  let latest: BuildRecord | null = null;
  for (const p of paths) {
    const text = read(p);
    if (text === null) continue;
    const r = JSON.parse(text) as BuildRecord;
    if (!latest || r.builtAt > latest.builtAt) latest = r;
  }
  return latest;
}

async function main(): Promise<number> {
  const args = parseBuildArgs(process.argv.slice(2));
  const log = (s: string): void => { process.stderr.write(`${s}\n`); };

  let client: Reader | null = null;
  let job: JobHead;
  let draft: DraftFile;
  let draftPath: string;
  let templates: Map<string, Template>;
  let names: NameMaps;
  let priced: Map<string, PricedInfo>;
  let budget: ApiBudget;

  if (args.fixture) {
    const f = JSON.parse(readFileSync(args.fixture, 'utf8')) as BuildFixture;
    job = f.job;
    draft = f.draft;
    draftPath = `${args.fixture}#draft`;
    templates = new Map(f.templates.map((t) => [t.id, t]));
    names = namesFromFixture(f.names);
    priced = new Map(Object.entries(f.priced));
    budget = f.budget;
    log(`fixture captured ${f.capturedAt}: ${job.name}, draft of ${draft.job.name}, ${f.templates.length} templates`);
  } else {
    client = clientFromEnv();
    let targetId: string;
    if (args.job) {
      const r = await resolveJobId(client, args.job);
      targetId = r.id;
      draftPath = args.draft ?? join(args.out, `${targetId}-draft.json`);
    } else {
      draftPath = args.draft!;
      targetId = '';
    }
    if (!existsSync(draftPath)) {
      log(`no draft at ${draftPath}. Run the drafter first (npm run draft -- <job>), or point --draft at its JSON.`);
      return 2;
    }
    draft = JSON.parse(readFileSync(draftPath, 'utf8')) as DraftFile;
    if (!targetId) targetId = draft.job.id;
    job = await fetchJobHead(client, targetId);
    log(`building onto ${job.name} (${job.id}) from ${draftPath}`);
    budget = await fetchBudget(client, job.id);
    templates = new Map();
    for (const t of draft.templates) {
      log(`reading template ${t.name}`);
      templates.set(t.id, await fetchTemplate(client, t.id));
    }
    names = await fetchNameMaps(client);
    const ids = pricedIdsOf(draft);
    priced = ids.length ? await fetchPricedItems(client, ids) : new Map();
    if (ids.length) log(`${priced.size ? ids.filter((id) => priced.has(id)).length : 0} of ${ids.length} catalog items read for the found lines`);
  }

  mkdirSync(args.out, { recursive: true });
  const records = recordPaths(job.id, args.out);
  const recordPath = records.write;
  const record = readRecord(records.read);
  const planPath = join(args.out, `${job.id}-build-plan.json`);
  const pagePath = join(args.out, `${job.id}-build-plan.html`);
  const plannedAt = new Date().toISOString();
  const page = (plan: BuildPlan | null, applied?: { record: BuildRecord; verify: { ok: boolean; lines: string[] } }): void => {
    writeFileSync(pagePath, renderBuildPage({ job, draftPath, planPath, plannedAt, gate, plan, applied: applied ?? null, recordPath }));
  };

  const gate = gateBuild({ job, draft, budget, record, live: args.live, replace: args.replace });
  if (!gate.ok) {
    page(null);
    log(`not built: ${gate.reason}`);
    log(`page written to ${pagePath}`);
    return 2;
  }
  for (const w of gate.warnings) log(`note: ${w}`);

  const plan = planBuild(draft, templates, names, priced);
  // Each line's Internal Notes: the catalog's note as written, then what the line is for on this job.
  if (args.noNotes) {
    log('--no-notes: lines are built with the catalog\'s Internal Notes only');
  } else if (client && names.internalNotesFieldId) {
    const notes = await fetchCatalogNotes(client, catalogIdsOf(plan), names.internalNotesFieldId);
    const n = attachNotes(plan, names.internalNotesFieldId, notes);
    log(`job notes for ${n.noted} line${n.noted === 1 ? '' : 's'}, under the catalog's Internal Notes${n.left ? `; ${n.left} left to the catalog's note (its item was not read)` : ''}`);
  } else if (client) {
    log('no "Internal Notes" custom field on cost items: lines are built without job notes');
  }
  log(planText(plan));
  if (gate.deletes.length) log(`--replace takes down first: ${gate.deletes.map((d) => `"${d.name}"`).join(', ')}`);

  writeFileSync(planPath, JSON.stringify(planFile(plan, gate.deletes, job.parameters, draftPath), null, 2));
  page(plan);
  log(`page written to ${pagePath}; the mutations in ${planPath}`);

  if (!args.apply) {
    log('dry run: nothing was written. Read the page, then run again with --apply to build it.');
    return 0;
  }

  // The write key is checked before the question, so a missing key is said before anyone answers yes.
  const writer = writerFromEnv();
  if (!args.yes) {
    const problems = plan.flags.filter((f) => f.severity === 'problem').length;
    const checks = plan.flags.filter((f) => f.severity === 'check' && f.kind !== 'note').length;
    if (problems || checks) {
      log(`before you write: ${[problems ? `${problems} problem${problems === 1 ? '' : 's'}` : '', checks ? `${checks} to check` : ''].filter(Boolean).join(', ')}, listed above under CHECK BEFORE --apply and on ${pagePath}`);
    }
    const takeDown = gate.deletes.length ? `, taking down ${gate.deletes.length} group${gate.deletes.length === 1 ? '' : 's'} the last build made first` : '';
    const yes = await askYesNo(`Write this to ${job.name}${takeDown}? (y/n) `);
    if (!yes) {
      log('not written: nothing changed in JobTread. The plan is on the page.');
      return 0;
    }
  }

  const built: BuildRecord = {
    jobId: job.id, jobName: job.name, pass: plan.pass, builtAt: new Date().toISOString(),
    groups: [], parameters: plan.parameters.map((p) => p.name),
  };
  const save = (): void => {
    mkdirSync(dirname(recordPath), { recursive: true });
    writeFileSync(recordPath, JSON.stringify(built, null, 2));
  };

  for (const d of gate.deletes) {
    await writer.mutate(deleteMutation(d.id));
    log(`deleted "${d.name}" (${d.id})`);
  }
  if (gate.deletes.length) save();

  // Parameters first: the formula line may be evaluated when its group is created.
  if (plan.parameters.length) {
    await writer.mutate(parametersMutation(job.id, job.parameters, plan.parameters));
    log(`job parameters set: ${plan.parameters.map((p) => `${p.name} = ${p.value}`).join(', ')}`);
  }

  for (const g of plan.groups) {
    const r = await writer.mutate<{ createCostGroup: { createdCostGroup: { id: string; name: string; descendentCostItems: { count: number } } } }>(
      groupMutation(job.id, g),
    );
    const c = r.createCostGroup.createdCostGroup;
    built.groups.push({ id: c.id, name: c.name });
    save();
    log(`created "${c.name}" ${c.id} with ${c.descendentCostItems.count} line${c.descendentCostItems.count === 1 ? '' : 's'}`);
  }
  log(`record written to ${recordPath}`);

  const again = await fetchBudget(client!, job.id);
  const head = await fetchJobHead(client!, job.id);
  const v = verifyBuild(plan, again, head.parameters);
  if (names.internalNotesFieldId && !args.noNotes) v.lines.push(verifyNotes(plan, await fetchLineNotes(client!, job.id, names.internalNotesFieldId)));
  for (const l of v.lines) log(l);
  page(plan, { record: built, verify: v });
  log(v.ok ? `built: ${job.name}'s budget holds the draft. Open the job's Budget tab; the page is ${pagePath}.` : `NOT VERIFIED: see the lines above and ${pagePath} before touching the budget by hand.`);
  return v.ok ? 0 : 1;
}

if (process.argv[1] && /build-cli\.ts$/.test(process.argv[1])) {
  main().then(
    (code) => process.exit(code),
    (err) => {
      process.stderr.write(`${err instanceof Error ? err.message : String(err)}\n`);
      process.exit(1);
    },
  );
}
