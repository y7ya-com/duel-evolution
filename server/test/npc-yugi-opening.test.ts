import { beforeAll, expect, it } from "vitest";
import { cardInfo } from "../src/duel/ai/index.ts";
import { chooseYugiOpening } from "../src/duel/ai/yugiOpening.ts";
import { brainDb } from "../src/duel/data.ts";
import { packCommands, unpackCommands } from "../src/duel/duelArchive.ts";
import type { DuelCore, Json, NewOptions } from "../src/duel/engine/core.ts";
import { createNodeDuelCore } from "../src/duel/engine/node.ts";
import { YUGI_DECKS } from "../src/duel/yugiDecks.ts";
import { code, passive } from "./npcScenario.ts";

let dc: DuelCore;
beforeAll(async () => { dc = await createNodeDuelCore(); }, 60000);
const opts: NewOptions = { seed: 118, rule: "MR1", brain: [true, true], heart_of_cards: 1, heart_copy_limit: 3 };
const firstFive = (events: Json[], player: number) => (events.find(e => e.type === "DRAW" && e.player === player)?.drawn as Json[])
  ?.map(c => c.code);
const mask = (events: Json[]) => events.map(({ id, ms, ...e }) => e);

it.each([0, 1] as const)("deals five selected cards, leaves the player's hand alone, and replays exactly with first seat %i", async first => {
  const decks = [YUGI_DECKS["52"]!, YUGI_DECKS["53"]!];
  const opening = ["Raigeki", "Raigeki", "Raigeki", "Book of Moon", "Beta The Magnet Warrior"].map(code);
  const config = { ...opts, first, heart_opening: opening };
  const original = dc.new("opening-original", decks, { ...opts, first });
  const game = dc.new("opening-special", decks, config);
  const archive = await unpackCommands(await packCommands({ v: 1, decks, opts: config, cmds: [] }));
  try {
    expect(firstFive(game, 1)).toEqual(opening);
    expect(firstFive(game, 0)).toEqual(firstFive(original, 0));
    expect(mask(dc.new("opening-replay", archive.decks, archive.opts))).toEqual(mask(game));
    let events = game;
    for (let i = 0; i < 100; i++) {
      const s = events.at(-1)!;
      expect(s.ev).toBe("select");
      if (s.heart_of_cards) {
        expect(s.heart_pool).not.toContain(code("Raigeki"));
        expect(dc.respond("opening-special", { type: "ANNOUNCE_CARD", card: code("Raigeki") }, 1).at(-1)?.error)
          .toContain("three-copy limit");
        return;
      }
      const r = passive(s);
      events = r ? dc.respond("opening-special", r, Number(s.player)) : dc.auto("opening-special");
    }
    throw new Error("Yugi did not get a post-opening draw");
  } finally {
    for (const id of ["opening-original", "opening-special", "opening-replay"]) dc.end(id);
  }
});

it("rejects a fourth opening copy before starting the duel", () => {
  const decks = [YUGI_DECKS["52"]!, YUGI_DECKS["53"]!];
  const opening = [...Array(4).fill(code("Raigeki")), code("Book of Moon")];
  const events = dc.new("opening-overcap", decks, { ...opts, heart_opening: opening });
  expect(events.at(-1)?.error).toContain("three-copy limit");
});

it("builds different five-card hands against Lightsworn and Dark World decklists", () => {
  const cards = cardInfo(dc.cardDB, brainDb());
  const choose = (monsters: string[]) => chooseYugiOpening(dc, [
    { main: [...monsters.flatMap(name => Array(3).fill(code(name))), ...Array(28).fill(code("Petit Moth"))] },
    YUGI_DECKS["53"]!,
  ], { ...opts, first: 1 }, 53, cards);
  const lightsworn = choose(["Judgment Dragon", "Lumina, Lightsworn Summoner", "Lyla, Lightsworn Sorceress", "Solar Recharge"]);
  const darkWorld = choose(["Goldd, Wu-Lord of Dark World", "Sillva, Warlord of Dark World", "Broww, Huntsman of Dark World", "Dark World Dealings"]);
  expect(lightsworn).toHaveLength(5);
  expect(darkWorld).toHaveLength(5);
  expect([...darkWorld].sort()).not.toEqual([...lightsworn].sort());
  expect(lightsworn.some(c => [code("Light-Imprisoning Mirror"), code("Dimensional Fissure")].includes(c))).toBe(true);
  expect(darkWorld.some(c => [code("Shadow-Imprisoning Mirror"), code("Dimensional Fissure")].includes(c))).toBe(true);
}, 60000);
