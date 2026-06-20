import { test } from 'node:test';
import assert from 'node:assert/strict';
import { postsToOccurrencesWithVision } from '../src/sources/instagram.js';
import { makeVisionBudget } from '../src/extract/vision-budget.js';

const organizer = { id: 'o1', name: 'Org', breeds: ['shih-tzu'], metro: 'nyc', timezone: 'America/New_York' };
const now = new Date('2026-06-20T00:00:00Z');
const imgPost = (id) => ({ post_id: id, image_urls: [`http://cdn/${id}.jpg`], text: 'chatty caption, no date', permalink: `http://p/${id}`, posted_at: '2026-06-15T00:00:00.000Z' });

function mockFetch(visionObj) {
  return async (url) => (String(url).includes('api.anthropic.com')
    ? { ok: true, status: 200, statusText: 'OK', json: async () => ({ content: [{ type: 'text', text: JSON.stringify(visionObj) }], usage: { input_tokens: 100, output_tokens: 20 } }), text: async () => '' }
    : { ok: true, status: 200, statusText: 'OK', headers: { get: () => 'image/jpeg' }, arrayBuffer: async () => new Uint8Array([1]).buffer });
}

test('image posts use vision when budget + key are available', async () => {
  const budget = makeVisionBudget({}, { now, cap: 5 });
  const occ = await postsToOccurrencesWithVision([imgPost('a')], organizer, {
    now, budget, apiKey: 'k',
    fetchImpl: mockFetch({ is_event: true, title: 'Meetup', date: '2026-09-01', time: '12:00', venue: 'Park', address: null, confidence: 0.9 }),
  });
  assert.equal(occ.length, 1);
  assert.equal(occ[0].extractor, 'vision');
  assert.equal(budget.used(), 1);
});

test('image posts are SKIPPED (not text-guessed) when there is no API key', async () => {
  const occ = await postsToOccurrencesWithVision([imgPost('a')], organizer, { now, apiKey: '', fetchImpl: mockFetch({}) });
  assert.deepEqual(occ, [], 'no junk events from a flyer caption');
});

test('image posts are SKIPPED when the monthly budget is exhausted', async () => {
  const budget = makeVisionBudget({ '2026-06': 5 }, { now, cap: 5 });
  const occ = await postsToOccurrencesWithVision([imgPost('a')], organizer, { now, budget, apiKey: 'k', fetchImpl: mockFetch({}) });
  assert.deepEqual(occ, []);
  assert.equal(budget.used(), 5, 'cap not exceeded');
});
