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

// Build the full organizer directory: every catalog organizer PLUS any
// event-only organizers (e.g. demo data) not in the catalog. Crucially, orgs
// with zero upcoming events are still included with eventCount 0 — so the site
// works as a community directory before any events are parsed (the common case
// for Instagram-only organizers until APIFY_TOKEN is set). Returns a Map keyed
// by organizer id, each entry { id, name, metro, breeds[], sources[], eventCount }.
function buildDirectory(events, catalog) {
  const dir = new Map();
  for (const o of catalog) {
    dir.set(o.id, { id: o.id, name: o.name, metro: o.metro ?? null, breeds: [...(o.breeds || [])], sources: o.sources ?? [], eventCount: 0 });
  }
  for (const ev of events) {
    let e = dir.get(ev.organizer_id);
    if (!e) {
      e = { id: ev.organizer_id, name: ev.organizer_name, metro: ev.metro ?? null, breeds: [], sources: [], eventCount: 0 };
      dir.set(ev.organizer_id, e);
    }
    e.eventCount++;
    for (const b of ev.breeds || []) if (!e.breeds.includes(b)) e.breeds.push(b);
    if (!e.metro && ev.metro) e.metro = ev.metro;
  }
  for (const e of dir.values()) e.breeds.sort();
  return dir;
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

  // Organizer directory (catalog ∪ event-only orgs), incl. those with 0 events.
  const directory = buildDirectory(events, catalog);

  // Facets are derived from events AND the catalog directory, so a city/breed
  // with cataloged communities but no parsed events still gets its own page and
  // dropdown option (otherwise the navigator would link to a 404).
  const breeds = new Set();
  const metros = new Set();
  const pairs = {}; // breed -> Set(metro)
  const addPair = (b, m) => { if (b && m) (pairs[b] ??= new Set()).add(m); };
  for (const ev of events) {
    for (const b of ev.breeds || []) { breeds.add(b); addPair(b, ev.metro); }
    if (ev.metro) metros.add(ev.metro);
  }
  for (const o of directory.values()) {
    for (const b of o.breeds) { breeds.add(b); addPair(b, o.metro); }
    if (o.metro) metros.add(o.metro);
  }
  const pairsArr = Object.fromEntries(Object.entries(pairs).map(([b, set]) => [b, [...set].sort()]));
  const metroLabels = Object.fromEntries([...metros].sort().map((m) => [m, R.humanizeMetro(m)]));

  // Fresh output dir
  await rm(outDir, { recursive: true, force: true });
  await mkdir(outDir, { recursive: true });
  const opts = { now };
  let pages = 0;
  const emit = async (rel, html) => { await writePage(outDir, rel, html); pages++; };

  const dirArr = [...directory.values()];

  // index — the map + upcoming list (the community directory now lives on its
  // own /organizers page, linked from the top nav).
  await emit('index.html', R.renderIndexPage(events, {
    demo, pairs: pairsArr, metroLabels, now,
    breeds: [...breeds].sort(), metros: [...metros].sort(),
  }));

  // organizers directory + static About / Get-listed pages (top-nav links)
  const sortedDir = dirArr.slice().sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
  await emit('organizers.html', R.renderOrganizersPage(sortedDir, '', { metroLabels }));
  await emit('about.html', R.renderAboutPage('', opts));
  await emit('get-listed.html', R.renderGetListedPage('', opts));

  // events (+ ics)
  for (const ev of events) {
    await emit(`event/${R.safeId(ev.id)}.html`, R.renderEventPage(ev, '../', opts));
    await writePage(outDir, `event/${R.safeId(ev.id)}.ics`, R.icsForEvent(ev, opts));
  }

  // organizers — every cataloged org, even those with no upcoming events
  for (const [id, org] of directory) {
    const evs = events.filter((e) => e.organizer_id === id);
    await emit(`org/${R.safeId(id)}.html`, R.renderOrgPage(org, evs, '../', opts));
  }

  // breeds
  for (const b of breeds) {
    const evs = events.filter((e) => (e.breeds || []).includes(b));
    const orgs = dirArr.filter((o) => o.breeds.includes(b));
    await emit(`breed/${R.safeId(b)}.html`, R.renderBreedPage(b, evs, '../', { now, metros: pairsArr[b] || [], orgs }));
  }

  // metros
  for (const m of metros) {
    const evs = events.filter((e) => e.metro === m);
    const orgs = dirArr.filter((o) => o.metro === m);
    await emit(`metro/${R.safeId(m)}.html`, R.renderMetroPage(m, evs, '../', { now, orgs }));
  }

  // breed x metro combos (every pair with events OR cataloged communities)
  for (const [b, ms] of Object.entries(pairsArr)) {
    for (const m of ms) {
      const evs = events.filter((e) => (e.breeds || []).includes(b) && e.metro === m);
      const orgs = dirArr.filter((o) => o.breeds.includes(b) && o.metro === m);
      await emit(`find/${R.safeId(b)}__${R.safeId(m)}.html`, R.renderFindPage(b, m, evs, '../', { now, orgs }));
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
