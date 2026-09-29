/**
 * The read queries, driven against a fake client.
 *
 * Pagination is the thing here. Wright_Roof proves the document pager against
 * captured data, but nothing captured crosses the page cap on a budget, and
 * the merge of descriptions onto lines is a join that fails silently — a
 * description landing on the wrong line, or on none, still audits.
 *
 * The fake client runs every query through the same read-only guard the real
 * one does, so a query these functions issue can never be a mutation.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  captureFixture,
  fetchBudget,
  fetchDocument,
  mergeDescriptions,
  type Reader,
} from '../src/jobtread/queries.ts';
import { assertReadOnly } from '../src/jobtread/client.ts';
import type { ApiBudgetItem, ApiCostItem } from '../src/jobtread/types.ts';

type Query = Record<string, any>;

function fakeClient(handler: (q: Query) => unknown): Reader & { queries: Query[] } {
  const queries: Query[] = [];
  return {
    organizationId: 'org1',
    queries,
    async query<T>(q: Record<string, unknown>): Promise<T> {
      assertReadOnly(q);
      queries.push(q);
      return handler(q) as T;
    },
  };
}

function apiLine(id: string, budgetId: string | null): ApiCostItem {
  return {
    id,
    name: `Line ${id}`,
    quantity: 1,
    unitCost: 10,
    unitPrice: 14.5,
    cost: 10,
    price: 14.5,
    isTaxable: false,
    isSelected: false,
    isSpecification: false,
    position: id,
    globalId: null,
    quantityFormula: null,
    unit: null,
    costType: { id: 'ct', name: 'Materials' },
    costCode: { id: 'cc', name: 'Finishes' },
    costGroup: null,
    organizationCostItem: null,
    jobCostItem:
      budgetId === null
        ? null
        : { id: budgetId, name: `Line ${id}`, quantity: 1, unitCost: 10, unitPrice: 14.5, cost: 10, price: 14.5 },
  };
}

function budgetLine(i: number): ApiBudgetItem {
  return {
    id: `b${i}`,
    name: `Budget ${i}`,
    quantity: 1,
    unitCost: 10,
    unitPrice: 14.5,
    cost: 10,
    price: 14.5,
    isSpecification: false,
    position: String(i).padStart(3, '0'),
    costType: { id: 'ct', name: 'Materials' },
    costCode: { id: 'cc', name: 'Finishes' },
    costGroup: { id: 'g', name: 'Group' },
    organizationCostItem: null,
    documentCostItems: { count: 1 },
  };
}

// ---- the budget pager ---------------------------------------------------------

test('a budget larger than one page comes back whole, in order, and stays filtered', async () => {
  const items = Array.from({ length: 250 }, (_, i) => budgetLine(i));
  const pages = [items.slice(0, 100), items.slice(100, 200), items.slice(200)];

  const client = fakeClient((q) => {
    const token = q.job.costItems.$.page as string | undefined;
    const idx = token ? Number(token.slice(1)) : 0;
    return {
      job: {
        id: 'job1',
        costItems: { count: 250, nextPage: idx < 2 ? `p${idx + 1}` : null, nodes: pages[idx] },
        ...(q.job.costGroups ? { costGroups: { count: 0, nextPage: null, nodes: [] } } : {}),
      },
    };
  });

  const budget = await fetchBudget(client, 'job1');
  assert.equal(budget.jobId, 'job1');
  assert.equal(budget.costItems.nodes.length, 250);
  assert.equal(budget.costItems.nodes[0]!.id, 'b0');
  assert.equal(budget.costItems.nodes[249]!.id, 'b249');
  assert.equal(new Set(budget.costItems.nodes.map((i) => i.id)).size, 250, 'a page was repeated');

  // One head query and two follow-ups, each a page of the SAME query: the
  // budget filter and the sort have to ride along or page 2 is a page of the
  // whole job, documents included.
  assert.equal(client.queries.length, 3);
  for (const q of client.queries) {
    assert.deepEqual(q.job.costItems.$.where, [['document', 'id'], '=', null]);
    assert.deepEqual(q.job.costItems.$.sortBy, [{ field: 'position' }]);
    assert.equal(q.job.costItems.$.size, 100);
    assert.ok(q.job.costItems.nodes.documentCostItems.count, 'lost the document-line count');
  }
  assert.deepEqual(q(client, 1).job.costItems.$.page, 'p1');
  assert.deepEqual(q(client, 2).job.costItems.$.page, 'p2');
});

const q = (client: { queries: Query[] }, i: number): Query => client.queries[i]!;

// ---- the document pager and the description join -----------------------------

test('descriptions are fetched apart from the lines and joined back by id', async () => {
  // 101 lines: crosses the page cap on both the line query and the
  // description query, and the very last line is the one a broken pager loses.
  const lines = Array.from({ length: 101 }, (_, i) => apiLine(`l${i}`, i === 7 ? null : `b${i}`));
  const rows = lines.map((l) => ({
    id: l.id,
    description: `desc ${l.id}`,
    jobCostItem: l.jobCostItem ? { id: l.jobCostItem.id, description: `budget desc ${l.id}` } : null,
  }));

  const client = fakeClient((query) => {
    const d = query.document;
    const token = d.costItems.$.page as string | undefined;
    const from = token ? 100 : 0;
    const isDescriptions = Boolean(d.costItems.nodes.description);
    const source = isDescriptions ? rows : lines;
    const costItems = {
      count: 101,
      nextPage: token ? null : 'p1',
      nodes: source.slice(from, from + 100),
    };
    if (isDescriptions || token) return { document: { costItems } };
    return {
      document: {
        id: 'doc1',
        name: 'Estimate',
        type: 'customerOrder',
        status: 'pending',
        price: 1464.5,
        cost: 1010,
        priceWithTax: 1464.5,
        taxRate: 0,
        taxName: null,
        externalId: null,
        showChildCosts: false,
        showQuantity: false,
        showProfit: false,
        showLinesAtDepth: null,
        requireSignature: true,
        includeInBudget: true,
        issueDate: null,
        createdAt: '2026-09-01T00:00:00.000Z',
        job: { id: 'job1', name: 'Test' },
        costGroups: { count: 0, nextPage: null, nodes: [] },
        costItems,
      },
    };
  });

  const doc = await fetchDocument(client, 'doc1');
  assert.equal(doc.costItems.nodes.length, 101);

  const last = doc.costItems.nodes[100]!;
  assert.equal(last.id, 'l100');
  assert.equal(last.description, 'desc l100', 'the line past the page cap lost its description');
  assert.equal(last.jobCostItem?.description, 'budget desc l100');

  const first = doc.costItems.nodes[0]!;
  assert.equal(first.jobCostItem?.id, 'b0', 'the head query no longer joins the budget line');
  assert.equal(first.jobCostItem?.description, 'budget desc l0');

  // A line with no budget link gets its own description and nothing else.
  const unlinked = doc.costItems.nodes[7]!;
  assert.equal(unlinked.description, 'desc l7');
  assert.equal(unlinked.jobCostItem, null);

  // head, lines page 2, descriptions page 1, descriptions page 2.
  assert.equal(client.queries.length, 4);
  // The head query must not ask for descriptions: that is what put a 43-line
  // document over the response limit.
  assert.equal(q(client, 0).document.costItems.nodes.description, undefined);
  assert.ok(q(client, 0).document.costItems.nodes.jobCostItem);
});

test('a description row for an unknown line is dropped, and a mismatched budget id does not attach', () => {
  const lines = [apiLine('a', 'b-a'), apiLine('b', null)];
  mergeDescriptions(lines, [
    { id: 'a', description: 'A', jobCostItem: { id: 'someone-else', description: 'not mine' } },
    { id: 'b', description: 'B', jobCostItem: null },
    { id: 'zzz', description: 'orphan', jobCostItem: null },
  ]);
  assert.equal(lines[0]!.description, 'A');
  assert.equal(lines[0]!.jobCostItem?.description, undefined, 'attached a description from a different budget line');
  assert.equal(lines[1]!.description, 'B');
  assert.equal(lines.length, 2);
});

// ---- the capture ---------------------------------------------------------------

test('a captured fixture carries the budget of the document’s own job', async () => {
  const client = fakeClient((query) => {
    if (query.document) {
      const isDescriptions = Boolean(query.document.costItems.nodes.description);
      const costItems = {
        count: 1,
        nextPage: null,
        nodes: isDescriptions
          ? [{ id: 'l0', description: 'd', jobCostItem: { id: 'b0', description: 'bd' } }]
          : [apiLine('l0', 'b0')],
      };
      if (isDescriptions) return { document: { costItems } };
      return {
        document: {
          id: 'doc1', name: 'Estimate', type: 'customerOrder', status: 'pending',
          price: 14.5, cost: 10, priceWithTax: 14.5, taxRate: 0, taxName: null, externalId: null,
          showChildCosts: false, showQuantity: false, showProfit: false, showLinesAtDepth: null,
          requireSignature: true, includeInBudget: true, issueDate: null,
          createdAt: '2026-09-01T00:00:00.000Z',
          job: { id: 'job-of-doc1', name: 'Test' },
          costGroups: { count: 0, nextPage: null, nodes: [] },
          costItems,
        },
      };
    }
    if (query.job) {
      assert.equal(query.job.$.id, 'job-of-doc1', 'fetched the budget of the wrong job');
      return {
        job: {
          id: 'job-of-doc1',
          costItems: { count: 1, nextPage: null, nodes: [budgetLine(0)] },
          costGroups: { count: 0, nextPage: null, nodes: [] },
        },
      };
    }
    if (query.organization?.costTypes) return { organization: { costTypes: { nodes: [] } } };
    if (query.organization?.documents) return { organization: { documents: { nodes: [] } } };
    throw new Error(`unexpected query ${JSON.stringify(query)}`);
  });

  const fixture = await captureFixture(client, 'doc1');
  assert.equal(fixture.budget?.jobId, 'job-of-doc1');
  assert.equal(fixture.budget?.costItems.nodes.length, 1);
  assert.equal(fixture.document.costItems.nodes[0]!.jobCostItem?.description, 'bd');
});
