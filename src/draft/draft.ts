/**
 * The draft: which templates, which lines, what quantities, what it comes
 * to, and what nobody has a template line for.
 *
 * The model chooses and quantifies; this file prices and accounts. A kept
 * line is priced from the catalog item its template line points at, with
 * the same exact arithmetic the auditor uses (money.ts), rounded to cents
 * once per line. A line id the model names that is not in the chosen
 * templates is REJECTED and listed — never silently dropped and never
 * invented — because "the model made that up" is exactly what Carl asked
 * to see.
 */

import {
  type Money, ZERO, add, moneyFromApi, mulQty, priceFromCostAtMargin, qtyFromApi, rateFromApi, roundToCents,
} from '../money.ts';
import type { JobEvidence } from './evidence.ts';
import {
  DEFAULT_MODEL, NO_USAGE, addUsage, runStructured, type StructuredCall, type Usage,
} from './model.ts';
import {
  DraftSchema, HISTORY_SYSTEM, HistorySchema, MAX_PICKS, PICK_SYSTEM, DRAFT_SYSTEM, PickSchema,
  buildDraftContent, buildHistoryContent, buildPickContent,
  type DraftReply, type DraftReplyGap, type DraftReplyQuestion, type HistoryFinding, type HistoryTarget, type PickReply,
} from './prompt.ts';
import type { HistoryReport } from './history.ts';
import { groupPath, scopeLines, type Template, type TemplateLine, type TemplateSummary } from './templates.ts';

export type Confidence = 'high' | 'medium' | 'low';

export interface DraftLine {
  /** The template line's id — what the rep keeps in JobTread. */
  lineId: string;
  name: string;
  templateId: string;
  templateName: string;
  groupPath: string[];
  unit: string | null;
  costTypeName: string;
  quantity: number;
  unitCost: Money;
  unitPrice: Money;
  cost: Money;
  price: Money;
  /** false when the template line points at no priced catalog item, or one at $0. */
  priced: boolean;
  /** A catalog item at exactly $0 cost and $0 price: a time-tracking line, kept so the crew can clock to it. */
  tracking: boolean;
  basis: string;
  evidence: { source: string; quote: string }[];
  option: string | null;
  confidence: Confidence;
  /** Search terms the model gave for DB's past work of this kind. */
  lookBack: string[];
  /** What DB did last time, when history was read for this line. */
  history: HistoryFinding | null;
  /** History's unit cost and the price at DB's subcontractor margin; null when history gave none. */
  historyUnitCost: Money | null;
  historyUnitPrice: Money | null;
}

/** A gap, plus what history says about it and the price that would follow. */
export type DraftGap = DraftReplyGap & {
  history: HistoryFinding | null;
  /** From history's unit cost × the gap's quantity, at the subcontractor margin. A proposal, never a total. */
  proposed: { unitCost: Money; unitPrice: Money | null; cost: Money; price: Money | null } | null;
};
export type DraftQuestion = DraftReplyQuestion;

export interface Totals {
  cost: Money;
  price: Money;
  lines: number;
  unpriced: number;
}

export interface OptionChoice {
  name: string;
  totals: Totals;
}

/**
 * One selection the rep builds. Two or more choices means the customer picks
 * one ("Flooring": LVP or Epoxy). One choice is a yes-or-no add-on the
 * customer may decline ("Ceiling paint").
 */
export interface OptionGroup {
  group: string;
  required: boolean;
  choices: OptionChoice[];
}

export interface TemplatePlan {
  template: Template;
  role: 'primary' | 'supplement';
  why: string;
  kept: DraftLine[];
  /** Scope lines the rep deletes after adding the template. */
  removed: TemplateLine[];
  /** Lines in CLOCK IN ITEMS etc. that stay untouched. */
  structural: number;
}

export interface Draft {
  jobId: string;
  jobName: string;
  model: string;
  /** What the picker said the job is. Empty when templates were given by hand. */
  pickSummary: string;
  /** Why nothing fits, when the picker chose nothing. */
  noFit: string | null;
  summary: string;
  scopeOfWork: string;
  plans: TemplatePlan[];
  lines: DraftLine[];
  gaps: DraftGap[];
  questions: DraftQuestion[];
  /** Ids the model named that exist in no chosen template. */
  rejected: { lineId: string; reason: string }[];
  /** Template ids the picker named that are not in the index. */
  rejectedPicks: { templateId: string; reason: string }[];
  totals: {
    base: Totals;
    options: OptionGroup[];
    all: Totals;
    /** What history proposes for the gaps. Shown beside the total, never inside it. */
    proposedForGaps: { cost: Money; price: Money | null; gaps: number };
  };
  /** The past-work step: what was searched and what came of it. Null when it did not run. */
  history: { terms: string[]; report: HistoryReport; findings: number; skipped: string | null } | null;
  usage: Usage;
  cost: number | null;
}

export interface HistorySource {
  search: (terms: string[]) => Promise<HistoryReport>;
  /** The Subcontractor cost type's margin as a fraction (0.3), for pricing what history proposes. */
  subMargin: number | null;
}

export interface DraftOptions {
  model?: string;
  /** Skip the picker and use these templates, first as primary. */
  templateIds?: string[];
  /** Read DB's past work for subcontracted lines and gaps. Off when absent. */
  history?: HistorySource;
}

const PICK_MAX_TOKENS = 8_000;
const DRAFT_MAX_TOKENS = 32_000;
const HISTORY_MAX_TOKENS = 16_000;
const MAX_TERMS = 10;

/** Everything the CLI freezes to disk with --capture, and reads back with --fixture. */
export interface DraftFixture {
  capturedAt: string;
  organizationId: string;
  /** Photo bytes are not stored; a fixture replays text only. */
  evidence: JobEvidence;
  index: TemplateSummary[];
  templates: Template[];
}

export async function draftEstimate(
  evidence: JobEvidence,
  index: TemplateSummary[],
  loadTemplate: (id: string) => Promise<Template>,
  call: StructuredCall,
  opts: DraftOptions = {},
): Promise<Draft> {
  const model = opts.model ?? DEFAULT_MODEL;
  let usage = NO_USAGE;
  let cost: number | null = 0;
  const addCost = (c: number | null): void => { cost = cost === null || c === null ? null : cost + c; };

  // ---- 1. which templates -----------------------------------------------------
  let picks: PickReply['picks'];
  let pickSummary = '';
  let noFit: string | null = null;
  const rejectedPicks: Draft['rejectedPicks'] = [];
  const known = new Map(index.map((t) => [t.id, t]));

  if (opts.templateIds && opts.templateIds.length > 0) {
    picks = opts.templateIds.map((id, i) => ({
      templateId: id,
      role: i === 0 ? 'primary' : 'supplement',
      why: 'chosen by hand',
    }));
  } else {
    const r = await runStructured(
      call,
      { model, system: PICK_SYSTEM, content: buildPickContent(evidence, index), schema: PickSchema, maxTokens: PICK_MAX_TOKENS },
      'pick the templates',
    );
    usage = addUsage(usage, r.usage);
    addCost(r.cost);
    pickSummary = r.data.summary;
    noFit = r.data.picks.length === 0 ? (r.data.noFit ?? 'the model picked no template and gave no reason') : null;
    picks = r.data.picks;
  }

  // Unknown ids are reported, not fetched: the index is the list the rep can add from.
  const usable = picks.filter((p) => {
    if (known.has(p.templateId) || opts.templateIds) return true;
    rejectedPicks.push({ templateId: p.templateId, reason: 'not a budget template in this organization' });
    return false;
  });
  // A primary first, then supplements; at most MAX_PICKS.
  usable.sort((a, b) => (a.role === b.role ? 0 : a.role === 'primary' ? -1 : 1));
  const chosen = usable.slice(0, MAX_PICKS);
  if (usable.length > MAX_PICKS) {
    for (const p of usable.slice(MAX_PICKS)) {
      rejectedPicks.push({ templateId: p.templateId, reason: `more than ${MAX_PICKS} templates picked; the first ${MAX_PICKS} were used` });
    }
  }

  const empty = (): Draft => ({
    jobId: evidence.jobId, jobName: evidence.jobName, model, pickSummary, noFit,
    summary: pickSummary, scopeOfWork: '', plans: [], lines: [], gaps: [], questions: [],
    rejected: [], rejectedPicks,
    totals: { base: totalsOf([]), options: [], all: totalsOf([]), proposedForGaps: { cost: ZERO, price: ZERO, gaps: 0 } },
    history: null,
    usage, cost,
  });
  if (chosen.length === 0) return empty();

  const templates: Template[] = [];
  for (const p of chosen) templates.push(await loadTemplate(p.templateId));

  // ---- 2. which lines, what quantities ------------------------------------------
  const d = await runStructured(
    call,
    { model, system: DRAFT_SYSTEM, content: buildDraftContent(evidence, templates), schema: DraftSchema, maxTokens: DRAFT_MAX_TOKENS },
    'draft the budget',
  );
  usage = addUsage(usage, d.usage);
  addCost(d.cost);

  const { lines, rejected } = priceLines(d.data, templates);
  const gaps: DraftGap[] = d.data.gaps.map((g) => ({ ...g, history: null, proposed: null }));

  // ---- 3. what DB did last time -----------------------------------------------
  let history: Draft['history'] = null;
  if (opts.history) {
    const targets = historyTargets(lines, gaps);
    const terms = uniqueTerms(targets);
    if (terms.length > 0) {
      const report = await opts.history.search(terms);
      const found = report.terms.some((t) => t.jobs.length > 0);
      if (!found) {
        history = { terms, report, findings: 0, skipped: 'no past DB work matched any search term' };
      } else {
        const h = await runStructured(
          call,
          {
            model, system: HISTORY_SYSTEM,
            content: buildHistoryContent(d.data.summary, targets, report),
            schema: HistorySchema, maxTokens: HISTORY_MAX_TOKENS,
          },
          'read the history',
        );
        usage = addUsage(usage, h.usage);
        addCost(h.cost);
        attachHistory(lines, gaps, h.data.findings, opts.history.subMargin);
        history = { terms, report, findings: h.data.findings.length, skipped: null };
      }
    }
  }

  const plans: TemplatePlan[] = templates.map((t, i) => {
    const pick = chosen[i]!;
    const keptIds = new Set(lines.filter((l) => l.templateId === t.id).map((l) => l.lineId));
    const scope = scopeLines(t);
    return {
      template: t,
      role: pick.role,
      why: pick.why,
      kept: lines.filter((l) => l.templateId === t.id),
      removed: scope.filter((l) => !keptIds.has(l.id)),
      structural: t.lines.length - scope.length,
    };
  });

  return {
    jobId: evidence.jobId,
    jobName: evidence.jobName,
    model,
    pickSummary,
    noFit,
    summary: d.data.summary,
    scopeOfWork: d.data.scopeOfWork,
    plans,
    lines,
    gaps,
    questions: d.data.questions,
    rejected,
    rejectedPicks,
    totals: { ...totalsByOption(lines), proposedForGaps: proposedForGaps(gaps) },
    history,
    usage,
    cost,
  };
}

/** Subcontracted lines, lines the model wanted looked up, and every gap. */
export function historyTargets(lines: DraftLine[], gaps: DraftGap[]): HistoryTarget[] {
  const out: HistoryTarget[] = [];
  for (const l of lines) {
    if (l.costTypeName !== 'Subcontractor' && l.lookBack.length === 0) continue;
    out.push({
      kind: 'line', id: l.lineId, name: l.name, quantity: l.quantity, unit: l.unit,
      costTypeName: l.costTypeName, basis: l.basis,
      templateUnitCost: l.priced ? Number(l.unitCost) / 10_000 : null,
      lookBack: l.lookBack,
    });
  }
  gaps.forEach((g, i) => {
    out.push({
      kind: 'gap', id: `gap-${i}`, name: g.scope, quantity: g.quantity, unit: g.unit,
      costTypeName: g.costType, basis: g.basis, templateUnitCost: null, lookBack: g.lookBack,
    });
  });
  return out;
}

/** Lower-cased, deduplicated, and capped; the search costs a query a term. */
export function uniqueTerms(targets: HistoryTarget[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const t of targets) {
    for (const raw of t.lookBack) {
      const term = raw.trim().toLowerCase();
      if (!term || seen.has(term)) continue;
      seen.add(term);
      out.push(term);
      if (out.length >= MAX_TERMS) return out;
    }
  }
  return out;
}

/**
 * Put each finding on its line or gap and price what history proposes.
 *
 * The model cites a unit cost from past lines; the code turns it into
 * Money and into a price at the subcontractor margin, the same one JobTread
 * applies to a Subcontractor line. A finding for an id nobody asked about
 * is dropped: it cannot be shown on anything.
 */
export function attachHistory(
  lines: DraftLine[],
  gaps: DraftGap[],
  findings: HistoryFinding[],
  subMargin: number | null,
): void {
  const margin = subMargin === null ? null : rateFromApi(subMargin);
  // A proposed unit price is rounded to the cent: it is read by a person, not stored by JobTread.
  const price = (cost: Money): Money | null => (margin === null ? null : roundToCents(priceFromCostAtMargin(cost, margin)));
  const byLine = new Map(lines.map((l) => [l.lineId, l]));
  for (const f of findings) {
    if (f.target.kind === 'line') {
      const l = byLine.get(f.target.id);
      if (!l) continue;
      l.history = f;
      if (f.suggestedUnitCost !== null && f.suggestedUnitCost > 0) {
        l.historyUnitCost = moneyFromApi(f.suggestedUnitCost);
        l.historyUnitPrice = price(l.historyUnitCost);
      }
    } else {
      const m = /^gap-(\d+)$/.exec(f.target.id);
      const g = m ? gaps[Number(m[1])] : undefined;
      if (!g) continue;
      g.history = f;
      if (f.suggestedUnitCost !== null && f.suggestedUnitCost > 0 && g.quantity !== null && g.quantity > 0) {
        const unitCost = moneyFromApi(f.suggestedUnitCost);
        const unitPrice = price(unitCost);
        const q = qtyFromApi(g.quantity);
        g.proposed = {
          unitCost,
          unitPrice,
          cost: roundToCents(mulQty(unitCost, q)),
          price: unitPrice === null ? null : roundToCents(mulQty(unitPrice, q)),
        };
      }
    }
  }
}

export function proposedForGaps(gaps: DraftGap[]): Draft['totals']['proposedForGaps'] {
  let cost = ZERO;
  let price: Money | null = ZERO;
  let n = 0;
  for (const g of gaps) {
    if (!g.proposed) continue;
    n++;
    cost = add(cost, g.proposed.cost);
    price = price === null || g.proposed.price === null ? null : add(price, g.proposed.price);
  }
  return { cost, price, gaps: n };
}

/**
 * Price every kept line from the catalog item its template line points at.
 *
 * Quantity × unit, rounded to cents once, the way the auditor checks a
 * document (docs/ROADMAP.md 8.2). A template line with no priced item, or
 * one at $0 (Permit, Sales On-Site Support), is kept and shown unpriced:
 * the rep types that number, and the page says so rather than showing $0
 * as if it were a price.
 */
export function priceLines(
  reply: DraftReply,
  templates: Template[],
): { lines: DraftLine[]; rejected: { lineId: string; reason: string }[] } {
  const byId = new Map<string, { t: Template; l: TemplateLine }>();
  for (const t of templates) {
    for (const l of scopeLines(t)) byId.set(l.id, { t, l });
  }
  const structural = new Map<string, { t: Template; l: TemplateLine }>();
  for (const t of templates) {
    const scope = new Set(scopeLines(t).map((l) => l.id));
    for (const l of t.lines) if (!scope.has(l.id)) structural.set(l.id, { t, l });
  }

  const lines: DraftLine[] = [];
  const rejected: { lineId: string; reason: string }[] = [];
  for (const r of reply.lines) {
    const hit = byId.get(r.lineId);
    if (!hit) {
      const s = structural.get(r.lineId);
      rejected.push({
        lineId: r.lineId,
        reason: s
          ? `"${s.l.name}" is a time-tracking or fee line the rep does not touch`
          : 'not a line in any chosen template',
      });
      continue;
    }
    if (!Number.isFinite(r.quantity) || r.quantity < 0) {
      rejected.push({ lineId: r.lineId, reason: `"${hit.l.name}" came back with quantity ${String(r.quantity)}` });
      continue;
    }
    const unitCost = moneyFromApi(hit.l.priced?.unitCost);
    const unitPrice = moneyFromApi(hit.l.priced?.unitPrice);
    const qty = qtyFromApi(r.quantity);
    const priced = hit.l.priced !== null && (unitCost !== ZERO || unitPrice !== ZERO);
    const tracking =
      hit.l.priced !== null && hit.l.priced.unitCost === 0 && hit.l.priced.unitPrice === 0;
    lines.push({
      lineId: hit.l.id,
      name: hit.l.name,
      templateId: hit.t.id,
      templateName: hit.t.name,
      groupPath: groupPath(hit.t, hit.l.groupId),
      unit: hit.l.unit,
      costTypeName: hit.l.costTypeName,
      quantity: r.quantity,
      unitCost,
      unitPrice,
      cost: roundToCents(mulQty(unitCost, qty)),
      price: roundToCents(mulQty(unitPrice, qty)),
      priced,
      tracking,
      basis: r.basis,
      evidence: r.evidence,
      option: r.option?.trim() || null,
      confidence: r.confidence,
      lookBack: r.lookBack.map((t) => t.trim()).filter(Boolean),
      history: null,
      historyUnitCost: null,
      historyUnitPrice: null,
    });
  }
  return { lines, rejected };
}

export function totalsOf(lines: DraftLine[]): Totals {
  let cost = ZERO;
  let price = ZERO;
  let unpriced = 0;
  for (const l of lines) {
    cost = add(cost, l.cost);
    price = add(price, l.price);
    if (!l.priced) unpriced++;
  }
  return { cost, price, lines: lines.length, unpriced };
}

/**
 * "Group — Choice" is one alternative within a group; a bare name is a
 * yes-or-no add-on. Written this way by the prompt, read this way here.
 */
export function parseOption(option: string): { group: string; choice: string | null } {
  const m = /^(.*?)\s+[\u2014\u2013-]\s+(.*)$/.exec(option.trim());
  if (m && m[1]!.trim() && m[2]!.trim()) return { group: m[1]!.trim(), choice: m[2]!.trim() };
  return { group: option.trim(), choice: null };
}

/** Base scope, then each option group with its choices, then everything together. */
export function totalsByOption(lines: DraftLine[]): Omit<Draft['totals'], 'proposedForGaps'> {
  const base = lines.filter((l) => l.option === null);
  const groups = new Map<string, Map<string, DraftLine[]>>();
  for (const l of lines) {
    if (l.option === null) continue;
    const { group, choice } = parseOption(l.option);
    const byChoice = groups.get(group) ?? new Map<string, DraftLine[]>();
    const key = choice ?? group;
    byChoice.set(key, [...(byChoice.get(key) ?? []), l]);
    groups.set(group, byChoice);
  }
  const options: OptionGroup[] = [...groups.entries()].map(([group, byChoice]) => ({
    group,
    required: byChoice.size >= 2,
    choices: [...byChoice.entries()].map(([name, ls]) => ({ name, totals: totalsOf(ls) })),
  }));
  return { base: totalsOf(base), options, all: totalsOf(lines) };
}
