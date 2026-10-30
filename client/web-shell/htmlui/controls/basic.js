// The generic control renderers: one Control snapshot (CONTRACT.md) -> DOM in its window's root, from ui.js's pieces
// (the game's own atlases and glyphs). A window with no screen module is these, control by control. In owned mode
// a button's click goes back through api.click; in pass mode the root has pointer-events: none and the game takes it.
import * as ui from '../../ui.js';

const STATE = { normal: 0, hover: 1, pressed: 2, disabled: 0 };
const lines = s => s.split('\n');

function textBlock(el, c, x = c.x, y = c.y) {
  const rows = lines(c.text || '').slice(c.firstLine || 0, (c.firstLine || 0) + (c.pageLines || 100));
  const step = 16 + (c.lineGap || 0), out = [];
  rows.forEach((s, i) => {
    if (!s) return;
    const dx = c.align === 1 ? Math.floor((c.w - ui.measure(s)) / 2) : c.align === 2 ? c.w - ui.measure(s) : 0;
    out.push([s, x + dx, y + i * step]);
  });
  return out.length ? ui.text(el, out) : null;
}

const R = {
  frame(el, c) { ui.windowFrame(el, c.x, c.y, c.w, c.h, Math.max(0, (c.band ?? 24) - 8)); },
  text(el, c) { textBlock(el, c); },
  button(el, c, api) {   // the caption: centred (align 1, ui.js's own) or drawn here at 8 px in (align 0)
    const own = c.align === 0 || c.align === 2;
    const b = ui.button(el, c.x, c.y, c.w, c.label || '', api.owned ? () => api.click(c.id) : null, c.h, !own);
    b.state(STATE[c.state] || 0);
    if (own && c.label) textBlock(b, { text: c.label, align: c.align, w: c.w - 16 }, 8, (c.h - 16) / 2);
  },
  checkbox(el, c) { ui.checkbox(el, c.x, c.y, c.checked); },
  input(el, c) {
    const f = ui.input(el, c.x, c.y, c.w, { mask: c.password, max: c.maxLen });
    f.set(c.value, c.focused, c.caretOn);
  },
  list(el, c) {
    c.items.slice(c.top, c.top + (c.rows || Math.floor(c.h / 16))).forEach((s, i) =>
      s && ui.text(el, [[s, c.x, c.y + i * 16]]));
  },
};
const FAMILY = {
  CWindowTaskFrameBottomThick: 'frame', CWindowTaskFrameThin: 'frame', CWindowTaskFramePlane: 'frame',
  CWindowTaskText: 'text', CWindowTaskShadowText: 'text', CWindowTaskTextField: 'text',
  CWindowTaskSwitch: 'button', CWindowTaskTextSwitch: 'button', CWindowTaskButtonMain: 'button',
  CWindowTaskButtonDuel: 'button', CWindowTaskResultNext: 'button', CWindowTaskCheckbox: 'checkbox',
  CWindowTaskInput: 'input', CWindowTaskInputDuel: 'input',
  CWindowTaskListbox: 'list', CWindowTaskActiveListbox: 'list', CWindowTaskTextlist: 'list',
};
const missing = new Set();

// true when it drew (or deliberately draws nothing for) the control
export function renderControl(c, el, api) {
  const f = FAMILY[c.cls];
  if (!f) {
    if (!missing.has(c.cls)) { missing.add(c.cls); console.debug('htmlui: no renderer for', c.cls); }
    return false;
  }
  R[f](el, c, api);
  return true;
}
export const covers = c => !!FAMILY[c.cls];
