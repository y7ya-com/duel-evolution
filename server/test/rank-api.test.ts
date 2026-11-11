// GET /api/de/rank (game/rank-api.ts): the Worker's session check, the DO route, and what the lookup shows.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const auth = vi.hoisted(() => ({ verifySession: vi.fn() }));
vi.mock("cloudflare:workers", () => ({ DurableObject: class { constructor(readonly ctx: any, readonly env: any) {} } }));
vi.mock("../src/duel/boot.ts", () => ({ bootDuel: vi.fn(async () => {}) }));
vi.mock("../src/auth/auth.ts", () => ({ verifySession: auth.verifySession, ipBucket: vi.fn() }));
vi.mock("../src/auth/routes.ts", () => ({ authApp: { fetch: vi.fn() }, isAuthPath: () => false }));
import worker from "../src/worker.ts";
import { WorldDO } from "../src/do.ts";
import { harness } from "./notes-harness.ts";
import * as PP from "../src/game/persist.ts";
import { PID_BASE } from "../src/game/hub.ts";
import { rankLookup, publicRank, RANK_BURST, RANK_MAX_IDS } from "../src/game/rank-api.ts";

afterEach(() => { vi.clearAllTimers(); vi.useRealTimers(); PP.setProgression(false); });
beforeEach(() => { auth.verifySession.mockReset(); auth.verifySession.mockResolvedValue({ userId: "real-user", roles: [] }); });

const PUBLIC = ["pid", "name", "known", "placed", "school", "division", "label", "rating", "placement"].sort();
async function setup() {
  const h = harness({ players: {} }, { PROGRESSION: "1" });
  const a = h.client("Alice", "alice", "pw", "alice-user"), b = h.client("Bob", "bob", "pw", "bob-user");
  await a.account(0, "Alice"); await a.enterRoom();
  await b.account(0, "Bob"); await b.enterRoom();
  const acct = (u: string) => h.game.hub.acctOfUser(u);
  const sess = (u: string) => h.game.hub.sessions.get(acct(u))!;
  // Bob placed (Ra Yellow II at 1712.4), Alice two games into her placement
  const st = h.state();
  st.accounts[acct("bob-user")].profiles[0].rank = { rating: 1712.4, rd: 61, vol: 0.06, games: 14, wins: 9, losses: 5, draws: 0, peak: 1750, school: "ra", last: 1,
    pairs: { day: "2026-11-04", n: { x: 1 } } };
  st.accounts[acct("alice-user")].profiles[0].rank = { rating: 1580, rd: 200, vol: 0.06, games: 2, wins: 2, losses: 0, draws: 0, peak: 1580, school: "beginner", last: 1 };
  h.game.store.saveRaw(st);
  const look = (user: string | null, q: string) => rankLookup(h.game, user, new URLSearchParams(q)) as any;
  return { h, a, b, sess, look };
}

describe("rank lookup", () => {
  it("shows a placed player's school, division, label and rounded rating, and nothing else of the record", async () => {
    const f = await setup(), bob = f.sess("bob-user").pid!;
    const r = f.look("alice-user", `pid=${bob}`);
    expect(r.players).toEqual([{ pid: bob, name: "Bob", known: true, placed: true, school: "ra", division: 2, label: "Ra Yellow II", rating: 1712, placement: null }]);
    expect(Object.keys(r.players[0]).sort()).toEqual(PUBLIC);
    expect(JSON.stringify(r)).not.toMatch(/rd|vol|wins|losses|peak|pairs|top|leeway|uniform|ladder/);
  });
  it("shows an unplaced player as Unranked with the placement count and no rating", async () => {
    const f = await setup(), alice = f.sess("alice-user").pid!;
    expect(f.look("bob-user", `pid=${alice}`).players[0]).toEqual({ pid: alice, name: "Alice", known: true, placed: false, school: "beginner",
      division: 0, label: "Unranked", rating: null, placement: { played: 2, of: 5 } });
    // a character that never played a rated match: 0 of 5
    expect(publicRank(PID_BASE, "New", {})).toMatchObject({ placed: false, label: "Unranked", rating: null, placement: { played: 0, of: 5 } });
  });
  it("finds a player online by the card's name, and one's own characters by slot", async () => {
    const f = await setup();
    expect(f.look("alice-user", "name=Bob").players[0]).toMatchObject({ pid: f.sess("bob-user").pid, label: "Ra Yellow II", rating: 1712 });
    const self = f.look("alice-user", "self=1").players;
    expect(self).toHaveLength(1);
    expect(self[0]).toMatchObject({ pid: f.sess("alice-user").pid, name: "Alice", label: "Unranked" });
  });
  it("answers unknown players, NPCs and absent names as known: false", async () => {
    const f = await setup();
    expect(f.look("alice-user", `pid=${PID_BASE + 4 * 40 + 1}&pid=7&name=Nobody`).players).toEqual([
      { pid: PID_BASE + 4 * 40 + 1, known: false }, { pid: 7, known: false }, { pid: null, name: "Nobody", known: false }]);
  });
  it("needs a session in the game and a well-formed, bounded query", async () => {
    const f = await setup();
    expect(f.look(null, "pid=1000")).toMatchObject({ error: "signed out", status: 401 });
    expect(f.look("stranger", "pid=1000")).toMatchObject({ error: "not-in-game" });
    expect(f.look("alice-user", "")).toMatchObject({ error: "bad-request", status: 400 });
    expect(f.look("alice-user", "pid=abc")).toMatchObject({ status: 400 });
    expect(f.look("alice-user", Array.from({ length: RANK_MAX_IDS + 1 }, (_, i) => `pid=${1000 + i}`).join("&"))).toMatchObject({ status: 400 });
  });
  it("rate-limits each account with a token bucket that refills", async () => {
    const f = await setup(), bob = f.sess("bob-user").pid!;
    for (let i = 0; i < RANK_BURST; i++) expect(f.look("alice-user", `pid=${bob}`).players).toHaveLength(1);
    const limited = f.look("alice-user", `pid=${bob}`);
    expect(limited).toMatchObject({ error: "rate-limited", status: 429 });
    expect(limited.retryAfter).toBeGreaterThan(0);
    expect(f.look("bob-user", `pid=${bob}`).players).toHaveLength(1);   // per account
    const t = f.h.game.clock.time();
    vi.spyOn(f.h.game.clock, "time").mockReturnValue(t + 5);
    expect(f.look("alice-user", `pid=${bob}`).players).toHaveLength(1);
  });
  it("follows the record as it changes (memoised per saved state only)", async () => {
    const f = await setup(), bob = f.sess("bob-user").pid!, acct = f.h.game.hub.acctOfUser("bob-user");
    expect(f.look("alice-user", `pid=${bob}`).players[0].label).toBe("Ra Yellow II");
    const st = f.h.state(); st.accounts[acct].profiles[0].rank.rating = 2010; st.accounts[acct].profiles[0].rank.school = "obelisk";
    f.h.game.store.saveRaw(st);
    expect(f.look("alice-user", `pid=${bob}`).players[0]).toMatchObject({ label: "Obelisk Blue II", school: "obelisk", rating: 2010 });
  });
});

describe("rank route", () => {
  it("the Worker forwards only a verified session to the DO, GET only", async () => {
    const forwarded = vi.fn(async (r: Request) => Response.json({ path: new URL(r.url).pathname, query: new URL(r.url).search, user: r.headers.get("x-de-user") }));
    const env = { PUBLIC_ORIGIN: "https://de.test", WORLD: { idFromName: () => "world", get: () => ({ fetch: forwarded }) } };
    const run = (path: string, init: RequestInit = {}) => worker.fetch(new Request("https://de.test" + path, init), env as any, { waitUntil() {} } as any);
    auth.verifySession.mockResolvedValueOnce(null);
    expect((await run("/api/de/rank?pid=1001", { headers: { "x-de-user": "victim" } })).status).toBe(401);
    expect(forwarded).not.toHaveBeenCalled();
    expect(await (await run("/api/de/rank?pid=1001", { headers: { "x-de-user": "victim" } })).json()).toEqual({ path: "/__de/rank", query: "?pid=1001", user: "real-user" });
  });
  it("the DO answers with a short private cache, 401 without a user, 405 for writes and Retry-After on 429", async () => {
    const f = await setup(), bob = f.sess("bob-user").pid!;
    const resident = new WorldDO({ blockConcurrencyWhile: () => Promise.resolve() } as any, {} as any);
    (resident as any).srv = f.h.srv;
    const call = (q: string, user = "alice-user", method = "GET") => resident.fetch(new Request(`https://world.test/__de/rank${q}`, { method, headers: user ? { "x-de-user": user } : {} }));
    const ok = await call(`?pid=${bob}`);
    expect(ok.status).toBe(200); expect(ok.headers.get("Cache-Control")).toBe("private, max-age=30");
    expect((await ok.json() as any).players[0]).toMatchObject({ label: "Ra Yellow II", rating: 1712 });
    expect((await call(`?pid=${bob}`, "")).status).toBe(401);
    expect((await call(`?pid=${bob}`, "alice-user", "POST")).status).toBe(405);
    let last!: Response;
    for (let i = 0; i < RANK_BURST + 1; i++) last = await call(`?pid=${bob}`, "bob-user");
    expect(last.status).toBe(429); expect(Number(last.headers.get("Retry-After"))).toBeGreaterThan(0);
    expect(await last.json()).toMatchObject({ error: "rate-limited" });
  });
});
