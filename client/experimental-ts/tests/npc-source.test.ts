import { existsSync, readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { expect, it } from 'vitest';

// Optional original executable evidence. Static reads only; never execute the PE.
const path = process.env.YO2_ORIGINAL_EXE ?? '/tmp/de-startup-yo2.exe';
it.skipIf(!existsSync(path))('original AreaMap onInit requests ITEMGET(1,0) through the exact lobby method', () => {
  const bytes = readFileSync(path); expect(bytes.length).toBeLessThan(16 * 1024 * 1024); expect(bytes.toString('ascii', 0, 2)).toBe('MZ');
  const pe = bytes.readUInt32LE(0x3c); expect(bytes.toString('ascii', pe, pe + 4)).toBe('PE\0\0'); expect(bytes.readUInt16LE(pe + 24)).toBe(0x10b);
  const imageBase = bytes.readUInt32LE(pe + 52), sectionTable = pe + 24 + bytes.readUInt16LE(pe + 20), sections = bytes.readUInt16LE(pe + 6);
  const offset = (address: number): number => {
    const rva = address - imageBase;
    for (let i = 0; i < sections; i++) { const s = sectionTable + i * 40, va = bytes.readUInt32LE(s + 12), size = bytes.readUInt32LE(s + 16); if (rva >= va && rva < va + size) return bytes.readUInt32LE(s + 20) + rva - va; }
    throw Error('Address outside static file sections');
  };
  const u32 = (address: number) => bytes.readUInt32LE(offset(address));
  const jump = (address: number) => { const o = offset(address); expect(bytes[o]).toBe(0xe9); return address + 5 + bytes.readInt32LE(o + 1); };
  const call = (address: number) => { const o = offset(address); expect(bytes[o]).toBe(0xe8); return address + 5 + bytes.readInt32LE(o + 1); };
  // CTask notify/dtor/receive, then CEasyTask::onInit (slot3).
  expect(u32(0xbf0e60 + 3 * 4)).toBe(0x40eaca); expect(jump(0x40eaca)).toBe(0x9fcca0);
  const locator = u32(0xbf0e5c), type = u32(locator + 12), name = offset(type + 8); expect(bytes.toString('ascii', name, bytes.indexOf(0, name))).toBe('.?AVCAreaMapScene@@');
  // The world initializer's sole ITEMGET site pushes param0 then kind1.
  expect(bytes.subarray(offset(0x9fdba6), offset(0x9fdbaa)).toString('hex')).toBe('6a006a01');
  expect(call(0x9fdbb0)).toBe(0x40a317); expect(jump(0x40a317)).toBe(0x6cf000);
  expect(bytes.subarray(offset(0x6cf000), offset(0x6cf000) + 192).toString('hex')).toContain('6804520000');
});
it.skipIf(!existsSync(path))('original duelResultLine inputs, categories and thresholds match the static PE', () => {
  const bytes = readFileSync(path), pe = bytes.readUInt32LE(0x3c);
  const imageBase = bytes.readUInt32LE(pe + 52), sectionTable = pe + 24 + bytes.readUInt16LE(pe + 20);
  const text = { va: bytes.readUInt32LE(sectionTable + 12), size: bytes.readUInt32LE(sectionTable + 16), raw: bytes.readUInt32LE(sectionTable + 20) };
  const offset = (address: number) => { const rva = address - imageBase; if (rva < text.va || rva >= text.va + text.size) throw Error('Outside .text'); return text.raw + rva - text.va; };
  const hex = (address: number, n: number) => bytes.subarray(offset(address), offset(address) + n).toString('hex');
  const u32 = (address: number) => bytes.readUInt32LE(offset(address));
  const jump = (address: number) => { expect(bytes[offset(address)]).toBe(0xe9); return address + 5 + bytes.readInt32LE(offset(address) + 1); };
  // CNpcListMenu::openAfterDuel calls the line selector through its thunk.
  expect(hex(0x89fd2b, 1)).toBe('e8'); expect(0x89fd2b + 5 + bytes.readInt32LE(offset(0x89fd2b) + 1)).toBe(0x411298); expect(jump(0x411298)).toBe(0x7918c0);
  // Inputs: turn, LP gauge snapshots (side0/side1), engine P1/P0 deckCount, category, then g_matchResult.
  expect(hex(0x7918c0, 0x21)).toBe('a1d4c22c01' + '8b0db4902a01' + '8b15b8902a01' + '53' + '8b1d9c962c01' + '56' + '8d7001' + 'a1b0902a01');
  expect(hex(0x7918e2, 6)).toBe('8b3d90882c01'); expect(hex(0x7918f7, 5)).toBe('a1d082cd00');
  // Whole function body (branch order, 1000/2000/3000/5000 LP, 10 cards, 10/25 turns, lines 0x22..0x40).
  expect(createHash('sha256').update(bytes.subarray(offset(0x7918c0), offset(0x791ae4))).digest('hex')).toBe('158b1fc9cc1e96f72449670c117e11ce457964f5f05ef3652b6b36f04592ef21');
  // CDuelScene destructor copies the LP gauges' values (+0xa9c + side*0x44, +0x28); the gauge setter clamps at zero.
  expect(hex(0x793591, 0x0b)).toBe('8b86c40a0000a3b4902a01'); expect(hex(0x79359c, 6)).toBe('8b86080b0000'); expect(hex(0x7935b0, 5)).toBe('a3b8902a01');
  expect(hex(0x7cef90, 0x14)).toBe('8b44240433d285c00f9cc24a23d0895128c20400');
  // Scene view switch: views 0x3b / 0x3c; 0x3b's reason table (reasons 3..10) and the category stores.
  expect([u32(0x741b80 + 0x3a * 4), u32(0x741b80 + 0x3b * 4)]).toEqual([0x740b2f, 0x740cf1]);
  expect(Array.from({ length: 8 }, (_, i) => u32(0x741d08 + i * 4))).toEqual([0x740b49, 0x741070, 0x741070, 0x741070, 0x740be3, 0x741070, 0x740b49, 0x740c5a]);
  expect([hex(0x740b4e, 10), hex(0x740be5, 10), hex(0x740c5c, 10), hex(0x740d5c, 10)]).toEqual(['c705b0902a0101000000', 'c705b0902a0103000000', 'c705b0902a0103000000', 'c705b0902a0102000000']);
  // The category global is never cleared: only these twelve references exist, all stores of 1..3 or the reader.
  const body = bytes.subarray(text.raw, text.raw + text.size), needle = Buffer.from('b0902a01', 'hex'), refs: number[] = [];
  for (let i = body.indexOf(needle); i >= 0; i = body.indexOf(needle, i + 1)) refs.push(imageBase + text.va + i);
  expect(refs).toEqual([0x740b50, 0x740be7, 0x740c5e, 0x740d5e, 0x74967f, 0x749715, 0x7497fc, 0x74ec29, 0x74ecbb, 0x74ed51, 0x74ee51, 0x7918dd]);
});
