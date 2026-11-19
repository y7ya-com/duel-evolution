// The NPC on the real engine from set positions (test/npcScenario.ts): the misplays of the 2026-11 review of the duels
// the NPCs lost in production (AI revs 19-31, replayed: de-scratch/npc-decks-alltime/review), each with the duel it
// came from and the play that duel needed.
import { existsSync } from "node:fs";
import { join } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import type { DuelCore, Json } from "../src/duel/engine/core.ts";
import { createNodeDuelCore, ENGINE_DATA_DIR } from "../src/duel/engine/node.ts";
import { code, msgs, npcActivated, play } from "./npcScenario.ts";

const haveData = existsSync(join(ENGINE_DATA_DIR, "scripts.pack"));

/** The cards the NPC picked in its SELECT_CARD prompts that offered this card. */
function picked(p: ReturnType<typeof play>, offered: string): number[] {
  const c = code(offered);
  const d = p.npc.find((x) => x.sel.type === "SELECT_CARD" && (x.sel.selects as Json[]).some((s) => s.code === c));
  if (!d) return [];
  return ((d.resp?.indicies as number[] | undefined) ?? []).map((i) => Number((d.sel.selects as Json[])[i]!.code));
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
});
