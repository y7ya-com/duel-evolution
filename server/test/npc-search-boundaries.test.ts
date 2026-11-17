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
    .toEqual({ marker: "public state after the response", ai_pending_attack_resolved: false });
  expect(choose).not.toHaveBeenCalled();
  expect(end).toHaveBeenCalledOnce();
});

// A revival may stop at the attack replay while passing can already resolve damage.
// The forecast must not charge the same pending attack twice.
it.each([
  { name: "revival awaiting a replay", msgs: [{ ev: "msg", type: "CHAIN_END" }], type: "SELECT_YESNO", resolved: false },
  { name: "damage already calculated", msgs: [{ ev: "msg", type: "BATTLE" }], type: "SELECT_BATTLECMD", resolved: true },
  { name: "attack already negated", msgs: [{ ev: "msg", type: "ATTACK_DISABLED" }], type: "SELECT_BATTLECMD", resolved: true },
])("marks pending-attack timing: $name", ({ msgs, type, resolved }) => {
  const live = { ev: "select", id: "live", type: "SELECT_CHAIN", player: 1, turn: 2, turn_player: 0, phase: 8, selects: [], forced: false };
  const choose = vi.fn(() => { throw new Error("must stop before a new opponent decision"); });
  const policy = { copyTurnState() {}, applyExternalResponse() {}, observe() {}, choose } as unknown as HeuristicBot;
  const dc = { new: () => [live], respond: () => [...msgs, { ev: "select", type, player: 0, turn: 2 }],
    query: () => ({ marker: "public" }), end() {} } as unknown as DuelCore;
  const access: SearchAccess = { link: () => ({ dc, decks: [], opts: {}, log: [] }), makePolicy: () => policy,
    budgetMs: 3000, maxCandidates: 6, spy: false };
  expect(whatIf(access, 1, live, toPrompt(live, 1), { type: "SELECT_CHAIN", index: null }, policy))
    .toEqual({ marker: "public", ai_pending_attack_resolved: resolved });
  expect(choose).not.toHaveBeenCalled();
});
