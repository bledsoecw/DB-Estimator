/**
 * The budget's shape on the job. Carl, 2026-10-02, with a picture of the
 * NEW POOL HOUSE SCOPE budget: one top group that reads what the job is, the
 * job's description on it, the template's phases and their sections under it,
 * each customer selection in the section of its work, a contingency share in
 * each choice and the base contingency in Phase 1 — no Phase 5. Most if not
 * all budgets are built on Addition/House Build.
 *
 * The template here is Addition/House Build cut down to the groups the test
 * needs, with its real names and positions.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import type { Template, TemplateLine } from '../src/draft/templates.ts';
import { CONTINGENCY_FORMULA, CONTINGENCY_LINE } from '../src/draft/contingency.ts';
import {
  countItems, planBuild, planLines, scopeGroupName, selectionGroups, verifyBuild,
  type BuildPlan, type DraftFile, type NewGroup, type NewItem, type PricedInfo,
} from '../src/draft/build.ts';
import { namesFromFixture, type BuildFixture } from '../src/build-cli.ts';
import type { ApiBudget } from '../src/jobtread/types.ts';
import { draftEstimate, resolveOptionPlaces, type DraftFixture } from '../src/draft/draft.ts';
import { draftJson } from '../src/draft/render.ts';
import type { StructuredArgs, StructuredCall } from '../src/draft/model.ts';

const fx = JSON.parse(readFileSync('test/fixtures/build-sample.json', 'utf8')) as BuildFixture;
const names = namesFromFixture(fx.names);

const T = 'tplHome';
const g = (id: string, name: string, parentId: string, position: string) => ({ id, name, parentId, position, isSelection: false });
const line = (id: string, name: string, groupId: string, position: string, unit: string, costTypeName: string, unitCost: number, unitPrice: number): TemplateLine => ({
  id, name, description: null, unit, costTypeName, costCodeName: 'General Requirements', groupId, position,
  isSpecification: false, quantity: null, quantityFormula: null,
  priced: { id: `item-${id}`, name, unitCost, unitPrice, costTypeName, unit },
} as TemplateLine);

/** Addition/House Build, cut down: its real group names and positions. */
const HOME: Template = {
  id: T,
  name: 'Addition/House Build',
  description: 'All elements to bulid a new house',
  groups: [
    g('S', 'NEW HOME BUILD SCOPE', T, 'l'),
    g('P1', 'Phase 1 - General Requirements', 'S', 'l'),
    g('P1pm', 'Project/Site Management', 'P1', 'j'),
    g('P1site', 'Site Preparation', 'P1', 'l'),
    g('P2', 'Phase 2 - Rough-In', 'S', 'm'),
    g('P2frame', 'Framing Materials', 'P2', 'h'),
    g('P2ins', 'Insulation', 'P2', 'p'),
    g('P3', 'Phase 3 - Interiors', 'S', 'n'),
    g('P3dry', 'Drywall/Plaster', 'P3', 'm'),
    g('P3floor', 'Flooring', 'P3', 'o'),
    g('P4', 'Phase 4 - Finishes', 'S', 'o'),
    g('P4trim', 'Interior Trims & Finishes', 'P4', 'k'),
    g('P5', 'Phase 5 - Contingency', 'S', 'p'),
    g('CI', 'CLOCK IN ITEMS', T, 'p'),
  ],
  lines: [
    line('pm', 'Project Management', 'P1pm', 'a', 'Hours', 'Labor', 55, 100),
    line('fw', 'Framing Wall', 'P2frame', 'a', 'Square Foot', 'Materials', 3.55, 5.1475),
    line('fl', 'Framing/Sheathing Labor', 'P2frame', 'b', 'Hours', 'Labor', 55, 100),
    line('ib', 'Insulation - Batt', 'P2ins', 'a', 'Square Foot', 'Materials', 1.3, 1.885),
    line('il', 'Insulation Labor', 'P2ins', 'b', 'Hours', 'Labor', 55, 100),
    line('db', 'Drywall Brd- Mat', 'P3dry', 'a', 'Square Foot', 'Materials', 1.02, 1.479),
    line('lvp', 'Flooring', 'P3floor', 'a', 'Square Foot', 'Materials', 5, 7.25),
    line('fll', 'Flooring Labor', 'P3floor', 'b', 'Hours', 'Labor', 55, 100),
    line('wn', 'Wainscoting', 'P4trim', 'a', 'Each', 'Materials', 17, 24.65),
    line('wl', 'Wainscot Labor', 'P4trim', 'b', 'Hours', 'Labor', 55, 100),
    line('pc', CONTINGENCY_LINE, 'P5', 'a', 'Lump Sum', 'Other', 1, 1),
  ],
};
const templates = new Map([[T, HOME]]);
const crew: PricedInfo = { id: 'crewItem', name: 'Crew Labor', unit: 'Hours', costTypeName: 'Labor', costCodeName: 'General Requirements', unitCost: 55, unitPrice: 100, description: null };
const priced = new Map([['crewItem', crew]]);
const place = (groupId: string, group: string) => ({ template: 'Addition/House Build', group, groupId });
const kept = (lineId: string, name: string, quantity: number, unit: string, option: string | null) =>
  ({ lineId, name, template: 'Addition/House Build', quantity, unit, option });

const SCOPE = 'This estimate covers finishing the basement, about 706 square feet with 8-foot walls.';
const DRAFT: DraftFile = {
  job: { id: '22PDZbwDdZfq', name: '25-0000 Kay Oss_Test Job 1' },
  scopeOfWork: SCOPE,
  scopeTitle: 'Basement Finish',
  templates: [{ id: T, name: 'Addition/House Build', role: 'primary' }],
  lines: [
    kept('pm', 'Project Management', 6, 'Hours', null),
    kept('ib', 'Insulation - Batt', 909, 'Square Foot', null),
    kept('il', 'Insulation Labor', 8, 'Hours', null),
    kept('fw', 'Framing Wall', 909, 'Square Foot', 'Walls — Framed'),
    kept('fl', 'Framing/Sheathing Labor', 24, 'Hours', 'Walls — Framed'),
    kept('db', 'Drywall Brd- Mat', 667, 'Square Foot', 'Walls — Framed'),
    kept('wn', 'Wainscoting', 29, 'Each', 'Walls — Framed'),
    kept('wl', 'Wainscot Labor', 16, 'Hours', 'Walls — Framed'),
    kept('lvp', 'Flooring', 706, 'Square Foot', 'Flooring — LVP'),
    kept('fll', 'Flooring Labor', 24, 'Hours', 'Flooring — LVP'),
  ],
  // Found after everything else, in Phase 1: it must still come out in Phase 1, before Phase 2.
  found: [{
    lineId: 'crew', name: 'Crew Labor', forGap: 0, source: { kind: 'catalogItem', pricedItemId: 'crewItem' },
    placeIn: place('P1site', 'NEW HOME BUILD SCOPE › Phase 1 - General Requirements › Site Preparation'), quantity: 8, unit: 'Hours', option: null,
  }],
  gaps: [
    { scope: 'Move contents', why: '', unit: 'Hours', quantity: 8, costType: 'Labor', option: null, resolved: {}, placeIn: null, proposed: null, regionalUnitCost: null, regionalUnitPrice: null },
    {
      scope: 'Epoxy floor by sub', why: 'No template line covers an epoxy floor.', unit: 'Square Foot', quantity: 706, costType: 'Subcontractor',
      option: 'Flooring — Epoxy', resolved: null, catalogMatch: null, placeIn: place('P3floor', 'NEW HOME BUILD SCOPE › Phase 3 - Interiors › Flooring'),
      proposed: { source: 'history', unitCost: '$7.00', unitPrice: '$10.15' }, regionalUnitCost: null, regionalUnitPrice: null,
    },
  ],
  // The floor choice is placed by the draft; the walls are left to the phase of their first line.
  optionPlaces: [{ group: 'Flooring', placeIn: place('P3floor', 'NEW HOME BUILD SCOPE › Phase 3 - Interiors › Flooring') }],
  contingency: { rate: 10, base: '$0.00', amount: '$0.00', parameters: {}, line: null },
};

const sub = (grp: NewGroup, name: string): NewGroup => {
  const hit = grp.lineItems.find((li): li is NewGroup => li._type === 'costGroup' && li.name === name);
  if (!hit) throw new Error(`no group "${name}" under ${grp.name} (has ${grp.lineItems.map((li) => li.name).join(', ')})`);
  return hit;
};
const kids = (grp: NewGroup): string[] => grp.lineItems.map((li) => li.name);
const items = (grp: NewGroup): NewItem[] => grp.lineItems.filter((li): li is NewItem => li._type === 'costItem');
const build = (d: DraftFile = DRAFT): BuildPlan => planBuild(d, templates, names, priced);

test('one top group that reads what the job is, the job\'s description on it, the phases under it in the template\'s order', () => {
  const p = build();
  assert.deepEqual(p.groups.map((x) => x.name), ['BASEMENT FINISH SCOPE'], 'no CUSTOMER OPTIONS, no Phase 5, no CLOCK IN ITEMS');
  const root = p.groups[0]!;
  assert.equal(root.description, SCOPE);
  assert.deepEqual(kids(root), ['Phase 1 - General Requirements', 'Phase 2 - Rough-In', 'Phase 3 - Interiors'], 'only phases with something in them, in order');
  assert.deepEqual(kids(sub(root, 'Phase 1 - General Requirements')), ['Project/Site Management', 'Site Preparation', CONTINGENCY_LINE]);
  assert.deepEqual(items(sub(sub(root, 'Phase 1 - General Requirements'), 'Site Preparation')).map((i) => i.name), ['Crew Labor']);
  assert.deepEqual(kids(sub(root, 'Phase 2 - Rough-In')), ['Insulation', 'Walls']);
  assert.equal(scopeGroupName('new pool house'), 'NEW POOL HOUSE SCOPE');
  assert.equal(scopeGroupName('  Kitchen   Remodel Scope '), 'KITCHEN REMODEL SCOPE');
});

test('each selection sits in the section of its work: where the draft named it, else the phase of its first line', () => {
  const p = build();
  const root = p.groups[0]!;
  const flooring = sub(sub(sub(root, 'Phase 3 - Interiors'), 'Flooring'), 'Flooring');
  assert.equal(flooring.minSelectionsRequired, 1, 'LVP or the epoxy open item: one is required');
  assert.deepEqual(kids(flooring), ['LVP', 'Epoxy']);
  assert.deepEqual(items(sub(flooring, 'Epoxy')).map((i) => i.name), ['Epoxy floor by sub (DRAFT - Carl confirms)', CONTINGENCY_LINE]);
  // Walls was not placed by the draft: its first line, Framing Wall, is Phase 2 - Rough-In work.
  const walls = sub(sub(root, 'Phase 2 - Rough-In'), 'Walls');
  assert.equal(walls.minSelectionsRequired, 0, 'one choice is an add-on');
  assert.deepEqual(items(sub(walls, 'Framed')).map((i) => i.name), ['Framing Wall', 'Framing/Sheathing Labor', 'Drywall Brd- Mat', 'Wainscoting', 'Wainscot Labor', CONTINGENCY_LINE]);
  assert.deepEqual(selectionGroups(p.groups).map((s) => s.name), ['Walls', 'Flooring']);
  assert.ok(planLines(p.groups).filter((x) => x.item.name === 'Wainscoting').every((x) => x.inOption));
});

test('contingency: the base line ends Phase 1 with the formula, each choice carries its share, no Phase 5', () => {
  const p = build();
  const phase1 = sub(p.groups[0]!, 'Phase 1 - General Requirements');
  const base = items(phase1).at(-1)!;
  assert.equal(base.name, CONTINGENCY_LINE);
  assert.equal(base.quantityFormula, CONTINGENCY_FORMULA);
  // Base scope as built: Project Management 6 × $55 + batts 909 × $1.30 + Insulation Labor 8 × $55 + Crew Labor 8 × $55, at 10%.
  assert.equal(p.contingency!.base, 2391.7);
  assert.equal(base.quantity, 239.17);
  assert.equal(p.contingencyGroup, 'Phase 1 - General Requirements');
  assert.deepEqual(p.contingency!.shares.map((s) => `${s.group} — ${s.choice}`), ['Walls — Framed', 'Flooring — LVP', 'Flooring — Epoxy']);
  for (const sel of selectionGroups(p.groups)) {
    for (const ch of sel.lineItems as NewGroup[]) assert.equal(items(ch).filter((i) => i.name === CONTINGENCY_LINE).length, 1, `${sel.name} › ${ch.name}`);
  }
  assert.equal(p.groups.flatMap((x) => planLines([x])).filter((x) => x.item.quantityFormula).length, 1, 'only the base line carries the formula');
  assert.ok(!JSON.stringify(p.groups).includes('Phase 5'));
});

test('the read-back finds the base contingency in Phase 1', () => {
  const p = build();
  const groups: ApiBudget['costGroups']['nodes'] = [];
  const nodes: ApiBudget['costItems']['nodes'] = [];
  let n = 0;
  const walk = (grp: NewGroup, parent: string | null): void => {
    const id = `g${++n}`;
    groups.push({ id, name: grp.name, position: null, parentCostGroup: parent ? { id: parent } : null });
    for (const li of grp.lineItems) {
      if (li._type === 'costGroup') { walk(li, id); continue; }
      nodes.push({
        id: `i${++n}`, name: li.name, quantity: li.quantity, unitCost: li.unitCost, unitPrice: li.unitPrice,
        cost: (li.quantity ?? 1) * (li.unitCost ?? 0), price: (li.quantity ?? 1) * (li.unitPrice ?? 0), isSpecification: false, position: null,
        costType: { id: '', name: '' }, costCode: { id: li.costCodeId, name: '' }, costGroup: { id, name: grp.name },
        organizationCostItem: null, documentCostItems: { count: 0 },
      });
    }
  };
  for (const grp of p.groups) walk(grp, null);
  const v = verifyBuild(p, { jobId: p.jobId, costItems: { count: nodes.length, nodes }, costGroups: { count: groups.length, nodes: groups } }, [
    { name: 'Contingency Rate', value: 10 }, { name: 'Contingency Base', value: 2391.7 },
  ]);
  assert.equal(v.ok, true, v.lines.join('\n'));
  assert.ok(v.lines.includes(`ok: "BASEMENT FINISH SCOPE" with ${countItems(p.groups[0]!)} lines`));
  assert.ok(v.lines.includes(`ok: "${CONTINGENCY_LINE}" at 239.17 on the base scope (cost $239.17)`));
});

// ---- the draft: every construction job on the base template ------------------------------

const hx = JSON.parse(readFileSync('test/fixtures/haag-basement.json', 'utf8')) as DraftFixture;
const FIN = '22PLCZU3cbqS';
const byId = new Map(hx.templates.map((t) => [t.id, t]));
const load = async (id: string) => byId.get(id)!;
type Fake = StructuredCall & { calls: StructuredArgs<unknown>[] };
function fake(replies: unknown[]): Fake {
  const queue = [...replies];
  const calls: StructuredArgs<unknown>[] = [];
  const f = (async (args: StructuredArgs<unknown>) => {
    calls.push(args);
    return { parsed: queue.shift(), stopReason: 'end_turn', usage: { input: 1, output: 1, cacheRead: 0, cacheWrite: 0 } };
  }) as Fake;
  f.calls = calls;
  return f;
}
const REPLY = {
  summary: 'Basement.', scopeOfWork: 'Paint and floor.', scopeTitle: 'Basement Finish',
  optionPlaces: [{ group: 'Flooring', sectionGroupId: '22PLCchBuFMP' }, { group: 'Walls', sectionGroupId: 'not-a-group' }],
  lines: [], gaps: [], questions: [], contingency: { rate: 8, why: '', conditions: [] },
};

test('a construction job is drafted on the base template with no pick call; a roofing job still picks', async () => {
  const call = fake([REPLY]);
  const d = await draftEstimate(hx.evidence, hx.index, load, call, { baseTemplateId: FIN });
  assert.equal(call.calls.length, 1, 'the draft call only');
  assert.deepEqual(d.plans.map((p) => [p.template.id, p.role]), [[FIN, 'primary']]);
  assert.match(String(call.calls[0]!.content.map((b) => ('text' in b ? b.text : '')).join('\n')), /# Sections of the chosen templates on the job/);
  assert.equal(d.scopeTitle, 'Basement Finish');
  assert.deepEqual(d.optionPlaces.map((o) => [o.group, o.placeIn?.groupPath.join(' › ') ?? null]), [['Flooring', 'FINISHES › Flooring'], ['Walls', null]]);
  const json = draftJson(d) as { scopeTitle: string; optionPlaces: { group: string; placeIn: { groupId: string } | null }[] };
  assert.equal(json.scopeTitle, 'Basement Finish');
  assert.deepEqual(json.optionPlaces.map((o) => o.placeIn?.groupId ?? null), ['22PLCchBuFMP', null]);

  const roof = fake([{ summary: 'A roof.', picks: [], noFit: 'roofing goes on the roofing templates' }]);
  await draftEstimate({ ...hx.evidence, jobType: 'Roofing' }, hx.index, load, roof, { baseTemplateId: FIN });
  assert.match(roof.calls[0]!.system, /pick/i, 'a roofing job goes to the picker');
  assert.deepEqual(resolveOptionPlaces([{ group: ' Walls ', sectionGroupId: null }], []), [{ group: 'Walls', placeIn: null }]);
});
