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
import { rowRuns } from './playerlist.js';
// - Duels (duelsView, duelsTab, DuelsPanel): a tab of the DOM's own after the game's, drawn as theirs, that isn't a
//   chat: the open duels of the player's world (../duels.js, /api/de/duels) with Join, over the log and input line's
//   place. While it is open our log and input layers are off and no game tab is drawn as current; the engine's chat
//   is not touched (its own current tab stays; a game tab pressed brings its view back).
const ui = await import('../../ui.js').catch(() => null);   // null under node (the unit test needs no DOM)
import * as duels from '../duels.js';
import { DISCORD_LOGO } from '../discord-logo.js';
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
    // the press and release stay here (the runtime, SDL, hears releases on the document): a tab moved over another
    // one's place (chatTabs: Duel Log and Proximity Chat left out) would press the engine's tab under it too
    for (const t of ['mousedown', 'mouseup']) b.addEventListener(t, e => e.stopPropagation());
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
      el.dispatchEvent(new CustomEvent('htmlui-chat-send', { bubbles: true, detail: el.value }));   // teamNote
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
// A line relayed from Discord's #general (server discord/bridge.ts): its sender's name starts with DISCORD_MARK (Latin-1
// ¤, which no duelist name can hold), drawn as the Discord logo. discordLine: the line without it, or null. The game
// widens the line with its own code page (Shift-JIS), where the byte 0xA4 is the half-width ideographic comma U+FF64:
// that is what its log holds (seen live); U+00A4 too, for a widening that keeps Latin-1.
export const DISCORD_MARK = '\u00a4';
const MARKS = [DISCORD_MARK, '\uff64'];
export const discordLine = s => MARKS.includes(s[0]) ? s.slice(1) : null;
function ownList(c, layer, { stick = false, stripes = false } = {}) {
  const el = document.createElement('div');
  scroll.inject();   // every native scroll bar looks alike (controls/scroll.js's rule)
  el.className = 'own list yo2-scroll-list' + (stripes ? ' yo2-stripes' : '');
  el.setAttribute('role', stick ? 'log' : 'list');
  layer.append(el);
  let shown = [];
  // a row with "@>N/" pen moves (the Team List's "@>16/<name>@>230/<where>") as its pieces, each at its x (rowRuns)
  const row = s => {
    const r = document.createElement('div');
    r.className = 'row';
    if (/[@＠]>/.test(s)) {
      r.textContent = '\u00a0';
      r.style.position = 'relative';
      for (const { x, s: t } of rowRuns(s)) {
        const p = document.createElement('span');
        Object.assign(p.style, { position: 'absolute', left: x + 'px', top: 0, whiteSpace: 'pre', letterSpacing: basic.spacing(t) + 'px' });
        p.textContent = t;
        r.append(p);
      }
      return r;
    }
    const d = discordLine(s);
    if (d !== null) {
      const logo = document.createElement('img');
      Object.assign(logo, { src: DISCORD_LOGO, alt: 'Discord', title: 'From Discord' });
      Object.assign(logo.style, { width: '13px', height: '10px', verticalAlign: '-1px', marginRight: '3px' });
      r.append(logo, d);
      r.style.letterSpacing = basic.spacing(d) + 'px';
      return r;
    }
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
.htmlui-own .dz-layer { position: absolute; inset: 0; pointer-events: none; z-index: 1; }
.htmlui-own .dz-layer > * { pointer-events: auto; }
.htmlui-own .dz-list, .htmlui-own .dz-status { position: absolute; box-sizing: border-box; font: ${basic.fontCss()}; color: #000; }
.htmlui-own .dz-list { overflow-y: auto; overflow-x: hidden; padding-top: 2px; }
.htmlui-own .dz-row { display: grid; grid-template-columns: 160px 48px minmax(0, 1fr) 72px; column-gap: 16px; align-items: center;
  height: 25px; box-sizing: border-box; padding: 0 8px; border-bottom: 1px solid rgba(0, 0, 0, .16); white-space: pre; }
.htmlui-own .dz-row > span { overflow: hidden; text-overflow: ellipsis; }
.htmlui-own .dz-row > .wait { grid-column: 3 / 5; }
.htmlui-own .dz-row > .act { position: relative; height: 20px; overflow: visible; }
.htmlui-own .dz-empty { position: absolute; inset: 0; display: flex; flex-direction: column; justify-content: center; text-align: center; white-space: pre; }
.htmlui-own .dz-status { white-space: pre; overflow: hidden; text-overflow: ellipsis; padding: 0 8px; }
.htmlui-own .dz-status.error { color: #c00000; }
.htmlui-own .chat-in { font: ${basic.fontCss()}; color: #000; background: none; outline: none; resize: none; overflow: hidden; }
`;

// An owned window's screen module (social.js's too): each control redrawn by draw(c, el, api, win) when its snapshot
// changes; lists, a lone scroll bar and inputs owned (ownList: native scrollers, ownScroll, ownInput);
// background(win, el), if given, draws what the window itself draws under its controls (its own picture)
// The chat's tabs as the owner wants them (CChatWindow): the Duel Log tab left out (owner: of no use; ovr/duellog.c adds
// it on the duel screen until the runtime drops it), and Proximity Chat too (owner: removed entirely; the server sends
// nothing on it and takes what is typed there as All Chat; All Chat lines show as speech bubbles, chat-bubbles.js), the
// game's all-capitals names in plain case ('TRADE' -> 'Trade'), and a tab whose log had lines while another was shown
// says how many until it is opened: 'Team (2)'. A tab
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

// The engine's Proximity Chat tab active (chatTabs leaves it out: no tab would look selected over an empty log): All
// Chat, the first tab, pressed instead, once per snapshot
function offProximity(win, api, st) {
  const tabs = win.controls.filter(c => c.cls === 'CWindowTaskTab' && c.shown).sort((a, b) => a.x - b.x);
  const on = tabs.find(t => t.active);
  if (st.unprox || !on || !/^proximity chat$/i.test((on.label || '').replace(/[@＠]\d/g, '').trim()) || !tabs[0] || tabs[0] === on) return;
  st.unprox = true;
  Promise.resolve(api.click(tabs[0].id)).finally(() => setTimeout(() => { st.unprox = false; }, 300));
}

// Enter on the Team tab outside a team: the game drops the line without a word (it sends team chat only with
// CNetLobby::inTeam, read/chat.js), so a note says why, at the foot of the log, until another tab or a few seconds
const TEAM_NOTE = 'You are not in a team. Form one or accept an invite: Main Menu > Team List.';
function teamNote(win, root, st) {
  const tab = win.controls.find(c => c.cls === 'CWindowTaskTab' && c.active);
  const log = tab && win.controls.find(c => c.id === win.pairs?.find(p => p.tab === tab.id)?.log);
  st.teamless = win.inTeam === false && /^team$/i.test((tab?.label || '').replace(/[@＠]\d/g, '').trim()) && log;
  if (!st.teamNote) {
    const n = st.teamNote = document.createElement('div');
    Object.assign(n.style, { position: 'absolute', color: '#008000', whiteSpace: 'nowrap', pointerEvents: 'none' });
    n.hidden = true;
    n.textContent = TEAM_NOTE;
    st.own.append(n);
    root.addEventListener('htmlui-chat-send', e => {
      if (!st.teamless || !e.detail.trim()) return;
      const c = st.teamless;
      Object.assign(n.style, { left: c.x + 4 + 'px', top: c.y + c.h - 18 + 'px', font: basic.fontCss() });
      n.style.letterSpacing = basic.spacing(TEAM_NOTE) + 'px';
      n.hidden = false;
      clearTimeout(st.teamNoteT); st.teamNoteT = setTimeout(() => { n.hidden = true; }, 6000);
    });
  }
  if (!st.teamless) st.teamNote.hidden = true;
}

// --- The Duels tab (DOM only; ../duels.js): after the last game tab, as wide as its caption plus the room the game's
// own tabs give theirs, 8 px over it as the game lays its tabs; 'Duels (2)': open duels of others that appeared since
// the tab was last open. While open, the panel takes the log's place and the input line's (its text line: the status).
export function duelsView(win, on) {
  if (!on) return { win, panel: null };
  const top = win.controls.filter(c => !c.parent);
  const log = top.find(c => c.cls === 'CWindowTaskTextlist' && c.shown), input = top.find(c => /Input$/.test(c.cls) && c.shown);
  const panel = log && {
    list: { x: log.x, y: log.y, w: log.w, h: input ? Math.min(log.h, input.y + 8 - log.y) : log.h },
    status: input ? { x: input.x + 8, y: input.y + 8, w: input.w - 16, h: input.h - 16 } : null,
  };
  // our layers only: the log and the input line not drawn, no game tab drawn as the current one
  const controls = win.controls.map(c => c.cls === 'CWindowTaskTab' ? (c.active ? { ...c, active: false } : c)
    : !c.parent && (c.cls === 'CWindowTaskTextlist' || /Input$/.test(c.cls)) && c.shown ? { ...c, shown: false } : c);
  return { win: { ...win, controls }, panel: panel || null };
}
const DUELS_OVERLAP = 8;   // px over the last game tab (yo2WindowChat.cpp lays its tabs 8 px over each other)
export function duelsTab(win, on, n = 0) {
  const tabs = win.controls.filter(c => c.cls === 'CWindowTaskTab' && c.shown && !c.parent).sort((a, b) => a.x - b.x), last = tabs.at(-1);
  if (!last) return null;
  const label = 'Duels' + (n ? ` (${n > 99 ? '99+' : n})` : '');
  const pad = Math.max(24, Math.round(last.w - textW(last.label || '')));
  return { x: last.x + last.w - DUELS_OVERLAP, y: last.y, w: Math.ceil(textW(label)) + pad, label, active: !!on };
}

// The page's one list of open duels (a chat window per scene; the tab's state outlives them): polled every 5 s while
// the tab is open (or a Discord link waits), every 20 s otherwise, only while a chat in the online world is up.
const HINT = 'Join sends the duelist your duel request; they accept or decline.';
const MINE = 'Your duel stays listed here until someone joins.';
const EMPTY = ['No open duels right now.', 'To list yours: Duel menu → Create Duel.'];
export const DUELS_TEXT = { HINT, MINE, EMPTY };   // (pinned by the unit test)
const hub = {
  on: false, list: [], loaded: false, seen: new Set(), msg: null, busy: false, st: null, running: false, gen: 0, timer: 0, q: false,
  unread() { return duels.unseen(this.list, this.seen); },
  see() { this.seen = new Set(this.list.map(d => d.id)); },
  start(st) { this.st = st; if (!this.running) { this.running = true; this.loop(); } },
  stop(st) { if (st && this.st !== st) return; this.st = null; this.running = false; this.gen++; clearTimeout(this.timer); },
  async loop() {
    clearTimeout(this.timer);
    const gen = ++this.gen, r = await duels.fetchDuels();
    if (gen !== this.gen || !this.running) return;
    if (r) { this.list = r.duels; this.loaded = true; if (this.on) this.see(); }
    this.refresh();
    this.timer = setTimeout(() => this.loop(), this.on || duels.readPending() ? 5000 : 20000);
  },
  // the chat redrawn from its last snapshot (deferred: called from inside its update too)
  refresh() {
    if (this.q) return;
    this.q = true;
    queueMicrotask(() => { this.q = false; const D = this.st?.duels; if (D?.raw) D.screen.update(D.raw, null, D.root, D.api, this.st); });
  },
  open() { this.on = true; this.see(); if (this.running) this.loop(); this.refresh(); },
  close() { this.on = false; this.refresh(); },
  // a status line for 30 s (the poll redraws), then the hint again: the request's answer is the game's own prompt
  status(text, kind = 'info') { hub.msg = text ? { text, kind, until: Date.now() + 30000 } : null; hub.refresh(); },
  async join(d) {
    const api = this.st?.duels?.api;
    if (this.busy || !api) return;
    this.busy = true;
    this.status(`Sending a duel request to ${d.name}…`);
    const r = await duels.joinDuel(api, d.id);
    this.busy = false;
    this.status(r.ok ? `Duel request sent to ${r.name}. Waiting for their answer.` : r.message, r.ok ? 'info' : 'error');
    if (this.running) this.loop();
  },
};

// one line of text in the game's Arial and spacing
const txt = (el, s) => { el.textContent = s; el.style.letterSpacing = basic.spacing(s) + 'px'; return el; };
const node = (tag, cls, s) => { const e = document.createElement(tag); e.className = cls; if (s != null) txt(e, s); return e; };
const at = (el, r) => Object.assign(el.style, { left: r.x + 'px', top: r.y + 'px', width: r.w + 'px', height: r.h + 'px' });
function drawDuels(st) {
  const D = st.duels, rows = duels.duelRows(hub.list), msg = hub.busy || hub.msg?.until > Date.now() ? hub.msg : null;
  const k = JSON.stringify([D.tab, D.panel, hub.on && rows, hub.loaded, msg, hub.busy]);
  if (k === D.k) return;
  D.k = k;
  const keep = D.layer.querySelector('.dz-list')?.scrollTop || 0;
  D.layer.replaceChildren();
  if (!D.tab) return;
  const t = skin.tab(D.layer, D.tab);
  // the game's tabs lie left over right, the current one over both neighbours: not current, the Duels tab goes under the
  // last game tab, its first DUELS_OVERLAP px cut away (clicks there reach that tab, as the game's own overlaps do)
  if (!D.tab.active) t.style.clipPath = `inset(0 0 0 ${DUELS_OVERLAP}px)`;
  t.addEventListener('click', () => { if (!hub.on) hub.open(); });
  if (!hub.on || !D.panel) return;
  scroll.inject();
  const list = node('div', 'dz-list yo2-scroll-list');
  list.setAttribute('role', 'list');
  list.setAttribute('aria-label', 'Open duels');
  at(list, D.panel.list);
  if (!rows.length) {
    const e = node('div', 'dz-empty');
    e.append(node('div', '', hub.loaded ? EMPTY[0] : 'Looking for open duels…'));
    if (hub.loaded) e.append(node('div', '', EMPTY[1]));
    list.append(e);
  }
  for (const d of rows) {
    const r = node('div', 'dz-row');
    r.setAttribute('role', 'listitem');
    r.append(node('span', 'nm', d.name), node('span', 'lv', d.lv));
    if (d.mine) r.append(node('span', 'wait', 'Your duel: waiting for an opponent'));
    else {
      const act = node('span', 'act');
      r.append(node('span', 'ru', d.rules), act);
      const b = skin.menuButton(act, { x: 0, y: 0, w: 72, h: 20, label: 'Join', state: null });
      b.disabled = hub.busy;
      b.setAttribute('aria-label', `Join ${d.name}'s duel`);
      b.addEventListener('click', () => hub.join(d));
    }
    list.append(r);
  }
  D.layer.append(list);
  list.scrollTop = keep;
  if (D.panel.status) {
    const hint = rows.some(d => !d.mine) ? HINT : rows.length ? MINE : '';
    const m = msg || { text: hint, kind: 'hint' }, s = node('div', 'dz-status ' + m.kind, m.text);
    s.setAttribute('role', 'status');
    at(s, D.panel.status);
    D.layer.append(s);
  }
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
      if (win.cls === 'CChatWindow') {
        const layer = document.createElement('div');
        layer.className = 'dz-layer';
        // presses stay here, as the game tabs' do (SDL hears releases on the document): the Duels tab sits over a game
        // tab's place (chatTabs shifts them) and the panel over the log
        for (const t of ['mousedown', 'mouseup']) layer.addEventListener(t, e => e.stopPropagation());
        root.append(layer);
        st.duels = { layer, screen };
        hub.on = false;   // a new chat (a new scene) opens on the game's own tab
        // a game tab pressed: its view back (the engine's click goes on to the game as before)
        vis.addEventListener('click', e => { if (hub.on && e.target.closest?.('.yo2-tab')) hub.close(); }, true);
      }
      screen.update(win, null, root, api, st);
      return st;
    },

    update(win, prev, root, api, st) {
      if (win.cls === 'CChatWindow') {
        offProximity(win, api, st);
        const raw = win, D = st.duels;
        if (D) {
          Object.assign(D, { raw, root, api });
          if (win.online !== false && win.world) {
            hub.start(st);
            duels.deeplinkStep({ scene: win.scene, api, status: hub.status, show: () => { if (!hub.on) hub.open(); } });
          } else hub.stop(st);
          ({ win, panel: D.panel } = duelsView(win, hub.on));
        }
        win = chatTabs(win);
        st.vis.hidden = st.own.hidden = win.online === false;
        if (win.online === false && win.world !== false) fold(win, api, st);   // never pressed during the sign-in
        teamNote(win, root, st);   // (with the Duels tab open no game tab is current: no note)
        if (D) { D.tab = win.online !== false && win.world ? duelsTab(win, hub.on, hub.unread()) : null; D.layer.hidden = !D.tab; drawDuels(st); }
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

    unmount(root, st) {
      if (st?.duels) hub.stop(st);
      root.replaceChildren();
    },
  };
  return screen;
}
export default owned(['CChatWindow'], drawControl);
