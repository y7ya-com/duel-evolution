// Master Duel keys mapped to our existing boosters (normal 5-card odds, not MD's 8-card mixed pool).
import DATA from "../../gamedata/shop.json";
import type { Game } from "./game.ts";
import * as PP from "./persist.ts";
import { cardRarity } from "./card-rarity.ts";
import { boundOf } from "./starter.ts";
import { SHARDS } from "./shards-config.ts";
const pools = DATA.iid as Record<string, number[]>;
export const SECRET_BOOSTERS = Object.keys(pools).map(Number).filter((id) => id > 0 && id < 1000);
export const SECRET_WINDOW_S = 86400;
/** Unix seconds, like Game.clock.time(). Expired keys are omitted; permanent free-claim markers remain. */
export function secretUnlocked(p: PP.P, now: number): Record<string, number> {
  if (!SHARDS.secretPacks) return {};
  return Object.fromEntries(Object.entries(p.secret_packs?.unlocked ?? {}).filter(([id, end]) => SECRET_BOOSTERS.includes(Number(id)) && Number(end) > now)) as Record<string, number>;
}
/** Native and HTML buy validation must BOTH use this for every booster. In-rotation products stay available. */
export function secretPackAvailable(p: PP.P, packId: number, inRotation: boolean, now: number): boolean {
  return inRotation || !!secretUnlocked(p, now)[packId];
}
export type SecretSource = "craft" | "booster" | "beginner" | "structure" | "prize" | "trade" | "free";
/** Call inside the purchase/craft transaction AFTER granting cards and BEFORE saving. Only paid booster pulls
 * and crafts produce keys. One free pack per booster per character, on its first craft key (not first pull key).
 * Free output is immediately delivered and bound; it never produces more keys. */
export function secretObtained(g: Game, p: PP.P, cards: readonly number[], source: SecretSource) {
  const unlocked: number[] = [], freePacks: { packId: number; cards: number[] }[] = [];
  if (!SHARDS.secretPacks || (source !== "craft" && source !== "booster")) return { unlocked, freePacks };
  const keys = cards.filter((pc) => cardRarity(pc) === "SR" || cardRarity(pc) === "UR");
  if (!keys.length) return { unlocked, freePacks };
  const state = p.secret_packs ??= { unlocked: {}, freeClaimed: {} };
  for (const id of SECRET_BOOSTERS) {
    if (!keys.some((pc) => pools[id].includes(pc))) continue;
    state.unlocked[id] = Math.floor(g.clock.time()) + SECRET_WINDOW_S;
    unlocked.push(id);
    if (source === "craft" && !state.freeClaimed[id]) {
      state.freeClaimed[id] = true;
      boundOf(p); // migrate any pre-ledger starter before introducing a new binding ledger
      const drawn = g.shopPurchase(1, id, 1).map(([, pc]) => pc);
      PP.trunkAdd(g, p, drawn, 1, `secret free pack ${id}`); PP.bindCards(p, drawn);
      freePacks.push({ packId: id, cards: drawn });
    }
  }
  return { unlocked, freePacks };
}
