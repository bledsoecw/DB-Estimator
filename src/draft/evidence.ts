/**
 * What the rep brought back from the site, as JobTread holds it.
 *
 * Before an estimate exists there is no document to hang anything on, so the
 * drafter reads the JOB: its description, the discovery notes the rep typed
 * into the conversation (on 261323 Haag_Remodel that is a full meeting
 * summary with the room measured at 18'4" x 38'6"), the CompanyCam photos
 * uploaded from the visit, any drawings or quotes, and whatever already sits
 * in the budget. That is the same material the scope review reads for a
 * finished estimate; the file selection is shared with it.
 *
 * Read-only. Nothing here writes to JobTread.
 */

import type { Reader } from '../jobtread/queries.ts';
import { JOB_TYPE_FIELD, PROJECT_TYPE_FIELD, fetchBudget } from '../jobtread/queries.ts';
import {
  DEFAULT_LIMITS, httpDownload, selectFiles,
  type Downloader, type FileLimits, type ScopeAttachment, type ScopeComment, type ScopeFile,
} from '../scope/packet.ts';

export interface BudgetSummary {
  /** Top-level group names already on the budget. */
  groups: string[];
  lines: number;
  /** Lines carrying a cost or a price: real scope somebody already entered. */
  pricedLines: number;
}

export interface JobEvidence {
  jobId: string;
  jobName: string;
  jobNumber: string | null;
  description: string | null;
  jobType: string | null;
  projectType: string | null;
  city: string | null;
  comments: ScopeComment[];
  files: ScopeFile[];
  included: ScopeFile[];
  excluded: { file: ScopeFile; reason: string }[];
  attachments: ScopeAttachment[];
  failed: { file: ScopeFile; reason: string }[];
  budget: BudgetSummary | null;
}

const CITY_FIELD_NAME = 'City Job Is Located';
const PAGE = 100;

/**
 * A job by id, by the six-digit number in its name ("261323"), or by the
 * hyphenated number JobTread stores ("26-1323"). Reps know the number.
 */
export async function resolveJobId(client: Reader, ref: string): Promise<{ id: string; name: string }> {
  const r = ref.trim();
  let where: unknown;
  if (/^\d{6}$/.test(r)) where = [['name'], 'like', `${r}%`];
  else if (/^\d{2}-\d{4}$/.test(r)) where = [['number'], '=', r];
  else return { id: r, name: r };

  const res = await client.query<{ organization: { jobs: { nodes: { id: string; name: string }[] } } }>({
    organization: {
      $: { id: client.organizationId },
      jobs: { $: { size: 5, where }, nodes: { id: {}, name: {} } },
    },
  });
  const jobs = res.organization.jobs.nodes;
  if (jobs.length === 0) throw new Error(`no job matches ${ref}`);
  if (jobs.length > 1) {
    throw new Error(`${jobs.length} jobs match ${ref}: ${jobs.map((j) => `${j.name} (${j.id})`).join(', ')}`);
  }
  return jobs[0]!;
}

interface RawJob {
  id: string;
  name: string;
  number: string | null;
  description: string | null;
  customFieldValues: { nodes: { value: unknown; customField: { id: string; name: string } }[] };
  comments: {
    nextPage: string | null;
    nodes: { createdAt: string; message: string | null; isFromEmail: boolean; createdByUser: { name: string } | null }[];
  };
  files: { nextPage: string | null; nodes: RawFile[] };
}

interface RawFile {
  id: string; name: string; type: string; size: number; createdAt: string; url: string;
  description: string | null;
}

const FILE_FIELDS = {
  id: {}, name: {}, type: {}, size: {}, createdAt: {}, url: {}, description: {},
} as const;

export interface EvidenceOptions {
  /** null skips downloads (a dry run); undefined downloads over HTTP. */
  download?: Downloader | null;
  limits?: FileLimits;
  /** Read the budget too. Off for tests that only have a job. */
  budget?: boolean;
}

export async function fetchJobEvidence(
  client: Reader,
  jobId: string,
  opts: EvidenceOptions = {},
): Promise<JobEvidence> {
  const res = await client.query<{ job: RawJob | null }>({
    job: {
      $: { id: jobId },
      id: {}, name: {}, number: {}, description: {},
      customFieldValues: { $: { size: 30 }, nodes: { value: {}, customField: { id: {}, name: {} } } },
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
  });
  const job = res.job;
  if (!job) throw new Error(`job ${jobId} not found`);

  const files = (await drainFiles(client, jobId, job.files)).map((f) => ({
    ...f,
    description: f.description?.trim() || null,
  }));

  const comments: ScopeComment[] = job.comments.nodes
    .filter((c) => c.message && c.message.trim() && c.message.trim() !== 'No message provided')
    .map((c) => ({
      at: c.createdAt,
      who: c.createdByUser?.name ?? 'unknown',
      message: c.message!.trim(),
      fromEmail: c.isFromEmail,
    }));

  const fields = job.customFieldValues.nodes;
  const byId = (id: string): string | null => {
    const hit = fields.find((n) => n.customField.id === id && typeof n.value === 'string');
    return hit ? (hit.value as string) : null;
  };
  const byName = (name: string): string | null => {
    const hit = fields.find((n) => n.customField.name === name && typeof n.value === 'string');
    return hit ? (hit.value as string) : null;
  };

  // No estimate yet, so nothing is "after the issue date": every file counts.
  const { included, excluded } = selectFiles(files, null, opts.limits ?? DEFAULT_LIMITS);

  const attachments: ScopeAttachment[] = [];
  const failed: { file: ScopeFile; reason: string }[] = [];
  const download = opts.download === undefined ? httpDownload : opts.download;
  if (download) {
    for (const file of included) {
      try {
        attachments.push({ file, bytes: await download(file.url) });
      } catch (err) {
        failed.push({ file, reason: err instanceof Error ? err.message : String(err) });
      }
    }
  }

  let budget: BudgetSummary | null = null;
  if (opts.budget !== false) {
    const b = await fetchBudget(client, jobId);
    budget = {
      groups: b.costGroups.nodes.filter((g) => !g.parentCostGroup).map((g) => g.name),
      lines: b.costItems.count,
      pricedLines: b.costItems.nodes.filter((i) => i.cost !== 0 || i.price !== 0).length,
    };
  }

  return {
    jobId: job.id,
    jobName: job.name,
    jobNumber: job.number,
    description: job.description?.trim() || null,
    jobType: byId(JOB_TYPE_FIELD),
    projectType: byId(PROJECT_TYPE_FIELD),
    city: byName(CITY_FIELD_NAME),
    comments,
    files,
    included,
    excluded,
    attachments,
    failed,
    budget,
  };
}

async function drainFiles(
  client: Reader,
  jobId: string,
  first: { nextPage: string | null; nodes: RawFile[] },
): Promise<RawFile[]> {
  const all = [...first.nodes];
  let page = first.nextPage;
  while (page && all.length < 1000) {
    const res = await client.query<{ job: { files: { nextPage: string | null; nodes: RawFile[] } } | null }>({
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
  return all;
}
