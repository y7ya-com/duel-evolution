// The Wardrobe: the cosmetics a player owns, with their real in-game art (cosmetics/art.js), to see and equip per world.
// An overlay over whatever scene is up (the Card Shop, a lobby, My Room), built as the native shop builds a category
// (cosmetics/shopart.js: the game's own shop sprites): the glass window with its dark band and title plate, the
// Avatar Parts list's row plates (cyan = selected, light = worn), and the side column: the player's waist-up bust
// (cosmetics/waistup.js, the game's own bust from its own parts) in the selection frame, wearing the selected item
// (a try-on: the saved look is unchanged until Equip), its state ("Wearing" / "Previewing" / why not), the item's own
// art and detail on the dark band, the orange Equip pill and the cyan Close pill. Laid out in game px on a
// 1024 x 768 stage that follows the canvas (crisp at any DPR).
//   openWardrobe({ focusId, world }) -> close(): opens it (or, already open, selects focusId there); focusId an item id
//     (the box reveal's reward), world 0 Domino City / 1 Duel Academy (default: the world the character is in)
// Callers: the shop's Wardrobe button and the box reveal (cosmetics/boxes*.js).
// Data: cosmetics/api.js getInfo (inventory, appearance per world, rank), equip(id, world) (the server's error text on
// a refusal); the view model is cosmetics/wardrobe-model.js. The rank uniforms are worn through api.setAppearance when
// api.js has it (POST /appearance: they are not catalog items); without it the panel says where to wear them.
// Keys: Esc closes, the arrows move through the list, Enter equips. While it is up no key or click reaches the game.
import * as api from './api.js';
import { injectTheme, RARITY, WORLD_LABEL, BODY_LABEL } from './theme.js';
import { injectShopSkin } from './shopart.js';
import { renderItemArt } from './art.js';
import { renderWaistUp } from './waistup.js';
import { wardrobeView, tabOfId, uniformParts, previewOf, WORLDS } from './wardrobe-model.js';

// The layout (stage px): the window (512 x 590, the shop's) at 118, 89 and the side column (260) at 646, 16 apart, the
// pair centred on the stage. One grid in the window: its content spans 24..488 (the window's centre 256), the tabs
// and the world switch four 110 plates 8 apart on it, the rows 464 wide on the same edges. The side column is one
// width top to bottom: the bust's frame, the detail band, Equip, Close, 10 apart.
const CSS = `
.de-wd { position: fixed; left: 0; top: 0; width: 1024px; height: 768px; transform-origin: 0 0; z-index: 2147483000;
  pointer-events: auto; outline: none; }
.de-wd .wd-dim { position: absolute; inset: 0; background: rgba(2,9,16,.88); animation: wd-fade .18s ease-out; }
.de-wd .wd-win { position: absolute; left: 118px; top: 89px; width: 512px; height: 590px; animation: wd-fade .18s ease-out; }
.de-wd .wd-win > .sa-glass { left: 0; top: 0; width: 512px; height: 590px; }
.de-wd .wd-win > .sa-glass::before { opacity: .9; }
.de-wd .wd-win > .sa-band { left: 7px; top: 4px; width: 498px; height: 88px; }
/* the band: what the panel does, two lines on the grid's left edge; the title plate on its lower left (the shop's
   place) and the world switch on the same row, on the grid's last two columns */
.de-wd .wd-hint { position: absolute; left: 24px; top: 13px; width: 464px; }
.de-wd .wd-hint > div { height: 18px; line-height: 18px; overflow: hidden; text-overflow: ellipsis; }
.de-wd .wd-win > .sa-title { left: -10px; top: 67px; width: 256px; }
.de-wd .wd-worlds .sa-plate, .de-wd .wd-tabs .sa-plate { width: 110px; height: 36px; display: flex; align-items: center;
  justify-content: center; text-align: center; }
.de-wd .wd-worlds .sa-plate { top: 67px; }
.de-wd .wd-tabs .sa-plate { top: 112px; }
/* the list: the Avatar Parts rows, nine whole rows */
.de-wd .wd-list { position: absolute; left: 24px; top: 158px; width: 480px; height: 392px; overflow-y: auto; overflow-x: hidden;
  scrollbar-width: thin; scrollbar-color: #8fa2ad rgba(0,0,0,.12); }
.de-wd .wd-row { position: relative; display: block; width: 464px; height: 40px; margin: 0 0 4px; }
.de-wd .wd-row:last-child { margin-bottom: 0; }
.de-wd .wd-row > .de-rf { position: absolute; left: 8px; top: 5px; width: 30px; height: 30px; padding: 2px; }
.de-wd .wd-row > .nm, .de-wd .wd-row > .wr { position: absolute; top: 0; height: 40px; line-height: 40px; }
.de-wd .wd-row > .nm { left: 48px; right: 96px; overflow: hidden; text-overflow: ellipsis; text-align: left; }
.de-wd .wd-row > .wr { right: 18px; width: 72px; text-align: right; color: #003c78; }
.de-wd .wd-row[data-off] > .nm, .de-wd .wd-row[data-off] > .wr { color: #e8e8e8; text-shadow: 1px 1px 0 rgba(0,0,0,.4); }
.de-wd .wd-row[data-locked] > .de-rf > .well > .de-art { opacity: .35; filter: grayscale(1); }
.de-wd .wd-row[data-cant] > .nm { color: #555; }
.de-wd .wd-row:focus-visible { outline: none; }
.de-wd .wd-row:focus-visible::after { content: ''; position: absolute; inset: 4px 8px; outline: 1px dotted #000; }
.de-wd .wd-empty { position: absolute; left: 0; top: 120px; width: 464px; text-align: center; white-space: normal; line-height: 18px; }
.de-wd .wd-skel { position: relative; width: 464px; height: 40px; margin: 0 0 4px; }
.de-wd .wd-foot { position: absolute; left: 24px; top: 560px; width: 464px; height: 16px; line-height: 16px; text-align: center;
  overflow: hidden; text-overflow: ellipsis; }
/* the side column: the bust in the selection frame (on the shop's glass), its state on the frame's foot, the detail
   band (the item's own art, its name, why), Equip and Close */
.de-wd .wd-side { position: absolute; left: 646px; top: 89px; width: 260px; height: 590px; }
.de-wd .wd-bust { position: absolute; left: 0; top: 0; width: 260px; height: 292px; }
.de-wd .wd-bust > .sa-glass { left: 17px; top: 18px; width: 226px; height: 256px; }
/* an opaque well under the glass (the sprite is see-through: the scene behind must not show through the bust) */
.de-wd .wd-bust::before { content: ''; position: absolute; left: 17px; top: 18px; width: 226px; height: 256px;
  background: linear-gradient(#eef2f4, #d3dce1); }
.de-wd .wd-bust > .wd-wu { position: absolute; left: 17px; top: 18px; width: 226px; height: 256px; }
.de-wd .wd-bust > .sa-frame { left: 0; top: 0; width: 260px; height: 292px; }
.de-wd .wd-state { left: 60px; top: 278px; width: 140px; height: 28px; display: flex; align-items: center; justify-content: center; }
.de-wd .wd-state[data-state=cant] .sa-t { color: #5a1d00; }
.de-wd .wd-side > .sa-band { left: 0; top: 314px; width: 260px; height: 156px; }
.de-wd .wd-info { position: absolute; left: 0; top: 314px; width: 260px; height: 156px; overflow: hidden; }
.de-wd .wd-info > .de-rf { left: 12px; top: 16px; width: 48px; height: 48px; padding: 3px; }
.de-wd .wd-info > .de-rf[data-locked] > .well > .de-art { filter: grayscale(1) brightness(.6); opacity: .6; }
.de-wd .wd-head { position: absolute; left: 72px; top: 8px; width: 176px; height: 64px; display: flex; flex-direction: column;
  justify-content: center; }
.de-wd .wd-name { line-height: 22px !important; max-height: 44px; overflow: hidden; white-space: normal;
  display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; }
.de-wd .wd-lines { position: absolute; left: 12px; top: 80px; width: 236px; }
.de-wd .wd-lines > div { line-height: 17px; white-space: normal; }
.de-wd .wd-rl { line-height: 17px; }
.de-wd .wd-rl[data-rarity=common] { color: #e4eaee; } .de-wd .wd-rl[data-rarity=rare] { color: #8fe6ff; }
.de-wd .wd-rl[data-rarity=super] { color: #d6b8ff; } .de-wd .wd-rl[data-rarity=ultra] { color: #ffd862; }
.de-wd .wd-why { max-height: 51px; overflow: hidden; }
.de-wd .wd-why[data-tone=warn], .de-wd .wd-why[data-tone=error] { color: #ffd0b0; }
.de-wd .wd-why[data-tone=ok] { color: #b8ffc8; }
.de-wd .wd-side > .sa-pill { left: 0; width: 260px; }
.de-wd .wd-equip { top: 480px; }
.de-wd .wd-close { top: 540px; }
.de-wd .wd-none { position: absolute; left: 12px; top: 16px; width: 236px; white-space: normal; line-height: 17px; }
.de-wd .wd-fail { position: absolute; left: 0; top: 110px; width: 464px; text-align: center; white-space: normal; }
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

/** Open the Wardrobe over the current scene. -> close(). Opened again while open: selects focusId in it. */
export function openWardrobe({ focusId, world } = {}) {
  if (open) { open.focus(focusId, world); return open.close; }
  injectTheme();
  injectShopSkin();
  if (!document.getElementById('de-wardrobe-css')) document.head.append(h('style', null, { id: 'de-wardrobe-css', text: CSS }));
  const st = { info: api.peekInfo?.() || null, world, tab: 'outfit', selectedId: focusId || null, busy: false, loadError: null, why: null };
  if (focusId && st.info) st.tab = tabOfId(st.info, focusId) || st.tab;
  const root = h('div', 'de-c de-wd', { role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Wardrobe', tabindex: '-1' });
  const dim = h('div', 'wd-dim', { on: { click: () => close() } });
  const win = h('div', 'wd-win');
  const side = h('div', 'wd-side');
  root.append(dim, win, side);
  const worlds = h('div', 'wd-worlds', { role: 'group', 'aria-label': 'World' });
  const tabs = h('div', 'wd-tabs', { role: 'tablist', 'aria-label': 'Wearables' });
  const list = h('div', 'yo2-scroll-list wd-list', { role: 'listbox', 'aria-label': 'Your wearables', tabindex: '-1' });
  const foot = h('div', 'wd-foot sa-t');
  const hint = h('div', 'wd-hint sa-t sa-w', { 'aria-live': 'polite' });
  win.append(h('div', 'sa-glass'), h('div', 'sa-band'), hint, h('div', 'sa-title', { text: 'Wardrobe' }), worlds, tabs, list, foot);
  WORLDS.forEach((w, i) => worlds.append(h('button', 'sa-plate', { type: 'button', 'data-world': w.id, style: { left: 260 + i * 118 + 'px' },
    on: { click: () => { st.world = w.id; st.why = null; render(); } } }, t16(w.label))));
  // the bust (the frame, the glass under it, the bust's own canvas) and its state plate
  const wu = h('div', 'wd-wu', { role: 'img', 'aria-label': 'Your avatar' });
  const bust = h('div', 'wd-bust', {}, [h('div', 'sa-glass'), wu, h('div', 'sa-frame')]);
  const stateEl = h('div', 'sa-plate wd-state', { role: 'status' }, t16('Wearing'));
  const info = h('div', 'wd-info');
  const equipBtn = h('button', 'sa-pill wd-equip', { type: 'button', 'data-tone': 'go', on: { click: () => equip() } }, h('span', null, { text: 'Equip' }));
  side.append(bust, stateEl, h('div', 'sa-band'), info, equipBtn, h('button', 'sa-pill wd-close', { type: 'button', 'aria-label': 'Close', title: 'Close (Esc)', on: { click: () => close() } }, h('span', null, { text: 'Close' })));
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
    const step = { ArrowUp: -1, ArrowDown: 1, ArrowLeft: -1, ArrowRight: 1 }[e.key];
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
  const rows = new Map();   // item id -> { el, art, body, handle }
  let bigArt = null, bustDraw = null, closed = false;

  const view = () => st.info ? wardrobeView(st.info, st) : { tiles: [], tabs: [], selected: null, loading: true };
  const rowOf = id => list.querySelector(`[data-id="${CSS_ESC(id)}"]`);
  function select(id, scroll) {
    st.selectedId = id; st.why = null;
    render();
    if (scroll) rowOf(id)?.scrollIntoView({ block: 'nearest' });
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
      if (first) rowOf(st.selectedId || focusId)?.scrollIntoView({ block: 'nearest' });
    }, e => { if (!closed) { st.loadError = e?.message || 'Couldn\'t load your wardrobe.'; render(); } });
  }

  function render() {
    if (closed) return;
    const v = view();
    const w = st.world ?? (st.info?.appearance?.world === 0 ? 0 : 1);
    for (const b of worlds.children) { const on = +b.dataset.world === w; b.setAttribute('aria-pressed', String(on)); b.toggleAttribute('data-on', on); }
    const tl = v.tabs.length ? v.tabs : [{ id: 'outfit', label: 'Outfits' }, { id: 'hair', label: 'Hair' }, { id: 'accessory', label: 'Accessories' }, { id: 'dueldisk', label: 'Duel Disks' }];
    tabs.replaceChildren(...tl.map((t, i) => {
      const on = t.id === st.tab;
      return h('button', 'sa-plate wd-tab', { type: 'button', role: 'tab', 'aria-selected': String(on), 'data-tab': t.id, 'data-on': on,
        'data-count': t.count, style: { left: 24 + i * 118 + 'px' },
        on: { click: () => { if (st.tab !== t.id) { st.tab = t.id; st.selectedId = null; st.why = null; list.scrollTop = 0; render(); } } } }, t16(t.label));
    }));
    if (st.loadError) { renderFail(); return; }
    if (!st.info) { renderSkeleton(); return; }
    hint.replaceChildren(h('div', null, { text: 'Choose an item to try it on.' }),
      h('div', null, { text: `Equip saves it to your ${WORLD_LABEL[v.world]} look.` }));
    renderList(v);
    renderDetail(v);
    const g = v.graduation;
    foot.textContent = g.text;
    foot.title = g.graduated ? '' : 'Graduating lets you wear your Domino City outfits at Duel Academy.';
  }
  function renderFail() {
    info.replaceChildren(); foot.textContent = ''; hint.replaceChildren();
    equipBtn.disabled = true;
    list.replaceChildren(h('div', 'wd-fail sa-t', {}, [h('div', null, { text: st.loadError }),
      h('button', 'sa-btn2', { type: 'button', on: { click: () => load(true) } }, t16('Try again'))]));
  }
  function renderSkeleton() {
    if (list.firstChild?.classList.contains('wd-skel')) return;
    list.replaceChildren(...Array.from({ length: 6 }, () => h('div', 'wd-skel de-skel')));
    info.replaceChildren(h('div', 'wd-none sa-t sa-w', { text: 'Opening your wardrobe…' }));
    equipBtn.disabled = true;
  }
  function rowEl(t, body, selId) {
    let a = rows.get(t.id);
    if (!a || a.body !== body) {
      a?.handle?.destroy();
      const el = h('button', 'sa-row wd-row', { type: 'button', role: 'option', 'data-id': t.id, on: { click: () => select(t.id), dblclick: () => { select(t.id); equip(); } } });
      const art = h('div', 'art'), rf = h('div', 'de-rf', {}, h('div', 'well', {}, art));
      el.append(rf, h('span', 'sa-t nm'), h('span', 'sa-t wr'));
      a = { el, art, rf, body, handle: null };
      rows.set(t.id, a);
    }
    const el = a.el, on = t.id === selId;
    a.rf.dataset.rarity = t.uniform ? 'common' : t.rarity;
    a.rf.toggleAttribute('data-dim', !t.wearable && !t.locked);
    el.toggleAttribute('data-on', on);
    el.toggleAttribute('data-hi', !on && t.equipped);
    el.toggleAttribute('data-off', t.locked && !on);
    el.toggleAttribute('data-cant', !t.wearable && !t.locked);
    el.toggleAttribute('data-locked', t.locked);
    el.toggleAttribute('data-equipped', t.equipped);
    el.setAttribute('aria-selected', String(on));
    el.title = t.locked ? t.status : t.reason || '';
    el.querySelector('.nm').textContent = t.spares ? `${t.name}  ×${t.spares + 1}` : t.name;
    el.querySelector('.wr').textContent = t.equipped ? 'Wearing' : t.locked ? 'Locked' : '';
    return a;
  }
  function renderList(v) {
    const body = v.body, kids = [];
    if (v.empty && !v.uniforms.length) kids.push(h('div', 'wd-empty sa-t sa-w', {}, [h('div', null, { text: v.emptyAll ? 'Your wardrobe is empty.' : v.emptyText }),
      h('div', null, { text: v.hint })]));
    for (const t of v.tiles) kids.push(rowEl(t, body, v.selected?.id).el);
    // the same nodes in the new order (a row keeps its drawn art)
    if (kids.length !== list.children.length || kids.some((k, i) => list.children[i] !== k)) list.replaceChildren(...kids);
    for (const t of v.tiles) {
      const a = rows.get(t.id);
      if (!a.handle) a.handle = renderItemArt(a.art, t.item, { body, size: 26 });
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
    wu.setAttribute('aria-label', state === 'preview' ? `Your ${WORLD_LABEL[v.world]} look wearing ${t.name}` : `Your ${WORLD_LABEL[v.world]} look`);
  }
  function renderDetail(v) {
    const t = v.selected;
    renderBust(v, t);
    if (!t) {
      bigArt?.destroy(); bigArt = null; delete info.dataset.key;
      info.replaceChildren(h('div', 'wd-none sa-t sa-w', { text: v.emptyAll ? 'Wearables you win from boxes appear here.' : 'Choose an item to try it on.' }));
      equipBtn.disabled = true; equipBtn.firstChild.textContent = 'Equip';
      return;
    }
    const w = v.world, it = t.item, key = `${t.id}|${v.body}`;
    const rarity = t.uniform ? 'common' : t.rarity;
    // the item's own art (its chibi part, as the rows show it), kept while the same item stays selected
    let rf = info.querySelector(':scope > .de-rf');
    if (info.dataset.key !== key || !rf) {
      bigArt?.destroy();
      info.dataset.key = key;
      const art = h('div', 'art');
      rf = h('div', 'de-rf', {}, h('div', 'well', {}, art));
      bigArt = renderItemArt(art, it, { body: v.body, size: 40, max: 2 });
    }
    rf.dataset.rarity = rarity;
    rf.toggleAttribute('data-locked', t.locked);
    rf.toggleAttribute('data-dim', !t.wearable && !t.locked);
    const head = h('div', 'wd-head', {}, [h('div', 'wd-name sa-t24 sa-w', { text: t.name, title: t.name }),
      h('div', 'wd-rl sa-t sa-w', { 'data-rarity': rarity, text: rarityWord(t) })]);
    // the reason it can't be worn (or the server's last answer): it takes the band's last lines
    const uniformNoApi = t.uniform && !t.locked && typeof api.setAppearance !== 'function';
    const why = st.why || (t.equipped ? null : t.locked ? { text: t.status + '.', tone: 'warn' } : !t.wearable ? { text: t.reason, tone: 'warn' }
      : uniformNoApi ? { text: 'Put this uniform on from the avatar editor for now.', tone: 'info' } : null);
    const lines = [];
    const line = text => lines.push(h('div', 'sa-t sa-w', { text }));
    if (t.uniform && !t.locked) line(t.status);
    else if (!t.uniform) {
      const bodies = (it.bodies || []).length >= 2 ? 'Both bodies' : `${BODY_LABEL[(it.bodies || [])[0]] || 'One'} body only for now`;
      line(t.worlds.length ? `${bodies} · ${t.where === 'Both worlds' ? 'both worlds' : t.where}` : bodies);
      if (t.spares && !why) line(`You have ${t.spares + 1}. Trading spare copies is coming soon.`);
    }
    if (t.equippedIn.length && !why) line(`Wearing it in ${t.equippedIn.map(x => WORLD_LABEL[x]).join(' and ')}`);
    if (why) lines.push(h('div', 'wd-why sa-t sa-w', { 'data-tone': why.tone, role: why.tone === 'error' ? 'alert' : why.tone === 'ok' ? 'status' : undefined, text: why.text }));
    info.replaceChildren(rf, head, h('div', 'wd-lines', {}, lines));
    const can = !t.equipped && t.wearable && !t.locked && !uniformNoApi && !st.busy;
    equipBtn.disabled = !can;
    equipBtn.dataset.state = st.busy ? 'busy' : t.equipped ? 'on' : '';
    equipBtn.title = can ? `Wear it in ${WORLD_LABEL[w]}` : t.equipped ? `You are wearing it in ${WORLD_LABEL[w]}` : '';
    equipBtn.firstChild.textContent = st.busy ? 'Equipping…' : 'Equip';
  }
  async function equip() {
    const v = view(), t = v.selected;
    if (!t || st.busy || t.equipped || !t.wearable || t.locked) return;
    const w = v.world;
    st.busy = true; st.why = null; render();
    try {
      if (t.uniform) {
        if (typeof api.setAppearance !== 'function') throw { message: 'Put this uniform on from the avatar editor for now.' };
        const r = await api.setAppearance(w, uniformParts(st.info, t.item, w));
        if (r?.info) st.info = r.info;
      } else {
        const r = await api.equip(t.id, w);
        if (r?.info) st.info = r.info;
      }
      if (closed) return;
      st.why = { text: `Equipped in ${WORLD_LABEL[w]}. Other players see your new look.`, tone: 'ok' };
    } catch (e) {
      if (closed) return;
      st.why = { text: e?.message || 'Something went wrong. Please try again.', tone: 'error' };
    } finally { st.busy = false; }
    render();
    rowOf(t.id)?.scrollIntoView({ block: 'nearest' });   // the worn row moves to the top
  }
  function close() {
    if (closed) return;
    closed = true; open = null;
    unsub();
    ro?.disconnect();
    removeEventListener('resize', place);
    for (const t of ['keydown', 'keyup', 'keypress']) removeEventListener(t, outside, true);
    for (const a of rows.values()) a.handle?.destroy();
    bigArt?.destroy(); bustDraw?.destroy();
    root.remove();
  }
  open = { close, focus(id, wd) {
    if (wd === 0 || wd === 1) st.world = wd;
    if (id) { st.selectedId = id; st.tab = tabOfId(st.info, id) || st.tab; }
    load(true); render(); root.focus({ preventScroll: true });
  } };
  render();
  load(!!focusId);   // a reward just opened: the inventory must have it
  return close;
}
const CSS_ESC = s => (globalThis.CSS?.escape ? globalThis.CSS.escape(s) : String(s).replace(/["\\]/g, '\\$&'));
