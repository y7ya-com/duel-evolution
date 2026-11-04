// read/shop.js on a synthetic memory image: a CShopCardWindow task (not a window: it owns a picture switch through its
// mediator at +0x70) on page 1 of 12 cards, in and out of the shop scene; the game's mouse; a CShopConfirmWindow's
// cart lines (its ShopLineVec).   node client/web-shell/htmlui/read/shop_test.mjs
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
assert.equal(T.mouse, null);   // no g_app yet
const app = alloc(0x200);
w32(0x012711ac, app); dv.setInt32(app + 0x164, 800, true); dv.setInt32(app + 0x168, 500, true); w8(app + 0x15d, 1);
assert.deepEqual(read(dv).tasks.find(t => t.cls === 'CShopCardWindow').mouse, [800, 500, 1]);
// the confirm window: three cart lines (vector<wstring> behind lineTexts_ +0x160's v_ at +4), a text control of its own
const cw = alloc(0x180);
w32(cw, vt('CShopConfirmWindow')); w32(cw + 0x70, vt('CShopConfirmWindow', 0x70));
const strs = ['Card A@>320/x1@>360/300MP', 'Card B@>320/x2@>360/600MP', 'Pack@>320/x1@>360/500MP'];
const vecObj = alloc(16), elems = alloc(16 * strs.length);
w32(cw + 0x164, vecObj); w32(vecObj + 4, elems); w32(vecObj + 8, elems + 16 * strs.length);
strs.forEach((s, i) => {
  const buf = alloc(2 * s.length);
  for (let k = 0; k < s.length; k++) dv.setUint16(buf + 2 * k, s.charCodeAt(k), true);
  w32(elems + 16 * i + 4, buf); w32(elems + 16 * i + 8, s.length);
});
const tx = alloc(0x3d0);
w32(tx, vt('CWindowTaskText')); w8(tx + 0xc4, 1); w32(tx + 0x344, cw + 0x70);
w32(ctl, sw); const ctls = alloc(8); w32(ctls, sw); w32(ctls + 4, tx); w32(fac + 4, ctls); w32(fac + 8, ctls + 8);
const C = read(dv).tasks.find(t => t.cls === 'CShopConfirmWindow');
assert.deepEqual(C.lines, strs);
w32(cw + 0x164, 0);   // never filled: no vector yet
assert.deepEqual(read(dv).tasks.find(t => t.cls === 'CShopConfirmWindow').lines, []);
dv.setInt32(mng + 0x7c, 0x19, true);   // the pack check scene pushed over the shop: its tasks live on, hidden
T = read(dv).tasks.find(t => t.cls === 'CShopCardWindow');
assert.equal(T.shown, false);
dv.setInt32(mng + 0x7c, 0x0e, true); w32(win + 0x20, 2);   // back in the shop, the window hidden (lockFlags |= 2)
assert.equal(read(dv).tasks.find(t => t.cls === 'CShopCardWindow').shown, false);
console.log('read/shop_test: ok');
