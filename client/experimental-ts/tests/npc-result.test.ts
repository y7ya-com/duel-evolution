import { describe, expect, it } from 'vitest';
import { engine, set_card, setcommand } from '../../../server/src/duel/translator/lockstep';
import { endDuelMsgs, WHY_DECKOUT, WHY_DESTINY, WHY_EXODIA, WHY_FINALCOUNT, WHY_LP, WHY_SURRENDER } from '../../../server/src/duel/duelfin';
import { createDuelState, reduceDuelMessage } from '../src/duel/model';
import type { DuelState } from '../src/duel/types';
import { createNpcResultContext, npcResultLine, reduceNpcResultContext, type NpcResultCategory, type NpcResultContext } from '../src/npcs/result';

// Original duelResultLine (PE 0x007918c0) returns: loss 0x22/0x27/0x2c, draw 0x31, win 0x36/0x3b/0x40.
const ctx = (result: 1 | 2 | 3, category: NpcResultCategory, lp: [number | null, number | null], deck: [number | null, number | null] = [20, 20], turn: number | null = 12): NpcResultContext =>
  ({ ...createNpcResultContext(category), result, turn, lp, deck, complete: true });

describe('original duelResultLine branch table', () => {
  it('draw is line 49 in every category, even without LP/deck/turn observations', () => {
    for (const c of [0, 1, 2, 3] as const) expect(npcResultLine(ctx(3, c, [null, null], [null, null], null))).toBe(49);
  });
  it('category 0 win/loss uses the winner-side LP gauge at 5000/1000 while the loser still has cards', () => {
    expect([5000, 4999, 1000, 999, 0].map(lp => npcResultLine(ctx(1, 0, [lp, 0], [3, 1])))).toEqual([64, 59, 59, 54, 54]);
    expect([5000, 4999, 1000, 999, 0].map(lp => npcResultLine(ctx(2, 0, [0, lp], [1, 3])))).toEqual([34, 39, 39, 44, 44]);
  });
  it('category 0 with the loser\'s deck empty reads the winner\'s deck (10) and LP (3000)', () => {
    // Win: NPC deck (engine P1) empty.
    expect(npcResultLine(ctx(1, 0, [8000, 8000], [9, 0]))).toBe(54);
    expect(npcResultLine(ctx(1, 0, [3000, 8000], [10, 0]))).toBe(64);
    expect(npcResultLine(ctx(1, 0, [2999, 8000], [10, 0]))).toBe(59);
    // Loss: client deck (engine P0) empty.
    expect(npcResultLine(ctx(2, 0, [8000, 8000], [0, 9]))).toBe(44);
    expect(npcResultLine(ctx(2, 0, [8000, 3000], [0, 10]))).toBe(34);
    expect(npcResultLine(ctx(2, 0, [8000, 2999], [0, 10]))).toBe(39);
  });
  it('category 1 (Exodia views) ignores decks and turns', () => {
    expect(npcResultLine(ctx(1, 1, [5000, 0], [0, 0], null))).toBe(64);
    expect(npcResultLine(ctx(1, 1, [999, 0], [null, null]))).toBe(54);
    expect(npcResultLine(ctx(2, 1, [8000, 1000], [0, 0]))).toBe(39);
  });
  it('category 2 (Destiny Board fifth piece) ends at turn 10, then reads LP at 2000', () => {
    expect(npcResultLine(ctx(1, 2, [1, 1], undefined, 10))).toBe(64);
    expect(npcResultLine(ctx(2, 2, [1, 1], undefined, 10))).toBe(34);
    expect(npcResultLine(ctx(1, 2, [1999, 0], undefined, 11))).toBe(54);
    expect(npcResultLine(ctx(1, 2, [2000, 0], undefined, 11))).toBe(59);
    expect(npcResultLine(ctx(2, 2, [0, 1999], undefined, 11))).toBe(44);
    expect(npcResultLine(ctx(2, 2, [0, 2000], undefined, 11))).toBe(39);
  });
  it('category 3 (Final Countdown views) ends at turn 25, and its loss branch reads the client LP', () => {
    expect(npcResultLine(ctx(1, 3, [1, 1], undefined, 25))).toBe(64);
    expect(npcResultLine(ctx(2, 3, [1, 1], undefined, 25))).toBe(34);
    expect(npcResultLine(ctx(1, 3, [999, 0], undefined, 26))).toBe(54);
    expect(npcResultLine(ctx(1, 3, [1000, 0], undefined, 26))).toBe(59);
    expect(npcResultLine(ctx(2, 3, [999, 8000], undefined, 26))).toBe(44);
    expect(npcResultLine(ctx(2, 3, [1000, 0], undefined, 26))).toBe(39);
  });
  it('stays unavailable without completion or a required observation, and clamps a signed-negative gauge', () => {
    expect(npcResultLine({ ...ctx(1, 0, [8000, 0], [5, 5]), complete: false })).toBeNull();
    expect(npcResultLine(ctx(1, 0, [null, 0], [5, 5]))).toBeNull();
    expect(npcResultLine(ctx(1, 0, [8000, 0], [5, null]))).toBeNull();
    expect(npcResultLine(ctx(1, 2, [8000, 0], undefined, null))).toBeNull();
    expect(npcResultLine(ctx(1, null as unknown as 0, [8000, 0]))).toBeNull();
    expect(npcResultLine(ctx(2, 1, [8000, 0xffffff00]))).toBe(44);
  });
});

const lp = (player: 0 | 1, value: number) => engine(0x26, player, value);
function feed(context: NpcResultContext, state: DuelState, data: Uint8Array): [NpcResultContext, DuelState] {
  const message = { id: 0x6202, data, param: 0 };
  const next = reduceDuelMessage(state, message);
  return [reduceNpcResultContext(context, next, message), next];
}
function duel(context: NpcResultContext, decks: [number, number], packets: Uint8Array[], end: [number, number][]): NpcResultContext {
  let state = createDuelState();
  [context, state] = feed(context, state, engine(1));
  let serial = 1;
  for (const p of [0, 1] as const) for (let i = 0; i < decks[p]; i++) [context, state] = feed(context, state, set_card(p, 13, i, 10000 + serial, serial++));
  for (const data of packets) [context, state] = feed(context, state, data);
  for (const [, data] of end) [context, state] = feed(context, state, data);
  return context;
}
const end = (winner: 0 | 1 | null, why: string) => endDuelMsgs(winner, why).filter(([id]) => id === 0x6202) as [number, number][];

describe('result context from actual server end-of-duel packets', () => {
  it('LP win with cards left: client LP gauge and turn counter from the stream', () => {
    const c = duel(createNpcResultContext(), [12, 7], [engine(4, 0), engine(4, 1), lp(0, 4200), lp(1, 0)], end(0, WHY_LP));
    expect(c).toMatchObject({ complete: true, result: 1, category: 0, turn: 3, lp: [4200, 0], deck: [12, 7] });
    expect(npcResultLine(c)).toBe(59);
  });
  it('surrender loss: server zeroes the client LP, the line reads the NPC LP', () => {
    const c = duel(createNpcResultContext(), [30, 30], [lp(1, 6100)], end(1, WHY_SURRENDER));
    expect(c.lp).toEqual([0, 6100]); expect(npcResultLine(c)).toBe(34);
  });
  it('deck-out win reads the client deck and LP once the NPC deck is empty', () => {
    const c = duel(createNpcResultContext(), [10, 2], [lp(0, 3500), engine(0x55, 1, 0, 2)], end(0, WHY_DECKOUT));
    expect(c.deck).toEqual([10, 0]); expect(npcResultLine(c)).toBe(64);
  });
  it('Exodia (reason 3) and Final Countdown (reason 7) set categories 1 and 3 that persist across duels', () => {
    const exodia = duel(createNpcResultContext(), [20, 20], [lp(0, 900)], end(0, WHY_EXODIA));
    expect(exodia.category).toBe(1); expect(npcResultLine(exodia)).toBe(54);
    // Next ordinary LP duel: the native global is never cleared, so Exodia's branch still ignores decks.
    const next = duel(exodia, [0, 20], [lp(0, 8000), lp(1, 0)], end(0, WHY_LP));
    expect(next).toMatchObject({ category: 1, deck: [null, 20] }); expect(npcResultLine(next)).toBe(64);
    const final = duel(next, [20, 20], Array.from({ length: 30 }, (_, i) => engine(4, i & 1)), end(1, WHY_FINALCOUNT));
    expect(final).toMatchObject({ category: 3, turn: 31 }); expect(npcResultLine(final)).toBe(39);
  });
  it('Destiny Board through C_DUEL_END reason 4 keeps the category; only an unflagged fifth piece sets category 2', () => {
    expect(duel(createNpcResultContext(), [5, 5], [], end(0, WHY_DESTINY)).category).toBe(0);
    expect(duel(createNpcResultContext(), [5, 5], [engine(0x5f, 1, 0x104, 9)], end(1, WHY_LP)).category).toBe(0);
    const board = duel(createNpcResultContext(), [5, 5], [engine(0x5f, 1, 4, 9), engine(4, 1)], end(1, WHY_DESTINY));
    expect(board).toMatchObject({ category: 2, turn: 2 }); expect(npcResultLine(board)).toBe(34);
  });
  it('direct view records 0x3b and 0x3c use the same scene switch cases', () => {
    expect(duel(createNpcResultContext(), [5, 5], [setcommand(0x1b, 0x3b, [0, 9, 0])], end(0, WHY_LP)).category).toBe(1);
    expect(duel(createNpcResultContext(), [5, 5], [setcommand(0x1b, 0x3b, [1, 10, 0])], end(0, WHY_LP)).category).toBe(3);
    expect(duel(createNpcResultContext(), [5, 5], [setcommand(0x1b, 0x3c, [1, 9, 4])], end(0, WHY_LP)).category).toBe(2);
    expect(duel(createNpcResultContext(), [5, 5], [setcommand(0x1b, 0x3b, [1, 4, 0])], end(0, WHY_LP)).category).toBe(0);
  });
  it('is incomplete until the type0x4d finish record and ignores non-command packets', () => {
    const state = createDuelState(), context = createNpcResultContext();
    expect(reduceNpcResultContext(context, state, { id: 0x6613, data: new Uint8Array(36), param: 0 })).toBe(context);
    const [dueled] = feed(context, state, engine(5, 0, 1, 1, 1));
    expect(dueled.complete).toBe(false); expect(npcResultLine(dueled)).toBeNull();
  });
});
