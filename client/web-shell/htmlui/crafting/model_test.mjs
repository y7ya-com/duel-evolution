// node client/web-shell/htmlui/crafting/model_test.mjs: crafting/model.js's rules over synthetic views: the buttons'
// states and reasons (cost, copy cap, shards short, locks by kind), the list filters, the result and Secret Pack lines,
// the dismantle-extras preview. Prices come from the view only. Exit 1 on the first failure.
import assert from 'node:assert/strict';
import * as M from './model.js';

const values = { craft: { N: 20, R: 50, SR: 150, UR: 450 }, dismantle: { N: 1, R: 2, SR: 15, UR: 150 } };
const card = (rarity, owned = 0, extra = {}) => ({ owned, bound: 0, crafted: 0, craftable: true, dismantlable: owned, rarity, inDecks: 0, ...extra });
const view = (shards, cards) => ({ shards, values, cards, nextRequestId: '1' });

// ---- craft: cost from the view, the 3-copy cap, the shards short, an uncraftable card
let v = view(500, { 1: card('UR'), 2: card('UR', 3), 3: card('SR', 1), 4: card('N', 0, { craftable: false }), 5: card('R', 2) });
let s = M.cardState(v, 1);
assert.deepEqual([s.rarity, s.craft.cost, s.craft.ok, s.dismantle.gain, s.dismantle.ok, s.dismantle.why], ['UR', 450, true, 150, false, 'None owned']);
assert.ok(s.confirm, 'UR asks first');
assert.equal(M.cardState(v, 2).craft.why, '3 owned');
assert.equal(M.cardState(view(100, v.cards), 1).craft.why, 'Need 350 more');
assert.equal(M.cardState(v, 4).craft.why, "Can't be crafted");
assert.equal(M.cardState(v, 4).dismantle.why, "Can't be dismantled");
assert.ok(!M.cardState(v, 5).confirm && M.cardState(v, 3).confirm, 'only SR / UR confirm');
assert.equal(M.cardState(v, 999), null, 'not listed (a token): null');
// prices are the server's: another table, other numbers
const v2 = { ...v, values: { craft: { N: 7, R: 8, SR: 9, UR: 1000 }, dismantle: { N: 1, R: 1, SR: 2, UR: 3 } } };
assert.equal(M.cardState(v2, 1).craft.cost, 1000);
assert.equal(M.cardState(v2, 1).craft.why, 'Need 500 more');

// ---- locks: bound, then saved-deck copies; their reasons. Crafted copies dismantle (the server counts them in
// dismantlable): never a lock
v = view(0, {
  10: card('SR', 3, { bound: 1, crafted: 1, dismantlable: 2 }),
  11: card('R', 2, { crafted: 2, dismantlable: 2 }),
  12: card('N', 3, { inDecks: 2, dismantlable: 1 }),
  13: card('UR', 2, { bound: 1, crafted: 0, inDecks: 2, dismantlable: 0 }),
});
s = M.cardState(v, 10);
assert.equal(s.locked, 1);
assert.deepEqual(s.locks.map(l => [l.key, l.n]), [['bound', 1]]);
assert.ok(s.dismantle.ok && s.dismantle.max === 2, 'the crafted copy can be dismantled');
assert.equal(M.lockLine(s), 'Locked: 1 bound');
assert.equal(M.ownedLine(s), 'Owned 3/3 · 1 locked');
assert.match(M.lockReasons(s)[0], /Structure Deck, Beginner's Pack and soulbound/);
s = M.cardState(v, 11);
assert.deepEqual([s.dismantle.ok, s.dismantle.max, s.locked, s.locks], [true, 2, 0, []], 'all crafted: all dismantlable');
assert.ok(!Object.values(M.LOCKS).some(l => /crafted/i.test(l.long + l.short)), 'no crafted lock left');
s = M.cardState(v, 12);
assert.deepEqual(s.locks.map(l => [l.key, l.n]), [['deck', 2]]);
assert.equal(M.lockLine(s), 'Locked: 2 in a saved deck');
s = M.cardState(v, 13);
assert.deepEqual([s.dismantle.why, s.locks.map(l => l.key).join()], ['All locked', 'bound,deck']);
assert.equal(M.ownedLine(M.cardState(v, 12)), 'Owned 3/3 · 2 locked');
assert.equal(M.lockLine(M.cardState(view(0, { 1: card('N', 1) }), 1)), '');
assert.equal(M.ownedLine(M.cardState(view(0, { 1: card('N', 18, { dismantlable: 15 }) }), 1)), 'Owned 18 · 3 locked');

// ---- the trunk's pool: All (every collectible card), Missing (none owned), Craftable (now); by category
v = view(160, { 1: card('UR'), 2: card('SR'), 3: card('R', 3), 4: card('N', 1), 5: card('SR', 0, { craftable: false }), 6: card('N') });
const table = { id: pc => ({ 1: 11, 2: 12, 3: 13, 4: 14, 5: 15, 6: 16 })[pc] || 0 };
const kind = { 11: 0, 12: 1, 13: 13, 14: 14, 15: 2, 16: 0 };   // normal, effect, spell, trap, fusion, normal
const pool = o => M.poolOf(v, table, id => kind[id], o);
assert.deepEqual(pool({ pool: 'owned' }), { mode: 0, ids: [] }, 'owned: the engine own list');
assert.deepEqual(pool({ pool: 'all' }), { mode: 1, ids: [11, 12, 13, 14, 15, 16] });
assert.deepEqual(pool({ pool: 'all', cat: 0 }), { mode: 1, ids: [11, 16] }, 'the Normal chip');
assert.deepEqual(pool({ pool: 'all', cat: 5 }), { mode: 1, ids: [15] }, 'the Fusion chip');
assert.deepEqual(pool({ pool: 'all', show: 'missing' }), { mode: 2, ids: [11, 12, 15, 16] });
assert.deepEqual(pool({ pool: 'all', show: 'craftable' }), { mode: 2, ids: [12, 14, 16] }, 'under 3 and affordable (UR 450 > 160)');
assert.deepEqual(pool({ pool: 'owned', show: 'craftable' }), { mode: 2, ids: [14] }, 'owned + craftable: the owned ones');
assert.deepEqual(M.poolOf(null, table, () => 0, { pool: 'all' }), { mode: 0, ids: [] }, 'no view yet: as owned');
assert.deepEqual(pool({ pool: 'all', rarity: 'SR' }), { mode: 2, ids: [12, 15] }, 'a rarity chip');
assert.deepEqual(pool({ pool: 'owned', rarity: 'R' }), { mode: 2, ids: [13] }, 'owned + R');
assert.deepEqual(pool({ pool: 'owned', rarity: 'SR' }), { mode: 2, ids: [] }, 'owned + SR: none owned');
assert.deepEqual(pool({ pool: 'all', rarity: 'N', show: 'craftable' }), { mode: 2, ids: [14, 16] }, 'N and craftable');
assert.deepEqual(pool({ pool: 'all', rarity: 'N', cat: 0 }), { mode: 2, ids: [16] }, 'N and the Normal chip');
assert.deepEqual(pool({ pool: 'all', rarity: ['SR', 'UR'] }), { mode: 2, ids: [11, 12, 15] }, 'several rarities: any of them');
assert.deepEqual(pool({ pool: 'all', rarity: [] }), { mode: 1, ids: [11, 12, 13, 14, 15, 16] }, 'no rarity: all');
assert.ok(M.categoryHas(1, 9) && M.categoryHas(4, 5) && !M.categoryHas(2, 14) && M.categoryHas(6, 99));

// ---- the card modal's stepper: dismantle up to the unlocked copies, craft up to the cap and the balance
v = view(1000, { 1: card('SR', 3, { bound: 1, dismantlable: 2 }), 2: card('N', 1), 3: card('UR', 0), 4: card('R', 2) });
v.values = { craft: { N: 5, R: 20, SR: 450, UR: 1500 }, dismantle: { N: 1, R: 2, SR: 150, UR: 500 } };
assert.deepEqual(M.stepRange('dismantle', M.cardState(v, 1), 1000), { max: 2, limit: 'locked' });
assert.deepEqual(M.stepRange('dismantle', M.cardState(v, 2), 1000), { max: 1, limit: 'owned' });
assert.deepEqual(M.stepRange('make', M.cardState(v, 2), 1000), { max: 2, limit: 'cap' });
assert.equal(M.stepRange('make', M.cardState(v, 3), 1000).max, 0, 'a UR at 1,500 with 1,000');
assert.deepEqual(M.stepRange('make', M.cardState({ ...v, shards: 40 }, 4), 40), { max: 1, limit: 'cap' });
assert.deepEqual(M.stepRange('make', M.cardState({ ...v, shards: 1000 }, 1), 1000), { max: 0, limit: '3 owned' });
const nv = { ...v, shards: 45, cards: { 7: card('R', 0) } };
assert.deepEqual(M.stepRange('make', M.cardState(nv, 7), 45), { max: 2, limit: 'shards' });
assert.equal(M.limitNote('make', 'shards', 2), 'You have Shards for 2.');
assert.equal(M.limitNote('make', 'cap', 3), 'You can own up to 3.');
assert.equal(M.limitNote('dismantle', 'locked', 2), '2 can be dismantled.');
assert.deepEqual(M.preview('dismantle', M.cardState(v, 2), 1000, 1), { owned: [1, 0], shards: [1000, 1001], delta: 1 }, 'the last copy: 0 left');
assert.deepEqual(M.preview('make', M.cardState(v, 4), 1000, 1), { owned: [2, 3], shards: [1000, 980], delta: -20 });
assert.deepEqual(M.preview('dismantle', M.cardState(v, 1), 1000, 2), { owned: [3, 1], shards: [1000, 1300], delta: 300 });

// ---- results
assert.equal(M.secretLine({ unlocked: [37, 41], freePacks: [{ packId: 37, cards: [1, 2, 3, 4, 5] }] }), 'Unlocked 2 packs for 24h · 1 free pack added');
assert.equal(M.secretLine({ unlocked: [37], freePacks: [] }), 'Unlocked 1 pack for 24h');
assert.equal(M.secretLine({ unlocked: [], freePacks: [] }), '');
let t = M.resultToast({ operation: 'make', changes: { 1: 1 }, shardDelta: -450, secret: { unlocked: [37, 41], freePacks: [{ packId: 37 }] } }, 'Blue-Eyes White Dragon');
assert.deepEqual(t, { title: 'Crafted Blue-Eyes White Dragon', detail: '−450 Shards', secret: 'Unlocked 2 packs for 24h · 1 free pack added' });
t = M.resultToast({ operation: 'dismantle', changes: { 4: 1 }, shardDelta: 1, secret: { unlocked: [], freePacks: [] } }, 'Kuriboh');
assert.deepEqual(t, { title: 'Dismantled Kuriboh', detail: '+1 Shards' });
t = M.resultToast({ operation: 'dismantle-extras', changes: { 1: 2, 4: 3 }, shardDelta: 1300 });
assert.deepEqual(t, { title: 'Dismantled 5 extra copies', detail: '+1,300 Shards' });
assert.equal(M.resultToast({ operation: 'dismantle-extras', changes: {}, shardDelta: 0 }).title, 'Nothing to dismantle');

const names = new Map([[1, 'Blue-Eyes White Dragon'], [2, 'Dark Magician'], [4, 'Kuriboh']]);
// ---- the extras preview: rows by shards gained, the totals, SR / UR counted
const p = M.extrasPreview({ operation: 'dismantle-extras', preview: true, changes: { 1: 2, 4: 3, 2: 1 }, shardDelta: 318, values,
  cards: { 1: card('UR', 5), 4: card('N', 6), 2: card('SR', 4) } }, names);
assert.deepEqual(p.rows.map(r => [r.name, r.n, r.gain]), [['Blue-Eyes White Dragon', 2, 300], ['Dark Magician', 1, 15], ['Kuriboh', 3, 3]]);
assert.deepEqual([p.copies, p.shards, p.rare], [6, 318, 2]);
assert.equal(M.extrasPreview({ changes: {}, shardDelta: 0 }, names).rows.length, 0);
assert.equal(M.fmt(1234567), '1,234,567');
console.log('crafting/model_test: ok');
