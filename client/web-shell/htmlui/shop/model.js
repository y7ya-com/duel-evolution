// The card shop's data side (shop/*.js draws it): GET /api/de/shop's view (server/src/game/shop-api.ts shopView, its
// packs with their names, art, rotation, featured cards and collection) sorted into the tabs, the left sub-nav's groups
// and the banners; the odds tables and the pack page's numbers from GET /api/de/shop/pack (shopPackView); countdowns.
// Pure: no DOM, node-testable (shop/model_test.mjs).

export const RARITIES = ['UR', 'SR', 'R', 'N'];
export const LABEL = { UR: 'Ultra Rare', SR: 'Super Rare', R: 'Rare', N: 'Normal' };
/** The server's rarity code as shown (C, an alias of N, and anything unknown are N). */
export const rarityOf = r => (LABEL[r] ? r : 'N');

export const TABS = [
  { id: 'recommended', label: 'Recommended' }, { id: 'packs', label: 'Card Packs' }, { id: 'decks', label: 'Structure Decks' },
  { id: 'boxes', label: 'Cosmetic Boxes' },
];
// the left sub-nav: the Card Packs feed's sections (a group with no pack is left out). Nothing promises a pack stays
// on sale (the owner takes products down at will): the rest of the boosters are just Booster Packs, and Leaving Soon
// holds only packs with a real end date ahead
export const GROUPS = [
  { id: 'unlocked', label: 'Unlocked for You' }, { id: 'update', label: 'This Update' }, { id: 'leaving', label: 'Leaving Soon' },
  { id: 'boosters', label: 'Booster Packs' }, { id: 'beginner', label: 'Beginner Picks' },
];

// ---------------------------------------------------------------- time
const HOUR = 3600e3, DAY = 24 * HOUR;
// a time as epoch ms: epoch seconds (the secret pack keys) or ms, as numbers or numeric strings, or an ISO date
const ms = t => { if (t == null || t === '') return NaN; const n = typeof t === 'number' ? t : /^\d+(\.\d+)?$/.test(t) ? +t : NaN; return isNaN(n) ? Date.parse(t) : n < 1e12 ? n * 1000 : n; };
/** Time left until `ends` (ISO, epoch s or ms) as the shop says it: "41 days left", "23h left", "45m left", null if past or none. */
export function timeLeft(ends, now = Date.now()) {
  const d = ms(ends) - now;
  if (!(d > 0)) return null;
  if (d >= 2 * DAY) return `${Math.floor(d / DAY)} days left`;
  if (d >= HOUR) return `${Math.floor(d / HOUR)}h left`;
  return `${Math.max(1, Math.floor(d / 60e3))}m left`;
}
/** "Dec 17" */
export const shortDate = t => { const d = new Date(ms(t)); return isNaN(d) ? '' : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' }); };
/** "12 min ago", "3h ago", "2 days ago", "just now" */
export function ago(t, now = Date.now()) {
  const d = now - ms(t);
  if (!(d >= 0)) return '';
  if (d < 60e3) return 'just now';
  if (d < HOUR) return `${Math.floor(d / 60e3)} min ago`;
  if (d < DAY) return `${Math.floor(d / HOUR)}h ago`;
  return `${Math.floor(d / DAY)} days ago`;
}

// ---------------------------------------------------------------- the catalogue
/** The view's packs and decks (kind 1 items with display data) and the unlocked packs still running. Single cards are
 *  retired (crafting replaces them): any other kind of item is ignored. */
export function catalogue(view, now = Date.now()) {
  const items = view?.items || [];
  const packs = items.filter(i => i.kind === 1 && i.group);
  const unlocked = Object.entries(view?.unlocked || {})
    .map(([id, ends]) => ({ pack: packs.find(p => p.param === +id), ends }))
    .filter(u => u.pack && u.pack.group === 'booster' && ms(u.ends) > now)
    .sort((a, b) => ms(a.ends) - ms(b.ends));
  return {
    boosters: packs.filter(p => p.group === 'booster'), beginner: packs.filter(p => p.group === 'beginner'),
    decks: packs.filter(p => p.group === 'deck'),
    unlocked, unlockedEnds: new Map(unlocked.map(u => [u.pack.param, u.ends])),
  };
}
const newest = (a, b) => b.param - a.param;
/** The Card Packs feed's sections, in the sub-nav's order, empty ones left out: [{ id, label, packs }]. */
export function packSections(view, now = Date.now()) {
  const c = catalogue(view, now), leaving = p => p.rotation?.group === 'leaving' && !!timeLeft(p.rotation.endsAt, now);
  const by = {
    unlocked: c.unlocked.map(u => u.pack),
    update: c.boosters.filter(p => p.rotation?.highlighted || p.rotation?.group === 'update').sort(newest),
    leaving: c.boosters.filter(leaving).sort((a, b) => ms(a.rotation.endsAt) - ms(b.rotation.endsAt)),
    boosters: c.boosters.filter(p => !p.rotation?.highlighted && ((p.rotation?.group || 'always') === 'always' || (p.rotation.group === 'leaving' && !leaving(p)))).sort(newest),
    beginner: c.beginner,
  };
  return GROUPS.map(g => ({ ...g, packs: by[g.id] })).filter(s => s.packs.length);
}
/** Current meta highlights cycle through the hero; the other highlights remain visible below. */
export function recommended(view, now = Date.now(), heroIndex = 0) {
  const packs = catalogue(view, now).boosters.filter(p => p.rotation?.highlighted);
  const hero = packs.length ? packs[((heroIndex % packs.length) + packs.length) % packs.length] : null;
  return { hero, halves: packs.filter(p => p !== hero) };
}
/** The tag a pack's banner and page wear: { kind: 'unlocked' | 'leaving' | 'update' | 'deck', text, time }, or null: no
 *  tag ever promises a pack stays on sale, and "Leaving" shows only with a real end date ahead. */
export function packTag(pack, view, now = Date.now()) {
  const r = pack.rotation || {}, left = timeLeft(r.endsAt, now);
  if (r.highlighted) return { kind: 'update', text: 'Featured', time: left, ends: left ? r.endsAt : null };
  const ends = catalogue(view, now).unlockedEnds.get(pack.param);
  if (ends) return { kind: 'unlocked', text: `Unlocked · ${timeLeft(ends, now)}`, ends };
  if (pack.group === 'deck') return { kind: 'deck', text: 'Structure Deck' };
  if (pack.group === 'beginner') return null;
  if (r.group === 'leaving' && left) return { kind: 'leaving', text: `Leaving in ${left.replace(' left', '')}`, time: left, ends: r.endsAt };
  if (r.group === 'update') return { kind: 'update', text: 'New this update', time: left, ends: left ? r.endsAt : null };
  return null;
}
/** The banner's and page's small line: "Pack 37 · Season 4", "Seasons 1–3", "Structure Deck · 45 cards". */
export function packLine(p) {
  if (p.group === 'deck') return `Structure Deck · ${p.size} cards`;
  if (p.group === 'beginner') return 'Seasons 1–3';
  return `Pack ${p.param} · Season ${p.season}`;
}
/** A structure deck this character has bought (the server's `purchased`): each deck sells once per character. */
export const deckBought = p => !!p && (p.group === 'deck' || p.kind === 'deck') && p.purchased === true;
export const unitWord = (p, n = 1) => (p.group === 'deck' ? (n === 1 ? 'Deck' : 'Decks') : n === 1 ? 'Pack' : 'Packs');
export const canAfford = (view, price, n = 1) => (view?.wallet?.total ?? 0) >= price * n;

// ---------------------------------------------------------------- the pack page and its sheet
/** The response with every rarity key and value in N / R / SR / UR. */
export function normalize(d) {
  const tierMap = o => { const out = {}; for (const [k, v] of Object.entries(o || {})) out[rarityOf(k)] = (out[rarityOf(k)] || 0) + (+v || 0); return out; };
  return { ...d, slots: (d.slots || []).map(s => ({ ...s, guaranteed: s.guaranteed ? rarityOf(s.guaranteed) : null, odds: tierMap(s.odds) })),
    perCard: tierMap(d.perCard), cards: (d.cards || []).map(c => ({ ...c, rarity: rarityOf(c.rarity), owned: +c.owned || 0 })),
    featured: (d.featured || []).map(c => ({ ...c, rarity: rarityOf(c.rarity) })) };
}
/** A chance (0..1) as a short percentage: "70%", "8.7%", "0.25%", "<0.01%". */
export function pct(v) {
  const p = (+v || 0) * 100;
  if (p <= 0) return '0%';
  if (p < 0.01) return '<0.01%';
  if (p > 99 && p < 100) return '99%';
  const s = p >= 10 ? p.toFixed(0) : p >= 1 ? p.toFixed(1) : p.toFixed(2);
  return s.replace(/\.0+$|(\.\d*?)0+$/, '$1') + '%';
}
const ordinal = n => n + (n % 100 >= 11 && n % 100 <= 13 ? 'th' : ['th', 'st', 'nd', 'rd'][n % 10] || 'th');
/** The odds per slot as table rows: [{ label: 'Cards 1–4', odds: { N, R, SR, UR } }]. */
export function slotRows(d) {
  let at = 1;
  return (d.slots || []).map(s => {
    const first = at; at += s.count;
    const label = s.count === 1 ? `Card ${first}` : `Cards ${first}–${first + s.count - 1}`;
    return { label, odds: s.odds, guaranteed: s.guaranteed };
  });
}
/** The chance of at least one card of `tiers` in one pack (independent slots). */
export function chanceAny(d, tiers) {
  let miss = 1;
  for (const s of d.slots || []) miss *= (1 - tiers.reduce((a, r) => a + (s.odds[r] || 0), 0)) ** s.count;
  return 1 - miss;
}
/** Over n packs: 1 - (1 - p)^n */
export const overPacks = (p, n) => 1 - (1 - p) ** n;
/** "Chance in one pack" rows: [{ label, r?, one, ten }] (rarities the pack has). */
export function chanceRows(d) {
  const has = r => d.cards.some(c => c.rarity === r), rows = [];
  if (has('UR')) { const p = chanceAny(d, ['UR']); rows.push({ label: 'Ultra Rare', r: 'UR', one: p, ten: overPacks(p, 10) }); }
  if (has('SR')) { const p = chanceAny(d, ['SR', 'UR']); rows.push({ label: 'Super Rare or better', r: 'SR', one: p, ten: overPacks(p, 10) }); }
  for (const r of RARITIES) if (has(r) && d.perCard[r] > 0) rows.push({ label: `Each ${r} card`, one: d.perCard[r], ten: overPacks(d.perCard[r], 10) });
  return rows;
}
/** The cards under a filter (rarity 'all' or a code; missing: unowned only). */
export const filterCards = (cards, { rarity = 'all', missing = false } = {}) =>
  cards.filter(c => (rarity === 'all' || c.rarity === rarity) && (!missing || !c.owned));
/** The featured carousel's cards: every UR and SR (at least the server's featured), rarest first. */
export function carousel(d) {
  const top = d.cards.filter(c => c.rarity === 'UR' || c.rarity === 'SR');
  return top.length >= (d.featured?.length || 0) ? top : d.featured || [];
}
/** The line under the carousel: "Cyber Dragon is this pack's Ultra Rare: 8.7% a pack" (or each UR's chance). */
export function carouselNote(d) {
  if (d.kind === 'deck') return 'Every card listed comes in the deck.';
  const urs = d.cards.filter(c => c.rarity === 'UR');
  if (urs.length === 1) return `${urs[0].name} is this pack's Ultra Rare: ${pct(d.perCard.UR)} a pack`;
  if (urs.length > 1) return `Each of its ${urs.length} Ultra Rares: ${pct(d.perCard.UR)} a pack`;
  return d.perCard.SR ? `Each Super Rare: ${pct(d.perCard.SR)} a pack` : '';
}
/** The line under Buy ×10: "10 packs: a 60% chance of Cyber Dragon · 50 cards". */
export function tenNote(d) {
  if (d.kind === 'deck') return `${d.size} cards, always the same`;
  const urs = d.cards.filter(c => c.rarity === 'UR');
  const n = d.size * 10;
  if (urs.length === 1) return `10 packs: a ${pct(overPacks(d.perCard.UR, 10))} chance of ${urs[0].name} · ${n} cards`;
  if (urs.length) return `10 packs: a ${pct(overPacks(chanceAny(d, ['UR']), 10))} chance of an Ultra Rare · ${n} cards`;
  if (d.cards.some(c => c.rarity === 'SR')) return `10 packs: a ${pct(overPacks(chanceAny(d, ['SR']), 10))} chance of a Super Rare · ${n} cards`;
  return `10 packs · ${n} cards`;
}
/** A purchase's cards in the reveal's terms: [{ passcode, internalId, name, rarity, isNew }], and the counts. */
export function revealSummary(purchased, names = new Map()) {
  const cards = (purchased || []).map(c => ({ ...c, rarity: rarityOf(c.rarity), name: c.name || names.get(c.passcode) || '', isNew: !!c.isNew }));
  const count = r => cards.filter(c => c.rarity === r).length;
  return { cards, UR: count('UR'), SR: count('SR'), R: count('R'), N: count('N'), fresh: cards.filter(c => c.isNew).length };
}

// ---------------------------------------------------------------- talking to the server
const ERRORS = {
  'unknown-pack': "This pack isn't on sale.", 'signed out': 'Your session has ended. Please sign in again.',
  'not-in-game': 'Your session has ended. Please sign in again.', 'no-character': 'Choose a character first.',
  'free-mode': 'The shop is not available in free mode.', 'server-restarting': 'The server is restarting. Please try again in a few seconds.',
  network: "Couldn't reach the server. Check your connection and try again.", busy: 'Finish your duel or trade first.',
  'purchase-rejected': "You don't have enough MP for that.", 'stale-request': 'The shop was out of date. It has been refreshed: please try again.',
  'unavailable-item': "That item isn't on sale any more.", 'invalid-purchase': "That purchase isn't possible.",
  'already-owned-deck': 'This character already owns this deck.',
};
export const errorText = e => ERRORS[e] || 'Something went wrong. Please try again.';
const BASE = () => (globalThis.ENV?.YO2_DE_HTTP || '') + '/api/de/shop';
async function call(path, f = globalThis.fetch, body) {
  let r, j = null;
  try {
    r = await f(BASE() + path, body === undefined ? { credentials: 'same-origin', cache: 'no-store' }
      : { method: 'POST', credentials: 'same-origin', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  } catch { throw Object.assign(new Error('network'), { error: 'network', message: errorText('network') }); }
  try { j = await r.json(); } catch { /* a 503 is plain text */ }
  if (!r.ok || !j || j.error) {
    const e = j?.error || (r.status === 503 ? 'server-restarting' : r.status === 401 ? 'signed out' : 'error');
    throw Object.assign(new Error(e), { error: e, message: errorText(e) });
  }
  return j;
}
export const fetchShop = f => call('', f);
export const fetchPack = (id, f) => call('/pack?id=' + encodeURIComponent(id), f).then(normalize);
/** Buy count of itemId with the view's request id: -> the new view with `purchased`. */
export const buy = (view, itemId, count, f) => call('/buy', f, { itemId, count, requestId: String(view.nextRequestId) });
