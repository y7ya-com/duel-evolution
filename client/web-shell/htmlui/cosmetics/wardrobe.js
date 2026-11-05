// The Wardrobe: the cosmetics a player owns, with their real in-game art (cosmetics/art.js), to see and wear per world.
// An overlay over the overworld (opened from the menu bar: cosmetics/wardrobe-launcher.js), built from the native shop's
// own sprites (cosmetics/shopart.js): the glass window with its dark band and title plate; the categories as tabs
// (Head, Outfit, Disk); the owned items in a grid (cyan plate = worn here, dark = locked, the yellow brackets = the
// selection); in the middle the player's waist-up bust (cosmetics/waistup.js, the game's own bust from its own parts)
// large in the selection frame, wearing the selected item (a try-on: nothing changes until Equip) with its state plate;
// on the right the item's art and detail on the dark band (a locked or unwearable item's reason in one short line),
// one orange Equip, Take off for a face mark or glasses that is worn, and Close. 1024 x 768 stage following the canvas.
//   openWardrobe({ focusId }) -> close(): opens it (or, already open, selects focusId there). A character has one look,
//     worn in both worlds (owner, 2026-11-05): no world switch; the server writes both worlds' copies.
// Data: cosmetics/api.js getInfo, equip(id, world), setAppearance(world, parts) (the rank uniforms, Take off); the view
// model is cosmetics/wardrobe-model.js. Keys: Esc closes, the arrows move through the grid, Enter equips. While it is
// up no key or click reaches the game.
import * as api from './api.js';
import { injectTheme, RARITY } from './theme.js';
import { injectShopSkin } from './shopart.js';
import { renderItemArt } from './art.js';
import { renderWaistUp } from './waistup.js';
import { wardrobeView, tabOfId, uniformParts, previewOf, takeOffParts, TABS } from './wardrobe-model.js';

// The layout (stage px): one glass window (960 x 620 at 32, 74) over the overworld. Its band: two hint lines, the title
// plate. Three columns on it, 24 px from its edges: the grid (Head / Outfit / Disk tabs over the
// owned items, 4 a row, 66 px tiles 12 apart: 24..324), the bust in the selection frame in the middle (330..630, the
// window's centre 480) with its state plate and the graduation line, the detail band and the buttons (640..936).
// A tile's plate: cyan = worn in this world, dark = locked; the yellow corner brackets: the selection (as the shop's).
const CSS = `
.de-wd { position: fixed; left: 0; top: 0; width: 1024px; height: 768px; transform-origin: 0 0; z-index: 2147483000;
  pointer-events: auto; outline: none; }
.de-wd .wd-dim { position: absolute; inset: 0; background: rgba(2,9,16,.86); animation: wd-fade .18s ease-out; }
.de-wd .wd-win { position: absolute; left: 32px; top: 74px; width: 960px; height: 620px; animation: wd-fade .18s ease-out; }
.de-wd .wd-win > .sa-glass { left: 0; top: 0; width: 960px; height: 620px; }
.de-wd .wd-win > .sa-glass::before { opacity: .92; }
.de-wd .wd-win > .sa-band { left: 7px; top: 4px; width: 946px; height: 88px; }
.de-wd .wd-hint { position: absolute; left: 24px; top: 13px; width: 560px; }
.de-wd .wd-hint > div { height: 18px; line-height: 18px; overflow: hidden; text-overflow: ellipsis; }
.de-wd .wd-win > .sa-title { left: -10px; top: 67px; width: 256px; }
.de-wd .sa-plate.wd-tab { height: 36px; display: flex; align-items: center; justify-content: center; text-align: center; }
.de-wd .wd-tab { top: 104px; width: 92px; }
.de-wd .wd-grid { position: absolute; left: 24px; top: 152px; width: 310px; height: 444px; overflow-y: auto; overflow-x: hidden;
  scrollbar-width: thin; scrollbar-color: #8fa2ad rgba(0,0,0,.12); }
.de-wd .wd-tile { position: absolute; width: 66px; height: 66px; }
.de-wd .wd-tile > .de-rf { left: 6px; top: 6px; width: 54px; height: 54px; padding: 3px; pointer-events: none; }
.de-wd .wd-tile > .sa-brackets { left: -6px; top: -6px; width: 78px; height: 78px; }
.de-wd .wd-tile > .n { position: absolute; right: 7px; bottom: 6px; pointer-events: none; }
.de-wd .wd-tile[data-locked] > .de-rf > .well > .de-art { opacity: .35; filter: grayscale(1); }
.de-wd .wd-tile:focus-visible { outline: none; }
.de-wd .wd-empty { position: absolute; left: 0; top: 120px; width: 300px; text-align: center; white-space: normal; line-height: 18px; }
.de-wd .wd-skel { position: absolute; width: 66px; height: 66px; }
.de-wd .wd-bust { position: absolute; left: 330px; top: 104px; width: 300px; height: 340px; }
.de-wd .wd-bust::before { content: ''; position: absolute; left: 17px; top: 18px; width: 266px; height: 304px; background: linear-gradient(#eef2f4, #d3dce1); }
.de-wd .wd-bust > .sa-glass { left: 17px; top: 18px; width: 266px; height: 304px; }
.de-wd .wd-bust > .wd-wu { position: absolute; left: 17px; top: 18px; width: 266px; height: 304px; }
.de-wd .wd-bust > .sa-frame { left: 0; top: 0; width: 300px; height: 340px; }
.de-wd .wd-state { left: 390px; top: 428px; width: 180px; height: 28px; display: flex; align-items: center; justify-content: center; }
.de-wd .wd-state[data-state=cant] .sa-t, .de-wd .wd-state[data-state=locked] .sa-t { color: #5a1d00; }
.de-wd .wd-foot { position: absolute; left: 330px; top: 472px; width: 300px; line-height: 17px; text-align: center; white-space: normal; }
.de-wd .wd-side { position: absolute; left: 640px; top: 104px; width: 296px; height: 492px; }
.de-wd .wd-side > .sa-band { left: 0; top: 0; width: 296px; height: 232px; }
.de-wd .wd-info { position: absolute; left: 0; top: 0; width: 296px; height: 232px; overflow: hidden; }
.de-wd .wd-info > .de-rf { left: 12px; top: 14px; width: 60px; height: 60px; padding: 3px; }
.de-wd .wd-info > .de-rf[data-locked] > .well > .de-art { filter: grayscale(1) brightness(.6); opacity: .6; }
.de-wd .wd-head { position: absolute; left: 84px; top: 10px; width: 200px; height: 68px; display: flex; flex-direction: column; justify-content: center; }
.de-wd .wd-name { line-height: 22px !important; max-height: 44px; overflow: hidden; white-space: normal;
  display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; }
.de-wd .wd-lines { position: absolute; left: 12px; top: 90px; width: 272px; }
.de-wd .wd-lines > div { line-height: 18px; white-space: normal; }
.de-wd .wd-rl { line-height: 17px; }
.de-wd .wd-rl[data-rarity=common] { color: #e4eaee; } .de-wd .wd-rl[data-rarity=rare] { color: #8fe6ff; }
.de-wd .wd-rl[data-rarity=super] { color: #d6b8ff; } .de-wd .wd-rl[data-rarity=ultra] { color: #ffd862; }
.de-wd .wd-why[data-tone=warn], .de-wd .wd-why[data-tone=error] { color: #ffd0b0; }
.de-wd .wd-why[data-tone=ok] { color: #b8ffc8; }
.de-wd .wd-side > .sa-pill { left: 0; width: 296px; }
.de-wd .wd-equip { top: 248px; }
.de-wd .wd-off { top: 308px; }
.de-wd .wd-close { top: 442px; }
.de-wd .wd-none { position: absolute; left: 12px; top: 16px; width: 272px; white-space: normal; line-height: 18px; }
.de-wd .wd-fail { position: absolute; left: 0; top: 110px; width: 300px; text-align: center; white-space: normal; }
.de-wd .wd-fail .sa-btn2 { position: relative; display: inline-block; width: 116px; margin-top: 16px; }
@keyframes wd-fade { from { opacity: 0; } }
@media (prefers-reduced-motion: reduce) { .de-wd *, .de-wd *::before, .de-wd *::after { animation: none !important; transition: none !important; } }
`;

const h = (tag, cls, props = {}, kids = []) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  for (const [k, v] of Object.entries(props)) {
    if (v === undefined || v === null || v === false) continue;
    if (k === 'text') e.textContent = v;
    else if (k === 'on') for (const [t, f] of Object.entries(v)) e.addEventListener(t, f);
    else if (k === 'style') Object.assign(e.style, v);
    else e.setAttribute(k, v === true ? '' : v);
  }
  for (const c of [].concat(kids)) if (c) e.append(c);
  return e;
};
const t16 = (text, extra = '') => h('span', 'sa-t' + extra, { text });
const rarityWord = t => t.uniform ? 'Rank uniform' : `${RARITY[t.rarity]?.label || 'Common'} ${(t.slotName || t.kind || '').toLowerCase()}`.trim();

let open = null;   // the one open Wardrobe: { close, focus(id) }
export const COLS = 4, CELL = 78;   // the grid: 66 px tiles, 12 apart

/** Open the Wardrobe over the current scene. -> close(). Opened again while open: selects focusId in it. */
export function openWardrobe({ focusId } = {}) {
  if (open) { open.focus(focusId); return open.close; }
  injectTheme();
  injectShopSkin();
  if (!document.getElementById('de-wardrobe-css')) document.head.append(h('style', null, { id: 'de-wardrobe-css', text: CSS }));
  const st = { info: api.peekInfo?.() || null, world: null, tab: 'outfit', selectedId: focusId || null, busy: false, loadError: null, why: null };
  if (focusId && st.info) st.tab = tabOfId(st.info, focusId) || st.tab;
  const root = h('div', 'de-c de-wd', { role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Wardrobe', tabindex: '-1' });
  const dim = h('div', 'wd-dim', { on: { click: () => close() } });
  const win = h('div', 'wd-win');
  root.append(dim, win);
  const tabs = h('div', 'wd-tabs', { role: 'tablist', 'aria-label': 'Wearables' });
  const grid = h('div', 'yo2-scroll-list wd-grid', { role: 'listbox', 'aria-label': 'Your wearables', tabindex: '-1' });
  const hint = h('div', 'wd-hint sa-t sa-w', { 'aria-live': 'polite' });
  const wu = h('div', 'wd-wu', { role: 'img', 'aria-label': 'Your avatar' });
  const bust = h('div', 'wd-bust', {}, [h('div', 'sa-glass'), wu, h('div', 'sa-frame')]);
  const stateEl = h('div', 'sa-plate wd-state', { role: 'status' }, t16('Wearing'));
  const foot = h('div', 'wd-foot sa-t');
  const side = h('div', 'wd-side');
  const info = h('div', 'wd-info');
  const equipBtn = h('button', 'sa-pill wd-equip', { type: 'button', 'data-tone': 'go', on: { click: () => equip() } }, h('span', null, { text: 'Equip' }));
  const offBtn = h('button', 'sa-pill wd-off', { type: 'button', 'data-tone': 'hi', on: { click: () => takeOff() } }, h('span', null, { text: 'Take off' }));
  side.append(h('div', 'sa-band'), info, equipBtn, offBtn, h('button', 'sa-pill wd-close', { type: 'button', 'aria-label': 'Close', title: 'Close (Esc)', on: { click: () => close() } }, h('span', null, { text: 'Close' })));
  win.append(h('div', 'sa-glass'), h('div', 'sa-band'), hint, h('div', 'sa-title', { text: 'Wardrobe' }), tabs, grid, bust, stateEl, foot, side);
  document.body.append(root);

  // the stage over the canvas: its rect and the scale the bridge gives its layers (bridge.js place())
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

  // no key reaches the game while it is up (SDL listens on window, bubbling): handled here, stopped at the root, and
  // a key aimed elsewhere (the chat line had focus) is taken in the capture phase
  const keys = e => {
    e.stopPropagation();
    if (e.type !== 'keydown') return;
    if (e.key === 'Escape') { e.preventDefault(); close(); return; }
    const v = view(), rows = v.tiles, i = rows.findIndex(t => t.id === v.selected?.id);
    const step = { ArrowUp: -COLS, ArrowDown: COLS, ArrowLeft: -1, ArrowRight: 1 }[e.key];
    if (step && rows.length && !e.target.closest?.('.wd-worlds, .wd-tabs')) {
      e.preventDefault();
      const n = rows[Math.max(0, Math.min(rows.length - 1, (i < 0 ? 0 : i) + step))];
      select(n.id, true);
    } else if (e.key === 'Enter' && e.target === root) { e.preventDefault(); equip(); }
  };
  for (const t of ['keydown', 'keyup', 'keypress']) root.addEventListener(t, keys);
  const outside = e => { if (!root.contains(e.target)) { e.stopPropagation(); if (e.type === 'keydown' && e.key === 'Escape') close(); } };
  for (const t of ['keydown', 'keyup', 'keypress']) addEventListener(t, outside, true);
  root.addEventListener('wheel', e => e.stopPropagation());
  root.focus({ preventScroll: true });

  const unsub = api.onChange?.(i => { st.info = i; render(); }) || (() => {});
  const tiles = new Map();   // item id -> { el, art, rf, body, handle }
  let bigArt = null, bustDraw = null, closed = false;

  const view = () => st.info ? wardrobeView(st.info, st) : { tiles: [], tabs: [], selected: null, loading: true };
  const tileOf = id => grid.querySelector(`[data-id="${CSS_ESC(id)}"]`);
  function select(id, scroll) {
    st.selectedId = id; st.why = null;
    render();
    if (scroll) tileOf(id)?.scrollIntoView({ block: 'nearest' });
  }
  function load(force) {
    st.loadError = null;
    api.getInfo({ force }).then(i => {
      if (closed) return;
      st.info = i;
      if (st.world == null) st.world = i.appearance?.world === 0 ? 0 : 1;
      const first = focusId && !st.tabFixed;
      if (first) { st.tab = tabOfId(i, focusId) || st.tab; st.tabFixed = true; }
      render();
      if (first) tileOf(st.selectedId || focusId)?.scrollIntoView({ block: 'nearest' });
    }, e => { if (!closed) { st.loadError = e?.message || 'Couldn\'t load your wardrobe.'; render(); } });
  }

  function render() {
    if (closed) return;
    const v = view();
    const tl = v.tabs.length ? v.tabs : TABS;
    tabs.replaceChildren(...tl.map((t, i) => {
      const on = t.id === st.tab;
      return h('button', 'sa-plate wd-tab', { type: 'button', role: 'tab', 'aria-selected': String(on), 'data-tab': t.id, 'data-on': on,
        'data-count': t.count, style: { left: 24 + i * 104 + 'px' },
        on: { click: () => { if (st.tab !== t.id) { st.tab = t.id; st.selectedId = null; st.why = null; grid.scrollTop = 0; render(); } } } }, t16(t.label));
    }));
    if (st.loadError) { renderFail(); return; }
    if (!st.info) { renderSkeleton(); return; }
    hint.replaceChildren(h('div', null, { text: 'Choose an item to try it on.' }),
      h('div', null, { text: 'Equip wears it everywhere.' }));
    renderGrid(v);
    renderDetail(v);
    const g = v.graduation;
    foot.textContent = g.text;
  }
  function renderFail() {
    info.replaceChildren(); foot.textContent = ''; hint.replaceChildren();
    equipBtn.disabled = true; offBtn.hidden = true;
    grid.replaceChildren(h('div', 'wd-fail sa-t', {}, [h('div', null, { text: st.loadError }),
      h('button', 'sa-btn2', { type: 'button', on: { click: () => load(true) } }, t16('Try again'))]));
  }
  function renderSkeleton() {
    if (grid.firstChild?.classList.contains('wd-skel')) return;
    grid.replaceChildren(...Array.from({ length: 8 }, (_, i) => h('div', 'wd-skel de-skel', { style: { left: (i % COLS) * CELL + 'px', top: Math.floor(i / COLS) * CELL + 'px' } })));
    info.replaceChildren(h('div', 'wd-none sa-t sa-w', { text: 'Opening your wardrobe…' }));
    equipBtn.disabled = true; offBtn.hidden = true;
  }
  function tileEl(t, body, selId, i) {
    let a = tiles.get(t.id);
    if (!a || a.body !== body) {
      a?.handle?.destroy();
      const el = h('button', 'sa-plate wd-tile', { type: 'button', role: 'option', 'data-id': t.id, on: { click: () => select(t.id), dblclick: () => { select(t.id); equip(); } } });
      const art = h('div', 'art'), rf = h('div', 'de-rf', {}, h('div', 'well', {}, art));
      el.append(rf, h('div', 'sa-brackets'));
      a = { el, art, rf, body, handle: null };
      tiles.set(t.id, a);
    }
    const el = a.el, on = t.id === selId;
    Object.assign(el.style, { left: (i % COLS) * CELL + 'px', top: Math.floor(i / COLS) * CELL + 'px' });
    a.rf.dataset.rarity = t.uniform ? 'common' : t.rarity;
    a.rf.toggleAttribute('data-dim', !t.wearable && !t.locked);
    el.querySelector('.sa-brackets').hidden = !on;
    el.toggleAttribute('data-on', t.equipped);
    el.toggleAttribute('data-off', t.locked);
    el.toggleAttribute('data-locked', t.locked);
    el.toggleAttribute('data-equipped', t.equipped);
    el.setAttribute('aria-selected', String(on));
    el.setAttribute('aria-label', `${t.name}${t.equipped ? ', worn' : t.locked ? ', locked' : ''}`);
    el.title = t.locked ? t.status : t.reason || t.name;
    return a;
  }
  function renderGrid(v) {
    const body = v.body, kids = [];
    if (v.empty && !v.uniforms.length) kids.push(h('div', 'wd-empty sa-t sa-w', {}, [h('div', null, { text: v.emptyAll ? 'Your wardrobe is empty.' : v.emptyText }),
      h('div', null, { text: v.hint })]));
    v.tiles.forEach((t, i) => kids.push(tileEl(t, body, v.selected?.id, i).el));
    if (kids.length !== grid.children.length || kids.some((k, i) => grid.children[i] !== k)) grid.replaceChildren(...kids);
    for (const t of v.tiles) {
      const a = tiles.get(t.id);
      if (!a.handle) a.handle = renderItemArt(a.art, t.item, { body, size: 48 });
    }
  }
  // the bust: the saved look of the world, with the selected item tried on when this body can wear it there
  const STATE_TEXT = { wearing: 'Wearing', preview: 'Previewing', cant: "Can't wear", locked: 'Locked' };
  function renderBust(v, t) {
    const pv = previewOf(st.info, t, v.world), state = t?.locked ? 'locked' : pv.state;
    const hex = pv.parts.map(n => (n & 255).toString(16).padStart(2, '0')).join('');
    if (wu.dataset.look !== hex || wu.dataset.body !== v.body) {
      bustDraw?.destroy();
      wu.dataset.body = v.body;
      bustDraw = renderWaistUp(wu, pv.parts, { gender: v.body, world: v.world });
    }
    bust.dataset.state = stateEl.dataset.state = state;
    stateEl.toggleAttribute('data-on', state === 'preview');
    stateEl.toggleAttribute('data-hi', state === 'wearing');
    stateEl.firstChild.textContent = STATE_TEXT[state];
    wu.setAttribute('aria-label', state === 'preview' ? `Your look wearing ${t.name}` : 'Your look');
  }
  function renderDetail(v) {
    const t = v.selected;
    renderBust(v, t);
    offBtn.hidden = !t?.canTakeOff;
    if (!t) {
      bigArt?.destroy(); bigArt = null; delete info.dataset.key;
      info.replaceChildren(h('div', 'wd-none sa-t sa-w', { text: v.emptyAll ? 'Items you win from boxes appear here.' : 'Choose an item to try it on.' }));
      equipBtn.disabled = true; equipBtn.firstChild.textContent = 'Equip';
      return;
    }
    const it = t.item, key = `${t.id}|${v.body}`;
    const rarity = t.uniform ? 'common' : t.rarity;
    let rf = info.querySelector(':scope > .de-rf');
    if (info.dataset.key !== key || !rf) {
      bigArt?.destroy();
      info.dataset.key = key;
      const art = h('div', 'art');
      rf = h('div', 'de-rf', {}, h('div', 'well', {}, art));
      bigArt = renderItemArt(art, it, { body: v.body, size: 52, max: 2 });
    }
    rf.dataset.rarity = rarity;
    rf.toggleAttribute('data-locked', t.locked);
    rf.toggleAttribute('data-dim', !t.wearable && !t.locked);
    const head = h('div', 'wd-head', {}, [h('div', 'wd-name sa-t24 sa-w', { text: t.name, title: t.name }),
      h('div', 'wd-rl sa-t sa-w', { 'data-rarity': rarity, text: rarityWord(t) })]);
    // one short line: why it can't be worn (or the server's last answer), else where it is worn
    const uniformNoApi = t.uniform && !t.locked && typeof api.setAppearance !== 'function';
    const why = st.why || (t.equipped ? null : t.locked ? { text: t.status + '.', tone: 'warn' } : !t.wearable ? { text: t.reason, tone: 'warn' }
      : uniformNoApi ? { text: 'Wear this uniform from the avatar editor.', tone: 'info' } : null);
    const lines = [];
    if (why) lines.push(h('div', 'wd-why sa-t sa-w', { 'data-tone': why.tone, role: why.tone === 'error' ? 'alert' : why.tone === 'ok' ? 'status' : undefined, text: why.text }));
    if (!why && t.spares) lines.push(h('div', 'sa-t sa-w', { text: `${t.spares} spare${t.spares === 1 ? '' : 's'}: trade in Card Swap.` }));
    info.replaceChildren(rf, head, h('div', 'wd-lines', {}, lines));
    const can = !t.equipped && t.wearable && !t.locked && !uniformNoApi && !st.busy;
    equipBtn.disabled = !can;
    equipBtn.dataset.state = st.busy ? 'busy' : t.equipped ? 'on' : '';
    equipBtn.title = can ? 'Wear it' : t.equipped ? 'You are wearing it' : '';
    equipBtn.firstChild.textContent = st.busy ? 'Saving…' : t.equipped ? 'Worn' : 'Equip';
    offBtn.disabled = st.busy;
  }
  async function equip() {
    const v = view(), t = v.selected;
    if (!t || st.busy || t.equipped || !t.wearable || t.locked) return;
    const w = v.world;
    st.busy = true; st.why = null; render();
    try {
      if (t.uniform) {
        if (typeof api.setAppearance !== 'function') throw { message: 'Wear this uniform from the avatar editor.' };
        const r = await api.setAppearance(w, uniformParts(st.info, t.item, w));
        if (r?.info) st.info = r.info;
      } else {
        const r = await api.equip(t.id, w);
        if (r?.info) st.info = r.info;
      }
      if (closed) return;
      st.why = { text: 'Equipped. Others see your new look.', tone: 'ok' };
    } catch (e) {
      if (closed) return;
      st.why = { text: e?.message || 'Something went wrong. Please try again.', tone: 'error' };
    } finally { st.busy = false; }
    render();
  }
  async function takeOff() {
    const v = view(), t = v.selected, parts = takeOffParts(st.info, t, v.world);
    if (!parts || st.busy) return;
    st.busy = true; st.why = null; render();
    try {
      const r = await api.setAppearance(v.world, parts);
      if (r?.info) st.info = r.info;
      if (closed) return;
      st.why = { text: 'Taken off.', tone: 'ok' };
    } catch (e) {
      if (closed) return;
      st.why = { text: e?.message || 'Something went wrong. Please try again.', tone: 'error' };
    } finally { st.busy = false; }
    render();
  }
  function close() {
    if (closed) return;
    closed = true; open = null;
    unsub();
    ro?.disconnect();
    removeEventListener('resize', place);
    for (const t of ['keydown', 'keyup', 'keypress']) removeEventListener(t, outside, true);
    for (const a of tiles.values()) a.handle?.destroy();
    bigArt?.destroy(); bustDraw?.destroy();
    root.remove();
    onClose.forEach(f => { try { f(); } catch {} });
  }
  open = { close, focus(id) {
    if (id) { st.selectedId = id; st.tab = tabOfId(st.info, id) || st.tab; }
    load(true); render(); root.focus({ preventScroll: true });
  } };
  render();
  load(!!focusId);
  return close;
}
/** Whether a Wardrobe is open (the menu bar's launcher hides meanwhile). */
export const isWardrobeOpen = () => !!open;
const onClose = new Set();
/** cb() whenever a Wardrobe closes; -> unsubscribe. */
export const onWardrobeClose = cb => { onClose.add(cb); return () => onClose.delete(cb); };
const CSS_ESC = s => (globalThis.CSS?.escape ? globalThis.CSS.escape(s) : String(s).replace(/["\\]/g, '\\$&'));
