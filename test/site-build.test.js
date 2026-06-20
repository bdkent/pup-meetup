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

    // Combo pages are reachable without JS (crawlable) from breed pages and the
    // index browse directory links to the breed/metro pages.
    assert.match(breed, /find\/shih-tzu__dc\.html/, 'breed page links to combo (no-JS path)');
    assert.match(index, /breed\/shih-tzu\.html/, 'index browse links to breed page');
    assert.match(index, /metro\/dc\.html/, 'index browse links to metro page');

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

test('renders an organizer directory so cataloged communities are reachable without events', async () => {
  const out = await mkdtemp(join(tmpdir(), 'pup-site-'));
  try {
    // Non-demo build = real catalog. The LA Shih Tzu orgs are Instagram-only
    // (no parsed events until APIFY_TOKEN), so every assertion below holds
    // regardless of whatever is in data/events locally or in CI.
    await buildSite({ demo: false, now, outDir: out });

    // A metro/breed/combo page exists for a city that has cataloged communities
    // but (likely) no events — otherwise the index navigator would 404.
    assert.ok(await exists(join(out, 'metro/los-angeles.html')), 'metro page for event-less city');
    assert.ok(await exists(join(out, 'org/la-little-lion-social-club.html')), 'org page for event-less org');
    assert.ok(await exists(join(out, 'find/shih-tzu__los-angeles.html')), 'combo page from catalog pair');

    // The metro page lists the community, links out to its Instagram, and is
    // still zero-JS.
    const la = await readFile(join(out, 'metro/los-angeles.html'), 'utf8');
    assert.match(la, /Little Lion Social Club LA/);
    assert.match(la, /instagram\.com\/littlelionsocialla/);
    assert.match(la, /No dates yet/, 'event-less org shows a follow CTA');
    assert.doesNotMatch(la, /<script/i, 'directory pages stay zero-JS');

    // The community directory lives on its own /organizers page, linked from the
    // top nav (it used to be buried at the bottom of the index).
    assert.ok(await exists(join(out, 'organizers.html')), 'organizers page');
    const orgs = await readFile(join(out, 'organizers.html'), 'utf8');
    assert.match(orgs, /Communities we're tracking/);
    assert.match(orgs, /org\/la-little-lion-social-club\.html/);
    assert.match(orgs, /get-listed\.html/, 'organizers page CTAs to get-listed');

    // The index no longer carries the directory, but links to it from the nav,
    // and the LA option is still selectable even with no LA events.
    const index = await readFile(join(out, 'index.html'), 'utf8');
    assert.doesNotMatch(index, /Communities we're tracking/, 'directory moved off the index');
    assert.match(index, /href="organizers\.html"/, 'index nav links to organizers');
    assert.match(index, /href="about\.html"/, 'index nav links to about');
    assert.match(index, /<option value="los-angeles">/, 'event-less metro is in the picker');
  } finally {
    await rm(out, { recursive: true, force: true });
  }
});

test('emits About + Get-listed pages, reachable from the nav, and zero-JS', async () => {
  const out = await mkdtemp(join(tmpdir(), 'pup-site-'));
  try {
    await buildSite({ demo: false, now, outDir: out });

    assert.ok(await exists(join(out, 'about.html')), 'about page');
    assert.ok(await exists(join(out, 'get-listed.html')), 'get-listed page');

    const about = await readFile(join(out, 'about.html'), 'utf8');
    assert.match(about, /About pup-meetup/);
    assert.match(about, /always confirm/i, 'about repeats the confirm-at-source safety message');
    assert.doesNotMatch(about, /<script/i, 'static pages stay zero-JS');

    const listed = await readFile(join(out, 'get-listed.html'), 'utf8');
    assert.match(listed, /Get your community listed/);
    assert.match(listed, /github\.com\/bdkent\/pup-meetup\/issues/, 'links to a submission channel');
    assert.doesNotMatch(listed, /<script/i);

    // Every page carries the same nav (check a deep subpage uses ../ links).
    const breed = await readFile(join(out, 'breed/shih-tzu.html'), 'utf8');
    assert.match(breed, /href="\.\.\/organizers\.html"/, 'subpage nav links up to organizers');
    assert.match(breed, /href="\.\.\/get-listed\.html"/, 'subpage nav links up to get-listed');
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
