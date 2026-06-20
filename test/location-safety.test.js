import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isPlaceholderLocation, geocodeAddress, enrichOccurrenceLocations } from '../src/geocode.js';
import { buildOccurrenceFromParsed } from '../src/extract/extract-vision.js';

test('isPlaceholderLocation flags junk, accepts real addresses', () => {
  for (const j of ['TBD', 'tba', 'N/A', 'to be announced', 'see flyer', 'DM for location', '', '??']) {
    assert.equal(isPlaceholderLocation(j), true, `placeholder: ${j}`);
  }
  for (const r of ['Scott St & Jackson St, San Francisco, CA', 'Central Park, New York']) {
    assert.equal(isPlaceholderLocation(r), false, `real: ${r}`);
  }
});

test('geocodeAddress never queries a placeholder (prevents the "TBD → Turkey" bug)', async () => {
  let called = false;
  const fetchImpl = async () => { called = true; return { ok: true, json: async () => [] }; };
  const r = await geocodeAddress('TBD', { cache: {}, fetchImpl, skipThrottle: true });
  assert.equal(r, null);
  assert.equal(called, false, 'did not hit the geocoder for a placeholder');
});

test('a TBD venue becomes an approximate region pin, never a wrong precise one', async () => {
  const organizer = { id: 'nyc', name: 'NYC Shih Tzu', breeds: ['shih-tzu'], timezone: 'America/New_York', home_geo: { lat: 40.76, lng: -73.96 } };
  const occ = buildOccurrenceFromParsed(
    { is_event: true, title: 'Meetup', date: '2026-10-11', time: '13:00', venue: 'TBD', address: null, confidence: 0.9 },
    { image_urls: ['x'], permalink: 'p', posted_at: 'z' }, organizer, { now: new Date('2026-06-20T00:00:00Z') },
  );
  assert.equal(occ.location.name, null, 'TBD dropped, not used as a venue');
  assert.equal(occ.location.address, null);

  await enrichOccurrenceLocations([occ], { organizer, cache: {}, skipThrottle: true });
  assert.equal(occ.location.lat, 40.76);
  assert.equal(occ.location.approx, true, 'flagged approximate so the map shows a region, not a marker');
});
