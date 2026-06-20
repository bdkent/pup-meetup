// Read-only diagnostic: fetch a few real Instagram posts for ONE organizer and
// show how the classify -> extract pipeline interprets them. Writes nothing,
// touches no state — just prints, so you can judge extraction quality on real
// data before wiring Instagram into ingest/CI.
//
// Usage:  node scripts/ig-probe.mjs [handle] [maxPosts]
//   - reads APIFY_TOKEN from the environment or from a local .env file
//   - defaults: handle=masontheshihtzu1 (NYC), maxPosts=8
//
// Cost: one Apify actor run of `maxPosts` results (a few cents of free credit).

import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { loadCatalog } from '../src/catalog.js';
import { fetchInstagramPosts } from '../src/adapters/apify-instagram.js';
import { classifyPost } from '../src/extract/classify.js';
import { extractOccurrenceFromPost } from '../src/extract/extract-text.js';

// Load APIFY_TOKEN from .env if not already in the environment (never printed).
async function ensureToken() {
  if (process.env.APIFY_TOKEN) return true;
  try {
    const env = await readFile(fileURLToPath(new URL('../.env', import.meta.url)), 'utf8');
    const m = env.match(/^\s*APIFY_TOKEN\s*=\s*(.+?)\s*$/m);
    if (m) { process.env.APIFY_TOKEN = m[1].replace(/^["']|["']$/g, ''); return true; }
  } catch { /* no .env */ }
  return false;
}

const trunc = (s, n) => { const t = String(s || '').replace(/\s+/g, ' ').trim(); return t.length > n ? t.slice(0, n) + '…' : t; };

async function main() {
  const handle = (process.argv[2] || 'masontheshihtzu1').replace(/^@/, '');
  const maxPosts = Number(process.argv[3] || 8);

  if (!(await ensureToken())) {
    console.error('No APIFY_TOKEN found. Put it in .env as:  APIFY_TOKEN=apify_api_xxx');
    process.exit(1);
  }

  const catalog = await loadCatalog();
  const organizer = catalog.find((o) => o.id === handle || o.sources?.some((s) => s.handle === handle))
    || { id: `probe-${handle}`, name: handle, breeds: ['shih-tzu'], metro: null, timezone: 'America/New_York' };

  const now = new Date();
  console.error(`Fetching up to ${maxPosts} post(s) for @${handle} (organizer: ${organizer.id})…\n`);
  const posts = await fetchInstagramPosts(handle, { maxPosts, organizerId: organizer.id });
  console.error(`Fetched ${posts.length} post(s).\n${'='.repeat(60)}`);

  let events = 0;
  let extracted = 0;
  for (const post of posts) {
    const cls = classifyPost(post, { now });
    console.error(`\n• ${post.posted_at || '(no date)'}  imgs:${post.image_urls.length}  ${post.permalink || ''}`);
    console.error(`  caption: ${trunc(post.text, 140) || '(none)'}`);
    console.error(`  classify: isEvent=${cls.isEvent} score=${cls.score} signals=[${(cls.signals || []).join(', ')}]`);
    if (!cls.isEvent) continue;
    events++;
    const occ = extractOccurrenceFromPost(post, organizer, { now });
    if (!occ) { console.error('  extract: (classified as event but no occurrence extracted)'); continue; }
    extracted++;
    console.error(`  → "${occ.title}"`);
    console.error(`    start=${occ.start}  location=${occ.location?.name || occ.location?.address || '(none)'}  conf=${occ.confidence}  status=${occ.status}`);
  }

  console.error(`\n${'='.repeat(60)}\nSummary: ${posts.length} fetched → ${events} classified as events → ${extracted} occurrence(s) extracted.`);
}

main().catch((err) => { console.error('ERROR:', err.message); process.exit(1); });
