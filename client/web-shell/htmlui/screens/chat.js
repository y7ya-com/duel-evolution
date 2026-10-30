// The chat window (CChatWindow : CWindowModelChatWindow, src/System/window/yo2WindowChat.cpp), owned by the DOM.
// Its tabs come from the game: All Chat | Duel Log | Proximity Chat | TRADE | Team (the Duel Log tab is ovr/duellog.c's,
// shown on the duel screen only; the server's channel-9 lines land in its list), so nothing here knows tab names.
// - Drawing: every control through the generic renderers (api.renderControl), each redrawn only when its snapshot
//   changes. The input's text, caret and selection are drawn here while the DOM's <input> has the focus.
// - Input: tabs, the △ / ▽ icons and any button are <button>s that click the game's control; the input line is a real
//   <input> (typing, IME, paste, selection, copy) that commits through the control's setText, Enter sending as the
//   game's own WM_CHAR '\r'; the log's lines are real, selectable text over the glyphs; the wheel and the scroll bar
//   scroll the log.
const ui = await import('../../ui.js').catch(() => null);   // null under node (the unit test needs no DOM)

const BUTTON = /(Tab|IconExpand|IconHide|IconShow|IconShrink|Switch|ButtonMain|ButtonDuel|CardWindow)$/;
const LINE = 16;     // the list's line pitch (CWindowTaskListbox: 16-pixel rows)
const TEXT = 8;      // the input's text and caret origin inside the control (CWindowTaskInput::layout / onMain)
const ARROW = 16;    // the scroll bar's arrows (CWindowTaskScroll::loadImages)

// A log item cut into the lines the list shows: at the cell that would pass the width (the list's text area is
// w - 16, the scroll bar's column). ponytail: per character, as CTextElm wraps; a word-wrapping item would only move
// the selectable text, never the glyphs.
export function wrap(s, width, adv) {
  const out = [];
  let line = '', w = 0;
  for (const ch of s) {
    const a = adv(ch);
    if (line && w + a > width) { out.push(line); line = ''; w = 0; }
    line += ch; w += a;
  }
  out.push(line);
  return out;
}

// The lines in view: every item wrapped, from the scroll bar's value (the first line shown), as many as fit.
export function visibleLines(list, scroll, adv) {
  const lines = list.items.flatMap(s => wrap(s, list.w - 16, adv));
  const first = scroll ? scroll.value : 0;
  return lines.slice(first, first + Math.floor(list.h / LINE));
}

// A pointer at y (bar-local) on a scroll bar: the arrows step, the track maps to a value (CWindowTaskScroll::drag's
// posToValue: thumb positions 0..length - arrows - thumb over 0..max).
export function scrollValue(bar, y) {
  if (y < ARROW) return Math.max(0, bar.value - 1);
  if (y >= bar.length - ARROW) return Math.min(bar.max, bar.value + 1);
  const span = bar.length - 2 * ARROW - bar.thumb.len;
  if (span <= 0) return bar.value;
  const v = Math.round((y - ARROW - bar.thumb.len / 2) / span * bar.max);
  return Math.max(0, Math.min(bar.max, v));
}

// The character index under x (text-local) in s: the nearest cell boundary, as the game's caretAt picks it.
export function indexAt(s, x, adv) {
  let i = 0, w = 0;
  const chars = [...s];
  while (i < chars.length && w + adv(chars[i]) / 2 < x) w += adv(chars[i++]);
  return chars.slice(0, i).join('').length;   // UTF-16 index, what the <input>'s selection counts
}

const place = (el, c) => Object.assign(el.style, { position: 'absolute', left: c.x + 'px', top: c.y + 'px',
  width: c.w + 'px', height: c.h + 'px' });
const key = c => JSON.stringify(c);
// a pointer in an element's own game pixels (the bridge scales the layer by --s)
const local = (e, el) => {
  const r = el.getBoundingClientRect();
  return [(e.clientX - r.left) * el.offsetWidth / r.width, (e.clientY - r.top) * el.offsetHeight / r.height];
};

function ownButton(c, layer, api) {
  const b = document.createElement('button');
  b.className = 'own';
  b.addEventListener('click', () => api.click(c.id));
  layer.append(b);
  return b;
}

function ownList(c, layer, api) {
  const d = document.createElement('div');
  d.className = 'own log';
  d.setAttribute('role', 'log');
  d.addEventListener('wheel', e => {
    e.preventDefault();
    if (e.deltaY) api.wheel(c.id, e.deltaY < 0 ? 120 : -120);   // WM_MOUSEWHEEL over the log: up is positive
  }, { passive: false });
  layer.append(d);
  return d;
}

function ownScroll(c, layer, api) {
  const d = document.createElement('div');
  d.className = 'own';
  let bar = c;
  const at = e => api.scroll(bar.id, scrollValue(bar, local(e, d)[1]));
  d.addEventListener('pointerdown', e => { e.preventDefault(); d.setPointerCapture(e.pointerId); at(e); });
  d.addEventListener('pointermove', e => { if (d.hasPointerCapture(e.pointerId)) at(e); });
  d.update = c2 => { bar = c2; };
  layer.append(d);
  return d;
}

// An input's text as the game lays it out: one row per '\n' paragraph cut at the width ([text, first index] each).
export function layoutText(v, width, adv) {
  const rows = [];
  let i = 0;
  for (const para of v.split('\n')) {
    for (const r of wrap(para, width, adv)) { rows.push([r, i]); i += r.length; }
    i++;
  }
  return rows;
}
// the row an index is on (the last that starts at or before it)
export const rowOf = (rows, index) => rows.findLastIndex(([, i]) => i <= index);

// An input: a real <input> (<textarea> for a multi-line one), never painted except for the IME's composition; the
// field drawn by the generic renderer, its text, caret and selection drawn here while the DOM has the focus (the
// game's own while it doesn't). Keys are the element's own (none reaches the canvas: the game would get them twice).
function ownInput(c, layer, api, st) {
  const f = document.createElement('div'), paint = document.createElement('div');
  const el = document.createElement(c.multiLine ? 'textarea' : 'input');
  f.className = 'own';
  paint.className = 'paint';
  el.className = 'native';
  Object.assign(el, { spellcheck: false, autocomplete: c.password ? 'current-password' : 'off', maxLength: c.maxLen });
  if (!c.multiLine) el.type = c.password ? 'password' : 'text';
  el.setAttribute('aria-label', c.name || 'Text');
  f.append(paint, el);
  for (const t of ['keydown', 'keyup', 'keypress']) el.addEventListener(t, e => e.stopPropagation());
  layer.append(f);
  let snap = c, composing = false, entered = false;
  const width = () => (snap.multiLine ? snap.w - 2 * TEXT : Infinity);
  const shown = v => (snap.password ? '*'.repeat(v.length) : v);
  const commit = () => api.setText(snap.id, el.value);
  const cell = (rows, index) => {   // [x, y] of the cell boundary at index
    const r = Math.max(0, rowOf(rows, index));
    return [TEXT + ui.measure(rows[r][0].slice(0, index - rows[r][1])), TEXT + r * LINE];
  };
  const draw = () => {
    paint.replaceChildren();
    if (composing) return;   // the element shows the composition itself
    const own = document.activeElement === el, v = shown(own ? el.value : snap.value), rows = layoutText(v, width(), ui.advance);
    const drawn = rows.map(([r], i) => [r, TEXT, TEXT + i * LINE]).filter(([r]) => r);   // one texture, as the game's
    if (drawn.length) ui.text(paint, drawn);
    if (own && el.selectionStart !== el.selectionEnd)
      rows.forEach(([r, i0]) => {
        const a = Math.max(el.selectionStart, i0), b = Math.min(el.selectionEnd, i0 + r.length);
        if (a >= b) return;
        const [x0, y] = cell(rows, a), h = document.createElement('i');
        h.className = 'sel';
        Object.assign(h.style, { left: x0 + 'px', top: y + 'px', width: ui.measure(v.slice(a, b)) + 'px', height: LINE + 'px' });
        paint.prepend(h);
      });
    if (own ? st.blink : snap.focused && snap.caretOn) {
      const [x, y] = own ? cell(rows, el.selectionDirection === 'backward' ? el.selectionStart : el.selectionEnd)
        : [TEXT + ui.measure([...(rows[snap.caret.line]?.[0] ?? '')].slice(0, snap.caret.col).join('')), TEXT + snap.caret.line * LINE];
      ui.sprite(paint, ui.SHEET.caret, 0, 0, 2, 16, x, y, 2, 16);
    }
  };
  const moved = () => { st.blink = true; draw(); };
  el.addEventListener('focus', () => { el.value = snap.value; api.click(snap.id); moved(); });   // the game's focus too
  el.addEventListener('blur', draw);
  el.addEventListener('input', () => { if (!composing) { commit(); moved(); } });
  el.addEventListener('compositionstart', () => { composing = true; f.classList.add('ime'); draw(); });
  el.addEventListener('compositionend', () => { composing = false; f.classList.remove('ime'); commit(); moved(); });
  el.addEventListener('keydown', e => {
    if (e.isComposing) return;
    if (e.key === 'Enter' && !snap.multiLine) {   // the game's own Enter (CWindowTaskInput: WM_CHAR '\r'; the chat sends)
      e.preventDefault();
      commit();
      entered = true;   // what the game did with it (the chat sends and empties the line) comes back in the snapshot
      api.char(13);
    } else if (e.key === 'Escape') {
      el.blur();
    } else {
      requestAnimationFrame(moved);   // arrows, Home, End: the caret moved
    }
  });
  el.addEventListener('select', draw);
  // a click or drag puts the caret / selection at cell boundaries, as the game's glyphs lay out (the element's own
  // font would put it elsewhere)
  let anchor = 0;
  const at = e => {
    const [x, y] = local(e, f), rows = layoutText(shown(el.value), width(), ui.advance);
    const [r, i0] = rows[Math.max(0, Math.min(rows.length - 1, Math.floor((y - TEXT) / LINE)))];
    return i0 + indexAt(r, x - TEXT, ui.advance);
  };
  f.addEventListener('pointerdown', e => {
    e.preventDefault();
    if (document.activeElement !== el) el.focus();
    anchor = at(e);
    el.setSelectionRange(anchor, anchor);
    f.setPointerCapture(e.pointerId);
    moved();
  });
  f.addEventListener('pointermove', e => {
    if (!f.hasPointerCapture(e.pointerId)) return;
    const i = at(e);
    el.setSelectionRange(Math.min(anchor, i), Math.max(anchor, i), i < anchor ? 'backward' : 'forward');
    moved();
  });
  f.update = c2 => {
    snap = c2;
    el.maxLength = c2.maxLen;
    if (entered || document.activeElement !== el) el.value = c2.value;   // the game's text while the DOM isn't editing
    entered = false;
    draw();
  };
  f.draw = draw;
  return f;
}

// the log's selectable text: one <div> per shown line, one cell-wide <span> per glyph, transparent over the glyphs
function fillLog(d, lines) {
  d.replaceChildren(...lines.map(s => {
    const row = document.createElement('div');
    for (const ch of s) {
      const g = document.createElement('span');
      g.textContent = ch;
      g.style.width = ui.advance(ch) + 'px';
      row.append(g);
    }
    return row;
  }));
}

const CSS = `
.htmlui-own .own { position: absolute; display: block; margin: 0; padding: 0; border: 0; background: none; }
.htmlui-own button.own { cursor: default; color: transparent; font-size: 1px; overflow: hidden; }
.htmlui-own button.own:focus-visible { outline: 1px dotted #fff; }
.htmlui-own .log { overflow: hidden; color: transparent; font: 16px/16px sans-serif; cursor: text; user-select: text; }
.htmlui-own { user-select: none; }
.htmlui-own .log > div { height: ${LINE}px; white-space: pre; }   /* in flow: a copy gets a newline per line */
.htmlui-own .log span { display: inline-block; overflow: hidden; vertical-align: top; }
.htmlui-own .log ::selection { background: rgba(51, 102, 204, .45); }
.htmlui-own .paint, .htmlui-own .paint > * { position: absolute; }
.htmlui-own .paint .sel { background: rgba(51, 102, 204, .45); }
.htmlui-own .native { position: absolute; inset: 0; width: 100%; height: 100%; margin: 0; padding: 0 0 0 ${TEXT}px; border: 0;
  background: none; opacity: 0; font: 13.75px 'DejaVu Sans', Arial, sans-serif; color: #000; outline: none; }
.htmlui-own .ime .native { opacity: 1; }
textarea.native { padding-top: ${TEXT}px !important; line-height: ${LINE}px; resize: none; }
`;

const screen = {
  classes: ['CChatWindow'],
  mode: 'owned',

  mount(win, root, api) {
    if (!document.getElementById('htmlui-own-css')) {
      const s = document.createElement('style');
      s.id = 'htmlui-own-css';
      s.textContent = CSS;
      document.head.append(s);
    }
    root.classList.add('htmlui-own');
    const vis = document.createElement('div'), own = document.createElement('div');
    root.append(vis, own);
    const st = { vis, own, drawn: new Map(), owned: new Map(), blink: true, scroll: null };
    st.timer = setInterval(() => {   // the game's blink: 15 frames on, 15 off
      st.blink = !st.blink;
      for (const o of st.owned.values()) o.draw?.();
    }, ui.BLINK_MS);
    screen.update(win, null, root, api, st);
    return st;
  },

  update(win, prev, root, api, st) {
    const seen = new Set(), order = [];
    st.scroll = win.controls.find(c => c.cls.endsWith('Scroll') && c.parent) || null;
    for (const [n, c] of win.controls.entries()) {
      seen.add(c.id);
      const isInput = /Input(Duel)?$/.test(c.cls);   // Input, MultiInput, InputDuel
      // the drawing: the input's text and caret are ours, so they don't redraw the field
      const k = key(isInput ? { ...c, value: '', caret: null, caretOn: false, focused: false } : c);
      let d = st.drawn.get(c.id);
      if (!d) { d = { el: document.createElement('div'), k: null }; d.el.className = 'ctl'; st.drawn.set(c.id, d); }
      order.push(d.el);
      if (d.k !== k) {
        d.k = k;
        d.el.replaceChildren();
        if (c.shown) api.renderControl(isInput ? { ...c, value: '', caretOn: false } : c, d.el);
      }
      // the input layer
      let o = st.owned.get(c.id);
      if (!o) {
        o = BUTTON.test(c.cls) ? ownButton(c, st.own, api)
          : c.cls.endsWith('Textlist') ? ownList(c, st.own, api)
          : c.cls.endsWith('Scroll') ? ownScroll(c, st.own, api)
          : isInput ? ownInput(c, st.own, api, st) : null;
        if (!o) continue;
        st.owned.set(c.id, o);
      }
      o.style.zIndex = n;   // stacked as drawn (the current tab over its neighbours); never moved: moving drops focus
      o.hidden = !c.shown;
      place(o, c);
      if (o.tagName === 'BUTTON') {
        o.textContent = c.label ?? '';
        o.disabled = !c.enabled;
        if ('active' in c && c.cls.endsWith('Tab')) o.setAttribute('aria-pressed', c.active);
        if (!c.label) o.setAttribute('aria-label', c.cls.includes('Expand') ? 'Taller' : c.cls.includes('Hide') ? 'Shorter' : c.name || c.cls);
      } else if (o.classList.contains('log')) {
        const lines = visibleLines(c, st.scroll?.parent === c.id ? st.scroll : null, ui.advance);
        const lk = key(lines);
        if (o.k !== lk) { o.k = lk; fillLog(o, lines); }
      } else {
        o.update?.(c);
      }
    }
    if (order.some((e, i) => st.vis.children[i] !== e)) st.vis.replaceChildren(...order);   // back to front
    for (const m of [st.drawn, st.owned])
      for (const [id, d] of m) if (!seen.has(id)) { (d.el || d).remove(); m.delete(id); }
  },

  unmount(root, st) {
    clearInterval(st.timer);
    root.replaceChildren();
  },
};
export default screen;
