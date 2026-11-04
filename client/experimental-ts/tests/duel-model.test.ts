import { describe, expect, it } from 'vitest';
import { W } from '../../../server/src/net/proto';
import { engine, set_card, setcommand, comid_field, comid_hand, request_input, listItem } from '../../../server/src/duel/translator/lockstep';
import { client_hand_perm } from '../../../server/src/duel/translator/helpers';
import { concat, packBIIII } from '../../../server/src/duel/translator/py';
import { createDuelState, reduceDuelMessage, acknowledgePresentation, MAX_PRESENTATION_EVENTS, shufflePermutation } from '../src/duel/model';
import { decodeCommands, decodeList, DuelProtocolError } from '../src/duel/decode';
import type { DuelState } from '../src/duel/types';

const cmd = (state: DuelState, bytes: Uint8Array) => reduceDuelMessage(state, { id: 0x6202, data: bytes });
const start = () => cmd(createDuelState(), engine(1));
function deck(n = 5): DuelState {
  let state = start();
  for (let i = 0; i < n; i++) state = cmd(state, set_card(0, 13, i, 10000 + i, i + 1));
  return state;
}

describe('deterministic client duel model', () => {
  it('decodes v2 passcodes without narrowing to old card identifiers', () => {
    const records = decodeCommands(set_card(0, 13, 0, 89631139, 1));
    expect(records[0].params[3]).toBe(89631139);
    expect(records[0].indexSlots).toBe(8);
  });
  it('accepts legacy pointer-free finish records from shared server helpers', () => {
    const data = setcommand(0x4d, 0, [1, 0]).slice(0, 40);
    expect(cmd(start(), data).result).toEqual({ result: 1, mode: 0 });
  });
  it('draws known cards in exact server-imposed deck order', () => {
    const before = deck();
    const state = cmd(before, engine(0x55, 0, 0xffff, 3));
    expect(state.sides[0].deck).toEqual([8, 10]);
    expect(state.sides[0].hand).toEqual([2, 4, 6]);
    expect(state.cards[6]).toMatchObject({ zone: 'hand', index: 2, faceUp: true });
    expect(before.sides[0].hand).toEqual([]);
  });
  it('moves hand cards to monster/spell slots with authoritative positions', () => {
    let state = cmd(deck(), engine(0x55, 0, 0xffff, 3));
    state = cmd(state, engine(0x4f, 0, 0, (2 << 1) | 0xc000, (2 << 1) | 1));
    state = cmd(state, engine(0x50, 0, 0, (6 << 1) | 0x4000, 4));
    expect(state.sides[0].monster[2]).toBe(2);
    expect(state.cards[2]).toMatchObject({ faceUp: true, defense: true, zone: 'monster' });
    expect(state.sides[0].spell[1]).toBe(4);
    expect(state.cards[4]).toMatchObject({ faceUp: true, defense: false, zone: 'spell' });
    expect(state.sides[0].hand).toEqual([6]);
  });
  it('moves a destroyed monster to the end of its graveyard and compacts hand moves', () => {
    let state = cmd(deck(), engine(0x55, 0, 0xffff, 3));
    state = cmd(state, engine(0x2d, 0, 0x4000, 2));
    state = cmd(state, engine(0x31, 0, 0, 14, 2));
    expect(state.sides[0].monster[0]).toBe(null);
    expect(state.sides[0].grave).toEqual([2]);
    expect(state.cards[2]).toMatchObject({ zone: 'grave', index: 0, faceUp: true });
    expect(state.cards[4].index).toBe(0);
  });
  it('uses UID bits rather than pile index for packed card moves', () => {
    let state = cmd(deck(), engine(0x55, 0, 0xffff, 3));
    const source = (11 << 1) | (4 << 6), dest = 14 << 1;
    state = cmd(state, engine(0x3f, 0, source, dest));
    expect(state.sides[0].hand).toEqual([2, 6]);
    expect(state.sides[0].grave).toEqual([4]);
    expect(state.errors).toEqual([]);
  });
  it('updates turn from ending player and phase from active player', () => {
    let state = cmd(start(), engine(0x0e, 0));
    expect([state.turnPlayer, state.turn, state.phase]).toEqual([0, 1, 'main1']);
    state = cmd(state, engine(4, 0));
    expect([state.turnPlayer, state.turn]).toEqual([1, 2]);
    state = cmd(state, engine(0x0c, 1));
    expect(state.phase).toBe('draw');
  });
  it('toggles face and defense flags independently for flip summons and face-down effects', () => {
    let state = cmd(deck(), engine(0x55, 0, 0xffff, 1));
    state = cmd(state, engine(0x4f, 0, 0, 0x8000, 5));
    expect(state.cards[2]).toMatchObject({ faceUp: false, defense: true });
    state = cmd(state, engine(0x34, 0, 0, 1, 1));
    expect(state.cards[2]).toMatchObject({ faceUp: true, defense: false });
    state = cmd(state, engine(0x34, 0, 0, 1, 0));
    expect(state.cards[2]).toMatchObject({ faceUp: false, defense: true });
    state = cmd(state, engine(0x35, 0, 0, 1));
    expect(state.cards[2]).toMatchObject({ faceUp: true, defense: true });
  });
  it('returns controlled monsters to their owner graveyard, not the controller graveyard', () => {
    let state = cmd(start(), set_card(1, 0, 2, 123, 1, 0));
    state = cmd(state, engine(0x31, 1, 2, 14, 2));
    expect(state.sides[0].grave).toEqual([2]);
    expect(state.sides[1].grave).toEqual([]);
  });
  it('updates authoritative LP independently of battle presentation', () => {
    let state = cmd(start(), engine(0x17, 0, 0, 1900, 0));
    expect(state.sides[1].lp).toBe(8000);
    state = cmd(state, engine(0x25, 1, 1900, 1));
    state = cmd(state, engine(0x24, 1, 500));
    expect(state.sides[1].lp).toBe(6600);
    state = cmd(state, engine(0x26, 1, 1234));
    expect(state.sides[1].lp).toBe(1234);
  });
  it('retains hidden categories without exposing placeholder passcodes as real cards', () => {
    let state = cmd(start(), set_card(1, 13, 0, 0xffffff01, 1));
    state = cmd(state, engine(0x55, 1, 0xffff, 1));
    expect(state.cards[3]).toMatchObject({ passcode: null, hiddenKind: 'monster', faceUp: false });
  });
  it('decodes field, hand and phase permissions into explicit legal actions', () => {
    let state = start();
    state = reduceDuelMessage(state, { id: 0x6611, data: comid_field(new Map([['0,2', 1 << 0]]), null, new Map([['0,3', 1], ['0,5', 1]])) });
    state = reduceDuelMessage(state, { id: 0x6612, data: comid_hand([[0, 0, (1 << 4) | (1 << 6)]]) });
    state = cmd(state, request_input(3));
    expect(state.prompt?.actions).toContainEqual({ player: 0, zone: 2, index: 0, command: 0, label: 'Attack' });
    expect(state.prompt?.actions).toContainEqual({ player: 0, zone: 11, index: 0, command: 4, label: 'Summon' });
    expect(state.prompt?.buttons).toEqual([3, 5]);
  });
  it('retains dialog text/card pairs and validates numeric ranges', () => {
    let state = cmd(start(), setcommand(0x60, 0, [1]));
    state = cmd(state, setcommand(0x61, 0, [301, 2]));
    state = cmd(state, setcommand(0x1b, 0x32, [11, 0, (302 | (1 << 16) | (4 << 24)) >>> 0]));
    expect(state.prompt?.options).toEqual([{ value: 1, label: '1000 LP' }, { value: 2, label: '2000 LP' },
      { value: 3, label: '3000 LP' }, { value: 4, label: '4000 LP' }]);
    expect(state.prompt?.text).toEqual([{ value: 301, kind: 2 }]);
  });
  it('decodes passcode card lists and their explicit exact-card count', () => {
    const data = concat(packBIIII(0, 8, 0, 2, 0), listItem(89631139, 1, 0), listItem(46986414, 2, 0));
    expect(decodeList(data).items[0].passcode).toBe(89631139);
    let state = reduceDuelMessage(start(), { id: 0x6610, data });
    state = cmd(state, setcommand(0x1b, 0x33, [0, 8, 0]));
    expect(state.prompt).toMatchObject({ kind: 'cards', min: 2, max: 2 });
  });
  it('marks unknown categories explicitly and does not invent state changes', () => {
    const state = cmd(start(), engine(0xfff, 0));
    expect(state.unsupported).toHaveLength(1);
    expect(state.sides[0].lp).toBe(8000);
  });
  it('rejects truncated/oversized lists before allocating item arrays', () => {
    expect(() => decodeList(packBIIII(0, 8, 0, 0xffffffff, 0))).toThrow(DuelProtocolError);
    expect(() => decodeCommands(new Uint8Array(42))).toThrow(DuelProtocolError);
  });
  it('rejects malformed compound packets transactionally', () => {
    const before = deck();
    const valid = engine(0x25, 0, 500), invalid = set_card(9, 13, 0, 123, 0);
    // set_card masks its player; construct an invalid zone instead.
    new DataView(invalid.buffer).setUint32(12, 99);
    const after = cmd(before, concat(valid, invalid));
    expect(after.sides).toEqual(before.sides);
    expect(after.errors).toHaveLength(1);
    expect(after.sequence).toBe(before.sequence + 1);
  });
  it('keeps the animation queue bounded without losing authoritative LP', () => {
    let state = start();
    for (let i = 0; i < MAX_PRESENTATION_EVENTS + 20; i++) state = cmd(state, engine(0x25, 0, 1));
    expect(state.events).toHaveLength(MAX_PRESENTATION_EVENTS);
    expect(state.droppedPresentationEvents).toBeGreaterThan(0);
    expect(state.sides[0].lp).toBe(8000 - MAX_PRESENTATION_EVENTS - 20);
    expect(acknowledgePresentation(state, state.sequence).events).toEqual([]);
  });
  it('matches original deterministic shuffle seeds across hand sizes', () => {
    for (const seed of [0, 1, 0xffffffff, 0x12345678]) for (let n = 0; n < 25; n++) {
      expect(shufflePermutation(seed, n)).toEqual(client_hand_perm(seed, n));
    }
  });
  it('decodes signed timer values without using wall-clock time in state', () => {
    const data = new W().u8(1).u32(100).u8(1).u32(0xffffffff).bytes();
    expect(reduceDuelMessage(start(), { id: 0x6461, data }).timer).toEqual({ player: 1, seconds: 100, paused: true, otherSeconds: -1 });
  });
  it('bounds unknown variable and chain storage across hostile or long message streams', () => {
    let state = start();
    for (let i = 2; i < 300; i++) {
      state = cmd(state, setcommand(0x1e, 0, [i, i]));
      state = cmd(state, engine(0x12, 0, 0, 0, i));
    }
    expect(Object.keys(state.variables)).toHaveLength(0); expect(state.chain.length).toBeLessThanOrEqual(256);
    expect(state.unsupported.length).toBeLessThanOrEqual(64); expect(state.events.length).toBeLessThanOrEqual(256);
  });
});
