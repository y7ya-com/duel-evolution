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
// D-Mail's window (CWindowModelDMail's own 512 x 512 picture, mail_win_01_c01.png, as boxes; sampled from the engine's
// 1x render): the duel title bar, a #a9aba4 frame (6..505 x 27..477), a slate panel (#7581a3, bevelled, 12..499 x
// 32..471), the mail list (16..495 x 71..250: 36-pixel rows, white, a #a8acae / #525a5e separator; the scroll column
// #d2d2d2), a light band (#96a5be > #9caabf, 251..271), the body (16..495 x 272..464, white), the body below #9898a8.
// The duel-style windows (CWindowTaskFrameDuel: My Profile, the Friend / Ignore / Team lists; htmlui-chat), sampled from
// the engine's own 1x render (window-local px):
//  - title bar rows 0..23: #f5f5f7 #f0f0f2 #e0e0e5 #c9c9d2 #b9b9c4 #b0b0bc #a8a8b6 #a0a0af #9999a9 (8) > #727288 (19)
//    #6f6f85 #66677d #55576a #4b4e5e (23); row 24 #9fa1a9, 25 #f2f2f4, 26 #c9c9d6
//  - body #9999a9; left edge #c8c9d2 x3, #c5c6cf #bbbcc6 #b5b5c1; right #b5b5c1 #a7a8b5 #898d9c #797f8f x2; bottom
//    #848697 #5c6275 #485064 x2
//  - the well (its inside at 13, 32, w - 26, h - 76): left #9a9aaf #6e6e91 #5c5c84 x3 #4b4f77 #414c6e; top #c9c9d6
//    #7f7f9e #5c5c84 x3 #42476f; right #7f879c #8589a3 #6e6e91 #5c5c84 x3 #4b4f77 #787b95; bottom #91a2b7 #a6b5c8 #afb5c7
//    #7f7f9e #5c5c84 x3 #42476f #606581; inside #c9cad2 > #dee3e9 down the well
//  - list rows (BackStripe, 16 high): every other one darker (#babac1 / #c8c8d0 at the top, #dfe3e9 at the bottom);
//    the profile's 32-high rows (BackPlane) more so (#a4a4ac / #cecfd7)
//  - button (CWindowTaskButtonDuel): #c9c9c9; top / left #323232 #989898 #fff #f2f2f2 #d7d7d7, bottom #4f4f4f #7f7f7f
//    #a6a6a6 #c1c1c1, right #656565 #a5a5a5 #bcbcbc #c7c7c7; black caption. Hover / pressed: not sampled (ponytail:
//    brighter / the bevel turned over)
const DUEL_CSS = `
.yo2-duel { position: absolute; left: 0; top: 0; background: #9999a9;
  box-shadow: inset 3px 0 #c8c9d2, inset 0 -2px #485064, inset -2px 0 #797f8f, inset 4px 0 #c5c6cf, inset 0 -3px #5c6275,
    inset -3px 0 #898d9c, inset 5px 0 #bbbcc6, inset 0 -4px #848697, inset -4px 0 #a7a8b5, inset 6px 0 #b5b5c1, inset -5px 0 #b5b5c1; }
.yo2-duel::before { content: ''; position: absolute; left: 0; right: 0; top: 0; height: 27px;
  background: linear-gradient(to bottom, #f5f5f7 0.5px, #f0f0f2 1.5px, #e0e0e5 2.5px, #c9c9d2 3.5px, #b9b9c4 4.5px, #b0b0bc 5.5px,
    #a8a8b6 6.5px, #a0a0af 7.5px, #9999a9 8.5px, #727288 19.5px, #6f6f85 20.5px, #66677d 21.5px, #55576a 22.5px, #4b4e5e 23.5px,
    #9fa1a9 24px 25px, #f2f2f4 25px 26px, #c9c9d6 26px 27px); }
.yo2-well { position: absolute; background: linear-gradient(to bottom, #c9cad2, #dee3e9); }
.yo2-well::after { content: ''; position: absolute; inset: -6px -8px -9px -7px; pointer-events: none;
  box-shadow: inset 1px 0 #9a9aaf, inset 0 1px #c9c9d6, inset -1px 0 #787b95, inset 0 -1px #606581,
    inset 2px 0 #6e6e91, inset 0 2px #7f7f9e, inset -2px 0 #4b4f77, inset 0 -2px #42476f,
    inset 5px 0 #5c5c84, inset 0 5px #5c5c84, inset -5px 0 #5c5c84, inset 0 -5px #5c5c84,
    inset 6px 0 #4b4f77, inset 0 6px #42476f, inset -6px 0 #6e6e91, inset 0 -6px #7f7f9e,
    inset 7px 0 #414c6e, inset -7px 0 #8589a3, inset 0 -7px #afb5c7, inset -8px 0 #7f879c, inset 0 -8px #a6b5c8, inset 0 -9px #91a2b7; }
.yo2-stripes { position: absolute;
  background: repeating-linear-gradient(to bottom, rgba(60, 60, 80, .075) 0 16px, transparent 16px 32px), linear-gradient(to bottom, #c5c6ce, #dfe3e9); }
.yo2-row { position: absolute; }
.yo2-row[data-dark] { background: rgba(60, 60, 80, .23); }
.yo2-dbtn { position: absolute; box-sizing: border-box; margin: 0; padding: 0; border: 1px solid; border-color: #323232 #656565 #4f4f4f #323232;
  border-radius: 2px; background: #c9c9c9; color: #000; cursor: inherit;
  box-shadow: inset 1px 1px #989898, inset -1px -1px #7f7f7f, inset 2px 2px #fff, inset -2px -2px #a6a6a6, inset 3px 3px #f1f1f1,
    inset -3px -3px #c1c1c1, inset 4px 4px #d6d6d6; }
.yo2-dbtn:hover:not(:disabled), .yo2-dbtn[data-state=hover] { filter: brightness(1.06); }
.yo2-dbtn:active:not(:disabled), .yo2-dbtn[data-state=pressed] { box-shadow: inset 1px 1px #7f7f7f, inset 2px 2px #a6a6a6, inset -1px -1px #fff, inset 3px 3px #c1c1c1; }
.yo2-dbtn:disabled, .yo2-dbtn[data-state=disabled] { color: #808080; }
.yo2-dbtn > .txt { position: absolute; }
.yo2-mail { position: absolute; left: 0; top: 0; background: #9898a8;
  box-shadow: inset 3px 0 #e1e1e6, inset 0 -2px #474f63, inset -2px 0 #8f96a4, inset 5px 0 #d6d6dc, inset 0 -3px #5b6174,
    inset -3px 0 #a1a6b2, inset 0 -4px #838596, inset -4px 0 #c4c6ce, inset -5px 0 #d6d6dc; }
.yo2-mail::before { content: ''; position: absolute; left: 0; right: 0; top: 0; height: 27px;
  background: linear-gradient(to bottom, #f4f4f6 0.5px, #eeeef1 1.5px, #dedee3 2.5px, #c8c8d0 3.5px, #b8b8c3 4.5px, #b0b0bc 5.5px,
    #a8a8b5 6.5px, #a0a0af 7.5px, #9999a9 8.5px, #737388 19.5px, #707086 20.5px, #69697f 21.5px, #57596c 22.5px, #474a5b 23.5px,
    #9ea0a8 24px 25px, #fafafb 25px 26px, #e3e4e3 26px 27px); }
.yo2-mail > i { position: absolute; display: block; box-sizing: border-box; }
.yo2-mail > .fr { background: #a9aba4; box-shadow: inset 1px 1px #b2b4ad, inset -1px -1px #8a9193; }
.yo2-mail > .sl { background: #7581a3; box-shadow: inset 1px 1px #627085, inset 2px 2px #737e9a, inset 3px 3px #8c93ac,
    inset -1px -1px #abb2bd, inset -2px -2px #939db7, inset -3px -3px #8c93ac; }
.yo2-mail > .ls { border: 1px solid #8c8f9c; border-right: 0;
  background: linear-gradient(to right, transparent calc(100% - 16px), #e8e8e8 calc(100% - 16px) calc(100% - 15px), #d2d2d2 calc(100% - 15px)),
    repeating-linear-gradient(to bottom, #fff 0 31px, #a8acae 31px 32px, #525a5e 32px 33px, #a8acae 33px 36px); }
.yo2-mail > .bd { border-top: 1px solid #5a647e; border-bottom: 1px solid #58627c;
  background: linear-gradient(to bottom, #96a5be, #9caabf); }
.yo2-mail > .tx { border: 1px solid #8c8f9c; border-right: 0;
  background: linear-gradient(to right, #fff calc(100% - 16px), #e8e8e8 calc(100% - 16px) calc(100% - 15px), #d2d2d2 calc(100% - 15px)); }`;
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
.yo2-scroll > b { position: absolute; left: 2px; width: 12px; box-sizing: border-box; border: 1px solid #92979a; background: #fff; }
${DUEL_CSS}`;

// The 2008 button plate lives in ui.js (the starter picker draws it too): re-exported here
export { plateLook } from '../../ui.js';

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

// A duel-style window's frame (CWindowTaskFrameDuel), w x h at the window's 0, 0: the title bar, the body, and the well
// at 13, 32, w - 26, h - 76 (its inside: the content's; children go in .well)
export function duelWindow(parent, { w, h } = {}) {
  inject();
  const d = document.createElement('div'), well = document.createElement('div');
  d.className = 'yo2-duel';
  place(d, { w, h });
  well.className = 'yo2-well';
  place(well, { x: 13, y: 32, w: w - 26, h: h - 76 });
  d.append(well);
  d.well = well;
  parent.append(d);
  return d;
}
// A duel-style button (CWindowTaskButtonDuel): a <button>, its caption centred; state as menuButton's
export function duelButton(parent, { x, y, w, h = 24, label = '', state = null } = {}) {
  inject();
  const b = document.createElement('button');
  b.className = 'yo2-dbtn';
  b.type = 'button';
  place(b, { x, y, w, h });
  setState(b, state);
  b.disabled = state === 'disabled';
  if (label) textBox(b, label, { x: -1, y: Math.floor((h - 16) / 2) - 1, w: w - 2, align: 1 });
  parent.append(b);
  return b;
}
// a list's striped rows (CWindowTaskBackStripe, 16-pixel rows)
export const stripes = piece('yo2-stripes');

// D-Mail's window background (its 512 x 512 picture as boxes)
export function mailWindow(parent, { w = 512, h = 512 } = {}) {
  inject();
  const d = document.createElement('div');
  d.className = 'yo2-mail';
  place(d, { w, h });
  for (const [cls, x, y, bw, bh] of [['fr', 6, 27, w - 12, 451], ['sl', 12, 32, w - 24, 440], ['ls', 16, 71, w - 32, 180],
    ['bd', 16, 251, w - 32, 21], ['tx', 16, 272, w - 32, 193]]) {
    const i = document.createElement('i');
    i.className = cls;
    place(i, { x, y, w: bw, h: bh });
    d.append(i);
  }
  parent.append(d);
  return d;
}
