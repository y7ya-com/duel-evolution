import { describe, expect, it } from 'vitest';
import { engine, set_card } from '../../../server/src/duel/translator/lockstep';
import { concat } from '../../../server/src/duel/translator/py';
import { createDuelState, reduceDuelMessage } from '../src/duel/model';
import { DuelTimeline } from '../src/duel/timeline';
import { PacedQueue } from '../src/duel/paced';
import { applyTimeline, projectDuel } from '../src/presentation';
import { CardCatalog } from '../src/catalog';
import type { DuelState } from '../src/duel/types';

const cmd = (s: DuelState, data: Uint8Array) => reduceDuelMessage(s, { id: 0x6202, data });
const initial = () => cmd(createDuelState(), engine(1));

describe('the duel shows each packet once the board reaches it', () => {
  it('releases a packet\'s facts in order once the timeline has reached it, bounded', () => {
    const q = new PacedQueue<string>(3);
    q.push(1, 'a'); q.push(2, 'b'); q.push(2, 'c');
    expect(q.take(0)).toEqual([]); expect(q.take(1)).toEqual(['a']); expect(q.take(2)).toEqual(['b', 'c']); expect(q.size).toBe(0);
    // past its budget the oldest go at once, never held for ever
    for (let i = 0; i < 5; i++) q.push(10 + i, String(i));
    expect(q.take(0)).toEqual(['0', '1']); expect(q.size).toBe(3);
    expect(q.flush()).toEqual(['2', '3', '4']); expect(q.size).toBe(0);
    expect(() => new PacedQueue(0)).toThrow();
  });
  it('shows the duel\'s end only after its last attack and the LP count to 0', () => {
    const catalog = new CardCatalog(), before = initial();
    const attack = cmd(before, engine(0x1a, 1, 0)), end = cmd(attack, concat(engine(0x25, 0, 8000), engine(5, 0, 2)));
    const t = new DuelTimeline(before); t.enqueue(before, attack); t.enqueue(attack, end);
    const view = projectDuel(end, catalog, ['You', 'Rival']);
    expect(view.ended).toBe('Defeat');
    let frames = 0, first: ReturnType<typeof applyTimeline> | null = null;
    for (; frames < 1000 && !first; frames++) { const shown = applyTimeline(view, t.advance(1), catalog); if (shown.ended) first = shown; else expect(t.sample().pending).toBe(true); }
    // the attack's 16 frames, its hit's hold (16 + 42) and 80 frames of counting 8000 LP
    expect(frames).toBeGreaterThanOrEqual(16 + 42 + 80);
    expect(first).toMatchObject({ ended: 'Defeat' }); expect(first!.players[0].lp).toBe(0);
  });
  it('keeps a card\'s counters as the board has played them', () => {
    const before = cmd(initial(), set_card(0, 0, 0, 123, 1)), damaged = cmd(before, engine(0x25, 0, 1000));
    const counted = cmd(damaged, engine(0x3c, 0, 0, 1, 3));
    const t = new DuelTimeline(before); t.enqueue(before, damaged); t.enqueue(damaged, counted);
    expect(counted.cards[before.sides[0].monster[0]!]!.counters).toEqual({ 3: 1 });
    expect(t.sample().cards[0]!.to!.counters).toEqual({});
    while (t.sample().pending) t.advance(1);
    expect(t.sample().cards[0]!.to!.counters).toEqual({ 3: 1 });
  });
});
