/**
 * Golden test against a real estimate.
 *
 * The fixture is document 22PfKxuR9Vrx — 261305 Jones_Bath/Kitchen, captured
 * 2026-09-28 while it sat in `pending`. The expected findings below were worked
 * out by hand before this code existed; the rule engine has to reproduce them
 * independently or it is not trustworthy.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { fromFixture, marginOf } from '../src/domain.ts';
import { audit } from '../src/rules/index.ts';
import {
  formatMoney,
  formatPercent,
  moneyFromApi,
  moneyFromString,
  multiplierFromMargin,
  priceFromCostAtMargin,
  rateFromNumber,
  toNumber,
} from '../src/money.ts';
import type { AuditFixture } from '../src/jobtread/types.ts';

const fixture = JSON.parse(
  readFileSync(new URL('./fixtures/jones-bath-kitchen.json', import.meta.url), 'utf8'),
) as AuditFixture;

const input = fromFixture(fixture);
const result = audit(input);

test('finds the one material off-policy line, and accounts for the other two', () => {
  const markup = result.findings.filter((f) => f.rule === 'markup.off-policy');
  const titles = markup.map((f) => f.title);
  assert.equal(markup.length, 1, `expected 1 markup finding, got ${markup.length}: ${titles.join(' | ')}`);
  assert.ok(titles[0]!.includes('Countertop Sub'));

  // Two lines this test used to expect as findings are accounted for elsewhere.
  // Hauling & Disposal is off by $4.55 and sits under the $25 materiality floor.
  // Logistical Management is priced the way its catalog item says, on purpose.
  // Neither is dropped: both are in the same note, where a reviewer sees them.
  assert.ok(!titles.some((t) => t.includes('Hauling & Disposal')), 'raised a $4.55 card');
  assert.ok(!titles.some((t) => t.includes('Logistical Management')), 'raised a deliberate price');
  const note = result.notes.find((n) => n.rule === 'markup.off-policy');
  assert.ok(note, 'the suppressed lines are not reported anywhere');
  assert.match(note.message, /\$4\.55/);
  assert.match(note.message, /Logistical Management/);
});

test('Countertop Sub is short by $1,039.89 under the 30% margin policy', () => {
  const f = result.findings.find((x) => x.title.includes('Countertop Sub'));
  assert.ok(f, 'no Countertop Sub finding');
  // $8,088 cost. 30% margin -> x1.428571 -> $11,554.29. Priced $10,514.40.
  assert.equal(formatMoney(f.impact!), '$1,039.89');
});

test('Logistical Management is priced as its catalog item says, and is not a finding', () => {
  // Until 2026-09-29 this test asserted the line was $1,934.63 short of the
  // Labor margin. The arithmetic was right and the conclusion was wrong. The
  // catalog item behind it is deliberately priced at 45% markup — its own
  // internal note reads "Unit Cost to be $65 with 45% markup" — and this line
  // at $94.00 is 25 cents off THAT. Measured against the cost type it was a
  // correct number about the wrong policy, which is what the catalog check
  // exists to prevent.
  const f = result.findings.find((x) => x.title.includes('Logistical Management'));
  assert.equal(f, undefined, 'raised a deliberate price as a finding');
  const note = result.notes.find((n) => n.rule === 'markup.off-policy');
  assert.ok(note);
  assert.match(note.message, /Logistical Management/);
  assert.match(note.message, /on purpose/);
  assert.match(note.message, /Carl Bledsoe/);
});

test('total underpriced is $1,039.89 — the one raised line', () => {
  // Countertop Sub alone. It was $2,979.07 across three lines before the
  // materiality floor took Hauling & Disposal ($4.55) to a note, and $2,974.52
  // before the catalog item behind Logistical Management was recorded as
  // deliberate ($1,934.63). Each step is a decision, not a loss.
  assert.equal(formatMoney(result.totalUnderpriced), '$1,039.89');
});

test('the stored Labor margin is not exactly 45%', () => {
  // Worth knowing on its own: the policy of record reads 0.45000549994500055,
  // almost certainly a float round-trip from someone entering the $55 -> $100
  // rate. It makes "45% labor margin" actually 45.00055%. Immaterial in dollars,
  // but it is exactly the kind of thing that makes a reproduce-history-to-the-cent
  // gate fail for reasons nobody can find.
  const labor = input.policy.byCostTypeId.get('22PBAjfWNQr6')!;
  assert.notEqual(Number(labor.margin), 450_000);
  assert.equal(Number(labor.margin), 450_005);
  // A $55 cost line still prices to $100.00 at four decimal places, which is
  // why the standard crew lines do not trip the markup rule.
  assert.equal(formatMoney(priceFromCostAtMargin(moneyFromString('55'), labor.margin)), '$100.0009');
});

test('the Sales On-Site Support tracking line is context, not an ask', () => {
  // All seven "not real" marks on the first shadow run were this line: a
  // non-monetized catalog item (its own description says so) that rides along
  // at $0 with no quantity, to track sales time. Nothing on it can reach the
  // customer's total. It stays on the page, under "worth knowing", unscored.
  const empty = result.findings.filter((f) => f.rule === 'line.empty');
  assert.equal(empty.length, 1);
  assert.equal(empty[0]!.severity, 'info');
  assert.ok(empty[0]!.title.includes('Sales On-Site Support'));
  assert.ok(empty[0]!.title.includes('no quantity and no cost'));
});

test('flags that line prices are visible to the customer', () => {
  const d = result.findings.find((f) => f.rule === 'display.customer-visible');
  assert.ok(d, 'expected a showChildCosts finding');
});

test('totals reconcile once the unselected option branch is accounted for', () => {
  // Sum of all 26 lines is $118,481.19; the document states $109,304.84. The
  // $9,176.35 difference is exactly the Semi-Frameless branch, so this is the
  // expected shape rather than a discrepancy.
  const t = result.findings.find((f) => f.rule === 'totals.reconcile');
  assert.equal(t, undefined, 'totals should reconcile via the option branch');

  const passed = result.passed.find((p) => p.rule === 'totals.reconcile');
  assert.ok(passed, 'expected totals to be reported as passed');
  assert.ok(
    passed.message.includes('Semi-Frameless'),
    `expected the excluded branch to be named, got: ${passed.message}`,
  );
});

test('does not invent findings on the clean checks', () => {
  const clean = ['catalog.unlinked', 'line.duplicate', 'tax.inconsistent', 'tax.rate-suspicious'];
  for (const rule of clean) {
    assert.equal(
      result.findings.find((f) => f.rule === rule),
      undefined,
      `${rule} should not fire on this estimate`,
    );
  }
  assert.ok(result.passed.some((p) => p.rule === 'tax.inconsistent'));
  assert.ok(result.passed.some((p) => p.rule === 'catalog.unlinked'));
});

test('margin is reported as above the comparable band', () => {
  const m = result.findings.find((f) => f.rule === 'margin.outside-band');
  assert.ok(m, 'expected a margin finding');
  assert.ok(m.title.includes('above'));
  const margin = marginOf(input.estimate.statedPrice, input.estimate.statedCost);
  assert.equal(formatPercent(margin), '33.80%');
});

test('pricing findings sort ahead of informational ones', () => {
  const order = result.findings.map((f) => f.severity);
  const firstInfo = order.indexOf('info');
  const lastPricing = order.lastIndexOf('pricing');
  if (firstInfo !== -1 && lastPricing !== -1) {
    assert.ok(lastPricing < firstInfo, 'pricing findings must come first');
  }
});

test('policy multipliers derive correctly from the live margins', () => {
  const labor = input.policy.byCostTypeId.get('22PBAjfWNQr6')!;
  const materials = input.policy.byCostTypeId.get('22PBAjfWNQr7')!;
  const sub = input.policy.byCostTypeId.get('22PBAjfWNQr8')!;

  // Materials margin 0.3103448275862069 is exactly x1.45.
  assert.equal((Number(materials.multiplier) / 1e6).toFixed(4), '1.4500');
  // Labor 45% margin is x1.8182 — the $55 -> $100 rate.
  assert.equal((Number(labor.multiplier) / 1e6).toFixed(4), '1.8182');
  // Subcontractor 30% margin is x1.4286, NOT the x1.30 half the catalog carries.
  assert.equal((Number(sub.multiplier) / 1e6).toFixed(4), '1.4286');
});

test('money absorbs the float values JobTread actually returns', () => {
  // These are real values off the wire. moneyFromApi rounds at scale 4, which
  // is what absorbs the float noise; moneyFromString parses a literal exactly
  // and is only for constants in code and tests.
  assert.equal(formatMoney(moneyFromApi(869.9999999999999)), '$870.00');
  assert.equal(formatMoney(moneyFromApi(8.206999999999999)), '$8.2070');
  assert.equal(formatMoney(moneyFromApi(121.78549999999998)), '$121.7855');
  const m = multiplierFromMargin(rateFromNumber(0.3103448275862069));
  assert.equal((Number(m) / 1e6).toFixed(4), '1.4500');
  assert.equal(toNumber(moneyFromString('0.4')), 0.4);
});

test('price-from-margin does not lose money to a quantized multiplier', () => {
  // The bug this test exists to prevent: routing through x1.428571 gives
  // $11,554.2822 on an $8,088 cost, three and a half cents low.
  const exact = priceFromCostAtMargin(moneyFromString('8088'), rateFromNumber(0.3));
  assert.equal(formatMoney(exact), '$11,554.2857');
});

test('a rule that throws is reported, not swallowed', () => {
  const exploding = {
    id: 'test.explode',
    describes: 'always throws',
    run() {
      throw new Error('boom');
    },
  };
  const r = audit(input, [exploding]);
  assert.equal(r.findings.length, 1);
  assert.ok(r.findings[0]!.title.includes('could not run'));
  assert.ok(r.findings[0]!.detail.includes('boom'));
});
