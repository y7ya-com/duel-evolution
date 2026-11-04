import { describe, expect, it } from 'vitest';
import { cardKind, cardSearchRank, deckCollection, defaultDeckFilters, parseDeckImport, reorderDeckCards, serializeDeck, MAX_DECK_IMPORT_BYTES } from '../src/ui/deck';
import type { CardView } from '../src/ui/contracts';

const cards: CardView[] = [
  { id: '1', passcode: 1, name: 'Blue-Eyes White Dragon', kind: 0, type: 'Normal Monster', attribute: 'LIGHT', race: 'Dragon', level: 8, attack: 3000, defense: 2500, owned: 3 },
  { id: '2', passcode: 2, name: 'Mystic Elf', kind: 0, type: 'Normal Monster', attribute: 'LIGHT', race: 'Spellcaster', level: 4, attack: 800, defense: 2000, owned: 1 },
  { id: '3', passcode: 3, name: 'Fusion Dragon', kind: 2, attribute: 'DARK', race: 'Dragon', level: 9, attack: 4000, defense: 3000, extra: true, owned: 0 },
  { id: '4', passcode: 4, name: 'Monster Reborn', kind: 13, description: 'Target a monster in either Graveyard.', owned: 1 },
  { id: '5', passcode: 5, name: 'Trap Hole', kind: 14, owned: 1 },
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
  it('reorders duplicate copies by index without changing card counts or the input', () => {
    const before = [1, 2, 1, 3]; expect(reorderDeckCards(before, 0, 3)).toEqual([2, 1, 3, 1]); expect(before).toEqual([1, 2, 1, 3]);
    expect(() => reorderDeckCards(before, 4, 0)).toThrow('position');
  });
  it('uses the original kind categories and applies monster-only stat ranges', () => {
    expect(cardKind(cards[2])).toBe('fusion'); expect(cardKind(cards[3])).toBe('spell');
    const f = defaultDeckFilters(); f.type = 'monster'; f.level = [5, 12];
    expect(deckCollection(cards, f).map(c => c.passcode)).toEqual([1]);
    f.ownedOnly = false; f.attack = ['3000', '']; expect(deckCollection(cards, f).map(c => c.passcode)).toEqual([3, 1]);
    f.type = 'all'; f.attributes = ['LIGHT']; expect(deckCollection(cards, f).map(c => c.passcode)).toEqual([1]);
    f.level = [0, 12]; f.attack = ['', '']; f.race = 'Spellcaster'; expect(deckCollection(cards, f).map(c => c.passcode)).toEqual([2]);
  });
  it('preserves original fuzzy name priority, initials and description fallback', () => {
    expect(cardSearchRank(cards[0], 'BEWD')).toBe(4.5); expect(cardSearchRank(cards[0], 'blue eyes')).toBe(1);
    const f = defaultDeckFilters(); f.query = 'monster'; const result = deckCollection(cards, f);
    expect(result[0].passcode).toBe(4); expect(cardSearchRank(cards[3], 'either graveyard')).toBe(9);
    expect(cardSearchRank({ id: 'a', name: 'Étoile' }, 'etoile')).toBe(0);
  });
  it('keeps unowned cards out until explicitly requested and makes sorting deterministic', () => {
    const f = defaultDeckFilters(); expect(deckCollection(cards, f).some(c => c.passcode === 3)).toBe(false);
    f.ownedOnly = false; f.sort = 'attack'; expect(deckCollection(cards, f)[0].passcode).toBe(3);
    f.type = 'spell'; expect(deckCollection(cards, f).map(c => c.passcode)).toEqual([4]);
  });
});
