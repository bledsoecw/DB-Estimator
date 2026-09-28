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

test('finds the two material off-policy lines, and accounts for the third', () => {
  const markup = result.findings.filter((f) => f.rule === 'markup.off-policy');
  const titles = markup.map((f) => f.title);
  assert.equal(markup.length, 2, `expected 2 markup findings, got ${markup.length}: ${titles.join(' | ')}`);

  assert.ok(titles.some((t) => t.includes('Logistical Management')));
  assert.ok(titles.some((t) => t.includes('Countertop Sub')));

  // Hauling & Disposal is off policy by $4.55 and deliberately does not get a
  // card: the materiality floor is $25. It was a finding until the roofing
  // fixtures showed what that costs — 42 cards on an estimate that had already
  // been approved and sold, most of them worth less than a dollar.
  //
  // But it is NOT dropped. A rule that quietly stops reporting is the failure
  // mode this whole project exists to prevent, so the money has to still be
  // somewhere a reviewer sees it.
  assert.ok(!titles.some((t) => t.includes('Hauling & Disposal')), 'raised a $4.55 card');
  const note = result.notes.find((n) => n.rule === 'markup.off-policy');
  assert.ok(note, 'the suppressed $4.55 is not reported anywhere');
  assert.match(note.message, /\$4\.55/);
});

test('Countertop Sub is short by $1,039.89 under the 30% margin policy', () => {
  const f = result.findings.find((x) => x.title.includes('Countertop Sub'));
  assert.ok(f, 'no Countertop Sub finding');
  // $8,088 cost. 30% margin -> x1.428571 -> $11,554.29. Priced $10,514.40.
  assert.equal(formatMoney(f.impact!), '$1,039.89');
});

test('Logistical Management is short by $1,934.63 under the labor policy', () => {
  const f = result.findings.find((x) => x.title.includes('Logistical Management'));
  assert.ok(f, 'no Logistical Management finding');
  // $65/hr cost, priced $94/hr, 80 hours.
  //
  // The hand calculation before this code existed said $1,934.55, assuming the
  // Labor margin is exactly 0.45. It is not: JobTread stores
  // 0.45000549994500055, which gives an expected $118.1830/hr rather than
  // $118.1818. Over 80 hours that is nine cents. The code computes from the
  // stored policy, which is the policy of record, so the code is right and the
  // hand figure was rounded. See the 'labor margin is not exactly 45%' test.
  //
  // The last cent comes from holding rates at scale 6: the stored margin
  // 0.45000549994500055 becomes 450005 millionths, which bounds the error at
  // well under a cent per unit. Chasing more precision on a value that is
  // itself a float artifact would be false rigor.
  assert.equal(formatMoney(f.impact!), '$1,934.63');
});

test('total underpriced is $2,974.52 across the two raised lines', () => {
  // $1,934.63 + $1,039.89. The hand figure for all three lines was $2,978.98,
  // computed against a Labor margin of exactly 0.45; the stored margin differs
  // slightly, giving $2,979.07. The $4.55 Hauling & Disposal line now sits
  // under the materiality floor and is reported as a note rather than a card,
  // so the raised total is $4.55 lower.
  assert.equal(formatMoney(result.totalUnderpriced), '$2,974.52');
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

test('flags the blank-quantity line', () => {
  const empty = result.findings.filter((f) => f.rule === 'line.empty');
  assert.equal(empty.length, 1);
  assert.ok(empty[0]!.title.includes('Sales On-Site Support'));
  assert.ok(empty[0]!.detail.includes('blank'));
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
