// Optional cosmetic unlocks on NPC victories, separate from fixed friendship prizes.
import type { Game } from "../game/game.ts";
import * as PP from "../game/persist.ts";
import { COSMETIC_BY_ID } from "../game/cosmetics-catalog.ts";
import { nrChainBase } from "../game/npcs.ts";

export const NPC_WIN_DROPS: Readonly<Record<number, { item: string; chance: number }>> = {
  78: { item: "outfit:kaiser", chance: 0.05 },
};

/** One server roll per eligible victory. Ownership is set by pendingAdd immediately, so an unclaimed
 * gift or a later duel cannot award the same unlock again. Grant every existing body variant. */
export function npcWinDrop(g: Game, p: PP.P, nid: number, result: string): number[] {
  if (result !== "win") return [];
  const drop = NPC_WIN_DROPS[nrChainBase(nid) ?? nid];
  const item = drop && COSMETIC_BY_ID.get(drop.item);
  if (!item || item.variants.some(v => PP.pbinTest(p, v.bit))) return [];
  return g.rng.random() < drop.chance ? item.variants.map(v => v.bit) : [];
}
