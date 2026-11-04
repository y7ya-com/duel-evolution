import { describe, expect, it } from "vitest";
import { HeuristicBot, chooseTargets, type CardInfo } from "../src/duel/ai/heuristicBot.ts";
import { STAPLE_RULES, type RuleCtx } from "../src/duel/ai/cardRules.ts";
import { brainDb } from "../src/duel/data.ts";
import { deckNpc } from "../src/duel/npcRules.ts";
import { nrCompWins } from "../src/game/npcs.ts";
import { lobbyAfterDuelMsgs, RESULT_WIN } from "../src/duel/duelfin.ts";
import * as PP from "../src/game/persist.ts";
import { harness } from "./notes-harness.ts";

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

  it("does not declare a losing attack even at easy difficulty", () => {
    const bot = new HeuristicBot(0, cards, { blunder: 1 });
    expect(bot.choose({ ...battle(), ...select("SELECT_BATTLECMD", undefined, [mon(3000)]),
      attacks: [{ code: 1900, controller: 0, location: 4, sequence: 0 }], to_m2: true })?.action).toBe("TO_M2");
  });
});

describe("NPC resource preservation", () => {
  const ctx: RuleCtx = { myLp: 8000, oppLp: 8000, myMon: [], oppMon: [], myMaxAtk: 0, oppMaxAtk: 0,
    myBackrow: 0, oppBackrow: 0, myGraveMaxAtk: 0, oppGraveMaxAtk: 0, oppHand: 0 };
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
