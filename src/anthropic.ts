/**
 * The one place an Anthropic client is made, and the check that runs before
 * anything is spent.
 *
 * Two things went wrong on the first live run that a free call would have
 * caught: a key created at the organization level is refused with "must
 * include the anthropic-workspace-id header", and a console with no credit
 * refuses everything. Both are 4xx responses to any request, so the CLI asks
 * for the model's own record first (`models.retrieve`, which costs nothing)
 * and stops with a plain sentence if that fails. Only then does it send the
 * photos.
 */

import Anthropic from '@anthropic-ai/sdk';

export const WORKSPACE_HEADER = 'anthropic-workspace-id';

/**
 * A client from `.env`. `ANTHROPIC_WORKSPACE_ID` is needed only for a key
 * scoped to the organization rather than to a workspace; a workspace key
 * carries its workspace and needs no header.
 */
export function anthropicFromEnv(env: NodeJS.ProcessEnv = process.env): Anthropic {
  const apiKey = env['ANTHROPIC_API_KEY'];
  if (!apiKey) {
    throw new Error('ANTHROPIC_API_KEY is not set. Add it to .env, or use --dry-run to see what would be sent.');
  }
  const workspace = env['ANTHROPIC_WORKSPACE_ID']?.trim();
  return new Anthropic({
    apiKey,
    ...(workspace ? { defaultHeaders: { [WORKSPACE_HEADER]: workspace } } : {}),
  });
}

export interface Preflight {
  ok: boolean;
  /** One sentence for the terminal: what is wrong and what to do. Empty when ok. */
  reason: string;
}

/** What the check needs of a client. Fakeable. */
export interface ModelLookup {
  models: { retrieve(modelId: string): Promise<unknown> };
}

/**
 * Prove the key, its workspace and the billing work before a paid call.
 * `models.retrieve` is free and answers with the same 4xx a real request
 * would, so a failure here is the failure the draft would have hit, caught
 * for nothing.
 */
export async function preflight(client: ModelLookup, model: string): Promise<Preflight> {
  try {
    await client.models.retrieve(model);
    return { ok: true, reason: '' };
  } catch (err) {
    return { ok: false, reason: describePreflightError(err, model) };
  }
}

export function describePreflightError(err: unknown, model: string): string {
  // A connection error is an APIError with no status in this SDK, so it is
  // told apart first; otherwise it reads as "answered an error".
  if (err instanceof Anthropic.APIConnectionError) {
    return `Could not reach api.anthropic.com: ${firstLine(err.message)}. Check the network, or a proxy in the way.`;
  }
  if (err instanceof Anthropic.APIError) {
    const msg = err.message ?? '';
    if (err.status === 400 && /workspace/i.test(msg)) {
      return (
        'The API key is scoped to the organization, not to a workspace. Either create the key ' +
        'inside a workspace in the Anthropic Console (Workspaces › your workspace › API keys), or ' +
        `add ANTHROPIC_WORKSPACE_ID=wrkspc_... to .env and the ${WORKSPACE_HEADER} header is sent for you.`
      );
    }
    if (err.status === 401) return 'The API key was rejected (401). Check ANTHROPIC_API_KEY in .env; a key is shown once when created.';
    if (err.status === 402 || /credit|billing|balance/i.test(msg)) {
      return `The console has no usable credit (${err.status}): ${firstLine(msg)}. Add funds under Billing in the Anthropic Console.`;
    }
    if (err.status === 403) return `The key is not allowed to do this (403): ${firstLine(msg)}`;
    if (err.status === 404) return `The model ${model} is not available to this key (404). Check --model or the console's model access.`;
    if (err.status === 429) return `Rate limited before anything was sent (429): ${firstLine(msg)}. Wait a minute and try again.`;
    return `Anthropic answered ${err.status ?? 'an error'} before anything was sent: ${firstLine(msg)}`;
  }
  return `The pre-flight check failed: ${err instanceof Error ? firstLine(err.message) : String(err)}`;
}

function firstLine(s: string): string {
  return s.split('\n')[0]!.trim().slice(0, 240);
}
