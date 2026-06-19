// Shared type definitions (JSDoc) for editor support. No runtime exports.

/**
 * @typedef {Object} OrganizerSource
 * @property {'meetup_ics'|'ics'|'eventbrite'|'rss'|'facebook_page'|'facebook_group'|'instagram'} type
 * @property {string} [url]      Locator for feed/page sources.
 * @property {string} [handle]   Account handle for instagram.
 * @property {boolean} [enabled] Defaults to true; set false to skip without deleting.
 * @property {string} [notes]
 */

/**
 * @typedef {Object} Organizer
 * @property {string} id
 * @property {string} name
 * @property {string[]} breeds
 * @property {string} metro
 * @property {string} timezone               IANA tz, e.g. America/New_York.
 * @property {{lat:number,lng:number}} [home_geo]
 * @property {'daily'|'weekly'} [poll_interval]
 * @property {OrganizerSource[]} sources
 */

/**
 * @typedef {Object} OccurrenceLocation
 * @property {string|null} name
 * @property {string|null} address
 * @property {number|null} lat   Filled by the geocoding stage.
 * @property {number|null} lng
 * @property {boolean} [approx]  true when coords are an organizer-area fallback, not the exact venue.
 */

/**
 * @typedef {Object} OccurrenceSource
 * @property {string|null} post_url
 * @property {string|null} image
 * @property {string|null} raw_text
 * @property {string|null} posted_at   ISO 8601, when known (null for feed sources).
 */

/**
 * An OCCURRENCE is the atomic served unit: one dated, located instance = one map pin.
 * Recurring meetups are several occurrences sharing a series_id (materialized at ingest).
 * @typedef {Object} Occurrence
 * @property {string} id                 Native source id where available (e.g. ics:{UID}), else synthesized.
 * @property {string} organizer_id
 * @property {string|null} series_id     Shared across instances of a recurring series; null for one-offs.
 * @property {string|null} recurrence_label  Human label, e.g. "every month on the 4th Saturday".
 * @property {string} title              MUTABLE attribute.
 * @property {string} start              ISO 8601. MUTABLE attribute.
 * @property {string|null} end           ISO 8601 or null. MUTABLE attribute.
 * @property {OccurrenceLocation} location  MUTABLE attribute (location is NOT part of identity).
 * @property {string[]} breeds
 * @property {OccurrenceSource[]} sources    Accumulates provenance on upsert.
 * @property {number} confidence         1.0 for structured feeds; lower for LLM extraction.
 * @property {'published'|'review'|'past'} status
 * @property {string} extracted_at       ISO 8601.
 * @property {string} updated_at         ISO 8601.
 */

/**
 * Normalized post from a social source (the durable raw asset; see brief §4).
 * @typedef {Object} RawPost
 * @property {string} post_id
 * @property {string|null} organizer_id
 * @property {string} platform           e.g. 'instagram'
 * @property {string|null} posted_at     ISO 8601
 * @property {string} text               caption / body
 * @property {string[]} image_urls
 * @property {string|null} permalink
 */

export {};
