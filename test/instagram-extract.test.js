import { test } from 'node:test';
import assert from 'node:assert/strict';
import { classifyPost } from '../src/extract/classify.js';
import { extractOccurrenceFromPost } from '../src/extract/extract-text.js';
import { postsToOccurrences, pollInstagram } from '../src/sources/instagram.js';

const organizer = {
  id: 'nyc-shih-tzu-meetup', name: 'NYC Shih Tzu Meetup', breeds: ['shih-tzu'],
  metro: 'nyc', timezone: 'America/New_York', sources: [],
};

const NYC_CAPTION = `📣 IMPORTANT ANNOUNCEMENT – Shih Tzu Meetup, Sunday April 19, 2026 at 1PM!
Join us at The East River Esplanade, entrance at York Avenue & East 63rd Street.
Group Photo at 2:30 PM. Subway accessible; nearby parking available.`;

const post = (text, extra = {}) => ({
  post_id: 'p', organizer_id: organizer.id, platform: 'instagram',
  posted_at: '2026-03-15T12:00:00Z', text, image_urls: [],
  permalink: 'https://www.instagram.com/p/X/', ...extra,
});

test('classifier flags an event post', () => {
  assert.equal(classifyPost(post(NYC_CAPTION)).isEvent, true);
});

test('classifier ignores a non-event post', () => {
  assert.equal(classifyPost(post('Look at this cute pup! 🐶 #shihtzu')).isEvent, false);
});

test('classifier needs more than a bare date', () => {
  assert.equal(classifyPost(post('Throwback to April 19, 2025 😍')).isEvent, false);
});

test('extracts an occurrence from caption text (date + venue)', () => {
  const o = extractOccurrenceFromPost(post(NYC_CAPTION), organizer);
  assert.ok(o);
  assert.equal(o.start.slice(0, 10), '2026-04-19');
  assert.match(o.id, /^syn:[0-9a-f]{16}$/);
  assert.equal(o.status, 'published');
  assert.ok(o.confidence >= 0.6);
  assert.match(o.location.name, /Esplanade/);
  assert.deepEqual(o.breeds, ['shih-tzu']);
});

test('resolves a relative date forward from the post date', () => {
  const o = extractOccurrenceFromPost(
    post('Shih Tzu playdate this Saturday at 11am at Meridian Hill Park!', { posted_at: '2026-06-17T12:00:00Z' }),
    organizer,
  );
  assert.equal(o.start.slice(0, 10), '2026-06-20'); // Saturday after Wed Jun 17
});

test('returns null when no date is present', () => {
  assert.equal(extractOccurrenceFromPost(post('Best dog ever 🐾'), organizer), null);
});

test('postsToOccurrences dedups same-day posts and merges provenance', () => {
  const a = post(NYC_CAPTION, { permalink: 'https://www.instagram.com/p/A/' });
  const b = post('Reminder! Shih Tzu Meetup Sunday April 19, 2026 at 1PM at The Esplanade.', {
    permalink: 'https://www.instagram.com/p/B/',
  });
  const occ = postsToOccurrences([a, b], organizer);
  assert.equal(occ.length, 1);
  assert.equal(occ[0].sources.length, 2);
});

test('pollInstagram processes only new posts and advances the cursor', async () => {
  const state = { organizer_id: organizer.id, sources: { 'instagram:mason': { last_polled: null, seen_ids: ['old1'] } } };
  const fetchImpl = async () => ({
    ok: true, status: 200,
    json: async () => [
      { id: 'old1', caption: 'Shih Tzu Meetup Sunday April 19, 2026 at 1PM at The Park', timestamp: '2026-03-10T00:00:00Z', url: 'u/old1' },
      { id: 'new1', caption: 'Shih Tzu Meetup Sunday April 26, 2026 at 1PM at The Park', timestamp: '2026-03-12T00:00:00Z', url: 'u/new1' },
    ],
  });
  const { occurrences, newPosts, fetched } = await pollInstagram('mason', {
    organizer, state, token: 't', fetchImpl, now: new Date('2026-03-15T00:00:00Z'),
  });
  assert.equal(fetched, 2);
  assert.equal(newPosts.length, 1);
  assert.equal(newPosts[0].post_id, 'new1');
  assert.equal(occurrences.length, 1);
  assert.equal(occurrences[0].start.slice(0, 10), '2026-04-26');
  const seen = state.sources['instagram:mason'].seen_ids;
  assert.ok(seen.includes('old1') && seen.includes('new1'));
});
