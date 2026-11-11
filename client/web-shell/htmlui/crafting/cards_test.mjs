// node client/web-shell/htmlui/crafting/cards_test.mjs: crafting/cards.js: the card wire's table (YO2 id <-> passcode)
// parsed from a synthetic file, its load through a stubbed lazyfs, and the names map from a stubbed card DB.
import assert from 'node:assert/strict';
import { parseTable, loadTable, peekTable, cardNames, _setTable } from './cards.js';

// "YO2CARDS", count, 3 placeholders, then (passcode u32, internal u16) per YO2 id
const file = entries => {
  const b = new Uint8Array(24 + 6 * entries.length), dv = new DataView(b.buffer);
  b.set([...'YO2CARDS'].map(c => c.charCodeAt(0)));
  dv.setUint32(8, entries.length, true);
  entries.forEach(([pc, kid], i) => { dv.setUint32(24 + 6 * i, pc, true); dv.setUint16(28 + 6 * i, kid, true); });
  return b;
};
const bin = file([[0, 0], [89631139, 4007], [46986414, 4041], [82432018, 5108], [46986414, 4041]]);
const t = parseTable(bin);
assert.equal(t.size, 5);
assert.deepEqual([t.passcode(1), t.passcode(3), t.passcode(0), t.passcode(99)], [89631139, 82432018, 0, 0]);
assert.deepEqual([t.id(82432018), t.id('89631139'), t.id(46986414), t.id(1)], [3, 1, 2, 0], 'the first id with a passcode');
assert.equal(parseTable(new Uint8Array(30)), null, 'not the table');

// loaded through lazyfs's file list (its URL and version), once
let fetches = 0;
globalThis.fetch = async url => { fetches++; assert.equal(url, 'game/merge/data/card_passcode.bin?v=7'); return { ok: true, arrayBuffer: async () => bin.buffer }; };
const L = { files: new Map([['game/merge.dat', { ver: '' }], ['game/merge/data/card_passcode.bin', { ver: '?v=7' }]]) };
const [x, y] = await Promise.all([loadTable(L), loadTable(L)]);
assert.ok(x && x === y && peekTable() === x && fetches === 1);
assert.equal(x.passcode(2), 46986414);
_setTable(null);
assert.equal(await loadTable({ files: new Map() }), null, 'no table listed: null, asked again later');

// names: passcode -> the exe's name
const db = { cards: () => [{ id: 1, name: 'Blue-Eyes White Dragon' }, { id: 2, name: 'Dark Magician' }, { id: 3, name: 'Mask of Brutality' }] };
const names = cardNames(t, db);
assert.deepEqual([...names], [[89631139, 'Blue-Eyes White Dragon'], [46986414, 'Dark Magician'], [82432018, 'Mask of Brutality']]);
assert.equal(cardNames(null, db).size, 0);
console.log('crafting/cards_test: ok');
