/**
 * Markup conformance.
 *
 * Every priced line is checked against its cost type's policy multiplier, read
 * live from JobTread. When Carl changed Subcontractor to 30% margin on
 * 2026-09-28, this rule started flagging every catalog line still carrying the
 * old x1.30 with no code change here.
 *
 * The policy is a margin. The line carries a multiplier. Confusing the two is
 * the error this whole project exists to prevent, so both are always shown.
 */

import {
  type Money, type Rate, ZERO,
  abs, add, formatMoney, formatMultiplier, formatPercent,
  marginFromMultiplier, moneyEquals, mulQty, priceFromCostAtMargin, rateEquals,
  roundToCents, sub,
} from '../money.ts';
import type { Rule, Finding } from './types.ts';

/** Tolerance on the multiplier: 0.0005, i.e. half a tenth of a percent. */
const MULT_TOLERANCE = 500n;

/** Impacts below this are noise, not findings. */
const MIN_IMPACT = 100n as Money; // one cent

export const markupRule: Rule = {
  id: 'markup.off-policy',
  describes: 'Every priced line matches its cost type’s margin policy',

  run({ estimate, policy }) {
    const findings: Finding[] = [];

    for (const line of estimate.lines) {
      if (line.unitCost === ZERO) continue; // zero-cost lines are the empty-line rule's business
      const p = policy.byCostTypeId.get(line.costTypeId);
      if (!p) continue;
      if (p.margin === 0n) continue; // Clock In: cost passes through at cost, by policy
      if (line.multiplier === null) continue;
      if (rateEquals(line.multiplier, p.multiplier, MULT_TOLERANCE)) continue;

      // One exact division from the stored margin. Not cost x quantized-multiplier,
      // and not rounded to cents — unitPrice carries 4 decimal places.
      const expectedUnitPrice = priceFromCostAtMargin(line.unitCost, p.margin);
      const qty = line.quantity ?? 0n;
      const expectedExtension = roundToCents(mulQty(expectedUnitPrice, qty));
      const impact = sub(expectedExtension, line.price) as Money;
      if (abs(impact) < MIN_IMPACT) continue;

      const observedMargin = marginFromMultiplier(line.multiplier);
      const under = impact > ZERO;

      findings.push({
        rule: 'markup.off-policy',
        severity: 'pricing',
        title: `${line.name} is priced ${under ? 'below' : 'above'} the ${p.name} policy`,
        detail:
          `Priced at ${formatMultiplier(line.multiplier)} (${formatPercent(observedMargin)} margin). ` +
          `${p.name} policy is ${formatPercent(p.margin)} margin, which is ` +
          `${formatMultiplier(p.multiplier)}.`,
        impact,
        lineIds: [line.id],
        math: [
          {
            label: `cost ${formatMoney(line.unitCost)} × ${formatMultiplier(p.multiplier).slice(1)}`,
            value: formatMoney(expectedUnitPrice),
          },
          { label: 'priced as drafted', value: formatMoney(line.unitPrice) },
          ...(qty !== 1_000_000n
            ? [{ label: `× quantity ${Number(qty) / 1e6}`, value: '' }]
            : []),
          {
            label: under ? 'short' : 'over',
            value: formatMoney(abs(impact)),
            emphasis: true,
          },
        ],
        actions: [
          'Reprice to policy',
          'Accept — set deliberately',
          ...(line.catalogItemId ? ['Fix the catalog item too'] : []),
        ],
      });
    }

    return findings.sort((a, b) => Number(abs(b.impact ?? ZERO) - abs(a.impact ?? ZERO)));
  },

  passMessage({ estimate, policy }) {
    const checked = estimate.lines.filter(
      (l) => l.unitCost !== ZERO && policy.byCostTypeId.has(l.costTypeId),
    );
    if (checked.length === 0) return null;
    const byType = new Map<string, number>();
    for (const l of checked) byType.set(l.costTypeName, (byType.get(l.costTypeName) ?? 0) + 1);
    const parts = [...byType.entries()].map(([n, c]) => `${c} ${n}`).join(', ');
    return `All ${checked.length} priced lines at policy (${parts})`;
  },
};

/**
 * Document-level margin, reported as context rather than a pass/fail.
 *
 * Used by the report and by the comparables rule.
 */
export function documentMargin(price: Money, cost: Money): Rate {
  if (price === ZERO) return 0n as Rate;
  return ((sub(price, cost) * 1_000_000n) / price) as Rate;
}

/** Total of every negative (underpriced) impact across a finding list. */
export function sumUnderpriced(findings: Finding[]): Money {
  return findings.reduce(
    (acc, f) => (f.impact && f.impact > ZERO ? add(acc, f.impact) : acc),
    ZERO,
  );
}

export { moneyEquals };
