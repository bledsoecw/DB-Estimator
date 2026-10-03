/**
 * The build plan as a page: review/<jobId>-build-plan.html.
 *
 * The dry run prints the tree in the terminal and writes the mutations as
 * JSON; this is the same tree the way the draft page is read — each group
 * the build will create, every line with its quantity, unit price and
 * extension, the DRAFT lines marked, the options with the pre-selected
 * choice, the contingency line with its formula. After --apply the page is
 * written again with what was created and the checks on the read-back.
 */

import { CSS } from '../report.ts';
import { EXTRA_CSS } from './render.ts';
import { CONTINGENCY_GROUP, CONTINGENCY_LINE } from './contingency.ts';
import { DRAFT_TAG, OPTIONS_GROUP, countItems, selectionGroups, type BuildPlan, type BuildRecord, type Gate, type NewGroup, type NewItem } from './build.ts';
import { CHECKS_CSS, flagsHtml, type ReviewFlag } from './checks.ts';

/** Which checks a row is named in, numbered as the box numbers them. */
type Marks = Map<string, { n: number; severity: ReviewFlag['severity'] }[]>;
const markKey = (where: string, name: string): string => `${where}\u0000${name}`;

function marksOf(flags: ReviewFlag[]): Marks {
  const m: Marks = new Map();
  flags.forEach((f, i) => {
    for (const l of f.lines) {
      const k = markKey(l.where, l.name);
      const list = m.get(k) ?? [];
      list.push({ n: i + 1, severity: f.severity });
      m.set(k, list);
    }
  });
  return m;
}

export interface BuildPageInput {
  job: { id: string; name: string };
  draftPath: string;
  planPath: string;
  plannedAt: string;
  gate: Gate;
  /** Null when the gate refused. */
  plan: BuildPlan | null;
  /** Where the build's record is kept (build-cli `recordPaths`). */
  recordPath?: string;
  /** Set after --apply: what was created and what the read-back showed. */
  applied?: { record: BuildRecord; verify: { ok: boolean; lines: string[] } } | null;
}

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

const usd = (n: number | null, digits = 2): string =>
  n === null ? '—' : `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: digits })}`;

const qtyText = (n: number | null): string => (n === null ? '—' : n.toLocaleString('en-US', { maximumFractionDigits: 4 }));

/** JobTread bills a null quantity as one unit. */
const extension = (li: NewItem, unit: number | null): number | null => (unit === null ? null : (li.quantity ?? 1) * unit);

/** `taken`: the line counts in the budget as built, outside every choice or in a pre-selected one. */
interface Row { path: string[]; tags: string[]; item: NewItem; taken: boolean }

/** Every line under a group, with the subgroup path below it and what the selection groups say about the line. */
function rows(g: NewGroup, path: string[] = [], tags: string[] = [], taken = true): Row[] {
  const out: Row[] = [];
  for (const li of g.lineItems) {
    if (li._type === 'costItem') out.push({ path, tags, item: li, taken });
    else {
      const t = [...tags];
      if (li.minSelectionsRequired !== undefined) t.push(li.minSelectionsRequired >= 1 ? 'one choice required' : 'add-on');
      else if (li.isSelected === true) t.push('pre-selected');
      else if (li.isSelected === false && (g.minSelectionsRequired ?? 0) >= 1) t.push('not selected');
      // A choice (a child of a selection group) counts only when it is pre-selected; an add-on starts unselected.
      const choice = g.minSelectionsRequired !== undefined;
      out.push(...rows(li, [...path, li.name], t, taken && (!choice || li.isSelected === true)));
    }
  }
  return out;
}

/**
 * Cost and price of every line under a group. `asSelected`: only what the
 * budget carries as built, the pre-selected choices and no add-on, which is
 * what JobTread totals. 25-0000, 2026-10-02: the scope group read $52,683.07,
 * every choice and add-on summed, for a budget that comes to $34,682.11.
 */
function totals(g: NewGroup, asSelected = false): { cost: number; price: number } {
  let cost = 0;
  let price = 0;
  for (const r of rows(g)) {
    if (asSelected && !r.taken) continue;
    cost += extension(r.item, r.item.unitCost) ?? 0;
    price += extension(r.item, r.item.unitPrice) ?? 0;
  }
  return { cost, price };
}

function rowHtml(r: Row, top: string, marks: Marks): string {
  const li = r.item;
  const draft = li.name.endsWith(DRAFT_TAG);
  const name = draft ? li.name.slice(0, -DRAFT_TAG.length).trim() : li.name;
  const flagged = marks.get(markKey([top, ...r.path].join(' › '), li.name)) ?? [];
  const tags = [
    ...flagged.filter((f) => f.severity !== 'info').map((f) => `<span class="tag ${f.severity === 'problem' ? 'bad' : 'warn'}">${f.severity === 'problem' ? 'problem' : 'check'} ${f.n}</span>`),
    ...r.tags.map((t) => `<span class="tag ${t === 'pre-selected' ? '' : t === 'not selected' ? 'dim' : 'sel'}">${esc(t)}</span>`),
    draft ? '<span class="tag warn">DRAFT — Carl confirms</span>' : '',
    !li.organizationCostItemId && !draft ? '<span class="tag warn">no catalog item</span>' : '',
    li.quantity === 0 ? '<span class="tag dim">count not set</span>' : '',
  ].join(' ');
  // The job note is what the team reads in the line's Internal Notes; the price's source goes under it.
  const jobNote = li.jobNote ? `<div class="jobnote">${esc(li.jobNote).replace(/\n/g, '<br>')}</div>` : '';
  const source = li.name === CONTINGENCY_LINE || draft || !li.organizationCostItemId
    ? ''
    : `<div class="unit">${li.unitCost === null ? 'no price on the catalog item' : 'priced from the catalog item'}</div>`;
  const note = li.quantityFormula
    ? `= <code>${esc(li.quantityFormula)}</code>${jobNote || (li.description ? `<div>${esc(li.description)}</div>` : '')}`
    : jobNote
      ? `${jobNote}${source}`
      : li.name === CONTINGENCY_LINE || draft || li.quantity === 0 || !li.organizationCostItemId
        ? esc(li.description ?? '')
        : source;
  return `<tr class="${[draft ? 'draft' : '', flagged.some((f) => f.severity === 'problem') ? 'problem' : ''].filter(Boolean).join(' ')}">
    <td>${r.path.length ? `<div class="path">${esc(r.path.join(' › '))}</div>` : ''}<div class="name">${esc(name)}</div>${tags}</td>
    <td class="num">${esc(qtyText(li.quantity))}<div class="unit">${esc(li.unitName ?? '')}</div></td>
    <td class="num">${usd(li.unitPrice, 4)}<div class="unit">cost ${usd(li.unitCost, 4)}</div></td>
    <td class="num">${usd(extension(li, li.unitPrice))}<div class="unit">cost ${usd(extension(li, li.unitCost))}</div></td>
    <td class="basis">${note}</td>
  </tr>`;
}

function groupSection(g: NewGroup, record: BuildRecord | null, marks: Marks): string {
  const t = totals(g, true);
  const all = totals(g);
  const kind = g.name === OPTIONS_GROUP ? 'The options the customer picks; each choice priced on its own.'
    : g.name === CONTINGENCY_GROUP ? 'At cost. The quantity is the dollars; the formula is stored for the rep who changes the parameters in JobTread.'
    : g.description ?? '';
  const created = record?.groups.find((x) => x.name === g.name);
  return `<section class="plan">
    <div class="bar">
      <h2>${esc(g.name)}${created ? ` <code class="id">${esc(created.id)}</code>` : ''}</h2>
      <p class="tally">${countItems(g)} line${countItems(g) === 1 ? '' : 's'} &middot; ${usd(t.price)} price &middot; ${usd(t.cost)} cost${
        all.price !== t.price ? ` with the pre-selected choices &middot; ${usd(all.price)} with every choice and add-on` : ''}</p>
    </div>
    ${kind ? `<p class="detail">${esc(kind)}</p>` : ''}
    <table class="lines">
      <thead><tr><th>Line</th><th>Qty</th><th>Unit price</th><th>Price</th><th>Note</th></tr></thead>
      <tbody>${rows(g).map((r) => rowHtml(r, g.name, marks)).join('\n')}</tbody>
    </table>
  </section>`;
}

export function renderBuildPage(x: BuildPageInput): string {
  const { job, plan, gate } = x;
  const mode = x.applied ? (x.applied.verify.ok ? 'built' : 'not verified') : gate.ok ? 'dry run' : 'not built';
  // Selections sit inside the phases now (2026-10-02); the base is everything outside them.
  const selections = plan ? selectionGroups(plan.groups) : [];
  const sum = (ts: { cost: number; price: number }[]): { cost: number; price: number } =>
    ts.reduce((a, b) => ({ cost: a.cost + b.cost, price: a.price + b.price }), { cost: 0, price: 0 });
  const base = plan ? (() => {
    const all = sum(plan.groups.map((g) => totals(g)));
    const opt = sum(selections.map((g) => totals(g)));
    return { cost: all.cost - opt.cost, price: all.price - opt.price };
  })() : null;
  const asSelected = plan ? sum(plan.groups.map((g) => totals(g, true))) : null;
  const noted = plan ? plan.groups.flatMap((g) => rows(g)).filter((r) => r.item.customFieldValues).length : 0;
  const title = `${job.name} — build ${mode}`;
  const draftId = plan?.jobId ?? null;

  const verdict = !gate.ok
    ? `<p class="verdict">Not built. ${esc(gate.reason)}</p>`
    : x.applied
      ? x.applied.verify.ok
        ? `<p class="verdict ok">Built. ${x.applied.record.groups.length} group${x.applied.record.groups.length === 1 ? '' : 's'} on the job's Budget tab, read back and checked. Open the job in JobTread.</p>`
        : `<p class="verdict">Written, but the read-back does not match the plan. Read the checks below before touching the budget by hand.</p>`
      : `<p class="verdict ok">Dry run. Nothing was written. This is what <code>--apply</code> will build.</p>`;

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<style>${CSS}${EXTRA_CSS}${CHECKS_CSS}${BUILD_CSS}</style>
</head>
<body>
<main>
  <header class="head">
    <div class="job">
      <h1>${esc(job.name)}</h1>
      <p class="meta">Build ${esc(mode)}${plan ? ` &middot; pass ${plan.pass} of the draft` : ''} &middot; <code>${esc(job.id)}</code>${
        draftId && draftId !== job.id ? ` &middot; the draft is of <code>${esc(draftId)}</code>` : ''}</p>
    </div>
    ${base ? `<div class="totals">
      <div class="fig"><span class="k">Base price</span><span class="v">${usd(base.price)}</span></div>
      <div class="fig"><span class="k">Base cost</span><span class="v">${usd(base.cost)}</span></div>
      ${selections.length ? `<div class="fig"><span class="k">As pre-selected</span><span class="v">${usd(asSelected!.price)}</span></div>` : ''}
      <div class="fig"><span class="k">Lines</span><span class="v">${plan!.groups.reduce((n, g) => n + countItems(g), 0)}</span></div>
    </div>` : ''}
  </header>

  ${verdict}

  ${plan ? flagsHtml(plan.flags, esc, x.applied ? 'Checked before it was built' : 'Check before you apply') : ''}

  ${gate.ok && gate.warnings.length ? `<ul class="notes">${gate.warnings.map((w) => `<li>${esc(w)}</li>`).join('')}</ul>` : ''}
  ${gate.ok && gate.deletes.length ? `<p class="detail">--replace takes down first: ${gate.deletes.map((d) => `<strong>${esc(d.name)}</strong>`).join(', ')}.</p>` : ''}

  ${plan ? `<section class="summary">
    <h2>What gets built</h2>
    <p>${plan.counts.lines} template line${plan.counts.lines === 1 ? '' : 's'}, ${plan.counts.found} from the catalog, ${plan.counts.created} created on the job, ${plan.counts.options} option group${plan.counts.options === 1 ? '' : 's'}${
      plan.contingency ? `. Contingency ${plan.contingency.rate}%: ${usd(plan.contingency.amount)} on the ${usd(plan.contingency.base)} base scope${plan.contingency.shares.length ? ', and each option carries its own share inside its choice, so the budget\'s contingency follows what the customer picks' : ''}` : ''}. Base price is the template groups and the base contingency; each option is priced on its own below, its share included${
      selections.length ? `. As pre-selected, the budget comes to ${usd(asSelected!.price)} price, ${usd(asSelected!.cost)} cost` : ''}.</p>
    ${selections.length ? `<ul>${selections.map((o) => {
      const choices = o.lineItems.filter((li): li is NewGroup => li._type === 'costGroup');
      const share = (c: NewGroup): string => {
        const s = plan.contingency?.shares.find((x) => x.group === o.name && x.choice === c.name);
        return s ? ` (incl. ${usd(s.amount)} contingency)` : '';
      };
      return o.minSelectionsRequired! >= 1
        ? `<li><strong>${esc(o.name)}</strong>, one choice required:<ul>${choices.map((c) => `<li>${esc(c.name)}${c.isSelected ? ' (pre-selected)' : ''} &mdash; ${usd(totals(c).price)} price, ${usd(totals(c).cost)} cost${share(c)}</li>`).join('')}</ul></li>`
        : choices.map((c) => `<li><strong>${esc(c.name)}</strong>, optional add-on &mdash; ${usd(totals(c).price)} price, ${usd(totals(c).cost)} cost${share(c)}</li>`).join('');
    }).join('')}</ul>` : ''}
    ${plan.parameters.length ? `<p class="fine">Job parameters: ${plan.parameters.map((p) => `${esc(p.name)} = ${p.value}`).join(', ')}.</p>` : ''}
    ${noted ? `<p class="fine">${noted} line${noted === 1 ? '' : 's'} carry a note for the team in Internal Notes, under the catalog's own note: what the line is for on this job, how the count was reached, and where a new line's price came from. It is in the Note column below.</p>` : ''}
  </section>

  ${plan.groups.map((g) => groupSection(g, x.applied?.record ?? null, marksOf(plan.flags))).join('\n')}` : ''}

  ${x.applied ? `<section class="summary">
    <h2>Read back from JobTread</h2>
    <ul class="checks">${x.applied.verify.lines.map((l) => `<li class="${l.startsWith('ok') ? 'ok' : 'bad'}">${esc(l)}</li>`).join('')}</ul>
    <p class="fine">Built ${esc(x.applied.record.builtAt.slice(0, 16).replace('T', ' '))}; the record is <code>${esc(x.recordPath ?? `${job.id}-built.json`)}</code>, and <code>--replace</code> takes these groups down again, from this computer or the other.</p>
  </section>` : gate.ok && plan ? `<section class="steps">
    <h2>Next</h2>
    <p class="detail">Read the tree. If a quantity or price is wrong, fix the draft (another <code>--revise</code> pass) and run this again. When it reads right:</p>
    <pre>npm run build-budget -- ${esc(job.id)} --draft ${esc(x.draftPath)} --apply${gate.deletes.length ? ' --replace' : ''}</pre>
    <p class="fine">Needs <code>JOBTREAD_WRITE_GRANT_KEY</code> in <code>.env</code>. The exact mutations are in <code>${esc(x.planPath)}</code>.</p>
  </section>` : ''}

  <footer class="fine">Planned ${esc(x.plannedAt.slice(0, 16).replace('T', ' '))} from <code>${esc(x.draftPath)}</code>. Only the job's own budget is written; no catalog template is changed.</footer>
</main>
</body>
</html>
`;
}

const BUILD_CSS = `
.tag.sel { background: var(--green); }
tr.draft td { background: color-mix(in srgb, var(--amber) 8%, transparent); }
tr.problem td { background: color-mix(in srgb, var(--red) 9%, transparent); }
.id { font-size: 11px; color: var(--dim); font-weight: 400; margin-left: 6px; }
.notes { margin: 10px 0 0; padding-left: 20px; font-size: 13.5px; color: var(--dim); }
.checks { margin: 8px 0 0; padding-left: 20px; font-size: 13.5px; list-style: none; }
.checks li::before { content: '✓ '; color: var(--green); }
.checks li.bad::before { content: '✗ '; color: var(--red); }
.checks li.bad { color: var(--red); font-weight: 600; }
footer.fine { margin-top: 30px; }
.jobnote { font-size: 12.5px; line-height: 1.45; }
`;
