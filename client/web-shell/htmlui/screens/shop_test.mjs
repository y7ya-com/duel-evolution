import assert from 'node:assert/strict';
import { shopPlan, picture } from './shop-plan.js';
const sprite = (id, file, x, y, w, h, z = 10) => ({ id, tex: `data/shop/${file}`, src: [0, 0, w, h], wx: x, wy: y, wz: z, shown: true });
const window = (cls, sprites = []) => ({ id: 99, cls, x: 270, y: 70, w: 754, h: 530, controls: [], parts: { sprites, labels: [], swfs: [] } });
const category = window('CShopCategoryWindow', [
  sprite(1, 'shop_win_01_c01.png', 280, 84, 512, 512),
  sprite(2, 'shop_introduction_01_e.png', 270, 54, 256, 64, 12),
  sprite(3, 'shop_card_01_c01.png', 320, 109, 512, 256, 11),
]);
let p = shopPlan(category);
assert.deepEqual(p.items.map(i => i.kind), ['frame', 'title']);
assert.equal(p.items[1].text, 'Item Selection');
assert.deepEqual(p.items[0].rect, { x: 280, y: 84, w: 512, h: 512 });
assert.deepEqual(p.holes, [{ z: 11, rect: { x: 344, y: 138, w: 376, h: 112 } }], 'only real category picture punches through the crisp HTML panel');
assert.equal(picture(category.parts.sprites[2]), true);
assert.equal(picture(category.parts.sprites[0]), false);
const price = window('CShopPricePlate', [sprite(4, 'shop_pricetag_06_c01.png', 301, 120, 99, 256)]);
price.controls.push({ id: 8, cls: 'CWindowTaskText', shown: true, x: 10, y: 216, wx: 311, wy: 336, wz: 14, text: '1000MP', fontSize: 16 });
p = shopPlan(price);
assert.deepEqual(p.items[0].rect, { x: 301, y: 332, w: 99, h: 42 });
assert.equal(p.items[1].text, '1000MP');
assert.equal(p.items[1].rect.y, 336, 'leaf labels use drawn world coordinates, not task-local guesses');
const mileage = { ...window('CShopMileagePlate', [sprite(9, 'shop_money_01_c01.png', 795, 390, 256, 128)]), x: 795, y: 390, mp: 10000, total: 600 };
p = shopPlan(mileage);
assert.deepEqual(p.items.filter(i => i.kind === 'label').map(i => i.text), ['10000MP', '600MP']);
const cards = { ...window('CShopCardWindow'), x: 264, y: 0, holes: [{ x: 37, y: 140, w: 80, h: 116 }] };
assert.deepEqual(shopPlan(cards).holes[0].rect, { x: 301, y: 140, w: 80, h: 116 });
const digits = window('CShopPackWindow', [sprite(10, 'shop_number_01_c01.png', 800, 20, 16, 16)]);
digits.parts.sprites[0].src = [16, 16, 16, 16];
assert.equal(shopPlan(digits).items[0].text, '9', 'shop bitmap glyphs become DOM text');
const hidden = window('CShopCategoryWindow', [{ ...sprite(11, 'shop_btn1_01_c01.png', 795, 540, 256, 64), shown: false }]);
assert.equal(shopPlan(hidden).items.length, 0);
console.log('screens/shop_test: category/product/price/wallet/hidden geometry and native input pass');
