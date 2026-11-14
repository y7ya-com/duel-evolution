import { describe, expect, it } from 'vitest';
import { deckPlacementReason, fieldCardPosition, filterCollection, gamePoint, handLiftTick, safeImageUrl, sortCollection, validatePromptResponse } from '../src/ui/helpers';
import type { DuelCardView, DuelPromptView } from '../src/ui/contracts';

describe('browser UI geometry and authoritative choices', () => {
  it('maps scaled pointer input and rejects outside/invalid points', () => {
    expect(gamePoint(266, 212, { left: 10, top: 20, width: 512, height: 384 })).toEqual({ x: 512, y: 384 });
    expect(gamePoint(0, 20, { left: 10, top: 20, width: 512, height: 384 })).toBeNull();
    expect(gamePoint(10, 20, { left: 10, top: 20, width: 0, height: 384 })).toBeNull();
  });
  it('does not expose unowned cards by default and searches passcodes', () => {
    const cards = [{ id: 'a', name: 'Dragon', passcode: 7, owned: 1 }, { id: 'b', name: 'Hidden', passcode: 8, owned: 0 }];
    expect(filterCollection(cards, '7').map(c => c.id)).toEqual(['a']);
    expect(filterCollection(cards, '').map(c => c.id)).toEqual(['a']);
    expect(filterCollection(cards, '', 'all', false)).toHaveLength(2);
  });
  it('sorts only the collection deterministically and places unknown statistics last', () => {
    const cards = [{ id: '2', name: 'Zeta', passcode: 2, attack: -1 }, { id: '3', name: 'Alpha', passcode: 3, attack: 1500 }, { id: '1', name: 'Alpha', passcode: 1, attack: 1500 }];
    expect(sortCollection(cards, 'attack').map(c => c.passcode)).toEqual([1, 3, 2]);
    expect(sortCollection(cards, 'name').map(c => c.passcode)).toEqual([1, 3, 2]);
    expect(sortCollection(cards, 'collection').map(c => c.passcode)).toEqual([2, 3, 1]); expect(cards[0].passcode).toBe(2);
  });
  it('keeps deck copy limits across every section', () => {
    expect(deckPlacementReason({ id: 'a', name: 'A', passcode: 1, owned: 3, limit: 1 }, 'main', { name: 'A', main: [], side: [1], extra: [] })).toContain('copy limit');
    expect(deckPlacementReason({ id: 'a', name: 'A', passcode: 1, owned: 1 }, 'side', { name: 'A', main: [1], side: [], extra: [] })).toContain('owned');
  });
  it('keeps Fusion cards out of both Main and Side Decks as the original editor does', () => {
    const card = { id: 'fusion', name: 'Fusion', passcode: 1, owned: 1, extra: true };
    const deck = { name: 'Deck', main: [], side: [], extra: [] };
    expect(deckPlacementReason(card, 'main', deck)).not.toBeNull();
    expect(deckPlacementReason(card, 'side', deck)).not.toBeNull();
    expect(deckPlacementReason(card, 'extra', deck)).toBeNull();
  });
  it('rejects stale candidates, duplicates, unavailable options and forbidden cancellation', () => {
    const prompt: DuelPromptView = { id: 'p1', text: 'Choose', kind: 'cards', options: [], min: 1, max: 2, candidates: [{ id: 'a', label: 'A' }, { id: 'b', label: 'B', disabled: true }] };
    expect(validatePromptResponse(prompt, { cardIds: ['a'] })).toBeNull();
    expect(validatePromptResponse(prompt, { cardIds: ['a', 'a'] })).not.toBeNull();
    expect(validatePromptResponse(prompt, { cardIds: ['b'] })).not.toBeNull();
    expect(validatePromptResponse(prompt, { cardIds: ['stale'] })).not.toBeNull();
    expect(validatePromptResponse(prompt, { cancel: true })).not.toBeNull();
    expect(validatePromptResponse(prompt, { optionId: 'invented' })).not.toBeNull();
  });
  it('mirrors opponent zones without mirroring player input coordinates', () => {
    const card: DuelCardView = { id: 'a', name: 'A', controller: 0, zone: 'monster', index: 0, faceUp: true };
    expect(fieldCardPosition(card, 0).x).toBe(360);
    expect(fieldCardPosition({ ...card, controller: 1 }, 0).x).toBe(664);
    expect(fieldCardPosition({ ...card, position: 'defense' }, 0).rotate).toBe(true);
    // Field-spell slot 5 is the field zone pile, not a mirrored sixth spell cell.
    expect(fieldCardPosition({ ...card, zone: 'spell', index: 5 }, 0)).toMatchObject({ x: 288, y: 406 });
    expect(fieldCardPosition({ ...card, zone: 'spell', index: 5, controller: 1 }, 0)).toMatchObject({ x: 736, y: 185 });
    expect(fieldCardPosition({ ...card, zone: 'deck', controller: 1 }, 0)).toMatchObject({ x: 288, y: 103 });
    // live's sizes: 48 x 70 in a cell, 50 x 72 on a pile
    expect(fieldCardPosition(card, 0)).toMatchObject({ y: 370, width: 48, height: 70 });
    expect(fieldCardPosition({ ...card, zone: 'graveyard' }, 0)).toMatchObject({ width: 50, height: 72 });
  });
  it("lays the hands out as live's: centred on 525, 16 px apart until the outer centres are 412 apart", () => {
    const hand = (controller: 0 | 1, n: number) => Array.from({ length: n }, (_, index) => fieldCardPosition({ id: String(index), name: '', controller, zone: 'hand', index, faceUp: !controller }, n));
    // the player's: 94 x 138, tops at 531; lefts measured on live 366.7 / 477 / 588 (3 cards, ±1), 272 + 103 n (5), 272 + 82.4 n (6)
    expect(hand(0, 3).map(p => Math.round(p.x - p.width / 2))).toEqual([367, 478, 589]);
    expect(hand(0, 5).map(p => Math.round(p.x - p.width / 2))).toEqual([272, 375, 478, 581, 684]);
    expect(hand(0, 6).map(p => Math.round(p.x - p.width / 2))).toEqual([272, 354, 437, 519, 602, 684]);
    expect(hand(0, 1)[0]).toMatchObject({ x: 525, y: 600, width: 94, height: 138 });
    // the opponent's: 100 x 146 backs, bottoms at 72; lefts 417 / 533 (2 cards), 269 + 103 n (5)
    expect(hand(1, 2).map(p => p.x - p.width / 2)).toEqual([417, 533]);
    expect(hand(1, 5).map(p => p.x - p.width / 2)).toEqual([269, 372, 475, 578, 681]);
    expect(hand(1, 5)[0]!.y + hand(1, 5)[0]!.height / 2).toBe(72);
  });
  it("raises a hand card in live's 30 fps steps: 32 / 24 / 18 / 13 / 9 / 6 / 4 / 3 / 2 / 1 px to go, and drops it back the same way", () => {
    const run = (from: number, goal: number) => { const out = [from]; while (out.at(-1) !== goal && out.length < 20) out.push(handLiftTick(out.at(-1)!, goal)); return out; };
    expect(run(0, 32)).toEqual([0, 8, 14, 19, 23, 26, 28, 29, 30, 31, 32]);
    expect(run(32, 0)).toEqual([32, 24, 18, 13, 9, 6, 4, 3, 2, 1, 0]);
    // turned back halfway, it goes the rest of its way in the same steps
    expect(run(20, 0)).toEqual([20, 15, 11, 8, 6, 4, 3, 2, 1, 0]);
  });
  it('rejects executable asset URL schemes', () => {
    expect(safeImageUrl('javascript:alert(1)')).toBeNull();
    expect(safeImageUrl('//untrusted.example/card.png')).toBeNull();
    expect(safeImageUrl('/art/card.png')).toBe('/art/card.png');
  });
});
