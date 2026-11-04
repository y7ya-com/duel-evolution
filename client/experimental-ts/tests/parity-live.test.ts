import { describe, expect, it } from 'vitest';
import { LiveCapture, captureDownload } from '../src/parity/live';
import type { CaptureChannel } from '../src/parity/live';
import { compareReplay, parseTrace, replay } from '../src/parity/replay';
import { duelReplayAdapter } from '../src/parity/duel-adapter';
import { command, syntheticDuelTrace } from '../src/parity/synthetic';
import type { WireMessage } from '../src/network/codec';

const channel = (id = 5, port = 5732): CaptureChannel => ({ id, port });
const packet = (b = 4): WireMessage => ({ id: 0x6202, param: 1, data: command(0, b) });
const init = (): WireMessage => packet(1);
const messages = (capture: LiveCapture) => parseTrace(capture.export()).records.filter(r => r.kind === 'message');

function initialized(): { capture: LiveCapture; ch: CaptureChannel } {
  const capture = new LiveCapture(), ch = channel(); capture.start(); capture.receive(ch, init(), 'duel');
  return { capture, ch };
}

describe('explicit live capture lifecycle', () => {
  it('does not observe or retain anything before start, after stop, or after dispose', () => {
    const capture = new LiveCapture(), ch = channel();
    const empty = capture.export();
    capture.receive(ch, init(), 'duel'); capture.outgoing(ch, init(), 'duel');
    capture.open(ch, 'duel'); capture.close(ch); capture.sessionBoundary();
    expect(capture.export()).toBe(empty); expect(capture.status.state).toBe('idle');
    capture.start(); capture.receive(ch, init(), 'duel');
    expect(capture.status.recording).toBe(true); capture.stop();
    const stopped = capture.export();
    capture.receive(ch, packet(), 'duel'); capture.outgoing(ch, packet(), 'duel');
    capture.open(ch); capture.close(ch); capture.sessionBoundary(); capture.stop();
    expect(capture.export()).toBe(stopped); expect(capture.status.state).toBe('stopped');
    capture.dispose(); expect(capture.export()).toBe(empty);
    capture.start(); capture.reset(); capture.receive(ch, init(), 'duel'); capture.dispose();
    expect(capture.status.state).toBe('disposed'); expect(capture.export()).toBe(empty);
  });
  it('starts a fresh capture after stop, preserves an active capture on repeated start, and resets to idle', () => {
    const { capture, ch } = initialized(), before = capture.export();
    capture.start(); expect(capture.export()).toBe(before);
    const status = capture.status;
    Object.assign(status, { records: 999, state: 'disposed' });
    expect(capture.status.state).toBe('recording'); expect(capture.status.records).not.toBe(999);
    capture.stop(); capture.start(); expect(capture.status.records).toBe(0);
    capture.receive(ch, init(), 'duel'); capture.reset();
    expect(capture.status).toMatchObject({ state: 'idle', partial: false, records: 0, initializedDuels: 0 });
    capture.receive(ch, init(), 'duel'); expect(capture.status.records).toBe(0);
  });
  it('closes only matching generations, and separates reconnects and explicit reopens', () => {
    const { capture, ch } = initialized();
    const replacement = channel(); // same transport id and port; new session/channel object
    capture.receive(replacement, init(), 'duel');
    capture.close(ch); // stale old callback must not close replacement
    capture.receive(replacement, packet(), 'duel');
    capture.close(replacement); capture.close(replacement);
    capture.open(replacement, 'duel'); capture.receive(replacement, init());
    capture.open(replacement, 'duel'); capture.receive(replacement, init());
    capture.sessionBoundary(); capture.receive(replacement, init(), 'duel'); capture.stop();
    const trace = parseTrace(capture.export());
    const opens = trace.records.filter(r => r.kind === 'open');
    expect(new Set(opens.map(r => r.channel)).size).toBe(opens.length);
    expect(compareReplay(trace, duelReplayAdapter).deterministic).toBe(true);
    expect(capture.status.initializedDuels).toBe(5);
    expect(capture.status.partial).toBe(false);
  });
  it('handles simultaneous ports/streams without cross-channel state or transport metadata', () => {
    const capture = new LiveCapture(); capture.start();
    const a = channel(913045, 5740), b = channel(913045, 5741), c = channel(913046, 5740);
    for (const ch of [a, b, c]) capture.receive(ch, init(), 'duel');
    capture.receive(a, packet(), 'account'); // explicit stream change creates fresh redacted stream
    const trace = parseTrace(capture.export());
    expect(Object.keys(replay(trace, duelReplayAdapter).states)).toHaveLength(3);
    expect(messages(capture).at(-1)).toMatchObject({ stream: 'auth', redacted: true });
    expect(capture.export()).not.toContain('913045'); expect(capture.export()).not.toContain('5740');
  });
});

describe('live redaction and midduel replay gate', () => {
  it('drops auth, account, lobby, unknown and outgoing payloads/params without serializing extra fields', () => {
    const { capture, ch } = initialized();
    const secret = 'password login auth cookie token';
    const msg = { id: 0x3003, param: 987654321, data: new TextEncoder().encode(secret), password: secret };
    const secretChannel = Object.assign(channel(42), { cookies: secret });
    capture.receive(secretChannel, msg); // default never infers duel from ids
    capture.receive(secretChannel, { ...msg, id: 0x6202 });
    capture.receive(channel(43), msg, 'lobby');
    capture.receive(ch, msg, 'duel');
    capture.outgoing(ch, { ...msg, id: 0x6202 }, 'duel');
    capture.receive(ch, { ...msg, id: 0x3001 }, 'duel');
    const records = messages(capture).slice(1);
    expect(records).toHaveLength(6);
    expect(records.every(r => r.hex === '' && r.param === 0 && r.redacted)).toBe(true);
    const json = capture.export();
    expect(json).not.toContain(secret); expect(json).not.toContain('987654321');
    expect(json).not.toContain(Array.from(msg.data, byte => byte.toString(16).padStart(2, '0')).join(''));
    expect(capture.status.gateEligible).toBe(false);
  });
  it('redacts partial packets until first-command DUEL_INIT and never credits the missing prefix', () => {
    const capture = new LiveCapture(), ch = channel(); capture.start();
    capture.receive(ch, packet(), 'duel');
    capture.receive(ch, { id: 0x6461, param: 3, data: new Uint8Array(10) }, 'duel');
    const initAfterOther = new Uint8Array(86); initAfterOther.set(packet().data); initAfterOther.set(init().data, 43);
    capture.receive(ch, { ...packet(), data: initAfterOther }, 'duel');
    capture.receive(ch, { ...packet(), data: new Uint8Array([1]) }, 'duel');
    expect(capture.status).toMatchObject({ partial: true, initializedDuels: 0, gateEligible: false });
    let result = replay(parseTrace(capture.export()), duelReplayAdapter);
    expect(result.processed).toBe(0); expect(result.supported).toBe(0); expect(result.skipped).toBe(4);
    capture.receive(ch, init(), 'duel'); capture.receive(ch, packet(), 'duel'); capture.stop();
    expect(messages(capture).slice(0, 4).every(r => r.stream === 'game' && r.redacted)).toBe(true);
    result = replay(parseTrace(capture.export()), duelReplayAdapter);
    expect(result.processed).toBe(2); expect(result.supported).toBe(2);
    expect(capture.status.partial).toBe(true);
    expect(captureDownload(capture).filename).toBe('duel-capture-partial.json');
  });
  it('requires initialization again after every reopen and never borrows a prior duel state', () => {
    const { capture, ch } = initialized(); capture.close(ch);
    capture.receive(ch, packet(), 'duel');
    expect(messages(capture).at(-1)).toMatchObject({ redacted: true, stream: 'game' });
    expect(capture.status.partial).toBe(true);
    expect(replay(parseTrace(capture.export()), duelReplayAdapter).processed).toBe(1);
  });
  it('copies payloads, reproduces the current duel sequence deterministically, and provides a passive Blob artifact', async () => {
    const source = syntheticDuelTrace().snapshot();
    const capture = new LiveCapture(), ch = channel(); capture.start(); capture.open(ch, 'duel');
    for (const record of source.records.filter(r => r.kind === 'message')) {
      const data = Uint8Array.from(record.hex.match(/../g) ?? [], h => parseInt(h, 16));
      capture.receive(ch, { id: record.id, param: record.param, data }, 'duel'); data.fill(255);
    }
    capture.close(ch); capture.stop();
    const trace = parseTrace(capture.export()), compared = compareReplay(trace, duelReplayAdapter);
    expect(compared.deterministic).toBe(true);
    const baseline = replay(source, duelReplayAdapter);
    expect(compared.first.checkpoints).toEqual(baseline.checkpoints);
    expect(compared.first.outputsDigest).toBe(baseline.outputsDigest);
    expect(compared.first.supportedOpcodeCounts).toEqual(baseline.supportedOpcodeCounts);
    expect(capture.status).toMatchObject({ partial: false, initializedDuels: 1, gateEligible: false });
    const before = capture.export(), download = captureDownload(capture);
    expect(download.filename).toBe('duel-capture.json'); expect(download.blob.type).toBe('application/json');
    expect(await download.blob.text()).toBe(before); expect(capture.export()).toBe(before);
    expect(capture.status.jsonBytes).toBe(download.blob.size);
  });
});

describe('bounded live capture fails closed without affecting gameplay', () => {
  it('stops at the exact record bound and ignores all subsequent input', () => {
    const capture = new LiveCapture({ records: 2 }), ch = channel(); capture.start();
    capture.receive(ch, packet()); expect(capture.status.records).toBe(2);
    const before = capture.export();
    expect(() => capture.receive(ch, packet())).not.toThrow();
    expect(capture.status).toMatchObject({ state: 'limit', recording: false, records: 2 });
    expect(capture.status.reason).toContain('capacity');
    capture.receive(ch, init(), 'duel'); capture.open(ch); capture.close(ch); capture.sessionBoundary(); capture.stop();
    expect(capture.export()).toBe(before); expect(parseTrace(before).records).toHaveLength(2);
    capture.start(); expect(capture.status).toMatchObject({ state: 'recording', records: 0, reason: null });
  });
  it('checks payload and accumulated retained byte bounds, including oversized redacted packets', () => {
    const ch = channel();
    const oversized = new LiveCapture({ payloadBytes: 1 }); oversized.start();
    expect(() => oversized.receive(ch, packet())).not.toThrow();
    expect(oversized.status).toMatchObject({ state: 'limit', records: 0 });
    const capture = new LiveCapture({ totalBytes: 43 }); capture.start(); capture.receive(ch, init(), 'duel');
    expect(capture.status.payloadBytes).toBe(43); const before = capture.export();
    capture.receive(ch, packet(), 'duel'); expect(capture.status.state).toBe('limit');
    expect(capture.export()).toBe(before); expect(parseTrace(before).records).toHaveLength(capture.status.records);
  });
  it('accounts for JSON bytes incrementally and keeps every export valid at the exact cap', () => {
    const reference = new LiveCapture(), ch = channel(); reference.start(); reference.receive(ch, packet());
    const json = reference.export(), jsonBytes = new TextEncoder().encode(json).length;
    const capture = new LiveCapture({ jsonBytes }); capture.start(); capture.receive(ch, packet());
    expect(capture.export()).toBe(json); expect(capture.status.jsonBytes).toBe(jsonBytes);
    capture.close(ch); expect(capture.status.state).toBe('limit'); expect(capture.export()).toBe(json);
    expect(parseTrace(capture.export(), { jsonBytes }).records).toHaveLength(2);
    expect(() => new LiveCapture({ jsonBytes: 1 })).toThrow(RangeError);
    expect(() => new LiveCapture({ records: 0 })).toThrow(RangeError);
  });
  it('contains malformed callback input with fixed diagnostics and does not leak private exception text', () => {
    const capture = new LiveCapture(); capture.start();
    const ch = channel();
    expect(() => capture.receive(ch, { ...init(), param: -1 }, 'duel')).not.toThrow();
    expect(capture.status).toMatchObject({ state: 'error', recording: false, records: 0 });
    capture.start();
    const malicious = { get id(): number { throw new Error('password-PRIVATE'); }, port: 1 };
    expect(() => capture.open(malicious)).not.toThrow();
    expect(capture.status.state).toBe('error'); expect(capture.status.reason).not.toContain('PRIVATE');
    expect(capture.export()).not.toContain('PRIVATE');
    capture.start(); capture.open(channel(-1)); expect(capture.status.state).toBe('error');
    capture.start(); capture.receive(channel(), init(), 'invalid' as 'duel'); expect(capture.status.state).toBe('error');
    capture.stop();
    // Off-state callbacks must not even read caller-owned properties.
    expect(() => capture.open(malicious)).not.toThrow();
  });
});
