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
import { candidatesText, type CatalogCandidate } from './catalog.ts';
import { historyText, type HistoryReport } from './history.ts';
import {
  STRUCTURAL_GROUPS, groupPath, isContingencyLine, isStructural, orderedLines, type Template, type TemplateSummary,
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

When the message carries the rep's direction after an earlier pass, it outranks the photos and the notes: the rep was on site and has talked to the customer. The direction may call for templates the earlier pass did not use (new framing, insulation, drywall); keep the earlier templates unless the direction removes the need for them.

Write the summary as two plain sentences saying what the job is, as the evidence describes it.`;

export const DRAFT_SYSTEM = `${COMPANY}

You are drafting the job budget the way a careful rep would, from the budget templates chosen for this job. You will be given the job, its conversation, its photos and files, and every line of each chosen template with its group, unit, cost type and description. Lines carry no prices here on purpose: JobTread prices them from the catalog when the template is added, and pricing is not your job.

Rules:
1. Keep a line only when the evidence says that work or material is part of this job. Every line you do not keep is deleted from the template. Do not keep a line "just in case" — doubt goes in questions.
2. Quantity comes from evidence: a measurement or count written in the notes or the job description, a count you can make in a photo, or arithmetic on written dimensions (show it: "18'4\\" × 38'6\\" = 706 SF"). Do not measure anything from a photo. When a line's description already includes waste or overage, do not add more; when you add waste yourself, say so in the basis.
3. Labor lines in Hours need your estimate of crew hours. Give the basis (crew size × days, or hours per unit of work) and mark confidence honestly. The rep will check these first.
4. Options come in two kinds, and the name tells the rep which to build. When the customer chooses ONE of several alternatives (two flooring types), name the option "Group — Choice" and put it on every line of that choice: "Flooring — LVP" on the LVP lines, "Flooring — Epoxy" on the epoxy lines; the rep builds one selection group per Group with one choice required. When something is a yes-or-no add-on the customer may decline (paint the ceiling, move the contents), use a bare name with no dash — "Ceiling paint" — and the rep builds it as an optional selection. Lines with no option are the base scope.
4a. A line whose description says it is non-monetized or for time tracking (Sales On-Site Support) is not a scope decision: keep it with quantity 0 so the crew can clock to it, and do not count it as work.
5. Scope the evidence calls for that no line in these templates covers goes in gaps: what the work is, a unit, a quantity when the evidence gives one, the cost type, the evidence, and the option it belongs to when it is part of one (the same option name as the lines it goes with; null for base scope). Never keep a line under a different meaning to cover it. The rest of the catalog is searched for each gap afterwards; what nothing covers goes to Carl.
6. Do not price, mark up or compare to margins; do not mention money.
7. Every kept line, gap and question cites its evidence: the comment (who and date), the photo file name, or "job description". A quantity with no evidence is a question, not a number.
8. scopeOfWork is what the customer reads on the estimate's General Description line: three to eight plain sentences saying what is included, what is excluded, what is optional, and what the customer supplies or does themselves.
9. summary is two sentences saying what the job is, as the evidence describes it.
10. questions are what the rep must confirm with the customer or the team before the estimate goes out: at most six, ordered by how much the answer changes the price. Leave out what the estimate already handles (a color choice, picking from stock).
11. lookBack is a list of one to three short search terms for finding DB's past work of the same kind, the trade's own single word first, then a short phrase if it helps ("epoxy", "floor coating"; "skim", "skim coat"). The search matches a term as written, inside a line's name or description, so "epoxy floor coating" misses a line called "Epoxy Sub Pckg" that "epoxy" finds. Give them on every Subcontractor line, on every gap, and on any Labor line for a trade DB might subcontract (painting, flooring, drywall, tile, concrete). Leave the list empty on everything else. The terms are matched against past line names and descriptions, so use the words a rep would have typed, not sentences.
12. contingency.rate is the contingency DB carries on this job, by its policy: 5 when everything stays in place (replace in kind, nothing moves), 8 for a remodel where anything moves (a fixture, a wall, an opening) or the finish is stripped to the substrate, 10 for an addition, structural work, or an older home where hidden conditions are likely. Say why in one sentence from the evidence. The code prices it; you do not.
13. When the message carries the rep's direction after an earlier pass, it is a decision, not evidence to weigh: follow it even where the photos or notes point elsewhere, never turn it back into a question, and keep every line, quantity and option of the earlier pass that it does not touch. Say "per the rep's direction" in the basis of what it changed.
14. Do the work one way. Do not keep a Subcontractor line and DB's own Labor or Materials line for the same work in the same place ("Insulation - Sub" with "Insulation - Batt" for the same walls; "Paint Labor - Sub" with "Paint Labor"): the sub's price covers the work, and usually its material. Pick the way the evidence or the team's note says, or what DB's past work shows; when it is genuinely open, keep one and put the other in questions. Keeping both is right only when they cover different parts of the job, and then each basis says which part.
15. A line marked CATALOG CONFLICT is counted in one unit and priced per another in the catalog. Give its quantity in the line's own unit as usual, and add to its basis what the count is in the other unit too ("21 sheets = 672 SF"), so the rep can correct it whichever unit turns out right.

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
      /** The option this belongs to, named like the lines it goes with; null for base scope. */
      option: z.string().nullable(),
    }),
  ),
  questions: z.array(z.object({ question: z.string(), why: z.string() })),
  /** The contingency rate DB's policy gives this job: 5, 8 or 10. */
  contingency: z.object({ rate: z.number(), why: z.string() }),
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
  const scope = all.filter((l) => !l.isSpecification && !isStructural(t, l) && !isContingencyLine(t, l));
  const structural = all.filter((l) => isStructural(t, l)).length;
  const specs = all.filter((l) => l.isSpecification && !isStructural(t, l)).length;
  const contingency = all.filter((l) => isContingencyLine(t, l) && !isStructural(t, l)).length;

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
    out.push(`- ${l.id} · ${l.name} · ${l.unit ?? 'no unit'} · ${l.costTypeName}${l.pricedUnit ? ` · CATALOG CONFLICT: its price is per ${l.pricedUnit}` : ''}`);
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
  if (contingency) notes.push('the Project Contingency line is not listed: the code sets it from your contingency.rate');
  if (notes.length) out.push(`\nNot listed: ${notes.join('; ')}.`);
  return out.join('\n');
}

function attachments(e: JobEvidence): Anthropic.ContentBlockParam[] {
  const blocks: Anthropic.ContentBlockParam[] = [];
  for (const a of e.attachments) blocks.push(...attachmentBlocks(a));
  return blocks;
}

/** The rep's direction after an earlier pass (revise.ts `revisionText`), as one block after the evidence. */
function revisionBlock(revision: string | undefined): Anthropic.ContentBlockParam[] {
  return revision ? [{ type: 'text', text: revision }] : [];
}

/** The PICK turn: the job, its files, the rep's direction if this is a later pass, the template list, the ask. */
export function buildPickContent(e: JobEvidence, index: TemplateSummary[], revision?: string): Anthropic.ContentBlockParam[] {
  return [
    { type: 'text', text: evidenceText(e) },
    ...attachments(e),
    ...revisionBlock(revision),
    { type: 'text', text: templateIndexText(index) },
    {
      type: 'text',
      text:
        'Choose the budget template(s) this estimate should be built from, primary first, ' +
        `at most ${MAX_PICKS}. If nothing fits, pick none and say why in noFit. ` +
        (revision ? "Follow the rep's direction above. " : '') +
        'Return the summary and the picks in the required format.',
    },
  ];
}

/** The DRAFT turn: the job, its files, the rep's direction if this is a later pass, every line of the chosen templates, the ask. */
export function buildDraftContent(e: JobEvidence, templates: Template[], revision?: string): Anthropic.ContentBlockParam[] {
  return [
    { type: 'text', text: evidenceText(e) },
    ...attachments(e),
    ...revisionBlock(revision),
    ...templates.map((t): Anthropic.ContentBlockParam => ({ type: 'text', text: templateLinesText(t) })),
    {
      type: 'text',
      text:
        'Draft the budget from these templates: keep the lines the evidence supports with a ' +
        'quantity and its basis, mark alternatives with an option name, put uncovered scope in gaps, ' +
        'write the scope of work and the questions. ' +
        (revision ? "Follow the rep's direction above as a decision, and keep what it does not change. " : '') +
        'Return them in the required format.',
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
- catalog, for GAP targets only: some gaps come with catalog candidates — lines in other budget templates, and ungrouped catalog items, each with its unit, cost type and price. Pick the one that is the same thing as the gap (kind and id exactly as listed) and give quantity in THAT line's unit, with the arithmetic in basis ("909 SF of wall; a 10 × 25 roll covers 250 SF, so 4 rolls with laps"). Crew Labor is DB's standard crew rate: it covers any labor a gap needs when no labor line is specific to that trade, with the hours as its quantity. A homonym is not a match ("Insulation - Sub" is a subcontractor, not the crew's batts); pick kind "none" when nothing listed is the same thing. A gap you match to the catalog is priced from the catalog by the code, so give it no regionalUnitCost; still say what history shows.
- catalog.sectionGroupId, for every GAP target, matched or not: the rep works on the job's copy of the chosen templates and never changes the templates in the catalog. A line pulled from the catalog goes into a section of that copy, and a line the catalog lacks is created in one. Name the section: the id of the group, from the list of the chosen templates' sections, whose lines are the same trade or phase as the gap (insulation with the framing or rough-in section; a vapor barrier with the same; an electrical line with electrical, or with rough-in when there is no electrical section). Pick the most specific group that fits; null only when no section is anywhere near.
- regionalUnitCost, for GAP targets only: when history gives no suggestedUnitCost for a gap and the catalog has nothing for it, give a ballpark cost per the gap's unit for DB's own market — Van Wert, Ohio and the surrounding small towns of northwest Ohio and northeast Indiana, not a national average and not a metro rate — for the kind of work the gap describes and the cost type it carries (a Labor gap is DB's own crew at a small-contractor wage; a Subcontractor gap is what a local sub would charge DB; a Materials gap is the supply-house price). Write regionalBasis as the assumption in one or two sentences ("a two-man crew at about $45/hour loaded; moving a basement of contents is two to four hours"). It is a ballpark for the rep to sanity-check, not a price; the code labels it so. Leave it null when the gap has no unit that a cost can be put per, when its quantity is what is unknown, or when it is a line target: template lines already have a price and never get a regional figure. Do not give a regional figure where you gave a suggestedUnitCost.

Do not price anything that is not a target. Do not mention margins or markup: the code prices from the cost you cite, at the margin DB applies to that cost type. Reference targets by their id exactly as given.`;

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
      /** A gap only, and only when history gave nothing: a ballpark per unit for DB's own market. */
      regionalUnitCost: z.number().nullable(),
      regionalBasis: z.string(),
      /** A gap only: the catalog line that covers it, from the candidates listed, with the quantity in that line's unit; and where it goes on the job. */
      catalog: z.object({
        kind: z.enum(['templateLine', 'catalogItem', 'none']),
        id: z.string().nullable(),
        quantity: z.number().nullable(),
        basis: z.string(),
        /** The group, in a chosen template's copy on the job, to put the line under — matched from the catalog or created new. */
        sectionGroupId: z.string().nullable(),
      }),
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
  /** Something the model should know about this target that the search did not produce. */
  note?: string;
  /** For a gap: what the rest of the catalog has that might cover it. */
  candidates?: CatalogCandidate[];
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
    if (t.note) out.push(`  note: ${t.note}`);
    if (t.candidates && t.candidates.length) {
      out.push(`  catalog candidates (${t.candidates.length}), from other templates and the ungrouped catalog:`);
      out.push(...candidatesText(t.candidates));
    } else if (t.kind === 'gap') {
      out.push('  catalog candidates: none found');
    }
  }
  const gaps = targets.filter((t) => t.kind === 'gap').length;
  if (gaps) {
    out.push(
      `\n${gaps} of these are gaps with no line in the chosen templates. Match each to a catalog candidate when one is the same thing (catalog.kind and id, quantity in its unit); ` +
        'a gap the catalog cannot cover and history cannot price gets a regional ballpark (regionalUnitCost) instead; line targets never do.',
    );
  }
  return out.join('\n');
}

/**
 * The sections of the chosen templates, as they will exist on the job: where
 * a found or a new line goes. Structural groups and the contingency group
 * are not places for scope.
 */
export function sectionsText(templates: Template[]): string {
  const out: string[] = [];
  out.push('# Sections of the chosen templates on the job');
  out.push('A line from the catalog is put into one of these on the job\'s copy of the template, and a line the catalog lacks is created in one. id · template › section');
  for (const t of templates) {
    for (const g of t.groups) {
      const path = groupPath(t, g.id);
      if (path.some((n) => STRUCTURAL_GROUPS.has(n.toUpperCase()) || /contingency/i.test(n))) continue;
      out.push(`- ${g.id} · ${t.name} › ${path.join(' › ')}`);
    }
  }
  return out.join('\n');
}

export function buildHistoryContent(
  summary: string,
  targets: HistoryTarget[],
  report: HistoryReport,
  templates: Template[] = [],
): Anthropic.ContentBlockParam[] {
  const files: Anthropic.ContentBlockParam[] = [];
  for (const a of report.attachments ?? []) {
    files.push({ type: 'text', text: `From past job ${a.jobName}, found on ${a.file.foundOn}:` });
    files.push(...attachmentBlocks({ file: a.file, bytes: a.bytes }));
  }
  const sections: Anthropic.ContentBlockParam[] =
    templates.length && targets.some((t) => t.kind === 'gap') ? [{ type: 'text', text: sectionsText(templates) }] : [];
  return [
    { type: 'text', text: historyTargetsText(summary, targets) },
    ...sections,
    { type: 'text', text: historyText(report) },
    ...files,
    {
      type: 'text',
      text:
        'For each target, say whether DB has done this before, cite the past lines that apply, and give a ' +
        'unit cost only when the arithmetic from those lines is shown. For each gap, pick the catalog candidate that is ' +
        'the same thing, with the quantity in its unit, or none, and name the section on the job it goes in; for a gap the ' +
        'catalog cannot cover and history leaves unpriced, give the regional ballpark and its assumption. Return the findings in the required format.',
    },
  ];
}
