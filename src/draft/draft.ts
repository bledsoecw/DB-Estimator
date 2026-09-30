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
 *
 * Two numbers are not the templates' and are labelled as such: what history
 * proposes for a gap (DB's own past work, a proposal for Carl) and, when
 * history has nothing, a regional ballpark for the gap (an area estimate
 * for the rep to sanity-check, never DB pricing). Neither enters a total.
 * The contingency line is the code's: the policy rate on the base cost.
 */

import {
  type Money, ZERO, add, moneyFromApi, mulQty, priceFromCostAtMargin, qtyFromApi, rateFromApi, roundToCents, sub,
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
import type { LearnedStore } from './learned.ts';
import { chooseRate, contingencyAmount, contingencyLine, type ContingencyStep } from './contingency.ts';
import {
  groupPath, isContingencyLine, scopeLines, type Template, type TemplateLine, type TemplateSummary,
} from './templates.ts';

export type Confidence = 'high' | 'medium' | 'low';

/** Where a history finding came from: this run's search, or the learned price book. */
export type HistoryOrigin =
  | { kind: 'searched' }
  | { kind: 'learned'; learnedAt: string; fromJob: string; term: string; expiresAt: string; unitMismatch: string | null };

export type AttachedFinding = HistoryFinding & { origin: HistoryOrigin };

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
  history: AttachedFinding | null;
  /** History's unit cost and the price at DB's subcontractor margin; null when history gave none. */
  historyUnitCost: Money | null;
  historyUnitPrice: Money | null;
}

/** Who put a number on a gap: DB's own past work, or a ballpark for the area. */
export type ProposalSource = 'history' | 'regional';

export interface GapProposal {
  source: ProposalSource;
  unitCost: Money;
  unitPrice: Money | null;
  cost: Money;
  price: Money | null;
}

/** A gap, plus what history says about it and the price that would follow. */
export type DraftGap = DraftReplyGap & {
  history: AttachedFinding | null;
  /** Unit cost × the gap's quantity, at the margin for its cost type. A proposal, never a total. */
  proposed: GapProposal | null;
  /** The regional ballpark per unit when the model gave one, whether or not a quantity let it total. */
  regionalUnitCost: Money | null;
  regionalUnitPrice: Money | null;
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

/** What is proposed for the gaps from one source. Shown beside the total, never inside it. */
export interface GapProposals {
  cost: Money;
  price: Money | null;
  gaps: number;
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
    /** What DB's own history proposes for the gaps. */
    proposedForGaps: GapProposals;
    /** What the regional ballpark gives the gaps history could not price. */
    regionalForGaps: GapProposals;
  };
  /** The contingency line: the policy rate on the base cost. Null for a roofing job. */
  contingency: ContingencyStep | null;
  /** The past-work step: what was searched and what came of it. Null when it did not run. */
  history: {
    terms: string[];
    report: HistoryReport;
    findings: number;
    skipped: string | null;
    /** Targets answered from the learned price book, so nothing was searched for them. */
    learned: number;
    /** Gaps that got a regional ballpark because history had nothing. */
    regional: number;
  } | null;
  usage: Usage;
  cost: number | null;
}

export interface HistorySource {
  search: (terms: string[]) => Promise<HistoryReport>;
  /**
   * Each cost type's margin as a fraction, by name ("Subcontractor" 0.3,
   * "Labor" 0.45), for pricing what history proposes at the margin JobTread
   * would apply to that line. Empty means cost only.
   */
  margins: Record<string, number>;
  /** What earlier runs learned. Absent means search everything every time. */
  learned?: LearnedStore;
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

const NO_PROPOSALS: GapProposals = { cost: ZERO, price: ZERO, gaps: 0 };

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
    totals: { base: totalsOf([]), options: [], all: totalsOf([]), proposedForGaps: NO_PROPOSALS, regionalForGaps: NO_PROPOSALS },
    contingency: null,
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
  const gaps: DraftGap[] = d.data.gaps.map((g) => ({
    ...g, history: null, proposed: null, regionalUnitCost: null, regionalUnitPrice: null,
  }));

  // ---- 3. what DB did last time, and a ballpark where it did nothing -----------
  let history: Draft['history'] = null;
  if (opts.history) {
    const allTargets = historyTargets(lines, gaps);
    const store = opts.history.learned;
    const margins = opts.history.margins;

    // What the price book already knows is applied first and not searched again.
    const learnedFindings: AttachedFinding[] = [];
    const toSearch: HistoryTarget[] = [];
    for (const t of allTargets) {
      const e = store?.lookup(t.lookBack) ?? null;
      if (!e) { toSearch.push(t); continue; }
      const unitMismatch =
        e.finding.suggestedUnitCost !== null && e.unit !== null && t.unit !== null && e.unit !== t.unit
          ? `learned per ${e.unit}; this is in ${t.unit}, so the unit cost is not carried over`
          : null;
      learnedFindings.push({
        ...e.finding,
        target: { kind: t.kind, id: t.id },
        suggestedUnitCost: unitMismatch ? null : e.finding.suggestedUnitCost,
        origin: {
          kind: 'learned', learnedAt: e.learnedAt, fromJob: e.fromJob, term: e.term,
          expiresAt: store!.expiresAt(e).toISOString(), unitMismatch,
        },
      });
    }
    attachHistory(lines, gaps, learnedFindings, margins);

    const terms = uniqueTerms(toSearch);
    let report: HistoryReport = { terms: [] };
    if (terms.length > 0) report = await opts.history.search(terms);
    const found = report.terms.some((t) => t.jobs.length > 0);
    let skipped: string | null = terms.length > 0 && !found ? 'no past DB work matched any search term' : null;
    if (!found) rememberNone(store, toSearch, evidence.jobName);

    // Who goes to the model: every searched target when something was found;
    // and every gap still without a number, so it gets a regional ballpark
    // even when history — searched now or learned earlier — has nothing.
    const forModel: HistoryTarget[] = found ? [...toSearch] : toSearch.filter((t) => t.kind === 'gap');
    gaps.forEach((g, i) => {
      const id = `gap-${i}`;
      if (g.proposed !== null || forModel.some((t) => t.id === id)) return;
      const t = allTargets.find((x) => x.id === id);
      if (!t) return;
      const h = g.history;
      forModel.push({
        ...t,
        note: h
          ? `DB's past work was already read for this (${h.origin.kind === 'learned' ? `learned ${h.origin.learnedAt.slice(0, 10)}` : 'this run'}): ${h.match}. ${h.summary} Give the regional ballpark.`
          : 'Give the regional ballpark.',
      });
    });

    let findings = 0;
    if (forModel.length > 0 && (found || forModel.some((t) => t.kind === 'gap'))) {
      const h = await runStructured(
        call,
        {
          model, system: HISTORY_SYSTEM,
          content: buildHistoryContent(d.data.summary, forModel, report),
          schema: HistorySchema, maxTokens: HISTORY_MAX_TOKENS,
        },
        'read the history',
      );
      usage = addUsage(usage, h.usage);
      addCost(h.cost);
      const searched: AttachedFinding[] = h.data.findings.map((f) => ({ ...f, origin: { kind: 'searched' } }));
      attachHistory(lines, gaps, searched, margins);
      findings = searched.length;
      remember(store, toSearch, searched, evidence.jobName);
    } else if (terms.length === 0 && forModel.length === 0 && allTargets.length > 0 && learnedFindings.length === 0) {
      skipped = 'nothing to search: no target carried a search term';
    }
    if (allTargets.length > 0) {
      const regional = gaps.filter((g) => g.regionalUnitCost !== null).length;
      history = { terms, report, findings, skipped, learned: learnedFindings.length, regional };
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

  const byOption = totalsByOption(lines);
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
    totals: {
      ...byOption,
      proposedForGaps: proposedForGaps(gaps, 'history'),
      regionalForGaps: proposedForGaps(gaps, 'regional'),
    },
    contingency: contingencyStep(evidence, d.data.contingency, byOption.base.cost, templates, byOption.options),
    history,
    usage,
    cost,
  };
}

/**
 * The contingency line for this draft: the policy rate the model chose,
 * snapped to 5 / 8 / 10, on the base-scope cost, at cost. A roofing job
 * carries none — the policy is for construction budgets. When a chosen
 * template already has the line, the step says to keep it and set the two
 * job parameters; otherwise it says how to add it by hand.
 */
export function contingencyStep(
  evidence: Pick<JobEvidence, 'jobType'>,
  reply: { rate: number; why: string } | undefined,
  base: Money,
  templates: Template[],
  options: OptionGroup[] = [],
): ContingencyStep | null {
  if ((evidence.jobType ?? '').trim().toLowerCase() === 'roofing') return null;
  const rate = chooseRate(reply?.rate);
  let line: ContingencyStep['line'] = null;
  for (const t of templates) {
    const l = contingencyLine(t);
    if (l) {
      line = { templateId: t.id, templateName: t.name, lineId: l.id, group: groupPath(t, l.groupId) };
      break;
    }
  }
  const amount = contingencyAmount(base, rate);
  // Each option's share is the difference, not rate × option cost, so base + shares rounds the same as one figure.
  const shares = options.flatMap((o) =>
    o.choices.map((c) => ({
      group: o.group,
      name: c.name,
      required: o.required,
      cost: c.totals.cost,
      amount: sub(contingencyAmount(add(base, c.totals.cost), rate), amount),
    })),
  );
  return { rate, why: reply?.why?.trim() ?? '', base, amount, options: shares, line };
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
 * Put each finding on its line or gap and price what it proposes.
 *
 * The model cites a unit cost from past lines, or — for a gap history could
 * not price — a regional ballpark; the code turns either into Money and into
 * a price at the margin JobTread applies to that line's cost type: a
 * crew-labor rate at the Labor margin, a sub's rate at the Subcontractor
 * margin. History wins over regional when both are given. A finding for an
 * id nobody asked about is dropped: it cannot be shown on anything.
 */
export function attachHistory(
  lines: DraftLine[],
  gaps: DraftGap[],
  findings: AttachedFinding[],
  margins: Record<string, number>,
): void {
  // A proposed unit price is rounded to the cent: it is read by a person, not stored by JobTread.
  const price = (cost: Money, costTypeName: string): Money | null => {
    const m = margins[costTypeName];
    if (m === undefined || m >= 1) return null;
    return roundToCents(priceFromCostAtMargin(cost, rateFromApi(m)));
  };
  const proposal = (source: ProposalSource, unitCost: Money, costTypeName: string, q: bigint): GapProposal => {
    const unitPrice = price(unitCost, costTypeName);
    return {
      source,
      unitCost,
      unitPrice,
      cost: roundToCents(mulQty(unitCost, q)),
      price: unitPrice === null ? null : roundToCents(mulQty(unitPrice, q)),
    };
  };
  const byLine = new Map(lines.map((l) => [l.lineId, l]));
  for (const f of findings) {
    if (f.target.kind === 'line') {
      const l = byLine.get(f.target.id);
      if (!l) continue;
      l.history = f;
      if (f.suggestedUnitCost !== null && f.suggestedUnitCost > 0) {
        l.historyUnitCost = moneyFromApi(f.suggestedUnitCost);
        l.historyUnitPrice = price(l.historyUnitCost, l.costTypeName);
      }
    } else {
      const m = /^gap-(\d+)$/.exec(f.target.id);
      const g = m ? gaps[Number(m[1])] : undefined;
      if (!g) continue;
      g.history = f;
      const q = g.quantity !== null && g.quantity > 0 ? qtyFromApi(g.quantity) : null;
      const regional = f.regionalUnitCost ?? null;
      if (f.suggestedUnitCost !== null && f.suggestedUnitCost > 0) {
        g.regionalUnitCost = null;
        g.regionalUnitPrice = null;
        g.proposed = q === null ? null : proposal('history', moneyFromApi(f.suggestedUnitCost), g.costType, q);
      } else if (regional !== null && regional > 0) {
        g.regionalUnitCost = moneyFromApi(regional);
        g.regionalUnitPrice = price(g.regionalUnitCost, g.costType);
        g.proposed = q === null ? null : proposal('regional', g.regionalUnitCost, g.costType, q);
      }
    }
  }
}

/**
 * Store what the search found, under every term of the target it answered.
 * The regional ballpark is not stored: the book holds DB's pricing, and a
 * guess about the area is not that.
 */
export function remember(
  store: LearnedStore | undefined,
  targets: HistoryTarget[],
  findings: AttachedFinding[],
  jobName: string,
): void {
  if (!store) return;
  const byId = new Map(targets.map((t) => [t.id, t]));
  for (const f of findings) {
    const t = byId.get(f.target.id);
    if (!t || t.lookBack.length === 0) continue;
    const { origin: _origin, ...finding } = f;
    store.remember(t.lookBack, {
      fromJob: jobName, targetName: t.name, unit: t.unit,
      finding: { ...finding, regionalUnitCost: null, regionalBasis: '' },
    });
  }
}

/** Nothing matched any term: remember that too, briefly, so the next job does not search again next week. */
function rememberNone(store: LearnedStore | undefined, targets: HistoryTarget[], jobName: string): void {
  if (!store) return;
  for (const t of targets) {
    if (t.lookBack.length === 0) continue;
    store.remember(t.lookBack, {
      fromJob: jobName, targetName: t.name, unit: t.unit,
      finding: {
        target: { kind: t.kind, id: t.id }, match: 'none',
        summary: 'No past DB work matched this when it was last searched.',
        pastWork: [], suggestedUnitCost: null, suggestionBasis: '', confidence: 'low',
        typicallySubbed: null, usualVendor: null, regionalUnitCost: null, regionalBasis: '',
      },
    });
  }
}

export function proposedForGaps(gaps: DraftGap[], source: ProposalSource): GapProposals {
  let cost = ZERO;
  let price: Money | null = ZERO;
  let n = 0;
  for (const g of gaps) {
    if (!g.proposed || g.proposed.source !== source) continue;
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
        reason: !s
          ? 'not a line in any chosen template'
          : isContingencyLine(s.t, s.l)
            ? `"${s.l.name}" is set by the contingency step from the base cost, not kept by hand`
            : `"${s.l.name}" is a time-tracking or fee line the rep does not touch`,
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

/** Totals over lines. A $0 time-tracking line is not "to price by hand": nobody types a price on it. */
export function totalsOf(lines: DraftLine[]): Totals {
  let cost = ZERO;
  let price = ZERO;
  let unpriced = 0;
  for (const l of lines) {
    cost = add(cost, l.cost);
    price = add(price, l.price);
    if (!l.priced && !l.tracking) unpriced++;
  }
  return { cost, price, lines: lines.length, unpriced };
}

/**
 * "Group — Choice" is one alternative within a group; a bare name is a
 * yes-or-no add-on. Written this way by the prompt, read this way here.
 */
export function parseOption(option: string): { group: string; choice: string | null } {
  const m = /^(.*?)\s+[—–-]\s+(.*)$/.exec(option.trim());
  if (m && m[1]!.trim() && m[2]!.trim()) return { group: m[1]!.trim(), choice: m[2]!.trim() };
  return { group: option.trim(), choice: null };
}

/** Base scope, then each option group with its choices, then everything together. */
export function totalsByOption(lines: DraftLine[]): Pick<Draft['totals'], 'base' | 'options' | 'all'> {
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
  // The choices the customer must make come before the add-ons they may decline.
  options.sort((a, b) => Number(b.required) - Number(a.required));
  return { base: totalsOf(base), options, all: totalsOf(lines) };
}
