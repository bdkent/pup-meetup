// Meetup (and generic) iCalendar source: turns an .ics feed into Occurrences
// per the identity model in work/briefs/dog-meetup-aggregator.md (§5):
//   - Occurrence is the atomic unit (1 instance = 1 map pin).
//   - Recurrence is MATERIALIZED into concrete instances over a 6-month horizon;
//     the website never evaluates an RRULE.
//   - Identity uses the source's native UID:
//       one-off:           id = ics:{UID},                series_id = null
//       recurring instance:id = ics:{UID}:{YYYY-MM-DD},   series_id = ics:{UID}
//   - location/title/time are MUTABLE attributes (not part of identity).
//
// CLI:  node src/sources/meetup-ics.js <ics-url>
//
// NOTE on timezones: node-ical attaches VTIMEZONE data, but RRULE expansion via
// the rrule library computes instance times in UTC. For feeds using TZID the
// wall-clock time may be offset; the DATE used for identity is unaffected in the
// common case. Revisit if precise local times matter for display.

import ical from 'node-ical';
import { fileURLToPath } from 'node:url';

const HORIZON_MONTHS = 6;

/** @returns {{start: Date, end: Date}} */
export function horizonFrom(now = new Date()) {
  const end = new Date(now);
  end.setMonth(end.getMonth() + HORIZON_MONTHS);
  return { start: now, end };
}

/**
 * Parse raw .ics text into Occurrences. Pure + synchronous → easy to unit test.
 * @param {string} icsText
 * @param {{ organizer: import('../types.js').Organizer, now?: Date }} opts
 * @returns {import('../types.js').Occurrence[]}
 */
export function parseMeetupIcs(icsText, { organizer, now = new Date() } = {}) {
  if (!organizer) throw new Error('parseMeetupIcs: organizer is required');
  const parsed = ical.sync.parseICS(icsText);
  const { start: hStart, end: hEnd } = horizonFrom(now);
  const nowIso = now.toISOString();

  /** @type {import('../types.js').Occurrence[]} */
  const occurrences = [];
  for (const component of Object.values(parsed)) {
    if (!component || component.type !== 'VEVENT') continue;
    occurrences.push(...expandEvent(component, { organizer, hStart, hEnd, nowIso }));
  }
  occurrences.sort((a, b) => (a.start < b.start ? -1 : a.start > b.start ? 1 : 0));
  return occurrences;
}

/**
 * Fetch an .ics feed and parse it.
 * @param {string} url
 * @param {{ organizer: import('../types.js').Organizer, now?: Date }} opts
 */
export async function fetchAndParseMeetupIcs(url, opts = {}) {
  const res = await fetch(url, {
    headers: { 'User-Agent': 'pup-meetup/0.1 (+https://github.com/pup-meetup)' },
  });
  if (!res.ok) throw new Error(`Fetch failed (${res.status} ${res.statusText}) for ${url}`);
  return parseMeetupIcs(await res.text(), opts);
}

function expandEvent(ev, { organizer, hStart, hEnd, nowIso }) {
  const description = icalStr(ev.description);
  const base = {
    organizer_id: organizer.id,
    title: (icalStr(ev.summary) || organizer.name || '').trim(),
    location: parseLocation(icalStr(ev.location)),
    breeds: organizer.breeds ?? [],
    confidence: 1.0,
    status: 'published',
    extracted_at: nowIso,
    updated_at: nowIso,
  };
  const sources = [{
    post_url: icalStr(ev.url),
    image: null,
    raw_text: description ? description.trim() : null,
    posted_at: null,
  }];

  const out = [];

  if (ev.rrule) {
    // Recurring: materialize instances within the horizon.
    const durationMs = ev.start && ev.end ? ev.end.getTime() - ev.start.getTime() : null;
    const label = humanizeRRule(ev.rrule);
    let instances = [];
    try {
      instances = ev.rrule.between(hStart, hEnd, true);
    } catch {
      instances = [];
    }
    for (const dt of instances) {
      if (isExcluded(ev, dt)) continue;
      const startIso = dt.toISOString();
      out.push({
        ...base,
        id: `ics:${ev.uid}:${startIso.slice(0, 10)}`,
        series_id: `ics:${ev.uid}`,
        recurrence_label: label,
        start: startIso,
        end: durationMs != null ? new Date(dt.getTime() + durationMs).toISOString() : null,
        sources,
      });
    }
  } else if (ev.start) {
    // One-off: include only if it falls inside the horizon.
    if (ev.start >= hStart && ev.start <= hEnd) {
      out.push({
        ...base,
        id: `ics:${ev.uid}`,
        series_id: null,
        recurrence_label: null,
        start: ev.start.toISOString(),
        end: ev.end ? ev.end.toISOString() : null,
        sources,
      });
    }
  }
  return out;
}

// node-ical returns some properties as plain strings and others (those with
// params, e.g. URL) as { params, val } objects. Flatten both to a string|null.
function icalStr(v) {
  if (v == null) return null;
  if (typeof v === 'string') return v;
  if (typeof v === 'object' && 'val' in v) return v.val == null ? null : String(v.val);
  return String(v);
}

// Meetup LOCATION is typically "Venue Name, Street, City, ST". Split the first
// segment as a display name; keep the full string as the geocodable address.
// NOTE: real Meetup feeds often leave LOCATION EMPTY (venue is only in the
// DESCRIPTION) — so this returns nulls and a later stage must extract/geocode
// the venue (or the map can fall back to the organizer's home_geo).
function parseLocation(raw) {
  if (!raw) return { name: null, address: null, lat: null, lng: null };
  const s = String(raw).trim();
  const comma = s.indexOf(',');
  const name = comma === -1 ? s : s.slice(0, comma).trim();
  return { name, address: s, lat: null, lng: null };
}

function humanizeRRule(rrule) {
  try {
    const t = rrule.toText && rrule.toText();
    return t ? t.charAt(0).toUpperCase() + t.slice(1) : 'Recurring';
  } catch {
    return 'Recurring';
  }
}

function isExcluded(ev, date) {
  if (!ev.exdate) return false;
  const day = date.toISOString().slice(0, 10);
  return Object.values(ev.exdate).some((d) => {
    const ex = d instanceof Date ? d : new Date(d);
    return !Number.isNaN(ex.getTime()) && ex.toISOString().slice(0, 10) === day;
  });
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) {
  const url = process.argv[2];
  if (!url) {
    console.error('usage: node src/sources/meetup-ics.js <ics-url>');
    process.exit(1);
  }
  const organizer = {
    id: 'cli-test', name: 'CLI Test', breeds: ['unknown'], metro: 'unknown', timezone: 'UTC', sources: [],
  };
  fetchAndParseMeetupIcs(url, { organizer })
    .then((occ) => {
      console.log(JSON.stringify(occ, null, 2));
      console.error(`\n${occ.length} occurrence(s) within ${HORIZON_MONTHS}-month horizon`);
    })
    .catch((err) => {
      console.error(err.message);
      process.exit(1);
    });
}
