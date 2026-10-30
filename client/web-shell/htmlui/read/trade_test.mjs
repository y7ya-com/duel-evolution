// read/trade.js on a synthetic memory image: a trade card area (a model whose window rect stays 0: its own is +0x464)
// and a trade card.   node client/web-shell/htmlui/read/trade_test.mjs
import assert from 'node:assert/strict';
import { read, extend, FACTORY } from '../read.js';
import VT from '../vtables.js';
import trade from './trade.js';

extend(trade);
const vt = (cls, off = 0) => +Object.keys(VT).find(k => VT[k][0] === cls && VT[k][1] === off);
const dv = new DataView(new ArrayBuffer(0x1300000));
let heap = 0x100000;
const alloc = n => { const a = heap; heap += (n + 15) & ~15; return a; };
const w32 = (a, v) => dv.setUint32(a, v >>> 0, true), wf = (a, v) => dv.setFloat32(a, v, true), w8 = (a, v) => dv.setUint8(a, v);
const elem = (cls, size) => { const o = alloc(size); w32(o, vt(cls)); w8(o + 0xc4, 1); wf(o + 0x174, 1); return o; };
const area = elem('CWindowTaskCardArea', 0x4c8);
w32(area + 0x340, vt('CWindowTaskCardArea', 0x340));
[248, 320, 488, 288].forEach((v, i) => wf(area + 0x464 + 4 * i, v)); dv.setInt32(area + 0x478, 1, true);
const card = elem('CWindowTaskTradeCard', 0x3a8);
w32(card + 0x344, area + 0x340); dv.setInt32(card + 0x394, 4007, true); w8(card + 0x398, 1);
const fac = alloc(0x2b4), ctl = alloc(4), head = alloc(12), node = alloc(12);
w32(FACTORY, fac); w32(ctl, card); w32(fac + 4, ctl); w32(fac + 8, ctl + 4);
w32(head, node); w32(head + 4, node); w32(node, head); w32(node + 4, head); w32(node + 8, area);
w32(fac + 0x10 + 4, head); w32(fac + 0x10 + 8, 1);
const W = read(dv).windows[0];
assert.deepEqual([W.cls, W.x, W.y, W.w, W.h, W.mode], ['CWindowTaskCardArea', 248, 320, 488, 288, 1]);
assert.deepEqual([W.controls[0].card, W.controls[0].dragging], [4007, true]);
console.log('read/trade_test: ok');
