// The lobby's own windows in HTML: the Main Menu (CMainMenu, src/Game/yo2MenuMain.cpp), the place banner
// (CWindowModelPlace, src/Game/yo2MenuPlace.cpp), the menu bar (CWindowModelMenu + CWindowTaskMenubar,
// src/Game/yo2MenuBar.cpp.wip, yo2WindowControls.cpp CWindowTaskMenubar::onInit) and the cards a click in the lobby
// opens (CPlayerListMenu, CNpcListMenu: src/Lobby/). The owner's skin rule (CONTRACT.md "Skin": sharp at 2x): the
// Main Menu is controls/skin.js's components (panel, titleBar with its close box, menuButton), as skin.html lays them
// out; the banner, the bar's strip, its picture buttons (./lobby_icons.js: the menuicon_02_c01 plates and pictograms
// as CSS + SVG) and the cards' frames are CSS here in their art's sampled colours (for skin.js once promoted). Text:
// Arial (textBox, spaced as the game), white captions outlined as skin.js's.
// Pass mode: the game takes the input; hover and pressed come from the snapshot.
import { textBox, shownLines, textWidth, spacing } from '../controls/basic.js';
import { menuButton, titleBar, panel } from '../controls/skin.js';
import { inviteDuel, cardName, nativeDuel } from '../invite.js';
import { rankByPid, peekRank, pidKey, rankTag, rankFit, labelWidth, cardHeader, PID_BASE } from '../rank.js';
import { KIND, PLATE, STRIP, plateBackground, glyph, traceAtlas, barReserve, onBarReserve } from './lobby_icons.js';
import * as ui from '../../ui.js';
import { pieceCss } from './trade.js';

// The strip's art has the field from x 391; when the page's own buttons push the field right (fieldLeft), the strip shows
// there: rows 7..24 then continue as rows 4..6 do past x 390 (the art's nearest band, within a few levels at x 386)
const after = (stops, x) => stops.split(', ').filter(t => parseFloat(t.split(' ')[1]) > x);
const BANDS = STRIP.map(([y, h, stops]) => y !== 7 ? [y, h, stops]
  : [y, h, [...stops.split(', ').filter(t => parseFloat(t.split(' ')[1]) <= 390.5), ...after(STRIP.find(b => b[0] === 4)[2], 390.5)].join(', ')]);
const CSS = `
.lb-place { position: absolute; box-sizing: border-box; height: 52px; border: 1px solid; border-radius: 6px;
  border-color: #cbb598 #894009 #893b06 #a57f4e; background: #f2e14f;
  box-shadow: inset 1px 1px 0 #f6eb89, inset 2px 2px 0 #f4e563, inset -1px -1px 0 #f1b323, inset -2px -2px 0 #f1c42f; }
.lb-place::before { content: ''; position: absolute; inset: 3px; border: 1px solid #625d36; border-radius: 2px;
  background: repeating-linear-gradient(to bottom, transparent 0 1px, rgba(255, 255, 255, .12) 1px 2px),
    linear-gradient(to right, #0985ff 0, #7deffc 219px, #7deffc 100%); }
.lb-shadow { color: #fff; text-shadow: 1px 0 #4a4a4a, -1px 0 #4a4a4a, 0 1px #4a4a4a, 0 -1px #4a4a4a; }   /* skin.js's outline */
.lb-bar { position: absolute; left: 0; top: 0; width: 1024px; height: 32px;
  /* each row's band runs on to the bottom, under the rows after it (listed first: on top). 1-px bands edge to edge
     left a seam at every row boundary at a fractional scale (the canvas showed through: dark lines, players'
     screenshot); the field's hole sits under its border */
  background: ${BANDS.toReversed().map(([y, , stops]) => `linear-gradient(to right, ${stops}) 0 ${y}px / 1024px ${32 - y}px no-repeat`).join(',\n    ')};
  -webkit-mask: linear-gradient(#000 0 0), linear-gradient(#000 0 0) 392px 8px / 624px 16px no-repeat;
  -webkit-mask-composite: xor; mask-composite: exclude; }
.lb-field { position: absolute; left: 391px; top: 7px; width: 626px; height: 18px; box-sizing: border-box;
  border: 1px solid #fff; background: rgba(255, 255, 255, .698); }
.lb-field[data-engine] { background: none; }   /* the engine's field under it: only the left edge is new */
.lb-icon { position: absolute; width: 80px; height: 32px; margin: 0; padding: 0; border: 0; background: none; }
.lb-icon > i { position: absolute; left: 8px; top: 4px; width: 72px; height: 24px; box-sizing: border-box; border: 1px solid;
  clip-path: polygon(3px 0, calc(100% - 3px) 0, 100% 3px, 100% calc(100% - 3px), calc(100% - 3px) 100%, 3px 100%, 0 calc(100% - 3px), 0 3px); }
.lb-icon > svg { position: absolute; left: 0; top: 0; overflow: visible; display: none; }
.lb-icon > b { position: absolute; left: 0; top: 0; width: 80px; height: 32px; display: none; background: no-repeat 0 0 / 240px 192px; }
${['normal', 'hover', 'pressed'].map(k => `.lb-icon[data-look=${k}] > i { border-color: ${PLATE[k].border}; background: ${plateBackground(PLATE[k])}; }
.lb-icon[data-look=${k}] > svg[data-look=${k}], .lb-icon[data-look=${k}] > b[data-look=${k}] { display: block; }`).join('\n')}
.lb-msg { position: absolute; left: 392px; top: 8px; width: 624px; height: 16px; overflow: hidden; }
.lb-card { position: absolute; left: 0; top: 0; }
.lb-thin { position: absolute; box-sizing: border-box; border: 3px solid; border-bottom-right-radius: 6px; }
.lb-thin > i { position: absolute; inset: 0; border: 1px solid; border-bottom-right-radius: 3px;
  box-shadow: inset 0 0 0 3px var(--body), inset 0 0 0 4px #fff; }
.lb-plane { position: absolute; }`;

function inject() {
  if (document.getElementById('htmlui-lobby')) return;
  const st = document.createElement('style');
  st.id = 'htmlui-lobby';
  st.textContent = CSS;
  document.head.append(st);
}

// a ShadowText: white, outlined as skin.js's captions
function shadowText(parent, c) {
  const d = textBox(parent, c.text, { x: c.x, y: c.y, w: c.w, align: c.align, px: c.fontSize || 16, white: true, color: [1, 1, 1, 1] });
  d.classList.add('lb-shadow');
  return d;
}
const top = c => !c.parent;
const look = c => c.state === 'disabled' ? 'disabled' : c.state === 'pressed' ? 'pressed' : c.state === 'hover' ? 'hover' : 'normal';

// The Main Menu's frame as drawn here: a row per shown ButtonMain, top to bottom as the engine places them (not the
// controls' order: live, Return to Title came first), plus Modern UI, so taller than the window, its
// bottom where the window's is (kept above the menu bar); y from the window's top. Also the module's
// occlusionBox: the bridge cuts its holes and places its pointer catcher where the frame is, not by the engine's rect
// (live, the frame's bottom 13 px over the chat were outside that rect: a press there went to the chat's DOM)
export function menuFrame(win) {
  const rows = win.controls.filter(c => c.cls === 'CWindowTaskButtonMain' && c.shown).sort((a, b) => a.y - b.y);
  const h = rows[0]?.h || 24, pitch = h + 4, height = 32 + (rows.length + 1) * pitch + 8;
  return { rows, h, pitch, height, y: Math.max(4, Math.min(736 - height, win.y + win.h - height)) - win.y };
}
export const menuBox = win => { const f = menuFrame(win); return { x: win.x, y: win.y + f.y, w: win.w, h: f.height }; };

// CMainMenu: the frame (FrameMain: skin.js panel with the bottom-thick band, menuFrame), the title bar with the
// × (ShadowText, IconHide), an entry per shown ButtonMain (skin.js menuButton). The buttons and the × take the pointer
// (data-modern-owned): an entry's button is not where the engine's is, so it clicks its control (api.click)
function mainMenu(win, root, st, api) {
  const title = win.controls.find(c => c.cls === 'CWindowTaskShadowText' && top(c))?.text ?? '';
  const close = win.controls.find(c => c.cls === 'CWindowTaskIconHide');
  const { rows, h, pitch, height, y } = menuFrame(win);
  const entries = rows.map(c => ({ label: c.label, c }));
  entries.push({ label: 'Modern UI', action: () => globalThis.yo2Html?.modern(true) });
  const key = JSON.stringify([win.w, y, height, title, entries.map(e => [e.label, e.c?.id])]);
  if (st.key !== key) {
    root.replaceChildren(); st.key = key;
    st.panel = panel(root, { y, w: win.w, h: height, band: 6 });
    st.title = titleBar(st.panel, { w: win.w, title, close: !!close });
    st.buttons = entries.map((e, i) => {
      const b = menuButton(st.panel, { x: rows[0]?.x ?? 12, y: 32 + i * pitch, w: rows[0]?.w ?? win.w - 24, h, label: e.label });
      b.style.pointerEvents = 'auto'; b.dataset.modernOwned = '';
      b.onclick = () => e.c ? api.click(e.c.id) : e.action();
      return b;
    });
    if (close) { st.title.close.style.pointerEvents = 'auto'; st.title.close.dataset.modernOwned = ''; st.title.close.onclick = () => api.click(close.id); }
  }
  if (close) st.title.close.dataset.state = close.pressed ? 'pressed' : 'normal';
  entries.forEach((e, i) => {
    st.buttons[i].set({ state: e.c ? look(e.c) : 'normal' });
    st.buttons[i].disabled = e.c ? e.c.state === 'disabled' : false;
  });
}

// CWindowModelPlace: the plate (FramePlace's size) and its four ShadowTexts
function place(win, root, st) {
  const f = win.controls.find(c => c.cls === 'CWindowTaskFramePlace');
  const texts = win.controls.filter(c => c.cls === 'CWindowTaskShadowText' && top(c) && c.shown);
  const key = JSON.stringify([f?.w, f?.h, f?.shown, texts.map(c => [c.text, c.x, c.y, c.w, c.align])]);
  if (st.key === key) return;
  st.key = key;
  root.replaceChildren();
  if (!f?.shown) return;
  const p = document.createElement('div');
  p.className = 'lb-place';
  Object.assign(p.style, { left: f.x + 'px', top: f.y + 'px', width: f.w + 'px' });
  root.append(p);
  for (const c of texts) shadowText(root, c);
}

// CWindowModelMenu: the strip and its message field (the Menubar), the picture buttons (CWindowTaskPictureSwitch, 80 x 32
// at slot x 80: ./lobby_icons.js, the kind from the atlas row its art reads, the look from the one of its sprites the
// engine shows: hover, pressed, or checked, whose art is pressed's), the help message (CWindowTaskMenubar::setMessage
// 0x005d4f80 / onMain 0x005d4970: its two texts are the Menubar's own, unlisted: `message` at x 392 + scroll, y 8, and
// a second copy at width + scroll + 704 once it is wider than 624; the strip covers them outside the field: clipped
// there), the window's own text at (392, 8). The notice icons (CNoticeIcon*: 32 x 32 SWF animations, from x 232 at
// y -16, CWindowModelMenu::placeNotices 0x00a7fbf0) are pictures the engine keeps drawing (passthrough).
const iconKind = c => KIND[c.art?.normal?.src?.[1]] || ({ MAIN: 'main', DUEL: 'duel', MOVE: 'move', CONFIG: 'config', RETURN: 'return' })[/MENUBAR_MENU_([A-Z]+)/.exec(c.name || '')?.[1]];
const iconLook = c => {
  const a = c.art || {};
  if (a.pressed?.shown || a.checked?.shown) return 'pressed';
  if (a.hover?.shown) return 'hover';
  if (a.normal?.shown) return 'normal';
  return c.state === 'pressed' ? 'pressed' : c.state === 'hover' ? 'hover' : 'normal';
};
const textW = s => textWidth(s) + spacing(s) * [...s].length;
// the glyphs traced from the atlas (lobby_icons.js traceAtlas), once it has loaded; until then the hand-drawn ones.
// The atlas comes from the art folder ui.js was given (as screens/trade.js's window_base); the bars wait in `bars`
let traced = null, tracing = false;
const bars = new Set();
function icons() {
  if (traced || tracing || typeof Image === 'undefined') return traced;
  tracing = true;
  const img = new Image();
  img.crossOrigin = 'anonymous';
  img.onload = () => {
    const c = new OffscreenCanvas(img.width, img.height).getContext('2d', { willReadFrequently: true });
    c.drawImage(img, 0, 0);
    traced = traceAtlas(c.getImageData(0, 0, img.width, img.height).data, img.width);
    for (const st of bars) for (const b of st.icons?.values() || []) paintIcon(b);
  };
  img.onerror = () => console.warn('htmlui lobby: no menu icon atlas');
  img.src = ui.SHEET.window.url.replace(/[^/]*$/, '') + 'menuicon_02_c01.png';
  return null;
}
// The pictograms redrawn at 4x (menuicon_hd.png: the atlas's layout, 960 x 768, the plates left out: they are the CSS
// above; Gemini image from the atlas's own cells, keyed and aligned to them: never in git, beside the atlas in the art
// folder): sharp at any scale, so they replace the traced ones once loaded; until then (or without it) the traced ones.
// The bridge waits for it (preload, below) before the first bar: the icons came up traced and changed under the player
let hd = null, hdLoading = null;
function hdSheet() {
  if (hd || hdLoading || typeof Image === 'undefined') return hd;
  const url = ui.SHEET.window.url.replace(/[^/]*$/, '') + 'menuicon_hd.png', img = new Image();
  hdLoading = new Promise(done => {
    img.onload = () => { hd = url; for (const st of bars) for (const b of st.icons?.values() || []) paintIcon(b); done(); };
    img.onerror = () => { console.warn('htmlui lobby: no HD menu icons'); done(); };
  });
  img.src = url;
  return null;
}
const ROW = Object.fromEntries(Object.entries(KIND).map(([v, k]) => [k, +v]));
function paintIcon(b) {
  const looks = ['normal', 'hover', 'pressed'], url = hdSheet();
  if (url) {
    b.innerHTML = '<i></i>' + looks.map((k, i) =>
      `<b data-look="${k}" style="background-image: url('${url}'); background-position: ${-80 * i}px ${-ROW[b.kind]}px"></b>`).join('');
    b.traced = true;
    return;
  }
  const t = icons(), svg = (k) => (t?.[b.kind]?.[k] || glyph(b.kind, k)).replace('<svg ', `<svg data-look="${k}" `);
  b.innerHTML = '<i></i>' + looks.map(svg).join('');
  b.traced = !!t;
}
// The notice icons draw over the strip (live: the friend notice's 32 x 32 plate and 48 x 48 glow at x 248, y 736, inside
// the bar, not above it), and the canvas lies under the DOM: the strip has a hole there (noticeHole) and the engine
// draws its own strip under the whole bar meanwhile (the Menubar's two sprites, passthrough), so the hole shows the
// engine's pixels, icon and strip, animation included. The engine's strip carries the field too: the DOM field steps
// aside while it shows (doubled, the field's white would be too bright). The hole fades in over 6 px each side (the CSS
// strip and the engine's differ by a few levels: no seam), from 16 px left of the icons (under the Move button's plate)
// to 8 px right of them.
export function noticeHole(win) {
  const rs = win.controls.filter(c => /^CNoticeIcon/.test(c.cls) && c.shown).flatMap(c => {
    const ss = (c.parts?.sprites || []).filter(s => s.shown && s.src);
    return ss.length ? ss.map(s => ({ x: (s.wx ?? win.x + c.x) - win.x, w: s.src[2] * (s.sx ?? 1) })) : [{ x: c.x, w: 48 }];
  });
  if (!rs.length) return null;
  const x0 = Math.max(0, Math.floor(Math.min(...rs.map(r => r.x)) - 16)), x1 = Math.min(1024, Math.ceil(Math.max(...rs.map(r => r.x + r.w)) + 8));
  return x1 > x0 ? { x: x0, w: x1 - x0 } : null;
}
// The message field's left edge: x 391 (the art's), or 8 px (a plate's gap) after the page's own buttons when they reach
// past it (lobby_icons.js reserveBar: the Wardrobe and Missions slots); the right edge stays at 1017
export const fieldLeft = (win, reserve = barReserve()) => Math.min(1016 - 64, Math.max(391, reserve ? reserve - (win?.x || 0) + 8 : 0));
const barMask = x => `linear-gradient(#000 0 0), linear-gradient(#000 0 0) ${x + 1}px 8px / ${1015 - x}px 16px no-repeat`;   // the hole sits under the field's border (1 px in)
onBarReserve(() => { for (const st of bars) if (st.win && st.root) menuBar(st.win, st.root, st); });
function menuBar(win, root, st) {
  bars.add(st);
  st.root = root;
  const hole = noticeHole(win), strip = win.controls.find(c => c.cls === 'CWindowTaskMenubar' && top(c));
  kept.set(win.id, new Set([...win.controls.filter(c => /^CNoticeIcon/.test(c.cls)).map(c => c.id),
    ...(hole ? (strip?.parts?.sprites || []).map(s => s.id) : [])]));
  if (!st.bar) {
    root.replaceChildren();
    st.bar = document.createElement('div');
    st.bar.className = 'lb-bar';
    st.clip = Object.assign(document.createElement('div'), { className: 'lb-msg' });
    st.field = Object.assign(document.createElement('div'), { className: 'lb-field' });
    root.append(st.bar, st.field, st.clip);   // not in the masked strip
    st.icons = new Map();
  }
  const left = fieldLeft(win), holeKey = (hole ? `${hole.x},${hole.w}` : '') + '@' + left;
  if (st.hole !== holeKey) {
    st.hole = holeKey;
    // one more layer xor'ed out of the strip: the hole (never over the field: the notices sit at x 232..)
    const m = barMask(left) + (hole ? `, linear-gradient(to right, transparent, #000 6px, #000 calc(100% - 6px), transparent) ${hole.x}px 0 / ${hole.w}px 32px no-repeat` : '');
    st.bar.style.webkitMask = st.bar.style.mask = m;
    // (the shorthands reset the composite: set it again)
    st.bar.style.webkitMaskComposite = 'xor';
    st.bar.style.maskComposite = 'exclude';
    // the engine's own field shows through the cut while it draws its strip (doubled, the white would be too bright):
    // the DOM field is then only its frame (its left edge where the engine's has none)
    st.field.toggleAttribute('data-engine', !!hole);
    Object.assign(st.field.style, { left: left + 'px', width: 1017 - left + 'px' });
    Object.assign(st.clip.style, { left: left + 1 + 'px', width: 1016 - left - 1 + 'px' });
    st.text = null;
  }
  const seen = new Set();
  for (const c of win.controls) {
    if (c.cls !== 'CWindowTaskPictureSwitch' || !c.shown) continue;
    const kind = iconKind(c);
    if (!kind) continue;
    seen.add(c.id);
    let b = st.icons.get(c.id);
    if (!b || b.kind !== kind) {
      b?.remove();
      b = Object.assign(document.createElement('button'), { type: 'button', className: 'btn lb-icon', tabIndex: -1, kind });
      b.setAttribute('aria-label', kind);
      paintIcon(b);
      root.append(b);
      st.icons.set(c.id, b);
    }
    Object.assign(b.style, { left: c.x + 'px', top: c.y + 'px' });
    b.dataset.look = iconLook(c);
    b.dataset.state = look(c);
  }
  for (const [id, b] of st.icons) if (!seen.has(id)) { b.remove(); st.icons.delete(id); }
  // the help message, scrolled as the engine scrolls it; the window's own text
  const bar = win.controls.find(c => c.cls === 'CWindowTaskMenubar' && top(c));
  const own = win.controls.find(c => c.cls === 'CWindowTaskText' && top(c));
  const m = bar?.shown ? bar.message || '' : '', o = own?.shown ? own.text || '' : '';
  const key = JSON.stringify([m, bar?.scroll || 0, o, own?.x, own?.y]), dx = 391 - left;   // the engine's places are from x 392
  if (st.text !== key) {
    st.text = key;
    st.clip.replaceChildren();
    if (m) {
      const w = textW(m), sc = bar.scroll || 0;
      textBox(st.clip, m, { x: sc + dx });
      if (w > 624) textBox(st.clip, m, { x: w + sc + 704 - 392 + dx });
    }
    if (o) textBox(st.clip, o, { x: own.x - 392 + dx, y: own.y - 8 });
  }
}

// The card's ranked standing (../rank.js, GET /api/de/rank?pid=: read/lobby.js reads the card's pid_), in the school's
// colour, under "LV01  Name" on the header's second line: centred there as the header is (showInfo: align 1 in 320 px),
// or after the team's name when the player has one (then the short form if that is what fits). An NPC's card (a pid
// under PID_BASE) and an unknown player show nothing.
function cardRank(win, root, st) {
  const pid = win.pid, head = cardHeader(win);
  if (!(pid >= PID_BASE) || !head) { st.rank?.remove(); st.rank = null; st.rankKey = null; return; }
  const r = peekRank(pidKey(pid));
  if (r === undefined) { rankByPid(pid).then(() => { if (st.win?.pid === pid) cardRank(st.win, root, st); }); return; }
  const key = JSON.stringify([pid, r, head, win.w]);
  if (st.rankKey === key) return;
  st.rankKey = key;
  st.rank?.remove(); st.rank = null;
  if (!r) return;
  const px = 16, y = head.y + 16 + head.lineGap;
  if (!head.team) { st.rank = rankTag(root, r, { x: head.x, y, w: head.w, align: head.align, px, text: rankFit(r, head.w, px) }); return; }
  // the team's line as the engine lays it out (centred, or from the left), the rank after it to the box's right end
  const tw = labelWidth(head.team, px), start = head.align === 1 ? head.x + (head.w - tw) / 2 : head.align === 2 ? head.x + head.w - tw : head.x;
  const after = start + tw + 6, s = rankFit(r, head.x + head.w - after - labelWidth('· ', px), px);
  if (s) st.rank = rankTag(root, r, { x: after, y, px, text: '· ' + s });
}

// A player's / an NPC's card (CPlayerListMenu, CNpcListMenu: src/Lobby/yo2PlayerListMenu.cpp, yo2NpcListMenu.cpp;
// onInit builds it, showInfo lays it out). Every piece is the snapshot's:
//  - the frame: CWindowTaskFrameThin (layout 0x005a29b0: eight 8 x 8 pieces of window_base_01_c0<style>, corners fixed,
//    edges stretched, NO centre: the card is see-through between its planes) at the card's 0.9 (kAlpha 0x00bee924).
//    Style 3 (the player's, yellow) / 2 (the NPC's, green), sampled from the atlas texels: 3 rows / columns of the
//    outer colour (light top and left, darker right and bottom), 1 of a middle one, 3 of the body colour, 1 of #fff;
//    the corners mitred, the bottom right one cut (5 transparent texels on the diagonal). CSS borders: their corners
//    mitre as the art's do; the body and the white line an inset shadow inside the 1-px middle border.
//  - the texts: CWindowTaskHelps (read/lobby.js: their size), each a text on its back plane (window_base_01_c01's
//    white middle texel tinted by windowHelpSetBackColor: the 『』 labels' and values' grey 0.8): the plane's colour and
//    alpha are its sprite's drawn ones (parts: col), the text Arial (textBox) in the Help's own text's place, width and
//    alignment (the name centred, labels left, values right), wrapped in its width. A tinted text draws in its colour
//    (the NPC name's setColor(1, 0, 0, 1): red in the live engine); the default white draws black.
//  - the buttons' back plane (the BackPlane "CPlayerListMenuの背景", from the room's conditions down: white) and the
//    buttons (TextSwitch, 288 x 24 at x 24: the generic renderer's CSS plate and black caption, api.syncWindow).
//  - the nation flag (CNationFlag "Duel国旗", a CTask child, not a control) and any other picture under the card: the
//    window's extras, which the engine keeps drawing (passthrough).
// The page adds one button, Duel (../invite.js), when the game offers no duel request of its own: a row of the card's
// own under its last button, drawn as the others are (duelRow), and a refusal's reason over the card's top right for a
// few seconds; and under the player's "LV01  Name" the player's rank (cardRank).
const kept = new Map();   // window id -> the ids the engine keeps drawing (with their subtrees)
// window_base_01_c0<style>: [outer top, left, right, bottom], [middle top, left, right, bottom], body
const THIN = {
  2: [['#80ffda', '#5aff99', '#31e75c', '#26d84d'], ['#5cff9d', '#50ff88', '#3bf368', '#35eb60'], '#44ff74'],
  3: [['#ffff80', '#ffff5a', '#f6e431', '#f2d426'], ['#ffff5c', '#ffff50', '#faf23b', '#f8ea35'], '#fdff44'],
};
const rgba = ([r, g, b, a]) => `rgba(${Math.round(r * 255)}, ${Math.round(g * 255)}, ${Math.round(b * 255)}, ${+(+a).toFixed(3)})`;
// a plane's drawn colour: its sprite's col (its colour x its parents', alpha included); without parts, the back
// colour showInfo / onInit set (grey 0.8 for the player's title and comment, the NPC's record; white otherwise) at
// the plane control's alpha (live, the player's card: its planes often come without parts)
export const planeColor = (p, name = '') => {
  const s = p?.parts?.sprites?.find(q => q.shown) || p?.parts?.sprites?.[0];
  if (s?.col) return rgba(s.col);
  const g = /称号|コメント|勝率/.test(name) && !/^CPlayerListMenuの(『勝率|勝率)/.test(name) || /CNpcList.*勝率/.test(name) ? 0.8 : 1;
  // the plane's own drawn alpha (its alpha times its parents': 0.63 / 0.81 / 0.9 live, the sprite's col alpha when
  // parts come); 0.63 when the snapshot has none
  return rgba([g, g, g, p?.alpha ?? 0.63]);
};
// what the card draws, from the snapshot (also its redraw key)
export function cardArt(win) {
  const cs = win.controls, under = id => cs.filter(c => c.parent === id);
  const frame = cs.find(c => c.cls === 'CWindowTaskFrameThin' && top(c));
  // the nation flag (an extra, at (8, 8) over the name's plane: src/Lobby/yo2PlayerListMenu.cpp, flag_->pos_ = {8, 8, 10})
  // is the engine's picture: the plane under it stays the engine's too (passthrough, `engine`), or the DOM plane would
  // veil the flag
  const flag = (win.extras || []).some(e => e.cls === 'CNationFlag');
  const helps = cs.filter(c => c.cls === 'CWindowTaskHelp' && top(c) && c.shown).map(hp => {
    const plane = under(hp.id).find(c => c.cls === 'CWindowTaskBackPlane'), t = under(hp.id).find(c => c.cls === 'CWindowTaskText');
    const w = hp.w || plane?.w || 0, h = hp.h || plane?.h || 16, engine = flag && hp.x <= 8 && hp.y <= 8 && hp.x + w >= 30 && hp.y + h >= 22;
    return { x: hp.x, y: hp.y, w, h, engine: engine ? plane?.id ?? null : null, back: engine || (plane && !plane.shown) ? null : planeColor(plane, hp.name),
      text: t?.shown ? shownLines(t) : '', tx: t?.x || 0, ty: t?.y || 0, tw: t?.w > 0 && t.w <= 1024 ? t.w : w,
      align: t?.align ?? 0, px: t?.fontSize || 16, gap: t?.lineGap || 0, color: t?.color, alpha: t?.alpha ?? 1 };
  });
  const planes = cs.filter(c => c.cls === 'CWindowTaskBackPlane' && top(c) && c.shown && c.w > 0 && c.h > 0)
    .map(p => ({ x: p.x, y: p.y, w: p.w, h: p.h, back: planeColor(p) }));
  // the frame's own pieces (window_base_01_c0<style>: corners, stretched edges), where the engine draws them
  const pieces = (frame?.parts?.sprites || []).filter(q => q.shown && q.tex)
    .map(q => ({ tex: q.tex, src: q.src, x: (q.wx ?? q.x) - win.x, y: (q.wy ?? q.y) - win.y, w: q.src[2] * (q.sx ?? 1), h: q.src[3] * (q.sy ?? 1), col: q.col || q.rgba, a: q.a ?? 1 }));
  return { frame: frame?.shown ? { x: frame.x, y: frame.y, w: frame.w, h: frame.h, style: frame.style, alpha: frame.alpha, pieces } : null, planes, helps };
}
// the engine's own line breaks: a line breaks before the character that would pass the width, by the game's glyph
// cells (ui.js measure: the same table spacing() uses); null while the glyph table isn't loaded (the browser wraps)
export function engineWrap(text, w, measure = ui.measure) {
  try {
    return text.split('\n').map(line => {
      const out = [];
      let cur = '', cw = 0;
      for (const ch of line) {
        const a = measure(ch);
        if (cur && cw + a > w) { out.push(cur); cur = ''; cw = 0; }
        cur += ch; cw += a;
      }
      out.push(cur);
      return out.join('\n');
    }).join('\n');
  } catch { return null; }
}
// a frame atlas's texels (window_base_01_c0N, from the art folder ui.js was given, as screens/trade.js reads them);
// null until loaded (then onReady once): the hand-sampled THIN borders stand in
const sheets = new Map();
function frameSheet(tex, onReady) {
  const name = tex.slice(tex.lastIndexOf('/') + 1).toLowerCase();
  let s = sheets.get(name);
  if (!s && typeof Image !== 'undefined') {
    s = { ready: false, wait: new Set() };
    sheets.set(name, s);
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      const c = new OffscreenCanvas(img.width, img.height).getContext('2d', { willReadFrequently: true });
      c.drawImage(img, 0, 0);
      Object.assign(s, { ready: true, w: img.width, h: img.height, px: c.getImageData(0, 0, img.width, img.height).data });
      const w = [...s.wait];
      s.wait.clear();
      w.forEach(f => f());
    };
    img.src = ui.SHEET.window.url.replace(/[^/]*$/, '') + name;
  }
  if (s && !s.ready) s.wait.add(onReady);
  return s?.ready ? s : null;
}
// THIN's [top, left, right, bottom] as CSS's border-color order (top right bottom left)
const trbl = ([t, l, r, b]) => `${t} ${r} ${b} ${l}`;
function card(win, root, st) {
  const duel = win.cls === 'CPlayerListMenu' && duelOffered(win), art = duel ? growArt(cardArt(win), win.h - 8, DUEL_ROW) : cardArt(win);
  const key = JSON.stringify(art);
  kept.set(win.id, new Set([...(win.extras || []).map(e => e.id), ...art.helps.map(h => h.engine).filter(Boolean)]));
  if (st.key !== key) {
    st.key = key;
    st.art ||= root.appendChild(Object.assign(document.createElement('div'), { className: 'lb-card' }));
    st.art.replaceChildren();
    const f = art.frame, sheet = f?.pieces.length && frameSheet(f.pieces[0].tex, st.redraw ||= () => { st.key = null; card(st.win, root, st); });
    if (sheet) {
      // each piece from its texels (screens/trade.js pieceCss: a stretched edge a gradient of hard stops, a corner an
      // SVG of its texel runs): the engine's own frame, sharp at any DPR
      for (const q of f.pieces) {
        const { bg, clip } = pieceCss(sheet, q.src, q.col || [1, 1, 1, 1]), d = document.createElement('div');
        Object.assign(d.style, { position: 'absolute', left: q.x + 'px', top: q.y + 'px', width: q.w + 'px', height: q.h + 'px', background: bg, clipPath: clip || '' });
        if (q.a !== 1) d.style.opacity = q.a;
        st.art.append(d);
      }
    } else if (f) {
      const [out, mid, body] = THIN[f.style] || THIN[3], d = document.createElement('div'), i = document.createElement('i');
      d.className = 'lb-thin';
      Object.assign(d.style, { left: f.x + 'px', top: f.y + 'px', width: f.w + 'px', height: f.h + 'px', opacity: f.alpha ?? 1, borderColor: trbl(out) });
      i.style.borderColor = trbl(mid);
      i.style.setProperty('--body', body);
      d.append(i);
      st.art.append(d);
    }
    for (const p of [...art.planes, ...art.helps]) {
      if (!p.back || !p.w || !p.h) continue;
      const d = document.createElement('div');
      d.className = 'lb-plane';
      Object.assign(d.style, { left: p.x + 'px', top: p.y + 'px', width: p.w + 'px', height: p.h + 'px', background: p.back });
      st.art.append(d);
    }
    for (const t of art.helps) {
      if (!t.text) continue;
      // a tinted text draws in its colour (live: the NPC name's setColor(1, 0, 0) is red), the default white draws black;
      // a Help's text wraps in its width at any character, as the engine breaks it (live: "Yugi Mu" / "to")
      const tint = t.color && t.color.slice(0, 3).some(v => v < 1), lines = engineWrap(t.text, t.tw);
      const d = textBox(st.art, lines ?? t.text, { x: t.x + t.tx, y: t.y + t.ty, w: t.tw, align: t.align, px: t.px, gap: t.gap, color: t.color, white: !!tint, wrap: lines == null });
      if (t.alpha < 1) d.style.opacity = t.alpha;
    }
  }
  // the buttons over the planes: the generic TextSwitch (its plate, its caption, the snapshot's state)
  st.btns ||= root.appendChild(Object.assign(document.createElement('div'), { className: 'lb-card' }));
  st.btnMap ||= new Map();
  st.api.syncWindow(st.btns, { ...win, controls: win.controls.filter(c => top(c) && /TextSwitch$/.test(c.cls)) }, st.btnMap);
  if (win.cls === 'CPlayerListMenu') { duelRow(win, root, st, duel); cardRank(win, root, st); }
}
// the page's Duel: a row of its own under the card's last button, as showInfo would add one (y += 36), so the
// engine's buttons stay where the engine hit-tests them; the frame's bottom and the buttons' back plane move down a row
const DUEL_ROW = 36;
const duelOffered = win => win.controls.some(c => c.shown && /TextSwitch$/.test(c.cls)) && !nativeDuel(win);
// art with everything from y `at` down moved dy lower, and what spans `at` (the frame, its side edges, the back plane)
// dy taller
export function growArt(art, at, dy) {
  const grow = r => r.y >= at ? { ...r, y: r.y + dy } : r.y + r.h >= at ? { ...r, h: r.h + dy } : r;
  const f = art.frame && { ...grow(art.frame), pieces: art.frame.pieces.map(grow) };
  return { ...art, frame: f, planes: art.planes.map(grow), helps: art.helps.map(grow) };
}
function duelRow(win, root, st, show) {
  if (!show) { st.btn?.remove(); st.btn = null; st.strip?.remove(); st.strip = null; return; }
  // the sibling buttons' place and size (showInfo: 288 x 24 at x 24, 36 apart), the last one's row + 36
  const sib = win.controls.filter(c => c.shown && top(c) && /TextSwitch$/.test(c.cls));
  const last = sib.reduce((a, c) => (c.y > a.y ? c : a), sib[0]), at = { x: last.x, y: last.y + DUEL_ROW, w: last.w, h: last.h };
  if (st.btn && st.btnAt !== JSON.stringify(at)) { st.btn.remove(); st.btn = null; st.strip?.remove(); st.strip = null; }
  if (st.btn) return;
  st.btnAt = JSON.stringify(at);
  // the added row is the page's alone (the engine's card ends above it, often on the chat's tabs): a press there stays
  // on the card, as one on the engine's card does
  st.strip = root.appendChild(Object.assign(document.createElement('div'), { className: 'lb-plane' }));
  Object.assign(st.strip.style, { left: '0px', top: win.h + 'px', width: win.w + 'px', height: DUEL_ROW + 'px', pointerEvents: 'auto' });
  // its caption the game's own Duel button's (hidden here: the player has no duel open), "Send Duel Request"
  const label = win.controls.find(c => /TextSwitch$/.test(c.cls) && /Duel\s*Request/i.test(c.label || ''))?.label || 'Duel';
  const name = cardName(win.controls.find(c => c.cls === 'CWindowTaskText' && c.shown && /^\s*LV\s*\d/i.test(c.text || ''))?.text);
  // the generic TextSwitch (its plate, its black caption) as the siblings draw, with its own hover / pressed looks
  // (the engine has no button there to report them)
  const b = st.btn = st.api.renderControl({ id: 'de-duel', cls: 'CWindowTaskTextSwitch', ...at, label, align: 1, shown: true, state: 'normal', alpha: 1 }, root);
  b.style.pointerEvents = 'auto';
  let over = false, down = false;
  const look = () => { b.dataset.look = b.disabled ? 0 : down && over ? 2 : over ? 1 : 0; };
  b.addEventListener('pointerenter', () => { over = true; look(); });
  b.addEventListener('pointerleave', () => { over = false; look(); });
  b.addEventListener('pointerdown', () => { down = true; look(); });
  b.addEventListener('pointerup', () => { down = false; look(); });
  b.onclick = async () => {
    if (st.busy) return;
    st.busy = true;
    b.disabled = true;
    try {
      const r = await inviteDuel(st.api, name);
      if (!r.ok) {
        st.msg?.remove();
        st.msg = textBox(root, r.message, { x: win.w - 268, y: -24, w: 260, align: 2, white: true, color: [1, 1, 1, 1] });
        st.msg.classList.add('lb-shadow');
        setTimeout(() => { st.msg?.remove(); st.msg = null; }, 4000);
      }
    } finally { st.busy = false; if (st.btn) st.btn.disabled = false; }
  };
}

const DRAW = { CMainMenu: mainMenu, CWindowModelPlace: place, CWindowModelMenu: menuBar, CPlayerListMenu: card, CNpcListMenu: card };
export default {
  classes: Object.keys(DRAW),
  mode: 'pass',
  clip: false,   // the banner's window is 0 x 0, the bar's 384 wide under a 1024-wide strip, a refusal's reason over the card
  parts: true,   // the cards' planes: their sprites' drawn colours
  preload: () => (hdSheet(), hdLoading || Promise.resolve()),
  mount: (win) => { inject(); return { id: win?.id }; },
  occlusionBox: win => win.cls === 'CMainMenu' ? menuBox(win) : null,
  // what the engine keeps drawing: the cards' extras (flag, pictures), the bar's notice icons, with their subtrees
  passthrough: (x, parent) => [...kept.values()].some(k => k.has(x.id) || (parent && k.has(parent.id))),
  update(win, prev, root, api, st) {
    st.win = win;
    st.api = api;
    DRAW[win.cls](win, root, st, api);
  },
  unmount(root, st) { kept.delete(st?.id); bars.delete(st); root.replaceChildren(); },
};
