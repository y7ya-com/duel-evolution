// The duel set-up windows in HTML, owned by the DOM (chat.js's owned(), as social.js): the lobby's Duel menu
// (CWindowModelDuel) and the two it opens, Auto Duel (CWindowModelDuelFind) and Create Duel (CWindowModelDuelWait)
// (src/Lobby/yo2DuelMenu.h: not decompiled; their controls as the snapshot reports them), Duel Options
// (CWindowModelDuelConfig + CWindowTaskDuelConfigFrame, src/Game/yo2DuelWindows.cpp), the bar's door list
// (CWindowModelMove + CWindowTaskFrameMove, src/Game/yo2MenuMove.cpp, yo2MenuMain.cpp) and the player list's search
// menu (CFindMenu, src/Lobby/yo2FindMenu.cpp).
// The owner's Skin rule (CONTRACT.md: sharp at 2x): every piece of their art is CSS here with the texels' colours
// (data/common/window/, sampled from the atlases; cited per piece below): the duel frame (duel_win_01_c01, a 9-slice:
// grey title bar, grey body, a slate well with its 4-pixel mesh), Duel Options' one picture (duel_win_03_c01: the same
// with a blue help box), the choice switches (duel_btn_02_c01: a white glow bar, pink when chosen), the duel buttons
// (duel_btn_01_c01: grey, orange-and-yellow on hover / pressed), the help arrows (duel_arrow_01_c01), the Move frame
// (move_win_01_c01: green), the search menu's thin frame and rows (window_base_01_c01). Text: Arial (textBox, spaced as
// the game). Input: real <button>s that click the game's control (api.click), the password a real <input> (chat.js's
// ownInput), the help text's scroll bar a native box (ownScroll); the Move list's wheel sets its hidden scroll bar.
// For skin.js once promoted: DS_CSS's .ds-btn (the duel button's hover / pressed, sampled; skin.js's are filters).
import { owned } from './chat.js';
const ui = await import('../../ui.js').catch(() => null);   // null under node (the unit test needs no DOM)
const basic = ui && await import('../controls/basic.js');
const skin = ui && await import('../controls/skin.js');

const fam = c => c.cls.replace(/^CWindowTask/, '');
const top = c => !c.parent;

// --- The choice switches (CWindowTaskPictureSwitch, 224 x 32): duel_btn_02_c01.png rows 0..31 a white bar whose
// alpha fades out to both ends (the look normal and hover, DuelConfig's setImages), rows 33..62 the same in pink
// (pressed and checked); duel_btn_02_c02.png the pink alone. Which one the engine shows, and its drawn colour and alpha
// (the sprite's col, a: the game tints and fades them), come from the snapshot. duel_arrow_01_c01.png (24 x 16 at u 0
// up, u 24 down): a pink triangle in a white glow (the help text's arrows, hidden unless the game shows them).
export function tone(s) {
  if (!s?.tex) return null;
  if (/duel_arrow_01/.test(s.tex)) return s.src?.[0] >= 24 ? 'down' : 'up';
  if (/duel_btn_02_c02/.test(s.tex)) return 'pink';
  if (/duel_btn_02_c01/.test(s.tex)) return (s.src?.[1] ?? 0) >= 32 ? 'pink' : 'white';
  return null;
}
// A switch's look, stable while the pointer moves (owned mode: hover and press are the DOM's): what it shows at rest
// (checked: the checked sprite's), pressed, and the colour and alpha it is drawn with
export function glow(c) {
  const a = c.art || {}, rest = c.checked && a.checked ? a.checked : a.normal;
  const col = rest?.col || [1, 1, 1, 1];
  return { rest: tone(rest), down: tone(a.pressed) || tone(rest), rgb: col.slice(0, 3).map(v => Math.round(v * 255)),
    a: +(rest?.a ?? c.alpha ?? 1).toFixed(3) };
}

// --- The Move frame's size (CWindowModelMove::layout, 0x00a6ada0): the widest shown item + 38, as wide as the × is
// from the left + 24 (close_.x = frameW - 24), at least six rows high (rows_ * 26 + 30) or the window's height
export function moveFrame(win) {
  const close = win.controls.find(c => c.cls === 'CWindowTaskIconHide' && top(c));
  const items = win.controls.filter(c => c.cls === 'CWindowTaskButtonDuel' && top(c) && c.shown);
  const w = close ? close.x + 24 : items.length ? Math.max(...items.map(c => c.x + c.w)) + 27 : win.w;
  return { w, h: Math.max(win.h, 6 * 26 + 30) };
}

// The search menu's rows (CFindMenu: an ActiveListbox 8 in, 16-pixel rows; CWindowTaskActiveListbox::onMain picks the
// row under the mouse): the game point at row i's centre, for api.click
export const rowPoint = (win, list, i) => [win.x + list.x + Math.floor(list.w / 2), win.y + list.y + 16 * i + 8];

// What a control is drawn from, so that hover / press (the DOM's in owned mode) and the engine's own bookkeeping (world
// positions, the focus) don't redraw it: buttons keep only 'disabled' of the game's state; a switch its look (glow); the
// frames the window's size (FrameDuel reads 0 x 0, DuelConfigFrame its 80 x 24 piece, FrameMove its layout's);
// CFindMenu's list becomes rows of buttons (a class owned() doesn't take as a native list)
export function prep(win) {
  const frame = /Move$/.test(win.cls) ? moveFrame(win) : null;
  return { ...win, controls: win.controls.map(c => {
    const f = fam(c), { wx, wy, wz, focused, ...k } = c;
    if (f === 'FrameDuel' || f === 'DuelConfigFrame') return { ...k, x: 0, y: 0, w: win.w, h: win.h };
    if (f === 'FrameMove') return { ...k, x: 0, y: 0, ...frame };
    if (f === 'ButtonDuel' || f === 'TextSwitch') { const { state, ...b } = k; return { ...b, disabled: state === 'disabled' }; }
    if (f === 'PictureSwitch') { const { state, art, ...b } = k; return { ...b, disabled: state === 'disabled', glow: glow(c) }; }
    if (f === 'ActiveListbox' && win.cls === 'CFindMenu') {
      const stripe = win.controls.find(s => s.parent === c.id && /BackStripe$/.test(s.cls));
      return { ...k, cls: 'CWindowTaskFindRows', rowAlpha: (stripe?.alpha ?? 0.7) * (c.alpha ?? 1), win: [win.x, win.y] };
    }
    return k;
  }) };
}

const A = (r, a) => `rgb(${r} / ${a})`;
// duel_btn_02_c01 row 1 (white) and row 48 (pink), every 16 texels: the alpha, and the pink's colour
const WHITE = [0.01, 0.11, 0.28, 0.48, 0.67, 0.85, 0.96, 1, 0.95, 0.82, 0.64, 0.44, 0.25, 0.09, 0];
const PINK = [['fe81c2', 0.01], ['fe7bbf', 0.21], ['fe6db8', 0.48], ['fe5aaf', 0.72], ['fe42a4', 0.89], ['fe2696', 0.98],
  ['fe0e8a', 1], ['fe0385', 1], ['fe108b', 1], ['fe2a97', 0.96], ['fe45a6', 0.87], ['fe5db1', 0.69], ['fe6fb9', 0.44],
  ['fe7cbf', 0.17], ['fe81c2', 0]];
const hexRgb = h => [0, 2, 4].map(i => parseInt(h.slice(i, i + 2), 16));
const stops = list => list.map((s, i) => `${s} ${(i * 100 / 14).toFixed(2)}%`).join(', ');
// the tint multiplies the texel (the sprite's col): white takes the tint, pink is pink times it
const whiteBar = () => `linear-gradient(to right, ${stops(WHITE.map(a => A('var(--tint)', a)))})`;
const pinkBar = () => `linear-gradient(to right, ${stops(PINK.map(([h, a]) => A(hexRgb(h).map((v, i) => `calc(${v} * var(--t${i}))`).join(' '), a)))})`;

// The duel frames' well (duel_win_01_c01 / duel_win_03_c01, window-local): its inside 13..w-14 x 33..h-44, a 7-pixel
// bevel round it (left #7f7f9e #5c5c84 x4 #3a4169 + one inner #445574 (03: #5a7193); top #a1a1b8 #5c5c84 x4 #273159
// #161d3a; right, inside out, #8b95a9 (03: #a6b5c8) #7f7f9e #5c5c84 x4 #3a4169; bottom, inside out, #bec9d7 #a1a1b8
// #5c5c84 x4 #273159). Inside, a gradient down its first 118 rows (sampled every 8, the stretched middle piece flat
// after) under a mesh: every 4th row (y % 4 = 0) and column (x % 4 = 3) a bluer line, its own gradient
const WELL01 = ['#4a4559', '#4e4a5e', '#534f63', '#585569', '#5e5d70', '#656477', '#6b6c7e', '#717485', '#787d8c', '#7f8494',
  '#858b9b', '#8a93a1', '#9099a7', '#949eac', '#98a3b0', '#9aa4b2'];
const WELL03 = ['#464259', '#49475d', '#4f4c63', '#545369', '#5a5a70', '#606177', '#676a7e', '#6d7286', '#757b8d', '#7b8294',
  '#828a9c', '#8791a2', '#8d98a9', '#919dad', '#95a2b2', '#97a4b4'];
const MESH = ['#383958', '#3d3e5d', '#414564', '#484d6a', '#4e5572', '#555d7a', '#5d6582', '#656f8a', '#6c7892', '#72809a',
  '#7988a2', '#7f90a9', '#8596af', '#899cb5', '#8da1b9', '#8ea1b9'];
const down = (list, last = 118) => `linear-gradient(to bottom, ${list.map((c, i) => `${c} ${Math.min(i * 8, last)}px`).join(', ')}, ${list.at(-1)} 100%)`;

const DS_CSS = () => `
.ds-txt { pointer-events: none; }
/* CWindowTaskFrameDuel (duel_win_01_c01) and CWindowTaskDuelConfigFrame (duel_win_03_c01): the body #9999a9, its edges
   (left #b4b5c1 x3 (lighter up top: #c8c9d2) #aaabb8; right #808394 #666b7e x3; bottom #707486 #485064 x3), the title
   bar rows 0..26 (01: skin.js's FrameDuel rows; 03: darker, #f3f3f5 #e6e6ea #cbcbd3 #aeaebb #a2a2b1 #9898a8 ... #4b4b67
   (20) #3a3c56 #1f2238 #212638, then #f3f3f5 #f2f2f4) */
.ds-frame { position: absolute; left: 0; top: 0; box-sizing: border-box; background: #9999a9;
  box-shadow: inset 0 -3px #485064, inset 0 -4px #707486, inset -3px 0 #666b7e, inset -4px 0 #808394, inset 4px 0 #aaabb8; }
.ds-frame::before { content: ''; position: absolute; left: 0; top: 27px; width: 3px; bottom: 4px;
  background: linear-gradient(to bottom, #c8c9d2, #b4b5c1 124px); }
.ds-frame::after { content: ''; position: absolute; left: 0; right: 0; top: 0; height: 26px;
  background: linear-gradient(to bottom, #f5f5f7 0.5px, #ebebee 1.5px, #d5d5dc 2.5px, #bebec8 3.5px, #b4b4c0 4.5px, #acacb9 5.5px,
    #a4a4b3 6.5px, #9d9dac 7.5px, #9696a6 8.5px, #8a8a9d 11.5px, #7f7f94 14.5px, #737389 18.5px, #6d6d84 20.5px, #5f6176 21.5px,
    #4a4c5e 22.5px, #4b4f5e 23.5px, #f3f3f5 24px 25px, #f2f2f4 25px 26px); }
.ds-frame.ds-cfg::after { background: linear-gradient(to bottom, #f3f3f5 0.5px, #e6e6ea 1.5px, #cbcbd3 2.5px, #aeaebb 3.5px,
    #a2a2b1 4.5px, #9898a8 5.5px, #8e8ea0 6.5px, #858598 7.5px, #7d7d91 8.5px, #737389 10.5px, #6a6a81 12.5px, #61617a 14.5px,
    #595973 16.5px, #52526d 18.5px, #4b4b67 20.5px, #3a3c56 21.5px, #1f2238 22.5px, #212638 23.5px, #f3f3f5 24px 25px, #f2f2f4 25px 26px); }
.ds-well { position: absolute; left: 13px; top: 33px; background: ${down(WELL01)}; }
.ds-cfg > .ds-well { background: ${down(WELL03)}; }
.ds-well::before { content: ''; position: absolute; inset: 0; background: ${down(MESH, 119)};
  -webkit-mask: repeating-linear-gradient(to bottom, transparent 0 3px, #000 3px 4px), repeating-linear-gradient(to right, transparent 0 2px, #000 2px 3px, transparent 3px 4px);
  mask: repeating-linear-gradient(to bottom, transparent 0 3px, #000 3px 4px), repeating-linear-gradient(to right, transparent 0 2px, #000 2px 3px, transparent 3px 4px); }
.ds-well::after { content: ''; position: absolute; inset: -7px;
  box-shadow: inset 0 1px #a1a1b8, inset 0 5px #5c5c84, inset 0 6px #273159, inset 0 7px #161d3a,
    inset 1px 0 #7f7f9e, inset 5px 0 #5c5c84, inset 6px 0 #3a4169, inset 7px 0 var(--in-l, #445574),
    inset 0 -1px #273159, inset 0 -5px #5c5c84, inset 0 -6px #a1a1b8, inset 0 -7px #bec9d7,
    inset -1px 0 #3a4169, inset -5px 0 #5c5c84, inset -6px 0 #7f7f9e, inset -7px 0 var(--in-r, #8b95a9); }
.ds-cfg > .ds-well { --in-l: #5a7193; --in-r: #a6b5c8; }
/* duel_win_03_c01's help box: 21..471 x 256..400, a #646464 line round a blue gradient (#244064 #2f4f77 #406897 #5080b5
   #5b8fc8 #6197d2, then #6299d5 > #7ab6f1 down to row 393, then #82bbf2 #8ec1f3 #9fcaf5 #b0d4f7 #bbdaf8), its left 5 px
   darker (#395d88 #426a98 #4f7db0 #5c8ec6 #6399d4); the scroll column 455..470: #204691 #3973c5 #458adf ... #5e9ae3 #71a6e7 */
.ds-help { position: absolute; left: 21px; top: 256px; width: 451px; height: 145px; box-sizing: border-box; border: 1px solid #646464;
  background: linear-gradient(to right, rgba(16, 32, 64, .45), rgba(16, 32, 64, .3) 1px, rgba(16, 32, 64, .18) 2px, rgba(16, 32, 64, .08) 3px, transparent 4px),
    linear-gradient(to bottom, #244064, #2f4f77 1px, #406897 2px, #5080b5 3px, #5b8fc8 4px, #6197d2 5px, #6299d5 6px, #7ab6f1 136px,
      #7cb7f1 137px, #82bbf2 138px, #8ec1f3 139px, #9fcaf5 140px, #b0d4f7 141px, #bbdaf8 142px); }
.ds-help::after { content: ''; position: absolute; left: 433px; top: 0; width: 16px; bottom: 0;
  background: linear-gradient(to right, #204691 0 1px, #3973c5 1px 2px, #458adf 2px 14px, #5e9ae3 14px 15px, #71a6e7 15px); }
/* the choice switch: a <button> the size of its picture (224 x 32) */
.ds-sw { position: absolute; margin: 0; padding: 0; border: 0; background: none; cursor: inherit; }
.ds-sw > i { position: absolute; left: 0; right: 0; top: 0; bottom: 0; opacity: var(--a, 1); }
.ds-sw[data-rest=white] > i, .ds-sw[data-down=white]:active:not(:disabled) > i { background: ${whiteBar()}; }
.ds-sw[data-rest=pink] > i, .ds-sw[data-down=pink]:active:not(:disabled) > i { top: 1px; bottom: 1px; background: ${pinkBar()}; }
.ds-sw[data-rest=up] > i, .ds-sw[data-rest=down] > i { background: no-repeat center / 24px 16px var(--arrow); }
/* CWindowTaskButtonDuel (duel_btn_01_c01, 8 x 8 pieces, columns 0 normal, 24 hover, 48 pressed): a 1-px border, 3 px
   corners; normal #323232 round #c9c9c9 (top #f5f5f7 #fff #fff #d5d5d5 #cacaca; left #fff #fff #e0e0e0; right #989898
   #b3b3b3 #c5c5c5; bottom #616161 #818181 #acacac #c4c4c4), hover #e36f08 round #faeaac (top #fff #fff #ffffe8 #fffdba;
   left #fff #fff #ffffbf; right #f4c778 #f7da94 #f9e7a8; bottom #e39d3d #f2b65f #f6d58d #f9e6a6), pressed #e36f08 round
   #ffff93, lit from below (top #f7c552 #fad968 #fdf284 #fffe91; left #fad866 #fded7f #fffc8f; right #fff #ffffdb
   #ffffa3; bottom #fef8f2 #fff #ffffe4 #ffffa9) */
.ds-btn { position: absolute; box-sizing: border-box; margin: 0; padding: 0; border: 1px solid #323232; border-radius: 3px;
  background: #c9c9c9; color: #000; cursor: inherit;
  box-shadow: inset 0 1px #f5f5f5, inset 0 3px #fff, inset 0 4px #d5d5d5, inset 0 5px #cacaca, inset 2px 0 #fff, inset 3px 0 #e0e0e0,
    inset -1px 0 #989898, inset -2px 0 #b3b3b3, inset -3px 0 #c5c5c5,
    inset 0 -1px #616161, inset 0 -2px #818181, inset 0 -3px #acacac, inset 0 -4px #c4c4c4; }
.ds-btn:hover:not(:disabled) { border-color: #e36f08; background: #faeaac;
  box-shadow: inset 0 2px #fff, inset 0 3px #ffffe8, inset 0 4px #fffdba, inset 2px 0 #fff, inset 3px 0 #ffffbf,
    inset -1px 0 #f4c778, inset -2px 0 #f7da94, inset -3px 0 #f9e7a8,
    inset 0 -1px #e39d3d, inset 0 -2px #f2b65f, inset 0 -3px #f6d58d, inset 0 -4px #f9e6a6; }
.ds-btn:active:not(:disabled) { border-color: #e36f08; background: #ffff93;
  box-shadow: inset 0 1px #f7c552, inset 0 2px #fad968, inset 0 3px #fdf284, inset 0 4px #fffe91, inset 1px 0 #fad866,
    inset 2px 0 #fded7f, inset 3px 0 #fffc8f, inset -1px 0 #fff, inset -2px 0 #ffffdb, inset -3px 0 #ffffa3,
    inset 0 -1px #fef8f2, inset 0 -2px #fff, inset 0 -3px #ffffe4, inset 0 -4px #ffffa9; }
.ds-btn:disabled > .txt { opacity: .5; }
.ds-btn > .txt { position: absolute; }
/* CWindowTaskFrameMove (move_win_01_c01, 24-pixel cells, BLEND_POINT): green round a light-blue field. The green: a
   19-row band on top (#dbfae2 #d1f9d8 #c5f7ca #b2f6b1 #a3f49b #a0f490 ... #83f723 #80f720 #7ff720), 6 px down the sides
   and along the bottom (#6ef521 mid-way, #3eee4e #36ed56 #33e14a #2fcd30 #2dbc19 #3abf26 at the foot; the right edge
   darker, #6cee1e #69e118 #66d512 #6fcf1e), a #7f877e line inside it. The field: rows #456f83 #5894b0 #74c0e3 #84d9fe,
   then #88daff down to #dff8ff (the stretched middle), #e2f9ff > #f4ffff > #f7ffff in the last cell, #eff6f6; its left
   4 px shaded (#6f9bad #80b7cf #94d4ef #9de1fe over #9ee2ff); a column at w-24..w-9: #7e8da7 then #b8c7d0 #d4e2e4 ...
   #d9e5e7 #dde8ea (#4c5f85 #9faebf #d1dfe2 its top rows) */
.ds-move { position: absolute; left: 0; top: 0; box-sizing: border-box;
  background: linear-gradient(to right, #99f862, #90f754 1px, #89f74a 2px, #7bf634 3px, transparent 4px, transparent calc(100% - 4px), rgba(0, 40, 0, .06) calc(100% - 3px), rgba(0, 40, 0, .12)),
    linear-gradient(to bottom, #dbfae2, #d1f9d8 1px, #c5f7ca 2px, #b2f6b1 3px, #a3f49b 4px, #9ef584 6px, #9af66d 8px, #95f656 10px,
      #8ff740 12px, #89f72f 14px, #83f723 16px, #7ff720 18px, #6ef521 50%, #3eee4e calc(100% - 12px), #36ed56 calc(100% - 6px),
      #33e14a calc(100% - 4px), #2fcd30 calc(100% - 3px), #2dbc19 calc(100% - 2px), #3abf26 calc(100% - 1px)); }
.ds-move::before { content: ''; position: absolute; left: 6px; right: 6px; top: 19px; bottom: 6px; border: 1px solid #7f877e;
  background: linear-gradient(to right, rgba(20, 50, 70, .38), rgba(20, 50, 70, .24) 1px, rgba(20, 50, 70, .1) 2px, rgba(20, 50, 70, .01) 3px, transparent 4px),
    linear-gradient(to bottom, #456f83, #5894b0 1px, #74c0e3 2px, #84d9fe 3px, #88daff 4px, #dff8ff calc(100% - 22px),
      #e2f9ff calc(100% - 21px), #f4ffff calc(100% - 13px), #f7ffff calc(100% - 2px), #eff6f6 calc(100% - 1px)); }
.ds-move::after { content: ''; position: absolute; right: 8px; width: 17px; top: 20px; bottom: 7px;
  background: linear-gradient(to bottom, #4c5f85 0 1px, #9faebf 1px 2px, transparent 2px),
    linear-gradient(to right, #7e8da7 0 1px, #b8c7d0 1px 2px, #d4e2e4 2px 15px, #d9e5e7 15px 16px, #dde8ea 16px); }
/* CWindowTaskFrameThin style 1 (window_base_01_c01's 8 x 8 corners, no middle; CFindMenu's at 0.9): top #a7ffff x3
   #79ffff #59c6ff x3 #fff; left #76ffff x3 #68e8ff #59c6ff x3 #fff; right #41abef x3 #4db9f7 #59c6ff x3 #fff; bottom
   #329be5 x3 #46b1f2 #59c6ff x3 #fff (outside in) */
.ds-thin { position: absolute; box-sizing: border-box;
  box-shadow: inset 0 3px #a7ffff, inset 0 4px #79ffff, inset 3px 0 #76ffff, inset 4px 0 #68e8ff,
    inset -3px 0 #41abef, inset -4px 0 #4db9f7, inset 0 -3px #329be5, inset 0 -4px #46b1f2,
    inset 0 7px #59c6ff, inset 7px 0 #59c6ff, inset -7px 0 #59c6ff, inset 0 -7px #59c6ff,
    inset 0 8px #fff, inset 8px 0 #fff, inset -8px 0 #fff, inset 0 -8px #fff; }
/* CFindMenu's rows (its ActiveListbox's BackStripe: window_base_01_c01 tiles, plain (8, 8) #fff, every other row from
   the first (56, 8) #eeeeed, the row under the mouse (72, 16) #0084ff; the stripe's 0.7 times the list's) */
.ds-rows { position: absolute; }
.ds-row { position: absolute; left: 0; display: block; width: 100%; height: 16px; margin: 0; padding: 0; border: 0;
  background: none; color: #000; text-align: left; cursor: inherit; }
.ds-row > b { position: absolute; inset: 0; background: #fff; opacity: var(--ra); }
.ds-row:nth-child(odd) > b { background: #eeeeed; }
.ds-row:hover > b, .ds-row:focus-visible > b { background: #0084ff; }
.ds-row > .txt { position: absolute; }
`;
function inject() {
  if (document.getElementById('htmlui-duelsetup')) return;
  const st = document.createElement('style');
  st.id = 'htmlui-duelsetup';
  st.textContent = DS_CSS();
  document.head.append(st);
}

const box = (cls, { x = 0, y = 0, w, h }, tag = 'div') => {
  const e = document.createElement(tag);
  e.className = cls;
  Object.assign(e.style, { left: x + 'px', top: y + 'px', width: w + 'px', height: h + 'px' });
  return e;
};
const shadowOf = (win, c) => win.controls.find(k => k.parent === c.id && k.shown && (k.x !== c.x || k.y !== c.y));

// the duel arrows as SVG: a #fb168d triangle in a white glow (duel_arrow_01_c01: the glow 0.75 at its edge, fading
// over 4 px)
const arrow = up => `url("data:image/svg+xml,${encodeURIComponent(`<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 16'><defs><filter id='g' x='-50%' y='-50%' width='200%' height='200%'><feGaussianBlur stdDeviation='1.2'/></filter></defs><g transform='${up ? '' : 'rotate(180 12 8)'}'><path d='M12 3.5 L20.5 12 L3.5 12 Z' fill='#fff' fill-opacity='.8' stroke='#fff' stroke-opacity='.8' stroke-width='2' stroke-linejoin='round' filter='url(#g)'/><path d='M12 4.6 L19 11.2 L5 11.2 Z' fill='#fb168d'/></g></svg>`)}")`;

const DRAW = {
  FrameDuel(el, c) {
    const f = box('ds-frame', c), well = box('ds-well', { x: 13, y: 33, w: c.w - 26, h: c.h - 76 });
    f.append(well);
    el.append(f);
  },
  DuelConfigFrame(el, c) {
    const f = box('ds-frame ds-cfg', c);
    f.append(box('ds-well', { x: 13, y: 33, w: c.w - 26, h: c.h - 76 }), box('ds-help', { x: 21, y: 256, w: 451, h: 145 }));
    el.append(f);
  },
  FrameMove: (el, c) => el.append(box('ds-move', c)),
  FrameThin(el, c) { const f = box('ds-thin', c); f.style.opacity = c.alpha ?? 1; el.append(f); },
  // a white caption over a black copy where the game shows its shadow (its child, off by a pixel or two)
  ShadowText(el, c, api, win) {
    const t = basic.textBox(el, basic.shownLines(c), { x: c.x, y: c.y, w: c.w, align: c.align, px: c.fontSize || 16, gap: c.lineGap,
      color: c.color, white: true });
    t.classList.add('ds-txt');
    const sh = shadowOf(win, c);
    if (sh) t.style.textShadow = `${sh.x - c.x}px ${sh.y - c.y}px 0 ${basic.textColor(sh.color, true)}`;
  },
  PictureSwitch(el, c, api) {
    const g = c.glow, b = box('ds-sw', c, 'button');
    b.type = 'button';
    b.append(document.createElement('i'));
    b.disabled = c.disabled;
    if (g.rest) b.dataset.rest = g.rest;
    if (g.down) b.dataset.down = g.down;
    b.setAttribute('aria-pressed', !!c.checked);
    b.setAttribute('aria-label', c.label || c.name || 'Choice');
    b.style.setProperty('--a', g.a);
    b.style.setProperty('--tint', g.rgb.join(' '));
    g.rgb.forEach((v, i) => b.style.setProperty('--t' + i, (v / 255).toFixed(3)));
    if (g.rest === 'up' || g.rest === 'down') b.style.setProperty('--arrow', arrow(g.rest === 'up'));
    b.addEventListener('pointerenter', () => api.hover(c.id));   // Duel Options writes the hovered choice's help
    b.addEventListener('click', () => api.click(c.id));
    el.append(b);
  },
  // the duel button, its caption in the game's colour (Move's places: white over a black shadow)
  ButtonDuel(el, c, api) {
    const b = box('ds-btn', c, 'button');
    b.type = 'button';
    b.disabled = c.disabled;
    if (c.label) {
      const t = basic.textBox(b, c.label, { x: -1, y: Math.floor((c.h - 16) / 2) - 1, w: c.w - 2, align: c.align ?? 1, color: c.color, white: true });
      if (c.shadow) t.style.textShadow = `${c.shadow.dx}px ${c.shadow.dy}px 0 ${basic.textColor(c.shadow.color, true)}`;
    }
    b.addEventListener('click', () => api.click(c.id));
    el.append(b);
  },
  IconHide(el, c, api) {
    const b = skin.icon(el, { x: c.x, y: c.y, kind: 'hide', label: 'Close', state: c.pressed ? 'pressed' : null });
    b.addEventListener('click', () => api.click(c.id));
  },
  // CFindMenu's list: a <button> per item; a click picks it in the game (its row clicked at the row's game point)
  FindRows(el, c, api) {
    const r = box('ds-rows', c);
    r.setAttribute('role', 'menu');
    (c.items || []).forEach((s, i) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'ds-row';
      b.setAttribute('role', 'menuitem');
      b.style.top = 16 * i + 'px';
      b.style.setProperty('--ra', c.rowAlpha);
      b.append(document.createElement('b'));
      basic.textBox(b, basic.untag(s), { w: c.w });
      b.addEventListener('click', () => api.click(c.id, rowPoint({ x: c.win[0], y: c.win[1] }, c, i)));
      r.append(b);
    });
    el.append(r);
  },
};
DRAW.TextSwitch = DRAW.ButtonDuel;

function draw(c, el, api, win) {
  const f = fam(c);
  if (/(^|[^i])Input(Duel)?$/.test(f)) return api.renderControl(c, el, { noText: true });   // the text is ownInput's
  return DRAW[f] ? DRAW[f](el, c, api, win) : api.renderControl(c, el);
}

const CLASSES = ['CWindowModelDuel', 'CWindowModelDuelFind', 'CWindowModelDuelWait', 'CWindowModelDuelConfig',
  'CWindowModelMove', 'CFindMenu'];
const base = ui ? owned(CLASSES, draw) : { classes: CLASSES };

// Keys on the window (the bridge stops them at its root): Esc is the way out (Cancel, the Move list's ×)
const leave = win => win.controls.find(c => c.shown && top(c) && (c.cls === 'CWindowTaskIconHide'
  || (/ButtonDuel$/.test(c.cls) && /^\s*(cancel|キャンセル|閉じる|close)\s*$/i.test(c.label || ''))));

export default {
  ...base,
  mount(win, root, api) {
    inject();
    const st = base.mount(prep(win), root, api);
    st.win = win;
    root.addEventListener('keydown', e => {
      if (e.key !== 'Escape' || e.target.closest?.('input, textarea')) return;
      const c = leave(st.win);
      if (c) { e.preventDefault(); api.click(c.id); }
    });
    // the Move list past six places: the wheel moves its scroll bar (hidden, CWindowModelMove::onInit: hide); the
    // window lays its items out again when told (onControlEvent from the bar)
    root.addEventListener('wheel', e => {
      const bar = st.win.cls === 'CWindowModelMove' && st.win.controls.find(c => /Scroll$/.test(c.cls) && top(c));
      if (!bar || !bar.max) return;
      e.preventDefault();
      const v = Math.max(0, Math.min(bar.max, (bar.value || 0) + Math.sign(e.deltaY)));
      if (v !== bar.value) api.setValue?.(bar.id, v);
    }, { passive: false });
    return st;
  },
  update(win, prev, root, api, st) {
    st.win = win;
    base.update(prep(win), prev, root, api, st);
  },
};
