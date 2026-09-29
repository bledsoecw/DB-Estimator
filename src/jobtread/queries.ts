/**
 * The read queries this auditor issues.
 *
 * Every connection is capped at 100 by the API, so anything that can exceed
 * that paginates. The largest observed estimate is 100 nodes (72 items,
 * 28 groups), but a document is not guaranteed to stay under the cap.
 */

import type { JobTreadClient } from './client.ts';
import type {
  ApiCatalogItem,
  ApiComparable,
  ApiDocumentSummary,
  ApiJob,
  ApiCostGroup,
  ApiCostItem,
  ApiCostType,
  ApiDocument,
  AuditFixture,
} from './types.ts';

const PAGE = 100;

/**
 * The "Job Type" custom field on a job. Two options: Roofing | Construction.
 *
 * This is the line that matters. Roofing is entirely subcontracted and priced
 * from Shawn's roofing templates, which are correct and are NOT the cost-type
 * margins; Construction is the work Kristen reviews and the work the cost-type
 * settings govern. Auditing a roofing estimate against the cost types compares
 * it to a policy it was never meant to follow.
 *
 * Read from the job rather than inferred from its name: "261538 Linton_Gutters"
 * and "260463 Leeth_Storm Damage" are both Roofing and neither says so.
 */
export const JOB_TYPE_FIELD = '22PBzhnUydgC';

const JOB_FIELDS = {
  id: {},
  name: {},
  customFieldValues: {
    $: { size: 20 },
    nodes: { value: {}, customField: { id: {} } },
  },
} as const;

/** "Construction", "Roofing", or null when the job carries no Job Type. */
export function jobTypeOf(job: ApiJob | undefined): string | null {
  const nodes = job?.customFieldValues?.nodes ?? [];
  for (const n of nodes) {
    if (n.customField?.id === JOB_TYPE_FIELD && typeof n.value === 'string') return n.value;
  }
  return null;
}

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
      job: JOB_FIELDS,
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

/**
 * Recent estimates, for auditing a batch rather than one at a time.
 *
 * Sorted newest first. Status is left to the caller: recently APPROVED
 * estimates are the useful ones for a shadow run, because they already went
 * to a customer — anything the auditor says about them is either a real miss
 * or a false positive, and nothing it says can disrupt live work.
 */
export async function fetchRecentDocuments(
  client: JobTreadClient,
  opts: { limit: number; status?: string; type?: string; jobType?: string },
): Promise<ApiDocumentSummary[]> {
  const where: unknown[] = [[['type'], '=', opts.type ?? 'customerOrder']];
  if (opts.status) where.push([['status'], '=', opts.status]);

  const res = await client.query<{
    organization: { documents: { nodes: ApiDocumentSummary[] } };
  }>({
    organization: {
      $: { id: client.organizationId },
      documents: {
        $: {
          // Job Type cannot be filtered server-side without a `with` alias that
          // does not compose through `document.job`, so it is filtered here.
          // Construction is a minority of recent approved work — 3 of the last
          // 20 — so ask for enough candidates to still come back with `limit`.
          size: Math.min(opts.jobType ? opts.limit * 6 : opts.limit, PAGE),
          where: where.length === 1 ? where[0] : { and: where },
          sortBy: [{ field: 'createdAt', order: 'desc' }],
        },
        nodes: {
          id: {}, name: {}, status: {}, price: {}, cost: {}, createdAt: {},
          job: JOB_FIELDS,
        },
      },
    },
  });
  const all = res.organization.documents.nodes;
  const wanted = opts.jobType
    ? all.filter((d) => jobTypeOf(d.job)?.toLowerCase() === opts.jobType!.toLowerCase())
    : all;
  return wanted.slice(0, opts.limit);
}

/**
 * The catalog items behind a document's lines.
 *
 * `organizationCostItem` on a line IS a catalog item, so fetching those ids
 * needs no job/document filtering — see the field notes on how the three kinds
 * of costItem are told apart.
 *
 * This is what makes the catalog, rather than the cost-type defaults, the thing
 * an estimate is judged against. The cost types are org-wide averages; the
 * catalog is where Carl's actual intent lives, item by item — Designer at
 * x1.25, HOVER at cost, sub-supplied fasteners at a higher markup.
 */
export async function fetchCatalogItems(
  client: JobTreadClient,
  ids: string[],
): Promise<ApiCatalogItem[]> {
  const unique = [...new Set(ids)];
  const out: ApiCatalogItem[] = [];
  for (let i = 0; i < unique.length; i += PAGE) {
    const batch = unique.slice(i, i + PAGE);
    const res = await client.query<{
      organization: { costItems: { nodes: ApiCatalogItem[] } };
    }>({
      organization: {
        $: { id: client.organizationId },
        costItems: {
          $: { size: PAGE, where: [['id'], 'in', batch] },
          nodes: {
            id: {}, name: {}, unitCost: {}, unitPrice: {},
            costType: { id: {}, name: {} },
          },
        },
      },
    });
    out.push(...res.organization.costItems.nodes);
  }
  return out;
}

/** Everything one audit needs, in a form that can be frozen to disk. */
export async function captureFixture(
  client: JobTreadClient,
  documentId: string,
  sharedCostTypes?: ApiCostType[],
): Promise<AuditFixture> {
  const document = await fetchDocument(client, documentId);
  // Cost types are org-wide and identical for every document in a run, so a
  // batch fetches them once. Comparables depend on the document's price and
  // cannot be shared.
  const costTypes = sharedCostTypes ?? (await fetchCostTypes(client));
  const comparables = await fetchComparables(client, document.price);
  const catalog = await fetchCatalogItems(
    client,
    document.costItems.nodes
      .map((i) => i.organizationCostItem?.id)
      .filter((id): id is string => !!id),
  );
  return {
    capturedAt: new Date().toISOString(),
    organizationId: client.organizationId,
    document,
    costTypes,
    comparables,
    catalog,
  };
}
