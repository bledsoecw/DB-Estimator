/**
 * The write path: the plan from a draft, the gate, the exact mutations, the
 * writer's allowlist for them, and the check after the writes.
 *
 * The fixture is a hand-written pass-2 draft in the Haag basement's shape
 * (paint-or-frame the walls, LVP-or-epoxy floor, a ceiling-paint add-on,
 * four open items) against the two X-Division templates, with the real
 * units, cost types, cost codes and catalog items read on 2026-10-01. The
 * plan it makes is the one that was applied to test job 25-0000 that day.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import type { Template } from '../src/draft/templates.ts';
import { CONTINGENCY_FORMULA, CONTINGENCY_GROUP, CONTINGENCY_LINE } from '../src/draft/contingency.ts';
import {
  DRAFT_TAG, GENERAL_DESCRIPTION, OPTIONS_GROUP,
  attachNotes, catalogIdsOf, countItems, deleteMutation, gateBuild, groupMutation, parametersMutation, parseMoney, planBuild, planLines, planText, pricedIdsOf, selectionGroups, verifyBuild,
  type BuildPlan, type BuildRecord, type DraftFile, type NewGroup, type NewItem,
} from '../src/draft/build.ts';
import { askYesNo, namesFromFixture, parseBuildArgs, planFile, readRecord, recordPaths, type BuildFixture } from '../src/build-cli.ts';
import { PassThrough, Readable } from 'node:stream';
import { assertAllowed } from '../src/jobtread/writer.ts';
import type { ApiBudget } from '../src/jobtread/types.ts';

const fx = JSON.parse(readFileSync('test/fixtures/build-sample.json', 'utf8')) as BuildFixture;
const templates = new Map(fx.templates.map((t) => [t.id, t]));
const names = namesFromFixture(fx.names);
const priced = new Map(Object.entries(fx.priced));
const plan = (draft: DraftFile = fx.draft): BuildPlan => planBuild(draft, templates, names, priced);

const UNITS = fx.names.units;
const TYPES = fx.names.costTypes;
const CODES = fx.names.costCodes;

/** The group called `name` directly under `g`. */
const sub = (g: NewGroup, name: string): NewGroup => {
  const hit = g.lineItems.find((li): li is NewGroup => li._type === 'costGroup' && li.name === name);
  if (!hit) throw new Error(`no group "${name}" under ${g.name} (has ${g.lineItems.map((li) => li.name).join(', ')})`);
  return hit;
};
const items = (g: NewGroup): NewItem[] => g.lineItems.filter((li): li is NewItem => li._type === 'costItem');
const allItems = (g: NewGroup): NewItem[] => g.lineItems.flatMap((li) => (li._type === 'costGroup' ? allItems(li) : [li]));
/** The selection group called `name`, wherever it sits. */
const sel = (p: BuildPlan, name: string): NewGroup => {
  const hit = selectionGroups(p.groups).find((g) => g.name === name);
  if (!hit) throw new Error(`no selection "${name}" (has ${selectionGroups(p.groups).map((g) => g.name).join(', ')})`);
  return hit;
};
const top = (p: BuildPlan, name: string): NewGroup => {
  const g = p.groups.find((x) => x.name === name);
  if (!g) throw new Error(`no top-level group "${name}" (has ${p.groups.map((x) => x.name).join(', ')})`);
  return g;
};

test('the plan: one group per template, selections inside their sections, no options or contingency group; every line counted once', () => {
  const p = plan();
  // Carl, 2026-10-02: no CUSTOMER OPTIONS group and no Phase 5.
  assert.deepEqual(p.groups.map((g) => g.name), ['FINISHES', 'GENERAL REQUIREMENTS']);
  assert.deepEqual(p.counts, { lines: 11, found: 3, created: 3, options: 3 });
  // 11 kept + 3 found + 3 created + the base contingency line + a contingency share in each of the 5 choices.
  assert.equal(p.groups.reduce((n, g) => n + countItems(g), 0), 23);
  assert.equal(p.pass, 2);
  assert.equal(p.jobId, '22PDZbwDdZfq');
  assert.deepEqual(p.notes, []);
});

test('a kept line goes into its template section, in template order, as a job line priced from its catalog item', () => {
  const paint = sub(top(plan(), 'FINISHES'), 'Paint');
  assert.deepEqual(items(paint).map((i) => i.name), ['Primer', 'Paint', 'Paint Labor']);
  const primer = items(paint)[0]!;
  assert.equal(primer.organizationCostItemId, '22PCCE2t6Uci');
  assert.equal(primer.unitId, UNITS['Gallons']);
  assert.equal(primer.costTypeId, TYPES['Materials']);
  assert.equal(primer.costCodeId, CODES['Finishes']);
  assert.equal(primer.quantity, 4);
  assert.equal(primer.unitCost, 30);
  assert.equal(primer.unitPrice, 43.5);
  assert.equal(primer.description, 'Primer material for newly installed drywall.');
  // The supplement's lines sit in their own sections under its scope group.
  const gr = top(plan(), 'GENERAL REQUIREMENTS');
  assert.deepEqual(gr.lineItems.map((li) => li.name), ['Permits', 'Project/Site Management']);
  assert.equal(items(sub(gr, 'Project/Site Management'))[0]!.quantity, 8);
});

test('the job\'s description goes on the main scope group, named for the job; no General Description line', () => {
  const p = plan();
  assert.equal(top(p, 'FINISHES').description, fx.draft.scopeOfWork);
  assert.ok(!p.groups.flatMap(allItems).some((i) => i.name === GENERAL_DESCRIPTION));
  // Carl, 2026-10-02 (the NEW POOL HOUSE SCOPE budget): the top reads what the job is.
  const named = plan({ ...fx.draft, scopeTitle: 'Basement finish' });
  assert.deepEqual(named.groups.map((g) => g.name), ['BASEMENT FINISH SCOPE', 'GENERAL REQUIREMENTS']);
  assert.equal(named.groups[0]!.description, fx.draft.scopeOfWork);
  assert.equal(plan({ ...fx.draft, scopeTitle: 'Pool house scope' }).groups[0]!.name, 'POOL HOUSE SCOPE');
  // Renamed, it still holds the template's own sections, in the template's order, not a second scope group.
  assert.deepEqual(
    named.groups[0]!.lineItems.filter((li) => li._type === 'costGroup').map((li) => li.name),
    ['Flooring', 'Drywall/Plaster', 'Paint'],
  );
});

test('a found line is built once, priced from today\'s catalog item, in the section the model named or the primary\'s group', () => {
  const p = plan();
  const every = p.groups.flatMap(allItems);
  // Found lines are also in `lines`; they must not be built twice.
  assert.equal(every.filter((i) => i.name === 'Crew Labor').length, 1);
  assert.equal(every.filter((i) => i.name === 'Vapor Barrier 4 mil').length, 1);
  assert.equal(every.filter((i) => i.name === 'Insulation - Batt').length, 1);
  // No section named: the primary's scope group itself.
  const crew = items(top(p, 'FINISHES')).find((i) => i.name === 'Crew Labor')!;
  assert.equal(crew.organizationCostItemId, '22PCCDhb8Dff');
  assert.equal(crew.quantity, 6);
  assert.equal(crew.unitCost, 55);
  assert.equal(crew.unitPrice, 100);
  assert.equal(crew.costCodeId, CODES['General Requirements']);
  // With an option: the choice group, priced from the item the template line points at (Siding is the item's code).
  const framed = sub(sel(p, 'Walls'), 'Framed false walls');
  const batt = items(framed).find((i) => i.name === 'Insulation - Batt')!;
  assert.equal(batt.organizationCostItemId, '22PL8kUmtfhn');
  assert.equal(batt.quantity, 909);
  assert.equal(batt.unitCost, 1.3);
  assert.equal(batt.unitPrice, 1.885);
  assert.equal(batt.unitId, UNITS['Square Foot']);
  assert.equal(batt.costCodeId, CODES['Siding']);
});

test('a found line whose section is in no template that was read lands in the primary\'s group, with a note', () => {
  const draft: DraftFile = {
    ...fx.draft,
    found: fx.draft.found!.map((f) => (f.name === 'Crew Labor' ? { ...f, placeIn: { template: 'X-Division 06 Wood & Plastics', group: 'WOOD & PLASTICS › Framing Materials', groupId: 'not-read' } } : f)),
  };
  const p = plan(draft);
  assert.ok(items(top(p, 'FINISHES')).some((i) => i.name === 'Crew Labor'));
  assert.ok(p.notes.some((n) => /not-read .*X-Division 06.*no template that was read/.test(n)), p.notes.join('\n'));
});

test('options: each selection sits in the section of its work; two choices make one required pick, one choice an add-on', () => {
  const p = plan();
  assert.deepEqual(selectionGroups(p.groups).map((g) => g.name), ['Flooring', 'Walls', 'Ceiling paint']);
  // No section named in this draft: each goes where its first line's work is.
  const fin = top(p, 'FINISHES');
  assert.ok(sub(fin, 'Flooring').lineItems.includes(sel(p, 'Flooring')));
  assert.ok(sub(fin, 'Drywall/Plaster').lineItems.includes(sel(p, 'Walls')));
  assert.ok(sub(fin, 'Paint').lineItems.includes(sel(p, 'Ceiling paint')));
  // A section the draft names wins.
  const placed = plan({ ...fx.draft, optionPlaces: [{ group: 'Walls', placeIn: { template: 'X-Division 09 Finishes', group: 'FINISHES › Paint', groupId: '22PLCchBuFMY' } }] });
  assert.ok(sub(top(placed, 'FINISHES'), 'Paint').lineItems.includes(sel(placed, 'Walls')));
  assert.ok(!top(placed, 'FINISHES').lineItems.some((li) => li.name === 'Drywall/Plaster'), 'no empty section is made');
  const flooring = sel(p, 'Flooring');
  assert.equal(flooring.minSelectionsRequired, 1);
  assert.equal(flooring.maxSelectionsAllowed, 1);
  assert.equal(flooring.showChildDeltas, true);
  assert.deepEqual(flooring.lineItems.map((li) => [li.name, (li as NewGroup).isSelected]), [['LVP', true], ['Epoxy', false]]);
  // Each choice ends with its own contingency share (tested on its own below).
  assert.deepEqual(items(sub(flooring, 'LVP')).map((i) => [i.name, i.quantity]), [['Flooring', 650], ['Flooring Labor', 20], [CONTINGENCY_LINE, 348]]);
  assert.deepEqual(items(sub(flooring, 'Epoxy')).map((i) => [i.name, i.quantity, i.costTypeId]), [['Flooring - Sub', 650, TYPES['Subcontractor']], [CONTINGENCY_LINE, 390, TYPES['Other']]]);
  const ceiling = sel(p, 'Ceiling paint');
  assert.equal(ceiling.minSelectionsRequired, 0);
  assert.equal(ceiling.maxSelectionsAllowed, 1);
  assert.deepEqual(ceiling.lineItems.map((li) => [li.name, (li as NewGroup).isSelected]), [['Ceiling paint', false]]);
});

test('open items are created on the job, tagged, priced from history or the ballpark; a catalog match at quantity 0', () => {
  const p = plan();
  const walls = sel(p, 'Walls');
  const framed = items(sub(walls, 'Framed false walls'));
  // The catalog match: the item, no count yet, so 0 — a null quantity would bill one unit.
  const elec = framed.find((i) => i.name === `Electrical Labor ${DRAFT_TAG}`)!;
  assert.equal(elec.organizationCostItemId, '22PLiT7FjgXV');
  assert.equal(elec.quantity, 0);
  assert.equal(elec.unitCost, 55);
  assert.equal(elec.costCodeId, CODES['Electrical']);
  // The reasoning is the team's: it goes in Internal Notes, and the description is the catalog item's own.
  assert.match(elec.jobNote!, /^For this job: Extend or relocate outlets/);
  assert.match(elec.jobNote!, /quantity is 0 until the rep sets it/);
  assert.ok(!/quantity is 0/.test(elec.description ?? ''), 'nothing for the team in what an estimate may show');
  // History-priced, created from scratch, on the cost code of the section it is placed in (Drywall/Plaster: Finishes).
  const lumber = framed.find((i) => i.name === `Framing lumber for the false walls ${DRAFT_TAG}`)!;
  assert.equal(lumber.organizationCostItemId, undefined);
  assert.equal(lumber.quantity, 120);
  assert.equal(lumber.unitCost, 3.55);
  assert.equal(lumber.unitPrice, 5.92);
  assert.equal(lumber.unitId, UNITS['Linear Feet']);
  assert.equal(lumber.costTypeId, TYPES['Materials']);
  assert.equal(lumber.costCodeId, CODES['Finishes']);
  assert.match(lumber.jobNote!, /Priced from DB history: 25-0003/);
  assert.equal(lumber.description, null);
  // The ballpark, in the other choice, says so loudly.
  const paint = items(sub(walls, 'Paint the block')).filter((i) => i.name !== CONTINGENCY_LINE);
  assert.equal(paint.length, 1);
  assert.equal(paint[0]!.name, `Mold-resistant concrete paint ${DRAFT_TAG}`);
  assert.equal(paint[0]!.unitCost, 0.45);
  assert.equal(paint[0]!.unitPrice, 0.6525);
  assert.match(paint[0]!.jobNote!, /regional ballpark, NOT DB pricing/);
  // Placed in Paint, whose lines are Finishes: never General Requirements by default.
  assert.equal(paint[0]!.costCodeId, CODES['Finishes']);
  // The sections named for a line with an option do not pull it out of its choice group.
  assert.deepEqual(planLines(p.groups).filter((x) => !x.inOption && x.item.name.endsWith(DRAFT_TAG)), []);
});

test('a gap the catalog resolved is not created again; a gap with no quantity is created at 0 and says so', () => {
  const p = plan();
  const every = p.groups.flatMap(allItems).map((i) => i.name);
  for (const resolved of ['Plastic vapor barrier', 'Batt insulation in the false walls', 'Protect the floor']) {
    assert.ok(!every.some((n) => n.startsWith(resolved)), `${resolved} was built again`);
  }
  const draft: DraftFile = { ...fx.draft, gaps: [{ ...fx.draft.gaps![0]!, quantity: null, catalogMatch: null }] };
  const q = plan(draft);
  const line = q.groups.flatMap(allItems).find((i) => i.name.startsWith('Mold-resistant'))!;
  assert.equal(line.quantity, 0);
  assert.match(line.jobNote!, /quantity is 0 until the rep sets it/);
});

test('an open item without a section and without an option goes into the primary\'s group', () => {
  const draft: DraftFile = { ...fx.draft, gaps: [{ ...fx.draft.gaps![0]!, option: null, placeIn: null }] };
  const line = items(top(plan(draft), 'FINISHES')).find((i) => i.name.startsWith('Mold-resistant'));
  assert.ok(line);
});

test('the contingency is on the base scope AS BUILT, with the formula and the parameters, in the scope group; no Phase 5', () => {
  const p = plan();
  assert.ok(!p.groups.some((g) => g.name === CONTINGENCY_GROUP));
  // This template has no Phase 1, so the base line ends the main scope group (the Phase 1 case is tested below).
  assert.equal(p.contingencyGroup, 'FINISHES');
  const line = items(top(p, 'FINISHES')).at(-1)!;
  assert.equal(line.name, CONTINGENCY_LINE);
  assert.equal(line.organizationCostItemId, fx.names.contingencyItemId);
  // FINISHES $2,280 + GENERAL REQUIREMENTS $440 of cost as built (the draft's own base figure, $2,380, is not used), at 8%.
  assert.equal(line.quantity, 217.6);
  assert.equal(line.quantityFormula, CONTINGENCY_FORMULA);
  assert.equal(line.unitCost, 1);
  assert.equal(line.unitPrice, 1);
  assert.match(line.description!, /8% on the base scope/);
  assert.match(line.description!, /each option carries its own share/);
  assert.equal(p.contingencyQuantity, 217.6);
  assert.deepEqual(p.parameters, [{ name: 'Contingency Rate', value: 8 }, { name: 'Contingency Base', value: 2720 }]);
  assert.equal(p.contingency!.base, 2720);
  assert.equal(p.contingency!.amount, 217.6);
});

test('each option carries its own contingency share inside its choice group, so the budget\'s contingency follows the pick', () => {
  const p = plan();
  // contingency(base + choice) − contingency(base): LVP $4,350 → $565.60 − $217.60.
  assert.deepEqual(p.contingency!.shares, [
    { group: 'Flooring', choice: 'LVP', cost: 4350, amount: 348 },
    { group: 'Flooring', choice: 'Epoxy', cost: 4875, amount: 390 },
    { group: 'Walls', choice: 'Framed false walls', cost: 2610.75, amount: 208.86 },
    { group: 'Walls', choice: 'Paint the block', cost: 409.05, amount: 32.72 },
    { group: 'Ceiling paint', choice: 'Ceiling paint', cost: 2567.5, amount: 205.4 },
  ]);
  const opts = selectionGroups(p.groups);
  const lvp = items(sub(sel(p, 'Flooring'), 'LVP'));
  const share = lvp.at(-1)!;
  assert.equal(share.name, CONTINGENCY_LINE);
  assert.equal(share.quantity, 348);
  assert.equal(share.unitCost, 1);
  assert.equal(share.unitPrice, 1);
  assert.equal(share.quantityFormula, undefined);
  assert.equal(share.organizationCostItemId, fx.names.contingencyItemId);
  assert.match(share.description!, /8% on this option.*comes with the option when the customer takes it/);
  // Every choice has exactly one share, after its own lines; the base line is the only one with the formula.
  for (const og of opts) {
    for (const ch of og.lineItems) {
      const shares = items(ch as NewGroup).filter((i) => i.name === CONTINGENCY_LINE);
      assert.equal(shares.length, 1, `${og.name} › ${ch.name}`);
      assert.equal(items(ch as NewGroup).at(-1), shares[0]);
    }
  }
  assert.equal(p.groups.flatMap(allItems).filter((i) => i.quantityFormula).length, 1);
  // Base + the pre-selected choices' shares is 8% of the budget as the customer first sees it.
  const first = 217.6 + 348 + 208.86;
  assert.equal(Math.round(first * 100), Math.round((2720 + 4350 + 2610.75) * 0.08 * 100));
});

test('no contingency item, or no contingency in the draft: no group, no parameters, a note when the item is missing', () => {
  const none = planBuild(fx.draft, templates, { ...names, contingencyItemId: null }, priced);
  assert.ok(!none.groups.some((g) => g.name === CONTINGENCY_GROUP));
  assert.deepEqual(none.parameters, []);
  assert.equal(none.contingencyQuantity, null);
  assert.equal(none.contingency, null);
  assert.ok(!none.groups.flatMap(allItems).some((i) => i.name === CONTINGENCY_LINE));
  assert.ok(none.notes.some((n) => /Project Contingency/.test(n)));
  const without = plan({ ...fx.draft, contingency: null });
  assert.ok(!without.groups.some((g) => g.name === CONTINGENCY_GROUP));
  assert.deepEqual(without.notes, []);
});

test('a template line with no unit is created with none; one pointing at no catalog item is created unpriced and noted', () => {
  const permit = items(sub(top(plan(), 'GENERAL REQUIREMENTS'), 'Permits'))[0]!;
  assert.equal(permit.unitId, null);
  assert.equal(permit.unitPrice, null);
  assert.equal(permit.unitCost, 0);
  const fin = templates.get('22PLCZU3cbqS')!;
  const broken: Template = { ...fin, lines: fin.lines.map((l) => (l.name === 'Primer' ? { ...l, priced: null } : l)) };
  const p = planBuild(fx.draft, new Map([...templates, [fin.id, broken]]), names, priced);
  const primer = allItems(top(p, 'FINISHES')).find((i) => i.name === 'Primer')!;
  assert.equal(primer.organizationCostItemId, undefined);
  assert.equal(primer.unitCost, null);
  assert.ok(p.notes.some((n) => /"Primer" in X-Division 09 Finishes points at no catalog item/.test(n)));
});

test('an unknown unit, cost type or cost code is noted; a missing General Requirements code is fatal', () => {
  const thin = namesFromFixture({ ...fx.names, units: { 'Lump Sum': UNITS['Lump Sum']! }, costCodes: { 'General Requirements': CODES['General Requirements']! } });
  const p = planBuild(fx.draft, templates, thin, priced);
  assert.ok(p.notes.some((n) => n === 'no unit named "Gallons" in the organization; the line is created without one'));
  assert.ok(p.notes.some((n) => n === 'no cost code named "Finishes"; General Requirements used'));
  const primer = allItems(top(p, 'FINISHES')).find((i) => i.name === 'Primer')!;
  assert.equal(primer.unitId, null);
  assert.equal(primer.costCodeId, CODES['General Requirements']);
  assert.throws(
    () => planBuild(fx.draft, templates, namesFromFixture({ ...fx.names, costCodes: {} }), priced),
    /no "General Requirements" cost code/,
  );
});

test('a draft with no fit, or a line in no template that was read, is refused or skipped with a note', () => {
  assert.throws(() => plan({ ...fx.draft, noFit: 'a roof, not a remodel' }), /nothing to build.*a roof, not a remodel/);
  const p = plan({ ...fx.draft, lines: [...fx.draft.lines, { lineId: 'ghost', name: 'Ghost', template: 'X-Division 09 Finishes', quantity: 1, unit: null, option: null }] });
  assert.ok(p.notes.some((n) => /line ghost "Ghost" is in no template that was read; skipped/.test(n)));
  assert.equal(p.counts.lines, 11);
});

test('planText reads as the tree the rep will see', () => {
  const text = planText(plan());
  assert.match(text, /^Build pass 2 of 25-0000 Kay Oss_Test Job 1 into its budget: 2 top-level groups, 11 template lines, 3 from the catalog, 3 created, 3 option groups\./);
  assert.match(text, /\nFINISHES\n  Flooring\n    Flooring \[select: min 1, max 1\]\n      LVP \[selected\]\n        - Flooring: 650 · \$5 \/ \$7\.25\n/);
  assert.match(text, /\n  Paint\n    - Primer: 4 · \$30 \/ \$43\.5\n/);
  assert.match(text, /\n    Ceiling paint \[select: min 0, max 1\]\n/);
  assert.match(text, /- Framing lumber for the false walls \(DRAFT - Carl confirms\): 120 · \$3\.55 \/ \$5\.92 · no catalog item/);
  assert.match(text, /- Project Contingency: 217\.6 = \{Contingency Base\} \* \{Contingency Rate\} \/ 100 · \$1 \/ \$1/);
  assert.match(text, /\n        - Project Contingency: 348 · \$1 \/ \$1\n/);
  assert.match(text, /\nContingency 8%: \$217\.60 on the \$2720\.00 base scope; inside each option: Flooring — LVP \+\$348\.00, Flooring — Epoxy \+\$390\.00, Walls — Framed false walls \+\$208\.86, Walls — Paint the block \+\$32\.72, Ceiling paint — Ceiling paint \+\$205\.40\n/);
  assert.match(text, /\nJob parameters: Contingency Rate = 8, Contingency Base = 2720\n/);
  assert.match(text, /\nCHECK BEFORE --apply \(0 problems, 3 to check\):\n  1\. check: 1 line has no count yet and cost nothing until the rep sets it: "Electrical Labor"\.\n  2\. check: 3 lines were created for Carl to confirm/);
  // The sample's LVP left its supplies behind: the template files Flooring - Miscellaneous MAT beside Flooring.
  assert.match(text, /\n  3\. check: "Flooring — LVP": "Flooring" \(650 Square Foot\) is kept without "Flooring - Miscellaneous MAT"/);
});

test('groupMutation: jobId and the group at the root with no discriminator, nested _type kept, nothing undefined, the created ids asked back', () => {
  const p = plan();
  const m = groupMutation('job1', top(p, 'FINISHES')) as { createCostGroup: { $: Record<string, unknown>; createdCostGroup: Record<string, unknown> } };
  const $ = m.createCostGroup.$;
  assert.equal($['jobId'], 'job1');
  assert.equal($['name'], 'FINISHES');
  assert.ok(!('_type' in $));
  const first = ($['lineItems'] as Record<string, unknown>[])[0]!;
  assert.equal(first['_type'], 'costGroup');
  assert.equal(first['name'], 'Flooring');
  // The selection is nested inside its section, flags and all.
  const selection = (first['lineItems'] as Record<string, unknown>[])[0]!;
  assert.equal(selection['minSelectionsRequired'], 1);
  assert.ok(!JSON.stringify(m).includes('undefined'));
  assert.deepEqual(m.createCostGroup.createdCostGroup, { id: {}, name: {}, descendentCostItems: { $: { size: 100 }, count: {} } });
  // A kept line carries exactly what a job line needs.
  const fin = groupMutation('job1', top(p, 'FINISHES')) as { createCostGroup: { $: { lineItems: Record<string, unknown>[] } } };
  const paint = (fin.createCostGroup.$.lineItems[2] as { lineItems: Record<string, unknown>[] }).lineItems[0]!;
  assert.deepEqual(Object.keys(paint).sort(), ['_type', 'costCodeId', 'costTypeId', 'description', 'name', 'organizationCostItemId', 'quantity', 'unitCost', 'unitId', 'unitPrice']);
});

test('parametersMutation sends {name, value} pairs only and sends the job\'s other parameters back, since the list replaces', () => {
  const m = parametersMutation('job1', [{ name: 'Area', value: 1000 }, { name: 'Depth' }, { name: 'Contingency Rate', value: 10 }], [{ name: 'Contingency Rate', value: 8 }, { name: 'Contingency Base', value: 2380 }]);
  assert.deepEqual(m, {
    updateJob: {
      $: {
        id: 'job1',
        parameters: [
          { name: 'Area', value: 1000 },
          { name: 'Depth', value: null },
          { name: 'Contingency Rate', value: 8 },
          { name: 'Contingency Base', value: 2380 },
        ],
      },
    },
  });
  assert.ok(!JSON.stringify(m).includes('_type'));
  assert.deepEqual(parametersMutation('job1', null, [{ name: 'Contingency Rate', value: 5 }]), { updateJob: { $: { id: 'job1', parameters: [{ name: 'Contingency Rate', value: 5 }] } } });
  assert.deepEqual(deleteMutation('g1'), { deleteCostGroup: { $: { id: 'g1' } } });
});

test('the writer allows updateJob with id and parameters only, and still refuses everything else', () => {
  assert.doesNotThrow(() => assertAllowed(parametersMutation('job1', [], [{ name: 'Contingency Rate', value: 8 }])));
  assert.doesNotThrow(() => assertAllowed(groupMutation('job1', plan().groups[0]!)));
  assert.doesNotThrow(() => assertAllowed(deleteMutation('g1')));
  assert.throws(() => assertAllowed({ updateJob: { $: { id: 'job1', name: 'renamed' } } }), /Refusing "updateJob" with "name": only id, parameters/);
  assert.throws(() => assertAllowed({ updateJob: { $: { id: 'job1', parameters: [], lineItems: [] } } }), /"lineItems"/);
  assert.throws(() => assertAllowed({ deleteCostItem: { $: { id: 'x' } } }), /Refusing to issue "deleteCostItem"/);
  assert.throws(() => assertAllowed({ updateCostItem: { $: { id: 'x', quantity: 1 } } }), /Refusing to issue "updateCostItem"/);
});

const budgetWith = (groups: { id: string; name: string; parent?: string }[]): ApiBudget => ({
  jobId: '22PDZbwDdZfq',
  costItems: { count: 0, nodes: [] },
  costGroups: { count: groups.length, nodes: groups.map((g) => ({ id: g.id, name: g.name, position: null, parentCostGroup: g.parent ? { id: g.parent } : null })) },
});
const STRUCTURAL = [{ id: 'c', name: 'CLOCK IN ITEMS' }, { id: 'b', name: 'BURDEN' }, { id: 'ga', name: 'GENERAL AND ADMINISTRATIVE' }, { id: 'co', name: 'CHANGE ORDER' }];
const TEST_JOB = { id: '22PDZbwDdZfq', name: '25-0000 Kay Oss_Test Job 1' };
const REAL_JOB = { id: '22PbLhMqY7tC', name: '261323 Haag_Remodel' };
const record: BuildRecord = { jobId: TEST_JOB.id, jobName: TEST_JOB.name, pass: 1, builtAt: '2026-10-01T00:00:00Z', groups: [{ id: 'f', name: 'FINISHES' }, { id: 'o', name: OPTIONS_GROUP }], parameters: [] };

test('the gate: a real job needs --live; another job\'s draft goes only on a test job', () => {
  const real = { ...fx.draft, job: REAL_JOB };
  let g = gateBuild({ job: REAL_JOB, draft: real, budget: budgetWith(STRUCTURAL), record: null, live: false, replace: false });
  assert.ok(!g.ok && /not a test job.*--live/.test(g.reason));
  g = gateBuild({ job: REAL_JOB, draft: real, budget: budgetWith(STRUCTURAL), record: null, live: true, replace: false });
  assert.ok(g.ok && g.deletes.length === 0 && g.warnings.length === 0);
  g = gateBuild({ job: REAL_JOB, draft: fx.draft, budget: budgetWith(STRUCTURAL), record: null, live: true, replace: false });
  assert.ok(!g.ok && /the draft is of 25-0000 Kay Oss_Test Job 1.*only on a test job/.test(g.reason));
  g = gateBuild({ job: TEST_JOB, draft: real, budget: budgetWith(STRUCTURAL), record: null, live: false, replace: false });
  assert.ok(g.ok && g.warnings[0] === "building 261323 Haag_Remodel's draft onto the test job 25-0000 Kay Oss_Test Job 1");
});

test('the gate: scope already on the budget needs --replace, and --replace deletes only what the record says this tool built', () => {
  const scope = [...STRUCTURAL, { id: 'f', name: 'FINISHES' }, { id: 'p', name: 'Paint', parent: 'f' }, { id: 'o', name: OPTIONS_GROUP }];
  let g = gateBuild({ job: TEST_JOB, draft: fx.draft, budget: budgetWith(scope), record: null, live: false, replace: false });
  assert.ok(!g.ok && /already has scope on it: "FINISHES", "CUSTOMER OPTIONS".*no record of a build here/.test(g.reason));
  g = gateBuild({ job: TEST_JOB, draft: fx.draft, budget: budgetWith(scope), record, live: false, replace: false });
  assert.ok(!g.ok && /add --replace.*2 groups, 2026-10-01/.test(g.reason));
  g = gateBuild({ job: TEST_JOB, draft: fx.draft, budget: budgetWith(scope), record: null, live: false, replace: true });
  assert.ok(!g.ok && /"FINISHES", "CUSTOMER OPTIONS" are not in its record/.test(g.reason));
  g = gateBuild({ job: TEST_JOB, draft: fx.draft, budget: budgetWith(scope), record, live: false, replace: true });
  assert.ok(g.ok);
  assert.deepEqual(g.ok && g.deletes, [{ id: 'f', name: 'FINISHES' }, { id: 'o', name: OPTIONS_GROUP }]);
  const foreign = [...scope, { id: 'x', name: 'KITCHEN (by hand)' }];
  g = gateBuild({ job: TEST_JOB, draft: fx.draft, budget: budgetWith(foreign), record, live: false, replace: true });
  assert.ok(!g.ok && /"KITCHEN \(by hand\)" is not in its record\. Delete it on the job's Budget tab in JobTread, then build without --replace/.test(g.reason));
});

/** What JobTread would hold after the plan is built: ids made up, structure kept. */
function materialize(p: BuildPlan): ApiBudget {
  const groups: ApiBudget['costGroups']['nodes'] = [];
  const items: ApiBudget['costItems']['nodes'] = [];
  let n = 0;
  const walk = (g: NewGroup, parent: string | null): void => {
    const id = `g${++n}`;
    groups.push({ id, name: g.name, position: null, parentCostGroup: parent ? { id: parent } : null });
    for (const li of g.lineItems) {
      if (li._type === 'costGroup') walk(li, id);
      else {
        items.push({
          id: `i${++n}`, name: li.name, quantity: li.quantity, unitCost: li.unitCost, unitPrice: li.unitPrice,
          cost: (li.quantity ?? 1) * (li.unitCost ?? 0), price: (li.quantity ?? 1) * (li.unitPrice ?? 0),
          isSpecification: false, position: null,
          costType: { id: li.costTypeId ?? '', name: '' }, costCode: { id: li.costCodeId, name: '' },
          costGroup: { id, name: g.name }, organizationCostItem: li.organizationCostItemId ? { id: li.organizationCostItemId } : null,
          documentCostItems: { count: 0 },
        });
      }
    }
  };
  for (const g of p.groups) walk(g, null);
  for (const s of STRUCTURAL) groups.push({ id: s.id, name: s.name, position: null, parentCostGroup: null });
  return { jobId: p.jobId, costItems: { count: items.length, nodes: items }, costGroups: { count: groups.length, nodes: groups } };
}

test('verifyBuild: every top-level group with as many lines as planned, the contingency quantity, the parameters', () => {
  const p = plan();
  const built = materialize(p);
  const params = [{ name: 'Contingency Rate', value: 8 }, { name: 'Contingency Base', value: 2720 }];
  const ok = verifyBuild(p, built, params);
  assert.equal(ok.ok, true, ok.lines.join('\n'));
  assert.deepEqual(ok.lines, [
    'ok: "FINISHES" with 21 lines',
    'ok: "GENERAL REQUIREMENTS" with 2 lines',
    'ok: "Project Contingency" at 217.6 on the base scope (cost $217.6)',
    'ok: 5 option shares inside the choices, $1184.98 in all',
    'ok: parameter Contingency Rate = 8',
    'ok: parameter Contingency Base = 2720',
  ]);
  // A line lost deep in a choice group is a mismatch on its top-level group.
  const short: ApiBudget = { ...built, costItems: { count: built.costItems.count - 1, nodes: built.costItems.nodes.filter((i) => i.name !== 'Flooring Labor') } };
  const bad = verifyBuild(p, short, params);
  assert.equal(bad.ok, false);
  assert.ok(bad.lines.includes('MISMATCH: "FINISHES" holds 20 lines, the plan 21'));
  // The contingency lines without their quantity (what the API does to a formula alone), a parameter dropped.
  const noQty: ApiBudget = { ...built, costItems: { ...built.costItems, nodes: built.costItems.nodes.map((i) => (i.name === CONTINGENCY_LINE ? { ...i, quantity: null } : i)) } };
  const worse = verifyBuild(p, noQty, [{ name: 'Contingency Rate', value: 8 }]);
  assert.ok(worse.lines.includes('MISMATCH: "Project Contingency" quantity is null, the plan 217.6'));
  assert.ok(worse.lines.includes('MISMATCH: 5 option shares of $0.00 on the budget, the plan 5 of $1184.98'));
  assert.ok(worse.lines.includes('MISMATCH: parameter Contingency Base is not set, the plan 2720'));
  // A group missing altogether.
  const gone = verifyBuild(p, budgetWith(STRUCTURAL), params);
  assert.ok(gone.lines.includes('MISSING: "FINISHES" is not on the budget'));
  assert.ok(gone.lines.includes(`MISSING: the "${CONTINGENCY_LINE}" line in "FINISHES"`));
});

test('planFile holds the exact mutations in the order they run: deletes, the parameters, the groups', () => {
  const p = plan();
  const f = planFile(p, [{ id: 'old', name: 'FINISHES' }], [{ name: 'Area', value: 1000 }], 'review/x-draft.json') as { mutations: Record<string, unknown>[]; counts: unknown; plan: string };
  assert.deepEqual(f.mutations.map((m) => Object.keys(m).filter((k) => k !== 'note')[0]), ['deleteCostGroup', 'updateJob', 'createCostGroup', 'createCostGroup']);
  assert.equal(f.mutations[0]!['note'], 'delete "FINISHES"');
  const u = f.mutations[1]!['updateJob'] as { $: { parameters: unknown[] } };
  assert.deepEqual(u.$.parameters, [{ name: 'Area', value: 1000 }, { name: 'Contingency Rate', value: 8 }, { name: 'Contingency Base', value: 2720 }]);
  assert.deepEqual(f.counts, p.counts);
  assert.equal(f.plan, planText(p));
});

test('pricedIdsOf names every found line\'s item and every open catalog match, not the resolved gaps', () => {
  assert.deepEqual(new Set(pricedIdsOf(fx.draft)), new Set(['22PCCDhzbeZ9', '22PL8kUmtfhn', '22PCCDhb8Dff', '22PLiT7FjgXV']));
  assert.deepEqual(pricedIdsOf({ ...fx.draft, found: [], gaps: [] }), []);
});

test('parseMoney reads the page\'s dollars; parseBuildArgs the flags', () => {
  assert.equal(parseMoney('$1,234.5678'), 1234.5678);
  assert.equal(parseMoney('$0.45'), 0.45);
  assert.equal(parseMoney(null), null);
  assert.equal(parseMoney('n/a'), null);
  assert.deepEqual(parseBuildArgs(['25-0000', '--apply', '--replace', '--out', 'r']), { job: '25-0000', draft: null, apply: true, live: false, replace: true, yes: false, noNotes: false, out: 'r', fixture: null });
  assert.equal(parseBuildArgs(['25-0000', '--no-notes']).noNotes, true);
  assert.deepEqual(parseBuildArgs(['--draft', 'review/x.json', '--live']).draft, 'review/x.json');
  assert.deepEqual(parseBuildArgs(['--fixture', 'f.json']).fixture, 'f.json');
  assert.throws(() => parseBuildArgs([]), /usage: npm run build-budget/);
  assert.throws(() => parseBuildArgs(['--fixture', 'f.json', '--apply']), /cannot --apply/);
  assert.throws(() => parseBuildArgs(['--bogus']), /unknown flag --bogus/);
  assert.throws(() => parseBuildArgs(['a', 'b']), /unexpected argument b/);
});

test('the first live build on 25-0000 (2026-10-01): what JobTread held afterwards is the record of the write shapes', () => {
  // The plan has since changed (the base from the built lines, a share inside each choice), so the read-back is
  // checked for what it records, not against today's plan: the groups by name, every line, the flags as sent.
  const built = (fx as unknown as { built: { budget: ApiBudget; parameters: { name: string; value: number }[]; groupIds: string[]; selection: { name: string; minSelectionsRequired: number | null; maxSelectionsAllowed: number | null; showChildDeltas: boolean; isSelected: boolean }[]; contingency: { quantity: number; cost: number; quantityFormula: string } } }).built;
  const p = plan();
  const tops = built.budget.costGroups.nodes.filter((g) => g.parentCostGroup === null).map((g) => g.name);
  // That day's layout: the options and the contingency each in a top-level group (both moved inside the scope 2026-10-02).
  assert.deepEqual(tops, ['FINISHES', 'GENERAL REQUIREMENTS', OPTIONS_GROUP, CONTINGENCY_GROUP]);
  assert.deepEqual(p.groups.map((g) => g.name), ['FINISHES', 'GENERAL REQUIREMENTS']);
  assert.equal(built.budget.costItems.count, 19);
  assert.equal(built.groupIds.length, 4);
  assert.deepEqual(built.parameters, [{ name: 'Contingency Rate', value: 8 }, { name: 'Contingency Base', value: 2380 }]);
  // Selection groups came back as sent: a required pick with its first choice selected, an add-on nobody picked.
  assert.deepEqual(
    built.selection.map((s) => [s.name, s.minSelectionsRequired, s.maxSelectionsAllowed, s.showChildDeltas, s.isSelected]),
    [['Flooring', 1, 1, true, false], ['LVP', null, null, false, true], ['Walls', 1, 1, true, false], ['Framed false walls', null, null, false, true], ['Ceiling paint', 0, 1, true, false]],
  );
  // The formula is stored, the quantity sent with it is what prices the line.
  assert.equal(built.contingency.quantityFormula, CONTINGENCY_FORMULA);
  assert.equal(built.contingency.quantity, 190.4);
  assert.equal(built.contingency.cost, 190.4);
  // A null quantity bills one unit; the no-count line was sent at 0 and costs nothing.
  const elec = built.budget.costItems.nodes.find((i) => i.name.startsWith('Electrical Labor'))!;
  assert.equal(elec.quantity, 0);
  assert.equal(elec.cost, 0);
  const permit = built.budget.costItems.nodes.find((i) => i.name === 'Permit')!;
  assert.equal(permit.unitPrice, null);
});

test('the build page: the tree with quantities, prices and tags on a dry run; the reason when refused; the checks after --apply', async () => {
  const { renderBuildPage } = await import('../src/draft/build-render.ts');
  const p = plan();
  const gate = gateBuild({ job: TEST_JOB, draft: fx.draft, budget: budgetWith(STRUCTURAL), record: null, live: false, replace: false });
  const common = { job: TEST_JOB, draftPath: 'review/22PDZbwDdZfq-draft.json', planPath: 'review/22PDZbwDdZfq-build-plan.json', plannedAt: '2026-10-01T19:00:00.000Z' };
  const dry = renderBuildPage({ ...common, gate, plan: p });
  assert.match(dry, /<title>25-0000 Kay Oss_Test Job 1 — build dry run<\/title>/);
  assert.match(dry, /Dry run\. Nothing was written\./);
  for (const name of ['FINISHES', 'GENERAL REQUIREMENTS']) assert.ok(dry.includes(`<h2>${name}</h2>`), name);
  for (const name of [OPTIONS_GROUP, CONTINGENCY_GROUP]) assert.ok(!dry.includes(`<h2>${name}</h2>`), name);
  assert.match(dry, /<div class="name">Primer<\/div>/);
  assert.match(dry, /\$43\.50<div class="unit">cost \$30\.00<\/div>/);           // unit price and cost
  assert.match(dry, /\$174\.00<div class="unit">cost \$120\.00<\/div>/);         // 4 gallons extended
  assert.match(dry, /Flooring › LVP<\/div><div class="name">Flooring<\/div><span class="tag sel">one choice required<\/span> <span class="tag ">pre-selected<\/span>/);
  assert.match(dry, /Ceiling paint › Ceiling paint<\/div><div class="name">Paint Labor - Sub<\/div><span class="tag sel">add-on<\/span>/);
  assert.match(dry, /<div class="name">Mold-resistant concrete paint<\/div>.*<span class="tag warn">DRAFT — Carl confirms<\/span>/);
  assert.match(dry, /<span class="tag dim">count not set<\/span>/);
  const noted = plan();
  const { noted: n } = attachNotes(noted, 'cfNotes', new Map(catalogIdsOf(noted).map((id) => [id, ''])));
  assert.match(renderBuildPage({ ...common, gate, plan: noted }), new RegExp(`${n} lines carry a note for the team in Internal Notes, under the catalog's own note`));
  // The Note column is the team's note, as it goes in Internal Notes.
  assert.match(dry, /<div class="jobnote">For this job: Mold-resistant concrete paint<br>Quantity 909 Square Foot: [^<]*<br>Not in the template: [^<]*<br>Priced from a regional ballpark, NOT DB pricing/);
  assert.match(dry, /= <code>\{Contingency Base\} \* \{Contingency Rate\} \/ 100<\/code>/);
  assert.match(dry, /Job parameters: Contingency Rate = 8, Contingency Base = 2720\./);
  assert.match(dry, /Contingency 8%: \$217\.60 on the \$2,720\.00 base scope, and each option carries its own share inside its choice/);
  assert.match(dry, /<strong>Flooring<\/strong>, one choice required:<ul><li>LVP \(pre-selected\) &mdash; \$7,060\.50 price, \$4,698\.00 cost \(incl\. \$348\.00 contingency\)<\/li>/);
  assert.match(dry, /<strong>Ceiling paint<\/strong>, optional add-on &mdash; \$3,928\.28 price, \$2,772\.90 cost \(incl\. \$205\.40 contingency\)<\/li>/);
  assert.match(dry, /npm run build-budget -- 22PDZbwDdZfq --draft review\/22PDZbwDdZfq-draft\.json --apply<\/pre>/);
  assert.ok(!dry.includes('Read back from JobTread'));
  // Base price = the template groups and the contingency, not the selections inside them.
  // FINISHES $3,913.50 + GENERAL REQUIREMENTS $800.00 + contingency $217.60; the options are not in it.
  assert.match(dry, /<span class="k">Base price<\/span><span class="v">\$4,931\.10<\/span>/);
  assert.match(dry, /<span class="k">Base cost<\/span><span class="v">\$2,937\.60<\/span>/);
  assert.match(dry, /<span class="k">Lines<\/span><span class="v">23<\/span>/);
  // As pre-selected is what JobTread totals: base $4,931.10 + Framed false walls $4,411.15 + LVP $7,060.50; no add-on, no other choice.
  // 25-0000 read $52,683.07 on its scope group, every choice summed, for a $34,682.11 budget.
  assert.match(dry, /<span class="k">As pre-selected<\/span><span class="v">\$16,402\.75<\/span>/);
  assert.match(dry, /As pre-selected, the budget comes to \$16,402\.75 price/);
  assert.match(dry, /<p class="tally">21 lines &middot; \$15,602\.75 price &middot; \$10,015\.21 cost with the pre-selected choices &middot; \$27,615\.62 with every choice and add-on<\/p>/);
  assert.match(dry, /<p class="tally">2 lines &middot; \$800\.00 price &middot; \$440\.00 cost<\/p>/, 'a group with no selection shows one figure');

  const refused = gateBuild({ job: REAL_JOB, draft: fx.draft, budget: budgetWith(STRUCTURAL), record: null, live: false, replace: false });
  const no = renderBuildPage({ ...common, job: REAL_JOB, gate: refused, plan: null });
  assert.match(no, /build not built<\/title>/);
  assert.match(no, /Not built\. 261323 Haag_Remodel is not a test job\./);
  assert.ok(!no.includes('<table'));

  const rec: BuildRecord = { jobId: TEST_JOB.id, jobName: TEST_JOB.name, pass: 2, builtAt: '2026-10-01T19:10:00.000Z', groups: [{ id: 'g1', name: 'FINISHES' }], parameters: [] };
  const built = renderBuildPage({ ...common, gate, plan: p, applied: { record: rec, verify: { ok: true, lines: ['ok: "FINISHES" with 5 lines'] } } });
  assert.match(built, /build built<\/title>/);
  assert.match(built, /<h2>FINISHES <code class="id">g1<\/code><\/h2>/);
  assert.match(built, /<li class="ok">ok: &quot;FINISHES&quot; with 5 lines<\/li>/);
  assert.match(built, /Built 2026-10-01 19:10/);
  assert.match(built, /Built\. 1 group on the job's Budget tab/);
  const bad = renderBuildPage({ ...common, gate, plan: p, applied: { record: rec, verify: { ok: false, lines: ['MISMATCH: x'] } } });
  assert.match(bad, /build not verified<\/title>/);
  assert.match(bad, /<li class="bad">MISMATCH: x<\/li>/);
});

test('the unit name rides on the plan for the page and never goes on the wire', () => {
  const p = plan();
  const primer = allItems(top(p, 'FINISHES')).find((i) => i.name === 'Primer')!;
  assert.equal(primer.unitName, 'Gallons');
  assert.ok(!JSON.stringify(groupMutation('job1', top(p, 'FINISHES'))).includes('unitName'));
  assert.ok(!JSON.stringify(groupMutation('job1', top(p, 'GENERAL REQUIREMENTS'))).includes('unitName'));
});

// ---- the checks (checks.ts) ----------------------------------------------------------------

test('checks: a sub beside DB\'s own crew for the same trade is a problem; beside DB\'s material it is a check, a problem when the amounts match', async () => {
  const { doubleCounts, stemOf } = await import('../src/draft/checks.ts');
  assert.equal(stemOf('Insulation - Sub'), 'insulation');
  assert.equal(stemOf('Insulation - Batt (DRAFT - Carl confirms)'), 'insulation');
  assert.equal(stemOf('Drywall Brd- Labor'), 'drywall');
  const w = 'CUSTOMER OPTIONS › Walls › Framed walls';
  const flags = doubleCounts([
    { where: w, name: 'Insulation - Sub', costType: 'Subcontractor', quantity: 909, unit: 'Square Foot', cost: 7744.68 },
    { where: w, name: 'Insulation - Batt', costType: 'Materials', quantity: 909, unit: 'Square Foot', cost: 1181.7 },
    { where: w, name: 'Paint Labor - Sub', costType: 'Subcontractor', quantity: 909, unit: 'Square Foot', cost: 3590.55 },
    { where: w, name: 'Paint Labor', costType: 'Labor', quantity: 16, unit: 'Hours', cost: 880 },
    { where: w, name: 'Paint', costType: 'Materials', quantity: 4, unit: 'Gallons', cost: 340 },
    // Different places are not compared: the ceiling's sub beside the walls' crew is two jobs.
    { where: 'CUSTOMER OPTIONS › Ceiling paint › Ceiling paint', name: 'Insulation - Sub', costType: 'Subcontractor', quantity: 1, unit: 'Lump Sum', cost: 1 },
  ]);
  assert.deepEqual(flags.map((f) => [f.severity, f.lines.map((l) => l.name).join(' + ')]), [
    ['problem', 'Insulation - Sub + Insulation - Batt'],
    ['problem', 'Paint Labor - Sub + Paint Labor'],
    ['check', 'Paint Labor - Sub + Paint'],
  ]);
  assert.equal(flags[0]!.text, `${w}: "Insulation - Sub" (a subcontractor, $7,744.68) and "Insulation - Batt" (DB's material, $1,181.70) are the same insulation work. Both are for 909 Square Foot. If the sub supplies the material, $1,181.70 is paid twice.`);
  assert.match(flags[1]!.text, /pay twice for the same paint work\. Keep the one that does the work\./);
});

test('checks: the same line twice in one place, and two subs of one trade', async () => {
  const { doubleCounts } = await import('../src/draft/checks.ts');
  const w = 'FINISHES › Tile';
  const flags = doubleCounts([
    { where: w, name: 'Tile Sub', costType: 'Subcontractor', quantity: 40, unit: 'Square Foot', cost: 2000 },
    { where: w, name: 'Tile Package - Kitchen', costType: 'Subcontractor', quantity: 40, unit: 'Square Foot', cost: 800 },
    { where: w, name: 'Primer', costType: 'Materials', quantity: 1, unit: 'Gallons', cost: 30 },
    { where: w, name: 'Primer', costType: 'Materials', quantity: 2, unit: 'Gallons', cost: 60 },
    { where: w, name: 'Project Contingency', costType: 'Other', quantity: 10, unit: 'Lump Sum', cost: 10 },
    { where: w, name: 'Project Contingency', costType: 'Other', quantity: 10, unit: 'Lump Sum', cost: 10 },
  ]);
  assert.deepEqual(flags.map((f) => [f.severity, f.text]), [
    ['problem', '"Primer" is in FINISHES › Tile twice.'],
    ['check', 'FINISHES › Tile: two subcontractor lines for tile, "Tile Package - Kitchen" ($800.00) and "Tile Sub" ($2,000.00). Check they are different parts of the work.'],
  ]);
});

test('the build plan flags a sub and the crew for the same work in one section, and puts it first', () => {
  // Keep Paint Labor - Sub beside Paint Labor in FINISHES › Paint: the template offers both; the draft must pick one.
  const draft: DraftFile = { ...fx.draft, lines: [...fx.draft.lines, { lineId: '22PLhtLxcz9T', name: 'Paint Labor - Sub', template: 'X-Division 09 Finishes', quantity: 909, unit: 'Square Foot', option: null }] };
  const p = plan(draft);
  assert.equal(p.flags[0]!.severity, 'problem');
  assert.equal(p.flags[0]!.kind, 'double-count');
  assert.deepEqual(p.flags[0]!.lines, [{ where: 'FINISHES › Paint', name: 'Paint Labor - Sub' }, { where: 'FINISHES › Paint', name: 'Paint Labor' }]);
  assert.match(planText(p), /CHECK BEFORE --apply \(1 problems?.*\n  1\. PROBLEM: FINISHES › Paint: "Paint Labor - Sub" \(a subcontractor, \$3,590\.55\) and "Paint Labor" \(DB's crew, \$1,320\.00\) pay twice/);
});

test('a line counted in one unit and priced per another is a problem with the dollars in it; the line keeps its own unit', async () => {
  const { withPricedUnit } = await import('../src/draft/templates.ts');
  const { templateLinesText } = await import('../src/draft/prompt.ts');
  const fin = templates.get('22PLCZU3cbqS')!;
  // As JobTread holds it: "Drywall Brd- Mat" says Each, its price "Drywall Board - Mat" is $1.02 per Square Foot.
  const conflicted: Template = { ...fin, lines: fin.lines.map((l) => withPricedUnit(l.name === 'Drywall Brd- Mat' ? { ...l, priced: { ...l.priced!, unit: 'Square Foot' } } : l)) };
  const board = conflicted.lines.find((l) => l.name === 'Drywall Brd- Mat')!;
  assert.equal(board.unit, 'Each');
  assert.equal(board.pricedUnit, 'Square Foot');
  // A line whose units agree is the same object; one whose price carries no unit (an older fixture) is left alone.
  const primer = fin.lines.find((l) => l.name === 'Primer')!;
  const agreeing = { ...primer, priced: { ...primer.priced!, unit: 'Gallons' } };
  assert.equal(withPricedUnit(agreeing), agreeing);
  assert.equal(withPricedUnit(primer), primer);
  // The model is told, and asked for the count in both units.
  assert.match(templateLinesText(conflicted), /- 22PLCchBuFMU · Drywall Brd- Mat · Each · Materials · CATALOG CONFLICT: its price is per Square Foot\n/);

  const tpl = new Map([...templates, [fin.id, conflicted]]);
  // The live 25-0000 draft counted 21 sheets.
  const counted: DraftFile = { ...fx.draft, lines: fx.draft.lines.map((l) => (l.name === 'Drywall Brd- Mat' ? { ...l, quantity: 21, unit: 'Each' } : l)) };
  const p = planBuild(counted, tpl, names, priced);
  const conflict = p.flags.find((f) => f.kind === 'unit-conflict')!;
  assert.equal(conflict.severity, 'problem');
  assert.equal(conflict.text, 'FINISHES › Drywall/Plaster › Walls › Framed false walls: "Drywall Brd- Mat" is counted in Each, but its catalog price ($1.02) is per Square Foot. 21 Each at $1.02 comes to $21.42. Set the count in the unit the price is really per, and fix whichever unit is wrong in the catalog.');
  assert.ok(!p.flags.some((f) => f.kind === 'unit'), 'the draft and the line agree on Each');
  const item = allItems(sel(p, 'Walls')).find((i) => i.name === 'Drywall Brd- Mat')!;
  assert.equal(item.unitId, UNITS['Each']);
  // Page-only fields never go on the wire.
  const wire = JSON.stringify(groupMutation('job1', top(p, 'FINISHES')));
  for (const k of ['draftUnit', 'pricedUnit', 'costTypeName', 'unitName']) assert.ok(!wire.includes(k), k);

  // After the catalog is fixed (the template line now says Square Foot), an old draft that counted sheets is caught.
  const fixed: Template = { ...fin, lines: fin.lines.map((l) => (l.name === 'Drywall Brd- Mat' ? { ...l, unit: 'Square Foot' } : l)) };
  const q = planBuild(counted, new Map([...templates, [fin.id, fixed]]), names, priced);
  const stale = q.flags.find((f) => f.kind === 'unit')!;
  assert.equal(stale.severity, 'problem');
  assert.equal(stale.text, 'FINISHES › Drywall/Plaster › Walls › Framed false walls: the draft counted "Drywall Brd- Mat" as 21 Each, but the line is now in Square Foot. Built as it is, that is 21 Square Foot = $21.42. Draft it again, or set the quantity in Square Foot on the job.');
  assert.ok(!q.flags.some((f) => f.kind === 'unit-conflict'));
});

test('the build page puts the checks at the top and tags the rows they name', async () => {
  const { renderBuildPage } = await import('../src/draft/build-render.ts');
  const draft: DraftFile = { ...fx.draft, lines: [...fx.draft.lines, { lineId: '22PLhtLxcz9T', name: 'Paint Labor - Sub', template: 'X-Division 09 Finishes', quantity: 909, unit: 'Square Foot', option: null }] };
  const p = plan(draft);
  const gate = gateBuild({ job: TEST_JOB, draft, budget: budgetWith(STRUCTURAL), record: null, live: false, replace: false });
  const html = renderBuildPage({ job: TEST_JOB, draftPath: 'd.json', planPath: 'p.json', plannedAt: '2026-10-01T20:00:00.000Z', gate, plan: p });
  const box = html.indexOf('<section class="review has-problems">');
  assert.ok(box > 0 && box < html.indexOf('<h2>FINISHES</h2>'), 'the box comes before the groups');
  // The problem (the sub beside the crew), the sub beside the paint it may supply, the line with no count, the DRAFT lines.
  assert.match(html, /<h2>Check before you apply <span class="counts">1 problem &middot; 4 to check<\/span><\/h2>/);
  assert.match(html, /<li class="check"><span class="sev">Check<\/span> FINISHES › Paint: &quot;Paint Labor - Sub&quot; \(a subcontractor, \$3,590\.55\) and &quot;Paint&quot; \(DB&#39;s material|<li class="check"><span class="sev">Check<\/span> FINISHES › Paint: &quot;Paint Labor - Sub&quot; \(a subcontractor, \$3,590\.55\) and &quot;Paint&quot; \(DB's material/);
  assert.match(html, /<li class="problem"><span class="sev">Problem<\/span> FINISHES › Paint: &quot;Paint Labor - Sub&quot;/);
  assert.match(html, /<li class="info"><span class="sev">Figure<\/span> Contingency 8%: \$\d/);
  assert.match(html, /<div class="name">Paint Labor - Sub<\/div><span class="tag bad">problem 1<\/span>/);
  assert.match(html, /<div class="name">Paint Labor<\/div><span class="tag bad">problem 1<\/span>/);
});

test('the draft page shows the same checks: a sub beside the crew in one section, and a line priced per another unit', async () => {
  const { draftFlags } = await import('../src/draft/render.ts');
  const { moneyFromApi } = await import('../src/money.ts');
  const money = (n: number): bigint => moneyFromApi(n);
  const line = (name: string, costTypeName: string, quantity: number, unit: string, cost: number, extra: Record<string, unknown> = {}) => ({
    lineId: name, name, templateId: 't', templateName: 'X-Division 09 Finishes', groupPath: ['FINISHES', 'Paint'], unit, costTypeName, quantity,
    unitCost: money(cost / quantity), unitPrice: money(cost / quantity), cost: money(cost), price: money(cost), priced: true, tracking: false,
    basis: '', evidence: [], option: null, confidence: 'high', lookBack: [], history: null, historyUnitCost: null, historyUnitPrice: null, ...extra,
  });
  const d = {
    lines: [
      line('Paint Labor - Sub', 'Subcontractor', 909, 'Square Foot', 3590.55),
      line('Paint Labor', 'Labor', 24, 'Hours', 1320),
      line('Drywall Brd- Mat', 'Materials', 21, 'Each', 21.42, { pricedUnit: 'Square Foot', groupPath: ['FINISHES', 'Drywall/Plaster'] }),
    ],
    found: [],
  } as unknown as Parameters<typeof draftFlags>[0];
  const flags = draftFlags(d);
  assert.deepEqual(flags.map((f) => [f.severity, f.kind]), [['problem', 'double-count'], ['problem', 'unit-conflict']]);
  assert.match(flags[0]!.text, /^X-Division 09 Finishes › FINISHES › Paint: "Paint Labor - Sub"/);
  assert.equal(flags[1]!.text, 'X-Division 09 Finishes › FINISHES › Drywall/Plaster: "Drywall Brd- Mat" is counted in Each, but its catalog price ($1.02) is per Square Foot. 21 Each at $1.02 comes to $21.42. Set the count in the unit the price is really per, and fix whichever unit is wrong in the catalog.');
});

test('checks: a $0 time-tracking line is not "no count" or "unpriced"', async () => {
  const { openLines } = await import('../src/draft/checks.ts');
  const flags = openLines([
    { where: 'GENERAL REQUIREMENTS › Project/Site Management', name: 'Sales On-Site Support', costType: 'Labor', quantity: 0, unit: 'Hours', cost: 0, tracking: true },
    { where: 'CUSTOMER OPTIONS › Walls › Framed walls', name: 'Electrical Sub (DRAFT - Carl confirms)', costType: 'Subcontractor', quantity: 0, unit: 'Lump Sum', cost: 0 },
  ]);
  assert.deepEqual(flags.map((f) => f.lines.map((l) => l.name)), [['Electrical Sub (DRAFT - Carl confirms)'], ['Electrical Sub (DRAFT - Carl confirms)']]);
  assert.equal(flags[0]!.text, '1 line has no count yet and cost nothing until the rep sets it: "Electrical Sub".');
});


// ---- 2026-10-02: --apply asks before it writes ------------------------------------------

test('--apply asks y/n: only y or yes writes; no, anything else, or no answer writes nothing', async () => {
  const ask = async (typed: string | null): Promise<{ yes: boolean; shown: string }> => {
    const input = typed === null ? Readable.from([]) : Readable.from([typed]);
    const output = new PassThrough();
    let shown = '';
    output.on('data', (c) => { shown += String(c); });
    const yes = await askYesNo('Write this to 25-0000 Kay Oss_Test Job 1? (y/n) ', input, output);
    return { yes, shown };
  };
  assert.deepEqual(await ask('y\n'), { yes: true, shown: 'Write this to 25-0000 Kay Oss_Test Job 1? (y/n) ' });
  assert.equal((await ask('YES\n')).yes, true);
  assert.equal((await ask(' y \r\n')).yes, true, 'Windows line ends and stray spaces');
  assert.equal((await ask('n\n')).yes, false);
  assert.equal((await ask('yep\n')).yes, false, 'only y or yes');
  assert.equal((await ask('\n')).yes, false, 'just Enter is a no');
  assert.equal((await ask(null)).yes, false, 'no answer at all is a no');

  assert.equal(parseBuildArgs(['25-0000', '--apply', '--yes']).yes, true);
  assert.equal(parseBuildArgs(['25-0000', '--apply', '-y']).yes, true);
  assert.throws(() => parseBuildArgs(['25-0000', '--yes']), /--yes only answers the question --apply asks/);
});

test('the build record is kept in the shared folder, so either computer can --replace what the other built', () => {
  // 25-0000, 2026-10-03: the laptop could not replace the work computer's build; its record was on the work computer.
  const env = { DB_LEARNED_PATH: '/onedrive/DB-Estimator/learned-prices.json' } as NodeJS.ProcessEnv;
  const none = (): boolean => false;
  assert.deepEqual(recordPaths('22PDZbwDdZfq', 'review', env, none), {
    write: '/onedrive/DB-Estimator/builds/22PDZbwDdZfq-built.json',
    read: ['/onedrive/DB-Estimator/builds/22PDZbwDdZfq-built.json', 'review/22PDZbwDdZfq-built.json'],
  });
  assert.deepEqual(recordPaths('22PDZbwDdZfq', 'review', {} as NodeJS.ProcessEnv, none),
    { write: 'review/22PDZbwDdZfq-built.json', read: ['review/22PDZbwDdZfq-built.json'] }, 'no shared folder: beside the page');

  const rec = (builtAt: string, id: string): string => JSON.stringify({ jobId: 'j', jobName: 'n', pass: 1, builtAt, groups: [{ id, name: 'X SCOPE' }], parameters: [] });
  const files: Record<string, string> = { shared: rec('2026-10-03T02:30:00.000Z', 'new'), local: rec('2026-10-02T20:09:00.000Z', 'old') };
  assert.equal(readRecord(['shared', 'local'], (p) => files[p] ?? null)!.groups[0]!.id, 'new', 'the latest build wins');
  assert.equal(readRecord(['shared', 'local'], (p) => (p === 'local' ? files.local! : null))!.groups[0]!.id, 'old', 'an older local record is still read');
  assert.equal(readRecord(['shared'], () => null), null);
});

test('a supplies line is not a material that needs install labor', async () => {
  const { uninstalledMaterials } = await import('../src/draft/checks.ts');
  // 25-0000, 2026-10-03: Paint - Miscellaneous Mat in the base for both wall choices, paint labor in the choices.
  const misc = { scope: 'base', name: 'Paint - Miscellaneous Mat', quantity: 1, unit: 'Each', sectionLabor: ['Paint Labor', 'Paint Labor - Sub'] };
  assert.deepEqual(uninstalledMaterials([misc], []), []);
  assert.equal(uninstalledMaterials([{ ...misc, name: 'Primer' }], []).length, 1, 'a real material still needs its labor');
});
