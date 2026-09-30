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
        parsed_output: unknown;
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
 * could take over ten minutes (3600 × max_tokens / 128000 seconds; 32,000
 * tokens is fifteen), and the draft's reply can be long. The stream is only
 * accumulated here: `finalMessage()` carries the same `parsed_output`.
 */
export function anthropicStructuredCall(client: StreamingClient): StructuredCall {
  return async ({ model, system, content, schema, maxTokens }) => {
    const stream = client.messages.stream({
      model,
      max_tokens: maxTokens,
      system,
      output_config: { format: zodOutputFormat(schema), effort: 'high' },
      messages: [{ role: 'user', content }],
    });
    const message = await stream.finalMessage();
    return {
      parsed: message.parsed_output,
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
    throw new Error(`the ${what} reply was cut off (max_tokens); nothing was used`);
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
