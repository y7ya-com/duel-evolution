import { describe, expect, it } from 'vitest';
import { CardDetailsCatalog, decodeLegacyDeck, encodeLegacyDeck, LEGACY_DECK_BYTES } from '../src/cards';

// Synthetic metadata and byte fixtures only; no extracted game data.
const rows = [
  { passcode: 100001, legacyId: 1, internalId: 5001, name: 'Synthetic A', description: 'Synthetic description', effectTexts: ['Synthetic prompt'], raceBits: '18446744073709551615', limit: 2 },
  { passcode: 100002, legacyId: 258, internalId: 5002, name: 'Synthetic B', attack: -2 },
  { passcode: 501000005, legacyId: 4095, internalId: 5003, name: 'Synthetic C' },
];
const catalog = () => { const c = new CardDetailsCatalog(); c.install(rows); return c; };
describe('card detail identity and bounded atomic installation', () => {
  it('distinguishes file IDs, internal identifiers and passcodes', () => {
    const c = catalog();
    expect(c.size).toBe(3); expect(c.passcodeForId(258)).toBe(100002);
    expect(c.passcodeForId(5002)).toBeUndefined(); expect(c.idForPasscode(100002)).toBe(258);
    expect(c.get(100002)?.internalId).toBe(5002); expect(c.get(99)).toBeUndefined();
  });
  it('does not invent missing descriptions or limits', () => {
    expect(catalog().get(100002)?.description).toBeUndefined();
    expect(catalog().get(100002)?.limit).toBeUndefined();
  });
  it.each([
    { passcode: 0 }, { passcode: 1.5 }, { passcode: 0x100000000 }, { legacyId: 0 }, { legacyId: 4096 },
    { internalId: -1 }, { name: '' }, { name: 'x'.repeat(513) }, { description: 123 },
    { description: 'x'.repeat(32769) }, { descriptionSource: 'invented' }, { effectTexts: Array(17).fill('x') },
    { effectTexts: [123] }, { raceBits: '18446744073709551616' }, { raceBits: '-1' }, { raceBits: '01' },
    { typeBits: -1 }, { attributeBits: NaN }, { level: 256 }, { attack: -3 }, { defense: 1.2 },
    { limit: 65535 }, { extra: 1 }, { deckAllowed: false, limit: 1 },
  ])('rejects malformed metadata atomically: %j', change => {
    const c = catalog(); expect(() => c.install([{ ...rows[0], ...change }])).toThrow();
    expect(c.size).toBe(3); expect(c.get(100001)?.name).toBe('Synthetic A');
  });
  it('rejects duplicate mappings and bounds card count', () => {
    for (const dup of [{ ...rows[1], passcode: rows[0].passcode }, { ...rows[1], legacyId: rows[0].legacyId }]) {
      expect(() => catalog().install([rows[0], dup])).toThrow('Ambiguous');
    }
    expect(() => catalog().install(new Array(100001))).toThrow();
  });
  it('takes an immutable copy and drops unrecognized fields', () => {
    const input = [{ ...rows[0], effectTexts: ['Initial'], unrelated: 'drop' }];
    const c = new CardDetailsCatalog(); c.install(input); input[0].effectTexts[0] = 'Changed';
    expect(c.get(100001)?.effectTexts).toEqual(['Initial']);
    expect(Object.isFrozen(c.get(100001))).toBe(true); expect(Object.isFrozen(c.get(100001)?.effectTexts)).toBe(true);
    expect(c.get(100001)).not.toHaveProperty('unrelated');
  });
});

describe('verified native .ydc record', () => {
  it('decodes independent 250-byte fixture with LE IDs and exact section offsets', () => {
    const bytes = new Uint8Array(250);
    // Main ID 0x0102, side ID 1, extra ID 0x0fff. Holes are valid vacancies.
    bytes[2] = 2; bytes[3] = 1; bytes[160] = 1; bytes[190] = 255; bytes[191] = 15;
    expect(decodeLegacyDeck(bytes, catalog())).toEqual({ main: [100002], side: [100001], extra: [501000005] });
  });
  it('encodes exact raw record, preserving copies and order', () => {
    const deck = { main: [100002, 100001, 100002], side: [501000005], extra: [100001] };
    const bytes = encodeLegacyDeck(deck, catalog());
    expect(bytes.length).toBe(LEGACY_DECK_BYTES);
    expect([...bytes.slice(0, 8)]).toEqual([2, 1, 1, 0, 2, 1, 0, 0]);
    expect([...bytes.slice(160, 164)]).toEqual([255, 15, 0, 0]);
    expect([...bytes.slice(190, 194)]).toEqual([1, 0, 0, 0]);
    expect(decodeLegacyDeck(bytes.buffer, catalog())).toEqual(deck);
  });
  it('uses the supplied byte view offset and accepts all storage slots', () => {
    const deck = { main: Array(80).fill(100001), side: Array(15).fill(100002), extra: Array(30).fill(501000005) };
    const buffer = new Uint8Array(300); buffer.set(encodeLegacyDeck(deck, catalog()), 13);
    expect(decodeLegacyDeck(buffer.subarray(13, 263), catalog())).toEqual(deck);
  });
  it.each([0, 249, 251, 10000])('rejects malformed size %i', size => {
    expect(() => decodeLegacyDeck(new Uint8Array(size), catalog())).toThrow('exactly 250');
  });
  it.each([2, 4096, 65535])('rejects unknown or out-of-range legacy ID %i', id => {
    const bytes = new Uint8Array(250); new DataView(bytes.buffer).setUint16(0, id, true);
    expect(() => decodeLegacyDeck(bytes, catalog())).toThrow();
  });
  it.each([0, -1, NaN, 1.1, 999999, 0x100000000])('rejects invalid/unknown passcode %s', passcode => {
    expect(() => encodeLegacyDeck({ main: [passcode], side: [], extra: [] }, catalog())).toThrow();
  });
  it.each([['main', 81], ['side', 16], ['extra', 31]] as const)('rejects excess %s capacity', (section, count) => {
    expect(() => encodeLegacyDeck({ main: [], side: [], extra: [], [section]: Array(count).fill(100001) }, catalog())).toThrow('capacity');
  });
  it('rejects non-reciprocal mappings rather than exporting a different card', () => {
    const bad = { idForPasscode: () => 1, passcodeForId: () => 100002 };
    expect(() => encodeLegacyDeck({ main: [100001], side: [], extra: [] }, bad)).toThrow('ambiguous');
    const bytes = new Uint8Array(250); bytes[0] = 2;
    expect(() => decodeLegacyDeck(bytes, bad)).toThrow('ambiguous');
  });
});
