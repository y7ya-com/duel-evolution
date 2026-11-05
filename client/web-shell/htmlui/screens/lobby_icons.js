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
// glyph(kind, state) -> an <svg> string (80 x 32, the button's own box); kinds by atlas row: KIND. These hand-drawn
// glyphs are the stand-in until the atlas has loaded: the live flips (flip.mjs tl-menubar) found them pixels off and
// missing parts, so screens/lobby.js draws traceAtlas()'s (below), traced from the atlas itself, once it can.
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

// The page's own buttons on the bar (cosmetics/wardrobe-launcher.js, rewards/launcher.js): each reports the right end of
// its slot (screen x, 0 when away), and screens/lobby.js starts the message field a plate's gap (8 px) after the last.
const reserved = new Map(), reserveWatch = new Set();
export function reserveBar(key, end) {
  if ((reserved.get(key) || 0) === (end || 0)) return;
  if (end) reserved.set(key, end); else reserved.delete(key);
  reserveWatch.forEach(f => { try { f(); } catch {} });
}
export const barReserve = () => Math.max(0, ...reserved.values());
export const onBarReserve = f => { reserveWatch.add(f); return () => reserveWatch.delete(f); };

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

// The menu bar's strip (CWindowTaskMenubar: menuber_01_c01.png, 1024 x 32, drawn 1:1 along the screen's bottom) as CSS:
// row bands [y, h, stops], each a horizontal gradient through the band's colour (its rows and a 9-texel run averaged:
// the art's brush noise left out), stops where a straight line between them stays within 2.5 of it; the bevel's
// columns (0..3, 1016..1023) exact. The message field (391..1016 x 7..24: a white 1-px frame round a hole, then
// menuber_02_c01's white plane in it) is drawn apart: the strip is cut there.
export const STRIP = [
  [0, 1, '#92ffff 0px, #97ffff 2.5px, #a3ffff 23.5px, #cbffff 60.5px, #fdffff 102.5px, #fdffff 260.5px, #d1ffff 333.5px, #9cffff 397.5px, #8cffff 411.5px, #84f6ff 439.5px, #83f4ff 450.5px, #77eeff 476.5px, #73eaff 486.5px, #77eaff 496.5px, #6fe3ff 534.5px, #6ce0ff 549.5px, #6cddff 558.5px, #6adbff 568.5px, #63d6ff 585.5px, #62d5ff 598.5px, #55cbff 636.5px, #57caff 649.5px, #4ec5ff 666.5px, #3eb8ff 722.5px, #3ab5ff 737.5px, #3cb3ff 748.5px, #35adff 775.5px, #2ea9ff 794.5px, #2ba6ff 802.5px, #34a7ff 814.5px, #2ea4ff 835.5px, #2ca1ff 852.5px, #269fff 864.5px, #299eff 872.5px, #249bff 884.5px, #289aff 903.5px, #2398ff 912.5px, #1991ff 947.5px, #1c94ff 957.5px, #1991ff 971.5px, #128eff 994.5px, #168eff 1009.5px, #138dff 1015.5px, #0f8dff 1016.5px, #138dff 1018.5px, #0f8aff 1021.5px, #087eff 1022.5px, #005eff 1024px'],
  [1, 1, '#7affff 0px, #94ffff 2.5px, #95ffff 3.5px, #90ffff 4.5px, #96ffff 8.5px, #a1ffff 24.5px, #c6ffff 57.5px, #f9ffff 98.5px, #ffffff 111.5px, #fdffff 260.5px, #ccffff 338.5px, #a9ffff 379.5px, #94ffff 403.5px, #84fdff 419.5px, #81f5ff 441.5px, #7aeeff 475.5px, #6ee4ff 527.5px, #65dbff 562.5px, #5cd5ff 583.5px, #5ad4ff 593.5px, #56d1ff 602.5px, #57cfff 612.5px, #54cbff 629.5px, #51caff 639.5px, #45bfff 681.5px, #40bcff 692.5px, #3cb6ff 726.5px, #39b1ff 751.5px, #3ab0ff 777.5px, #35acff 785.5px, #33abff 797.5px, #2fa6ff 811.5px, #2aa3ff 831.5px, #2ca0ff 843.5px, #249eff 861.5px, #239bff 876.5px, #239aff 885.5px, #2098ff 900.5px, #1f96ff 911.5px, #1893ff 929.5px, #1a93ff 939.5px, #0b8bff 948.5px, #158fff 971.5px, #158fff 982.5px, #148fff 991.5px, #1a90ff 999.5px, #0c88ff 1017.5px, #0b87ff 1020.5px, #0477ff 1021.5px, #0057ff 1022.5px, #0042e4 1024px'],
  [2, 1, '#73ffff 0px, #78ffff 1.5px, #90ffff 3.5px, #8bffff 4.5px, #95ffff 8.5px, #aaffff 34.5px, #fcffff 101.5px, #feffff 257.5px, #d4ffff 327.5px, #a0ffff 391.5px, #90ffff 406.5px, #84faff 426.5px, #7cefff 471.5px, #77ebff 486.5px, #76e7ff 513.5px, #6be2ff 532.5px, #64d8ff 581.5px, #5fd6ff 589.5px, #5cd3ff 598.5px, #5ed1ff 612.5px, #56cdff 627.5px, #52c9ff 644.5px, #50c7ff 658.5px, #4ec5ff 667.5px, #4ec4ff 673.5px, #4ac1ff 682.5px, #47bdff 701.5px, #41baff 711.5px, #43b8ff 732.5px, #3ab2ff 747.5px, #38b1ff 759.5px, #33aeff 770.5px, #36adff 779.5px, #33a9ff 795.5px, #2ea7ff 804.5px, #29a3ff 828.5px, #2ea2ff 852.5px, #249dff 864.5px, #289cff 875.5px, #289cff 883.5px, #1f96ff 907.5px, #2397ff 936.5px, #1d92ff 949.5px, #2396ff 962.5px, #1a92ff 977.5px, #1990ff 986.5px, #168fff 993.5px, #1b90ff 1002.5px, #168dff 1011.5px, #198fff 1018.5px, #1d91ff 1019.5px, #1581ff 1020.5px, #0161ff 1021.5px, #0049e5 1022.5px, #0040d6 1024px'],
  [3, 1, '#77ffff 0px, #75ffff 1.5px, #7effff 2.5px, #79ffff 4.5px, #8bffff 32.5px, #bfffff 81.5px, #eaffff 127.5px, #f9ffff 157.5px, #f7ffff 215.5px, #ddffff 250.5px, #ceffff 269.5px, #b5ffff 322.5px, #98fdff 364.5px, #7ee3ff 400.5px, #6fd3ff 422.5px, #6acdff 441.5px, #66caff 453.5px, #65c6ff 484.5px, #5cc1ff 507.5px, #5dc1ff 516.5px, #59beff 526.5px, #58bdff 535.5px, #55baff 545.5px, #4db4ff 568.5px, #4cb3ff 577.5px, #4fb2ff 597.5px, #4bafff 609.5px, #40a7ff 633.5px, #3ca4ff 642.5px, #40a5ff 654.5px, #349cff 692.5px, #349bff 701.5px, #2c93ff 744.5px, #2992ff 754.5px, #2a91ff 766.5px, #288eff 781.5px, #268cff 800.5px, #2289ff 812.5px, #1c85ff 828.5px, #2086ff 843.5px, #2083ff 858.5px, #1980ff 870.5px, #1c81ff 884.5px, #1e81ff 896.5px, #147cff 916.5px, #197dff 925.5px, #1078ff 936.5px, #1279ff 949.5px, #1178ff 955.5px, #1179ff 965.5px, #0772ff 975.5px, #0e75ff 989.5px, #0d74ff 1015.5px, #0973ff 1017.5px, #1275ff 1019.5px, #0660ff 1020.5px, #004ce6 1021.5px, #0046d7 1022.5px, #0044d7 1024px'],
  [4, 3, '#76ffff 0px, #76ffff 2.5px, #6aecff 3.5px, #5fd5ff 8.5px, #79deff 44.5px, #c3f9ff 133.5px, #ccfeff 158.5px, #c9feff 214.5px, #b2feff 252.5px, #a6f9ff 273.5px, #97eaff 310.5px, #81d7fe 350.5px, #55aafd 428.5px, #4ea3fd 459.5px, #439bfd 505.5px, #4298fd 531.5px, #3e94fd 555.5px, #368dfd 593.5px, #3088fd 613.5px, #2d85fd 644.5px, #2982fd 658.5px, #2a81fd 678.5px, #237cfd 697.5px, #247bfd 709.5px, #1a75fd 727.5px, #1d75fd 737.5px, #1973fd 748.5px, #1b72fb 770.5px, #0e69fb 796.5px, #1068fb 818.5px, #0e65fb 849.5px, #0c65fb 858.5px, #0560fb 868.5px, #0c62fb 883.5px, #055efb 901.5px, #045dfb 921.5px, #065dfb 945.5px, #025bfb 964.5px, #0155fb 999.5px, #0056fb 1019.5px, #003ed5 1021.5px, #003fd5 1024px'],
  [7, 18, '#73ffff 0px, #73ffff 2.5px, #68ecff 3.5px, #5cd4ff 8.5px, #7cdfff 52.5px, #a6eeff 97.5px, #c7fbff 144.5px, #cbfeff 189.5px, #c7feff 219.5px, #adfeff 257.5px, #89e0ff 331.5px, #69c1fe 386.5px, #79c8fe 387.5px, #68c0fe 388.5px, #66befe 390.5px, #ffffff 391.5px, #ffffff 1016.5px, #0154fb 1017.5px, #0053fb 1019.5px, #003ed5 1021.5px, #003ed5 1024px'],
  [25, 3, '#6cffff 0px, #6effff 2.5px, #63ebff 3.5px, #58d3ff 8.5px, #64d8ff 28.5px, #b2f4ff 115.5px, #c9fdff 156.5px, #c7feff 217.5px, #aafeff 257.5px, #90ebff 306.5px, #74cffe 360.5px, #60bafe 393.5px, #4caafe 415.5px, #45a3fd 431.5px, #44a0fd 448.5px, #419cfd 475.5px, #3e99fd 490.5px, #3d98fd 509.5px, #2d8cfd 566.5px, #2787fd 588.5px, #2a87fd 600.5px, #2783fd 626.5px, #2580fd 650.5px, #1c78fd 694.5px, #1877fd 701.5px, #0e6efd 733.5px, #0f6dfd 753.5px, #0e6bfc 763.5px, #0b68fb 777.5px, #0564fb 796.5px, #0660fb 819.5px, #005bfb 838.5px, #045ffb 851.5px, #0159fb 883.5px, #0157fb 894.5px, #0051fb 949.5px, #0050fb 988.5px, #004dfb 1016.5px, #0049fb 1018.5px, #004dfb 1019.5px, #0038d3 1021.5px, #0030d2 1024px'],
  [28, 1, '#70ffff 0px, #70ffff 1.5px, #62e8ff 2.5px, #52c9f5 3.5px, #56ceed 4.5px, #4ab9e2 7.5px, #50b8e0 24.5px, #51b9df 34.5px, #54b9de 42.5px, #77c5df 74.5px, #97d2df 117.5px, #a5d7e0 143.5px, #aadae0 163.5px, #a6d9df 214.5px, #91dae0 254.5px, #84d3e0 285.5px, #7dcce0 305.5px, #67b9df 346.5px, #56a8df 379.5px, #489cdf 398.5px, #3b8dde 424.5px, #398bde 433.5px, #3b88de 452.5px, #3585dd 472.5px, #2d80dd 490.5px, #297edd 509.5px, #2e7fdd 517.5px, #3382de 525.5px, #2077dc 545.5px, #2577dd 563.5px, #2577de 575.5px, #2275de 586.5px, #2474de 595.5px, #2172de 611.5px, #1f71de 626.5px, #166add 640.5px, #1669dd 646.5px, #1368dd 652.5px, #1568de 667.5px, #0c61dd 686.5px, #1265de 707.5px, #1364de 714.5px, #0f61de 723.5px, #095cdd 747.5px, #075bdd 763.5px, #0255db 785.5px, #0657dc 800.5px, #0657dc 812.5px, #004ddb 825.5px, #0049db 848.5px, #014edc 855.5px, #004ddc 869.5px, #0048db 882.5px, #014edc 890.5px, #0044db 911.5px, #0040db 937.5px, #003fda 947.5px, #0044dc 968.5px, #003cdb 979.5px, #0040db 998.5px, #003cdb 1007.5px, #003edc 1015.5px, #003cdc 1018.5px, #0040db 1020.5px, #0037d1 1021.5px, #0038d4 1024px'],
  [29, 1, '#6dffff 0px, #5ee7ff 1.5px, #49c2ef 2.5px, #34a1ce 3.5px, #3cafd4 4.5px, #309ac6 6.5px, #2b93be 8.5px, #3193bd 22.5px, #409ac0 34.5px, #4c9cbe 59.5px, #64a6be 86.5px, #6ca9bf 98.5px, #70abbf 111.5px, #7cb1bf 125.5px, #83b3bf 146.5px, #88b6c0 162.5px, #88b6c0 183.5px, #89b5c0 203.5px, #7eb4c0 234.5px, #73b4bf 253.5px, #67b1be 268.5px, #6ab2c1 279.5px, #61a9c0 301.5px, #57a1c0 320.5px, #569fc1 332.5px, #4692bd 352.5px, #448fbf 365.5px, #3f8ac0 374.5px, #3f88c0 383.5px, #337dbf 400.5px, #3179c0 414.5px, #246fbd 425.5px, #2770be 445.5px, #246cbe 471.5px, #1e66bc 481.5px, #1a67bd 494.5px, #1c67be 502.5px, #1e67bf 517.5px, #1f66bf 525.5px, #1b64be 537.5px, #1962bf 548.5px, #145fbd 555.5px, #165fbf 574.5px, #135cbf 583.5px, #0d57bd 591.5px, #175ebf 602.5px, #1259bf 613.5px, #1058be 625.5px, #0a55be 634.5px, #0953bd 642.5px, #0a54be 652.5px, #1357c0 663.5px, #0a51bf 674.5px, #014abc 689.5px, #024abd 712.5px, #0248bd 723.5px, #004abf 744.5px, #0043bd 758.5px, #003fbb 793.5px, #003bba 806.5px, #0038bb 835.5px, #003cbc 865.5px, #0034bb 878.5px, #003cbe 901.5px, #0039bd 916.5px, #0030bb 950.5px, #002dba 958.5px, #0031bb 968.5px, #002ebc 988.5px, #0027b9 1003.5px, #0023b9 1012.5px, #0025b7 1016.5px, #0028b9 1019.5px, #0028c0 1020.5px, #0038d1 1022.5px, #003bd4 1024px'],
  [30, 1, '#63e7ff 0px, #4dc3ef 1.5px, #3aa2d0 2.5px, #3293c0 3.5px, #3aa4cd 4.5px, #3095c1 6.5px, #2c91bd 17.5px, #3797bf 28.5px, #3c98bf 33.5px, #419abf 42.5px, #4b9dc0 49.5px, #56a2bf 72.5px, #69a9bf 95.5px, #74acbf 113.5px, #83b3bd 149.5px, #8ab5c1 205.5px, #7cb4c0 236.5px, #6eb4c0 260.5px, #66b0be 270.5px, #64adbe 280.5px, #529ebd 318.5px, #4b99bd 328.5px, #4e99be 341.5px, #3d8abe 371.5px, #3581bc 383.5px, #317cbe 398.5px, #1f6bbc 430.5px, #246dbc 438.5px, #1e6abc 452.5px, #256dbe 462.5px, #276dbf 471.5px, #1763bb 489.5px, #1b65bc 500.5px, #115ebb 509.5px, #135ebc 533.5px, #105cbc 547.5px, #115cbc 557.5px, #0f5abc 564.5px, #145ebe 572.5px, #0c5abd 582.5px, #0b59bd 588.5px, #1059be 600.5px, #0f59be 609.5px, #1159bf 623.5px, #004cbb 645.5px, #0651bd 655.5px, #0450be 677.5px, #0550be 685.5px, #0046bb 698.5px, #0048bd 726.5px, #0043bc 744.5px, #003cba 763.5px, #003cb9 772.5px, #003cbb 790.5px, #0034b9 816.5px, #0035b9 825.5px, #003cbc 853.5px, #0037bb 861.5px, #003abc 872.5px, #0032ba 889.5px, #002fba 920.5px, #0030bb 943.5px, #002cba 954.5px, #002cba 977.5px, #002aba 991.5px, #002bbb 1002.5px, #0029bb 1018.5px, #0023ba 1019.5px, #0023ba 1020.5px, #0034cf 1024px'],
  [31, 1, '#49c0ed 0px, #37a4d0 1.5px, #3596c1 2.5px, #3697c1 3.5px, #379dc7 4.5px, #3597c1 6.5px, #3e9bc1 26.5px, #4b9ec0 48.5px, #5ba4c1 68.5px, #74aec1 103.5px, #89b5c0 161.5px, #8cb7c1 184.5px, #89b7c1 217.5px, #6ab2c0 271.5px, #63acc0 292.5px, #5ea7c1 310.5px, #559fc0 325.5px, #468ec1 371.5px, #3582be 387.5px, #2d77c0 416.5px, #2471be 426.5px, #2a72c0 442.5px, #256ebf 460.5px, #1c67bc 474.5px, #1e67be 492.5px, #1966be 508.5px, #1b65be 518.5px, #1660be 549.5px, #165ebd 557.5px, #135ebd 570.5px, #0a58bc 580.5px, #0957bc 586.5px, #0959be 594.5px, #185dc0 619.5px, #1259bf 631.5px, #0955bf 641.5px, #0752be 655.5px, #0651be 662.5px, #0f55c0 671.5px, #0c53c0 684.5px, #0045bc 722.5px, #0046bd 745.5px, #0044bc 760.5px, #0041bb 774.5px, #0037b9 794.5px, #0039ba 819.5px, #0036ba 830.5px, #002ab7 844.5px, #0030b9 857.5px, #0033bb 878.5px, #002fba 891.5px, #0035bc 900.5px, #002bba 912.5px, #0032bc 934.5px, #002dba 942.5px, #002fbb 952.5px, #0031bb 964.5px, #0027ba 972.5px, #0028b9 983.5px, #0028ba 993.5px, #002fbc 1002.5px, #0027ba 1013.5px, #002abb 1019.5px, #0029bb 1021.5px, #002ac2 1024px'],
];

// ---------------------------------------------------------------- the glyphs traced from the atlas (live flips: the
// hand-drawn shapes above were off by pixels and missed whole parts). The atlas is read once at runtime (its texels
// never reach git, only the shapes and colours reach the DOM, as screens/trade.js reads window_base), and each glyph
// becomes vector layers, sharp at any DPR:
//  - its texels: those that differ from the plate under them (the plate is the same in every row of a column: a
//    texel's plate is the most common colour at that place across the six rows), plus any opaque texel off the plate;
//  - layers: 4-connected runs of near colours (a gradient's neighbours within 6), deepest last (mean distance to the
//    glyph's outside), each painted over the union of itself and every later layer, so a pixel always takes its own
//    layer's colour and the layers' seams never leave gaps;
//  - each mask's outline traced on the texel grid, diagonal neighbours joined, then smoothed: a corner between two runs
//    of 2+ texels stays square, a 1-texel step becomes the diagonal through its edges' midpoints (the art's stair
//    steps become straight slopes, its boxes stay boxes);
//  - a layer's colour: one colour, or a vertical gradient through its rows' mean colours (the fills).
const near = (a, b, t) => Math.abs(a[0] - b[0]) <= t && Math.abs(a[1] - b[1]) <= t && Math.abs(a[2] - b[2]) <= t;
const hex6 = c => '#' + c.slice(0, 3).map(v => Math.round(v).toString(16).padStart(2, '0')).join('');
// the closed outlines of a mask (w x h booleans), y down, the inside on the right: [[x, y], ...] per loop
export function outlines(m, w, h) {
  const at = (x, y) => x >= 0 && y >= 0 && x < w && y < h && m[y * w + x];
  const out = new Map(), key = (x, y) => x * 4096 + y;
  const add = (x0, y0, x1, y1) => { const k = key(x0, y0); (out.get(k) || out.set(k, []).get(k)).push([x0, y0, x1, y1]); };
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (!at(x, y)) continue;
    if (!at(x, y - 1)) add(x, y, x + 1, y);
    if (!at(x + 1, y)) add(x + 1, y, x + 1, y + 1);
    if (!at(x, y + 1)) add(x + 1, y + 1, x, y + 1);
    if (!at(x - 1, y)) add(x, y + 1, x, y);
  }
  const loops = [];
  for (const [, list] of out) while (list.length) {
    let e = list.pop();
    const loop = [[e[0], e[1]]];
    for (;;) {
      const nx = out.get(key(e[2], e[3]));
      if (!nx?.length) break;
      // a saddle (two ways on): the left turn, so diagonal neighbours stay one shape
      const dx = e[2] - e[0], dy = e[3] - e[1];
      let i = 0;
      if (nx.length > 1) i = Math.max(0, nx.findIndex(f => dx * (f[3] - f[1]) - dy * (f[2] - f[0]) < 0));
      e = nx.splice(i, 1)[0];
      if (e[0] === loop[0][0] && e[1] === loop[0][1]) break;
      loop.push([e[0], e[1]]);
    }
    loops.push(loop);
  }
  return loops;
}
// a loop's straight runs, then its smoothed path ('M..Z'). A 1-texel run between turns of opposite senses is a step of
// a slope: the outline goes through its midpoint, and a longer run next to it gives way half a texel before it; every
// other corner stays square (a box's corner, the cap of a 1-texel line)
export function smooth(loop) {
  const n = loop.length, runs = [];
  for (let i = 0; i < n; i++) {
    const [x0, y0] = loop[i], [x1, y1] = loop[(i + 1) % n], d = [x1 - x0, y1 - y0];
    const r = runs.at(-1);
    if (r && r.d[0] === d[0] && r.d[1] === d[1]) { r.b = [x1, y1]; r.len++; } else runs.push({ a: [x0, y0], b: [x1, y1], d, len: 1 });
  }
  if (runs.length > 1) { const f = runs[0], l = runs.at(-1); if (f.d[0] === l.d[0] && f.d[1] === l.d[1]) { f.a = l.a; f.len += l.len; runs.pop(); } }
  const N = runs.length, turn = (p, q) => Math.sign(p.d[0] * q.d[1] - p.d[1] * q.d[0]);
  const step = runs.map((r, i) => N > 4 && r.len === 1 && turn(runs[(i + N - 1) % N], r) === -turn(r, runs[(i + 1) % N]));
  const pts = [], put = p => { const l = pts.at(-1); if (!l || l[0] !== p[0] || l[1] !== p[1]) pts.push(p); };
  runs.forEach((r, i) => {
    if (step[i]) { put([(r.a[0] + r.b[0]) / 2, (r.a[1] + r.b[1]) / 2]); return; }
    put(step[(i + N - 1) % N] ? [r.a[0] + r.d[0] / 2, r.a[1] + r.d[1] / 2] : r.a);
    put(step[(i + 1) % N] ? [r.b[0] - r.d[0] / 2, r.b[1] - r.d[1] / 2] : r.b);
  });
  if (pts.length > 1 && pts[0][0] === pts.at(-1)[0] && pts[0][1] === pts.at(-1)[1]) pts.pop();
  return 'M' + pts.map(p => p.join(' ')).join('L') + 'Z';
}
// one glyph: the cell's texels (80 x 32 RGBA, [r, g, b, a] per texel) and the plate's ([r, g, b, a] or null) -> svg
export function traceGlyph(cell, plate, w = 80, h = 32) {
  const on = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) {
    const c = cell[i], p = plate[i];
    on[i] = c[3] >= 128 && (!p || p[3] < 128 || !near(c, p, 3)) ? 1 : 0;
  }
  // the art's antialiasing (a few texels of in-between colours along the slopes) snapped to the nearest common
  // colour beside it: the slopes then trace as clean lines, not hatching. Only a blend: a rare colour that lies between
  // a common one beside it and another colour beside it (or the plate); a small detail of its own colour (a knob, a
  // gem) stays
  cell = cell.slice();
  const blendOf = (c, a, b) => {
    const d = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], dd = d[0] ** 2 + d[1] ** 2 + d[2] ** 2;
    if (!dd) return false;
    const t = ((c[0] - a[0]) * d[0] + (c[1] - a[1]) * d[1] + (c[2] - a[2]) * d[2]) / dd;
    if (t < -0.05 || t > 1.05) return false;
    return Math.hypot(a[0] + t * d[0] - c[0], a[1] + t * d[1] - c[1], a[2] + t * d[2] - c[2]) <= 12;
  };
  for (let pass = 0; pass < 2; pass++) {
    const count = new Map();
    for (let i = 0; i < w * h; i++) if (on[i]) count.set(cell[i].join(), (count.get(cell[i].join()) || 0) + 1);
    const next = cell.slice();
    for (let i = 0; i < w * h; i++) {
      if (!on[i] || count.get(cell[i].join()) >= 5) continue;
      const x = i % w, y = (i / w) | 0, c = cell[i], targets = [], ends = [];
      for (let oy = -1; oy <= 1; oy++) for (let ox = -1; ox <= 1; ox++) {
        const X = x + ox, Y = y + oy, j = Y * w + X;
        if ((!ox && !oy) || X < 0 || Y < 0 || X >= w || Y >= h) continue;
        const q = on[j] ? cell[j] : plate[j];
        if (!q || q.join() === c.join()) continue;
        ends.push(q);
        if (on[j] && count.get(q.join()) >= 5) targets.push(q);
      }
      let best = null, bd = 1e9;
      for (const a of targets) {
        if (!ends.some(b => b !== a && b.join() !== a.join() && blendOf(c, a, b))) continue;
        const d = (a[0] - c[0]) ** 2 + (a[1] - c[1]) ** 2 + (a[2] - c[2]) ** 2;
        if (d < bd) { bd = d; best = a; }
      }
      if (best) next[i] = best;
    }
    cell = next;
  }
  // depth: chessboard distance to the glyph's outside
  const dep = new Float32Array(w * h).fill(1e9);
  for (let i = 0; i < w * h; i++) if (!on[i]) dep[i] = 0;
  for (let pass = 0; pass < 2; pass++) for (let k = 0; k < w * h; k++) {
    const i = pass ? w * h - 1 - k : k, x = i % w, y = (i / w) | 0;
    if (!on[i]) continue;
    let d = Math.min(dep[i], x === 0 || x === w - 1 || y === 0 || y === h - 1 ? 1 : 1e9);
    for (const [ox, oy] of pass ? [[1, 0], [0, 1], [1, 1], [-1, 1]] : [[-1, 0], [0, -1], [-1, -1], [1, -1]]) {
      const X = x + ox, Y = y + oy;
      if (X >= 0 && Y >= 0 && X < w && Y < h) d = Math.min(d, dep[Y * w + X] + 1);
    }
    dep[i] = d;
  }
  // layers: 4-connected runs of near colours
  const lab = new Int32Array(w * h).fill(-1), layers = [];
  for (let s = 0; s < w * h; s++) {
    if (!on[s] || lab[s] >= 0) continue;
    const L = { px: [], depth: 0 }, stack = [s];
    lab[s] = layers.length;
    while (stack.length) {
      const i = stack.pop(), x = i % w, y = (i / w) | 0;
      L.px.push(i); L.depth += dep[i];
      for (const [X, Y] of [[x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]]) {
        const j = Y * w + X;
        if (X >= 0 && Y >= 0 && X < w && Y < h && on[j] && lab[j] < 0 && near(cell[i], cell[j], 6)) { lab[j] = layers.length; stack.push(j); }
      }
    }
    L.depth /= L.px.length;
    layers.push(L);
  }
  const order = layers.map((L, i) => i).sort((a, b) => layers[a].depth - layers[b].depth || layers[b].px.length - layers[a].px.length);
  const rank = new Int32Array(layers.length);
  order.forEach((li, r) => { rank[li] = r; });
  let defs = '', body = '', gid = 0;
  const uid = 'lbt' + (++traced);
  order.forEach((li, r) => {
    const L = layers[li], m = new Uint8Array(w * h);
    for (let i = 0; i < w * h; i++) if (on[i] && rank[lab[i]] >= r) m[i] = 1;
    // its colour by row
    const rows = new Map();
    for (const i of L.px) { const y = (i / w) | 0, c = cell[i], s = rows.get(y) || rows.set(y, [0, 0, 0, 0]).get(y); s[0] += c[0]; s[1] += c[1]; s[2] += c[2]; s[3]++; }
    const ys = [...rows.keys()].sort((a, b) => a - b), cs = ys.map(y => { const s = rows.get(y); return [s[0] / s[3], s[1] / s[3], s[2] / s[3]]; });
    let fill = hex6(cs[0]);
    if (cs.some(c => !near(c, cs[0], 3))) {
      const id = `${uid}g${gid++}`;
      defs += `<linearGradient id="${id}" gradientUnits="userSpaceOnUse" x1="0" y1="${ys[0]}" x2="0" y2="${ys.at(-1) + 1}">`
        + ys.map((y, k) => `<stop offset="${((y + 0.5 - ys[0]) / (ys.at(-1) + 1 - ys[0])).toFixed(3)}" stop-color="${hex6(cs[k])}"/>`).join('') + '</linearGradient>';
      fill = `url(#${id})`;
    }
    body += `<path fill="${fill}" fill-rule="evenodd" d="${outlines(m, w, h).map(smooth).join('')}"/>`;
  });
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}">${defs ? `<defs>${defs}</defs>` : ''}${body}</svg>`;
}
let traced = 0;
// the whole atlas (240 x 192 RGBA bytes) -> { kind: { normal, hover, pressed: svg } }
export function traceAtlas(px, W = 240) {
  const cell = (u, v) => { const c = []; for (let y = 0; y < 32; y++) for (let x = 0; x < 80; x++) { const i = 4 * ((v + y) * W + u + x); c.push([px[i], px[i + 1], px[i + 2], px[i + 3]]); } return c; };
  const rows = Object.keys(KIND).map(Number), out = {};
  ['normal', 'hover', 'pressed'].forEach((s, k) => {
    const cells = rows.map(v => cell(80 * k, v));
    // the plate under each texel: one colour per row in its middle (15..72: the most common one at 11..14 and
    // 73..76 across the rows' cells; the glyphs cover the middle); at the sides, each place's most common colour
    const mode = list => {
      const n = new Map();
      for (const c of list) { const key = c.join(); n.set(key, (n.get(key) || 0) + 1); }
      const [best, cnt] = [...n].sort((a, b) => b[1] - a[1])[0];
      return cnt >= 2 ? best.split(',').map(Number) : null;
    };
    const rowPlate = Array.from({ length: 32 }, (_, y) => mode(cells.flatMap(c => [...c.slice(y * 80 + 11, y * 80 + 15), ...c.slice(y * 80 + 73, y * 80 + 77)])));
    const plate = cells[0].map((_, i) => i % 80 >= 15 && i % 80 <= 72 ? rowPlate[(i / 80) | 0] : mode(cells.map(c => c[i])));
    rows.forEach((v, r) => { (out[KIND[v]] ||= {})[s] = traceGlyph(cells[r], plate); });
  });
  return out;
}
