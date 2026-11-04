import { describe, expect, it } from 'vitest';
import { encodeDuelResponse } from '../src/duel/responses';
import { createDuelState, reduceDuelMessage } from '../src/duel/model';
import type { DuelPrompt, DuelResponse, DuelState, WireMessage } from '../src/duel/types';
import { CardMap } from '../../../server/src/duel/translator/cardmap';
import { norm, YO2Duel } from '../../../server/src/duel/translator/translator';

function state(kind: DuelPrompt['kind'] = 'actions'): DuelState {
  const s = createDuelState();
  s.status = 'playing'; s.acceptingInput = true; s.promptSequence = 1;
  s.prompt = { id: 1, kind, title: '', cancelable: false, cancellationKnown: true,
    actions: [], buttons: [], items: [], text: [], min: 0, max: 1, options: [], dialogKind: 0, listMode: 0, detail: 0, hints: 0 };
  return s;
}
function server() {
  return new YO2Duel([{}, {}], { cardmap: new CardMap({ wire: [123], wireHash: 0,
    cdb: { 123: [1, 0, 100, 100, 1, 1, 0, 1] }, scripts: {} }) });
}
function send(d: YO2Duel, packets: WireMessage[]) {
  return packets.map(m => d.on_client(m.id, m.data)[0]);
}
function words(m: WireMessage) {
  const v = new DataView(m.data.buffer, m.data.byteOffset, m.data.byteLength);
  return Array.from({ length: m.data.length / 4 }, (_, i) => v.getUint32(i * 4));
}
function list() {
  const s = state('cards'); s.prompt!.listMode = 9; s.prompt!.min = s.prompt!.max = 3;
  s.prompt!.items = [0, 1, 2].map(serial => ({ serial, owner: 0, rawId: 123, passcode: 123 }));
  return s;
}

describe('duel response encoder', () => {
  it('roundtrips ordered list marks and close through the actual server handler', () => {
    const s = list(), d = server();
    d.waiting = { type: 'SELECT_CARD' };
    d.state = { mode: 'list', items: [[], [], []], min: 3, max: 3, marks: new Map(), single: null };
    const packets = encodeDuelResponse(s, { type: 'cards', indices: [2, 0, 1] });
    expect(packets.map(m => [m.id, words(m)])).toEqual([
      [0x6432, [2, 1]], [0x6432, [0, 2]], [0x6432, [1, 3]], [0x6423, [0]],
    ]);
    expect(send(d, packets)).toEqual([null, null, null,
      { cmd: 'respond', response: { type: 'SELECT_CARD', indicies: [2, 0, 1] } }]);
  });
  it('roundtrips sort order through the same list protocol', () => {
    const d = server(); d.waiting = { type: 'SORT_CARD' };
    d.state = { mode: 'list', sort: true, items: [[], [], []], marks: new Map(), single: null };
    expect(send(d, encodeDuelResponse(list(), { type: 'cards', indices: [2, 0, 1] })).at(-1))
      .toEqual({ cmd: 'respond', response: { type: 'SORT_CARD', order: [1, 2, 0] } });
  });
  it('sends announce passcode then close, preserving the passcode byte for byte', () => {
    const d = server(); d._on_select({ type: 'ANNOUNCE_CARD', opcodes: [] });
    const packets = encodeDuelResponse(state('announce-card'), { type: 'announce-card', passcode: 123 });
    expect(packets.map(m => [m.id, [...m.data]])).toEqual([
      [0x6423, [0, 0, 0, 123]], [0x6423, [0, 0, 0, 0]],
    ]);
    expect(send(d, packets)).toEqual([null, { cmd: 'respond', response: { type: 'ANNOUNCE_CARD', card: 123 } }]);
  });
  it.each([true, false])('roundtrips yesno %s', yes => {
    const s = state('yesno'), d = server(); s.prompt!.options = [{ value: 0, label: '' }, { value: 1, label: '' }];
    d.waiting = { type: 'SELECT_YESNO' }; d.state = { mode: 'yesno' };
    expect(send(d, encodeDuelResponse(s, { type: 'yesno', yes })))
      .toEqual([{ cmd: 'respond', response: { type: 'SELECT_YESNO', yes } }]);
  });
  it('requires the action in both prompt and current server mask', () => {
    const s = state(), d = server(), action = { type: 'action', player: 0, zone: 11, index: 2, command: 4 } as const;
    s.prompt!.actions = [{ ...action, label: 'Summon' }]; s.handMasks[0][2] = 1 << 4;
    d.waiting = { type: 'SELECT_IDLECMD' }; d.state = { mode: 'idle', options: [[0, 11, 2, 4, 'SUMMON', 7]] };
    expect(send(d, encodeDuelResponse(s, action))).toEqual([
      { cmd: 'respond', response: { type: 'SELECT_IDLECMD', action: 'SUMMON', index: 7 } },
    ]);
    s.handMasks[0][2] = 0; expect(() => encodeDuelResponse(s, action)).toThrow(/masks/);
    s.handMasks[0][2] = 1 << 4; s.prompt!.actions = []; expect(() => encodeDuelResponse(s, action)).toThrow(/masks/);
  });
  it.each([3, 4, 5])('roundtrips enabled phase %s and rejects disabled phases', phase => {
    const s = state(), d = server(); s.buttons[0] = s.prompt!.buttons = [phase];
    d.waiting = { type: 'SELECT_BATTLECMD' }; d.state = { mode: 'battle', buttons: new Map([[phase, 'TO_PHASE']]) };
    const packets = encodeDuelResponse(s, { type: 'phase', phase });
    expect(packets[0].id).toBe(0x002e);
    expect(send(d, packets)).toEqual([{ cmd: 'respond', response: { type: 'SELECT_BATTLECMD', action: 'TO_PHASE', index: null } }]);
    s.buttons[0] = []; expect(() => encodeDuelResponse(s, { type: 'phase', phase })).toThrow();
  });
  it.each([
    ['position', 'position', 1, { def_pos: 8 }, { position: 8 }],
    ['option', 'option', 2, { n: 3 }, { index: 2 }],
    ['race', 'race', 1, {}, { races: [0x2000] }],
    ['number', 'number', 3, { opts: [1000, 3000], scale: 1000 }, { value: 1 }],
  ] as const)('roundtrips %s dialog answers', (kind, mode, value, extra, expected) => {
    const s = state(kind), d = server(); s.prompt!.options = [{ value, label: '' }]; s.prompt!.max = 10;
    d.waiting = { type: 'TEST_DIALOG', available: 0x2000 }; d.state = { mode, ...extra };
    expect(send(d, encodeDuelResponse(s, { type: 'answer', value })))
      .toEqual([{ cmd: 'respond', response: { type: 'TEST_DIALOG', ...expected } }]);
    expect(() => encodeDuelResponse(s, { type: 'answer', value: 999 })).toThrow();
  });
  it('checks combined attribute bitmask and exact count before server roundtrip', () => {
    const s = state('attribute'), d = server(); s.prompt!.min = s.prompt!.max = 2;
    s.prompt!.options = [2, 4, 8].map(value => ({ value, label: '' }));
    d.waiting = { type: 'ANNOUNCE_ATTRIB', available: 0x30 }; d.state = { mode: 'attrib', count: 2 };
    expect(send(d, encodeDuelResponse(s, { type: 'answer', value: 6 })))
      .toEqual([{ cmd: 'respond', response: { type: 'ANNOUNCE_ATTRIB', attributes: [0x10, 0x20] } }]);
    for (const value of [0, 2, 14, 18, -1, 1.5, 0x100000006]) expect(() => encodeDuelResponse(s, { type: 'answer', value })).toThrow();
  });
  it('rejects invalid complete list choices without mutating state', () => {
    const s = list(), before = structuredClone(s);
    for (const indices of [[], [0], [0, 0, 2], [0, 1, 3], [-1, 1, 2], [0, 1, NaN]]) {
      expect(() => encodeDuelResponse(s, { type: 'cards', indices })).toThrow();
      expect(s).toEqual(before);
    }
    s.prompt!.listMode = 1; expect(() => encodeDuelResponse(s, { type: 'cards', indices: [0, 1, 2] })).toThrow();
  });
  it('rejects missing, stale, inactive, finished and unsupported prompts', () => {
    for (const change of [(s: DuelState) => { s.prompt = null; }, (s: DuelState) => { s.promptSequence++; },
      (s: DuelState) => { s.acceptingInput = false; }, (s: DuelState) => { s.status = 'finished'; },
      (s: DuelState) => { s.prompt!.kind = 'unsupported'; }]) {
      const s = state(); change(s); expect(() => encodeDuelResponse(s, { type: 'phase', phase: 5 })).toThrow();
    }
  });
  it('rejects cross-kind choices and malformed values', () => {
    const choices: DuelResponse[] = [{ type: 'answer', value: -1 }, { type: 'yesno', yes: true },
      { type: 'cards', indices: [0] }, { type: 'announce-card', passcode: 123 }, { type: 'cancel' }];
    for (const choice of choices) expect(() => encodeDuelResponse(state(), choice)).toThrow();
    for (const passcode of [0, 1, -1, NaN, 1.5, 0xffffff01, 0x100000000]) {
      expect(() => encodeDuelResponse(state('announce-card'), { type: 'announce-card', passcode })).toThrow();
    }
  });
  it('uses close for known cancellable lists and 0x6351 for board selection cancellation', () => {
    for (const kind of ['cards', 'actions'] as const) {
      const s = state(kind), d = server(); s.prompt!.cancelable = true;
      d.waiting = { type: 'SELECT_CARD' };
      d.state = kind === 'cards' ? { mode: 'list', items: [], min: 1, max: 1, single: null, marks: new Map(), can_cancel: true }
        : { mode: 'card', chosen: [], min: 1, can_cancel: true };
      const packets = encodeDuelResponse(s, { type: 'cancel' });
      expect(packets[0].id).toBe(kind === 'cards' ? 0x6423 : 0x6351);
      expect(send(d, packets)).toEqual([{ cmd: 'respond', response: { type: 'SELECT_CARD', indicies: null } }]);
      // Legacy masks omit optional/forced/minimum constraints: request cancel/finish,
      // then let the authoritative server either resolve it or resend the prompt.
      s.prompt!.cancellationKnown = false;
      expect(encodeDuelResponse(s, { type: 'cancel' })[0].id).toBe(kind === 'cards' ? 0x6423 : 0x6351);
    }
  });
  it('can finish a partial field selection even when its hidden minimum is not transmitted', () => {
    const s = state('field-selection'), d = server(); s.prompt!.cancelable = true; s.prompt!.cancellationKnown = false;
    d.waiting = { type: 'SELECT_TRIBUTE' };
    d.state = { mode: 'tribute', chosen: [2], min: 1, max: 3, can_cancel: false };
    const before = structuredClone(s);
    expect(send(d, encodeDuelResponse(s, { type: 'cancel' }))).toEqual([
      { cmd: 'respond', response: { type: 'SELECT_TRIBUTE', indicies: [2] } },
    ]);
    expect(s).toEqual(before);
  });
  it('allows empty up-to lists to close while leaving acceptance to the server', () => {
    const s = list(); s.prompt!.listMode = 0x48; s.prompt!.min = 0;
    const d = server(); d.waiting = { type: 'SELECT_UNSELECT_CARD' };
    d.state = { mode: 'list', unselect: true, items: [], min: 0, max: 3, single: null, marks: new Map(), can_cancel: true };
    expect(send(d, encodeDuelResponse(s, { type: 'cards', indices: [] }))).toEqual([
      { cmd: 'respond', response: { type: 'SELECT_UNSELECT_CARD', index: null } },
    ]);
  });
  it('roundtrips generated server race, attribute and numeric prompts', () => {
    const cases = [
      { event: { type: 'ANNOUNCE_RACE', available: 0x2000, count: 1 }, kind: 'race', value: 1,
        options: [1], min: 0, max: 1, expected: { races: [0x2000] } },
      { event: { type: 'ANNOUNCE_ATTRIB', available: 0x30, count: 2 }, kind: 'attribute', value: 6,
        options: [2, 4], min: 2, max: 2, expected: { attributes: [0x10, 0x20] } },
      { event: { type: 'ANNOUNCE_NUMBER', options: [1000, 2000, 3000] }, kind: 'number', value: 2,
        options: [1, 2, 3], min: 1, max: 3, expected: { value: 1 } },
    ] as const;
    for (const c of cases) {
      const d = server(); let s = createDuelState(); s.status = 'playing';
      const messages = norm(d._on_select(c.event));
      expect(messages.length).toBeGreaterThan(0);
      for (const [id, data] of messages) s = reduceDuelMessage(s, { id, data });
      expect(s.errors).toEqual([]); expect(s.prompt!.kind).toBe(c.kind);
      expect(send(d, encodeDuelResponse(s, { type: 'answer', value: c.value })))
        .toEqual([{ cmd: 'respond', response: { type: c.event.type, ...c.expected } }]);
    }
  });
  it('rejects wrong players, slots, fractional commands and commands absent from field masks', () => {
    const s = state(); s.fieldMasks[1][3] = 1 << 11;
    s.prompt!.actions = [{ player: 1, zone: 3, index: 0, command: 11, label: '' }];
    expect(encodeDuelResponse(s, { type: 'action', player: 1, zone: 3, index: 0, command: 11 })[0].data)
      .toEqual(Uint8Array.from([0, 0, 0, 1, 0, 0, 0, 3, 0, 0, 0, 0, 0, 0, 0, 11]));
    for (const patch of [{ player: 0 }, { zone: 16 }, { index: 1 }, { command: 11.5 }, { command: 14 }]) {
      expect(() => encodeDuelResponse(s, { type: 'action', player: 1, zone: 3, index: 0, command: 11, ...patch } as DuelResponse)).toThrow();
    }
  });
});
