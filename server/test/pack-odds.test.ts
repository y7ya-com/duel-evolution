import { describe, expect, it } from "vitest";
import { packContents, packRarityDistribution, PACK_RARITIES, shopPurchase } from "../src/game/shop.ts";
import { cardRarity } from "../src/game/card-rarity.ts";
import { PyRandom } from "../src/util/pyrandom.ts";
import type { Game } from "../src/game/game.ts";

describe("rarity-weighted packs", () => {
  it("matches both slot distributions with a seeded RNG and never gives N in slot five", () => {
    const g = { rng: new PyRandom(7281) } as Game;
    const counts = [{ N: 0, R: 0, SR: 0, UR: 0 }, { N: 0, R: 0, SR: 0, UR: 0 }];
    const pulls = shopPurchase(g, 1, 1, 20000);
    expect(pulls).toHaveLength(100000);
    pulls.forEach(([, pc], i) => counts[i % 5 === 4 ? 1 : 0][cardRarity(pc) ?? "N"]++);
    const expected = [{ N: .70, R: .25, SR: .04, UR: .01 }, { N: 0, R: .75, SR: .20, UR: .05 }];
    for (let slot = 0; slot < 2; slot++) for (const r of PACK_RARITIES)
      expect(Math.abs(counts[slot][r] / (slot ? 20000 : 80000) - expected[slot][r])).toBeLessThan(.012);
    expect(counts[1].N).toBe(0);
  });
  it("renormalises missing tiers and treats unknown rarity as N", () => {
    const real = packRarityDistribution(packContents(1)!.cards);
    const r = real.pool.R[0], sr = real.pool.SR[0];
    const d = packRarityDistribution([r, sr]);
    expect(d.slots[0].odds).toEqual({ R: .25 / .29, SR: .04 / .29 });
    expect(d.slots[1].odds).toEqual({ R: .75 / .95, SR: .20 / .95 });
    const commonOnly = packRarityDistribution([0]);
    expect(commonOnly.pool.N).toEqual([0]);
    expect(commonOnly.slots.map((s) => s.odds)).toEqual([{ N: 1 }, { N: 1 }]);
    expect(packRarityDistribution([sr]).slots[1].odds).toEqual({ SR: 1 });
  });
  it("keeps fixed decks unchanged", () => {
    const deck = packContents(7001)!;
    expect(shopPurchase({ rng: new PyRandom(1) } as Game, 1, 7001, 2).map(([, pc]) => pc)).toEqual([...deck.cards, ...deck.cards]);
  });
});
