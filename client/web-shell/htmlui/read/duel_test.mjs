// read/duel.js and read/result.js on a synthetic memory image (read/shop_test.mjs's style), and screens/duel.js's pure
// geometry (holes, loc, the frame styles).   node client/web-shell/htmlui/read/duel_test.mjs
import assert from 'node:assert/strict';
import { read, extend, FACTORY } from '../read.js';
import VT from '../vtables.js';
import duel from './duel.js';
import result from './result.js';
import { holes, loc, thinShadow, stripeLook, TONES, nudge, artOk } from '../screens/duel.js';

extend(duel); extend(result);
const vt = (cls, off = 0) => +Object.keys(VT).find(k => VT[k][0] === cls && VT[k][1] === off);
const dv = new DataView(new ArrayBuffer(0x1300000));
let heap = 0x100000;
const alloc = n => { const a = heap; heap += (n + 15) & ~15; return a; };
const w32 = (a, v) => dv.setUint32(a, v >>> 0, true), wf = (a, v) => dv.setFloat32(a, v, true), w8 = (a, v) => dv.setUint8(a, v);
const i32 = (a, v) => dv.setInt32(a, v, true);
const shownWin = w => { w8(w + 0xc4, 1); wf(w + 0x174, 1); };
// a coin dialog (CUSelectCoinDialog: fade_ 0x3f0, cx_ 0x3f8, cy_ 0x3fc, boxW_ 0x408, boxH_ 0x40c, hover 0x450)
const coin = alloc(0x460);
w32(coin, vt('CUSelectCoinDialog')); shownWin(coin);
wf(coin + 0x380, 344); wf(coin + 0x384, 276); wf(coin + 0x388, 336); wf(coin + 0x38c, 144);
i32(coin + 0x3f0, 0); i32(coin + 0x3f8, 512); i32(coin + 0x3fc, 348); i32(coin + 0x408, 336); i32(coin + 0x40c, 144); i32(coin + 0x450, 1);
// an OK dialog base (CUSelectNumDialog: CUDialogBaseOk's fields 0x18 on: fade_ 0x408, cx_ 0x410)
const num = alloc(0x470);
w32(num, vt('CUSelectNumDialog')); shownWin(num);
i32(num + 0x408, 64); i32(num + 0x410, 500); i32(num + 0x414, 300); i32(num + 0x420, 336); i32(num + 0x424, 144);
// a record (CWindowResult: side_ 0x3d0, name_ 0x3d4 std::string, wins_ 0x3e4.., winNum_ CTaskPtr 0x3a8 -> a CTextElm)
const rec = alloc(0x3f0), name = alloc(16), elm = alloc(0x420), txt = alloc(16);
w32(rec, vt('CWindowResult')); shownWin(rec);
i32(rec + 0x3d0, 1); new Uint8Array(dv.buffer).set(Buffer.from('Rival'), name); w32(rec + 0x3d4 + 4, name); w32(rec + 0x3d4 + 8, 5);
i32(rec + 0x3e4, 7); i32(rec + 0x3e8, 9); i32(rec + 0x3ec, 980);
w32(rec + 0x3a8 + 4, elm); w8(elm + 0xc4, 1); wf(elm + 0xc8, 680); wf(elm + 0xcc, 232);
[...'@97'].forEach((ch, i) => dv.setUint16(txt + 2 * i, ch.charCodeAt(0), true)); w32(elm + 0x410 + 4, txt); w32(elm + 0x410 + 8, 3);
// the factory: no controls, the three windows in its list
const fac = alloc(0x2b4), head = alloc(12), nodes = [coin, num, rec].map(() => alloc(12));
w32(FACTORY, fac); w32(head, nodes[0]);
nodes.forEach((n, i) => { w32(n, nodes[i + 1] || head); w32(n + 8, [coin, num, rec][i]); });
w32(fac + 0x10 + 4, head);

const S = read(dv), W = c => S.windows.find(w => w.cls === c);
assert.deepEqual(W('CUSelectCoinDialog').dlg, { fade: 0, answered: false, cx: 512, cy: 348, boxW: 336, boxH: 144, hover: 1, after: 0 });
assert.deepEqual([W('CUSelectNumDialog').dlg.fade, W('CUSelectNumDialog').dlg.cx, W('CUSelectNumDialog').dlg.boxH], [64, 500, 144]);
const R = W('CWindowResult');
assert.deepEqual([R.side, R.player, R.record], [1, 'Rival', { wins: 7, loses: 9, score: 980 }]);
assert.deepEqual([R.nums.length, R.nums[0].text, R.nums[0].wx, R.nums[0].wy], [1, '@97', 680, 232]);

// the coins' holes: 51 x 51, centred 80 px either side of cx_, 40 px above the box's bottom (window-local)
const cw = { ...W('CUSelectCoinDialog'), x: 344, y: 276 };
assert.deepEqual(holes(cw), [{ x: 63, y: 79, w: 51, h: 51 }, { x: 223, y: 79, w: 51, h: 51 }]);   // bottom 420 - 65 - 276
assert.deepEqual(holes({ ...cw, dlg: { ...cw.dlg, fade: 32 } }), []);   // fading in: the coins aren't drawn yet
// an icon under a row under a list: placed by where it was drawn, else by its parents
const ctl = [{ id: 1, parent: 0, x: 8, y: 8, wz: 0 }, { id: 2, parent: 1, x: 0, y: 32, wz: 0 }, { id: 3, parent: 2, x: 0, y: 0, wz: 0, cls: 'CWindowTaskImageDuelCmd', shown: true, w: 16, h: 16 }];
const byId = new Map(ctl.map(c => [c.id, c]));
assert.deepEqual(loc(ctl[2], byId, { x: 100, y: 100 }), { x: 8, y: 40 });
assert.deepEqual(loc({ ...ctl[2], wz: 5, wx: 130, wy: 150 }, byId, { x: 100, y: 100 }), { x: 30, y: 50 });
// frames: nine styles, the blue one's light edge outermost
assert.equal(TONES.length, 9);
assert.match(thinShadow(1), /^inset 3px 0 #76ffff, inset 0 3px #a7ffff/);
assert.doesNotMatch(thinShadow(1, false), /inset 0 -3px/);
// stripes: every other row from the top item's parity, the selection over it
assert.deepEqual([0, 1, 2, 3].map(i => stripeLook(i, 0, i === 2)), ['alt', 'plain', 'sel', 'plain']);
// the 2x half-pixel shift (measured on the live flips): a whole device pixel at 2x, none at 1x
assert.equal(nudge(2), 'translate(0.5px, 0.5px)');
assert.equal(nudge(1), '');
// no Image under node: every list icon stays the engine's, under a hole
assert.equal(artOk('data/common/icon/duelcmd_icon_01.png'), false);
const icon = { id: 9, cls: 'CWindowTaskImageDuelCmd', parent: 0, x: 8, y: 8, w: 16, h: 16, wz: 0, shown: true, texture: 'data/common/icon/duelcmd_icon_01.png' };
assert.deepEqual(holes({ x: 0, y: 0, controls: [icon] }), [{ x: 8, y: 8, w: 16, h: 16 }]);
console.log('read/duel_test: ok');
