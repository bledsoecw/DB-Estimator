/**
 * The rep's second pass: the direction goes to both calls as a decision,
 * the earlier pass is kept, and the page says what moved.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import type { Template } from '../src/draft/templates.ts';
import { draftEstimate, type DraftFixture } from '../src/draft/draft.ts';
import { draftJson, draftSteps, renderDraft } from '../src/draft/render.ts';
import {
  addDirection, changesText, diffDrafts, hasChanges, previousFromJson, reviseCommand, revisionText,
} from '../src/draft/revise.ts';
import { parseDraftArgs } from '../src/draft-cli.ts';
import type { StructuredArgs, StructuredCall } from '../src/draft/model.ts';

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
const texts = (args: StructuredArgs<unknown>): string[] => args.content.map((c) => (c.type === 'text' ? c.text : '')).filter(Boolean);

const ev = [{ source: 'Robert Switzer, 2026-07-23', quote: 'skimming the concrete walls' }];
const line = (lineId: string, quantity: number, basis: string, option: string | null = null) =>
  ({ lineId, quantity, basis, evidence: ev, option, confidence: 'medium', lookBack: [] as string[] });

const PASS1 = {
  summary: 'Basement refresh: skim and paint the walls, new floor.',
  scopeOfWork: 'Skim-coat and paint the basement walls.',
  lines: [
    line('22PLCchBuFMa', 6, 'two coats on 909 SF'),
    line('22PLCchBuFMW', 909, 'skim the concrete'),
    line('22PLCchBuFMX', 16, 'skim two coats'),
    line('22PLCchBuFMQ', 706, 'floor area', 'Flooring — LVP'),
  ],
  gaps: [{ scope: 'Move basement contents', why: 'no line', unit: 'Hours', quantity: 4, costType: 'Labor', basis: 'two people', evidence: ev, lookBack: [], option: null }],
  questions: [{ question: 'Skim the walls or paint over them?', why: 'the note is tentative' }],
  contingency: { rate: 8, why: 'Walls stripped to the concrete.' },
};
const DIRECTION = 'Forget the skim coating. Go with a mold-resistant concrete paint, or an option to frame out false walls 6-8" off the foundation with plastic, drywall above wainscot, batt insulation, painted.';
const PASS2 = {
  summary: 'Basement refresh: mold-resistant paint on the block, or framed false walls as an option.',
  scopeOfWork: 'Paint the block with a mold-resistant concrete paint. Option: framed false walls.',
  lines: [
    line('22PLCchBuFMa', 8, "per the rep's direction: mold-resistant concrete paint, two coats on rough block"),
    line('22PLhtLxcz9S', 24, "per the rep's direction: roll two coats on 909 SF of block"),
    line('22PLCchBuFMQ', 706, 'floor area', 'Flooring — LVP'),
  ],
  gaps: [],
  questions: [],
  contingency: { rate: 10, why: 'Moisture on the block and a framed wall against it.' },
};
const PICK = { summary: 'Basement refresh.', picks: [{ templateId: FIN, role: 'primary', why: 'paint' }, { templateId: GR, role: 'supplement', why: 'PM' }], noFit: null };
const T0 = new Date('2026-09-30T18:00:00Z');

test('the last pass is read back from its JSON, and the direction is added on top of what was said before', async () => {
  const d1 = await draftEstimate(fx.evidence, fx.index, load, fake([PASS1]), { templateIds: [FIN, GR] });
  assert.equal(d1.revision, null);
  const json1 = draftJson(d1) as { revision: { pass: number; directions: unknown[]; changes: null } };
  assert.deepEqual(json1.revision, { pass: 1, directions: [], changes: null });

  const previous = previousFromJson(json1);
  assert.equal(previous.pass, 1);
  assert.deepEqual(previous.templates.map((t) => t.id), [FIN, GR]);
  assert.deepEqual(previous.lines.map((l) => [l.lineId, l.name, l.quantity, l.unit, l.option]), [
    ['22PLCchBuFMa', 'Paint', 6, 'Gallons', null],
    ['22PLCchBuFMW', 'Drywall Mud Mat', 909, 'Square Foot', null],
    ['22PLCchBuFMX', 'Drywall Mud Labor', 16, 'Hours', null],
    ['22PLCchBuFMQ', 'Flooring', 706, 'Square Foot', 'Flooring — LVP'],
  ]);
  assert.deepEqual(previous.gaps, [{ scope: 'Move basement contents', costType: 'Labor' }]);
  assert.deepEqual(previous.questions, ['Skim the walls or paint over them?']);
  assert.equal(previous.contingencyRate, 8);

  const r = addDirection(previous, `  ${DIRECTION}\r\n`, () => T0);
  assert.deepEqual(r.directions, [{ pass: 1, at: '2026-09-30T18:00:00.000Z', text: DIRECTION }]);
  assert.throws(() => addDirection(previous, '   '), /the direction is empty/);

  const text = revisionText(r);
  assert.match(text, /^# The rep has read pass 1 and given direction\n\n\[after pass 1, 2026-09-30\]\nForget the skim coating\./);
  assert.match(text, /This is a decision made by the rep, who was on site/);
  assert.match(text, /## Pass 1 kept these lines\nTemplates: X-Division 09 Finishes \(22PLCZU3cbqS\); X-Division 01 General Requirements \(22PF3gnGCuiB\)\n- 22PLCchBuFMa · Paint · 6 Gallons · X-Division 09 Finishes\n- 22PLCchBuFMW · Drywall Mud Mat · 909 Square Foot · X-Division 09 Finishes/);
  assert.match(text, /- 22PLCchBuFMQ · Flooring · 706 Square Foot · option: Flooring — LVP · X-Division 09 Finishes/);
  assert.match(text, /## Pass 1 flagged these as having no template line\n- Move basement contents \(Labor\)/);
  assert.match(text, /## Pass 1 asked\n- Skim the walls or paint over them\?\nA question the direction answers is answered: drop it\./);
  assert.match(text, /Pass 1 carried contingency at 8%\./);

  // An empty or foreign JSON still reads, as a blank pass 1.
  const blank = previousFromJson({});
  assert.equal(blank.pass, 1);
  assert.deepEqual(blank.lines, []);
  assert.equal(blank.contingencyRate, null);
});

test('the second pass sends the direction to both calls, follows it, and the page says what moved', async () => {
  const d1 = await draftEstimate(fx.evidence, fx.index, load, fake([PASS1]), { templateIds: [FIN, GR] });
  const revision = addDirection(previousFromJson(draftJson(d1)), DIRECTION, () => T0);

  // With the picker: the direction sits after the evidence and before the template list, and the ask says to follow it.
  const picked = fake([PICK, PASS2]);
  const d2 = await draftEstimate(fx.evidence, fx.index, load, picked, { revision });
  const pickTexts = texts(picked.calls[0]!);
  assert.equal(pickTexts.findIndex((t) => t.startsWith('# The rep has read pass 1')), 1, 'right after the job');
  assert.ok(pickTexts.findIndex((t) => t.startsWith('# Budget templates')) > 1);
  assert.match(pickTexts[pickTexts.length - 1]!, /Follow the rep's direction above\./);
  const draftTexts = texts(picked.calls[1]!);
  assert.equal(draftTexts.findIndex((t) => t.startsWith('# The rep has read pass 1')), 1);
  assert.ok(draftTexts.findIndex((t) => t.startsWith('# Template:')) > 1);
  assert.match(draftTexts[draftTexts.length - 1]!, /Follow the rep's direction above as a decision, and keep what it does not change\./);

  assert.equal(d2.revision?.pass, 2);
  assert.deepEqual(d2.revision?.directions.map((x) => x.text), [DIRECTION]);
  const c = d2.revision!.changes;
  assert.deepEqual(c.templatesAdded, []);
  assert.deepEqual(c.linesAdded.map((l) => [l.name, l.quantity, l.unit]), [['Paint Labor', 24, 'Hours']]);
  assert.deepEqual(c.linesRemoved.map((l) => l.name), ['Drywall Mud Mat', 'Drywall Mud Labor']);
  assert.deepEqual(c.quantityChanged, [{ name: 'Paint', from: 6, to: 8, unit: 'Gallons' }]);
  assert.deepEqual(c.optionChanged, []);
  assert.deepEqual(c.gapsRemoved, ['Move basement contents']);
  assert.deepEqual(c.gapsAdded, []);
  assert.deepEqual(c.contingencyRate, { from: 8, to: 10 });
  assert.equal(hasChanges(c), true);
  assert.deepEqual(changesText(c), [
    'Lines added: Paint Labor 24 Hours',
    'Lines dropped: Drywall Mud Mat 909 Square Foot; Drywall Mud Labor 16 Hours',
    'Quantities changed: Paint 6 → 8 Gallons',
    'Flagged items resolved: Move basement contents',
    'Contingency 8% → 10%',
  ]);

  const steps = draftSteps(d2);
  assert.match(steps, /^261323 Haag_Remodel — budget draft\nPass 2\. The rep's direction after pass 1: Forget the skim coating\. Go with a mold-resistant concrete paint, or an option to frame out false walls[^\n]*\nChanged since pass 1:\n   - Lines added: Paint Labor 24 Hours\n   - Lines dropped: Drywall Mud Mat 909 Square Foot; Drywall Mud Labor 16 Hours\n   - Quantities changed: Paint 6 → 8 Gallons\n   - Flagged items resolved: Move basement contents\n   - Contingency 8% → 10%\n/);
  assert.match(steps, /To change it, say what to change and rerun: npm run draft -- 22PbLhMqY7tC --revise "what to change" — the next pass follows that as a decision and keeps the rest\.$/);
  const html = renderDraft(fx.evidence, d2);
  assert.match(html, /<h2>Pass 2 &middot; the rep's direction<\/h2>\s*<blockquote><span class="when">after pass 1, 2026-09-30<\/span>Forget the skim coating\./);
  assert.match(html, /<li>Lines dropped: Drywall Mud Mat 909 Square Foot; Drywall Mud Labor 16 Hours<\/li>/);
  assert.match(html, /<textarea id="direction"/);
  assert.match(html, /<pre id="revise-cmd">npm run draft -- 22PbLhMqY7tC --revise &quot;what to change&quot;<\/pre>/);
  const json2 = draftJson(d2) as { revision: { pass: number; directions: { text: string }[]; changes: { linesRemoved: unknown[] } } };
  assert.equal(json2.revision.pass, 2);
  assert.equal(json2.revision.directions[0]!.text, DIRECTION);
  assert.equal(json2.revision.changes.linesRemoved.length, 2);

  // A third pass reads pass 2 back and carries both directions.
  const r3 = addDirection(previousFromJson(json2), 'Make the false walls the base scope, not an option.', () => T0);
  assert.equal(r3.previous.pass, 2);
  assert.deepEqual(r3.directions.map((x) => x.pass), [1, 2]);
  assert.match(revisionText(r3), /\[after pass 1, 2026-09-30\]\nForget the skim coating[\s\S]*\[after pass 2, 2026-09-30\]\nMake the false walls the base scope/);

  // The same reply as before means nothing moved, and the page says so.
  const same = await draftEstimate(fx.evidence, fx.index, load, fake([PASS1]), { templateIds: [FIN, GR], revision: addDirection(previousFromJson(draftJson(d1)), 'Looks right.', () => T0) });
  assert.equal(hasChanges(same.revision!.changes), false);
  assert.deepEqual(changesText(same.revision!.changes), ['Nothing changed from the last pass.']);
  // The pass-1 page has the box too, with no revision section.
  const html1 = renderDraft(fx.evidence, d1);
  assert.doesNotMatch(html1, /the rep's direction<\/h2>/);
  assert.match(html1, /<textarea id="direction"/);
});

test('a gap whose wording only gained or lost a trailing "(… option)" is the same gap', async () => {
  const d1 = await draftEstimate(fx.evidence, fx.index, load, fake([{ ...PASS1, gaps: [{ ...PASS1.gaps[0]!, scope: 'Move basement contents (Framed walls option)' }] }]), { templateIds: [FIN, GR] });
  const prev = previousFromJson(draftJson(d1));
  const d2 = await draftEstimate(fx.evidence, fx.index, load, fake([PASS1]), { templateIds: [FIN, GR] });
  const c = diffDrafts(prev, d2);
  assert.deepEqual([c.gapsAdded, c.gapsRemoved], [[], []]);
});

test('diffDrafts notices an option moving and a template being dropped', async () => {
  const d1 = await draftEstimate(fx.evidence, fx.index, load, fake([PASS1]), { templateIds: [FIN, GR] });
  const prev = previousFromJson(draftJson(d1));
  const moved = { ...PASS1, lines: [line('22PLCchBuFMa', 6, 'same'), line('22PLCchBuFMQ', 706, 'now base scope', null)] };
  const d2 = await draftEstimate(fx.evidence, fx.index, load, fake([moved]), { templateIds: [FIN] });
  const c = diffDrafts(prev, d2);
  assert.deepEqual(c.templatesRemoved, ['X-Division 01 General Requirements']);
  assert.deepEqual(c.optionChanged, [{ name: 'Flooring', from: 'Flooring — LVP', to: null }]);
  assert.match(changesText(c).join('\n'), /Templates no longer used: X-Division 01 General Requirements\n.*\nOptions changed: Flooring Flooring — LVP → base/);
});

test('the rerun command puts the direction on one line inside double quotes; the flags parse', () => {
  assert.equal(reviseCommand('261323', 'forget the "skim"\n  coat  '), `npm run draft -- 261323 --revise "forget the 'skim' coat"`);
  assert.equal(parseDraftArgs(['261323', '--revise', 'x y']).revise, 'x y');
  assert.equal(parseDraftArgs(['261323', '--revise-file', 'notes.txt']).reviseFile, 'notes.txt');
  assert.equal(parseDraftArgs(['261323']).revise, null);
  assert.throws(() => parseDraftArgs(['261323', '--revise']), /needs the direction in quotes/);
  assert.throws(() => parseDraftArgs(['261323', '--revise', '--dry-run']), /needs the direction in quotes/);
  assert.throws(() => parseDraftArgs(['261323', '--revise', 'x', '--revise-file', 'y']), /not both/);
});
