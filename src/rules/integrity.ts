/**
 * Integrity rules: empty lines, totals reconciliation, selection-group
 * reconciliation, catalog linkage, duplicates, tax, and display settings.
 *
 * These are the checks that caught the Lincolnview problems — $0 labor lines,
 * taxable flags on a tax-exempt job — and found $2,979 on Jones_Bath/Kitchen.
 */

import {
  type Money, ZERO,
  abs, add, formatMoney, formatPercent, moneyEquals, mulRate, rateToNumber, sub,
} from '../money.ts';
import { ancestorsOf, sumLinePrices, type Estimate, type Group, type Line } from '../domain.ts';
import type { Finding, Rule } from './types.ts';

/**
 * Lines carrying no quantity, or no money, or neither.
 *
 * One card per kind, not one per line. 258761 Wright_Roof carries 22 measured
 * but unpriced lines in a roof system the customer did not take — as 22 cards
 * that buried the four findings on the estimate that mattered. The three kinds
 * are kept apart because the answer differs: a blank quantity is someone's
 * unfinished work, a quantity with no cost is an alternative that was measured
 * and never priced, and a line with neither is usually deliberate — a warranty
 * shown as included at no charge.
 *
 * The rule does not try to guess which zero was intended. It groups them so a
 * reviewer can dismiss the whole set with one glance instead of twenty-two.
 */
export const emptyLineRule: Rule = {
  id: 'line.empty',
  describes: 'No line is left with a blank quantity or zero cost',

  run({ estimate }) {
    const blankQty: typeof estimate.lines = [];
    const unpriced: typeof estimate.lines = [];
    const neither: typeof estimate.lines = [];

    for (const line of estimate.lines) {
      // A specification line legitimately carries no money — it describes scope.
      if (line.isSpecification) continue;
      const noQty = line.quantity === null || line.quantity === 0n;
      const noMoney = line.unitCost === ZERO && line.unitPrice === ZERO;
      if (!noQty && !noMoney) continue;

      if (line.quantity === null) blankQty.push(line);
      else if (noMoney && noQty) neither.push(line);
      else if (noMoney) unpriced.push(line);
      else blankQty.push(line);
    }

    const findings: Finding[] = [];

    if (blankQty.length > 0) {
      findings.push(
        emptyFinding(
          'blank quantity',
          blankQty,
          estimate,
          'The quantity field is blank, not zero. Either a measurement was meant to go in, ' +
            'or the line should come off before the customer sees it.',
          ['Send back for a quantity', 'Remove the line'],
        ),
      );
    }
    if (unpriced.length > 0) {
      findings.push(
        emptyFinding(
          'measured but not priced',
          unpriced,
          estimate,
          'These lines carry a quantity but no cost and no price. That is the shape of an ' +
            'alternative that was taken off but left in, or of an assembly that never picked ' +
            'up its pricing. Either way the customer sees the line at $0.',
          ['Price them', 'Remove them', 'Accept — an option the customer did not take'],
        ),
      );
    }
    if (neither.length > 0) {
      findings.push(
        emptyFinding(
          'no quantity and no cost',
          neither,
          estimate,
          'No quantity, no cost, no price. Often deliberate — a warranty or inclusion shown ' +
            'at no charge — but it reads to a reviewer as something left undone.',
          ['Accept — included at no charge', 'Remove the line'],
        ),
      );
    }
    return findings;
  },

  passMessage({ estimate }) {
    return `No blank or zero-value lines among ${estimate.lines.length}`;
  },
};

function emptyFinding(
  kind: string,
  lines: Line[],
  estimate: Estimate,
  detail: string,
  actions: string[],
): Finding {
  const single = lines.length === 1;
  const groupName = (l: Line) => estimate.groupsById.get(l.groupId ?? '')?.name;
  const groups = new Set(lines.map((l) => groupName(l)).filter(Boolean));
  const where = groups.size === 1 ? ` in ${[...groups][0]}` : '';

  return {
    rule: 'line.empty',
    severity: 'data',
    title: single
      ? `${lines[0]!.name} has ${kind === 'blank quantity' ? 'no quantity' : kind}`
      : `${lines.length} lines${where} — ${kind}`,
    detail,
    lineIds: lines.map((l) => l.id),
    math: single
      ? [
          {
            label: 'quantity',
            value: lines[0]!.quantity === null ? '(blank)' : formatQuantity(lines[0]!.quantity!),
          },
          { label: 'unit cost', value: formatMoney(lines[0]!.unitCost) },
          { label: 'extension', value: formatMoney(lines[0]!.price) },
        ]
      : lines.slice(0, 8).map((l) => ({
          label: l.name,
          value: l.quantity === null ? '(blank quantity)' : `${formatQuantity(l.quantity)} ${l.unitName ?? ''}`.trim(),
        })),
    actions,
  };
}

function formatQuantity(millionths: bigint): string {
  const n = Number(millionths) / 1e6;
  return Number.isInteger(n) ? String(n) : n.toFixed(2);
}

/**
 * The document total must equal the sum of what is actually included.
 *
 * Selection groups make this non-trivial: a document with an options group
 * carries lines for every branch but totals only the chosen one. `isSelected`
 * is false on every line of the observed estimate including the branch that IS
 * counted, so it cannot be trusted to say which branch won.
 *
 * So this rule reconciles rather than assumes: it searches for a set of option
 * branches whose combined price is exactly the shortfall. One branch is not
 * enough — 258761 Wright_Roof is short by $12,758.56, which is Full Shingle
 * Roof Removal ($8,996.86) plus the Platinum warranty ($2,220.00) plus an
 * unselected upgrade ($1,541.70), three separate groups. Matching on a single
 * branch reported that estimate as double-counted when it reconciles exactly.
 *
 * Anything the branches cannot explain is a real discrepancy.
 */
export const totalsRule: Rule = {
  id: 'totals.reconcile',
  describes: 'Document total reconciles against the sum of line extensions',

  run({ estimate }) {
    const sumAll = sumLinePrices(estimate.lines);
    const diff = sub(sumAll, estimate.statedPrice) as Money;

    if (moneyEquals(sumAll, estimate.statedPrice)) return [];

    const branches = selectionBranches(estimate);
    if (explainedBy(branches, diff)) return []; // expected shape — see passMessage

    return [
      {
        rule: 'totals.reconcile',
        severity: 'pricing',
        title: 'Document total does not match the sum of its lines',
        detail:
          'The stored total and the sum of line extensions disagree by an amount that no ' +
          'combination of unselected option branches accounts for. Something is either ' +
          'double-counted or missing.',
        impact: diff,
        math: [
          { label: 'sum of all line extensions', value: formatMoney(sumAll) },
          { label: 'document total', value: formatMoney(estimate.statedPrice) },
          { label: 'unexplained difference', value: formatMoney(abs(diff)), emphasis: true },
          ...branches.map((b) => ({
            label: `option branch: ${b.name}`,
            value: formatMoney(b.total),
          })),
        ],
        actions: ['Open in JobTread and reconcile'],
      },
    ];
  },

  passMessage({ estimate }) {
    const sumAll = sumLinePrices(estimate.lines);
    if (moneyEquals(sumAll, estimate.statedPrice)) {
      return `Total matches the sum of line extensions (${formatMoney(estimate.statedPrice)})`;
    }
    const diff = sub(sumAll, estimate.statedPrice) as Money;
    const excluded = explainedBy(selectionBranches(estimate), diff);
    if (!excluded) return null;
    const names = excluded.map((b) => `"${b.name}"`).join(', ');
    return (
      `Option alternates counted once — ${names} correctly excluded ` +
      `(${formatMoney(diff)} of ${formatMoney(sumAll)})`
    );
  },
};

/**
 * The set of branches whose prices sum to `diff`, or null if none does.
 *
 * Exhaustive over subsets, which is only safe because the count is small: the
 * largest real document seen carries nine branches. Above BRANCH_LIMIT the
 * search is abandoned rather than allowed to run 2^n — an auditor that hangs
 * on a big estimate is worse than one that says it cannot tell.
 *
 * Prefers the smallest explanation: with two subsets summing to the same
 * amount, the one naming fewer groups is likelier to be what happened, and is
 * the one a reviewer can check by eye.
 */
const BRANCH_LIMIT = 16;

interface Branch {
  name: string;
  total: Money;
  lines: Line[];
}

/**
 * The lines JobTread left out of the document total.
 *
 * Derived from the reconciliation rather than from `isSelected`, which reads
 * false on every line of every document sampled — including the branches that
 * ARE counted — and so says nothing. What the totals prove is what gets used.
 *
 * Empty when the difference cannot be explained: better to compute tax against
 * everything and be visibly wrong than to silently exclude a guess.
 */
export function excludedLines(estimate: Estimate): Set<string> {
  const diff = sub(sumLinePrices(estimate.lines), estimate.statedPrice) as Money;
  if (diff === ZERO) return new Set();
  const match = explainedBy(selectionBranches(estimate), diff);
  if (!match) return new Set();
  return new Set(match.flatMap((b) => b.lines.map((l) => l.id)));
}

function explainedBy(branches: Branch[], diff: Money): Branch[] | null {
  if (diff === ZERO) return [];
  if (branches.length === 0 || branches.length > BRANCH_LIMIT) return null;

  let best: Branch[] | null = null;
  for (let mask = 1; mask < 1 << branches.length; mask++) {
    let sum = ZERO;
    let count = 0;
    for (let i = 0; i < branches.length; i++) {
      if (mask & (1 << i)) {
        sum = add(sum, branches[i]!.total);
        count++;
      }
    }
    if (!moneyEquals(sum, diff)) continue;
    if (best === null || count < best.length) {
      best = branches.filter((_, i) => mask & (1 << i));
    }
  }
  return best;
}

/**
 * The things a selection group chooses between, each with its price.
 *
 * A selection group offers its alternatives in one of two shapes, and both
 * occur on the same document:
 *
 *   - as child GROUPS  — "Shingle Removal" picks between "Partial Shingle Roof
 *                        Removal" and "Full Shingle Roof Removal"
 *   - as direct LINES  — "Standing Seam Roof Warranties" picks between two
 *                        warranty lines; "Upgrades" (min 0) offers one line
 *                        that may simply not be taken
 *
 * Walking only the child groups missed two of the three branches excluded from
 * Wright_Roof, so the document read as un-reconcilable. Zero-priced branches
 * are dropped: they explain no difference and double the search space.
 */
function selectionBranches(estimate: Estimate): Branch[] {
  const selectionGroups = estimate.groups.filter((g) => g.isSelectionGroup);
  if (selectionGroups.length === 0) return [];

  const branches: Branch[] = [];
  for (const g of selectionGroups) {
    const children = estimate.groups.filter((c) => c.parentId === g.id);

    for (const child of children) {
      const lines = estimate.lines.filter((l) => isUnder(estimate, l.groupId, child.id));
      const total = lines.reduce((acc, l) => add(acc, l.price), ZERO);
      if (total !== ZERO) branches.push({ name: child.name, total, lines });
    }

    for (const line of estimate.lines.filter((l) => l.groupId === g.id)) {
      if (line.price !== ZERO) {
        branches.push({ name: line.name, total: line.price, lines: [line] });
      }
    }
  }
  return branches;
}

function isUnder(estimate: Estimate, groupId: string | null, ancestorId: string): boolean {
  if (!groupId) return false;
  if (groupId === ancestorId) return true;
  return ancestorsOf(estimate, groupId).some((g: Group) => g.id === ancestorId);
}

/** Every line should trace back to a catalog item, or its price came from nowhere. */
export const catalogLinkRule: Rule = {
  id: 'catalog.unlinked',
  describes: 'Every line traces back to a catalog item',

  run({ estimate }) {
    const orphans = estimate.lines.filter((l) => !l.catalogItemId && !l.isSpecification);
    if (orphans.length === 0) return [];
    return [
      {
        rule: 'catalog.unlinked',
        severity: 'data',
        title: `${orphans.length} line${orphans.length === 1 ? '' : 's'} not linked to a catalog item`,
        detail:
          'A line with no catalog link was typed by hand. Its price is not governed by the ' +
          'catalog, it will not pick up a price update, and it cannot be compared against history.',
        lineIds: orphans.map((l) => l.id),
        math: orphans.slice(0, 8).map((l) => ({ label: l.name, value: formatMoney(l.price) })),
        actions: ['Link to a catalog item', 'Accept — one-off line'],
      },
    ];
  },

  passMessage({ estimate }) {
    const n = estimate.lines.length;
    return `Every line tied to a catalog item (${n}/${n})`;
  },
};

/**
 * The tax charged must equal the rate times what is actually being sold.
 *
 * Verified against 258761 Wright_Roof, which is the reason this rule can
 * exist: 57 of its 101 lines are taxable and total $30,491.21, but JobTread
 * charges $1,958.35 rather than the $2,088.65 that base implies. The $130.30
 * difference is tax on $1,902.11 of taxable lines sitting in option branches
 * the customer did not take. Against the selected base the arithmetic closes
 * to the cent.
 *
 * So this is a real check and not a restatement of JobTread's own sum: a
 * taxable flag out of step with what is charged, or a rate that changed after
 * the lines were priced, shows up here and nowhere else. It was the shape of
 * the Lincolnview problem — taxable flags left on for a tax-exempt customer.
 */
export const taxReconcileRule: Rule = {
  id: 'tax.reconcile',
  describes: 'Tax charged matches the rate applied to the taxable lines',

  run({ estimate }) {
    const charged = sub(estimate.statedPriceWithTax, estimate.statedPrice) as Money;
    const { base, expected } = taxBasis(estimate);

    // No rate and no charge is the org's normal case, not a finding.
    if (estimate.taxRate === 0n && charged === ZERO) return [];
    if (moneyEquals(expected, charged, 2)) return [];

    const overcharged = charged > expected;
    return [
      {
        rule: 'tax.reconcile',
        severity: 'pricing',
        title: overcharged
          ? 'The customer is charged more tax than the taxable lines come to'
          : 'The customer is charged less tax than the taxable lines come to',
        detail:
          `Tax on this document is ${formatMoney(charged)}, but ${formatPercent(estimate.taxRate)} ` +
          `of the taxable lines that are actually being sold comes to ${formatMoney(expected)}. ` +
          'Either a line is flagged taxable that should not be, or the rate changed after the ' +
          'lines were priced.',
        impact: sub(expected, charged) as Money,
        math: [
          { label: 'taxable base (selected lines)', value: formatMoney(base) },
          { label: `× rate ${formatPercent(estimate.taxRate)}`, value: formatMoney(expected) },
          { label: 'tax actually charged', value: formatMoney(charged) },
          {
            label: 'difference',
            value: formatMoney(abs(sub(expected, charged) as Money)),
            emphasis: true,
          },
        ],
        actions: ['Check the taxable flags', 'Check the tax rate', 'Open in JobTread'],
      },
    ];
  },

  passMessage({ estimate }) {
    const charged = sub(estimate.statedPriceWithTax, estimate.statedPrice) as Money;
    if (estimate.taxRate === 0n && charged === ZERO) return null; // the tax rule says this
    const { base } = taxBasis(estimate);
    // A rate set with nothing taxable charges nothing. That is the normal shape
    // for roofing labor on real property, but it is worth saying out loud
    // rather than reporting as a reconciliation of zero against zero.
    if (base === ZERO) {
      return (
        `Rate of ${formatPercent(estimate.taxRate)} is set but no line is taxable, ` +
        `so no tax is charged`
      );
    }
    return (
      `Tax reconciles: ${formatPercent(estimate.taxRate)} of ${formatMoney(base)} ` +
      `is ${formatMoney(charged)}`
    );
  },
};

/** The taxable base actually being sold, and the tax it implies. */
function taxBasis(estimate: Estimate): { base: Money; expected: Money } {
  const excluded = excludedLines(estimate);
  const base = estimate.lines
    .filter((l) => l.isTaxable && !excluded.has(l.id))
    .reduce((acc, l) => add(acc, l.price), ZERO);
  return { base, expected: mulRate(base, estimate.taxRate) };
}

/**
 * Tax.
 *
 * The org convention is tax off, but 80,462 of 176,156 cost items across the
 * org are taxable and 60 documents carry a rate — so "taxable" is not itself an
 * error. What is an error is inconsistency within one document, and a taxRate
 * that looks like a percentage rather than a fraction.
 *
 * Until a CPA sets the rule (docs/ROADMAP.md 19.3) this rule reports, it does
 * not prescribe.
 */
export const taxRule: Rule = {
  id: 'tax.inconsistent',
  describes: 'Taxability is consistent across the document',

  run({ estimate }) {
    const findings: Finding[] = [];
    const taxable = estimate.lines.filter((l) => l.isTaxable);
    const rate = estimate.taxRate;

    // taxRate is constrained to [0,1]. A value above 0.25 is far more likely to
    // be a percentage typed into a fraction field than a real rate.
    if (rate > 250_000n) {
      findings.push({
        rule: 'tax.rate-suspicious',
        severity: 'pricing',
        title: `Tax rate reads ${formatPercent(rate)}`,
        detail:
          'taxRate is a fraction between 0 and 1, so 7.25% is 0.0725. A rate this high is ' +
          'almost certainly a percentage entered into a fraction field — a 100× error.',
        math: [{ label: 'taxRate', value: String(rateToNumber(rate)), emphasis: true }],
        actions: ['Check the rate in JobTread'],
      });
    }

    if (taxable.length > 0 && rate === 0n) {
      // Context, not an ask. Across approved customer orders there are 4,170
      // cost items carrying a taxable flag on a document with no rate, and
      // ZERO carrying one on a document that has a rate — only 4 of 802
      // approved orders have a rate at all. The flag is the create-time default
      // and it has never changed what a customer was charged. Raising it per
      // estimate asks a reviewer to clean up a field that does nothing; if the
      // flags are ever worth clearing it is one bulk job, not twenty cards.
      findings.push({
        rule: 'tax.inconsistent',
        severity: 'info',
        title: `${taxable.length} line${taxable.length === 1 ? ' is' : 's are'} marked taxable, but no tax is charged`,
        detail:
          'The document has no tax rate, so these flags change nothing the customer pays. ' +
          'New cost items default to taxable, which is where they come from. Worth a bulk ' +
          'cleanup one day; not worth stopping this estimate for.',
        lineIds: taxable.map((l) => l.id),
        math: taxable.slice(0, 5).map((l) => ({ label: l.name, value: 'taxable' })),
        actions: ['Leave it', 'Clear the taxable flags'],
      });
    }

    if (taxable.length > 0 && taxable.length < estimate.lines.length && rate > 0n) {
      findings.push({
        rule: 'tax.partial',
        severity: 'info',
        title: `${taxable.length} of ${estimate.lines.length} lines are taxable`,
        detail: 'A mixed-taxability document. Worth confirming that split is deliberate.',
        lineIds: taxable.map((l) => l.id),
      });
    }

    return findings;
  },

  passMessage({ estimate }) {
    const taxable = estimate.lines.filter((l) => l.isTaxable).length;
    if (taxable === 0 && estimate.taxRate === 0n) {
      return `Tax off on every line, document rate 0% (${estimate.lines.length} lines)`;
    }
    if (taxable === estimate.lines.length && estimate.taxRate > 0n) {
      return `All lines taxable at ${formatPercent(estimate.taxRate)}`;
    }
    return null;
  },
};

/** Same catalog item, same unit price, more than once — often a paste error. */
export const duplicateRule: Rule = {
  id: 'line.duplicate',
  describes: 'No duplicated lines',

  run({ estimate }) {
    const seen = new Map<string, typeof estimate.lines>();
    for (const l of estimate.lines) {
      if (!l.catalogItemId) continue;
      const key = `${l.catalogItemId}|${l.unitPrice}|${l.groupId ?? ''}`;
      const arr = seen.get(key) ?? [];
      arr.push(l);
      seen.set(key, arr);
    }
    const dupes = [...seen.values()].filter((g) => g.length > 1);
    if (dupes.length === 0) return [];

    return dupes.map((group) => ({
      rule: 'line.duplicate',
      severity: 'data' as const,
      title: `${group[0]!.name} appears ${group.length} times in the same group at the same price`,
      detail:
        'The same catalog item at the same unit price, repeated within one group. Legitimate ' +
        'when two rooms genuinely need the same thing, a paste error otherwise.',
      impact: group.slice(1).reduce((acc, l) => add(acc, l.price), ZERO),
      lineIds: group.map((l) => l.id),
      math: group.map((l) => ({
        label: `qty ${l.quantity === null ? '(blank)' : Number(l.quantity) / 1e6}`,
        value: formatMoney(l.price),
      })),
      actions: ['Remove the duplicate', 'Accept — both are real'],
    }));
  },

  passMessage() {
    return 'No duplicate lines found';
  },
};

/**
 * Display settings that change what the customer sees.
 *
 * Not errors, but the kind of thing discovered after sending. showChildCosts
 * true means every line price is itemised on the proposal.
 */
/**
 * Customer-facing display settings.
 *
 * Rewritten after the first shadow run over 20 approved estimates, where these
 * checks produced 31 of 87 findings and every one of them was wrong. They were
 * written from the brief rather than from the book, and they turned out to be
 * describing how Deitemeyer Brothers works rather than finding anything amiss.
 *
 * Counted across all 802 approved customer orders:
 *
 *   456 (57%)  require no signature — and every one was accepted
 *   658 (82%)  show line prices to the customer
 *    71  (9%)  match what these rules used to call correct
 *
 * The signature check is gone. It asserted that a customer order without a
 * signature requirement cannot be accepted, and there are 456 counterexamples;
 * a rule resting on a false premise does not get demoted, it gets deleted.
 *
 * Itemised line prices are now context rather than an ask. They are the house
 * style, and a reviewer told 18 times out of 20 that the house style is a
 * finding stops reading the findings.
 *
 * Profit visibility stays an ask. It is rare and it leaks margin.
 *
 * The general rule, which cost 31 false positives to learn: a check that fires
 * on the majority of work the company has already sold is measuring a
 * convention, not a defect. Prevalence has to be measured before a check is
 * allowed to interrupt anyone.
 */
export const displayRule: Rule = {
  id: 'display.customer-visible',
  describes: 'Customer-facing display settings are as intended',

  run({ estimate }) {
    const findings: Finding[] = [];
    if (estimate.showChildCosts) {
      const total = sumLinePrices(estimate.lines);
      findings.push({
        rule: 'display.customer-visible',
        severity: 'info',
        title: 'Line prices are visible to the customer',
        detail:
          `showChildCosts is on, so the proposal itemises all ${estimate.lines.length} line ` +
          'prices rather than showing group totals only. This is how 82% of approved work ' +
          'here is presented, so it is almost certainly deliberate.',
        math: [
          { label: 'lines itemised', value: String(estimate.lines.length) },
          { label: 'total shown', value: formatMoney(total) },
        ],
        actions: ['Hide line prices', 'Leave shown — the usual presentation'],
      });
    }
    if (estimate.showProfit) {
      findings.push({
        rule: 'display.profit-visible',
        severity: 'display',
        title: 'Profit is visible to the customer',
        detail: 'showProfit is on. This exposes margin on a customer-facing document.',
        actions: ['Turn off showProfit'],
      });
    }
    return findings;
  },

  passMessage({ estimate }) {
    if (estimate.showProfit) return null;
    return estimate.showChildCosts
      ? 'Profit hidden from the customer'
      : 'Customer view: line prices hidden, profit hidden';
  },
};
