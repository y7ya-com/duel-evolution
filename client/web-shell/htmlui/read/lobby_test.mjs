// read/lobby.js on a synthetic memory image: a player card (CPlayerListMenu) holding a Help (its size from +0x38c /
// +0x390) whose back plane is listed as its part (parent: the Help, through the Help's mediator at +0x368), and a Help
// whose size reads as garbage (left out).   node client/web-shell/htmlui/read/lobby_test.mjs
import assert from 'node:assert/strict';
import { read, extend, FACTORY } from '../read.js';
import VT from '../vtables.js';
import lobby from './lobby.js';

extend(lobby);
const vt = (cls, off = 0) => +Object.keys(VT).find(k => VT[k][0] === cls && VT[k][1] === off);
const dv = new DataView(new ArrayBuffer(0x1300000));
let heap = 0x100000;
const alloc = n => { const a = heap; heap += (n + 15) & ~15; return a; };
const w32 = (a, v) => dv.setUint32(a, v >>> 0, true), wf = (a, v) => dv.setFloat32(a, v, true), w8 = (a, v) => dv.setUint8(a, v);
const elem = (cls, size) => { const o = alloc(size); w32(o, vt(cls)); w8(o + 0xc4, 1); wf(o + 0x174, 1); return o; };
const card = elem('CPlayerListMenu', 0x618);
w32(card + 0x340, vt('CPlayerListMenu', 0x340));
[340, 300, 336, 328].forEach((v, i) => wf(card + 0x380 + 4 * i, v));
const help = elem('CWindowTaskHelp', 0x398);
w32(help + 0x344, card + 0x340); w32(help + 0x368, vt('CWindowTaskHelp', 0x368));
wf(help + 0x70, 8); wf(help + 0x74, 44); wf(help + 0x38c, 320); wf(help + 0x390, 16);
const plane = elem('CWindowTaskBackPlane', 0x3a0);
w32(plane + 0x344, help + 0x368); wf(plane + 0x37c, 320); wf(plane + 0x380, 16);
const bad = elem('CWindowTaskHelp', 0x398);
w32(bad + 0x344, card + 0x340); wf(bad + 0x38c, NaN); wf(bad + 0x390, 16);
const fac = alloc(0x2b4), ctls = alloc(12), head = alloc(12), node = alloc(12);
w32(FACTORY, fac); [help, plane, bad].forEach((c, i) => w32(ctls + 4 * i, c)); w32(fac + 4, ctls); w32(fac + 8, ctls + 12);
w32(head, node); w32(head + 4, node); w32(node, head); w32(node + 4, head); w32(node + 8, card);
w32(fac + 0x10 + 4, head); w32(fac + 0x10 + 8, 1);
const W = read(dv).windows[0];
const h = W.controls.find(c => c.id === help), p = W.controls.find(c => c.id === plane), b = W.controls.find(c => c.id === bad);
assert.equal(W.cls, 'CPlayerListMenu');
assert.deepEqual([h.cls, h.x, h.y, h.w, h.h, h.unknown], ['CWindowTaskHelp', 8, 44, 320, 16, undefined]);
assert.deepEqual([p.cls, p.parent, p.w, p.h], ['CWindowTaskBackPlane', help, 320, 16]);
assert.deepEqual([b.w, b.h], [0, 0]);
console.log('read/lobby_test: ok');
