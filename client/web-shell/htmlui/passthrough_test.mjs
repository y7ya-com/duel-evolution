import assert from 'node:assert/strict';
import { passthroughIds } from './passthrough.js';
const categoryArt = { id: 10, tex: 'data/shop/category.png' };
const owner = { controls: [{ id: 1, parts: { sprites: [{ id: 2, tex: 'data/cardpack/pack.png' }], labels: [{ id: 3, text: 'Native text' }] } }],
  extras: [categoryArt], parts: { sprites: [categoryArt, { id: 11, tex: 'data/shop/frame.png' }], labels: [{ id: 12, text: 'Title' }], swfs: [{ id: 13, name: 'Character art' }] } };
assert.deepEqual(passthroughIds(owner, p => /category|cardpack/.test(p.tex || '') || p.name === 'Character art'), [2, 10, 13]);
assert.deepEqual(passthroughIds({}, () => true), []);
assert.deepEqual(passthroughIds(owner, (p, control) => control?.id === 1 && p.tex), [2], 'control-aware predicates retain their owner');
console.log('passthrough_test: ok');
