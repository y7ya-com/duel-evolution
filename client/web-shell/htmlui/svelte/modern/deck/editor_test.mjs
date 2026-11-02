// node client/web-shell/htmlui/svelte/modern/deck/editor_test.mjs: the modern deck editor's filters, search and rules
// (editor.js) on made-up cards (no card data in git)
import assert from 'node:assert/strict';
import { rank, norm, view, NO_FILTER, blocked, copies, home } from './editor.js';

const C = (id, name, o = {}) => ({ id, name, atk: 1000, def: 1000, kind: 1, attr: 2, level: 4, race: 1, limit: 3, ...o });
const cards = [C(1, 'Blue Flame Knight', { atk: 3000, level: 8, attr: 1 }), C(2, 'Flame Swordsman', { kind: 2, level: 5 }),
  C(3, 'Pot of Plenty', { kind: 13, attr: 8, level: 0, atk: 0, def: 0 }), C(4, 'Mirror Trap Wall', { kind: 14, attr: 9 }),
  C(5, 'Knight of Flames', { atk: -1 })];
const have = id => (id === 5 ? 0 : 2);
const ids = f => view(cards, { ...NO_FILTER, ...f }, have).map(c => c.id);

assert.equal(norm('Blue-Eyes  White!'), 'blue eyes white');
assert.ok(rank('Flame Swordsman', 'flame') < rank('Blue Flame Knight', 'flame'));   // prefix before word prefix
assert.ok(rank('Blue Flame Knight', 'bfk') > 0);                                     // letters in order
assert.equal(rank('Pot of Plenty', 'xyz'), -1);
assert.equal(rank('Pot of Plenty', 'draw two', () => 'Draw two cards.'), 9);        // the card text, last

assert.deepEqual(ids({}), [1, 2, 3, 4]);                    // owned only, monsters (level down) then spells, traps
assert.deepEqual(ids({ owned: false }).length, 5);
assert.deepEqual(ids({ q: 'flame' }), [2, 1]);              // by rank while searching
assert.deepEqual(ids({ type: 'fusion' }), [2]);
assert.deepEqual(ids({ type: 'spell' }), [3]);
assert.deepEqual(ids({ attr: [1] }), [1]);
assert.deepEqual(ids({ atk: ['2000', ''] }), [1]);          // ranges keep monsters only
assert.deepEqual(ids({ level: [5, 12], sort: 'name' }), [1, 2]);

assert.equal(home(cards[1]), 'extra');
const grids = { main: [1, 1, 3], side: [1], extra: [2] };
assert.equal(copies(grids).get(1), 3);
assert.equal(blocked(cards[0], 'main', { inDeck: 3, left: 2 }), 'Already 3 copies');
assert.equal(blocked(C(9, 'X', { limit: 1 }), 'main', { inDeck: 1, left: 1 }), 'Limited to 1');
assert.equal(blocked(cards[1], 'main', { left: 1 }), 'Fusion monsters go to the Fusion Deck');
assert.equal(blocked(cards[1], 'side', { left: 1 }), 'Fusion monsters go to the Fusion Deck');
assert.equal(blocked(cards[0], 'side', { left: 1, counts: { side: 15 } }), 'Section is full');
assert.equal(blocked(cards[0], 'main', { left: 1, counts: { main: 40 } }), '');
console.log('modern deck editor: ok');
