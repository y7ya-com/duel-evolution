// read/shop.js on a synthetic memory image: a CShopCardWindow task (not a window: it owns a picture switch through its
// mediator at +0x70) on page 1 of 12 cards, in and out of the shop scene.   node client/web-shell/htmlui/read/shop_test.mjs
import assert from 'node:assert/strict';
import { read, extend, FACTORY } from '../read.js';
import VT from '../vtables.js';
import shop from './shop.js';

extend(shop);
const vt = (cls, off = 0) => +Object.keys(VT).find(k => VT[k][0] === cls && VT[k][1] === off);
const dv = new DataView(new ArrayBuffer(0x1300000));
let heap = 0x100000;
const alloc = n => { const a = heap; heap += (n + 15) & ~15; return a; };
const w32 = (a, v) => dv.setUint32(a, v >>> 0, true), wf = (a, v) => dv.setFloat32(a, v, true), w8 = (a, v) => dv.setUint8(a, v);
const win = alloc(0x260);
w32(win, vt('CShopCardWindow')); w32(win + 0x70, vt('CShopCardWindow', 0x70));
const items = alloc(12 * 0x14);
w32(win + 0x248 + 4, items); w32(win + 0x248 + 8, items + 12 * 0x14);   // 12 cards
dv.setInt32(win + 0x258, 1, true); w8(win + 0x245, 1);                  // page 1: 2 cards, art on
const sw = alloc(0x3d0);
w32(sw, vt('CWindowTaskPictureSwitch')); w8(sw + 0xc4, 1); wf(sw + 0x174, 1); w32(sw + 0x344, win + 0x70);
const fac = alloc(0x2b4), ctl = alloc(4), head = alloc(12);
w32(FACTORY, fac); w32(ctl, sw); w32(fac + 4, ctl); w32(fac + 8, ctl + 4);
w32(head, head); w32(head + 4, head); w32(fac + 0x10 + 4, head);   // no windows
const mng = alloc(0x80);
w32(0x01271790, mng); dv.setInt32(mng + 0x7c, 0x0e, true);

let T = read(dv).tasks.find(t => t.cls === 'CShopCardWindow');
assert.deepEqual([T.x, T.y, T.w, T.h, T.page, T.controls.length, T.shown], [264, 0, 760, 600, 1, 1, true]);
assert.deepEqual(T.holes, [{ x: 37, y: 140, w: 80, h: 116 }, { x: 135, y: 140, w: 80, h: 116 }]);
dv.setInt32(mng + 0x7c, 0x19, true);   // the pack check scene pushed over the shop: its tasks live on, hidden
T = read(dv).tasks.find(t => t.cls === 'CShopCardWindow');
assert.equal(T.shown, false);
dv.setInt32(mng + 0x7c, 0x0e, true); w32(win + 0x20, 2);   // back in the shop, the window hidden (lockFlags |= 2)
assert.equal(read(dv).tasks.find(t => t.cls === 'CShopCardWindow').shown, false);
console.log('read/shop_test: ok');

// Native item costs and ids survive pagination; the browser never fabricates a catalogue or prices.
for (let i = 0; i < 12; i++) {
  const p = items + i * 0x14;
  w32(p, 700 + i); w8(p + 4, 0); w32(p + 8, 1100 + i); w32(p + 12, 25 + i);
}
w32(win + 0x20, 0);
T = read(dv).tasks.find(t => t.cls === 'CShopCardWindow');
assert.equal(T.itemCount, 12);
assert.deepEqual(T.items.map(({ itemId, type, param, price, slot }) => ({ itemId, type, param, price, slot })), [
  { itemId: 710, type: 0, param: 1110, price: 35, slot: 0 },
  { itemId: 711, type: 0, param: 1111, price: 36, slot: 1 },
]);
// Only an RTTI-confirmed CElement can be used as a compact subtree hide instruction.
const element = alloc(0x1b0); w32(element, vt('CElement')); w32(win + 0x7c, element);
T = read(dv).tasks.find(t => t.cls === 'CShopCardWindow');
assert.deepEqual(T.hideIds, [element]);
w32(element, vt('CShopNumber'));
assert.equal(read(dv).tasks.find(t => t.cls === 'CShopCardWindow').hideIds, undefined);
console.log('read/shop_test: native prices, pagination, and validated subtree hiding ok');

const nativeTask = (name, bytes) => {
  const task = alloc(bytes), control = alloc(0x3d0);
  w32(task, vt(name)); w32(task + 0x70, vt(name, 0x70));
  w32(control, vt('CWindowTaskPictureSwitch')); w8(control + 0xc4, 1); wf(control + 0x174, 1);
  w32(control + 0x344, task + 0x70); w8(control + 0x350, 1);
  return [task, control];
};
const [price, priceTag] = nativeTask('CShopPricePlate', 0xd0);
w32(price + 0x94, priceTag); w32(price + 0xb8, 1250); w32(price + 0xbc, 10); w32(price + 0xc0, 4); w32(price + 0xc8, 0); w8(price + 0xb4, 1); wf(price + 0xc4, .5);
const [confirm, ok] = nativeTask('CShopConfirmWindow', 0x180);
w32(confirm + 0x94, ok); w32(confirm + 0xa0, 9876); w32(confirm + 0x174, 3750);
const cart = alloc(0x1c); w32(cart, 812); w8(cart + 4, 0); w32(cart + 8, 231); w32(cart + 12, 1250); w32(cart + 0x14, 3);
w32(confirm + 0x154, cart); w32(confirm + 0x158, cart + 0x1c);
const controls = alloc(12); [sw, priceTag, ok].forEach((c, i) => w32(controls + i * 4, c));
w32(fac + 4, controls); w32(fac + 8, controls + 12);
const tasks = read(dv).tasks;
const P = tasks.find(t => t.cls === 'CShopPricePlate'), C = tasks.find(t => t.cls === 'CShopConfirmWindow');
assert.deepEqual([P.tagId, P.price, P.count, P.index, P.enabled, P.rate], [priceTag, 1250, 10, 4, true, .5]);
assert.deepEqual([C.okId, C.cancelId, C.total], [ok, 9876, 3750]);
assert.deepEqual(C.cart, [{ itemId: 812, type: 0, param: 231, price: 1250, count: 3 }]);
console.log('read/shop_test: verified native selection, confirmation actions and complete cart ok');
