import { describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import CARDS from "../gamedata/cards.json";
import DUEL from "../gamedata/duel.json";
import SHOP from "../gamedata/shop.json";
import DATA from "../data/card-rarities.json";
import PICKS from "../scripts/card-rarity-picks.json";
import { cardRarity, cardRarityCatalog } from "../src/game/card-rarity.ts";
const table = DATA.rarity as Record<string, string>;
const duel = DUEL.cards as unknown as Record<string, [number, number, string]>;
const named = (name: string) => CARDS.filter(c => c.name === name);
describe("competitive-era rarity generation", () => {
  it("reproduces the complete table, documentation and pack spreads offline", () => {
    expect(execFileSync(process.execPath, [fileURLToPath(new URL("../scripts/generate-card-rarities.mjs", import.meta.url)), "--check"], { encoding: "utf8" })).toContain("table and documentation verified");
    expect(Object.keys(table)).toHaveLength(CARDS.length);
    expect(DATA.version).toBe("de-meta-2008-v1");
    expect(DATA.nonCollectible).toEqual(CARDS.filter(c => duel[String(c.pc)][0] === 20).map(c => c.pc).sort((a,b)=>a-b));
    const picks = new Map(PICKS.picks.map(p => [p.passcode, p]));
    for (const card of CARDS) {
      const pick = picks.get(card.pc);
      expect(table[card.pc], card.name ?? String(card.pc)).toBe(pick?.tier ?? "N");
      if (pick) { expect(pick.reason.trim().length).toBeGreaterThan(10); expect(pick.group.trim().length).toBeGreaterThan(0); }
      if (duel[String(card.pc)][0] === 20) expect(cardRarity(card.pc)).toBeNull();
      else expect(cardRarity(card.pc)).toBe(table[card.pc]);
    }
    expect(new Set(Object.values(table))).toEqual(new Set(["N", "R", "SR", "UR"]));
  });
  it("rewards era staples and iconic bosses without adding absent later engines", () => {
    for (const name of ["Pot of Greed", "Chaos Sorcerer", "Dark Armed Dragon", "Cyber Dragon", "Caius the Shadow Monarch", "Raiza the Storm Monarch", "Green Gadget", "Red Gadget", "Yellow Gadget", "Gladiator Beast Gyzarus", "Judgment Dragon", "Destiny HERO - Disk Commander", "Dark Magician", "Obelisk the Tormentor", "Slifer the Sky Dragon", "The Winged Dragon of Ra"]) {
      expect(named(name).length, name).toBeGreaterThan(0);
      for (const c of named(name)) expect(cardRarity(c.pc), name).toBe("UR");
    }
    for (const name of ["D.D. Crow", "Pulling the Rug", "Light-Imprisoning Mirror", "Shadow-Imprisoning Mirror", "Cipher Soldier", "Beckoning Light", "Cold Wave"]) {
      expect(named(name).length, name).toBeGreaterThan(0);
      for (const c of named(name)) expect(cardRarity(c.pc), name).toBe("SR");
    }
    expect(cardRarity(67105242)).toBe("N");
    expect(cardRarity(19028307)).toBe("R");
    for (const name of ["Emergency Teleport", "Krebons", "Stardust Dragon", "Dragunity Dux"]) expect(named(name)).toEqual([]);
    expect((cardRarityCatalog() as any).labels).toEqual({ N: "Normal", R: "Rare", SR: "Super Rare", UR: "Ultra Rare" });
  });
  it("keeps alternate passcodes consistent and pack members collectible", () => {
    const tiersByName = new Map<string, string>();
    for (const c of CARDS) if (c.name && !DATA.nonCollectible.includes(c.pc)) {
      const prior = tiersByName.get(c.name);
      if (prior) expect(table[c.pc], c.name).toBe(prior);
      tiersByName.set(c.name, table[c.pc]);
    }
    for (const [id,pool] of Object.entries(SHOP.iid)) {
      for (const pc of pool) expect(cardRarity(pc), `pack ${id}: ${pc}`).not.toBeNull();
      expect(pool.some(pc => cardRarity(pc) !== "N"), `pack ${id} needs R+`).toBe(true);
    }
  });
});
