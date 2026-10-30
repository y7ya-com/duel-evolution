// The generic control renderers: Control snapshots (CONTRACT.md) -> DOM. The art is the game's own (ui.js: its
// atlases, sampled as the game samples them); text is real DOM text (the owner's call), in Arial as the 2008 client
// asks GDI for it. A window with no screen module is these, control by control (syncWindow); a screen module calls them
// through api.renderControl / api.syncWindow. FrameBottomThick, TextField, Text and TextSwitch come from
// htmlui-select's screens/select.js (13deb4f), checked against the decomp; the addresses are in each comment.
// Buttons (the owner's rule): a real <button>, the original art as its background (the swich_01 frames, per state).
import { SHEET, WINDOW_ALPHA, sprite, nine } from '../../ui.js';

const LH = 16;   // a 16-pixel line (CWindowTaskText fontSize; lineGap is added per control)

// Text: the game asks GDI for "Arial" with lfHeight 16 (CreateFontIndirectA, logged in the native build): a 16-pixel
// cell, which is Arial's winAscent + winDescent = 1.117 em, so 14.3 px Arial on 16-pixel lines (the baseline lands
// where GDI's does). Metric-compatible fallbacks where Arial is missing.
export const FONT = 'Arial, "Liberation Sans", Arimo, Helvetica, sans-serif';
export const fontCss = (px = LH, line = px) => `${+(px / 1.117).toFixed(2)}px/${line}px ${FONT}`;
// a CTextElm's colour MULTIPLIES its glyphs, which are black: black whatever the colour, only its alpha shows (white,
// CWindowTaskText's default, draws black). white: the glyphs are white (a ShadowText set up for tinting,
// src/Result/yo2ResultWindow.cpp): the colour shows.
export const textColor = (color = [0, 0, 0, 1], white = false) => {
  const [r, g, b, a] = white ? color : [0, 0, 0, color[3] ?? 1];
  return `rgba(${r * 255 | 0}, ${g * 255 | 0}, ${b * 255 | 0}, ${a})`;
};
// Lines of text as one block at x, y; w is the box alignment (0 left, 1 centre, 2 right) and wrapping happen in;
// h clips it. The layout is the browser's.
export function textBox(parent, s, { x = 0, y = 0, w, h, align = 0, px = LH, gap = 0, color, white = false, wrap = false } = {}) {
  const d = document.createElement('div');
  d.className = 'txt';
  d.textContent = s;
  Object.assign(d.style, { left: x + 'px', top: y + 'px', font: fontCss(px, px + gap), color: textColor(color, white),
    textAlign: ['left', 'center', 'right'][align] || 'left', whiteSpace: wrap ? 'pre-wrap' : 'pre' },
  w != null && { width: w + 'px' }, h != null && { height: h + 'px', overflow: 'hidden' }, wrap && { wordBreak: 'break-all' });
  parent.append(d);
  return d;
}
// the lines a CTextElm shows: from firstLine, pageLines of them
export const shownLines = c => { const f = c.firstLine || 0; return (c.text || '').split('\n').slice(f, f + (c.pageLines || Infinity)).join('\n'); };
let measurer;   // made on first use: importing this file needs no DOM (node tests)
export const textWidth = (s, px = LH) => {
  measurer ||= document.createElement('canvas').getContext('2d');
  measurer.font = fontCss(px);
  return measurer.measureText(s).width;
};
// [[string, x, y], ...] placed lines (older screens' call): each line a text block at its place
export function tinted(parent, lines, color, font, white = false) {
  return lines.filter(l => l[0]).map(([s, x, y]) => textBox(parent, s, { x, y, color, white, px: font?.height ?? LH }))[0] || null;
}

// CWindowTaskFrameBottomThick::layout (0x005a5b40): 14 8x8 pieces of window_base_01_c0<style>, the frame over
// h - band, the band below it; no centre piece above the band (the window's text field's back plane fills it).
// [x, y, w, h, u, v] in the control's pixels.
export function bottomThickPieces(w, h, band) {
  const top = h - band, m = w - 16;
  return [
    [0, 0, 8, 8, 0, 0], [8, 0, m, 8, 8, 0], [w - 8, 0, 8, 8, 16, 0],
    [0, 8, 8, top - 16, 0, 8], [w - 8, 8, 8, top - 16, 16, 8],
    [0, top - 8, 8, 8, 72, 8], [8, top - 8, m, 8, 56, 16], [w - 8, top - 8, 8, 8, 80, 8],
    [0, top, 8, band - 8, 24, 8], [w - 8, top, 8, band - 8, 40, 8],
    [0, h - 8, 8, 8, 24, 16], [8, h - 8, m, 8, 32, 16], [w - 8, h - 8, 8, 8, 40, 16],
    [8, top, m, band - 8, 32, 8],
  ];
}

// CWindowTaskSwitch::onMain / setLook (0x005b8600 / 0x005b8940): the swich_01 column a state shows.
// Looks 0 normal, 1 hover, 2 pressed, 4 checked, 5 checked + hover (3 is skipped, so 4 and 5 sit in columns 3 and 4);
// disabled shows normal; a focused control at rest shows hover.
export function switchColumn({ state, checked, focused }) {
  const look = state === 'pressed' ? 2 : state === 'hover' ? (checked ? 5 : 1)
    : state === 'normal' && focused ? 1 : checked ? 4 : 0;
  return look < 3 ? look : look - 1;
}

const box = (tag, c) => {
  const e = document.createElement(tag);
  Object.assign(e.style, { position: 'absolute', left: c.x + 'px', top: c.y + 'px', width: c.w + 'px', height: c.h + 'px' });
  return e;
};

// One renderer per class: draw(c, api, opts) builds the element, sig(c) is what a redraw depends on, state(e, c)
// applies what changes every frame (looks, values) without a redraw.
const TEXT = {
  sig: c => JSON.stringify([c.w, c.text, c.align, c.firstLine, c.pageLines, c.lineGap, c.color, c.fontSize]),
  draw(c) {
    const e = box('div', c);
    textBox(e, shownLines(c), { w: c.w, align: c.align, px: c.fontSize || LH, gap: c.lineGap, color: c.color });
    return e;
  },
};
// CWindowTaskTextSwitch (0x005ba7d0 / 0x005baa40): swich_01's 9-slice in the state's column, a black 16-pixel caption
// (h - 16) / 2 down, 4 in from the left (LEFT), centred (CENTRE) or 4 in from the right (RIGHT).
const BUTTON = {
  sig: c => JSON.stringify([c.w, c.h, c.label, c.align]),
  draw(c, api) {
    const e = box('button', c);
    e.type = 'button';
    e.className = 'btn';
    e.tabIndex = api?.owned ? 0 : -1;   // pass mode: the game owns focus and keys
    if (api?.owned) e.addEventListener('click', () => api.click(c.id));
    e.tiles = nine(e, SHEET.button, 0, 0, 0, 0, c.w, c.h);
    const al = c.align ?? 1, side = al === 0 || al === 2;
    if (c.label) textBox(e, c.label, { x: side ? 4 : 0, y: Math.floor((c.h - LH) / 2), w: side ? c.w - 8 : c.w, align: al });
    return e;
  },
  state(e, c) {
    const col = switchColumn(c);
    e.dataset.state = c.state;
    e.disabled = c.state === 'disabled';
    if (e.col === col) return;
    e.col = col;
    e.tiles.forEach((t, i) => t.src(col * 24 + (i % 3) * 8, Math.floor(i / 3) * 8));
  },
};
const R = {
  CWindowTaskFrameBottomThick: {
    ownAlpha: true,   // its pieces carry the frame's 0.7 (the control's alpha is the same 0.7)
    sig: c => [c.w, c.h, c.band, c.style].join(),
    draw(c) {
      const e = box('div', c);
      e.className = 'frame';
      const a = c.style === 5 || c.style === 6 ? 1 : WINDOW_ALPHA;   // onInit: 0.7 but styles 5 and 6
      for (const [x, y, w, h, u, v] of bottomThickPieces(c.w, c.h, c.band ?? 24)) sprite(e, SHEET.window, u, v, 8, 8, x, y, w, h, a);
      return e;
    },
  },
  // CWindowTaskTextField::layout (0x005b0c60): a back plane (window_base_01_c01's 8,8 piece, 70 %) over the whole
  // field, the text in w - 16 (the hidden scroll bar's column)
  CWindowTaskTextField: {
    sig: c => JSON.stringify([c.w, c.h, c.text, c.align, c.firstLine, c.pageLines, c.lineGap, c.color]),
    draw(c) {
      const e = box('div', c);
      sprite(e, SHEET.window, 8, 8, 8, 8, 0, 0, c.w, c.h, WINDOW_ALPHA);
      textBox(e, shownLines(c), { w: c.w - 16, align: c.align, px: c.fontSize || LH, gap: c.lineGap, color: c.color });
      return e;
    },
  },
  CWindowTaskText: TEXT, CWindowTaskShadowText: TEXT,
  CWindowTaskTextSwitch: BUTTON, CWindowTaskButtonMain: BUTTON, CWindowTaskButtonDuel: BUTTON,
  CWindowTaskResultNext: BUTTON, CWindowTaskSwitch: BUTTON,
  CWindowTaskCheckbox: {   // check_01: the box, the tick over it when checked
    sig: () => '',
    draw(c) {
      const e = box('div', c);
      sprite(e, SHEET.check, 0, 0, 16, 16, 0, 0, 16, 16);
      e.tick = sprite(e, SHEET.check, 16, 0, 16, 16, 0, 0, 16, 16);
      return e;
    },
    state(e, c) { e.tick.style.visibility = c.checked ? '' : 'hidden'; },
  },
  // CWindowTaskInput::layout (from htmlui-chat's chat.js): the border piece 8 in, (w-16) x (h-16), the fill a pixel
  // inside it, both opaque; the text and the 2 x 16 caret (kasoru_01) at +8,+8. opts.noText: the field without its
  // text and caret (an owned screen's own <input> draws those).
  CWindowTaskInput: {
    sig: c => JSON.stringify([c.w, c.h]),
    draw(c, api, opts = {}) {
      const e = box('div', c);
      sprite(e, SHEET.window, 80, 16, 8, 8, 8, 8, c.w - 16, c.h - 16);
      sprite(e, SHEET.window, 56, 8, 8, 8, 9, 9, c.w - 17, c.h - 17);
      if (!opts.noText) {
        e.layer = document.createElement('div');
        e.layer.className = 'layer';
        e.append(e.layer);
        e.caret = sprite(e, SHEET.caret, 0, 0, 2, 16, 8, 8, 2, 16);
      }
      return e;
    },
    state(e, c) {
      if (!e.layer) return;
      const shown = c.password ? '*'.repeat(c.value.length) : c.value;
      if (e.shown !== shown) { e.shown = shown; e.layer.replaceChildren(); textBox(e.layer, shown, { x: 8, y: 8 }); }
      e.caret.style.left = 8 + Math.round(textWidth(shown.slice(0, c.caret?.col ?? shown.length))) + 'px';
      e.caret.style.visibility = c.focused && c.caretOn ? '' : 'hidden';
    },
  },
  // CWindowTaskListbox: the items, wrapped at w - 16 (the scroll bar's column), 16-pixel lines, shown from topLine;
  // clipped to the list (the browser wraps; the game wraps per character, so long items may break elsewhere)
  CWindowTaskListbox: {
    sig: c => JSON.stringify([c.items, c.topLine, c.w, c.h]),
    draw(c) {
      const e = box('div', c);
      e.style.overflow = 'hidden';
      textBox(e, c.items.join('\n'), { y: -(c.topLine || 0) * LH, w: c.w - 16, wrap: true });
      return e;
    },
  },
};
R.CWindowTaskInputDuel = R.CWindowTaskInput;
R.CWindowTaskActiveListbox = R.CWindowTaskTextlist = R.CWindowTaskListbox;

const missing = new Set();
const rendererOf = cls => {
  const r = R[cls];
  if (!r && !missing.has(cls)) { missing.add(cls); console.debug('htmlui: no renderer for', cls); }
  return r;
};
export const covers = c => !!R[c.cls];

// One control, drawn once into el (an owned screen's one-off). Returns the element, or null without a renderer.
export function renderControl(c, el, api, opts) {
  const r = rendererOf(c.cls);
  if (!r) return null;
  const e = r.draw(c, api, opts);
  r.state?.(e, c);
  if (!c.shown) e.style.visibility = 'hidden';
  el.append(e);
  return e;
}

// A window's controls kept in sync with its snapshot: st (a Map the caller keeps) holds one element per control id,
// redrawn when its sig changes, moved / shown / restyled every frame, in draw order.
export function syncWindow(root, win, st, api) {
  const seen = new Set();
  for (const c of win.controls) {
    if (c.parent) continue;   // a part of another control (a caption, a field's plane or bar): its parent draws it
    const r = rendererOf(c.cls);
    if (!r) continue;
    seen.add(c.id);
    let n = st.get(c.id);
    const sig = r.sig(c);
    if (!n || n.sig !== sig) {
      const el = r.draw(c, api);
      n ? n.el.replaceWith(el) : root.append(el);
      n = { el, sig };
      st.set(c.id, n);
    }
    const s = n.el.style;
    s.left = c.x + 'px'; s.top = c.y + 'px';
    s.visibility = c.shown ? '' : 'hidden';
    s.opacity = c.alpha === 1 || r.ownAlpha ? '' : c.alpha;
    r.state?.(n.el, c);
  }
  for (const [id, n] of st) if (!seen.has(id)) { n.el.remove(); st.delete(id); }
  const order = win.controls.filter(c => st.has(c.id)).map(c => st.get(c.id).el);
  if (order.some((el, i) => root.children[i] !== el)) root.append(...order);
}
