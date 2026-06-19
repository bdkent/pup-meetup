import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadCatalog } from '../src/catalog.js';

async function withTempCatalog(files, fn) {
  const dir = await mkdtemp(join(tmpdir(), 'pup-cat-'));
  try {
    for (const [name, body] of Object.entries(files)) {
      await writeFile(join(dir, name), body);
    }
    return await fn(dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

const VALID = `id: good
name: Good Group
breeds: [shih-tzu]
metro: dc
timezone: America/New_York
sources:
  - type: meetup_ics
    url: https://example.com/events/ical/
`;

test('accepts a valid organizer', async () => {
  await withTempCatalog({ 'good.yml': VALID }, async (dir) => {
    const orgs = await loadCatalog(dir);
    assert.equal(orgs.length, 1);
    assert.equal(orgs[0].id, 'good');
  });
});

test('rejects an organizer missing required fields', async () => {
  await withTempCatalog({ 'bad.yml': 'id: bad\nname: Bad\n' }, async (dir) => {
    await assert.rejects(loadCatalog(dir), /validation failed/i);
  });
});

test('rejects an instagram source without a handle', async () => {
  const ig = `id: ig
name: IG Only
breeds: [shih-tzu]
metro: dc
timezone: America/New_York
sources:
  - type: instagram
`;
  await withTempCatalog({ 'ig.yml': ig }, async (dir) => {
    await assert.rejects(loadCatalog(dir), /validation failed/i);
  });
});

test('rejects duplicate organizer ids across files', async () => {
  await withTempCatalog({ 'a.yml': VALID, 'b.yml': VALID }, async (dir) => {
    await assert.rejects(loadCatalog(dir), /duplicate organizer id/i);
  });
});
