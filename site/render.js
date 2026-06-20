// Shared, zero-dependency HTML rendering. Pure functions → build.js emits the
// pages. Design: filtering is NAVIGATION between pre-generated static pages, not a
// client-side app. JS ships on ONE page only:
//   - index: Leaflet map (all upcoming) + a ~0.5KB cascading navigator
//   - org/event/breed/metro/find pages: pure static HTML, ZERO JS
//     (locations link out to Google Maps instead of an embedded map)
//
// Path strategy: `base` is '' for root pages (index) and '../' for depth-1 pages
// (everything else), so the site works at any GitHub Pages base path. CSS is
// inlined. JSON in <script> has '<' escaped to avoid </script> breakouts.

const LEAFLET_CSS = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
const LEAFLET_JS = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';

export const CSS = `
:root{--fg:#1c1c1e;--muted:#6b6b70;--line:#e6e6ea;--accent:#7c4dff;--bg:#fafafb;--chip:#f0ecff}
*{box-sizing:border-box}
body{margin:0;font:15px/1.5 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;color:var(--fg);background:var(--bg)}
a{color:var(--accent);text-decoration:none}a:hover{text-decoration:underline}
.topbar{padding:12px 20px;border-bottom:1px solid var(--line);background:#fff;font-weight:600}
.topbar a{color:var(--fg)}
header.app{padding:18px 20px;border-bottom:1px solid var(--line);background:#fff}
header.app h1{margin:0;font-size:20px}header.app h1 small{color:var(--muted);font-weight:400;font-size:14px}
.controls{display:flex;gap:10px;flex-wrap:wrap;margin-top:12px}
.controls select{padding:7px 10px;border:1px solid var(--line);border-radius:8px;font-size:14px;background:#fff}
.controls button{padding:7px 14px;border:1px solid var(--accent);background:var(--accent);color:#fff;border-radius:8px;font-size:14px;cursor:pointer}
main.split{display:grid;grid-template-columns:1fr 1fr;height:calc(100vh - 122px)}
#list{overflow-y:auto;padding:16px}
.map{height:100%}
.wrap{max-width:880px;margin:0 auto;padding:20px}
.count{color:var(--muted);font-size:13px;margin:0 0 12px}
.breadcrumb{color:var(--muted);font-size:13px;margin:0 0 10px}
.card{border:1px solid var(--line);border-radius:12px;padding:14px;margin-bottom:12px;background:#fff}
.card:hover{border-color:#d3d3da}
.card h3{margin:0 0 6px;font-size:16px}
.card .when{font-weight:600}
.card .meta{color:var(--muted);font-size:13px;margin-top:4px}
.tags{margin-top:8px;display:flex;gap:6px;flex-wrap:wrap}
.tag{display:inline-block;font-size:11px;padding:2px 8px;border-radius:999px;background:var(--chip);color:var(--accent)}
.approx{color:var(--muted);font-style:italic}
.empty{color:var(--muted);padding:24px 0;text-align:center}
.group-label{font-size:12px;text-transform:uppercase;letter-spacing:.04em;color:var(--muted);margin:18px 0 8px;font-weight:600}
.org-header{display:flex;align-items:center;gap:12px;margin-bottom:6px}
.avatar{display:inline-flex;align-items:center;justify-content:center;width:44px;height:44px;border-radius:50%;background:var(--accent);color:#fff;font-weight:700;font-size:18px;flex:none}
.org-header h1{margin:0;font-size:22px}
.sources a{margin-right:12px;font-size:14px}
.btn{display:inline-block;padding:8px 12px;border:1px solid var(--accent);border-radius:8px;color:var(--accent);font-size:14px;margin:4px 8px 4px 0}
.btn:hover{background:var(--chip);text-decoration:none}
.detail h1{font-size:24px;margin:.2em 0}.detail .when{font-size:17px;font-weight:600}
.detail .desc{white-space:pre-wrap;color:#333;background:#fff;border:1px solid var(--line);border-radius:10px;padding:12px;margin-top:12px}
.demo-banner{background:#fff7e6;border-bottom:1px solid #ffe1a8;color:#8a6d3b;padding:7px 20px;font-size:13px}
@media (max-width:760px){main.split{grid-template-columns:1fr;height:auto}main.split .map{height:48vh}}
`;

export const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const safeId = (id) => String(id).replace(/[^a-zA-Z0-9._-]/g, '_');
const jsonScript = (v) => JSON.stringify(v).replace(/</g, '\\u003c');

export const humanizeBreed = (s) =>
  s === 'all-breeds' ? 'All breeds' : String(s).split('-').map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
export const humanizeMetro = (s) =>
  String(s).length <= 3 ? String(s).toUpperCase() : String(s).split('-').map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');

export function fmtDate(iso, tz) {
  try {
    return new Intl.DateTimeFormat('en-US', {
      weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: tz || undefined,
    }).format(new Date(iso));
  } catch { return new Date(iso).toLocaleString(); }
}
function bucketLabel(startIso, now) {
  const days = (new Date(startIso) - now) / 86400000;
  if (days < 7) return 'This week';
  if (days < 14) return 'Next week';
  try { return new Intl.DateTimeFormat('en-US', { month: 'long', year: 'numeric' }).format(new Date(startIso)); }
  catch { return 'Later'; }
}

export const homeUrl = (b) => `${b}index.html`;
export const eventUrl = (b, id) => `${b}event/${safeId(id)}.html`;
export const icsUrl = (b, id) => `${b}event/${safeId(id)}.ics`;
export const orgUrl = (b, id) => `${b}org/${safeId(id)}.html`;
export const breedUrl = (b, slug) => `${b}breed/${safeId(slug)}.html`;
export const metroUrl = (b, slug) => `${b}metro/${safeId(slug)}.html`;
export const findUrl = (b, breed, metro) => `${b}find/${safeId(breed)}__${safeId(metro)}.html`;

const chip = (label, href) => `<a class="tag" href="${href}">${esc(label)}</a>`;
const avatar = (name) => `<span class="avatar">${esc((String(name || '?').trim()[0] || '?').toUpperCase())}</span>`;

function mapsLink(ev) {
  const loc = ev.location || {};
  const q = loc.address || loc.name || (loc.lat != null ? `${loc.lat},${loc.lng}` : null);
  return q ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}` : null;
}

export function eventCardHtml(ev, base) {
  const venue = ev.location?.name || 'Location TBD';
  const approx = ev.location?.approx ? ' <span class="approx">(approx.)</span>' : '';
  const maps = mapsLink(ev);
  const tags = [
    ...(ev.breeds || []).map((b) => chip(humanizeBreed(b), breedUrl(base, b))),
    ev.metro ? chip(humanizeMetro(ev.metro), metroUrl(base, ev.metro)) : '',
  ].join('');
  return `<article class="card">
    <h3><a href="${eventUrl(base, ev.id)}">${esc(ev.title)}</a></h3>
    <div class="when">${esc(fmtDate(ev.start, ev.timezone))}</div>
    <div class="meta">${esc(venue)}${approx}${ev.organizer_name ? ` · <a href="${orgUrl(base, ev.organizer_id)}">${esc(ev.organizer_name)}</a>` : ''}${maps ? ` · <a href="${maps}">📍 map</a>` : ''}</div>
    <div class="tags">${tags}</div>
  </article>`;
}

export function eventListHtml(events, base, { now = new Date() } = {}) {
  if (!events.length) return '<p class="empty">No upcoming meetups here yet — check back soon.</p>';
  let html = '';
  let last = null;
  for (const ev of events) {
    const b = bucketLabel(ev.start, now);
    if (b !== last) { html += `<div class="group-label">${esc(b)}</div>`; last = b; }
    html += eventCardHtml(ev, base);
  }
  return html;
}

function eventsToPoints(events, base) {
  return events
    .filter((e) => e.location?.lat != null && e.location?.lng != null)
    .map((e) => ({
      lat: e.location.lat, lng: e.location.lng,
      popup: `<b>${esc(e.title)}</b><br>${esc(fmtDate(e.start, e.timezone))}<br>${esc(e.location.name || '')}`
        + `${e.location.approx ? ' (approx.)' : ''}<br><a href="${eventUrl(base, e.id)}">details</a>`,
    }));
}

export function pageLayout({ title, description = '', body, bodyClass = '', leaflet = false }) {
  return `<!doctype html>
<html lang="en"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="${esc(description)}">
${leaflet ? `<link rel="stylesheet" href="${LEAFLET_CSS}" crossorigin=""/>` : ''}
<style>${CSS}</style>
</head><body class="${bodyClass}">${body}</body></html>`;
}

const topbar = (base) => `<header class="topbar"><a href="${homeUrl(base)}">🐾 pup-meetup</a></header>`;

// ---------- ICS / Google Calendar ----------
const icsDt = (iso) => new Date(iso).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
const icsEsc = (s) => String(s == null ? '' : s).replace(/([,;\\])/g, '\\$1').replace(/\r?\n/g, '\\n');

export function icsForEvent(ev, { now = new Date() } = {}) {
  return [
    'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//pup-meetup//EN', 'BEGIN:VEVENT',
    `UID:${ev.id}`, `DTSTAMP:${icsDt(now.toISOString())}`, `DTSTART:${icsDt(ev.start)}`,
    ev.end ? `DTEND:${icsDt(ev.end)}` : '',
    `SUMMARY:${icsEsc(ev.title)}`,
    ev.location?.address || ev.location?.name ? `LOCATION:${icsEsc(ev.location.address || ev.location.name)}` : '',
    ev.source_url ? `URL:${ev.source_url}` : '',
    'END:VEVENT', 'END:VCALENDAR',
  ].filter(Boolean).join('\r\n') + '\r\n';
}
function gcalUrl(ev) {
  const p = new URLSearchParams({ action: 'TEMPLATE', text: ev.title || 'Dog meetup', dates: `${icsDt(ev.start)}/${icsDt(ev.end || ev.start)}` });
  if (ev.location?.address || ev.location?.name) p.set('location', ev.location.address || ev.location.name);
  return `https://www.google.com/calendar/render?${p.toString()}`;
}

// ---------- pages ----------
const NAV_SCRIPT = `
var PAIRS=__PAIRS__,MLABEL=__MLABEL__;
var bs=document.getElementById('breed'),ms=document.getElementById('metro');
function fillMetros(){
  var b=bs.value;var list=(b==='')?Object.keys(MLABEL):(PAIRS[b]||[]);
  ms.innerHTML='<option value="">Any location</option>'+list.map(function(m){return '<option value="'+m+'">'+MLABEL[m]+'</option>'}).join('');
}
function go(){var b=bs.value,m=ms.value;
  if(!b&&!m)return;
  if(b&&m)location.href='find/'+b+'__'+m+'.html';
  else if(b)location.href='breed/'+b+'.html';
  else location.href='metro/'+m+'.html';}
bs.addEventListener('change',fillMetros);
document.getElementById('go').addEventListener('click',go);
`;

export function renderIndexPage(events, { demo = false, pairs = {}, metroLabels = {}, now = new Date() } = {}) {
  const breeds = [...new Set(events.flatMap((e) => e.breeds || []))].sort();
  const opt = (slug, label) => `<option value="${esc(slug)}">${esc(label)}</option>`;
  const points = eventsToPoints(events, '');

  const body = `<header class="app">
    <h1>🐾 pup-meetup <small>— upcoming dog meetups</small></h1>
    <div class="controls">
      <select id="breed"><option value="">Any breed</option>${breeds.map((b) => opt(b, humanizeBreed(b))).join('')}</select>
      <select id="metro"><option value="">Any location</option>${Object.keys(metroLabels).sort().map((m) => opt(m, metroLabels[m])).join('')}</select>
      <button id="go" type="button">Find meetups →</button>
    </div>
  </header>
  ${demo ? '<div class="demo-banner">⚠️ Demo data — sample events for UI testing, not real listings.</div>' : ''}
  <main class="split">
    <section id="list"><p class="count">${events.length} upcoming meetup${events.length === 1 ? '' : 's'}</p>${eventListHtml(events, '', { now })}</section>
    <div id="map" class="map"></div>
  </main>
  <script src="${LEAFLET_JS}"></script>
  <script>
  (function(){var pts=${jsonScript(points)};var map=L.map('map');
   L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19,attribution:'&copy; OpenStreetMap contributors'}).addTo(map);
   var b=[];for(var i=0;i<pts.length;i++){var p=pts[i];L.marker([p.lat,p.lng]).addTo(map).bindPopup(p.popup);b.push([p.lat,p.lng]);}
   if(b.length)map.fitBounds(b,{padding:[40,40],maxZoom:13});else map.setView([39.5,-98.35],4);})();
  ${NAV_SCRIPT.replace('__PAIRS__', jsonScript(pairs)).replace('__MLABEL__', jsonScript(metroLabels))}
  </script>`;
  return pageLayout({ title: 'pup-meetup — upcoming dog meetups', description: 'Discover upcoming breed-specific dog meetups by breed and location.', body, leaflet: true });
}

export function renderOrgPage(org, events, base, { now = new Date() } = {}) {
  const sourceLinks = (org.sources || []).map((s) => {
    if (s.type === 'instagram' && s.handle) return `<a href="https://www.instagram.com/${esc(s.handle)}/">Instagram</a>`;
    if (s.url) return `<a href="${esc(s.url)}">${esc(labelForType(s.type))}</a>`;
    return '';
  }).filter(Boolean).join('');
  const breeds = [...new Set(events.flatMap((e) => e.breeds || []))];
  const body = `${topbar(base)}<div class="wrap">
    <p class="breadcrumb"><a href="${homeUrl(base)}">← all meetups</a></p>
    <div class="org-header">${avatar(org.name)}<h1>${esc(org.name)}</h1></div>
    <div class="tags">${org.metro ? chip(humanizeMetro(org.metro), metroUrl(base, org.metro)) : ''}${breeds.map((b) => chip(humanizeBreed(b), breedUrl(base, b))).join('')}</div>
    ${sourceLinks ? `<p class="sources" style="margin-top:10px">${sourceLinks}</p>` : ''}
    <p class="count" style="margin-top:14px">${events.length} upcoming meetup${events.length === 1 ? '' : 's'}</p>
    ${eventListHtml(events, base, { now })}
  </div>`;
  return pageLayout({ title: `${org.name} — pup-meetup`, description: `Upcoming meetups from ${org.name}.`, body });
}

export function renderBreedPage(breedSlug, events, base, { now = new Date() } = {}) {
  const label = humanizeBreed(breedSlug);
  const body = `${topbar(base)}<div class="wrap">
    <p class="breadcrumb"><a href="${homeUrl(base)}">← all meetups</a></p>
    <h1>${esc(label)} meetups</h1>
    <p class="count">${events.length} upcoming ${esc(label)} meetup${events.length === 1 ? '' : 's'}</p>
    ${eventListHtml(events, base, { now })}
  </div>`;
  return pageLayout({ title: `${label} dog meetups — pup-meetup`, description: `Upcoming ${label} dog meetups.`, body });
}

export function renderMetroPage(metroSlug, events, base, { now = new Date() } = {}) {
  const label = humanizeMetro(metroSlug);
  const breeds = [...new Set(events.flatMap((e) => e.breeds || []))];
  const body = `${topbar(base)}<div class="wrap">
    <p class="breadcrumb"><a href="${homeUrl(base)}">← all meetups</a></p>
    <h1>Dog meetups in ${esc(label)}</h1>
    <div class="tags">${breeds.map((b) => chip(humanizeBreed(b), breedUrl(base, b))).join('')}</div>
    <p class="count" style="margin-top:10px">${events.length} upcoming meetup${events.length === 1 ? '' : 's'}</p>
    ${eventListHtml(events, base, { now })}
  </div>`;
  return pageLayout({ title: `Dog meetups in ${label} — pup-meetup`, description: `Upcoming dog meetups in ${label}.`, body });
}

export function renderFindPage(breedSlug, metroSlug, events, base, { now = new Date() } = {}) {
  const bl = humanizeBreed(breedSlug);
  const ml = humanizeMetro(metroSlug);
  const body = `${topbar(base)}<div class="wrap">
    <p class="breadcrumb"><a href="${homeUrl(base)}">← all meetups</a> · <a href="${breedUrl(base, breedSlug)}">${esc(bl)}</a> · <a href="${metroUrl(base, metroSlug)}">${esc(ml)}</a></p>
    <h1>${esc(bl)} meetups in ${esc(ml)}</h1>
    <p class="count">${events.length} upcoming meetup${events.length === 1 ? '' : 's'}</p>
    ${eventListHtml(events, base, { now })}
  </div>`;
  return pageLayout({ title: `${bl} meetups in ${ml} — pup-meetup`, description: `Upcoming ${bl} dog meetups in ${ml}.`, body });
}

export function renderEventPage(ev, base, { now = new Date() } = {}) {
  const venue = ev.location?.name || 'Location TBD';
  const approx = ev.location?.approx ? ' <span class="approx">(approx.)</span>' : '';
  const maps = mapsLink(ev);
  const desc = ev.sources?.find((s) => s.raw_text)?.raw_text;
  const validSources = (ev.sources || []).filter((s) => s.post_url);
  const sourceLinks = validSources
    .map((s, i) => `<a href="${esc(s.post_url)}">source${validSources.length > 1 ? ' ' + (i + 1) : ''} ↗</a>`).join(' · ');
  const body = `${topbar(base)}<div class="wrap detail">
    <p class="breadcrumb"><a href="${homeUrl(base)}">← all meetups</a></p>
    <h1>${esc(ev.title)}</h1>
    <div class="when">${esc(fmtDate(ev.start, ev.timezone))}${ev.recurrence_label ? ` · ${esc(ev.recurrence_label)}` : ''}</div>
    <div class="meta" style="color:var(--muted);margin-top:4px">${esc(ev.location?.address || venue)}${approx}</div>
    <p style="margin-top:10px">
      <a class="btn" href="${icsUrl(base, ev.id)}">＋ Add to calendar</a>
      <a class="btn" href="${gcalUrl(ev)}">Google Calendar</a>
      ${maps ? `<a class="btn" href="${maps}">📍 Open in Maps</a>` : ''}
    </p>
    <div class="tags">
      ${ev.organizer_name ? chip(ev.organizer_name, orgUrl(base, ev.organizer_id)) : ''}
      ${(ev.breeds || []).map((b) => chip(humanizeBreed(b), breedUrl(base, b))).join('')}
      ${ev.metro ? chip(humanizeMetro(ev.metro), metroUrl(base, ev.metro)) : ''}
    </div>
    ${sourceLinks ? `<p class="sources" style="margin-top:12px">${sourceLinks}</p>` : ''}
    ${desc ? `<div class="desc">${esc(desc)}</div>` : ''}
  </div>`;
  return pageLayout({ title: `${ev.title} — pup-meetup`, description: `${ev.title} on ${fmtDate(ev.start, ev.timezone)}.`, body });
}

function labelForType(type) {
  return ({ meetup_ics: 'Meetup', ics: 'Calendar', eventbrite: 'Eventbrite', rss: 'Website', facebook_page: 'Facebook', facebook_group: 'Facebook group' })[type] || 'Link';
}
