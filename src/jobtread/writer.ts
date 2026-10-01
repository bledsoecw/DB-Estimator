/**
 * The one place this project writes to JobTread.
 *
 * `JobTreadClient` is read-only by construction and refuses every mutation
 * (client.ts, `assertReadOnly`). That guard stays. This file is the deliberate
 * exception the guard's comment asked for: a second client, under a second
 * grant key, that issues only the mutations named in `ALLOWED_MUTATIONS` and
 * nothing else — and `updateJob` only with the inputs `ALLOWED_INPUTS` names.
 * Adding a mutation means adding it to that list in a commit.
 *
 * Rules:
 *   - The key comes from JOBTREAD_WRITE_GRANT_KEY, never from the read key, so
 *     a machine set up for drafting cannot write by accident.
 *   - No automatic retry. A mutation that timed out may still have happened;
 *     retrying it would create the thing twice. The caller reads JobTread and
 *     decides.
 *   - Every call is logged before it is sent, so the terminal shows what was
 *     about to change even if the process dies mid-flight.
 */

import { JobTreadError } from './client.ts';

const DEFAULT_URL = 'https://api.jobtread.com/pave';

/** The mutations this project is allowed to issue. Anything else is refused before it is sent. */
export const ALLOWED_MUTATIONS: ReadonlySet<string> = new Set(['createCostItem', 'createCostGroup', 'deleteCostGroup', 'updateJob']);

/**
 * Mutations allowed only with these input keys. `updateJob` could rename a
 * job or replace its whole budget (`lineItems`); here it may only set the
 * job parameters the contingency formula reads.
 */
export const ALLOWED_INPUTS: ReadonlyMap<string, ReadonlySet<string>> = new Map([
  ['updateJob', new Set(['id', 'parameters'])],
]);

export interface WriterOptions {
  grantKey: string;
  organizationId: string;
  url?: string;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
  log?: (line: string) => void;
}

export class JobTreadWriter {
  readonly organizationId: string;
  #grantKey: string;
  #url: string;
  #timeoutMs: number;
  #fetch: typeof fetch;
  #log: (line: string) => void;

  constructor(opts: WriterOptions) {
    if (!opts.grantKey) throw new Error('JOBTREAD_WRITE_GRANT_KEY is not set');
    if (!opts.organizationId) throw new Error('JOBTREAD_ORGANIZATION_ID is not set');
    this.organizationId = opts.organizationId;
    this.#grantKey = opts.grantKey;
    this.#url = opts.url ?? process.env['JOBTREAD_API_URL'] ?? DEFAULT_URL;
    this.#timeoutMs = opts.timeoutMs ?? 60_000;
    this.#fetch = opts.fetchImpl ?? globalThis.fetch;
    this.#log = opts.log ?? ((s) => process.stderr.write(`${s}\n`));
  }

  /** Issue one mutation. The query's root keys must all be allowed. */
  async mutate<T = unknown>(query: Record<string, unknown>): Promise<T> {
    assertAllowed(query);
    this.#log(`jobtread write: ${Object.keys(query).filter((k) => k !== '$').join(', ')}`);
    const body = JSON.stringify({ query: { $: { grantKey: this.#grantKey }, ...query } });
    let res: Response;
    try {
      res = await this.#fetch(this.#url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body,
        signal: AbortSignal.timeout(this.#timeoutMs),
      });
    } catch (err) {
      throw new JobTreadError(
        `the write did not get an answer (${String(err)}). It MAY have happened: read JobTread before running it again.`,
      );
    }
    const text = await res.text();
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      const head = text.trim().replace(/\s+/g, ' ').slice(0, 120);
      throw new JobTreadError(`Pave returned HTTP ${res.status} with a non-JSON body${head ? `: ${head}` : ''}`, res.status, text.slice(0, 2000));
    }
    const err = describeError(parsed);
    if (!res.ok || err) throw new JobTreadError(err ?? `HTTP ${res.status}`, res.status, parsed);
    return parsed as T;
  }
}

/** Refuse a query with any root key that is not an allowed mutation. */
export function assertAllowed(query: Record<string, unknown>): void {
  const keys = Object.keys(query).filter((k) => k !== '$');
  if (keys.length === 0) throw new Error('Refusing an empty write.');
  for (const key of keys) {
    if (!ALLOWED_MUTATIONS.has(key)) {
      throw new Error(
        `Refusing to issue "${key}": only ${[...ALLOWED_MUTATIONS].join(', ')} are allowed (src/jobtread/writer.ts).`,
      );
    }
    const allowed = ALLOWED_INPUTS.get(key);
    if (allowed) {
      const node = query[key];
      const input = node && typeof node === 'object' ? (node as Record<string, unknown>)['$'] : undefined;
      const inputKeys = input && typeof input === 'object' ? Object.keys(input as Record<string, unknown>) : [];
      const extra = inputKeys.filter((k) => !allowed.has(k));
      if (extra.length) {
        throw new Error(
          `Refusing "${key}" with ${extra.map((k) => `"${k}"`).join(', ')}: only ${[...allowed].join(', ')} may be set (src/jobtread/writer.ts).`,
        );
      }
    }
  }
}

function describeError(parsed: unknown): string | null {
  if (parsed && typeof parsed === 'object') {
    const o = parsed as Record<string, unknown>;
    if (typeof o['error'] === 'string') return o['error'];
    if (o['error'] && typeof o['error'] === 'object') {
      const e = o['error'] as Record<string, unknown>;
      if (typeof e['message'] === 'string') return e['message'];
    }
    if (Array.isArray(o['errors']) && o['errors'].length > 0) {
      return o['errors'].map((x) => (typeof x === 'string' ? x : JSON.stringify(x))).join('; ');
    }
  }
  return null;
}

export function writerFromEnv(env: NodeJS.ProcessEnv = process.env): JobTreadWriter {
  const key = env['JOBTREAD_WRITE_GRANT_KEY'] ?? '';
  if (!key) {
    throw new Error(
      'JOBTREAD_WRITE_GRANT_KEY is not set. Writing to JobTread needs its own grant key, separate from the read key ' +
        '(JobTread › Settings › Integrations › Grants: a grant with catalog write access). Put it in .env.',
    );
  }
  if (key === env['JOBTREAD_GRANT_KEY']) {
    throw new Error('JOBTREAD_WRITE_GRANT_KEY is the same key as JOBTREAD_GRANT_KEY. The read key stays read-only; make a separate grant for writes.');
  }
  return new JobTreadWriter({
    grantKey: key,
    organizationId: env['JOBTREAD_ORGANIZATION_ID'] ?? '',
    ...(env['JOBTREAD_API_URL'] ? { url: env['JOBTREAD_API_URL'] } : {}),
  });
}
