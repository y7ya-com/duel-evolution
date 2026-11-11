import { describe, expect, it } from "vitest";
import { cardRarity, cardRarityCatalog, cardInternalId, cardPasscode } from "../src/game/card-rarity.ts";
import GD from "../gamedata/persist.json";
import { DECK_CARDS } from "../src/duel/data.ts";

describe("canonical card trading rarity", () => {
  it("covers every playable native card without assigning collectible tiers to tokens", () => {
    const missing = GD.valid_cards.filter((pc) => DECK_CARDS[String(pc)]?.[0] !== 20 && !cardRarity(pc));
    expect(missing).toEqual([]);
    expect(cardRarity(12958920)).toBeNull(); // Skyblaster token has no collectible rarity.
    expect(cardRarity(123456789)).toBeNull();
  });
  it("maps passcodes to the client's card ids (cards.json), the ids its pictures use", () => {
    expect(cardInternalId(12580477)).toBe(345);   // Raigeki (translator wire order would give 430, Suijin's picture)
    expect(cardPasscode(345)).toBe(12580477);
    expect(cardInternalId(98434877)).toBe(430);   // Suijin
  });
  it("keeps passcodes distinct from native card IDs and labels high-tier prizes explicitly", () => {
    const pc = 89631139, id = cardInternalId(pc)!;
    expect(id).toBeGreaterThan(0); expect(id).not.toBe(pc);
    expect(cardPasscode(id)).toBe(pc);
    expect(cardRarity(pc)).toBe("UR");
    for (let i = 501000000; i <= 501000007; i++) expect(cardRarity(i)).toBe("UR");
    const out = cardRarityCatalog() as any;
    expect(out.byInternalId[id]).toBe(out.byPasscode[pc]);
    expect(out.labels.N).toBe("Normal");
    expect(out.labels.C).toBeUndefined();
    expect(out.byPasscode[12958920]).toBeUndefined();
    expect(out.labels.SR).toBe("Super Rare");
    expect(JSON.stringify(out)).not.toContain("accounts");
  });
});
