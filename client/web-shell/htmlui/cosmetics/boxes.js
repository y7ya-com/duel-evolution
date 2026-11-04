// The cosmetic box shop: the shop's Avatar Parts category (CShopAvatarWindow, scene 0x0e; the server sells no wearables
// any more, so the native list is empty) drawn as Cosmetic Boxes in HTML inside the shop's own frame. The game keeps
// drawing the frame (the glass panel, the title band), the clerk, the avatar, the backdrop and the side pills; this
// draws over them: a title plate over the native "Avatar Parts" one, the tabs and paging arrows, the box showcase, the
// contents & odds sheet, the reveal (over the whole screen), and labels on the engine's Confirm pill (now Wardrobe) and,
// on the contents sheet, its Back pill (Back to box). screens/shop.js mounts it in the window's root (264, 0) and draws
// the wallet into the MP plate (drawWallet). Everything comes from cosmetics/api.js; the numbers from boxes-model.js.
// Pass mode: the root takes no pointer; the pieces here do (pointer-events: auto), so the game never sees those clicks;
// the engine's Back pill (left uncovered on the showcase) is the game's.
import * as api from './api.js';
import { injectTheme, RARITY, mp, BODY_SIGN, WORLD_LABEL } from './theme.js';
import { TABS, boxView, contents, revealView, pct, pityMeters, wearWorld } from './boxes-model.js';
import { renderItemArt } from './art.js';
import { BOXES_CSS } from './boxes-css.js';
const nth = n => n + (n % 100 >= 11 && n % 100 <= 13 ? 'th' : ['th', 'st', 'nd', 'rd'][n % 10] || 'th');

export const ORIGIN = { x: 264, y: 0 };   // CShopAvatarWindow's rect (read/shop.js ITEMS): the root's place on screen
// the engine's side pills (screen px, from its 1x render): the Confirm pill (now Wardrobe) and Back
export const PILLS = { wardrobe: { x: 795, y: 481, w: 223, h: 48 }, back: { x: 795, y: 541, w: 223, h: 49 } };

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
  for (const c of kids.flat()) if (c != null && c !== false) e.append(c instanceof Node ? c : String(c));
  return e;
}
const at = (x, y, w, hh) => ({ left: x + 'px', top: y + 'px', ...(w != null && { width: w + 'px' }), ...(hh != null && { height: hh + 'px' }) });
const local = r => at(r.x - ORIGIN.x, r.y - ORIGIN.y, r.w, r.h);

let cssDone = false;
function injectCss() {
  injectTheme();
  if (cssDone || document.getElementById('de-boxes-css')) return;
  cssDone = true;
  document.head.append(h('style', { id: 'de-boxes-css', text: BOXES_CSS }));
}

const sexBadges = bodies => ['male', 'female'].map(b =>
  h('span', { class: 'de-sex', data: { body: b, off: !bodies.includes(b) }, title: bodies.includes(b) ? `Fits the ${b} body` : `No ${b} version yet` }, BODY_SIGN[b]));

/** The wallet in the shop's MP plate (screens/shop.js: CShopMileagePlate's root, at 795, 390): the total on the top
 *  half, earned and starter MP on the bottom one. -> the element (replaced on each call). */
export function drawWallet(el, wallet) {
  injectCss();
  let w = el.querySelector(':scope > .bx-wallet');
  if (!w) {
    w = h('div', { class: 'bx-wallet de-c', style: { position: 'absolute', left: 0, top: 0, width: '229px', height: '84px', pointerEvents: 'none' } });
    el.append(w);
  }
  const out = '1px 0 #0b4a66, -1px 0 #0b4a66, 0 1px #0b4a66, 0 -1px #0b4a66';
  const line = (y, text, px, extra = {}) => h('div', { style: { position: 'absolute', left: '12px', width: '200px', top: y + 'px', textAlign: 'right',
    color: '#fff', font: `bold ${px}px/1 Arial, sans-serif`, textShadow: out, whiteSpace: 'nowrap', ...extra } }, text);
  if (!wallet) { w.replaceChildren(line(10, '… MP', 20)); return w; }
  w.replaceChildren(
    line(9, mp(wallet.total), 21, { letterSpacing: '.5px' }),
    line(44, h('span', {}, 'Earned ', h('b', { style: { color: '#fff3a6' } }, Number(wallet.earned).toLocaleString('en-US'))), 13),
    line(61, `Starter ${Number(wallet.bound).toLocaleString('en-US')} (cards only)`, 11, { opacity: .92 }),
  );
  w.title = 'Boxes take earned MP only. Starter MP buys cards and packs.';
  return w;
}

/** The category menu's third banner (CShopCategoryWindow's アバターアイテムボタン, engine art with no words) named
 *  for what it opens now: a "Cosmetic Boxes" plate on its lower right. `at`: the banner sprite's place in the root
 *  (its art spans 17..385 x 19..130 of its 512 x 256). null removes it. Pass mode: the game keeps the click. */
export function drawCategoryLabel(root, at) {
  injectCss();
  let e = root.querySelector(':scope > .bx-cat');
  if (!at) { e?.remove(); return null; }
  if (!e) root.append(e = h('div', { class: 'bx-cat de-c', 'aria-hidden': 'true' }, h('span', { class: 'de-title' }, 'Cosmetic Boxes'), h('b', {}, 'NEW')));
  Object.assign(e.style, { left: at.x + 385 - 200 + 'px', top: at.y + 130 - 40 + 'px' });
  return e;
}

/** Mount the box shop in `root` (the CShopAvatarWindow root). opts.onWallet(wallet): the wallet changed (shop.js
 *  redraws the MP plate); opts.onView(view): 'showcase' | 'contents' (shop.js hides the engine Back label on contents).
 *  -> { el, destroy(), get wallet, get view } */
export function mountBoxes(root, { onWallet, onView } = {}) {
  injectCss();
  const el = h('div', { class: 'bx de-c', role: 'region', 'aria-label': 'Cosmetic Boxes' });
  const main = h('div', { class: 'bx-main' });   // the screens; the reveal goes beside it (a rebuild keeps its focus)
  el.append(main);
  root.append(el);
  const S = { info: api.peekInfo(), error: null, boxId: 'head', view: 'showcase', busy: false, msg: null, msgTimer: 0, dead: false };
  const arts = new Map();
  const body = () => S.info?.appearance?.gender || 'male';
  const art = (item, size, slot = '') => {
    const key = `${slot}|${item.id}|${size}|${body()}`;
    let a = arts.get(key);
    if (!a) {
      a = { el: h('div', { class: 'art' }) };
      a.r = renderItemArt(a.el, item, { body: body(), size, cue: false });
      arts.set(key, a);
    }
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
    S.msg = null;
    render();
  };
  const setView = v => { S.view = v; S.msg = null; onView?.(v); render(); };
  const wardrobe = (focusId) => {
    import('./wardrobe.js').then(m => m.openWardrobe({ focusId, world: S.info?.appearance?.world }))
      .catch(() => say('The Wardrobe could not be opened. Please try again.'));
  };

  // ---- screen 1: the showcase
  function tabs() {
    const box = id => S.info?.boxes?.find(b => b.id === id);
    return h('div', { class: 'bx-tabs', role: 'tablist', 'aria-label': 'Boxes' }, TABS.map((t, i) => {
      const b = box(t.id), on = t.id === S.boxId, hero = b && (b.pool || []).find(x => x.rarity === 'ultra');
      return h('button', { class: 'bx-plate bx-tab', role: 'tab', 'aria-selected': String(on), tabindex: on ? '0' : '-1',
        data: { on, short: b && S.info.wallet.earned < b.price }, style: at(i * 159, 0),
        onclick: () => { S.boxId = t.id; S.msg = null; render(); } },
        h('span', { class: 'ic' }, hero ? art(hero, 28, 'tab') : null),
        h('span', { class: 'lb' }, h('span', { class: 'nm' }, t.label), h('span', { class: 'pr' }, b ? mp(b.price) : '\u00a0')));
    }));
  }
  function boxArt(v, { big = false } = {}) {
    const L = v.look;
    return h('div', { class: 'bx-box', style: { '--b0': L.body[1], '--b1': L.body[0], '--b2': L.body[2], '--b3': L.body[2], '--trim': L.trim, '--glow-b': L.glow } },
      h('i', { class: 'sh' }), h('i', { class: 'side' }),
      h('i', { class: 'front' }, h('div', { class: 'win' }, v.hero ? art(v.hero, 72, big ? 'rvbox' : 'box') : null),
        h('div', { class: 'word' }, `${L.word} BOX`)),
      h('i', { class: 'lidside' }), h('i', { class: 'lidtop' }), h('i', { class: 'ribtop' }), h('i', { class: 'lid' }));
  }
  function mini(item) {
    return h('div', { class: 'bx-mini', data: { rarity: item.rarity }, title: item.notice || '' },
      art(item, 50, 'mini'),
      h('div', { class: 'mtx' }, h('div', { class: 'nm' }, item.name),
        h('div', {}, h('span', { class: 'de-chip', data: { rarity: item.rarity } }, RARITY[item.rarity].label)),
        h('div', { class: 'bd' }, item.bodies.length >= 2 ? 'Both bodies' : `${BODY_SIGN[item.bodies[0]] || ''} only for now`)),
      item.owned ? h('span', { class: 'bx-own own', title: 'You own this' }, '✓') : null);
  }
  function hero(v) {
    if (S.error && !S.info) return h('div', { class: 'bx-hero', style: { '--glow-a': 'transparent' } },
      h('div', { class: 'de-msg', style: { left: '60px', top: '60px', width: '350px' } }, S.error),
      h('button', { class: 'de-pill', style: at(155, 120, 160, 34), onclick: () => { load(true); render(); } }, 'Retry'));
    if (!S.info) return h('div', { class: 'bx-hero', 'aria-busy': 'true', style: { '--glow-a': 'rgba(255,255,255,.5)' } },
      h('div', { class: 'bx-sk de-skel', style: at(10, 34, 140, 66) }), h('div', { class: 'bx-sk de-skel', style: at(10, 108, 140, 66) }),
      h('div', { class: 'bx-sk de-skel', style: at(160, 30, 150, 150) }),
      h('div', { class: 'bx-sk de-skel', style: at(320, 34, 140, 66) }), h('div', { class: 'bx-sk de-skel', style: at(320, 108, 140, 66) }));
    const f = v.featured, left = f.slice(0, 2), right = f.slice(2, 4);
    const ultras = (v.box.pool || []).filter(i => i.rarity === 'ultra').length;
    return h('div', { class: 'bx-hero', style: { '--glow-a': hexA(v.look.glow, .55), '--glow-b': hexA(RARITY.ultra.color, .9) } },
      h('div', { class: 'bx-rays' }),
      h('div', { class: 'bx-feat-tag' }, ultras > 1 ? `${ultras} Ultra Rares inside` : 'Featured Ultra Rare'),
      h('div', { class: 'bx-count' }, `You own ${v.owned} / ${v.count}`),
      h('div', { class: 'bx-side l' }, left.map(mini)), h('div', { class: 'bx-side r' }, right.map(mini)),
      boxArt(v),
      [[176, 28, 0], [300, 44, -0.8], [312, 168, -1.6]].map(([x, y, d]) =>
        h('i', { class: 'bx-spark', style: { ...at(x, y), animationDelay: d + 's' } })));
  }
  function odds(v) {
    if (!v.box) return h('div', { class: 'bx-odds' }, h('div', { class: 'hd' }, 'DROP RATES'), h('div', { class: 'bx-bar de-skel' }));
    const segs = v.odds, show = v.pityOn ? 'next' : 'base';
    return h('div', { class: 'bx-odds' },
      h('div', { class: 'hd' },
        h('span', {}, `DROP RATES · ${v.count} ${v.unit.toUpperCase()}`,
          v.pityOn ? h('span', { class: 'bx-pityon' }, ' · NEXT OPEN (PITY)') : null),
        h('button', { class: 'bx-link', onclick: () => setView('contents') }, 'Contents & odds')),
      h('div', { class: 'bx-bar', role: 'img', 'aria-label': segs.map(s => `${s.label} ${pct(s[show])}`).join(', ') },
        segs.filter(s => s[show] > 0).map(s => h('div', { class: 'bx-seg', data: { rarity: s.rarity, narrow: s[show] < 12 },
          style: { flex: `${s[show]} 1 0` }, title: `${s.label}: ${pct(s[show])} (${s.count} ${s.count === 1 ? 'item' : 'items'})` },
          h('span', { class: 'nm' }, s.label), pct(s[show])))));
  }
  function pity(v) {
    if (!v.box) return h('div', { class: 'bx-pity' }, h('div', { class: 'bx-meter de-skel' }), h('div', { class: 'bx-meter de-skel' }));
    return h('div', { class: 'bx-pity' }, v.pity.map(m => h('div', { class: 'bx-meter', data: { rarity: m.key, next: m.next },
      title: `The ${nth(m.at)} open in a row without one is guaranteed. ${m.misses} so far.` },
      h('div', { class: 'hd' }, h('span', {}, m.label), h('b', {}, m.text)),
      h('div', { class: 'tr' }, h('div', { class: 'fi', style: { width: (100 * m.progress).toFixed(1) + '%' } })))));
  }
  function buy(v) {
    const ready = !!v.box && v.affordable && !S.busy;
    return [
      h('div', { class: 'bx-price' }, h('div', { class: 'v' }, v.box ? mp(v.price) : '…'), h('div', { class: 's' }, 'Earned MP only')),
      h('button', { class: 'de-btn bx-open', disabled: !ready, data: { busy: S.busy }, 'aria-describedby': 'bx-why',
        onclick: () => open() }, S.busy ? 'OPENING…' : !S.info ? 'LOADING…' : 'OPEN BOX'),
      S.msg ? h('div', { class: 'bx-why', id: 'bx-why', role: 'alert' }, h('div', { class: 'de-msg' }, S.msg))
        : v.disabled ? h('div', { class: 'bx-why', id: 'bx-why' }, h('div', { class: 'de-msg' }, v.disabled))
        : v.notice ? h('div', { class: 'bx-note', id: 'bx-why' }, h('b', {}, '♂♀ '), v.notice) : null,
    ];
  }

  // ---- screen 3: contents & odds
  function sheet(v) {
    const groups = contents(v.box), b = v.box;
    const tile = i => h('div', { class: 'bx-tile', data: { rarity: i.rarity, owned: i.owned },
      title: `${i.name}: ${pct(i.chance)} per open${i.notice ? '\n' + i.notice : ''}` },
      art(i, 60, 'tile'),
      i.owned ? h('span', { class: 'bx-own', title: 'Owned' }, '✓') : null,
      i.copies > 0 ? h('span', { class: 'bx-copies', title: `${i.copies} tradable ${i.copies === 1 ? 'copy' : 'copies'}` }, `×${i.copies}`) : null,
      h('div', { class: 'nm' }, i.name),
      h('div', { class: 'ft' }, h('span', { class: 'pc' }, pct(i.chance)),
        i.bodies.length === 1 ? h('span', { class: 'fn', data: { body: i.bodies[0] }, title: i.notice || '' },
          h('span', { class: 'de-sex', data: { body: i.bodies[0] } }, BODY_SIGN[i.bodies[0]]), 'for now')
          : h('span', { class: 'sx' }, sexBadges(i.bodies))));
    const list = h('div', { class: 'yo2-scroll-list bx-list', tabindex: '0', 'aria-label': 'Box contents' },
      groups.map(g => h('div', { class: 'bx-grp', data: { rarity: g.rarity } },
        h('div', { class: 'gh' }, h('span', { class: 'r' }, `${g.label} · ${pct(g.odds)}`),
          h('span', { class: 'e' }, `${pct(g.each)} each · owned ${g.owned} / ${g.items.length}`)),
        h('div', { class: 'bx-grid' }, g.items.map(tile)))));
    const rules = [`Every open gives one item. Duplicates become tradable copies.`];
    if (b.superAt) rules.push(`Pity: the ${nth(b.superAt)} open in a row without one is Super Rare or better`);
    if (b.ultraAt) rules.push(`${b.superAt ? 'and' : 'Pity:'} the ${nth(b.ultraAt)} without one is Ultra Rare.`);
    rules.push('A guarantee picks the rarity, not a new item.');
    if (v.notice) rules.push('♂♀: ' + v.notice);
    return h('div', { class: 'bx-contents' },
      h('div', { class: 'hd' }, h('div', {}, `${b.name} · ${v.count} ${v.unit}`), h('span', {}, `Owned ${v.owned} / ${v.count} · ${mp(b.price)}`)),
      list, h('div', { class: 'bx-rules' }, rules.join(' ')));
  }

  let lastList = 0;
  function render() {
    if (S.dead) return;
    const v = boxView(S.info, S.boxId);
    const prevList = main.querySelector('.bx-list');
    if (prevList) lastList = prevList.scrollTop;
    const contentsView = S.view === 'contents' && v.box;
    const parts = [
      h('div', { class: 'de-title bx-title bx-hit', role: 'heading', 'aria-level': '2' }, contentsView ? 'Box Contents' : 'Cosmetic Boxes'),
      contentsView ? sheet(v) : [tabs(), hero(v), odds(v), pity(v), buy(v),
        h('button', { class: 'de-arrow bx-prev', data: { dir: 'prev' }, 'aria-label': 'Previous box', onclick: () => page(-1) }),
        h('button', { class: 'de-arrow bx-next', data: { dir: 'next' }, 'aria-label': 'Next box', onclick: () => page(1) })],
      h('button', { class: 'bx-sidebtn', style: local(PILLS.wardrobe), onclick: () => wardrobe() }, 'Wardrobe'),
      contentsView ? h('button', { class: 'bx-sidebtn', style: local(PILLS.back), onclick: () => setView('showcase') }, 'Back to box') : null,
    ];
    const focused = document.activeElement && main.contains(document.activeElement) ? focusKey(document.activeElement) : null;
    main.replaceChildren(...parts.flat(3).filter(Boolean));
    if (focused) main.querySelector(focused)?.focus({ preventScroll: true });
    const list = main.querySelector('.bx-list');
    if (list) list.scrollTop = lastList;
  }
  el.addEventListener('keydown', ev => {
    if (el.querySelector(':scope > .bx-rv')) return;   // the reveal's own keys
    if (S.view === 'contents' && ev.key === 'Escape') { setView('showcase'); ev.preventDefault(); return; }
    if (S.view !== 'showcase') return;
    if (ev.key === 'ArrowLeft' || ev.key === 'ArrowRight') {
      page(ev.key === 'ArrowLeft' ? -1 : 1);
      el.querySelector('.bx-tab[data-on]')?.focus();
      ev.preventDefault();
    }
  });

  // ---- screen 2: the reveal
  async function open() {
    const v = boxView(S.info, S.boxId);
    if (S.busy || !v.box || !v.affordable) return;
    S.busy = true; S.msg = null; render();
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
      data: { phase: 'shake', tempo: 'normal' }, style: { '--rv': v.look.glow, '--rc': v.look.glow } });
    const stage = h('div', { class: 'stage' }, h('div', { class: 'glow' }), h('div', { class: 'rays' }), h('div', { class: 'burst' }),
      h('div', { class: 'rvbox' }, boxArt(v, { big: true })), h('div', { class: 'parts' }));
    ov.append(stage, h('div', { class: 'skip' }, 'Click anywhere to skip'));
    el.append(ov);
    ov.focus({ preventScroll: true });
    let rw = null, phase = 'shake', skip = false, timers = [], closed = false;
    const later = (fn, ms) => timers.push(setTimeout(fn, ms));
    const set = p => { phase = p; ov.dataset.phase = p; if (p === 'done') ov.querySelector('.equip, .again, .done')?.focus({ preventScroll: true }); };
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
      ov.setAttribute('aria-label', `${r.label}: ${r.name}`);
      ov.style.setProperty('--rv', RARITY[r.rarity].color);
      if (r.rarity === 'ultra' || r.rarity === 'super') ov.dataset.late = '';
      const parts = stage.querySelector('.parts');
      const n = r.tempo === 'special' ? 26 : r.tempo === 'quick' ? 0 : 12;
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2 + Math.random() * .3, d = (r.tempo === 'special' ? 260 : 170) * (.6 + Math.random() * .5);
        parts.append(h('i', { class: 'pt', style: { '--dx': Math.cos(a) * d + 'px', '--dy': Math.sin(a) * d + 'px', animationDelay: Math.random() * .15 + 's' } }));
      }
      if (r.tempo === 'special') for (let i = 0; i < 10; i++) {
        const x = (Math.random() * 2 - 1) * 200, y = -140 + Math.random() * 300;
        parts.append(h('i', { class: 'shine', style: { left: x + 'px', top: y + 'px', animationDelay: (Math.random() * 2) + 's' } }));
      }
      ov.append(card(r), ...after(r, v));
      if (skip || !slow) return set('done');
      const wait = Math.max(0, r.anticipation - (performance.now() - t0));
      later(() => { set('card'); later(() => set('done'), r.tempo === 'special' ? 1300 : r.tempo === 'quick' ? 650 : 950); }, wait);
    }
    function card(r) {
      return h('div', { class: 'bx-card', data: { rarity: r.rarity } },
        h('div', { class: 'in', data: { rarity: r.rarity } },
          h('div', { class: 'rl' }, r.label),
          h('div', { class: 'well' }, art(r.item, 150, 'reveal')),
          h('div', { class: 'nm', title: r.name }, r.name),
          h('div', { class: 'ln' }, `${r.kind} · ${r.bodiesText === 'both bodies' ? 'fits both bodies' : r.bodiesText}`,
            h('br'), r.worlds ? ['Wear it in ', h('b', {}, r.worlds === 'both worlds' ? 'both worlds' : r.worlds)] : null),
          r.duplicate ? h('div', { class: 'dup' }, r.dupText) : h('div', { class: 'ln' }, 'Added to your Wardrobe')),
        r.isNew ? h('div', { class: 'bx-new' }, 'NEW!') : null);
    }
    function after(r, v0) {
      const status = h('div', { class: 'status', role: 'status' });
      const nowView = () => boxView(S.info, v0.id);
      const equipBtn = h('button', { class: 'de-btn equip', disabled: !r.compatible, onclick: async () => {
        equipBtn.disabled = true; equipBtn.textContent = 'EQUIPPING…'; status.textContent = ''; delete status.dataset.bad;
        try {
          const w = wearWorld(r.item, body(), S.info?.appearance?.world);
          await api.equip(r.id, w?.world);
          equipBtn.textContent = 'EQUIPPED ✓'; equipBtn.dataset.done = '';
          status.textContent = !w || w.here ? `${r.name} is on. Other players see your new look.`
            : `${r.name} is set for ${WORLD_LABEL[w.world]}: you wear it there, and other players see it.`;
        } catch (e) {
          equipBtn.disabled = false; equipBtn.textContent = 'EQUIP NOW';
          status.dataset.bad = ''; status.textContent = e.message;
        }
      } }, r.compatible ? 'EQUIP NOW' : "CAN'T WEAR YET");
      const nv = nowView();
      const again = h('button', { class: 'de-pill again', disabled: !nv.affordable, title: nv.disabled || '',
        onclick: () => { close(); open(); } }, `Open another · ${mp(v0.price)}`);
      const meters = pityMeters(nv.box).map(m => `${m.label} ${m.text}`).join(' · ');
      return [
        h('div', { class: 'after' },
          r.notice ? h('div', { class: 'notice' }, r.notice) : null,
          equipBtn,
          h('div', { class: 'row' }, again, h('button', { class: 'de-pill done', data: { tone: 'dark' }, onclick: close }, 'Done')),
          h('button', { class: 'bx-link wd', onclick: () => { close(); wardrobe(r.id); } }, 'View it in your Wardrobe'),
          !nv.affordable && nv.disabled ? h('div', { class: 'status', 'data-bad': '' }, nv.disabled) : status),
        h('div', { class: 'foot' }, meters ? `${nv.name}: ${meters}` : ''),
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
    destroy() {
      S.dead = true; off(); clearTimeout(S.msgTimer);
      for (const a of arts.values()) a.r?.destroy?.();
      arts.clear(); el.remove();
    },
  };
}

// a selector that finds the same control after a rebuild (the tabs, the arrows, the buttons by their class)
function focusKey(e) {
  if (e.classList.contains('bx-tab')) return '.bx-tab[data-on]';
  for (const c of ['bx-prev', 'bx-next', 'bx-open', 'bx-link', 'bx-sidebtn', 'bx-list', 'de-pill']) if (e.classList.contains(c)) return '.' + c;
  return null;
}
// '#ffc23d' + alpha -> rgba()
function hexA(hex, a) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${n >> 16 & 255}, ${n >> 8 & 255}, ${n & 255}, ${a})`;
}
