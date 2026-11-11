// The card shop's details sheet (mockup A's a3, ~/.cache/de-scratch/shopmock): the odds per card slot, the chance of
// each rarity in one pack and in ten, the duplicates note, and the card grid with its rarity filters and "Missing only";
// "Your Pulls" lists the player's last pulls of the pack instead. It opens over the full-screen shop (shop/index.js:
// the pack page's Details & Odds / Card List / Missing Cards / Your Pulls rows), and over the native Booster Packs
// window when a pack's art is clicked there (the hotspots below). Data: GET /api/de/shop/pack?id=<pack> (the Worker
// forwards it to the game's /__de/shop/pack: server/src/game/shop-api.ts shopPackView).
// The look is the shop's (shop/css.js, mockup A's skin and buttons): the glass window with its slate band, the cyan
// title plate, the Close pill, the blue table headers, the grey plates as the filters. Game px: the window 944 x 672
// at (40, 40), 8-px grid.
//
// The pack under the art: the window's own item list (read/shop.js `packs`: every pack's id in the catalogue's order,
// ten a page) at page * 10 + the art's slot (five columns 99 apart from x 299, rows at y 114 and 348).
// Rarity: the server says N, R, SR, UR (C is taken as N): the badges show those codes, the words are Normal, Rare,
// Super Rare and Ultra Rare.
import { injectShopSkin } from '../cosmetics/shopart.js';
import { injectShopCss } from '../shop/css.js';
import { h, at, card, bt } from '../shop/dom.js';
import { slotRows, chanceRows, filterCards, ago } from '../shop/model.js';
// ---------------------------------------------------------------- the data
export const RARITIES = ['UR', 'SR', 'R', 'N'];
export const LABEL = { UR: 'Ultra Rare', SR: 'Super Rare', R: 'Rare', N: 'Normal' };
/** The server's rarity code as shown: N, R, SR, UR (C, an alias of N, and anything unknown are N). */
export const rarityOf = r => (LABEL[r] ? r : 'N');
const tierMap = o => { const out = {}; for (const [k, v] of Object.entries(o || {})) out[rarityOf(k)] = (out[rarityOf(k)] || 0) + (+v || 0); return out; };
/** The response with every rarity key and value in N / R / SR / UR. */
export function normalize(d) {
  return { ...d, slots: (d.slots || []).map(s => ({ ...s, guaranteed: s.guaranteed ? rarityOf(s.guaranteed) : null, odds: tierMap(s.odds) })),
    perCard: tierMap(d.perCard), cards: (d.cards || []).map(c => ({ ...c, rarity: rarityOf(c.rarity), owned: +c.owned || 0 })) };
}
/** A chance (0..1) as a short percentage: "70%", "4.9%", "0.25%", "<0.01%". */
export function pct(v) {
  const p = (+v || 0) * 100;
  if (p <= 0) return '0%';
  if (p < 0.01) return '<0.01%';
  const s = p >= 10 ? p.toFixed(0) : p >= 1 ? p.toFixed(1) : p.toFixed(2);
  return s.replace(/\.0+$|(\.\d*?)0+$/, '$1') + '%';
}
const ordinal = n => n + (n % 100 >= 11 && n % 100 <= 13 ? 'th' : ['th', 'st', 'nd', 'rd'][n % 10] || 'th');
/** The odds in plain English: { lead: '5 cards per pack', lines: [{ label: 'Cards 1–4', note, odds: [[code, label, pct]] }] }. */
export function describeOdds(d) {
  if (d.kind === 'deck') return { lead: `${d.size || d.cards.length} cards, always the same`, lines: [] };
  let at = 1;
  const lines = d.slots.map(s => {
    const first = at; at += s.count;
    const label = s.count === 1 ? `${ordinal(first)} card` : first === 1 ? `${s.count} cards` : `Cards ${first}–${first + s.count - 1}`;
    const odds = RARITIES.slice().reverse().filter(r => s.odds[r] > 0).map(r => [r, LABEL[r], pct(s.odds[r])]);
    return { label, note: s.guaranteed ? `${LABEL[s.guaranteed]} or better guaranteed` : '', odds };
  });
  return { lead: `${d.size} cards per pack`, lines };
}
/** The cards to show under a filter ('all' or a rarity; missing: unowned only), grouped by rarity, UR first. */
export function groups(cards, { rarity = 'all', missing = false } = {}) {
  return RARITIES.filter(r => rarity === 'all' || rarity === r)
    .map(r => ({ rarity: r, label: LABEL[r], total: cards.filter(c => c.rarity === r).length,
      cards: cards.filter(c => c.rarity === r && (!missing || !c.owned)) }))
    .filter(g => g.cards.length);
}
/** The pack id under a point of the pack window (game px), or null: its art's slot on this page. */
export const ART = { x: 299, y: [114, 348], pitch: 99, w: 80, h: 160 };
export function packAt(win, x, y) {
  const col = Math.floor((x - ART.x) / ART.pitch), row = ART.y.findIndex(t => y >= t && y < t + ART.h);
  if (col < 0 || col > 4 || x - ART.x - col * ART.pitch >= ART.w || row < 0) return null;
  return win.packs?.[(win.page || 0) * 10 + row * 5 + col] ?? null;
}

const ERRORS = {
  'unknown-pack': "This pack's contents aren't available.",
  'signed out': 'Your session has ended. Please sign in again.', 'not-in-game': 'Your session has ended. Please sign in again.',
  'no-character': 'Choose a character first.', 'free-mode': 'Pack contents are not available in free mode.',
  'server-restarting': 'The server is restarting. Please try again in a few seconds.',
  network: "Couldn't reach the server. Check your connection and try again.",
};
export const errorText = e => ERRORS[e] || 'Something went wrong. Please try again.';
/** GET the pack's contents (same origin, the session cookie): -> the normalized data; throws { error, message }. */
export async function fetchPack(id, f = globalThis.fetch) {
  let r, j = null;
  try { r = await f((globalThis.ENV?.YO2_DE_HTTP || '') + '/api/de/shop/pack?id=' + encodeURIComponent(id), { credentials: 'same-origin', cache: 'no-store' }); }
  catch { throw Object.assign(new Error('network'), { error: 'network', message: errorText('network') }); }
  try { j = await r.json(); } catch { /* a 503 is plain text */ }
  if (!r.ok || !j || j.error) {
    const e = j?.error || (r.status === 503 ? 'server-restarting' : r.status === 401 ? 'signed out' : 'error');
    throw Object.assign(new Error(e), { error: e, message: errorText(e) });
  }
  return normalize(j);
}

// ---------------------------------------------------------------- the sheet
function inject(doc) { injectShopSkin(doc); injectShopCss(doc); }
const KIND = { pack: 'Booster Pack', deck: 'Structure Deck' };
const VIEWS = { odds: 'Details', list: 'Card List', missing: 'Missing Cards', pulls: 'Your Pulls' };

/**
 * Open the sheet over the screen. host: the 1024 x 768 layer (the shop's root, or any layer: the sheet brings its own);
 * opts: { id (the pack param), data (shopPackView, normalized: no fetch), view ('odds' | 'list' | 'missing' | 'pulls'),
 * name (shown until the server names it), fetch (tests), onClose }. -> { close, el }
 */
export function openPackContents(host, { id, data = null, view = 'odds', name = '', fetch: f, onClose } = {}) {
  const doc = host.ownerDocument;
  inject(doc);
  const S = { data, error: null, rarity: 'all', missing: view === 'missing', pulls: view === 'pulls' };
  const back = doc.activeElement;
  const el = h('div', { class: 'sheet', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'pc-title', tabindex: '-1' });
  // outside the shop (the native pack window) the sheet brings its own .ns root
  const wrap = host.closest?.('.ns') ? null : h('div', { class: 'ns de-c pc', style: { background: 'none', height: '768px', zIndex: 100000 } });
  const dim = h('div', { class: 'dim' }), box = h('div', { class: 'box' });
  el.append(dim, box);
  let closed = false;
  const close = () => {
    if (closed) return;
    closed = true;
    removeEventListener('keydown', keys, true); removeEventListener('keyup', swallow, true);
    (wrap || el).remove();
    try { back?.focus?.({ preventScroll: true }); } catch {}
    onClose?.();
  };
  dim.addEventListener('pointerdown', e => { e.preventDefault(); close(); });
  // the game reads the keyboard too: every key stops here while the sheet is up (Esc closes it, Tab stays inside)
  const swallow = e => { e.stopPropagation(); };
  const keys = e => {
    e.stopPropagation();
    if (e.key === 'Escape') { e.preventDefault(); close(); return; }
    if (e.key === 'Tab') {
      const all = [...el.querySelectorAll('button:not(:disabled), .grid[tabindex]')];
      if (!all.length) return;
      const i = all.indexOf(doc.activeElement);
      if (e.shiftKey ? i <= 0 : i === all.length - 1 || i < 0) { e.preventDefault(); all[e.shiftKey ? all.length - 1 : 0].focus({ preventScroll: true }); }
    }
  };
  addEventListener('keydown', keys, true); addEventListener('keyup', swallow, true);

  const render = () => {
    const d = S.data, fallback = name || `Pack ${id}`, title = d ? d.title || d.name || fallback : fallback;
    const sub = d ? (d.kind === 'deck' ? `${title} · ${d.size} cards` : `${title} · ${d.cards.length} cards · ${d.size} a pack`)
      : S.error ? "Couldn't load the pack" : 'Loading the pack…';
    const keep = el.querySelector('.grid')?.scrollTop || 0, focused = doc.activeElement?.dataset?.k;
    box.replaceChildren(
      h('div', { class: 'sa-glass' }), h('div', { class: 'sa-band' }),
      h('div', { class: 'sa-title', style: at(14, 15, 290), 'aria-hidden': 'true' }, S.pulls ? 'Your Pulls' : d?.kind === 'deck' ? 'Deck Details' : 'Details'),
      h('div', { class: 'abs t w hd', style: at(320, 26, 400) }, h('span', { class: 'ell', id: 'pc-title', style: { display: 'block' } }, sub)),
      bt('nav', 48, { style: at(740, 9), 'aria-label': 'Close', title: 'Close (Esc)', data: { k: 'x' }, onclick: close }, h('span', {}, 'Close')),
      ...(S.error ? failure() : d ? body(d) : loading()));
    const g = el.querySelector('.grid');
    if (g) g.scrollTop = keep;
    if (focused) el.querySelector(`[data-k="${focused}"]`)?.focus({ preventScroll: true });
  };
  const loading = () => [h('div', { class: 'well', style: at(22, 82, 330, 576) }),
    h('div', { class: 'well grid', style: at(370, 132, 558, 526), role: 'status', 'aria-label': 'Loading the pack' },
      h('div', { class: 'in' }, Array.from({ length: 14 }, () => h('div', { class: 'skel', style: { width: '62px', height: '90px' } }))))];
  const failure = () => [h('div', { class: 'msg', style: at(0, 220, 944), role: 'alert' },
    h('div', { class: 't18' }, "Couldn't load this pack"),
    h('div', { class: 't sub wrap', style: { maxWidth: '480px' } }, S.error.message || errorText(S.error.error)),
    bt('secondary', 40, { class: 'rel', data: { k: 'retry' }, onclick: load }, h('span', {}, 'Try again')))];
  const left = d => {
    const out = [h('div', { class: 'well', style: at(22, 82, 330, 576) })];
    if (d.kind === 'deck') {
      out.push(h('div', { class: 'abs t18', style: at(36, 94) }, 'Structure Deck'),
        h('div', { class: 'abs t wrap', style: { ...at(36, 124, 304), lineHeight: '19px' } },
          `${d.size} cards, always the same. Buying it adds every card listed to your trunk.`),
        h('table', { class: 'odds', style: at(32, 184, 310) },
          h('tr', {}, h('th', {}, 'Rarity'), h('th', {}, 'Cards'), h('th', {}, 'Owned')),
          RARITIES.filter(r => d.cards.some(c => c.rarity === r)).map(r => {
            const of = d.cards.filter(c => c.rarity === r);
            return h('tr', {}, h('td', {}, h('span', { class: 'dia', data: { r } }), LABEL[r]), h('td', {}, String(of.reduce((n, c) => n + (c.copies || 1), 0))),
              h('td', {}, `${of.filter(c => c.owned).length} / ${of.length}`));
          })));
    } else {
      const sr = slotRows(d), cols = ['N', 'R', 'SR', 'UR'];
      out.push(h('div', { class: 'abs t18', role: 'heading', 'aria-level': '2', style: at(36, 94) }, 'Odds per card slot'),
        h('table', { class: 'odds', style: at(32, 124, 310) },
          h('tr', {}, h('th', {}, 'Slot'), cols.map(r => h('th', {}, r))),
          sr.map(s => h('tr', {}, h('td', {}, s.label), cols.map(r => h('td', {}, s.odds[r] ? pct(s.odds[r]) : '–'))))));
      const g = d.slots.find(s => s.guaranteed);
      if (g) out.push(h('div', { class: 'abs t12 sub', style: at(36, 124 + (sr.length + 1) * 29 + 8) }, `The ${ordinal(d.size)} card is always ${LABEL[g.guaranteed]} or better.`));
      const cr = chanceRows(d);
      out.push(h('div', { class: 'abs t18', role: 'heading', 'aria-level': '2', style: at(36, 248) }, 'Chance in one pack'),
        h('table', { class: 'odds', style: at(32, 278, 310), title: d.perCardMeaning || null },
          h('tr', {}, h('th', {}, 'At least one'), h('th', {}, '1 pack'), h('th', {}, '10 packs')),
          cr.map(r => h('tr', {}, h('td', {}, r.r ? h('span', { class: 'dia', data: { r: r.r } }) : null, r.label), h('td', {}, pct(r.one)), h('td', {}, pct(r.ten))))));
    }
    out.push(h('div', { class: 'abs t18', role: 'heading', 'aria-level': '2', style: at(36, 494) }, 'Duplicates'),
      h('div', { class: 'abs t wrap', style: { ...at(36, 522, 304), lineHeight: '19px' } },
        'Spare copies can be dismantled for ', h('span', { class: 'shard', 'aria-hidden': 'true' }), 'shards in the Deck Editor, and missing cards crafted there.'));
    return out;
  };
  const tile = (c, deck) => h('div', { class: 'gc', role: 'listitem', title: c.name },
    card(c, { rel: true, w: 62, own: c.owned ? c.owned : undefined, miss: !c.owned && !S.pulls,
      label: `${c.name}, ${LABEL[c.rarity]}, ${c.owned ? `owned ${c.owned}` : 'not owned'}${deck && c.copies ? `, ${c.copies} in the deck` : ''}` }),
    h('span', { class: 'nm ell' }, deck && c.copies > 1 ? `${c.copies}× ${c.name}` : c.name));
  const body = d => {
    const deck = d.kind === 'deck', out = left(d);
    if (S.pulls) {
      const list = d.pulls || [];
      const owned = new Map(d.cards.map(c => [c.passcode, c.owned]));
      out.push(h('div', { class: 'well grid scroll', style: at(370, 82, 558, 576), role: 'list', tabindex: '0', 'aria-label': 'Your pulls' },
        h('div', { class: 'in' }, list.length ? list.map(p => [
          h('div', { class: 'ghd t' }, `${p.count} ${deck ? (p.count === 1 ? 'deck' : 'decks') : p.count === 1 ? 'pack' : 'packs'}`, p.at ? h('span', { class: 't12' }, '· ' + ago(p.at)) : null),
          p.cards.map(c => tile({ ...c, rarity: rarityOf(c.rarity), owned: c.isNew ? 0 : owned.get(c.passcode) || 0, name: c.name }, false))])
          : h('div', { class: 'ghd t' }, deck ? "You haven't bought this deck here yet." : "You haven't opened this pack here yet."))));
      return out;
    }
    const count = r => d.cards.filter(c => r === 'all' || c.rarity === r).length;
    const missN = d.cards.filter(c => !c.owned).length;
    const tabs = ['all', ...RARITIES.filter(r => count(r))];
    const set = k => { S.rarity = k; render(); el.querySelector('.grid').scrollTop = 0; };
    out.push(h('div', { role: 'tablist', 'aria-label': 'Rarity' }, tabs.map((k, i) => bt('seg', 40, { role: 'tab', 'aria-selected': String(S.rarity === k),
      style: { ...at(370 + i * 84, 82, 80), padding: '0 8px', gap: '6px' }, data: { k: 'r-' + k }, onclick: () => set(k) },
    k === 'all' ? null : h('span', { class: 'dia', data: { r: k }, 'aria-hidden': 'true' }), h('span', {}, k === 'all' ? 'All' : k), h('span', { class: 'n' }, String(count(k)))))),
    bt('seg', 40, { 'aria-pressed': String(S.missing), style: { ...at(796, 82, 132), padding: '0 12px', gap: '8px' }, data: { k: 'miss' },
      onclick: () => { S.missing = !S.missing; render(); el.querySelector('.grid').scrollTop = 0; } },
    h('span', { class: 'ck', 'aria-hidden': 'true' }), h('span', {}, 'Missing'), h('span', { class: 'n' }, String(missN))));
    const shown = filterCards(d.cards, S);
    out.push(h('div', { class: 'well grid scroll', style: at(370, 132, 558, 526), role: 'list', tabindex: '0', 'aria-label': 'Cards' },
      h('div', { class: 'in' }, shown.length ? shown.map(c => tile(c, deck))
        : h('div', { class: 'ghd t empty-msg' }, S.missing && !missN ? 'You own every card in this pack.' : 'No cards to show.'))));
    return out;
  };
  async function load() {
    S.error = null; S.data = null; render();
    try { S.data = await fetchPack(id, f); } catch (e) { S.error = e; }
    if (!closed) { render(); if (S.error) el.querySelector('[data-k=retry]')?.focus({ preventScroll: true }); }
  }
  if (wrap) { wrap.append(el); host.append(wrap); } else host.append(el);
  render();
  el.querySelector('[data-k=x]').focus({ preventScroll: true });
  if (!S.data) load();
  return { el, close };
}

// ---------------------------------------------------------------- the shop's hook
// A transparent button over each pack's art (the engine's picture): a click opens the modal. They sit in a layer of
// their own over every window's root (the price plates' roots, above the pack window's, reach up over the art), in
// screen px. The pointer moving over them still reaches the game (its hover brackets follow it);
// while the confirm window is up a click goes to the game as well.
let open = null, hot = null;
const canvas = () => document.getElementById('canvas');
const toGame = (type, e) => canvas()?.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true,
  clientX: e.clientX, clientY: e.clientY, button: e.button, buttons: e.buttons }));
const confirmUp = () => [...document.querySelectorAll('#htmlui-host .win[aria-label=CShopConfirmWindow]')].some(w => w.style.visibility !== 'hidden');
export function packHotspots(root, win) {
  const host = root.closest('#htmlui-host');
  if (!host || !win.shown || !win.packs?.length) { dropPackHotspots(); return; }
  if (!hot || hot.parentNode !== host) {
    hot?.remove();
    inject(host.ownerDocument);
    // z 50: over the shop's roots (their z-index is their rank, 1..4, in the host's stacking context)
    hot = h('div', { class: 'pc-hot', style: { position: 'absolute', left: 0, top: 0, width: '0', height: '0', zIndex: 50 } });
    host.append(hot);
  }
  const key = `${win.page}:${win.packs.join()}`;
  if (hot.dataset.key === key) return;
  hot.dataset.key = key;
  hot.replaceChildren();
  for (let i = 0; i < 10; i++) {
    const id = win.packs[(win.page || 0) * 10 + i];
    if (id == null) continue;
    const x = ART.x + (i % 5) * ART.pitch, y = ART.y[Math.floor(i / 5)];
    const b = h('button', { type: 'button', class: 'pc-art', 'aria-label': `What's in pack ${id}`, tabindex: '-1',
      style: { position: 'absolute', left: x + 'px', top: y + 'px', width: ART.w + 'px', height: ART.h + 'px',
        margin: 0, padding: 0, border: 0, background: 'transparent', pointerEvents: 'auto', cursor: 'inherit' } });
    b.addEventListener('pointermove', e => toGame('mousemove', e));
    b.addEventListener('pointerdown', e => { if (confirmUp()) toGame('mousedown', e); });
    b.addEventListener('pointerup', e => { if (confirmUp()) toGame('mouseup', e); });
    b.addEventListener('click', () => {
      if (confirmUp()) return;
      open?.close();
      open = openPackContents(host, { id, onClose: () => { open = null; } });
    });
    hot.append(b);
  }
}
/** The pack window left: no hotspots, no modal. */
export function dropPackHotspots() { hot?.remove(); hot = null; open?.close(); }
