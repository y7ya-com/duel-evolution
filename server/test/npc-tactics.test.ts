import { describe, expect, it } from "vitest";
import { HeuristicBot, chooseTargets, type CardInfo } from "../src/duel/ai/heuristicBot.ts";
import { tagRule, type RuleCtx } from "../src/duel/ai/cardRules.ts";
import { buildRules, bundledRules } from "../src/duel/ai/ruleSet.ts";
import { brainDb } from "../src/duel/data.ts";
import { deckNpc } from "../src/duel/npcRules.ts";
import { nrCompWins } from "../src/game/npcs.ts";
import { lobbyAfterDuelMsgs, RESULT_WIN } from "../src/duel/duelfin.ts";
import * as PP from "../src/game/persist.ts";
import { harness } from "./notes-harness.ts";

const STAPLE_RULES = bundledRules().compiled.staples;   // rules.json
const cards: CardInfo = {
  stat: (code) => ({ atk: code, def: 1000, level: 4 }), name: () => "", flipRisk: () => 0, brain: brainDb(),
};
const mon = (atk: number, sequence = 0) => ({ code: atk, attack: atk, defense: 1000, position: 1, sequence });
function select(type: string, own = [mon(1900)], opp = [mon(1000)], more = {}) {
  return { type, player: 0, turn: 1, turn_player: 0, lp: [8000, 8000],
    view: { players: [{ mzone: own, szone: [], hand: [] }, { mzone: opp, szone: [], hand_count: 0 }] }, ...more };
}
const battle = () => select("SELECT_BATTLECMD", undefined, undefined, {
  attacks: [{ code: 1900, controller: 0, location: 4, sequence: 0 }], to_m2: true, to_ep: true,
});

describe("NPC battle replays", () => {
  it("cancels after Call of the Haunted introduces a stronger monster", () => {
    const bot = new HeuristicBot(0, cards);
    expect(bot.choose(battle())?.action).toBe("SELECT_BATTLE");
    // Target selection and chain responses must not lose the declared attacker's identity.
    bot.choose(select("SELECT_CARD", undefined, undefined, {
      min: 1, max: 1, selects: [{ code: 1000, controller: 1, location: 4, sequence: 0, position: 1 }],
    }));
    bot.choose(select("SELECT_CHAIN", undefined, [mon(3000)], { selects: [], forced: false }));
    expect(bot.choose(select("SELECT_YESNO", undefined, [mon(3000)], { description: 30 }))?.yes).toBe(false);
  });

  it("continues a replay when a favorable target remains, using the current ATK", () => {
    const bot = new HeuristicBot(0, cards);
    bot.choose(battle());
    expect(bot.choose(select("SELECT_YESNO", [mon(3400)], [mon(3000)], { description: 30 }))?.yes).toBe(true);
    expect(bot.choose(select("SELECT_YESNO", [mon(500)], [mon(3000)], { description: 30 }))?.yes).toBe(false);
  });

  it("takes a direct attack after the opponent's last monster disappears", () => {
    const bot = new HeuristicBot(0, cards);
    bot.choose(battle());
    expect(bot.choose(select("SELECT_YESNO", undefined, [], { description: 31 }))?.yes).toBe(true);
  });

  it("a card's pick rule chooses its target (and declines an optional pick under its min)", () => {
    const REBORN = 83764718;
    const named: CardInfo = { ...cards, name: (c) => (c === REBORN ? "monster reborn" : "") };
    const rules = buildRules({ staples: { "monster reborn": { pick: { score: { "-": [0, "atk"] }, min: -1500 } } } }, 1);
    const bot = new HeuristicBot(0, named, { rules });
    bot.observe({ ev: "msg", type: "CHAINING", code: REBORN, controller: 0, location: 8, sequence: 0 });
    bot.observe({ ev: "msg", type: "CHAIN_SOLVING", chain_size: 1 });
    const grave = (atk: number) => ({ code: atk, controller: 0, location: 16, sequence: 0, position: 0 });
    // lowest ATK first, as the (deliberately odd) rule says
    expect(bot.choose(select("SELECT_CARD", undefined, undefined, { min: 1, max: 1, selects: [grave(2500), grave(1200), grave(1800)] }))?.indicies).toEqual([1]);
    // optional, and every card under min (-1500): none taken
    expect(bot.choose(select("SELECT_CARD", undefined, undefined, { min: 0, max: 1, selects: [grave(2500), grave(1800)] }))?.indicies).toEqual([]);
  });

  it("a boost (Rush Recklessly) goes on our own monster in the battle, never the player's", () => {
    // production: Rush Recklessly's pick was read as removal and raised the player's Celestia
    const RUSH = 70046172;
    const bot = new HeuristicBot(0, { ...cards, name: (c) => (c === RUSH ? "rush recklessly" : "") });
    // the player's 1800 attacks our 1500
    bot.observe({ ev: "msg", type: "ATTACK", card: { controller: 1, location: 4, sequence: 0 }, target: { controller: 0, location: 4, sequence: 1 } });
    const own = [mon(2000, 0), mon(1500, 1)], opp = [mon(1800, 0)];
    const more = { turn_player: 1, phase: 0x20 };
    expect(bot.choose(select("SELECT_CHAIN", own, opp, { ...more, forced: false,
      selects: [{ code: RUSH, controller: 0, location: 8, sequence: 0, description: 0 }] }))?.index).toBe(0);
    expect(bot.choose(select("SELECT_CARD", own, opp, { ...more, min: 1, max: 1, selects: [
      { code: 1800, controller: 1, location: 4, sequence: 0, position: 1 },
      { code: 2000, controller: 0, location: 4, sequence: 0, position: 1 },
      { code: 1500, controller: 0, location: 4, sequence: 1, position: 1 },
    ] }))?.indicies).toEqual([2]);
  });

  it("does not declare a losing attack even at easy difficulty", () => {
    const bot = new HeuristicBot(0, cards, { blunder: 1 });
    expect(bot.choose({ ...battle(), ...select("SELECT_BATTLECMD", undefined, [mon(3000)]),
      attacks: [{ code: 1900, controller: 0, location: 4, sequence: 0 }], to_m2: true })?.action).toBe("TO_M2");
  });
});

describe("NPC resource preservation", () => {
  const ctx: RuleCtx = { myLp: 8000, oppLp: 8000, myMon: [], oppMon: [], myMaxAtk: 0, oppMaxAtk: 0,
    myBackrow: 0, oppBackrow: 0, myGraveMaxAtk: 0, oppGraveMaxAtk: 0, oppHand: 0, myHand: 0, myHandTributes: 0, myRemoved: 0,
    myTurn: false, oppEndPhase: false, attackAtk: 0, attackLethal: false, attackOnDefense: false, oppChained: false, myNames: [] };
  it("holds Heavy Storm when it would destroy more friendly cards", () => {
    expect(STAPLE_RULES["heavy storm"]!.idleActivate!({ ...ctx, myBackrow: 4, oppBackrow: 2 })).toBe(false);
    expect(STAPLE_RULES["heavy storm"]!.idleActivate!({ ...ctx, myBackrow: 0, oppBackrow: 2 })).toBe(true);
  });
  it("values the whole monster board before Dark Hole or Torrential Tribute", () => {
    const body = (atk: number) => ({ atk, def: 1000, attackPos: true, faceDown: false });
    const ahead = { ...ctx, myMon: [body(1900), body(1900), body(1900)], oppMon: [body(2000)], myMaxAtk: 1900, oppMaxAtk: 2000 };
    expect(STAPLE_RULES["dark hole"]!.idleActivate!(ahead)).toBe(false);
    expect(STAPLE_RULES["torrential tribute"]!.chainReact!(ahead)).toBe(false);
    expect(STAPLE_RULES["dark hole"]!.idleActivate!({ ...ahead, myMon: [] })).toBe(true);
  });
  it("Monster Reborn takes the strongest graveyard monster regardless of its owner", () => {
    expect(chooseTargets([{ controller: 0, location: 16, value: 3000 }, { controller: 1, location: 16, value: 1000 }], 0, 1, 1)).toEqual([0]);
  });
  it("does not tribute two strong bodies for a weaker monster on an open board", () => {
    const bot = new HeuristicBot(0, { ...cards, stat: (code) => ({ atk: code, def: 1000, level: code === 2500 ? 7 : 4 }) });
    expect(bot.choose(select("SELECT_IDLECMD", [mon(3000), mon(3000, 1)], [], {
      summons: [{ code: 2500, controller: 0, location: 2, sequence: 0 }], to_bp: true, to_ep: true,
    }))?.action).toBe("TO_BP");
  });
});

// What the play-by-play traces of the NPC lab (test/npc-lab.test.ts) showed the NPCs doing wrong.
describe("NPC gaps found in duel traces", () => {
  const NAMES: Record<number, string> = { 101: "mystical space typhoon", 102: "messenger of peace", 103: "mirror force", 104: "sakuretsu armor", 105: "exodia the forbidden one" };
  const named: CardInfo = { ...cards, name: (code) => NAMES[code] ?? "" };
  const hand = (code: number, sequence = 0) => ({ code, controller: 0, location: 2, sequence });
  const field = (code: number, sequence = 0, more = {}) => ({ code, controller: 0, location: 4, sequence, ...more });
  const set = (atk: number, sequence = 0) => ({ ...mon(atk, sequence), position: 8 });
  const idle = (own: unknown[], opp: unknown[], more: Record<string, unknown>, lp = [8000, 8000]) =>
    select("SELECT_IDLECMD", own as never, opp as never, { turn: 3, to_bp: true, to_ep: true, phase: 4, lp, ...more });

  it("counts lethal on an open field: the set monsters turn up before anything weaker is summoned", () => {
    const bot = new HeuristicBot(0, cards);
    const sel = idle([set(1500), set(1300, 1)], [], { summons: [hand(800)], monster_sets: [hand(800)], pos_changes: [field(1500), field(1300, 1)] }, [8000, 2800]);
    expect(bot.choose(sel)).toMatchObject({ action: "SELECT_POS_CHANGE", index: 0 });
  });

  it("with lethal already standing it attacks at once, with no more cards put on the field first", () => {
    const bot = new HeuristicBot(0, cards);
    const sel = idle([mon(1900), mon(1800, 1)], [], { summons: [hand(1700)] }, [8000, 3500]);
    expect(bot.choose(sel)?.action).toBe("TO_BP");
  });

  it("does not trade its monster for an equal one (the backrow discount on its own bodies made that a gain)", () => {
    const bot = new HeuristicBot(0, cards);
    const backrow = [1, 2, 3, 4].map((sequence) => ({ code: 0, position: 10, sequence }));
    const sel = { ...select("SELECT_BATTLECMD", [mon(1300)], [mon(1300)]), attacks: [field(1300)], to_m2: true, to_ep: true };
    (sel.view.players[1] as { szone: unknown[] }).szone = backrow;
    expect(bot.choose(sel)?.action).toBe("TO_M2");
  });

  it("does not declare again an attack the engine never declared (an attack cost it refused)", () => {
    const bot = new HeuristicBot(0, cards);
    expect(bot.choose(battle())?.action).toBe("SELECT_BATTLE");
    expect(bot.choose(battle())?.action).toBe("TO_M2");
    const seen = new HeuristicBot(0, cards);
    seen.choose(battle());
    seen.observe({ ev: "msg", type: "ATTACK", card: { controller: 0, location: 4, sequence: 0 }, target: null });
    expect(seen.choose(battle())?.action).toBe("SELECT_BATTLE");
  });

  it("sets a wall, a feeble body and an outclassed one face-down, the best wall first", () => {
    const stats: Record<number, { atk: number; def: number; level: number }> = { 1: { atk: 800, def: 2000, level: 4 }, 2: { atk: 1300, def: 2000, level: 4 }, 3: { atk: 1700, def: 1000, level: 4 } };
    const bot = new HeuristicBot(0, { ...cards, stat: (code) => stats[code] ?? { atk: code, def: 1000, level: 4 } });
    // an open field: the 1700 is summoned, the walls are not
    expect(bot.choose(idle([], [], { summons: [hand(1), hand(3, 1)], monster_sets: [hand(1), hand(3, 1)] }))).toMatchObject({ action: "SELECT_SUMMON", index: 1 });
    // only walls in hand: set, not summoned in attack
    expect(bot.choose(idle([], [], { summons: [hand(1)], monster_sets: [hand(1)] }))).toMatchObject({ action: "SELECT_MONSTER_SET", index: 0 });
    // outclassed by a 1900: the 2000-DEF wall goes down, not the 1700 attacker
    expect(bot.choose(idle([], [mon(1900)], { summons: [hand(3), hand(2, 1)], monster_sets: [hand(3), hand(2, 1)] }))).toMatchObject({ action: "SELECT_MONSTER_SET", index: 1 });
  });

  it("turns an outclassed attacker to defense after the battle", () => {
    const bot = new HeuristicBot(0, cards);
    const sel = idle([mon(1200)], [mon(2400)], { pos_changes: [field(1200)], to_bp: false, phase: 0x100 });
    expect(bot.choose(sel)).toMatchObject({ action: "SELECT_POS_CHANGE", index: 0 });
  });

  it("tributes a weak body for a boss instead of holding it, but not two good bodies", () => {
    const stats: Record<number, { atk: number; def: number; level: number }> = { 2500: { atk: 2500, def: 1200, level: 6 } };
    const bot = new HeuristicBot(0, { ...cards, stat: (code) => stats[code] ?? { atk: code, def: 1000, level: 4 } });
    expect(bot.choose(idle([set(1000)], [], { summons: [hand(2500), hand(1700, 1)], monster_sets: [hand(1700, 1)] }))).toMatchObject({ action: "SELECT_SUMMON", index: 0 });
    // another position (a new bot: the turn's stored battle plan is the first position's); the 1900 is a planned
    // attacker, so it is not tributed
    const other = new HeuristicBot(0, { ...cards, stat: (code) => stats[code] ?? { atk: code, def: 1000, level: 4 } });
    expect(other.choose(idle([mon(1900)], [], { summons: [hand(2500), hand(1700, 1)], monster_sets: [hand(1700, 1)] }))).toMatchObject({ action: "SELECT_SUMMON", index: 1 });
  });

  it("holds Mystical Space Typhoon until there is something to hit and a reason (it destroyed its own cards)", () => {
    const chain = (more: Record<string, unknown>, oppBackrow: unknown[] = []) => {
      const sel = select("SELECT_CHAIN", [], [], { turn_player: 1, selects: [{ code: 101, controller: 0, location: 8, sequence: 0, description: 0 }], forced: false, ...more });
      (sel.view.players[1] as { szone: unknown[] }).szone = oppBackrow;
      return sel;
    };
    const theirs = [{ code: 0, position: 10, sequence: 0 }];
    expect(new HeuristicBot(0, named).choose(chain({ phase: 1 }))?.index).toBe(null);            // the Draw Phase, no target
    expect(new HeuristicBot(0, named).choose(chain({ phase: 1 }, theirs))?.index).toBe(null);    // a target, no reason yet
    expect(new HeuristicBot(0, named).choose(chain({ phase: 0x200 }, theirs))?.index).toBe(0);   // their End Phase
  });

  it("answers one attack with one trap, the cheapest that does it (Sakuretsu Armor, not Mirror Force, on a lone attacker)", () => {
    const bot = new HeuristicBot(0, named);
    bot.observe({ ev: "msg", type: "ATTACK", card: { controller: 1, location: 4, sequence: 0 }, target: null });
    const chain = (codes: number[]) => select("SELECT_CHAIN", [], [mon(2000)], { turn_player: 1, phase: 8,
      selects: codes.map((code, sequence) => ({ code, controller: 0, location: 8, sequence, description: 0 })), forced: false });
    expect(bot.choose(chain([103, 104]))?.index).toBe(1);
    expect(bot.choose(chain([103]))?.index).toBe(null);
    bot.observe({ ev: "msg", type: "CHAIN_END" });
    expect(bot.choose(chain([104]))?.index).toBe(0);
  });

  it("springs an attack trap when the attack costs LP or a monster (Master Duel's generic attack check)", () => {
    const poke = (lp: number[]) => {
      const bot = new HeuristicBot(0, named);
      bot.observe({ ev: "msg", type: "ATTACK", card: { controller: 1, location: 4, sequence: 0 }, target: null });
      return bot.choose(select("SELECT_CHAIN", [], [mon(900)], { turn_player: 1, phase: 8, lp,
        selects: [{ code: 104, controller: 0, location: 8, sequence: 0, description: 0 }], forced: false }))?.index;
    };
    expect(poke([8000, 8000])).toBe(0);
    expect(poke([800, 8000])).toBe(0);
  });

  it("pays Messenger of Peace's upkeep (every card question was answered no)", () => {
    // (the live rule since overlay v4: the upkeep is paid while the opponent has a 1500+ monster to stop)
    const ask = (lp: number[]) => new HeuristicBot(0, named).choose(select("SELECT_YESNO", [], [mon(1800)], { description: 102 * 0x100000, lp }))?.yes;
    expect([ask([8000, 8000]), ask([500, 8000])]).toEqual([true, false]);
  });

  it("puts a buffing equip on its own strongest monster, not the opponent's", () => {
    const bot = new HeuristicBot(0, cards);
    bot.observe({ ev: "msg", type: "HINT", hint_type: 3, player: 0, hint: 518 });
    const pick = select("SELECT_CARD", [mon(1500), mon(1900, 1)], [mon(2400)], { min: 1, max: 1, selects: [
      { code: 2400, controller: 1, location: 4, sequence: 0, position: 1 }, { code: 1500, controller: 0, location: 4, sequence: 0, position: 1 },
      { code: 1900, controller: 0, location: 4, sequence: 1, position: 1 }] });
    expect(bot.choose(pick)?.indicies).toEqual([2]);
  });

  it("discards by what the cards are, not the first one listed, and never an Exodia piece", () => {
    const stats: Record<number, { atk: number; def: number; level: number }> = { 105: { atk: 1000, def: 1000, level: 3 } };
    const bot = new HeuristicBot(0, { ...named, stat: (code) => stats[code] ?? { atk: code, def: 1000, level: 4 } });
    const discard = select("SELECT_CARD", [], [], { min: 1, max: 1, selects: [
      { code: 105, controller: 0, location: 2, sequence: 0, position: 10 }, { code: 1900, controller: 0, location: 2, sequence: 1, position: 10 },
      { code: 400, controller: 0, location: 2, sequence: 2, position: 10 }] });
    expect(bot.choose(discard)?.indicies).toEqual([2]);
    // and the piece is not summoned
    expect(bot.choose(idle([], [], { summons: [hand(105)], monster_sets: [hand(105)] }))?.action).toBe("TO_EP");
  });
});

it("Aster develops fusion material while waiting, then chooses Phoenix Enforcer when Polymerization resolves", () => {
  const names: Record<number, string> = { 1: "elemental hero avian", 2: "elemental hero burstinatrix", 3: "polymerization",
    4: "elemental hero phoenix enforcer", 5: "other fusion" };
  const bot = new HeuristicBot(0, { ...cards, name: (code) => names[code] ?? "" }, { npcId: 84 });
  const opening = select("SELECT_IDLECMD", [], [], {
    summons: [{ code: 1, controller: 0, location: 2, sequence: 0 }], to_ep: true,
  });
  expect(bot.choose(opening)?.action).toBe("SELECT_SUMMON");
  const fusion = select("SELECT_CARD", undefined, [], { min: 1, max: 1,
    selects: [{ code: 5, controller: 0, location: 64, sequence: 0 }, { code: 4, controller: 0, location: 64, sequence: 1 }] });
  expect(bot.choose(fusion)?.indicies).toEqual([1]);
});

it("repeatedly challenging a map NPC advances all recipes and retains completion titles without granting boxed costumes", () => {
  const g = harness().game, p = PP.blankProfile("progression");
  expect(PP.FAMOUS_BASE[84]).toBe("Aster");
  const get = (id: number) => PP.npcbinGet(p, id);
  expect(deckNpc(84, get)).toBe(84);
  for (const stage of [84, 85, 86]) {
    expect(deckNpc(84, get)).toBe(stage);
    for (let win = 0; win < nrCompWins(stage); win++) lobbyAfterDuelMsgs(g, p, 84, RESULT_WIN);
    expect(get(stage)[0]).toBe(nrCompWins(stage));
  }
  const name = PP.FAMOUS_BASE[84]!;
  expect(PP.pbinTest(p, PP.TITLE_BITS[name][0])).toBe(true);
  expect(PP.PRESENT_CLOTHES[name].filter((b) => b !== null).some((bit) => PP.pbinTest(p, bit!))).toBe(false);
});

// The first duel archived in production (2026-11-11, Yami Yugi NPC 51 vs ChicodaBurra): three NPC decisions that lost it.
describe("NPC decisions from the first production duel", () => {
  const ctx: RuleCtx = { myLp: 8000, oppLp: 8000, myMon: [], oppMon: [], myMaxAtk: 0, oppMaxAtk: 0, myBackrow: 0, oppBackrow: 0,
    myGraveMaxAtk: 0, oppGraveMaxAtk: 0, oppHand: 2, myHand: 4, myHandTributes: 1, myRemoved: 0, myTurn: true, oppEndPhase: false,
    attackAtk: 0, attackLethal: false, attackOnDefense: false, oppChained: false, myNames: [] };
  const atk = (a: number) => ({ atk: a, def: 0, faceDown: false, attackPos: true });
  // turn 3's Snatch Steal into face-down backrow (answered by Dust Tornado) stays: holding it for a bigger target
  // measured worse in the lab (2026-11-11, 1,152 duels: 44.2% -> 43.7%); the tempo matters more than the risk
  it("turn 7: Premature Burial of a 2500 into a 2800 only as a blocker on an empty field; yes when it holds the field", () => {
    const t7 = { ...ctx, myLp: 2500, oppMon: [atk(1700), atk(2800), atk(1700)], oppMaxAtk: 2800, myGraveMaxAtk: 2500 };
    const burial = STAPLE_RULES["premature burial"]!.idleActivate!, reborn = STAPLE_RULES["monster reborn"]!.idleActivate!;
    // (overlay v4 and Master Duel: a blocker for an empty field facing attackers; with a monster of mine out, no)
    expect([burial(t7), reborn(t7)]).toEqual([true, true]);
    const guarded = { ...t7, myMon: [atk(1000)], myMaxAtk: 1000 };
    expect([burial(guarded), reborn(guarded)]).toEqual([false, false]);
    expect([burial({ ...t7, oppMon: [atk(1700)], oppMaxAtk: 1700 }), reborn({ ...t7, oppMon: [atk(1700)], oppMaxAtk: 1700 })]).toEqual([true, true]);
  });
  it("turn 1: Spiral Spear Strike waits for Gaia; a continuous spell tagged draw doesn't lead like Pot of Greed", () => {
    const spear = STAPLE_RULES["spiral spear strike"]!.idleActivate!;
    expect(spear(ctx)).toBe(false);
    expect(spear({ ...ctx, myNames: ["gaia the fierce knight"] })).toBe(true);
    const code = [...brainDb().cards.values()].find((c) => (c.type & 0x20002) === 0x20002 && c.has("draw"))!;   // a continuous draw spell
    expect(tagRule(code)?.idlePriority ?? 0).toBe(0);
  });
});

// Production NPC duels of 2026-11-11 (AI rev 1, replayed with NPC_LAB_ASK): decisions the rules got wrong.
describe("NPC decisions from the first day of production duels", () => {
  const C = { mst: 5318639, scapegoat: 73915051, spark: 81777047, pot: 55144522 };
  const NAMES: Record<number, string> = { [C.mst]: "mystical space typhoon", [C.scapegoat]: "scapegoat", [C.spark]: "luminous spark" };
  const named: CardInfo = { ...cards, name: (code) => NAMES[code] ?? "" };
  const ctx: RuleCtx = { myLp: 8000, oppLp: 8000, myMon: [], oppMon: [], myMaxAtk: 0, oppMaxAtk: 0, myBackrow: 0, oppBackrow: 0,
    myGraveMaxAtk: 0, oppGraveMaxAtk: 0, oppHand: 3, myHand: 2, myHandTributes: 0, myRemoved: 0, myTurn: false, oppEndPhase: false,
    attackAtk: 0, attackLethal: false, attackOnDefense: false, oppChained: false, myNames: [] };
  const atk = (a: number) => ({ atk: a, def: 0, faceDown: false, attackPos: true });
  const chain = (codes: number[], opp: { szone?: unknown[] } = {}, more: Record<string, unknown> = {}) => {
    const sel = select("SELECT_CHAIN", [], [mon(1800)], { turn_player: 1, phase: 4, forced: false, ...more,
      selects: codes.map((code, sequence) => ({ code, controller: 0, location: 8, sequence, position: 10, description: 0 })) });
    (sel.view.players[0] as { szone: unknown[] }).szone = codes.map((code, sequence) => ({ code, position: 10, sequence }));
    if (opp.szone) (sel.view.players[1] as { szone: unknown[] }).szone = opp.szone;
    return sel;
  };

  it("summons the next Nimble Momonga / Giant Germ from the Deck; other card questions stay no", () => {
    const ask = (text: string) => new HeuristicBot(0, named).choose(select("SELECT_YESNO", [], [], { description: 22567609 * 0x100000, desc_text: text }))?.yes;
    expect(ask('Special Summon another "Nimble Momonga" from your Deck?')).toBe(true);
    expect(ask("Destroy a card?")).toBe(false);
  });

  it("Wall of Revealing Light pays over the strongest attacker, at least 3000, keeping 1 LP (Master Duel)", () => {
    const pay = STAPLE_RULES["wall of revealing light"]!.number!, values = [1000, 2000, 3000, 4000, 5000, 6000, 7000, 8000];
    expect(values[pay({ ...ctx, myLp: 7400, oppMon: [atk(2300), atk(1700)], oppMaxAtk: 2300 }, values)]).toBe(3000);
    expect(values[pay({ ...ctx, myLp: 2500, oppMon: [atk(2300)], oppMaxAtk: 2300 }, values)]).toBe(2000);
  });

  it("Poison of the Old Man burns; it heals only when the NPC's own LP is in danger", () => {
    const pick = STAPLE_RULES["poison of the old man"]!.option!;
    expect([pick(ctx), pick({ ...ctx, myLp: 1200 })]).toEqual([1, 0]);
  });

  it("Ring of Destruction is not spent on an attack into a Defense Position monster", () => {
    const ring = STAPLE_RULES["ring of destruction"]!.chainReact!;
    const swing = { ...ctx, myLp: 7000, oppMon: [atk(1800)], oppMaxAtk: 1800, attackAtk: 1800 };
    expect([ring(swing), ring({ ...swing, attackOnDefense: true })]).toEqual([true, false]);
  });

  it("uses a set card the opponent's chain is about to destroy", () => {
    const bot = new HeuristicBot(0, named);
    expect(bot.choose(chain([C.scapegoat]))?.index).toBe(null);   // nothing at stake: held
    bot.observe({ ev: "msg", type: "CHAINING", code: C.mst, controller: 1, location: 8, sequence: 0 });
    bot.observe({ ev: "msg", type: "BECOME_TARGET", cards: [{ controller: 0, location: 8, sequence: 0, position: 10 }] });
    expect(bot.choose(chain([C.scapegoat]))?.index).toBe(0);
  });

  it("does not spend backrow removal on a spell that is already resolving", () => {
    const bot = new HeuristicBot(0, named);
    bot.observe({ ev: "msg", type: "CHAINING", code: C.pot, controller: 1, location: 8, sequence: 0 });
    const theirs = { szone: [{ code: C.pot, position: 5, sequence: 0 }] };
    expect(bot.choose(chain([C.mst], theirs))?.index).toBe(null);
    // a set card of theirs beside it is still a target (in their End Phase, the window MST answers a set card in)
    expect(bot.choose(chain([C.mst], { szone: [...theirs.szone, { code: 0, position: 10, sequence: 1 }] }, { phase: 0x200 }))?.index).toBe(0);
  });

  it("does not activate a Field Spell over its own face-up copy", () => {
    const sel = select("SELECT_IDLECMD", [mon(1900)], [], { to_bp: true, to_ep: true, phase: 4,
      activates: [{ code: C.spark, controller: 0, location: 2, sequence: 0, description: 0 }] });
    expect(new HeuristicBot(0, named).choose(sel)?.action).toBe("SELECT_ACTIVATE");
    (sel.view.players[0] as { szone: unknown[] }).szone = [null, null, null, null, null, { code: C.spark, position: 5, sequence: 5 }];
    expect(new HeuristicBot(0, named).choose(sel)?.action).toBe("TO_BP");
  });

  it("an easy NPC's random line never ends the turn while it has cards to set", () => {
    const bot = new HeuristicBot(0, named, { blunder: 1 });
    const sel = select("SELECT_IDLECMD", [], [mon(1700)], { to_ep: true, phase: 4, spell_sets: [{ code: 44095762, controller: 0, location: 2, sequence: 0 }] });
    expect(bot.choose(sel)?.action).toBe("SELECT_SPELL_SET");
  });
});
