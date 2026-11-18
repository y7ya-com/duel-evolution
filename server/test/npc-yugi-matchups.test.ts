import { beforeAll, expect, it } from "vitest";
import { yugiPlaybook, type MatchupEvidence } from "../src/duel/ai/yugiMatchups.ts";
import { YUGI_HEART_POOL } from "../src/duel/yugiHeartPool.ts";
import type { DuelCore } from "../src/duel/engine/core.ts";
import { createNodeDuelCore } from "../src/duel/engine/node.ts";
import { activating, attacker, code, leftField, npcActivated, play } from "./npcScenario.ts";

const evidence = (e: Partial<MatchupEvidence>): MatchupEvidence => ({
  hand: [], monsters: [], backrow: [], grave: [], setMonsters: 0, setBackrow: 0, ...e,
});

it.each([
  ["lightsworn", { hand: ["judgment dragon"] }, "Soul Release"],
  ["dark-world", { hand: ["goldd, wu-lord of dark world"] }, "Shadow-Imprisoning Mirror"],
  ["gladiator-beast", { hand: ["elemental hero prisma", "gladiator beast bestiari"] }, "Dimensional Prison"],
  ["hero", { hand: ["elemental hero avian", "miracle fusion"] }, "D.D. Crow"],
  ["crystal-beast", { backrow: ["ancient city - rainbow ruins", "crystal beast amber mammoth"] }, "Giant Trunade"],
  ["cyber-dragon", { hand: ["power bond"], monsters: ["cyber dragon"] }, "System Down"],
  ["dark-gaia", { hand: ["dark calling", "dark master - zorc"] }, "Royal Oppression"],
  ["apprentice-control", { hand: ["apprentice magician", "old vindictive magician"], setMonsters: 1 }, "Nobleman of Crossout"],
] as const)("offers a legal %s counter from current evidence", (id, input, counter) => {
  const match = yugiPlaybook(evidence(input));
  expect(match?.id).toBe(id);
  expect(match?.lines.flat()).toContain(counter.toLowerCase());
  expect(YUGI_HEART_POOL).toContain(code(counter));
});

it("does not classify generic splash cards or duplicate copies as a matchup", () => {
  expect(yugiPlaybook(evidence({hand: ["elemental hero prisma", "cyber dragon", "cyber dragon", "dark world dealings"]}))).toBeNull();
});

let dc: DuelCore;
beforeAll(async () => { dc = await createNodeDuelCore(); }, 60000);

it("brings in System Down and removes the Machine board", () => {
  const p = play(dc, {
    npcId: 53, heart_of_cards: 1, handAwareDraw: true, first: "player", turns: 2,
    heart_pool: [code("System Down"), code("Mirror Force")],
    npc: { hand: ["Beta The Magnet Warrior"] },
    player: { hand: ["Power Bond"], mzone: ["Cyber Dragon", "Jinzo"], grave: ["Cyber Valley"] },
  });
  expect(npcActivated(p, "System Down")).toBe(true);
  expect(leftField(p, "Cyber Dragon")).toBe(true);
});

it("banishes a Gladiator before battle damage even when the attack alone is harmless", () => {
  const p = play(dc, {
    npcId: 53, heart_of_cards: 1, handAwareDraw: true, first: "npc", turns: 2,
    heart_pool: [code("Marshmallon")],
    npc: { szone: ["Dimensional Prison"] },
    player: { mzone: ["Gladiator Beast Hoplomus"] },
    player_policy: attacker,
  });
  expect(npcActivated(p, "Dimensional Prison")).toBe(true);
  expect(leftField(p, "Gladiator Beast Hoplomus")).toBe(true);
});

it("uses Light-Imprisoning Mirror in response to Lyla's removal effect", () => {
  const p = play(dc, {
    npcId: 53, heart_of_cards: 1, handAwareDraw: true, first: "player", turns: 1,
    heart_pool: [code("Marshmallon")],
    npc: { szone: ["Light-Imprisoning Mirror"] },
    player: { mzone: ["Lyla, Lightsworn Sorceress"] },
    player_policy: activating("Lyla, Lightsworn Sorceress"),
  });
  expect(npcActivated(p, "Light-Imprisoning Mirror")).toBe(true);
  expect(leftField(p, "Light-Imprisoning Mirror")).toBe(false);
});
