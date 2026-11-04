// Ranked PvP rating (game/ranking.ts) and what it gates: the Duel Academy rank uniforms by the best school ever
// reached (kept for good), and the graduated student's leeway (GRADUATION_LEVEL) to wear any owned outfit in the
// Academy. Server paths: the HTML wardrobe (cosmetics.ts), the native 0x4170 (lobby.ts), the 0x3114 bits for the
// recompiled editor (persist.ts pbinBytes) and the PvP match end (pvpMatch.ts).
import { afterEach, describe, expect, it, vi } from "vitest";
import { configFrom, DUEL_PORT } from "../src/config.ts";
import { buildServer } from "../src/server.ts";
import { Conn } from "../src/net/conn.ts";
import { Reader as WireReader } from "../src/net/proto.ts";
import { Session } from "../src/game/hub.ts";
import * as PP from "../src/game/persist.ts";
import * as RK from "../src/game/ranking.ts";
import { rowsToState, stateToRows } from "../src/db/project.ts";
import { AVATAR_ROWS, BOXES, COSMETIC_BY_BIT, cosmeticPool } from "../src/game/cosmetics-catalog.ts";
import { cosmeticInfo, cosmeticEquip, cosmeticAppearance, pushRankBits } from "../src/game/cosmetics.ts";
import { shopCatalog, WEARABLE_AVATAR_SLOTS } from "../src/game/shop.ts";
import { WHY_DISCONNECT, WHY_LP, WHY_SURRENDER } from "../src/duel/duelfin.ts";
import type { PvpMatch } from "../src/duel/pvpMatch.ts";
import type { PvpSession } from "../src/duel/ocgSession.ts";
import { be32, harness } from "./notes-harness.ts";

const DAY = 86400e3, T0 = Date.UTC(2026, 10, 4, 12);
const placed = (rating: number, extra: Partial<RK.Rank> = {}): RK.Rank =>
  ({ ...RK.rankOf(null), rating, rd: 60, games: 20, wins: 10, losses: 10, school: RK.schoolAfter("beginner", rating, true),
    best: RK.schoolAfter("beginner", rating, true), last: T0, ...extra });
const fresh = () => RK.rankOf(null);
const win = { winner: 0 as const, forfeit: false, short: false };

afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers(); PP.setProgression(false); });

describe("Glicko-2 rating, as duelforge", () => {
  it("matches Glickman's worked example (2013): 1500/200/0.06 against 1400/30 (win), 1550/100, 1700/300 (losses)", () => {
    const r = RK.glicko2Update({ rating: 1500, rd: 200, vol: 0.06 }, [{ rating: 1400, rd: 30, score: 1 }, { rating: 1550, rd: 100, score: 0 }, { rating: 1700, rd: 300, score: 0 }]);
    expect(r.rating).toBeCloseTo(1464.06, 1); expect(r.rd).toBeCloseTo(151.52, 1); expect(r.vol).toBeCloseTo(0.05999, 4);
  });
  it("a win raises and a loss lowers, from 1500/350/0.06; counters, peak and the day's pair count move", () => {
    const [w, l] = RK.rateMatch(fresh(), fresh(), ["a", "b"], win, T0);
    expect(w!.rating).toBeGreaterThan(1500); expect(l!.rating).toBeLessThan(1500);
    expect(w!.rating - 1500).toBeCloseTo(1500 - l!.rating, 6);     // equal priors: symmetric
    expect(w!.rd).toBeLessThan(350);
    expect([w!.games, w!.wins, w!.losses, l!.games, l!.wins, l!.losses]).toEqual([1, 1, 0, 1, 0, 1]);
    expect(w!.peak).toBe(w!.rating); expect(l!.peak).toBe(1500);
    expect(w!.pairs).toEqual({ day: "2026-11-04", n: { b: 1 } }); expect(l!.pairs).toEqual({ day: "2026-11-04", n: { a: 1 } });
    expect([w!.last, l!.last]).toEqual([T0, T0]);
  });
  it("places after 5 rated results: Beginner until then, then the rating's school", () => {
    let a = fresh(), b = fresh();
    for (let i = 0; i < 4; i++) { [a, b] = RK.rateMatch(a, b, ["a", "b"], win, T0 + i * DAY) as [RK.Rank, RK.Rank]; expect(RK.rankInfo(a)).toMatchObject({ placed: false, school: "beginner", label: "Beginner" }); }
    expect(RK.rankInfo(a).placementLeft).toBe(1);
    [a, b] = RK.rateMatch(a, b, ["a", "b"], win, T0 + 9 * DAY) as [RK.Rank, RK.Rank];
    expect(RK.rankInfo(a)).toMatchObject({ placed: true, games: 5, placementLeft: 0 });
    expect(a.rating).toBeGreaterThan(1700); expect(a.school).toBe(RK.tierOf(a.rating, true).school);
    expect(b.school).toBe("slifer");                                  // a placed player is never below Slifer Red
  });
  it("never goes below the floor (100)", () => {
    const [, l] = RK.rateMatch(placed(2400), placed(100, { rd: 30 }), ["a", "b"], win, T0);
    expect(l!.rating).toBe(RK.RATING_FLOOR);
    expect(RK.rankOf({ rank: { rating: -5, games: 9 } }).rating).toBe(RK.RATING_FLOOR);
  });
  it("forfeits and draws: a short forfeit rates only the leaver; draws are 0.5; short draws, a 6th pair result today and one account on both sides are unrated", () => {
    const [w, l] = RK.rateMatch(fresh(), fresh(), ["a", "b"], { winner: 0, forfeit: true, short: true }, T0);
    expect(w).toBeNull(); expect(l!.losses).toBe(1); expect(l!.rating).toBeLessThan(1500);
    const [w2, l2] = RK.rateMatch(fresh(), fresh(), ["a", "b"], { winner: 1, forfeit: true, short: false }, T0);
    expect(w2!.losses).toBe(1); expect(l2!.wins).toBe(1);             // a long forfeit rates both
    const [d0, d1] = RK.rateMatch(fresh(), fresh(), ["a", "b"], { winner: null, forfeit: false, short: false }, T0);
    expect([d0!.draws, d1!.draws]).toEqual([1, 1]); expect(d0!.rating).toBeCloseTo(1500, 6);
    expect(RK.rateMatch(fresh(), fresh(), ["a", "b"], { winner: null, forfeit: false, short: true }, T0)).toEqual([null, null]);
    expect(RK.rateMatch(fresh(), fresh(), ["a", "a"], win, T0)).toEqual([null, null]);
    let a = fresh(), b = fresh();
    for (let i = 0; i < RK.RATED_PAIR_DAY_MAX; i++) [a, b] = RK.rateMatch(a, b, ["a", "b"], win, T0) as [RK.Rank, RK.Rank];
    expect(RK.rateMatch(a, b, ["a", "b"], win, T0 + 1000)).toEqual([null, null]);
    expect(RK.rateMatch(a, b, ["a", "b"], win, T0 + DAY)[0]).not.toBeNull();   // a new UTC day
    expect(RK.rateMatch(a, fresh(), ["a", "c"], win, T0)[0]).not.toBeNull();    // another opponent
  });
});

describe("tiers and rank uniforms", () => {
  it("duelforge's thresholds: Slifer below 1550 (II from 1400), Ra from 1550, Obelisk from 1850, Master from 2150", () => {
    const at = (r: number) => RK.tierOf(r, true).label;
    expect([1399, 1400, 1549, 1550, 1700, 1849, 1850, 2000, 2149, 2150].map(at)).toEqual(["Slifer Red I", "Slifer Red II", "Slifer Red II",
      "Ra Yellow I", "Ra Yellow II", "Ra Yellow II", "Obelisk Blue I", "Obelisk Blue II", "Obelisk Blue II", "Master"]);
    expect(RK.tierOf(2500, false).school).toBe("beginner");
  });
  it("promotes at once and demotes only 50 below the threshold", () => {
    expect(RK.schoolAfter("slifer", 1550, true)).toBe("ra");
    expect(RK.schoolAfter("ra", 1501, true)).toBe("ra"); expect(RK.schoolAfter("ra", 1499, true)).toBe("slifer");
    expect(RK.schoolAfter("obelisk", 1810, true)).toBe("obelisk"); expect(RK.schoolAfter("obelisk", 1790, true)).toBe("ra");
    expect(RK.schoolAfter("obelisk", 1400, true)).toBe("slifer");
    expect(RK.schoolAfter("ra", 1900, false)).toBe("beginner");
    expect(RK.rankInfo(placed(1520, { school: "ra" }))).toMatchObject({ school: "ra", label: "Ra Yellow I", uniforms: ["slifer", "ra"] });
  });
  it("keeps the uniforms of the best school ever reached: the school shown goes down, the unlock doesn't", () => {
    let me = placed(1840), opp = placed(1900, { rd: 30 });
    [me] = RK.rateMatch(me, opp, ["a", "b"], win, T0) as [RK.Rank, RK.Rank];
    expect(me.rating).toBeGreaterThanOrEqual(1850);
    expect(RK.rankInfo(me)).toMatchObject({ school: "obelisk", bestSchool: "obelisk", uniforms: ["slifer", "ra", "obelisk"] });
    for (let i = 0; i < 100 && me.rating >= 1450; i++) [me] = RK.rateMatch(me, placed(1500, { rd: 30 }), ["a", `c${i}`], { winner: 1, forfeit: false, short: false }, T0) as [RK.Rank, RK.Rank];
    expect(me.rating).toBeLessThan(1500);
    expect(RK.rankInfo(me)).toMatchObject({ school: "slifer", label: expect.stringMatching(/^Slifer Red/), bestSchool: "obelisk", uniforms: ["slifer", "ra", "obelisk"] });
    // unplaced swings never unlock: a 2000 in placement games is still Beginner's
    const swing = RK.rankOf({ rank: { rating: 2000, games: 3, school: "beginner" } });
    expect([swing.school, swing.best]).toEqual(["beginner", "beginner"]);
    // a record from before `best`: its stored school; best never drops below a school held
    expect(RK.rankOf({ rank: { rating: 1400, games: 9, school: "ra" } }).best).toBe("ra");
    expect(RK.rankOf({ rank: { rating: 1400, games: 9, school: "slifer", best: "obelisk" } }).best).toBe("obelisk");
    expect(RK.rankOf({ rank: { rating: 1900, games: 9, school: "obelisk", best: "slifer" } }).best).toBe("obelisk");
  });
  it("unlocks cumulatively; Slifer Red is everyone's, Beginner included; the 12 uniform rows are the Academy Red/Yellow/Blue (and 2) rows", () => {
    expect(RK.RANK_SCHOOLS.map((s) => RK.unlockedUniforms(s))).toEqual([["slifer"], ["slifer"], ["slifer", "ra"], ["slifer", "ra", "obelisk"], ["slifer", "ra", "obelisk"]]);
    expect(Object.fromEntries(RK.RANK_UNIFORM_BY_BIT)).toEqual({ 128: "slifer", 129: "ra", 130: "obelisk", 132: "slifer", 133: "ra", 134: "obelisk",
      384: "slifer", 385: "ra", 386: "obelisk", 388: "slifer", 389: "ra", 390: "obelisk" });
    expect(RK.uniformAllowed(131, "beginner")).toBe(true);                // Academy: Tracksuit is no school's
    expect([128, 129, 130].map((b) => RK.uniformAllowed(b, "beginner"))).toEqual([true, false, false]);
    expect([128, 129, 130].map((b) => RK.uniformAllowed(b, "ra"))).toEqual([true, true, false]);
    expect([386, 390].map((b) => RK.uniformAllowed(b, "master"))).toEqual([true, true]);
  });
  it("rank uniforms are never sold and never drop from a box", () => {
    const bits = [...RK.RANK_UNIFORM_BY_BIT.keys()];
    for (const box of BOXES) expect(cosmeticPool(box.id).some((i) => i.variants.some((v) => bits.includes(v.bit))), box.id).toBe(false);
    for (const bit of bits) expect(COSMETIC_BY_BIT.has(bit), String(bit)).toBe(false);   // not even a tradable catalog item
    const srv = buildServer(configFrom({ PARITY_SEED: "1" }), { players: {} }, () => {});
    // The native shop's avatar rows (type 2): no outfit at all (WEARABLE_AVATAR_SLOTS), so no uniform.
    const sold = shopCatalog(srv.game).filter((e) => e[4] === 2).map((e) => new DataView(e.buffer, e.byteOffset).getUint32(5));
    expect(WEARABLE_AVATAR_SLOTS.has(6)).toBe(true);
    for (const bit of bits) expect(sold).not.toContain(bit);
    expect(sold.filter((bit) => AVATAR_ROWS[String(bit)]?.[3] === 6)).toEqual([]);
  });
});

// ─────────────────────────────── the server's rules, over the HTML wardrobe ───────────────────────────────
function fixture(extra = 0) {
  PP.setProgression(true);
  const names = ["alice", "bob", ...Array.from({ length: extra }, (_, i) => `x${i}`)];
  const accounts = Object.fromEntries(names.map((name, i) => {
    const p = PP.blankProfile(name); p.prog = 1; p.rec.mp = 15000; p.mp_wallet = { version: 1, bound: 5000 };
    return [name, { idx: i + 1, user_id: `user-${name}`, active_slot: 0, players: { "0": name }, profiles: { "0": p } }];
  }));
  const srv = buildServer(configFrom({ PROGRESSION: "1", PVP_TEST: "1", PARITY_SEED: "1" }), { accounts }, () => {});
  srv.game.clock.fixed = T0 / 1000;
  const sessions = ["alice", "bob"].map((name, i) => {
    const s = new Session(name, i + 1, false); s.slot = 0; s.pid = 1000 + 4 * (i + 1); s.name = name; s.world = 1; s.state = 0;
    const lobby: [number, Uint8Array][] = [], account: [number, Uint8Array][] = [];
    s.lobby = { closed: false, post: (id: number, data: Uint8Array) => lobby.push([id, data]), sess: s, port: 5730 } as any;
    s.conns.set(srv.game.ports.game, { closed: false, post: (id: number, data: Uint8Array) => account.push([id, data]) } as any);
    srv.game.hub.sessions.set(name, s); return { s, lobby, account };
  });
  const mutate = (fn: (st: any) => void) => { const st = srv.game.store.loadRaw(); fn(st); srv.game.store.saveRaw(st); };
  const setRank = (name: string, r: RK.Rank | null) => mutate((st) => { const p = st.accounts[name].profiles["0"]; if (r) p.rank = r; else delete p.rank; });
  return { ...srv, g: srv.game, a: sessions[0].s, b: sessions[1].s, sessions, mutate, setRank, raw: () => srv.game.store.loadRaw() };
}
/** A ladder of `n` placed characters: x0..x(n-3) at 1600..; alice and bob as given. */
function ladderOf(f: ReturnType<typeof fixture>, n: number, alice: number, bob: number) {
  f.mutate((st) => {
    for (let i = 0; i < n - 2; i++) st.accounts[`x${i}`].profiles["0"].rank = placed(1600 + i);
    st.accounts.alice.profiles["0"].rank = placed(alice); st.accounts.bob.profiles["0"].rank = placed(bob);
  });
}
const look = (f: ReturnType<typeof fixture>, who: string, world: 0 | 1) => [...PP.avatarParts(f.raw().accounts[who].profiles["0"], world)];
const choices = (info: any, world: string, slot: number) => info.appearanceOptionsByWorld[world].find((o: any) => o.index === slot).choices.map((c: any) => c.value);
const bitSet = (bytes: Uint8Array, bit: number) => !!(bytes[bit >> 3] & (1 << (bit & 7)));

describe("the server refuses a rank uniform the player hasn't unlocked (it was LV 10 / 20)", () => {
  it("Ra Yellow needs Ra, Obelisk Blue needs Obelisk; LV no longer matters; the lists and the info API agree", () => {
    const f = fixture();
    const info = cosmeticInfo(f.g, f.a) as any;
    expect(info.rank).toMatchObject({ rating: 1500, games: 0, placed: false, school: "beginner", label: "Beginner", bestSchool: "beginner",
      graduated: false, graduationLevel: RK.GRADUATION_LEVEL, uniforms: ["slifer"] });
    expect(info.rank).not.toHaveProperty("top"); expect(info.rank).not.toHaveProperty("leeway"); expect(info.rank).not.toHaveProperty("ladder");
    expect(choices(info, "1", 6)).toContain(0x80); expect(choices(info, "1", 6)).not.toContain(0x81); expect(choices(info, "1", 6)).not.toContain(0x82);
    const parts = info.appearance.looks["1"].slice(); parts[6] = 0x81;
    f.mutate((st) => { st.accounts.alice.profiles["0"].rec.lv = 30; });      // LV 30 alone: still refused
    expect(cosmeticAppearance(f.g, f.a, { world: 1, parts })).toMatchObject({ error: "unowned-or-invalid-appearance" });
    expect(cosmeticAppearance(f.g, f.a, { world: 0, parts })).toMatchObject({ error: "unowned-or-invalid-appearance" });   // in Domino too
    f.setRank("alice", placed(1600));
    expect((cosmeticInfo(f.g, f.a) as any).rank).toMatchObject({ school: "ra", placed: true, uniforms: ["slifer", "ra"] });
    expect(cosmeticAppearance(f.g, f.a, { world: 1, parts })).toMatchObject({ appearanceUpdated: true });
    parts[6] = 0x82;
    expect(cosmeticAppearance(f.g, f.a, { world: 1, parts })).toMatchObject({ error: "unowned-or-invalid-appearance" });
    parts[6] = 0x80;                                                          // a higher school still wears Slifer Red
    expect(cosmeticAppearance(f.g, f.a, { world: 1, parts })).toMatchObject({ appearanceUpdated: true });
    f.setRank("alice", placed(1900));
    const top = cosmeticInfo(f.g, f.a) as any;
    expect(choices(top, "1", 6)).toEqual(expect.arrayContaining([0x80, 0x81, 0x82]));
    parts[6] = 0x82;
    expect(cosmeticAppearance(f.g, f.a, { world: 1, parts })).toMatchObject({ appearanceUpdated: true });
  });
  it("the '2' variants follow their school and still need owning (Alexis's Blue 2 included)", () => {
    const f = fixture();
    f.mutate((st) => { st.accounts.alice.profiles["0"].pbin.push(133, 134); });
    const parts = (cosmeticInfo(f.g, f.a) as any).appearance.looks["1"].slice(); parts[6] = 0x85;
    expect(cosmeticAppearance(f.g, f.a, { world: 1, parts })).toMatchObject({ error: "unowned-or-invalid-appearance" });
    f.setRank("alice", placed(1600));
    expect(cosmeticAppearance(f.g, f.a, { world: 1, parts })).toMatchObject({ appearanceUpdated: true });
    parts[6] = 0x86;
    expect(cosmeticAppearance(f.g, f.a, { world: 1, parts })).toMatchObject({ error: "unowned-or-invalid-appearance" });
    parts[6] = 0x84;                                                          // Red 2: Slifer's, but not owned
    expect(cosmeticAppearance(f.g, f.a, { world: 1, parts })).toMatchObject({ error: "unowned-or-invalid-appearance" });
  });
  it("0x3114 carries the rank: uniforms of a school never reached cleared, PBIN_RANKED set, PBIN_GRADUATED for a graduated student only; p.pbin is not touched", () => {
    const f = fixture(), p = f.raw().accounts.alice.profiles["0"];
    const bytes = PP.pbinBytes(p, RK.rankView(p));
    expect([128, 129, 130, 384, 385, 386].map((b) => bitSet(bytes, b))).toEqual([true, false, false, true, false, false]);
    expect([bitSet(bytes, RK.PBIN_RANKED), bitSet(bytes, RK.PBIN_GRADUATED)]).toEqual([true, false]);
    expect(p.pbin).toEqual(expect.arrayContaining([129, 130, 385, 386]));
    expect(bitSet(PP.pbinBytes(p), 129)).toBe(true);                         // without a rank view: the stored bits
    const top = PP.pbinBytes(p, { bestSchool: "obelisk", graduated: true });
    expect([129, 130, RK.PBIN_RANKED, RK.PBIN_GRADUATED].map((b) => bitSet(top, b))).toEqual([true, true, true, true]);
    // demoted to Slifer after Obelisk: the bits stay
    const demoted = { ...p, rank: placed(1300, { school: "slifer", best: "obelisk" }) };
    expect([129, 130, 385, 386].map((b) => bitSet(PP.pbinBytes(demoted, RK.rankView(demoted)), b))).toEqual([true, true, true, true]);
    expect(bitSet(PP.pbinBytes({ ...p, graduated: 1 }, RK.rankView({ ...p, graduated: 1 })), RK.PBIN_GRADUATED)).toBe(true);
    expect(bitSet(PP.pbinBytes({ ...p, rec: { ...p.rec, lv: RK.GRADUATION_LEVEL } }, RK.rankView({ ...p, rec: { ...p.rec, lv: RK.GRADUATION_LEVEL } })), RK.PBIN_GRADUATED)).toBe(false);   // LV alone: no
  });
});

describe("graduated students (LV GRADUATION_LEVEL)", () => {
  const graduate = (f: ReturnType<typeof fixture>, name: string, lv = RK.GRADUATION_LEVEL) => f.mutate((st) => {
    const p = st.accounts[name].profiles["0"]; p.rec.lv = lv;
    if (lv >= RK.GRADUATION_LEVEL) p.graduated = 1;
  });
  it("needs LV GRADUATION_LEVEL and GRAD_OPPONENTS qualifying opponents, is kept for good (LV can fall back); the API says so", () => {
    expect([RK.GRADUATION_LEVEL, RK.GRAD_OPPONENTS, RK.GRAD_WINS_PER_OPP, RK.GRAD_OPP_MIN_AGE_MS]).toEqual([20, 25, 3, 7 * DAY]);
    expect(RK.isGraduated({ rec: { lv: 20 } })).toBe(false);                  // an admin-set LV alone: no
    expect(RK.isGraduated({ rec: { lv: 30 } })).toBe(false);
    expect(RK.isGraduated({ rec: { lv: 12 }, graduated: 1 })).toBe(true);
    const p = PP.blankProfile("g"); p.rec.lv = 19; p.rec.score = 39990;
    for (let i = 0; i < RK.GRAD_OPPONENTS; i++) RK.gradWin(p, `real${i}`, [`net${i}`]);
    expect([RK.gradOf(p).n, p.graduated]).toEqual([25, undefined]);           // LV 19: not yet
    PP.pvpXp(p, 19, "win");                                                    // 39990 + 40: LV 20
    expect([p.rec.lv, p.graduated]).toEqual([20, 1]);
    PP.pvpXp(p, 18, "lose"); PP.pvpXp(p, 18, "lose"); PP.pvpXp(p, 18, "lose");   // back under 40000: LV 19
    expect(p.rec.lv).toBe(19); expect(RK.isGraduated(p)).toBe(true);
    const back = rowsToState(stateToRows({ accounts: { a: { idx: 1, players: { "0": "g" }, profiles: { "0": p } } } } as any)).accounts.a.profiles["0"];
    expect([back.graduated, RK.gradOf(back).n]).toEqual([1, 25]);
    const f = fixture(); graduate(f, "alice");
    expect((cosmeticInfo(f.g, f.a) as any).rank).toMatchObject({ graduated: true, graduationLevel: 20 });
    expect((cosmeticInfo(f.g, f.b) as any).rank).toMatchObject({ graduated: false,
      graduation: { level: expect.any(Number), levelRequired: 20, opponents: 0, opponentsRequired: 25 } });
  });
  it("may wear a Domino outfit in the Academy (equip, full look); a student not graduated is refused", () => {
    const f = fixture();
    graduate(f, "alice"); graduate(f, "bob", RK.GRADUATION_LEVEL - 1);
    f.mutate((st) => { for (const n of ["alice", "bob"]) st.accounts[n].profiles["0"].pbin.push(119); });   // Black Suit (Domino)
    const ia = cosmeticInfo(f.g, f.a) as any, ib = cosmeticInfo(f.g, f.b) as any;
    expect(choices(ia, "1", 6)).toEqual(expect.arrayContaining([0x70, 0x77, 0x80])); expect(choices(ib, "1", 6)).not.toContain(0x77);
    expect(choices(ia, "1", 6)).not.toContain(0x82);                         // graduation is not a school: Obelisk Blue still needs Obelisk
    const out = cosmeticEquip(f.g, f.a, { id: "outfit:black-suit", world: 1 }) as any;
    expect(out.error).toBeUndefined(); expect(out.equipped.parts[6]).toBe(0x77); expect(look(f, "alice", 1)[6]).toBe(0x77);
    expect(cosmeticEquip(f.g, f.b, { id: "outfit:black-suit", world: 1 })).toMatchObject({ error: "no-compatible-variant", reason: "world" });
    const parts = ib.appearance.looks["1"].slice(); parts[6] = 0x70;          // Domino: White, a default row
    expect(cosmeticAppearance(f.g, f.b, { world: 1, parts })).toMatchObject({ error: "unowned-or-invalid-appearance" });
    expect(cosmeticAppearance(f.g, f.a, { world: 1, parts })).toMatchObject({ appearanceUpdated: true });
    parts[6] = 0x78;                                                          // QUALIFIER's Robe: not owned, graduated or not
    expect(cosmeticAppearance(f.g, f.a, { world: 1, parts })).toMatchObject({ error: "unowned-or-invalid-appearance" });
  });
  it("a demotion takes nothing back: no look reset, no re-dress, the uniform still in both worlds", () => {
    const f = fixture();
    f.mutate((st) => { const p = st.accounts.alice.profiles["0"]; p.rank = placed(1900); p.avatar = { a: "0000203040608290b020000000000000", b: "0000203040608290b820000000000000" }; });
    f.setRank("alice", placed(1300, { school: "slifer", best: "obelisk" }));   // demoted far past the buffer
    pushRankBits(f.g, ["alice"]);
    expect([look(f, "alice", 0)[6], look(f, "alice", 1)[6]]).toEqual([0x82, 0x82]);
    expect(f.sessions[0].lobby.filter(([id]) => id === 0x4181)).toEqual([]);   // nothing re-shown
    const pbin = f.sessions[0].account.find(([id]) => id === 0x3114)![1];
    expect([bitSet(pbin, 130), bitSet(pbin, 386), bitSet(pbin, RK.PBIN_GRADUATED)]).toEqual([true, true, false]);
    expect((cosmeticInfo(f.g, f.a) as any).rank).toMatchObject({ school: "slifer", bestSchool: "obelisk", uniforms: ["slifer", "ra", "obelisk"] });
    const parts = look(f, "alice", 0); parts[6] = 0x81;                      // Ra Yellow, in Domino
    expect(cosmeticAppearance(f.g, f.a, { world: 0, parts })).toMatchObject({ appearanceUpdated: true });
    f.g.hub.select(f.a.lobby as any, 0, 0, "alice");                         // and at character select
    expect([f.a.partsW.get(0)![6], f.a.partsW.get(1)![6]]).toEqual([0x81, 0x82]);
  });
  it("a uniform never reached is still put right at character select (a saved look from an old client)", () => {
    const f = fixture();
    f.mutate((st) => { st.accounts.alice.profiles["0"].avatar = { b: "0000203040608290b820000000000000" }; });   // Obelisk Blue, a Beginner
    f.g.hub.select(f.a.lobby as any, 0, 0, "alice");
    expect(f.a.partsW.get(1)![6]).toBe(0x80); expect(f.a.parts[6]).toBe(0x80);
    expect(look(f, "alice", 1)[6]).toBe(0x80);
    expect(f.raw().accounts.alice.profiles["0"].avatar.a).toBeUndefined();   // an unsaved look stays unsaved
  });
});

describe("the native 0x4170 (the 2008 editor, room entry)", () => {
  const send = async (h: ReturnType<typeof harness>, a: any, b: any, world: number, parts: Uint8Array) => {
    const n = a.room!.mark(), nb = b.room!.mark();
    a.room!.send(0x4170, [...be32(world), ...parts, 0, 0, 0, 0]);
    expect(await a.room!.wait(0x4171, n)).not.toBeNull();
    await h.tick(200);
    return { self: a.room!.all(0x4181, n).map((d: Uint8Array) => [...d.subarray(8)]), others: b.room!.all(0x4181, nb).map((d: Uint8Array) => [...d.subarray(8)]) };
  };
  it("a uniform of a school not reached, or a Domino outfit in the Academy, is kept and shown as the default; with the rank or graduation it goes through", async () => {
    const h = harness({ players: {} }, { DEV: "0" });
    const a = h.client("alice", "alice", "pw", "user-a"), b = h.client("bob", "bob", "pw", "user-b");
    await a.account(0, "Alice"); await b.account(0, "Bob");
    await a.enterRoom(); await b.enterRoom();
    const A = "u:user-a", stored = () => h.state().accounts[A].profiles["0"].avatar.b as string;
    const parts = Uint8Array.from([0, 0x00, 0x20, 0x30, 0x40, 0x60, 0x82, 0x90, 0xb8, 0x20, 0, 0, 0, 0, 0, 0]);   // Obelisk Blue
    const fixed = parts.slice(); fixed[6] = 0x80;
    let r = await send(h, a, b, 1, parts);
    expect(stored()).toBe(Buffer.from(fixed).toString("hex"));
    expect(r.others).toEqual([[...fixed]]); expect(r.self).toEqual([[...fixed]]);
    const edit = (fn: (st: any) => void) => { const st = h.state(); fn(st); h.game.store.saveRaw(st); };
    edit((st) => { st.accounts[A].profiles["0"].rank = placed(1900, { last: Date.now() }); });
    r = await send(h, a, b, 1, parts);
    expect(stored()).toBe(Buffer.from(parts).toString("hex")); expect(r.others).toEqual([[...parts]]); expect(r.self).toEqual([]);
    const domino = parts.slice(); domino[6] = 0x70;                          // Domino: White in the Academy
    r = await send(h, a, b, 1, domino);
    expect(stored()).toBe(Buffer.from(fixed).toString("hex")); expect(r.others).toEqual([[...fixed]]);
    edit((st) => { Object.assign(st.accounts[A].profiles["0"], { graduated: 1 }); st.accounts[A].profiles["0"].rec.lv = RK.GRADUATION_LEVEL; });
    r = await send(h, a, b, 1, domino);                                       // alice has graduated
    expect(stored()).toBe(Buffer.from(domino).toString("hex")); expect(r.others).toEqual([[...domino]]);
  });
});

// ─────────────────────────────── the PvP match end ───────────────────────────────
function pvpSetup() {
  vi.useFakeTimers();
  vi.setSystemTime(T0);
  const accounts = Object.fromEntries([1, 2].map((i) => {
    const p = PP.blankProfile(`Player${i}`); p.prog = 1; p.mp_wallet = { version: 1, bound: 0 }; p.rec.mp = 4321;
    return [`acct${i}`, { idx: i, players: { "0": `Player${i}` }, profiles: { "0": p }, active_slot: 0 }];
  }));
  const srv = buildServer(configFrom({ PROGRESSION: "1", PVP_TEST: "1", DUEL_PAUSE: "0.0001", PARITY_SEED: "1" }), { accounts }, () => {});
  const { game: g, world } = srv;
  const players = Object.keys(accounts).map((acct, i) => {
    const s = new Session(acct, i + 1, false);
    s.pid = g.hub.pidFor(s, 0); s.slot = 0; s.name = `Player${i + 1}`; s.block = "5740|0";
    s.ipbs = [`net${i + 1}`]; s.userCreated = T0 - 30 * DAY;               // two real people: other networks, month-old accounts
    g.hub.sessions.set(acct, s);
    const conn = (port: number) => { const r = new WireReader(); const c = new Conn(world, world.seqTable, port, `peer-${i}`, (b) => { r.feed(b); return true; }, DUEL_PORT); c.sess = s; s.conns.set(port, c); return c; };
    const lobby = conn(5740), duel = conn(DUEL_PORT); s.lobby = lobby;
    return { s, lobby, duel };
  });
  const match = () => {
    const m = g.pvp!.reserve(players[0].s, players[1].s) as unknown as PvpMatch;
    m.attach(players[0].duel); m.attach(players[1].duel);
    const e = { started: true, over: false, ended: false, turn: 12, stats: null, lastLp: [4000, 0], pending: () => 0, resend: () => {},
      end: vi.fn(() => { e.over = e.ended = true; }), surrender: vi.fn(), abandon: vi.fn() };
    m.ps = e as unknown as PvpSession;
    return m;
  };
  const ranks = () => [1, 2].map((i) => g.store.loadRaw().accounts[`acct${i}`].profiles["0"].rank as RK.Rank | undefined);
  return { srv, g, players, match, ranks, settle: async () => { await vi.advanceTimersByTimeAsync(2000); await world.idle(); } };
}

describe("PvP results move the rating", () => {
  it("a finished duel rates both (simultaneously, from the records before it) and survives the D1 round trip", async () => {
    const f = pvpSetup(), m = f.match();
    (m as any).t0 = Date.now() / 1000 - 600;
    m.gameEnd(0, WHY_LP, 12);
    await f.settle();
    const [w, l] = f.ranks();
    const [ew, el] = RK.rateMatch(fresh(), fresh(), ["acct1", "acct2"], win, T0);
    expect(w!.rating).toBeCloseTo(ew!.rating, 6); expect(l!.rating).toBeCloseTo(el!.rating, 6);
    expect([w!.wins, l!.losses, w!.games, l!.games]).toEqual([1, 1, 1, 1]);
    const st = f.g.store.loadRaw();
    expect(rowsToState(stateToRows(st)).accounts.acct1.profiles["0"].rank).toEqual(w);
  });
  it("rates in either world: a Domino duel moves the rating and school as an Academy one does", async () => {
    for (const world of [0, 1]) {
      const f = pvpSetup();
      for (const pl of f.players) { pl.s.world = world; pl.s.partsW.set(world, PP.avatarParts(PP.blankProfile("x"), world)); }
      const m = f.match();
      (m as any).t0 = Date.now() / 1000 - 600;
      m.gameEnd(0, WHY_LP, 12);
      await f.settle();
      const [w, l] = f.ranks();
      expect([w!.wins, l!.losses], `world ${world}`).toEqual([1, 1]);
      expect(w!.rating).toBeGreaterThan(1500);
    }
  });
  it("after a match both duelists get their 0x3114 again: a school reached, graduation by the match's XP; no look is reset", async () => {
    const f = pvpSetup(), sent: [number, Uint8Array][][] = [[], []];
    f.players.forEach((pl, i) => pl.s.conns.set(f.g.ports.game, { closed: false, post: (id: number, d: Uint8Array) => sent[i].push([id, d]) } as any));
    const st = f.g.store.loadRaw();
    Object.assign(st.accounts.acct1.profiles["0"], { rank: placed(1840, { rd: 120 }), avatar: { b: "0000203040607790b820000000000000" } });
    Object.assign(st.accounts.acct1.profiles["0"].rec, { lv: 19, score: 39990 });
    st.accounts.acct1.profiles["0"].pbin = [...(st.accounts.acct1.profiles["0"].pbin ?? []), 119];
    st.accounts.acct2.profiles["0"].rank = placed(1860, { rd: 120 });
    for (let i = 0; i < RK.GRAD_OPPONENTS - 1; i++) RK.gradWin(st.accounts.acct1.profiles["0"], `earlier${i}`, [`elsewhere${i}`]);   // 24 real opponents so far
    f.g.store.saveRaw(st);
    const m = f.match();
    (m as any).t0 = Date.now() / 1000 - 600;
    m.gameEnd(0, WHY_LP, 12);
    await f.settle();
    const p1 = f.g.store.loadRaw().accounts.acct1.profiles["0"];
    expect([p1.rec.lv, p1.graduated, RK.rankOf(p1).best, RK.gradOf(p1).n]).toEqual([20, 1, "obelisk", 25]);
    const pbin = sent[0].filter(([id]) => id === 0x3114).at(-1)![1];
    expect([bitSet(pbin, 130), bitSet(pbin, RK.PBIN_GRADUATED)]).toEqual([true, true]);
    expect(sent[1].some(([id]) => id === 0x3114)).toBe(true);
    expect(p1.avatar.b).toBe("0000203040607790b820000000000000");          // the Black Suit stays on in the Academy
  });
  it("a short disconnection loss rates only the leaver; a voided (restart) match rates nobody", async () => {
    const f = pvpSetup(), m = f.match();
    (m as any).t0 = Date.now() / 1000;
    m.gameEnd(1, WHY_DISCONNECT, 0, {}, true);                 // player 0 left at once
    await f.settle();
    const [left, stayed] = f.ranks();
    expect(left!.losses).toBe(1); expect(left!.rating).toBeLessThan(1500); expect(stayed).toBeUndefined();
    const f2 = pvpSetup(), m2 = f2.match();
    f2.g.restarting = true;
    m2.gameEnd(0, WHY_SURRENDER, 12);
    await f2.settle();
    expect(f2.ranks()).toEqual([undefined, undefined]);
  });
});
