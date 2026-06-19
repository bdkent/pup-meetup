// Ingest orchestrator (scaffold): load the catalog, run each organizer's
// supported sources, and write one JSON file per Occurrence to data/events/.
//
// Stable filename (derived from the occurrence id) makes writes idempotent —
// re-running upserts the same files rather than creating duplicates.
//
// Only meetup_ics is implemented so far; other source types are skipped until
// their parsers land (see work/briefs/dog-meetup-aggregator.md).
//
// CLI:  node src/ingest.js   (also: npm run ingest)

import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadCatalog } from './catalog.js';
import { fetchAndParseMeetupIcs } from './sources/meetup-ics.js';

const EVENTS_DIR = fileURLToPath(new URL('../data/events/', import.meta.url));

const PARSERS = {
  meetup_ics: (src, organizer) => fetchAndParseMeetupIcs(src.url, { organizer }),
  // ics: same shape as meetup_ics — wire up when needed.
};

function safeFilename(id) {
  return id.replace(/[^a-zA-Z0-9._-]/g, '_') + '.json';
}

export async function runIngest({ eventsDir = EVENTS_DIR } = {}) {
  const organizers = await loadCatalog();
  await mkdir(eventsDir, { recursive: true });

  let written = 0;
  let skipped = 0;
  for (const org of organizers) {
    for (const src of org.sources) {
      if (src.enabled === false) continue;
      const parser = PARSERS[src.type];
      if (!parser) {
        skipped++;
        continue; // not implemented yet
      }
      try {
        const occurrences = await parser(src, org);
        for (const occ of occurrences) {
          await writeFile(
            join(eventsDir, safeFilename(occ.id)),
            JSON.stringify(occ, null, 2) + '\n',
          );
          written++;
        }
        console.error(`${org.id}: ${occurrences.length} occurrence(s) from ${src.type}`);
      } catch (err) {
        console.error(`${org.id}: ERROR (${src.type}) ${err.message}`);
      }
    }
  }
  console.error(`\nWrote ${written} occurrence file(s) to ${eventsDir}` +
    (skipped ? ` (${skipped} source(s) skipped — parser not implemented)` : ''));
  return { written, skipped };
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) {
  runIngest().catch((err) => {
    console.error(err.message);
    process.exit(1);
  });
}
