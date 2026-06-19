import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseFeedItems, fetchAndParseRss } from '../src/sources/rss.js';

const organizer = {
  id: 'dog-events', name: 'Dog Events', breeds: ['shih-tzu'],
  metro: 'nyc', timezone: 'America/New_York', sources: [],
};
const now = new Date('2026-06-01T00:00:00Z');

const FEED_XML = `<?xml version="1.0"?>
<rss version="2.0"><channel><title>Dog Events</title>
  <item><title>SD Shih Tzu</title><link>https://ex.com/event1</link><pubDate>Mon, 01 Jun 2026 00:00:00 GMT</pubDate></item>
  <item><title>Corgi Picnic</title><link>https://ex.com/event2</link><pubDate>Mon, 01 Jun 2026 00:00:00 GMT</pubDate></item>
</channel></rss>`;

const EVENT1 = '<script type="application/ld+json">' +
  '{"@type":"Event","name":"Shih Tzu Stroll","startDate":"2026-09-10T15:00:00Z","location":"Central Park"}</script>';
const EVENT2 = '<script type="application/ld+json">' +
  '{"@type":"Event","name":"Corgi Picnic","startDate":"2026-08-05T15:00:00Z","location":"Prospect Park"}</script>';

function stubFetch(pages) {
  return async (url) => {
    const body = pages[url];
    if (body == null) return { ok: false, status: 404, statusText: 'Not Found' };
    return { ok: true, status: 200, text: async () => body };
  };
}

test('parseFeedItems reads RSS items (title + link)', () => {
  const items = parseFeedItems(FEED_XML);
  assert.equal(items.length, 2);
  assert.equal(items[0].link, 'https://ex.com/event1');
  assert.equal(items[1].title, 'Corgi Picnic');
});

test('parseFeedItems reads Atom entries', () => {
  const atom = `<?xml version="1.0"?>
    <feed xmlns="http://www.w3.org/2005/Atom"><title>F</title>
      <entry><title>A</title><link rel="alternate" href="https://ex.com/a"/></entry>
    </feed>`;
  const items = parseFeedItems(atom);
  assert.equal(items.length, 1);
  assert.equal(items[0].link, 'https://ex.com/a');
});

test('follows item links and extracts JSON-LD events (sorted, deduped)', async () => {
  const fetchImpl = stubFetch({
    'https://feed.test/rss': FEED_XML,
    'https://ex.com/event1': EVENT1,
    'https://ex.com/event2': EVENT2,
  });
  const { occurrences, itemsSeen } = await fetchAndParseRss('https://feed.test/rss', { organizer, now, fetchImpl });
  assert.equal(itemsSeen, 2);
  assert.equal(occurrences.length, 2);
  assert.equal(occurrences[0].title, 'Corgi Picnic'); // Aug 5 sorts before Sep 10
  assert.equal(occurrences[1].title, 'Shih Tzu Stroll');
  assert.deepEqual(occurrences[0].breeds, ['shih-tzu']);
});

test('skips items whose pages have no event markup', async () => {
  const fetchImpl = stubFetch({
    'https://feed.test/rss': FEED_XML,
    'https://ex.com/event1': '<html>no structured data here</html>',
    'https://ex.com/event2': EVENT2,
  });
  const { occurrences } = await fetchAndParseRss('https://feed.test/rss', { organizer, now, fetchImpl });
  assert.equal(occurrences.length, 1);
  assert.equal(occurrences[0].title, 'Corgi Picnic');
});
