// The Main Menu's Duel Log (game/duellogList.ts): every PvP game played goes on the character's p.duellog; GET
// /api/de/duellog (duellogApi) gives the stats, a page, and the search by opponent, result and date.
import { afterEach, describe, expect, it, vi } from "vitest";
import { harness, be32, cat, str, u32, type Client } from "./notes-harness.ts";
import * as PP from "../src/game/persist.ts";
import { WHY_LP } from "../src/duel/duelfin.ts";
import type { PvpMatch } from "../src/duel/pvpMatch.ts";
import { rowsToState, stateToRows } from "../src/db/project.ts";
import { DUELLOG_MAX, duellogApi, duellogEntries, duellogParams, duellogPush, duellogQuery, type DuellogEntry } from "../src/game/duellogList.ts";

afterEach(() => { vi.restoreAllMocks(); PP.setProgression(false); });
const DAY = 86400;
const e = (i: number, o: Partial<DuellogEntry> = {}): DuellogEntry =>
  ({ t: 1_700_000_000 + i * DAY, opp: `Opp${i % 3}`, opp_pid: 100 + (i % 3), result: i % 4 === 0 ? "lose" : i % 7 === 0 ? "draw" : "win", turns: 5, ranked: false, origin: "room", match: false, ...o });

describe("the list (pure)", () => {
  it("newest first, capped; junk dropped", () => {
    const p: PP.P = {};
    for (let i = 0; i < DUELLOG_MAX + 5; i++) duellogPush(p, e(i));
    expect(p.duellog.length).toBe(DUELLOG_MAX);
    expect(p.duellog[0].t).toBe(e(DUELLOG_MAX + 4).t);
    p.duellog.push({ result: "nope" }, null);
    expect(duellogEntries(p).length).toBe(DUELLOG_MAX);
  });
  it("stats over everything; search by opponent (substring, any case), result, date; pages", () => {
    const all = Array.from({ length: 30 }, (_, i) => e(29 - i));
    const q = duellogQuery(all);
    expect(q.stats).toEqual({ total: 30, wins: all.filter((x) => x.result === "win").length, losses: 8, draws: all.filter((x) => x.result === "draw").length });
    expect([q.page, q.pages, q.rows.length, q.matched]).toEqual([1, 3, 10, 30]);
    expect(duellogQuery(all, { page: 9 }).page).toBe(3);
    const o = duellogQuery(all, { opp: "opp1", per: 50 });
    expect(o.matched).toBe(10);
    expect(o.rows.every((r) => r.opp === "Opp1")).toBe(true);
    expect(duellogQuery(all, { result: "lose", per: 50 }).rows.every((r) => r.result === "lose")).toBe(true);
    const sp = duellogParams(new URLSearchParams({ from: "2023-11-20", to: "2023-11-21" }));
    const d = duellogQuery(all, sp);
    expect(d.rows.map((r) => new Date(r.t * 1000).toISOString().slice(0, 10))).toEqual(["2023-11-21", "2023-11-20"]);
  });
  it("params: bad values are ignored", () => {
    expect(duellogParams(new URLSearchParams("from=x&page=-1&per=abc&result=zzz"))).toEqual({ opp: "", result: "zzz", from: undefined, to: undefined, page: undefined, per: undefined });
    expect(duellogQuery([e(1)], { result: "zzz" }).matched).toBe(1);
  });
});

/** 0x4288 CREATEROOM for a plain room (as test/ranked-autoduel.test.ts roomReq). */
const ROOM = (() => { const d = new Uint8Array(28); d[0] = 3; d.set([1, 1, 1], 21); return d; })();

describe("a PvP game goes on both players' logs", () => {
  it("room duel: the winner's line says win against the loser by name; the API pages it; it survives D1", async () => {
    const h = harness({ players: {} }, { PROGRESSION: "1", PVP_TEST: "1", DUEL_PAUSE: "0.0001" });
    expect(duellogApi(h.game, "user-0", new URLSearchParams())).toEqual([409, { error: "not-in-game" }]);
    const [A, B] = [0, 1].map((i) => h.client(`P${i}`, `P${i}`, "pw", `user-${i}`));
    const DAYMS = 30 * DAY * 1000;
    await A.account(0, "Alice"); await B.account(0, "Bob");
    await A.enterRoom(); await B.enterRoom();
    [A, B].forEach((c, i) => { const s = h.game.hub.byPid(c.pid!)!; s.ipbs = [`net${i}`]; s.userCreated = Date.now() - DAYMS; });
    expect(duellogApi(h.game, "user-0", new URLSearchParams())[1]).toMatchObject({ you: "Alice", stats: { total: 0 }, rows: [] });
    const m0 = B.room!.mark();
    B.room!.send(0x4288, ROOM);
    await B.room!.wait(0x428a, m0);
    const rid = u32((await B.room!.wait(0x3113, m0))!);
    const nb = B.room!.mark(), na = A.room!.mark();
    A.room!.send(0x4300, cat(be32(rid), str("", 16)));
    expect(await B.room!.wait(0x4302, nb)).not.toBeNull();
    B.room!.send(0x4303, be32(1));
    expect(await A.room!.wait(0x4306, na)).not.toBeNull();
    const m = h.game.pvp!.byPid(A.pid!) as PvpMatch;
    (m as any).t0 = Date.now() / 1000 - 600;
    h.srv.world.run(() => m.gameEnd(m.sess.findIndex((s) => s.pid === A.pid), WHY_LP, 12));
    await h.tick(2000);
    h.game.store.saveRaw(rowsToState(stateToRows(h.state())));   // through the D1 projection and back
    const [sa, ra] = duellogApi(h.game, "user-0", new URLSearchParams());
    expect(sa).toBe(200);
    expect(ra).toMatchObject({ stats: { total: 1, wins: 1, losses: 0, draws: 0 }, rows: [{ opp: "Bob", opp_pid: B.pid, result: "win", turns: 12, ranked: false, origin: "room" }] });
    const [, rb] = duellogApi(h.game, "user-1", new URLSearchParams({ result: "lose", opp: "ali" }));
    expect(rb).toMatchObject({ you: "Bob", matched: 1, rows: [{ opp: "Alice", result: "lose" }] });
    expect(duellogApi(h.game, "user-1", new URLSearchParams({ opp: "zed" }))[1]).toMatchObject({ matched: 0, rows: [] });
  });
});
