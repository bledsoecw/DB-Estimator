/**
 * The read queries this auditor issues.
 *
 * Every connection is capped at 100 by the API, so anything that can exceed
 * that paginates. The largest observed estimate is 100 nodes (72 items,
 * 28 groups), but a document is not guaranteed to stay under the cap.
 */

import type { JobTreadClient } from './client.ts';
import type {
  ApiComparable,
  ApiCostGroup,
  ApiCostItem,
  ApiCostType,
  ApiDocument,
  AuditFixture,
} from './types.ts';

const PAGE = 100;

const COST_ITEM_FIELDS = {
  id: {}, name: {}, quantity: {}, unitCost: {}, unitPrice: {}, cost: {}, price: {},
  isTaxable: {}, isSelected: {}, isSpecification: {}, position: {}, globalId: {},
  quantityFormula: {},
  unit: { id: {}, name: {} },
  costType: { id: {}, name: {} },
  costCode: { id: {}, name: {} },
  costGroup: { id: {} },
  organizationCostItem: { id: {} },
} as const;

const COST_GROUP_FIELDS = {
  id: {}, name: {}, position: {}, isSelected: {}, isSimpleSelection: {},
  minSelectionsRequired: {}, maxSelectionsAllowed: {}, showChildCosts: {},
  parentCostGroup: { id: {} },
} as const;

/** Fetch one document with every line and group, paginating both connections. */
export async function fetchDocument(
  client: JobTreadClient,
  documentId: string,
): Promise<ApiDocument> {
  const head = await client.query<{ document: ApiDocument }>({
    document: {
      $: { id: documentId },
      id: {}, name: {}, type: {}, status: {}, price: {}, cost: {}, priceWithTax: {},
      taxRate: {}, taxName: {}, externalId: {}, showChildCosts: {}, showQuantity: {},
      showProfit: {}, showLinesAtDepth: {}, requireSignature: {}, includeInBudget: {},
      issueDate: {}, createdAt: {},
      job: { id: {}, name: {} },
      costGroups: { $: { size: PAGE }, count: {}, nextPage: {}, nodes: COST_GROUP_FIELDS },
      costItems: {
        $: { size: PAGE, sortBy: [{ field: 'position' }] },
        count: {}, nextPage: {}, nodes: COST_ITEM_FIELDS,
      },
    },
  });

  const doc = head.document;
  if (!doc) throw new Error(`document ${documentId} not found`);

  doc.costGroups.nodes = await drain<ApiCostGroup>(
    client, documentId, 'costGroups', COST_GROUP_FIELDS, doc.costGroups, undefined,
  );
  doc.costItems.nodes = await drain<ApiCostItem>(
    client, documentId, 'costItems', COST_ITEM_FIELDS, doc.costItems, [{ field: 'position' }],
  );
  return doc;
}

async function drain<T>(
  client: JobTreadClient,
  documentId: string,
  connection: 'costItems' | 'costGroups',
  fields: Record<string, unknown>,
  first: { count: number; nodes: T[]; nextPage?: string | null },
  sortBy: { field: string }[] | undefined,
): Promise<T[]> {
  const all = [...first.nodes];
  let page = first.nextPage ?? null;
  while (page && all.length < first.count) {
    const args: Record<string, unknown> = { size: PAGE, page };
    if (sortBy) args['sortBy'] = sortBy;
    const res = await client.query<{
      document: Record<string, { nodes: T[]; nextPage: string | null }>;
    }>({
      document: {
        $: { id: documentId },
        [connection]: { $: args, nextPage: {}, nodes: fields },
      },
    });
    const c = res.document?.[connection];
    if (!c || c.nodes.length === 0) break;
    all.push(...c.nodes);
    page = c.nextPage;
  }
  return all;
}

/** Cost types carry the markup policy. Read live so a policy change needs no deploy. */
export async function fetchCostTypes(client: JobTreadClient): Promise<ApiCostType[]> {
  const res = await client.query<{
    organization: { costTypes: { nodes: ApiCostType[] } };
  }>({
    organization: {
      $: { id: client.organizationId },
      costTypes: {
        $: { size: 50 },
        nodes: { id: {}, name: {}, margin: {}, isTaxable: {}, isTimeTrackable: {}, isActive: {} },
      },
    },
  });
  return res.organization.costTypes.nodes;
}

/**
 * Approved customer orders in a price band around the document under audit,
 * for the margin comparison. Approved only — pending and draft are not evidence
 * of anything a customer accepted.
 */
export async function fetchComparables(
  client: JobTreadClient,
  price: number,
  spread = 0.55,
): Promise<ApiComparable[]> {
  const lo = Math.round(price * (1 - spread));
  const hi = Math.round(price * (1 + spread));
  const res = await client.query<{
    organization: { documents: { nodes: ApiComparable[] } };
  }>({
    organization: {
      $: { id: client.organizationId },
      documents: {
        $: {
          size: 50,
          where: {
            and: [
              [['type'], '=', 'customerOrder'],
              [['status'], '=', 'approved'],
              [['price'], '>', lo],
              [['price'], '<', hi],
              [['cost'], '>', 0],
            ],
          },
          sortBy: [{ field: 'price', order: 'desc' }],
        },
        nodes: { price: {}, cost: {}, job: { name: {} } },
      },
    },
  });
  return res.organization.documents.nodes;
}

/** Everything one audit needs, in a form that can be frozen to disk. */
export async function captureFixture(
  client: JobTreadClient,
  documentId: string,
): Promise<AuditFixture> {
  const document = await fetchDocument(client, documentId);
  const [costTypes, comparables] = [
    await fetchCostTypes(client),
    await fetchComparables(client, document.price),
  ];
  return {
    capturedAt: new Date().toISOString(),
    organizationId: client.organizationId,
    document,
    costTypes,
    comparables,
  };
}
