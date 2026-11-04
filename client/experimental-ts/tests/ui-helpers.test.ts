import { describe, expect, it } from 'vitest';
import { deckPlacementReason, fieldCardPosition, filterCollection, gamePoint, safeImageUrl, sortCollection, validatePromptResponse } from '../src/ui/helpers';
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
    expect(fieldCardPosition(card, 0).x).toBe(288);
    expect(fieldCardPosition({ ...card, controller: 1 }, 0).x).toBe(736);
    expect(fieldCardPosition({ ...card, position: 'defense' }, 0).rotate).toBe(true);
    expect(fieldCardPosition({ ...card, zone: 'spell', index: 5 }, 0).x).toBe(902);
    expect(fieldCardPosition({ ...card, zone: 'spell', index: 5, controller: 1 }, 0).x).toBe(122);
  });
  it('rejects executable asset URL schemes', () => {
    expect(safeImageUrl('javascript:alert(1)')).toBeNull();
    expect(safeImageUrl('//untrusted.example/card.png')).toBeNull();
    expect(safeImageUrl('/art/card.png')).toBe('/art/card.png');
  });
});
