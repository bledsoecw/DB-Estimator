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
import { DRAFT_TAG, OPTIONS_GROUP, countItems, type BuildPlan, type BuildRecord, type Gate, type NewGroup, type NewItem } from './build.ts';

export interface BuildPageInput {
  job: { id: string; name: string };
  draftPath: string;
  planPath: string;
  plannedAt: string;
  gate: Gate;
  /** Null when the gate refused. */
  plan: BuildPlan | null;
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

interface Row { path: string[]; tags: string[]; item: NewItem }

/** Every line under a group, with the subgroup path below it and what the selection groups say about the line. */
function rows(g: NewGroup, path: string[] = [], tags: string[] = []): Row[] {
  const out: Row[] = [];
  for (const li of g.lineItems) {
    if (li._type === 'costItem') out.push({ path, tags, item: li });
    else {
      const t = [...tags];
      if (li.minSelectionsRequired !== undefined) t.push(li.minSelectionsRequired >= 1 ? 'one choice required' : 'add-on');
      else if (li.isSelected === true) t.push('pre-selected');
      else if (li.isSelected === false && (g.minSelectionsRequired ?? 0) >= 1) t.push('not selected');
      out.push(...rows(li, [...path, li.name], t));
    }
  }
  return out;
}

function totals(g: NewGroup): { cost: number; price: number } {
  let cost = 0;
  let price = 0;
  for (const r of rows(g)) {
    cost += extension(r.item, r.item.unitCost) ?? 0;
    price += extension(r.item, r.item.unitPrice) ?? 0;
  }
  return { cost, price };
}

function rowHtml(r: Row): string {
  const li = r.item;
  const draft = li.name.endsWith(DRAFT_TAG);
  const name = draft ? li.name.slice(0, -DRAFT_TAG.length).trim() : li.name;
  const tags = [
    ...r.tags.map((t) => `<span class="tag ${t === 'pre-selected' ? '' : t === 'not selected' ? 'dim' : 'sel'}">${esc(t)}</span>`),
    draft ? '<span class="tag warn">DRAFT — Carl confirms</span>' : '',
    !li.organizationCostItemId && !draft ? '<span class="tag warn">no catalog item</span>' : '',
    li.quantity === 0 ? '<span class="tag dim">count not set</span>' : '',
  ].join(' ');
  const note = li.quantityFormula
    ? `= <code>${esc(li.quantityFormula)}</code>${li.description ? `<div>${esc(li.description)}</div>` : ''}`
    : li.name === CONTINGENCY_LINE
      ? esc(li.description ?? '')
      : draft || li.quantity === 0
      ? esc(li.description ?? '')
      : li.organizationCostItemId
        ? (li.unitCost === null ? 'no price on the catalog item' : 'priced from the catalog item')
        : esc(li.description ?? '');
  return `<tr class="${draft ? 'draft' : ''}">
    <td>${r.path.length ? `<div class="path">${esc(r.path.join(' › '))}</div>` : ''}<div class="name">${esc(name)}</div>${tags}</td>
    <td class="num">${esc(qtyText(li.quantity))}<div class="unit">${esc(li.unitName ?? '')}</div></td>
    <td class="num">${usd(li.unitPrice, 4)}<div class="unit">cost ${usd(li.unitCost, 4)}</div></td>
    <td class="num">${usd(extension(li, li.unitPrice))}<div class="unit">cost ${usd(extension(li, li.unitCost))}</div></td>
    <td class="basis">${note}</td>
  </tr>`;
}

function groupSection(g: NewGroup, record: BuildRecord | null): string {
  const t = totals(g);
  const kind = g.name === OPTIONS_GROUP ? 'The options the customer picks; each choice priced on its own.'
    : g.name === CONTINGENCY_GROUP ? 'At cost. The quantity is the dollars; the formula is stored for the rep who changes the parameters in JobTread.'
    : g.description ?? '';
  const created = record?.groups.find((x) => x.name === g.name);
  return `<section class="plan">
    <div class="bar">
      <h2>${esc(g.name)}${created ? ` <code class="id">${esc(created.id)}</code>` : ''}</h2>
      <p class="tally">${countItems(g)} line${countItems(g) === 1 ? '' : 's'} &middot; ${usd(t.price)} price &middot; ${usd(t.cost)} cost</p>
    </div>
    ${kind ? `<p class="detail">${esc(kind)}</p>` : ''}
    <table class="lines">
      <thead><tr><th>Line</th><th>Qty</th><th>Unit price</th><th>Price</th><th>Note</th></tr></thead>
      <tbody>${rows(g).map(rowHtml).join('\n')}</tbody>
    </table>
  </section>`;
}

export function renderBuildPage(x: BuildPageInput): string {
  const { job, plan, gate } = x;
  const mode = x.applied ? (x.applied.verify.ok ? 'built' : 'not verified') : gate.ok ? 'dry run' : 'not built';
  const base = plan ? plan.groups.filter((g) => g.name !== OPTIONS_GROUP).map(totals).reduce((a, b) => ({ cost: a.cost + b.cost, price: a.price + b.price }), { cost: 0, price: 0 }) : null;
  const options = plan?.groups.find((g) => g.name === OPTIONS_GROUP);
  const title = `${job.name} — build ${mode}`;
  const draftId = plan?.jobId ?? null;

  const verdict = !gate.ok
    ? `<p class="verdict">Not built. ${esc(gate.reason)}</p>`
    : x.applied
      ? x.applied.verify.ok
        ? `<p class="verdict ok">Built. ${x.applied.record.groups.length} groups on the job's Budget tab, read back and checked. Open the job in JobTread.</p>`
        : `<p class="verdict">Written, but the read-back does not match the plan. Read the checks below before touching the budget by hand.</p>`
      : `<p class="verdict ok">Dry run. Nothing was written. This is what <code>--apply</code> will build.</p>`;

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<style>${CSS}${EXTRA_CSS}${BUILD_CSS}</style>
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
      <div class="fig"><span class="k">Lines</span><span class="v">${plan!.groups.reduce((n, g) => n + countItems(g), 0)}</span></div>
    </div>` : ''}
  </header>

  ${verdict}

  ${gate.ok && gate.warnings.length ? `<ul class="notes">${gate.warnings.map((w) => `<li>${esc(w)}</li>`).join('')}</ul>` : ''}
  ${gate.ok && gate.deletes.length ? `<p class="detail">--replace takes down first: ${gate.deletes.map((d) => `<strong>${esc(d.name)}</strong>`).join(', ')}.</p>` : ''}

  ${plan ? `<section class="summary">
    <h2>What gets built</h2>
    <p>${plan.counts.lines} template line${plan.counts.lines === 1 ? '' : 's'}, ${plan.counts.found} from the catalog, ${plan.counts.created} created on the job, ${plan.counts.options} option group${plan.counts.options === 1 ? '' : 's'}${
      plan.contingency ? `. Contingency ${plan.contingency.rate}%: ${usd(plan.contingency.amount)} on the ${usd(plan.contingency.base)} base scope${plan.contingency.shares.length ? ', and each option carries its own share inside its choice, so the budget\'s contingency follows what the customer picks' : ''}` : ''}. Base price is the template groups and the base contingency; each option is priced on its own below, its share included.</p>
    ${options ? `<ul>${options.lineItems.filter((li): li is NewGroup => li._type === 'costGroup').map((o) => {
      const choices = o.lineItems.filter((li): li is NewGroup => li._type === 'costGroup');
      const share = (c: NewGroup): string => {
        const s = plan.contingency?.shares.find((x) => x.group === o.name && x.choice === c.name);
        return s ? ` (incl. ${usd(s.amount)} contingency)` : '';
      };
      return o.minSelectionsRequired! >= 1
        ? `<li><strong>${esc(o.name)}</strong>, one choice required:<ul>${choices.map((c) => `<li>${esc(c.name)}${c.isSelected ? ' (pre-selected)' : ''} &mdash; ${usd(totals(c).price)} price, ${usd(totals(c).cost)} cost${share(c)}</li>`).join('')}</ul></li>`
        : `<li><strong>${esc(o.name)}</strong>, optional add-on &mdash; ${usd(totals(o).price)} price, ${usd(totals(o).cost)} cost${choices[0] ? share(choices[0]) : ''}</li>`;
    }).join('')}</ul>` : ''}
    ${plan.parameters.length ? `<p class="fine">Job parameters: ${plan.parameters.map((p) => `${esc(p.name)} = ${p.value}`).join(', ')}.</p>` : ''}
  </section>

  ${plan.groups.map((g) => groupSection(g, x.applied?.record ?? null)).join('\n')}

  ${plan.notes.length ? `<section class="summary"><h2>Notes</h2><ul class="notes">${plan.notes.map((n) => `<li>${esc(n)}</li>`).join('')}</ul></section>` : ''}` : ''}

  ${x.applied ? `<section class="summary">
    <h2>Read back from JobTread</h2>
    <ul class="checks">${x.applied.verify.lines.map((l) => `<li class="${l.startsWith('ok') ? 'ok' : 'bad'}">${esc(l)}</li>`).join('')}</ul>
    <p class="fine">Built ${esc(x.applied.record.builtAt.slice(0, 16).replace('T', ' '))}; the record is beside this page as <code>${esc(job.id)}-built.json</code>, and <code>--replace</code> takes these groups down again.</p>
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
.id { font-size: 11px; color: var(--dim); font-weight: 400; margin-left: 6px; }
.notes { margin: 10px 0 0; padding-left: 20px; font-size: 13.5px; color: var(--dim); }
.checks { margin: 8px 0 0; padding-left: 20px; font-size: 13.5px; list-style: none; }
.checks li::before { content: '✓ '; color: var(--green); }
.checks li.bad::before { content: '✗ '; color: var(--red); }
.checks li.bad { color: var(--red); font-weight: 600; }
footer.fine { margin-top: 30px; }
`;
