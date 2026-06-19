// Geocoding / location-enrichment stage. Resolves each occurrence to map
// coordinates:
//   1. keep coords already on the occurrence (e.g. from a feed), else
//   2. geocode location.address via Nominatim (OpenStreetMap, free), else
//   3. fall back to the organizer's home_geo (marked approx: true).
//
// Results are cached (keyed by normalized address) so we never re-query the same
// address — this keeps us well within Nominatim's usage policy (<=1 req/sec, and
// no repeated lookups). Negative results are cached too.
//
// CLI:  node src/geocode.js "<address>"   (one live Nominatim lookup)

import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const NOMINATIM = 'https://nominatim.openstreetmap.org/search';
const USER_AGENT = 'pup-meetup/0.1 (https://github.com/pup-meetup; geocoder)';
const MIN_INTERVAL_MS = 1100; // Nominatim asks for <= 1 request/second.

let _lastCallAt = 0;
async function throttle() {
  const wait = MIN_INTERVAL_MS - (Date.now() - _lastCallAt);
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  _lastCallAt = Date.now();
}

export function normalizeAddress(address) {
  return String(address || '').trim().replace(/\s+/g, ' ').toLowerCase();
}

export async function loadCache(path) {
  try {
    return JSON.parse(await readFile(path, 'utf8'));
  } catch {
    return {};
  }
}

export async function saveCache(path, cache) {
  await writeFile(path, JSON.stringify(cache, null, 2) + '\n');
}

/**
 * @param {string} address
 * @param {{cache?: object, fetchImpl?: typeof fetch, userAgent?: string, skipThrottle?: boolean}} [opts]
 * @returns {Promise<{lat:number,lng:number}|null>}
 */
export async function geocodeAddress(address, opts = {}) {
  const { cache = {}, fetchImpl = fetch, userAgent = USER_AGENT, skipThrottle = false } = opts;
  const key = normalizeAddress(address);
  if (!key) return null;
  if (Object.prototype.hasOwnProperty.call(cache, key)) return cache[key]; // hit (incl. negative)

  if (!skipThrottle) await throttle();
  let result = null;
  try {
    const url = `${NOMINATIM}?format=json&limit=1&q=${encodeURIComponent(address)}`;
    const res = await fetchImpl(url, { headers: { 'User-Agent': userAgent } });
    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data) && data.length > 0) {
        const lat = Number(data[0].lat);
        const lng = Number(data[0].lon);
        if (Number.isFinite(lat) && Number.isFinite(lng)) result = { lat, lng };
      }
    }
  } catch {
    result = null;
  }
  cache[key] = result;
  return result;
}

/**
 * Resolve coordinates for a batch of occurrences in place.
 * @param {import('./types.js').Occurrence[]} occurrences
 * @param {{organizer?: import('./types.js').Organizer, cache?: object, fetchImpl?: typeof fetch, geocode?: typeof geocodeAddress, skipThrottle?: boolean}} [opts]
 */
export async function enrichOccurrenceLocations(occurrences, opts = {}) {
  const { organizer, cache = {}, fetchImpl, geocode = geocodeAddress, skipThrottle = false } = opts;
  for (const occ of occurrences) {
    if (!occ.location) occ.location = { name: null, address: null, lat: null, lng: null };
    const loc = occ.location;
    if (loc.lat != null && loc.lng != null) {
      loc.approx = false;
      continue;
    }
    let coords = null;
    if (loc.address) coords = await geocode(loc.address, { cache, fetchImpl, skipThrottle });
    if (coords) {
      loc.lat = coords.lat;
      loc.lng = coords.lng;
      loc.approx = false;
    } else if (organizer?.home_geo) {
      loc.lat = organizer.home_geo.lat;
      loc.lng = organizer.home_geo.lng;
      loc.approx = true; // pin is the organizer's general area, not the exact venue
      if (!loc.name) loc.name = organizer.name ?? null;
    }
  }
  return occurrences;
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) {
  const address = process.argv.slice(2).join(' ');
  if (!address) {
    console.error('usage: node src/geocode.js "<address>"');
    process.exit(1);
  }
  geocodeAddress(address, {})
    .then((r) => console.log(JSON.stringify(r)))
    .catch((err) => {
      console.error(err.message);
      process.exit(1);
    });
}
