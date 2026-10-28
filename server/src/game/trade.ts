// Card trade between two players (py research/intercambio/proposal.py, TP): the 0x7000 envelope.
import type { Conn } from "../net/conn.ts";
import { W } from "../net/proto.ts";
import type { Game } from "./game.ts";
import type { Session } from "./hub.ts";
import * as PP from "./persist.ts";

const SUB = { TRADESTART: 0x7101, REQTRADE: 0x7102, OFFERREPLY: 0x7105, CANCELREQ: 0x7108, USEREXIT: 0x7112, ADDCARD: 0x7113,
  DELETECARD: 0x7114, SETSTATUS: 0x7117, LASTCONFIRM: 0x7119, ARRIVE: 0x7122, CLEAR: 0x7128, READY: 0x7132 };
const M = { REQTRADERESULT: 0x7103, TRADEOFFER: 0x7104, OFFERREPLY: 0x7105, CANCELNOTICE: 0x7109, USEREXIT: 0x7112, ADDCARD: 0x7113,
  DELETECARD: 0x7114, MOVEOTHER: 0x7116, SETSTATUS: 0x7117, ALLREADY: 0x7118, LASTCONFIRMRESULT: 0x7120, TRADEEND: 0x7121,
  ARRIVE: 0x7122, TRUNKSTART: 0x7125, TRUNK: 0x7126, TRUNKEND: 0x7127, LIMITSTART: 0x7129, LIMIT: 0x7130, LIMITEND: 0x7131,
  STARTRESULT: 0x7133, CHANGESTATUS: 0x7134 };
const REQ_FAIL = -493, MAX_CARD = 0xcb8, MAX_OFFER = 10, CONFIRM_YES = 1, CONFIRM_NO = 2, RESULT_DONE = 3, RESULT_BACK = 2;
const CHUNKS = [0x200, 0x200, 0x200, 0x200, 0x200, 0x200, 0xb8];
const DECLINE_VALUE = 1, SEND_PAUSE = 0.03;
const s32 = (v: number) => new W().u32(v).bytes();
const EMPTY: Uint8Array = new Uint8Array(0);
const name16 = (t: string) => { const raw = Buffer.from([...String(t || "Duelista")].map((ch) => (ch.charCodeAt(0) > 255 ? "?" : ch)).join(""), "latin1").subarray(0, 15); const o = new Uint8Array(16); o.set(raw); return o; };

class Trade {
  phase: "offer" | "open" | "done" = "offer";
  conn: Map<number, Conn | null>;
  known: Map<number, number>;
  offer: Map<number, number[]>;
  ready: Map<number, boolean>;
  confirm: Map<number, number | null>;
  started: Map<number, boolean>;
  queue: Map<number, [number, Uint8Array][]>;
  inflight: Map<number, number | null>;
  constructor(readonly a: Session, ca: Conn, readonly b: Session) {
    const both = <T>(x: T, y: T) => new Map([[a.pid!, x], [b.pid!, y]]);
    this.conn = both<Conn | null>(ca, null);
    this.known = both(0, a.pid!);
    this.offer = both<number[]>([], []);
    this.ready = both(false, false);
    this.confirm = both<number | null>(null, null);
    this.started = both(false, false);
    this.queue = both<[number, Uint8Array][]>([], []);
    this.inflight = both<number | null>(null, null);
  }
  other(pid: number) { return pid === this.a.pid ? this.b : this.a; }
  sess(pid: number) { return pid === this.a.pid ? this.a : this.b; }
}

export class Trades {
  private trades = new Map<number, Trade>();
  constructor(private g: Game) {}

  private tradeOf(s: Session | null) { return s && s.pid !== null ? this.trades.get(s.pid) ?? null : null; }
  private drop(t: Trade) { for (const p of [t.a.pid!, t.b.pid!]) if (this.trades.get(p) === t) this.trades.delete(p); }

  private to(t: Trade, pid: number, mid: number, data = EMPTY, c: Conn | null = null) {
    const s = t.sess(pid), cc = t.conn.get(pid) ?? null;
    if (c && (cc === c || c.sess === s)) { c.send(mid, data, SEND_PAUSE); return; }
    if (s.lobby) { if (!s.lobby.closed) s.lobby.post(mid, data, SEND_PAUSE); }
    else if (cc && !cc.closed) cc.post(mid, data, SEND_PAUSE);
    else this.g.log(`[intercambio] 0x${mid.toString(16)} for pid ${pid}: no connection`);
  }

  private withProfile<T>(s: Session, fn: (p: any) => T, save = false): T {
    return this.g.withCtx(s, () => {
      const st = this.g.loadState();
      const p = PP.profile(st, s.slot ?? PP.activeSlot(st))!;
      const r = fn(p);
      if (save) this.g.saveState(st);
      return r;
    });
  }
  private trunkBytes(s: Session) { try { return this.withProfile(s, PP.trunkBytes); } catch { return new Uint8Array(MAX_CARD); } }
  private limitBytes(_s: Session) { return new Uint8Array(MAX_CARD); } // py LIMIT_BYTES None = zeros
  private table(start: number, mid: number, end: number, raw: Uint8Array): [number, Uint8Array][] {
    const out: [number, Uint8Array][] = [[start, EMPTY]];
    let pos = 0;
    for (const n of CHUNKS) { out.push([mid, raw.slice(pos, pos + n)]); pos += n; }
    out.push([end, EMPTY]);
    return out;
  }
  private sendTrunk(t: Trade, pid: number, c: Conn | null = null) { for (const [m, d] of this.table(M.TRUNKSTART, M.TRUNK, M.TRUNKEND, this.trunkBytes(t.sess(pid)))) this.to(t, pid, m, d, c); }
  private sendLimit(t: Trade, pid: number, c: Conn | null = null) { for (const [m, d] of this.table(M.LIMITSTART, M.LIMIT, M.LIMITEND, this.limitBytes(t.sess(pid)))) this.to(t, pid, m, d, c); }
  private available(s: Session, cid: number) {
    let n: number;
    try { n = this.withProfile(s, (p) => PP.int(p.trunk?.[String(cid)] ?? 0)); } catch { return 0; }
    return cid >= 1 && cid <= MAX_CARD ? n - this.limitBytes(s)[cid - 1] : 0;
  }

  private execute(t: Trade): boolean {
    const { a, b } = t;
    const giveA = [...t.offer.get(a.pid!)!], giveB = [...t.offer.get(b.pid!)!];
    try {
      for (const [s, give] of [[a, giveA], [b, giveB]] as [Session, number[]][]) {
        const need = new Map<number, number>();
        for (const x of give) need.set(x, (need.get(x) ?? 0) + 1);
        const have = this.withProfile(s, (p) => ({ ...(p.trunk ?? {}) }));
        for (const [cid, n] of need) if (!(cid >= 1 && cid <= MAX_CARD) || PP.int(have[String(cid)] ?? 0) < n) return false;
      }
      const apply = (give: number[], take: number[]) => (p: any) => { PP.trunkRemove(p, give); PP.trunkAdd(this.g, p, take, 1, "intercambio"); };
      this.withProfile(a, apply(giveA, giveB), true);
      this.withProfile(b, apply(giveB, giveA), true);
    } catch (e) { this.g.log(`[intercambio] error moving the cards: ${e}`); return false; }
    return true;
  }

  private queueMove(t: Trade, mover: number, data: Uint8Array) { const rcv = t.other(mover).pid!; t.queue.get(rcv)!.push([mover, data]); this.pump(t, rcv); }
  private pump(t: Trade, rcv: number, c: Conn | null = null) {
    if (!t.started.get(rcv) || t.inflight.get(rcv) !== null || !t.queue.get(rcv)!.length) return;
    const [mover, data] = t.queue.get(rcv)!.shift()!;
    t.inflight.set(rcv, mover);
    this.to(t, rcv, M.MOVEOTHER, data, c);
  }

  private reqtrade(c: Conn, s: Session | null, body: Uint8Array) {
    const pid = body.length >= 4 ? new DataView(body.buffer, body.byteOffset).getUint32(0) : 0;
    const o = this.g.hub.byPid(pid);
    let why: string | null = null;
    if (!s || s.pid === null) why = "no session";
    else if (!o || o.pid === null || !o.lobby) why = `pid ${pid} not online`;
    else if (o === s) why = "with itself";
    else if (this.tradeOf(s) || this.tradeOf(o)) why = "already trading";
    else if ((o.state || 0) >= 0x67 && (o.state || 0) <= 0x6a) why = "in a duel";
    if (why) { this.g.log(`[intercambio] REQTRADE -> ${pid}: -493 (${why})`); c.send(M.REQTRADERESULT, s32(REQ_FAIL), SEND_PAUSE); return; }
    const t = new Trade(s!, c, o!);
    this.trades.set(s!.pid!, t); this.trades.set(o!.pid!, t);
    c.send(M.REQTRADERESULT, s32(0), SEND_PAUSE);
    this.to(t, o!.pid!, M.TRADEOFFER, Buffer.concat([new W().u32(s!.pid!).bytes(), name16(s!.name)]));
  }

  private offerreply(c: Conn, s: Session | null, body: Uint8Array) {
    const ok = body.length >= 4 ? new DataView(body.buffer, body.byteOffset).getInt32(0) : 0;
    const t = this.tradeOf(s);
    if (!t || t.phase !== "offer" || t.b !== s) { c.send(M.OFFERREPLY, s32(-618), SEND_PAUSE); return; }
    t.conn.set(s.pid!, c);
    c.send(M.OFFERREPLY, s32(0), SEND_PAUSE);
    if (ok) { t.phase = "open"; this.to(t, t.a.pid!, M.OFFERREPLY, s32(0)); }
    else { this.drop(t); this.to(t, t.a.pid!, M.OFFERREPLY, s32(DECLINE_VALUE)); }
  }

  private cancelreq(c: Conn, s: Session | null) {
    const t = this.tradeOf(s);
    c.send(M.CANCELNOTICE, EMPTY, SEND_PAUSE);
    if (t && t.phase === "offer" && t.a === s) { this.drop(t); this.to(t, t.b.pid!, M.CANCELNOTICE); }
  }

  private ready(c: Conn, s: Session | null) {
    const t = this.tradeOf(s);
    if (!t || t.phase !== "open") return;
    t.conn.set(s!.pid!, c);
    this.sendTrunk(t, s!.pid!, c);
    this.sendLimit(t, s!.pid!, c);
  }

  private start(c: Conn, s: Session | null) {
    c.send(M.STARTRESULT, EMPTY, SEND_PAUSE);
    const t = this.tradeOf(s);
    if (t && t.phase === "open") { t.started.set(s!.pid!, true); this.pump(t, s!.pid!, c); }
  }

  private addcard(c: Conn, s: Session | null, body: Uint8Array) {
    const cid = body.length >= 2 ? (body[0] << 8) | body[1] : 0;
    const t = this.tradeOf(s);
    if (!t || t.phase !== "open") { c.send(M.ADDCARD, s32(0), SEND_PAUSE); return; }
    const mine = t.offer.get(s!.pid!)!;
    if (mine.length >= MAX_OFFER) { c.send(M.ADDCARD, s32(0), SEND_PAUSE); return; }
    void this.available; // py only logs an uncovered ADDCARD (ADDCARD_REJECT_1010 off): the trade is cancelled at the end
    mine.push(cid);
    c.send(M.ADDCARD, s32(0), SEND_PAUSE);
    this.queueMove(t, s!.pid!, new W().u16(cid).u8(0).bytes());
  }

  private deletecard(c: Conn, s: Session | null, body: Uint8Array) {
    const idx = body.length >= 2 ? (body[0] << 8) | body[1] : 0xffff;
    const t = this.tradeOf(s);
    c.send(M.DELETECARD, s32(0), SEND_PAUSE);
    if (!t || t.phase !== "open" || idx >= t.offer.get(s!.pid!)!.length) return;
    t.offer.get(s!.pid!)!.splice(idx, 1);
    this.queueMove(t, s!.pid!, new W().u16(idx).u8(1).bytes());
  }

  private arrive(c: Conn, s: Session | null) {
    const t = this.tradeOf(s);
    if (!t) return;
    const mover = t.inflight.get(s!.pid!) ?? null;
    t.inflight.set(s!.pid!, null);
    if (mover !== null) this.to(t, mover, M.ARRIVE, EMPTY, c);
    this.pump(t, s!.pid!, c);
  }

  private setstatus(c: Conn, s: Session | null) {
    const t = this.tradeOf(s);
    if (!t || t.phase !== "open") { c.send(M.SETSTATUS, Uint8Array.of(0), SEND_PAUSE); return; }
    t.ready.set(s!.pid!, true);
    t.confirm = new Map([[t.a.pid!, null], [t.b.pid!, null]]);
    c.send(M.SETSTATUS, Uint8Array.of(1), SEND_PAUSE);
    const o = t.other(s!.pid!);
    this.to(t, o.pid!, M.CHANGESTATUS, Uint8Array.of(1), c);
    if ([...t.ready.values()].every((x) => x)) { this.to(t, s!.pid!, M.ALLREADY, EMPTY, c); this.to(t, o.pid!, M.ALLREADY, EMPTY, c); }
  }

  private lastconfirm(c: Conn, s: Session | null, body: Uint8Array) {
    if (body.length < 1) return;
    const choice = body[0];
    const t = this.tradeOf(s);
    if (!t || t.phase !== "open" || choice === 0) return;
    t.confirm.set(s!.pid!, choice === CONFIRM_YES || choice === CONFIRM_NO ? choice : CONFIRM_NO);
    const a = t.a.pid!, b = t.b.pid!;
    if ([...t.confirm.values()].includes(CONFIRM_NO)) {
      t.ready = new Map([[a, false], [b, false]]);
      t.confirm = new Map([[a, null], [b, null]]);
      for (const p of [a, b]) this.to(t, p, M.LASTCONFIRMRESULT, Uint8Array.of(RESULT_BACK), c);
      return;
    }
    if ([...t.confirm.values()].includes(null)) return;
    const done = this.execute(t);
    t.phase = "done";
    for (const p of [a, b]) {
      this.to(t, p, M.LASTCONFIRMRESULT, Uint8Array.of(RESULT_DONE), c);
      this.to(t, p, M.TRADEEND, Uint8Array.of(done ? 1 : 0), c);
      if (done) this.sendTrunk(t, p, c);
    }
  }

  private abort(t: Trade, s: Session, c: Conn | null, _why: string) {
    this.drop(t);
    if (t.phase === "done") return;
    const o = t.other(s.pid!);
    this.to(t, o.pid!, M.USEREXIT, new W().u32(t.known.get(o.pid!)!).bytes(), c);
  }

  private userexit(c: Conn, s: Session | null) {
    const t = this.tradeOf(s);
    if (!t) return;
    if (t.phase === "offer" && t.b === s) { this.drop(t); this.to(t, t.a.pid!, M.OFFERREPLY, s32(DECLINE_VALUE), c); }
    else this.abort(t, s!, c, "TRADEUSEREXIT");
  }

  /** py h_trade: 0x7000 = u16 subcommand + fields. */
  handle(c: Conn, data: Uint8Array): boolean {
    const sub = data.length >= 2 ? (data[0] << 8) | data[1] : 0;
    const s = c.sess as Session | null, body = data.slice(2);
    switch (sub) {
      case SUB.REQTRADE: this.reqtrade(c, s, body); break;
      case SUB.OFFERREPLY: this.offerreply(c, s, body); break;
      case SUB.CANCELREQ: this.cancelreq(c, s); break;
      case SUB.READY: this.ready(c, s); break;
      case SUB.TRADESTART: this.start(c, s); break;
      case SUB.ADDCARD: this.addcard(c, s, body); break;
      case SUB.DELETECARD: this.deletecard(c, s, body); break;
      case SUB.ARRIVE: this.arrive(c, s); break;
      case SUB.SETSTATUS: this.setstatus(c, s); break;
      case SUB.LASTCONFIRM: this.lastconfirm(c, s, body); break;
      case SUB.USEREXIT: this.userexit(c, s); break;
      case SUB.CLEAR: { const t = this.tradeOf(s); if (t) this.abort(t, s!, c, "TRADECLEAR"); break; }
      default: this.g.log(`[intercambio] unknown subcommand 0x${sub.toString(16)}`);
    }
    return true;
  }

  onClose(c: Conn) {
    const s = c.sess as Session | null;
    const t = this.tradeOf(s);
    if (!t) return;
    if (t.conn.get(s!.pid!) !== c && s!.lobby !== c) return;
    if (t.phase === "offer" && t.b === s) { this.drop(t); this.to(t, t.a.pid!, M.OFFERREPLY, s32(DECLINE_VALUE)); }
    else this.abort(t, s!, null, "connection closed");
  }
}
