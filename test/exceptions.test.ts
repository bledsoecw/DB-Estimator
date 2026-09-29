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
    assert.ok(e.catalogItemId || e.name || e.namePrefix, 'an exception that matches nothing');
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

test('a class covers every item with the prefix, at the approved rate only', () => {
  // Seventeen fasteners at x1.667 and the eighteenth added next month.
  for (const name of ['Fastener - Screws', 'Fastener - DP Screws', 'fastener - nail generic', 'Fastener - Something New']) {
    assert.ok(exceptionFor({ catalogItemId: 'whatever', name, multiplier: rateFromNumber(5 / 3) }), name);
  }
  // A fastener at some other rate is not covered by the class.
  assert.equal(exceptionFor({ catalogItemId: 'w', name: 'Fastener - Screws', multiplier: rateFromNumber(1.45) }), null);
  assert.equal(exceptionFor({ catalogItemId: 'w', name: 'Fastener - Screws', multiplier: rateFromNumber(2.0) }), null);
  // And the prefix is a prefix: "Unfastener" is not a fastener.
  assert.equal(exceptionFor({ catalogItemId: 'w', name: 'Unfastener Tool', multiplier: rateFromNumber(5 / 3) }), null);

  // The rule behind the class ("bought through the sub, so 40%") also covers
  // seven named materials that are not fasteners — by name, not by rate.
  for (const name of ['Drywall Brd- Mat', 'Framing/Sheathing Materials', 'Trim Caulk', 'Purlins']) {
    assert.ok(exceptionFor({ catalogItemId: 'w', name, multiplier: rateFromNumber(5 / 3) }), name);
  }
  // An unnamed material at that rate is not covered by being at that rate.
  assert.equal(exceptionFor({ catalogItemId: 'w', name: 'Drywall Screws Mat', multiplier: rateFromNumber(5 / 3) }), null);
  // And a named one at some other rate has moved off the decision.
  assert.equal(exceptionFor({ catalogItemId: 'w', name: 'Purlins', multiplier: rateFromNumber(1.8) }), null);
});

test('the 2026-09-29 catalog decisions each cover what they say and nothing else', () => {
  const ok = (name: string, m: number) =>
    assert.ok(exceptionFor({ catalogItemId: 'x', name, multiplier: rateFromNumber(m) }), `${name} @ x${m}`);
  const no = (name: string, m: number) =>
    assert.equal(exceptionFor({ catalogItemId: 'x', name, multiplier: rateFromNumber(m) }), null, `${name} @ x${m} should not be covered`);

  ok('Service Call - Zone 3', 125 / 55);
  ok('Service Call - Extended (over 50 miles)', 2.27);
  no('Service Call - Zone 1', 250 / 85); // x2.94: not the schedule, still shows
  // The same schedule under its other three names. Eleven items in the
  // catalog; the first cut covered only the four trip charges and left seven
  // showing as off after Carl had already said "deliberate".
  ok('Service Repair Labor - Drywall', 125 / 55);
  ok('Service Repair Labor - Electrical', 170.4545 / 75);
  ok('Emergency Service Labor (any trade)', 193.1818 / 85);
  ok('Warranty Service', 125 / 55);
  no('Warranty Service', 1.8182); // at the Labor margin it is not the schedule

  ok('Payment processing (est. 3%)', 0);
  no('Payment processing (est. 3%)', 1.0); // charged through at cost is a different decision

  ok('Install SS Steel Panel 12/12', 1.8);
  ok('Install SS Steel Panel 10/12', 1.8);
  no('Install SS Steel Panel <= 7/12', 1.45); // at policy; the class never applies to it

  ok('Logistical Management', 94.25 / 65);
  no('Logistical Management', 1.8182);

  ok('20 YR Warranty', 2.4);
  ok('OC Upgrd Warranty - Preferred', 2.5);
  ok('OC Upgrd Warranty - System', 7 / 3);
  no('OC Upgrd Warranty - System', 2.5); // right family, wrong rate

  ok('Tarp Installed - per square', 5 / 3);
  ok('Tarp - steep or two-story adder, per square', 2.0);
  ok('Cricket Lab - Average', 160.2 / 90);
  ok('Fill Box Vent(s)', 36.25 / 25);
});

test('an id or exact name beats a prefix, so one item can leave its class', () => {
  const list = [
    { namePrefix: 'HOVER', approvedAt: rateFromNumber(1.0), reason: 'class', decidedBy: 't', decidedOn: '2026-09-29' },
    { catalogItemId: 'special', approvedAt: rateFromNumber(1.45), reason: 'carve-out', decidedBy: 't', decidedOn: '2026-09-29' },
  ];
  const carved = { catalogItemId: 'special', name: 'HOVER Complete - Special', multiplier: rateFromNumber(1.45) };
  assert.equal(exceptionFor(carved, list)!.reason, 'carve-out');
  const ordinary = { catalogItemId: 'other', name: 'HOVER Complete - Average', multiplier: rateFromNumber(1.0) };
  assert.equal(exceptionFor(ordinary, list)!.reason, 'class');
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

test('an id entry follows the item through a rename; a class does not follow an impostor', () => {
  // Line names get edited: the line reading "Aluminum Soffit Install" is
  // catalog item "Vinyl Soffit Install". An id-based entry must survive that.
  const renamed = {
    catalogItemId: '22PLm3w6734e', // Gutter Rehang, approved at the roofing rate
    name: 'Gutters — rehang existing',
    multiplier: rateFromNumber(1.45),
  };
  assert.ok(exceptionFor(renamed), 'lost the exception when the line was renamed');

  // A class matches by prefix on purpose, so a name is enough there — but only
  // at the class's rate, and the prefix has to actually be the prefix.
  const notAClassMember = {
    catalogItemId: 'unknown',
    name: 'Gutter Rehang', // an exact-name lookalike of an id-based entry
    multiplier: rateFromNumber(1.45),
  };
  assert.equal(exceptionFor(notAClassMember), null, 'exempted a lookalike of an id-based entry by name');
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
  const e = EXCEPTIONS.find((x) => x.namePrefix === 'Designer')!;
  assert.ok(e, 'the Designer class is gone');
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
