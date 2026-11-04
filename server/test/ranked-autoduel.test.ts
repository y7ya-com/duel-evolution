// Ranked = Autoduel only (owner, 2026-11-04: ranking.ts isRankedOrigin). A PvP match knows how it was made (its
// origin, said by the server code that made the pairing: lobby.ts autoPair / challengeReply, tournaments.ts pair);
// only an Autoduel one moves p.rank, the rank uniforms and graduation's qualifying wins. Rooms, direct invites and
// tournament games keep MP, XP/LV, the record and stats. Autoduel pairs by rating in a window that widens with the
// time searched (ranking.ts autoPick / autoWindow), and not the same pair back to back while anyone else fits.
import { afterEach, describe, expect, it, vi } from "vitest";
import { harness, be32, cat, str, u32, i32, type Client, type Harness } from "./notes-harness.ts";
import { configFrom } from "../src/config.ts";
import { buildServer } from "../src/server.ts";
import { Session } from "../src/game/hub.ts";
import * as PP from "../src/game/persist.ts";
import * as RK from "../src/game/ranking.ts";
import { WHY_LP } from "../src/duel/duelfin.ts";
import type { PvpMatch } from "../src/duel/pvpMatch.ts";

const DAY = 86400e3;
afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers(); PP.setProgression(false); });

const placed = (rating: number, o: Partial<RK.Rank> = {}): RK.Rank =>
  ({ ...RK.rankOf(null), rating, rd: 80, games: 20, wins: 10, losses: 10, school: RK.tierOf(rating, true).school, best: RK.tierOf(rating, true).school, ...o });

// ─────────────────────────────── the rules (pure) ───────────────────────────────
describe("which matches are ranked", () => {
  it("Autoduel only", () => {
    expect(RK.MATCH_ORIGINS.filter(RK.isRankedOrigin)).toEqual(["autoduel"]);
  });
  it("a qualifying win for graduation is a ranked (Autoduel) win: a room, invite or tournament win never is", () => {
    const side = (acct: string, net: string): RK.GradSide => ({ acct, ipbs: [net], created: Date.UTC(2026, 0, 1), rank: placed(1600) });
    const won: RK.Outcome = { winner: 0, forfeit: false, short: false }, rated: [RK.Rank, RK.Rank] = [placed(1610), placed(1590)];
    const at = Date.UTC(2026, 10, 4);
    expect(RK.gradQualifies(won, rated, [side("a", "n1"), side("b", "n2")], at, "autoduel")).toBeNull();
    for (const o of ["room", "invite", "tournament"] as const)
      expect(RK.gradQualifies(won, rated, [side("a", "n1"), side("b", "n2")], at, o)).toBe(`unranked (${o})`);
  });
});

describe("ranked matchmaking (autoPick, autoWindow)", () => {
  const seek = (key: string, rating: number, waited = 0, last: string | null = null): RK.AutoSeeker => ({ key, rating, waited, last });
  it("the window: ±150, 50 wider every 10 s searched, at most ±400", () => {
    expect([0, 9.9, 10, 19.9, 20, 30, 40, 50, 60, 3600].map(RK.autoWindow)).toEqual([150, 150, 200, 200, 250, 300, 350, 400, 400, 400]);
    expect([RK.AUTO_WINDOW_START, RK.AUTO_WINDOW_STEP, RK.AUTO_WINDOW_STEP_S, RK.AUTO_WINDOW_MAX]).toEqual([150, 50, 10, 400]);
  });
  it("an unplaced player counts as 1500, whatever its placement games did to the rating", () => {
    expect(RK.matchRating({ ...RK.rankOf(null), rating: 1720, games: RK.PLACEMENT_GAMES - 1 })).toBe(1500);
    expect(RK.matchRating(placed(1720))).toBe(1720);
    expect(RK.matchRating(RK.rankOf(null))).toBe(1500);
  });
  it("closest rating first; ties: who searched longest (the order given)", () => {
    const me = seek("me", 1600);
    const c = [seek("far", 1720), seek("near", 1580), seek("near2", 1620), seek("mid", 1650)];
    expect(RK.autoPick(me, c)!.key).toBe("near");
    expect(RK.autoPick(me, [c[2], c[1]])!.key).toBe("near2");
  });
  it("nobody outside the window; the window that counts is the wider of the two (the longer search)", () => {
    const me = seek("me", 1500);
    expect(RK.autoPick(me, [seek("o", 1651)])).toBeNull();          // 151 > 150
    expect(RK.autoPick(me, [seek("o", 1650)])!.key).toBe("o");      // 150: in
    expect(RK.autoPick(seek("me", 1500, 10), [seek("o", 1700)])!.key).toBe("o");           // I searched 10 s: ±200
    expect(RK.autoPick(me, [seek("o", 1900, 50)])!.key).toBe("o");                         // they searched 50 s: ±400
    expect(RK.autoPick(me, [seek("o", 1901, 3600)])).toBeNull();                           // never past ±400
  });
  it("never the same account", () => {
    expect(RK.autoPick(seek("me", 1500), [seek("me", 1500)])).toBeNull();
  });
  it("not the pair that just played while anyone else fits (either side's last opponent); alone, they may play again", () => {
    const me = seek("me", 1500, 0, "b");
    expect(RK.autoPick(me, [seek("b", 1500), seek("c", 1600)])!.key).toBe("c");
    expect(RK.autoPick(seek("me", 1500), [seek("b", 1500, 0, "me"), seek("c", 1600)])!.key).toBe("c");   // b's last was me
    expect(RK.autoPick(me, [seek("b", 1500)])!.key).toBe("b");
    expect(RK.autoPick(me, [seek("b", 1500), seek("c", 1900)])!.key).toBe("b");                          // c doesn't fit
  });
});

// ─────────────────────────────── the lobby: real clients over the wire ───────────────────────────────
/** 0x4288 CREATEROOM: dstyle, wmode, mstat (1 = autoduel), pw?, 16 B password, …, 3 B x (x[2]: Level Limit), u32 rival. */
const roomReq = (o: { mstat?: number; x?: number[] } = {}) => {
  const d = new Uint8Array(28);
  d[0] = 3; d[2] = o.mstat ?? 0;
  d.set(o.x ?? [1, 1, 1], 21);
  return d;
};
async function openRoom(A: Client, o: Parameters<typeof roomReq>[0] = {}): Promise<number> {
  const n = A.room!.mark();
  A.room!.send(0x4288, roomReq(o));
  await A.room!.wait(0x428a, n);
  return u32((await A.room!.wait(0x3113, n))!);
}
type Lw = { h: Harness; cs: Client[]; acct: (c: Client) => string; prof: (c: Client) => any; edit: (c: Client, fn: (p: any) => void) => void;
  match: (c: Client) => PvpMatch | null; end: (m: PvpMatch, winner: Client) => Promise<void> };
/** n players in one block of the Academy, real people: other networks, month-old accounts, past the beginner hold. */
async function lobby(n: number): Promise<Lw> {
  const h = harness({ players: {} }, { PROGRESSION: "1", PVP_TEST: "1", DUEL_PAUSE: "0.0001" });
  const cs = Array.from({ length: n }, (_, i) => h.client(`P${i}`, `P${i}`, "pw", `user-${i}`));
  for (const [i, c] of cs.entries()) await c.account(0, `Player${i}`);
  for (const c of cs) await c.enterRoom();
  const sess = (c: Client) => h.game.hub.byPid(c.pid!)!;
  cs.forEach((c, i) => { const s = sess(c); s.ipbs = [`net${i}`]; s.userCreated = Date.now() - 30 * DAY; });
  const acct = (c: Client) => sess(c).acct;
  const prof = (c: Client) => h.state().accounts[acct(c)].profiles["0"];
  const edit = (c: Client, fn: (p: any) => void) => { const st = h.state(); fn(st.accounts[acct(c)].profiles["0"]); h.game.store.saveRaw(st); };
  for (const c of cs) edit(c, (p) => { p.pvp = { n: 100 }; p.prog = 1; p.mp_wallet = { version: 1, bound: 0 }; Object.assign(p.rec, { lv: 6, score: 600, mp: 1000 }); });
  const match = (c: Client) => (h.game.pvp!.byPid(c.pid!) as PvpMatch | null) ?? null;
  /** The match ends by LP after a real 10-minute, 12-turn duel; `winner` wins. */
  const end = async (m: PvpMatch, winner: Client) => {
    (m as any).t0 = Date.now() / 1000 - 600;
    h.srv.world.run(() => m.gameEnd(m.sess.findIndex((s) => s.acct === acct(winner)), WHY_LP, 12));
    await h.tick(2000);
  };
  return { h, cs, acct, prof, edit, match, end };
}
/** A challenges B's room and B accepts. */
async function challenge(A: Client, B: Client, rid: number) {
  const nb = B.room!.mark(), na = A.room!.mark();
  A.room!.send(0x4300, cat(be32(rid), str("", 16)));
  expect(await B.room!.wait(0x4302, nb)).not.toBeNull();
  B.room!.send(0x4303, be32(1));
  expect(await A.room!.wait(0x4306, na)).not.toBeNull();
}
async function autoduel(f: Lw, A: Client, B: Client, x?: number[]) {
  const na = A.room!.mark(), nb = B.room!.mark();
  await openRoom(A, { mstat: 1, x }); await openRoom(B, { mstat: 1, x });
  expect(await A.room!.wait(0x43a0, na)).not.toBeNull();
  expect(await B.room!.wait(0x43a0, nb)).not.toBeNull();
}
async function tournament(f: Lw, A: Client, B: Client) {
  const to = f.h.game.to!;
  for (const c of [A, B]) to.watch.set(c.pid!, f.h.game.hub.byPid(c.pid!)!.lobby!);
  const t = to.startTournament();
  to.tick(t.deadline!);                  // the entry closes: the draw
  to.tick(t.deadline!);                  // round 1: A and B paired
  await f.h.tick(500);
}

describe("a match's origin comes from the lobby's own state", () => {
  it("autoduel, room, direct invite, tournament", async () => {
    const f = await lobby(8), [A, B, C, D, E, F, G, H] = f.cs;
    await autoduel(f, A, B);
    expect([f.match(A)?.origin, f.match(A)?.ranked, f.match(A) === f.match(B)]).toEqual(["autoduel", true, true]);
    await challenge(C, D, await openRoom(D));
    expect([f.match(C)?.origin, f.match(C)?.ranked]).toEqual(["room", false]);
    const [st, out] = f.h.game.lp.duelInvite("user-4", F.pid!);
    expect(st).toBe(200);
    await challenge(E, F, out.room as number);
    expect([f.match(E)?.origin, f.match(E)?.ranked]).toEqual(["invite", false]);
    await tournament(f, G, H);
    expect([f.match(G)?.origin, f.match(G)?.ranked, f.match(G) === f.match(H)]).toEqual(["tournament", false, true]);
    expect(f.h.log.some((l) => /\[pvp\] reserva pvp-\d+: .* \(autoduel, ranked\)/.test(l))).toBe(true);
    expect(f.h.log.filter((l) => /\[pvp\] reserva .*\((room|invite|tournament), unranked\)/.test(l))).toHaveLength(3);
  });

  it("can't be spoofed: an autoduel room can't be challenged (-602); 0x42a0 from a plain room's owner matches nobody; an unknown origin is refused", async () => {
    const f = await lobby(4), [A, B, C, D] = f.cs;
    const rid = await openRoom(B, { mstat: 1 });
    const n = A.room!.mark();
    A.room!.send(0x4300, cat(be32(rid), str("", 16)));      // pick an autoduel searcher as your opponent: refused
    const r = await A.room!.wait(0x4301, n);
    expect(r && i32(r)).toBe(-602);
    expect(f.match(A)).toBeNull();
    // two plain rooms (whatever their extra bytes say) whose owners say "reset the autoduel wait": no autoduel pairing
    await openRoom(C, { x: [1, 1, 1] }); await openRoom(D, { x: [0, 0, 0] });
    for (const c of [C, D]) c.room!.send(0x42a0);
    await f.h.tick(3000);
    expect([f.match(C), f.match(D)]).toEqual([null, null]);
    // D's room challenged and accepted: a room match (unranked), whatever its bytes said
    await challenge(C, D, [...f.h.game.lp.mem.rooms.values()].find((x) => x.p1 === D.pid && !x.only)!.id);
    expect([f.match(C)!.origin, f.match(C)!.ranked]).toEqual(["room", false]);
    // and nothing but the four origins makes a match
    const [sa, sb] = [A, B].map((c) => f.h.game.hub.byPid(c.pid!)!);
    expect(() => f.h.game.pvp!.reserve(sa, sb, "ranked" as any)).toThrow(/origin/);
  });
});

describe("only Autoduel moves the rating and graduation", () => {
  const seed = (f: Lw) => { for (const c of f.cs) f.edit(c, (p) => { p.rank = placed(1600); }); };
  for (const how of ["room", "invite", "tournament"] as const) {
    it(`a ${how} match leaves p.rank and graduation untouched; MP, XP and the record move as before`, async () => {
      const f = await lobby(2), [A, B] = f.cs;
      seed(f);
      const before = [A, B].map((c) => f.prof(c));
      if (how === "room") await challenge(A, B, await openRoom(B));
      else if (how === "invite") { const [, out] = f.h.game.lp.duelInvite("user-0", B.pid!); await challenge(A, B, out.room as number); }
      else await tournament(f, A, B);
      const m = f.match(A)!;
      expect(m.origin).toBe(how);
      await f.end(m, A);
      const [pa, pb] = [A, B].map((c) => f.prof(c));
      expect([pa.rank, pb.rank]).toEqual([before[0].rank, before[1].rank]);
      expect([pa.grad, pb.grad, pa.graduated, pb.graduated]).toEqual([undefined, undefined, undefined, undefined]);
      expect([pa.rec.duels_won, pb.rec.duels_lost]).toEqual([(before[0].rec.duels_won ?? 0) + 1, (before[1].rec.duels_lost ?? 0) + 1]);
      expect(pa.rec.score).toBeGreaterThan(before[0].rec.score);                          // XP as before
      expect(pa.rec.mp).toBeGreaterThan(before[0].rec.mp ?? 0);                           // MP as before
      expect(f.h.log.some((l) => l.includes(`unranked (${how}): rating, uniforms and graduation untouched`))).toBe(true);
      expect(f.h.log.some((l) => /fin para 0 .*; unranked/.test(l))).toBe(true);
    });
  }
  it("an autoduel moves both ratings and counts the winner's qualifying win", async () => {
    const f = await lobby(2), [A, B] = f.cs;
    seed(f);
    await autoduel(f, A, B);
    await f.end(f.match(A)!, A);
    const [pa, pb] = [A, B].map((c) => f.prof(c));
    expect([pa.rank.games, pa.rank.wins, pb.rank.games, pb.rank.losses]).toEqual([21, 11, 21, 11]);
    expect(pa.rank.rating).toBeGreaterThan(1600); expect(pb.rank.rating).toBeLessThan(1600);
    expect([RK.gradOf(pa).n, RK.gradOf(pb).n]).toEqual([1, 0]);
    expect(f.h.log.some((l) => /\[rank\] pvp-\d+: winner \d \(lp\): ranked \(autoduel\): .*graduation: qualifying win/.test(l))).toBe(true);
    expect(f.h.log.some((l) => /fin para 0 .*; ranked \(autoduel\)/.test(l))).toBe(true);
  });
  it("graduation counts only autoduel wins: 24 opponents beaten, a room win over a 25th leaves it at 24; an autoduel win graduates", async () => {
    const f = await lobby(2), [A, B] = f.cs;
    seed(f);
    f.edit(A, (p) => { Object.assign(p.rec, { lv: RK.GRADUATION_LEVEL, score: 40000 }); for (let i = 0; i < RK.GRAD_OPPONENTS - 1; i++) RK.gradWin(p, `earlier${i}`, [`elsewhere${i}`]); p.graduated = undefined; });
    expect(RK.gradOf(f.prof(A)).n).toBe(24);
    await challenge(A, B, await openRoom(B));
    await f.end(f.match(A)!, A);
    expect([RK.gradOf(f.prof(A)).n, f.prof(A).graduated]).toEqual([24, undefined]);
    await autoduel(f, A, B, [1, 1, 0]);                 // Level Limit OFF: LV 20 against LV 6
    await f.end(f.match(A)!, A);
    expect([RK.gradOf(f.prof(A)).n, f.prof(A).graduated]).toEqual([25, 1]);
  });
});

describe("autoduel pairs by rating", () => {
  const searching = async (f: Lw, c: Client) => { await openRoom(c, { mstat: 1, x: [1, 1, 0] }); };
  it("closest rating first, not the oldest search", async () => {
    const f = await lobby(3), [O1, O2, X] = f.cs;
    f.edit(O1, (p) => { p.rank = placed(1700); }); f.edit(O2, (p) => { p.rank = placed(1520); }); f.edit(X, (p) => { p.rank = placed(1590); });
    await searching(f, O1); await searching(f, O2);   // 180 apart: not yet (±150 for 10 s)
    await f.h.tick(2000);
    expect([f.match(O1), f.match(O2)]).toEqual([null, null]);
    await searching(f, X);                             // O1 searched longest (110 off); O2 is closer (70 off)
    await f.h.tick(2000);
    expect(f.match(X)).not.toBeNull();
    expect(f.match(X)).toBe(f.match(O2));
    expect(f.match(O1)).toBeNull();
  });
  it("too far apart at first; the window widens with the time searched until they meet (no new searcher needed)", async () => {
    const f = await lobby(2), [A, B] = f.cs;
    f.edit(A, (p) => { p.rank = placed(1500); }); f.edit(B, (p) => { p.rank = placed(1820); });   // 320 apart: ±350 after 40 s
    await searching(f, A); await searching(f, B);
    await f.h.tick(20_000);
    expect(f.match(A)).toBeNull();
    await f.h.tick(25_000);
    expect(f.match(A)).not.toBeNull();
    expect(f.match(A)).toBe(f.match(B));
    expect(f.h.log.some((l) => /\[lobby\] autoduel \(ranked\): .*gap 320, window ±350/.test(l))).toBe(true);
  });
  it("past ±400 they never meet; an unplaced player counts as 1500", async () => {
    const f = await lobby(3), [A, B, C] = f.cs;
    f.edit(A, (p) => { p.rank = placed(1500); }); f.edit(B, (p) => { p.rank = placed(1950); });
    f.edit(C, (p) => { p.rank = { ...RK.rankOf(null), rating: 1940, games: 2 }; });                // unplaced: 1500
    await searching(f, A); await searching(f, B);
    await f.h.tick(120_000);
    expect([f.match(A), f.match(B)]).toEqual([null, null]);
    await searching(f, C);
    await f.h.tick(2000);
    expect(f.match(C)).toBe(f.match(A));               // C counts as 1500: A (0 off), not B (10 off C's stored 1940)
    expect(f.match(B)).toBeNull();
  });
  it("the Auto Duel window's Level Limit ON (room x[2]) still keeps a pair within 5 LV; OFF, only the rating counts", async () => {
    const f = await lobby(4), [A, B, C, D] = f.cs;
    for (const c of f.cs) f.edit(c, (p) => { p.rank = placed(1600); });
    f.edit(B, (p) => { p.rec.lv = 12; }); f.edit(D, (p) => { p.rec.lv = 12; });            // A and C stay LV 6
    await openRoom(A, { mstat: 1, x: [1, 1, 1] }); await openRoom(B, { mstat: 1, x: [1, 1, 0] });   // A asks for the limit
    await f.h.tick(3000);
    expect([f.match(A), f.match(B)]).toEqual([null, null]);
    await openRoom(C, { mstat: 1, x: [1, 1, 0] }); await openRoom(D, { mstat: 1, x: [1, 1, 0] });
    await f.h.tick(3000);
    expect(f.match(A)).toBe(f.match(C));                // LV 6 with LV 6
    expect(f.match(B)).toBe(f.match(D));
  });
  it("the same pair is not matched back to back while someone else fits", async () => {
    const f = await lobby(3), [A, B, C] = f.cs;
    f.edit(A, (p) => { p.rank = placed(1600); }); f.edit(B, (p) => { p.rank = placed(1600); }); f.edit(C, (p) => { p.rank = placed(1700); });
    await autoduel(f, A, B);
    await f.end(f.match(A)!, A);
    await searching(f, C);
    await f.h.tick(1500);                              // alone
    await searching(f, B); await f.h.tick(100); await searching(f, A);
    await f.h.tick(3000);
    // B (now ~1583) tries first: A (~1617) is 34 off but just played B, C (1700) 117 off: B gets C, A keeps searching
    expect(f.match(B)).not.toBeNull();
    expect(f.match(B)!.sess.map((s) => s.acct).sort()).toEqual([f.acct(B), f.acct(C)].sort());
    expect(f.match(A)).toBeNull();
    expect(f.h.log.some((l) => l.includes("again: nobody else fits"))).toBe(false);
  });
  it("the same pair alone may play again", async () => {
    const f = await lobby(2), [A, B] = f.cs;
    for (const c of f.cs) f.edit(c, (p) => { p.rank = placed(1600); });
    await autoduel(f, A, B);
    await f.end(f.match(A)!, A);
    await autoduel(f, A, B);
    expect(f.match(A)).toBe(f.match(B));
    expect(f.h.log.some((l) => l.includes("again: nobody else fits"))).toBe(true);
  });
});

// ─────────────────────────────── free mode ───────────────────────────────
describe("free mode", () => {
  it("an autoduel in free mode is still unrated", async () => {
    vi.useFakeTimers();
    const accounts = Object.fromEntries([1, 2].map((i) => {
      const p = PP.blankProfile(`F${i}`); p.prog = 1; p.rank = placed(1600);
      return [`free${i}`, { idx: i, players: { "0": `F${i}` }, profiles: { "0": p }, active_slot: 0 }];
    }));
    const srv = buildServer(configFrom({ PROGRESSION: "1", PVP_TEST: "1", DUEL_PAUSE: "0.0001", PARITY_SEED: "1" }), { accounts }, () => {});
    const ss = Object.keys(accounts).map((acct, i) => {
      const s = new Session(acct, i + 1, false);
      s.pid = srv.game.hub.pidFor(s, 0); s.slot = 0; s.name = `F${i}`; s.ext.free = true; s.ipbs = [`n${i}`]; s.userCreated = Date.now() - 30 * DAY;
      srv.game.hub.sessions.set(acct, s);
      return s;
    });
    const m = srv.game.pvp!.reserve(ss[0], ss[1], "autoduel") as unknown as PvpMatch;
    expect(m.ranked).toBe(false);
    (m as any).t0 = Date.now() / 1000 - 600;
    m.gameEnd(0, WHY_LP, 12);
    await vi.advanceTimersByTimeAsync(2000);
    const after = srv.game.store.loadRaw().accounts;
    expect([after.free1.profiles["0"].rank, after.free2.profiles["0"].rank]).toEqual([placed(1600), placed(1600)]);
    expect(after.free1.profiles["0"].grad).toBeUndefined();
  });
});
