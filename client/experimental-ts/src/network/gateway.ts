import { MAX_CLIENT_DATA, PacketReader, pack, type WireMessage } from './codec';

export type GatewayStatus = 'idle' | 'connecting' | 'connected' | 'reconnecting' | 'closed' | 'error';
export interface WebSocketLike {
  readyState: number;
  bufferedAmount: number;
  binaryType: string;
  onopen: ((event: Event) => unknown) | null;
  onclose: ((event: CloseEvent) => unknown) | null;
  onerror: ((event: Event) => unknown) | null;
  onmessage: ((event: MessageEvent) => unknown) | null;
  send(data: string | ArrayBuffer | ArrayBufferView): void;
  close(code?: number, reason?: string): void;
}
export interface GatewayOptions {
  url: string;
  portOffset?: number;
  socketFactory?: (url: string) => WebSocketLike;
  onMessage?: (channel: Channel, message: WireMessage) => void;
  /** Observability only; exceptions cannot interrupt successful transport writes. */
  onOutgoing?: (channel: Channel, message: WireMessage) => void;
  onStatus?: (status: GatewayStatus, error?: Error) => void;
  onChannelClose?: (channel: Channel, error: Error) => void;
  /** Tunnel resume keeps virtual sockets and packet sequence numbers intact. */
  reconnect?: boolean;
  connectTimeoutMs?: number;
  maxBufferedBytes?: number;
  maxPendingRequests?: number;
  /** Optional deterministic sid for tests; otherwise crypto.randomUUID(). */
  sid?: string;
}
interface PendingRequest {
  id: number;
  resolve: (message: WireMessage) => void;
  reject: (error: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}
interface PendingBytes { start: number; bytes: Uint8Array }
const MAX_RETAINED = 256 * 1024;
const MAX_BACKPRESSURE = 1024 * 1024;
const OPEN = 1;
/** The gateway's close code for a deploy (server/src/do.ts): live's lobbyretry.c reconnects through it. */
export const SERVER_UPDATE_CLOSE = 4012;

export class Channel {
  private readonly reader: PacketReader;
  private txSequence = 0;
  private rxSequence = 0;
  private waiters: PendingRequest[] = [];
  private retained: PendingBytes[] = [];
  private retainedLength = 0;
  private txBytes = 0;
  rxBytes = 0;
  closed = false;
  readonly listeners = new Set<(message: WireMessage) => void>();
  constructor(readonly gateway: GatewayClient, readonly id: number, readonly port: number) {
    this.reader = new PacketReader(gateway.options.maxBufferedBytes ?? MAX_BACKPRESSURE);
  }
  /** Future packet only: register before sending, or use request(). No unbounded packet history. */
  waitFor(id: number, timeoutMs = 15000): Promise<WireMessage> {
    if (this.closed) return Promise.reject(new Error('Channel is closed'));
    if (this.waiters.length >= (this.gateway.options.maxPendingRequests ?? 64)) return Promise.reject(new Error('Too many pending requests'));
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.waiters = this.waiters.filter((w) => w !== item);
        reject(new Error(`Timed out waiting for 0x${id.toString(16)} on port ${this.port}`));
      }, timeoutMs);
      const item: PendingRequest = { id, resolve, reject, timer }; this.waiters.push(item);
    });
  }
  request(id: number, data: Uint8Array, responseId: number, timeoutMs = 15000): Promise<WireMessage> {
    const waiting = this.waitFor(responseId, timeoutMs);
    try { this.send(id, data); } catch (error) { this.fail(error instanceof Error ? error : new Error(String(error))); }
    return waiting;
  }
  send(id: number, data: Uint8Array = new Uint8Array(0)): void {
    if (this.closed) throw new Error('Channel is closed');
    if (data.length > MAX_CLIENT_DATA) throw new RangeError('Client wire payload exceeds 1024 bytes');
    const sequence = (id & 0xff00) === 0xca00 ? 0 : this.txSequence + 1;
    const bytes = pack(id, data, sequence);
    // Retain before send because a test socket may acknowledge synchronously.
    if (this.retainedLength + bytes.length > MAX_RETAINED) throw new RangeError('Unacknowledged send buffer limit exceeded');
    this.retained.push({ start: this.txBytes, bytes }); this.retainedLength += bytes.length; this.txBytes += bytes.length;
    // While the WebSocket is closing or a tunnel resume is under way the bytes stay retained; resume() sends everything
    // after the server's acknowledgement (or the failed resume rejects this channel's requests).
    try { if (this.gateway.writable) this.gateway.sendBytes(this.id, bytes); }
    catch (error) {
      this.retained.pop(); this.retainedLength -= bytes.length; this.txBytes -= bytes.length;
      throw error;
    }
    if (sequence) this.txSequence = sequence;
    try { this.gateway.options.onOutgoing?.(this,{ id,param:sequence,data:data.slice() }); } catch { /* Observability cannot break the game connection. */ }
  }
  subscribe(listener: (message: WireMessage) => void): () => void {
    this.listeners.add(listener); return () => this.listeners.delete(listener);
  }
  receive(bytes: Uint8Array): void {
    if (this.closed) return;
    this.rxBytes += bytes.length;
    for (const message of this.reader.feed(bytes)) {
      if (message.id === 0xca01) {
        if (message.data.length !== 6 || new DataView(message.data.buffer, message.data.byteOffset).getUint16(0) !== 2)
          throw new Error('Unsupported card-wire version');
        // This client natively uses passcodes, so it needs no guest card-index table.
        this.send(0xca02, message.data); continue;
      }
      if ((message.id & 0xff00) !== 0xca00) {
        if (message.param !== this.rxSequence + 1)
          throw new Error(`Wire sequence gap on port ${this.port}: got ${message.param}, expected ${this.rxSequence + 1}`);
        this.rxSequence = message.param;
      }
      const item = this.waiters.find((w) => w.id === message.id);
      if (item) { clearTimeout(item.timer); this.waiters = this.waiters.filter((w) => w !== item); item.resolve(message); }
      for (const listener of this.listeners) listener(message);
      this.gateway.options.onMessage?.(this, message);
    }
    this.gateway.acknowledge(this);
  }
  acknowledge(rx: number): void {
    if (!Number.isSafeInteger(rx) || rx < 0 || rx > this.txBytes) throw new Error('Invalid server byte acknowledgement');
    while (this.retained.length && this.retained[0].start + this.retained[0].bytes.length <= rx) {
      this.retainedLength -= this.retained.shift()!.bytes.length;
    }
    const first = this.retained[0];
    if (first && rx > first.start) {
      const n = rx - first.start; first.bytes = first.bytes.slice(n); first.start = rx; this.retainedLength -= n;
    }
  }
  resume(rx: number): void {
    const oldest = this.retained[0]?.start ?? this.txBytes;
    if (rx < oldest) throw new Error('Server resume acknowledgement is outside retained bytes');
    this.acknowledge(rx);
    for (const entry of this.retained) this.gateway.sendBytes(this.id, entry.bytes);
  }
  close(): void {
    if (this.closed) return;
    try { if (this.gateway.status === 'connected') this.send(0x0003); }
    finally { this.gateway.closeChannel(this); }
  }
  fail(error: Error): void {
    if (this.closed) return;
    this.closed = true; this.reader.clear();
    for (const waiter of this.waiters) { clearTimeout(waiter.timer); waiter.reject(error); }
    this.waiters = []; this.retained = []; this.retainedLength = 0; this.listeners.clear();
    this.gateway.options.onChannelClose?.(this, error);
  }
  get diagnostics(): Readonly<{ receivedBytes: number; sentBytes: number; bufferedBytes: number; retainedBytes: number; pendingRequests: number }> {
    return { receivedBytes: this.rxBytes, sentBytes: this.txBytes, bufferedBytes: this.reader.bufferedBytes,
      retainedBytes: this.retainedLength, pendingRequests: this.waiters.length };
  }
}

export class GatewayClient {
  status: GatewayStatus = 'idle';
  private socket: WebSocketLike | null = null;
  private nextId = 0;
  private channels = new Map<number, Channel>();
  private openWaiters = new Map<number, { resolve: (channel: Channel) => void; reject: (error: Error) => void; timer: ReturnType<typeof setTimeout> }>();
  private connection: Promise<void> | null = null;
  private connectResolve: (() => void) | null = null;
  private connectReject: ((error: Error) => void) | null = null;
  private connectTimer: ReturnType<typeof setTimeout> | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private reconnectStarted = 0;
  private reconnectAttempts = 0;
  private disposed = false;
  /** The WebSocket close code that ended this gateway, when it was one the server gives a meaning (4012). */
  closeCode: number | null = null;
  readonly sid: string;
  constructor(readonly options: GatewayOptions) {
    this.sid = options.sid ?? globalThis.crypto.randomUUID().replaceAll('-', '');
  }
  private setStatus(status: GatewayStatus, error?: Error): void { this.status = status; this.options.onStatus?.(status, error); }
  connect(): Promise<void> {
    if (this.disposed) return Promise.reject(new Error('Gateway is disposed'));
    if (this.status === 'connected') return Promise.resolve();
    if (this.connection) return this.connection;
    this.connection = new Promise<void>((resolve, reject) => { this.connectResolve = resolve; this.connectReject = reject; });
    const pending = this.connection;
    if (this.status !== 'reconnecting') { this.setStatus('connecting'); this.createSocket(false); }
    return pending;
  }
  private createSocket(resume: boolean): void {
    let url: URL;
    try { url = new URL(this.options.url, globalThis.location?.href ?? 'http://localhost'); }
    catch { this.fail(new Error('Invalid gateway URL')); return; }
    if (url.protocol === 'http:') url.protocol = 'ws:';
    if (url.protocol === 'https:') url.protocol = 'wss:';
    if (!['ws:', 'wss:'].includes(url.protocol)) return this.fail(new Error('Invalid gateway URL'));
    url.searchParams.set('sid', this.sid);
    if (resume) url.searchParams.set('resume', '1'); else url.searchParams.delete('resume');
    let socket: WebSocketLike;
    try { socket = this.options.socketFactory ? this.options.socketFactory(url.href) : new WebSocket(url.href) as unknown as WebSocketLike; }
    catch (error) { this.fail(error instanceof Error ? error : new Error(String(error))); return; }
    this.socket = socket; socket.binaryType = 'arraybuffer';
    this.connectTimer = setTimeout(() => {
      if (this.socket !== socket) return;
      socket.close();
      if (!resume) this.fail(new Error('Gateway connection timed out'));
    }, this.options.connectTimeoutMs ?? 15000);
    socket.onopen = () => {
      if (this.socket !== socket || this.disposed) return;
      if (resume) this.sendText({ type: 'resume', sid: this.sid, socks: [...this.channels.values()].map((c) => ({ id: c.id, rx: c.rxBytes })) });
      else this.connected();
    };
    socket.onmessage = (event) => {
      if (this.socket !== socket || this.disposed) return;
      try {
        if (typeof event.data === 'string') this.receiveControl(event.data);
        else if (event.data instanceof ArrayBuffer) this.receiveBinary(new Uint8Array(event.data));
        else if (ArrayBuffer.isView(event.data)) this.receiveBinary(new Uint8Array(event.data.buffer, event.data.byteOffset, event.data.byteLength));
        else throw new Error('Unsupported gateway frame');
      } catch (error) { this.fail(error instanceof Error ? error : new Error(String(error))); }
    };
    socket.onerror = () => {}; // close provides the reconnect boundary; no duplicate failure notifications
    socket.onclose = (event) => {
      if (this.socket !== socket || this.disposed) return;
      this.clearConnectTimer(); this.socket = null;
      // 4012: the server is going down for an update (server/src/do.ts /__admin/shutdown). Its sockets are closed, not
      // held, so a tunnel resume can only be refused: fail at once and let the session's reconnect (lobbyretry) start.
      const code = (event as { code?: number } | null)?.code;
      if (code === SERVER_UPDATE_CLOSE) { this.closeCode = code; return this.fail(new Error('The server is updating (4012).')); }
      if (this.options.reconnect !== false && this.channels.size && (this.status === 'connected' || this.status === 'reconnecting')) this.reconnect();
      else this.fail(new Error('Gateway connection closed'));
    };
  }
  private connected(): void {
    this.clearConnectTimer(); this.reconnectStarted = 0; this.reconnectAttempts = 0;
    this.setStatus('connected'); this.connectResolve?.(); this.connectResolve = null; this.connectReject = null;
    this.connection = null;
  }
  private reconnect(): void {
    if (!this.reconnectStarted) this.reconnectStarted = Date.now();
    if (Date.now() - this.reconnectStarted >= 40000) return this.fail(new Error('Gateway resume window expired'));
    this.setStatus('reconnecting');
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      if (!this.disposed) this.createSocket(true);
    }, Math.min(250 * 2 ** this.reconnectAttempts++, 2000));
  }
  private receiveControl(text: string): void {
    if (text.length > 65536) throw new RangeError('Gateway control frame too large');
    const message: unknown = JSON.parse(text);
    if (!message || typeof message !== 'object') throw new Error('Invalid gateway control frame');
    const m = message as Record<string, unknown>;
    if (m.type === 'open') {
      const id = Number(m.id), waiter = this.openWaiters.get(id);
      if (!waiter) return;
      clearTimeout(waiter.timer); this.openWaiters.delete(id);
      if (m.status !== 0) { const error = new Error(`Server refused virtual port ${this.channels.get(id)?.port}`); waiter.reject(error); this.channels.get(id)?.fail(error); this.channels.delete(id); }
      else waiter.resolve(this.channels.get(id)!);
    } else if (m.type === 'close') {
      const id = Number(m.id); this.rejectOpen(id, new Error('Server closed virtual channel')); this.channels.get(id)?.fail(new Error('Server closed virtual channel')); this.channels.delete(id);
    } else if (m.type === 'ack') {
      this.channels.get(Number(m.id))?.acknowledge(Number(m.rx));
    } else if (m.type === 'resume' && m.ok === false) {
      throw new Error('Server could not resume the game connection');
    } else if (m.type === 'resumed') {
      if (this.status !== 'reconnecting' || !Array.isArray(m.socks)) throw new Error('Unexpected gateway resume');
      const live = new Set<number>();
      for (const item of m.socks) {
        if (!item || typeof item !== 'object') throw new Error('Invalid resume socket');
        const entry = item as Record<string, unknown>, id = Number(entry.id); live.add(id);
        this.channels.get(id)?.resume(Number(entry.rx));
      }
      for (const [id, channel] of this.channels) if (!live.has(id)) { channel.fail(new Error('Virtual channel was not resumed')); this.channels.delete(id); }
      this.connected();
    }
  }
  private receiveBinary(frame: Uint8Array): void {
    if (frame.length < 5 || frame[0] !== 1) throw new Error('Invalid gateway binary frame');
    const id = new DataView(frame.buffer, frame.byteOffset, frame.byteLength).getUint32(1);
    const channel = this.channels.get(id); if (channel) channel.receive(frame.subarray(5));
  }
  async open(port: number): Promise<Channel> {
    await this.connect();
    if (this.disposed) throw new Error('Gateway is disposed');
    if (!Number.isInteger(port) || port < 1 || port > 65535) throw new RangeError('Invalid virtual port');
    if (this.channels.size >= 32) throw new Error('Virtual channel limit exceeded');
    const id = ++this.nextId, channel = new Channel(this, id, port); this.channels.set(id, channel);
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { this.openWaiters.delete(id); this.closeChannel(channel); reject(new Error('Virtual channel open timed out')); }, this.options.connectTimeoutMs ?? 15000);
      this.openWaiters.set(id, { resolve, reject, timer });
      try { this.sendText({ type: 'open', id, host: '127.0.0.1', port: port + (this.options.portOffset ?? 0) }); }
      catch (error) {
        const failure = error instanceof Error ? error : new Error(String(error));
        clearTimeout(timer); this.openWaiters.delete(id); this.channels.delete(id); channel.fail(failure); reject(failure);
      }
    });
  }
  /** False between a dropped socket and its resume: channel sends are then held for the resume. */
  get writable(): boolean {
    if (this.status === 'reconnecting') return false;
    return !(this.status === 'connected' && this.socket && this.socket.readyState !== OPEN && this.options.reconnect !== false && this.channels.size);
  }
  sendBytes(id: number, bytes: Uint8Array): void {
    if (!this.socket || this.socket.readyState !== OPEN) throw new Error('Gateway is disconnected');
    if (this.socket.bufferedAmount > MAX_BACKPRESSURE) throw new Error('Gateway send buffer limit exceeded');
    const frame = new Uint8Array(bytes.length + 5); frame[0] = 1; new DataView(frame.buffer).setUint32(1, id); frame.set(bytes, 5);
    this.socket.send(frame);
  }
  private sendText(message: Record<string, unknown>): void {
    if (!this.socket || this.socket.readyState !== OPEN) throw new Error('Gateway is disconnected');
    this.socket.send(JSON.stringify(message));
  }
  acknowledge(channel: Channel): void { this.sendText({ type: 'ack', id: channel.id, rx: channel.rxBytes }); }
  closeChannel(channel: Channel): void {
    this.rejectOpen(channel.id, new Error('Virtual channel closed'));
    try { if (this.socket?.readyState === OPEN) this.sendText({ type: 'close', id: channel.id }); }
    finally { channel.fail(new Error('Virtual channel closed')); this.channels.delete(channel.id); }
  }
  private rejectOpen(id: number, error: Error): void {
    const waiter = this.openWaiters.get(id);
    if (waiter) { clearTimeout(waiter.timer); waiter.reject(error); this.openWaiters.delete(id); }
  }
  private clearConnectTimer(): void { if (this.connectTimer) clearTimeout(this.connectTimer); this.connectTimer = null; }
  private fail(error: Error, terminal: 'error' | 'closed' = 'error'): void {
    this.clearConnectTimer(); if (this.reconnectTimer) clearTimeout(this.reconnectTimer); this.reconnectTimer = null;
    const socket = this.socket; this.socket = null;
    if (socket) { socket.close(); socket.onopen = null; socket.onmessage = null; socket.onerror = null; socket.onclose = null; }
    this.connectReject?.(error); this.connectResolve = null; this.connectReject = null; this.connection = null;
    for (const id of this.openWaiters.keys()) this.rejectOpen(id, error);
    for (const channel of this.channels.values()) channel.fail(error); this.channels.clear();
    this.setStatus(terminal, terminal === 'error' ? error : undefined);
  }
  dispose(): void {
    if (this.disposed) return;
    this.disposed = true; this.fail(new Error('Gateway disposed'), 'closed');
  }
  get diagnostics(): Readonly<{ channels: number; bufferedBytes: number; retainedBytes: number; pendingRequests: number }> {
    const stats = [...this.channels.values()].map((c) => c.diagnostics);
    return { channels: this.channels.size, bufferedBytes: stats.reduce((n, s) => n + s.bufferedBytes, 0),
      retainedBytes: stats.reduce((n, s) => n + s.retainedBytes, 0), pendingRequests: stats.reduce((n, s) => n + s.pendingRequests, 0) };
  }
}
