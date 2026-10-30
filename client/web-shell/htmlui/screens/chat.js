// The chat window (CChatWindow : CWindowModelChatWindow, src/System/window/yo2WindowChat.cpp), owned by the DOM.
// Its tabs come from the game: All Chat | Duel Log | Proximity Chat | TRADE | Team (the Duel Log tab is ovr/duellog.c's,
// shown on the duel screen only; the server's channel-9 lines land in its list), so nothing here knows tab names.
// - Drawing: each control redrawn only when its snapshot changes; the generic renderers (api.renderControl) for the
//   log (real DOM text, selectable here) and the input's field; controls/skin.js (CSS) for the rest.
// - Input: tabs and the taller / shorter icons are real <button>s (CSS skin, the label text) that click the
//   game's control; the input line is a real, visible <input> (typing, IME, paste, selection, copy) that commits
//   through the control's setText, Enter as the game's own WM_CHAR '\r'; the wheel and the scroll bar scroll the log.
const ui = await import('../../ui.js').catch(() => null);   // null under node (the unit test needs no DOM)
const basic = ui && await import('../controls/basic.js');
const skin = ui && await import('../controls/skin.js');

const ARROW = 16;    // the scroll bar's arrows (CWindowTaskScroll::loadImages)

// A press at y (bar-local) on a scroll bar: -1 up (the up arrow, the track above the thumb), 1 down, 0 on the thumb.
export function scrollDir(bar, y) {
  const top = ARROW + bar.thumb.pos;
  return y < top ? -1 : y >= top + bar.thumb.len ? 1 : 0;
}

// --- The chat's controls, CSS (controls/skin.js, the owner's Skin rule: crisp at any scale, colours sampled from the
// game's art): the bar, the frame, the back plane, the tabs, the taller / shorter icons and the scroll bar.
const ICON = { IconExpand: ['expand', 'Taller'], IconHide: ['hide', 'Shorter'] };
const DRAW = {
  Iconbar: (el, c) => skin.iconbar(el, c),
  BackPlane: (el, c) => skin.plane(el, c),
  ThinChop: (el, c) => skin.chop(el, c),
  Scroll: (el, c) => skin.scrollbar(el, { x: c.x, y: c.y, length: c.length, pos: c.thumb.pos, len: c.thumb.len }),
  Tab(el, c, api) {
    const b = skin.tab(el, { x: c.x, y: c.y, w: c.w, label: c.label, active: c.active });
    b.disabled = !c.enabled;
    b.addEventListener('click', () => api.click(c.id));
  },
  Icon(el, c, api, [kind, label]) {
    const b = skin.icon(el, { x: c.x, y: c.y, kind, label, state: c.pressed ? 'pressed' : null });
    b.disabled = !c.enabled;
    b.addEventListener('click', () => api.click(c.id));
  },
};
function drawControl(c, el, api) {
  const fam = c.cls.replace(/^CWindowTask/, '');
  if (/Input(Duel)?$/.test(fam)) return api.renderControl(c, el, { noText: true });   // the text is ownInput's
  if (ICON[fam]) return DRAW.Icon(el, c, api, ICON[fam]);
  return DRAW[fam] ? DRAW[fam](el, c, api) : api.renderControl(c, el);
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
  el.className = 'own chat-in';   // (not .native: the bridge keeps those transparent)
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
.htmlui-own button:focus-visible { outline: 1px dotted #fff; outline-offset: -2px; }
.htmlui-own .log .txt { user-select: text; cursor: text; }
.htmlui-own .chat-in { font: ${basic.fontCss()}; color: #000; outline: none; resize: none; overflow: hidden; }
`;

// An owned window's screen module (social.js's too): each control redrawn by draw(c, el, api, win) when its snapshot
// changes, the scroll bars and inputs owned (ownScroll, ownInput), a list's text made selectable (ownLog);
// background(win, el), if given, draws what the window itself draws under its controls (its own picture)
export function owned(classes, draw, background) {
  const screen = {
    classes,
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
      if (background) { const bg = document.createElement('div'); background(win, bg); root.append(bg); }
      root.append(vis, own);
      const st = { vis, own, drawn: new Map(), owned: new Map() };
      screen.update(win, null, root, api, st);
      return st;
    },

    update(win, prev, root, api, st) {
      const seen = new Set(), order = [];
      for (const [n, c] of win.controls.entries()) {
        // a part its parent draws (a caption, a list's text or stripes); a list's scroll bar stays ours
        if (c.parent && !c.cls.endsWith('Scroll')) continue;
        seen.add(c.id);
        const isInput = /Input(Duel)?$/.test(c.cls);   // Input, MultiInput, InputDuel
        // the drawing: the input's text is ownInput's, so it doesn't redraw the field
        const k = key(isInput ? { ...c, value: '', caret: null, caretOn: false, focused: false } : c);
        let d = st.drawn.get(c.id);
        if (!d) {
          d = { el: document.createElement('div'), k: null };
          d.el.className = 'ctl';
          if (/Textlist|Listbox$/.test(c.cls)) ownLog(d.el, c, api);
          st.drawn.set(c.id, d);
        }
        order.push(d.el);
        if (d.k !== k) {
          d.k = k;
          const focused = d.el.contains(document.activeElement);   // a tab pressed from the keyboard keeps the focus
          d.el.replaceChildren();
          if (c.shown) draw(c, d.el, api, win);
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
  return screen;
}
export default owned(['CChatWindow'], drawControl);
