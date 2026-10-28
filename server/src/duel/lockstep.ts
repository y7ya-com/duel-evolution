// py research/lockstep/proposal.py (LS) as the server loads it (DUEL_CFG stage 4): rock-paper-scissors against the NPC,
// the 0x649b/0x6613 builders and duel_reply_v2, the skeleton duel server without rules (DuelSim) that only runs when a
// duel connection has no ocg session. The 0x6202 builders themselves live in translator/lockstep.ts (shared with the
// translator, as py's translator imports them from here).
import type { Conn } from "../net/conn.ts";
import { W } from "../net/proto.ts";
import { PyRandom } from "../util/pyrandom.ts";
import {
  C_DRAW, C_DUEL_START, C_PHASE, C_SUMMON, C_TURN_CHANGE, CMD_ACTIVATE, CMD_ATTACK, CMD_SET, CMD_SET_ST, CMD_SUMMON,
  CMD_TO_ATK, CMD_TO_DEF, comid_field, comid_hand, engine, loc, mk, PH_BATTLE, PH_END, PH_MAIN2, request_input, set_card,
  ZONE_DECK, ZONE_HAND, type Masks,
} from "./translator/lockstep.ts";

export * from "./translator/lockstep.ts";

/** py DUEL_CFG. npc_janken_azar: off in the test instances (YO2_PVP_TEST), set by installDuel from the config. */
export interface DuelCfg {
  stage: number; npc_janken_azar: boolean; npc_elige: string; player_wins_jyanken: boolean; npc_first: boolean;
  request_kind: number; burst_pause: number; player_deck: number[] | null; npc_deck: number[] | null;
}
export const newDuelCfg = (test: boolean): DuelCfg => ({
  stage: 4, npc_janken_azar: !test, npc_elige: "primero", player_wins_jyanken: true, npc_first: false,
  request_kind: 3, burst_pause: 0.05, player_deck: null, npc_deck: null,
});

/** DUELSVRINFOMSG 0x649b: u8 code (1 cut, 2 surrender, 3 time up, 4 connection error), u8 bit0 = the rival. */
export const duelsvrinfomsg = (code: number, flag = 0): Uint8Array => new W().u8(code).u8(flag).bytes();

/** DUELSCORE 0x6613: 4 x u32 of A, 4 x u32 of B, u32 -> +0x680 (36 B). */
export function duelscore(a: readonly number[] = [0, 0, 0, 0], b: readonly number[] = [0, 0, 0, 0], x = 0): Uint8Array {
  const w = new W();
  for (const v of [...a, ...b, x]) w.u32(v);
  return w.bytes();
}

export const selectfirst_result = (first: number): Uint8Array => Uint8Array.of(first & 1);

/** Randomness of the NPC's hand: py uses random.SystemRandom() (not the seeded `random`). */
const sysRandrange = (n: number): number => {
  const b = new Uint32Array(1);
  crypto.getRandomValues(b);
  return b[0] % n;
};

export function npc_elige_first(cfg: DuelCfg, modo?: string | null, rr: (n: number) => number = sysRandrange): number {
  const m = (modo || cfg.npc_elige || "primero").trim().toLowerCase();
  if (m === "segundo") return 0;
  if (m === "azar") return rr(2);
  return 1;
}

/** One throw against the NPC -> [NPC's hand, result seen by the client: 0 tie, 1 player wins, 2 NPC wins]. */
export function janken_npc(cfg: DuelCfg, mine: number): [number, number] {
  mine %= 3;
  const rival = cfg.npc_janken_azar ? sysRandrange(3) : (mine + (cfg.player_wins_jyanken ? 1 : 2)) % 3;
  return [rival, (((rival - mine) % 3) + 3) % 3];
}

const JANKEN_KEYS = ["jwin", "jhands", "first", "first_por", "jrounds"];
export function janken_reset(st: Record<string, any>): void { for (const k of JANKEN_KEYS) delete st[k]; }

/** 0x6101 / 0x6102 / 0x6103 against the NPC; leaves jwin, jhands, first, first_por in st (c.duel_st). */
export function janken_reply(cfg: DuelCfg, c: Conn, st: Record<string, any>, msgId: number, data: Uint8Array, log: (s: string) => void): void {
  if (msgId === 0x6101) {
    if (st.jwin != null) { log(`[duelo] piedra-papel-tijera: 0x6101 con el resultado ya decidido (${hx(data)}): ignorado`); return; }
    const mine = (data.length ? data[0] : 0) % 3;
    const [rival, r] = janken_npc(cfg, mine);
    st.jrounds = (st.jrounds ?? 0) + 1;
    if (r) {
      st.jhands = [mine, rival];
      st.jwin = r === 1 ? 0 : 1;
      if (r === 2) {
        st.first = cfg.npc_janken_azar ? npc_elige_first(cfg) : cfg.npc_first ? 1 : 0;
        st.first_por = "npc";
      }
    }
    const que = r === 0 ? "empate (el cliente repite)" : r === 1 ? "gana el jugador (elige él)"
      : `gana la NPC y elige ${st.first === 1 ? "empezar" : "ir segunda"}`;
    log(`[duelo] piedra-papel-tijera contra NPC, tirada ${st.jrounds}: manos [${mine}, ${rival}] -> ${que}`
      + (cfg.npc_janken_azar ? "" : " [sin azar: YO2_JANKEN_NPC_AZAR=0]"));
    c.send(0x6101, Uint8Array.of(0, rival));
    return;
  }
  if (msgId === 0x6102) {
    c.send(0x6102);
    if (st.jwin === 1) c.send(0x6103, selectfirst_result(st.first ?? 1));
    else if (st.jwin == null && cfg.npc_janken_azar && st.jrounds) log("[duelo] piedra-papel-tijera: 0x6102 sin ganador (el cliente real no lo manda tras un empate)");
    return;
  }
  if (msgId === 0x6103) {
    if (st.jwin === 1) { log(`[duelo] piedra-papel-tijera: 0x6103 del jugador (${hx(data)}) cuando eligió la NPC: ignorado`); return; }
    st.first = (data.length ? data[0] : 0) & 1;
    st.first_por = "jugador";
    c.send(0x6103, data.subarray(0, 1));
  }
}

const hx = (b: Uint8Array) => Buffer.from(b).toString("hex");
const HAND_MASK = (1 << CMD_SUMMON) | (1 << CMD_SET) | (1 << CMD_ACTIVATE) | (1 << CMD_SET_ST);
type Out = Uint8Array | [number, Uint8Array];

/** py DuelSim: the skeleton duel (no rules) of a duel connection without an ocg session. */
export class DuelSim {
  first: number;
  deck: [number, number][][];
  hand: [number, number][][] = [[], []];
  field: ([number, number] | null)[][] = [Array(10).fill(null), Array(10).fill(null)];
  turn_player: number;
  turn = 0;
  phase = 0;

  constructor(playerDeck: number[], npcDeck: number[], first = 0, seed?: number) {
    const rnd = new PyRandom(seed);
    this.first = first;
    const ds = [playerDeck.slice(), npcDeck.slice()];
    for (const d of ds) rnd.shuffle(d);
    this.deck = ds.map((d) => d.map((card, i) => [card, i + 1] as [number, number]));
    this.turn_player = first;
  }

  impose_decks(): Out[] {
    const out: Out[] = [];
    for (const p of [0, 1]) this.deck[p].forEach(([card, serial], i) => out.push(set_card(p, ZONE_DECK, i, card, serial, p)));
    return out;
  }

  draw(p: number, n: number): Uint8Array {
    this.hand[p].push(...this.deck[p].splice(0, n));
    return engine(C_DRAW, p, 0xffff, n);
  }

  play_from_hand(p: number, idx: number, cmd = CMD_SUMMON): Out[] {
    let slots: number[], face: number, pos: number;
    if (cmd === CMD_ACTIVATE || cmd === CMD_SET_ST) [slots, face, pos] = [[5, 6, 7, 8, 9], +(cmd === CMD_ACTIVATE), 0];
    else if (cmd === CMD_SET) [slots, face, pos] = [[0, 1, 2, 3, 4], 0, 1];
    else [slots, face, pos] = [[0, 1, 2, 3, 4], 1, 0];
    const free = slots.filter((s) => this.field[p][s] === null);
    if (idx >= this.hand[p].length || !free.length) return [];
    const [card, serial] = this.hand[p].splice(idx, 1)[0];
    this.field[p][free[0]] = [card, serial];
    return [engine(C_SUMMON, p, loc(p, free[0], face, pos), p + 2 * serial, 0)];
  }

  request(kind: number): Out[] {
    const buttons = ({ 2: [PH_BATTLE, PH_END], 3: [PH_MAIN2, PH_END], 4: [PH_END] } as Record<number, number[]>)[this.phase] ?? [PH_END];
    const tail: Masks = new Map(buttons.map((b) => [mk(0, b), 1]));
    let masks: Masks = new Map();
    if (this.phase === 3) masks = new Map([0, 1, 2, 3, 4].filter((s) => this.field[0][s]).map((s) => [mk(0, s), 1 << CMD_ATTACK]));
    else if (this.phase === 2 || this.phase === 4)
      masks = new Map([0, 1, 2, 3, 4].filter((s) => this.field[0][s]).map((s) => [mk(0, s), (1 << CMD_TO_ATK) | (1 << CMD_TO_DEF)]));
    const hand: [number, number, number][] = this.phase === 2 || this.phase === 4 ? this.hand[0].map((_, i) => [0, i, HAND_MASK]) : [];
    return [[0x6611, comid_field(masks, null, tail)], [0x6612, comid_hand(hand)], [0x6202, request_input(kind)]];
  }

  start_sequence(stage: number): Out[] {
    const out: Out[] = [engine(C_DUEL_START)];
    if (stage >= 4) out.push(...this.impose_decks());
    if (stage >= 2) out.push(this.draw(0, 5), this.draw(1, 5));
    if (stage >= 3) out.push(...this.turn_start(this.first, true));
    return out;
  }

  set_phase(p: number, ph: number): Uint8Array { this.phase = ph; return engine(C_PHASE[ph], p); }

  turn_start(p: number, firstTurn = false): Out[] {
    const out: Out[] = [];
    this.turn_player = p;
    this.turn++;
    out.push(this.set_phase(p, 0));
    if (!firstTurn) out.push(this.draw(p, 1));
    out.push(this.set_phase(p, 1), this.set_phase(p, 2));
    if (p === 1) out.push(...this.npc_main());
    return out;
  }

  npc_main(): Out[] {
    const out = this.hand[1].length ? this.play_from_hand(1, 0) : [];
    out.push(engine(C_TURN_CHANGE, 1));
    out.push(...this.turn_start(0));
    return out;
  }
}

const deckFrom6601 = (d: Uint8Array): number[] => {
  const dv = new DataView(d.buffer, d.byteOffset, d.byteLength);
  const n = dv.getUint32(0);
  return Array.from({ length: n }, (_, i) => dv.getUint16(4 + 2 * i));
};

export interface LsHost {
  cfg: DuelCfg;
  log(s: string): void;
  /** py duel_reply_base */
  base(c: Conn, msgId: number, param: number, data: Uint8Array): void;
  /** py _burst: sent 0.5 s later, burst_pause apart, without blocking the reader */
  burst(c: Conn, msgs: Out[]): void;
}

/** py LS._state: the duel state kept ON THE CONNECTION (c.duel_st). */
export function lsState(c: Conn): Record<string, any> { return ((c.ext.duelSt as Record<string, any>) ??= {}); }

/** py LS.duel_reply_v2 (stage 4). */
export function duelReplyV2(h: LsHost, c: Conn, msgId: number, param: number, data: Uint8Array): void {
  const st = lsState(c);
  const cfg = h.cfg;
  if (msgId === 0x6601) st.client_deck = deckFrom6601(data);
  if (msgId === 0x6100) janken_reset(st);
  if (msgId === 0x6101 || msgId === 0x6102 || msgId === 0x6103) return janken_reply(cfg, c, st, msgId, data, h.log);
  if (msgId === 0x61fe) {
    if (st.sim) { h.log(`[duelo] 0x61fe con duelo en marcha (opciones): ${hx(data)}`); return; }
    const deck = cfg.player_deck ?? st.client_deck ?? Array(40).fill(1);
    const sim = new DuelSim(deck, cfg.npc_deck ?? deck, st.first ?? 0);
    st.sim = sim;
    const msgs = sim.start_sequence(cfg.stage);
    if (cfg.stage >= 3 && sim.turn_player === 0) msgs.push(...sim.request(cfg.request_kind));
    h.log(`[duelo] arranque etapa ${cfg.stage}: empieza ${sim.first}, ${msgs.length} mensajes`);
    return h.burst(c, msgs);
  }
  const sim = st.sim as DuelSim | undefined;
  const dv = new DataView(data.buffer, data.byteOffset, data.byteLength);
  if (msgId === 0x6350 && sim) {
    const [p, zone, idx, cmd0] = [0, 4, 8, 12].map((o) => dv.getUint32(o));
    const cmd = cmd0 === 0xffffffff ? -1 : cmd0;
    h.log(`[duelo] jugada jugador=${p} zona=0x${zone.toString(16)} índice=${idx} comando=${cmd}`);
    const out = zone === ZONE_HAND ? sim.play_from_hand(0, idx, cmd) : [];
    return h.burst(c, [...out, ...sim.request(cfg.request_kind)]);
  }
  if (msgId === 0x6351 && sim) return h.burst(c, sim.request(cfg.request_kind));
  if (msgId === 0x002e && sim) {
    const ph = dv.getUint32(0);
    h.log(`[duelo] fase pedida ${ph}`);
    if (ph === PH_END) return h.burst(c, [engine(C_TURN_CHANGE, 0), ...sim.turn_start(1), ...sim.request(cfg.request_kind)]);
    return h.burst(c, [sim.set_phase(0, Math.min(ph, 4)), ...sim.request(cfg.request_kind)]);
  }
  if ([0x004a, 0x6423, 0x6426, 0x6432, 0x61ff, 0x61f0, 0x6495, 0x6004].includes(msgId)) {
    h.log(`[duelo] 0x${msgId.toString(16).padStart(4, "0")} ${hx(data)}`);
    return;
  }
  h.base(c, msgId, param, data);
}
