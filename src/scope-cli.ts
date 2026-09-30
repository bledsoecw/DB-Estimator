/**
 * npm run scope -- <documentId> [--dry-run] [--out review] [--model ...]
 *
 * One estimate, reviewed for scope against its job, on top of the pricing
 * checks. Writes the same approver page the batch writes, with the scope
 * findings as cards Kristen can judge and copy out.
 *
 * --dry-run assembles everything and prints what WOULD be sent — every
 * file included or left out and why, the comment and line counts, a token
 * and dollar estimate — and stops before the model is called. No key is
 * needed for that, and nothing leaves the machine.
 *
 * Read-only against JobTread. The estimate, the comments, the quotes and the
 * photos are sent to Anthropic's API for the review; that is the one thing
 * here that leaves the building, and it happens only when a key is set.
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { anthropicFromEnv, preflight } from './anthropic.ts';
import { JobTreadClient } from './jobtread/client.ts';
import { captureFixture } from './jobtread/queries.ts';
import { fromFixture } from './domain.ts';
import { audit } from './rules/index.ts';
import { renderReport } from './report.ts';
import { fetchScopePacket } from './scope/packet.ts';
import { packetText } from './scope/prompt.ts';
import {
  DEFAULT_MODEL, PRICING, anthropicCall, costOf, estimateTokens, reviewScope,
} from './scope/review.ts';

export interface ScopeArgs {
  documentId: string;
  dryRun: boolean;
  out: string;
  model: string;
}

export function parseScopeArgs(argv: string[]): ScopeArgs {
  const args: ScopeArgs = { documentId: '', dryRun: false, out: 'review', model: DEFAULT_MODEL };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    if (a === '--dry-run') args.dryRun = true;
    else if (a === '--out') args.out = argv[++i] ?? args.out;
    else if (a === '--model') args.model = argv[++i] ?? args.model;
    else if (a.startsWith('--')) throw new Error(`unknown flag ${a}`);
    else if (!args.documentId) args.documentId = a;
    else throw new Error(`unexpected argument ${a}`);
  }
  if (!args.documentId) throw new Error('usage: npm run scope -- <documentId> [--dry-run] [--out review]');
  return args;
}

async function main(): Promise<number> {
  const args = parseScopeArgs(process.argv.slice(2));
  const grantKey = process.env['JOBTREAD_GRANT_KEY'];
  const organizationId = process.env['JOBTREAD_ORGANIZATION_ID'];
  if (!grantKey || !organizationId) {
    process.stderr.write('JOBTREAD_GRANT_KEY and JOBTREAD_ORGANIZATION_ID are not set; see .env.example\n');
    return 2;
  }
  const client = new JobTreadClient({
    grantKey,
    organizationId,
    ...(process.env['JOBTREAD_API_URL'] ? { apiUrl: process.env['JOBTREAD_API_URL'] } : {}),
  });

  process.stderr.write(`reading ${args.documentId}\n`);
  const fixture = await captureFixture(client, args.documentId);
  const input = fromFixture(fixture);
  const result = audit(input);
  const packet = await fetchScopePacket(client, args.documentId);
  const text = packetText(packet);

  const lines = [
    `${packet.jobName} — ${packet.documentName}${packet.issueDate ? `, issued ${packet.issueDate}` : ', draft'}`,
    `  ${packet.lines.length} lines, ${packet.comments.length} comments, ${packet.attachments.length} files sent` +
      (packet.failed.length ? `, ${packet.failed.length} failed to download` : '') +
      `, ${packet.excluded.length} left out`,
  ];
  for (const a of packet.attachments) lines.push(`  + ${a.file.name} (${a.file.type}, ${kb(a.bytes.length)})`);
  for (const f of packet.failed) lines.push(`  ! ${f.file.name}: ${f.reason}`);
  for (const e of packet.excluded) lines.push(`  - ${e.file.name}: ${e.reason}`);
  const tokens = estimateTokens(packet, text);
  const est = costOf(args.model, { input: tokens, output: 4_000, cacheRead: 0, cacheWrite: 0 });
  lines.push(`  about ${tokens.toLocaleString()} input tokens; roughly $${(est ?? 0).toFixed(2)} on ${args.model}`);
  process.stderr.write(lines.join('\n') + '\n');

  if (args.dryRun) {
    mkdirSync(args.out, { recursive: true });
    const path = join(args.out, `${args.documentId}-scope-packet.txt`);
    writeFileSync(path, text);
    process.stderr.write(`dry run: the text the model would read is in ${path}. Nothing was sent.\n`);
    return 0;
  }

  let anthropic;
  try {
    anthropic = anthropicFromEnv();
  } catch (err) {
    process.stderr.write(`${err instanceof Error ? err.message : String(err)}\n`);
    return 2;
  }
  const check = await preflight(anthropic, args.model);
  if (!check.ok) {
    process.stderr.write(`${check.reason}\nNothing was sent and nothing was spent.\n`);
    return 2;
  }
  if (!PRICING[args.model]) process.stderr.write(`no price table for ${args.model}; cost will not be shown\n`);

  process.stderr.write(`reviewing with ${args.model}\n`);
  const scope = await reviewScope(packet, anthropicCall(anthropic), args.model);
  result.findings.push(...scope.findings);

  mkdirSync(args.out, { recursive: true });
  const page = join(args.out, `${args.documentId}.html`);
  writeFileSync(
    page,
    renderReport(input, result, {
      footnote:
        `Scope review by ${scope.model}: ${scope.usage.input.toLocaleString()} tokens in, ` +
        `${scope.usage.output.toLocaleString()} out` +
        (scope.cost !== null ? `, $${scope.cost.toFixed(2)}` : '') +
        `. The model read ${packet.comments.length} comments and ${packet.attachments.length} files. ` +
        `Its summary of the job: ${scope.review.summary}`,
    }),
  );
  process.stderr.write(
    `${scope.findings.length} scope findings` +
      (scope.cost !== null ? ` ($${scope.cost.toFixed(2)})` : '') +
      `; page written to ${page}\n`,
  );
  return 0;
}

function kb(n: number): string {
  return `${Math.round(n / 1024)} KB`;
}

if (process.argv[1] && /scope-cli\.ts$/.test(process.argv[1])) {
  main().then(
    (code) => process.exit(code),
    (err) => {
      process.stderr.write(`${err instanceof Error ? err.message : String(err)}\n`);
      process.exit(1);
    },
  );
}
