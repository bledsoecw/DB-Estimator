/**
 * Checks must not fire on the house style.
 *
 * The first shadow run over 20 approved estimates produced 87 findings, and 39
 * of them came from three checks that were describing how Deitemeyer Brothers
 * works rather than finding anything wrong. Counted over all 802 approved
 * customer orders:
 *
 *   456 of 802 (57%)  require no signature — and all 802 were accepted
 *   658 of 802 (82%)  show line prices to the customer
 *     4 of 802  (<1%) carry a tax rate at all
 *   4,170 cost items are flagged taxable on a document with no rate
 *       0 cost items are flagged taxable on a document that has one
 *
 * These tests hold that line. The principle behind them, which cost 39 false
 * positives to learn: a check that fires on the majority of work the company
 * has already sold is measuring a convention, not a defect — and a reviewer
 * told eighteen times out of twenty that the convention is a finding stops
 * reading findings altogether.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { fromFixture } from '../src/domain.ts';
import { audit, RULES } from '../src/rules/index.ts';
import type { AuditFixture } from '../src/jobtread/types.ts';

const fixture = JSON.parse(
  readFileSync(new URL('./fixtures/jones-bath-kitchen.json', import.meta.url), 'utf8'),
) as AuditFixture;

const asks = (f: AuditFixture) =>
  audit(fromFixture(f)).findings.filter((x) => x.severity !== 'info');

test('itemised line prices are context, not an ask', () => {
  assert.equal(fixture.document.showChildCosts, true, 'fixture no longer exercises this');
  assert.ok(
    !asks(fixture).some((f) => f.rule === 'display.customer-visible'),
    'the house style is being raised as a finding again',
  );
  // Still reported, just not as an interruption.
  const all = audit(fromFixture(fixture)).findings;
  assert.ok(all.some((f) => f.rule === 'display.customer-visible'));
});

test('a missing signature requirement is not a finding at all', () => {
  const unsigned = structuredClone(fixture);
  unsigned.document.requireSignature = false;
  assert.ok(
    !audit(fromFixture(unsigned)).findings.some((f) => f.rule === 'display.no-signature'),
    'the signature rule is back; 456 approved orders disprove its premise',
  );
});

test('taxable flags with no rate are context, not an ask', () => {
  const flagged = structuredClone(fixture);
  flagged.document.taxRate = 0;
  for (const item of flagged.document.costItems.nodes) item.isTaxable = true;

  const raised = asks(flagged);
  assert.ok(
    !raised.some((f) => f.rule === 'tax.inconsistent'),
    'stale taxable flags are being raised per estimate again',
  );
  assert.ok(
    audit(fromFixture(flagged)).findings.some((f) => f.rule === 'tax.inconsistent'),
    'but they should still be reported as context',
  );
});

test('profit visible to the customer is still an ask', () => {
  // The counterweight: this one is rare and it leaks margin, so demoting the
  // others must not quietly demote this.
  const leaky = structuredClone(fixture);
  leaky.document.showProfit = true;
  assert.ok(asks(leaky).some((f) => f.rule === 'display.profit-visible'));
});

test('no rule fires on an estimate that is clean by the house style', () => {
  // Line prices shown, no signature required, taxable flags set, no rate: the
  // shape of a typical approved document here. Nothing should need a human
  // except what the lines themselves say.
  const typical = structuredClone(fixture);
  typical.document.showChildCosts = true;
  typical.document.requireSignature = false;
  typical.document.showProfit = false;
  typical.document.taxRate = 0;
  for (const item of typical.document.costItems.nodes) item.isTaxable = true;

  const raised = asks(typical);
  const conventions = ['display.customer-visible', 'display.no-signature', 'tax.inconsistent'];
  for (const rule of conventions) {
    assert.ok(!raised.some((f) => f.rule === rule), `${rule} is asking about a convention`);
  }
});

test('every rule declares what it checks', () => {
  for (const rule of RULES) {
    assert.ok(rule.describes.length > 0, `${rule.id} has no description`);
  }
});
