/**
 * Build the draft into the job's budget in JobTread.
 *
 * The page's "Build it in JobTread" steps, done by the code instead of the
 * rep's twenty minutes of clicking. The draft JSON (render.ts `draftJson`)
 * is the intent — which templates, which lines, what quantities, which
 * option — and JobTread is re-read for everything else: the templates'
 * group structure and each line's catalog item, unit, cost type and cost
 * code; the current price of record for every line. So a build prices the
 * way JobTread would price the template the day it is built.
 *
 * What the probes on job 25-0000 (2026-10-01) established:
 *   - one `createCostGroup` with `jobId` creates a whole tree: nested
 *     groups, selection groups (`minSelectionsRequired`,
 *     `maxSelectionsAllowed`, `showChildDeltas`) with choice groups that
 *     carry `isSelected`, and lines pointing at catalog items;
 *   - a job line needs `unitId`, `costTypeId` and `costCodeId` ("A costCodeId
 *     is required"), even with `organizationCostItemId`;
 *   - the catalog item's price is NOT copied onto a job line: `unitCost` and
 *     `unitPrice` come back null unless set. The build sets them;
 *   - a line with `quantity: null` counts as ONE unit (cost = unitCost), so
 *     a line whose count is not known yet is created at quantity 0;
 *   - `updateJob.$.parameters` takes `{name, value}` pairs only and REPLACES
 *     the job's whole list, so the existing parameters are sent back with
 *     ours; a `quantityFormula` on a job line is stored but not evaluated by
 *     the API, so the contingency line also carries its quantity in dollars.
 *
 * Shape of the result on the job (the structural CLOCK IN ITEMS, BURDEN and
 * GENERAL AND ADMINISTRATIVE groups come from the job template and are not
 * touched):
 *
 *   <template scope group>        one per chosen template, its subgroups
 *     General Description         first line of the primary's, the scope text
 *     <subgroup> › kept lines     base scope only, template order, priced
 *     <subgroup> › found lines    the catalog lines placed in their section
 *     <open items>                created lines, "(DRAFT - Carl confirms)"
 *   CUSTOMER OPTIONS              one selection group per option group
 *     <group> (min 1 / max 1)       choices as groups, first pre-selected
 *     <add-on> (min 0 / max 1)      one choice group, not selected
 *   Phase 5 - Contingency         the Project Contingency line and formula
 *
 * `planBuild`, `gateBuild` and `verifyBuild` are pure; the fetchers at the
 * bottom read JobTread; the CLI (build-cli.ts) does the writing.
 */

import { CONTINGENCY_FORMULA, CONTINGENCY_GROUP, CONTINGENCY_LINE, CONTINGENCY_PARAMETERS } from './contingency.ts';
import { STRUCTURAL_GROUPS, groupPath, orderedLines, type Template, type TemplateGroup, type TemplateLine } from './templates.ts';
import { borrowedLines, doubleCounts, openLines, sortFlags, uninstalledMaterials, unitConflictFlag, type CheckLine, type LaborUse, type MaterialUse, type ReviewFlag } from './checks.ts';
import { isTestJob, type Reader } from '../jobtread/queries.ts';
import type { ApiBudget } from '../jobtread/types.ts';

// ---- what the draft JSON says ----------------------------------------------------

/** The parts of `draftJson` the build reads. Tolerant: anything missing is treated as absent. */
export interface DraftFile {
  job: { id: string; name: string };
  summary?: string;
  noFit?: string | null;
  scopeOfWork?: string | null;
  /** What the job is, two to four words: the top group is "<SCOPETITLE> SCOPE". Absent in older drafts. */
  scopeTitle?: string | null;
  /** Where each option group's selection sits on the budget. Absent in older drafts. */
  optionPlaces?: { group: string; placeIn: { template: string; group: string; groupId: string } | null }[];
  templates: { id: string; name: string; role: string }[];
  lines: {
    lineId: string;
    name: string;
    template: string;
    quantity: number;
    unit: string | null;
    option: string | null;
    tracking?: boolean;
    basis?: string;
  }[];
  found?: {
    lineId: string;
    name: string;
    forGap: number;
    source: { kind: 'templateLine' | 'catalogItem'; pricedItemId: string };
    placeIn: { template: string; group: string; groupId: string } | null;
    quantity: number;
    unit: string | null;
    option: string | null;
    basis?: string;
  }[];
  gaps?: {
    scope: string;
    why: string;
    unit: string;
    quantity: number | null;
    costType: string;
    option: string | null;
    basis?: string;
    resolved: unknown | null;
    catalogMatch?: { lineId: string; name: string; kind: string; unit: string | null } | null;
    placeIn: { template: string; group: string; groupId: string } | null;
    proposed: { source: 'history' | 'regional'; unitCost: string; unitPrice: string | null } | null;
    regionalUnitCost: string | null;
    regionalUnitPrice: string | null;
    history?: { summary?: string; suggestionBasis?: string; regionalBasis?: string } | null;
  }[];
  contingency?: {
    rate: number;
    base: string;
    amount: string;
    parameters: Record<string, number>;
    line: unknown | null;
  } | null;
  revision?: { pass: number } | null;
}

/** "$1,234.5678" → 1234.5678. The JSON prints money the way the page does. */
export function parseMoney(s: string | null | undefined): number | null {
  if (s === null || s === undefined) return null;
  const n = Number(s.replace(/[$,\s]/g, ''));
  return Number.isFinite(n) ? n : null;
}

// ---- what JobTread says -------------------------------------------------------

export const GENERAL_DESCRIPTION = 'General Description';

/** Ids by lower-cased name for the three things every job line must carry, plus the two catalog items the build adds by name. */
export interface NameMaps {
  units: Map<string, string>;
  costTypes: Map<string, string>;
  costCodes: Map<string, string>;
  /** The $0 "General Description" catalog item the scope text goes on. */
  generalDescriptionItemId: string | null;
  /** The $1.00 "Project Contingency" catalog item. */
  contingencyItemId: string | null;
}

/** A priced catalog item as it stands today: what a found line is priced from. */
export interface PricedInfo {
  id: string;
  name: string;
  unit: string | null;
  costTypeName: string | null;
  costCodeName: string | null;
  unitCost: number | null;
  unitPrice: number | null;
  description: string | null;
}

/** A job parameter as `job.parameters` lists it: a name, and a value when one is set. */
export interface JobParameter {
  name: string;
  value?: unknown;
}

export interface JobHead {
  id: string;
  name: string;
  parameters: JobParameter[];
}

// ---- the plan ----------------------------------------------------------------------

export interface NewItem {
  _type: 'costItem';
  name: string;
  organizationCostItemId?: string;
  unitId: string | null;
  costTypeId: string | null;
  costCodeId: string;
  quantity: number | null;
  quantityFormula?: string;
  unitCost: number | null;
  unitPrice: number | null;
  description?: string | null;
  /** For the page only; `groupMutation` strips it. */
  unitName?: string | null;
  /** For the checks only: the cost type's name. */
  costTypeName?: string | null;
  /** For the checks only: the unit the draft counted in, when it is not `unitName`. */
  draftUnit?: string | null;
  /** For the checks only: the unit the catalog price is per, when it is not `unitName`. */
  pricedUnit?: string | null;
}

export interface NewGroup {
  _type: 'costGroup';
  name: string;
  description?: string | null;
  minSelectionsRequired?: number;
  maxSelectionsAllowed?: number | null;
  showChildDeltas?: boolean;
  isSelected?: boolean;
  lineItems: (NewGroup | NewItem)[];
}

export interface BuildPlan {
  jobId: string;
  jobName: string;
  pass: number;
  /** Top-level groups, in the order they are created on the job. */
  groups: NewGroup[];
  /** Job parameters to set, merged into whatever the job already has. */
  parameters: { name: string; value: number }[];
  /** The contingency quantity in dollars on the base scope, when the plan carries the line; what a verify looks for. */
  contingencyQuantity: number | null;
  /** The group the base contingency line sits in (Phase 1 - General Requirements); what a verify looks in. */
  contingencyGroup?: string | null;
  /**
   * The contingency as built: the rate, the base-scope cost it applies to,
   * and each option's share, which sits inside that option's choice group so
   * the budget's contingency follows what the customer picks.
   */
  contingency: { rate: number; base: number; amount: number; shares: ContingencyShare[] } | null;
  /** What could not be built as asked, in plain words. */
  notes: string[];
  /** What the rep must look at before --apply, problems first (checks.ts). */
  flags: ReviewFlag[];
  counts: { lines: number; found: number; created: number; options: number };
}

export interface ContingencyShare {
  group: string;
  choice: string;
  /** The choice's cost as built. */
  cost: number;
  /** contingency(base + choice) − contingency(base), so base + shares round the same as one figure. */
  amount: number;
}

export const OPTIONS_GROUP = 'CUSTOMER OPTIONS';

/** JobTread bills a null quantity as one unit. In cents, so the sums are exact. */
export function costCents(g: NewGroup): number {
  let n = 0;
  for (const li of g.lineItems) {
    if (li._type === 'costGroup') n += costCents(li);
    else if (li.unitCost !== null) n += Math.round((li.quantity ?? 1) * li.unitCost * 100);
  }
  return n;
}
export const DRAFT_TAG = '(DRAFT - Carl confirms)';

/** "Basement Finish" → "BASEMENT FINISH SCOPE"; a title that already ends in "scope" is not doubled. */
export function scopeGroupName(title: string): string {
  const t = title.trim().replace(/\s+/g, ' ').toUpperCase();
  return /\bSCOPE$/.test(t) ? t : `${t} SCOPE`;
}

/** The template's one scope group under its root (NEW HOME BUILD SCOPE), or null when it has none or several. */
export function scopeGroupOf(t: Template): TemplateGroup | null {
  const top = t.groups.filter((g) => (g.parentId ?? t.id) === t.id && !STRUCTURAL_GROUPS.has(g.name.toUpperCase()) && !/contingency/i.test(g.name));
  return top.length === 1 ? top[0]! : null;
}

/** A template's groups, ancestors first, without the template root. */
function chainOf(t: Template, groupId: string | null): TemplateGroup[] {
  const byId = new Map(t.groups.map((g) => [g.id, g]));
  const out: TemplateGroup[] = [];
  let id = groupId;
  const seen = new Set<string>();
  while (id && id !== t.id && !seen.has(id)) {
    seen.add(id);
    const g = byId.get(id);
    if (!g) break;
    out.unshift(g);
    id = g.parentId;
  }
  return out;
}

/** Every group's place in its template, depth first by position, keyed the way `groupFor` keys the job's groups. */
export function templateGroupOrder(t: Template): Map<string, number> {
  const kids = new Map<string, TemplateGroup[]>();
  for (const g of t.groups) {
    const parent = g.parentId ?? t.id;
    kids.set(parent, [...(kids.get(parent) ?? []), g]);
  }
  const byPos = (a: TemplateGroup, b: TemplateGroup): number => (a.position ?? '~').localeCompare(b.position ?? '~');
  const out = new Map<string, number>();
  const scope = scopeGroupOf(t);
  let n = 0;
  const walk = (parent: string, key: string): void => {
    for (const g of (kids.get(parent) ?? []).sort(byPos)) {
      // The scope group itself is the job's root group: its children start the keys.
      const k = g.id === scope?.id ? '' : `${key}›${g.name}`;
      if (g.id !== scope?.id) out.set(k, n++);
      walk(g.id, k);
    }
  };
  walk(t.id, '');
  return out;
}

/** The phase a template group sits in: the scope group's child on its path. Null at or above the scope group. */
function phaseOf(t: Template, groupId: string | null): string | null {
  const chain = chainOf(t, groupId);
  const scope = scopeGroupOf(t);
  const below = scope && chain[0]?.id === scope.id ? chain.slice(1) : chain;
  return below[0]?.id ?? null;
}

/** The template's "Phase 1 - General Requirements", where the base contingency line goes. */
function phaseOne(t: Template): string | null {
  const scope = scopeGroupOf(t);
  if (!scope) return null;
  return t.groups.find((g) => g.parentId === scope.id && /^phase\s*1\b/i.test(g.name))?.id ?? null;
}

/** Sub-groups in template order first, then lines and selections in the order they were added. Recursive. */
function sortByTemplate(g: NewGroup, orderOf: Map<NewGroup, number>): void {
  const keyed = g.lineItems.map((li, i) => ({ li, i, k: li._type === 'costGroup' ? orderOf.get(li) ?? Number.MAX_SAFE_INTEGER : Number.MAX_SAFE_INTEGER }));
  keyed.sort((a, b) => a.k - b.k || a.i - b.i);
  g.lineItems = keyed.map((x) => x.li);
  for (const li of g.lineItems) if (li._type === 'costGroup') sortByTemplate(li, orderOf);
}

const need = (m: Map<string, string>, what: string, name: string | null, notes: string[]): string | null => {
  if (name === null || name === '') return null;
  const id = m.get(name.toLowerCase());
  if (!id) notes.push(`no ${what} named "${name}" in the organization; the line is created without one`);
  return id ?? null;
};

/** The "Group — Choice" / bare add-on reading, same as draft.ts `parseOption`. */
function parseOption(option: string): { group: string; choice: string | null } {
  const m = /^(.*?)\s+[—–-]\s+(.*)$/.exec(option.trim());
  if (m && m[1]!.trim() && m[2]!.trim()) return { group: m[1]!.trim(), choice: m[2]!.trim() };
  return { group: option.trim(), choice: null };
}

/**
 * The plan: pure, from the draft and what was read. `templates` holds every
 * template the draft names; `priced` holds the catalog item behind every
 * found line and catalog match, keyed by the id the draft used.
 */
export function planBuild(
  draft: DraftFile,
  templates: Map<string, Template>,
  names: NameMaps,
  priced: Map<string, PricedInfo>,
): BuildPlan {
  if (draft.noFit) throw new Error(`nothing to build: the draft found no template that fits (${draft.noFit})`);
  const notes: string[] = [];
  const codeOf = (name: string | null): string => {
    const id = name ? names.costCodes.get(name.toLowerCase()) : undefined;
    if (id) return id;
    const gr = names.costCodes.get('general requirements');
    if (!gr) throw new Error('the organization has no "General Requirements" cost code; every job line needs one');
    if (name) notes.push(`no cost code named "${name}"; General Requirements used`);
    return gr;
  };

  // Every template line the draft can name, by id, and its place in the rep's order.
  const lineIndex = new Map<string, { t: Template; l: TemplateLine }>();
  const order = new Map<string, number>();
  for (const t of templates.values()) {
    orderedLines(t).forEach((l, i) => { lineIndex.set(l.id, { t, l }); order.set(l.id, i); });
  }

  // A kept template line as a job line: catalog item, quantity, today's price of record.
  const itemFrom = (t: Template, l: TemplateLine, quantity: number | null, draftUnit: string | null = null): NewItem => {
    if (!l.priced) notes.push(`"${l.name}" in ${t.name} points at no catalog item; created unpriced for the rep to price`);
    return {
      _type: 'costItem',
      name: l.name,
      ...(l.priced ? { organizationCostItemId: l.priced.id } : {}),
      unitId: need(names.units, 'unit', l.unit, notes),
      costTypeId: need(names.costTypes, 'cost type', l.costTypeName, notes),
      costTypeName: l.costTypeName,
      costCodeId: codeOf(l.costCodeName),
      quantity,
      unitCost: l.priced?.unitCost ?? null,
      unitPrice: l.priced?.unitPrice ?? null,
      description: l.description,
      unitName: l.unit,
      ...(draftUnit !== null && draftUnit !== l.unit ? { draftUnit } : {}),
      ...(l.pricedUnit ? { pricedUnit: l.pricedUnit } : {}),
    };
  };

  // ---- template scope groups, base lines in template order --------------------------
  /** One job group per template root; subgroups are created on demand along each line's path. */
  const roots = new Map<string, { group: NewGroup; subgroups: Map<string, NewGroup>; template: Template }>();
  const primaryId = draft.templates.find((t) => t.role === 'primary')?.id ?? draft.templates[0]?.id;
  /** Where each job group sits in its template's order, so phases and sections come out as the template has them. */
  const orderOf = new Map<NewGroup, number>();
  const rootFor = (t: Template): NewGroup => {
    const have = roots.get(t.id);
    if (have) return have.group;
    // A template has one scope group under its root (NEW HOME BUILD SCOPE, FINISHES); it becomes the job's group.
    // Carl, 2026-10-02: the main one is named for the job ("NEW POOL HOUSE SCOPE") and carries the job's description.
    const scope = scopeGroupOf(t);
    const primary = t.id === primaryId;
    const name = primary && draft.scopeTitle?.trim() ? scopeGroupName(draft.scopeTitle) : scope ? scope.name : t.name;
    const description = primary && draft.scopeOfWork?.trim() ? draft.scopeOfWork.trim() : t.description;
    const group: NewGroup = { _type: 'costGroup', name, description, lineItems: [] };
    roots.set(t.id, { group, subgroups: new Map(), template: t });
    return group;
  };
  const rank = new Map<string, Map<string, number>>(); // template id -> group path key -> order
  const rankOf = (t: Template): Map<string, number> => {
    let r = rank.get(t.id);
    if (!r) { r = templateGroupOrder(t); rank.set(t.id, r); }
    return r;
  };
  /** The job group for a template group id, creating the path of groups below the scope group. */
  const groupFor = (t: Template, groupId: string | null): NewGroup => {
    const root = rootFor(t);
    const entry = roots.get(t.id)!;
    const path = groupPath(t, groupId);
    // The first name on the path is the scope group itself when the template has one; skip it.
    // (The job's group may be renamed for the job, so compare with the template's own name.)
    const scope = scopeGroupOf(t);
    const steps = path.length && scope && scope.name === path[0] ? path.slice(1) : path;
    let cur = root;
    let key = '';
    for (const name of steps) {
      key = `${key}›${name}`;
      let sub = entry.subgroups.get(key);
      if (!sub) {
        sub = { _type: 'costGroup', name, lineItems: [] };
        entry.subgroups.set(key, sub);
        cur.lineItems.push(sub);
        orderOf.set(sub, rankOf(t).get(key) ?? Number.MAX_SAFE_INTEGER);
      }
      cur = sub;
    }
    return cur;
  };

  for (const td of draft.templates) {
    const t = templates.get(td.id);
    if (!t) { notes.push(`template ${td.name} (${td.id}) was not read; its lines are skipped`); continue; }
    rootFor(t);
  }

  // Options: lines with an option go into choice groups, not their template group.
  const optionGroups = new Map<string, { choices: Map<string, NewGroup>; home: { t: Template; groupId: string | null } | null }>();
  const choiceFor = (option: string, home: { t: Template; groupId: string | null } | null = null): NewGroup => {
    const { group, choice } = parseOption(option);
    let og = optionGroups.get(group);
    if (!og) { og = { choices: new Map(), home: null }; optionGroups.set(group, og); }
    if (!og.home && home) og.home = home;
    const name = choice ?? group;
    let cg = og.choices.get(name);
    if (!cg) { cg = { _type: 'costGroup', name, lineItems: [] }; og.choices.set(name, cg); }
    return cg;
  };

  /** The template and section a found line or open item was placed in, for where its selection goes. */
  const homeOf = (placeIn: { groupId: string } | null): { t: Template; groupId: string | null } | null => {
    if (!placeIn) return null;
    for (const t of templates.values()) if (t.groups.some((g) => g.id === placeIn.groupId)) return { t, groupId: placeIn.groupId };
    return null;
  };

  // Found lines also appear in `lines`; they are built from `found`, with their section and price.
  const foundIds = new Set((draft.found ?? []).map((f) => f.lineId));
  let lines = 0;
  const kept = [...draft.lines]
    .filter((d) => !foundIds.has(d.lineId))
    .sort((a, b) => (order.get(a.lineId) ?? 1e9) - (order.get(b.lineId) ?? 1e9) || a.lineId.localeCompare(b.lineId));
  for (const d of kept) {
    const hit = lineIndex.get(d.lineId);
    if (!hit) {
      notes.push(`line ${d.lineId} "${d.name}" is in no template that was read; skipped`);
      continue;
    }
    const item = itemFrom(hit.t, hit.l, d.quantity, d.unit);
    const dest = d.option ? choiceFor(d.option, { t: hit.t, groupId: hit.l.groupId }) : groupFor(hit.t, hit.l.groupId);
    dest.lineItems.push(item);
    lines++;
  }

  // The scope text is the description of the job's scope group (rootFor), as Carl's budgets carry it.

  // ---- found lines: into their section, priced from the catalog item -------------------
  let found = 0;
  for (const f of draft.found ?? []) {
    const p = priced.get(f.source.pricedItemId) ?? priced.get(f.lineId);
    if (!p) { notes.push(`found line "${f.name}" (item ${f.source.pricedItemId}) was not read; skipped`); continue; }
    const item: NewItem = {
      _type: 'costItem',
      name: p.name,
      organizationCostItemId: p.id,
      unitId: need(names.units, 'unit', p.unit, notes),
      costTypeId: need(names.costTypes, 'cost type', p.costTypeName, notes),
      costTypeName: p.costTypeName,
      costCodeId: codeOf(p.costCodeName),
      quantity: f.quantity,
      unitCost: p.unitCost,
      unitPrice: p.unitPrice,
      description: p.description,
      unitName: p.unit,
      ...(f.unit !== null && p.unit !== null && f.unit !== p.unit ? { draftUnit: f.unit } : {}),
    };
    const dest = f.option ? choiceFor(f.option, homeOf(f.placeIn)) : placeFor(f.placeIn, templates, groupFor, rootFor, primaryId, notes, `found line "${p.name}"`);
    dest.lineItems.push(item);
    found++;
  }

  // ---- open items: created on the job, tagged, priced from the ballpark or history ---------
  let created = 0;
  for (const g of draft.gaps ?? []) {
    if (g.resolved) continue;
    const dest = g.option ? choiceFor(g.option, homeOf(g.placeIn)) : placeFor(g.placeIn, templates, groupFor, rootFor, primaryId, notes, `open item "${g.scope}"`);
    if (g.catalogMatch) {
      const p = priced.get(g.catalogMatch.lineId) ?? [...priced.values()].find((x) => x.name === g.catalogMatch!.name);
      if (p) {
        // A null quantity would count as one unit; zero keeps the line visible and the total honest.
        dest.lineItems.push({
          _type: 'costItem',
          name: `${p.name} ${DRAFT_TAG}`,
          organizationCostItemId: p.id,
          unitId: need(names.units, 'unit', p.unit, notes),
          costTypeId: need(names.costTypes, 'cost type', p.costTypeName, notes),
          costTypeName: p.costTypeName,
          costCodeId: codeOf(p.costCodeName),
          quantity: 0,
          unitCost: p.unitCost,
          unitPrice: p.unitPrice,
          description: `For: ${g.scope}. ${g.why} The count is not known yet, so the quantity is 0 until the rep sets it.`,
          unitName: p.unit,
        });
        created++;
        continue;
      }
      notes.push(`catalog match "${g.catalogMatch.name}" for "${g.scope}" was not read; the item is created from the gap instead`);
    }
    const unitCost = g.proposed ? parseMoney(g.proposed.unitCost) : parseMoney(g.regionalUnitCost);
    const unitPrice = g.proposed ? parseMoney(g.proposed.unitPrice) : parseMoney(g.regionalUnitPrice);
    const priceNote = g.proposed?.source === 'history'
      ? `Priced from DB history: ${g.history?.suggestionBasis ?? ''}`.trim()
      : unitCost !== null
        ? `Priced from a regional ballpark, NOT DB pricing — confirm with Carl or a sub bid before the estimate goes out. ${g.history?.regionalBasis ?? ''}`.trim()
        : 'No price yet — Carl sets it.';
    const countNote = g.quantity === null ? ' The count is not known yet, so the quantity is 0 until the rep sets it.' : '';
    dest.lineItems.push({
      _type: 'costItem',
      name: `${g.scope} ${DRAFT_TAG}`,
      unitId: need(names.units, 'unit', g.unit, notes),
      costTypeId: need(names.costTypes, 'cost type', g.costType, notes),
      costTypeName: g.costType,
      costCodeId: codeOf('General Requirements'),
      quantity: g.quantity ?? 0,
      unitCost,
      unitPrice,
      description: `${g.why} ${g.basis ? `Basis: ${g.basis} ` : ''}${priceNote}${countNote}`.trim(),
      unitName: g.unit,
    });
    created++;
  }

  // ---- selection groups, each in the section of its work -----------------------------
  // Carl, 2026-10-02: no CUSTOMER OPTIONS group; a selection sits in the phase and section
  // where its work is, as the draft named it, else in the phase of its first line.
  // Two or more choices means one is required; one means an add-on.
  let options = 0;
  const selections: NewGroup[] = [];
  for (const [group, og] of optionGroups) {
    const choices = [...og.choices.values()];
    const required = choices.length >= 2;
    choices.forEach((c, i) => { c.isSelected = required && i === 0; });
    const sel: NewGroup = {
      _type: 'costGroup',
      name: group,
      description: required ? 'One choice required.' : 'Optional add-on; the customer may decline it.',
      minSelectionsRequired: required ? 1 : 0,
      maxSelectionsAllowed: 1,
      showChildDeltas: true,
      lineItems: choices,
    };
    const named = (draft.optionPlaces ?? []).find((p) => p.group.trim().toLowerCase() === group.toLowerCase())?.placeIn ?? null;
    let section: NewGroup;
    if (named) section = placeFor(named, templates, groupFor, rootFor, primaryId, notes, `the "${group}" selection`);
    else if (og.home) {
      const phase = phaseOf(og.home.t, og.home.groupId);
      section = phase ? groupFor(og.home.t, phase) : rootFor(og.home.t);
    } else section = placeFor(null, templates, groupFor, rootFor, primaryId, notes, `the "${group}" selection`);
    section.lineItems.push(sel);
    selections.push(sel);
    options++;
  }

  // ---- the top-level groups, in order ------------------------------------------------
  const groups: NewGroup[] = [];
  // Primary first, then the others in the draft's order.
  const ordered = [...draft.templates].sort((a, b) => Number(b.role === 'primary') - Number(a.role === 'primary'));
  for (const td of ordered) {
    const r = roots.get(td.id);
    if (r && (r.group.lineItems.length > 0)) groups.push(r.group);
  }
  for (const r of roots.values()) if (!groups.includes(r.group) && r.group.lineItems.length > 0) groups.push(r.group);

  // Contingency. The base is the base-scope cost AS BUILT (the template groups, the found lines and the
  // created lines, not the selections), so the figure matches the budget JobTread shows, and each option
  // carries its own share inside its choice group, so the budget's contingency follows what the customer
  // picks. The base line sits at the end of Phase 1 - General Requirements: Carl, 2026-10-02, no Phase 5.
  // The API stores the formula without evaluating it, so the quantity goes too.
  const parameters: { name: string; value: number }[] = [];
  let contingencyQuantity: number | null = null;
  let contingencyGroup: string | null = null;
  let contingency: BuildPlan['contingency'] = null;
  if (draft.contingency) {
    const rate = draft.contingency.rate;
    if (names.contingencyItemId) {
      const baseCents = groups.reduce((n, g) => n + costCents(g), 0) - selections.reduce((n, g) => n + costCents(g), 0);
      const amountCents = Math.round((baseCents * rate) / 100);
      const line = (quantity: number, description: string, formula?: string): NewItem => ({
        _type: 'costItem',
        name: CONTINGENCY_LINE,
        organizationCostItemId: names.contingencyItemId!,
        unitId: names.units.get('lump sum') ?? null,
        costTypeId: names.costTypes.get('other') ?? null,
        costCodeId: codeOf('General Requirements'),
        quantity,
        ...(formula ? { quantityFormula: formula } : {}),
        unitCost: 1,
        unitPrice: 1,
        description,
        unitName: 'Lump Sum',
      });
      const shares: ContingencyShare[] = [];
      for (const og of selections) {
        for (const choice of og.lineItems) {
          if (choice._type !== 'costGroup') continue;
          const choiceCents = costCents(choice);
          const shareCents = Math.round(((baseCents + choiceCents) * rate) / 100) - amountCents;
          if (shareCents <= 0) continue;
          choice.lineItems.push(line(
            shareCents / 100,
            `Contingency at ${rate}% on this option, at cost. It comes with the option when the customer takes it; unused contingency is credited at closeout.`,
          ));
          shares.push({ group: og.name, choice: choice.name, cost: choiceCents / 100, amount: shareCents / 100 });
        }
      }
      contingencyQuantity = amountCents / 100;
      contingency = { rate, base: baseCents / 100, amount: contingencyQuantity, shares };
      const primary = primaryId ? templates.get(primaryId) : undefined;
      const phase1 = primary ? phaseOne(primary) : null;
      const home = primary ? (phase1 ? groupFor(primary, phase1) : rootFor(primary)) : groups[0];
      if (!home) throw new Error('nothing to put the contingency line in: the plan has no group');
      if (!groups.includes(home) && primary && !groups.includes(rootFor(primary))) groups.unshift(rootFor(primary));
      contingencyGroup = home.name;
      home.lineItems.push(line(
        contingencyQuantity,
        `Contingency at ${rate}% on the base scope, at cost; unused contingency is credited at closeout. ${CONTINGENCY_PARAMETERS.base} is the base-scope cost as built${shares.length ? '; each option carries its own share inside its choice, so the total follows what the customer picks' : ''}.`,
        CONTINGENCY_FORMULA,
      ));
      parameters.push({ name: CONTINGENCY_PARAMETERS.rate, value: rate }, { name: CONTINGENCY_PARAMETERS.base, value: baseCents / 100 });
    } else {
      notes.push(`no "${CONTINGENCY_LINE}" catalog item; contingency was not built`);
    }
  }

  // Phases and sections in the template's order, whatever order lines arrived in; lines and selections after.
  for (const g of groups) sortByTemplate(g, orderOf);

  return {
    jobId: draft.job.id,
    jobName: draft.job.name,
    pass: draft.revision?.pass ?? 1,
    groups,
    parameters,
    contingencyQuantity,
    contingencyGroup,
    contingency,
    notes,
    flags: reviewPlan(groups, contingency, notes, installFlags(draft, lineIndex, priced)),
    counts: { lines, found, created, options },
  };
}

const LABOR_TYPE = /^(labor|subcontractor)$/i;

/** A kept material with no labor to install it in its choice: the same check as the draft page (checks.ts). */
export function installFlags(
  draft: DraftFile,
  lineIndex: Map<string, { t: Template; l: TemplateLine }>,
  priced: Map<string, PricedInfo>,
): ReviewFlag[] {
  const scopeOf = (option: string | null): string => option?.trim() || 'base';
  const foundIds = new Set((draft.found ?? []).map((f) => f.lineId));
  const materials: MaterialUse[] = [];
  const labor: LaborUse[] = [];
  for (const d of draft.lines) {
    if (foundIds.has(d.lineId)) continue;
    const hit = lineIndex.get(d.lineId);
    if (!hit) continue;
    if (LABOR_TYPE.test(hit.l.costTypeName)) { labor.push({ scope: scopeOf(d.option), name: d.name }); continue; }
    if (d.tracking || !/^materials$/i.test(hit.l.costTypeName)) continue;
    const sectionLabor = hit.t.lines
      .filter((x) => x.groupId === hit.l.groupId && LABOR_TYPE.test(x.costTypeName))
      .map((x) => x.name);
    materials.push({ scope: scopeOf(d.option), name: d.name, quantity: d.quantity, unit: d.unit, sectionLabor });
  }
  for (const f of draft.found ?? []) {
    const type = priced.get(f.source.pricedItemId)?.costTypeName ?? '';
    if (!LABOR_TYPE.test(type)) continue;
    const gap = draft.gaps?.[f.forGap];
    labor.push({ scope: scopeOf(f.option), name: f.name, ...(gap ? { for: gap.scope } : {}) });
  }
  for (const g of draft.gaps ?? []) {
    if (g.resolved || !LABOR_TYPE.test(g.costType)) continue;
    labor.push({ scope: scopeOf(g.option), name: g.scope, for: g.scope });
  }
  return uninstalledMaterials(materials, labor);
}

/** Every line of the plan with the path of groups it sits in, and whether it is inside a customer selection. */
export function planLines(groups: NewGroup[]): { where: string; item: NewItem; inOption: boolean }[] {
  const out: { where: string; item: NewItem; inOption: boolean }[] = [];
  const walk = (g: NewGroup, path: string[], inOption: boolean): void => {
    const here = [...path, g.name];
    const inside = inOption || g.minSelectionsRequired !== undefined;
    for (const li of g.lineItems) {
      if (li._type === 'costGroup') walk(li, here, inside);
      else out.push({ where: here.join(' › '), item: li, inOption: inside });
    }
  };
  for (const g of groups) walk(g, [], false);
  return out;
}

/** Every selection group in the plan, wherever it sits. */
export function selectionGroups(groups: NewGroup[]): NewGroup[] {
  const out: NewGroup[] = [];
  const walk = (g: NewGroup): void => {
    if (g.minSelectionsRequired !== undefined) { out.push(g); return; }
    for (const li of g.lineItems) if (li._type === 'costGroup') walk(li);
  };
  for (const g of groups) walk(g);
  return out;
}

const dollars = (n: number): string => `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/** The checks on a plan: double counts, units, open lines, the plan's notes, and what the contingency comes to. */
export function reviewPlan(groups: NewGroup[], contingency: BuildPlan['contingency'], notes: string[], extra: ReviewFlag[] = []): ReviewFlag[] {
  const all = planLines(groups);
  const lines: CheckLine[] = all.map(({ where, item, inOption }) => ({
    where,
    inOption,
    name: item.name,
    costType: costTypeOf(item),
    quantity: item.quantity,
    unit: item.unitName ?? null,
    cost: item.unitCost === null ? null : Math.round((item.quantity ?? 1) * item.unitCost * 100) / 100,
    tracking: item.unitCost === 0 && (item.unitPrice === 0 || item.unitPrice === null) && item.organizationCostItemId !== undefined,
  }));
  const flags: ReviewFlag[] = [
    ...doubleCounts(lines),
    ...openLines(lines.filter((l) => l.name !== CONTINGENCY_LINE)),
    ...borrowedLines(lines),
  ];
  for (const { where, item } of all) {
    if (item.draftUnit && item.unitName) {
      const q = item.quantity ?? 0;
      flags.push({
        severity: 'problem', kind: 'unit', lines: [{ where, name: item.name }],
        text: `${where}: the draft counted "${item.name}" as ${q} ${item.draftUnit}, but the line is now in ${item.unitName}. Built as it is, that is ${q} ${item.unitName}${item.unitCost === null ? '' : ` = ${dollars(q * item.unitCost)}`}. Draft it again, or set the quantity in ${item.unitName} on the job.`,
      });
    }
    if (item.pricedUnit) flags.push(unitConflictFlag(where, item.name, item.unitName ?? null, item.pricedUnit, item.quantity, item.unitCost));
  }
  for (const n of notes) flags.push({ severity: 'check', kind: 'note', text: n, lines: [] });
  flags.push(...extra);
  if (contingency) {
    const picked = selectionGroups(groups).flatMap((og) =>
      og.lineItems.filter((c): c is NewGroup => c._type === 'costGroup' && c.isSelected === true).map((c) => ({ og: og.name, c })));
    const pickedCost = picked.reduce((n, p) => n + costCents(p.c), 0) / 100;
    const pickedShares = picked.reduce((n, p) => n + (contingency.shares.find((s) => s.group === p.og && s.choice === p.c.name)?.amount ?? 0), 0);
    const baseCost = contingency.base;
    // The shares sit inside the choices, so the picked cost already holds them; the scope under contingency is without them.
    const scope = baseCost + pickedCost - pickedShares;
    flags.push({
      severity: 'info', kind: 'contingency', lines: [],
      text: `Contingency ${contingency.rate}%: ${dollars(contingency.amount)} on the ${dollars(baseCost)} base scope` +
        (picked.length
          ? `; with the pre-selected choices (${picked.map((p) => p.c.name).join(', ')}) the budget carries ${dollars(contingency.amount + pickedShares)} on ${dollars(scope)} of work.`
          : '.') +
        (contingency.shares.length ? ' Each option carries its own share, so the total follows what the customer picks.' : ''),
    });
  }
  return sortFlags(flags);
}

/** The cost type's name back from its id, for the checks: only the three that matter are told apart. */
function costTypeOf(item: NewItem): string | null {
  return item.costTypeName ?? null;
}

/** Where a found or created line goes: the section the model named, else the primary template's group. */
function placeFor(
  placeIn: { template: string; groupId: string } | null,
  templates: Map<string, Template>,
  groupFor: (t: Template, groupId: string | null) => NewGroup,
  rootFor: (t: Template) => NewGroup,
  primaryId: string | undefined,
  notes: string[],
  what: string,
): NewGroup {
  if (placeIn) {
    for (const t of templates.values()) {
      if (t.groups.some((g) => g.id === placeIn.groupId)) return groupFor(t, placeIn.groupId);
    }
    notes.push(`${what}: section ${placeIn.groupId} (${placeIn.template}) is in no template that was read; put in the main template's group`);
  }
  const primary = primaryId ? templates.get(primaryId) : undefined;
  if (primary) return rootFor(primary);
  const first = [...templates.values()][0];
  if (!first) throw new Error(`${what}: no template to put it in`);
  return rootFor(first);
}

/** How many lines a group holds, all the way down. */
export function countItems(g: NewGroup): number {
  let n = 0;
  for (const li of g.lineItems) n += li._type === 'costGroup' ? countItems(li) : 1;
  return n;
}

/** The plan as the rep would read it: the tree with quantities and prices. */
export function planText(plan: BuildPlan): string {
  const out: string[] = [];
  out.push(`Build pass ${plan.pass} of ${plan.jobName} into its budget: ${plan.groups.length} top-level group${plan.groups.length === 1 ? '' : 's'}, ` +
    `${plan.counts.lines} template line${plan.counts.lines === 1 ? '' : 's'}, ${plan.counts.found} from the catalog, ${plan.counts.created} created, ${plan.counts.options} option group${plan.counts.options === 1 ? '' : 's'}.`);
  const walk = (g: NewGroup, depth: number): void => {
    const sel = g.minSelectionsRequired !== undefined ? ` [select: min ${g.minSelectionsRequired}, max ${g.maxSelectionsAllowed ?? 'any'}]` : g.isSelected ? ' [selected]' : '';
    out.push(`${'  '.repeat(depth)}${g.name}${sel}`);
    for (const li of g.lineItems) {
      if (li._type === 'costGroup') walk(li, depth + 1);
      else {
        const q = li.quantityFormula ? `${li.quantity ?? '—'} = ${li.quantityFormula}` : li.quantity === null ? 'qty —' : `${li.quantity}`;
        // Prices of record are to four places; a catalog figure like 5 × 1.45 prints as 7.25, not 7.249999999999999.
        const four = (n: number): string => String(Number(n.toFixed(4)));
        const price = li.unitCost === null ? 'unpriced' : `$${four(li.unitCost)} / $${li.unitPrice === null ? '—' : four(li.unitPrice)}`;
        out.push(`${'  '.repeat(depth + 1)}- ${li.name}: ${q} · ${price}${li.organizationCostItemId ? '' : ' · no catalog item'}`);
      }
    }
  };
  for (const g of plan.groups) walk(g, 0);
  if (plan.contingency) {
    const c = plan.contingency;
    out.push(`Contingency ${c.rate}%: $${c.amount.toFixed(2)} on the $${c.base.toFixed(2)} base scope` +
      (c.shares.length ? `; inside each option: ${c.shares.map((s) => `${s.group} — ${s.choice} +$${s.amount.toFixed(2)}`).join(', ')}` : ''));
  }
  if (plan.parameters.length) out.push(`Job parameters: ${plan.parameters.map((p) => `${p.name} = ${p.value}`).join(', ')}`);
  const shown = plan.flags.filter((f) => f.kind !== 'note' && f.kind !== 'contingency');
  if (shown.length) {
    out.push('');
    out.push(`CHECK BEFORE --apply (${shown.filter((f) => f.severity === 'problem').length} problems, ${shown.filter((f) => f.severity === 'check').length} to check):`);
    shown.forEach((f, i) => out.push(`  ${i + 1}. ${f.severity === 'problem' ? 'PROBLEM' : 'check'}: ${f.text}`));
  }
  for (const n of plan.notes) out.push(`note: ${n}`);
  return out.join('\n');
}

// ---- the gate --------------------------------------------------------------------

/** What was built, kept beside the draft so a rebuild can take it down first. */
export interface BuildRecord {
  jobId: string;
  jobName: string;
  pass: number;
  builtAt: string;
  /** Top-level groups this tool created, in order; `--replace` deletes exactly these. */
  groups: { id: string; name: string }[];
  parameters: string[];
}

export interface GateInput {
  job: { id: string; name: string };
  draft: DraftFile;
  budget: ApiBudget;
  /** The last build's record for this job, if the tool built it. */
  record: BuildRecord | null;
  live: boolean;
  replace: boolean;
}

export type Gate =
  | { ok: true; deletes: { id: string; name: string }[]; warnings: string[] }
  | { ok: false; reason: string };

/**
 * Whether this job may be built: a test job unless --live; the draft's own
 * job unless the target is a test job; and an empty budget apart from the
 * structural groups, unless --replace and everything on it is ours.
 */
export function gateBuild(g: GateInput): Gate {
  const test = isTestJob(g.job.name);
  if (!test && !g.live) {
    return { ok: false, reason: `${g.job.name} is not a test job. Build on a test job (25-0000) first; add --live to build a real job's budget.` };
  }
  if (g.draft.job.id !== g.job.id && !test) {
    return { ok: false, reason: `the draft is of ${g.draft.job.name} (${g.draft.job.id}), not ${g.job.name}. Another job's draft goes only on a test job.` };
  }
  const warnings: string[] = [];
  if (g.draft.job.id !== g.job.id) warnings.push(`building ${g.draft.job.name}'s draft onto the test job ${g.job.name}`);
  const scope = g.budget.costGroups.nodes.filter((x) => x.parentCostGroup === null && !STRUCTURAL_GROUPS.has(x.name.toUpperCase()));
  if (scope.length === 0) return { ok: true, deletes: [], warnings };
  const names = scope.map((x) => `"${x.name}"`).join(', ');
  if (!g.replace) {
    return { ok: false, reason: `the budget already has scope on it: ${names}. Clear it in JobTread, or add --replace to take down what this tool built last time (${g.record ? `${g.record.groups.length} groups, ${g.record.builtAt}` : 'no record of a build here'}).` };
  }
  const ours = new Set((g.record?.groups ?? []).map((x) => x.id));
  const foreign = scope.filter((x) => !ours.has(x.id));
  if (foreign.length) {
    return { ok: false, reason: `--replace deletes only what this tool built, and ${foreign.map((x) => `"${x.name}"`).join(', ')} ${foreign.length === 1 ? 'is' : 'are'} not in its record. Clear ${foreign.length === 1 ? 'it' : 'them'} in JobTread first.` };
  }
  return { ok: true, deletes: scope.map((x) => ({ id: x.id, name: x.name })), warnings };
}

// ---- the mutations -------------------------------------------------------------------

/** The exact `createCostGroup` for one top-level group of the plan. */
export function groupMutation(jobId: string, group: NewGroup): Record<string, unknown> {
  // The discriminator is for nested line items; the root of the mutation is a cost group by definition.
  const { _type, ...root } = stripUndefined(forWire(group)) as NewGroup;
  void _type;
  return {
    createCostGroup: {
      $: { jobId, ...root },
      createdCostGroup: { id: {}, name: {}, descendentCostItems: { $: { size: 100 }, count: {} } },
    },
  };
}

/**
 * The `updateJob` that sets the parameters. JobTread takes `{name, value}`
 * pairs only (a `_type` is refused: "no value is ever expected there") and
 * the list REPLACES the job's (verified: sending one parameter dropped the
 * other), so the existing ones are sent back, ours replacing same-named entries.
 */
export function parametersMutation(
  jobId: string,
  existing: JobParameter[] | null,
  ours: { name: string; value: number }[],
): Record<string, unknown> {
  const merged: { name: string; value: unknown }[] = [];
  const names = new Set(ours.map((p) => p.name));
  for (const p of existing ?? []) if (!names.has(p.name)) merged.push({ name: p.name, value: p.value ?? null });
  for (const p of ours) merged.push({ name: p.name, value: p.value });
  return { updateJob: { $: { id: jobId, parameters: merged } } };
}

/** Take down one top-level group this tool built, and everything under it. */
export function deleteMutation(groupId: string): Record<string, unknown> {
  return { deleteCostGroup: { $: { id: groupId } } };
}

/** The plan without its page-only fields: what goes on the wire. */
function forWire(g: NewGroup): NewGroup {
  return {
    ...g,
    lineItems: g.lineItems.map((li) => {
      if (li._type === 'costGroup') return forWire(li);
      const { unitName, draftUnit, pricedUnit, costTypeName, ...item } = li;
      void unitName; void draftUnit; void pricedUnit; void costTypeName;
      return item;
    }),
  };
}

function stripUndefined(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(stripUndefined);
  if (v && typeof v === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, x] of Object.entries(v as Record<string, unknown>)) if (x !== undefined) out[k] = stripUndefined(x);
    return out;
  }
  return v;
}

// ---- verifying ------------------------------------------------------------------------

/**
 * After the writes the budget is read again: each top-level group of the plan
 * must be on the job with as many lines under it as the plan holds, and the
 * contingency line must carry its quantity.
 */
export function verifyBuild(plan: BuildPlan, budget: ApiBudget, parameters: JobParameter[]): { ok: boolean; lines: string[] } {
  const lines: string[] = [];
  let ok = true;
  const parent = new Map(budget.costGroups.nodes.map((g) => [g.id, g.parentCostGroup?.id ?? null]));
  const rootOf = (groupId: string | null): string | null => {
    let id = groupId;
    const seen = new Set<string>();
    while (id && !seen.has(id)) {
      seen.add(id);
      const p = parent.get(id);
      if (p === undefined) return null;
      if (p === null) return id;
      id = p;
    }
    return null;
  };
  const perRoot = new Map<string, number>();
  for (const it of budget.costItems.nodes) {
    const r = rootOf(it.costGroup?.id ?? null);
    if (r) perRoot.set(r, (perRoot.get(r) ?? 0) + 1);
  }
  const tops = budget.costGroups.nodes.filter((g) => g.parentCostGroup === null);
  for (const g of plan.groups) {
    const want = countItems(g);
    const hits = tops.filter((t) => t.name === g.name);
    if (hits.length === 0) { ok = false; lines.push(`MISSING: "${g.name}" is not on the budget`); continue; }
    const have = hits.map((t) => perRoot.get(t.id) ?? 0);
    const match = have.find((n) => n === want);
    if (match === undefined) { ok = false; lines.push(`MISMATCH: "${g.name}" holds ${have.join('/')} lines, the plan ${want}`); }
    else lines.push(`ok: "${g.name}" with ${want} line${want === 1 ? '' : 's'}`);
  }
  if (plan.contingencyQuantity !== null) {
    const all = budget.costItems.nodes.filter((it) => it.name === CONTINGENCY_LINE);
    const holder = plan.contingencyGroup ?? CONTINGENCY_GROUP;
    const line = all.find((it) => it.costGroup?.name === holder);
    if (!line) { ok = false; lines.push(`MISSING: the "${CONTINGENCY_LINE}" line in "${holder}"`); }
    else if (line.quantity !== plan.contingencyQuantity) { ok = false; lines.push(`MISMATCH: "${CONTINGENCY_LINE}" quantity is ${line.quantity}, the plan ${plan.contingencyQuantity}`); }
    else lines.push(`ok: "${CONTINGENCY_LINE}" at ${line.quantity} on the base scope (cost $${line.cost})`);
    const shares = plan.contingency?.shares ?? [];
    const found = all.filter((it) => it !== line);
    const want = shares.reduce((n, s) => n + Math.round(s.amount * 100), 0);
    const have = found.reduce((n, it) => n + Math.round((it.quantity ?? 0) * 100), 0);
    if (shares.length || found.length) {
      if (found.length !== shares.length || have !== want) { ok = false; lines.push(`MISMATCH: ${found.length} option share${found.length === 1 ? '' : 's'} of $${(have / 100).toFixed(2)} on the budget, the plan ${shares.length} of $${(want / 100).toFixed(2)}`); }
      else lines.push(`ok: ${shares.length} option share${shares.length === 1 ? '' : 's'} inside the choices, $${(want / 100).toFixed(2)} in all`);
    }
  }
  for (const p of plan.parameters) {
    const have = parameters.find((x) => x.name === p.name);
    if (!have || have.value !== p.value) { ok = false; lines.push(`MISMATCH: parameter ${p.name} is ${have ? JSON.stringify(have.value) : 'not set'}, the plan ${p.value}`); }
    else lines.push(`ok: parameter ${p.name} = ${p.value}`);
  }
  return { ok, lines };
}

// ---- reading what the plan needs -----------------------------------------------------

/** The job's name and parameters, fresh. */
export async function fetchJobHead(client: Reader, id: string): Promise<JobHead> {
  const res = await client.query<{ job: { id: string; name: string; parameters: JobParameter[] | null } | null }>({
    job: { $: { id }, id: {}, name: {}, parameters: {} },
  });
  if (!res.job) throw new Error(`job ${id} not found`);
  return { id: res.job.id, name: res.job.name, parameters: res.job.parameters ?? [] };
}

interface Named { id: string; name: string }

/** Units, cost types and cost codes by name, and the two catalog items the build adds by name. */
export async function fetchNameMaps(client: Reader): Promise<NameMaps> {
  const res = await client.query<{
    organization: {
      units: { nodes: Named[] };
      costTypes: { nodes: Named[] };
      costCodes: { nextPage: string | null; nodes: Named[] };
      costItems: { nodes: (Named & { unitCost: number | null; unitPrice: number | null })[] };
    };
  }>({
    organization: {
      $: { id: client.organizationId },
      units: { $: { size: 100 }, nodes: { id: {}, name: {} } },
      costTypes: { $: { size: 50 }, nodes: { id: {}, name: {} } },
      costCodes: { $: { size: 100 }, nextPage: {}, nodes: { id: {}, name: {} } },
      costItems: {
        $: {
          size: 10,
          where: {
            and: [
              [['job', 'id'], '=', null], [['document', 'id'], '=', null], [['costGroup', 'id'], '=', null],
              [['name'], 'in', [GENERAL_DESCRIPTION, CONTINGENCY_LINE]],
            ],
          },
        },
        nodes: { id: {}, name: {}, unitCost: {}, unitPrice: {} },
      },
    },
  });
  const o = res.organization;
  const codes = [...o.costCodes.nodes];
  let page = o.costCodes.nextPage;
  while (page) {
    const more = await client.query<{ organization: { costCodes: { nextPage: string | null; nodes: Named[] } } }>({
      organization: { $: { id: client.organizationId }, costCodes: { $: { size: 100, page }, nextPage: {}, nodes: { id: {}, name: {} } } },
    });
    codes.push(...more.organization.costCodes.nodes);
    page = more.organization.costCodes.nodes.length ? more.organization.costCodes.nextPage : null;
  }
  const lower = (nodes: Named[]): Map<string, string> => new Map(nodes.map((n) => [n.name.toLowerCase(), n.id]));
  return {
    units: lower(o.units.nodes),
    costTypes: lower(o.costTypes.nodes),
    costCodes: lower(codes),
    generalDescriptionItemId: o.costItems.nodes.find((i) => i.name === GENERAL_DESCRIPTION && (i.unitCost ?? 0) === 0)?.id ?? null,
    contingencyItemId: o.costItems.nodes.find((i) => i.name === CONTINGENCY_LINE && i.unitCost === 1 && i.unitPrice === 1)?.id ?? null,
  };
}

interface RawPriced {
  id: string;
  name: string;
  description: string | null;
  unitCost: number | null;
  unitPrice: number | null;
  unit: { name: string } | null;
  costType: { name: string } | null;
  costCode: { name: string } | null;
}

const PRICED_FIELDS = {
  id: {}, name: {}, description: {}, unitCost: {}, unitPrice: {},
  unit: { name: {} }, costType: { name: {} }, costCode: { name: {} },
} as const;

const toPriced = (r: RawPriced): PricedInfo => ({
  id: r.id,
  name: r.name,
  unit: r.unit?.name ?? null,
  costTypeName: r.costType?.name ?? null,
  costCodeName: r.costCode?.name ?? null,
  unitCost: r.unitCost,
  unitPrice: r.unitPrice,
  description: r.description?.trim() || null,
});

/** The ids a plan prices from the catalog: every found line's item and every catalog match. */
export function pricedIdsOf(draft: DraftFile): string[] {
  const ids = new Set<string>();
  for (const f of draft.found ?? []) ids.add(f.source.pricedItemId);
  for (const g of draft.gaps ?? []) if (!g.resolved && g.catalogMatch) ids.add(g.catalogMatch.lineId);
  return [...ids];
}

/**
 * Catalog items by id, a few per query. An id may name a template line; its
 * price of record is the ungrouped item it points at, so the map holds that
 * item under both ids.
 */
export async function fetchPricedItems(client: Reader, ids: string[]): Promise<Map<string, PricedInfo>> {
  const out = new Map<string, PricedInfo>();
  const unique = [...new Set(ids)];
  const PER_QUERY = 10;
  for (let i = 0; i < unique.length; i += PER_QUERY) {
    const batch = unique.slice(i, i + PER_QUERY);
    const query: Record<string, unknown> = {};
    batch.forEach((id, k) => {
      query[`i${k}`] = { _: 'costItem', $: { id }, ...PRICED_FIELDS, organizationCostItem: PRICED_FIELDS };
    });
    const res = await client.query<Record<string, (RawPriced & { organizationCostItem: RawPriced | null }) | null>>(query);
    batch.forEach((id, k) => {
      const r = res[`i${k}`];
      if (!r) return;
      const info = toPriced(r.organizationCostItem ?? r);
      out.set(id, info);
      out.set(info.id, info);
    });
  }
  return out;
}
