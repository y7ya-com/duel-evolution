// Progress, wallet, receipts and audit share the caller's snapshot, projected through D1 state_extras.
import { check as checkDeck } from "../duel/deckCheck.ts";
import type { Game } from "./game.ts";
import * as PP from "./persist.ts";
import { isFree } from "./freemode.ts";
import { REWARDS } from "./rewards-config.ts";
import { newRewardState, progress, rollover, utcDay, type RewardEvent, type RewardState } from "./missions.ts";
export { REWARDS } from "./rewards-config.ts";
const allowed = (g: Game | null) => REWARDS.enabled && PP.progression() && !(g && isFree(g.ctx));
const time = (g: Game | null) => g?.clock.time() ?? Date.now() / 1000;
function peers(g: Game | null): RewardState[] {
  if (!g || g.ctx === null || g.ctx === g.NO_SESSION) return [];
  const st = g.loadState(), mine = String(PP.activeSlot(st));
  const live = Object.entries(st.profiles ?? {}).filter(([k]) => k !== mine).map(([, p]) => p as PP.P);
  const archived = (st.profiles_borrados ?? []).map((a: PP.P) => a?.perfil as PP.P);
  const states = (ps: PP.P[]) => ps.flatMap(p => p?.rewards?.version === 1 ? [p.rewards as RewardState] : []);
  // Unclaimable archived slots no longer occupy the stockpile, but retain issuance/login/one-off claim caps.
  return [...states(live), ...states(archived).map(r => ({ ...r,
    missions: r.missions.filter(m => m.kind !== "daily" && m.kind !== "weekly") }))];
}
function state(g: Game | null, p: PP.P): RewardState {
  const r: RewardState = p.rewards ??= newRewardState(time(g));
  const others = peers(g);
  rollover(r, time(g), others);
  // First steps are once per account; deleting/remaking a character cannot reset claimed grants.
  for (const m of r.missions) if (m.kind === "first" && others.some(q => q.missions.some(x => x.id === m.id && x.claimed))) m.claimed = true;
  return r;
}
function grant(g: Game | null, p: PP.P, r: RewardState, id: string, mp: number, requestId?: string) {
  const w = PP.mpBalances(p);
  if (!Number.isSafeInteger(mp) || mp <= 0 || w.total + mp > 0xffffffff) throw new Error("reward-wallet-overflow");
  (p.rec ??= {}).mp = w.total + mp;
  const row = { at: time(g), id, mp, earned: true as const, balance: p.rec.mp, ...(requestId ? { requestId } : {}) };
  r.audit.push(row);
  PP.recordRewardIncome(g, p, mp);
  g?.log(`[economia] ${(g.ctxAcct() ?? "?").slice(0, 8)} ${p.name ?? "?"}: reward ${id} +${mp} earned MP; balance ${row.balance}; request ${requestId ?? "auto"}`);
}
/** UTC day; shared across live and archived characters. Existing starter MP is left bound. */
export function rewardLogin(g: Game | null, p: PP.P): boolean {
  if (!allowed(g)) return false;
  const before = JSON.stringify(p.rewards);
  const r = state(g, p), now = time(g), day = utcDay(now), others = peers(g);
  if ([r, ...others].some(q => q.login.day === day)) return before !== JSON.stringify(r);
  const total = [r, ...others].reduce((n, q) => n + q.login.count, 0) + 1;
  const cycleDay = (total - 1) % REWARDS.login.cycle + 1;
  const mp = REWARDS.login.milestoneDays.includes(cycleDay) ? REWARDS.login.milestoneMP : REWARDS.login.mp;
  if (PP.mpBalances(p).total + mp > 0xffffffff) return before !== JSON.stringify(r);
  grant(g, p, r, `login:${day}`, mp);
  const previous = [r, ...others].find(q => q.login.day === utcDay(now - 86400));
  r.login = { day, count: r.login.count + 1, streak: previous ? previous.login.streak + 1 : 1 };
  return true;
}
/** Trusted server hook only. The caller persists the snapshot after progress. */
export function rewardEvent(g: Game | null, p: PP.P, event: RewardEvent, count = 1) {
  if (allowed(g)) progress(state(g, p), event, count);
}
/** Run after the MP guards. The 41st and later rewarded games do not progress missions. */
export function rewardDuel(g: Game | null, p: PP.P, result: string, rewardedMP: number, pvp: boolean, fullRate: boolean) {
  if (!allowed(g) || rewardedMP <= 0 || !fullRate) return;
  const r = state(g, p), day = utcDay(time(g));
  progress(r, "play"); progress(r, pvp ? "pvp" : "npc");
  if (result === "win") progress(r, "win");
  if (Array.isArray(p.decks?.last_duel?.extra) && p.decks.last_duel.extra.length > 0) progress(r, "extra");
  if (r.playedDay !== day) { progress(r, "days"); r.playedDay = day; }
}
const fail = (error: string, status = 409) => ({ error, status });
function active(g: Game, user: string) {
  if (!REWARDS.enabled || !PP.progression()) return fail("rewards-disabled", 503);
  const acct = g.store.accountOfUser(user), s = acct ? g.hub.sessions.get(acct) : undefined;
  if (!s) return fail("not-in-game");
  if (s.slot === null) return fail("no-character");
  if (g.restarting) return fail("server-restarting", 503);
  if (isFree(s)) return fail("free-mode");
  return s;
}
function view(g: Game, p: PP.P, r: RewardState) {
  const count = [r, ...peers(g)].reduce((n, q) => n + q.login.count, 0);
  return { wallet: PP.mpBalances(p), missions: r.missions.map(m => ({ ...m, claimable: !m.claimed && m.progress >= m.target })),
    login: { ...r.login, cycleDay: count ? (count - 1) % REWARDS.login.cycle + 1 : 0,
      calendar: Array.from({ length: REWARDS.login.cycle }, (_, i) => ({ day: i + 1,
        mp: REWARDS.login.milestoneDays.includes(i + 1) ? REWARDS.login.milestoneMP : REWARDS.login.mp })) },
    nextRequestId: r.token, day: r.day, week: r.week, stockpileCap: REWARDS.daily.cap };
}
export function rewardsView(g: Game, user: string): any {
  const s = active(g, user); if ("error" in s) return s;
  return g.withCtx(s, () => {
    const st = g.loadState(), p = PP.profile(st, s.slot!, false); if (!p) return fail("no-character");
    rewardLogin(g, p); const r = state(g, p); g.saveState(st); return view(g, p, r);
  });
}
export function rewardsClaim(g: Game, user: string, body: unknown): any {
  const s = active(g, user); if ("error" in s) return s;
  const b = body as { id?: unknown; requestId?: unknown } | null;
  if (!b || typeof b.id !== "string" || b.id.length > 100 || typeof b.requestId !== "string" || !b.requestId.length || b.requestId.length > 80)
    return fail("invalid-reward", 400);
  const end = g.duel?.duelState(s)?.df?.sess.end;
  if (g.tp?.inTrade(s) || (s.pid !== null && g.pvp?.byPid(s.pid)) || (end && !end.over)) return fail("busy");
  return g.withCtx(s, () => {
    const st = g.loadState(), p = PP.profile(st, s.slot!, false); if (!p) return fail("no-character");
    const r = state(g, p), old = Object.hasOwn(r.receipts, b.requestId as string) ? r.receipts[b.requestId as string] : undefined;
    if (old) return old.id !== b.id ? fail("request-id-conflict") : { ...view(g, p, r), grant: old, replayed: true };
    if (b.requestId !== r.token) return fail("stale-request");
    const m = r.missions.find(m => m.id === b.id);
    if (!m || m.claimed || m.progress < m.target) return fail("not-claimable");
    if (PP.mpBalances(p).total + m.mp > 0xffffffff) return fail("reward-wallet-overflow");
    grant(g, p, r, m.id, m.mp, b.requestId as string); m.claimed = true;
    const receipt = { id: m.id, mp: m.mp }; r.receipts[b.requestId as string] = receipt; r.token = crypto.randomUUID();
    g.saveState(st);
    return { ...view(g, p, r), grant: receipt, replayed: false };
  });
}
/** Guard the character identity across the async D1 save. Free decks and unowned decks cannot progress. */
export function rewardDeckSaved(g: Game, user: string, charKey: string, main: number[], extra: number[], mode: unknown) {
  const s = active(g, user); if ("error" in s || `${s.acct}/${s.slot}` !== charKey || mode === "free") return;
  g.withCtx(s, () => {
    const st = g.loadState(), p = PP.profile(st, s.slot!, false);
    if (!p || checkDeck(main, extra, p.trunk ?? {}).length) return;
    rewardEvent(g, p, "deck"); g.saveState(st);
  });
}

/** Successful shop catalog read; native shop owners can call this same hook with the authenticated user. */
export function rewardShopVisited(g: Game, user: string) {
  const s = active(g, user); if ("error" in s) return;
  g.withCtx(s, () => {
    const st = g.loadState(), p = PP.profile(st, s.slot!, false);
    if (p) { rewardEvent(g, p, "shop"); g.saveState(st); }
  });
}
