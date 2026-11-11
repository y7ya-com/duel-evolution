// Crafting in the deck editor (screens/deck.js mounts it in the editor scene only):
//   mountBar(parent)    the Deck header's bar: the Shards wallet (always shown) and Dismantle Extras
//   mountStrip(parent)  the card detail's strip: the shown card's rarity, copies owned and locked (with why), and its
//                       Craft · cost / Dismantle · +yield buttons (disabled with the reason). Any card the trunk
//                       shows, owned or not: its All cards filter (trunkPool) lists every collectible card
//   openCard(kind, pc)  the Craft Card / Dismantle Card modal (Master Duel's, in the game's light look): the card, a
//                       count stepper, Owned and Shards before > after, the locked copies; it is the confirmation
//   openExtras()        the Dismantle Extras sheet: keep 3 or keep 1, the server's preview, Confirm
//   trunkPool(f)        f.pool for the trunk's filter (ovr/decksearch.c): All cards, Missing, Craftable
// After an operation the view (counts, wallet) updates in place everywhere and a toast says what happened (the
// Secret Packs a craft unlocked too). The trunk itself is the game's: the server pushes the new inventory to it
// (game/crafting.ts pushInventory), and the editor puts its filter back on (screens/deck.js).
// The rules are crafting/model.js's, the requests crafting/api.js's, the look crafting/css.js's.
import * as api from './api.js';
import * as M from './model.js';
import { loadTable, peekTable, cardNames } from './cards.js';
import { injectCss } from './css.js';
import { deckCss, titleArt } from '../screens/deck.js';
import { scrollList } from '../controls/scroll.js';

// ---------------------------------------------------------------- shared state
const S = { view: api.peekView(), error: null, busy: '', parts: new Set(), names: new Map(), started: false };
const renderAll = () => { for (const p of [...S.parts]) { try { p.render(); } catch (e) { console.error('[crafting]', e); } } };

/** Start (idempotent): the passcode table and the view; the parts re-render whenever either changes. */
export function start() {
  injectCss();
  if (S.started) return;
  S.started = true;
  api.onChange(v => { S.view = v; S.error = null; renderAll(); });
  loadTable().then(t => { if (t) { S.names = cardNames(t); renderAll(); } });
  refresh(true);
}
/** Ask the server again (force: past the cache). The editor calls it when the trunk changes. */
export function refresh(force = false) {
  if (!force && S.error && Date.now() - S.errorAt < 5000) return Promise.resolve(S.view);   // a failure isn't asked again every frame
  return api.getView({ force }).then(v => { const same = v === S.view; S.view = v; S.error = null; if (!same) renderAll(); return v; },
    e => { S.error = e; S.errorAt = Date.now(); renderAll(); return null; });
}
const names = () => {
  if (!S.names.size) S.names = cardNames(peekTable());
  return S.names;
};
const nameOf = pc => names().get(Number(pc)) || '';
/** The crafting view now (null before the first answer). */
export const peek = () => S.view;
/** Listen for view changes (the trunk re-filters on them). -> unsubscribe */
export function onView(cb) { const part = { render: () => cb(S.view) }; S.parts.add(part); return () => S.parts.delete(part); }
/** f.pool for the trunk's filter (screens/deck.js): f.show 'owned' | 'all' | 'missing' | 'craftable', f.rarity [], f.cat. */
export function trunkPool(f) {
  const kindOf = id => globalThis.yo2Deck?.card?.(id)?.kind ?? -1;
  const show = f.show || 'owned';
  return M.poolOf(S.view, peekTable(), kindOf, { pool: show === 'owned' ? 'owned' : 'all', show: show === 'missing' || show === 'craftable' ? show : '',
    cat: f.cat, rarity: f.rarity });
}

// ---------------------------------------------------------------- DOM helpers
export const h = (tag, cls, props = {}, kids = []) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  for (const [k, v] of Object.entries(props)) {
    if (v === undefined || v === null || v === false) continue;
    if (k === 'text') e.textContent = v;
    else if (k === 'on') for (const [t, f] of Object.entries(v)) e.addEventListener(t, f);
    else if (k === 'style') Object.assign(e.style, v);
    else e.setAttribute(k, v === true ? '' : v);
  }
  for (const c of [].concat(kids)) if (c != null && c !== false) e.append(c);
  return e;
};
const shard = (lg = false) => h('span', 'shard' + (lg ? ' lg' : ''), { 'aria-hidden': 'true' });
const badge = r => h('span', 'rb', { 'data-r': r, title: M.RARITY_NAME[r], text: r });
const SVG = {
  lock: '<svg class="ic" width="11" height="11" viewBox="0 0 24 24"><rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/></svg>',
  check: '<svg class="ic" width="14" height="14" viewBox="0 0 24 24" style="stroke-width:3.2"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>',
  bang: '<svg class="ic" width="14" height="14" viewBox="0 0 24 24" style="stroke-width:3.2"><path d="M12 6v8M12 18.5v.5"/></svg>',
  // craft: a card and a plus; dismantle: a card split in two
  craft: '<svg class="ic" width="12" height="12" viewBox="0 0 24 24" style="stroke-width:3"><rect x="5" y="3" width="14" height="18" rx="2"/><path d="M12 8v8M8 12h8"/></svg>',
  dismantle: '<svg class="ic" width="12" height="12" viewBox="0 0 24 24" style="stroke-width:3"><path d="M10 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h4M14 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4M12 2l-2 5 3 4-3 4 2 7"/></svg>',
};
const icon = n => { const s = h('span'); s.innerHTML = SVG[n]; return s.firstChild; };
// keys pressed on our controls are ours, never the game's (SDL listens on window, bubbling)
const ownKeys = el => { for (const t of ['keydown', 'keyup', 'keypress']) el.addEventListener(t, e => e.stopPropagation()); return el; };

// the detail bar's buttons: an icon and the action's name ("[+] Craft" / "[split] Dismantle"; an icon and a price alone
// were missed: players couldn't tell what they did), the price and any reason it can't in the tooltip and the
// aria-label, and the price again in the confirmation popup. A price beside the name doesn't fit the 248 px bar.
function fillAction(b, kind, amount, why, busy) {
  const label = kind === 'make' ? 'Craft' : 'Dismantle', sign = kind === 'make' ? '' : '+';
  b.replaceChildren(icon(kind === 'make' ? 'craft' : 'dismantle'), h('span', null, { text: label }));
  b.disabled = !!why || !!busy;
  b.setAttribute('aria-busy', busy ? 'true' : 'false');
  const what = `${label}${amount != null ? `: ${sign === '+' ? 'gain' : 'costs'} ${M.fmt(amount)} Shards` : ''}`;
  b.title = why ? `${what}. ${why}` : busy ? `${label}…` : what;
  b.setAttribute('aria-label', b.title);
}

// ---------------------------------------------------------------- the operations
/** Craft or dismantle pc: the card modal (the confirmation), then the request. */
export async function act(kind, pc) {
  const s = M.cardState(S.view, pc);
  if (!s || S.busy) return;
  const name = nameOf(pc), n = await openCard(kind, pc);
  if (!n) return;
  S.busy = kind + ':' + pc;
  renderAll();
  try {
    const out = kind === 'make' ? await api.make(pc, n) : await api.dismantle(pc, n);
    toast(M.resultToast(out, name));
  } catch (e) {
    toast({ title: e.message || api.errorText(e.error), tone: 'error' });
    if (e.error && e.error !== 'network') refresh(true);
  } finally {
    S.busy = '';
    renderAll();
  }
}

// ---------------------------------------------------------------- the wallet bar
// In the Deck header: the Shard and the balance in the editor's black number box, Dismantle Extras as its blue bevel
export function mountBar(parent) {
  start();
  deckCss();
  const v = h('span', 'nb', { text: '–' });
  const wallet = h('div', 'wallet', { role: 'status', 'aria-label': 'Shards', title: 'Shards: dismantle cards to get them, spend them to craft' }, [shard(true), v]);
  const extras = h('button', 'dk-btn', { type: 'button', text: 'Dismantle Extras', on: { click: () => openExtras() } });
  const el = ownKeys(h('div', 'cr cr-bar', {}, [wallet, extras]));
  parent.append(el);
  const part = {
    el,
    render() {
      v.textContent = S.view ? M.fmt(S.view.shards) : S.error ? '–' : '…';
      extras.disabled = !S.view;
    },
    place(x, y, w) { Object.assign(el.style, { left: x + 'px', top: y + 'px', width: w + 'px' }); },
    destroy() { S.parts.delete(part); el.remove(); },
  };
  S.parts.add(part);
  part.render();
  return part;
}

// ---------------------------------------------------------------- the card detail's bar row
// On the detail panel's own blue header bar (CWindowTaskIconbar, 248 x 24; its collapse arrow at x 229), so the card
// text keeps all its room: the rarity tag, "2/3" owned (a lock when copies are locked: the reasons in its tooltip),
// and the Craft and Dismantle buttons. Shown with any card the panel shows, owned or not (the trunk's All lists every one).
export const BAR_W = 226;
export function mountStrip(parent) {
  start();
  deckCss();
  let pc = 0, id = 0;
  const rar = h('span', 'rb'), own = h('span', 'own');
  const craft = h('button', 'dk-btn', { type: 'button', on: { click: () => act('make', pc) } });
  const dis = h('button', 'dk-btn', { type: 'button', on: { click: () => act('dismantle', pc) } });
  const el = ownKeys(h('div', 'cr cr-cardbar', { role: 'group', 'aria-label': 'Craft or dismantle this card', style: { width: BAR_W + 'px' } }, [rar, own, craft, dis]));
  el.hidden = true;
  parent.append(el);
  const part = {
    el,
    /** Show it for the editor's card id at (x, y) (the bar's top left in the parent); id <= 0 hides it. */
    show(cardId, x, y) {
      Object.assign(el.style, { left: x + 'px', top: y + 'px' });
      el.hidden = !(cardId > 0);
      if (cardId !== id) { id = cardId; part.render(); }
    },
    hide() { el.hidden = true; },
    render() {
      const t = peekTable();
      pc = t && id > 0 ? t.passcode(id) : 0;
      const s = pc && S.view ? M.cardState(S.view, pc) : null;
      if (!s) {
        const why = !S.view || !t ? (S.error && !S.view ? S.error.message : 'Loading your collection…') : "This card can't be crafted or dismantled.";
        rar.hidden = true;
        own.replaceChildren();
        own.title = '';
        fillAction(craft, 'make', null, why, false);
        fillAction(dis, 'dismantle', null, why, false);
        return;
      }
      rar.hidden = false;
      rar.dataset.r = s.rarity;
      rar.textContent = s.rarity;
      rar.title = M.RARITY_NAME[s.rarity];
      own.replaceChildren(h('span', null, { text: s.owned > M.MAX_COPIES ? String(s.owned) : `${s.owned}/${M.MAX_COPIES}` }), ...(s.locked ? [icon('lock')] : []));
      own.title = [M.ownedLine(s), ...M.lockReasons(s)].join('\n');
      own.setAttribute('aria-label', own.title);
      fillAction(craft, 'make', s.craft.cost, s.craft.ok ? '' : s.craft.why, S.busy === 'make:' + pc);
      fillAction(dis, 'dismantle', s.dismantle.gain, s.dismantle.ok ? '' : s.dismantle.why, S.busy === 'dismantle:' + pc);
      if (S.busy && !S.busy.endsWith(':' + pc)) craft.disabled = dis.disabled = true;
    },
    destroy() { S.parts.delete(part); el.remove(); },
  };
  S.parts.add(part);
  part.render();
  return part;
}
/** The rarity of the editor's card id ('' when unknown): the trunk rows' corner marks. */
export function rarityOfId(id) {
  const pc = peekTable()?.passcode(id);
  return (pc && S.view?.cards?.[pc]?.rarity) || '';
}

// ---------------------------------------------------------------- modals
const stack = [];   // the open modals, last on top
function placeOnStage(root) {
  const canvas = document.getElementById('canvas');
  const place = () => {
    const r = canvas?.getBoundingClientRect(), s = r?.width ? r.width / 1024 : Math.min(innerWidth / 1024, innerHeight / 768);
    Object.assign(root.style, { left: (r?.width ? r.left : (innerWidth - 1024 * s) / 2) + 'px', top: (r?.width ? r.top : (innerHeight - 768 * s) / 2) + 'px',
      transform: `scale(${s})` });
  };
  place();
  const ro = canvas && typeof ResizeObserver !== 'undefined' ? new ResizeObserver(place) : null;
  ro?.observe(canvas);
  addEventListener('resize', place);
  return () => { ro?.disconnect(); removeEventListener('resize', place); };
}
// a modal over the stage: the dim, the window at rect, keys kept from the game, Esc closes the top one
// The window is the editor's popup (the Filters popup's dk-pop: grey body, silver bevel), its lavender header bar with
// the title in the editor's outlined lettering, a light strip with the subtitle, and a close box
function modal({ label, title, sub, rect: [x, y, w, hh], cls = '', onEsc }) {
  injectCss();
  deckCss();
  const root = h('div', `cr cr-modal ${cls}`, { role: 'dialog', 'aria-modal': 'true', 'aria-label': label, tabindex: '-1' });
  const dim = h('div', 'dim', { on: { click: () => onEsc() } });
  const win = h('div', 'dk-pop', { style: { left: x + 'px', top: y + 'px', width: w + 'px', height: hh + 'px' } });
  win.append(h('div', 'dk-head'));
  // the "Card Search" art's size (16 px caps, ~7.1 px a letter), its ink box centred down the header bar (y 7..35)
  titleArt(win, title, '#ffb52f', 12, 12, Math.round(title.length * 7.1), 18).setAttribute('role', 'heading');
  win.append(h('button', 'dk-btn x', { type: 'button', 'aria-label': 'Close', text: '×', on: { click: () => onEsc() } }));
  if (sub) win.append(h('div', 'sub', { text: sub }));
  root.append(dim, win);
  document.body.append(root);
  const unplace = placeOnStage(root);
  const keys = e => {
    e.stopPropagation();
    if (e.type === 'keydown' && e.key === 'Escape' && stack.at(-1) === m) { e.preventDefault(); onEsc(); }
  };
  for (const t of ['keydown', 'keyup', 'keypress']) root.addEventListener(t, keys);
  // a key aimed outside every modal (the chat line kept focus) is stopped before the game sees it
  const outside = e => {
    if (e.target?.closest?.('.cr-modal')) return;
    e.stopPropagation();
    if (e.type === 'keydown' && e.key === 'Escape' && stack.at(-1) === m) onEsc();
  };
  for (const t of ['keydown', 'keyup', 'keypress']) addEventListener(t, outside, true);
  root.addEventListener('wheel', e => e.stopPropagation());
  const before = document.activeElement;
  const m = {
    root, win,
    close() {
      const i = stack.indexOf(m);
      if (i < 0) return;
      stack.splice(i, 1);
      toastEl?.toggleAttribute('data-over', stack.length > 0);
      unplace();
      for (const t of ['keydown', 'keyup', 'keypress']) removeEventListener(t, outside, true);
      root.remove();
      if (before?.isConnected) before.focus?.({ preventScroll: true });
    },
  };
  stack.push(m);
  toastEl?.toggleAttribute('data-over', true);   // a note already up moves clear of the sheet
  root.focus({ preventScroll: true });
  return m;
}
// "4,097 ▶ 4,247": before and after in the editor's number boxes, the arrow between (tone on the after: 'gain' |
// 'spend' | 'zero')
const beforeAfter = (a, b, tone) => [h('span', 'nb b4', { text: M.fmt(a) }), h('span', 'arw', { 'aria-label': 'becomes' }),
  h('span', 'nb aft', { 'data-tone': tone || null, text: M.fmt(b) })];

// ---------------------------------------------------------------- card art (the game's own, by the editor's card id)
const arts = new Map();
function artUrl(id) {
  if (!arts.has(id)) {
    const L = globalThis.Module?.yo2Lazy;
    arts.set(id, Promise.resolve(L?.cardArt ? L.cardArt(id) : null).catch(() => null).then(b => {
      if (!b) { arts.delete(id); return null; }
      return URL.createObjectURL(new Blob([b], { type: b[1] === 0x50 ? 'image/png' : b[0] === 0x3c ? 'image/svg+xml' : 'image/jpeg' }));
    }));
  }
  return arts.get(id);
}

// ---------------------------------------------------------------- the Craft Card / Dismantle Card modal
const CARD_TEXT = {
  make: { title: 'Craft Card', sub: 'Use Shards to craft a card', count: 'Cards to craft', go: 'Craft' },
  dismantle: { title: 'Dismantle Card', sub: 'Dismantle a card to obtain Shards', count: 'Cards to dismantle', go: 'Dismantle' },
};
/** The modal for kind 'make' | 'dismantle' of passcode pc. -> Promise<number> (the copies chosen; 0 = cancelled) */
export function openCard(kind, pc) {
  return new Promise(done => {
    const s = M.cardState(S.view, pc), shards = S.view?.shards ?? 0, T = CARD_TEXT[kind];
    const { max, limit } = M.stepRange(kind, s, shards);
    if (!s || max < 1) { done(0); return; }
    let n = 1, m = null;
    const end = v => { m.close(); done(v); };
    const lock = kind === 'dismantle' && M.lockLine(s) ? `${M.lockLine(s)}: they stay in your collection.` : '';
    m = modal({ label: T.title, title: T.title, sub: T.sub, rect: [272, lock ? 200 : 214, 480, lock ? 368 : 340], cls: 'card', onEsc: () => end(0) });
    const img = h('img', null, { alt: '' });
    const id = peekTable()?.id(pc) || 0;
    if (id) artUrl(id).then(u => { if (u) img.src = u; });
    const count = h('output', 'nb count', { 'aria-live': 'polite' });
    const minus = h('button', 'dk-btn step', { type: 'button', 'aria-label': 'One fewer', text: '−', on: { click: () => set(n - 1) } });
    const plus = h('button', 'dk-btn step', { type: 'button', 'aria-label': 'One more', text: '+', on: { click: () => set(n + 1) } });
    const owned = h('div', 'ba'), sh = h('div', 'ba'), note = h('div', 'note'), shDelta = h('span', 'delta');
    const go = h('button', 'dk-btn go', { type: 'button', text: T.go, on: { click: () => end(n) } });
    m.win.append(
      h('div', 'panel top', {}, [
        h('div', 'art', { 'data-r': s.rarity }, [img, badge(s.rarity)]),
        h('div', 'cn', { text: nameOf(pc), title: nameOf(pc) }),
        h('div', 'mid', {}, [h('div', 'lb', { text: T.count }), h('div', 'stepper', {}, [minus, count, plus]), note]),
        h('div', 'rule'),
        h('div', 'own', {}, [h('div', 'lb', { text: 'Owned' }), owned])]),
      h('div', 'panel shards', {}, [shard(true), h('div', 'lb', { text: 'Shards' }), sh, shDelta]),
      h('div', 'panel locked', { hidden: !lock || null, title: M.lockReasons(s).join('\n') || null }, [icon('lock'), h('span', 'note', { text: lock })]),
      h('div', 'foot', {}, [h('button', 'dk-btn alt', { type: 'button', text: 'Cancel', on: { click: () => end(0) } }), go]));
    function set(v) {
      n = Math.max(1, Math.min(max, v));
      const p = M.preview(kind, s, shards, n);
      count.textContent = String(n);
      minus.disabled = n <= 1;
      plus.disabled = n >= max;
      owned.replaceChildren(...beforeAfter(p.owned[0], p.owned[1], p.owned[1] === 0 ? 'zero' : ''));
      sh.replaceChildren(...beforeAfter(p.shards[0], p.shards[1], p.delta < 0 ? 'spend' : 'gain'));
      shDelta.dataset.tone = p.delta < 0 ? 'spend' : 'gain';
      shDelta.textContent = `${p.delta < 0 ? '−' : '+'}${M.fmt(Math.abs(p.delta))}`;
      note.textContent = n >= max ? M.limitNote(kind, limit, max) : '';
      go.setAttribute('aria-label', `${T.go} ${n} ${n === 1 ? 'copy' : 'copies'}, ${p.delta < 0 ? 'spending' : 'gaining'} ${M.fmt(Math.abs(p.delta))} Shards`);
    }
    m.root.addEventListener('keydown', e => {
      if (e.key === '+' || e.key === '=' || e.key === 'ArrowRight') { e.preventDefault(); set(n + 1); }
      if (e.key === '-' || e.key === 'ArrowLeft') { e.preventDefault(); set(n - 1); }
    });
    set(1);
    go.focus({ preventScroll: true });
  });
}

// ---------------------------------------------------------------- Dismantle Extras
let extrasOpen = null;
/** Open the Dismantle Extras sheet. -> close() */
export function openExtras({ keep = 3 } = {}) {
  start();
  if (extrasOpen) return extrasOpen.close;
  const st = { keep, preview: null, error: null, loading: true, busy: false, seq: 0 };
  const m = modal({ label: 'Dismantle Extras', title: 'Dismantle Extras', sub: 'Turn spare copies into Shards', rect: [272, 164, 480, 440], cls: 'extras', onEsc: () => close() });
  const keeps = h('div', 'tabs', { role: 'radiogroup', 'aria-label': 'Copies to keep' });
  const sum = h('span', 'sum', { role: 'status' });
  const listBox = h('div', 'list');
  const empty = h('div', 'empty');
  const sh = h('div', 'ba'), shDelta = h('span', 'delta', { 'data-tone': 'gain' });
  const cancel = h('button', 'dk-btn alt', { type: 'button', text: 'Cancel', on: { click: () => close() } });
  const confirm = h('button', 'dk-btn go', { type: 'button', on: { click: () => go() } });
  const msg = h('div', 'msg', { role: 'alert' });
  m.win.append(h('div', 'row1', {}, [keeps, sum]), listBox,
    h('div', 'panel shards', {}, [shard(true), h('div', 'lb', { text: 'Shards' }), sh, shDelta]), msg,
    h('div', 'foot', {}, [cancel, confirm]));
  const list = scrollList(listBox, { x: 0, y: 0, w: 466, h: 225, rowH: 25 });
  listBox.append(empty);
  const row = r => h('div', 'row', { role: 'listitem' }, [badge(r.rarity), h('span', 'nm', { text: r.name }),
    h('span', 'own', { text: `×${r.n}` }), h('span', 'cost', {}, ['+', shard(), M.fmt(r.gain)])]);

  async function load() {
    const seq = ++st.seq;
    st.loading = true; st.error = null;
    render();
    try {
      const out = await api.previewExtras(st.keep);
      if (seq !== st.seq || !extrasOpen) return;
      st.preview = M.extrasPreview(out, names());
    } catch (e) {
      if (seq !== st.seq) return;
      st.preview = null; st.error = e;
    }
    st.loading = false;
    render();
  }
  async function go() {
    const p = st.preview;
    if (!p?.copies || st.busy) return;
    st.busy = true;
    render();
    try {
      const out = await api.dismantleExtras(st.keep);
      toast(M.resultToast(out));
      close();
    } catch (e) {
      st.busy = false;
      msg.textContent = e.message || api.errorText(e.error);
      render();
      if (e.error && e.error !== 'network') load();
    }
  }
  function render() {
    keeps.replaceChildren(...[3, 1].map(k => h('button', 'dk-chip', { type: 'button', role: 'radio', 'aria-checked': String(st.keep === k),
      'aria-pressed': String(st.keep === k), disabled: st.busy || null, on: { click: () => { if (st.keep !== k) { st.keep = k; msg.textContent = ''; load(); } } } },
      h('span', null, { text: `Keep ${k} of each` }))));
    const p = st.preview;
    list.set(st.loading || !p ? [] : p.rows, row, r => `${st.keep}:${r.pc}:${r.n}`);
    empty.textContent = st.loading ? 'Checking your collection…' : st.error ? st.error.message
      : !p.rows.length ? `No extra copies. Every card is at ${st.keep} ${st.keep === 1 ? 'copy' : 'copies'} or fewer, or its extras are locked.` : '';
    empty.hidden = !empty.textContent;
    const ready = p && !st.loading && p.copies, bal = S.view?.shards ?? 0;
    sum.textContent = ready ? `${M.fmt(p.copies)} ${p.copies === 1 ? 'copy' : 'copies'} from ${M.fmt(p.rows.length)} ${p.rows.length === 1 ? 'card' : 'cards'}${p.rare ? ` · ${p.rare} SR/UR` : ''}` : '';
    sh.replaceChildren(...beforeAfter(bal, bal + (ready ? p.shards : 0), 'gain'));
    shDelta.textContent = ready ? `+${M.fmt(p.shards)}` : '';
    confirm.textContent = st.busy ? 'Dismantling…' : 'Dismantle';
    confirm.disabled = st.loading || st.busy || !p?.copies;
    confirm.setAttribute('aria-busy', String(st.busy));
    cancel.disabled = st.busy;
  }
  const part = { render };
  S.parts.add(part);
  function close() {
    if (!extrasOpen) return;
    extrasOpen = null;
    st.seq++;
    S.parts.delete(part);
    m.close();
  }
  extrasOpen = { close };
  render();
  load();
  return close;
}

// ---------------------------------------------------------------- the toast
let toastEl = null, toastTimer = 0, toastUnplace = null;
/** A short note over the stage: { title, detail, secret, tone: 'ok' | 'error' }. */
export function toast({ title, detail = '', secret = '', tone = 'ok' }) {
  injectCss();
  deckCss();
  if (!toastEl) {
    toastEl = h('div', 'cr cr-toast', { role: 'status', 'aria-live': 'polite' });
    document.body.append(toastEl);
    toastUnplace = placeOnStage(toastEl);
  }
  const t2 = h('div', 't2', {}, detail ? [detail] : []);
  toastEl.toggleAttribute('data-over', stack.length > 0);   // over a sheet: above it, clear of its list
  toastEl.replaceChildren(h('div', 'dk-pop', { 'data-tone': tone }, [h('span', 'mk', {}, icon(tone === 'error' ? 'bang' : 'check')),
    h('div', 'tx', {}, [h('div', 't1', { text: title }), t2, ...(secret ? [h('div', 't2', {}, h('span', 'sp', { text: secret }))] : [])])]));
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { toastEl?.remove(); toastUnplace?.(); toastEl = null; }, tone === 'error' ? 6000 : secret ? 5000 : 3200);
}

/** Tests: everything closed and forgotten. */
export function _reset() {
  extrasOpen?.close();
  while (stack.length) stack.at(-1).close();
  S.parts.clear(); S.view = null; S.error = null; S.busy = ''; S.names = new Map(); S.started = false;
  toastEl?.remove(); toastEl = null; clearTimeout(toastTimer);
}
