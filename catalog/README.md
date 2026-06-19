# Catalog

Hand-curated organizers we discover events from. One YAML file per organizer in
[`organizers/`](organizers/), validated against
[`organizer.schema.json`](organizer.schema.json).

This is the **only** human-edited data in the repo. Everything under `data/` is
bot-generated (see the design brief at
`work/briefs/dog-meetup-aggregator.md`).

## Adding an organizer

1. Copy an existing file in `organizers/` (filename = the `id`, kebab-case).
2. Fill in the fields below.
3. Run `npm run validate` to check it.

## Fields

| Field | Required | Notes |
|---|---|---|
| `id` | ✅ | Stable kebab-case slug; match the filename stem. |
| `name` | ✅ | Human-readable name. |
| `breeds` | ✅ | Array of kebab-case breed slugs (e.g. `shih-tzu`). Use `all` for general dog meetups. |
| `metro` | ✅ | Metro-area slug (e.g. `dc`, `san-francisco`). |
| `timezone` | ✅ | IANA tz (e.g. `America/New_York`). Resolves relative dates + normalizes identity. |
| `home_geo` | — | `{ lat, lng }` default coordinates for the organizer's usual area. |
| `poll_interval` | — | `daily` (default) or `weekly`. |
| `sources` | ✅ | One or more sources to poll (below). |

## Source types

Each entry in `sources` has a `type` plus its locator. Set `enabled: false` to
mute a source without deleting it; add free-text `notes` for context.

| `type` | Locator | Status |
|---|---|---|
| `meetup_ics` | `url` (Meetup `…/events/ical/`) | ✅ implemented |
| `ics` | `url` (any iCalendar feed) | ✅ implemented (reuses the `.ics` parser) |
| `eventbrite` | `url` (event or organizer page) | ✅ implemented (schema.org JSON-LD) |
| `rss` | `url` (feed of event pages) | ✅ implemented (follows links → JSON-LD) |
| `facebook_page` | `url` | planned (RSS bridge or scraper) |
| `facebook_group` | `url` (public groups only) | planned (scraper) |
| `instagram` | `handle` | ◑ adapter + classify/extract built; live fetch needs `APIFY_TOKEN` |

### Example

```yaml
id: sf-shih-tzu-meetup
name: San Francisco Shih Tzu Meetup Group
breeds:
  - shih-tzu
metro: san-francisco
timezone: America/Los_Angeles
home_geo:
  lat: 37.7917
  lng: -122.4377
poll_interval: daily
sources:
  - type: meetup_ics
    url: https://www.meetup.com/san-francisco-shihtzu-meetup/events/ical/
```
