import { expect, it, vi } from "vitest";
import type { DuelCore } from "../src/duel/engine/core.ts";
import type { HeuristicBot } from "../src/duel/ai/heuristicBot.ts";
import { whatIf, type SearchAccess } from "../src/duel/ai/simSearch.ts";
import { toPrompt } from "../src/duel/ai/prompt.ts";

it("a passed response stops before the opponent can choose a new action from its hidden hand", () => {
  const live = { ev: "select", id: "live", type: "SELECT_CHAIN", player: 1, turn: 2, turn_player: 0,
    phase: 4, selects: [], forced: false };
  const choose = vi.fn(() => { throw new Error("opponent's hidden-hand decision must not run"); });
  const policy = { copyTurnState() {}, applyExternalResponse() {}, observe() {}, choose } as unknown as HeuristicBot;
  const end = vi.fn();
  const dc = {
    new: () => [live],
    // Passing a summon-response window produces no CHAIN_END message.
    respond: () => [{ ev: "select", type: "SELECT_IDLECMD", player: 0, turn: 2 }],
    query: () => ({ marker: "public state after the response" }), end,
  } as unknown as DuelCore;
  const access: SearchAccess = { link: () => ({ dc, decks: [], opts: {}, log: [] }),
    makePolicy: () => policy, budgetMs: 3000, maxCandidates: 6, spy: false };
  expect(whatIf(access, 1, live, toPrompt(live, 1), { type: "SELECT_CHAIN", index: null }, policy))
    .toEqual({ marker: "public state after the response" });
  expect(choose).not.toHaveBeenCalled();
  expect(end).toHaveBeenCalledOnce();
});
