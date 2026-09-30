/**
 * The budget templates, as JobTread holds them.
 *
 * A "Budget Template" in DB's process is a top-level catalog cost group —
 * `Bathroom Remodel`, `X-Division 09 Finishes`, forty-four of them at last
 * count. Its lines are catalog cost items that carry NO price of their own:
 * each one points, through `organizationCostItem`, at the ungrouped priced
 * catalog item that is the price of record. When a rep adds the group to a
 * job's Budget tab, JobTread copies the structure and prices every copied
 * line from that priced item. The drafter reproduces exactly that: it never
 * prices a line itself, it reads the price the template line points at.
 *
 * Read-only. Nothing here writes to JobTread.
 */

import { JobTreadError } from '../jobtread/client.ts';
import type { Reader } from '../jobtread/queries.ts';

/** One template as it appears in the picker's list: enough to choose by. */
export interface TemplateSummary {
  id: string;
  name: string;
  description: string | null;
  /** Names of every group inside the template, top-down, for the picker. */
  groups: string[];
  lineCount: number;
}

export interface TemplateGroup {
  id: string;
  name: string;
  position: string | null;
  /** null for the template root itself. */
  parentId: string | null;
  isSelection: boolean;
}

/** The ungrouped catalog item a template line takes its price from. */
export interface PricedItem {
  id: string;
  name: string;
  unitCost: number | null;
  unitPrice: number | null;
  costTypeName: string | null;
}

export interface TemplateLine {
  id: string;
  name: string;
  description: string | null;
  unit: string | null;
  costTypeName: string;
  costCodeName: string;
  groupId: string | null;
  position: string | null;
  isSpecification: boolean;
  quantity: number | null;
  quantityFormula: string | null;
  /** null when the template line points at nothing priced. */
  priced: PricedItem | null;
}

export interface Template {
  id: string;
  name: string;
  description: string | null;
  groups: TemplateGroup[];
  lines: TemplateLine[];
}

/**
 * Groups the org's job template puts in every budget for time tracking and
 * fees, plus the empty CHANGE ORDER shell. None of it is scope, none of it is
 * for the model to keep or drop, and the rep leaves it alone.
 */
export const STRUCTURAL_GROUPS = new Set([
  'CLOCK IN ITEMS',
  'BURDEN',
  'GENERAL AND ADMINISTRATIVE',
  'CHANGE ORDER',
]);

const byPosition = <T extends { position: string | null; name: string }>(a: T, b: T): number => {
  // Fractional-index strings order by code point; a missing position sorts last.
  const pa = a.position ?? '￿';
  const pb = b.position ?? '￿';
  if (pa < pb) return -1;
  if (pa > pb) return 1;
  return a.name < b.name ? -1 : a.name > b.name ? 1 : 0;
};

/** Group names from just under the template root down to `groupId`. */
export function groupPath(t: Template, groupId: string | null): string[] {
  const byId = new Map(t.groups.map((g) => [g.id, g]));
  const out: string[] = [];
  const seen = new Set<string>();
  let id = groupId;
  while (id && id !== t.id && !seen.has(id)) {
    seen.add(id);
    const g = byId.get(id);
    if (!g) break;
    out.unshift(g.name);
    id = g.parentId;
  }
  return out;
}

export function isStructural(t: Template, line: TemplateLine): boolean {
  return groupPath(t, line.groupId).some((n) => STRUCTURAL_GROUPS.has(n.toUpperCase()));
}

/**
 * Every line in the order a rep sees it in JobTread: each group's own lines
 * first, then its child groups, both by position.
 */
export function orderedLines(t: Template): TemplateLine[] {
  const children = new Map<string, TemplateGroup[]>();
  for (const g of t.groups) {
    const parent = g.parentId ?? t.id;
    const list = children.get(parent) ?? [];
    list.push(g);
    children.set(parent, list);
  }
  const linesOf = new Map<string, TemplateLine[]>();
  for (const l of t.lines) {
    const key = l.groupId ?? t.id;
    const list = linesOf.get(key) ?? [];
    list.push(l);
    linesOf.set(key, list);
  }
  const out: TemplateLine[] = [];
  const seen = new Set<string>();
  const walk = (groupId: string): void => {
    if (seen.has(groupId)) return;
    seen.add(groupId);
    out.push(...(linesOf.get(groupId) ?? []).sort(byPosition));
    for (const g of (children.get(groupId) ?? []).sort(byPosition)) walk(g.id);
  };
  walk(t.id);
  // Lines whose group was not captured still belong to someone; never lose them.
  for (const l of t.lines) if (!out.includes(l)) out.push(l);
  return out;
}

/** The lines the model may keep or drop: not specifications, not structural. */
export function scopeLines(t: Template): TemplateLine[] {
  return orderedLines(t).filter((l) => !l.isSpecification && !isStructural(t, l));
}

// ---- reading them ------------------------------------------------------------

const TOP_LEVEL = {
  and: [
    [['job', 'id'], '=', null],
    [['document', 'id'], '=', null],
    [['parentCostGroup', 'id'], '=', null],
  ],
} as const;

/**
 * JobTread refuses a query with "Request Entity Too Large" when the declared
 * page sizes multiply out too far — BEFORE running it, so the real data size
 * is irrelevant. Fifteen templates × a 100-group connection inside each is
 * refused although the answer is a few kilobytes; one template × 100 groups
 * is fine, and so are five such single-id roots aliased in one query. So the
 * index is read as one flat page of templates, then the group names five
 * templates at a time, and a template's lines page at 30 with a smaller retry.
 */
const GROUP_PAGE = 100;
const LINE_PAGE = 30;
const LINE_PAGES_ON_REFUSAL = [LINE_PAGE, 15, 8];
const NAMES_PER_QUERY = 5;

interface RawSummary {
  id: string;
  name: string;
  description: string | null;
  descendentCostItems: { count: number };
}

/** All forty-odd budget templates, by name, with what a picker needs. */
export async function fetchTemplateIndex(client: Reader): Promise<TemplateSummary[]> {
  const flat: RawSummary[] = [];
  let page: string | null = null;
  for (;;) {
    const args: Record<string, unknown> = { size: 100, where: TOP_LEVEL, sortBy: [{ field: 'name' }] };
    if (page) args['page'] = page;
    const res: { organization: { costGroups: { nextPage: string | null; nodes: RawSummary[] } } } =
      await client.query({
        organization: {
          $: { id: client.organizationId },
          costGroups: {
            $: args,
            nextPage: {},
            nodes: { id: {}, name: {}, description: {}, descendentCostItems: { count: {} } },
          },
        },
      });
    const c = res.organization.costGroups;
    flat.push(...c.nodes);
    if (!c.nextPage || c.nodes.length === 0) break;
    page = c.nextPage;
  }

  const names = await fetchGroupNames(client, flat.map((t) => t.id));
  return flat.map((n) => ({
    id: n.id,
    name: n.name,
    description: n.description?.trim() || null,
    groups: names.get(n.id) ?? [],
    lineCount: n.descendentCostItems.count,
  }));
}

/** Group names for many templates, a few single-id roots per query. */
async function fetchGroupNames(client: Reader, ids: string[]): Promise<Map<string, string[]>> {
  const out = new Map<string, string[]>();
  for (let i = 0; i < ids.length; i += NAMES_PER_QUERY) {
    const batch = ids.slice(i, i + NAMES_PER_QUERY);
    const query: Record<string, unknown> = {};
    batch.forEach((id, k) => {
      query[`t${k}`] = {
        _: 'costGroup',
        $: { id },
        id: {},
        descendentCostGroups: { $: { size: GROUP_PAGE }, nodes: { name: {} } },
      };
    });
    const res = await client.query<Record<string, { id: string; descendentCostGroups: { nodes: { name: string }[] } } | null>>(query);
    for (const k of Object.keys(query)) {
      const t = res[k];
      if (t) out.set(t.id, t.descendentCostGroups.nodes.map((g) => g.name));
    }
  }
  return out;
}

interface RawGroup {
  id: string;
  name: string;
  position: string | null;
  isSimpleSelection: boolean;
  parentCostGroup: { id: string } | null;
}

interface RawLine {
  id: string;
  name: string;
  description: string | null;
  position: string | null;
  isSpecification: boolean;
  quantity: number | null;
  quantityFormula: string | null;
  unit: { name: string } | null;
  costType: { name: string } | null;
  costCode: { name: string } | null;
  costGroup: { id: string } | null;
  organizationCostItem: {
    id: string;
    name: string;
    unitCost: number | null;
    unitPrice: number | null;
    costType: { name: string } | null;
  } | null;
}

const GROUP_FIELDS = {
  id: {}, name: {}, position: {}, isSimpleSelection: {}, parentCostGroup: { id: {} },
} as const;

const LINE_FIELDS = {
  id: {}, name: {}, description: {}, position: {}, isSpecification: {}, quantity: {}, quantityFormula: {},
  unit: { name: {} },
  costType: { name: {} },
  costCode: { name: {} },
  costGroup: { id: {} },
  organizationCostItem: {
    id: {}, name: {}, unitCost: {}, unitPrice: {}, costType: { name: {} },
  },
} as const;

interface Conn<T> {
  count: number;
  nextPage: string | null;
  nodes: T[];
}

/** One template with every group and line, paged; smaller pages if JobTread refuses the first. */
export async function fetchTemplate(client: Reader, id: string): Promise<Template> {
  let refused: unknown;
  for (const size of LINE_PAGES_ON_REFUSAL) {
    try {
      return await fetchTemplateAt(client, id, size);
    } catch (err) {
      if (!isRefusal(err)) throw err;
      refused = err;
    }
  }
  throw refused;
}

function isRefusal(err: unknown): boolean {
  return err instanceof JobTreadError && err.status === 413;
}

async function fetchTemplateAt(client: Reader, id: string, linePage: number): Promise<Template> {
  const head = await client.query<{
    costGroup: {
      id: string; name: string; description: string | null;
      descendentCostGroups: Conn<RawGroup>;
      descendentCostItems: Conn<RawLine>;
    } | null;
  }>({
    costGroup: {
      $: { id },
      id: {}, name: {}, description: {},
      descendentCostGroups: { $: { size: GROUP_PAGE }, count: {}, nextPage: {}, nodes: GROUP_FIELDS },
      descendentCostItems: {
        $: { size: linePage, sortBy: [{ field: 'position' }] },
        count: {}, nextPage: {}, nodes: LINE_FIELDS,
      },
    },
  });
  const g = head.costGroup;
  if (!g) throw new Error(`budget template ${id} not found`);

  const groups = await drainGroup<RawGroup>(client, id, 'descendentCostGroups', GROUP_FIELDS, g.descendentCostGroups, GROUP_PAGE, {});
  const lines = await drainGroup<RawLine>(
    client, id, 'descendentCostItems', LINE_FIELDS, g.descendentCostItems, linePage,
    { sortBy: [{ field: 'position' }] },
  );

  return {
    id: g.id,
    name: g.name,
    description: g.description?.trim() || null,
    groups: groups.map((r) => ({
      id: r.id,
      name: r.name,
      position: r.position,
      parentId: r.parentCostGroup?.id ?? null,
      isSelection: r.isSimpleSelection,
    })),
    lines: lines.map((r) => ({
      id: r.id,
      name: r.name,
      description: r.description?.trim() || null,
      unit: r.unit?.name ?? null,
      costTypeName: r.costType?.name ?? 'Other',
      costCodeName: r.costCode?.name ?? '',
      groupId: r.costGroup?.id ?? null,
      position: r.position,
      isSpecification: r.isSpecification,
      quantity: r.quantity,
      quantityFormula: r.quantityFormula,
      priced: r.organizationCostItem
        ? {
            id: r.organizationCostItem.id,
            name: r.organizationCostItem.name,
            unitCost: r.organizationCostItem.unitCost,
            unitPrice: r.organizationCostItem.unitPrice,
            costTypeName: r.organizationCostItem.costType?.name ?? null,
          }
        : null,
    })),
  };
}

async function drainGroup<T>(
  client: Reader,
  groupId: string,
  connection: 'descendentCostGroups' | 'descendentCostItems',
  fields: Record<string, unknown>,
  first: Conn<T>,
  size: number,
  args: Record<string, unknown>,
): Promise<T[]> {
  const all = [...first.nodes];
  let page = first.nextPage;
  while (page && all.length < first.count) {
    const res = await client.query<{ costGroup: Record<string, Conn<T>> | null }>({
      costGroup: {
        $: { id: groupId },
        [connection]: { $: { ...args, size, page }, nextPage: {}, nodes: fields },
      },
    });
    const c = res.costGroup?.[connection];
    if (!c || c.nodes.length === 0) break;
    all.push(...c.nodes);
    page = c.nextPage;
  }
  return all;
}
