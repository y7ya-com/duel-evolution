import { beforeAll, expect, it } from "vitest";
import { createNodeDuelCore } from "../src/duel/engine/node.ts";
import type { DuelCore } from "../src/duel/engine/core.ts";
import { code, play, type Played } from "./npcScenario.ts";
let dc: DuelCore;
beforeAll(async () => { dc = await createNodeDuelCore(); }, 60000);

// Owner: one monster is Smashing Ground, several are Dark Hole, Raigeki only when Yugi would lose without it.
const pool = ["Raigeki", "Dark Hole", "Smashing Ground", "Petit Moth"].map(code);
const drawn = (p: Played) => p.npc.filter(d => d.sel.heart_of_cards === true).map(d => Number((d.resp as { card?: number }).card));

it.each([false, true])("one monster takes Smashing Ground, not Raigeki (hand-aware %s)", handAwareDraw => {
  const p = play(dc, { npcId: 53, heart_of_cards: 1, handAwareDraw, heart_pool: pool, first: "player", turns: 2,
    npc: {}, player: { mzone: ["Gene-Warped Warwolf"] } });
  expect(drawn(p)[0]).toBe(code("Smashing Ground"));
});

it.each([false, true])("several monsters take Dark Hole, not Raigeki (hand-aware %s)", handAwareDraw => {
  const p = play(dc, { npcId: 53, heart_of_cards: 1, handAwareDraw, heart_pool: pool, first: "player", turns: 2,
    npc: {}, player: { mzone: ["Blue-Eyes White Dragon", "Blue-Eyes White Dragon"] } });
  expect(drawn(p)[0]).toBe(code("Dark Hole"));
});

it("Raigeki when Dark Hole would cost his board and he is about to lose", () => {
  const p = play(dc, { npcId: 53, heart_of_cards: 1, handAwareDraw: true, heart_pool: pool, first: "player", turns: 2,
    npc: { lp: 1500, mzone: ["Dark Magician"] }, player: { mzone: ["Blue-Eyes White Dragon", "Blue-Eyes White Dragon"] } });
  expect(drawn(p)[0]).toBe(code("Raigeki"));
});
