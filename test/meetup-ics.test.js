import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { parseMeetupIcs } from '../src/sources/meetup-ics.js';

const fixture = await readFile(
  fileURLToPath(new URL('./fixtures/sample.ics', import.meta.url)),
  'utf8',
);

const organizer = {
  id: 'sf-shih-tzu-meetup',
  name: 'SF Shih Tzu',
  breeds: ['shih-tzu'],
  metro: 'san-francisco',
  timezone: 'America/Los_Angeles',
  sources: [],
};

// Fixed reference date → deterministic 6-month horizon: 2026-01-01 .. 2026-07-01.
// Recurring 4th-Saturday instances in range: Jan 24, Feb 28, Mar 28, Apr 25,
// May 23, Jun 27 (6). One-off: May 12 (1). Total = 7.
const now = new Date('2026-01-01T00:00:00Z');

test('expands recurring + one-off within the 6-month horizon', () => {
  const occ = parseMeetupIcs(fixture, { organizer, now });
  assert.equal(occ.length, 7);
});

test('recurring instances share a series_id with unique dated ids', () => {
  const occ = parseMeetupIcs(fixture, { organizer, now });
  const recurring = occ.filter((o) => o.series_id === 'ics:event-monthly@meetup.com');
  assert.equal(recurring.length, 6);
  assert.equal(new Set(recurring.map((o) => o.id)).size, 6);
  assert.ok(recurring.every((o) => /^ics:event-monthly@meetup\.com:\d{4}-\d{2}-\d{2}$/.test(o.id)));
  assert.ok(recurring.every((o) => o.recurrence_label && o.recurrence_label.length > 0));
});

test('one-off uses native UID, null series_id, no recurrence label', () => {
  const occ = parseMeetupIcs(fixture, { organizer, now });
  const oneoff = occ.find((o) => o.id === 'ics:event-oneoff@meetup.com');
  assert.ok(oneoff, 'one-off occurrence present');
  assert.equal(oneoff.series_id, null);
  assert.equal(oneoff.recurrence_label, null);
});

test('maps location, inherits breeds, marks structured source high-confidence', () => {
  const occ = parseMeetupIcs(fixture, { organizer, now });
  const o = occ[0];
  assert.deepEqual(o.breeds, ['shih-tzu']);
  assert.equal(o.confidence, 1);
  assert.equal(o.status, 'published');
  assert.equal(o.location.name, 'Alta Plaza Park');
  assert.match(o.location.address, /San Francisco, CA$/);
  assert.equal(o.location.lat, null); // geocoded by a later stage
});

test('excludes occurrences outside the horizon', () => {
  const occ = parseMeetupIcs(fixture, { organizer, now });
  // Jul 25 recurring instance and any later date must be absent.
  assert.ok(occ.every((o) => o.start <= '2026-07-01'));
});

test('end time carries the event duration for each instance', () => {
  const occ = parseMeetupIcs(fixture, { organizer, now });
  const o = occ.find((x) => x.series_id);
  const ms = new Date(o.end) - new Date(o.start);
  assert.equal(ms, 60 * 60 * 1000); // 1 hour
});
