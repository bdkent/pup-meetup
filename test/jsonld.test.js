import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { extractEventsFromHtml } from '../src/sources/jsonld.js';

const html = await readFile(fileURLToPath(new URL('./fixtures/eventbrite.html', import.meta.url)), 'utf8');
const organizer = {
  id: 'sd-shih-tzu', name: 'San Diego Shih Tzu', breeds: ['shih-tzu'],
  metro: 'san-diego', timezone: 'America/Los_Angeles', sources: [],
};
const now = new Date('2026-06-01T00:00:00Z'); // horizon: Jun 1 .. Dec 1 2026

test('extracts the upcoming Eventbrite event; drops past + non-Event nodes', () => {
  const occ = extractEventsFromHtml(html, { organizer, sourceType: 'eventbrite', now });
  assert.equal(occ.length, 1);
  const o = occ[0];
  assert.equal(o.id, 'eb:1874948785289');
  assert.equal(o.title, 'San Diego Shih Tzu Meetup');
  assert.equal(o.start, '2026-11-01T20:00:00.000Z'); // 13:00-07:00 -> 20:00Z
  assert.equal(o.end, '2026-11-01T22:00:00.000Z');
});

test('maps PostalAddress + geo (no geocoding needed)', () => {
  const o = extractEventsFromHtml(html, { organizer, sourceType: 'eventbrite', now })[0];
  assert.equal(o.location.name, 'Pure Pawsh');
  assert.equal(o.location.address, '123 Dog St, San Diego, CA, 92101');
  assert.equal(o.location.lat, 32.7157);
  assert.equal(o.location.lng, -117.1611);
  assert.deepEqual(o.breeds, ['shih-tzu']);
  assert.equal(o.sources[0].post_url, 'https://www.eventbrite.com/e/san-diego-shih-tzu-meetup-tickets-1874948785289');
});

test('generic page (no eventbrite) gets a jsonld: id and string location', () => {
  const generic = '<script type="application/ld+json">' +
    '{"@type":"Event","name":"Corgi Picnic","startDate":"2026-07-15T17:00:00Z","location":"Dolores Park"}' +
    '</script>';
  const occ = extractEventsFromHtml(generic, { organizer, sourceType: 'jsonld', now });
  assert.equal(occ.length, 1);
  assert.match(occ[0].id, /^jsonld:[0-9a-f]{16}$/);
  assert.equal(occ[0].location.name, 'Dolores Park');
  assert.equal(occ[0].location.lat, null);
});

test('events beyond the 6-month horizon are excluded', () => {
  const far = '<script type="application/ld+json">' +
    '{"@type":"Event","name":"Way Later","startDate":"2027-06-01T17:00:00Z"}</script>';
  assert.equal(extractEventsFromHtml(far, { organizer, sourceType: 'jsonld', now }).length, 0);
});
