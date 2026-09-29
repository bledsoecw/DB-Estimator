#!/usr/bin/env node
/**
 * db-estimator auditor — v0.5
 *
 * Reads one JobTread estimate and checks it against policy. Read-only: it
 * issues no mutation and its grant should carry no write action.
 *
 *   npm run audit -- <documentId>              audit a live document
 *   npm run audit -- --fixture <path.json>     audit a captured fixture, no network
 *   npm run audit -- <documentId> --capture <path.json>   save a fixture while auditing
 *   npm run audit -- <documentId> --html <path.html>      write the approver screen
 *   npm run audit -- --recent 20 --out review               audit a batch, live
 *   npm run audit -- --catalog --out review                  audit the whole catalog
 *
 * Exit code is 0 when nothing needs a human, 1 when something does — so it can
 * gate a script without anyone reading the output.
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { ZERO, abs, add, formatMoney, formatPercent } from './money.ts';
import { fromFixture, marginOf } from './domain.ts';
import { audit } from './rules/index.ts';
import { marginBand } from './rules/comparables.ts';
import { renderReport } from './report.ts';
import { findingCounts, runBatch } from './batch.ts';
import { auditCatalog, renderCatalogReport, summarizeCatalog } from './catalog-audit.ts';
import { fetchCatalog, fetchCostTypes } from './jobtread/queries.ts';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import type { CatalogFixture } from './jobtread/types.ts';
import { clientFromEnv } from './jobtread/client.ts';
import { captureFixture } from './jobtread/queries.ts';
import type { AuditFixture } from './jobtread/types.ts';
import type { Finding } from './rules/types.ts';

const BOLD = '\u001b[1m';
const DIM = '\u001b[2m';
const RED = '\u001b[31m';
const YELLOW = '\u001b[33m';
const GREEN = '\u001b[32m';
const CYAN = '\u001b[36m';
const OFF = '\u001b[0m';

const SEVERITY_LABEL: Record<Finding['severity'], string> = {
  pricing: `${RED}PRICING${OFF}`,
  data: `${YELLOW}DATA${OFF}`,
  display: `${YELLOW}CUSTOMER VIEW${OFF}`,
  info: `${CYAN}CONTEXT${OFF}`,
};

async function main(argv: string[]): Promise<number> {
  const args = parseArgs(argv);
  if (args.doctor) return doctor();
  if (args.catalog) return catalogAudit(args);
  if (args.recent !== undefined) return batch(args);
  if (args.help || (!args.documentId && !args.fixture)) {
    usage();
    return args.help ? 0 : 2;
  }

  let fixture: AuditFixture;
  if (args.fixture) {
    fixture = JSON.parse(readFileSync(args.fixture, 'utf8')) as AuditFixture;
    process.stderr.write(`${DIM}fixture captured ${fixture.capturedAt}${OFF}\n`);
  } else {
    const client = clientFromEnv();
    process.stderr.write(`${DIM}reading ${args.documentId} from JobTread...${OFF}\n`);
    fixture = await captureFixture(client, args.documentId!);
    if (args.capture) {
      writeFileSync(args.capture, JSON.stringify(fixture, null, 2));
      process.stderr.write(`${DIM}fixture written to ${args.capture}${OFF}\n`);
    }
  }

  const input = fromFixture(fixture);
  const result = audit(input);
  const { estimate } = input;

  if (args.html) {
    writeFileSync(args.html, renderReport(input, result));
    process.stderr.write(`${DIM}report written to ${args.html}${OFF}\n`);
  }

  if (args.json) {
    process.stdout.write(
      JSON.stringify(
        {
          document: estimate.id,
          job: estimate.jobName,
          findings: result.findings.map((f) => ({
            ...f,
            impact: f.impact === undefined ? undefined : formatMoney(f.impact),
          })),
          passed: result.passed,
          notes: result.notes,
          totalUnderpriced: formatMoney(result.totalUnderpriced),
        },
        null,
        2,
      ) + '\n',
    );
    return result.findings.some((f) => f.severity !== 'info') ? 1 : 0;
  }

  // ---- header ----
  const margin = marginOf(estimate.statedPrice, estimate.statedCost);
  const band = marginBand(input.comparables);
  out('');
  out(`${BOLD}${estimate.jobName}${OFF}`);
  out(
    `${DIM}${estimate.name} · ${estimate.status} · ${estimate.lines.length} lines in ` +
      `${estimate.groups.length} groups · ${estimate.id}${OFF}`,
  );
  out('');
  out(
    `  price ${BOLD}${formatMoney(estimate.statedPrice)}${OFF}` +
      `   cost ${formatMoney(estimate.statedCost)}` +
      `   margin ${BOLD}${formatPercent(margin)}${OFF}` +
      (band ? `${DIM}  (band ${formatPercent(band.lo)}–${formatPercent(band.hi)}, n=${band.n})${OFF}` : ''),
  );
  if (result.totalUnderpriced > ZERO) {
    out(`  ${RED}${BOLD}under policy by ${formatMoney(result.totalUnderpriced)}${OFF}`);
  }
  out('');

  // ---- findings ----
  const needsHuman = result.findings.filter((f) => f.severity !== 'info');
  const context = result.findings.filter((f) => f.severity === 'info');

  if (needsHuman.length === 0) {
    out(`${GREEN}Nothing needs you.${OFF}`);
  } else {
    out(`${BOLD}NEEDS YOU — ${needsHuman.length}${OFF}`);
  }
  out('');
  for (const f of [...needsHuman, ...context]) printFinding(f);

  // ---- passed ----
  if (result.passed.length > 0) {
    out(`${BOLD}CHECKED AND CLEAN — ${result.passed.length}${OFF}`);
    for (const p of result.passed) out(`  ${GREEN}✓${OFF} ${DIM}${p.message}${OFF}`);
    out('');
  }

  // ---- suppressed ----
  if (result.notes.length > 0) {
    out(`${BOLD}NOT RAISED${OFF}`);
    for (const n of result.notes) out(`  ${DIM}· ${n.message}${OFF}`);
    out('');
  }

  out(`${DIM}Read-only. Nothing was written to JobTread.${OFF}`);
  out('');
  return needsHuman.length > 0 ? 1 : 0;
}

function printFinding(f: Finding): void {
  out(`  ${SEVERITY_LABEL[f.severity]}  ${BOLD}${f.title}${OFF}`);
  for (const line of wrap(f.detail, 76)) out(`    ${DIM}${line}${OFF}`);
  if (f.impact !== undefined && f.impact !== ZERO) {
    const sign = f.impact > ZERO ? '−' : '+';
    out(`    ${RED}${sign}${formatMoney(f.impact < ZERO ? (-f.impact as typeof f.impact) : f.impact)}${OFF}`);
  }
  if (f.math?.length) {
    // Only rows that carry a value set the column width. A long label with no
    // value — the list of items behind a rate — would otherwise push every
    // number off to the right.
    const valued = f.math.filter((m) => m.value !== '');
    const w = valued.length > 0 ? Math.max(...valued.map((m) => m.label.length)) : 0;
    for (const m of f.math) {
      if (m.value === '') {
        out(`    ${DIM}${m.label}${OFF}`);
        continue;
      }
      out(`    ${m.emphasis ? BOLD : DIM}${m.label.padEnd(w)}  ${m.value}${OFF}`);
    }
  }
  if (f.actions?.length) out(`    ${DIM}→ ${f.actions.join('  ·  ')}${OFF}`);
  out('');
}

function wrap(text: string, width: number): string[] {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let cur = '';
  for (const w of words) {
    if (cur.length + w.length + 1 > width) {
      lines.push(cur);
      cur = w;
    } else {
      cur = cur ? `${cur} ${w}` : w;
    }
  }
  if (cur) lines.push(cur);
  return lines;
}

interface Args {
  doctor: boolean;
  catalog: boolean;
  recent: number | undefined;
  status: string | undefined;
  jobType: string | undefined;
  out: string;
  documentId: string | undefined;
  fixture: string | undefined;
  capture: string | undefined;
  html: string | undefined;
  json: boolean;
  help: boolean;
}

function parseArgs(argv: string[]): Args {
  const args: Args = {
    doctor: false,
    catalog: false,
    recent: undefined,
    // Construction by default. Roofing prices from its own templates and is
    // not what Kristen reviews, so auditing it against the cost types is noise.
    status: undefined,
    jobType: 'Construction',
    out: 'review',
    documentId: undefined,
    fixture: undefined,
    capture: undefined,
    html: undefined,
    json: false,
    help: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    if (a === '--help' || a === '-h') args.help = true;
    else if (a === '--doctor') args.doctor = true;
    else if (a === '--catalog') args.catalog = true;
    else if (a === '--json') args.json = true;
    else if (a === '--fixture') args.fixture = argv[++i];
    else if (a === '--capture') args.capture = argv[++i];
    else if (a === '--html') args.html = argv[++i];
    else if (a === '--recent') args.recent = Number(argv[++i]);
    else if (a === '--status') args.status = argv[++i];
    else if (a === '--job-type') args.jobType = argv[++i];
    else if (a === '--all-job-types') args.jobType = undefined;
    else if (a === '--out') args.out = argv[++i] ?? 'review';
    else if (!a.startsWith('-')) args.documentId = a;
  }
  return args;
}

/**
 * Audit the whole priced catalog against the cost-type margins.
 *
 * Org-level, not per estimate: a catalog item priced wrong passes every line
 * that comes off it, and this is the only thing that would say so.
 */
async function catalogAudit(args: Args): Promise<number> {
  let fixture: CatalogFixture;
  if (args.fixture) {
    fixture = JSON.parse(readFileSync(args.fixture, 'utf8')) as CatalogFixture;
    process.stderr.write(`${DIM}catalog fixture captured ${fixture.capturedAt}${OFF}\n`);
  } else {
    const client = clientFromEnv();
    process.stderr.write(`${DIM}reading the catalog from JobTread (about 8 pages)...${OFF}\n`);
    const [items, costTypes] = [await fetchCatalog(client), await fetchCostTypes(client)];
    fixture = {
      capturedAt: new Date().toISOString(),
      organizationId: client.organizationId,
      costTypes,
      items,
    };
    if (args.capture) {
      writeFileSync(args.capture, JSON.stringify(fixture, null, 2));
      process.stderr.write(`${DIM}catalog fixture written to ${args.capture}${OFF}\n`);
    }
  }

  const result = auditCatalog(fixture);

  if (args.json) {
    const { sections, duplicates, ...rest } = result;
    process.stdout.write(
      JSON.stringify(
        {
          ...rest,
          offPolicyItems: sections.flatMap((s) =>
            s.clusters.flatMap((c) =>
              c.items.map((o) => ({
                id: o.item.id,
                name: o.item.name,
                costType: s.costType,
                costCode: o.item.costCodeName,
                multiplier: Number(o.item.multiplier) / 1e6,
                unitCost: formatMoney(o.item.unitCost),
                unitPrice: formatMoney(o.item.unitPrice),
                atPolicy: formatMoney(o.expectedUnitPrice),
                perUnit: formatMoney(abs(o.perUnit)),
                direction: o.perUnit > ZERO ? 'low' : 'high',
              })),
            ),
          ),
          duplicates: duplicates.map((d) => ({
            name: d.name,
            identical: d.identical,
            ids: d.items.map((i) => i.id),
          })),
        },
        null,
        2,
      ) + '\n',
    );
    return result.offPolicy > 0 ? 1 : 0;
  }

  mkdirSync(args.out, { recursive: true });
  const path = join(args.out, 'catalog.html');
  writeFileSync(path, renderCatalogReport(result));

  out('');
  out(`${BOLD}Catalog audit${OFF}`);
  out('');
  for (const line of summarizeCatalog(result)) out(`  ${line}`);
  out('');
  out(`${DIM}Report at ${path}${OFF}`);
  out(`${DIM}Read-only. Nothing was written to JobTread.${OFF}`);
  out('');
  return result.offPolicy > 0 ? 1 : 0;
}

/**
 * Audit a run of estimates and write an index over them.
 *
 * For the shadow stage: point it at estimates that already went out, and read
 * what the auditor would have said. Nothing is written to JobTread.
 */
async function batch(args: Args): Promise<number> {
  if (!Number.isFinite(args.recent) || args.recent! < 1) {
    process.stderr.write(`${RED}--recent needs a number, e.g. --recent 20${OFF}\n`);
    return 2;
  }
  const client = clientFromEnv();
  const rows = await runBatch(client, {
    limit: args.recent!,
    ...(args.status ? { status: args.status } : {}),
    ...(args.jobType ? { jobType: args.jobType } : {}),
    outDir: args.out,
    onProgress: (i, total, label) =>
      process.stderr.write(`${DIM}[${i}/${total}] ${label}${OFF}\n`),
  });

  const failed = rows.filter((r) => r.error);
  const flagged = rows.filter((r) => !r.error && r.needsHuman > 0);
  const totalFindings = rows.reduce((n, r) => n + r.needsHuman, 0);
  const totalUnder = rows.reduce((acc, r) => add(acc, r.underpriced), ZERO);

  out('');
  out(`${BOLD}${rows.length} ${args.jobType ?? 'estimates'}${args.jobType ? ' estimates' : ''} audited${OFF}`);
  out('');
  for (const r of rows) {
    if (r.error) {
      out(`  ${RED}✗${OFF} ${r.jobName} ${DIM}— ${r.error}${OFF}`);
      continue;
    }
    const mark = r.needsHuman === 0 ? `${GREEN}✓${OFF}` : `${RED}${r.needsHuman}${OFF}`;
    out(
      `  ${mark}  ${r.jobName.padEnd(38).slice(0, 38)} ` +
        `${DIM}${formatMoney(r.price, { cents: false }).padStart(11)}${OFF}` +
        (r.underpriced > ZERO ? `  ${RED}−${formatMoney(r.underpriced)}${OFF}` : ''),
    );
  }
  out('');
  out(
    `  ${rows.length - flagged.length - failed.length} clean · ` +
      `${flagged.length} flagged · ${totalFindings} findings` +
      (totalUnder > ZERO ? ` · ${formatMoney(totalUnder)} under policy` : '') +
      (failed.length ? ` · ${failed.length} unreadable` : ''),
  );
  out('');
  const counts = findingCounts(rows);
  if (counts.size > 0) {
    out(`${BOLD}BY RULE${OFF}`);
    for (const [rule, n] of counts) out(`  ${DIM}${rule.padEnd(24)}${OFF} ${n}`);
    out('');
  }
  out(`${DIM}Reports in ${args.out}/ — open ${args.out}/index.html${OFF}`);
  out(`${DIM}Read-only. Nothing was written to JobTread.${OFF}`);
  out('');
  return 0;
}

/**
 * Diagnose the setup before anyone debugs the auditor.
 *
 * Three things have to be true to audit a live document, and when one is not
 * the failure looks like a bug in the code. It is usually not.
 */
async function doctor(): Promise<number> {
  const checks: { label: string; ok: boolean; note: string }[] = [];

  const key = process.env['JOBTREAD_GRANT_KEY'];
  const org = process.env['JOBTREAD_ORGANIZATION_ID'];
  const url = process.env['JOBTREAD_API_URL'] ?? 'https://api.jobtread.com/pave';

  checks.push({
    label: 'JOBTREAD_GRANT_KEY',
    ok: !!key && key !== 'grant_xxxxxxxxxxxxxxxxxxxx',
    note: !key
      ? 'not set \u2014 is .env in this directory, and are you running through npm?'
      : key === 'grant_xxxxxxxxxxxxxxxxxxxx'
        ? 'still the placeholder from .env.example'
        : `set, ${key.length} chars, starts ${key.slice(0, 6)}\u2026`,
  });
  checks.push({
    label: 'JOBTREAD_ORGANIZATION_ID',
    ok: !!org,
    note: org ? org : 'not set',
  });

  // A status code alone does not prove we reached JobTread: a corporate or
  // sandbox egress proxy answers with its own 403 and looks identical from here.
  // JobTread always replies with JSON, so a body that does not parse means
  // something in between answered.
  let reachable = false;
  let netNote = '';
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: { $: { grantKey: key ?? 'probe' }, currentGrant: { id: {} } } }),
      signal: AbortSignal.timeout(20_000),
    });
    const body = await res.text();
    try {
      JSON.parse(body);
      reachable = true;
      netNote =
        res.ok || body.includes('grant')
          ? `reached JobTread, HTTP ${res.status}`
          : `reached JobTread, HTTP ${res.status} \u2014 ${body.slice(0, 120)}`;
    } catch {
      netNote =
        `HTTP ${res.status} with a non-JSON body \u2014 something between here and JobTread ` +
        `answered, most likely an egress proxy. JobTread always returns JSON.`;
    }
  } catch (err) {
    netNote = `unreachable \u2014 ${err instanceof Error ? err.message : String(err)}`;
  }
  checks.push({ label: `network to ${url}`, ok: reachable, note: netNote });

  out('');
  out(`${BOLD}db-estimator auditor \u2014 setup check${OFF}`);
  out('');
  for (const c of checks) {
    out(`  ${c.ok ? GREEN + '\u2713' : RED + '\u2717'}${OFF} ${BOLD}${c.label}${OFF}`);
    out(`     ${DIM}${c.note}${OFF}`);
  }
  out('');

  if (checks.every((c) => c.ok)) {
    out(`${GREEN}Ready. Run: npm run audit -- <documentId>${OFF}`);
    out('');
    return 0;
  }
  out(`${YELLOW}Not ready.${OFF} ${DIM}The auditor still works offline:${OFF}`);
  out(`  ${DIM}npm run audit -- --fixture test/fixtures/jones-bath-kitchen.json${OFF}`);
  out('');
  return 1;
}

function usage(): void {
  out(`
${BOLD}db-estimator auditor v0.5${OFF} ${DIM}— read-only estimate check${OFF}

  ${BOLD}npm run audit -- <documentId>${OFF}
  ${BOLD}npm run audit -- --fixture test/fixtures/jones-bath-kitchen.json${OFF}

  ${BOLD}npm run audit -- --recent 20 --status approved --out review${OFF}

  --doctor           check the setup: grant key, org id, network
  --catalog          audit every priced catalog item against the cost types
                     (--fixture / --capture / --json / --out apply)
  --recent <n>       audit the n most recent estimates and write an index
  --status <s>       with --recent: approved, pending, draft, denied
  --job-type <t>     Construction (default) or Roofing
  --all-job-types    audit both — roofing prices from its own templates
  --out <dir>        with --recent: where the reports go (default: review)
  --fixture <path>   audit a captured fixture, no network
  --capture <path>   save the fetched data as a fixture while auditing
  --html <path>      write the approver screen as one self-contained HTML file
  --json             machine-readable output

Requires JOBTREAD_GRANT_KEY and JOBTREAD_ORGANIZATION_ID unless --fixture is used.
Scope that grant to reads only — see docs/ROADMAP.md 19.2.
`);
}

const out = (s: string) => process.stdout.write(s + '\n');

main(process.argv.slice(2))
  .then((code) => {
    process.exitCode = code;
  })
  .catch((err: unknown) => {
    process.stderr.write(`${RED}${err instanceof Error ? err.message : String(err)}${OFF}\n`);
    process.exitCode = 2;
  });
