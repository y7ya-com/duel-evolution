// The NPC on the real engine from set positions (test/npcScenario.ts): the misplays of the 2026-11 review of the duels
// the NPCs lost in production (AI revs 19-31, replayed: de-scratch/npc-decks-alltime/review), each with the duel it
// came from and the play that duel needed.
import { existsSync } from "node:fs";
import { join } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import type { DuelCore, Json } from "../src/duel/engine/core.ts";
import { createNodeDuelCore, ENGINE_DATA_DIR } from "../src/duel/engine/node.ts";
import { code, leftField, msgs, npcActivated, passive, play, type Scene } from "./npcScenario.ts";

const haveData = existsSync(join(ENGINE_DATA_DIR, "scripts.pack"));

/** The cards the NPC picked in its SELECT_CARD prompts that offered this card. */
function picked(p: ReturnType<typeof play>, offered: string): number[] {
  const c = code(offered);
  const d = p.npc.find((x) => x.sel.type === "SELECT_CARD" && (x.sel.selects as Json[]).some((s) => s.code === c));
  if (!d) return [];
  return ((d.resp?.indicies as number[] | undefined) ?? []).map((i) => Number((d.sel.selects as Json[])[i]!.code));
}

/** The player answers yes to its own optional effects (D.D. Warrior Lady's banish), else passes. */
function yesToEffects(sel: Json): Json | null {
  if (sel.type === "SELECT_EFFECTYN") return { type: "SELECT_EFFECTYN", yes: true };
  return passive(sel);
}

/** The targets of the NPC's attacks by the monster set up in this zone, by the names the scene set up ("" for a direct
 *  attack), in order (the Duel Log names no card placed by the setup). */
function attacks(p: ReturnType<typeof play>, scene: Scene, npcZone: number): string[] {
  const name = (s: string | [string, string]) => (typeof s === "string" ? s : s[0]);
  return msgs(p, "ATTACK").filter((m) => Number((m.card as Json).controller) === 1 && Number((m.card as Json).sequence) === npcZone)
    .map((m) => { const t = m.target as Json | null | undefined; return t && t.location ? name(scene.player.mzone![Number(t.sequence)]!) : ""; });
}

describe.skipIf(!haveData)("NPC scenarios: production losses (real engine)", () => {
  let dc: DuelCore;
  beforeAll(async () => { dc = await createNodeDuelCore(); }, 60_000);

  it("Raiza's forced trigger returns the opponent's set card, not Raiza (2431)", () => {
    const p = play(dc, {
      npcId: 3, first: "player", turns: 2,
      npc: { hand: ["Brain Control", "Raiza the Storm Monarch"], deck: Array(20).fill("Reckless Greed") },
      player: { mzone: ["Cyber Valley"], szone: ["Call of the Haunted"] },
    });
    expect(npcActivated(p, "Raiza the Storm Monarch")).toBe(true);
    expect(picked(p, "Raiza the Storm Monarch")).toEqual([code("Call of the Haunted")]);
  });

  it("Raiza returns its own cheaper monster, not itself, when nothing of the opponent's is offered (2506)", () => {
    const p = play(dc, {
      npcId: 3, first: "player", turns: 2,
      npc: { hand: ["Brain Control", "Raiza the Storm Monarch"], mzone: [["Marshmallon", "def"]], deck: Array(20).fill("Reckless Greed") },
      player: { mzone: ["Strike Ninja"] },
    });
    expect(npcActivated(p, "Raiza the Storm Monarch")).toBe(true);
    expect(picked(p, "Raiza the Storm Monarch")).toEqual([code("Marshmallon")]);
  });

  // ---- monsters that banish what they battle (D.D. Warrior, D.D. Warrior Lady)
  it("D.D. Warrior attacks the Jinzo it takes with it, not the weak monster it would trade itself for (2553)", () => {
    const scene: Scene = {
      npcId: 70, first: "player", turns: 2,
      npc: { mzone: ["D.D. Warrior"], deck: Array(20).fill("Reckless Greed") },
      player: { mzone: ["Treeborn Frog", "Jinzo", "Apprentice Magician"] },
    };
    const p = play(dc, scene);
    expect(attacks(p, scene, 0)).toEqual(["Jinzo"]);
    expect(leftField(p, "Jinzo")).toBe(true);
  });

  it("D.D. Warrior attacks the bigger Cyber Dragon it trades with (2550)", () => {
    const p = play(dc, {
      npcId: 70, first: "player", turns: 2,
      npc: { mzone: ["D.D. Warrior"], deck: Array(20).fill("Reckless Greed") },
      player: { mzone: ["Cyber Dragon"] },
    });
    expect(leftField(p, "Cyber Dragon")).toBe(true);
  });

  it("D.D. Warrior stays home with nothing worth taking (control)", () => {
    const scene: Scene = {
      npcId: 70, first: "player", turns: 2,
      npc: { mzone: ["D.D. Warrior"], deck: Array(20).fill("Reckless Greed") },
      player: { mzone: [["Petit Moth", "def"]] },
    };
    expect(attacks(play(dc, scene), scene, 0)).toEqual([]);
  });

  it("does not send its only monster into the opponent's D.D. Warrior Lady when another target dies cleanly (2423)", () => {
    const scene: Scene = {
      npcId: 75, first: "player", turns: 2,
      npc: { mzone: ["Gil Garth"], deck: Array(20).fill("Reckless Greed") },
      player: { mzone: ["D.D. Warrior Lady", "Blue Thunder T-45"] }, player_policy: yesToEffects,
    };
    const p = play(dc, scene);
    expect(attacks(p, scene, 0)).not.toContain("D.D. Warrior Lady");
    expect(leftField(p, "Gil Garth")).toBe(false);
  });

  it("trades its cheaper monster, not the Fusion, into the opponent's D.D. Warrior Lady (2208)", () => {
    const scene: Scene = {
      npcId: 60, first: "player", turns: 2,
      npc: { mzone: ["Elemental HERO Sparkman", "Elemental HERO Steam Healer"], deck: Array(20).fill("Reckless Greed") },
      player: { mzone: ["D.D. Warrior Lady"] }, player_policy: yesToEffects,
    };
    const p = play(dc, scene);
    expect(attacks(p, scene, 1)).not.toContain("D.D. Warrior Lady");
    expect(leftField(p, "Elemental HERO Steam Healer")).toBe(false);
  });
});
