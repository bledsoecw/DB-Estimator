/**
 * Rule-level tests for paths the Jones fixture does not exercise.
 *
 * Jones is a clean, tax-free, single-option estimate, so it proves the happy
 * path and the three markup findings but never fires the tax rules, the
 * duplicate rule, or a genuine totals mismatch. Those branches get targeted
 * inputs here, built from the same shapes real documents use.
 *
 * Real second fixtures come from `npm run audit -- <id> --capture <path>` once
 * the auditor is running somewhere with network access to JobTread.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { fromFixture } from '../src/domain.ts';
import { audit } from '../src/rules/index.ts';
import { formatMoney } from '../src/money.ts';
import type {
  ApiCostGroup,
  ApiCostItem,
  ApiCostType,
  AuditFixture,
} from '../src/jobtread/types.ts';

const MATERIALS = '22PBAjfWNQr7';
const LABOR = '22PBAjfWNQr6';
const SUB = '22PBAjfWNQr8';

const COST_TYPES: ApiCostType[] = [
  { id: LABOR, name: 'Labor', margin: 0.45, isTaxable: false, isTimeTrackable: true, isActive: true },
  { id: MATERIALS, name: 'Materials', margin: 0.3103448275862069, isTaxable: false, isTimeTrackable: false, isActive: true },
  { id: SUB, name: 'Subcontractor', margin: 0.3, isTaxable: false, isTimeTrackable: false, isActive: true },
];

interface LineSpec {
  id?: string;
  name?: string;
  qty?: number | null;
  unitCost?: number;
  /** Omit to price exactly at the Materials policy. */
  unitPrice?: number;
  costTypeId?: string;
  taxable?: boolean;
  groupId?: string;
  catalogId?: string | null;
}

let seq = 0;

function line(spec: LineSpec): ApiCostItem {
  const id = spec.id ?? `line${++seq}`;
  const qty = spec.qty === undefined ? 1 : spec.qty;
  const unitCost = spec.unitCost ?? 100;
  const unitPrice = spec.unitPrice ?? unitCost * 1.45;
  // JobTread stores extensions rounded to cents while keeping unit price at
  // four decimals — real values are 762.9 and 19550.07 against unit prices of
  // 10.3095 and 19550.0745. The fixture has to match or the tests assert
  // against arithmetic no real document produces.
  const cents = (n: number) => Math.round(n * 100) / 100;
  return {
    id,
    name: spec.name ?? `Line ${id}`,
    quantity: qty,
    unitCost,
    unitPrice,
    cost: cents(unitCost * (qty ?? 0)),
    price: cents(unitPrice * (qty ?? 0)),
    isTaxable: spec.taxable ?? false,
    isSelected: false,
    isSpecification: false,
    position: id,
    globalId: null,
    quantityFormula: null,
    unit: { id: 'u', name: 'Each' },
    costType: {
      id: spec.costTypeId ?? MATERIALS,
      name: spec.costTypeId === LABOR ? 'Labor' : spec.costTypeId === SUB ? 'Subcontractor' : 'Materials',
    },
    costCode: { id: 'cc', name: 'Finishes' },
    costGroup: { id: spec.groupId ?? 'g1' },
    organizationCostItem: spec.catalogId === null ? null : { id: spec.catalogId ?? 'cat1' },
  };
}

function group(id: string, name: string, parentId?: string, sel?: { min: number; max: number }): ApiCostGroup {
  return {
    id,
    name,
    position: id,
    isSelected: false,
    isSimpleSelection: false,
    minSelectionsRequired: sel?.min ?? null,
    maxSelectionsAllowed: sel?.max ?? null,
    showChildCosts: false,
    parentCostGroup: parentId ? { id: parentId } : null,
  };
}

function fixture(
  lines: ApiCostItem[],
  opts: { taxRate?: number; groups?: ApiCostGroup[]; statedPrice?: number; showChildCosts?: boolean } = {},
): AuditFixture {
  const sum = Math.round(lines.reduce((a, l) => a + l.price, 0) * 100) / 100;
  const cost = Math.round(lines.reduce((a, l) => a + l.cost, 0) * 100) / 100;
  return {
    capturedAt: '2026-09-28T00:00:00.000Z',
    organizationId: '22PBAjem8SSC',
    document: {
      id: 'doc1',
      name: 'Estimate',
      type: 'customerOrder',
      status: 'draft',
      price: opts.statedPrice ?? sum,
      cost,
      priceWithTax: opts.statedPrice ?? sum,
      taxRate: opts.taxRate ?? 0,
      taxName: null,
      externalId: null,
      showChildCosts: opts.showChildCosts ?? false,
      showQuantity: false,
      showProfit: false,
      showLinesAtDepth: null,
      requireSignature: true,
      includeInBudget: true,
      issueDate: '2026-09-28',
      createdAt: '2026-09-28T00:00:00.000Z',
      job: { id: 'job1', name: 'Test Job' },
      costGroups: {
        count: (opts.groups ?? [group('g1', 'Group 1')]).length,
        nodes: opts.groups ?? [group('g1', 'Group 1')],
      },
      costItems: { count: lines.length, nodes: lines },
    },
    costTypes: COST_TYPES,
    comparables: [],
  };
}

const run = (f: AuditFixture) => audit(fromFixture(f));
const find = (f: AuditFixture, rule: string) => run(f).findings.filter((x) => x.rule === rule);

// ---- tax ---------------------------------------------------------------------

test('taxable lines with a zero document rate are flagged', () => {
  const f = fixture([line({ taxable: true }), line({ taxable: true }), line({})], { taxRate: 0 });
  const found = find(f, 'tax.inconsistent');
  assert.equal(found.length, 1);
  assert.ok(found[0]!.title.includes('2 lines are marked taxable'));
});

test('a tax rate that looks like a percentage is caught', () => {
  // 7.25 entered where 0.0725 was meant: a 100x error the type system accepts.
  const f = fixture([line({ taxable: true })], { taxRate: 7.25 });
  const found = find(f, 'tax.rate-suspicious');
  assert.equal(found.length, 1);
  assert.ok(found[0]!.detail.includes('100'));
});

test('a real Ohio rate on fully taxable lines is not flagged', () => {
  const f = fixture([line({ taxable: true }), line({ taxable: true })], { taxRate: 0.0725 });
  assert.equal(find(f, 'tax.rate-suspicious').length, 0);
  assert.equal(find(f, 'tax.inconsistent').length, 0);
  assert.ok(run(f).passed.some((p) => p.message.includes('7.25%')));
});

test('a partially taxable document is reported as context, not an error', () => {
  const f = fixture([line({ taxable: true }), line({ taxable: false })], { taxRate: 0.0725 });
  const found = find(f, 'tax.partial');
  assert.equal(found.length, 1);
  assert.equal(found[0]!.severity, 'info');
});

// ---- duplicates --------------------------------------------------------------

test('the same catalog item twice in one group at the same price is flagged', () => {
  const f = fixture([
    line({ name: 'Drywall Board', catalogId: 'cat-dw', unitCost: 27.98 }),
    line({ name: 'Drywall Board', catalogId: 'cat-dw', unitCost: 27.98 }),
    line({ name: 'Paint', catalogId: 'cat-paint' }),
  ]);
  const found = find(f, 'line.duplicate');
  assert.equal(found.length, 1);
  assert.equal(found[0]!.lineIds!.length, 2);
  // Impact is the redundant copy, not both.
  assert.equal(formatMoney(found[0]!.impact!), '$40.57');
});

test('the same item at different prices is not a duplicate', () => {
  // Real pattern: Drywall Board appears three times at 27.98 / 26.18 / 21.68.
  const f = fixture([
    line({ name: 'Drywall Board', catalogId: 'cat-dw', unitCost: 27.98 }),
    line({ name: 'Drywall Board', catalogId: 'cat-dw', unitCost: 26.18 }),
    line({ name: 'Drywall Board', catalogId: 'cat-dw', unitCost: 21.68 }),
  ]);
  assert.equal(find(f, 'line.duplicate').length, 0);
});

test('the same item in different groups is not a duplicate', () => {
  const f = fixture(
    [
      line({ catalogId: 'cat-x', groupId: 'g1' }),
      line({ catalogId: 'cat-x', groupId: 'g2' }),
    ],
    { groups: [group('g1', 'Kitchen'), group('g2', 'Bathroom')] },
  );
  assert.equal(find(f, 'line.duplicate').length, 0);
});

// ---- totals ------------------------------------------------------------------

test('a total that does not match and has no option branch is flagged', () => {
  const f = fixture([line({ unitCost: 100 }), line({ unitCost: 200 })], { statedPrice: 500 });
  const found = find(f, 'totals.reconcile');
  assert.equal(found.length, 1);
  assert.ok(found[0]!.title.includes('does not match'));
});

test('a shortfall equal to an unselected option branch reconciles', () => {
  const groups = [
    group('g1', 'Base'),
    group('opt', 'Shower Door Options', undefined, { min: 1, max: 1 }),
    group('a', 'Frameless', 'opt'),
    group('b', 'Semi-Frameless', 'opt'),
  ];
  const lines = [
    line({ unitCost: 1000, groupId: 'g1' }), // 1450
    line({ unitCost: 100, groupId: 'a' }), //  145  chosen
    line({ unitCost: 200, groupId: 'b' }), //  290  not chosen
  ];
  const f = fixture(lines, { groups, statedPrice: 1450 + 145 });
  assert.equal(find(f, 'totals.reconcile').length, 0);
  const passed = run(f).passed.find((p) => p.rule === 'totals.reconcile');
  assert.ok(passed?.message.includes('Semi-Frameless'));
});

test('an option branch nested below its group still reconciles', () => {
  // The real shape: lines hang off a grandchild of the selection group.
  const groups = [
    group('opt', 'Options', undefined, { min: 1, max: 1 }),
    group('a', 'Branch A', 'opt'),
    group('a-inner', 'Branch A detail', 'a'),
    group('b', 'Branch B', 'opt'),
    group('b-inner', 'Branch B detail', 'b'),
  ];
  const lines = [
    line({ unitCost: 100, groupId: 'a-inner' }), // 145 chosen
    line({ unitCost: 300, groupId: 'b-inner' }), // 435 not chosen
  ];
  const f = fixture(lines, { groups, statedPrice: 145 });
  assert.equal(find(f, 'totals.reconcile').length, 0);
});

// ---- catalog and empty lines -------------------------------------------------

test('an unlinked line is flagged', () => {
  const f = fixture([line({ catalogId: null, name: 'Typed by hand' }), line({})]);
  const found = find(f, 'catalog.unlinked');
  assert.equal(found.length, 1);
  assert.ok(found[0]!.title.includes('1 line'));
});

test('a zero-quantity line is flagged but a specification line is not', () => {
  const spec = line({ qty: null, unitCost: 0, unitPrice: 0, name: 'Scope note' });
  spec.isSpecification = true;
  const f = fixture([line({ qty: 0, unitCost: 0, unitPrice: 0, name: 'Forgotten' }), spec, line({})]);
  const found = find(f, 'line.empty');
  assert.equal(found.length, 1);
  assert.ok(found[0]!.title.includes('Forgotten'));
});

// ---- markup edge cases -------------------------------------------------------

test('a zero-cost line does not produce a markup finding', () => {
  // It is the empty-line rule's business; two findings for one line is noise.
  const f = fixture([line({ unitCost: 0, unitPrice: 0, qty: null })]);
  assert.equal(find(f, 'markup.off-policy').length, 0);
  assert.equal(find(f, 'line.empty').length, 1);
});

test('a line priced above policy is flagged as over, not under', () => {
  const f = fixture([line({ unitCost: 100, unitPrice: 200 })]);
  const found = find(f, 'markup.off-policy');
  assert.equal(found.length, 1);
  assert.ok(found[0]!.title.includes('above'));
  // Over-pricing must not count toward "under policy by".
  assert.equal(formatMoney(run(f).totalUnderpriced), '$0.00');
});

test('sub-cent drift does not raise a finding', () => {
  // x1.45 exactly vs the policy multiplier: any difference is below a cent.
  const f = fixture([line({ unitCost: 2.6093, unitPrice: 2.6093 * 1.45, qty: 1 })]);
  assert.equal(find(f, 'markup.off-policy').length, 0);
});

test('the $55 to $100 crew rate does not trip the labor rule', () => {
  // The rate the whole company runs on. If this ever fires, the rule is wrong.
  const f = fixture([line({ unitCost: 55, unitPrice: 100, qty: 8, costTypeId: LABOR })]);
  assert.equal(find(f, 'markup.off-policy').length, 0);
});

test('an empty estimate produces no findings and does not crash', () => {
  const f = fixture([]);
  const r = run(f);
  assert.equal(r.findings.filter((x) => x.severity === 'pricing').length, 0);
});
