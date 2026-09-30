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
  ApiBudget,
  ApiBudgetGroup,
  ApiBudgetItem,
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
  description?: string;
  /**
   * The budget line this one was built from. Omit for "never fetched" (the
   * shape of the three older fixtures), null for "fetched, not linked", {} for
   * a budget line that matches exactly, or the fields that differ.
   */
  budget?: BudgetSpec | null;
}

interface BudgetSpec {
  id?: string;
  name?: string;
  qty?: number | null;
  unitCost?: number;
  unitPrice?: number;
  description?: string;
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
  const item: ApiCostItem = {
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
  if (spec.description !== undefined) item.description = spec.description;
  if (spec.budget === null) {
    item.jobCostItem = null;
  } else if (spec.budget !== undefined) {
    const b = spec.budget;
    const bq = b.qty === undefined ? qty : b.qty;
    const bc = b.unitCost ?? unitCost;
    const bp = b.unitPrice ?? (b.unitCost === undefined ? unitPrice : b.unitCost * 1.45);
    item.jobCostItem = {
      id: b.id ?? `budget-${id}`,
      name: b.name ?? item.name,
      quantity: bq,
      unitCost: bc,
      unitPrice: bp,
      cost: cents(bc * (bq ?? 0)),
      price: cents(bp * (bq ?? 0)),
      ...(b.description !== undefined ? { description: b.description } : {}),
    };
  }
  return item;
}

interface BudgetItemSpec {
  id?: string;
  name?: string;
  qty?: number | null;
  unitCost?: number;
  unitPrice?: number;
  group?: { id: string; name: string };
  /** Document lines built from this budget line, on any document of the job. */
  onDocuments?: number;
}

/** A budget line the document does not carry: added after the fact, or template filler. */
function budgetItem(spec: BudgetItemSpec): ApiBudgetItem {
  const id = spec.id ?? `budget-extra${++seq}`;
  const qty = spec.qty === undefined ? 1 : spec.qty;
  const unitCost = spec.unitCost ?? 100;
  const unitPrice = spec.unitPrice ?? unitCost * 1.45;
  const cents = (n: number) => Math.round(n * 100) / 100;
  return {
    id,
    name: spec.name ?? `Budget ${id}`,
    quantity: qty,
    unitCost,
    unitPrice,
    cost: cents(unitCost * (qty ?? 0)),
    price: cents(unitPrice * (qty ?? 0)),
    isSpecification: false,
    position: id,
    costType: { id: MATERIALS, name: 'Materials' },
    costCode: { id: 'cc', name: 'Finishes' },
    costGroup: spec.group ?? { id: 'g1', name: 'Group 1' },
    organizationCostItem: { id: 'cat1' },
    documentCostItems: { count: spec.onDocuments ?? 0 },
  };
}

/**
 * The job budget behind a set of document lines: one budget line per linked
 * document line, matching what the line says it was built from, plus whatever
 * else the budget carries.
 */
function budgetOf(
  lines: ApiCostItem[],
  extra: ApiBudgetItem[] = [],
  groups: ApiBudgetGroup[] = [],
): ApiBudget {
  const fromLines: ApiBudgetItem[] = lines
    .filter((l) => l.jobCostItem)
    .map((l) => {
      const b = l.jobCostItem!;
      return {
        id: b.id,
        name: b.name,
        quantity: b.quantity,
        unitCost: b.unitCost,
        unitPrice: b.unitPrice,
        cost: b.cost,
        price: b.price,
        isSpecification: false,
        position: b.id,
        costType: l.costType,
        costCode: l.costCode,
        costGroup: { id: 'g1', name: 'Group 1' },
        organizationCostItem: l.organizationCostItem,
        documentCostItems: { count: 1 },
      };
    });
  const nodes = [...fromLines, ...extra];
  const allGroups = [
    { id: 'g1', name: 'Group 1', position: 'a', parentCostGroup: null },
    ...groups,
  ];
  return {
    jobId: 'job1',
    costItems: { count: nodes.length, nodes },
    costGroups: { count: allGroups.length, nodes: allGroups },
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
  opts: {
    taxRate?: number;
    groups?: ApiCostGroup[];
    statedPrice?: number;
    showChildCosts?: boolean;
    budget?: ApiBudget;
  } = {},
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
    ...(opts.budget ? { budget: opts.budget } : {}),
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

test('a priced line with no quantity is an ask; a $0 tracking line is context; a specification line is neither', () => {
  const spec = line({ qty: null, unitCost: 0, unitPrice: 0, name: 'Scope note' });
  spec.isSpecification = true;
  // The shape of the seven false positives on the first shadow run: a catalog
  // line at $0 / $0 with a blank quantity, there to track time, not to price.
  const tracking = line({ qty: null, unitCost: 0, unitPrice: 0, name: 'Sales On-Site Support' });
  const f = fixture([line({ qty: 0, name: 'Forgotten' }), spec, tracking, line({})]);
  const found = find(f, 'line.empty');
  assert.equal(found.length, 2);

  const ask = found.find((x) => x.severity !== 'info')!;
  assert.ok(ask, 'the priced line with no quantity was not raised');
  assert.ok(ask.title.includes('Forgotten'));

  const context = found.find((x) => x.severity === 'info')!;
  assert.ok(context, 'the tracking line vanished instead of being shown as context');
  assert.ok(context.title.includes('Sales On-Site Support'));
  assert.ok(context.title.includes('no quantity and no cost'));
  assert.ok(!found.some((x) => x.title.includes('Scope note')), 'a specification line was raised');
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

// ---- budget drift --------------------------------------------------------------

const passMessage = (f: AuditFixture, rule: string) => run(f).passed.find((p) => p.rule === rule)?.message;
const note = (f: AuditFixture, rule: string) => run(f).notes.find((n) => n.rule === rule)?.message;

test('a fixture with no budget says the check did not run, and never calls it drift', () => {
  // The shape of every fixture captured before this rule existed: no
  // jobCostItem on any line and no budget block at all.
  const f = fixture([line({}), line({})]);
  assert.equal(find(f, 'budget.drift').length, 0);
  assert.match(passMessage(f, 'budget.drift')!, /not captured/);
  assert.equal(note(f, 'budget.drift'), undefined);
});

test('lines that match their budget lines pass, and say on how many', () => {
  const lines = [line({ budget: {} }), line({ budget: {} }), line({ budget: {} })];
  const f = fixture(lines, { budget: budgetOf(lines) });
  assert.equal(find(f, 'budget.drift').length, 0);
  assert.equal(passMessage(f, 'budget.drift'), 'Document matches its budget on all 3 lines');
});

test('a budget line repriced after the document was built is drift', () => {
  // The Hunnaman shape: the budget cost came down, the document did not follow.
  // Distinct catalog items, or the duplicate rule has its own opinion.
  const lines = [
    line({ name: 'Window', unitCost: 100, catalogId: 'cat-window', budget: { unitCost: 90 } }),
    line({ catalogId: 'cat-other', budget: {} }),
  ];
  const f = fixture(lines, { budget: budgetOf(lines) });
  const found = find(f, 'budget.drift');
  assert.equal(found.length, 1);
  const d = found[0]!;
  assert.equal(d.severity, 'pricing');
  assert.equal(d.title, 'Window no longer matches the job budget');
  assert.deepEqual(d.lineIds, [lines[0]!.id]);
  assert.ok(d.math!.some((m) => m.label === 'Window: cost $100.00 → $90.00, price $145.00 → $130.50'));
  // The document shows the customer MORE than the budget now says, so it is
  // over, not under — and over must not count toward "under policy by".
  assert.equal(formatMoney(d.impact!), '-$14.50');
  assert.equal(formatMoney(run(f).totalUnderpriced), '$0.00');
  assert.ok(d.math!.some((m) => m.label === 'document above the budget' && m.value === '$14.50'));
});

test('the headline is the document total against the budget total', () => {
  const lines = [
    line({ unitCost: 100, catalogId: 'cat-a', budget: { unitCost: 120 } }), // 145 on the document, 174 in the budget
    line({ unitCost: 100, catalogId: 'cat-b', budget: {} }), // 145 both
  ];
  const f = fixture(lines, { budget: budgetOf(lines) });
  const d = find(f, 'budget.drift')[0]!;
  assert.ok(d.math!.some((m) => m.label.startsWith('document total') && m.value === '$290.00'));
  assert.ok(d.math!.some((m) => m.label === 'job budget total' && m.value === '$319.00'));
  assert.ok(d.math!.some((m) => m.label === 'document short of the budget' && m.value === '$29.00' && m.emphasis));
  // Short of the budget IS money on the table if this document goes out.
  assert.equal(formatMoney(d.impact!), '$29.00');
  assert.equal(formatMoney(run(f).totalUnderpriced), '$29.00');
});

test('a budget line the document does not carry is drift, and is priced in', () => {
  const lines = [line({ budget: {} })];
  // Priced, so it is not template filler even though it sits in BURDEN.
  const fee = budgetItem({ name: 'Payment Processing Fee', unitCost: 100, group: { id: 'b', name: 'BURDEN' } });
  const f = fixture(lines, { budget: budgetOf(lines, [fee]) });
  const found = find(f, 'budget.drift');
  assert.equal(found.length, 1);
  assert.equal(found[0]!.title, '1 budget line is not on the document');
  assert.match(found[0]!.detail, /never seen/);
  assert.ok(found[0]!.math!.some((m) => m.label === 'not on the document: Payment Processing Fee' && m.value === '$145.00'));
  assert.equal(formatMoney(found[0]!.impact!), '$145.00');
  assert.equal(formatMoney(run(f).totalUnderpriced), '$145.00');
});

test('both kinds of drift on one document make one card', () => {
  const lines = [line({ name: 'Window', unitCost: 100, budget: { unitCost: 90 } })];
  const f = fixture(lines, { budget: budgetOf(lines, [budgetItem({ name: 'Added later' })]) });
  const found = find(f, 'budget.drift');
  assert.equal(found.length, 1);
  assert.equal(
    found[0]!.title,
    '1 line no longer matches the job budget, and 1 budget line is not on the document',
  );
});

test('zero-cost template lines are set aside, and said so', () => {
  const lines = [line({ budget: {} })];
  const fillers = [
    budgetItem({ name: 'Drywall', unitCost: 0, qty: null, group: { id: 'ci', name: 'CLOCK IN ITEMS' } }),
    budgetItem({ name: 'Payment Processing Fee', unitCost: 0, group: { id: 'b', name: 'BURDEN' } }),
    budgetItem({ name: 'Promotional', unitCost: 0, qty: null, group: { id: 'ga', name: 'General and Administrative' } }),
  ];
  const f = fixture(lines, { budget: budgetOf(lines, fillers) });
  assert.equal(find(f, 'budget.drift').length, 0);
  assert.equal(passMessage(f, 'budget.drift'), 'Document matches its budget on all 1 line');
  const n = note(f, 'budget.drift')!;
  assert.match(n, /3 zero-cost template lines/);
  assert.match(n, /CLOCK IN ITEMS, BURDEN, GENERAL AND ADMINISTRATIVE/);
});

test('a zero-cost line under a template group’s subgroup is still template filler', () => {
  const lines = [line({ budget: {} })];
  const groups: ApiBudgetGroup[] = [
    { id: 'ci', name: 'CLOCK IN ITEMS', position: 'z', parentCostGroup: null },
    { id: 'trades', name: 'Trades', position: 'a', parentCostGroup: { id: 'ci' } },
  ];
  const filler = budgetItem({ name: 'Tiling', unitCost: 0, qty: null, group: { id: 'trades', name: 'Trades' } });
  const f = fixture(lines, { budget: budgetOf(lines, [filler], groups) });
  assert.equal(find(f, 'budget.drift').length, 0);
  assert.match(note(f, 'budget.drift')!, /1 zero-cost template line in CLOCK IN ITEMS/);
});

test('a zero-cost line outside the template groups is not filler', () => {
  // The template groups are the exemption, not zero cost. A line someone
  // added to the budget and never priced is still a line the customer has
  // not seen.
  const lines = [line({ budget: {} })];
  const f = fixture(lines, { budget: budgetOf(lines, [budgetItem({ name: 'Allowance TBD', unitCost: 0 })]) });
  const found = find(f, 'budget.drift');
  assert.equal(found.length, 1);
  assert.ok(found[0]!.math!.some((m) => m.label === 'not on the document: Allowance TBD'));
});

test('a budget line carried by another document is not missing from this one', () => {
  // A change order's lines live in the same budget as the estimate's.
  const lines = [line({ budget: {} })];
  const co = budgetItem({ name: 'Change order: deck', unitCost: 500, onDocuments: 1 });
  const f = fixture(lines, { budget: budgetOf(lines, [co]) });
  assert.equal(find(f, 'budget.drift').length, 0);
  assert.match(note(f, 'budget.drift')!, /1 budget line carried by another document/);
  // And it stays out of the budget total, so the totals still agree.
  assert.equal(passMessage(f, 'budget.drift'), 'Document matches its budget on all 1 line');
});

test('a line with no budget link is not drift, and is counted', () => {
  const lines = [
    line({ budget: {} }),
    line({ name: 'Typed by hand', budget: null }), // fetched, not linked
    line({}), // never fetched
  ];
  const f = fixture(lines, { budget: budgetOf(lines) });
  assert.equal(find(f, 'budget.drift').length, 0);
  assert.match(note(f, 'budget.drift')!, /2 lines not linked to a budget line/);
  assert.match(note(f, 'budget.drift')!, /Typed by hand/);
  // Unlinked lines are on the document and not in the budget, so the totals
  // differ, and the pass message says so rather than hiding it.
  assert.match(passMessage(f, 'budget.drift')!, /^Document matches its budget on all 1 line; totals still differ/);
});

test('a description edit on the budget is drift; whitespace is not', () => {
  const same = line({ description: 'Wellcraft  27"W\n', budget: { description: ' Wellcraft 27"W' } });
  const changed = line({
    name: 'Window',
    description: '27"W x 45"H White Vinyl Basement Block Inswing Egress Window',
    budget: { description: 'Wellcraft 27"W x 45"H  in-swing egress Low-E' },
  });
  const f = fixture([same, changed], { budget: budgetOf([same, changed]) });
  const found = find(f, 'budget.drift');
  assert.equal(found.length, 1);
  assert.deepEqual(found[0]!.lineIds, [changed.id]);
  assert.ok(found[0]!.math!.some((m) => m.label === 'Window: description changed'));
  // A description-only change moves no money.
  assert.equal(formatMoney(found[0]!.impact!), '$0.00');
});

test('descriptions that were never captured are not compared', () => {
  const l = line({ description: 'on the document', budget: {} }); // no budget description
  const f = fixture([l], { budget: budgetOf([l]) });
  assert.equal(find(f, 'budget.drift').length, 0);
});

test('name, quantity and unit price changes are each named', () => {
  const l = line({ name: 'Trim', qty: 2, unitCost: 10, budget: { name: 'Trim - Casing', qty: 3, unitPrice: 20 } });
  const f = fixture([l], { budget: budgetOf([l]) });
  const d = find(f, 'budget.drift')[0]!;
  const row = d.math!.find((m) => m.label.startsWith('Trim:'))!;
  assert.equal(row.label, 'Trim: name "Trim" → "Trim - Casing", qty 2 → 3, price $14.50 → $20.00');
  assert.equal(row.value, '$29.00 → $60.00');
});
