// Hand-authored, license-free inline SVG graphics (zero-dependency).
//
// Everything here is either original artwork (paws, the Shih Tzu mark, the
// skyline glyph) or a US municipal flag whose DESIGN is public domain, redrawn
// from scratch as simple shapes. So it can all live in the repo with no
// attribution and no external requests. Marks that should inherit text color use
// fill="currentColor" (paws, skyline); flags carry their own colors.

// Star polygon generator (build-time; plain Node, Math is fine here).
// points=6 → six-pointed (Chicago); points=5 → five-pointed (DC).
function starPoints(cx, cy, R, points, ratio, rotDeg = -90) {
  const out = [];
  const half = Math.PI / points;
  for (let i = 0; i < points * 2; i++) {
    const r = i % 2 === 0 ? R : R * ratio;
    const a = (rotDeg * Math.PI) / 180 + i * half;
    out.push(`${(cx + r * Math.cos(a)).toFixed(1)},${(cy + r * Math.sin(a)).toFixed(1)}`);
  }
  return out.join(' ');
}
const star6 = (cx, cy, R) => starPoints(cx, cy, R, 6, 0.5774); // hexagram
const star5 = (cx, cy, R) => starPoints(cx, cy, R, 5, 0.382); // pentagram

// ---- paw print: one pad + four toes, recolors via currentColor ----
export const pawSvg = (cls = '') =>
  `<svg class="paw${cls ? ' ' + cls : ''}" viewBox="0 0 100 100" aria-hidden="true" focusable="false" fill="currentColor">`
  + '<ellipse cx="50" cy="68" rx="23" ry="19"/>'
  + '<ellipse cx="22" cy="45" rx="8.5" ry="11.5"/>'
  + '<ellipse cx="40" cy="30" rx="9" ry="12.5"/>'
  + '<ellipse cx="60" cy="30" rx="9" ry="12.5"/>'
  + '<ellipse cx="78" cy="45" rx="8.5" ry="11.5"/></svg>';

// A little trail of paw prints as a section divider (an HR with personality).
export const pawDivider = () =>
  `<div class="pawhr" role="separator" aria-hidden="true"><span></span>${pawSvg('p1')}${pawSvg('p2')}${pawSvg('p3')}<span></span></div>`;

// Faint decorative paws anchored to the page corners (the "breed art around the
// edges" idea — generic paws for now, swappable for breed silhouettes later).
export const cornerPaws = () =>
  `<div class="corner-paws" aria-hidden="true">${pawSvg('cp cp1')}${pawSvg('cp cp2')}${pawSvg('cp cp3')}</div>`;

// ---- city badges ----
// Chicago: white field, two light-blue bars, four red six-pointed stars (PD).
export const chicagoFlag = (cls = '') =>
  `<svg class="flag${cls ? ' ' + cls : ''}" viewBox="0 0 600 400" aria-hidden="true" focusable="false">`
  + '<rect width="600" height="400" fill="#fff"/>'
  + '<rect y="66.7" width="600" height="66.6" fill="#41b6e6"/>'
  + '<rect y="266.7" width="600" height="66.6" fill="#41b6e6"/>'
  + '<g fill="#ff0000">'
  + `<polygon points="${star6(120, 200, 34)}"/>`
  + `<polygon points="${star6(240, 200, 34)}"/>`
  + `<polygon points="${star6(360, 200, 34)}"/>`
  + `<polygon points="${star6(480, 200, 34)}"/>`
  + '</g></svg>';

// Washington DC: white field, three red five-pointed stars over two red bars (PD).
export const dcFlag = (cls = '') =>
  `<svg class="flag${cls ? ' ' + cls : ''}" viewBox="0 0 720 400" aria-hidden="true" focusable="false">`
  + '<rect width="720" height="400" fill="#fff"/>'
  + '<g fill="#e2231a">'
  + `<polygon points="${star5(180, 102, 47)}"/>`
  + `<polygon points="${star5(360, 102, 47)}"/>`
  + `<polygon points="${star5(540, 102, 47)}"/>`
  + '<rect y="208" width="720" height="56"/>'
  + '<rect y="296" width="720" height="56"/>'
  + '</g></svg>';

// Uniform fallback for metros without a clean flag: a simple skyline glyph.
export const skylineSvg = (cls = '') =>
  `<svg class="city${cls ? ' ' + cls : ''}" viewBox="0 0 100 60" aria-hidden="true" focusable="false" fill="currentColor">`
  + '<rect x="4" y="30" width="14" height="30"/>'
  + '<rect x="22" y="16" width="16" height="44"/>'
  + '<polygon points="30,6 34,16 26,16"/>'
  + '<rect x="42" y="36" width="12" height="24"/>'
  + '<rect x="58" y="10" width="14" height="50"/>'
  + '<rect x="76" y="24" width="16" height="36"/></svg>';

// Pick a badge for a metro: real flag where it's clean, skyline glyph otherwise.
export function cityBadge(metro) {
  if (metro === 'chicago') return chicagoFlag('badge');
  if (metro === 'dc') return dcFlag('badge');
  return skylineSvg('badge');
}

// ---- Shih Tzu brand mark (original artwork, first stab) ----
// A cute fluffy lapdog face: floppy ears, fluffy crown, big eyes, beard, and a
// little top-knot bow in the brand purple. Not a pedigree portrait — a friendly
// mascot. Fall back to a plain dog emoji if you'd rather, but this is ours.
export const shihTzuMark = (cls = '') =>
  `<svg class="pup${cls ? ' ' + cls : ''}" viewBox="0 0 120 120" aria-hidden="true" focusable="false">`
  // floppy ears (back)
  + '<ellipse cx="26" cy="72" rx="19" ry="32" fill="#b89a82" transform="rotate(15 26 72)"/>'
  + '<ellipse cx="94" cy="72" rx="19" ry="32" fill="#b89a82" transform="rotate(-15 94 72)"/>'
  + '<ellipse cx="29" cy="75" rx="8" ry="17" fill="#d8c3b1" transform="rotate(15 29 75)"/>'
  + '<ellipse cx="91" cy="75" rx="8" ry="17" fill="#d8c3b1" transform="rotate(-15 91 75)"/>'
  // fluffy crown
  + '<circle cx="45" cy="37" r="13" fill="#efe4d3"/>'
  + '<circle cx="60" cy="31" r="14" fill="#efe4d3"/>'
  + '<circle cx="75" cy="37" r="13" fill="#efe4d3"/>'
  // face + beard
  + '<circle cx="60" cy="66" r="37" fill="#f6eedd"/>'
  + '<ellipse cx="60" cy="89" rx="22" ry="15" fill="#fcf7ee"/>'
  // eyes
  + '<ellipse cx="47" cy="66" rx="5.5" ry="6.5" fill="#3a3330"/>'
  + '<ellipse cx="73" cy="66" rx="5.5" ry="6.5" fill="#3a3330"/>'
  + '<circle cx="48.7" cy="63.8" r="1.7" fill="#fff"/>'
  + '<circle cx="74.7" cy="63.8" r="1.7" fill="#fff"/>'
  // nose + mouth + tongue
  + '<ellipse cx="60" cy="80" rx="6" ry="4.5" fill="#3a3330"/>'
  + '<path d="M60 84 q-6 7 -12 3" fill="none" stroke="#3a3330" stroke-width="2" stroke-linecap="round"/>'
  + '<path d="M60 84 q6 7 12 3" fill="none" stroke="#3a3330" stroke-width="2" stroke-linecap="round"/>'
  + '<ellipse cx="60" cy="92" rx="3.6" ry="5" fill="#f29b9b"/>'
  // top-knot bow (brand purple)
  + '<g fill="#7c4dff">'
  + '<polygon points="60,25 45,15 49,32"/>'
  + '<polygon points="60,25 75,15 71,32"/>'
  + '<circle cx="60" cy="25" r="4.5"/>'
  + '</g></svg>';

// Inline SVG favicon (purple paw) as a data URI — no asset file, no request.
export const FAVICON = 'data:image/svg+xml,' + encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><g fill="#7c4dff">'
  + '<ellipse cx="50" cy="68" rx="23" ry="19"/><ellipse cx="22" cy="45" rx="8.5" ry="11.5"/>'
  + '<ellipse cx="40" cy="30" rx="9" ry="12.5"/><ellipse cx="60" cy="30" rx="9" ry="12.5"/>'
  + '<ellipse cx="78" cy="45" rx="8.5" ry="11.5"/></g></svg>');
