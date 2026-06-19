// Tier-2 of the IG/FB pipeline: cheap, no-API classifier that decides whether a
// post is an event announcement before the (expensive) extraction step runs.
// Keeps extraction cost proportional to events, not posts (brief §6).

import * as chrono from 'chrono-node';

const EVENT_KEYWORDS = [
  'meetup', 'meet up', 'meet-up', 'meet & greet', 'meet and greet', 'playdate', 'play date',
  'playgroup', 'play group', 'join us', 'rsvp', 'gathering', 'get together', 'get-together',
  'social', 'stroll', 'pup crawl', 'yappy hour', 'costume', 'parade', 'picnic', 'walk',
];

export function hasEventKeyword(text) {
  const t = (text || '').toLowerCase();
  return EVENT_KEYWORDS.some((k) => t.includes(k));
}

/**
 * @param {import('../types.js').RawPost} post
 * @param {{now?: Date}} [opts]
 * @returns {{isEvent: boolean, score: number, signals: string[]}}
 */
export function classifyPost(post, { now = new Date() } = {}) {
  const text = post?.text || '';
  const ref = post?.posted_at ? new Date(post.posted_at) : now;
  const signals = [];

  if (chrono.parse(text, ref, { forwardDate: true }).length) signals.push('date');
  if (/\b\d{1,2}(:\d{2})?\s?(a\.?m\.?|p\.?m\.?)\b/i.test(text)) signals.push('time');
  if (hasEventKeyword(text)) signals.push('keyword');

  // Require a concrete date plus at least one corroborating signal.
  const isEvent = signals.includes('date') && (signals.includes('keyword') || signals.includes('time'));
  return { isEvent, score: signals.length, signals };
}
