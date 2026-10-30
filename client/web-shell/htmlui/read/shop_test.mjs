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
