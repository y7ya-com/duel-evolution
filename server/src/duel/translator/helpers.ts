// Module-level functions of py translator.py: the client's hand/monster shuffle (MSVC LCG + Fisher-Yates), SELECT_SUM
// arithmetic, automatic SELECT_PLACE and brain.declarable (ANNOUNCE_CARD opcodes).
import type { PyRandom } from "../../util/pyrandom.ts";
import type { CardMap } from "./cardmap.ts";
import { _LCG_A, _LCG_AINV, _LCG_C, HAND_SEED_MAX_N, HAND_SEED_TRIES, OCG_MZONE, OCG_SZONE } from "./consts.ts";
import { zoneOrder, type PlaceOrder } from "../zones.ts";

const lcg = (s: number): number => (Math.imul(s, _LCG_A) + _LCG_C) >>> 0;

/** Order the client's 0x4e leaves with this seed: new_hand[k] = old_hand[perm[k]]. */
export function client_hand_perm(seed: number, n: number): number[] {
  let s = seed >>> 0, u = n;
  const arr = Array.from({ length: n }, (_, i) => i);
  while (u > 1) {
    s = lcg(s);
    const j = (((s >>> 16) & 0x7fff) * u) >> 15;
    [arr[j], arr[u - 1]] = [arr[u - 1], arr[j]];
    u -= 1;
  }
  return arr;
}

const okKey = (k: any, w: any): boolean => !w || k === w;

/** 32-bit seed with which the client's 0x4e turns `old` into `want` -> [seed, perm] or null. */
export function hand_seed_for(old: any[], want: any[], rng: PyRandom, tries = HAND_SEED_TRIES): [number, number[]] | null {
  const n = old.length;
  if (n < 2) return [rng.getrandbits(32), Array.from({ length: n }, (_, i) => i)];
  if (n > HAND_SEED_MAX_N) return null;
  const first: number[] = [];
  for (let j = 0; j < n; j++) if (okKey(old[j], want[n - 1])) first.push(j);
  if (!first.length) return null;
  for (let t = 0; t < tries; t++) {
    const j = rng.choice(first);
    const r = rng.randrange(Math.floor((j * 32768 + n - 1) / n), Math.floor(((j + 1) * 32768 + n - 1) / n));
    const hi = rng.getrandbits(1);
    const lo = rng.getrandbits(16);
    const s1 = hi * 2 ** 31 + r * 65536 + lo;
    const seed = Math.imul((s1 - _LCG_C) | 0, _LCG_AINV | 0) >>> 0;
    let s = seed, u = n, broke = false;
    const arr = Array.from({ length: n }, (_, i) => i);
    while (u > 1) {
      s = lcg(s);
      const jj = (((s >>> 16) & 0x7fff) * u) >> 15;
      [arr[jj], arr[u - 1]] = [arr[u - 1], arr[jj]];
      if (!okKey(old[arr[u - 1]], want[u - 1])) { broke = true; break; }
      u -= 1;
    }
    if (!broke && okKey(old[arr[0]], want[0])) return [seed, arr];
  }
  return null;
}

export const client_monst_perm = client_hand_perm;

/** Seed with which the client's 0x49 deals the cards as `want` (want[i] = index the i-th goes to). */
export function monst_seed_for(want: number[], rng: PyRandom, tries = 200000): number {
  const n = want.length;
  for (let t = 0; t < tries; t++) {
    const seed = rng.getrandbits(32);
    const p = client_monst_perm(seed, n);
    if (p.length === want.length && p.every((v, i) => v === want[i])) return seed;
  }
  return rng.getrandbits(32);
}

// --- §33 SELECT_SUM
export type SumVals = number[];

export function sum_vals(amount: number): SumVals {
  const v1 = amount & 0xffff, v2 = (amount >>> 16) & 0xffff;
  return v2 && v2 !== v1 ? [v1, v2] : [v1];
}

type St = [number, number, number];
const key = (s: St) => `${s[0]},${s[1]},${s[2]}`;
const addSt = (m: Map<string, St>, s: St) => { m.set(key(s), s); };

function _sum_states(vals: SumVals[], target: number, exact: boolean, start: Map<string, St> | null): Map<string, St> {
  let states = start !== null ? new Map(start) : new Map<string, St>([["0,1073741824,0", [0, 1 << 30, 0]]]);
  for (const opts of vals) {
    const nxt = new Map(states);
    for (const [s, m, c] of states.values()) {
      if (!exact && s >= target) continue;
      for (const v of opts) {
        if (exact && s + v > target) continue;
        addSt(nxt, [s + v, Math.min(m, v), c + 1]);
      }
    }
    states = nxt;
  }
  return states;
}

function _sum_state_ok(s: number, m: number, c: number, target: number, exact: boolean, lo: number, hi: number): boolean {
  if (c < Math.max(lo, 1) || (hi && c > hi)) return false;
  return exact ? s === target : s >= target && s - m < target;
}

function expand(vals: SumVals[]): Map<string, St> {
  let states = new Map<string, St>([["0,1073741824,0", [0, 1 << 30, 0]]]);
  for (const opts of vals) {
    const nxt = new Map<string, St>();
    for (const [s, m, c] of states.values()) for (const v of opts) addSt(nxt, [s + v, Math.min(m, v), c + 1]);
    states = nxt;
  }
  return states;
}

export function sum_valido(vals: SumVals[], target: number, exact: boolean, lo = 0, hi = 0): boolean {
  for (const [s, m, c] of expand(vals).values()) if (_sum_state_ok(s, m, c, target, exact, lo, hi)) return true;
  return false;
}

export function sum_completable(chosen: SumVals[], rest: SumVals[], target: number, exact: boolean, lo = 0, hi = 0): boolean {
  let start = expand(chosen);
  if (exact) start = new Map([...start].filter(([, x]) => x[0] <= target));
  for (const [s, m, c] of _sum_states(rest, target, exact, start).values()) {
    if (_sum_state_ok(s, m, c, target, exact, lo, hi)) return true;
  }
  return false;
}

/** SELECT_PLACE: 1 bits = zones NOT available, relative to who chooses. The first free own zones, in `order`
 *  (src/duel/zones.ts: the centre first; "py" = py's first free zone from the left). */
export function _free_places(mask: number, count: number, order: PlaceOrder = "centre"): { player: number; location: number; sequence: number }[] {
  const out: { player: number; location: number; sequence: number }[] = [];
  for (const [side, player] of [[0, 0], [1, 1]]) {
    for (const [base, location] of [[0, OCG_MZONE], [8, OCG_SZONE]]) {
      for (const seq of zoneOrder(5, order)) {
        if (out.length >= count) return out;
        if (!bit(mask, side * 16 + base + seq)) out.push({ player, location, sequence: seq });
      }
    }
  }
  return out;
}

/** mask & (1 << n) != 0 for an unsigned mask */
export const bit = (mask: number, n: number): boolean => Math.floor(mask / 2 ** n) % 2 === 1;

// --- brain.declarable (B42 ANNOUNCE_CARD): the EDOPro opcode stack over a card
const OPN = ["ADD", "SUB", "MUL", "DIV", "AND", "OR", "NEG", "NOT", "BAND", "BOR", "BNOT", "BXOR", "LSHIFT", "RSHIFT",
  "ALLOW_ALIASES", "ALLOW_TOKENS", "ISCODE", "ISSETCARD", "ISTYPE", "ISRACE", "ISATTRIBUTE", "GETCODE", "GETSETCARD",
  "GETTYPE", "GETRACE", "GETATTRIBUTE"];
const OPI = [0x0, 0x1, 0x2, 0x3, 0x4, 0x5, 0x6, 0x7, 0x8, 0x9, 0x10, 0x11, 0x12, 0x13, 0x14, 0x15, 0x100, 0x101, 0x102,
  0x103, 0x104, 0x105, 0x106, 0x107, 0x108, 0x109];
const OP_BY_VALUE = new Map<bigint, string>(OPN.map((n, k) => [(0x40000000n + BigInt(OPI[k])) << 32n, n]));
const OP_ALLOW_ALIASES = (0x40000000n + 0x14n) << 32n, OP_ALLOW_TOKENS = (0x40000000n + 0x15n) << 32n;
const TYPE_TOKEN = 0x4000n;

const toBig = (x: unknown): bigint => {
  if (typeof x === "bigint") return x;
  if (typeof x === "string") return BigInt(x.startsWith("#big:") ? x.slice(5) : x);
  return BigInt(Math.trunc(Number(x)));
};
const floorDiv = (x: bigint, y: bigint): bigint => {
  const q = x / y;
  return (x % y !== 0n) && ((x < 0n) !== (y < 0n)) ? q - 1n : q;
};

/** translator._declarable: does the card satisfy ocgcore's opcodes? (true when it cannot be checked) */
export function _declarable(cm: CardMap, code: number, opcodes: unknown[] | null | undefined): boolean {
  if (!opcodes || !opcodes.length) return true;
  const c = cm.decl_card(code);
  if (c === null) return true;
  const ops = opcodes.map(toBig);
  if (c.type & TYPE_TOKEN || c.alias) {
    const allowAlias = ops.includes(OP_ALLOW_ALIASES), allowTok = ops.includes(OP_ALLOW_TOKENS);
    if ((c.type & TYPE_TOKEN && !allowTok) || (c.alias && !allowAlias)) return false;
  }
  const st: bigint[] = [];
  const pop = () => (st.length ? st.pop()! : 0n);
  const b = (v: boolean) => (v ? 1n : 0n);
  const code_ = BigInt(c.code);
  for (const op of ops) {
    const name = OP_BY_VALUE.get(op);
    if (name === undefined) { st.push(op); continue; }
    if (["ADD", "SUB", "MUL", "DIV", "AND", "OR", "BAND", "BOR", "BXOR", "LSHIFT", "RSHIFT"].includes(name)) {
      const y = pop(), x = pop();
      st.push(name === "ADD" ? x + y : name === "SUB" ? x - y : name === "MUL" ? x * y : name === "DIV" ? (y ? floorDiv(x, y) : 0n)
        : name === "AND" ? b(!!x && !!y) : name === "OR" ? b(!!x || !!y) : name === "BAND" ? x & y : name === "BOR" ? x | y
          : name === "BXOR" ? x ^ y : name === "LSHIFT" ? x << y : x >> y);
    } else if (name === "NEG") st.push(-pop());
    else if (name === "NOT") st.push(b(!pop()));
    else if (name === "BNOT") st.push(~pop());
    else if (name === "ISCODE") { const v = pop(); st.push(b(code_ === v || c.alias === v)); }
    else if (name === "ISSETCARD") {
      const v = pop();
      let sc = c.setcode, hit = false;
      while (sc) {
        const part = sc & 0xffffn;
        if (part && (part & 0xfffn) === (v & 0xfffn) && (part & v) === v) hit = true;
        sc >>= 16n;
      }
      st.push(b(hit));
    } else if (name === "ISTYPE") st.push(b(!!(c.type & pop())));
    else if (name === "ISRACE") st.push(b(!!(c.race & pop())));
    else if (name === "ISATTRIBUTE") st.push(b(!!(c.attribute & pop())));
    else if (name === "GETCODE") st.push(code_);
    else if (name === "GETTYPE") st.push(c.type);
    else if (name === "GETRACE") st.push(c.race);
    else if (name === "GETATTRIBUTE") st.push(c.attribute);
    else if (name === "GETSETCARD") st.push(c.setcode);
  }
  return st.length === 1 && st[0] !== 0n;
}
