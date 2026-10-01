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
 * The sub's quote is usually a file on the work order or change order the
 * line sits on — "6466 Dennis Myers_Epoxy Quote.pdf" hangs off the Myers
 * work order, and it is where the square footage lives that the line does
 * not carry. So for the top jobs the files on the matched lines' documents
 * are read too, and failing that the job's files whose name or description
 * carries the search term. A job with 1,156 migrated files is never scanned.
 *
 * And the other way round: every job's files are searched by name and
 * description for the term, because a sub's quote is often filed under the
 * trade's name ("Epoxy Quote.pdf") on a job whose line is called something
 * else ("Flooring - Sub"). A job found only by its files is read through the
 * document the file hangs on: its lines, whatever they are named, are the
 * evidence beside the quote.
 *
 * The sub's own paper goes first. On 25-0000 (2026-10-01) the epoxy term
 * had one file's turn, and it went to DB's 491 KB change-order scan, not to
 * Rhino's 26 KB quote on the work order, which is where the square footage
 * is. So a file on a work order, purchase order, vendor bill or bid request
 * ranks above anything else, then a PDF named for a quote or bid, then DB's
 * own change orders and invoices; plain photos are not read. Each chosen
 * file is read on its own before the history call (readings.ts), and a file
 * read on an earlier run is not downloaded again.
 *
 * This file only finds and describes. The model decides which past lines
 * apply and shows its arithmetic (prompt.ts); the code prices from the
 * number it cites (draft.ts). Read-only.
 */

import type { Reader } from '../jobtread/queries.ts';
import { isTestJob } from '../jobtread/queries.ts';
import { httpDownload, type Downloader, type ScopeFile } from '../scope/packet.ts';
import { readingText, type FileReading } from './readings.ts';

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
  /** "files" when no line matched and the job was found by a quote or file named for the term. */
  foundBy?: 'lines' | 'files';
  description: string | null;
  projectType: string | null;
  lines: HistoryLine[];
  /** Other lines on the strongest line's document, for scale: "Flooring 650 Square Foot". */
  context: { name: string; quantity: number | null; unit: string | null }[];
  /** Quotes, bids and invoices found beside the matched lines. Sent when downloaded. */
  files: HistoryFile[];
}

export interface HistoryFile extends ScopeFile {
  /** Where it was found: on the matched line's document, or by searching the job's files for the term. */
  foundOn: string;
  /** The document the file hangs on, when it hangs on one. A file on a work order is the sub's own paper. */
  onDocument?: FileDocument | null;
  /** Why it was left out, when it was. Null when it went to the model. */
  skipped: string | null;
  /** What it says, read on its own (readings.ts). readBefore is when, if it was read on an earlier run. */
  reading?: FileReading & { readBefore: string | null };
}

export interface FileDocument {
  /** JobTread's document type: vendorOrder, vendorBill, bidRequest, customerOrder, customerInvoice. */
  type: string;
  name: string;
  /** The sub or supplier on a vendor document. */
  vendor: string | null;
}

export interface HistoryAttachment {
  jobName: string;
  file: HistoryFile;
  bytes: Uint8Array;
}

export interface HistoryHits {
  term: string;
  /** Matching lines before test jobs, the current job and placeholders were dropped. */
  raw: number;
  jobs: HistoryJob[];
}

export interface HistoryReport {
  terms: HistoryHits[];
  /** Downloaded files, for the model. Not part of a fixture. */
  attachments?: HistoryAttachment[];
}

export interface HistoryOptions {
  /** The job being drafted; its own lines are not history. */
  excludeJobId?: string;
  maxJobsPerTerm?: number;
  /** Fetch the other lines on each top job's strongest document. On by default. */
  context?: boolean;
  /** Search every job's files for the term too. On by default. */
  files?: boolean;
  /** How to fetch a file. null lists files without downloading; undefined downloads over HTTP. */
  download?: Downloader | null;
  /** What a file said when it was read on an earlier run; such a file is not downloaded again. */
  readingOf?: (file: HistoryFile) => { reading: FileReading; readAt: string } | null;
}

export const FILE_LIMITS = {
  perJob: 3,
  /**
   * Files newly read in one run, dealt out across the search terms in turns
   * so the first term searched cannot take them all. Files read on an
   * earlier run do not count: their readings are kept.
   */
  total: 20,
  maxFileBytes: 8 * 1024 * 1024,
  maxTotalBytes: 24 * 1024 * 1024,
};

/** A quote is what turns a lump sum into a rate. */
const QUOTE_LIKE = /quote|bid|proposal|estimate|invoice|statement|contract/i;
const QUOTE_NAME = /quote|bid|proposal|estimate/i;
/** DB's own paper to the customer: it carries DB's price, rarely the sub's size. */
const CUSTOMER_PAPER = /change order|invoice|statement/i;
const VENDOR_DOCS = new Set(['vendorOrder', 'vendorBill', 'bidRequest']);

/**
 * The order files are read in, lower first. 0: a PDF on a work order,
 * purchase order, vendor bill or bid request, the sub's or supplier's own
 * paper. 1: a PDF named for a quote, bid or proposal. 2: DB's own change
 * order or invoice. 3: any other PDF. 4: a photo of a quote. Pure.
 */
export function fileRank(f: { name: string; description: string | null; type: string; onDocument?: FileDocument | null }): number {
  const text = `${f.name} ${f.description ?? ''}`;
  const onVendorDoc = !!f.onDocument && VENDOR_DOCS.has(f.onDocument.type);
  if (f.type !== 'application/pdf') return 4;
  if (onVendorDoc) return 0;
  if ((f.onDocument && !onVendorDoc) || CUSTOMER_PAPER.test(text)) return 2;
  return QUOTE_NAME.test(text) ? 1 : 3;
}

/** A photo is read only when it is of a quote: named for one, or on a vendor's document. */
function isPlainPhoto(f: { name: string; description: string | null; type: string; onDocument?: FileDocument | null }): boolean {
  if (f.type === 'application/pdf') return false;
  if (f.onDocument && VENDOR_DOCS.has(f.onDocument.type)) return false;
  return !QUOTE_LIKE.test(`${f.name} ${f.description ?? ''}`);
}

export function fileDocument(doc: { type: string; name: string; account: { name: string; type: string } | null } | null | undefined): FileDocument | null {
  if (!doc) return null;
  return { type: doc.type, name: doc.name, vendor: doc.account?.type === 'vendor' ? doc.account.name : null };
}

const PAGE = 50;
const MAX_JOBS = 5;
const CONTEXT_JOBS = 3;
/** Documents per job whose files are read: the strongest line's, then vendor documents, where the sub's quote hangs. */
const FILE_DOCS = 4;
/** Jobs a term may add that no line matched, found by their files alone. */
const MAX_FILE_JOBS = 2;
const FILE_PAGE = 20;
/** Lines read from the document a found file hangs on. */
const FILE_DOC_LINES = 25;
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

  // 1. Search every term and read the top jobs' context and file lists.
  for (const raw of terms) {
    const term = raw.trim().toLowerCase();
    if (!term || seen.has(term)) continue;
    seen.add(term);
    const hits = await searchTerm(client, term);
    const jobs = groupByJob(hits, opts.excludeJobId).slice(0, maxJobs);
    if (opts.context !== false) {
      for (const job of jobs.slice(0, CONTEXT_JOBS)) await addContext(client, job, term);
    }
    if (opts.files !== false) {
      const known = new Set(jobs.map((j) => j.jobId));
      const byJob = groupFilesByJob(await searchFiles(client, term), opts.excludeJobId).filter((g) => !known.has(g.jobId));
      for (const g of byJob.slice(0, MAX_FILE_JOBS)) jobs.push(await fileJob(client, g, term));
    }
    out.push({ term, raw: hits.length, jobs });
  }

  // 2. Files read on an earlier run keep their reading and are not fetched again.
  if (opts.readingOf) {
    for (const t of out) {
      for (const j of t.jobs) {
        for (const f of j.files) {
          if (f.skipped !== null) continue;
          const known = opts.readingOf(f);
          if (known) f.reading = { ...known.reading, readBefore: known.readAt };
        }
      }
    }
  }

  // 3. Decide which of the rest are read, fairly across the terms; 4. fetch them.
  const chosen = chooseAttachments(out);
  const attachments: HistoryAttachment[] = [];
  const download = opts.download === undefined ? httpDownload : opts.download;
  if (download) {
    let totalBytes = 0;
    for (const { job, file } of chosen) {
      if (totalBytes + file.size > FILE_LIMITS.maxTotalBytes) { file.skipped = 'over the size budget for one read'; continue; }
      try {
        const bytes = await download(file.url);
        attachments.push({ jobName: job.jobName, file, bytes });
        totalBytes += bytes.length;
      } catch (err) {
        file.skipped = `could not be downloaded: ${err instanceof Error ? err.message : String(err)}`;
      }
    }
  }
  return { terms: out, attachments };
}

/**
 * Which listed files are read this run, in download order.
 *
 * The first live run searched the painting terms before "epoxy", and the
 * painting jobs' files took the whole budget: the two Rhino quotes were
 * listed as "found but not attached", and the epoxy lump sum stayed a lump
 * sum. So the budget is dealt out in turns, one file per term per round,
 * in fileRank order (the sub's own quote first), the best job's first. A
 * file that appears under two terms is read once; a file read on an earlier
 * run is not read again and costs no turn. Everything not chosen is marked
 * with why. Pure.
 */
export function chooseAttachments(
  hits: HistoryHits[],
  limits: { total: number } = FILE_LIMITS,
): { job: HistoryJob; file: HistoryFile }[] {
  // Per term, its candidates in the order it would like them read: the sub's
  // own quote from any of its top jobs first; the best job first among equals.
  const queues = hits.map((h) =>
    h.jobs
      .flatMap((job, jobIndex) =>
        job.files
          .filter((f) => f.skipped === null && !f.reading)
          .map((file) => ({ term: h.term, job, jobIndex, file })),
      )
      .sort((a, b) => fileRank(a.file) - fileRank(b.file) || a.jobIndex - b.jobIndex),
  );
  const chosen: { job: HistoryJob; file: HistoryFile }[] = [];
  const attachedAs = new Map<string, string>(); // name|size -> the term it went in under
  const keyOf = (f: HistoryFile): string => `${f.name.toLowerCase()}|${f.size}`;
  let progressed = true;
  while (chosen.length < limits.total && progressed) {
    progressed = false;
    for (const q of queues) {
      if (chosen.length >= limits.total) break;
      // A file already read under another term does not cost this term its turn.
      let next = q.shift();
      while (next && attachedAs.has(keyOf(next.file))) {
        next.file.skipped = `the same file is read under "${attachedAs.get(keyOf(next.file))}"`;
        next = q.shift();
      }
      if (!next) continue;
      progressed = true;
      attachedAs.set(keyOf(next.file), next.term);
      chosen.push({ job: next.job, file: next.file });
    }
  }
  for (const q of queues) {
    for (const left of q) {
      const under = attachedAs.get(keyOf(left.file));
      left.file.skipped = under
        ? `the same file is read under "${under}"`
        : `this run's ${limits.total}-file reading budget went to closer matches`;
    }
  }
  return chosen;
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

interface RawDoc {
  id: string; type: string; status: string; name: string; issueDate: string | null;
  account: { name: string; type: string } | null;
}

export interface RawFileHit {
  id: string; name: string; type: string; size: number; createdAt: string; url: string; description: string | null;
  job: { id: string; name: string } | null;
  document: RawDoc | null;
}

const DOC_FIELDS = { id: {}, type: {}, status: {}, name: {}, issueDate: {}, account: { name: {}, type: {} } } as const;

/**
 * Has new sub paper come in for any of these terms since the price book
 * learned them? Carl, 2026-10-01: "what when a new quote comes in after you
 * cache?" A line on a work order, purchase order, vendor bill or bid
 * request, or a file named for the term, created since then on a real job
 * other than this one. Returns what came in, or null. One query per term.
 */
export async function newSince(client: Reader, terms: string[], since: string, excludeJobId?: string): Promise<string | null> {
  for (const raw of terms) {
    const term = raw.trim().toLowerCase();
    if (!term) continue;
    const like = `%${term}%`;
    const named = { or: [[['name'], 'like', like], [['description'], 'like', like]] };
    const recent = [['createdAt'], '>', since];
    const onJob = [['job', 'id'], '!=', null];
    const res = await client.query<{
      organization: {
        costItems: { nodes: { name: string; createdAt: string; job: { id: string; name: string } | null; document: { name: string } | null }[] };
        files: { nodes: { name: string; createdAt: string; job: { id: string; name: string } | null }[] };
      };
    }>({
      organization: {
        $: { id: client.organizationId },
        costItems: {
          $: {
            size: 10,
            where: { and: [named, onJob, recent, { or: [...VENDOR_DOCS].map((t) => [['document', 'type'], '=', t]) }] },
            sortBy: [{ field: 'createdAt', order: 'desc' }],
          },
          nodes: { name: {}, createdAt: {}, job: { id: {}, name: {} }, document: { name: {} } },
        },
        files: {
          $: { size: 10, where: { and: [named, onJob, recent] }, sortBy: [{ field: 'createdAt', order: 'desc' }] },
          nodes: { name: {}, createdAt: {}, job: { id: {}, name: {} } },
        },
      },
    });
    const real = (j: { id: string; name: string } | null): j is { id: string; name: string } =>
      !!j && j.id !== excludeJobId && !isTestJob(j.name);
    const line = res.organization.costItems.nodes.find((n) => real(n.job));
    if (line) return `"${line.name}" on a ${line.document?.name ?? 'vendor document'} for ${line.job!.name}, ${line.createdAt.slice(0, 10)}`;
    const file = res.organization.files.nodes.find((n) => real(n.job));
    if (file) return `"${file.name}" on ${file.job!.name}, ${file.createdAt.slice(0, 10)}`;
  }
  return null;
}

/** Every job's files whose name or description carries the term: quotes, bids and invoices filed under the trade's name. */
async function searchFiles(client: Reader, term: string): Promise<RawFileHit[]> {
  const like = `%${term}%`;
  const res = await client.query<{ organization: { files: { nodes: RawFileHit[] } } }>({
    organization: {
      $: { id: client.organizationId },
      files: {
        $: {
          size: FILE_PAGE,
          where: { and: [{ or: [[['name'], 'like', like], [['description'], 'like', like]] }, [['job', 'id'], '!=', null]] },
          sortBy: [{ field: 'createdAt', order: 'desc' }],
        },
        nodes: { id: {}, name: {}, type: {}, size: {}, createdAt: {}, url: {}, description: {}, job: { id: {}, name: {} }, document: DOC_FIELDS },
      },
    },
  });
  return res.organization.files.nodes;
}

/** Found files by job, the job with a quote-like file first, then the newest; never a test job or the job itself. Pure. */
export function groupFilesByJob(hits: RawFileHit[], excludeJobId?: string): { jobId: string; jobName: string; files: RawFileHit[] }[] {
  const byJob = new Map<string, { jobId: string; jobName: string; files: RawFileHit[] }>();
  for (const f of hits) {
    if (!f.job || f.job.id === excludeJobId || isTestJob(f.job.name)) continue;
    const g = byJob.get(f.job.id) ?? { jobId: f.job.id, jobName: f.job.name, files: [] };
    g.files.push(f);
    byJob.set(f.job.id, g);
  }
  const quoted = (g: { files: RawFileHit[] }): number =>
    g.files.some((f) => QUOTE_LIKE.test(f.name) || QUOTE_LIKE.test(f.description ?? '')) ? 0 : 1;
  return [...byJob.values()].sort((a, b) => quoted(a) - quoted(b));
}

/**
 * A job found by its files alone: its description, the lines on the
 * documents the files hang on (the change order or work order the quote was
 * attached to), and the files themselves.
 */
async function fileJob(client: Reader, g: { jobId: string; jobName: string; files: RawFileHit[] }, term: string): Promise<HistoryJob> {
  const job: HistoryJob = {
    jobId: g.jobId, jobName: g.jobName, foundBy: 'files', description: null, projectType: null, lines: [], context: [], files: [],
  };
  await readJobHead(client, job);
  const docs = [...new Map(g.files.filter((f) => f.document).map((f) => [f.document!.id, f.document!])).values()].slice(0, 2);
  for (const doc of docs) {
    const res = await client.query<{ document: { costItems: { nodes: Omit<RawHit, 'job' | 'document'>[] } } | null }>({
      document: {
        $: { id: doc.id },
        costItems: {
          $: { size: FILE_DOC_LINES, sortBy: [{ field: 'position' }] },
          nodes: { id: {}, name: {}, createdAt: {}, quantity: {}, unitCost: {}, unitPrice: {}, cost: {}, price: {}, unit: { name: {} }, costType: { name: {} } },
        },
      },
    });
    for (const n of res.document?.costItems.nodes ?? []) {
      const hit: RawHit = { ...n, job: { id: g.jobId, name: g.jobName }, document: doc };
      if (isEvidence(hit)) job.lines.push(toLine(hit));
    }
  }
  job.lines.sort((a, b) => STRENGTH_ORDER[a.strength] - STRENGTH_ORDER[b.strength] || b.when.localeCompare(a.when));
  job.files = selectHistoryFiles(g.files.map((f) => ({
    file: f,
    foundOn: f.document ? `the ${whereOf(f.document)}, named for "${term}"` : `the job's files, named for "${term}"`,
  })));
  return job;
}

/** The job's description and project type. */
async function readJobHead(client: Reader, job: HistoryJob): Promise<void> {
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
    const job: HistoryJob = byJob.get(h.job!.id) ?? {
      jobId: h.job!.id, jobName: h.job!.name, foundBy: 'lines', description: null, projectType: null, lines: [], context: [], files: [],
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

const FILE_FIELDS = { id: {}, name: {}, type: {}, size: {}, createdAt: {}, url: {}, description: {}, document: DOC_FIELDS } as const;

interface RawFile {
  id: string; name: string; type: string; size: number; createdAt: string; url: string; description: string | null;
  /** The document the file hangs on. Absent in older fixtures. */
  document?: RawDoc | null;
}

/**
 * The job's description and project type, the other lines beside its
 * strongest match, and the files: on the matched lines' documents (the
 * strongest line's, then the work orders and vendor bills, where the sub's
 * quote is attached), then any job file named for the term.
 */
/**
 * Which documents' files are read, in order: the strongest line's (its
 * other lines are the context), then the vendor documents, then the rest.
 * On Myers the epoxy line sat on a change order, an invoice and the work
 * order; only the work order carries Rhino's quote. Pure.
 */
export function fileDocIds(lines: HistoryLine[]): string[] {
  const ids = [...new Set(lines.map((l) => l.documentId).filter((d): d is string => !!d))];
  if (ids.length === 0) return [];
  const vendorish = new Set<Where>(['work order', 'purchase order', 'vendor bill', 'bid request']);
  const isVendor = (id: string): boolean => lines.some((l) => l.documentId === id && vendorish.has(l.where));
  const [first, ...rest] = ids;
  return [first!, ...rest.filter(isVendor), ...rest.filter((id) => !isVendor(id))].slice(0, FILE_DOCS);
}

async function addContext(client: Reader, job: HistoryJob, term: string): Promise<void> {
  await readJobHead(client, job);

  const found: { file: RawFile; foundOn: string }[] = [];
  const docIds = fileDocIds(job.lines);
  for (const [i, docId] of docIds.entries()) {
    const line = job.lines.find((l) => l.documentId === docId)!;
    const doc = await client.query<{
      document: {
        costItems?: { nodes: { id: string; name: string; quantity: number | null; unit: { name: string } | null }[] };
        files: { nodes: RawFile[] };
      } | null;
    }>({
      document: {
        $: { id: docId },
        ...(i === 0
          ? { costItems: { $: { size: 40, sortBy: [{ field: 'position' }] }, nodes: { id: {}, name: {}, quantity: {}, unit: { name: {} } } } }
          : {}),
        files: { $: { size: 10 }, nodes: FILE_FIELDS },
      },
    });
    if (i === 0) {
      const own = new Set(job.lines.map((l) => l.id));
      job.context = (doc.document?.costItems?.nodes ?? [])
        .filter((n) => !own.has(n.id))
        .map((n) => ({ name: n.name, quantity: n.quantity, unit: n.unit?.name ?? null }));
    }
    for (const f of doc.document?.files.nodes ?? []) found.push({ file: f, foundOn: `the ${line.where}` });
  }
  const like = `%${term}%`;
  const byName = await client.query<{ job: { files: { nodes: RawFile[] } } | null }>({
    job: {
      $: { id: job.jobId },
      files: {
        $: { size: 10, where: { or: [[['name'], 'like', like], [['description'], 'like', like]] }, sortBy: [{ field: 'createdAt', order: 'desc' }] },
        nodes: FILE_FIELDS,
      },
    },
  });
  for (const f of byName.job?.files.nodes ?? []) found.push({ file: f, foundOn: `the job's files, named for "${term}"` });
  job.files = selectHistoryFiles(found);
}

const READABLE = new Set(['application/pdf', 'image/jpeg', 'image/png', 'image/gif', 'image/webp']);

/**
 * Which found files go to the model, and why the rest do not. Pure. In
 * fileRank order (the sub's own quote first), one copy of a file uploaded
 * twice (the copy on a document wins), at most FILE_LIMITS.perJob a job.
 * A photo is read only when it is of a quote.
 */
export function selectHistoryFiles(found: { file: RawFile; foundOn: string }[]): HistoryFile[] {
  const out: HistoryFile[] = [];
  const seen = new Set<string>();
  const ordered = found
    .map(({ file, foundOn }) => {
      const hf: HistoryFile = {
        id: file.id, name: file.name, type: file.type, size: file.size, createdAt: file.createdAt, url: file.url,
        description: file.description?.trim() || null, foundOn, onDocument: fileDocument(file.document), skipped: null,
      };
      return hf;
    })
    .map((hf, i) => ({ hf, i }))
    .sort((a, b) => fileRank(a.hf) - fileRank(b.hf) || Number(!!b.hf.onDocument) - Number(!!a.hf.onDocument) || a.i - b.i)
    .map(({ hf }) => hf);
  let kept = 0;
  for (const hf of ordered) {
    const key = `${hf.name.toLowerCase()}|${hf.size}`;
    if (seen.has(key)) continue; // the same upload twice: not even worth listing
    seen.add(key);
    if (!READABLE.has(hf.type)) hf.skipped = `not a PDF or photo (${hf.type})`;
    else if (/companycam_report/i.test(hf.name)) hf.skipped = 'a photo report';
    else if (isPlainPhoto(hf)) hf.skipped = 'a photo, not a quote; quotes and other papers are read';
    else if (hf.size > FILE_LIMITS.maxFileBytes) hf.skipped = `larger than ${Math.round(FILE_LIMITS.maxFileBytes / 1024 / 1024)} MB`;
    else if (kept >= FILE_LIMITS.perJob) hf.skipped = `more than ${FILE_LIMITS.perJob} files on this job; the first were sent`;
    else kept++;
    out.push(hf);
  }
  return out;
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
  const shownUnder = new Map<string, string>(); // name|size -> the term its reading was shown under
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
      if (j.foundBy === 'files') {
        out.push(j.lines.length
          ? `  Found by a file named for "${t.term}", not by a line: these are the lines on the document that file is attached to, whatever they are named. Read the file for what they cover.`
          : `  Found by a file named for "${t.term}", not by a line; the file is not on a document with priced lines. Read it for the price.`);
      }
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
      for (const f of j.files.filter((x) => x.reading)) {
        const key = `${f.name.toLowerCase()}|${f.size}`;
        const under = shownUnder.get(key);
        if (under !== undefined) {
          out.push(`  Read from "${f.name}": shown above under "${under}".`);
          continue;
        }
        shownUnder.set(key, t.term);
        out.push(
          `  Read from "${f.name}"${f.description ? ` (${f.description})` : ''}, on ${f.foundOn}` +
            `${f.onDocument?.vendor ? ` from ${f.onDocument.vendor}` : ''}, uploaded ${f.createdAt.slice(0, 10)}: ${readingText(f.reading!)}`,
        );
      }
      const sent = j.files.filter((f) => !f.skipped && !f.reading);
      const left = j.files.filter((f) => f.skipped);
      if (sent.length) {
        out.push(`  Files on this job not read this run: ${sent.map((f) => `"${f.name}"${f.description ? ` (${f.description})` : ''}, from ${f.foundOn}, ${f.createdAt.slice(0, 10)}`).join('; ')}`);
      }
      if (left.length) {
        out.push(`  Files found but not read: ${left.map((f) => `"${f.name}": ${f.skipped}`).join('; ')}`);
      }
    }
  }
  return out.join('\n');
}
