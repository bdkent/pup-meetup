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

import * as G from './graphics.js';

const LEAFLET_CSS = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
const LEAFLET_JS = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
// Organizers reach us by plain email (no account, no GitHub) — see get-listed.
// The address is a forwarder on the project's own domain, so it stays private
// and the alias is a one-line swap here.
const CONTACT_EMAIL = 'hello@pup-meetup.com';
const SUBMIT_MAILTO = `mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent('List my dog community on pup-meetup')}`
  + `&body=${encodeURIComponent('Community name:\nCity / town:\nBreed(s):\nWhere you post your meetups (Instagram, Meetup, Eventbrite, or website):\n')}`;

export const CSS = `
:root{--fg:#1c1c1e;--muted:#6b6b70;--line:#e6e6ea;--accent:#7c4dff;--bg:#fafafb;--chip:#f0ecff}
*{box-sizing:border-box}
body{margin:0;font:15px/1.5 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;color:var(--fg);background:var(--bg)}
a{color:var(--accent);text-decoration:none}a:hover{text-decoration:underline}
.topbar{display:flex;align-items:center;justify-content:space-between;gap:10px 24px;flex-wrap:wrap;padding:10px 20px;border-bottom:1px solid var(--line);background:#fff}
.topbar .brand{font-weight:700;font-size:16px;color:var(--fg)}
.topbar nav{display:flex;gap:18px;flex-wrap:wrap}
.topbar nav a{color:var(--muted);font-weight:500;font-size:14px}
.topbar nav a:hover,.topbar nav a.active{color:var(--accent);text-decoration:none}
header.app{padding:18px 20px;border-bottom:1px solid var(--line);background:#fff}
header.app h1{margin:0;font-size:20px}header.app h1 small{color:var(--muted);font-weight:400;font-size:14px}
.controls{display:flex;gap:10px;flex-wrap:wrap;margin-top:12px}
.controls select{padding:7px 10px;border:1px solid var(--line);border-radius:8px;font-size:14px;background:#fff}
.controls button{padding:7px 14px;border:1px solid var(--accent);background:var(--accent);color:#fff;border-radius:8px;font-size:14px;cursor:pointer}
main.split{display:grid;grid-template-columns:1fr 1fr;height:calc(100vh - 166px)}
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
.confirm{margin-top:14px;padding:10px 12px;border:1px solid #ffe1a8;background:#fff7e6;color:#8a6d3b;border-radius:10px;font-size:13px}
.confirm a{color:#8a6d3b;text-decoration:underline}
.empty{color:var(--muted);padding:24px 0;text-align:center}
.browse{margin:6px 0 14px;display:flex;flex-direction:column;gap:6px}
.browse-label{font-size:12px;color:var(--muted);text-transform:uppercase;letter-spacing:.04em;margin-right:6px}
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
.prose{max-width:740px}
.prose h1{font-size:26px;margin:.1em 0 .5em}
.prose h2{font-size:18px;margin:1.5em 0 .4em}
.prose p,.prose li{color:#333}
.prose ul,.prose ol{padding-left:22px}
.prose li{margin:6px 0}
.lede{font-size:17px;color:#333}
.cta{display:inline-block;margin:6px 0;padding:10px 16px;background:var(--accent);color:#fff;border-radius:8px;font-weight:600}
.cta:hover{text-decoration:none;opacity:.92}
.callout{margin:18px 0;padding:12px 14px;border:1px solid #ffe1a8;background:#fff7e6;color:#8a6d3b;border-radius:10px;font-size:14px}
html{scroll-behavior:smooth}
/* graphics: paws, badges, mascot */
.paw{display:inline-block;width:1em;height:1em;vertical-align:-.15em;fill:currentColor}
.brand{display:inline-flex;align-items:center;gap:6px}
.brand .paw{width:18px;height:18px;color:var(--accent)}
.hero-pup{width:42px;height:42px;vertical-align:-13px;margin-right:4px}
.pawhr{display:flex;align-items:center;justify-content:center;gap:12px;margin:28px 0;color:var(--accent)}
.pawhr span{flex:1;max-width:150px;height:1px;background:var(--line)}
.pawhr .paw{width:17px;height:17px;opacity:.7}
.pawhr .p1{transform:rotate(-18deg)}
.pawhr .p2{width:23px;height:23px;opacity:.95}
.pawhr .p3{transform:rotate(18deg)}
.city-head{display:flex;align-items:center;gap:8px;scroll-margin-top:18px}
.flag.badge{height:16px;width:auto;border-radius:2px;box-shadow:0 0 0 1px rgba(0,0,0,.08);flex:none}
.city.badge{height:15px;width:auto;color:var(--accent);opacity:.75;flex:none}
.orgmap{height:340px;border-radius:14px;overflow:hidden;border:1px solid var(--line);margin:14px 0 4px}
.map-hint{font-size:12px;color:var(--muted);margin:0 0 8px}
.corner-paws{position:fixed;inset:0;pointer-events:none;z-index:-1;color:var(--accent)}
.corner-paws .cp{position:absolute;opacity:.05}
.corner-paws .cp1{top:84px;left:-24px;width:130px;height:130px;transform:rotate(-22deg)}
.corner-paws .cp2{bottom:36px;right:-12px;width:150px;height:150px;transform:rotate(24deg)}
.corner-paws .cp3{top:42%;right:7%;width:74px;height:74px;transform:rotate(10deg)}
@media (max-width:760px){main.split{grid-template-columns:1fr;height:auto}main.split .map{height:48vh}.corner-paws{display:none}.orgmap{height:260px}}
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
export const organizersUrl = (b) => `${b}organizers.html`;
export const aboutUrl = (b) => `${b}about.html`;
export const getListedUrl = (b) => `${b}get-listed.html`;

const chip = (label, href) => `<a class="tag" href="${href}">${esc(label)}</a>`;
const avatar = (name) => `<span class="avatar">${esc((String(name || '?').trim()[0] || '?').toUpperCase())}</span>`;

// Outbound links to an organizer's own channels (Instagram handle, Meetup .ics,
// website, etc.) — the way to reach communities we can't yet auto-ingest.
function sourceLinksHtml(sources) {
  return (sources || []).map((s) => {
    if (s.type === 'instagram' && s.handle) return `<a href="https://www.instagram.com/${esc(s.handle)}/">Instagram ↗</a>`;
    if (s.url) return `<a href="${esc(s.url)}">${esc(labelForType(s.type))} ↗</a>`;
    return '';
  }).filter(Boolean).join(' · ');
}

// A directory card for an organizer/community. Works whether or not we have any
// parsed events for them yet (eventCount 0 → "follow for announcements").
export function orgCardHtml(org, base) {
  const links = sourceLinksHtml(org.sources);
  const count = org.eventCount || 0;
  const status = count ? `${count} upcoming meetup${count === 1 ? '' : 's'}` : 'No dates yet — follow for announcements';
  const tags = [
    ...(org.breeds || []).map((b) => chip(humanizeBreed(b), breedUrl(base, b))),
    org.metro ? chip(humanizeMetro(org.metro), metroUrl(base, org.metro)) : '',
  ].join('');
  return `<article class="card">
    <h3><a href="${orgUrl(base, org.id)}">${esc(org.name)}</a></h3>
    <div class="meta">${esc(status)}${links ? ` · ${links}` : ''}</div>
    ${tags ? `<div class="tags">${tags}</div>` : ''}
  </article>`;
}

// A labeled block of organizer cards (the directory, scoped by the caller).
function communitiesSection(orgs, base, label) {
  if (!orgs || !orgs.length) return '';
  return `<div class="group-label">${esc(label)}</div>${orgs.map((o) => orgCardHtml(o, base)).join('')}`;
}

// The full community directory, grouped by city. This is its own page (linked
// from the top nav) so the site is useful before any events are parsed (e.g.
// Instagram-only organizers): every cataloged community is visible with a link
// to follow, plus a prominent "get listed" CTA for new organizers.
export function renderOrganizersPage(directory, base, { metroLabels = {}, metroPoints = {} } = {}) {
  const byMetro = {};
  for (const o of directory || []) (byMetro[o.metro || 'other'] ??= []).push(o);
  const metros = Object.keys(byMetro).sort();
  const metroLabel = (m) => (metroLabels && metroLabels[m]) || humanizeMetro(m);

  // City sections, each anchored by its metro slug so the map can jump to it,
  // with a flag (where clean) or skyline badge in the heading.
  const blocks = metros.map((m) => {
    const heading = m === 'other' ? esc(metroLabel(m)) : `<a href="${metroUrl(base, m)}">${esc(metroLabel(m))}</a>`;
    const badge = m === 'other' ? '' : G.cityBadge(m);
    return `<h2 class="group-label city-head" id="${safeId(m)}">${badge}${heading}</h2>`
      + byMetro[m].map((o) => orgCardHtml(o, base)).join('');
  }).join('');

  // Region map: one pin per metro we have coordinates for; each popup jumps to
  // that city's section below (people look for organizers physically near them).
  const mapPts = metros
    .filter((m) => m !== 'other' && metroPoints[m])
    .map((m) => {
      const n = byMetro[m].length;
      return {
        lat: metroPoints[m].lat, lng: metroPoints[m].lng,
        popup: `<b>${esc(metroLabel(m))}</b><br>${n} organizer${n === 1 ? '' : 's'}<br><a href="#${safeId(m)}">Jump to ${esc(metroLabel(m))} &rarr;</a>`,
      };
    });
  const hasMap = mapPts.length > 0;
  const mapBlock = hasMap
    ? '<div id="orgmap" class="orgmap"></div><p class="map-hint">Click the map to zoom (scroll); tap a pin to jump to that city below.</p>'
    : '';
  // scrollWheelZoom starts off so the wheel scrolls the page; clicking the map
  // (focus) turns it on, clicking away (blur) turns it back off — wheel zoom
  // without hijacking page scroll, and zero extra dependencies.
  const mapScript = hasMap ? `<script src="${LEAFLET_JS}"></script><script>
  (function(){var pts=${jsonScript(mapPts)};var map=L.map('orgmap',{scrollWheelZoom:false});
   L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19,attribution:'&copy; OpenStreetMap contributors'}).addTo(map);
   map.on('focus',function(){map.scrollWheelZoom.enable();});
   map.on('blur',function(){map.scrollWheelZoom.disable();});
   var b=[];for(var i=0;i<pts.length;i++){var p=pts[i];L.marker([p.lat,p.lng]).addTo(map).bindPopup(p.popup);b.push([p.lat,p.lng]);}
   if(b.length>1)map.fitBounds(b,{padding:[50,50],maxZoom:9});else map.setView(b[0],10);})();
  </script>` : '';

  const count = (directory || []).length;
  const body = `${topbar(base, 'organizers')}${G.cornerPaws()}<div class="wrap">
    <h1 style="font-size:24px;margin:.1em 0 6px">Communities we're tracking</h1>
    <p class="count">${count} organizer${count === 1 ? '' : 's'} across ${metros.length} cit${metros.length === 1 ? 'y' : 'ies'} — follow them for meetup announcements.</p>
    <p><a class="cta" href="${getListedUrl(base)}">＋ Get your community listed</a></p>
    ${mapBlock}
    ${G.pawDivider()}
    ${blocks || '<p class="empty">No communities yet — check back soon.</p>'}
  </div>${mapScript}`;
  return pageLayout({ title: 'Organizers & communities — pup-meetup', description: 'Dog-meetup organizers and communities we track, grouped by city.', body, leaflet: hasMap });
}

function mapsLink(ev) {
  const loc = ev.location || {};
  const q = loc.address || loc.name || (loc.lat != null ? `${loc.lat},${loc.lng}` : null);
  return q ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}` : null;
}

export function eventCardHtml(ev, base) {
  const loc = ev.location || {};
  const precise = loc.lat != null && loc.lng != null && !loc.approx;
  const maps = precise ? mapsLink(ev) : null;
  const locLine = precise
    ? `${esc(loc.name || loc.address || 'Location')}${maps ? ` · <a href="${maps}">📍 map</a>` : ''}`
    : `<span class="approx">📍 ${loc.name ? esc(loc.name) + ' — ' : ''}approximate area, confirm location</span>`;
  const tags = [
    ...(ev.breeds || []).map((b) => chip(humanizeBreed(b), breedUrl(base, b))),
    ev.metro ? chip(humanizeMetro(ev.metro), metroUrl(base, ev.metro)) : '',
  ].join('');
  return `<article class="card">
    <h3><a href="${eventUrl(base, ev.id)}">${esc(ev.title)}</a></h3>
    <div class="when">${esc(fmtDate(ev.start, ev.timezone))}</div>
    <div class="meta">${locLine}${ev.organizer_name ? ` · <a href="${orgUrl(base, ev.organizer_id)}">${esc(ev.organizer_name)}</a>` : ''}</div>
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
      lat: e.location.lat, lng: e.location.lng, approx: !!e.location.approx,
      popup: `<b>${esc(e.title)}</b><br>${esc(fmtDate(e.start, e.timezone))}<br>`
        + (e.location.approx
          ? '<i>Approximate area — confirm the exact spot</i>'
          : esc(e.location.name || e.location.address || ''))
        + `<br><a href="${eventUrl(base, e.id)}">details &amp; source</a>`,
    }));
}

export function pageLayout({ title, description = '', body, bodyClass = '', leaflet = false }) {
  return `<!doctype html>
<html lang="en"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="${esc(description)}">
<link rel="icon" href="${G.FAVICON}">
${leaflet ? `<link rel="stylesheet" href="${LEAFLET_CSS}" crossorigin=""/>` : ''}
<style>${CSS}</style>
</head><body class="${bodyClass}">${body}</body></html>`;
}

// Site-wide nav. `active` highlights the current section ('' | 'organizers' |
// 'about' | 'get-listed'). Present on every page so the directory, About, and
// "Get listed" pages are reachable from anywhere — not buried at the bottom.
const NAV_LINKS = [
  ['', 'Meetups', homeUrl],
  ['organizers', 'Organizers', organizersUrl],
  ['about', 'About', aboutUrl],
  ['get-listed', 'Get listed', getListedUrl],
];
function navHtml(base, active = '') {
  return NAV_LINKS.map(([key, label, url]) =>
    `<a href="${url(base)}"${key === active ? ' class="active"' : ''}>${esc(label)}</a>`).join('');
}
const topbar = (base, active = '') => `<header class="topbar">
  <a class="brand" href="${homeUrl(base)}">${G.pawSvg()}pup-meetup</a>
  <nav>${navHtml(base, active)}</nav>
</header>`;

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

export function renderIndexPage(events, { demo = false, pairs = {}, metroLabels = {}, now = new Date(), breeds: breedFacet, metros: metroFacet } = {}) {
  const breeds = (breedFacet && breedFacet.length ? [...breedFacet] : [...new Set(events.flatMap((e) => e.breeds || []))]).sort();
  const metros = (metroFacet && metroFacet.length ? [...metroFacet] : Object.keys(metroLabels)).sort();
  const opt = (slug, label) => `<option value="${esc(slug)}">${esc(label)}</option>`;
  const points = eventsToPoints(events, '');
  const browse = `<div class="browse">
    <div><span class="browse-label">Browse breeds</span>${breeds.map((b) => chip(humanizeBreed(b), breedUrl('', b))).join('')}</div>
    <div><span class="browse-label">Browse cities</span>${metros.map((m) => chip(metroLabels[m] || humanizeMetro(m), metroUrl('', m))).join('')}</div>
  </div>`;

  const body = `${topbar('', '')}<header class="app">
    <h1>${G.shihTzuMark('hero-pup')}pup-meetup <small>— upcoming dog meetups</small></h1>
    <div class="controls">
      <select id="breed"><option value="">Any breed</option>${breeds.map((b) => opt(b, humanizeBreed(b))).join('')}</select>
      <select id="metro"><option value="">Any location</option>${metros.map((m) => opt(m, metroLabels[m] || humanizeMetro(m))).join('')}</select>
      <button id="go" type="button">Find meetups →</button>
    </div>
  </header>
  ${demo ? '<div class="demo-banner">⚠️ Demo data — sample events for UI testing, not real listings.</div>' : ''}
  <main class="split">
    <section id="list"><p class="count">${events.length} upcoming meetup${events.length === 1 ? '' : 's'}</p>${browse}${eventListHtml(events, '', { now })}</section>
    <div id="map" class="map"></div>
  </main>
  <script src="${LEAFLET_JS}"></script>
  <script>
  (function(){var pts=${jsonScript(points)};var map=L.map('map');
   L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19,attribution:'&copy; OpenStreetMap contributors'}).addTo(map);
   var b=[];for(var i=0;i<pts.length;i++){var p=pts[i];
     if(p.approx){L.circle([p.lat,p.lng],{radius:2500,color:'#7c4dff',weight:1,fillColor:'#7c4dff',fillOpacity:0.12}).addTo(map).bindPopup(p.popup);}
     else{L.marker([p.lat,p.lng]).addTo(map).bindPopup(p.popup);}
     b.push([p.lat,p.lng]);}
   if(b.length)map.fitBounds(b,{padding:[40,40],maxZoom:13});else map.setView([39.5,-98.35],4);})();
  ${NAV_SCRIPT.replace('__PAIRS__', jsonScript(pairs)).replace('__MLABEL__', jsonScript(metroLabels))}
  </script>`;
  return pageLayout({ title: 'pup-meetup — upcoming dog meetups', description: 'Discover upcoming breed-specific dog meetups by breed and location.', body, leaflet: true });
}

export function renderOrgPage(org, events, base, { now = new Date() } = {}) {
  const sourceLinks = sourceLinksHtml(org.sources);
  const breeds = (org.breeds && org.breeds.length) ? org.breeds : [...new Set(events.flatMap((e) => e.breeds || []))];
  const agenda = events.length
    ? eventListHtml(events, base, { now })
    : `<p class="empty">No upcoming dates parsed yet${sourceLinks ? ' — follow the links above for meetup announcements.' : '.'}</p>`;
  const body = `${topbar(base)}<div class="wrap">
    <p class="breadcrumb"><a href="${homeUrl(base)}">← all meetups</a></p>
    <div class="org-header">${avatar(org.name)}<h1>${esc(org.name)}</h1></div>
    <div class="tags">${org.metro ? chip(humanizeMetro(org.metro), metroUrl(base, org.metro)) : ''}${breeds.map((b) => chip(humanizeBreed(b), breedUrl(base, b))).join('')}</div>
    ${sourceLinks ? `<p class="sources" style="margin-top:10px">${sourceLinks}</p>` : ''}
    <p class="count" style="margin-top:14px">${events.length} upcoming meetup${events.length === 1 ? '' : 's'}</p>
    ${agenda}
  </div>`;
  return pageLayout({ title: `${org.name} — pup-meetup`, description: `Upcoming meetups from ${org.name}.`, body });
}

export function renderBreedPage(breedSlug, events, base, { now = new Date(), metros = [], orgs = [] } = {}) {
  const label = humanizeBreed(breedSlug);
  const byCity = metros.length
    ? `<div class="browse"><span class="browse-label">By city</span>${metros.map((m) => chip(humanizeMetro(m), findUrl(base, breedSlug, m))).join('')}</div>` : '';
  const body = `${topbar(base)}<div class="wrap">
    <p class="breadcrumb"><a href="${homeUrl(base)}">← all meetups</a></p>
    <h1>${esc(label)} meetups</h1>
    <p class="count">${events.length} upcoming ${esc(label)} meetup${events.length === 1 ? '' : 's'}</p>
    ${byCity}
    ${events.length ? eventListHtml(events, base, { now }) : ''}
    ${communitiesSection(orgs, base, `${label} communities`)}
    ${!events.length && !orgs.length ? '<p class="empty">No upcoming meetups here yet — check back soon.</p>' : ''}
  </div>`;
  return pageLayout({ title: `${label} dog meetups — pup-meetup`, description: `Upcoming ${label} dog meetups.`, body });
}

export function renderMetroPage(metroSlug, events, base, { now = new Date(), orgs = [] } = {}) {
  const label = humanizeMetro(metroSlug);
  const breeds = [...new Set([...events.flatMap((e) => e.breeds || []), ...orgs.flatMap((o) => o.breeds || [])])];
  const byBreed = breeds.length
    ? `<div class="browse"><span class="browse-label">By breed</span>${breeds.map((b) => chip(humanizeBreed(b), findUrl(base, b, metroSlug))).join('')}</div>` : '';
  const body = `${topbar(base)}<div class="wrap">
    <p class="breadcrumb"><a href="${homeUrl(base)}">← all meetups</a></p>
    <h1>Dog meetups in ${esc(label)}</h1>
    <p class="count" style="margin-top:10px">${events.length} upcoming meetup${events.length === 1 ? '' : 's'}</p>
    ${byBreed}
    ${events.length ? eventListHtml(events, base, { now }) : ''}
    ${communitiesSection(orgs, base, `Communities in ${label}`)}
    ${!events.length && !orgs.length ? '<p class="empty">No upcoming meetups here yet — check back soon.</p>' : ''}
  </div>`;
  return pageLayout({ title: `Dog meetups in ${label} — pup-meetup`, description: `Upcoming dog meetups in ${label}.`, body });
}

export function renderFindPage(breedSlug, metroSlug, events, base, { now = new Date(), orgs = [] } = {}) {
  const bl = humanizeBreed(breedSlug);
  const ml = humanizeMetro(metroSlug);
  const body = `${topbar(base)}<div class="wrap">
    <p class="breadcrumb"><a href="${homeUrl(base)}">← all meetups</a> · <a href="${breedUrl(base, breedSlug)}">${esc(bl)}</a> · <a href="${metroUrl(base, metroSlug)}">${esc(ml)}</a></p>
    <h1>${esc(bl)} meetups in ${esc(ml)}</h1>
    <p class="count">${events.length} upcoming meetup${events.length === 1 ? '' : 's'}</p>
    ${events.length ? eventListHtml(events, base, { now }) : ''}
    ${communitiesSection(orgs, base, `${bl} communities in ${ml}`)}
    ${!events.length && !orgs.length ? '<p class="empty">No upcoming meetups here yet — check back soon.</p>' : ''}
  </div>`;
  return pageLayout({ title: `${bl} meetups in ${ml} — pup-meetup`, description: `Upcoming ${bl} dog meetups in ${ml}.`, body });
}

export function renderEventPage(ev, base, { now = new Date() } = {}) {
  const loc = ev.location || {};
  const precise = loc.lat != null && loc.lng != null && !loc.approx;
  const maps = precise ? mapsLink(ev) : null;
  const locText = precise
    ? (loc.address || loc.name || 'See source for location')
    : (loc.name ? `Near ${loc.name} — exact spot not confirmed` : 'Exact location not confirmed');
  const desc = ev.sources?.find((s) => s.raw_text)?.raw_text;
  const validSources = (ev.sources || []).filter((s) => s.post_url);
  const sourceLinks = validSources
    .map((s, i) => `<a href="${esc(s.post_url)}">source${validSources.length > 1 ? ' ' + (i + 1) : ''} ↗</a>`).join(' · ');
  const body = `${topbar(base)}<div class="wrap detail">
    <p class="breadcrumb"><a href="${homeUrl(base)}">← all meetups</a></p>
    <h1>${esc(ev.title)}</h1>
    <div class="when">${esc(fmtDate(ev.start, ev.timezone))}${ev.recurrence_label ? ` · ${esc(ev.recurrence_label)}` : ''}</div>
    <div class="meta" style="color:var(--muted);margin-top:4px">📍 ${esc(locText)}${precise ? '' : ' <span class="approx">(approximate)</span>'}</div>
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
    <div class="confirm">⚠️ This listing is auto-collected and may be imperfect — always confirm the date, time, and exact location at the source before you go${sourceLinks ? `: ${sourceLinks}` : '.'}</div>
    ${desc ? `<div class="desc">${esc(desc)}</div>` : ''}
  </div>`;
  return pageLayout({ title: `${ev.title} — pup-meetup`, description: `${ev.title} on ${fmtDate(ev.start, ev.timezone)}.`, body });
}

export function renderAboutPage(base, { now = new Date() } = {}) {
  const body = `${topbar(base, 'about')}${G.cornerPaws()}<div class="wrap prose">
    <h1>About pup-meetup</h1>
    <p class="lede">A free, friendly directory of dog meetups — find what's happening near you, starting with Shih&nbsp;Tzu.</p>
    <p>Dog meetups get announced all over the place — one group on Instagram, another on Meetup, a flyer somewhere else. pup-meetup gathers them into one spot, so you can see what's coming up near you, browse by breed and city, and find it on a map.</p>
    ${G.pawDivider()}
    <h2>Always double-check before you go</h2>
    <p>We bring these listings together from what organizers share publicly, so a detail can occasionally be out of date. We're especially careful with locations: if we're not sure exactly where a meetup is, we show a general area on the map instead of a pin, and we say so. <strong>Always confirm the date, time, and place with the organizer before you head out.</strong></p>

    <h2>Free, no catch</h2>
    <p>pup-meetup is a small passion project. It's free, there are no ads, and you don't need an account or a login. Notice something that looks wrong? Email us at <a href="mailto:${CONTACT_EMAIL}">${CONTACT_EMAIL}</a> — we'd genuinely love to hear from you.</p>

    <h2>Run a dog-meetup group?</h2>
    <p>We'd love to include you. <a href="${getListedUrl(base)}">Here's how to get listed →</a></p>
  </div>`;
  return pageLayout({ title: 'About — pup-meetup', description: 'What pup-meetup is, and why you should always confirm meetup details with the organizer.', body });
}

export function renderGetListedPage(base, { now = new Date() } = {}) {
  const body = `${topbar(base, 'get-listed')}${G.cornerPaws()}<div class="wrap prose">
    <h1>Get your community listed</h1>
    <p class="lede">Run a dog-meetup group? We'd love to add you to pup-meetup. It's free, and it's just one email — no account, no sign-up.</p>
    <p><a class="cta" href="${SUBMIT_MAILTO}">✉️ Email us to get listed</a></p>
    <p class="count">Or write to us directly at <a href="mailto:${CONTACT_EMAIL}">${CONTACT_EMAIL}</a>.</p>
    ${G.pawDivider()}
    <h2>Just tell us</h2>
    <ul>
      <li>Your group or community name</li>
      <li>Your city or town</li>
      <li>What breed(s) — we started with Shih&nbsp;Tzu, but tell us yours</li>
      <li>Where you post your meetups — an Instagram, Meetup, Eventbrite, or website link</li>
    </ul>

    <h2>A few tips so your meetups show up right</h2>
    <ul>
      <li>Put the <strong>date, start time, and address right on your flyer or post</strong> — that's what people look for.</li>
      <li>Use a <strong>real, specific address</strong>. If a spot just says "DM for the location," we'll leave it off the map rather than guess.</li>
      <li>Post <strong>upcoming</strong> dates — we only show meetups that haven't happened yet.</li>
    </ul>

    <div class="callout">📍 We'll never drop a map pin somewhere we're not sure about — we never want to send anyone to the wrong place. Clear, accurate addresses help everyone.</div>
  </div>`;
  return pageLayout({ title: 'Get listed — pup-meetup', description: 'How dog-meetup organizers can get their community listed on pup-meetup — just send us an email.', body });
}

function labelForType(type) {
  return ({ meetup_ics: 'Meetup', ics: 'Calendar', eventbrite: 'Eventbrite', rss: 'Website', facebook_page: 'Facebook', facebook_group: 'Facebook group' })[type] || 'Link';
}
