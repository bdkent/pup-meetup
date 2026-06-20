import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  loadState, saveState, getCursor, filterNewPosts, updateCursor, appendRawPosts, sourceKeyFor,
} from '../src/store.js';

test('sourceKeyFor builds a stable key', () => {
  assert.equal(sourceKeyFor({ type: 'instagram', handle: 'mason' }), 'instagram:mason');
  assert.equal(sourceKeyFor({ type: 'ics', url: 'http://x/i.ics' }), 'ics:http://x/i.ics');
});

test('loadState defaults when missing and round-trips', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'pup-state-'));
  try {
    const s = await loadState('org1', { stateDir: dir });
    assert.deepEqual(s, { organizer_id: 'org1', sources: {} });
    updateCursor(s, 'instagram:mason', [{ post_id: 'a' }, { post_id: 'b' }], '2026-06-01T00:00:00Z');
    await saveState(s, { stateDir: dir });
    const reloaded = await loadState('org1', { stateDir: dir });
    assert.deepEqual(getCursor(reloaded, 'instagram:mason').seen_ids, ['a', 'b']);
    assert.equal(getCursor(reloaded, 'instagram:mason').last_polled, '2026-06-01T00:00:00Z');
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('filterNewPosts excludes already-seen ids', () => {
  const posts = [{ post_id: 'a' }, { post_id: 'c' }, { post_id: 'd' }];
  assert.deepEqual(filterNewPosts(posts, { seen_ids: ['a', 'b'] }).map((p) => p.post_id), ['c', 'd']);
});

test('updateCursor caps remembered ids and keeps the most recent', () => {
  const state = { organizer_id: 'o', sources: {} };
  const many = Array.from({ length: 600 }, (_, i) => ({ post_id: `p${i}` }));
  updateCursor(state, 'k', many, 'now');
  const seen = getCursor(state, 'k').seen_ids;
  assert.equal(seen.length, 500);
  assert.equal(seen.at(-1), 'p599');
});

test('appendRawPosts writes one sanitized file per post', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'pup-raw-'));
  try {
    const n = await appendRawPosts('org1', [{ post_id: 'p/1', text: 'hi' }, { post_id: 'p2', text: 'yo' }], { rawDir: dir });
    assert.equal(n, 2);
    const f = JSON.parse(await readFile(join(dir, 'org1', 'p_1.json'), 'utf8'));
    assert.equal(f.text, 'hi');
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
