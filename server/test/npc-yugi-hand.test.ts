import { beforeAll, expect, it } from "vitest";
import type { DuelCore } from "../src/duel/engine/core.ts";
import { createNodeDuelCore } from "../src/duel/engine/node.ts";
import { code, play } from "./npcScenario.ts";

let dc: DuelCore;
beforeAll(async () => { dc = await createNodeDuelCore(); }, 60000);

it("switches its defensive draw when the opponent has Jinzo", () => {
  const draw = (boss: string) => {
    const game = play(dc, {
      npcId: 53, heart_of_cards: 1, handAwareDraw: true, first: "npc", turns: 1,
      heart_pool: [code("Mirror Force"), code("Marshmallon")],
      npc: { lp: 900 },
      player: { hand: [boss], mzone: ["Petit Moth"] },
    });
    return game.npc.find(d => d.sel.heart_of_cards)?.resp?.card;
  };
  expect(draw("Summoned Skull")).toBe(code("Mirror Force"));
  expect(draw("Jinzo")).toBe(code("Marshmallon"));
});
