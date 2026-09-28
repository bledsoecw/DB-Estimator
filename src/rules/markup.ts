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
 *
 * ---
 *
 * The first version of this rule raised one finding per line and produced 42
 * on 258740 Daeger_Roof — an estimate that was approved and sold — and 32 on
 * 258761 Wright_Roof. At that volume nobody reads it, so the rule is worse
 * than nothing. Three things were wrong, and all three are handled here:
 *
 *  1. CENT ROUNDING was read as a policy breach. Drip Edge costs $6.97, so
 *     policy at x1.45 is $10.1065 and the catalog carries $10.10. Over 39
 *     units that is 25 cents, and it was a card. Materials is priced at
 *     exactly x1.45 on 68 of 68 lines across two roofing estimates — every
 *     Materials finding the rule raised was an artifact of its own arithmetic.
 *
 *  2. ONE CATALOG ITEM APPEARING ON SIX LINES was six findings. "1235 Install
 *     Standing Seam Trim" appeared three times on one estimate, each its own
 *     card with its own third of the money.
 *
 *  3. A COST TYPE WHOSE LINES ALL DEVIATE is not N mistakes. On roofing,
 *     Labor never hits its configured 45% margin: Daeger runs 29 of 35 lines
 *     at x1.45, Wright runs 16 at x1.80 and 13 at x1.45 and none at x1.8182.
 *     On the GC estimate the same rule fits fine (6 of 8 Labor lines at
 *     policy). Roofing lines come out of the assembly engine, which prices to
 *     its own schedule. Whether that schedule or the cost-type setting is the
 *     real policy is Carl's call, so the rule states the measurement once
 *     rather than asserting an answer 29 times.
 *
 * Nothing suppressed is hidden: the pass message accounts for every line and
 * every dollar the rule chose not to raise a card for.
 */

import {
  type Money, type Rate, ZERO,
  abs, add, formatMoney, formatMultiplier, formatPercent,
  marginFromMultiplier, moneyEquals, mulQty, priceFromCostAtMargin,
  roundToCents, sub,
} from '../money.ts';
import type { Line } from '../domain.ts';
import type { Rule, Finding } from './types.ts';

/**
 * A unit price within this of policy is at policy.
 *
 * The catalog stores prices to the cent, and policy prices rarely land on one:
 * $6.97 at x1.45 is $10.1065. The gap that creates is arithmetic, not a
 * pricing decision, and it is the same size whether the line is right or
 * wrong — so it cannot be evidence either way.
 */
const UNIT_PRICE_TOLERANCE = 100n as Money; // one cent

/**
 * A catalog item's total deviation must reach this to earn a card.
 *
 * Below it the finding costs more attention than the money it recovers. The
 * suppressed total is still reported, so this hides nothing — it only decides
 * what is worth interrupting a reviewer for.
 */
const MIN_IMPACT = 250_000n as Money; // $25

/** Below this many priced lines, "most of them deviate" is not evidence. */
const SYSTEMIC_MIN_LINES = 5;

/** At or above this share, the cost type's policy is the question, not the lines. */
const SYSTEMIC_SHARE = 2 / 3;

interface Deviation {
  line: Line;
  impact: Money;
  expectedUnitPrice: Money;
  multiplier: Rate;
}

interface Analysis {
  findings: Finding[];
  checked: number;
  atPolicy: number;
  /** Deviations real enough to measure but too small to interrupt anyone for. */
  quiet: Deviation[];
}

/**
 * One pass over the estimate, shared by run() and suppressed().
 *
 * They have to agree: if what run() raises and what suppressed() reports were
 * computed separately they would drift, and the drift would be a silent hole
 * exactly where the rule promises there is none.
 */
function analyse(
  lines: Line[],
  policy: { byCostTypeId: Map<string, { name: string; margin: Rate; multiplier: Rate }> },
): Analysis {
  const { deviations, checkedByType } = measure(lines, policy);
  const findings: Finding[] = [];
  const quiet: Deviation[] = [];

  for (const [costTypeId, devs] of groupBy(deviations, (d) => d.line.costTypeId)) {
    const p = policy.byCostTypeId.get(costTypeId)!;
    const checked = checkedByType.get(costTypeId) ?? 0;

    if (checked >= SYSTEMIC_MIN_LINES && devs.length / checked >= SYSTEMIC_SHARE) {
      findings.push(systemicFinding(p, devs, checked));
      continue;
    }

    for (const group of byCatalogItem(devs)) {
      const total = group.reduce((acc, d) => add(acc, d.impact), ZERO);
      if (abs(total) < MIN_IMPACT) {
        quiet.push(...group);
        continue;
      }
      findings.push(itemFinding(p, group, total));
    }
  }

  const checked = [...checkedByType.values()].reduce((a, b) => a + b, 0);
  return {
    findings: findings.sort((a, b) => Number(abs(b.impact ?? ZERO) - abs(a.impact ?? ZERO))),
    checked,
    atPolicy: checked - deviations.length,
    quiet,
  };
}

export const markupRule: Rule = {
  id: 'markup.off-policy',
  describes: 'Every priced line matches its cost type’s margin policy',

  run({ estimate, policy }) {
    return analyse(estimate.lines, policy).findings;
  },

  passMessage({ estimate, policy }) {
    const { checked, atPolicy } = analyse(estimate.lines, policy);
    if (checked === 0) return null;
    return atPolicy === checked
      ? `All ${checked} priced lines at policy`
      : `${atPolicy} of ${checked} priced lines at policy`;
  },

  suppressed({ estimate, policy }) {
    const { quiet, checked, atPolicy } = analyse(estimate.lines, policy);
    if (quiet.length === 0) return null;
    const money = quiet.reduce((acc, d) => add(acc, abs(d.impact)), ZERO);
    return (
      `${quiet.length} line${quiet.length === 1 ? '' : 's'} off policy by less than ` +
      `${formatMoney(MIN_IMPACT)} each, ${formatMoney(money)} in total — not raised ` +
      `(${atPolicy} of ${checked} priced lines are exactly at policy)`
    );
  },
};

/** Every line whose price is not its policy price, and how many were checked. */
function measure(
  lines: Line[],
  policy: { byCostTypeId: Map<string, { name: string; margin: Rate; multiplier: Rate }> },
): { deviations: Deviation[]; checkedByType: Map<string, number> } {
  const deviations: Deviation[] = [];
  const checkedByType = new Map<string, number>();

  for (const line of lines) {
    if (line.unitCost === ZERO) continue; // the empty-line rule's business
    const p = policy.byCostTypeId.get(line.costTypeId);
    if (!p) continue;
    if (p.margin === 0n) continue; // Clock In: cost passes through at cost, by policy
    if (line.multiplier === null) continue;

    checkedByType.set(line.costTypeId, (checkedByType.get(line.costTypeId) ?? 0) + 1);

    // One exact division from the stored margin. Not cost x quantized-multiplier,
    // and not rounded to cents — unitPrice carries 4 decimal places.
    const expectedUnitPrice = priceFromCostAtMargin(line.unitCost, p.margin);
    if (moneyEquals(line.unitPrice, expectedUnitPrice, Number(UNIT_PRICE_TOLERANCE / 100n))) {
      continue;
    }

    const qty = line.quantity ?? 0n;
    const expectedExtension = roundToCents(mulQty(expectedUnitPrice, qty));
    const impact = sub(expectedExtension, line.price) as Money;
    if (impact === ZERO) continue;

    deviations.push({ line, impact, expectedUnitPrice, multiplier: line.multiplier });
  }

  return { deviations, checkedByType };
}

/**
 * One finding for a cost type whose lines do not follow its configured policy.
 *
 * Reports the rates actually in use rather than repeating "off policy" once per
 * line, because the useful question is which schedule is right.
 */
function systemicFinding(
  p: { name: string; margin: Rate; multiplier: Rate },
  devs: Deviation[],
  checked: number,
): Finding {
  const total = devs.reduce((acc, d) => add(acc, d.impact), ZERO);
  // Cluster at two decimals. Finer than that and cent-rounded catalog prices
  // split one rate into several: x1.4500, x1.4496 and x1.4520 are the same
  // decision priced against different unit costs, and showing them as three
  // rates hides the fact that there are really only two.
  const clusters = [...groupBy(devs, (d) => (Number(d.multiplier) / 1e6).toFixed(2))]
    .map(([rate, ds]) => ({
      rate,
      n: ds.length,
      money: ds.reduce((acc, d) => add(acc, d.impact), ZERO),
      margin: marginFromMultiplier(
        ds.reduce((acc, d) => acc + d.multiplier, 0n) / BigInt(ds.length) as Rate,
      ),
    }))
    .sort((a, b) => b.n - a.n);

  const under = total > ZERO;
  return {
    rule: 'markup.off-policy',
    severity: 'pricing',
    title: `${p.name} lines are not priced at the ${p.name} policy`,
    detail:
      `${devs.length} of ${checked} priced ${p.name} lines sit off the configured ` +
      `${formatPercent(p.margin)} margin, and they cluster on ` +
      `${clusters.length === 1 ? 'one rate' : `${clusters.length} rates`} rather than scattering. ` +
      `That is a question about which schedule is the policy, not ${devs.length} separate mistakes.`,
    impact: total,
    lineIds: devs.map((d) => d.line.id),
    math: [
      ...clusters.map((c) => ({
        label: `×${c.rate} (${formatPercent(c.margin)} margin) on ${c.n} line${c.n === 1 ? '' : 's'}`,
        value: formatMoney(abs(c.money)),
      })),
      {
        label: `configured policy ${formatMultiplier(p.multiplier)}`,
        value: formatPercent(p.margin),
      },
      {
        label: under ? 'total short of policy' : 'total above policy',
        value: formatMoney(abs(total)),
        emphasis: true,
      },
    ],
    actions: [
      `Confirm the ${p.name} policy`,
      'Reprice all to the configured policy',
      'Accept — the schedule is right, the setting is stale',
    ],
  };
}

/** One finding for one catalog item, however many lines it appears on. */
function itemFinding(
  p: { name: string; margin: Rate; multiplier: Rate },
  group: Deviation[],
  total: Money,
): Finding {
  const first = group[0]!;
  const line = first.line;
  const under = total > ZERO;
  const qty = group.reduce((acc, d) => acc + (d.line.quantity ?? 0n), 0n);

  return {
    rule: 'markup.off-policy',
    severity: 'pricing',
    title:
      `${line.name} is priced ${under ? 'below' : 'above'} the ${p.name} policy` +
      (group.length > 1 ? ` on ${group.length} lines` : ''),
    detail:
      `Priced at ${formatMultiplier(first.multiplier)} ` +
      `(${formatPercent(marginFromMultiplier(first.multiplier))} margin). ` +
      `${p.name} policy is ${formatPercent(p.margin)} margin, which is ` +
      `${formatMultiplier(p.multiplier)}.`,
    impact: total,
    lineIds: group.map((d) => d.line.id),
    math: [
      {
        label: `cost ${formatMoney(line.unitCost)} × ${formatMultiplier(p.multiplier).slice(1)}`,
        value: formatMoney(first.expectedUnitPrice),
      },
      { label: 'priced as drafted', value: formatMoney(line.unitPrice) },
      ...(qty !== 1_000_000n
        ? [{ label: 'quantity', value: formatQty(qty) + (group.length > 1 ? ` over ${group.length} lines` : '') }]
        : []),
      { label: under ? 'short' : 'over', value: formatMoney(abs(total)), emphasis: true },
    ],
    actions: [
      'Reprice to policy',
      'Accept — set deliberately',
      ...(line.catalogItemId ? ['Fix the catalog item too'] : []),
    ],
  };
}

/**
 * Deviations grouped by the catalog item behind them.
 *
 * Unlinked lines fall back to name plus unit price: two hand-typed lines with
 * the same name and the same wrong price are the same mistake made twice, and
 * collapsing them says so more clearly than two identical cards.
 */
function byCatalogItem(devs: Deviation[]): Deviation[][] {
  return [
    ...groupBy(devs, (d) =>
      d.line.catalogItemId ?? `${d.line.name}@${d.line.unitPrice}@${d.line.costTypeId}`,
    ).values(),
  ];
}

function groupBy<T, K>(items: T[], key: (item: T) => K): Map<K, T[]> {
  const out = new Map<K, T[]>();
  for (const item of items) {
    const k = key(item);
    const bucket = out.get(k);
    if (bucket) bucket.push(item);
    else out.set(k, [item]);
  }
  return out;
}

function formatQty(millionths: bigint): string {
  const n = Number(millionths) / 1e6;
  return Number.isInteger(n) ? String(n) : n.toFixed(2);
}

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
