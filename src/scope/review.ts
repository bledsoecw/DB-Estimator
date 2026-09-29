/**
 * Run the scope review and turn it into findings the report already knows
 * how to show, judge and copy out.
 *
 * The model call is behind an interface so the whole path is testable
 * offline and so a dry run can stop short of spending money. What the
 * model returns is validated against the schema before anything is shown;
 * a reply that does not fit is an error, not a finding.
 */

import type Anthropic from '@anthropic-ai/sdk';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import { ReviewSchema, SYSTEM_PROMPT, buildUserContent, type Review } from './prompt.ts';
import type { ScopePacket } from './packet.ts';
import type { Finding } from '../rules/types.ts';

/** Claude Opus 5.5. The current Opus, and the default for anything that reads documents. */
export const DEFAULT_MODEL = 'claude-opus-5-5';

/** Dollars per million tokens, Anthropic first-party rates. Kept in one place to audit. */
export const PRICING: Record<string, { input: number; output: number; cacheRead: number }> = {
  'claude-opus-5-5': { input: 4, output: 20, cacheRead: 0.2 },
  'claude-sonnet-5-5': { input: 2, output: 10, cacheRead: 0.2 },
  'claude-fable-5-1': { input: 10, output: 50, cacheRead: 0.25 },
};

export interface Usage {
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
}

export interface ModelReply {
  parsed: unknown;
  stopReason: string | null;
  usage: Usage;
}

export interface ModelCall {
  (args: { model: string; system: string; content: Anthropic.ContentBlockParam[] }): Promise<ModelReply>;
}

export interface ScopeResult {
  review: Review;
  findings: Finding[];
  model: string;
  usage: Usage;
  /** US dollars, from PRICING. Null when the model is not in the table. */
  cost: number | null;
}

/** The real call. Structured output, so the reply is the schema or nothing. */
export function anthropicCall(client: Anthropic): ModelCall {
  return async ({ model, system, content }) => {
    const message = await client.messages.parse({
      model,
      max_tokens: 16000,
      system,
      output_config: { format: zodOutputFormat(ReviewSchema), effort: 'high' },
      messages: [{ role: 'user', content }],
    });
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

export async function reviewScope(
  packet: ScopePacket,
  call: ModelCall,
  model: string = DEFAULT_MODEL,
): Promise<ScopeResult> {
  const reply = await call({ model, system: SYSTEM_PROMPT, content: buildUserContent(packet) });
  if (reply.stopReason === 'refusal') {
    throw new Error('the model declined to review this estimate (stop_reason: refusal)');
  }
  if (reply.stopReason === 'max_tokens') {
    throw new Error('the review was cut off (max_tokens); nothing was shown');
  }
  const parsed = ReviewSchema.safeParse(reply.parsed);
  if (!parsed.success) {
    throw new Error(`the model's reply did not fit the schema: ${parsed.error.message}`);
  }
  return {
    review: parsed.data,
    findings: toFindings(parsed.data),
    model,
    usage: reply.usage,
    cost: costOf(model, reply.usage),
  };
}

export function costOf(model: string, u: Usage): number | null {
  const p = PRICING[model];
  if (!p) return null;
  return (u.input * p.input + u.output * p.output + u.cacheRead * p.cacheRead) / 1_000_000;
}

const KIND_LABEL: Record<Review['findings'][number]['kind'], string> = {
  missing: 'Possibly missing',
  quantity: 'Quantity to confirm',
  vendor: 'Differs from the quote',
  question: 'Question for the rep',
};

/** One card per finding, in the shape the report, the verdicts and the notes already use. */
export function toFindings(review: Review): Finding[] {
  return review.findings.map((f) => ({
    rule: `scope.${f.kind}`,
    severity: 'data',
    title: f.title,
    detail: `${f.detail}${f.suggestion ? ` ${f.suggestion}` : ''} (${KIND_LABEL[f.kind]}, ${f.confidence} confidence.)`,
    math: [
      ...f.evidence.map((e) => ({ label: e.source, value: e.quote })),
      ...(f.lines.length ? [{ label: 'estimate lines', value: f.lines.join(' · ') }] : []),
    ],
    actions: ['Send back to the rep', 'Fine as is'],
  }));
}

/** A rough token count for the dry run. Photos and PDF pages dominate. */
export function estimateTokens(p: ScopePacket, text: string): number {
  let n = Math.ceil(text.length / 4);
  for (const a of p.attachments) {
    if (a.file.type === 'application/pdf') n += Math.ceil(a.bytes.length / 60_000) * 2_500 + 500;
    else n += 1_600;
  }
  return n;
}
