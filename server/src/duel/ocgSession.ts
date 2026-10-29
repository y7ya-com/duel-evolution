// py ocg_duel.py: the duel with real rules. OcgSession = a duel against an NPC (duelcore + the translator + the NPC
// brain), PvpSession = two humans in one duelcore duel (two translator views, the second mirrored), Sender = the
// paced send queue of a duel connection.
//
// py runs each in a thread that blocks: the duel worker sleeps NPC_THINK before each visible NPC decision and waits for
// the Sender to drain before the end (B29). Here those are async steps of the connection's duel queue (port.ts
// DuelQueue): every synchronous part runs inside World.run (one handler at a time) with g.ctx = the connection's
// session, and the sleeps happen between them, so other connections keep being served. duelcore itself is the
// in-process DuelCore (synchronous): its events go through a per-duel queue (CoreQ) read with wait(), as py reads the
// Node process.
import type { Conn } from "../net/conn.ts";
import type { Ctx, Game } from "../game/game.ts";
import type { DuelCore, Json } from "./engine/core.ts";
import { PY_DUEL_RULE } from "./engine/core.ts";
import { YO2Duel, type Cmd, type Msg } from "./translator/translator.ts";
import { DEFAULT_CFG } from "./translator/consts.ts";
import { mirror, mirror_state, unmirror_response, is_end } from "./translator/mirror.ts";
import { timeup_warning } from "./translator/lockstep.ts";
import { loadNpcProfile, NpcBrain } from "./brain/index.ts";
import { NpcAi, cardInfo, tierFor, type LoggedCmd } from "./ai/index.ts";
import { brainDb, cardmap, duelCore, npcDeck, NPC_PROFILES, toCodes, type Deck } from "./data.ts";

export const NPC_THINK = 0.4;          // s before each visible NPC decision (py 0.8; the Sender still paces what the client sees)
export const MAX_NPC_DECISIONS = 3000;  // anti-loop cap per duel
const CORE_ERROR_AUTO = 1;              // B03
const END_DRAIN = 20.0;                 // B29: s at most waiting for the Sender before the end
const USE_BRAIN = true;
const STOP_EVENTS = new Set(["select", "end", "error"]);
export const PVP_SUM_MAX = 40;

export class DuelCoreError extends Error {}
const sleep = (s: number) => new Promise<void>((r) => setTimeout(r, s * 1000));
const now = () => performance.now() / 1000;
const errStr = (e: unknown) => (e instanceof Error ? `${e.name}(${JSON.stringify(e.message)})` : String(e));

/** Runs fn as the World's next handler, with g.ctx = ctx (py: the duel worker's CTX.sess). */
export function step<T>(g: Game, ctx: Ctx, fn: () => T): Promise<T> {
  return new Promise<T>((res, rej) => {
    void g.world.run(() => { g.ctx = ctx; try { res(fn()); } catch (e) { rej(e); } });
  });
}

/** The engine seen like py's duelcore.py client: per-duel event queues read with wait() up to a select/end/error. */
export class CoreQ {
  private qs = new Map<string, Json[]>();
  /** Commands sent to a duel since its `new`, for the duels that asked (the NPC AI's forks replay them). */
  private logs = new Map<string, LoggedCmd[]>();
  constructor(readonly dc: DuelCore) {}
  private feed(evs: Json[]) {
    for (const ev of evs) {
      if (ev.id === undefined || ev.id === null || ["ready", "pong", "cardinfo", "list"].includes(String(ev.ev))) continue;
      const k = JSON.stringify(ev.id);
      if (!this.qs.has(k)) this.qs.set(k, []);
      this.qs.get(k)!.push(ev);
    }
  }
  new(id: string | number, decks: { main: number[]; extra: number[] }[], o: Parameters<DuelCore["new"]>[2]) { this.feed(this.dc.new(id, decks, o)); }
  record(id: string | number): LoggedCmd[] { const l: LoggedCmd[] = []; this.logs.set(JSON.stringify(id), l); return l; }
  respond(id: string | number, response: Json, player?: number) { this.logs.get(JSON.stringify(id))?.push({ r: response, p: player }); this.feed(this.dc.respond(id, response, player)); }
  auto(id: string | number) { this.logs.get(JSON.stringify(id))?.push({}); this.feed(this.dc.auto(id)); }
  end(id: string | number) { this.feed(this.dc.end(id)); this.qs.delete(JSON.stringify(id)); this.logs.delete(JSON.stringify(id)); }
  wait(id: string | number): Json[] {
    const q = this.qs.get(JSON.stringify(id)) ?? [];
    const i = q.findIndex((e) => STOP_EVENTS.has(String(e.ev)));
    if (i < 0) throw new DuelCoreError(`duelo ${id}: sin select/end (¿cuelgue?)`);
    if (q[i].ev === "end") this.logs.delete(JSON.stringify(id));
    return q.splice(0, i + 1);
  }
  query(id: string | number): Json {
    const ev = this.dc.query(id);
    if (ev.ev === "error") throw new DuelCoreError(String(ev.error));
    return ev;
  }
}

let CQ: CoreQ | null = null;
/** py ocg_duel.core(): the single engine (created at boot). */
export function core(): CoreQ {
  const dc = duelCore();
  if (!dc) throw new DuelCoreError("duelcore no ha arrancado");
  if (!CQ || CQ.dc !== dc) CQ = new CoreQ(dc);
  return CQ;
}

/** What a Sender queues: a message (a bare Uint8Array is a 0x6202), a function to run in order with the queue (py
 *  (None, fn)) or a pause after the previous message (py (None, lambda: time.sleep(s))). */
export type SItem = Msg | Uint8Array | { fn: () => void } | { sleep: number };

/** py ocg_duel.Sender: the duel connection's paced queue. Messages go into the Conn's own queue (same order, same
 *  pause); functions run once everything queued before them is out; a sleep holds everything after it (later puts
 *  included) until what came before is out and the time has passed (a real wait, not a send pause: Conn caps those). */
export class Sender {
  dead = false;
  private held: Promise<void> | null = null;
  private buf: SItem[] = [];
  constructor(readonly c: Conn, readonly g: Game, readonly pause: number) {}

  put(msgs: readonly SItem[]): void {
    if (this.held) { this.buf.push(...msgs); return; }
    for (let i = 0; i < msgs.length; i++) {
      const m = msgs[i];
      if (m instanceof Uint8Array || Array.isArray(m)) {
        const [mid, data] = m instanceof Uint8Array ? [0x6202, m] : m;
        this.c.send(mid, data, this.pause);
      } else if ("fn" in m) {
        const fn = m.fn;
        const ctx = this.g.ctx;
        void this.c.flushed().then(() => this.g.world.run(() => {
          this.g.ctx = ctx;
          try { fn(); } catch (e) { this.g.log(`[ocg] Sender: función en cola: ${errStr(e)}`); }
        }));
      } else {
        this.buf.push(...msgs.slice(i + 1));
        const ctx = this.g.ctx;
        this.held = this.c.flushed().then(() => sleep(m.sleep)).then(() => this.g.world.run(() => {
          this.held = null;
          const b = this.buf;
          this.buf = [];
          const old = this.g.ctx;
          this.g.ctx = ctx;
          try { this.put(b); } finally { this.g.ctx = old; }
        }));
        return;
      }
    }
  }

  /** B29: true once everything queued so far is out; false after END_DRAIN s. */
  drain(timeout = END_DRAIN): Promise<boolean> {
    let t: ReturnType<typeof setTimeout> | undefined;
    const done = (async () => { while (this.held) await this.held; await this.c.flushed(); return true; })();
    return Promise.race([done, new Promise<boolean>((r) => { t = setTimeout(() => r(false), timeout * 1000); })])
      .finally(() => clearTimeout(t));
  }
}

const isEnd = (m: Msg) => is_end(m);

// ================================================================================ NPC duel
export type Finish = (c: Conn, winner: number | null, reason: unknown, turns: number) => void;

export class OcgSession {
  static nextId = Math.floor(Date.now() / 1000) % 1000000000;
  readonly id: number;
  readonly out: Sender;
  player: Deck = { main: [], extra: [] };
  npc: Deck | null = null;
  d: YO2Duel | null = null;
  over = false;
  ended = false;
  /** The NPC player: the NPC AI, or the py-parity brain with NPC_AI=py (parity runs). */
  brain: { observe(ev: Json): void; choose(sel: Json): unknown } | null = null;
  npcDecisions = 0;
  coreErrors = 0;
  turn = 0;
  placeManual = false;
  private dc: CoreQ | null = null;
  private think: Json | null = null;
  private endReq: [number | null, unknown, number] | null = null;

  constructor(readonly g: Game, readonly c: Conn, public finish: Finish, readonly npcId: number, pause: number) {
    this.id = OcgSession.nextId++;
    this.out = new Sender(c, g, pause);
  }

  private log(s: string) { this.g.log(s); }
  private ctx(): Ctx { return (this.c.sess as Ctx) ?? this.g.NO_SESSION; }
  private core(): CoreQ { return (this.dc ??= core()); }

  // ---- decks
  clientDeck(msgId: number, data: Uint8Array): void {
    if (data.length < 4) return;
    const dv = new DataView(data.buffer, data.byteOffset, data.byteLength);
    const n = dv.getUint32(0);
    if (data.length < 4 + 2 * n) throw new RangeError(`unpack requires a buffer of ${2 * n} bytes`);
    const ids = Array.from({ length: n }, (_, i) => dv.getUint16(4 + 2 * i));
    if (msgId === 0x6601) this.player.main = ids;
    else if (msgId === 0x6603) this.player.extra = ids;
  }

  /** (main, extra) of the NPC's deck for 0x6005: its official deck or a copy of the player's. */
  npcSizes(): [number, number] {
    this.npc = npcDeck(this.npcId) ?? { main: this.player.main.slice(), extra: this.player.extra.slice() };
    return [this.npc.main.length, this.npc.extra.length];
  }

  // ---- start (duel task)
  async start(first: number): Promise<void> {
    const ok = await step(this.g, this.ctx(), () => {
      try { this.startSync(first); return true; } catch (e) { this.fatal(e); return false; }
    });
    await this.flushEnd();
    if (ok) await this.pump();
  }

  private startSync(first: number): void {
    if (this.npc === null) this.npcSizes();
    const decks = [{ main: toCodes(this.player.main), extra: toCodes(this.player.extra) },
      { main: toCodes(this.npc!.main), extra: toCodes(this.npc!.extra) }];
    const place_order = this.g.cfg.placeOrder;
    const d = (this.d = new YO2Duel(decks, { first, cardmap: cardmap(), cfg: { place_order }, log: (s) => this.log(s), rng: this.g.rng }));
    d.place_manual = !!this.placeManual;
    d.query = () => this.core().query(this.id);
    this.out.put(d.start());
    const seed = this.g.rng.randrange(1 << 30);
    const dc = this.core();
    const rule = PY_DUEL_RULE;
    const autoChain = !d.cfg.chain_none_prompt;
    if (USE_BRAIN) {
      const o = { first: first as 0 | 1, seed, shuffle: true, brain: "python", rule, auto_chain: autoChain, place_order };
      if (this.g.cfg.npcAi === "py") this.brain = new NpcBrain(loadNpcProfile(this.npcId, NPC_PROFILES), 1, seed, brainDb());
      else {
        const log = dc.record(this.id), engine = dc.dc, id = this.id;
        this.brain = new NpcAi({ npcId: this.npcId, seat: 1, seed, cards: cardInfo(engine.cardDB, brainDb()), tier: tierFor(this.npcId, NPC_PROFILES),
          spy: this.g.cfg.npcAiSpy, link: () => ({ dc: engine, decks, opts: o, log }), peek: () => engine.query(id) });
      }
      dc.new(this.id, decks, o);
    } else dc.new(this.id, decks, { first: first as 0 | 1, seed, shuffle: true, rule, auto_chain: autoChain, place_order });
    this.log(`[ocg] duelo ${this.id}: NPC ${this.npcId}, empieza ${first}, regla ${rule}, mazos `
      + `${decks[0].main.length}+${decks[0].extra.length} / ${decks[1].main.length}+${decks[1].extra.length}`);
  }

  // ---- end
  /** py _end: marks the duel over; the drain and duelfin's finish run in flushEnd (the duel task awaits them). */
  private end(winner: number | null, reason: unknown, turns = 0): void {
    this.ended = true;
    this.over = true;
    this.endReq = [winner, reason, turns];
  }

  private async flushEnd(): Promise<void> {
    const e = this.endReq;
    if (!e) return;
    this.endReq = null;
    if (!(await this.out.drain())) this.log(`[ocg] duelo ${this.id}: la cola de envío no se ha vaciado (conexión cerrada o más de ${END_DRAIN} s): el fin sale igual`);
    await step(this.g, this.ctx(), () => {
      try { this.finish(this.c, e[0], e[1], e[2]); }
      catch (err) { this.log(`[ERROR] [ocg] duelo ${this.id}: ya estaba acabado (${errStr(err)})`); }
    });
  }

  private fatal(e: unknown): void {
    const dead = false;
    this.log(`[ERROR] [ocg] duelo ${this.id}: fallo del duelo (${errStr(e)}): ${this.ended || this.over ? "ya estaba acabado" : "se cierra sin resultado"}`
      + (e instanceof Error && e.stack ? ` | ${e.stack.replace(/\n/g, " | ")}` : ""));
    if (this.ended || this.over) return;
    this.over = true;
    if (this.d) { this.d.query = null; this.d.finished = true; }
    if (this.dc && !dead) { try { this.dc.end(this.id); } catch { /* py: pass */ } }
    this.end(null, "error", this.turn);
  }

  // ---- the event loop until the player is needed
  async pump(): Promise<void> {
    for (;;) {
      const r = await step(this.g, this.ctx(), () => {
        try { return this.pumpSome(); } catch (e) { this.fatal(e); return "stop" as const; }
      });
      await this.flushEnd();
      if (r !== "think") return;
      await sleep(NPC_THINK);
    }
  }

  private npcDecide(last: Json): void {
    const dc = this.core();
    if (last.retry) dc.auto(this.id);
    else {
      const r = this.brain!.choose(last);
      if (r === null) dc.auto(this.id);
      else dc.respond(this.id, r as Json, 1);
    }
  }

  private pumpSome(): "stop" | "think" {
    if (this.think) {
      const last = this.think;
      this.think = null;
      if (this.over) return "stop";
      this.npcDecide(last);
    }
    const d = this.d!;
    while (!this.over) {
      const evs = this.core().wait(this.id);
      const last = evs[evs.length - 1];
      if (last.ev !== "error") this.coreErrors = 0;
      if (Number.isInteger(last.turn)) this.turn = last.turn as number;
      if (this.brain) for (const e of evs) if (e.ev === "msg") this.brain.observe(e);
      if (last.ev === "select" && last.player === 1 && last.type === "SELECT_CHAIN" && !last.selects && !last.forced && !last.retry) {
        this.out.put(d.feed_many(evs.slice(0, -1)));
        this.core().respond(this.id, { type: "SELECT_CHAIN", index: null }, 1);
        continue;
      }
      if (last.ev === "select" && last.player === 1) {
        this.out.put(d.feed_many(evs.slice(0, -1)));
        this.npcDecisions++;
        if (this.npcDecisions > MAX_NPC_DECISIONS) {
          this.log("[ocg] la NPC entra en bucle: se acaba el duelo (gana el jugador)");
          this.core().end(this.id);
          this.end(0, "loop", this.turn);
          return "stop";
        }
        if (last.type === "SELECT_IDLECMD" || last.type === "SELECT_BATTLECMD") { this.think = last; return "think"; }
        this.npcDecide(last);
        continue;
      }
      if (last.ev === "end") {
        d.query = null;
        this.out.put(d.feed_many(evs.slice(0, -1)).filter((m) => !isEnd(m)));
        d.finished = true;
        this.over = true;
        const winner = last.winner as number | null | undefined;
        this.log(`[ocg] fin: ganador ${winner}, motivo ${last.reason}, turnos ${last.turns}`);
        if (last.reason === "error") this.log(`[ERROR] [ocg] duelo ${this.id} cerrado por error de duelcore: ${last.error}`);
        this.end(winner === 0 || winner === 1 ? winner : null, last.reason || 0, (last.turns as number) || 0);
        return "stop";
      }
      this.out.put(d.feed_many(evs));
      if (last.ev === "select" && (last.player ?? 0) === 0) {
        try { this.out.put(d.sync_stats(this.core().query(this.id))); } catch (e) { this.log(`[ocg] sync_stats: ${errStr(e)}`); }
      }
      if (last.ev === "error") {
        this.coreErrors++;
        this.log(`[ocg] error de duelcore (duelo ${this.id}, ${this.coreErrors}.º seguido): ${last.error}`);
        if (this.coreErrors > CORE_ERROR_AUTO) throw new DuelCoreError(`${this.coreErrors} errores seguidos de duelcore: ${last.error}`);
        this.core().auto(this.id);
        continue;
      }
      if (d.needs_auto()) { this.cmd(d.auto_response()); continue; }
      return "stop";
    }
    return "stop";
  }

  private cmd(cmd: Cmd | null): void {
    if (cmd === null) throw new TypeError("'NoneType' object has no attribute 'get'");
    if (cmd.cmd === "auto") this.core().auto(this.id);
    else this.core().respond(this.id, cmd.response);
  }

  // ---- the client's plays (duel task)
  async onClient(msgId: number, data: Uint8Array): Promise<void> {
    const go = await step(this.g, this.ctx(), () => {
      const d = this.d;
      if (d === null || this.over) return false;
      let cmd: Cmd | null, back: Msg[];
      try { [cmd, back] = d.on_client(msgId, data); }
      catch (e) {
        this.log(`[EXC] [ocg] duelo ${this.id}: traductor con 0x${msgId.toString(16).padStart(4, "0")}: ${errStr(e)}`);
        try { this.out.put(d.resend()); } catch (e2) { this.log(`[ocg] duelo ${this.id}: no se puede volver a pedir la jugada: ${errStr(e2)}`); }
        return false;
      }
      this.out.put(back);
      if (!cmd) return false;
      try { this.cmd(cmd); } catch (e) { this.fatal(e); return false; }
      return true;
    });
    await this.flushEnd();
    if (go) await this.pump();
  }

  /** The end is sent by duelfin (h_6350/h_6423). */
  surrender(): void {
    this.over = true;
    this.ended = true;
    try { if (this.dc) this.dc.end(this.id); } catch { /* py: pass */ }
  }

  /** py _abandon_duel: over, and the duel closed in duelcore. */
  abandon(): void {
    if (this.over) return;
    this.over = true;
    try { this.core().end(this.id); this.log(`[duelo] duelo ${this.id} cerrado en duelcore`); }
    catch (e) { this.log(`[duelo] cerrar el duelo ${this.id} en duelcore: ${errStr(e)}`); }
  }
}

// ================================================================================ PvP
export const ritualSumOk = (): boolean => !!DEFAULT_CFG.ritual_sum;

interface Clk { turn: number; resp: number; margin: number; notify: ((item: unknown[]) => void) | null; tp: number | null;
  left: [number, number]; rleft: [number, number]; run: { p: number; gen: number; t0: number | null; pool: "left" | "rleft" } | null; gen: number }
export interface ClockCfg { turn: number; resp: number; margin: number; notify: ((item: unknown[]) => void) | null }

/** py PvpSession: one duelcore duel between two clients (not thread-safe: PvpMatch drives it from its own queue). */
export class PvpSession {
  static next = Math.floor(Date.now() / 1000) % 1000000000;
  readonly id: string;
  clk: Clk | null;
  placeManual: [boolean, boolean] = [false, false];
  stats: { feedMany(evs: Json[]): void } | null = null;
  views: [YO2Duel | null, YO2Duel | null] = [null, null];
  decider: number | null = null;
  over = false;
  started = false;
  ended = false;
  coreErrors = 0;
  turn = 0;
  lastLp: number[] | null = null;
  private sumAutos = 0;
  private dc: CoreQ | null = null;

  constructor(readonly g: Game, readonly conns: (Conn | null)[], readonly decks: Deck[],
    readonly finish: (winner: number | null, reason: unknown, turns: number) => void, readonly out: { put(m: readonly SItem[]): void }[], clock: ClockCfg | null) {
    this.id = `pvp${PvpSession.next++}`;
    this.clk = clock ? { ...clock, tp: null, left: [clock.turn, clock.turn], rleft: [clock.resp, clock.resp], run: null, gen: 0 } : null;
  }

  private log(s: string) { this.g.log(s); }
  private core(): CoreQ { return (this.dc ??= core()); }

  private fatal(e: unknown): void {
    this.log(`[ERROR] [pvp] ${this.id}: fallo del duelo (${errStr(e)}): ${this.ended ? "ya estaba acabado" : "se cierra sin resultado"}`
      + (e instanceof Error && e.stack ? ` | ${e.stack.replace(/\n/g, " | ")}` : ""));
    if (this.ended) return;
    this.ended = true;
    this.over = true;
    this.decider = null;
    for (const v of this.views) if (v) { v.query = null; v.finished = true; }
    if (this.dc) { try { this.dc.end(this.id); } catch { /* pass */ } }
    try { this.finish(null, "error", this.turn); }
    catch (e2) { this.log(`[ERROR] [pvp] ${this.id}: el fin por error también falla: ${errStr(e2)}`); }
  }

  evFor(i: number, evs: Json[]): Json[] { return i === 0 ? evs : evs.map((e) => mirror(e)); }

  start(first: number): void {
    if (this.started) return;
    this.started = true;
    try { this.startSync(first); } catch (e) { this.fatal(e); }
  }

  private startSync(first: number): void {
    const codes = this.decks.map((d) => ({ main: toCodes(d.main ?? []), extra: toCodes(d.extra ?? []) }));
    const cfg: Record<string, unknown> = { npc_phrases: false, place_order: this.g.cfg.placeOrder };
    if (this.clk) cfg.turn_timer = 0;
    const mk = (a: number, b: number, f: number) => new YO2Duel([codes[a], codes[b]], { first: f, cardmap: cardmap(), cfg, log: (s) => this.log(s), rng: this.g.rng });
    this.views = [mk(0, 1, first), mk(1, 0, 1 - first)];
    for (const i of [0, 1]) this.views[i]!.place_manual = !!this.placeManual[i];
    this.views[0]!.query = () => this.core().query(this.id);
    this.views[1]!.query = () => mirror_state(this.core().query(this.id));
    for (const i of [0, 1]) this.out[i].put(this.views[i]!.start());
    const seed = this.g.rng.randrange(1 << 30);
    const rule = PY_DUEL_RULE;
    this.core().new(this.id, codes, { first: first as 0 | 1, seed, shuffle: true, bot: [false, false], rule,
      auto_chain: !this.views[0]!.cfg.chain_none_prompt, place_order: this.g.cfg.placeOrder });
    this.log(`[pvp] duelo ${this.id}: empieza ${first}, regla ${rule}, mazos ${codes[0].main.length}+${codes[0].extra.length}`
      + ` / ${codes[1].main.length}+${codes[1].extra.length}`);
    this.pump();
  }

  pump(): void {
    try { this.pumpSync(); } catch (e) { this.fatal(e); }
  }

  private pumpSync(): void {
    while (!this.over) {
      const evs = this.core().wait(this.id);
      const last = evs[evs.length - 1];
      const kind = last.ev;
      if (this.stats) {
        try { this.stats.feedMany(evs); } catch (e) { this.log(`[pvp] ${this.id}: estadísticas del perfil: ${errStr(e)}`); this.stats = null; }
      }
      if (this.clk) for (const e of evs) if (e.ev === "msg" && e.type === "NEW_TURN" && (e.player === 0 || e.player === 1)) this.clkTurn(e.player as number);
      if (kind !== "error") this.coreErrors = 0;
      if (Number.isInteger(last.turn)) this.turn = last.turn as number;
      if (kind === "end") {
        for (const i of [0, 1]) {
          const v = this.views[i]!;
          v.query = null;
          this.out[i].put(v.feed_many(this.evFor(i, evs.slice(0, -1))).filter((m) => !isEnd(m)));
          v.finished = true;
        }
        this.over = true;
        this.ended = true;
        this.decider = null;
        const w = last.winner;
        this.log(`[pvp] fin ${this.id}: ganador ${w}, motivo ${last.reason}, turnos ${last.turns}`);
        this.lastLp = (last.lp as number[]) ?? null;
        this.finish(w === 0 || w === 1 ? w : null, last.reason || 0, (last.turns as number) || 0);
        return;
      }
      if (kind === "select") {
        let p = (last.player ?? 0) as number;
        p = p === 0 || p === 1 ? p : 0;
        const o = 1 - p;
        if (last.type === "SELECT_SUM" && !ritualSumOk()) {
          for (const i of [0, 1]) this.out[i].put(this.views[i]!.feed_many(this.evFor(i, evs.slice(0, -1))));
          this.sumAutos++;
          if (this.sumAutos === 1 || last.retry === false) this.log(`[pvp] ${this.id}: SELECT_SUM del jugador ${p}: decide bot.ts`);
          if (this.sumAutos > PVP_SUM_MAX) {
            this.log(`[pvp] ${this.id}: SELECT_SUM sin respuesta válida tras ${PVP_SUM_MAX} intentos: se corta el duelo (empate)`);
            this.end();
            this.finish(null, "sum", (last.turn as number) || 0);
            return;
          }
          this.core().auto(this.id);
          continue;
        }
        this.sumAutos = 0;
        this.out[o].put(this.views[o]!.feed_many(this.evFor(o, evs.slice(0, -1))));
        const v = this.views[p]!;
        this.out[p].put(v.feed_many(this.evFor(p, evs)));
        try { this.out[p].put(v.sync_stats(v.query!())); } catch (e) { this.log(`[pvp] sync_stats: ${errStr(e)}`); }
        if (v.needs_auto()) { this.cmd(p, v.auto_response()); continue; }
        this.decider = p;
        if (this.clk) this.clkBegin(p);
        return;
      }
      for (const i of [0, 1]) this.out[i].put(this.views[i]!.feed_many(this.evFor(i, evs)));
      if (kind === "error") {
        this.coreErrors++;
        this.log(`[pvp] error de duelcore en ${this.id} (${this.coreErrors}.º seguido): ${last.error}`);
        if (this.coreErrors > CORE_ERROR_AUTO) throw new DuelCoreError(`${this.coreErrors} errores seguidos de duelcore: ${last.error}`);
        this.decider = null;
        this.core().auto(this.id);
        continue;
      }
      return;
    }
  }

  private cmd(p: number, cmd: Cmd | null): void {
    if (this.clk) this.clkStop();
    this.decider = null;
    if (cmd === null || cmd.cmd === "auto") this.core().auto(this.id);
    else this.core().respond(this.id, unmirror_response(p, cmd.response), p);
  }

  /** A play of client i (absolute): reaches duelcore only if the pending decision is theirs. */
  onClient(i: number, msgId: number, data: Uint8Array): void {
    const v = this.views[i];
    if (this.over || !v) return;
    let cmd: Cmd | null, back: Msg[];
    try { [cmd, back] = v.on_client(msgId, data); }
    catch (e) {
      this.log(`[EXC] [pvp] ${this.id}: traductor de ${i} con 0x${msgId.toString(16).padStart(4, "0")}: ${errStr(e)}`);
      try { this.out[i].put(v.resend()); } catch (e2) { this.log(`[pvp] ${this.id}: no se puede volver a pedir la jugada a ${i}: ${errStr(e2)}`); }
      return;
    }
    this.out[i].put(back);
    if (cmd) {
      if (this.decider !== i) { this.log(`[pvp] ${this.id}: respuesta de ${i} sin ser su decisión (decide ${this.decider}): ignorada`); return; }
      try { this.cmd(i, cmd); } catch (e) { this.fatal(e); return; }
      this.pump();
    }
  }

  resend(i: number): void {
    const v = this.views[i];
    if (v && !this.over) this.out[i].put(v.resend());
  }

  /** Test instance (YO2_PVP_TEST): bot.ts decides i's pending decision. false if it is not theirs. */
  auto(i: number): boolean {
    const v = this.views[i];
    if (this.over || this.decider !== i || !v) return false;
    v.waiting = null; v.state = null; v.viewing = false;
    try { this.cmd(i, { cmd: "auto" }); } catch (e) { this.fatal(e); return true; }
    this.pump();
    return true;
  }

  /** Cuts the duel in duelcore (surrender / disconnection: PvpMatch sends the end). */
  end(): void {
    if (this.over) return;
    this.over = true;
    this.ended = true;
    this.decider = null;
    if (this.clk) this.clk.run = null;
    for (const v of this.views) if (v) v.query = null;
    if (this.started && this.dc) { try { this.dc.end(this.id); } catch { /* pass */ } }
  }

  // ---- time limit (py TIEMPO.md «Implementado»)
  private clkTurn(p: number): void {
    const k = this.clk!;
    k.tp = p;
    k.left[p] = k.turn;
    k.rleft[1 - p] = k.resp;
  }
  private clkPool(p: number): "left" | "rleft" { return this.clk!.tp !== null && this.clk!.tp !== p ? "rleft" : "left"; }
  clockLeft(p: number): number | null {
    const k = this.clk;
    if (!k) return null;
    let left = k[this.clkPool(p)][p];
    const r = k.run;
    if (r && r.p === p && r.t0 !== null) left -= now() - r.t0;
    return Math.max(0, left);
  }
  private clkBegin(p: number): void {
    const k = this.clk!;
    const pool = this.clkPool(p);
    k.run = null;
    if ((pool === "left" ? k.turn : k.resp) <= 0) return;
    k.gen++;
    const gen = k.gen;
    k.run = { p, gen, t0: null, pool };
    this.clkShow(p);
    const notify = k.notify;
    if (!notify) { k.run.t0 = now(); return; }
    this.out[p].put([{ fn: () => notify(["clock", gen, now()]) }]);
  }
  private clkShow(p: number): void {
    const k = this.clk!, o = 1 - p;
    const sec = (x: number) => Math.max(0, pyRoundInt(x));
    const mine = sec(this.clockLeft(p)!);
    if (k.tp === null || k.tp === p) {
      this.out[p].put([[0x6461, timeup_warning(0, mine, 0)]]);
      this.out[o].put([[0x6461, timeup_warning(1, mine, 0)]]);
    } else {
      const tl = sec(k.left[o]);
      this.out[p].put([[0x6461, timeup_warning(1, tl, 1)], [0x6461, timeup_warning(0, mine, 0)]]);
      this.out[o].put([[0x6461, timeup_warning(0, tl, 1)], [0x6461, timeup_warning(1, mine, 0)]]);
    }
  }
  private clkStop(): void {
    const k = this.clk!;
    const r = k.run;
    k.run = null;
    if (!r || r.t0 === null) return;
    k[r.pool][r.p] = Math.max(0, k[r.pool][r.p] - (now() - r.t0));
  }
  /** ["expired", p] | ["wait", s] | null */
  clockCheck(gen: number, t0: number | null = null): ["expired" | "wait", number] | null {
    const k = this.clk;
    if (!k || this.over) return null;
    const r = k.run;
    if (!r || r.gen !== gen) return null;
    if (t0 !== null && r.t0 === null) r.t0 = t0;
    if (r.t0 === null) return null;
    const rest = k[r.pool][r.p] + k.margin - (now() - r.t0);
    return rest <= 0 ? ["expired", r.p] : ["wait", rest];
  }
}

/** py int(round(x)) (banker's rounding) */
function pyRoundInt(x: number): number {
  const f = Math.floor(x), diff = x - f;
  if (diff > 0.5) return f + 1;
  if (diff < 0.5) return f;
  return f % 2 === 0 ? f : f + 1;
}
