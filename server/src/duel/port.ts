// The duel port 5760: py yo2srv/duelo/puerto.py (duel_reply, duel_reply_base, duel_task, ocg_session, npc_deck_id,
// ocg_finish, preparation_result) and yo2srv/duelo/sesion_duelo.py (DUEL, duel_state, df_for, df_end_mark,
// duel_rival, duel_begin, on_conn_closed's duel part, _abandon_duel, on_conn_accepted).
//
// duel_reply's chain, as py runs it: NW.on_duel_msg (NPC spectators) -> PVP.route (a reserved PvP takes the whole
// connection) -> duelfin's surrender dialogs (0x6350 / 0x6423) -> the deck check (DK) -> the ocg session (0x6601/0x6603
// decks, 0x600b, 0x61fe and the client's plays as duel tasks) -> DF h_0003 -> LS.duel_reply_v2 -> duel_reply_base.
import type { Conn } from "../net/conn.ts";
import { W } from "../net/proto.ts";
import type { Ctx, Game } from "../game/game.ts";
import type { Session } from "../game/hub.ts";
import * as PP from "../game/persist.ts";
import { myName, myPid } from "../game/accounts.ts";
import { duelReplyV2, newDuelCfg, type DuelCfg } from "./lockstep.ts";
import { makeDf, whyFromOcg, type DF, type DuelEnd } from "./duelfin.ts";
import { deckNpc, npcRule } from "./npcRules.ts";
import { brainDb, cardmap, duelCore, npcDeck } from "./data.ts";
import { TYPE_FIELD } from "./brain/cards.ts";
import { OcgSession } from "./ocgSession.ts";
import { DeckCheck } from "./deckCheck.ts";
import { DuelReserva } from "./reserva.ts";

export const OCG_CLIENT_MSGS = new Set([0x6350, 0x6351, 0x002e, 0x6423, 0x6426, 0x6432]);
type Out = Uint8Array | [number, Uint8Array];

/** py duel_q + _duel_worker: one FIFO of tasks per duel connection (B49). A task's synchronous parts run as World
 *  handlers; its sleeps (NPC_THINK, the end drain) don't block other connections. stop() = q.put(None). */
export class DuelQueue {
  private chain: Promise<void> = Promise.resolve();
  stopped = false;
  constructor(private log: (s: string) => void, private tag: () => string) {}
  put(fn: () => Promise<void>): void {
    if (this.stopped) return;
    this.chain = this.chain.then(async () => {
      if (this.stopped) return;
      try { await fn(); } catch (e) { this.log(`[EXC] duelo ${this.tag()}: ${(e as Error)?.stack?.replace(/\n/g, " | ") ?? e}`); }
    });
  }
  stop(): void { this.stopped = true; }
  idle(): Promise<void> { return this.chain; }
}

/** s.duel of py V08: the session's NPC rival, its lobby connection and its own duelfin. */
export interface DuelState { rival: number; lobby: Conn | null; df: DF | null }

/** Per-connection fields py hangs on the Conn (c.ext here). */
export interface DuelExt {
  duelStarted?: boolean; ocg?: OcgSession | null; duelQ?: DuelQueue; duelSt?: Record<string, any>; dfEnd?: DuelEnd | null;
  deckBlock?: { t: number; told: boolean } | null; pvp?: { on(c: Conn, m: number, p: number, d: Uint8Array): void; onClose(c: Conn): void; done: boolean; name: string } | null;
  pvpI?: number | null; pvpW?: boolean; bookedFail?: string;
}
export const X = (c: Conn): DuelExt => c.ext as DuelExt;

export interface DuelConfig { pause: number; test: boolean; reserva: string; deckCheck: string | null }

export class DuelPort {
  readonly ls: DuelCfg;
  /** py DUEL (the last NPC challenge, for connections without a session) */
  readonly DUEL: { rival: number } = { rival: 0 };
  /** py srv.DF: the global duelfin (lobby = LOBBY_ROOM["c"]) */
  readonly df: DF;
  readonly dk: DeckCheck;
  readonly dt: DuelReserva;

  constructor(readonly g: Game, readonly cfg: DuelConfig) {
    this.ls = newDuelCfg(cfg.test);
    this.df = makeDf(g, () => this.liveConn(g.lobbyRoom.c), true);
    this.dk = new DeckCheck(g, cfg.deckCheck ?? (cfg.test ? "off" : "avisar"));
    this.dt = new DuelReserva(g, cfg.reserva);
  }

  private log(s: string) { this.g.log(s); }

  /** py red/servidor live_conn */
  liveConn(c: Conn | null | undefined): Conn | null {
    if (!c) return null;
    if (!c.stale()) return c;
    const cur = this.g.world.currentConn(c);
    return cur && !cur.closed ? cur : null;
  }

  // ---- sesion_duelo.py
  duelState(s0?: Ctx): DuelState | null {
    const s = s0 ?? this.g.curSess();
    if (!s || s === this.g.NO_SESSION) return null;
    const d = ((s as Session).ext.duel ??= { rival: 0, lobby: null, df: null }) as DuelState;
    if (d.df === null) d.df = makeDf(this.g, () => this.liveConn(d.lobby), true);
    return d;
  }

  dfFor(c: Conn): DF {
    const d = c.sess ? this.duelState(c.sess as Session) : null;
    if (d && d.df && d.lobby) return d.df;
    return this.df;
  }

  dfEndMark(c: Conn, df: DF | null, msgId: number): void {
    if (df && !("dfEnd" in c.ext) && msgId !== 0x0005) X(c).dfEnd = df.sess.end;
  }

  duelRival(s?: Ctx): number {
    const d = this.duelState(s);
    return d && d.lobby ? d.rival : this.DUEL.rival;
  }

  /** py duel_begin (0x4288 to an NPC, or an NPC challenge accepted). */
  duelBegin(c: Conn, rival: number, mode = 0): void {
    this.DUEL.rival = rival;
    this.g.lobbyRoom.c = c;
    const d = c.sess ? this.duelState(c.sess as Session) : null;
    if (d) { d.rival = rival; d.lobby = c; }
    const df = d?.df ?? this.df;
    df.h_autoduelstart(rival, mode);
  }

  /** py on_conn_closed (around the hub/lobby part, which server.ts already does: base). */
  onConnClosed(c: Conn, why: string, base: () => void): void {
    const x = X(c);
    if (why !== "0x0003") {
      c.closed = true;
      x.duelQ?.stop();
      try { this.dt.dropConn(c); } catch (e) { this.log(`[reserva] drop_conn: ${e}`); }
    }
    base();
    if (c.port !== this.g.ports.duel || why === "0x0003") return;
    if (x.pvp) { try { x.pvp.onClose(c); } catch (e) { this.log(`[pvp] on_close: ${e}`); } return; }
    if (x.bookedFail) return;
    const s = x.ocg ?? null;
    if (this.g.world.currentConn(c) !== c) return;
    if (s && s.over) return;
    this.log(`[duelo] el socket de duelo se cierra con el duelo ${s ? s.id : "-"} sin acabar`);
    s?.abandon();
    const df = this.dfFor(c);
    if (df && df.sess.end === (x.dfEnd ?? null)) {
      const old = this.g.ctx;
      this.g.ctx = (c.sess as Ctx) ?? null;
      try { df.h_disconnect(c); } catch (e) { this.log(`[duelfin] h_disconnect: ${e}`); }
      finally { this.g.ctx = old; }
    }
  }

  /** py on_conn_accepted: a new duel connection abandons the old one's duel. */
  onConnAccepted(c: Conn, old: Conn | undefined): void {
    if (!old || old === c || c.port !== this.g.ports.duel) return;
    const o = X(old).ocg;
    if (o && !o.over) { this.log(`[duelo] nueva conexión de duelo con el duelo ${o.id} sin acabar: se abandona`); o.abandon(); }
    X(old).duelQ?.stop();
  }

  // ---- puerto.py
  preparationResult(): Uint8Array {
    const g = this.g;
    const st = g.loadState();
    const me = myName(g, st);
    const rival = this.duelRival();
    const rv = g.npcs.find((n) => n[0] === rival)?.[1] ?? `Rival ${rival}`;
    const w = new W().s(me, 16).s(rv, 16).u32(myPid(g, st)).u32(rival).u32(8000).u32(8000).bytes();
    const z = new Uint8Array(16), esp = Uint8Array.from([0x45, 0x53, 0x50, 0]);
    return cat(w, g.duelParts(null, 0), g.duelParts(null, 1), z, g.duelParts(rival, 0), g.duelParts(rival, 1), z, esp, esp, z);
  }

  duelReplyBase(c: Conn, msgId: number, param: number, data: Uint8Array): void {
    const g = this.g;
    if (msgId === 0x3001 || msgId === 0x3003) return g.gameReply(c, msgId, param, data);
    if (msgId === 0x0005) return c.send(0x0004, new W().u32(0).bytes());
    if (msgId === 0x6600 || msgId === 0x6601 || msgId === 0x6603) {
      if (g.ph) (g.ph.h_duel_deck as unknown as (c: Conn, m: number, d: Uint8Array) => void)(c, msgId, data);
      return;
    }
    if (msgId === 0x6100 || msgId === 0x6102 || msgId === 0x6103 || msgId === 0x6104) {
      c.send(msgId, msgId === 0x6103 ? data.subarray(0, 1) : new Uint8Array(0));
      if (msgId === 0x6102) c.send(0x6103, Uint8Array.of((this.DUEL as { first?: number }).first ?? 1));
      return;
    }
    if (msgId === 0x61fe) return c.send(0x6104);
    if (msgId === 0x6101) { const mine = data.length ? data[0] : 0; return c.send(0x6101, Uint8Array.of(0, (mine + 2) % 3)); }
    if (msgId === 0x600b) {
      c.send(0x600c, this.preparationResult());
      const n = (this.ls.npc_deck ?? []).length;
      return c.send(0x6005, new W().u16(n || 40).u16(0).bytes());
    }
    if (msgId === 0x6001) return c.send(0x6007, new W().u32(1).bytes());
    if (!g.autoReply(c, msgId)) this.log(`[srv:${c.port}] sin respuesta para 0x${msgId.toString(16).padStart(4, "0")}`);
  }

  /** py duel_reply */
  duelReply(c: Conn, msgId: number, param: number, data: Uint8Array): void {
    const g = this.g, x = X(c);
    if (g.nw && (g.nw as unknown as { onDuelMsg(c: Conn, m: number, d: Uint8Array): boolean }).onDuelMsg(c, msgId, data)) return;
    const pvp = g.pvp as { route(c: Conn, m: number): { on(c: Conn, m: number, p: number, d: Uint8Array): void } | null } | null;
    if (pvp) { const m = pvp.route(c, msgId); if (m) return m.on(c, msgId, param, data); }
    const DF = this.dfFor(c);
    this.dfEndMark(c, DF, msgId);
    if (msgId === 0x61fe) {
      const s0 = this.ocgSession(c);
      if (s0) { s0.placeManual = !!(data.length && data[0]); if (s0.d) s0.d.place_manual = s0.placeManual; }
      if (x.duelStarted) { this.log(`[duelo] 0x61fe repetido (${hx(data)}): ignorado`); return; }
      x.duelStarted = true;
    }
    const s = this.ocgSession(c);
    if (msgId === 0x61fe && s) this.dk.npcStart(c, s);
    if (DF && msgId === 0x6350) {
      const r = DF.h_6350(c, data);
      if (r === true && s) s.surrender();
      if (r) return;
    }
    if (DF && msgId === 0x6423) {
      const r = DF.h_6423(c, data);
      if (r === "end" && s) s.surrender();
      else if (r === "no" && s && s.d) s.out.put(s.d.resend());
      if (r) return;
    }
    if (x.deckBlock && this.dk.npcGate(c, msgId, data)) return;
    if (s) {
      if (msgId === 0x6601 || msgId === 0x6603) {
        s.clientDeck(msgId, data);
        if (msgId === 0x6603) this.dk.npcDeck(c, s);
      } else if (msgId === 0x600b) {
        c.send(0x600c, this.preparationResult());
        const [nMain, nExtra] = s.npcSizes();
        return c.send(0x6005, new W().u16(nMain).u16(nExtra).bytes());
      } else if (msgId === 0x61fe) {
        const first = (x.duelSt ?? {}).first ?? 0;
        this.duelTask(c, () => s.start(first));
        return;
      } else if (OCG_CLIENT_MSGS.has(msgId)) {
        this.duelTask(c, () => s.onClient(msgId, data));
        return;
      }
    }
    if (DF && msgId === 0x0003) { DF.h_0003(c, data); return; }
    duelReplyV2({ cfg: this.ls, log: (t) => this.log(t), base: (...a) => this.duelReplyBase(...a), burst: (cc, m) => this.burst(cc, m) },
      c, msgId, param, data);
  }

  /** py LS._burst: 0.5 s later, burst_pause apart. */
  private burst(c: Conn, msgs: Out[]): void {
    setTimeout(() => void this.g.world.run(() => {
      for (const m of msgs) {
        const [mid, d] = m instanceof Uint8Array ? [0x6202, m] : m;
        c.send(mid, d, this.ls.burst_pause);
      }
    }), 500);
  }

  duelTask(c: Conn, fn: () => Promise<void>): void {
    const x = X(c);
    (x.duelQ ??= new DuelQueue((s) => this.log(s), () => String(x.ocg?.id ?? "?"))).put(fn);
  }

  /** The connection's ocg session (made with the first message that has a session), or null without the engine. */
  ocgSession(c: Conn): OcgSession | null {
    if (!duelCore()) return null;
    const x = X(c);
    let s = x.ocg ?? null;
    if (s === null && this.g.curSess() === this.g.NO_SESSION) return null;
    if (s === null) {
      s = x.ocg = new OcgSession(this.g, c, (cc, w, r, t) => this.ocgFinish(cc, w, r, t),
        this.npcDeckId(this.duelRival((c.sess as Ctx) ?? undefined)), this.cfg.pause);
    }
    return s;
  }

  /** The NPC deck (passcodes, main + extra) of the DE user's current NPC duel, for the web client's art prefetch
   *  (GET /api/de/prefetch/duel); null without one. Never a player's deck: s.ext.duel only ever holds an NPC rival.
   *  `fields`: its Field Spells. The duel's base field is the client's own; only a Field Spell changes the background
   *  (FIELD_CHANGE 0x14 -> FUN_00704100), so those are the backgrounds this duel can show.
   *  ponytail: after the duel it keeps answering with that NPC until the next challenge, harmless for a prefetch. */
  prefetchFor(userId: string): { npc: number; cards: number[]; fields: number[]; ids: "passcode" } | null {
    const acct = this.g.store.accountOfUser(userId);
    const s = acct ? this.g.hub.sessions.get(acct) : undefined;
    const d = s?.ext.duel as DuelState | undefined;
    if (!s || !d?.lobby || !(d.rival > 0)) return null;
    const deck = npcDeck(this.g.withCtx(s, () => this.npcDeckId(d.rival)));
    if (!deck) return null;
    const cards = [...new Set([...deck.main, ...deck.extra])];
    const fields = cards.filter((c) => ((brainDb().cards.get(c)?.type ?? 0) & TYPE_FIELD) !== 0);
    return { npc: d.rival, cards, fields, ids: "passcode" };   // ids: lazyfs tells them from the older YO2 ids
  }

  /** NPC_RULES_2008 famous_decks: the level-1 famous NPC plays its current level's recipe (NPCBIN b3). */
  npcDeckId(rival: number): number {
    if (!npcRule("famous_decks") || !(rival >= 1 && rival <= 98)) return rival;
    try {
      const st = this.g.loadState();
      const p = PP.profile(st, PP.activeSlot(st), false) ?? {};
      const nid = deckNpc(rival, (i) => PP.npcbinGet(p, i));
      if (nid !== rival) this.log(`[npcreglas] NPC ${rival}: juega con la receta ${10000 + nid}`);
      return nid;
    } catch (e) { this.log(`[npcreglas] deck_npc: ${e}`); return rival; }
  }

  ocgFinish(c: Conn, winner: number | null, reason: unknown, turns = 0): void {
    const df = this.dfFor(c);
    if (!df) { this.log("[ocg] fin de duelo sin research/duelfin: el cliente se quedará en el tablero"); return; }
    df.finish(c, winner, whyFromOcg(reason), turns);
  }
}

const hx = (b: Uint8Array) => Buffer.from(b).toString("hex");
function cat(...a: Uint8Array[]): Uint8Array {
  const o = new Uint8Array(a.reduce((n, x) => n + x.length, 0));
  let i = 0;
  for (const x of a) { o.set(x, i); i += x.length; }
  return o;
}
