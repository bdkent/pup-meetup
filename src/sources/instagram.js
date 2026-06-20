// Instagram source: composes the swappable fetcher (Apify adapter) with the
// classify -> extract pipeline. Live fetching needs APIFY_TOKEN; everything else
// (classify, extract, dedup) is pure and unit-tested without secrets.
//
// To swap vendors, replace fetchInstagramPosts with any fn of the same signature
// (handle -> RawPost[]) — see brief §8.

import { fetchInstagramPosts } from '../adapters/apify-instagram.js';
import { classifyPost } from '../extract/classify.js';
import { extractOccurrenceFromPost } from '../extract/extract-text.js';
import { extractOccurrenceFromImage, buildOccurrenceFromParsed } from '../extract/extract-vision.js';
import { getCursor, filterNewPosts, updateCursor } from '../store.js';

export async function fetchAndExtractInstagram(handle, opts = {}) {
  const { organizer, now = new Date(), token, fetchImpl, maxPosts } = opts;
  const posts = await fetchInstagramPosts(handle, { token, fetchImpl, maxPosts, organizerId: organizer.id });
  return postsToOccurrences(posts, organizer, { now });
}

/**
 * Stateful poll with change-detection: fetch recent posts, process only the ones
 * not seen before, and advance the cursor (marking ALL fetched posts seen). The
 * caller persists `newPosts` to the raw store and saves the mutated `state`.
 * @returns {Promise<{occurrences: import('../types.js').Occurrence[], newPosts: import('../types.js').RawPost[], fetched: number}>}
 */
export async function pollInstagram(handle, opts = {}) {
  const { organizer, state, now = new Date(), token, fetchImpl, maxPosts } = opts;
  const sourceKey = `instagram:${handle}`;
  const cursor = getCursor(state, sourceKey);

  const posts = await fetchInstagramPosts(handle, { token, fetchImpl, maxPosts, organizerId: organizer.id });
  const newPosts = filterNewPosts(posts, cursor);
  const occurrences = postsToOccurrences(newPosts, organizer, { now });

  updateCursor(state, sourceKey, posts, now.toISOString());
  return { occurrences, newPosts, fetched: posts.length };
}

/**
 * Vision-first extraction with text fallback + a monthly budget cap. Image posts
 * go to the vision model (event date/venue usually live on the flyer image, which
 * the caption heuristic can't read); text-only posts, over-budget posts, and
 * vision errors fall back to the caption heuristic. Same-day occurrences merge
 * (higher confidence wins, provenance accumulates).
 *
 * @param {{budget?: {canSpend: () => boolean, record: () => void}, apiKey?: string, fetchImpl?: typeof fetch}} opts
 */
export async function postsToOccurrencesWithVision(posts, organizer, { now = new Date(), budget, cache, apiKey = process.env.ANTHROPIC_API_KEY, fetchImpl } = {}) {
  const hasCache = cache && typeof cache === 'object';
  const byId = new Map();
  const add = (occ) => {
    if (!occ) return;
    const existing = byId.get(occ.id);
    if (!existing) { byId.set(occ.id, occ); return; }
    const [better, other] = occ.confidence >= existing.confidence ? [occ, existing] : [existing, occ];
    better.sources = [...better.sources, ...other.sources];
    byId.set(occ.id, better);
  };

  for (const post of posts) {
    const hasImage = post.image_urls && post.image_urls.length;
    if (hasImage) {
      // Cache hit: rebuild from the stored vision parse — no API call, and the
      // CURRENT extraction code applies (so fixes land without re-spending).
      if (hasCache && post.post_id && Object.prototype.hasOwnProperty.call(cache, post.post_id)) {
        add(buildOccurrenceFromParsed(cache[post.post_id], post, organizer, { now }));
        continue;
      }
      // Miss: flyer posts go to vision ONLY (the caption is unreliable — wrong
      // dates + false positives per the probe). If vision can't run (no key, over
      // budget, or an error) we SKIP rather than guess from the caption.
      if (apiKey && (!budget || budget.canSpend())) {
        try {
          const { occurrence, parsed } = await extractOccurrenceFromImage(post, organizer, { now, apiKey, fetchImpl });
          if (budget) budget.record();
          if (hasCache && post.post_id) cache[post.post_id] = parsed ?? null;
          add(occurrence);
        } catch (err) {
          console.error(`  vision error (${post.permalink || post.post_id}): ${err.message} — skipping (caption unreliable for flyers)`);
        }
      }
      continue;
    }
    // Text-only posts: the caption is all there is — use the heuristic.
    for (const occ of postsToOccurrences([post], organizer, { now })) add(occ);
  }
  return [...byId.values()].sort((a, b) => (a.start < b.start ? -1 : a.start > b.start ? 1 : 0));
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
