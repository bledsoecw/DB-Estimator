/**
 * npm run build-budget -- [<job>] [--draft path] [--apply [--yes]] [--live] [--replace] [--out review]
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
 * built last time (recorded in review/<jobId>-built.json) and nothing else.
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
 * created in review/<jobId>-built.json after every write, reads the budget
 * back and says whether each group is there with as many lines as planned,
 * on the terminal and on the page.
 * Only a test job (25-0000) is built unless --live is given.
 *
 * --fixture replays a saved build fixture offline (test/fixtures): no
 * JobTread, no key, and --apply is refused.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createInterface } from 'node:readline';
import { join } from 'node:path';
import { clientFromEnv } from './jobtread/client.ts';
import { writerFromEnv } from './jobtread/writer.ts';
import { fetchBudget, type Reader } from './jobtread/queries.ts';
import type { ApiBudget } from './jobtread/types.ts';
import { resolveJobId } from './draft/evidence.ts';
import { fetchTemplate, type Template } from './draft/templates.ts';
import {
  deleteMutation, fetchJobHead, fetchNameMaps, fetchPricedItems, gateBuild, groupMutation, parametersMutation,
  planBuild, planText, pricedIdsOf, verifyBuild,
  type BuildPlan, type BuildRecord, type DraftFile, type JobHead, type NameMaps, type PricedInfo,
} from './draft/build.ts';
import { renderBuildPage } from './draft/build-render.ts';

export interface BuildArgs {
  job: string | null;
  draft: string | null;
  apply: boolean;
  live: boolean;
  replace: boolean;
  /** Write without asking. */
  yes: boolean;
  out: string;
  fixture: string | null;
}

export function parseBuildArgs(argv: string[]): BuildArgs {
  const args: BuildArgs = { job: null, draft: null, apply: false, live: false, replace: false, yes: false, out: 'review', fixture: null };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    if (a === '--apply') args.apply = true;
    else if (a === '--live') args.live = true;
    else if (a === '--replace') args.replace = true;
    else if (a === '--yes' || a === '-y') args.yes = true;
    else if (a === '--out') args.out = argv[++i] ?? args.out;
    else if (a === '--draft') args.draft = argv[++i] ?? null;
    else if (a === '--fixture') args.fixture = argv[++i] ?? null;
    else if (a.startsWith('--')) throw new Error(`unknown flag ${a}`);
    else if (args.job === null) args.job = a;
    else throw new Error(`unexpected argument ${a}`);
  }
  if (args.job === null && args.draft === null && args.fixture === null) {
    throw new Error('usage: npm run build-budget -- [<jobId | 250000 | 25-0000>] [--draft path] [--apply [--yes]] [--live] [--replace] [--out review]');
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

function readRecord(path: string): BuildRecord | null {
  if (!existsSync(path)) return null;
  return JSON.parse(readFileSync(path, 'utf8')) as BuildRecord;
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
  const recordPath = join(args.out, `${job.id}-built.json`);
  const record = readRecord(recordPath);
  const planPath = join(args.out, `${job.id}-build-plan.json`);
  const pagePath = join(args.out, `${job.id}-build-plan.html`);
  const plannedAt = new Date().toISOString();
  const page = (plan: BuildPlan | null, applied?: { record: BuildRecord; verify: { ok: boolean; lines: string[] } }): void => {
    writeFileSync(pagePath, renderBuildPage({ job, draftPath, planPath, plannedAt, gate, plan, applied: applied ?? null }));
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
  const save = (): void => { writeFileSync(recordPath, JSON.stringify(built, null, 2)); };

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
