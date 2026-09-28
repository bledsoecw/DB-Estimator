/**
 * Margin against comparable approved jobs.
 *
 * This is the "sanity" layer from the three-layer design: deterministic rules
 * for policy, comparables for sanity, a human for the handful that fall outside.
 * It never asserts a number is wrong — only that it sits outside what this
 * company has actually sold at this size.
 */

import { type Rate, formatMoney, formatPercent } from '../money.ts';
import { marginOf } from '../domain.ts';
import type { Comparable } from '../domain.ts';
import type { Finding, Rule } from './types.ts';

/** Below this many comparables the band is not evidence of anything. */
const MIN_COMPARABLES = 4;

export const comparablesRule: Rule = {
  id: 'margin.outside-band',
  describes: 'Margin sits inside the range of comparable approved jobs',

  run({ estimate, comparables }) {
    if (comparables.length < MIN_COMPARABLES) return [];

    const margin = marginOf(estimate.statedPrice, estimate.statedCost);
    const sorted = [...comparables].sort((a, b) => Number(a.margin - b.margin));
    const lo = sorted[0]!.margin;
    const hi = sorted[sorted.length - 1]!.margin;
    const median = medianOf(sorted.map((c) => c.margin));

    if (margin >= lo && margin <= hi) return [];

    const above = margin > hi;
    return [
      {
        rule: 'margin.outside-band',
        severity: 'info',
        title: `Margin is ${above ? 'above' : 'below'} every comparable job`,
        detail: above
          ? `At ${formatPercent(margin)} this is the highest of ${comparables.length} approved jobs in ` +
            `its price band. Not a problem — but if it was priced high to leave negotiating ` +
            `room, that should be a decision rather than an accident.`
          : `At ${formatPercent(margin)} this is below all ${comparables.length} approved jobs in its ` +
            `price band. Worth knowing what is different about this job before it goes out.`,
        math: [
          { label: 'this estimate', value: formatPercent(margin), emphasis: true },
          { label: `comparables (${comparables.length})`, value: `${formatPercent(lo)} – ${formatPercent(hi)}` },
          { label: 'median', value: formatPercent(median) },
          ...sorted
            .slice()
            .reverse()
            .slice(0, 8)
            .map((c) => ({ label: c.jobName, value: formatPercent(c.margin) })),
        ],
        actions: above ? ['Confirm it is deliberate'] : ['Review before sending'],
      },
    ];
  },

  passMessage({ estimate, comparables }) {
    if (comparables.length < MIN_COMPARABLES) {
      return comparables.length === 0
        ? null
        : `Only ${comparables.length} comparable jobs in this price band — too few to judge margin against`;
    }
    const margin = marginOf(estimate.statedPrice, estimate.statedCost);
    const margins = comparables.map((c) => c.margin).sort((a, b) => Number(a - b));
    return (
      `Margin ${formatPercent(margin)} sits inside the band from ${comparables.length} comparable ` +
      `approved jobs (${formatPercent(margins[0]!)} – ${formatPercent(margins[margins.length - 1]!)})`
    );
  },
};

export function medianOf(rates: Rate[]): Rate {
  if (rates.length === 0) return 0n as Rate;
  const s = [...rates].sort((a, b) => Number(a - b));
  const mid = Math.floor(s.length / 2);
  return (s.length % 2 === 1 ? s[mid]! : ((s[mid - 1]! + s[mid]!) / 2n)) as Rate;
}

/** Band summary for the report header. */
export function marginBand(comparables: Comparable[]): {
  lo: Rate;
  hi: Rate;
  median: Rate;
  n: number;
} | null {
  if (comparables.length === 0) return null;
  const margins = comparables.map((c) => c.margin).sort((a, b) => Number(a - b));
  return {
    lo: margins[0]!,
    hi: margins[margins.length - 1]!,
    median: medianOf(margins),
    n: comparables.length,
  };
}

export { formatMoney };
