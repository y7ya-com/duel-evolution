// The pack contents modal's data side (screens/pack-contents.js): rarity codes, percentages, the odds in plain English,
// the rarity groups and filters, the pack under a click, the fetch and its failures. Synthetic data only.
//   node client/web-shell/htmlui/screens/pack-contents_test.mjs
import assert from 'node:assert/strict';
import { rarityOf, normalize, pct, describeOdds, groups, packAt, fetchPack, LABEL, RARITIES } from './pack-contents.js';

// the server's shape (server/src/game/shop-api.ts shopPackView)
export const PACK = {
  packId: 4, name: '', kind: 'pack', size: 5,
  slots: [{ count: 4, guaranteed: null, odds: { N: 0.7, R: 0.25, SR: 0.04, UR: 0.01 } }, { count: 1, guaranteed: 'R', odds: { R: 0.75, SR: 0.2, UR: 0.05 } }],
  perCard: { N: 0.2, R: 0.11, SR: 0.0233, UR: 0.0242 }, perCardMeaning: 'Probability of at least one copy of one specific card of that rarity per pack.',
  cards: [
    { passcode: 1, internalId: 10, name: 'Test Dragon', rarity: 'UR', owned: 1 },
    { passcode: 2, internalId: 11, name: 'Test Knight', rarity: 'SR', owned: 0 },
    { passcode: 3, internalId: 12, name: 'Test Spell', rarity: 'R', owned: 2 },
    { passcode: 4, internalId: null, name: 'Test Trap', rarity: 'N', owned: 0 },
    { passcode: 5, internalId: 14, name: 'Test Imp', rarity: 'N', owned: 3 },
  ],
  collected: { owned: 3, total: 5 },
};

// rarity: N R SR UR as is, C an alias of N, anything else N; the words
assert.deepEqual(['N', 'R', 'SR', 'UR', 'C', 'X', undefined].map(rarityOf), ['N', 'R', 'SR', 'UR', 'N', 'N', 'N']);
assert.deepEqual(RARITIES, ['UR', 'SR', 'R', 'N']);
assert.deepEqual(LABEL, { UR: 'Ultra Rare', SR: 'Super Rare', R: 'Rare', N: 'Normal' });
const c = normalize({ ...PACK, slots: [{ count: 5, guaranteed: 'C', odds: { C: 0.9, UR: 0.1 } }], perCard: { C: 0.5 }, cards: [{ name: 'a', rarity: 'C', owned: '2' }] });
assert.deepEqual(c.slots[0], { count: 5, guaranteed: 'N', odds: { N: 0.9, UR: 0.1 } });
assert.deepEqual(c.perCard, { N: 0.5 });
assert.deepEqual(c.cards[0], { name: 'a', rarity: 'N', owned: 2 });

// percentages
assert.deepEqual([0.7, 0.25, 0.04, 0.01, 0.049, 0.0025, 0.00001, 0, 1, 0.1234].map(pct), ['70%', '25%', '4%', '1%', '4.9%', '0.25%', '<0.01%', '0%', '100%', '12%']);

// the odds strip
const d = normalize(PACK);
assert.deepEqual(describeOdds(d), { lead: '5 cards per pack', lines: [
  { label: '4 cards', note: '', odds: [['N', 'Normal', '70%'], ['R', 'Rare', '25%'], ['SR', 'Super Rare', '4%'], ['UR', 'Ultra Rare', '1%']] },
  { label: '5th card', note: 'Rare or better guaranteed', odds: [['R', 'Rare', '75%'], ['SR', 'Super Rare', '20%'], ['UR', 'Ultra Rare', '5%']] }] });
const three = describeOdds({ kind: 'pack', size: 5, slots: [{ count: 1, odds: { N: 1 } }, { count: 3, odds: { N: 1 } }, { count: 1, odds: { UR: 1 } }] });
assert.deepEqual(three.lines.map(l => l.label), ['1st card', 'Cards 2–4', '5th card']);
// a fixed deck: no odds
assert.deepEqual(describeOdds({ kind: 'deck', size: 40, slots: [], cards: [] }), { lead: '40 cards, always the same', lines: [] });

// groups: UR first, each with its total; filters by rarity and missing
assert.deepEqual(groups(d.cards).map(g => [g.rarity, g.label, g.total, g.cards.length]),
  [['UR', 'Ultra Rare', 1, 1], ['SR', 'Super Rare', 1, 1], ['R', 'Rare', 1, 1], ['N', 'Normal', 2, 2]]);
assert.deepEqual(groups(d.cards, { rarity: 'N' }).map(g => g.cards.map(x => x.name)), [['Test Trap', 'Test Imp']]);
assert.deepEqual(groups(d.cards, { missing: true }).map(g => [g.rarity, g.total, g.cards.map(x => x.name)]), [['SR', 1, ['Test Knight']], ['N', 2, ['Test Trap']]]);
assert.deepEqual(groups(d.cards, { rarity: 'R', missing: true }), []);

// the pack under a point: the art slots (five columns 99 apart from x 299, rows at 114 and 348, 80 x 160), page * 10
const win = { x: 264, y: 0, page: 1, packs: Array.from({ length: 23 }, (_, i) => 100 + i) };
assert.equal(packAt(win, 300, 120), 110);
assert.equal(packAt(win, 299 + 99 * 4 + 79, 114 + 159), 114);
assert.equal(packAt(win, 299 + 99 * 2 + 10, 350), 117);
assert.equal(packAt(win, 299 + 85, 120), null);   // the gap between two arts
assert.equal(packAt(win, 290, 120), null);
assert.equal(packAt(win, 300, 300), null);   // under the first row's art (its price tag)
assert.equal(packAt({ ...win, page: 2 }, 299 + 99 * 3, 350), null);   // past the list's end
assert.equal(packAt({ ...win, packs: undefined }, 300, 120), null);

// the fetch: the URL and credentials, the normalized answer, the failures' messages
const calls = [];
const ok = async (u, o) => { calls.push([u, o]); return { ok: true, status: 200, json: async () => ({ ...PACK, cards: [{ ...PACK.cards[3], rarity: 'C' }] }) }; };
const got = await fetchPack(4, ok);
assert.deepEqual(calls, [['/api/de/shop/pack?id=4', { credentials: 'same-origin', cache: 'no-store' }]]);
assert.equal(got.cards[0].rarity, 'N');
const fails = async (f, error, re) => { await assert.rejects(fetchPack(1, f), e => e.error === error && re.test(e.message)); };
await fails(async () => ({ ok: false, status: 400, json: async () => ({ error: 'unknown-pack' }) }), 'unknown-pack', /aren't available/);
await fails(async () => ({ ok: false, status: 503, json: async () => { throw new SyntaxError(); } }), 'server-restarting', /restarting/);
await fails(async () => ({ ok: false, status: 401, json: async () => ({ error: 'signed out' }) }), 'signed out', /sign in/);
await fails(async () => { throw new TypeError('offline'); }, 'network', /Couldn't reach/);
await fails(async () => ({ ok: false, status: 500, json: async () => null }), 'error', /went wrong/);
console.log('pack-contents ok');
