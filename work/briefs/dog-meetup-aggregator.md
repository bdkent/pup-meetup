# Brief: Dog Meetup Aggregator — Design & Architecture

**Status:** Design / not yet implemented
**Created:** 2026-06-19
**Owner context:** DC metro, owns a Shih Tzu, wants to find local breed meetups.

---

## 1. Goal

Build a platform that **discovers and aggregates breed-specific dog meetups** that are
currently scattered across social platforms (Instagram, Facebook, Meetup, Eventbrite,
etc.). Today this info is impossible to find holistically — you have to randomly search a
breed or metro area across many platforms.

End product:
- A **static website** to search upcoming meetups by **breed** and **location**.
- A **homepage map** showing all upcoming meetups.
- Runs **GitHub-native** where possible (data-as-code, GitHub Actions, GitHub Pages).

---

## 2. Hard constraints (decisions already made — do not re-litigate)

These were settled during design discussion. They rule out otherwise-obvious approaches:

- **Fully automated discovery.** No relying on organizers adopting our platform, no manual
  event entry by us, and no PRs/JSON authoring by organizers (they are non-technical).
  → Submission-first and manual-curation-of-events models are **non-starters.**
- **The catalog of *organizers* is hand-curated by us** — that is acceptable (it's a small,
  slow-changing list, edited once per organizer, not per-event).
- **GitHub-native + cheap.** Prefer running off GitHub; minimize/avoid recurring cost.
- **No standardized data format from sources.** Many event details live in a static flyer
  *image* OR in free-text post captions. Extraction must handle both.

---

## 3. Research findings (empirical, from web recon on 2026-06-19)

We searched "Shih Tzu meetup" across platforms and fetched real pages to test viability.

**What's discoverable & accessible without login:**
- **Meetup.com** — fully public; clean event pages **and a per-group `.ics` feed** that
  returned 10 future (incl. recurring) events with dates/times. No login, no LLM needed.
- **Eventbrite** — public, structured event pages.
- **Breed clubs** (e.g. American Shih Tzu Club) — public, with **RSS + Google Calendar**.
- **Niche city dog-event calendars** (e.g. nycdogevents.com) — community calendars that
  **export iCal/Google** → "aggregate the aggregators" for free.
- **Instagram & Facebook public posts** — single posts *were* fetchable in our test, and
  crucially **event details were in the caption TEXT**, not only the flyer image. (Caveat:
  a single fetch succeeding is the optimistic case; see §6 on scale reliability.)

**Key strategic findings:**
- **Meetup is effectively dead for this niche.** Total of 3 Shih Tzu groups / ~1,400 members
  platform-wide; the DC-area group had 31 members and **zero** upcoming events. Don't build
  on it — but ingest it anyway (free, trivial).
- **The community's real energy is on Instagram + Facebook**, organized by individual
  influential dog accounts (e.g. `masontheshihtzu1`, `enzoistheshiht`) who cross-promote via
  hashtags (`#shihtzugram`, `#nycshihtzumeetup`). **These accounts ARE the organizers now.**
  → The organizer catalog should be centered on **IG handles + FB groups/pages**, with
    Meetup/Eventbrite/ICS as free bonus sources.
- **Tension to accept:** best *data quality* is in the free structured feeds; best *content*
  (the vibrant meetups) is in flaky IG/FB. A free-feeds-only product would be reliable but
  sleepy. The IG/FB long tail is where the value is.
- **Private Facebook groups are unreachable** (no API, no legit scraping without membership).
  Public FB groups ARE scrapable without login. Treat private groups as a known coverage gap.
- **Infrequency is a major advantage.** Even 1 event/month per organizer is a lot, so polling
  can be daily-or-weekly and heavily staggered → tiny volume, near-invisible, cheap.

---

## 4. Architecture

### Organizing principle: decouple **acquisition** from **interpretation**

- **Acquisition** (polling IG/FB) is the *precious, risky, rate-limited* step — must run off
  datacenter IPs, can get blocked, cannot be replayed.
- **Interpretation** (classify → extract → geocode) is *cheap, pure, and re-runnable*.

Keep them separate so the risky part has a tiny footprint, and so improving the extraction
prompt means re-running over stored raw data **for free, without re-polling anyone.**
**Raw posts are the durable asset; events are a derived projection you can rebuild anytime.**

### Three-stage pipeline

```
[1] ACQUIRE   off-GitHub IP problem, staggered cron, stateful cursor
    catalog ──► poll ONE organizer ──► raw posts (text + image URLs + permalink + posted_at)
    commits: data/raw/ + data/state/ cursor  ──push──► repo

[2] INTERPRET  GitHub Action, triggered on data/raw/ change, incremental + idempotent
    raw post ──► classify (is it an event? y/n) ──► extract (LLM/vision) ──► geocode
            ──► data/events/*.json   (only processes posts with no existing event; keyed by post id)

[3] PUBLISH    GitHub Action, triggered on data/events/ change
    events + catalog ──► static site (breed/location search + map) ──► GitHub Pages
```

**Where each runs:**
- **Only Stage 1 has the datacenter-IP problem.** If we use a scraping *provider* (see §5),
  the provider supplies the residential IP, so even Stage 1 can run inside a GitHub Action —
  making the whole system GitHub-native. A DIY fetcher would instead need an off-GitHub
  residential box (home machine).
- Stages 2 & 3 are ordinary GitHub Actions.

**Repo layout (separate stores by WHO writes them — don't let the bot churn human files):**
```
/catalog/organizers/*.yml   ← HUMAN-curated. Rarely changes. Pristine diffs.
/data/state/*.json          ← BOT cursors (last_post_id, last_polled). Churns constantly.
/data/raw/*.json            ← BOT raw posts. Append-mostly. The durable asset.
/data/events/*.json         ← BOT derived events. The served data. Rebuildable.
/site/                      ← static site source (Astro/Eleventy; client-side search; Leaflet+OSM map)
.github/workflows/          ← acquire.yml (if provider route), interpret.yml, publish.yml
```

**Cost note on raw store:** commit raw **text + image URLs**, NOT image blobs. Text is tiny;
fetch/cache images only at extraction time. Keeps the repo light.

---

## 5. Data model (intentionally simple — 3 entities)

**Organizer** (catalog, human-written):
```
id, name, platform, handle/url, breeds[], metro, [home_geo], poll_interval
```
One organizer may have multiple sources (IG + FB + Meetup .ics).

**Event** (derived, bot-written):
```
id, organizer_id, title, start, end?, recurrence?,
location{ name, address, lat, lng }, breeds[],
source{ post_url, image, raw_text, posted_at },
confidence, status (published|review), extracted_at
```

**Raw post / poll state** (bot-written):
```
post_id, organizer_id, posted_at, text, image_urls[], permalink
+ per-organizer cursor: last_post_id, last_polled
```

**The one subtle field — event identity / dedup key.** Organizers re-post reminders and
flyers. Use a deterministic key so re-processing *updates* rather than duplicates:
```
event.id = hash(organizer_id + normalized_date + normalized_location)
```
Get this right and Stage 2 is fully idempotent (re-run over all raw → same events). Get it
wrong → duplicate pins on the map. **OPEN QUESTION:** how to model recurring events — one
event with many occurrences, vs. many rows? (see §9)

---

## 6. Stage 1 deployment & polling strategy

### Recommended: managed scraping provider, called from a GitHub Action
- Provider supplies residential IPs + absorbs the anti-bot arms race (the thing we don't want
  to maintain). Our code never touches IG directly → no off-GitHub box needed.
- `acquire.yml` on a schedule: read catalog → pick **most-stale** organizer (by `last_polled`)
  → call provider API → write `data/raw/` + cursor → commit & push. Secret: provider token.
- **Staggering falls out naturally:** one organizer per tick, round-robin by staleness, plus
  jitter. ~30 accounts polled daily = ~30 fetches/day — near-invisible volume.

### Polling cadence & the freshness risk
- Because events are *rare*, **missing one is expensive**. Weekly polling = up to a 7-day blind
  spot; a "meetup THIS Saturday" post made Monday could be missed if polled the next Sunday.
- Since polling is so cheap, **poll daily** (still trivial volume) to catch short-notice posts.
  Treat weekly as a conservative floor. Let the MVP reveal real announcement lead times.

### Three-tier processing (keeps LLM cost proportional to *events*, not *posts*)
1. **Change detection** (every poll, ~free): compare to `last_post_id`; usually nothing new.
2. **Classification** (cheap, per new post): "is this an event announcement?" — small text
   model or keyword prefilter. Filters out daily cute-dog noise.
3. **Extraction** (expensive vision/LLM): only fires on real announcements (~monthly).
> NOTE: per-result scraping bills on posts *fetched* (incl. noise), so this 3-tier gate saves
> the **LLM** bill, not the scraping bill. To cut scraping cost: poll fewer posts/poll, use
> date filters where supported.

### DIY alternative (only if avoiding all provider cost)
- Run a fetcher on a **home box / NAS** (residential IP, free) on cron. Open-source libs:
  Instaloader (IG), public-Groups via FB tools. $0 + electricity, but **you** own the breakage
  and IP/account-ban risk. 2026 reality: IG hair-trigger bans anonymous IPs (429 after 2-3
  posts); guidance is "under 1k req/day Instaloader can be used" — our ~30/day fits, but it's
  fragile. Viable for a scrappy start; not a reliability foundation.
- **Avoid VPS/serverless DIY:** datacenter IP → must add paid residential proxy (~$/GB) →
  costs like a provider with more work. There is no cheap DIY path that isn't a home box.

---

## 7. Cost analysis (Apify, the default provider)

### How Apify bills (the structure that matters)
- Plans are a monthly fee that **is** your usage credit: Free=$5, Starter=$29, Scale=$199.
- **The free $5 is a cliff, not a slope:** on the free plan, exceeding $5 **blocks** you, it
  does not bill overage. So practical options are: *stay under $5 = free*, or *jump to $29*.
  There is no "pay $7 this month." That cliff — not the per-post rate — determines the bill.
- **Per-result actor charges draw FROM the credit** ($5 ≈ "2,100 IG comments").
- **Residential proxy is bundled** into per-result actor prices; the separate $8/GB only
  applies if you build your own actor.

### Gotcha: the cheapest actors are paid-plan-only
| Actor | Rate | Free plan? |
|---|---|---|
| `apidojo/instagram-scraper` | $0.50/1k | ❌ 10-item demo only |
| `danek/facebook-pages-posts-ppr` | $2.99/1k | ❌ 2 results only |
| **`apify/instagram-scraper`** (official) | $1.50/1k | ✅ works within $5 credit |
| **`apify/facebook-groups-scraper`** (official) | $2.60/1k | ✅ 500 free posts, then credit |

→ For a **free** MVP, use the **official** actors. The $0.50/1k bargains only matter *after*
you're already paying $29 (then they stretch it a long way). Official FB Groups scraper works
on **public** groups without login/membership (private still impossible).

### Cost model: `polls/mo × posts/poll × price/post` (official IG = $0.0015/post, 4 posts/poll)
| Catalog | Daily | Weekly |
|---|---|---|
| 10 IG | $1.80 | $0.26 |
| 25 IG | $4.50 | $0.65 |
| 50 IG | $9.00 → needs Starter | $1.30 |
| 25 IG + 5 FB | ~$6.05 → needs Starter | ~$0.87 |

- **Free-tier ceiling (~$5):** ~27 IG accounts polled **daily**, or ~190 **weekly**.
- **MVP (one metro, ~20–25 sources): realistically $0/mo.** You may never leave the free tier.
- **Growth (50–150 sources / multi-metro / FB-heavy daily): $29/mo Starter** — and at Starter
  the $0.50/1k actors make $29 cover a *much* bigger catalog. Likely terminal cost for a long
  time. All-in (scraping + LLM extraction) stays well under ~$35/mo even at growth scale.
- **FB is the cost driver** (~2–6× IG/result) and volume wildcard (active public groups post
  a lot). Weight the catalog toward Instagram; date-filter Facebook.

### Cost levers
- Poll less often / fewer posts per poll (daily "latest 2" ≈ half of "latest 4").
- Confine paid scraping to **Instagram only**; use free feeds for everything else (§8).

---

## 8. Vendor alternatives & portability

**Reframe:** every managed option charges for the same hard thing — residential IPs +
anti-bot maintenance — which IG made *harder* in 2026. Switching vendors reshuffles, rarely
eliminates, that cost. Apify is mid-market, not overpriced.

| Option | Cost | Reliability | Verdict |
|---|---|---|---|
| Apify | $5 free → $29 | High (official) | Fine baseline |
| RapidAPI IG wrappers | Free + ~$10/mo, granular | ⚠️ low, unofficial | Cheapest managed, no $29 cliff |
| ScrapingDog | PAYG credits, ~$0.063/1k at scale | Medium | Cheap at volume, PAYG avoids cliff |
| Bright Data | $0.75/1k pay-per-success | Highest | Enterprise; datasets from $250 |
| EnsembleData | $100–200/mo floor | High | Too pricey — skip |
| DIY Instaloader/instagrapi | $0 | ⚠️ fragile + ban risk | $0 but painful in 2026 |
| RSS.app/FetchRSS (FB pages) | Free/cheap | Medium | Decent FB-pages route |

**The real protections (more important than vendor choice):**
1. **You probably stay in Apify's free tier far longer than expected** — don't optimize the
   $29 prematurely.
2. **Shrink the paid surface area:** paid scraping should only ever cover *Instagram*. Meetup/
   Eventbrite/breed-club ICS+RSS are free forever; FB pages via RSS.app free tier.
3. **Portability:** put the fetcher behind a thin interface — `handle → normalized posts[]` —
   so Apify / RapidAPI / ScrapingDog / DIY are interchangeable adapters. A price hike or
   broken actor becomes a one-file swap, not a rebuild. This matters most because every vendor
   in this space eventually breaks or re-prices.

---

## 9. Open decisions (not yet made)

1. **Event identity / recurrence model** — one event with many occurrences vs. many rows?
   Shapes the dedup key and the map/search behavior.
2. **Acquire footprint** — minimal (provider-in-Actions, fully GitHub-native) [recommended]
   vs. monolithic worker (whole pipeline on one off-GitHub box; simpler bootstrap).
3. **Launch scope** — DC-only single metro (tighter, easier curation) vs. multi-metro from
   day one (more schema/UX work).
4. **Provider choice** — start on Apify free tier (recommended) vs. RapidAPI/DIY.

---

## 10. Recommended MVP path

1. **Hand-curate ~15–25 DC-area organizers** centered on Instagram + public Facebook, plus any
   Meetup/Eventbrite/ICS that exist. Author as `catalog/organizers/*.yml`.
2. **Wire the free structured feeds first** (Meetup `.ics`, Eventbrite, breed-club RSS, city
   dog-calendars) — $0, no scraping, proves the site end-to-end.
3. **Add Instagram via Apify free tier** (official actor, in a GitHub Action), with the 3-tier
   change→classify→extract gate and geocoding.
4. **Build the static site** (Astro/Eleventy) with client-side breed/location search +
   Leaflet/OSM map; rebuild on `data/events/` change.
5. **Confirm freshness/lead-time assumptions**, then expand breeds/metros; only move to Apify
   Starter (or swap providers) once free-tier limits actually bite.

---

## 11. Sources (recon, 2026-06-19)
- Meetup SF Shih Tzu group + `.ics` feed; DC Area Shih Tzu Playgroup (31 members, no events)
- Eventbrite Shih Tzu events; American Shih Tzu Club shows (RSS + GCal); nycdogevents.com (iCal)
- IG/FB public posts fetchable with caption-text event details
- Apify pricing + actor pages; ScrapingDog, EnsembleData, Bright Data, RapidAPI, Decodo
- Instaloader/instagrapi 2026 status; RSS-Bridge Instagram (now impractical)
