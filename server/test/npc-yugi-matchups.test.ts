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
  ["dark-gaia", { hand: ["dark calling", "dark master - zorc"] }, "Dark Bribe"],
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

it("does not draw a set trap into a deck built to remove backrow", () => {
  // Production (duels 2378-2381): five Mirror Forces against Gladiator Beasts, each destroyed by Gyzarus, MST or
  // Heavy Storm, or negated by Solemn Judgment, before it destroyed anything.
  const hate = ["Mystical Space Typhoon", "Mystical Space Typhoon", "Heavy Storm", "Solemn Judgment", "Solemn Judgment",
    "Breaker the Magical Warrior", "Gladiator Beast Bestiari", "Gladiator Beast Bestiari", "Gladiator Beast Darius"];
  const p = play(dc, {
    npcId: 53, heart_of_cards: 1, handAwareDraw: true, first: "player", turns: 2,
    heart_pool: ["Mirror Force", "Swords of Revealing Light", "Skilled Dark Magician", "Raigeki"].map(code),
    npc: { hand: ["Beta The Magnet Warrior"] },
    player: { hand: ["Gladiator Beast Laquari", "Shrink"], mzone: ["Gladiator Beast Darius"], deck: [...hate, ...hate, ...hate],
      extra: ["Gladiator Beast Gyzarus", "Gladiator Beast Gyzarus", "Gladiator Beast Heraklinos"] },
  });
  const drawn = p.npc.filter(x => x.sel.heart_of_cards).map(x => dc.cardDB.name(Number(x.resp?.card)));
  expect(drawn.length).toBeGreaterThan(0);
  expect(drawn).not.toContain("Mirror Force");
  expect(drawn).not.toContain("Swords of Revealing Light");
});

it("flips a direct attacker with Book of Moon instead of taking the hit", () => {
  // Production (duel 2378): Book of Moon held through Prisma's 1700 direct attack and cast after the battle; Yugi lost
  // two turns later to exactly that much damage.
  const p = play(dc, {
    npcId: 53, heart_of_cards: 1, handAwareDraw: true, first: "npc", turns: 2,
    heart_pool: [code("Marshmallon")],
    npc: { lp: 3150, szone: ["Book of Moon"] },
    player: { mzone: ["Elemental HERO Prisma"] },
    player_policy: attacker,
  });
  expect(npcActivated(p, "Book of Moon")).toBe(true);
  expect(p.msgs.some(m => m.type === "DAMAGE" && Number(m.player) === 1)).toBe(false);
});

it("negates a fusion spell with Solemn Judgment even though it targets nothing of his", () => {
  // Lab: Dark Fusion and Dark Calling resolved into two Dark Gaias with Solemn Judgment set: neither hit Yugi's cards.
  const p = play(dc, {
    npcId: 53, heart_of_cards: 1, handAwareDraw: true, first: "player", turns: 1,
    heart_pool: [code("Marshmallon")],
    npc: { szone: ["Solemn Judgment"], mzone: ["Beta The Magnet Warrior"] },
    player: { hand: ["Dark Fusion", "Summoned Skull", "Giant Soldier of Stone"], extra: ["Evil HERO Dark Gaia"] },
    player_policy: activating("Dark Fusion"),
  });
  expect(npcActivated(p, "Solemn Judgment")).toBe(true);
  expect(p.msgs.some(m => m.type === "SPSUMMONING" && m.code === code("Evil HERO Dark Gaia"))).toBe(false);
});

it("never uses a draw effect other than his one Pot of Greed", () => {
  // Lab: Monster Reborn on the opponent's Cyber Valley, then its banish-and-draw-two.
  const p = play(dc, {
    npcId: 52, heart_of_cards: 1, handAwareDraw: true, first: "npc", turns: 2,
    heart_pool: [code("Marshmallon")],
    npc: { mzone: [["Cyber Valley", "atk"]] },
    player: { mzone: ["Gladiator Beast Darius"] },
    player_policy: attacker,
  });
  expect(npcActivated(p, "Cyber Valley")).toBe(false);
});

it("declares the opposing Type with a Tribe-Infecting Virus activated right after its summon", () => {
  // Lab: activated from the summon's chain window, its Type pick did not know the card and declared Aqua, its own.
  const p = play(dc, {
    npcId: 51, heart_of_cards: 1, handAwareDraw: true, first: "npc", turns: 1,
    heart_pool: [code("Marshmallon")],
    npc: { hand: ["Tribe-Infecting Virus", "Breaker the Magical Warrior", "Book of Moon"] },
    player: { mzone: [["Gladiator Beast Hoplomus", "def"], "Gladiator Beast Heraklinos"], szone: ["Waboku", "Mirror Force"] },
  });
  expect(p.npc.find(x => x.sel.type === "ANNOUNCE_RACE")?.resp?.races).toEqual([0x8000]);
  expect(leftField(p, "Gladiator Beast Heraklinos")).toBe(true);
});

it("keeps Solemn Judgment instead of paying 4000 LP for a Book of Moon", () => {
  // Lab review: 13 of 14 Solemns paid 4000, on Book of Moon, Shrink and MST.
  const p = play(dc, {
    npcId: 53, heart_of_cards: 1, handAwareDraw: true, first: "player", turns: 1,
    heart_pool: [code("Marshmallon")],
    npc: { szone: ["Solemn Judgment"], mzone: ["Beta The Magnet Warrior"] },
    player: { hand: ["Book of Moon"] },
    player_policy: activating("Book of Moon"),
  });
  expect(npcActivated(p, "Solemn Judgment")).toBe(false);
});

it("does not draw Thousand Knives or Magical Dimension with no Dark Magician or Spellcaster out", () => {
  const p = play(dc, {
    npcId: 52, heart_of_cards: 1, handAwareDraw: true, first: "player", turns: 2,
    heart_pool: ["Thousand Knives", "Magical Dimension", "Dark Magic Attack", "Summoned Skull", "Raigeki"].map(code),
    npc: { mzone: ["Beta The Magnet Warrior"] },
    player: { mzone: ["Gladiator Beast Darius"] },
  });
  const drawn = p.npc.filter(x => x.sel.heart_of_cards).map(x => dc.cardDB.name(Number(x.resp?.card)));
  expect(drawn.length).toBeGreaterThan(0);
  expect(drawn.filter(n => /^(Thousand Knives|Magical Dimension|Dark Magic Attack)$/.test(n))).toEqual([]);
});

it("revives an attacker with Monster Reborn, not Big Shield Gardna, when the opponent's field is weak", () => {
  // Lab review: 13 Monster Reborns on Big Shield Gardna in defence.
  const p = play(dc, {
    npcId: 52, heart_of_cards: 1, handAwareDraw: true, first: "npc", turns: 1,
    heart_pool: [code("Marshmallon")],
    npc: { hand: ["Monster Reborn"], grave: ["Big Shield Gardna", "Summoned Skull"] },
    player: { mzone: ["Gladiator Beast Darius"] },
  });
  expect(p.msgs.some(m => m.type === "SPSUMMONING" && m.code === code("Summoned Skull"))).toBe(true);
});
