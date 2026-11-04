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
  /** the client's tunnel id (/net?sid=): a dropped WebSocket's sockets wait RESUME_HOLD_MS for a resume with it */
  sid: string | null;
  /** the WebSocket is gone; its sockets are held for a resume (output buffered), closed when the hold ends */
  held: ReturnType<typeof setTimeout> | null;
}

type Inbound = { m: Msg } | { kill: string } | { eof: true };
/** A virtual socket. py reads a connection's next message only after the handler of the previous one returned, and
 *  its sends block for their pause: so inbound messages wait in `inq` until the connection's send queue drains. */
interface VSock {
  id: number; conn: Conn; reader: Reader; closed: boolean; inq: Inbound[]; busy: boolean; dead: boolean;
  /** the WebSocket it rides now (a resume moves it) */
  peer: Peer;
  /** tunnel resume: bytes received from the client; bytes sent, kept in `out` from byte `outBase` until acked */
  rx: number; out: Uint8Array[]; outBase: number; outLen: number; ackT: number; ackTimer: ReturnType<typeof setTimeout> | null;
  /** the card wire's hello: waiting for the client's 0xCA02, or settled (cfg.cardWire off: settled from the start) */
  wire: "wait" | "ok";
}
/** The card wire (client/recomp/rt/cardwire.cpp): its hello ids and how long a client has to answer. */
const HELLO_S = 0xca01, HELLO_C = 0xca02, WIRE_VERSION = 2, HELLO_WAIT_MS = 5000;

const MAX_SOCKS_PER_PEER = 32; // py MAX_CONNS_PER_IP
/** Tunnel resume (phase2-net's net_ws.cpp): how long a dropped WebSocket's sockets wait (the client retries for 40 s),
 *  and how much unacked output one socket may hold (the client keeps 256 KB); past that it is closed at the resume. */
export const RESUME_HOLD_MS = 45_000;
const RESUME_MAX_OUT = 256 * 1024, ACK_MS = 1000;
/** Game WebSockets one DE user may hold at once (a few tabs and a reload's overlap; each holds up to 32 sockets). */
export const MAX_PEERS_PER_USER = 8;
/** Messages a connection may have waiting to be served: the client waits for answers, so only a flood fills it. */
const MAX_INQ = 256;

export class World implements ConnHost {
  readonly seqTable = Conn.newSeqTable();
  /** py PEER_CONNS: `${peer}|${port}` -> that client's last connection on the port. */
  readonly peerConns = new Map<string, Conn>();
  private peers = new Map<string, Peer>();
  /** sid -> the peer that owns it (live or held) */
  private sids = new Map<string, Peer>();
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
  /** userId: the signed-in DE user the Worker bound to this WebSocket (null only on the DEV parity bridge). sid: the
   *  client's tunnel id, for a resume after a drop; a resume (resume=true) only takes it over once it succeeds. */
  openPeer(id: string, userId: string | null, sendText: (s: string) => void, sendBinary: (b: Uint8Array) => boolean,
    sid: string | null = null, resume = false): void {
    const p: Peer = { id, userId, sendText, sendBinary, socks: new Map(), sid, held: null };
    this.peers.set(id, p);
    if (sid && !resume) this.sids.set(sid, p);
  }

  /** Whether this user may open another WebSocket (do.ts answers 429 before accepting it). */
  canOpen(userId: string | null): boolean {
    if (userId === null) return true;
    let n = 0;
    for (const p of this.peers.values()) if (p.userId === userId && !p.held) n++;
    return n < MAX_PEERS_PER_USER;
  }

  /** The WebSocket closed. With a sid (and hold), its sockets stay open toward the game for RESUME_HOLD_MS, their
   *  output buffered, for the client's resume; else (or when the hold ends) each one closes like a TCP close. */
  closePeer(id: string, hold = true): void {
    const p = this.peers.get(id);
    if (!p || p.held) return;
    if (hold && p.sid && this.sids.get(p.sid) === p && p.socks.size) {
      p.held = setTimeout(() => this.endPeer(p), RESUME_HOLD_MS);
      this.log(`[srv] ${id}: WebSocket gone, ${p.socks.size} sockets held ${RESUME_HOLD_MS / 1000} s for a resume`);
      return;
    }
    this.endPeer(p);
  }
  private endPeer(p: Peer): void {
    if (p.held) clearTimeout(p.held);
    p.held = null;
    this.peers.delete(p.id);
    if (p.sid && this.sids.get(p.sid) === p) this.sids.delete(p.sid);
    for (const s of p.socks.values()) this.enqueue(p, s, { eof: true }); // like a TCP close: queued messages first
  }

  /** {"type":"resume","sid","socks":[{id,rx}]} on a new WebSocket: the held (or half-open) peer with that sid, same
   *  user, hands its sockets over. Each listed socket answers our rx and gets everything after the client's rx again;
   *  an unlisted one, or one whose bytes are no longer kept, is closed. */
  private resume(p: Peer, m: { sid?: unknown; socks?: unknown }): void {
    const old = typeof m.sid === "string" ? this.sids.get(m.sid) : undefined;
    if (!old || old === p || m.sid !== p.sid || old.userId !== p.userId) {
      p.sendText(JSON.stringify({ type: "resume", ok: false }));
      this.log(`[srv] ${p.id}: resume refused (${!old ? "unknown or expired sid" : "another user"})`);
      return;
    }
    if (old.held) clearTimeout(old.held);
    old.held = null;
    this.peers.delete(old.id);
    this.sids.set(p.sid!, p);
    const want = new Map<number, number>();
    for (const x of Array.isArray(m.socks) ? m.socks : []) if (Number.isInteger(x?.id) && Number.isInteger(x?.rx)) want.set(x.id, x.rx);
    const back: { id: number; rx: number }[] = [], again: [VSock, Uint8Array][] = [];
    for (const vs of old.socks.values()) {
      const rx = want.get(vs.id);
      const kept = rx === undefined ? null : this.after(vs, rx);
      if (!kept || p.socks.has(vs.id)) { this.enqueue(old, vs, { eof: true }); continue; }
      vs.peer = p;
      p.socks.set(vs.id, vs);
      back.push({ id: vs.id, rx: vs.rx });
      again.push([vs, kept]);
    }
    p.sendText(JSON.stringify({ type: "resumed", socks: back }));
    for (const [vs, b] of again) if (b.length) p.sendBinary(dataFrame(vs.id, b));
    this.log(`[srv] ${p.id}: resumed ${old.id}: ${back.length} sockets`);
  }
  /** What the client hasn't got of vs's output after its rx, or null if those bytes are gone. */
  private after(vs: VSock, rx: number): Uint8Array | null {
    if (rx < vs.outBase || rx > vs.outBase + vs.outLen) return null;
    this.trim(vs, rx);
    return concat(new Uint8Array(0), vs.out.reduce((a, b) => concat(a, b), new Uint8Array(0)));
  }
  /** Drops vs's kept output up to byte rx (the client has it). */
  private trim(vs: VSock, rx: number): void {
    while (vs.out.length && vs.outBase + vs.out[0].length <= rx) { vs.outBase += vs.out[0].length; vs.outLen -= vs.out[0].length; vs.out.shift(); }
    if (vs.out.length && rx > vs.outBase) { const k = rx - vs.outBase; vs.out[0] = vs.out[0].subarray(k); vs.outBase = rx; vs.outLen -= k; }
  }
  /** A socket's bytes to the client: kept for a resume, sent if its WebSocket is up (a held one only keeps them). */
  private sendOut(vs: VSock, b: Uint8Array): boolean {
    if (vs.peer.sid) {
      if (vs.outLen + b.length > RESUME_MAX_OUT) { vs.outBase += vs.outLen + b.length; vs.out = []; vs.outLen = 0; }   // too far behind: not resumable
      else { vs.out.push(b); vs.outLen += b.length; }
    }
    return vs.peer.held ? true : vs.peer.sendBinary(dataFrame(vs.id, b));
  }
  /** Our rx to the client, at most once per ACK_MS, so it can drop what we have. */
  private ack(vs: VSock): void {
    if (!vs.peer.sid || vs.ackTimer) return;
    const send = () => { vs.ackTimer = null; vs.ackT = Date.now(); if (!vs.closed && !vs.peer.held) vs.peer.sendText(JSON.stringify({ type: "ack", id: vs.id, rx: vs.rx })); };
    const wait = vs.ackT + ACK_MS - Date.now();
    if (wait <= 0) send(); else vs.ackTimer = setTimeout(send, wait);
  }

  onText(peerId: string, text: string): void {
    const p = this.peers.get(peerId);
    const m = parseControl(text);
    if (!p || !m) return;
    if (m.type === "resume") return this.resume(p, m as { sid?: unknown; socks?: unknown });
    const id = Number(m.id);
    if (m.type === "ack") {
      const vs = p.socks.get(id), rx = Number((m as { rx?: unknown }).rx);
      if (vs && Number.isInteger(rx)) this.trim(vs, Math.min(rx, vs.outBase + vs.outLen));
      return;
    }
    if (m.type === "open") {
      const port = Number((m as { port: number }).port) - this.cfg.portOffset;
      if (!Number.isInteger(id) || !PORTS.has(port) || p.socks.size >= MAX_SOCKS_PER_PEER || p.socks.has(id)) {
        p.sendText(JSON.stringify({ type: "open", id, status: ECONNREFUSED }));
        return;
      }
      let vs: VSock;
      const conn = new Conn(this, this.seqTable, port, peerId, (b) => this.sendOut(vs, b), PORTS.duel, this.cfg.sendPace);
      conn.userId = p.userId;
      vs = { id, conn, reader: new Reader(), closed: false, inq: [], busy: false, dead: false,
        wire: this.cfg.cardWire ? "wait" : "ok", peer: p, rx: 0, out: [], outBase: 0, outLen: 0, ackT: 0, ackTimer: null };
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
        this.sendOut(vs, pack(HELLO_S, new W().u16(WIRE_VERSION).u32(cardmap().wireHash).bytes(), 0));
        setTimeout(() => {
          if (vs.wire === "wait" && !vs.closed) this.enqueue(vs.peer, vs, { kill: "no card-wire hello (an older client build)" });
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
    vs.rx += f[1].length;
    this.ack(vs);
    this.parse(p, vs, f[1].slice());
  }

  /** Server-side close of a connection (py c.sock.close()). */
  close(c: Conn, why = "closed by server"): void {
    const pv = this.sockOf.get(c);
    if (!pv) { c.closed = true; return; }
    const [, vs] = pv;
    const p = vs.peer;
    if (!vs.closed && !p.held) p.sendText(JSON.stringify({ type: "close", id: vs.id }));
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
    p = vs.peer;
    if (!vs.closed && !p.held) p.sendText(JSON.stringify({ type: "close", id: vs.id }));
    this.sockClosed(p, vs, why);
  }

  private sockClosed(p: Peer, vs: VSock, why: string): void {
    if (vs.closed) return;
    vs.closed = true;
    if (vs.ackTimer) clearTimeout(vs.ackTimer);
    p = vs.peer;
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
