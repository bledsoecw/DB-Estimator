/**
 * The rep's page: the draft as a recipe to follow in JobTread.
 *
 * Until the write path exists, the rep builds the budget by hand, so the
 * page is written as the steps they take: add this template, keep these
 * lines, delete those, set these quantities, put these in a selection
 * group, write this in General Description, and take these flagged items
 * to Carl. The same steps come out as plain text under "Copy the steps".
 *
 * It decides nothing and writes nothing to JobTread.
 */

import { type Money, ZERO, formatMoney, formatPercent } from '../money.ts';
import { marginOf } from '../domain.ts';
import { CSS } from '../report.ts';
import { STRUCTURAL_GROUPS, groupPath } from './templates.ts';
import type { JobEvidence } from './evidence.ts';
import type { Draft, DraftLine, TemplatePlan, Totals } from './draft.ts';

function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function qty(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(2).replace(/\.?0+$/, '');
}

function money(m: Money, priced: boolean): string {
  return priced ? formatMoney(m) : '—';
}

function totalsLine(t: Totals): string {
  const margin = t.price > ZERO ? formatPercent(marginOf(t.price, t.cost)) : '—';
  return `${formatMoney(t.price)} price · ${formatMoney(t.cost)} cost · ${margin} margin` +
    (t.unpriced ? ` · ${t.unpriced} line${t.unpriced === 1 ? '' : 's'} to price by hand` : '');
}

const CONFIDENCE_LABEL = { high: 'confident', medium: 'check', low: 'guess' } as const;

// ---- plain text ---------------------------------------------------------------

/** The steps as text: what goes on the clipboard, and what a test reads. */
export function draftSteps(d: Draft): string {
  const out: string[] = [];
  out.push(`${d.jobName} — budget draft`);
  if (d.noFit) {
    out.push('');
    out.push(`No budget template fits this job. ${d.noFit}`);
    out.push('Take it to Carl before building anything.');
    return out.join('\n');
  }
  out.push(`Base scope: ${totalsLine(d.totals.base)}`);
  for (const o of d.totals.options) out.push(`Option "${o.name}": ${totalsLine(o.totals)}`);
  out.push('');

  let step = 0;
  for (const p of d.plans) {
    step++;
    out.push(`${step}. Budget tab › Add from catalog › "${p.template.name}"${p.role === 'primary' ? ' (the main template)' : ''}.`);
    out.push(
      `   Keep ${p.kept.length} line${p.kept.length === 1 ? '' : 's'}, delete the other ${p.removed.length}.` +
        (p.structural ? ` Leave the ${p.structural} time-tracking and fee lines as they are.` : ''),
    );
    if (p.kept.length) {
      out.push('   Keep, with these quantities:');
      for (const l of p.kept) {
        out.push(`     - ${[...l.groupPath, l.name].join(' › ')}: ${qty(l.quantity)} ${l.unit ?? ''}` +
          (l.option ? ` [option: ${l.option}]` : '') +
          (l.priced ? '' : ' [no catalog price — type it]') +
          ` — ${l.basis} (${CONFIDENCE_LABEL[l.confidence]})`);
      }
    }
    if (p.removed.length) {
      out.push(`   Delete: ${p.removed.map((l) => l.name).join('; ')}`);
    }
  }
  if (d.totals.options.length) {
    step++;
    out.push(`${step}. Selection groups, one choice required, so the customer picks on the estimate:`);
    for (const o of d.totals.options) {
      const names = d.lines.filter((l) => l.option === o.name).map((l) => l.name);
      out.push(`   - "${o.name}": ${names.join('; ')}`);
    }
  }
  if (d.scopeOfWork) {
    step++;
    out.push(`${step}. General Description:`);
    for (const line of d.scopeOfWork.split('\n')) out.push(`   ${line}`);
  }
  if (d.gaps.length) {
    step++;
    out.push(`${step}. Not in any template — take to Carl before the estimate goes out:`);
    for (const g of d.gaps) {
      out.push(`   - ${g.scope} (${g.costType}${g.quantity !== null ? `, ${qty(g.quantity)} ${g.unit}` : `, ${g.unit}`}): ${g.why}`);
    }
  }
  if (d.questions.length) {
    step++;
    out.push(`${step}. Confirm before it goes out:`);
    for (const q of d.questions) out.push(`   - ${q.question} — ${q.why}`);
  }
  if (d.rejected.length) {
    out.push('');
    out.push(`The model named ${d.rejected.length} line${d.rejected.length === 1 ? '' : 's'} that are not in these templates; they were NOT added:`);
    for (const r of d.rejected) out.push(`   - ${r.lineId}: ${r.reason}`);
  }
  out.push('');
  out.push(`Leave ${[...STRUCTURAL_GROUPS].join(', ')} untouched. Nothing here was written to JobTread.`);
  return out.join('\n');
}

/** The draft as data, bigint money as dollar strings. The future write-path payload. */
export function draftJson(d: Draft): unknown {
  const t = (x: Totals): unknown => ({ price: formatMoney(x.price), cost: formatMoney(x.cost), lines: x.lines, unpriced: x.unpriced });
  return {
    job: { id: d.jobId, name: d.jobName },
    model: d.model,
    summary: d.summary,
    pickSummary: d.pickSummary,
    noFit: d.noFit,
    scopeOfWork: d.scopeOfWork,
    templates: d.plans.map((p) => ({
      id: p.template.id,
      name: p.template.name,
      role: p.role,
      why: p.why,
      keep: p.kept.map((l) => l.lineId),
      delete: p.removed.map((l) => ({ id: l.id, name: l.name })),
      structuralLines: p.structural,
    })),
    lines: d.lines.map((l) => ({
      lineId: l.lineId,
      name: l.name,
      template: l.templateName,
      group: l.groupPath.join(' › '),
      quantity: l.quantity,
      unit: l.unit,
      costType: l.costTypeName,
      unitCost: l.priced ? formatMoney(l.unitCost) : null,
      unitPrice: l.priced ? formatMoney(l.unitPrice) : null,
      cost: l.priced ? formatMoney(l.cost) : null,
      price: l.priced ? formatMoney(l.price) : null,
      option: l.option,
      basis: l.basis,
      confidence: l.confidence,
      evidence: l.evidence,
    })),
    gaps: d.gaps,
    questions: d.questions,
    rejected: d.rejected,
    rejectedPicks: d.rejectedPicks,
    totals: { base: t(d.totals.base), options: d.totals.options.map((o) => ({ name: o.name, ...(t(o.totals) as object) })), all: t(d.totals.all) },
    usage: d.usage,
    cost: d.cost,
  };
}

// ---- html ----------------------------------------------------------------------

export interface RenderOptions {
  footnote?: string;
}

export function renderDraft(e: JobEvidence, d: Draft, opts: RenderOptions = {}): string {
  const title = `${d.jobName} — budget draft`;
  const steps = draftSteps(d);
  const flagged = d.gaps.length + d.rejected.length + d.rejectedPicks.length;

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<style>${CSS}${EXTRA_CSS}</style>
</head>
<body>
<main>
  <header class="head">
    <div class="job">
      <h1>${esc(d.jobName)}</h1>
      <p class="meta">Budget draft &middot; ${esc(e.projectType ?? 'project type not set')} &middot;
        ${d.lines.length} lines from ${d.plans.length} template${d.plans.length === 1 ? '' : 's'}
        &middot; <code>${esc(d.jobId)}</code></p>
    </div>
    <div class="totals">
      <div class="fig"><span class="k">Base price</span><span class="v">${formatMoney(d.totals.base.price)}</span></div>
      <div class="fig"><span class="k">Base cost</span><span class="v">${formatMoney(d.totals.base.cost)}</span></div>
      <div class="fig"><span class="k">Margin</span><span class="v">${
        d.totals.base.price > ZERO ? formatPercent(marginOf(d.totals.base.price, d.totals.base.cost)) : '—'
      }</span></div>
    </div>
  </header>

  ${d.noFit
    ? `<p class="verdict">No budget template fits this job. ${esc(d.noFit)} Take it to Carl.</p>`
    : `<p class="verdict ${flagged ? '' : 'ok'}">${
        flagged
          ? `${flagged} item${flagged === 1 ? '' : 's'} flagged for Carl`
          : 'Every line comes from a budget template.'
      }${d.questions.length ? ` &middot; ${d.questions.length} question${d.questions.length === 1 ? '' : 's'} for the customer` : ''}${
        d.totals.base.unpriced ? ` &middot; ${d.totals.base.unpriced} line${d.totals.base.unpriced === 1 ? '' : 's'} to price by hand` : ''
      }</p>`}

  ${d.totals.options.length ? `<section class="options">
    <h2>Options the customer picks</h2>
    <ul>${d.totals.options.map((o) => `<li><strong>${esc(o.name)}</strong> &mdash; ${esc(totalsLine(o.totals))}</li>`).join('')}</ul>
  </section>` : ''}

  <section class="summary">
    <h2>What the model read</h2>
    <p>${esc(d.summary || d.pickSummary)}</p>
    <p class="fine">${e.comments.length} comment${e.comments.length === 1 ? '' : 's'}, ${e.attachments.length} file${e.attachments.length === 1 ? '' : 's'} sent${
      e.failed.length ? `, ${e.failed.length} failed to download` : ''}${e.excluded.length ? `, ${e.excluded.length} left out` : ''}.</p>
  </section>

  ${d.plans.map((p) => planSection(p)).join('\n')}

  ${d.gaps.length ? `<section class="findings">
    <div class="bar"><h2>Not in any template <span class="count">${d.gaps.length}</span></h2>
      <p class="tally">Carl decides each one before the estimate goes out</p></div>
    ${d.gaps.map((g) => `<article class="card sev-pricing">
      <div class="chip">Flagged</div>
      <h3>${esc(g.scope)}</h3>
      <p class="detail">${esc(g.why)}</p>
      <table class="math">
        <tr><td>cost type</td><td>${esc(g.costType)}</td></tr>
        <tr><td>quantity</td><td>${g.quantity !== null ? `${esc(qty(g.quantity))} ${esc(g.unit)}` : esc(g.unit)}</td></tr>
        <tr><td>basis</td><td>${esc(g.basis)}</td></tr>
        ${g.evidence.map((ev) => `<tr><td>${esc(ev.source)}</td><td>${esc(ev.quote)}</td></tr>`).join('')}
      </table>
    </article>`).join('\n')}
  </section>` : ''}

  ${d.questions.length ? `<section class="findings">
    <div class="bar"><h2>Confirm before it goes out <span class="count amber">${d.questions.length}</span></h2></div>
    ${d.questions.map((q) => `<article class="card sev-data">
      <div class="chip">Question</div>
      <h3>${esc(q.question)}</h3>
      <p class="detail">${esc(q.why)}</p>
    </article>`).join('\n')}
  </section>` : ''}

  ${d.rejected.length || d.rejectedPicks.length ? `<section class="findings">
    <div class="bar"><h2>Named by the model, not in the templates <span class="count">${d.rejected.length + d.rejectedPicks.length}</span></h2>
      <p class="tally">Not added. Listed so nothing is dropped silently.</p></div>
    ${[...d.rejectedPicks.map((r) => `<article class="card sev-data"><div class="chip">Template</div><h3><code>${esc(r.templateId)}</code></h3><p class="detail">${esc(r.reason)}</p></article>`),
       ...d.rejected.map((r) => `<article class="card sev-data"><div class="chip">Line</div><h3><code>${esc(r.lineId)}</code></h3><p class="detail">${esc(r.reason)}</p></article>`)].join('\n')}
  </section>` : ''}

  ${d.scopeOfWork ? `<section class="scope">
    <h2>General Description</h2>
    <blockquote>${esc(d.scopeOfWork).replace(/\n/g, '<br>')}</blockquote>
  </section>` : ''}

  <section class="steps">
    <div class="bar"><h2>Build it in JobTread</h2>
      <button type="button" id="copy" class="no-print">Copy the steps</button></div>
    <pre id="steps">${esc(steps)}</pre>
  </section>

  <footer>
    <p><strong>A draft, not an estimate.</strong> Nothing here was written to JobTread. Prices are
    the catalog's, as JobTread would apply them when the template is added; quantities are the
    model's reading of the site visit and the rep owns every one of them. Kristen still reviews.</p>
    ${opts.footnote ? `<p class="fine">${esc(opts.footnote)}</p>` : ''}
    <p class="fine">Drafted with ${esc(d.model)}: ${d.usage.input.toLocaleString()} tokens in, ${d.usage.output.toLocaleString()} out${
      d.cost !== null ? `, $${d.cost.toFixed(2)}` : ''}. Generated by db-estimator. Contains pricing &mdash; keep it local.</p>
  </footer>
</main>
<script>
(function () {
  var b = document.getElementById('copy');
  if (!b) return;
  b.addEventListener('click', function () {
    var t = document.getElementById('steps').textContent;
    navigator.clipboard.writeText(t).then(function () {
      b.textContent = 'Copied';
      setTimeout(function () { b.textContent = 'Copy the steps'; }, 1500);
    });
  });
})();
</script>
</body>
</html>
`;
}

function planSection(p: TemplatePlan): string {
  const rows = p.kept.map((l) => lineRow(l)).join('\n');
  return `<section class="plan">
    <div class="bar">
      <h2>${p.role === 'primary' ? 'Main template' : 'Also add'}: ${esc(p.template.name)}</h2>
      <p class="tally">keep ${p.kept.length} &middot; delete ${p.removed.length}${p.structural ? ` &middot; leave ${p.structural}` : ''}</p>
    </div>
    <p class="detail">${esc(p.why)}</p>
    ${p.kept.length ? `<table class="lines">
      <thead><tr><th>Line</th><th>Qty</th><th>Unit price</th><th>Price</th><th>Basis</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>` : '<p class="detail">Nothing kept from this template.</p>'}
    ${p.removed.length ? `<details class="removed"><summary>Delete these ${p.removed.length} lines after adding the template</summary>
      <ul>${p.removed.map((l) => `<li>${esc([...groupPath(p.template, l.groupId), l.name].join(' › '))}</li>`).join('')}</ul>
    </details>` : ''}
  </section>`;
}

function lineRow(l: DraftLine): string {
  const ev = l.evidence.length
    ? `<details class="ev"><summary>evidence</summary><ul>${l.evidence
        .map((e) => `<li><span class="src">${esc(e.source)}</span> ${esc(e.quote)}</li>`).join('')}</ul></details>`
    : '';
  return `<tr class="conf-${l.confidence}">
    <td><div class="path">${esc(l.groupPath.join(' › '))}</div><div class="name">${esc(l.name)}</div>${
      l.option ? `<span class="tag">${esc(l.option)}</span>` : ''}${l.priced ? '' : '<span class="tag warn">no catalog price</span>'}</td>
    <td class="num">${esc(qty(l.quantity))}<div class="unit">${esc(l.unit ?? '')}</div></td>
    <td class="num">${money(l.unitPrice, l.priced)}<div class="unit">${l.priced ? `cost ${formatMoney(l.unitCost)}` : ''}</div></td>
    <td class="num">${money(l.price, l.priced)}</td>
    <td class="basis">${esc(l.basis)} <span class="conf">${CONFIDENCE_LABEL[l.confidence]}</span>${ev}</td>
  </tr>`;
}

const EXTRA_CSS = `
.options ul, .summary p { margin: 8px 0 0; }
.options h2, .summary h2, .scope h2, .steps h2 { margin-top: 30px; }
.options ul { padding-left: 20px; font-size: 14px; }
.summary p { font-size: 14.5px; }
.plan { margin-top: 30px; }
.plan .detail { margin: 6px 0 12px; }
table.lines { width: 100%; border-collapse: collapse; font-size: 13.5px; background: var(--card);
  border: 1px solid var(--line); border-radius: 7px; overflow: hidden; }
table.lines th { text-align: left; font-size: 11px; text-transform: uppercase; letter-spacing: .07em;
  color: var(--dim); padding: 8px 10px; border-bottom: 1px solid var(--line); }
table.lines td { padding: 8px 10px; border-bottom: 1px solid var(--line); vertical-align: top; }
table.lines tr:last-child td { border-bottom: none; }
table.lines td.num { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }
table.lines .path { font-size: 11px; color: var(--dim); }
table.lines .name { font-weight: 600; }
table.lines .unit { font-size: 11px; color: var(--dim); }
table.lines .basis { color: var(--dim); font-size: 12.5px; }
table.lines .conf { font-size: 10.5px; text-transform: uppercase; letter-spacing: .06em; margin-left: 4px; }
tr.conf-low .conf { color: var(--red); }
tr.conf-medium .conf { color: var(--amber); }
tr.conf-high .conf { color: var(--green); }
.tag { display: inline-block; margin-top: 4px; padding: 1px 7px; border-radius: 9px; font-size: 11px;
  background: var(--blue); color: #fff; }
.tag.warn { background: var(--amber); }
.ev { margin-top: 4px; }
.ev summary { cursor: pointer; font-size: 11.5px; }
.ev ul { margin: 4px 0 0; padding-left: 16px; font-size: 12px; }
.ev .src { color: var(--ink); font-weight: 600; }
.removed { margin-top: 10px; }
.removed summary { cursor: pointer; font-size: 12.5px; color: var(--dim); }
.removed ul { margin: 8px 0 0; padding-left: 20px; color: var(--dim); font-size: 12.5px; columns: 2; }
.count.amber { background: var(--amber); }
.scope blockquote { margin: 10px 0 0; padding: 12px 16px; border-left: 3px solid var(--blue);
  background: var(--card); border-radius: 0 7px 7px 0; font-size: 14px; }
.steps pre { margin: 10px 0 0; padding: 14px 16px; background: var(--card); border: 1px solid var(--line);
  border-radius: 7px; white-space: pre-wrap; font-size: 12.5px; line-height: 1.5; }
.steps #copy { font: inherit; font-size: 12.5px; font-weight: 600; padding: 6px 12px; border-radius: 6px;
  border: 1px solid var(--rec); background: var(--rec); color: var(--bg); cursor: pointer; }
@media (max-width: 560px) { .removed ul { columns: 1; } table.lines { font-size: 12.5px; } }
`;
