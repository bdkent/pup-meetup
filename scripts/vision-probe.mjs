// Vision probe: run the IMAGE extractor on real posts and show what it pulls.
// Validates extraction quality + reports token cost BEFORE vision is wired into
// ingest/CI. Read-only; writes nothing. Bounded by maxPosts so cost is a few cents.
//
// Usage:  node scripts/vision-probe.mjs [handle] [maxPosts]
//   reads APIFY_TOKEN + ANTHROPIC_API_KEY from the environment or .env
//   defaults: handle=masontheshihtzu1 (NYC), maxPosts=8

import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { loadCatalog } from '../src/catalog.js';
import { fetchInstagramPosts } from '../src/adapters/apify-instagram.js';
import { extractOccurrenceFromImage } from '../src/extract/extract-vision.js';

async function loadEnv() {
  try {
    const env = await readFile(fileURLToPath(new URL('../.env', import.meta.url)), 'utf8');
    for (const line of env.split('\n')) {
      const m = line.match(/^\s*([A-Z_]+)\s*=\s*(.+?)\s*$/);
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
    }
  } catch { /* no .env */ }
}

const trunc = (s, n) => { const t = String(s ?? '').replace(/\s+/g, ' ').trim(); return t.length > n ? t.slice(0, n) + '…' : t; };

async function main() {
  await loadEnv();
  const handle = (process.argv[2] || 'masontheshihtzu1').replace(/^@/, '');
  const maxPosts = Number(process.argv[3] || 8);
  if (!process.env.ANTHROPIC_API_KEY) { console.error('No ANTHROPIC_API_KEY — add it to .env'); process.exit(1); }
  if (!process.env.APIFY_TOKEN) { console.error('No APIFY_TOKEN — add it to .env'); process.exit(1); }

  const catalog = await loadCatalog();
  const organizer = catalog.find((o) => o.id === handle || o.sources?.some((s) => s.handle === handle))
    || { id: `probe-${handle}`, name: handle, breeds: ['shih-tzu'], metro: null, timezone: 'America/New_York' };

  const now = new Date();
  console.error(`Fetching up to ${maxPosts} post(s) for @${handle} (tz ${organizer.timezone})…\n`);
  const posts = await fetchInstagramPosts(handle, { maxPosts, organizerId: organizer.id });
  console.error(`Fetched ${posts.length}. Running vision on image posts…\n${'='.repeat(66)}`);

  let inTok = 0, outTok = 0, calls = 0, published = 0, review = 0;
  for (const post of posts) {
    if (!post.image_urls?.length) { console.error(`\n• ${post.posted_at} — no image, skipped`); continue; }
    console.error(`\n• ${post.posted_at || '(no date)'}  ${post.permalink || ''}`);
    console.error(`  caption: ${trunc(post.text, 110) || '(none)'}`);
    try {
      const { occurrence, parsed, usage } = await extractOccurrenceFromImage(post, organizer, { now });
      calls++; inTok += usage?.input_tokens || 0; outTok += usage?.output_tokens || 0;
      console.error(`  vision: is_event=${parsed?.is_event} date=${parsed?.date} time=${parsed?.time} venue=${trunc(parsed?.venue, 48)} conf=${parsed?.confidence}`);
      if (occurrence) {
        occurrence.status === 'published' ? published++ : review++;
        console.error(`  → "${trunc(occurrence.title, 60)}"  start=${occurrence.start}  status=${occurrence.status}`);
      } else {
        console.error('  → (no occurrence — not a future-dated event)');
      }
    } catch (err) {
      console.error(`  ERROR: ${err.message}`);
    }
  }

  const cost = inTok / 1e6 * 1 + outTok / 1e6 * 5; // Haiku 4.5: $1 in / $5 out per MTok
  console.error(`\n${'='.repeat(66)}`);
  console.error(`Vision calls: ${calls}  |  published: ${published}  review: ${review}`);
  console.error(`Tokens: ${inTok} in / ${outTok} out  →  ~$${cost.toFixed(4)} this run (Haiku 4.5)`);
}

main().catch((e) => { console.error('FATAL:', e.message); process.exit(1); });
