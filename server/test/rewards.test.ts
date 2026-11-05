import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { legalDeck } from "../src/game/starter.ts";
import { harness } from "./notes-harness.ts";
import * as PP from "../src/game/persist.ts";
import { REWARDS, rewardLogin, rewardDuel, rewardEvent, rewardsView, rewardsClaim, rewardDeckSaved } from "../src/game/rewards.ts";
import { newRewardState, rollover, progress, utcWeek, type RewardEvent } from "../src/game/missions.ts";
import { stateToRows, rowsToState } from "../src/db/project.ts";
const day = 86400, now = Date.UTC(2026, 10, 5) / 1000;
beforeEach(() => { REWARDS.enabled = true; PP.setProgression(true); });
afterEach(() => { REWARDS.enabled = false; PP.setProgression(false); vi.restoreAllMocks(); });
async function setup() {
  const h = harness({ players: {} }, { PROGRESSION: "1" });
  const a = h.client("Alice", "alice", "pw", "rewards-user");
  await a.account(0, "Alice"); await a.enterRoom();
  const acct = h.game.hub.acctOfUser("rewards-user"), session = h.game.hub.sessions.get(acct)!;
  const edit = (fn: (p: any, st: any) => void) => { const st = h.game.store.loadRaw(); fn(st.accounts[acct].profiles[0], st.accounts[acct]); h.game.store.saveRaw(st); };
  const p = () => h.state().accounts[acct].profiles[0];
  const view = () => rewardsView(h.game, "rewards-user");
  const event = (type: RewardEvent, n = 1) => h.game.withCtx(session, () => { const st = h.game.loadState(); rewardEvent(h.game, PP.profile(st, 0)!, type, n); h.game.saveState(st); });
  const claim = (id: string, requestId = view().nextRequestId) => rewardsClaim(h.game, "rewards-user", { id, requestId });
  return { h, a, acct, session, edit, p, view, event, claim };
}
describe("reward mission state", () => {
  it.each<RewardEvent>(["play", "win", "npc", "pvp", "extra", "deck", "pack", "shop", "days"])("tracks %s from its trusted server event", event => {
    const r = newRewardState(now); rollover(r, now);
    r.missions.push({ id: "test", label: "test", kind: "lifetime", event, target: 2, progress: 0, mp: 1, claimed: false });
    progress(r, event, 2);
    expect(r.missions.find(m => m.id === "test")?.progress).toBe(2);
    expect(r.missions.filter(m => m.event !== event).every(m => m.progress === 0)).toBe(true);
  });
  it("stockpiles at most nine unfinished dailies; repeat reads and missed days add no catchup", () => {
    const r = newRewardState(now); rollover(r, now); rollover(r, now);
    expect(r.missions.filter(m => m.kind === "daily")).toHaveLength(3);
    rollover(r, now + day * 20); expect(r.missions.filter(m => m.kind === "daily")).toHaveLength(6);
    rollover(r, now + day * 21); rollover(r, now + day * 22);
    expect(r.missions.filter(m => m.kind === "daily")).toHaveLength(9);
  });
  it("shares daily stockpile and weekly issuance across characters including archived peers", () => {
    const a = newRewardState(now), b = newRewardState(now);
    rollover(a, now); rollover(b, now, [a]);
    expect(b.missions.filter(m => m.kind === "daily" || m.kind === "weekly")).toHaveLength(0);
    for (let i = 1; i < 5; i++) rollover(b, now + day * i, [a]);
    expect([a, b].flatMap(r => r.missions.filter(m => m.kind === "daily"))).toHaveLength(9);
  });
  it("rolls weekly missions at Monday 00:00 UTC; first/lifetime progress survives", () => {
    const sunday = Date.UTC(2026, 10, 8, 23, 59, 59) / 1000, r = newRewardState(sunday);
    rollover(r, sunday); progress(r, "play", 3);
    rollover(r, sunday + 1);
    expect(utcWeek(sunday + 1)).toBe("2026-11-09");
    expect(r.missions.find(m => m.kind === "weekly" && m.event === "play")?.progress).toBe(0);
    expect(r.missions.find(m => m.id === "first:duel4")?.progress).toBe(3);
  });
  it("login pays once per UTC date, uses milestone replacement and resets streak after a gap", () => {
    const p: any = { rec: { mp: 5000 }, mp_wallet: { version: 1, bound: 5000 } };
    let t = now;
    const g: any = { clock: { time: () => t }, ctx: null, ctxAcct: () => "acct", log: vi.fn() };
    for (let i = 0; i < 20; i++) { t = now + i * day; rewardLogin(g, p); rewardLogin(g, p); }
    expect(p.rec.mp).toBe(5000 + 18 * 40 + 2 * 100);
    expect(p.mp_wallet.bound).toBe(5000); expect(p.rewards.login.streak).toBe(20);
    t += day * 2; rewardLogin(g, p); expect(p.rewards.login.streak).toBe(1);
    expect(p.rewards.audit).toHaveLength(21); expect(g.log).toHaveBeenCalledTimes(21);
  });
  it("midnight splits the login and mission day exactly", () => {
    let t = now + day - 1;
    const g: any = { clock: { time: () => t }, ctx: null, ctxAcct: () => "acct", log: vi.fn() }, p: any = {};
    rewardLogin(g, p); t++; rewardLogin(g, p);
    expect(p.rewards.login.count).toBe(2); expect(p.rec.mp).toBe(80);
    expect(p.rewards.missions.filter((m: any) => m.kind === "daily")).toHaveLength(6);
  });
});
describe("reward server integration", () => {
  it("claims exactly once, detects conflicting/stale requests, persists receipts and audits through D1", async () => {
    const f = await setup(); f.event("shop");
    const requestId = f.view().nextRequestId, before = f.p().rec.mp;
    expect(f.claim("first:shop", requestId)).toMatchObject({ grant: { mp: REWARDS.first[0].mp }, replayed: false });
    const restored = rowsToState(stateToRows(f.h.state())); f.h.game.store.saveRaw(restored);
    expect(f.claim("first:shop", requestId)).toMatchObject({ replayed: true });
    expect(f.p().rec.mp).toBe(before + REWARDS.first[0].mp);
    expect(f.claim("first:deck", requestId)).toMatchObject({ error: "request-id-conflict" });
    expect(f.claim("first:shop", "bad")).toMatchObject({ error: "stale-request" });
    expect(f.p().rewards.audit.filter((a: any) => a.id === "first:shop")).toHaveLength(1);
    expect(f.p().mp_wallet.bound).toBe(5000);
    expect(PP.mpBalances(f.p()).earned).toBeGreaterThanOrEqual(REWARDS.first[0].mp);
  });
  it("all reward categories pay earned MP while the starter grant stays bound", async () => {
    const f = await setup();
    for (const type of ["shop", "deck", "pack", "play", "win", "npc", "pvp", "extra", "days"] as RewardEvent[]) f.event(type, 500);
    const v = f.view(), ms = v.missions.filter((m: any) => m.claimable);
    expect(new Set(ms.map((m: any) => m.kind)).size).toBe(4);
    const before = f.p().rec.mp;
    for (const m of ms) expect(f.claim(m.id).grant.mp).toBe(m.mp);
    expect(f.p().rec.mp).toBe(before + ms.reduce((n: number, m: any) => n + m.mp, 0));
    expect(PP.mpBalances(f.p()).bound).toBe(5000);
  });
  it("refuses incomplete/forged/reclaimed missions, invalid JSON shapes and overflow", async () => {
    const f = await setup();
    expect(f.claim("first:duel12")).toMatchObject({ error: "not-claimable" });
    expect(f.claim("injected")).toMatchObject({ error: "not-claimable" });
    expect(rewardsClaim(f.h.game, "rewards-user", { id: "x" })).toMatchObject({ error: "invalid-reward", status: 400 });
    f.event("shop"); f.edit(p => { p.rec.mp = 0xffffffff; });
    expect(f.claim("first:shop")).toMatchObject({ error: "reward-wallet-overflow" });
    expect(f.p().rewards.missions.find((m: any) => m.id === "first:shop").claimed).toBe(false);
  });
  it("real mpReward hook ignores short games, pair-capped games and duels after the fortieth", async () => {
    const f = await setup();
    f.h.game.withCtx(f.session, () => {
      const st = f.h.game.loadState(), p = PP.profile(st, 0)!;
      PP.mpReward(f.h.game, p, "win", 1, { opp: "bob", secs: 2 });
      expect(p.rewards?.totals.play ?? 0).toBe(0);
      for (let i = 0; i < 6; i++) PP.mpReward(f.h.game, p, "win", 4, { opp: "bob", secs: 150 });
      expect(p.rewards.totals.play).toBe(5); expect(p.rewards.totals.pvp).toBe(5);
      for (let i = 0; i < 40; i++) PP.mpReward(f.h.game, p, "win", 4);
      expect(p.rewards.totals.play).toBe(40); expect(p.rewards.totals.days).toBe(1);
      f.h.game.saveState(st);
    });
  });
  it("instant NPC surrender and free mode grant neither mission progress nor login/claim MP", async () => {
    const f = await setup();
    f.h.game.withCtx(f.session, () => {
      const st = f.h.game.loadState(), p = PP.profile(st, 0)!;
      PP.npcDuelResult(f.h.game, p, 1, "lose", 1, 0, null, "me");
      expect(p.rewards?.totals.play ?? 0).toBe(0); f.h.game.saveState(st);
    });
    f.session.ext.free = true; const before = f.p().rec.mp;
    f.event("shop"); f.h.game.withCtx(f.session, () => rewardLogin(f.h.game, f.p()));
    expect(f.claim("first:shop")).toMatchObject({ error: "free-mode" });
    expect(f.view()).toMatchObject({ error: "free-mode" }); expect(f.p().rec.mp).toBe(before);
  });
  it("extra-deck objective reads the actual submitted duel deck; losses and draws still count play", () => {
    const p: any = { decks: { last_duel: { extra: [PP.structureDeckCards(7001)[0]] } } };
    rewardDuel(null, p, "draw", 50, false, true);
    expect(p.rewards.totals).toMatchObject({ play: 1, extra: 1, npc: 1 });
    expect(p.rewards.totals.win).toBeUndefined();
    rewardDuel(null, p, "win", 0, true, true); expect(p.rewards.totals.play).toBe(1);
  });
  it("pack progress uses the existing successful-purchase counter; zero packs do nothing", async () => {
    const f = await setup();
    f.h.game.withCtx(f.session, () => { const st = f.h.game.loadState(), p = PP.profile(st, 0)!;
      PP.mpSpent(f.h.game, p, 1000, 5); PP.mpSpent(f.h.game, p, 100, 0); f.h.game.saveState(st);
    });
    expect(f.p().rewards.totals.pack).toBe(5);
  });
  it("deck save requires ownership, sufficient main cards, world mode and unchanged character", async () => {
    const f = await setup(), cards = legalDeck(7001).main;
    f.edit(p => { for (const c of cards) (p.trunk ??= {})[c] = 3; });
    rewardDeckSaved(f.h.game, "rewards-user", `${f.acct}/1`, cards, [], "world");
    rewardDeckSaved(f.h.game, "rewards-user", `${f.acct}/0`, cards, [], "free");
    rewardDeckSaved(f.h.game, "rewards-user", `${f.acct}/0`, cards.slice(0, 2), [], "world");
    expect(f.p().rewards.totals.deck ?? 0).toBe(0);
    rewardDeckSaved(f.h.game, "rewards-user", `${f.acct}/0`, cards, [], "world");
    expect(f.p().rewards.totals.deck).toBe(1);
  });
  it("account caps inspect archived characters when selecting another slot", async () => {
    const f = await setup();
    f.edit((p, st) => { st.profiles_borrados = [{ perfil: { rewards: p.rewards } }]; delete p.rewards; });
    const before = f.p().rec.mp; f.view();
    expect(f.p().rec.mp).toBe(before);
    expect(f.p().rewards.missions.filter((m: any) => m.kind === "daily" || m.kind === "weekly")).toHaveLength(0);
  });
  it("deleted characters keep issuance caps but cannot permanently fill the daily stockpile", async () => {
    const f = await setup();
    f.edit((p, st) => { st.profiles_borrados = [{ perfil: { rewards: structuredClone(p.rewards) } }]; delete p.rewards; });
    const nextDay = f.h.game.clock.time() + 86400;
    vi.spyOn(f.h.game.clock, "time").mockReturnValue(nextDay);
    expect(f.view().missions.filter((m: any) => m.kind === "daily")).toHaveLength(3);
  });
  it("first steps cannot pay twice after a character is deleted and remade", async () => {
    const f = await setup(); f.event("shop"); f.claim("first:shop");
    f.edit((p, st) => { st.profiles_borrados = [{ perfil: { rewards: structuredClone(p.rewards) } }]; delete p.rewards; });
    f.event("shop"); const before = f.p().rec.mp;
    expect(f.claim("first:shop")).toMatchObject({ error: "not-claimable" });
    expect(f.p().rec.mp).toBe(before);
  });
  it("disabled flag and nonprogression games have no rewards state or payouts", () => {
    const p: any = {}; REWARDS.enabled = false; rewardLogin(null, p); rewardEvent(null, p, "shop");
    expect(p.rewards).toBeUndefined();
    REWARDS.enabled = true; PP.setProgression(false); rewardLogin(null, p); expect(p.rewards).toBeUndefined();
  });
});
