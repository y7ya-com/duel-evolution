// The generic control renderers: Control snapshots (CONTRACT.md) -> DOM, drawn the way the engine draws them (ui.js:
// the game's own atlases, sampled as the game samples them, and its glyphs). A window with no screen module is these,
// control by control (syncWindow); a screen module calls them through api.renderControl / api.syncWindow.
// FrameBottomThick, TextField, Text and TextSwitch come from htmlui-select's screens/select.js (13deb4f), checked
// against the decomp; the addresses are in each comment.
// Buttons (the owner's rule): a real <button>, the original art as its background (the swich_01 frames, per state),
// the label real text (a transparent <span> for selection, find and screen readers, over the game's glyphs).
import { SHEET, WINDOW_ALPHA, sprite, nine, text, measure, advance } from '../../ui.js';

const LH = 16;   // the 16-pixel font's line (CWindowTaskText fontSize; lineGap is added per control)
// the other font sizes the game asks for (CWindowTaskText::setFontSize), loaded by makeLayer: { 24: font, 32: font }
export const FONTS = {};
const fontOf = c => c.fontSize && c.fontSize !== LH ? FONTS[c.fontSize] : undefined;

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

// CTextElm placement: lines from firstLine, pageLines of them, each fontSize + lineGap down; align 0 left, 1 centred
// (floor, as the game centres), 2 right, inside an area areaW wide.
export function textLines(c, areaW, dx = 0, dy = 0, F = fontOf(c)) {
  const step = (c.fontSize || LH) + (c.lineGap || 0), first = c.firstLine || 0;
  const all = (c.text || '').split('\n').slice(first, first + (c.pageLines || Infinity));
  return all.map((s, i) => [s, dx + (c.align === 1 ? Math.floor((areaW - measure(s, F)) / 2) : c.align === 2 ? areaW - measure(s, F) : 0), dy + i * step]);
}

// ui.text() writes black glyph coverage; a coloured CTextElm gets its RGB written in, its alpha as opacity. Each line
// also gets its real text in a transparent span at the same place.
export function tinted(parent, lines, color = [0, 0, 0, 1], font) {
  lines = lines.filter(l => l[0]);
  if (!lines.length) return null;
  const cv = text(parent, lines, '', font);
  const [r, g, b, a] = color;
  if (r || g || b) {
    const x = cv.getContext('2d'), img = x.getImageData(0, 0, cv.width, cv.height), d = img.data;
    for (let i = 0; i < d.length; i += 4) { d[i] = r * 255; d[i + 1] = g * 255; d[i + 2] = b * 255; }
    x.putImageData(img, 0, 0);
  }
  if (a !== 1) cv.style.opacity = a;
  for (const [s, x, y] of lines) realText(parent, s, x, y, font?.height);
  return cv;
}
export function realText(parent, s, x, y, px = LH) {
  const t = document.createElement('span');
  t.className = 'rt';
  t.textContent = s;
  Object.assign(t.style, { left: x + 'px', top: y + 'px' }, px !== LH && { font: `${px}px/${px}px 'DejaVu Sans', sans-serif` });
  parent.append(t);
  return t;
}

// an item cut into the lines the list shows: at the cell that would pass the width (per character, as CTextElm wraps)
export function wrap(s, width) {
  const out = [];
  let line = '', w = 0;
  for (const ch of s) {
    const a = advance(ch);
    if (line && w + a > width) { out.push(line); line = ''; w = 0; }
    line += ch; w += a;
  }
  out.push(line);
  return out;
}
export function visibleLines(c) {
  const lines = c.items.flatMap(s => wrap(s, c.w - 16)), first = c.topLine || 0;
  return lines.slice(first, first + Math.floor(c.h / LH));
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
    tinted(e, textLines(c, c.w), c.color, fontOf(c));
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
    const off = Math.floor((c.h - LH) / 2), al = c.align ?? 1;
    if (c.label) tinted(e, [[c.label, al === 0 ? 4 : al === 2 ? c.w - 4 - measure(c.label) : Math.floor((c.w - measure(c.label)) / 2), off]]);
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
      tinted(e, textLines(c, c.w - 16), c.color);
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
      if (e.shown !== shown) { e.shown = shown; e.layer.replaceChildren(); tinted(e.layer, [[shown, 8, 8]]); }
      e.caret.style.left = 8 + measure(shown.slice(0, c.caret?.col ?? shown.length)) + 'px';
      e.caret.style.visibility = c.focused && c.caretOn ? '' : 'hidden';
    },
  },
  // CWindowTaskListbox (from htmlui-chat's chat.js): every item wrapped per character at w - 16 (the scroll bar's
  // column), shown from topLine, as many 16-pixel lines as fit; black, one texture
  CWindowTaskListbox: {
    sig: c => JSON.stringify([c.items, c.topLine, c.w, c.h]),
    draw(c) {
      const e = box('div', c);
      tinted(e, visibleLines(c).map((s, i) => [s, 0, i * LH]));
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
    s.opacity = c.alpha === 1 ? '' : c.alpha;
    r.state?.(n.el, c);
  }
  for (const [id, n] of st) if (!seen.has(id)) { n.el.remove(); st.delete(id); }
  const order = win.controls.filter(c => st.has(c.id)).map(c => st.get(c.id).el);
  if (order.some((el, i) => root.children[i] !== el)) root.append(...order);
}
