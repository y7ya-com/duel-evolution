// py research/npcreglas/proposal.py: the NPC duel with the official 2008 rules (NPC_RULES_2008: no_record, card,
// friendship and famous_decks on; npc_window off), with research/mundo's prizes for the DC08 originals ("prizes" on).
// install() in py wraps duelfin's npc_duel_end / lobby_after_duel_msgs and persistence's npc_rewards / check_titles /
// rights_due; here duelfin.ts calls these wrapped versions directly and persist.ts reads NR_CTX.
import * as PP from "../game/persist.ts";
import type { Game } from "../game/game.ts";
import { nrChainBase, nrMidB3, nrThreshold, ORIGINALS } from "../game/npcs.ts";
import { NPC_DECKS } from "./data.ts";

type P = Record<string, any>; // a profile, py shape

/** py mundo/npc.py NPC_RULES_2008 */
export const NPC_RULES_2008 = { no_record: true, card: true, friendship: true, famous_decks: true, npc_window: false };
export type NrFlags = typeof NPC_RULES_2008;
export const npcRule = (k: keyof NrFlags): boolean => !!NPC_RULES_2008[k];

export const CARD_PACKS = Array.from({ length: 10 }, (_, i) => i + 1);
const CARD_DUE_MAX = 5;
const WIN_PTS = 1, LOSS_PTS = 0, DRAW_PTS = 0;
/** + research/mundo COUNT_ALL_DUELS (dancer, raMon) */
const COUNT_ALL_DUELS = new Set([27, 44]);
const FAN_WINS = 200, DEFEAT_LOSSES = 20, PRESENT = 1;
/** npcreglas MID_CARDS (passcodes) + research/mundo _sync_prizes (setdefault of each original's 5-win card) */
const MID_CARDS: Record<number, number[]> = {
  51: [16589042], 52: [78193831], 53: [75347539], 54: [14898066], 55: [13756293], 56: [53839837], 57: [68007326], 58: [20951752], 59: [56433456],
  60: [33875961], 61: [25366484], 62: [89943723], 63: [84243274], 64: [73879377], 65: [90140980], 66: [11460577], 67: [10248389], 68: [46052429],
  69: [74677422], 70: [77585513], 71: [74137509], 72: [95326659], 73: [34487429], 74: [7093411], 78: [1546123], 79: [40418351], 80: [64599569],
  81: [28933734], 82: [41442341], 83: [97642679], 84: [41436536], 85: [13093792], 86: [17132130], 17: [93130021], 43: [99414168], 26: [61370518],
};
for (const [nid, [, , card]] of Object.entries(ORIGINALS)) MID_CARDS[+nid] ??= [card];

function newB3(old: number, result: string, nid: number): number {
  let pts = result === "win" ? WIN_PTS : result === "lose" ? LOSS_PTS : DRAW_PTS;
  if (COUNT_ALL_DUELS.has(nid)) pts = Math.max(pts, 1);
  return Math.min(Math.max(old, 1) + pts, 255);
}

function totals(p: P, nid: number): [number, number] {
  const base = nrChainBase(nid);
  const ids = base !== null ? [base, base + 1, base + 2] : [nid];
  const es = ids.map((i) => PP.npcbinGet(p, i));
  return [es.reduce((a, e) => a + e[0], 0), es.reduce((a, e) => a + e[1], 0)];
}

function rewards(p: P, nid: number, oldB3: number, b3: number, result: string): [number[], number[]] {
  const pb = PP.NPC_PRIZE_BITS[String(nid)] ?? {};
  const bits: number[] = [], cards: number[] = [];
  if (oldB3 < nrMidB3(nid) && nrMidB3(nid) <= b3) {
    if ("mid_got" in pb) bits.push(pb.mid_got);
    cards.push(...(MID_CARDS[nid] ?? []));
  }
  const base = nrChainBase(nid);
  const name = base !== null ? PP.FAMOUS_BASE[base] : undefined;
  if (oldB3 < nrThreshold(nid) && nrThreshold(nid) <= b3) {
    if ("comp_got" in pb) bits.push(pb.comp_got);
    if (name && nid === base! + 2) {
      if (name in PP.TITLE_BITS) bits.push(PP.TITLE_BITS[name][0]);
      bits.push(...PP.presentClothes(name));
    }
  }
  if (name && name in PP.TITLE_BITS) {
    const [w, l] = totals(p, nid);
    if (result === "win" && w >= FAN_WINS) bits.push(PP.TITLE_BITS[name][2]);
    if (result === "lose" && l >= DEFEAT_LOSSES) bits.push(PP.TITLE_BITS[name][1]);
  }
  const out: number[] = [];
  for (const b of bits) if (!out.includes(b) && !PP.pbinTest(p, b)) out.push(b);
  return [out, cards];
}

function applyFriendship(g: Game, p: P, nid: number, result: string, oldEntry: number[]): P | null {
  const e = PP.npcbinGet(p, nid);
  const old = PP.int(oldEntry[3]);
  e[3] = newB3(old, result, nid);
  PP.npcbinSet(p, nid, e);
  const [bits, cards] = rewards(p, nid, Math.max(old, 1), e[3], result);
  const pkg = bits.length || cards.length ? PP.pendingAdd(g, p, bits, cards, PP.VIA_NPC, `NPC ${nid} b3 ${old}->${e[3]}`) : null;
  (p.last_npc_end ??= {}).present = pkg ? PRESENT : 0;
  return pkg;
}

/** py npcreglas deck_npc: the recipe the famous NPC plays with (its current level), or nid. */
export function deckNpc(nid: number, npcbinGet: (i: number) => number[]): number {
  const base = nrChainBase(nid);
  if (base === null || nid !== base) return nid;
  let lvl = 0;
  while (lvl < 2 && PP.int(npcbinGet(base + lvl)[3]) >= nrThreshold(base + lvl)) lvl++;
  const d = NPC_DECKS[String(base + lvl)];
  return d && d.main && d.main.length ? base + lvl : nid;
}

/** duelfin npc_duel_end as npcreglas wraps it. base = duelfin's own (persistence + the NPCBIN b1/b2 fix). */
export function nrNpcDuelEnd(g: Game, base: (p: P, npc: number, result: string, turns: number, lpLeft: number) => Uint8Array,
  p: P, npc0: number, result: string, turns = 0, lpLeft = 0): Uint8Array {
  const f = NPC_RULES_2008;
  if (!(f.no_record || f.friendship)) return base(p, npc0, result, turns, lpLeft);
  const npc = PP.int(npc0 || 0);
  const valid = npc > 0 && npc < PP.NPCBIN_MAX;
  const recBefore = structuredClone(p.rec ?? {});
  const eBefore = valid ? PP.npcbinGet(p, npc) : [0, 0, 0, 0];
  PP.NR_CTX.on = f;
  try { base(p, npc, result, turns, lpLeft); } finally { PP.NR_CTX.on = null; }
  if (f.no_record) p.rec = recBefore;
  if (f.friendship && valid) {
    const pkg = applyFriendship(g, p, npc, result, eBefore);
    if (pkg) g.log(`[npcreglas] NPC ${npc}: regalo ${JSON.stringify(pkg.bits)} cartas ${JSON.stringify(pkg.cards)}`);
  }
  return PP.playerDataUpdate(p, valid ? npc : null);
}

/** duelfin lobby_after_duel_msgs as npcreglas wraps it (card: one pack offered; friendship: 0x4237 present). */
export function nrLobbyAfterDuel(g: Game, base: (packs: number[]) => [number, Uint8Array][], p: P, present: number | null,
  packs: number[], presentMsg: (kind: number) => Uint8Array): [number, Uint8Array][] {
  const f = NPC_RULES_2008;
  if (f.card && !packs.length) {
    const pack = g.rng.choice(CARD_PACKS);
    const due: number[] = (p.npc_card_due ??= []);
    due.push(pack);
    due.splice(0, Math.max(0, due.length - CARD_DUE_MAX));
    packs = [pack];
  }
  const out = base(packs);
  if (f.friendship && present === null) {
    const pr = PP.takePresent(p);
    if (pr) {
      let at = out.findIndex(([m]) => m === 0x4800);
      if (at < 0) at = out.length;
      out.splice(at, 0, [0x4237, presentMsg(pr)]);
    }
  }
  return out;
}
