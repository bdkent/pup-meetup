// schema.org JSON-LD Event source. Many event pages (Eventbrite especially)
// embed <script type="application/ld+json"> with an Event object that carries a
// structured startDate, address, and often geo coordinates — so we can extract
// occurrences with NO LLM and frequently NO geocoding needed.
//
// Used for the `eventbrite` source type and reusable for any page with
// schema.org Event markup. Identity:
//   eventbrite: eb:{numeric id from URL}
//   generic:    jsonld:{sha1(url || name+startDate)}

import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const UA = 'pup-meetup/0.1 (https://github.com/pup-meetup; jsonld)';
const HORIZON_MONTHS = 6;
const LD_RE = /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;

export function extractJsonLdObjects(html) {
  const out = [];
  let m;
  while ((m = LD_RE.exec(html)) !== null) {
    let data;
    try {
      data = JSON.parse(m[1].trim());
    } catch {
      continue;
    }
    collect(data, out);
  }
  return out;
}

function collect(node, out) {
  if (Array.isArray(node)) {
    for (const n of node) collect(n, out);
    return;
  }
  if (node && typeof node === 'object') {
    if (node['@graph']) collect(node['@graph'], out);
    out.push(node);
  }
}

function isEvent(node) {
  const t = node && node['@type'];
  if (!t) return false;
  const types = Array.isArray(t) ? t : [t];
  return types.some((x) => typeof x === 'string' && /(^|[A-Za-z])Event$/.test(x));
}

/**
 * @param {string} html
 * @param {{organizer: import('../types.js').Organizer, sourceType?: string, now?: Date}} opts
 * @returns {import('../types.js').Occurrence[]}
 */
export function extractEventsFromHtml(html, { organizer, sourceType = 'jsonld', now = new Date() } = {}) {
  if (!organizer) throw new Error('extractEventsFromHtml: organizer is required');
  const nowIso = now.toISOString();
  const hEnd = new Date(now);
  hEnd.setMonth(hEnd.getMonth() + HORIZON_MONTHS);

  const occurrences = [];
  const seen = new Set();
  for (const node of extractJsonLdObjects(html)) {
    if (!isEvent(node)) continue;
    const occ = eventToOccurrence(node, { organizer, sourceType, nowIso });
    if (!occ) continue;
    const start = new Date(occ.start);
    if (start < now || start > hEnd) continue; // upcoming, within horizon
    if (seen.has(occ.id)) continue;
    seen.add(occ.id);
    occurrences.push(occ);
  }
  occurrences.sort((a, b) => (a.start < b.start ? -1 : a.start > b.start ? 1 : 0));
  return occurrences;
}

export async function fetchAndExtractJsonLd(url, opts = {}) {
  const { fetchImpl = fetch } = opts;
  const res = await fetchImpl(url, { headers: { 'User-Agent': UA } });
  if (!res.ok) throw new Error(`Fetch failed (${res.status} ${res.statusText}) for ${url}`);
  return extractEventsFromHtml(await res.text(), opts);
}

function eventToOccurrence(ev, { organizer, sourceType, nowIso }) {
  const start = ev.startDate ? new Date(ev.startDate) : null;
  if (!start || Number.isNaN(start.getTime())) return null;
  const end = ev.endDate ? new Date(ev.endDate) : null;
  const { location, url: locUrl } = parseLdLocation(ev.location);
  const url = (typeof ev.url === 'string' && ev.url) || locUrl || null;

  return {
    id: makeId(sourceType, ev, url),
    organizer_id: organizer.id,
    series_id: null,
    recurrence_label: null,
    title: textOf(ev.name) || organizer.name,
    start: start.toISOString(),
    end: end && !Number.isNaN(end.getTime()) ? end.toISOString() : null,
    location,
    breeds: organizer.breeds ?? [],
    sources: [{ post_url: url, image: imageOf(ev.image), raw_text: textOf(ev.description), posted_at: null }],
    confidence: 1.0,
    status: 'published',
    extracted_at: nowIso,
    updated_at: nowIso,
  };
}

function parseLdLocation(location) {
  const result = { location: { name: null, address: null, lat: null, lng: null }, url: null };
  const loc = Array.isArray(location) ? location[0] : location;
  if (!loc) return result;
  if (typeof loc === 'string') {
    result.location.name = loc;
    result.location.address = loc;
    return result;
  }
  result.location.name = textOf(loc.name);
  result.location.address = formatAddress(loc.address);
  if (loc.geo && loc.geo.latitude != null && loc.geo.longitude != null) {
    const lat = Number(loc.geo.latitude);
    const lng = Number(loc.geo.longitude);
    if (Number.isFinite(lat) && Number.isFinite(lng)) {
      result.location.lat = lat;
      result.location.lng = lng;
    }
  }
  if (typeof loc.url === 'string') result.url = loc.url;
  return result;
}

function formatAddress(a) {
  if (!a) return null;
  if (typeof a === 'string') return a;
  const parts = [a.streetAddress, a.addressLocality, a.addressRegion, a.postalCode].filter(Boolean);
  return parts.length ? parts.join(', ') : null;
}

function makeId(sourceType, ev, url) {
  if (sourceType === 'eventbrite' && url) {
    const nums = url.match(/\d{6,}/g);
    if (nums) return `eb:${nums[nums.length - 1]}`;
  }
  const basis = url || `${textOf(ev.name) || ''}|${ev.startDate || ''}`;
  const prefix = sourceType === 'eventbrite' ? 'eb' : 'jsonld';
  return `${prefix}:${createHash('sha1').update(basis).digest('hex').slice(0, 16)}`;
}

function textOf(v) {
  if (v == null) return null;
  if (typeof v === 'string') return v.trim() || null;
  if (typeof v === 'number') return String(v);
  if (Array.isArray(v)) return textOf(v[0]);
  if (typeof v === 'object') return textOf(v['@value'] ?? v['#text'] ?? v.name ?? null);
  return null;
}

function imageOf(v) {
  if (!v) return null;
  if (typeof v === 'string') return v;
  if (Array.isArray(v)) return imageOf(v[0]);
  if (typeof v === 'object') return imageOf(v.url ?? v['@id'] ?? null);
  return null;
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) {
  const url = process.argv[2];
  if (!url) {
    console.error('usage: node src/sources/jsonld.js <event-or-organizer-url>');
    process.exit(1);
  }
  const organizer = { id: 'cli-test', name: 'CLI Test', breeds: ['unknown'], metro: 'unknown', timezone: 'UTC', sources: [] };
  fetchAndExtractJsonLd(url, { organizer, sourceType: 'eventbrite' })
    .then((occ) => {
      console.log(JSON.stringify(occ, null, 2));
      console.error(`\n${occ.length} event(s) extracted`);
    })
    .catch((err) => {
      console.error(err.message);
      process.exit(1);
    });
}
