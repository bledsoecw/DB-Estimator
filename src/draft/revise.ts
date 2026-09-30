/**
 * The second pass: the rep has read the draft and said what to change.
 *
 * Carl, 30 Sep 2026, playing the rep on 261323: "forget the skim coating
 * and let's go with a mold-resistant concrete paint, or an option to frame
 * out walls 6–8 inches from the foundation with plastic, drywall on top,
 * wainscot on the bottom, paint it, insulation batts in the false walls."
 * The rep types that, reruns, and the draft follows it — as a decision made
 * on site, not as another question — while keeping everything the rep did
 * not change. Every pass is kept on disk, and the page says what moved.
 *
 * Nothing here talks to the model or to JobTread. It reads the last pass's
 * JSON, writes the text the model is shown, and diffs the passes.
 */

import type { Draft } from './draft.ts';

export interface Direction {
  /** The pass this direction was given after reading. */
  pass: number;
  /** ISO datetime. */
  at: string;
  text: string;
}

export interface PreviousLine {
  lineId: string;
  name: string;
  quantity: number;
  unit: string | null;
  option: string | null;
  template: string;
}

/** What the last pass's JSON says was drafted; enough to keep it and to diff it. */
export interface PreviousDraft {
  pass: number;
  directions: Direction[];
  summary: string;
  templates: { id: string; name: string }[];
  lines: PreviousLine[];
  gaps: { scope: string; costType: string }[];
  questions: string[];
  contingencyRate: number | null;
}

export interface Revision {
  previous: PreviousDraft;
  /** Every direction so far, the newest last. */
  directions: Direction[];
}

const str = (v: unknown, fallback = ''): string => (typeof v === 'string' ? v : fallback);
const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);

/** Read a draft's JSON (render.ts `draftJson`) tolerantly: a hand-edited or older file still revises. */
export function previousFromJson(raw: unknown): PreviousDraft {
  const o = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const rev = (o['revision'] && typeof o['revision'] === 'object' ? o['revision'] : {}) as Record<string, unknown>;
  const list = (v: unknown): Record<string, unknown>[] =>
    Array.isArray(v) ? v.filter((x): x is Record<string, unknown> => !!x && typeof x === 'object') : [];
  const directions: Direction[] = list(rev['directions'])
    .map((d) => ({ pass: num(d['pass']) ?? 0, at: str(d['at']), text: str(d['text']) }))
    .filter((d) => d.text.trim());
  const contingency = (o['contingency'] && typeof o['contingency'] === 'object' ? o['contingency'] : null) as Record<string, unknown> | null;
  return {
    pass: num(rev['pass']) ?? 1,
    directions,
    summary: str(o['summary']),
    templates: list(o['templates']).map((t) => ({ id: str(t['id']), name: str(t['name']) })).filter((t) => t.id),
    lines: list(o['lines'])
      .map((l) => ({
        lineId: str(l['lineId']), name: str(l['name']), quantity: num(l['quantity']) ?? 0,
        unit: typeof l['unit'] === 'string' ? l['unit'] : null,
        option: typeof l['option'] === 'string' && l['option'] ? l['option'] : null,
        template: str(l['template']),
      }))
      .filter((l) => l.lineId),
    gaps: list(o['gaps']).map((g) => ({ scope: str(g['scope']), costType: str(g['costType']) })).filter((g) => g.scope),
    questions: list(o['questions']).map((q) => str(q['question'])).filter(Boolean),
    contingencyRate: contingency ? num(contingency['rate']) : null,
  };
}

/** The rep's new direction, on top of what was said before. */
export function addDirection(previous: PreviousDraft, text: string, now: () => Date = () => new Date()): Revision {
  const clean = text.replace(/\r\n/g, '\n').trim();
  if (!clean) throw new Error('the direction is empty: say what to change');
  return {
    previous,
    directions: [...previous.directions, { pass: previous.pass, at: now().toISOString(), text: clean }],
  };
}

const qty = (n: number): string => (Number.isInteger(n) ? String(n) : n.toFixed(2).replace(/\.?0+$/, ''));

/** What the model reads about the earlier pass and the rep's direction. Deterministic. */
export function revisionText(r: Revision): string {
  const p = r.previous;
  const out: string[] = [];
  out.push(`# The rep has read pass ${p.pass} and given direction`);
  for (const d of r.directions) {
    out.push(`\n[after pass ${d.pass}, ${d.at.slice(0, 10)}]\n${d.text}`);
  }
  out.push(
    '\nThis is a decision made by the rep, who was on site and has spoken with the customer. Follow it even where the ' +
      'photos or the earlier notes point elsewhere, and do not put what it decides back into questions. Change only what ' +
      'the direction changes; keep every line, quantity and option below that it does not touch. In the basis of each ' +
      'line the direction added or changed, say so ("per the rep\'s direction").',
  );
  out.push(`\n## Pass ${p.pass} kept these lines`);
  if (p.templates.length) out.push(`Templates: ${p.templates.map((t) => `${t.name} (${t.id})`).join('; ')}`);
  if (p.lines.length === 0) out.push('(none)');
  for (const l of p.lines) {
    out.push(`- ${l.lineId} · ${l.name} · ${qty(l.quantity)} ${l.unit ?? ''}`.trimEnd() + (l.option ? ` · option: ${l.option}` : '') + ` · ${l.template}`);
  }
  if (p.gaps.length) {
    out.push(`\n## Pass ${p.pass} flagged these as having no template line`);
    for (const g of p.gaps) out.push(`- ${g.scope} (${g.costType})`);
  }
  if (p.questions.length) {
    out.push(`\n## Pass ${p.pass} asked`);
    for (const q of p.questions) out.push(`- ${q}`);
    out.push('A question the direction answers is answered: drop it.');
  }
  if (p.contingencyRate !== null) out.push(`\nPass ${p.pass} carried contingency at ${p.contingencyRate}%.`);
  return out.join('\n');
}

export interface DraftChanges {
  templatesAdded: string[];
  templatesRemoved: string[];
  linesAdded: { name: string; quantity: number; unit: string | null; option: string | null; template: string }[];
  linesRemoved: { name: string; quantity: number; unit: string | null; option: string | null; template: string }[];
  quantityChanged: { name: string; from: number; to: number; unit: string | null }[];
  optionChanged: { name: string; from: string | null; to: string | null }[];
  gapsAdded: string[];
  gapsRemoved: string[];
  contingencyRate: { from: number; to: number } | null;
}

const norm = (s: string): string => s.trim().toLowerCase().replace(/\s+/g, ' ');

/** What moved between the last pass and this one, by template line id and by gap wording. */
export function diffDrafts(previous: PreviousDraft, next: Draft): DraftChanges {
  const prevT = new Map(previous.templates.map((t) => [t.id, t.name]));
  const nextT = new Map(next.plans.map((p) => [p.template.id, p.template.name]));
  const prevL = new Map(previous.lines.map((l) => [l.lineId, l]));
  const nextL = new Map(next.lines.map((l) => [l.lineId, l]));

  const changes: DraftChanges = {
    templatesAdded: [...nextT].filter(([id]) => !prevT.has(id)).map(([, name]) => name),
    templatesRemoved: [...prevT].filter(([id]) => !nextT.has(id)).map(([, name]) => name),
    linesAdded: [],
    linesRemoved: [],
    quantityChanged: [],
    optionChanged: [],
    gapsAdded: [],
    gapsRemoved: [],
    contingencyRate: null,
  };
  for (const l of next.lines) {
    const before = prevL.get(l.lineId);
    if (!before) {
      changes.linesAdded.push({ name: l.name, quantity: l.quantity, unit: l.unit, option: l.option, template: l.templateName });
      continue;
    }
    if (before.quantity !== l.quantity) changes.quantityChanged.push({ name: l.name, from: before.quantity, to: l.quantity, unit: l.unit });
    if ((before.option ?? null) !== (l.option ?? null)) changes.optionChanged.push({ name: l.name, from: before.option, to: l.option });
  }
  for (const l of previous.lines) {
    if (!nextL.has(l.lineId)) changes.linesRemoved.push({ name: l.name, quantity: l.quantity, unit: l.unit, option: l.option, template: l.template });
  }
  const prevG = new Set(previous.gaps.map((g) => norm(g.scope)));
  const nextG = new Set(next.gaps.map((g) => norm(g.scope)));
  changes.gapsAdded = next.gaps.filter((g) => !prevG.has(norm(g.scope))).map((g) => g.scope);
  changes.gapsRemoved = previous.gaps.filter((g) => !nextG.has(norm(g.scope))).map((g) => g.scope);
  if (previous.contingencyRate !== null && next.contingency && next.contingency.rate !== previous.contingencyRate) {
    changes.contingencyRate = { from: previous.contingencyRate, to: next.contingency.rate };
  }
  return changes;
}

export function hasChanges(c: DraftChanges): boolean {
  return (
    c.templatesAdded.length + c.templatesRemoved.length + c.linesAdded.length + c.linesRemoved.length +
      c.quantityChanged.length + c.optionChanged.length + c.gapsAdded.length + c.gapsRemoved.length > 0 ||
    c.contingencyRate !== null
  );
}

/** The changes as short lines for the steps and the page. */
export function changesText(c: DraftChanges): string[] {
  const out: string[] = [];
  const line = (l: { name: string; quantity: number; unit: string | null; option: string | null }): string =>
    `${l.name} ${qty(l.quantity)} ${l.unit ?? ''}`.trimEnd() + (l.option ? ` [${l.option}]` : '');
  if (c.templatesAdded.length) out.push(`Templates added: ${c.templatesAdded.join('; ')}`);
  if (c.templatesRemoved.length) out.push(`Templates no longer used: ${c.templatesRemoved.join('; ')}`);
  if (c.linesAdded.length) out.push(`Lines added: ${c.linesAdded.map(line).join('; ')}`);
  if (c.linesRemoved.length) out.push(`Lines dropped: ${c.linesRemoved.map(line).join('; ')}`);
  if (c.quantityChanged.length) out.push(`Quantities changed: ${c.quantityChanged.map((q) => `${q.name} ${qty(q.from)} → ${qty(q.to)} ${q.unit ?? ''}`.trimEnd()).join('; ')}`);
  if (c.optionChanged.length) out.push(`Options changed: ${c.optionChanged.map((o) => `${o.name} ${o.from ?? 'base'} → ${o.to ?? 'base'}`).join('; ')}`);
  if (c.gapsRemoved.length) out.push(`Flagged items resolved: ${c.gapsRemoved.join('; ')}`);
  if (c.gapsAdded.length) out.push(`Flagged items new: ${c.gapsAdded.join('; ')}`);
  if (c.contingencyRate) out.push(`Contingency ${c.contingencyRate.from}% → ${c.contingencyRate.to}%`);
  if (!out.length) out.push('Nothing changed from the last pass.');
  return out;
}

/** The command the rep runs next, with the direction on one line and safe inside double quotes. */
export function reviseCommand(jobRef: string, text: string): string {
  const oneLine = text.replace(/\s+/g, ' ').replace(/"/g, "'").trim();
  return `npm run draft -- ${jobRef} --revise "${oneLine}"`;
}
