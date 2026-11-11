// The owned wardrobe, opened over the overworld from its menu bar. One look is worn everywhere.
// Three categories, named rarity-framed item cards, current/hovered try-on, and explicit Equip / Take off actions.
// Shop materials and palette come from theme.js and shopart.js; all game art is loaded at runtime.
// openWardrobe({ focusId }) -> close(). Esc closes, arrows select, Enter equips; input stays in the modal.
import * as api from './api.js';
import { injectTheme, RARITY } from './theme.js';
import { injectShopSkin } from './shopart.js';
import { renderItemArt } from './art.js';
import { renderWaistUp } from './waistup.js';
import { wardrobeView, wornRows, tabOfId, subOfId, uniformParts, previewOf, takeOffParts, thumbOf, SUBS, TABS } from './wardrobe-model.js';

// Layout on an 8px grid (game px, the 1024x768 stage): a 904x496 window centred on the stage, 24px padding, 16px
// gutters. A 72px header band (the title plate, the graduation meta, Back) over three 384px columns: the tabs and a
// 3-wide grid of 96x124 cards (304; two and a half rows show), the try-on (272), the details (248). The try-on is the
// bust's height: the whole bust (272x336) under 48px of headroom, room for the state chip over the tallest hair (the
// Afros reach the bust's top edge). The skin is the box shop's (shopart.js): the light
// glass window, its dark band, the cyan title plate, the price tag plates for tabs and name tags, the yellow corner
// brackets on the selection, the side pills (orange Equip, cyan Take off and Back). Dark Arial on the light glass.
const CSS = `
.de-wd { position:fixed; left:0; top:0; width:1024px; height:768px; transform-origin:0 0; z-index:2147483000; pointer-events:auto; outline:none; color:#000;
  --wd-line:rgba(40,72,92,.28); --wd-muted:#4d606b; --wd-cyan:#1fb3ef; }
.de-wd .wd-dim { position:absolute; inset:0; background:rgba(4,22,40,.5); animation:wd-fade .18s ease-out; }
.de-wd .wd-win { position:absolute; left:60px; top:136px; width:904px; height:496px; filter:drop-shadow(0 12px 28px rgba(0,20,40,.45)); animation:wd-fade .18s ease-out; }
.de-wd .wd-win::before { content:''; position:absolute; inset:8px; background:linear-gradient(rgba(236,244,248,.82),rgba(214,230,238,.82)); }
.de-wd .wd-win > .sa-glass { left:0; top:0; width:904px; height:496px; }
.de-wd .wd-win > .sa-band { left:0; top:0; width:904px; height:72px; }
.de-wd .wd-header { position:absolute; left:24px; top:0; width:856px; height:72px; display:flex; align-items:center; gap:16px; }
.de-wd .wd-header > .sa-title { position:relative; flex:none; width:192px; }
.de-wd .wd-meta { flex:1; min-width:0; overflow:hidden; text-overflow:ellipsis; font-variant-numeric:tabular-nums; }
.de-wd .wd-close { position:relative; flex:none; width:160px; }
.de-wd .wd-rule { display:none; }
.de-wd svg { display:block; fill:none; stroke:currentColor; stroke-width:2; stroke-linecap:round; stroke-linejoin:round; }

/* the tabs: three price tag plates, the selected one cyan (the box shop's Head & Hair / Outfit / Duel Disk) */
.de-wd .wd-tabs { position:absolute; left:24px; top:88px; width:304px; height:36px; display:flex; gap:8px; }
.de-wd .wd-tab { position:relative; flex:1 1 0; min-width:0; height:36px; display:flex; align-items:center; justify-content:center; gap:4px; font-size:12px; }
.de-wd .wd-tab .wd-n { color:#3d5260; }
.de-wd .wd-tab[aria-selected=true] .wd-n { color:#0b4660; }

/* the sub-categories (the character editor's): small plates under the tabs, wrapping; the grid starts 8px under them */
.de-wd .wd-subs { position:absolute; left:24px; top:132px; width:304px; display:flex; flex-wrap:wrap; gap:8px 6px; }
.de-wd .wd-subs:empty { display:none; }
.de-wd .wd-sub { height:24px; margin:0; padding:0 10px; display:flex; align-items:center; gap:4px; border:0; border-radius:12px; cursor:inherit; color:#000; font:12px/14px Arial,sans-serif;
  background:linear-gradient(#ffffff,#dde4e8); box-shadow:inset 0 0 0 1px rgba(60,80,92,.55),0 1px 2px rgba(0,30,50,.18); }
.de-wd .wd-sub > .n { color:#4d606b; font-variant-numeric:tabular-nums; }
.de-wd .wd-sub:hover { background:linear-gradient(#e2ffff,#a5ffff); }
.de-wd .wd-sub[aria-selected=true] { background:linear-gradient(#7ffeff,#1fb3ef); color:#05324a; box-shadow:inset 0 0 0 1px #0b4f6d,0 1px 2px rgba(0,30,50,.25); }
.de-wd .wd-sub[aria-selected=true] > .n { color:#0b4660; }
.de-wd .wd-sub:focus-visible { outline:2px solid #ffe600; outline-offset:1px; }
/* the grid: 96x124 cards, 8px apart (the pack display's cells: the framed art over its name tag); 8px spare for a scrollbar */
.de-wd .wd-grid { position:absolute; left:24px; top:140px; width:312px; height:332px; overflow-y:auto; overflow-x:hidden; scrollbar-width:thin; scrollbar-color:#8e8e8e transparent; }
.de-wd .wd-tile { position:absolute; width:96px; height:124px; margin:0; padding:0; border:0; border-radius:4px; cursor:inherit; color:#000; text-align:center;
  background:linear-gradient(rgba(255,255,255,.72),rgba(226,240,248,.6)); box-shadow:inset 0 0 0 1px rgba(110,140,158,.55),0 1px 2px rgba(0,30,50,.18); }
.de-wd .de-rf[data-free] { background:rgba(255,255,255,.5); border:0; box-shadow:none; }
.de-wd .de-rf[data-free]::after { content:'Free'; position:absolute; bottom:-3px; right:-3px; padding:1px 4px; background:#e0f5f4; color:#285454; font:10px/12px Arial,sans-serif; border-radius:3px; }
.de-wd .de-rf[data-free] .art.de-wu { width:100%; height:100%; }
.de-wd .de-rf[data-free] .art canvas { width:100%; height:100%; object-fit:contain; }
.de-wd .de-rf > .wd-chip { position:absolute; left:-4px; bottom:-4px; width:24px; height:24px; border-radius:12px; z-index:1; box-shadow:0 0 0 2px #fff,0 0 0 3px rgba(40,72,92,.5),0 1px 3px rgba(0,30,50,.35); }
.de-wd .wd-tile:hover { background:linear-gradient(rgba(255,255,255,.92),rgba(214,250,255,.8)); }
.de-wd .wd-tile[data-equipped] { box-shadow:inset 0 0 0 2px var(--wd-cyan),0 0 6px rgba(31,179,239,.55); }
.de-wd .wd-tile:focus-visible { outline:2px solid #ffe600; outline-offset:2px; }
.de-wd .wd-tile > .de-rf { position:absolute; left:16px; top:8px; width:64px; height:64px; padding:3px; pointer-events:none; }
.de-wd .wd-tile > .sa-brackets { left:-4px; top:-4px; width:104px; height:132px; display:none; }
.de-wd .wd-tile[aria-selected=true] > .sa-brackets, .de-wd .wd-tile:hover > .sa-brackets { display:block; }
.de-wd .wd-tile .wd-tag { left:4px; top:78px; width:88px; height:40px; display:flex; align-items:center; justify-content:center; pointer-events:none; }
.de-wd .wd-tile:hover .wd-tag:not([data-on]):not([data-off])::before { border-image-source:var(--sa-plateHi); background:var(--sa-plateHi-off,linear-gradient(#e2ffff,#a5ffff)); }
.de-wd .wd-tile .wd-tile-name { max-width:80px; display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical; overflow:hidden;
  font:12.5px/15px Arial,sans-serif; white-space:normal; overflow-wrap:anywhere; text-wrap:balance; }
.de-wd .wd-tile .wd-tag[data-off] .wd-tile-name { color:#eef1f2; text-shadow:1px 1px 0 rgba(0,0,0,.45); }
.de-wd .wd-tile .wd-badge { position:absolute; right:4px; top:4px; width:20px; height:20px; display:none; place-items:center; border-radius:10px; z-index:1; }
.de-wd .wd-tile .wd-badge > span { position:absolute; width:1px; height:1px; overflow:hidden; clip:rect(0 0 0 0); }
.de-wd .wd-tile[data-equipped] .wd-badge { display:grid; background:linear-gradient(#7ffeff,#1fb3ef); color:#05324a; box-shadow:0 0 0 1px #0b4f6d; }
.de-wd .wd-tile[data-locked] .wd-badge { display:grid; background:linear-gradient(#5d6b73,#2b363d); color:#ffd862; box-shadow:0 0 0 1px #1b252c; }
.de-wd .wd-tile[data-locked]:not([data-equipped]) { background:linear-gradient(rgba(200,210,216,.6),rgba(170,184,192,.55)); }
.de-wd .wd-tile[data-locked]:not([data-equipped]) > .de-rf { opacity:.6; filter:grayscale(.85); }
.de-wd .wd-empty, .de-wd .wd-fail { position:absolute; left:0; top:48px; width:304px; padding:0 24px; display:flex; flex-direction:column; align-items:center; text-align:center; white-space:normal; }
.de-wd .wd-empty > .ic { width:48px; height:48px; display:grid; place-items:center; margin-bottom:16px; border-radius:24px; background:rgba(255,255,255,.6);
  box-shadow:inset 0 0 0 1px var(--wd-line); color:#2a6f93; }
.de-wd .wd-empty > .t, .de-wd .wd-fail > .t { font:14.3px/20px Arial,sans-serif; color:#000; }
.de-wd .wd-empty > .s { margin-top:4px; text-wrap:balance; font:12.5px/18px Arial,sans-serif; color:var(--wd-muted); }
.de-wd .wd-skel { position:absolute; width:96px; height:124px; border-radius:4px; }

/* the try-on: the character's light sky backdrop in the selection frame */
.de-wd .wd-bust { position:absolute; left:344px; top:88px; width:272px; height:384px; overflow:hidden; border-radius:4px;
  background:radial-gradient(ellipse 85% 60% at 50% 58%,#f4fcff,#bfe6fa 60%,#8dcbf0); box-shadow:inset 0 0 0 1px rgba(40,110,150,.55); }
.de-wd .wd-bust::before { content:''; position:absolute; inset:0; background:linear-gradient(transparent 15px,rgba(255,255,255,.4) 15px) 0 0/16px 16px,linear-gradient(90deg,transparent 15px,rgba(255,255,255,.4) 15px) 0 0/16px 16px; }
.de-wd .wd-bust > .sa-glass { display:none; }
.de-wd .wd-bust > .sa-frame { left:-14px; top:-14px; width:300px; height:412px; z-index:1; }
.de-wd .wd-bust > .wd-wu { position:absolute; left:0; bottom:0; width:272px; height:336px; }
.de-wd .wd-state { position:absolute; left:16px; top:16px; height:24px; padding:0 10px 0 8px; display:flex; align-items:center; gap:6px; border-radius:12px; z-index:2;
  background:linear-gradient(#ffffff,#dde4e8); box-shadow:0 0 0 1px rgba(60,80,92,.6),0 1px 2px rgba(0,30,50,.25); color:#000; font:12.5px/16px Arial,sans-serif; }
.de-wd .wd-state::before { content:''; width:8px; height:8px; border-radius:4px; background:#8a9aa3; box-shadow:0 0 0 1px rgba(0,0,0,.3); }
.de-wd .wd-state[data-state=preview]::before { background:#ffb21c; } .de-wd .wd-state[data-state=wearing]::before { background:var(--wd-cyan); }
.de-wd .wd-state[data-state=locked]::before, .de-wd .wd-state[data-state=cant]::before { background:#e2541c; }

/* the details: a light panel (the avatar editor's), dark text */
.de-wd .wd-side { position:absolute; left:632px; top:88px; width:248px; height:384px; padding:16px; display:flex; flex-direction:column; border-radius:4px;
  background:linear-gradient(rgba(255,255,255,.66),rgba(232,244,250,.55)); box-shadow:inset 0 0 0 1px rgba(110,140,158,.55); }
.de-wd .wd-info { position:relative; flex:none; min-height:64px; display:flex; align-items:center; gap:12px; }
.de-wd .wd-info > .de-rf { position:relative; flex:none; width:64px; height:64px; padding:3px; }
.de-wd .wd-info > .de-rf[data-locked] > .well > .de-art { filter:grayscale(.8); opacity:.5; }
.de-wd .wd-head { flex:1; min-width:0; display:flex; flex-direction:column; gap:4px; }
.de-wd .wd-name { font:17px/21px Arial,sans-serif; color:#000; white-space:normal; display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical; overflow:hidden; }
.de-wd .wd-rl { font:12.5px/16px Arial,sans-serif; }
.de-wd .wd-rl[data-rarity=common] { color:#4d606b; } .de-wd .wd-rl[data-rarity=rare] { color:#0479ad; }
.de-wd .wd-rl[data-rarity=super] { color:#6a32bd; } .de-wd .wd-rl[data-rarity=ultra] { color:#9a6a00; }
.de-wd .wd-actions { flex:none; display:flex; gap:8px; margin-top:16px; }
.de-wd .wd-actions[hidden] { display:none; }
.de-wd .wd-btn { position:relative; flex:1 1 0; min-width:0; height:48px; line-height:48px; }
.de-wd .wd-btn[hidden] { display:none; }
.de-wd .wd-btn > span, .de-wd .wd-btn > svg { position:relative; }
.de-wd .wd-btn > span { padding:0 24px; }
.de-wd .wd-equip { display:flex; align-items:center; justify-content:center; gap:6px; }
.de-wd .wd-equip > span { padding:0; }
.de-wd .wd-equip[data-state=on] { color:#fff; }
.de-wd .wd-equip[data-state=on]::before { border-image-source:var(--sa-pillHi); background:var(--sa-pillHi-off,linear-gradient(#b4fbff,#52eefa 45%,#2ee8f8 55%,#6ff4fb)); }
.de-wd .wd-equip[data-state=on]:disabled { filter:none; color:#05324a; text-shadow:none; }
.de-wd .wd-equip[data-state=busy] { opacity:.8; }
.de-wd .wd-lines { flex:none; display:flex; flex-direction:column; gap:8px; margin-top:12px; }
.de-wd .wd-lines:empty { display:none; }
.de-wd .wd-lines > div { font:12.5px/18px Arial,sans-serif; white-space:normal; text-wrap:pretty; color:#24343d; }
.de-wd .wd-why[data-tone=warn], .de-wd .wd-why[data-tone=error] { color:#a33a00; }
.de-wd .wd-why[data-tone=ok] { color:#0d7a35; }
.de-wd .wd-none { font:14.3px/20px Arial,sans-serif; color:var(--wd-muted); white-space:normal; }
/* the current look: what is worn in each slot, at the panel's foot */
.de-wd .wd-look { flex:1 1 0; min-height:0; margin-top:16px; padding-top:12px; border-top:1px solid var(--wd-line); overflow-y:auto; scrollbar-width:thin; scrollbar-color:#8e8e8e transparent; }
.de-wd .wd-look > .lb { margin-bottom:4px; font:12.5px/16px Arial,sans-serif; color:var(--wd-muted); }
.de-wd .wd-look > button { width:100%; height:22px; margin:0; padding:0 4px; display:flex; align-items:center; gap:8px; border:0; border-radius:4px; background:transparent;
  color:#000; cursor:inherit; font:12.5px/16px Arial,sans-serif; text-align:left; }
.de-wd .wd-look > button:hover:not(:disabled) { background:rgba(127,254,255,.45); }
.de-wd .wd-look > button > .k { flex:none; width:76px; color:var(--wd-muted); }
.de-wd .wd-look > button > .v { flex:1; min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.de-wd .wd-look > button > .v[data-none] { color:var(--wd-muted); }
.de-wd .wd-fail .wd-btn { flex:none; width:144px; margin-top:16px; }
@keyframes wd-fade { from { opacity:0; } }
@media (prefers-reduced-motion:reduce) { .de-wd *, .de-wd *::before, .de-wd *::after { animation:none!important; transition:none!important; } }
`;
// 20px stroke icons (Lucide-style shapes, drawn here)
const ICON = {
  check: '<svg width="12" height="12" viewBox="0 0 24 24" style="stroke-width:3.5"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>',
  lock: '<svg width="11" height="11" viewBox="0 0 24 24" style="stroke-width:2.6"><rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/></svg>',
  hanger: '<svg width="24" height="24" viewBox="0 0 24 24" style="stroke-width:1.6"><path d="M12 7a2 2 0 1 1 2-2c0 1-.6 1.5-2 2.4L3.6 13.2A1.5 1.5 0 0 0 4.4 16h15.2a1.5 1.5 0 0 0 .8-2.8L12 7.4"/></svg>',
};
const icon = name => { const e = document.createElement('span'); e.innerHTML = ICON[name]; return e.firstChild; };

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
const rarityWord = t => t.free ? `Free ${(SUBS.find(s => s.id === t.sub)?.row || '').toLowerCase()}`.trim() : t.uniform ? 'Rank uniform' : `${RARITY[t.rarity]?.label || 'Common'} ${(t.slotName || t.kind || '').toLowerCase()}`.trim();

let open = null;   // the one open Wardrobe: { close, focus(id) }
export const COLS = 3, CELL = 104, ROW = 132;   // three 96x124 cards, 8px apart

/** Open the Wardrobe over the current scene. -> close(). Opened again while open: selects focusId in it. */
export function openWardrobe({ focusId } = {}) {
  if (open) { open.focus(focusId); return open.close; }
  injectTheme();
  injectShopSkin();
  if (!document.getElementById('de-wardrobe-css')) document.head.append(h('style', null, { id: 'de-wardrobe-css', text: CSS }));
  const st = { info: api.peekInfo?.() || null, world: null, tab: 'outfit', sub: null, selectedId: focusId || null, busy: false, loadError: null, why: null };
  if (focusId && st.info) { st.tab = tabOfId(st.info, focusId) || st.tab; st.sub = subOfId(st.info, focusId); }
  const root = h('div', 'de-c de-wd', { role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Wardrobe', tabindex: '-1' });
  const dim = h('div', 'wd-dim', { on: { click: () => close() } });
  const win = h('div', 'wd-win');
  root.append(dim, win);
  const tabs = h('div', 'wd-tabs', { role: 'tablist', 'aria-label': 'Wearables' });
  const subs = h('div', 'wd-subs', { role: 'tablist', 'aria-label': 'Categories' });
  const grid = h('div', 'yo2-scroll-list wd-grid', { role: 'listbox', 'aria-label': 'Your wearables', tabindex: '-1' });
  const meta = h('div', 'sa-t sa-w wd-meta');
  const wu = h('div', 'wd-wu', { role: 'img', 'aria-label': 'Your avatar' });
  const stateEl = h('div', 'wd-state', { role: 'status' }, document.createTextNode('Wearing'));
  const bust = h('div', 'wd-bust', {}, [h('div', 'sa-glass'), wu, h('div', 'sa-frame'), stateEl]);
  const side = h('div', 'wd-side');
  const info = h('div', 'wd-info');
  const lines = h('div', 'wd-lines');
  const look = h('div', 'wd-look');
  const equipLabel = h('span', null, { text: 'Equip' }), equipCheck = icon('check');
  const equipBtn = h('button', 'sa-pill wd-btn wd-equip', { type: 'button', 'data-tone': 'go', on: { click: () => equip() } }, [equipCheck, equipLabel]);
  const offBtn = h('button', 'sa-pill wd-btn wd-off', { type: 'button', on: { click: () => takeOff() } }, h('span', null, { text: 'Take off' }));
  const actions = h('div', 'wd-actions', {}, [equipBtn, offBtn]);
  side.append(info, actions, lines, look);
  const closeBtn = h('button', 'sa-pill wd-close', { type: 'button', 'aria-label': 'Close', title: 'Close (Esc)', on: { click: () => close() } }, h('span', null, { text: 'Back' }));
  const header = h('div', 'wd-header', {}, [h('div', 'sa-title', { text: 'Wardrobe', role: 'heading', 'aria-level': '2' }), meta, closeBtn]);
  win.append(h('div', 'sa-glass'), h('div', 'sa-band'), header, h('div', 'wd-rule'), tabs, subs, grid, bust, side);
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
    if (step && rows.length && !e.target.closest?.('.wd-worlds, .wd-tabs, .wd-subs')) {
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
      if (first) { st.tab = tabOfId(i, focusId) || st.tab; st.sub = subOfId(i, focusId); st.tabFixed = true; }
      render();
      if (first) tileOf(st.selectedId || focusId)?.scrollIntoView({ block: 'nearest' });
    }, e => { if (!closed) { st.loadError = e?.message || 'Couldn\'t load your wardrobe.'; render(); } });
  }

  function render() {
    if (closed) return;
    const v = view();
    const tl = v.tabs.length ? v.tabs : TABS;
    tabs.replaceChildren(...tl.map(t => {
      const on = t.id === st.tab;
      return h('button', 'sa-plate wd-tab', { type: 'button', role: 'tab', 'aria-selected': String(on), 'data-tab': t.id, 'data-on': on, 'data-count': t.count,
        on: { click: () => { if (st.tab !== t.id) { st.tab = t.id; st.sub = null; st.selectedId = null; st.why = null; grid.scrollTop = 0; render(); } } } },
        [h('span', 'sa-t wd-tl', { text: t.label }), t.count != null && h('span', 'sa-t wd-n', { text: String(t.count), 'aria-hidden': 'true' })]);
    }));
    renderSubs(v);
    if (st.loadError) { renderFail(); return; }
    if (!st.info) { renderSkeleton(); return; }
    renderGrid(v);
    renderDetail(v);
    renderLook(v);
    meta.textContent = v.graduation.text;
  }
  // the tab's sub-categories (one grid at a time); the grid takes the column's height left under them
  function renderSubs(v) {
    subs.replaceChildren(...(v.subs || []).map(s => {
      const on = s.id === v.sub;
      return h('button', 'wd-sub', { type: 'button', role: 'tab', 'aria-selected': String(on), 'data-sub': s.id,
        on: { click: () => { if (st.sub !== s.id || !on) { st.sub = s.id; st.selectedId = null; st.why = null; grid.scrollTop = 0; render(); } } } },
        [h('span', null, { text: s.label }), h('span', 'n', { text: String(s.count), 'aria-hidden': 'true' })]);
    }));
    const top = v.subs?.length ? 132 + subs.offsetHeight + 8 : 140;
    Object.assign(grid.style, { top: top + 'px', height: 472 - top + 'px' });
  }
  function renderFail() {
    info.replaceChildren(); lines.replaceChildren(); look.replaceChildren(); meta.textContent = '';
    equipBtn.disabled = true; offBtn.hidden = true; actions.hidden = true;
    grid.replaceChildren(h('div', 'wd-fail', {}, [h('div', 't', { text: st.loadError }),
      h('button', 'sa-pill wd-btn wd-off', { type: 'button', on: { click: () => load(true) } }, h('span', null, { text: 'Try again' }))]));
  }
  function renderSkeleton() {
    if (grid.firstChild?.classList.contains('wd-skel')) return;
    grid.replaceChildren(...Array.from({ length: 8 }, (_, i) => h('div', 'wd-skel de-skel', { style: { left: (i % COLS) * CELL + 'px', top: Math.floor(i / COLS) * ROW + 'px' } })));
    info.replaceChildren(h('div', 'wd-none', { text: 'Opening your wardrobe…' }));
    equipBtn.disabled = true; offBtn.hidden = true; actions.hidden = true;
  }
  function itemPicture(el, t, body, world, size) {
    // a free part: the player's bust with that part swapped in (as the try-on shows it), framed on the part
    const th = thumbOf(t.item), rf = el.closest('.de-rf');
    rf?.querySelector(':scope > .wd-chip')?.remove();
    if (th.kind === 'art') return renderItemArt(el, t.item, { body, size });
    if (th.chip) rf?.append(h('span', 'wd-chip', { style: { background: th.chip }, 'aria-hidden': 'true' }));
    const v = (t.item.variants || []).find(x => x.gender === body), parts = [...previewOf(st.info, null, world).saved];
    if (v) parts[t.item.slot] = v.number;
    return renderWaistUp(el, parts, { gender: body, world, focus: th.steps, min: th.min, pad: th.pad });
  }
  function tileEl(t, body, selId, i) {
    let a = tiles.get(t.id);
    if (!a || a.body !== body) {
      a?.handle?.destroy();
      const el = h('button', 'wd-tile', { type: 'button', role: 'option', 'data-id': t.id, on: { click: () => select(t.id), dblclick: () => { select(t.id); equip(); }, mouseenter: () => { st.hoverId = t.id; renderBust(view(), view().tiles.find(x => x.id === t.id)); }, mouseleave: () => { st.hoverId = null; renderBust(view(), view().selected); } } });
      const art = h('div', 'art'), rf = h('div', 'de-rf', {}, h('div', 'well', {}, art));
      el.append(rf, h('div', 'sa-brackets'), h('span', 'sa-plate wd-tag', {}, h('span', 'wd-tile-name', { text: t.name })), h('span', 'wd-badge', {}, h('span')));
      a = { el, art, rf, body, handle: null, tag: el.querySelector('.wd-tag'), br: el.querySelector('.sa-brackets') };
      tiles.set(t.id, a);
    }
    const el = a.el, on = t.id === selId;
    const pinned = t.outfitLocked && t.equipped && t.item.slot === 6;
    // the corner badge: a lock when locked (even worn), else a check when worn; its words for screen readers
    const badge = el.querySelector('.wd-badge'), mark = t.locked || pinned ? 'lock' : t.equipped ? 'check' : '';
    if (badge.dataset.mark !== mark) { badge.dataset.mark = mark; badge.querySelector('svg')?.remove(); if (mark) badge.prepend(icon(mark)); }
    badge.lastChild.textContent = pinned ? 'Locked · LV 5' : t.locked ? 'Locked' : t.equipped ? 'Equipped' : '';
    el.toggleAttribute('data-pinned', pinned);
    Object.assign(el.style, { left: (i % COLS) * CELL + 'px', top: Math.floor(i / COLS) * ROW + 'px' });
    a.rf.toggleAttribute('data-free', t.free);
    a.rf.dataset.rarity = el.dataset.rarity = t.uniform ? 'common' : t.rarity;
    a.rf.toggleAttribute('data-dim', !t.wearable && !t.locked);
    el.toggleAttribute('data-on', t.equipped);
    el.toggleAttribute('data-off', t.locked);
    el.toggleAttribute('data-locked', t.locked || pinned);
    el.toggleAttribute('data-equipped', t.equipped);
    el.setAttribute('aria-selected', String(on));
    a.tag.toggleAttribute('data-on', on && !(t.locked || pinned));
    a.tag.toggleAttribute('data-off', !!(t.locked || pinned));
    a.br.toggleAttribute('data-hi', !on);
    el.setAttribute('aria-label', `${t.name}${t.equipped ? ', worn' : ''}${t.locked || pinned ? ', locked' : ''}`);
    el.title = t.locked || pinned ? t.status || t.reason || 'Locked' : t.reason || t.name;
    return a;
  }
  function renderGrid(v) {
    const body = v.body, kids = [];
    if (v.empty && !v.uniforms.length) kids.push(h('div', 'wd-empty', {}, [h('div', 'ic', {}, icon('hanger')),
      h('div', 't', { text: v.emptyAll ? 'Your wardrobe is empty.' : v.emptyText }), h('div', 's', { text: v.hint })]));
    v.tiles.forEach((t, i) => kids.push(tileEl(t, body, v.selected?.id, i).el));
    if (kids.length !== grid.children.length || kids.some((k, i) => grid.children[i] !== k)) grid.replaceChildren(...kids);
    for (const t of v.tiles) {
      const a = tiles.get(t.id);
      if (!a.handle) a.handle = itemPicture(a.art, t, body, v.world, 48);
    }
  }
  // the bust: the saved look of the world, with the selected item tried on when this body can wear it there
  const STATE_TEXT = { wearing: 'Wearing', preview: 'Previewing', cant: "Can't wear", locked: 'Locked' };
  function renderBust(v, t) {
    const pv = previewOf(st.info, t, v.world), state = t?.locked || (t?.outfitLocked && t?.equipped && t?.item.slot === 6) ? 'locked' : pv.state;
    const hex = pv.parts.map(n => (n & 255).toString(16).padStart(2, '0')).join('');
    if (wu.dataset.look !== hex || wu.dataset.body !== v.body) {
      bustDraw?.destroy();
      wu.dataset.body = v.body;
      bustDraw = renderWaistUp(wu, pv.parts, { gender: v.body, world: v.world });
    }
    bust.dataset.state = stateEl.dataset.state = state;
    stateEl.firstChild.textContent = t?.outfitLocked && t?.equipped && t?.item.slot === 6 ? 'Equipped · locked' : STATE_TEXT[state];
    wu.setAttribute('aria-label', state === 'preview' ? `Your look wearing ${t.name}` : 'Your look');
  }
  function renderDetail(v) {
    const t = v.selected;
    renderBust(v, t);
    offBtn.hidden = !t?.canTakeOff;
    actions.hidden = !t;   // nothing selected: no actions to offer
    if (!t) {
      bigArt?.destroy(); bigArt = null; delete info.dataset.key;
      info.replaceChildren(h('div', 'wd-none', { text: v.emptyAll ? 'Items you win from boxes appear here.' : 'Select an item to try it on.' }));
      lines.replaceChildren();
      equipBtn.disabled = true; delete equipBtn.dataset.state; equipLabel.textContent = 'Equip'; equipCheck.style.display = 'none';
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
      bigArt = itemPicture(art, t, v.body, v.world, 52);
    }
    rf.dataset.rarity = rarity;
    rf.toggleAttribute('data-free', t.free);
    rf.toggleAttribute('data-locked', t.locked);
    rf.toggleAttribute('data-dim', !t.wearable && !t.locked);
    const head = h('div', 'wd-head', {}, [h('div', 'wd-name', { text: t.name, title: t.name }),
      h('div', 'wd-rl', { 'data-rarity': rarity, text: rarityWord(t) })]);
    // one short line: why it can't be worn (or the server's last answer), else where it is worn
    const uniformNoApi = t.uniform && !t.locked && typeof api.setAppearance !== 'function';
    const why = st.why || (t.outfitLocked && t.item.slot === 6 ? { text: 'Slifer Red is locked until level 5. Keep dueling to unlock outfits.', tone: 'warn' } : t.equipped ? null : t.locked ? { text: t.reason || t.status + '.', tone: 'warn' } : !t.wearable ? { text: t.reason, tone: 'warn' }
      : uniformNoApi ? { text: 'Wear this uniform from the avatar editor.', tone: 'info' } : null);
    const ls = [];
    if (why) ls.push(h('div', 'wd-why', { 'data-tone': why.tone, role: why.tone === 'error' ? 'alert' : why.tone === 'ok' ? 'status' : undefined, text: why.text }));
    if (!why && t.spares) ls.push(h('div', null, { text: `${t.spares} spare${t.spares === 1 ? '' : 's'}: trade in Card Swap.` }));
    info.replaceChildren(rf, head);
    lines.replaceChildren(...ls);
    const can = !t.equipped && t.wearable && !t.locked && !uniformNoApi && !st.busy;
    equipBtn.disabled = !can;
    equipBtn.dataset.state = st.busy ? 'busy' : t.equipped ? 'on' : '';
    equipBtn.title = can ? 'Wear it' : t.equipped ? 'You are wearing it' : '';
    equipLabel.textContent = st.busy ? 'Saving…' : t.equipped ? 'Equipped' : 'Equip';
    equipCheck.style.display = t.equipped && !st.busy ? '' : 'none';
    offBtn.disabled = st.busy || (t.outfitLocked && t.item.slot === 6);
  }
  // the current look: one row per sub-category, the editor's order (the tabs'); a row opens its item
  function renderLook(v) {
    look.replaceChildren(h('div', 'lb', { text: 'Wearing now' }), ...wornRows(st.info, { world: v.world }).map(({ sub, tab, tile: t }) =>
      h('button', null, { type: 'button', disabled: !t, title: t?.fullName, 'data-sub': sub.id,
        on: { click: () => { if (!t) return; if (st.tab !== tab || st.sub !== sub.id) { st.tab = tab; st.sub = sub.id; grid.scrollTop = 0; } select(t.id, true); } } },
        [h('span', 'k', { text: sub.row }), h('span', 'v', { text: t ? t.name : 'Default', 'data-none': !t })])));
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
    if (id) { st.selectedId = id; st.tab = tabOfId(st.info, id) || st.tab; st.sub = subOfId(st.info, id) || st.sub; }
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
