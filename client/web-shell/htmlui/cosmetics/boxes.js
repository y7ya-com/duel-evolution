// The cosmetic box shop: the shop's Avatar Parts category (CShopAvatarWindow, scene 0x0e; the server sells no wearables
// any more, so the native list is empty) drawn as Cosmetic Boxes in HTML inside the shop's own frame, from the shop's own
// sprites (cosmetics/shopart.js). The game keeps drawing the frame (the glass panel, its dark band, the title plate), the
// clerk, the avatar, the backdrop, the MP plate and the side pills; this draws over them, as the native pack display
// lays a category out:
//   the band      the selected item: its name, its rarity, the short WIP notice of a one-body item
//   the title     "Cosmetic Boxes" over the native "Avatar Parts" plate
//   the boxes     three price tags (name, price in the shop's digits): the selected one cyan
//   the header    the box's category banner in the selection frame (the category menu's selected look)
//   the strip     the box's items, rarest first, five to a page as the pack display's row: the rarity on each art's
//                 frame, the name on its tag, the selected one in the yellow corner brackets; the orange arrows page it.
//                 A click tries an item on the original engine portrait. Click again, Reset, elsewhere or Esc
//                 to restore the current look. No appearance change is sent to the server.
//   the foot      the pity bars (one per guarantee: a segment per open, filled with the opens without that tier, in the
//                 tier's frame colour; the bar glows when the next open lands it); when Open can't be pressed, one line
//                 why; Contents & odds (a small button)
//   the side      Open Box on the Confirm pill (the orange primary, as the native Buy); Back stays the game's
// The contents & odds sheet is the yellow list window; the reveal dims the screen and presents the item large in the
// card get's glowing frame. screens/shop.js mounts it in the window's root (264, 0) and draws the wallet into the MP
// plate (drawWallet). Everything comes from cosmetics/api.js; the numbers from boxes-model.js.
// Pass mode: the root takes no pointer; the pieces here do (pointer-events: auto), so the game never sees those clicks;
// the engine's Back pill (left uncovered on the showcase) is the game's.
import * as api from './api.js';
import { injectTheme, RARITY, mpDigits } from './theme.js';
import { TABS, STRIP, boxView, contents, revealView, pct, wearWorld, itemLines, previewLook, pityMeters, bustLook } from './boxes-model.js';
import { renderItemArt } from './art.js';
import { renderWaistUp } from './waistup.js';
import { injectShopSkin, digits } from './shopart.js';
import { BOXES_CSS } from './boxes-css.js';
import { mpInfo } from '../shop/mpinfo.js';

export const ORIGIN = { x: 264, y: 0 };   // CShopAvatarWindow's rect (read/shop.js ITEMS): the root's place on screen
// the panel's centre line (root px): the engine's glass (23..521) and band, the banner frame, the box tabs, the strip,
// its arrows, the foot's lines and buttons all centre on it
export const AXIS = 272;
// the engine's side pills (screen px, from its 1x render): Confirm (now Open Box) and Back
export const PILLS = { confirm: { x: 795, y: 481, w: 223, h: 48 }, back: { x: 795, y: 541, w: 223, h: 49 } };
const reduced = () => !!globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
function h(tag, props = {}, ...kids) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (v == null || v === false) continue;
    if (k === 'class') e.className = v;
    else if (k === 'style') for (const [n, x] of Object.entries(v)) { if (n.startsWith('--')) e.style.setProperty(n, x); else e.style[n] = x; }
    else if (k === 'data') for (const [d, x] of Object.entries(v)) { if (x != null && x !== false) e.dataset[d] = x === true ? '' : x; }
    else if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
    else if (k === 'text') e.textContent = v;
    else e.setAttribute(k, v === true ? '' : v);
  }
  for (const c of kids.flat(4)) if (c != null && c !== false) e.append(c instanceof Node ? c : String(c));
  return e;
}
const at = (x, y, w, hh) => ({ left: x + 'px', top: y + 'px', ...(w != null && { width: w + 'px' }), ...(hh != null && { height: hh + 'px' }) });
const local = r => at(r.x - ORIGIN.x, r.y - ORIGIN.y, r.w, r.h);

let cssDone = false;
function injectCss() {
  injectTheme();
  injectShopSkin();
  if (cssDone || document.getElementById('de-boxes-css')) return;
  cssDone = true;
  document.head.append(h('style', { id: 'de-boxes-css', text: BOXES_CSS }));
}

/** The wallet in the shop's MP plate (screens/shop.js: CShopMileagePlate's root, at 795, 390), in the shop's digits:
 *  the one MP number, its (i) before it (how much is starter MP: shop/mpinfo.js). -> the element. */
export function drawWallet(el, wallet) {
  injectCss();
  let w = el.querySelector(':scope > .bx-wallet');
  if (!w) {
    w = h('div', { class: 'bx-wallet de-c' });
    el.append(w);
  }
  if (!wallet) { w.replaceChildren(h('div', { class: 'tot' }, digits('0MP'))); return w; }
  w.replaceChildren(h('div', { class: 'tot' }, mpInfo(wallet), digits(mpDigits(wallet.total))));
  return w;
}

/** The category menu's third banner (CShopCategoryWindow's アバターアイテムボタン, engine art with no words) named
 *  for what it opens now: a small title plate on its lower right. `at`: the banner sprite's place in the root (its art
 *  spans 17..385 x 19..130 of its 512 x 256). null removes it. Pass mode: the game keeps the click. */
export function drawCategoryLabel(root, at) {
  injectCss();
  let e = root.querySelector(':scope > .bx-cat');
  if (!at) { e?.remove(); return null; }
  if (!e) root.append(e = h('div', { class: 'bx-cat sa-title de-c', 'aria-hidden': 'true' }, 'Cosmetic Boxes'));
  Object.assign(e.style, { left: at.x + 385 - 194 + 'px', top: at.y + 130 - 38 + 'px' });
  return e;
}

/** Mount the box shop in `root` (the CShopAvatarWindow root). opts.onWallet(wallet): the wallet changed (shop.js
 *  redraws the MP plate); opts.onView(view): 'showcase' | 'contents' (shop.js hides the engine Back label on contents).
 *  -> { el, destroy(), get wallet, get view } */
export function mountBoxes(root, { onWallet, onView, onPreview } = {}) {
  injectCss();
  const el = h('div', { class: 'bx de-c', role: 'region', 'aria-label': 'Cosmetic Boxes' });
  const main = h('div', { class: 'bx-main' });   // the screens; the reveal goes beside it (a rebuild keeps its focus)
  el.append(main);
  root.append(el);
  const S = { info: api.peekInfo(), error: null, boxId: 'head', view: 'showcase', busy: false, msg: null, msgTimer: 0, dead: false,
    page: {}, sel: {}, pv: null };
  const arts = new Map();
  const body = () => S.info?.appearance?.gender || 'male';
  // an item's art in its rarity frame (cached per place and size: a rebuild keeps the drawn canvas)
  const framed = (item, size, slot, extra = {}, max) => {
    const key = `${slot}|${item.id}|${size}|${body()}`;
    let a = arts.get(key);
    if (!a) {
      const art = h('div', { class: 'art' });
      a = { el: h('div', { class: 'de-rf', data: { rarity: item.rarity } }, h('div', { class: 'well' }, art)) };
      a.r = renderItemArt(art, item, { body: body(), size, ...(max && { max }) });
      arts.set(key, a);
    }
    a.el.toggleAttribute('data-dim', item.compatible === false || (!!item.bodies?.length && !item.bodies.includes(body())));
    Object.assign(a.el.style, extra);
    return a.el;
  };
  const say = (text, ms = 7000) => {
    S.msg = text; clearTimeout(S.msgTimer);
    if (text && ms) S.msgTimer = setTimeout(() => { S.msg = null; render(); }, ms);
    render();
  };
  const setInfo = info => {
    const prev = S.info?.wallet;
    S.info = info;
    if (JSON.stringify(prev) !== JSON.stringify(info?.wallet)) onWallet?.(info?.wallet);
  };
  const load = force => {
    S.error = null;
    api.getInfo({ force }).then(i => { if (S.dead) return; setInfo(i); render(); },
      e => { if (S.dead) return; S.error = e.message || 'The boxes could not be loaded.'; render(); });
  };
  const off = api.onChange(i => { if (S.dead) return; setInfo(i); render(); });
  const page = d => {
    const i = TABS.findIndex(t => t.id === S.boxId);
    S.boxId = TABS[(i + d + TABS.length) % TABS.length].id;
    S.msg = null; S.pv = null;
    render();
  };
  const setView = v => { S.view = v; S.msg = null; S.pv = null; onView?.(v); render(); };
  // the strip's page and selection, per box
  const pages = v => Math.max(1, Math.ceil((v.items?.length || 0) / STRIP));
  const pageOf = v => Math.min(S.page[v.id] || 0, pages(v) - 1);
  const selected = v => {
    const items = v.items || [], p = pageOf(v), shown = items.slice(p * STRIP, p * STRIP + STRIP);
    return items.find(i => i.id === S.sel[v.id]) || shown[0] || null;
  };
  const turn = (v, d) => {
    const n = pages(v), p = (pageOf(v) + d + n) % n;
    S.page[v.id] = p;
    S.sel[v.id] = v.items[p * STRIP]?.id;
    S.pv = null;
    render();
  };

  // Preview the engine's existing shop character; never mount another character here.
  const pv = h('button', { class: 'bx-preview-reset sa-btn2', hidden: true,
    'aria-live': 'polite', onclick: () => { S.pv = null; render(); } });
  el.append(pv);
  let previewKey = '';
  const togglePreview = (v, it) => { S.sel[v.id] = it.id; S.pv = S.pv === it.id ? null : it.id; render(); };
  function drawPreview(v) {
    const it = S.view === 'showcase' && S.pv ? (v.items || []).find(i => i.id === S.pv) : null;
    const look = it ? previewLook(S.info, it) : null;
    const next = look?.mode === 'bust' ? look : null;
    const key = JSON.stringify(next);
    if (key !== previewKey) { previewKey = key; onPreview?.(next, S.info?.appearance?.parts); }
    pv.hidden = !it;
    pv.replaceChildren(h('span', { class: 'sa-t' }, look?.mode === 'art' ? `${look.notice} · Reset` : 'Previewing · Reset look'));
    if (it) pv.dataset.id = it.id; else delete pv.dataset.id;
  }
  // a click anywhere but on an item clears the preview (the game's canvas too: seen, never stopped)
  const outside = ev => { if (S.pv && !ev.target?.closest?.('.bx-cell, .bx-preview-reset')) { S.pv = null; render(); } };
  document.addEventListener('pointerdown', outside, true);

  // ---- the band: the selected item (or, on the sheet, the box), white on the dark band
  function band(lines) {
    return h('div', { class: 'bx-band', 'aria-live': 'polite' }, lines.filter(Boolean).slice(0, 3).map((l, i) => h('div', { class: 'sa-t sa-w', data: { l: i } }, l)));
  }
  // ---- screen 1: the showcase
  function tabs() {
    const box = id => S.info?.boxes?.find(b => b.id === id);
    return h('div', { class: 'bx-tabs', role: 'tablist', 'aria-label': 'Boxes' }, TABS.map((t, i) => {
      const b = box(t.id), on = t.id === S.boxId;
      return h('button', { class: 'sa-plate bx-tab', role: 'tab', 'aria-selected': String(on), tabindex: on ? '0' : '-1',
        data: { on }, style: at(30 + i * 164, 110, 156, 44), onclick: () => { S.boxId = t.id; S.msg = null; S.pv = null; render(); } },
        h('span', { class: 'nm sa-t' }, t.label), h('span', { class: 'pr' }, b ? digits(mpDigits(b.price)) : null));
    }));
  }
  function header(v) {
    const L = v.look;
    return h('div', { class: 'bx-head', 'aria-hidden': 'true' },
      h('div', { class: 'sa-banner bn', style: { backgroundImage: `var(--sa-${L.banner})` } }),
      h('div', { class: 'sa-frame fr' }));
  }
  function strip(v) {
    if (S.error && !S.info) return h('div', { class: 'bx-strip' },
      h('div', { class: 'bx-fail sa-t', role: 'alert' }, S.error),
      h('button', { class: 'sa-btn2 bx-retry', style: at(189, 70, 115), onclick: () => load(true) }, h('span', {}, 'Retry')));
    if (!S.info || !v.box) return h('div', { class: 'bx-strip', 'aria-busy': 'true' },
      Array.from({ length: STRIP }, (_, i) => h('div', { class: 'bx-sk de-skel', style: at(i * 98 + 6, 10, 84, 84) })));
    const p = pageOf(v), shown = v.items.slice(p * STRIP, p * STRIP + STRIP), sel = selected(v);
    const x0 = (STRIP - shown.length) * 49;   // a short page centred on the axis (98 a cell)
    return h('div', { class: 'bx-strip', role: 'listbox', 'aria-label': `${v.name}: items` }, shown.map((it, i) => {
      const on = it.id === sel?.id, pving = it.id === S.pv;
      return h('button', { class: 'bx-cell', role: 'option', 'aria-selected': String(on), 'aria-pressed': String(pving),
        'aria-label': `${it.name}, ${RARITY[it.rarity]?.label}${pving ? ', previewing' : ''}`,
        data: { on, id: it.id, pv: pving }, style: at(x0 + i * 98, 0, 96, 150), onclick: () => togglePreview(v, it) },
        framed(it, 70, 'strip', at(10, 14, 76, 76)),
        h('div', { class: 'sa-brackets', data: { hi: !on } }),
        h('div', { class: 'sa-plate tag', data: { on } }, h('span', { class: 'sa-t' }, it.name)));
    }));
  }
  // ---- the pity bars: one per guarantee, a segment per open toward it, the tier's name beside it and the count after
  function pityBars(box, where) {
    const ms = pityMeters(box);
    if (!ms.length) return null;
    return h('div', { class: 'bx-pity', data: { at: where }, role: 'group', 'aria-label': 'Guarantees' }, ms.map(m =>
      h('div', { class: 'pm', data: { key: m.key, next: m.next }, role: 'meter', 'aria-valuemin': '0', 'aria-valuemax': String(m.at),
        'aria-valuenow': String(m.misses), 'aria-label': `${m.label} ${m.count}`,
        style: { '--c': RARITY[m.key].color } },
        h('span', { class: 'lb sa-t' }, m.label),
        h('span', { class: 'bar', style: { gridTemplateColumns: `repeat(${m.at}, 1fr)` } },
          Array.from({ length: m.at }, (_, i) => h('i', { data: { on: i < m.misses, due: m.next && i === m.at - 1 } }))),
        h('span', { class: 'ct sa-t' }, m.count))));
  }
  function foot(v) {
    const ready = !!v.box && v.affordable && !S.busy;
    const why = S.msg || (v.box && !v.affordable ? v.disabled : '');
    return [
      v.box ? pityBars(v.box, 'showcase') : null,
      why ? h('div', { class: 'bx-why sa-t', id: 'bx-why', role: S.msg ? 'alert' : null }, why) : null,
      // centred on the panel's axis (272) by its face (145 of 150: shopart.js FACE)
      h('button', { class: 'sa-btn2 bx-link', style: at(AXIS - 145 / 2, 532, 150), disabled: !v.box, onclick: () => setView('contents') }, h('span', { class: 'sa-t' }, 'Contents & odds')),
      h('button', { class: 'sa-pill bx-open', data: { tone: 'go', busy: S.busy }, disabled: !ready, 'aria-describedby': why ? 'bx-why' : null,
        style: at(PILLS.confirm.x - ORIGIN.x, PILLS.confirm.y - ORIGIN.y, PILLS.confirm.w, 50), onclick: () => open() },
        h('span', {}, S.busy ? 'Opening…' : !S.info ? 'Loading…' : 'Open Box')),
    ];
  }

  // ---- screen 3: contents & odds, in the yellow list window
  function sheet(v) {
    const groups = contents(v.box);
    // the body column only for an item made for one body so far: "Male only"
    const row = i => h('div', { class: 'bx-row', data: { owned: i.owned } },
      framed(i, 22, 'row', at(4, 2, 24, 24)),
      h('span', { class: 'sa-t c-nm' }, i.name),
      h('span', { class: 'sa-t c-bd' }, i.bodies.length === 1 ? `${i.bodies[0] === 'female' ? 'Female' : 'Male'} only` : ''),
      h('span', { class: 'sa-t c-pc' }, pct(i.chance)),
      h('span', { class: 'sa-t c-ow' }, i.copies > 0 ? `×${i.copies + (i.owned ? 1 : 0)}` : i.owned ? 'Owned' : ''));
    const list = h('div', { class: 'yo2-scroll-list bx-list', tabindex: '0', 'aria-label': 'Box contents' },
      groups.map(g => [h('div', { class: 'bx-grp', data: { rarity: g.rarity } },
        h('span', { class: 'sa-t c-nm' }, g.label),
        h('span', { class: 'sa-t c-pc' }, pct(g.odds)), h('span', { class: 'sa-t c-ow' }, `${g.owned} / ${g.items.length}`)),
      g.items.map(row)]));
    return h('div', { class: 'bx-contents' },
      h('div', { class: 'sa-yellow bx-sheet' },
        h('div', { class: 'hd' }, h('span', { class: 'sa-t c-nm' }, 'Item'),
          h('span', { class: 'sa-t c-pc' }, 'Chance'), h('span', { class: 'sa-t c-ow' }, 'Owned')),
        list),
      pityBars(v.box, 'contents'));
  }

  let lastList = 0;
  function render() {
    if (S.dead) return;
    const v = boxView(S.info, S.boxId);
    const prevList = main.querySelector('.bx-list');
    if (prevList) lastList = prevList.scrollTop;
    const contentsView = S.view === 'contents' && v.box;
    const sel = v.box ? selected(v) : null;
    const lines = contentsView ? [v.name, `${v.owned}/${v.count} owned`] : sel ? itemLines(sel) : [];
    const multi = v.box && pages(v) > 1;
    const parts = [
      band(lines),
      h('div', { class: 'sa-title bx-title', role: 'heading', 'aria-level': '2' }, contentsView ? 'Box Contents' : 'Cosmetic Boxes'),
      contentsView ? sheet(v) : [tabs(), header(v), strip(v),
        h('button', { class: 'sa-arrow bx-prev', data: { dir: 'prev' }, disabled: !multi, 'aria-label': 'Previous items', onclick: () => turn(v, -1) }),
        h('button', { class: 'sa-arrow bx-next', data: { dir: 'next' }, disabled: !multi, 'aria-label': 'Next items', onclick: () => turn(v, 1) })],
      foot(v).filter(x => x && (!contentsView || x.classList.contains('bx-open'))),
      contentsView ? h('button', { class: 'bx-sidebtn', style: local(PILLS.back), onclick: () => setView('showcase') }, h('span', { class: 'sa-t' }, 'Back')) : null,
    ];
    const focused = document.activeElement && main.contains(document.activeElement) ? focusKey(document.activeElement) : null;
    main.replaceChildren(...parts.flat(3).filter(Boolean));
    if (focused) main.querySelector(focused)?.focus({ preventScroll: true });
    const list = main.querySelector('.bx-list');
    if (list) list.scrollTop = lastList;
    drawPreview(v);
  }
  el.addEventListener('keydown', ev => {
    if (el.querySelector(':scope > .bx-rv')) return;   // the reveal's own keys
    if (S.view === 'contents' && ev.key === 'Escape') { setView('showcase'); ev.preventDefault(); return; }
    if (S.view !== 'showcase') return;
    if (ev.key === 'Escape' && S.pv) { S.pv = null; render(); ev.preventDefault(); return; }
    if ((ev.key === 'ArrowLeft' || ev.key === 'ArrowRight') && ev.target.closest?.('.bx-tabs')) {
      page(ev.key === 'ArrowLeft' ? -1 : 1);
      el.querySelector('.bx-tab[data-on]')?.focus();
      ev.preventDefault();
    }
  });

  // ---- screen 2: the reveal
  async function open() {
    const v = boxView(S.info, S.boxId);
    if (S.busy || !v.box || !v.affordable) return;
    S.busy = true; S.msg = null; S.pv = null; render();
    const rv = reveal(v);
    try {
      const out = await api.openBox(v.id);
      if (S.dead) return;
      setInfo(out.info);
      rv.result(out.reward);
    } catch (e) {
      if (S.dead) return;
      rv.close();
      S.msg = e.message || 'The box could not be opened.';
      if (e.error === 'stale-request' || e.error === 'insufficient-earned-mp') S.info = api.peekInfo() || S.info;
    } finally {
      S.busy = false;
      if (!S.dead) render();
    }
  }
  function reveal(v) {
    const t0 = performance.now(), slow = !reduced();
    const ov = h('div', { class: 'bx-rv', role: 'dialog', 'aria-modal': 'true', 'aria-label': `Opening the ${v.name}`, tabindex: '-1',
      data: { phase: 'wait', tempo: 'normal' } });
    // the anticipation: the box's banner in its frame, the frame's glow breathing, until the server answers (a click skips)
    const wait = h('div', { class: 'wait' }, h('div', { class: 'sa-banner bn', style: { backgroundImage: `var(--sa-${v.look.banner})` } }),
      h('div', { class: 'sa-frame fr' }));
    ov.append(h('div', { class: 'dim' }), wait);
    el.append(ov);
    ov.focus({ preventScroll: true });
    let rw = null, phase = 'wait', skip = false, timers = [], closed = false;
    const later = (fn, ms) => timers.push(setTimeout(fn, ms));
    const set = p => { phase = p; ov.dataset.phase = p; if (p === 'done') ov.querySelector('.equip:not(:disabled), .again, .done')?.focus({ preventScroll: true }); };
    const close = () => { if (closed) return; closed = true; timers.forEach(clearTimeout); ov.remove(); el.querySelector('.bx-open')?.focus({ preventScroll: true }); };
    ov.addEventListener('click', ev => {
      if (phase === 'done' || ev.target.closest('button')) return;
      skip = true;
      if (rw) { timers.forEach(clearTimeout); timers = []; set('done'); }
    });
    ov.addEventListener('keydown', ev => {
      if (ev.key === 'Escape') { ev.preventDefault(); if (phase === 'done') close(); else ov.click(); }
      if ((ev.key === 'Enter' || ev.key === ' ') && phase !== 'done' && !ev.target.closest('button')) { ev.preventDefault(); ov.click(); }
    });
    function result(reward) {
      const r = revealView(reward, body());
      rw = r;
      ov.dataset.tempo = r.tempo;
      ov.dataset.rarity = r.rarity;
      ov.setAttribute('aria-label', `${r.label}: ${r.name}`);
      ov.append(card(r), ...after(r, v));
      if (skip || !slow) return set('done');
      const left = Math.max(0, r.anticipation - (performance.now() - t0));
      later(() => { set('card'); later(() => set('done'), r.tempo === 'special' ? 1300 : r.tempo === 'quick' ? 500 : 800); }, left);
    }
    // the item worn (the player's look with it swapped in, or the default look of the body it is made for), framed
    // on the item in its rarity frame; the chibi art only when the waist-up can't be drawn
    function card(r) {
      const look = bustLook(S.info, r.item), well = h('div', { class: 'well sky' });
      const rf = h('div', { class: 'de-rf', data: { rarity: r.rarity }, style: at(18, 22, 192, 256) }, well);
      const chibi = () => { const art = h('div', { class: 'art' }); for (const c of well.children) c.hidden = true; well.append(art); renderItemArt(art, { ...r.item, compatible: true, bodies: [] }, { body: body(), size: 176, max: 2.5 }); };
      if (look) {
        const wu = h('div', { class: 'wu' });
        well.append(wu);
        renderWaistUp(wu, look.parts, { gender: look.gender, world: look.world, focus: look.focus }).ready.then(ok => { if (!ok) chibi(); });
      } else chibi();
      return h('div', { class: 'bx-card', data: { rarity: r.rarity } },
        h('div', { class: 'glow' }), rf,
        r.rarity === 'ultra' ? h('div', { class: 'sheen' }) : null);
    }
    function after(r, v0) {
      const status = h('div', { class: 'status sa-t sa-w', role: 'status' });
      const nowView = () => boxView(S.info, v0.id);
      const label = (b, t) => { b.firstChild.textContent = t; };
      const equipBtn = h('button', { class: 'sa-pill equip', data: { tone: 'go' }, disabled: !r.compatible, onclick: async () => {
        equipBtn.disabled = true; label(equipBtn, 'Equipping…'); status.textContent = ''; delete status.dataset.bad;
        try {
          const w = wearWorld(r.item, body(), S.info?.appearance?.world);
          await api.equip(r.id, w?.world);
          label(equipBtn, 'Equipped'); equipBtn.dataset.done = '';
        } catch (e) {
          equipBtn.disabled = false; label(equipBtn, 'Equip');
          status.dataset.bad = ''; status.textContent = e.message;
        }
      } }, h('span', {}, r.compatible ? 'Equip' : "Can't wear yet"));
      const nv = nowView();
      const again = h('button', { class: 'sa-pill again', data: { tone: 'hi' }, disabled: !nv.affordable, title: nv.disabled || null,
        onclick: () => { close(); open(); } }, h('span', {}, 'Open another'));
      // one column under the card, the card's width: the name, the rarity, the news plate, the WIP notice, the pills
      return [
        h('div', { class: 'after' },
          h('div', { class: 'nm sa-t24 sa-w', title: r.name }, r.name),
          h('div', { class: 'rl sa-t sa-w', data: { rarity: r.rarity } }, `${r.label} ${(r.kind || '').toLowerCase()}`.trim()),
          h('div', { class: 'sa-plate news', data: { hi: r.isNew } }, h('span', { class: 'sa-t' }, r.duplicate ? r.dupText : 'New')),
          r.notice ? h('div', { class: 'notice sa-t sa-w' }, r.notice) : null,
          equipBtn, again,
          h('button', { class: 'sa-pill done', onclick: close }, h('span', {}, 'Done')),
          !nv.affordable && nv.disabled ? h('div', { class: 'status sa-t sa-w', 'data-bad': '' }, nv.disabled) : status),
      ];
    }
    return { result, close };
  }

  if (!S.info) load(false); else { load(false); onWallet?.(S.info.wallet); }
  render();
  return {
    el,
    get wallet() { return S.info?.wallet || null; },
    get view() { return S.view; },
    refresh: () => load(true),
    resetPreview() { if (S.pv) { S.pv = null; render(); } },
    destroy() {
      S.dead = true; off(); clearTimeout(S.msgTimer);
      document.removeEventListener('pointerdown', outside, true);
      onPreview?.(null, S.info?.appearance?.parts);
      for (const a of arts.values()) a.r?.destroy?.();
      arts.clear(); el.remove();
    },
  };
}

// a selector that finds the same control after a rebuild (the tabs, the cells, the arrows, the buttons by their class)
function focusKey(e) {
  if (e.classList.contains('bx-tab')) return '.bx-tab[data-on]';
  if (e.classList.contains('bx-cell')) return '.bx-cell[data-on]';
  for (const c of ['bx-preview-reset', 'bx-prev', 'bx-next', 'bx-open', 'bx-link', 'bx-sidebtn', 'bx-list', 'bx-retry']) if (e.classList.contains(c)) return '.' + c;
  return null;
}
