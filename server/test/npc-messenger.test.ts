// The NPC against a player's face-up Messenger of Peace (owner, 2026-11-19: "NPCs are confused when I play Messenger
// of Peace"): it plays under the lock (attackers under 1500 ATK) or removes it, as the board warrants. Real engine
// (test/npcScenario.ts).
import { existsSync } from "node:fs";
import { join } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import type { DuelCore, Json } from "../src/duel/engine/core.ts";
import { createNodeDuelCore, ENGINE_DATA_DIR } from "../src/duel/engine/node.ts";
import { yugiDrawWeight } from "../src/duel/ai/yugiBrand.ts";
import { code, leftField, msgs, npcActivated, play, type Played } from "./npcScenario.ts";

const haveData = existsSync(join(ENGINE_DATA_DIR, "scripts.pack"));
const MESSENGER: [string, "up"] = ["Messenger of Peace", "up"];
const drawn = (p: Played) => p.npc.filter((d) => d.sel.heart_of_cards === true).map((d) => Number((d.resp as Json | null)?.card));

describe.skipIf(!haveData)("NPC against Messenger of Peace (real engine)", () => {
  let dc: DuelCore;
  beforeAll(async () => { dc = await createNodeDuelCore(); }, 60_000);

  it("summons its 1200 attacker, not the 1700 that cannot attack, and attacks", () => {
    const p = play(dc, {
      npcId: 70, first: "player", turns: 2,
      npc: { hand: ["Neo the Magic Swordsman", "D.D. Warrior"], deck: Array(20).fill("Reckless Greed") },
      player: { szone: [MESSENGER] },
    });
    expect(msgs(p, "SUMMONING", "D.D. Warrior")).toHaveLength(1);
    expect(msgs(p, "SUMMONING", "Neo the Magic Swordsman")).toHaveLength(0);
    expect(msgs(p, "DAMAGE").some((m) => Number(m.player) === 0)).toBe(true);
  });

  it("does not tribute its working 1200 attacker for a 2000 monster Messenger stops", () => {
    const p = play(dc, {
      npcId: 70, first: "player", turns: 2,
      npc: { hand: ["Gene-Warped Warwolf", "Vampire Lord"], mzone: ["D.D. Warrior"], deck: Array(20).fill("Reckless Greed") },
      player: { szone: [MESSENGER] },
    });
    expect(msgs(p, "SUMMONING", "Vampire Lord")).toHaveLength(0);
    expect(leftField(p, "D.D. Warrior")).toBe(false);
  });

  it("Mystical Space Typhoon takes the Messenger that stops its 1800 attacker, not the set card", () => {
    const p = play(dc, {
      npcId: 70, first: "player", turns: 2,
      npc: { hand: ["Mystical Space Typhoon"], mzone: ["Gearfried the Iron Knight"], deck: Array(20).fill("Reckless Greed") },
      player: { szone: [MESSENGER, "Waboku"] },
    });
    expect(npcActivated(p, "Mystical Space Typhoon")).toBe(true);
    expect(leftField(p, "Messenger of Peace")).toBe(true);
  });

  it("Mystical Space Typhoon takes the set card when Messenger stops nothing of its own (control)", () => {
    const p = play(dc, {
      npcId: 70, first: "player", turns: 2,
      npc: { hand: ["Mystical Space Typhoon"], mzone: ["D.D. Warrior"], deck: Array(20).fill("Reckless Greed") },
      player: { szone: [MESSENGER, "Waboku"] },
    });
    expect(leftField(p, "Messenger of Peace")).toBe(false);
  });

  it("De-Spell destroys the Messenger that stops its attacker", () => {
    const p = play(dc, {
      npcId: 70, first: "player", turns: 2,
      npc: { hand: ["De-Spell"], mzone: ["Gearfried the Iron Knight"], deck: Array(20).fill("Reckless Greed") },
      player: { szone: [MESSENGER] },
    });
    expect(npcActivated(p, "De-Spell")).toBe(true);
    expect(leftField(p, "Messenger of Peace")).toBe(true);
  });

  // ---- Yugi (Heart of the Cards: his draw is chosen)
  it("Yugi materialises an attacker under 1400 ATK or De-Spell against Messenger, not a 1500+ monster", () => {
    const pool = ["Neo the Magic Swordsman", "Gemini Elf", "Celtic Guardian", "De-Spell", "Mystical Space Typhoon"].map(code);
    const p = play(dc, { npcId: 53, heart_of_cards: 1, heart_pool: pool, first: "player", turns: 2,
      npc: {}, player: { szone: [MESSENGER] } });
    expect([code("Celtic Guardian"), code("De-Spell")]).toContain(drawn(p)[0]);
  });

  it("Yugi with a 1600+ attacker under Messenger materialises De-Spell, lighter than Mystical Space Typhoon", () => {
    const pool = ["De-Spell", "Mystical Space Typhoon", "Petit Moth"].map(code);
    const p = play(dc, { npcId: 53, heart_of_cards: 1, heart_pool: pool, first: "player", turns: 2,
      npc: { mzone: ["Dark Magician"] }, player: { lp: 2000, szone: [MESSENGER] } });
    expect(drawn(p)[0]).toBe(code("De-Spell"));
  });

  it("De-Spell weighs lighter than Mystical Space Typhoon in Yugi's draws", () => {
    expect(yugiDrawWeight("de-spell")).toBeLessThan(yugiDrawWeight("mystical space typhoon"));
  });
});
