/**
 * What the model is asked, and what it is shown, when it drafts a budget.
 *
 * Two calls, because that is how a rep works and how Carl wants it checked:
 *
 *   1. PICK    read the job, pick the budget template(s) that fit — the one
 *              whose structure the estimate should have, then any others
 *              needed for lines the first lacks. Or say nothing fits.
 *   2. DRAFT   read the job again beside the picked templates' lines, keep
 *              the lines the evidence supports with a quantity and a basis,
 *              drop the rest, and put anything with no template line in
 *              `gaps` — flagged for Carl, never invented as a line.
 *
 * The model never sees a price and never sets one. Prices come from the
 * catalog item each template line points at (see draft.ts), which is what
 * JobTread does when the rep adds the template by hand.
 */

import type Anthropic from '@anthropic-ai/sdk';
import { z } from 'zod';
import { attachmentBlocks } from '../scope/prompt.ts';
import type { JobEvidence } from './evidence.ts';
import { historyText, type HistoryReport } from './history.ts';
import {
  STRUCTURAL_GROUPS, groupPath, isStructural, orderedLines, type Template, type TemplateSummary,
} from './templates.ts';

export const MAX_PICKS = 4;

const COMPANY =
  'Deitemeyer Brothers is a small remodeling and roofing contractor in Van Wert, Ohio. ' +
  'Its estimates are built in JobTread from budget templates: a sales rep adds a template ' +
  'group to the job budget, deletes the lines the job does not need, sets quantities, and ' +
  'adds a second template only for lines the first does not have. Kristen reviews every ' +
  'estimate before it goes to the customer, and Carl decides what to do when no template fits.';

export const PICK_SYSTEM = `${COMPANY}

You are doing the first step for a sales rep: reading what came back from the site visit and choosing which budget template(s) the estimate should be built from.

You will be given the job (name, project type, description), the conversation on it (discovery notes, customer requests), the site photos and any drawings or quotes, and the list of budget templates with their descriptions and group names.

Choose:
- one PRIMARY template: the one whose structure the estimate should have. A job-type template (Bathroom Remodel, Kitchen Remodel, Deck, Door/Window Installation, ...) when one matches the job. The "X-Division NN" templates are CSI-division building blocks for work no job-type template covers; a paint-and-floor refresh, for example, is built from X-Division 09 Finishes with X-Division 01 General Requirements beside it.
- SUPPLEMENT templates only for lines the primary lacks, and only when the evidence calls for that work. At most ${MAX_PICKS} templates in all.
- Roofing templates are for roofing jobs; Service Repair Agreements are for service calls, not estimates; PBA, Warranty, Insurance Restoration, Storm Tarp, Clock In, General and Administrative and Pan Head are not estimate templates.

If no template fits the work at all, pick nothing and say why in noFit. Carl decides what happens then. Do not force a fit.

Write the summary as two plain sentences saying what the job is, as the evidence describes it.`;

export const DRAFT_SYSTEM = `${COMPANY}

You are drafting the job budget the way a careful rep would, from the budget templates chosen for this job. You will be given the job, its conversation, its photos and files, and every line of each chosen template with its group, unit, cost type and description. Lines carry no prices here on purpose: JobTread prices them from the catalog when the template is added, and pricing is not your job.

Rules:
1. Keep a line only when the evidence says that work or material is part of this job. Every line you do not keep is deleted from the template. Do not keep a line "just in case" — doubt goes in questions.
2. Quantity comes from evidence: a measurement or count written in the notes or the job description, a count you can make in a photo, or arithmetic on written dimensions (show it: "18'4\\" × 38'6\\" = 706 SF"). Do not measure anything from a photo. When a line's description already includes waste or overage, do not add more; when you add waste yourself, say so in the basis.
3. Labor lines in Hours need your estimate of crew hours. Give the basis (crew size × days, or hours per unit of work) and mark confidence honestly. The rep will check these first.
4. Options come in two kinds, and the name tells the rep which to build. When the customer chooses ONE of several alternatives (two flooring types), name the option "Group — Choice" and put it on every line of that choice: "Flooring — LVP" on the LVP lines, "Flooring — Epoxy" on the epoxy lines; the rep builds one selection group per Group with one choice required. When something is a yes-or-no add-on the customer may decline (paint the ceiling, move the contents), use a bare name with no dash — "Ceiling paint" — and the rep builds it as an optional selection. Lines with no option are the base scope.
4a. A line whose description says it is non-monetized or for time tracking (Sales On-Site Support) is not a scope decision: keep it with quantity 0 so the crew can clock to it, and do not count it as work.
5. Scope the evidence calls for that no line in these templates covers goes in gaps: what the work is, a unit, a quantity when the evidence gives one, the cost type, and the evidence. Never keep a line under a different meaning to cover it. Carl decides each gap.
6. Do not price, mark up or compare to margins; do not mention money.
7. Every kept line, gap and question cites its evidence: the comment (who and date), the photo file name, or "job description". A quantity with no evidence is a question, not a number.
8. scopeOfWork is what the customer reads on the estimate's General Description line: three to eight plain sentences saying what is included, what is excluded, what is optional, and what the customer supplies or does themselves.
9. summary is two sentences saying what the job is, as the evidence describes it.
10. questions are what the rep must confirm with the customer or the team before the estimate goes out: at most six, ordered by how much the answer changes the price. Leave out what the estimate already handles (a color choice, picking from stock).
11. lookBack is a list of one to three short search terms for finding DB's past work of the same kind ("epoxy", "floor coating"; "skim coat", "skim"). Give them on every Subcontractor line, on every gap, and on any Labor line for a trade DB might subcontract (painting, flooring, drywall, tile, concrete). Leave the list empty on everything else. The terms are matched against past line names and descriptions, so use the words a rep would have typed, not sentences.

Write for the rep: plain words, and line names exactly as listed. Reference lines by their id.`;

export const PickSchema = z.object({
  summary: z.string(),
  picks: z.array(
    z.object({
      templateId: z.string(),
      role: z.enum(['primary', 'supplement']),
      why: z.string(),
    }),
  ),
  /** Set, with the picks empty, when nothing fits. */
  noFit: z.string().nullable(),
});
export type PickReply = z.infer<typeof PickSchema>;

const Evidence = z.array(z.object({ source: z.string(), quote: z.string() }));

export const DraftSchema = z.object({
  summary: z.string(),
  scopeOfWork: z.string(),
  lines: z.array(
    z.object({
      lineId: z.string(),
      quantity: z.number(),
      /** How the quantity was arrived at, in one sentence. */
      basis: z.string(),
      evidence: Evidence,
      /** The alternative this line belongs to; null for base scope. */
      option: z.string().nullable(),
      confidence: z.enum(['high', 'medium', 'low']),
      /** Search terms for DB's past work of this kind; empty when history is not worth reading. */
      lookBack: z.array(z.string()),
    }),
  ),
  gaps: z.array(
    z.object({
      scope: z.string(),
      why: z.string(),
      unit: z.string(),
      quantity: z.number().nullable(),
      costType: z.enum(['Labor', 'Materials', 'Subcontractor', 'Other']),
      basis: z.string(),
      evidence: Evidence,
      lookBack: z.array(z.string()),
    }),
  ),
  questions: z.array(z.object({ question: z.string(), why: z.string() })),
});
export type DraftReply = z.infer<typeof DraftSchema>;
export type DraftReplyLine = DraftReply['lines'][number];
export type DraftReplyGap = DraftReply['gaps'][number];
export type DraftReplyQuestion = DraftReply['questions'][number];

// ---- the text the model reads -------------------------------------------------

/** The job as text. Deterministic, so a dry run shows exactly this. */
export function evidenceText(e: JobEvidence): string {
  const out: string[] = [];
  out.push(`# Job: ${e.jobName}${e.jobNumber ? ` (${e.jobNumber})` : ''}`);
  out.push(
    `Project type: ${e.projectType ?? 'not set'}. Job type: ${e.jobType ?? 'not set'}.` +
      (e.city ? ` City: ${e.city}.` : ''),
  );
  if (e.budget) {
    const scope = e.budget.groups.filter((g) => !STRUCTURAL_GROUPS.has(g.toUpperCase()));
    if (e.budget.pricedLines === 0 && scope.length === 0) {
      out.push(
        `No estimate exists yet. The budget holds only the job template's time-tracking groups` +
          ` (${e.budget.groups.join(', ') || 'none'}): ${e.budget.lines} lines, none priced.`,
      );
    } else {
      out.push(
        `The budget already carries ${e.budget.pricedLines} priced lines in ${scope.length} scope group(s)` +
          ` (${scope.join(', ')}). This draft is written as if the budget were empty; the rep reconciles.`,
      );
    }
  }
  if (e.description) out.push(`\nJob description:\n${e.description}`);

  out.push(`\n# Conversation on the job (${e.comments.length} comments, oldest first)`);
  if (e.comments.length === 0) out.push('(none)');
  for (const c of e.comments) {
    out.push(`\n[${c.at.slice(0, 10)}] ${c.who}${c.fromEmail ? ' (by email)' : ''}:\n${c.message}`);
  }

  out.push(`\n# Files sent with this request (${e.attachments.length})`);
  if (e.attachments.length === 0) out.push('(none)');
  for (const a of e.attachments) {
    out.push(`- ${a.file.name} (${a.file.type}, uploaded ${a.file.createdAt.slice(0, 10)})${a.file.description ? ` — ${a.file.description}` : ''}`);
  }
  if (e.failed.length) {
    out.push(`\nFiles that could not be downloaded, so you have NOT seen them:`);
    for (const f of e.failed) out.push(`- ${f.file.name}: ${f.reason}`);
  }
  if (e.excluded.length) {
    out.push(`\nFiles on the job that were not sent:`);
    for (const x of e.excluded) out.push(`- ${x.file.name}: ${x.reason}`);
  }
  return out.join('\n');
}

const MAX_GROUP_NAMES = 40;

/** The forty-odd templates, one entry each, for the picker. */
export function templateIndexText(index: TemplateSummary[]): string {
  const out: string[] = [];
  out.push(`# Budget templates (${index.length})`);
  out.push('Each is a catalog cost group a rep adds to a job budget. id · name · lines');
  for (const t of index) {
    out.push(`\n- ${t.id} · ${t.name} · ${t.lineCount} lines`);
    if (t.description) out.push(`  ${t.description.replace(/\s+/g, ' ')}`);
    const groups = t.groups.filter((g) => !STRUCTURAL_GROUPS.has(g.toUpperCase()));
    if (groups.length) {
      const shown = groups.slice(0, MAX_GROUP_NAMES).join(', ');
      out.push(`  Groups: ${shown}${groups.length > MAX_GROUP_NAMES ? `, +${groups.length - MAX_GROUP_NAMES} more` : ''}`);
    }
  }
  return out.join('\n');
}

const MAX_DESCRIPTION = 600;

/** One template's lines, grouped as the rep sees them, without prices. */
export function templateLinesText(t: Template): string {
  const out: string[] = [];
  const all = orderedLines(t);
  const scope = all.filter((l) => !l.isSpecification && !isStructural(t, l));
  const structural = all.filter((l) => isStructural(t, l)).length;
  const specs = all.filter((l) => l.isSpecification && !isStructural(t, l)).length;

  out.push(`# Template: ${t.name} (${t.id}) — ${scope.length} lines you may keep`);
  if (t.description) out.push(t.description.replace(/\s+/g, ' '));
  out.push('Grouped as the rep sees them. Each line: id · name · unit · cost type, then its description.');

  let path: string | null = null;
  for (const l of scope) {
    const p = groupPath(t, l.groupId).join(' › ') || '(template root)';
    if (p !== path) {
      path = p;
      out.push(`\n## ${p}`);
    }
    out.push(`- ${l.id} · ${l.name} · ${l.unit ?? 'no unit'} · ${l.costTypeName}`);
    if (l.description) {
      const d = l.description.replace(/\s+/g, ' ');
      out.push(`  ${d.length > MAX_DESCRIPTION ? `${d.slice(0, MAX_DESCRIPTION)}…` : d}`);
    }
    if (l.quantityFormula) out.push(`  quantity formula: ${l.quantityFormula}`);
  }
  const notes: string[] = [];
  if (structural) {
    notes.push(
      `${structural} lines in ${[...STRUCTURAL_GROUPS].join(', ')} are not listed: the rep leaves them as they are`,
    );
  }
  if (specs) notes.push(`${specs} specification lines are not listed`);
  if (notes.length) out.push(`\nNot listed: ${notes.join('; ')}.`);
  return out.join('\n');
}

function attachments(e: JobEvidence): Anthropic.ContentBlockParam[] {
  const blocks: Anthropic.ContentBlockParam[] = [];
  for (const a of e.attachments) blocks.push(...attachmentBlocks(a));
  return blocks;
}

/** The PICK turn: the job, its files, the template list, the ask. */
export function buildPickContent(e: JobEvidence, index: TemplateSummary[]): Anthropic.ContentBlockParam[] {
  return [
    { type: 'text', text: evidenceText(e) },
    ...attachments(e),
    { type: 'text', text: templateIndexText(index) },
    {
      type: 'text',
      text:
        'Choose the budget template(s) this estimate should be built from, primary first, ' +
        `at most ${MAX_PICKS}. If nothing fits, pick none and say why in noFit. ` +
        'Return the summary and the picks in the required format.',
    },
  ];
}

/** The DRAFT turn: the job, its files, every line of the chosen templates, the ask. */
export function buildDraftContent(e: JobEvidence, templates: Template[]): Anthropic.ContentBlockParam[] {
  return [
    { type: 'text', text: evidenceText(e) },
    ...attachments(e),
    ...templates.map((t): Anthropic.ContentBlockParam => ({ type: 'text', text: templateLinesText(t) })),
    {
      type: 'text',
      text:
        'Draft the budget from these templates: keep the lines the evidence supports with a ' +
        'quantity and its basis, mark alternatives with an option name, put uncovered scope in gaps, ' +
        'write the scope of work and the questions. Return them in the required format.',
    },
  ];
}

// ---- the third call: what DB did last time --------------------------------------

export const HISTORY_SYSTEM = `${COMPANY}

You are reading DB's own past work so the draft can lean on it. For each target — a subcontracted line, a labor line for a trade DB might sub, or a gap with no template line — you are shown the past cost items that match its search terms: real lines on real jobs, each tagged by how much it proves ([billed] a vendor bill DB paid, [sold] an approved estimate or invoice, [ordered] a work or purchase order, [quoted] a bid request, [draft] a budget or unsent document). Where a matched line's document carried files, they are attached after the text: the sub's quote, a bid, an invoice, a change order. Read them. A size or a rate written on a sub's quote is written evidence, and it is what turns a lump sum into a cost per unit; say which file it came from.

For each target say:
- match: "match" when past work is the same kind of job (epoxy floor to epoxy floor), "partial" when it is related but not the same (a drywall sub for a skim coat), "none" when nothing shown applies. The same word appearing in a line name is not a match by itself: "Epoxy" in a tile-grout line is not an epoxy floor.
- pastWork: the lines you are relying on, copied from what you were shown — job, what, where, when, vendor, quantity, unit, unit cost, line cost. Only lines you were shown. Prefer billed over sold over ordered over quoted over draft, and recent over old.
- suggestedUnitCost: a cost per the TARGET's unit, derived from pastWork by arithmetic you show in suggestionBasis ("$5,712 lump sum for the 420 SF on the Rhino quote = $13.60/SF"). Use an area or count only when it is written in the past job's own lines, its description, or an attached file; if a lump sum cannot be put per unit because the past job's size is nowhere written, leave suggestedUnitCost null and say what would settle it. Never take a unit cost from a line whose cost is 0 or blank, and never guess a figure.
- confidence: high when two or more billed or sold lines agree; medium for one good line; low for partial matches or old drafts.
- typicallySubbed: for a Labor target, true when the past work shows DB using a subcontractor for this trade on two or more jobs, false when DB's own crew did it on two or more, null when the history does not say. usualVendor is the sub that appears most, or null.
- summary: one or two plain sentences for the rep: what DB did before and what it cost.

Do not price anything that is not a target. Do not mention margins or markup: the code prices from the cost you cite, at DB's subcontractor margin. Reference targets by their id exactly as given.`;

export const HistorySchema = z.object({
  findings: z.array(
    z.object({
      target: z.object({ kind: z.enum(['line', 'gap']), id: z.string() }),
      match: z.enum(['match', 'partial', 'none']),
      summary: z.string(),
      pastWork: z.array(
        z.object({
          jobName: z.string(),
          what: z.string(),
          where: z.string(),
          when: z.string(),
          vendor: z.string().nullable(),
          quantity: z.number().nullable(),
          unit: z.string().nullable(),
          unitCost: z.number().nullable(),
          lineCost: z.number().nullable(),
        }),
      ),
      /** Per the target's unit. Null when history cannot honestly give one. */
      suggestedUnitCost: z.number().nullable(),
      suggestionBasis: z.string(),
      confidence: z.enum(['high', 'medium', 'low']),
      typicallySubbed: z.boolean().nullable(),
      usualVendor: z.string().nullable(),
    }),
  ),
});
export type HistoryReply = z.infer<typeof HistorySchema>;
export type HistoryFinding = HistoryReply['findings'][number];

/** One thing the history is read for: a kept line or a gap. */
export interface HistoryTarget {
  kind: 'line' | 'gap';
  /** The template line id, or "gap-N". */
  id: string;
  name: string;
  quantity: number | null;
  unit: string | null;
  costTypeName: string;
  basis: string;
  /** What the template would price it at, per unit, when there is one. */
  templateUnitCost: number | null;
  lookBack: string[];
}

export function historyTargetsText(summary: string, targets: HistoryTarget[]): string {
  const out: string[] = [];
  out.push(`# The job being drafted\n${summary}`);
  out.push(`\n# Targets (${targets.length})`);
  out.push('id · kind · name · quantity and unit · cost type · template unit cost · search terms');
  for (const t of targets) {
    out.push(
      `- ${t.id} · ${t.kind} · ${t.name} · ${t.quantity === null ? 'no quantity' : t.quantity} ${t.unit ?? ''}`.trimEnd() +
        ` · ${t.costTypeName} · ${t.templateUnitCost === null ? 'no template price' : `$${t.templateUnitCost.toFixed(2)}`}` +
        ` · terms: ${t.lookBack.map((x) => `"${x}"`).join(', ') || 'none'}`,
    );
    out.push(`  basis: ${t.basis}`);
  }
  return out.join('\n');
}

export function buildHistoryContent(
  summary: string,
  targets: HistoryTarget[],
  report: HistoryReport,
): Anthropic.ContentBlockParam[] {
  const files: Anthropic.ContentBlockParam[] = [];
  for (const a of report.attachments ?? []) {
    files.push({ type: 'text', text: `From past job ${a.jobName}, found on ${a.file.foundOn}:` });
    files.push(...attachmentBlocks({ file: a.file, bytes: a.bytes }));
  }
  return [
    { type: 'text', text: historyTargetsText(summary, targets) },
    { type: 'text', text: historyText(report) },
    ...files,
    {
      type: 'text',
      text:
        'For each target, say whether DB has done this before, cite the past lines that apply, and give a ' +
        'unit cost only when the arithmetic from those lines is shown. Return the findings in the required format.',
    },
  ];
}
