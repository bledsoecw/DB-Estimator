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
    assert.match(daeger, /Under policy by <strong>\$3,943\.17<\/strong>/);
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
    // $2,974.52 + $3,943.17 + $2,889.50
    assert.match(index, /\$9,807\.19/, 'the under-policy total is wrong or missing');
    assert.ok(!/<script/.test(index), 'the index should need no script');
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
    assert.ok((counts.get('markup.off-policy') ?? 0) >= 4);

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
