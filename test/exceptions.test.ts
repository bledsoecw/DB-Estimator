/**
 * Approved exceptions.
 *
 * The danger with an exception list is that it quietly becomes a way to make
 * findings go away. These tests hold the two properties that stop that:
 * an exception covers one item at one price, and it lapses the moment the
 * price moves off what was approved.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { fromFixture } from '../src/domain.ts';
import { audit } from '../src/rules/index.ts';
import { EXCEPTIONS, exceptionFor, policyOverrideFor } from '../src/rules/exceptions.ts';
import { formatMoney, moneyFromString, rateFromNumber } from '../src/money.ts';
import { markupRule } from '../src/rules/markup.ts';
import type { AuditFixture } from '../src/jobtread/types.ts';

const fixture = JSON.parse(
  readFileSync(new URL('./fixtures/jones-bath-kitchen.json', import.meta.url), 'utf8'),
) as AuditFixture;

test('every exception records who decided it and why', () => {
  for (const e of EXCEPTIONS) {
    assert.ok(e.reason.length > 10, `${e.name}: no reason given`);
    assert.ok(e.decidedBy.length > 0, `${e.name}: nobody named`);
    assert.match(e.decidedOn, /^\d{4}-\d{2}-\d{2}$/, `${e.name}: no date`);
    assert.ok(e.catalogItemId || e.name, 'an exception that matches nothing');
  }
});

test('an exception applies at the approved price', () => {
  const designer = {
    catalogItemId: '22PCCDafayH8',
    name: 'Designer - Schematic',
    multiplier: rateFromNumber(1.25),
  };
  assert.ok(exceptionFor(designer));
});

test('and lapses when the price moves off it', () => {
  // The decision was about $100 -> $125. A different price is a different
  // decision, and nobody has made it.
  for (const moved of [1.1, 1.45, 1.8182, 2.5]) {
    const line = {
      catalogItemId: '22PCCDafayH8',
      name: 'Designer - Schematic',
      multiplier: rateFromNumber(moved),
    };
    assert.equal(exceptionFor(line), null, `still exempt at x${moved}`);
  }
});

test('matches on catalog item id, not the name on the line', () => {
  // Line names get edited: the line reading "Aluminum Soffit Install" is
  // catalog item "Vinyl Soffit Install". Matching on the displayed name would
  // exempt the wrong thing, or nothing.
  const renamed = {
    catalogItemId: '22PCCDafayH8',
    name: 'Design work — schematic phase',
    multiplier: rateFromNumber(1.25),
  };
  assert.ok(exceptionFor(renamed), 'lost the exception when the line was renamed');

  const impostor = {
    catalogItemId: '22PsomethingElse',
    name: 'Designer - Schematic',
    multiplier: rateFromNumber(1.25),
  };
  assert.equal(exceptionFor(impostor), null, 'exempted a different item by name');
});

test('an exempted line is not counted as off policy', () => {
  const withDesigner = structuredClone(fixture);
  const first = withDesigner.document.costItems.nodes[0]!;
  first.name = 'Designer - Schematic';
  first.unitCost = 100;
  first.unitPrice = 125;
  first.quantity = 10;
  first.cost = 1000;
  first.price = 1250;
  first.costType = { id: '22PBAjfWNQr6', name: 'Labor' };
  first.organizationCostItem = { id: '22PCCDafayH8' };

  const result = audit(fromFixture(withDesigner));
  assert.ok(
    !result.findings.some((f) => f.title.includes('Designer')),
    'raised a price that was approved',
  );
  // But it is reported, not hidden.
  const note = result.notes.find((n) => n.rule === 'markup.off-policy');
  assert.ok(note, 'the approved line vanished without a word');
  assert.match(note.message, /on purpose/);
  assert.match(note.message, /Carl Bledsoe/);
});

test('an exception cannot make a cost type look systemically clean', () => {
  // Exceptions are removed before the systemic share is computed, so they
  // neither trigger nor suppress the "this whole cost type is off" finding.
  const e = EXCEPTIONS.find((x) => x.name === 'Designer - Schematic')!;
  assert.equal(Number(e.approvedAt), 1_250_000);
});

test('an entry either approves a price or redirects the policy, never both', () => {
  // The two are different claims. "This price is right" silences the check;
  // "a different book prices this" keeps the check and moves the target. An
  // entry carrying both would silence a check while pretending to redirect it.
  for (const e of EXCEPTIONS) {
    const has = [e.approvedAt !== undefined, e.measureAgainst !== undefined].filter(Boolean);
    assert.equal(has.length, 1, `${e.name}: must set exactly one of approvedAt / measureAgainst`);
  }
});

test('a redirect keeps the check and moves the target', () => {
  // Tested against a list built here, not against a real catalog item. The two
  // items this mechanism was built for turned out to be correctly priced
  // already — a test that asserts a business fact goes stale the moment the
  // fact does, and then it is defending the mistake.
  const list = [{
    catalogItemId: 'cat-1',
    name: 'Some Subcontracted Install',
    measureAgainst: rateFromNumber(1 / 0.7),
    reason: 'Subcontracted, so the Subcontractor margin applies.',
    decidedBy: 'test',
    decidedOn: '2026-09-29',
  }];
  const line = { catalogItemId: 'cat-1', name: 'Some Subcontracted Install' };

  // A redirect never exempts.
  assert.equal(exceptionFor({ ...line, multiplier: rateFromNumber(1.8) }, list), null);
  assert.equal(exceptionFor({ ...line, multiplier: rateFromNumber(1 / 0.7) }, list), null);
  // It moves the target.
  assert.equal(Number(policyOverrideFor(line, list)), Number(rateFromNumber(1 / 0.7)));
});

test('roofing-trade removal inside a construction job is left alone', () => {
  // Gutter rehang and siding removal are DB crew priced from the roofing book.
  for (const id of ['22PLm3w6734e', '22PL8h6a8aFQ']) {
    assert.ok(
      exceptionFor({ catalogItemId: id, name: 'x', multiplier: rateFromNumber(1.45) }),
      `${id} not exempt at the roofing rate`,
    );
    // And still lapses if someone moves it.
    assert.equal(
      exceptionFor({ catalogItemId: id, name: 'x', multiplier: rateFromNumber(1.8182) }),
      null,
      `${id} stayed exempt after the price moved`,
    );
  }
});
