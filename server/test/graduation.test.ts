// Graduation against win-trading (owner, 2026-11-04: "it needs to be wins but not abusable win trading with alts").
// Two layers, both on the real PvP match end (pvpMatch.ts): the LV XP guard (persist.ts xpBlocked: short games, the
// day's pair cap, the same account) and the qualifying wins (ranking.ts gradQualifies / gradWin: a rated, not short
// win over a placed, week-old account on another network; 3 per opponent; 25 distinct opponents on distinct networks).
import { afterEach, describe, expect, it, vi } from "vitest";
import { configFrom, DUEL_PORT } from "../src/config.ts";
import { buildServer } from "../src/server.ts";
import { Conn } from "../src/net/conn.ts";
import { Reader as WireReader } from "../src/net/proto.ts";
import { Session } from "../src/game/hub.ts";
import * as PP from "../src/game/persist.ts";
import * as RK from "../src/game/ranking.ts";
import { WHY_LP, WHY_SURRENDER } from "../src/duel/duelfin.ts";
import type { PvpMatch } from "../src/duel/pvpMatch.ts";
import type { PvpSession } from "../src/duel/ocgSession.ts";
import { harness } from "./notes-harness.ts";

const DAY = 86400e3, T0 = Date.UTC(2026, 10, 4, 12);
const placedRank = (): RK.Rank => ({ ...RK.rankOf(null), rating: 1600, rd: 80, games: 20, wins: 10, losses: 10, school: "ra", best: "ra", last: T0 });

afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers(); PP.setProgression(false); });

// ─────────────────────────────── a world of N accounts and real PvP match ends ───────────────────────────────
type Who = { net?: string[]; ageDays?: number | null; placed?: boolean; lv?: number; score?: number };
function world(n: number, who: (i: number) => Who) {
  vi.useFakeTimers();
  vi.setSystemTime(T0);
  const accounts = Object.fromEntries(Array.from({ length: n }, (_, i) => {
    const w = who(i), p = PP.blankProfile(`P${i}`);
    p.prog = 1; p.mp_wallet = { version: 1, bound: 0 }; p.rec.mp = 1000;
    if (w.placed !== false) p.rank = placedRank();
    if (w.lv !== undefined) p.rec.lv = w.lv;
    if (w.score !== undefined) p.rec.score = w.score;
    p.pvp = { n: 100 };   // past the beginner LV-1 hold
    return [`acct${i}`, { idx: i + 1, players: { "0": `P${i}` }, profiles: { "0": p }, active_slot: 0 }];
  }));
  const srv = buildServer(configFrom({ PROGRESSION: "1", PVP_TEST: "1", DUEL_PAUSE: "0.0001", PARITY_SEED: "1" }), { accounts }, () => {});
  const { game: g, world: wd } = srv;
  const players = Object.keys(accounts).map((acct, i) => {
    const w = who(i), s = new Session(acct, i + 1, false);
    s.pid = g.hub.pidFor(s, 0); s.slot = 0; s.name = `P${i}`; s.block = "5740|0";
    s.ipbs = w.net ?? [`net${i}`];
    s.userCreated = w.ageDays === null ? null : T0 - (w.ageDays ?? 30) * DAY;
    g.hub.sessions.set(acct, s);
    const conn = (port: number) => { const r = new WireReader(); const c = new Conn(wd, wd.seqTable, port, `peer-${i}`, (b) => { r.feed(b); return true; }, DUEL_PORT); c.sess = s; s.conns.set(port, c); return c; };
    s.lobby = conn(5740);
    return { s, duel: conn(DUEL_PORT) };
  });
  const prof = (i: number) => g.store.loadRaw().accounts[`acct${i}`].profiles["0"];
  const edit = (i: number, fn: (p: any) => void) => { const st = g.store.loadRaw(); fn(st.accounts[`acct${i}`].profiles["0"]); g.store.saveRaw(st); };
  /** One finished single duel between accounts a and b; `winner` 0 = a. Default: a real 10-minute, 12-turn duel by LP. */
  const play = async (a: number, b: number, o: { winner: 0 | 1 | null; secs?: number; turns?: number; surrender?: boolean }) => {
    const m = g.pvp!.reserve(players[a].s, players[b].s, "autoduel") as unknown as PvpMatch;
    m.attach(players[a].duel); m.attach(players[b].duel);
    // the turn the duel reached (pvpMatch counts it for the economy's minimum length): an instant surrender reached none
    const e = { started: true, over: false, ended: false, turn: o.turns ?? (o.surrender ? 0 : 12), stats: null, lastLp: [4000, 0], pending: () => 0, resend: () => {},
      end: vi.fn(() => { e.over = e.ended = true; }), surrender: vi.fn(), abandon: vi.fn() };
    m.ps = e as unknown as PvpSession;
    (m as any).t0 = Date.now() / 1000 - (o.secs ?? 600);
    if (o.surrender && o.winner !== null) m.surr = 1 - o.winner;
    m.gameEnd(o.winner, o.surrender ? WHY_SURRENDER : WHY_LP, o.surrender ? 0 : o.turns ?? 12);
    await vi.advanceTimersByTimeAsync(2000); await wd.idle();
  };
  const nextDay = () => vi.setSystemTime(Date.now() + DAY);
  return { g, players, prof, edit, play, nextDay };
}

// ─────────────────────────────── level XP ───────────────────────────────
describe("level XP is guarded like MP and the rating", () => {
  const guard = (o: Partial<PP.XpGuard> = {}): PP.XpGuard => ({ me: "a", opp: "b", turns: 12, secs: 600, now: T0, ...o });
  it("a short game (under 3 turns and 2 minutes) gives the winner and a draw nothing; the loser keeps its normal penalty", () => {
    const w = PP.blankProfile("w"), l = PP.blankProfile("l"), d = PP.blankProfile("d");
    for (const p of [w, l, d]) Object.assign(p.rec, { lv: 6, score: 600 }), p.pvp = { n: 100 };
    const short = guard({ turns: 0, secs: 5 });
    expect(PP.pvpXp(w, 6, "win", false, null, true, 6, short)).toMatchObject({ delta: 0, why: "short" });
    expect(PP.pvpXp(d, 6, "draw", false, null, true, 6, short)).toMatchObject({ delta: 0, why: "short" });
    expect(PP.pvpXp(l, 6, "lose", false, null, true, 6, short)).toMatchObject({ delta: -1 });   // XP_LOSE_SAME
    expect([w.rec.score, d.rec.score, l.rec.score]).toEqual([600, 600, 599]);
    expect(w.xp_pairs?.n?.b ?? 0).toBe(0);                                        // a short game isn't a pair game
    // long enough by either measure: the normal +40
    expect(PP.pvpXp(w, 6, "win", false, null, true, 6, guard({ turns: 3, secs: 5 }))!.delta).toBe(40);
    expect(PP.pvpXp(w, 6, "win", false, null, true, 6, guard({ turns: 0, secs: 120 }))!.delta).toBe(40);
  });
  it("past ECON.PAIR_DAY_MAX full games today against one account, no XP either way; a new UTC day or another opponent pays again; the same account never", () => {
    const p = PP.blankProfile("w"); Object.assign(p.rec, { lv: 6, score: 600 }); p.pvp = { n: 100 };
    for (let i = 0; i < PP.ECON.PAIR_DAY_MAX; i++) expect(PP.pvpXp(p, 6, i % 2 ? "lose" : "win", false, null, true, 6, guard())!.why).toBeUndefined();
    const s = p.rec.score;
    expect(PP.pvpXp(p, 6, "win", false, null, true, 6, guard({ now: T0 + 1000 }))).toMatchObject({ delta: 0, why: "pair cap" });
    expect(PP.pvpXp(p, 6, "lose", false, null, true, 6, guard({ now: T0 + 2000 }))).toMatchObject({ delta: 0, why: "pair cap" });
    expect(p.rec.score).toBe(s);
    expect(PP.pvpXp(p, 6, "win", false, null, true, 6, guard({ opp: "c" }))!.delta).toBe(40);
    expect(PP.pvpXp(p, 6, "win", false, null, true, 6, guard({ now: T0 + DAY }))!.delta).toBe(40);
    expect(PP.pvpXp(p, 6, "win", false, null, true, 6, guard({ opp: "a" }))).toMatchObject({ delta: 0, why: "self" });
  });
  it("in a real match: an instant surrender gives the winner no XP and no MP, and doesn't use up the pair's games", async () => {
    const f = world(2, () => ({ lv: 6, score: 600 }));
    for (let i = 0; i < 10; i++) await f.play(0, 1, { winner: 0, surrender: true, secs: 3 });
    expect([f.prof(0).rec.score, f.prof(0).rec.mp]).toEqual([600, 1000]);
    expect(f.prof(1).rec.score).toBe(590);                                        // the leaver: -1 a game
    await f.play(0, 1, { winner: 0 });                                            // a real duel still pays
    expect(f.prof(0).rec.score).toBe(640);
  });
  it("in a real match: the 6th duel of the day between two accounts gives nobody XP", async () => {
    const f = world(2, () => ({ lv: 6, score: 600 }));
    for (let i = 0; i < PP.ECON.PAIR_DAY_MAX; i++) await f.play(0, 1, { winner: 0 });
    const [a, b] = [f.prof(0).rec.score, f.prof(1).rec.score];
    expect(a).toBe(600 + 40 * PP.ECON.PAIR_DAY_MAX);
    await f.play(0, 1, { winner: 0 }); await f.play(0, 1, { winner: 1 });
    expect([f.prof(0).rec.score, f.prof(1).rec.score]).toEqual([a, b]);
    f.nextDay(); await f.play(0, 1, { winner: 0 });
    expect(f.prof(0).rec.score).toBe(a + 40);
  });
});

// ─────────────────────────────── qualifying wins ───────────────────────────────
describe("qualifying wins", () => {
  const side = (o: Partial<RK.GradSide> = {}): RK.GradSide => ({ acct: "b", ipbs: ["n2"], created: T0 - 30 * DAY, rank: placedRank(), ...o });
  const me = side({ acct: "a", ipbs: ["n1"] });
  const won: RK.Outcome = { winner: 0, forfeit: false, short: false };
  const rated: [RK.Rank, RK.Rank] = [placedRank(), placedRank()];
  it("only a rated, not short win over a placed, week-old account on another network", () => {
    expect(RK.gradQualifies(won, rated, [me, side()], T0, "autoduel")).toBeNull();
    expect(RK.gradQualifies({ ...won, winner: null }, rated, [me, side()], T0, "autoduel")).toBe("no winner");
    expect(RK.gradQualifies(won, [null, rated[1]], [me, side()], T0, "autoduel")).toBe("unrated");
    expect(RK.gradQualifies({ ...won, short: true }, rated, [me, side()], T0, "autoduel")).toBe("short");
    expect(RK.gradQualifies(won, rated, [me, side({ acct: "a" })], T0, "autoduel")).toBe("same account");
    expect(RK.gradQualifies(won, rated, [me, side({ rank: { ...placedRank(), games: RK.PLACEMENT_GAMES - 1 } })], T0, "autoduel")).toBe("opponent unplaced");
    expect(RK.gradQualifies(won, rated, [me, side({ created: T0 - 6 * DAY })], T0, "autoduel")).toBe("opponent account too new");
    expect(RK.gradQualifies(won, rated, [me, side({ created: T0 - 7 * DAY })], T0, "autoduel")).toBeNull();
    expect(RK.gradQualifies(won, rated, [me, side({ created: null })], T0, "autoduel")).toBe("opponent age unknown");
    expect(RK.gradQualifies(won, rated, [me, side({ ipbs: ["n9", "n1"] })], T0, "autoduel")).toBe("same network");
    expect(RK.gradQualifies(won, rated, [me, side({ ipbs: [] })], T0, "autoduel")).toBe("network unknown");
  });
  it("at most GRAD_WINS_PER_OPP count per opponent, ever; a new opponent from a counted network doesn't count; no more than GRAD_OPPONENTS are kept", () => {
    const p: any = { rec: { lv: 1 } };
    expect(Array.from({ length: 6 }, () => RK.gradWin(p, "b", ["n2"]))).toEqual(["counted", "counted", "counted", "opponent capped", "opponent capped", "opponent capped"]);
    expect(RK.gradOf(p)).toMatchObject({ n: 1, opp: { [RK.gradKey("b")]: 3 } });
    expect(RK.gradWin(p, "c", ["n3", "n2"])).toBe("network counted");
    for (let i = 0; i < 40; i++) RK.gradWin(p, `o${i}`, [`x${i}`]);
    expect(RK.gradOf(p).n).toBe(RK.GRAD_OPPONENTS);
    expect(RK.gradWin(p, "late", ["y"])).toBe("enough opponents");
    expect(JSON.stringify(p.grad)).not.toMatch(/"b"|o1|x1|n2/);                    // no account or network tag in the clear
  });
  it("in real matches: wins over an unplaced account, a new account or one of unknown age don't count; a real one does", async () => {
    const f = world(5, (i) => [{}, { placed: false }, { ageDays: 2 }, { ageDays: null }, {}][i]);
    for (const opp of [1, 2, 3]) await f.play(0, opp, { winner: 0 });
    expect(RK.gradOf(f.prof(0)).n).toBe(0);
    await f.play(0, 4, { winner: 0 });
    expect(RK.gradOf(f.prof(0)).n).toBe(1);
    await f.play(0, 4, { winner: 0, secs: 30, turns: 2 });                         // short: rated, but no qualifying win
    expect(RK.gradOf(f.prof(0)).opp[RK.gradKey("acct4")]).toBe(1);
  });
});

// ─────────────────────────────── alts never graduate ───────────────────────────────
describe("alts trading wins never graduate", () => {
  it("two alts on one network, both placed and old: LV 20 through the guarded path, but no qualifying opponent", async () => {
    const f = world(2, () => ({ net: ["home"], lv: 19, score: 39900 }));
    for (let day = 0; day < 8; day++) {
      for (let i = 0; i < 7; i++) await f.play(0, 1, { winner: i % 3 === 2 ? 1 : 0 });   // 7 a day: 2 past the pair cap
      await f.play(0, 1, { winner: 0, surrender: true, secs: 1 });                      // and instant surrenders
      f.nextDay();
    }
    const a = f.prof(0);
    expect(a.rec.lv).toBe(20);
    expect([RK.gradOf(a).n, RK.isGraduated(a), RK.rankView(a).graduation]).toEqual([0, false, { level: 20, levelRequired: 20, opponents: 0, opponentsRequired: 25 }]);
    expect(RK.isGraduated(f.prof(1))).toBe(false);
  });
  it("two alts on different networks (a VPN): one opponent at most, however many games", async () => {
    const f = world(2, (i) => ({ net: [`net${i}`], lv: 20, score: 40000 }));
    for (let day = 0; day < 10; day++) { for (let i = 0; i < 5; i++) await f.play(0, 1, { winner: (day + i) % 2 ? 1 : 0 }); f.nextDay(); }
    for (const k of [0, 1]) expect([RK.gradOf(f.prof(k)).n, RK.isGraduated(f.prof(k))]).toEqual([1, false]);
    expect(RK.gradOf(f.prof(0)).opp[RK.gradKey("acct1")]).toBe(RK.GRAD_WINS_PER_OPP);
  });
  it("a ring of 30 placed, week-old alts on one IP: none of them graduates, nor a main beating them all from another network", async () => {
    const N = 30;
    const f = world(N + 2, (i) => (i === 0 ? { net: ["home"], lv: 20, score: 40000 } : i === 1 ? { net: ["vpn"], lv: 20, score: 40000 } : { net: ["home"], lv: 20, score: 40000 }));
    for (let alt = 2; alt < N + 2; alt++) { await f.play(0, alt, { winner: 0 }); await f.play(1, alt, { winner: 0 }); await f.play(alt, alt === N + 1 ? 2 : alt + 1, { winner: 0 }); }
    expect(RK.gradOf(f.prof(0)).n).toBe(0);                                       // the main at home: same network as every alt
    expect([RK.gradOf(f.prof(1)).n, RK.isGraduated(f.prof(1))]).toEqual([1, false]);   // the main on a VPN: the ring is one opponent
    for (let alt = 2; alt < N + 2; alt++) expect(RK.isGraduated(f.prof(alt))).toBe(false);
  });
});

// ─────────────────────────────── a real graduate ───────────────────────────────
describe("a legitimate player graduates, for good", () => {
  it("LV 20 and 25 distinct real opponents (placed, week-old, other networks): graduated at the 25th, not before; kept when LV falls", async () => {
    const f = world(RK.GRAD_OPPONENTS + 1, (i) => (i === 0 ? { lv: 20, score: 40000 } : {}));
    for (let opp = 1; opp <= RK.GRAD_OPPONENTS; opp++) {
      expect(RK.isGraduated(f.prof(0)), `before opponent ${opp}`).toBe(false);
      await f.play(0, opp, { winner: 0 });
    }
    const p = f.prof(0);
    expect([RK.gradOf(p).n, p.graduated, RK.rankView(p).graduated]).toEqual([25, 1, true]);
    expect(RK.rankView(p).graduation).toEqual({ level: 20, levelRequired: 20, opponents: 25, opponentsRequired: 25 });
    f.edit(0, (q) => { q.rec.lv = 3; q.rec.score = 0; delete q.grad; });         // LV lost, even the record gone
    expect(RK.isGraduated(f.prof(0))).toBe(true);
    await f.play(0, 1, { winner: 1 });
    expect(f.prof(0).graduated).toBe(1);
  });
  it("25 opponents first, LV 20 later: graduates on the XP that reaches LV 20", async () => {
    const f = world(RK.GRAD_OPPONENTS + 1, (i) => (i === 0 ? { lv: 19, score: 39000 } : {}));
    for (let opp = 1; opp <= RK.GRAD_OPPONENTS; opp++) await f.play(0, opp, { winner: 0 });
    expect([f.prof(0).rec.lv, RK.gradOf(f.prof(0)).n, RK.isGraduated(f.prof(0))]).toEqual([20, 25, true]);
  });
});

// ─────────────────────────────── where the network and age come from ───────────────────────────────
describe("the session's network tags and account age", () => {
  it("a login copies its WebSocket's tag and the user's creation time onto the session; nothing on the parity bridge", async () => {
    const h = harness({ players: {} }, { DEV: "0" });
    const a = h.client("alice", "alice", "pw", "user-a", { ipb: "0123456789abcdef", userCreated: T0 - 10 * DAY });
    await a.account(0, "Alice");
    const s = h.game.hub.sessions.get("u:user-a")!;
    expect([s.ipbs, s.userCreated]).toEqual([["0123456789abcdef"], T0 - 10 * DAY]);
    s.noteNet({ ipb: "fedcba9876543210", userCreated: null });
    s.noteNet({ ipb: "0123456789abcdef", userCreated: null });
    expect([s.ipbs, s.userCreated]).toEqual([["fedcba9876543210", "0123456789abcdef"], T0 - 10 * DAY]);
    const b = h.client("bob", "bob", "pw", "user-b");
    await b.account(0, "Bob");
    expect([h.game.hub.sessions.get("u:user-b")!.ipbs, h.game.hub.sessions.get("u:user-b")!.userCreated]).toEqual([[], null]);
  });
});
