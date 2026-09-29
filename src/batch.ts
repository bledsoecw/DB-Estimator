/**
 * Audit a run of estimates instead of one.
 *
 * This exists for stage 1 of the rollout (docs/ROADMAP.md 18): run the auditor
 * against estimates already in JobTread, change no process, and find out what
 * share of its findings a reviewer judges real. That gate is ">= 20 estimates
 * audited, >= 80% of findings Kristen judges real", and it cannot be measured
 * one command at a time.
 *
 * It matters more than it looks. The rules were rewritten against three
 * estimates. Three is enough to find that a rule is broken and nowhere near
 * enough to prove one is right — the materiality floor, the systemic-deviation
 * share and the plausible-margin ceiling are all judgement calls fitted to a
 * very small sample, and this is the thing that tests them against the book.
 *
 * Read-only, like everything else here.
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { ZERO, add, formatMoney, formatPercent, type Money } from './money.ts';
import { fromFixture, marginOf } from './domain.ts';
import { audit } from './rules/index.ts';
import { renderReport } from './report.ts';
import type { JobTreadClient } from './jobtread/client.ts';
import { captureFixture, fetchCostTypes, fetchRecentDocuments } from './jobtread/queries.ts';
import type { AuditResult } from './rules/types.ts';
import type { AuditFixture } from './jobtread/types.ts';

export interface BatchRow {
  id: string;
  jobName: string;
  name: string;
  status: string;
  price: Money;
  margin: ReturnType<typeof marginOf>;
  lines: number;
  needsHuman: number;
  underpriced: Money;
  result: AuditResult;
  error?: string;
}

export interface BatchOptions {
  limit: number;
  status?: string;
  outDir: string;
  /** Called after each document so a long run shows progress. */
  onProgress?(index: number, total: number, label: string): void;
  /**
   * Overrides for the two network calls, so the batch path can be tested
   * against frozen fixtures. A batch run is the hardest thing here to verify
   * by hand and the easiest to get subtly wrong — a swallowed error, a report
   * written to the wrong name — so it needs to be reachable offline.
   */
  list?(): Promise<{ id: string; name: string; status: string; job?: { name: string } }[]>;
  fetch?(id: string): Promise<AuditFixture>;
}

export async function runBatch(
  client: JobTreadClient | null,
  opts: BatchOptions,
): Promise<BatchRow[]> {
  const docs = opts.list
    ? await opts.list()
    : await fetchRecentDocuments(client!, {
        limit: opts.limit,
        ...(opts.status ? { status: opts.status } : {}),
      });
  const costTypes = opts.fetch ? [] : await fetchCostTypes(client!);
  const fetchOne = opts.fetch ?? ((id: string) => captureFixture(client!, id, costTypes));

  mkdirSync(opts.outDir, { recursive: true });
  const rows: BatchRow[] = [];

  for (const [i, doc] of docs.entries()) {
    opts.onProgress?.(i + 1, docs.length, doc.job?.name ?? doc.name);
    try {
      const fixture = await fetchOne(doc.id);
      const input = fromFixture(fixture);
      const result = audit(input);
      writeFileSync(join(opts.outDir, `${doc.id}.html`), renderReport(input, result));
      rows.push({
        id: doc.id,
        jobName: input.estimate.jobName,
        name: input.estimate.name,
        status: input.estimate.status,
        price: input.estimate.statedPrice,
        margin: marginOf(input.estimate.statedPrice, input.estimate.statedCost),
        lines: input.estimate.lines.length,
        needsHuman: result.findings.filter((f) => f.severity !== 'info').length,
        underpriced: result.totalUnderpriced,
        result,
      });
    } catch (err) {
      // One unreadable document must not cost the other nineteen.
      rows.push({
        id: doc.id,
        jobName: doc.job?.name ?? '(unknown job)',
        name: doc.name,
        status: doc.status,
        price: ZERO,
        margin: 0n as ReturnType<typeof marginOf>,
        lines: 0,
        needsHuman: 0,
        underpriced: ZERO,
        result: { findings: [], passed: [], notes: [], totalUnderpriced: ZERO },
        error: err instanceof Error ? err.message : String(err),
      });
      process.stderr.write(
        `  could not read ${doc.id}: ${err instanceof Error ? err.message : String(err)}\n`,
      );
    }
  }

  writeFileSync(join(opts.outDir, 'index.html'), renderIndex(rows, opts));
  return rows;
}

/** Findings per rule across the whole run — the number the stage-1 gate needs. */
export function findingCounts(rows: BatchRow[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const row of rows) {
    for (const f of row.result.findings) {
      if (f.severity === 'info') continue;
      counts.set(f.rule, (counts.get(f.rule) ?? 0) + 1);
    }
  }
  return new Map([...counts].sort((a, b) => b[1] - a[1]));
}

function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export /**
 * Judging the findings, which is the only thing the stage-1 gate actually needs.
 *
 * ROADMAP 18 gates the auditor on ">= 80% of findings Kristen judges real,
 * every false positive logged". Nothing in the tool captured a verdict, so
 * meeting that gate meant opening twenty reports and keeping score on paper —
 * which is how a gate quietly turns into an opinion.
 *
 * One page, one sitting. Grouped by rule so a systematically wrong check shows
 * up as a block of red rather than as scattered disagreement: the three checks
 * deleted or demoted after the first run would have been obvious here in
 * seconds. The tally is live and states the gate, and the log copies out,
 * because "every false positive logged" is half the requirement.
 *
 * It records a judgement about the AUDITOR, not about the estimate. Nothing
 * here is written to JobTread and nothing changes a price.
 */
function renderVerdicts(rows: BatchRow[], counts: Map<string, number>): string {
  const total = [...counts.values()].reduce((a, b) => a + b, 0);
  const byRule = new Map<string, { job: string; id: string; title: string }[]>();
  for (const row of rows) {
    for (const f of row.result.findings) {
      if (f.severity === 'info') continue;
      const bucket = byRule.get(f.rule) ?? [];
      bucket.push({ job: row.jobName, id: row.id, title: f.title });
      byRule.set(f.rule, bucket);
    }
  }
  const ordered = [...byRule].sort((a, b) => b[1].length - a[1].length);

  let idx = 0;
  const groups = ordered
    .map(([rule, items]) => {
      const rowsHtml = items
        .map((it) => {
          const i = idx++;
          return `      <div class="f" data-i="${i}" data-rule="${esc(rule)}"
        data-job="${esc(it.job)}" data-title="${esc(it.title)}">
        <span class="who"><a href="${esc(it.id)}.html">${esc(it.job)}</a></span>
        <span class="what">${esc(it.title)}</span>
        <span class="btns">
          <button type="button" data-v="real">Real</button>
          <button type="button" data-v="false">Not real</button>
        </span>
      </div>`;
        })
        .join('\n');
      return `    <div class="rulegroup">
      <h3>${esc(rule)} <span class="n">— ${items.length}</span></h3>
${rowsHtml}
    </div>`;
    })
    .join('\n');

  return `<h2>Judging the findings — ${total}</h2>
  <div class="gate">
    <span class="score"><span id="judged">0</span> of ${total} judged</span>
    <span class="verdict-note" id="tally">The gate is ≥80% real. Mark each one; the score updates as you go.</span>
  </div>
${groups}
  <button type="button" id="copylog">Copy the log</button>
  <script>${VERDICT_SCRIPT(total)}</script>`;
}

const VERDICT_SCRIPT = (total: number) => `
(function () {
  var v = {};
  document.addEventListener('click', function (e) {
    var b = e.target.closest ? e.target.closest('.f button') : null;
    if (!b) return;
    var row = b.closest('.f');
    var i = row.getAttribute('data-i');
    var pick = b.getAttribute('data-v');
    row.querySelectorAll('button').forEach(function (o) {
      o.classList.remove('on-real', 'on-false');
    });
    if (v[i] === pick) { delete v[i]; row.classList.remove('judged'); }
    else {
      v[i] = pick;
      b.classList.add(pick === 'real' ? 'on-real' : 'on-false');
      row.classList.add('judged');
    }
    paint();
  });

  function paint() {
    var n = 0, real = 0;
    for (var k in v) { n++; if (v[k] === 'real') real++; }
    document.getElementById('judged').textContent = String(n);
    var t = document.getElementById('tally');
    if (n === 0) {
      t.innerHTML = 'The gate is \u226580% real. Mark each one; the score updates as you go.';
      return;
    }
    var pct = Math.round((real / n) * 100);
    var done = n === ${total};
    var cls = pct >= 80 ? 'pass' : 'fail';
    t.innerHTML = real + ' real, ' + (n - real) + ' not real \u2014 <span class="' + cls + '">' +
      pct + '%</span>' +
      (done ? (pct >= 80 ? ' \u2014 <span class="pass">gate passed</span>'
                         : ' \u2014 <span class="fail">gate not met</span>')
            : ' so far');
  }

  document.getElementById('copylog').addEventListener('click', function () {
    var out = 'Auditor shadow run \u2014 ' + new Date().toLocaleDateString() + '\\n\\n';
    var n = 0, real = 0, bad = [];
    document.querySelectorAll('.f').forEach(function (row) {
      var pick = v[row.getAttribute('data-i')];
      if (!pick) return;
      n++;
      if (pick === 'real') real++;
      else bad.push(row.getAttribute('data-rule') + '  |  ' + row.getAttribute('data-job') +
                    '  |  ' + row.getAttribute('data-title'));
    });
    out += n + ' of ${total} findings judged: ' + real + ' real, ' + (n - real) + ' not real';
    if (n) out += '  (' + Math.round((real / n) * 100) + '%, gate is 80%)';
    out += '\\n\\n';
    out += bad.length ? 'FALSE POSITIVES\\n' + bad.join('\\n') + '\\n' : 'No false positives.\\n';
    var btn = document.getElementById('copylog');
    var done = function () {
      btn.textContent = 'Copied';
      setTimeout(function () { btn.textContent = 'Copy the log'; }, 1600);
    };
    if (navigator.clipboard && window.isSecureContext) {
      navigator.clipboard.writeText(out).then(done, function () { fb(out, done); });
    } else { fb(out, done); }
  });

  function fb(text, done) {
    var ta = document.createElement('textarea');
    ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
    document.body.appendChild(ta); ta.select();
    try { document.execCommand('copy'); done(); }
    catch (err) { window.prompt('Copy the log:', text); }
    document.body.removeChild(ta);
  }
})();
`;

function renderIndex(rows: BatchRow[], opts: { status?: string }): string {
  const clean = rows.filter((r) => !r.error && r.needsHuman === 0).length;
  const failed = rows.filter((r) => r.error);
  const totalFindings = rows.reduce((n, r) => n + r.needsHuman, 0);
  const totalUnder = rows.reduce((acc, r) => add(acc, r.underpriced), ZERO);
  const counts = findingCounts(rows);

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Estimate audit — ${rows.length} estimates</title>
<style>
:root { --bg:#fbfaf8; --card:#fff; --ink:#1a1a1a; --dim:#6b6b6b; --line:#e4e1dc;
  --red:#b3261e; --green:#1f6b3a; }
@media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) {
  --bg:#17171a; --card:#202024; --ink:#ececec; --dim:#9a9a9a; --line:#34343a;
  --red:#f2857c; --green:#77c894; } }
* { box-sizing:border-box; }
body { margin:0; background:var(--bg); color:var(--ink);
  font:15px/1.55 -apple-system,"Segoe UI",Roboto,Helvetica,Arial,sans-serif; }
main { max-width:980px; margin:0 auto; padding:40px 16px 64px; }
h1 { margin:0 0 4px; font-size:22px; letter-spacing:-.01em; }
.meta { margin:0 0 24px; color:var(--dim); font-size:13px; }
.tiles { display:flex; flex-wrap:wrap; gap:26px; padding:18px 0; border-top:1px solid var(--line);
  border-bottom:1px solid var(--line); margin-bottom:24px; }
.tile .k { display:block; font-size:11px; text-transform:uppercase; letter-spacing:.07em; color:var(--dim); }
.tile .v { font-size:22px; font-weight:600; font-variant-numeric:tabular-nums; }
table { width:100%; border-collapse:collapse; font-size:14px; }
th { text-align:left; font-size:11px; text-transform:uppercase; letter-spacing:.07em;
  color:var(--dim); font-weight:600; padding:0 10px 8px 0; border-bottom:1px solid var(--line); }
td { padding:9px 10px 9px 0; border-bottom:1px solid var(--line); vertical-align:baseline; }
td.num { text-align:right; font-variant-numeric:tabular-nums; }
tr:hover td { background:var(--card); }
a { color:inherit; text-decoration:none; border-bottom:1px solid var(--line); }
a:hover { border-bottom-color:var(--ink); }
.pill { display:inline-block; min-width:22px; text-align:center; padding:1px 7px; border-radius:9px;
  font-size:12px; font-weight:600; }
.pill.some { background:var(--red); color:#fff; }
.pill.none { color:var(--green); }
.under { color:var(--red); font-variant-numeric:tabular-nums; }
.err { color:var(--red); font-size:12.5px; }
h2 { font-size:12px; text-transform:uppercase; letter-spacing:.09em; color:var(--dim);
  margin:34px 0 10px; }
.rules { font-size:13.5px; color:var(--dim); }
.rules li { margin:3px 0; }

.gate { display:flex; align-items:baseline; gap:14px; flex-wrap:wrap; margin:10px 0 18px; }
.gate .score { font-size:22px; font-weight:600; font-variant-numeric:tabular-nums; }
.gate .verdict-note { font-size:13px; color:var(--dim); }
.gate .pass { color:var(--green); font-weight:600; }
.gate .fail { color:var(--red); font-weight:600; }
.rulegroup { margin:18px 0 0; }
.rulegroup h3 { margin:0 0 6px; font-size:13px; font-weight:600; }
.rulegroup h3 .n { color:var(--dim); font-weight:400; }
.f { display:flex; align-items:baseline; gap:10px; padding:7px 0; border-bottom:1px solid var(--line);
  font-size:13.5px; }
.f .who { color:var(--dim); flex:0 0 190px; }
.f .what { flex:1; min-width:180px; }
.f .btns { display:flex; gap:6px; flex:0 0 auto; }
.f button { font:inherit; font-size:12px; padding:3px 10px; border-radius:5px;
  border:1px solid var(--line); background:transparent; color:var(--dim); cursor:pointer; }
.f button:hover { border-color:var(--dim); color:var(--ink); }
.f button.on-real { background:var(--green); border-color:var(--green); color:var(--bg); font-weight:600; }
.f button.on-false { background:var(--red); border-color:var(--red); color:var(--bg); font-weight:600; }
.f.judged .what { opacity:.55; }
#copylog { font:inherit; font-size:13px; font-weight:600; padding:7px 14px; border-radius:6px;
  border:1px solid var(--ink); background:var(--ink); color:var(--bg); cursor:pointer; margin-top:16px; }
footer { margin-top:36px; padding-top:16px; border-top:1px solid var(--line);
  color:var(--dim); font-size:12.5px; }
</style>
</head>
<body>
<main>
  <h1>Estimate audit</h1>
  <p class="meta">${rows.length} estimate${rows.length === 1 ? '' : 's'}${
    opts.status ? `, status ${esc(opts.status)}` : ''
  } · ${new Date().toLocaleString()}</p>

  <div class="tiles">
    <div class="tile"><span class="k">Estimates</span><span class="v">${rows.length}</span></div>
    <div class="tile"><span class="k">Nothing flagged</span><span class="v">${clean}</span></div>
    <div class="tile"><span class="k">Findings</span><span class="v">${totalFindings}</span></div>
    <div class="tile"><span class="k">Under policy</span><span class="v">${formatMoney(totalUnder)}</span></div>
  </div>

  <table>
    <thead><tr>
      <th>Job</th><th>Status</th><th class="num">Price</th><th class="num">Margin</th>
      <th class="num">Lines</th><th class="num">Needs you</th><th class="num">Under policy</th>
    </tr></thead>
    <tbody>
${rows
  .map((r) =>
    r.error
      ? `      <tr><td colspan="7" class="err">${esc(r.jobName)} — could not read: ${esc(r.error)}</td></tr>`
      : `      <tr>
        <td><a href="${esc(r.id)}.html">${esc(r.jobName)}</a></td>
        <td>${esc(r.status)}</td>
        <td class="num">${formatMoney(r.price, { cents: false })}</td>
        <td class="num">${formatPercent(r.margin, 1)}</td>
        <td class="num">${r.lines}</td>
        <td class="num"><span class="pill ${r.needsHuman ? 'some' : 'none'}">${
          r.needsHuman || '✓'
        }</span></td>
        <td class="num under">${r.underpriced > ZERO ? formatMoney(r.underpriced) : ''}</td>
      </tr>`,
  )
  .join('\n')}
    </tbody>
  </table>

  ${counts.size > 0 ? renderVerdicts(rows, counts) : ''}

  ${failed.length > 0 ? `<h2>Could not be read — ${failed.length}</h2>` : ''}

  <footer>
    <p><strong>Read-only.</strong> Nothing was written to JobTread.</p>
    <p>Contains customer names and pricing — keep it local.</p>
  </footer>
</main>
</body>
</html>
`;
}
