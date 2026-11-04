// The chat window (CChatWindow : CWindowModelChatWindow, src/System/window/yo2WindowChat.cpp), owned by the DOM.
// Its tabs come from the game: All Chat | Duel Log | Proximity Chat | TRADE | Team (the Duel Log tab is ovr/duellog.c's,
// shown on the duel screen only); chatTabs shows them as the owner wants (no Duel Log, no Proximity Chat, 'Trade',
// unread counts).
// Online only (owner): out of the online world (the title, Free Duel, the title's Deck Editor: read/chat.js online)
// nothing of the chat is drawn, and the engine's chat is folded to its collapsed bar (fold) so its rect stays small.
// - Drawing: each control redrawn only when its snapshot changes; the generic renderers (api.renderControl) for the
//   log (real DOM text, selectable here) and the input's field; controls/skin.js (CSS) for the rest.
// - Input: tabs and the taller / shorter icons are real <button>s (CSS skin, the label text) that click the
//   game's control; the input line is a real, visible <input> (typing, IME, paste, selection, copy) that commits
//   through the control's setText, Enter as the game's own WM_CHAR '\r'; the wheel and the scroll bar scroll the log.
const ui = await import('../../ui.js').catch(() => null);   // null under node (the unit test needs no DOM)
const basic = ui && await import('../controls/basic.js');
const skin = ui && await import('../controls/skin.js');
const scroll = ui && await import('../controls/scroll.js');

// --- The chat's controls, CSS (controls/skin.js, the owner's Skin rule: crisp at any scale, colours sampled from the
// game's art): the bar, the frame, the back plane, the tabs, the taller / shorter icons and the scroll bar.
const ICON = { IconExpand: ['expand', 'Taller'], IconHide: ['hide', 'Shorter'] };
const DRAW = {
  Iconbar: (el, c) => skin.iconbar(el, c),
  BackPlane: (el, c) => skin.plane(el, c),
  ThinChop: (el, c) => skin.chop(el, c),
  Textlist: () => {},   // the log is ownList's
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
  if (/(^|[^i])Input(Duel)?$/.test(fam)) return api.renderControl(c, el, { noText: true });   // the text is ownInput's
  if (ICON[fam]) return DRAW.Icon(el, c, api, ICON[fam]);
  return DRAW[fam] ? DRAW[fam](el, c, api) : api.renderControl(c, el);
}

const key = c => JSON.stringify(c);

// A lone scroll bar (one no list owns: the profile's rows) as a native box over its rect (owner: native scroll bars
// everywhere; bridge.js's scrollbars.js does the same for windows no screen owns): the box's content stands for the
// bar's range (page lines in view of max + page), scrolling it sets the bar's value through the game's setValue, and
// the game moving its value moves the box.
function ownScroll(c, layer, api) {
  scroll.inject();
  const el = document.createElement('div'), inner = document.createElement('div');
  el.className = 'own yo2-scroll-list';
  el.append(inner);
  layer.append(el);
  let bar = c, at = -1;
  const range = () => el.scrollHeight - el.clientHeight;
  el.addEventListener('scroll', () => {
    const r = range(), v = r > 0 ? Math.round(el.scrollTop / r * bar.max) : 0;
    if (v !== at) { at = v; api.setValue(bar.id, v); }
  }, { passive: true });
  el.update = c2 => {
    bar = c2;
    Object.assign(el.style, { left: c2.x + 'px', top: c2.y + 'px', width: c2.w + 'px', height: c2.length + 'px' });
    inner.style.height = c2.length * (c2.max + Math.max(1, c2.page)) / Math.max(1, c2.page) + 'px';
    if (c2.value !== at) { at = c2.value; el.scrollTop = c2.max ? c2.value / c2.max * range() : 0; }
  };
  return el;
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
  let snap = c, entered = null;   // the line Enter sent, until the game's text moves off it
  const commit = () => api.setText(snap.id, el.value);
  el.addEventListener('focus', () => { el.value = snap.value; api.click(snap.id); });   // the game's focus too
  el.addEventListener('input', e => { entered = null; if (!e.isComposing) commit(); });
  el.addEventListener('compositionend', commit);
  el.addEventListener('keydown', e => {
    if (e.isComposing) return;
    if (e.key === 'Enter' && !snap.multiLine) {   // the game's own Enter (CWindowTaskInput: WM_CHAR '\r'; the chat sends)
      e.preventDefault();
      commit();
      entered = el.value;   // what the game does with it (the chat sends and empties the line) comes back in a snapshot
      api.char(13);
    } else if (e.key === 'Escape') {
      el.blur();
    }
  });
  el.update = c2 => {
    snap = c2;
    el.maxLength = c2.maxLen;
    // the game's text while the DOM isn't editing, or once it has done something with the line Enter sent (the
    // setText and the Enter play a frame apart: the first snapshot after Enter can still hold the line)
    if (document.activeElement !== el || (entered !== null && c2.value !== entered)) { el.value = c2.value; entered = null; }
    Object.assign(el.style, { left: c2.x + 8 + 'px', top: c2.y + 8 + 'px', width: c2.w - 16 + 'px', height: c2.h - 16 + 'px' });
  };
  return el;
}

// the log: the generic list's DOM text, selectable; the wheel over it scrolls the game's list
// A list (the chat log, a name list) as a native scroller (owner: "use native HTML scrollers"; CONTRACT.md
// "Scrolling"): every item one block of Arial text that wraps by words (a long word or URL breaks only where it must);
// a log (stick) stays at the bottom while the player is there, never when they scrolled up. New items are appended
// and dropped ones removed, so a selection in the rest survives a new line. The game's scroll bar is not drawn and its
// list position doesn't matter (every item is here).
export function itemsDelta(old, now) {   // [rows to drop at the top, items to append], or null: rebuild
  for (let d = 0; d <= old.length; d++) {
    const keep = old.length - d;
    if (keep <= now.length && old.slice(d).every((s, i) => s === now[i])) return [d, now.slice(keep)];
  }
  return null;
}
function ownList(c, layer, { stick = false, stripes = false } = {}) {
  const el = document.createElement('div');
  scroll.inject();   // every native scroll bar looks alike (controls/scroll.js's rule)
  el.className = 'own list yo2-scroll-list' + (stripes ? ' yo2-stripes' : '');
  el.setAttribute('role', stick ? 'log' : 'list');
  layer.append(el);
  let shown = [];
  const row = s => {
    const r = document.createElement('div');
    r.className = 'row';
    r.textContent = s;
    r.style.letterSpacing = basic.spacing(s) + 'px';
    return r;
  };
  el.update = c2 => {
    Object.assign(el.style, { left: c2.x + 'px', top: c2.y + 'px', width: c2.w + 'px', height: c2.h + 'px' });
    const items = (c2.items || []).map(basic.untag), delta = itemsDelta(shown, items);
    if (delta && !delta[0] && !delta[1].length) return;
    const bottom = el.scrollHeight - el.scrollTop - el.clientHeight < 2;
    if (delta) {
      for (let k = 0; k < delta[0]; k++) el.firstChild?.remove();
      el.append(...delta[1].map(row));
    } else {
      el.replaceChildren(...items.map(row));
    }
    shown = items;
    if (stick && bottom) el.scrollTop = el.scrollHeight;
  };
  return el;
}

const CSS = () => `
.htmlui-own { user-select: none; }
.htmlui-own .own { position: absolute; display: block; margin: 0; padding: 0; border: 0; }
.htmlui-own button:focus-visible { outline: 1px dotted #fff; outline-offset: -2px; }
.htmlui-own .list { font: ${basic.fontCss()}; color: #000; user-select: text; cursor: text; }
.htmlui-own .list.yo2-stripes { background-attachment: local; }
.htmlui-own .list > .row { white-space: pre-wrap; word-break: normal; overflow-wrap: anywhere; }
.htmlui-own .chat-in { font: ${basic.fontCss()}; color: #000; background: none; outline: none; resize: none; overflow: hidden; }
`;

// An owned window's screen module (social.js's too): each control redrawn by draw(c, el, api, win) when its snapshot
// changes; lists, a lone scroll bar and inputs owned (ownList: native scrollers, ownScroll, ownInput);
// background(win, el), if given, draws what the window itself draws under its controls (its own picture)
// The chat's tabs as the owner wants them (CChatWindow): the Duel Log tab left out (owner: of no use; ovr/duellog.c adds
// it on the duel screen until the runtime drops it), and Proximity Chat too (the server has no proximity channel: a
// line sent there goes to Global, server/src/game/chat.ts; ovr/chatfree.c hides the tab in a runtime built with it),
// the game's all-capitals names in plain case ('TRADE' -> 'Trade'), and a tab whose log had lines while another was
// shown says how many until it is opened: 'Trade (2)'. A tab
// grows by its new text (the game's metrics) and the tabs after it move along, 8 px over each other as the game lays
// them (yo2WindowChat.cpp layout). Each tab's log is the reader's pair (read/chat.js), else the logs in tab order.
const unread = new Map();   // window id -> { seen: log id -> its items, n: tab id -> lines unread }. ponytail: never
                            // pruned (a chat window or two a scene)
const plainCase = s => s === s.toUpperCase() && /[A-Z]{3}/.test(s) ? s.toLowerCase().replace(/\b\w/g, m => m.toUpperCase()) : s;
const textW = s => basic ? basic.textWidth(s) + basic.spacing(s) * ([...s].length - 1) : 7 * s.length;
export function chatTabs(win) {
  const byId = new Map(win.controls.map(c => [c.id, c])), logs = win.controls.filter(c => c.cls === 'CWindowTaskTextlist');
  if (!unread.has(win.id)) unread.set(win.id, { seen: new Map(), n: new Map() });
  const st = unread.get(win.id), out = new Map();
  let shift = 0;
  win.controls.filter(c => c.cls === 'CWindowTaskTab').sort((a, b) => a.x - b.x).forEach((t, i) => {
    const pair = win.pairs?.find(p => p.tab === t.id), log = pair ? byId.get(pair.log) : logs[i];
    if (log) {
      const items = log.items || [], old = st.seen.get(log.id), d = old && itemsDelta(old, items);
      st.seen.set(log.id, items);
      st.n.set(t.id, t.active ? 0 : (st.n.get(t.id) || 0) + (d ? d[1].length : 0));
    }
    const name = (t.label || '').replace(/[@＠]\d/g, '').trim();
    if (/^(duel log|proximity chat)$/i.test(name)) { if (t.shown) shift -= t.w - 8; out.set(t.id, null); return; }
    const n = st.n.get(t.id) || 0, label = plainCase(name) + (n ? ` (${n > 99 ? '99+' : n})` : '');
    const grow = label === name ? 0 : Math.ceil(textW(label) - textW(name));
    if (label !== t.label || shift || grow) out.set(t.id, { ...t, x: t.x + shift, w: t.w + grow, label });
    if (t.shown) shift += grow;
  });
  return out.size ? { ...win, controls: win.controls.map(c => out.has(c.id) ? out.get(c.id) : c).filter(Boolean) } : win;
}

// The engine's chat folded to its collapsed bar (mode 2), one press per snapshot: short -> tall by △, tall -> collapsed
// by ▽ (a chat without its tab row: short -> collapsed by ▽, its △ off). The pointer goes to the icon bar first: a press
// where the pointer already was is ignored by the engine.
function fold(win, api, st) {
  if (st.folding || win.mode == null || win.mode === 2) return;
  const icon = cls => win.controls.find(c => c.cls === cls && c.enabled !== false);
  const c = win.mode === 0 ? icon('CWindowTaskIconHide') : icon('CWindowTaskIconExpand') || icon('CWindowTaskIconHide');
  const bar = win.controls.find(k => k.cls === 'CWindowTaskIconbar');
  if (!c) return;
  st.folding = true;
  if (bar) api.hover(bar.id);
  setTimeout(async () => { await api.click(c.id); setTimeout(() => { st.folding = false; }, 300); }, 200);
}

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
      if (win.cls === 'CChatWindow') {
        win = chatTabs(win);
        st.vis.hidden = st.own.hidden = win.online === false;
        if (win.online === false && win.world !== false) fold(win, api, st);   // never pressed during the sign-in
      }
      const seen = new Set(), order = [];
      const byId = new Map(win.controls.map(k => [k.id, k]));
      for (let [n, c] of win.controls.entries()) {
        // a part its parent draws (a caption, a list's text, stripes or scroll bar: the native scroller's); but a
        // MultiInput's Input is the field itself, at the MultiInput's place
        const up = byId.get(c.parent);
        if (up?.cls.endsWith('MultiInput') && c.cls.endsWith('Input')) c = { ...c, x: c.x + up.x, y: c.y + up.y, inMulti: true };
        else if (c.parent) continue;
        seen.add(c.id);
        const isInput = /(^|[^i])Input(Duel)?$/.test(c.cls);   // Input, InputDuel (a MultiInput holds one)
        // an input reported wider than its window (the mail form's Subject: 496 from x 73) ends inside the frame, as drawn
        if (isInput && c.x + c.w > win.w) c = { ...c, w: win.w - 16 - c.x };
        // the drawing: the input's text is ownInput's, so it doesn't redraw the field
        const k = key(isInput ? { ...c, value: '', caret: null, caretOn: false, focused: false } : c);
        let d = st.drawn.get(c.id);
        if (!d) {
          d = { el: document.createElement('div'), k: null };
          d.el.className = 'ctl';
          st.drawn.set(c.id, d);
        }
        order.push(d.el);
        if (d.k !== k) {
          d.k = k;
          const focused = d.el.contains(document.activeElement);   // a tab pressed from the keyboard keeps the focus
          d.el.replaceChildren();
          if (c.shown && !c.inMulti) draw(c, d.el, api, win);   // a MultiInput's field is its window's picture (white)
          if (focused) d.el.querySelector('button')?.focus();
        }
        // the input layer: the scroll bar, the input line
        let o = st.owned.get(c.id);
        if (!o) {
          o = c.cls.endsWith('Textlist') ? ownList(c, st.own, { stick: true }) : /Listbox$/.test(c.cls) ? ownList(c, st.own, { stripes: true })
            : c.cls.endsWith('Scroll') ? ownScroll(c, st.own, api) : isInput ? ownInput(c, st.own, api) : null;
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
