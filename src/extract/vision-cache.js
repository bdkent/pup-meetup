// Per-post cache of vision extraction results, keyed by post_id. This is what
// makes re-deriving occurrences from the durable raw archive cheap: each post is
// sent to the vision model ONCE; later runs rebuild the occurrence from the
// cached parse (applying current code) without spending again. Persisted in
// data/state (committed to the `data` branch with the rest of the durable state).

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const CACHE_PATH = fileURLToPath(new URL('../../data/state/vision-cache.json', import.meta.url));

export async function loadVisionCache(path = CACHE_PATH) {
  try { return JSON.parse(await readFile(path, 'utf8')); } catch { return {}; }
}

export async function saveVisionCache(cache, path = CACHE_PATH) {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, JSON.stringify(cache, null, 2) + '\n');
}
