import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { decodeOriginalCardTextTables, OriginalCardTextCatalog } from '../src/cards/original-text';
import type { OriginalTextTables } from '../src/cards/original-text';
import { buildOriginalCardTexts } from '../tools/card-text.mjs';

const wide = (s: string) => new Uint8Array(Buffer.from(s, 'utf16le'));
function tables(): OriginalTextTables {
  const properties = new Uint8Array(24), index = new Uint8Array(32);
  const p = new DataView(properties.buffer), offsets = new DataView(index.buffer);
  p.setUint32(8, 3001 | 0xf0000000, true); p.setUint32(16, 3001, true);
  for (const row of [1, 2]) { offsets.setUint32(row * 8, 2, true); offsets.setUint32(row * 8 + 4, 2, true); }
  return { properties, index, names: wide('\0Synthetic Ü name\0'), descriptions: wide('\0First rule.\r\nSecond rule ⚔.\0') };
}
const data = () => ({ v: 1, language: 'E', source: 'merge.dat/CARD_Desc_E', cards: [{ passcode: 123, internalId: 3001, name: 'Synthetic card', description: 'First rule.\r\nSecond rule.' }], missingInternalIds: [14337] });

describe('original archive rules text decoder', () => {
  it('uses both indexed UTF-16LE strings and low 14-bit property identity, merging matching artwork rows', () => {
    const out = decodeOriginalCardTextTables(tables());
    expect(out.size).toBe(1); expect(out.get(3001)).toEqual({ name: 'Synthetic Ü name', description: 'First rule.\r\nSecond rule ⚔.' });
  });
  it.each(['odd-offset', 'past-end', 'unterminated', 'invalid-utf16', 'short-index', 'odd-property', 'conflicting-alias'] as const)('rejects %s without reading beyond the table', kind => {
    const t = tables(), offsets = new DataView(t.index.buffer);
    if (kind === 'odd-offset') offsets.setUint32(12, 3, true);
    if (kind === 'past-end') offsets.setUint32(12, t.descriptions.length, true);
    if (kind === 'unterminated') t.descriptions = t.descriptions.slice(0, -2);
    if (kind === 'invalid-utf16') { t.descriptions[2] = 0; t.descriptions[3] = 0xd8; }
    if (kind === 'short-index') t.index = t.index.slice(0, 16);
    if (kind === 'odd-property') t.properties = t.properties.slice(0, -1);
    if (kind === 'conflicting-alias') offsets.setUint32(20, 4, true);
    expect(() => decodeOriginalCardTextTables(t)).toThrow();
  });
  it('maps artwork passcodes through internal IDs and explicitly reports absent server extensions', () => {
    const result = buildOriginalCardTexts(tables(), [{ pc: 123, internal: 3001 }, { pc: 456, internal: 3001 }, { pc: 789, internal: 14337 }]);
    expect(result.cards.map((c: { passcode: number }) => c.passcode)).toEqual([123, 456]);
    expect(result.cards[0].description).toBe(result.cards[1].description);
    expect(result.missingInternalIds).toEqual([14337]);
    expect(() => buildOriginalCardTexts(tables(), [{ pc: 123, internal: 3001 }, { pc: 123, internal: 3001 }])).toThrow(/Ambiguous/);
  });
});

describe('original text catalog install', () => {
  it('retains exact original wording, provenance and immutable records', () => {
    const cat = new OriginalCardTextCatalog(), source = data(); cat.install(source);
    source.cards[0].description = 'Changed'; source.missingInternalIds.push(14338);
    expect(cat.get(123)?.description).toBe('First rule.\r\nSecond rule.');
    expect(cat.language).toBe('E'); expect(cat.source).toBe('merge.dat/CARD_Desc_E');
    expect(cat.size).toBe(1); expect(cat.entries[0]).toBe(cat.get(123)); expect(Object.isFrozen(cat.get(123))).toBe(true);
    expect(cat.missingInternalIds).toEqual([14337]);
  });
  it('rejects malformed/unproven/ambiguous datasets atomically', () => {
    const cat = new OriginalCardTextCatalog(); cat.install(data());
    const valid = data();
    for (const bad of [null, { ...valid, v: 2 }, { ...valid, language: 'J' }, { ...valid, source: 'effect prompts' },
      { ...valid, cards: [...valid.cards, ...valid.cards] }, { ...valid, cards: [{ ...valid.cards[0], description: '' }] },
      { ...valid, cards: [{ ...valid.cards[0], passcode: -1 }] }, { ...valid, missingInternalIds: [3001] },
      { ...valid, missingInternalIds: [14337, 14337] }]) expect(() => cat.install(bad)).toThrow();
    expect(cat.size).toBe(1); expect(cat.get(123)?.name).toBe('Synthetic card');
  });
});

const generated = process.env.DE_CARD_TEXTS ?? resolve(import.meta.dirname, '../public/card-texts.json');
describe.skipIf(!existsSync(generated))('private generated original rules corpus', () => {
  it('resolves original English descriptions through the exact original internal identity mapping', () => {
    const cat = new OriginalCardTextCatalog(); cat.install(JSON.parse(readFileSync(generated, 'utf8')));
    const original = JSON.parse(readFileSync(resolve(import.meta.dirname, '../../../server/gamedata/cards.json'), 'utf8'));
    expect(cat.size).toBe(3243); expect(cat.missingInternalIds).toHaveLength(16);
    for (const c of original) {
      const value = cat.get(c.pc);
      if (value) { expect(value.internalId).toBe(c.internal); expect(value.description.trim()).not.toBe(''); }
      else expect(cat.missingInternalIds).toContain(c.internal);
    }
    // Distinct art identities share one original rule string rather than fabricated effect text.
    const aliases = original.filter((c: { internal: number }) => c.internal === original.find((c: { internal: number }, i: number) => original.some((x: { internal: number }, j: number) => j !== i && x.internal === c.internal)).internal);
    expect(new Set(aliases.map((c: { pc: number }) => cat.get(c.pc)?.description)).size).toBe(1);
  });
});
