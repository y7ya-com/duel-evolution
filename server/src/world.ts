// The World: every client WebSocket, its virtual TCP sockets and the shared game state. Runtime-agnostic (vitest
// drives it directly; WorldDO in do.ts only wraps it). py equivalent: yo2srv/red/servidor.py serve/_handle.
import { Conn, type ConnHost } from "./net/conn.ts";
import { dataFrame, ECONNREFUSED, parseControl, readDataFrame } from "./net/gateway.ts";
import { hex, MAX_DATA, Reader, type Msg } from "./net/proto.ts";
import { PORTS, type Config } from "./config.ts";

export type Handler = (c: Conn, msgId: number, param: number, data: Uint8Array) => void;

/** What the game modules plug into the World (py: HANDLERS, on_conn_accepted, on_conn_closed, duel_reserva_6001…). */
export interface Services {
  handlerFor(port: number): Handler | undefined;
  onConnAccepted?(c: Conn, old: Conn | undefined): void;
  onConnClosed?(c: Conn): void;
  /** Duel port, 0x6001 before the connection has a session: false = refused (py duel_reserva_6001 + HUB.attach). */
  duelAttach?(c: Conn, pid: number): boolean;
  beforeSend?(c: Conn, msgId: number): void;
}

interface Peer {
  id: string;
  userId: string | null;
  sendText(s: string): void;
  sendBinary(b: Uint8Array): boolean;
  socks: Map<number, VSock>;
}

type Inbound = { m: Msg } | { kill: string } | { eof: true };
/** A virtual socket. py reads a connection's next message only after the handler of the previous one returned, and
 *  its sends block for their pause: so inbound messages wait in `inq` until the connection's send queue drains. */
interface VSock { id: number; conn: Conn; reader: Reader; closed: boolean; inq: Inbound[]; busy: boolean; dead: boolean }

const MAX_SOCKS_PER_PEER = 32; // py MAX_CONNS_PER_IP

export class World implements ConnHost {
  readonly seqTable = Conn.newSeqTable();
  /** py PEER_CONNS: `${peer}|${port}` -> that client's last connection on the port. */
  readonly peerConns = new Map<string, Conn>();
  private peers = new Map<string, Peer>();
  private sockOf = new Map<Conn, [Peer, VSock]>();
  services!: Services;
  /** All handlers run one at a time, like py's per-state lock but global: the game code stays synchronous. */
  private chain: Promise<void> = Promise.resolve();

  constructor(readonly cfg: Config, readonly log: (line: string) => void = () => {}) {}

  // ---- ConnHost
  currentConn(c: Conn): Conn | undefined {
    const s = c.sess;
    if (s && s.conns.has(c.port)) return s.conns.get(c.port);
    return this.peerConns.get(`${c.peer}|${c.port}`);
  }
  beforeSend(c: Conn, msgId: number): void { this.services.beforeSend?.(c, msgId); }

  // ---- WebSockets
  /** userId: the signed-in DE user the Worker bound to this WebSocket (null only on the DEV parity bridge). */
  openPeer(id: string, userId: string | null, sendText: (s: string) => void, sendBinary: (b: Uint8Array) => boolean): void {
    this.peers.set(id, { id, userId, sendText, sendBinary, socks: new Map() });
  }

  closePeer(id: string): void {
    const p = this.peers.get(id);
    if (!p) return;
    this.peers.delete(id);
    for (const s of p.socks.values()) this.enqueue(p, s, { eof: true }); // like a TCP close: queued messages first
  }

  onText(peerId: string, text: string): void {
    const p = this.peers.get(peerId);
    const m = parseControl(text);
    if (!p || !m) return;
    const id = Number(m.id);
    if (m.type === "open") {
      const port = Number((m as { port: number }).port) - this.cfg.portOffset;
      if (!Number.isInteger(id) || !PORTS.has(port) || p.socks.size >= MAX_SOCKS_PER_PEER || p.socks.has(id)) {
        p.sendText(JSON.stringify({ type: "open", id, status: ECONNREFUSED }));
        return;
      }
      const conn = new Conn(this, this.seqTable, port, peerId, (b) => p.sendBinary(dataFrame(id, b)), PORTS.duel, this.cfg.sendPace);
      conn.userId = p.userId;
      const vs: VSock = { id, conn, reader: new Reader(), closed: false, inq: [], busy: false, dead: false };
      p.socks.set(id, vs);
      this.sockOf.set(conn, [p, vs]);
      p.sendText(JSON.stringify({ type: "open", id, status: 0 }));
      this.log(`[srv:${port}] connection from ${peerId}#${id}`);
      const key = `${peerId}|${port}`;
      const old = this.peerConns.get(key);
      this.peerConns.set(key, conn);
      this.run(() => this.services.onConnAccepted?.(conn, old));
    } else if (m.type === "close" || m.type === "shutdown") {
      const vs = p.socks.get(id);
      if (vs) this.enqueue(p, vs, { eof: true });
    }
  }

  onBinary(peerId: string, frame: Uint8Array): void {
    const p = this.peers.get(peerId);
    const f = readDataFrame(frame);
    if (!p || !f) return;
    const vs = p.socks.get(f[0]);
    if (!vs || vs.closed || vs.dead) return;
    this.parse(p, vs, f[1].slice());
  }

  /** Server-side close of a connection (py c.sock.close()). */
  close(c: Conn, why = "closed by server"): void {
    const pv = this.sockOf.get(c);
    if (!pv) { c.closed = true; return; }
    const [p, vs] = pv;
    if (!vs.closed) p.sendText(JSON.stringify({ type: "close", id: vs.id }));
    this.sockClosed(p, vs, why);
  }

  /** Run fn after every handler queued before it (one handler at a time). */
  run(fn: () => void): Promise<void> {
    const step = this.chain.then(() => {
      try { fn(); } catch (e) { this.log(`[srv] handler error: ${(e as Error)?.stack ?? e}`); }
    });
    this.chain = step;
    return step;
  }

  /** Resolves when every queued handler has run (tests). */
  idle(): Promise<void> { return this.chain; }

  /** Bytes from the client -> messages in the socket's inbound queue (py: rd.feed of each recv). */
  private parse(p: Peer, vs: VSock, chunk: Uint8Array): void {
    const tooLong = () => vs.reader.pendingLen() > MAX_DATA;
    vs.reader.buf = concat(vs.reader.buf, chunk);
    if (tooLong()) return this.enqueue(p, vs, { kill: "header with length > 1024 B" });
    for (const m of vs.reader.feed(new Uint8Array(0))) {
      if (!m.ok || m.data.length > MAX_DATA) return this.enqueue(p, vs, { kill: "bad MD5 or message > 1024 B" });
      this.enqueue(p, vs, { m });
    }
    if (tooLong()) this.enqueue(p, vs, { kill: "header with length > 1024 B" });
  }

  private enqueue(p: Peer, vs: VSock, item: Inbound): void {
    if (vs.dead) return;
    if ("kill" in item || "eof" in item) vs.dead = true; // nothing after it is read
    vs.inq.push(item);
    if (!vs.busy) void this.drain(p, vs);
  }

  private async drain(p: Peer, vs: VSock): Promise<void> {
    vs.busy = true;
    try {
      while (vs.inq.length && !vs.closed) {
        const it = vs.inq.shift()!;
        if ("kill" in it) { await this.run(() => this.kill(p, vs, it.kill)); break; }
        if ("eof" in it) { await this.run(() => this.sockClosed(p, vs, "closed")); break; }
        await this.run(() => this.handle(vs, it.m));
        await vs.conn.flushed();
      }
    } finally {
      vs.busy = false;
    }
  }

  private handle(vs: VSock, m: Msg): void {
    const c = vs.conn;
    if (vs.closed) return;
    this.log(`[srv:${c.port}] <- 0x${m.id.toString(16).padStart(4, "0")} #${m.param} len=${m.data.length}` +
      (m.id === 0x3003 ? "" : ` ${hex(m.data.subarray(0, 24))}`));
    c.sawClient(m.param);
    if (m.id === 0x0003) c.bye = true;
    if (c.ext.bookedFail) return; // duel ticket refused: nothing else from here is served
    if (c.port === PORTS.duel && m.id === 0x6001 && m.data.length >= 4 && c.sess === null) {
      const pid = new DataView(m.data.buffer, m.data.byteOffset).getUint32(0);
      if (this.services.duelAttach && !this.services.duelAttach(c, pid)) return;
    }
    try {
      this.services.handlerFor(c.port)?.(c, m.id, m.param, m.data);
    } catch (e) {
      this.log(`[srv:${c.port}] error answering: ${(e as Error)?.stack ?? e}`);
    }
  }

  private kill(p: Peer, vs: VSock, why: string): void {
    if (!vs.closed) p.sendText(JSON.stringify({ type: "close", id: vs.id }));
    this.sockClosed(p, vs, why);
  }

  private sockClosed(p: Peer, vs: VSock, why: string): void {
    if (vs.closed) return;
    vs.closed = true;
    p.socks.delete(vs.id);
    this.sockOf.delete(vs.conn);
    vs.conn.closed = true;
    this.log(`[srv:${vs.conn.port}] closed (${why})`);
    this.run(() => this.services.onConnClosed?.(vs.conn));
  }
}

function concat(a: Uint8Array, b: Uint8Array): Uint8Array {
  if (!a.length) return b;
  const o = new Uint8Array(a.length + b.length);
  o.set(a); o.set(b, a.length);
  return o;
}
