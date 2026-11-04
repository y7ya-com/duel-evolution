import { describe, expect, it } from 'vitest';
import { CardMap } from '../../../server/src/duel/translator/cardmap';
import { norm, YO2Duel, type Cmd, type Msg } from '../../../server/src/duel/translator/translator';
import { PyRandom } from '../../../server/src/util/pyrandom';
import { createDuelState, reduceDuelMessage } from '../src/duel/model';
import { encodeDuelResponse } from '../src/duel/responses';
import type { DuelResponse } from '../src/duel/types';

/** Public synthetic inputs exercise real server handlers, not a duplicate implementation of card rules. */
function actor() {
  const cards = [123, 456, 789];
  const d = new YO2Duel([{ main: cards }, {}], { rng: new PyRandom(1),
    cardmap: new CardMap({ wire: cards, wireHash: 0, cdb: Object.fromEntries(cards.map(c => [c, [1, 0, 100, 100, 1, 1, 0, 1]])), scripts: {} }),
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
      const commands: Cmd[] = [], outputs: Msg[] = [], packets = encodeDuelResponse(state, response);
      for (const packet of packets) {
        const [command, out] = d.on_client(packet.id, packet.data);
        if (command) commands.push(command); outputs.push(...out); apply(out);
      }
      return { commands, outputs, packets };
    },
  };
}
const at = (index: number, amount?: number) => ({ controller: 0, location: 1, sequence: 2 - index, code: [123, 456, 789][index],
  ...(amount === undefined ? {} : { amount }) });

describe('unusual current-server selections through the new semantic client', () => {
  it('preserves ordered multi-card selection rather than sorting selected rows', () => {
    const a = actor(); a.select({ type: 'SELECT_CARD', selects: [at(0), at(1), at(2)], min: 2, max: 2, can_cancel: false });
    expect(a.send({ type: 'cards', indices: [2, 0] }).commands).toEqual([
      { cmd: 'respond', response: { type: 'SELECT_CARD', indicies: [2, 0] } },
    ]);
  });
  it('converts card sort permutation into the core’s inverse order', () => {
    const a = actor(); a.select({ type: 'SORT_CARD', cards: [at(0), at(1), at(2)] });
    expect(a.send({ type: 'cards', indices: [2, 0, 1] }).commands).toEqual([
      { cmd: 'respond', response: { type: 'SORT_CARD', order: [1, 2, 0] } },
    ]);
  });
  it('cancels optional lists and preserves forced lists when the server refuses cancellation', () => {
    const optional = actor(); optional.select({ type: 'SELECT_CARD', selects: [at(0), at(1)], min: 1, max: 1, can_cancel: true });
    expect(optional.send({ type: 'cancel' }).commands).toEqual([
      { cmd: 'respond', response: { type: 'SELECT_CARD', indicies: null } },
    ]);
    const forced = actor(); forced.select({ type: 'SELECT_CARD', selects: [at(0), at(1)], min: 1, max: 1, can_cancel: false });
    const id = forced.state.prompt!.id;
    expect(forced.send({ type: 'cancel' }).commands).toEqual([]);
    expect(forced.state.prompt!.id).toBeGreaterThan(id);
    expect(forced.send({ type: 'cards', indices: [1] }).commands).toEqual([
      { cmd: 'respond', response: { type: 'SELECT_CARD', indicies: [1] } },
    ]);
  });
  it('maintains unselect-list order across changing candidate lists and finishes the run', () => {
    const a = actor();
    a.select({ type: 'SELECT_UNSELECT_CARD', select_cards: [at(0), at(1), at(2)], unselect_cards: [], can_finish: true });
    expect(a.state.prompt).toMatchObject({ kind: 'cards', listMode: 0x48, min: 0, max: 3 });
    expect(a.send({ type: 'cards', indices: [2, 0] }).commands).toEqual([
      { cmd: 'respond', response: { type: 'SELECT_UNSELECT_CARD', index: 2 } },
    ]);
    expect(a.select({ type: 'SELECT_UNSELECT_CARD', select_cards: [at(0), at(1)], unselect_cards: [at(2)], can_finish: true })).toEqual([]);
    expect(a.d.auto_response()).toEqual({ cmd: 'respond', response: { type: 'SELECT_UNSELECT_CARD', index: 0 } });
    expect(a.select({ type: 'SELECT_UNSELECT_CARD', select_cards: [at(1)], unselect_cards: [at(2), at(0)], can_finish: true })).toEqual([]);
    expect(a.d.auto_response()).toEqual({ cmd: 'respond', response: { type: 'SELECT_UNSELECT_CARD', index: null } });
  });
  it('re-reads ritual list indices after every legal material pick', () => {
    const a = actor(); a.select({ type: 'SELECT_SUM', amount: 5, min: 1, max: 3,
      select_max: false, selects_must: [], selects: [at(0, 2), at(1, 3), at(2, 4)] });
    const firstId = a.state.prompt!.id;
    expect(a.state.prompt!.items.map(i => i.passcode)).toEqual([123, 456]);
    expect(a.send({ type: 'cards', indices: [1] }).commands).toEqual([]);
    expect(a.state.prompt!.id).toBeGreaterThan(firstId); expect(a.state.prompt!.items.map(i => i.passcode)).toEqual([123]);
    expect(a.send({ type: 'cards', indices: [0] }).commands).toEqual([
      { cmd: 'respond', response: { type: 'SELECT_SUM', indicies: [1, 0] } },
    ]);
  });
  it('preserves mandatory and dual-value ritual materials in the final core indices', () => {
    const a = actor(); a.select({ type: 'SELECT_SUM', amount: 5, min: 1, max: 2, select_max: false,
      selects_must: [{ amount: 2 | (3 << 16) }], selects: [at(0, 3), at(1, 2)] });
    expect(a.send({ type: 'cards', indices: [0] }).commands).toEqual([
      { cmd: 'respond', response: { type: 'SELECT_SUM', indicies: [0, 1] } },
    ]);
  });
  it('roundtrips counter allocation across sequential numeric dialogs', () => {
    const a = actor(); a.select({ type: 'SELECT_COUNTER', count: 4,
      cards: [0, 1, 2].map(i => ({ ...at(i), count: 3 })) });
    expect(a.state.prompt).toMatchObject({ kind: 'number', min: 0, max: 3 });
    expect(a.send({ type: 'answer', value: 1 }).commands).toEqual([]);
    expect(a.state.prompt).toMatchObject({ kind: 'number', min: 0, max: 3 });
    expect(a.send({ type: 'answer', value: 2 }).commands).toEqual([
      { cmd: 'respond', response: { type: 'SELECT_COUNTER', counters: [1, 2, 1] } },
    ]);
  });
  it('recovers from numeric holes that the legacy interval cannot describe exactly', () => {
    const a = actor(); a.select({ type: 'ANNOUNCE_NUMBER', options: [1000, 3000] });
    const before = a.state.prompt!.id;
    expect(a.send({ type: 'answer', value: 2 }).commands).toEqual([]);
    expect(a.state.prompt!.id).toBeGreaterThan(before);
    expect(a.send({ type: 'answer', value: 3 }).commands).toEqual([
      { cmd: 'respond', response: { type: 'ANNOUNCE_NUMBER', value: 1 } },
    ]);
  });
  it('keeps yes/no option values distinct from the underlying option indices', () => {
    for (const yes of [true, false]) {
      const a = actor(); a.select({ type: 'SELECT_OPTION', options: [1214, 1213] });
      expect(a.state.prompt!.kind).toBe('yesno');
      expect(a.send({ type: 'yesno', yes }).commands).toEqual([
        { cmd: 'respond', response: { type: 'SELECT_OPTION', index: yes ? 1 : 0 } },
      ]);
    }
  });
  it('rejects a nondeclarable announced card on the server then accepts a valid passcode', () => {
    const a = actor(); a.select({ type: 'ANNOUNCE_CARD', opcodes: [123, (0x40000000n + 0x100n) << 32n] });
    const before = a.state.prompt!.id;
    expect(a.send({ type: 'announce-card', passcode: 456 }).commands).toEqual([]);
    expect(a.state.prompt!.id).toBeGreaterThan(before);
    expect(a.send({ type: 'announce-card', passcode: 123 }).commands).toEqual([
      { cmd: 'respond', response: { type: 'ANNOUNCE_CARD', card: 123 } },
    ]);
  });
  it('confirms read-only pile inspection without submitting a duel card selection', () => {
    const a = actor();
    // Move one real card to a public pile through the actual translator before opening inspection.
    a.feed([{ ev: 'msg', type: 'MOVE', card: 123,
      from: { controller: 0, location: 1, sequence: 2, position: 8 },
      to: { controller: 0, location: 16, sequence: 0, position: 1 } }]);
    a.select({ type: 'SELECT_IDLECMD', summons: [], special_summons: [], pos_changes: [], monster_sets: [], spell_sets: [], activates: [], to_ep: true });
    const inspected = a.send({ type: 'action', player: 0, zone: 14, index: 0, command: 1 });
    expect(inspected.commands).toEqual([]); expect(a.d.viewing).toBe(true);
    expect(a.state.prompt).toMatchObject({ kind: 'cards', listMode: 1 });
    expect(a.send({ type: 'cards', indices: [] }).commands).toEqual([]);
    expect(a.d.viewing).toBe(false); expect(a.state.prompt?.kind).toBe('actions');
  });
});
