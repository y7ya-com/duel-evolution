import { describe, expect, it } from 'vitest';
import { DeckEditor } from '../src/services/deck-editor';
import type { DeckView } from '../src/ui/contracts';
const blank = (): DeckView => ({ name: 'Deck', main: [], side: [], extra: [] });
const collection = [{ id: '1', passcode: 1, name: 'Main', owned: 2, extra: false }, { id: '2', passcode: 2, name: 'Fusion', owned: 2, extra: true }];
describe('deterministic passcode deck editor', () => {
  it('isolates all input and output arrays and metadata', () => {
    const deck = blank(), cards = collection.map(c => ({ ...c })); const editor = new DeckEditor(deck, cards);
    deck.main.push(1); cards[0].owned = 0;
    const copy = editor.deck; copy.main.push(2);
    expect(editor.deck.main).toEqual([]); expect(editor.move(1, 'collection', 'main').ok).toBe(true);
  });
  it('constrains owned copies across all zones atomically and permits removal', () => {
    const e = new DeckEditor(blank(), collection);
    expect(e.move(1, 'collection', 'main').ok).toBe(true); expect(e.move(1, 'collection', 'side').ok).toBe(true);
    expect(e.available(1)).toBe(0); expect(e.move(1, 'collection', 'main').ok).toBe(false);
    const before = e.deck; expect(e.move(1, 'main', 'side', 5).ok).toBe(false); expect(e.deck).toEqual(before);
    expect(e.move(1, 'main', 'collection', 0).ok).toBe(true); expect(e.available(1)).toBe(1);
  });
  it('rejects new Fusion cards in Main/Side while preserving imported legacy Side entries', () => {
    const e = new DeckEditor(blank(), collection);
    expect(e.move(2, 'collection', 'main').ok).toBe(false); expect(e.move(1, 'collection', 'extra').ok).toBe(false);
    expect(e.move(2, 'collection', 'side').ok).toBe(false);
    e.load({ ...blank(), side:[2] }); expect(e.deck.side).toEqual([2]); expect(e.move(2, 'side', 'extra').ok).toBe(true);
    expect(e.deck.extra).toEqual([2]);
  });
  it('replaces and reorders drafts atomically without overwriting the saved baseline', () => {
    const e = new DeckEditor({ ...blank(), main:[1,2,1] }, collection);
    expect(e.reorder('main',0,2).ok).toBe(true); expect(e.deck.main).toEqual([2,1,1]); expect(e.dirty).toBe(true);
    const before = e.deck; expect(e.reorder('main',4,0).ok).toBe(false); expect(e.deck).toEqual(before);
    expect(e.replace({ ...blank(), side:[NaN] }).ok).toBe(false); expect(e.deck).toEqual(before);
    const replacement = { ...blank(), name:'Imported',main:[999] }; expect(e.replace(replacement).ok).toBe(true);
    replacement.main.push(1); expect(e.deck.main).toEqual([999]); expect(e.dirty).toBe(true);
    e.reset(); expect(e.deck).toEqual({ ...blank(),main:[1,2,1] });
  });
  it('preserves legacy 80 main/30 extra cards, order, unknown cards and excess copies at load', () => {
    const legacy = { name: 'Legacy', main: Array(80).fill(1), side: [], extra: Array(30).fill(2) };
    const e = new DeckEditor(legacy, collection);
    expect(e.deck).toEqual(legacy); expect(e.dirty).toBe(false);
    expect(e.hints().some(h => h.code === 'owned')).toBe(true);
    expect(e.move(1, 'main', 'side', 79).ok).toBe(true);
    const unknown = { ...blank(), main: [99999] }; e.load(unknown);
    expect(e.deck).toEqual(unknown); expect(e.hints()[0].code).toBe('unknown-card');
    expect(e.move(99999, 'main', 'collection').ok).toBe(true);
  });
  it('uses storage capacities rather than modern rules', () => {
    const e = new DeckEditor({ ...blank(), main: Array(60).fill(999) });
    expect(e.move(999, 'collection', 'main').ok).toBe(true);
    e.load({ ...blank(), main: Array(80).fill(999) }); expect(e.move(999, 'collection', 'main').ok).toBe(false);
    e.load({ ...blank(), extra: Array(30).fill(999) }); expect(e.move(999, 'collection', 'extra').ok).toBe(false);
  });
  it('retains edits made during save and rejects invalid names without mutation', () => {
    const e = new DeckEditor(blank(), collection); e.move(1, 'collection', 'main'); const submitted = e.deck;
    e.move(2, 'collection', 'extra'); e.markSaved(submitted); expect(e.dirty).toBe(true);
    expect(e.rename('../unsafe').ok).toBe(false); expect(e.deck.name).toBe('Deck');
    e.reset(); expect(e.deck).toEqual(submitted); expect(e.dirty).toBe(false);
    expect(e.rename('魔法 #1').ok).toBe(true);
  });
});
