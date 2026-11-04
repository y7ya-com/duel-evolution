import { existsSync, readFileSync } from 'node:fs';
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
