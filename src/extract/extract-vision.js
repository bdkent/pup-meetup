// Vision extractor: reads a flyer IMAGE with a multimodal model and returns a
// structured Occurrence. This handles what the text heuristic can't — event
// details (date/time/venue) printed on the flyer graphic rather than the caption,
// which the live probe showed is the common case for IG dog-meetup posts.
//
// Design:
//   - Provider is isolated behind callVisionModel() so it can be swapped without
//     touching the pipeline (Anthropic today; GitHub Models / Gemini are drop-in
//     alternatives — see brief §8 on vendor portability).
//   - Network via fetch (no SDK) to keep deps lean. Reads ANTHROPIC_API_KEY.
//   - One call does BOTH classify and extract (is_event + fields), replacing the
//     brittle caption keyword/chrono heuristics for image posts.
//   - PUBLISH-SAFETY GATE: never `published` without an explicit FUTURE date
//     (distinct from the post date) plus a time and decent confidence; otherwise
//     the occurrence is `review` (kept off the live map) or dropped.
//   - Identity reuses synthId(org, day) from the text path, so a text- and a
//     vision-extracted occurrence for the same organizer+day collide (upsert)
//     rather than duplicating.

import { synthId } from './extract-text.js';
import { isPlaceholderLocation } from '../geocode.js';

const API_URL = 'https://api.anthropic.com/v1/messages';
const DEFAULT_MODEL = process.env.VISION_MODEL || 'claude-haiku-4-5'; // cheapest Claude with vision
const ANTHROPIC_VERSION = '2023-06-01';

export class MissingKeyError extends Error {
  constructor(msg) { super(msg); this.name = 'MissingKeyError'; this.code = 'NO_API_KEY'; }
}

// Structured-output schema — forces a parseable object, no free-form prose.
const SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['is_event', 'title', 'date', 'time', 'venue', 'address', 'confidence'],
  properties: {
    is_event: { type: 'boolean', description: 'true ONLY if this announces a specific, dated, in-person dog meetup people can attend (not a recap of a past event, not a generic photo, not a product post)' },
    title: { type: ['string', 'null'], description: 'Short event name, e.g. "NYC Shih Tzu Meetup". Null if not an event.' },
    date: { type: ['string', 'null'], description: 'Event date as YYYY-MM-DD, taken from the flyer/caption — NEVER the day it was posted. If the year is missing, use the next upcoming occurrence. Null if no specific date.' },
    time: { type: ['string', 'null'], description: 'Start time as 24-hour HH:MM, or null if not stated.' },
    venue: { type: ['string', 'null'], description: 'Venue / place name, e.g. "Central Park — East Green Lawn". Null if not stated.' },
    address: { type: ['string', 'null'], description: 'Street address if printed, else null.' },
    confidence: { type: 'number', description: 'Your confidence from 0 to 1 that this is a real, dated, attendable meetup.' },
  },
};

const PROMPT = `You extract dog-meetup events from a social post (image + caption).
Many announcements print the date, time, and location ON THE FLYER IMAGE, not in the caption — read the image carefully.
Set is_event=true ONLY for a specific, dated, in-person meetup people can show up to. A thank-you/recap of a PAST event is NOT an event. A generic dog photo or product post is NOT an event.
For the date, use the event date shown on the flyer or caption — never the day the post was made. If a field is not present, return null; do NOT guess.`;

const clamp01 = (n) => Math.max(0, Math.min(1, Number.isFinite(n) ? n : 0));

// Offset (minutes, +ahead of UTC) of `timeZone` at the given instant.
function tzOffsetMinutes(timeZone, date) {
  try {
    const dtf = new Intl.DateTimeFormat('en-US', {
      timeZone, hour12: false, year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit',
    });
    const p = Object.fromEntries(dtf.formatToParts(date).map((x) => [x.type, x.value]));
    const asUTC = Date.UTC(+p.year, +p.month - 1, +p.day, +(p.hour % 24), +p.minute, +p.second);
    return Math.round((asUTC - date.getTime()) / 60000);
  } catch { return 0; }
}

// Interpret a wall-clock date/time as being in `timeZone` and return the UTC instant.
function zonedToUtc(dateStr, timeStr, timeZone) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr || '')) return null;
  const [y, mo, d] = dateStr.split('-').map(Number);
  const hasTime = /^\d{1,2}:\d{2}$/.test(timeStr || '');
  const [h, mi] = (hasTime ? timeStr : '12:00').split(':').map(Number);
  const guess = Date.UTC(y, mo - 1, d, h, mi);
  if (Number.isNaN(guess)) return null;
  const off = tzOffsetMinutes(timeZone || 'UTC', new Date(guess));
  return new Date(guess - off * 60000);
}

// Download an image and return base64 + media type (Anthropic-side URL fetching
// is unreliable for Instagram's CDN, so we send bytes directly).
export async function fetchImageBase64(url, { fetchImpl = fetch } = {}) {
  const res = await fetchImpl(url);
  if (!res.ok) throw new Error(`image fetch ${res.status} ${res.statusText}`);
  const ct = (res.headers.get('content-type') || '').split(';')[0];
  const mediaType = ct.startsWith('image/') ? ct : (/\.png(\?|$)/i.test(url) ? 'image/png' : 'image/jpeg');
  const buf = Buffer.from(await res.arrayBuffer());
  return { base64: buf.toString('base64'), mediaType };
}

// Low-level: one multimodal call. Returns { parsed, usage, stopReason }.
export async function callVisionModel({ imageBase64, mediaType, caption, apiKey = process.env.ANTHROPIC_API_KEY, fetchImpl = fetch, model = DEFAULT_MODEL }) {
  if (!apiKey) throw new MissingKeyError('ANTHROPIC_API_KEY not set — cannot run vision extraction');
  const body = {
    model,
    max_tokens: 400, // the JSON is tiny; keeps cost down
    output_config: { format: { type: 'json_schema', schema: SCHEMA } },
    messages: [{
      role: 'user',
      content: [
        { type: 'image', source: { type: 'base64', media_type: mediaType, data: imageBase64 } },
        { type: 'text', text: `${PROMPT}\n\nCaption:\n${caption || '(none)'}` },
      ],
    }],
  };
  const res = await fetchImpl(API_URL, {
    method: 'POST',
    headers: { 'x-api-key': apiKey, 'anthropic-version': ANTHROPIC_VERSION, 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const txt = await res.text().catch(() => '');
    throw new Error(`Anthropic API ${res.status} ${res.statusText}: ${txt.slice(0, 300)}`);
  }
  const data = await res.json();
  const textBlock = (data.content || []).find((b) => b.type === 'text');
  let parsed = null;
  try { parsed = textBlock ? JSON.parse(textBlock.text) : null; } catch { parsed = null; }
  return { parsed, usage: data.usage || {}, stopReason: data.stop_reason };
}

/**
 * Build an Occurrence from an already-parsed vision result (pure, no network).
 * Used both right after a vision call AND when re-deriving from the cache, so a
 * change here applies on the next run without re-spending on cached posts.
 * Returns null when the post isn't a future-dated event.
 */
export function buildOccurrenceFromParsed(parsed, post, organizer, { now = new Date() } = {}) {
  if (!parsed || !parsed.is_event || !parsed.date) return null;
  const start = zonedToUtc(parsed.date, parsed.time, organizer.timezone);
  if (!start || start.getTime() < now.getTime()) return null; // safety gate: future only

  const startIso = start.toISOString();
  const day = startIso.slice(0, 10);
  const conf = clamp01(Number(parsed.confidence));
  // "TBD"/"see flyer"/etc. are not real venues — drop them so geocoding doesn't
  // fuzzy-match junk; the home_geo fallback then places an approximate pin.
  const venue = isPlaceholderLocation(parsed.venue) ? null : String(parsed.venue).trim();
  const address = isPlaceholderLocation(parsed.address) ? null : (parsed.address ? String(parsed.address).trim() : null);
  const status = conf >= 0.6 && parsed.time ? 'published' : 'review'; // publish only with time + confidence

  return {
    id: synthId(organizer.id, day),
    organizer_id: organizer.id,
    series_id: null,
    recurrence_label: null,
    title: String(parsed.title || organizer.name || '').trim().slice(0, 140) || organizer.name,
    start: startIso,
    end: null,
    location: { name: venue, address: address || venue, lat: null, lng: null },
    breeds: organizer.breeds ?? [],
    sources: [{ post_url: post.permalink ?? null, image: post.image_urls?.[0] ?? null, raw_text: post.text || null, posted_at: post.posted_at ?? null }],
    confidence: Number(conf.toFixed(2)),
    status,
    extracted_at: now.toISOString(),
    updated_at: now.toISOString(),
    extractor: 'vision',
  };
}

/**
 * High-level: post (with image) -> { occurrence, parsed, usage }. One network
 * call; usage is always returned for budget accounting (occurrence may be null).
 */
export async function extractOccurrenceFromImage(post, organizer, { now = new Date(), apiKey = process.env.ANTHROPIC_API_KEY, fetchImpl = fetch, model } = {}) {
  const imageUrl = post?.image_urls?.[0];
  if (!imageUrl) return { occurrence: null, parsed: null, usage: {} };
  const { base64, mediaType } = await fetchImageBase64(imageUrl, { fetchImpl });
  const { parsed, usage } = await callVisionModel({ imageBase64: base64, mediaType, caption: post.text, apiKey, fetchImpl, model });
  return { occurrence: buildOccurrenceFromParsed(parsed, post, organizer, { now }), parsed, usage };
}
