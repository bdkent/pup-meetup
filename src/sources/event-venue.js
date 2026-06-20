// Venue enrichment for feeds whose .ics omits LOCATION (Meetup is the prime
// example: the export drops the venue, but the event WEB PAGE embeds it in
// schema.org JSON-LD). The .ics gives us each event's URL, so we fetch the page
// and read location {name, streetAddress, geo} from the JSON-LD. Best-effort: if
// the fetch fails or the page has no JSON-LD, we return null and the occurrence
// falls back to an approximate region pin (never a wrong precise pin).

const UA = 'pup-meetup/0.1 (+https://github.com/pup-meetup)';

// Pull the first schema.org `location` Place out of a page's JSON-LD blocks.
export function extractPlaceFromHtml(html) {
  const re = /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let m;
  while ((m = re.exec(String(html))) !== null) {
    let data;
    try { data = JSON.parse(m[1].trim()); } catch { continue; }
    const place = findPlace(data);
    if (place) return place;
  }
  return null;
}

function findPlace(node, depth = 0) {
  if (!node || typeof node !== 'object' || depth > 6) return null;
  if (Array.isArray(node)) {
    for (const x of node) { const p = findPlace(x, depth + 1); if (p) return p; }
    return null;
  }
  const loc = node.location;
  if (loc && typeof loc === 'object' && (loc['@type'] === 'Place' || loc.address || loc.geo)) {
    const addr = loc.address || {};
    let address = typeof addr === 'string' ? addr : (addr.streetAddress || '');
    if (typeof addr === 'object' && addr.addressLocality && address && !address.includes(addr.addressLocality)) {
      address = [addr.streetAddress, addr.addressLocality, addr.addressRegion].filter(Boolean).join(', ');
    }
    const geo = loc.geo || {};
    const lat = Number(geo.latitude);
    const lng = Number(geo.longitude);
    return {
      name: loc.name || null,
      address: address || (typeof addr === 'string' ? addr : null) || null,
      lat: Number.isFinite(lat) ? lat : null,
      lng: Number.isFinite(lng) ? lng : null,
    };
  }
  for (const k of Object.keys(node)) {
    if (k === 'location') continue;
    const p = findPlace(node[k], depth + 1);
    if (p) return p;
  }
  return null;
}

// Fetch one event page and return its Place, cached by URL (in-run dedup for
// recurring series that share a URL).
export async function fetchEventVenue(url, { fetchImpl = fetch, cache } = {}) {
  if (!url) return null;
  if (cache && Object.prototype.hasOwnProperty.call(cache, url)) return cache[url];
  let place = null;
  try {
    const res = await fetchImpl(url, { headers: { 'User-Agent': UA } });
    if (res.ok) place = extractPlaceFromHtml(await res.text());
  } catch { place = null; }
  if (cache) cache[url] = place;
  return place;
}

// Enrich feed occurrences that have no location of their own, in place.
export async function enrichFeedVenues(occurrences, { fetchImpl, cache } = {}) {
  for (const occ of occurrences) {
    const loc = occ.location || (occ.location = { name: null, address: null, lat: null, lng: null });
    if (loc.address || (loc.lat != null && loc.lng != null)) continue; // already located
    const url = occ.sources?.[0]?.post_url;
    const place = await fetchEventVenue(url, { fetchImpl, cache });
    if (!place) continue;
    if (!loc.name && place.name) loc.name = place.name;
    if (place.address) loc.address = place.address;
    if (place.lat != null && place.lng != null) { loc.lat = place.lat; loc.lng = place.lng; }
  }
  return occurrences;
}
