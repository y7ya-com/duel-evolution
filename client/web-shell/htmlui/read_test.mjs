// read.js on a synthetic memory image (no game data): one CWindowPlayerSelect in the factory with a Back button
// (CWindowTaskTextSwitch -> caption CWindowTaskShadowText -> CWindowTaskText -> CTextElm "Back") and a waist-up
// avatar child that is not a control.   node client/web-shell/htmlui/read_test.mjs
import assert from 'node:assert/strict';
import { read, FACTORY, APP } from './read.js';
import VT from './vtables.js';

const vt = (cls, off = 0) => +Object.keys(VT).find(k => VT[k][0] === cls && VT[k][1] === off);
const dv = new DataView(new ArrayBuffer(0x1300000));
let heap = 0x100000;
const alloc = n => { const a = heap; heap += (n + 15) & ~15; return a; };
const w32 = (a, v) => dv.setUint32(a, v >>> 0, true), wf = (a, v) => dv.setFloat32(a, v, true), w8 = (a, v) => dv.setUint8(a, v);
const str = (a, s) => { const p = alloc(s.length + 1); [...s].forEach((c, i) => dv.setUint8(p + i, c.charCodeAt(0))); w32(a + 4, p); w32(a + 8, s.length); };   // cp932 (ASCII here)
const wstr = (a, s) => { const p = alloc(2 * s.length + 2); [...s].forEach((c, i) => dv.setUint16(p + 2 * i, c.charCodeAt(0), true)); w32(a + 4, p); w32(a + 8, s.length); };
const list = (a, items) => {   // vc6::list: circular through a sentinel
  const head = alloc(12), nodes = items.map(() => alloc(12));
  [head, ...nodes].forEach((n, i, all) => { w32(n, all[(i + 1) % all.length]); w32(n + 4, all[(i + all.length - 1) % all.length]); });
  nodes.forEach((n, i) => w32(n + 8, items[i]));
  w32(a + 4, head); w32(a + 8, items.length);
};
const elem = (cls, size) => { const o = alloc(size); w32(o, vt(cls)); w8(o + 0xc4, 1); wf(o + 0x174, 1); return o; };

const win = elem('CWindowPlayerSelect', 0x500);
w32(win + 0x340, vt('CWindowPlayerSelect', 0x340));   // its IWindowTaskMediator subobject
wf(win + 0x380, 448); wf(win + 0x384, 256); wf(win + 0x388, 480); wf(win + 0x38c, 272); w8(win + 0x350, 1);
const elm = elem('CTextElm', 0x760); wstr(elm + 0x410, 'Back'); dv.setInt32(elm + 0x74c, 1, true);
const txt = elem('CWindowTaskText', 0x390); w32(txt + 0x368 + 4, elm);
const shadow = elem('CWindowTaskShadowText', 0x398); w32(shadow + 0x36c + 4, txt);
const btn = elem('CWindowTaskTextSwitch', 0x5b8);
w32(btn + 0x344, win + 0x340); w8(btn + 0x350, 1); w32(btn + 0x5a4 + 4, shadow);
wf(btn + 0x3d4, 376); wf(btn + 0x3d8, 240); wf(btn + 0x3dc, 88); wf(btn + 0x3e0, 24); dv.setInt32(btn + 0x3e8, 1, true);
str(btn + 0x4c, 'BackSwitch');   // CTask instName
const avatar = elem('CElement', 0x340);
list(win + 0x0c, [btn, avatar]);   // CTask children

const fac = alloc(0x2b4);
w32(FACTORY, fac);
const ctl = alloc(4); w32(ctl, btn);
w32(fac + 4, ctl); w32(fac + 8, ctl + 4);   // controls_
list(fac + 0x10, [win]);                     // windows_

const s = read(dv, 7, 7);
assert.equal(s.windows.length, 1);
const w = s.windows[0];
assert.deepEqual([w.cls, w.x, w.y, w.w, w.h, w.modal, w.shown], ['CWindowPlayerSelect', 448, 256, 480, 272, true, true]);
assert.equal(w.controls.length, 1);
const b = w.controls[0];
assert.deepEqual([b.cls, b.name, b.label, b.align, b.state, b.x, b.y, b.w, b.h, b.parent],
  ['CWindowTaskTextSwitch', 'BackSwitch', 'Back', 1, 'hover', 376, 240, 88, 24, 0]);
assert.deepEqual(w.extras, [{ id: avatar, cls: 'CElement' }]);
assert.deepEqual(s.tasks, []);
// parts: a sprite child of the button, on request
const sp = elem('CSpriteElm', 0x5088); str(sp + 0x358, 'data/common/window/swich_01_c00.png'); dv.setInt32(sp + 0x94 + 8, 24, true);
list(btn + 0x0c, [sp]);
const p = read(dv, 8, 7, { parts: new Set([win]) }).windows[0].controls[0].parts;
assert.deepEqual([p.sprites.length, p.sprites[0].tex, p.sprites[0].src, p.labels.length], [1, 'data/common/window/swich_01_c00.png', [0, 0, 24, 0], 0]);
assert.equal(read(dv).windows[0].controls[0].parts, undefined);
w8(btn + 0x350, 0);
assert.equal(read(dv).windows[0].controls[0].state, 'disabled');
// the game cursor: g_app -> mouseMng_ (+0xc4c) -> CSwfEngine -> ... -> CSpriteElm, drawn while every element up to the
// manager shows
assert.equal(read(dv).cursor, null);
const app = alloc(0xc50), mgr = elem('CMouseManager', 0x348), swfE = elem('CSwfEngine', 0x460), hand = elem('CSpriteElm', 0x5088);
w32(APP, app); w32(app + 0xc4c, mgr); list(mgr + 0x0c, [swfE]); list(swfE + 0x0c, [hand]);
str(hand + 0x358, 'data/common/m_cursor/mausuk_n01_c01.png'); wf(hand + 0xc8, 852); wf(hand + 0xd4, 1); wf(hand + 0x168 + 12, 1); dv.setInt32(hand + 0x188, 6, true);
let cur = read(dv).cursor;
assert.deepEqual([cur.id, cur.shown, cur.sprites.length, cur.sprites[0].tex, cur.sprites[0].wx, cur.sprites[0].shown, cur.sprites[0].mode],
  [mgr, true, 1, 'data/common/m_cursor/mausuk_n01_c01.png', 852, true, 6]);
w8(swfE + 0xc4, 0);   // its animation hidden: the sprite is not drawn
assert.equal(read(dv).cursor.sprites[0].shown, false);
w32(FACTORY, 0);
assert.deepEqual(read(dv).windows, []);
console.log('read_test: ok');
