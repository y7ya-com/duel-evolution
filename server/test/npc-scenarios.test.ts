// The NPC on the real engine from set positions (test/npcScenario.ts): each test is a misplay seen in a real duel
// (duel_archive, AI rev 6), with the duel it came from and the play a strong player makes there.
import { existsSync } from "node:fs";
import { join } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import type { DuelCore } from "../src/duel/engine/core.ts";
import { createNodeDuelCore, ENGINE_DATA_DIR } from "../src/duel/engine/node.ts";
import { activating, attacker, code, leftField, msgs, npcActivated, npcChoices, play, summoning } from "./npcScenario.ts";

const haveData = existsSync(join(ENGINE_DATA_DIR, "scripts.pack"));

describe.skipIf(!haveData)("NPC scenarios (real engine)", () => {
  let dc: DuelCore;
  beforeAll(async () => { dc = await createNodeDuelCore(); }, 60_000);

  // ---- battle
  it("attacks the monster it beats even with a battle-indestructible Spirit Reaper beside it (duel 303)", () => {
    const p = play(dc, {
      npcId: 51, first: "player", turns: 2,
      npc: { mzone: ["Summoned Skull", "Obnoxious Celtic Guard"] },
      player: { mzone: [["Lyla, Lightsworn Sorceress", "def"], ["Spirit Reaper", "def"]] },
    });
    expect(leftField(p, "Lyla, Lightsworn Sorceress")).toBe(true);
  });

  it("Dark Ruler Ha Des attacks a defending Lumina with Spirit Reaper beside it (duel 301)", () => {
    const p = play(dc, {
      npcId: 81, first: "player", turns: 2,
      npc: { mzone: ["Dark Ruler Ha Des"] },
      player: { mzone: [["Lumina, Lightsworn Summoner", "def"], ["Spirit Reaper", "def"]] },
    });
    expect(leftField(p, "Lumina, Lightsworn Summoner")).toBe(true);
  });

  // ---- costs and responses on the opponent's turn
  it("pays Raigeki Break with a dead Spirit Message to survive a lethal direct attack (duel 300)", () => {
    const p = play(dc, {
      npcId: 81, first: "player", turns: 3,
      npc: { lp: 1100, hand: ['Spirit Message "N"'], szone: ["Raigeki Break"], deck: Array(20).fill('Spirit Message "A"') },
      player: { mzone: ["Ehren, Lightsworn Monk"] },
      player_policy: attacker,
    });
    expect(npcActivated(p, "Raigeki Break")).toBe(true);
    expect(p.end?.winner).not.toBe(0);
  });

  // (Not a misplay: duel 296's set Call of the Haunted chained to the card destroying it revives a monster that is
  // destroyed with it; a lasting card is not "used before it goes".)

  it("Magic Cylinder stops Ehren's attack on its face-up defender (duel 306)", () => {
    const p = play(dc, {
      npcId: 52, first: "player", turns: 3,
      npc: { mzone: [["Old Vindictive Magician", "def"]], szone: ["Magic Cylinder"] },
      player: { mzone: ["Ehren, Lightsworn Monk"] },
      player_policy: attacker,
    });
    expect(npcActivated(p, "Magic Cylinder")).toBe(true);
  });

  it("Spellbinding Circle waits for the attack instead of the Draw Phase (duel 302)", () => {
    const p = play(dc, {
      npcId: 51, first: "player", turns: 3,
      npc: { mzone: [["Obnoxious Celtic Guard", "def"]], szone: ["Spellbinding Circle"] },
      player: { mzone: ["Dark Elf"] },
      player_policy: attacker,
    });
    const at = p.msgs.findIndex((m) => m.type === "CHAINING" && m.code === code("Spellbinding Circle"));
    if (at >= 0) expect(p.msgs.slice(0, at).some((m) => m.type === "ATTACK")).toBe(true);
  });

  // ---- locks
  it("never springs a trap into a face-up Royal Decree (duel 295)", () => {
    const p = play(dc, {
      npcId: 81, first: "player", turns: 3,
      npc: { szone: ["Torrential Tribute"] },
      player: { hand: ["Ehren, Lightsworn Monk", "Lyla, Lightsworn Sorceress"], szone: [["Royal Decree", "up"]] },
      player_policy: summoning(),
    });
    expect(npcActivated(p, "Torrential Tribute")).toBe(false);
  });

  it("Mystical Space Typhoon goes on the Royal Decree that locks its traps, not on Light Spiral (duel 304)", () => {
    const p = play(dc, {
      npcId: 51, first: "player", turns: 2,
      npc: { hand: ["Mystical Space Typhoon"], szone: ["Torrential Tribute"] },
      player: { szone: [["Light Spiral", "up"], ["Royal Decree", "up"]] },
    });
    expect(leftField(p, "Light Spiral")).toBe(false);
    expect(leftField(p, "Royal Decree")).toBe(true);
  });

  // ---- summons and positions
  it("sets a flip monster face-down instead of summoning it face-up (duel 303: Morphing Jar)", () => {
    const p = play(dc, {
      npcId: 51, first: "player", turns: 2,
      npc: { hand: ["Morphing Jar"] },
      player: { mzone: ["Ehren, Lightsworn Monk"] },
    });
    expect(msgs(p, "SUMMONING", "Morphing Jar")).toHaveLength(0);
  });

  it("flips Old Vindictive Magician to destroy Wulf before tributing it (duel 306)", () => {
    const p = play(dc, {
      npcId: 52, first: "player", turns: 2,
      npc: { hand: ["Dark Magician of Chaos"], mzone: [["King of the Swamp", "set"], ["Old Vindictive Magician", "set"]] },
      player: { mzone: ["Wulf, Lightsworn Beast"] },
    });
    expect(leftField(p, "Wulf, Lightsworn Beast")).toBe(true);
  });

  it("does not tribute a face-up Skilled Dark Magician to set Dark Red Enchanter face-down (duel 307)", () => {
    const p = play(dc, {
      npcId: 52, first: "player", turns: 2,
      npc: { hand: ["Dark Red Enchanter"], mzone: ["Skilled Dark Magician"] },
      player: { mzone: [["Spirit Reaper", "def"]] },
    });
    const setEnchanter = p.msgs.some((m) => m.type === "SET" && m.code === code("Dark Red Enchanter"));
    expect(setEnchanter).toBe(false);
  });

  it("does not switch Sangan to attack position under a 3000 ATK monster at 700 LP (duel 301)", () => {
    const p = play(dc, {
      npcId: 81, first: "player", turns: 2,
      npc: { lp: 700, mzone: [["Sangan", "def"]] },
      player: { mzone: ["Wulf, Lightsworn Beast"] },
    });
    expect(npcChoices(p, "SELECT_IDLECMD").some(([, r]) => r?.action === "SELECT_POS_CHANGE")).toBe(false);
  });

  it("flip-summons its set attacker onto an open field and attacks (duel 307)", () => {
    const p = play(dc, {
      npcId: 52, first: "player", turns: 2,
      npc: { mzone: [["Dark Red Enchanter", "set"]] },
      player: { lp: 8000 },
    });
    expect(msgs(p, "ATTACK").length).toBeGreaterThan(0);
  });

  // ---- from Master Duel's decisions (md-ai/port specs: A1 summon, A2 main phase, C battle, D costs, E chains)
  it("switches a face-up attacker the battle plan leaves out to defence in Main 1 (A2 §13.1)", () => {
    const p = play(dc, {
      npcId: 81, first: "player", turns: 2,
      npc: { mzone: ["Sangan"] },
      player: { mzone: ["Blue-Eyes White Dragon"] },
    });
    expect(npcChoices(p, "SELECT_IDLECMD").some(([, r]) => r?.action === "SELECT_POS_CHANGE")).toBe(true);
    expect(msgs(p, "ATTACK")).toHaveLength(0);
  });

  it("flips Night Assailant in Main 1 to destroy the attacker it faces, then attacks (A2 §13.3)", () => {
    const p = play(dc, {
      npcId: 81, first: "player", turns: 2,
      npc: { mzone: [["Night Assailant", "set"]] },
      player: { mzone: ["Vorse Raider"] },
    });
    const flipped = p.msgs.findIndex((m) => m.type === "FLIPSUMMONING" && m.code === code("Night Assailant"));
    const battle = p.msgs.findIndex((m) => m.type === "NEW_PHASE" && Number(m.phase) === 0x08);
    expect(flipped).toBeGreaterThanOrEqual(0);
    expect(battle < 0 || flipped < battle).toBe(true);
    expect(leftField(p, "Vorse Raider")).toBe(true);
  });

  it("keeps both Obnoxious Celtic Guards instead of tributing them for a Gaia that loses to a 3000 (A1 §12.5)", () => {
    const p = play(dc, {
      npcId: 51, first: "player", turns: 2,
      npc: { hand: ["Gaia The Fierce Knight"], mzone: ["Obnoxious Celtic Guard", "Obnoxious Celtic Guard"] },
      player: { mzone: ["Blue-Eyes White Dragon"] },
    });
    expect(leftField(p, "Obnoxious Celtic Guard")).toBe(false);
  });

  it("does not trade The Tricky for an equal Dark Elf (C: an equal trade gains nothing)", () => {
    const p = play(dc, {
      npcId: 52, first: "player", turns: 2,
      npc: { mzone: ["The Tricky"], szone: [["Swords of Revealing Light", "up"]] },
      player: { mzone: ["Dark Elf"] },
    });
    expect(leftField(p, "The Tricky")).toBe(false);
  });

  it("Heavy Storm on a lone Glorious Illusion takes the Lyla it keeps (E §8.8)", () => {
    const p = play(dc, {
      npcId: 52, first: "player", turns: 2,
      npc: { hand: ["Heavy Storm"] },
      player: { mzone: ["Lyla, Lightsworn Sorceress"], szone: [["Glorious Illusion", "up"]] },
    });
    expect(npcActivated(p, "Heavy Storm")).toBe(true);
  });

  it("pays Judgment of Anubis with a dead Spirit Message to stop the Typhoon on its Steelcage (D §10.2, duel 299)", () => {
    const p = play(dc, {
      npcId: 81, first: "player", turns: 1,
      npc: { hand: ["Dark Necrofear", 'Spirit Message "L"', 'Spirit Message "I"'], szone: [["Nightmare's Steelcage", "up"], "Judgment of Anubis"] },
      player: { hand: ["Mystical Space Typhoon"], mzone: ["Gragonith, Lightsworn Dragon"] },
      player_policy: activating("Mystical Space Typhoon"),
    });
    expect(npcActivated(p, "Judgment of Anubis")).toBe(true);
    expect(leftField(p, "Nightmare's Steelcage")).toBe(false);
  });

  // ---- AI rev 7's live duels (rev7-review: duel_archive 368-406)
  it("keeps Marshmallon in defence instead of raising it to hit a 200/100 Ryko under three attackers (duel 393)", () => {
    const p = play(dc, {
      npcId: 1, first: "player", turns: 2,
      npc: { mzone: [["Marshmallon", "def"]] },
      player: { mzone: ["Wulf, Lightsworn Beast", "Ryko, Lightsworn Hunter", "Celestia, Lightsworn Angel"] },
    });
    expect(npcChoices(p, "SELECT_IDLECMD").some(([, r]) => r?.action === "SELECT_POS_CHANGE")).toBe(false);
    expect(msgs(p, "ATTACK")).toHaveLength(0);
  });

  it("sets Spirit Reaper at 200 LP instead of summoning it face-up under a 3000 (duel 402)", () => {
    const p = play(dc, {
      npcId: 44, first: "player", turns: 2,
      npc: { lp: 200, hand: ["Spirit Reaper"] },
      player: { mzone: ["Blue-Eyes White Dragon", "Ehren, Lightsworn Monk"] },
    });
    expect(msgs(p, "SUMMONING", "Spirit Reaper")).toHaveLength(0);
  });

  it("keeps a 2000/100 Warwolf in attack over a defending Spirit Reaper (duel 392)", () => {
    const p = play(dc, {
      npcId: 53, first: "player", turns: 2,
      npc: { mzone: ["Gene-Warped Warwolf"] },
      player: { mzone: [["Spirit Reaper", "def"]] },
    });
    expect(npcChoices(p, "SELECT_IDLECMD").some(([, r]) => r?.action === "SELECT_POS_CHANGE")).toBe(false);
  });

  it("summons Gamma onto an empty field and attacks instead of setting it (duel 380)", () => {
    const p = play(dc, {
      npcId: 53, first: "player", turns: 2,
      npc: { hand: ["Gamma The Magnet Warrior"] },
      player: {},
    });
    expect(msgs(p, "SUMMONING", "Gamma The Magnet Warrior")).toHaveLength(1);
    expect(msgs(p, "ATTACK").length).toBeGreaterThan(0);
  });

  it("Normal Summons Fusilier Dragon without tributes onto an empty field (duel 396)", () => {
    const p = play(dc, {
      npcId: 8, first: "player", turns: 2,
      npc: { hand: ["Fusilier Dragon, the Dual-Mode Beast"] },
      player: {},
    });
    expect(msgs(p, "SUMMONING", "Fusilier Dragon, the Dual-Mode Beast")).toHaveLength(1);
  });

  it("sets Swarm of Locusts for its Flip Summon instead of summoning it face-up (duel 393)", () => {
    const p = play(dc, {
      npcId: 1, first: "npc", turns: 1,
      npc: { hand: ["Swarm of Locusts"] },
      player: {},
    });
    expect(msgs(p, "SUMMONING", "Swarm of Locusts")).toHaveLength(0);
  });

  it("plays a second monster on turn 1 beside a lone Tempest (duel 390)", () => {
    const p = play(dc, {
      npcId: 60, first: "npc", turns: 1,
      npc: { hand: ["Elemental HERO Sparkman"], mzone: ["Elemental HERO Tempest"] },
      player: {},
    });
    const played = p.msgs.some((m) => (m.type === "SUMMONING" || (m.type === "SET" && (Number(m.location) & 0x04) !== 0)) && m.code === code("Elemental HERO Sparkman"));
    expect(played).toBe(true);
  });

  it("chains Raigeki Break to Demise's wipe instead of losing it unused (duel 368)", () => {
    const p = play(dc, {
      npcId: 57, first: "player", turns: 1,
      npc: { hand: ["Fire Princess"], szone: ["Raigeki Break"], mzone: [["The Forgiving Maiden", "set"]] },
      player: { mzone: ["Demise, King of Armageddon"] },
      player_policy: activating("Demise, King of Armageddon"),
    });
    expect(npcActivated(p, "Raigeki Break")).toBe(true);
  });

  it("Ring of Destruction takes the 1200 that attacks directly (duel 385)", () => {
    const p = play(dc, {
      npcId: 44, first: "player", turns: 3,
      npc: { lp: 4800, szone: ["Ring of Destruction"], deck: Array(20).fill('Spirit Message "A"') },
      player: { mzone: ["Pyramid Turtle"] },
      player_policy: attacker,
    });
    expect(npcActivated(p, "Ring of Destruction")).toBe(true);
    expect(leftField(p, "Pyramid Turtle")).toBe(true);
  });

  it("Raigeki Break destroys the attacker, not the monster beside it (duel 406)", () => {
    const p = play(dc, {
      npcId: 7, first: "npc", turns: 2,
      npc: { hand: ["Petit Moth"], szone: ["Raigeki Break"] },
      player: { mzone: ["Armageddon Knight", ["Brron, Mad King of Dark World", "def"]] },
      player_policy: attacker,
    });
    if (npcActivated(p, "Raigeki Break")) {
      expect(leftField(p, "Armageddon Knight")).toBe(true);
      expect(leftField(p, "Brron, Mad King of Dark World")).toBe(false);
    }
    expect(p.msgs.some((m) => m.type === "DAMAGE" && Number(m.player) === 1)).toBe(false);
  });

  it("the second Giant Rat's trigger is used too (duel 403)", () => {
    const p = play(dc, {
      npcId: 2, first: "npc", turns: 2,
      npc: { mzone: ["Giant Rat", "Giant Rat"], deck: Array(20).fill("Giant Rat") },
      player: { mzone: ["Wulf, Lightsworn Beast", "Celestia, Lightsworn Angel"] },
      player_policy: attacker,
    });
    const rats = p.msgs.filter((m) => m.type === "SPSUMMONING" && m.code === code("Giant Rat")).length;
    expect(rats).toBeGreaterThanOrEqual(2);
  });

  it("sets Mirror Force before flipping Morphing Jar (duel 397)", () => {
    const p = play(dc, {
      npcId: 56, first: "player", turns: 2,
      npc: { hand: ["Mirror Force", "Fiend's Sanctuary"], mzone: [["Morphing Jar", "set"]] },
      player: { mzone: ["Garoth, Lightsworn Warrior", "Wulf, Lightsworn Beast"] },
    });
    const flip = p.msgs.findIndex((m) => m.type === "FLIPSUMMONING" && m.code === code("Morphing Jar"));
    const set = p.msgs.findIndex((m) => m.type === "SET" && m.code === code("Mirror Force"));
    if (flip >= 0) expect(set >= 0 && set < flip).toBe(true);
  });

  it("gives Lava Golem to the opponent under its own Level Limit - Area B (duel 391)", () => {
    const p = play(dc, {
      npcId: 1, first: "player", turns: 2,
      npc: { hand: ["Lava Golem"], szone: [["Level Limit - Area B", "up"]] },
      player: { mzone: [["Wulf, Lightsworn Beast", "def"], ["Celestia, Lightsworn Angel", "def"]] },
    });
    expect(msgs(p, "SPSUMMONING", "Lava Golem")).toHaveLength(1);
  });

  // ---- AI rev 8's live duels (rev8-review: duel_archive 428-469)
  it("uses Mausoleum of the Emperor's summon once it is on the field (duel 450)", () => {
    const p = play(dc, {
      npcId: 38, first: "player", turns: 2,
      npc: { hand: ["Dark Magician of Chaos", "Mausoleum of the Emperor"], mzone: ["Jinzo"], deck: Array(20).fill("Reckless Greed") },
      player: { mzone: [["Mystic Tomato", "set"]] },
    });
    expect(msgs(p, "SUMMONING", "Dark Magician of Chaos")).toHaveLength(1);
  });

  it("springs Ojama Trio on the opponent's turn when it fills their last three zones (duel 431)", () => {
    const p = play(dc, {
      npcId: 65, first: "player", turns: 1,
      npc: { szone: ["Ojama Trio"] },
      player: { mzone: ["Mezuki", "Ryko, Lightsworn Hunter"] },
    });
    expect(npcActivated(p, "Ojama Trio")).toBe(true);
  });

  it("Mirror Force on the first of three attacks, even into its own wall (duel 442)", () => {
    const p = play(dc, {
      npcId: 40, first: "npc", turns: 2,
      npc: { mzone: [["Big Shield Gardna", "set"]], szone: ["Mirror Force"], deck: Array(20).fill("Reckless Greed") },
      player: { mzone: ["Brron, Mad King of Dark World", "Goldd, Wu-Lord of Dark World", "Sillva, Warlord of Dark World"] },
      player_policy: attacker,
    });
    expect(npcActivated(p, "Mirror Force")).toBe(true);
    expect(msgs(p, "ATTACK")).toHaveLength(1);
  });

  it("stacks its burn traps with Chain Strike on top for lethal (duel 466)", () => {
    const p = play(dc, {
      npcId: 32, first: "player", turns: 1,
      npc: { szone: ["Secret Barrel", "Just Desserts", "Chain Strike"] },
      player: { lp: 3000, hand: ["Petit Moth", "Petit Moth", "Petit Moth", "Petit Moth", "Petit Moth"], mzone: ["Mezuki", "Ryko, Lightsworn Hunter"] },
    });
    expect(npcActivated(p, "Chain Strike")).toBe(true);
    expect(p.end?.winner).toBe(1);
  });

  it("empties its field of traps under a direct attack to bring out Gorz (duel 432)", () => {
    const p = play(dc, {
      npcId: 32, first: "npc", turns: 2,
      npc: { hand: ["Gorz the Emissary of Darkness"], szone: ["Secret Barrel", "Just Desserts"], deck: Array(20).fill("Reckless Greed") },
      player: { mzone: ["Zombie Master"] },
      player_policy: attacker,
    });
    expect(msgs(p, "SPSUMMONING", "Gorz the Emissary of Darkness")).toHaveLength(1);
  });

  it("sets an Exodia piece to stop a lethal attack (duel 441)", () => {
    const p = play(dc, {
      npcId: 44, first: "npc", turns: 2,
      npc: { lp: 1300, hand: ["Left Arm of the Forbidden One"], deck: Array(20).fill("Reckless Greed") },
      player: { mzone: ["Celestia, Lightsworn Angel"] },
      player_policy: attacker,
    });
    expect(msgs(p, "SET", "Left Arm of the Forbidden One")).toHaveLength(1);
    expect(p.end?.winner).not.toBe(0);
  });

  it("Gravity Bind goes up before the attack, not after it is declared (duel 441)", () => {
    const p = play(dc, {
      npcId: 44, first: "npc", turns: 2,
      npc: { szone: ["Gravity Bind"], deck: Array(20).fill("Reckless Greed") },
      player: { hand: ["Gene-Warped Warwolf"] },
      player_policy: summoning(attacker),
    });
    expect(npcActivated(p, "Gravity Bind")).toBe(true);
    expect(msgs(p, "ATTACK")).toHaveLength(0);
  });

  it("attacks with Brain Controlled monsters before tributing them (duel 448)", () => {
    const p = play(dc, {
      npcId: 35, first: "player", turns: 2,
      npc: { hand: ["Brain Control", "Cosmic Horror Gangi'el", "Brain Control"], deck: Array(20).fill("Reckless Greed") },
      player: { mzone: ["Goldd, Wu-Lord of Dark World", "Brron, Mad King of Dark World"] },
    });
    const summon = p.msgs.findIndex((m) => m.type === "SUMMONING");
    const attack = p.msgs.findIndex((m) => m.type === "ATTACK");
    expect(attack).toBeGreaterThanOrEqual(0);
    if (summon >= 0) expect(attack).toBeLessThan(summon);
  });

  // ---- rev 10 (rev 8's duels 470-670)
  it("casts Megamorph when it makes the attack lethal (duel 512)", () => {
    const p = play(dc, {
      npcId: 66, first: "player", turns: 2,
      npc: { lp: 2300, hand: ["Megamorph"], mzone: ["Etoile Cyber"], szone: [["The A. Forces", "up"]], deck: Array(20).fill("Reckless Greed") },
      player: { lp: 2400 },
    });
    expect(npcActivated(p, "Megamorph")).toBe(true);
    expect(p.end?.winner).toBe(1);
  });

  it("feeds Overload Fusion every Machine it can for a lethal Chimeratech Overdragon (duel 588)", () => {
    const p = play(dc, {
      npcId: 80, first: "player", turns: 2,
      npc: { lp: 3400, hand: ["Overload Fusion"], mzone: ["Proto-Cyber Dragon"],
        grave: ["Red Gadget", "Drillroid", "Yellow Gadget", "Green Gadget", "Cyber Dragon"],
        extra: ["Chimeratech Overdragon"], deck: Array(20).fill("Reckless Greed") },
      player: { lp: 1900, mzone: ["Goldd, Wu-Lord of Dark World"] },
    });
    expect(npcActivated(p, "Overload Fusion")).toBe(true);
    expect(p.end?.winner).toBe(1);
  });

  it("casts the next hand spell after one resolves in the same hand slot (duel 503)", () => {
    const p = play(dc, {
      npcId: 49, first: "player", turns: 2,
      npc: { hand: ["Tremendous Fire", "Restructer Revolution"], deck: Array(20).fill("Reckless Greed") },
      player: { hand: ["Petit Moth", "Petit Moth", "Petit Moth"], mzone: ["Mystic Tomato"] },
    });
    expect(npcActivated(p, "Tremendous Fire")).toBe(true);
    expect(npcActivated(p, "Restructer Revolution")).toBe(true);
  });

  it("raises Swords of Revealing Light at 600 LP against an empty field and a full hand (duel 507)", () => {
    const p = play(dc, {
      npcId: 3, first: "player", turns: 2,
      npc: { lp: 600, hand: ["Swords of Revealing Light"], deck: Array(20).fill("Reckless Greed") },
      player: { hand: ["Petit Moth", "Petit Moth", "Petit Moth", "Petit Moth", "Petit Moth"] },
    });
    expect(npcActivated(p, "Swords of Revealing Light")).toBe(true);
  });

  it("summons Snipe Hunter with an Ojama to discard to it (duel 654)", () => {
    const p = play(dc, {
      npcId: 65, first: "player", turns: 2,
      npc: { hand: ["Snipe Hunter", "Ojama Green", "Ojama Black"], deck: Array(20).fill("Reckless Greed") },
      player: { mzone: ["Lyla, Lightsworn Sorceress", "Garoth, Lightsworn Warrior"] },
    });
    expect(msgs(p, "SUMMONING", "Snipe Hunter")).toHaveLength(1);
  });

  it("searches Bladedge with Necroshade in the graveyard and summons it without a tribute (duel 579)", () => {
    const p = play(dc, {
      npcId: 61, first: "player", turns: 2,
      npc: { hand: ["E - Emergency Call"], grave: ["Elemental HERO Necroshade"],
        deck: [...Array(5).fill("Elemental HERO Sparkman"), "Elemental HERO Bladedge", "Elemental HERO Clayman", ...Array(10).fill("Reckless Greed")] },
      player: { mzone: ["Goldd, Wu-Lord of Dark World"] },
    });
    expect(msgs(p, "SUMMONING", "Elemental HERO Bladedge")).toHaveLength(1);
  });

  it("keeps King of the Swamp as a blocker against lethal with a dead Polymerization (duel 579)", () => {
    const p = play(dc, {
      npcId: 61, first: "npc", turns: 2,
      npc: { lp: 4600, hand: ["R - Righteous Justice", "Fusion Recovery", "King of the Swamp"], deck: Array(20).fill("Reckless Greed") },
      player: { mzone: ["Brron, Mad King of Dark World", "Goldd, Wu-Lord of Dark World", "Brron, Mad King of Dark World"] },
    });
    expect(npcActivated(p, "King of the Swamp")).toBe(false);
  });

  it("casts Royal Tribute under its Necrovalley (duel 561)", () => {
    const p = play(dc, {
      npcId: 31, first: "npc", turns: 1,
      npc: { hand: ["Necrovalley", "Royal Tribute"], deck: Array(20).fill("Reckless Greed") },
      player: { hand: ["Petit Moth", "Petit Moth", "Petit Moth", "Petit Moth", "Petit Moth"] },
    });
    expect(npcActivated(p, "Royal Tribute")).toBe(true);
  });

  it("does not banish D.D. Warrior Lady with a monster the battle destroys anyway (duel 512)", () => {
    const p = play(dc, {
      npcId: 66, first: "player", turns: 2,
      npc: { mzone: ["D.D. Warrior Lady"], deck: Array(20).fill("Reckless Greed") },
      player: { mzone: ["Armageddon Knight"] },
    });
    expect(leftField(p, "Armageddon Knight")).toBe(true);
    expect(leftField(p, "D.D. Warrior Lady")).toBe(false);
  });

  it("attacks directly with Spell Striker past a bigger monster (duel 507)", () => {
    const p = play(dc, {
      npcId: 3, first: "player", turns: 2,
      npc: { mzone: ["Spell Striker"], deck: Array(20).fill("Reckless Greed") },
      player: { mzone: ["Mystic Tomato"] },
    });
    expect(msgs(p, "ATTACK").length).toBeGreaterThanOrEqual(1);
    expect(msgs(p, "DAMAGE").length).toBeGreaterThanOrEqual(1);
  });

  it("summons a body face-up into an empty field and backrow (duel 565)", () => {
    const p = play(dc, {
      npcId: 66, first: "player", turns: 2,
      npc: { hand: ["Warrior Lady of the Wasteland", "Call of the Haunted"], deck: Array(20).fill("Reckless Greed") },
      player: {},
    });
    expect(msgs(p, "SUMMONING", "Warrior Lady of the Wasteland")).toHaveLength(1);
    expect(msgs(p, "ATTACK")).toHaveLength(1);
  });
});
