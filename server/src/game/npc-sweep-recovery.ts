// One-time, audited recovery of duplicate November 2026 NPC sweep payouts.
// Replay purchases with legitimate funds first; cancel only copies that could not have been afforded.
import { cardRarity } from "./card-rarity.ts";
import type { State } from "./store.ts";

type P = Record<string, any>;
export const RECOVERY_KEY = "npc_sweep_recovery_202611";
export const EVENT_ID = "event:npc-sweep-2026-11";
type Profile = { path: string; acct: string; p: P };
export type RecoveryTrade = { id: number; at: number; a_acct: string; a_slot: number | null; a_gave: string;
  b_acct: string; b_slot: number | null; b_gave: string };
export type RecoveryPlan = { accounts: { acct: string; names: string[]; claims: number; excess: number }[];
  profiles: { path: string; acct: string; name: string; before: number; after: number; cards: Record<string, number>; boundCards: Record<string, number> }[];
  transfers: { trade: number; from: string; to: string; card: string }[] };
const check = (ok: boolean, reason: string): void => { if (!ok) throw new Error(`npc-recovery: ${reason}`); };
const safe = (n: number) => Number.isSafeInteger(n) && n >= 0;
const pointer = (s: string) => s.replaceAll("~", "~0").replaceAll("/", "~1");
function profiles(st: State): Profile[] {
  const out: Profile[] = [];
  const account = (a: P, acct: string, prefix: string) => {
    for (const [slot, p] of Object.entries(a.profiles ?? {})) if (p) out.push({ path: `${prefix}/profiles/${pointer(slot)}`, acct, p: p as P });
    for (const [i, archived] of Object.entries(a.profiles_borrados ?? {}) as [string, P][]) if (archived?.perfil)
      out.push({ path: `${prefix}/profiles_borrados/${i}/perfil`, acct, p: archived.perfil });
  };
  account(st, "_owner", "");
  for (const [acct, a] of Object.entries(st.accounts ?? {})) account(a as P, acct, `/accounts/${pointer(acct)}`);
  return out;
}
export function planNpcSweepRecovery(st: State, trades: RecoveryTrade[]): RecoveryPlan {
  const ps = profiles(st), byPath = new Map(ps.map(p => [p.path, p]));
  const plan: RecoveryPlan = { accounts: [], profiles: [], transfers: [] };
  const claims = new Map<string, { path: string; at: number; request: string; shards: number }[]>();
  for (const { path, p } of ps) {
    const evidence = (p.rewards?.audit ?? []).filter((a: P) => a.id === EVENT_ID);
    const receipts = Object.entries(p.rewards?.receipts ?? {}).filter(([, r]) => (r as P).id === EVENT_ID);
    // Never silently miss a paid claim if one of the durable evidence sources is incomplete.
    if (p.rewards?.receipts) check(receipts.length === evidence.length && receipts.every(([request]) =>
      evidence.some((a: P) => a.requestId === request)), `event evidence mismatch ${path}`);
  }
  for (const { path, acct, p } of ps) for (const a of p.rewards?.audit ?? []) if (a.id === EVENT_ID) {
    check(a.shards === 24000 && typeof a.requestId === "string", `invalid event grant ${path}`);
    const list = claims.get(acct) ?? []; claims.set(acct, list);
    check(!list.some(x => x.request === a.requestId), `duplicate audit request ${acct}`);
    list.push({ path, at: a.at, request: a.requestId, shards: a.shards });
  }
  const duplicates = new Set<string>();
  for (const [acct, list] of claims) {
    list.sort((a, b) => a.at - b.at);
    if (list.length < 2) continue;
    plan.accounts.push({ acct, names: [...new Set(list.map(x => byPath.get(x.path)!.p.name as string))],
      claims: list.length, excess: list.slice(1).reduce((n, x) => n + x.shards, 0) });
    for (const c of list.slice(1)) {
      const audit = byPath.get(c.path)!.p.shard_audit ?? [];
      check(audit.filter((a: P) => a.requestId === c.request && a.reward === EVENT_ID && a.shardDelta === c.shards).length === 1,
        `missing shard evidence ${c.path}`);
      duplicates.add(`${c.path}:${c.request}`);
    }
  }
  if (!duplicates.size) return plan;
  const clean = new Map<string, number>(), tainted = new Map<string, Record<string, number>>();
  const bonus = new Map<string, Record<string, number>>();
  const cards = (path: string) => { if (!tainted.has(path)) tainted.set(path, {}); return tainted.get(path)!; };
  type Entry = { at: number; path: string; audit?: P; trade?: RecoveryTrade };
  const timeline: Entry[] = [];
  for (const { path, p } of ps) {
    const audit: P[] = p.shard_audit ?? [];
    let balance = audit.length ? audit[0].balance - audit[0].shardDelta : p.shards ?? 0;
    check(safe(balance), `invalid opening balance ${path}`);
    clean.set(path, balance);
    const seen = new Set<string>();
    for (const a of audit) {
      check(Number.isFinite(a.at) && Number.isSafeInteger(a.shardDelta) && safe(a.balance), `invalid ledger ${path}`);
      check(!seen.has(a.requestId), `repeated ledger request ${path}`); seen.add(a.requestId);
      check(balance + a.shardDelta === a.balance, `ledger gap ${path}`);
      balance = a.balance; timeline.push({ at: a.at, path, audit: a });
    }
    check(balance === (p.shards ?? 0), `wallet does not match ledger ${path}`);
  }
  for (const trade of trades) timeline.push({ at: trade.at, path: "", trade });
  timeline.sort((a, b) => a.at - b.at);
  for (const e of timeline) {
    if (e.trade) {
      const t = e.trade, path = (acct: string, slot: number | null) => acct === "_owner" ? `/profiles/${slot}` : `/accounts/${pointer(acct)}/profiles/${slot}`;
      const a = path(t.a_acct, t.a_slot), b = path(t.b_acct, t.b_slot);
      const moved: { to: string; card: string }[] = [];
      for (const [from, to, gave] of [[a, b, t.a_gave], [b, a, t.b_gave]]) for (const pc of JSON.parse(gave)) {
        const card = String(pc);
        if ((cards(from)[card] ?? 0) <= 0) continue;
        check(byPath.has(to), `cannot resolve trade recipient ${to}`);
        cards(from)[card]--; moved.push({ to, card }); plan.transfers.push({ trade: t.id, from, to, card });
      }
      for (const { to, card } of moved) cards(to)[card] = (cards(to)[card] ?? 0) + 1;
      continue;
    }
    const a = e.audit!, path = e.path, inventory = cards(path);
    let balance = clean.get(path)!;
    if (a.operation === "reward" && duplicates.has(`${path}:${a.requestId}`)) continue;
    if (a.operation === "make") {
      const changes = Object.entries(a.changes) as [string, number][];
      check(changes.length === 1, `ambiguous craft ${path}`);
      const [card, count] = changes[0], unit = -a.shardDelta / count;
      check(safe(count) && count > 0 && safe(unit) && unit > 0, `invalid craft cost ${path}`);
      const keep = Math.min(count, Math.floor(balance / unit));
      balance -= keep * unit;
      inventory[card] = (inventory[card] ?? 0) + count - keep;
      if (!keep) {
        const free = bonus.get(path) ?? {}; bonus.set(path, free);
        for (const pack of a.secret?.freePacks ?? []) for (const pc of pack.cards) free[pc] = (free[pc] ?? 0) + 1;
      }
    } else if (a.operation === "dismantle" || a.operation === "dismantle-extras") {
      let removedIncome = 0;
      // Historical November rates, never today's configurable prices.
      const rates = { N: 1, R: 2, SR: 150, UR: 500 };
      for (const [card, count] of Object.entries(a.changes) as [string, number][]) {
        const n = Math.min(count, inventory[card] ?? 0);
        if (!n) continue;
        const rarity = cardRarity(Number(card)); check(rarity !== null, `unknown dismantled card ${card}`);
        inventory[card] -= n; removedIncome += n * rates[rarity!];
      }
      check(removedIncome <= a.shardDelta, `dismantle income mismatch ${path}`);
      balance += a.shardDelta - removedIncome;
    } else {
      check(a.shardDelta >= 0, `unrecognized spend ${a.operation}`);
      balance += a.shardDelta;
    }
    check(safe(balance), `invalid replay balance ${path}`); clean.set(path, balance);
  }
  for (const { path, acct, p } of ps) {
    const boundCards = bonus.get(path) ?? {};
    const counts = { ...cards(path) };
    for (const [card, n] of Object.entries(boundCards)) counts[card] = (counts[card] ?? 0) + n;
    const remove = Object.fromEntries(Object.entries(counts).filter(([, n]) => n > 0));
    const after = clean.get(path)!, before = p.shards ?? 0;
    if (!Object.keys(remove).length && before === after) continue;
    for (const [card, n] of Object.entries(remove)) {
      const bound = p.bound?.[card] ?? 0, owned = p.trunk?.[card] ?? 0, free = boundCards[card] ?? 0;
      check(owned >= n && bound >= free && owned - bound >= n - free, `missing ${card} copies at ${path}`);
    }
    plan.profiles.push({ path, acct, name: p.name, before, after, cards: remove, boundCards });
  }
  return plan;
}
/** Caller must back up first and persist atomically while gameplay is serialized. */
export function applyNpcSweepRecovery(st: State, plan: RecoveryPlan, at: number): void {
  check(!st[RECOVERY_KEY], "already applied");
  const byPath = new Map(profiles(st).map(p => [p.path, p.p]));
  // Validate the complete plan before changing any profile.
  for (const row of plan.profiles) {
    const p = byPath.get(row.path); check(!!p && (p.shards ?? 0) === row.before && safe(row.after), `stale wallet ${row.path}`);
    for (const [card, n] of Object.entries(row.cards)) check(safe(n) && n > 0 && (p!.trunk?.[card] ?? 0) >= n, `stale cards ${row.path}`);
  }
  for (const row of plan.profiles) {
    const p = byPath.get(row.path)!;
    for (const [card, n] of Object.entries(row.cards)) {
      p.trunk[card] -= n; if (!p.trunk[card]) delete p.trunk[card];
      if (p.bound?.[card]) p.bound[card] = Math.max(0, p.bound[card] - (row.boundCards[card] ?? 0));
      for (const key of ["bound", "crafted"]) if (p[key]?.[card] !== undefined) {
        p[key][card] = Math.min(p[key][card], p.trunk[card] ?? 0); if (!p[key][card]) delete p[key][card];
      }
    }
    p.shards = row.after;
    (p.shard_audit ??= []).push({ at, requestId: RECOVERY_KEY, operation: "npc-event-recovery", changes: row.cards,
      shardDelta: row.after - row.before, balance: row.after, reward: EVENT_ID });
    // Never replace existing receipts; they remain evidence of every payout.
    for (const m of p.rewards?.missions ?? []) if (m.id === EVENT_ID) m.claimed = true;
  }
  st[RECOVERY_KEY] = { at, plan };
}
