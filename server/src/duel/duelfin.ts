// py research/duelfin/proposal.py (DFM / DF): the end of a duel. On the duel port, in this order: [0x6202 cmd 0x23 (loser's
// LP to 0)] + 0x6202 cmd 0x05 DUEL_END + 0x6613 DUELSCORE + 0x6202 type 0x4d; on the lobby: 0x4140 PLAYERDATAUPDATE
// (before the 0x4d), 0x4237 and 0x4800 (CResultScene waits for it to show «Next»). Surrender = command 10 on the own deck
// with a YES/NO dialog (confirm_surrender=True, as the server runs it). The NPC end goes through research/npcreglas
// (npcRules.ts).
import type { Conn } from "../net/conn.ts";
import { W } from "../net/proto.ts";
import type { Game } from "../game/game.ts";
import * as PP from "../game/persist.ts";
import { C_DUEL_END, CMD_SURRENDER, duelscore as lsDuelscore, engine, setcommand, T_FINISH, T_LIST_ADD, T_LIST_RESET, T_VIEW, ZONE_DECK } from "./lockstep.ts";
import { nrLobbyAfterDuel, nrNpcDuelEnd } from "./npcRules.ts";

type P = Record<string, any>;
export type Msg = [number, Uint8Array];

export const RESULT_WIN = 1, RESULT_LOSE = 2, RESULT_DRAW = 3;
export const REASON_NONE = 0, REASON_LP = 1, REASON_DECKOUT = 2, REASON_EXODIA = 3, REASON_DESTINY = 4;
export const REASON_FINALCOUNT = 6, REASON_CARD_169C = 7, REASON_TURNLIMIT = 0x0b;
export const WHY_LP = "lp", WHY_DECKOUT = "deckout", WHY_SURRENDER = "surrender", WHY_TIMEOUT = "timeout";
export const WHY_DISCONNECT = "disconnect", WHY_DRAW = "draw", WHY_ABORT = "abort";
export const WHY_EXODIA = "exodia", WHY_FINALCOUNT = "finalcount", WHY_DESTINY = "destiny";
const MOTIVE: Record<string, number> = { [WHY_LP]: REASON_LP, [WHY_DECKOUT]: REASON_DECKOUT, [WHY_SURRENDER]: REASON_NONE,
  [WHY_TIMEOUT]: REASON_NONE, [WHY_DISCONNECT]: REASON_NONE, [WHY_DRAW]: REASON_NONE, [WHY_EXODIA]: REASON_EXODIA,
  [WHY_FINALCOUNT]: REASON_CARD_169C, [WHY_DESTINY]: REASON_DESTINY };
const OCG_WIN_REASON: Record<number, string> = { 0x1: WHY_LP, 0x2: WHY_DECKOUT, 0x10: WHY_EXODIA, 0x11: WHY_FINALCOUNT, 0x15: WHY_DESTINY };

/** duelcore "end".reason (ocgcore number or "surrender"/"ended"/"error"/"loop") -> WHY_* */
export function whyFromOcg(reason: unknown): string {
  if (typeof reason === "boolean") return WHY_LP;
  if (typeof reason === "number" && Number.isInteger(reason)) return OCG_WIN_REASON[reason] ?? WHY_LP;
  const r = String(reason ?? "").toLowerCase();
  if (r === "surrender") return WHY_SURRENDER;
  if (r === "error" || r === "ended") return WHY_ABORT;
  return r.includes("deck") ? WHY_DECKOUT : WHY_LP;
}

export const FINISH_NORMAL = 0, FINISH_FILL = 3, FINISH_CLOSE = 5, FINISH_SURRENDER = 2, REASON_SURRENDER = 12;
const C_LOSE_LP0 = 0x23;
export const SURRENDER_TEXT = 6, SURRENDER_CLASS = 2, YES = 1, NO = 0;
export const M_SETCOMMAND = 0x6202, M_DUELSCORE = 0x6613, M_SVRINFO = 0x649b, M_TIMEUP = 0x6461;
export const M_PDU = 0x4140, M_NPCPRESENT = 0x4237, M_CARDPACKLIST = 0x4800, M_DUELABORT = 0x4310;

/** winner: 0 = the client, 1 = the rival, null = draw */
export const resultForClient = (winner: number | null): number => (winner === null ? RESULT_DRAW : winner === 0 ? RESULT_WIN : RESULT_LOSE);

export function duelscore(me: readonly number[] = [0, 0, 0, 0], rival: readonly number[] = [0, 0, 0, 0], x = 0): Uint8Array {
  return lsDuelscore(me, rival, x);
}

export interface EndOpts { finish?: number; lpZero?: boolean | null; score?: [number[], number[]] | null; officialSurrender?: boolean }

/** Messages of the DUEL PORT that end the game. */
export function endDuelMsgs(winner: number | null, reason = WHY_LP, o: EndOpts = {}): Msg[] {
  const finish = o.finish ?? FINISH_NORMAL;
  const res = resultForClient(winner);
  const motive = MOTIVE[reason] ?? REASON_NONE;
  const out: Msg[] = [];
  const off = !!o.officialSurrender && reason === WHY_SURRENDER && winner !== null;
  let lpZero = o.lpZero;
  if (lpZero == null) lpZero = [WHY_SURRENDER, WHY_TIMEOUT, WHY_DISCONNECT].includes(reason) && !off;
  if (lpZero && winner !== null) out.push([M_SETCOMMAND, engine(C_LOSE_LP0, 1 - winner, motive)]);
  if (off) {
    const [m1, m2] = res === RESULT_LOSE ? [0, REASON_SURRENDER] : [REASON_SURRENDER, 0];
    out.push([M_SETCOMMAND, engine(C_DUEL_END, res === RESULT_LOSE ? 0 : 1, res, m1, m2)]);
  } else out.push([M_SETCOMMAND, engine(C_DUEL_END, 0, res, motive, motive)]);
  let score = o.score;
  if (score == null) {
    const me = [res === RESULT_WIN ? 1 : 0, res === RESULT_LOSE ? 1 : 0, res === RESULT_DRAW ? 1 : 0, 0];
    score = [me, [me[1], me[0], me[2], 0]];
  }
  out.push([M_DUELSCORE, duelscore(score[0], score[1])]);
  out.push([M_SETCOMMAND, setcommand(T_FINISH, 0, [res, finish])]);
  return out;
}

export function surrenderConfirmMsgs(text = SURRENDER_TEXT): Msg[] {
  return [[M_SETCOMMAND, setcommand(T_LIST_RESET, 0, [1])], [M_SETCOMMAND, setcommand(T_LIST_ADD, 0, [text, SURRENDER_CLASS])],
    [M_SETCOMMAND, setcommand(T_VIEW, 0x32, [2, 0, 0])]];
}

export function infoDialogMsgs(text: number): Msg[] {
  return [[M_SETCOMMAND, setcommand(T_LIST_RESET, 0, [1])], [M_SETCOMMAND, setcommand(T_LIST_ADD, 0, [text, SURRENDER_CLASS])],
    [M_SETCOMMAND, setcommand(T_VIEW, 0x32, [0, text, 0])]];
}

export function parse6350(data: Uint8Array): [number, number, number, number] | null {
  if (data.length < 16) return null;
  const dv = new DataView(data.buffer, data.byteOffset, data.byteLength);
  const c = dv.getUint32(12);
  return [dv.getUint32(0), dv.getUint32(4), dv.getUint32(8), c === 0xffffffff ? -1 : c];
}

/** 0x6350 of «Surrender»: ONLY command 10 on the OWN deck (0, 0xd). */
export function isSurrender(data: Uint8Array): boolean {
  const m = parse6350(data);
  return !!m && m[0] === 0 && m[1] === ZONE_DECK && m[3] === CMD_SURRENDER;
}

export function cardpacklistNotice(packs: readonly number[] = []): Uint8Array {
  const w = new W();
  for (const p of packs) w.u16(PP.int(p) & 0xffff);
  return w.bytes();
}
export const npcPresentType = (kind: number): Uint8Array => new W().u32(PP.int(kind)).bytes();
export const duelAbort = (code = 0): Uint8Array => new W().u32(PP.int(code)).bytes();

/** duelfin's own npc_duel_end: persistence's on_npc_duel_end with the right NPCBIN split (b1 losses, b2 draws). */
function npcDuelEndBase(g: Game, p: P, npc: number, result: string, turns = 0, lpLeft = 0): Uint8Array {
  const before = PP.npcbinGet(p, npc);
  PP.npcDuelResult(g, p, npc, result, turns, lpLeft);
  const e = PP.npcbinGet(p, npc);
  if (result !== "win") {
    const want = result === "lose" ? 1 : 2;
    for (const k of [1, 2]) if (k !== want && e[k] > before[k]) { e[k] -= 1; e[want] = Math.min(e[want] + 1, 255); }
  }
  PP.npcbinSet(p, npc, e);
  return PP.playerDataUpdate(p, npc);
}

/** DFM.npc_duel_end (as research/npcreglas wraps it) */
export const npcDuelEnd = (g: Game, p: P, npc: number, result: string, turns = 0, lpLeft = 0): Uint8Array =>
  nrNpcDuelEnd(g, (pp, n, r, t, l) => npcDuelEndBase(g, pp, n, r, t, l), p, npc, result, turns, lpLeft);

/** DFM.lobby_after_duel_msgs (as research/npcreglas wraps it): lobby messages after an NPC duel. */
export function lobbyAfterDuelMsgs(g: Game, p: P, npc: number, result: number, turns = 0, lpLeft = 0,
  present: number | null = null, packs: number[] = [], card = true): Msg[] {
  const r = result === RESULT_WIN ? "win" : result === RESULT_LOSE ? "lose" : "draw";
  return nrLobbyAfterDuel(g, (pk) => {
    const out: Msg[] = [[M_PDU, npcDuelEnd(g, p, npc, r, turns, lpLeft)]];
    if (present !== null) out.push([M_NPCPRESENT, npcPresentType(present)]);
    out.push([M_CARDPACKLIST, cardpacklistNotice(pk)]);
    return out;
  }, p, present, packs, npcPresentType, card);
}

/** py DuelEnd. mode = last u8 of 0x43a0 (0 single duel; 1 NPC "match", closed after one game). */
export class DuelEnd {
  games: number[] = [];
  over = false;
  constructor(public mode = 0, public singleGameMatch = true) {}
  private decided(): boolean {
    const w = this.games.filter((x) => x === RESULT_WIN).length, l = this.games.filter((x) => x === RESULT_LOSE).length;
    return w - l >= 2 || l - w >= 2 || this.games.length >= 3;
  }
  gameOver(winner: number | null, reason: string): [Msg[], boolean] {
    this.games.push(resultForClient(winner));
    if (this.mode !== 1) { this.over = true; return [endDuelMsgs(winner, reason, { finish: FINISH_NORMAL }), true]; }
    if (reason === WHY_SURRENDER || reason === WHY_DISCONNECT || this.singleGameMatch) {
      this.over = true;
      return [endDuelMsgs(winner, reason, { finish: FINISH_CLOSE }), true];
    }
    this.over = this.decided();
    return [endDuelMsgs(winner, reason, { finish: FINISH_NORMAL }), this.over];
  }
  matchResult(): number {
    const w = this.games.filter((x) => x === RESULT_WIN).length, l = this.games.filter((x) => x === RESULT_LOSE).length;
    return w > l ? RESULT_WIN : l > w ? RESULT_LOSE : RESULT_DRAW;
  }
}

export interface DfSess { end: DuelEnd | null; npc: number; turn: number; ask: boolean }
export interface DF {
  sess: DfSess;
  h_autoduelstart(npc: number, mode: number): void;
  finish(c: Conn, winner: number | null, reason: string, turns?: number, lpLeft?: number, present?: number | null): boolean;
  /** false = not a surrender; "ask" = YES/NO dialog sent; true = ended (without confirmation) */
  h_6350(c: Conn, data: Uint8Array): false | "ask" | true;
  /** null = not ours; "end" = YES; "no" = NO (resend the pending request) */
  h_6423(c: Conn, data: Uint8Array): null | "end" | "no";
  h_0003(c: Conn, data: Uint8Array): boolean;
  h_disconnect(c: Conn): void;
}

/** py make_handlers(load_state, save_state, lobby_conn_getter, confirm_surrender=True) */
export function makeDf(g: Game, lobbyConn: () => Conn | null, confirmSurrender = true): DF {
  const sess: DfSess = { end: null, npc: 0, turn: 0, ask: false };
  const burst = (c: Conn, msgs: Msg[]) => { for (const [mid, d] of msgs) c.send(mid, d); };
  const df: DF = {
    sess,
    h_autoduelstart(npc, mode) { Object.assign(sess, { end: new DuelEnd(mode), npc: PP.int(npc), turn: 0 }); },
    finish(c, winner, reason, turns = 0, lpLeft = 0, present = null) {
      // one result per NPC duel begun (h_autoduelstart): a repeated surrender dialog or a late finish pays nothing
      const de = sess.end;
      if (de === null || de.over) { g.log(`[AVISO] [duelfin] ${reason} with no NPC duel in progress: ignored`); return false; }
      const [msgs, over] = de.gameOver(winner, reason);
      const lob = lobbyConn();
      if (over && lob !== null) {
        const st = g.loadState();
        const p = PP.profile(st, PP.activeSlot(st))!;
        const res = de.mode === 1 ? de.matchResult() : resultForClient(winner);
        // the NPC card (npcRules card) is for a duel played to its end, not given up
        const pdu = lobbyAfterDuelMsgs(g, p, sess.npc, res, turns, lpLeft, present, [], reason !== WHY_SURRENDER);
        g.saveState(st);
        burst(lob, pdu.slice(0, 1));
        burst(c, msgs);
        burst(lob, pdu.slice(1));
      } else burst(c, msgs);
      return over;
    },
    h_6350(c, data) {
      if (!isSurrender(data)) return false;
      if (confirmSurrender) { sess.ask = true; burst(c, surrenderConfirmMsgs()); return "ask"; }
      df.finish(c, 1, WHY_SURRENDER);
      return true;
    },
    h_6423(c, data) {
      if (!sess.ask) return null;
      sess.ask = false;
      const v = data.length >= 4 ? new DataView(data.buffer, data.byteOffset).getUint32(0) : NO;
      if (v === YES) { df.finish(c, 1, WHY_SURRENDER); return "end"; }
      return "no";
    },
    h_0003() { sess.end = null; return true; },
    h_disconnect() {
      const de = sess.end;
      if (de !== null && !de.over) {
        const st = g.loadState();
        const p = PP.profile(st, PP.activeSlot(st))!;
        npcDuelEnd(g, p, sess.npc, "lose");
        p.rec.duels_void = (p.rec.duels_void ?? 0) + 1;
        g.saveState(st);
      }
      sess.end = null;
    },
  };
  return df;
}
