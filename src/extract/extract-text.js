// Tier-3 (text path): heuristic extraction from a post's CAPTION using
// natural-language date parsing. No LLM. Returns null if no date is found.
//
// Identity follows the settled model (brief §5): synthesized id =
// hash(organizer_id + date); location is a MUTABLE attribute, not part of the key.
// Low-confidence results get status 'review' so they stay off the live map until
// verified. A vision/LLM extractor can later replace/augment this behind the same
// signature to handle flyer-IMAGE posts (the part heuristics can't read).

import * as chrono from 'chrono-node';
import { createHash } from 'node:crypto';
import { hasEventKeyword } from './classify.js';

const LOCATION_RE =
  /\b(park|esplanade|avenue|ave\.?|street|st\.?|blvd|boulevard|road|rd\.?|plaza|square|field|garden|dog run|trail|beach|address|located at)\b/i;

export function synthId(organizerId, dayIso) {
  return `syn:${createHash('sha1').update(`${organizerId}|${dayIso}`).digest('hex').slice(0, 16)}`;
}

/**
 * @param {import('../types.js').RawPost} post
 * @param {import('../types.js').Organizer} organizer
 * @param {{now?: Date}} [opts]
 * @returns {import('../types.js').Occurrence|null}
 */
export function extractOccurrenceFromPost(post, organizer, { now = new Date() } = {}) {
  const text = post?.text || '';
  const ref = post?.posted_at ? new Date(post.posted_at) : now;
  const results = chrono.parse(text, ref, { forwardDate: true });
  if (!results.length) return null;

  const first = results[0];
  const start = first.start.date();
  if (Number.isNaN(start.getTime())) return null;
  const startIso = start.toISOString();
  const day = startIso.slice(0, 10);

  const hasTime = first.start.isCertain('hour');
  const yearExplicit = /\b20\d{2}\b/.test(first.text || '');
  const location = guessLocation(text);
  const nowIso = now.toISOString();

  let confidence = 0.4;
  if (hasTime) confidence += 0.2;
  if (yearExplicit) confidence += 0.1;
  if (location.name) confidence += 0.25;
  if (hasEventKeyword(text)) confidence += 0.05;
  confidence = Math.min(confidence, 0.95); // a heuristic is never fully certain

  return {
    id: synthId(organizer.id, day),
    organizer_id: organizer.id,
    series_id: null,
    recurrence_label: null,
    title: firstLine(text) || organizer.name,
    start: startIso,
    end: null,
    location,
    breeds: organizer.breeds ?? [],
    sources: [{
      post_url: post.permalink ?? null,
      image: post.image_urls?.[0] ?? null,
      raw_text: text || null,
      posted_at: post.posted_at ?? null,
    }],
    confidence: Number(confidence.toFixed(2)),
    status: confidence >= 0.6 ? 'published' : 'review',
    extracted_at: nowIso,
    updated_at: nowIso,
  };
}

function guessLocation(text) {
  const empty = { name: null, address: null, lat: null, lng: null };
  if (!text) return empty;
  const lines = text.split(/\n|(?<=[.!?])\s+/).map((s) => s.trim()).filter(Boolean);
  const hit = lines.find((l) => LOCATION_RE.test(l) && l.length <= 140);
  if (!hit) return empty;
  const cleaned = hit.replace(/^(at|location|where|venue|join us at|meeting at|meet at|we'?ll meet at)[:\s-]+/i, '').trim();
  return { name: cleaned.split(',')[0].trim() || null, address: cleaned, lat: null, lng: null };
}

function firstLine(text) {
  if (!text) return null;
  const line = text.split('\n').map((s) => s.trim()).find(Boolean);
  if (!line) return null;
  const cleaned = line.replace(/^[^\p{L}\p{N}]+/u, '').trim();
  return (cleaned || line).slice(0, 120);
}
