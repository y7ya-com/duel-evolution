// The World: every client WebSocket, its virtual TCP sockets and the shared game state. Runtime-agnostic (vitest
// drives it directly; WorldDO in do.ts only wraps it). py equivalent: yo2srv/red/servidor.py serve/_handle.
import { Conn, type ConnHost } from "./net/conn.ts";
import { dataFrame, ECONNREFUSED, parseControl, readDataFrame } from "./net/gateway.ts";
import { HDR, hex, MAX_DATA, pack, Reader, W, type Msg } from "./net/proto.ts";
import { cardmap } from "./duel/data.ts";
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
  /** A client control frame (0xCAxx other than the card wire's hello, e.g. free mode's 0xCA10): out of band, before
   *  anything queued, never counted in the seq numbers. */
  onControl?(c: Conn, msgId: number, data: Uint8Array): void;
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
interface VSock {
  id: number; conn: Conn; reader: Reader; closed: boolean; inq: Inbound[]; busy: boolean; dead: boolean;
  /** the card wire's hello: waiting for the client's 0xCA02, or settled (cfg.cardWire off: settled from the start) */
  wire: "wait" | "ok";
}
/** The card wire (client/recomp/rt/cardwire.cpp): its hello ids and how long a client has to answer. */
const HELLO_S = 0xca01, HELLO_C = 0xca02, WIRE_VERSION = 2, HELLO_WAIT_MS = 5000;

const MAX_SOCKS_PER_PEER = 32; // py MAX_CONNS_PER_IP
/** Game WebSockets one DE user may hold at once (a few tabs and a reload's overlap; each holds up to 32 sockets). */
export const MAX_PEERS_PER_USER = 8;
/** Messages a connection may have waiting to be served: the client waits for answers, so only a flood fills it. */
const MAX_INQ = 256;

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

  /** Whether this user may open another WebSocket (do.ts answers 429 before accepting it). */
  canOpen(userId: string | null): boolean {
    if (userId === null) return true;
    let n = 0;
    for (const p of this.peers.values()) if (p.userId === userId) n++;
    return n < MAX_PEERS_PER_USER;
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
      const vs: VSock = { id, conn, reader: new Reader(), closed: false, inq: [], busy: false, dead: false,
        wire: this.cfg.cardWire ? "wait" : "ok" };
      p.socks.set(id, vs);
      this.sockOf.set(conn, [p, vs]);
      p.sendText(JSON.stringify({ type: "open", id, status: 0 }));
      this.log(`[srv:${port}] connection from ${peerId}#${id}`);
      const key = `${peerId}|${port}`;
      const old = this.peerConns.get(key);
      this.peerConns.set(key, conn);
      // the card wire: hello first, #0 and outside the seq count (the codec numbers the exe's frames from our first
      // real one, so a connection continuing the client's count, GATE_SEQ, stays right); the client's messages wait
      // for its answer
      if (this.cfg.cardWire) {
        p.sendBinary(dataFrame(id, pack(HELLO_S, new W().u16(WIRE_VERSION).u32(cardmap().wireHash).bytes(), 0)));
        setTimeout(() => {
          if (vs.wire === "wait" && !vs.closed) this.enqueue(p, vs, { kill: "no card-wire hello (an older client build)" });
        }, HELLO_WAIT_MS);
      }
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
    // at most MAX_INQ messages a frame: a frame with more is a flood, and the rest of it is never parsed
    const ms = vs.reader.feed(new Uint8Array(0), MAX_INQ);
    if (ms.length === MAX_INQ && vs.reader.buf.length >= HDR) return this.enqueue(p, vs, { kill: `more than ${MAX_INQ} messages in one frame (a flood)` });
    for (const m of ms) {
      if (vs.dead) return;
      if (!m.ok || m.data.length > MAX_DATA) return this.enqueue(p, vs, { kill: "bad MD5 or message > 1024 B" });
      if (m.id === HELLO_C) {   // ahead of what is queued: the exe often sends before its codec read our hello
        const ok = vs.wire === "wait" && m.data.length >= 6 && new DataView(m.data.buffer, m.data.byteOffset).getUint16(0) === WIRE_VERSION
          && new DataView(m.data.buffer, m.data.byteOffset).getUint32(2) === cardmap().wireHash;
        if (!ok) return this.enqueue(p, vs, { kill: "card-wire hello with another card table or version" });
        vs.wire = "ok";
        if (!vs.busy) void this.drain(p, vs);
        continue;
      }
      if ((m.id & 0xff00) === 0xca00) { this.run(() => this.services.onControl?.(vs.conn, m.id, m.data)); continue; }
      this.enqueue(p, vs, { m });
    }
    if (tooLong()) this.enqueue(p, vs, { kill: "header with length > 1024 B" });
  }

  private enqueue(p: Peer, vs: VSock, item: Inbound): void {
    if (vs.dead) return;
    if ("m" in item && vs.inq.length >= MAX_INQ) { vs.inq.length = 0; item = { kill: `more than ${MAX_INQ} messages waiting (a flood)` }; }
    if ("kill" in item || "eof" in item) vs.dead = true; // nothing after it is read
    vs.inq.push(item);
    if (!vs.busy) void this.drain(p, vs);
  }

  private async drain(p: Peer, vs: VSock): Promise<void> {
    vs.busy = true;
    try {
      while (vs.inq.length && !vs.closed) {
        if (vs.wire === "wait") {   // the hello's answer first; a refusal or a close drops what waited for it
          const end = vs.inq.findIndex((x) => "kill" in x || "eof" in x);
          if (end < 0) break;
          vs.inq.splice(0, end);
        }
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
    c.ext.rx = true; // the client's first frame was served: a later 0xCA10 sets no mode (game/freemode.ts modeFrame)
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
