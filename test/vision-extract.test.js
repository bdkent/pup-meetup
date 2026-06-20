import { test } from 'node:test';
import assert from 'node:assert/strict';
import { extractOccurrenceFromImage } from '../src/extract/extract-vision.js';

const organizer = { id: 'nyc-test', name: 'NYC Test', breeds: ['shih-tzu'], metro: 'nyc', timezone: 'America/New_York' };
const post = { image_urls: ['http://cdn/img.jpg'], text: 'caption', permalink: 'http://p/1', posted_at: '2026-04-23T05:39:45.000Z' };
const now = new Date('2026-06-20T00:00:00Z');

// Mock fetch: image GET returns bytes; api.anthropic.com POST returns a canned
// structured-output response carrying `visionObj`.
function mockFetch(visionObj) {
  return async (url) => {
    if (String(url).includes('api.anthropic.com')) {
      return {
        ok: true, status: 200, statusText: 'OK',
        json: async () => ({ content: [{ type: 'text', text: JSON.stringify(visionObj) }], usage: { input_tokens: 2000, output_tokens: 150 }, stop_reason: 'end_turn' }),
        text: async () => '',
      };
    }
    return { ok: true, status: 200, statusText: 'OK', headers: { get: () => 'image/jpeg' }, arrayBuffer: async () => new Uint8Array([1, 2, 3]).buffer };
  };
}

test('future-dated event with time + confidence → published, timezone-correct start', async () => {
  const { occurrence } = await extractOccurrenceFromImage(post, organizer, {
    now, apiKey: 'test',
    fetchImpl: mockFetch({ is_event: true, title: 'NYC Shih Tzu Halloween', date: '2026-10-11', time: '13:00', venue: 'Central Park', address: null, confidence: 0.85 }),
  });
  assert.ok(occurrence, 'produced an occurrence');
  assert.equal(occurrence.start, '2026-10-11T17:00:00.000Z', '13:00 EDT → 17:00 UTC');
  assert.equal(occurrence.status, 'published');
  assert.equal(occurrence.location.name, 'Central Park');
  assert.equal(occurrence.extractor, 'vision');
  assert.match(occurrence.id, /^syn:/);
});

test('past date is dropped by the safety gate', async () => {
  const { occurrence } = await extractOccurrenceFromImage(post, organizer, {
    now, apiKey: 'test',
    fetchImpl: mockFetch({ is_event: true, title: 'Old', date: '2026-04-20', time: '13:00', venue: 'X', address: null, confidence: 0.9 }),
  });
  assert.equal(occurrence, null);
});

test('non-event returns no occurrence', async () => {
  const { occurrence } = await extractOccurrenceFromImage(post, organizer, {
    now, apiKey: 'test',
    fetchImpl: mockFetch({ is_event: false, title: null, date: null, time: null, venue: null, address: null, confidence: 0 }),
  });
  assert.equal(occurrence, null);
});

test('future event but no time / low confidence → review, not published', async () => {
  const { occurrence } = await extractOccurrenceFromImage(post, organizer, {
    now, apiKey: 'test',
    fetchImpl: mockFetch({ is_event: true, title: 'Maybe', date: '2026-12-01', time: null, venue: null, address: null, confidence: 0.5 }),
  });
  assert.ok(occurrence);
  assert.equal(occurrence.status, 'review');
});
