// Tournaments (py research/torneos/proposal.py, TO): the 0x51xx bracket screen, EVENTINFO and an elimination
// tournament the admin starts. No tournament runs by default (py TOUR None).
import type { Conn } from "../net/conn.ts";
import { W } from "../net/proto.ts";
import type { Game } from "./game.ts";
import type { Session } from "./hub.ts";
import * as PP from "./persist.ts";

const M = { EVENTINFO: 0x5000, INFO: 0x5100, START: 0x5101, END: 0x5102, LOTTERY: 0x5103, LOTRESULT: 0x5104, PHASE: 0x5105, ROUND: 0x5106,
  REQENTRY: 0x5107, ENTRY_START: 0x5108, ENTRY_DATA: 0x5109, ENTRY_END: 0x5110, LIST: 0x5111, ENDRESULT: 0x5112, TIMER: 0x5113,
  PCOUNTER: 0x5114, STATUS: 0x5115, CHKDUELSTART: 0x5120, AUTODUELSTART: 0x43a0, DUELSERVER: 0x4306, NPCINFOLIST_REQ: 0x4230 };
const ST = { NONE: 0, STANDBY: 1, ENTRY: 4, MATCHING: 5, OPEN: 6, PHASE: 7, ROUND: 8, END: 9 };
const SUB_ROUND = 1, SUB_QUARTER = 2, SUB_SEMI = 3, SUB_FINAL = 4;
const PAGE_PLAYERS = 8, LIST_CHUNKS = 4, MAX_ENTRIES = 0x200, ENTRY_PER_MSG = 24, DUEL_MODE = 3;
const TOURNAMENT_ON = true, EVENTS_ON = true, EVENT_DELAY = 1.5;
const TOUR_NAME = "CHAMPIONSHIP", TOUR_DAY = 1, MAX_PLAYERS = 8, MIN_PLAYERS = 2, ENTRY_SECONDS = 120, STEP_SECONDS = 15;
const AUTO_ENTRY = true, BIT80_ALIVE = true, NOSHOW_ADVANCE_SEAT0 = true, REPAIR_ON_DRAW = true, PRIZE_TP = 0, SEND_PAUSE = 0.03;
const EMPTY: Uint8Array = new Uint8Array(0);
const cat = (...a: Uint8Array[]) => Buffer.concat(a);
const fix = (text: string, n: number) => { const raw = Buffer.from([...String(text || "")].map((ch) => (ch.charCodeAt(0) > 255 ? "?" : ch)).join(""), "latin1").subarray(0, n - 1); const o = new Uint8Array(n); o.set(raw); return o; };

type Seat = { pid: number; name: string; wins: number; alive: boolean; playing: boolean; sess: Session | null };
type Rec = { a: number; b: number; done: boolean; winner: number | "draw" | null; m: unknown };
type Msgs = [number, Uint8Array<ArrayBufferLike>][];

class Tour {
  state = ST.ENTRY; phase = 1; round = 0;
  seats: Seat[] = [];
  matches = new Map<unknown, Rec>();
  deadline: number | null;
  champion: number | null = null; runnerUp: number | null = null;
  history: unknown[] = [];
  constructor(readonly serial: number, readonly day: number, readonly name: string, readonly maxPlayers: number, now: number, readonly tm: Tournaments) {
    this.deadline = now + ENTRY_SECONDS;
  }
  byPid(pid: number) { return this.seats.find((s) => s.pid === pid) ?? null; }
  alive() { return this.seats.filter((s) => s.alive); }
  totalRounds() { const n = Math.max(this.seats.length, 2); let r = 0; while (1 << r < n) r++; return r; }
  subtitle() {
    if (this.state < ST.ROUND) return 0;
    const n = this.alive().length;
    return n <= 2 ? SUB_FINAL : n <= 4 ? SUB_SEMI : n <= 8 ? SUB_QUARTER : SUB_ROUND;
  }
  secondsLeft(now: number) { return this.deadline === null ? 0 : Math.max(0, Math.floor(this.deadline - now)); }
  audience() { return [...this.tm.watch.keys()].filter((p) => !this.byPid(p)).length; }
  entryStatus(s: Seat) { return s.playing ? 1 : 0; }
}

export class Tournaments {
  watch = new Map<number, Conn>();
  tour: Tour | null = null;
  currentEvent: [number, number, number] | null = null;
  private clockT: ReturnType<typeof setInterval> | null = null;
  readonly handlers: Map<number, (c: Conn, msgId: number) => boolean>;

  constructor(private g: Game) {
    const h = (c: Conn, m: number) => this.hTour(c, m);
    this.handlers = new Map([[M.STATUS, h], [M.TIMER, h], [M.REQENTRY, h], [M.INFO, h], [M.PCOUNTER, h], [M.LIST, h], [M.ENDRESULT, h],
      [M.NPCINFOLIST_REQ, (c) => this.hNpclist(c)]]);
  }

  private now() { return this.g.clock.time(); }
  private send(c: Conn | null | undefined, mid: number, data = EMPTY) { if (c && !c.closed) c.post(mid, data, SEND_PAUSE); }

  // ---- messages
  private infoMsg(t: Tour | null) {
    if (!t) return cat(new W().u32(0).bytes(), new Uint8Array(100), new W().u32(0).u32(0).u32(0).u32(0).u32(0).u32(0).bytes());
    return cat(new W().u32(t.serial).bytes(), fix(t.name, 100), new W().u32(t.day).u32(0).u32(0).u32(t.maxPlayers).u32(t.totalRounds()).u32(0).bytes());
  }
  private statusMsg(t: Tour | null) {
    if (!t) return new W().u32(0).u32(0).u32(ST.STANDBY).u32(0).u32(0).u32(0).u8(0).bytes();
    return new W().u32(t.serial).u32(t.day).u32(t.state).u32(t.phase).u32(t.phase).u32(t.round).u8(t.subtitle()).bytes();
  }
  private timerMsg(t: Tour | null) { return new W().u32(t ? t.secondsLeft(this.now()) : 0).bytes(); }
  private pcounterMsg(t: Tour | null) {
    if (!t) return new W().u32(0).u32(0).u32(0).u32(0).u32(0).bytes();
    return new W().u32(t.serial).u32(t.day).u32(t.alive().length).u32(t.seats.length).u32(t.audience()).bytes();
  }
  private entryMsgs(t: Tour | null): Msgs {
    const rows = (t ? t.seats : []).slice(0, MAX_ENTRIES).map((s) => cat(new W().u32(s.pid).bytes(), fix(s.name, 16), Uint8Array.of(s.wins & 0xff, t!.entryStatus(s)), new Uint8Array(20)));
    const out: Msgs = [[M.ENTRY_START, new W().u32(rows.length).u32(0).u32(0).bytes()]];
    for (let i = 0; i < rows.length; i += ENTRY_PER_MSG) out.push([M.ENTRY_DATA, cat(...rows.slice(i, i + ENTRY_PER_MSG))]);
    out.push([M.ENTRY_END, EMPTY]);
    return out;
  }
  private pageBytes(t: Tour | null, page: number) {
    const seats = t ? t.seats.slice(page * PAGE_PLAYERS, (page + 1) * PAGE_PLAYERS) : [];
    const w = new W().u8(seats.length).u8(0);
    for (let i = 0; i < PAGE_PLAYERS; i++) {
      const s = seats[i];
      if (s) w.u32(s.pid).u16((s.wins & 0x3f) | (s.playing ? 0x40 : 0) | (BIT80_ALIVE && s.alive ? 0x80 : 0));
      else w.u32(0).u16(0);
    }
    return w.bytes();
  }
  private listMsgs(t: Tour | null): Msgs {
    const pages = t ? Math.ceil(t.seats.length / PAGE_PLAYERS) : 0;
    const phase = t ? t.phase : 0;
    const out: Msgs = [];
    for (let chunk = 0; chunk < LIST_CHUNKS; chunk++) {
      const body: Uint8Array[] = [];
      for (let p = chunk * 20; p < Math.min(pages, chunk * 20 + 20); p++) body.push(this.pageBytes(t, p));
      out.push([M.LIST, cat(new W().u32(0).u32(0).u32(0).u32(phase).u8(chunk).bytes(), ...body)]);
    }
    return out;
  }
  private endresultMsg(t: Tour) {
    const champ = t.champion ? t.byPid(t.champion) : null, second = t.runnerUp ? t.byPid(t.runnerUp) : null;
    return cat(new W().u32(t.serial).bytes(), fix(t.name, 100), new W().u32(t.day).u32(t.seats.length).u32(t.totalRounds()).bytes(),
      fix(champ ? champ.name : "", 16), new W().u32(0).bytes(), fix(second ? second.name : "", 16));
  }
  private autoduelstart(pid: number, name: string, parts: Uint8Array) {
    const p = new Uint8Array(16); p.set(parts.subarray(0, 16));
    return cat(new W().u32(pid).s(name.slice(0, 15), 16).u8(0).u16(0).u16(0).bytes(), p, Uint8Array.of(DUEL_MODE));
  }

  private toAll(msgs: Msgs) { for (const c of this.watch.values()) for (const [m, d] of msgs) this.send(c, m, d); }
  private toPid(pid: number, msgs: Msgs) {
    const c = this.watch.get(pid) ?? this.g.hub.byPid(pid)?.lobby ?? null;
    for (const [m, d] of msgs) this.send(c, m, d);
  }
  private refreshAll(t: Tour) {
    this.toAll([[M.STATUS, this.statusMsg(t)], [M.TIMER, this.timerMsg(t)], [M.PCOUNTER, this.pcounterMsg(t)], ...this.entryMsgs(t), ...this.listMsgs(t)]);
  }

  // ---- the tournament (started from the admin)
  get running(): boolean { return !!this.tour && this.tour.state !== ST.END; }
  startTournament(serial = 1, day = TOUR_DAY, name = TOUR_NAME, maxPlayers = MAX_PLAYERS): Tour {
    const t = (this.tour = new Tour(serial, day, name, maxPlayers, this.now(), this));
    if (AUTO_ENTRY) for (const [pid, c] of this.watch) this.enter(t, c.sess as Session | null, pid);
    this.toAll([[M.START, EMPTY], [M.INFO, this.infoMsg(t)]]);
    this.refreshAll(t);
    this.clockT ??= setInterval(() => this.g.world.run(() => this.tick()), 1000); // py AUTO_CLOCK
    return t;
  }

  private enter(t: Tour | null, s: Session | null, pid: number) {
    if (!t || t.state !== ST.ENTRY || t.byPid(pid) || t.seats.length >= t.maxPlayers) return false;
    t.seats.push({ pid, name: s?.name || `Duelista ${pid}`, wins: 0, alive: true, playing: false, sess: s });
    return true;
  }

  tick(now = this.now()) {
    const t = this.tour;
    if (!t) return null;
    if (t.deadline === null || now < t.deadline) return t.state;
    if (t.state === ST.ENTRY) this.draw(t, now);
    else if ([ST.MATCHING, ST.OPEN, ST.PHASE].includes(t.state)) this.nextRound(t, now);
    else if (t.state === ST.ROUND && !this.pending(t)) this.nextRound(t, now);
    return t.state;
  }

  private draw(t: Tour, now: number) {
    if (t.seats.length < MIN_PLAYERS) { this.finish(t, now, true); return; }
    t.state = ST.MATCHING; t.phase = 2; t.deadline = now + STEP_SECONDS;
    this.toAll([[M.LOTTERY, new W().u32(t.phase).u8(1).bytes()]]);
    for (const pid of this.watch.keys()) this.toPid(pid, [[M.LOTRESULT, Uint8Array.of(t.byPid(pid) ? 1 : 2)]]);
    this.toAll([[M.LOTTERY, new W().u32(t.phase).u8(0).bytes()]]);
    t.phase = 3;
    this.refreshAll(t);
  }

  private pending(t: Tour) { return [...t.matches.values()].some((m) => !m.done); }

  private nextRound(t: Tour, now: number) {
    const alive = t.alive();
    if (t.round > 0) this.toAll([[M.ROUND, new W().u32(t.phase).u32(t.round).u8(0).bytes()]]);
    if (alive.length <= 1) { this.finish(t, now); return; }
    if (t.state !== ST.ROUND) { t.state = ST.PHASE; t.phase = 4; this.toAll([[M.PHASE, new W().u32(t.phase).u8(1).bytes()]]); }
    t.round++;
    t.state = ST.ROUND; t.deadline = null;
    this.toAll([[M.ROUND, new W().u32(t.phase).u32(t.round).u8(1).bytes()]]);
    const pairs: Seat[][] = [];
    for (let i = 0; i < alive.length; i += 2) pairs.push(alive.slice(i, i + 2));
    for (const p of pairs) if (p.length === 1) { p[0].wins++; t.history.push([t.round, p[0].pid, null, "bye"]); }
    this.refreshAll(t);
    for (const p of pairs) if (p.length === 2) this.pair(t, p[0], p[1]);
  }

  private pair(t: Tour, a: Seat, b: Seat) {
    const sa = this.g.hub.byPid(a.pid) ?? a.sess, sb = this.g.hub.byPid(b.pid) ?? b.sess;
    const rec: Rec = { a: a.pid, b: b.pid, done: false, winner: null, m: null };
    a.playing = b.playing = true;
    let key: unknown;
    if (this.g.pvp && sa && sb) {
      const m = this.g.pvp.reserve(sa, sb) as unknown;
      rec.m = m;
      this.g.pvpHookMatch?.(m, (winnerPid) => { if (rec.winner === null || winnerPid !== "draw") rec.winner = winnerPid; },
        (present) => this.report(rec, rec.winner, present));
      key = m;
    } else key = `none|${a.pid}|${b.pid}|${t.round}`;
    t.matches.set(key, rec);
    const port = this.g.ports.duel + this.g.cfg.portOffset;
    for (const [me, ot, so] of [[a, b, sb], [b, a, sa]] as [Seat, Seat, Session | null][])
      this.toPid(me.pid, [[M.AUTODUELSTART, this.autoduelstart(ot.pid, ot.name, this.parts(so))], [M.DUELSERVER, new W().s(this.g.cfg.publicIp, 15).u16(port).bytes()]]);
    this.refreshAll(t);
    return rec;
  }

  private parts(s: Session | null) {
    if (!s) return new Uint8Array(16);
    try { return this.g.withCtx(s, () => this.g.duelParts(null)); } catch { return new Uint8Array(16); }
  }

  report(rec: Rec, winner0: number | "draw" | null, present: number[] = []) {
    const t = this.tour;
    if (!t || rec.done) return;
    let winner = winner0;
    const a = t.byPid(rec.a)!, b = t.byPid(rec.b)!;
    if (winner === "draw" && REPAIR_ON_DRAW) { rec.done = true; this.pair(t, a, b); return; }
    if (winner === null || winner === "draw") {
      const here = present.filter((p) => p === rec.a || p === rec.b);
      if (here.length === 1) { winner = here[0]; this.toPid(winner, [[M.CHKDUELSTART, Uint8Array.of(1)]]); }
      else if (NOSHOW_ADVANCE_SEAT0) winner = t.seats.indexOf(a) < t.seats.indexOf(b) ? rec.a : rec.b;
    }
    rec.done = true; rec.winner = winner;
    const [w, l] = winner === rec.a ? [a, b] : [b, a];
    w.wins++; l.alive = false; a.playing = b.playing = false;
    t.history.push([t.round, w.pid, l.pid, "ok"]);
    if (t.alive().length === 1) t.runnerUp = l.pid;
    if (!this.pending(t)) t.deadline = this.now() + STEP_SECONDS;
    this.refreshAll(t);
  }

  private finish(t: Tour, _now: number, cancelled = false) {
    const alive = t.alive();
    if (t.round > 0) this.toAll([[M.PHASE, new W().u32(t.phase).u8(0).bytes()]]);
    t.state = ST.END; t.deadline = null;
    if (!cancelled && alive.length === 1) { t.champion = alive[0].pid; this.award(t); this.toAll([[M.ENDRESULT, this.endresultMsg(t)]]); }
    this.toAll([[M.END, EMPTY]]);
    this.refreshAll(t);
  }

  private award(t: Tour) {
    if (!PRIZE_TP) return;
    const s = t.byPid(t.champion!)?.sess;
    if (!s) return;
    this.g.withCtx(s, () => {
      const st = this.g.loadState();
      const r = (PP.profile(st, s.slot ?? PP.activeSlot(st))!.rec ??= {});
      r.tp = PP.int(r.tp ?? 0) + PRIZE_TP;
      this.g.saveState(st);
    });
  }

  pushEvent(state: number | null = null, world = 6, serial = 1, conns: Conn[] | null = null) {
    if (state !== null) this.currentEvent = [serial, world, state];
    if (!this.currentEvent) return 0;
    const data = new W().u32(this.currentEvent[0]).u32(this.currentEvent[1]).u32(this.currentEvent[2]).bytes();
    conns ??= [...this.g.hub.sessions.values()].map((s) => s.lobby).filter((c): c is Conn => !!c);
    for (const c of conns) this.send(c, M.EVENTINFO, data);
    return conns.length;
  }

  private hNpclist(c: Conn) {
    const ev = this.currentEvent;
    if (EVENTS_ON && ev) setTimeout(() => this.g.world.run(() => this.send(c, M.EVENTINFO, new W().u32(ev[0]).u32(ev[1]).u32(ev[2]).bytes())), EVENT_DELAY * 1000);
    return false;
  }

  private watchConn(c: Conn) {
    const s = c.sess as Session | null;
    if (!s || s.pid === null) return null;
    this.watch.set(s.pid, c);
    if (AUTO_ENTRY) this.enter(this.tour, s, s.pid);
    return s.pid;
  }

  private hTour(c: Conn, msgId: number): boolean {
    if (!TOURNAMENT_ON) return false;
    const t = this.tour;
    if (msgId === M.STATUS) { this.watchConn(c); c.send(M.STATUS, this.statusMsg(t)); }
    else if (msgId === M.TIMER) c.send(M.TIMER, this.timerMsg(t));
    else if (msgId === M.REQENTRY) { this.watchConn(c); for (const [m, d] of this.entryMsgs(t)) c.send(m, d); }
    else if (msgId === M.INFO) c.send(M.INFO, this.infoMsg(t));
    else if (msgId === M.PCOUNTER) c.send(M.PCOUNTER, this.pcounterMsg(t));
    else if (msgId === M.LIST) for (const [m, d] of this.listMsgs(t)) c.send(m, d);
    else if (msgId === M.ENDRESULT) { if (t && t.champion) c.send(M.ENDRESULT, this.endresultMsg(t)); else return false; }
    else return false;
    return true;
  }

  onClose(c: Conn) { for (const [pid, cc] of [...this.watch]) if (cc === c) this.watch.delete(pid); }
}
