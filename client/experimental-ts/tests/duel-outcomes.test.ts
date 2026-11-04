import { afterEach, expect, it, vi } from 'vitest';
import { createNodeDuelCore } from '../../../server/src/duel/engine/node';
import { PVP_CARD_KEY } from '../../../server/src/game/persist';
import { setDuelCore } from '../../../server/src/duel/data';
import { drive } from './network-server-fixture';
import { outcomeFixture, deck, passive, actionCode, WALL, SELF_DESTRUCT } from './duel-outcomes-fixture';
import type { DuelResponse } from '../src/duel';
let fixture: Awaited<ReturnType<typeof outcomeFixture>> | undefined;
afterEach(() => { fixture?.dispose(); fixture = undefined; setDuelCore(null); vi.clearAllTimers(); vi.useRealTimers(); });
async function assertSettlement(f: NonNullable<typeof fixture>, expected: [number, number]) {
  expect(f.boards.map(s => s.result)).toEqual(expected.map(result => ({ result, mode: 0 })));
  expect(f.finishes).toEqual([1, 1]);
  f.boards.forEach(state => { expect(state.errors).toEqual([]); expect(state.unsupported).toEqual([]); });
  expect(f.logs.some(line => line.includes('regla MR1'))).toBe(true);
  for (const [i, profile] of f.profiles().entries()) {
    expect(profile.rec).toMatchObject({ duels: 1, duels_won: Number(expected[i] === 1),
      duels_lost: Number(expected[i] === 2), duels_drawn: Number(expected[i] === 3),
      surrender_me: 0, surrender_opp: 0 });
    expect(profile[PVP_CARD_KEY]).toHaveLength(1);
    expect(profile[PVP_CARD_KEY][0]).toMatchObject({ n: 1 });
    expect(f.clients[i].received.filter(id => id === 0x4140)).toHaveLength(1);
    expect(f.clients[i].received.filter(id => id === 0x4800)).toHaveLength(1);
    expect(f.packets[i].filter(id => id === 0x6613)).toHaveLength(1);
    expect(f.choices[i].length).toBeGreaterThan(0);
    expect(f.choices[i].some(r => r.type === 'action' && r.command === 10)).toBe(false);
  }
  const settled = structuredClone(f.profiles());
  await drive(Promise.all(f.clients.map(c => c.session.finishDuel())));
  // Repeat cleanup and drain late packets: neither may settle or grant the reward again.
  await drive(Promise.all(f.clients.map(c => c.session.finishDuel())));
  await vi.advanceTimersByTimeAsync(2000);
  expect(f.clients.map(c => c.session.state.phase)).toEqual(['lobby', 'lobby']);
  expect(f.profiles()).toEqual(settled);
  expect(f.finishes).toEqual([1, 1]);
  expect(f.clients.map(c => c.received.filter(id => id === 0x4800).length)).toEqual([1, 1]);
}
it('real OCGCore deck exhaustion gives win/loss in both client models and settles once', async () => {
  setDuelCore(await createNodeDuelCore());
  const f = fixture = await outcomeFixture([deck(42), deck(40)]);
  await f.play(passive);
  expect(f.boards.map(s => s.turn)).toEqual([72, 72]);
  expect(f.logs.filter(line => line.includes(': fin para '))).toHaveLength(2);
  expect(f.logs.filter(line => line.includes(': fin para ')).every(line => line.includes('(deckout)'))).toBe(true);
  await assertSettlement(f, [1, 2]);
}, 30000);
it('real Self-Destruct Button after legal Wall LP payment gives draw in both client models', async () => {
  setDuelCore(await createNodeDuelCore());
  const f = fixture = await outcomeFixture([deck(40, [WALL, SELF_DESTRUCT, SELF_DESTRUCT, SELF_DESTRUCT]), deck(42)]);
  await f.play((state, seat): DuelResponse => {
    const p = state.prompt!;
    if (seat === 0) {
      if (p.kind === 'yesno' && p.items.some(i => [WALL, SELF_DESTRUCT].includes(i.passcode!))) return { type: 'yesno', yes: true };
      // The displayed LP amount is 1000 times this wire option value.
      if (p.kind === 'number' && p.items.some(i => i.passcode === WALL) && p.options.some(o => o.value === 7)) return { type: 'answer', value: 7 };
      const use = ['actions', 'field-selection'].includes(p.kind) && p.actions.find(a => a.command === 3 && [WALL, SELF_DESTRUCT].includes(actionCode(state, a)!));
      if (use) return { type: 'action', ...use };
      const set = p.kind === 'actions' && p.actions.find(a => a.command === 7 && [WALL, SELF_DESTRUCT].includes(actionCode(state, a)!));
      if (set) return { type: 'action', ...set };
    }
    return passive(state);
  });
  expect(f.boards.map(s => s.turn)).toEqual([40, 40]);
  expect(f.paidWall).toEqual([true, true]);
  expect(f.boards.map(s => s.sides.map(p => p.lp))).toEqual([[0, 0], [0, 0]]);
  expect(f.choices[0]).toContainEqual({ type: 'answer', value: 7 });
  await assertSettlement(f, [3, 3]);
}, 30000);
