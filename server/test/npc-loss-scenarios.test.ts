// The NPC on the real engine from set positions (test/npcScenario.ts): the misplays of the 2026-11 review of the duels
// the NPCs lost in production (AI revs 19-31, replayed: de-scratch/npc-decks-alltime/review), each with the duel it
// came from and the play that duel needed.
import { existsSync } from "node:fs";
import { join } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import type { DuelCore, Json } from "../src/duel/engine/core.ts";
import { createNodeDuelCore, ENGINE_DATA_DIR } from "../src/duel/engine/node.ts";
import { activating, attacker, code, leftField, msgs, npcActivated, passive, play, type Scene } from "./npcScenario.ts";

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

  // ---- the end of its own turn: what it holds when the opponent's next attack is lethal
  it("returns a Warrior with The Warrior Returning Alive and sets it in front of a lethal attacker (2208)", () => {
    const p = play(dc, {
      npcId: 60, first: "player", turns: 3,
      npc: { lp: 1500, hand: ["Polymerization", "Polymerization", "The Warrior Returning Alive"],
        grave: ["King of the Swamp", "Elemental HERO Bubbleman", "Elemental HERO Burstinatrix", "Polymerization", "Elemental HERO Sparkman",
          "Wroughtweiler", "Elemental HERO Wildheart", "Winged Kuriboh", "Elemental HERO Clayman", "Elemental HERO Sparkman"],
        szone: ["Hero Signal", ["The A. Forces", "up"]],
        deck: Array(20).fill("Reckless Greed") },
      player: { mzone: ["Cyber Dragon", ["Old Vindictive Magician", "set"], ["Treeborn Frog", "def"]] }, player_policy: attacker,
    });
    expect(npcActivated(p, "The Warrior Returning Alive")).toBe(true);
    expect(p.end?.winner).not.toBe(0);
  });

  // ---- attacks that cannot win the duel but can lose it
  it("at 150 LP Fenrir does not attack into three set cards, one a Magic Cylinder (2248)", () => {
    const p = play(dc, {
      npcId: 21, first: "player", turns: 2,
      npc: { lp: 150, mzone: ["Fenrir"], deck: Array(20).fill("Reckless Greed") },
      player: { lp: 6400, mzone: ["Old Vindictive Magician", "Apprentice Magician", "Old Vindictive Magician"],
        szone: ["Magic Cylinder", "Mirror Force", "Sakuretsu Armor"] }, player_policy: activating("Magic Cylinder"),
    });
    expect(msgs(p, "ATTACK")).toHaveLength(0);
    expect(p.end?.winner).not.toBe(0);
  });

  it("at 550 LP Cyber Dragon does not attack into set cards for a 450 ATK monster (2256)", () => {
    const p = play(dc, {
      npcId: 7, first: "player", turns: 2,
      npc: { lp: 550, mzone: ["Cyber Dragon"], deck: Array(20).fill("Reckless Greed") },
      player: { lp: 4800, mzone: ["Old Vindictive Magician"], szone: ["Magic Cylinder", "Mirror Force", "Sakuretsu Armor"] },
      player_policy: activating("Magic Cylinder"),
    });
    expect(p.end?.winner).not.toBe(0);
  });

  it("with LP to spare Cyber Dragon still attacks into set cards (control)", () => {
    const p = play(dc, {
      npcId: 7, first: "player", turns: 2,
      npc: { lp: 4000, mzone: ["Cyber Dragon"], deck: Array(20).fill("Reckless Greed") },
      player: { lp: 4800, mzone: ["Old Vindictive Magician"], szone: ["Magic Cylinder", "Mirror Force", "Sakuretsu Armor"] },
    });
    expect(leftField(p, "Old Vindictive Magician")).toBe(true);
  });

  it("at 500 LP it does not attack a set monster that may be Marshmallon (2377)", () => {
    const p = play(dc, {
      npcId: 34, first: "player", turns: 2,
      npc: { lp: 500, mzone: ["Double Coston"], deck: Array(20).fill("Reckless Greed") },
      player: { mzone: [["Marshmallon", "set"]] },
    });
    expect(p.end?.winner).not.toBe(0);
  });

  it("with LP to spare it attacks the set monster (control)", () => {
    const p = play(dc, {
      npcId: 34, first: "player", turns: 2,
      npc: { lp: 3000, mzone: ["Double Coston"], deck: Array(20).fill("Reckless Greed") },
      player: { mzone: [["Petit Moth", "set"]] },
    });
    expect(leftField(p, "Petit Moth")).toBe(true);
  });

  // ---- battle locks held while the attacks they stop take the duel
  it("raises Swords of Revealing Light on an empty field against Celestia at 3400 LP (2448)", () => {
    const p = play(dc, {
      npcId: 44, first: "player", turns: 2,
      npc: { lp: 3400, hand: ["Swords of Revealing Light", "Dark Factory of Mass Production", "Monster Reincarnation", "Left Leg of the Forbidden One"],
        deck: ["Exodia the Forbidden One", ...Array(19).fill("Reckless Greed")] },
      player: { lp: 5700, mzone: ["Celestia, Lightsworn Angel"] },
    });
    expect(npcActivated(p, "Swords of Revealing Light")).toBe(true);
  });

  it("raises Messenger of Peace against Jain and Celestia with Exodia pieces in hand (2439)", () => {
    const p = play(dc, {
      npcId: 44, first: "player", turns: 2,
      npc: { lp: 5700, hand: ["Right Arm of the Forbidden One", "Monster Reincarnation", "Dark Factory of Mass Production", "Left Arm of the Forbidden One", "Messenger of Peace"],
        mzone: [["Marshmallon", "set"]], szone: ["Ring of Destruction"],
        deck: ["Exodia the Forbidden One", "Left Leg of the Forbidden One", "Right Leg of the Forbidden One", ...Array(17).fill("Reckless Greed")] },
      player: { mzone: ["Jain, Lightsworn Paladin", "Celestia, Lightsworn Angel", ["Ryko, Lightsworn Hunter", "set"]], szone: [["Royal Decree", "up"]],
        hand: ["Foolish Burial", "Honest", "Lyla, Lightsworn Sorceress", "Honest", "Necro Gardna"] },
    });
    expect(npcActivated(p, "Messenger of Peace")).toBe(true);
  });

  // ---- a borrowed monster as the tribute (Soul Exchange, Brain Control)
  it("Tribute Summons Vampire Lord with the monster Soul Exchange marked, not a second steal of it (2540)", () => {
    const p = play(dc, {
      npcId: 56, first: "player", turns: 2,
      npc: { lp: 6900, hand: ["Peten the Dark Clown", "Vampire Lord", "Spirit Reaper", "Snatch Steal", "Card Destruction", "Soul Exchange"], deck: Array(20).fill("Reckless Greed") },
      player: { mzone: ["Wulf, Lightsworn Beast", "Jain, Lightsworn Paladin"], szone: ["Solemn Judgment"] },
    });
    expect(npcActivated(p, "Soul Exchange")).toBe(true);
    expect(msgs(p, "SUMMONING", "Vampire Lord")).toHaveLength(1);
  });

  it("does not cast Soul Exchange for a God it cannot tribute for (2543)", () => {
    const p = play(dc, {
      npcId: 56, first: "player", turns: 2,
      npc: { lp: 750, hand: ["Soul Exchange", "Obelisk the Tormentor", "Card Destruction"], deck: Array(20).fill("Reckless Greed") },
      player: { mzone: ["Wulf, Lightsworn Beast", "Garoth, Lightsworn Warrior"] },
    });
    expect(npcActivated(p, "Soul Exchange")).toBe(false);
  });

  it("keeps its Normal Summon for Raiza, tributing the Brain Controlled monster after its attack (2431)", () => {
    const p = play(dc, {
      npcId: 3, first: "player", turns: 2,
      npc: { lp: 5350, hand: ["Swords of Revealing Light", "D.D. Warrior Lady", "Premature Burial", "Raiza the Storm Monarch", "Brain Control"], deck: Array(20).fill("Reckless Greed") },
      player: { mzone: ["Mechanicalchaser"], szone: ["Call of the Haunted"] },
    });
    expect(npcActivated(p, "Brain Control")).toBe(true);
    expect(msgs(p, "SUMMONING", "Raiza the Storm Monarch")).toHaveLength(1);
    expect(msgs(p, "SUMMONING", "D.D. Warrior Lady")).toHaveLength(0);
  });

  // ---- set cards used as they are destroyed
  it("lets a targeted Limiter Removal go rather than destroy its own Machines at the End Phase (2603)", () => {
    const p = play(dc, {
      npcId: 63, first: "player", turns: 2,
      npc: { mzone: ["V-Tiger Jet", "Z-Metal Tank"], szone: ["Limiter Removal"], deck: Array(20).fill("Reckless Greed") },
      player: { hand: ["Mystical Space Typhoon"] }, player_policy: activating("Mystical Space Typhoon"),
    });
    expect(npcActivated(p, "Limiter Removal")).toBe(false);
    expect(leftField(p, "V-Tiger Jet")).toBe(false);
  });

  // ---- Main Phase 2 positions after the opponent's Honest
  it("keeps Vampire Lord in attack after Honest raised Garoth only until the End Phase (2593)", () => {
    const p = play(dc, {
      npcId: 56, first: "player", turns: 2,
      npc: { lp: 5300, mzone: ["Giant Germ", "Vampire Lord", "Wulf, Lightsworn Beast", "Giant Germ"], deck: Array(20).fill("Reckless Greed") },
      player: { lp: 5000, hand: ["Honest"], mzone: ["Garoth, Lightsworn Warrior"] }, player_policy: activating("Honest"),
    });
    expect(npcActivated(p, "Honest")).toBe(false);
    expect(msgs(p, "CHAINING", "Honest")).toHaveLength(1);
    expect(msgs(p, "POS_CHANGE", "Vampire Lord")).toHaveLength(0);
  });

  // ---- removal and revival picks
  it("Raigeki Break on a 450 direct attack takes the 2400 still to attack (2237)", () => {
    const p = play(dc, {
      npcId: 7, first: "npc", turns: 2,
      npc: { hand: ["Obelisk the Tormentor"], szone: ["Raigeki Break"], deck: Array(20).fill("Reckless Greed") },
      player: { mzone: ["Old Vindictive Magician", "Chaos Command Magician"] }, player_policy: attacker,
    });
    expect(npcActivated(p, "Raigeki Break")).toBe(true);
    expect(leftField(p, "Chaos Command Magician")).toBe(true);
  });

  // ---- Card Destruction
  it("casts Card Destruction to refresh a hand of tribute monsters it cannot summon (2588)", () => {
    const p = play(dc, {
      npcId: 56, first: "player", turns: 2,
      npc: { hand: ["Card Destruction", "Obelisk the Tormentor", "Vampire Lord", "Vampire Lord"], szone: ["Sakuretsu Armor"], deck: Array(20).fill("Reckless Greed") },
      player: { lp: 4000, mzone: ["Lyla, Lightsworn Sorceress"], szone: ["Mirror Force"], hand: ["Petit Moth", "Petit Moth", "Petit Moth"] },
    });
    expect(npcActivated(p, "Card Destruction")).toBe(true);
  });

  it("casts Card Destruction to discard its Dark World monsters (2565)", () => {
    const p = play(dc, {
      npcId: 5, first: "player", turns: 2,
      npc: { hand: ["Goldd, Wu-Lord of Dark World", "Card Destruction", "Call of the Haunted", "Gateway to Dark World", "Sillva, Warlord of Dark World"], deck: Array(20).fill("Reckless Greed") },
      player: { mzone: [["Spirit Reaper", "set"]], szone: ["Macro Cosmos"], hand: ["Petit Moth", "Petit Moth", "Petit Moth", "Petit Moth"] },
    });
    expect(npcActivated(p, "Card Destruction")).toBe(true);
  });

  it("keeps Card Destruction with a hand it can play (control)", () => {
    const p = play(dc, {
      npcId: 56, first: "player", turns: 2,
      npc: { hand: ["Card Destruction", "Gemini Elf", "Vorse Raider", "Mirror Force"], deck: Array(20).fill("Reckless Greed") },
      player: { mzone: ["Lyla, Lightsworn Sorceress"], hand: ["Petit Moth", "Petit Moth", "Petit Moth"] },
    });
    expect(npcActivated(p, "Card Destruction")).toBe(false);
  });

  // ---- the opening of duel 2419
  it("does not open with Cold Wave while its own Spells and Traps wait to be set (2419)", () => {
    const p = play(dc, {
      npcId: 75, first: "npc", turns: 1,
      npc: { hand: ["Bark of Dark Ruler", "Spirit Reaper", "Premature Burial", "Metal Reflect Slime", "Dark Jeroid", "Cold Wave"], deck: Array(20).fill("Reckless Greed") },
      player: { hand: ["Petit Moth", "Petit Moth", "Petit Moth", "Petit Moth", "Petit Moth"] },
    });
    expect(npcActivated(p, "Cold Wave")).toBe(false);
  });

  it("does not summon Dark Jeroid face-up with no opposing monster to shrink (2419)", () => {
    const p = play(dc, {
      npcId: 75, first: "npc", turns: 1,
      npc: { hand: ["Dark Jeroid", "Bark of Dark Ruler"], deck: Array(20).fill("Reckless Greed") },
      player: {},
    });
    expect(msgs(p, "SUMMONING", "Dark Jeroid")).toHaveLength(0);
  });

  it("summons Dark Jeroid against a face-up monster (control)", () => {
    const p = play(dc, {
      npcId: 75, first: "player", turns: 2,
      npc: { hand: ["Dark Jeroid"], deck: Array(20).fill("Reckless Greed") },
      player: { mzone: ["Vorse Raider"] },
    });
    expect(msgs(p, "SUMMONING", "Dark Jeroid")).toHaveLength(1);
  });

  // ---- battle walls in attack position
  it("sets Marshmallon under its own Swords of Revealing Light (2474)", () => {
    const p = play(dc, {
      npcId: 44, first: "player", turns: 2,
      npc: { lp: 5700, hand: ["Manticore of Darkness", "Left Leg of the Forbidden One", "Dark Factory of Mass Production", "Monster Reincarnation", "Marshmallon"],
        szone: [["Swords of Revealing Light", "up"], "Backup Soldier"], deck: Array(20).fill("Reckless Greed") },
      player: { mzone: [["Necro Gardna", "def"], "Celestia, Lightsworn Angel", ["Petit Moth", "set"]], szone: [["Royal Decree", "up"]] },
    });
    expect(msgs(p, "SUMMONING", "Marshmallon")).toHaveLength(0);
  });

  it("sets Spirit Reaper when it cannot attack this turn (2443)", () => {
    const p = play(dc, {
      npcId: 44, first: "player", turns: 2,
      npc: { hand: ["Ring of Destruction", "Spirit Reaper", "Exodia the Forbidden One"], szone: [["Swords of Revealing Light", "up"]], deck: Array(20).fill("Reckless Greed") },
      player: { mzone: ["Lyla, Lightsworn Sorceress"], szone: ["Mirror Force"] },
    });
    expect(msgs(p, "SUMMONING", "Spirit Reaper")).toHaveLength(0);
  });

  it("does not Flip Summon its set Marshmallon in Main Phase 2 (2447)", () => {
    const p = play(dc, {
      npcId: 3, first: "player", turns: 2,
      npc: { lp: 1600, mzone: [["Marshmallon", "set"], ["Treeborn Frog", "def"], "D.D. Warrior Lady"], szone: [["Swords of Revealing Light", "up"]], deck: Array(20).fill("Reckless Greed") },
      player: { lp: 4300, mzone: [["Petit Moth", "set"], "Blue Thunder T-45", "Gemini Elf"], szone: ["Mirror Force"] },
    });
    expect(msgs(p, "FLIPSUMMONING", "Marshmallon")).toHaveLength(0);
  });

  it("summons Spirit Reaper face-up to attack an empty field (control)", () => {
    const p = play(dc, {
      npcId: 44, first: "player", turns: 2,
      npc: { hand: ["Spirit Reaper", "Exodia the Forbidden One"], deck: Array(20).fill("Reckless Greed") },
      player: { hand: ["Petit Moth", "Petit Moth"] },
    });
    expect(msgs(p, "SUMMONING", "Spirit Reaper")).toHaveLength(1);
  });

  it("does not cast Soul Exchange beside a set Brain Control that makes the same tribute (2427)", () => {
    const p = play(dc, {
      npcId: 14, first: "player", turns: 2,
      npc: { hand: ["Soul Exchange", "Great Maju Garzett", "Giant Orc"], mzone: ["Giant Orc"], szone: ["Brain Control"], deck: Array(20).fill("Reckless Greed") },
      player: { mzone: [["Lyla, Lightsworn Sorceress", "def"]] },
    });
    expect(npcActivated(p, "Soul Exchange") && npcActivated(p, "Brain Control")).toBe(false);
  });

  it("Mobius destroys both of the opponent's set cards (2362)", () => {
    const p = play(dc, {
      npcId: 7, first: "player", turns: 2,
      npc: { hand: ["Mobius the Frost Monarch"], mzone: ["D.D. Survivor"], szone: [["Macro Cosmos", "up"], "Forced Back"], deck: Array(20).fill("Reckless Greed") },
      player: { lp: 2000, mzone: [["Elemental HERO Woodsman", "def"]], szone: ["Magic Cylinder", "Mirror Force"] },
    });
    expect(npcActivated(p, "Mobius the Frost Monarch")).toBe(true);
    expect(leftField(p, "Magic Cylinder") && leftField(p, "Mirror Force")).toBe(true);
  });

  it("Tribute Summons Legendary Fiend face-up, where it grows, not face-down (2416)", () => {
    const p = play(dc, {
      npcId: 75, first: "player", turns: 2,
      npc: { lp: 6500, hand: ["Legendary Fiend"], mzone: [["Gil Garth", "set"], "Spirit Reaper"],
        szone: [["Nightmare's Steelcage", "up"], "Metal Reflect Slime"], deck: Array(20).fill("Reckless Greed") },
      player: { lp: 7000, mzone: ["Card Trooper", ["Marshmallon", "def"], ["Petit Moth", "set"]] },
    });
    const set = p.npc.some((d) => d.sel.type === "SELECT_IDLECMD" && d.resp?.action === "SELECT_MONSTER_SET"
      && (d.sel.monster_sets as Json[])[Number(d.resp.index)]?.code === code("Legendary Fiend"));
    expect(set).toBe(false);
  });

  it("does not throw Sakuretsu Armor and Mirror Force into a face-up Prime Material Dragon (2597)", () => {
    const p = play(dc, {
      npcId: 31, first: "npc", turns: 2,
      npc: { hand: ["Pot of Avarice"], mzone: [["Mystical Elf", "set"]], szone: ["Mirror Force", "Sakuretsu Armor", "Torrential Tribute"], deck: Array(20).fill("Reckless Greed") },
      player: { mzone: ["Prime Material Dragon"], hand: ["Macro Cosmos", "Heavy Storm", "Threatening Roar"] },
      player_policy: activating("Prime Material Dragon", attacker),
    });
    expect(msgs(p, "ATTACK").length).toBeGreaterThanOrEqual(1);
    expect(npcActivated(p, "Sakuretsu Armor") || npcActivated(p, "Mirror Force")).toBe(false);
  });

  it("answers Prime Material Dragon's attack when its owner has no card to discard (control)", () => {
    const p = play(dc, {
      npcId: 31, first: "npc", turns: 2,
      npc: { mzone: [["Mystical Elf", "set"]], szone: ["Mirror Force", "Sakuretsu Armor"], deck: Array(20).fill("Reckless Greed") },
      player: { mzone: ["Prime Material Dragon"], deck: Array(20).fill("Petit Moth") },
      player_policy: (sel) => (sel.type === "SELECT_IDLECMD" && (sel.summons as unknown[] | undefined)?.length ? { type: "SELECT_IDLECMD", action: "SELECT_SUMMON", index: 0 } : attacker(sel)),
    });
    expect(npcActivated(p, "Sakuretsu Armor") || npcActivated(p, "Mirror Force")).toBe(true);
  });

  it("answers one attack once: Wall of Revealing Light or Raigeki Break, not both (2477)", () => {
    const p = play(dc, {
      npcId: 57, first: "npc", turns: 2,
      npc: { hand: ["Polymerization", "Darklord Marie", "Messenger of Peace"], szone: ["Wall of Revealing Light", "Raigeki Break", "Mystical Space Typhoon"], deck: Array(20).fill("Reckless Greed") },
      player: { mzone: ["D.D. Survivor"] }, player_policy: attacker,
    });
    expect(npcActivated(p, "Wall of Revealing Light") && npcActivated(p, "Raigeki Break")).toBe(false);
  });

  // ---- mass backrow removal and my own locks (deck lab trace npc57-g11)
  it("does not Heavy Storm its own face-up Gravity Bind and Level Limit - Area B to hit the opponent's set cards", () => {
    const p = play(dc, {
      npcId: 57, first: "player", turns: 2,
      npc: { hand: ["Heavy Storm", "Messenger of Peace", "Scapegoat"], mzone: [["Dancing Fairy", "def"], ["Guardian Angel Joan", "def"]],
        szone: [["Gravity Bind", "up"], ["Level Limit - Area B", "up"], ["Card Trader", "up"]], deck: Array(20).fill("Reckless Greed") },
      player: { lp: 1000, mzone: [["Skilled Dark Magician", "def"], ["Dark Magician", "def"]], szone: ["Waboku", "Negate Attack", "Mirror Force", "Magic Cylinder"] },
    });
    expect(npcActivated(p, "Heavy Storm")).toBe(false);
  });

  it("Heavy Storms the opponent's set cards with no lock of its own up (control)", () => {
    const p = play(dc, {
      npcId: 57, first: "player", turns: 2,
      npc: { hand: ["Heavy Storm", "Scapegoat"], mzone: [["Dancing Fairy", "def"], ["Guardian Angel Joan", "def"]], szone: [["Card Trader", "up"]], deck: Array(20).fill("Reckless Greed") },
      player: { lp: 1000, mzone: [["Skilled Dark Magician", "def"], ["Dark Magician", "def"]], szone: ["Waboku", "Negate Attack", "Mirror Force", "Magic Cylinder"] },
    });
    expect(npcActivated(p, "Heavy Storm")).toBe(true);
  });

  // ---- Destiny Board needs a free zone for each letter (deck lab traces npc81-g30, npc81-g61)
  it("keeps the last Spell/Trap zone free for Destiny Board's next letter, not a set Sakuretsu Armor", () => {
    const p = play(dc, {
      npcId: 81, first: "npc", turns: 2,
      npc: { lp: 2600, hand: ["Sakuretsu Armor", "Threatening Roar"],
        szone: [null, ["Card Trader", "up"], ["Destiny Board", "up"], ["Card Trader", "up"], ["Card Trader", "up"]],
        deck: ["Spirit Message \"I\"", ...Array(19).fill("Petit Moth")] },
      player: { lp: 700, mzone: [["Lyla, Lightsworn Sorceress", "def"]] },
    });
    const letter = code("Spirit Message \"I\"");
    expect(msgs(p, "MOVE").some((m) => Number(m.card ?? m.code) === letter && (Number((m.to as Json | undefined)?.location) & 0x08) !== 0)).toBe(true);
  });

  it("does not set a second Destiny Board into the zone the next letter needs", () => {
    const p = play(dc, {
      npcId: 81, first: "npc", turns: 1,
      npc: { hand: ["Destiny Board", "Dark Ruler Ha Des"], szone: ["Magic Cylinder", ["Destiny Board", "up"], "Threatening Roar", ["Spirit Message \"I\"", "up"]],
        deck: Array(20).fill("Petit Moth") },
      player: { mzone: ["Cyber Dragon"] },
    });
    expect(msgs(p, "SET").filter((m) => Number(m.controller ?? (m.card as Json | undefined)?.controller) === 1 && (Number(m.location ?? (m.card as Json | undefined)?.location) & 0x08) !== 0)).toHaveLength(0);
  });

  // ---- Card of Sanctity: this engine's script banishes my hand and field for two cards (deck lab trace npc77-g20)
  it("does not banish a full hand with Card of Sanctity", () => {
    const p = play(dc, {
      npcId: 77, first: "player", turns: 2,
      npc: { hand: ["Dark Jeroid", "Card of Sanctity", "Gil Garth", "Giant Orc", "Monster Reborn", "Drillago"],
        deck: [...Array(14).fill("Reckless Greed"), "Pot of Greed", "Graceful Charity", "Pot of Greed", "Night Assailant", "Pot of Greed", "Raigeki"] },
      player: { mzone: [["Petit Moth", "set"]], szone: [["Ancient City - Rainbow Ruins", "up"]] },
    });
    expect(npcActivated(p, "Card of Sanctity")).toBe(false);
  });

  it("casts Card of Sanctity with nothing but a dead card to banish (control)", () => {
    const p = play(dc, {
      npcId: 77, first: "npc", turns: 1,
      npc: { hand: ["Card of Sanctity", "Obelisk the Tormentor"], deck: Array(20).fill("Slifer the Sky Dragon") },
      player: { mzone: [["Petit Moth", "set"]] },
    });
    expect(npcActivated(p, "Card of Sanctity")).toBe(true);
  });

  // ---- deck lab findings (gx1 REPORT.md)
  it("Normal Summons a new monster, not a Gemini re-summon of the Neos Alius already out (npc62-g1)", () => {
    const p = play(dc, {
      npcId: 62, first: "player", turns: 2,
      npc: { lp: 8000, hand: ["D.D. Warrior Lady", "Premature Burial", "Neo-Spacian Aqua Dolphin", "Torrential Tribute"],
        mzone: ["Elemental HERO Neos Alius", "Elemental HERO Neos Alius"], szone: ["Sakuretsu Armor", "Bottomless Trap Hole"], deck: Array(20).fill("Reckless Greed") },
      player: { lp: 6100, mzone: [["Petit Moth", "set"]], szone: ["Mirror Force", "Magic Cylinder", "Dust Tornado"] },
    });
    expect(msgs(p, "SUMMONING", "Elemental HERO Neos Alius")).toHaveLength(0);
  });

  it("does not activate Luminous Spark when it raises the opponent's LIGHT monsters more than its own (npc63-g27)", () => {
    const p = play(dc, {
      npcId: 63, first: "player", turns: 2,
      npc: { hand: ["Luminous Spark"], mzone: ["V-Tiger Jet"], deck: Array(20).fill("Reckless Greed") },
      player: { mzone: ["Wulf, Lightsworn Beast", "Ehren, Lightsworn Monk"] },
    });
    expect(npcActivated(p, "Luminous Spark")).toBe(false);
  });

  // ---- deck lab findings (dm1 REPORT.md)
  it("tributes for Panther Warrior's attack when that attack wins the duel (npc71-g26)", () => {
    const p = play(dc, {
      npcId: 71, first: "player", turns: 2,
      npc: { mzone: ["Panther Warrior", "Rocket Warrior"], deck: Array(20).fill("Reckless Greed") },
      player: { lp: 2500, hand: ["Petit Moth", "Petit Moth"] },
    });
    expect(p.end?.winner).toBe(1);
  });

  it("pays Panther Warrior's Tribute with a defending monster that cannot attack (control)", () => {
    const p = play(dc, {
      npcId: 71, first: "player", turns: 2,
      npc: { mzone: ["Panther Warrior", ["Petit Moth", "def"]], deck: Array(20).fill("Reckless Greed") },
      player: { mzone: [["Mystic Tomato", "def"]] },
    });
    expect(leftField(p, "Petit Moth")).toBe(true);
    expect(leftField(p, "Mystic Tomato")).toBe(true);
  });
});
