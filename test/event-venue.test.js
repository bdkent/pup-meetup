import { test } from 'node:test';
import assert from 'node:assert/strict';
import { extractPlaceFromHtml } from '../src/sources/event-venue.js';

// Shaped like a real Meetup event page's JSON-LD (venue in the page, not the .ics).
const sfHtml = `<html><head>
<script type="application/ld+json">${JSON.stringify({
  '@context': 'https://schema.org', '@type': 'Event', name: 'Monthly Meetup',
  location: { '@type': 'Place', name: 'Alta Plaza Park', address: { '@type': 'PostalAddress', streetAddress: 'Scott St & Jackson St, San Francisco, CA', addressLocality: 'San Francisco', addressRegion: 'CA' } },
})}</script></head><body></body></html>`;

test('extractPlaceFromHtml pulls venue name + address from JSON-LD', () => {
  const p = extractPlaceFromHtml(sfHtml);
  assert.ok(p);
  assert.equal(p.name, 'Alta Plaza Park');
  assert.match(p.address, /Scott St & Jackson St/);
  assert.equal(p.lat, null); // no geo in this block — geocoder fills it later
});

test('extractPlaceFromHtml returns null when there is no JSON-LD place', () => {
  assert.equal(extractPlaceFromHtml('<html><body>no structured data</body></html>'), null);
});

test('extractPlaceFromHtml reads geo coordinates when present', () => {
  const h = `<script type="application/ld+json">${JSON.stringify({ '@type': 'Event', location: { '@type': 'Place', name: 'X', geo: { '@type': 'GeoCoordinates', latitude: 37.79, longitude: -122.43 } } })}</script>`;
  const p = extractPlaceFromHtml(h);
  assert.equal(p.lat, 37.79);
  assert.equal(p.lng, -122.43);
});
