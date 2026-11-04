import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { pack as serverPack, Reader as ServerReader } from '../../../server/src/net/proto';
import { GatewayClient } from '../src/network/gateway';
import type { Channel, GatewayOptions, WebSocketLike } from '../src/network/gateway';

class FakeSocket implements WebSocketLike {
  readyState = 0;
  bufferedAmount = 0;
  binaryType = '';
  onopen: WebSocketLike['onopen'] = null;
  onclose: WebSocketLike['onclose'] = null;
  onerror: WebSocketLike['onerror'] = null;
  onmessage: WebSocketLike['onmessage'] = null;
  sent: (string | Uint8Array)[] = [];
  sendError: Error | null = null;
  constructor(readonly url: string) {}
  send(data: string | ArrayBuffer | ArrayBufferView): void {
    if (this.sendError) throw this.sendError;
    if (this.readyState !== 1) throw new Error('Fake socket is closed');
    this.sent.push(typeof data === 'string' ? data : ArrayBuffer.isView(data)
      ? new Uint8Array(data.buffer, data.byteOffset, data.byteLength).slice() : new Uint8Array(data).slice());
  }
  open(): void { this.readyState = 1; this.onopen?.({} as Event); }
  close(): void { if (this.readyState === 3) return; this.readyState = 3; this.onclose?.({} as CloseEvent); }
  control(value: unknown): void { this.onmessage?.({ data:JSON.stringify(value) } as MessageEvent); }
  binary(id: number, bytes: Uint8Array): void {
    const frame = new Uint8Array(5 + bytes.length); frame[0] = 1;
    new DataView(frame.buffer).setUint32(1, id); frame.set(bytes, 5);
    this.onmessage?.({ data:frame.buffer } as MessageEvent);
  }
  controls(): Record<string, unknown>[] { return this.sent.filter((v): v is string => typeof v === 'string').map((v) => JSON.parse(v)); }
  frames(): Uint8Array[] { return this.sent.filter((v): v is Uint8Array => typeof v !== 'string'); }
}
const clients: GatewayClient[] = [];
function setup(options: Partial<GatewayOptions> = {}) {
  const sockets: FakeSocket[] = [], onStatus = vi.fn(), onMessage = vi.fn(), onChannelClose = vi.fn();
  const gateway = new GatewayClient({ url:'https://game.example/net?other=keep', sid:'test-session', connectTimeoutMs:1000,
    onStatus, onMessage, onChannelClose,
    socketFactory: (url) => { const socket = new FakeSocket(url); sockets.push(socket); return socket; }, ...options });
  clients.push(gateway);
  return { gateway, sockets, onStatus, onMessage, onChannelClose };
}
async function connected(f: ReturnType<typeof setup>) {
  const promise = f.gateway.connect(); f.sockets[0].open(); await promise;
}
async function open(f: ReturnType<typeof setup>, port = 1234): Promise<Channel> {
  const promise = f.gateway.open(port); await Promise.resolve();
  const socket = f.sockets.at(-1)!;
  const request = socket.controls().filter((v) => v.type === 'open').at(-1)!;
  socket.control({ type:'open', id:request.id, status:0 });
  return promise;
}
beforeEach(() => { vi.useFakeTimers(); });
afterEach(() => { for (const client of clients.splice(0)) client.dispose(); vi.clearAllTimers(); vi.useRealTimers(); });

describe('gateway lifecycle with fake WebSocket', () => {
  it('shares an in-flight connection and converts HTTPS while preserving query parameters', async () => {
    const f = setup(), first = f.gateway.connect(), second = f.gateway.connect();
    expect(second).toBe(first); expect(f.sockets).toHaveLength(1);
    const url = new URL(f.sockets[0].url);
    expect(url.protocol).toBe('wss:'); expect(url.searchParams.get('sid')).toBe('test-session');
    expect(url.searchParams.get('other')).toBe('keep'); expect(f.sockets[0].binaryType).toBe('arraybuffer');
    f.sockets[0].open(); await first;
    expect(f.gateway.status).toBe('connected'); await f.gateway.connect(); expect(f.sockets).toHaveLength(1);
  });
  it('opens virtual channels, frames outgoing packets, routes fragmented incoming bytes and acknowledges byte totals', async () => {
    const f = setup({ portOffset:100 }); await connected(f);
    const channel = await open(f), other = await open(f, 4321);
    expect(f.sockets[0].controls()[0]).toEqual({ type:'open', id:channel.id, host:'127.0.0.1', port:1334 });
    channel.send(0x1001, Uint8Array.of(7));
    const frame = f.sockets[0].frames()[0];
    expect(frame[0]).toBe(1); expect(new DataView(frame.buffer).getUint32(1)).toBe(channel.id);
    expect(new ServerReader().feed(frame.subarray(5))).toEqual([{ id:0x1001, param:1, data:Uint8Array.of(7), ok:true }]);
    const listener = vi.fn(), otherListener = vi.fn(); channel.subscribe(listener); other.subscribe(otherListener);
    const waiting = channel.waitFor(0x1002), packet = serverPack(0x1002, Uint8Array.of(9), 1);
    f.sockets[0].binary(channel.id, packet.subarray(0, 11)); expect(listener).not.toHaveBeenCalled();
    f.sockets[0].binary(channel.id, packet.subarray(11));
    expect(await waiting).toEqual({ id:0x1002, param:1, data:Uint8Array.of(9) });
    expect(listener).toHaveBeenCalledTimes(1); expect(otherListener).not.toHaveBeenCalled();
    expect(f.sockets[0].controls().at(-1)).toEqual({ type:'ack', id:channel.id, rx:packet.length });
  });
  it('rejects a refused open and ignores subsequent packets for its removed id', async () => {
    const f = setup(); await connected(f);
    const opening = f.gateway.open(1234); const rejected = expect(opening).rejects.toThrow('refused'); await Promise.resolve();
    const request = f.sockets[0].controls().at(-1)!;
    f.sockets[0].control({ type:'open', id:request.id, status:1 }); await rejected;
    expect(f.gateway.diagnostics.channels).toBe(0); expect(f.onChannelClose).toHaveBeenCalledTimes(1);
    f.sockets[0].binary(Number(request.id), serverPack(1, new Uint8Array(), 1));
    expect(f.onMessage).not.toHaveBeenCalled(); expect(f.gateway.status).toBe('connected');
  });
  it('times out an unanswered open and ignores a late success', async () => {
    const f = setup(); await connected(f);
    const opening = f.gateway.open(1234); const rejected = expect(opening).rejects.toThrow(); await Promise.resolve();
    const request = f.sockets[0].controls().at(-1)!;
    await vi.advanceTimersByTimeAsync(1000); await rejected;
    expect(f.gateway.diagnostics.channels).toBe(0);
    expect(f.sockets[0].controls().at(-1)).toEqual({ type:'close', id:request.id });
    f.sockets[0].control({ type:'open', id:request.id, status:0 });
    expect(f.gateway.diagnostics.channels).toBe(0);
  });
  it('rejects an open if the server closes it before acknowledging', async () => {
    const f = setup(); await connected(f);
    const opening = f.gateway.open(1234), rejected = expect(opening).rejects.toThrow('Server closed'); await Promise.resolve();
    f.sockets[0].control({ type:'close', id:f.sockets[0].controls().at(-1)!.id }); await rejected;
    expect(f.gateway.diagnostics.channels).toBe(0);
  });
  it('rejects a connection that closes or times out before opening', async () => {
    for (const timeout of [false, true]) {
      const f = setup(), promise = f.gateway.connect(), rejected = expect(promise).rejects.toThrow();
      if (timeout) await vi.advanceTimersByTimeAsync(1000); else f.sockets[0].close();
      await rejected; expect(f.gateway.status).toBe('error'); expect(f.sockets[0].readyState).toBe(3);
    }
  });
  it('returns a rejected promise when socket construction throws', async () => {
    // Capture the in-flight promise through the public API before the factory throws.
    // This handles its rejection even if connect() incorrectly loses that promise.
    let inFlight: Promise<void> | undefined;
    const f = setup({ socketFactory: () => {
      inFlight = f.gateway.connect(); void inFlight.catch(() => {});
      throw new Error('Factory failed');
    } });
    const returned = f.gateway.connect();
    await expect(inFlight).rejects.toThrow('Factory failed');
    expect(returned).toBeInstanceOf(Promise);
    await expect(returned).rejects.toThrow('Factory failed');
    expect(f.gateway.status).toBe('error');
  });
  it('cleans up a channel immediately if sending its open control fails', async () => {
    const f = setup(); await connected(f); f.sockets[0].sendError = new Error('Send failed');
    await expect(f.gateway.open(1234)).rejects.toThrow('Send failed');
    expect(f.gateway.diagnostics.channels).toBe(0);
    expect(vi.getTimerCount()).toBe(0);
  });
  it('closes once, rejects pending requests and ignores late data for the closed channel', async () => {
    const f = setup(); await connected(f); const channel = await open(f);
    const listener = vi.fn(), unsubscribe = channel.subscribe(listener); unsubscribe();
    f.sockets[0].binary(channel.id, serverPack(2, new Uint8Array(), 1));
    expect(listener).not.toHaveBeenCalled();
    const waiting = channel.waitFor(3), rejected = expect(waiting).rejects.toThrow('closed');
    channel.close(); channel.close(); await rejected;
    expect(new ServerReader().feed(f.sockets[0].frames()[0].subarray(5))[0]).toMatchObject({ id:3, param:1, ok:true });
    expect(f.sockets[0].controls().filter((v) => v.type === 'close')).toHaveLength(1);
    f.sockets[0].binary(channel.id, serverPack(3, new Uint8Array(), 2));
    expect(f.onMessage).toHaveBeenCalledTimes(1); expect(f.gateway.diagnostics.channels).toBe(0);
    await expect(channel.waitFor(3)).rejects.toThrow('closed');
  });
  it('fails channels immediately when reconnect is disabled', async () => {
    const f = setup({ reconnect:false }); await connected(f); const channel = await open(f);
    const waiting = channel.waitFor(2), rejected = expect(waiting).rejects.toThrow('connection closed');
    f.sockets[0].close(); await rejected; await vi.advanceTimersByTimeAsync(2000);
    expect(f.sockets).toHaveLength(1); expect(f.gateway.status).toBe('error'); expect(channel.closed).toBe(true);
  });
  it('bounds pending requests and removes expired waiters', async () => {
    const f = setup({ maxPendingRequests:1 }); await connected(f); const channel = await open(f);
    const waiting = channel.waitFor(2, 20), rejected = expect(waiting).rejects.toThrow('Timed out');
    await expect(channel.waitFor(3)).rejects.toThrow('Too many pending');
    await vi.advanceTimersByTimeAsync(20); await rejected;
    expect(channel.diagnostics.pendingRequests).toBe(0);
    const next = channel.waitFor(3); f.sockets[0].binary(channel.id, serverPack(3, new Uint8Array(), 1));
    expect((await next).id).toBe(3);
  });
  it('cancels a scheduled reconnect when disposed', async () => {
    const f = setup(); await connected(f); await open(f); f.sockets[0].close();
    expect(f.gateway.status).toBe('reconnecting'); f.gateway.dispose();
    await vi.advanceTimersByTimeAsync(40000);
    expect(f.sockets).toHaveLength(1); expect(f.gateway.status).toBe('closed'); expect(vi.getTimerCount()).toBe(0);
  });
  it('disposes pending connect/open/request promises, clears buffers and ignores saved late callbacks', async () => {
    const pending = setup(), connecting = pending.gateway.connect(), connectRejected = expect(connecting).rejects.toThrow('disposed');
    pending.gateway.dispose(); await connectRejected;
    const f = setup(); await connected(f); const channel = await open(f);
    channel.send(1); f.sockets[0].binary(channel.id, serverPack(2, new Uint8Array(), 1).subarray(0, 8));
    const request = channel.waitFor(2), requestRejected = expect(request).rejects.toThrow('disposed');
    const opening = f.gateway.open(1234), openRejected = expect(opening).rejects.toThrow('disposed'); await Promise.resolve();
    const lateOpen = f.sockets[0].onopen!, lateMessage = f.sockets[0].onmessage!;
    f.gateway.dispose(); f.gateway.dispose(); await Promise.all([requestRejected, openRejected]);
    lateOpen({} as Event); lateMessage({ data:'bad json' } as MessageEvent);
    expect(f.gateway.status).toBe('closed'); expect(channel.closed).toBe(true);
    expect(f.gateway.diagnostics).toEqual({ channels:0, bufferedBytes:0, retainedBytes:0, pendingRequests:0 });
    expect(vi.getTimerCount()).toBe(0); await expect(f.gateway.connect()).rejects.toThrow('disposed');
  });
});

describe('tunnel resume and packet integrity', () => {
  it('resumes byte offsets, retransmits only the unacknowledged tail and preserves packet sequence', async () => {
    const f = setup(); await connected(f); const channel = await open(f);
    channel.send(0x1001, Uint8Array.of(7));
    const sent = f.sockets[0].frames()[0].subarray(5).slice();
    f.sockets[0].control({ type:'ack', id:channel.id, rx:7 });
    const packet = serverPack(0x1002, Uint8Array.of(8), 1);
    f.sockets[0].binary(channel.id, packet.subarray(0, 13));
    const waiting = channel.waitFor(0x1002);
    f.sockets[0].close(); expect(f.gateway.status).toBe('reconnecting');
    await vi.advanceTimersByTimeAsync(250); const resumed = f.sockets[1];
    expect(new URL(resumed.url).searchParams.get('resume')).toBe('1'); resumed.open();
    expect(resumed.controls()[0]).toEqual({ type:'resume', sid:'test-session', socks:[{ id:channel.id, rx:13 }] });
    resumed.control({ type:'resumed', socks:[{ id:channel.id, rx:7 }] });
    expect(resumed.frames()[0].subarray(5)).toEqual(sent.subarray(7)); expect(f.gateway.status).toBe('connected');
    // Callbacks from the old transport must never poison the resumed connection.
    f.sockets[0].control({ type:'resume', ok:false });
    resumed.binary(channel.id, packet.subarray(13)); expect((await waiting).param).toBe(1);
    channel.send(0x1003);
    expect(new ServerReader().feed(resumed.frames().at(-1)!.subarray(5))[0].param).toBe(2);
    resumed.control({ type:'ack', id:channel.id, rx:channel.diagnostics.sentBytes });
    expect(channel.diagnostics.retainedBytes).toBe(0);
  });
  it('fails all waiters when resume is refused', async () => {
    const f = setup(); await connected(f); const channel = await open(f);
    const waiting = channel.waitFor(2), rejected = expect(waiting).rejects.toThrow('could not resume');
    f.sockets[0].close(); await vi.advanceTimersByTimeAsync(250); f.sockets[1].open();
    f.sockets[1].control({ type:'resume', ok:false }); await rejected;
    expect(f.gateway.status).toBe('error'); expect(channel.closed).toBe(true);
  });
  it('closes channels omitted from the resumed socket list', async () => {
    const f = setup(); await connected(f); const channel = await open(f);
    const waiting = channel.waitFor(2), rejected = expect(waiting).rejects.toThrow('not resumed');
    f.sockets[0].close(); await vi.advanceTimersByTimeAsync(250); f.sockets[1].open();
    f.sockets[1].control({ type:'resumed', socks:[] }); await rejected;
    expect(channel.closed).toBe(true); expect(f.gateway.diagnostics.channels).toBe(0); expect(f.gateway.status).toBe('connected');
  });
  it.each(['hash', 'sequence', 'ack', 'frame'] as const)('fails closed on invalid %s without delivering a packet', async (kind) => {
    const f = setup(); await connected(f); const channel = await open(f);
    const waiting = channel.waitFor(2), rejected = expect(waiting).rejects.toThrow();
    if (kind === 'ack') f.sockets[0].control({ type:'ack', id:channel.id, rx:1 });
    else if (kind === 'frame') f.sockets[0].onmessage?.({ data:new ArrayBuffer(4) } as MessageEvent);
    else {
      const packet = serverPack(2, Uint8Array.of(7), kind === 'sequence' ? 2 : 1);
      if (kind === 'hash') packet[8] ^= 1;
      f.sockets[0].binary(channel.id, packet);
    }
    await rejected; expect(f.gateway.status).toBe('error'); expect(f.onMessage).not.toHaveBeenCalled();
    expect(f.gateway.diagnostics.channels).toBe(0);
  });
  it('rejects oversized client payloads and backpressure without consuming a sequence number', async () => {
    const f = setup(); await connected(f); const channel = await open(f);
    expect(() => channel.send(1, new Uint8Array(1025))).toThrow('1024');
    f.sockets[0].bufferedAmount = 1024 * 1024 + 1;
    expect(() => channel.send(1)).toThrow('buffer limit'); expect(channel.diagnostics.sentBytes).toBe(0);
    f.sockets[0].bufferedAmount = 0; channel.send(1, new Uint8Array(1024));
    expect(new ServerReader().feed(f.sockets[0].frames()[0].subarray(5))[0].param).toBe(1);
  });
});
