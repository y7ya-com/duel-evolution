// The card shop's art as CSS / SVG (the owner's Skin rule, CONTRACT.md: sharp at any DPR, the original's sampled
// colours), one recipe per data/shop texture, so screens/shop.js can draw whatever sprite the engine shows where the
// snapshot puts it. Every recipe draws the texture's opaque pixels at their own texel place (x, y = the sprite's
// top left), so a recipe stands in for its bitmap 1:1. Colours sampled from the textures' texels (data/shop/*.png in
// merge.dat; rows / columns named per piece). Real pictures (the category banners' card / pack / avatar art, card art,
// pack art, avatars) are not here: the engine keeps drawing them.
import { FONT, spacing } from './basic.js';
import { frameVars } from '../screens/dialog.js';

// ---------------------------------------------------------------- SVG plumbing
// One SVG document per look, as a data: URL (cached): ids can't collide, and the browser rasterises it at the device's
// resolution (crisp at 2x where the 1x bitmap was soft).
const urls = new Map();
const svgUrl = (key, w, h, body) => {
  let u = urls.get(key);
  if (!u) {
    u = `url("data:image/svg+xml,${encodeURIComponent(`<svg xmlns='http://www.w3.org/2000/svg' width='${w}' height='${h}' viewBox='0 0 ${w} ${h}' shape-rendering='geometricPrecision'>${body}</svg>`)}")`;
    urls.set(key, u);
  }
  return u;
};
const path = P => 'M' + P.map(p => p.join(' ')).join('L') + 'Z';
// A polygon (clockwise, y down) moved in by d px on every edge (d: a number, or one per edge, edge i = P[i] -> P[i+1])
export function inset(P, d) {
  const n = P.length, D = typeof d === 'number' ? P.map(() => d) : d;
  const L = P.map((p, i) => {
    const q = P[(i + 1) % n], dx = q[0] - p[0], dy = q[1] - p[1], len = Math.hypot(dx, dy), nx = -dy / len, ny = dx / len;
    return { x: p[0] + nx * D[i], y: p[1] + ny * D[i], dx, dy };
  });
  return L.map((a, i) => {
    const b = L[(i + n - 1) % n], den = b.dx * a.dy - b.dy * a.dx;
    if (Math.abs(den) < 1e-9) return [a.x, a.y];
    const t = ((a.x - b.x) * a.dy - (a.y - b.y) * a.dx) / den;
    return [+(b.x + b.dx * t).toFixed(3), +(b.y + b.dy * t).toFixed(3)];
  });
}
// a vertical gradient in user space: stops [[y, colour], ...] (pixel rows: y + 0.5 is the row's centre)
const vgrad = (id, stops, x = false) => {
  const a = stops[0][0], b = stops.at(-1)[0], k = b - a || 1;
  return `<linearGradient id='${id}' gradientUnits='userSpaceOnUse' ${x ? `x1='${a}' x2='${b}' y1='0' y2='0'` : `x1='0' x2='0' y1='${a}' y2='${b}'`}>${
    stops.map(([y, c]) => `<stop offset='${((y - a) / k).toFixed(4)}' stop-color='${c}'/>`).join('')}</linearGradient>`;
};

let injected = false;
const CSS = `
.shop-pc { position: absolute; left: 0; top: 0; pointer-events: none; background-repeat: no-repeat; background-size: 100% 100%; }
.shop-btn { position: absolute; margin: 0; padding: 0; border: 0; background: none; font: inherit; color: inherit; cursor: inherit; }
.shop-txt { position: absolute; white-space: pre; font-family: ${FONT}; }
/* CWindowTaskFrameThin, as screens/dialog.js draws it (its .dlg-frame: the same bevel per style, frameVars) */
.shop-frame { position: absolute; box-sizing: border-box; border-style: solid; border-width: 3px 2px 2px 3px;
  border-color: var(--t) var(--r) var(--b) var(--l); clip-path: polygon(0 0, 100% 0, 100% calc(100% - 4px), calc(100% - 4px) 100%, 0 100%); }
.shop-frame::before { content: ''; position: absolute; inset: 0; border: 1px solid; border-color: var(--t1) var(--r1) var(--b1) var(--l1); }
.shop-frame::after { content: ''; position: absolute; inset: 1px; border: 1px solid; border-color: var(--t2) var(--r2) var(--b2) var(--l2);
  box-shadow: inset 0 0 0 2px var(--body); }
.shop-frame > i { position: absolute; left: 4px; top: 4px; right: 4px; bottom: 4px; border: 1px solid var(--ringm); box-shadow: inset -1px -1px 0 0 var(--ring); }
.shop-banner-t { position: absolute; left: 0; top: 0; font-family: ${FONT}; font-weight: bold; color: #fff; white-space: nowrap;
  text-shadow: 2px 0 #000, -2px 0 #000, 0 2px #000, 0 -2px #000, 1.4px 1.4px #000, -1.4px 1.4px #000, 1.4px -1.4px #000, -1.4px -1.4px #000,
    2px 1px #000, -2px 1px #000, 2px -1px #000, -2px -1px #000, 1px 2px #000, -1px 2px #000, 1px -2px #000, -1px -2px #000; }
@keyframes shop-glow { 0% { opacity: .40; } 50% { opacity: .70; } 100% { opacity: .40; } }
@keyframes shop-nudge { 0%, 100% { transform: translateX(0); } 50% { transform: translateX(4px); } }
@keyframes shop-nudge-r { 0%, 100% { transform: scale(-1, -1) translateX(0); } 50% { transform: scale(-1, -1) translateX(4px); } }
.shop-pill[data-state=hover] .shop-pill-glow { animation: shop-glow .8s linear infinite; }
.shop-pill[data-state=hover] .shop-pill-l { animation: shop-nudge .8s linear infinite; }
.shop-pill[data-state=hover] .shop-pill-r { animation: shop-nudge-r .8s linear infinite; }
`;
export function inject() {
  if (injected || typeof document === 'undefined' || document.getElementById('htmlui-shop')) return;
  injected = true;
  const st = document.createElement('style');
  st.id = 'htmlui-shop';
  st.textContent = CSS;
  document.head.append(st);
}
// CWindowTaskFrameThin (style: window_base_01_c0<style>'s colours, dialog.js FRAME) and CWindowTaskBackPlane (the
// atlas's white middle), at the control's alpha
export function thinFrame(parent, { x, y, w, h, style = 1, alpha = 0.7 }) {
  const f = document.createElement('div');
  f.className = 'shop-frame';
  Object.assign(f.style, { left: x + 'px', top: y + 'px', width: w + 'px', height: h + 'px', opacity: alpha });
  for (const [k, v] of Object.entries(frameVars(style, 0))) f.style.setProperty(k, v);
  f.append(document.createElement('i'));
  parent.append(f);
  return f;
}
export const backPlane = (parent, { x, y, w, h, alpha = 0.7 }) => piece(parent, x, y, w, h, { background: '#fff', opacity: alpha });
// a piece: an absolutely placed box with an SVG (or CSS) look
export function piece(parent, x, y, w, h, look = {}) {
  const d = document.createElement('div');
  d.className = 'shop-pc';
  Object.assign(d.style, { left: x + 'px', top: y + 'px', width: w + 'px', height: h + 'px' }, look);
  parent.append(d);
  return d;
}

// ---------------------------------------------------------------- the item panel (shop_win_01_c01, 512 x 512)
// Texel for texel (the texture's straight-alpha rows / columns): x 0 #c8c8c8 and x 1..7 #fff (rows 0..505), x 504
// #c8c8c8 and 505..511 #fff, rows 0..6 and 499..505 #fff, row 506 #dcdcdc (x 0 #c6c6c6), row 7 #dcdcdc, all 204 / 255;
// the body #dbe4e5 at 179 / 255 (a faint brushed texture, flat here) with a shade along the top (rows 8..14) and
// the right (x 496..503), the darker of the two where they meet; row 498 one step of it; a black drop shadow under it
// (rows 507..511: 134, 116, 92, 61, 37 / 255, fading out over x 504..511).
const PANEL_SHADE = [['#b3babb', 219], ['#b8bdc0', 214], ['#bfc6c9', 206], ['#c7cfd0', 197], ['#cdd7d8', 190], ['#d5dee1', 184], ['#d8e1e3', 181]];
const rgba = (hex, a) => `rgba(${parseInt(hex.slice(1, 3), 16)},${parseInt(hex.slice(3, 5), 16)},${parseInt(hex.slice(5, 7), 16)},${(a / 255).toFixed(3)})`;
export function panel(parent, x, y) {
  const r = (x, y, w, h, c) => `<rect x='${x}' y='${y}' width='${w}' height='${h}' fill='${c}'/>`;
  const W = rgba('#ffffff', 204), out = [];
  out.push(r(0, 0, 1, 506, rgba('#c8c8c8', 204)), r(0, 506, 1, 1, rgba('#c6c6c6', 204)), r(1, 0, 7, 506, W), r(1, 506, 503, 1, rgba('#dcdcdc', 204)),
    r(8, 0, 496, 7, W), r(8, 7, 496, 1, rgba('#dcdcdc', 204)), r(8, 499, 496, 7, W),
    r(504, 0, 1, 7, W), r(504, 7, 1, 1, rgba('#e2e2e2', 204)), r(504, 8, 1, 491, rgba('#c8c8c8', 204)), r(504, 499, 1, 1, rgba('#f6f6f6', 204)), r(504, 500, 1, 6, W),
    r(505, 0, 7, 506, W), r(504, 506, 8, 1, rgba('#dcdcdc', 204)));
  // the body, then the shades beside it (each texel once: straight alpha, nothing composed over the body): row i of
  // the top (8 + i), column j of the right (503 - j), the corner the darker
  out.push(r(8, 15, 488, 483, rgba('#dbe4e5', 179)));
  for (let i = 0; i < 7; i++) out.push(r(8, 8 + i, 488, 1, rgba(...PANEL_SHADE[i])));
  const col = (j, i = 6) => j === 0 ? ['#b0b7b9', 223] : PANEL_SHADE[Math.min(i, j - 1)];   // x 503 - j (at top row 8 + i)
  for (let j = 0; j < 8; j++) out.push(r(503 - j, 15, 1, 483, rgba(...col(j))));
  out.push(r(8, 498, 488, 1, rgba(...PANEL_SHADE[6])));
  for (let i = 0; i < 7; i++) for (let j = 0; j < 8; j++) out.push(r(503 - j, 8 + i, 1, 1, rgba(...col(j, i))));
  for (let j = 0; j < 8; j++) out.push(r(503 - j, 498, 1, 1, rgba(...col(j))));
  const fade = [88, 81, 70, 55, 37, 22, 10, 3];
  [134, 116, 92, 61, 37].forEach((a, i) => {
    out.push(r(0, 507 + i, 504, 1, `rgba(0,0,0,${(a / 255).toFixed(3)})`));
    fade.forEach((f, j) => out.push(r(504 + j, 507 + i, 1, 1, `rgba(0,0,0,${(a * f / 92 / 255).toFixed(3)})`)));
  });
  return piece(parent, x, y, 512, 512, { backgroundImage: svgUrl('panel', 512, 512, `<g shape-rendering='crispEdges'>${out.join('')}</g>`) });
}

// ---------------------------------------------------------------- the title band (shop_win_00_01c, 512 x 91)
// A brushed steel band (diagonal brush strokes "/" every 4 px across, +-9 levels: rows 30 / 31 of the texture): x 0..5 / 506..511 #8da4af, the middle #8597a1 (row 0) > #6c828d (20) > #566c77 (48) >
// #3b525d (84) (column 256, its noise averaged), rows 85..90 #8aa2af.
export function band(parent, x, y) {
  return piece(parent, x, y, 512, 91, {
    background: `linear-gradient(to right, #8da4af 6px, transparent 6px, transparent 506px, #8da4af 506px),
      repeating-linear-gradient(135deg, rgba(255,255,255,.045) 0, rgba(0,0,0,.045) 1.414px, rgba(255,255,255,.045) 2.828px) 0 0 / 100% 85px no-repeat,
      linear-gradient(to bottom, #8597a1 0, #7a8e98 10px, #6c828d 20px, #627783 33px, #566c77 48px, #4c626d 60px, #445967 70px, #3b525d 85px, #8aa2af 85px)` });
}

// ---------------------------------------------------------------- the item banner (shop_Introduction_0n_?, 256 x 36)
// The English art (_e; the others are the same bar): a black 1-px border round 256 x 36, a glossy cyan bar: column 5
// rows 1 #23b0ed, 2 #a5e2f8, 3..14 #37c3f1 > #64d0f1, 15..21 #3cc3ec > #2fb4dc, 22 #5cffff, 23..25 #2db2d8 #36c3df
// #29abd1, 26..31 #50feff > #3effff, 32 #1d95ba, 33 #061f28, 34 #126e9f; x 1 / 2 a light edge (#2af4ff, #70ffff);
// the caption white, outlined black (the art's own lettering: Arial bold here, the owner's Text rule).
// Captions per texture (the English art's words: the game draws them, there is no text id behind them), with where
// the art letters them: [text, outline left, outline right, baseline] (the white capitals 17 px tall, a 2 px black
// outline): Arial bold at the art's cap height, spaced to the art's width
export const BANNER = { 1: ['Item Selection', 37, 219, 27], 2: ['Single Cards', 48, 214, 27], 3: ['Avatar Parts', 34, 210, 25],
  4: ['Booster Packs', 32, 222, 26] };
const CAP = 16.5, BPX = +(CAP / 0.716).toFixed(2);   // Arial's cap height: 0.716 em
let bm;
export function banner(parent, x, y, cap) {
  const u = svgUrl('banner', 256, 36, `
    <defs>${vgrad('g', [[1, '#23b0ed'], [2, '#a5e2f8'], [3, '#37c3f1'], [14, '#64d0f1'], [15, '#3cc3ec'], [22, '#2fb4dc'],
      [22, '#5cffff'], [23, '#5cffff'], [23, '#2db2d8'], [24, '#36c3df'], [25, '#29abd1'], [26, '#29abd1'], [26, '#50feff'],
      [32, '#3effff'], [32, '#1d95ba'], [33, '#1d95ba'], [33, '#061f28'], [34, '#061f28'], [34, '#126e9f'], [35, '#126e9f']])}</defs>
    <rect x='0' y='0' width='256' height='36' fill='#000'/><rect x='1' y='1' width='254' height='34' fill='url(#g)'/>
    <rect x='1' y='1' width='1' height='34' fill='rgba(160,255,255,.55)'/><rect x='254' y='1' width='1' height='34' fill='rgba(160,255,255,.55)'/>`);
  const p = piece(parent, x, y, 256, 36, { backgroundImage: u });
  if (cap) {
    const [text, x0, x1, base] = cap, t = document.createElement('div');
    t.className = 'shop-banner-t';
    t.textContent = text;
    // the ink's own box (measureText's bounding box), spaced so its white spans the art's (outline 2 px each side)
    let ls = 0, left = x0 + 2;
    if (typeof document !== 'undefined' && document.createElement('canvas').getContext) {
      bm ||= document.createElement('canvas').getContext('2d');
      if (bm) {
        bm.font = `bold ${BPX}px ${FONT}`;
        const m = bm.measureText(text), ink = m.actualBoundingBoxLeft + m.actualBoundingBoxRight;
        ls = +((x1 - x0 - 4 - ink) / Math.max(1, text.length - 1)).toFixed(2);
        left = x0 + 2 + m.actualBoundingBoxLeft;
      }
    }
    // a line box 1.117 em tall puts the baseline 0.905 em down (Arial's ascent); measured live it sat 1 px high
    Object.assign(t.style, { left: left + 'px', top: +(base + 1 - 0.905 * BPX).toFixed(2) + 'px', fontSize: BPX + 'px',
      lineHeight: +(1.117 * BPX).toFixed(2) + 'px', letterSpacing: ls + 'px' });
    p.append(t);
  }
  return p;
}

// ---------------------------------------------------------------- the MP plate (shop_money_01_c01, 223 x 82)
// An octagon notched at mid-height on both sides (its outline traced from the texture's edge texels: chamfers 10 px,
// the notches from rows 33 / 50 to 8.5 px deep at rows 40.5..41.5): a black edge, a white line in it, a 3-px darker rim
// (x 2..4 #2c89a7 #30a7ce #33bce8 at row 20), two glossy halves: the top (column 110) #63d3f7 (row 5) > #47cdf7 (19) >
// #47dcf6 (29) > #5dd9f2 (35), the edges less red (x 19 #38caf0 where the middle is #47dcf5; the bottom half's more: #28a5c8 / #48b2d1 at row 55); the bottom #6dc9e4 (45) >
// #56bbd9 (50) > #2ca5c5 (62) > #1bc2d6 (73) > #1998ad #197a8b (78, 79). Between them, x 19..206 only, the glowing seam
// (rows 36..44: #7bddf2 #a6e7f6, a dark line #24a2c6, #74fcfd #74fcfd #55fafd, #5ab8d4, #aae0f1 #89d4ea), its ends soft;
// beyond it the halves meet (row 40 #2cb5de / row 41 #58c2e2 at x 14).
const MP = [[10.5, 0], [212.5, 0], [223, 10], [223, 33], [217, 39], [214.5, 40.5], [214.5, 41.5], [223, 50], [223, 73], [214, 82], [9, 82],
  [0, 73], [0, 50], [8.5, 41.5], [8.5, 40.5], [6, 39], [0, 33], [0, 10]];
export function mpPlate(parent, x, y) {
  const seam = [[36, '#7bddf2'], [37, '#a6e7f6'], [38, '#24a2c6'], [39, '#74fcfd'], [40, '#74fcfd'], [41, '#55fafd'], [42, '#5ab8d4'], [43, '#aae0f1'], [44, '#89d4ea']];
  const u = svgUrl('mp', 223, 82, `
    <defs>${vgrad('g', [[2, '#4d92a9'], [3, '#59b3cf'], [4, '#61c9ea'], [5, '#65d3f7'], [12, '#5ed2f7'], [19, '#49cdf6'], [29, '#47dcf6'], [33, '#43d7f2'],
      [35, '#4fd8f2'], [37, '#45d0f0'], [40, '#38c4ea'], [41, '#38c4ea'], [41, '#62c8e5'], [44, '#62c4e2'], [46, '#5cc1df'], [50, '#56bbd9'],
      [56, '#43b0cf'], [62, '#2ca5c5'], [68, '#1bb0ca'], [73, '#1bc2d6'], [76, '#1bc0d5'], [77.5, '#1aafc5'], [78.5, '#1998ad'], [80, '#197a8b']])}
      ${vgrad('h', [[2, 'rgba(0,165,230,.3)'], [35, 'rgba(0,165,230,.12)'], [80, 'rgba(0,165,230,0)'], [143, 'rgba(0,165,230,0)'], [188, 'rgba(0,165,230,.12)'], [221, 'rgba(0,165,230,.3)']], true)}
      ${vgrad('k', [[2, 'rgba(0,140,190,.35)'], [50, 'rgba(0,140,190,.12)'], [100, 'rgba(0,140,190,0)'], [123, 'rgba(0,140,190,0)'], [173, 'rgba(0,140,190,.12)'], [221, 'rgba(0,140,190,.35)']], true)}
      ${vgrad('s', [[16, 'rgba(255,255,255,0)'], [20, '#fff'], [205, '#fff'], [209, 'rgba(255,255,255,0)']], true)}
      <mask id='m'><rect x='0' y='0' width='223' height='82' fill='url(#s)'/></mask>
      <clipPath id='c'><path d='${path(inset(MP, 2))}'/></clipPath></defs>
    <path d='${path(MP)}' fill='#000'/><path d='${path(inset(MP, 1))}' fill='#fff'/>
    <g clip-path='url(#c)'><rect width='223' height='82' fill='url(#g)'/><rect width='223' height='41' fill='url(#h)'/><rect y='41' width='223' height='41' fill='url(#k)'/>
      <g mask='url(#m)'>${seam.map(([r, c]) => `<rect x='16' y='${r}' width='193' height='1' fill='${c}'/>`).join('')}</g>
      <path d='${path(inset(MP, 2.5))}' fill='none' stroke='#2c89a7' stroke-opacity='.75' stroke-width='1'/>
      <path d='${path(inset(MP, 3.5))}' fill='none' stroke='#30a7ce' stroke-opacity='.55' stroke-width='1'/>
      <path d='${path(inset(MP, 4.5))}' fill='none' stroke='#33bce8' stroke-opacity='.3' stroke-width='1'/></g>`);
  return piece(parent, x, y, 223, 82, { backgroundImage: u });
}

// ---------------------------------------------------------------- price tags (shop_pricetag_01..06_c01, 128 x 256)
// The tag: a chamfered plate 96 x 48 at (0, 207) (+1, +1 when pressed: 03 / 05): rows 207, 208 #fff, 209 #b0c1c9;
// x 0, 1 #b2b7ba; x 93..95 #dadada #dcdcdc #dcdcdc; rows 253, 254 #54636a #536168; the body by look (column 48):
// grey 01 #e6eaed > #8c8f90, cyan 02 / 04 #7ffeff > #5bd1ff (235) > #5bbcff, pale 03 / 05 #daffff > #a5ffff,
// dark 06 #a7a7a7 > #595959. Over the item (02 / 03: rows 37..205; 04 / 05: rows 64..199; x 5..94) the corner
// brackets: 3-px L's with 20-px arms (#ffba00 edges, #fff600 middle; white edges when picked: 03 / 05), in a soft
// #ffffbe glow (137 / 255 at the stroke, gone 3 px out).
const TAG = [[7, 0], [89, 0], [96, 6], [96, 40], [88, 48], [8, 48], [0, 40], [0, 7]];
const BODY = {
  grey: [[2, '#e6eaed'], [16, '#d2d7d9'], [30, '#b7bbbd'], [44, '#8c8f90']],
  cyan: [[2, '#7ffeff'], [14, '#72eeff'], [28, '#5bd1ff'], [36, '#5bc5ff'], [45, '#5bbcff']],
  pale: [[2, '#daffff'], [18, '#c4ffff'], [34, '#acffff'], [44, '#a5ffff']],
  dark: [[2, '#a7a7a7'], [16, '#949494'], [30, '#777777'], [44, '#595959']],
};
// the chamfers (clockwise: an edge running right faces up): a diagonal facing up takes the top's light, one facing
// down the bottom's shade (2 px in)
const chamfers = (P, rim) => P.map((p, i) => {
  const q = P[(i + 1) % P.length], dx = q[0] - p[0], dy = q[1] - p[1];
  return dx && dy ? `<path d='M${p.join(' ')}L${q.join(' ')}' stroke='${dx > 0 ? rim.top[0] : rim.bottom[0]}' stroke-width='4'/>` : '';
}).join('');
function plateSvg(key, w, h, P, body, rim) {
  return svgUrl(key, w, h, `
    <defs>${vgrad('g', body)}<clipPath id='c'><path d='${path(P)}'/></clipPath></defs>
    <g clip-path='url(#c)'><rect width='${w}' height='${h}' fill='url(#g)'/>
      <rect x='0' y='0' width='${w}' height='2' fill='${rim.top[0]}'/><rect x='0' y='2' width='${w}' height='1' fill='${rim.top[1]}'/>
      <rect x='0' y='3' width='2' height='${h - 3}' fill='${rim.left}'/>
      <rect x='${w - 3}' y='3' width='1' height='${h - 3}' fill='${rim.right[0]}'/><rect x='${w - 2}' y='3' width='2' height='${h - 3}' fill='${rim.right[1]}'/>
      <rect x='0' y='${h - 2}' width='${w}' height='1' fill='${rim.bottom[0]}'/><rect x='0' y='${h - 1}' width='${w}' height='1' fill='${rim.bottom[1]}'/>
      ${chamfers(P, rim)}</g>`);
}
const TAG_RIM = { top: ['#fefefe', '#b0c1c9'], left: '#b2b7ba', right: ['#dadada', '#dcdcdc'], bottom: ['#54636a', '#536168'] };
const brackets = (key, y0, y1, edge) => svgUrl(key, 100, y1 + 4, (() => {
  const a = 20, L = 6.5, R = 92.5, T = y0 + 1.5, B = y1 - 1.5;   // the strokes' centre lines (3 px wide: x 5..7, 92..94)
  const d = `M${L} ${T + a - 1.5}V${T}H${L + a - 1.5}M${R - a + 1.5} ${T}H${R}V${T + a - 1.5}M${R} ${B - a + 1.5}V${B}H${R - a + 1.5}M${L + a - 1.5} ${B}H${L}V${B - a + 1.5}`;
  return `<defs><filter id='f' x='-10%' y='-10%' width='120%' height='120%'><feGaussianBlur stdDeviation='1.6'/></filter></defs>
    <path d='${d}' fill='none' stroke='#ffffbe' stroke-width='6' stroke-opacity='.75' filter='url(#f)' stroke-linecap='square'/>
    <path d='${d}' fill='none' stroke='${edge}' stroke-width='3' stroke-linecap='square'/>
    <path d='${d}' fill='none' stroke='#fff600' stroke-width='1' stroke-linecap='square'/>`;
})());
// look per texture: [body, pressed (+1, +1), brackets: null | [y0, y1, edge]]
export const TAGS = {
  shop_pricetag_01_c01: ['grey', 0, null], shop_pricetag_02_c01: ['cyan', 0, [37, 206, '#ffba00']],
  shop_pricetag_03_c01: ['pale', 1, [37, 206, '#fff']], shop_pricetag_04_c01: ['cyan', 0, [64, 200, '#ffba00']],
  shop_pricetag_05_c01: ['pale', 1, [64, 200, '#fff']], shop_pricetag_06_c01: ['dark', 0, null],
};
export function priceTag(parent, x, y, name) {
  const [body, k, br] = TAGS[name];
  if (br) piece(parent, x, y, 100, br[1] + 4, { backgroundImage: brackets('br' + br.join(), ...br) });
  return piece(parent, x + k, y + 207 + k, 96, 48, { backgroundImage: plateSvg('tag-' + body, 96, 48, TAG, BODY[body], TAG_RIM) });
}

// ---------------------------------------------------------------- avatar part rows (shop_avatar_01..04_c01, 400 x 40)
// The tag's plate, long: chamfered top left (9 px) and bottom right (10 px); rows 0, 1 #e2e8ec #e1e8eb, 2 #97adb8;
// x 0, 1 #7a8a94, 2 #84929a; x 397..399 #dcdcdc #a7aeb2 #a7aeb2; rows 38, 39 #54636a #536168; the body (column 200)
// grey 01 #fafafa > #9d9d9d, cyan 02 #7ffeff > #5bbcff, pale 03 (+2, +2) #daffff > #a5ffff, dark 04 #a7a7a7 > #595959.
const ROW = [[9, 0], [400, 0], [400, 30], [390, 40], [0, 40], [0, 9]];
const ROW_BODY = {
  grey: [[3, '#fafafa'], [12, '#e7e7e7'], [22, '#c7c7c7'], [32, '#a6a6a6'], [37, '#9d9d9d']],
  cyan: BODY.cyan.map(([y, c]) => [y + 1, c]), pale: BODY.pale.map(([y, c]) => [y + 1, c]),
  dark: [[3, '#a7a7a7'], [14, '#939393'], [24, '#7a7a7a'], [37, '#595959']],
};
const ROW_RIM = { top: ['#e1e8eb', '#97adb8'], left: '#7a8a94', right: ['#dcdcdc', '#a7aeb2'], bottom: ['#54636a', '#536168'] };
export const ROWS = { shop_avatar_01_c01: ['grey', 0], shop_avatar_02_c01: ['cyan', 0], shop_avatar_03_c01: ['pale', 2], shop_avatar_04_c01: ['dark', 0] };
export function itemRow(parent, x, y, name) {
  const [body, k] = ROWS[name];
  return piece(parent, x + k, y + k, 400, 40, { backgroundImage: plateSvg('row-' + body, 400, 40, ROW, ROW_BODY[body], ROW_RIM) });
}

// ---------------------------------------------------------------- page arrows (shop_arrow_04..06 right, 10..12 left, 32 x 64)
// A triangle x 3..30, rows 4..59, its point at (31, 32): edges #fa9f00 (5 px along the slants), the body #ffb532, a
// lighter strip on the flat side (x 3..6 #ffd07e > #ffd996). Hover (05): the same in a white glow (152 / 255 at the
// edge, 3 px). Pressed (06): yellow, the strip #face00 > #fac400, the body #ffdc83 > #ffd370 > #fff1bd across.
// The left ones are the same, mirrored (x 1..28).
const TRI = [[3, 3.5], [31, 32], [3, 60.5]];
// The edge band is 3.5 px (5 across); the light strip lies inside it (clipped to the inner triangle), the pressed
// one's full height, its upper band pale (#fff5d1), the lower #fde062
const arrowSvg = look => svgUrl('arrow-' + look, 32, 64, look === 'pressed' ? `
    <defs>${vgrad('g', [[7, '#ffdc83'], [12, '#ffd370'], [19, '#ffdb80'], [25, '#fff1bd']], true)}<clipPath id='c'><path d='${path(TRI)}'/></clipPath></defs>
    <g clip-path='url(#c)'><rect width='32' height='32' fill='#fff5d1'/><rect y='32' width='32' height='32' fill='#fde062'/>
      <path d='${path(inset(TRI, [3.5, 3.5, 0]))}' fill='url(#g)'/><rect x='3' y='6' width='4' height='54' fill='#facc00'/></g>` : `
    <defs>${vgrad('s', [[3, '#ffd07e'], [7, '#ffd996']], true)}<clipPath id='c'><path d='${path(TRI)}'/></clipPath>
      <clipPath id='i'><path d='${path(inset(TRI, [3.5, 3.5, 0]))}'/></clipPath></defs>
    <g clip-path='url(#c)'><rect width='32' height='64' fill='#fa9f00'/><path d='${path(inset(TRI, [3.5, 3.5, 0]))}' fill='#ffb532'/>
      <rect x='3' y='0' width='4' height='64' fill='url(#s)' clip-path='url(#i)'/></g>`);
export const ARROWS = {
  shop_arrow_04_c01: ['normal', 0], shop_arrow_05_c01: ['hover', 0], shop_arrow_06_c01: ['pressed', 0],
  shop_arrow_10_c01: ['normal', 1], shop_arrow_11_c01: ['hover', 1], shop_arrow_12_c01: ['pressed', 1],
};
export function arrow(parent, x, y, name) {
  const [look, left] = ARROWS[name];
  return piece(parent, x, y, 32, 64, { backgroundImage: arrowSvg(look === 'pressed' ? 'pressed' : 'normal'),
    transform: left ? 'scaleX(-1)' : '', filter: look === 'hover' ? 'drop-shadow(0 0 1.5px #fff) drop-shadow(0 0 1.5px #fff)' : '' });
}

// ---------------------------------------------------------------- the confirm window's buttons (shop_btn2_01..03_c01, 128 x 64)
// A 110 x 29 grey key (corners r 3) on a #646464 shadow (153 / 255, its last 2 px 115 and 38) 5 px down-right: normal rows 0..2 #fafafa #f9f9f9
// #fbfbfb, 3 #b6b7b7, the body #dddede, 25 #f8f8f8, 26..28 #bcbdbd #bfc0c0 #c1c2c2 (the sides the same across);
// hover (02) the body #fcfcfd, white edges, #c9c9c9 lines; pressed (03) the bevel turned over, the shadow 4 px.
const KEY = {
  normal: { hi: ['#fafafa', '#f9f9f9', '#fbfbfb'], line: '#b6b7b7', body: '#dddede', lo2: '#f8f8f8', lo: ['#bcbdbd', '#bfc0c0', '#c1c2c2'], sh: 5 },
  hover: { hi: ['#fff', '#fff', '#fff'], line: '#c9c9c9', body: '#fcfcfd', lo2: '#fefefe', lo: ['#c9c9ca', '#cacaca', '#cacaca'], sh: 5 },
  pressed: { hi: ['#c1c2c2', '#bfc0c0', '#bcbdbd'], line: '#f8f8f8', body: '#dddede', lo2: '#b6b7b7', lo: ['#fbfbfb', '#f9f9f9', '#fafafa'], sh: 4 },
};
export const KEYS = { shop_btn2_01_c01: 'normal', shop_btn2_02_c01: 'hover', shop_btn2_03_c01: 'pressed' };
export function key(parent, x, y, name) {
  const k = KEY[KEYS[name]];
  const ring = (i, c) => `<rect x='${i}' y='${i}' width='${110 - 2 * i}' height='${29 - 2 * i}' rx='${Math.max(0, 3 - i)}' fill='${c}'/>`;
  const u = svgUrl('key-' + KEYS[name], 116, 36, `
    <rect x='${k.sh}' y='${k.sh}' width='108' height='27' fill='rgba(100,100,100,.6)'/>
    <rect x='${k.sh + 108}' y='${k.sh}' width='1' height='27' fill='rgba(100,100,100,.45)'/><rect x='${k.sh + 109}' y='${k.sh}' width='1' height='27' fill='rgba(100,100,100,.15)'/>
    <rect x='${k.sh}' y='${k.sh + 27}' width='108' height='1' fill='rgba(100,100,100,.45)'/><rect x='${k.sh}' y='${k.sh + 28}' width='108' height='1' fill='rgba(100,100,100,.15)'/>
    <defs><clipPath id='c'><rect width='110' height='29' rx='3'/></clipPath></defs>
    <g clip-path='url(#c)'>
      <path d='M0 0H110L0 29Z' fill='${k.hi[0]}'/><path d='M110 0V29H0Z' fill='${k.lo[2]}'/>
      ${ring(1, k.hi[1])}<path d='M109 1V28H1Z' fill='${k.lo[1]}'/>
      ${ring(2, k.hi[2])}<path d='M108 2V27H2Z' fill='${k.lo[0]}'/>
      <rect x='3' y='3' width='104' height='23' fill='${k.line}'/><path d='M107 3V26H3Z' fill='${k.lo2}'/>
      <rect x='4' y='4' width='102' height='21' fill='${k.body}'/></g>`);
  return piece(parent, x, y, 116, 36, { backgroundImage: u });
}

// ---------------------------------------------------------------- the confirm window (shop_win_01_c00, 480 x 256)
// A gold plate, its corners cut 7 / 8 px (white-edged on the left), #ffc533 with a darker left edge (x 0 #ff9506) and foot (rows 254, 255 #ffb220 #ffa217), a
// light top (rows 0, 1 #ffdc8e #ffd77a) and
// right (x 477, 478 #ffe399 #fff1ca, 479 #ffc01d); the list well x 16..462, rows 16..207 (edged #7d7d7d on top,
// #7a6a41 under, light gold x 14, 15 left of it and rows 208, 209 under it): a header (17..46) #6dbcfb > #5d91fc
// from x 200 to 446, a black line (47), 16-px rows #e7e7e7 / #c2c2c2 (#7a7a7a under every second one), the list's
// right edge #505a76 (x 447) and its scroll column #8e8e8e (448..461, #8f939f at 462). The art's faint engraving
// (lower right) is left out.
export function confirmFrame(parent, x, y) {
  const rows = [];
  for (let r = 48; r < 207; r += 32) rows.push(`<rect x='17' y='${r + 16}' width='430' height='15' fill='#c2c2c2'/><rect x='17' y='${r + 31}' width='430' height='1' fill='#7a7a7a'/>`);
  const u = svgUrl('confirm', 480, 256, `
    <defs>${vgrad('h', [[200, '#6dbcfb'], [280, '#69b1fc'], [360, '#63a0fc'], [446, '#5d91fc']], true)}
      ${vgrad('gold', [[0, '#ffdc8e'], [1.5, '#ffd77a'], [3, '#ffc734'], [128, '#ffc433'], [254, '#ffbf2c']])}</defs>
    <path d='M7 0H472L480 8V248L472 256H7L0 249V7Z' fill='url(#gold)'/>
    <path d='M0.8 7.5L7.5 0.8M0.8 248.5L7.5 255.2' stroke='rgba(255,255,255,.39)' stroke-width='1.6'/>
    <path d='M7 0.5H473' stroke='#ffe4a0' stroke-width='1'/>
    <rect x='0' y='6' width='1' height='244' fill='#ff9506'/>
    <path d='M7 254.5H471' stroke='#ffb220' stroke-width='1'/><path d='M8 255.5H469' stroke='#ffa217' stroke-width='1'/>
    <rect x='477' y='6' width='1' height='244' fill='#ffe399'/><rect x='478' y='6' width='1' height='244' fill='#fff1ca'/><rect x='479' y='7' width='1' height='242' fill='#ffc01d'/>
    <rect x='14' y='16' width='1' height='194' fill='#ffe49a'/><rect x='15' y='16' width='1' height='194' fill='#fff0c9'/>
    <rect x='14' y='208' width='449' height='1' fill='#ffde95'/><rect x='14' y='209' width='449' height='1' fill='#ffd87e'/>
    <rect x='16' y='15' width='447' height='1' fill='#ffad1b'/>
    <rect x='16' y='16' width='447' height='192' fill='#7d7d7d'/>
    <rect x='17' y='17' width='430' height='30' fill='url(#h)'/><rect x='17' y='47' width='430' height='1' fill='#000'/>
    <rect x='17' y='48' width='430' height='159' fill='#e7e7e7'/>${rows.join('')}
    <rect x='16' y='207' width='447' height='1' fill='#7a6a41'/>
    <rect x='447' y='17' width='1' height='190' fill='#505a76'/><rect x='448' y='17' width='14' height='190' fill='#8e8e8e'/><rect x='462' y='17' width='1' height='190' fill='#8f939f'/>`);
  return piece(parent, x, y, 480, 256, { backgroundImage: u });
}

// ---------------------------------------------------------------- the swf buttons (shop_button_01.txt: 223 x 50)
// A DefineButton2 (the .txt is its dump): up = shop_btn1_01 (an aqua pill: black edge, a dark rim #134d83 #1f77a8
// #2798c4 #2dadd7 (x 1..4), the gloss rows 4..21 #cbe6ee > #44b8db (column 110), the body #2fb4dc (22) >
// #5ae7fa (42) > #3dbee0 #2c99c2 #195c96 (46..48)) with two pale arrows (shop_btn1_icon_01 at 10, 14 pointing in,
// mirrored at the right); over = the same with shop_btn1_03 (a cyan plate #b9ffff > #08ffff, white-edged, chamfered,
// a #204a68 shadow) pulsing on it (alpha 102..179 / 256 over 8 frames) and the arrows nudging 4 px; down =
// shop_btn1_04 (an orange pill, 2 px down-right: #fde0c7 > #ff9f00 (24) > #ffee00 (44), white-edged, yellow arrows).
// the pill's outline (traced from the up state's edge texels): 223 x 50, its ends elliptic arcs 16 px wide, the
// whole height (rx 16, ry 25); its rims the same shape 1 px in each
const pillRect = (i, fill, extra = '') => `<rect x='${i}' y='${i}' width='${223 - 2 * i}' height='${50 - 2 * i}' rx='${16 - i}' ry='${25 - i}' fill='${fill}'${extra}/>`;
const pillUp = () => svgUrl('pill-up', 230, 56, `
    <defs>${vgrad('b', [[22, '#2fb4dc'], [26, '#32b9e3'], [30, '#3ac5ea'], [34, '#43d1f0'], [38, '#51def6'], [42, '#5ae7fa'], [44, '#55e2f9'], [45, '#4cd6f1'], [46, '#3dbee0'], [47, '#2c99c2'], [48, '#195c96'], [49, '#195c96']])}
      ${vgrad('s', [[4, 'rgba(255,255,255,.75)'], [7, 'rgba(255,255,255,.62)'], [10, 'rgba(255,255,255,.47)'], [13, 'rgba(255,255,255,.33)'], [16, 'rgba(255,255,255,.2)'], [19, 'rgba(255,255,255,.09)'], [22, 'rgba(255,255,255,0)']])}
      ${vgrad('t', [[1, '#0d4275'], [2, '#146593'], [3, '#1a81aa'], [4, '#1a81aa']])}</defs>
    ${pillRect(0, '#000')}${pillRect(1, '#134d83')}${pillRect(2, '#1f77a8')}${pillRect(3, '#2798c4')}${pillRect(4, '#2dadd7')}
    ${pillRect(5, '#30b7e0')}
    <rect x='14' y='1' width='195' height='3' fill='url(#t)'/>
    <rect x='5' y='22' width='213' height='27' rx='11' ry='10' fill='url(#b)'/>
    <rect x='12' y='4' width='199' height='19' rx='10' ry='9' fill='url(#s)'/>`);
// down: the orange pill 2 px down-right, white-edged; its body #fe841b (row 6) > #fc7e06 (10) > #ff9300 (20) >
// #ffb000 (30) > #ffd300 (40) > #ffeb35 (48), a gloss inset 20 px from the ends (rows 5..24: #fde0c7 > #fec997 >
// #feb15a > #ffa325), yellow arrows
const pillDown = () => svgUrl('pill-down', 230, 56, `
    <defs>${vgrad('b', [[3, '#ffc571'], [4, '#ffa444'], [5, '#ff8b22'], [6, '#fe841b'], [10, '#fc7e06'], [15, '#ff8700'], [20, '#ff9300'], [24, '#ff9f00'],
      [30, '#ffb000'], [40, '#ffd300'], [44, '#ffe300'], [47, '#ffee0f'], [48, '#ffeb35'], [49, '#fff151'], [50, '#fff77d'], [51, '#fff77d']])}
      ${vgrad('g', [[6, '#fde0c7'], [10, '#fec997'], [15, '#feb15a'], [20, '#ffa325'], [24, 'rgba(255,159,0,0)']])}</defs>
    <rect x='2' y='2' width='223' height='50' rx='16' ry='25' fill='#fff'/>
    <rect x='3' y='3' width='221' height='48' rx='15' ry='24' fill='url(#b)'/>
    <rect x='20' y='5' width='187' height='20' rx='8' ry='6' fill='url(#g)'/>
    <path d='M22 16L32 26L22 36Z' fill='#ffff00'/><path d='M207 16L197 26L207 36Z' fill='#ffff00'/>`);
const pillGlow = () => svgUrl('pill-glow', 230, 56, `
    <defs>${vgrad('g', [[1, '#b9ffff'], [10, '#8fffff'], [24, '#5affff'], [40, '#16ffff'], [45, '#08ffff']])}</defs>
    <path d='M10 3H219L227 11V45L219 53H10L2 45V11Z' fill='rgba(32,74,104,.6)'/>
    <path d='M10 0H216L224 8V43L216 51H10L0 43V8Z' fill='#fff'/><path d='M10 2H215L222 9V42L215 49H10L2 42V9Z' fill='url(#g)'/>`);
const pillIcon = () => svgUrl('pill-icon', 16, 32, `<path d='M0.5 0.5L11 10.5L0.5 20.5Z' fill='#a8f4ff'/>`);
// state: 'normal' | 'hover' | 'pressed' (the swf's own, from the game's mouse: read/shop.js `mouse`)
export function pill(parent, x, y, state = 'normal') {
  const b = document.createElement('div');
  b.className = 'shop-pc shop-pill';
  b.dataset.state = state;
  Object.assign(b.style, { left: x + 'px', top: y + 'px', width: '230px', height: '56px' });
  if (state === 'pressed') piece(b, 0, 0, 230, 56, { backgroundImage: pillDown() });
  else {
    piece(b, 0, 0, 230, 56, { backgroundImage: pillUp() });
    if (state === 'hover') piece(b, 0, 0, 230, 56, { backgroundImage: pillGlow(), opacity: '.55' }).classList.add('shop-pill-glow');
    piece(b, 10, 14, 16, 32, { backgroundImage: pillIcon() }).classList.add('shop-pill-l');
    // the right one: the same cell turned over (scale -1, -1) at (196, 3), so its point is at x 201, rows 14..35
    piece(b, 196, 3, 16, 32, { backgroundImage: pillIcon(), transform: 'scale(-1, -1)' }).classList.add('shop-pill-r');
  }
  parent.append(b);
  return b;
}

// ---------------------------------------------------------------- the category banners' frame (shop_card / pack / *_avatar_02, 03)
// The picture (x 24..399, rows 29..140, the engine's) framed when hovered (02) or chosen (03): left x 19..23 #253736
// (231 / 255) #aeabab #fff #ffff1c #19ecd3, right the same mirrored (400..404); top rows 24..28 #000 #fff #fff #fcff00
// #00eaff, bottom mirrored (141..145); a #c7fffe glow round it (181 / 255 at the frame, gone 14 px out).
export const CATEGORY = /^shop_(card|pack|domino_avatar|akademia_avatar)_0([123])_c01$/;
export const CAT_PICTURE = { x: 24, y: 29, w: 376, h: 112 };
// the glow's alpha d px out of the frame (the texture's, top and side averaged): stacked 1-px spread rings, each
// ring's own alpha such that the rings over a pixel compose to the texel's
const GLOW = [175, 180, 176, 156, 132, 110, 89, 70, 54, 40, 28, 18, 10, 4, 1].map(a => a / 255);
const glowRings = GLOW.map((A, i) => 1 - (1 - A) / (1 - (GLOW[i + 1] ?? 0)))
  .map((a, i) => `0 0 0 ${i + 1}px rgba(199,255,254,${a.toFixed(3)})`).join(', ');
export function categoryFrame(parent, x, y) {
  return piece(parent, x + 19, y + 24, 386, 122, {
    boxShadow: `inset 1px 0 rgba(38,55,54,.906), inset -1px 0 rgba(38,55,54,.906), inset 0 1px #000, inset 0 -1px #000,
      inset 2px 0 #aeabab, inset -2px 0 #aeabab, inset 0 3px #fff, inset 0 -3px #fff, inset 3px 0 #fff, inset -3px 0 #fff,
      inset 4px 0 #ffff1c, inset -4px 0 #ffff1c, inset 0 4px #fcff00, inset 0 -4px #fcff00,
      inset 5px 0 #19ecd3, inset -5px 0 #19ecd3, inset 0 5px #00eaff, inset 0 -5px #00eaff, ${glowRings}` });
}

// ---------------------------------------------------------------- the no-trade mark (icon_seigen_01, 16 x 16)
// A red (#ff0000) X behind (2 px strokes corner to corner, rows 1..14) a yellow (#ffe400) double arrow: each head a
// diamond from its tip (x 0, rows 7..8) to its back (x 5), black-edged outside, dark brown (#381616) along the back
// with an orange (#fea129) mark (x 4, rows 4..5 / 10..11); between them a bar (x 5..10, rows 6..9): brown edges,
// orange inside (rows 7..8).
export function noTrade(parent, x, y) {
  const head = m => {
    const X = v => m ? 16 - v : v, poly = P => 'M' + P.map(([a, b]) => X(a) + ' ' + b).join('L') + 'Z';
    return `<path d='${poly([[4, 3], [6, 3], [6, 13], [4, 13], [0, 9], [0, 7]])}' fill='#381616'/>
      <path d='${poly([[4, 3], [0, 7], [0, 9], [4, 13]])}' fill='none' stroke='#000' stroke-width='1.2'/>
      <path d='${poly([[3, 5], [4, 5], [6, 7], [6, 9], [4, 11], [3, 11], [1, 9], [1, 7]])}' fill='#ffe400'/>
      <rect x='${m ? 11 : 4}' y='4' width='1' height='2' fill='#fea129'/><rect x='${m ? 11 : 4}' y='10' width='1' height='2' fill='#fea129'/>`;
  };
  const u = svgUrl('seigen', 16, 16, `
    <path d='M1 1L15 15M15 1L1 15' stroke='#f00' stroke-width='2.2'/>
    ${head(false)}${head(true)}<rect x='5' y='6' width='6' height='1' fill='#381616'/><rect x='5' y='9' width='6' height='1' fill='#381616'/>
    <rect x='6' y='7' width='4' height='2' fill='#fea129'/>`);
  return piece(parent, x, y, 16, 16, { backgroundImage: u });
}
