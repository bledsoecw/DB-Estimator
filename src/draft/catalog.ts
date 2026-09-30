/**
 * The rest of the catalog, for what the chosen templates do not have.
 *
 * Carl's process, step 4: when a line is not in the template the rep
 * brought in, find another template that has it and bring that in, or use
 * the catalog item itself. Carl, 30 Sep 2026, on pass 2 of 261323: the
 * draft flagged insulation, electrical and a vapor barrier as having no
 * line, "but at least in Addition/House Build › New Home Build › Phase 2 -
 * Rough-In › Insulation", "Electrical - Rough-in", and the catalog's
 * "Vapor Barrier 4 mil"; and "standard Crew Labor in the catalog can be
 * used for any labor item that does not have a specific labor line".
 *
 * So every gap the draft produces is searched here, by its terms, against
 * every template line and every ungrouped catalog item in the organization.
 * The candidates go to the model beside the gap; it picks the one that is
 * the same thing and gives the quantity in that line's unit; the code prices
 * it from the catalog like any kept line. A gap only stays a gap when the
 * whole catalog has nothing for it.
 *
 * Read-only.
 */

import type { Reader } from '../jobtread/queries.ts';
import { STRUCTURAL_GROUPS } from './templates.ts';

/** One place in the catalog a gap could be covered from. */
export interface CatalogCandidate {
  /** The template line's id, or the ungrouped item's id when no template carries it. */
  id: string;
  kind: 'templateLine' | 'catalogItem';
  name: string;
  description: string | null;
  unit: string | null;
  costTypeName: string | null;
  costCodeName: string | null;
  /** The price of record: the ungrouped item's, which a template line takes. */
  unitCost: number | null;
  unitPrice: number | null;
  /** The priced item behind it; the same for every template line that points at it. */
  pricedItemId: string;
  /** Where it sits when it is a template line: the template and the groups down to it. */
  templateId: string | null;
  templateName: string | null;
  groupPath: string[];
  /** Other templates that carry the same line, by name, so the rep can pick the nearer one. */
  alsoIn: string[];
}

export interface CatalogSource {
  /** Candidates for the terms, leaving out the templates already chosen (their lines were shown already). */
  search: (terms: string[], excludeTemplateIds: string[]) => Promise<CatalogCandidate[]>;
}

/** DB's standard crew rate: the labor line for anything with no labor line of its own. */
export const CREW_LABOR = 'Crew Labor';

const PAGE = 100;
const MAX_PAGES = 4;
const PARENTS = 6;
const SKIP_GROUP = /do not use|service repair/i;

interface RawGroup { id: string; name: string; parentCostGroup?: RawGroup | null }
interface RawItem {
  id: string;
  name: string;
  description: string | null;
  unitCost: number | null;
  unitPrice: number | null;
  unit: { name: string } | null;
  costType: { name: string } | null;
  costCode: { name: string } | null;
  organizationCostItem: { id: string; unitCost: number | null; unitPrice: number | null } | null;
  costGroup: RawGroup | null;
}

function groupSelection(depth: number): Record<string, unknown> {
  const sel: Record<string, unknown> = { id: {}, name: {} };
  if (depth > 0) sel['parentCostGroup'] = groupSelection(depth - 1);
  return sel;
}

const ITEM_FIELDS = {
  id: {}, name: {}, description: {}, unitCost: {}, unitPrice: {},
  unit: { name: {} }, costType: { name: {} }, costCode: { name: {} },
  organizationCostItem: { id: {}, unitCost: {}, unitPrice: {} },
  costGroup: groupSelection(PARENTS),
};

/** Root-first names from the template root down to the line's group; null when the chain did not reach a root. */
export function chainOf(g: RawGroup | null): { root: RawGroup; path: string[] } | null {
  const names: string[] = [];
  let cur: RawGroup | null | undefined = g;
  let root: RawGroup | null = null;
  while (cur) {
    names.unshift(cur.name);
    if (cur.parentCostGroup === null) { root = cur; break; }
    cur = cur.parentCostGroup;
  }
  if (!root) return null;
  return { root, path: names.slice(1) };
}

/**
 * Everything in the catalog whose name or description carries one of the
 * terms, plus Crew Labor, folded to one candidate per priced item.
 */
export async function searchCatalog(
  client: Reader,
  terms: string[],
  opts: { excludeTemplateIds?: string[] } = {},
): Promise<CatalogCandidate[]> {
  const clean = [...new Set(terms.map((t) => t.trim().toLowerCase()).filter(Boolean))];
  const likes = clean.flatMap((t) => [['name', 'like', `%${t}%`], ['description', 'like', `%${t}%`]]);
  likes.push(['name', '=', CREW_LABOR]);
  const raw: RawItem[] = [];
  let page: string | null = null;
  for (let i = 0; i < MAX_PAGES; i++) {
    const res: { organization: { costItems: { nextPage: string | null; nodes: RawItem[] } } } = await client.query({
      organization: {
        $: { id: client.organizationId },
        costItems: {
          $: {
            size: PAGE,
            ...(page ? { page } : {}),
            where: { and: [[['job', 'id'], '=', null], [['document', 'id'], '=', null], { or: likes }] },
          },
          nextPage: {},
          nodes: ITEM_FIELDS,
        },
      },
    });
    const c = res.organization.costItems;
    raw.push(...c.nodes);
    if (!c.nextPage || c.nodes.length === 0) break;
    page = c.nextPage;
  }
  return foldCandidates(raw, opts.excludeTemplateIds ?? []);
}

/** One candidate per priced item: the first template location it appears in, the others named. */
export function foldCandidates(raw: RawItem[], excludeTemplateIds: string[]): CatalogCandidate[] {
  const exclude = new Set(excludeTemplateIds);
  const byItem = new Map<string, CatalogCandidate>();
  const ungrouped: RawItem[] = [];
  const lines: { r: RawItem; root: RawGroup; path: string[] }[] = [];
  for (const r of raw) {
    if (!r.costGroup) { ungrouped.push(r); continue; }
    const chain = chainOf(r.costGroup);
    if (!chain) continue;
    if (chain.path.some((n) => STRUCTURAL_GROUPS.has(n.toUpperCase()) || SKIP_GROUP.test(n)) || SKIP_GROUP.test(chain.root.name)) continue;
    if (exclude.has(chain.root.id)) continue;
    lines.push({ r, root: chain.root, path: chain.path });
  }
  // The ungrouped items first: they are the price of record and exist even when no template carries them.
  for (const r of ungrouped) {
    byItem.set(r.id, {
      id: r.id, kind: 'catalogItem', name: r.name, description: r.description, unit: r.unit?.name ?? null,
      costTypeName: r.costType?.name ?? null, costCodeName: r.costCode?.name ?? null,
      unitCost: r.unitCost, unitPrice: r.unitPrice, pricedItemId: r.id,
      templateId: null, templateName: null, groupPath: [], alsoIn: [],
    });
  }
  // Template lines: the first location becomes the candidate the rep is pointed at; the rest are named.
  // Crew Labor is the exception: Carl's rule names the catalog item itself as the standard rate, and the
  // templates that carry it (a roofing shingle system) say nothing about where this labor belongs.
  lines.sort((a, b) => a.root.name.localeCompare(b.root.name));
  for (const { r, root, path } of lines) {
    const priced = r.organizationCostItem;
    const key = priced?.id ?? r.id;
    const have = byItem.get(key);
    if (have && (have.kind === 'templateLine' || r.name === CREW_LABOR)) {
      if (have.kind === 'templateLine' && !have.alsoIn.includes(root.name) && have.templateName !== root.name) have.alsoIn.push(root.name);
      continue;
    }
    byItem.set(key, {
      id: r.id, kind: 'templateLine', name: r.name, description: r.description ?? have?.description ?? null,
      unit: r.unit?.name ?? have?.unit ?? null,
      costTypeName: r.costType?.name ?? have?.costTypeName ?? null, costCodeName: r.costCode?.name ?? have?.costCodeName ?? null,
      unitCost: priced?.unitCost ?? have?.unitCost ?? null, unitPrice: priced?.unitPrice ?? have?.unitPrice ?? null,
      pricedItemId: key, templateId: root.id, templateName: root.name, groupPath: path, alsoIn: [],
    });
  }
  return [...byItem.values()];
}

const STOP = new Set(['the', 'and', 'for', 'with', 'from', 'that', 'this', 'into', 'onto', 'between', 'new', 'option', 'walls', 'wall', 'labor', 'material', 'materials', 'install', 'framed', 'false']);

/** What to search the catalog for, per gap: its lookBack terms, or failing those the telling words of its scope. */
export function gapTerms(gap: { scope: string; lookBack: string[] }): string[] {
  const terms = gap.lookBack.map((t) => t.trim().toLowerCase()).filter(Boolean);
  if (terms.length) return terms;
  const words = gap.scope.toLowerCase().replace(/[^a-z0-9 -]/g, ' ').split(/\s+/).filter((w) => w.length > 3 && !STOP.has(w));
  return [...new Set(words)].slice(0, 3);
}

const MAX_PER_GAP = 8;

/**
 * The candidates that bear on one gap: those a term of the gap appears in,
 * the gap's own cost type first, and Crew Labor for any Labor gap.
 */
export function candidatesFor(
  gap: { scope: string; costType: string; lookBack: string[] },
  all: CatalogCandidate[],
): CatalogCandidate[] {
  const terms = gapTerms(gap);
  const scored = all
    .map((c) => {
      const name = c.name.toLowerCase();
      const desc = (c.description ?? '').toLowerCase();
      let score = 0;
      for (const t of terms) {
        if (name.includes(t)) score += 2;
        else if (desc.includes(t)) score += 1;
      }
      const crew = c.name === CREW_LABOR && gap.costType === 'Labor';
      return { c, score: crew ? Math.max(score, 1) : score, sameType: c.costTypeName === gap.costType, crew };
    })
    .filter((x) => x.score > 0)
    .sort((a, b) => Number(b.sameType) - Number(a.sameType) || b.score - a.score || Number(a.crew) - Number(b.crew) || a.c.name.localeCompare(b.c.name));
  const out = scored.slice(0, MAX_PER_GAP).map((x) => x.c);
  const crew = scored.find((x) => x.crew);
  if (crew && !out.includes(crew.c)) out.push(crew.c);
  return out;
}

const MAX_DESC = 200;

/** The candidates as the model reads them, under a gap target. */
export function candidatesText(candidates: CatalogCandidate[]): string[] {
  const out: string[] = [];
  for (const c of candidates) {
    const where = c.kind === 'templateLine'
      ? `in ${c.templateName} › ${c.groupPath.join(' › ')}${c.alsoIn.length ? ` (also in ${c.alsoIn.join(', ')})` : ''}`
      : 'an ungrouped catalog item';
    const price = c.unitCost === null ? 'no price' : `$${c.unitCost.toFixed(2)} cost / ${c.unitPrice === null ? '—' : `$${c.unitPrice.toFixed(2)}`} price per ${c.unit ?? 'unit'}`;
    out.push(`    · ${c.id} · ${c.kind} · ${c.name} · ${c.unit ?? 'no unit'} · ${c.costTypeName ?? 'no cost type'} · ${price} · ${where}`);
    if (c.description) {
      const d = c.description.replace(/\s+/g, ' ');
      out.push(`      ${d.length > MAX_DESC ? `${d.slice(0, MAX_DESC)}…` : d}`);
    }
  }
  return out;
}
