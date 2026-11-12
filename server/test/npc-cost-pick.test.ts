// The NPC's discard and cost order (src/duel/ai/costPick.ts) and its pick counts, from AI rev 7's live duels.
import { describe, expect, it } from "vitest";
import { costOrder, discardBenefit, type CostView } from "../src/duel/ai/costPick.ts";
import { HeuristicBot, type CardInfo } from "../src/duel/ai/heuristicBot.ts";
import { brainDb } from "../src/duel/data.ts";

const SPIRIT_MESSAGE_L = 30170981;
const view = (hand: number[], worth: Record<number, number>, more: Partial<CostView> = {}): CostView => ({
  hand, field: [], isMonster: (c) => c >= 1000 && c < 10000, atk: (c) => (c >= 1000 && c < 10000 ? c : 0),
  canNormalSummon: () => false, worth: (c) => worth[c] ?? 1300, ...more,
});

describe("NPC discards", () => {
  it("plain cards go by worth, not printed ATK: a dead Messenger before Scapegoat, a Mystical Elf before Snatch Steal (duels 403, 392)", () => {
    // 1 = Scapegoat (an answer with attackers across), 2 = Messenger of Peace (nothing to stop)
    expect(costOrder(view([1, 2], { 1: 1600, 2: 1300 }))?.[0]).toBe(1);
    // 1 = Snatch Steal (worth 1732), 1800 = an 800 ATK body's worth below it
    expect(costOrder(view([1, 1800], { 1: 1732, 1800: 800 }))?.[0]).toBe(1);
  });

  it("keeps the deck's only Spirit Message while its Destiny Board is still to come (duel 399)", () => {
    expect(discardBenefit(SPIRIT_MESSAGE_L, { destinyLive: true })).toBe(0);
    expect(discardBenefit(SPIRIT_MESSAGE_L, { destinyLive: false })).toBe(1);
    // with the Board live, a duplicate card goes first; with it gone, the dead Message does
    expect(costOrder(view([SPIRIT_MESSAGE_L, 7], { 7: 900 }, { destinyLive: true }))?.[0]).toBe(1);
    expect(costOrder(view([SPIRIT_MESSAGE_L, 7], { 7: 900 }, { destinyLive: false }))?.[0]).toBe(0);
  });
});

describe("NPC pick counts", () => {
  const cards: CardInfo = { stat: (code) => ({ atk: code, def: 1000, level: 4 }), name: () => "", flipRisk: () => 0, brain: brainDb() };
  const select = (type: string, more = {}) => ({ type, player: 0, turn: 3, turn_player: 1, lp: [8000, 8000],
    view: { players: [{ mzone: [], szone: [], hand: [] }, { mzone: [], szone: [], hand_count: 0 }] }, ...more });
  it("takes every card an add-to-hand pick allows from its own graveyard (Backup Soldier: duel 376)", () => {
    const bot = new HeuristicBot(0, cards);
    bot.observe({ ev: "msg", type: "HINT", hint_type: 3, player: 0, hint: 506 });
    const grave = (code: number, sequence: number) => ({ code, controller: 0, location: 16, sequence, position: 0 });
    const r = bot.choose(select("SELECT_CARD", { min: 1, max: 3, selects: [grave(1000, 0), grave(1200, 1)] }));
    expect([...(r?.indicies as number[])].sort()).toEqual([0, 1]);
  });

  it("gives up its weakest graveyard monster to a banish cost, not its best (Dark Catapulter: duel 394)", () => {
    const bot = new HeuristicBot(0, cards);
    bot.observe({ ev: "msg", type: "HINT", hint_type: 3, player: 0, hint: 503 });
    const grave = (code: number, sequence: number) => ({ code, controller: 0, location: 16, sequence, position: 0 });
    const r = bot.choose(select("SELECT_CARD", { min: 1, max: 1, selects: [grave(2100, 0), grave(800, 1), grave(1600, 2)] }));
    expect(r?.indicies).toEqual([1]);
  });
});
