/**
 * The catalog is the price of record. A line should match it.
 *
 * This is the check the auditor should have started with. The cost types are
 * org-wide defaults — four numbers for a catalog of thousands — and every real
 * exception has to be argued about and written down somewhere. The catalog is
 * where the intent already lives, item by item: Designer at x1.25 because
 * design is billed at a rate, HOVER at cost because it is a pass-through,
 * fasteners at x1.667 because the sub supplies them and carries the markup.
 * None of that needs a rule. It needs reading.
 *
 * So a line is judged against its own catalog item, and the cost-type policy is
 * the fallback for lines that have no catalog item to be judged against.
 *
 * What it catches that nothing else could: 22PdGwy32ycX carried Aluminum
 * Fascia Install at $7.20 where the catalog says $7.2727. Same cost, different
 * price — somebody typed over it. Against the cost type that is seven cents of
 * rounding noise and correctly ignored. Against the catalog it is a line that
 * no longer says what the company decided it says, which is the whole question
 * a reviewer is trying to answer.
 *
 * Compared on the MULTIPLIER, not the price. Costs move — a line written in
 * March holds March's cost and that is not an error. What should not move is
 * the markup on top of it.
 */

import {
  type Money, type Rate, ZERO,
  abs, add, formatMoney, formatMultiplier, formatPercent, mulQty, rateEquals,
  roundToCents, sub,
} from '../money.ts';
import type { CatalogItem, Line } from '../domain.ts';
import type { Finding, Rule } from './types.ts';

/**
 * Tolerance on the multiplier.
 *
 * Wider than it looks necessary, and deliberately so: both multipliers are
 * derived from prices stored to the cent, so a cheap item quantizes hard. At a
 * $2.58 unit cost, one cent of price is 0.004 of multiplier. Tighter than this
 * and the rule reports rounding as tampering.
 */
const MULT_TOLERANCE = 5_000n; // 0.005

/** Below this, the money does not justify a card. Same floor as the markup rule. */
const MIN_IMPACT = 250_000n as Money; // $25

interface Drift {
  line: Line;
  item: CatalogItem;
  expectedUnitPrice: Money;
  impact: Money;
}

export const catalogRule: Rule = {
  id: 'catalog.drift',
  describes: 'Every line is priced as its catalog item says',

  run({ estimate, catalog }) {
    // An empty catalog means it was not fetched, not that nothing matches.
    if (catalog.size === 0) return [];

    const drifts = measure(estimate.lines, catalog);
    if (drifts.length === 0) return [];

    // One card per catalog item, however many lines it appears on.
    const byItem = new Map<string, Drift[]>();
    for (const d of drifts) {
      const bucket = byItem.get(d.item.id) ?? [];
      bucket.push(d);
      byItem.set(d.item.id, bucket);
    }

    const findings: Finding[] = [];
    for (const group of byItem.values()) {
      const total = group.reduce((acc, d) => add(acc, d.impact), ZERO);
      if (abs(total) < MIN_IMPACT) continue;
      findings.push(driftFinding(group, total));
    }
    return findings.sort((a, b) => Number(abs(b.impact ?? ZERO) - abs(a.impact ?? ZERO)));
  },

  passMessage({ estimate, catalog }) {
    if (catalog.size === 0) return null; // not fetched — say nothing rather than "clean"
    const linked = estimate.lines.filter((l) => l.catalogItemId && catalog.has(l.catalogItemId));
    if (linked.length === 0) return null;
    return `All ${linked.length} catalog-linked lines priced as the catalog says`;
  },

  suppressed({ estimate, catalog }) {
    if (catalog.size === 0) {
      const linked = estimate.lines.filter((l) => l.catalogItemId).length;
      return linked === 0
        ? null
        : `Catalog prices were not captured, so ${linked} lines could not be checked against them`;
    }
    const quiet = measure(estimate.lines, catalog).filter((d) => abs(d.impact) < MIN_IMPACT);
    if (quiet.length === 0) return null;
    const money = quiet.reduce((acc, d) => add(acc, abs(d.impact)), ZERO);
    return (
      `${quiet.length} line${quiet.length === 1 ? '' : 's'} off the catalog price by less ` +
      `than ${formatMoney(MIN_IMPACT)} each, ${formatMoney(money)} in total — not raised`
    );
  },
};

function measure(lines: Line[], catalog: Map<string, CatalogItem>): Drift[] {
  const drifts: Drift[] = [];
  for (const line of lines) {
    if (!line.catalogItemId) continue;
    const item = catalog.get(line.catalogItemId);
    if (!item) continue;
    if (item.multiplier === null || line.multiplier === null) continue;
    if (line.unitCost === ZERO) continue;
    if (rateEquals(line.multiplier, item.multiplier, MULT_TOLERANCE)) continue;

    // The line's own cost at the catalog's markup: what this line would cost
    // the customer if it followed the catalog. Not the catalog's own price —
    // the cost may legitimately have moved since.
    const expectedUnitPrice = mulQty(line.unitCost, item.multiplier);
    const qty = line.quantity ?? 0n;
    const impact = sub(roundToCents(mulQty(expectedUnitPrice, qty)), line.price) as Money;
    if (impact === ZERO) continue;

    drifts.push({ line, item, expectedUnitPrice, impact });
  }
  return drifts;
}

function driftFinding(group: Drift[], total: Money): Finding {
  const first = group[0]!;
  const { line, item } = first;
  const under = total > ZERO;
  const renamed = line.name !== item.name;

  return {
    rule: 'catalog.drift',
    severity: 'pricing',
    title:
      `${line.name} is priced ${under ? 'below' : 'above'} its catalog item` +
      (group.length > 1 ? ` on ${group.length} lines` : ''),
    detail:
      `The catalog prices this at ${formatMultiplier(item.multiplier!)} ` +
      `(${formatPercent(marginOfMultiplier(item.multiplier!))} margin). This line is at ` +
      `${formatMultiplier(line.multiplier!)}. Somebody changed the price after it came off ` +
      `the catalog.` +
      (renamed ? ` The catalog item is called "${item.name}".` : ''),
    impact: total,
    lineIds: group.map((d) => d.line.id),
    math: [
      { label: 'catalog', value: `${formatMoney(item.unitCost)} → ${formatMoney(item.unitPrice)}` },
      {
        label: `this line at the catalog's markup`,
        value: `${formatMoney(line.unitCost)} → ${formatMoney(first.expectedUnitPrice)}`,
      },
      { label: 'priced as drafted', value: formatMoney(line.unitPrice) },
      { label: under ? 'short' : 'over', value: formatMoney(abs(total)), emphasis: true },
    ],
    actions: [
      'Reprice to the catalog',
      'Accept — priced differently for this job',
      'Change the catalog instead',
    ],
  };
}

/** g = (k - 1) / k, for display. */
function marginOfMultiplier(mult: Rate): Rate {
  if (mult === 0n) return 0n as Rate;
  return (((mult - 1_000_000n) * 1_000_000n) / mult) as Rate;
}
