import type { Deck, DuelCore, NewOptions } from "../engine/core.ts";
import { YUGI_HEART_POOL } from "../yugiHeartPool.ts";
import { NpcAi, type CardInfo } from "./index.ts";
import { yugiPlaybook, type YugiMatchup } from "./yugiMatchups.ts";

const poolByName = new WeakMap<DuelCore["cardDB"], Map<string, number>>();
// No draw spells beyond one signature Pot of Greed: Yugi already chooses every card he draws.
const fallback = ["breaker the magical warrior", "solemn judgment", "raigeki", "book of moon", "mystical space typhoon"];
const themes: Record<number, readonly (readonly string[])[]> = {
  51: [["gaia the fierce knight", "curse of dragon", "polymerization"]],
  52: [["dark magician", "buster blader", "polymerization"], ["dark magician", "ancient rules", "dark magic attack"]],
  53: [["valkyrion the magna warrior", "alpha the magnet warrior", "beta the magnet warrior", "gamma the magnet warrior"]],
};
// Opening priorities are proactive. Later draws refine these against the
// current hand and board, where situational answers can be played immediately.
const openingCounters: Record<YugiMatchup, readonly [string, string]> = {
  lightsworn: ["light-imprisoning mirror", "dimensional fissure"],
  "dark-world": ["shadow-imprisoning mirror", "dimensional fissure"],
  "gladiator-beast": ["dimensional prison", "royal oppression"],
  hero: ["dark bribe", "magic jammer"],
  "crystal-beast": ["pulling the rug", "giant trunade"],
  "cyber-dragon": ["system down", "royal oppression"],
  "dark-gaia": ["dark bribe", "dimensional fissure"],
  "apprentice-control": ["nobleman of crossout", "royal decree"],
};
const finalists = 3;
// Through both players' second turns: a hand of set answers looked best at turn 3,
// before the opponent's removal had a turn to meet it.
const horizonTurn = 5;
const maxPreviewPrompts = 400;
let previewId = 0;

/** Score a possible opening against an ordinary shuffled opponent deck. This
 * uses neither the opponent's live opening hand nor its future live draw order.
 * Both pilots choose legal engine actions, without nested search. */
function preview(dc: DuelCore, decks: Deck[], opts: NewOptions, npcId: number,
  cards: CardInfo, opening: number[], seed: number): number | null {
  const id = `yugi-opening-preview-${++previewId}`;
  const config: NewOptions = { ...opts, seed, brain: [true, true], bot: [false, false],
    record: false, heart_opening: opening };
  const pilots = [
    new NpcAi({ npcId: 0, seat: 0, cards, seed, tier: "hard", vision: true, peek: () => dc.query(id) }),
    new NpcAi({ npcId, seat: 1, cards, seed, tier: "hard", link: () => ({ dc, decks, opts: config, log: [] }) }),
  ];
  try {
    let events = dc.new(id, decks, config);
    for (let i = 0; i < maxPreviewPrompts; i++) {
      const next = events.at(-1);
      if (next?.ev === "end") return next.winner === 1 ? 20000 : next.winner === 0 ? -20000 : 0;
      if (next?.ev !== "select" || next.retry) return null;
      if (Number(next.turn) >= horizonTurn) return pilots[1]!.bot.valueOf(dc.query(id), true);
      for (const event of events) for (const pilot of pilots) pilot.observe(event);
      const seat = Number(next.player);
      const choice = pilots[seat]?.choose(next);
      events = choice ? dc.respond(id, choice, seat) : dc.auto(id);
    }
    return null;
  } finally {
    dc.end(id);
  }
}

/** Build five-card hands from the matchup and Yugi's own themes, then compare
 * the best of them against a second shuffle. Record only the winning five. */
export function chooseYugiOpening(dc: DuelCore, decks: Deck[], opts: NewOptions, npcId: number, cards: CardInfo): number[] {
  let byName = poolByName.get(dc.cardDB);
  if (!byName) {
    byName = new Map(YUGI_HEART_POOL.map(c => [cards.name(c), c]));
    poolByName.set(dc.cardDB, byName);
  }
  const pool = opts.heart_pool ? new Set(opts.heart_pool) : null;
  const names = [...decks[0]!.main, ...(decks[0]!.extra ?? [])].map(c => cards.name(c));
  const matchup = yugiPlaybook({
    hand: names, monsters: [], backrow: [], grave: [], setMonsters: 0, setBackrow: 0,
  });
  const [counter, alternate] = matchup ? openingCounters[matchup.id] : ["book of moon", "torrential tribute"];
  const body = npcId === 52 ? "skilled dark magician" : npcId === 53 ? "beta the magnet warrior" : "obnoxious celtic guard";
  const removal = opts.first === 1 ? "book of moon" : "raigeki";
  const graveDeck = matchup?.id === "lightsworn" || matchup?.id === "dark-world";
  const recipes = [
    ["pot of greed", body, counter, "solemn judgment", removal],
    ["pot of greed", "breaker the magical warrior", alternate, "solemn judgment", "raigeki"],
    // Every recipe brings an attacker: production opened with five reactive cards and no monster.
    [graveDeck ? "banisher of the radiance" : body, counter, "compulsory evacuation device", "book of moon", "monster reborn"],
    [body, alternate, "giant trunade", "monster reborn", "raigeki"],
    // Proactive hands: removal that resolves on Yugi's own turn instead of set cards waiting for a backrow-heavy deck.
    ["pot of greed", "heavy storm", "raigeki", body, "monster reborn"],
    ["breaker the magical warrior", body, "dark hole", counter, "heavy storm"],
    ...(themes[npcId] ?? []).map(line => [...line, counter, "pot of greed"]),
    ...(matchup?.id === "gladiator-beast" ? [[
      "obelisk the tormentor", "valkyrion the magna warrior", "alpha the magnet warrior", "beta the magnet warrior", "gamma the magnet warrior",
    ]] : []),
  ];

  const candidates = new Map<string, number[]>();
  for (const recipe of recipes) {
    const hand = [...new Set([...recipe, ...fallback].flatMap(name => {
      const code = byName.get(name);
      return code !== undefined && (!pool || pool.has(code)) ? [code] : [];
    }))].slice(0, 5);
    if (hand.length === 5) candidates.set([...hand].sort((a, b) => a - b).join(","), hand);
  }
  const choices = [...candidates.values()];
  if (!choices.length) return [];
  const seed = (Number(opts.seed) >>> 0) ^ 0x5638d09;
  const scored = choices.flatMap(hand => {
    const score = preview(dc, decks, opts, npcId, cards, hand, seed >>> 0);
    return score === null ? [] : [{ hand, score }];
  }).sort((a, b) => b.score - a.score);
  return scored.slice(0, finalists).map(({ hand, score }) => {
    const second = preview(dc, decks, opts, npcId, cards, hand, (seed ^ 0x2b79a431) >>> 0);
    return { hand, score: second === null ? -Infinity : Math.min(score, second) };
  }).sort((a, b) => b.score - a.score)[0]?.hand ?? choices[0]!;
}
