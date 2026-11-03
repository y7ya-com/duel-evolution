import { describe, expect, it } from "vitest";
import { cardRarity, cardRarityCatalog, cardInternalId, cardPasscode } from "../src/game/card-rarity.ts";
import GD from "../gamedata/persist.json";
import { DECK_CARDS } from "../src/duel/data.ts";

describe("canonical card trading rarity", () => {
  it("covers every playable native card without pretending tokens are Common", () => {
    const missing = GD.valid_cards.filter((pc) => DECK_CARDS[String(pc)]?.[0] !== 20 && !cardRarity(pc));
    expect(missing).toEqual([]);
    expect(cardRarity(12958920)).toBeNull(); // Cannonball token has no collectible rarity.
    expect(cardRarity(123456789)).toBeNull();
  });
  it("keeps passcodes distinct from native card IDs and labels high-tier prizes explicitly", () => {
    const pc = 89631139, id = cardInternalId(pc)!;
    expect(id).toBeGreaterThan(0); expect(id).not.toBe(pc);
    expect(cardPasscode(id)).toBe(pc);
    expect(cardRarity(pc)).toBe("UR");
    for (let i = 501000000; i <= 501000007; i++) expect(cardRarity(i)).toBe("UR");
    const out = cardRarityCatalog() as any;
    expect(out.byInternalId[id]).toBe(out.byPasscode[pc]);
    expect(out.labels.SR).toBe("Super Rare");
    expect(JSON.stringify(out)).not.toContain("accounts");
  });
});
