// node client/web-shell/htmlui/cosmetics/waistup_newstyle_test.mjs: new-style waist-up items in the HTML UI
// (cosmetics/waistup-newstyle.js), on synthetic data only: the table and wu.txt readers with the engine's rules
// (ovr/nwpak.h), the pack's checks, the skin ramp (the same numbers as rt/nwpak_test.c and newstyle_wu.py), the
// layer rewrite on the part loop's layers, the fallbacks to the original look, and the pixel work. Exit 1 on failure.
import assert from 'node:assert/strict';
import { parseWaistUp, waistUpLayers, blendInto } from './waistup.js';
import { parseNewstyleWu, parseWuText, rampLut, readPak, newstyleLayers, newstyleWaistUp, blendSkin, blendDisk, loadPack,
  _resetNewstyleWu } from './waistup-newstyle.js';
import { WM_CSV } from './waistup_fixture.mjs';

// the table: body, clothes, code, stem; a bad line skipped, "00" and a stem of the other body refused
const T = parseNewstyleWu('# comment\nm 77 01 wm_dc_03_c01  # outfit:x\nf 10 02 wm_dc_01_c01\nm 70 00 wm_dc_01_c01\nnonsense\r\nf 75 03 ww_dc_99_c01\r\n');
assert.deepEqual(T, [{ pre: 'wm', code: '01', stem: 'wm_dc_03_c01', clothes: 0x77 }, { pre: 'ww', code: '03', stem: 'ww_dc_99_c01', clothes: 0x75 }]);

const TXT = `bare 0 112
ramp 0 73 176 230 255
tone 1 0 0 0  93 67 51  248 154 101  255 224 191  255 255 252
tone 2 0 0 0  93 79 64  250 199 149  255 240 211  255 255 252
tone 3 0 0 0  68 37 27  179 83 56  191 123 91  241 218 206
pose r 284 300 200 300
neck r 0 0
headcut r 306
disk r 300 430 10 1 6 -4
pose l 284 300 200 300
neck l 3 0
headcut l 306
disk l 300 430 0 1.1 0 0
`;
const wu = parseWuText(TXT);
assert.deepEqual(wu.stops, [0, 73, 176, 230, 255]);
assert.deepEqual(wu.pose.l, { box: [284, 300, 200, 300], neck: [3, 0], headcut: 306, disk: { cx: 300, cy: 430, angle: 0, scale: 1.1, dx: 0, dy: 0 } });
for (const [from, to, why] of [['pose r 284 300 200 300', 'pose r 600 300 200 300', /bad box/], ['disk l 300 430 0 1.1 0 0\n', '', /disk l missing/],
  ['1 6 -4', '9 6 -4', /out of range/], ['disk r 300 430 10', 'disk r 300 430 nan', /out of range/], ['ramp 0 73 176', 'ramp 0 176 73', /ramp/],
  ['headcut r 306', 'headcut r 306\nwings r 1', /unknown/], ['bare 0 112\n', '', /bare missing/], ['neck l 3 0', 'neck l 300 0', /neck/], ['tone 2 0 0 0  93 79 64', 'tone 2 0 0 0', /tone 2/]])
  assert.throws(() => parseWuText(TXT.replace(from, to)), why, `${why} refused`);
// the ramp: the same values as the engine's and the tool's
const want = { 1: [[209, 132, 88], [251, 185, 141]], 2: [[210, 169, 128], [252, 217, 177]], 3: [[151, 71, 49], [184, 101, 72]] };
for (const s of [1, 2, 3]) {
  const lut = rampLut(wu.stops, wu.tones[s]);
  assert.deepEqual([...lut.subarray(150 * 3, 151 * 3)], want[s][0]);
  assert.deepEqual([...lut.subarray(200 * 3, 201 * 3)], want[s][1]);
}

// the pack: stored entries, CRCs checked
let crcT;
const crc = b => { crcT ||= Array.from({ length: 256 }, (_, i) => { let c = i; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
  let c = 0xffffffff; for (const x of b) c = crcT[(c ^ x) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
function pak(entries) {
  const head = [...Buffer.from('YO2NSPK1')], n = entries.length, u32 = v => [v & 255, v >> 8 & 255, v >> 16 & 255, v >>> 24];
  head.push(...u32(n));
  for (const [name, data] of entries) head.push(name.length, ...Buffer.from(name), 0, ...u32(data.length), ...u32(data.length), ...u32(crc(data)));
  return new Uint8Array([...head, ...entries.flatMap(([, d]) => [...d])]);
}
const enc = s => new Uint8Array(Buffer.from(s));
const ENTRIES = [['body_r.png', enc('BR')], ['hand_r.png', enc('HR')], ['body_l.png', enc('BL')], ['hand_l.png', enc('HL')], ['wu.txt', enc(TXT)]];
const good = pak(ENTRIES);
assert.deepEqual(Object.keys(readPak(good)), ['body_r.png', 'hand_r.png', 'body_l.png', 'hand_l.png', 'wu.txt']);
const flipped = good.slice(); flipped[flipped.length - 20] ^= 0x40;
assert.throws(() => readPak(flipped), /CRC/);
assert.throws(() => readPak(good.slice(0, -5)), /truncated/);
assert.throws(() => readPak(new Uint8Array([...good, 0])), /trailing/);
const bad = good.slice(); bad.set(Buffer.from('YO2NSPK2'));
assert.throws(() => readPak(bad), /not a pack/);

// synthetic pictures: a 200 x 300 coat with a grey (skin) band, the fist grey 150
const img = (w, h, f) => { const data = new Uint8ClampedArray(w * h * 4); for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) data.set(f(x, y), (y * w + x) * 4); return { width: w, height: h, data }; };
const body = img(200, 300, (x, y) => (y >= 120 && y < 150 ? [200, 200, 200, 255] : y < 4 ? [128, 128, 129, 255] : [40, 60, 160, 255]));
const hand = img(200, 300, (x, y) => (y >= 100 && y < 170 && x >= 20 && x < 70 ? [150, 150, 150, 255] : [0, 0, 0, 0]));
const pics = { BR: body, HR: hand, BL: body, HL: hand };
const decode = async b => pics[Buffer.from(b).toString()];
const style = { pre: 'wm', code: '01', stem: 'wm_dc_03_c01', clothes: 0x77 };

// the part loop's layers of a look in that outfit (fixture rows: wm_dc_03_c01 is clothes 0x77), skin tone 3
const M = parseWaistUp(WM_CSV);
const look = [0, 0xa, 0x20, 0x30, 0x40, 0x60, 0x77, 0x90, 0xb4, 0x50, 0, 0, 0, 2, 0, 0];
const L = waistUpLayers(M, look, { pose: 1 });
_resetNewstyleWu();
const reads = [];
const read = async name => { reads.push(name); return good; };
const ns = await newstyleWaistUp(L, { tableOf: async () => [style], load: s => loadPack(s, { read, decode }) });
assert.deepEqual(reads, ['data/avatar/wu/wm_nw_01.pak']);
assert.deepEqual(ns.map(l => l.nw || l.image.replace(/\.png$/, '')), ['wm_h2_11_c01', 'wm_bo_01_c03_l', 'wm_hs_11_c03', 'wm_es_01_01_c03',
  'wm_mo_01_01_c03', 'wm_ey_01_01_c01', 'wm_no_01_c03', 'wm_eb_01_01_c01', 'wm_a2_01_c01', 'body', 'wm_h1_11_c01', 'disk', 'hand']);
const bo = ns.find(l => l.step === 1);
assert.deepEqual([bo.x, bo.y, bo.h], [3, 112, 306 - 112], 'the bare body: its head rows only, at the neck offset');
assert.equal(ns.find(l => l.step === 11).x, 3, 'front hair at the neck offset');
assert.deepEqual(ns.find(l => l.nw === 'disk').disk, { cx: 300, cy: 430, angle: 0, scale: 1.1, dx: 0, dy: 0 });
assert.deepEqual(ns.find(l => l.nw === 'body').lut.subarray(200 * 3, 201 * 3), Uint8Array.from(want[3][1]));
// a caller that draws the bust shifted (the engine's 256 px tiles): everything follows the bare body's layer
const shifted = newstyleLayers(L.map(l => ({ ...l, x: l.x - 256, y: l.y - 128 })), await loadPack(style, { read, decode }), 1, 3);
assert.deepEqual([shifted.find(l => l.nw === 'body').x, shifted.find(l => l.nw === 'body').y], [284 - 256, 300 - 128]);
assert.deepEqual([shifted.find(l => l.nw === 'disk').disk.cx, shifted.find(l => l.nw === 'disk').disk.cy], [300 - 256, 430 - 128]);
assert.equal(shifted.find(l => l.step === 1).h, 306 - 112, 'the same head rows');
// the pack is read once a session
await newstyleWaistUp(L, { tableOf: async () => [style], load: s => loadPack(s, { read, decode }) });
assert.equal(reads.length, 1);

// fallbacks: the original layers, untouched
const same = async (layers, o) => assert.equal(await newstyleWaistUp(layers, o), layers);
await same(L, { tableOf: async () => [] });
await same(waistUpLayers(M, [...look.slice(0, 6), 0x70, ...look.slice(7)]), { tableOf: async () => [style], load: async () => { throw new Error('not asked'); } });
_resetNewstyleWu();
await same(L, { tableOf: async () => [style], load: s => loadPack(s, { read: async () => flipped, decode }) });
_resetNewstyleWu();
await same(L, { tableOf: async () => [style], load: s => loadPack(s, { read: async () => null, decode }) });
_resetNewstyleWu();
await same(L, { tableOf: async () => [style], load: s => loadPack(s, { read: async () => good, decode: async () => img(10, 10, () => [0, 0, 0, 0]) }) });
_resetNewstyleWu();
await same(waistUpLayers(M, [...look.slice(0, 13), 3, 0, 0], { pose: 1 }), { tableOf: async () => [style], load: s => loadPack(s, { read, decode }) });   // skin c04: no body picture
_resetNewstyleWu();
const twoTones = pak(ENTRIES.map(([n, d]) => [n, n === 'wu.txt' ? enc(TXT.replace(/tone 3 .*\n/, '')) : d]));
await same(L, { tableOf: async () => [style], load: s => loadPack(s, { read: async () => twoTones, decode }) });   // no tone 3 in the pack

// pixels: the skin greys only; the disk's identity is the plain blend, a shift moves it
const N = 768, swap = new Uint8ClampedArray(N * N * 4);
blendSkin(swap, N, body, 284, 300, rampLut(wu.stops, wu.tones[3]));
const px = (a, x, y) => [...a.subarray((y * N + x) * 4, (y * N + x) * 4 + 4)];
assert.deepEqual(px(swap, 384, 430), [184, 101, 72, 255]);
assert.deepEqual(px(swap, 384, 300), [128, 128, 129, 255]);
assert.deepEqual(px(swap, 384, 550), [40, 60, 160, 255]);
const strip = img(20, 10, (x, y) => [x * 10, 20, 10, 255]);
const a = new Uint8ClampedArray(N * N * 4), b = new Uint8ClampedArray(N * N * 4);
blendDisk(a, N, strip, 50, 60, 20, 10, { cx: 100, cy: 100, angle: 0, scale: 1, dx: 0, dy: 0 });
blendInto(b, N, strip, { x: 50, y: 60, w: 20, h: 10 });
assert.deepEqual(a, b);
const c = new Uint8ClampedArray(N * N * 4);
blendDisk(c, N, strip, 50, 60, 20, 10, { cx: 50, cy: 60, angle: 90, scale: 1, dx: 0, dy: 0 });
assert.deepEqual(px(c, 45, 75), [150, 20, 10, 255], 'clockwise on screen: +x goes to +y');
console.log('waistup_newstyle_test: ok');
