import { describe, expect, it } from 'vitest';
import { cardKind, cardSearchRank, parseDeckImport, serializeDeck, MAX_DECK_IMPORT_BYTES } from '../src/ui/deck';
import { categoryOf, copiesLeft, emptyKabanFilter, trunkCards } from '../src/ui/htmlui/deck';
import type { CardView } from '../src/ui/contracts';

const cards: CardView[] = [
  { id: '1', passcode: 1, name: 'Blue-Eyes White Dragon', kind: 0, type: 'Normal Monster', attribute: 'LIGHT', race: 'Dragon', level: 8, attack: 3000, defense: 2500, owned: 3 },
  { id: '2', passcode: 2, name: 'Mystic Elf', kind: 0, type: 'Normal Monster', attribute: 'LIGHT', race: 'Spellcaster', level: 4, attack: 800, defense: 2000, owned: 1 },
  { id: '3', passcode: 3, name: 'Fusion Dragon', kind: 2, attribute: 'DARK', race: 'Dragon', level: 9, attack: 4000, defense: 3000, extra: true, owned: 0 },
  { id: '4', passcode: 4, name: 'Monster Reborn', kind: 13, type: 'Spell Card', description: 'Target a monster in either Graveyard.', owned: 1 },
  { id: '5', passcode: 5, name: 'Trap Hole', kind: 14, type: 'Trap Card', owned: 1 },
];
describe('independent deck editor data operations', () => {
  it('preserves Main/Side/Fusion order and duplicates through YDK and JSON round trips', () => {
    const deck = { name: 'My Deck', main: [1, 2, 1], side: [5, 4], extra: [3] };
    expect(parseDeckImport(serializeDeck(deck, 'ydk'), deck.name)).toEqual(deck);
    expect(parseDeckImport(serializeDeck(deck, 'json'))).toEqual(deck);
    // Import is storage parsing, not local rules authority: an unowned card remains represented.
    expect(parseDeckImport('#main\n999\n999\n999\n999\n#extra\n!side', 'Imported').main).toEqual([999, 999, 999, 999]);
  });
  it('rejects oversized, malformed and ambiguous inputs before modifying an existing deck', () => {
    expect(() => parseDeckImport('x'.repeat(MAX_DECK_IMPORT_BYTES + 1))).toThrow('64 KiB');
    expect(() => parseDeckImport('#main\n-1')).toThrow();
    expect(() => parseDeckImport('#main\n4294967296')).toThrow();
    expect(() => parseDeckImport('#main\n#extra-typo\n2')).toThrow('Unknown');
    expect(() => parseDeckImport(JSON.stringify({ name: 'A', main: Array(81).fill(1) }))).toThrow('capacity');
    expect(() => parseDeckImport(JSON.stringify({ name: '../unsafe', main: [] }))).toThrow('name');
  });

  // the trunk (main's deck screen's search panel hands the filter to the editor: htmlui/deck.ts trunkCards)
  const order = (c: CardView) => c.passcode ?? 0;
  it('uses the original kind categories and applies monster-only stat ranges', () => {
    expect(cardKind(cards[2])).toBe('fusion'); expect(cardKind(cards[3])).toBe('spell');
    expect(cards.map(categoryOf)).toEqual([0, 0, 5, 2, 3]);
    const f = emptyKabanFilter(); f.cat = 0; f.level = [8];
    expect(trunkCards(cards, f, order).map(c => c.passcode)).toEqual([1]);
    f.level = []; f.atk = [3000, null]; expect(trunkCards(cards, f, order).map(c => c.passcode)).toEqual([1]);
    f.cat = 6; f.atk = [null, null]; f.attr = [0]; expect(trunkCards(cards, f, order).map(c => c.passcode)).toEqual([1, 2]);
    f.attr = []; f.race = [17]; expect(trunkCards(cards, f, order).map(c => c.passcode)).toEqual([2]);
  });
  it('preserves original fuzzy name priority, initials and description fallback', () => {
    expect(cardSearchRank(cards[0], 'BEWD')).toBe(4.5); expect(cardSearchRank(cards[0], 'blue eyes')).toBe(1);
    const f = emptyKabanFilter(); f.text = 'monster'; const result = trunkCards(cards, f, order);
    expect(result[0].passcode).toBe(4); expect(cardSearchRank(cards[3], 'either graveyard')).toBe(9);
    expect(cardSearchRank({ id: 'a', name: 'Étoile' }, 'etoile')).toBe(0);
  });
  it('keeps unowned cards out of the trunk, sorts deterministically and counts the copies left to add', () => {
    const f = emptyKabanFilter(); expect(trunkCards(cards, f, order).map(c => c.passcode)).toEqual([1, 2, 4, 5]);
    f.sort = 'atk-'; expect(trunkCards(cards, f, order).map(c => c.passcode)).toEqual([1, 2, 4, 5]);
    f.sort = 'def+'; expect(trunkCards(cards, f, order).map(c => c.passcode)).toEqual([4, 5, 2, 1]);
    f.sort = ''; f.cat = 2; expect(trunkCards(cards, f, order).map(c => c.passcode)).toEqual([4]);
    const deck = { name: 'D', main: [1, 1, 4], side: [1], extra: [] };
    expect(copiesLeft(cards[0], deck)).toBe(0); expect(copiesLeft(cards[1], deck)).toBe(1); expect(copiesLeft(cards[3], deck)).toBe(0);
  });
});
