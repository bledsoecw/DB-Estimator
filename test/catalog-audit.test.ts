/**
 * The catalog audited against the cost types.
 *
 * The fixture is the first twenty priced catalog items by name, captured live
 * on 2026-09-29 after Carl's sweep. Everything asserted here was read off the
 * raw rows before the code was written.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { auditCatalog, findDuplicates, renderCatalogReport, summarizeCatalog } from '../src/catalog-audit.ts';
import { fetchCatalog } from '../src/jobtread/queries.ts';
import { JobTreadClient } from '../src/jobtread/client.ts';
import { toCatalog } from '../src/domain.ts';
import { formatMoney } from '../src/money.ts';
import type { CatalogFixture } from '../src/jobtread/types.ts';

const fixture = JSON.parse(
  readFileSync(new URL('./fixtures/catalog-sample.json', import.meta.url), 'utf8'),
) as CatalogFixture;

const audit = auditCatalog(fixture);

test('nineteen of twenty are at policy; the twentieth is a recorded decision', () => {
  assert.equal(audit.checked, 20);
  assert.equal(audit.atPolicy, 19);
  assert.equal(audit.offPolicy, 0);
  assert.equal(audit.approved, 1);
});

test('the x2.40 warranty is set aside as approved, and says where it lives', () => {
  // 20 YR Warranty: $25 -> $60 under Other. Carl: warranties are priced on
  // their own schedule, three rates on purpose. It is a line inside the
  // "Standing Seam Roof Replacement > Upgrades" template group, which is why
  // the Catalog page's Cost Items tab could not find it.
  const other = audit.sections.find((s) => s.costType === 'Other')!;
  assert.equal(other.clusters.length, 0, 'a recorded decision was clustered as a finding');
  assert.equal(other.approved.length, 1);
  const [a] = other.approved;
  assert.equal(a!.item.name, '20 YR Warranty');
  assert.match(a!.reason, /own schedule/);
  assert.equal(a!.item.groupPath, 'Standing Seam Roof Replacement \u203a Upgrades');
});

test('items at exactly the cost-type rate are not clustered as anything', () => {
  for (const s of audit.sections) {
    if (s.costType === 'Other') continue;
    assert.equal(s.clusters.length, 0, `${s.costType} has clusters`);
    assert.equal(s.atPolicy, s.checked, `${s.costType} not fully at policy`);
  }
});

test('four names appear twice; one pair is identical, three disagree', () => {
  assert.equal(audit.duplicates.length, 4);
  const byName = new Map(audit.duplicates.map((d) => [d.name, d]));
  assert.ok(byName.get('8x8 Step Flashing')!.identical, 'two identical Step Flashing rows');
  for (const n of ['6" Gutters', '6" Gutter Corner', '3x4 Downspouts']) {
    const d = byName.get(n)!;
    assert.ok(d, `missing ${n}`);
    assert.equal(d.items.length, 2);
    assert.ok(!d.identical, `${n} copies differ (Materials vs Subcontractor)`);
  }
  // Traps first, so the reader sees the ones that matter.
  assert.ok(!audit.duplicates[0]!.identical);
  assert.ok(audit.duplicates[audit.duplicates.length - 1]!.identical);
});

test('duplicate matching ignores case and spacing, never the id', () => {
  const items = [...toCatalog([
    { id: 'a', name: '6" Gutters', unitCost: 8.25, unitPrice: 11.9625, costType: { id: 'x', name: 'Materials' } },
    { id: 'b', name: '6"  gutters ', unitCost: 8.25, unitPrice: 11.9625, costType: { id: 'x', name: 'Materials' } },
    { id: 'c', name: '5" Gutters', unitCost: 6, unitPrice: 8.7, costType: { id: 'x', name: 'Materials' } },
  ]).values()];
  const d = findDuplicates(items);
  assert.equal(d.length, 1);
  assert.equal(d[0]!.items.length, 2);
  assert.ok(d[0]!.identical);
});

test('an approved exception is set aside, not flagged', () => {
  const f = structuredClone(fixture);
  f.items.push({
    id: '22PCCDafayH8', // Designer - Schematic, approved at x1.25
    name: 'Designer - Schematic',
    unitCost: 100,
    unitPrice: 125,
    costType: { id: '22PBAjfWNQr6', name: 'Labor' },
    costCode: { name: 'Design' },
  });
  const a = auditCatalog(f);
  assert.equal(a.offPolicy, 0);
  assert.equal(a.approved, 2, 'the warranty and the Designer item');
  const labor = a.sections.find((s) => s.costType === 'Labor')!;
  assert.equal(labor.approved[0]!.item.name, 'Designer - Schematic');
  assert.match(labor.approved[0]!.decidedBy, /Carl/);
  assert.match(labor.approved[0]!.reason, /set rate/);
});

test('an approved exception lapses if the catalog price moved', () => {
  const f = structuredClone(fixture);
  f.items.push({
    id: '22PCCDafayH8',
    name: 'Designer - Schematic',
    unitCost: 100,
    unitPrice: 150, // no longer the approved x1.25
    costType: { id: '22PBAjfWNQr6', name: 'Labor' },
  });
  const a = auditCatalog(f);
  assert.equal(a.approved, 1, 'the warranty is still approved');
  assert.equal(a.offPolicy, 1, 'the moved Designer item is a finding again');
});

test('items with no cost, no cost type, or at cost by policy are counted, not judged', () => {
  const f = structuredClone(fixture);
  f.items.push(
    { id: 'z1', name: 'Heading', unitCost: 0, unitPrice: 0, costType: { id: '22PBAjfWNQr7', name: 'Materials' } },
    { id: 'z2', name: 'Orphan', unitCost: 10, unitPrice: 20, costType: null },
    { id: 'z3', name: 'Clock In Line', unitCost: 30, unitPrice: 30, costType: { id: '22PaTg5HNX8w', name: 'Clock In' } },
  );
  const a = auditCatalog(f);
  assert.deepEqual(a.skipped, { noCost: 1, noCostType: 1, passThrough: 1 });
  assert.equal(a.checked, 20);
});

test('the report is self-contained and its numbers are on the page', () => {
  const html = renderCatalogReport(audit);
  assert.ok(!/(?:href|src)\s*=\s*["']?https?:\/\//.test(html), 'references something off the filesystem');
  assert.match(html, /20 YR Warranty/);
  assert.match(html, /×2\.40/);
  assert.match(html, /approved:/);
  // Where to click: the Cost Items tab does not list grouped items.
  assert.match(html, /in Standing Seam Roof Replacement \u203a Upgrades/);
  // Direction is a word, not a sign: no bare "+$23.75" anywhere on the page.
  assert.ok(!/[+\u2212-]\$\d/.test(html), 'a bare signed amount with no direction');
  assert.match(html, /Duplicate names — 4/);
  assert.match(html, /Read-only/);
  // Names came from JobTread and carry quotes.
  assert.match(html, /6&quot; Gutters/);
  assert.ok(!html.includes('6" Gutters<'), 'a raw quote reached the markup');
});

test('the terminal summary leads with the count and names the cluster', () => {
  const lines = summarizeCatalog(audit);
  assert.match(lines[0]!, /20 priced catalog items checked — 19 at policy, 0 off, 1 approved/);
  assert.ok(!lines.some((l) => /×2\.40/.test(l)), 'an approved item still listed as a cluster');
  assert.ok(lines.some((l) => /4 duplicate names, 3 of which disagree/.test(l)));
});

// ---- the pager ------------------------------------------------------------------

test('fetchCatalog follows the cursor to the end and sends both null filters', async () => {
  const pages: Record<string, { nextPage: string | null; nodes: unknown[] }> = {
    first: { nextPage: 'cursor-2', nodes: [{ id: 'a', name: 'A', unitCost: 1, unitPrice: 1.45, costType: null }] },
    'cursor-2': { nextPage: 'cursor-3', nodes: [{ id: 'b', name: 'B', unitCost: 1, unitPrice: 1.45, costType: null }] },
    'cursor-3': { nextPage: null, nodes: [{ id: 'c', name: 'C', unitCost: 1, unitPrice: 1.45, costType: null }] },
  };
  const seen: unknown[] = [];
  const fakeFetch: typeof fetch = async (_url, init) => {
    const body = JSON.parse(String(init?.body)) as { query: { organization: { costItems: { $: Record<string, unknown> } } } };
    const args = body.query.organization.costItems.$;
    seen.push(args);
    const page = (args['page'] as string | undefined) ?? 'first';
    return new Response(JSON.stringify({ organization: { costItems: pages[page]! } }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  };
  const client = new JobTreadClient({
    grantKey: 'grant_test',
    organizationId: '22PBAjem8SSC',
    fetchImpl: fakeFetch,
    requestsPerSecond: 1000,
  });

  const items = await fetchCatalog(client);
  assert.deepEqual(items.map((i) => i.id), ['a', 'b', 'c']);
  assert.equal(seen.length, 3, 'did not stop at the last page');

  // Every page asks for catalog items only: no job, no document, a cost.
  for (const args of seen as { where: { and: unknown[] } }[]) {
    const and = args.where.and;
    assert.deepEqual(and[0], [['job', 'id'], '=', null]);
    assert.deepEqual(and[1], [['document', 'id'], '=', null]);
    assert.deepEqual(and[2], [['unitCost'], '>', 0]);
  }
  // The cursor from page n is what page n+1 sends.
  assert.equal((seen[1] as { page?: string }).page, 'cursor-2');
  assert.equal((seen[2] as { page?: string }).page, 'cursor-3');
  assert.equal((seen[0] as { page?: string }).page, undefined);
});

test('fetchCatalog is a read and the client would refuse anything else', () => {
  // Belt to the braces: the query key is "organization", never a mutation.
  const client = new JobTreadClient({ grantKey: 'g', organizationId: 'o', fetchImpl: async () => new Response('{}') });
  assert.rejects(client.query({ updateCostItem: {} }), /read-only/);
});
