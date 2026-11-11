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

// --- The lobby's three duel windows relaid out in their own skin (the owner: "the legacy UI but with better layout"):
// the engine's switches, captions, buttons and window size, moved onto an even grid and relabelled; ShadowTexts of our
// own (negative ids) add the row labels, the counts and one help line. Every switch and button is still the engine's
// (api.click aims at the control where the game has it, so where it's drawn here doesn't matter). Found by place, not
// text: a switch's caption is the ShadowText 8 below it; the green ShadowTexts are the menu's rows and counts and Create
// Duel's "Password" (hidden, as its field). Ranked is the Auto Duel queue only (server ranking.ts isRankedOrigin).
//   Duel menu (CWindowModelDuel, 492 x 216): Auto Duel | Create Duel, each count under its switch (the counts: right-
//     aligned, top to bottom Auto Duel = players searching, Create Duel = open rooms; the third, "Duel (n.)", has no
//     meaning the server's room list gives it, so it isn't shown)
//   Auto Duel (CWindowModelDuelFind, 492 x 216): rows Single / Match, Both, Level Limit ON / OFF
//   Create Duel (CWindowModelDuelWait, 492 x 360): rows Single / Match, Time Limit, Watch, Surrender (ON / OFF); its
//     password field not drawn (open duels: listed in the chat's Duels tab)
const LAYOUT = { CWindowModelDuel: 'menu', CWindowModelDuelFind: 'find', CWindowModelDuelWait: 'wait' };
const GREEN = [0.2, 1, 0.2, 1];
const isGreen = c => c.color && c.color[0] < 0.5 && c.color[1] > 0.9;
// a label as the game's: green over a black copy 2 px down-right (the menu's rows), white over one 1 px off (captions)
const label = (id, text, x, y, w, align = 0, color = GREEN) =>
  ({ id: -id, cls: 'CWindowTaskShadowText', parent: 0, x, y, w, h: 16, z: 4, shown: true, text, align, fontSize: 16, color,
    sh: color === GREEN ? 2 : 1 });
const HELP = { menu: 'Ranked duels change your rating. Created duels don\'t.', wait: 'Open duels show in the chat\'s Duels tab.\nCreated duels don\'t change your rating.' };
const TITLE_TEXT = { find: 'Auto Duel (Ranked)', wait: 'Create Duel (Unranked)' };

export function relayout(win) {
  const kind = LAYOUT[win.cls];
  if (!kind) return win;
  const tops = win.controls.filter(c => top(c) && c.shown !== false), texts = tops.filter(c => fam(c) === 'ShadowText');
  const sw = tops.filter(c => fam(c) === 'PictureSwitch');
  const rows = [...new Set(sw.map(s => s.y))].sort((a, b) => a - b).map(y => sw.filter(s => s.y === y).sort((a, b) => a.x - b.x));
  const to = new Map(), add = [];
  // a switch and its caption to (x, y), w wide, the caption's words
  const place = (s, x, y, w, words) => {
    if (!s) return;
    to.set(s.id, { x, y, w, label: words });
    const cap = texts.find(t => t.x === s.x && t.y === s.y + 8);
    if (cap) to.set(cap.id, { x, y: y + 8, w, text: words });
  };
  const title = texts.find(t => t.x === 0 && t.y === 4);
  if (title && TITLE_TEXT[kind]) to.set(title.id, { text: TITLE_TEXT[kind] });
  const green = texts.filter(isGreen);
  for (const t of green) to.set(t.id, { shown: false });
  const W = 466, L = 13;   // the well (FrameDuel: 13 .. w - 14)
  if (kind === 'menu') {
    const counts = green.filter(t => t.align === 2).sort((a, b) => a.y - b.y).map(t => parseInt(t.text, 10));
    const n = i => Number.isFinite(counts[i]) ? counts[i] : 0;
    place(rows[0]?.[0], 22, 53, 224, 'Auto Duel (Ranked)');
    place(rows[0]?.[1], 246, 53, 224, 'Create Duel (Unranked)');
    add.push(label(1, `Players searching: ${n(0)}`, 22, 97, 224, 1), label(2, `Open rooms: ${n(1)}`, 246, 97, 224, 1),
      label(3, HELP.menu, L, 137, W, 1, [1, 1, 1, 1]));
  } else if (kind === 'find') {
    add.push(label(1, 'Duel mode', 38, 44, 200), label(2, 'Level limit', 38, 108, 200));
    place(rows[0]?.[0], 21, 64, 150, 'Single');
    place(rows[0]?.[1], 171, 64, 150, 'Match (best of 3)');
    place(rows[1]?.[0], 321, 64, 150, 'Both');
    place(rows[2]?.[0], 21, 128, 225, 'On (similar level)');
    place(rows[2]?.[1], 246, 128, 225, 'Off');
  } else {
    // a label column, then the two choices, evenly down the well (33 .. 317: 20 px between rows), the help under
    // them. No password (open duels replace it: anyone joins from the chat's Duels tab or Discord): its field isn't
    // drawn (the game's stays empty), so the room is open
    const ROWS = [['Duel mode', 'Single', 'Match (best of 3)'], ['Time limit', 'On', 'Off'], ['Spectators', 'Allowed', 'Not allowed'],
      ['Surrender', 'Allowed', 'Not allowed']];
    ROWS.forEach(([name, a, b], i) => {
      const y = 53 + 52 * i;
      add.push(label(1 + i, name, 30, y + 8, 116));
      place(rows[i]?.[0], 150, y, 160, a);
      place(rows[i]?.[1], 310, y, 160, b);
    });
    const input = tops.find(c => fam(c) === 'InputDuel');
    if (input) to.set(input.id, { shown: false });
    add.push(label(6, HELP.wait, L, 262, W, 1, [1, 1, 1, 1]));
  }
  const byId = new Map(win.controls.map(c => [c.id, c]));
  const controls = win.controls.map(c => {
    if (to.has(c.id)) return { ...c, ...to.get(c.id) };
    // a part follows its parent (a caption's shadow: the same offset, width and words)
    const up = byId.get(c.parent), m = up && to.get(up.id);
    if (!m) return c;
    const k = { ...c, x: c.x + (m.x ?? up.x) - up.x, y: c.y + (m.y ?? up.y) - up.y };
    if (m.w != null && c.w === up.w) k.w = m.w;
    if (m.text != null && c.text === up.text) k.text = m.text;
    if (m.shown === false) k.shown = false;
    return k;
  });
  return { ...win, controls: [...controls, ...add] };
}

// What a control is drawn from, so that hover / press (the DOM's in owned mode) and the engine's own bookkeeping (world
// positions, the focus) don't redraw it: buttons keep only 'disabled' of the game's state; a switch its look (glow); the
// frames the window's size (FrameDuel reads 0 x 0, DuelConfigFrame its 80 x 24 piece, FrameMove its layout's);
// CFindMenu's list becomes rows of buttons (a class owned() doesn't take as a native list)
export function prep(win) {
  if (win.cls === plist.CLS) return plist.prepList(win);
  win = relayout(win);
  const frame = /Move$/.test(win.cls) ? moveFrame(win) : null;
  const out = { ...win, controls: win.controls.map(c => {
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
  return win.cls === 'CWindowModelDuel' ? tagRow(out) : out;
}

// The Duel menu's Tag Duel (CONTRACT.md: inside the Duel menu, beside Auto Duel and Create Duel; ../tag-lobby.js opens
// on yo2-tag-lobby-open). The game's menu has no third choice, so the page adds one: a row under the two choice
// switches, the same switch and caption centred in it; the frame grows by the row (TAG_ROW) and what sat below the
// switches (Cancel) moves down with it. Its controls are the page's own (ids 'tag-duel*'), never the game's
export const TAG_ROW = 40;
export const tagBox = win => ({ x: win.x, y: win.y, w: win.w, h: win.h + TAG_ROW });
function tagRow(win) {
  const cs = win.controls, choices = cs.filter(c => top(c) && c.shown && fam(c) === 'PictureSwitch');
  if (!choices.length) return win;
  const sw = choices[0], bottom = Math.max(...choices.map(c => c.y + c.h));
  const at = { x: Math.round((win.w - sw.w) / 2), y: bottom + TAG_ROW - sw.h };
  const cap = cs.find(c => top(c) && c.shown && fam(c) === 'ShadowText' && c.x >= sw.x - 2 && c.x < sw.x + sw.w && c.y >= sw.y && c.y < sw.y + sw.h);
  const move = c => ({ ...c, x: c.x - sw.x + at.x, y: c.y - sw.y + at.y });
  const tag = [{ ...move(sw), id: 'tag-duel', cls: 'CWindowTaskTagDuel', label: 'Tag Duel', checked: false, disabled: false,
    glow: { ...sw.glow, rest: 'white', down: 'pink' } }];
  if (cap) tag.push({ ...move(cap), id: 'tag-duel-text', text: 'Tag Duel' });
  // its texts (the shadow copy the caption draws under itself: shadowOf)
  if (cap) cs.filter(c => c.parent === cap.id).forEach((c, i) => tag.push({ ...move(c), id: 'tag-duel-text' + i, parent: 'tag-duel-text', text: 'Tag Duel' }));
  return { ...win, h: win.h + TAG_ROW, controls: [...cs.map(c => fam(c) === 'FrameDuel' ? { ...c, h: c.h + TAG_ROW }
    : top(c) && c.y >= bottom ? { ...c, y: c.y + TAG_ROW } : c), ...tag] };
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
  // the frame at its own alpha (0.9: the field lets what is under it show a little, as the engine draws it)
  FrameMove(el, c) { const f = box('ds-move', c); f.style.opacity = c.alpha ?? 1; el.append(f); },
  FrameThin(el, c) { const f = box('ds-thin', c); f.style.opacity = c.alpha ?? 1; el.append(f); },
  // a white caption over a black copy where the game shows its shadow (its child, off by a pixel or two)
  ShadowText(el, c, api, win) {
    const t = basic.textBox(el, basic.shownLines(c), { x: c.x, y: c.y, w: c.w, align: c.align, px: c.fontSize || 16, gap: c.lineGap,
      color: c.color, white: true });
    t.classList.add('ds-txt');
    if (c.sh) return void (t.style.textShadow = `${c.sh}px ${c.sh}px 0 #000`);   // relayout's own labels
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
  // the Duel menu's Tag Duel (tagRow): a choice switch that opens the page's tag lobby, not a game control
  TagDuel(el, c, api) {
    DRAW.PictureSwitch(el, c, { hover() {}, click() { globalThis.dispatchEvent(new CustomEvent('yo2-tag-lobby-open')); } });
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
  // the Duel menu drawn a row taller than its window (tagRow): the bridge's holes and pointer catcher follow the frame
  occlusionBox: win => win.cls === 'CWindowModelDuel' ? tagBox(win) : null,
  mount(win, root, api) {
    inject();
    const st = base.mount(prep(win), root, api);
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
    base.update(prep(win), prev, root, api, st);
    if (win.cls === plist.CLS) plist.rows(win, root, api, st);
  },
  unmount(root, st) {
    mounted.delete(st.id);
    if (st.pl) { plist.stars.clear(); plist.stopRows(st); }
    base.unmount?.(root, st);
  },
};
