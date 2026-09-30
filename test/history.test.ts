/**
 * What DB did last time, offline.
 *
 * The search is a fake JobTread; the third model call is a canned reply.
 * What is tested is the plumbing Carl asked for: the right query goes out,
 * test jobs and placeholders stay out, the strongest evidence comes first,
 * a cost the model cites from past work is priced at the subcontractor
 * margin and shown as a proposal, and nothing history proposes lands in the
 * totals.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { formatMoney, moneyFromApi } from '../src/money.ts';
import type { Reader } from '../src/jobtread/queries.ts';
import { historyText, searchHistory, strengthOf, whereOf, type HistoryReport } from '../src/draft/history.ts';
import type { StructuredArgs, StructuredCall } from '../src/draft/model.ts';
import { attachHistory, draftEstimate, historyTargets, uniqueTerms, type DraftFixture } from '../src/draft/draft.ts';
import { historyTargetsText } from '../src/draft/prompt.ts';
import { draftJson, draftSteps, renderDraft } from '../src/draft/render.ts';
import { parseDraftArgs, subMarginOf } from '../src/draft-cli.ts';

const fx = JSON.parse(readFileSync('test/fixtures/haag-basement.json', 'utf8')) as DraftFixture;
const FIN = '22PLCZU3cbqS';
const GR = '22PF3gnGCuiB';
const byId = new Map(fx.templates.map((t) => [t.id, t]));
const load = async (id: string) => byId.get(id)!;

// ---- the search ---------------------------------------------------------------

const MYERS = { id: 'jobM', name: '246466 Dennis Myers_Sunroom' };
const CO = { id: 'docCO', type: 'customerOrder', status: 'approved', name: 'Change Order', issueDate: '2026-08-31', account: { name: 'Dennis Myers', type: 'customer' } };
const WO = { id: 'docWO', type: 'vendorOrder', status: 'draft', name: 'Work Order', issueDate: null, account: { name: 'Rhino Concrete Coatings', type: 'vendor' } };
const INV = { id: 'docINV', type: 'customerInvoice', status: 'approved', name: 'Invoice', issueDate: '2026-09-03', account: { name: 'Dennis Myers', type: 'customer' } };

function hit(over: Record<string, unknown>) {
  return {
    id: 'h', name: 'Epoxy Sub Pckg', createdAt: '2026-08-26T11:26:10.723Z', quantity: 1, unitCost: 5712, unitPrice: 7425.6,
    cost: 5712, price: 7425.6, unit: { name: 'Lump Sum' }, costType: { name: 'Subcontractor' }, job: MYERS, document: CO,
    ...over,
  };
}

function reader(): Reader & { queries: Record<string, unknown>[] } {
  const queries: Record<string, unknown>[] = [];
  return {
    organizationId: 'org',
    queries,
    async query<T>(q: Record<string, unknown>): Promise<T> {
      queries.push(q);
      if ('organization' in q) {
        const where = (q['organization'] as { costItems: { $: { where: { and: unknown[] } } } }).costItems.$.where;
        const like = ((where.and[0] as { or: unknown[][] }).or[0]![2] as string);
        if (like === '%epoxy%') {
          return { organization: { costItems: { nodes: [
            hit({ id: 'budget', document: null, createdAt: '2026-08-26T11:26:10.723Z' }),
            hit({ id: 'co' }),
            hit({ id: 'wo', document: WO, unitPrice: null, price: 0, createdAt: '2026-08-31T18:01:13.115Z' }),
            hit({ id: 'inv', document: INV, createdAt: '2026-09-03T12:40:31.700Z' }),
            hit({ id: 'test', job: { id: 'jobT', name: 'Kay Oss_TEST epoxy' } }),
            hit({ id: 'zero', unitCost: 0, cost: 0, job: { id: 'jobZ', name: '260001 Zero_Placeholder' } }),
            hit({ id: 'self', job: { id: '22PbLhMqY7tC', name: '261323 Haag_Remodel' } }),
            hit({ id: 'clock', costType: { name: 'Clock In' }, job: { id: 'jobC', name: '260002 Clock_Job' } }),
          ] } } } as T;
        }
        return { organization: { costItems: { nodes: [] } } } as T;
      }
      if ('job' in q) {
        return { job: { description: 'Sun Room & Deck', customFieldValues: { nodes: [{ value: 'C-Miscellaneous', customField: { id: '22PC7idvhRzp' } }] } } } as T;
      }
      return { document: { costItems: { nodes: [
        { id: 'co', name: 'Epoxy Sub Pckg', quantity: 1, unit: { name: 'Lump Sum' } },
        { id: 'x', name: 'Crew Labor', quantity: 4, unit: { name: 'Hours' } },
        { id: 'y', name: 'Rental -Storage Pod', quantity: 1, unit: { name: 'Lump Sum' } },
      ] } } } as T;
    },
  };
}

test('past work is searched by name and description on real jobs only, grouped by job, strongest first', async () => {
  const r = reader();
  const report = await searchHistory(r, ['Epoxy', ' epoxy', 'skim'], { excludeJobId: '22PbLhMqY7tC' });

  const where = (r.queries[0] as { organization: { costItems: { $: { where: unknown } } } }).organization.costItems.$.where;
  assert.deepEqual(where, {
    and: [
      { or: [[['name'], 'like', '%epoxy%'], [['description'], 'like', '%epoxy%']] },
      [['job', 'id'], '!=', null],
    ],
  });

  assert.equal(report.terms.length, 2, 'a term is searched once however it is spelled');
  const epoxy = report.terms[0]!;
  assert.equal(epoxy.raw, 8);
  assert.deepEqual(epoxy.jobs.map((j) => j.jobName), ['246466 Dennis Myers_Sunroom'],
    'the test job, the $0 placeholder, the job being drafted and the clock-in line are not history');
  const job = epoxy.jobs[0]!;
  assert.deepEqual(job.lines.map((l) => [l.strength, l.where, l.when, l.vendor]), [
    ['sold', 'invoice', '2026-09-03', null],
    ['sold', 'change order', '2026-08-31', null],
    ['ordered', 'work order', '2026-08-31', 'Rhino Concrete Coatings'],
    ['draft', 'budget', '2026-08-26', null],
  ]);
  assert.equal(job.description, 'Sun Room & Deck');
  assert.equal(job.projectType, 'C-Miscellaneous');
  assert.deepEqual(job.context.map((c) => c.name), ['Crew Labor', 'Rental -Storage Pod'], 'the matched line itself is not context');

  const skim = report.terms[1]!;
  assert.equal(skim.raw, 0);
  assert.equal(skim.jobs.length, 0);

  const text = historyText(report);
  assert.match(text, /## "epoxy" — 8 matching lines, 4 shown on 1 job/);
  assert.match(text, /### 246466 Dennis Myers_Sunroom \(C-Miscellaneous\) — Sun Room & Deck/);
  assert.match(text, /- \[sold\] Epoxy Sub Pckg · 1 Lump Sum · unit cost \$5,712\.00 · unit price \$7,425\.60 · line cost \$5,712\.00 · Subcontractor · invoice \(approved\) · 2026-09-03/);
  assert.match(text, /- \[ordered\] Epoxy Sub Pckg .* work order \(draft\) from Rhino Concrete Coatings/);
  assert.match(text, /Also on that document: Crew Labor 4 Hours; Rental -Storage Pod 1 Lump Sum/);
  assert.match(text, /## "skim" — 0 matching lines, 0 shown on 0 jobs\n\(nothing usable/);
});

test('where a line sits and how much it proves', () => {
  assert.equal(whereOf(null), 'budget');
  assert.equal(whereOf({ ...CO, name: 'Estimate' }), 'estimate');
  assert.equal(whereOf(CO), 'change order');
  assert.equal(whereOf({ ...WO, name: 'Purchase Order' }), 'purchase order');
  assert.equal(whereOf({ ...WO, type: 'vendorBill', name: 'Bill' }), 'vendor bill');
  assert.equal(whereOf({ ...WO, type: 'bidRequest', name: 'Pricing Request' }), 'bid request');
  assert.equal(strengthOf({ ...WO, type: 'vendorBill', status: 'approved' }), 'billed');
  assert.equal(strengthOf({ ...WO, type: 'vendorBill', status: 'pending' }), 'ordered');
  assert.equal(strengthOf({ ...CO, status: 'pending' }), 'draft');
  assert.equal(strengthOf({ ...WO, type: 'bidRequest' }), 'quoted');
});

// ---- through the draft ---------------------------------------------------------

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

const ev = (quote: string) => [{ source: 'Robert Switzer, 2026-07-23', quote }];
const DRAFT = {
  summary: 'Basement refresh with a flooring choice.',
  scopeOfWork: 'Paint and floor.',
  lines: [
    { lineId: '22PLhtLxcz9S', quantity: 24, basis: 'two painters', evidence: ev('painting'), option: null, confidence: 'low', lookBack: ['paint sub', 'Painting'] },
    { lineId: '22PLhsr2Yx55', quantity: 706, basis: 'epoxy by the sub', evidence: ev('Epoxy Flooring'), option: 'Flooring — Epoxy', confidence: 'medium', lookBack: ['epoxy', 'floor coating'] },
    { lineId: '22PLCchBuFMa', quantity: 6, basis: 'two coats', evidence: ev('painting'), option: null, confidence: 'medium', lookBack: [] },
  ],
  gaps: [
    { scope: 'Skim-coat the concrete walls', why: 'no template line', unit: 'Hours', quantity: 24, costType: 'Labor', basis: 'guess', evidence: ev('skimming'), lookBack: ['skim coat', 'skim'] },
    { scope: 'Move contents', why: 'no template line', unit: 'Hours', quantity: null, costType: 'Labor', basis: 'unknown', evidence: ev('moving'), lookBack: [] },
  ],
  questions: [],
};
const HISTORY = {
  findings: [
    { target: { kind: 'line', id: '22PLhsr2Yx55' }, match: 'match', summary: 'DB subbed one epoxy floor, the Myers sunroom, to Rhino Concrete Coatings for $5,712 in August 2026.',
      pastWork: [{ jobName: '246466 Dennis Myers_Sunroom', what: 'Epoxy Sub Pckg', where: 'change order', when: '2026-08-31', vendor: 'Rhino Concrete Coatings', quantity: 1, unit: 'Lump Sum', unitCost: 5712, lineCost: 5712 }],
      suggestedUnitCost: 13.6, suggestionBasis: '$5,712 for the ~420 SF sunroom floor named in its description = $13.60/SF.', confidence: 'medium', typicallySubbed: true, usualVendor: 'Rhino Concrete Coatings' },
    { target: { kind: 'line', id: '22PLhtLxcz9S' }, match: 'partial', summary: 'DB has subbed interior painting to Jeff Southworth on four recent jobs, as lump sums.',
      pastWork: [], suggestedUnitCost: null, suggestionBasis: 'Lump sums with no wall area shown; nothing per hour.', confidence: 'low', typicallySubbed: true, usualVendor: "Jeff Southworth's Drywall & Painting" },
    { target: { kind: 'gap', id: 'gap-0' }, match: 'partial', summary: 'No skim coat in DB history; the nearest is a drywall sub at $920 lump sum.',
      pastWork: [{ jobName: '261282 McComas_Misc.', what: 'Drywall Sub', where: 'estimate', when: '2026-07-14', vendor: null, quantity: 1, unit: 'Lump Sum', unitCost: 920, lineCost: 920 }],
      suggestedUnitCost: 45, suggestionBasis: 'A drywall sub at $920 for about 20 hours of work = $45/hour, if the trade is the same.', confidence: 'low', typicallySubbed: null, usualVendor: null },
    { target: { kind: 'gap', id: 'gap-1' }, match: 'none', summary: 'Nothing in DB history for moving contents.', pastWork: [], suggestedUnitCost: 55, suggestionBasis: 'n/a', confidence: 'low', typicallySubbed: null, usualVendor: null },
    { target: { kind: 'line', id: 'nope' }, match: 'none', summary: 'ignored', pastWork: [], suggestedUnitCost: null, suggestionBasis: '', confidence: 'low', typicallySubbed: null, usualVendor: null },
  ],
};

function report(found: boolean): HistoryReport {
  return { terms: found
    ? [{ term: 'epoxy', raw: 4, jobs: [{ jobId: 'jobM', jobName: '246466 Dennis Myers_Sunroom', description: null, projectType: null, context: [], lines: [] }] }]
    : [{ term: 'epoxy', raw: 0, jobs: [] }] };
}

test('targets are subcontracted lines, lines the model wanted looked up, and every gap; terms are deduplicated', async () => {
  const searched: string[][] = [];
  const call = fake([DRAFT, HISTORY]);
  const d = await draftEstimate(fx.evidence, fx.index, load, call, {
    templateIds: [FIN, GR],
    history: { search: async (terms) => { searched.push(terms); return report(true); }, subMargin: 0.3 },
  });
  assert.deepEqual(searched, [['paint sub', 'painting', 'epoxy', 'floor coating', 'skim coat', 'skim']]);
  assert.equal(call.calls.length, 2, 'draft, then history');
  assert.match(call.calls[1]!.system, /reading DB's own past work/);

  const targets = historyTargets(d.lines, d.gaps);
  assert.deepEqual(targets.map((t) => t.id), ['22PLhtLxcz9S', '22PLhsr2Yx55', 'gap-0', 'gap-1'], 'the plain Paint line has no terms and is not a target');
  assert.equal(targets[1]!.templateUnitCost, 7.5, 'the template rate the model may compare against');
  assert.match(historyTargetsText('a job', targets), /- gap-0 · gap · Skim-coat the concrete walls · 24 Hours · Labor · no template price · terms: "skim coat", "skim"/);
  assert.deepEqual(uniqueTerms(targets), ['paint sub', 'painting', 'epoxy', 'floor coating', 'skim coat', 'skim']);

  // A cited unit cost becomes Money and a price at the subcontractor margin.
  const epoxy = d.lines.find((l) => l.name === 'Flooring - Sub')!;
  assert.equal(epoxy.history?.match, 'match');
  assert.equal(formatMoney(epoxy.historyUnitCost!), '$13.60');
  assert.equal(formatMoney(epoxy.historyUnitPrice!), '$19.43', '13.60 at a 30% margin, to the cent');
  assert.equal(epoxy.unitPrice, moneyFromApi(10.875), 'the template price is untouched');

  const paint = d.lines.find((l) => l.name === 'Paint Labor')!;
  assert.equal(paint.history?.typicallySubbed, true);
  assert.equal(paint.historyUnitCost, null);

  // A gap with a quantity and a cited cost gets a proposal; without a quantity it does not.
  assert.equal(formatMoney(d.gaps[0]!.proposed!.unitCost), '$45.00');
  assert.equal(formatMoney(d.gaps[0]!.proposed!.cost), '$1,080.00');
  assert.equal(formatMoney(d.gaps[0]!.proposed!.price!), '$1,542.96', '45/0.7 = $64.29 a unit, × 24');
  assert.equal(d.gaps[1]!.proposed, null);
  assert.equal(d.gaps[1]!.history?.match, 'none');
  assert.equal(formatMoney(d.totals.proposedForGaps.cost), '$1,080.00');
  assert.equal(d.totals.proposedForGaps.gaps, 1);
  assert.equal(formatMoney(d.totals.base.price), formatMoney(d.lines.filter((l) => l.option === null).reduce((a, l) => (a + l.price) as typeof a, 0n as typeof d.totals.base.price)),
    'history proposals never enter the totals');
  assert.equal(d.history?.findings, 5);
  assert.equal(d.usage.input, 2_000);

  const steps = draftSteps(d);
  assert.match(steps, /^History proposes \$1,542\.96 price \(\$1,080\.00 cost\) for 1 of the flagged items — a proposal for Carl, not in the totals above$/m);
  assert.match(steps, /Flooring - Sub: 706 Square Foot \[option: Flooring — Epoxy\][^\n]*\n       history: DB subbed one epoxy floor.*History says \$13\.60\/Square Foot cost \(\$19\.43 price\) against the template's \$7\.50\./);
  assert.match(steps, /Skim-coat the concrete walls \(Labor, 24 Hours\)[^\n]*\n     history: No skim coat in DB history.*Proposed from history: \$45\.00\/Hours × 24 = \$1,080\.00 cost, \$1,542\.96 price — Carl confirms/);
  assert.match(steps, /History says DB usually subcontracts this work, drafted here as crew labor:\n   - Paint Labor: DB has subbed interior painting.*Usual sub: Jeff Southworth's Drywall & Painting\./);

  const html = renderDraft(fx.evidence, d);
  assert.match(html, /history proposes \$1,542\.96 for 1 of them/);
  assert.match(html, /<span class="k">History<\/span> DB subbed one epoxy floor/);
  assert.match(html, /Usually subcontracted<\/div><h3>Paint Labor<\/h3>/);
  assert.match(html, /246466 Dennis Myers_Sunroom<\/td><td>Epoxy Sub Pckg · 1 Lump Sum · \$5712\.00\/Lump Sum · \$5712\.00 · change order from Rhino Concrete Coatings · 2026-08-31/);

  const json = draftJson(d) as { gaps: { proposed: { price: string } | null }[]; history: { terms: string[]; findings: number }; totals: { proposedForGaps: { price: string } } };
  assert.equal(json.gaps[0]!.proposed!.price, '$1,542.96');
  assert.equal(json.history.findings, 5);
  assert.equal(json.totals.proposedForGaps.price, '$1,542.96');
});

test('when nothing in history matches, the third call is not made and the page says what was searched', async () => {
  const call = fake([DRAFT]);
  const d = await draftEstimate(fx.evidence, fx.index, load, call, {
    templateIds: [FIN, GR],
    history: { search: async () => report(false), subMargin: 0.3 },
  });
  assert.equal(call.calls.length, 1);
  assert.equal(d.history?.skipped, 'no past DB work matched any search term');
  assert.equal(d.history?.findings, 0);
  assert.match(draftSteps(d), /Past work was searched for "paint sub", "painting", "epoxy", "floor coating", "skim coat", "skim": no past DB work matched any search term\./);
  assert.match(renderDraft(fx.evidence, d), /no past DB work matched any search term\./);
});

test('without a margin, history gives a cost and no price; without history, nothing changes', async () => {
  const d = await draftEstimate(fx.evidence, fx.index, load, fake([DRAFT, HISTORY]), {
    templateIds: [FIN, GR],
    history: { search: async () => report(true), subMargin: null },
  });
  assert.equal(formatMoney(d.gaps[0]!.proposed!.cost), '$1,080.00');
  assert.equal(d.gaps[0]!.proposed!.price, null);
  assert.equal(d.totals.proposedForGaps.price, null);
  assert.match(draftSteps(d), /History proposes \$1,080\.00 cost for 1 of the flagged items/);

  const plain = await draftEstimate(fx.evidence, fx.index, load, fake([DRAFT]), { templateIds: [FIN, GR] });
  assert.equal(plain.history, null);
  assert.equal(plain.totals.proposedForGaps.gaps, 0);
  assert.doesNotMatch(draftSteps(plain), /history/i);
});

test('attachHistory drops findings for ids nobody asked about and ignores non-positive costs', () => {
  const lines: Parameters<typeof attachHistory>[0] = [];
  const gaps: Parameters<typeof attachHistory>[1] = [{ ...DRAFT.gaps[0]!, costType: 'Labor', history: null, proposed: null }];
  attachHistory(lines, gaps, [
    { ...HISTORY.findings[2]!, suggestedUnitCost: 0 } as (typeof HISTORY.findings)[number],
    HISTORY.findings[4]!,
  ] as Parameters<typeof attachHistory>[2], 0.3);
  assert.equal(gaps[0]!.history?.match, 'partial');
  assert.equal(gaps[0]!.proposed, null, 'a $0 cost proposes nothing');
});

test('the CLI reads the subcontractor margin and can turn history off', () => {
  assert.equal(subMarginOf([{ id: 'a', name: 'Subcontractor', margin: 0.3, isTaxable: false, isTimeTrackable: false, isActive: true }]), 0.3);
  assert.equal(subMarginOf([]), null);
  assert.equal(parseDraftArgs(['261323', '--no-history']).history, false);
  assert.equal(parseDraftArgs(['261323']).history, true);
});
