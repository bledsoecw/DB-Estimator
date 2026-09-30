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
  ApiBudget,
  ApiBudgetGroup,
  ApiBudgetItem,
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

/** What these queries need of a client: an org and a way to read. Fakeable. */
export type Reader = Pick<JobTreadClient, 'organizationId' | 'query'>;

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

/** The "Project Type" custom field: C-Bathrooms, C-Additions, R-Shingles, ... */
export const PROJECT_TYPE_FIELD = '22PC7idvhRzp';

const JOB_FIELDS = {
  id: {},
  name: {},
  customFieldValues: {
    // Only the field the auditor reads. The rest carry the sales rep, the
    // project manager and the customer's town, none of which belongs in a
    // fixture — and the three fixtures captured before this filter existed
    // happen to carry only Job Type anyway.
    $: { size: 20, where: [['customField', 'id'], '=', JOB_TYPE_FIELD] },
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

/**
 * The budget line a document line was built from — money and quantity only.
 * Descriptions come by their own query; see DESCRIPTION_FIELDS.
 */
const BUDGET_REF_FIELDS = {
  id: {}, name: {}, quantity: {}, unitCost: {}, unitPrice: {}, cost: {}, price: {},
} as const;

const COST_ITEM_FIELDS = {
  id: {}, name: {}, quantity: {}, unitCost: {}, unitPrice: {}, cost: {}, price: {},
  isTaxable: {}, isSelected: {}, isSpecification: {}, position: {}, globalId: {},
  quantityFormula: {},
  unit: { id: {}, name: {} },
  costType: { id: {}, name: {} },
  costCode: { id: {}, name: {} },
  costGroup: { id: {} },
  organizationCostItem: { id: {} },
  jobCostItem: BUDGET_REF_FIELDS,
} as const;

const COST_GROUP_FIELDS = {
  id: {}, name: {}, position: {}, isSelected: {}, isSimpleSelection: {},
  minSelectionsRequired: {}, maxSelectionsAllowed: {}, showChildCosts: {},
  parentCostGroup: { id: {} },
} as const;

/**
 * Descriptions, fetched on their own.
 *
 * Selecting `description` inside COST_ITEM_FIELDS, on both the line and its
 * budget line, pushed a 43-line document over JobTread's response limit
 * ("Request Entity Too Large"). A description runs to 4,096 characters and a
 * line carries two, so they get a query of their own, paged like the rest.
 */
const DESCRIPTION_FIELDS = {
  id: {}, description: {}, jobCostItem: { id: {}, description: {} },
} as const;

interface ApiDescriptionRow {
  id: string;
  description: string | null;
  jobCostItem: { id: string; description: string | null } | null;
}

/** Cost items and groups that sit on no document: the job budget. */
const BUDGET_ONLY = [['document', 'id'], '=', null] as const;

const BUDGET_ITEM_FIELDS = {
  id: {}, name: {}, quantity: {}, unitCost: {}, unitPrice: {}, cost: {}, price: {},
  isSpecification: {}, position: {},
  costType: { id: {}, name: {} },
  costCode: { id: {}, name: {} },
  costGroup: { id: {}, name: {} },
  organizationCostItem: { id: {} },
  // Document lines built from this budget line, on any document of the job.
  // Zero means no customer has seen it. The count alone: asking for the nodes
  // as well put an 85-line budget over the response limit.
  documentCostItems: { count: {} },
} as const;

const BUDGET_GROUP_FIELDS = {
  id: {}, name: {}, position: {}, parentCostGroup: { id: {} },
} as const;

const BY_POSITION = { sortBy: [{ field: 'position' }] } as const;

/** Fetch one document with every line and group, paginating both connections. */
export async function fetchDocument(
  client: Reader,
  documentId: string,
): Promise<ApiDocument> {
  const head = await client.query<{ document: ApiDocument | null }>({
    document: {
      $: { id: documentId },
      id: {}, name: {}, type: {}, status: {}, price: {}, cost: {}, priceWithTax: {},
      taxRate: {}, taxName: {}, externalId: {}, showChildCosts: {}, showQuantity: {},
      showProfit: {}, showLinesAtDepth: {}, requireSignature: {}, includeInBudget: {},
      issueDate: {}, createdAt: {},
      job: JOB_FIELDS,
      costGroups: { $: { size: PAGE }, count: {}, nextPage: {}, nodes: COST_GROUP_FIELDS },
      costItems: {
        $: { size: PAGE, ...BY_POSITION },
        count: {}, nextPage: {}, nodes: COST_ITEM_FIELDS,
      },
    },
  });

  const doc = head.document;
  if (!doc) throw new Error(`document ${documentId} not found`);

  const root = { field: 'document', id: documentId } as const;
  doc.costGroups.nodes = await drain<ApiCostGroup>(
    client, root, 'costGroups', COST_GROUP_FIELDS, doc.costGroups, {},
  );
  doc.costItems.nodes = await drain<ApiCostItem>(
    client, root, 'costItems', COST_ITEM_FIELDS, doc.costItems, BY_POSITION,
  );
  mergeDescriptions(doc.costItems.nodes, await fetchDescriptions(client, documentId));
  return doc;
}

/** Every line's description and its budget line's, paged the same way as the lines. */
export async function fetchDescriptions(
  client: Reader,
  documentId: string,
): Promise<ApiDescriptionRow[]> {
  const res = await client.query<{ document: { costItems: Connection<ApiDescriptionRow> } | null }>({
    document: {
      $: { id: documentId },
      costItems: {
        $: { size: PAGE, ...BY_POSITION },
        count: {}, nextPage: {}, nodes: DESCRIPTION_FIELDS,
      },
    },
  });
  const first = res.document?.costItems;
  if (!first) return [];
  return drain<ApiDescriptionRow>(
    client, { field: 'document', id: documentId }, 'costItems', DESCRIPTION_FIELDS, first, BY_POSITION,
  );
}

/** Attach descriptions to the lines they belong to. Rows for unknown lines are dropped. */
export function mergeDescriptions(lines: ApiCostItem[], rows: ApiDescriptionRow[]): void {
  const byId = new Map(rows.map((r) => [r.id, r]));
  for (const line of lines) {
    const row = byId.get(line.id);
    if (!row) continue;
    line.description = row.description;
    if (line.jobCostItem && row.jobCostItem && row.jobCostItem.id === line.jobCostItem.id) {
      line.jobCostItem.description = row.jobCostItem.description;
    }
  }
}

/**
 * The job budget: every cost item and group on the job with no document.
 *
 * Filtered server-side on `document.id = null`. The org's job template puts
 * 40-odd zero-cost time-tracking lines in every budget, so a budget is
 * routinely larger than the document built from it; both connections page.
 */
export async function fetchBudget(client: Reader, jobId: string): Promise<ApiBudget> {
  const res = await client.query<{
    job: { id: string; costItems: Connection<ApiBudgetItem>; costGroups: Connection<ApiBudgetGroup> } | null;
  }>({
    job: {
      $: { id: jobId },
      id: {},
      costItems: {
        $: { size: PAGE, where: BUDGET_ONLY, ...BY_POSITION },
        count: {}, nextPage: {}, nodes: BUDGET_ITEM_FIELDS,
      },
      costGroups: {
        $: { size: PAGE, where: BUDGET_ONLY },
        count: {}, nextPage: {}, nodes: BUDGET_GROUP_FIELDS,
      },
    },
  });
  const job = res.job;
  if (!job) throw new Error(`job ${jobId} not found`);

  const root = { field: 'job', id: jobId } as const;
  return {
    jobId,
    costItems: {
      count: job.costItems.count,
      nodes: await drain<ApiBudgetItem>(
        client, root, 'costItems', BUDGET_ITEM_FIELDS, job.costItems, { where: BUDGET_ONLY, ...BY_POSITION },
      ),
    },
    costGroups: {
      count: job.costGroups.count,
      nodes: await drain<ApiBudgetGroup>(
        client, root, 'costGroups', BUDGET_GROUP_FIELDS, job.costGroups, { where: BUDGET_ONLY },
      ),
    },
  };
}

interface Connection<T> {
  count: number;
  nodes: T[];
  nextPage?: string | null;
}

/**
 * Follow a connection's `nextPage` until every node is in hand.
 *
 * `args` are the page-independent arguments — the sort, and for a budget the
 * `where` — repeated on every page so that page 2 is a page of the same query.
 */
async function drain<T>(
  client: Reader,
  root: { field: 'document' | 'job'; id: string },
  connection: 'costItems' | 'costGroups',
  fields: Record<string, unknown>,
  first: Connection<T>,
  args: Record<string, unknown>,
): Promise<T[]> {
  const all = [...first.nodes];
  let page = first.nextPage ?? null;
  while (page && all.length < first.count) {
    const res = await client.query<Record<string, Record<string, Connection<T>> | null>>({
      [root.field]: {
        $: { id: root.id },
        [connection]: { $: { ...args, size: PAGE, page }, nextPage: {}, nodes: fields },
      },
    });
    const c = res[root.field]?.[connection];
    if (!c || c.nodes.length === 0) break;
    all.push(...c.nodes);
    page = c.nextPage ?? null;
  }
  return all;
}

/** Cost types carry the markup policy. Read live so a policy change needs no deploy. */
export async function fetchCostTypes(client: Reader): Promise<ApiCostType[]> {
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
  client: Reader,
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
 * Test jobs, which are evidence of nothing.
 *
 * The org keeps a test customer — "Kay Oss", say it aloud — and a handful of
 * jobs called "Test Job", "TEST ROOFING", "SELECTIONS TEST", "Test Contact",
 * plus one template job. None of them went to a customer, so an audit of one
 * measures nothing, and a batch of twenty that includes three of them is a
 * batch of seventeen.
 *
 * Matched on the job name: "test" as a whole word, the test customer, and
 * "template". Whole word, because "Demo" here is demolition ("Gamble_Garage
 * Demo" is a real job) and a customer named Testa is a customer.
 */
export function isTestJob(jobName: string): boolean {
  return (
    /(^|[^a-z])test([^a-z]|$)/i.test(jobName) ||
    /kay oss/i.test(jobName) ||
    /template/i.test(jobName)
  );
}

/**
 * Recent estimates, for auditing a batch rather than one at a time.
 *
 * Sorted newest first. Status is left to the caller: recently APPROVED
 * estimates are the useful ones for a shadow run, because they already went
 * to a customer — anything the auditor says about them is either a real miss
 * or a false positive, and nothing it says can disrupt live work. Test jobs
 * are left out before the limit is applied, so twenty means twenty real ones.
 */
export async function fetchRecentDocuments(
  client: Reader,
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
  const all = res.organization.documents.nodes.filter((d) => !isTestJob(d.job?.name ?? ''));
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
  client: Reader,
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

/**
 * The whole priced catalog, for the catalog audit.
 *
 * A catalog item is a cost item with no job and no document, and both of those
 * ARE filterable server-side through their id — `[["job","id"],"=",null]` —
 * which an earlier note in the field notes got wrong. 2,567 items match, 718
 * of them with a cost; the rest are groups, headings and placeholders that
 * carry no price and cannot be off any policy.
 *
 * Paged with the cursor the API returns; there is no other way past 100.
 */
export async function fetchCatalog(client: Reader): Promise<ApiCatalogItem[]> {
  const out: ApiCatalogItem[] = [];
  let page: string | null = null;
  for (;;) {
    const args: Record<string, unknown> = {
      size: PAGE,
      where: {
        and: [
          [['job', 'id'], '=', null],
          [['document', 'id'], '=', null],
          [['unitCost'], '>', 0],
        ],
      },
      sortBy: [{ field: 'name' }],
    };
    if (page) args['page'] = page;
    const res: {
      organization: { costItems: { nextPage: string | null; nodes: ApiCatalogItem[] } };
    } = await client.query({
      organization: {
        $: { id: client.organizationId },
        costItems: {
          $: args,
          nextPage: {},
          nodes: {
            id: {}, name: {}, unitCost: {}, unitPrice: {}, isTaxable: {},
            costType: { id: {}, name: {} },
            costCode: { name: {} },
            costGroup: { name: {}, parentCostGroup: { name: {} } },
          },
        },
      },
    });
    const c = res.organization.costItems;
    out.push(...c.nodes);
    if (!c.nextPage || c.nodes.length === 0) break;
    page = c.nextPage;
  }
  return out;
}

/** Everything one audit needs, in a form that can be frozen to disk. */
export async function captureFixture(
  client: Reader,
  documentId: string,
  sharedCostTypes?: ApiCostType[],
): Promise<AuditFixture> {
  const document = await fetchDocument(client, documentId);
  const budget = await fetchBudget(client, document.job.id);
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
    budget,
    costTypes,
    comparables,
    catalog,
  };
}
