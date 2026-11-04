import { describe, expect, it } from 'vitest';
import { createDuelState, MAX_DIAGNOSTICS, reduceDuelMessage } from '../src/duel/model';
import { duelReplayAdapter } from '../src/parity/duel-adapter';
import { compareReplay, WireRecorder } from '../src/parity/replay';
import { command, syntheticDuelTrace } from '../src/parity/synthetic';

describe('new browser duel reducer replay (synthetic evidence only)', () => {
  it('replays init, turn, phase, LP and end with identical states and presentation outputs', () => {
    const result = compareReplay(syntheticDuelTrace().snapshot(), duelReplayAdapter);
    expect(result.deterministic).toBe(true); expect(result.first.supported).toBe(12);
    expect(result.first.states[1].sides[0].lp).toBe(6500); expect(result.first.states[1].turn).toBe(2);
    expect(result.first.states[1].phase).toBe('draw'); expect(result.first.states[1].status).toBe('finished');
    expect(result.first.states[1].result).toEqual({ result: 1, mode: 0 });
    expect(result.first.states[1].timer).toEqual({ player: 1, seconds: 60, paused: false, otherSeconds: 45 });
    expect(result.first.states[1].list).toEqual({ owner: 0, mode: 0, items: [] });
    expect(result.first.states[1].events.some(event => event.type === 'score' && event.params.join(',') === '1,2,3,4,5,6,7,8,9')).toBe(true);
    expect(result.first.states[1].events.some(event => event.type === 'server-notice')).toBe(true);
    expect(result.first.supportedOpcodeCounts).toEqual({
      '0x6461': 1, '0x6610': 1, '0x6611': 1, '0x6612': 1, '0x6613': 1, '0x649b': 1,
      '0x6202/kind:0x0/b:0x1': 1, '0x6202/kind:0x0/b:0x4': 1,
      '0x6202/kind:0x0/b:0xc': 1, '0x6202/kind:0x0/b:0x26': 1,
      '0x6202/kind:0x0/b:0x25': 1, '0x6202/kind:0x4d/b:0x0': 1,
    });
  });
  it('does not credit unknown or truncated packets, or batched partial support', () => {
    for (const data of [command(0xfefe, 0), new Uint8Array([1]), new Uint8Array([...command(0, 1), ...command(0xfefe)]), new Uint8Array([...command(0xfefe), ...command(0, 1)])]) {
      const recorder = new WireRecorder(); recorder.open(1, 'duel'); recorder.message(1, 'in', { id: 0x6202, param: 1, data });
      const result = compareReplay(recorder.snapshot(), duelReplayAdapter);
      expect(result.deterministic).toBe(true); expect(result.first.unsupported).toBe(1);
      expect(result.first.supportedOpcodeCounts).toEqual({});
    }
  });
  it('does not credit malformed payloads in other accepted wire families', () => {
    for (const id of [0x6461, 0x6610, 0x6611, 0x6612, 0x6613, 0x649b]) {
      const step = duelReplayAdapter.apply(createDuelState(), { id, param: 1, data: new Uint8Array() });
      expect(step.supported).toBe(false); expect(step.opcodes).toEqual([]);
      expect(step.state.errors.length).toBeGreaterThan(0);
    }
  });
  it('flags an illegal movement before the source card exists', () => {
    const step = duelReplayAdapter.apply(createDuelState(), { id: 0x6202, param: 1, data: command(0, 0x31, [0, 13, 0, 11, 0]) });
    expect(step.supported).toBe(false); expect(step.state.unsupported.length + step.state.errors.length).toBeGreaterThan(0);
  });
  it('detects repeated rejection after the diagnostic cap', () => {
    let state = createDuelState();
    const malformed = { id: 0x6202, param: 1, data: new Uint8Array([1]) };
    for (let i = 0; i < MAX_DIAGNOSTICS + 2; i++) state = reduceDuelMessage(state, malformed);
    expect(state.errors).toHaveLength(MAX_DIAGNOSTICS);
    expect(duelReplayAdapter.apply(state, malformed).supported).toBe(false);
  });
  it('detects unsupported events after their rolling queue fills', () => {
    let state = createDuelState(); const unknown = { id: 0x6202, param: 1, data: command(0xfefe) };
    for (let i = 0; i < MAX_DIAGNOSTICS + 2; i++) state = reduceDuelMessage(state, unknown);
    expect(duelReplayAdapter.apply(state, unknown).supported).toBe(false);
  });
});
