// Card trade between two players (py research/intercambio/proposal.py, TP): the 0x7000 envelope.
import type { Conn } from "../net/conn.ts";
import { W } from "../net/proto.ts";
import type { Game } from "./game.ts";
import type { Session } from "./hub.ts";
import * as PP from "./persist.ts";
import { SANCTION_TRADE } from "./lobby.ts";
import { boundOf } from "./starter.ts";
import { pushCosmeticOwnership, spareCopies, swapCosmetics, tradeItem, tradeSpares, TRADE_COSMETIC_LINES } from "./cosmetics.ts";
import { cosmeticUnits, type CosmeticLine } from "./trade-units.ts";

const SUB = { TRADESTART: 0x7101, REQTRADE: 0x7102, OFFERREPLY: 0x7105, CANCELREQ: 0x7108, USEREXIT: 0x7112, ADDCARD: 0x7113,
  DELETECARD: 0x7114, SETSTATUS: 0x7117, LASTCONFIRM: 0x7119, ARRIVE: 0x7122, CLEAR: 0x7128, READY: 0x7132 };
const M = { REQTRADERESULT: 0x7103, TRADEOFFER: 0x7104, OFFERREPLY: 0x7105, CANCELNOTICE: 0x7109, USEREXIT: 0x7112, ADDCARD: 0x7113,
  DELETECARD: 0x7114, MOVEOTHER: 0x7116, SETSTATUS: 0x7117, ALLREADY: 0x7118, LASTCONFIRMRESULT: 0x7120, TRADEEND: 0x7121,
  ARRIVE: 0x7122, TRUNKSTART: 0x7125, TRUNK: 0x7126, TRUNKEND: 0x7127, LIMITSTART: 0x7129, LIMIT: 0x7130, LIMITEND: 0x7131,
  STARTRESULT: 0x7133, CHANGESTATUS: 0x7134 };
const REQ_FAIL = -493, MAX_OFFER = 10, CONFIRM_YES = 1, CONFIRM_NO = 2, RESULT_DONE = 3, RESULT_BACK = 2;
const DECLINE_VALUE = 1, SEND_PAUSE = 0.03;
/** A swap never leaves either side with fewer cards than a deck needs (the owner's rule, 2026-10-30: below 40 the
 *  client keeps the player in Edit Deck); the trunk is the whole collection, decks only point into it. */
export const TRADE_MIN_CARDS = 40;
const CANCEL_TEXT = { min: `Trade cancelled: you must keep at least ${TRADE_MIN_CARDS} cards.`, bound: "Trade cancelled: soul-bound cards (your starter deck, or bought with your starting MP) can't be traded.",
  fresh: `Trade cancelled: a character can give cards after ${PP.TRADE_GIVE_MIN_DUELS} rewarded duels.`,
  cap: `Trade cancelled: an account can take in at most ${PP.TRADE_IN_DAY_MAX} more cards than it gives a day through trades.` };
/** The same refusals when the trade had cosmetics (trade-units.ts: a cosmetic counts its rarity's card units). */
const CANCEL_COS = {
  fresh: `Trade cancelled: a character can give cards or cosmetics after ${PP.TRADE_GIVE_MIN_DUELS} rewarded duels.`,
  cap: `Trade cancelled: an account can take in at most ${PP.TRADE_IN_DAY_MAX} more card units than it gives a day through trades (a cosmetic counts 2 to 30 by rarity).`,
  "cos-missing": "Trade cancelled: a cosmetic in the trade is no longer a spare copy. Nothing was traded.",
  // per side: the one whose game has the panel, the one without it
  "cos-client": ["Trade cancelled: your trade partner's game can't show cosmetics yet. Nothing was traded.",
    "Trade cancelled: this trade has cosmetics your game can't show. Nothing was traded."] };
export type TradeResult = "done" | "missing" | "min" | "bound" | "fresh" | "cap" | "cos-missing" | "cos-client";
type TradeSide = { acct: string; slot: number; name: string; gave: number[]; cosmetics?: CosmeticLine[] };
/** One trade that reached both confirmations, done or refused (the D1 ledger, db/audit.ts). `cosmetics`: the side's
 *  cosmetic lines with their rarity, only when the trade had any. */
export interface TradeEntry { at: number; result: TradeResult; a: TradeSide; b: TradeSide }
/** What the trade panel (game/trade-cosmetics.ts) shows after a trade ended, done or not, for a short while. */
export interface TradeOutcome { result: TradeResult | "cancelled"; text: string; at: number; cosmetics: boolean }
const OUTCOME_KEEP_S = 120;
const s32 = (v: number) => new W().u32(v).bytes();
const EMPTY: Uint8Array = new Uint8Array(0);
/** Lines with each item's rarity (for the cap's units and the ledger). */
const rated = (lines: readonly CosmeticLine[]): CosmeticLine[] => lines.map((l) => ({ id: l.id, count: l.count, rarity: tradeItem(l.id)?.rarity ?? "common" }));
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
  /** Each side's cosmetic lines (spare copies it gives), set from the HTML trade panel (game/trade-cosmetics.ts). */
  cos: Map<number, CosmeticLine[]>;
  /** pid -> its client registered the trade panel for this trade: it can show cosmetics. */
  panel: Map<number, boolean>;
  /** Both pressed Ready and the final question (0x7118 ALLREADY) went out; a vote (0x7119) counts only then. */
  asked = false;
  /** Bumped by every change to the cosmetic lines; `changed`: the last one (who, and whether confirmations reset). */
  rev = 0;
  changed: { rev: number; by: number; reset: boolean } | null = null;
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
    this.cos = both<CosmeticLine[]>([], []);
    this.panel = both(false, false);
  }
  other(pid: number) { return pid === this.a.pid ? this.b : this.a; }
  sess(pid: number) { return pid === this.a.pid ? this.a : this.b; }
}

export class Trades {
  private trades = new Map<number, Trade>();
  /** Every confirmed trade, done or refused (do.ts writes it to D1's trade_log). */
  ledger: ((e: TradeEntry) => void) | null = null;
  /** pid -> how its last trade ended (the panel's last word after the scene closes). */
  private outcomes = new Map<number, TradeOutcome>();
  constructor(private g: Game) {}
  private outcome(pid: number, o: TradeOutcome) {
    for (const [p, x] of this.outcomes) if (o.at - x.at > OUTCOME_KEEP_S) this.outcomes.delete(p);   // kept short: no growth
    this.outcomes.set(pid, o);
  }

  isTrading(s: Session): boolean { return s.pid !== null && this.trades.has(s.pid); }

  inTrade(s: Session | null) { return !!this.tradeOf(s); }
  private tradeOf(s: Session | null) { return s && s.pid !== null ? this.trades.get(s.pid) ?? null : null; }
  private drop(t: Trade) { for (const p of [t.a.pid!, t.b.pid!]) if (this.trades.get(p) === t) this.trades.delete(p); }

  private to(t: Trade, pid: number, mid: number, data = EMPTY, c: Conn | null = null) {
    const s = t.sess(pid), cc = t.conn.get(pid) ?? null;
    if (c && (cc === c || c.sess === s)) { c.send(mid, data, SEND_PAUSE); return; }
    if (s.lobby) { if (!s.lobby.closed) s.lobby.post(mid, data, SEND_PAUSE); }
    else if (cc && !cc.closed) cc.post(mid, data, SEND_PAUSE);
    else this.g.log(`[intercambio] 0x${mid.toString(16)} for pid ${pid}: no connection`);
  }

  private withProfile<T>(s: Session, fn: (p: any, st: any) => T, save = false): T {
    return this.g.withCtx(s, () => {
      const st = this.g.loadState();
      const p = PP.profile(st, s.slot ?? PP.activeSlot(st))!;
      const r = fn(p, st);
      if (save) this.g.saveState(st);
      return r;
    });
  }
  private trunkPairs(s: Session): [number, number][] { try { return this.withProfile(s, PP.trunkPairs); } catch { return []; } }
  private sendTrunk(t: Trade, pid: number, c: Conn | null = null) { for (const [m, d] of PP.pairTable(M.TRUNKSTART, M.TRUNK, M.TRUNKEND, this.trunkPairs(t.sess(pid)))) this.to(t, pid, m, d, c); }
  // py LIMIT_BYTES None: nothing is held back from trading (an empty table)
  private sendLimit(t: Trade, pid: number, c: Conn | null = null) { for (const [m, d] of PP.pairTable(M.LIMITSTART, M.LIMIT, M.LIMITEND, [])) this.to(t, pid, m, d, c); }
  private available(s: Session, cid: number) {
    try { return PP.cardOk(cid) ? this.withProfile(s, (p) => PP.int(p.trunk?.[String(cid)] ?? 0)) : 0; } catch { return 0; }
  }

  /** The swap, checked and applied in one synchronous step (the WorldDO is single-threaded), then put in the ledger.
   *  "missing" when the cards aren't there, "bound" when a side offers soul-bound copies (PP.bindCards: only owned −
   *  bound move), "fresh" when a giving character has fewer than TRADE_GIVE_MIN_DUELS rewarded duels, "cap" when an
   *  account would take in more than TRADE_IN_DAY_MAX net card units today, "min" when a side would keep fewer than
   *  TRADE_MIN_CARDS. The gate and the cap are the economy's (progression only).
   *  With cosmetic lines: "cos-client" when either side's game never registered the trade panel (it couldn't see
   *  them), "cos-missing" when a line is no longer a spare copy. The gate counts a cosmetic like a card (giving either
   *  needs the duels) and the cap counts it in card units by rarity (trade-units.ts). Cards and cosmetics of both
   *  accounts are written in ONE store commit: any refusal moves nothing. */
  private execute(t: Trade): TradeResult {
    const r = this.check(t);
    const mixed = this.mixed(t);
    const side = (s: Session, gave: number[]) => ({ acct: s.acct ?? "", slot: s.slot ?? -1, name: s.name ?? "", gave,
      ...(mixed ? { cosmetics: rated(t.cos.get(s.pid!)!) } : {}) });
    try { this.ledger?.({ at: this.g.clock.time(), result: r, a: side(t.a, t.offer.get(t.a.pid!)!), b: side(t.b, t.offer.get(t.b.pid!)!) }); }
    catch (e) { this.g.log(`[intercambio] ledger: ${e}`); }
    return r;
  }
  private mixed(t: Trade) { return t.cos.get(t.a.pid!)!.length + t.cos.get(t.b.pid!)!.length > 0; }
  private check(t: Trade): TradeResult {
    const { a, b } = t;
    const giveA = [...t.offer.get(a.pid!)!], giveB = [...t.offer.get(b.pid!)!];
    const cosA = rated(t.cos.get(a.pid!)!), cosB = rated(t.cos.get(b.pid!)!), mixed = this.mixed(t);
    const econ = PP.progression();
    // never a trade with something a side couldn't see: both games must have shown the cosmetics
    if (mixed && !(t.panel.get(a.pid!) && t.panel.get(b.pid!))) {
      this.g.log(`[AVISO] [intercambio] pids ${a.pid}/${b.pid}: cosmetic lines without both trade panels: cancelled`);
      return "cos-client";
    }
    try {
      for (const [s, give, take, cGive, cTake] of [[a, giveA, giveB, cosA, cosB], [b, giveB, giveA, cosB, cosA]] as [Session, number[], number[], CosmeticLine[], CosmeticLine[]][]) {
        const need = new Map<number, number>();
        for (const x of give) need.set(x, (need.get(x) ?? 0) + 1);
        const [have, bound, earned, tin] = this.withProfile(s, (p, st) =>
          [{ ...(p.trunk ?? {}) }, { ...boundOf(p) }, PP.earnedDuels(p), PP.tradeInToday(this.g, st)] as const);
        for (const [cid, n] of need) if (!PP.cardOk(cid) || PP.int(have[String(cid)] ?? 0) < n) return "missing";
        if (cGive.length) {
          const spares = spareCopies(this.g, s.acct);
          const short = cGive.find((l) => (spares?.[l.id] ?? 0) < l.count);
          if (short) { this.g.log(`[AVISO] [intercambio] pid ${s.pid} offers ${short.count} of ${short.id}, ${spares?.[short.id] ?? 0} spare: cancelled`); return "cos-missing"; }
        }
        for (const [cid, n] of need) if (n > PP.int(have[String(cid)] ?? 0) - PP.int(bound[String(cid)] ?? 0)) {
          this.g.log(`[AVISO] [intercambio] pid ${s.pid} offers ${n} of ${cid}, ${bound[String(cid)]} of them soul-bound: cancelled`);
          return "bound";
        }
        if (econ && (give.length || cGive.length) && earned < PP.TRADE_GIVE_MIN_DUELS) {
          this.g.log(`[AVISO] [intercambio] pid ${s.pid} (${(s.acct ?? "?").slice(0, 8)} ${s.name}) gives ${give.length} cards, ${cGive.length} cosmetic lines after ${earned} rewarded duels (< ${PP.TRADE_GIVE_MIN_DUELS}): cancelled`);
          return "fresh";
        }
        const into = take.length + cosmeticUnits(cTake), out = give.length + cosmeticUnits(cGive);
        if (econ && into > out && tin + into - out > PP.TRADE_IN_DAY_MAX) {
          this.g.log(`[AVISO] [intercambio] pid ${s.pid} (${(s.acct ?? "?").slice(0, 8)} ${s.name}) would take in ${tin + into - out} net card units today (> ${PP.TRADE_IN_DAY_MAX}): cancelled`);
          return "cap";
        }
        const after = Object.values(have).reduce((n: number, v) => n + PP.int(v), 0) - give.length + take.length;
        if (after < TRADE_MIN_CARDS) {
          this.g.log(`[AVISO] [intercambio] pid ${s.pid} would keep ${after} cards (< ${TRADE_MIN_CARDS}): cancelled`);
          return "min";
        }
      }
      const apply = (give: number[], take: number[], net: number) => (p: any) => {
        PP.trunkRemove(p, give, this.g, "intercambio"); PP.trunkAdd(this.g, p, take, 1, "intercambio");
        PP.tradeInAdd(this.g, p, net);
      };
      const netA = giveB.length + cosmeticUnits(cosB) - giveA.length - cosmeticUnits(cosA);
      const accounts = this.g.store.peek().accounts ?? {};
      if (accounts[a.acct] && accounts[b.acct] && a.acct !== b.acct) {
        // both accounts' copies changed together, then one commit: cards, cosmetics and the intake counters
        const ea = structuredClone(accounts[a.acct]), eb = structuredClone(accounts[b.acct]);
        const pa = this.g.withCtx(a, () => PP.profile(ea, a.slot ?? PP.activeSlot(ea))!), pb = this.g.withCtx(b, () => PP.profile(eb, b.slot ?? PP.activeSlot(eb))!);
        if (mixed && !swapCosmetics(ea, eb, pa, pb, cosA, cosB)) return "cos-missing";
        this.g.withCtx(a, () => apply(giveA, giveB, netA)(pa));
        this.g.withCtx(b, () => apply(giveB, giveA, -netA)(pb));
        this.g.store.commit({}, { [a.acct]: ea, [b.acct]: eb });
        if (mixed) { pushCosmeticOwnership(this.g, a, pa); pushCosmeticOwnership(this.g, b, pb); }
        if (mixed) this.g.log(`[economia] trade pids ${a.pid}/${b.pid}: ${giveA.length} cards + ${cosA.map((l) => `${l.id}x${l.count}`).join(",") || "no cosmetics"} for ${giveB.length} cards + ${cosB.map((l) => `${l.id}x${l.count}`).join(",") || "no cosmetics"}`);
      } else {
        if (mixed) return "cos-client";   // the owner's legacy account has no wardrobe
        this.withProfile(a, apply(giveA, giveB, netA), true);
        this.withProfile(b, apply(giveB, giveA, -netA), true);
      }
    } catch (e) { this.g.log(`[intercambio] error moving the cards: ${e}`); return "missing"; }
    return "done";
  }

  /** Offers are locked once either side pressed ready: what the other confirms is what it gets (LASTCONFIRM no unlocks). */
  private locked(t: Trade) { return [...t.ready.values()].some(Boolean); }

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
    else if ((this.g.admin.flagsOf(s.acct) | this.g.admin.flagsOf(o.acct)) & SANCTION_TRADE) why = "trade sanction";
    if (why) { this.g.log(`${why === "trade sanction" ? "[AVISO] " : ""}[intercambio] REQTRADE -> ${pid}: -493 (${why})`); c.send(M.REQTRADERESULT, s32(REQ_FAIL), SEND_PAUSE); return; }
    const t = new Trade(s!, c, o!);
    this.trades.set(s!.pid!, t); this.trades.set(o!.pid!, t);
    this.g.lp?.inviteBusy(s!); this.g.lp?.inviteBusy(o!);   // trading: their direct duel invites go
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
    const cid = body.length >= 4 ? new DataView(body.buffer, body.byteOffset).getUint32(0) : 0;   // a passcode
    const t = this.tradeOf(s);
    if (t && this.locked(t)) this.g.log(`[AVISO] [intercambio] ADDCARD ${cid} after ready (offers locked): refused`);
    if (!t || t.phase !== "open" || this.locked(t)) { c.send(M.ADDCARD, s32(0), SEND_PAUSE); return; }
    const mine = t.offer.get(s!.pid!)!;
    if (mine.length >= MAX_OFFER) { c.send(M.ADDCARD, s32(0), SEND_PAUSE); return; }
    void this.available; // py only logs an uncovered ADDCARD (ADDCARD_REJECT_1010 off): the trade is cancelled at the end
    mine.push(cid);
    c.send(M.ADDCARD, s32(0), SEND_PAUSE);
    this.queueMove(t, s!.pid!, new W().u32(cid).u8(0).bytes());
  }

  private deletecard(c: Conn, s: Session | null, body: Uint8Array) {
    const idx = body.length >= 2 ? (body[0] << 8) | body[1] : 0xffff;
    const t = this.tradeOf(s);
    c.send(M.DELETECARD, s32(0), SEND_PAUSE);
    if (t && this.locked(t)) this.g.log(`[AVISO] [intercambio] DELETECARD ${idx} after ready (offers locked): refused`);
    if (!t || t.phase !== "open" || this.locked(t) || idx >= t.offer.get(s!.pid!)!.length) return;
    t.offer.get(s!.pid!)!.splice(idx, 1);
    this.queueMove(t, s!.pid!, new W().u32(idx).u8(1).bytes());
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
    if ([...t.ready.values()].every((x) => x)) { t.asked = true; this.to(t, s!.pid!, M.ALLREADY, EMPTY, c); this.to(t, o.pid!, M.ALLREADY, EMPTY, c); }
  }

  private lastconfirm(c: Conn, s: Session | null, body: Uint8Array) {
    if (body.length < 1) return;
    const choice = body[0];
    const t = this.tradeOf(s);
    // a vote counts only for the question asked (0x7118): a late answer to a question a change (or a No) withdrew
    // arrives before that client's next Ready on the same socket, and is dropped here
    if (!t || t.phase !== "open" || choice === 0 || !t.asked) return;
    t.confirm.set(s!.pid!, choice === CONFIRM_YES || choice === CONFIRM_NO ? choice : CONFIRM_NO);
    const a = t.a.pid!, b = t.b.pid!;
    if ([...t.confirm.values()].includes(CONFIRM_NO)) { this.backToEditing(t, c); return; }
    if ([...t.confirm.values()].includes(null)) return;
    const r = this.execute(t), done = r === "done", mixed = this.mixed(t);
    t.phase = "done";
    for (const p of [a, b]) {
      this.to(t, p, M.LASTCONFIRMRESULT, Uint8Array.of(RESULT_DONE), c);
      this.to(t, p, M.TRADEEND, Uint8Array.of(done ? 1 : 0), c);
      if (done) this.sendTrunk(t, p, c);
      // why, as a server line in the chat (the trade screen has no text of its own for it)
      const x = this.cancelText(t, r, p, mixed);
      if (x) this.say(t, p, x, c);
      this.outcome(p, { result: r, text: done ? "Trade complete." : x || "Trade cancelled: the cards offered are no longer there. Nothing was traded.",
        at: this.g.clock.time(), cosmetics: mixed });
    }
  }
  private cancelText(t: Trade, r: TradeResult, pid: number, mixed: boolean): string | null {
    if (r === "done" || r === "missing") return null;
    if (r === "cos-client") return CANCEL_COS["cos-client"][t.panel.get(pid) ? 0 : 1];
    if (r === "cos-missing") return CANCEL_COS["cos-missing"];
    return mixed && (r === "fresh" || r === "cap") ? CANCEL_COS[r] : CANCEL_TEXT[r];
  }
  /** A server line in the player's chat (0x4402 from "Duel Evolution"). */
  private say(t: Trade, pid: number, x: string, c: Conn | null = null) {
    this.to(t, pid, 0x4402, new W().u8(0).u8(1).u32(0).u32(2).s("Duel Evolution", 16).s(x, x.length + 1).bytes(), c);
  }
  /** Both back to editing, both confirmations and Ready lamps cleared: the 2008 client's "someone said No" (0x7120 2). */
  private backToEditing(t: Trade, c: Conn | null) {
    const a = t.a.pid!, b = t.b.pid!;
    t.ready = new Map([[a, false], [b, false]]);
    t.confirm = new Map([[a, null], [b, null]]);
    t.asked = false;
    for (const p of [a, b]) this.to(t, p, M.LASTCONFIRMRESULT, Uint8Array.of(RESULT_BACK), c);
  }

  private abort(t: Trade, s: Session, c: Conn | null, _why: string) {
    this.drop(t);
    if (t.phase === "done") return;
    const now = this.g.clock.time(), mixed = this.mixed(t);
    for (const p of [t.a.pid!, t.b.pid!]) this.outcome(p, { result: "cancelled", at: now, cosmetics: mixed,
      text: p === s.pid ? "You left the trade. Nothing was traded." : "Your trade partner left the trade. Nothing was traded." });
    const o = t.other(s.pid!);
    this.to(t, o.pid!, M.USEREXIT, new W().u32(t.known.get(o.pid!)!).bytes(), c);
  }

  private userexit(c: Conn, s: Session | null) {
    const t = this.tradeOf(s);
    if (!t) return;
    if (t.phase === "offer" && t.b === s) { this.drop(t); this.to(t, t.a.pid!, M.OFFERREPLY, s32(DECLINE_VALUE), c); }
    else this.abort(t, s!, c, "TRADEUSEREXIT");
  }

  // ---- the cosmetic lines (game/trade-cosmetics.ts: the HTML panel's API; the session is always the caller's own)
  /** What the caller's trade panel shows: both sides' cosmetic lines, the caller's spare copies, whose panel is up,
   *  the Ready lamps and the question, why the caller can't change its lines now, the last change. Not trading: how
   *  the last trade ended (for OUTCOME_KEEP_S). */
  cosmeticsView(s: Session) {
    const t = this.tradeOf(s), me = s.pid!;
    if (!t || t.phase === "done") {
      const last = this.outcomes.get(me);
      return { trading: false as const, last: last && this.g.clock.time() - last.at <= OUTCOME_KEEP_S ? last : null };
    }
    const o = t.other(me).pid!;
    const out = (pid: number) => t.cos.get(pid)!.map((l) => ({ id: l.id, count: l.count, item: tradeItem(l.id) }));
    return {
      trading: true as const, phase: t.phase, rev: t.rev, maxLines: TRADE_COSMETIC_LINES,
      // the caller's character's body: the art the panel draws for every item (the look it would wear)
      body: this.withProfile(s, (p) => PP.avatarParts(p, s.world === 0 ? 0 : 1)[0] === 1 ? "female" : "male"),
      partner: { pid: o, name: t.sess(o).name },
      panel: { me: !!t.panel.get(me), partner: !!t.panel.get(o) },
      ready: { me: !!t.ready.get(me), partner: !!t.ready.get(o) }, asked: t.asked,
      confirmed: { me: t.confirm.get(me) === CONFIRM_YES, partner: t.confirm.get(o) === CONFIRM_YES },
      mine: out(me), theirs: out(o), spares: tradeSpares(this.g, s.acct),
      locked: this.cosmeticLock(t, me),
      changed: t.changed && { rev: t.changed.rev, by: t.changed.by === me ? "me" : "partner", reset: t.changed.reset },
    };
  }
  /** Why `pid` can't change its cosmetic lines now (null: it can). Like the cards (locked once either side pressed
   *  Ready), except at the final question, where a change withdraws it (setCosmetics). */
  private cosmeticLock(t: Trade, pid: number): string | null {
    if (t.phase !== "open") return "not-open";
    if (!t.panel.get(pid)) return "no-panel";
    if (!t.panel.get(t.other(pid).pid!)) return "partner-no-panel";
    if (t.asked) return null;
    if (t.ready.get(pid)) return "ready-me";
    if (t.ready.get(t.other(pid).pid!)) return "ready-partner";
    return null;
  }
  /** The caller's game shows the trade panel (on) or no longer does: the capability the cosmetic lines need. */
  tradePanel(s: Session, on: boolean): { error: string } | null {
    const t = this.tradeOf(s);
    if (!t || t.phase === "done") return { error: "not-trading" };
    t.panel.set(s.pid!, on);
    return null;
  }
  /** The caller's side of the cosmetic lines becomes `lines` (already parsed: game/cosmetics.ts tradeLines). The same
   *  lines again change nothing (a retried request). A change resets both players' confirmations: both votes are
   *  cleared, and at the final question both Ready lamps too, both clients going back to editing as when someone
   *  answers No. Every line must be a spare copy now; the commit checks again. */
  setCosmetics(s: Session, lines: CosmeticLine[]): { error: string; [k: string]: unknown } | { replay: boolean } {
    const t = this.tradeOf(s), me = s.pid!;
    if (!t || t.phase === "done") return { error: "not-trading" };
    const key = (ls: readonly CosmeticLine[]) => JSON.stringify([...ls].map((l) => [l.id, l.count]).sort());
    if (key(t.cos.get(me)!) === key(lines)) return { replay: true };
    const lock = this.cosmeticLock(t, me);
    if (lock) return { error: lock };
    const spares = spareCopies(this.g, s.acct) ?? {};
    const short = lines.find((l) => (spares[l.id] ?? 0) < l.count);
    if (short) return { error: "insufficient-duplicates", id: short.id, spare: spares[short.id] ?? 0 };
    if (PP.progression() && lines.length && this.withProfile(s, (p) => PP.earnedDuels(p)) < PP.TRADE_GIVE_MIN_DUELS) return { error: "fresh", min: PP.TRADE_GIVE_MIN_DUELS };
    t.cos.set(me, lines.map((l) => ({ id: l.id, count: l.count })));
    t.rev++;
    const reset = t.asked || [...t.confirm.values()].some((v) => v !== null);
    t.confirm = new Map([[t.a.pid!, null], [t.b.pid!, null]]);
    if (t.asked) {
      this.backToEditing(t, null);
      for (const p of [t.a.pid!, t.b.pid!]) this.say(t, p, `${s.name || "Your trade partner"} changed the cosmetics in the trade: both confirmations were reset.`);
    }
    t.changed = { rev: t.rev, by: me, reset };
    this.g.log(`[intercambio] pid ${me} cosmetic lines: ${lines.map((l) => `${l.id}x${l.count}`).join(",") || "none"} (rev ${t.rev}${reset ? ", confirmations reset" : ""})`);
    return { replay: false };
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
