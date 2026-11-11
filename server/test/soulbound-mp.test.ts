import { afterEach, describe, expect, it, vi } from "vitest";
import * as PP from "../src/game/persist.ts";
import { boundOf, legalDeck, walletInfo } from "../src/game/starter.ts";
import { shopCatalog } from "../src/game/shop.ts";
import { rowsToState, stateToRows } from "../src/db/project.ts";
import { be32, cat, harness, i32, u32, type Harness } from "./notes-harness.ts";

afterEach(() => { vi.useRealTimers(); PP.setProgression(false); });
const count = (items: Record<string, number> = {}) => Object.values(items).reduce((sum, n) => sum + n, 0);
const prof = (h: Harness) => h.state().accounts["u:user-a"].profiles["0"] as PP.P;
const mutate = (h: Harness, fn: (p: PP.P) => void) => {
  const st = h.state(); fn(st.accounts["u:user-a"].profiles["0"]); h.game.store.saveRaw(st);
};
async function setup() {
  const h = harness({ players: {} }, { PROGRESSION: "1" });
  const a = h.client("alice", "alice", "pw", "user-a");
  await a.account(0, "Alice"); await a.enterRoom();
  const items = shopCatalog(h.game).map((row) => ({ iid: u32(row), kind: row[4], prm: u32(row, 5), cost: u32(row, 9) }));
  const buy = async (...rows: [number, number][]) => {
    const mark = a.room!.mark();
    a.room!.send(0x5210, cat(...rows.map(([iid, n]) => cat(be32(iid), [n]))));
    const reply = await a.room!.wait(0x5211, mark);
    return i32(reply!);
  };
  return { h, a, items, buy };
}

describe("soulbound MP provenance", () => {
  it("new/reset grants are bound, duel winnings are earned, and spending consumes bound first", () => {
    PP.setProgression(true);
    const p = PP.profile({ players: { 0: "New" } }, 0)!;
    expect(PP.mpBalances(p)).toEqual({ total: 5000, bound: 5000, earned: 0 });
    PP.mpReward(null, p, "win", 5);
    expect(PP.mpBalances(p)).toEqual({ total: 5450, bound: 5000, earned: 450 });
    expect(PP.spendMp(p, 100)).toEqual({ bound: 100, earned: 0 });
    expect(PP.mpBalances(p)).toEqual({ total: 5350, bound: 4900, earned: 450 });
    expect(PP.spendMp(p, 5000)).toEqual({ bound: 4900, earned: 100 });
    expect(PP.mpBalances(p)).toEqual({ total: 350, bound: 0, earned: 350 });
  });

  it("preserves legacy earned savings without guessing their origin or resetting inventory", () => {
    PP.setProgression(true);
    const p: PP.P = { prog: 1, rec: { mp: 4200 }, trunk: { 123: 2 }, econ: { earned: 200, spent: 100 } };
    const state = { profiles: { 0: p } };
    PP.profile(state, 0);
    expect(PP.mpBalances(p)).toEqual({ total: 4200, bound: 0, earned: 4200 });
    expect(p.trunk).toEqual({ 123: 2 });
    expect(PP.mpBalances(p)).toEqual({ total: 4200, bound: 0, earned: 4200 });
  });

  it("retains the bound ledger in D1 for live and archived characters, and zeroes exhausted remake grants", () => {
    PP.setProgression(true);
    const state: PP.P = { profiles: {}, profiles_borrados: [] };
    for (let i = 0; i <= PP.FREE_STARTS; i++) {
      const p = PP.profile(state, 0)!;
      expect(PP.mpBalances(p).bound).toBe(i < PP.FREE_STARTS ? 5000 : 0);
      state.profiles_borrados.push({ slot: "0", perfil: p }); delete state.profiles["0"];
    }
    PP.profile(state, 0);
    const back = rowsToState(stateToRows({ accounts: { a: state } })) as PP.P;
    expect(back.accounts.a.profiles["0"].mp_wallet).toEqual({ version: 1, bound: 0 });
    expect(back.accounts.a.profiles_borrados[0].perfil.mp_wallet).toEqual({ version: 1, bound: 5000 });
  });

  it("migrates main's mp_bound ledger idempotently through D1, including archived profiles", () => {
    const legacy = { prog: 1, rec: { mp: 4200 }, mp_bound: 3200, trunk: { 123: 2 } };
    const state = { accounts: { a: { profiles: { 0: structuredClone(legacy) }, profiles_borrados: [{ perfil: structuredClone(legacy) }] } } };
    const back = rowsToState(stateToRows(state)) as PP.P;
    for (const p of [back.accounts.a.profiles[0], back.accounts.a.profiles_borrados[0].perfil]) {
      expect(PP.mpBalances(p)).toEqual({ total: 4200, bound: 3200, earned: 1000 });
      expect(PP.mpBalances(p)).toEqual({ total: 4200, bound: 3200, earned: 1000 });
      expect(p.trunk).toEqual({ 123: 2 });
      expect(PP.spendMp(p, 200)).toEqual({ bound: 200, earned: 0 });
    }
    const roundtrip = rowsToState(stateToRows(back)) as PP.P;
    expect(roundtrip.accounts.a.profiles[0].mp_wallet).toEqual({ version: 1, bound: 3000 });
    expect(roundtrip.accounts.a.profiles_borrados[0].perfil.mp_wallet).toEqual({ version: 1, bound: 3000 });
  });

  it("rejects invalid debits without altering either balance", () => {
    const p: PP.P = { rec: { mp: 100 }, mp_wallet: { version: 1, bound: 60 } };
    const before = JSON.stringify(p);
    for (const amount of [-1, 0.5, NaN, Infinity, 101]) expect(PP.spendMp(p, amount)).toBeNull();
    expect(JSON.stringify(p)).toBe(before);
  });
});

describe("bound-funded shop output", () => {
  it("an alt's starting MP buys usable but nontradeable packs and structure decks", async () => {
    const { h, items, buy } = await setup();
    const pack = items.find((item) => item.kind === 1 && item.prm === 1)!;
    const deck = items.find((item) => item.kind === 1 && item.prm === 8001)!;
    expect(await buy([pack.iid, 1], [deck.iid, 1])).toBe(0);
    const p = prof(h);
    expect(count(p.trunk)).toBeGreaterThanOrEqual(45);
    expect(boundOf(p)).toEqual(p.trunk);
    expect(PP.mpBalances(p)).toEqual({ total: 3800, bound: 3800, earned: 0 });
  });

  it("binds every card of a partly bound-funded pack; duplicate cart rows cannot launder it", async () => {
    const { h, items, buy } = await setup();
    mutate(h, (p) => { p.rec.mp = 400; p.mp_wallet.bound = 1; });
    const pack = items.find((item) => item.kind === 1 && item.prm === 1)!;
    expect(await buy([pack.iid, 1], [pack.iid, 1])).toBe(0);
    const p = prof(h);
    expect(count(p.trunk)).toBe(10);
    expect(count(boundOf(p))).toBe(5);
    expect(PP.mpBalances(p)).toEqual({ total: 0, bound: 0, earned: 0 });
  });

  it("leaves earned-funded pack copies tradeable beside bound copies", async () => {
    const { h, items, buy } = await setup();
    mutate(h, (p) => { p.rec.mp = 400; p.mp_wallet.bound = 25; });
    const pack = items.find((item) => item.kind === 1 && item.prm === 1)!;
    expect(await buy([pack.iid, 2])).toBe(0);
    const p = prof(h);
    expect(count(p.trunk)).toBe(10);
    expect(count(boundOf(p))).toBe(5);
    expect(count(p.trunk) - count(boundOf(p))).toBe(5);
  });

  it("withdrawn single and cosmetic ids consume no MP in a mixed pack cart", async () => {
    const { h, items, buy } = await setup();
    const pack = items.find((item) => item.kind === 1 && item.prm === 1)!;
    mutate(h, (p) => { p.rec.mp = 500; p.mp_wallet.bound = 250; });
    expect(await buy([61, 1], [107, 1], [pack.iid, 1])).toBe(0);
    const p = prof(h);
    expect(count(boundOf(p))).toBe(5);
    expect(PP.mpBalances(p)).toEqual({ total: 300, bound: 50, earned: 250 });
  });

  it("does not bind older earned copies when inventory caps discard a bound-funded pack", async () => {
    const { h, items, buy } = await setup();
    const pack = items.find((item) => item.kind === 1 && item.prm === 1)!;
    const { packContents } = await import("../src/game/shop.ts");
    mutate(h, (p) => { p.rec.mp = 200; p.mp_wallet.bound = 200;
      p.trunk = Object.fromEntries(packContents(1)!.cards.map((pc) => [pc, 255])); p.bound = {}; });
    const before = structuredClone(prof(h).trunk);
    expect(await buy([pack.iid, 1])).toBe(0);
    expect(prof(h).trunk).toEqual(before);
    expect(count(boundOf(prof(h)))).toBe(0);
  });

  it("initializes an older free starter's bindings before its first promotional-MP pack", async () => {
    const { h, items, buy } = await setup();
    const starter = legalDeck(8001), starterCards = [...starter.main, ...starter.extra];
    const pack = items.find((item) => item.kind === 1 && item.prm === 1)!;
    mutate(h, (p) => {
      p.starter = 8001; delete p.bound;
      for (const card of starterCards) p.trunk[card] = (p.trunk[card] ?? 0) + 1;
    });
    expect(await buy([pack.iid, 1])).toBe(0);
    const p = prof(h);
    expect(boundOf(p)).toEqual(p.trunk);
    expect(count(p.bound)).toBe(starterCards.length + 5);
  });

  it("keeps balances, inventory and bindings unchanged when a pack cart is unaffordable", async () => {
    const { h, items, buy } = await setup();
    mutate(h, (p) => { p.rec.mp = 150; p.mp_wallet.bound = 75; });
    const pack = items.find((item) => item.kind === 1)!;
    const before = prof(h);
    expect(await buy([pack.iid, 2])).toBe(1);
    expect(prof(h)).toEqual(before);
  });

  it("walletInfo returns the active character's split and safely persists a lazy legacy migration", async () => {
    const { h } = await setup();
    expect(walletInfo(h.game, "user-a")).toEqual({ total: 5000, bound: 5000, earned: 0 });
    mutate(h, (p) => { delete p.mp_wallet; p.rec.mp = 1234; });
    expect(walletInfo(h.game, "user-a")).toEqual({ total: 1234, bound: 0, earned: 1234 });
    expect(prof(h).mp_wallet).toEqual({ version: 1, bound: 0 });
    expect(walletInfo(h.game, "unknown")).toEqual({ error: "not-in-game" });
  });

  it("admin balance reductions clamp bound MP before a later credit, even without an intervening wallet read", async () => {
    const { h } = await setup();
    const session = h.game.hub.sessions.get(h.game.store.accountOfUser("user-a")!)!;
    h.game.withCtx(session, () => {
      (h.game.ph as any).set_wallet({ mp: 100 });
      (h.game.ph as any).set_wallet({ mp: 1500 });
    });
    expect(walletInfo(h.game, "user-a")).toEqual({ total: 1500, bound: 100, earned: 1400 });
  });
});
