// The Main Menu's Duel Log (the 2008 client's CWindowModelDuellogTop / List / Search): the player's duel history.
// The original kept it as files: the client wrote each duel to duellogs\<id>.log plus a line in duellogs\list.txt
// ("%s %s.log %d %d %s %d %s %d ...": date, file, players, result, ...) and searched that list locally
// (YG_MSG_DUELLOG_SERCHINFO only feeds the in-duel record). Here the server keeps the list on the character's
// profile (p.duellog, newest first, capped) and GET /api/de/duellog pages and searches it.
import type { Game } from "./game.ts";
import * as PP from "./persist.ts";
import { isFree } from "./freemode.ts";

type P = PP.P;
export const DUELLOG_MAX = 200;
export const PER_PAGE_DEFAULT = 10, PER_PAGE_MAX = 50;
export type DuelResult = "win" | "lose" | "draw";

export interface DuellogEntry {
  t: number;          // unix seconds, the end of the game
  opp: string;        // the opponent's duelist name then
  opp_pid: number;
  result: DuelResult;
  turns: number;
  ranked: boolean;
  origin: string;     // how it was paired (ranking.ts MatchOrigin)
  match: boolean;     // a game of a best-of-3 match
}

const clean = (x: unknown): DuellogEntry | null => {
  if (!x || typeof x !== "object") return null;
  const e = x as Record<string, unknown>;
  const result = e.result === "win" || e.result === "lose" || e.result === "draw" ? e.result : null;
  if (!result) return null;
  return {
    t: Math.max(0, Math.floor(Number(e.t) || 0)), opp: String(e.opp ?? "").slice(0, 32), opp_pid: Math.floor(Number(e.opp_pid) || 0),
    result, turns: Math.max(0, Math.floor(Number(e.turns) || 0)), ranked: !!e.ranked, origin: String(e.origin ?? ""), match: !!e.match,
  };
};

/** Adds a finished game to the profile's history (newest first, at most DUELLOG_MAX). */
export function duellogPush(p: P, e: DuellogEntry): void {
  const list = Array.isArray(p.duellog) ? (p.duellog as unknown[]) : [];
  const c = clean(e);
  if (!c) return;
  p.duellog = [c, ...list].slice(0, DUELLOG_MAX);
}

export function duellogEntries(p: P | null | undefined): DuellogEntry[] {
  const list = Array.isArray(p?.duellog) ? (p!.duellog as unknown[]) : [];
  return list.map(clean).filter((e): e is DuellogEntry => e !== null);
}

export interface DuellogQuery { opp?: string; result?: string; from?: number; to?: number; page?: number; per?: number }

/** Search (opponent name substring, result, date range [from, to] in unix seconds) + page. Stats are over the whole log. */
export function duellogQuery(all: DuellogEntry[], q: DuellogQuery = {}) {
  const stats = { total: all.length, wins: 0, losses: 0, draws: 0 };
  for (const e of all) e.result === "win" ? stats.wins++ : e.result === "lose" ? stats.losses++ : stats.draws++;
  const opp = (q.opp ?? "").trim().toLowerCase();
  const result = q.result === "win" || q.result === "lose" || q.result === "draw" ? q.result : null;
  const from = Number.isFinite(q.from) ? q.from! : null, to = Number.isFinite(q.to) ? q.to! : null;
  const hits = all.filter((e) => (!opp || e.opp.toLowerCase().includes(opp)) && (!result || e.result === result)
    && (from === null || e.t >= from) && (to === null || e.t <= to));
  const per = Math.min(PER_PAGE_MAX, Math.max(1, Math.floor(q.per ?? PER_PAGE_DEFAULT) || PER_PAGE_DEFAULT));
  const pages = Math.max(1, Math.ceil(hits.length / per));
  const page = Math.min(pages, Math.max(1, Math.floor(q.page ?? 1) || 1));
  return { stats, matched: hits.length, page, pages, per, rows: hits.slice((page - 1) * per, page * per) };
}

/** -> DuellogQuery from GET /api/de/duellog?opp=&result=&from=YYYY-MM-DD&to=YYYY-MM-DD&page=&per= */
export function duellogParams(sp: URLSearchParams): DuellogQuery {
  const day = (v: string | null, end: boolean) => {
    if (!v) return undefined;
    if (/^\d+$/.test(v)) return Number(v);
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v);
    if (!m) return undefined;
    const t = Date.UTC(+m[1], +m[2] - 1, +m[3]) / 1000;
    return end ? t + 86399 : t;
  };
  const n = (v: string | null) => (v && /^\d+$/.test(v) ? Number(v) : undefined);
  return { opp: (sp.get("opp") ?? "").slice(0, 32), result: sp.get("result") ?? "", from: day(sp.get("from"), false), to: day(sp.get("to"), true),
    page: n(sp.get("page")), per: n(sp.get("per")) };
}

/** GET /api/de/duellog for the signed-in account's active character: [http status, body]. */
export function duellogApi(g: Game, userId: string, sp: URLSearchParams): [number, Record<string, unknown>] {
  const acct = g.store.accountOfUser(userId);
  const s = acct ? g.hub.sessions.get(acct) : undefined;
  if (!s) return [409, { error: "not-in-game" }];
  if (s.slot === null) return [409, { error: "no-character" }];
  const p = g.withCtx(s, () => PP.profile(g.loadState(), s.slot!, false));
  if (!p) return [409, { error: "no-character" }];
  return [200, { you: s.name ?? "", free: isFree(s), ...duellogQuery(duellogEntries(p), duellogParams(sp)) }];
}
