// The menu bar's picture buttons (CWindowModelMenu::newButton 0x00a7e930: 80 x 32 CWindowTaskPictureSwitches from
// menuicon_02_c01.png, one 32-pixel row per button, its normal / hover / pressed looks at u 0 / 80 / 160) recreated as
// CSS + SVG (the owner's Skin rule: the atlas is pixel art, stair-stepped and soft at 2x). Sampled from the atlas texels.
//  - the plate: 72 x 24 at (8, 4), a 1-px border (#895717; pressed #c843a5) with corners cut 3 px, a hard stop per row
//    (PLATE: rows 5..26 from the top), the two columns inside each side lighter on the left, darker on the right.
//  - the pictogram over it: a 2-px outline (normal #0068f2 blue, hover #535353 grey, pressed #e7009e magenta) round a
//    pale fill (normal white to #dbffff down the glyph, hover #f8f8f8, pressed #f3bfe6 to white), a 1-px halo outside
//    it (white; hover #fcff00), light details in the soft colour (#4c9fff, #8b9494, #fd5fd4); hover gives some parts
//    their own colours (the list's lines red, the door orange, the runner cyan, the arrows pink in red, the disk's eye).
// Each glyph is shapes on its fill's edge, painted three times: the halo (the shape stroked 6 wide), the outline (4),
// the fill; a shape given a width w is a stroked path (a limb), painted at w + 6, w + 4, w. The notches (the wrench's
// jaws) are cut by masks, the halo's by the notch, the outline's by the notch 1 px larger, the fill's 3 px larger.
// glyph(kind, state) -> an <svg> string (80 x 32, the button's own box); kinds by atlas row: KIND.
export const KIND = { 0x00: 'main', 0x20: 'duel2', 0x40: 'duel', 0x60: 'move', 0x80: 'config', 0xa0: 'return' };

// the plate's rows 5..26 (row 4 and 27 are the border) and its side columns [left 1, left 2, right 2, right 1]
export const PLATE = {
  normal: { border: '#895717', rows: ['#fffeeb', '#fefdd3', '#fdfcab', '#fcfc8f', '#fbf974', '#fbf35e', '#fbef57', '#fbeb52',
    '#fbe74e', '#fbe24a', '#fbdd46', '#fcd842', '#fcd23f', '#fccc3c', '#fcc639', '#fdc036', '#fdbb34', '#fdb531', '#fdb02f',
    '#feaa2d', '#fe921e', '#fe6f0b'], sides: ['rgba(255,250,200,.45)', 'rgba(255,250,200,.25)', 'rgba(250,150,0,.25)', 'rgba(250,120,0,.55)'] },
  hover: { border: '#895717', rows: ['#ffd299', '#febb5f', '#fea72b', '#feab2d', '#fdb02f', '#fdb531', '#fdbb34', '#fdc036',
    '#fcc639', '#fccc3c', '#fcd23f', '#fcd842', '#fbdd46', '#fbe24a', '#fbe74e', '#fbeb52', '#fbef57', '#fbf35e', '#fbf974',
    '#fcfb8e', '#fddc79', '#feaa31'], sides: ['rgba(255,250,200,.45)', 'rgba(255,250,200,.25)', 'rgba(250,150,0,.25)', 'rgba(250,120,0,.55)'] },
  pressed: { border: '#c843a5', rows: ['#fd5fd4', '#fe7edf', '#fe94e6', '#fe98e7', '#fe9de8', '#fea1e9', '#fea6eb', '#feacec',
    '#feb1ed', '#feb7ee', '#febcf0', '#fec1f1', '#fec6f2', '#fecbf3', '#fed0f4', '#fed4f4', '#fdd7f5', '#fddaf5', '#fadff4',
    '#f7dff2', '#f6e7f3', '#f8f0f6'], sides: ['rgba(250,60,200,.35)', 'rgba(250,120,220,.15)', 'rgba(255,255,255,.1)', 'rgba(255,255,255,.2)'] },
};
// one look's background: the side columns over a hard stop per row (rows 1..22 of the 24-high plate's inside)
export const plateBackground = ({ rows, sides: [l1, l2, r2, r1] }) =>
  `linear-gradient(to right, ${l1} 0 1px, ${l2} 1px 2px, transparent 2px calc(100% - 2px), ${r2} calc(100% - 2px) calc(100% - 1px), ${r1} calc(100% - 1px)),
   linear-gradient(to bottom, ${rows.map((c, i) => `${c} ${i}px ${i + 1}px`).join(', ')})`;

const PAL = {
  normal: { halo: '#fff', line: '#0068f2', top: '#ffffff', bottom: '#dbffff', soft: '#4c9fff', band: '#a3c9fa' },
  hover: { halo: '#fcff00', line: '#535353', top: '#f8f8f8', bottom: '#f8f8f8', soft: '#8b9494', band: '#a7a7a7' },
  pressed: { halo: '#fff', line: '#e7009e', top: '#f3bfe6', bottom: '#fdfbfd', soft: '#fd5fd4', band: '#faccec' },
};

// glyph geometry, in the button's pixels (pixel x covers x..x+1): shapes [{ d, w? }], notches [[x, y, w, h]] (the
// visible cut), the fill's gradient span [y0, y1], and details(p) drawn over the fill
const G = {
  // MENUBAR_MENU_MAIN: a list (a 36 x 26 page inside a 2-px frame, six bullets and lines)
  main: {
    shapes: [{ d: 'M29 3h36v26h-36z' }], span: [3, 29],
    details: (p, s) => [5, 9, 13, 17, 21, 25].map(y => `<rect x="32" y="${y}" width="2" height="2"/><rect x="37" y="${y}" width="26" height="2"/>`)
      .join('').replace(/<rect /g, `<rect fill="${s === 'hover' ? '#ff0000' : s === 'pressed' ? '#e500a9' : p.line}" `),
  },
  // MENUBAR_MENU_RETURN: a U-turn arrow, back to the left (outline 2 px, a 1-px band round it)
  return: {
    shapes: [{ d: 'M29 4H59V23H38V27H37.5L31 21.5V20L36 15H38V19H55V8H29Z' }], span: [4, 27], band: true,
    hover: { line: '#ea0000', top: '#ff89e5', bottom: '#ff89e5', band: '#f9cc29' }, pressed: { line: '#e7009e', top: '#fcedf8', bottom: '#f3bae4' },
  },
  // MENUBAR_MENU_CONFIG: a spanner, lower left to upper right, a jaw at each end
  config: {
    shapes: [{ d: 'M34.5 21L53 12', w: 7 }, { d: 'M57 10.5h0', w: 12 }, { d: 'M30.5 22h0', w: 12 }],
    notches: [[59, 10, 12, 3], [17, 21, 11, 2]], span: [4, 28],
    hover: { top: '#ecffff', bottom: '#e4ffff' }, pressed: { line: '#e925ac' },
    details: p => `<path d="M33.5 16.5l3 6.5M49.5 10.5l3 6" stroke="${p.soft}" stroke-width="1" fill="none"/>`,
  },
  // MENUBAR_MENU_MOVE: a door, an arrow into it, a running figure
  move: {
    shapes: [{ d: 'M16 4h16v24h-16z' }, { d: 'M34.5 16.5L39 12V15H48V18H39V21Z' },
      { d: 'M59.5 7.5h0', w: 9 }, { d: 'M58 12L53.5 19.5', w: 4 }, { d: 'M59 13H71.5V14', w: 2 }, { d: 'M55 15.5H49.5', w: 2 },
      { d: 'M53.5 19.5L49 23.5L47.5 26', w: 3 }, { d: 'M53.5 19.5L60 23H71.5V26', w: 3 }],
    span: [4, 28],
    hover: { line: '#535353', top: '#4bc6ff', bottom: '#4bc6ff' },
    // the door's panel and knob; hover: the door orange in brown, the arrow pink in red
    details: (p, s) => {
      const door = s === 'hover' ? `<path d="M16 4h16v24h-16z" fill="#f09440"/><path d="M15 3h18v26h-18z" fill="none" stroke="#8a4201" stroke-width="2"/>` : '';
      const arrow = s === 'hover' ? `<path d="M34.5 16.5L39 12V15H48V18H39V21Z" fill="#ff89e5" stroke="#ea0000" stroke-width="1.6" stroke-linejoin="round"/>` : '';
      const frame = s === 'hover' ? '#8a4201' : p.line, knob = s === 'hover' ? '#fcff00' : p.soft;
      return `${door}<path d="M17.5 5.5h13v21h-13z" fill="none" stroke="${frame}" stroke-width="1"/>`
        + `<circle cx="28" cy="16" r="1.4" fill="${knob}" stroke="${frame}" stroke-width="1"/>${arrow}`;
    },
  },
  // MENUBAR_MENU_DUEL (row 0x40): a duelist's helmet with its dark visor over a duel disk's blade (its card zones)
  duel: {
    shapes: [{ d: 'M29.5 15V10Q29.5 3 38.5 3T48 10V15Z' },
      { d: 'M20 19.5L34 18.5H48L56 16.5H69L64.5 25.5Q50 29 44 29H34Q24 28 20 25.5Z' }],
    span: [3, 29],
    details: (p, s) => {
      const accent = s === 'hover' ? '#ff9537' : p.soft, gem = s === 'hover' ? '#ff3766' : p.soft;
      return `<rect x="35.5" y="9" width="10.5" height="5" fill="${p.line}"/>`
        + `<path d="M30 9h5.5v5H30z" fill="${accent}"/><path d="M32 8.5H46.5V14.5H32M36.5 6.5H42.5" fill="none" stroke="${p.soft}" stroke-width="1"/>`
        + `<path d="M38 15.5l2.5 3 2.5-3z" fill="${gem}"/>`
        + `<path d="M22 21H62M22.5 25H59M25 21v4.5M29.5 21v5.5M34 21v6.5M38.5 21v7M43 21v7M47.5 21v6.5M52 21v5.5M56.5 21v4.5"
            fill="none" stroke="${p.soft}" stroke-width="1"/>`;
    },
  },
  // MENUBAR_MENU_DUEL (row 0x20): a duel disk from the side, its life-counter dome and lens up front, the card blade,
  // the round hub
  duel2: {
    shapes: [{ d: 'M30 17L29.5 10Q29.5 3 38.5 3Q45 3 46.5 8.5H54.5L51 16Z' },
      { d: 'M18 19H33L45 18L59.5 16L62 13.5L66.5 16.5L70 19.5L64 25.5L58 27H45Q40 30 35 28H18Q17 28 17 26.5V20.5Q17 19 18 19Z' },
      { d: 'M40.5 23.5h0', w: 9 }],
    span: [3, 29],
    details: (p, s) => {
      const lens = s === 'hover' ? '#4faeff' : p.soft, tab = s === 'hover' ? '#ff9537' : p.soft, gem = s === 'hover' ? '#ff3766' : p.soft;
      return `<path d="M35.5 7.5h6v5h-6z" fill="${lens}" stroke="${p.line}" stroke-width="1"/>`
        + `<path d="M30 9h4.5v3H30z" fill="${tab}"/><path d="M35.5 6Q38.5 3.5 41.5 6M43.5 6.5Q45 10 43.5 13" fill="none" stroke="${p.soft}" stroke-width="1"/>`
        + `<path d="M19 20.5H34M19 26H34M46.5 19.5H66M47 25.5H60M21.5 20.5v5.5M26 20.5v5.5M30.5 20.5v5.5M51.5 18.5v7.5M56.5 17.5v8M61.5 17v6.5"
            fill="none" stroke="${p.soft}" stroke-width="1"/>`
        + `<circle cx="40.5" cy="23.5" r="2.6" fill="${gem}" stroke="${p.line}" stroke-width="1"/>`;
    },
  },
};

let uid = 0;
// the paint for a shape at one pass: extra = the stroke beyond the fill's edge on each side (0: the fill itself)
const paint = (sh, extra, color, fill) => sh.w
  ? `<path d="${sh.d}" fill="none" stroke="${color}" stroke-width="${sh.w + 2 * extra}" stroke-linecap="round" stroke-linejoin="round"/>`
  : `<path d="${sh.d}" fill="${fill}"${extra ? ` stroke="${color}" stroke-width="${2 * extra}" stroke-linejoin="round"` : ''}/>`;

export function glyph(kind, state = 'normal') {
  const g = G[kind];
  if (!g) return '';
  const s = state === 'hover' || state === 'pressed' ? state : 'normal';
  const p = { ...PAL[s], ...g[s] }, id = 'lbg' + (++uid);
  const grad = `<linearGradient id="${id}f" gradientUnits="userSpaceOnUse" x1="0" y1="${g.span[0]}" x2="0" y2="${g.span[1]}">`
    + `<stop offset="0" stop-color="${p.top}"/><stop offset="1" stop-color="${p.bottom}"/></linearGradient>`;
  // a mask per pass: everything but the notches, grown by k px
  const masks = (g.notches ? [0, 1, 3] : []).map(k => `<mask id="${id}m${k}" maskUnits="userSpaceOnUse" x="0" y="0" width="80" height="32">`
    + `<rect width="80" height="32" fill="#fff"/>${g.notches.map(([x, y, w, h]) => `<rect x="${x - k}" y="${y - k}" width="${w + 2 * k}" height="${h + 2 * k}"/>`).join('')}</mask>`).join('');
  const pass = (k, extra, color, fill) => `<g${g.notches ? ` mask="url(#${id}m${k})"` : ''}>${g.shapes.map(sh => paint(sh, extra, color, fill)).join('')}</g>`;
  const fill = `url(#${id}f)`;
  const layers = g.band
    ? [pass(0, 4, p.halo, p.halo), pass(0, 3, p.band, p.band), pass(1, 2, p.line, p.line), pass(3, 0, fill, fill)]
    : [pass(0, 3, p.halo, p.halo), pass(1, 2, p.line, p.line), pass(3, 0, fill, fill)];
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 80 32" width="80" height="32"><defs>${grad}${masks}</defs>`
    + layers.join('') + (g.details ? g.details(p, s) : '') + '</svg>';
}
