// Ingest orchestrator: load the catalog, run each organizer's sources, geocode,
// and write one JSON file per Occurrence to data/events/.
//
// Two source families:
//   - Stateless FEEDS (meetup_ics/ics/eventbrite/rss): idempotently re-derived
//     each run; no state needed.
//   - Stateful SOCIAL (instagram): change-detection via the durable store — only
//     new posts are processed; raw posts + cursors persist to the `data` branch.
//
// data/events/ is a rebuildable projection (gitignored, regenerated each run).
// data/raw/ + data/state/ are the durable asset (committed to the `data` branch).
//
// CLI:  node src/ingest.js   (also: npm run ingest)

import { mkdir, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadCatalog } from './catalog.js';
import { fetchAndParseMeetupIcs } from './sources/meetup-ics.js';
import { fetchAndExtractJsonLd } from './sources/jsonld.js';
import { fetchAndParseRss } from './sources/rss.js';
import { pollInstagram, postsToOccurrencesWithVision } from './sources/instagram.js';
import { loadCache, saveCache, enrichOccurrenceLocations } from './geocode.js';
import { loadState, saveState, appendRawPosts, loadRawPosts } from './store.js';
import { loadVisionUsage, saveVisionUsage, makeVisionBudget } from './extract/vision-budget.js';
import { loadVisionCache, saveVisionCache } from './extract/vision-cache.js';
import { enrichFeedVenues } from './sources/event-venue.js';

const EVENTS_DIR = fileURLToPath(new URL('../data/events/', import.meta.url));
const GEOCACHE_PATH = fileURLToPath(new URL('../data/geocache.json', import.meta.url));

// Stateless feed parsers: (src, organizer) -> Occurrence[].
const FEED_PARSERS = {
  meetup_ics: (src, organizer) => fetchAndParseMeetupIcs(src.url, { organizer }),
  ics: (src, organizer) => fetchAndParseMeetupIcs(src.url, { organizer }),
  eventbrite: (src, organizer) => fetchAndExtractJsonLd(src.url, { organizer, sourceType: 'eventbrite' }),
  rss: async (src, organizer) => (await fetchAndParseRss(src.url, { organizer })).occurrences,
};

function safeFilename(id) {
  return id.replace(/[^a-zA-Z0-9._-]/g, '_') + '.json';
}

export async function runIngest({ eventsDir = EVENTS_DIR, geocachePath = GEOCACHE_PATH } = {}) {
  const organizers = await loadCatalog();
  // data/events is a rebuildable projection — clear it so each run emits a clean
  // set (feeds are re-derived; Instagram is re-derived from the raw archive). This
  // prevents stale/past occurrences from lingering across runs.
  await rm(eventsDir, { recursive: true, force: true });
  await mkdir(eventsDir, { recursive: true });
  const geocache = await loadCache(geocachePath);
  const now = new Date();

  // Vision budget: hard monthly cap so a bug can't drain the API balance.
  const visionUsage = await loadVisionUsage();
  const visionBudget = makeVisionBudget(visionUsage, { now });
  const visionCache = await loadVisionCache(); // per-post vision results (re-derive for free)
  const venueCache = {}; // in-run cache of event-page venues (dedups recurring series)

  let written = 0;
  let skipped = 0;

  for (const org of organizers) {
    const writeOccurrences = async (occurrences) => {
      await enrichOccurrenceLocations(occurrences, { organizer: org, cache: geocache });
      for (const occ of occurrences) {
        await writeFile(join(eventsDir, safeFilename(occ.id)), JSON.stringify(occ, null, 2) + '\n');
      }
      written += occurrences.length;
    };

    const state = await loadState(org.id);
    let stateDirty = false;

    for (const src of org.sources) {
      if (src.enabled === false) continue;
      try {
        if (src.type === 'instagram') {
          // pollInstagram advances the change-detection cursor and returns the new
          // posts; we re-extract them vision-first (the cheap text occurrences it
          // also returns are ignored in favour of the flyer-reading path).
          const { newPosts, fetched } = await pollInstagram(src.handle, { organizer: org, state, now });
          stateDirty = true;
          await appendRawPosts(org.id, newPosts);
          // Re-derive from the FULL durable raw archive (cache-backed) so events
          // persist across runs and code fixes apply without re-spending vision.
          const archive = await loadRawPosts(org.id);
          const posts = archive.length ? archive : newPosts;
          const occurrences = await postsToOccurrencesWithVision(posts, org, { now, budget: visionBudget, cache: visionCache });
          await writeOccurrences(occurrences);
          console.error(`${org.id}: ${occurrences.length} event(s) from ${posts.length} raw post(s) (${newPosts.length} new, ${fetched} fetched) [instagram, vision ${visionBudget.used()}/${visionBudget.cap}]`);
          continue;
        }

        const parser = FEED_PARSERS[src.type];
        if (!parser) {
          skipped++;
          continue; // unimplemented source type
        }
        const occurrences = await parser(src, org);
        // Feeds like Meetup omit LOCATION from the .ics; pull the venue from the
        // event page's JSON-LD before geocoding.
        if (src.type === 'meetup_ics' || src.type === 'ics') {
          await enrichFeedVenues(occurrences, { cache: venueCache });
        }
        await writeOccurrences(occurrences);
        console.error(`${org.id}: ${occurrences.length} occurrence(s) from ${src.type}`);
      } catch (err) {
        if (err && err.code === 'NO_TOKEN') {
          console.error(`${org.id}: skipped ${src.type} (no APIFY_TOKEN)`);
          skipped++;
        } else {
          console.error(`${org.id}: ERROR (${src.type}) ${err.message}`);
        }
      }
    }

    if (stateDirty) await saveState(state);
  }

  await saveCache(geocachePath, geocache);
  await saveVisionUsage(visionUsage);
  await saveVisionCache(visionCache);
  console.error(`\nWrote ${written} occurrence file(s) to ${eventsDir}` +
    (skipped ? ` (${skipped} source(s) skipped — see notes above)` : ''));
  return { written, skipped };
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) {
  runIngest().catch((err) => {
    console.error(err.message);
    process.exit(1);
  });
}
