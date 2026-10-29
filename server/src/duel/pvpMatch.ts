// py pvp_match.py (PVP): Matches (reservations {pidA, pidB} left by an accepted challenge, and the routing of duel
// connections: the one whose 0x6001 has a reserved pid belongs to its PvpMatch) and PvpMatch (the synchronized start of
// both clients, the duel through ocgSession.PvpSession, the end with each one's lobby, surrender / disconnection /
// time-up, best-of-3 matches, spectators, the duel record 0x6010.. and the PvP card offer). py runs one worker
// thread per match; here one FIFO per match whose items run as World handlers.
import type { Conn } from "../net/conn.ts";
import { W } from "../net/proto.ts";
import type { Game } from "../game/game.ts";
import { keyPort, type Session } from "../game/hub.ts";
import * as PP from "../game/persist.ts";
import { DEFAULT_CFG } from "./translator/consts.ts";
import { cardmap, type Deck } from "./data.ts";
import { duelsvrinfomsg, timeup_warning } from "./lockstep.ts";
import * as DFM from "./duelfin.ts";
import * as DL from "./duellog.ts";
import { PvpSession, Sender, type SItem } from "./ocgSession.ts";
import { X } from "./port.ts";

type P = Record<string, any>;
type Json = Record<string, any>;

const M_TEST_AUTO = 0x7ffe, M_TEST_LOSE = 0x7ffd;
const ATTACH_TIMEOUT = 90;
const PVP_SVRINFO = true, PVP_DUELLOG_FINISH = true, PVP_DUELLOG_RECORD = true;
const SVRINFO_WAIT = 1.5, SVR_DISCONNECT = 1, SVR_SURRENDER = 2, SVR_TIMEUP = 3;
const DLG_SURRENDER_TURN = 82;
const SURRENDER_ROOM_OPTION = true, SURRENDER_ENDS_MATCH = false, SURRENDER_FIN_OFICIAL = true;
const GUNSLINGER_KINDS = [7, 15];
const LP_START = 8000;
export const COUNTRY = Uint8Array.from([0x45, 0x53, 0x50, 0]);
const PVP_WATCH = true;
export const WATCH_BATCH = 64, WATCH_REQ_TTL = 60.0, WATCH_SIN_DECISIONES = true, WATCH_SEND_PREP = false;
const PVP_MATCH = "1", MATCH_STYLE = 4, MATCH_WAIT = 300;
const NEXT_MSGS = new Set([0x6600, 0x6601, 0x6603, 0x6100, 0x6101, 0x6102, 0x6103, 0x61fe]);
const SWAP_TIME = 180, SWAP_LEAD = 10, GLOBAL_CLOCK = 3;
const now = () => Date.now() / 1000;
const errStr = (e: unknown) => (e instanceof Error ? `${e.name}(${JSON.stringify(e.message)})` : String(e));
const u32at = (d: Uint8Array, at = 0) => new DataView(d.buffer, d.byteOffset, d.byteLength).getUint32(at);
const cat = (...a: Uint8Array[]) => { const o = new Uint8Array(a.reduce((n, x) => n + x.length, 0)); let i = 0; for (const x of a) { o.set(x, i); i += x.length; } return o; };

/** True if this 0x6202 must NOT reach a spectator: the play request (0x1a) and any decision window (0x32 / 0x33). */
export function watchOculta(d: Uint8Array): boolean {
  if (d.length < 12) return false;
  const tipo = u32at(d, 0) & 0xff, b = u32at(d, 4), p0 = u32at(d, 8);
  if (tipo === 0x1a) return true;
  if (tipo === 0x1b) return (b === 0x32 && p0 !== 0xff) || b === 0x33;
  return false;
}

// ---- persistencia DuelTally (B51): the profile counters gathered DURING a PvP from duelcore's events
const T_MONSTER = 0x1, T_SPELL = 0x2, T_TRAP = 0x4, T_FUSION = 0x40, LOC_MZONE = 0x4, LOC_GRAVE = 0x10, R_TRIBUTE = 0x1a, R_SPSUMMON = 0x800;
export class DuelTally {
  n: Record<string, [number, number]> = Object.fromEntries(["tribute1", "tribute2", "tribute3", "fusions", "ss_grave", "ss_total",
    "trap", "spell", "effect", "comeback_wins", "comeback_losses"].map((k) => [k, [0, 0]]));
  sideSwaps: [number, number] = [0, 0];
  private trib = 0;
  private mv: Json | null = null;
  private lp = [8000, 8000];
  private behind = [0, 0];
  constructor(private typeof_: (code: number) => number, private comebackLp = 0) {}
  feedMany(evs: Json[]) { for (const ev of evs) this.feed(ev); }
  private setLp(lp: unknown[]) {
    const a = Number(lp[0]), b = Number(lp[1]);
    if (!Number.isFinite(a) || !Number.isFinite(b)) return;
    this.lp = [Math.trunc(a), Math.trunc(b)];
    for (const p of [0, 1]) this.behind[p] = Math.max(this.behind[p], this.lp[1 - p] - this.lp[p]);
  }
  feed(ev: Json) {
    const kind = ev.ev;
    if (Array.isArray(ev.lp) && ev.lp.length === 2) this.setLp(ev.lp);
    if (kind === "end") {
      const w = ev.winner;
      if (this.comebackLp > 0 && (w === 0 || w === 1) && this.behind[w] >= this.comebackLp) { this.n.comeback_wins[w]++; this.n.comeback_losses[1 - w]++; }
      return;
    }
    if (kind !== "msg") return;
    const t = ev.type;
    if (t === "MOVE") {
      const fr = ev.from ?? {}, to = ev.to ?? {};
      const reason = PP.int(ev.reason || 0);
      if (fr.location === LOC_MZONE && (reason & R_TRIBUTE) === R_TRIBUTE) this.trib++;
      if (to.location === LOC_MZONE && reason & R_SPSUMMON) this.mv = ev;
    } else if (t === "SUMMONING" || t === "SET") {
      if (t === "SUMMONING" || ev.location === LOC_MZONE) {
        const p = ev.controller;
        if (this.trib && (p === 0 || p === 1)) this.n[`tribute${Math.min(this.trib, 3)}`][p]++;
        this.trib = 0;
      }
    } else if (t === "SPSUMMONING") {
      const p = ev.controller;
      if (p === 0 || p === 1) {
        this.n.ss_total[p]++;
        const m = this.mv;
        this.mv = null;
        let code: any;
        if (m && (m.to ?? {}).sequence === ev.sequence && (m.to ?? {}).controller === p) {
          if ((m.from ?? {}).location === LOC_GRAVE) this.n.ss_grave[p]++;
          code = ev.code || m.card;
        } else code = ev.code;
        if (code && PP.int(this.typeof_(code) || 0) & T_FUSION) this.n.fusions[p]++;
      }
      this.trib = 0;
    } else if (t === "CHAINING") {
      const p = ev.triggering_controller !== undefined ? ev.triggering_controller : ev.controller;
      const ty = ev.code ? PP.int(this.typeof_(ev.code) || 0) : 0;
      const key = ty & T_SPELL ? "spell" : ty & T_TRAP ? "trap" : ty & T_MONSTER ? "effect" : null;
      if (key && (p === 0 || p === 1)) this.n[key][p]++;
      this.trib = 0;
    } else if (t === "NEW_PHASE" || t === "NEW_TURN") this.trib = 0;
  }
  forPlayer(k: number): Record<string, number> {
    const o = 1 - k, n = this.n;
    const out: Record<string, number> = { tribute1: n.tribute1[k], tribute2: n.tribute2[k], tribute3: n.tribute3[k], fusions: n.fusions[k],
      ss_grave: n.ss_grave[k], ss_total: n.ss_total[k], trap_me: n.trap[k], trap_opp: n.trap[o], spell_me: n.spell[k], spell_opp: n.spell[o],
      effect_me: n.effect[k], effect_opp: n.effect[o], comeback_wins: n.comeback_wins[k], comeback_losses: n.comeback_losses[k], side_swaps: this.sideSwaps[k] };
    return Object.fromEntries(Object.entries(out).filter(([, v]) => v));
  }
}

/** pvp_match.pvp_record as research/mundo wraps it (pvp_titles on). */
function pvpRecord(g: Game, p: P, res: number, turns = 0): void {
  const r = (p.rec ??= {});
  PP.recInc(r, "duels");
  PP.recInc(r, "turns", Math.max(0, PP.int(turns || 0)));
  if (res === DFM.RESULT_WIN) { PP.recInc(r, "duels_won"); PP.recInc(r, "wins"); }
  else if (res === DFM.RESULT_LOSE) { PP.recInc(r, "duels_lost"); PP.recInc(r, "losses"); }
  else PP.recInc(r, "duels_drawn");
  (p.pvp ??= {}).last = { result: res, t: Math.floor(now()) };
  try {
    const bits = PP.checkTitles(p, null, turns);
    if (bits.length) { PP.pendingAdd(g, p, bits, [], PP.VIA_ANY, "títulos PvP"); g.log(`[mundo] títulos por PvP pendientes: ${JSON.stringify(bits)}`); }
  } catch (e) { g.log(`[mundo] títulos PvP: ${errStr(e)}`); }
}

/** 0x6611 without «Surrender» (bit 10 of the own deck's mask, at byte 36). */
function quitaRendirse(data: Uint8Array): Uint8Array {
  if (data.length !== 110) return data;
  const o = 36, m = (data[o] << 8) | data[o + 1];
  if (!(m & (1 << 10))) return data;
  const out = data.slice();
  const v = m & ~(1 << 10);
  out[o] = v >> 8; out[o + 1] = v & 0xff;
  return out;
}

/** A player's send queue: _SurrTx (room with «Surrender» OFF) + _RecTx (records the 0x6202 for the replay/spectators). */
class PvpTx {
  constructor(private tx: Sender, private m: PvpMatch, private side: number) {}
  put(msgs0: readonly SItem[]): void {
    const msgs = [...msgs0];
    this.m.rec().note(this.side, msgs);
    const out = SURRENDER_ROOM_OPTION && this.m.roomSurrender === 0
      ? msgs.map((x) => (Array.isArray(x) && x[0] === 0x6611 ? [0x6611, quitaRendirse(x[1])] as [number, Uint8Array] : x)) : msgs;
    this.tx.put(out);
    if (PVP_WATCH && this.side === 0) this.m.watchPump();
  }
}

type Item = ["msg", Conn, number, Uint8Array] | ["close", Conn] | ["watch", Conn] | ["timeout"] | ["cancel", string]
  | ["clock", number, number] | ["tick", number] | ["between", number];

export class Matches {
  pids = new Map<number, PvpMatch>();
  watchReq = new Map<string, [PvpMatch, number]>();
  constructor(readonly g: Game, readonly pause: number, readonly test: boolean) {}
  log(s: string) { this.g.log(s); }

  reserve(sa: Session, sb: Session): PvpMatch {
    for (const s of [sa, sb]) { const old = this.pids.get(s.pid!); if (old) old.cancel("nueva reserva"); }
    const m = new PvpMatch(this, sa, sb);
    this.pids.set(sa.pid!, m); this.pids.set(sb.pid!, m);
    m.roomTime = this.room(sa, sb, (r) => (r.x?.length >= 2 ? (r.x[1] ? 1 : 0) : undefined));
    m.matchStyle = this.room(sa, sb, (r) => r.dstyle);
    m.roomSurrender = this.room(sa, sb, (r) => (r.x?.length >= 1 ? (r.x[0] ? 1 : 0) : undefined));
    this.log(`[pvp] reserva ${m.name}: ${sa.acct} contra ${sb.acct}` + (m.roomTime === 0 ? " (sala con «Límite de Tiempo» OFF)" : "")
      + (m.roomSurrender === 0 ? " (sala con «Rendirse» OFF)" : "") + (m.matchStyle === MATCH_STYLE ? (m.bo3() ? " (MATCH al mejor de 3)" : " (sala de match)") : ""));
    return m;
  }

  /** a field of the room where the duel is agreed (the owner's: player 1), or null */
  private room(sa: Session, sb: Session, f: (r: any) => number | undefined): number | null {
    let rooms: any[];
    try { rooms = [...this.g.lp.mem.rooms.values()]; } catch { return null; }
    for (const s of [sb, sa]) for (const r of rooms) if (r.p1 === s.pid && !r.npc) { const v = f(r); if (v !== undefined) return v ?? null; }
    return null;
  }

  byPid(pid: number | null | undefined): PvpMatch | null { return pid == null ? null : this.pids.get(pid) ?? null; }

  drop(m: PvpMatch): void { for (const p of m.pids) if (this.pids.get(p) === m) this.pids.delete(p); }

  watchRequest(peer: string, pid: number): PvpMatch | null {
    if (!PVP_WATCH) return null;
    const m = this.byPid(pid);
    if (!m || m.done) return null;
    this.watchReq.set(peer, [m, now()]);
    return m;
  }

  route(c: Conn, msgId: number): PvpMatch | null {
    const m0 = X(c).pvp as PvpMatch | null | undefined;
    if (m0) return m0;
    if (msgId === 0x6700 && PVP_WATCH) {
      const req = this.watchReq.get(c.peer);
      this.watchReq.delete(c.peer);
      if (!req || req[0].done || now() - req[1] > WATCH_REQ_TTL) { this.log(`[pvp] 0x6700 de ${c.peer} sin 0x4320 válido: no hay duelo que mirar`); return null; }
      req[0].watchAttach(c);
      return req[0];
    }
    if (msgId !== 0x6001) return null;
    const s = c.sess as Session | null;
    const m = s ? this.byPid(s.pid) : null;
    if (!m || !m.attach(c)) return null;
    return m;
  }
}

interface WatchW { c: Conn; tx: Sender; i: number; want: boolean; jseen: boolean }

export class PvpMatch {
  static n = 0;
  readonly name: string;
  readonly g: Game;
  readonly sess: [Session, Session];
  readonly pids: [number, number];
  c: [Conn | null, Conn | null] = [null, null];
  tx: [PvpTx | null, PvpTx | null] = [null, null];
  deck: [Deck, Deck] = [{ main: [], extra: [] }, { main: [], extra: [] }];
  prep = [false, false];
  prepSent = false;
  hand: [number | null, number | null] = [null, null];
  echo6102 = [false, false];
  jwinner: number | null = null;
  firstV: number | null = null;
  first: number | null = null;
  sent6103 = false;
  ready = [false, false];
  ask = [false, false];
  okAsk = [false, false];
  roomSurrender: number | null = null;
  roomTime: number | null = null;
  matchStyle: number | null = null;
  closed = [false, false];
  ps: PvpSession | null = null;
  done = false;
  badAuto = 0;
  private recorder: DL.Recorder | null = null;
  watchers: WatchW[] = [];
  jhands: [number, number] | null = null;
  // match / start state py keeps in __dict__
  needStart = false;
  between = false;
  gameNo = 1;
  seenNext: [boolean, boolean] | null = null;
  placeManual: [boolean, boolean] = [false, false];
  firsts: number[] = [];
  games: number[] = [];
  chooser: number | null = null;
  btwGen = 0;
  swapClockOn: [boolean, boolean] | null = null;
  surr: number | null = null;
  logQ: [number, Uint8Array][][] | null = null;
  logFase: number[] | null = null;
  deckBad: Set<number> | null = null;
  deckTold: [boolean, boolean] | null = null;
  decksUsed: Deck[] | null = null;
  private xpLv: number[] | null = null;
  /** When the duel started (s), for the economy's minimum PvP length. */
  private t0 = 0;
  private chain: Promise<void> = Promise.resolve();

  constructor(readonly hub: Matches, sa: Session, sb: Session) {
    PvpMatch.n++;
    this.g = hub.g;
    this.name = `pvp-${PvpMatch.n}`;
    this.sess = [sa, sb];
    this.pids = [sa.pid!, sb.pid!];
    setTimeout(() => this.q(["timeout"]), ATTACH_TIMEOUT * 1000);
  }

  private log(s: string) { this.hub.log(s); }
  private asSess<T>(s: Session, fn: () => T): T { return this.g.withCtx(s, fn); }
  bo3(): boolean { return PVP_MATCH === "1" && this.matchStyle === MATCH_STYLE; }
  rec(): DL.Recorder { return (this.recorder ??= new DL.Recorder()); }

  put(i: number, msgs: readonly SItem[]): void { const t = this.tx[i]; if (t && !this.closed[i]) t.put(msgs); }
  send(i: number, mid: number, data: Uint8Array = new Uint8Array(0)): void { this.put(i, [[mid, data]]); }
  lobby(i: number): Conn | null { return this.g.duel!.liveConn(this.sess[i].lobby); }

  // ---- input (the sockets' handlers)
  attach(c: Conn): boolean {
    const s = c.sess as Session | null;
    if (this.done || !s || !this.pids.includes(s.pid!)) return false;
    const i = this.pids.indexOf(s.pid!);
    const old = this.c[i];
    this.c[i] = c;
    this.closed[i] = false;
    this.tx[i] = new PvpTx(new Sender(c, this.g, this.hub.pause), this, i);
    Object.assign(X(c), { pvp: this, pvpI: i });
    this.log(`[pvp] ${this.name}: conexión de duelo del jugador ${i} (${s.acct})` + (old ? " (sustituye a otra)" : ""));
    return true;
  }
  on(c: Conn, msgId: number, _param: number, data: Uint8Array): void { this.q(["msg", c, msgId, data.slice()]); }
  onClose(c: Conn): void { this.q(["close", c]); }
  watchAttach(c: Conn): void { Object.assign(X(c), { pvp: this, pvpI: null, pvpW: true }); this.q(["watch", c]); }
  cancel(why: string): void { this.q(["cancel", why]); }

  /** py self.q.put: the match's FIFO; each item is one World handler (CTX.sess = None in py's worker). An item that
   *  drives the engine (ocgSession.ts Engine) resolves when the duel waits again; the next item waits for it, as in py's
   *  single worker thread. */
  q(item: Item): void {
    const exc = (e: unknown) => this.log(`[EXC] ${this.name}: ${errStr(e)} | ${(e as Error)?.stack?.replace(/\n/g, " | ")}`);
    this.chain = this.chain.then(async () => {
      let rest: Promise<void> | undefined;
      await this.g.world.run(() => {
        this.g.ctx = null;
        try { rest = this.item(item) || undefined; } catch (e) { exc(e); }
      });
      const r = rest as Promise<void> | undefined;
      if (r) await r.catch(exc);
    });
  }

  private item(it: Item): Promise<void> | void {
    const k = it[0];
    if (k === "watch") return this.watchNew(it[1]);
    if (k === "msg" && X(it[1]).pvpW) return this.watchMsg(it[1], it[2], it[3]);
    if (k === "close" && X(it[1]).pvpW) { this.watchers = this.watchers.filter((w) => w.c !== it[1]); return; }
    if (k === "msg") {
      const [, c, mid, data] = it;
      const i = X(c).pvpI;
      if (i === null || i === undefined || this.c[i] !== c) return;
      return this.asSess(this.sess[i], () => this.msg(i, c, mid, data));
    }
    if (k === "close") { const i = X(it[1]).pvpI; if (i !== null && i !== undefined && this.c[i] === it[1]) this.closedSock(i); return; }
    if (k === "timeout") {
      if (!this.done && (this.c.includes(null) || !this.ps)) { this.log(`[pvp] ${this.name}: no han conectado los dos al duelo en ${ATTACH_TIMEOUT} s`); this.abort(SVR_DISCONNECT); }
      return;
    }
    if (k === "cancel") { if (!this.done && this.ps === null) { this.log(`[pvp] ${this.name} anulada: ${it[1]}`); this.abort(null); } return; }
    if (k === "clock" || k === "tick") return this.clockItem(it);
    if (k === "between") return this.betweenTimeout(it[1]);
  }

  private msg(i: number, c: Conn, mid: number, data: Uint8Array): Promise<void> | void {
    const o = 1 - i;
    if (this.needStart && NEXT_MSGS.has(mid)) {
      if (this.between) this.nextGame();
      const seen = (this.seenNext ??= [false, false]);
      if (!seen[i]) this.swapReset(i);
      seen[i] = true;
    }
    if (mid === 0x0005) return this.send(i, 0x0004, new W().u32(0).bytes());
    if (mid === 0x0003) return;
    if (mid === 0x6001) return this.send(i, 0x6007, new W().u32(1).bytes());
    if (mid === 0x6600) return;
    if ((mid === 0x6601 || mid === 0x6603) && data.length >= 4) {
      const n = Math.min(u32at(data), Math.floor((data.length - 4) / 4));
      const ids = Array.from({ length: n }, (_, k) => u32at(data, 4 + 4 * k));   // passcodes (the card wire)
      this.deck[i][mid === 0x6601 ? "main" : "extra"] = ids;
      if (mid === 0x6603) this.deckCheck(i);
      return;
    }
    if (mid === 0x600b) {
      this.prep[i] = true;
      if (this.prep.every(Boolean) && !this.prepSent) {
        this.prepSent = true;
        for (const k of [0, 1]) {
          this.send(k, 0x600c, this.preparation(k));
          const od = this.deck[1 - k];
          this.send(k, 0x6005, new W().u16(od.main.length).u16(od.extra.length).bytes());
        }
        this.log(`[pvp] ${this.name}: mazos ${this.deck[0].main.length}/${this.deck[1].main.length}, 0x600c + 0x6005 a los dos`);
      }
      return;
    }
    if (mid === 0x6013) {
      if (PVP_DUELLOG_RECORD) { const q = this.logQ; if (q && q[i].length) this.put(i, [q[i].shift()!]); return; }
      return;
    }
    if (this.deckBad && [0x6100, 0x6101, 0x6102, 0x6103, 0x6104, 0x61fe].includes(mid)) {
      if (this.needStart && this.bo3()) return this.matchGone(Math.min(...this.deckBad), "mazo bloqueado");
      return this.deckCut(i, mid);
    }
    if (mid === 0x6100 || mid === 0x6104) return this.send(i, mid);
    if (mid === 0x6101) {
      if (this.jwinner !== null) return;
      this.hand[i] = (data.length ? data[0] : 0) % 3;
      if (this.hand.includes(null)) return;
      for (const k of [0, 1]) this.send(k, 0x6101, Uint8Array.of(0, this.hand[1 - k]!));
      const r = (((this.hand[1]! - this.hand[0]!) % 3) + 3) % 3;
      this.log(`[pvp] ${this.name}: manos [${this.hand}] -> ` + (r === 0 ? "empate" : `gana ${r === 1 ? 0 : 1}`));
      if (r && this.gameNo === 1) this.jhands = [this.hand[0]!, this.hand[1]!];
      this.hand = [null, null];
      if (r) this.jwinner = r === 1 ? 0 : 1;
      return;
    }
    if (mid === 0x6102) { this.send(i, 0x6102); this.echo6102[i] = true; return this.maybe6103(); }
    if (mid === 0x6103) {
      if (i !== this.jwinner || this.first !== null) return this.log(`[pvp] ${this.name}: 0x6103 de ${i} sin ser el ganador: ignorado`);
      const v = (data.length ? data[0] : 0) & 1;
      this.firstV = v; this.first = v === 0 ? i : o;
      this.send(i, 0x6103, Uint8Array.of(v));
      if (this.watchers.length) this.watchPump();
      return this.maybe6103();
    }
    if (mid === 0x61fe) {
      this.placeManual[i] = !!(data.length && data[0]);
      if (this.ps && !this.needStart && this.ps.views[i]) this.ps.views[i]!.place_manual = this.placeManual[i];
      if (this.ready[i]) return this.log(`[pvp] ${this.name}: 0x61fe repetido de ${i} (${Buffer.from(data).toString("hex")}): ignorado`);
      this.ready[i] = true;
      if (this.ready.every(Boolean) && (this.ps === null || this.needStart)) return this.start();
      return;
    }
    if (mid === M_TEST_AUTO) {
      if (!this.hub.test) return this.log(`[pvp] 0x${mid.toString(16)} fuera de la instancia de prueba: ignorado`);
      const a = this.ps ? this.ps.auto(i) : undefined;
      if (a === false) this.badAuto++;
      return a || undefined;
    }
    if (mid === M_TEST_LOSE) {
      if (!this.hub.test) return this.log(`[pvp] 0x${mid.toString(16)} fuera de la instancia de prueba: ignorado`);
      if (this.ps && this.ps.started && !this.ps.over && !this.needStart) {
        const turns = this.ps.turn || 0;
        this.ps.end();
        this.gameEnd(o, DFM.WHY_LP, turns);
      }
      return;
    }
    if (this.ps === null || this.done || this.needStart) {
      if (!this.g.autoReply(c, mid)) this.log(`[pvp] ${this.name}: 0x${mid.toString(16).padStart(4, "0")} de ${i} sin respuesta`);
      return;
    }
    if (mid !== 0x6423) this.okAsk[i] = false;
    if (mid === 0x6423 && this.okAsk[i] && !this.ask[i]) {
      this.okAsk[i] = false;
      return this.log(`[pvp] ${this.name}: 0x6423 del jugador ${i} tras el cartel de rendición: descartado`);
    }
    if (mid === 0x6350 && DFM.isSurrender(data)) {
      const why = this.surrenderDenied();
      if (why) return this.surrenderRefuse(i, why);
      this.ask[i] = true;
      this.log(`[pvp] ${this.name}: el jugador ${i} pide rendirse (decide ${this.ps.decider}): diálogo SÍ/NO`);
      return this.put(i, DFM.surrenderConfirmMsgs());
    }
    if (mid === 0x6423 && this.ask[i]) {
      this.ask[i] = false;
      if (data.length >= 4 && u32at(data) === DFM.YES) return this.surrender(i);
      this.log(`[pvp] ${this.name}: el jugador ${i} contesta NO al diálogo de rendición: sigue el duelo`);
      return this.ps.resend(i);
    }
    if ([0x6350, 0x6351, 0x002e, 0x6423, 0x6426, 0x6432].includes(mid)) return this.ps.onClient(i, mid, data);
    if (!this.g.autoReply(c, mid)) this.log(`[pvp] ${this.name}: 0x${mid.toString(16).padStart(4, "0")} de ${i} sin respuesta`);
  }

  // ---- deck check
  private deckCheck(i: number): void {
    const dk = this.g.duel?.dk;
    if (!dk) return;
    const d = this.deck[i];
    const r = dk.review(this.sess[i], d.main, d.extra, `pvp:${this.name}`);
    if (r && r.bloquear) (this.deckBad ??= new Set()).add(i);
  }
  private deckSvr(k: number): Uint8Array { return duelsvrinfomsg(SVR_DISCONNECT, this.deckBad?.has(k) ? 0 : 1); }
  private deckCut(i: number, mid: number): void {
    const told = (this.deckTold ??= [false, false]);
    if (mid !== 0x6100 || told[i] || this.done) return;
    told[i] = true;
    this.send(i, 0x6100);
    this.send(i, 0x649b, this.deckSvr(i));
    this.log(`[pvp] ${this.name}: duelo NO empieza (mazo bloqueado): 0x649b a ${i}`);
    if ([0, 1].every((k) => told[k] || this.closed[k] || this.c[k] === null)) this.closeMatch();
  }

  private maybe6103(): void {
    if (this.first === null || this.sent6103) return;
    const lo = 1 - this.jwinner!;
    if (!this.echo6102[lo]) return;
    this.sent6103 = true;
    this.send(lo, 0x6103, Uint8Array.of(1 - this.firstV!));
    this.log(`[pvp] ${this.name}: empieza el jugador ${this.first}`);
  }

  /** 0x600c from client k: A = k, B = the other. */
  preparation(k: number): Uint8Array {
    const me = this.sess[k], ot = this.sess[1 - k];
    let w = new W().s(me.name || "Duelista", 16).s(ot.name || "Duelista", 16).u32(me.pid!).u32(ot.pid!).u32(LP_START).u32(LP_START).bytes();
    for (const s of [me, ot]) w = cat(w, this.asSess(s, () => cat(this.g.duelParts(null, 0), this.g.duelParts(null, 1))), new Uint8Array(16));
    return cat(w, COUNTRY, COUNTRY, new Uint8Array(16));
  }

  // ---- duel
  private start(): Promise<void> {
    const first = this.first ?? 0;
    const [clock, why] = this.clockCfg();
    this.needStart = false;
    this.firsts.push(first);
    this.t0 = now();
    this.ps = new PvpSession(this.g, this.c, this.deck, (w, r, t) => this.onEnd(w, r, t), this.tx as unknown as { put(m: readonly SItem[]): void }[], clock);
    this.ps.placeManual = [...this.placeManual] as [boolean, boolean];
    this.statsAttach();
    this.log(`[pvp] ${this.name}: arranca` + (this.bo3() ? ` la partida ${this.firsts.length} del match` : "") + `, empieza ${first}; ${why}`);
    return this.ps.start(first);
  }

  private statsAttach(): void {
    try {
      const cm = cardmap();
      const typeOf = (code: number) => cm.cdb_type.get(code) || cm.cdb_type.get(cm.cdb_alias.get(code) ?? 0) || 0;
      const t = new DuelTally(typeOf);
      const used = this.deck.map((d) => ({ main: [...(d.main ?? [])], extra: [...(d.extra ?? [])] }));
      const prev = this.decksUsed;
      this.decksUsed = used;
      if (prev) for (const k of [0, 1]) {
        const a = new Map<number, number>(), b = new Map<number, number>();
        for (const x of [...prev[k].main, ...prev[k].extra]) a.set(x, (a.get(x) ?? 0) + 1);
        for (const x of [...used[k].main, ...used[k].extra]) b.set(x, (b.get(x) ?? 0) + 1);
        let n = 0;
        for (const [x, v] of b) n += Math.max(0, v - (a.get(x) ?? 0));
        t.sideSwaps[k] = n;
      }
      this.ps!.stats = t;
    } catch (e) { this.log(`[EXC] ${this.name}: estadísticas del perfil: ${errStr(e)}`); }
  }

  private onEnd(winner: number | null, reason: unknown, turns: number): void { this.gameEnd(winner, DFM.whyFromOcg(reason), turns); }

  private surrenderDenied(): string | null {
    if (SURRENDER_ROOM_OPTION && this.roomSurrender === 0) return "room";
    const turn = this.ps?.turn || 0;
    const min = this.hub.test ? 0 : 10;
    if (min && turn < min) return "turn";
    return null;
  }

  private surrenderRefuse(i: number, why: string): void {
    this.log(`[pvp] ${this.name}: el jugador ${i} pide rendirse y NO se admite (${why}; turno ${this.ps?.turn}, sala ${this.roomSurrender})`);
    if (why === "turn") { this.okAsk[i] = true; this.put(i, DFM.infoDialogMsgs(DLG_SURRENDER_TURN)); }
    this.ps!.resend(i);
  }

  private surrender(i: number): void {
    const o = 1 - i;
    this.log(`[pvp] ${this.name}: se rinde el jugador ${i}`);
    this.ps!.end();
    this.surr = i;
    this.gameEnd(o, DFM.WHY_SURRENDER, 0, { [o]: SVR_SURRENDER }, SURRENDER_ENDS_MATCH);
  }

  // ---- end of a game and of the match
  private matchOver(games: number[]): [boolean, number | null] {
    const d = games.filter((x) => x === DFM.RESULT_WIN).length - games.filter((x) => x === DFM.RESULT_LOSE).length;
    if (d >= 2 || d <= -2) return [true, d > 0 ? 0 : 1];
    if (games.length >= 3) return [true, d > 0 ? 0 : d < 0 ? 1 : null];
    return [false, null];
  }

  private score(k: number): [number[], number[]] {
    const g = this.games;
    const w0 = g.filter((x) => x === DFM.RESULT_WIN).length, l0 = g.filter((x) => x === DFM.RESULT_LOSE).length, e = g.filter((x) => x === DFM.RESULT_DRAW).length;
    const me = k === 0 ? [w0, l0, e, 0] : [l0, w0, e, 0];
    return [me, [me[1], me[0], me[2], 0]];
  }

  gameEnd(winner: number | null, why: string, turns = 0, svr: Record<number, number> = {}, close = false): void {
    const wv = (k: number) => (winner === null ? null : winner === k ? 0 : 1);
    this.xpLevels();
    if (!this.bo3()) {
      for (const k of [0, 1]) this.finish(k, wv(k), why, turns, { svr: svr[k] ?? null });
      this.duellogRecord(winner, why, turns);
      return this.closeMatch();
    }
    this.games.push(DFM.resultForClient(wv(0)));
    let [over, mwin] = this.matchOver(this.games);
    if (close) [over, mwin] = [true, winner];
    this.log(`[pvp] ${this.name}: partida ${this.games.length} del match: ${winner === null ? "empate" : `gana ${winner}`} (${why})`
      + (over ? ` -> match acabado: ${mwin === null ? "empate" : `gana ${mwin}`}` : " -> sigue"));
    const fin = close ? DFM.FINISH_CLOSE : null;
    for (const k of [0, 1]) {
      const mres = !over ? null : mwin === null ? "draw" : mwin === k ? "win" : "lose";
      this.finish(k, wv(k), why, turns, { svr: svr[k] ?? null, fin, score: this.score(k), last: over, mres });
    }
    if (over) { this.duellogRecord(mwin, why, turns); return this.closeMatch(); }
    this.betweenBegin(winner);
  }

  private betweenBegin(winner: number | null): void {
    this.between = true;
    this.needStart = true;
    this.chooser = winner === null ? null : 1 - winner;
    const gen = ++this.btwGen;
    setTimeout(() => this.q(["between", gen]), MATCH_WAIT * 1000);
    this.log(`[pvp] ${this.name}: entre partidas; elige quién empieza ` + (this.chooser === null ? "(piedra-papel-tijera)" : `el jugador ${this.chooser}`));
    this.swapClock();
  }

  private swapClock(): void {
    this.swapClockOn = [false, false];
    if (SWAP_TIME <= 0 || this.roomTime === 0) return;
    const secs = Math.round(SWAP_TIME + SWAP_LEAD);
    for (const k of [0, 1]) if (this.tx[k] && !this.closed[k]) { this.send(k, 0x6461, timeup_warning(GLOBAL_CLOCK, secs, 0)); this.swapClockOn[k] = true; }
    this.log(`[pvp] ${this.name}: reloj del side deck: ${secs} s a los dos (global, corriendo)`);
  }

  private swapReset(i: number): void {
    const sc = this.swapClockOn;
    if (!sc || !sc[i]) return;
    sc[i] = false;
    this.send(i, 0x6461, timeup_warning(GLOBAL_CLOCK, 0, 1));
  }

  private nextGame(): void {
    this.between = false;
    this.gameNo++;
    this.deck = [{ main: [], extra: [] }, { main: [], extra: [] }];
    this.hand = [null, null];
    this.echo6102 = [false, false];
    this.jwinner = this.chooser;
    this.firstV = this.first = null;
    this.sent6103 = false;
    this.ready = [false, false];
    this.ask = [false, false];
    this.surr = null;
    this.seenNext = [false, false];
    this.logFase = this.logQ = null;
    this.log(`[pvp] ${this.name}: partida ${this.gameNo} del match: llegan los mazos`);
  }

  private betweenTimeout(gen: number): void {
    if (this.done || gen !== this.btwGen || !this.needStart) return;
    let late = [0, 1];
    if (!this.between) {
      late = [0, 1].filter((k) => !this.ready[k]);
      if (late.length === 2) { const seen = this.seenNext ?? [false, false]; const l2 = [0, 1].filter((k) => !seen[k]); if (l2.length) late = l2; }
    }
    if (late.length === 1) return this.matchGone(late[0], `no vuelve en ${MATCH_WAIT} s`);
    this.log(`[pvp] ${this.name}: ninguno vuelve a la partida siguiente en ${MATCH_WAIT} s: match sin resultado`);
    this.closeMatch();
  }

  private matchGone(i: number, motivo: string): void {
    const o = 1 - i;
    this.between = this.needStart = false;
    this.log(`[pvp] ${this.name}: el jugador ${i} ${motivo} entre partidas del match: gana el match ${o}`);
    this.finish(i, 1, DFM.WHY_DISCONNECT, 0, { played: false, ends: false, send: false });
    this.finish(o, 0, DFM.WHY_DISCONNECT, 0, { svr: SVR_DISCONNECT, score: this.score(o), played: false, ends: false });
    this.duellogRecord(o, DFM.WHY_DISCONNECT);
    this.closeMatch();
  }

  // ---- time limit
  private clockCfg(): [{ turn: number; resp: number; margin: number; notify: (item: unknown[]) => void } | null, string] {
    const cfg = DEFAULT_CFG as Record<string, any>;
    if (!cfg.turn_limit) return [null, "sin límite de tiempo (turn_limit apagado)"];
    if (this.roomTime === 0) return [null, "sin límite de tiempo (sala con «Límite de Tiempo» OFF)"];
    let turn = Number(cfg.turn_timer || 0);
    const gs = Number(cfg.tiempo_gunslinger || 0);
    const guns = GUNSLINGER_KINDS.includes(this.roomKind(this.sess[0])) && gs > 0;
    if (guns) turn = gs;
    const resp = Number(cfg.tiempo_respuesta || 0);
    if (turn <= 0 && resp <= 0) return [null, "sin límite de tiempo (turn_timer y tiempo_respuesta a 0)"];
    const margin = Number(cfg.tiempo_margen || 0);
    return [{ turn, resp, margin, notify: (item) => this.q(item as Item) },
      `límite de tiempo: ${turn > 0 ? `${turn} s por turno` : "turno sin límite"}${guns ? " (GUNSLINGER)" : ""}, ${resp > 0 ? `${resp} s` : "sin límite"} para contestar en el turno del rival, margen ${margin} s`];
  }

  private clockItem(it: Item): void {
    if (this.done || !this.ps) return;
    const r = this.ps.clockCheck(it[1] as number, it[0] === "clock" ? (it[2] as number) : null);
    if (!r) return;
    if (r[0] === "expired") return this.timeout(r[1]);
    const gen = it[1] as number;
    setTimeout(() => this.q(["tick", gen]), (r[1] + 0.05) * 1000);
  }

  private timeout(i: number): void {
    const o = 1 - i;
    const turns = this.ps?.turn || 0;
    this.log(`[pvp] ${this.name}: se acaba el tiempo del jugador ${i}: gana ${o}`);
    this.ps!.end();
    for (const [k, who] of [[i, 0], [o, 1]]) {
      if (PVP_SVRINFO && this.c[k] && !this.closed[k]) this.put(k, [[0x649b, duelsvrinfomsg(SVR_TIMEUP, who)], { sleep: SVRINFO_WAIT }]);
    }
    this.gameEnd(o, DFM.WHY_TIMEOUT, turns);
  }

  private closedSock(i: number): void {
    this.closed[i] = true;
    if (this.done) return;
    const o = 1 - i;
    if (this.needStart && this.bo3()) return this.matchGone(i, "se desconecta");
    if (this.deckBad && this.ps === null) {
      const told = (this.deckTold ??= [false, false]);
      told[i] = true;
      if (!told[o] && this.c[o] && !this.closed[o]) { told[o] = true; this.send(o, 0x649b, this.deckSvr(o)); }
      this.log(`[pvp] ${this.name}: el jugador ${i} se va con el duelo bloqueado por el mazo`);
      return this.closeMatch();
    }
    if (this.ps && this.ps.started && !this.ps.over) {
      this.log(`[pvp] ${this.name}: el jugador ${i} se desconecta en mitad del duelo: gana ${o}`);
      this.ps.end();
      this.gameEnd(o, DFM.WHY_DISCONNECT, 0, { [o]: SVR_DISCONNECT }, true);
    } else {
      this.log(`[pvp] ${this.name}: el jugador ${i} se desconecta antes del duelo`);
      this.abort(SVR_DISCONNECT);
    }
  }

  private abort(svr: number | null): void {
    if (this.ps) this.ps.end();
    if (svr && PVP_SVRINFO) for (const k of [0, 1]) if (this.c[k] && !this.closed[k]) this.send(k, 0x649b, this.svrinfo(svr));
    this.closeMatch();
  }

  // ---- spectators
  watchInfo(): Uint8Array {
    const out: Uint8Array[] = [];
    for (const k of [0, 1]) {
      const s = this.sess[k], d = this.deck[k];
      out.push(new W().u16(d.main.length).u16(d.extra.length).u8(0).bytes());
      const nb = [...(s.name || "Duelista")].map((ch) => (ch.charCodeAt(0) > 255 ? 0x3f : ch.charCodeAt(0))).slice(0, 15);
      out.push(Uint8Array.from([...nb, ...Array(16 - nb.length).fill(0)]));
      const parts = this.asSess(s, () => cat(this.g.duelParts(null, 0), this.g.duelParts(null, 1)));
      const p32 = new Uint8Array(32); p32.set(parts.subarray(0, 32));
      out.push(p32, new Uint8Array(16), COUNTRY);
    }
    out.push(Uint8Array.of(3));
    return cat(...out);
  }

  private watchNew(c: Conn): void {
    const w: WatchW = { c, tx: new Sender(c, this.g, this.hub.pause), i: 0, want: false, jseen: false };
    this.watchers.push(w);
    this.log(`[pvp] ${this.name}: espectador ${c.peer} (${this.watchers.length})`);
    if (WATCH_SEND_PREP) w.tx.put([[0x600c, this.preparation(0)]]);
    w.tx.put([[0x6006, this.watchInfo()]]);
    this.watchPump();
  }

  private watchMsg(c: Conn, mid: number, _data: Uint8Array): void {
    const w = this.watchers.find((x) => x.c === c);
    if (!w) return;
    if (mid === 0x0005) return w.tx.put([[0x0004, new W().u32(0).bytes()]]);
    if (mid === 0x6702) { w.want = true; return this.watchPump(); }
    if (mid === 0x6700 || mid === 0x6703 || mid === 0x0003) return;
    this.log(`[pvp] ${this.name}: espectador 0x${mid.toString(16).padStart(4, "0")} sin respuesta`);
  }

  watchPump(): void {
    if (!this.watchers.length) return;
    const ents = this.recorder ? this.recorder.entries : [];
    for (const w of [...this.watchers]) {
      if (!w.c || w.c.closed) { this.watchers.splice(this.watchers.indexOf(w), 1); continue; }
      if (!w.jseen) {
        if (this.jhands === null || this.first === null) continue;
        w.jseen = true;
        w.tx.put([[0x6701, Uint8Array.of(this.jhands[0] & 0xff, this.jhands[1] & 0xff, this.first & 0xff)]]);
        continue;
      }
      if (!w.want) continue;
      const batch: [number, Uint8Array][] = [];
      let i = w.i;
      while (i < ents.length && batch.length < WATCH_BATCH) {
        const [side, d] = ents[i++];
        if (side === 0 && !(WATCH_SIN_DECISIONES && watchOculta(d))) batch.push([0x6202, d]);
      }
      w.i = i;
      if (batch.length) { w.want = false; w.tx.put(batch); }
    }
  }

  // ---- duel record (PVP_DUELLOG_RECORD); the server's own archive (REPLAY_ARCHIVE) is not ported
  private duellogRecord(_winner: number | null, _why: string | null = null, _turns: number | null = null): void {
    if (!PVP_DUELLOG_RECORD) return;
    const when = Math.floor(now());
    try {
      const firsts = this.firsts.length ? this.firsts : [this.first as number];
      const [hands, first, avisos] = DL.replayStart(this.jhands, firsts[0]);
      const players: DL.LogPlayer[] = [0, 1].map((k) => {
        const s = this.sess[k];
        const parts = this.asSess(s, () => [this.g.duelParts(null, 0), this.g.duelParts(null, 1), new Uint8Array(16)]);
        return { pid: s.pid!, listval: s.pid!, name: s.name || "Duelista", parts, main: this.deck[k].main.length, extra: this.deck[k].extra.length,
          country: COUNTRY, hand: hands[k] };
      });
      let games = [first, 0xff, 0xff];
      let mode: number | undefined;
      if (this.bo3()) {
        games = [first, ...firsts.slice(1, 3).map((f) => (f === null || f === undefined ? 0xff : f)), 0xff, 0xff].slice(0, 3);
        mode = DL.MODE_MATCH;
      }
      const msgs = DL.messages(players, this.recorder ? [...this.recorder.entries] : [], { games, roomKind: this.roomKind(this.sess[0]), when, mode });
      this.logQ = [[...msgs], [...msgs]];
      const n = msgs.filter(([m]) => m === DL.M_COMMAND).reduce((a, [, d]) => a + d.length, 0);
      this.log(`[pvp] ${this.name}: registro de duelo: ${this.recorder ? this.recorder.entries.length : 0} comandos, ${n} B en ${msgs.length - 3} trozos 0x6011;`
        + ` piedra-papel-tijera [${hands}], empieza ${first}` + (avisos.length ? ` (${avisos.join("; ")})` : ""));
      for (const k of [0, 1]) if (this.c[k] && !this.closed[k]) this.put(k, [this.logQ[k].shift()!]);
    } catch (e) { this.log(`[EXC] ${this.name}: registro de duelo: ${errStr(e)}`); }
  }

  roomKind(s: Session): number {
    try {
      const k = this.g.roomKinds[keyPort(s.block!) - this.g.ports.roomBase];
      return k === undefined ? 12 : k;
    } catch { return 12; }
  }

  closeMatch(): void {
    this.done = true;
    this.hub.drop(this);
  }

  private svrinfo(code: number): Uint8Array { return duelsvrinfomsg(code, 1); }

  /** [LV of player 0, of 1] before the duel (read once). */
  private xpLevels(): number[] {
    if (this.xpLv) return this.xpLv;
    this.xpLv = this.sess.map((s) => {
      try { return this.asSess(s, () => { const st = this.g.loadState(); return PP.int((PP.profile(st, PP.activeSlot(st))!.rec ?? {}).lv ?? 1) || 1; }); }
      catch (e) { this.log(`[EXC] ${this.name}: LV previo: ${errStr(e)}`); return 1; }
    });
    return this.xpLv;
  }

  /** The end for client k: wv = 0 wins, 1 loses, null draw (their view). Profile + lobby + end queue. */
  finish(k: number, wv: number | null, why: string, turns = 0,
    o: { svr?: number | null; fin?: number | null; score?: [number[], number[]] | null; last?: boolean; played?: boolean; ends?: boolean; send?: boolean; mres?: string | null } = {}): void {
    const { svr = null, score = null, last = true, played = true, ends = true, send = true, mres = null } = o;
    let fin = o.fin ?? null;
    const s = this.sess[k];
    const res = DFM.resultForClient(wv);
    const on = send && this.c[k] !== null && !this.closed[k];
    const lob = on ? this.lobby(k) : null;
    let packs: number[] = [], card = "", xp: P | null = null;
    const pdu = this.asSess(s, () => {
      const st = this.g.loadState();
      const p = PP.profile(st, PP.activeSlot(st))!;
      if (played) {
        xp = this.xp(p, k, res, last, mres, turns);
        pvpRecord(this.g, p, res, turns);
      }
      if (last) [packs, card] = this.card(p, why, lob !== null, this.bo3());
      this.g.saveState(st);
      return PP.playerDataUpdate(p);
    });
    this.log(`[pvp] ${this.name}: fin para ${k} (${s.acct}): ${wv === 0 ? "gana" : wv === 1 ? "pierde" : "empate"} (${why})`
      + (last ? "" : " (partida del match)")
      + (xp ? `; puntuación ${(xp as P).delta >= 0 ? "+" : ""}${(xp as P).delta} -> ${(xp as P).score}, LV ${(xp as P).lv_old} -> ${(xp as P).lv}` : "") + (card ? `; ${card}` : ""));
    if (!on) return;
    if (lob) lob.post(DFM.M_PDU, pdu);
    if (svr && PVP_SVRINFO) this.put(k, [[0x649b, this.svrinfo(svr)], { sleep: SVRINFO_WAIT }]);
    if (ends) {
      let official = false;
      if (why === DFM.WHY_SURRENDER && SURRENDER_FIN_OFICIAL) { official = true; if (fin === null) fin = DFM.FINISH_SURRENDER; }
      this.put(k, DFM.endDuelMsgs(wv, why, { finish: fin === null ? DFM.FINISH_NORMAL : fin, score, officialSurrender: official }));
    } else if (score) this.put(k, [[DFM.M_DUELSCORE, DFM.duelscore(score[0], score[1])]]);
    if (last && lob) { const pk = packs; this.put(k, [{ fn: () => lob.post(DFM.M_CARDPACKLIST, DFM.cardpacklistNotice(pk)) }]); }
    void PVP_DUELLOG_FINISH;
  }

  private xp(p: P, k: number, res: number, last: boolean, mres: string | null, turns = 0): P | null {
    try {
      const surr = this.surr;
      const lp = this.ps?.lastLp;
      let lpLeft = 0;
      try { lpLeft = lp ? Math.max(0, PP.int(lp[k])) : 0; } catch { lpLeft = 0; }
      if (!Number.isFinite(lpLeft)) lpLeft = 0;
      const tally = this.ps?.stats as DuelTally | null | undefined;
      const stats = tally ? tally.forPlayer(k) : null;
      PP.applyDuelStats(p, stats, lpLeft, surr === null ? null : surr === k ? "me" : "opp");
      const name = res === DFM.RESULT_WIN ? "win" : res === DFM.RESULT_LOSE ? "lose" : "draw";
      PP.mpReward(this.g, p, name, turns, { opp: this.sess[1 - k]?.acct ?? null, secs: this.t0 ? now() - this.t0 : 0 });
      const lv = this.xpLevels();
      return PP.pvpXp(p, lv[1 - k], name, this.bo3(), mres, last, lv[k]);
    } catch (e) { this.log(`[EXC] ${this.name}: puntuación: ${errStr(e)}`); return null; }
  }

  private card(p: P, why: string, canPick: boolean, match: boolean): [number[], string] {
    try {
      if (why === DFM.WHY_ABORT) return [[], ""];
      if (canPick) {
        const e = PP.pvpCardOffer(this.g, p, match);
        return e ? [[...e.packs], `carta pendiente (${e.n}): elige entre ${e.packs.length} sobres`] : [[], ""];
      }
      const e = PP.pvpCardEntry(this.g, match);
      if (!e) return [[], ""];
      const [pk, cards] = PP.pvpCardGrant(this.g, p, e, (pack, n) => this.g.lpCards(pack, n));
      return [[], `sin conexión: carta directa al baúl (sobre ${pk}: ${cards})`];
    } catch (ex) { this.log(`[EXC] ${this.name}: carta tras el PvP: ${errStr(ex)}`); return [[], ""]; }
  }
}
