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

import { type Money, ZERO, add, formatMoney, formatPercent, toNumber } from '../money.ts';
import { marginOf } from '../domain.ts';
import { CSS } from '../report.ts';
import { STRUCTURAL_GROUPS, groupPath } from './templates.ts';
import type { JobEvidence } from './evidence.ts';
import { parseOption, type Draft, type DraftGap, type DraftLine, type GapProposals, type TemplatePlan, type Totals } from './draft.ts';
import { CONTINGENCY_FORMULA, CONTINGENCY_GROUP, CONTINGENCY_LINE, CONTINGENCY_PARAMETERS } from './contingency.ts';
import type { HistoryFinding } from './prompt.ts';

/** What the rep types into the Contingency Base parameter: plain dollars, no symbol or commas. */
function parameterDollars(m: Money): string {
  return toNumber(m).toFixed(2);
}

/** "$1,963.68 price ($1,080.00 cost)" or "$1,080.00 cost" when no margin priced it. */
function proposalMoney(p: GapProposals): string {
  return p.price === null ? `${formatMoney(p.cost)} cost` : `${formatMoney(p.price)} price (${formatMoney(p.cost)} cost)`;
}

const REGIONAL_NOTE = 'NOTE TO REP: an estimate for our area, not DB pricing; confirm with Carl or a sub bid before it goes out';

/** "Flooring — LVP" for one of several choices; the bare name for an add-on. */
function optionLabel(o: { group: string; name: string; required: boolean }): string {
  return o.required ? `${o.group} — ${o.name}` : o.name;
}

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
  out.push(
    `Base scope: ${totalsLine(d.totals.base)}` +
      (d.gaps.length
        ? ` — leaves out ${d.gaps.length} flagged item${d.gaps.length === 1 ? '' : 's'} with no template line (step ${gapStep(d)})`
        : ''),
  );
  if (d.contingency) {
    const c = d.contingency;
    out.push(
      `Contingency ${c.rate}% on ${formatMoney(c.base)} base cost = ${formatMoney(c.amount)}, at cost;` +
        ` with it the base scope is ${formatMoney(add(d.totals.base.price, c.amount))} price (step ${contingencyStepNumber(d)})`,
    );
    if (c.options.length) {
      out.push(`   Options add their own share: ${c.options.map((o) => `${optionLabel(o)} +${formatMoney(o.amount)}`).join(' · ')}`);
    }
  }
  if (d.totals.proposedForGaps.gaps > 0) {
    const pf = d.totals.proposedForGaps;
    out.push(
      `History proposes ${proposalMoney(pf)}` +
        ` for ${pf.gaps} of the flagged item${d.gaps.length === 1 ? '' : 's'} — a proposal for Carl, not in the totals above`,
    );
  }
  if (d.totals.regionalForGaps.gaps > 0) {
    const rf = d.totals.regionalForGaps;
    out.push(
      `Regional ballpark ${proposalMoney(rf)} for ${rf.gaps} of the flagged item${d.gaps.length === 1 ? '' : 's'}` +
        ` DB has no history for — ${REGIONAL_NOTE}; not in the totals above`,
    );
  }
  for (const o of d.totals.options) {
    if (o.required) {
      out.push(`Option "${o.group}", one choice required:`);
      for (const c of o.choices) out.push(`   ${c.name}: ${totalsLine(c.totals)}`);
    } else {
      out.push(`Add-on "${o.group}", customer may decline: ${totalsLine(o.choices[0]!.totals)}`);
    }
  }
  // One required choice is the common case (the floor); the customer's real number is base + that choice.
  const required = d.totals.options.filter((o) => o.required);
  if (required.length === 1 && d.contingency) {
    const c = d.contingency;
    const group = required[0]!;
    out.push(
      `With each choice (base + choice + contingency; add-ons not included): ` +
        group.choices.map((ch) => {
          const share = c.options.find((o) => o.required && o.group === group.group && o.name === ch.name);
          const price = add(add(d.totals.base.price, ch.totals.price), add(c.amount, share?.amount ?? ZERO));
          return `${group.group} — ${ch.name} ${formatMoney(price)}`;
        }).join(' · '),
    );
  }
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
          (l.tracking ? ' [time tracking, $0]' : l.priced ? '' : ' [no catalog price — type it]') +
          ` — ${l.basis} (${CONFIDENCE_LABEL[l.confidence]})`);
        if (l.history) out.push(`       history: ${historyLineText(l)}`);
      }
    }
    if (p.removed.length) {
      out.push(`   Delete: ${p.removed.map((l) => l.name).join('; ')}`);
    }
  }
  if (d.contingency) {
    step++;
    const c = d.contingency;
    out.push(`${step}. Contingency at ${c.rate}%${c.why ? `: ${c.why}` : '.'}`);
    if (c.line) {
      out.push(
        `   Keep ${[...c.line.group, CONTINGENCY_LINE].join(' › ')} from "${c.line.templateName}".` +
          ` Set the job parameters ${CONTINGENCY_PARAMETERS.rate} = ${c.rate} and ${CONTINGENCY_PARAMETERS.base} = ${parameterDollars(c.base)}` +
          ` (the budget's cost total before this line): the line comes to ${formatMoney(c.amount)}, at cost.`,
      );
    } else {
      out.push(
        `   No chosen template carries the contingency group yet. Add a group "${CONTINGENCY_GROUP}" at the end of the scope` +
          ` (after Phase 4 where the template has one) and put the catalog item` +
          ` "${CONTINGENCY_LINE}" in it (1 Lump Sum at $1.00 cost and $1.00 price) with the quantity formula ${CONTINGENCY_FORMULA};` +
          ` then set the job parameters ${CONTINGENCY_PARAMETERS.rate} = ${c.rate} and ${CONTINGENCY_PARAMETERS.base} = ${parameterDollars(c.base)}:` +
          ` ${formatMoney(c.amount)}, at cost.`,
      );
    }
    if (c.options.length) {
      out.push(
        `   Add the cost of each option the customer takes to ${CONTINGENCY_PARAMETERS.base}: ` +
          c.options.map((o) => `${optionLabel(o)} ${parameterDollars(o.cost)} (+${formatMoney(o.amount)} contingency)`).join('; ') + '.',
      );
    }
    out.push('   Unused contingency is credited at closeout.');
  }
  if (d.totals.options.length) {
    step++;
    out.push(`${step}. Selection groups, so the customer picks on the estimate:`);
    for (const o of d.totals.options) {
      const linesOf = (choice: string): string =>
        d.lines
          .filter((l) => l.option !== null && parseOption(l.option).group === o.group &&
            (parseOption(l.option).choice ?? o.group) === choice)
          .map((l) => l.name)
          .join('; ');
      if (o.required) {
        out.push(`   - "${o.group}", one choice required: ${o.choices.map((c) => `${c.name}: ${linesOf(c.name)}`).join(' · ')}`);
      } else {
        out.push(`   - "${o.group}", optional add-on (may pick none): ${linesOf(o.choices[0]!.name)}`);
      }
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
      if (g.history) out.push(`     history: ${historyGapText(g)}`);
    }
  }
  if (d.questions.length) {
    step++;
    out.push(`${step}. Confirm before it goes out:`);
    for (const q of d.questions) out.push(`   - ${q.question} — ${q.why}`);
  }
  const subbed = d.lines.filter((l) => l.costTypeName === 'Labor' && l.history?.typicallySubbed === true);
  if (subbed.length) {
    out.push('');
    out.push('History says DB usually subcontracts this work, drafted here as crew labor:');
    for (const l of subbed) {
      out.push(`   - ${l.name}: ${l.history!.summary}${l.history!.usualVendor ? ` Usual sub: ${l.history!.usualVendor}.` : ''}`);
    }
  }
  if (d.history?.learned) {
    out.push('');
    out.push(`${d.history.learned} item${d.history.learned === 1 ? '' : 's'} answered from the learned price book without a search.`);
  }
  if (d.history?.skipped) {
    out.push('');
    out.push(`Past work was searched for ${d.history.terms.map((t) => `"${t}"`).join(', ')}: ${d.history.skipped}.`);
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

function originNote(h: { origin: { kind: string; learnedAt?: string; fromJob?: string; expiresAt?: string; unitMismatch?: string | null } }): string {
  const o = h.origin;
  if (o.kind !== 'learned') return '';
  return ` Learned ${(o.learnedAt ?? '').slice(0, 10)} on ${o.fromJob}; not searched again until ${(o.expiresAt ?? '').slice(0, 10)}.` +
    (o.unitMismatch ? ` (${o.unitMismatch})` : '');
}

function historyLineText(l: DraftLine): string {
  const h = l.history!;
  let out = h.summary;
  if (l.historyUnitCost !== null) {
    if (l.priced && l.historyUnitCost === l.unitCost) {
      out += ` History agrees with the template's ${formatMoney(l.unitCost)}/${l.unit ?? 'unit'}. ${h.suggestionBasis}`;
    } else {
      out += ` History says ${formatMoney(l.historyUnitCost)}/${l.unit ?? 'unit'} cost` +
        (l.historyUnitPrice !== null ? ` (${formatMoney(l.historyUnitPrice)} price)` : '') +
        (l.priced ? ` against the template's ${formatMoney(l.unitCost)}` : '') +
        `. ${h.suggestionBasis}`;
    }
  } else if (h.match !== 'none') {
    out += ` ${h.suggestionBasis}`;
  }
  return `${out}${originNote(h)} (${h.match}, ${CONFIDENCE_LABEL[h.confidence]})`;
}

function historyGapText(g: DraftGap): string {
  const h = g.history!;
  let out = h.summary;
  if (g.proposed?.source === 'history') {
    out += ` Proposed from history: ${formatMoney(g.proposed.unitCost)}/${g.unit} × ${qty(g.quantity!)} = ${formatMoney(g.proposed.cost)} cost` +
      (g.proposed.price !== null ? `, ${formatMoney(g.proposed.price)} price` : '') +
      ` — Carl confirms. ${h.suggestionBasis}`;
  } else if (g.regionalUnitCost !== null) {
    out += ` Regional ballpark: ${formatMoney(g.regionalUnitCost)}/${g.unit} cost` +
      (g.regionalUnitPrice !== null ? ` (${formatMoney(g.regionalUnitPrice)} price)` : '') +
      (g.proposed
        ? ` × ${qty(g.quantity!)} = ${formatMoney(g.proposed.cost)} cost${g.proposed.price !== null ? `, ${formatMoney(g.proposed.price)} price` : ''}`
        : ', quantity still to be confirmed') +
      ` — ${REGIONAL_NOTE}. ${h.regionalBasis}`;
  } else if (h.match !== 'none') {
    out += ` ${h.suggestionBasis}`;
  }
  return `${out}${originNote(h)} (${h.match}, ${CONFIDENCE_LABEL[h.confidence]})`;
}

function pastWorkRows(h: HistoryFinding): string {
  return h.pastWork
    .map((w) => `<tr><td>${esc(w.jobName)}</td><td>${esc(w.what)} · ${w.quantity !== null ? `${esc(qty(w.quantity))} ${esc(w.unit ?? '')}` : ''}${
      w.unitCost !== null ? ` · $${w.unitCost.toFixed(2)}/${esc(w.unit ?? 'unit')}` : ''}${
      w.lineCost !== null ? ` · $${w.lineCost.toFixed(2)}` : ''} · ${esc(w.where)}${w.vendor ? ` from ${esc(w.vendor)}` : ''} · ${esc(w.when)}</td></tr>`)
    .join('');
}

/** The contingency step comes right after the templates. */
function contingencyStepNumber(d: Draft): number {
  return d.plans.length + 1;
}

/** The number the "Not in any template" step gets, so the header can point at it. */
function gapStep(d: Draft): number {
  let step = d.plans.length;
  if (d.contingency) step++;
  if (d.totals.options.length) step++;
  if (d.scopeOfWork) step++;
  return step + 1;
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
      tracking: l.tracking,
      option: l.option,
      basis: l.basis,
      confidence: l.confidence,
      evidence: l.evidence,
      lookBack: l.lookBack,
      history: l.history
        ? {
            ...l.history,
            unitCost: l.historyUnitCost === null ? null : formatMoney(l.historyUnitCost),
            unitPrice: l.historyUnitPrice === null ? null : formatMoney(l.historyUnitPrice),
          }
        : null,
    })),
    gaps: d.gaps.map((g) => ({
      ...g,
      regionalUnitCost: g.regionalUnitCost === null ? null : formatMoney(g.regionalUnitCost),
      regionalUnitPrice: g.regionalUnitPrice === null ? null : formatMoney(g.regionalUnitPrice),
      proposed: g.proposed
        ? {
            source: g.proposed.source,
            unitCost: formatMoney(g.proposed.unitCost),
            unitPrice: g.proposed.unitPrice === null ? null : formatMoney(g.proposed.unitPrice),
            cost: formatMoney(g.proposed.cost),
            price: g.proposed.price === null ? null : formatMoney(g.proposed.price),
          }
        : null,
    })),
    contingency: d.contingency
      ? {
          rate: d.contingency.rate,
          why: d.contingency.why,
          base: formatMoney(d.contingency.base),
          amount: formatMoney(d.contingency.amount),
          options: d.contingency.options.map((o) => ({
            option: optionLabel(o), required: o.required, cost: formatMoney(o.cost), amount: formatMoney(o.amount),
          })),
          parameters: { [CONTINGENCY_PARAMETERS.rate]: d.contingency.rate, [CONTINGENCY_PARAMETERS.base]: Number(parameterDollars(d.contingency.base)) },
          line: d.contingency.line,
        }
      : null,
    history: d.history
      ? { terms: d.history.terms, findings: d.history.findings, learned: d.history.learned, regional: d.history.regional, skipped: d.history.skipped, searched: d.history.report.terms.map((t) => ({ term: t.term, matching: t.raw, jobs: t.jobs.map((j) => j.jobName), files: t.jobs.flatMap((j) => j.files.filter((f) => !f.skipped).map((f) => f.name)) })) }
      : null,
    questions: d.questions,
    rejected: d.rejected,
    rejectedPicks: d.rejectedPicks,
    totals: {
      base: t(d.totals.base),
      options: d.totals.options.map((o) => ({
        group: o.group,
        required: o.required,
        choices: o.choices.map((c) => ({ name: c.name, ...(t(c.totals) as object) })),
      })),
      all: t(d.totals.all),
      proposedForGaps: {
        cost: formatMoney(d.totals.proposedForGaps.cost),
        price: d.totals.proposedForGaps.price === null ? null : formatMoney(d.totals.proposedForGaps.price),
        gaps: d.totals.proposedForGaps.gaps,
      },
      regionalForGaps: {
        cost: formatMoney(d.totals.regionalForGaps.cost),
        price: d.totals.regionalForGaps.price === null ? null : formatMoney(d.totals.regionalForGaps.price),
        gaps: d.totals.regionalForGaps.gaps,
      },
    },
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
      }</span></div>${d.contingency ? `
      <div class="fig"><span class="k">+ ${d.contingency.rate}% contingency</span><span class="v">${formatMoney(add(d.totals.base.price, d.contingency.amount))}</span></div>` : ''}
    </div>
  </header>

  ${d.noFit
    ? `<p class="verdict">No budget template fits this job. ${esc(d.noFit)} Take it to Carl.</p>`
    : `<p class="verdict ${flagged ? '' : 'ok'}">${
        flagged
          ? `${flagged} item${flagged === 1 ? '' : 's'} flagged for Carl`
          : 'Every line comes from a budget template.'
      }${d.gaps.length ? ` &middot; the base price leaves ${d.gaps.length === 1 ? 'it' : 'them'} out` : ''}${
        d.totals.proposedForGaps.gaps ? ` &middot; history proposes ${d.totals.proposedForGaps.price === null ? formatMoney(d.totals.proposedForGaps.cost) + ' cost' : formatMoney(d.totals.proposedForGaps.price)} for ${d.totals.proposedForGaps.gaps === d.gaps.length ? 'them' : `${d.totals.proposedForGaps.gaps} of them`}` : ''}${
        d.totals.regionalForGaps.gaps ? ` &middot; a regional ballpark of ${d.totals.regionalForGaps.price === null ? formatMoney(d.totals.regionalForGaps.cost) + ' cost' : formatMoney(d.totals.regionalForGaps.price)} for ${d.totals.regionalForGaps.gaps === d.gaps.length ? 'them' : `${d.totals.regionalForGaps.gaps} of them`}, not DB pricing` : ''}${d.questions.length ? ` &middot; ${d.questions.length} question${d.questions.length === 1 ? '' : 's'} for the customer` : ''}${
        d.totals.base.unpriced ? ` &middot; ${d.totals.base.unpriced} line${d.totals.base.unpriced === 1 ? '' : 's'} to price by hand` : ''
      }</p>`}

  ${d.totals.options.length ? `<section class="options">
    <h2>Options the customer picks</h2>
    <ul>${d.totals.options.map((o) => o.required
      ? `<li><strong>${esc(o.group)}</strong>, one choice required:<ul>${o.choices.map((c) => `<li>${esc(c.name)} &mdash; ${esc(totalsLine(c.totals))}</li>`).join('')}</ul></li>`
      : `<li><strong>${esc(o.group)}</strong>, optional add-on &mdash; ${esc(totalsLine(o.choices[0]!.totals))}</li>`).join('')}</ul>
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
      <div class="chip">${g.proposed?.source === 'history' ? 'Flagged · priced from history' : g.regionalUnitCost !== null ? 'Flagged · regional ballpark, not DB pricing' : 'Flagged'}</div>
      <h3>${esc(g.scope)}</h3>
      <p class="detail">${esc(g.why)}</p>
      <table class="math">
        <tr><td>cost type</td><td>${esc(g.costType)}</td></tr>
        <tr><td>quantity</td><td>${g.quantity !== null ? `${esc(qty(g.quantity))} ${esc(g.unit)}` : esc(g.unit)}</td></tr>
        <tr><td>basis</td><td>${esc(g.basis)}</td></tr>
        ${g.evidence.map((ev) => `<tr><td>${esc(ev.source)}</td><td>${esc(ev.quote)}</td></tr>`).join('')}
        ${g.history ? `<tr class="em"><td>history</td><td>${esc(historyGapText(g))}</td></tr>${pastWorkRows(g.history)}` : ''}
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

  ${(() => {
    const subbed = d.lines.filter((l) => l.costTypeName === 'Labor' && l.history?.typicallySubbed === true);
    if (!subbed.length && !d.history) return '';
    return `<section class="findings">
    <div class="bar"><h2>What history says</h2>${d.history ? `<p class="tally">${d.history.terms.length ? `searched ${d.history.terms.map((t) => `"${esc(t)}"`).join(', ')}` : 'nothing searched'}${d.history.learned ? ` &middot; ${d.history.learned} from the learned price book` : ''}</p>` : ''}</div>
    ${d.history?.skipped ? `<p class="detail">${esc(d.history.skipped)}.</p>` : ''}
    ${subbed.map((l) => `<article class="card sev-info"><div class="chip">Usually subcontracted</div><h3>${esc(l.name)}</h3><p class="detail">${esc(l.history!.summary)}${l.history!.usualVendor ? ` Usual sub: ${esc(l.history!.usualVendor)}.` : ''} Drafted here as crew labor.</p></article>`).join('\n')}
  </section>`;
  })()}

  ${d.contingency ? `<section class="scope">
    <h2>Contingency, ${d.contingency.rate}%</h2>
    <p class="detail">${esc(d.contingency.why || 'DB carries a visible contingency on every construction budget.')}
      ${formatMoney(d.contingency.base)} base cost &times; ${d.contingency.rate}% = <strong>${formatMoney(d.contingency.amount)}</strong>, at cost. Unused contingency is credited at closeout.</p>
    <table class="math">
      <tr><td>line</td><td>${d.contingency.line
        ? `${esc([...d.contingency.line.group, CONTINGENCY_LINE].join(' › '))} in ${esc(d.contingency.line.templateName)}`
        : `not in the chosen templates yet: add "${esc(CONTINGENCY_GROUP)}" after Phase 4 with the catalog item "${esc(CONTINGENCY_LINE)}" and the quantity formula <code>${esc(CONTINGENCY_FORMULA)}</code>`}</td></tr>
      <tr><td>${esc(CONTINGENCY_PARAMETERS.rate)}</td><td>${d.contingency.rate}</td></tr>
      <tr><td>${esc(CONTINGENCY_PARAMETERS.base)}</td><td>${esc(parameterDollars(d.contingency.base))}${d.contingency.options.length ? ', plus the cost of each option taken' : ''}</td></tr>
      ${d.contingency.options.map((o) => `<tr><td>${esc(optionLabel(o))}</td><td>${esc(parameterDollars(o.cost))} more base, +${formatMoney(o.amount)} contingency</td></tr>`).join('\n      ')}
    </table>
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
      l.option ? `<span class="tag">${esc(l.option)}</span>` : ''}${
      l.tracking ? '<span class="tag dim">time tracking, $0</span>' : l.priced ? '' : '<span class="tag warn">no catalog price</span>'}</td>
    <td class="num">${esc(qty(l.quantity))}<div class="unit">${esc(l.unit ?? '')}</div></td>
    <td class="num">${money(l.unitPrice, l.priced)}<div class="unit">${l.priced ? `cost ${formatMoney(l.unitCost)}` : ''}</div></td>
    <td class="num">${money(l.price, l.priced)}</td>
    <td class="basis">${esc(l.basis)} <span class="conf">${CONFIDENCE_LABEL[l.confidence]}</span>${ev}${
      l.history ? `<div class="hist"><span class="k">History</span> ${esc(historyLineText(l))}${
        l.history.pastWork.length ? `<details class="ev"><summary>past work</summary><table class="math">${pastWorkRows(l.history)}</table></details>` : ''}</div>` : ''}</td>
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
.tag.dim { background: var(--dim); }
.hist { margin-top: 6px; padding-top: 6px; border-top: 1px dashed var(--line); font-size: 12.5px; }
.hist .k { font-weight: 700; color: var(--ink); text-transform: uppercase; font-size: 10.5px; letter-spacing: .06em; margin-right: 4px; }
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
