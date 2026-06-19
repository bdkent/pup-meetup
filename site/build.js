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

export async function buildSite({ now = new Date() } = {}) {
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

  const html = template.replace('__EVENTS_DATA__', JSON.stringify(events));
  await mkdir(OUT_DIR, { recursive: true });
  await writeFile(join(OUT_DIR, 'index.html'), html);
  return { count: events.length, outDir: OUT_DIR };
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) {
  buildSite()
    .then(({ count, outDir }) => console.error(`Built site with ${count} upcoming event(s) -> ${join(outDir, 'index.html')}`))
    .catch((err) => {
      console.error(err.message);
      process.exit(1);
    });
}
