import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { monthKey, makeVisionBudget, loadVisionUsage, saveVisionUsage } from '../src/extract/vision-budget.js';

test('makeVisionBudget caps calls within the current month', () => {
  const now = new Date('2026-06-20T00:00:00Z');
  const usage = {};
  const b = makeVisionBudget(usage, { now, cap: 2 });
  assert.equal(b.canSpend(), true);
  b.record();
  b.record();
  assert.equal(b.used(), 2);
  assert.equal(b.canSpend(), false, 'cannot spend past the cap');
  assert.equal(b.remaining(), 0);
  assert.equal(usage[monthKey(now)], 2, 'counter persisted into the usage record');
});

test('budget is per-month — a new month starts fresh', () => {
  const usage = { '2026-05': 100 };
  const b = makeVisionBudget(usage, { now: new Date('2026-06-01T00:00:00Z'), cap: 5 });
  assert.equal(b.used(), 0);
  assert.equal(b.canSpend(), true);
});

test('vision usage round-trips through disk', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'pup-vu-'));
  const path = join(dir, 'vision-usage.json');
  try {
    await saveVisionUsage({ '2026-06': 7 }, path);
    assert.equal((await loadVisionUsage(path))['2026-06'], 7);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('loadVisionUsage returns {} when the file is missing', async () => {
  assert.deepEqual(await loadVisionUsage('/nonexistent/vu.json'), {});
});
