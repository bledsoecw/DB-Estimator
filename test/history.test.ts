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
import { chooseAttachments, historyText, searchHistory, selectHistoryFiles, strengthOf, whereOf, type HistoryHits, type HistoryReport } from '../src/draft/history.ts';
import { LearnedStore } from '../src/draft/learned.ts';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { StructuredArgs, StructuredCall } from '../src/draft/model.ts';
import { attachHistory, draftEstimate, historyTargets, uniqueTerms, type DraftFixture } from '../src/draft/draft.ts';
import { historyTargetsText } from '../src/draft/prompt.ts';
import { draftJson, draftSteps, renderDraft } from '../src/draft/render.ts';
import { marginsOf, parseDraftArgs } from '../src/draft-cli.ts';

const fx = JSON.parse(readFileSync('test/fixtures/haag-basement.json', 'utf8')) as DraftFixture;
/** DB's cost types: a sub line prices at 30% margin, crew labor at 45%. */
const MARGINS = { Subcontractor: 0.3, Labor: 0.45, Materials: 0.3103448275862069, Other: 0.3103448275862069 };
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
        const job = q['job'] as Record<string, unknown>;
        if ('files' in job) {
          // the job's files named for the term: the quote again under another id, and a copy of the change-order scan
          return { job: { files: { nodes: [
            file('fQuote2', '6466 Dennis Myers_Epoxy Quote.pdf', 26513, 'Epoxy Quote'),
            file('fCO2', '6466 Dennis Myers_epoxy quote.pdf', 491463, 'Epoxy change order'),
            file('fPhoto', 'CompanyCam 1', 200000, null, 'image/jpeg'),
          ] } } } as T;
        }
        return { job: { description: 'Sun Room & Deck', customFieldValues: { nodes: [{ value: 'C-Miscellaneous', customField: { id: '22PC7idvhRzp' } }] } } } as T;
      }
      const id = (q['document'] as { $: { id: string } }).$.id;
      const costItems = { nodes: [
        { id: 'inv', name: 'Epoxy Sub Pckg', quantity: 1, unit: { name: 'Lump Sum' } },
        { id: 'x', name: 'Crew Labor', quantity: 4, unit: { name: 'Hours' } },
        { id: 'y', name: 'Rental -Storage Pod', quantity: 1, unit: { name: 'Lump Sum' } },
      ] };
      if (id === 'docINV') return { document: { costItems, files: { nodes: [] } } } as T;
      if (id === 'docCO') return { document: { files: { nodes: [file('fCO', '6466 Dennis Myers_epoxy quote.pdf', 491463, 'Epoxy change order')] } } } as T;
      return { document: { files: { nodes: [file('fQuote', '6466 Dennis Myers_Epoxy Quote.pdf', 26513, 'Epoxy Quote')] } } } as T;
    },
  };
}

function file(id: string, name: string, size: number, description: string | null, type = 'application/pdf') {
  return { id, name, type, size, createdAt: '2026-08-31T18:01:22.447Z', url: `https://cdn/${id}`, description };
}

test('past work is searched by name and description on real jobs only, grouped by job, strongest first', async () => {
  const r = reader();
  const downloaded: string[] = [];
  const report = await searchHistory(r, ['Epoxy', ' epoxy', 'skim'], {
    excludeJobId: '22PbLhMqY7tC',
    download: async (url) => { downloaded.push(url); return new Uint8Array([37, 80, 68, 70]); },
  });

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

  // The sub's quote hangs off the work order; the change order carries a scan; the job's
  // files named for the term add nothing new but a photo, which is listed and left out.
  assert.deepEqual(
    job.files.map((f) => [f.name, f.foundOn, f.skipped]),
    [
      ['6466 Dennis Myers_epoxy quote.pdf', 'the change order', null],
      ['6466 Dennis Myers_Epoxy Quote.pdf', 'the work order', null],
      ['CompanyCam 1', 'the job\'s files, named for "epoxy"', null],
    ],
    'PDFs first, one copy of a file uploaded twice, then the photo',
  );
  assert.deepEqual(downloaded, ['https://cdn/fCO', 'https://cdn/fQuote', 'https://cdn/fPhoto']);
  assert.equal(report.attachments!.length, 3);
  assert.equal(report.attachments![1]!.jobName, '246466 Dennis Myers_Sunroom');

  const skim = report.terms[1]!;
  assert.equal(skim.raw, 0);
  assert.equal(skim.jobs.length, 0);

  const text = historyText(report);
  assert.match(text, /## "epoxy" — 8 matching lines, 4 shown on 1 job/);
  assert.match(text, /### 246466 Dennis Myers_Sunroom \(C-Miscellaneous\) — Sun Room & Deck/);
  assert.match(text, /- \[sold\] Epoxy Sub Pckg · 1 Lump Sum · unit cost \$5,712\.00 · unit price \$7,425\.60 · line cost \$5,712\.00 · Subcontractor · invoice \(approved\) · 2026-09-03/);
  assert.match(text, /- \[ordered\] Epoxy Sub Pckg .* work order \(draft\) from Rhino Concrete Coatings/);
  assert.match(text, /Also on that document: Crew Labor 4 Hours; Rental -Storage Pod 1 Lump Sum/);
  assert.match(text, /Files from this job attached below: "6466 Dennis Myers_epoxy quote.pdf" \(Epoxy change order\), from the change order, 2026-08-31; "6466 Dennis Myers_Epoxy Quote.pdf" \(Epoxy Quote\), from the work order, 2026-08-31/);
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
  contingency: { rate: 8, why: 'The walls are stripped to the concrete and the floor comes up.' },
};
const HISTORY = {
  findings: [
    { target: { kind: 'line', id: '22PLhsr2Yx55' }, match: 'match', summary: 'DB subbed one epoxy floor, the Myers sunroom, to Rhino Concrete Coatings for $5,712 in August 2026.',
      pastWork: [{ jobName: '246466 Dennis Myers_Sunroom', what: 'Epoxy Sub Pckg', where: 'change order', when: '2026-08-31', vendor: 'Rhino Concrete Coatings', quantity: 1, unit: 'Lump Sum', unitCost: 5712, lineCost: 5712 }],
      suggestedUnitCost: 13.6, suggestionBasis: '$5,712 for the ~420 SF sunroom floor named in its description = $13.60/SF.', confidence: 'medium', typicallySubbed: true, usualVendor: 'Rhino Concrete Coatings',
      regionalUnitCost: null, regionalBasis: '' },
    { target: { kind: 'line', id: '22PLhtLxcz9S' }, match: 'partial', summary: 'DB has subbed interior painting to Jeff Southworth on four recent jobs, as lump sums.',
      pastWork: [], suggestedUnitCost: null, suggestionBasis: 'Lump sums with no wall area shown; nothing per hour.', confidence: 'low', typicallySubbed: true, usualVendor: "Jeff Southworth's Drywall & Painting",
      regionalUnitCost: null, regionalBasis: '' },
    { target: { kind: 'gap', id: 'gap-0' }, match: 'partial', summary: 'No skim coat in DB history; the nearest is a drywall sub at $920 lump sum.',
      pastWork: [{ jobName: '261282 McComas_Misc.', what: 'Drywall Sub', where: 'estimate', when: '2026-07-14', vendor: null, quantity: 1, unit: 'Lump Sum', unitCost: 920, lineCost: 920 }],
      suggestedUnitCost: 45, suggestionBasis: 'A drywall sub at $920 for about 20 hours of work = $45/hour, if the trade is the same.', confidence: 'low', typicallySubbed: null, usualVendor: null,
      regionalUnitCost: null, regionalBasis: '' },
    // History has nothing, so the model gave a regional ballpark; the gap has no quantity, so it cannot total.
    { target: { kind: 'gap', id: 'gap-1' }, match: 'none', summary: 'Nothing in DB history for moving contents.', pastWork: [], suggestedUnitCost: null, suggestionBasis: '', confidence: 'low', typicallySubbed: null, usualVendor: null,
      regionalUnitCost: 55, regionalBasis: 'Two of DB\'s own people at about $27.50/hour loaded, the going small-contractor rate around Van Wert.' },
    { target: { kind: 'line', id: 'nope' }, match: 'none', summary: 'ignored', pastWork: [], suggestedUnitCost: null, suggestionBasis: '', confidence: 'low', typicallySubbed: null, usualVendor: null,
      regionalUnitCost: null, regionalBasis: '' },
  ],
};
/** History finds nothing at all; the model prices the skim coat from the area instead. */
const REGIONAL_ONLY = {
  findings: [
    { target: { kind: 'gap', id: 'gap-0' }, match: 'none', summary: 'No skim coat anywhere in DB history.', pastWork: [], suggestedUnitCost: null, suggestionBasis: '', confidence: 'low', typicallySubbed: null, usualVendor: null,
      regionalUnitCost: 45, regionalBasis: 'A finisher at about $45/hour loaded is what a small crew costs around Van Wert; skim coat is slow work.' },
    { target: { kind: 'gap', id: 'gap-1' }, match: 'none', summary: 'Nothing for moving contents.', pastWork: [], suggestedUnitCost: null, suggestionBasis: '', confidence: 'low', typicallySubbed: null, usualVendor: null,
      regionalUnitCost: null, regionalBasis: '' },
  ],
};

function report(found: boolean): HistoryReport {
  return { terms: found
    ? [{ term: 'epoxy', raw: 4, jobs: [{ jobId: 'jobM', jobName: '246466 Dennis Myers_Sunroom', description: null, projectType: null, context: [], lines: [], files: [] }] }]
    : [{ term: 'epoxy', raw: 0, jobs: [] }] };
}

test('targets are subcontracted lines, lines the model wanted looked up, and every gap; terms are deduplicated', async () => {
  const searched: string[][] = [];
  const call = fake([DRAFT, HISTORY]);
  const d = await draftEstimate(fx.evidence, fx.index, load, call, {
    templateIds: [FIN, GR],
    history: { search: async (terms) => { searched.push(terms); return report(true); }, margins: MARGINS },
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

  // A crew-labor rate from history prices at the Labor margin, and one equal to the template's reads as agreement.
  const agree = await draftEstimate(fx.evidence, fx.index, load, fake([DRAFT, { findings: [
    { ...HISTORY.findings[1]!, suggestedUnitCost: 55, suggestionBasis: '$550 / 10 hrs on Miller.' },
  ] }]), { templateIds: [FIN, GR], history: { search: async () => report(true), margins: MARGINS } });
  const laborLine = agree.lines.find((l) => l.name === 'Paint Labor')!;
  assert.equal(formatMoney(laborLine.historyUnitPrice!), '$100.00', '55 at the Labor margin, not the sub margin');
  assert.match(draftSteps(agree), /History agrees with the template's \$55\.00\/Hours\. \$550 \/ 10 hrs on Miller\./);

  // A gap with a quantity and a cited cost gets a proposal; without a quantity it does not.
  assert.equal(formatMoney(d.gaps[0]!.proposed!.unitCost), '$45.00');
  assert.equal(formatMoney(d.gaps[0]!.proposed!.cost), '$1,080.00');
  assert.equal(formatMoney(d.gaps[0]!.proposed!.price!), '$1,963.68', 'a Labor gap prices at the Labor margin: 45/0.55 = $81.82 a unit, × 24');
  assert.equal(d.gaps[1]!.proposed, null);
  assert.equal(d.gaps[1]!.history?.match, 'none');
  assert.equal(formatMoney(d.totals.proposedForGaps.cost), '$1,080.00');
  assert.equal(d.totals.proposedForGaps.gaps, 1);
  assert.equal(formatMoney(d.totals.base.price), formatMoney(d.lines.filter((l) => l.option === null).reduce((a, l) => (a + l.price) as typeof a, 0n as typeof d.totals.base.price)),
    'history proposals never enter the totals');
  assert.equal(d.history?.findings, 5);
  assert.equal(d.usage.input, 2_000);

  const steps = draftSteps(d);
  assert.match(steps, /^History proposes \$1,963\.68 price \(\$1,080\.00 cost\) for 1 of the flagged items — a proposal for Carl, not in the totals above$/m);
  assert.match(steps, /Flooring - Sub: 706 Square Foot \[option: Flooring — Epoxy\][^\n]*\n       history: DB subbed one epoxy floor.*History says \$13\.60\/Square Foot cost \(\$19\.43 price\) against the template's \$7\.50\./);
  assert.match(steps, /Skim-coat the concrete walls \(Labor, 24 Hours\)[^\n]*\n     history: No skim coat in DB history.*Proposed from history: \$45\.00\/Hours × 24 = \$1,080\.00 cost, \$1,963\.68 price — Carl confirms/);
  assert.match(steps, /History says DB usually subcontracts this work, drafted here as crew labor:\n   - Paint Labor: DB has subbed interior painting.*Usual sub: Jeff Southworth's Drywall & Painting\./);

  const html = renderDraft(fx.evidence, d);
  assert.match(html, /history proposes \$1,963\.68 for 1 of them/);
  assert.match(html, /<span class="k">History<\/span> DB subbed one epoxy floor/);
  assert.match(html, /Usually subcontracted<\/div><h3>Paint Labor<\/h3>/);
  assert.match(html, /246466 Dennis Myers_Sunroom<\/td><td>Epoxy Sub Pckg · 1 Lump Sum · \$5712\.00\/Lump Sum · \$5712\.00 · change order from Rhino Concrete Coatings · 2026-08-31/);

  const json = draftJson(d) as { gaps: { proposed: { price: string } | null }[]; history: { terms: string[]; findings: number }; totals: { proposedForGaps: { price: string } } };
  assert.equal(json.gaps[0]!.proposed!.price, '$1,963.68');
  assert.equal(json.history.findings, 5);
  assert.equal(json.totals.proposedForGaps.price, '$1,963.68');
});

test('when nothing in history matches, the third call runs for the gaps alone and gives them a regional ballpark', async () => {
  const store = new LearnedStore([], { now: () => T0 });
  const call = fake([DRAFT, REGIONAL_ONLY]);
  const d = await draftEstimate(fx.evidence, fx.index, load, call, {
    templateIds: [FIN, GR],
    history: { search: async () => report(false), margins: MARGINS, learned: store },
  });
  assert.equal(call.calls.length, 2, 'the gaps still need a number');
  const asked = call.calls[1]!.content.map((c) => (c.type === 'text' ? c.text : '')).join('\n');
  assert.match(asked, /- gap-0 · gap · Skim-coat the concrete walls/);
  assert.match(asked, /- gap-1 · gap · Move contents/);
  assert.doesNotMatch(asked, /22PLhsr2Yx55/, 'lines with no history are not sent: there is nothing to read for them');
  assert.match(asked, /2 of these are gaps with no template line\. A gap that history cannot price gets a regional ballpark/);
  assert.equal(d.history?.skipped, 'no past DB work matched any search term');
  assert.equal(d.history?.regional, 1);

  // The skim coat: $45/hour for the area, priced at the Labor margin like any Labor line, labelled as a ballpark.
  const skim = d.gaps[0]!;
  assert.equal(skim.proposed?.source, 'regional');
  assert.equal(formatMoney(skim.regionalUnitCost!), '$45.00');
  assert.equal(formatMoney(skim.regionalUnitPrice!), '$81.82');
  assert.equal(formatMoney(skim.proposed!.cost), '$1,080.00');
  assert.equal(formatMoney(skim.proposed!.price!), '$1,963.68');
  assert.equal(d.gaps[1]!.regionalUnitCost, null, 'the model gave none for moving contents');
  assert.equal(d.totals.regionalForGaps.gaps, 1);
  assert.equal(formatMoney(d.totals.regionalForGaps.price!), '$1,963.68');
  assert.equal(d.totals.proposedForGaps.gaps, 0, 'a ballpark is not a history proposal');
  assert.equal(d.lines.find((l) => l.name === 'Flooring - Sub')!.history, null);

  const steps = draftSteps(d);
  assert.match(steps, /^Regional ballpark \$1,963\.68 price \(\$1,080\.00 cost\) for 1 of the flagged items DB has no history for — NOTE TO REP: an estimate for our area, not DB pricing; confirm with Carl or a sub bid before it goes out; not in the totals above$/m);
  assert.match(steps, /Skim-coat the concrete walls \(Labor, 24 Hours\)[^\n]*\n     history: No skim coat anywhere in DB history\. Regional ballpark: \$45\.00\/Hours cost \(\$81\.82 price\) × 24 = \$1,080\.00 cost, \$1,963\.68 price — NOTE TO REP: an estimate for our area, not DB pricing; confirm with Carl or a sub bid before it goes out\. A finisher at about \$45\/hour loaded/);
  assert.match(steps, /Past work was searched for "paint sub", "painting", "epoxy", "floor coating", "skim coat", "skim": no past DB work matched any search term\./);
  const html = renderDraft(fx.evidence, d);
  assert.match(html, /a regional ballpark of \$1,963\.68 for 1 of them, not DB pricing/);
  assert.match(html, /Flagged · regional ballpark, not DB pricing<\/div>\s*<h3>Skim-coat the concrete walls/);
  const json = draftJson(d) as { gaps: { proposed: { source: string; price: string } | null; regionalUnitCost: string | null }[]; totals: { regionalForGaps: { gaps: number } } };
  assert.equal(json.gaps[0]!.proposed!.source, 'regional');
  assert.equal(json.gaps[0]!.regionalUnitCost, '$45.00');
  assert.equal(json.totals.regionalForGaps.gaps, 1);

  // The book keeps what DB did, not a guess about the area.
  assert.equal(store.entries.get('skim coat')!.finding.match, 'none');
  assert.equal(store.entries.get('skim coat')!.finding.regionalUnitCost, null);
  assert.equal(store.entries.get('epoxy')!.finding.match, 'none');

  // Without gaps there is nothing to price, so no third call at all.
  const noGaps = fake([{ ...DRAFT, gaps: [] }]);
  const plain = await draftEstimate(fx.evidence, fx.index, load, noGaps, {
    templateIds: [FIN, GR],
    history: { search: async () => report(false), margins: MARGINS },
  });
  assert.equal(noGaps.calls.length, 1);
  assert.equal(plain.history?.skipped, 'no past DB work matched any search term');
  assert.equal(plain.history?.regional, 0);
  assert.match(renderDraft(fx.evidence, plain), /no past DB work matched any search term\./);
});

test('a gap whose quantity is unknown gets the regional unit figure and no total; history always wins over the ballpark', async () => {
  const d = await draftEstimate(fx.evidence, fx.index, load, fake([DRAFT, HISTORY]), {
    templateIds: [FIN, GR],
    history: { search: async () => report(true), margins: MARGINS },
  });
  const move = d.gaps[1]!;
  assert.equal(move.proposed, null);
  assert.equal(formatMoney(move.regionalUnitCost!), '$55.00');
  assert.equal(formatMoney(move.regionalUnitPrice!), '$100.00');
  assert.equal(d.history?.regional, 1);
  assert.match(draftSteps(d), /Move contents \(Labor, Hours\)[^\n]*\n     history: Nothing in DB history for moving contents\. Regional ballpark: \$55\.00\/Hours cost \(\$100\.00 price\), quantity still to be confirmed — NOTE TO REP/);
  // gap-0 has a history cost; the ballpark for it, had one been given, would be ignored.
  const both = { findings: [{ ...HISTORY.findings[2]!, regionalUnitCost: 99, regionalBasis: 'ignored' }] };
  const d2 = await draftEstimate(fx.evidence, fx.index, load, fake([DRAFT, both]), {
    templateIds: [FIN, GR],
    history: { search: async () => report(true), margins: MARGINS },
  });
  assert.equal(d2.gaps[0]!.proposed?.source, 'history');
  assert.equal(d2.gaps[0]!.regionalUnitCost, null);
});

test('without a margin, history gives a cost and no price; without history, nothing changes', async () => {
  const d = await draftEstimate(fx.evidence, fx.index, load, fake([DRAFT, HISTORY]), {
    templateIds: [FIN, GR],
    history: { search: async () => report(true), margins: {} },
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
  const gaps: Parameters<typeof attachHistory>[1] = [{ ...DRAFT.gaps[0]!, costType: 'Labor', history: null, proposed: null, regionalUnitCost: null, regionalUnitPrice: null }];
  attachHistory(lines, gaps, [
    { ...HISTORY.findings[2]!, suggestedUnitCost: 0 } as (typeof HISTORY.findings)[number],
    HISTORY.findings[4]!,
  ] as Parameters<typeof attachHistory>[2], MARGINS);
  assert.equal(gaps[0]!.history?.match, 'partial');
  assert.equal(gaps[0]!.proposed, null, 'a $0 cost proposes nothing');
});

test('the CLI reads every cost type margin and can turn history off', () => {
  assert.deepEqual(
    marginsOf([
      { id: 'a', name: 'Subcontractor', margin: 0.3, isTaxable: false, isTimeTrackable: false, isActive: true },
      { id: 'b', name: 'Labor', margin: 0.45, isTaxable: false, isTimeTrackable: true, isActive: true },
      { id: 'c', name: 'Clock In', margin: null, isTaxable: false, isTimeTrackable: true, isActive: true },
    ]),
    { Subcontractor: 0.3, Labor: 0.45 },
  );
  assert.deepEqual(marginsOf([]), {});
  assert.equal(parseDraftArgs(['261323', '--no-history']).history, false);
  assert.equal(parseDraftArgs(['261323']).history, true);
});

test('files found beside past lines: PDFs first, duplicates once, oddities and reports left out with a reason', () => {
  const found = [
    { file: file('a', 'Quote.pdf', 100, 'q'), foundOn: 'the work order' },
    { file: file('b', 'quote.PDF', 100, null), foundOn: 'the job\'s files' },       // same upload, other case
    { file: file('c', 'notes.docx', 100, null, 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'), foundOn: 'the work order' },
    { file: file('d', 'Job_companycam_report.pdf', 100, null), foundOn: 'the job\'s files' },
    { file: file('e', 'huge.pdf', 9 * 1024 * 1024, null), foundOn: 'the job\'s files' },
    { file: file('f', 'photo.jpg', 100, null, 'image/jpeg'), foundOn: 'the job\'s files' },
    { file: file('g', 'bid2.pdf', 100, null), foundOn: 'the change order' },
    { file: file('h', 'bid3.pdf', 100, null), foundOn: 'the change order' },
    { file: file('i', 'bid4.pdf', 100, null), foundOn: 'the change order' },
  ];
  const out = selectHistoryFiles(found);
  assert.deepEqual(out.map((f) => [f.name, f.skipped]), [
    ['Quote.pdf', null],
    ['Job_companycam_report.pdf', 'a photo report'],
    ['huge.pdf', 'larger than 8 MB'],
    ['bid2.pdf', null],
    ['bid3.pdf', null],
    ['bid4.pdf', 'more than 3 files on this job; the first were sent'],
    ['notes.docx', 'not a PDF or photo (application/vnd.openxmlformats-officedocument.wordprocessingml.document)'],
    ['photo.jpg', 'more than 3 files on this job; the first were sent'],
  ]);
});

test('with download off, the files are listed and nothing is fetched', async () => {
  const r = reader();
  const report = await searchHistory(r, ['epoxy'], { download: null });
  assert.equal(report.attachments!.length, 0);
  assert.equal(report.terms[0]!.jobs[0]!.files.filter((f) => !f.skipped).length, 3);
});

test('attached files go to the model after the text, each introduced by the job it came from', async () => {
  const call = fake([DRAFT, HISTORY]);
  const withFile: HistoryReport = {
    ...report(true),
    attachments: [{
      jobName: '246466 Dennis Myers_Sunroom',
      file: { ...file('fQuote', '6466 Dennis Myers_Epoxy Quote.pdf', 26513, 'Epoxy Quote'), foundOn: 'the work order', skipped: null },
      bytes: new Uint8Array([37, 80, 68, 70]),
    }],
  };
  await draftEstimate(fx.evidence, fx.index, load, call, {
    templateIds: [FIN, GR],
    history: { search: async () => withFile, margins: MARGINS },
  });
  const content = call.calls[1]!.content as { type: string; text?: string }[];
  const intro = content.findIndex((b) => b.type === 'text' && /^From past job 246466 Dennis Myers_Sunroom, found on the work order:/.test(b.text ?? ''));
  assert.ok(intro > 0, 'the file is introduced');
  assert.equal(content[intro + 2]!.type, 'document', 'then the PDF itself');
  assert.match(call.calls[1]!.system, /files, they are attached after the text/);
});

// ---- the learned price book -----------------------------------------------------

const T0 = new Date('2026-09-30T12:00:00.000Z');
const later = (days: number) => () => new Date(T0.getTime() + days * 86_400_000);

test('a finding is remembered under every term that led to it, stays fresh for a year, and "nothing" for a month', () => {
  const store = new LearnedStore([], { now: () => T0 });
  const epoxy = HISTORY.findings[0]! as Parameters<LearnedStore['remember']>[1]['finding'];
  store.remember(['Epoxy', 'floor coating'], { fromJob: '261323 Haag_Remodel', targetName: 'Flooring - Sub', unit: 'Square Foot', finding: epoxy });
  store.remember(['skim'], { fromJob: '261323 Haag_Remodel', targetName: 'Skim', unit: 'Hours', finding: { ...epoxy, match: 'none' } });
  assert.equal(store.lookup(['floor coating'])?.term, 'floor coating');
  assert.equal(store.lookup(['EPOXY '])?.fromJob, '261323 Haag_Remodel', 'terms are matched loosely');
  assert.equal(store.lookup(['tile']), null);

  const day364 = new LearnedStore([...store.entries.values()], { now: later(364) });
  assert.ok(day364.lookup(['epoxy']), 'still fresh at 364 days');
  assert.equal(day364.lookup(['skim']), null, 'a "nothing found" entry is stale after 30 days');
  const day366 = new LearnedStore([...store.entries.values()], { now: later(366) });
  assert.equal(day366.lookup(['epoxy']), null, 'a year on, look again');

  const ignoring = new LearnedStore([...store.entries.values()], { now: () => T0, ignore: true });
  assert.equal(ignoring.lookup(['epoxy']), null, '--relearn reads nothing but still writes');

  const dir = mkdtempSync(join(tmpdir(), 'learned-'));
  const path = join(dir, 'nested', 'learned.json');
  store.save(path);
  const back = LearnedStore.load(path, { now: () => T0 });
  assert.equal(back.entries.size, 3);
  assert.equal(back.lookup(['floor coating'])?.finding.suggestedUnitCost, 13.6);
  assert.equal(LearnedStore.load(join(dir, 'missing.json')).entries.size, 0);
});

test('the second job with the same trades is answered from the price book: no search, no third call', async () => {
  const store = new LearnedStore([], { now: () => T0 });
  const searches: string[][] = [];
  const src = (search: (t: string[]) => Promise<HistoryReport>) => ({ search, margins: MARGINS, learned: store });

  // First job: everything is searched and read.
  const first = fake([DRAFT, HISTORY]);
  const d1 = await draftEstimate(fx.evidence, fx.index, load, first, {
    templateIds: [FIN, GR],
    history: src(async (t) => { searches.push(t); return report(true); }),
  });
  assert.equal(first.calls.length, 2);
  assert.equal(d1.history?.learned, 0);
  assert.deepEqual([...store.entries.keys()].sort(), ['epoxy', 'floor coating', 'paint sub', 'painting', 'skim', 'skim coat'],
    'the gap with no terms is not stored; the ignored finding for "nope" is not stored');
  assert.equal(store.entries.get('epoxy')!.unit, 'Square Foot');
  assert.equal(store.entries.get('skim coat')!.finding.match, 'partial');

  // Second job, same trades: the book answers, nothing is searched. (The
  // gap with no quantity and no terms is left out here: it would still be
  // sent for a regional ballpark, which is the next test's business.)
  const second = fake([{ ...DRAFT, gaps: [DRAFT.gaps[0]!] }]);
  const d2 = await draftEstimate(fx.evidence, fx.index, load, second, {
    templateIds: [FIN, GR],
    history: src(async (t) => { searches.push(t); return report(true); }),
  });
  assert.equal(second.calls.length, 1, 'no history call');
  assert.equal(searches.length, 1, 'no second search');
  assert.equal(d2.history?.learned, 3);
  assert.deepEqual(d2.history?.terms, []);
  const epoxy = d2.lines.find((l) => l.name === 'Flooring - Sub')!;
  assert.equal(epoxy.history?.origin.kind, 'learned');
  assert.equal(formatMoney(epoxy.historyUnitCost!), '$13.60', 'the learned unit cost is priced again');
  assert.equal(formatMoney(d2.gaps[0]!.proposed!.price!), '$1,963.68');
  const steps = draftSteps(d2);
  assert.match(steps, /3 items answered from the learned price book without a search\./);
  assert.match(steps, /Learned 2026-09-30 on 261323 Haag_Remodel; not searched again until 2027-09-30\./);
  assert.match(renderDraft(fx.evidence, d2), /nothing searched &middot; 3 from the learned price book/);

  // A learned per-square-foot cost is not carried onto an hours line.
  const hoursDraft = { ...DRAFT, lines: [{ ...DRAFT.lines[1]!, lineId: '22PLhsr2Yx56', option: null }], gaps: [] }; // Flooring Labor, Hours, same terms
  const third = fake([hoursDraft]);
  const d3 = await draftEstimate(fx.evidence, fx.index, load, third, { templateIds: [FIN, GR], history: src(async () => report(true)) });
  const labor = d3.lines[0]!;
  assert.equal(labor.history?.origin.kind, 'learned');
  assert.equal(labor.historyUnitCost, null);
  assert.match(draftSteps(d3), /learned per Square Foot; this is in Hours, so the unit cost is not carried over/);
});

test('"nothing found" is remembered briefly, so the same empty search is not repeated next week', async () => {
  const store = new LearnedStore([], { now: () => T0 });
  const searches: string[][] = [];
  const src = { search: async (t: string[]) => { searches.push(t); return report(false); }, margins: MARGINS, learned: store };
  await draftEstimate(fx.evidence, fx.index, load, fake([DRAFT, REGIONAL_ONLY]), { templateIds: [FIN, GR], history: src });
  assert.equal(searches.length, 1);
  assert.equal(store.entries.get('epoxy')!.finding.match, 'none');
  const again = fake([DRAFT, REGIONAL_ONLY]);
  const d = await draftEstimate(fx.evidence, fx.index, load, again, { templateIds: [FIN, GR], history: src });
  assert.equal(searches.length, 1, 'answered from the book');
  assert.equal(d.history?.learned, 3);
  assert.equal(again.calls.length, 2, 'the gaps still go for a regional ballpark; the book only says DB has nothing');
  const asked = again.calls[1]!.content.map((c) => (c.type === 'text' ? c.text : '')).join('\n');
  // What the book holds for the skim coat is the first run's own finding (match none, ballpark stripped), and the model is told so.
  assert.match(asked, /- gap-0 · gap · Skim-coat[^\n]*\n  basis: guess\n  note: DB's past work was already read for this \(learned 2026-09-30\): none\. No skim coat anywhere in DB history\. Give the regional ballpark\./);
  assert.match(draftSteps(d), /No past DB work matched this when it was last searched/);
  assert.equal(d.gaps[0]!.proposed?.source, 'regional');
});

test('the CLI knows the price book flags', () => {
  const a = parseDraftArgs(['261323', '--learned', 'x.json', '--relearn', '--relearn-after', '200']);
  assert.equal(a.learned, 'x.json');
  assert.equal(a.relearn, true);
  assert.equal(a.relearnAfterDays, 200);
  assert.equal(parseDraftArgs(['261323']).learned, '.db-estimator/learned-prices.json');
  assert.equal(parseDraftArgs(['261323']).relearnAfterDays, 365);
  assert.throws(() => parseDraftArgs(['261323', '--relearn-after', 'soon']), /needs a number of days/);
});

test('the file budget is dealt out across the terms, quotes first, each file once, and the rest say why', () => {
  const pdf = (id: string, name: string, description: string | null = null) =>
    ({ ...file(id, name, 100 + id.length, description), foundOn: 'the work order', skipped: null as string | null });
  const jobA = { jobId: 'A', jobName: 'A', description: null, projectType: null, lines: [], context: [], files: [
    pdf('a1', 'A misc.pdf'), pdf('a2', 'A Quote.pdf', 'quote'), { ...pdf('a3', 'photo.jpg'), type: 'image/jpeg' },
  ] };
  const jobB = { jobId: 'B', jobName: 'B', description: null, projectType: null, lines: [], context: [], files: [
    pdf('b1', 'B bill.pdf', 'statement'), pdf('b2', 'B drawing.pdf'),
  ] };
  const jobC = { jobId: 'C', jobName: 'C', description: null, projectType: null, lines: [], context: [], files: [
    pdf('a2', 'A Quote.pdf', 'quote'), // the very same upload, found again under the other term
    pdf('c2', 'C proposal.pdf'),
  ] };
  const hits: HistoryHits[] = [
    { term: 'paint', raw: 9, jobs: [jobA, jobB] },
    { term: 'epoxy', raw: 2, jobs: [jobC] },
  ];
  const chosen = chooseAttachments(hits, { total: 4 });
  assert.deepEqual(
    chosen.map((c) => [c.job.jobName, c.file.name]),
    [['A', 'A Quote.pdf'], ['C', 'C proposal.pdf'], ['B', 'B bill.pdf'], ['A', 'A misc.pdf']],
    'one per term per round, and within a term a quote from the second job before a plain PDF from the first',
  );
  assert.equal(jobC.files[0]!.skipped, 'the same file is attached under "paint"');
  assert.equal(jobB.files[1]!.skipped, "the read's 4-file budget went to closer matches");
  assert.equal(jobA.files[2]!.skipped, "the read's 4-file budget went to closer matches");
  assert.equal(jobA.files[1]!.skipped, null);
});
