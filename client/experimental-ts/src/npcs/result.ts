import { decodeCommands } from '../duel/decode';
import type { DuelState, WireMessage } from '../duel/types';

export type NpcResultCategory = 0 | 1 | 2 | 3;
export interface NpcResultContext {
  readonly result: 1 | 2 | 3 | null;
  /** Native persistent presentation category, NOT type0x4d finish mode. */
  readonly category: NpcResultCategory | null;
  /** One-based displayed turn: native engine turn counter +1, as DuelState.turn. */
  readonly turn: number | null;
  /** Terminal displayed LP in client/NPC order. Missing observations stay null. */
  readonly lp: readonly [number | null, number | null];
  readonly deck: readonly [number | null, number | null];
  /** Raw native C_DUEL_END reason pair, retained without English reinterpretation. */
  readonly reasons: readonly [number | null, number | null];
  readonly finishMode: number | null;
  /** Only authoritative type0x4d completion permits an opening line. */
  readonly complete: boolean;
}
/** Fresh process's native zero-filled global. Use null after a missing stream prefix;
 * carry the category across duels, as the original global does. */
export function createNpcResultContext(category: NpcResultCategory | null = 0): NpcResultContext {
  return { result: null, category, turn: null, lp: [null, null], deck: [null, null], reasons: [null, null], finishMode: null, complete: false };
}
function specialReason(category: NpcResultCategory | null, reason: number): NpcResultCategory | null {
  // View3b's jump table0x00741d08: reasons3/9 share category1;7/10 category3.
  return reason === 3 || reason === 9 ? 1 : reason === 7 || reason === 10 ? 3 : category;
}
function pieceCategory(category: NpcResultCategory | null, flags: number): NpcResultCategory | null {
  // View3c at0x00740d44: high byte zero and low byte4 assign category2.
  return ((flags >>> 8) & 255) === 0 && (flags & 255) === 4 ? 2 : category;
}

/** Pure observer called AFTER reduceDuelMessage for each actual inbound duel packet.
 * Keeps only scalar terminal context. Raw command/type distinctions matter:
 * the board model's result.mode alone cannot recover both reasons and finish mode.
 * It never derives the winner from LP/decks, and never reads server-private state. */
export function reduceNpcResultContext(previous: NpcResultContext, state: DuelState, message: WireMessage): NpcResultContext {
  if (message.id !== 0x6202) return previous;
  const records = decodeCommands(message.data);
  let context = previous;
  let category = previous.category;
  let absoluteLp: [boolean, boolean] = [previous.lp[0] !== null, previous.lp[1] !== null];
  let changed = false;
  for (const record of records) {
    const p = record.params, cmd = record.b & 0xfff, player = ((record.b >>> 15) & 1) as 0 | 1;
    if (record.kind === 0 && cmd === 1) {
      context = createNpcResultContext(category); absoluteLp = [true, true]; changed = true;
    }
    if (context.complete) continue;
    if (record.kind === 0) {
      if ([0x23, 0x26].includes(cmd)) absoluteLp[player] = true;
      if (cmd === 0x5f) category = pieceCategory(category, p[0]);
      if (cmd === 5) {
        category = specialReason(category, p[p[0] === 2 ? 2 : 1]);
        context = { ...context, reasons: [p[1], p[2]] }; changed = true;
      }
    } else if (record.kind === 0x1b) {
      if (record.b === 0x3b) category = specialReason(category, p[1]);
      if (record.b === 0x3c) category = pieceCategory(category, p[2]);
    } else if (record.kind === 0x4d) {
      const result = p[0] === 1 || p[0] === 2 || p[0] === 3 ? p[0] : null;
      context = { ...context, result, finishMode: p[1], complete: result !== null }; changed = true;
    }
  }
  if (previous.complete && !changed) return previous;
  const lp = [0, 1].map(p => absoluteLp[p] ? state.sides[p].lp : null) as [number | null, number | null];
  const deck = [0, 1].map(p => context.deck[p] !== null || state.sides[p].deck.length > 0 ? state.sides[p].deck.length : null) as [number | null, number | null];
  return { ...context, category, turn: state.turn > 0 ? state.turn : null, lp, deck };
}

function known(n: number | null): n is number { return n !== null && Number.isSafeInteger(n) && n >= 0 && n <= 0x7fffffff; }
/** The snapshot is the LP gauge value (CDuelScene+0xa9c+side*0x44, +0x28), which 0x007cef90 clamps at zero;
 * a wire u32 with the sign bit set reads as negative there. */
function gauge(lp: number | null): number | null { return lp !== null && Number.isSafeInteger(lp) && lp > 0x7fffffff && lp <= 0xffffffff ? 0 : lp; }
function normalWin(lp: number | null): number | null { return !known(lp) ? null : lp >= 5000 ? 64 : lp < 1000 ? 54 : 59; }
function normalLoss(lp: number | null): number | null { return !known(lp) ? null : lp >= 5000 ? 34 : lp < 1000 ? 44 : 39; }

/** Exact branch ordering/thresholds of native duelResultLine0x007918c0.
 * Returns a private catalog line index, never proprietary wording or a local outcome.
 * Unknown inputs required by the selected branch stay explicitly unavailable. */
export function npcResultLine(context: NpcResultContext): number | null {
  if (!context.complete) return null;
  const { result, category, turn, deck } = context, lp = [gauge(context.lp[0]), gauge(context.lp[1])] as const;
  if (result === 3) return 49;
  if (result !== 1 && result !== 2 || category === null) return null;
  if (category === 1) return result === 1 ? normalWin(lp[0]) : normalLoss(lp[1]);
  if (category === 2) {
    if (!known(turn) || turn < 1) return null;
    if (turn <= 10) return result === 1 ? 64 : 34;
    if (result === 1) return !known(lp[0]) ? null : lp[0] < 2000 ? 54 : 59;
    return !known(lp[1]) ? null : lp[1] < 2000 ? 44 : 39;
  }
  if (category === 3) {
    if (!known(turn) || turn < 1) return null;
    if (turn <= 25) return result === 1 ? 64 : 34;
    // Original loss branch also reads client LP (ECX), not NPC LP (EDX).
    return !known(lp[0]) ? null : result === 1 ? lp[0] < 1000 ? 54 : 59 : lp[0] < 1000 ? 44 : 39;
  }
  if (category !== 0) return null;
  if (result === 1) {
    if (!known(deck[1])) return null;
    if (deck[1] !== 0) return normalWin(lp[0]);
    if (!known(deck[0])) return null;
    if (deck[0] < 10) return 54;
    return !known(lp[0]) ? null : lp[0] >= 3000 ? 64 : 59;
  }
  if (!known(deck[0])) return null;
  if (deck[0] !== 0) return normalLoss(lp[1]);
  if (!known(deck[1])) return null;
  if (deck[1] < 10) return 44;
  return !known(lp[1]) ? null : lp[1] >= 3000 ? 34 : 39;
}
