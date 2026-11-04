// GET /api/de/rank: other players' ranked standing, for the HTML UI's level labels ("LV 23 · Ra Yellow II (1612)").
// Read only and public: the school, its division and label, the rounded rating and whether the player is placed (an
// unplaced one: its placement games so far). Nothing else of the record (RD, volatility, W/L, peak, pairs) and none of
// the uniform rules (top 1% / graduated: ranking.ts may rename those).
//   ?pid=1005&pid=1010   up to RANK_MAX_IDS characters by pid (hub.pidFor: PID_BASE + 4 * account index + slot), online
//                        or not (the friend list shows offline friends)
//   ?name=Duelist%20B    a player online now, by the name the card shows (the player card has a name, not a pid)
//   ?self=1              the asking account's own characters by slot (Select Player)
// Auth: the Worker's session check (x-de-user); the account must be in the game (a hub session). Rate: a token bucket
// per account (RANK_BURST, refilled RANK_PER_MIN a minute) -> 429. The answers are memoised per state object (every
// save makes a new one, so nothing stale is served) and the Worker lets the browser keep one for RANK_MAX_AGE s.
import type { Game } from "./game.ts";
import { PID_BASE } from "./hub.ts";
import { PLACEMENT_GAMES, rankInfo, rankOf, type RankSchool } from "./ranking.ts";

export const RANK_MAX_IDS = 24, RANK_BURST = 30, RANK_PER_MIN = 120, RANK_MAX_AGE = 30;
export type PublicRank = { pid: number; name: string; known: true; placed: boolean; school: RankSchool; division: number;
  label: string; rating: number | null; placement: { played: number; of: number } | null };
export type RankAnswer = PublicRank | { pid: number | null; name?: string; known: false };
type Fail = { error: string; status: number; retryAfter?: number };
const fail = (error: string, status = 409, extra: Partial<Fail> = {}): Fail => ({ error, status, ...extra });

/** The public view of one character's record (ranking.ts rankInfo, cut down). Unplaced: no rating (it moves too much
 *  in the first games to mean anything) and no school beyond "beginner". */
export function publicRank(pid: number, name: string, p: { rank?: unknown }): PublicRank {
  const r = rankInfo(rankOf(p));
  return { pid, name, known: true, placed: r.placed, school: r.school, division: r.division, label: r.placed ? r.label : "Unranked",
    rating: r.placed ? r.rating : null, placement: r.placed ? null : { played: Math.min(r.games, PLACEMENT_GAMES), of: PLACEMENT_GAMES } };
}

// pid -> the character's profile, read from the live state (never a copy: peek). Built once per state object.
type Raw = Readonly<Record<string, any>>;
const index = new WeakMap<object, Map<number, Raw>>();
function accountsByIdx(g: Game): Map<number, Raw> {
  const raw = g.store.peek();
  let m = index.get(raw);
  if (m) return m;
  m = new Map();
  for (const a of Object.values(raw.accounts ?? {}) as Raw[]) if (a && Number.isSafeInteger(Number(a.idx ?? 0))) m.set(Number(a.idx ?? 0), a);
  // the owner's account (index 0): its profiles at the root unless it was given an accounts row (ranking.ts ladder())
  const owner = (raw.owner_acct as string | undefined) ?? g.cfg.ownerAcct;
  m.set(0, (owner && raw.accounts?.[owner]) || raw);
  index.set(raw, m);
  return m;
}
function profileOfPid(g: Game, pid: number): Raw | null {
  if (!Number.isSafeInteger(pid) || pid < PID_BASE) return null;   // NPCs (1..98, FAKE_BASE + n) have no record
  const a = accountsByIdx(g).get((pid - PID_BASE) >> 2), p = a?.profiles?.[String((pid - PID_BASE) & 3)];
  return p && typeof p === "object" ? p : null;
}

const buckets = new WeakMap<Game, Map<string, { tokens: number; at: number }>>();
/** One request's cost from the account's bucket: null if allowed, else the seconds until it would be. */
function spend(g: Game, acct: string): number | null {
  let m = buckets.get(g);
  if (!m) buckets.set(g, m = new Map());
  const now = g.clock.time(), b = m.get(acct) ?? { tokens: RANK_BURST, at: now };
  b.tokens = Math.min(RANK_BURST, b.tokens + ((now - b.at) * RANK_PER_MIN) / 60);
  b.at = now;
  m.set(acct, b);
  if (m.size > 4096) for (const k of m.keys()) { if (k !== acct) m.delete(k); if (m.size <= 2048) break; }
  if (b.tokens < 1) return Math.max(1, Math.ceil(((1 - b.tokens) * 60) / RANK_PER_MIN));
  b.tokens -= 1;
  return null;
}

/** The handler: `user` the session's DE user id, `q` the query. -> { players: RankAnswer[] } or a Fail. */
export function rankLookup(g: Game, user: string | null, q: URLSearchParams): { players: RankAnswer[] } | Fail {
  if (!user) return fail("signed out", 401);
  const acct = g.store.accountOfUser(user), s = acct ? g.hub.sessions.get(acct) : undefined;
  if (!s) return fail("not-in-game");
  const pids = q.getAll("pid").flatMap((v) => v.split(",")).filter(Boolean), names = q.getAll("name").filter(Boolean);
  const self = q.get("self") === "1";
  if (!pids.length && !names.length && !self) return fail("bad-request", 400);
  if (pids.length + names.length > RANK_MAX_IDS || names.some((n) => n.length > 32) || pids.some((v) => !/^\d{1,10}$/.test(v)))
    return fail("bad-request", 400);
  const wait = spend(g, s.acct);
  if (wait !== null) return fail("rate-limited", 429, { retryAfter: wait });
  const out: RankAnswer[] = [];
  const nameOf = (p: Raw, pid: number) => String(g.hub.byPid(pid)?.name || p.name || "");
  for (const v of new Set(pids)) {
    const pid = Number(v), p = profileOfPid(g, pid);
    out.push(p ? publicRank(pid, nameOf(p, pid), p) : { pid, known: false });
  }
  for (const name of new Set(names)) {
    // online players only (as Lobby.duelInvite finds a card's player); a name is not unique among offline characters
    const o = [...g.hub.sessions.values()].find((x) => x.pid !== null && x.slot !== null && x.name === name && x.lobby && !x.lobby.closed);
    const p = o ? profileOfPid(g, o.pid!) : null;
    out.push(o && p ? publicRank(o.pid!, name, p) : { pid: null, name, known: false });
  }
  if (self) for (let slot = 0; slot < 4; slot++) {
    const pid = g.hub.pidFor(s, slot), p = profileOfPid(g, pid);
    if (p) out.push(publicRank(pid, nameOf(p, pid), p));
  }
  return { players: out };
}
