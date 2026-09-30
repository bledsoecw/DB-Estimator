/**
 * What DB has done before that matches the work being drafted.
 *
 * Carl's rule: when a trade is usually subcontracted, the estimate should
 * lean on what the sub charged last time, not on a template rate. The
 * evidence is already in JobTread — every past estimate, change order,
 * work order, vendor bill and invoice is a cost item with a job behind it.
 * On 2026-09-30 "epoxy" found one job (246466 Myers, Rhino Concrete
 * Coatings, $5,712 lump sum, approved and invoiced) and "skim" found
 * nothing at all, which is itself the answer.
 *
 * This file only finds and describes. The model decides which past lines
 * apply and shows its arithmetic (prompt.ts); the code prices from the
 * number it cites (draft.ts). Read-only.
 */

import type { Reader } from '../jobtread/queries.ts';
import { isTestJob } from '../jobtread/queries.ts';

export type Where =
  | 'estimate' | 'change order' | 'invoice' | 'work order' | 'purchase order'
  | 'vendor bill' | 'bid request' | 'budget';

/**
 * How much a past line proves. A vendor's approved bill is what DB actually
 * paid; a sold estimate is what the customer accepted; an order is what DB
 * asked for; a bid request is a quote; anything else is a draft.
 */
export type Strength = 'billed' | 'sold' | 'ordered' | 'quoted' | 'draft';
export const STRENGTH_ORDER: Record<Strength, number> = { billed: 0, sold: 1, ordered: 2, quoted: 3, draft: 4 };

export interface HistoryLine {
  id: string;
  name: string;
  /** ISO date: the document's issue date, else when the line was created. */
  when: string;
  where: Where;
  status: string | null;
  /** The sub or supplier on a vendor document; null on customer documents and budgets. */
  vendor: string | null;
  quantity: number | null;
  unit: string | null;
  unitCost: number | null;
  unitPrice: number | null;
  cost: number;
  price: number;
  costTypeName: string | null;
  strength: Strength;
  /** The document the line sits on; null for a budget line. Not shown to the model. */
  documentId: string | null;
}

export interface HistoryJob {
  jobId: string;
  jobName: string;
  description: string | null;
  projectType: string | null;
  lines: HistoryLine[];
  /** Other lines on the strongest line's document, for scale: "Flooring 650 Square Foot". */
  context: { name: string; quantity: number | null; unit: string | null }[];
}

export interface HistoryHits {
  term: string;
  /** Matching lines before test jobs, the current job and placeholders were dropped. */
  raw: number;
  jobs: HistoryJob[];
}

export interface HistoryReport {
  terms: HistoryHits[];
}

export interface HistoryOptions {
  /** The job being drafted; its own lines are not history. */
  excludeJobId?: string;
  maxJobsPerTerm?: number;
  /** Fetch the other lines on each top job's strongest document. On by default. */
  context?: boolean;
}

const PAGE = 50;
const MAX_JOBS = 5;
const CONTEXT_JOBS = 3;
const PROJECT_TYPE_FIELD = '22PC7idvhRzp';

interface RawHit {
  id: string;
  name: string;
  createdAt: string;
  quantity: number | null;
  unitCost: number | null;
  unitPrice: number | null;
  cost: number;
  price: number;
  unit: { name: string } | null;
  costType: { name: string } | null;
  job: { id: string; name: string } | null;
  document: {
    id: string; type: string; status: string; name: string; issueDate: string | null;
    account: { name: string; type: string } | null;
  } | null;
}

/** One search per term, then the top jobs' context. */
export async function searchHistory(
  client: Reader,
  terms: string[],
  opts: HistoryOptions = {},
): Promise<HistoryReport> {
  const maxJobs = opts.maxJobsPerTerm ?? MAX_JOBS;
  const out: HistoryHits[] = [];
  const seen = new Set<string>();
  for (const raw of terms) {
    const term = raw.trim().toLowerCase();
    if (!term || seen.has(term)) continue;
    seen.add(term);
    const hits = await searchTerm(client, term);
    const jobs = groupByJob(hits, opts.excludeJobId).slice(0, maxJobs);
    if (opts.context !== false) {
      for (const job of jobs.slice(0, CONTEXT_JOBS)) await addContext(client, job);
    }
    out.push({ term, raw: hits.length, jobs });
  }
  return { terms: out };
}

async function searchTerm(client: Reader, term: string): Promise<RawHit[]> {
  const like = `%${term}%`;
  const res = await client.query<{ organization: { costItems: { nodes: RawHit[] } } }>({
    organization: {
      $: { id: client.organizationId },
      costItems: {
        $: {
          size: PAGE,
          where: {
            and: [
              { or: [[['name'], 'like', like], [['description'], 'like', like]] },
              [['job', 'id'], '!=', null],
            ],
          },
          sortBy: [{ field: 'createdAt', order: 'desc' }],
        },
        nodes: {
          id: {}, name: {}, createdAt: {}, quantity: {}, unitCost: {}, unitPrice: {}, cost: {}, price: {},
          unit: { name: {} },
          costType: { name: {} },
          job: { id: {}, name: {} },
          document: {
            id: {}, type: {}, status: {}, name: {}, issueDate: {},
            account: { name: {}, type: {} },
          },
        },
      },
    },
  });
  return res.organization.costItems.nodes;
}

/** Placeholders, credits, time tracking, test jobs and the job itself are not history. */
export function isEvidence(hit: RawHit, excludeJobId?: string): boolean {
  if (!hit.job) return false;
  if (excludeJobId && hit.job.id === excludeJobId) return false;
  if (isTestJob(hit.job.name)) return false;
  if (hit.costType?.name === 'Clock In') return false;
  const unitCost = hit.unitCost ?? 0;
  if (unitCost <= 0 && hit.cost <= 0) return false;
  return true;
}

export function whereOf(doc: RawHit['document']): Where {
  if (!doc) return 'budget';
  switch (doc.type) {
    case 'customerOrder': return /change order/i.test(doc.name) ? 'change order' : 'estimate';
    case 'customerInvoice': return 'invoice';
    case 'vendorOrder': return /purchase order/i.test(doc.name) ? 'purchase order' : 'work order';
    case 'vendorBill': return 'vendor bill';
    case 'bidRequest': return 'bid request';
    default: return 'estimate';
  }
}

export function strengthOf(doc: RawHit['document']): Strength {
  if (!doc) return 'draft';
  const approved = doc.status === 'approved';
  switch (doc.type) {
    case 'vendorBill': return approved ? 'billed' : 'ordered';
    case 'customerOrder':
    case 'customerInvoice': return approved ? 'sold' : 'draft';
    case 'vendorOrder': return 'ordered';
    case 'bidRequest': return 'quoted';
    default: return 'draft';
  }
}

export function toLine(hit: RawHit): HistoryLine {
  const doc = hit.document;
  return {
    id: hit.id,
    name: hit.name,
    when: (doc?.issueDate ?? hit.createdAt).slice(0, 10),
    where: whereOf(doc),
    status: doc?.status ?? null,
    vendor: doc && doc.account?.type === 'vendor' ? doc.account.name : null,
    quantity: hit.quantity,
    unit: hit.unit?.name ?? null,
    unitCost: hit.unitCost,
    unitPrice: hit.unitPrice,
    cost: hit.cost,
    price: hit.price,
    costTypeName: hit.costType?.name ?? null,
    strength: strengthOf(doc),
    documentId: doc?.id ?? null,
  };
}

/** Jobs ordered by their best line, best line first within each. */
export function groupByJob(hits: RawHit[], excludeJobId?: string): HistoryJob[] {
  const byJob = new Map<string, HistoryJob>();
  for (const h of hits) {
    if (!isEvidence(h, excludeJobId)) continue;
    const job = byJob.get(h.job!.id) ?? {
      jobId: h.job!.id, jobName: h.job!.name, description: null, projectType: null, lines: [], context: [],
    };
    job.lines.push(toLine(h));
    byJob.set(job.jobId, job);
  }
  const byStrength = (a: HistoryLine, b: HistoryLine): number =>
    STRENGTH_ORDER[a.strength] - STRENGTH_ORDER[b.strength] || b.when.localeCompare(a.when);
  const jobs = [...byJob.values()];
  for (const j of jobs) j.lines.sort(byStrength);
  jobs.sort((a, b) => byStrength(a.lines[0]!, b.lines[0]!));
  return jobs;
}

/** The job's description and project type, and the other lines beside its strongest match. */
async function addContext(client: Reader, job: HistoryJob): Promise<void> {
  const res = await client.query<{
    job: {
      description: string | null;
      customFieldValues: { nodes: { value: unknown; customField: { id: string } }[] };
    } | null;
  }>({
    job: {
      $: { id: job.jobId },
      description: {},
      customFieldValues: { $: { size: 20, where: [['customField', 'id'], '=', PROJECT_TYPE_FIELD] }, nodes: { value: {}, customField: { id: {} } } },
    },
  });
  job.description = res.job?.description?.trim() || null;
  const pt = res.job?.customFieldValues.nodes.find((n) => typeof n.value === 'string');
  job.projectType = pt ? (pt.value as string) : null;

  const docId = job.lines[0]?.documentId ?? null;
  if (!docId) return;
  const doc = await client.query<{ document: { costItems: { nodes: { id: string; name: string; quantity: number | null; unit: { name: string } | null }[] } } | null }>({
    document: {
      $: { id: docId },
      costItems: { $: { size: 40, sortBy: [{ field: 'position' }] }, nodes: { id: {}, name: {}, quantity: {}, unit: { name: {} } } },
    },
  });
  const own = new Set(job.lines.map((l) => l.id));
  job.context = (doc.document?.costItems.nodes ?? [])
    .filter((n) => !own.has(n.id))
    .map((n) => ({ name: n.name, quantity: n.quantity, unit: n.unit?.name ?? null }));
}

// ---- the text the model reads -------------------------------------------------

function money(n: number | null): string {
  return n === null ? '—' : `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function qty(n: number | null, unit: string | null): string {
  if (n === null) return unit ? `(no quantity) ${unit}` : '(no quantity)';
  const q = Number.isInteger(n) ? String(n) : n.toFixed(2).replace(/\.?0+$/, '');
  return unit ? `${q} ${unit}` : q;
}

/** Deterministic, so a dry run and a test show exactly what the model sees. */
export function historyText(report: HistoryReport): string {
  const out: string[] = [];
  out.push('# Past DB work matching the search terms');
  out.push(
    'Each line is a real cost item on a real job. [billed] is a vendor bill DB paid; [sold] is on an approved ' +
      'estimate, change order or invoice; [ordered] is a work or purchase order; [quoted] a bid request; ' +
      '[draft] a budget or unsent document. Test jobs, the job being drafted, $0 placeholders and credits are left out.',
  );
  for (const t of report.terms) {
    const shown = t.jobs.reduce((n, j) => n + j.lines.length, 0);
    out.push(`\n## "${t.term}" — ${t.raw} matching line${t.raw === 1 ? '' : 's'}, ${shown} shown on ${t.jobs.length} job${t.jobs.length === 1 ? '' : 's'}`);
    if (t.jobs.length === 0) out.push('(nothing usable: no past DB work matches this term)');
    for (const j of t.jobs) {
      out.push(`\n### ${j.jobName}${j.projectType ? ` (${j.projectType})` : ''}${j.description ? ` — ${j.description.replace(/\s+/g, ' ').slice(0, 160)}` : ''}`);
      for (const l of j.lines) {
        out.push(
          `- [${l.strength}] ${l.name} · ${qty(l.quantity, l.unit)} · unit cost ${money(l.unitCost)}` +
            (l.unitPrice !== null ? ` · unit price ${money(l.unitPrice)}` : '') +
            ` · line cost ${money(l.cost)}` +
            ` · ${l.costTypeName ?? 'no cost type'} · ${l.where}${l.status ? ` (${l.status})` : ''}${l.vendor ? ` from ${l.vendor}` : ''} · ${l.when}`,
        );
      }
      if (j.context.length) {
        out.push(`  Also on that document: ${j.context.map((c) => `${c.name} ${qty(c.quantity, c.unit)}`).join('; ')}`);
      }
    }
  }
  return out.join('\n');
}
