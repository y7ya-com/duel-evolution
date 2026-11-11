// node client/web-shell/htmlui/cosmetics/art_test.mjs: cosmetics/art.js's mapping from an API item to the game's own
// picture names (the decompiled renderer's rules: yo2ChibiAvatarElm.cpp clothesPart / applyMaleParts /
// applyFemaleParts, yo2DuelDiscShelf.cpp displayDiskImage), checked on known items, and its reading of merge.dat
// through a stub of lazyfs.js's Module.yo2Lazy (a synthetic archive: no game art here). Exit 1 on the first failure.
import assert from 'node:assert/strict';
const A = await import('./art.js');
const { itemArtPaths, clothesPart, hairParts, glassesPart, faceMarkPart, diskImage, diskPath, artBody, parseDirectory, gameFile, itemArtUrls } = A;

const item = (kind, slot, variants, extra = {}) => ({ id: `${kind}:x`, name: 'X', kind, slot, rarity: 'common',
  variants: variants.map(([gender, number]) => ({ gender, bit: (gender === 'female' ? 256 : 0) + number, number, worlds: [0, 1] })),
  bodies: [...new Set(variants.map(v => v[0]))], ...extra });
const names = (it, body) => itemArtPaths(it, body).paths.map(p => p.slice(p.lastIndexOf('/') + 1));

// the table from the task, then more from the renderer's code
const cloak = item('outfit', 6, [['male', 0x7c], ['female', 0x77]]);
assert.deepEqual(names(cloak, 'male'), ['cm_dc_98_c01_n01_01.png']);             // Rare Hunter Cloak
assert.deepEqual(names(cloak, 'female'), ['cw_dc_98_c01_n01_01.png']);
assert.equal(itemArtPaths(cloak, 'male').paths[0], 'data/avatar/chibi/cm_dc_98_c01_n01_01.png');
const suit = item('outfit', 6, [['male', 0x77], ['female', 0x74]]);
assert.deepEqual(names(suit, 'female'), ['cw_dc_03_c01_n01_01.png']);             // Black Suit
assert.deepEqual(names(suit, 'male'), ['cm_dc_03_c01_n01_01.png']);
const afro = item('hair', 1, [['male', 0xa], ['male', 0xb], ['male', 0xc], ['female', 0x5], ['female', 0x6], ['female', 0x7]]);
assert.deepEqual(names(afro, 'male'), ['cm_h2_11_c01_n01_01.png', 'cm_h1_11_c01_n01_01.png']);   // Afro: back, then front
assert.deepEqual(names(afro, 'female'), ['cw_h2_06_c01_n01_01.png', 'cw_h1_06_c01_n01_01.png']); // female afro 1: h2 6
const sun = item('accessory', 9, [['male', 0x50], ['female', 0x50]]);
assert.deepEqual(names(sun, 'male'), ['cm_a2_01_c01_n01_01.png']);              // Sunglasses
assert.equal(itemArtPaths(sun, 'male').w, 64);
assert.equal(diskImage(0xb4), 'dd_02_c02');                                     // Battle City Alpha Gold
assert.equal(diskImage(0xd7), 'da_01_c08');                                     // Academy Amber
const amber = item('dueldisk', 8, [['male', 0xd7], ['female', 0xd7]]);
assert.deepEqual(itemArtPaths(amber, 'female').paths, ['data/map/map_switch/mapdisk_da_01_c08_01.png']);
assert.deepEqual([itemArtPaths(amber, 'male').w, itemArtPaths(amber, 'male').h], [160, 107]);
assert.equal(diskPath(0xb4, true), 'data/map/map_switch/mapdisk_dd_02_c02_02.png');  // the lit picture

// clothesPart, every branch: Domino male 0x6f.. (dc_01 c01..c04, dc_02 c01..c03, the rest table), female 0x6f..
// (dc_01, dc_02 c01..c03, the rest table), Academy from 0x7f (0x7f and 0x80 both ac_01)
assert.equal(clothesPart(0x6f, false), 'dc_01_c01'); assert.equal(clothesPart(0x70, false), 'dc_01_c01');
assert.equal(clothesPart(0x73, false), 'dc_01_c04');
assert.equal(clothesPart(0x74, false), 'dc_02_c01'); assert.equal(clothesPart(0x76, false), 'dc_02_c03');   // the tracksuits
assert.equal(clothesPart(0x78, false), 'dc_99_c01'); assert.equal(clothesPart(0x79, false), 'dc_04_c01');   // robe, Yugi
assert.equal(clothesPart(0x7a, false), 'dc_05_c01'); assert.equal(clothesPart(0x7b, false), 'dc_06_c01');   // Kaiba, Joey
assert.equal(clothesPart(0x6f, true), 'dc_01_c01'); assert.equal(clothesPart(0x70, true), 'dc_01_c01');
assert.equal(clothesPart(0x71, true), 'dc_02_c01'); assert.equal(clothesPart(0x73, true), 'dc_02_c03');     // the punk outfits
assert.equal(clothesPart(0x75, true), 'dc_99_c01'); assert.equal(clothesPart(0x76, true), 'dc_04_c01');     // robe, Téa
assert.equal(clothesPart(0x78, true), null);                                     // past the female table
assert.equal(clothesPart(0x7f, false), 'ac_01_c01'); assert.equal(clothesPart(0x80, true), 'ac_01_c01');    // Slifer Red
assert.equal(clothesPart(0x81, false), 'ac_02_c01'); assert.equal(clothesPart(0x82, false), 'ac_03_c01');   // Ra, Obelisk
assert.equal(clothesPart(0x87, false), 'ac_08_c01'); assert.equal(clothesPart(0x8a, false), 'ac_11_c01');   // Jaden, Hell Kaiser
assert.equal(clothesPart(0x6e, false), null);

// hair: front h1 = number + 1; male afros 11..14 -> h2 11..14, the shaved head (h1 7) draws the bald head; female
// afros 6..8 -> h2 6..8, Afro IV (10) -> h2 10, the ponytail (9) -> h2 09; other hair: no back of its own
assert.deepEqual(hairParts(0xd, false), { front: 'h1_14_c01', back: 'h2_14_c01', own: 'h2_01_c01' });   // Afro IV
assert.equal(hairParts(0x9, true).back, 'h2_10_c01');                            // female Afro IV
assert.equal(hairParts(0x8, true).back, 'h2_09_c01');                            // ponytail
assert.equal(hairParts(0x7, true).back, 'h2_08_c01');                            // female afro 3
assert.equal(hairParts(0x8, false).back, null);                                  // Quiff II: only its front
assert.equal(hairParts(0x8, false).front, 'h1_09_c01');
assert.equal(hairParts(0x8, false, { back: 0x92, color: 3 }).own, 'h2_03_c03');  // the player's own back hair, colour 3
assert.equal(hairParts(0x6, false).bald, true);
const shaved = item('hair', 1, [['male', 0x6]]);
assert.deepEqual(names(shaved, 'male'), ['cm_bo_01_c01_n01_01.png']);
assert.ok(itemArtPaths(shaved, 'male').crop);
const pony = item('hair', 1, [['female', 0x8]]);
assert.deepEqual(names(pony, 'female'), ['cw_h2_09_c01_n01_01.png', 'cw_h1_09_c01_n01_01.png']);
const quiff = item('hair', 1, [['male', 0x9]]);
assert.deepEqual(names(quiff, 'male'), ['cm_h1_10_c01_n01_01.png']);

// glasses: the two switch tables (male T is a2_03; female T..V a2_02_c04, a2_02_c05, a2_03)
assert.equal(glassesPart(0x50, false), 'a2_01_c01'); assert.equal(glassesPart(0x52, false), 'a2_02_c02');
assert.equal(glassesPart(0x54, false), 'a2_03_c01');                             // Bakura's (male 0x54)
assert.equal(glassesPart(0x54, true), 'a2_02_c04'); assert.equal(glassesPart(0x55, true), 'a2_02_c05');
assert.equal(glassesPart(0x56, true), 'a2_03_c01');                              // Bakura's (female 0x56)
assert.equal(glassesPart(0x51, true), 'a2_02_c01');                              // Green Specs female 0x51
assert.equal(glassesPart(0x55, false), null); assert.equal(glassesPart(0x20, false), null);
const green = item('accessory', 9, [['male', 0x52], ['female', 0x51]]);
assert.deepEqual(names(green, 'male'), ['cm_a2_02_c02_n01_01.png']);
assert.deepEqual(names(green, 'female'), ['cw_a2_02_c01_n01_01.png']);
// face mark: a1_<number - 0x20>
assert.equal(faceMarkPart(0x21), 'a1_01_c01'); assert.equal(faceMarkPart(0x20), null);
assert.deepEqual(names(item('accessory', 2, [['male', 0x21]]), 'male'), ['cm_a1_01_c01_n01_01.png']);   // Plaster

// duel disks: every index of the switch (0..0x27 with the gaps at 8 and 21..31 -> the table's first, da_01_c01)
const want = { 0xb1: 'dd_01_c02', 0xb2: 'dd_01_c03', 0xb3: 'dd_02_c01', 0xb5: 'dd_02_c03', 0xb6: 'dd_02_c04', 0xb7: 'dd_03_c01',
  0xb9: 'da_01_c02', 0xba: 'da_01_c03', 0xbb: 'da_02_c01', 0xbc: 'da_02_c02', 0xbd: 'da_02_c03', 0xbe: 'da_02_c04',
  0xbf: 'da_03_c01', 0xc0: 'dd_03_c02', 0xc1: 'dd_03_c03', 0xc2: 'dd_03_c04', 0xc3: 'dd_01_c04', 0xc4: 'dd_01_c05',
  0xd0: 'da_03_c02', 0xd1: 'da_03_c03', 0xd2: 'da_03_c04', 0xd3: 'da_01_c04', 0xd4: 'da_01_c05', 0xd5: 'da_01_c06',
  0xd6: 'da_01_c07', 0xb0: 'dd_01_c01', 0xb8: 'da_01_c01' };
for (const [n, img] of Object.entries(want)) assert.equal(diskImage(+n), img, `disk 0x${(+n).toString(16)}`);

// a single-body item for the other body: its own body's art, flagged
const kaiba = item('outfit', 6, [['male', 0x7a]], { notice: 'The female version of this item is still being made.' });
assert.deepEqual(artBody(kaiba, 'female'), { body: 'male', fallback: true });
assert.deepEqual(names(kaiba, 'female'), ['cm_dc_05_c01_n01_01.png']);
assert.equal(itemArtPaths(kaiba, 'female').fallback, true);
assert.deepEqual(artBody(kaiba, 'male'), { body: 'male', fallback: false });
assert.deepEqual(itemArtPaths({ kind: 'outfit', slot: 6, variants: [] }, 'male').paths, []);
assert.deepEqual(itemArtPaths(null, 'male').paths, []);
// the kind alone (no slot) is enough for outfits, hair and disks
assert.deepEqual(names({ kind: 'dueldisk', variants: [{ gender: 'male', number: 0xb4 }] }, 'male'), ['mapdisk_dd_02_c02_01.png']);

// ---- reading: a synthetic merge.dat (KCEJYUGI directory, one plain entry, one LZSS-packed) behind a yo2Lazy stub
const swap = s => [...s].map(ch => { const c = ch === '/' ? 92 : ch.charCodeAt(0); return ((c & 15) << 4) | (c >> 4); });
const files = [['Data/Avatar/chibi/cm_dc_98_c01_n01_01.png', Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 1, 2, 3, 4, 5])],
  ['data/Map/Map_switch/Mapdisk_dd_02_c02_01.png', Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 9, 9, 9])],
  ['data/menu/other.png', Uint8Array.from([7])]];
const pack = b => { const out = []; for (let i = 0; i < b.length; i += 8) { const g = b.subarray(i, i + 8); out.push(0xff, ...g); } return Uint8Array.from(out); };   // all literals
const stored = files.map(([, b], i) => (i === 1 ? pack(b) : b));
const dirLen = 12 + files.length * 268, total = dirLen + stored.reduce((n, b) => n + b.length, 0), arc = new Uint8Array(total);
arc.set([...'KCEJYUGI'].map(c => c.charCodeAt(0)), 0);
new DataView(arc.buffer).setUint32(8, files.length, true);
let at = dirLen;
files.forEach(([name, b], i) => {
  const e = 12 + i * 268, v = new DataView(arc.buffer, e + 256, 12);
  arc.set(swap(name), e);
  v.setUint32(0, at, true); v.setUint32(4, b.length, true); v.setUint32(8, stored[i].length, true);
  arc.set(stored[i], at); at += stored[i].length;
});
const dir = parseDirectory(arc);
assert.equal(dir.size, 3);
assert.deepEqual(dir.get('data/avatar/chibi/cm_dc_98_c01_n01_01.png'), [dirLen, dirLen + 9, 9]);

const fetched = [];
globalThis.fetch = async (url, init) => {   // the archive's HTTP ranges
  const [, a, b] = /bytes=(\d+)-(\d+)/.exec(init.headers.Range);
  fetched.push([url, +a, +b + 1]);
  const body = arc.slice(+a, +b + 1);
  return { status: 206, arrayBuffer: async () => body.buffer, body: null };
};
// 1) an older runtime: no entry(); the directory fetched as a range, then each entry (the packed one unpacked here)
globalThis.Module = { yo2Lazy: { files: new Map([['game/merge.dat', { size: total, ver: '?v=abc' }]]) } };
assert.deepEqual([...await gameFile('data/avatar/chibi/cm_dc_98_c01_n01_01.png')], [...files[0][1]]);
assert.deepEqual([...await gameFile('data/map/map_switch/mapdisk_dd_02_c02_01.png')], [...files[1][1]]);
assert.equal(await gameFile('data/menu/other.png'), null);   // not a folder art.js reads
assert.ok(fetched.every(([u]) => u === 'game/merge.dat?v=abc'));
assert.ok(fetched.every(([, a, b]) => b - a < total), 'never the whole archive');
// 2) today's lazyfs: the directory from its chunks in memory (no fetch), the entry added to files2 and read by entry()
A._reset(); fetched.length = 0;
const files2 = new Map(), read = [];
globalThis.Module = { yo2Lazy: { files: new Map([['game/merge.dat', { size: total, ver: '' }]]), files2,
  pinned: new Map([['game/merge.dat#0', { data: arc, tag: 'toc' }]]), lru: new Map(),
  entry: async name => { read.push(name); const e = files2.get(name); return e ? arc.slice(e[0], e[1]) : null; } } };
const b = await gameFile('data/avatar/chibi/cm_dc_98_c01_n01_01.png');
assert.deepEqual([...b], [...files[0][1]]);
assert.deepEqual(fetched, [], 'the directory came from the chunk cache');
assert.deepEqual(read, ['data/avatar/chibi/cm_dc_98_c01_n01_01.png']);
assert.ok(files2.has('data/avatar/chibi/cm_dc_98_c01_n01_01.png'));
// 3) itemArtUrls: blob URLs, bottom first; a missing layer: none at all (the caller's placeholder)
URL.createObjectURL = blob => `blob:${blob.size}`;
assert.deepEqual(await itemArtUrls(cloak, 'male'), ['blob:9']);
assert.deepEqual(await itemArtUrls(cloak, 'female'), []);   // cw_dc_98 isn't in this archive
// no runtime at all (mock.html): nothing, no throw
globalThis.Module = undefined; A._reset();
assert.deepEqual(await itemArtUrls(suit, 'male'), []);
console.log('art_test: ok');
