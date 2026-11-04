// The duel's windows (scene 0x1c; src/duel/SceneDialogs.h, src/Game/yo2CardListView.h, src/System/window/
// yo2WindowDialogs.h): the summon / set / activate command menu (CUSummonDialogSp on CWindowModelListDuelCmd), the
// question dialogs on a thin frame (CUSelectDialog, CUPhaseSelectDialog, CUSelectCoinDialog, CUDiceDialog,
// CURitualDialog, CULockOnDialog), the Yes / No and OK ones on a bottom-thick frame (CUYesNoDialog, CUPhaseYesNoDialog,
// CUOkDialog, CUSelectNumDialog), the help strips (CWindowModelHelp: CHelpDialog, CUDiscardDialog) and the attribute /
// type pickers' lists (CUSelectAttributeDialog / CUSelectTypeDialog: their frame and buttons are the inner Yes / No or
// OK dialog's, another window). Not the field, the LP bars or the swf effects: those are the scene's.
//
// Pass mode: the duel's dialogs read the mouse themselves every frame (CUSelectDialog::tick hovers the row under it,
// CUGDialogBase drags the box, the coins and dice hit-test their own sprites), so the game keeps the pointer and the
// DOM draws what the snapshot says (hover rows, button states, the fade). The owner's Skin rule: the frames, the
// text panel, the list stripes and the button plates are CSS with the atlases' sampled colours (window_base_01_c0N,
// one per frame style; below), the text Arial (controls/basic.js textBox). The engine keeps drawing the real pictures:
// the command / attribute / type icons (CWindowTaskImage*: passthrough) and what the dialogs draw straight to the
// device at their depth (CUSelectCoinDialog's coins, CUDiceDialog's faces, CURitualDialog's stars: SceneDialogs1/2/4
// ugSlot23); the DOM is over the canvas, so it is cut away where those are (holes()).
const ui = await import('../../ui.js').catch(() => null);   // null under node (the unit test needs no DOM)
const basic = ui && await import('../controls/basic.js');
const scroll = ui && await import('../controls/scroll.js');

// ---------------------------------------------------------------- the frame styles (pure: duel_test.mjs)
// window_base_01_c0<style>.png's 24 x 24 frame cell, sampled at its edges' middles (the stretched pieces), from the
// outside in: [top 3 rows, row 4, left 3 columns, column 4, the body (3 px), right column 4 from the edge, right 3,
// bottom row 4, bottom 3, the 1-px line inside]. Every style is the same bevel in its own colours: 0 orange, 1 blue
// (the panel of skin.js), 2 green, 3 yellow, 4 pink, 5 silver, 6 gold, 7 grey, 8 slate. The corner pieces are opaque
// but for the bottom right's 5-px diagonal cut (rows 3..7 lose 1..5 px).
export const TONES = [
  ['#ffff80', '#ffff5c', '#fffc5a', '#ffdf50', '#ffbf44', '#f7aa3b', '#ef9432', '#f29d35', '#e57a26', '#ffffff'],
  ['#a7ffff', '#79ffff', '#76ffff', '#68e8ff', '#59c6ff', '#4db9f7', '#41abef', '#46b1f2', '#329be5', '#ffffff'],
  ['#80ffda', '#5cff9d', '#5aff99', '#50ff88', '#44ff74', '#3bf368', '#31e75c', '#35eb60', '#26d84d', '#ffffff'],
  ['#ffff80', '#ffff5c', '#ffff5a', '#ffff50', '#fdff44', '#faf23b', '#f6e431', '#f8ea35', '#f2d426', '#ffffff'],
  ['#ffaeff', '#ff7ecb', '#ff7bc6', '#ff6daf', '#fe5d96', '#f4518c', '#e94381', '#ee4986', '#dd3475', '#ffffff'],
  ['#ffffff', '#ffffff', '#ffffff', '#f6ffff', '#d2e2e6', '#b6c5d6', '#98a7c5', '#a4b3cc', '#7583b1', '#ffffff'],
  ['#ffffa5', '#ffff8b', '#ffff74', '#fff867', '#f3d458', '#f1c64c', '#efb740', '#f0bd45', '#eca531', '#ffffff'],
  ['#ffffff', '#ffffff', '#ffffff', '#e9e9e8', '#cccccb', '#bfbfbe', '#b2b2b1', '#b7b7b6', '#a2a2a1', '#f5f6ed'],
  ['#d8d8ff', '#b3b3ce', '#b0b0cb', '#a3a3ba', '#9292a6', '#88899e', '#7e7f95', '#828298', '#72738a', '#f5f6ed'],
];
const tones = s => TONES[s] || TONES[1];
// CWindowTaskFrameThin (yo2WindowControls.cpp 0x005a10a0 / 0x005a29b0): 8-px corners, the edges stretched, no
// centre (the text field's back plane fills it). As inset shadows, first listed on top: 3 px of the light (top, left)
// or dark (right, bottom) edge, 1 px between, 3 px of the body, the 1-px line inside. bottom: false leaves the bottom
// edge to the band (the bottom-thick frame's upper part: its last row the inner line, 7 rows of body under it)
export function thinShadow(style, bottom = true) {
  const [hiT, midT, hiL, midL, body, midR, loR, midB, loB, inner] = tones(style);
  return [`inset 3px 0 ${hiL}`, `inset 0 3px ${hiT}`, `inset -3px 0 ${loR}`, bottom && `inset 0 -3px ${loB}`,
    `inset 4px 0 ${midL}`, `inset 0 4px ${midT}`, `inset -4px 0 ${midR}`, bottom && `inset 0 -4px ${midB}`,
    `inset 7px 0 ${body}`, `inset 0 7px ${body}`, `inset -7px 0 ${body}`, `inset 0 -7px ${body}`,
    `inset 8px 0 ${inner}`, `inset 0 8px ${inner}`, `inset -8px 0 ${inner}`, `inset 0 -8px ${inner}`].filter(Boolean).join(', ');
}
// CWindowTaskFrameBottomThick's band (0x005a5b40, pieces (24..48, 8..24)): the body between the side bevels, 4 rows
// of body then 1 + 3 of the bottom bevel
export function bandShadow(style) {
  const [, , hiL, midL, , midR, loR, midB, loB] = tones(style);
  return `inset 3px 0 ${hiL}, inset -3px 0 ${loR}, inset 0 -3px ${loB}, inset 4px 0 ${midL}, inset -4px 0 ${midR}, inset 0 -4px ${midB}`;
}
// the frames' see-through (FrameThin / FrameBottomThick onInit: 0.7, styles 5 and 6 opaque; CWindowModelThin sets
// its frame to kAlpha 0.7 whatever the style): the control's own drawn alpha says which
const CUT = 'polygon(0 0, 100% 0, 100% calc(100% - 5px), calc(100% - 5px) 100%, 0 100%)';

// the list stripes (CWindowTaskBackStripe::applyLooks 0x005a86c0, always window_base_01_c01): rows (8, 8) #ffffff,
// every other one from the first item's parity (56, 8) #eeeeed, a selected one (72, 16) #0084ff; 70 %
const STRIPE = { plain: '#ffffff', alt: '#eeeeed', sel: '#0084ff' };
export const stripeLook = (row, top, sel) => sel ? 'sel' : (row + top) % 2 === (top % 2 === 0 ? 0 : 1) ? 'alt' : 'plain';

// ---------------------------------------------------------------- geometry (pure)
const PARKED = 9999;
// a control's place in its window: where the engine last drew it (worldPos_), less the window's; before its first draw
// (wz 0) its local place under its parents (a nested control's x / y are its parent's)
export function loc(c, byId, win) {
  if (c.wz > 0 && Math.max(c.wx, c.wy) < PARKED) return { x: c.wx - win.x, y: c.wy - win.y };
  const p = c.parent && byId.get(c.parent);
  if (!p) return { x: c.x, y: c.y };
  const q = loc(p, byId, win);
  return { x: q.x + c.x, y: q.y + c.y };
}
const anc = (c, byId, test) => { for (let p = byId.get(c.parent), d = 0; p && d < 16; p = byId.get(p.parent), d++) if (test(p)) return p; return null; };
const fam = c => c.cls.replace(/^CWindowTask/, '');
const isImage = c => /^CWindowTaskImage/.test(c.cls);
const isButton = c => /Switch$|^CWindowTaskButton|ResultNext$/.test(c.cls);
const isList = c => c.items !== undefined;

// Where the engine draws through the window (window-local rects): the icons in front (CWindowTaskImage*, 16 x 16 cells),
// and the sprites a dialog draws itself while open (fade_ 0), from its centre (cx_, cy_) and box (boxW_ x boxH_):
//  - coins (CUSelectCoinDialog::ugSlot23, coin_new.txt sheet 0 duel_ef_coin.png: 14 cells of 50 x 50): two, centred
//    80 px left and right of cx_, 40 px above the box's bottom; the source rect is one texel bigger (51 x 51)
//  - dice faces (CUDiceDialog::ugSlot23 / facePos: dice.txt sheets 7..12, dice_decide1..6 32 x 35): six from
//    cx_ - 96, 32 apart, their tops 16 px above cy_
//  - ritual stars (CURitualDialog::ugSlot23, ritualdlg.txt: level.bmp / level2.bmp 20 x 20): level of them from
//    cx_ - 150 at most 300 px wide, centred 25 px above the box's bottom
export function holes(win) {
  const out = [], d = win.dlg, byId = new Map(win.controls.map(c => [c.id, c]));
  for (const c of win.controls)
    if (isImage(c) && c.shown && !(c.parent && !byId.get(c.parent)?.shown)) { const p = loc(c, byId, win); out.push({ x: p.x, y: p.y, w: c.w || 16, h: c.h || 16 }); }
  if (!d || d.fade !== 0) return out;
  const L = (x, y, w, h) => out.push({ x: x - win.x, y: y - win.y, w, h }), bottom = d.cy + (d.boxH >> 1);
  if (win.cls === 'CUSelectCoinDialog') for (const off of [0, 160]) L(d.cx - 25 - 80 + off, bottom - 25 - 40, 51, 51);
  if (win.cls === 'CUDiceDialog') L(d.cx - 96, d.cy - 16, 192, 35);
  if (win.cls === 'CURitualDialog' && d.level > 0) {
    const step = Math.min(22, d.level * 22 > 280 ? Math.floor(280 / d.level) : 22);
    L(d.cx - 150, bottom - 10 - 25, step * (d.level - 1) + 20, 20);
  }
  return out;
}
// a clip-path keeping everything but the holes (an evenodd path: each hole once, overlaps merged by the caller's few)
export const holePath = rs => !rs.length ? '' :
  `path(evenodd, "M-4096 -4096h8192v8192h-8192z${rs.map(r => `M${r.x} ${r.y}h${r.w}v${r.h}h${-r.w}z`).join('')}")`;

// ---------------------------------------------------------------- DOM
const CSS = () => `
.yo2d-box { position: absolute; left: 0; top: 0; width: 100%; height: 100%; }
.yo2d-box > * { position: absolute; }
.yo2d-thin { box-sizing: border-box; clip-path: ${CUT}; }
.yo2d-thick { clip-path: ${CUT}; }
.yo2d-thick > i { position: absolute; left: 0; right: 0; display: block; }
.yo2d-plane { background: #fff; }
.yo2d-list { overflow: hidden; }
.yo2d-list > i { display: block; position: relative; height: 16px; }
.yo2d-list > i > b { position: absolute; inset: 0; opacity: ${(178 / 255).toFixed(3)}; }
.yo2d-list > i[data-look=plain] > b { background: ${STRIPE.plain}; }
.yo2d-list > i[data-look=alt] > b { background: ${STRIPE.alt}; }
.yo2d-list > i[data-look=sel] > b { background: ${STRIPE.sel}; }
${TONES.map((_, s) => `.yo2d-thin[data-style="${s}"] { box-shadow: ${thinShadow(s)}; }
.yo2d-thick[data-style="${s}"] > .up { box-shadow: ${thinShadow(s, false)}; }
.yo2d-thick[data-style="${s}"] > .band { background: ${tones(s)[4]}; box-shadow: ${bandShadow(s)}; }`).join('\n')}`;
function inject() {
  if (document.getElementById('htmlui-duel-css')) return;
  const st = document.createElement('style');
  st.id = 'htmlui-duel-css';
  st.textContent = CSS();
  document.head.append(st);
}
const place = (el, x, y, w, h) => Object.assign(el.style, { left: x + 'px', top: y + 'px', ...(w != null && { width: w + 'px' }), ...(h != null && { height: h + 'px' }) });
const div = cls => { const d = document.createElement('div'); d.className = cls; return d; };
const LH = 16;

// One drawing per family: (c, p (its place), ctx) -> element | null. ctx: { win, byId, api }
const DRAW = {
  FrameThin(c, p) {
    const e = div('yo2d-thin');
    e.dataset.style = c.style ?? 1;
    place(e, p.x, p.y, c.w, c.h);
    return e;
  },
  FrameBottomThick(c, p) {
    const e = div('yo2d-thick'), up = document.createElement('i'), band = document.createElement('i'), b = c.band ?? 24;
    e.dataset.style = c.style ?? 1;
    up.className = 'up'; band.className = 'band';
    Object.assign(up.style, { top: 0, height: c.h - b + 'px' });
    Object.assign(band.style, { top: c.h - b + 'px', height: b + 'px' });
    e.append(up, band);
    place(e, p.x, p.y, c.w, c.h);
    return e;
  },
  // CWindowTaskTextField::layout (0x005b0c60): the back plane (white, kAlpha) over the field, the text in w - 16 (the
  // hidden scroll bar's column); its parts (plane, text, bar) are drawn here, not by themselves
  TextField(c, p) {
    const e = div('yo2d-field');
    place(e, p.x, p.y, c.w, c.h);
    const plane = div('yo2d-plane');
    Object.assign(plane.style, { position: 'absolute', inset: 0, opacity: (178 / 255).toFixed(3) });
    e.append(plane);
    basic.textBox(e, basic.shownLines(c), { w: c.w - 16, align: c.align, px: c.fontSize || LH, gap: c.lineGap, color: c.color, wrap: true });
    return e;
  },
  BackPlane(c, p) {
    const e = div('yo2d-plane');
    place(e, p.x, p.y, c.w, c.h);
    return e;
  },
  Text(c, p) {
    const s = basic.shownLines(c);
    if (!s) return null;
    const e = div('yo2d-text');
    place(e, p.x, p.y, c.w || null);
    basic.textBox(e, s, { w: c.w || undefined, align: c.align, px: c.fontSize || LH, gap: c.lineGap, color: c.color });
    return e;
  },
  // a list box (CWindowTaskListbox, its *DuelCmd / *CardAttr / *CardType kinds): the stripes, one 16-px row per item
  // from the first shown (top) and plain ones down the rest of the box, the selected (hovered: the dialogs select the
  // row under the mouse) or marked rows highlighted, its items' text (a kind's rows are ViewItem controls: their
  // text and icon draw themselves). The engine's scroll bar column (w - 16) stays clear; rows are as wide as the
  // stripe (the list's width, CWindowTaskBackStripe w_)
  Listbox(c, p, { byId }) {
    const e = div('yo2d-list'), stripe = [...byId.values()].find(k => k.parent === c.id && k.rows !== undefined && k.cls.endsWith('BackStripe'));
    const top = c.top || 0, w = stripe?.w || c.w, rows = Math.max(1, stripe?.rows || c.rows || Math.floor(c.h / LH));
    place(e, p.x, p.y, w, c.h);
    for (let i = 0; i < rows; i++) {
      const it = top + i, row = document.createElement('i'), sh = document.createElement('b');
      row.dataset.look = stripeLook(i, top, it === c.selected || !!c.marks?.[it]);
      row.append(sh);
      const t = c.items?.[it];
      if (t) basic.textBox(row, basic.untag(t), { w: c.w - 16, px: LH });
      e.append(row);
    }
    return e;
  },
  // a button: controls/basic.js's TextSwitch (a <button>, the CSS plate in the snapshot's state, the caption DOM text)
  Button(c, p, { api }) {
    const host = div('yo2d-btn');
    place(host, p.x - c.x, p.y - c.y);
    api.renderControl(c, host);
    return host;
  },
};
const drawerOf = c => {
  const f = fam(c);
  if (isButton(c)) return DRAW.Button;
  if (isList(c) && /^Listbox|^ActiveListbox|^Textlist/.test(f)) return DRAW.Listbox;
  return DRAW[f] || null;
};
// what a control's own drawing covers: a field's, a list's, a button's or a shadow text's parts are theirs
const PART_OF = /^(TextField|Listbox|ActiveListbox|Textlist)/;
function covered(c, byId) {
  if (anc(c, byId, p => isButton(p) || /ShadowText$/.test(p.cls))) return true;
  const up = byId.get(c.parent);
  return !!up && PART_OF.test(fam(up)) && /BackStripe$|BackPlane$|Text$|Scroll/.test(c.cls);
}

// The engine's scroll bar of a list (a part of it) as a native box over the bar's own rect (the owner's rule, as
// scrollbars.js does for the windows no screen owns): scrolling it sets the bar's value through the game's setValue
// (the list follows, the window is told); the game moving its list moves the box.
export function nativeBar(c, p, api) {
  scroll.inject();
  const el = document.createElement('div'), inner = document.createElement('div'), b = { el, at: -1, want: null, frames: 0 };
  el.className = 'yo2-scroll-list';
  el.append(inner);
  const range = () => el.scrollHeight - el.clientHeight;
  el.addEventListener('scroll', () => {
    const r = range(), v = r > 0 ? Math.round(el.scrollTop / r * b.max) : 0;
    if (v === b.at) return;
    b.at = b.want = v; b.frames = 0;
    api.setValue?.(b.id, v);
  }, { passive: true });
  b.update = (c, p) => {
    b.id = c.id; b.max = c.max;
    const page = Math.max(1, c.page || 1);
    place(el, p.x, p.y, 16, c.h);
    Object.assign(el.style, { overflowY: 'scroll' });
    Object.assign(inner.style, { width: '1px', height: c.h * (c.max + page) / page + 'px' });
    if (b.want !== null && (c.value === b.want || ++b.frames > 10)) b.want = null;
    if (b.want === null && c.value !== b.at) { b.at = c.value; el.scrollTop = c.max ? c.value / c.max * range() : 0; }
  };
  b.update(c, p);
  return b;
}

// the window, control by control in the engine's order (back to front), each redrawn only when its snapshot changes
function sync(win, st, api) {
  const byId = new Map(win.controls.map(c => [c.id, c])), seen = new Set(), order = [];
  const scale = win.alpha > 0 ? win.alpha : 1;   // the root carries the window's own alpha: a control's is relative
  for (const c of win.controls) {
    const p = loc(c, byId, win);
    if (/Scroll/.test(c.cls) && c.thumb !== undefined) {   // the engine's bar: never drawn; a native box while it scrolls
      if (!c.shown || c.max <= 0 || anc(c, byId, k => !k.shown)) continue;
      let b = st.bars.get(c.id);
      if (!b) { b = nativeBar(c, p, api); st.bars.set(c.id, b); } else b.update(c, p);
      seen.add(c.id); order.push(b.el);
      continue;
    }
    const draw = drawerOf(c);
    if (!draw || !c.shown || covered(c, byId) || anc(c, byId, k => !k.shown)) continue;
    const sig = JSON.stringify([c, p, isList(c) && win.controls.find(k => k.parent === c.id && k.rows !== undefined)]);
    let n = st.els.get(c.id);
    if (!n || n.sig !== sig) {
      const el = draw(c, p, { win, byId, api }) || document.createElement('i');
      n ? n.el.replaceWith(el) : st.box.append(el);
      n = { el, sig };
      st.els.set(c.id, n);
    }
    const a = Math.min(1, (c.alpha ?? 1) / scale);
    n.el.style.opacity = a >= 0.999 ? '' : a.toFixed(3);
    seen.add(c.id); order.push(n.el);
  }
  for (const [id, n] of st.els) if (!seen.has(id)) { n.el.remove(); st.els.delete(id); }
  for (const [id, b] of st.bars) if (!seen.has(id)) { b.el.remove(); st.bars.delete(id); }
  if (order.some((e, i) => st.box.children[i] !== e)) st.box.append(...order);
  const clip = holePath(holes(win));
  if (st.box.style.clipPath !== clip) st.box.style.clipPath = clip;
}

export const screen = {
  mode: 'pass',
  // the icons stay the engine's (detailed 16 x 16 pictures: duelcmd_icon_01, icon_zokusei_01, icon_syuzoku_01)
  passthrough: x => isImage(x),
  mount(win, root, api) {
    inject();
    const box = div('yo2d-box');
    root.append(box);
    const st = { box, els: new Map(), bars: new Map() };
    return st;
  },
  update(win, prev, root, api, st) { sync(win, st, api); },
  unmount(root) { root.replaceChildren(); },
};

export default {
  ...screen,
  classes: [
    // thin-framed (CUGDialogBase on CWindowModelThin)
    'CUSelectDialog', 'CUPhaseSelectDialog', 'CUSelectCoinDialog', 'CUDiceDialog', 'CURitualDialog', 'CULockOnDialog',
    // the command menu
    'CWindowModelListDuelCmd', 'CUSummonDialogSp',
    // bottom-thick with buttons (CWindowModelDialogYesNo / Ok)
    'CUYesNoDialog', 'CUPhaseYesNoDialog', 'CUOkDialog', 'CUDialogBaseOk', 'CUSelectNumDialog',
    // help strips (CWindowModelHelp: FrameThin + CWindowTaskHelp)
    'CWindowModelHelp', 'CHelpDialog', 'CUGDialogBaseHP', 'CUDiscardDialog',
    // the pickers' list (their frame is the inner dialog's window)
    'CUSelectAttributeDialog', 'CUSelectTypeDialog',
  ],
};
