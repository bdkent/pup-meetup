// Durable state store for the scraping path (brief §4): raw posts (the durable
// asset) and per-organizer cursors for change-detection. These live under data/
// and are persisted across CI runs by committing them to the `data` branch
// (authored by github-actions[bot]) — NOT actions/cache, which is transient.
//
// Free-feed sources (ics/eventbrite/rss) are idempotently re-derived each run and
// need no state; only social sources (instagram/facebook) use this.

import { readFile, writeFile, mkdir, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAW_DIR = fileURLToPath(new URL('../data/raw/', import.meta.url));
const STATE_DIR = fileURLToPath(new URL('../data/state/', import.meta.url));
const SEEN_CAP = 500; // cap remembered post ids per source (we only fetch recent posts)

export function sourceKeyFor(src) {
  return `${src.type}:${src.handle ?? src.url ?? ''}`;
}

export async function loadState(organizerId, { stateDir = STATE_DIR } = {}) {
  try {
    return JSON.parse(await readFile(join(stateDir, `${organizerId}.json`), 'utf8'));
  } catch {
    return { organizer_id: organizerId, sources: {} };
  }
}

export async function saveState(state, { stateDir = STATE_DIR } = {}) {
  await mkdir(stateDir, { recursive: true });
  await writeFile(join(stateDir, `${state.organizer_id}.json`), JSON.stringify(state, null, 2) + '\n');
}

export function getCursor(state, sourceKey) {
  return state.sources?.[sourceKey] ?? { last_polled: null, seen_ids: [] };
}

/** Posts not previously seen for this source. */
export function filterNewPosts(posts, cursor) {
  const seen = new Set(cursor?.seen_ids ?? []);
  return posts.filter((p) => p.post_id && !seen.has(p.post_id));
}

/** Mark ALL fetched posts seen (incl. non-events) so we never re-process them. */
export function updateCursor(state, sourceKey, fetchedPosts, nowIso) {
  const cursor = getCursor(state, sourceKey);
  const seen = new Set(cursor.seen_ids ?? []);
  for (const p of fetchedPosts) if (p.post_id) seen.add(p.post_id);
  state.sources = state.sources ?? {};
  state.sources[sourceKey] = { last_polled: nowIso, seen_ids: [...seen].slice(-SEEN_CAP) };
  return state;
}

/** Persist raw posts (the durable asset), one file per post, idempotent. */
export async function appendRawPosts(organizerId, posts, { rawDir = RAW_DIR } = {}) {
  if (!posts.length) return 0;
  const dir = join(rawDir, organizerId);
  await mkdir(dir, { recursive: true });
  for (const p of posts) {
    await writeFile(join(dir, `${safe(p.post_id)}.json`), JSON.stringify(p, null, 2) + '\n');
  }
  return posts.length;
}

/** Load all persisted raw posts for an organizer (the durable acquisition archive). */
export async function loadRawPosts(organizerId, { rawDir = RAW_DIR } = {}) {
  const dir = join(rawDir, organizerId);
  let files = [];
  try { files = (await readdir(dir)).filter((f) => f.endsWith('.json')); } catch { return []; }
  const out = [];
  for (const f of files) {
    try { out.push(JSON.parse(await readFile(join(dir, f), 'utf8'))); } catch { /* skip */ }
  }
  return out;
}

function safe(id) {
  return String(id).replace(/[^a-zA-Z0-9._-]/g, '_');
}
