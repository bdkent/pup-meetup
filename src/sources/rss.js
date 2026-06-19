// RSS/Atom source. Standard feeds carry a publish date, not a structured EVENT
// date — so on its own RSS can't yield reliable event occurrences. The robust,
// no-LLM approach: read the feed, then for each item follow its link and reuse
// the JSON-LD extractor to pull structured Event data from the linked page.
//
// Items whose linked pages have no schema.org Event are skipped (logged via the
// returned count). Best for event aggregators / calendars that publish an RSS of
// event pages; breed-club news feeds without event markup will yield little
// until the LLM extraction stage exists.

import { XMLParser } from 'fast-xml-parser';
import { fileURLToPath } from 'node:url';
import { fetchAndExtractJsonLd } from './jsonld.js';

const UA = 'pup-meetup/0.1 (https://github.com/pup-meetup; rss)';

export function parseFeedItems(xml) {
  const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '@_' });
  const doc = parser.parse(xml);
  const items = [];

  const channel = doc?.rss?.channel;
  if (channel) {
    for (const it of asArray(channel.item)) {
      items.push({ title: textOf(it.title), link: rssLink(it.link), date: it.pubDate ?? null });
    }
    return items;
  }
  if (doc?.feed) {
    for (const e of asArray(doc.feed.entry)) {
      items.push({ title: textOf(e.title), link: atomLink(e.link), date: e.published ?? e.updated ?? null });
    }
  }
  return items;
}

/**
 * @param {string} url feed URL
 * @param {{organizer: import('../types.js').Organizer, now?: Date, fetchImpl?: typeof fetch, maxItems?: number}} opts
 * @returns {Promise<{occurrences: import('../types.js').Occurrence[], itemsSeen: number}>}
 */
export async function fetchAndParseRss(url, opts = {}) {
  const { organizer, now = new Date(), fetchImpl = fetch, maxItems = 25 } = opts;
  const res = await fetchImpl(url, { headers: { 'User-Agent': UA } });
  if (!res.ok) throw new Error(`Fetch failed (${res.status} ${res.statusText}) for ${url}`);
  const items = parseFeedItems(await res.text()).slice(0, maxItems);

  const byId = new Map();
  for (const item of items) {
    if (!item.link) continue;
    try {
      const events = await fetchAndExtractJsonLd(item.link, {
        organizer, sourceType: 'jsonld', now, fetchImpl,
      });
      for (const ev of events) if (!byId.has(ev.id)) byId.set(ev.id, ev);
    } catch {
      /* skip unreachable / non-event item pages */
    }
  }
  const occurrences = [...byId.values()].sort((a, b) => (a.start < b.start ? -1 : a.start > b.start ? 1 : 0));
  return { occurrences, itemsSeen: items.length };
}

function asArray(v) {
  return v == null ? [] : Array.isArray(v) ? v : [v];
}

function rssLink(link) {
  if (typeof link === 'string') return link.trim() || null;
  if (link && typeof link === 'object') return textOf(link['#text']) || (typeof link['@_href'] === 'string' ? link['@_href'] : null);
  return null;
}

function atomLink(link) {
  for (const l of asArray(link)) {
    if (typeof l === 'string') return l;
    if (l && typeof l === 'object') {
      const rel = l['@_rel'];
      if ((!rel || rel === 'alternate') && typeof l['@_href'] === 'string') return l['@_href'];
    }
  }
  // fall back to the first href we can find
  for (const l of asArray(link)) {
    if (l && typeof l === 'object' && typeof l['@_href'] === 'string') return l['@_href'];
  }
  return null;
}

function textOf(v) {
  if (v == null) return null;
  if (typeof v === 'string') return v.trim() || null;
  if (typeof v === 'number') return String(v);
  if (Array.isArray(v)) return textOf(v[0]);
  if (typeof v === 'object') return textOf(v['#text'] ?? v['@_href'] ?? null);
  return null;
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) {
  const url = process.argv[2];
  if (!url) {
    console.error('usage: node src/sources/rss.js <feed-url>');
    process.exit(1);
  }
  const organizer = { id: 'cli-test', name: 'CLI Test', breeds: ['unknown'], metro: 'unknown', timezone: 'UTC', sources: [] };
  fetchAndParseRss(url, { organizer })
    .then(({ occurrences, itemsSeen }) => {
      console.log(JSON.stringify(occurrences, null, 2));
      console.error(`\n${occurrences.length} event(s) from ${itemsSeen} feed item(s)`);
    })
    .catch((err) => {
      console.error(err.message);
      process.exit(1);
    });
}
