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
 *
 * Exit code is 0 when nothing needs a human, 1 when something does — so it can
 * gate a script without anyone reading the output.
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { ZERO, formatMoney, formatPercent } from './money.ts';
import { fromFixture, marginOf } from './domain.ts';
import { audit } from './rules/index.ts';
import { marginBand } from './rules/comparables.ts';
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
    const w = Math.max(...f.math.map((m) => m.label.length));
    for (const m of f.math) {
      const label = m.label.padEnd(w);
      out(`    ${m.emphasis ? BOLD : DIM}${label}  ${m.value}${OFF}`);
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
  documentId: string | undefined;
  fixture: string | undefined;
  capture: string | undefined;
  json: boolean;
  help: boolean;
}

function parseArgs(argv: string[]): Args {
  const args: Args = {
    documentId: undefined,
    fixture: undefined,
    capture: undefined,
    json: false,
    help: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    if (a === '--help' || a === '-h') args.help = true;
    else if (a === '--json') args.json = true;
    else if (a === '--fixture') args.fixture = argv[++i];
    else if (a === '--capture') args.capture = argv[++i];
    else if (!a.startsWith('-')) args.documentId = a;
  }
  return args;
}

function usage(): void {
  out(`
${BOLD}db-estimator auditor v0.5${OFF} ${DIM}— read-only estimate check${OFF}

  ${BOLD}npm run audit -- <documentId>${OFF}
  ${BOLD}npm run audit -- --fixture test/fixtures/jones-bath-kitchen.json${OFF}

  --fixture <path>   audit a captured fixture, no network
  --capture <path>   save the fetched data as a fixture while auditing
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
