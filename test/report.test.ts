/**
 * The approver screen.
 *
 * Two things here are load-bearing and fail silently if they break.
 *
 * Escaping: every name in this report comes from JobTread, where a user typed
 * it. "Jones_Bath/Kitchen" is harmless, but nothing stops a job being called
 * `Smith <Rear> & Deck`, and an unescaped one would garble the page or worse.
 *
 * Self-containment: the file opens from a file:// path on a laptop with no
 * toolchain, and gets emailed. One external URL and it renders naked on the
 * machine that matters.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { fromFixture } from '../src/domain.ts';
import { audit } from '../src/rules/index.ts';
import { renderReport } from '../src/report.ts';
import type { AuditFixture } from '../src/jobtread/types.ts';

const fixture = JSON.parse(
  readFileSync(new URL('./fixtures/jones-bath-kitchen.json', import.meta.url), 'utf8'),
) as AuditFixture;

const input = fromFixture(fixture);
const result = audit(input);
const html = renderReport(input, result);

test('renders the figures that drive the decision', () => {
  assert.match(html, /\$109,304\.84/, 'stated price');
  assert.match(html, /\$72,360\.20/, 'stated cost');
  assert.match(html, /33\.80%/, 'margin');
  assert.match(html, /Under policy by <strong>\$1,039\.89<\/strong>/, 'the headline number');
  assert.match(html, /22PfKxuR9Vrx/, 'the document id, so it can be found again');
});

test('every finding reaches the page', () => {
  const cards = html.match(/class="card /g) ?? [];
  assert.equal(cards.length, result.findings.length);
  for (const f of result.findings) {
    // Titles carry — and ×, so compare on a distinctive escaped-safe slice.
    const head = f.title.split(' is ')[0]!.split(' has ')[0]!;
    assert.ok(html.includes(escapeForTest(head)), `missing finding: ${f.title}`);
  }
});

test('separates what needs a human from what is only context', () => {
  const needs = result.findings.filter((f) => f.severity !== 'info').length;
  assert.match(html, new RegExp(`Needs you <span class="count">${needs}</span>`));
  // Count in the markup only. The script block selects on the same attribute,
  // and counting the whole file silently includes those.
  const body = html.slice(0, html.indexOf('<script>'));
  assert.equal((body.match(/data-needs="1"/g) ?? []).length, needs);
  assert.equal(
    (body.match(/data-needs="0"/g) ?? []).length,
    result.findings.length - needs,
  );
});

test('escapes everything that came from JobTread', () => {
  const hostile = structuredClone(fixture);
  hostile.document.job.name = 'Smith <Rear> & Deck "phase 2"';
  hostile.document.name = '<script>alert(1)</script>';

  const out = renderReport(fromFixture(hostile), audit(fromFixture(hostile)));

  assert.ok(!out.includes('<script>alert(1)</script>'), 'script tag survived escaping');
  assert.ok(!out.includes('<Rear>'), 'angle brackets survived escaping');
  assert.match(out, /Smith &lt;Rear&gt; &amp; Deck/, 'escaped form is present');
  // The title attribute is quoted; a raw quote there would break out of it.
  assert.ok(!/data-title="[^"]*"[^"=>]*"/.test(out), 'a quote escaped its attribute');
});

test('the job name cannot close the script block, and survives intact', () => {
  const name = 'Deck </script><img src=x onerror=alert(1)> & "quotes"';
  const hostile = structuredClone(fixture);
  hostile.document.job.name = name;
  const out = renderReport(fromFixture(hostile), audit(fromFixture(hostile)));

  const script = out.slice(out.indexOf('<script>') + 8);
  assert.ok(!script.slice(0, script.indexOf('</script>')).includes('<'), 'a raw < reached the script block');

  // And the copied notes must read like the job, not like markup. Inside a
  // script the browser decodes no entities, so an HTML-escaped name would
  // arrive at Kristen as "Smith &amp; Deck".
  assert.ok(!script.includes('&amp;'), 'the name was HTML-escaped into a JS string');
  assert.ok(script.includes('\\u003c/script'), 'the closing tag was not neutralised');
  assert.equal(JSON.parse(readBackJsLiteral(script)), name, 'the name did not round-trip');
});

/** Pull the first quoted literal out of the notes builder and un-escape it. */
function readBackJsLiteral(script: string): string {
  const m = /var out = ("(?:[^"\\]|\\.)*")/.exec(script);
  assert.ok(m, 'could not find the job name literal in the script');
  return m![1]!;
}

test('is self-contained — nothing to fetch', () => {
  const urls = (html.match(/(?:href|src)\s*=\s*["']?(https?:)?\/\//g) ?? []);
  assert.deepEqual(urls, [], 'the report must not reference anything off the filesystem');
  assert.ok(!/@import/.test(html), 'no CSS import');
  assert.match(html, /<style>/, 'styles are inline');
  assert.match(html, /<script>/, 'script is inline');
});

test('says plainly that it changes nothing', () => {
  assert.match(html, /Read-only/);
  assert.match(html, /it does not release the estimate/);
});

test('handles a clean estimate without claiming findings', () => {
  const clean = structuredClone(fixture);
  // Strip the lines and the totals with them. showChildCosts has to come off
  // too: with no lines it is still a live customer-view finding, correctly —
  // the first draft of this test forgot that and blamed the renderer.
  clean.document.costItems = { count: 0, nodes: [] };
  clean.document.priceWithTax = 0;
  clean.document.price = 0;
  clean.document.cost = 0;
  clean.document.showChildCosts = false;
  clean.comparables = [];

  const input2 = fromFixture(clean);
  const out = renderReport(input2, audit(input2));
  assert.ok(!out.includes('Needs you <span'), 'claimed findings on an empty estimate');
  assert.match(out, /Nothing needs you|Priced at or above policy/);
});

/** Mirror of the renderer's escaping, so the test asserts rather than assumes. */
function escapeForTest(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
