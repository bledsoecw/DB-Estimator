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

import { type Money, ZERO, add, moneyFromApi, mulQty, qtyFromApi, roundToCents } from '../money.ts';
import type { JobEvidence } from './evidence.ts';
import {
  DEFAULT_MODEL, NO_USAGE, addUsage, runStructured, type StructuredCall, type Usage,
} from './model.ts';
import {
  DraftSchema, MAX_PICKS, PICK_SYSTEM, DRAFT_SYSTEM, PickSchema,
  buildDraftContent, buildPickContent,
  type DraftReply, type DraftReplyGap, type DraftReplyQuestion, type PickReply,
} from './prompt.ts';
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
  basis: string;
  evidence: { source: string; quote: string }[];
  option: string | null;
  confidence: Confidence;
}

export type DraftGap = DraftReplyGap;
export type DraftQuestion = DraftReplyQuestion;

export interface Totals {
  cost: Money;
  price: Money;
  lines: number;
  unpriced: number;
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
  totals: { base: Totals; options: { name: string; totals: Totals }[]; all: Totals };
  usage: Usage;
  cost: number | null;
}

export interface DraftOptions {
  model?: string;
  /** Skip the picker and use these templates, first as primary. */
  templateIds?: string[];
}

const PICK_MAX_TOKENS = 8_000;
const DRAFT_MAX_TOKENS = 32_000;

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
    totals: { base: totalsOf([]), options: [], all: totalsOf([]) },
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
    gaps: d.data.gaps,
    questions: d.data.questions,
    rejected,
    rejectedPicks,
    totals: totalsByOption(lines),
    usage,
    cost,
  };
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
      basis: r.basis,
      evidence: r.evidence,
      option: r.option?.trim() || null,
      confidence: r.confidence,
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

/** Base scope, then each option on its own, then everything together. */
export function totalsByOption(lines: DraftLine[]): Draft['totals'] {
  const base = lines.filter((l) => l.option === null);
  const names = [...new Set(lines.map((l) => l.option).filter((o): o is string => o !== null))];
  return {
    base: totalsOf(base),
    options: names.map((name) => ({ name, totals: totalsOf(lines.filter((l) => l.option === name)) })),
    all: totalsOf(lines),
  };
}
