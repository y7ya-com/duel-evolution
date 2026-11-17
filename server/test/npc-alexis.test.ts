import { existsSync } from "node:fs";
import { join } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { createNodeDuelCore, ENGINE_DATA_DIR } from "../src/duel/engine/node.ts";
import type { DuelCore } from "../src/duel/engine/core.ts";
import { play, msgs, npcActivated, leftField } from "./npcScenario.ts";

describe.skipIf(!existsSync(join(ENGINE_DATA_DIR, "scripts.pack")))("Alexis's tactical decisions", () => {
  let dc: DuelCore;
  beforeAll(async () => { dc = await createNodeDuelCore(); }, 60_000);

  it.each([66, 67])("summons Gymnast to remove an attacker instead of setting it at stage %i (725/1101)", npcId => {
    const p = play(dc, { npcId, first: "player", turns: 2,
      npc: { hand: ["Cyber Gymnast", "Warrior Lady of the Wasteland"] },
      player: { mzone: ["Wulf, Lightsworn Beast"] } });
    expect(msgs(p, "SUMMONING", "Cyber Gymnast")).toHaveLength(1);
    expect(npcActivated(p, "Cyber Gymnast")).toBe(true);
    expect(leftField(p, "Wulf, Lightsworn Beast")).toBe(true);
  });

  it("does not expose Gymnast for removal when it has nothing left to discard", () => {
    const p = play(dc, { npcId: 67, first: "npc", turns: 1,
      npc: { deck: [...Array(16).fill("Reckless Greed"), "Cyber Gymnast"] },
      player: { mzone: ["Wulf, Lightsworn Beast"] } });
    expect(npcActivated(p, "Cyber Gymnast")).toBe(false);
    expect(msgs(p, "SUMMONING", "Cyber Gymnast")).toHaveLength(0);
  });

  it("uses Command Knight's team boost to win the battle", () => {
    const p = play(dc, { npcId: 67, first: "player", turns: 2,
      npc: { mzone: ["Warrior Lady of the Wasteland"], hand: ["Command Knight"] },
      player: { mzone: ["Mystic Tomato"], lp: 1700 } });
    expect(msgs(p, "SUMMONING", "Command Knight")).toHaveLength(1);
    expect(leftField(p, "Mystic Tomato")).toBe(true);
    expect(p.end?.winner).toBe(1);
  });
  it.each([false, true])("does not spend Gymnast's discard into Skill Drain: already face-up %s", up => {
    const p = play(dc, { npcId: 67, first: "player", turns: 2,
      npc: { hand: up ? ["Warrior Lady of the Wasteland"] : ["Cyber Gymnast", "Warrior Lady of the Wasteland"],
        mzone: up ? ["Cyber Gymnast"] : [] },
      player: { mzone: ["Wulf, Lightsworn Beast"], szone: [["Skill Drain", "up"]] } });
    expect(npcActivated(p, "Cyber Gymnast")).toBe(false);
    expect(leftField(p, "Wulf, Lightsworn Beast")).toBe(false);
  });

  it("does not plan a Command Knight team boost through Skill Drain", () => {
    const p = play(dc, { npcId: 67, first: "player", turns: 2,
      npc: { mzone: ["Warrior Lady of the Wasteland"], hand: ["Command Knight"] },
      player: { mzone: ["Mystic Tomato"], szone: [["Skill Drain", "up"]], lp: 1700 } });
    expect(msgs(p, "SUMMONING", "Command Knight")).toHaveLength(0);
    expect(p.end?.winner).not.toBe(1);
  });

  it("Advanced Ritual Art prepares Norleras's missing graveyard materials", () => {
    const p = play(dc, { npcId: 68, first: "player", turns: 2,
      npc: { lp: 1800, hand: ["Advanced Ritual Art", "Demise, King of Armageddon", "Sky Scourge Norleras"],
        grave: ["Manju of the Ten Thousand Hands", "Archfiend Soldier"],
        deck: ["Dunames Dark Witch", "Dunames Dark Witch", "Zure, Knight of Dark World", "Zure, Knight of Dark World", ...Array(16).fill("Mirror Force")] },
      player: { mzone: ["Blue-Eyes White Dragon"], hand: ["Reckless Greed", "Reckless Greed"] } });
    expect(msgs(p, "SPSUMMONING", "Sky Scourge Norleras")).toHaveLength(1);
    expect(npcActivated(p, "Sky Scourge Norleras")).toBe(true);
    expect(leftField(p, "Blue-Eyes White Dragon")).toBe(true);
  });

});
