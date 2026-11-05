// The card shop, full screen (the approved mockup A: ~/.cache/de-scratch/shopmock a-home / a-detail / a-odds). It takes
// over the screen while the native shop's category menu (CShopCategoryWindow, scene 0x0e) is up; screens/shop.js mounts
// it there and hides it while a native category is open (the Cosmetic Boxes tab opens the Avatar Parts category, where
// cosmetics/boxes.js draws the box shop). Back is the native Exit button, clicked for the player (onBack).
//   the band    title plate, the line under it, the wallet (one MP number, its (i): how much is starter MP), Back
//   the tabs    Recommended / Card Packs / Structure Decks / Cosmetic Boxes (single cards are retired: crafting)
//   the side    the Card Packs feed's groups (Unlocked for You, This Update, Leaving Soon, Booster Packs, Beginner
//               Picks; empty ones hidden) and the collection
//   the feed    the banners: a hero and half banners, each with its featured cards and a 1 Pack buy pill
//   Cosmetic Boxes  shop/boxes.js: the boxes as the sub-nav, a banner per box, a box's page (S.page 'box:<id>') with
//               the waist-up try-on, Contents & odds, the box reveal (?HTML_SHOP=0 keeps the native box shop instead)
//   the page    a pack: the hero fan, the featured UR / SR carousel, the description, Details & Odds / Card List /
//               Missing Cards / Your Pulls (the details sheet: screens/pack-contents.js), collected per rarity, Buy ×1 / ×10
// Purchases: POST /api/de/shop/buy (shop-api.ts shopPurchaseApi), then the reveal (shop/reveal.js). Data: shop/model.js.
import { injectShopSkin } from '../cosmetics/shopart.js';
import { injectShopCss } from './css.js';
import { loadGlyph, packBg } from './art.js';
import { h, at, mp, card, pack, bar, bt, wallet } from './dom.js';
import * as M from './model.js';
import { openReveal } from './reveal.js';
import { openPackContents } from '../screens/pack-contents.js';
import { createBoxes } from './boxes.js';

const FEED = { w: 766, half: 375, gap: 16, heroH: 300, halfH: 260 };
// the four tabs across the screen, 24 to 1000
const TAB = { w: 232, pitch: 248 };

/**
 * Mount the shop in `host` (the 1024 x 768 layer). opts: { onBack() (the native Exit), fetch (tests), now (tests) }
 * -> { el, show(on), refresh(), destroy(), state }
 */
export function mountCardShop(host, { onBack, fetch: f, now = () => Date.now() } = {}) {
  const doc = host.ownerDocument;
  injectShopSkin(doc); injectShopCss(doc); loadGlyph();
  const S = { view: null, error: null, tab: 'recommended', group: null, page: null, pack: null, packErr: null, busy: false,
    msg: null, car: 0, hero: 0, dead: false, scroll: {} };
  const el = h('div', { class: 'ns de-c', role: 'region', 'aria-label': 'Card Shop', tabindex: '-1' });
  // the game reads the keyboard and the mouse too (SDL listens on the window): every key typed and every pointer, mouse,
  // wheel and touch event in the shop stays here, so the native menu under it never sees the player's mouse
  for (const t of ['keydown', 'keyup', 'keypress', 'pointerdown', 'pointerup', 'pointermove', 'mousedown', 'mouseup', 'mousemove',
    'click', 'dblclick', 'contextmenu', 'wheel', 'touchstart', 'touchmove', 'touchend', 'touchcancel']) el.addEventListener(t, e => e.stopPropagation());
  el.addEventListener('keydown', e => {
    if (e.key !== 'Escape' || e.defaultPrevented) return;
    if (el.querySelector('.rv, .sheet')) return;   // their own
    if (S.page) { e.preventDefault(); home(); }
  });
  host.append(el);
  let timer = setInterval(() => tick(), 30e3), toastTimer = 0;
  // the Cosmetic Boxes tab (its own data: cosmetics/api.js); its wallet is the band's
  const boxPage = () => (typeof S.page === 'string' && S.page.startsWith('box:') ? S.page.slice(4) : null);
  const boxes = createBoxes({ el, rerender: () => render(), say: t => say(t),
    onWallet: w => { if (S.view && w) S.view = { ...S.view, wallet: { ...S.view.wallet, total: w.total, bound: w.bound, earned: w.earned } }; },
    onPage: id => { keepScroll(); S.tab = 'boxes'; S.page = 'box:' + id; render(); el.querySelector('.bt.nav')?.focus({ preventScroll: true }); } });

  // ---------------------------------------------------------------- data
  async function load() {
    try { S.view = await M.fetchShop(f); S.error = null; } catch (e) { S.error = e; }
    if (!S.dead) render();
  }
  async function loadPack(id) {
    S.pack = null; S.packErr = null; render();
    try { const d = await M.fetchPack(id, f); if (S.page === id) S.pack = d; } catch (e) { if (S.page === id) S.packErr = e; }
    if (!S.dead && S.page === id) render();
  }
  const item = id => S.view?.items?.find(i => i.kind === 1 && i.param === id);
  const say = (text, bad = true) => {
    S.msg = text ? { text, bad } : null;
    clearTimeout(toastTimer);
    if (text) toastTimer = setTimeout(() => { S.msg = null; drawToast(); }, 6000);
    drawToast();
  };

  // ---------------------------------------------------------------- buying
  // item: a shop item (kind 1 or 0); count 1 or 10. The reveal opens at once (cards face down) and turns them over when
  // the server answers. A stale request id (the view is older than the last purchase) is refreshed and sent once more.
  async function purchase(it, count) {
    if (S.busy || !S.view) return;
    if (M.deckBought(it)) { say(M.errorText('already-owned-deck')); return; }
    if (!M.canAfford(S.view, it.price, count)) { say("You don't have enough MP for that."); return; }
    S.busy = true; say(null); render();
    const title = it.title || it.displayName;
    const rv = openReveal(el, { title, count, again: () => it.group !== 'deck' && M.canAfford(S.view, it.price, count) ? { label: againLabel(it, count), price: it.price * count } : null,
      onAgain: () => purchase(it, count), onDone: () => focusAfter() });
    try {
      let out;
      try { out = await M.buy(S.view, it.itemId ?? it.id, count, f); } catch (e) {
        if (e.error !== 'stale-request') throw e;
        S.view = await M.fetchShop(f);
        out = await M.buy(S.view, it.itemId ?? it.id, count, f);
      }
      const { purchased, replayed: _r, ...view } = out;
      S.view = view;
      rv.result(M.revealSummary(purchased, new Map(S.pack?.cards?.map(c => [c.passcode, c.name]))));
      if (S.page != null) M.fetchPack(S.page, f).then(d => { if (!S.dead && S.pack && d.packId === S.page) { S.pack = d; render(); } }, () => {});
    } catch (e) {
      rv.close();
      say(e.message || M.errorText(e.error));
      if (e.error === 'already-owned-deck' && S.pack && S.page === (it.itemId ?? it.param)) S.pack = { ...S.pack, purchased: true };
      if (e.error === 'purchase-rejected' || e.error === 'stale-request' || e.error === 'already-owned-deck') M.fetchShop(f).then(v => { S.view = v; render(); }, () => {});
    } finally {
      S.busy = false;
      if (!S.dead) render();
    }
  }
  const againLabel = (it, count) => `Buy ${count} more ${M.unitWord(it, count).toLowerCase()}`;
  const focusAfter = () => el.querySelector('[data-k=buy10], [data-k=buy1], .tabs [aria-selected=true]')?.focus({ preventScroll: true });

  // ---------------------------------------------------------------- navigation
  function setTab(id) {
    keepScroll();
    if (id === 'boxes') boxes.load(false);
    S.tab = id; S.page = null; S.group = id === 'packs' && S.view ? M.packSections(S.view, now())[0]?.id ?? null : null;
    render();
    const f2 = el.querySelector('.feed');
    if (f2) f2.scrollTop = S.scroll[id] || 0;
  }
  function goGroup(id) {
    keepScroll();
    S.tab = 'packs'; S.page = null; S.group = id;
    render();
    const f2 = el.querySelector('.feed'), s = el.querySelector(`.feed [data-sect="${id}"]`);
    if (f2 && s) f2.scrollTop = s.offsetTop;
  }
  function openPage(id) {
    if (typeof id === 'string' && id.startsWith('box:')) { boxes.load(false); S.tab = 'boxes'; S.page = id; render(); return; }
    keepScroll();
    S.page = id; S.car = 0;
    loadPack(id);
    el.querySelector('.bt.nav')?.focus({ preventScroll: true });
  }
  function home() {
    S.page = null; S.pack = null;
    render();
    const f2 = el.querySelector('.feed');
    if (f2) f2.scrollTop = S.scroll[S.tab] || 0;
    el.querySelector('.tabs [aria-selected=true]')?.focus({ preventScroll: true });
  }
  const keepScroll = () => { const f2 = el.querySelector('.feed'); if (f2 && !S.page) S.scroll[S.tab] = f2.scrollTop; };
  function sheet(view) {
    const d = S.pack, it = item(S.page);
    if (!d) return;
    openPackContents(el, { id: S.page, data: d, view, fetch: f, onClose: () => el.querySelector(`[data-k="row-${view}"]`)?.focus({ preventScroll: true }) });
    void it;
  }

  // ---------------------------------------------------------------- the band and the tabs
  function band() {
    const c = S.view && M.catalogue(S.view, now());
    const bx = boxPage() != null ? boxes.band(boxPage()) : null;
    const p = S.page != null && !bx ? (S.pack || item(S.page)) : null;
    const title = bx ? bx.title : p ? p.title || p.displayName || `Pack ${S.page}` : 'Card Shop';
    const tw = p || bx ? Math.max(236, Math.min(330, Math.round(title.length * 13.2 + 40))) : 236;
    const lines = bx ? bx.lines : p ? [p.group === 'deck' ? 'Structure Deck' : p.group === 'beginner' ? "Beginner's Pack · Seasons 1–3" : `Pack ${p.packId ?? p.param} · Season ${p.season} Booster`,
      p.group === 'deck' ? `${p.size} cards` : `${p.size || 5} cards per pack`]
      : [S.view?.update ? `This Update: ${S.view.update.theme}` : c ? `${c.boosters.length + c.beginner.length} packs · ${c.decks.length} structure decks` : ''];
    return [
      h('div', { class: 'sa-band top' }),
      h('div', { class: 'sa-title', role: 'heading', 'aria-level': '1', style: at(22, 26, tw) }, title),
      lines.length === 1 ? h('div', { class: 'abs t w', style: at(tw + 40, 36) }, lines[0])
        : [h('div', { class: 'abs t w', style: at(tw + 38, 28) }, lines[0]), h('div', { class: 'abs t w', style: { ...at(tw + 38, 47), opacity: .9 } }, lines[1])],
      wallet(S.view?.wallet),
      bt('nav', 48, { style: at(808, 16), 'aria-label': S.page != null ? 'Back to the shop' : 'Leave the shop', onclick: () => (S.page != null ? home() : onBack?.()) }, h('span', {}, 'Back')),
    ];
  }
  function tabs() {
    const c = S.view && M.catalogue(S.view, now()), dot = c && (c.unlocked.length || c.boosters.some(p => p.rotation?.group === 'update'));
    return h('div', { class: 'tabs', role: 'tablist', 'aria-label': 'Shop' },
      M.TABS.map((t, i) => bt('seg', 40, { role: 'tab', 'aria-selected': String(!S.page && S.tab === t.id), tabindex: !S.page && S.tab === t.id ? '0' : '-1',
        style: at(24 + i * TAB.pitch, 96, TAB.w), data: { k: 'tab-' + t.id }, onclick: () => setTab(t.id),
        onkeydown: e => { if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') { e.preventDefault(); const N = M.TABS.length, n = M.TABS[(i + (e.key === 'ArrowRight' ? 1 : N - 1)) % N]; setTab(n.id); el.querySelector(`[data-k=tab-${n.id}]`)?.focus(); } } },
      h('span', {}, t.label))),
      dot ? h('div', { class: 'redot', style: at(24 + TAB.pitch + TAB.w - 16, 88), 'aria-hidden': 'true' }, '!') : null);
  }
  function side() {
    if (S.tab === 'boxes') return boxes.side(boxPage());
    const groups = S.view ? M.packSections(S.view, now()) : [];
    const showNav = S.tab === 'recommended' || S.tab === 'packs';
    const nav = showNav ? groups.map((g, i) => bt('list', 40, { style: at(24, 152 + i * 46), 'aria-current': S.tab === 'packs' && S.group === g.id ? 'true' : null,
      'aria-selected': String(S.tab === 'packs' && S.group === g.id), data: { k: 'grp-' + g.id }, onclick: () => goGroup(g.id) },
    h('span', {}, g.label), h('span', { class: 'meta' }, String(g.packs.length)))) : [];
    const y = showNav ? 152 + groups.length * 46 + 10 : 152, col = S.view?.collection;
    return h('nav', { class: 'side', 'aria-label': 'Card packs' }, nav,
      col ? [h('div', { class: 'well', style: at(24, y, 190, 112) }),
        h('div', { class: 'abs t sub', style: at(36, y + 12) }, 'Your collection'),
        h('div', { class: 'abs t28', style: at(36, y + 34) }, col.copies.toLocaleString('en-US'), ' ', h('span', { class: 't sub' }, 'cards')),
        h('div', { class: 'abs t12 sub', style: { ...at(36, y + 72), lineHeight: '15px' } }, `${col.cards.toLocaleString('en-US')} different`),
        h('div', { class: 'abs t12 sub', style: at(36, y + 88) }, `Ultra Rare ${col.byRarity?.UR ?? 0} · Super Rare ${col.byRarity?.SR ?? 0}`)] : null);
  }

  // ---------------------------------------------------------------- the banners
  const tagEl = (t, x, y) => t ? h('div', { class: 'tag', data: { k: t.kind, ends: t.kind === 'unlocked' ? t.ends : null }, style: at(x, y) }, t.text) : null;
  // a structure deck sells once per character: bought, its pill says so and takes no click
  const buyPill = (p, size, style) => M.deckBought(p)
    ? bt('secondary', size, { style, disabled: true, 'aria-label': `${p.displayName}: purchased`, data: { k: 'buy-' + p.param, bought: true } }, h('span', {}, 'Purchased'))
    : bt('primary', size, { style, 'aria-label': `Buy 1 ${M.unitWord(p).toLowerCase()} of ${p.displayName} for ${p.price} MP`,
      disabled: S.busy || !S.view, data: { k: 'buy-' + p.param }, onclick: e => { e.stopPropagation(); purchase(p, 1); } },
    h('span', {}, `1 ${M.unitWord(p)}`), mp(p.price));
  const boughtTag = (p, x, y) => M.deckBought(p) ? h('div', { class: 'tag', data: { k: 'bought' }, style: at(x, y) }, '✓ Purchased') : null;
  const hit = p => h('button', { type: 'button', class: 'hit', 'aria-label': `${p.displayName}: open`, onclick: () => openPage(p.param) });
  function heroBanner(p, y) {
    const t = M.packTag(p, S.view, now()), f = p.featured || [];
    const wash = h('div', { class: 'wash' }); packBg(wash, p.art);
    const timeTag = t?.time && t.kind !== 'unlocked' ? h('div', { class: 'tag time', style: at(0, 270) }, '◷ ' + t.time) : null;
    return h('div', { class: 'banner', style: at(0, y, FEED.w, FEED.heroH), data: { pack: p.param } },
      hit(p), wash, h('div', { class: 'glyph' }), h('div', { class: 'shine' }),
      h('div', { class: 'tag cy', style: at(0, 10) }, p.group === 'deck' ? 'Structure Deck' : p.group === 'beginner' ? "Beginner's Pack" : 'Booster Pack'),
      M.deckBought(p) ? boughtTag(p, 130, 10) : tagEl(t, 130, 10),
      pack(p, 34, 44, 118, -7),
      h('div', { class: 'abs t23', style: { ...at(186, 48, 250), color: '#0c2a38', whiteSpace: 'normal' } }, p.title),
      h('div', { class: 'abs t sub', style: at(188, 80 + (p.title.length > 20 ? 26 : 0)) }, M.packLine(p)),
      h('div', { class: 'abs t sub', style: at(188, 98 + (p.title.length > 20 ? 26 : 0)) }, p.group === 'deck' ? 'Every card listed comes in the deck' : `${p.size} cards · the 5th Rare or better`),
      f.length ? h('div', { class: 'abs t12 wrap', style: { ...at(188, 150, 236), lineHeight: '16px', color: '#173946' } }, 'Featured: ',
        f.map((c, i) => [i ? ', ' : '', c.rarity === 'UR' ? h('span', { style: { color: '#7a4f00' } }, c.name) : c.name])) : null,
      h('div', { class: 'abs t sub', style: at(188, 226) }, 'Collected'),
      h('div', { class: 'abs t', style: { ...at(288, 226, 100), textAlign: 'right' } }, `${p.collected.owned} / ${p.collected.total}`),
      bar(188, 246, 200, p.collected.owned, p.collected.total),
      f.slice(0, 3).map((c, i) => card(c, { x: [448, 546, 644][i], y: [58, 52, 58][i], w: 94, rot: [-4, 0, 4][i] })),
      timeTag,
      buyPill(p, 32, { right: '14px', bottom: '12px' }));
  }
  function halfBanner(p, x, y) {
    const t = M.packTag(p, S.view, now()), f = p.featured || [];
    const wash = h('div', { class: 'wash' }); packBg(wash, p.art);
    const short = p.group === 'deck' ? `${p.size} cards` : p.group === 'beginner' ? 'Seasons 1–3' : `Pack ${p.param}`;
    return h('div', { class: 'banner', style: at(x, y, FEED.half, FEED.halfH), data: { pack: p.param } },
      hit(p), wash, h('div', { class: 'glyph' }), h('div', { class: 'shine' }),
      h('div', { class: 'hd' }, h('span', { class: 'nm' }, p.title), h('span', { class: 't12' }, `${short} · ${p.collected.owned} / ${p.collected.total}`)),
      M.deckBought(p) ? boughtTag(p, 0, 36) : tagEl(t?.time && t.kind !== 'unlocked' && t.kind !== 'leaving' ? { ...t, text: `${t.text} · ${t.time}` } : t, 0, 36),
      pack(p, 22, 66, 90, -6),
      f.slice(0, 2).map((c, i) => card(c, { x: [140, 240][i], y: [52, 58][i], w: 92, rot: [-3, 3][i] })),
      buyPill(p, 32, { right: '12px', bottom: '12px' }));
  }
  // half banners two a row from y; -> [elements, the next y]
  function halves(list, y) {
    const out = list.map((p, i) => halfBanner(p, i % 2 ? FEED.half + FEED.gap : 0, y + Math.floor(i / 2) * (FEED.halfH + 18)));
    return [out, y + Math.ceil(list.length / 2) * (FEED.halfH + 18)];
  }
  function feed() {
    const box = h('div', { class: 'feed scroll', role: 'region', 'aria-label': M.TABS.find(t => t.id === S.tab)?.label, tabindex: '-1' });
    const inner = h('div', { class: 'in' });
    box.append(inner);
    let y = 0, kids = [];
    if (S.error && !S.view) {
      kids = [h('div', { class: 'msg', style: at(0, 160, FEED.w), role: 'alert' }, h('div', { class: 't18' }, "Couldn't open the shop"),
        h('div', { class: 't sub wrap', style: { maxWidth: '480px' } }, S.error.message),
        bt('secondary', 40, { class: 'rel', onclick: () => { S.error = null; render(); load(); } }, h('span', {}, 'Try again')))];
      y = 400;
    } else if (!S.view) {
      kids = [h('div', { class: 'skel', style: { ...at(0, 0, FEED.w, FEED.heroH), position: 'absolute', borderRadius: '4px' } }),
        h('div', { class: 'skel', style: { ...at(0, 318, FEED.half, FEED.halfH), position: 'absolute', borderRadius: '4px' } }),
        h('div', { class: 'skel', style: { ...at(FEED.half + FEED.gap, 318, FEED.half, FEED.halfH), position: 'absolute', borderRadius: '4px' } })];
      y = 578;
    } else if (S.tab === 'recommended') {
      const r = M.recommended(S.view, now(), S.hero), u = S.view.update;
      if (u?.theme) {
        const left = M.timeLeft(u.endsAt, now());
        kids.push(h('div', { class: 'abs t18 wrap', style: at(0, 0, FEED.w), role: 'heading', 'aria-level': '2', data: { k: 'theme' } },
          `This Update: ${u.theme}${left ? ' · ends in ' + left.replace(' left', '') : ''}`),
          h('div', { class: 'abs t12 sub wrap', style: at(0, 32, FEED.w) }, u.blurb));
        y = 76;
      }
      if (r.hero) { kids.push(heroBanner(r.hero, y)); y += FEED.heroH + 18; }
      const [hs, y2] = halves(r.halves, y); kids.push(...hs); y = y2;
    } else if (S.tab === 'packs') {
      for (const s of M.packSections(S.view, now())) {
        kids.push(h('div', { class: 'sect', style: at(0, y), data: { sect: s.id } }, h('span', { class: 't18', role: 'heading', 'aria-level': '2' }, s.label),
          h('span', { class: 't sub' }, `${s.packs.length} ${s.packs.length === 1 ? 'pack' : 'packs'}`)));
        const [hs, y2] = halves(s.packs, y + 34); kids.push(...hs); y = y2 + 8;
      }
    } else if (S.tab === 'decks') {
      const [hs, y2] = halves(M.catalogue(S.view).decks, 0); kids.push(...hs); y = y2;
    } else if (S.tab === 'boxes') {
      const [ks, y2] = boxes.home(); kids = [ks].flat(); y = y2;
    }
    inner.style.height = Math.max(y, 0) + 'px';
    inner.append(...kids);
    // the side's group follows the scroll on Card Packs
    if (S.tab === 'packs') box.addEventListener('scroll', () => {
      const secs = [...box.querySelectorAll('[data-sect]')];
      const cur = secs.filter(s => s.offsetTop <= box.scrollTop + 40).pop()?.dataset.sect || secs[0]?.dataset.sect;
      if (cur && cur !== S.group) { S.group = cur; el.querySelectorAll('.side .bt').forEach(b => b.setAttribute('aria-selected', String(b.dataset.k === 'grp-' + cur))); }
    }, { passive: true });
    return box;
  }

  // ---------------------------------------------------------------- the pack page
  const opened = (n, deck) => deck ? `${n} bought` : `${n} ${n === 1 ? 'pack' : 'packs'} opened`;
  function page() {
    const it = item(S.page), d = S.pack, p = d || it;
    if (!p) return h('div', { class: 'empty t' }, "This pack isn't on sale.");
    const deck = p.group === 'deck' || d?.kind === 'deck', t = M.packTag(it || { ...p, param: S.page }, S.view, now());
    const out = [];
    // the hero: the fan of packs on the rays, the kind tag, the rotation (or unlocked) tag
    const fan = [[-150, 26, .78, -16], [-80, 12, .88, -8], [80, 12, .88, 8], [150, 26, .78, 16]];
    // a countdown only with a real end date (leaving, or this update's packs once their end is set)
    const rot = t?.time && (t.kind === 'leaving' || t.kind === 'update')
      ? { kind: 'time', text: `◷ ${t.time}${t.ends ? ` · rotates out ${M.shortDate(t.ends)}` : ''}` } : t;
    out.push(h('div', { class: 'hero', style: at(24, 94, 610, 330) },
      h('div', { class: 'rays' }), h('div', { class: 'glyph' }), h('div', { class: 'floor' }),
      deck ? null : fan.map(([dx, dy, k, r]) => pack(p, 305 - 54 * k + dx, 62 + dy, 108 * k, r, { filter: 'brightness(.93)' })),
      pack(p, 243, 36, 124),
      h('div', { class: 'tag cy', style: at(0, 12) }, deck ? 'Structure Deck' : p.group === 'beginner' ? "Beginner's Pack" : `Booster Pack · Season ${p.season}`),
      rot?.kind === 'time' ? h('div', { class: 'tag time', style: at(0, 296) }, rot.text) : tagEl(rot, 0, 296),
      deck ? boughtTag({ ...it, ...d, group: 'deck', purchased: d?.purchased ?? it?.purchased }, 136, 12) : null));
    // the featured carousel: five a page
    const fc = d ? M.carousel(d) : [], pages = Math.max(1, Math.ceil(fc.length / 5)), pg = Math.min(S.car, pages - 1);
    const shown = fc.slice(pg * 5, pg * 5 + 5), x0 = 78 + (5 - shown.length) * 51;
    const turn = n => { S.car = (pg + n + pages) % pages; render(); el.querySelector(n < 0 ? '[data-k=prev]' : '[data-k=next]')?.focus({ preventScroll: true }); };
    out.push(h('div', { class: 'well', style: at(24, 436, 610, 288) }),
      h('div', { class: 'abs t sub', role: 'heading', 'aria-level': '2', style: at(40, 446) }, 'Featured cards'),
      h('div', { class: 'abs t12 sub', style: { right: '406px', top: '448px' } }, deck ? 'The rarest cards in the deck' : 'Ultra Rare and Super Rare'),
      bt('seg', 48, { 'aria-label': 'Previous cards', disabled: pages < 2, style: { ...at(30, 558, 32), padding: 0, fontSize: '22px' }, data: { k: 'prev' }, onclick: () => turn(-1) }, '‹'),
      bt('seg', 48, { 'aria-label': 'Next cards', disabled: pages < 2, style: { ...at(596, 558, 32), padding: 0, fontSize: '22px' }, data: { k: 'next' }, onclick: () => turn(1) }, '›'),
      d ? shown.map((c, i) => card(c, { x: x0 + i * 102, y: 474, w: 92, own: c.owned || 0 })) : [0, 1, 2, 3, 4].map(i => h('div', { class: 'skel', style: { ...at(78 + i * 102, 474, 92, 133), position: 'absolute' } })),
      shown.map((c, i) => h('div', { class: 'fcap', style: at(x0 - 4 + i * 102) }, c.name)),
      d ? h('div', { class: 'abs t12 sub', style: { ...at(66, 652, 504), textAlign: 'center' } }, M.carouselNote(d)) : null,
      pages > 1 ? h('div', { class: 'dots', style: at(329, 688), 'aria-hidden': 'true' }, Array.from({ length: pages }, (_, i) => h('i', { data: { on: i === pg } }))) : null);
    // the right column: the description, the rows, the collection, buying
    const desc = p.description || '';
    out.push(h('div', { class: 'well', style: at(648, 94, 352, 118) }),
      h('div', { class: 'abs t wrap', style: { ...at(662, 106, 326), lineHeight: '19px' } }, desc),
      deck || p.group === 'beginner' ? null : h('div', { class: 'abs t12 sub wrap', style: { ...at(662, 176, 326), lineHeight: '15px' } },
        'After it rotates out, its cards can still be crafted in the Deck Editor.'));
    const missing = d ? d.cards.filter(c => !c.owned).length : null, pulls = d?.pulls?.length ?? null;
    const rows = [['odds', deck ? 'Deck Details' : 'Details & Odds', ''], ['list', 'Card List', d ? `${d.cards.length} cards` : '…'],
      ['missing', 'Missing Cards', d ? (missing ? `${missing} missing` : 'None') : '…'],
      ['pulls', deck ? 'Your Purchases' : 'Your Pulls', d ? (pulls ? opened(d.pulls.reduce((n, x) => n + x.count, 0), deck) : 'None yet') : '…']];
    out.push(...rows.map(([k, label, meta], i) => bt('list', 40, { style: at(648, 222 + i * 46, 352), disabled: !d, data: { k: 'row-' + k },
      'aria-haspopup': 'dialog', onclick: () => sheet(k) }, h('span', {}, label), meta ? h('span', { class: 'meta' }, meta) : null, h('span', { class: 'chev', 'aria-hidden': 'true' }))));
    const col = d?.collected || p.collected || { owned: 0, total: 0 };
    out.push(h('div', { class: 'well', style: at(648, 410, 352, 150) }),
      h('div', { class: 'abs t', style: at(662, 420) }, 'Collected'),
      h('div', { class: 'abs t', style: { right: '38px', top: '420px' } }, `${col.owned} / ${col.total}`),
      bar(662, 442, 324, col.owned, col.total),
      d ? h('div', { class: 'rar', style: at(662, 464, 324) }, M.RARITIES.filter(r => d.collectedByRarity?.[r]?.total).map(r => [
        h('span', { class: 'dia', data: { r }, 'aria-hidden': 'true' }), h('span', { class: 't' }, M.LABEL[r]),
        h('span', { class: 't' }, `${d.collectedByRarity[r].owned} / ${d.collectedByRarity[r].total}`)])) : null);
    const bought = deck && (d?.purchased ?? it?.purchased) === true;
    const price = it?.price ?? d?.price ?? 0, can = n => !!S.view && M.canAfford(S.view, price, n) && !S.busy && !!it && !bought;
    const tail = !it ? "This pack isn't on sale." : bought ? M.errorText('already-owned-deck')
      : !M.canAfford(S.view, price, 1) ? `You need ${price.toLocaleString('en-US')} MP.` : d ? M.tenNote(d) : '';
    // a deck: one Buy (decks sell once per character, never ten)
    if (deck) out.push(bought ? bt('secondary', 48, { style: at(648, 630, 352), disabled: true, data: { k: 'buy1', bought: true } }, h('span', {}, '✓ Purchased'))
      : bt('primary', 48, { style: at(648, 630, 352), disabled: !can(1), data: { k: 'buy1' }, onclick: () => purchase({ ...it, purchased: false }, 1) },
        h('span', {}, 'Buy Deck ·'), mp(price)));
    else out.push(
      bt('secondary', 48, { style: at(648, 574, 352), disabled: !can(1), data: { k: 'buy1' }, onclick: () => purchase(it, 1) }, h('span', {}, 'Buy 1 Pack ·'), mp(price)),
      bt('primary', 48, { style: at(648, 630, 352), disabled: !can(10), data: { k: 'buy10' }, title: can(1) && !can(10) ? `You need ${(price * 10).toLocaleString('en-US')} MP for 10.` : null,
        onclick: () => purchase(it, 10) }, h('span', {}, 'Buy 10 Packs ·'), mp(price * 10)));
    out.push(h('div', { class: 'note t12 sub wrap', style: at(648, 688, 352), data: { bad: !!it && !bought && !M.canAfford(S.view, price, 1) } }, tail));
    if (S.packErr) out.push(h('div', { class: 'msg', style: at(24, 520, 610), role: 'alert' }, h('div', { class: 't' }, S.packErr.message),
      bt('secondary', 32, { class: 'rel', onclick: () => loadPack(S.page) }, h('span', {}, 'Try again'))));
    return h('div', { class: 'page', role: 'main', 'aria-label': p.displayName || p.title }, out);
  }

  // ---------------------------------------------------------------- drawing
  const toast = h('div', { class: 'abs', role: 'status', 'aria-live': 'polite', style: { left: '0', right: '0', top: '696px', display: 'flex', justifyContent: 'center', pointerEvents: 'none', zIndex: 25 } });
  function drawToast() {
    toast.replaceChildren(...(S.msg ? [h('div', { class: 't', style: { padding: '8px 16px', borderRadius: '2px', color: '#fff', background: S.msg.bad ? '#a82313' : '#2b3d46',
      boxShadow: '0 0 0 1px rgba(10,20,25,.6), 0 3px 8px rgba(0,0,0,.3)' } }, S.msg.text)] : []));
  }
  function render() {
    if (S.dead) return;
    const focusK = doc.activeElement && el.contains(doc.activeElement) ? doc.activeElement.dataset?.k : null;
    const keep = [...el.children].filter(c => c.classList.contains('rv') || c.classList.contains('sheet'));
    el.replaceChildren(h('div', { class: 'sa-glass bg', 'aria-hidden': 'true' }), ...band().flat(),
      ...(boxPage() != null ? [boxes.page(boxPage())] : S.page != null ? [page()] : [tabs(), side(), feed()]), toast, ...keep);
    drawToast();
    if (focusK) el.querySelector(`[data-k="${focusK}"]`)?.focus({ preventScroll: true });
  }
  // the countdowns move on without a rebuild (scroll and focus stay)
  function tick() {
    if (S.dead || !S.view) return;
    if (S.view.nextUpdateAt && Date.parse(S.view.nextUpdateAt) <= now()) { load(); return; }
    if (S.tab === 'recommended' && S.page == null && !S.busy && !el.querySelector('.rv, .sheet')) {
      const scroll = el.querySelector('.feed')?.scrollTop || 0;
      S.hero++; render();
      const feed = el.querySelector('.feed'); if (feed) feed.scrollTop = scroll;
    }
    const c = M.catalogue(S.view, now());
    if (Object.keys(S.view.unlocked || {}).length !== c.unlocked.length && !el.querySelector('.rv, .sheet')) { S.view = { ...S.view }; render(); return; }
    el.querySelectorAll('.tag[data-ends]').forEach(t => { const left = M.timeLeft(t.dataset.ends, now()); if (left) t.textContent = `Unlocked · ${left}`; });
  }

  render();
  load();
  return {
    el, state: S,
    show(on) {
      if (el.hidden === !on) return;
      el.hidden = !on;
      if (on) { load(); if (S.tab === 'boxes') boxes.load(true); el.querySelector('.tabs [aria-selected=true], .bt.nav')?.focus({ preventScroll: true }); }
    },
    refresh() { if (S.tab === 'boxes') boxes.load(true); return load(); },
    openPage,
    destroy() { S.dead = true; boxes.destroy(); clearInterval(timer); clearTimeout(toastTimer); el.remove(); },
  };
}
