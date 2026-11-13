import { existsSync } from "node:fs";
import { join } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import type { DuelCore } from "../src/duel/engine/core.ts";
import { createNodeDuelCore, ENGINE_DATA_DIR } from "../src/duel/engine/node.ts";
import { npcDeck, toCodes } from "../src/duel/data.ts";
import { deckNpc } from "../src/duel/npcRules.ts";
import { nrThreshold } from "../src/game/npcs.ts";
import { check } from "../src/duel/deckCheck.ts";
import { leftField, msgs, npcActivated, play, attacker, passive, code } from "./npcScenario.ts";

describe.skipIf(!existsSync(join(ENGINE_DATA_DIR, "scripts.pack")))("Hell Kaiser on the real engine", () => {
  let dc: DuelCore;
  beforeAll(async () => { dc = await createNodeDuelCore(); }, 60_000);

  it.each([78, 79, 80])("recipe %i uses forty supported cards with only the owner's boss ban-list exceptions", (id) => {
    const deck = npcDeck(id)!;
    expect(deck.main).toHaveLength(40);
    expect(toCodes([...deck.main, ...deck.extra])).toEqual([...deck.main, ...deck.extra]);
    const trunk = Object.fromEntries([...deck.main, ...deck.extra].map(c => [String(c), 3]));
    // Boss recipes may use forbidden/limited cards, but still obey zones and the three-copy maximum.
    expect(check(deck.main, deck.extra, trunk, false)).toEqual([]);
  });

  it("progresses to the strongest Cyberdark recipe in the final slot", () => {
    const points = new Map<number, number>();
    const current = () => deckNpc(78, id => [0, 0, 0, points.get(id) ?? 0]);
    expect(current()).toBe(78);
    points.set(78, nrThreshold(78));
    expect(current()).toBe(79);
    expect(npcDeck(current())!.main).toContain(70095154); // Cyber Dragon
    points.set(79, nrThreshold(79));
    expect(current()).toBe(80);
    expect(npcDeck(current())!.main).toContain(41230939); // Cyberdark Horn
    expect(npcDeck(current())!.extra).toContain(40418351); // Cyberdark Dragon
  });

  it("buries Hunter Dragon before summoning Cyberdark Horn (duel 786)", () => {
    const p = play(dc, {
      npcId: 80, first: "player", turns: 2,
      npc: { hand: ["Foolish Burial", "Cyberdark Horn", "Masked Dragon"], deck: ["Hunter Dragon", ...Array(12).fill("Petit Moth")] },
      player: { mzone: ["Jain, Lightsworn Paladin"] },
    });
    expect(npcActivated(p, "Foolish Burial")).toBe(true);
    expect(msgs(p, "SUMMONING", "Cyberdark Horn")).toHaveLength(1);
    expect(leftField(p, "Jain, Lightsworn Paladin")).toBe(true);
  });

  it.each(["Cyberdark Horn", "Cyberdark Edge", "Cyberdark Keel"])("chooses an equipped %s over a bare Hunter Dragon (duel 911)", cyberdark => {
    const p = play(dc, {
      npcId: 80, first: "player", turns: 2,
      npc: { hand: ["Hunter Dragon", cyberdark, "Hunter Dragon"], grave: ["Hunter Dragon"] },
      player: {},
    });
    expect(msgs(p, "SUMMONING", cyberdark)).toHaveLength(1);
    expect(msgs(p, "SUMMONING", "Hunter Dragon")).toHaveLength(0);
    expect(p.log.some(line => line.includes("LP 8000 -> 5500"))).toBe(true);
  });

  it("uses Foolish Burial's setup with Horn even when Hunter Dragon is also summonable", () => {
    const p = play(dc, {
      npcId: 80, first: "player", turns: 2,
      npc: { hand: ["Hunter Dragon", "Cyberdark Horn", "Foolish Burial"], deck: ["Hunter Dragon", "Hunter Dragon", ...Array(12).fill("Petit Moth")] },
      player: { mzone: ["Lyla, Lightsworn Sorceress"] },
    });
    expect(npcActivated(p, "Foolish Burial")).toBe(true);
    expect(msgs(p, "SUMMONING", "Cyberdark Horn")).toHaveLength(1);
    expect(leftField(p, "Lyla, Lightsworn Sorceress")).toBe(true);
  });

  it("does not prefer an unequipped Cyberdark when no Dragon is in the graveyard", () => {
    const p = play(dc, {
      npcId: 80, first: "player", turns: 2,
      npc: { hand: ["Hunter Dragon", "Cyberdark Horn"], grave: ["Sangan"] }, player: {},
    });
    expect(msgs(p, "SUMMONING", "Hunter Dragon")).toHaveLength(1);
    expect(msgs(p, "SUMMONING", "Cyberdark Horn")).toHaveLength(0);
  });

  it("counts a legal Masked Dragon equip instead of relying on Hunter Dragon by name", () => {
    const p = play(dc, {
      npcId: 80, first: "player", turns: 2,
      npc: { hand: ["Hunter Dragon", "Cyberdark Horn"], grave: ["Masked Dragon"] }, player: {},
    });
    expect(msgs(p, "SUMMONING", "Cyberdark Horn")).toHaveLength(1);
    expect(p.log.some(line => line.includes("LP 8000 -> 5800"))).toBe(true);
  });

  it("sees lethal with the equipped Cyberdark instead of summoning the weaker Dragon", () => {
    const p = play(dc, {
      npcId: 80, first: "player", turns: 2,
      npc: { hand: ["Hunter Dragon", "Cyberdark Horn"], grave: ["Hunter Dragon"] },
      player: { lp: 2400 },
    });
    expect(msgs(p, "SUMMONING", "Cyberdark Horn")).toHaveLength(1);
    expect(p.end?.winner).toBe(1);
  });

  it.each(["level four Dragon", "full backrow", "Skill Drain", "Necrovalley"])("does not count an unavailable equip: %s", blocked => {
    const p = play(dc, {
      npcId: 80, first: "player", turns: 2,
      npc: { hand: ["Hunter Dragon", "Cyberdark Horn"],
        grave: [blocked === "level four Dragon" ? "Luster Dragon" : "Hunter Dragon"],
        szone: blocked === "full backrow" ? Array(5).fill(["Call of the Haunted", "up"])
          : blocked === "Skill Drain" ? [["Skill Drain", "up"]]
          : blocked === "Necrovalley" ? [["Necrovalley", "up"]] : [] },
      player: {},
    });
    expect(msgs(p, "SUMMONING", "Hunter Dragon")).toHaveLength(1);
    expect(msgs(p, "SUMMONING", "Cyberdark Horn")).toHaveLength(0);
  });

  it("keeps its only graveyard Dragon for Cyberdark instead of reviving it first", () => {
    const p = play(dc, {
      npcId: 80, first: "player", turns: 2,
      npc: { hand: ["Cyberdark Keel", "Premature Burial"], grave: ["Hunter Dragon", "Card Trooper"] },
      player: { mzone: ["Wulf, Lightsworn Beast"] },
    });
    expect(msgs(p, "SPSUMMONING", "Hunter Dragon")).toHaveLength(0);
    expect(leftField(p, "Wulf, Lightsworn Beast")).toBe(true);
  });

  it.each([false, true])("removes Lyla whichever attack Gardna stops: decline first attack = %s", saveGardna => {
    let attackWindows = 0;
    const p = play(dc, {
      npcId: 80, first: "player", turns: 2,
      npc: { hand: ["Cyberdark Horn"], mzone: ["Hunter Dragon"], grave: ["Hunter Dragon"], szone: ["Mirror Force"] },
      player: { mzone: ["Lyla, Lightsworn Sorceress"], grave: ["Necro Gardna"] },
      player_policy: sel => {
        if (sel.type === "SELECT_CHAIN" && (Number(sel.hint_timing_other) & 4096)) {
          const i = (sel.selects as any[]).findIndex(c => c.code === code("Necro Gardna"));
          if (i >= 0 && (!saveGardna || attackWindows++ > 0)) return { type: "SELECT_CHAIN", index: i };
        }
        return passive(sel);
      },
    });
    const first = p.npc.find(d => d.sel.type === "SELECT_BATTLECMD" && d.resp?.action === "SELECT_BATTLE")!;
    expect(first).toBeDefined();
    expect(leftField(p, "Lyla, Lightsworn Sorceress")).toBe(true);
  });

  it.each([false, true])("does not invent Lyla's removal threat with no usable effect: Skill Drain = %s", skillDrain => {
    const p = play(dc, {
      npcId: 80, first: "player", turns: 2,
      npc: { mzone: ["Hunter Dragon"], szone: skillDrain ? [["Skill Drain", "up"]] : [] },
      player: { mzone: ["Lyla, Lightsworn Sorceress"] },
    });
    expect(leftField(p, "Lyla, Lightsworn Sorceress")).toBe(false);
  });

  it("plays all three Pots of Greed even when another copy moves into the same hand slot", () => {
    const p = play(dc, {
      npcId: 79, first: "npc", turns: 1,
      npc: { hand: ["Pot of Greed", "Pot of Greed", "Pot of Greed"] }, player: {},
    });
    expect(msgs(p, "CHAINING", "Pot of Greed")).toHaveLength(3);
  });

  it("sets up Chimeratech with Future Fusion instead of holding it (duel 807)", () => {
    const p = play(dc, {
      npcId: 79, first: "player", turns: 2,
      npc: { hand: ["Future Fusion", "Overload Fusion"], extra: ["Chimeratech Overdragon"],
        deck: ["Cyber Dragon", "Cyber Phoenix", "Drillroid", "Dekoichi the Battlechanted Locomotive", ...Array(16).fill("Petit Moth")] },
      player: { mzone: ["Lyla, Lightsworn Sorceress"] },
    });
    expect(npcActivated(p, "Future Fusion")).toBe(true);
    expect(npcActivated(p, "Overload Fusion")).toBe(true);
    expect(msgs(p, "SPSUMMONING", "Chimeratech Overdragon")).toHaveLength(1);
    expect(leftField(p, "Lyla, Lightsworn Sorceress")).toBe(true);
  });

  it("prepares a strong Chimeratech without dumping the entire deck", () => {
    const p = play(dc, {
      npcId: 79, first: "player", turns: 2,
      npc: { hand: ["Future Fusion", "Overload Fusion"], extra: ["Chimeratech Overdragon"],
        deck: ["Cyber Dragon", ...Array(12).fill("Cyber Phoenix"), ...Array(16).fill("Petit Moth")] },
      player: { mzone: ["Jain, Lightsworn Paladin"] },
    });
    const dumped = p.msgs.filter(m => m.type === "MOVE" && Number((m.from as any)?.controller) === 1
      && Number((m.from as any)?.location) === 1 && Number((m.to as any)?.location) === 16);
    expect(dumped).toHaveLength(8);
    expect(leftField(p, "Jain, Lightsworn Paladin")).toBe(true);
  });

  it("does not use Limiter Removal to defend a defence-position monster (duel 748)", () => {
    const p = play(dc, {
      npcId: 78, first: "player", turns: 3,
      npc: { mzone: [["Reflect Bounder", "def"], "Cyber Dragon"], szone: ["Limiter Removal"] },
      player: { mzone: ["Blue-Eyes White Dragon"] }, player_policy: attacker,
    });
    expect(npcActivated(p, "Limiter Removal")).toBe(false);
  });

  it("does not count a spent attack as Limiter Removal lethal", () => {
    const p = play(dc, {
      npcId: 78, first: "player", turns: 2,
      npc: { mzone: ["Reflect Bounder", "Cyber Dragon"], szone: ["Limiter Removal"] },
      player: { mzone: ["Lyla, Lightsworn Sorceress"] },
    });
    expect(npcActivated(p, "Limiter Removal")).toBe(false);
  });

  it("uses Limiter Removal when the remaining Machine attacks really win", () => {
    const p = play(dc, {
      npcId: 78, first: "player", turns: 2,
      npc: { mzone: ["Cyber Dragon"], hand: ["Limiter Removal"] },
      player: { lp: 4000 },
    });
    expect(npcActivated(p, "Limiter Removal")).toBe(true);
    expect(p.end?.winner).toBe(1);
  });

  it("Power Bond chooses Cyber Twin for lethal rather than a smaller fusion", () => {
    const p = play(dc, {
      npcId: 78, first: "player", turns: 2,
      npc: { hand: ["Power Bond", "Cyber Dragon", "Cyber Dragon"], extra: ["Cyber Twin Dragon", "Chimeratech Overdragon"] },
      player: { lp: 8000 },
    });
    expect(npcActivated(p, "Power Bond")).toBe(true);
    expect(p.end?.winner).toBe(1);
  });

  it("keeps Cyber Twin's two attacks instead of consuming it for Chimeratech", () => {
    const p = play(dc, {
      npcId: 78, first: "player", turns: 2,
      npc: { mzone: ["Cyber Twin Dragon"], hand: ["Cyber Dragon", "Power Bond"],
        extra: ["Cyber Twin Dragon", "Chimeratech Overdragon"] },
      player: { lp: 2800, mzone: [["Petit Moth", "set"]] },
    });
    expect(npcActivated(p, "Power Bond")).toBe(false);
    expect(p.end?.winner).toBe(1);
  });
});
