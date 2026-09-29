/**
 * What the model is asked, and what it is shown.
 *
 * The instructions are the product here, more than the code around them. Two
 * rules from the roadmap shape them. Failures must be VISIBLE: the model may
 * count what it can see or read, and must not compute an area or an hour
 * count from a photo, because a plausible wrong number is the one nobody
 * catches. And the reviewer is graded, not trusted: every finding cites the
 * comment, file or line it rests on, so Kristen can check it in seconds and
 * mark it real or not, exactly as she graded the pricing checks.
 */

import type Anthropic from '@anthropic-ai/sdk';
import { z } from 'zod';
import type { ScopePacket, ScopeAttachment } from './packet.ts';

export const SYSTEM_PROMPT = `You are reviewing a construction estimate for Deitemeyer Brothers, a small remodeling and roofing contractor in Van Wert, Ohio. A sales rep built the estimate in JobTread from the company's templates. Kristen, who reviews every estimate before it goes to the customer, will read what you write. Your job is the part of her review that takes the time: comparing the estimate's lines against everything known about the job, and raising what a careful reviewer would raise.

You will be given:
- the job: name, project type, description, and the conversation on it (internal comments, discovery notes, selection-meeting notes, supplier emails), oldest first;
- every line on the estimate with its description, quantity, unit, unit cost and unit price, in the groups and order the customer will see;
- supplier quotes and site photos that were attached to the job before the estimate was issued.

Raise only these four kinds of thing:
1. missing — scope the evidence says is part of the job that no line covers. Example: the discovery notes say "new ceiling fan" and no line supplies or installs one.
2. quantity — a line whose quantity or hours does not fit the evidence. Example: the notes measure the room at 4'10" by 6'4" and the estimate carries 400 square feet of flooring; or a quote lists two doors and the estimate has one.
3. vendor — a supplier quote that disagrees with the estimate: an item on the quote with no line, a model or quantity that differs, a quote price the line's unit cost does not match.
4. question — something the rep should confirm before this goes out, because the evidence is unclear or contradicts itself.

Rules:
- Every finding cites its evidence: the comment (who and when), the file name and page or photo, or the estimate line. A finding without evidence from the material you were given is not a finding.
- Count what you can see or read: fixtures in a photo, items on a quote, dimensions written in a note. Do not compute areas, lengths or hours from photos, and do not propose numbers you did not read somewhere. When a quantity looks off, say what the evidence says and ask.
- Pricing, markup and margins are checked by another tool. Do not raise them.
- Do not list what is fine. Do not pad. Ten findings each worth a reviewer's minute beat thirty that are not.
- When the evidence supports a finding only weakly, keep it and mark confidence low, and say what would settle it.
- Write for Kristen: plain words, one line for the title, one to three sentences for the detail. Name lines exactly as they appear on the estimate.`;

export const ReviewSchema = z.object({
  /** What the job is, as the evidence describes it. A check that the material was read. */
  summary: z.string(),
  findings: z.array(
    z.object({
      kind: z.enum(['missing', 'quantity', 'vendor', 'question']),
      title: z.string(),
      detail: z.string(),
      evidence: z.array(z.object({ source: z.string(), quote: z.string() })),
      /** Estimate line names this is about; empty when it is about an absence. */
      lines: z.array(z.string()),
      /** What to do about it, in a sentence; empty when it is only a question. */
      suggestion: z.string(),
      confidence: z.enum(['high', 'medium', 'low']),
    }),
  ),
});

export type Review = z.infer<typeof ReviewSchema>;
export type ReviewFinding = Review['findings'][number];

/** The job and the estimate as text. Kept deterministic so a dry run shows exactly this. */
export function packetText(p: ScopePacket): string {
  const out: string[] = [];
  out.push(`# Job: ${p.jobName}`);
  out.push(`Project type: ${p.projectType ?? 'not set'}. Job type: ${p.jobType ?? 'not set'}.`);
  out.push(`Estimate: "${p.documentName}" (${p.documentId})${p.issueDate ? `, issued ${p.issueDate}` : ', a draft, not yet issued'}.`);
  if (p.jobDescription) out.push(`\nJob description:\n${p.jobDescription}`);

  out.push(`\n# Conversation on the job (${p.comments.length} comments, oldest first)`);
  if (p.comments.length === 0) out.push('(none)');
  for (const c of p.comments) {
    out.push(`\n[${c.at.slice(0, 10)}] ${c.who}${c.fromEmail ? ' (by email)' : ''}:\n${c.message}`);
  }

  out.push(`\n# The estimate (${p.lines.length} lines, in the order the customer sees them)`);
  let group: string | null | undefined;
  for (const l of p.lines) {
    if (l.group !== group) {
      group = l.group;
      out.push(`\n## ${group ?? '(no group)'}`);
    }
    const qty = l.quantity === null ? 'quantity blank' : `${fmt(l.quantity)} ${l.unit ?? ''}`.trim();
    const money = [
      l.unitCost !== null ? `unit cost $${fmt(l.unitCost)}` : null,
      l.unitPrice !== null ? `unit price $${fmt(l.unitPrice)}` : null,
      l.price !== null ? `line total $${fmt(l.price)}` : null,
    ].filter(Boolean).join(', ');
    out.push(`- ${l.name} — ${qty}${money ? `; ${money}` : ''}`);
    if (l.description) out.push(`  ${l.description.replace(/\n/g, '\n  ')}`);
  }

  out.push(`\n# Attached files sent with this review (${p.attachments.length})`);
  for (const a of p.attachments) {
    out.push(`- ${a.file.name} (${a.file.type}, uploaded ${a.file.createdAt.slice(0, 10)})${a.file.description ? ` — ${a.file.description}` : ''}`);
  }
  if (p.failed.length) {
    out.push(`\nFiles that could not be downloaded, so you have NOT seen them:`);
    for (const f of p.failed) out.push(`- ${f.file.name}: ${f.reason}`);
  }
  if (p.excluded.length) {
    out.push(`\nFiles on the job that were not sent:`);
    for (const e of p.excluded) out.push(`- ${e.file.name}: ${e.reason}`);
  }
  return out.join('\n');
}

function fmt(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(2).replace(/\.?0+$/, '');
}

type ImageType = 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp';

/** The user turn: the text, then each attachment introduced by name. */
export function buildUserContent(p: ScopePacket): Anthropic.ContentBlockParam[] {
  const blocks: Anthropic.ContentBlockParam[] = [{ type: 'text', text: packetText(p) }];
  for (const a of p.attachments) blocks.push(...attachmentBlocks(a));
  blocks.push({
    type: 'text',
    text: 'Review the estimate against the job as described above and in the attached files. ' +
      'Return the summary and the findings in the required format.',
  });
  return blocks;
}

function attachmentBlocks(a: ScopeAttachment): Anthropic.ContentBlockParam[] {
  const data = Buffer.from(a.bytes).toString('base64');
  const label = `${a.file.type === 'application/pdf' ? 'File' : 'Photo'}: ${a.file.name}` +
    ` (uploaded ${a.file.createdAt.slice(0, 10)})${a.file.description ? ` — ${a.file.description}` : ''}`;
  if (a.file.type === 'application/pdf') {
    return [
      { type: 'text', text: label },
      {
        type: 'document',
        title: a.file.name,
        source: { type: 'base64', media_type: 'application/pdf', data },
      },
    ];
  }
  return [
    { type: 'text', text: label },
    {
      type: 'image',
      source: { type: 'base64', media_type: a.file.type as ImageType, data },
    },
  ];
}
