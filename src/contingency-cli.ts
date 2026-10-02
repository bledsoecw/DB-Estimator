/**
 * npm run contingency -- [--apply] [--templates id,id] [--out review]
 *
 * Puts the contingency line into the construction budget templates: a new
 * group "Phase 5 - Contingency" after "Phase 4 - Finishes" in each template
 * that has a Phase 4, holding one line, "Project Contingency", that points
 * at the $1.00 catalog item and carries the quantity formula
 * `{Contingency Base} * {Contingency Rate} / 100`. See draft/contingency.ts.
 *
 * Without --apply it is a dry run: it reads every template, says what each
 * one needs, writes the exact mutations to review/contingency-plan.json,
 * and changes nothing. It needs only the read key.
 *
 * With --apply it needs JOBTREAD_WRITE_GRANT_KEY — a second grant, so the
 * machine that drafts cannot write by accident — creates the catalog item
 * once if it is missing, issues one createCostGroup per template that lacks
 * the group, reads each template back, and says whether the group sits
 * after Phase 4 with the line pointing at the item. A template that already
 * has the group or the line is skipped, so running it twice is safe.
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { clientFromEnv } from './jobtread/client.ts';
import { writerFromEnv } from './jobtread/writer.ts';
import { fetchTemplate, fetchTemplateIndex, type Template, type TemplateSummary } from './draft/templates.ts';
import {
  CONTINGENCY_FORMULA, CONTINGENCY_GROUP, CONTINGENCY_LINE,
  contingencyItemMutation, contingencyMutation, fetchContingencyIds, planContingency, type ContingencyPlan,
} from './draft/contingency.ts';

export interface ContingencyArgs {
  apply: boolean;
  templateIds: string[];
  out: string;
}

export function parseContingencyArgs(argv: string[]): ContingencyArgs {
  const args: ContingencyArgs = { apply: false, templateIds: [], out: 'review' };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    if (a === '--apply') args.apply = true;
    else if (a === '--out') args.out = argv[++i] ?? args.out;
    else if (a === '--templates') {
      args.templateIds = (argv[++i] ?? '').split(',').map((s) => s.trim()).filter(Boolean);
    } else throw new Error(`unknown argument ${a}; usage: npm run contingency -- [--apply] [--templates id,id] [--out review]`);
  }
  return args;
}

const PHASE_4 = /^phase\s*4\b/i;

/** The templates worth reading in full: those with a Phase 4 group, or the ones named. */
export function candidates(index: TemplateSummary[], templateIds: string[]): TemplateSummary[] {
  if (templateIds.length) {
    const byId = new Map(index.map((t) => [t.id, t]));
    return templateIds.map((id) => {
      const t = byId.get(id);
      if (!t) throw new Error(`${id} is not a budget template in this organization`);
      return t;
    });
  }
  return index.filter((t) => t.groups.some((g) => PHASE_4.test(g)));
}

export function planText(plans: ContingencyPlan[]): string {
  const out: string[] = [];
  for (const p of plans) {
    out.push(`${p.action === 'create' ? '+' : '='} ${p.templateName} (${p.templateId}): ${p.action} — ${p.reason}`);
  }
  const creates = plans.filter((p) => p.action === 'create').length;
  out.push(`${creates} template${creates === 1 ? '' : 's'} to change, ${plans.length - creates} left as they are.`);
  return out.join('\n');
}

/** After a write the template is read again: the line must end Phase 1 - General Requirements, on the item, formula intact; no contingency group. */
export function verifyContingency(t: Template, itemId: string): { ok: boolean; reason: string } {
  const phase1 = t.groups.find((g) => /^phase\s*1\b/i.test(g.name));
  if (!phase1) return { ok: false, reason: 'no Phase 1 group' };
  const group = t.groups.find((g) => /contingency/i.test(g.name));
  if (group) return { ok: false, reason: `"${group.name}" is still there: no Phase 5` };
  const line = t.lines.find((l) => l.name === CONTINGENCY_LINE);
  if (!line) return { ok: false, reason: `no "${CONTINGENCY_LINE}" line` };
  if (line.groupId !== phase1.id) return { ok: false, reason: `the line is not in "${phase1.name}"` };
  const siblings = [
    ...t.groups.filter((g) => g.parentId === phase1.id).map((g) => g.position ?? ''),
    ...t.lines.filter((l) => l.groupId === phase1.id && l.id !== line.id).map((l) => l.position ?? ''),
  ];
  if (siblings.some((pos) => pos >= (line.position ?? ''))) return { ok: false, reason: `the line is not last in "${phase1.name}"` };
  if (line.priced?.id !== itemId) return { ok: false, reason: `the line points at ${line.priced?.id ?? 'nothing'}, not the catalog item` };
  if (line.quantityFormula !== CONTINGENCY_FORMULA) return { ok: false, reason: `the formula is ${JSON.stringify(line.quantityFormula)}` };
  return { ok: true, reason: `line ${line.id} at the end of "${phase1.name}", on item ${itemId}` };
}

async function main(): Promise<number> {
  const args = parseContingencyArgs(process.argv.slice(2));
  const log = (s: string): void => { process.stderr.write(`${s}\n`); };

  const client = clientFromEnv();
  const index = await fetchTemplateIndex(client);
  const picked = candidates(index, args.templateIds);
  log(`${index.length} budget templates; reading ${picked.length} with a Phase 4 group${args.templateIds.length ? ' or named' : ''}`);
  const templates: Template[] = [];
  for (const s of picked) {
    log(`reading ${s.name}`);
    templates.push(await fetchTemplate(client, s.id));
  }
  const plans = templates.map(planContingency);
  const ids = await fetchContingencyIds(client);
  log(planText(plans));
  log(
    ids.organizationCostItemId
      ? `catalog item "${CONTINGENCY_LINE}" exists: ${ids.organizationCostItemId}`
      : `catalog item "${CONTINGENCY_LINE}" does not exist yet; --apply creates it first`,
  );

  mkdirSync(args.out, { recursive: true });
  const planPath = join(args.out, 'contingency-plan.json');
  const itemId = ids.organizationCostItemId ?? '<created by --apply>';
  writeFileSync(planPath, JSON.stringify({
    plannedAt: new Date().toISOString(),
    ids,
    plans,
    mutations: [
      ...(ids.organizationCostItemId ? [] : [contingencyItemMutation(client.organizationId, ids)]),
      ...plans.filter((p) => p.action === 'create').map((p) => contingencyMutation(p, { ...ids, organizationCostItemId: itemId })),
    ],
  }, null, 2));
  log(`plan written to ${planPath}`);

  if (!args.apply) {
    log('dry run: nothing was written. Run again with --apply to make these changes.');
    return 0;
  }

  const writer = writerFromEnv();
  let item = ids.organizationCostItemId;
  if (!item) {
    const r = await writer.mutate<{ createCostItem: { createdCostItem: { id: string } } }>(
      contingencyItemMutation(writer.organizationId, ids),
    );
    item = r.createCostItem.createdCostItem.id;
    log(`created catalog item "${CONTINGENCY_LINE}" ${item} ($1.00 cost, $1.00 price)`);
  }

  let failures = 0;
  for (const p of plans) {
    if (p.action !== 'create') continue;
    const r = await writer.mutate<{ createCostItem: { createdCostItem: { id: string } } }>(
      contingencyMutation(p, { ...ids, organizationCostItemId: item }),
    );
    log(`${p.templateName}: created "${CONTINGENCY_LINE}" ${r.createCostItem.createdCostItem.id} at the end of "${p.phase1!.name}"`);
    const again = await fetchTemplate(client, p.templateId);
    const v = verifyContingency(again, item);
    log(`${p.templateName}: ${v.ok ? 'verified' : 'NOT VERIFIED'} — ${v.reason}`);
    if (!v.ok) failures++;
  }
  return failures ? 1 : 0;
}

if (process.argv[1] && /contingency-cli\.ts$/.test(process.argv[1])) {
  main().then(
    (code) => process.exit(code),
    (err) => {
      process.stderr.write(`${err instanceof Error ? err.message : String(err)}\n`);
      process.exit(1);
    },
  );
}
