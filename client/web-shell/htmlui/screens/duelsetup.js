// The duel set-up windows in HTML, owned by the DOM (chat.js's owned(), as social.js): the lobby's Duel menu
// (CWindowModelDuel) and the two it opens, Auto Duel (CWindowModelDuelFind) and Create Duel (CWindowModelDuelWait)
// (src/Lobby/yo2DuelMenu.h: not decompiled; their controls as the snapshot reports them), Duel Options
// (CWindowModelDuelConfig + CWindowTaskDuelConfigFrame, src/Game/yo2DuelWindows.cpp), the bar's door list
// (CWindowModelMove + CWindowTaskFrameMove, src/Game/yo2MenuMove.cpp, yo2MenuMain.cpp) and the player list's search
// menu (CFindMenu, src/Lobby/yo2FindMenu.cpp) and the player list it searches (CPlayerListDlg: ./playerlist.js).
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
import * as plist from './playerlist.js';
import { rankSelf } from '../rank.js';
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
  if (win.cls === plist.CLS) return plist.prepList(win);
  const frame = /Move$/.test(win.cls) ? moveFrame(win) : null;
  return { ...win, controls: win.controls.map(c => {
    const f = fam(c), { wx, wy, wz, focused, ...k } = c;
    if (f === 'FrameDuel' || f === 'DuelConfigFrame') return { ...k, x: 0, y: 0, w: win.w, h: win.h };
    if (f === 'FrameMove') return { ...k, x: 0, y: 0, ...frame };
    if (f === 'ButtonDuel' || f === 'TextSwitch') { const { state, ...b } = k; return { ...b, disabled: state === 'disabled' }; }
    if (f === 'PictureSwitch') { const { state, art, ...b } = k; return { ...b, disabled: state === 'disabled', glow: glow(c) }; }
    if (f === 'ActiveListbox' && win.cls === 'CFindMenu') {
      const stripe = win.controls.find(s => s.parent === c.id && /BackStripe$/.test(s.cls));
      // the rows' text as the list's own text child lays it out (the line-count text: centred in w - 16, the scroll
      // bar's column left out)
      const txt = win.controls.find(s => s.parent === c.id && /Text$/.test(s.cls) && (s.text || '').includes('\n'));
      return { ...k, cls: 'CWindowTaskFindRows', rowAlpha: (stripe?.alpha ?? 0.7) * (c.alpha ?? 1), win: [win.x, win.y],
        textW: txt?.w || c.w - 16, textAlign: txt?.align ?? 1 };
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

// The duel frames' title bar and edges, texel for texel (rows 0..25 of the atlas column; the 9-slice's top piece is
// drawn unstretched, so these sit at the same rows in every window): the outer three columns, the middle (column 4, as
// all of 4..w-5), the right four (w-4..w-1). duel_win_01_c01 (FrameDuel) and duel_win_03_c01 (DuelConfigFrame, darker)
const TITLE = {
  '01': { l: ['f8f8f9 eeeef1 dfe0e4 d3d3d9 ccccd4 c6c7d0 c1c1cc bcbcc7 b8b8c3 b5b5c0 b2b2be b0b0bc adadba ababb8 a8a8b6 a6a6b4 a3a3b2 a2a2b1 a0a0af 9e9eae 9c9cab 87879a 64657b 5e6073 f5f6f8 f4f6f7',
    'f8f9fa f1f2f4 e1e1e6 d0d0d8 c9c9d2 c3c3cd bebec8 b8b8c4 b4b4bf b0b0bc aeaeba ababb8 a8a9b6 a5a5b4 a3a4b2 a1a1b0 9f9fae 9d9dac 9a9baa 9999a9 9596a6 74748a 595b6f 474b5c f5f6f8 f4f6f7',
    'f7f7f9 eeeef1 dbdbe0 c6c6cf bebec8 b7b7c2 b0b0bc aaaab7 a4a4b2 a0a0af 9d9dac 9999aa 9696a6 9393a4 8f90a1 8d8d9f 8a8a9d 88889b 858598 838397 7f7f93 66667d 4f5164 4c505e f6f6f8 f5f6f7'],
  m: 'f5f5f7 ebebed d5d5dc bebec8 b4b4c0 acacb9 a4a4b3 9d9dac 9696a6 9191a2 8e8ea0 8a8a9d 878799 838396 7f7f94 7c7c90 79798e 76768c 737389 707087 6d6d84 5f6176 4a4c5e 4b4f5e f3f3f5 f2f2f4',
  r: ['f5f5f7 ebebee d5d5dc bebec8 acadba a4a5b3 9c9dac 9596a6 8e8fa0 898a9c 86879a 828396 7f8093 7b7b90 77788d 74758a 717288 6e6f86 6b6c83 686981 65667e 575a70 424558 424656 ccd0d7 cbcfd6',
    'f2f2f5 e5e5e9 ccccd4 a5a7b4 9598a7 8e91a1 878a9a 808395 7a7e90 76798c 737689 707287 6d7084 696c80 66687f 64667b 606379 5f6177 5b5e75 595b73 565971 4a4d64 363b4e 373d4e a2aab6 a1aab6',
    'e9e9ec d4d4da a1a4b1 7e8494 777d8e 727788 6c7284 676d7f 63687b 606578 5e6276 5b6074 595d71 565b6f 54586d 52566b 505468 4f5267 4c5065 4a4e64 494c62 3f4459 313749 303648 a2aab6 a1aab6',
    'dddde2 a4a8b4 757e8e 626b7d 5d6678 596173 555d70 525a6c 4f5769 4d5467 4b5265 495063 484e61 464c5f 444b5e 43485b 42475b 40465a 3f4457 3e4256 3c4155 373d50 313749 373d4e a2aab6 a1aab6'] },
  '03': { l: ['f6f6f7 eaeaed d8d8de c8c8d0 c0c0ca b9b9c4 b2b2bf acacb9 a7a7b4 a3a3b1 a0a0af 9d9dac 9a9aaa 9797a7 9494a5 9191a2 8e8ea0 8c8c9f 8a8a9c 88889b 858598 6b6b82 3f405c 383b52 f5f6f8 f4f6f7',
    'f7f7f9 eeeff1 dadae0 c5c5ce bcbcc7 b5b5c1 aeaebb a7a7b5 a2a2b0 9d9dac 9b9baa 9797a7 9494a5 9090a2 8e8ea0 8b8b9d 88889b 868699 838396 818195 7d7d91 53536e 32344d 1b2035 f5f6f8 f4f6f7',
    'f5f5f7 eaeaed d2d2d9 b8b8c3 aeaebb a5a5b3 9d9dac 9595a5 8e8e9f 89899b 858598 818195 7d7d91 79798e 75758b 727288 6e6e85 6c6c83 686880 66667e 61617a 42425e 25283f 212638 f6f6f8 f5f6f7'],
  m: 'f3f3f5 e6e6e9 cbcbd3 aeaebb a2a2b1 9898a8 8e8ea0 858598 7d7d91 77778c 737389 6e6e85 6a6a81 65657d 61617a 5d5d76 595973 565671 52526d 4f4f6b 4b4b67 3a3c56 1f2238 212638 f3f3f5 f2f2f4',
  r: ['f3f3f5 e6e6ea cbcbd3 aeaebb a2a2b1 9898a8 8e8ea0 858598 7d7d91 77778c 737389 6e6e85 6a6a81 65657d 61617a 5d5d76 595973 565671 52526d 4f4f6b 4b4b67 3a3c56 1f2238 1f2436 ccd0d7 cbcfd6',
    'efeff2 dedee3 c0c0ca 9b9dab 9092a2 87899a 7e8092 76788b 6f7185 6a6b80 66687d 62637a 5e6076 5a5b72 565770 53546c 4f5069 4d4e67 494a64 464762 43445f 34364f 1b1f34 1c2234 a2aab6 a1aab6',
    'e3e3e7 c9c9d1 9699a7 73798a 6a7082 64697b 5d6276 575c70 52566b 4e5267 4c4f65 484c62 46495f 42465c 3f435a 3d4057 3a3d54 393b53 363950 34374f 32344c 262a41 151a2e 14192c a2aab6 a1aab6',
    'd5d5db 9a9eab 687182 50596d 4a5367 454d61 40485d 3d4458 394054 363d52 343a50 32384d 30364b 2e3348 2c3247 2a2f44 292d43 272c42 252a3f 24283e 22263c 1c2136 151a2e 1c2234 a2aab6 a1aab6'] },
};
// a column of texels as hard 1-pixel stops (crisp at any DPR)
const texels = s => `linear-gradient(to bottom, ${s.split(' ').map((c, i) => `#${c} ${i}px ${i + 1}px`).join(', ')})`;
const titleBar = k => {
  const t = TITLE[k], layers = [...t.l.map((s, i) => `${texels(s)} ${i}px 0 / 1px 26px no-repeat`),
    ...t.r.map((s, i) => `${texels(s)} right ${3 - i}px top 0 / 1px 26px no-repeat`), texels(t.m)];
  return layers.join(',\n    ');
};
const DS_CSS = () => `
.ds-txt { pointer-events: none; }
/* CWindowTaskFrameDuel (duel_win_01_c01) and CWindowTaskDuelConfigFrame (duel_win_03_c01), the same edges in both: the
   title bar (TITLE above), then the body down the sides, a gradient from row 24 to row 144 in the top piece (texels:
   left 3 columns #f5f6f8 (24) #e1e1e6 (60) #c8c9d2 (100) #b4b5c1 (146); column 3 #f4f5f7 #dddee3 #c1c2cc #aaabb8; the
   body #f3f3f5 #d7d7dd #b5b5c1 #9999a9 (144); column w-4 #ccd0d7 #b4b8c2 #989ba9 #808394; the right 3 #a2aab6 #8f97a4
   #797f8f #666b7e), flat below; the bottom #707486 then #485064 x3, the lower left corner #a5a6b5 / #7f8294 */
.ds-frame { position: absolute; left: 0; top: 0; box-sizing: border-box;
  background: linear-gradient(to bottom, #f5f6f8 24px, #e1e1e6 60px, #c8c9d2 100px, #b4b5c1 146px, #b4b5c1 calc(100% - 2px), #a5a6b5 calc(100% - 2px) calc(100% - 1px), #7f8294 calc(100% - 1px)) 0 0 / 1px 100% no-repeat,
    linear-gradient(to bottom, #f5f6f8 24px, #e1e1e6 60px, #c8c9d2 100px, #b4b5c1 146px, #b4b5c1 calc(100% - 3px), #a5a6b5 calc(100% - 3px) calc(100% - 2px), #5b6175 calc(100% - 1px)) 1px 0 / 2px 100% no-repeat,
    linear-gradient(to bottom, #f4f5f7 24px, #dddee3 60px, #c1c2cc 100px, #aaabb8 146px) 3px 0 / 1px 100% no-repeat,
    linear-gradient(to bottom, #a2aab6 24px, #8f97a4 60px, #797f8f 100px, #666b7e 144px) right 0 top 0 / 3px 100% no-repeat,
    linear-gradient(to bottom, #ccd0d7 24px, #b4b8c2 60px, #989ba9 100px, #808394 144px) right 3px top 0 / 1px 100% no-repeat,
    linear-gradient(to bottom, #f3f3f5 24px, #d7d7dd 60px, #b5b5c1 100px, #9999a9 144px); }
.ds-frame::before { content: ''; position: absolute; left: 3px; right: 3px; bottom: 0; height: 4px;
  background: linear-gradient(to bottom, #707486 1px, #485064 1px); }
.ds-frame::after { content: ''; position: absolute; left: 0; right: 0; top: 0; height: 26px;
  background: ${titleBar('01')}; }
.ds-frame.ds-cfg::after { background: ${titleBar('03')}; }
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
/* CWindowTaskButtonDuel (duel_btn_01_c01, 8 x 8 pieces, columns 0 normal, 24 hover, 48 pressed; 24 rows, so only the
   middle column stretches), texel for texel inside a 1-px border with 3-px round corners: normal #323232 round #c9c9c9
   (top rows 1..3 #fff #fff #e6e6e6; left columns #fff #fff #e0e0e0; right, outside in, #989898 #b3b3b3 #c5c5c5;
   bottom, outside in, #6c6c6c #929292 #bababa); hover #e36f08 round #faeaac (top #fff #fff #ffffc4; left #fff #fff
   #ffffbf; right #f4c778 #f7da94 #f9e7a8; bottom #f0a84a #f4c271 #f8df9c); pressed #e36f08 round #ffff93, lit from
   below (top #f6b63f #fad461 #fef385; left #fad866 #fded7f #fffc8f; right #fff #ffffdb #ffffa3; bottom #fff #fffffd
   #ffffa8) */
/* CWindowTaskInputDuel (the Create Duel password; its art sampled from the engine's 2x render, not in an atlas we
   read): a 1-px #646464 line round a field lit from below, a shadow cast from the top (#3d4453 > #9b9dac in 6 px)
   and the left (7 px), then #a0a2b1 > #c5cddb down to a bright last rows (#e4e9f0, a #a6a8ab line), the right edge
   lighter (#c3c6d1, a #8a8b8e line) */
.ds-in { position: absolute; box-sizing: border-box; border: 1px solid #646464;
  background: linear-gradient(to left, #8a8b8e 0 1px, rgba(255, 255, 255, .2) 1px, rgba(255, 255, 255, 0) 8px),
    linear-gradient(to right, rgba(20, 22, 30, .46) 0, rgba(20, 22, 30, .27) 2.5px, rgba(20, 22, 30, .07) 4.5px, rgba(20, 22, 30, 0) 7px),
    linear-gradient(to bottom, #444954 0, #3d4453 1px, #4b5060 2px, #6d7080 3.5px, #8e91a0 4.5px, #9b9dac 5.5px, #a0a2b1 6.5px,
      #a5a7b6 8.5px, #aaadbd 11.5px, #b2b6c5 15px, #b9bfcd 18.5px, #c0c8d6 22px, #c7cfdd 25px, #d2dae5 27px, #e4e9f0 29px,
      #e4e9f0 29.5px, #a6a8ab 29.5px); }
.ds-btn { position: absolute; box-sizing: border-box; margin: 0; padding: 0; border: 1px solid #323232; border-radius: 3px;
  background: #c9c9c9; color: #000; cursor: inherit;
  box-shadow: inset 0 2px #fff, inset 0 3px #e6e6e6, inset 2px 0 #fff, inset 3px 0 #e0e0e0,
    inset -1px 0 #989898, inset -2px 0 #b3b3b3, inset -3px 0 #c5c5c5,
    inset 0 -1px #6c6c6c, inset 0 -2px #929292, inset 0 -3px #bababa; }
.ds-btn:hover:not(:disabled) { border-color: #e36f08; background: #faeaac;
  box-shadow: inset 0 2px #fff, inset 0 3px #ffffc4, inset 2px 0 #fff, inset 3px 0 #ffffbf,
    inset -1px 0 #f4c778, inset -2px 0 #f7da94, inset -3px 0 #f9e7a8,
    inset 0 -1px #f0a84a, inset 0 -2px #f4c271, inset 0 -3px #f8df9c; }
.ds-btn:active:not(:disabled) { border-color: #e36f08; background: #ffff93;
  box-shadow: inset 0 1px #f6b63f, inset 0 2px #fad461, inset 0 3px #fef385, inset 1px 0 #fad866, inset 2px 0 #fded7f,
    inset 3px 0 #fffc8f, inset -1px 0 #fff, inset -2px 0 #ffffdb, inset -3px 0 #ffffa3,
    inset 0 -1px #fff, inset 0 -2px #fffffd, inset 0 -3px #ffffa8; }
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
// The pages' CSS, every rule under .dm. The button system is shop/css.js's (mockup A: glossy pills with inward arrow caps,
// chamfered plates for choices), the glass and band the shop's; colours are tokens on .dm so a rule never repeats a hex
const FONT_STACK = `Arial, 'Liberation Sans', Arimo, Helvetica, sans-serif`;
const PANEL_CSS = () => `
.dm { position: absolute; left: 50%; top: 50%; box-sizing: border-box; display: flex; flex-direction: column; overflow: hidden;
  border-radius: 8px; background: rgba(236, 242, 245, .97); color: #000; font: 14.3px/20px ${FONT_STACK}; -webkit-font-smoothing: antialiased;
  box-shadow: 0 0 0 1px rgba(30, 48, 58, .8), 0 0 0 3px rgba(255, 255, 255, .5), 0 16px 40px rgba(0, 20, 35, .55); outline: none;
  --ring: #0b57d0; --sub: #3c4a52; text-align: center; cursor: inherit; }
.dm *, .dm *::before, .dm *::after { box-sizing: border-box; }
.dm :is(h2, p) { margin: 0; }
.dm-band { flex: none; height: 64px; display: flex; align-items: center; justify-content: space-between; gap: 16px; padding: 0 24px;
  background: linear-gradient(#6f8492, #566a77 55%, #4b5f6b); box-shadow: inset 0 1px 0 rgba(255, 255, 255, .35), 0 1px 0 rgba(20, 35, 45, .6); }
.dm-plate { height: 40px; padding: 0 24px; display: flex; align-items: center; font: bold 22px/1 ${FONT_STACK}; letter-spacing: .4px; color: #fff;
  background: linear-gradient(#b4f7ff, #3cc9f5 52%, #12a8e6); box-shadow: 0 0 0 2px #0c3a5e, inset 0 1px 0 rgba(255, 255, 255, .75), inset 0 -2px 0 rgba(0, 70, 120, .25);
  text-shadow: -1px -1px 0 #0c3a5e, 1px -1px 0 #0c3a5e, -1px 1px 0 #0c3a5e, 1px 1px 0 #0c3a5e, 0 2px 0 #0c3a5e; }
.dm-chip { height: 32px; padding: 0 16px; display: flex; align-items: center; font-size: 14px; color: #fff; border-radius: 16px;
  background: rgba(10, 24, 32, .38); box-shadow: inset 0 0 0 1px rgba(255, 255, 255, .28); }
.dm-body { flex: 1; min-height: 0; display: flex; flex-direction: column; gap: 16px; padding: 24px 24px 16px; }
.dm-body.cols { flex-direction: row; align-items: stretch; }
.dm-foot { flex: none; display: flex; flex-direction: column; align-items: center; gap: 16px; padding: 16px 24px 24px; }
.dm-p { font-size: 15px; line-height: 20px; color: #1a1a1a; }
.dm-p.lead { padding: 0 8px; }
.dm-h { font: bold 22px/24px ${FONT_STACK}; }
.dm-h2 { font: bold 16px/24px ${FONT_STACK}; }
.dm-cap { font-size: 13px; line-height: 16px; color: var(--sub); }
.dm-card { flex: 1; display: flex; flex-direction: column; align-items: stretch; gap: 16px; padding: 24px 16px 16px; border-radius: 6px;
  background: linear-gradient(rgba(255, 255, 255, .86), rgba(228, 240, 246, .8)); box-shadow: 0 0 0 1px rgba(80, 110, 125, .5), inset 0 1px 0 #fff; }
.dm-card.ranked { box-shadow: 0 0 0 2px #e08a00, inset 0 1px 0 #fff; }
.dm-card.custom { box-shadow: 0 0 0 2px #1f7fb8, inset 0 1px 0 #fff; }
.dm-card .dm-p { flex: 1; }
.dm-stats { display: grid; grid-auto-flow: row; gap: 0; min-height: 96px; align-content: start; border-radius: 3px; background: #f4f8fa;
  box-shadow: inset 0 1px 3px rgba(0, 35, 55, .35), 0 0 0 1px rgba(30, 48, 58, .4); }
.dm-stat { display: flex; flex-direction: column; justify-content: center; height: 48px; }
.dm-stat + .dm-stat { box-shadow: inset 0 1px 0 rgba(60, 80, 95, .28); }
.dm-stat[hidden] { display: none; }
.dm-stat .k { font-size: 12.5px; line-height: 14px; color: var(--sub); }
.dm-stat b { font-size: 15px; line-height: 20px; min-height: 20px; }
.dm-sec { display: flex; flex-direction: column; gap: 8px; }
.dm-grid { display: grid; gap: 16px; }
.dm-grid.c3 { grid-template-columns: repeat(3, 1fr); }
.dm-grid.c2 { grid-template-columns: repeat(2, 1fr); }
.dm-cell { display: flex; flex-direction: column; align-items: stretch; gap: 8px; }
.dm-cell .dm-cap { min-height: 32px; padding: 0 4px; }
.dm-how { display: flex; flex-direction: column; gap: 4px; padding: 12px 16px; font-size: 13px; line-height: 16px; border-radius: 3px; background: #f4f8fa;
  box-shadow: inset 0 1px 3px rgba(0, 35, 55, .3), 0 0 0 1px rgba(30, 48, 58, .4); }
.dm-how b { font-size: 14px; }
.dm-how span { color: var(--sub); }
.dm-row { display: grid; grid-template-columns: 208px 1fr 1fr; align-items: center; gap: 16px; min-height: 56px; }
.dm-row.pw { grid-template-columns: 208px 1fr; }
.dm-lab { display: flex; flex-direction: column; gap: 2px; text-align: left; }
.dm-lab b { font-size: 16px; line-height: 20px; }
.dm-field { position: relative; height: 40px; border-radius: 3px; background: linear-gradient(#e6eef2, #fff); box-shadow: inset 0 1px 3px rgba(0, 35, 55, .45), 0 0 0 1px rgba(30, 48, 58, .6); }
.dm-field:focus-within { box-shadow: inset 0 1px 3px rgba(0, 35, 55, .45), 0 0 0 2px var(--ring); }
.dm-in { position: absolute; inset: 0; width: 100%; height: 100%; margin: 0; padding: 0 12px; border: 0; background: none; outline: none;
  font: 16px/40px ${FONT_STACK}; color: #000; text-align: left; letter-spacing: 1px; }
/* the buttons: shop/css.js's A system under .dm */
.dm .bt { position: relative; box-sizing: border-box; margin: 0; -webkit-appearance: none; appearance: none; cursor: inherit; isolation: isolate;
  --h: 40px; --fs: 15px; --c: 6px; --capw: 9px; --caph: 17px; --capx: 10px;
  --t: #f2f4f5; --b: #b4b8bb; --g: #e4e7e9; --rim: #5a6a74; --fg: #1a1a1a; --tsh: 0 1px 0 rgba(255, 255, 255, .6);
  --cap: linear-gradient(#8a99a3, #5a6a74); --line: 30%;
  display: inline-flex; align-items: center; justify-content: center; gap: 8px; height: var(--h); padding: 0 calc(var(--h) / 2);
  font: bold var(--fs)/1 ${FONT_STACK}; color: var(--fg); text-shadow: var(--tsh); white-space: nowrap; border: 0; background: none;
  --glass: linear-gradient(rgba(255, 255, 255, .75), rgba(255, 255, 255, .2) calc(var(--line) - 2%), rgba(255, 255, 255, 0) var(--line)),
           linear-gradient(var(--t) 0, var(--t) var(--line), var(--b) var(--line), var(--b) calc(var(--line) + 36%), var(--g) 100%);
  --bevel: inset 0 1px 0 rgba(255, 255, 255, .95), inset 0 -3px 3px -1px rgba(255, 255, 255, .45); }
.dm .bt.h40 { --h: 40px; --fs: 15px; --capw: 8px; --caph: 15px; --capx: 10px; }
.dm .bt.h48 { --h: 48px; --fs: 17px; --capw: 10px; --caph: 19px; --capx: 12px; }
.dm .bt { flex: none; }
.dm .bt > * { flex: none; }
.dm .bt.primary, .dm .bt.secondary, .dm .bt.nav { border: 1px solid var(--rim); border-radius: calc(var(--h) / 2); background: var(--glass);
  box-shadow: var(--bevel), 0 0 0 1px rgba(255, 255, 255, .8), 0 2px 3px rgba(0, 30, 50, .35); padding: 0 calc(var(--h) / 2 + var(--capw) + 8px); }
.dm .bt.primary, .dm .bt.nav { align-self: stretch; }
.dm .bt.secondary { min-width: 160px; }
.dm .bt.primary::before, .dm .bt.secondary::before, .dm .bt.nav::before, .dm .bt.primary::after, .dm .bt.secondary::after, .dm .bt.nav::after {
  content: ''; position: absolute; top: 50%; width: var(--capw); height: var(--caph); margin-top: calc(var(--caph) / -2); background: var(--cap); }
.dm .bt.primary::before, .dm .bt.secondary::before, .dm .bt.nav::before { left: var(--capx); clip-path: polygon(0 0, 100% 50%, 0 100%); }
.dm .bt.primary::after, .dm .bt.secondary::after, .dm .bt.nav::after { right: var(--capx); clip-path: polygon(100% 0, 0 50%, 100% 100%); }
.dm .bt.seg { --oct: polygon(var(--c) 0, calc(100% - var(--c)) 0, 100% var(--c), 100% calc(100% - var(--c)), calc(100% - var(--c)) 100%, var(--c) 100%, 0 calc(100% - var(--c)), 0 var(--c));
  --h: 40px; padding: 0 12px; }
.dm .bt.seg::before, .dm .bt.seg::after { content: ''; position: absolute; z-index: -1; clip-path: var(--oct); }
.dm .bt.seg::before { inset: 0; background: linear-gradient(#b0c1c9, var(--rim)); }
.dm .bt.seg::after { inset: 1px; background: var(--glass); box-shadow: var(--bevel); }
.dm .bt.primary { --t: #ffc56e; --b: #ff9f00; --g: #ffe94d; --rim: #b35500; --fg: #3a1b00; --tsh: 0 1px 0 rgba(255, 240, 200, .5);
  --cap: linear-gradient(#ffff8a, #ffff00 45%, #ffd400); }
.dm .bt.nav { --t: #5cc6ec; --b: #116fa0; --g: #47c8f0; --rim: #0d4275; --fg: #fff; --tsh: 0 1px 0 rgba(0, 25, 50, .9), 0 0 2px rgba(0, 25, 50, .5);
  --cap: linear-gradient(#e2ffff, #bcffff 40%, #98e0ff); }
.dm .bt[aria-checked=true] { --t: #9ff8ff; --b: #52c6f7; --g: #a6f2ff; --rim: #0b6f9c; --fg: #06283a; --tsh: 0 1px 0 rgba(255, 255, 255, .45); }
.dm-foot .bt.primary { align-self: center; min-width: 320px; }
.dm .bt:hover:not(:disabled) { filter: brightness(1.08); }
.dm .bt:active:not(:disabled) { filter: brightness(.92); transform: translateY(1px); }
.dm .bt:focus-visible { outline: 2px solid var(--ring); outline-offset: 2px; }
.dm .bt:disabled { opacity: .45; filter: grayscale(.6); transform: none; }
.dm .bt .ck { position: relative; flex: none; width: 16px; height: 16px; border-radius: 50%; background: #fff; border: 1px solid #4e5e68; box-shadow: inset 0 1px 2px rgba(0, 0, 0, .25); }
.dm .bt[aria-checked=true] .ck::after { content: ''; position: absolute; left: 3px; top: 3px; width: 8px; height: 8px; border-radius: 50%; background: #06283a; }
`;
function inject() {
  if (document.getElementById('htmlui-duelsetup')) return;
  const st = document.createElement('style');
  st.id = 'htmlui-duelsetup';
  st.textContent = DS_CSS() + PANEL_CSS();
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

// --- The three duel set-up windows as plain pages (the owner: "Duel menu looks so confusing, make it more
// understandable"). The game's windows are small boxes of unexplained switches; here each is one centred page that
// says what it does, and every button still drives the same hidden engine control (api.click(id): the window's own
// switches, its OK and Cancel; the password's text is the engine input's, set through api.setText). Nothing here is a
// rule: ranked is the Auto Duel queue only (server ranking.ts isRankedOrigin); Create Duel rooms and direct invites never
// change the rating. Style: the shop's approved A skin (shop/css.js's button system, the light glass, the slate band,
// the outlined title plate), dark Arial text, an 8-px grid.
//   Duel menu (CWindowModelDuel): its Auto Duel switch (left) and Create Duel switch (right), the counts beside them
//     (text rows at y 36 / 60 / 84: Auto Duel = rooms of players searching, Create Duel = open rooms; the third,
//     "Duel (n.)", has no meaning the server's room list gives it, so it isn't shown), Cancel
//   Auto Duel (CWindowModelDuelFind): Single / Match, Both, Level Limit ON / OFF (lobby.ts autoTryMatch: ON = the pair
//     is within 5 LV when either asked, AUTODUEL_LV_DIFF), OK, Cancel
//   Create Duel (CWindowModelDuelWait): Single / Match, Time Limit, Watch, Surrender (each ON / OFF), the password
//     (maxLen 8), OK, Cancel
const PANEL = { CWindowModelDuel: 'menu', CWindowModelDuelFind: 'find', CWindowModelDuelWait: 'wait' };
export const isPanel = cls => cls in PANEL;
const CANCEL = /^\s*(cancel|キャンセル|閉じる|close)\s*$/i;

/** The controls a page drives, from a window's snapshot: the switches by row (top to bottom, each row left to right), the
 *  OK and Cancel buttons, the numbers of the count rows, the password input. */
export function panelModel(win) {
  const tops = win.controls.filter(c => top(c) && c.shown !== false);
  const sw = tops.filter(c => fam(c) === 'PictureSwitch').map(c => ({ id: c.id, x: c.x, y: c.y, checked: !!c.checked, disabled: c.state === 'disabled' }));
  const rows = [...new Set(sw.map(s => s.y))].sort((a, b) => a - b).map(y => sw.filter(s => s.y === y).sort((a, b) => a.x - b.x));
  const btns = tops.filter(c => fam(c) === 'ButtonDuel').sort((a, b) => a.x - b.x);
  const cancel = btns.find(c => CANCEL.test(c.label || '')) || btns.at(-1);
  const ok = btns.find(c => c !== cancel);
  const counts = tops.filter(c => fam(c) === 'ShadowText' && c.x === 0 && /^\s*\d+\s*$/.test(c.text || ''))
    .sort((a, b) => a.y - b.y).map(c => parseInt(c.text, 10));
  const input = tops.find(c => fam(c) === 'InputDuel');
  const btn = c => c && { id: c.id, disabled: c.state === 'disabled' };
  return { kind: PANEL[win.cls], rows, cancel: btn(cancel), ok: btn(ok), counts, input: input && { id: input.id, value: input.value || '', maxLen: input.maxLen || 8 } };
}

const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;
/** The queue's count in words: the Auto Duel row is the players searching for a ranked game now. */
export const searchingText = n => n == null ? '' : n === 0 ? 'No one yet' : plural(n, 'player searching', 'players searching');
/** The open rooms (the Create Duel row). */
export const roomsText = n => n == null ? '' : n === 0 ? 'None yet' : plural(n, 'open room', 'open rooms');
/** A player's standing (GET /api/de/rank, ../rank.js) as the Duel menu shows it: "Placement 2/5", "Ra Yellow II · 1612". */
export function rankLine(r) {
  if (!r?.known) return '';
  if (!r.placed) return r.placement ? `Placement ${r.placement.played}/${r.placement.of}` : 'Unranked';
  return r.rating == null ? r.label : `${r.label} · ${r.rating}`;
}
/** Which of the account's characters is the one in the lobby: the answer to ?self=1 lists them all (no marker of the
 *  active one), so only a lone character is certain. */
export const selfRank = list => { const known = (list || []).filter(r => r?.known); return known.length === 1 ? known[0] : null; };

// what each choice says, the engine's switches in the order panelModel lists them
const FIND = {
  title: 'Ranked Match',
  lead: 'We pair you with the player closest to your rating in this lobby. The result changes your rating and rank.',
  groups: [
    { name: 'Format', slots: [[0, 0, 'Single game', 'One game decides it.'], [0, 1, 'Best of 3', 'First to win two games.'], [1, 0, 'Either', 'Plays single or best of 3.']] },
    { name: 'Opponents', slots: [[2, 0, 'Similar level only', 'Only players within 5 levels of you.'], [2, 1, 'Anyone', 'Any level, unless they chose similar level.']] },
  ],
  how: ['How ranked works', 'Your first 5 games place you. Then you climb the Slifer, Ra and Obelisk ladder. Only this queue counts: Custom Duels never change your rating.'],
};
const WAIT = {
  title: 'Custom Duel (unranked)',
  lead: 'Open a room that other players can join. It never changes your rating.',
  rows: [
    ['Format', [[0, 0, 'Single game', 'One game decides it.'], [0, 1, 'Best of 3', 'First to win two games.']]],
    ['Time limit', [[1, 0, 'On', 'Turns are timed.'], [1, 1, 'Off', 'No time limit.']]],
    ['Spectators', [[2, 0, 'Allowed', 'Other players can watch.'], [2, 1, 'Not allowed', 'No one can watch.']]],
    ['Surrender', [[3, 0, 'Allowed', 'Either player can give up.'], [3, 1, 'Not allowed', 'Play every duel to the end.']]],
  ],
};

const el = (tag, cls = '', text) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
};
const button = (cls, label, onClick) => {
  const b = el('button', 'bt ' + cls);
  b.type = 'button';
  b.append(el('span', '', label));
  b.addEventListener('click', onClick);
  return b;
};
// a choice: a radio-looking <button> whose engine switch is st.m.rows[row][col] (read when pressed: the ids stay, the
// state moves)
function choice(st, row, col, label) {
  const b = button('seg', label, () => { const s = st.m.rows[row]?.[col]; if (s && !s.disabled) st.api.click(s.id); });
  b.setAttribute('role', 'radio');
  b.prepend(el('i', 'ck'));
  st.choices.push({ b, row, col });
  return b;
}
// the menu's two switches (the one row's left and right): Auto Duel, Create Duel
const pick = (st, col) => () => { const s = st.m.rows[0]?.[col]; if (s && !s.disabled) st.api.click(s.id); };
const press = (st, key) => () => { const c = st.m[key]; if (c && !c.disabled) st.api.click(c.id); };
const band = (title, chip) => {
  const b = el('div', 'dm-band');
  b.append(el('div', 'dm-plate', title));
  if (chip) b.append(el('div', 'dm-chip', chip));
  return b;
};
const foot = (st, main, label) => {
  const f = el('div', 'dm-foot');
  if (main) { st.main = button('primary h48', label, press(st, 'ok')); f.append(st.main); }
  f.append(button('secondary h40', 'Cancel', press(st, 'cancel')));
  return f;
};

const BUILD = {
  menu(st) {
    const stat = (k, v) => { const d = el('div', 'dm-stat'), b = el('b', '', v); d.append(el('span', 'k', k), b); return [d, b]; };
    const card = (cls, title, text, stats, action) => {
      const c = el('section', 'dm-card ' + cls);
      c.append(el('h2', 'dm-h', title), el('p', 'dm-p', text));
      const s = el('div', 'dm-stats');
      s.append(...stats);
      c.append(s, action);
      return c;
    };
    const [rankS, rank] = stat('Your rank', 'Changes with each game'), [queueS, queue] = stat('In the queue', '');
    const [ratingS] = stat('Your rating', 'Not affected'), [roomsS, rooms] = stat('Open rooms', '');
    st.rank = rank; st.rankS = rankS; st.queue = queue; st.rooms = rooms;
        const ranked = card('ranked', 'Ranked Match', 'Find an opponent automatically. Wins and losses change your rating.', [rankS, queueS],
      st.main = button('primary h48', 'Find Ranked Match', pick(st, 0)));
    const custom = card('custom', 'Custom Duel', 'Open a room for others to join, or invite a player. It doesn’t affect your rating.',
      [ratingS, roomsS], button('nav h48', 'Create a Room', pick(st, 1)));
    const body = el('div', 'dm-body cols');
    body.append(ranked, custom);
    return { w: 704, h: 488, kids: [band('Duel Menu'), body, foot(st)] };
  },
  find(st) {
    const body = el('div', 'dm-body');
    body.append(el('p', 'dm-p lead', FIND.lead));
    for (const g of FIND.groups) {
      const sec = el('section', 'dm-sec'), grid = el('div', 'dm-grid c' + g.slots.length);
      sec.append(el('h2', 'dm-h2', g.name));
      for (const [row, col, label, help] of g.slots) {
        const cell = el('div', 'dm-cell');
        cell.append(choice(st, row, col, label), el('div', 'dm-cap', help));
        grid.append(cell);
      }
      sec.append(grid);
      body.append(sec);
    }
    const how = el('div', 'dm-how');
    how.append(el('b', '', FIND.how[0]), el('span', '', FIND.how[1]));
    body.append(how);
    return { w: 640, h: 640, kids: [band(FIND.title, 'Counts toward your rating'), body, foot(st, true, 'Find Match')] };
  },
  wait(st) {
    const body = el('div', 'dm-body');
    body.append(el('p', 'dm-p lead', WAIT.lead));
    for (const [name, slots] of WAIT.rows) {
      const row = el('div', 'dm-row'), lab = el('div', 'dm-lab'), help = el('div', 'dm-cap');
      lab.append(el('b', '', name), help);
      row.append(lab);
      for (const [r, c, label] of slots) row.append(choice(st, r, c, label));
      st.helps.push({ help, slots });
      body.append(row);
    }
    const pw = el('div', 'dm-row pw'), lab = el('div', 'dm-lab');
    lab.append(el('b', '', 'Password (optional)'), el('div', 'dm-cap', 'Up to 8 characters. Only players who know it can join.'));
    st.field = el('div', 'dm-field');
    pw.append(lab, st.field);
    body.append(pw);
    return { w: 640, h: 636, kids: [band(WAIT.title), body, foot(st, true, 'Create Room')] };
  },
};

// the password: the engine's InputDuel as a real <input> over a drawn field (chat.js's ownInput, in a box of its own)
function passwordInput(st) {
  const i = el('input', 'dm-in');
  Object.assign(i, { type: 'text', spellcheck: false, autocomplete: 'off', maxLength: 8 });
  i.setAttribute('aria-label', 'Room password');
  st.field.append(i);
  let entered = null;
  const commit = () => st.m.input && st.api.setText(st.m.input.id, i.value);
  i.addEventListener('focus', () => { if (st.m.input) { i.value = st.m.input.value; st.api.click(st.m.input.id); } });
  i.addEventListener('input', e => { entered = null; if (!e.isComposing) commit(); });
  i.addEventListener('compositionend', commit);
  i.addEventListener('keydown', e => {
    if (e.isComposing) return;
    if (e.key === 'Enter') { e.preventDefault(); commit(); entered = i.value; st.api.char(13); }
    else if (e.key === 'Escape') i.blur();
  });
  i.sync = () => {
    const v = st.m.input?.value ?? '';
    i.disabled = !st.m.input;
    if (document.activeElement !== i || (entered !== null && v !== entered)) { i.value = v; entered = null; }
  };
  return i;
}

function mountPanel(win, root, api) {
  inject();
  const st = { panel: true, id: win.id, win, api, m: panelModel(win), choices: [], helps: [] };
  const { w, h, kids } = BUILD[st.m.kind](st);
  const page = el('div', 'dm');
  page.tabIndex = -1;
  page.setAttribute('role', 'dialog');
  page.setAttribute('aria-label', { menu: 'Duel Menu', find: FIND.title, wait: WAIT.title }[st.m.kind]);
  page.style.cssText = `width:${w}px;height:${h}px;margin:${-h / 2}px 0 0 ${-w / 2}px`;
  page.append(...kids);
  if (st.field) st.input = passwordInput(st);
  root.replaceChildren(page);
  st.page = page;
  if (st.m.kind === 'menu') {
    rankSelf().then(list => { st.self = selfRank(list); updatePanel(st); }, () => {});
  }
  updatePanel(st);
  // the page takes the focus on its primary button, so Enter does what it says and Esc (the root's) leaves
  queueMicrotask(() => { if (page.isConnected && !page.contains(document.activeElement)) (st.main || page).focus({ preventScroll: true }); });
  return st;
}

function updatePanel(st) {
  const m = st.m;
  for (const { b, row, col } of st.choices) {
    const s = m.rows[row]?.[col];
    b.setAttribute('aria-checked', !!s?.checked);
    b.disabled = !s || s.disabled;
  }
  for (const { help, slots } of st.helps) {
    const on = slots.find(([r, c]) => m.rows[r]?.[c]?.checked);
    help.textContent = on ? on[3] : slots.map(s => s[2]).join(' or ');
  }
  if (st.main && m.kind !== 'menu') st.main.disabled = !!m.ok?.disabled;
  if (m.kind === 'menu') {
    st.queue.textContent = searchingText(m.counts[0]);
    st.rooms.textContent = roomsText(m.counts[1]);
    const line = rankLine(st.self);
    st.rank.textContent = line || 'Changes with each game';
  }
  st.input?.sync();
}

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
  // the frame at its own alpha (0.9: the field lets what is under it show a little, as the engine draws it)
  FrameMove(el, c) { const f = box('ds-move', c); f.style.opacity = c.alpha ?? 1; el.append(f); },
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
      basic.textBox(b, basic.untag(s), { w: c.textW || c.w, align: c.textAlign ?? 0 });
      b.addEventListener('click', () => api.click(c.id, rowPoint({ x: c.win[0], y: c.win[1] }, c, i)));
      r.append(b);
    });
    el.append(r);
  },
};
DRAW.TextSwitch = DRAW.ButtonDuel;
Object.assign(DRAW, plist.DRAW);   // the player list's bar, frame, icons and search switch

function draw(c, el, api, win) {
  const f = fam(c);
  if (f === 'IconHide' && win.cls === plist.CLS) return plist.iconHide(el, c, api);   // its shorter icon (Move's ×)
  if (f === 'InputDuel') return el.append(box('ds-in', c));   // the text is ownInput's
  if (/(^|[^i])Input$/.test(f)) return api.renderControl(c, el, { noText: true });
  return DRAW[f] ? DRAW[f](el, c, api, win) : api.renderControl(c, el);
}

const CLASSES = ['CWindowModelDuel', 'CWindowModelDuelFind', 'CWindowModelDuelWait', 'CWindowModelDuelConfig',
  'CWindowModelMove', 'CFindMenu', plist.CLS];
const base = ui ? owned(CLASSES, draw) : { classes: CLASSES };

// Keys on the window (the bridge stops them at its root): Esc is the way out (Cancel, the Move list's ×)
const leave = win => win.cls !== plist.CLS && win.controls.find(c => c.shown && top(c) && (c.cls === 'CWindowTaskIconHide'
  || (/ButtonDuel$/.test(c.cls) && /^\s*(cancel|キャンセル|閉じる|close)\s*$/i.test(c.label || ''))));

// the search menu (CFindMenu) is a CTask child of the player list: while the list is HTML (its window in the hide table)
// and the menu is not, the engine keeps drawing the menu (passthrough: htmlui.c, the nearest listed ancestor decides)
const mounted = new Set();   // the CFindMenu windows this module draws now

export default {
  ...base,
  // the list's CDupSprite (data/guns_trial/guns_star16_01.png: a player's stars, a picture) stays the engine's too
  passthrough: x => (x.cls === 'CFindMenu' && !mounted.has(x.id)) || plist.stars.has(x.id),
  // the Move list's frame and × lie past its window's rect (CWindowModelMove is 296 wide, its frame the widest place +
  // 38: 327 with Clock Square's 289-wide button), as the engine draws them
  clip: false,
  mount(win, root, api) {
    inject();
    const st = isPanel(win.cls) ? mountPanel(win, root, api) : base.mount(prep(win), root, api);
    st.win = win;
    st.id = win.id;
    if (win.cls === 'CFindMenu') mounted.add(win.id);
    if (win.cls === plist.CLS) plist.rows(win, root, api, st);
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
    if (st.panel) { st.m = panelModel(win); return updatePanel(st); }
    base.update(prep(win), prev, root, api, st);
    if (win.cls === plist.CLS) plist.rows(win, root, api, st);
  },
  unmount(root, st) {
    mounted.delete(st.id);
    if (st.pl) plist.stars.clear();
    base.unmount?.(root, st);
  },
};
