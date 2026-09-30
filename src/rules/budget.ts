/**
 * Document-vs-budget drift.
 *
 * A customer order is built from the job budget, and from then on the two are
 * separate records: editing a budget line changes nothing on a document already
 * built from it. On 261457 Hunnaman_Window the rep edited the budget on Sep 25
 * and Sep 29 — the Window line went from $653.90 to $617.17 cost and picked up
 * a Wellcraft spec — and then asked for the estimate to be reviewed. The
 * document had not been touched since Sep 1, and the customer had already
 * viewed it twice. Every other check passed, because the document's own
 * arithmetic was clean. It just was not the document the rep meant.
 *
 * Every document line carries `jobCostItem`, the budget line it was built from,
 * so the comparison is a join. Two kinds of drift, in the order they matter:
 *
 *   - a budget line that sits on NO document of the job: added to the budget
 *     after the document was built, and the customer has never seen it at all
 *   - a linked line whose name, quantity, unit cost, unit price or description
 *     differs from its budget line
 *
 * "No document" is read from `documentCostItems.count`, not from this
 * document alone. A job with a change order carries the change order's lines
 * in the same budget, and those are not missing from the estimate — they were
 * never meant to be on it.
 *
 * The org's job template adds three groups to every budget — CLOCK IN ITEMS,
 * BURDEN and GENERAL AND ADMINISTRATIVE — full of zero-cost lines that exist
 * for time tracking and never go on a document. They are set aside, and the
 * rule says so. A line in one of those groups that carries money is NOT set
 * aside: a priced processing fee the customer has not seen is exactly the
 * finding.
 */

import { type Money, ZERO, abs, add, formatMoney, sub } from '../money.ts';
import type { Budget, BudgetItem, BudgetLine, Estimate, Line } from '../domain.ts';
import type { Finding, Rule } from './types.ts';

/** Zero-cost groups the job template adds to every budget. Matched on name. */
const TEMPLATE_GROUPS = new Set(['CLOCK IN ITEMS', 'BURDEN', 'GENERAL AND ADMINISTRATIVE']);

/** Rows shown per kind of drift before "+N more". */
const MAX_ROWS = 8;

interface Drift {
  line: Line;
  budget: BudgetLine;
  /** What moved, document → budget, e.g. "cost $653.90 → $617.17". */
  changes: string[];
  /** Budget extension minus document extension: positive when the customer sees less than the budget says. */
  delta: Money;
}

interface Comparison {
  /** Document lines with a budget line to compare against. */
  linked: number;
  unlinked: Line[];
  drifted: Drift[];
  /** Budget lines on no document of the job. */
  added: BudgetItem[];
  /** Budget lines carried by another document of the job, not this one. */
  elsewhere: BudgetItem[];
  /** Zero-cost template lines set aside. */
  ignored: BudgetItem[];
  /** The budget as it applies to this document: template filler and other documents' lines excluded. */
  budgetTotal: Money;
}

/**
 * One pass, shared by run(), passMessage() and suppressed(), so what is raised
 * and what is reported as set aside can never disagree.
 */
function compare(estimate: Estimate, budget: Budget): Comparison {
  const unlinked: Line[] = [];
  const drifted: Drift[] = [];
  const referenced = new Set<string>();
  let linked = 0;

  for (const line of estimate.lines) {
    if (!line.budget) {
      unlinked.push(line);
      continue;
    }
    linked++;
    referenced.add(line.budget.id);
    const changes = changesBetween(line, line.budget);
    if (changes.length > 0) {
      drifted.push({ line, budget: line.budget, changes, delta: sub(line.budget.price, line.price) });
    }
  }

  const added: BudgetItem[] = [];
  const elsewhere: BudgetItem[] = [];
  const ignored: BudgetItem[] = [];
  let budgetTotal = ZERO;
  for (const item of budget.lines) {
    if (isTemplateFiller(item)) {
      ignored.push(item);
      continue;
    }
    if (referenced.has(item.id)) {
      budgetTotal = add(budgetTotal, item.price);
      continue;
    }
    if (item.documentLines > 0) {
      elsewhere.push(item);
      continue;
    }
    added.push(item);
    budgetTotal = add(budgetTotal, item.price);
  }

  return { linked, unlinked, drifted, added, elsewhere, ignored, budgetTotal };
}

function changesBetween(line: Line, b: BudgetLine): string[] {
  const changes: string[] = [];
  if (line.name.trim() !== b.name.trim()) changes.push(`name "${line.name}" → "${b.name}"`);
  if (line.quantity !== b.quantity) {
    changes.push(`qty ${formatQty(line.quantity)} → ${formatQty(b.quantity)}`);
  }
  if (line.unitCost !== b.unitCost) {
    changes.push(`cost ${formatMoney(line.unitCost)} → ${formatMoney(b.unitCost)}`);
  }
  if (line.unitPrice !== b.unitPrice) {
    changes.push(`price ${formatMoney(line.unitPrice)} → ${formatMoney(b.unitPrice)}`);
  }
  // Only when both were captured. A description that differs by whitespace
  // alone renders the same to the customer and is not a change.
  if (
    line.description !== null &&
    b.description !== null &&
    squash(line.description) !== squash(b.description)
  ) {
    changes.push('description changed');
  }
  return changes;
}

const squash = (s: string): string => s.replace(/\s+/g, ' ').trim();

function formatQty(q: bigint | null): string {
  if (q === null) return '(blank)';
  const n = Number(q) / 1e6;
  return Number.isInteger(n) ? String(n) : n.toFixed(2);
}

/** The group that makes a budget line template filler, or null. */
function templateGroupOf(item: BudgetItem): string | null {
  if (item.cost !== ZERO || item.price !== ZERO) return null;
  for (const name of item.groupPath) {
    if (TEMPLATE_GROUPS.has(name.trim().toUpperCase())) return name.trim().toUpperCase();
  }
  return null;
}

const isTemplateFiller = (item: BudgetItem): boolean => templateGroupOf(item) !== null;

const plural = (n: number, one: string, many = `${one}s`): string => (n === 1 ? one : many);

export const budgetDriftRule: Rule = {
  id: 'budget.drift',
  describes: 'Document lines still match the job budget lines they were built from',

  run({ estimate, budget }) {
    if (!budget) return [];
    const c = compare(estimate, budget);
    if (c.drifted.length === 0 && c.added.length === 0) return [];
    return [driftFinding(estimate, c)];
  },

  passMessage({ estimate, budget }) {
    if (!budget) {
      return 'Budget not captured with this document — drift from the job budget not checked';
    }
    const c = compare(estimate, budget);
    if (c.linked === 0) return 'No line is linked to a budget line, so there is nothing to compare';
    const diff = sub(c.budgetTotal, estimate.statedPrice);
    const totals =
      diff === ZERO
        ? ''
        : `; totals still differ — budget ${formatMoney(c.budgetTotal)}, document ` +
          `${formatMoney(estimate.statedPrice)} — in lines the budget does not govern`;
    return `Document matches its budget on all ${c.linked} ${plural(c.linked, 'line')}${totals}`;
  },

  suppressed({ estimate, budget }) {
    if (!budget) return null;
    const c = compare(estimate, budget);
    const parts: string[] = [];

    if (c.unlinked.length > 0) {
      const names = c.unlinked.slice(0, 3).map((l) => l.name).join(', ');
      parts.push(
        `${c.unlinked.length} ${plural(c.unlinked.length, 'line')} not linked to a budget line — ` +
          `not compared (${names}${c.unlinked.length > 3 ? ', …' : ''})`,
      );
    }
    if (c.ignored.length > 0) {
      const present = new Set(c.ignored.map((i) => templateGroupOf(i)));
      const groups = [...TEMPLATE_GROUPS].filter((g) => present.has(g));
      parts.push(
        `${c.ignored.length} zero-cost template ${plural(c.ignored.length, 'line')} in ` +
          `${groups.join(', ')} set aside`,
      );
    }
    if (c.elsewhere.length > 0) {
      parts.push(
        `${c.elsewhere.length} budget ${plural(c.elsewhere.length, 'line')} carried by another ` +
          `document on this job — not counted as missing from this one`,
      );
    }
    return parts.length > 0 ? parts.join('; ') : null;
  },
};

function driftFinding(estimate: Estimate, c: Comparison): Finding {
  const n = c.drifted.length;
  const m = c.added.length;

  const title =
    n > 0 && m > 0
      ? `${n} ${plural(n, 'line')} no longer ${plural(n, 'matches', 'match')} the job budget, ` +
        `and ${m} budget ${plural(m, 'line is', 'lines are')} not on the document`
      : m > 0
        ? `${m} budget ${plural(m, 'line is', 'lines are')} not on the document`
        : n === 1
          ? `${c.drifted[0]!.line.name} no longer matches the job budget`
          : `${n} lines no longer match the job budget`;

  const impact = add(
    c.drifted.reduce((acc, d) => add(acc, d.delta), ZERO),
    c.added.reduce((acc, i) => add(acc, i.price), ZERO),
  );
  const diff = sub(c.budgetTotal, estimate.statedPrice);

  const more = (count: number, kind: string) =>
    count > MAX_ROWS ? [{ label: `    +${count - MAX_ROWS} more ${kind}`, value: '' }] : [];

  return {
    rule: 'budget.drift',
    severity: 'pricing',
    title,
    detail:
      'The job budget was edited after this document was built from it, and the document ' +
      'was not rebuilt. The customer sees the document, so it no longer says what the rep ' +
      'now intends' +
      (m > 0 ? ' — and part of the budget the customer has never seen at all.' : '.') +
      ' Rebuild the document from the budget, or confirm the budget change was not meant ' +
      'for the customer.',
    impact,
    lineIds: c.drifted.map((d) => d.line.id),
    math: [
      { label: 'document total (what the customer sees)', value: formatMoney(estimate.statedPrice) },
      { label: 'job budget total', value: formatMoney(c.budgetTotal) },
      {
        label:
          diff === ZERO
            ? 'difference'
            : diff > ZERO
              ? 'document short of the budget'
              : 'document above the budget',
        value: formatMoney(abs(diff)),
        emphasis: true,
      },
      ...c.added.slice(0, MAX_ROWS).map((i) => ({
        label: `not on the document: ${i.name}`,
        value: formatMoney(i.price),
      })),
      ...more(m, 'not on the document'),
      ...c.drifted.slice(0, MAX_ROWS).map((d) => ({
        label: `${d.line.name}: ${d.changes.join(', ')}`,
        value: `${formatMoney(d.line.price)} → ${formatMoney(d.budget.price)}`,
      })),
      ...more(n, 'changed'),
    ],
    actions: [
      'Rebuild the document from the budget',
      'Accept — the budget change is not for the customer',
      'Open in JobTread',
    ],
  };
}
