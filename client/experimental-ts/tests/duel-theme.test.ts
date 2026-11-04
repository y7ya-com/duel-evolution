import { existsSync, readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { fieldAudioSlotForPasscode, fieldThemeKind, fieldThemeKindForPasscode } from '../src/duel/theme';

describe('original field identity to scene theme conversion', () => {
  it('distinguishes internal card identity from passcode/legacy index and preserves unknown metadata', () => {
    const identities = new Map([[100, 0x10f0], [200, 0x18ff], [300, 0x14d1], [400, 0x7fff]]);
    const lookup = (pc: number) => identities.get(pc);
    expect(fieldAudioSlotForPasscode(100, 17, lookup)).toBe(34);
    expect(fieldAudioSlotForPasscode(200, 17, lookup)).toBe(44);
    expect(fieldAudioSlotForPasscode(300, 17, lookup)).toBe(45);
    expect(fieldAudioSlotForPasscode(400, 17, lookup)).toBe(17); // Known original-unrecognized identity => source kind zero.
    expect(fieldAudioSlotForPasscode(999, 17, lookup)).toBe(null);
    expect(fieldThemeKind(100)).toBe(0); expect(fieldThemeKind(0x10f0)).toBe(1);
    expect(fieldThemeKindForPasscode(0, () => { throw new Error('No lookup for field removal'); })).toBe(0);
    for (const n of [-1, 1.5, NaN, 0x10000]) expect(() => fieldThemeKind(n)).toThrow();
  });
  it('covers the full original 38 field kinds once, including the two reversed branches', () => {
    const kinds = Array.from({ length: 0x10000 }, (_, id) => fieldThemeKind(id)).filter(Boolean);
    expect(kinds).toHaveLength(38); expect(new Set(kinds).size).toBe(38);
    expect(fieldThemeKind(0x1a66)).toBe(27); expect(fieldThemeKind(0x1a67)).toBe(26);
    expect(fieldThemeKind(0x1dc8)).toBe(37); expect(fieldThemeKind(0x1dca)).toBe(38); expect(fieldThemeKind(0x1dcb)).toBe(36);
  });
});

const exePath = '/tmp/de-startup-yo2.exe';
describe.skipIf(!existsSync(exePath))('private original executable static field evidence', () => {
  it('confirms view7 and both field switch tables without executing the executable', () => {
    const bytes = readFileSync(exePath);
    expect(createHash('sha256').update(bytes).digest('hex')).toBe('d25d4b135602eafe9db1a709ac5d2367295ba1dad084366d37a1a7577021e613');
    const word = (address: number) => bytes.readUInt32LE(address - 0x400000);
    const target = (address: number) => address + 5 + bytes.readInt32LE(address - 0x400000 + 1);
    expect(word(0x741b80 + 6 * 4)).toBe(0x73e51f);
    expect(target(0x73e527)).toBe(0x4064dd); expect(target(0x4064dd)).toBe(0x704100);
    // Static return-immediate values at each table target, independent of the TS range implementation.
    for (const [table, first] of [[0x7042ec, 0x10f0], [0x704304, 0x1344]]) {
      for (let i = 0; i < 6; i++) expect(fieldThemeKind(first + i)).toBe(word(word(table + i * 4) + 1));
    }
    // Direct compare branches and their return values; records are static instruction operand locations.
    for (const [cmp, ret] of [[0x704104, 0x704146], [0x70414c, 0x70418e], [0x704194, 0x704251], [0x7041a5, 0x704204],
      [0x7041ae, 0x7041e0], [0x7041e6, 0x7041fe], [0x7041ed, 0x7041f8], [0x70420a, 0x704231],
      [0x704213, 0x70422b], [0x70421a, 0x704225], [0x704257, 0x7042a1], [0x704260, 0x704283],
      [0x704269, 0x70427d], [0x704270, 0x704277], [0x7042a7, 0x7042ca], [0x7042b0, 0x7042c4], [0x7042b7, 0x7042be]]) {
      expect(fieldThemeKind(word(cmp + 1))).toBe(word(ret + 1));
    }
    expect(fieldThemeKind(word(0x7041b8))).toBe(word(0x7041db)); // sub eax,0x14d1 -> kind15
    expect(fieldThemeKind(word(0x7041b8) + bytes[0x7041c0 - 0x400000])).toBe(word(0x7041d5));
  });
});
