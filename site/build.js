// Static site generator (zero-dependency). Reads generated occurrences +
// catalog, then emits a multi-page site:
//   index.html, org/<id>.html, event/<id>.html (+ .ics),
//   breed/<slug>.html, metro/<slug>.html, find/<breed>__<metro>.html
// Filtering is navigation between these static pages (see site/render.js).
//
// CLI:  node site/build.js [--demo]   (npm run build:site / build:demo)

import { readFile, readdir, mkdir, writeFile, rm } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadCatalog } from '../src/catalog.js';
import * as R from './render.js';

const EVENTS_DIR = fileURLToPath(new URL('../data/events/', import.meta.url));
const OUT_DIR = fileURLToPath(new URL('./dist/', import.meta.url));
const SEED = fileURLToPath(new URL('./seed.json', import.meta.url));

const slugify = (s) => String(s).toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

async function loadEvents() {
  let files = [];
  try { files = (await readdir(EVENTS_DIR)).filter((f) => f.endsWith('.json')); } catch { return []; }
  const out = [];
  for (const f of files) {
    try { out.push(JSON.parse(await readFile(join(EVENTS_DIR, f), 'utf8'))); } catch { /* skip */ }
  }
  return out;
}

// Occurrence -> render event shape (joins organizer metadata from the catalog).
function toEv(o, orgById) {
  const org = orgById.get(o.organizer_id);
  return {
    id: o.id, title: o.title, start: o.start, end: o.end ?? null,
    timezone: org?.timezone ?? null,
    organizer_id: o.organizer_id, organizer_name: org?.name ?? o.organizer_id,
    metro: org?.metro ?? null, breeds: o.breeds ?? [],
    location: {
      name: o.location?.name ?? null, address: o.location?.address ?? null,
      lat: o.location?.lat ?? null, lng: o.location?.lng ?? null, approx: o.location?.approx ?? false,
    },
    sources: o.sources ?? [], recurrence_label: o.recurrence_label ?? null,
    source_url: o.sources?.[0]?.post_url ?? null,
  };
}

function seedToEv(s, now) {
  const start = new Date(now.getTime() + s.in_days * 86400000);
  start.setUTCHours(s.hour_utc ?? 16, s.minute_utc ?? 0, 0, 0);
  const orgId = `demo-${slugify(s.organizer_name)}`;
  return {
    id: `demo:${orgId}:${start.toISOString().slice(0, 10)}`,
    title: s.title, start: start.toISOString(),
    end: s.duration_min ? new Date(start.getTime() + s.duration_min * 60000).toISOString() : null,
    timezone: s.timezone ?? null,
    organizer_id: orgId, organizer_name: s.organizer_name, metro: s.metro ?? null, breeds: s.breeds ?? [],
    location: { name: s.location_name ?? null, address: null, lat: s.lat ?? null, lng: s.lng ?? null, approx: s.approx ?? false },
    sources: s.source_url ? [{ post_url: s.source_url, image: null, raw_text: null, posted_at: null }] : [],
    recurrence_label: null, source_url: s.source_url ?? null,
  };
}

// Build the organizer view (catalog org if present, else synthesized from events).
function buildOrgs(events, catalogById) {
  const orgs = new Map();
  for (const ev of events) {
    if (orgs.has(ev.organizer_id)) continue;
    const cat = catalogById.get(ev.organizer_id);
    orgs.set(ev.organizer_id, cat
      ? { id: cat.id, name: cat.name, metro: cat.metro, sources: cat.sources ?? [] }
      : { id: ev.organizer_id, name: ev.organizer_name, metro: ev.metro, sources: [] });
  }
  return orgs;
}

async function writePage(outDir, rel, html) {
  const path = join(outDir, rel);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, html);
}

export async function buildSite({ now = new Date(), demo = false, outDir = OUT_DIR } = {}) {
  const [catalog, occurrences] = await Promise.all([loadCatalog(), loadEvents()]);
  const catalogById = new Map(catalog.map((o) => [o.id, o]));
  const nowIso = now.toISOString();

  let events = occurrences
    .filter((o) => o.status === 'published' && typeof o.start === 'string' && o.start >= nowIso)
    .map((o) => toEv(o, catalogById));
  if (demo) {
    const seed = JSON.parse(await readFile(SEED, 'utf8'));
    events = events.concat(seed.map((s) => seedToEv(s, now)));
  }
  events.sort((a, b) => (a.start < b.start ? -1 : a.start > b.start ? 1 : 0));

  // Facets
  const breeds = new Set();
  const metros = new Set();
  const pairs = {}; // breed -> Set(metro)
  for (const ev of events) {
    for (const b of ev.breeds || []) {
      breeds.add(b);
      if (ev.metro) { (pairs[b] ??= new Set()).add(ev.metro); }
    }
    if (ev.metro) metros.add(ev.metro);
  }
  const pairsArr = Object.fromEntries(Object.entries(pairs).map(([b, set]) => [b, [...set].sort()]));
  const metroLabels = Object.fromEntries([...metros].sort().map((m) => [m, R.humanizeMetro(m)]));

  // Fresh output dir
  await rm(outDir, { recursive: true, force: true });
  await mkdir(outDir, { recursive: true });
  const opts = { now };
  let pages = 0;
  const emit = async (rel, html) => { await writePage(outDir, rel, html); pages++; };

  // index
  await emit('index.html', R.renderIndexPage(events, { demo, pairs: pairsArr, metroLabels, now }));

  // events (+ ics)
  for (const ev of events) {
    await emit(`event/${R.safeId(ev.id)}.html`, R.renderEventPage(ev, '../', opts));
    await writePage(outDir, `event/${R.safeId(ev.id)}.ics`, R.icsForEvent(ev, opts));
  }

  // organizers
  const orgs = buildOrgs(events, catalogById);
  for (const [id, org] of orgs) {
    const evs = events.filter((e) => e.organizer_id === id);
    await emit(`org/${R.safeId(id)}.html`, R.renderOrgPage(org, evs, '../', opts));
  }

  // breeds
  for (const b of breeds) {
    const evs = events.filter((e) => (e.breeds || []).includes(b));
    await emit(`breed/${R.safeId(b)}.html`, R.renderBreedPage(b, evs, '../', opts));
  }

  // metros
  for (const m of metros) {
    const evs = events.filter((e) => e.metro === m);
    await emit(`metro/${R.safeId(m)}.html`, R.renderMetroPage(m, evs, '../', opts));
  }

  // breed x metro combos (only pairs that exist)
  for (const [b, ms] of Object.entries(pairsArr)) {
    for (const m of ms) {
      const evs = events.filter((e) => (e.breeds || []).includes(b) && e.metro === m);
      await emit(`find/${R.safeId(b)}__${R.safeId(m)}.html`, R.renderFindPage(b, m, evs, '../', opts));
    }
  }

  return { count: events.length, pages, outDir };
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) {
  const demo = process.argv.includes('--demo') || process.env.DEMO === '1';
  buildSite({ demo })
    .then(({ count, pages, outDir }) =>
      console.error(`Built ${pages} page(s) from ${count} upcoming event(s)${demo ? ' (incl. demo data)' : ''} -> ${outDir}`))
    .catch((err) => { console.error(err.message); process.exit(1); });
}
