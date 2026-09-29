/**
 * Lines judged against the catalog.
 *
 * The real case this was built for: 22PdGwy32ycX carried Aluminum Fascia
 * Install at $4.00 -> $7.20 where the catalog says $4.00 -> $7.2727. Same
 * cost, different price. Against the cost type that is rounding noise and
 * correctly ignored; against the catalog it is a line that no longer says what
 * the company decided it says.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { fromFixture } from '../src/domain.ts';
import { audit } from '../src/rules/index.ts';
import { formatMoney } from '../src/money.ts';
import type { AuditFixture, ApiCatalogItem } from '../src/jobtread/types.ts';

const base = JSON.parse(
  readFileSync(new URL('./fixtures/jones-bath-kitchen.json', import.meta.url), 'utf8'),
) as AuditFixture;

const LABOR = { id: '22PBAjfWNQr6', name: 'Labor' };

/** One-line estimate plus a catalog, so each case is exactly what it says. */
function scenario(opts: {
  lineCost: number;
  linePrice: number;
  qty: number;
  catalog?: Partial<ApiCatalogItem> | null;
  lineName?: string;
}) {
  const f = structuredClone(base);
  f.document.costItems = {
    count: 1,
    nodes: [
      {
        id: 'line-1',
        name: opts.lineName ?? 'Aluminum Fascia Install',
        quantity: opts.qty,
        unitCost: opts.lineCost,
        unitPrice: opts.linePrice,
        cost: opts.lineCost * opts.qty,
        price: Number((opts.linePrice * opts.qty).toFixed(2)),
        isTaxable: false,
        isSpecification: false,
        globalId: null,
        quantityFormula: null,
        unit: { name: 'Linear Feet' },
        costType: LABOR,
        costCode: { name: 'Siding' },
        costGroup: null,
        organizationCostItem: { id: 'cat-fascia' },
      },
    ],
  } as never;
  f.document.price = Number((opts.linePrice * opts.qty).toFixed(2));
  f.document.cost = opts.lineCost * opts.qty;
  f.document.priceWithTax = f.document.price;
  f.document.taxRate = 0;
  f.document.showChildCosts = false;
  f.comparables = [];

  if (opts.catalog === null) delete f.catalog;
  else {
    f.catalog = [
      {
        id: 'cat-fascia',
        name: 'Aluminum Fascia Install',
        unitCost: 4,
        unitPrice: 7.2727272727272725,
        costType: LABOR,
        ...opts.catalog,
      },
    ];
  }
  return fromFixture(f);
}

const drift = (i: ReturnType<typeof scenario>) =>
  audit(i).findings.filter((f) => f.rule === 'catalog.drift');

test('the real case: $7.20 against a catalog $7.2727', () => {
  // 7 cents a foot. Over the 100 LF on that job it is $7.27 — real, and below
  // the $25 floor, so it is reported as a note rather than a card. That is the
  // floor working, not the check failing.
  const input = scenario({ lineCost: 4, linePrice: 7.2, qty: 100 });
  assert.equal(drift(input).length, 0);
  const note = audit(input).notes.find((n) => n.rule === 'catalog.drift');
  assert.ok(note, 'the drift vanished without a word');
  assert.match(note.message, /\$7\.27/);
});

test('the same drift on enough footage earns a card', () => {
  const input = scenario({ lineCost: 4, linePrice: 7.2, qty: 1000 });
  const [f] = drift(input);
  assert.ok(f, 'no finding on $72.70 of drift');
  // $72.70, not the $72.73 that 0.0727 x 1000 suggests. The catalog stores
  // 7.2727272727272725 — itself a float artifact of 4 / 0.55 — which Money
  // holds at four places as $7.2727, exactly as JobTread stores unitPrice.
  // The 2.7 cents lost over a thousand feet is the representation, documented
  // in money.ts, not a rounding bug.
  assert.equal(formatMoney(f.impact!), '$72.70');
  assert.match(f.title, /below its catalog item/);
  assert.match(f.detail, /Somebody changed the price/);
});

test('a line that matches its catalog item is clean', () => {
  const input = scenario({ lineCost: 4, linePrice: 7.2727272727272725, qty: 1000 });
  assert.equal(drift(input).length, 0);
  assert.ok(
    audit(input).passed.some((p) => p.rule === 'catalog.drift'),
    'said nothing about a line it checked and liked',
  );
});

test('a cost that moved is not drift, as long as the markup held', () => {
  // The single most important case. A line written in March holds March's
  // cost. That is not an error, and a rule that compared prices rather than
  // multipliers would flag every older line in the book.
  const input = scenario({ lineCost: 6, linePrice: 10.909090909, qty: 1000 });
  assert.equal(drift(input).length, 0, 'flagged a cost change as a price change');
});

test('and the same cost change with a changed markup IS drift', () => {
  const input = scenario({ lineCost: 6, linePrice: 8.7, qty: 1000 }); // x1.45, not x1.8182
  const [f] = drift(input);
  assert.ok(f);
  assert.match(f.detail, /×1\.4500/);
  assert.match(f.detail, /×1\.8182/);
});

test('no catalog captured means "could not check", never "clean"', () => {
  const input = scenario({ lineCost: 4, linePrice: 7.2, qty: 1000, catalog: null });
  assert.equal(input.catalog.size, 0);
  assert.equal(drift(input).length, 0);
  assert.ok(
    !audit(input).passed.some((p) => p.rule === 'catalog.drift'),
    'claimed the lines were clean without having the catalog',
  );
  const note = audit(input).notes.find((n) => n.rule === 'catalog.drift');
  assert.ok(note);
  assert.match(note.message, /not captured/);
});

test('it names the catalog item when the line was renamed', () => {
  // "Aluminum Soffit Install" on a line, "Vinyl Soffit Install" in the catalog.
  const input = scenario({
    lineCost: 4, linePrice: 5.8, qty: 1000, lineName: 'Aluminum Soffit Install',
    catalog: { name: 'Vinyl Soffit Install' },
  });
  const [f] = drift(input);
  assert.ok(f);
  assert.match(f.detail, /called "Vinyl Soffit Install"/);
});

// ---- how it divides work with the cost-type rule -----------------------------

test('a catalog-linked line is not also judged against the cost type', () => {
  // The catalog is the intent. A line matching a catalog item priced at x1.45
  // under cost type Labor is correct, and must not be raised twice — or at all.
  const input = scenario({
    lineCost: 4, linePrice: 5.8, qty: 1000,
    catalog: { unitCost: 4, unitPrice: 5.8 }, // catalog itself is x1.45 under Labor
  });
  assert.equal(drift(input).length, 0, 'line matches its catalog item');
  assert.equal(
    audit(input).findings.filter((f) => f.rule === 'markup.off-policy').length,
    0,
    'raised a line that matches the catalog',
  );
  // But the fact that the catalog item is off the default is worth saying once.
  const note = audit(input).notes.find((n) => n.rule === 'markup.off-policy');
  assert.ok(note, 'said nothing about a catalog item off the cost-type default');
  assert.match(note.message, /off the cost-type default/);
});

test('a hand-typed line is still judged against the cost type', () => {
  // Nothing to compare it to, so the cost type is the only reference there is.
  const f = structuredClone(base);
  f.catalog = [];
  const input = fromFixture(f);
  assert.ok(
    audit(input).findings.some((x) => x.rule === 'markup.off-policy'),
    'stopped checking lines it has no catalog for',
  );
});
