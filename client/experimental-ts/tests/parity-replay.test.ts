import { describe, expect, it } from 'vitest';
import { canonical, compareReplay, HARD_LIMITS, parseTrace, replay, stateDigest, WireRecorder } from '../src/parity/replay';
import type { ReplayAdapter, WireTrace } from '../src/parity/replay';

const message = (n = 3) => ({ id: 0x6202, param: 1, data: new Uint8Array([n]) });
const adapter: ReplayAdapter<{ total: number }> = {
  initial: () => ({ total: 0 }),
  apply: (state, msg) => ({ state: { total: state.total + msg.data[0] }, outputs: [msg.data[0]], supported: true, opcodes: ['synthetic-add'] }),
};
function recorded(): WireRecorder { const recorder = new WireRecorder(); recorder.open(1, 'duel'); recorder.message(1, 'in', message()); return recorder; }
function mutate(fn: (trace: WireTrace) => void): string { const trace = recorded().snapshot(); fn(trace); return JSON.stringify(trace); }

describe('bounded wire recording and strict import', () => {
  it('round-trips detached snapshots and payload copies', () => {
    const recorder = new WireRecorder(); recorder.open(1, 'duel');
    const msg = message(); recorder.message(1, 'in', msg); msg.data[0] = 99;
    const snapshot = recorder.snapshot(); snapshot.records[1].hex = 'aa';
    expect(recorder.snapshot().records[1].hex).toBe('03'); recorder.close(1);
    expect(parseTrace(recorder.serialize())).toEqual(recorder.snapshot());
  });
  it('never persists auth/login bodies, tokens in params, or unknown/outgoing payloads', () => {
    const recorder = new WireRecorder(); const secret = new TextEncoder().encode('PASSWORD TOKEN LOGIN-BODY');
    for (const [channel, stream] of [[1, 'auth'], [2, 'game'], [3, 'duel']] as const) {
      recorder.open(channel, stream);
      recorder.message(channel, 'in', { id: 0x3003, param: 123456, data: secret });
      recorder.message(channel, 'out', { id: 0x6202, param: 123456, data: secret });
    }
    const json = recorder.serialize(); expect(json).not.toContain('123456');
    expect(json).not.toContain('50415353574f5244');
    expect(recorder.snapshot().records.filter(r => r.kind === 'message').every(r => r.redacted && r.hex === '' && r.param === 0)).toBe(true);
    expect(parseTrace(json)).toEqual(recorder.snapshot());
  });
  it('rejects illegal lifecycle ordering and channel reuse', () => {
    const recorder = new WireRecorder(); expect(() => recorder.message(1, 'in', message())).toThrow();
    expect(() => recorder.close(1)).toThrow(); recorder.open(1, 'duel');
    expect(() => recorder.open(1, 'duel')).toThrow(); recorder.close(1);
    expect(() => recorder.message(1, 'in', message())).toThrow(); expect(() => recorder.open(1, 'duel')).toThrow();
    expect(() => parseTrace(mutate(t => t.records.reverse()))).toThrow();
    expect(() => parseTrace(mutate(t => { t.records[1].stream = 'game'; }))).toThrow();
    expect(() => parseTrace(mutate(t => { t.records.shift(); t.records[0].sequence = 0; }))).toThrow();
  });
  it('accepts exact record/byte caps and rejects overflow atomically', () => {
    const recorder = new WireRecorder({ records: 2, payloadBytes: 1, totalBytes: 1 });
    recorder.open(1, 'duel'); recorder.message(1, 'in', message());
    expect(() => recorder.close(1)).toThrow(/capacity/); expect(recorder.snapshot().records).toHaveLength(2);
    expect(parseTrace(recorder.serialize(), { records: 2, payloadBytes: 1, totalBytes: 1 })).toEqual(recorder.snapshot());
    expect(() => parseTrace(recorder.serialize(), { records: 1 })).toThrow();
    const bytes = new WireRecorder({ totalBytes: 1 }); bytes.open(1, 'duel'); bytes.message(1, 'in', message());
    expect(() => bytes.message(1, 'in', message())).toThrow(/capacity/); expect(bytes.snapshot().records).toHaveLength(2);
    expect(() => new WireRecorder({ records: HARD_LIMITS.records + 1 })).toThrow();
    for (const records of [0, -1, NaN, Infinity, 1.5]) expect(() => new WireRecorder({ records })).toThrow();
  });
  it('enforces the actual hard maximum record count', () => {
    const recorder = new WireRecorder(); recorder.open(1, 'auth');
    for (let i = 1; i < HARD_LIMITS.records; i++) recorder.message(1, 'in', { id: 0x3003, param: 0, data: new Uint8Array() });
    expect(() => recorder.message(1, 'in', message())).toThrow(/capacity/);
    expect(parseTrace(recorder.serialize()).records).toHaveLength(HARD_LIMITS.records);
  });
  it('rejects corrupt records, injected metadata and credentials', () => {
    const corruptions: ((t: WireTrace) => void)[] = [
      t => { t.version = 2 as 1; }, t => { t.records[1].sequence = 7; },
      t => { t.records[1].hex = 'f'; }, t => { t.records[1].hex = 'GG'; },
      t => { t.records[1].param = -1; }, t => { t.records[1].id = 0x10000; },
      t => { t.records[1].redacted = true; }, t => { t.records[1].id = 0x3003; },
      t => { Object.assign(t, { token: 'must reject' }); },
      t => { Object.assign(t.records[1], { password: 'must reject' }); },
      t => { t.records[0].hex = 'ff'; }, t => { t.records[0].param = 1; },
    ];
    for (const corrupt of corruptions) expect(() => parseTrace(mutate(corrupt))).toThrow();
    expect(() => parseTrace('{')).toThrow(); expect(() => parseTrace('null')).toThrow();
    expect(() => parseTrace(recorded().serialize(), { jsonBytes: 10 })).toThrow();
    expect(() => replay({ version: 2, records: [] } as unknown as WireTrace, adapter)).toThrow();
  });
});

describe('deterministic replay', () => {
  it('compares the same initial trace, complete checkpoints, final state and outputs', () => {
    const trace = recorded(); trace.message(1, 'in', message(5));
    const compared = compareReplay(trace.snapshot(), adapter);
    expect(compared.deterministic).toBe(true); expect(compared.first.states[1]).toEqual({ total: 8 });
    expect(compared.first.supportedOpcodeCounts).toEqual({ 'synthetic-add': 2 });
    expect(compared.first.wireCounts).toEqual({ '0x6202': 2 });
    expect(compared.first.processed).toBe(2); expect(compared.first.checkpoints).toHaveLength(2);
  });
  it('detects intermediate divergence even when final state converges', () => {
    let calls = 0;
    const drifting: ReplayAdapter<{ total: number }> = { ...adapter,
      apply: () => ({ state: { total: 0 }, outputs: [++calls], supported: true, opcodes: ['drift'] }) };
    expect(compareReplay(recorded().snapshot(), drifting).deterministic).toBe(false);
  });
  it('keeps channels isolated, preserves order, and reports redactions as skipped', () => {
    const recorder = recorded(); recorder.open(2, 'duel'); recorder.message(2, 'in', message(7));
    recorder.open(3, 'auth'); recorder.message(3, 'in', { id: 0x3003, param: 1, data: new Uint8Array([255]) });
    const result = replay(recorder.snapshot(), adapter);
    expect(result.states).toEqual({ 1: { total: 3 }, 2: { total: 7 } }); expect(result.skipped).toBe(1);
    expect(result.supported).toBe(2); expect(result.wireCounts['0x3003']).toBe(1);
  });
  it('does not credit rejected or unsupported packets', () => {
    const rejecting: ReplayAdapter<{ total: number }> = { ...adapter, apply: state => ({ state, outputs: [], supported: false, opcodes: ['not-supported'] }) };
    const result = replay(recorded().snapshot(), rejecting);
    expect(result.unsupported).toBe(1); expect(result.supportedOpcodeCounts).toEqual({});
    expect(result.unsupportedWireCounts).toEqual({ '0x6202': 1 });
  });
  it('has stable key-independent digests that change with state', () => {
    expect(stateDigest({ b: [1, 2], a: 3 })).toBe(stateDigest({ a: 3, b: [1, 2] }));
    expect(stateDigest({ a: 3 })).not.toBe(stateDigest({ a: 4 }));
    expect(canonical(new Uint8Array([3, 4]))).toBe('[3,4]');
    for (const value of [undefined, NaN, Infinity, new Map(), { a: undefined }]) expect(() => canonical(value)).toThrow();
    const cyclic: unknown[] = []; cyclic.push(cyclic); expect(() => canonical(cyclic)).toThrow();
  });
});
