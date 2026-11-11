// Ranked PvP rating and the Duel Academy rank uniforms (owner, 2026-11). Follows duelforge
// (apps/world/src/ranking.ts + glicko2.ts, packages/world-protocol tierOf / RANK_LADDER / unlockedUniforms):
// Glicko-2, one rating period per rated result, the same 1500/350/0.06 start, floor 100, 5 placement games and
// the same tier thresholds. Differences, each for a reason given where it is made:
//   - ranked = Autoduel only (isRankedOrigin); one rated result per finished ranked MATCH (a single duel, or a Bo3 as
//     a whole), never per Bo3 game;
//   - the displayed school is the stored one, with a 50-point demotion buffer (the badge doesn't flicker on a
//     threshold); promotion is immediate. Rating, school and division go up and down with play;
//   - the rank uniforms are kept for good (owner, 2026-11-04): they follow `best`, the best school ever reached
//     while placed, never the current one, so a demotion takes nothing back and re-dresses nobody;
//   - unplaced players (and everyone) may wear Slifer Red: it is the client's default Academy outfit
//     (avatarValidate's reset, the starter dress 0x80, persist.avatarParts), so it can never be gated;
//   - a graduated student (character LV GRADUATION_LEVEL and GRAD_OPPONENTS distinct real opponents beaten: see
//     "graduation"; kept once reached) may wear any owned outfit in the Academy (rankRowAllowed). A placeholder until
//     a story lets players finish the GX story and graduate.
// Ranked = Autoduel only (owner, 2026-11-04: isRankedOrigin): rooms, direct invites and tournament games are unranked,
// since a player who can't choose the opponent can't easily trade wins with one. Rated duels count in both worlds and
// the rank is the same in both: nothing here (or in pvpMatch.rate) reads the world. The record lives on the character, p.rank (D1 state_extras, like p.econ: no migration); one per slot.
// Pure: no store, no clock.
import { createHash } from "node:crypto";
import { AVATAR_ROWS } from "./cosmetics-catalog.ts";

// ─────────────────────────────── Glicko-2 (duelforge glicko2.ts, verbatim math) ───────────────────────────────
export interface Glicko { rating: number; rd: number; vol: number }
export interface GlickoGame { rating: number; rd: number; score: number }
const SCALE = 173.7178, TAU = 0.5, EPS = 1e-6;
export const RD_MIN = 30, RD_MAX = 350;
const gfn = (phi: number) => 1 / Math.sqrt(1 + (3 * phi * phi) / (Math.PI * Math.PI));
/** One Glicko-2 rating period (Glickman 2013). An empty period only grows RD. */
export function glicko2Update(p: Glicko, games: GlickoGame[]): Glicko {
  const mu = (p.rating - 1500) / SCALE, phi = p.rd / SCALE;
  if (!games.length) return { rating: p.rating, rd: Math.min(RD_MAX, Math.sqrt(phi * phi + p.vol * p.vol) * SCALE), vol: p.vol };
  let vInv = 0, dSum = 0;
  for (const o of games) {
    const muj = (o.rating - 1500) / SCALE, gj = gfn(o.rd / SCALE), ej = 1 / (1 + Math.exp(-gj * (mu - muj)));
    vInv += gj * gj * ej * (1 - ej); dSum += gj * (o.score - ej);
  }
  const v = 1 / vInv, delta = v * dSum, a = Math.log(p.vol * p.vol);
  const f = (x: number) => { const ex = Math.exp(x); return (ex * (delta * delta - phi * phi - v - ex)) / (2 * (phi * phi + v + ex) ** 2) - (x - a) / (TAU * TAU); };
  let lo = a, hi: number;
  if (delta * delta > phi * phi + v) hi = Math.log(delta * delta - phi * phi - v);
  else { let k = 1; while (f(a - k * TAU) < 0) k++; hi = a - k * TAU; }
  let fLo = f(lo), fHi = f(hi), guard = 0;
  while (Math.abs(hi - lo) > EPS && guard++ < 100) {
    const mid = lo + ((lo - hi) * fLo) / (fHi - fLo), fMid = f(mid);
    if (fMid * fHi <= 0) { lo = hi; fLo = fHi; } else fLo /= 2;
    hi = mid; fHi = fMid;
  }
  const vol = Math.exp(lo / 2), phiStar = Math.sqrt(phi * phi + vol * vol);
  const newPhi = 1 / Math.sqrt(1 / (phiStar * phiStar) + 1 / v);
  return { rating: SCALE * (mu + newPhi * newPhi * dSum) + 1500, rd: Math.min(RD_MAX, Math.max(RD_MIN, SCALE * newPhi)), vol };
}

// ─────────────────────────────── tiers (duelforge world-protocol) ───────────────────────────────
export type RankSchool = "beginner" | "slifer" | "ra" | "obelisk" | "master";
export type UniformSchool = "slifer" | "ra" | "obelisk";
export const RANK_SCHOOLS: readonly RankSchool[] = ["beginner", "slifer", "ra", "obelisk", "master"];
export const PLACEMENT_GAMES = 5;
export const RATING_START = 1500, RATING_FLOOR = 100;
/** A placed player keeps a school (as displayed) until the rating is this far below the school's threshold. The
 *  uniforms don't depend on it: they follow Rank.best. */
export const DEMOTION_BUFFER = 50;
export type LadderStep = { min: number; school: RankSchool; division: number; label: string };
export const RANK_LADDER: readonly LadderStep[] = [
  { min: -Infinity, school: "slifer", division: 1, label: "Slifer Red I" },
  { min: 1400, school: "slifer", division: 2, label: "Slifer Red II" },
  { min: 1550, school: "ra", division: 1, label: "Ra Yellow I" },
  { min: 1700, school: "ra", division: 2, label: "Ra Yellow II" },
  { min: 1850, school: "obelisk", division: 1, label: "Obelisk Blue I" },
  { min: 2000, school: "obelisk", division: 2, label: "Obelisk Blue II" },
  { min: 2150, school: "master", division: 0, label: "Master" },
];
const ord = (s: RankSchool) => RANK_SCHOOLS.indexOf(s);
const schoolMin = (s: RankSchool) => RANK_LADDER.find((t) => t.school === s)?.min ?? -Infinity;
export function tierOf(rating: number, placed: boolean): LadderStep {
  if (!placed) return { min: -Infinity, school: "beginner", division: 0, label: "Beginner" };
  let step = RANK_LADDER[0];
  for (const s of RANK_LADDER) if (rating >= s.min) step = s;
  return step;
}
/** The school after a rated result: the tier's school, or a higher one held before while the rating stays within
 *  DEMOTION_BUFFER of its threshold. */
export function schoolAfter(prev: RankSchool, rating: number, placed: boolean): RankSchool {
  if (!placed) return "beginner";
  let best: RankSchool = "slifer";
  for (const s of RANK_SCHOOLS.slice(1)) if (rating >= schoolMin(s) - (ord(s) <= ord(prev) ? DEMOTION_BUFFER : 0)) best = s;
  return best;
}
/** Cumulative, as duelforge's unlockedUniforms: a higher school also wears the lower ones (an Obelisk may still
 *  put on Slifer Red). Master has no uniform of its own here. Slifer is open to everyone, Beginner included.
 *  Called with Rank.best (the best school ever reached), so an unlock is for good. */
export function unlockedUniforms(school: RankSchool): UniformSchool[] {
  return (["slifer", "ra", "obelisk"] as const).filter((u) => u === "slifer" || ord(school) >= ord(u));
}
/** The rank uniforms, by native item text (yo2text_e): Academy: Red / Yellow / Blue (male 3320-3322, female
 *  3390-3392) and their "2" variants (3324-3326, both bodies). Academy: Tracksuit (3323) is not a school uniform. */
const UNIFORM_TEXT: Readonly<Record<number, UniformSchool>> = {
  3320: "slifer", 3390: "slifer", 3324: "slifer", 3321: "ra", 3391: "ra", 3325: "ra", 3322: "obelisk", 3392: "obelisk", 3326: "obelisk",
};
export const RANK_UNIFORM_BY_BIT: ReadonlyMap<number, UniformSchool> = new Map(Object.entries(AVATAR_ROWS)
  .filter(([, r]) => r[3] === 6 && [1, 2].includes(r[2]) && UNIFORM_TEXT[r[4]]).map(([bit, r]) => [Number(bit), UNIFORM_TEXT[r[4]]]));
/** `best`: the best school ever reached (Rank.best). */
export const uniformAllowed = (bit: number, best: RankSchool): boolean => {
  const u = RANK_UNIFORM_BY_BIT.get(bit);
  return !u || unlockedUniforms(best).includes(u);
};
/** PBIN bits with no item (avatar_pbin kind 0) that the server sets in 0x3114 for the recompiled client
 *  (client/recomp/ovr/worldparts.c): 1022 = the uniform bits are rank-authored (the editor drops its level gate),
 *  1023 = a graduated student (the editor lists every owned outfit in the Academy). Never stored in p.pbin. */
export const PBIN_RANKED = 1022, PBIN_GRADUATED = 1023;

// ─────────────────────────────── graduation ───────────────────────────────
// Owner, 2026-11-04: "it needs to be wins but not abusable win trading with alts etc." A graduate needs BOTH:
//   - character LV GRADUATION_LEVEL, from PvP score (persist.ts pvpXp, itself guarded: no XP for a short duel, past
//     the day's pair cap, or against the same account; persist.ts xpGuard);
//   - qualifying wins (gradQualifies) against GRAD_OPPONENTS distinct opponents: a rated match win, so a ranked
//     Autoduel one (isRankedOrigin; never a room, invite or tournament game), within rateMatch's guards (not the same
//     account, not past RATED_PAIR_DAY_MAX today), that isn't short, against an opponent placed
//     before the match (GRAD_OPP_MIN_GAMES) whose DE account is GRAD_OPP_MIN_AGE_MS old (better-auth user.createdAt,
//     from the Worker: auth/binding.ts) and who shares none of the winner's IP-bucket tags (hub.ts Session.ipbs,
//     keyed hashes). Per opponent at most GRAD_WINS_PER_OPP qualifying wins count, ever, and a new opponent counts only
//     from a network no counted opponent was on (gradWin: a ring of alts behind one IP is one opponent).
// Graduation is for good (p.graduated = 1, set by gradUpdate the first time both hold): LV can fall back with lost
// score. Nothing else graduates: an admin-set LV does not.
/** The character LV of a graduated student (owner, 2026-11-04: a placeholder until a story lets players finish the
 *  GX story). LV 20 is where the 2008 editor gave the last school's uniform (Ra Yellow at LV 10, Obelisk Blue at 20):
 *  the end of the school ladder, so the step after it. By the XP curve (persist.ts XP_LEVEL_FLOORS, cap LV 30 at
 *  900,000) it is 40,000 score, about 1,000 PvP wins (~40 a win): a long-term goal, where LV 30 (~22,500 wins) would be
 *  out of reach and LV 10 (2,400, ~60 wins) a few weeks. Production on 2026-11-04: 152 characters, the highest LV 9,
 *  none at LV 10 or more, nobody graduated. */
export const GRADUATION_LEVEL = 20;
/** Distinct opponents beaten in qualifying wins. 25 real people: a ring of alts needs 25 placed, week-old accounts
 *  on 25 other networks, each played 5 rated games first. */
export const GRAD_OPPONENTS = 25;
/** Qualifying wins counted per opponent, ever (the record stops there). */
export const GRAD_WINS_PER_OPP = 3;
/** The opponent's DE account (better-auth user.createdAt) must be this old at the match: a fresh alt doesn't count. */
export const GRAD_OPP_MIN_AGE_MS = 7 * 86400e3;
/** The opponent must have this many rated results before the match (placed). */
export const GRAD_OPP_MIN_GAMES = PLACEMENT_GAMES;

/** The per-character record (D1 state_extras, like p.rank): `opp` = opponent key (gradKey) -> qualifying wins counted
 *  (1..GRAD_WINS_PER_OPP); `net` = the network keys (gradNetKey) of the counted opponents; `n` = distinct opponents.
 *  A new opponent counts only from a network no counted opponent was on (a ring of alts behind one IP is one
 *  opponent, wherever the winner plays from), and new opponents stop being added at GRAD_OPPONENTS (enough to
 *  graduate): at most 25 keys and 25 * SESSION_IPBS_MAX (hub.ts) network keys. */
export type Grad = { opp: Record<string, number>; net: string[]; n: number };
/** An opponent's key in p.grad: a truncated SHA-256 of the game account, so a character's record names no account. */
export const gradKey = (acct: string): string => createHash("sha256").update(`grad|${acct}`).digest("hex").slice(0, 12);
/** A network's key in p.grad: a truncated SHA-256 of the session's IP-bucket tag (itself a keyed hash, auth.ts
 *  ipBucketTag): no IP and no reusable tag is stored. 32 bits: 200 keys collide by chance once in ~200,000 records. */
export const gradNetKey = (tag: string): string => createHash("sha256").update(`grad-net|${tag}`).digest("hex").slice(0, 8);
export function gradOf(p: { grad?: unknown } | null | undefined): Grad {
  const g = (p?.grad && typeof p.grad === "object" ? p.grad : {}) as Partial<Grad>;
  const opp: Record<string, number> = {};
  for (const [k, v] of Object.entries(g.opp && typeof g.opp === "object" ? g.opp : {})) {
    const c = Math.min(GRAD_WINS_PER_OPP, nat(v));
    if (c > 0 && /^[0-9a-f]{12}$/.test(k)) opp[k] = c;
  }
  const net = Array.isArray(g.net) ? [...new Set(g.net.filter((x): x is string => typeof x === "string" && /^[0-9a-f]{8}$/.test(x)))] : [];
  return { opp, net, n: Object.keys(opp).length };
}
/** One side of a finished match, as graduation sees it (pvpMatch.rate). `ipbs`: its session's IP-bucket tags; `created`:
 *  its DE user's creation time (ms); `rank`: its record BEFORE the match. Unknown (null / empty) never qualifies. */
export type GradSide = { acct: string; ipbs: readonly string[]; created: number | null; rank: Rank };
/** Why the match's win is not a qualifying win for its winner, or null when it is. A qualifying win is a RATED win, so
 *  a ranked one: `origin` must be ranked (isRankedOrigin: Autoduel only, never a room, invite or tournament game) and
 *  `rated` (rateMatch's result) must rate the winner. */
export function gradQualifies(o: Outcome, rated: readonly [Rank | null, Rank | null], sides: readonly [GradSide, GradSide], now: number,
  origin: MatchOrigin): string | null {
  if (o.winner === null) return "no winner";
  const me = sides[o.winner], opp = sides[1 - o.winner];
  if (me.acct === opp.acct) return "same account";
  if (!isRankedOrigin(origin)) return `unranked (${origin})`;
  if (!rated[o.winner]) return "unrated";
  if (o.short) return "short";
  if (opp.rank.games < GRAD_OPP_MIN_GAMES) return "opponent unplaced";
  if (opp.created === null || !Number.isFinite(opp.created)) return "opponent age unknown";
  if (now - opp.created < GRAD_OPP_MIN_AGE_MS) return "opponent account too new";
  if (!me.ipbs.length || !opp.ipbs.length) return "network unknown";
  if (me.ipbs.some((x) => opp.ipbs.includes(x))) return "same network";
  return null;
}
/** Counts a qualifying win over `oppAcct` (on networks `oppIpbs`) into p.grad, then gradUpdate. An opponent already
 *  counted: up to GRAD_WINS_PER_OPP. A new one: only below GRAD_OPPONENTS and from a network no counted opponent was
 *  on. What happened: "counted", "opponent capped", "network counted", "enough opponents". */
export function gradWin(p: Record<string, any>, oppAcct: string, oppIpbs: readonly string[]): string {
  const g = gradOf(p), k = gradKey(oppAcct), have = g.opp[k] ?? 0, nets = oppIpbs.map(gradNetKey);
  let why = "counted";
  if (have >= GRAD_WINS_PER_OPP) why = "opponent capped";
  else if (!have && g.n >= GRAD_OPPONENTS) why = "enough opponents";
  else if (!have && nets.some((x) => g.net.includes(x))) why = "network counted";
  if (why === "counted") {
    g.opp[k] = have + 1;
    p.grad = { opp: g.opp, net: [...new Set([...g.net, ...nets])], n: Object.keys(g.opp).length };
  }
  gradUpdate(p);
  return why;
}
/** Marks the character graduated (for good) once LV and opponents both hold. Whether it is graduated now. */
export function gradUpdate(p: Record<string, any>): boolean {
  if (p.graduated === 1) return true;
  const lv = Number(p.rec?.lv ?? 0);
  if (Number.isFinite(lv) && lv >= GRADUATION_LEVEL && gradOf(p).n >= GRAD_OPPONENTS) p.graduated = 1;
  return p.graduated === 1;
}
/** Graduated: marked by gradUpdate (LV and GRAD_OPPONENTS qualifying opponents), never by LV alone. */
export function isGraduated(p: { graduated?: unknown; [k: string]: unknown } | null | undefined): boolean {
  return p?.graduated === 1;
}
/** The API's progress (rank.graduation): the character's LV and distinct qualifying opponents against what it needs. */
export function gradProgress(p: { grad?: unknown; rec?: { lv?: unknown } } | null | undefined) {
  const lv = Number(p?.rec?.lv ?? 1);
  return { level: Number.isFinite(lv) ? lv : 1, levelRequired: GRADUATION_LEVEL, opponents: gradOf(p).n, opponentsRequired: GRAD_OPPONENTS };
}

/** The rank rule for one avatar_pbin row (ownership is checked separately): a rank uniform only once its school was
 *  reached (`bestSchool`: Rank.best). There is no world rule any more (owner, 2026-11-05): a character has one look,
 *  worn in both worlds, so `world` is not read. */
export function rankRowAllowed(bit: number, world: number, view: { bestSchool: RankSchool; graduated: boolean }): boolean {
  const row = AVATAR_ROWS[String(bit)];
  if (!row) return false;
  void world;   // one look for both worlds (owner, 2026-11-05): no world rule; only the dorm uniforms' rank gate
  return uniformAllowed(bit, view.bestSchool);
}

// ─────────────────────────────── the record ───────────────────────────────
/** `school`: the displayed school (up and down with play); `best`: the best school ever reached while placed, which
 *  the uniforms follow; `peak`: the best rating (placement games included). */
export type Rank = { rating: number; rd: number; vol: number; games: number; wins: number; losses: number; draws: number;
  peak: number; school: RankSchool; best: RankSchool; last: number; pairs?: { day: string; n: Record<string, number> } };
const num = (v: unknown, d: number) => (typeof v === "number" && Number.isFinite(v) ? v : d);
const nat = (v: unknown) => (Number.isSafeInteger(v) && Number(v) >= 0 ? Number(v) : 0);
const higher = (a: RankSchool, b: RankSchool): RankSchool => (ord(a) >= ord(b) ? a : b);
const asSchool = (v: unknown): RankSchool => (RANK_SCHOOLS.includes(v as RankSchool) ? v as RankSchool : "beginner");
/** A character's record, normalised (a character that never played a rated match: 1500 / 350 / 0.06). */
export function rankOf(p: { rank?: unknown } | null | undefined): Rank {
  const r = (p?.rank && typeof p.rank === "object" ? p.rank : {}) as Partial<Rank>;
  const games = nat(r.games), rating = Math.max(RATING_FLOOR, num(r.rating, RATING_START));
  const placed = games >= PLACEMENT_GAMES;
  // the stored school, held only as far as the rating allows (schoolAfter never returns more than it can justify)
  const school = schoolAfter(asSchool(r.school), rating, placed);
  // best: never below a school held (a record from before `best` existed: its stored school)
  const best = higher(higher(asSchool(r.best), asSchool(r.school)), school);
  return { rating, rd: Math.min(RD_MAX, Math.max(RD_MIN, num(r.rd, RD_MAX))), vol: num(r.vol, 0.06), games, wins: nat(r.wins), losses: nat(r.losses),
    draws: nat(r.draws), peak: Math.max(rating, num(r.peak, rating)), school, best, last: nat(r.last), ...(r.pairs ? { pairs: r.pairs } : {}) };
}
/** One rated result for `me` against `opp` (their records BEFORE the result): score 1 win, 0 loss, 0.5 draw. */
export function rateOne(me: Rank, opp: Rank, score: 0 | 0.5 | 1, now: number): Rank {
  const n = glicko2Update(me, [{ rating: opp.rating, rd: opp.rd, score }]);
  const rating = Math.max(RATING_FLOOR, n.rating), games = me.games + 1, school = schoolAfter(me.school, rating, games >= PLACEMENT_GAMES);
  return { ...me, rating, rd: n.rd, vol: n.vol, games, wins: me.wins + (score === 1 ? 1 : 0), losses: me.losses + (score === 0 ? 1 : 0),
    draws: me.draws + (score === 0.5 ? 1 : 0), peak: Math.max(me.peak, rating), school, best: higher(me.best ?? "beginner", school), last: now };
}
const LABEL: Record<RankSchool, string> = { beginner: "Beginner", slifer: "Slifer Red", ra: "Ra Yellow", obelisk: "Obelisk Blue", master: "Master" };
/** What the API shows: rounded numbers, the school and its label (the tier's, or "<school> I" inside the buffer), and
 *  `bestSchool` with the `uniforms` it unlocked for good. */
export function rankInfo(r: Rank) {
  const placed = r.games >= PLACEMENT_GAMES, tier = tierOf(r.rating, placed), best = higher(r.best ?? "beginner", r.school);
  const kept = tier.school !== r.school;
  return { rating: Math.round(r.rating), rd: Math.round(r.rd), games: r.games, wins: r.wins, losses: r.losses, draws: r.draws,
    peak: Math.round(r.peak), placed, school: r.school, division: kept ? (r.school === "master" ? 0 : 1) : tier.division,
    label: kept ? (r.school === "master" ? "Master" : `${LABEL[r.school]} I`) : tier.label, placementLeft: Math.max(0, PLACEMENT_GAMES - r.games),
    bestSchool: best, uniforms: unlockedUniforms(best) };
}

// ─────────────────────────────── which matches are ranked ───────────────────────────────
/** How a PvP match was made. Always the server's own: the caller of Matches.reserve says it from the lobby's state
 *  (lobby.ts autoPair: "autoduel", challengeReply: "room" or, for a direct invite's private room, "invite";
 *  tournaments.ts pair: "tournament"), never from anything a client sends. */
export type MatchOrigin = "autoduel" | "room" | "invite" | "tournament";
export const MATCH_ORIGINS: readonly MatchOrigin[] = ["autoduel", "room", "invite", "tournament"];
/** Ranked = Autoduel only (owner, 2026-11-04). In a room, a direct invite or a tournament the players (or the bracket)
 *  pick the opponent, which makes win-trading with a friend or an alt easy; Autoduel pairs whoever is searching. An
 *  unranked match leaves p.rank, the rank uniforms and graduation's qualifying wins alone; MP, XP/LV (with their own
 *  guards), the record, stats and card offers are as for any PvP match. */
export const isRankedOrigin = (o: MatchOrigin): boolean => o === "autoduel";

// ─────────────────────────────── ranked matchmaking (lobby.ts autoTryMatch) ───────────────────────────────
// Autoduel pairs by rating, closest first, within a window that widens with the time waited so a small population
// still finds games: AUTO_WINDOW_START at first, AUTO_WINDOW_STEP wider every AUTO_WINDOW_STEP_S seconds, at most
// AUTO_WINDOW_MAX. A pair is allowed within the wider of the two players' windows (the one who waited longer decides).
export const AUTO_WINDOW_START = 150, AUTO_WINDOW_STEP = 50, AUTO_WINDOW_STEP_S = 10, AUTO_WINDOW_MAX = 400;
/** The rating window (±) after `waited` seconds of searching. */
export const autoWindow = (waited: number): number =>
  Math.min(AUTO_WINDOW_MAX, AUTO_WINDOW_START + AUTO_WINDOW_STEP * Math.floor(Math.max(0, Number.isFinite(waited) ? waited : 0) / AUTO_WINDOW_STEP_S));
/** The rating matchmaking uses: an unplaced player counts as RATING_START (its placement games move the rating too
 *  much to mean anything); its own RD still goes into the rating update (rateMatch). */
export const matchRating = (r: Rank): number => (r.games >= PLACEMENT_GAMES ? r.rating : RATING_START);
/** One player searching: `key` its game account, `rating` matchRating, `waited` seconds, `last` the account of its
 *  previous Autoduel opponent (or null). */
export type AutoSeeker = { key: string; rating: number; waited: number; last: string | null };
/** The opponent for `me` among `cands` (given oldest search first), or null: never the same account; within the wider
 *  of the two windows; closest rating first (ties: who searched longest). The two who just played each other (either
 *  one's previous Autoduel opponent is the other) only when nobody else fits. */
export function autoPick<T extends AutoSeeker>(me: AutoSeeker, cands: readonly T[]): T | null {
  const ok = cands.filter((o) => o.key !== me.key && Math.abs(o.rating - me.rating) <= Math.max(autoWindow(me.waited), autoWindow(o.waited)))
    .sort((a, b) => Math.abs(a.rating - me.rating) - Math.abs(b.rating - me.rating));   // stable: ties keep the oldest first
  return ok.find((o) => me.last !== o.key && o.last !== me.key) ?? ok[0] ?? null;
}

// ─────────────────────────────── rated-result rules ───────────────────────────────
/** Two sessions that share an IP-bucket tag (hub.ts Session.ipbs: keyed hashes) are one network: a household, a campus
 *  or an alt ring behind one connection. Their matches are never rated (pvpMatch.rate) and the ranked queue doesn't pair
 *  them (lobby.ts autoTryMatch); they can still duel in a room or by invite, unranked. An unknown network (no tag, the
 *  DEV parity bridge) is not "the same". */
export const sameNetwork = (a: readonly string[], b: readonly string[]): boolean => a.some((x) => b.includes(x));
/** Rated results a UTC day between the same two accounts (ECON.PAIR_DAY_MAX's value): more is win-trading. */
export const RATED_PAIR_DAY_MAX = 5;
const dayOf = (ms: number) => new Date(ms).toISOString().slice(0, 10);
const pairsToday = (r: Rank, day: string) => (r.pairs?.day === day ? r.pairs.n : {});
function bumpPair(r: Rank, opp: string, day: string): Rank {
  const n = { ...pairsToday(r, day) }; n[opp] = nat(n[opp]) + 1;
  return { ...r, pairs: { day, n } };
}
export type Outcome = { winner: 0 | 1 | null; forfeit: boolean; short: boolean };
/** The new records of both sides of a finished match (null = that side is unrated), from their records before it.
 *  - a draw is 0.5 each; a short draw (under 3 turns and 2 minutes) is unrated;
 *  - a forfeit (surrender, time-out, a disconnection past the grace period, leaving a Bo3) is a loss for the one
 *    who left. If the match was also short only the leaver is rated: leaving still costs rating, but nobody can
 *    farm it from a second account that quits at once;
 *  - after RATED_PAIR_DAY_MAX rated results today between the two accounts (or the same account on both sides),
 *    nothing is rated. */
export function rateMatch(a: Rank, b: Rank, accts: [string, string], o: Outcome, now: number): [Rank | null, Rank | null] {
  const day = dayOf(now);
  if (accts[0] === accts[1]) return [null, null];
  if (nat(pairsToday(a, day)[accts[1]]) >= RATED_PAIR_DAY_MAX || nat(pairsToday(b, day)[accts[0]]) >= RATED_PAIR_DAY_MAX) return [null, null];
  if (o.winner === null && o.short) return [null, null];
  const score = (k: 0 | 1): 0 | 0.5 | 1 => (o.winner === null ? 0.5 : o.winner === k ? 1 : 0);
  const rated = [true, true];
  if (o.winner !== null && o.forfeit && o.short) rated[o.winner] = false;
  const out: [Rank | null, Rank | null] = [null, null];
  if (rated[0]) out[0] = bumpPair(rateOne(a, b, score(0), now), accts[1], day);
  if (rated[1]) out[1] = bumpPair(rateOne(b, a, score(1), now), accts[0], day);
  return out;
}

// ─────────────────────────────── the view ───────────────────────────────
export type RankView = ReturnType<typeof rankInfo> & { graduated: boolean; graduationLevel: number; graduation: ReturnType<typeof gradProgress> };
/** A character's standing as every rule and the API see it (one character slot: p is its profile). */
export function rankView(p: { rank?: unknown; graduated?: unknown; grad?: unknown; rec?: { lv?: unknown } } | null | undefined): RankView {
  return { ...rankInfo(rankOf(p)), graduated: isGraduated(p), graduationLevel: GRADUATION_LEVEL, graduation: gradProgress(p) };
}
