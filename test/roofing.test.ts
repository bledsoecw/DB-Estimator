/**
 * The two roofing estimates, captured live on 2026-09-28.
 *
 * These exist because the GC fixture could not exercise three things:
 *
 *   258740 Daeger_Roof   (22PPQD68bhaX)  67 lines, tax rate 7.25%, APPROVED
 *   258761 Wright_Roof   (22PNhaVC26Ma) 101 lines, tax rate 6.85%, denied
 *
 * Wright crosses JobTread's 100-item page cap, so it is the only proof the
 * pagination is right. Both carry a tax rate where Jones_Bath/Kitchen is zero
 * rated. And both come out of the assembly engine, which prices to a different
 * schedule than the cost-type settings — which is what turned the first
 * version of the markup rule into 42 findings on an estimate that had already
 * been sold.
 *
 * Every number below was worked out against the raw fixture before the rules
 * were changed to produce it.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { fromFixture, sumLinePrices } from '../src/domain.ts';
import { audit } from '../src/rules/index.ts';
import { formatMoney, formatPercent, mulRate, sub, type Money } from '../src/money.ts';
import { usableComparables } from '../src/rules/comparables.ts';
import type { AuditFixture } from '../src/jobtread/types.ts';

const load = (name: string) =>
  JSON.parse(
    readFileSync(new URL(`./fixtures/${name}.json`, import.meta.url), 'utf8'),
  ) as AuditFixture;

const daeger = fromFixture(load('daeger-roof'));
const wright = fromFixture(load('wright-roof'));

// ---- pagination -------------------------------------------------------------

test('Wright_Roof crosses the 100-item page cap intact', () => {
  // The whole reason for this fixture. JobTread pages cost items at 100; this
  // document has 101, so a broken pager loses exactly one line and the
  // estimate still looks plausible.
  assert.equal(wright.estimate.lines.length, 101);
  assert.equal(new Set(wright.estimate.lines.map((l) => l.id)).size, 101, 'duplicate ids');
  assert.equal(wright.estimate.groups.length, 11);
});

// ---- reconciliation ---------------------------------------------------------

test('Daeger_Roof totals with no options to account for', () => {
  assert.equal(formatMoney(daeger.estimate.statedPrice), '$32,251.65');
  assert.equal(formatMoney(sumLinePrices(daeger.estimate.lines)), '$32,251.65');
});

test('Wright_Roof reconciles through three unselected branches, not one', () => {
  // $93,310.80 of lines against an $80,552.24 total. The $12,758.56 gap is
  // Full Shingle Roof Removal ($8,996.86) + Platinum Metals 20 Warranty
  // ($2,220.00) + SS Steel Roof Texture ($1,541.70), in three separate groups.
  // Matching a single branch reported this document as double-counted.
  const gap = sub(sumLinePrices(wright.estimate.lines), wright.estimate.statedPrice);
  assert.equal(formatMoney(gap), '$12,758.56');

  const result = audit(wright);
  assert.equal(
    result.findings.filter((f) => f.rule === 'totals.reconcile').length,
    0,
    'reported a reconcilable document as broken',
  );
  const passed = result.passed.find((p) => p.rule === 'totals.reconcile');
  assert.ok(passed, 'no reconciliation message');
  for (const branch of [
    'Full Shingle Roof Removal',
    'Platinum Metals 20 Warranty',
    'SS Steel Roof Texture',
  ]) {
    assert.ok(passed.message.includes(branch), `did not name ${branch}`);
  }
});

// ---- tax --------------------------------------------------------------------

test('Wright_Roof tax is charged on the selected lines only', () => {
  const e = wright.estimate;
  assert.equal(formatPercent(e.taxRate), '6.85%');

  const allTaxable = e.lines.filter((l) => l.isTaxable);
  assert.equal(allTaxable.length, 57);

  const charged = sub(e.statedPriceWithTax, e.statedPrice) as Money;
  assert.equal(formatMoney(charged), '$1,958.35');

  // Taxing every taxable line overstates it by $130.30 — tax on $1,902.11 of
  // taxable lines inside branches the customer did not take.
  const naiveBase = allTaxable.reduce((a, l) => (a + l.price) as Money, 0n as Money);
  assert.equal(formatMoney(mulRate(naiveBase, e.taxRate)), '$2,088.6479');

  assert.equal(
    audit(wright).findings.filter((f) => f.rule === 'tax.reconcile').length,
    0,
    'the selected-base tax calculation does not close',
  );
});

test('Daeger_Roof carries a rate with nothing taxable under it', () => {
  const e = daeger.estimate;
  assert.equal(formatPercent(e.taxRate), '7.25%');
  assert.equal(e.lines.filter((l) => l.isTaxable).length, 0);
  assert.equal(formatMoney(sub(e.statedPriceWithTax, e.statedPrice) as Money), '$0.00');

  // Said plainly rather than reported as zero reconciling against zero.
  const passed = audit(daeger).passed.find((p) => p.rule === 'tax.reconcile');
  assert.ok(passed);
  assert.match(passed.message, /no line is taxable/);
});

// ---- the noise floor --------------------------------------------------------

test('an approved estimate does not produce a wall of findings', () => {
  // Daeger_Roof was approved and sold. The first version of these rules raised
  // 46 findings on it, 42 of them markup, several worth under a dollar. At
  // that volume the auditor is not read, so this is a correctness property and
  // not a preference.
  const result = audit(daeger);
  const needsHuman = result.findings.filter((f) => f.severity !== 'info');
  assert.ok(
    needsHuman.length <= 8,
    `${needsHuman.length} findings: ${needsHuman.map((f) => f.title).join(' | ')}`,
  );
});

test('Wright_Roof stays readable despite 101 lines and 22 unpriced ones', () => {
  const result = audit(wright);
  const needsHuman = result.findings.filter((f) => f.severity !== 'info');
  assert.ok(
    needsHuman.length <= 8,
    `${needsHuman.length} findings: ${needsHuman.map((f) => f.title).join(' | ')}`,
  );
  // The 22 measured-but-unpriced EF panel lines are one card, not 22.
  const empties = result.findings.filter((f) => f.rule === 'line.empty');
  assert.ok(empties.length <= 3, `${empties.length} empty-line findings`);
  assert.ok(empties.some((f) => (f.lineIds?.length ?? 0) > 10), 'did not collapse the EF lines');
});

// ---- the systemic finding ---------------------------------------------------

test('roofing Labor is reported as one policy question, not 35 mistakes', () => {
  // Measured against the raw fixture: 35 priced Labor lines, none at the
  // configured x1.8182. 29 at x1.45, 5 at x1.81, 1 at x1.47. On the GC
  // estimate the same cost type sits at policy on 6 of 8 lines, so this is
  // specific to the assembly engine's schedule, not a broken rule.
  const labor = audit(daeger).findings.filter(
    (f) => f.rule === 'markup.off-policy' && f.title.includes('Labor'),
  );
  assert.equal(labor.length, 1, 'Labor did not collapse to a single finding');
  assert.equal(formatMoney(labor[0]!.impact!), '$3,943.17');
  assert.equal(labor[0]!.lineIds!.length, 35);
  assert.match(labor[0]!.detail, /35 of 35/);
  // It asks rather than asserts: the setting may be what is stale.
  assert.ok(labor[0]!.actions!.some((a) => /Confirm the Labor policy/.test(a)));
});

test('Materials is at policy on every roofing line, and raises nothing', () => {
  // 27 of 27 on Daeger and 41 of 41 on Wright, at exactly x1.45. Every
  // Materials finding the first version raised — Drip Edge, Step Flashing,
  // Aluminum Trim Coil — was its own cent-rounding, not a pricing decision.
  for (const [name, input] of [['daeger', daeger], ['wright', wright]] as const) {
    const materials = audit(input).findings.filter(
      (f) => f.rule === 'markup.off-policy' && f.title.includes('Materials'),
    );
    assert.equal(materials.length, 0, `${name} raised ${materials.length} Materials findings`);
  }
});

// ---- comparables ------------------------------------------------------------

test('jobs with no recorded cost are kept out of the margin band', () => {
  // The band read 0.00%–99.66% across 50 comparables and passed everything.
  // 260471 Doctor_Roof Damage records $28,751.83 of price against $98.68 of
  // cost; 260245 Sidle_Roof records price exactly equal to cost.
  const { usable, dropped } = usableComparables(daeger.comparables);
  assert.equal(daeger.comparables.length, 50);
  assert.equal(dropped.length, 5);
  assert.equal(usable.length, 45);

  const margins = usable.map((c) => c.margin).sort((a, b) => Number(a - b));
  assert.equal(formatPercent(margins[0]!), '2.17%');
  assert.equal(formatPercent(margins[margins.length - 1]!), '39.60%');

  // And the exclusion is reported, not silent.
  const note = audit(daeger).notes.find((n) => n.rule === 'margin.outside-band');
  assert.ok(note, 'dropped 5 comparables without saying so');
  assert.match(note.message, /5 of 50/);
});
