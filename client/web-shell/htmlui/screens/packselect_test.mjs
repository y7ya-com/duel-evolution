// screens/packselect.js's pure parts (node screens/packselect_test.mjs): the list line's columns, which backdrop piece a
// cardget_bg sprite is and how far it is from its place in the loop, the pack art's file; the module's hide list
import assert from 'node:assert/strict';
import mod, { columns, piece, stripHome, offset, packFile } from './packselect.js';

assert.deepEqual(columns('@>64/Pack 10@>600/@20.0 %@0'), [{ x: 64, s: 'Pack 10', blue: false }, { x: 600, s: '0.0 %', blue: true }],
  'the name at 64, the completion at 600 in @2 blue (the tag taken out)');
assert.deepEqual(columns('@>64/Pack 9@>600/@21.8 %@0')[1], { x: 600, s: '1.8 %', blue: true });
assert.deepEqual(columns('Pack 1'), [{ x: 0, s: 'Pack 1', blue: false }], 'a line without tabs: as it is');

assert.deepEqual(piece({ tex: 'data/card_get/cardget_bg_01_03.png', wsy: -2 }), { kind: 'strip', key: 's3b', k: 3, flip: true });
assert.deepEqual(piece({ tex: 'data/card_get/cardget_bg_01_06.png', wsy: 2 }), { kind: 'strip', key: 's6t', k: 6, flip: false });
assert.equal(piece({ tex: 'data/card_get/cardget_bg_02_01.png', wsy: 2 }).key, 'bandt');
assert.equal(piece({ tex: 'data/card_get/cardget_bg_03_01.png', wsy: -2 }).key, 'gridb');
assert.equal(piece({ tex: 'data/cardpack/P05-2-N1.png' }), null);

// the loop's places (read live: cardget_bg_a02 frame 0) are every piece's home
assert.equal(stripHome(1, false), 0);
assert.equal(stripHome(6, false), 320);
assert.equal(stripHome(1, true), 704);
assert.equal(stripHome(6, true), 384);
for (const [tex, wx, wy, wsy] of [['cardget_bg_01_01', 0, 768, -2], ['cardget_bg_01_06', 0, 448, -2], ['cardget_bg_01_06', 0, 320, 2],
  ['cardget_bg_01_01', 0, 0, 2], ['cardget_bg_02_01', -777, 768, -2], ['cardget_bg_02_01', 776.9, 0, 2], ['cardget_bg_03_01', 0, 768, -2],
  ['cardget_bg_03_01', 0, 0, 2]]) {
  const s = { tex, wx, wy, wsy };
  assert.deepEqual(offset(s, piece(s)), { dx: 0, dy: 0 }, `${tex} ${wy}: at home in the loop (the band's x is CSS's)`);
}
// the in movie's first frames (cardget_bg_a01): the top strip from the left and above, the bottom one from the right and below
assert.deepEqual(offset({ tex: 'cardget_bg_01_01', wx: -986.1, wy: -61.65, wsy: 2 }, piece({ tex: 'cardget_bg_01_01', wsy: 2 })), { dx: -986.1, dy: -61.65 });
const o = offset({ tex: 'cardget_bg_01_01', wx: 986.1, wy: 829.65, wsy: -2 }, piece({ tex: 'cardget_bg_01_01', wsy: -2 }));
assert.equal(o.dx, 986.1);
assert.ok(Math.abs(o.dy - 61.65) < 1e-9);

assert.equal(packFile('data/cardpack/P05-2-N1.png'), 'p05-2-n1.png');

// hide: nothing while the window is hidden (it stays under the card reveal); the backdrop movie and the frame while shown
const snap = { packScene: { backdrop: { id: 11 }, frame: { id: 12 }, packs: [{ id: 13, tex: 'data/cardpack/P05-2-N1.png' }] } };
assert.deepEqual(mod.hide({ shown: false }, snap), []);
assert.deepEqual(mod.hide({ shown: true }, snap), [11, 12], 'a pack stays the engine\'s until the page has read its art');
assert.deepEqual(mod.hide({ shown: true }, {}), []);
assert.deepEqual(mod.classes, ['CWindowPackSelect']);
assert.equal(mod.mode, 'pass');
console.log('packselect_test: ok');
