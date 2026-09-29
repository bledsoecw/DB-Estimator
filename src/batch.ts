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

export function renderIndex(rows: BatchRow[], opts: { status?: string }): string {
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

  ${
    counts.size > 0
      ? `<h2>What was raised</h2>
  <ul class="rules">${[...counts]
    .map(([rule, n]) => `<li>${esc(rule)} — ${n}</li>`)
    .join('')}</ul>`
      : ''
  }

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
