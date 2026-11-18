import { beforeAll, expect, it } from "vitest";
import { createNodeDuelCore } from "../src/duel/engine/node.ts";
import type { DuelCore, Json } from "../src/duel/engine/core.ts";
import { YUGI_HEART_POOL } from "../src/duel/yugiHeartPool.ts";
import { code, play, npcActivated, leftField, activating, passive } from "./npcScenario.ts";
let dc: DuelCore;
beforeAll(async () => { dc = await createNodeDuelCore(); }, 60000);
it.each([0, 1] as const)("silently materialises a missing card before Yugi's normal draw, first seat %i", first => {
  const id = "yugi-skill-probe-" + first;
  let evs = dc.new(id, [{ main: Array(20).fill(code("Petit Moth")), extra: [] },
    { main: Array(20).fill(code("Petit Moth")), extra: [] }],
    { first, rule: "MR1", shuffle: false, brain: [true, true], heart_of_cards: 1, heart_copy_limit: 3, heart_pool: [code("Raigeki")], setup: { draw: 0 } });
  let sorts = 0, drew = false;
  for (let n = 0; n < 100; n++) {
    const sel = evs.at(-1)!;
    if (sel.ev === "end" || Number(sel.turn) > 2) break;
    let r: Json | null = null;
    if (sel.type === "ANNOUNCE_CARD" && sel.heart_of_cards) {
      const rejected = dc.respond(id, { type: "ANNOUNCE_CARD", card: code("Blue-Eyes White Dragon") }, Number(sel.player));
      expect(rejected.at(-1)?.ev).toBe("error");
      expect(String(rejected.at(-1)?.error)).toContain("outside Yugi theme pool");
      r = { type: "ANNOUNCE_CARD", card: code("Raigeki") }; sorts++;
    } else if (sel.type === "SELECT_IDLECMD") {
      if (sel.player === 1) {
        const hand = ((sel.view as any).players[1].hand as number[]);
        drew = hand.includes(code("Raigeki")); break;
      }
      r = { type: "SELECT_IDLECMD", action: "TO_EP", index: null };
    }
    evs = r ? dc.respond(id, r, Number(sel.player)) : dc.auto(id);
  }
  dc.end(id);
  expect(sorts).toBe(1);
  expect(drew).toBe(true);
});

it("uses the engine forecast to draw an immediate answer to a losing board", () => {
  const p = play(dc, { npcId: 51, heart_of_cards: 1, heart_pool: [code("Raigeki"), code("Petit Moth")], first: "player", turns: 2,
    npc: { lp: 1000, deck: ["Raigeki", ...Array(19).fill("Petit Moth")] },
    player: { mzone: ["Blue-Eyes White Dragon"] } });
  expect(p.npc.some(x => x.sel.heart_of_cards === true)).toBe(true);
  expect(npcActivated(p, "Raigeki")).toBe(true);
  expect(leftField(p, "Blue-Eyes White Dragon")).toBe(true);
});

it.each(["npc", "player"] as const)("Convulsion disables the skill from either field: %s", side => {
  const deck = [...Array(10).fill("Petit Moth"), "Raigeki", ...Array(10).fill("Petit Moth")];
  const p = play(dc, { npcId: 51, heart_of_cards: 1, heart_pool: [code("Raigeki"), code("Petit Moth")], first: "player", turns: 2,
    npc: { deck, ...(side === "npc" ? { szone: [["Convulsion of Nature", "up"] as [string, "up"]] } : {}) },
    player: { mzone: ["Blue-Eyes White Dragon"], ...(side === "player" ? { szone: [["Convulsion of Nature", "up"] as [string, "up"]] } : {}) } });
  expect(p.npc.some(x => x.sel.heart_of_cards === true)).toBe(false);
  expect(npcActivated(p, "Raigeki")).toBe(false);
});

it.each([1, 5])("a temporary top-%i reveal blocks those draws, then the skill resumes", count => {
  const p = play(dc, { npcId: 51, heart_of_cards: 1, heart_pool: [code("Raigeki"), code("Petit Moth")], first: "player", turns: 12,
    npc: { deck: ["Raigeki", ...Array(19).fill("Petit Moth")] },
    player: { hand: ["Ancient Telescope"], mzone: ["Blue-Eyes White Dragon"] }, player_policy: sel => sel.type === "ANNOUNCE_NUMBER" ? { type: "ANNOUNCE_NUMBER", value: count - 1 } : activating("Ancient Telescope")(sel) });
  expect(p.npc.filter(x => x.sel.heart_of_cards === true).map(x => x.turn)).toEqual(Array.from({ length: 6 - count }, (_, i) => 2 * (count + 1 + i)));
});

it("preserves a Pot of Greed draw as one two-card draw event", () => {
  const p = play(dc, { npcId: 51, heart_of_cards: 1, heart_pool: [code("Raigeki"), code("Petit Moth")], first: "player", turns: 2,
    npc: { hand: ["Pot of Greed"], deck: ["Raigeki", "Monster Reborn", ...Array(18).fill("Petit Moth")] },
    player: { mzone: ["Blue-Eyes White Dragon"] } });
  expect(npcActivated(p, "Pot of Greed")).toBe(true);
  const draws = p.msgs.filter(m => m.type === "DRAW" && m.player === 1);
  expect(draws.map(m => (m as any).drawn?.length)).toEqual([1, 2]);
});

it("respects a publicly returned top card from Phoenix Wing Wind Blast", () => {
  const p = play(dc, { npcId: 51, heart_of_cards: 1, heart_pool: [code("Raigeki"), code("Petit Moth")], first: "player", turns: 2,
    npc: { mzone: ["Dark Magician"], deck: ["Raigeki", ...Array(19).fill("Petit Moth")] },
    player: { hand: ["Petit Moth"], szone: ["Phoenix Wing Wind Blast"] }, player_policy: activating("Phoenix Wing Wind Blast") });
  expect(p.msgs.some(m => m.type === "MOVE" && m.card === code("Dark Magician") && (m.to as any)?.location === 1)).toBe(true);
  expect(p.npc.some(x => x.sel.heart_of_cards === true)).toBe(false);
  const idle = p.npc.find(x => x.sel.type === "SELECT_IDLECMD" && x.turn === 2);
  expect((idle?.sel.view as any).players[1].hand).toContain(code("Dark Magician"));
});

it("keeps a broad playable pool while excluding off-brand Heroes and Kaiba's Blue-Eyes", () => {
  expect(YUGI_HEART_POOL.length).toBeGreaterThan(500);
  for (const name of ["Dark Magician", "Slifer the Sky Dragon", "Pot of Greed", "Raigeki"])
    expect(YUGI_HEART_POOL).toContain(dc.cardDB.get(code(name))?.alias || code(name));
  for (const name of ["Elemental HERO Avian", "Destiny HERO - Disk Commander", "Blue-Eyes White Dragon", "Exodia the Forbidden One", "Left Arm of the Forbidden One", "Final Countdown", "Destiny Board"])
    expect(YUGI_HEART_POOL).not.toContain(code(name));
  expect(YUGI_HEART_POOL.every(c => dc.cardDB.get(c))).toBe(true);
  expect(YUGI_HEART_POOL.every(c => !dc.cardDB.get(c)!.alias)).toBe(true);
});

it("accepts every virtual-pool passcode in the native announcement and draws its real identity", () => {
  for (const c of YUGI_HEART_POOL) {
    const id = "yugi-pool-" + c, d = { main: Array(3).fill(code("Petit Moth")), extra: [] };
    let evs = dc.new(id, [d, d], { first: 1, rule: "MR1", shuffle: false, brain: [true, true], setup: { draw: 0 }, heart_of_cards: 1, heart_copy_limit: 3, heart_pool: [c] });
    try {
      for (let n = 0; n < 30 && !evs.at(-1)?.heart_of_cards; n++) evs = dc.auto(id);
      expect(evs.at(-1)?.heart_of_cards, dc.cardDB.name(c)).toBe(true);
      evs = dc.respond(id, { type: "ANNOUNCE_CARD", card: c }, 1);
      expect(evs.at(-1)?.retry, dc.cardDB.name(c)).toBeFalsy();
      expect(evs.some(e => e.ev === "msg" && e.type === "DRAW" && (e.drawn as any[]).some(d => d.code === c)), dc.cardDB.name(c)).toBe(true);
    } finally { dc.end(id); }
  }
}, 60000);

it("uses the full virtual pool to complete Yugi's Dark Paladin fusion", () => {
  const p = play(dc, { npcId: 52, heart_of_cards: 1, first: "player", turns: 2,
    npc: { hand: ["Dark Magician", "Polymerization"], deck: Array(20).fill("Mystical Elf"), extra: ["Dark Paladin"] },
    player: { mzone: ["Blue-Eyes White Dragon"] } });
  expect(p.npc.filter(x => x.sel.heart_of_cards).map(x => x.resp?.card).some(c => c === code("Buster Blader") || c === code("King of the Swamp"))).toBe(true);
  expect(npcActivated(p, "Polymerization")).toBe(true);
  expect(p.msgs.some(m => m.type === "SPSUMMONING" && m.code === code("Dark Paladin"))).toBe(true);
  expect(p.npc.length).toBeLessThan(150);
  expect(p.msgs.filter(m => m.type === "CHAINING").every(m => Number(m.code) > 0)).toBe(true);
}, 60000);

it("completes the Magnet Warriors and wins through Valkyrion in battle", () => {
  // No burn or removal in this pool: with them, 500 LP is a one-card win (the next test).
  const p = play(dc, { npcId: 53, heart_of_cards: 1, first: "player", turns: 2,
    heart_pool: ["Gamma The Magnet Warrior", "Marshmallon", "Mirror Force", "Pot of Greed"].map(code),
    npc: { hand: ["Alpha The Magnet Warrior", "Beta The Magnet Warrior", "Valkyrion the Magna Warrior"], deck: Array(20).fill("Petit Moth") },
    player: { lp: 500, mzone: ["Blue-Eyes White Dragon"] } });
  expect(p.npc.filter(x => x.sel.heart_of_cards).map(x => x.resp?.card)).toContain(code("Gamma The Magnet Warrior"));
  expect(p.msgs.some(m => m.type === "SPSUMMONING" && m.code === code("Valkyrion the Magna Warrior"))).toBe(true);
  expect(p.end?.winner).toBe(1);
  expect(p.end?.reason).not.toBe(16);
});

it("draws and casts a burn spell that ends the duel before any battle", () => {
  const p = play(dc, { npcId: 53, heart_of_cards: 1, first: "player", turns: 2,
    npc: { hand: ["Alpha The Magnet Warrior", "Beta The Magnet Warrior", "Valkyrion the Magna Warrior"], deck: Array(20).fill("Petit Moth") },
    player: { lp: 500, mzone: ["Blue-Eyes White Dragon"], szone: ["Waboku", "Mirror Force"] } });
  const drawn = p.npc.filter(x => x.sel.heart_of_cards).map(x => dc.cardDB.name(Number(x.resp?.card)));
  expect(["Ookazi", "Tremendous Fire", "Poison of the Old Man", "Final Flame", "Hinotama"]).toContain(drawn[0]);
  expect(npcActivated(p, drawn[0]!)).toBe(true);
  expect(p.end?.winner).toBe(1);
});

it("uses an existing Pot of Greed to draw duel pieces without chaining new draw cards", () => {
  const p = play(dc, { npcId: 53, heart_of_cards: 1, first: "player", turns: 2,
    npc: { hand: ["Pot of Greed", "Alpha The Magnet Warrior", "Beta The Magnet Warrior", "Valkyrion the Magna Warrior"], deck: Array(20).fill("Petit Moth") },
    player: { mzone: ["Blue-Eyes White Dragon"] } });
  expect(npcActivated(p, "Pot of Greed")).toBe(true);
  const drawn = p.npc.filter(x => x.sel.heart_of_cards).map(x => Number(x.resp?.card));
  expect(drawn.length).toBeGreaterThan(1);
  expect(drawn.every(c => !dc.cardDB.name(c).toLowerCase().includes("forbidden one") && ![code("Pot of Greed"), code("Graceful Charity"), code("Upstart Goblin")].includes(c))).toBe(true);
  expect(p.npc.length).toBeLessThan(150);
});

it("draws Dark Magic Attack to free Dark Magician for the winning attack", () => {
  const p = play(dc, { npcId: 52, heart_of_cards: 1, first: "player", turns: 2,
    npc: { mzone: ["Dark Magician"], deck: Array(20).fill("Petit Moth") },
    player: { lp: 2500, szone: [["Gravity Bind", "up"]] } });
  expect(p.npc.filter(x => x.sel.heart_of_cards).map(x => x.resp?.card)).toContain(code("Dark Magic Attack"));
  expect(npcActivated(p, "Dark Magic Attack")).toBe(true);
  expect(p.end?.winner).toBe(1);
  expect(p.end?.reason).not.toBe(16);
});

it("materialises Dark Magician when Ancient Rules can put him directly into play", () => {
  const p = play(dc, { npcId: 52, heart_of_cards: 1, first: "player", turns: 2,
    npc: { hand: ["Ancient Rules"], deck: Array(20).fill("Petit Moth") }, player: { lp: 2500 } });
  expect(p.npc.filter(x => x.sel.heart_of_cards).map(x => x.resp?.card)).toContain(46986414);
  expect(npcActivated(p, "Ancient Rules")).toBe(true);
  expect(p.end?.winner).toBe(1);
});

it("materialises a real defensive monster when visible spell negation blocks draw spells", () => {
  const p = play(dc, { npcId: 51, heart_of_cards: 1, heart_pool: [code("Pot of Greed"), code("Raigeki"), code("Marshmallon"), code("Exiled Force")],
    first: "player", turns: 3, npc: { lp: 1000, deck: Array(20).fill("Petit Moth") },
    player: { mzone: ["Spell Canceller", "Blue-Eyes White Dragon"] }, player_policy: (sel) => {
      if (Number(sel.turn) === 1) return passive(sel);
      if (sel.type === "SELECT_IDLECMD") return { type: "SELECT_IDLECMD", action: "TO_BP", index: null };
      if (sel.type === "SELECT_BATTLECMD") return (sel.attacks as unknown[])?.length ? { type: "SELECT_BATTLECMD", action: "SELECT_BATTLE", index: 0 } : { type: "SELECT_BATTLECMD", action: "TO_EP", index: null };
      return passive(sel);
    } });
  const chosen = p.npc.filter(x => x.sel.heart_of_cards).map(x => x.resp?.card);
  expect(chosen).toContain(code("Marshmallon"));
  expect(npcActivated(p, "Pot of Greed")).toBe(false);
  expect(p.end?.winner).not.toBe(0);
});

it("hand exposure alone does not disable the top-deck skill", () => {
  const p = play(dc, { npcId: 51, heart_of_cards: 1, heart_pool: [code("Raigeki")], first: "player", turns: 2,
    npc: { deck: Array(20).fill("Petit Moth") }, player: { mzone: ["Blue-Eyes White Dragon"], szone: [["The Eye of Truth", "up"]] } });
  expect(p.npc.some(x => x.sel.heart_of_cards)).toBe(true);
  expect(npcActivated(p, "Raigeki")).toBe(true);
});

it("resumes materialising effect draws after Convulsion is removed", () => {
  const p = play(dc, { npcId: 51, heart_of_cards: 1, heart_pool: [code("Raigeki")], first: "player", turns: 2,
    npc: { hand: ["Mystical Space Typhoon", "Pot of Greed"], deck: Array(20).fill("Petit Moth") },
    player: { mzone: ["Blue-Eyes White Dragon"], szone: [["Convulsion of Nature", "up"]] } });
  const draws = p.msgs.filter(m => m.type === "DRAW" && m.player === 1);
  expect((draws[0] as any).drawn.map((c: any) => c.code)).toEqual([code("Petit Moth")]);
  expect(leftField(p, "Convulsion of Nature")).toBe(true);
  expect(p.npc.some(x => x.sel.heart_of_cards)).toBe(true);
  expect(npcActivated(p, "Raigeki")).toBe(true);
});

it("forgets temporary top-card knowledge after a real shuffle", () => {
  const p = play(dc, { npcId: 51, heart_of_cards: 1, heart_pool: [code("Raigeki")], first: "player", turns: 2,
    npc: { deck: Array(20).fill("Petit Moth") }, player: { hand: ["Ancient Telescope", "Card Shuffle"], mzone: ["Blue-Eyes White Dragon"] },
    player_policy: sel => sel.type === "SELECT_OPTION" ? { type: "SELECT_OPTION", index: 1 } : activating("Ancient Telescope", activating("Card Shuffle"))(sel) });
  expect(p.msgs.some(m => m.type === "CONFIRM_CARDS")).toBe(true);
  expect(p.msgs.some(m => m.type === "SHUFFLE_DECK" && m.player === 1)).toBe(true);
  expect(p.npc.some(x => x.sel.heart_of_cards)).toBe(true);
  expect(npcActivated(p, "Raigeki")).toBe(true);
});

it("summons Slifer with three tributes and projects its hand-based attack", () => {
  const p = play(dc, { npcId: 53, first: "player", turns: 2,
    npc: { hand: ["Slifer the Sky Dragon", ...Array(5).fill("Mystical Elf")], mzone: Array(3).fill("Petit Moth") },
    player: { mzone: ["Blue-Eyes White Dragon"] } });
  expect(p.msgs.some(m => m.type === "SUMMONED")).toBe(true);
  expect(p.npc.some(x => x.resp?.action === "SELECT_SUMMON" && (x.sel.summons as any[])[Number(x.resp.index)]?.code === code("Slifer the Sky Dragon"))).toBe(true);
  expect(p.msgs.filter(m => m.type === "MOVE" && m.card === code("Petit Moth") && ((m.from as any)?.location === 4) && ((m.to as any)?.location === 16)).length).toBe(3);
});

it("draws at most one Pot of Greed per duel and no other draw card", () => {
  // Owner: chained Pots and Graceful Charities look rigged on a player who chooses every draw.
  const draws = (hand: string[]) => play(dc, { npcId: 53, heart_of_cards: 1, first: "npc", turns: 7,
    npc: { hand, deck: Array(20).fill("Petit Moth") },
    player: { mzone: ["Gladiator Beast Darius"], szone: ["Waboku", "Mirror Force"], deck: Array(20).fill("Gladiator Beast Laquari") } })
    .npc.filter(x => x.sel.heart_of_cards).map(x => dc.cardDB.name(Number(x.resp?.card)));
  const drawing = /^(graceful charity|upstart goblin|jar of greed|reload|card destruction|heart of the underdog|card of sanctity|magical mallet|common charity|trade-in)$/i;
  const fresh = draws(["Beta The Magnet Warrior"]);
  expect(fresh.length).toBeGreaterThan(3);
  expect(fresh.filter(n => n === "Pot of Greed").length).toBeLessThanOrEqual(1);
  expect(fresh.filter(n => drawing.test(n))).toEqual([]);
  const dealt = draws(["Pot of Greed", "Beta The Magnet Warrior"]);
  expect(dealt.filter(n => n === "Pot of Greed" || drawing.test(n))).toEqual([]);
});

it("does not cast a second draw spell once his Pot of Greed has resolved", () => {
  // Lab: Dark Magician of Chaos took a used Pot of Greed back over Raigeki and Yugi cast it again.
  const p = play(dc, { npcId: 52, heart_of_cards: 1, heart_pool: [code("Petit Moth")], first: "player", turns: 4,
    npc: { hand: ["Dark Magician of Chaos"], mzone: ["Skilled Dark Magician", "Breaker the Magical Warrior"],
      grave: ["Pot of Greed", "Raigeki"], deck: Array(20).fill("Petit Moth") },
    player: { mzone: ["Gladiator Beast Darius"], szone: ["Waboku"] } });
  expect(npcActivated(p, "Dark Magician of Chaos")).toBe(true);
  expect(npcActivated(p, "Pot of Greed")).toBe(false);
});

it("a materialised Normal Monster has no effect left from the deck card it replaced", () => {
  // Lab and production: the engine keeps old effects when the new card is a Normal Monster, so a drawn Summoned
  // Skull still activated as the Giant Trunade it replaced, and a Beta was set as Swords of Revealing Light.
  const p = play(dc, { npcId: 52, heart_of_cards: 1, heart_pool: [code("Summoned Skull"), code("Beta The Magnet Warrior")],
    first: "player", turns: 2,
    npc: { deck: Array(20).fill("Giant Trunade"), szone: ["Mirror Force"] },
    player: { szone: ["Waboku"] } });
  const drawn = p.npc.filter(x => x.sel.heart_of_cards).map(x => Number(x.resp?.card));
  expect(drawn.length).toBeGreaterThan(0);
  const offered = p.npc.filter(x => x.sel.type === "SELECT_IDLECMD")
    .flatMap(x => ((x.sel.activates ?? []) as { code: number }[]).map(a => a.code));
  expect(offered.filter(c => drawn.includes(c))).toEqual([]);
  expect(npcActivated(p, "Summoned Skull") || npcActivated(p, "Beta The Magnet Warrior")).toBe(false);
});
