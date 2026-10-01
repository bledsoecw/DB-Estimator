/**
 * Reading the subs' and vendors' quotes behind past work.
 *
 * Carl, 2026-10-01: "learn to read the quote files loaded when attempting to
 * find historical costing, and apply that moving forward." The Myers epoxy
 * line is a $5,712 lump sum. Rhino's quote on the work order gives the
 * square footage that turns it into a rate. The run sent the quote and
 * fifteen other files in one call with sixteen targets, and the draft said
 * "the square footage isn't in what was shown".
 *
 * So reading is its own step, for every trade on every job. Each file history
 * finds beside past work (vendor quotes first, see history.ts) is read alone,
 * with one job: write down every size, quantity, unit price and total it
 * gives, exactly as written. The history call then sees those readings as
 * text under the job they belong to, where a lump sum and the size that
 * divides it sit side by side.
 *
 * A file does not change, so its reading is kept in the learned store by
 * file id and the file is not read or paid for again (learned.ts). A file
 * that cannot be read is listed with the reason and not sent whole: one the
 * API refuses (a corrupt or 100-page PDF) would sink the history call too.
 */

import type Anthropic from '@anthropic-ai/sdk';
import { z } from 'zod';
import { attachmentBlocks } from '../scope/prompt.ts';
import type { HistoryAttachment, HistoryFile } from './history.ts';
import { type StructuredCall, type Usage, NO_USAGE, addUsage, runStructured } from './model.ts';

export const FileReadingSchema = z.object({
  /** What the paper is. A quote, bid or proposal is what a sub asked to be paid; an invoice or bill what was charged. */
  kind: z.enum(['quote', 'invoice', 'change order', 'order', 'estimate', 'contract', 'drawing', 'photo', 'other']),
  /** Who wrote it: the sub or supplier, or DB on DB's own paper. */
  from: z.string().nullable(),
  /** The date written on it, as written. */
  date: z.string().nullable(),
  /** One sentence: the work it prices and where. */
  work: z.string(),
  /** Every area, length, count or dimension written on it, as written: "Garage floor 24' x 24'", "576 sq ft". */
  sizes: z.array(z.string()),
  /** Each priced line, with the figures written on it and nothing worked out. */
  items: z.array(
    z.object({
      what: z.string(),
      quantity: z.number().nullable(),
      unit: z.string().nullable(),
      unitPrice: z.number().nullable(),
      amount: z.number().nullable(),
    }),
  ),
  total: z.number().nullable(),
  /** What is included or excluded, conditions, options offered; empty when nothing. */
  notes: z.string(),
});
export type FileReading = z.infer<typeof FileReadingSchema>;

export const READ_MAX_TOKENS = 16_000;
/** Files read at once. */
const CONCURRENCY = 4;

export const READ_SYSTEM = `You read one file from Deitemeyer Brothers' (DB's) past jobs: a construction remodeler in Van Wert, Ohio. It usually is a subcontractor's or supplier's quote, bid, proposal or invoice. Sometimes it is DB's own change order or invoice, or a drawing or photo.

DB is pricing new work from what subs charged before. A lump sum is only useful once it is tied to a size, and the size is usually on the quote, not on DB's line. Write down what the file says that prices work:
- kind, from (the company that wrote it), date and work, in one sentence.
- sizes: every area, length, count and dimension written anywhere on it: in the line items, the scope paragraph, a note, a sketch. Copy each as written, with its unit ("approx. 576 sq ft", "24' x 24' garage", "2 garage bays"). Leave out nothing that measures the work.
- items: each priced line, with its quantity, unit, unit price and amount as written. Leave a figure null when the file does not give it. Never work one out, and never guess.
- total: the total as written.
- notes: what is included or left out, conditions, alternates offered.

When the file is not a quote or invoice (a photo, a drawing, a blank page), say so in kind and work, and leave items empty. Copy figures exactly; DB relies on them.`;

/** What goes to the reader for one file. */
export function readContent(a: HistoryAttachment, terms: string[]): Anthropic.ContentBlockParam[] {
  return [
    {
      type: 'text',
      text:
        `From DB's past job ${a.jobName}, found on ${a.file.foundOn}` +
        (a.file.onDocument?.vendor ? ` from ${a.file.onDocument.vendor}` : '') +
        `, while looking for past costs of ${terms.map((t) => `"${t}"`).join(', ')}.`,
    },
    ...attachmentBlocks({ file: a.file, bytes: a.bytes }),
    { type: 'text', text: 'Write down what this file says that prices work. Return it in the required format.' },
  ];
}

export interface ReadResult {
  read: number;
  failed: number;
  usage: Usage;
  cost: number;
}

/**
 * Read every downloaded file that has no reading yet; set each one's reading
 * or the reason it has none. `onRead` stores it. Never throws: a file that
 * cannot be read is marked skipped, with why.
 */
export async function readFiles(
  attachments: HistoryAttachment[],
  termsOf: (file: HistoryFile) => string[],
  call: StructuredCall,
  model: string,
  onRead: (a: HistoryAttachment, reading: FileReading) => void,
): Promise<ReadResult> {
  const todo = attachments.filter((a) => !a.file.reading);
  let usage = NO_USAGE;
  let cost = 0;
  let read = 0;
  let failed = 0;
  let next = 0;
  const worker = async (): Promise<void> => {
    while (next < todo.length) {
      const a = todo[next++]!;
      try {
        const r = await runStructured(
          call,
          { model, system: READ_SYSTEM, content: readContent(a, termsOf(a.file)), schema: FileReadingSchema, maxTokens: READ_MAX_TOKENS },
          `read "${a.file.name}"`,
        );
        usage = addUsage(usage, r.usage);
        cost += r.cost ?? 0;
        a.file.reading = { ...r.data, readBefore: null };
        onRead(a, r.data);
        read++;
      } catch (err) {
        a.file.skipped = `could not be read: ${err instanceof Error ? err.message : String(err)}`;
        failed++;
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, todo.length) }, worker));
  return { read, failed, usage, cost };
}

function figure(n: number | null): string {
  return n === null ? '' : `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/** One reading as the history call sees it. Deterministic. */
export function readingText(r: FileReading): string {
  const parts: string[] = [];
  parts.push(`${r.kind}${r.from ? ` from ${r.from}` : ''}${r.date ? `, dated ${r.date}` : ''}: ${r.work}`);
  parts.push(r.sizes.length ? `Sizes written on it: ${r.sizes.join('; ')}.` : 'No size is written on it.');
  if (r.items.length) {
    parts.push(
      `Lines: ${r.items
        .map((i) =>
          [
            i.what,
            i.quantity !== null ? `${i.quantity}${i.unit ? ` ${i.unit}` : ''}` : i.unit ?? '',
            i.unitPrice !== null ? `at ${figure(i.unitPrice)}` : '',
            i.amount !== null ? `= ${figure(i.amount)}` : '',
          ].filter(Boolean).join(' '),
        )
        .join('; ')}.`,
    );
  }
  if (r.total !== null) parts.push(`Total ${figure(r.total)}.`);
  if (r.notes.trim()) parts.push(`Notes: ${r.notes.trim()}`);
  return parts.join(' ');
}
