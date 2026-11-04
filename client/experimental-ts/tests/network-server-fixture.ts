import { vi } from 'vitest';
import { buildServer } from '../../../server/src/server';
import { configFrom } from '../../../server/src/config';
import { GameSession, type SessionOptions } from '../src/network/session';
import type { WebSocketLike } from '../src/network/gateway';

export class InProcessSocket implements WebSocketLike {
  readyState = 0;
  bufferedAmount = 0;
  binaryType = 'arraybuffer';
  onopen: WebSocketLike['onopen'] = null;
  onclose: WebSocketLike['onclose'] = null;
  onerror: WebSocketLike['onerror'] = null;
  onmessage: WebSocketLike['onmessage'] = null;
  constructor(readonly server: ReturnType<typeof buildServer>, readonly id: string, readonly url: URL, readonly userId = 'test-user') {
    queueMicrotask(() => {
      if (this.readyState === 3) return;
      server.world.openPeer(id, this.userId,
        (text) => this.onmessage?.({ data: text } as MessageEvent),
        (bytes) => { if (this.readyState !== 1) return false; this.onmessage?.({ data: bytes.slice().buffer } as MessageEvent); return true; },
        url.searchParams.get('sid'), url.searchParams.get('resume') === '1');
      this.readyState = 1; this.onopen?.({} as Event);
    });
  }
  send(data: string | ArrayBuffer | ArrayBufferView): void {
    if (this.readyState !== 1) throw new Error('Socket closed');
    if (typeof data === 'string') this.server.world.onText(this.id, data);
    else {
      const bytes = ArrayBuffer.isView(data) ? new Uint8Array(data.buffer, data.byteOffset, data.byteLength) : new Uint8Array(data);
      this.server.world.onBinary(this.id, bytes);
    }
  }
  close(): void {
    if (this.readyState === 3) return;
    this.readyState = 3; this.server.world.closePeer(this.id); this.onclose?.({} as CloseEvent);
  }
}

export function setup(existingServer?: ReturnType<typeof buildServer>, user = 'test-user', env: Record<string, unknown> = {}) {
  if (!vi.isFakeTimers()) vi.useFakeTimers({ toFake: ['setTimeout','clearTimeout','setInterval','clearInterval','Date'] });
  const logs: string[] = [];
  const server = existingServer ?? buildServer(configFrom({ DEV:'1', PARITY_SEED:'1', SEND_PACE:'0', OWNER_ACCT:'', ...env }), { players:{} }, (line) => logs.push(line));
  const sockets: InProcessSocket[] = [];
  const received: number[] = [];
  const session = new GameSession({ url:'ws://localhost/net', sid:Buffer.from(user).toString('hex').padEnd(32,'0').slice(0,32),
    socketFactory: (url) => { const socket = new InProcessSocket(server, `${user}-peer${sockets.length}`, new URL(url), user); sockets.push(socket); return socket; },
    onMessage: (_, message) => received.push(message.id),
  });
  return { server, session, sockets, logs, received };
}
export async function drive<T>(promise: Promise<T>, timeout = 20000): Promise<T> {
  let done = false; let result: T | undefined; let error: unknown;
  promise.then((value) => { done = true; result = value; }, (err) => { done = true; error = err; });
  for (let ms = 0; !done && ms < timeout; ms += 20) await vi.advanceTimersByTimeAsync(20);
  if (!done) throw new Error('Test operation did not settle');
  if (error) throw error;
  return result as T;
}

/** A reusable authenticated WebSocket factory for app integration. The callbacks come from the app. */
export function sessionFactory(server: ReturnType<typeof buildServer>, user = 'app-user') {
  const sockets: InProcessSocket[] = [];
  const factory = (options: SessionOptions) => new GameSession({ ...options,
    url: 'ws://localhost/net', portOffset: 0,
    sid: Buffer.from(user).toString('hex').padEnd(32,'0').slice(0,32),
    socketFactory: (url) => {
      const socket = new InProcessSocket(server, `${user}-peer${sockets.length}`, new URL(url), user);
      sockets.push(socket); return socket;
    },
  });
  return { factory, sockets };
}
