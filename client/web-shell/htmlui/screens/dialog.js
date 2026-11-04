// The stock dialogs and small windows (src/System/window/yo2WindowDialogs.cpp and their exe-only kin), owned by the DOM
// as the chat is (screens/chat.js's owned(): each control redrawn when its snapshot changes, a real <input> per field
// committing through setText, Enter as the game's WM_CHAR '\r'):
//  - CWindowModelDialogYesNo / DialogOk / DialogError (and DialogWithBtns, their base; GoEvent : YesNo and
//    AboutEvent : Ok, src/Game's): a CWindowTaskFrameBottomThick round the window (band 32: setBandHeight), its
//    TextField 8 in above the band, the 80 x 24 TextSwitches centred in the band (YesNo: one per half; Ok: one).
//    Error: style 0 (the orange frame), centred, topmost, over a screen-sized BackPlane at alpha 0 (its shield).
//  - CWindowModelThin: a CWindowTaskFrameThin round a TextField 8 in (336 x 144 by default).
//  - CWindowModelList (CTgtAvaListDlg's "who is under the click") and CWindowModelInformation: an Iconbar, a ThinChop
//    under it, an ActiveListbox 8, 24 inside, the × (IconHide; Information also IconExpand) at w - 19.
//  - CWindowModelInput1 / Input2 (include/yo2/System/*.h: a FramePlane, Texts, Inputs and two TextSwitches).
//  - CWindowModelJoinGunsling (include/yo2/System/CWindowModelJoinGunsling.h: a FrameDuel, two ShadowTexts, two
//    ButtonDuels), as screens/social.js draws that family.
// The owner's Skin rule (CONTRACT.md: sharp at 2x): the frames are CSS (frame() below: the window_base_01_c0<style>
// bevel as mitred borders, every style's colours sampled from its atlas); the button plate is ui.js's CSS plate
// (plateLook) with the pointer's hover / pressed; the list, the chop, the icon bar and the × are controls/skin.js's (the
// chat's); text is Arial (textBox, spaced as the game). Nothing here stays engine-drawn (these windows hold no pictures).
// Input (owned): buttons are <button>s clicking the game's switch (Enter / Space on the focused one, which starts on
// the switch the game focuses: No, OK); the list's rows are <button>s clicking the game's row (its bar set first when
// the row is out of the game's view); inputs are owned()'s.
import { owned } from './chat.js';
const ui = await import('../../ui.js').catch(() => null);   // null under node (dialog_test.mjs needs no DOM)
const basic = ui && await import('../controls/basic.js');
const skin = ui && await import('../controls/skin.js');
const scroll = ui && await import('../controls/scroll.js');

// --- the frame (window_base_01_c0<style>.png, 96 x 24; CWindowTaskFrameThin::layout 0x005a29b0, FrameBottomThick 0x005a5b40,
// FramePlane): every style is the same bevel in its own colours. In the atlas, from the edge in: 3 texels (top T, right
// R, bottom B, left L, mitred at the corners), 1 (T2 R2 B2 L2), 3 of body, then (Thin, BottomThick) a 1-texel ring round
// the text field's place, transparent inside it (the TextField's back plane fills it). BottomThick's ring is band + 8
// above the bottom (the (56, 16) / (72, 8) / (80, 8) pieces), body below it; FramePlane (tile (24, 0)) has no ring. The
// whole frame at 70 % (onInit setAlpha(0.7); styles 5 and 6 opaque).
// Sampled texel for texel from each atlas: [T, R, B, L, T2, R2, B2, L2, body, ring]
export const FRAME = [
  ['#ffff80', '#ef9432', '#e57a26', '#fffc5a', '#ffff5c', '#f7aa3b', '#f29d35', '#ffdf50', '#ffbf44', '#ffffff'],   // c00 orange (DialogError)
  ['#a7ffff', '#41abef', '#329be5', '#76ffff', '#79ffff', '#4db9f7', '#46b1f2', '#68e8ff', '#59c6ff', '#ffffff'],   // c01 blue (the dialogs)
  ['#80ffda', '#31e75c', '#26d84d', '#5aff99', '#5cff9d', '#3bf368', '#35eb60', '#50ff88', '#44ff74', '#ffffff'],   // c02 green
  ['#ffff80', '#f6e431', '#f2d426', '#ffff5a', '#ffff5c', '#faf23b', '#f8ea35', '#ffff50', '#fdff44', '#ffffff'],   // c03 yellow
  ['#ffaeff', '#e94381', '#dd3475', '#ff7bc6', '#ff7ecb', '#f4518c', '#ee4986', '#ff6daf', '#fe5d96', '#ffffff'],   // c04 pink
  ['#ffffff', '#98a7c5', '#7583b1', '#ffffff', '#ffffff', '#b6c5d6', '#a4b3cc', '#f6ffff', '#d2e2e6', '#ffffff'],   // c05 silver (opaque)
  ['#ffffa5', '#efb740', '#eca531', '#ffff74', '#ffff8b', '#f1c64c', '#f0bd45', '#fff867', '#f3d458', '#ffffff'],   // c06 gold (opaque)
  ['#ffffff', '#b2b2b1', '#a2a2a1', '#ffffff', '#ffffff', '#bfbfbe', '#b7b7b6', '#e9e9e8', '#cccccb', '#f5f6ed'],   // c07 grey
  ['#d8d8ff', '#7e7f95', '#72738a', '#b0b0cb', '#b3b3ce', '#88899e', '#828298', '#a3a3ba', '#9292a6', '#f5f6ed'],   // c08 slate
];
const A70 = 178 / 255;   // the frames' and back planes' 0.7, as the vertex alpha the engine draws (ui.js WINDOW_ALPHA)
export const frameAlpha = style => style === 5 || style === 6 ? 1 : A70;
// the mean of two colours: the engine reads every pixel half a texel up-left (D3D8 pixel centres, bilinear; ui.js
// sprite()), so pixel x shows the mean of texels x - 1 and x, and a step between two texels is drawn as a pixel of
// their mean (skin.js's "stops at texel + 1 px")
export const mix = (a, b) => '#' + [1, 3, 5].map(i => Math.round((parseInt(a.slice(i, i + 2), 16) + parseInt(b.slice(i, i + 2), 16)) / 2)
  .toString(16).padStart(2, '0')).join('');
// The CSS variables one style's frame takes, as the engine shows it (its 1x render, ui.js's model of its sampling): from
// the top and left edges 3 px T / L, m(T, T2), m(T2, body), 2 of body, the ring m(body, ring); from the right and bottom
// edges 2 px R / B, m(R, R2), m(R2, body), 2 of body (+ the band), the ring m(ring, body) with a pixel of ring inside it
// (the 1-texel steps there land a pixel further in). Each step a hard 1-px edge: sharp at any DPR. band: BottomThick's
// band (0: Thin)
export function frameVars(style = 1, band = 0) {
  const [t, r, b, l, t2, r2, b2, l2, body, ring] = FRAME[style] || FRAME[1];
  return { '--t': t, '--r': r, '--b': b, '--l': l, '--t1': mix(t, t2), '--r1': mix(r, r2), '--b1': mix(b, b2), '--l1': mix(l, l2),
    '--t2': mix(t2, body), '--r2': mix(r2, body), '--b2': mix(b2, body), '--l2': mix(l2, body), '--body': body,
    '--ring': ring, '--ringm': mix(body, ring), '--band': Math.max(0, band | 0) + 'px' };
}

// --- the switch's look (basic.js switchColumn: CWindowTaskSwitch::onMain / setLook 0x005b8600 / 0x005b8940): the
// pointer's hover and press are the DOM's here (owned: the game's mouse only moves when a click is sent, so its hover is
// not the player's; its pressed and disabled are still shown). The focused switch at rest shows hover, as the game's: the
// DOM's focus once the player has put it in the window, the game's before (No / OK, set by the dialog's setup).
export function lookOf(c, { over = false, down = false, focus = null } = {}) {
  const state = c.state === 'disabled' ? 'disabled' : down && over ? 'pressed' : over ? 'hover' : c.state === 'pressed' ? 'pressed' : 'normal';
  const focused = focus ?? !!c.focused;
  const look = state === 'pressed' ? 2 : state === 'hover' ? (c.checked ? 5 : 1)
    : state === 'normal' && focused ? 1 : c.checked ? 4 : 0;
  return look < 3 ? look : look - 1;
}

// --- the list (CWindowTaskActiveListbox::onMain 0x005b5660: the 16-pixel row under the mouse is selected, a press
// there remembers it as clicked_, which the owner polls): the game point of item i's row, the game's top item being top
// (as svelte/modern/logic.js rowPoint)
export const rowPoint = (win, list, i, top = list.top || 0) =>
  [win.x + list.x + Math.min(40, list.w / 2), win.y + list.y + 16 * (i - top) + 8];
// the game's top item that shows item i (it, unless it is already in view), with rows in view and n items
export const topFor = (i, top, rows, n) => i >= top && i < top + rows ? top : Math.max(0, Math.min(i, n - rows));

// What owned() sees of the window: the fields that only change a control's look or contents (a switch's state and
// focus, an icon's press, a list's items and selection) left out, so a hover doesn't rebuild the control under the
// pointer (and drop its :hover, its focus); sync() below applies them every frame. A list is renamed past owned()'s
// own list (ownList: rows that can't be clicked).
const VOLATILE = { Switch: ['state', 'focused'], Icon: ['pressed'], Listbox: ['items', 'selected', 'marks', 'top', 'topLine', 'rows'] };
const famOf = cls => /Switch$|ButtonDuel$/.test(cls) ? 'Switch' : /Icon(Hide|Expand)$/.test(cls) ? 'Icon' : /Listbox$/.test(cls) ? 'Listbox' : null;
export function view(win) {
  return { ...win, controls: win.controls.map(c => {
    const f = famOf(c.cls);
    if (!f) return c;
    const v = { ...c };
    for (const k of VOLATILE[f]) delete v[k];
    if (f === 'Listbox') { v.orig = c.cls; v.cls = c.cls + '#dialog'; }
    return v;
  }) };
}

const CSS = () => `
.dlg-frame { position: absolute; box-sizing: border-box; border-style: solid; border-width: 3px 2px 2px 3px;
  border-color: var(--t) var(--r) var(--b) var(--l);
  clip-path: polygon(0 0, 100% 0, 100% calc(100% - 4px), calc(100% - 4px) 100%, 0 100%); }
.dlg-frame::before { content: ''; position: absolute; inset: 0; border: 1px solid; border-color: var(--t1) var(--r1) var(--b1) var(--l1); }
.dlg-frame::after { content: ''; position: absolute; inset: 1px; border: 1px solid; border-color: var(--t2) var(--r2) var(--b2) var(--l2);
  box-shadow: inset 0 0 0 2px var(--body), inset 0 calc(-2px - var(--band)) 0 0 var(--body); }
.dlg-frame > i { position: absolute; left: 4px; top: 4px; right: 4px; bottom: calc(4px + var(--band)); border: 1px solid var(--ringm);
  box-shadow: inset -1px -1px 0 0 var(--ring); }
.dlg-frame.dlg-plane::after { background: var(--body); }
.dlg-back { position: absolute; background: rgba(255, 255, 255, ${A70.toFixed(3)}); }
.dlg-field { position: absolute; box-sizing: border-box; background: #f0f0ef; border-top: 1px solid #6ca6e1; border-left: 1px solid #7f87c4; }
.dlg-shield { position: absolute; pointer-events: auto; }
.dlg-list { background: repeating-linear-gradient(to bottom, rgba(238, 238, 237, ${A70.toFixed(3)}) 0 16px,
  rgba(255, 255, 255, ${A70.toFixed(3)}) 16px 32px) local; }
.dlg-list .dlg-row { display: block; box-sizing: border-box; width: 100%; margin: 0; padding: 0; border: 0; background: none;
  font: ${basic.fontCss()}; color: #000; text-align: left; white-space: pre; overflow: hidden; cursor: inherit; }
.dlg-list .dlg-row:hover, .dlg-list .dlg-row:focus-visible { background: rgba(0, 132, 255, ${A70.toFixed(3)}); outline: none; }
`;

// A frame: Thin (band 0), BottomThick (band), or a FramePlane (plane: true)
export function frame(parent, { x = 0, y = 0, w, h, style = 1, band = 0, plane = false } = {}) {
  const f = document.createElement('div');
  f.className = plane ? 'dlg-frame dlg-plane' : 'dlg-frame';
  Object.assign(f.style, { left: x + 'px', top: y + 'px', width: w + 'px', height: h + 'px', opacity: frameAlpha(style) });
  for (const [k, v] of Object.entries(frameVars(style, plane ? 0 : band))) f.style.setProperty(k, v);
  if (!plane) f.append(document.createElement('i'));   // the ring
  parent.append(f);
  return f;
}

// A switch: a <button> on ui.js's CSS plate (swich_01's looks), its caption as basic.js's BUTTON places it (16-pixel
// Arial (h - 16) / 2 down, centred or 4 in from its side, the caption's own colour over white glyphs, its shadow)
function switchButton(el, c, api, reg, root) {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = 'btn';
  Object.assign(b.style, { left: c.x + 'px', top: c.y + 'px', width: c.w + 'px', height: c.h + 'px' });
  ui.plateLook(b, 0);
  const al = c.align ?? 1, side = al === 0 || al === 2;
  const t = c.label && basic.textBox(b, c.label, { x: side ? 4 : 0, y: Math.floor((c.h - 16) / 2), w: side ? c.w - 8 : c.w, align: al,
    color: c.color, white: true });
  if (t && c.shadow) t.style.textShadow = `${c.shadow.dx}px ${c.shadow.dy}px 0 ${basic.textColor(c.shadow.color, true)}`;
  let snap = c, over = false, down = false;
  const look = () => {
    const a = document.activeElement, mine = a && root.contains(a) && a !== document.body;
    b.dataset.look = lookOf(snap, { over, down, focus: mine ? a === b : null });
  };
  b.addEventListener('pointerenter', () => { over = true; look(); });
  b.addEventListener('pointerleave', () => { over = false; down = false; look(); });
  b.addEventListener('pointerdown', () => { down = true; look(); });
  b.addEventListener('pointerup', () => { down = false; look(); });
  b.addEventListener('focus', look);
  b.addEventListener('blur', look);
  b.addEventListener('click', () => { if (snap.state !== 'disabled') api.click(snap.id); });
  el.append(b);
  reg.set(c.id, { el: b, sync(c2) { snap = c2; b.disabled = c2.state === 'disabled'; b.dataset.state = c2.state || 'normal'; look(); } });
}

// A duel-style button (CWindowTaskButtonDuel: JoinGunsling's), skin.js's, clicking the game's
function duelButton(el, c, api, reg) {
  const b = skin.duelButton(el, { x: c.x, y: c.y, w: c.w, h: c.h, label: c.label, state: null });
  let snap = c;
  b.addEventListener('click', () => { if (snap.state !== 'disabled') api.click(snap.id); });
  reg.set(c.id, { el: b, sync(c2) { snap = c2; b.disabled = c2.state === 'disabled'; } });
}

// The list: a native scroller (controls/scroll.js) of 16-pixel rows over the stripe's looks (CWindowTaskBackStripe::
// applyLooks 0x005a86c0: (8, 8) white and (56, 8) #eeeeed every other item from item 0, the row under the mouse
// (72, 16) #0084ff, all at 70 %), each row a <button> clicking the game's row
function pickList(el, c, api, reg, win) {
  const list = scroll.scrollList(el, { x: c.x, y: c.y, w: c.w, h: c.h, rowH: 16 });
  list.el.classList.add('dlg-list');
  list.el.setAttribute('role', 'listbox');
  let snap = c, shown = null, live = win;
  const pick = async i => {
    const rows = Math.max(1, snap.rows || Math.floor(snap.h / 16)), n = (snap.items || []).length;
    const bar = live.controls.find(k => k.parent === snap.id && /Scroll$/.test(k.cls));
    let top = snap.top || 0;
    const want = topFor(i, top, rows, n);
    if (want !== top && bar && api.setValue) {   // the game's bar to it first: a press lands on the row the game shows
      api.setValue(bar.id, want);
      top = want;
      await new Promise(r => setTimeout(r, 120));   // a few of the game's frames
    }
    api.click(snap.id, rowPoint(live, snap, i, top));
  };
  reg.set(c.id, { el: list.el, sync(c2, w2) {
    snap = c2; live = w2;
    const items = (c2.items || []).map(basic.untag), k = JSON.stringify(items);
    if (k === shown) return;
    shown = k;
    list.set(items, (s, i) => {
      const r = document.createElement('button');
      r.type = 'button';
      r.className = 'dlg-row';
      r.setAttribute('role', 'option');
      r.textContent = s;
      r.style.letterSpacing = basic.spacing(s) + 'px';
      r.addEventListener('click', () => pick(i));
      return r;
    }, (s, i) => i + '\n' + s);
  } });
}

const DRAW = {
  FrameBottomThick: (el, c) => frame(el, { x: c.x, y: c.y, w: c.w, h: c.h, style: c.style, band: c.band ?? 24 }),
  FrameThin: (el, c) => frame(el, { x: c.x, y: c.y, w: c.w, h: c.h, style: c.style }),
  FramePlane: (el, c) => frame(el, { x: c.x, y: c.y, w: c.w, h: c.h, style: c.style, plane: true }),
  // CWindowTaskTextField::layout (0x005b0c60): its back plane over the whole field (the dialogs set it white, 70 %:
  // yo2WindowDialogs.cpp dialogPanels), the text in w - 16 (the hidden scroll bar's column), from its first line
  TextField(el, c) {
    const d = document.createElement('div');
    d.className = 'dlg-back';
    Object.assign(d.style, { left: c.x + 'px', top: c.y + 'px', width: c.w + 'px', height: c.h + 'px' });
    basic.textBox(d, basic.shownLines(c), { w: c.w - 16, h: c.h, align: c.align, px: c.fontSize || 16, gap: c.lineGap, color: c.color });
    el.append(d);
  },
  // the Error dialog's shield (CWindowModelDialogError::onInit 0x005f7c70: a BackPlane over the whole screen at alpha 0,
  // so nothing else can be clicked while it is up): a transparent box that takes the pointer (and gives it to nothing);
  // any other back plane as the chat's
  BackPlane(el, c) {
    if (c.w < 1024 || c.h < 768) return skin.plane(el, c);
    const d = document.createElement('div');
    d.className = 'dlg-shield';
    Object.assign(d.style, { left: c.x + 'px', top: c.y + 'px', width: c.w + 'px', height: c.h + 'px' });
    el.append(d);
  },
  // CWindowTaskInput::layout (from htmlui-chat): the field (w - 16) x (h - 16) 8 in, sampled from the engine's
  // sampling of its pieces (window_base_01_c01 (80, 16) under (56, 8)): a #6ca6e1 top and #7f87c4 left edge, #f0f0ef
  // inside; its text and caret are owned()'s <input>
  Input(el, c) {
    const d = document.createElement('div');
    d.className = 'dlg-field';
    Object.assign(d.style, { left: c.x + 8 + 'px', top: c.y + 8 + 'px', width: c.w - 16 + 'px', height: c.h - 16 + 'px' });
    el.append(d);
  },
  Iconbar: (el, c) => skin.iconbar(el, c),
  ThinChop: (el, c) => skin.chop(el, c),
  FrameDuel: (el, c, api, win) => skin.duelWindow(el, { w: win.w, h: win.h }),
  // a caption (JoinGunsling's): its colour over white glyphs, its shadow the child text that sits off it (social.js's)
  ShadowText(el, c, api, win) {
    const t = basic.textBox(el, c.text || '', { x: c.x, y: c.y, w: c.w, align: c.align, color: c.color, white: true });
    const sh = win.controls.find(k => k.parent === c.id && (k.x !== c.x || k.y !== c.y));
    if (sh) t.style.textShadow = `${sh.x - c.x}px ${sh.y - c.y}px 0 ${basic.textColor(sh.color, true)}`;
  },
};
const ICON = { IconHide: ['hide', 'Close'], IconExpand: ['expand', 'Expand'] };

function draw(c, el, api, win) {
  const reg = win.reg, fam = (c.orig || c.cls).replace(/^CWindowTask/, '');
  if (/Listbox$/.test(fam)) return pickList(el, c, api, reg, win);
  if (fam === 'ButtonDuel') return duelButton(el, c, api, reg);
  if (/Switch$/.test(fam) && !/PictureSwitch$/.test(fam)) return switchButton(el, c, api, reg, win.root);
  if (ICON[fam]) {
    const [kind, label] = ICON[fam], b = skin.icon(el, { x: c.x, y: c.y, kind, label });
    b.addEventListener('click', () => api.click(c.id));
    return;
  }
  if (/(^|[^i])Input(Duel)?$/.test(fam)) return DRAW.Input(el, c);
  return DRAW[fam] ? DRAW[fam](el, c, api, win) : api.renderControl(c, el);
}

export const CLASSES = ['CWindowModelDialogYesNo', 'CWindowModelDialogOk', 'CWindowModelDialogError', 'CWindowModelDialogWithBtns',
  'CWindowModelGoEvent', 'CWindowModelAboutEvent', 'CWindowModelThin', 'CWindowModelList', 'CWindowModelInformation',
  'CWindowModelInput1', 'CWindowModelInput2', 'CWindowModelJoinGunsling'];

const base = owned(CLASSES, draw);
const regs = new WeakMap();   // root -> Map(control id -> { el, sync(c, win) }): the controls whose looks follow each frame
function frameOf(win, root) {
  let reg = regs.get(root);
  if (!reg) {
    regs.set(root, reg = new Map());
    if (!document.getElementById('htmlui-dialog-css')) {
      const s = document.createElement('style');
      s.id = 'htmlui-dialog-css';
      s.textContent = CSS();
      document.head.append(s);
    }
  }
  return Object.assign(view(win), { reg, root });
}
function sync(win, root, st) {
  const reg = regs.get(root), byId = new Map(win.controls.map(c => [c.id, c]));
  for (const [id, r] of reg) {
    const c = byId.get(id);
    if (!c || !r.el.isConnected) { reg.delete(id); continue; }
    r.sync(c, win);
  }
  // the game's focus to start with (No, OK, the name field): once, when the root can take it (it shows a few frames
  // after the game says it is shown); never off another window the player is in
  if (st.focusDone || !win.shown) return;
  st.focusDone = true;
  const f = win.controls.find(c => c.focused && reg.has(c.id) && reg.get(c.id).el.tagName === 'BUTTON');
  if (!f) return;
  let n = 0;
  const t = setInterval(() => {
    const a = document.activeElement;
    if (a && a !== document.body && !root.contains(a) && /^(INPUT|TEXTAREA)$/.test(a.tagName)) { clearInterval(t); return; }
    reg.get(f.id)?.el.focus({ preventScroll: true });
    if (root.contains(document.activeElement) || ++n > 30) clearInterval(t);
  }, 50);
}

export default {
  ...base,
  clip: false,   // the Error dialog's shield lies over the whole screen, outside the window's rect
  mount(win, root, api) {
    const st = base.mount(frameOf(win, root), root, api);
    sync(win, root, st);
    return st;
  },
  update(win, prev, root, api, st) {
    base.update(frameOf(win, root), prev, root, api, st);
    sync(win, root, st);
  },
  unmount(root, st) {
    regs.delete(root);
    base.unmount(root, st);
  },
};
