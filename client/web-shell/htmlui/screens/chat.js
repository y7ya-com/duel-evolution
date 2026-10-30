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

// The input line: a real <input> (never painted, except the IME's composition), the field drawn by the generic
// renderer, its text/caret/selection drawn here while the DOM has the focus (the game's own while it doesn't).
function ownInput(c, layer, api, st) {
  const f = document.createElement('div'), paint = document.createElement('div'), el = document.createElement('input');
  f.className = 'own';
  paint.className = 'paint';
  el.className = 'native';
  Object.assign(el, { type: 'text', spellcheck: false, autocomplete: 'off', maxLength: c.maxLen });
  el.setAttribute('aria-label', 'Chat');
  f.append(paint, el);
  // the keys are the <input>'s: none reaches the canvas's handlers (the game would get every key twice)
  for (const t of ['keydown', 'keyup', 'keypress']) el.addEventListener(t, e => e.stopPropagation());
  layer.append(f);
  let snap = c, composing = false;
  const commit = () => api.setText(snap.id, el.value);
  const draw = () => {
    paint.replaceChildren();
    const own = document.activeElement === el;
    if (composing) return;   // the <input> shows the composition itself
    const v = own ? el.value : snap.value;
    if (v) ui.text(paint, [[v, TEXT, TEXT]]);
    if (own && el.selectionStart !== el.selectionEnd) {
      const a = ui.measure(v.slice(0, el.selectionStart)), b = ui.measure(v.slice(0, el.selectionEnd)), h = document.createElement('i');
      h.className = 'sel';
      Object.assign(h.style, { left: TEXT + a + 'px', top: TEXT + 'px', width: b - a + 'px', height: '16px' });
      paint.prepend(h);
    }
    const caretOn = own ? st.blink : snap.focused && snap.caretOn;
    if (caretOn) {
      const x = own ? ui.measure(v.slice(0, el.selectionDirection === 'backward' ? el.selectionStart : el.selectionEnd)) : ui.measure([...v].slice(0, snap.caret.col).join(''));
      ui.sprite(paint, ui.SHEET.caret, 0, 0, 2, 16, TEXT + x, TEXT, 2, 16);
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
    if (e.key === 'Enter') {   // send: the game's own Enter (CWindowTaskInput: WM_CHAR '\r' with submitOnEnter_)
      e.preventDefault();
      commit();
      api.char(13);
      el.value = '';
      moved();
    } else if (e.key === 'Escape') {
      el.blur();
    } else {
      requestAnimationFrame(moved);   // arrows, Home, End: the caret moved
    }
  });
  el.addEventListener('select', draw);
  // a click or drag puts the caret / selection at cell boundaries, as the game's glyphs lay out (the <input>'s own
  // font would put it elsewhere)
  let anchor = 0;
  const at = e => indexAt(el.value, local(e, f)[0] - TEXT, ui.advance);
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
    if (document.activeElement !== el) el.value = c2.value;   // the game's text while the DOM isn't editing
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
.chat .own { position: absolute; display: block; margin: 0; padding: 0; border: 0; background: none; }
.chat button.own { cursor: default; color: transparent; font-size: 1px; overflow: hidden; }
.chat button.own:focus-visible { outline: 1px dotted #fff; }
.chat .log { overflow: hidden; color: transparent; font: 16px/16px sans-serif; cursor: text; user-select: text; }
.chat { user-select: none; }
.chat .log > div { height: ${LINE}px; white-space: pre; }   /* in flow: a copy gets a newline per line */
.chat .log span { display: inline-block; overflow: hidden; vertical-align: top; }
.chat .log ::selection { background: rgba(51, 102, 204, .45); }
.chat .paint, .chat .paint > * { position: absolute; }
.chat .paint .sel { background: rgba(51, 102, 204, .45); }
.chat .native { position: absolute; inset: 0; width: 100%; height: 100%; margin: 0; padding: 0 0 0 ${TEXT}px; border: 0;
  background: none; opacity: 0; font: 13.75px 'DejaVu Sans', Arial, sans-serif; color: #000; outline: none; }
.chat .ime .native { opacity: 1; }
`;

const screen = {
  classes: ['CChatWindow'],
  mode: 'owned',

  mount(win, root, api) {
    if (!document.getElementById('htmlui-chat-css')) {
      const s = document.createElement('style');
      s.id = 'htmlui-chat-css';
      s.textContent = CSS;
      document.head.append(s);
    }
    root.classList.add('chat');
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
    const seen = new Set();
    st.scroll = win.controls.find(c => c.cls.endsWith('Scroll') && c.parent) || null;
    for (const c of win.controls) {
      seen.add(c.id);
      const isInput = c.cls.endsWith('Input');
      // the drawing: the input's text and caret are ours, so they don't redraw the field
      const k = key(isInput ? { ...c, value: '', caret: null, caretOn: false, focused: false } : c);
      let d = st.drawn.get(c.id);
      if (!d) { d = { el: document.createElement('div'), k: null }; d.el.className = 'ctl'; st.drawn.set(c.id, d); }
      st.vis.append(d.el);   // back to front: snapshot order
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
      st.own.append(o);
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
    for (const m of [st.drawn, st.owned])
      for (const [id, d] of m) if (!seen.has(id)) { (d.el || d).remove(); m.delete(id); }
  },

  unmount(root, st) {
    clearInterval(st.timer);
    root.replaceChildren();
  },
};
export default screen;
