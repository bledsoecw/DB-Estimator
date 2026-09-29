/**
 * The batch path, driven offline against the three captured fixtures.
 *
 * A batch run is the hardest thing in here to check by eye — twenty reports
 * and an index, produced in one command — and the easiest place for a quiet
 * failure to live. A swallowed error or a report written under the wrong name
 * would look exactly like success.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { findingCounts, runBatch } from '../src/batch.ts';
import type { AuditFixture } from '../src/jobtread/types.ts';

const NAMES = ['jones-bath-kitchen', 'daeger-roof', 'wright-roof'] as const;
const fixtures = new Map<string, AuditFixture>();
for (const n of NAMES) {
  const f = JSON.parse(
    readFileSync(new URL(`./fixtures/${n}.json`, import.meta.url), 'utf8'),
  ) as AuditFixture;
  fixtures.set(f.document.id, f);
}

function withTempDir<T>(fn: (dir: string) => T): T {
  const dir = mkdtempSync(join(tmpdir(), 'db-estimator-batch-'));
  try {
    return fn(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

const list = async () =>
  [...fixtures.values()].map((f) => ({
    id: f.document.id,
    name: f.document.name,
    status: f.document.status,
    job: { name: f.document.job.name },
  }));

test('audits every document and writes a report for each', async () => {
  await withTempDir(async (dir) => {
    const rows = await runBatch(null, {
      limit: 10,
      outDir: dir,
      list,
      fetch: async (id) => fixtures.get(id)!,
    });

    assert.equal(rows.length, 3);
    for (const row of rows) {
      assert.ok(!row.error, `${row.jobName}: ${row.error}`);
      assert.ok(existsSync(join(dir, `${row.id}.html`)), `no report for ${row.id}`);
    }
    assert.ok(existsSync(join(dir, 'index.html')));

    // Each report is the real approver screen, not a stub.
    const daeger = readFileSync(join(dir, '22PPQD68bhaX.html'), 'utf8');
    assert.match(daeger, /Daeger_Roof/);
    // Roofing: priced from its own templates, so no markup verdict at all.
    assert.match(daeger, /Priced at or above policy on every line/);
    assert.match(daeger, /own templates/);
  });
});

test('the index links every estimate and totals them', async () => {
  await withTempDir(async (dir) => {
    const rows = await runBatch(null, {
      limit: 10,
      outDir: dir,
      list,
      fetch: async (id) => fixtures.get(id)!,
    });
    const index = readFileSync(join(dir, 'index.html'), 'utf8');

    for (const row of rows) {
      assert.ok(index.includes(`href="${row.id}.html"`), `index does not link ${row.jobName}`);
    }
    // Only the construction estimate contributes; the two roofing ones are not
    // measured against the cost types at all. And only one of its lines: the
    // catalog item behind Logistical Management is deliberately at 45% markup.
    assert.match(index, /\$1,039\.89/, 'the under-policy total is wrong or missing');
  });
});

test('every finding that needs a human can be judged', () => {
  return withTempDir(async (dir) => {
    const rows = await runBatch(null, {
      limit: 10,
      outDir: dir,
      list,
      fetch: async (id) => fixtures.get(id)!,
    });
    const index = readFileSync(join(dir, 'index.html'), 'utf8');

    // The stage-1 gate is a count of real findings, so every one has to be
    // markable. One left off the page is one silently scored as agreement.
    const expected = rows.reduce(
      (n, r) => n + r.result.findings.filter((f) => f.severity !== 'info').length,
      0,
    );
    assert.equal((index.match(/data-v="real"/g) ?? []).length, expected);
    assert.equal((index.match(/data-v="false"/g) ?? []).length, expected);
    assert.match(index, new RegExp(`Judging the findings — ${expected}`));

    // Indices must be distinct, or two findings share one verdict.
    const ids = [...index.matchAll(/class="f" data-i="(\d+)"/g)].map((m) => m[1]);
    assert.equal(ids.length, expected);
    assert.equal(new Set(ids).size, expected, 'duplicate data-i, verdicts would collide');

    // Context findings are not asks and must not be scored.
    assert.ok(!index.includes('margin.outside-band'));
    assert.ok(!index.includes('display.customer-visible'));
  });
});

test('the generated script actually parses', () => {
  // Every markup assertion above passed while the page was dead. A \n written
  // into the script template was consumed by the template literal and emitted a
  // real newline in the middle of a JS string, so the browser threw on load and
  // no button did anything. Nothing that inspects the HTML as text can see that.
  //
  // Compiling it here is cheap and catches exactly that class of damage.
  return withTempDir(async (dir) => {
    await runBatch(null, {
      limit: 10,
      outDir: dir,
      list,
      fetch: async (id) => fixtures.get(id)!,
    });

    for (const [name, file] of [
      ['index', 'index.html'],
      ['report', '22PPQD68bhaX.html'],
    ] as const) {
      const html = readFileSync(join(dir, file), 'utf8');
      const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1]!);
      assert.ok(scripts.length > 0, `${name} has no script`);
      for (const src of scripts) {
        assert.doesNotThrow(
          () => new Function(src),
          `${name}: generated script does not parse`,
        );
      }
    }
  });
});

test('the verdict log escapes what it quotes', () => {
  return withTempDir(async (dir) => {
    const hostile = structuredClone(fixtures.get('22PfKxuR9Vrx')!);
    hostile.document.job.name = 'Smith <img src=x> & Co "job"';
    await runBatch(null, {
      limit: 10,
      outDir: dir,
      list: async () => [{ id: 'x', name: 'x', status: 'pending', job: { name: 'x' } }],
      fetch: async () => hostile,
    });
    const index = readFileSync(join(dir, 'index.html'), 'utf8');
    assert.ok(!index.includes('<img src=x>'), 'unescaped markup reached the page');
    assert.match(index, /data-job="Smith &lt;img src=x&gt; &amp; Co &quot;job&quot;"/);
  });
});

test('one unreadable document does not cost the others', async () => {
  await withTempDir(async (dir) => {
    const rows = await runBatch(null, {
      limit: 10,
      outDir: dir,
      list: async () => [
        { id: 'broken', name: 'x', status: 'pending', job: { name: 'Broken Job' } },
        ...(await list()),
      ],
      fetch: async (id) => {
        if (id === 'broken') throw new Error('document broken not found');
        return fixtures.get(id)!;
      },
    });

    assert.equal(rows.length, 4);
    const failed = rows.filter((r) => r.error);
    assert.equal(failed.length, 1);
    assert.match(failed[0]!.error!, /not found/);
    // The other three still produced reports.
    assert.equal(rows.filter((r) => !r.error).length, 3);
    assert.ok(existsSync(join(dir, 'index.html')));
    assert.match(readFileSync(join(dir, 'index.html'), 'utf8'), /could not read/);
  });
});

test('counts findings by rule across the run', async () => {
  await withTempDir(async (dir) => {
    const rows = await runBatch(null, {
      limit: 10,
      outDir: dir,
      list,
      fetch: async (id) => fixtures.get(id)!,
    });
    const counts = findingCounts(rows);

    // Context-only findings are excluded: they are not asks.
    assert.ok(!counts.has('margin.outside-band'));
    // One, from the one construction estimate in the set. The two roofing ones
    // price from their own templates and are not measured against the cost
    // types; the construction estimate's other deviation is a recorded decision.
    assert.equal(counts.get('markup.off-policy'), 1);

    // Sorted commonest first, so the noisiest rule is the obvious one to look at.
    const values = [...counts.values()];
    assert.deepEqual(values, [...values].sort((a, b) => b - a));
  });
});

test('escapes job names in the index', async () => {
  await withTempDir(async (dir) => {
    const hostile = structuredClone(fixtures.get('22PfKxuR9Vrx')!);
    hostile.document.job.name = 'Smith <script>alert(1)</script> & Sons';
    await runBatch(null, {
      limit: 10,
      outDir: dir,
      list: async () => [{ id: 'x', name: 'x', status: 'pending', job: { name: 'x' } }],
      fetch: async () => hostile,
    });
    const index = readFileSync(join(dir, 'index.html'), 'utf8');
    assert.ok(!index.includes('<script>alert(1)</script>'));
    assert.match(index, /Smith &lt;script&gt;/);
  });
});
