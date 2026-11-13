import { afterEach, describe, expect, it, vi } from "vitest";
import * as PP from "../src/game/persist.ts";
import { cosmeticInfo } from "../src/game/cosmetics.ts";
import { COSMETIC_BY_ID } from "../src/game/cosmetics-catalog.ts";
import { Session } from "../src/game/hub.ts";
import { rowsToState, stateToRows } from "../src/db/project.ts";
import { lobbyAfterDuelMsgs, M_NPCPRESENT, RESULT_DRAW, RESULT_LOSE, RESULT_WIN } from "../src/duel/duelfin.ts";
import { npcWinDrop, NPC_WIN_DROPS } from "../src/duel/npcDrops.ts";
import { harness, u16 } from "./notes-harness.ts";

const outfit = COSMETIC_BY_ID.get("outfit:kaiser")!;
const bits = outfit.variants.map(v => v.bit);
const giftBits = (g: ReturnType<typeof harness>["game"], p: PP.P) => {
  const data = PP.onItemget(g, p, 3, 0);
  return Array.from({ length: u16(data) }, (_, i) => u16(data, 2 + i * 2));
};
afterEach(() => vi.restoreAllMocks());

describe("NPC cosmetic victory drops", () => {
  it("uses the real displayable Hell Kaiser outfit and an explicit 5% rate", () => {
    expect(NPC_WIN_DROPS[78]).toEqual({ item: outfit.id, chance: 0.05 });
    expect(bits).toEqual([138]);
    expect(bits.every(PP.bitShown)).toBe(true);
  });

  it.each([78, 79, 80])("rolls on a win against Hell Kaiser recipe %i and presents the outfit", nid => {
    const g = harness().game, p = PP.blankProfile("winner");
    const roll = vi.spyOn(g.rng, "random").mockReturnValue(0.049999);
    const messages = lobbyAfterDuelMsgs(g, p, nid, RESULT_WIN);
    expect(roll).toHaveBeenCalledTimes(1);
    expect(messages.some(([m]) => m === M_NPCPRESENT)).toBe(true);
    expect(bits.every(b => PP.pbinTest(p, b))).toBe(true);
    expect(giftBits(g, p)).toEqual(expect.arrayContaining(bits));
    expect(giftBits(g, p)).toEqual([]); // Replaying ITEMGET grants nothing.
  });

  it("excludes 0.05 from the successful interval and never grants a guaranteed first-win costume", () => {
    const g = harness().game, p = PP.blankProfile("unlucky");
    vi.spyOn(g.rng, "random").mockReturnValue(0.05);
    for (let i = 0; i < 50; i++) lobbyAfterDuelMsgs(g, p, 78, RESULT_WIN);
    expect(bits.some(b => PP.pbinTest(p, b))).toBe(false);
    expect(p.pending.flatMap((pkg: PP.P) => pkg.bits)).not.toEqual(expect.arrayContaining(bits));
  });

  it("does not roll on losses, draws, or another NPC's victory", () => {
    const g = harness().game, p = PP.blankProfile("ineligible");
    const roll = vi.spyOn(g.rng, "random").mockReturnValue(0);
    for (const nid of [78, 79, 80]) {
      lobbyAfterDuelMsgs(g, p, nid, RESULT_LOSE);
      lobbyAfterDuelMsgs(g, p, nid, RESULT_DRAW);
    }
    for (const nid of [54, 77, 81]) lobbyAfterDuelMsgs(g, p, nid, RESULT_WIN);
    expect(roll).not.toHaveBeenCalled();
    expect(bits.some(b => PP.pbinTest(p, b))).toBe(false);
  });

  it("keeps an unclaimed drop through the next duel and suppresses already owned unlocks", () => {
    const g = harness().game, p = PP.blankProfile("unclaimed");
    const roll = vi.spyOn(g.rng, "random").mockReturnValue(0);
    lobbyAfterDuelMsgs(g, p, 78, RESULT_WIN);
    expect(p.pending.some((pkg: PP.P) => pkg.bits.includes(138))).toBe(true);
    lobbyAfterDuelMsgs(g, p, 78, RESULT_WIN);
    expect(roll).toHaveBeenCalledTimes(1);
    expect(bits.every(b => PP.pbinTest(p, b))).toBe(true);
    expect(npcWinDrop(g, p, 80, "win")).toEqual([]);
  });

  it.each(["00", "01"])("persists ownership and imports it into the account wardrobe (body %s)", body => {
    const g = harness().game, p = PP.blankProfile("winner");
    p.avatar = { a: body + "00".repeat(15), b: body + "00".repeat(15) };
    vi.spyOn(g.rng, "random").mockReturnValue(0);
    lobbyAfterDuelMsgs(g, p, 80, RESULT_WIN);
    const account = { idx: 1, user_id: "winner", active_slot: 0, players: { "0": "winner" }, profiles: { "0": p } };
    const persisted = rowsToState(stateToRows({ accounts: { winner: account } }));
    g.store.saveRaw(persisted);
    const s = new Session("winner", 1, false); s.slot = 0; s.world = 1;
    g.hub.sessions.set(s.acct, s);
    const info = cosmeticInfo(g, s) as any;
    expect(info.inventory.find((item: any) => item.id === outfit.id)?.owned).toBe(true);
    expect(bits.every(b => PP.pbinTest(g.store.peek().accounts.winner.profiles["0"], b))).toBe(true);
  });
});
