import { expect, it } from 'vitest';
import { parsePackTables, packImagePath } from '../src/shop/packs';

const u32 = (values: number[]) => { const b = new Uint8Array(values.length * 4); const v = new DataView(b.buffer); values.forEach((x, i) => v.setUint32(i * 4, x >>> 0, true)); return b; };
const blob = (...parts: string[]) => { const offsets: number[] = []; let text = ''; for (const p of parts) { offsets.push(text.length); text += p + '\0'; } return { bytes: new TextEncoder().encode(text), offsets }; };

it('reads PACK_Prop ids/types and the language name/description and image tables by catalogue slot', () => {
  const prop = new Array(0xc1).fill(0); prop[1] = 7 | (1 << 15); prop[2] = 1001; prop[3] = 7; // slot 3 repeats id 7
  const names = blob('Pack Seven', 'Starter', 'Seven Again'), descs = blob('About seven', 'About starter', 'Again');
  const images = blob('P05-1-F1.png', 'deck\\cover.png', 'P07.png');
  const indx = new Array(0xc1 * 2).fill(0x7fffffff), indx2 = new Array(0xc1 * 2).fill(0x7fffffff);
  for (let slot = 1; slot <= 3; slot++) { indx[slot * 2] = names.offsets[slot - 1]!; indx[slot * 2 + 1] = descs.offsets[slot - 1]!; indx2[slot * 2] = images.offsets[slot - 1]!; }
  const packs = parsePackTables({ prop: u32(prop), name: names.bytes, desc: descs.bytes, indx: u32(indx), img: images.bytes, indx2: u32(indx2) });
  expect(packs.size).toBe(2);
  expect(packs.get(7)).toEqual({ id: 7, type: 0, name: 'Seven Again', description: 'Again', image: 'P07.png' });
  expect(packs.get(1001)?.name).toBe('Starter');
  expect(packImagePath('deck\\cover.png')).toBe('data/cardpack/deck/cover.png');
  expect(packImagePath('../x.png')).toBeNull();
});
