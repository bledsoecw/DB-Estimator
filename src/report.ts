/**
 * The approver screen, rendered as one self-contained HTML file.
 *
 * This is what Kristen looks at instead of the raw estimate. It is a REPORT,
 * not an app: no server, no network, no writes. Recording a decision here
 * changes nothing in JobTread — the file says so, in the footer and again next
 * to the decision buttons, because a screen that looks like a workflow and
 * isn't one is worse than no screen.
 *
 * Self-contained on purpose. It opens from a file:// path on a Windows laptop
 * with no toolchain, and it can be attached to an email. That rules out a CDN
 * for fonts, CSS or script — everything is inline.
 *
 * It is NOT published anywhere. The rendered file carries real customer names
 * and real pricing; it belongs on Carl's machine and in nobody's cloud. The
 * CLI writes it to a path you name, and .gitignore keeps *.html out of git.
 */

import { ZERO, formatMoney, formatPercent } from './money.ts';
import { marginOf } from './domain.ts';
import { marginBand } from './rules/comparables.ts';
import { STORE_SCRIPT, findingKey } from './verdict-store.ts';
import type { AuditInput } from './domain.ts';
import type { AuditResult, Finding, Severity } from './rules/types.ts';

const SEVERITY: Record<Severity, { label: string; cls: string }> = {
  pricing: { label: 'Pricing', cls: 'sev-pricing' },
  data: { label: 'Data', cls: 'sev-data' },
  display: { label: 'Customer view', cls: 'sev-display' },
  info: { label: 'Context', cls: 'sev-info' },
};

/** Scope findings come from the model review, not a rule; they get their own chip. */
function chipFor(f: Finding): { label: string; cls: string } {
  return f.rule.startsWith('scope.') ? { label: 'Scope', cls: 'sev-scope' } : SEVERITY[f.severity];
}

/**
 * Escape a string for a JS string literal inside <script>.
 *
 * Not the same job as esc(). Inside a script block the browser does no entity
 * decoding, so HTML-escaping here does not protect anything — it just corrupts
 * the text, and a job called "Smith & Deck" would reach Kristen's copied notes
 * as "Smith &amp; Deck". JSON.stringify gives a correct, complete literal;
 * escaping < and > on top of it is what stops a name containing "</script>"
 * from closing the block early.
 */
function jsString(s: string): string {
  return JSON.stringify(s)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');
}

/** Escape for HTML text and quoted attributes. Job names contain & and /. */
function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export interface ReportOptions {
  /** Where "All estimates" goes, when this page is one of a run. */
  backHref?: string;
  /** The next estimate in the run, so a reviewer can go page to page. */
  nextHref?: string;
  nextLabel?: string;
  /** One line for the footer: what else went into this page, e.g. the scope review's cost. */
  footnote?: string;
}

export function renderReport(
  input: AuditInput,
  result: AuditResult,
  opts: ReportOptions = {},
): string {
  const { estimate } = input;
  const margin = marginOf(estimate.statedPrice, estimate.statedCost);
  const band = marginBand(input.comparables);

  const needsHuman = result.findings.filter((f) => f.severity !== 'info');
  const context = result.findings.filter((f) => f.severity === 'info');

  const title = `${estimate.jobName} — estimate review`;

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<style>${CSS}</style>
</head>
<body>
<main>
${
  opts.backHref
    ? `
  <nav class="crumbs no-print">
    <a href="${esc(opts.backHref)}">&larr; All estimates</a>
    ${
      opts.nextHref
        ? `<a href="${esc(opts.nextHref)}">Next: ${esc(opts.nextLabel ?? 'estimate')} &rarr;</a>`
        : ''
    }
  </nav>`
    : ''
}

  <header class="head">
    <div class="job">
      <h1>${esc(estimate.jobName)}</h1>
      <p class="meta">${esc(estimate.name)} &middot; ${esc(estimate.status)} &middot;
        ${estimate.lines.length} lines in ${estimate.groups.length} groups
        &middot; <code>${esc(estimate.id)}</code></p>
    </div>
    <div class="totals">
      <div class="fig"><span class="k">Price</span><span class="v">${formatMoney(estimate.statedPrice)}</span></div>
      <div class="fig"><span class="k">Cost</span><span class="v">${formatMoney(estimate.statedCost)}</span></div>
      <div class="fig"><span class="k">Margin</span><span class="v">${formatPercent(margin)}</span>${
        band
          ? `<span class="band">band ${formatPercent(band.lo)}–${formatPercent(band.hi)}, n=${band.n}</span>`
          : ''
      }</div>
    </div>
  </header>

  ${
    result.totalUnderpriced > ZERO
      ? `<p class="verdict">Under policy by <strong>${formatMoney(result.totalUnderpriced)}</strong></p>`
      : `<p class="verdict ok">Priced at or above policy on every line.</p>`
  }

  ${
    needsHuman.length === 0
      ? `<p class="clean">Nothing needs you.</p>`
      : `<section class="findings">
    <div class="bar">
      <h2>Needs you <span class="count">${needsHuman.length}</span></h2>
      <p class="tally" id="tally">0 of ${needsHuman.length} decided &middot; 0 of ${needsHuman.length} judged</p>
    </div>
    ${needsHuman.map((f) => card(f, estimate.id)).join('\n')}
  </section>`
  }

  ${
    context.length > 0
      ? `<section class="findings context">
    <h2>Worth knowing</h2>
    ${context.map((f) => card(f, estimate.id)).join('\n')}
  </section>`
      : ''
  }

  ${
    result.passed.length > 0
      ? `<section class="passed">
    <details>
      <summary>Checked and clean &mdash; ${result.passed.length}</summary>
      <ul>${result.passed.map((p) => `<li>${esc(p.message)}</li>`).join('')}</ul>
    </details>
  </section>`
      : ''
  }

  ${
    result.notes.length > 0
      ? `<section class="notes">
    <h2>Not raised</h2>
    <ul>${result.notes.map((n) => `<li>${esc(n.message)}</li>`).join('')}</ul>
  </section>`
      : ''
  }

  ${needsHuman.length > 0 ? `<div class="actions-bar no-print">
    <button type="button" id="copy">Copy the notes</button>
    <span class="hint">Paste into JobTread or an email to the rep.</span>
  </div>` : ''}

  <footer>
    <p><strong>Read-only.</strong> Nothing was written to JobTread, and nothing on this
    page writes to it. Choosing an option here records what you decided so you can copy
    it out &mdash; it does not reprice anything, and it does not release the estimate.</p>
    ${opts.footnote ? `<p class="fine">${esc(opts.footnote)}</p>` : ''}
    <p class="fine">Estimate read ${esc(input.capturedAt)}. Report generated by
    db-estimator v0.5. Contains customer pricing &mdash; keep it local.</p>
  </footer>

</main>
<script>${STORE_SCRIPT}${SCRIPT(estimate.jobName, estimate.id)}</script>
</body>
</html>
`;
}

function card(f: Finding, documentId: string): string {
  const sev = chipFor(f);
  const impact =
    f.impact !== undefined && f.impact !== ZERO
      ? `<p class="impact">${f.impact > ZERO ? '&minus;' : '+'}${formatMoney(
          f.impact < ZERO ? (-f.impact as typeof f.impact) : f.impact,
        )}</p>`
      : '';

  const math = f.math?.length
    ? `<table class="math">${f.math
        .map(
          (m) =>
            `<tr${m.emphasis ? ' class="em"' : ''}><td>${esc(m.label)}</td><td>${esc(
              m.value,
            )}</td></tr>`,
        )
        .join('')}</table>`
    : '';

  const actions = f.actions?.length
    ? `<div class="choices" role="group" aria-label="What to do">${f.actions
        .map(
          (a, i) =>
            `<button type="button" class="choice${i === 0 ? ' rec' : ''}" data-choice="${esc(
              a,
            )}">${esc(a)}</button>`,
        )
        .join('')}</div>`
    : '';

  // The judgement the shadow run is scored on. Asked here, where the evidence
  // is, and again on the index; both write to the same store.
  const judge =
    f.severity === 'info'
      ? ''
      : `<div class="judge" role="group" aria-label="Is this finding real?">
        <span>Is this finding real?</span>
        <button type="button" data-v="real">Real</button>
        <button type="button" data-v="false">Not real</button>
      </div>`;

  return `    <article class="card ${sev.cls}" data-key="${esc(findingKey(documentId, f))}"
      data-title="${esc(f.title)}"
      data-impact="${impactLabel(f)}"
      data-needs="${f.severity === 'info' ? '0' : '1'}">
      <div class="chip">${sev.label}</div>
      <h3>${esc(f.title)}</h3>
      <p class="detail">${esc(f.detail)}</p>
      ${impact}
      ${math}
      ${actions}
      ${judge}
    </article>`;
}

/**
 * The impact as it reads in a note to the rep.
 *
 * "($1,934.63)" beside a line name says nothing about direction. The rep needs
 * to know it is short, and by how much.
 */
function impactLabel(f: Finding): string {
  if (f.impact === undefined || f.impact === ZERO) return '';
  const under = f.impact > ZERO;
  const magnitude = under ? f.impact : (-f.impact as typeof f.impact);
  return esc(`${under ? 'short' : 'over'} ${formatMoney(magnitude)}`);
}

export const CSS = `
:root {
  --bg: #fbfaf8; --card: #ffffff; --ink: #1a1a1a; --dim: #6b6b6b;
  --line: #e4e1dc; --red: #b3261e; --amber: #8a6100; --blue: #1a5f8a;
  --green: #1f6b3a; --purple: #5b3d8f; --rec: #1a1a1a;
}
@media (prefers-color-scheme: dark) {
  :root:not([data-theme="light"]) {
    --bg: #17171a; --card: #202024; --ink: #ececec; --dim: #9a9a9a;
    --line: #34343a; --red: #f2857c; --amber: #e0b055; --blue: #7ab8dd;
    --green: #77c894; --purple: #b9a3e3; --rec: #ececec;
  }
}
* { box-sizing: border-box; }
body {
  margin: 0; background: var(--bg); color: var(--ink);
  font: 15px/1.55 -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
  -webkit-font-smoothing: antialiased;
}
main { max-width: 760px; margin: 0 auto; padding: 40px 16px 64px; }
code { font-family: ui-monospace, "Cascadia Mono", Consolas, monospace; font-size: .9em; }

.head { display: flex; flex-wrap: wrap; gap: 20px; justify-content: space-between;
  align-items: flex-start; padding-bottom: 20px; border-bottom: 1px solid var(--line); }
.head h1 { margin: 0 0 4px; font-size: 22px; line-height: 1.25; letter-spacing: -.01em; }
.meta { margin: 0; color: var(--dim); font-size: 13px; }
.totals { display: flex; gap: 22px; }
.fig { display: flex; flex-direction: column; }
.fig .k { font-size: 11px; text-transform: uppercase; letter-spacing: .07em; color: var(--dim); }
.fig .v { font-size: 19px; font-variant-numeric: tabular-nums; font-weight: 600; }
.fig .band { font-size: 11px; color: var(--dim); }

.verdict { margin: 22px 0 0; font-size: 17px; color: var(--red); }
.verdict strong { font-variant-numeric: tabular-nums; }
.verdict.ok { color: var(--green); }
.clean { margin: 28px 0; font-size: 17px; color: var(--green); }

.bar { display: flex; align-items: baseline; justify-content: space-between; gap: 12px;
  margin: 34px 0 14px; }
h2 { margin: 0; font-size: 12px; text-transform: uppercase; letter-spacing: .09em; color: var(--dim); }
.count { display: inline-block; margin-left: 6px; padding: 1px 7px; border-radius: 9px;
  background: var(--red); color: #fff; font-size: 11px; letter-spacing: 0; }
.tally { margin: 0; font-size: 12px; color: var(--dim); font-variant-numeric: tabular-nums; }
.context h2 { margin: 34px 0 14px; }

.card { position: relative; background: var(--card); border: 1px solid var(--line);
  border-left: 3px solid var(--dim); border-radius: 7px; padding: 16px 18px; margin-bottom: 12px; }
.card.sev-pricing { border-left-color: var(--red); }
.card.sev-data, .card.sev-display { border-left-color: var(--amber); }
.card.sev-info { border-left-color: var(--blue); }
.card.sev-scope { border-left-color: var(--purple); }
.card.done { opacity: .58; }
.chip { font-size: 10px; text-transform: uppercase; letter-spacing: .09em; font-weight: 700; color: var(--dim); }
.card.sev-pricing .chip { color: var(--red); }
.card.sev-data .chip, .card.sev-display .chip { color: var(--amber); }
.card.sev-info .chip { color: var(--blue); }
.card.sev-scope .chip { color: var(--purple); }
.card h3 { margin: 3px 0 6px; font-size: 16px; line-height: 1.3; }
.detail { margin: 0; color: var(--dim); font-size: 13.5px; }
.impact { margin: 10px 0 0; font-size: 20px; font-weight: 600; color: var(--red);
  font-variant-numeric: tabular-nums; }

.math { margin: 12px 0 0; border-collapse: collapse; font-size: 13px; }
.math td { padding: 2px 0; color: var(--dim); }
.math td:first-child { padding-right: 18px; }
.math td:last-child { font-variant-numeric: tabular-nums; text-align: right; }
.math tr.em td { color: var(--ink); font-weight: 600; border-top: 1px solid var(--line); padding-top: 4px; }

.choices { display: flex; flex-wrap: wrap; gap: 7px; margin-top: 14px; }
.choice { font: inherit; font-size: 12.5px; padding: 5px 11px; border-radius: 5px;
  border: 1px solid var(--line); background: transparent; color: var(--dim); cursor: pointer; }
.choice:hover { border-color: var(--dim); color: var(--ink); }
.choice.rec { border-color: var(--rec); color: var(--ink); font-weight: 600; }
.choice.picked { background: var(--rec); border-color: var(--rec); color: var(--bg); font-weight: 600; }

.passed { margin-top: 30px; }
.passed summary { cursor: pointer; font-size: 12px; text-transform: uppercase;
  letter-spacing: .09em; color: var(--dim); }
.passed ul { margin: 10px 0 0; padding-left: 20px; color: var(--dim); font-size: 13.5px; }
.passed li { margin: 3px 0; }

.notes { margin-top: 26px; }
.notes h2 { margin-bottom: 8px; }
.notes ul { margin: 0; padding-left: 20px; color: var(--dim); font-size: 13px; }
.notes li { margin: 3px 0; }

.actions-bar { display: flex; align-items: center; gap: 12px; margin-top: 28px; }
#copy { font: inherit; font-size: 13px; font-weight: 600; padding: 8px 16px; border-radius: 6px;
  border: 1px solid var(--rec); background: var(--rec); color: var(--bg); cursor: pointer; }
.hint { font-size: 12px; color: var(--dim); }

.crumbs { display: flex; justify-content: space-between; gap: 12px; flex-wrap: wrap;
  margin: 0 0 18px; font-size: 13px; }
.crumbs a { color: var(--dim); text-decoration: none; border-bottom: 1px solid var(--line); }
.crumbs a:hover { color: var(--ink); border-bottom-color: var(--ink); }

.judge { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; margin-top: 14px;
  padding-top: 12px; border-top: 1px dashed var(--line); font-size: 12.5px; color: var(--dim); }
.judge button { font: inherit; font-size: 12px; padding: 3px 10px; border-radius: 5px;
  border: 1px solid var(--line); background: transparent; color: var(--dim); cursor: pointer; }
.judge button:hover { border-color: var(--dim); color: var(--ink); }
.judge button.on-real { background: var(--green); border-color: var(--green); color: var(--bg); font-weight: 600; }
.judge button.on-false { background: var(--red); border-color: var(--red); color: var(--bg); font-weight: 600; }

footer { margin-top: 40px; padding-top: 18px; border-top: 1px solid var(--line);
  color: var(--dim); font-size: 12.5px; }
footer p { margin: 0 0 6px; }
footer .fine { font-size: 11.5px; }

@media print {
  .no-print { display: none; }
  body { background: #fff; }
  .card { break-inside: avoid; border-left-width: 3px; }
  .passed details { display: block; }
  .passed details > ul { display: block; }
}
@media (max-width: 560px) {
  .totals { gap: 16px; }
  .fig .v { font-size: 17px; }
}
`;

const SCRIPT = (jobNameRaw: string, docIdRaw: string) => `
(function () {
  var cards = document.querySelectorAll('.card');
  var needed = document.querySelectorAll('.card[data-needs="1"]').length;
  var tallyEl = document.getElementById('tally');

  // Painted from the store, never from what was clicked, so a mark made on
  // the index shows here and one made here shows on the index.
  function paint() {
    var picks = DBE.load('choices');
    var verdicts = DBE.load('verdicts');
    var decided = 0, judged = 0;
    cards.forEach(function (c) {
      var key = c.getAttribute('data-key');
      var pick = picks[key], verdict = verdicts[key];
      c.querySelectorAll('.choice').forEach(function (o) {
        o.classList.toggle('picked', !!pick && o.getAttribute('data-choice') === pick);
      });
      c.querySelectorAll('.judge button').forEach(function (o) {
        var mine = o.getAttribute('data-v');
        o.classList.toggle('on-real', verdict === 'real' && mine === 'real');
        o.classList.toggle('on-false', verdict === 'false' && mine === 'false');
      });
      c.classList.toggle('done', !!pick);
      if (c.getAttribute('data-needs') === '1') {
        if (pick) decided++;
        if (verdict) judged++;
      }
    });
    if (tallyEl) {
      tallyEl.textContent = decided + ' of ' + needed + ' decided \\u00b7 ' +
        judged + ' of ' + needed + ' judged';
    }
  }

  document.addEventListener('click', function (e) {
    if (!e.target.closest) return;
    var choice = e.target.closest('.choice');
    var judge = e.target.closest('.judge button');
    if (!choice && !judge) return;
    var key = (choice || judge).closest('.card').getAttribute('data-key');
    if (choice) {
      var want = choice.getAttribute('data-choice');
      DBE.set('choices', key, DBE.load('choices')[key] === want ? null : want);
    } else {
      var v = judge.getAttribute('data-v');
      DBE.set('verdicts', key, DBE.load('verdicts')[key] === v ? null : v);
    }
    paint();
  });
  // Back from the index, or a mark made there in another tab: re-read the
  // store rather than trust what this page last painted.
  window.addEventListener('pageshow', paint);
  window.addEventListener('storage', paint);
  paint();

  function notes() {
    var picks = DBE.load('choices');
    var out = ${jsString(jobNameRaw)} + ' \\u2014 estimate review\\n';
    out += 'Document ' + ${jsString(docIdRaw)} + ' \\u00b7 reviewed ' +
      new Date().toLocaleDateString() + '\\n\\n';
    var undecided = 0;
    cards.forEach(function (c) {
      var pick = picks[c.getAttribute('data-key')];
      if (!pick) { if (c.getAttribute('data-needs') === '1') undecided++; return; }
      var imp = c.getAttribute('data-impact');
      out += c.getAttribute('data-title') + (imp ? '  (' + imp + ')' : '') + '\\n';
      out += '    \\u2192 ' + pick + '\\n\\n';
    });
    if (undecided) out += 'Still undecided: ' + undecided + '\\n\\n';
    out += 'Reviewed against policy by db-estimator v0.5. Nothing was written to JobTread.\\n';
    return out;
  }

  var copy = document.getElementById('copy');
  if (copy) copy.addEventListener('click', function () {
    var text = notes();
    var done = function () {
      copy.textContent = 'Copied';
      setTimeout(function () { copy.textContent = 'Copy the notes'; }, 1600);
    };
    // navigator.clipboard is unavailable on file:// in some browsers.
    if (navigator.clipboard && window.isSecureContext) {
      navigator.clipboard.writeText(text).then(done, function () { fallback(text, done); });
    } else { fallback(text, done); }
  });

  function fallback(text, done) {
    var ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    try { document.execCommand('copy'); done(); }
    catch (err) { window.prompt('Copy the notes:', text); }
    document.body.removeChild(ta);
  }
})();
`;
