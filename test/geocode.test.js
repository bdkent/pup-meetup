import { test } from 'node:test';
import assert from 'node:assert/strict';
import { geocodeAddress, enrichOccurrenceLocations, normalizeAddress } from '../src/geocode.js';

const okResponse = (lat, lon) => ({ ok: true, json: async () => [{ lat: String(lat), lon: String(lon) }] });
const emptyResponse = { ok: true, json: async () => [] };

test('normalizeAddress collapses whitespace and lowercases', () => {
  assert.equal(normalizeAddress('  123  Main   St '), '123 main st');
});

test('geocodes an address and caches the result (one fetch only)', async () => {
  const cache = {};
  let calls = 0;
  const fetchImpl = async () => {
    calls++;
    return okResponse(38.9, -77.0);
  };
  const a = await geocodeAddress('123 Main St, Washington, DC', { cache, fetchImpl, skipThrottle: true });
  assert.deepEqual(a, { lat: 38.9, lng: -77.0 });
  const b = await geocodeAddress('123 Main St, Washington, DC', { cache, fetchImpl, skipThrottle: true });
  assert.deepEqual(b, { lat: 38.9, lng: -77.0 });
  assert.equal(calls, 1, 'second lookup served from cache');
});

test('negative-caches a miss', async () => {
  const cache = {};
  let calls = 0;
  const fetchImpl = async () => {
    calls++;
    return emptyResponse;
  };
  assert.equal(await geocodeAddress('nowhere at all', { cache, fetchImpl, skipThrottle: true }), null);
  await geocodeAddress('nowhere at all', { cache, fetchImpl, skipThrottle: true });
  assert.equal(calls, 1, 'miss is cached, not re-queried');
});

test('enrich falls back to organizer home_geo when no address', async () => {
  const occ = [{ id: 'x', location: { name: null, address: null, lat: null, lng: null } }];
  await enrichOccurrenceLocations(occ, {
    organizer: { name: 'DC Group', home_geo: { lat: 38.88, lng: -77.0 } },
    skipThrottle: true,
  });
  assert.equal(occ[0].location.lat, 38.88);
  assert.equal(occ[0].location.lng, -77.0);
  assert.equal(occ[0].location.approx, true);
  assert.equal(occ[0].location.name, 'DC Group');
});

test('enrich geocodes when an address is present (not approx)', async () => {
  const occ = [{ id: 'y', location: { name: 'Park', address: 'Some Park, NYC', lat: null, lng: null } }];
  await enrichOccurrenceLocations(occ, {
    organizer: { home_geo: { lat: 1, lng: 2 } },
    cache: {},
    fetchImpl: async () => okResponse(40.0, -73.0),
    skipThrottle: true,
  });
  assert.equal(occ[0].location.lat, 40.0);
  assert.equal(occ[0].location.approx, false);
});

test('enrich leaves existing coordinates untouched', async () => {
  const occ = [{ id: 'z', location: { name: 'Fixed', address: 'whatever', lat: 10, lng: 20 } }];
  await enrichOccurrenceLocations(occ, {
    organizer: { home_geo: { lat: 0, lng: 0 } },
    fetchImpl: async () => { throw new Error('should not fetch'); },
    skipThrottle: true,
  });
  assert.equal(occ[0].location.lat, 10);
  assert.equal(occ[0].location.approx, false);
});
