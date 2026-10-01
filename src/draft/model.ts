/**
 * One structured call to the model, behind an interface.
 *
 * The drafter makes two calls with two schemas (see prompt.ts). Both go
 * through this so the whole path is testable offline with a fake, so a
 * refusal or a cut-off reply is an error rather than a half-draft, and so
 * cost is accounted for in one place. Anthropic's SDK is the only way out
 * of the building here, and only when a key is set.
 */

import type Anthropic from '@anthropic-ai/sdk';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import type { z } from 'zod';
import { type ModelReply, type Usage, costOf } from '../scope/review.ts';

export { DEFAULT_MODEL, PRICING, costOf, type Usage } from '../scope/review.ts';

export interface StructuredArgs<T> {
  model: string;
  system: string;
  content: Anthropic.ContentBlockParam[];
  schema: z.ZodType<T>;
  maxTokens: number;
}

/** Fakeable: the tests hand back canned replies without a key. */
export type StructuredCall = <T>(args: StructuredArgs<T>) => Promise<ModelReply>;

/**
 * What the real call needs of the SDK client: `messages.stream`. Narrow so a
 * test can hand in a fake; a real `Anthropic` satisfies it.
 */
export interface StreamingClient {
  messages: {
    stream(params: Anthropic.MessageStreamParams): {
      finalMessage(): Promise<{
        content: { type: string; text?: string }[];
        stop_reason: string | null;
        usage: {
          input_tokens: number;
          output_tokens: number;
          cache_read_input_tokens?: number | null;
          cache_creation_input_tokens?: number | null;
        };
      }>;
    };
  };
}

/**
 * The real call. Structured output, so the reply is the schema or nothing.
 *
 * Streamed, because the SDK refuses a non-streaming request whose max_tokens
 * could take over ten minutes (3600 × max_tokens / 128000 seconds), and the
 * replies can be long: on Claude Opus 5.5 the model's thinking is always on
 * and counts against max_tokens with the answer.
 *
 * The schema goes without the SDK's own parser. With it, `finalMessage()`
 * parses the text whatever the stop reason, so a reply cut off at
 * max_tokens throws "Unterminated string in JSON" (laptop run on 25-0000,
 * 2026-10-01) instead of saying it was cut off. Here the stop reason comes
 * back first and the text is parsed only when the reply ended.
 */
export function anthropicStructuredCall(client: StreamingClient): StructuredCall {
  return async ({ model, system, content, schema, maxTokens }) => {
    const { parse: _sdkParse, ...format } = zodOutputFormat(schema);
    void _sdkParse;
    const stream = client.messages.stream({
      model,
      max_tokens: maxTokens,
      system,
      output_config: { format, effort: 'high' },
      messages: [{ role: 'user', content }],
    });
    const message = await stream.finalMessage();
    const { parsed, parseError } = readReply(message);
    return {
      parsed,
      ...(parseError ? { parseError } : {}),
      stopReason: message.stop_reason,
      usage: {
        input: message.usage.input_tokens,
        output: message.usage.output_tokens,
        cacheRead: message.usage.cache_read_input_tokens ?? 0,
        cacheWrite: message.usage.cache_creation_input_tokens ?? 0,
      },
    };
  };
}

/** The reply's JSON, parsed only when the reply ended normally. A cut-off or refused reply has none. */
export function readReply(message: { content: { type: string; text?: string }[]; stop_reason: string | null }): { parsed: unknown; parseError: string | null } {
  if (message.stop_reason === 'max_tokens' || message.stop_reason === 'refusal') return { parsed: null, parseError: null };
  const text = message.content.filter((b) => b.type === 'text').map((b) => b.text ?? '').join('');
  if (!text.trim()) return { parsed: null, parseError: 'the reply had no text' };
  try {
    return { parsed: JSON.parse(text), parseError: null };
  } catch (err) {
    return { parsed: null, parseError: err instanceof Error ? err.message : String(err) };
  }
}

/** Run one call and insist on a whole, schema-shaped reply. `what` names the step in errors. */
export async function runStructured<T>(
  call: StructuredCall,
  args: StructuredArgs<T>,
  what: string,
): Promise<{ data: T; usage: Usage; cost: number | null }> {
  const reply = await call(args);
  if (reply.stopReason === 'refusal') {
    throw new Error(`the model declined to ${what} (stop_reason: refusal)`);
  }
  if (reply.stopReason === 'max_tokens') {
    throw new Error(`the ${what} reply was cut off at ${args.maxTokens.toLocaleString('en-US')} tokens (max_tokens); nothing was used`);
  }
  if (reply.parseError) {
    throw new Error(`the ${what} reply was not valid JSON (${reply.parseError}); nothing was used`);
  }
  const parsed = args.schema.safeParse(reply.parsed);
  if (!parsed.success) {
    throw new Error(`the ${what} reply did not fit the schema: ${parsed.error.message}`);
  }
  return { data: parsed.data, usage: reply.usage, cost: costOf(args.model, reply.usage) };
}

export const NO_USAGE: Usage = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 };

export function addUsage(a: Usage, b: Usage): Usage {
  return {
    input: a.input + b.input,
    output: a.output + b.output,
    cacheRead: a.cacheRead + b.cacheRead,
    cacheWrite: a.cacheWrite + b.cacheWrite,
  };
}
