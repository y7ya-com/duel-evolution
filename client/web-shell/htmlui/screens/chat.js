// The chat window (CChatWindow : CWindowModelChatWindow, src/System/window/yo2WindowChat.cpp), owned by the DOM.
// Its tabs come from the game: All Chat | Duel Log | Proximity Chat | TRADE | Team (the Duel Log tab is ovr/duellog.c's,
// shown on the duel screen only; the server's channel-9 lines land in its list), so nothing here knows tab names.
// - Drawing: each control redrawn only when its snapshot changes; the generic renderers (api.renderControl) for the
//   log (real DOM text, selectable here) and the input's field, this file's for the rest (until controls/ has them).
// - Input: tabs and the taller / shorter icons are real <button>s (the art inside, the label text) that click the
//   game's control; the input line is a real, visible <input> (typing, IME, paste, selection, copy) that commits
//   through the control's setText, Enter as the game's own WM_CHAR '\r'; the wheel and the scroll bar scroll the log.
const ui = await import('../../ui.js').catch(() => null);   // null under node (the unit test needs no DOM)
const basic = ui && await import('../controls/basic.js');

const ARROW = 16;    // the scroll bar's arrows (CWindowTaskScroll::loadImages)

// A press at y (bar-local) on a scroll bar: -1 up (the up arrow, the track above the thumb), 1 down, 0 on the thumb.
export function scrollDir(bar, y) {
  const top = ARROW + bar.thumb.pos;
  return y < top ? -1 : y >= top + bar.thumb.len ? 1 : 0;
}

// --- The chat's controls, drawn as the game draws them (src/System/window/yo2WindowControls.cpp); not in controls/
// yet (htmlui-bridge promotes them). Their atlases join ui.js's sheets, so the bridge's loadGlyphs (which runs after
// the screens are imported) loads them with the rest. ponytail: a page that loaded the glyphs before importing this
// gets no art for these (the warning says so).
const ART = { iconbar: ['iconbar_01_c01.png', 72, 24], tab: ['tab_01_c01.png', 64, 24], icon: ['icon_01_c01.png', 48, 96],
  scroll: ['scroll_01_c00.png', 64, 120] };
if (ui) for (const [k, [f, w, h]] of Object.entries(ART)) ui.SHEET[k] ??= { url: 'assets/' + f, w, h };
const A70 = 178 / 255;   // setAlpha(0.7f): the frames' vertex alpha
const ICON = { IconShow: [0, 'Show'], IconHide: [24, 'Shorter'], IconExpand: [48, 'Taller'], IconShrink: [72, 'Shrink'] };   // rows in icon_01_c01
const TAB_TEXT = [[0.2, 0.2, 1, 1], [0.5, 0.5, 0.5, 1]];   // CWindowTaskTab::setLook: current, not (on black glyphs)

// a real <button> over the control's rect that clicks it in the game (the owner's rule: its art inside, its label text)
function button(el, c, api, label) {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = 'btn';
  Object.assign(b.style, { left: c.x + 'px', top: c.y + 'px', width: c.w + 'px', height: c.h + 'px' });
  b.disabled = !c.enabled;
  b.setAttribute('aria-label', label);
  b.addEventListener('click', () => api.click(c.id));
  el.append(b);
  return b;
}

const DRAW = {
  // three pieces of iconbar_01_c01 (lit at u 0, dimmed at 48), 70 %
  Iconbar(el, c) {
    const S = ui.SHEET.iconbar, u = c.active === false ? 48 : 0;
    ui.sprite(el, S, u, 0, 8, 24, c.x, c.y, 8, 24, A70);
    ui.sprite(el, S, u + 8, 0, 8, 24, c.x + 8, c.y, c.w - 16, 24, A70);
    ui.sprite(el, S, u + 16, 0, 8, 24, c.x + c.w - 8, c.y, 8, 24, A70);
  },
  // the frame without its top edge: sides, bottom corners and bottom edge of window_base_01_c01, 70 %
  ThinChop(el, c) {
    const S = ui.SHEET.window, { x, y, w, h } = c;
    ui.sprite(el, S, 0, 8, 8, 8, x, y, 8, h - 8, A70);
    ui.sprite(el, S, 16, 8, 8, 8, x + w - 8, y, 8, h - 8, A70);
    ui.sprite(el, S, 0, 16, 8, 8, x, y + h - 8, 8, 8, A70);
    ui.sprite(el, S, 8, 16, 8, 8, x + 8, y + h - 8, w - 16, 8, A70);
    ui.sprite(el, S, 16, 16, 8, 8, x + w - 8, y + h - 8, 8, 8, A70);
  },
  // the frame's middle piece over the whole rect, 70 %
  BackPlane(el, c) { ui.sprite(el, ui.SHEET.window, 8, 8, 8, 8, c.x, c.y, c.w, c.h, A70); },
  // left 16, middle stretched, right 8 of tab_01_c01 (current at u 0, others at 32); the caption at (16, 4)
  Tab(el, c, api) {
    const S = ui.SHEET.tab, u = c.active ? 0 : 32, b = button(el, c, api, c.label || 'Tab');
    b.setAttribute('aria-pressed', !!c.active);
    ui.sprite(b, S, u, 0, 16, 24, 0, 0, 16, 24);
    ui.sprite(b, S, u + 16, 0, 8, 24, 16, 0, c.w - 24, 24);
    ui.sprite(b, S, u + 24, 0, 8, 24, c.w - 8, 0, 8, 24);
    if (c.label) basic.textBox(b, c.label, { x: 16, y: 4, color: TAB_TEXT[c.active ? 0 : 1] });
  },
  // a 16 x 24 cell of icon_01_c01: normal, hover, pressed side by side
  Icon(el, c, api, [row, label]) {
    const b = button(el, c, api, label), sp = ui.sprite(b, ui.SHEET.icon, c.pressed ? 32 : 0, row, 16, 24, 0, 0, 16, 24);
    const look = n => () => { if (!c.pressed) sp.src(n, row); };
    b.addEventListener('pointerenter', look(16));
    b.addEventListener('pointerleave', look(0));
  },
  // arrows 16 x 16 at the ends, the thumb (top, middle stretched, bottom) at its position, the track stretched
  Scroll(el, c) {
    const S = ui.SHEET.scroll, { x, y } = c, L = c.thumb.len, p = c.thumb.pos;
    ui.sprite(el, S, 48, 0, 16, 16, x, y, 16, c.length);
    ui.sprite(el, S, 0, 0, 16, 16, x, y, 16, 16);
    ui.sprite(el, S, 0, 16, 16, 16, x, y + c.length - 16, 16, 16);
    ui.sprite(el, S, 0, 32, 16, 8, x, y + 16 + p, 16, 8);
    ui.sprite(el, S, 0, 40, 16, 8, x, y + 24 + p, 16, L - 16);
    ui.sprite(el, S, 0, 48, 16, 8, x, y + 8 + L + p, 16, 8);
  },
};
const warned = new Set();
function drawControl(c, el, api) {
  const fam = c.cls.replace(/^CWindowTask/, '');
  if (/Input(Duel)?$/.test(fam)) return api.renderControl(c, el, { noText: true });   // the text is ownInput's
  if (!DRAW[fam] && !ICON[fam]) return api.renderControl(c, el);
  const sheet = { Iconbar: 'iconbar', Tab: 'tab', Scroll: 'scroll' }[fam] || (ICON[fam] ? 'icon' : 'window');
  if (!ui.SHEET[sheet].alpha) {   // its atlas never loaded
    if (!warned.has(sheet)) { warned.add(sheet); console.warn('htmlui chat: no art for', sheet); }
    return;
  }
  return ICON[fam] ? DRAW.Icon(el, c, api, ICON[fam]) : DRAW[fam](el, c, api);
}

const key = c => JSON.stringify(c);
// a pointer's y in an element's own game pixels (the bridge scales the layer)
const localY = (e, el) => { const r = el.getBoundingClientRect(); return (e.clientY - r.top) * el.offsetHeight / r.height; };

// The scroll bar: a press above or below the thumb (or on an arrow) scrolls the log as the wheel does, max / 10 + 1
// lines. ponytail: no arrow-sized steps, no thumb drag, until api.scroll is wired.
function ownScroll(c, layer, api) {
  const d = document.createElement('div');
  d.className = 'own';
  let bar = c;
  d.addEventListener('pointerdown', e => {
    e.preventDefault();
    const dir = scrollDir(bar, localY(e, d));
    if (dir) api.wheel(bar.parent || bar.id, dir * 120);
  });
  d.update = c2 => {
    bar = c2;
    Object.assign(d.style, { left: c2.x + 'px', top: c2.y + 'px', width: c2.w + 'px', height: c2.h + 'px' });
  };
  layer.append(d);
  return d;
}

// An input: a real <input> (<textarea> for a multi-line one) where the game draws its text (8 in), over the field
// the generic renderer draws. It shows the game's text until it has the focus, then its own (the game gets every
// edit through setText). Its keys stop at the window's root (bridge.js): the game doesn't get them twice.
function ownInput(c, layer, api) {
  const el = document.createElement(c.multiLine ? 'textarea' : 'input');
  el.className = 'own native';
  Object.assign(el, { spellcheck: false, autocomplete: c.password ? 'current-password' : 'off', maxLength: c.maxLen });
  if (!c.multiLine) el.type = c.password ? 'password' : 'text';
  el.setAttribute('aria-label', c.name || 'Text');
  layer.append(el);
  let snap = c, entered = false;
  const commit = () => api.setText(snap.id, el.value);
  el.addEventListener('focus', () => { el.value = snap.value; api.click(snap.id); });   // the game's focus too
  el.addEventListener('input', e => { if (!e.isComposing) commit(); });
  el.addEventListener('compositionend', commit);
  el.addEventListener('keydown', e => {
    if (e.isComposing) return;
    if (e.key === 'Enter' && !snap.multiLine) {   // the game's own Enter (CWindowTaskInput: WM_CHAR '\r'; the chat sends)
      e.preventDefault();
      commit();
      entered = true;   // what the game did with it (the chat sends and empties the line) comes back in the snapshot
      api.char(13);
    } else if (e.key === 'Escape') {
      el.blur();
    }
  });
  el.update = c2 => {
    snap = c2;
    el.maxLength = c2.maxLen;
    if (entered || document.activeElement !== el) el.value = c2.value;   // the game's text while the DOM isn't editing
    entered = false;
    Object.assign(el.style, { left: c2.x + 8 + 'px', top: c2.y + 8 + 'px', width: c2.w - 16 + 'px', height: c2.h - 16 + 'px' });
  };
  return el;
}

// the log: the generic list's DOM text, selectable; the wheel over it scrolls the game's list
function ownLog(d, c, api) {
  d.classList.add('log');
  d.setAttribute('role', 'log');
  d.addEventListener('wheel', e => {
    e.preventDefault();
    if (e.deltaY) api.wheel(c.id, Math.sign(e.deltaY) * 120);   // a canvas wheel event over the list (DOM sign)
  }, { passive: false });
}

const CSS = () => `
.htmlui-own { user-select: none; }
.htmlui-own .own { position: absolute; display: block; margin: 0; padding: 0; border: 0; background: none; }
.htmlui-own button.btn { position: absolute; cursor: default; }
.htmlui-own button.btn:focus-visible { outline: 1px dotted #fff; outline-offset: -2px; }
.htmlui-own .log .txt { user-select: text; cursor: text; }
.htmlui-own .native { font: ${basic.fontCss()}; color: #000; outline: none; resize: none; overflow: hidden; }
`;

const screen = {
  classes: ['CChatWindow'],
  mode: 'owned',

  mount(win, root, api) {
    if (!document.getElementById('htmlui-own-css')) {
      const s = document.createElement('style');
      s.id = 'htmlui-own-css';
      s.textContent = CSS();
      document.head.append(s);
    }
    root.classList.add('htmlui-own');
    const vis = document.createElement('div'), own = document.createElement('div');
    root.append(vis, own);
    const st = { vis, own, drawn: new Map(), owned: new Map() };
    screen.update(win, null, root, api, st);
    return st;
  },

  update(win, prev, root, api, st) {
    const seen = new Set(), order = [];
    for (const [n, c] of win.controls.entries()) {
      seen.add(c.id);
      const isInput = /Input(Duel)?$/.test(c.cls);   // Input, MultiInput, InputDuel
      // the drawing: the input's text is ownInput's, so it doesn't redraw the field
      const k = key(isInput ? { ...c, value: '', caret: null, caretOn: false, focused: false } : c);
      let d = st.drawn.get(c.id);
      if (!d) {
        d = { el: document.createElement('div'), k: null };
        d.el.className = 'ctl';
        if (c.cls.endsWith('Textlist')) ownLog(d.el, c, api);
        st.drawn.set(c.id, d);
      }
      order.push(d.el);
      if (d.k !== k) {
        d.k = k;
        const focused = d.el.contains(document.activeElement);   // a tab pressed from the keyboard keeps the focus
        d.el.replaceChildren();
        if (c.shown) drawControl(c, d.el, api);
        if (focused) d.el.querySelector('button')?.focus();
      }
      // the input layer: the scroll bar, the input line
      let o = st.owned.get(c.id);
      if (!o) {
        o = c.cls.endsWith('Scroll') ? ownScroll(c, st.own, api) : isInput ? ownInput(c, st.own, api) : null;
        if (!o) continue;
        st.owned.set(c.id, o);
      }
      o.style.zIndex = n;   // stacked as drawn; never moved (moving drops focus)
      o.style.display = c.shown ? '' : 'none';   // (the hidden attribute loses to .own's display)
      o.update(c);
    }
    if (order.some((e, i) => st.vis.children[i] !== e)) st.vis.replaceChildren(...order);   // back to front
    for (const m of [st.drawn, st.owned])
      for (const [id, d] of m) if (!seen.has(id)) { (d.el || d).remove(); m.delete(id); }
  },

  unmount(root) {
    root.replaceChildren();
  },
};
export default screen;
