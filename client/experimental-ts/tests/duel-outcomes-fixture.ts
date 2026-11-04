import { expect, vi } from 'vitest';
import { check } from '../../../server/src/duel/deckCheck';
import type { Deck } from '../../../server/src/duel/data';
import { createDuelState, reduceDuelMessage, encodeDuelResponse } from '../src/duel';
import type { DuelState, DuelResponse, LegalAction } from '../src/duel';
import { setup, drive } from './network-server-fixture';

// Hand-authored public card identifiers; private runtime databases stay read-only.
const NORMALS = [89631139, 15025844, 6368038, 97590747, 70781052, 13039848,
  46986414, 91152256, 41392891, 32452818, 90357090, 49881766, 30113682, 49003308];
export const WALL = 17078030, SELF_DESTRUCT = 57585212;
export function deck(size: number, effects: number[] = []): Deck {
  return { main: [...effects, ...NORMALS.flatMap(code => [code, code, code])].slice(0, size), extra: [] };
}
export async function outcomeFixture(decks: [Deck, Deck], seed = 1) {
  // DEV supplies the normal development collection; all actual deck checks remain enforced.
  const a = setup(undefined, 'outcomes-alpha', { PARITY_SEED: String(seed), DECK_CHECK: 'bloquear' });
  const b = setup(a.server, 'outcomes-beta');
  const clients = [a, b] as const;
  const boards: [DuelState, DuelState] = [createDuelState(), createDuelState()];
  const packets: number[][] = [[], []], choices: DuelResponse[][] = [[], []];
  const finishes = [0, 0], paidWall = [false, false];
  try {
    for (const [i, client] of clients.entries()) {
      await drive(client.session.start());
      await drive(client.session.createCharacter(0, i ? 'Outcome Beta' : 'Outcome Alpha'));
      await drive(client.session.selectCharacter(0));
      const trunk = Object.fromEntries(client.session.state.collection);
      expect(check(decks[i].main, decks[i].extra, trunk), 'Real trunk, card limits and deck sizes').toEqual([]);
    }
    await drive(a.session.createDuelRoom({ allowSurrender: false, timeLimit: false }));
    const room = a.session.state.rooms.find(r => r.owner === a.session.state.profile!.pid)!;
    b.session.challengeRoom(room.id); await vi.advanceTimersByTimeAsync(200);
    a.session.replyToChallenge(true); await vi.advanceTimersByTimeAsync(200);
    await drive(Promise.all(clients.map((c, i) => c.session.acceptDuelOffer(decks[i]))));
    expect(await drive(Promise.all([a.session.chooseHand(0), b.session.chooseHand(1)]))).toEqual(['win', 'lose']);
    await drive(a.session.chooseFirst(true)); await vi.advanceTimersByTimeAsync(100);
    clients.forEach((c, i) => c.session.duel!.subscribe(message => {
      packets[i].push(message.id);
      if (message.id === 0x6202 && message.data.length >= 4 && new DataView(message.data.buffer, message.data.byteOffset).getUint32(0) === 0x4d) finishes[i]++;
      if ([0x6202, 0x6610, 0x6611, 0x6612, 0x6461, 0x6613, 0x649b].includes(message.id))
        boards[i] = reduceDuelMessage(boards[i], message);
      if (boards[i].sides[i === 0 ? 0 : 1].lp === 1000 && boards[i].sides[i === 0 ? 1 : 0].lp === 8000) paidWall[i] = true;
    }));
    clients.forEach(c => { c.received.length = 0; c.session.beginDuel(false); });
    const profiles = () => Object.values(a.server.game.store.loadRaw().accounts ?? {}).map((account: any) => account.profiles['0']);
    async function play(pick: (state: DuelState, seat: number) => DuelResponse, maxSteps = 12000) {
      const answered = [0, 0];
      for (let step = 0; step < maxSteps && boards.some(s => s.status !== 'finished'); step++) {
        await vi.advanceTimersByTimeAsync(100);
        for (const [i, c] of clients.entries()) {
          const state = boards[i];
          expect(state.errors).toEqual([]); expect(state.unsupported).toEqual([]);
          if (!state.acceptingInput || !state.prompt || state.prompt.id === answered[i] || state.result) continue;
          answered[i] = state.prompt.id;
          const response = pick(state, i); choices[i].push(response);
          for (const packet of encodeDuelResponse(state, response)) c.session.sendDuel(packet.id, packet.data);
        }
      }
      expect(boards.map(s => s.status), JSON.stringify(boards.map(s => ({ turn: s.turn, prompt: s.prompt, lp: s.sides.map(p => p.lp) })))).toEqual(['finished', 'finished']);
    }
    return { clients, boards, packets, choices, profiles, play, finishes, paidWall, logs: a.logs,
      dispose: () => clients.forEach(c => c.session.dispose()) };
  } catch (error) {
    clients.forEach(c => c.session.dispose());
    throw error;
  }
}
export function actionCode(state: DuelState, action: LegalAction): number | null {
  const uid = action.zone === 11 ? state.sides[action.player].hand[action.index]
    : action.zone >= 5 && action.zone <= 10 ? state.sides[action.player].spell[action.zone - 5] : null;
  return uid == null ? null : state.cards[uid]?.passcode ?? null;
}
export function passive(state: DuelState): DuelResponse {
  const p = state.prompt!;
  if (p.kind === 'actions' && p.buttons.includes(5)) return { type: 'phase', phase: 5 };
  if (p.kind === 'yesno') return { type: 'yesno', yes: false };
  if (p.kind === 'cards') return { type: 'cards', indices: Array.from({ length: Math.max(1, p.min) }, (_, i) => i).slice(0, p.max) };
  const select = p.actions.find(a => a.command === 11);
  if (select) return { type: 'action', ...select };
  if (p.options.length) return { type: 'answer', value: p.options[0].value };
  if (p.cancelable) return { type: 'cancel' };
  throw new Error(`Unhandled outcome prompt ${JSON.stringify(p)}`);
}
