import { decodeCommands } from '../duel/decode';
import type { WireMessage } from '../network/codec';
import { SAFE_DUEL_IDS, WireRecorder } from './replay';
import type { Direction, Stream, TraceLimits, TraceRecord } from './replay';

export interface CaptureChannel { readonly id: number; readonly port: number }
export type CaptureStream = 'duel' | 'account' | 'lobby';
export type CaptureState = 'idle' | 'recording' | 'stopped' | 'limit' | 'error' | 'disposed';
export interface CaptureStatus {
  readonly state: CaptureState;
  readonly recording: boolean;
  readonly records: number;
  readonly payloadBytes: number;
  readonly jsonBytes: number;
  readonly partial: boolean;
  readonly initializedDuels: number;
  /** Capturing/replaying packets alone never verifies gameplay acceptance. */
  readonly gateEligible: false;
  readonly reason: string | null;
}
interface ActiveChannel { source: CaptureChannel; stream: CaptureStream; trace: number; initialized: boolean }
type Entry = Omit<TraceRecord, 'sequence'>;
const encoder = new TextEncoder();
const emptyBytes = encoder.encode(JSON.stringify({ version: 1, records: [] })).length;
const uint = (n: number, max: number): boolean => Number.isSafeInteger(n) && n >= 0 && n <= max;

/** Explicit opt-in capture of wire packets only. No app state or credentials are accepted.
 * Callback entrypoints contain failures so capture cannot interrupt gameplay.
 */
export class LiveCapture {
  private recorder: WireRecorder;
  private readonly limits: Readonly<TraceLimits>;
  private channels = new Map<string, ActiveChannel>();
  private state: CaptureState = 'idle';
  private reason: string | null = null;
  private count = 0;
  private bytes = 0;
  private jsonBytes = emptyBytes;
  private nextChannel = 0;
  private partial = false;
  private initializedDuels = 0;

  constructor(limits: Partial<TraceLimits> = {}) {
    this.recorder = new WireRecorder(limits); this.limits = this.recorder.limits;
    if (this.limits.jsonBytes < emptyBytes) throw new RangeError('Trace JSON limit cannot fit empty capture');
  }
  get status(): CaptureStatus {
    return { state: this.state, recording: this.state === 'recording', records: this.count,
      payloadBytes: this.bytes, jsonBytes: this.jsonBytes, partial: this.partial,
      initializedDuels: this.initializedDuels, gateEligible: false, reason: this.reason };
  }
  start(): void {
    if (this.state === 'disposed' || this.state === 'recording') return;
    this.reset(); this.state = 'recording';
  }
  stop(): void {
    if (this.state !== 'recording') return;
    this.state = 'stopped'; this.channels.clear();
  }
  reset(): void {
    if (this.state === 'disposed') return;
    this.recorder = new WireRecorder(this.limits); this.channels.clear();
    this.state = 'idle'; this.reason = null; this.count = 0; this.bytes = 0;
    this.jsonBytes = emptyBytes; this.nextChannel = 0; this.partial = false; this.initializedDuels = 0;
  }
  dispose(): void { this.reset(); this.state = 'disposed'; }
  export(): string { return this.recorder.serialize(); }

  open(channel: CaptureChannel, stream: CaptureStream = 'account'): void {
    this.guard(() => {
      const key = this.key(channel); this.validateStream(stream);
      const previous = this.channels.get(key);
      if (previous) this.end(previous);
      this.channels.set(key, this.begin(channel, stream));
    });
  }
  close(channel: CaptureChannel): void {
    this.guard(() => {
      const key = this.key(channel), active = this.channels.get(key);
      if (!active || active.source !== channel) return;
      this.end(active); this.channels.delete(key);
    });
  }
  sessionBoundary(): void {
    this.guard(() => {
      for (const active of this.channels.values()) this.end(active);
      this.channels.clear();
    });
  }
  receive(channel: CaptureChannel, message: WireMessage, stream?: CaptureStream): void {
    this.packet(channel, message, 'in', stream);
  }
  outgoing(channel: CaptureChannel, message: WireMessage, stream?: CaptureStream): void {
    this.packet(channel, message, 'out', stream);
  }
  private guard(action: () => void): void {
    if (this.state !== 'recording') return;
    try { action(); }
    catch (error) {
      this.state = error instanceof RangeError ? 'limit' : 'error';
      // Never copy exception text: it could contain caller-supplied private data.
      this.reason = this.state === 'limit' ? 'Capture capacity reached; recording stopped.' : 'Invalid capture input; recording stopped.';
      this.channels.clear();
    }
  }
  private key(channel: CaptureChannel): string {
    if (!uint(channel.id, 0xffffffff) || !uint(channel.port, 0xffff)) throw new Error('Invalid channel');
    return `${channel.id}:${channel.port}`;
  }
  private validateStream(stream: CaptureStream): void {
    if (!['duel', 'account', 'lobby'].includes(stream)) throw new Error('Invalid stream');
  }
  private traceStream(active: ActiveChannel): Stream {
    return active.stream === 'duel' ? (active.initialized ? 'duel' : 'game') : active.stream === 'account' ? 'auth' : 'lobby';
  }
  private append(entry: Entry, write: () => void): void {
    const added = encoder.encode(JSON.stringify({ sequence: this.count, ...entry })).length + (this.count ? 1 : 0);
    if (this.jsonBytes + added > this.limits.jsonBytes) throw new RangeError('JSON capacity');
    write(); this.count++; this.bytes += entry.hex.length / 2; this.jsonBytes += added;
  }
  private boundary(active: ActiveChannel, kind: 'open' | 'close'): void {
    this.append({ channel: active.trace, stream: this.traceStream(active), kind, direction: 'in', id: 0, param: 0, hex: '', redacted: false },
      () => kind === 'open' ? this.recorder.open(active.trace, this.traceStream(active)) : this.recorder.close(active.trace));
  }
  private begin(source: CaptureChannel, stream: CaptureStream, initialized = false): ActiveChannel {
    const active = { source, stream, trace: ++this.nextChannel, initialized };
    this.boundary(active, 'open'); return active;
  }
  private end(active: ActiveChannel): void { this.boundary(active, 'close'); }
  private packet(channel: CaptureChannel, message: WireMessage, direction: Direction, stream?: CaptureStream): void {
    this.guard(() => {
      const key = this.key(channel);
      if (!uint(message.id, 0xffff) || !uint(message.param, 0xffffffff) || !(message.data instanceof Uint8Array)) throw new Error('Invalid message');
      if (message.data.length > this.limits.payloadBytes) throw new RangeError('Payload capacity');
      let active = this.channels.get(key);
      const selectedStream = stream ?? active?.stream ?? 'account'; this.validateStream(selectedStream);
      if (active && (active.source !== channel || active.stream !== selectedStream)) {
        this.end(active); this.channels.delete(key); active = undefined;
      }
      if (!active) { active = this.begin(channel, selectedStream); this.channels.set(key, active); }
      if (active.stream === 'duel' && direction === 'in' && !active.initialized && SAFE_DUEL_IDS.has(message.id)) {
        let initialized = false;
        if (message.id === 0x6202) {
          try {
            const first = decodeCommands(message.data)[0];
            initialized = first.kind === 0 && (first.b & 0xfff) === 1;
          } catch { /* Malformed or midduel packets remain redacted. */ }
        }
        if (initialized) {
          this.end(active); active = this.begin(channel, 'duel', true);
          this.channels.set(key, active); this.initializedDuels++;
        } else this.partial = true;
      }
      const traceStream = this.traceStream(active);
      const safe = traceStream === 'duel' && direction === 'in' && SAFE_DUEL_IDS.has(message.id);
      // Construct only the recorder's allowlisted shape; never stringify message/channel objects.
      const hex = safe ? Array.from(message.data, byte => byte.toString(16).padStart(2, '0')).join('') : '';
      const entry: Entry = { channel: active.trace, stream: traceStream, kind: 'message', direction,
        id: message.id, param: safe ? message.param : 0, hex, redacted: !safe };
      const traceChannel = active.trace;
      this.append(entry, () => this.recorder.message(traceChannel, direction, message));
    });
  }
}

/** Creates an artifact only. The app owns explicit user action, object URLs and download UI. */
export function captureDownload(capture: LiveCapture): { blob: Blob; filename: string } {
  return { blob: new Blob([capture.export()], { type: 'application/json' }),
    filename: capture.status.partial ? 'duel-capture-partial.json' : 'duel-capture.json' };
}
