import { describe, expect, it } from 'vitest';
import { CardMap } from '../../../server/src/duel/translator/cardmap';
import { norm, YO2Duel, type Cmd, type Msg } from '../../../server/src/duel/translator/translator';
import { PyRandom } from '../../../server/src/util/pyrandom';
import { createDuelState, reduceDuelMessage } from '../src/duel/model';
import { encodeDuelResponse } from '../src/duel/responses';
import type { DuelResponse } from '../src/duel/types';

const CARDS = [123, 456, 789, 1011];
function actor() {
  const d = new YO2Duel([{ main: CARDS }, { main: CARDS }], { rng: new PyRandom(1),
    cardmap: new CardMap({ wire: CARDS, wireHash: 0, cdb: Object.fromEntries(CARDS.map(c => [c, [1, 0, 100, 100, 4, 1, 0, 1]])), scripts: {} }),
    cfg: { turn_timer: 0 } });
  let state = createDuelState();
  const apply = (messages: Msg[]) => {
    for (const [id, data] of messages) state = reduceDuelMessage(state, { id, data });
    expect(state.errors).toEqual([]); expect(state.unsupported).toEqual([]);
  };
  apply(d.start());
  return { d, get state() { return state; },
    feed(events: Record<string, unknown>[]) { const out = d.feed_many(events); apply(out); return out; },
    select(event: Record<string, unknown>) { const out = norm(d._on_select(event)); apply(out); return out; },
    send(response: DuelResponse) {
      const commands: Cmd[] = [], packets = encodeDuelResponse(state, response);
      for (const packet of packets) { const [command, out] = d.on_client(packet.id, packet.data); if (command) commands.push(command); apply(out); }
      return commands;
    },
  };
}
const hand = (i: number, amount?: number) => ({ controller: 0, location: 2, sequence: 3 - i, code: CARDS[i], ...(amount === undefined ? {} : { amount }) });

/** Draws the four cards and puts the first `n` of them face-up in monster zones 0..n-1 through the real translator. */
function field(n: number) {
  const a = actor();
  a.feed([{ ev: 'msg', type: 'DRAW', player: 0, drawn: CARDS.map(code => ({ code, position: 10 })) }]);
  for (let i = 0; i < n; i++) a.feed([{ ev: 'msg', type: 'MOVE', card: CARDS[i], from: { controller: 0, location: 2, sequence: 0, position: 10 },
    to: { controller: 0, location: 4, sequence: i, position: 1 } }, { ev: 'msg', type: 'SPSUMMONED' }]);
  expect(a.state.sides[0].monster.slice(0, n).every(uid => uid !== null)).toBe(true);
  return a;
}
const mz = (i: number, amount?: number) => ({ controller: 0, location: 4, sequence: i, code: CARDS[i], ...(amount === undefined ? {} : { amount }) });
const selects = (a: ReturnType<typeof actor>) => a.state.prompt!.actions.filter(x => x.command === 11).map(x => x.zone);
const pick = (zone: number) => ({ type: 'action' as const, player: 0 as const, zone, index: 0, command: 11 });

describe('tribute prompts (SELECT_TRIBUTE)', () => {
  it('offers exactly the server candidates on the board and answers after the required count', () => {
    const a = field(3);
    a.select({ type: 'SELECT_TRIBUTE', selects: [mz(0), mz(2)], min: 2, max: 2, can_cancel: true });
    expect(a.state.prompt!.kind).toBe('actions');
    expect(selects(a)).toEqual([0, 2]);
    // A monster the core did not list cannot be offered as a Tribute.
    expect(() => a.send(pick(1))).toThrow(/not in the current server masks/);
    expect(a.send(pick(2))).toEqual([]);
    expect(selects(a)).toEqual([0]);
    expect(a.send(pick(0))).toEqual([{ cmd: 'respond', response: { type: 'SELECT_TRIBUTE', indicies: [1, 0] } }]);
  });
  it('cancels an optional Tribute with the board cancel', () => {
    const a = field(2);
    a.select({ type: 'SELECT_TRIBUTE', selects: [mz(0), mz(1)], min: 1, max: 1, can_cancel: true });
    expect(a.send({ type: 'cancel' })).toEqual([{ cmd: 'respond', response: { type: 'SELECT_TRIBUTE', indicies: null } }]);
  });
});

describe('ritual level-sum prompts (SELECT_SUM on the field)', () => {
  it('shows the stars left and only the materials that can still complete the exact sum', () => {
    const a = field(3);
    // Target 5 from Levels 4, 1 and 3: the Level 3 completes no exact 5 (3, 3+1, 3+4), so it is never offered.
    a.select({ type: 'SELECT_SUM', amount: 5, min: 1, max: 3, select_max: false, selects_must: [], selects: [mz(0, 4), mz(1, 1), mz(2, 3)] });
    expect(a.state.prompt).toMatchObject({ kind: 'ritual', detail: 5, title: 'Choose ritual materials (5 stars remaining)' });
    expect(selects(a)).toEqual([0, 1]);
    expect(() => a.send(pick(2))).toThrow(/not in the current server masks/);
    expect(a.send(pick(0))).toEqual([]);
    expect(a.state.prompt).toMatchObject({ kind: 'ritual', title: 'Choose ritual materials (1 stars remaining)' });
    expect(selects(a)).toEqual([1]);
    expect(a.send(pick(1))).toEqual([{ cmd: 'respond', response: { type: 'SELECT_SUM', indicies: [0, 1] } }]);
  });
  it('an at-least sum (select_max) offers no material that would be surplus once the target is reached', () => {
    const a = field(2);
    // Level 4 alone reaches 3; Level 1 + Level 4 would leave the Level 1 superfluous, so the core forbids it.
    a.select({ type: 'SELECT_SUM', amount: 3, min: 1, max: 2, select_max: true, selects_must: [], selects: [mz(0, 4), mz(1, 1)] });
    expect(selects(a)).toEqual([0]);
    expect(a.send(pick(0))).toEqual([{ cmd: 'respond', response: { type: 'SELECT_SUM', indicies: [0] } }]);
  });
});

describe('declaration prompts (ANNOUNCE_RACE / ANNOUNCE_ATTRIB / ANNOUNCE_NUMBER)', () => {
  it('offers only the declarable Types and answers with the core bit', () => {
    const a = actor();
    a.select({ type: 'ANNOUNCE_RACE', available: 0x1 | 0x20, count: 1 });
    expect(a.state.prompt!.kind).toBe('race');
    expect(a.state.prompt!.cancelable).toBe(false);
    const options = a.state.prompt!.options;
    expect(options.map(o => o.label)).toEqual(['Warrior', 'Machine'].sort((x, y) => options.findIndex(o => o.label === x) - options.findIndex(o => o.label === y)));
    const unoffered = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20].find(v => !options.some(o => o.value === v))!;
    expect(() => a.send({ type: 'answer', value: unoffered })).toThrow(/not an available option/);
    expect(() => a.send({ type: 'cancel' })).toThrow(/Cancellation is unavailable/);
    const warrior = options.find(o => o.label === 'Warrior')!;
    expect(a.send({ type: 'answer', value: warrior.value })).toEqual([{ cmd: 'respond', response: { type: 'ANNOUNCE_RACE', races: [0x1] } }]);
  });
  it('requires exactly the requested number of offered Attributes', () => {
    const a = actor();
    // OCG attribute bits: EARTH 0x1, WATER 0x2, LIGHT 0x10, WIND 0x8.
    a.select({ type: 'ANNOUNCE_ATTRIB', available: 0x1 | 0x2 | 0x10, count: 2 });
    const p = a.state.prompt!;
    expect(p).toMatchObject({ kind: 'attribute', min: 2, max: 2 });
    expect(p.options.map(o => o.label)).toEqual(['LIGHT', 'WATER', 'EARTH']);
    const bit = (n: string) => p.options.find(o => o.label === n)!.value;
    expect(() => a.send({ type: 'answer', value: bit('EARTH') })).toThrow(/Invalid attribute selection/);
    expect(() => a.send({ type: 'answer', value: bit('EARTH') | 0x40 })).toThrow(/Invalid attribute selection/);
    expect(a.send({ type: 'answer', value: bit('EARTH') | bit('LIGHT') })).toEqual([
      { cmd: 'respond', response: { type: 'ANNOUNCE_ATTRIB', attributes: [0x10, 0x1] } },
    ]);
  });
  it('scales LP number declarations and refuses values outside the dialog range', () => {
    const a = actor();
    a.select({ type: 'ANNOUNCE_NUMBER', options: [1000, 2000, 3000] });
    expect(a.state.prompt).toMatchObject({ kind: 'number', min: 1, max: 3 });
    expect(a.state.prompt!.options.map(o => o.label)).toEqual(['1000 LP', '2000 LP', '3000 LP']);
    expect(() => a.send({ type: 'answer', value: 4 })).toThrow();
    expect(a.send({ type: 'answer', value: 2 })).toEqual([{ cmd: 'respond', response: { type: 'ANNOUNCE_NUMBER', value: 1 } }]);
  });
});

describe('filtered card choices (SELECT_CARD over a subset)', () => {
  it('lists only the cards the core offered and enforces its min/max', () => {
    const a = actor();
    const deck = (i: number) => ({ controller: 0, location: 1, sequence: 3 - i, code: CARDS[i] });
    a.select({ type: 'SELECT_CARD', selects: [deck(1), deck(3)], min: 1, max: 1, can_cancel: false });
    expect(a.state.prompt).toMatchObject({ kind: 'cards', min: 1, max: 1, cancelable: true });
    expect(a.state.prompt!.items.map(i => i.passcode)).toEqual([456, 1011]);
    expect(() => a.send({ type: 'cards', indices: [] })).toThrow(/Invalid selection count/);
    expect(() => a.send({ type: 'cards', indices: [0, 1] })).toThrow(/Invalid selection count/);
    expect(() => a.send({ type: 'cards', indices: [2] })).toThrow(/outside the prompt list/);
    expect(a.send({ type: 'cards', indices: [1] })).toEqual([{ cmd: 'respond', response: { type: 'SELECT_CARD', indicies: [1] } }]);
  });
});
