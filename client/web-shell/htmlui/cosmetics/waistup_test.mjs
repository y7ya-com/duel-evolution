// node client/web-shell/htmlui/cosmetics/waistup_test.mjs: the waist-up bust's compositor (cosmetics/waistup.js) on
// synthetic tables (waistup_fixture.mjs): the CSV as CWADictionary::load reads it, then the layer list of known looks
// as CWaistUpAvatar's part loop builds it (the order, the colour columns, the pose's pictures, the hood / bald / afro
// rules, the "****" gaps, the disk's 0xb0 fallback), and the TexMaker's blend. With WU_DIR=<a folder holding the
// game's wm_data.csv / ww_data.csv> it checks the real tables too. Exit 1 on the first failure.
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { parseWaistUp, waistUpLayers, lookBytes, blendInto, STEP_NAMES, BUST, CANVAS } from './waistup.js';
import { WM_CSV, WW_CSV } from './waistup_fixture.mjs';

const M = parseWaistUp(WM_CSV), F = parseWaistUp(WW_CSV);
// the reader: comments and blank lines skipped, CRLF dropped, "****" kept as a name, the rect as numbers
assert.equal(M.length, 28);
assert.deepEqual(M[0], { kind: 0, number: 144, images: ['wm_h2_01_c01.png', 'wm_h2_01_c02.png', 'wm_h2_01_c03.png', 'wm_h2_01_c04.png',
  'wm_h2_01_c05.png', 'wm_h2_01_c06.png', 'wm_h2_01_c07.png'], rect: [0, 160, 768, 160] });
assert.deepEqual(M.find(r => r.kind === 1 && r.number === 0).images.slice(2, 4), ['wm_bo_01_c03_r.png', '****']);
assert.equal(STEP_NAMES.length, 13);
assert.equal(CANVAS, 768);
assert.ok(BUST[0] >= 0 && BUST[0] + BUST[2] <= CANVAS && BUST[3] === CANVAS, 'the bust crop inside the canvas');

const names = (rows, parts, o) => waistUpLayers(rows, parts, o).map(l => l.image.replace(/\.png$/, ''));
const steps = (rows, parts, o) => waistUpLayers(rows, parts, o).map(l => l.step);

// a male Domino look: Afro I (FRONT_HAIR 10: its own back hair, kind 0 row 10), Black Suit (0x77), Sunglasses (0x50),
// Alpha Gold (0xb4), skin c01 / hair c01 / eyes c01: the thirteen steps bottom first, the face mark none (0x20 "****")
const domino = [0, 0xa, 0x20, 0x30, 0x40, 0x60, 0x77, 0x90, 0xb4, 0x50, 0, 0, 0, 0, 0, 0];
assert.deepEqual(names(M, domino), ['wm_h2_11_c01', 'wm_bo_01_c01_r', 'wm_hs_11_c01', 'wm_es_01_01_c01', 'wm_mo_01_01_c01',
  'wm_ey_01_01_c01', 'wm_no_01_c01', 'wm_eb_01_01_c01', 'wm_a2_01_c01', 'wm_dc_03_c01_r', 'wm_h1_11_c01', 'wm_dd_02_c02_r']);
assert.deepEqual(steps(M, domino), [0, 1, 2, 3, 4, 5, 6, 7, 9, 10, 11, 12]);
// each layer at its row's rect: the picture from 0, 0 to the rect's x, y, the rect's size
assert.deepEqual(waistUpLayers(M, domino).find(l => l.step === 12), { step: 12, kind: 12, number: 0xb4, image: 'wm_dd_02_c02_r.png',
  path: 'data/avatar/wu/wm_dd_02_c02_r.png', x: 0, y: 360, w: 768, h: 344 });
// Select Player's pose (1): the body's row 1 and the second picture of the clothes, glasses (the same here) and disk
assert.deepEqual(names(M, domino, { pose: 1 }).filter(n => /_[rl]$/.test(n)), ['wm_bo_01_c01_l', 'wm_dc_03_c01_l', 'wm_dd_02_c02_l']);
// an Academy look: the default hair (0: back hair from BACK_HAIR 0x90), Jaden's (0x87), the Academy disk (0xb8),
// no glasses (0x20 skips the step)
const academy = [0, 0, 0x20, 0x30, 0x40, 0x60, 0x87, 0x90, 0xb8, 0x20, 0, 0, 0, 0, 0, 0];
assert.deepEqual(names(M, academy), ['wm_h2_01_c01', 'wm_bo_01_c01_r', 'wm_hs_01_c01', 'wm_es_01_01_c01', 'wm_mo_01_01_c01',
  'wm_ey_01_01_c01', 'wm_no_01_c01', 'wm_eb_01_01_c01', 'wm_ac_08_c01_r', 'wm_h1_01_c01', 'wm_da_01_c01_r']);
// glasses 0 is "none" as 0x20 is (the exe sets it to 0x20)
assert.deepEqual(names(M, [...academy.slice(0, 9), 0, ...academy.slice(10)]), names(M, academy));
// colours: skin (13) picks the body / hair shade / eye shade / mouth / nose picture, hair (14) the hair and eyebrows,
// eyes (15) the eyes; a colour with no picture ("****": skin c04) draws nothing
const coloured = [...academy.slice(0, 13), 2, 3, 6];
assert.deepEqual(names(M, coloured), ['wm_h2_01_c04', 'wm_bo_01_c03_r', 'wm_hs_01_c03', 'wm_es_01_01_c03', 'wm_mo_01_01_c03',
  'wm_ey_01_01_c07', 'wm_no_01_c03', 'wm_eb_01_01_c04', 'wm_ac_08_c01_r', 'wm_h1_01_c04', 'wm_da_01_c01_r']);
assert.ok(!names(M, [...academy.slice(0, 13), 3, 0, 0]).some(n => n.startsWith('wm_bo')), 'skin c04: no body picture');
// a hood (0x78): no back hair, no hair shade, the front hair is the hood's own row (clothes' number)
const hood = [0, 0xa, 0x20, 0x30, 0x40, 0x60, 0x78, 0x90, 0xb0, 0x20, 0, 0, 0, 0, 4, 0];
assert.deepEqual(names(M, hood), ['wm_bo_01_c01_r', 'wm_es_01_01_c01', 'wm_mo_01_01_c01', 'wm_ey_01_01_c01', 'wm_no_01_c01',
  'wm_eb_01_01_c05', 'wm_dc_99_c01_r', 'wm_h1_99_c01', 'wm_dd_01_c01_r']);
// the shaved head (male FRONT_HAIR 6): no back hair, hair shade or front hair; the face mark (0x21) on
const bald = [0, 6, 0x21, 0x30, 0x40, 0x60, 0x70, 0x90, 0xb0, 0x20, 0, 0, 0, 0, 0, 0];
assert.deepEqual(names(M, bald), ['wm_bo_01_c01_r', 'wm_es_01_01_c01', 'wm_mo_01_01_c01', 'wm_ey_01_01_c01', 'wm_no_01_c01',
  'wm_eb_01_01_c01', 'wm_a1_01_c01', 'wm_dc_01_c01_r', 'wm_dd_01_c01_r']);
// a disk number with no row: the Battle City model (0xb0), as the exe falls back; a byte with no row (NOSE 0): the
// default nose (0x30), marked
assert.equal(names(M, [...domino.slice(0, 8), 0xc5, ...domino.slice(9)]).at(-1), 'wm_dd_01_c01_r');
const noNose = waistUpLayers(M, [0, 0, 0x20, 0, 0x40, 0x60, 0x70, 0x90, 0xb0, 0x20, 0, 0, 0, 0, 0, 0]).find(l => l.step === 6);
assert.deepEqual([noNose.image, noNose.fallback], ['wm_no_01_c01.png', true]);

// female: her own table; an afro (FRONT_HAIR 5: back hair row 5); the ponytail (8) takes back hair row 8, "****"
const her = [1, 5, 0x20, 0x30, 0x40, 0x60, 0x74, 0x90, 0xb4, 0x50, 0, 0, 0, 1, 2, 3];
assert.deepEqual(names(F, her), ['ww_h2_06_c03', 'ww_bo_01_c02_r', 'ww_hs_06_c02', 'ww_es_01_01_c02', 'ww_mo_01_01_c02',
  'ww_ey_01_01_c04', 'ww_no_01_c02', 'ww_eb_01_01_c01', 'ww_a2_01_c01', 'ww_dc_03_c01_r', 'ww_h1_06_c03', 'ww_dd_02_c02_r']);
assert.ok(!names(F, [1, 8, ...her.slice(2)]).some(n => n.startsWith('ww_h2')), 'the ponytail: no back hair picture');
assert.ok(names(F, [1, 8, ...her.slice(2)]).includes('ww_h1_09_c03'));
// her hoods are 0x75 / 0x77; 0x78 is no hood for her (and FRONT_HAIR 6 is no shaved head)
assert.deepEqual(names(F, [1, 0, 0x20, 0x30, 0x40, 0x60, 0x75, 0x90, 0xb0, 0x20]).filter(n => /h[12s]_/.test(n)), ['ww_h1_99_c01']);
// try-on: one byte changed, one layer changed (the Wardrobe's preview)
const tried = [...domino]; tried[6] = 0x70;
const a = names(M, domino), b = names(M, tried);
assert.deepEqual(a.map((n, i) => n === b[i] ? '' : `${n}>${b[i]}`).filter(Boolean), ['wm_dc_03_c01_r>wm_dc_01_c01_r']);

// the look: 16 bytes, a missing / short look the default one of the body and world; gender wins over byte 0
assert.deepEqual(lookBytes(null, { gender: 'female', world: 1 }), [1, 0, 0x20, 0x30, 0x40, 0x60, 0x80, 0x90, 0xb8, 0x20, 0, 0, 0, 0, 0, 0]);
assert.deepEqual(lookBytes(domino.slice(0, 10)).length, 16);
assert.equal(lookBytes(domino, { gender: 'female' })[0], 1);

// the TexMaker's blend: colour = dst (1 - a) + src a, alpha the larger; transparent source pixels skipped; clipped
const dst = new Uint8ClampedArray(4 * 4 * 4);
dst.set([100, 100, 100, 200], 0);
const src = { width: 2, height: 1, data: new Uint8ClampedArray([200, 0, 50, 51, 9, 9, 9, 0]) };
blendInto(dst, 4, src, { x: 0, y: 0, w: 2, h: 1 });
assert.deepEqual([...dst.slice(0, 8)], [120, 80, 90, 200, 0, 0, 0, 0]);
blendInto(dst, 4, { width: 1, height: 1, data: new Uint8ClampedArray([255, 255, 255, 255]) }, { x: 3, y: 3, w: 2, h: 2 });
assert.deepEqual([...dst.slice(60, 64)], [255, 255, 255, 255]);
blendInto(dst, 4, { width: 1, height: 1, data: new Uint8ClampedArray([1, 2, 3, 128]) }, { x: 0, y: 3, w: 1, h: 1 });
assert.deepEqual([...dst.slice(48, 52)], [1, 1, 2, 128]);   // over transparent black: the colour darkened, its own alpha

// the game's own tables, when given
const dir = process.env.WU_DIR;
if (dir && existsSync(`${dir}/wm_data.csv`)) {
  const RM = parseWaistUp(readFileSync(`${dir}/wm_data.csv`, 'latin1')), RF = parseWaistUp(readFileSync(`${dir}/ww_data.csv`, 'latin1'));
  assert.ok(RM.length > 100 && RF.length > 90);
  assert.deepEqual(names(RM, domino), names(M, domino), 'the synthetic rows name what the game\'s do');
  assert.equal(names(RF, her).length, 12);
  for (const rows of [RM, RF]) for (const r of rows) assert.ok(r.kind >= 0 && r.kind <= 12 && r.rect[0] + r.rect[2] <= 768 && r.rect[1] + r.rect[3] <= 768);
  console.log('waistup_test: the game\'s tables too');
}
console.log('waistup_test: ok');
