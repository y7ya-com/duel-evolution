// Shared CSS components (owner's rule, CONTRACT.md "Skin"): where the game's art is a simple gradient, border or bevel
// it is CSS with the original's sampled colours, sharp at any DPR; bitmaps only for real pictures. The judgement is
// "looks the same, sharper", not pixel-identical. Sizes in game px (the layer scales). Text: Arial DOM text.
// Sampled from the engine's own 1x render of the lobby Main Menu (CMainMenu, notes nodp-mainmenu.png) and from
// window_base_01_c01.png's texels:
//  - menu button (24 high): border #e36f08 (#e99223 right, #e68317 bottom), radius 3; inside, rows from the top
//    #f1b780 #ffffc8 #fff97f #f9e45f then #f4d558, the last three #f3d054 #f0be45 #eca430; columns from the left
//    #f1b757 #ffff95 #fff673 #f9e15d, from the right #f0bd45 #f2cc51 #f3d357; caption white, outlined dark
//  - title bar (22 high): #e5f1f4 > #cae7f3 > #a3d7f3 > #9dd3f4 ... #5fa4f5 #4e93f5 #336deb, a #234cdb line under it;
//    close box 15 x 13 at 4 from the right, 4 down: white left edge, #fffec2 #fffd63 #fffc00 ... #f1bb00 #f5cf80,
//    right edge #f5cf00 #f7dc80, a #005fea X (10 x 9, 2 px strokes)
//  - panel frame (c01): 3 px #76ffff left / #a7ffff top, then #68e8ff / #79ffff, the right and bottom #41abef /
//    #329be5 after #4db9f7 / #46b1f2, all at the window's alpha 178/255; the body #84f4ff (solved from two engine pixels over a known backdrop); a
//    bottom-thick frame (the Main Menu's) has an opaque #e5e5e5 band above its bottom bevel
// States: the game's (data-state = the snapshot's hover / pressed / disabled, pass mode) or the pointer's (:hover /
// :active, owned mode). The menu button's are sampled (MBTN); the close box's are still a brighter / darker filter
// (ponytail: until a live capture of them).
import { FONT, spacing, textBox } from './basic.js';

const OUTLINE = '#4a4a4a';   // the shadow text's edge: thin, four ways (eight read bold next to the engine's)
const outlined = `text-shadow: 1px 0 ${OUTLINE}, -1px 0 ${OUTLINE}, 0 1px ${OUTLINE}, 0 -1px ${OUTLINE}`;
// The menu button's looks (main_btn_01_c01's columns 0 normal, 1 hover, 2 pressed; hover and pressed sampled by
// htmlui-select live): rows from the top edge in, the body, rows to the bottom edge, columns from the left edge in,
// columns to the right edge, the border (top right bottom left)
const MBTN = {
  normal: { top: ['#f1b780', '#ffffc8', '#fff97f', '#f9e45f'], body: '#f4d558', bottom: ['#f3d054', '#f0be45', '#eca430'],
    left: ['#f1b757', '#ffff95', '#fff673', '#f9e15d'], right: ['#f3d357', '#f2cc51', '#f0bd45'], border: '#e36f08 #e99223 #e68317 #e36f08' },
  hover: { top: ['#fffec8', '#ffffff', '#ffffe2', '#fcf4b8'], body: '#faeaac', bottom: ['#f9e4a4', '#f6d086', '#f2b55e'],
    left: ['#fffec8', '#ffffff', '#ffffdf', '#fcf4b6'], right: ['#fae8aa', '#f8e09e', '#f6d086'], border: '#fffe92' },
  pressed: { top: ['#fada68', '#f8c550', '#fce473', '#fef98c'], body: '#ffff93', bottom: ['#ffff9e', '#ffffd2', '#fffffe'],
    left: ['#fceb7c', '#fce272', '#fef487', '#fffe91'], right: ['#ffff9b', '#ffffbf', '#ffffed'], border: '#fffe92' },
};
// one look as the button's border-color and background: a hard stop per pixel row and column
const mbtnLook = ({ top, body, bottom, left, right, border }) => {
  const edge = (dir, near, mid, far) => `linear-gradient(to ${dir}, ${near.map((c, i) => `${c} ${i + 0.5}px`).join(', ')},
    ${mid} ${near.length + 0.5}px, ${mid} calc(100% - ${far.length + 0.5}px), ${far.map((c, j) => `${c} calc(100% - ${far.length - j - 0.5}px)`).join(', ')})`;
  return `border-color: ${border}; background: ${edge('right', left, 'transparent', right)}, ${edge('bottom', top, body, bottom)};`;
};

// The chat's pieces (htmlui-chat), from the atlas texels (data/common/window/*):
//  - icon bar (iconbar_01_c01, 24 high, 70 %): rows 0..18 the middle column's gradient #fff (rows 0..2) #beffff
//    #86d9ff #80d3ff > #226cff, a lighter left edge (3 px #daffff > #2d8fff) under a 5-px rounded corner, a darker right
//    edge (4 px #a6ffff #7dd7f6 #69c5ef > #195def); row 19 #0132d3; rows 20..23 the frame's top (#59c6ff, its side
//    bevels: 3 #76ffff 1 #68e8ff on the left, 1 #4db9f7 3 #41abef on the right)
//    (row 23 #fff). Stops sit at texel + 1 px: the engine reads every pixel half a texel up-left, so pixel y is
//    the mean of texel rows y - 1 and y
//  - plane (window_base_01_c01's middle tile, 70 %): #fff
//  - chop (window_base_01_c01's sides and bottom, no top, 70 %): left 3 #76ffff, 1 #68e8ff, 3 #59c6ff, 1 #fff; right
//    1 #fff, 3 #59c6ff, 1 #4db9f7, 3 #41abef; bottom 1 #fff, 3 #59c6ff, 1 #46b1f2, 3 #329be5
//  - tab (tab_01_c01, 24 high, as wide as its caption + 20): a 45-degree left edge and a 1-px #0132d3 outline (top,
//    slant, right), a light inner edge, the bottom open. Current: outline from row 2, #fff inner edge (2 rows on top,
//    1 px on the slant and the right), body rows 5..19 #fafeff #dcfaff #b3f4ff > #81edff. Others: outline from row 1,
//    #dbdbdb inner edge (1 row / 1 px), body rows 3..18 #39a6d3, #4690d5 #3d98ec > #379dfd (row 19 open: the bar's line
//    shows under it). Hover: the game has no hover look; ponytail: a brighter body
//  - icon (icon_01_c01, 16 x 24 cells; the box 15 x 14 from row 3): a 1-px #fff border, #fffc00 inside, bevel top
//    #fffe86 #fffd40, left #fffd3d #fffc22, right #fae600 #f0b900, bottom #f7d800 #eb9f00; the glyph #005fea (expand: an
//    arrow head over a block; hide: an X). Hover: box #fefdc0, bevel #fefed8 / #f9e79e / #eca93f, glyph #46c4ff
//  - scroll bar (scroll_01_c00): track #d4e2e4; arrows 14 x 14 at 1,1 of their 16 x 16, #fff with a 1-px #92979a
//    border and a #92979a arrow head; the thumb 12 wide at 2, #fff with a 1-px #92979a border
const A70 = (178 / 255).toFixed(3);
const tabClip = (top, left0, inset) =>   // the slant: at row y, x = left0 - y (one pixel per row); inset px off the right
  `polygon(${left0 - top}px ${top}px, calc(100% - ${inset}px) ${top}px, calc(100% - ${inset}px) 100%, 0 100%, 0 ${left0}px)`;
const svg = (body, fill = '', box = '0 0 15 14') => `url("data:image/svg+xml,${encodeURIComponent(`<svg xmlns='http://www.w3.org/2000/svg' viewBox='${box}'>${body.replaceAll('F', fill)}</svg>`)}")`;
const GLYPH = {   // in the 15 x 14 box
  expand: f => svg("<path d='M7 3h1l4 4v3H3V7z' fill='F'/>", f),
  hide: f => svg("<path d='M3 3l9 8M12 3l-9 8' stroke='F' stroke-width='2.2'/>", f),
};
const ARROW = { up: "<path d='M6 4h2l3 3v3H3V7z' fill='#92979a'/>", down: "<path d='M3 4h8v3l-3 3H6L3 7z' fill='#92979a'/>" };   // 14 x 14
const CHAT_CSS = `
.yo2-bar { position: absolute; height: 24px; opacity: ${A70};
  background:
    linear-gradient(to right, #76ffff 3px, #68e8ff 4px, #59c6ff 5px, #59c6ff calc(100% - 4px), #4db9f7 calc(100% - 3px), #41abef calc(100% - 2px)) 0 21px / 100% 2px no-repeat,
    linear-gradient(to bottom, #daffff 6px, #a9ffff 7px, #8ffaff 9px, #2d8fff 19px) 0 0 / 3px 19px no-repeat,
    linear-gradient(to bottom, #a6ffff 1px, #7dd7f6 2px, #69c5ef 3px, #66c1ef 4px, #195def 19px) 100% 0 / 4px 19px no-repeat,
    linear-gradient(to bottom, #fff 3px, #beffff 4px, #86d9ff 5px, #80d3ff 6px, #226cff 19px, #0132d3 20px, #59c6ff 21px, #59c6ff 23px, #fff 24px);
  border-top-left-radius: 5px 5px; }
.yo2-plane { position: absolute; background: #fff; opacity: ${A70}; }
.yo2-chop { position: absolute; opacity: ${A70};
  box-shadow: inset 3px 0 #76ffff, inset 0 -3px #329be5, inset -3px 0 #41abef, inset 4px 0 #68e8ff, inset 0 -4px #46b1f2,
    inset -4px 0 #4db9f7, inset 7px 0 #59c6ff, inset 0 -7px #59c6ff, inset -7px 0 #59c6ff, inset 8px 0 #fff,
    inset 0 -8px #fff, inset -8px 0 #fff; }
.yo2-tab { position: absolute; height: 24px; margin: 0; padding: 0; border: 0; background: none; cursor: inherit; }
.yo2-tab > i { position: absolute; inset: 0; }
.yo2-tab > i:nth-child(1) { background: #0132d3; clip-path: ${tabClip(1, 17, 0)}; bottom: 5px; }
.yo2-tab > i:nth-child(2) { background: #dbdbdb; clip-path: ${tabClip(2, 18, 1)}; bottom: 5px; }
.yo2-tab > i:nth-child(3) { clip-path: ${tabClip(3, 19, 2)}; bottom: 5px;
  background: linear-gradient(to bottom, #39a6d3 3.5px, #4690d5 4.5px, #3d98ec 11.5px, #379dfd 18.5px); }
.yo2-tab[aria-pressed=true] > i:nth-child(1) { clip-path: ${tabClip(2, 18, 0)}; bottom: 4px; }
.yo2-tab[aria-pressed=true] > i:nth-child(2) { background: #fff; clip-path: ${tabClip(3, 19, 1)}; bottom: 4px; }
.yo2-tab[aria-pressed=true] > i:nth-child(3) { clip-path: ${tabClip(5, 20, 2)}; bottom: 4px;
  background: linear-gradient(to bottom, #fafeff 5.5px, #dcfaff 9.5px, #b3f4ff 13.5px, #81edff 19.5px); }
.yo2-tab:not([aria-pressed=true]):hover > i:nth-child(3) { filter: brightness(1.12); }
.yo2-tab:disabled { pointer-events: none; }
.yo2-icon { position: absolute; width: 16px; height: 24px; margin: 0; padding: 0; border: 0; background: none; cursor: inherit; }
.yo2-icon::before { content: ''; position: absolute; left: 0; top: 3px; width: 15px; height: 14px; box-sizing: border-box;
  border: 1px solid #fff; background: var(--g) center / 15px 14px no-repeat border-box, #fffc00;
  box-shadow: inset 0 1px #fffe86, inset 0 2px #fffd40, inset 1px 0 #fffd3d, inset 2px 0 #fffc22, inset -1px 0 #f0b900,
    inset -2px 0 #fae600, inset 0 -1px #eb9f00, inset 0 -2px #f7d800; }
.yo2-icon:hover::before, .yo2-icon[data-state=hover]::before { background: var(--gh) center / 15px 14px no-repeat border-box, #fefdc0;
  box-shadow: inset 0 1px #fefed8, inset 1px 0 #fefdcf, inset -1px 0 #efba5a, inset -2px 0 #f9e79e, inset 0 -1px #eaa032, inset 0 -2px #f6d988; }
.yo2-icon:active::before, .yo2-icon[data-state=pressed]::before { filter: brightness(0.9); }
.yo2-icon[data-kind=expand] { --g: ${GLYPH.expand('#005fea')}; --gh: ${GLYPH.expand('#46c4ff')}; }
.yo2-icon[data-kind=hide] { --g: ${GLYPH.hide('#005fea')}; --gh: ${GLYPH.hide('#46c4ff')}; }
.yo2-scroll { position: absolute; width: 16px; background: #d4e2e4; }
.yo2-scroll > i { position: absolute; left: 1px; width: 14px; height: 14px; box-sizing: border-box; border: 1px solid #92979a;
  background: #fff 0 0 / 14px 14px no-repeat border-box; }
.yo2-scroll > i:nth-child(1) { top: 1px; background-image: ${svg(ARROW.up, '', '0 0 14 14')}; }
.yo2-scroll > i:nth-child(2) { bottom: 1px; background-image: ${svg(ARROW.down, '', '0 0 14 14')}; }
.yo2-scroll > b { position: absolute; left: 2px; width: 12px; box-sizing: border-box; border: 1px solid #92979a; background: #fff; }`;

// The 2008 button plate (CWindowTaskSwitch's swich_01_c00.png, one 24 x 24 9-slice per look), sampled texel for texel:
// a 1 px border, two rows at the top and two at the bottom, two columns each side, the body, and a lighter stripe
// every 4 rows (from row 5, or 6 for pressed and checked). In CSS (hard-stop gradients) it is sharp at any DPR, where
// the bitmap's stretched 8-px slices went soft. Looks (switchColumn): 0 normal, 1 hover, 2 pressed, 3 checked,
// 4 checked + hover. [border, top1, top2, body, stripe, first stripe row, bottom1, bottom2, left1, left2, right1, right2]
const PLATE = [
  ['#011434', '#fefdfc', '#f8f4ef', '#f4efe7', '#faf7f3', 5, '#f1ede7', '#c6bba7', '#f7f4ef', '#f6f2eb', '#e9e2d7', '#d3c9b9'],
  ['#011434', '#ffe8b1', '#ffe9c3', '#ffffff', '#ffffef', 5, '#fff1d0', '#ffb85b', '#ffeac6', '#fff3df', '#ffeed7', '#ffcc89'],
  ['#011434', '#838383', '#d4d4d4', '#c0c0c0', '#e0e0e0', 6, '#d0d0d0', '#f0f0f0', '#949494', '#b1b1b1', '#c8c8c8', '#cfcfcf'],
  ['#011434', '#afae64', '#f0efc0', '#fffe92', '#ffffc9', 6, '#fffead', '#ffffe5', '#c6c571', '#eceb87', '#fffea1', '#fffeac'],
  ['#ffa92e', '#afae64', '#f0efc0', '#fffe92', '#ffffc9', 6, '#fffead', '#ffffe5', '#c6c571', '#eceb87', '#fffea1', '#fffeac'],
];
// :is(#htmlui-host, body): an id's weight (the bridge resets #htmlui-host button.btn's border and background), and
// still a match outside the host (skin.html)
const plateCss = ([bd, t1, t2, body, st, row, b1, b2, l1, l2, r1, r2], i) => `:is(#htmlui-host, body) .yo2-plate[data-look="${i}"] { border: 1px solid ${bd};
  background: linear-gradient(to right, ${l1} 0 1px, ${l2} 1px 2px, transparent 2px calc(100% - 2px), ${r1} calc(100% - 2px) calc(100% - 1px), ${r2} calc(100% - 1px)),
    linear-gradient(to bottom, ${t1} 0 1px, ${t2} 1px 2px, transparent 2px calc(100% - 2px), ${b1} calc(100% - 2px) calc(100% - 1px), ${b2} calc(100% - 1px)),
    repeating-linear-gradient(to bottom, transparent 0 3px, ${st} 3px 4px) 0 ${row - 4}px / 100% calc(100% - 4px) no-repeat, ${body}; }`;
// a plate behind a control's caption: the element gets the class and data-look (the switch column)
export function plateLook(el, look) { inject(); el.classList.add('yo2-plate'); el.dataset.look = look; }

// built on first use: basic.js imports this file and this file reads basic.js's FONT, so nothing runs at load
const skinCss = () => `
.yo2-mbtn { position: absolute; box-sizing: border-box; margin: 0; padding: 0; border: 1px solid; border-radius: 3px;
  ${mbtnLook(MBTN.normal)} color: #fff; ${outlined};
  font: 14.32px/22px ${FONT}; text-align: center; white-space: nowrap; overflow: hidden; cursor: inherit; }
.yo2-mbtn[data-state=hover], .yo2-mbtn:not([data-state]):hover { ${mbtnLook(MBTN.hover)} }
.yo2-mbtn[data-state=pressed], .yo2-mbtn:not([data-state]):active { ${mbtnLook(MBTN.pressed)} }
.yo2-mbtn[data-state=pressed] > span, .yo2-mbtn:not([data-state]):active > span { position: relative; top: 1px; }
.yo2-mbtn[data-state=disabled], .yo2-mbtn:disabled { filter: grayscale(0.8) brightness(0.92); color: #e8e8e8; }
.yo2-title { position: absolute; box-sizing: border-box; height: 22px; color: #fff; ${outlined};
  font: 14.32px/20px ${FONT}; text-align: center; white-space: nowrap;
  background: linear-gradient(to bottom, #e5f1f4 0.5px, #cae7f3 2.5px, #a3d7f3 4.5px, #9dd3f4 6.5px, #5fa4f5 17.5px,
    #4e93f5 18.5px, #336deb 19.5px, #234cdb 20.5px, #234cdb 21.5px); }
.yo2-close { position: absolute; top: 4px; right: 4px; width: 16px; height: 13px; box-sizing: border-box; margin: 0;
  padding: 0; border: 0; border-left: 1px solid #fff; cursor: inherit;
  background: linear-gradient(to right, transparent calc(100% - 2.5px), #f5cf00 calc(100% - 1.5px), #f7dc80 calc(100% - 0.5px)),
    linear-gradient(to bottom, #fffec2 0.5px, #fffd63 1.5px, #fffc00 3px, #fffc00 calc(100% - 2.5px), #f1bb00 calc(100% - 1.5px), #f5cf80 calc(100% - 0.5px)); }
.yo2-close::before, .yo2-close::after { content: ''; position: absolute; left: 1px; top: 5.5px; width: 12px; height: 2px;
  background: #005fea; border-radius: 1px; }
.yo2-close::before { transform: rotate(42deg); }
.yo2-close::after { transform: rotate(-42deg); }
.yo2-close[data-state=hover], .yo2-close:not([data-state]):hover { filter: brightness(1.08); }
.yo2-close[data-state=pressed], .yo2-close:not([data-state]):active { filter: brightness(0.9); }
.yo2-panel { position: absolute; box-sizing: border-box; }
.yo2-panel::before { content: ''; position: absolute; inset: 0; opacity: ${(178 / 255).toFixed(3)}; z-index: -1;
  background: #84f4ff; box-shadow: inset 3px 0 0 #76ffff, inset 0 3px 0 #a7ffff, inset -3px 0 0 #41abef,
    inset 0 -3px 0 #329be5, inset 4px 0 0 #68e8ff, inset 0 4px 0 #79ffff, inset -4px 0 0 #4db9f7, inset 0 -4px 0 #46b1f2,
    inset 7px 0 0 #59c6ff, inset 0 7px 0 #59c6ff, inset -7px 0 0 #59c6ff, inset 0 -7px 0 #59c6ff; }
.yo2-panel { isolation: isolate; }
.yo2-band { position: absolute; left: 7px; right: 7px; bottom: 7px; background: #e5e5e5; }
:is(#htmlui-host, body) .yo2-plate { box-sizing: border-box; border: 1px solid; }
${PLATE.map(plateCss).join('\n')}
${CHAT_CSS}`;

function inject() {
  if (document.getElementById('htmlui-skin')) return;
  const st = document.createElement('style');
  st.id = 'htmlui-skin';
  st.textContent = skinCss();
  document.head.append(st);
}
const place = (el, { x = 0, y = 0, w, h }) => Object.assign(el.style, { left: x + 'px', top: y + 'px',
  ...(w != null && { width: w + 'px' }), ...(h != null && { height: h + 'px' }) });
// state: 'normal' | 'hover' | 'pressed' | 'disabled' (the snapshot's), or null to follow the pointer (owned mode)
const setState = (el, state) => { if (state) el.dataset.state = state; else delete el.dataset.state; };

// The yellow menu button (lobby Main Menu and its kin). Returns the <button>; .set({ label, state }) updates it.
export function menuButton(parent, { x, y, w, h = 24, label = '', state = 'normal' } = {}) {
  inject();
  const b = document.createElement('button'), s = document.createElement('span');
  b.className = 'yo2-mbtn';
  b.type = 'button';
  b.append(s);
  place(b, { x, y, w, h });
  b.style.lineHeight = h - 2 + 'px';
  b.set = ({ label: l, state: st } = {}) => {
    if (l != null) { const ls = spacing(l); s.textContent = l; Object.assign(s.style, { letterSpacing: ls + 'px', marginRight: -ls + 'px' }); }
    if (st !== undefined) setState(b, st);
  };
  b.set({ label, state });
  parent.append(b);
  return b;
}

// The blue title bar, with its close box unless close is false. Returns the bar; .close is the close <button>.
export function titleBar(parent, { x = 0, y = 0, w, title = '', close = true, closeState = 'normal' } = {}) {
  inject();
  const t = document.createElement('div');
  t.className = 'yo2-title';
  place(t, { x, y, w });
  const tt = document.createElement('span'), ls = spacing(title);
  tt.textContent = title;
  Object.assign(tt.style, { letterSpacing: ls + 'px', marginRight: -ls + 'px' });
  t.append(tt);
  if (close) {
    const c = t.close = document.createElement('button');
    c.className = 'yo2-close';
    c.type = 'button';
    c.setAttribute('aria-label', 'Close');
    setState(c, closeState);
    t.append(c);
  }
  parent.append(t);
  return t;
}

// The blue panel frame (window_base_01_c01's bevel, translucent as the window draws it). Children go inside it.
// band: the bottom-thick frame's grey band above the bottom bevel, in px (the Main Menu's: 6).
export function panel(parent, { x = 0, y = 0, w, h, band = 0 } = {}) {
  inject();
  const p = document.createElement('div');
  p.className = 'yo2-panel';
  place(p, { x, y, w, h });
  if (band) { const b = document.createElement('div'); b.className = 'yo2-band'; b.style.height = band + 'px'; p.append(b); }
  parent.append(p);
  return p;
}

// the icon bar along a window's top (CWindowTaskIconbar) and a window's back plane (BackPlane)
const piece = cls => (parent, r) => { inject(); const d = document.createElement('div'); d.className = cls; place(d, r); parent.append(d); return d; };
export const iconbar = piece('yo2-bar'), plane = piece('yo2-plane'), chop = piece('yo2-chop');

// A tab (CWindowTaskTab): a <button>, its caption at 16, 4; active: the current tab (aria-pressed)
export function tab(parent, { x = 0, y = 0, w, label = '', active = false } = {}) {
  inject();
  const b = document.createElement('button');
  b.className = 'yo2-tab';
  b.type = 'button';
  b.append(document.createElement('i'), document.createElement('i'), document.createElement('i'));
  place(b, { x, y, w });
  b.setAttribute('aria-pressed', !!active);
  if (label) textBox(b, label, { x: 16, y: 4 });
  parent.append(b);
  return b;
}
// A window icon (CWindowTaskIconExpand / IconHide: 16 x 24): kind 'expand' (an arrow head) or 'hide' (an X)
export function icon(parent, { x = 0, y = 0, kind, label = kind, state = null } = {}) {
  inject();
  const b = document.createElement('button');
  b.className = 'yo2-icon';
  b.type = 'button';
  b.dataset.kind = kind;
  b.setAttribute('aria-label', label);
  setState(b, state);
  place(b, { x, y });
  parent.append(b);
  return b;
}
// A vertical scroll bar (CWindowTaskScroll): length px, the thumb at pos (from below the up arrow), len px
export function scrollbar(parent, { x = 0, y = 0, length, pos = 0, len = 16 } = {}) {
  inject();
  const d = document.createElement('div'), t = document.createElement('b');
  d.className = 'yo2-scroll';
  d.append(document.createElement('i'), document.createElement('i'), t);
  place(d, { x, y, h: length });
  Object.assign(t.style, { top: 16 + pos + 'px', height: len + 'px' });
  parent.append(d);
  return d;
}
