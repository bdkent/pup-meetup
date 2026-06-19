// Static site generator (zero-dependency). Joins generated occurrences with
// catalog metadata, keeps only upcoming published ones, embeds them into
// template.html, and writes dist/index.html.
//
// CLI:  node site/build.js   (also: npm run build:site)

import { readFile, readdir, mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadCatalog } from '../src/catalog.js';

const EVENTS_DIR = fileURLToPath(new URL('../data/events/', import.meta.url));
const TEMPLATE = fileURLToPath(new URL('./template.html', import.meta.url));
const OUT_DIR = fileURLToPath(new URL('./dist/', import.meta.url));
const SEED = fileURLToPath(new URL('./seed.json', import.meta.url));

const DEMO_BANNER =
  '<div class="demo-banner">⚠️ Demo data — sample events for UI testing, not real listings.</div>';

// Turn a seed entry (relative date) into a client event with an absolute,
// always-upcoming start so the demo never goes stale.
function seedToEvent(s, now, i) {
  const start = new Date(now.getTime() + s.in_days * 86400000);
  start.setUTCHours(s.hour_utc ?? 16, s.minute_utc ?? 0, 0, 0);
  const end = s.duration_min ? new Date(start.getTime() + s.duration_min * 60000).toISOString() : null;
  return {
    id: `demo:${i}`, title: s.title, start: start.toISOString(), end,
    timezone: s.timezone ?? null, organizer_name: s.organizer_name ?? null, metro: s.metro ?? null,
    breeds: s.breeds ?? [], lat: s.lat ?? null, lng: s.lng ?? null, approx: s.approx ?? false,
    location_name: s.location_name ?? null, source_url: s.source_url ?? null,
  };
}

async function loadEvents() {
  let files = [];
  try {
    files = (await readdir(EVENTS_DIR)).filter((f) => f.endsWith('.json'));
  } catch {
    return [];
  }
  const events = [];
  for (const f of files) {
    try {
      events.push(JSON.parse(await readFile(join(EVENTS_DIR, f), 'utf8')));
    } catch {
      /* skip malformed */
    }
  }
  return events;
}

export async function buildSite({ now = new Date(), demo = false } = {}) {
  const [organizers, occurrences, template] = await Promise.all([
    loadCatalog(),
    loadEvents(),
    readFile(TEMPLATE, 'utf8'),
  ]);

  const orgById = new Map(organizers.map((o) => [o.id, o]));
  const nowIso = now.toISOString();

  const events = occurrences
    .filter((o) => o.status === 'published' && typeof o.start === 'string' && o.start >= nowIso)
    .sort((a, b) => (a.start < b.start ? -1 : a.start > b.start ? 1 : 0))
    .map((o) => {
      const org = orgById.get(o.organizer_id);
      return {
        id: o.id,
        title: o.title,
        start: o.start,
        end: o.end ?? null,
        timezone: org?.timezone ?? null,
        organizer_name: org?.name ?? null,
        metro: org?.metro ?? null,
        breeds: o.breeds ?? [],
        lat: o.location?.lat ?? null,
        lng: o.location?.lng ?? null,
        approx: o.location?.approx ?? false,
        location_name: o.location?.name ?? null,
        source_url: o.sources?.[0]?.post_url ?? null,
      };
    });

  if (demo) {
    const seed = JSON.parse(await readFile(SEED, 'utf8'));
    for (let i = 0; i < seed.length; i++) events.push(seedToEvent(seed[i], now, i));
    events.sort((a, b) => (a.start < b.start ? -1 : a.start > b.start ? 1 : 0));
  }

  const html = template
    .replace('__EVENTS_DATA__', JSON.stringify(events))
    .replace('__DEMO_BANNER__', demo ? DEMO_BANNER : '');
  await mkdir(OUT_DIR, { recursive: true });
  await writeFile(join(OUT_DIR, 'index.html'), html);
  return { count: events.length, outDir: OUT_DIR, demo };
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) {
  const demo = process.argv.includes('--demo') || process.env.DEMO === '1';
  buildSite({ demo })
    .then(({ count, outDir }) =>
      console.error(`Built site with ${count} upcoming event(s)${demo ? ' (incl. demo data)' : ''} -> ${join(outDir, 'index.html')}`))
    .catch((err) => {
      console.error(err.message);
      process.exit(1);
    });
}
