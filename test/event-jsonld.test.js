import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renderEventPage } from '../site/render.js';

const now = new Date('2026-06-19T00:00:00Z');
const BASE = {
  id: 'e1', title: 'Shih Tzu Meetup', start: '2026-07-25T18:00:00Z', end: '2026-07-25T21:00:00Z',
  timezone: 'America/Chicago', organizer_id: 'org-x', organizer_name: 'Org X', metro: 'chicago',
  breeds: ['shih-tzu'], sources: [],
};

// Pull the (unescaped) Event JSON-LD object out of a rendered event page.
function jsonLd(html) {
  const m = html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/);
  assert.ok(m, 'event page has an Event JSON-LD block');
  return JSON.parse(m[1]); // JSON.parse natively decodes the < escapes
}

test('event page emits a complete schema.org Event with precise geo when confirmed', () => {
  const ev = { ...BASE, location: { name: 'Yorktown Center', address: 'Lombard, IL', lat: 41.84, lng: -88.01, approx: false } };
  const ld = jsonLd(renderEventPage(ev, '../', { now }));

  assert.equal(ld['@context'], 'https://schema.org');
  assert.equal(ld['@type'], 'Event');
  assert.equal(ld.name, 'Shih Tzu Meetup');
  assert.equal(ld.startDate, '2026-07-25T18:00:00Z');
  assert.equal(ld.endDate, '2026-07-25T21:00:00Z');
  assert.equal(ld.eventAttendanceMode, 'https://schema.org/OfflineEventAttendanceMode');
  assert.equal(ld.location['@type'], 'Place');
  assert.equal(ld.location.name, 'Yorktown Center');
  assert.equal(ld.location.address, 'Lombard, IL');
  assert.equal(ld.location.geo.latitude, 41.84);
  assert.equal(ld.location.geo.longitude, -88.01);
  assert.equal(ld.url, 'https://pup-meetup.com/event/e1.html');
  assert.equal(ld.organizer.name, 'Org X');
  assert.equal(ld.organizer.url, 'https://pup-meetup.com/org/org-x.html');
});

test('approximate location omits precise geo coordinates (never a wrong pin)', () => {
  const ev = { ...BASE, location: { name: 'Near Logan Square', lat: 41.92, lng: -87.70, approx: true } };
  const ld = jsonLd(renderEventPage(ev, '../', { now }));

  assert.equal(ld.location['@type'], 'Place');
  assert.equal(ld.location.name, 'Near Logan Square');
  assert.ok(!ld.location.geo, 'no geo coordinates emitted for an approximate location');
});

test('JSON-LD escapes angle brackets so content cannot break out of the script tag', () => {
  const ev = { ...BASE, title: 'Meetup </script><script>alert(1)</script>', location: { name: 'Park', lat: 1, lng: 2, approx: false } };
  const html = renderEventPage(ev, '../', { now });
  const block = html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)[1];

  assert.doesNotMatch(block, /<\/script>/i, 'no literal </script> inside the JSON-LD');
  assert.match(block, /\\u003c/, 'angle brackets are unicode-escaped');
  // And it still parses back to the real title.
  assert.equal(JSON.parse(block).name, 'Meetup </script><script>alert(1)</script>');
});

test('falls back to the metro name when no venue is known, still without geo', () => {
  const ev = { ...BASE, location: {} };
  const ld = jsonLd(renderEventPage(ev, '../', { now }));
  assert.equal(ld.location.name, 'Chicago');
  assert.ok(!ld.location.geo);
});
