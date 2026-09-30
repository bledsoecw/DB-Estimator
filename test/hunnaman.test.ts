/**
 * 261457 Hunnaman_Window (22PdgSLdpHRL), captured 2026-09-29 — the drift case.
 *
 * A GC egress window, 43 lines, pending. The rep edited the JOB BUDGET on
 * Sep 25 and Sep 29 — the Window line went from $653.90 to $617.17 cost and
 * picked up a Wellcraft spec — and asked for the estimate to be reviewed. The
 * document had not been touched since Sep 1, and the customer had already
 * viewed it twice. Every other check passed: the document's own arithmetic
 * was clean. It was just not the document the rep meant.
 *
 * Captured with the job budget, which is what makes the comparison possible
 * offline. Every number below was read off the raw fixture before the rule
 * was written to produce it.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { fromFixture } from '../src/domain.ts';
import { audit } from '../src/rules/index.ts';
import { renderReport } from '../src/report.ts';
import { formatMoney } from '../src/money.ts';
import type { AuditFixture } from '../src/jobtread/types.ts';

const fixture = JSON.parse(
  readFileSync(new URL('./fixtures/hunnaman-window.json', import.meta.url), 'utf8'),
) as AuditFixture;

const input = fromFixture(fixture);
const result = audit(input);

test('every document line is linked to a budget line, and the budget came with it', () => {
  assert.equal(input.estimate.jobType, 'Construction');
  assert.equal(input.estimate.lines.length, 43);
  assert.equal(input.estimate.lines.filter((l) => l.budget).length, 43, 'a line lost its budget link');
  assert.equal(input.estimate.lines.filter((l) => l.description !== null).length, 43, 'descriptions not captured');
  assert.equal(input.budget?.lines.length, 85);
});

test('the Window line drifted from its budget line, and nothing else did', () => {
  const drift = result.findings.filter((f) => f.rule === 'budget.drift');
  assert.equal(drift.length, 1, drift.map((f) => f.title).join(' | '));
  const d = drift[0]!;
  assert.equal(d.severity, 'pricing');
  assert.equal(d.title, 'Window no longer matches the job budget');
  assert.deepEqual(d.lineIds, ['22PdgSLegXxr']);

  const window = input.estimate.lines.find((l) => l.id === '22PdgSLegXxr')!;
  assert.equal(formatMoney(window.unitCost), '$653.90');
  assert.equal(formatMoney(window.budget!.unitCost), '$617.17');
  assert.equal(formatMoney(window.price), '$948.16');
  assert.equal(formatMoney(window.budget!.price), '$894.90');

  const row = d.math!.find((m) => m.label.startsWith('Window:'))!;
  assert.match(row.label, /cost \$653\.90 → \$617\.17/);
  assert.match(row.label, /description changed/);
  assert.equal(row.value, '$948.16 → $894.90');

  // The budget carries the new spec; the document still carries the old one.
  assert.match(window.budget!.description!, /Wellcraft/);
  assert.doesNotMatch(window.description!, /Wellcraft/);
});

test('the headline is the document total against the budget total', () => {
  const d = result.findings.find((f) => f.rule === 'budget.drift')!;
  assert.ok(d.math!.some((m) => m.label.startsWith('document total') && m.value === '$10,193.08'));
  assert.ok(d.math!.some((m) => m.label === 'job budget total' && m.value === '$10,139.82'));
  assert.ok(d.math!.some((m) => m.label === 'document above the budget' && m.value === '$53.26'));
  // The budget came DOWN, so the customer is looking at a higher number than
  // the rep now intends. That is over, not under, and must not be added to
  // the under-policy total.
  assert.equal(formatMoney(d.impact!), '-$53.26');
});

test('the 42 template lines are set aside, and no budget line is reported missing', () => {
  const note = result.notes.find((n) => n.rule === 'budget.drift');
  assert.ok(note, 'the template lines vanished without a word');
  assert.match(
    note.message,
    /^42 zero-cost template lines in CLOCK IN ITEMS, BURDEN, GENERAL AND ADMINISTRATIVE set aside$/,
  );
  const d = result.findings.find((f) => f.rule === 'budget.drift')!;
  assert.ok(!d.math!.some((m) => m.label.startsWith('not on the document')), 'invented a missing line');
});

test('two things need a human, and drift is one of them', () => {
  // The markup finding is the Demolition - Concrete line: cost type Labor,
  // priced at the Subcontractor x1.4286. Real, and out of scope here — the
  // defect is the cost type, not the price. The blank quantity on the Sales
  // On-Site Support placeholder is a $0 line, which the empty-line rule stopped
  // raising after Stage 1 (09302d9): it is context, not an ask.
  const needsHuman = result.findings.filter((f) => f.severity !== 'info');
  assert.deepEqual(
    needsHuman.map((f) => f.rule),
    ['markup.off-policy', 'budget.drift'],
    needsHuman.map((f) => f.title).join(' | '),
  );
  assert.equal(formatMoney(result.totalUnderpriced), '$292.22');
});

test('the approver screen shows both totals', () => {
  const html = renderReport(input, result);
  assert.match(html, /no longer matches the job budget/);
  assert.match(html, /\$10,139\.82/, 'the budget total');
  assert.match(html, /\$10,193\.08/, 'the document total');
});
