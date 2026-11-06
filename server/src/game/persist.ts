import { rewardDuel, rewardEvent } from "./rewards.ts";
// Per-character persistence (py research/persistencia/proposal.py): the player record, trunk, PBIN/NPCBIN, the prize
// queue, NPC chains, titles, duel results and XP, plus make_handlers (PH). Formats: that file's docstring.
// Env knobs are fixed at py's defaults as the server runs them (arranque sets YO2_TRUNK_START=all3).
import type { Conn } from "../net/conn.ts";
import { cstr, W } from "../net/proto.ts";
import GD from "../../gamedata/persist.json";
import YDC from "../../gamedata/ydc.json";
import SHOP from "../../gamedata/shop.json";
import LD from "../../gamedata/lobby.json";
import type { Game } from "./game.ts";
import type { State } from "./store.ts";
import { freeTrunk, isFree } from "./freemode.ts";
import { expandCosmeticBits } from "./cosmetics-catalog.ts";
import { gradUpdate, PBIN_GRADUATED, PBIN_RANKED, RANK_UNIFORM_BY_BIT, rankView, uniformAllowed, type RankSchool } from "./ranking.ts";

export type P = Record<string, any>; // a profile, py shape

/** (passcode, copies) pairs per trunk-table chunk on the card wire: 5 bytes each, a chunk within 1024 bytes */
const PAIRS_PER_CHUNK = 204;
export const PBIN_SIZE = 128;
export const NPCBIN_SIZE = 512;
export const NPCBIN_MAX = NPCBIN_SIZE / 4;
export const START_MP = 10000;
/** The one place for protocol fields of the 2008 duel-point economy, which Duel Evolution doesn't have (PvP is free,
 *  DESIGN.md "Deliberate changes from 2008"). The client still has the fields; these values never gate it. */
export const WIRE_UNUSED_DP = { balance: 9999, passes: 0, codeResult: 1 } as const;
const START_LV = 1;
const COUNTRY_BY_LANG = true;
const LANG_COUNTRY: Record<number, string> = { 0: "JP", 1: "US", 2: "DE", 3: "IT", 4: "FR", 5: "ES", 7: "KR" };
const TRUNK_START = "all3";
export const SCHEMA = 3;   // 3: card ids are passcodes (scripts/passcode_d1.py)

// ---- the player record (0x1a8 B): offset -> key, in the client's order
const REC: [number, string][] = [
  [0x0c, "player_id"], [0xa4, "lv"], [0xa8, "score"], [0xac, "mp"], [0xb0, "unk_b0"], [0xb2, "wins"], [0xb4, "unk_b4"],
  [0xb6, "unk_b6"], [0xb8, "unk_b8"], [0xba, "losses"], [0xbc, "match_wins"], [0xbe, "match_losses"], [0xc0, "single_wins"],
  [0xc2, "single_losses"], [0xc4, "duels"], [0xc6, "unk_c6"], [0xc8, "duels_won"], [0xca, "duels_lost"], [0xcc, "duels_drawn"],
  [0xce, "duels_void"], [0xd0, "turns"], [0xd4, "surrender_me"], [0xd6, "surrender_opp"], [0xd8, "lp_total"], [0xdc, "side_swaps"],
  [0xe0, "tribute1"], [0xe2, "tribute2"], [0xe4, "tribute3"], [0xe6, "fusions"], [0xe8, "ss_grave"], [0xea, "ss_total"],
  [0xec, "trap_me"], [0xf0, "trap_opp"], [0xf4, "spell_me"], [0xf8, "spell_opp"], [0xfc, "effect_me"], [0x100, "effect_opp"],
  [0x104, "comeback_wins"], [0x106, "comeback_losses"], [0x108, "unk_108"], [0x10c, "unk_10c"], [0x110, "unk_110"],
  [0x112, "title"], [0x116, "unk_116"], [0x11c, "recovery_flags"], [0x120, "champ_pending"], [0x124, "tp"], [0x128, "tp_rank"],
];
const R = (o: number) => REC.find((r) => r[0] === o)![1];
type Spec = [string, "u8" | "u16" | "u32" | "s32" | "s16" | "b16"][];
const u16s = (...os: number[]): Spec => os.map((o) => [R(o), "u16"]);
const u32s = (...os: number[]): Spec => os.map((o) => [R(o), "u32"]);

export const PSELECT_SPEC: Spec = [
  ["result", "s32"], ["player_id", "u32"], ["wire_unused_dp", "u32"], ["unk_116", "u16"], ["recovery_flags", "u32"], ["champ_pending", "u32"],
  ["tp", "u32"], ["lv", "u8"], ["score", "u32"], ["mp", "u32"],
  ...u16s(0xb0, 0xb2, 0xb4, 0xb6, 0xb8, 0xba, 0xbc, 0xbe, 0xc0, 0xc2, 0xc4, 0xc8, 0xca, 0xcc, 0xce),
  ["turns", "u32"], ["surrender_me", "u16"], ["surrender_opp", "u16"], ["lp_total", "u32"], ["side_swaps", "u32"],
  ...u16s(0xe0, 0xe2, 0xe4, 0xe6, 0xe8, 0xea), ...u32s(0xec, 0xf0, 0xf4, 0xf8, 0xfc, 0x100),
  ["comeback_wins", "u16"], ["comeback_losses", "u16"], ["unk_108", "u16"], ["unk_10c", "s32"], ["unk_110", "u16"], ["title", "u16"], ["unk_c6", "u16"],
];
export const PDU_SPEC: Spec = [
  ["lv", "u8"], ["score", "u32"], ["mp", "u32"], ...u16s(0xb0, 0xb2, 0xb4, 0xb6, 0xb8), ["wire_unused_dp", "u32"],
  ...u16s(0xba, 0xbc, 0xbe, 0xc0, 0xc2, 0xc4, 0xc8, 0xca, 0xcc, 0xce),
  ["turns", "u32"], ["surrender_me", "u16"], ["surrender_opp", "u16"], ["lp_total", "u32"], ["side_swaps", "u32"],
  ...u16s(0xe0, 0xe2, 0xe4, 0xe6, 0xe8, 0xea), ...u32s(0xec, 0xf0, 0xf4, 0xf8, 0xfc, 0x100),
  ["comeback_wins", "u16"], ["comeback_losses", "u16"], ["unk_108", "u16"], ["unk_10c", "s32"], ["unk_110", "u16"], ["title", "u16"],
  ["unk_116", "u16"], ["tp", "u32"], ["npc_index", "u32"], ["npc_b0", "u8"], ["npc_b1", "u8"], ["npc_b2", "u8"], ["npc_b3", "u8"], ["unk_c6", "u16"],
];
const PLAYERLIST_ENTRY_SPEC: Spec = [["slot", "u8"], ["name", "s16"], ["lv", "u8"], ["score", "s32"], ["tp", "u32"],
  ["tp_rank", "u32"], ["title", "u16"], ["mp", "u32"], ["unk_b0", "u16"], ["wins", "u16"],
  ["losses", "u16"], ["unk_b8", "u16"], ["avatar_a", "b16"], ["avatar_b", "b16"]];
const REC_TYPES: Record<string, string> = Object.fromEntries([...PSELECT_SPEC, ...PDU_SPEC]);
const TYPE_MAX: Record<string, number> = { u8: 0xff, u16: 0xffff, u32: 0xffffffff, s32: 0x7fffffff };

/** py int(): ints, numeric strings, bools; floats truncate. */
export const int = (v: unknown): number => {
  if (typeof v === "boolean") return v ? 1 : 0;
  const n = typeof v === "number" ? v : Number(String(v).trim());
  if (!Number.isFinite(n)) throw new TypeError(`int(${String(v)})`);
  return Math.trunc(n);
};
const int0 = (v: unknown) => { try { return int(v || 0); } catch { return 0; } };

export function encode(spec: Spec, values: Record<string, any>): Uint8Array {
  const w = new W();
  for (const [key, t] of spec) {
    const v = values[key] ?? 0;
    if (t === "u8") w.u8(int(v) & 0xff);
    else if (t === "u16") w.u16(int(v) & 0xffff);
    else if (t === "u32" || t === "s32") w.u32(int(v));
    else if (t === "s16") w.s(String(v || ""), 16);
    else {
      const raw = typeof v === "string" ? Buffer.from(v, "hex") : Buffer.from(v || []);
      const b = new Uint8Array(16); b.set(raw.subarray(0, 16)); w.raw(b);
    }
  }
  return w.bytes();
}

export function recInc(r: P, key: string, n = 1): number {
  const top = TYPE_MAX[REC_TYPES[key] ?? "u32"] ?? 0xffffffff;
  r[key] = Math.max(0, Math.min(int(r[key] ?? 0) + int(n), top));
  return r[key];
}

// ---- valid cards (B05): the 2008 client's cards with art, by passcode
const VALID: ReadonlySet<number> = new Set(GD.valid_cards as number[]);
export const validCardIds = () => VALID;
export const cardOk = (cid: unknown) => { try { return VALID.has(int(cid)); } catch { return false; } };

export function sanitizeCards(g: Game | null, cards: unknown[], src = ""): number[] {
  const good: number[] = [], bad: unknown[] = [];
  for (const c of cards) (cardOk(c) ? good : bad).push(c as number);
  if (bad.length && g) g.log(`[persistencia] B05: card ids dropped (${src || "?"}): ${[...new Set(bad)].slice(0, 20)}`);
  return good;
}

// ---- state.json
/** The admin's start values for new characters (mp, trunk mode). */
let startValues: () => { mp?: number; baul?: string } = () => ({});
export const setStartValues = (f: typeof startValues) => { startValues = f; };

export function blankProfile(name = ""): P {
  const rec: P = {};
  for (const [, k] of REC) rec[k] = 0;
  Object.assign(rec, { lv: START_LV, mp: START_MP });
  const sv = startValues();
  if ("mp" in sv) rec.mp = sv.mp;
  return { name, rec, trunk: {}, pbin: defaultPbinBits(), npcbin: {}, avatar: { a: "0000203040608090b820000000000000", b: "0000203040608090b820000000000000" }, decks: {}, claims: [], pending: [], country: "" };
}

export function countryFromLang(p: P | null, lang: number): boolean {
  if (!COUNTRY_BY_LANG || !p || p.country !== "") return false;
  const c = LANG_COUNTRY[lang];
  if (!c) return false;
  p.country = c;
  return true;
}

export function profile(st: State, slot: number | string, create = true): P | null {
  const s = String(int(slot));
  const profs = (st.profiles ??= {});
  let p: P | null = profs[s] ?? null;
  if (p === null && create) {
    const name = st.players?.[s] ?? "";
    p = profs[s] = blankProfile(name);
    const w = st.wallet;
    if (w && Object.keys(w).length && s === "0") { p.rec.mp = int(w.mp ?? START_MP); }
    seedTrunk(p);
    if (PROGRESSION) { p.earned = { duels: 0 }; p.bind_v = LEGACY_BIND_V; }
    // delete-and-remake isn't an MP mint: past the account's first FREE_STARTS characters (live + archived; the archive
    // keeps the last 10, so the count never drops back) a new one starts with no MP. It keeps its starter claim: a
    // character must always be able to get cards (owner, 2026-10-29: else it is stuck in Edit Deck)
    if (PROGRESSION && Object.keys(profs).length + (st.profiles_borrados?.length ?? 0) > FREE_STARTS) {
      p.rec.mp = 0;
      p.mp_wallet = { version: 1, bound: 0 };
    }
  }
  if (p !== null && !p.name) p.name = st.players?.[s] ?? "";
  if (p !== null) {
    p.rec ??= {};
    progressionReset(p);
    legacyBind(p);
    if (Array.isArray(p.pbin)) p.pbin = expandCosmeticBits(p.pbin);
    unifyLook(p);   // one look for both worlds (2026-11-05): a character saved with two keeps one
  }
  return p;
}

/** Characters an account starts with ECON.START_MP: its 4 slots and 2 remakes (later ones get the starter claim only). */
export const FREE_STARTS = 6;

export function profileCreated(st: State, slot: number): [P, boolean] {
  const existed = String(int(slot)) in (st.profiles ?? {});
  return [profile(st, slot)!, !existed];
}

export const activeSlot = (st: State) => { try { return int(st.active_slot ?? 0) & 3; } catch { return 0; } };
export const setActiveSlot = (st: State, slot: number) => { st.active_slot = int(slot) & 3; };
export function myName(st: State): string {
  const s = String(activeSlot(st));
  return (st.profiles?.[s] ?? {}).name || st.players?.[s] || "Duelista";
}

// ---- progression (config.ts PROGRESSION): the 2008 way of getting cards instead of py's "every card, 3 copies"
let PROGRESSION = false;
export const setProgression = (on: boolean) => { PROGRESSION = on; };
export const progression = () => PROGRESSION;
/** The "Startup Present 40" right (yo2pbinmap 784, py research/lobby NOTES.md 0x8401): at login the client offered
 *  its presentEntry pick of any 40 cards. Retired (owner, 2026-10-29): new characters claim a free structure deck
 *  instead (starter.ts). The offer right is retired even after a claim; its GET marker (bit + 1) remains as history
 *  and prevents a second free starter. The native CCardPackCheckScene branch at 0x00852edf tests the offer right
 *  alone, so leaving that right set reopens the picker even with the GET marker. Cards and the marker are kept. */
export const STARTER_RIGHT = 0x310;
const STARTUP_PRESENT_RANGE = [782, 791];
/** Bumped to restart every character again; 1 = the progression launch ("reset everyone", the owner's call). */
const PROGRESSION_EPOCH = 1;
/** A character from before progression (or before the current epoch) restarts: empty trunk, no startup present
 *  bits (so it can claim the starter deck), the starting MP. Everything else (record, NPCs, avatar, titles) is kept.
 *  The retired startup present offer right is dropped (no 40-card pick offer at login; the starter deck replaces it). */
export function progressionReset(p: P): boolean {
  if (PROGRESSION && pbinTest(p, STARTER_RIGHT)) pbinSet(p, STARTER_RIGHT, false);
  if (!PROGRESSION || int(p.prog ?? 0) >= PROGRESSION_EPOCH) return false;
  p.trunk = {};
  delete p.bound;
  p.pbin = (p.pbin ?? []).filter((b: number) => b < STARTUP_PRESENT_RANGE[0] || b > STARTUP_PRESENT_RANGE[1]);
  delete p.starter;
  grantStartMp(p);
  p.prog = PROGRESSION_EPOCH;
  return true;
}
/** Soul-bound MP (owner, 2026-11-02: "anything bought with these points cannot be traded"): the free starting grant
 *  sits in p.mp_wallet.bound, a part of rec.mp. The shop spends it first, and every card of a purchase it paid for, wholly
 *  or partly, is soul-bound (bindCards): an alt can't turn its grant into cards for a main. Earned MP never enters it.
 *  Characters from before it have none (going forward only: their grant can't be told apart from what they earned). */
export function grantStartMp(p: P): void {
  (p.rec ??= {}).mp = ECON.START_MP;
  p.mp_wallet = { version: 1, bound: ECON.START_MP };
  delete p.mp_bound;
}
/** The bound part of a character's MP (never more than its balance). */
export const mpBound = (p: P): number => mpBalances(p).bound;
// ---- the MP economy (progression only; parity runs keep py's 0 per duel). The owner's MVP values (2026-10-28, set
// by the coordinator as "healthy values"); shop prices are unchanged (shop.ts: booster 200, beginner packs 1001-1003
// 100, structure decks 7000+ 1000, avatar items as they were).
export const ECON = {
  START_MP: 5000, // 25 boosters on top of the free starter deck (starter.ts): a fun first session, not half the shop
  NPC_MIN_TURNS: 3, // early surrender/disconnect is ineligible for consolation MP
  NPC_WIN: 150, NPC_LOSS: 50, // a booster every ~1.3 NPC wins, about one pack per 10 minutes of play
  PVP_WIN: 250, PVP_LOSS: 100, // real duels pay a bit more than NPCs; a loss pays less than a win, so throwing doesn't pay
  PVP_MIN_TURNS: 3, PVP_MIN_S: 120, // a PvP duel shorter than both (early surrender, disconnect) pays nobody
  PAIR_DAY_MAX: 5, // rewarded PvP duels a UTC day against the same account; after that the pair earns 0
  FIRST_WIN: 300, // bonus on the first rewarded win of the UTC day
  SOFT_CAP: 40, SOFT_RATE: 0.25, // after 40 rewarded duels in a UTC day, every reward pays 25%
} as const;

/** The native protocol keeps total MP in rec.mp. Only the tracked promotional subset is soulbound.
 * Existing mp_bound ledgers migrate without changing the balance. Profiles without either ledger keep zero bound MP:
 * daily economy counters cannot prove how much of a legacy balance was earned or spent, so we must not relabel earned savings as a free grant.
 * The ledger survives in D1 state_extras, including archived characters; no destructive progression reset. */
export function mpBalances(p: P): { total: number; bound: number; earned: number } {
  const total = Math.max(0, Math.min(0xffffffff, int0(p.rec?.mp)));
  if (p.mp_wallet?.version !== 1) p.mp_wallet = { version: 1, bound: Math.max(0, int0(p.mp_bound)) };
  delete p.mp_bound;
  const bound = Math.max(0, Math.min(total, int0(p.mp_wallet.bound)));
  p.mp_wallet.bound = bound;
  return { total, bound, earned: total - bound };
}

/** Debit a validated purchase atomically, consuming promotional MP first. A rejected debit changes no balance. */
export function spendMp(p: P, amount: number): { bound: number; earned: number } | null {
  const total = Math.max(0, Math.min(0xffffffff, int0(p.rec?.mp)));
  if (!Number.isSafeInteger(amount) || amount < 0 || amount > total) return null;
  const wallet = mpBalances(p);
  const bound = Math.min(wallet.bound, amount);
  (p.rec ??= {}).mp = wallet.total - amount;
  p.mp_wallet.bound = wallet.bound - bound;
  return { bound, earned: amount - bound };
}
// The day's counters live on each character (p.econ, D1 state_extras); the caps add them up over the account
// (econAccount), so its 4 characters, and one deleted and remade, share one pair cap, first win and soft cap.
function econToday(g: Game | null, p: P): P {
  const day = new Date((g?.clock.time() ?? Date.now() / 1000) * 1000).toISOString().slice(0, 10);
  if (p.econ?.day !== day) p.econ = { day, duels: 0, wins: 0, pairs: {}, earned: 0, spent: 0, packs: 0, tin: 0 };
  return p.econ;
}
/** Today's counters of the whole account: this character's `e` plus every other one, live or archived (a deleted
 *  character's day still counts). Without a session (tests, the owner's context) just `e`. */
function econAccount(g: Game | null, e: P): { duels: number; wins: number; pairs: Record<string, number> } {
  const t = { duels: int(e.duels), wins: int(e.wins), pairs: { ...e.pairs } as Record<string, number> };
  if (!g || g.ctx === null || g.ctx === g.NO_SESSION) return t;
  let st: State;
  try { st = g.loadState(); } catch { return t; }
  const mine = String(activeSlot(st));
  const others = [...Object.entries(st.profiles ?? {}).filter(([k]) => k !== mine).map(([, q]) => q),
    ...(st.profiles_borrados ?? []).map((a: P) => a?.perfil)] as P[];
  for (const q of others) {
    const x = q?.econ;
    if (!x || x.day !== e.day) continue;
    t.duels += int(x.duels ?? 0); t.wins += int(x.wins ?? 0);
    for (const [k, n] of Object.entries(x.pairs ?? {})) t.pairs[k] = (t.pairs[k] ?? 0) + int(n);
  }
  return t;
}

// ---- what a character has earned by playing (the owner, 2026-11-04: alts traded away the packs their free 5000 MP
// bought before soul-bound MP existed, 261 cards onto one main in four days). p.earned.duels counts the duels that paid
// MP (mpReward > 0: not a short PvP, not past the pair cap); the trade gate and the legacy bind read it.
/** Rewarded duels this character has played. A character from before the ledger is estimated once from its record:
 *  its PvP games and its NPC wins, losses and draws (generous: duels from before progression count too). */
export function earnedDuels(p: P): number {
  if (p.earned && typeof p.earned === "object") return int0(p.earned.duels);
  let n = int0(p.pvp?.n);
  for (const e of Object.values(p.npcbin ?? {}) as number[][]) n += int0(e?.[NPCBIN_WIN]) + int0(e?.[NPCBIN_LOSE]) + int0(e?.[NPCBIN_DRAW]);
  return n;
}
/** Rewarded duels before a character's cards can leave it in a trade (trade.ts); receiving needs none. */
export const TRADE_GIVE_MIN_DUELS = 20;
/** Net cards an account may take in through trades in a UTC day (received − given, per trade, summed over its
 *  characters live and archived); balanced swaps never count. */
export const TRADE_IN_DAY_MAX = 30;
/** 1: the one-off bind of 2026-11-04. Cards bought with the starting grant before soul-bound MP (2026-11-02) were
 *  tradeable: nothing recorded which MP paid for them. A character that had played fewer than TRADE_GIVE_MIN_DUELS
 *  rewarded duels then has its whole trunk soul-bound (its earned share is a few packs at most); one past that keeps
 *  its cards. New characters are born past it (profile). */
const LEGACY_BIND_V = 1;
export function legacyBind(p: P): boolean {
  if (!PROGRESSION || int0(p.bind_v) >= LEGACY_BIND_V) return false;
  const n = earnedDuels(p);
  p.earned = { duels: n };
  p.bind_v = LEGACY_BIND_V;
  if (n >= TRADE_GIVE_MIN_DUELS) return false;
  p.bound = Object.fromEntries(Object.entries(p.trunk ?? {}).map(([k, q]) => [k, int0(q)]).filter(([, q]) => (q as number) > 0));
  return true;
}
/** Net cards the account behind `st` took in through trades today (TRADE_IN_DAY_MAX). */
export function tradeInToday(g: Game | null, st: State): number {
  const day = new Date((g?.clock.time() ?? Date.now() / 1000) * 1000).toISOString().slice(0, 10);
  let n = 0;
  for (const q of [...Object.values(st.profiles ?? {}), ...(st.profiles_borrados ?? []).map((a: P) => a?.perfil)] as P[])
    if (q?.econ?.day === day) n += int0(q.econ.tin);
  return n;
}
/** A done trade's net intake on this character's day (negative nets count as 0: giving away earns no allowance). */
export function tradeInAdd(g: Game | null, p: P, net: number): void {
  if (!PROGRESSION || net <= 0) return;
  const e = econToday(g, p);
  e.tin = int0(e.tin) + net;
}
const econLog = (g: Game | null, e: P, what: string) => g?.log(`[economia] ${(g.ctxAcct() ?? "?").slice(0, 6)}: ${what}; `
  + `${e.day}: ${e.duels} duels, ${e.wins} wins, +${e.earned} MP, -${e.spent} MP, ${e.packs} packs`);

/** MP for a finished duel, after the guards; pvp = null for an NPC duel. Returns what was paid. */
export function mpReward(g: Game | null, p: P, result: string, turns: number, pvp: { opp: string | null; secs: number } | null = null): number {
  p.prize_unbound = false;
  if (!PROGRESSION || (g && isFree(g.ctx))) return 0;
  const e = econToday(g, p), win = result === "win", E = ECON, acc = econAccount(g, e);
  let mp: number = pvp ? (win ? E.PVP_WIN : E.PVP_LOSS) : (win ? E.NPC_WIN : E.NPC_LOSS), why = "";
  if (pvp && turns < E.PVP_MIN_TURNS && pvp.secs < E.PVP_MIN_S) { mp = 0; why = " short"; }
  else if (pvp && pvp.opp && (acc.pairs[pvp.opp] ?? 0) >= E.PAIR_DAY_MAX) { mp = 0; why = " pair cap"; }
  if (mp) {
    mpBalances(p); // clamp the existing promotional subset BEFORE adding earned currency
    if (pvp?.opp) e.pairs[pvp.opp] = (e.pairs[pvp.opp] ?? 0) + 1;
    if (win && !acc.wins) mp += E.FIRST_WIN;
    p.prize_unbound = acc.duels < E.SOFT_CAP;
    if (acc.duels >= E.SOFT_CAP) { mp = Math.floor(mp * E.SOFT_RATE); why = " soft cap"; }
    e.duels++; if (win) e.wins++;
    e.earned += mp;
    recInc((p.rec ??= {}), "mp", mp);
    (p.earned = { duels: earnedDuels(p) }).duels++;
  }
  rewardDuel(g, p, result, mp, !!pvp, p.prize_unbound === true);
  econLog(g, e, `+${mp} MP (${pvp ? "pvp" : "npc"} ${result}, ${turns} turns${pvp ? `, ${Math.round(pvp.secs)} s` : ""}${why})`);
  return mp;
}
/** Mission/login income shares the UTC economy ledger without consuming duel eligibility. */
export function recordRewardIncome(g: Game | null, p: P, amount: number): void {
  const e = econToday(g, p); e.earned += amount;
}
/** A shop purchase, for the [economia] log and the day's counters. */
export function mpSpent(g: Game | null, p: P, mp: number, packs: number): void {
  if (!PROGRESSION) return;
  const e = econToday(g, p);
  e.spent += mp; e.packs += packs;
  rewardEvent(g, p, "pack", packs);
  econLog(g, e, `-${mp} MP (${packs} packs)`);
}

export function seedTrunk(p: P, mode: string = startValues().baul ?? TRUNK_START): void {
  if (PROGRESSION) { p.prog = PROGRESSION_EPOCH; grantStartMp(p); return; }
  if (mode === "all3") p.trunk = Object.fromEntries([...VALID].sort((a, b) => a - b).map((i) => [String(i), 3]));
  // "deck" reads the local client's deck.ydc: not on a server
}

// ---- trunk
/** The trunk as (passcode, copies) pairs, for the trunk tables (0x3102, 0x7126). */
export function trunkPairs(p: P): [number, number][] {
  const out: [number, number][] = [];
  for (const [k, v] of Object.entries(p.trunk ?? {})) {
    let cid: number, n: number;
    try { cid = int(k); n = int(v); } catch { continue; }
    if (cardOk(cid) && n > 0) out.push([cid, Math.min(n, 0xff)]);
  }
  return out.sort((a, b) => a[0] - b[0]);
}

/** A trunk table on the card wire: start, chunks of (u32 passcode, u8 count), end (the client's codec rebuilds the
 *  2008 client's 3256-byte table and its 7 chunks). */
export function pairTable(start: number, mid: number, end: number, pairs: [number, number][]): [number, Uint8Array][] {
  const msgs: [number, Uint8Array][] = [[start, new Uint8Array(0)]];
  for (let i = 0; i < pairs.length; i += PAIRS_PER_CHUNK) {
    const w = new W();
    for (const [c, n] of pairs.slice(i, i + PAIRS_PER_CHUNK)) w.u32(c).u8(n);
    msgs.push([mid, w.bytes()]);
  }
  msgs.push([end, new Uint8Array(0)]);
  return msgs;
}

/** Every trunk change, at full rate, as one [economia] line: account, character, source, the cards (id x count).
 *  The security audit reads these instead of inferring from D1 (coordinator, 2026-10-29). */
function econCards(g: Game | null, p: P, sign: "+" | "-", cards: number[], src: string): void {
  if (!g || !cards.length) return;
  const n = new Map<number, number>();
  for (const c of cards) n.set(c, (n.get(c) ?? 0) + 1);
  g.log(`[economia] ${(g.ctxAcct() ?? "?").slice(0, 8)} ${p.name || "?"}: cards ${sign}${cards.length} (${src || "?"}): `
    + [...n].map(([c, k]) => (k > 1 ? `${c}x${k}` : String(c))).join(","));
}

export function trunkAdd(g: Game | null, p: P, cards: unknown[], n = 1, src = ""): void {
  if (g && isFree(g.ctx)) { g.log(`[free] trunk_add refused (${src}): free mode`); return; }
  const t = (p.trunk ??= {});
  const added: number[] = [];
  for (const cid of sanitizeCards(g, cards, src || "trunk_add")) {
    const k = String(int(cid));
    t[k] = Math.min(int(t[k] ?? 0) + n, 0xff);
    for (let i = 0; i < n; i++) added.push(int(cid));
  }
  econCards(g, p, "+", added, src);
}

export function trunkRemove(p: P, cards: unknown[], g: Game | null = null, src = ""): void {
  const t = (p.trunk ??= {});
  const removed: number[] = [];
  for (const cid of cards) {
    const k = String(int(cid));
    if ((t[k] ?? 0) > 0) { t[k] -= 1; if (!t[k]) delete t[k]; removed.push(int(cid)); }
  }
  clampBound(p);
  econCards(g, p, "-", removed, src);
}

// ---- soul-bound copies (the owner, 2026-10-30): cards given free (the starter deck, the retired Startup Present) can't
// be traded, so new accounts can't farm them onto one. p.bound = card -> bound copies, never more than owned; a removal
// takes the unbound copies first (only what's left over owned is unbound). Shop items paid partly or fully with
// bound MP bind every card in that item. Earned-MP purchases, PvP/NPC prizes and admin grants stay free to trade.
/** Binds these cards (repeats are copies), up to what the trunk holds. */
export function bindCards(p: P, cards: unknown[]): void {
  const b: Record<string, number> = (p.bound ??= {});
  for (const c of cards) { const k = String(int(c)); b[k] = (b[k] ?? 0) + 1; }
  clampBound(p);
}
export function clampBound(p: P): void {
  for (const [k, n] of Object.entries((p.bound ?? {}) as Record<string, number>)) {
    const m = Math.min(int(n), int(p.trunk?.[k] ?? 0));
    if (m > 0) p.bound[k] = m; else delete p.bound[k];
  }
  for (const [k, n] of Object.entries((p.crafted ?? {}) as Record<string, number>)) {
    const m = Math.max(0, Math.min(int(n), int(p.trunk?.[k] ?? 0) - int(p.bound?.[k] ?? 0)));
    if (m) p.crafted[k] = m; else delete p.crafted[k];
  }
}

export function sanitizeTrunk(p: P): string[] {
  const t = (p.trunk ??= {});
  const bad: string[] = [];
  for (const k of Object.keys(t)) {
    let ok: boolean;
    try { ok = cardOk(int(k)) && int(t[k]) > 0; } catch { ok = false; }
    if (!ok) { bad.push(k); delete t[k]; }
  }
  return bad;
}

export const trunkMessages = (p: P): [number, Uint8Array][] => pairTable(0x3101, 0x3102, 0x3103, trunkPairs(p));

// ---- PBIN / NPCBIN
const PBIN_TYPES = GD.pbin_types as Record<string, number>;
export const pbinType = (bit: number) => PBIN_TYPES[String(int(bit))] ?? 0;
export const defaultPbinBits = () => (GD.default_pbin_bits as number[]).slice();
export const NPC_PRIZE_BITS = GD.npc_prize_bits as Record<string, Record<string, number>>;

/** The 0x3114 bytes. With `rank` (the character's rankView), as the live client gets them: the rank uniforms of a
 *  school never reached are cleared (the stored bits stay), PBIN_RANKED is set (the recompiled editor then lists
 *  uniforms by these bits instead of by LV) and PBIN_GRADUATED for a graduated student (any owned outfit in the
 *  Academy). */
export function pbinBytes(p: P, rank?: { bestSchool: RankSchool; graduated: boolean }): Uint8Array {
  const arr = new Uint8Array(PBIN_SIZE);
  for (const b of p.pbin ?? []) if (b >= 0 && b < PBIN_SIZE * 8) arr[b >> 3] |= 1 << (b & 7);
  if (rank) {
    for (const b of RANK_UNIFORM_BY_BIT.keys()) if (!uniformAllowed(b, rank.bestSchool)) arr[b >> 3] &= ~(1 << (b & 7));
    for (const b of [PBIN_RANKED, PBIN_GRADUATED]) arr[b >> 3] &= ~(1 << (b & 7));
    arr[PBIN_RANKED >> 3] |= 1 << (PBIN_RANKED & 7);
    if (rank.graduated) arr[PBIN_GRADUATED >> 3] |= 1 << (PBIN_GRADUATED & 7);
  }
  return arr;
}
export const pbinTest = (p: P, bit: number) => (p.pbin ?? []).includes(int(bit));

const AV_PBIN = LD.avatar_pbin as unknown as Record<string, [number, number, number, number, number, number]>;
const LOOK_HEX = /^[0-9a-f]{32}$/i;
/** The Domino starter clothes (the default outfit rows of the Domino series: 0x70-0x73, a girl's 0x70), what the 2008
 *  client gave a new character in Domino. The default outfit is Slifer Red (owner, 2026-11-06: players were
 *  wearing these once past LV 5): a character wears one only after picking it (p.avatar.pick, outfitPicked). */
const DOMINO_STARTER = new Set(Object.entries(AV_PBIN).filter(([, r]) => r[1] && r[3] === 6 && r[5] === 2).map(([bit]) => Number(bit)));
const dominoStarter = (parts: Uint8Array) => DOMINO_STARTER.has((parts[0] === 1 ? 256 : 0) + parts[6]);
/** A look the player put on (the appearance editor, the cosmetics page): records whether its outfit is a Domino
 *  starter one, which normalizeLook then keeps. Call it before normalizeLook. */
export function outfitPicked(p: P, parts: Uint8Array): void {
  p.avatar = { ...(p.avatar ?? {}) };
  if (dominoStarter(parts)) p.avatar.pick = 1; else delete p.avatar.pick;
}
/** One look per character (owner, 2026-11-05: no Domino / Academy split): p.avatar.a and .b, the protocol's world 0
 *  and 1 copies, are kept the same. A character saved with two different looks keeps the one of the world it was
 *  last in (p.avatar.w, recorded from then on), else Domino's (a). -> whether it changed p. */
export function unifyLook(p: P): boolean {
  const v = p?.avatar;
  if (!v || typeof v !== "object") return false;
  const a = typeof v.a === "string" && LOOK_HEX.test(v.a) ? v.a.toLowerCase() : null, b = typeof v.b === "string" && LOOK_HEX.test(v.b) ? v.b.toLowerCase() : null;
  // with no world recorded, a Domino look still in its starter clothes was never picked: the Academy's is kept
  const keep = a && b ? (v.w === 1 || (v.w !== 0 && dominoStarter(Buffer.from(a, "hex"))) ? b : a) : a || b;
  if (!keep || (v.a === keep && v.b === keep)) return false;
  v.a = keep; v.b = keep;
  return true;
}
/** The character's one look, written for both worlds; `world`: the world it was put on in (the last world). */
export function setLook(p: P, parts: Uint8Array, world?: number): void {
  const hex = Buffer.from(parts).toString("hex");
  p.avatar = { ...(p.avatar ?? {}), a: hex, b: hex, ...(world === 0 || world === 1 ? { w: world } : {}) };
}
/** Repair legacy/native placeholder slots using the same body defaults as CAvatarData. */
export function normalizeLook(p: P, input: Uint8Array): Uint8Array {
  const parts = input.slice(), defaults = Uint8Array.from([0, 0, 32, 48, 64, 96, 128, 144, 184, 32, 0, 0, 0, 0, 0, 0]);
  const base = parts[0] === 1 ? 256 : 0;
  for (let slot = 1; slot <= 9; slot++) {
    if ([2, 9].includes(slot) && parts[slot] === 32) continue;
    const row = AV_PBIN[String(base + parts[slot])];
    if (!row || row[3] !== slot || row[2] !== (parts[0] === 1 ? 2 : 1)) parts[slot] = defaults[slot];
  }
  if (Number(p.rec?.lv ?? 1) < 5 || (dominoStarter(parts) && !p.avatar?.pick)) parts[6] = 0x80;
  return parts;
}
/** One saved look in both worlds. Missing or native placeholder slots start in Slifer Red. */
export function avatarParts(p: P, world: number): Uint8Array {
  unifyLook(p);
  const saved = p.avatar?.[world === 1 ? "b" : "a"];
  const input = typeof saved === "string" && LOOK_HEX.test(saved)
    ? new Uint8Array(Buffer.from(saved, "hex")) : new Uint8Array(Buffer.from("0000203040608090b820000000000000", "hex"));
  const parts = normalizeLook(p, input);
  setLook(p, parts);
  return parts;
}

/** Whether every avatar item in these 16 part bytes (0x4170) is this character's: bytes 1-9 are the parts, item
 *  (PBIN bit) = value + 0x100 for a girl; a default item (column 2) or an owned bit. Bytes that are no item of
 *  their slot ("none", colours) aren't items to own. */
export function avatarOwned(p: P, parts: Uint8Array): boolean {
  const girl = parts[0] === 1 ? 0x100 : 0;
  for (let i = 1; i <= 9 && i < parts.length; i++) {
    const bit = parts[i] + girl, rec = AV_PBIN[String(bit)];
    if (!rec || rec[3] !== i || rec[1]) continue;
    if (!pbinTest(p, bit)) return false;
  }
  return true;
}
export function pbinSet(p: P, bit: number, on = true): void {
  const s = new Set<number>(p.pbin ?? []);
  if (on) s.add(int(bit)); else s.delete(int(bit));
  p.pbin = [...s].sort((a, b) => a - b);
}

export function npcbinBytes(p: P): Uint8Array {
  const arr = new Uint8Array(NPCBIN_SIZE);
  for (const [k, v] of Object.entries(p.npcbin ?? {})) {
    const i = int(k);
    if (i >= 0 && i < NPCBIN_MAX) [...(v as number[]), 0, 0, 0, 0].slice(0, 4).forEach((x, j) => { arr[i * 4 + j] = int(x) & 0xff; });
  }
  return arr;
}
export const npcbinGet = (p: P, npc: number): number[] => [...(p.npcbin?.[String(int(npc))] ?? []), 0, 0, 0, 0].slice(0, 4);
export function npcbinSet(p: P, npc: number, entry: number[]): void {
  if (int(npc) > 0 && int(npc) < NPCBIN_MAX) (p.npcbin ??= {})[String(int(npc))] = [...entry, 0, 0, 0, 0].slice(0, 4).map((x) => int(x) & 0xff);
}
const NPCBIN_WIN = 0, NPCBIN_LOSE = 1, NPCBIN_DRAW = 2;
export function npcResult(e0: number[], result: string): number[] {
  const e = [...e0, 0, 0, 0, 0].slice(0, 4);
  const k = result === "win" ? NPCBIN_WIN : result === "lose" ? NPCBIN_LOSE : NPCBIN_DRAW;
  e[k] = Math.min(int(e[k]) + 1, 255);
  return e;
}

// ---- titles (B10, B74)
const TITLES = GD.titles as [number, number, string][];
export function titleIdFromBit(bit: number): number | null {
  for (const [tid, b] of TITLES) if (b === int(bit)) return tid;
  return null;
}
const TITLE_BIT_SET = new Set(TITLES.map((t) => t[1]));
const TITLE_ID_SET = new Set(TITLES.map((t) => t[0]));
export function fixTitleValue(v: unknown): number {
  const n = int(v || 0);
  if (TITLE_ID_SET.has(n)) return n;
  return titleIdFromBit(n) ?? 0;
}

// ---- player messages
export function recValues(p: P, playerId?: number | null): P {
  const v: P = { ...(p.rec ?? {}) };
  v.wire_unused_dp = WIRE_UNUSED_DP.balance;
  v.player_id = playerId ?? v.player_id ?? 0;
  v.recovery_flags = 0;
  v.champ_pending = 0;
  v.title = fixTitleValue(v.title ?? 0);
  return v;
}

export function pselectResult(p: P, playerId: number, result = 0): Uint8Array {
  const v = recValues(p, playerId); v.result = result;
  return encode(PSELECT_SPEC, v);
}

export function playerDataUpdate(p: P, npc?: number | null): Uint8Array {
  const v = recValues(p);
  if (npc && int(npc) > 0 && int(npc) < NPCBIN_MAX) {
    const b = npcbinGet(p, npc);
    Object.assign(v, { npc_index: int(npc), npc_b0: b[0], npc_b1: b[1], npc_b2: b[2], npc_b3: b[3] });
  }
  return encode(PDU_SPEC, v);
}

export function playerEntry(slot: string, p: P, tpRank: number | null = null): Uint8Array {
  const v: P = { ...(p.rec ?? {}) };
  v.title = fixTitleValue(v.title ?? 0);
  Object.assign(v, { slot: int(slot), name: p.name ?? "", avatar_a: Buffer.from(avatarParts(p, 0)).toString("hex"), avatar_b: Buffer.from(avatarParts(p, 1)).toString("hex") });
  if (tpRank !== null) v.tp_rank = int(tpRank);
  return encode(PLAYERLIST_ENTRY_SPEC, v);
}

/** py playerlist (TP_RANK off). py sorts the slots with key=int. */
export function playerlist(st: State): Uint8Array {
  const parts: Uint8Array[] = [new W().u32(0).bytes()];
  for (const slot of Object.keys(st.players ?? {}).sort((a, b) => int(a) - int(b)).slice(0, 4)) parts.push(playerEntry(slot, profile(st, slot)!, null));
  return Buffer.concat(parts);
}

// ---- decks
export const structureDeckCards = (deckId: number): number[] => {
  const d = (YDC as unknown as Record<string, { main: number[]; side: number[]; extra: number[] }>)[String(deckId)];
  return d ? [...d.main, ...d.side, ...d.extra] : [];
};

/** The deck the client sends at duel start (0x6600 counts, 0x6601 main, 0x6603 extra; the side never comes). */
export class DuelDeck {
  counts: [number, number, number] | null = null;
  main: number[] = [];
  extra: number[] = [];
  feed(msgId: number, data: Uint8Array): boolean {
    const dv = new DataView(data.buffer, data.byteOffset, data.byteLength);
    if (msgId === 0x6600 && data.length >= 12) { this.counts = [dv.getUint32(0), dv.getUint32(4), dv.getUint32(8)]; this.main = []; this.extra = []; }
    else if ((msgId === 0x6601 || msgId === 0x6603) && data.length >= 4) {
      const n = dv.getUint32(0);
      const cards = data.length >= 4 + 4 * n ? Array.from({ length: n }, (_, i) => dv.getUint32(4 + 4 * i)) : [];   // passcodes
      if (msgId === 0x6601) this.main = cards;
      else { this.extra = cards; return true; }
    }
    return false;
  }
  asDict() { return { main: this.main, extra: this.extra, side_count: this.counts ? this.counts[1] : 0 }; }
  badIds() { return [...new Set([...this.main, ...this.extra].filter((c) => !cardOk(c)))].sort((a, b) => a - b); }
  checkAgainst(p: P): Map<number, number> {
    const need = new Map<number, number>();
    for (const c of [...this.main, ...this.extra]) need.set(c, (need.get(c) ?? 0) + 1);
    const have = p.trunk ?? {};
    const out = new Map<number, number>();
    for (const [c, n] of need) if (n > (have[String(c)] ?? 0)) out.set(c, n - (have[String(c)] ?? 0));
    return out;
  }
}

export function saveDuelDeck(g: Game, c: Conn, msgId: number, data: Uint8Array): void {
  const dd = ((c.ext.duelDeck as DuelDeck) ??= new DuelDeck());
  if (!dd.feed(msgId, data) || isFree(c.sess)) return;   // a free duel's deck is not the MMO's last duel deck
  const bad = dd.badIds();
  if (bad.length) g.log(`[persistencia] B05: duel deck with ids without art: ${bad}`);
  const s = c.sess as { slot: number | null } | null;
  const st = g.loadState();
  const slot = s?.slot ?? null;
  const p = profile(st, slot === null ? activeSlot(st) : int(slot) & 3)!;
  (p.decks ??= {}).last_duel = dd.asDict();
  const missing = dd.checkAgainst(p);
  if (missing.size) p.decks.last_duel.missing = Object.fromEntries([...missing].map(([k, v]) => [String(k), v]));
  if (bad.length) p.decks.last_duel.bad_ids = bad;
  g.saveState(st);
}

// ---- prize queue (B09)
export const VIA_NPC = "npc", VIA_ANY = "any";
const ITEMGET_MAX = 480;
const pendingList = (p: P): P[] => (p.pending ??= []);
/** The PBIN classes (yo2pbinmap column 3, `pbinType`) that the client's item-get window can draw. CCardPackCheckScene
 *  state 0x21 (yo2.exe 0x853c06..0x85489e) sets up a page only for avatar parts (1 boy, 2 girl, 3 both), 挑戦権 (7),
 *  recipes (8) and titles (10). Any other class jumps straight to «[%d]番のアイテム取得を表示» (0x854ce9) and shows an
 *  empty page: a blank gift. Those bits (6 = 途中景品 GET済み, 4 special, 5 deck right, 9 GET権利) are still stored, but they
 *  stay out of the 0x5205 gift; the client gets them with the next 0x3114. Deliberate change (DESIGN.md). */
const SHOWN_CLASSES = new Set([1, 2, 3, 7, 8, 10]);
export const bitShown = (bit: number): boolean => SHOWN_CLASSES.has(pbinType(bit));

export function pendingAdd(g: Game | null, p: P, bits: number[] = [], cards: number[] = [], via = VIA_ANY, src = ""): P | null {
  const bs = bits.map(int).filter((b) => b >= 0 && b < PBIN_SIZE * 8);
  const cs = sanitizeCards(g, cards.map(int), "premio " + (src || via));
  for (const b of bs) pbinSet(p, b);
  trunkAdd(g, p, cs, 1, "premio " + (src || via));
  const shown = bs.filter(bitShown);
  if (!shown.length && !cs.length) return null;
  const pkg = { bits: shown, cards: cs, via, src };
  pendingList(p).push(pkg);
  return pkg;
}

export function pendingPop(p: P, via = VIA_ANY): P | null {
  const q = pendingList(p);
  const i = q.findIndex((pkg) => (pkg.via ?? VIA_ANY) === via);
  return i < 0 ? null : q.splice(i, 1)[0];
}

export function pendingTakeAll(p: P, via = VIA_ANY): P | null {
  const q = pendingList(p);
  const take = q.filter((x) => (x.via ?? VIA_ANY) === via);
  if (!take.length) return null;
  p.pending = q.filter((x) => (x.via ?? VIA_ANY) !== via);
  const bits: number[] = [], cards: number[] = [];
  for (const x of take) { for (const b of x.bits ?? []) if (!bits.includes(b)) bits.push(b); cards.push(...(x.cards ?? [])); }
  return { bits, cards, via, src: take.map((x) => x.src ?? "").join("+") };
}

export function pendingClear(p: P, via: string | null = null): void {
  p.pending = via === null ? [] : pendingList(p).filter((x) => (x.via ?? VIA_ANY) !== via);
}

export function itemgetResult(pbinBits: number[], cards: number[]): Uint8Array {
  const bs = pbinBits.slice(0, ITEMGET_MAX);
  const cs = cards.slice(0, Math.max(0, ITEMGET_MAX - bs.length));
  const w = new W().u16(bs.length);
  for (const b of bs) w.u16(b);
  w.u16(cs.length);
  for (const c of cs) w.u32(c);   // passcodes (the frame may pass 1024 B; the client's codec gives the exe its 2008 form)
  return w.bytes();
}

// ---- NPC chains (B08)
export const CHAIN_THRESHOLD = 4;
const CHAIN_BASES = Array.from({ length: 15 }, (_, i) => 51 + 3 * i);
export const FAMOUS_BASE: Record<number, string> = { 51: "Yami Yugi", 54: "Seto Kaiba", 57: "Tea", 60: "Jaden", 63: "Chazz",
  66: "Alexis", 69: "Joey", 72: "Jesse", 75: "Yami Marik", 78: "Hell Kaiser", 81: "Yami Bakura", 84: "Aster", 87: "Mai", 90: "Jim", 93: "Jaden B" };

export function chainBase(nid: number): number | null {
  nid = int(nid);
  if (nid >= 51 && nid <= 95) { const b = 51 + Math.floor((nid - 51) / 3) * 3; return CHAIN_BASES.includes(b) ? b : null; }
  return null;
}

export function chainFields(nid: number, sentIds: number[] | null = null): [number, number] {
  nid = int(nid);
  const base = chainBase(nid);
  let prev = base !== null && nid > base ? nid - 1 : 0;
  if (prev && sentIds !== null && !sentIds.map(int).includes(prev)) prev = 0;
  return [CHAIN_THRESHOLD, prev];
}

// ---- NPC prizes (B09) and 挑戦権 (B07)
export const TITLE_BITS: Record<string, [number, number, number]> = {
  "Yami Yugi": [160, 175, 422], "Seto Kaiba": [161, 408, 423], Tea: [162, 409, 424], Joey: [163, 410, 425],
  "Yami Bakura": [164, 411, 426], "Yami Marik": [165, 412, 427], Jaden: [166, 413, 428], Chazz: [167, 414, 429], Alexis: [168, 415, 430],
  Jesse: [169, 416, 431], "Hell Kaiser": [170, 417, 480], Aster: [171, 418, 481], Mai: [172, 419, 482], Jim: [173, 420, 483], "Jaden B": [174, 421, 484] };
export const PRESENT_CLOTHES: Record<string, [number | null, number | null]> = { "Yami Yugi": [121, null], "Seto Kaiba": [122, null], Joey: [123, null],
  "Yami Marik": [124, 375], Jaden: [135, null], Chazz: [136, null], Jesse: [137, null], "Hell Kaiser": [138, null], Aster: [139, null],
  Tea: [null, 374], Alexis: [null, 390], "Yami Bakura": [84, 342] };
/** The outfit prize of a famous NPC's chain: EVERY variant (boy and girl), whatever the player's gender (the owner's
 *  call; py gave only the player's own, so a girl got nothing from Yugi and a boy nothing from Téa). */
// Named character costumes are future Outfit Box drops, not easy NPC-win prizes.
// Keep the historical mapping for migration and existing ownership; never revoke already granted cosmetics.
export const presentClothes = (_name: string): number[] => [];
const TITLE_FRIEND_ALL = 159;
const CHALLENGE_RIGHT: Record<number, number> = { 54: 592, 66: 593, 75: 594 };
const CHALLENGE_MODE: string = "free";
const CHALLENGE_EARN: Record<number, number> = { 592: 51, 593: 60, 594: 81 };
const PRIZE_CARDS = false;

export function playerSex(p: P): "F" | "M" {
  const a: string = p.avatar?.a || p.avatar?.b || "";
  return a.slice(0, 2) === "01" ? "F" : "M";
}

export function npcRewards(p: P, nid: number, oldB3: number, newB3: number): [number[], number[]] {
  const pb = NPC_PRIZE_BITS[String(int(nid))] ?? {};
  const mid = 1 + Math.floor((CHAIN_THRESHOLD - 1) / 2);
  const bits: number[] = [], cards: number[] = [];
  if (oldB3 < mid && mid <= newB3 && "mid_got" in pb) bits.push(pb.mid_got);
  if (oldB3 < CHAIN_THRESHOLD && CHAIN_THRESHOLD <= newB3) {
    if ("comp_got" in pb) {
      bits.push(pb.comp_got);
      if (PRIZE_CARDS || PROGRESSION) cards.push(...structureDeckCards(10000 + int(nid)));
    }
    const base = chainBase(nid);
    const name = base !== null ? FAMOUS_BASE[base] : undefined;
    if (name && int(nid) === base! + 2) {
      if (name in TITLE_BITS) bits.push(TITLE_BITS[name][0]);
      bits.push(...presentClothes(name));
    }
  }
  return [bits.filter((b) => !pbinTest(p, b)), cards];
}

/** py persistence challenge_rights_due as research/mundo wraps it (challenge, hair_titles and GM flags on). */
export function challengeRightsDue(p: P, g: Game | null = null): number[] {
  const base = challengeRightsDueBase(p).filter((b) => !(b in MW_CHALLENGE_BY));
  for (const [bit, nids] of Object.entries(MW_CHALLENGE_BY).sort((a, b) => +a[0] - +b[0]))
    if (!pbinTest(p, +bit) && nids.some((n) => int(npcbinGet(p, n)[0]) >= 5) && !base.includes(+bit)) base.push(+bit);
  for (const [t, pieces] of Object.entries(MW_HAIR_TITLES).sort((a, b) => +a[0] - +b[0]))
    if (!pbinTest(p, +t) && pieces.some((b) => pbinTest(p, b)) && !base.includes(+t)) base.push(+t);
  if (g && g.isGm(g.ctxAcct()) && !pbinTest(p, 226) && !base.includes(226)) base.push(226);
  return base;
}
const MW_CHALLENGE_BY: Record<number, number[]> = { 592: [7, 6, 9], 593: [32, 33, 31] };
const MW_HAIR_TITLES: Record<number, number[]> = { 152: [13, 265], 153: [9] };

function challengeRightsDueBase(p: P): number[] {
  if (CHALLENGE_MODE === "free") return Object.values(CHALLENGE_RIGHT).sort((a, b) => a - b).filter((b) => !pbinTest(p, b));
  if (CHALLENGE_MODE === "earn") return Object.entries(CHALLENGE_EARN).sort((a, b) => +a[0] - +b[0])
    .filter(([b, base]) => !pbinTest(p, +b) && npcbinGet(p, base)[3] >= CHAIN_THRESHOLD).map(([b]) => +b);
  return [];
}

// ---- titles by achievements (B74)
const TITLE_RULES: [number, string, number][] = [
  [250, "duels_won", 10], [251, "duels_won", 30], [252, "duels_won", 100], [253, "duels_won", 300], [254, "duels_won", 1000],
  [235, "_tributes", 10], [236, "_tributes", 50], [237, "_tributes", 200], [238, "fusions", 10], [239, "fusions", 50], [240, "fusions", 200],
  [241, "trap_me", 20], [242, "trap_me", 100], [243, "trap_me", 500], [244, "spell_me", 20], [245, "spell_me", 100], [246, "spell_me", 500],
  [247, "comeback_wins", 1], [248, "comeback_wins", 5], [249, "comeback_wins", 20],
  [154, "_collection_pct", 25], [155, "_collection_pct", 50], [156, "_collection_pct", 90]];
const TITLE_SURRENDER_ONE_TURN = 255;

function metric(p: P, key: string): number {
  const r = p.rec ?? {};
  if (key === "_tributes") return int(r.tribute1 ?? 0) + int(r.tribute2 ?? 0) + int(r.tribute3 ?? 0);
  if (key === "_collection_pct") {
    const have = Object.entries(p.trunk ?? {}).filter(([k, n]) => /^\d+$/.test(k) && cardOk(int(k)) && (n as number) > 0).length;
    return Math.floor((have * 100) / Math.max(1, VALID.size));
  }
  return int(r[key] ?? 0);
}

export function checkTitles(p: P, surrender: string | null = null, turns = 0): number[] {
  const nw = TITLE_RULES.filter(([, key, thr]) => metric(p, key) >= thr).map(([b]) => b);
  if (surrender === "me" && int(turns || 0) > 0 && int(turns || 0) <= 1) nw.push(TITLE_SURRENDER_ONE_TURN);
  const friends = Object.entries(FAMOUS_BASE).filter(([b, n]) => +b <= 84 && n in TITLE_BITS).map(([, n]) => TITLE_BITS[n][0]);
  if (friends.length && friends.every((b) => pbinTest(p, b))) nw.push(TITLE_FRIEND_ALL);
  const out: number[] = [];
  for (const b of nw) if (TITLE_BIT_SET.has(b) && !pbinTest(p, b) && !out.includes(b)) out.push(b);
  return out;
}

const RIGHTS_ON = false;
const rightsDue = (_p: P): number[] => (RIGHTS_ON ? [] : []);

// ---- rules the client applies locally
export function onShopPurchase(g: Game, p: P, cards: [number, number][]): void {
  trunkAdd(g, p, cards.filter(([kind]) => kind === 0 || kind === 1).map(([, cid]) => cid), 1, "0x5212 tienda");
}

/** deck -> its right (PBIN, yo2pbinmap class 5): the structure decks in shop.json packs [deck, kind, right]. */
const SD_RIGHT = new Map((SHOP.packs as [number, number, number | null][]).filter(([, , b]) => b !== null).map(([d, , b]) => [d, b!]));
/** A structure deck's recipe bit (its right + 1): what buying it sets in 2008 (shop.ts SHOP_DECK_RECIPE); Edit Deck's
 *  Recipe list loads it as a ready deck. null for a deck the shop doesn't sell. */
export const recipeBit = (deckId: number): number | null => { const r = SD_RIGHT.get(int(deckId)); return r === undefined ? null : r + 1; };
/** A character that claimed its starter deck before the claim set the recipe (starter.ts) gets it, once: at the 0x3114
 *  that tells the client. */
export function starterRecipeFix(g: Game | null, p: P): void {
  const bit = PROGRESSION ? recipeBit(p.starter ?? 0) : null;
  if (bit === null || pbinTest(p, bit)) return;
  pbinSet(p, bit);
  g?.log(`[economia] ${(g.ctxAcct() ?? "?").slice(0, 8)} ${p.name || "?"}: recipe of starter deck ${p.starter} (bit ${bit}) set (fix-up)`);
}

export function onSdGet(g: Game, p: P, deckId: number, rightBit: number): number[] {
  // the client names both: only a right this character holds, for that deck, gives the deck (once: the right is spent)
  if (!rightBit || SD_RIGHT.get(deckId) !== rightBit || !pbinTest(p, rightBit)) {
    g.log(`[AVISO] [persistencia] 0x5400 SD_GET ${deckId} with right ${rightBit} it doesn't hold: refused`);
    return [];
  }
  const cards = sanitizeCards(g, structureDeckCards(deckId), `0x5401 SD_GET ${deckId}`);
  if (rightBit) { pbinSet(p, rightBit, false); pbinSet(p, rightBit + 1, true); }
  (p.claims ??= []).push(["sd", deckId, rightBit]);
  trunkAdd(g, p, cards, 1, "0x5401 SD_GET");
  return cards;
}

export function firstRight(p: P): number {
  const s = new Set<number>(p.pbin ?? []);
  if (s.has(0x246)) return 0x246;
  if (s.has(0x244)) return 0x244;
  return [...s].sort((a, b) => a - b).find((b) => b < 0x400 && pbinType(b) === 9) ?? 0;
}

export function onItemget(g: Game, p: P, kind: number, param: number): Uint8Array {
  if (kind === 4) {
    if (param > 0 && param < NPCBIN_MAX) { const e = npcbinGet(p, param); if (e[3] === 0) { e[3] = 1; npcbinSet(p, param, e); } }
    return itemgetResult([], []);
  }
  if (kind === 1) {
    const due = challengeRightsDue(p, g);
    if (due.length) pendingAdd(g, p, due, [], VIA_ANY, "挑戦権");
    const pkg = pendingTakeAll(p, VIA_ANY);
    return pkg ? itemgetResult(pkg.bits, pkg.cards) : itemgetResult([], []);
  }
  if (kind === 3) {
    let pkg = pendingPop(p, VIA_NPC);
    if (pkg === null) {
      const r = firstRight(p);
      if (r) {
        pbinSet(p, r, false);
        if ([4, 6, 8].includes(pbinType(r + 1)) || r === 0x244 || r === 0x246) {
          pkg = pendingAdd(g, p, [r + 1], [], VIA_NPC, `derecho ${r}`);
          if (pkg !== null) { const q = pendingList(p); q.splice(q.indexOf(pkg), 1); }
        }
      }
    }
    if (pkg === null) pkg = pendingTakeAll(p, VIA_ANY);
    return pkg ? itemgetResult(pkg.bits, pkg.cards) : itemgetResult([], []);
  }
  return itemgetResult([], []);
}

/** py on_title as research/mundo wraps it: staff titles only for GM accounts, and only titles you own. */
export function onTitle(p: P, title: number, g: Game | null = null): Uint8Array {
  const bit = int(title) & 0xffff;
  if ((bit === 225 || bit === 226) && !(g && g.isGm(g.ctxAcct()))) return new W().u32(1).bytes();
  if (bit !== 224 && !pbinTest(p, bit)) return new W().u32(1).bytes();
  const tid = titleIdFromBit(int(title) & 0xffff);
  if (tid === null) return new W().u32(1).bytes();
  p.rec.title = tid & 0xffff;
  return new W().u32(0).bytes();
}

// ---- end of an NPC duel
const NPC_IN_RECORD = true;
const NPC_MP_REWARD: Record<string, number> = { win: 0, lose: 0, draw: 0 };

// ---- card after a PvP (§14)
const PVP_CARD_ON = true;
const PVP_CARDS_DUEL = 1, PVP_CARDS_MATCH = 3;
export const PVP_CARD_KEY = "pvp_card_due";
const PVP_CARD_DUE_MAX = 5;
export const PVP_CARD_PACKS = Array.from({ length: 10 }, (_, i) => i + 1);

export function pvpCardEntry(g: Game, match = false, packs: number[] | null = null): P | null {
  if (!PVP_CARD_ON) return null;
  const ps = (packs ?? PVP_CARD_PACKS).map(int).filter((x) => x > 0 && x <= 0xffff);
  if (!ps.length) return null;
  return { packs: ps, n: match ? PVP_CARDS_MATCH : PVP_CARDS_DUEL, t: Math.floor(g.clock.time()) };
}
export function pvpCardOffer(g: Game, p: P, match = false, packs: number[] | null = null): P | null {
  const e = pvpCardEntry(g, match, packs);
  if (e) e.bound = !p.prize_unbound;
  if (e) { const due: P[] = (p[PVP_CARD_KEY] ??= []); due.push(e); due.splice(0, Math.max(0, due.length - PVP_CARD_DUE_MAX)); }
  return e;
}
export function pvpCardTake(p: P | null, pack: number): number {
  const due: P[] = p?.[PVP_CARD_KEY] ?? [];
  for (let i = due.length - 1; i >= 0; i--) {
    const e = due[i] && typeof due[i] === "object" ? due[i] : {};
    if ((e.packs ?? []).map(int).includes(int(pack))) {
      p!.prize_bind_pending = e.bound !== false;
      due.splice(i, 1);
      if (!due.length) delete p![PVP_CARD_KEY];
      try { return Math.max(1, Math.min(5, int(e.n ?? 1))); } catch { return 1; }
    }
  }
  return 0;
}
export function pvpCardGrant(g: Game, p: P, e: P, draw: (pack: number, n: number) => number[]): [number, number[]] {
  const pack = g.rng.choice(e.packs as number[]);
  const cards = draw(pack, e.n).slice(0, e.n).map(int);
  trunkAdd(g, p, cards, 1, "pvp");
  if (e.bound ?? !p.prize_unbound) bindCards(p, cards);
  return [pack, cards];
}

export const STAT_KEYS = ["tribute1", "tribute2", "tribute3", "fusions", "ss_grave", "ss_total", "trap_me", "trap_opp",
  "spell_me", "spell_opp", "effect_me", "effect_opp", "comeback_wins", "comeback_losses", "side_swaps"];

export function applyDuelStats(p: P, stats: P | null = null, lpLeft = 0, surrender: string | null = null): void {
  const r = (p.rec ??= {});
  for (const [k, v] of Object.entries(stats ?? {})) if (STAT_KEYS.includes(k)) { try { recInc(r, k, Math.max(0, int(v))); } catch { /* py: skip */ } }
  recInc(r, "lp_total", Math.max(0, int(lpLeft || 0)));
  if (surrender === "me") recInc(r, "surrender_me");
  else if (surrender === "opp") recInc(r, "surrender_opp");
}

// ---- score and LV after a PvP (rx/XP)
export const XP_ON = true;
const XP_BEGINNER_DUELS = 36, XP_WIN = 40, XP_WIN_HIGHER = 7, XP_MATCH_WIN_HIGHER = 1, XP_WIN_FAR = 1, XP_FAR_GAP = 4;
const XP_LOSE_LOWER = -16, XP_LOSE_SAME = -1, XP_LOSE_HIGHER = -1;
const XP_LEVEL_FLOORS = [0, 50, 150, 300, 500, 800, 1200, 1700, 2400, 3300, 4500, 6000, 8000, 10500, 13500, 17500, 22500,
  29500, 40000, 55000, 75000, 105000, 150000, 200000, 260000, 330000, 470000, 650000, 900000];

export function xpLevelForScore(score: number): number {
  let lv = 2;
  XP_LEVEL_FLOORS.forEach((floor, i) => { if (int(score) >= floor) lv = i + 2; });
  return lv;
}

export function xpGameDelta(myLv: number, oppLv: number, result: string, inMatch = false, matchResult: string | null = null, last = true): number {
  const gap = int(oppLv) - int(myLv);
  let d = 0;
  if (result === "win") { d += XP_WIN + (gap >= 1 ? XP_WIN_HIGHER : 0); if (!inMatch && gap >= XP_FAR_GAP) d += XP_WIN_FAR; }
  else if (result === "lose") { d += gap < 0 ? XP_LOSE_LOWER : gap === 0 ? XP_LOSE_SAME : 0; if (!inMatch && gap >= 1 && gap < XP_FAR_GAP) d += XP_LOSE_HIGHER; }
  if (inMatch && last) {
    if (matchResult === "win" && gap >= 1) d += XP_MATCH_WIN_HIGHER + (gap >= XP_FAR_GAP ? XP_WIN_FAR : 0);
    else if (matchResult === "lose" && gap >= 1 && gap < XP_FAR_GAP) d += XP_LOSE_HIGHER;
  }
  return d;
}

export function xpNewLevel(oldLv: number, oldScore: number, newScore: number, duels: number): number {
  oldLv = int(oldLv || 1);
  if (oldLv <= 1 && int(duels) < XP_BEGINNER_DUELS) return 1;
  const byNew = xpLevelForScore(newScore);
  if (oldLv > xpLevelForScore(oldScore)) return Math.max(byNew, oldLv);
  return byNew;
}

/** The XP guard (owner, 2026-11-04: "wins but not abusable win trading"), the MP rule (mpReward) applied to LV, per
 *  PvP game. `me`/`opp`: the two game accounts; `turns`/`secs`: the game's length; `now`: ms.
 *  - the same account on both sides: no XP either way ("self");
 *  - past ECON.PAIR_DAY_MAX full-XP games this UTC day against the same account: no XP either way ("pair cap"). The
 *    count is the character's (p.xp_pairs, D1 state_extras): LV is a character's;
 *  - a short game (under ECON.PVP_MIN_TURNS turns AND ECON.PVP_MIN_S seconds: an instant surrender, a disconnect, a
 *    time-out at once): nothing for the winner or a draw ("short"). The loser keeps its normal penalty (0 to -16, never
 *    a gain), as the rating rates a short forfeit's leaver: quitting at once still costs, and costs only the quitter.
 *    A short game doesn't count toward the pair cap. */
export type XpGuard = { me: string | null; opp: string | null; turns: number; secs: number; now: number };
const xpDay = (ms: number) => new Date(ms).toISOString().slice(0, 10);
function xpPairs(p: P, day: string): Record<string, number> {
  if (p.xp_pairs?.day !== day || !p.xp_pairs?.n || typeof p.xp_pairs.n !== "object") p.xp_pairs = { day, n: {} };
  return p.xp_pairs.n;
}
/** Why this game gives `result`'s side no XP ("self", "pair cap", "short"), or null for the normal delta. */
export function xpBlocked(p: P, guard: XpGuard, result: string): string | null {
  if (guard.me !== null && guard.me === guard.opp) return "self";
  if (guard.opp && int0(xpPairs(p, xpDay(guard.now))[guard.opp]) >= ECON.PAIR_DAY_MAX) return "pair cap";
  if (guard.turns < ECON.PVP_MIN_TURNS && guard.secs < ECON.PVP_MIN_S) return result === "lose" ? null : "short";
  return null;
}

export function pvpXp(p: P, oppLv: number, result: string, inMatch = false, matchResult: string | null = null, last = true, myLv: number | null = null,
  guard: XpGuard | null = null): P | null {
  if (!XP_ON) return null;
  const r = (p.rec ??= {});
  const why = guard ? xpBlocked(p, guard, result) : null;
  if (why) { const lv = int((r.lv ?? 1) || 1); return { delta: 0, score: int(r.score ?? 0), lv_old: lv, lv, why }; }
  if (guard?.opp && !(guard.turns < ECON.PVP_MIN_TURNS && guard.secs < ECON.PVP_MIN_S)) {
    const n = xpPairs(p, xpDay(guard.now)); n[guard.opp] = int0(n[guard.opp]) + 1;
  }
  const pv = (p.pvp ??= {});
  const nBefore = "n" in pv ? int(pv.n) : int(r.duels ?? 0);
  pv.n = nBefore + 1;
  const lvOld = int((r.lv ?? 1) || 1);
  const sOld = int(r.score ?? 0);
  const delta = xpGameDelta(myLv === null ? lvOld : myLv, oppLv, result, inMatch, matchResult, last);
  const sNew = Math.max(0, Math.min(sOld + delta, 0xffffffff));
  r.score = sNew;
  r.lv = Math.max(1, Math.min(255, xpNewLevel(lvOld, sOld, sNew, pv.n)));
  gradUpdate(p);   // ranking.ts: LV GRADUATION_LEVEL and enough qualifying opponents; for good, though LV can fall back
  return { delta, score: sNew, lv_old: lvOld, lv: r.lv };
}

/** py research/npcreglas install(): inside the end of an NPC duel with its flags on, npc_rewards / check_titles /
 *  rights_due give nothing (friendship and no_record replace them). Set by src/duel/npcRules.ts. */
export const NR_CTX: { on: { friendship?: boolean; no_record?: boolean } | null } = { on: null };

export function npcDuelResult(g: Game, p: P, npc0: number, result: string, turns = 0, lpLeft = 0, stats: P | null = null, surrender: string | null = null): P {
  const npc = int(npc0 || 0);
  const r = (p.rec ??= {});
  recInc(r, "duels");
  recInc(r, "turns", Math.max(0, int(turns || 0)));
  applyDuelStats(p, stats, lpLeft, surrender);
  if (result === "win") { recInc(r, "duels_won"); if (NPC_IN_RECORD) recInc(r, "wins"); }
  else if (result === "lose") { recInc(r, "duels_lost"); if (NPC_IN_RECORD) recInc(r, "losses"); }
  else { result = "draw"; recInc(r, "duels_drawn"); }
  if (NPC_MP_REWARD[result]) recInc(r, "mp", NPC_MP_REWARD[result]);
  p.prize_unbound = false;
  // Instant surrender must not be a faster MP source than playing a duel.
  if (!(surrender === "me" && int(turns || 0) < ECON.NPC_MIN_TURNS)) mpReward(g, p, result, int(turns || 0));
  let present = 0, pkg: P | null = null;
  if (npc > 0 && npc < NPCBIN_MAX) {
    let e = npcbinGet(p, npc);
    const oldB3 = e[3];
    e = npcResult(e, result);
    if (result === "win") e[3] = Math.min(Math.max(e[3], 1) + 1, 255);
    npcbinSet(p, npc, e);
    pendingClear(p, VIA_NPC);
    const [bits, cards] = result === "win" && !NR_CTX.on?.friendship ? npcRewards(p, npc, oldB3, e[3]) : [[], []];
    if (bits.length || cards.length) {
      pkg = pendingAdd(g, p, bits, cards, VIA_NPC, `NPC ${npc} b3 ${oldB3}->${e[3]}`);
      if (!p.prize_unbound) bindCards(p, cards);
      present = pkg ? 1 : 0;
    }
  }
  const extra = CHALLENGE_MODE === "earn" ? challengeRightsDue(p, g) : [];
  const tit = NR_CTX.on?.no_record ? [] : checkTitles(p, surrender, turns);
  for (const b of [...tit, ...(NR_CTX.on?.no_record ? [] : rightsDue(p))]) if (!extra.includes(b)) extra.push(b);
  if (extra.length) pendingAdd(g, p, extra, [], VIA_ANY, "fin de duelo");
  p.last_npc_end = { npc, result, present };
  return { pdu: playerDataUpdate(p, npc > 0 && npc < NPCBIN_MAX ? npc : null), present, pkg, titles: tit };
}

export function takePresent(p: P): number {
  const d = p.last_npc_end ?? {};
  const v = int((d.present ?? 0) || 0);
  d.present = 0;
  return v;
}

// ---- the handlers (py make_handlers): (c, data) with c.send
export type PH = ReturnType<typeof makeHandlers>;

export function makeHandlers(g: Game, opts: { shopPurchase?: (kind: number, id: number, n: number) => [number, number][];
                                              gameConn?: () => Conn | null; pidOf?: (slot: number) => number } = {}) {
  const pid = (slot: number) => (opts.pidOf ? int(opts.pidOf(int(slot) & 3)) : (int(slot) & 3) + 1);
  const log = (s: string) => g.log(s);
  const rearm = true;

  const h = {
    h_playerlist(c: Conn) {
      const st = g.loadState();
      const created = Object.keys(st.players ?? {}).filter((s) => !(s in (st.profiles ?? {})));
      const body = playerlist(st);
      if (created.length) g.saveState(st);
      c.send(0x3012, body);
    },
    h_gettrunk(c: Conn, data: Uint8Array) {
      const st = g.loadState();
      const slot = data.length ? data[0] : 0;
      setActiveSlot(st, slot);
      const p = profile(st, slot)!;
      const bad = sanitizeTrunk(p);
      if (bad.length) log(`[persistencia] B05: removed invalid ids from the trunk: ${bad.slice(0, 20)}`);
      g.saveState(st);
      // free mode: every card x3, a view built here; the character's own trunk is not touched (game/freemode.ts)
      for (const [mid, payload] of trunkMessages(isFree(c.sess) ? { trunk: freeTrunk(VALID) } : p)) c.send(mid, payload);
    },
    h_getpbin(c: Conn, data: Uint8Array) {
      const st = g.loadState();
      const p = profile(st, data.length ? data[0] : 0)!;
      pendingClear(p);
      starterRecipeFix(g, p);
      g.saveState(st);
      c.send(0x3114, pbinBytes(p, rankView(p)));
      c.send(0x4234, npcbinBytes(p));
    },
    h_pselect(c: Conn, data: Uint8Array) {
      const st = g.loadState();
      const slot = data.length > 1 ? data[1] : activeSlot(st);
      setActiveSlot(st, slot);
      const p = profile(st, slot)!;
      if (data.length && p.name) countryFromLang(p, data[0]);
      g.saveState(st);
      const body = pselectResult(p, pid(slot));
      c.ext.lang = data.length ? data[0] : 0;
      c.send(0x4101, body);
    },
    h_shop_bought(_c: Conn, cards: [number, number][]) {
      const st = g.loadState(); onShopPurchase(g, profile(st, activeSlot(st))!, cards); g.saveState(st);
    },
    /** 0x4902 opens a pack the 2008 client bought outside the game; there are none: s32 1 = no pack. */
    h_pack_open(c: Conn) {
      // py draws the pack (shared RNG) before it looks for a pass: the draw stays so later packs and seeds match py
      opts.shopPurchase?.(1, 1, 1);
      c.send(0x4903, new W().u32(1).u32(0).bytes());
    },
    h_sd_get(c: Conn, data: Uint8Array) {
      const [deck, bit] = data.length >= 4 ? [(data[0] << 8) | data[1], (data[2] << 8) | data[3]] : [0, 0];
      const st = g.loadState(); const p = profile(st, activeSlot(st))!;
      const cards = onSdGet(g, p, deck, bit); g.saveState(st);
      const w = new W().u32(cards.length ? 0 : 1);
      for (const cid of cards) w.u32(cid);
      c.send(0x5401, w.bytes());
    },
    h_itemget(c: Conn, data: Uint8Array) {
      const dv = new DataView(data.buffer, data.byteOffset, data.byteLength);
      const [kind, prm] = data.length >= 6 ? [dv.getUint16(0), dv.getUint32(2)] : [0, 0];
      const st = g.loadState(); const p = profile(st, activeSlot(st))!;
      const reply = onItemget(g, p, kind, prm); g.saveState(st);
      c.send(0x5205, reply);
    },
    h_title(c: Conn, data: Uint8Array) {
      const st = g.loadState(); const p = profile(st, activeSlot(st))!;
      const reply = onTitle(p, data.length >= 4 ? new DataView(data.buffer, data.byteOffset).getUint32(0) : 0, g); g.saveState(st);
      c.send(0x4175, reply);
    },
    h_avatar(c: Conn, data: Uint8Array) {
      if (data.length >= 20) {
        const st = g.loadState(); const p = profile(st, activeSlot(st))!;
        const style = new DataView(data.buffer, data.byteOffset).getUint32(0);
        outfitPicked(p, data.slice(4, 20));
        const parts = normalizeLook(p, data.slice(4, 20));
        setLook(p, parts, style === 0 ? 0 : 1);   // one look for both worlds
        g.saveState(st);
      }
      c.send(0x4171, new W().u32(0).bytes());
    },
    h_duel_deck(c: Conn, msgId: number, data: Uint8Array) { saveDuelDeck(g, c, msgId, data); },
    wallet() {
      const st = g.loadState();
      const [p, created] = profileCreated(st, activeSlot(st));
      if (created) g.saveState(st);
      const r = p.rec;
      return { mp: int(r.mp ?? 0) };
    },
    set_wallet(kv: { mp?: number }) {
      const st = g.loadState(), p = profile(st, activeSlot(st))!, r = p.rec;
      if (PROGRESSION) mpBalances(p); // preserve the old promotional subset when an admin adds earned MP
      if (kv.mp !== undefined) r.mp = Math.min(0xffffffff, Math.max(0, int(kv.mp)));
      if (PROGRESSION) mpBalances(p); // a reduction cannot leave stale bound MP to taint a later credit
      g.saveState(st);
      return { mp: r.mp };
    },
    player_data_update() {
      const st = g.loadState();
      const [p, created] = profileCreated(st, activeSlot(st));
      if (created) g.saveState(st);
      return playerDataUpdate(p);
    },
    my_slot: () => activeSlot(g.loadState()),
    my_pid: () => pid(activeSlot(g.loadState())),
    my_name: () => myName(g.loadState()),
  };
  return h;
}

/** selectpack removes the due entry before lobby persists the cards. Preserve its original reward eligibility. */
export function bindClaimedPrize(p: P, cards: number[]): void {
  let bound = p.prize_bind_pending;
  delete p.prize_bind_pending;
  if (bound === undefined) {
    const due: number[] = p.npc_card_due ?? [];
    const entries: P[] = p.npc_prize_binding ?? [];
    // selectpack removes the FIRST occurrence of its chosen pack, including when duplicate packs are queued.
    const missing = entries.findIndex((_, i) => {
      const after = entries.filter((_, j) => j !== i);
      return after.length === due.length && after.every((e, j) => e.pack === due[j]);
    });
    if (missing >= 0) bound = entries.splice(missing, 1)[0].bound;
    else bound = true; // old due cards lack verifiable paid-duel provenance
  }
  if (bound) bindCards(p, cards);
}
