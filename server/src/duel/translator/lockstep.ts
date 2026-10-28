// What the translator imports from py research/lockstep/proposal.py (0x6202 DUEL_SETCOMMAND builders, 0x6611/0x6612
// COMID masks, 0x6461) plus research/duelfin/proposal.py surrender_masks, which yo2srv/arranque.py wraps around the
// translator's comid_field at startup («Rendirse» in the deck's action menu).
import { W } from "../../net/proto.ts";

// --- 0x6202 entry types (FUN_00721020)
export const T_ENGINE = 0x00, T_SYNC = 0x11, T_REQUEST = 0x1a, T_VIEW = 0x1b, T_VIEW1C = 0x1c, T_SETCARDID = 0x1d;
export const T_SETVAR16 = 0x1e, T_SETPAIR = 0x1f, T_SETCARD = 0x40, T_BATTLESEL = 0x47, T_SHUFFLE2 = 0x48;
export const T_RESET = 0x49, T_PING = 0x4a, T_FINISH = 0x4d, T_LIST_RESET = 0x60, T_LIST_ADD = 0x61;
export const T_CHAIN_CLEAR = 0x62, T_CHAIN_SET = 0x63;
// --- engine commands (type 0)
export const C_DUEL_START = 0x01, C_TURN_CHANGE = 0x04, C_DUEL_END = 0x05;
export const C_PHASE = [0x0c, 0x0d, 0x0e, 0x0f, 0x10] as const;
export const C_LP_FLAG = 0x09, C_BATTLE_INIT = 0x15, C_SUMMON = 0x2d, C_SHUFFLE = 0x54, C_DRAW = 0x55;
export const ZONE_HAND = 0x0b, ZONE_EXTRA = 0x0c, ZONE_DECK = 0x0d, ZONE_GRAVE = 0x0e, ZONE_BANISH = 0x0f;
// --- COMID mask bits (= the command that comes back in 0x6350)
export const CMD_ATTACK = 0, CMD_LOOK = 1, CMD_SPSUMMON = 2, CMD_ACTIVATE = 3, CMD_SUMMON = 4;
export const CMD_FLIP = 5, CMD_SET = 6, CMD_SET_ST = 7, CMD_TO_ATK = 8, CMD_TO_DEF = 9, CMD_SURRENDER = 10;
export const CMD_DIRECT = 11, CMD_DRAW = 12, CMD_SHUFFLE = 13;
export const CMD_PICK = CMD_DIRECT, CMD_GENERIC = CMD_PICK;
export const PH_BATTLE = 3, PH_MAIN2 = 4, PH_END = 5;

/** DUEL_SETCOMMAND 0x6202: u32 type, u32 B, 8 x u32 P = 40 bytes. */
export function setcommand(kind: number, b = 0, params: readonly number[] = []): Uint8Array {
  const w = new W().u32(kind).u32(b);
  for (let i = 0; i < 8; i++) w.u32(i < params.length ? params[i] : 0);
  return w.bytes();
}

/** Type 0: engine command. B = (player<<15) | id; P0..P2 truncated to u16. */
export function engine(cmd: number, player = 0, p0 = 0, p1 = 0, p2 = 0): Uint8Array {
  return setcommand(T_ENGINE, ((player & 1) << 15) | (cmd & 0xfff), [p0 & 0xffff, p1 & 0xffff, p2 & 0xffff]);
}

export function request_input(kind: number, clear_list = 1, p2 = 0): Uint8Array {
  return setcommand(T_REQUEST, 0, [kind, clear_list, p2]);
}

export function set_card(player: number, zone: number, index: number, card: number, serial: number, owner?: number | null): Uint8Array {
  const o = owner == null ? player : owner;
  return setcommand(T_SETCARD, 0, [player & 1, zone, index, card & 0xffff, serial & 0xff, o & 1]);
}

export function duel_finish(p0 = 0, p1 = 0): Uint8Array {
  return setcommand(T_FINISH, 0, [p0, p1]);
}

/** Packed location (stFrom/stTo): bit0 player, bits1-5 zone/slot, bit14 face, bit15 position. */
export function loc(player: number, slot: number, face = 0, pos = 0): number {
  return (player & 1) | ((slot & 0x1f) << 1) | ((face & 1) << 14) | ((pos & 1) << 15);
}

/** Masks keyed "player,zone" (py tuple keys). */
export type Masks = Map<string, number>;
export const mk = (p: number, z: number): string => `${p},${z}`;

/** ONLINE_COMID_FIELD 0x6611: per player, zones 0..15 except 11 -> u16 mask + u8 reason; then 10 x u8. */
export function comid_field_raw(masks?: Masks | null, extra?: Masks | null, tail?: Masks | null): Uint8Array {
  const w = new W();
  for (const p of [0, 1]) {
    for (let z = 0; z < 16; z++) {
      if (z === 11) continue;
      w.u16(masks?.get(mk(p, z)) ?? 0).u8(extra?.has(mk(p, z)) ? extra.get(mk(p, z))! : 0xff);
    }
    for (let k = 0; k < 10; k++) w.u8(tail?.get(mk(p, k)) ?? 0);
  }
  return w.bytes();
}

/** research/duelfin surrender_masks: «Rendirse» (bit 10) on the player's own DECK. */
export const SURRENDER_BIT = 1 << CMD_SURRENDER;
export function surrender_masks(field_masks?: Masks | null, on_deck = true): Masks {
  const m: Masks = new Map(field_masks ?? []);
  if (on_deck) m.set(mk(0, ZONE_DECK), (m.get(mk(0, ZONE_DECK)) ?? 0) | SURRENDER_BIT);
  return m;
}

/** The translator's comid_field as the server runs it (yo2srv/arranque.py `_tcf` patch). */
export function comid_field(masks?: Masks | null, extra?: Masks | null, tail?: Masks | null): Uint8Array {
  return comid_field_raw(surrender_masks(masks), extra, tail);
}

/** ONLINE_COMID_HAND 0x6612: u16 n; n x (u8 player, u16 hand index, u16 mask); then 2 x (u8 player, u8 n, n x u8). */
export function comid_hand(entries: readonly (readonly [number, number, number])[],
  lists: readonly (readonly [number, readonly number[]])[] = [[0, []], [1, []]]): Uint8Array {
  const w = new W().u16(entries.length);
  for (const [p, idx, mask] of entries) w.u8(p).u16(idx).u16(mask);
  for (const [p, vals] of lists) {
    w.u8(p).u8(vals.length);
    for (const v of vals) w.u8(v);
  }
  return w.bytes();
}

/** DUEL_TIMEUP_WARNING 0x6461: u8 who, s32 seconds, u8 paused, s32 second value. */
export function timeup_warning(who: number, secs: number, paused = 0, secs2 = -1): Uint8Array {
  return new W().u8(who).u32(secs).u8(paused).u32(secs2).bytes();
}
