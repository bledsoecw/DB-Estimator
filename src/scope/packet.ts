/**
 * Everything a reviewer reads about a job before judging its estimate.
 *
 * The pricing checks look at the estimate alone. The scope review looks at
 * the estimate AGAINST the job: what the rep wrote down at discovery, what
 * the customer picked at the selections meeting, what the suppliers quoted,
 * what the site photos show. On 261209 Hunter_Bathroom that is 43 comments,
 * four supplier quotes, twenty-odd CompanyCam photos and 59 lines whose
 * descriptions state the scope in words. Kristen reads all of it today.
 *
 * The packet is assembled here and handed to a model (see review.ts). Only
 * material that existed when the estimate was issued goes in: receipts and
 * delivery tickets uploaded after the fact would tell the model the answer
 * on an approved estimate and would not exist on a draft.
 *
 * Read-only. Nothing here writes to JobTread.
 */

import type { JobTreadClient } from '../jobtread/client.ts';
import { JOB_TYPE_FIELD, PROJECT_TYPE_FIELD } from '../jobtread/queries.ts';

export interface ScopeLine {
  id: string;
  name: string;
  description: string | null;
  quantity: number | null;
  unit: string | null;
  unitCost: number | null;
  unitPrice: number | null;
  price: number | null;
  /** "Parent › Group" as the customer sees it. */
  group: string | null;
}

export interface ScopeComment {
  at: string;
  who: string;
  message: string;
  fromEmail: boolean;
}

export interface ScopeFile {
  id: string;
  name: string;
  type: string;
  size: number;
  createdAt: string;
  url: string;
  description: string | null;
}

export interface ScopeAttachment {
  file: ScopeFile;
  bytes: Uint8Array;
}

export interface ScopePacket {
  documentId: string;
  documentName: string;
  jobId: string;
  jobName: string;
  jobType: string | null;
  projectType: string | null;
  jobDescription: string | null;
  /** The estimate's issue date; files after it are not evidence. Null on a draft. */
  issueDate: string | null;
  lines: ScopeLine[];
  comments: ScopeComment[];
  included: ScopeFile[];
  excluded: { file: ScopeFile; reason: string }[];
  attachments: ScopeAttachment[];
  /** Files that were selected but could not be downloaded, with why. */
  failed: { file: ScopeFile; reason: string }[];
}

export interface FileLimits {
  /** Site photos are numerous; the earliest ones are the discovery set. */
  maxImages: number;
  maxFileBytes: number;
  maxTotalBytes: number;
}

export const DEFAULT_LIMITS: FileLimits = {
  maxImages: 40,
  maxFileBytes: 8 * 1024 * 1024,
  maxTotalBytes: 24 * 1024 * 1024,
};

const IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/gif', 'image/webp']);

/**
 * Which files go to the model, and why the rest do not. Pure, so it can be
 * tested and so the dry run can print exactly what a real run would send.
 */
export function selectFiles(
  files: ScopeFile[],
  issueDate: string | null,
  limits: FileLimits = DEFAULT_LIMITS,
): { included: ScopeFile[]; excluded: { file: ScopeFile; reason: string }[] } {
  const included: ScopeFile[] = [];
  const excluded: { file: ScopeFile; reason: string }[] = [];
  // Files uploaded on the issue date itself still count: the cutoff is the
  // end of that day.
  const cutoff = issueDate ? Date.parse(`${issueDate}T23:59:59.999Z`) : null;
  const seen = new Set<string>();
  let images = 0;
  let total = 0;

  const ordered = [...files].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  // PDFs (quotes, contracts) carry the most per byte, so they take the size
  // budget first; photos fill what is left.
  const pdfsFirst = [
    ...ordered.filter((f) => f.type === 'application/pdf'),
    ...ordered.filter((f) => f.type !== 'application/pdf'),
  ];

  for (const f of pdfsFirst) {
    const isImage = IMAGE_TYPES.has(f.type);
    const isPdf = f.type === 'application/pdf';
    if (!isImage && !isPdf) { excluded.push({ file: f, reason: `not a photo or PDF (${f.type})` }); continue; }
    if (cutoff !== null && Date.parse(f.createdAt) > cutoff) {
      excluded.push({ file: f, reason: `uploaded after the estimate was issued (${f.createdAt.slice(0, 10)})` });
      continue;
    }
    if (/companycam_report/i.test(f.name)) {
      excluded.push({ file: f, reason: 'photo report — the photos themselves are sent instead' });
      continue;
    }
    const key = `${f.name}|${f.size}`;
    if (seen.has(key)) { excluded.push({ file: f, reason: 'duplicate upload of the same file' }); continue; }
    if (f.size > limits.maxFileBytes) {
      excluded.push({ file: f, reason: `larger than ${mb(limits.maxFileBytes)}` });
      continue;
    }
    if (isImage && images >= limits.maxImages) {
      excluded.push({ file: f, reason: `more than ${limits.maxImages} photos; the earliest are sent` });
      continue;
    }
    if (total + f.size > limits.maxTotalBytes) {
      excluded.push({ file: f, reason: `over the ${mb(limits.maxTotalBytes)} budget for one review` });
      continue;
    }
    seen.add(key);
    included.push(f);
    total += f.size;
    if (isImage) images++;
  }
  return { included, excluded };
}

function mb(bytes: number): string {
  return `${Math.round(bytes / (1024 * 1024))} MB`;
}

export type Downloader = (url: string) => Promise<Uint8Array>;

/** The default download: the signed CDN links JobTread hands out need no auth. */
export const httpDownload: Downloader = async (url) => {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return new Uint8Array(await res.arrayBuffer());
};

interface Raw {
  document: {
    id: string;
    name: string;
    issueDate: string | null;
    job: {
      id: string;
      name: string;
      description: string | null;
      customFieldValues: { nodes: { value: unknown; customField: { id: string } }[] };
      comments: {
        nextPage: string | null;
        nodes: {
          createdAt: string;
          message: string | null;
          isFromEmail: boolean;
          createdByUser: { name: string } | null;
        }[];
      };
      files: { nextPage: string | null; nodes: RawFile[] };
    };
    costGroups: { nodes: { id: string; name: string; parentCostGroup: { id: string } | null }[] };
    costItems: { nextPage: string | null; nodes: RawLine[] };
  } | null;
}

interface RawFile {
  id: string; name: string; type: string; size: number; createdAt: string; url: string;
  description: string | null;
}

interface RawLine {
  id: string; name: string; description: string | null; quantity: number | null;
  unitCost: number | null; unitPrice: number | null; price: number | null;
  isSpecification: boolean;
  unit: { name: string } | null;
  costGroup: { id: string } | null;
}

const PAGE = 100;

/** Fetch the packet for one estimate. `download` is injectable for tests and dry runs. */
export async function fetchScopePacket(
  client: JobTreadClient,
  documentId: string,
  opts: { download?: Downloader | null; limits?: FileLimits } = {},
): Promise<ScopePacket> {
  const head = await client.query<Raw>({
    document: {
      $: { id: documentId },
      id: {}, name: {}, issueDate: {},
      job: {
        id: {}, name: {}, description: {},
        customFieldValues: { $: { size: 20 }, nodes: { value: {}, customField: { id: {} } } },
        comments: {
          $: { size: PAGE, sortBy: [{ field: 'createdAt' }] },
          nextPage: {},
          nodes: { createdAt: {}, message: {}, isFromEmail: {}, createdByUser: { name: {} } },
        },
        files: {
          $: { size: PAGE, sortBy: [{ field: 'createdAt' }] },
          nextPage: {},
          nodes: FILE_FIELDS,
        },
      },
      costGroups: { $: { size: PAGE }, nodes: { id: {}, name: {}, parentCostGroup: { id: {} } } },
      costItems: {
        $: { size: PAGE, sortBy: [{ field: 'position' }] },
        nextPage: {},
        nodes: LINE_FIELDS,
      },
    },
  });
  const doc = head.document;
  if (!doc) throw new Error(`document ${documentId} not found`);

  const files = await drainJobFiles(client, doc.job.id, doc.job.files);
  const rawLines = await drainLines(client, documentId, doc.costItems);

  const groupName = new Map(doc.costGroups.nodes.map((g) => [g.id, g]));
  const pathOf = (id: string | undefined): string | null => {
    if (!id) return null;
    const g = groupName.get(id);
    if (!g) return null;
    const parent = g.parentCostGroup ? groupName.get(g.parentCostGroup.id) : undefined;
    return parent ? `${parent.name} › ${g.name}` : g.name;
  };

  const lines: ScopeLine[] = rawLines
    .filter((l) => !l.isSpecification)
    .map((l) => ({
      id: l.id,
      name: l.name,
      description: l.description?.trim() || null,
      quantity: l.quantity,
      unit: l.unit?.name ?? null,
      unitCost: l.unitCost,
      unitPrice: l.unitPrice,
      price: l.price,
      group: pathOf(l.costGroup?.id),
    }));

  const comments: ScopeComment[] = doc.job.comments.nodes
    .filter((c) => c.message && c.message.trim() && c.message.trim() !== 'No message provided')
    .map((c) => ({
      at: c.createdAt,
      who: c.createdByUser?.name ?? 'unknown',
      message: c.message!.trim(),
      fromEmail: c.isFromEmail,
    }));

  const fields = doc.job.customFieldValues.nodes;
  const fieldValue = (id: string): string | null => {
    const hit = fields.find((n) => n.customField.id === id && typeof n.value === 'string');
    return hit ? (hit.value as string) : null;
  };

  const { included, excluded } = selectFiles(files, doc.issueDate, opts.limits ?? DEFAULT_LIMITS);

  const attachments: ScopeAttachment[] = [];
  const failed: { file: ScopeFile; reason: string }[] = [];
  const download = opts.download === undefined ? httpDownload : opts.download;
  if (download) {
    for (const file of included) {
      try {
        attachments.push({ file, bytes: await download(file.url) });
      } catch (err) {
        // A file that will not download is reported, not silently dropped:
        // the model must not be asked to judge scope it was never shown.
        failed.push({ file, reason: err instanceof Error ? err.message : String(err) });
      }
    }
  }

  return {
    documentId: doc.id,
    documentName: doc.name,
    jobId: doc.job.id,
    jobName: doc.job.name,
    jobType: fieldValue(JOB_TYPE_FIELD),
    projectType: fieldValue(PROJECT_TYPE_FIELD),
    jobDescription: doc.job.description?.trim() || null,
    issueDate: doc.issueDate,
    lines,
    comments,
    included,
    excluded,
    attachments,
    failed,
  };
}

const FILE_FIELDS = {
  id: {}, name: {}, type: {}, size: {}, createdAt: {}, url: {}, description: {},
} as const;

const LINE_FIELDS = {
  id: {}, name: {}, description: {}, quantity: {}, unitCost: {}, unitPrice: {}, price: {},
  isSpecification: {},
  unit: { name: {} },
  costGroup: { id: {} },
} as const;

async function drainJobFiles(
  client: JobTreadClient,
  jobId: string,
  first: { nextPage: string | null; nodes: RawFile[] },
): Promise<ScopeFile[]> {
  const all = [...first.nodes];
  let page = first.nextPage;
  while (page && all.length < 1000) {
    const res = await client.query<{ job: { files: { nextPage: string | null; nodes: RawFile[] } } }>({
      job: {
        $: { id: jobId },
        files: { $: { size: PAGE, page, sortBy: [{ field: 'createdAt' }] }, nextPage: {}, nodes: FILE_FIELDS },
      },
    });
    const c = res.job?.files;
    if (!c || c.nodes.length === 0) break;
    all.push(...c.nodes);
    page = c.nextPage;
  }
  return all.map((f) => ({ ...f, description: f.description?.trim() || null }));
}

async function drainLines(
  client: JobTreadClient,
  documentId: string,
  first: { nextPage: string | null; nodes: RawLine[] },
): Promise<RawLine[]> {
  const all = [...first.nodes];
  let page = first.nextPage;
  while (page && all.length < 1000) {
    const res = await client.query<{ document: { costItems: { nextPage: string | null; nodes: RawLine[] } } }>({
      document: {
        $: { id: documentId },
        costItems: { $: { size: PAGE, page, sortBy: [{ field: 'position' }] }, nextPage: {}, nodes: LINE_FIELDS },
      },
    });
    const c = res.document?.costItems;
    if (!c || c.nodes.length === 0) break;
    all.push(...c.nodes);
    page = c.nextPage;
  }
  return all;
}
