// One YO2 TCP connection (py yo2srv/red/conexion.py Conn), carried as a virtual socket of a gateway WebSocket.
//
// The client checks the seq number (header "param") of every message it receives: it must be its per-connection
// counter + 1 (FUN_0068bac0), or it drops the message silently. A connection that starts at #1 keeps its own counter;
// one that starts later continues the count the client left on that port (GATE_SEQ), keyed by (account or peer,
// port, next client seq). The client handles one message per frame, so sends are queued and paced.
import { MAX_DATA, pack } from "./proto.ts";

export interface ConnHost {
  /** The client's current connection on c's port (its session's, else its peer's last one). */
  currentConn(c: Conn): Conn | undefined;
  /** Hook run just before a message goes out (py: 0x4306 issues the duel ticket). */
  beforeSend?(c: Conn, msgId: number): void;
  log(line: string): void;
}

export interface SessionLike { acct?: string | null; conns: Map<number, Conn> }

type Item = { id: number; data: Uint8Array; pause: number };

export class Conn {
  /** py Conn.GATE_SEQ, shared by every connection of a server (one per World). */
  static newSeqTable(): Map<string, number> { return new Map(); }

  closed = false;
  sess: SessionLike | null = null;
  rxT: number | null = null;
  /** The DE user bound to this connection's WebSocket (null only on the DEV parity bridge). */
  userId: string | null = null;
  /** Set by 0x0003 (bye). */
  bye = false;
  private seqN = 0;
  private last: number | null = null;
  private pend: number | null = null;
  private kept: Set<string> | null = null;
  private q: Item[] = [];
  private pumping = false;
  /** Free-form per-connection fields the game modules hang here (py sets attributes on Conn). */
  ext: Record<string, unknown> = {};

  constructor(
    readonly host: ConnHost,
    readonly seqTable: Map<string, number>,
    /** Canonical port (no offset). */
    readonly port: number,
    /** Who the client is before it has a session: its WebSocket. */
    readonly peer: string,
    private readonly write: (bytes: Uint8Array) => boolean,
    readonly duelPort: number,
    /** Upper bound on the pause after each message, in s (config sendPace); null = py's pauses (parity). */
    readonly paceCap: number | null = null,
  ) {}

  private who(): string { return this.sess?.acct || this.peer; }

  get seq(): number {
    const n = this.pend;
    if (n !== null && this.sess?.acct) {
      this.pend = null; // duel: the account is known now (0x6001 -> attach): continue its count
      this.seqN = this.seqTable.get(`${this.who()}|${this.port}|${n}`) ?? this.seqTable.get(`${this.who()}|${this.port}`) ?? 0;
    }
    return this.seqN;
  }

  set seq(v: number) { this.seqN = v; this.keep(); }

  private keep(): void {
    if (this.last === null) return;
    const keys = new Set([this.who(), this.peer].map((w) => `${w}|${this.port}|${this.last! + 1}`));
    for (const k of this.kept ?? []) if (!keys.has(k)) this.seqTable.delete(k);
    for (const w of [this.who(), this.peer]) {
      this.seqTable.set(`${w}|${this.port}|${this.last + 1}`, this.seqN);
      this.seqTable.set(`${w}|${this.port}`, this.seqN);
    }
    this.kept = keys;
  }

  /** Called for every message the client sends (py saw_client). */
  sawClient(param: number): void {
    this.rxT = Date.now() / 1000;
    if (param === 1) {
      this.seqN = 0; this.pend = null;
    } else if (this.last === null) { // first message and not #1: continue the client's count
      if (this.port === this.duelPort && !this.sess?.acct) this.pend = param; // account comes with 0x6001
      else this.seqN = this.seqTable.get(`${this.who()}|${this.port}|${param}`) ?? this.seqTable.get(`${this.who()}|${this.port}`) ?? 0;
    }
    this.last = param;
    this.keep();
  }

  /** True when nothing should go out here: closed, or this client already uses another connection on this port. */
  stale(): boolean {
    if (this.closed) return true;
    const cur = this.host.currentConn(this);
    if (!cur || cur === this) return false;
    // a connection that has not spoken yet does not make a talking one stale (py 13-10)
    return cur.rxT !== null || this.rxT === null;
  }

  /** py Conn.send: queued; the pause runs after the message goes out. */
  send(msgId: number, data: Uint8Array = new Uint8Array(0), pause = 0.25): void {
    if (this.closing) return;
    this.q.push({ id: msgId, data, pause });
    if (!this.pumping) void this.pump();
  }

  /** py Conn.post: the same queue, short pause (notices to OTHER clients). */
  post(msgId: number, data: Uint8Array = new Uint8Array(0), pause = 0.02): void {
    if (this.stale()) return;
    this.send(msgId, data, pause);
  }

  /** What is queued still goes out, nothing after it (py: send, then c.closed = True). */
  closeAfterFlush(): Promise<void> {
    const p = this.flushed();
    this.closing = true;
    return p.then(() => { this.closed = true; });
  }
  private closing = false;

  /** Resolves once everything queued so far is out. */
  flushed(): Promise<void> {
    return new Promise((res) => {
      this.waiters.push(res);
      this.q.push({ id: -1, data: new Uint8Array(0), pause: 0 }); // also while closing: the marker always resolves
      if (!this.pumping) void this.pump();
    });
  }
  private waiters: (() => void)[] = [];

  private async pump(): Promise<void> {
    this.pumping = true;
    try {
      while (this.q.length) {
        const it = this.q.shift()!;
        if (it.id === -1) { this.waiters.shift()?.(); continue; }
        const pause = this.paceCap === null ? it.pause : Math.min(it.pause, this.paceCap);
        if (this.sendNow(it) && pause > 0) await new Promise((r) => setTimeout(r, pause * 1000));
      }
    } finally {
      this.pumping = false;
    }
  }

  private sendNow({ id, data }: Item): boolean {
    const hx = (n: number) => n.toString(16).padStart(4, "0");
    if (data.length > MAX_DATA) {
      this.host.log(`[ERROR] [srv:${this.port}] 0x${hx(id)} of ${data.length} B > ${MAX_DATA}: NOT sent`);
      return false;
    }
    if (this.stale()) {
      this.host.log(`[aviso] [srv:${this.port}] 0x${hx(id)} on a ${this.closed ? "closed" : "stale"} connection: dropped`);
      return false;
    }
    this.host.beforeSend?.(this, id);
    const seq = this.seq + 1;
    if (!this.write(pack(id, data, seq))) {
      this.closed = true;
      this.host.log(`[srv:${this.port}] -> 0x${hx(id)} #${seq} FAILED: connection closed, seq not spent`);
      return false;
    }
    this.seq = seq;
    this.host.log(`[srv:${this.port}] -> 0x${hx(id)} #${seq} len=${data.length}`);
    return true;
  }
}
