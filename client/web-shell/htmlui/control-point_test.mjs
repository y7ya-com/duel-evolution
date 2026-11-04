import assert from 'node:assert/strict';
import { controlPoint } from './control-point.js';
import { htmlDefaults, SHOP_CLASSES } from './shop-classes.js';

const snap = {
  windows: [{ x: 150, y: 70, controls: [{ id: 1, x: 10, y: 20, w: 80, h: 30 }] }],
  tasks: [{ cls: 'CShopConfirmWindow', x: 300, y: 330, controls: [
    { id: 2, x: 20, y: 100, wx: 320, wy: 430, wz: 51005, w: 80, h: 28 },
    { id: 3, x: 140, y: 100, wx: 0, wy: 0, wz: 0, w: 80, h: 28 },
  ] }],
};
assert.deepEqual(controlPoint(snap, 1), [200, 105], 'ordinary window coordinates stay local');
assert.deepEqual(controlPoint(snap, 2), [360, 444], 'shop buttons use their drawn world position');
assert.equal(controlPoint(snap, 3), null, 'a not-yet-drawn shop control cannot click an unrelated item');
assert.equal(controlPoint(snap, 999), null);
assert.equal(controlPoint(null, 1), null);
const defaults = htmlDefaults({ on: ['CChatWindow', 'CShopPackWindow'] });
assert(defaults.includes('CChatWindow'));
assert(SHOP_CLASSES.every(c => defaults.includes(c)), 'old hosted configs gain all shop screens');
assert.equal(defaults.length, SHOP_CLASSES.length + 1, 'classes stay unique');
assert.deepEqual(htmlDefaults({ on: ['CChatWindow'], shop: false }), ['CChatWindow']);
console.log('control-point_test: ok');
