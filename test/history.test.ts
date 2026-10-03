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
import { chooseAttachments, fileDocIds, fileRank, historyText, newSince, searchHistory, selectHistoryFiles, strengthOf, whereOf, type HistoryHits, type HistoryReport } from '../src/draft/history.ts';
import { LearnedStore } from '../src/draft/learned.ts';
import { READ_SYSTEM } from '../src/draft/readings.ts';
import { mkdtempSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { StructuredArgs, StructuredCall } from '../src/draft/model.ts';
import { MAX_TERMS, attachHistory, draftEstimate, historyTargets, keyWord, searchedTargets, uniqueTerms, withKeyWord, type DraftFixture } from '../src/draft/draft.ts';
import { DRAFT_SYSTEM, HISTORY_SYSTEM, historyTargetsText } from '../src/draft/prompt.ts';
import { draftFlags, draftJson, draftSteps, optionFlags, renderDraft } from '../src/draft/render.ts';
import { borrowedLines, uninstalledMaterials, type CheckLine, type LaborUse, type MaterialUse } from '../src/draft/checks.ts';
import { rateForConditions } from '../src/draft/contingency.ts';
import { LOCAL_LEARNED_PATH, SHARED_LEARNED_DIR, SHARED_LEARNED_PATH, marginsOf, parseDraftArgs, resolveLearnedPath } from '../src/draft-cli.ts';

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
const SMITH = { id: 'jobS', name: '252511 Smith_Garage' };
const SMITH_WO = { id: 'docSmithWO', type: 'vendorOrder', status: 'approved', name: 'Work Order', issueDate: '2025-11-02', account: { name: 'Rhino Concrete Coatings', type: 'vendor' } };

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
        const org = q['organization'] as Record<string, unknown>;
        if ('files' in org) {
          // Every job's files named for the term: the Myers quotes again (a job already found by its lines),
          // and for "floor coating" a quote on a job whose line is called something else.
          const like = ((org['files'] as { $: { where: { and: { or: unknown[][] }[] } } }).$.where.and[0]!.or[0]![2] as string);
          if (like === '%epoxy%') {
            return { organization: { files: { nodes: [
              { ...file('fQuote3', '6466 Dennis Myers_Epoxy Quote.pdf', 26513, 'Epoxy Quote'), job: MYERS, document: WO },
              { ...file('fTest', 'epoxy test.pdf', 100, null), job: { id: 'jobT', name: 'Kay Oss_TEST epoxy' }, document: null },
            ] } } } as T;
          }
          if (like === '%floor coating%') {
            return { organization: { files: { nodes: [
              { ...file('fGarage', '2511 Smith_Floor Coating Quote.pdf', 40000, 'Rhino quote, garage floor coating 480 sf'), job: SMITH, document: SMITH_WO },
              { ...file('fGaragePhoto', 'garage floor coating.jpg', 300000, null, 'image/jpeg'), job: SMITH, document: null },
              { ...file('fSelf', 'floor coating.pdf', 100, null), job: { id: '22PbLhMqY7tC', name: '261323 Haag_Remodel' }, document: null },
            ] } } } as T;
          }
          return { organization: { files: { nodes: [] } } } as T;
        }
        const where = (org as { costItems: { $: { where: { and: unknown[] } } } }).costItems.$.where;
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
            { ...file('fQuote2', '6466 Dennis Myers_Epoxy Quote.pdf', 26513, 'Epoxy Quote'), document: null },
            { ...file('fCO2', '6466 Dennis Myers_epoxy quote.pdf', 491463, 'Epoxy change order'), document: CO },
            file('fPhoto', 'CompanyCam 1', 200000, null, 'image/jpeg'),
          ] } } } as T;
        }
        return { job: { description: 'Sun Room & Deck', customFieldValues: { nodes: [{ value: 'C-Miscellaneous', customField: { id: '22PC7idvhRzp' } }] } } } as T;
      }
      const id = (q['document'] as { $: { id: string } }).$.id;
      if (id === 'docSmithWO') {
        return { document: { costItems: { nodes: [
          { id: 's1', name: 'Flooring - Sub', createdAt: '2025-11-02T10:00:00.000Z', quantity: 480, unitCost: 6.5, unitPrice: null, cost: 3120, price: 0, unit: { name: 'Square Foot' }, costType: { name: 'Subcontractor' } },
          { id: 's2', name: 'Note to sub', createdAt: '2025-11-02T10:00:00.000Z', quantity: null, unitCost: 0, unitPrice: 0, cost: 0, price: 0, unit: null, costType: { name: 'Other' } },
        ] } } } as T;
      }
      const costItems = { nodes: [
        { id: 'inv', name: 'Epoxy Sub Pckg', quantity: 1, unit: { name: 'Lump Sum' } },
        { id: 'x', name: 'Crew Labor', quantity: 4, unit: { name: 'Hours' } },
        { id: 'y', name: 'Rental -Storage Pod', quantity: 1, unit: { name: 'Lump Sum' } },
      ] };
      if (id === 'docINV') return { document: { costItems, files: { nodes: [] } } } as T;
      if (id === 'docCO') return { document: { files: { nodes: [{ ...file('fCO', '6466 Dennis Myers_epoxy quote.pdf', 491463, 'Epoxy change order'), document: CO }] } } } as T;
      return { document: { files: { nodes: [{ ...file('fQuote', '6466 Dennis Myers_Epoxy Quote.pdf', 26513, 'Epoxy Quote'), document: WO }] } } } as T;
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

  // The sub's quote hangs off the work order and goes first; DB's change-order scan after it;
  // the job's files named for the term add nothing new but a photo, which is listed and not read.
  assert.deepEqual(
    job.files.map((f) => [f.name, f.foundOn, f.onDocument?.vendor ?? null, f.skipped]),
    [
      ['6466 Dennis Myers_Epoxy Quote.pdf', 'the work order', 'Rhino Concrete Coatings', null],
      ['6466 Dennis Myers_epoxy quote.pdf', 'the change order', null, null],
      ['CompanyCam 1', 'the job\'s files, named for "epoxy"', null, 'a photo, not a quote; quotes and other papers are read'],
    ],
    'the sub\'s own quote first, one copy of a file uploaded twice, a plain photo not read',
  );
  assert.deepEqual(downloaded, ['https://cdn/fQuote', 'https://cdn/fCO']);
  assert.equal(report.attachments!.length, 2);
  assert.equal(report.attachments![0]!.jobName, '246466 Dennis Myers_Sunroom');

  const skim = report.terms[1]!;
  assert.equal(skim.raw, 0);
  assert.equal(skim.jobs.length, 0);

  const text = historyText(report);
  assert.match(text, /## "epoxy" — 8 matching lines, 4 shown on 1 job/);
  assert.match(text, /### 246466 Dennis Myers_Sunroom \(C-Miscellaneous\) — Sun Room & Deck/);
  assert.match(text, /- \[sold\] Epoxy Sub Pckg · 1 Lump Sum · unit cost \$5,712\.00 · unit price \$7,425\.60 · line cost \$5,712\.00 · Subcontractor · invoice \(approved\) · 2026-09-03/);
  assert.match(text, /- \[ordered\] Epoxy Sub Pckg .* work order \(draft\) from Rhino Concrete Coatings/);
  assert.match(text, /Also on that document: Crew Labor 4 Hours; Rental -Storage Pod 1 Lump Sum/);
  assert.match(text, /Files on this job not read this run: "6466 Dennis Myers_Epoxy Quote.pdf" \(Epoxy Quote\), from the work order, 2026-08-31; "6466 Dennis Myers_epoxy quote.pdf" \(Epoxy change order\), from the change order, 2026-08-31/);
  assert.match(text, /Files found but not read: "CompanyCam 1": a photo, not a quote/);
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
const NO_CATALOG = { kind: 'none', id: null, quantity: null, basis: '', sectionGroupId: null };
const DRAFT = {
  summary: 'Basement refresh with a flooring choice.',
  scopeTitle: 'Basement Finish', optionPlaces: [], scopeOfWork: 'Paint and floor.',
  lines: [
    { lineId: '22PLhtLxcz9S', quantity: 24, basis: 'two painters', purpose: '', evidence: ev('painting'), option: null, confidence: 'low', lookBack: ['paint sub', 'Painting'] },
    { lineId: '22PLhsr2Yx55', quantity: 706, basis: 'epoxy by the sub', purpose: '', evidence: ev('Epoxy Flooring'), option: 'Flooring — Epoxy', confidence: 'medium', lookBack: ['epoxy', 'floor coating'] },
    { lineId: '22PLCchBuFMa', quantity: 6, basis: 'two coats', purpose: '', evidence: ev('painting'), option: null, confidence: 'medium', lookBack: [] },
  ],
  gaps: [
    { scope: 'Skim-coat the concrete walls', purpose: '', why: 'no template line', unit: 'Hours', quantity: 24, costType: 'Labor', basis: 'guess', evidence: ev('skimming'), lookBack: ['skim coat', 'skim'], option: null },
    { scope: 'Move contents', purpose: '', why: 'no template line', unit: 'Hours', quantity: null, costType: 'Labor', basis: 'unknown', evidence: ev('moving'), lookBack: [], option: null },
  ],
  questions: [],
  contingency: { rate: 8, why: 'The walls are stripped to the concrete and the floor comes up.', conditions: ['stripped-to-substrate', 'something-moves'] },
};
const HISTORY = {
  findings: [
    { target: { kind: 'line', id: '22PLhsr2Yx55' }, match: 'match', summary: 'DB subbed one epoxy floor, the Myers sunroom, to Rhino Concrete Coatings for $5,712 in August 2026.',
      pastWork: [{ jobName: '246466 Dennis Myers_Sunroom', what: 'Epoxy Sub Pckg', where: 'change order', when: '2026-08-31', vendor: 'Rhino Concrete Coatings', quantity: 1, unit: 'Lump Sum', unitCost: 5712, lineCost: 5712 }],
      suggestedUnitCost: 13.6, thisJob: '', suggestionBasis: '$5,712 for the ~420 SF sunroom floor named in its description = $13.60/SF.', confidence: 'medium', typicallySubbed: true, usualVendor: 'Rhino Concrete Coatings',
      regionalUnitCost: null, regionalBasis: '', catalog: NO_CATALOG },
    { target: { kind: 'line', id: '22PLhtLxcz9S' }, match: 'partial', summary: 'DB has subbed interior painting to Jeff Southworth on four recent jobs, as lump sums.',
      pastWork: [], suggestedUnitCost: null, thisJob: '', suggestionBasis: 'Lump sums with no wall area shown; nothing per hour.', confidence: 'low', typicallySubbed: true, usualVendor: "Jeff Southworth's Drywall & Painting",
      regionalUnitCost: null, regionalBasis: '', catalog: NO_CATALOG },
    { target: { kind: 'gap', id: 'gap-0' }, match: 'partial', summary: 'No skim coat in DB history; the nearest is a drywall sub at $920 lump sum.',
      pastWork: [{ jobName: '261282 McComas_Misc.', what: 'Drywall Sub', where: 'estimate', when: '2026-07-14', vendor: null, quantity: 1, unit: 'Lump Sum', unitCost: 920, lineCost: 920 }],
      suggestedUnitCost: 45, thisJob: '', suggestionBasis: 'A drywall sub at $920 for about 20 hours of work = $45/hour, if the trade is the same.', confidence: 'low', typicallySubbed: null, usualVendor: null,
      regionalUnitCost: null, regionalBasis: '', catalog: NO_CATALOG },
    // History has nothing, so the model gave a regional ballpark; the gap has no quantity, so it cannot total.
    { target: { kind: 'gap', id: 'gap-1' }, match: 'none', summary: 'Nothing in DB history for moving contents.', pastWork: [], suggestedUnitCost: null, thisJob: '', suggestionBasis: '', confidence: 'low', typicallySubbed: null, usualVendor: null,
      regionalUnitCost: 55, regionalBasis: 'Two of DB\'s own people at about $27.50/hour loaded, the going small-contractor rate around Van Wert.', catalog: NO_CATALOG },
    { target: { kind: 'line', id: 'nope' }, match: 'none', summary: 'ignored', pastWork: [], suggestedUnitCost: null, thisJob: '', suggestionBasis: '', confidence: 'low', typicallySubbed: null, usualVendor: null,
      regionalUnitCost: null, regionalBasis: '', catalog: NO_CATALOG },
  ],
};
/** The same, with the painting lump sums put per hour, so every finding carries a unit cost. */
const PRICED = {
  findings: HISTORY.findings.map((f) =>
    f.target.id === '22PLhtLxcz9S' ? { ...f, suggestedUnitCost: 48, thisJob: '', suggestionBasis: '$1,920 for 40 hours on the Hunter quote = $48/hour.' } : f),
};
/** History finds nothing at all; the model prices the skim coat from the area instead. */
const REGIONAL_ONLY = {
  findings: [
    { target: { kind: 'gap', id: 'gap-0' }, match: 'none', summary: 'No skim coat anywhere in DB history.', pastWork: [], suggestedUnitCost: null, thisJob: '', suggestionBasis: '', confidence: 'low', typicallySubbed: null, usualVendor: null,
      regionalUnitCost: 45, regionalBasis: 'A finisher at about $45/hour loaded is what a small crew costs around Van Wert; skim coat is slow work.', catalog: NO_CATALOG },
    { target: { kind: 'gap', id: 'gap-1' }, match: 'none', summary: 'Nothing for moving contents.', pastWork: [], suggestedUnitCost: null, thisJob: '', suggestionBasis: '', confidence: 'low', typicallySubbed: null, usualVendor: null,
      regionalUnitCost: null, regionalBasis: '', catalog: NO_CATALOG },
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
  // Gaps first, then the sub line, then the labor line; every target's first term before any second.
  assert.deepEqual(searched, [['skim coat', 'epoxy', 'paint sub', 'skim', 'floor coating', 'painting']]);
  assert.equal(call.calls.length, 2, 'draft, then history');
  assert.match(call.calls[1]!.system, /reading DB's own past work/);

  const targets = historyTargets(d.lines, d.gaps);
  assert.deepEqual(targets.map((t) => t.id), ['22PLhtLxcz9S', '22PLhsr2Yx55', 'gap-0', 'gap-1'], 'the plain Paint line has no terms and is not a target');
  assert.equal(targets[1]!.templateUnitCost, 7.5, 'the template rate the model may compare against');
  assert.match(historyTargetsText('a job', targets), /- gap-0 · gap · Skim-coat the concrete walls · 24 Hours · Labor · no template price · terms: "skim coat", "skim"/);
  assert.deepEqual(uniqueTerms(targets), ['skim coat', 'epoxy', 'paint sub', 'skim', 'floor coating', 'painting']);

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
    { ...HISTORY.findings[1]!, suggestedUnitCost: 55, thisJob: '', suggestionBasis: '$550 / 10 hrs on Miller.' },
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
  assert.match(steps, /Skim-coat the concrete walls" \(Labor, 24 Hours\)[^\n]*\n     price to type: [^\n]*\n     history: No skim coat in DB history.*Proposed from history: \$45\.00\/Hours × 24 = \$1,080\.00 cost, \$1,963\.68 price — Carl confirms/);
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
  assert.match(asked, /2 of these are gaps with no line in the chosen templates\. Match each to a catalog candidate/);
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
  assert.match(steps, /Skim-coat the concrete walls" \(Labor, 24 Hours\)[^\n]*\n     price to type: [^\n]*\n     history: No skim coat anywhere in DB history\. Regional ballpark: \$45\.00\/Hours cost \(\$81\.82 price\) × 24 = \$1,080\.00 cost, \$1,963\.68 price — NOTE TO REP: an estimate for our area, not DB pricing; confirm with Carl or a sub bid before it goes out\. A finisher at about \$45\/hour loaded/);
  assert.match(steps, /Past work was searched for "skim coat", "epoxy", "paint sub", "skim", "floor coating", "painting": no past DB work matched any search term\./);
  const html = renderDraft(fx.evidence, d);
  assert.match(html, /a regional ballpark of \$1,963\.68 for 1 of them, not DB pricing/);
  assert.match(html, /Create · regional ballpark, not DB pricing<\/div>\s*<h3>Skim-coat the concrete walls/);
  const json = draftJson(d) as { gaps: { proposed: { source: string; price: string } | null; regionalUnitCost: string | null }[]; totals: { regionalForGaps: { gaps: number } } };
  assert.equal(json.gaps[0]!.proposed!.source, 'regional');
  assert.equal(json.gaps[0]!.regionalUnitCost, '$45.00');
  assert.equal(json.totals.regionalForGaps.gaps, 1);

  // The book keeps what DB did, not a guess about the area.
  assert.equal(store.forTerm('skim coat')[0]!.finding.match, 'none');
  assert.equal(store.forTerm('skim coat')[0]!.finding.regionalUnitCost, null);
  assert.equal(store.forTerm('epoxy')[0]!.finding.match, 'none');

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
  assert.match(draftSteps(d), /Move contents" \(Labor, Hours\)[^\n]*\n     price to type: [^\n]*\n     history: Nothing in DB history for moving contents\. Regional ballpark: \$55\.00\/Hours cost \(\$100\.00 price\), quantity still to be confirmed — NOTE TO REP/);
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
  const gaps: Parameters<typeof attachHistory>[1] = [{ ...DRAFT.gaps[0]!, costType: 'Labor', history: null, proposed: null, regionalUnitCost: null, regionalUnitPrice: null, resolved: null, catalogMatch: null, catalogNote: null, placeIn: null }];
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

test('files found beside past lines: quotes first, duplicates once, oddities, reports and plain photos left out with a reason', () => {
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
    ['bid2.pdf', null],
    ['bid3.pdf', null],
    ['bid4.pdf', 'more than 3 files on this job; the first were sent'],
    ['Job_companycam_report.pdf', 'a photo report'],
    ['huge.pdf', 'larger than 8 MB'],
    ['notes.docx', 'not a PDF or photo (application/vnd.openxmlformats-officedocument.wordprocessingml.document)'],
    ['photo.jpg', 'a photo, not a quote; quotes and other papers are read'],
  ]);
});

test('with download off, the files are listed and nothing is fetched', async () => {
  const r = reader();
  const report = await searchHistory(r, ['epoxy'], { download: null });
  assert.equal(report.attachments!.length, 0);
  assert.equal(report.terms[0]!.jobs[0]!.files.filter((f) => !f.skipped).length, 2);
});

test('a file that cannot be read is listed with why and not sent whole, so it cannot sink the history call', async () => {
  const call = fake([DRAFT, { not: 'a reading' }, HISTORY]);
  const quote = { ...file('fQuote', '6466 Dennis Myers_Epoxy Quote.pdf', 26513, 'Epoxy Quote'), foundOn: 'the work order', skipped: null as string | null };
  const withFile = report(true);
  withFile.terms[0]!.jobs[0]!.files.push(quote);
  withFile.attachments = [{ jobName: '246466 Dennis Myers_Sunroom', file: quote, bytes: new Uint8Array([37, 80, 68, 70]) }];
  await draftEstimate(fx.evidence, fx.index, load, call, {
    templateIds: [FIN, GR],
    history: { search: async () => withFile, margins: MARGINS },
  });
  assert.equal(call.calls[1]!.system, READ_SYSTEM, 'the file is read on its own first');
  const content = call.calls[2]!.content as { type: string; text?: string }[];
  assert.ok(!content.some((b) => b.type === 'document'), 'never sent whole');
  assert.match(content.map((b) => b.text ?? '').join('\n'), /Files found but not read: "6466 Dennis Myers_Epoxy Quote\.pdf": could not be read: the read "6466 Dennis Myers_Epoxy Quote\.pdf" reply did not fit the schema/);
  assert.match(call.calls[2]!.system, /A file that could not be read is listed with the reason/);
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

  // First job: everything is searched and read. (Painting is priced here; an unpriced
  // finding is searched again every time, which is the next test's business.)
  const first = fake([DRAFT, PRICED]);
  const d1 = await draftEstimate(fx.evidence, fx.index, load, first, {
    templateIds: [FIN, GR],
    history: src(async (t) => { searches.push(t); return report(true); }),
  });
  assert.equal(first.calls.length, 2);
  assert.equal(d1.history?.learned, 0);
  assert.deepEqual([...new Set([...store.entries.values()].map((e) => e.term))].sort(), ['epoxy', 'floor coating', 'paint sub', 'painting', 'skim', 'skim coat'],
    'the gap with no terms is not stored; the ignored finding for "nope" is not stored');
  assert.equal(store.forTerm('epoxy')[0]!.unit, 'Square Foot');
  assert.equal(store.forTerm('skim coat')[0]!.finding.match, 'partial');

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

  // Another line with the same search words is not handed this line's answer: it is searched.
  const hoursDraft = { ...DRAFT, lines: [{ ...DRAFT.lines[1]!, lineId: '22PLhsr2Yx56', option: null }], gaps: [] }; // Flooring Labor, Hours, same terms
  const third = fake([hoursDraft, PRICED]);
  const before = searches.length;
  const d3 = await draftEstimate(fx.evidence, fx.index, load, third, {
    templateIds: [FIN, GR], history: src(async (t) => { searches.push(t); return report(true); }),
  });
  assert.equal(searches.length, before + 1, 'Flooring Labor is not answered by what was learned for Flooring - Sub');
  assert.equal(d3.lines[0]!.history, null, 'and the reply about another target is not pinned on it');

  // A gap has no fixed name, so it takes the newest answer for its word; a per-square-foot
  // cost is still not carried onto a gap counted in hours.
  const hoursGap = { ...DRAFT, lines: [], gaps: [{ ...DRAFT.gaps[0]!, scope: 'Epoxy touch-up labor', unit: 'Hours', lookBack: ['epoxy'] }] };
  const d4 = await draftEstimate(fx.evidence, fx.index, load, fake([hoursGap, REGIONAL_ONLY]), { templateIds: [FIN, GR], history: src(async () => report(true)) });
  const gap = d4.gaps[0]!;
  assert.equal(gap.history?.origin.kind, 'learned');
  assert.notEqual(gap.proposed?.source, 'history', 'left without a history price, so it goes for a ballpark instead');
  assert.match(draftSteps(d4), /learned per Square Foot; this is in Hours, so the unit cost is not carried over/);
});

test('"nothing found" is remembered briefly, so the same empty search is not repeated next week', async () => {
  const store = new LearnedStore([], { now: () => T0 });
  const searches: string[][] = [];
  const src = { search: async (t: string[]) => { searches.push(t); return report(false); }, margins: MARGINS, learned: store };
  await draftEstimate(fx.evidence, fx.index, load, fake([DRAFT, REGIONAL_ONLY]), { templateIds: [FIN, GR], history: src });
  assert.equal(searches.length, 1);
  assert.equal(store.forTerm('epoxy')[0]!.finding.match, 'none');
  const again = fake([DRAFT, REGIONAL_ONLY]);
  const d = await draftEstimate(fx.evidence, fx.index, load, again, { templateIds: [FIN, GR], history: src });
  assert.equal(searches.length, 1, 'answered from the book');
  assert.equal(d.history?.learned, 3);
  assert.equal(again.calls.length, 2, 'the gaps still go for a regional ballpark; the book only says DB has nothing');
  const asked = again.calls[1]!.content.map((c) => (c.type === 'text' ? c.text : '')).join('\n');
  // What the book holds for the skim coat is the first run's own finding (match none, ballpark stripped), and the model is told so.
  assert.match(asked, /- gap-0 · gap · Skim-coat[^\n]*\n  basis: guess\n  note: DB's past work was already read for this \(learned 2026-09-30\): none\. No skim coat anywhere in DB history\. Match it to the catalog if a candidate is the same thing; otherwise give the regional ballpark\./);
  assert.match(draftSteps(d), /No past DB work matched this when it was last searched/);
  assert.equal(d.gaps[0]!.proposed?.source, 'regional');
});

test('the CLI knows the price book flags', () => {
  const a = parseDraftArgs(['261323', '--learned', 'x.json', '--relearn', '--relearn-after', '200']);
  assert.equal(a.learned, 'x.json');
  assert.equal(a.relearn, true);
  assert.equal(a.relearnAfterDays, 200);
  assert.equal(parseDraftArgs(['261323']).learned, null, 'the default is resolved at run time');
  assert.equal(parseDraftArgs(['261323', '--learned', 'x.json']).learned, 'x.json');
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
  assert.equal(jobC.files[0]!.skipped, 'the same file is read under "paint"');
  assert.equal(jobB.files[1]!.skipped, "this run's 4-file reading budget went to closer matches");
  assert.equal(jobA.files[2]!.skipped, "this run's 4-file reading budget went to closer matches");
  assert.equal(jobA.files[1]!.skipped, null);
});

// ---- 25-0000, 2026-10-01: the Myers epoxy quote was not looked for -----------------------

test('a quote filed under the trade\'s name is found on a job whose line is called something else', async () => {
  const r = reader();
  const report = await searchHistory(r, ['floor coating'], { excludeJobId: '22PbLhMqY7tC', download: null });
  const t = report.terms[0]!;
  assert.equal(t.raw, 0, 'no line anywhere is named for "floor coating"');
  assert.deepEqual(t.jobs.map((j) => [j.jobName, j.foundBy]), [['252511 Smith_Garage', 'files']], 'found by its files; the job being drafted is not history');
  const job = t.jobs[0]!;
  // The lines on the work order the quote hangs on, whatever they are named; the $0 note is not evidence.
  assert.deepEqual(job.lines.map((l) => [l.name, l.quantity, l.unit, l.cost, l.strength, l.where, l.vendor]), [
    ['Flooring - Sub', 480, 'Square Foot', 3120, 'ordered', 'work order', 'Rhino Concrete Coatings'],
  ]);
  assert.deepEqual(job.files.map((f) => [f.name, f.foundOn, f.skipped]), [
    ['2511 Smith_Floor Coating Quote.pdf', 'the work order, named for "floor coating"', null],
    ['garage floor coating.jpg', 'the job\'s files, named for "floor coating"', 'a photo, not a quote; quotes and other papers are read'],
  ]);
  assert.equal(job.description, 'Sun Room & Deck', 'the job head is read (the fake answers every job alike)');
  const text = historyText(report);
  assert.match(text, /## "floor coating" — 0 matching lines, 1 shown on 1 job/);
  assert.match(text, /### 252511 Smith_Garage[^\n]*\n  Found by a file named for "floor coating", not by a line: these are the lines on the document that file is attached to, whatever they are named\. Read the file for what they cover\.\n- \[ordered\] Flooring - Sub · 480 Square Foot · unit cost \$6\.50/);
  assert.match(text, /Files on this job not read this run: "2511 Smith_Floor Coating Quote\.pdf" \(Rhino quote, garage floor coating 480 sf\), from the work order, named for "floor coating"/);
  // The organization's files were searched with the term, on jobs only.
  const fileQuery = r.queries.find((q) => 'organization' in q && 'files' in (q['organization'] as object)) as { organization: { files: { $: { where: unknown } } } };
  assert.deepEqual(fileQuery.organization.files.$.where, {
    and: [{ or: [[['name'], 'like', '%floor coating%'], [['description'], 'like', '%floor coating%']] }, [['job', 'id'], '!=', null]],
  });
});

test('a job found by its lines is not added again by its files, and the file search can be turned off', async () => {
  const r = reader();
  const report = await searchHistory(r, ['epoxy'], { excludeJobId: '22PbLhMqY7tC', download: null });
  assert.deepEqual(report.terms[0]!.jobs.map((j) => [j.jobName, j.foundBy]), [['246466 Dennis Myers_Sunroom', 'lines']], 'the test job\'s file is not history either');
  const off = reader();
  await searchHistory(off, ['epoxy'], { excludeJobId: '22PbLhMqY7tC', download: null, files: false });
  assert.ok(!off.queries.some((q) => 'organization' in q && 'files' in (q['organization'] as object)));
});

test('a phrase gets its key word first, so "epoxy floor coating" also searches "epoxy"', () => {
  assert.equal(keyWord('epoxy floor coating'), 'epoxy');
  assert.equal(keyWord('floor coating'), 'coating', 'floor alone would return every flooring line');
  assert.equal(keyWord('false wall framing'), 'framing');
  assert.equal(keyWord('mold resistant paint'), 'mold');
  assert.equal(keyWord('floor wall'), null);
  assert.deepEqual(withKeyWord(['epoxy floor coating', 'garage floor coating']), ['epoxy', 'epoxy floor coating', 'garage floor coating']);
  assert.deepEqual(withKeyWord(['epoxy', 'floor coating']), ['epoxy', 'floor coating'], 'a single word is already there');
  assert.deepEqual(withKeyWord(['Batt Insulation', 'batt']), ['Batt Insulation', 'batt']);
  assert.deepEqual(withKeyWord([' ', '']), []);
  assert.deepEqual(withKeyWord(['floor wall']), ['floor wall'], 'nothing specific to add');
});

test('terms are dealt out in rounds, gaps first, up to the cap; only searched targets count as searched', () => {
  const target = (kind: 'line' | 'gap', id: string, costTypeName: string, lookBack: string[]) => ({
    kind, id, name: id, quantity: 1, unit: 'Hours', costTypeName, basis: '', templateUnitCost: null, lookBack,
  });
  // Ten labor lines with three terms each, then a sub line, then the epoxy gap last: the order draft lines come in.
  const labor = Array.from({ length: 10 }, (_, i) => target('line', `labor${i}`, 'Labor', [`trade${i}`, `trade${i} labor`, `trade${i} sub`]));
  const targets = [...labor, target('line', 'sub', 'Subcontractor', ['insulation sub', 'insulation']), target('gap', 'gap-0', 'Subcontractor', ['epoxy', 'floor coating'])];
  const terms = uniqueTerms(targets);
  assert.equal(MAX_TERMS, 16);
  assert.equal(terms.length, 16);
  assert.deepEqual(terms.slice(0, 2), ['epoxy', 'insulation sub'], 'the gap and the sub line before any labor line');
  assert.deepEqual(terms.slice(2, 12), labor.map((_, i) => `trade${i}`), 'every labor line\'s first term before any second');
  assert.deepEqual(terms.slice(12), ['floor coating', 'insulation', 'trade0 labor', 'trade1 labor']);
  const searched = searchedTargets(targets, terms).map((t) => t.id);
  assert.equal(searched.length, 12, 'every target had a term searched');
  // With a cap the old way would have hit, the last targets are not searched, and say so.
  const many = Array.from({ length: 20 }, (_, i) => target('gap', `gap-${i}`, 'Labor', [`word${i}`]));
  const t20 = uniqueTerms(many);
  assert.equal(t20.length, 16);
  assert.deepEqual(searchedTargets(many, t20).map((t) => t.id), many.slice(0, 16).map((t) => t.id));
});

test('a target whose terms were not searched is not remembered as "nothing found"', async () => {
  // Seventeen gaps, each with its own term: the sixteenth search is the last; the seventeenth gap was never looked for.
  const gaps = Array.from({ length: 17 }, (_, i) => ({
    scope: `Gap ${i}`, purpose: '', why: 'no template line', unit: 'Hours', quantity: 1, costType: 'Labor', basis: 'guess', evidence: DRAFT.gaps[0]!.evidence,
    lookBack: [`word${i}`], option: null,
  }));
  const store = new LearnedStore([], { now: () => T0 });
  const searches: string[][] = [];
  const call = fake([{ ...DRAFT, lines: DRAFT.lines.filter((l) => l.lookBack.length === 0), gaps }, REGIONAL_ONLY]);
  await draftEstimate(fx.evidence, fx.index, load, call, {
    templateIds: [FIN, GR],
    history: { search: async (t) => { searches.push(t); return { terms: t.map((term) => ({ term, raw: 0, jobs: [] })) }; }, margins: MARGINS, learned: store },
  });
  assert.equal(searches[0]!.length, 16);
  assert.ok(!searches[0]!.includes('word16'));
  assert.equal(store.forTerm('word0')[0]!.finding.match, 'none', 'searched and nothing found: remembered briefly');
  assert.equal(store.forTerm('word16').length, 0, 'never searched: nothing to remember');
  const asked = call.calls[1]!.content.map((c) => (c.type === 'text' ? c.text : '')).join('\n');
  assert.match(asked, /- gap-16 · gap · Gap 16[^\n]*\n  basis: guess\n  note: Its terms were not searched this run \(at most 16 are\)/);
  assert.doesNotMatch(asked, /- gap-15 · gap · Gap 15[^\n]*\n  basis: guess\n  note: Its terms were not searched/);
});


// ---- 25-0000, 2026-10-01: the quote was found and still not read --------------------------
// Carl: "learn to read the quote files loaded when attempting to find historical costing."

const RHINO_READING = {
  kind: 'quote', from: 'Rhino Concrete Coatings', date: '2026-08-20', work: 'Epoxy flake floor for the Myers sunroom.',
  sizes: ['Sunroom floor approx. 420 sq ft'],
  items: [{ what: 'Epoxy floor system', quantity: 1, unit: 'Lump Sum', unitPrice: null, amount: 5712 }],
  total: 5712, notes: 'Grind and fill cracks included.',
};

/** A model that answers by step, so files read in any order get their reading. */
function byStep(replies: { draft: unknown; read: (args: StructuredArgs<unknown>) => unknown; history: unknown }): Fake {
  const calls: StructuredArgs<unknown>[] = [];
  const f = (async (args: StructuredArgs<unknown>) => {
    calls.push(args);
    const parsed = args.system === READ_SYSTEM ? replies.read(args) : calls.filter((c) => c.system !== READ_SYSTEM).length === 1 ? replies.draft : replies.history;
    return { parsed, stopReason: 'end_turn', usage: { input: 1_000, output: 100, cacheRead: 0, cacheWrite: 0 } };
  }) as Fake;
  f.calls = calls;
  return f;
}

test('the sub\'s quote on the work order is read before DB\'s change-order scan, even with one file\'s turn', () => {
  const mk = (id: string, name: string, size: number, description: string, onDocument: { type: string; name: string; vendor: string | null } | null) =>
    ({ ...file(id, name, size, description), foundOn: 'x', onDocument, skipped: null as string | null });
  const scan = mk('22PdgeJTRrV5', '6466 Dennis Myers_epoxy quote.pdf', 491463, 'Epoxy change order', { type: 'customerOrder', name: 'Change Order', vendor: null });
  const quote = mk('22PdgemYF7ME', '6466 Dennis Myers_Epoxy Quote.pdf', 26513, 'Epoxy Quote', { type: 'vendorOrder', name: 'Work Order', vendor: 'Rhino Concrete Coatings' });
  assert.equal(fileRank(quote), 0, 'a PDF on a work order is the sub\'s own paper');
  assert.equal(fileRank(scan), 2, 'DB\'s change order to the customer');
  assert.equal(fileRank({ ...quote, onDocument: null }), 1, 'named for a quote, on no document');
  assert.equal(fileRank({ ...quote, onDocument: null, name: 'sketch.pdf', description: null }), 3);
  const job = { jobId: 'M', jobName: '246466 Dennis Myers_Sunroom', description: null, projectType: null, lines: [], context: [], files: [scan, quote] };
  const chosen = chooseAttachments([{ term: 'epoxy', raw: 4, jobs: [job] }], { total: 1 });
  assert.deepEqual(chosen.map((c) => c.file.id), ['22PdgemYF7ME']);
});

test('the files on a job\'s work orders are read even when its customer documents carry more matching lines', () => {
  const l = (id: string, documentId: string, where: string) => ({ id, documentId, where }) as unknown as Parameters<typeof fileDocIds>[0][number];
  assert.deepEqual(
    fileDocIds([l('1', 'inv', 'invoice'), l('2', 'co', 'change order'), l('3', 'inv', 'invoice'), l('4', 'co2', 'change order'), l('5', 'inv2', 'invoice'), l('6', 'wo', 'work order')]),
    ['inv', 'wo', 'co', 'co2'],
    'the strongest line\'s document, then the work order, then the rest, four at most',
  );
  assert.deepEqual(fileDocIds([]), []);
});

test('every past quote found is read on its own first, and the history reads what it said instead of the file', async () => {
  const store = new LearnedStore([], { now: () => T0 });
  const withFile: HistoryReport = {
    terms: [{ term: 'epoxy', raw: 4, jobs: [{
      jobId: 'jobM', jobName: '246466 Dennis Myers_Sunroom', description: null, projectType: null, context: [],
      lines: [],
      files: [{ ...file('fQuote', '6466 Dennis Myers_Epoxy Quote.pdf', 26513, 'Epoxy Quote'), foundOn: 'the work order', onDocument: { type: 'vendorOrder', name: 'Work Order', vendor: 'Rhino Concrete Coatings' }, skipped: null }],
    }] }],
  };
  withFile.attachments = [{ jobName: '246466 Dennis Myers_Sunroom', file: withFile.terms[0]!.jobs[0]!.files[0]!, bytes: new Uint8Array([37, 80, 68, 70]) }];
  const call = byStep({ draft: DRAFT, read: () => RHINO_READING, history: HISTORY });
  const d = await draftEstimate(fx.evidence, fx.index, load, call, {
    templateIds: [FIN, GR],
    history: { search: async () => withFile, margins: MARGINS, learned: store },
  });

  const read = call.calls.find((c) => c.system === READ_SYSTEM)!;
  const readBlocks = read.content as { type: string; text?: string }[];
  assert.match(readBlocks[0]!.text!, /^From DB's past job 246466 Dennis Myers_Sunroom, found on the work order from Rhino Concrete Coatings, while looking for past costs of "epoxy"\./);
  assert.ok(readBlocks.some((b) => b.type === 'document'), 'the reader gets the PDF');
  assert.match(READ_SYSTEM, /every area, length, count and dimension written anywhere on it/);

  const history = call.calls[call.calls.length - 1]!;
  const blocks = history.content as { type: string; text?: string }[];
  assert.ok(!blocks.some((b) => b.type === 'document'), 'the file read on its own is not sent again');
  const text = blocks.map((b) => b.text ?? '').join('\n');
  assert.match(text, /  Read from "6466 Dennis Myers_Epoxy Quote\.pdf" \(Epoxy Quote\), on the work order from Rhino Concrete Coatings, uploaded 2026-08-31: quote from Rhino Concrete Coatings, dated 2026-08-20: Epoxy flake floor for the Myers sunroom\. Sizes written on it: Sunroom floor approx\. 420 sq ft\. Lines: Epoxy floor system 1 Lump Sum = \$5,712\.00\. Total \$5,712\.00\. Notes: Grind and fill cracks included\./);
  assert.match(history.system, /Before you say a past job's size is not shown, check every reading under that job/);

  assert.deepEqual(d.history?.files, { read: 1, readBefore: 0, failed: 0 });
  assert.equal(store.files.get('fQuote')?.reading.sizes[0], 'Sunroom floor approx. 420 sq ft', 'what the quote said is kept');
  assert.equal(store.files.get('fQuote')?.jobName, '246466 Dennis Myers_Sunroom');
  const page = renderDraft(fx.evidence, d);
  assert.match(page, /1 past quote read/);
  assert.match(page, /<div class="chip">Past quote read<\/div><h3>6466 Dennis Myers_Epoxy Quote\.pdf/);
  assert.equal((draftJson(d) as { history: { quotesRead: unknown[] } }).history.quotesRead.length, 1);
});

test('a quote read on an earlier run is not downloaded or read again; its reading goes to the history as before', async () => {
  const store = new LearnedStore([], { now: () => T0 });
  store.rememberFile({ id: 'fQuote', name: '6466 Dennis Myers_Epoxy Quote.pdf', size: 26513 }, '246466 Dennis Myers_Sunroom', RHINO_READING as never);
  const downloaded: string[] = [];
  const report = await searchHistory(reader(), ['epoxy'], {
    excludeJobId: '22PbLhMqY7tC',
    download: async (url) => { downloaded.push(url); return new Uint8Array([37, 80, 68, 70]); },
    readingOf: (f) => { const r = store.readingOf(f); return r ? { reading: r.reading, readAt: r.readAt } : null; },
  });
  assert.deepEqual(downloaded, ['https://cdn/fCO'], 'only the file never read is fetched');
  const quote = report.terms[0]!.jobs[0]!.files[0]!;
  assert.equal(quote.reading?.readBefore, T0.toISOString());
  const text = historyText(report);
  assert.match(text, /Read from "6466 Dennis Myers_Epoxy Quote\.pdf" \(Epoxy Quote\), on the work order from Rhino Concrete Coatings, uploaded 2026-08-31: quote from Rhino/);
  assert.match(text, /Files on this job not read this run: "6466 Dennis Myers_epoxy quote\.pdf"/);
  assert.doesNotMatch(text, /not read this run: "6466 Dennis Myers_Epoxy Quote/);

  // The same upload under another id is the same reading.
  assert.equal(store.readingOf({ id: 'other', name: '6466 DENNIS MYERS_Epoxy Quote.pdf', size: 26513 })?.fileId, 'fQuote');
  assert.equal(store.readingOf({ id: 'other', name: '6466 Dennis Myers_Epoxy Quote.pdf', size: 1 }), null);
});

test('a file\'s reading never goes stale, survives --relearn and the disk, and --reread reads it again', () => {
  const store = new LearnedStore([], { now: () => T0 });
  store.rememberFile({ id: 'fQuote', name: 'q.pdf', size: 1 }, 'Myers', RHINO_READING as never);
  const dir = mkdtempSync(join(tmpdir(), 'learned-files-'));
  const path = join(dir, 'learned.json');
  store.save(path);
  const back = LearnedStore.load(path, { now: later(5000), ignore: true });
  assert.equal(back.readingOf({ id: 'fQuote', name: 'q.pdf', size: 1 })?.reading.total, 5712, 'years later, under --relearn, still read');
  assert.equal(LearnedStore.load(path, { reread: true }).readingOf({ id: 'fQuote', name: 'q.pdf', size: 1 }), null);
  assert.equal(parseDraftArgs(['261323', '--reread']).reread, true);
  assert.equal(parseDraftArgs(['261323']).reread, false);
});

test('a lump sum the book could not put per unit is searched again every time, so a quote read since can price it', async () => {
  const store = new LearnedStore([], { now: () => T0 });
  const unpriced = { ...HISTORY.findings[0]!, suggestedUnitCost: null, thisJob: '', suggestionBasis: 'The square footage is not shown.' } as Parameters<LearnedStore['remember']>[1]['finding'];
  store.remember(['epoxy', 'floor coating'], { fromJob: '25-0000', targetName: 'Flooring - Sub', unit: 'Square Foot', finding: unpriced });
  assert.equal(store.lookup(['epoxy']), null, 'kept on record, not used in place of a search');
  assert.equal(store.forTerm('epoxy').length, 1);
  const searches: string[][] = [];
  await draftEstimate(fx.evidence, fx.index, load, fake([DRAFT, HISTORY]), {
    templateIds: [FIN, GR],
    history: { search: async (t) => { searches.push(t); return report(true); }, margins: MARGINS, learned: store },
  });
  assert.ok(searches[0]!.includes('epoxy'), 'searched again');
  assert.equal(store.lookup(['epoxy'])?.finding.suggestedUnitCost, 13.6, 'and this time priced, and kept');
});

test('a new sub quote since the book learned a price sends that trade back to the search', async () => {
  const store = new LearnedStore([], { now: () => T0 });
  const searches: string[][] = [];
  const src = (newSince?: (terms: string[], since: string) => Promise<string | null>) => ({
    search: async (t: string[]) => { searches.push(t); return report(true); }, margins: MARGINS, learned: store,
    ...(newSince ? { newSince } : {}),
  });
  await draftEstimate(fx.evidence, fx.index, load, fake([DRAFT, PRICED]), { templateIds: [FIN, GR], history: src() });
  assert.equal(searches.length, 1);

  const asked: [string[], string][] = [];
  const d = await draftEstimate(fx.evidence, fx.index, load, fake([{ ...DRAFT, gaps: [DRAFT.gaps[0]!] }, PRICED]), {
    templateIds: [FIN, GR],
    history: src(async (terms, since) => {
      asked.push([terms, since]);
      return terms.includes('epoxy') ? '"Epoxy Sub Pckg" on a Work Order for 252511 Smith_Garage, 2026-11-02' : null;
    }),
  });
  assert.equal(asked[0]![1], T0.toISOString(), 'asked what came in since the day it was learned');
  assert.equal(searches.length, 2);
  assert.deepEqual(searches[1], ['epoxy', 'floor coating'], 'only the trade with new paper is searched');
  assert.equal(d.history?.learned, 2);
  assert.deepEqual(d.history?.renewed, [{ target: 'Flooring - Sub', what: '"Epoxy Sub Pckg" on a Work Order for 252511 Smith_Garage, 2026-11-02' }]);
  assert.match(renderDraft(fx.evidence, d), /Searched again, though the price book had it: new sub paper came in for Flooring - Sub/);
});

test('new sub paper is a line on a vendor document or a file named for the term, since the date, on a real job other than this one', async () => {
  const queries: Record<string, unknown>[] = [];
  const answers = [
    { costItems: { nodes: [{ name: 'Epoxy', createdAt: '2026-11-01T00:00:00Z', job: { id: 'self', name: '25-0000 Test' }, document: { name: 'Work Order' } }] },
      files: { nodes: [{ name: 'Epoxy quote.pdf', createdAt: '2026-11-03T00:00:00Z', job: { id: 'jobS', name: '252511 Smith_Garage' } }] } },
    { costItems: { nodes: [] }, files: { nodes: [] } },
  ];
  const r: Reader = {
    organizationId: 'org',
    async query<T>(q: Record<string, unknown>): Promise<T> { queries.push(q); return { organization: answers.shift() } as T; },
  };
  assert.equal(await newSince(r, ['epoxy'], '2026-10-01T00:00:00.000Z', 'self'), '"Epoxy quote.pdf" on 252511 Smith_Garage, 2026-11-03');
  const org = queries[0]!['organization'] as { costItems: { $: { where: unknown } }; files: { $: { where: unknown } } };
  const named = { or: [[['name'], 'like', '%epoxy%'], [['description'], 'like', '%epoxy%']] };
  assert.deepEqual(org.costItems.$.where, { and: [
    named, [['job', 'id'], '!=', null], [['createdAt'], '>', '2026-10-01T00:00:00.000Z'],
    { or: [[['document', 'type'], '=', 'vendorOrder'], [['document', 'type'], '=', 'vendorBill'], [['document', 'type'], '=', 'bidRequest']] },
  ] });
  assert.deepEqual(org.files.$.where, { and: [named, [['job', 'id'], '!=', null], [['createdAt'], '>', '2026-10-01T00:00:00.000Z']] });
  assert.equal(await newSince(r, ['epoxy'], '2026-10-01T00:00:00.000Z', 'self'), null);
});

// ---- 2026-10-02: one book for the work computer and the laptop ----------------------------

test('the shared OneDrive book is the default wherever that folder is; --learned and DB_LEARNED_PATH come first', () => {
  assert.equal(SHARED_LEARNED_PATH, 'C:\\Users\\carlb\\OneDrive\\Documents\\DBs\\Intranet\\dev\\DB-Estimator\\learned-prices.json');
  const here = (p: string) => p === SHARED_LEARNED_DIR;
  const nowhere = () => false;
  assert.deepEqual(resolveLearnedPath(null, {}, here), { path: SHARED_LEARNED_PATH, why: 'the shared OneDrive book', shared: true });
  const own = resolveLearnedPath(null, {}, nowhere);
  assert.equal(own.path, LOCAL_LEARNED_PATH, 'a computer without the folder keeps its own');
  assert.equal(own.shared, false);
  assert.match(own.why, /the shared OneDrive folder .* is not here/);
  assert.deepEqual(resolveLearnedPath(null, { DB_LEARNED_PATH: ' D:\\Shared\\learned.json ' }, here), { path: 'D:\\Shared\\learned.json', why: 'DB_LEARNED_PATH in .env', shared: true });
  assert.deepEqual(resolveLearnedPath('mine.json', { DB_LEARNED_PATH: 'x' }, here), { path: 'mine.json', why: '--learned', shared: false },
    'a one-off book given by hand does not take in this computer\'s old one');
});

test('two computers saving one book keep each other\'s answers; the newer answer for a term wins', () => {
  const dir = mkdtempSync(join(tmpdir(), 'shared-book-'));
  const path = join(dir, 'learned-prices.json');
  const finding = HISTORY.findings[0]! as Parameters<LearnedStore['remember']>[1]['finding'];
  const entry = (job: string) => ({ fromJob: job, targetName: 'Flooring - Sub', unit: 'Square Foot', finding });

  // Both computers open the same (empty) book.
  const work = LearnedStore.load(path, { now: () => T0 });
  const laptop = LearnedStore.load(path, { now: later(1) });
  laptop.remember(['epoxy'], entry('laptop run'));
  laptop.rememberFile({ id: 'fQuote', name: 'q.pdf', size: 1 }, 'Myers', RHINO_READING as never);
  laptop.save(path);
  // The work computer learned "epoxy" a day earlier and "insulation" too, and saves after the laptop.
  work.remember(['epoxy', 'insulation'], entry('work run'));
  work.save(path);

  const back = LearnedStore.load(path, { now: later(2) });
  assert.equal(back.forTerm('epoxy')[0]?.fromJob, 'laptop run', 'the newer answer wins');
  assert.equal(back.forTerm('insulation')[0]?.fromJob, 'work run');
  assert.equal(back.files.get('fQuote')?.jobName, 'Myers', 'the laptop\'s quote reading is kept');
  assert.deepEqual(readdirSync(dir), ['learned-prices.json'], 'written through a temporary file, nothing left behind');

  // A computer's old book merged into the shared one takes only what is missing or newer.
  const old = new LearnedStore([], { now: () => new Date('2026-09-01T00:00:00Z') });
  old.remember(['epoxy', 'skim'], entry('old book'));
  assert.deepEqual(back.merge(old), { entries: 1, files: 0 });
  assert.equal(back.forTerm('epoxy')[0]?.fromJob, 'laptop run');
  assert.equal(back.forTerm('skim')[0]?.fromJob, 'old book');
});

// ---- 25-0000, 2026-10-02: three lessons, kept for every estimate ---------------------------

test('lesson 1: an answer belongs to the line it was found for, and only the past-work facts are kept', async () => {
  const store = new LearnedStore([], { now: () => T0 });
  const mud = {
    ...HISTORY.findings[1]!, target: { kind: 'line' as const, id: 'mud' }, match: 'match' as const, suggestedUnitCost: 55,
    summary: 'DB\'s crew has taped and mudded drywall at $52.50–$55/hr.',
    thisJob: '24 hrs for 606 SF is on the high side.',
  } as Parameters<LearnedStore['remember']>[1]['finding'];
  store.remember(['drywall'], { fromJob: '25-0000', targetName: 'Drywall Mud Labor', unit: 'Hours', finding: mud });

  assert.equal(store.lookup(['drywall'], { kind: 'line', name: 'Drywall Brd- Labor' }), null, 'the hanging line is not handed the taping answer');
  assert.equal(store.lookup(['drywall'], { kind: 'line', name: 'drywall mud labor' })?.targetName, 'Drywall Mud Labor', 'the same line, however it is cased');
  assert.equal(store.lookup(['drywall'], { kind: 'gap', name: 'Patch drywall' })?.targetName, 'Drywall Mud Labor', 'a gap takes the newest for its word');
  assert.equal(store.forTerm('drywall')[0]!.finding.thisJob, '', 'what it meant for that job is not kept');

  // Answers kept the old way (one per word, with that job's remarks) are set aside and searched again.
  const dir = mkdtempSync(join(tmpdir(), 'old-book-'));
  const path = join(dir, 'learned-prices.json');
  const old = { term: 'drywall', learnedAt: T0.toISOString(), fromJob: '25-0000', targetName: 'Drywall Mud Labor', unit: 'Hours', finding: mud };
  writeFileSync(path, JSON.stringify({ version: 1, entries: { drywall: old } }));
  const back = LearnedStore.load(path, { now: () => T0 });
  assert.equal(back.dropped, 1);
  assert.equal(back.entries.size, 0);
});

test('lesson 1: "for this job" shows on the draft it was read for, never on a later job from the book', async () => {
  const store = new LearnedStore([], { now: () => T0 });
  const withNote = { findings: PRICED.findings.map((f) => f.target.id === '22PLhsr2Yx55' ? { ...f, thisJob: 'This slab is painted and needs grinding.' } : f) };
  const d1 = await draftEstimate(fx.evidence, fx.index, load, fake([DRAFT, withNote]), {
    templateIds: [FIN, GR], history: { search: async () => report(true), margins: MARGINS, learned: store },
  });
  assert.match(draftSteps(d1), /For this job: This slab is painted and needs grinding\./);
  const d2 = await draftEstimate(fx.evidence, fx.index, load, fake([{ ...DRAFT, gaps: [DRAFT.gaps[0]!] }]), {
    templateIds: [FIN, GR], history: { search: async () => report(true), margins: MARGINS, learned: store },
  });
  assert.equal(d2.lines.find((l) => l.name === 'Flooring - Sub')!.history?.origin.kind, 'learned');
  assert.doesNotMatch(draftSteps(d2), /For this job/);
  assert.match(HISTORY_SYSTEM, /never carried to another job/);
});

test('lesson 2: a general line borrowed from another trade\'s section is flagged; an option line or the work\'s own line is not', () => {
  const l = (where: string, name: string): CheckLine => ({ where, name, costType: 'Labor', quantity: 8, unit: 'Hours', cost: 440 });
  const roof = 'X-Division 07 Thermal & Moisture › THERMAL & MOISTURE › Roofing › DB (DONE BETTER) Duration Shingle System';
  const flags = borrowedLines([
    l(roof, 'Crew Labor'),
    l('X-Division 07 Thermal & Moisture › THERMAL & MOISTURE › Siding', 'Insulation - Batt'),
    l('CUSTOMER OPTIONS › Move contents › Move contents', 'Crew Labor'),
    l('X-Division 01 General Requirements › GENERAL REQUIREMENTS › Project/Site Management', 'Project Management'),
  ], 'CUSTOMER OPTIONS');
  assert.equal(flags.length, 1);
  assert.equal(flags[0]!.kind, 'section');
  assert.match(flags[0]!.text, /"Crew Labor" \(8 Hours\) is the only line kept under .*Roofing.*: on the job it sits in that Roofing section/);
  assert.equal(borrowedLines([l(roof, 'Crew Labor'), l(roof, 'OC Duration Shingles')], 'CUSTOMER OPTIONS').length, 0, 'on a roof job it is roofing work');
  assert.match(DRAFT_SYSTEM, /16\. A line belongs to the section it sits in/);
});

test('lesson 3: an open item is a choice, so "pick one" stays pick one, and a lonely choice is flagged', async () => {
  const lvp = { lineId: '22PLhsr2Yx55', quantity: 706, basis: 'LVP', purpose: '', evidence: ev('LVP'), option: 'Flooring — LVP', confidence: 'medium', lookBack: [] };
  const epoxy = { scope: 'Epoxy floor coating by sub', purpose: '', why: 'no template line', unit: 'Square Foot', quantity: 706, costType: 'Subcontractor', basis: 'the floor', evidence: ev('epoxy'), lookBack: [], option: 'Flooring — Epoxy' };
  const both = await draftEstimate(fx.evidence, fx.index, load, fake([{ ...DRAFT, lines: [lvp], gaps: [epoxy] }]), { templateIds: [FIN, GR] });
  const flooring = both.totals.options.find((o) => o.group === 'Flooring')!;
  assert.equal(flooring.required, true, 'LVP or the epoxy open item: the customer picks one');
  assert.deepEqual(flooring.choices.map((c) => [c.name, c.open]), [['LVP', []], ['Epoxy', ['Epoxy floor coating by sub']]]);
  const steps = draftSteps(both);
  assert.match(steps, /Option "Flooring", one choice required:\n   LVP: .*\n   Epoxy: 1 open item not priced yet \("Epoxy floor coating by sub"\)/);
  assert.match(steps, /- "Flooring" \(in the phase of its first line\), one choice required: LVP: Flooring - Sub · Epoxy: "Epoxy floor coating by sub" \(open item, below\)/);
  assert.match(steps, /Flooring — Epoxy 0\.00 \(raise it by 8% of the open item's cost once it is priced\)/);
  assert.deepEqual(optionFlags(both.totals.options), []);

  const alone = await draftEstimate(fx.evidence, fx.index, load, fake([{ ...DRAFT, lines: [lvp], gaps: [] }]), { templateIds: [FIN, GR] });
  const flags = optionFlags(alone.totals.options);
  assert.equal(flags.length, 1);
  assert.match(flags[0]!.text, /"Flooring — LVP" is written as one of several choices, but "Flooring" has no other choice/);
  assert.ok(draftFlags(alone).some((f) => f.kind === 'option'), 'and it is in the box at the top of the page');
  assert.match(DRAFT_SYSTEM, /never write a choice that has neither lines nor a gap/);
});

// ---- 25-0000, 2026-10-02: install labor, and the contingency pinned to policy --------------

test('every kept material needs labor to install it in its choice; wainscot gets its own, never Trim Labor', () => {
  const panels: MaterialUse = { scope: 'Walls — Framed', name: 'Wainscoting', quantity: 29, unit: 'Each', sectionLabor: ['Trim Labor'] };
  const framed = (name: string, forWhat?: string): LaborUse => ({ scope: 'Walls — Framed', name, ...(forWhat ? { for: forWhat } : {}) });

  // The 2026-10-02 draft: panels kept, Trim Labor deleted, nothing to hang them.
  const bare = uninstalledMaterials([panels], [framed('Framing/Sheathing Labor'), framed('Drywall Brd- Labor')]);
  assert.equal(bare.length, 1);
  assert.equal(bare[0]!.severity, 'problem');
  assert.match(bare[0]!.text, /"Walls — Framed": "Wainscoting" \(29 Each\) has no labor to install it\. Wainscot gets its own labor line: add Wainscot Labor hours to this choice, once\./);
  // The run before: Trim Labor carried the panels. That is not wainscot labor.
  assert.match(uninstalledMaterials([panels], [framed('Trim Labor')])[0]!.text, /Trim Labor is for the trim, not the panels/);
  // Its own line covers it: an open item, or a catalog line found for it.
  assert.deepEqual(uninstalledMaterials([panels], [framed('Wainscot install labor', 'Wainscot install labor')]), []);
  assert.deepEqual(uninstalledMaterials([panels], [framed('Crew Labor', 'Labor to install the wainscot panels')]), []);
  // In another choice it does not count.
  assert.equal(uninstalledMaterials([panels], [{ scope: 'Walls — Concrete Paint', name: 'Wainscot install labor' }]).length, 1);

  // Other materials: their trade's labor, or the labor the template files beside them.
  const primer: MaterialUse = { scope: 'Walls — Framed', name: 'Primer', quantity: 2, unit: 'Gallons', sectionLabor: ['Paint Labor', 'Paint Labor - Sub'] };
  const batts: MaterialUse = { scope: 'Walls — Framed', name: 'Insulation - Batt', quantity: 909, unit: 'Square Foot', sectionLabor: ['Siding Labor', 'Insulation - Sub'] };
  const shingles: MaterialUse = { scope: 'base', name: 'OC Duration Shingles', quantity: 30, unit: 'Square', sectionLabor: [] };
  assert.deepEqual(uninstalledMaterials([primer, batts, shingles], [framed('Paint Labor'), framed('Insulation Labor')]), [], 'primer by the paint labor beside it; batts by insulation labor; no labor filed beside the shingles');
  const noPaint = uninstalledMaterials([primer], [framed('Drywall Brd- Labor')]);
  assert.match(noPaint[0]!.text, /"Walls — Framed": "Primer" \(2 Gallons\) is kept with no labor to install it; the template files "Paint Labor", "Paint Labor - Sub" beside it and none is kept here\./);

  assert.match(DRAFT_SYSTEM, /17\. Every material kept needs the labor that installs it/);
  assert.match(DRAFT_SYSTEM, /Trim Labor is trim .* and never wainscot panels/);
  assert.match(HISTORY_SYSTEM, /Wainscot install labor is Wainscot Labor: never match it to Trim Labor/);
  assert.match(DRAFT_SYSTEM, /keep Wainscot Labor \(Hours\) beside Wainscoting, under the same option/);
  assert.deepEqual(uninstalledMaterials([{ ...panels, sectionLabor: ['Wainscot Labor', 'Trim Labor'] }], [framed('Wainscot Labor')]), [], 'the catalog line, 2026-10-02');
});

test('the draft page flags a material kept with no labor in its choice', async () => {
  const mat = { lineId: '22PLCchBuFMU', quantity: 667, basis: 'board', purpose: '', evidence: ev('framed'), option: 'Walls — Framed', confidence: 'medium', lookBack: [] };
  const hang = { lineId: '22PLCchBuFMV', quantity: 12, basis: 'hang', purpose: '', evidence: ev('framed'), option: 'Walls — Framed', confidence: 'medium', lookBack: [] };
  const without = await draftEstimate(fx.evidence, fx.index, load, fake([{ ...DRAFT, lines: [mat], gaps: [] }]), { templateIds: [FIN, GR] });
  const flag = draftFlags(without).find((f) => f.kind === 'install');
  assert.match(flag!.text, /"Walls — Framed": "Drywall Brd- Mat" \(667 [A-Za-z ]+\) is kept with no labor to install it; the template files "Drywall Brd- Labor"/);
  const withLabor = await draftEstimate(fx.evidence, fx.index, load, fake([{ ...DRAFT, lines: [mat, hang], gaps: [] }]), { templateIds: [FIN, GR] });
  assert.equal(draftFlags(withLabor).filter((f) => f.kind === 'install').length, 0);
});

test('contingency is pinned to DB\'s policy: the highest rate any condition calls for, whatever number the model wrote', async () => {
  assert.equal(rateForConditions(['something-moves', 'older-home-hidden-conditions']), 10);
  assert.equal(rateForConditions(['stripped-to-substrate', 'something-moves']), 8);
  assert.equal(rateForConditions(['in-kind']), 5);
  assert.equal(rateForConditions([], 7), 8, 'with no condition named, the model\'s number, snapped');

  // 25-0000: walls come off (8) and the foundation is cracked, stained and peeling (10): 10, every time.
  const reply = { ...DRAFT, contingency: { rate: 8, why: 'Cracked, water-stained, peeling foundation walls.', conditions: ['stripped-to-substrate', 'older-home-hidden-conditions'] } };
  const d = await draftEstimate(fx.evidence, fx.index, load, fake([reply]), { templateIds: [FIN, GR] });
  assert.equal(d.contingency?.rate, 10);
  assert.match(draftSteps(d), /Contingency at 10% \(finish stripped to the substrate; older home, more hidden conditions likely\): Cracked, water-stained, peeling foundation walls\./);
  assert.deepEqual((draftJson(d) as { contingency: { conditions: string[] } }).contingency.conditions, ['stripped-to-substrate', 'older-home-hidden-conditions']);
  assert.match(DRAFT_SYSTEM, /A basement with cracked, stained, peeling foundation walls is older-home-hidden-conditions/);
});
