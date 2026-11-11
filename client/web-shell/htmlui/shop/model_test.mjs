// The card shop's data side (shop/model.js): the catalogue's sections and Recommended, the tags and countdowns (the
// secret pack keys' Unix seconds too), the odds tables, the pack page's lines, the reveal's summary, the requests.
// Synthetic data in the server's shapes (server/src/game/shop-api.ts shopView / shopPackView).
//   node client/web-shell/htmlui/shop/model_test.mjs
import assert from 'node:assert/strict';
import * as M from './model.js';

const NOW = Date.UTC(2026, 10, 5, 12);
const pack = (param, extra = {}) => ({ id: param, itemId: param, kind: 1, param, price: 200, group: 'booster', title: `T${param}`,
  displayName: `Pack ${param} · T${param}`, season: 4, size: 5, art: `p07-1-b${param}.png`, rotation: { group: 'always', endsAt: null },
  featured: [], collected: { owned: 0, total: 10 }, ...extra });
export const VIEW = {
  wallet: { total: 5000, bound: 1000, earned: 4000 }, nextRequestId: 'tok-1', update: null,
  collection: { copies: 40, cards: 37, byRarity: { UR: 1, SR: 2, R: 3, N: 31 } },
  items: [
    pack(37), pack(43), pack(45), pack(41),
    pack(1001, { group: 'beginner', price: 100, title: "Beginner's Pack 1", displayName: "Beginner's Pack 1", season: 0 }),
    pack(7001, { group: 'deck', price: 1000, title: 'E-Hero Evolution Deck', displayName: 'E-Hero Evolution Deck', season: 0, size: 45, purchased: false }),
    // a single card from an older server: single cards are retired (crafting), the shop ignores it
    { id: 60, kind: 0, param: 70095154, price: 100, name: 'Cyber Dragon', rarity: 'UR', internalId: 5 },
    { id: 90, kind: 2, param: 3, price: 300, name: '', owned: false },
  ],
  unlocked: {},
};

// ---- time: ISO dates, epoch ms, epoch seconds (the keys), numeric strings (a dataset); past and none
assert.equal(M.timeLeft(NOW + 41 * 86400e3 + 5, NOW), '41 days left');
assert.equal(M.timeLeft(new Date(NOW + 23.5 * 3600e3).toISOString(), NOW), '23h left');
assert.equal(M.timeLeft(NOW / 1000 + 23.5 * 3600, NOW), '23h left');
assert.equal(M.timeLeft(String(NOW / 1000 + 45 * 60), NOW), '45m left');
assert.equal(M.timeLeft(NOW - 1, NOW), null);
assert.equal(M.timeLeft(null, NOW), null);
assert.equal(M.shortDate('2026-12-17T00:00:00Z'), 'Dec 17');
assert.equal(M.ago(NOW - 12 * 60e3, NOW), '12 min ago');
assert.equal(M.ago(NOW / 1000 - 3 * 3600, NOW), '3h ago');

// ---- the tabs (no Single Cards: retired), the catalogue: packs by group, no singles even if one is sent; the sections
// in the sub-nav's order, empty ones out
assert.deepEqual(M.TABS.map(t => t.id), ['recommended', 'packs', 'decks', 'boxes']);
let c = M.catalogue(VIEW, NOW);
assert.deepEqual([c.boosters.length, c.beginner.length, c.decks.length, c.unlocked.length], [4, 1, 1, 0]);
assert.equal(c.singles, undefined);
assert.deepEqual(M.catalogue({ ...VIEW, items: VIEW.items.filter(i => i.kind !== 0) }, NOW).decks.length, 1);
// a structure deck sells once per character: the server's `purchased`
assert.equal(M.deckBought(c.decks[0]), false);
assert.equal(M.deckBought({ ...c.decks[0], purchased: true }), true);
assert.equal(M.deckBought({ ...VIEW.items[0], purchased: true }), false, 'only decks');
assert.equal(M.deckBought({ kind: 'deck', purchased: true }), true, 'a deck page (shopPackView)');
assert.deepEqual(M.packSections(VIEW, NOW).map(s => [s.id, s.packs.map(p => p.param)]), [['boosters', [45, 43, 41, 37]], ['beginner', [1001]]]);
// rotation: this update, leaving soon (soonest first), the other boosters; an "out" pack shows nowhere without a key
const rot = structuredClone(VIEW);
rot.items[0].rotation = { group: 'update', endsAt: '2026-12-17T00:00:00Z' };
rot.items[1].rotation = { group: 'leaving', endsAt: NOW + 3 * 86400e3 };
rot.items[2].rotation = { group: 'leaving', endsAt: NOW + 86400e3 };
rot.items[3].rotation = { group: 'out', endsAt: null };
assert.deepEqual(M.packSections(rot, NOW).map(s => [s.id, s.packs.map(p => p.param)]), [['update', [37]], ['leaving', [45, 43]], ['beginner', [1001]]]);
// keys: "Unlocked for You" first, soonest first, expired and unknown ones out, only boosters
const unl = { ...structuredClone(rot), unlocked: { 41: NOW / 1000 + 3600, 43: NOW / 1000 + 600, 1001: NOW / 1000 + 600, 99: NOW / 1000 + 600, 37: NOW / 1000 - 5 } };
assert.deepEqual(M.packSections(unl, NOW).map(s => [s.id, s.packs.map(p => p.param)]),
  [['unlocked', [43, 41]], ['update', [37]], ['leaving', [45, 43]], ['beginner', [1001]]]);
assert.deepEqual(M.GROUPS.map(g => g.label), ['Unlocked for You', 'This Update', 'Leaving Soon', 'Booster Packs', 'Beginner Picks']);
// "Leaving" only with a real end date ahead: one without (or past) is a plain booster, no countdown
const noEnd = structuredClone(VIEW);
noEnd.items[0].rotation = { group: 'leaving', endsAt: null };
noEnd.items[1].rotation = { group: 'leaving', endsAt: NOW - 1000 };
assert.deepEqual(M.packSections(noEnd, NOW).map(s => s.id), ['boosters', 'beginner']);
assert.equal(M.packTag(noEnd.items[0], noEnd, NOW), null);
assert.equal(M.packTag(noEnd.items[1], noEnd, NOW), null);
// Recommended contains only highlights and cycles its hero, including permanent Classics.
const featured = structuredClone(unl);
featured.items[0].rotation.highlighted = true;
featured.items[1].rotation.highlighted = true;
let r = M.recommended(featured, NOW);
assert.deepEqual([r.hero.param, r.halves.map(p => p.param)], [37, [43]]);
r = M.recommended(featured, NOW, 1);
assert.deepEqual([r.hero.param, r.halves.map(p => p.param)], [43, [37]]);
assert.equal(M.recommended(VIEW, NOW).hero, null);
assert.equal(M.packTag(featured.items[0], featured, NOW).text, 'Featured');

// ---- tags and lines
const by = (v, n) => v.items.find(i => i.param === n);
assert.deepEqual(M.packTag(by(unl, 43), unl, NOW), { kind: 'unlocked', text: 'Unlocked · 10m left', ends: NOW / 1000 + 600 });
assert.deepEqual(M.packTag(by(rot, 45), rot, NOW), { kind: 'leaving', text: 'Leaving in 24h', time: '24h left', ends: NOW + 86400e3 });
assert.equal(M.packTag(by(rot, 37), rot, NOW).text, 'New this update');
// nothing promises a pack stays: no tag on a plain booster or a beginner's pack
assert.equal(M.packTag(by(VIEW, 37), VIEW, NOW), null);
assert.equal(M.packTag(by(VIEW, 1001), VIEW, NOW), null);
assert.equal(M.packTag(by(VIEW, 7001), VIEW, NOW).kind, 'deck');
assert.deepEqual([37, 1001, 7001].map(n => M.packLine(by(VIEW, n))), ['Pack 37 · Season 4', 'Seasons 1–3', 'Structure Deck · 45 cards']);
assert.deepEqual([M.unitWord(by(VIEW, 37)), M.unitWord(by(VIEW, 37), 10), M.unitWord(by(VIEW, 7001))], ['Pack', 'Packs', 'Deck']);
assert.equal(M.canAfford(VIEW, 200, 10), true);
assert.equal(M.canAfford(VIEW, 200, 26), false);

// ---- the pack page: odds tables, chances, the carousel, the notes
export const PACK = M.normalize({
  packId: 37, itemId: 37, price: 200, kind: 'pack', size: 5, title: 'Cybernetic Revolution', group: 'booster',
  slots: [{ count: 4, guaranteed: null, odds: { N: 0.7, R: 0.25, SR: 0.04, UR: 0.01 } }, { count: 1, guaranteed: 'R', odds: { R: 0.75, SR: 0.2, UR: 0.05 } }],
  perCard: { N: 0.13, R: 0.057, SR: 0.051, UR: 0.0868 },
  cards: [
    { passcode: 1, internalId: 10, name: 'Cyber Dragon', rarity: 'UR', owned: 0 },
    { passcode: 2, internalId: 11, name: 'Cyber End Dragon', rarity: 'SR', owned: 1 },
    { passcode: 3, internalId: 12, name: 'Steamroid', rarity: 'SR', owned: 0 },
    { passcode: 4, internalId: 13, name: 'Drillroid', rarity: 'R', owned: 2 },
    { passcode: 5, internalId: null, name: 'Jetroid', rarity: 'C', owned: 0 },
  ],
  featured: [{ passcode: 1, internalId: 10, name: 'Cyber Dragon', rarity: 'UR', owned: 0 }],
  collected: { owned: 2, total: 5 }, collectedByRarity: { UR: { owned: 0, total: 1 }, SR: { owned: 1, total: 2 }, R: { owned: 1, total: 1 }, N: { owned: 0, total: 1 } },
  pulls: [],
});
assert.equal(PACK.cards[4].rarity, 'N');
assert.deepEqual(M.slotRows(PACK).map(s => s.label), ['Cards 1–4', 'Card 5']);
assert.equal(M.pct(M.chanceAny(PACK, ['UR'])), '8.7%');
assert.equal(M.pct(M.chanceAny(PACK, ['SR', 'UR'])), '39%');
assert.equal(M.pct(M.overPacks(M.chanceAny(PACK, ['UR']), 10)), '60%');
assert.deepEqual(M.chanceRows(PACK).map(r => [r.label, M.pct(r.one), M.pct(r.ten)]), [
  ['Ultra Rare', '8.7%', '60%'], ['Super Rare or better', '39%', '99%'], ['Each UR card', '8.7%', '60%'],
  ['Each SR card', '5.1%', '41%'], ['Each R card', '5.7%', '44%'], ['Each N card', '13%', '75%']]);
assert.deepEqual(M.filterCards(PACK.cards, { rarity: 'SR' }).map(x => x.name), ['Cyber End Dragon', 'Steamroid']);
assert.deepEqual(M.filterCards(PACK.cards, { missing: true }).map(x => x.name), ['Cyber Dragon', 'Steamroid', 'Jetroid']);
assert.deepEqual(M.carousel(PACK).map(x => x.name), ['Cyber Dragon', 'Cyber End Dragon', 'Steamroid']);
assert.equal(M.carouselNote(PACK), "Cyber Dragon is this pack's Ultra Rare: 8.7% a pack");
assert.equal(M.tenNote(PACK), '10 packs: a 60% chance of Cyber Dragon · 50 cards');
const noUr = { ...PACK, cards: PACK.cards.filter(x => x.rarity !== 'UR') };
assert.match(M.tenNote(noUr), /^10 packs: a \d+% chance of a Super Rare · 50 cards$/);
assert.equal(M.tenNote({ kind: 'deck', size: 45, cards: [] }), '45 cards, always the same');
assert.deepEqual([0.7, 0.087, 0.0025, 0.00001, 0, 0.995, 1].map(M.pct), ['70%', '8.7%', '0.25%', '<0.01%', '0%', '99%', '100%']);

// ---- the reveal's summary: the counts and the new cards
const s = M.revealSummary([{ passcode: 1, rarity: 'UR', isNew: true }, { passcode: 2, rarity: 'C', isNew: false }, { passcode: 3, rarity: 'SR' }],
  new Map([[1, 'Cyber Dragon']]));
assert.deepEqual([s.UR, s.SR, s.R, s.N, s.fresh, s.cards[0].name, s.cards[1].rarity, s.cards[2].isNew], [1, 1, 0, 1, 1, 'Cyber Dragon', 'N', false]);

// ---- the requests: GET the shop and a pack, POST a purchase with the view's request id; the failures' words
const calls = [];
const ok = body => async (u, o) => { calls.push([u, o]); return { ok: true, status: 200, json: async () => body }; };
await M.fetchShop(ok(VIEW));
await M.fetchPack(37, ok(PACK));
await M.buy(VIEW, 37, 10, ok({ ...VIEW, purchased: [] }));
assert.deepEqual(calls.map(([u]) => u), ['/api/de/shop', '/api/de/shop/pack?id=37', '/api/de/shop/buy']);
assert.deepEqual(calls[0][1], { credentials: 'same-origin', cache: 'no-store' });
assert.deepEqual([calls[2][1].method, JSON.parse(calls[2][1].body)], ['POST', { itemId: 37, count: 10, requestId: 'tok-1' }]);
const fails = async (f, error, re) => { await assert.rejects(M.fetchShop(f), e => e.error === error && re.test(e.message)); };
await fails(async () => ({ ok: false, status: 409, json: async () => ({ error: 'purchase-rejected' }) }), 'purchase-rejected', /enough MP/);
await fails(async () => ({ ok: false, status: 503, json: async () => { throw new SyntaxError(); } }), 'server-restarting', /restarting/);
await fails(async () => { throw new TypeError('offline'); }, 'network', /Couldn't reach/);
await fails(async () => ({ ok: false, status: 409, json: async () => ({ error: 'busy' }) }), 'busy', /duel or trade/);
await fails(async () => ({ ok: false, status: 409, json: async () => ({ error: 'already-owned-deck' }) }), 'already-owned-deck',
  /^This character already owns this deck\.$/);
// one MP number; its (i) says how much is starter MP (shop/mpinfo.js), from the wallet's bound (or total - earned)
{
  const { mpNote, starterMp } = await import('./mpinfo.js');
  assert.equal(mpNote({ total: 8400, bound: 5000, earned: 3400 }), '8,400 MP total · 5,000 MP is starter MP: it buys card packs but not cosmetic boxes.');
  assert.equal(mpNote({ total: 8400, earned: 3400 }), '8,400 MP total · 5,000 MP is starter MP: it buys card packs but not cosmetic boxes.');
  assert.equal(mpNote({ total: 1200, bound: 0, earned: 1200 }), '1,200 MP total · none of it is starter MP: it buys card packs and cosmetic boxes.');
  assert.equal(starterMp({ total: 100, bound: 5000 }), 100, 'never more than the total');
}
console.log('shop/model ok');
