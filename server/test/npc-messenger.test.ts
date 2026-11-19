// The NPC against a player's face-up Messenger of Peace (owner, 2026-11-19: "NPCs are confused when I play Messenger
// of Peace"): it plays under the lock (attackers under 1500 ATK) or removes it, as the board warrants. Real engine
// (test/npcScenario.ts).
import { existsSync } from "node:fs";
import { join } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import type { DuelCore, Json } from "../src/duel/engine/core.ts";
import { createNodeDuelCore, ENGINE_DATA_DIR } from "../src/duel/engine/node.ts";
import { code, leftField, msgs, npcActivated, play } from "./npcScenario.ts";

const haveData = existsSync(join(ENGINE_DATA_DIR, "scripts.pack"));
const MESSENGER: [string, "up"] = ["Messenger of Peace", "up"];

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
});
