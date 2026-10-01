/**
 * What the rep must look at before a draft becomes a budget.
 *
 * Deterministic and free: every check here reads lines that already exist and
 * says where the money is. The pages put the result at the top in a box of its
 * own, because a problem listed at the bottom, or only implied by two rows
 * that happen to sit near each other, is a problem nobody sees. Carl found the
 * first two by asking, on job 25-0000: "Insulation - Sub" and "Insulation -
 * Batt" both on the same 909 SF of false wall, and drywall board counted in
 * sheets against a price that is per square foot.
 *
 *   problem   money is very likely wrong: the same work paid twice, a quantity
 *             in one unit priced per another.
 *   check     money may be wrong, or is not final: a sub beside the material
 *             it may already supply, a line with no count or no price, the
 *             DRAFT lines Carl confirms, a template whose unit wants fixing.
 *   info      what the budget comes to, so a figure that looks wrong is seen.
 */

export type Severity = 'problem' | 'check' | 'info';

export interface ReviewFlag {
  severity: Severity;
  /** What kind of check raised it; stable, for tests and for the page's ordering. */
  kind: 'double-count' | 'unit' | 'unit-conflict' | 'no-count' | 'unpriced' | 'draft' | 'contingency' | 'note';
  /** One or two sentences for the rep, with the names and the money. */
  text: string;
  /** The lines it is about, by where they sit and their name, so the page can mark the rows. */
  lines: { where: string; name: string }[];
}

/** A line as the checks see it: where it sits on the budget and what it costs. */
export interface CheckLine {
  /** The group it sits in, as a path: siblings are lines with the same `where`. */
  where: string;
  name: string;
  costType: string | null;
  quantity: number | null;
  unit: string | null;
  /** Extended cost, dollars; null when unpriced. */
  cost: number | null;
  /** A $0 line kept so the crew can clock to it: never "no count" or "unpriced". */
  tracking?: boolean;
}

const DRAFT_SUFFIX = /\s*\(DRAFT - Carl confirms\)\s*$/i;

/** The trade a line belongs to, from its name: the first word. "Insulation - Sub" and "Insulation - Batt" are both insulation. */
export function stemOf(name: string): string {
  const m = /[a-z]+/.exec(name.replace(DRAFT_SUFFIX, '').toLowerCase());
  return m ? m[0] : '';
}

const usd = (n: number | null): string =>
  n === null ? 'unpriced' : `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const amount = (l: CheckLine): string =>
  `${l.quantity === null ? '—' : l.quantity.toLocaleString('en-US', { maximumFractionDigits: 2 })} ${l.unit ?? ''}`.trimEnd();
const isSub = (l: CheckLine): boolean => (l.costType ?? '').toLowerCase() === 'subcontractor';
const typeOf = (l: CheckLine): string => (l.costType ?? '').toLowerCase();
const sameAmount = (a: CheckLine, b: CheckLine): boolean => a.quantity !== null && a.quantity === b.quantity && a.unit === b.unit;

/**
 * The same work paid for twice in one place: two lines of one trade, side by
 * side in one group, where one is a subcontractor and the other is DB's crew,
 * DB's material, or a second sub; and the same catalog line twice.
 */
export function doubleCounts(lines: CheckLine[]): ReviewFlag[] {
  const out: ReviewFlag[] = [];
  const byWhere = new Map<string, CheckLine[]>();
  for (const l of lines) {
    if (/^project contingency$/i.test(l.name) || /^general description$/i.test(l.name)) continue;
    const list = byWhere.get(l.where) ?? [];
    list.push(l);
    byWhere.set(l.where, list);
  }
  for (const [where, group] of byWhere) {
    const seen = new Set<string>();
    for (const l of group) {
      const key = l.name.replace(DRAFT_SUFFIX, '').toLowerCase();
      if (seen.has(key)) {
        out.push({ severity: 'problem', kind: 'double-count', text: `"${l.name}" is in ${where} twice.`, lines: [{ where, name: l.name }] });
      }
      seen.add(key);
    }
    for (const s of group.filter(isSub)) {
      const stem = stemOf(s.name);
      if (!stem) continue;
      for (const o of group) {
        if (o === s || stemOf(o.name) !== stem) continue;
        const both = [{ where, name: s.name }, { where, name: o.name }];
        const same = sameAmount(s, o) ? ` Both are for ${amount(s)}.` : '';
        if (typeOf(o) === 'labor') {
          out.push({
            severity: 'problem', kind: 'double-count', lines: both,
            text: `${where}: "${s.name}" (a subcontractor, ${usd(s.cost)}) and "${o.name}" (DB's crew, ${usd(o.cost)}) pay twice for the same ${stem} work.${same} Keep the one that does the work.`,
          });
        } else if (typeOf(o) === 'materials') {
          out.push({
            severity: same ? 'problem' : 'check', kind: 'double-count', lines: both,
            text: `${where}: "${s.name}" (a subcontractor, ${usd(s.cost)}) and "${o.name}" (DB's material, ${usd(o.cost)}) are the same ${stem} work.${same} If the sub supplies the material, ${usd(o.cost)} is paid twice.`,
          });
        } else if (isSub(o) && s.name < o.name) {
          out.push({
            severity: 'check', kind: 'double-count', lines: both,
            text: `${where}: two subcontractor lines for ${stem}, "${s.name}" (${usd(s.cost)}) and "${o.name}" (${usd(o.cost)}). Check they are different parts of the work.`,
          });
        }
      }
    }
  }
  return out;
}

/** Lines that are on the budget but not final: no count, no price, or created for Carl to confirm. */
export function openLines(lines: CheckLine[]): ReviewFlag[] {
  const out: ReviewFlag[] = [];
  const list = (ls: CheckLine[]): string => ls.map((l) => `"${l.name.replace(DRAFT_SUFFIX, '')}"`).join(', ');
  const noCount = lines.filter((l) => l.quantity === 0 && !l.tracking);
  if (noCount.length) {
    out.push({ severity: 'check', kind: 'no-count', lines: noCount.map((l) => ({ where: l.where, name: l.name })),
      text: `${noCount.length} line${noCount.length === 1 ? ' has' : 's have'} no count yet and cost nothing until the rep sets it: ${list(noCount)}.` });
  }
  const unpriced = lines.filter((l) => l.cost === null && !l.tracking && !/^general description$/i.test(l.name));
  if (unpriced.length) {
    out.push({ severity: 'check', kind: 'unpriced', lines: unpriced.map((l) => ({ where: l.where, name: l.name })),
      text: `${unpriced.length} line${unpriced.length === 1 ? ' has' : 's have'} no price: ${list(unpriced)}.` });
  }
  const drafts = lines.filter((l) => DRAFT_SUFFIX.test(l.name));
  if (drafts.length) {
    const total = drafts.reduce((n, l) => n + (l.cost ?? 0), 0);
    out.push({ severity: 'check', kind: 'draft', lines: drafts.map((l) => ({ where: l.where, name: l.name })),
      text: `${drafts.length} line${drafts.length === 1 ? ' was' : 's were'} created for Carl to confirm, ${usd(total)} of cost: ${list(drafts)}.` });
  }
  return out;
}

/**
 * A line counted in one unit and priced per another. The dollars are the
 * count times the price whatever the label says, so this is a problem until
 * a person says which unit is right and fixes the catalog.
 */
export function unitConflictFlag(
  where: string, name: string, unit: string | null, pricedUnit: string, quantity: number | null, unitCost: number | null,
): ReviewFlag {
  const q = quantity ?? 0;
  const money = unitCost === null ? '' : ` ${q.toLocaleString('en-US', { maximumFractionDigits: 2 })} ${unit ?? 'units'} at ${usd(unitCost)} comes to ${usd(q * unitCost)}.`;
  return {
    severity: 'problem', kind: 'unit-conflict', lines: [{ where, name }],
    text: `${where}: "${name}" is counted in ${unit ?? 'no unit'}, but its catalog price${unitCost === null ? '' : ` (${usd(unitCost)})`} is per ${pricedUnit}.${money} Set the count in the unit the price is really per, and fix whichever unit is wrong in the catalog.`,
  };
}

const ORDER: Record<Severity, number> = { problem: 0, check: 1, info: 2 };

/** Problems first, then checks, then the figures. */
export function sortFlags(flags: ReviewFlag[]): ReviewFlag[] {
  return [...flags].sort((a, b) => ORDER[a.severity] - ORDER[b.severity]);
}

/** The box at the top of a page. Empty when there is nothing to say. */
export function flagsHtml(flags: ReviewFlag[], esc: (s: string) => string, title = 'Check before you apply'): string {
  if (!flags.length) return '';
  const sorted = sortFlags(flags);
  const problems = sorted.filter((f) => f.severity === 'problem').length;
  const checks = sorted.filter((f) => f.severity === 'check').length;
  const label: Record<Severity, string> = { problem: 'Problem', check: 'Check', info: 'Figure' };
  return `<section class="review ${problems ? 'has-problems' : ''}">
    <h2>${esc(title)}${problems || checks ? ` <span class="counts">${[problems ? `${problems} problem${problems === 1 ? '' : 's'}` : '', checks ? `${checks} to check` : ''].filter(Boolean).join(' &middot; ')}</span>` : ''}</h2>
    <ol>${sorted.map((f) => `<li class="${f.severity}"><span class="sev">${label[f.severity]}</span> ${esc(f.text)}</li>`).join('')}</ol>
  </section>`;
}

export const CHECKS_CSS = `
.review { margin-top: 22px; padding: 14px 18px; border: 1px solid var(--line); border-left: 4px solid var(--amber);
  border-radius: 7px; background: var(--card); }
.review.has-problems { border-left-color: var(--red); }
.review h2 { margin: 0 0 8px; font-size: 16px; }
.review .counts { font-size: 12.5px; font-weight: 600; color: var(--dim); margin-left: 6px; }
.review ol { margin: 0; padding-left: 20px; font-size: 14px; }
.review li { margin: 6px 0; }
.review .sev { display: inline-block; min-width: 62px; font-size: 10.5px; font-weight: 700; text-transform: uppercase;
  letter-spacing: .06em; }
.review li.problem .sev { color: var(--red); }
.review li.check .sev { color: var(--amber); }
.review li.info .sev { color: var(--dim); }
.tag.bad { background: var(--red); }
`;
