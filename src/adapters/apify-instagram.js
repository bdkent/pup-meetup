// Apify adapter for Instagram, behind the portability interface:
//   fetchInstagramPosts(handle, opts) -> normalized Post[]
//
// This is deliberately the ONLY Apify-specific code. A RapidAPI / ScrapingDog /
// DIY fetcher can implement the same signature and drop in (see the design brief
// §8 on vendor portability). The normalized Post shape is the contract:
//   { post_id, organizer_id, platform, posted_at, text, image_urls[], permalink }
//
// The Apify API token is read from APIFY_TOKEN (or passed explicitly). Without a
// token the call throws a NO_TOKEN error so ingest can skip gracefully — no live
// run happens here until a token exists.

const RUN_ENDPOINT = 'https://api.apify.com/v2/acts';
const DEFAULT_ACTOR = 'apify~instagram-scraper'; // official actor; swap via opts.actorId
const UA = 'pup-meetup/0.1 (https://github.com/pup-meetup)';

export class MissingTokenError extends Error {
  constructor(message) {
    super(message);
    this.name = 'MissingTokenError';
    this.code = 'NO_TOKEN';
  }
}

/**
 * @param {string} handle Instagram handle (with or without leading @).
 * @param {{token?:string, actorId?:string, maxPosts?:number, fetchImpl?:typeof fetch, organizerId?:string}} [opts]
 * @returns {Promise<import('../types.js').RawPost[]>}
 */
export async function fetchInstagramPosts(handle, opts = {}) {
  const {
    token = process.env.APIFY_TOKEN,
    actorId = DEFAULT_ACTOR,
    maxPosts = 5,
    fetchImpl = fetch,
    organizerId = null,
  } = opts;

  if (!token) throw new MissingTokenError('APIFY_TOKEN not set — cannot fetch Instagram posts');

  const username = String(handle).replace(/^@/, '').trim();
  const url = `${RUN_ENDPOINT}/${actorId}/run-sync-get-dataset-items?token=${encodeURIComponent(token)}`;
  const input = {
    directUrls: [`https://www.instagram.com/${username}/`],
    resultsType: 'posts',
    resultsLimit: maxPosts,
  };

  const res = await fetchImpl(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'User-Agent': UA },
    body: JSON.stringify(input),
  });
  if (!res.ok) throw new Error(`Apify run failed (${res.status} ${res.statusText}) for @${username}`);

  const items = await res.json();
  return (Array.isArray(items) ? items : []).map((it) => normalizeIgItem(it, { organizerId, username }));
}

// Map a raw Apify Instagram dataset item to our normalized Post. Field names vary
// across actor versions, so we read defensively with fallbacks.
export function normalizeIgItem(item, { organizerId = null, username = null } = {}) {
  const shortCode = item.shortCode ?? item.shortcode ?? item.code ?? null;
  const permalink = item.url ?? (shortCode ? `https://www.instagram.com/p/${shortCode}/` : null);
  const images = [];
  if (typeof item.displayUrl === 'string') images.push(item.displayUrl);
  if (typeof item.imageUrl === 'string') images.push(item.imageUrl);
  if (Array.isArray(item.images)) for (const im of item.images) if (typeof im === 'string') images.push(im);

  return {
    post_id: String(item.id ?? shortCode ?? permalink ?? ''),
    organizer_id: organizerId,
    platform: 'instagram',
    posted_at: normalizeTimestamp(item.timestamp ?? item.taken_at ?? item.createTime ?? null),
    text: (item.caption ?? item.text ?? '').toString(),
    image_urls: [...new Set(images)],
    permalink,
  };
}

function normalizeTimestamp(ts) {
  if (ts == null) return null;
  if (typeof ts === 'number') {
    // seconds vs milliseconds epoch
    const ms = ts < 1e12 ? ts * 1000 : ts;
    const d = new Date(ms);
    return Number.isNaN(d.getTime()) ? null : d.toISOString();
  }
  const d = new Date(ts);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}
