/**
 * The scope review, offline.
 *
 * The model call is behind an interface, so everything around it — which
 * files go, what the model is shown, what comes back and how it lands on the
 * page — is tested here without a key and without spending anything. The
 * prompt itself can only be judged by Kristen; these tests hold the plumbing.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { DEFAULT_LIMITS, selectFiles, type ScopeFile, type ScopePacket } from '../src/scope/packet.ts';
import { ReviewSchema, buildUserContent, packetText } from '../src/scope/prompt.ts';
import { costOf, estimateTokens, reviewScope, toFindings, type ModelCall } from '../src/scope/review.ts';
import { parseScopeArgs } from '../src/scope-cli.ts';
import { fromFixture } from '../src/domain.ts';
import { audit } from '../src/rules/index.ts';
import { renderReport } from '../src/report.ts';
import type { AuditFixture } from '../src/jobtread/types.ts';

function file(over: Partial<ScopeFile> & { name: string }): ScopeFile {
  return {
    id: over.name,
    type: 'image/jpeg',
    size: 200_000,
    createdAt: '2026-08-01T12:00:00.000Z',
    url: `https://cdn.example/${encodeURIComponent(over.name)}`,
    description: null,
    ...over,
  };
}

function packet(over: Partial<ScopePacket> = {}): ScopePacket {
  const quote = file({ name: 'NBR Quote #9041.pdf', type: 'application/pdf', size: 4_000 });
  const photo = file({ name: 'CompanyCam 1', createdAt: '2026-07-01T00:00:00.000Z' });
  return {
    documentId: 'doc1',
    documentName: 'Estimate',
    jobId: 'job1',
    jobName: '261209 Hunter_Bathroom',
    jobType: 'Construction',
    projectType: 'C-Bathrooms',
    jobDescription: 'Customer would like bathroom remodel',
    issueDate: '2026-08-28',
    lines: [
      { id: 'l1', name: 'Demolition', description: 'Includes removal of:\n- toilet\n- vanity', quantity: 16, unit: 'Hours', unitCost: 55, unitPrice: 100, price: 1600, group: 'Phase 1 › Demolition' },
      { id: 'l2', name: 'Sales On-Site Support', description: null, quantity: null, unit: 'Hours', unitCost: 0, unitPrice: 0, price: 0, group: 'Phase 1 › Project/Site Management' },
      { id: 'l3', name: 'Vanity', description: "Designer's Image Winston 18-5/8\"W", quantity: 1, unit: 'Each', unitCost: 300, unitPrice: 435, price: 435, group: 'Phase 3 › Cabinetry' },
    ],
    comments: [
      { at: '2026-07-02T19:16:37.936Z', who: 'Robert Switzer', message: 'Full gut remodel: new fan, new vanity, new ceiling fan', fromEmail: false },
      { at: '2026-08-19T16:20:49.121Z', who: 'Harry Roby', message: 'The Virtuoso Collection is no longer available', fromEmail: true },
    ],
    included: [quote, photo],
    excluded: [{ file: file({ name: 'Home Depot receipt.pdf', type: 'application/pdf', createdAt: '2026-09-09T00:00:00.000Z' }), reason: 'uploaded after the estimate was issued (2026-09-09)' }],
    attachments: [
      { file: quote, bytes: new Uint8Array([37, 80, 68, 70]) }, // %PDF
      { file: photo, bytes: new Uint8Array([255, 216, 255]) },
    ],
    failed: [],
    ...over,
  };
}

// ---- which files go ----------------------------------------------------------

test('files uploaded after the estimate was issued are not evidence', () => {
  const files = [
    file({ name: 'quote.pdf', type: 'application/pdf', createdAt: '2026-08-24T19:20:54.701Z' }),
    file({ name: 'same-day.jpg', createdAt: '2026-08-28T23:10:00.000Z' }),
    file({ name: 'receipt.pdf', type: 'application/pdf', createdAt: '2026-09-09T10:00:00.000Z' }),
  ];
  const { included, excluded } = selectFiles(files, '2026-08-28');
  assert.deepEqual(included.map((f) => f.name), ['quote.pdf', 'same-day.jpg']);
  assert.equal(excluded.length, 1);
  assert.match(excluded[0]!.reason, /after the estimate was issued/);

  // A draft has no issue date and nothing is cut off.
  assert.equal(selectFiles(files, null).included.length, 3);
});

test('duplicates, photo reports, oddities and oversize files are left out, each with a reason', () => {
  const files = [
    file({ name: 'NBR Quote #9041', type: 'application/pdf', size: 413_518 }),
    file({ name: 'NBR Quote #9041', type: 'application/pdf', size: 413_518 }), // uploaded twice
    file({ name: '261209 Bill Hunter Bathroom Remodel_companycam_report.pdf', type: 'application/pdf', size: 1_740_729 }),
    file({ name: 'notes.docx', type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' }),
    file({ name: 'huge.pdf', type: 'application/pdf', size: 50 * 1024 * 1024 }),
    file({ name: 'CompanyCam 1' }),
  ];
  const { included, excluded } = selectFiles(files, null);
  assert.deepEqual(included.map((f) => f.name), ['NBR Quote #9041', 'CompanyCam 1']);
  const reasons = Object.fromEntries(excluded.map((e) => [e.file.name, e.reason]));
  assert.match(reasons['NBR Quote #9041']!, /duplicate/);
  assert.match(reasons['261209 Bill Hunter Bathroom Remodel_companycam_report.pdf']!, /photo report/);
  assert.match(reasons['notes.docx']!, /not a photo or PDF/);
  assert.match(reasons['huge.pdf']!, /larger than/);
});

test('photos are capped at the earliest N and quotes take the size budget first', () => {
  const photos = Array.from({ length: 6 }, (_, i) =>
    file({ name: `CompanyCam ${i}`, createdAt: `2026-07-0${i + 1}T00:00:00.000Z`, size: 1_000_000 }),
  );
  const quote = file({ name: 'quote.pdf', type: 'application/pdf', size: 1_000_000, createdAt: '2026-08-01T00:00:00.000Z' });

  // The size budget binds: the quote goes first although it was uploaded
  // last, then the earliest photos until the budget is spent.
  const tight = selectFiles([...photos, quote], null, { ...DEFAULT_LIMITS, maxTotalBytes: 3_500_000 });
  assert.deepEqual(tight.included.map((f) => f.name), ['quote.pdf', 'CompanyCam 0', 'CompanyCam 1']);
  assert.equal(tight.excluded.length, 4);
  assert.ok(tight.excluded.every((e) => /budget/.test(e.reason)), 'the budget cap did not explain itself');

  // The photo cap binds: the earliest three, and the rest say why.
  const capped = selectFiles([...photos, quote], null, { ...DEFAULT_LIMITS, maxImages: 3 });
  assert.deepEqual(capped.included.map((f) => f.name), ['quote.pdf', 'CompanyCam 0', 'CompanyCam 1', 'CompanyCam 2']);
  assert.equal(capped.excluded.length, 3);
  assert.ok(capped.excluded.every((e) => /more than 3 photos/.test(e.reason)));
});

// ---- what the model is shown -----------------------------------------------------

test('the packet text carries the job, the conversation in order, and every line with its description', () => {
  const text = packetText(packet());
  assert.match(text, /# Job: 261209 Hunter_Bathroom/);
  assert.match(text, /Project type: C-Bathrooms/);
  assert.match(text, /issued 2026-08-28/);
  assert.ok(text.indexOf('Robert Switzer') < text.indexOf('Harry Roby'), 'comments out of order');
  assert.match(text, /\[2026-08-19\] Harry Roby \(by email\)/);
  assert.match(text, /## Phase 1 › Demolition\n- Demolition — 16 Hours; unit cost \$55, unit price \$100, line total \$1600/);
  assert.match(text, /\n  Includes removal of:\n  - toilet\n  - vanity/, 'the description is indented under its line');
  assert.match(text, /Sales On-Site Support — quantity blank/);
  assert.match(text, /Files on the job that were not sent:\n- Home Depot receipt.pdf: uploaded after/);
});

test('the user turn is text, then each file introduced by name, then the ask', () => {
  const blocks = buildUserContent(packet());
  assert.equal(blocks[0]!.type, 'text');
  const doc = blocks.find((b) => b.type === 'document');
  assert.ok(doc && doc.type === 'document', 'no document block for the PDF');
  assert.equal(doc.title, 'NBR Quote #9041.pdf');
  assert.equal(doc.source.type, 'base64');
  if (doc.source.type === 'base64') {
    assert.equal(doc.source.media_type, 'application/pdf');
    assert.equal(Buffer.from(doc.source.data, 'base64').toString('latin1'), '%PDF');
  }
  const img = blocks.find((b) => b.type === 'image');
  assert.ok(img && img.type === 'image', 'no image block for the photo');
  if (img.source.type === 'base64') assert.equal(img.source.media_type, 'image/jpeg');
  // Each attachment is introduced by a text label right before it.
  const i = blocks.indexOf(doc);
  assert.equal(blocks[i - 1]!.type, 'text');
  const last = blocks[blocks.length - 1]!;
  assert.ok(last.type === 'text' && /Review the estimate/.test(last.text));
});

// ---- what comes back ----------------------------------------------------------------

const reply = {
  summary: 'A full gut of a small bathroom: new shower, vanity, toilet, drywall, floor, fan.',
  findings: [
    {
      kind: 'missing',
      title: 'No ceiling fan on the estimate',
      detail: 'The discovery notes list a new ceiling fan as well as the exhaust fan; only the exhaust fan has a line.',
      evidence: [{ source: 'comment, Robert Switzer, 2026-07-02', quote: 'new fan, new vanity, new ceiling fan' }],
      lines: ['Bathroom Fan'],
      suggestion: 'Confirm with the rep whether "ceiling fan" meant the exhaust fan.',
      confidence: 'medium',
    },
    {
      kind: 'vendor',
      title: 'Cabinet pull on the estimate is the discontinued one',
      detail: 'Hardware Unlimited says the Virtuoso collection is no longer available; the estimate still names it.',
      evidence: [{ source: 'email, Harry Roby, 2026-08-19', quote: 'The Virtuoso Collection is no longer available' }],
      lines: ['Cabinet Knob/Pull'],
      suggestion: '',
      confidence: 'high',
    },
  ],
};

const fakeCall = (parsed: unknown, stopReason = 'end_turn'): ModelCall => async () => ({
  parsed,
  stopReason,
  usage: { input: 50_000, output: 2_000, cacheRead: 0, cacheWrite: 0 },
});

test('a review becomes findings the report can judge, with the evidence as rows and the cost worked out', async () => {
  const result = await reviewScope(packet(), fakeCall(reply));
  assert.equal(result.findings.length, 2);
  const [missing, vendor] = result.findings;
  assert.equal(missing!.rule, 'scope.missing');
  assert.equal(missing!.severity, 'data', 'a scope finding must be an ask, not context');
  assert.match(missing!.detail, /Confirm with the rep/);
  assert.match(missing!.detail, /medium confidence/);
  assert.deepEqual(missing!.math![0], {
    label: 'comment, Robert Switzer, 2026-07-02',
    value: 'new fan, new vanity, new ceiling fan',
  });
  assert.equal(missing!.math![1]!.label, 'estimate lines');
  assert.equal(vendor!.rule, 'scope.vendor');
  assert.ok(!/undefined/.test(vendor!.detail), 'an empty suggestion leaked into the text');
  // $4 per million in, $20 per million out: 50k in + 2k out = $0.24.
  assert.equal(result.cost, 0.24);
  assert.equal(costOf('nobody-knows-this-model', result.usage), null);
});

test('a refusal, a cut-off reply, or a reply off the schema is an error, never a finding', async () => {
  await assert.rejects(reviewScope(packet(), fakeCall(reply, 'refusal')), /declined/);
  await assert.rejects(reviewScope(packet(), fakeCall(reply, 'max_tokens')), /cut off/);
  await assert.rejects(reviewScope(packet(), fakeCall({ findings: 'no' })), /did not fit the schema/);
  await assert.rejects(reviewScope(packet(), fakeCall(null)), /did not fit the schema/);
});

test('the schema takes exactly the four kinds', () => {
  assert.ok(ReviewSchema.safeParse(reply).success);
  const bad = { ...reply, findings: [{ ...reply.findings[0], kind: 'pricing' }] };
  assert.ok(!ReviewSchema.safeParse(bad).success, 'pricing is another tool\'s business');
});

// ---- on the page ---------------------------------------------------------------------

test('scope findings land on the approver page as their own kind, with the review noted in the footer', () => {
  const fixture = JSON.parse(
    readFileSync(new URL('./fixtures/jones-bath-kitchen.json', import.meta.url), 'utf8'),
  ) as AuditFixture;
  const input = fromFixture(fixture);
  const result = audit(input);
  const before = result.findings.filter((f) => f.severity !== 'info').length;
  result.findings.push(...toFindings(ReviewSchema.parse(reply)));

  const html = renderReport(input, result, { footnote: 'Scope review by claude-opus-5-5: 50,000 tokens in, $0.24.' });
  assert.match(html, new RegExp(`Needs you <span class="count">${before + 2}</span>`));
  assert.equal((html.match(/class="card sev-scope"/g) ?? []).length, 2);
  assert.match(html, /<div class="chip">Scope<\/div>/);
  assert.match(html, /No ceiling fan on the estimate/);
  assert.match(html, /comment, Robert Switzer, 2026-07-02/);
  assert.match(html, /Scope review by claude-opus-5-5/);
  // And each one can be judged where it is shown.
  const body = html.slice(0, html.indexOf('<script>'));
  assert.equal((body.match(/data-v="real"/g) ?? []).length, before + 2);
});

// ---- the command -------------------------------------------------------------------

test('the command takes a document id and the flags it documents', () => {
  assert.deepEqual(parseScopeArgs(['22PdLWZiQfH3']), {
    documentId: '22PdLWZiQfH3', dryRun: false, out: 'review', model: 'claude-opus-5-5',
  });
  assert.deepEqual(parseScopeArgs(['--dry-run', '22PdLWZiQfH3', '--out', 'tmp']), {
    documentId: '22PdLWZiQfH3', dryRun: true, out: 'tmp', model: 'claude-opus-5-5',
  });
  assert.throws(() => parseScopeArgs([]), /usage/);
  assert.throws(() => parseScopeArgs(['a', 'b']), /unexpected/);
  assert.throws(() => parseScopeArgs(['a', '--bogus']), /unknown flag/);
});

test('the dry-run estimate counts photos and PDF pages, not just text', () => {
  const p = packet();
  const withoutFiles = { ...p, attachments: [] };
  const text = packetText(p);
  assert.ok(estimateTokens(p, text) > estimateTokens(withoutFiles, text) + 3_000);
});
