import { describe, expect, it } from 'vitest';
import { deckProblems } from '../src/ui/extra/deck-check';
import type { CardView } from '../src/ui/contracts';

const cards = new Map<number, CardView & { deckAllowed?: boolean }>([
  [1, { id: '1', passcode: 1, name: 'Plain', owned: 3, limit: 3, extra: false }],
  [2, { id: '2', passcode: 2, name: 'Kuriboh', owned: 3, limit: 3, extra: false }],
  [3, { id: '3', passcode: 3, name: 'Kuriboh', owned: 3, limit: 3, extra: false }],
  [4, { id: '4', passcode: 4, name: 'Pot of Greed', owned: 1, limit: 0, extra: false }],
  [5, { id: '5', passcode: 5, name: 'Heavy Storm', owned: 2, limit: 1, extra: false }],
  [6, { id: '6', passcode: 6, name: 'Fusion', owned: 1, limit: 3, extra: true }],
  [7, { id: '7', passcode: 7, name: 'God', owned: 1, deckAllowed: false, extra: false }],
  ...Array.from({ length: 40 }, (_, i) => [100 + i, { id: String(100 + i), passcode: 100 + i, name: `Filler ${i}`, owned: 1, limit: 3, extra: false }] as const),
]);
const lookup = (pc: number) => cards.get(pc);
const filler = Array.from({ length: 40 }, (_, i) => 100 + i);
const rules = (main: number[], extra: number[] = [], side: number[] = []) => deckProblems({ name: 'x', main, extra, side }, lookup).map(p => p.rule);

describe('deck check', () => {
  it('accepts a legal deck and reports Main/Fusion/Side sizes', () => {
    expect(rules(filler)).toEqual([]);
    expect(rules(filler.slice(1))).toEqual(['size']);
    expect(deckProblems({ name: 'x', main: [1], side: [], extra: [] }, lookup)[0]!.message).toBe('Main Deck has 1 cards (40 to 80 allowed).');
    expect(rules(filler, [], Array(16).fill(1))).toContain('size');
  });
  it('counts alternate arts together and applies the forbidden/limited list', () => {
    expect(rules([...filler.slice(4), 2, 2, 3, 3])).toEqual(['copies']);
    expect(rules([...filler.slice(1), 4])).toEqual(['forbidden']);
    expect(rules([...filler.slice(2), 5, 5])).toEqual(['limited']);
    expect(rules([...filler.slice(1), 7])).toEqual(['not-deckable']);
  });
  it('reports zones, unknown cards and owned copies', () => {
    expect(rules([...filler.slice(1), 6])).toEqual(['zone']);
    expect(rules(filler, [1])).toEqual(['zone']);
    expect(rules([...filler.slice(1), 999])).toEqual(['unknown']);
    expect(rules([...filler.slice(2), 100, 100])).toEqual(['owned']);
  });
});
