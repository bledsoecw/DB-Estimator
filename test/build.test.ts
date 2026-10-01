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
  countItems, deleteMutation, gateBuild, groupMutation, parametersMutation, parseMoney, planBuild, planText, pricedIdsOf, verifyBuild,
  type BuildPlan, type BuildRecord, type DraftFile, type NewGroup, type NewItem,
} from '../src/draft/build.ts';
import { namesFromFixture, parseBuildArgs, planFile, type BuildFixture } from '../src/build-cli.ts';
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
const top = (p: BuildPlan, name: string): NewGroup => {
  const g = p.groups.find((x) => x.name === name);
  if (!g) throw new Error(`no top-level group "${name}" (has ${p.groups.map((x) => x.name).join(', ')})`);
  return g;
};

test('the plan: the templates\' scope groups first, then the options, then the contingency; every line counted once', () => {
  const p = plan();
  assert.deepEqual(p.groups.map((g) => g.name), ['FINISHES', 'GENERAL REQUIREMENTS', OPTIONS_GROUP, CONTINGENCY_GROUP]);
  assert.deepEqual(p.counts, { lines: 11, found: 3, created: 3, options: 3 });
  // 11 kept + 3 found + 3 created + the General Description + the contingency line.
  assert.equal(p.groups.reduce((n, g) => n + countItems(g), 0), 19);
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

test('the General Description is the first line of the primary\'s group and carries the scope text at $0', () => {
  const fin = top(plan(), 'FINISHES');
  const first = fin.lineItems[0]!;
  assert.equal(first._type, 'costItem');
  const gd = first as NewItem;
  assert.equal(gd.name, GENERAL_DESCRIPTION);
  assert.equal(gd.organizationCostItemId, fx.names.generalDescriptionItemId);
  assert.equal(gd.description, fx.draft.scopeOfWork);
  assert.equal(gd.unitCost, 0);
  assert.equal(gd.unitPrice, 0);
  assert.equal(gd.unitId, UNITS['Lump Sum']);
  assert.equal(gd.costTypeId, TYPES['Other']);
  assert.equal(gd.costCodeId, CODES['General Requirements']);
});

test('without the General Description item the scope text goes on the group', () => {
  const p = planBuild(fx.draft, templates, { ...names, generalDescriptionItemId: null }, priced);
  const fin = top(p, 'FINISHES');
  assert.equal(fin.description, fx.draft.scopeOfWork);
  assert.ok(!allItems(fin).some((i) => i.name === GENERAL_DESCRIPTION));
  assert.ok(p.notes.some((n) => /General Description/.test(n)));
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
  const framed = sub(sub(top(p, OPTIONS_GROUP), 'Walls'), 'Framed false walls');
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

test('options: two choices make one required pick with the first selected; one choice is an add-on nobody has picked', () => {
  const opts = top(plan(), OPTIONS_GROUP);
  assert.deepEqual(opts.lineItems.map((li) => li.name), ['Flooring', 'Walls', 'Ceiling paint']);
  const flooring = sub(opts, 'Flooring');
  assert.equal(flooring.minSelectionsRequired, 1);
  assert.equal(flooring.maxSelectionsAllowed, 1);
  assert.equal(flooring.showChildDeltas, true);
  assert.deepEqual(flooring.lineItems.map((li) => [li.name, (li as NewGroup).isSelected]), [['LVP', true], ['Epoxy', false]]);
  assert.deepEqual(items(sub(flooring, 'LVP')).map((i) => [i.name, i.quantity]), [['Flooring', 650], ['Flooring Labor', 20]]);
  assert.deepEqual(items(sub(flooring, 'Epoxy')).map((i) => [i.name, i.quantity, i.costTypeId]), [['Flooring - Sub', 650, TYPES['Subcontractor']]]);
  const ceiling = sub(opts, 'Ceiling paint');
  assert.equal(ceiling.minSelectionsRequired, 0);
  assert.equal(ceiling.maxSelectionsAllowed, 1);
  assert.deepEqual(ceiling.lineItems.map((li) => [li.name, (li as NewGroup).isSelected]), [['Ceiling paint', false]]);
});

test('open items are created on the job, tagged, priced from history or the ballpark; a catalog match at quantity 0', () => {
  const p = plan();
  const walls = sub(top(p, OPTIONS_GROUP), 'Walls');
  const framed = items(sub(walls, 'Framed false walls'));
  // The catalog match: the item, no count yet, so 0 — a null quantity would bill one unit.
  const elec = framed.find((i) => i.name === `Electrical Labor ${DRAFT_TAG}`)!;
  assert.equal(elec.organizationCostItemId, '22PLiT7FjgXV');
  assert.equal(elec.quantity, 0);
  assert.equal(elec.unitCost, 55);
  assert.equal(elec.costCodeId, CODES['Electrical']);
  assert.match(elec.description!, /Extend or relocate outlets/);
  assert.match(elec.description!, /quantity is 0 until the rep sets it/);
  // History-priced, created from scratch under General Requirements.
  const lumber = framed.find((i) => i.name === `Framing lumber for the false walls ${DRAFT_TAG}`)!;
  assert.equal(lumber.organizationCostItemId, undefined);
  assert.equal(lumber.quantity, 120);
  assert.equal(lumber.unitCost, 3.55);
  assert.equal(lumber.unitPrice, 5.92);
  assert.equal(lumber.unitId, UNITS['Linear Feet']);
  assert.equal(lumber.costTypeId, TYPES['Materials']);
  assert.equal(lumber.costCodeId, CODES['General Requirements']);
  assert.match(lumber.description!, /Priced from DB history: 25-0003/);
  // The ballpark, in the other choice, says so loudly.
  const paint = items(sub(walls, 'Paint the block'));
  assert.equal(paint.length, 1);
  assert.equal(paint[0]!.name, `Mold-resistant concrete paint ${DRAFT_TAG}`);
  assert.equal(paint[0]!.unitCost, 0.45);
  assert.equal(paint[0]!.unitPrice, 0.6525);
  assert.match(paint[0]!.description!, /regional ballpark, NOT DB pricing/);
  // The sections named for a line with an option do not pull it out of its choice group.
  assert.ok(!allItems(top(p, 'FINISHES')).some((i) => i.name.endsWith(DRAFT_TAG)));
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
  assert.match(line.description!, /quantity is 0 until the rep sets it/);
});

test('an open item without a section and without an option goes into the primary\'s group', () => {
  const draft: DraftFile = { ...fx.draft, gaps: [{ ...fx.draft.gaps![0]!, option: null, placeIn: null }] };
  const line = items(top(plan(draft), 'FINISHES')).find((i) => i.name.startsWith('Mold-resistant'));
  assert.ok(line);
});

test('the contingency group is last, its line carries the dollars and the formula, and the parameters are set', () => {
  const p = plan();
  const c = p.groups.at(-1)!;
  assert.equal(c.name, CONTINGENCY_GROUP);
  const line = items(c)[0]!;
  assert.equal(line.name, CONTINGENCY_LINE);
  assert.equal(line.organizationCostItemId, fx.names.contingencyItemId);
  assert.equal(line.quantity, 190.4);
  assert.equal(line.quantityFormula, CONTINGENCY_FORMULA);
  assert.equal(line.unitCost, 1);
  assert.equal(line.unitPrice, 1);
  assert.match(line.description!, /8%/);
  assert.equal(p.contingencyQuantity, 190.4);
  assert.deepEqual(p.parameters, [{ name: 'Contingency Rate', value: 8 }, { name: 'Contingency Base', value: 2380 }]);
});

test('no contingency item, or no contingency in the draft: no group, no parameters, a note when the item is missing', () => {
  const none = planBuild(fx.draft, templates, { ...names, contingencyItemId: null }, priced);
  assert.ok(!none.groups.some((g) => g.name === CONTINGENCY_GROUP));
  assert.deepEqual(none.parameters, []);
  assert.equal(none.contingencyQuantity, null);
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
  assert.match(text, /^Build pass 2 of 25-0000 Kay Oss_Test Job 1 into its budget: 4 top-level groups, 11 template lines, 3 from the catalog, 3 created, 3 option groups\./);
  assert.match(text, /\nFINISHES\n  - General Description: qty — · \$0 \/ \$0\n  Paint\n    - Primer: 4 · \$30 \/ \$43\.5\n/);
  assert.match(text, /\n  Flooring \[select: min 1, max 1\]\n    LVP \[selected\]\n/);
  assert.match(text, /\n  Ceiling paint \[select: min 0, max 1\]\n/);
  assert.match(text, /- Framing lumber for the false walls \(DRAFT - Carl confirms\): 120 · \$3\.55 \/ \$5\.92 · no catalog item/);
  assert.match(text, /- Project Contingency: 190\.4 = \{Contingency Base\} \* \{Contingency Rate\} \/ 100 · \$1 \/ \$1/);
  assert.match(text, /\nJob parameters: Contingency Rate = 8, Contingency Base = 2380$/);
});

test('groupMutation: jobId and the group at the root with no discriminator, nested _type kept, nothing undefined, the created ids asked back', () => {
  const p = plan();
  const m = groupMutation('job1', top(p, OPTIONS_GROUP)) as { createCostGroup: { $: Record<string, unknown>; createdCostGroup: Record<string, unknown> } };
  const $ = m.createCostGroup.$;
  assert.equal($['jobId'], 'job1');
  assert.equal($['name'], OPTIONS_GROUP);
  assert.ok(!('_type' in $));
  const first = ($['lineItems'] as Record<string, unknown>[])[0]!;
  assert.equal(first['_type'], 'costGroup');
  assert.equal(first['minSelectionsRequired'], 1);
  assert.ok(!JSON.stringify(m).includes('undefined'));
  assert.deepEqual(m.createCostGroup.createdCostGroup, { id: {}, name: {}, descendentCostItems: { $: { size: 100 }, count: {} } });
  // A kept line carries exactly what a job line needs.
  const fin = groupMutation('job1', top(p, 'FINISHES')) as { createCostGroup: { $: { lineItems: Record<string, unknown>[] } } };
  const paint = (fin.createCostGroup.$.lineItems[1] as { lineItems: Record<string, unknown>[] }).lineItems[0]!;
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
  assert.ok(!g.ok && /"KITCHEN \(by hand\)" is not in its record\. Clear it in JobTread first/.test(g.reason));
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
  const params = [{ name: 'Contingency Rate', value: 8 }, { name: 'Contingency Base', value: 2380 }];
  const ok = verifyBuild(p, built, params);
  assert.equal(ok.ok, true, ok.lines.join('\n'));
  assert.deepEqual(ok.lines, [
    'ok: "FINISHES" with 5 lines',
    'ok: "GENERAL REQUIREMENTS" with 2 lines',
    'ok: "CUSTOMER OPTIONS" with 11 lines',
    'ok: "Phase 5 - Contingency" with 1 line',
    'ok: "Project Contingency" at 190.4 (cost $190.4)',
    'ok: parameter Contingency Rate = 8',
    'ok: parameter Contingency Base = 2380',
  ]);
  // A line lost deep in a choice group is a mismatch on its top-level group.
  const short: ApiBudget = { ...built, costItems: { count: built.costItems.count - 1, nodes: built.costItems.nodes.filter((i) => i.name !== 'Flooring Labor') } };
  const bad = verifyBuild(p, short, params);
  assert.equal(bad.ok, false);
  assert.ok(bad.lines.includes('MISMATCH: "CUSTOMER OPTIONS" holds 10 lines, the plan 11'));
  // The contingency line without its quantity (what the API does to a formula alone), a parameter dropped.
  const noQty: ApiBudget = { ...built, costItems: { ...built.costItems, nodes: built.costItems.nodes.map((i) => (i.name === CONTINGENCY_LINE ? { ...i, quantity: null } : i)) } };
  const worse = verifyBuild(p, noQty, [{ name: 'Contingency Rate', value: 8 }]);
  assert.ok(worse.lines.includes('MISMATCH: "Project Contingency" quantity is null, the plan 190.4'));
  assert.ok(worse.lines.includes('MISMATCH: parameter Contingency Base is not set, the plan 2380'));
  // A group missing altogether.
  const gone = verifyBuild(p, budgetWith(STRUCTURAL), params);
  assert.ok(gone.lines.includes('MISSING: "FINISHES" is not on the budget'));
  assert.ok(gone.lines.includes(`MISSING: the "${CONTINGENCY_LINE}" line`));
});

test('planFile holds the exact mutations in the order they run: deletes, the parameters, the groups', () => {
  const p = plan();
  const f = planFile(p, [{ id: 'old', name: 'FINISHES' }], [{ name: 'Area', value: 1000 }], 'review/x-draft.json') as { mutations: Record<string, unknown>[]; counts: unknown; plan: string };
  assert.deepEqual(f.mutations.map((m) => Object.keys(m).filter((k) => k !== 'note')[0]), ['deleteCostGroup', 'updateJob', 'createCostGroup', 'createCostGroup', 'createCostGroup', 'createCostGroup']);
  assert.equal(f.mutations[0]!['note'], 'delete "FINISHES"');
  const u = f.mutations[1]!['updateJob'] as { $: { parameters: unknown[] } };
  assert.deepEqual(u.$.parameters, [{ name: 'Area', value: 1000 }, { name: 'Contingency Rate', value: 8 }, { name: 'Contingency Base', value: 2380 }]);
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
  assert.deepEqual(parseBuildArgs(['25-0000', '--apply', '--replace', '--out', 'r']), { job: '25-0000', draft: null, apply: true, live: false, replace: true, out: 'r', fixture: null });
  assert.deepEqual(parseBuildArgs(['--draft', 'review/x.json', '--live']).draft, 'review/x.json');
  assert.deepEqual(parseBuildArgs(['--fixture', 'f.json']).fixture, 'f.json');
  assert.throws(() => parseBuildArgs([]), /usage: npm run build-budget/);
  assert.throws(() => parseBuildArgs(['--fixture', 'f.json', '--apply']), /cannot --apply/);
  assert.throws(() => parseBuildArgs(['--bogus']), /unknown flag --bogus/);
  assert.throws(() => parseBuildArgs(['a', 'b']), /unexpected argument b/);
});

test('the live build on 25-0000 (2026-10-01): what JobTread held after the plan was applied verifies against the plan', () => {
  const built = (fx as unknown as { built: { budget: ApiBudget; parameters: { name: string; value: number }[]; groupIds: string[]; selection: { name: string; minSelectionsRequired: number | null; maxSelectionsAllowed: number | null; showChildDeltas: boolean; isSelected: boolean }[]; contingency: { quantity: number; cost: number; quantityFormula: string } } }).built;
  const p = plan();
  const v = verifyBuild(p, built.budget, built.parameters);
  assert.equal(v.ok, true, v.lines.join('\n'));
  assert.equal(built.budget.costItems.count, 19);
  assert.equal(built.groupIds.length, 4);
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
  for (const name of ['FINISHES', 'GENERAL REQUIREMENTS', OPTIONS_GROUP, CONTINGENCY_GROUP]) assert.ok(dry.includes(`<h2>${name}</h2>`), name);
  assert.match(dry, /<div class="name">Primer<\/div>/);
  assert.match(dry, /\$43\.50<div class="unit">cost \$30\.00<\/div>/);           // unit price and cost
  assert.match(dry, /\$174\.00<div class="unit">cost \$120\.00<\/div>/);         // 4 gallons extended
  assert.match(dry, /Flooring › LVP<\/div><div class="name">Flooring<\/div><span class="tag sel">one choice required<\/span> <span class="tag ">pre-selected<\/span>/);
  assert.match(dry, /Ceiling paint › Ceiling paint<\/div><div class="name">Paint Labor - Sub<\/div><span class="tag sel">add-on<\/span>/);
  assert.match(dry, /<div class="name">Mold-resistant concrete paint<\/div>.*<span class="tag warn">DRAFT — Carl confirms<\/span>/);
  assert.match(dry, /<span class="tag dim">count not set<\/span>/);
  assert.match(dry, /= <code>\{Contingency Base\} \* \{Contingency Rate\} \/ 100<\/code>/);
  assert.match(dry, /Job parameters: Contingency Rate = 8, Contingency Base = 2380\./);
  assert.match(dry, /<strong>Flooring<\/strong>, one choice required:<ul><li>LVP \(pre-selected\) &mdash; \$6,712\.50 price, \$4,350\.00 cost<\/li>/);
  assert.match(dry, /npm run build-budget -- 22PDZbwDdZfq --draft review\/22PDZbwDdZfq-draft\.json --apply<\/pre>/);
  assert.ok(!dry.includes('Read back from JobTread'));
  // Base price = the template groups and the contingency, not the options.
  const basePrice = p.groups.filter((g) => g.name !== OPTIONS_GROUP).flatMap((g) => g.lineItems).length;
  assert.ok(basePrice > 0);
  // FINISHES $3,913.50 + GENERAL REQUIREMENTS $800.00 + contingency $190.40; the options are not in it.
  assert.match(dry, /<span class="k">Base price<\/span><span class="v">\$4,903\.90<\/span>/);
  assert.match(dry, /<span class="k">Base cost<\/span><span class="v">\$2,910\.40<\/span>/);
  assert.match(dry, /<span class="k">Lines<\/span><span class="v">19<\/span>/);

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
  const bad = renderBuildPage({ ...common, gate, plan: p, applied: { record: rec, verify: { ok: false, lines: ['MISMATCH: x'] } } });
  assert.match(bad, /build not verified<\/title>/);
  assert.match(bad, /<li class="bad">MISMATCH: x<\/li>/);
});

test('the unit name rides on the plan for the page and never goes on the wire', () => {
  const p = plan();
  const primer = allItems(top(p, 'FINISHES')).find((i) => i.name === 'Primer')!;
  assert.equal(primer.unitName, 'Gallons');
  assert.ok(!JSON.stringify(groupMutation('job1', top(p, 'FINISHES'))).includes('unitName'));
  assert.ok(!JSON.stringify(groupMutation('job1', top(p, OPTIONS_GROUP))).includes('unitName'));
});
