/**
 * The contingency line: the policy rate, the template plan, the exact write,
 * and the write-path client that refuses everything it was not told to do.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ZERO, formatMoney, moneyFromString } from '../src/money.ts';
import type { Template, TemplateLine } from '../src/draft/templates.ts';
import { isContingencyLine, scopeLines } from '../src/draft/templates.ts';
import {
  CONTINGENCY_FORMULA, CONTINGENCY_GROUP, CONTINGENCY_LINE,
  chooseRate, contingencyAmount, contingencyItemMutation, contingencyLine, contingencyMutation, planContingency,
} from '../src/draft/contingency.ts';
import { contingencyStep, priceLines } from '../src/draft/draft.ts';
import { candidates, parseContingencyArgs, planText, verifyContingency } from '../src/contingency-cli.ts';
import { ALLOWED_MUTATIONS, JobTreadWriter, assertAllowed, writerFromEnv } from '../src/jobtread/writer.ts';

const IDS = { organizationCostItemId: 'item1', unitId: 'unitLS', costTypeId: 'ctOther', costCodeId: 'ccGR' };

function line(id: string, name: string, groupId: string, extra: Partial<TemplateLine> = {}): TemplateLine {
  return {
    id, name, description: null, unit: 'Each', costTypeName: 'Materials', costCodeName: 'General Requirements',
    groupId, position: 'm', isSpecification: false, quantity: null, quantityFormula: null,
    priced: { id: `p-${id}`, name, unitCost: 10, unitPrice: 14.5, costTypeName: 'Materials' },
    ...extra,
  };
}

/** A phased construction template, the shape of Bathroom Remodel. */
function phased(opts: { contingency?: boolean; noPhase4?: boolean } = {}): Template {
  const groups = [
    { id: 'scope', name: 'BATHROOM REMODEL', position: 'l', parentId: null, isSelection: false },
    { id: 'p1', name: 'Phase 1 - General Requirements', position: 'm', parentId: 'scope', isSelection: false },
    { id: 'p3', name: 'Phase 3 - Interiors', position: 'o', parentId: 'scope', isSelection: false },
    ...(opts.noPhase4 ? [] : [{ id: 'p4', name: 'Phase 4 - Finishes', position: 'p', parentId: 'scope', isSelection: false }]),
    { id: 'clock', name: 'CLOCK IN ITEMS', position: 'p', parentId: null, isSelection: false },
    ...(opts.contingency ? [{ id: 'p5', name: CONTINGENCY_GROUP, position: 'q', parentId: 'scope', isSelection: false }] : []),
  ];
  const lines = [
    line('demo', 'Demolition', 'p1', { unit: 'Hours', costTypeName: 'Labor' }),
    line('paint', 'Paint', 'p3'),
    line('sos', 'Sales On-Site Support', 'clock', { priced: { id: 'p-sos', name: 'Sales On-Site Support', unitCost: 0, unitPrice: 0, costTypeName: 'Labor' } }),
    ...(opts.contingency
      ? [line('cont', CONTINGENCY_LINE, 'p5', {
          unit: 'Lump Sum', costTypeName: 'Other', quantityFormula: CONTINGENCY_FORMULA,
          priced: { id: 'item1', name: CONTINGENCY_LINE, unitCost: 1, unitPrice: 1, costTypeName: 'Other' },
        })]
      : []),
  ];
  return { id: 'tpl', name: 'Bathroom Remodel', description: null, groups, lines };
}

test('the rate snaps to the policy: 5, 8 or 10, and 8 when the model said nothing usable', () => {
  assert.equal(chooseRate(null), 8);
  assert.equal(chooseRate(undefined), 8);
  assert.equal(chooseRate(Number.NaN), 8);
  assert.equal(chooseRate(5), 5);
  assert.equal(chooseRate(6), 5);
  assert.equal(chooseRate(7), 8);
  assert.equal(chooseRate(9), 8, 'a tie goes to the lower rate');
  assert.equal(chooseRate(12), 10);
  assert.equal(chooseRate(0), 5);
});

test('the amount is base × rate / 100 to the cent, and nothing on nothing', () => {
  assert.equal(formatMoney(contingencyAmount(moneyFromString('12345.67'), 8)), '$987.65');
  assert.equal(formatMoney(contingencyAmount(moneyFromString('12000'), 10)), '$1,200.00');
  assert.equal(formatMoney(contingencyAmount(moneyFromString('19413'), 5)), '$970.65');
  assert.equal(contingencyAmount(ZERO, 8), ZERO);
});

test('the contingency line is not scope: the model never sees it, the rep is never told to delete it', () => {
  const t = phased({ contingency: true });
  const cont = t.lines.find((l) => l.id === 'cont')!;
  assert.equal(isContingencyLine(t, cont), true);
  assert.equal(isContingencyLine(t, t.lines[0]!), false);
  assert.deepEqual(scopeLines(t).map((l) => l.id), ['demo', 'paint']);
  assert.equal(contingencyLine(t)?.id, 'cont');
  assert.equal(contingencyLine(phased()), null);

  // A model that names it anyway is told why it was not kept.
  const reply = {
    summary: '', scopeOfWork: '', gaps: [], questions: [], contingency: { rate: 8, why: '' },
    lines: [{ lineId: 'cont', quantity: 1, basis: '', evidence: [], option: null, confidence: 'high' as const, lookBack: [] }],
  };
  const { lines, rejected } = priceLines(reply, [t]);
  assert.equal(lines.length, 0);
  assert.match(rejected[0]!.reason, /set by the contingency step from the base cost, not kept by hand/);
});

test('the draft\'s contingency step: the snapped rate on the base cost, the template line when there is one, none for roofing', () => {
  const base = moneyFromString('5000');
  const withLine = contingencyStep({ jobType: 'Construction' }, { rate: 9, why: 'The tub moves.' }, base, [phased(), phased({ contingency: true })]);
  assert.equal(withLine?.rate, 8);
  assert.equal(withLine?.why, 'The tub moves.');
  assert.equal(formatMoney(withLine!.amount), '$400.00');
  assert.deepEqual(withLine?.line, { templateId: 'tpl', templateName: 'Bathroom Remodel', lineId: 'cont', group: ['BATHROOM REMODEL', CONTINGENCY_GROUP] });

  const byHand = contingencyStep({ jobType: null }, undefined, base, [phased()]);
  assert.equal(byHand?.rate, 8);
  assert.equal(byHand?.line, null);
  assert.equal(byHand?.why, '');

  assert.equal(contingencyStep({ jobType: 'Roofing' }, { rate: 5, why: '' }, base, [phased()]), null);
});

test('a template with a Phase 4 and no contingency gets the group after Phase 4; the others are left alone', () => {
  const create = planContingency(phased());
  assert.equal(create.action, 'create');
  assert.equal(create.parentGroupId, 'scope');
  assert.equal(create.phase4?.id, 'p4');
  assert.equal(create.reason, 'after "Phase 4 - Finishes"');

  const has = planContingency(phased({ contingency: true }));
  assert.equal(has.action, 'skip');
  assert.match(has.reason, /already has "Phase 5 - Contingency"/);

  const flat = planContingency(phased({ noPhase4: true }));
  assert.equal(flat.action, 'skip');
  assert.match(flat.reason, /no Phase 4 group/);

  assert.match(planText([create, has, flat]), /^\+ Bathroom Remodel \(tpl\): create — after "Phase 4 - Finishes"\n= .*\n= .*\n1 template to change, 2 left as they are\.$/);
});

test('the write is one createCostGroup beside Phase 4 with the line on the $1.00 item and the formula on quantity', () => {
  const m = contingencyMutation(planContingency(phased()), IDS) as {
    createCostGroup: { $: Record<string, unknown> & { lineItems: Record<string, unknown>[] }; createdCostGroup: unknown };
  };
  const $ = m.createCostGroup.$;
  assert.equal($['parentCostGroupId'], 'scope');
  assert.deepEqual($['positionAfter'], { type: 'costGroup', id: 'p4' });
  assert.equal($['name'], CONTINGENCY_GROUP);
  assert.equal($.lineItems.length, 1);
  const l = $.lineItems[0]!;
  assert.equal(l['_type'], 'costItem');
  assert.equal(l['name'], CONTINGENCY_LINE);
  assert.equal(l['organizationCostItemId'], 'item1');
  assert.equal(l['quantityFormula'], '{Contingency Base} * {Contingency Rate} / 100');
  assert.equal(l['unitCost'], undefined, 'the price comes from the item, as on every template line');
  assert.ok(m.createCostGroup.createdCostGroup, 'the write reads back what it made');
  assertAllowed(m);

  const item = contingencyItemMutation('org1', IDS) as { createCostItem: { $: Record<string, unknown> } };
  assert.equal(item.createCostItem.$['organizationId'], 'org1');
  assert.equal(item.createCostItem.$['unitCost'], 1);
  assert.equal(item.createCostItem.$['unitPrice'], 1);
  assert.throws(() => contingencyMutation(planContingency(phased({ contingency: true })), IDS), /nothing to create/);
});

test('after the write, the template is read back and the group must sit after Phase 4 with the line intact', () => {
  assert.deepEqual(verifyContingency(phased({ contingency: true }), 'item1').ok, true);
  assert.match(verifyContingency(phased(), 'item1').reason, /no "Phase 5 - Contingency" group/);
  assert.match(verifyContingency(phased({ contingency: true }), 'other').reason, /points at item1, not the catalog item/);

  const early = phased({ contingency: true });
  early.groups.find((g) => g.id === 'p5')!.position = 'a';
  assert.match(verifyContingency(early, 'item1').reason, /not after Phase 4/);

  const wrongFormula = phased({ contingency: true });
  wrongFormula.lines.find((l) => l.id === 'cont')!.quantityFormula = '{Area}';
  assert.match(verifyContingency(wrongFormula, 'item1').reason, /the formula is "\{Area\}"/);
});

test('the CLI reads only the templates with a Phase 4, or the ones named', () => {
  const index = [
    { id: 'a', name: 'Bathroom Remodel', description: null, groups: ['Phase 1 - General Requirements', 'Phase 4 - Finishes'], lineCount: 3 },
    { id: 'b', name: 'Siding', description: null, groups: ['SIDING SCOPE'], lineCount: 3 },
  ];
  assert.deepEqual(candidates(index, []).map((t) => t.id), ['a']);
  assert.deepEqual(candidates(index, ['b']).map((t) => t.id), ['b']);
  assert.throws(() => candidates(index, ['zzz']), /not a budget template/);
  assert.deepEqual(parseContingencyArgs([]), { apply: false, templateIds: [], out: 'review' });
  assert.deepEqual(parseContingencyArgs(['--apply', '--templates', 'a, b', '--out', 'x']), { apply: true, templateIds: ['a', 'b'], out: 'x' });
  assert.throws(() => parseContingencyArgs(['--dry-run']), /unknown argument/);
});

test('the writer refuses anything but the four allowed mutations, and a key shared with the read client', () => {
  assert.deepEqual([...ALLOWED_MUTATIONS], ['createCostItem', 'createCostGroup', 'deleteCostGroup', 'updateJob']);
  assert.throws(() => assertAllowed({ updateCostType: {} }), /Refusing to issue "updateCostType"/);
  assert.throws(() => assertAllowed({ organization: {} }), /Refusing to issue "organization"/);
  assert.throws(() => assertAllowed({}), /empty write/);
  assert.throws(() => writerFromEnv({}), /JOBTREAD_WRITE_GRANT_KEY is not set/);
  assert.throws(() => writerFromEnv({ JOBTREAD_WRITE_GRANT_KEY: 'k', JOBTREAD_GRANT_KEY: 'k', JOBTREAD_ORGANIZATION_ID: 'o' }), /same key/);
  assert.equal(writerFromEnv({ JOBTREAD_WRITE_GRANT_KEY: 'w', JOBTREAD_GRANT_KEY: 'r', JOBTREAD_ORGANIZATION_ID: 'o' }).organizationId, 'o');
});

test('a write sends the grant key once, logs what it is about to do, surfaces Pave errors, and never retries', async () => {
  const sent: { url: string; body: unknown }[] = [];
  const logged: string[] = [];
  let answer: () => Response = () => new Response(JSON.stringify({ createCostGroup: { createdCostGroup: { id: 'g1' } } }), { status: 200 });
  const w = new JobTreadWriter({
    grantKey: 'grant_w', organizationId: 'org', url: 'https://example.test/pave', log: (s) => logged.push(s),
    fetchImpl: (async (url: string | URL | Request, init?: RequestInit) => {
      sent.push({ url: String(url), body: JSON.parse(String(init?.body)) });
      return answer();
    }) as typeof fetch,
  });
  const r = await w.mutate<{ createCostGroup: { createdCostGroup: { id: string } } }>({ createCostGroup: { $: { name: 'x' }, createdCostGroup: { id: {} } } });
  assert.equal(r.createCostGroup.createdCostGroup.id, 'g1');
  assert.deepEqual(sent[0]!.body, { query: { $: { grantKey: 'grant_w' }, createCostGroup: { $: { name: 'x' }, createdCostGroup: { id: {} } } } });
  assert.deepEqual(logged, ['jobtread write: createCostGroup']);

  answer = () => new Response(JSON.stringify({ error: 'An organizationCostItemId must be provided' }), { status: 200 });
  await assert.rejects(w.mutate({ createCostGroup: { $: {} } }), /organizationCostItemId must be provided/);

  answer = () => { throw new Error('socket hang up'); };
  await assert.rejects(w.mutate({ createCostGroup: { $: {} } }), /MAY have happened/);
  assert.equal(sent.length, 3, 'one request per call: a failed write is not retried');

  await assert.rejects(w.mutate({ updateCostGroup: { $: {} } }), /Refusing/);
  assert.equal(sent.length, 3, 'a refused write never reaches the network');
});
