import assert from 'node:assert/strict';
import { annotations } from './model.js';
import { nativeShop } from './native-screen.js';

const banner = (id, tex, wx, wy) => ({ id, tex, wx, wy, shown: true, src: [0, 0, 512, 256], sx: 1, sy: 1 });
const category = { id: 1, cls: 'CShopCategoryWindow', x: 270, y: 70, controls: [], parts: { sprites: [
  banner(2, 'data/shop/shop_card_01_c01.png', 320, 109),
  banner(3, 'data/shop/shop_pack_01_c01.png', 320, 252),
  banner(4, 'data/shop/shop_domino_avatar_01_c01.png', 320, 395),
] } };
const labels = annotations(category);
assert.deepEqual(labels.map(l => l.text), ['Single Cards', 'Booster Packs', 'Avatar Parts']);
assert.deepEqual([labels[0].x, labels[0].y, labels[0].w, labels[0].h], [356, 214, 352, 29]);
assert.equal(annotations({ ...category, parts: { sprites: [{ ...category.parts.sprites[0], shown: false }] } }).length, 0);
const pack = { id: 5, cls: 'CShopPackWindow', x: 264, y: 0, controls: [
  // The native buttons can have zero base size and no translated label. Modern
  // input must not depend on finding or renaming them.
  { id: 6, cls: 'CWindowTaskPictureSwitch', w: 0, h: 0, name: '', shown: true },
  { id: 7, cls: 'CWindowTaskPictureSwitch', w: 0, h: 0, name: '', shown: true },
], items: [{ itemId: 7, slot: 0, type: 1, name: 'Light of Destruction', price: 1000 }, { itemId: 8, slot: 5, type: 0, param: 25, price: 3200 }] };
assert.deepEqual(annotations(pack, { card: () => ({ name: 'Dark Magician' }) }).map(l => [l.text, l.x, l.y]), [['Light of Destruction', 297, 262], ['Dark Magician', 297, 502]]);
assert.equal(annotations({ ...pack, items: [{ slot: 0, type: 1, param: 999 }] }).length, 0, 'unknown native names are not fabricated');
assert.equal(annotations({ ...pack, cls: 'CShopAvatarWindow' }).length, 0, 'native avatar rows keep their own names and layout');

const node = () => ({ style: {}, children: [], classes: new Set(), dataset: {},
  append(...nodes) { this.children.push(...nodes); }, remove() { this.removed = true; },
  classList: { add() {}, remove() {} },
});
globalThis.document = { getElementById: () => ({}), createElement: node };
const calls = [];
const legacy = { classes: ['CShopPackWindow'], mode: 'pass', parts: true,
  hide: w => w.hideIds, passthrough: part => !!part.tex,
  mount(win, root) { calls.push(['mount', win.id]); return { native: true }; },
  update(win, prev, root, api, state) { calls.push(['update', win.id, state.native]); },
  unmount(root, state) { calls.push(['unmount', state.native]); },
};
const screen = nativeShop(legacy), root = node(); root.style.clipPath = 'native-modal-cutout';
const api = { click() { throw new Error('A Modern shop paint must never invoke a guessed native action'); } };
const state = screen.mount(pack, root, api); screen.update(pack, null, root, api, state);
assert.equal(screen.mode, 'pass'); assert.equal(screen.rootInput, 'none');
assert.equal(screen.hide, legacy.hide); assert.equal(screen.passthrough, legacy.passthrough);
assert.equal(root.style.clipPath, 'native-modal-cutout', 'native foreground dialogs retain their clipping');
assert.deepEqual(pack.items.map(i => i.price), [1000, 3200], 'native catalog and costs remain authoritative');
assert.equal(state.nodes.size, 1);
screen.update({ ...pack, items: [] }, pack, root, api, state); assert.equal(state.nodes.size, 0, 'old product names disappear on page changes');
screen.unmount(root, state);
assert.deepEqual(calls, [['mount', 5], ['update', 5, true], ['update', 5, true], ['unmount', true]]);
console.log('modern/shop/model_test: native geometry, labels and original input delegation ok');
