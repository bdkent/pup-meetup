// Instagram source: composes the swappable fetcher (Apify adapter) with the
// classify -> extract pipeline. Live fetching needs APIFY_TOKEN; everything else
// (classify, extract, dedup) is pure and unit-tested without secrets.
//
// To swap vendors, replace fetchInstagramPosts with any fn of the same signature
// (handle -> RawPost[]) — see brief §8.

import { fetchInstagramPosts } from '../adapters/apify-instagram.js';
import { classifyPost } from '../extract/classify.js';
import { extractOccurrenceFromPost } from '../extract/extract-text.js';

export async function fetchAndExtractInstagram(handle, opts = {}) {
  const { organizer, now = new Date(), token, fetchImpl, maxPosts } = opts;
  const posts = await fetchInstagramPosts(handle, { token, fetchImpl, maxPosts, organizerId: organizer.id });
  return postsToOccurrences(posts, organizer, { now });
}

/**
 * Pure: posts -> occurrences. Classifies, extracts, and dedups same-day posts
 * (reminders/duplicates) per the identity model's upsert rule.
 * @param {import('../types.js').RawPost[]} posts
 * @param {import('../types.js').Organizer} organizer
 */
export function postsToOccurrences(posts, organizer, { now = new Date() } = {}) {
  const byId = new Map();
  for (const post of posts) {
    if (!classifyPost(post, { now }).isEvent) continue;
    const occ = extractOccurrenceFromPost(post, organizer, { now });
    if (!occ) continue;

    const existing = byId.get(occ.id);
    if (!existing) {
      byId.set(occ.id, occ);
      continue;
    }
    // Same organizer + day => same event. Keep the higher-confidence extraction,
    // accumulate provenance from both posts.
    const [better, other] = occ.confidence >= existing.confidence ? [occ, existing] : [existing, occ];
    better.sources = [...better.sources, ...other.sources];
    byId.set(occ.id, better);
  }
  return [...byId.values()].sort((a, b) => (a.start < b.start ? -1 : a.start > b.start ? 1 : 0));
}
