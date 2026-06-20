import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renderIndexPage } from '../site/render.js';

const now = new Date('2026-06-19T00:00:00Z');

// Pull the embedded map-points array out of the index HTML and JSON-parse it.
function mapPoints(html) {
  const m = html.match(/var pts=(\[[\s\S]*?\]);var map=L\.map\('map'\)/);
  assert.ok(m, 'index embeds the map points array');
  return JSON.parse(m[1]);
}

const ev = (id, days, title, loc) => ({
  id, title, start: new Date(now.getTime() + days * 86400000).toISOString(),
  timezone: 'America/Los_Angeles', organizer_id: 'sf-shih-tzu-meetup', organizer_name: 'SF Shih Tzu',
  metro: 'san-francisco', breeds: ['shih-tzu'], location: { ...loc },
});

// The bug: a monthly meetup recurs at one address, so markers stack. Events are
// sorted soonest-first, so the farthest-out marker ends up on top — a click
// shows the most distant date and hides the sooner ones. The fix collapses them
// into one pin whose popup lists every date, soonest first.
test('same-venue events collapse into one map pin, soonest date first', () => {
  const loc = { name: 'Alta Plaza Park', address: '1 Steiner St', lat: 37.7913, lng: -122.4377, approx: false };
  const events = [ev('sf-jul', 9, 'July meetup', loc), ev('sf-aug', 60, 'August meetup', loc)];
  const pts = mapPoints(renderIndexPage(events, { now }));

  assert.equal(pts.length, 1, 'two events at one venue → exactly one pin');
  const { popup } = pts[0];
  assert.match(popup, /2 upcoming meetups here/);
  assert.match(popup, /event\/sf-jul\.html/, 'soonest date is in the popup');
  assert.match(popup, /event\/sf-aug\.html/, 'later date is in the popup');
  assert.ok(popup.indexOf('sf-jul') < popup.indexOf('sf-aug'), 'soonest date listed first');
});

test('events at different venues stay as separate pins', () => {
  const events = [
    ev('a', 7, 'A', { name: 'Park A', lat: 37.79, lng: -122.43, approx: false }),
    ev('b', 8, 'B', { name: 'Park B', lat: 37.76, lng: -122.41, approx: false }),
  ];
  assert.equal(mapPoints(renderIndexPage(events, { now })).length, 2, 'distinct venues → two pins');
});

// A single event keeps the original popup shape (title bold, then date, venue).
test('a lone event renders the classic single-event popup', () => {
  const events = [ev('solo', 5, 'Solo meetup', { name: 'Dolores Park', lat: 37.7596, lng: -122.4269, approx: false })];
  const pts = mapPoints(renderIndexPage(events, { now }));
  assert.equal(pts.length, 1);
  assert.match(pts[0].popup, /<b>Solo meetup<\/b>/);
  assert.doesNotMatch(pts[0].popup, /upcoming meetups here/, 'no group header for a single event');
});
