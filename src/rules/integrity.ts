/**
 * Integrity rules: empty lines, totals reconciliation, selection-group
 * reconciliation, catalog linkage, duplicates, tax, and display settings.
 *
 * These are the checks that caught the Lincolnview problems — $0 labor lines,
 * taxable flags on a tax-exempt job — and found $2,979 on Jones_Bath/Kitchen.
 */

import {
  type Money, ZERO,
  abs, add, formatMoney, formatPercent, moneyEquals, rateToNumber, sub,
} from '../money.ts';
import { ancestorsOf, sumLinePrices, type Estimate, type Group } from '../domain.ts';
import type { Finding, Rule } from './types.ts';

/** A line with no quantity and no money on it is either unfinished or should be removed. */
export const emptyLineRule: Rule = {
  id: 'line.empty',
  describes: 'No line is left with a blank quantity or zero cost',

  run({ estimate }) {
    const findings: Finding[] = [];
    for (const line of estimate.lines) {
      const noQty = line.quantity === null || line.quantity === 0n;
      const noMoney = line.unitCost === ZERO && line.unitPrice === ZERO;
      if (!noQty && !noMoney) continue;
      // A specification line legitimately carries no money — it describes scope.
      if (line.isSpecification) continue;

      const what =
        noQty && noMoney
          ? 'has no quantity and no cost'
          : noQty
            ? 'has no quantity'
            : 'has no cost or price';

      findings.push({
        rule: 'line.empty',
        severity: 'data',
        title: `${line.name} ${what}`,
        detail:
          line.quantity === null
            ? 'The quantity field is blank, not zero. Either hours were meant to go in, or the line should come off before the customer sees it.'
            : 'Zero quantity at zero cost contributes nothing to the estimate and reads as an omission to a reviewer.',
        lineIds: [line.id],
        math: [
          { label: 'quantity', value: line.quantity === null ? '(blank)' : String(Number(line.quantity) / 1e6) },
          { label: 'unit cost', value: formatMoney(line.unitCost) },
          { label: 'extension', value: formatMoney(line.price) },
        ],
        actions: ['Remove the line', 'Send back for a quantity'],
      });
    }
    return findings;
  },

  passMessage({ estimate }) {
    return `No blank or zero-value lines among ${estimate.lines.length}`;
  },
};

/**
 * The document total must equal the sum of what is actually included.
 *
 * Selection groups make this non-trivial: a document with an options group
 * carries lines for every branch but totals only the chosen one. `isSelected`
 * is false on every line of the observed estimate including the branch that IS
 * counted, so it cannot be trusted to say which branch won.
 *
 * So this rule reconciles rather than assumes. If the shortfall is exactly the
 * price of one branch of a selection group, that is the expected shape and the
 * check passes with an explanation. Anything else is a real discrepancy.
 */
export const totalsRule: Rule = {
  id: 'totals.reconcile',
  describes: 'Document total reconciles against the sum of line extensions',

  run({ estimate }) {
    const sumAll = sumLinePrices(estimate.lines);
    const diff = sub(sumAll, estimate.statedPrice) as Money;

    if (moneyEquals(sumAll, estimate.statedPrice)) return [];

    const branches = selectionBranches(estimate);
    const match = branches.find((b) => moneyEquals(b.total, diff));
    if (match) return []; // expected shape — explained in passMessage

    return [
      {
        rule: 'totals.reconcile',
        severity: 'pricing',
        title: 'Document total does not match the sum of its lines',
        detail:
          'The stored total and the sum of line extensions disagree by an amount that is not ' +
          'explained by an unselected option branch. Something is either double-counted or missing.',
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
    const match = selectionBranches(estimate).find((b) => moneyEquals(b.total, diff));
    return match
      ? `Option alternates counted once — "${match.name}" correctly excluded (${formatMoney(match.total)})`
      : null;
  },
};

/** Each immediate child branch of a selection group, with its total price. */
function selectionBranches(estimate: Estimate): { name: string; total: Money }[] {
  const selectionGroupIds = new Set(
    estimate.groups.filter((g) => g.isSelectionGroup).map((g) => g.id),
  );
  if (selectionGroupIds.size === 0) return [];

  const branches: { name: string; total: Money }[] = [];
  for (const g of estimate.groups) {
    if (!g.parentId || !selectionGroupIds.has(g.parentId)) continue;
    const total = estimate.lines
      .filter((l) => isUnder(estimate, l.groupId, g.id))
      .reduce((acc, l) => add(acc, l.price), ZERO);
    if (total !== ZERO) branches.push({ name: g.name, total });
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
      findings.push({
        rule: 'tax.inconsistent',
        severity: 'data',
        title: `${taxable.length} line${taxable.length === 1 ? ' is' : 's are'} marked taxable but the document rate is 0%`,
        detail:
          'Either the lines should not be taxable, or the document is missing its rate. ' +
          'Note that new cost items default to taxable, so this can happen without anyone choosing it.',
        lineIds: taxable.map((l) => l.id),
        math: taxable.slice(0, 8).map((l) => ({ label: l.name, value: 'taxable' })),
        actions: ['Clear the taxable flags', 'Set the document tax rate'],
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
export const displayRule: Rule = {
  id: 'display.customer-visible',
  describes: 'Customer-facing display settings are as intended',

  run({ estimate }) {
    const findings: Finding[] = [];
    if (estimate.showChildCosts) {
      const total = sumLinePrices(estimate.lines);
      findings.push({
        rule: 'display.customer-visible',
        severity: 'display',
        title: 'Line prices are visible to the customer',
        detail:
          `showChildCosts is on, so the proposal itemises all ${estimate.lines.length} line ` +
          'prices rather than showing group totals only.',
        math: [
          { label: 'lines itemised', value: String(estimate.lines.length) },
          { label: 'total shown', value: formatMoney(total) },
        ],
        actions: ['Hide line prices', 'Leave shown — customer asked for detail'],
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
    if (!estimate.requireSignature && estimate.type === 'customerOrder') {
      findings.push({
        rule: 'display.no-signature',
        severity: 'display',
        title: 'Signature is not required',
        detail: 'A customer order without a signature requirement cannot be accepted in JobTread.',
        actions: ['Turn on requireSignature'],
      });
    }
    return findings;
  },

  passMessage({ estimate }) {
    return estimate.requireSignature && !estimate.showProfit && !estimate.showChildCosts
      ? 'Customer view: line prices hidden, profit hidden, signature required'
      : null;
  },
};
