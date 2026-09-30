/**
 * The rest of the catalog, for what the chosen templates lack: the search,
 * the fold to one candidate per priced item, the ranking per gap, and the
 * draft turning a matched gap into a kept, priced line.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { formatMoney } from '../src/money.ts';
import type { Reader } from '../src/jobtread/queries.ts';
import type { Template } from '../src/draft/templates.ts';
import {
  CREW_LABOR, candidatesFor, candidatesText, chainOf, foldCandidates, gapTerms, searchCatalog, type CatalogCandidate,
} from '../src/draft/catalog.ts';
import { draftEstimate, type DraftFixture } from '../src/draft/draft.ts';
import { draftJson, draftSteps, renderDraft } from '../src/draft/render.ts';
import { fixtureCatalog, parseDraftArgs } from '../src/draft-cli.ts';
import type { StructuredArgs, StructuredCall } from '../src/draft/model.ts';

// ---- the raw catalog, as Pave returns it (shapes copied from the live organization) ----

const ADDITION = { id: 'tplAdd', name: 'Addition/House Build', parentCostGroup: null };
const X07 = { id: 'tplX07', name: 'X-Division 07 Thermal & Moisture', parentCostGroup: null };
const X16 = { id: 'tplX16', name: 'X-Division 16 Electrical', parentCostGroup: null };
const inGroup = (name: string, parent: unknown) => ({ id: `g-${name}`, name, parentCostGroup: parent });
const additionInsulation = inGroup('Insulation', inGroup('Phase 2 - Rough-In', inGroup('NEW HOME BUILD SCOPE', ADDITION)));
const x07Siding = inGroup('Siding', inGroup('THERMAL & MOISTURE', X07));
const x16Electrical = inGroup('Electrical', inGroup('ELECTRICAL', X16));

const item = (id: string, name: string, unit: string, costType: string, unitCost: number | null, unitPrice: number | null, description: string | null = null) =>
  ({ id, name, description, unitCost, unitPrice, unit: { name: unit }, costType: { name: costType }, costCode: { name: 'Siding' }, organizationCostItem: null, costGroup: null });
const line = (id: string, name: string, unit: string, costType: string, priced: { id: string; unitCost: number; unitPrice: number }, group: unknown, description: string | null = null) =>
  ({ id, name, description, unitCost: null, unitPrice: null, unit: { name: unit }, costType: { name: costType }, costCode: { name: 'Siding' }, organizationCostItem: priced, costGroup: group as never });

const BATT = { id: 'itemBatt', unitCost: 13.93, unitPrice: 20.1985 };
const CREW = { id: 'itemCrew', unitCost: 55, unitPrice: 100 };
const RAW = [
  item('itemCrew', CREW_LABOR, 'Hours', 'Labor', 55, 100),
  item('itemVapor', 'Vapor Barrier 4 mil', 'Each', 'Materials', 18.49, 26.8105, '4 mil poly, 10 x 25 ft roll'),
  item('itemBatt', 'Insulation - Batt', 'Square Foot', 'Materials', 13.93, 20.1985),
  item('itemInsSub', 'Insulation - Sub', 'Square Foot', 'Subcontractor', 8.52, 12.354),
  line('lineBattX07', 'Insulation - Batt', 'Square Foot', 'Materials', BATT, x07Siding),
  line('lineBattAdd', 'Insulation - Batt', 'Square Foot', 'Materials', BATT, additionInsulation, 'Kraft-faced wall batts'),
  line('lineElecLabor', 'Electrical Labor', 'Each', 'Labor', { id: 'itemElec', unitCost: 55, unitPrice: 100.001 }, x16Electrical),
  line('lineCrewRoof', CREW_LABOR, 'Hours', 'Labor', CREW, inGroup('DB (DONE BETTER) Duration Shingle System', inGroup('Roofing', inGroup('THERMAL & MOISTURE', X07)))),
  line('lineClock', 'Insulation Time', 'Hours', 'Labor', CREW, inGroup('CLOCK IN ITEMS', ADDITION)),
  line('lineOld', 'Insulation - Old', 'Each', 'Materials', BATT, inGroup('DO NOT USE - old', { id: 'tplOld', name: 'X-Service Repair - Insulation', parentCostGroup: null })),
  line('lineChosen', 'Insulation - Batt', 'Square Foot', 'Materials', BATT, inGroup('Insulation', { id: 'tplChosen', name: 'Bathroom Remodel', parentCostGroup: null })),
];

test('a template line\'s chain reads root-first, and stops when the chain never reaches a root', () => {
  assert.deepEqual(chainOf(additionInsulation as never), { root: ADDITION, path: ['NEW HOME BUILD SCOPE', 'Phase 2 - Rough-In', 'Insulation'] });
  assert.equal(chainOf({ id: 'x', name: 'cut off' } as never), null, 'no parentCostGroup key at all: the chain was not fetched deep enough');
  assert.equal(chainOf(null), null);
});

test('the catalog folds to one candidate per priced item: the ungrouped item, or the first template that carries the line, the others named', () => {
  const c = foldCandidates(RAW as never, ['tplChosen']);
  const byName = new Map(c.map((x) => [`${x.name}|${x.kind}`, x]));
  const crew = byName.get(`${CREW_LABOR}|catalogItem`)!;
  assert.equal(crew.unitCost, 55);
  assert.equal(crew.templateId, null);
  assert.equal(byName.get(`${CREW_LABOR}|templateLine`), undefined, 'the roofing template\'s Crew Labor line folds into the item');
  const batt = byName.get('Insulation - Batt|templateLine')!;
  assert.equal(batt.id, 'lineBattAdd', 'templates sort by name: Addition/House Build before X-Division 07');
  assert.equal(batt.templateName, 'Addition/House Build');
  assert.deepEqual(batt.groupPath, ['NEW HOME BUILD SCOPE', 'Phase 2 - Rough-In', 'Insulation']);
  assert.deepEqual(batt.alsoIn, ['X-Division 07 Thermal & Moisture']);
  assert.equal(batt.unitCost, 13.93, 'priced from the item it points at');
  assert.equal(batt.pricedItemId, 'itemBatt');
  assert.equal(byName.get('Insulation - Batt|catalogItem'), undefined, 'the template line replaces the bare item, so the rep is pointed at a template');
  assert.equal(c.find((x) => x.name === 'Insulation Time'), undefined, 'CLOCK IN ITEMS lines are not scope');
  assert.equal(c.find((x) => x.name === 'Insulation - Old'), undefined, 'DO NOT USE groups are left out');
  assert.equal(c.find((x) => x.templateId === 'tplChosen'), undefined, 'a chosen template\'s lines were shown already');
  assert.equal(c.find((x) => x.name === 'Vapor Barrier 4 mil')!.description, '4 mil poly, 10 x 25 ft roll');
});

test('a gap is searched by its lookBack terms, or by the telling words of its scope', () => {
  assert.deepEqual(gapTerms({ scope: 'Batt insulation in the false wall cavities', lookBack: ['insulation', 'Batt'] }), ['insulation', 'batt']);
  assert.deepEqual(gapTerms({ scope: 'Plastic vapor barrier between the foundation and the false walls (Framed walls option)', lookBack: [] }), ['plastic', 'vapor', 'barrier']);
});

test('candidates for a gap: a term in the name or description, the gap\'s own cost type first, Crew Labor for any labor gap', () => {
  const all = foldCandidates(RAW as never, ['tplChosen']);
  const batts = candidatesFor({ scope: 'Batt insulation in the false walls', costType: 'Materials', lookBack: ['insulation', 'batt'] }, all);
  assert.deepEqual(batts.map((c) => [c.name, c.kind]), [['Insulation - Batt', 'templateLine'], ['Insulation - Sub', 'catalogItem']]);
  const labor = candidatesFor({ scope: 'Labor to hang the batts and plastic', costType: 'Labor', lookBack: ['insulation labor'] }, all);
  assert.deepEqual(labor.map((c) => c.name), [CREW_LABOR], 'nothing matched the term; Crew Labor still stands in for labor');
  const elec = candidatesFor({ scope: 'Extend outlets to the false wall face', costType: 'Subcontractor', lookBack: ['electrical', 'outlet'] }, all);
  assert.deepEqual(elec.map((c) => c.name), ['Electrical Labor'], 'a Labor line is offered to a Subcontractor gap; the model decides');
  assert.deepEqual(candidatesFor({ scope: 'Radon mitigation', costType: 'Other', lookBack: ['radon'] }, all), []);

  const text = candidatesText(batts).join('\n');
  assert.match(text, /· lineBattAdd · templateLine · Insulation - Batt · Square Foot · Materials · \$13\.93 cost \/ \$20\.20 price per Square Foot · in Addition\/House Build › NEW HOME BUILD SCOPE › Phase 2 - Rough-In › Insulation \(also in X-Division 07 Thermal & Moisture\)\n      Kraft-faced wall batts/);
  assert.match(text, /· itemInsSub · catalogItem · Insulation - Sub .* an ungrouped catalog item/);
});

test('the search asks Pave for catalog items only, name or description like each term, plus Crew Labor by name, and pages', async () => {
  const queries: Record<string, unknown>[] = [];
  const reader: Reader = {
    organizationId: 'org',
    query: (async (q: Record<string, unknown>) => {
      queries.push(q);
      const page = queries.length === 1 ? 'p2' : null;
      return { organization: { costItems: { nextPage: page, nodes: queries.length === 1 ? RAW.slice(0, 6) : RAW.slice(6) } } };
    }) as Reader['query'],
  };
  const found = await searchCatalog(reader, ['Insulation', 'vapor barrier', ''], { excludeTemplateIds: ['tplChosen'] });
  assert.equal(queries.length, 2, 'followed nextPage once');
  const args = (queries[0]!['organization'] as { costItems: { $: { where: { and: unknown[] }; size: number } } }).costItems.$;
  assert.equal(args.size, 100);
  assert.deepEqual(args.where.and.slice(0, 2), [[['job', 'id'], '=', null], [['document', 'id'], '=', null]]);
  assert.deepEqual((args.where.and[2] as { or: unknown[] }).or, [
    ['name', 'like', '%insulation%'], ['description', 'like', '%insulation%'],
    ['name', 'like', '%vapor barrier%'], ['description', 'like', '%vapor barrier%'],
    ['name', '=', CREW_LABOR],
  ]);
  assert.ok((queries[1]!['organization'] as { costItems: { $: { page: string } } }).costItems.$.page === 'p2');
  assert.ok(found.some((c) => c.name === 'Insulation - Batt' && c.templateName === 'Addition/House Build'));
  assert.ok(!found.some((c) => c.templateId === 'tplChosen'));
});

// ---- through the draft --------------------------------------------------------

const fx = JSON.parse(readFileSync('test/fixtures/haag-basement.json', 'utf8')) as DraftFixture;
const FIN = '22PLCZU3cbqS';
const GR = '22PF3gnGCuiB';
const byId = new Map(fx.templates.map((t) => [t.id, t]));
const load = async (id: string): Promise<Template> => byId.get(id)!;
interface Fake extends StructuredCall { calls: StructuredArgs<unknown>[] }
function fake(replies: unknown[]): Fake {
  const queue = [...replies];
  const calls: StructuredArgs<unknown>[] = [];
  const f = (async (args: StructuredArgs<unknown>) => {
    calls.push(args);
    return { parsed: queue.shift(), stopReason: 'end_turn', usage: { input: 1_000, output: 100, cacheRead: 0, cacheWrite: 0 } };
  }) as Fake;
  f.calls = calls;
  return f;
}
const MARGINS = { Subcontractor: 0.3, Labor: 0.45, Materials: 0.31, Other: 0.31 };
const ev = [{ source: 'Carl, pass 2 direction', quote: 'batt insulation in the false walls' }];
const gap = (scope: string, costType: string, unit: string, quantity: number | null, lookBack: string[], option: string | null = 'Framed walls') =>
  ({ scope, why: 'no line in these templates', unit, quantity, costType, basis: 'per the rep\'s direction', evidence: ev, lookBack, option });
const DRAFT = {
  summary: 'Basement: concrete paint, or framed false walls as an option.',
  scopeOfWork: 'Paint the block; option to frame false walls.',
  lines: [{ lineId: '22PLCchBuFMa', quantity: 6, basis: 'two coats', evidence: ev, option: null, confidence: 'medium', lookBack: [] }],
  gaps: [
    gap('Batt insulation in the false wall cavities', 'Materials', 'Square Foot', 909, ['insulation', 'batt']),
    gap('Plastic vapor barrier between the foundation and the false walls', 'Materials', 'Square Foot', 909, ['vapor barrier', 'poly']),
    gap('Labor to install the plastic and batt insulation', 'Labor', 'Hours', null, []),
    gap('Extend or relocate outlets to the new false wall face', 'Subcontractor', 'Each', null, ['electrical', 'outlet']),
  ],
  questions: [],
  contingency: { rate: 10, why: 'Moisture on the block.' },
};
const finding = (id: string, extra: Record<string, unknown>) => ({
  target: { kind: 'gap', id }, match: 'none', summary: 'Nothing in DB history.', pastWork: [], suggestedUnitCost: null, suggestionBasis: '',
  confidence: 'medium', typicallySubbed: null, usualVendor: null, regionalUnitCost: null, regionalBasis: '',
  catalog: { kind: 'none', id: null, quantity: null, basis: '' }, ...extra,
});
const REPLY = {
  findings: [
    finding('gap-0', {
      match: 'match', summary: 'DB bought R15 wall batts from Fidelity for the Myers sunroom at about $0.91/SF.', suggestedUnitCost: 0.91, suggestionBasis: '$62/bag over 67.81 SF.',
      catalog: { kind: 'templateLine', id: 'lineBattAdd', quantity: 909, basis: 'Same 909 SF of gross wall; the line is per square foot.' },
    }),
    finding('gap-1', { catalog: { kind: 'catalogItem', id: 'itemVapor', quantity: 4, basis: '909 SF of wall; a 10 × 25 roll covers 250 SF, so 4 rolls with laps.' } }),
    finding('gap-2', { catalog: { kind: 'catalogItem', id: 'itemCrew', quantity: 6, basis: 'Two of the crew, three hours, to staple poly and set batts on 114 LF.' } }),
    finding('gap-3', { regionalUnitCost: 90, regionalBasis: 'A small-town electrician at about $90 a box to extend to a new wall face.' }),
  ],
};

test('a gap the catalog covers becomes a kept, priced line in its option; the rest stay gaps with a ballpark', async () => {
  const all = foldCandidates(RAW as never, ['tplChosen']);
  const searched: { terms: string[]; exclude: string[] }[] = [];
  const call = fake([DRAFT, REPLY]);
  const d = await draftEstimate(fx.evidence, fx.index, load, call, {
    templateIds: [FIN, GR],
    history: { search: async () => ({ terms: [] }), margins: MARGINS },
    catalog: { search: async (terms, exclude) => { searched.push({ terms, exclude }); return all; } },
  });
  assert.deepEqual(searched, [{ terms: ['insulation', 'batt', 'vapor barrier', 'poly', 'plastic', 'electrical', 'outlet'], exclude: [FIN, GR] }], 'lookBack terms, then the telling words of a gap with none');
  assert.equal(call.calls.length, 2, 'draft, then the catalog-and-history call');
  const asked = call.calls[1]!.content.map((c) => (c.type === 'text' ? c.text : '')).join('\n');
  assert.match(asked, /- gap-0 · gap · Batt insulation[^\n]*\n  basis: per the rep's direction\n  catalog candidates \(2\), from other templates and the ungrouped catalog:\n    · lineBattAdd · templateLine · Insulation - Batt/);
  // The labor gap's own words match the batt lines too; Crew Labor comes first because it is the gap's cost type, and the model decides.
  assert.match(asked, /- gap-2 · gap · Labor to install[^\n]*\n  basis: [^\n]*\n  catalog candidates \(3\)[^\n]*\n    · itemCrew · catalogItem · Crew Labor · Hours · Labor · \$55\.00 cost \/ \$100\.00 price per Hours · an ungrouped catalog item\n    · lineBattAdd/);
  assert.match(asked, /4 of these are gaps with no line in the chosen templates\. Match each to a catalog candidate/);

  assert.equal(d.found.length, 3);
  const [batt, poly, crew] = d.found;
  assert.equal(batt!.name, 'Insulation - Batt');
  assert.equal(batt!.templateName, 'Addition/House Build');
  assert.deepEqual(batt!.groupPath, ['NEW HOME BUILD SCOPE', 'Phase 2 - Rough-In', 'Insulation']);
  assert.equal(batt!.option, 'Framed walls');
  assert.equal(formatMoney(batt!.unitPrice), '$20.1985', 'the catalog price as JobTread holds it, to four places');
  assert.equal(formatMoney(batt!.price), '$18,360.44', '909 × 20.1985, rounded once');
  assert.equal(formatMoney(batt!.historyUnitCost!), '$0.91', 'what history found rides along, per SF like the line');
  assert.equal(formatMoney(batt!.historyUnitPrice!), '$1.32', 'at the Materials margin');
  assert.equal(poly!.templateId, 'catalog');
  assert.equal(poly!.quantity, 4);
  assert.equal(formatMoney(poly!.price), '$107.24', '4 × 26.8105');
  assert.equal(crew!.name, CREW_LABOR);
  assert.equal(formatMoney(crew!.price), '$600.00');
  assert.equal(d.lines.length, 4, 'the found lines are kept lines');

  // The gaps: three resolved, one open with a regional per-box figure and no quantity.
  assert.deepEqual(d.gaps.map((g) => g.resolved?.candidate.name ?? null), ['Insulation - Batt', 'Vapor Barrier 4 mil', CREW_LABOR, null]);
  assert.equal(d.gaps[0]!.proposed, null, 'priced from the catalog, so no history proposal');
  assert.equal(formatMoney(d.gaps[3]!.regionalUnitCost!), '$90.00');
  assert.equal(d.catalog?.found, 3);
  assert.equal(d.catalog?.candidates.length, all.length);
  assert.equal(d.totals.regionalForGaps.gaps, 0, 'no quantity, so nothing totals');

  // Found lines belong to their option, so the add-on carries them and the base does not.
  const framed = d.totals.options.find((o) => o.group === 'Framed walls')!;
  assert.equal(framed.required, false);
  assert.equal(framed.choices[0]!.totals.lines, 3);
  assert.equal(formatMoney(framed.choices[0]!.totals.price), '$19,067.68', '18,360.44 + 107.24 + 600.00');
  assert.equal(d.totals.base.lines, 1);
  assert.equal(formatMoney(d.contingency!.options[0]!.cost), '$13,066.33', '12,662.37 + 73.96 + 330.00');

  const steps = draftSteps(d);
  assert.match(steps, /^Base scope: [^\n]* — leaves out 1 flagged item with no line anywhere in the catalog \(step 7\); 3 flagged items found in other templates or the catalog, priced and included \(step 3\)$/m);
  assert.match(steps, /^3\. Found in other templates and the catalog — add just these lines \(Budget tab › Add from catalog › search the name\):\n   - Addition\/House Build › NEW HOME BUILD SCOPE › Phase 2 - Rough-In › Insulation › Insulation - Batt: 909 Square Foot \[option: Framed walls\] — \$20\.1985\/Square Foot, \$18,360\.44 — for "Batt insulation in the false wall cavities": Same 909 SF of gross wall; the line is per square foot\. \(check\) — also in X-Division 07 Thermal & Moisture\n       history: DB bought R15 wall batts[^\n]*History says \$0\.91\/Square Foot cost \(\$1\.32 price\) against the template's \$13\.93\./m);
  assert.match(steps, /^   - catalog item "Vapor Barrier 4 mil": 4 Each \[option: Framed walls\] — \$26\.8105\/Each, \$107\.24 — for "Plastic vapor barrier[^"]*": 909 SF of wall; a 10 × 25 roll covers 250 SF, so 4 rolls with laps\. \(check\)$/m);
  assert.match(steps, /^   - catalog item "Crew Labor": 6 Hours \[option: Framed walls\] — \$100\.00\/Hours, \$600\.00/m);
  assert.match(steps, /^4\. Contingency at 10%/m);
  assert.match(steps, /^7\. Nowhere in the catalog — take to Carl before the estimate goes out:\n   - Extend or relocate outlets to the new false wall face \(Subcontractor, Each\) \[option: Framed walls\]: no line in these templates\n     history: Nothing in DB history\. Regional ballpark: \$90\.00\/Each cost \(\$128\.57 price\), quantity still to be confirmed/m);
  assert.doesNotMatch(steps, /Batt insulation in the false wall cavities \(Materials/, 'a covered gap is not listed as a gap');

  const html = renderDraft(fx.evidence, d);
  assert.match(html, /<h2>Found in other templates and the catalog<\/h2>/);
  assert.match(html, /<div class="path">Batt insulation in the false wall cavities<\/div><div class="name">Addition\/House Build › NEW HOME BUILD SCOPE › Phase 2 - Rough-In › Insulation › Insulation - Batt<\/div>/);
  assert.match(html, /<h2>Nowhere in the catalog <span class="count">1<\/span><\/h2>/);
  assert.match(html, /1 item flagged for Carl &middot; the base price leaves it out &middot; 3 flagged items found elsewhere in the catalog and priced/);
  const json = draftJson(d) as { found: { name: string; source: { template: string | null; alsoIn: string[] } }[]; gaps: { resolved: { name: string; quantity: number } | null }[]; catalog: { found: number; candidates: number } };
  assert.equal(json.found[0]!.source.template, 'Addition/House Build');
  assert.deepEqual(json.found[0]!.source.alsoIn, ['X-Division 07 Thermal & Moisture']);
  assert.deepEqual(json.gaps[1]!.resolved, { lineId: 'itemVapor', name: 'Vapor Barrier 4 mil', kind: 'catalogItem', template: null, quantity: 4, unit: 'Each', basis: '909 SF of wall; a 10 × 25 roll covers 250 SF, so 4 rolls with laps.' });
  assert.equal(json.catalog.found, 3);
});

test('a match the model names that was not a candidate, or with no quantity in the line\'s unit, leaves the gap open with a note', async () => {
  const all = foldCandidates(RAW as never, []);
  const reply = {
    findings: [
      finding('gap-0', { catalog: { kind: 'templateLine', id: 'made-up', quantity: 1, basis: '' } }),
      finding('gap-1', { catalog: { kind: 'catalogItem', id: 'itemVapor', quantity: null, basis: 'rolls, count unknown' } }),
      finding('gap-2', { catalog: { kind: 'catalogItem', id: 'itemCrew', quantity: null, basis: '' } }),
    ],
  };
  const d = await draftEstimate(fx.evidence, fx.index, load, fake([DRAFT, reply]), {
    templateIds: [FIN, GR],
    catalog: { search: async () => all },
  });
  assert.equal(d.found.length, 0);
  assert.equal(d.history, null, 'no history source: the third call ran for the catalog alone');
  assert.match(d.gaps[0]!.catalogNote!, /named catalog id made-up, which was not among the candidates/);
  assert.match(d.gaps[1]!.catalogNote!, /"Vapor Barrier 4 mil" covers this, but no quantity in Each was given; the rep sets it/);
  assert.match(d.gaps[2]!.catalogNote!, /"Crew Labor" covers this, but no quantity in Hours was given/);
  assert.match(draftSteps(d), /Plastic vapor barrier[^\n]*\n     catalog: "Vapor Barrier 4 mil" covers this, but no quantity in Each was given; the rep sets it/);

  // With no gaps there is nothing to search and no third call.
  const none = fake([{ ...DRAFT, gaps: [] }]);
  const plain = await draftEstimate(fx.evidence, fx.index, load, none, { templateIds: [FIN, GR], catalog: { search: async () => all } });
  assert.equal(none.calls.length, 1);
  assert.equal(plain.catalog, null);
});

test('a fixture replays the catalog by term, and the CLI can turn the search off', async () => {
  const all: CatalogCandidate[] = foldCandidates(RAW as never, []);
  const src = fixtureCatalog(all);
  const hits = await src.search(['vapor'], ['tplAdd']);
  assert.deepEqual(hits.map((c) => c.name).sort(), [CREW_LABOR, 'Vapor Barrier 4 mil'], 'the term, plus Crew Labor always');
  assert.ok(!(await src.search(['insulation'], ['tplAdd'])).some((c) => c.templateId === 'tplAdd'), 'a chosen template is left out');
  assert.equal(parseDraftArgs(['261323']).catalog, true);
  assert.equal(parseDraftArgs(['261323', '--no-catalog']).catalog, false);
});
