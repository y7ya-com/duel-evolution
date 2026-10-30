// Select Player (CWindowPlayerSelect, src/PlayerSelect/yo2PlayerSelect.cpp) in HTML: the window's controls drawn the
// way the engine draws them (ui.js: the game's own atlases, sampled as the game samples them, and its glyphs).
// Pass mode: the game takes the input; hover / pressed come back in each control's snapshot.
// The controls here (FrameBottomThick, TextField, TextSwitch, Text) are generic: htmlui-bridge promotes them to controls/.
import { SHEET, WINDOW_ALPHA, sprite, nine, text, measure } from '../../../html-ui/ui.js';

const LH = 16;   // the 16-pixel font's line (CWindowTaskText fontSize; lineGap is added per control)

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
// (floor, as the game centres: ui.js button), 2 right, inside an area areaW wide.
export function textLines(c, areaW, dx = 0, dy = 0) {
  const step = (c.fontSize || LH) + (c.lineGap || 0), first = c.firstLine || 0;
  const all = (c.text || '').split('\n').slice(first, first + (c.pageLines || Infinity));
  return all.map((s, i) => [s, dx + (c.align === 1 ? Math.floor((areaW - measure(s)) / 2) : c.align === 2 ? areaW - measure(s) : 0), dy + i * step]);
}

// ui.text() writes black glyph coverage; a coloured CTextElm gets its RGB written in, its alpha as opacity.
function tinted(parent, lines, color = [0, 0, 0, 1]) {
  if (!lines.some(l => l[0])) return null;
  const cv = text(parent, lines.filter(l => l[0]));
  const [r, g, b, a] = color;
  if (r || g || b) {
    const x = cv.getContext('2d'), img = x.getImageData(0, 0, cv.width, cv.height), d = img.data;
    for (let i = 0; i < d.length; i += 4) { d[i] = r * 255; d[i + 1] = g * 255; d[i + 2] = b * 255; }
    x.putImageData(img, 0, 0);
  }
  if (a !== 1) cv.style.opacity = a;
  return cv;
}

const box = (tag, c) => {
  const e = document.createElement(tag);
  Object.assign(e.style, { position: 'absolute', left: c.x + 'px', top: c.y + 'px', width: c.w + 'px', height: c.h + 'px' });
  return e;
};

// One renderer per control family: draw(c) builds the element, sig(c) is what a redraw depends on.
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
  // field, the text in w - 16 (the hidden scroll bar's column), centred by default.
  CWindowTaskTextField: {
    sig: c => JSON.stringify([c.w, c.h, c.text, c.align, c.firstLine, c.pageLines, c.lineGap, c.color]),
    draw(c) {
      const e = box('div', c);
      sprite(e, SHEET.window, 8, 8, 8, 8, 0, 0, c.w, c.h, WINDOW_ALPHA);
      tinted(e, textLines(c, c.w - 16), c.color);
      return e;
    },
  },
  CWindowTaskText: {
    sig: c => JSON.stringify([c.w, c.text, c.align, c.firstLine, c.pageLines, c.lineGap, c.color]),
    draw(c) {
      const e = box('div', c);
      tinted(e, textLines(c, c.w), c.color);
      return e;
    },
  },
  // CWindowTaskTextSwitch (0x005ba7d0 / 0x005baa40): swich_01's 9-slice in the state's column, a black 16-pixel caption
  // (h - 16) / 2 down, 4 in from the left (LEFT), centred (CENTRE) or 4 in from the right (RIGHT). The owner's rule
  // for image buttons: a real <button> holding the original art; the label is real text (the game draws it apart).
  CWindowTaskTextSwitch: {
    sig: c => JSON.stringify([c.w, c.h, c.label, c.align]),
    draw(c) {
      const e = box('button', c);
      e.className = 'btn';
      e.tabIndex = -1;   // pass mode: the game owns focus and keys
      e.setAttribute('aria-label', c.label || '');
      Object.assign(e.style, { margin: 0, padding: 0, border: 0, background: 'none', font: 'inherit' });
      e.tiles = nine(e, SHEET.button, 0, 0, 0, 0, c.w, c.h);
      // ponytail: the snapshot has no caption align yet (asked htmlui-bridge); onInit sets LEFT on the four rows only
      const off = Math.floor((c.h - LH) / 2), al = c.align ?? (c.name === 'プレイヤ選択ボタン' ? 0 : 1);
      if (c.label) text(e, [[c.label, al === 0 ? 4 : al === 2 ? c.w - 4 - measure(c.label) : Math.floor((c.w - measure(c.label)) / 2), off]]);
      return e;
    },
    state(e, c) {
      const col = switchColumn(c);
      if (e.col === col) return;
      e.col = col;
      e.tiles.forEach((t, i) => t.src(col * 24 + (i % 3) * 8, Math.floor(i / 3) * 8));
      e.disabled = c.state === 'disabled';
    },
  },
};

function sync(root, win, st) {
  const seen = new Set();
  for (const c of win.controls) {
    const r = R[c.cls];
    if (!r) continue;   // the waist-up avatar (passthrough) and anything this window doesn't have
    seen.add(c.id);
    let n = st.get(c.id);
    const sig = r.sig(c);
    if (!n || n.sig !== sig) {
      const el = r.draw(c);
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
  // back to front, as listed (re-append only when the order changed)
  const order = win.controls.filter(c => st.has(c.id)).map(c => st.get(c.id).el);
  if (order.some((el, i) => root.children[i] !== el)) root.append(...order);
}

export default {
  classes: ['CWindowPlayerSelect'],
  mode: 'pass',
  passthrough: c => c.name.startsWith('ＷＵアバター'),   // the waist-up avatar stays engine-drawn
  mount(win, root, api) {
    const st = new Map();
    sync(root, win, st);
    return st;
  },
  update(win, prev, root, api, st) { sync(root, win, st); },
  unmount(root, st) { root.replaceChildren(); st.clear(); },
};
