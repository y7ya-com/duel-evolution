import type { WireMessage } from '../network/codec';

export const TRACE_VERSION = 1;
export const HARD_LIMITS = { records: 20000, payloadBytes: 65535, totalBytes: 8 * 1024 * 1024, jsonBytes: 20 * 1024 * 1024 } as const;
export type TraceLimits = { [K in keyof typeof HARD_LIMITS]: number };
export type Stream = 'auth' | 'character' | 'game' | 'lobby' | 'duel';
export type Direction = 'in' | 'out';
// No auth/login, server-info strings, chat, account identifiers or outgoing bodies.
export const SAFE_DUEL_IDS: ReadonlySet<number> = new Set([0x6202, 0x6461, 0x6610, 0x6611, 0x6612, 0x6613, 0x649b]);
export interface TraceRecord {
  sequence: number; channel: number; stream: Stream; kind: 'open' | 'message' | 'close';
  direction: Direction; id: number; param: number; hex: string; redacted: boolean;
}
export interface WireTrace { version: 1; records: TraceRecord[] }
const streams = new Set<Stream>(['auth', 'character', 'game', 'lobby', 'duel']);
const hexOf = (data: Uint8Array): string => Array.from(data, b => b.toString(16).padStart(2, '0')).join('');
const unhex = (hex: string): Uint8Array => Uint8Array.from(hex.match(/../g) ?? [], b => parseInt(b, 16));
function limitsWith(options: Partial<TraceLimits>): TraceLimits {
  const limits = { ...HARD_LIMITS, ...options };
  for (const key of Object.keys(HARD_LIMITS) as (keyof TraceLimits)[]) {
    if (!Number.isSafeInteger(limits[key]) || limits[key] < 1 || limits[key] > HARD_LIMITS[key]) throw new RangeError(`Invalid trace limit: ${key}`);
  }
  return Object.freeze(limits);
}
function uint(n: unknown, max: number): n is number { return typeof n === 'number' && Number.isSafeInteger(n) && n >= 0 && n <= max; }
function exactKeys(value: object, keys: string[]): boolean { const got = Object.keys(value); return got.length === keys.length && got.every(k => keys.includes(k)); }
function safeBody(r: Pick<TraceRecord, 'stream' | 'direction' | 'id'>): boolean { return r.stream === 'duel' && r.direction === 'in' && SAFE_DUEL_IDS.has(r.id); }

/** Bounded, opt-in, in-memory recorder. Call open/message/close at the Channel boundary.
 * Exports contain no arbitrary metadata; authentication and outgoing payloads are always stripped.
 * No timestamp, URL, sid, HTTP request, token or password argument is accepted.
 */
export class WireRecorder {
  private records: TraceRecord[] = [];
  private active = new Map<number, Stream>();
  private used = new Set<number>();
  private payloadBytes = 0;
  readonly limits: Readonly<TraceLimits>;
  constructor(options: Partial<TraceLimits> = {}) { this.limits = limitsWith(options); }
  private append(r: Omit<TraceRecord, 'sequence'>): void {
    if (this.records.length >= this.limits.records || this.payloadBytes + r.hex.length / 2 > this.limits.totalBytes) throw new RangeError('Trace capacity exceeded');
    this.records.push({ sequence: this.records.length, ...r }); this.payloadBytes += r.hex.length / 2;
  }
  open(channel: number, stream: Stream): void {
    if (!uint(channel, 0xffffffff) || !streams.has(stream) || this.used.has(channel)) throw new Error('Invalid or reused trace channel');
    this.append({ channel, stream, kind: 'open', direction: 'in', id: 0, param: 0, hex: '', redacted: false });
    this.used.add(channel); this.active.set(channel, stream);
  }
  message(channel: number, direction: Direction, message: WireMessage): void {
    const stream = this.active.get(channel);
    if (!stream || !['in', 'out'].includes(direction)) throw new Error('Message outside open channel');
    if (!uint(message.id, 0xffff) || !uint(message.param, 0xffffffff) || !(message.data instanceof Uint8Array) || message.data.length > this.limits.payloadBytes) throw new Error('Invalid wire message');
    const safe = safeBody({ stream, direction, id: message.id });
    this.append({ channel, stream, kind: 'message', direction, id: message.id, param: safe ? message.param : 0, hex: safe ? hexOf(message.data) : '', redacted: !safe });
  }
  close(channel: number): void {
    const stream = this.active.get(channel); if (!stream) throw new Error('Close outside open channel');
    this.append({ channel, stream, kind: 'close', direction: 'in', id: 0, param: 0, hex: '', redacted: false }); this.active.delete(channel);
  }
  snapshot(): WireTrace { return { version: 1, records: this.records.map(r => ({ ...r })) }; }
  serialize(): string {
    const json = JSON.stringify(this.snapshot());
    if (new TextEncoder().encode(json).length > this.limits.jsonBytes) throw new RangeError('Trace JSON capacity exceeded');
    return json;
  }
}

/** Strict import rejects extra fields (including credentials), malformed bytes and lifecycle/order violations. */
export function parseTrace(json: string, options: Partial<TraceLimits> = {}): WireTrace {
  const limits = limitsWith(options);
  if (json.length > limits.jsonBytes || new TextEncoder().encode(json).length > limits.jsonBytes) throw new RangeError('Trace JSON capacity exceeded');
  const doc: unknown = JSON.parse(json);
  if (!doc || typeof doc !== 'object' || !exactKeys(doc, ['version', 'records'])) throw new Error('Invalid trace document');
  const d = doc as Record<string, unknown>;
  if (d.version !== TRACE_VERSION || !Array.isArray(d.records) || d.records.length > limits.records) throw new Error('Invalid trace version or count');
  const recorder = new WireRecorder(limits);
  for (const [sequence, value] of d.records.entries()) {
    if (!value || typeof value !== 'object' || !exactKeys(value, ['sequence', 'channel', 'stream', 'kind', 'direction', 'id', 'param', 'hex', 'redacted'])) throw new Error(`Invalid trace record ${sequence}`);
    const r = value as TraceRecord;
    if (r.sequence !== sequence || !uint(r.channel, 0xffffffff) || !streams.has(r.stream) || !uint(r.id, 0xffff) || !uint(r.param, 0xffffffff) || typeof r.hex !== 'string' || r.hex.length > limits.payloadBytes * 2 || !/^(?:[0-9a-f]{2})*$/.test(r.hex) || typeof r.redacted !== 'boolean' || !['in', 'out'].includes(r.direction)) throw new Error(`Invalid trace fields ${sequence}`);
    if (r.kind === 'open') recorder.open(r.channel, r.stream);
    else if (r.kind === 'close') recorder.close(r.channel);
    else if (r.kind === 'message') {
      if (r.redacted === safeBody(r) || (r.redacted && (r.hex !== '' || r.param !== 0))) throw new Error(`Unsafe trace body ${sequence}`);
      recorder.message(r.channel, r.direction, { id: r.id, param: r.param, data: unhex(r.hex) });
    } else throw new Error(`Invalid trace kind ${sequence}`);

  }
  const rebuilt = recorder.snapshot();
  if (canonical(rebuilt) !== canonical(doc)) throw new Error('Inconsistent trace records');
  return rebuilt;
}

/** Canonical JSON for deterministic states; rejects values JSON would silently lose. */
export function canonical(value: unknown): string {
  const seen = new Set<object>();
  function visit(v: unknown): string {
    if (v === null || typeof v === 'string' || typeof v === 'boolean') return JSON.stringify(v);
    if (typeof v === 'number' && Number.isFinite(v)) return JSON.stringify(v);
    if (v instanceof Uint8Array) return `[${Array.from(v).join(',')}]`;
    if (typeof v !== 'object' || v === null || seen.has(v)) throw new Error('Non-serializable replay state');
    seen.add(v);
    let result: string;
    if (Array.isArray(v)) result = `[${Array.from(v, visit).join(',')}]`;
    else {
      if (Object.getPrototypeOf(v) !== Object.prototype && Object.getPrototypeOf(v) !== null) throw new Error('Non-plain replay state');
      result = `{${Object.keys(v).sort().map(k => `${JSON.stringify(k)}:${visit((v as Record<string, unknown>)[k])}`).join(',')}}`;
    }
    seen.delete(v); return result;
  }
  return visit(value);
}
/** Compact FNV-1a diagnostic fingerprint, not a security hash. Equality uses full canonical state. */
export function stateDigest(state: unknown): string {
  let hash = 0x811c9dc5;
  for (const b of new TextEncoder().encode(canonical(state))) hash = Math.imul(hash ^ b, 0x01000193) >>> 0;
  return hash.toString(16).padStart(8, '0');
}
export interface ReplayStep<S> { state: S; outputs: unknown[]; supported: boolean; opcodes: string[] }
export interface ReplayAdapter<S> { initial(): S; apply(state: S, message: WireMessage): ReplayStep<S> }
export interface ReplayResult<S> {
  states: Record<number, S>; stateDigest: string; outputsDigest: string;
  processed: number; skipped: number; supported: number; unsupported: number;
  wireCounts: Record<string, number>; supportedOpcodeCounts: Record<string, number>; unsupportedWireCounts: Record<string, number>;
  checkpoints: string[];
}
export function replay<S>(trace: WireTrace, adapter: ReplayAdapter<S>): ReplayResult<S> {
  // Revalidate even typed caller input; neither casts nor JSON editing bypass the boundary.
  const safe = parseTrace(JSON.stringify(trace));
  const states: Record<number, S> = {}, outputs: unknown[] = [], checkpoints: string[] = [];
  const result: ReplayResult<S> = { states, stateDigest: '', outputsDigest: '', processed: 0, skipped: 0, supported: 0, unsupported: 0, wireCounts: {}, supportedOpcodeCounts: {}, unsupportedWireCounts: {}, checkpoints };
  let checkpointBytes = 0;
  const count = (counts: Record<string, number>, key: string) => { counts[key] = (counts[key] ?? 0) + 1; };
  for (const r of safe.records) {
    if (r.kind === 'open' && r.stream === 'duel') states[r.channel] = adapter.initial();
    if (r.kind !== 'message') continue;
    count(result.wireCounts, `0x${r.id.toString(16).padStart(4, '0')}`);
    if (r.redacted || r.stream !== 'duel' || r.direction !== 'in') { result.skipped++; continue; }
    const step = adapter.apply(states[r.channel], { id: r.id, param: r.param, data: unhex(r.hex) });
    result.processed++; states[r.channel] = step.state; outputs.push(step.outputs);
    if (step.supported) { result.supported++; for (const opcode of step.opcodes) count(result.supportedOpcodeCounts, opcode); }
    else { result.unsupported++; count(result.unsupportedWireCounts, `0x${r.id.toString(16).padStart(4, '0')}`); }
    const checkpoint = canonical({ state: step.state, outputs: step.outputs, supported: step.supported, opcodes: step.opcodes });
    checkpointBytes += new TextEncoder().encode(checkpoint).length;
    if (checkpointBytes > 32 * 1024 * 1024) throw new RangeError('Replay comparison capacity exceeded');
    checkpoints.push(checkpoint);
  }
  result.stateDigest = stateDigest(states); result.outputsDigest = stateDigest(outputs); return result;
}
export function compareReplay<S>(trace: WireTrace, adapter: ReplayAdapter<S>): { deterministic: boolean; first: ReplayResult<S>; second: ReplayResult<S> } {
  const first = replay(trace, adapter), second = replay(trace, adapter);
  return { deterministic: canonical(first) === canonical(second), first, second };
}
