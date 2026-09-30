/**
 * The drafter, offline.
 *
 * The model is behind an interface, so everything around it is tested here
 * with canned replies and no key: what the model is shown, which templates
 * get fetched, how a kept line is priced from the catalog, what happens to a
 * line id the model made up, and what the rep's page and steps say. Whether
 * the model reads a basement well is for Robert and Kristen to grade.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { formatMoney } from '../src/money.ts';
import type { Reader } from '../src/jobtread/queries.ts';
import { JobTreadError } from '../src/jobtread/client.ts';
import {
  fetchTemplate, fetchTemplateIndex, scopeLines, type Template,
} from '../src/draft/templates.ts';
import { fetchJobEvidence, resolveJobId } from '../src/draft/evidence.ts';
import { evidenceText, templateIndexText, templateLinesText } from '../src/draft/prompt.ts';
import { anthropicStructuredCall, type StructuredArgs, type StructuredCall } from '../src/draft/model.ts';
import { z } from 'zod';
import { draftEstimate, parseOption, type DraftFixture } from '../src/draft/draft.ts';
import { draftJson, draftSteps, renderDraft } from '../src/draft/render.ts';
import { estimateDraftTokens, parseDraftArgs } from '../src/draft-cli.ts';

const fx = JSON.parse(readFileSync('test/fixtures/haag-basement.json', 'utf8')) as DraftFixture;
const FIN = '22PLCZU3cbqS';
const GR = '22PF3gnGCuiB';
const byId = new Map(fx.templates.map((t) => [t.id, t]));
const load = async (id: string): Promise<Template> => {
  const t = byId.get(id);
  if (!t) throw new Error(`test fixture has no template ${id}`);
  return t;
};

interface Fake extends StructuredCall { calls: StructuredArgs<unknown>[] }

function fake(replies: unknown[], stopReason = 'end_turn'): Fake {
  const queue = [...replies];
  const calls: StructuredArgs<unknown>[] = [];
  const f = (async (args: StructuredArgs<unknown>) => {
    calls.push(args);
    return {
      parsed: queue.shift(),
      stopReason,
      usage: { input: 1_000, output: 100, cacheRead: 0, cacheWrite: 0 },
    };
  }) as Fake;
  f.calls = calls;
  return f;
}

const PICK = {
  summary: 'A basement refresh: skim and paint the walls, maybe the ceiling, new floor.',
  picks: [
    { templateId: FIN, role: 'primary', why: 'paint and flooring live here' },
    { templateId: GR, role: 'supplement', why: 'project management and the permit' },
    { templateId: 'nope', role: 'supplement', why: 'made up' },
  ],
  noFit: null,
};

const ev = (quote: string) => [{ source: 'Robert Switzer, 2026-07-23', quote }];
const DRAFT = {
  summary: 'Basement refresh, 18\'4" × 38\'6", paint plus a flooring choice.',
  scopeOfWork: 'Skim-coat and paint the basement walls.\nFlooring as the option chosen.',
  lines: [
    { lineId: '22PLCchBuFMa', quantity: 6, basis: '909 SF of wall, two coats, ~300 SF a gallon', evidence: ev('8-foot walls'), option: null, confidence: 'medium', lookBack: [] },
    { lineId: '22PLhtLxcz9S', quantity: 24, basis: 'two painters, a day and a half', evidence: ev('primarily through painting'), option: null, confidence: 'low', lookBack: ['paint sub', 'painting'] },
    { lineId: '22PLCchBuFMW', quantity: 909, basis: '(18.33 + 38.5) × 2 × 8 = 909 SF', evidence: ev('18 feet 4 inches (width) × 38 feet 6 inches (length), with 8-foot walls'), option: null, confidence: 'high', lookBack: [] },
    { lineId: '22PLCchBuFMX', quantity: 16, basis: 'skim two coats over 909 SF', evidence: ev('skimming the concrete walls'), option: null, confidence: 'low', lookBack: [] },
    { lineId: '22PLCchBuFMQ', quantity: 706, basis: '18.33 × 38.5 = 706 SF; the allowance already carries 10% overage', evidence: ev('18 feet 4 inches (width) × 38 feet 6 inches (length)'), option: 'Flooring — LVP', confidence: 'high', lookBack: [] },
    { lineId: '22PLCchBuFMR', quantity: 706, basis: 'same area', evidence: ev('Laminate Vinyl Plank'), option: 'Flooring — LVP', confidence: 'high', lookBack: [] },
    { lineId: '22PLhsr2Yx56', quantity: 24, basis: '706 SF at ~30 SF an hour', evidence: ev('Laminate Vinyl Plank'), option: 'Flooring — LVP', confidence: 'medium', lookBack: [] },
    { lineId: '22PLhsr2Yx55', quantity: 706, basis: 'epoxy by the sub, per SF', evidence: ev('Epoxy Flooring'), option: 'Flooring — Epoxy', confidence: 'medium', lookBack: ['epoxy', 'floor coating'] },
    { lineId: '22PLhtLxcz9T', quantity: 706, basis: 'ceiling footprint, sprayed by a sub', evidence: ev('Painting the ceiling is an option'), option: 'Ceiling paint', confidence: 'low', lookBack: [] },
    { lineId: '22PF3i5ZiGxs', quantity: 4, basis: 'small job', evidence: ev('sprucing up the basement'), option: null, confidence: 'medium', lookBack: [] },
    { lineId: '22PF3i5ZiGxk', quantity: 1, basis: 'Van Wert permit', evidence: [{ source: 'job', quote: 'City: Van Wert' }], option: null, confidence: 'low', lookBack: [] },
    { lineId: '22PPpWUpAJaL', quantity: 0, basis: 'time tracking only', evidence: ev('n/a'), option: null, confidence: 'high', lookBack: [] },
    { lineId: 'zzz', quantity: 1, basis: 'invented', evidence: [], option: null, confidence: 'low', lookBack: [] },
    { lineId: '22PLht84FDJ9', quantity: -2, basis: 'nonsense', evidence: [], option: null, confidence: 'low', lookBack: [] },
  ],
  gaps: [
    { scope: 'Move basement contents before and after', why: 'no template line for moving the customer\'s things', unit: 'Hours', quantity: 4, costType: 'Labor', basis: 'two people, two hours', evidence: ev('Assistance with moving basement equipment and contents will be included as a separate labor line item'), lookBack: ['skim coat', 'skim'], option: null },
  ],
  questions: [{ question: 'Paint the ceiling or not?', why: 'the note says the decision is tentative' }],
  contingency: { rate: 7, why: 'The walls are skimmed to the concrete, so hidden conditions are likely.' },
};

// ---- what the model is shown --------------------------------------------------

test('the template list names every template once with its line count, and hides the time-tracking groups', () => {
  const text = templateIndexText(fx.index);
  assert.equal(text.match(/^- 22P/gm)!.length, 44);
  assert.match(text, /- 22PLCZU3cbqS · X-Division 09 Finishes · 26 lines/);
  assert.match(text, /- 22PLm4qjpyXG · Bathroom Remodel · 141 lines/);
  assert.match(text, /Groups: BATHROOM REMODEL, Phase 1 - General Requirements/);
  assert.doesNotMatch(text, /CLOCK IN ITEMS|BURDEN|GENERAL AND ADMINISTRATIVE/);
});

test('a template is shown grouped as the rep sees it, in order, and with no prices', () => {
  const text = templateLinesText(byId.get(FIN)!);
  assert.match(text, /26 lines you may keep/);
  assert.match(text, /## FINISHES › Paint\n/);
  assert.match(text, /- 22PLCchBuFMa · Paint · Gallons · Materials\n  Includes good quality paint/);
  assert.ok(text.indexOf('## FINISHES › Flooring') < text.indexOf('## FINISHES › Casing'), 'Flooring (k) before Casing (l)');
  assert.ok(text.indexOf('22PLCchBuFMQ · Flooring') < text.indexOf('22PLCchBuFMR · Flooring - Miscellaneous'), 'lines by position');
  // The catalog's own wording ("up to $5/sf") stays; the price of record does not appear.
  assert.doesNotMatch(text, /\$85|123\.25|unitPrice|unitCost/);
});

test('structural and specification lines are not the model\'s to keep or drop', () => {
  const t: Template = {
    id: 'T', name: 'T', description: null,
    groups: [
      { id: 'g1', name: 'Phase 1', position: 'a', parentId: 'T', isSelection: false },
      { id: 'g2', name: 'CLOCK IN ITEMS', position: 'b', parentId: 'T', isSelection: false },
      { id: 'g3', name: 'Site Prep', position: 'a', parentId: 'g1', isSelection: false },
    ],
    lines: [
      { id: 'a', name: 'Demolition', description: null, unit: 'Hours', costTypeName: 'Labor', costCodeName: '', groupId: 'g3', position: 'a', isSpecification: false, quantity: null, quantityFormula: null, priced: null },
      { id: 'b', name: 'Demolition', description: null, unit: null, costTypeName: 'Clock In', costCodeName: '', groupId: 'g2', position: 'a', isSpecification: false, quantity: null, quantityFormula: null, priced: null },
      { id: 'c', name: 'Note to crew', description: null, unit: null, costTypeName: 'Other', costCodeName: '', groupId: 'g3', position: 'b', isSpecification: true, quantity: null, quantityFormula: null, priced: null },
    ],
  };
  assert.deepEqual(scopeLines(t).map((l) => l.id), ['a']);
  const text = templateLinesText(t);
  assert.match(text, /1 lines you may keep/);
  assert.match(text, /Not listed: 1 lines in CLOCK IN ITEMS.*1 specification lines/);
});

test('the job text carries the discovery note, the measurements, and the state of the budget', () => {
  const text = evidenceText(fx.evidence);
  assert.match(text, /^# Job: 261323 Haag_Remodel \(26-1323\)/);
  assert.match(text, /Project type: C-Remodel\/Interior\. Job type: Construction\. City: Van Wert\./);
  assert.match(text, /No estimate exists yet.*41 lines, none priced/);
  assert.match(text, /18 feet 4 inches \(width\) × 38 feet 6 inches \(length\), with 8-foot walls/);
  assert.match(text, /# Files sent with this request \(0\)/);
});

// ---- the draft ----------------------------------------------------------------

test('the drafter picks templates, prices kept lines from the catalog, and rejects what it was not given', async () => {
  const call = fake([PICK, DRAFT]);
  const loaded: string[] = [];
  const d = await draftEstimate(fx.evidence, fx.index, async (id) => { loaded.push(id); return load(id); }, call);

  assert.equal(call.calls.length, 2);
  assert.deepEqual(loaded, [FIN, GR], 'only real templates are fetched, primary first');
  assert.deepEqual(d.rejectedPicks.map((r) => r.templateId), ['nope']);
  assert.deepEqual(d.plans.map((p) => [p.template.id, p.role]), [[FIN, 'primary'], [GR, 'supplement']]);

  const paint = d.lines.find((l) => l.name === 'Paint')!;
  assert.equal(formatMoney(paint.unitCost), '$85.00');
  assert.equal(formatMoney(paint.unitPrice), '$123.25');
  assert.equal(formatMoney(paint.cost), '$510.00');
  assert.equal(formatMoney(paint.price), '$739.50');
  assert.deepEqual(paint.groupPath, ['FINISHES', 'Paint']);
  assert.equal(paint.costTypeName, 'Materials');

  const floor = d.lines.find((l) => l.name === 'Flooring')!;
  assert.equal(formatMoney(floor.price), '$5,118.50', '706 × 7.25, rounded once');
  assert.equal(floor.option, 'Flooring — LVP');

  const permit = d.lines.find((l) => l.name === 'Permit')!;
  assert.equal(permit.priced, false, 'a $0 catalog item is kept but shown unpriced');
  assert.equal(d.lines.find((l) => l.name === 'Sales On-Site Support')!.priced, false);

  assert.deepEqual(
    d.rejected.map((r) => r.lineId),
    ['zzz', '22PLht84FDJ9'],
    'an invented id and a negative quantity are listed, never priced',
  );
  assert.match(d.rejected[0]!.reason, /not a line in any chosen template/);
  assert.match(d.rejected[1]!.reason, /quantity -2/);

  const sos = d.lines.find((l) => l.name === 'Sales On-Site Support')!;
  assert.equal(sos.tracking, true, 'a $0/$0 catalog item is a time-tracking line, not an unpriced one');
  assert.equal(permit.tracking, false);

  // Base scope leaves the options out. "Group — Choice" is one of several; a
  // bare name is a yes-or-no add-on.
  assert.equal(d.totals.base.lines, 7);
  assert.equal(d.totals.base.unpriced, 1, 'the Permit; the $0 tracking line is not something to price by hand');
  assert.deepEqual(
    d.totals.options.map((o) => [o.group, o.required, o.choices.map((c) => c.name)]),
    [['Flooring', true, ['LVP', 'Epoxy']], ['Ceiling paint', false, ['Ceiling paint']]],
  );
  assert.equal(formatMoney(d.totals.options[0]!.choices[1]!.totals.price), '$7,677.75', '706 × 10.875');
  assert.equal(formatMoney(d.totals.options[1]!.choices[0]!.totals.price), '$4,043.62', '706 × 5.7275');
  assert.equal(d.totals.all.lines, 12);

  // What the rep deletes is everything in scope that was not kept.
  assert.equal(d.plans[0]!.kept.length, 9);
  assert.equal(d.plans[0]!.removed.length, 17);
  assert.equal(d.plans[1]!.kept.length, 3);
  assert.equal(d.plans[1]!.removed.length, 20);

  assert.equal(d.gaps.length, 1);
  assert.equal(d.questions.length, 1);
  assert.equal(d.usage.input, 2_000, 'usage is summed over both calls');
  assert.equal(d.pickSummary, PICK.summary);
});

test('--templates skips the picker', async () => {
  const call = fake([DRAFT]);
  const d = await draftEstimate(fx.evidence, fx.index, load, call, { templateIds: [GR, FIN] });
  assert.equal(call.calls.length, 1);
  assert.match(call.calls[0]!.system, /drafting the job budget/);
  assert.equal(d.pickSummary, '');
  assert.deepEqual(d.plans.map((p) => [p.template.id, p.role]), [[GR, 'primary'], [FIN, 'supplement']]);
});

test('when nothing fits, the draft says so and nothing is built', async () => {
  const call = fake([{ summary: 'A pool.', picks: [], noFit: 'DB has no template for a swimming pool.' }]);
  const d = await draftEstimate(fx.evidence, fx.index, load, call);
  assert.equal(call.calls.length, 1, 'no second call without templates');
  assert.equal(d.noFit, 'DB has no template for a swimming pool.');
  assert.equal(d.lines.length, 0);
  assert.match(draftSteps(d), /No budget template fits this job\. DB has no template for a swimming pool\.\nTake it to Carl/);
  assert.match(renderDraft(fx.evidence, d), /No budget template fits this job/);
});

test('a cut-off or refused reply is an error, not a half-draft', async () => {
  await assert.rejects(
    draftEstimate(fx.evidence, fx.index, load, fake([PICK], 'max_tokens')),
    /pick the templates reply was cut off/,
  );
  await assert.rejects(
    draftEstimate(fx.evidence, fx.index, load, fake([PICK, DRAFT], 'refusal')),
    /declined to pick the templates/,
  );
  await assert.rejects(
    draftEstimate(fx.evidence, fx.index, load, fake([{ summary: 'x', picks: 'not an array', noFit: null }])),
    /did not fit the schema/,
  );
});

// ---- what the rep gets --------------------------------------------------------

test('the steps read as a recipe for JobTread, and the page carries them', async () => {
  const d = await draftEstimate(fx.evidence, fx.index, load, fake([PICK, DRAFT]));
  const steps = draftSteps(d);
  assert.match(steps, /^261323 Haag_Remodel — budget draft\n/);
  assert.match(steps, /^Base scope: .* — leaves out 1 flagged item with no line anywhere in the catalog \(step 6\)$/m);
  assert.match(steps, /^Option "Flooring", one choice required:\n   LVP: \$8,286\.28 price.*\n   Epoxy: \$7,677\.75 price/m);
  assert.match(steps, /^Add-on "Ceiling paint", customer may decline: \$4,043\.62 price/m);
  assert.match(steps, /1\. Budget tab › Add from catalog › "X-Division 09 Finishes" \(the main template\)\.\n   Keep 9 lines, delete the other 17\.\n/);
  assert.match(steps, /FINISHES › Paint › Paint: 6 Gallons — 909 SF of wall/);
  assert.match(steps, /\[option: Flooring — LVP\]/);
  assert.match(steps, /Permit: 1 +\[no catalog price — type it\]/);
  assert.match(steps, /Sales On-Site Support: 0 Hours \[time tracking, \$0\]/);
  assert.match(steps, /Delete: Trim - Crown Molding; Trim - Casing/);
  assert.match(steps, /2\. Budget tab › Add from catalog › "X-Division 01 General Requirements"\./);
  assert.match(steps, /4\. Selection groups, so the customer picks on the estimate:\n   - "Flooring", one choice required: LVP: Flooring; Flooring - Miscellaneous MAT; Flooring Labor · Epoxy: Flooring - Sub\n   - "Ceiling paint", optional add-on \(may pick none\): Paint Labor - Sub/);
  assert.match(steps, /5\. General Description:\n   Skim-coat and paint/);
  assert.match(steps, /6\. Nowhere in the catalog — take to Carl before the estimate goes out:\n   - Move basement contents before and after \(Labor, 4 Hours\)/);
  assert.match(steps, /7\. Confirm before it goes out:\n   - Paint the ceiling or not\?/);
  assert.match(steps, /named 2 lines that are not in these templates; they were NOT added/);
  assert.match(steps, /Nothing here was written to JobTread/);

  const html = renderDraft(fx.evidence, d, { footnote: 'test run' });
  assert.match(html, /<title>261323 Haag_Remodel — budget draft<\/title>/);
  assert.match(html, /4 items flagged for Carl/, 'one gap, two rejected line ids, one rejected template');
  assert.match(html, /Main template: X-Division 09 Finishes/);
  assert.match(html, /Also add: X-Division 01 General Requirements/);
  assert.match(html, /no catalog price/);
  assert.match(html, /time tracking, \$0/);
  assert.match(html, /the base price leaves it out/);
  assert.match(html, /<strong>Flooring<\/strong>, one choice required:/);
  assert.match(html, /<strong>Ceiling paint<\/strong>, optional add-on/);
  assert.match(html, /Nowhere in the catalog/);
  assert.match(html, /Named by the model, not in the templates/);
  assert.match(html, /Copy the steps/);
  assert.match(html, /18 feet 4 inches \(width\)/, 'the evidence quote is on the page');
  assert.match(html, /test run/);
  assert.match(html, /A draft, not an estimate/);

  const json = draftJson(d) as {
    lines: { name: string; price: string | null }[];
    totals: { base: { price: string }; options: { group: string; required: boolean; choices: { name: string; price: string }[] }[] };
  };
  assert.equal(json.totals.options[0]!.required, true);
  assert.equal(json.totals.options[1]!.choices[0]!.price, '$4,043.62');
  assert.doesNotThrow(() => JSON.stringify(json));
  assert.equal(json.lines.find((l) => l.name === 'Paint')!.price, '$739.50');
  assert.equal(json.lines.find((l) => l.name === 'Permit')!.price, null);
  assert.equal(json.totals.base.price, formatMoney(d.totals.base.price));
});

// ---- the command line ---------------------------------------------------------

test('arguments: a job by number or id, and the flags', () => {
  const a = parseDraftArgs(['261323', '--dry-run', '--templates', `${FIN}, ${GR}`, '--out', 'x', '--no-photos']);
  assert.equal(a.job, '261323');
  assert.equal(a.dryRun, true);
  assert.deepEqual(a.templateIds, [FIN, GR]);
  assert.equal(a.out, 'x');
  assert.equal(a.photos, false);
  assert.equal(parseDraftArgs(['--fixture', 'f.json']).fixture, 'f.json');
  assert.throws(() => parseDraftArgs([]), /usage/);
  assert.throws(() => parseDraftArgs(['261323', '--bogus']), /unknown flag/);
  assert.throws(() => parseDraftArgs(['a', 'b']), /unexpected argument/);
});

test('the dry-run estimate counts the photos that would go, even before any are downloaded', () => {
  const n = estimateDraftTokens(fx.evidence, 'x'.repeat(4_000));
  assert.ok(n >= 1_000 + 18 * 1_600, `${n} tokens`);
});

// ---- reading JobTread ---------------------------------------------------------

function reader(answer: (q: Record<string, unknown>) => unknown): Reader & { queries: Record<string, unknown>[] } {
  const queries: Record<string, unknown>[] = [];
  return {
    organizationId: 'org',
    queries,
    async query<T>(q: Record<string, unknown>): Promise<T> {
      queries.push(q);
      return answer(q) as T;
    },
  };
}

test('a job reference is looked up by the kind of thing it is', async () => {
  const r = reader(() => ({ organization: { jobs: { nodes: [{ id: '22PbLhMqY7tC', name: '261323 Haag_Remodel' }] } } }));
  assert.deepEqual(await resolveJobId(r, '261323'), { id: '22PbLhMqY7tC', name: '261323 Haag_Remodel' });
  const w1 = (r.queries[0] as { organization: { jobs: { $: { where: unknown } } } }).organization.jobs.$.where;
  assert.deepEqual(w1, [['name'], 'like', '261323%']);
  await resolveJobId(r, '26-1323');
  const w2 = (r.queries[1] as { organization: { jobs: { $: { where: unknown } } } }).organization.jobs.$.where;
  assert.deepEqual(w2, [['number'], '=', '26-1323']);
  assert.deepEqual(await resolveJobId(r, '22PbLhMqY7tC'), { id: '22PbLhMqY7tC', name: '22PbLhMqY7tC' });
  assert.equal(r.queries.length, 2, 'an id needs no lookup');

  const two = reader(() => ({ organization: { jobs: { nodes: [{ id: 'a', name: '261323 A' }, { id: 'b', name: '261323 B' }] } } }));
  await assert.rejects(resolveJobId(two, '261323'), /2 jobs match/);
  const none = reader(() => ({ organization: { jobs: { nodes: [] } } }));
  await assert.rejects(resolveJobId(none, '261323'), /no job matches/);
});

test('the job is read with its notes, files and budget, and every file counts as evidence', async () => {
  const r = reader((q) => {
    if ('job' in q && 'comments' in (q['job'] as object)) {
      return {
        job: {
          id: 'j', name: '261323 Haag_Remodel', number: '26-1323', description: ' refresh ',
          customFieldValues: { nodes: [
            { value: 'Construction', customField: { id: '22PBzhnUydgC', name: 'Job Type' } },
            { value: 'C-Remodel/Interior', customField: { id: '22PC7idvhRzp', name: 'Project Type' } },
            { value: 'Van Wert', customField: { id: 'x', name: 'City Job Is Located' } },
            { value: 'Robert Switzer', customField: { id: 'y', name: 'Sales Rep' } },
          ] },
          comments: { nextPage: null, nodes: [
            { createdAt: '2026-07-23T18:04:11.115Z', message: 'Measured 18x38', isFromEmail: false, createdByUser: { name: 'Robert Switzer' } },
            { createdAt: '2026-07-24T00:00:00.000Z', message: 'No message provided', isFromEmail: true, createdByUser: null },
          ] },
          files: { nextPage: null, nodes: [
            { id: 'f1', name: 'CompanyCam 1', type: 'image/jpeg', size: 1000, createdAt: '2026-07-23T17:07:56.364Z', url: 'https://cdn/1', description: null },
            { id: 'f2', name: 'notes.docx', type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', size: 1000, createdAt: '2026-07-23T17:07:56.364Z', url: 'https://cdn/2', description: null },
          ] },
        },
      };
    }
    // the budget
    return {
      job: {
        id: 'j',
        costItems: { count: 2, nextPage: null, nodes: [
          { id: 'b1', name: 'Design', quantity: null, unitCost: null, unitPrice: null, cost: 0, price: 0, isSpecification: false, position: 'a', costType: { id: 'c', name: 'Clock In' }, costCode: { id: 'cc', name: 'Design' }, costGroup: { id: 'g1', name: 'CLOCK IN ITEMS' }, organizationCostItem: null, documentCostItems: { count: 0 } },
          { id: 'b2', name: 'Paint', quantity: 2, unitCost: 85, unitPrice: 123.25, cost: 170, price: 246.5, isSpecification: false, position: 'b', costType: { id: 'm', name: 'Materials' }, costCode: { id: 'cc2', name: 'Finishes' }, costGroup: { id: 'g2', name: 'Paint' }, organizationCostItem: { id: 'cat' }, documentCostItems: { count: 0 } },
        ] },
        costGroups: { count: 2, nextPage: null, nodes: [
          { id: 'g1', name: 'CLOCK IN ITEMS', position: 'a', parentCostGroup: null },
          { id: 'g2', name: 'Paint', position: 'b', parentCostGroup: null },
        ] },
      },
    };
  });
  const downloaded: string[] = [];
  const e = await fetchJobEvidence(r, 'j', { download: async (url) => { downloaded.push(url); return new Uint8Array([1]); } });
  assert.equal(e.jobName, '261323 Haag_Remodel');
  assert.equal(e.description, 'refresh');
  assert.equal(e.jobType, 'Construction');
  assert.equal(e.projectType, 'C-Remodel/Interior');
  assert.equal(e.city, 'Van Wert');
  assert.equal(e.comments.length, 1, 'the empty email comment is dropped');
  assert.deepEqual(downloaded, ['https://cdn/1']);
  assert.equal(e.excluded.length, 1);
  assert.match(e.excluded[0]!.reason, /not a photo or PDF/);
  assert.deepEqual(e.budget, { groups: ['CLOCK IN ITEMS', 'Paint'], lines: 2, pricedLines: 1 });
  assert.match(evidenceText(e), /already carries 1 priced lines in 1 scope group\(s\) \(Paint\)/);
});

test('the template list is one flat page plus group names five at a time, and a template pages its lines', async () => {
  const r = reader((q) => {
    if ('organization' in q) {
      const args = (q['organization'] as { costGroups: { $: { page?: string } } }).costGroups.$;
      return args.page
        ? { organization: { costGroups: { nextPage: null, nodes: [{ id: 't2', name: 'Two', description: null, descendentCostItems: { count: 1 } }] } } }
        : { organization: { costGroups: { nextPage: 'p2', nodes: [{ id: 't1', name: 'One', description: ' d ', descendentCostItems: { count: 3 } }] } } };
    }
    if ('t0' in q) {
      // group names, aliased single-id roots
      const out: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(q)) {
        const id = (v as { $: { id: string } }).$.id;
        out[k] = { id, descendentCostGroups: { nodes: id === 't1' ? [{ name: 'A' }, { name: 'CLOCK IN ITEMS' }] : [] } };
      }
      return out;
    }
    const cg = q['costGroup'] as Record<string, unknown>;
    if ('name' in cg) {
      return { costGroup: {
        id: 't1', name: 'One', description: null,
        descendentCostGroups: { count: 1, nextPage: null, nodes: [{ id: 'g', name: 'A', position: 'a', isSimpleSelection: false, parentCostGroup: { id: 't1' } }] },
        descendentCostItems: { count: 2, nextPage: 'more', nodes: [line('l1')] },
      } };
    }
    return { costGroup: { descendentCostItems: { count: 2, nextPage: null, nodes: [line('l2')] } } };
  });
  const index = await fetchTemplateIndex(r);
  assert.deepEqual(index, [
    { id: 't1', name: 'One', description: 'd', groups: ['A', 'CLOCK IN ITEMS'], lineCount: 3 },
    { id: 't2', name: 'Two', description: null, groups: [], lineCount: 1 },
  ]);
  // No query nests a sized connection inside a sized connection: that is what JobTread refuses.
  for (const q of r.queries) {
    if ('organization' in q) {
      const nodes = (q['organization'] as { costGroups: { nodes: Record<string, unknown> } }).costGroups.nodes;
      assert.equal('descendentCostGroups' in nodes, false);
    }
  }
  const t = await fetchTemplate(r, 't1');
  assert.deepEqual(t.lines.map((l) => l.id), ['l1', 'l2']);
  assert.equal(t.lines[0]!.priced!.unitPrice, 123.25);
  assert.deepEqual(t.groups[0], { id: 'g', name: 'A', position: 'a', parentId: 't1', isSelection: false });

  function line(id: string): unknown {
    return {
      id, name: 'Paint', description: null, position: 'a', isSpecification: false, quantity: null, quantityFormula: null,
      unit: { name: 'Gallons' }, costType: { name: 'Materials' }, costCode: { name: 'Finishes' }, costGroup: { id: 'g' },
      organizationCostItem: { id: 'cat', name: 'Paint', unitCost: 85, unitPrice: 123.25, costType: { name: 'Materials' } },
    };
  }
});

test('a template JobTread refuses at 30 lines a page is read again at 15, then 8', async () => {
  const sizes: number[] = [];
  const r = reader((q) => {
    const cg = q['costGroup'] as { descendentCostItems: { $: { size: number } } };
    const size = cg.descendentCostItems.$.size;
    sizes.push(size);
    if (size > 8) throw new JobTreadError('Pave returned HTTP 413 with a non-JSON body: Request Entity Too Large', 413, 'Request Entity Too Large');
    return { costGroup: {
      id: 't1', name: 'One', description: null,
      descendentCostGroups: { count: 0, nextPage: null, nodes: [] },
      descendentCostItems: { count: 0, nextPage: null, nodes: [] },
    } };
  });
  const t = await fetchTemplate(r, 't1');
  assert.deepEqual(sizes, [30, 15, 8]);
  assert.equal(t.name, 'One');

  const other = reader(() => { throw new JobTreadError('HTTP 500 from Pave', 500); });
  await assert.rejects(fetchTemplate(other, 't1'), /HTTP 500/, 'only a 413 is retried smaller');
});

test('the real call streams, asks for the schema, and reads the parsed reply off the final message', async () => {
  const seen: unknown[] = [];
  const client = {
    messages: {
      stream(params: unknown) {
        seen.push(params);
        return {
          async finalMessage() {
            return {
              parsed_output: { ok: true },
              stop_reason: 'end_turn',
              usage: { input_tokens: 10, output_tokens: 5, cache_read_input_tokens: null, cache_creation_input_tokens: 2 },
            };
          },
        };
      },
    },
  };
  const call = anthropicStructuredCall(client);
  const reply = await call({
    model: 'claude-opus-5-5', system: 'sys', content: [{ type: 'text', text: 'hi' }],
    schema: z.object({ ok: z.boolean() }), maxTokens: 32_000,
  });
  assert.deepEqual(reply, { parsed: { ok: true }, stopReason: 'end_turn', usage: { input: 10, output: 5, cacheRead: 0, cacheWrite: 2 } });
  const p = seen[0] as { max_tokens: number; output_config: { format: { type: string }; effort: string }; system: string };
  assert.equal(p.max_tokens, 32_000, 'long replies need the room, which is why it streams');
  assert.equal(p.output_config.format.type, 'json_schema');
  assert.equal(p.output_config.effort, 'high');
  assert.equal(p.system, 'sys');
});

test('an option name is read the way the prompt asks the model to write it', () => {
  assert.deepEqual(parseOption('Flooring — LVP'), { group: 'Flooring', choice: 'LVP' });
  assert.deepEqual(parseOption('Flooring - Epoxy'), { group: 'Flooring', choice: 'Epoxy' });
  assert.deepEqual(parseOption('Ceiling paint'), { group: 'Ceiling paint', choice: null });
  assert.deepEqual(parseOption('  Contents moving '), { group: 'Contents moving', choice: null });
  assert.deepEqual(parseOption('Vanity — Semi-custom'), { group: 'Vanity', choice: 'Semi-custom' }, 'a hyphen inside a word is not a separator');
});

test('every construction draft ends its template steps with contingency: the snapped policy rate on the base cost, at cost', async () => {
  const d = await draftEstimate(fx.evidence, fx.index, load, fake([DRAFT]), { templateIds: [FIN, GR] });
  assert.equal(d.contingency?.rate, 8, 'the model said 7; the policy knows 5, 8 and 10');
  assert.equal(formatMoney(d.contingency!.base), '$4,120.79', 'the base-scope cost, options left out');
  assert.equal(formatMoney(d.contingency!.amount), '$329.66');
  assert.equal(d.contingency?.line, null, 'the X-Division templates carry no contingency line yet');

  // The floor is a required choice and the biggest cost on the job, so each option carries its share:
  // contingency(base + option) − contingency(base), which adds up to the cent.
  assert.deepEqual(
    d.contingency!.options.map((o) => [o.group, o.name, o.required, formatMoney(o.cost), formatMoney(o.amount)]),
    [
      ['Flooring', 'LVP', true, '$5,379.50', '$430.36'],
      ['Flooring', 'Epoxy', true, '$5,295.00', '$423.60'],
      ['Ceiling paint', 'Ceiling paint', false, '$2,788.70', '$223.10'],
    ],
  );

  const steps = draftSteps(d);
  assert.match(steps, /^Contingency 8% on \$4,120\.79 base cost = \$329\.66, at cost; with it the base scope is \$7,195\.81 price \(step 3\)\n   Options add their own share: Flooring — LVP \+\$430\.36 · Flooring — Epoxy \+\$423\.60 · Ceiling paint \+\$223\.10$/m);
  assert.match(steps, /^With each choice \(base \+ choice \+ contingency; add-ons not included\): Flooring — LVP \$15,912\.45 · Flooring — Epoxy \$15,297\.16$/m,
    '6,866.15 + 8,286.28 + 8% of (4,120.79 + 5,379.50); 6,866.15 + 7,677.75 + 8% of (4,120.79 + 5,295.00)');
  assert.match(steps, /^3\. Contingency at 8%: The walls are skimmed to the concrete, so hidden conditions are likely\.\n   No chosen template carries the contingency group yet\. Add a group "Phase 5 - Contingency" at the end of the scope \(after Phase 4 where the template has one\) and put the catalog item "Project Contingency" in it \(1 Lump Sum at \$1\.00 cost and \$1\.00 price\) with the quantity formula \{Contingency Base\} \* \{Contingency Rate\} \/ 100; then set the job parameters Contingency Rate = 8 and Contingency Base = 4120\.79: \$329\.66, at cost\.\n   Add the cost of each option the customer takes to Contingency Base: Flooring — LVP 5379\.50 \(\+\$430\.36 contingency\); Flooring — Epoxy 5295\.00 \(\+\$423\.60 contingency\); Ceiling paint 2788\.70 \(\+\$223\.10 contingency\)\.\n   Unused contingency is credited at closeout\.$/m);
  assert.match(steps, /^4\. Selection groups/m);
  assert.match(steps, /leaves out 1 flagged item with no line anywhere in the catalog \(step 6\)/);
  assert.match(steps, /^Base scope: [^\n]* · 1 line to price by hand — leaves out/m, 'the Permit, not the tracking line');

  const html = renderDraft(fx.evidence, d);
  assert.match(html, /<span class="k">\+ 8% contingency<\/span><span class="v">\$7,195\.81<\/span>/);
  assert.match(html, /<h2>Contingency, 8%<\/h2>/);
  assert.match(html, /<tr><td>Contingency Base<\/td><td>4120\.79, plus the cost of each option taken<\/td><\/tr>/);
  assert.match(html, /<tr><td>Flooring — LVP<\/td><td>5379\.50 more base, \+\$430\.36 contingency<\/td><\/tr>/);
  const json = draftJson(d) as { contingency: { rate: number; amount: string; parameters: Record<string, number>; line: null; options: { option: string; amount: string }[] } };
  assert.equal(json.contingency.amount, '$329.66');
  assert.deepEqual(json.contingency.parameters, { 'Contingency Rate': 8, 'Contingency Base': 4120.79 });
  assert.deepEqual(json.contingency.options.map((o) => [o.option, o.amount]), [['Flooring — LVP', '$430.36'], ['Flooring — Epoxy', '$423.60'], ['Ceiling paint', '$223.10']]);

  // No options, no shares, and the step says only what it needs to.
  const bare = await draftEstimate(fx.evidence, fx.index, load, fake([{ ...DRAFT, lines: DRAFT.lines.filter((l) => l.option === null) }]), { templateIds: [FIN, GR] });
  assert.deepEqual(bare.contingency!.options, []);
  assert.doesNotMatch(draftSteps(bare), /Options add their own share|With each choice|Add the cost of each option/);

  // A roofing job carries none, and the steps close up.
  const roof = await draftEstimate({ ...fx.evidence, jobType: 'Roofing' }, fx.index, load, fake([DRAFT]), { templateIds: [FIN, GR] });
  assert.equal(roof.contingency, null);
  const roofSteps = draftSteps(roof);
  assert.doesNotMatch(roofSteps, /Contingency/);
  assert.match(roofSteps, /^3\. Selection groups/m);
  assert.match(roofSteps, /\(step 5\)/);
  assert.equal((draftJson(roof) as { contingency: null }).contingency, null);
});
