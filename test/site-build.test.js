import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, readFile, access } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildSite } from '../site/build.js';

const exists = (p) => access(p).then(() => true, () => false);
const now = new Date('2026-06-19T00:00:00Z');

test('builds the multi-page site from demo data with cross-linked pages', async () => {
  const out = await mkdtemp(join(tmpdir(), 'pup-site-'));
  try {
    const res = await buildSite({ demo: true, now, outDir: out });
    assert.ok(res.count >= 10, 'has demo events');
    assert.ok(res.pages > 10, 'emitted many pages');

    // Page types exist (demo has DC Shih Tzu events).
    assert.ok(await exists(join(out, 'index.html')), 'index');
    assert.ok(await exists(join(out, 'breed/shih-tzu.html')), 'breed page');
    assert.ok(await exists(join(out, 'metro/dc.html')), 'metro page');
    assert.ok(await exists(join(out, 'find/shih-tzu__dc.html')), 'combo page');

    // Index ships the map (Leaflet) and embeds the breed→metro pairs the
    // navigator uses to build combo URLs at runtime.
    const index = await readFile(join(out, 'index.html'), 'utf8');
    assert.match(index, /leaflet@1\.9\.4\/dist\/leaflet\.js/);
    assert.match(index, /Find meetups/);
    assert.match(index, /"shih-tzu":\[[^\]]*"dc"/);

    // A subpage is zero-JS: no leaflet, no <script> at all.
    const breed = await readFile(join(out, 'breed/shih-tzu.html'), 'utf8');
    assert.doesNotMatch(breed, /leaflet/i, 'no leaflet on subpage');
    assert.doesNotMatch(breed, /<script/i, 'no script on subpage');
    assert.match(breed, /Open in Maps|📍 map/);

    // An event page + its .ics exist.
    const evHref = index.match(/event\/([^"]+)\.html/);
    assert.ok(evHref, 'index links to an event page');
    assert.ok(await exists(join(out, `event/${evHref[1]}.html`)), 'event page');
    assert.ok(await exists(join(out, `event/${evHref[1]}.ics`)), 'event .ics');
    const ics = await readFile(join(out, `event/${evHref[1]}.ics`), 'utf8');
    assert.match(ics, /BEGIN:VCALENDAR[\s\S]*BEGIN:VEVENT[\s\S]*DTSTART:/);
  } finally {
    await rm(out, { recursive: true, force: true });
  }
});

test('combo pages are generated only for breed×metro pairs that exist', async () => {
  const out = await mkdtemp(join(tmpdir(), 'pup-site-'));
  try {
    await buildSite({ demo: true, now, outDir: out });
    // Demo has no Boston corgi event, so that combo must not exist.
    assert.equal(await exists(join(out, 'find/corgi__boston.html')), false);
  } finally {
    await rm(out, { recursive: true, force: true });
  }
});
