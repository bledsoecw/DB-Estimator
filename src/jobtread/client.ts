/**
 * JobTread Pave API client.
 *
 * Everything is a single POST to /pave. The body is one `query` object holding
 * the grant key under `$.grantKey`, mirroring the shape the MCP connector and
 * the JobTread docs both use:
 *
 *   POST https://api.jobtread.com/pave
 *   { "query": { "$": { "grantKey": "grant_..." }, "organization": { ... } } }
 *
 * This client is READ-ONLY by construction. There is no method here that issues
 * a create/update/delete mutation, and v0.5 has no reason to grow one. The
 * corresponding grant should be scoped to reads as well (docs/ROADMAP.md 19.2) —
 * two independent layers, because a check is weaker than an absent capability.
 */

const DEFAULT_URL = 'https://api.jobtread.com/pave';

/** Mutation prefixes that must never appear in a query issued by this client. */
const MUTATION_PREFIXES = ['create', 'update', 'delete', 'send', 'submit', 'copy', 'rerun', 'cancel'];

export class JobTreadError extends Error {
  // Written out rather than declared as constructor parameter properties:
  // Node's --experimental-strip-types removes types without transforming, and
  // parameter properties are syntax it refuses.
  readonly status: number | undefined;
  readonly body: unknown;

  constructor(message: string, status?: number, body?: unknown) {
    super(message);
    this.name = 'JobTreadError';
    this.status = status;
    this.body = body;
  }
}

export interface ClientOptions {
  grantKey: string;
  organizationId: string;
  url?: string;
  /** Requests per second. JobTread publishes no limit, so throttle defensively. */
  requestsPerSecond?: number;
  timeoutMs?: number;
  maxRetries?: number;
  fetchImpl?: typeof fetch;
}

export class JobTreadClient {
  readonly organizationId: string;
  #grantKey: string;
  #url: string;
  #minIntervalMs: number;
  #timeoutMs: number;
  #maxRetries: number;
  #fetch: typeof fetch;
  #lastRequestAt = 0;
  #queue: Promise<unknown> = Promise.resolve();

  constructor(opts: ClientOptions) {
    if (!opts.grantKey) throw new Error('JOBTREAD_GRANT_KEY is not set');
    if (!opts.organizationId) throw new Error('JOBTREAD_ORGANIZATION_ID is not set');
    this.organizationId = opts.organizationId;
    this.#grantKey = opts.grantKey;
    this.#url = opts.url ?? process.env['JOBTREAD_API_URL'] ?? DEFAULT_URL;
    this.#minIntervalMs = 1000 / (opts.requestsPerSecond ?? 4);
    this.#timeoutMs = opts.timeoutMs ?? 60_000;
    this.#maxRetries = opts.maxRetries ?? 3;
    this.#fetch = opts.fetchImpl ?? globalThis.fetch;
  }

  /**
   * Run one read query. `query` is the Pave graph without the `$` root input —
   * the grant key is attached here so it never has to appear in calling code.
   */
  async query<T = unknown>(query: Record<string, unknown>): Promise<T> {
    assertReadOnly(query);
    // Serialize and rate-limit: one in flight, spaced by #minIntervalMs.
    const run = this.#queue.then(() => this.#execute<T>(query));
    this.#queue = run.catch(() => undefined);
    return run;
  }

  async #execute<T>(query: Record<string, unknown>): Promise<T> {
    const wait = this.#lastRequestAt + this.#minIntervalMs - Date.now();
    if (wait > 0) await sleep(wait);

    const body = JSON.stringify({ query: { $: { grantKey: this.#grantKey }, ...query } });

    let lastError: unknown;
    for (let attempt = 0; attempt <= this.#maxRetries; attempt++) {
      if (attempt > 0) await sleep(Math.min(2 ** attempt * 500, 8000));
      this.#lastRequestAt = Date.now();

      let res: Response;
      try {
        res = await this.#fetch(this.#url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body,
          signal: AbortSignal.timeout(this.#timeoutMs),
        });
      } catch (err) {
        lastError = err;
        continue; // network or timeout — retryable
      }

      if (res.status === 429 || res.status >= 500) {
        lastError = new JobTreadError(`HTTP ${res.status} from Pave`, res.status);
        continue;
      }

      const text = await res.text();
      let parsed: unknown;
      try {
        parsed = JSON.parse(text);
      } catch {
        throw new JobTreadError('Pave returned a non-JSON body', res.status, text.slice(0, 2000));
      }

      if (!res.ok) {
        throw new JobTreadError(describeError(parsed) ?? `HTTP ${res.status}`, res.status, parsed);
      }
      // Pave reports query errors with HTTP 200 and an error field.
      const described = describeError(parsed);
      if (described) throw new JobTreadError(described, res.status, parsed);

      return parsed as T;
    }
    throw new JobTreadError(
      `Pave request failed after ${this.#maxRetries + 1} attempts: ${String(lastError)}`,
    );
  }
}

/**
 * Refuse to issue anything that looks like a mutation.
 *
 * This is belt to the grant's braces. If someone later adds a write path they
 * have to delete this guard deliberately rather than slip one past review.
 */
export function assertReadOnly(query: Record<string, unknown>): void {
  for (const key of Object.keys(query)) {
    if (key === '$' || key === '_') continue;
    const lower = key.toLowerCase();
    for (const prefix of MUTATION_PREFIXES) {
      if (lower.startsWith(prefix)) {
        throw new Error(
          `Refusing to issue "${key}": this client is read-only (src/jobtread/client.ts).`,
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

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export function clientFromEnv(env: NodeJS.ProcessEnv = process.env): JobTreadClient {
  return new JobTreadClient({
    grantKey: env['JOBTREAD_GRANT_KEY'] ?? '',
    organizationId: env['JOBTREAD_ORGANIZATION_ID'] ?? '',
    ...(env['JOBTREAD_API_URL'] ? { url: env['JOBTREAD_API_URL'] } : {}),
  });
}
