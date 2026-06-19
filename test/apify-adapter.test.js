import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fetchInstagramPosts, normalizeIgItem, MissingTokenError } from '../src/adapters/apify-instagram.js';

test('normalizeIgItem maps a raw Apify item to the Post shape', () => {
  const p = normalizeIgItem(
    {
      id: '123', shortCode: 'ABC', caption: 'Meetup Saturday!',
      timestamp: '2026-04-01T12:00:00Z', url: 'https://www.instagram.com/p/ABC/',
      displayUrl: 'https://img/x.jpg',
    },
    { organizerId: 'org1', username: 'mason' },
  );
  assert.equal(p.post_id, '123');
  assert.equal(p.organizer_id, 'org1');
  assert.equal(p.platform, 'instagram');
  assert.equal(p.text, 'Meetup Saturday!');
  assert.equal(p.posted_at, '2026-04-01T12:00:00.000Z');
  assert.deepEqual(p.image_urls, ['https://img/x.jpg']);
  assert.equal(p.permalink, 'https://www.instagram.com/p/ABC/');
});

test('normalizeIgItem accepts an epoch-seconds timestamp', () => {
  const p = normalizeIgItem({ id: '1', timestamp: 1764595200 });
  assert.match(p.posted_at, /^20\d\d-/);
});

test('fetchInstagramPosts throws NO_TOKEN without a token', async () => {
  await assert.rejects(
    () => fetchInstagramPosts('mason', { token: '' }),
    (e) => e instanceof MissingTokenError && e.code === 'NO_TOKEN',
  );
});

test('fetchInstagramPosts sends actor input and normalizes the dataset', async () => {
  let captured;
  const fetchImpl = async (url, init) => {
    captured = { url, body: JSON.parse(init.body) };
    return {
      ok: true, status: 200,
      json: async () => [
        { id: '1', shortCode: 'A', caption: 'hi', timestamp: '2026-04-01T00:00:00Z', url: 'https://www.instagram.com/p/A/' },
      ],
    };
  };
  const posts = await fetchInstagramPosts('@mason', { token: 'secret', fetchImpl, maxPosts: 3, organizerId: 'o' });
  assert.equal(posts.length, 1);
  assert.equal(posts[0].organizer_id, 'o');
  assert.match(captured.url, /run-sync-get-dataset-items\?token=secret/);
  assert.deepEqual(captured.body.directUrls, ['https://www.instagram.com/mason/']);
  assert.equal(captured.body.resultsLimit, 3);
});
