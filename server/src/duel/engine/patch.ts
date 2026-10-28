// Fixes to ocgcore-wasm 0.1.2's message READER, as py's duelcore/parche_ocgcore.mts applies them (always on: py's
// vanilla profile; the YO2_PARCHE_SUM / YO2_AUDITAR_LECTOR switches are not ported):
//
// 1. MSG_SELECT_SUM (23, rituals and other "by sum" selections). The library reads
//      player u8, select_max u8, amount u32, min u32, max u32, selects[u32]{code u32, controller u8, location u8,
//      sequence u32, amount u32}, selects_must[u32]{same}
//    but the core writes the mandatory cards FIRST and each card with its full loc_info (controller u8, location u8,
//    sequence u32, position u32) before the u32 sum value. The byte it calls `select_max` is the MODE (0 = exact sum,
//    1 = "at least").
// 2. MSG_SHUFFLE_SET_CARD (36): location u8, n u8, n x loc_info (cards), n x loc_info (Xyz material or 0); the library
//    reads n as a u32. Returned in the library's shape: `from` = the card, `to` = the second loc_info.
// 3. MSG_MOVE (50): the library does not read the trailing u32 `reason`. Added.
//
// How: core.duelGetMessage is wrapped. During that (synchronous) call globalThis.DataView is a subclass that sees the
// FIRST view the library creates: the core's raw batch in WASM memory. Each broken message is read there with the
// right layout and, where the broken reader would run off, its counters are zeroed in the batch itself (they always
// fit) so the library yields empty lists. Then each one is replaced (or completed), in order. The buffer is the
// core's message buffer, rebuilt on the next call, so writing to it changes nothing in the duel.

const MSG_SELECT_SUM = 23;
const MSG_SHUFFLE_SET_CARD = 36;
const MSG_MOVE = 50;
const LOCATION_OVERLAY = 0x80;
const SUM_HEADER = 1 + 1 + 1 + 4 + 4 + 4; // type, player, select_max, amount, min, max
const LOC_INFO = 10;

export interface LocInfo {
  controller: 0 | 1;
  location: number;
  sequence: number;
  position: number;
  overlay_sequence?: number;
}

export interface SumCard extends LocInfo {
  code: number;
  /** the core's sum_param: low value (u16) and, if not 0, an alternative value (high u16) */
  amount: number;
}

export interface SelectSum {
  type: number;
  player: number;
  /** The byte the library calls "select_max": 0 = the sum must be EXACT, 1 = "at least" (select_mode) */
  select_max: number;
  amount: number;
  min: number;
  max: number;
  selects_must: SumCard[];
  selects: SumCard[];
}

class Reader {
  p: number;
  constructor(private dv: DataView, off: number, private end: number) {
    this.p = off;
  }
  private need(n: number) {
    if (this.p + n > this.end) throw new Error("mensaje corto");
  }
  u8() {
    this.need(1);
    return this.dv.getUint8(this.p++);
  }
  u32() {
    this.need(4);
    const v = this.dv.getUint32(this.p, true);
    this.p += 4;
    return v;
  }
  /** EDOPro loc_info (like the library's parseInfoLocation: an Xyz material carries its index in position) */
  loc(): LocInfo {
    const controller = this.u8() as 0 | 1;
    const location = this.u8();
    const sequence = this.u32();
    const position = this.u32();
    if (location & LOCATION_OVERLAY) {
      return { controller, location: location & ~LOCATION_OVERLAY, sequence, position: 1, overlay_sequence: position };
    }
    return { controller, location, sequence, position };
  }
}

/** Reads a MSG_SELECT_SUM in the EDOPro core's layout. `off` points at the type byte. */
export function readSelectSum(dv: DataView, off: number, len: number): SelectSum {
  const r = new Reader(dv, off + 1, off + len);
  const card = (): SumCard => {
    const code = r.u32();
    const loc = r.loc();
    return { code, ...loc, amount: r.u32() };
  };
  const player = r.u8();
  const select_max = r.u8();
  const amount = r.u32();
  const min = r.u32();
  const max = r.u32();
  const selects_must = Array.from({ length: r.u32() }, card);
  const selects = Array.from({ length: r.u32() }, card);
  return { type: MSG_SELECT_SUM, player, select_max, amount, min, max, selects_must, selects };
}

/** MSG_SHUFFLE_SET_CARD: location u8, n u8, n x loc_info (cards), n x loc_info (Xyz material or 0). */
export function readShuffleSetCard(dv: DataView, off: number, len: number) {
  const r = new Reader(dv, off + 1, off + len);
  const location = r.u8();
  const n = r.u8();
  const from = Array.from({ length: n }, () => r.loc());
  const to = Array.from({ length: n }, () => r.loc());
  return { type: MSG_SHUFFLE_SET_CARD, location, cards: from.map((f, i) => ({ from: f, to: to[i] })) };
}

/** A fix for one message of the batch: `obj` replaces the library's; `extra` is added to it. */
type Fix = { type: number; obj?: Record<string, unknown>; extra?: Record<string, unknown> };

/** Walks a core batch ([i32 length][message]...) and returns the fixes in order; with `neutralize`, zeroes in the
 * batch the counters the broken reader would misread. */
export function fixBatch(dv: DataView, neutralize: boolean): Fix[] {
  const out: Fix[] = [];
  let p = 0;
  while (p + 4 <= dv.byteLength) {
    const len = dv.getInt32(p, true);
    p += 4;
    if (len <= 0 || p + len > dv.byteLength) break;
    const type = dv.getUint8(p);
    if (type === MSG_SELECT_SUM && len >= SUM_HEADER + 8) {
      out.push({ type, obj: readSelectSum(dv, p, len) as unknown as Record<string, unknown> });
      if (neutralize) {
        dv.setUint32(p + SUM_HEADER, 0, true);
        dv.setUint32(p + SUM_HEADER + 4, 0, true);
      }
    } else if (type === MSG_SHUFFLE_SET_CARD && len >= 6) {
      out.push({ type, obj: readShuffleSetCard(dv, p, len) });
      if (neutralize) dv.setUint32(p + 2, 0, true); // the library reads a u32 card count here
    } else if (type === MSG_MOVE && len === 1 + 4 + 2 * LOC_INFO + 4) {
      out.push({ type, extra: { reason: dv.getUint32(p + len - 4, true) } });
    }
    p += len;
  }
  return out;
}

// ---------------------------------------------------------------------------------------------------------------------
// SELECT_SUM for a bot: bot.ts only looks for EXACT sums and knows nothing of "at least" mode (parche_ocgcore.mts
// elegirSuma).
// ---------------------------------------------------------------------------------------------------------------------
const values = (a: number) => {
  const v1 = a & 0xffff;
  const v2 = (a >>> 16) & 0xffff;
  return v2 && v2 !== v1 ? [v1, v2] : [v1];
};

/** Is the selection valid as ocgcore checks it? Exact: some choice of values sums to `target`. At least: sum >= target
 * with no spare card (without the one worth least it no longer reaches: check_with_sum_greater_limit). */
function valid(vals: number[][], target: number, exact: boolean, lo: number, hi: number): boolean {
  if (vals.length < Math.max(lo, 1) || (hi && vals.length > hi)) return false;
  let states: [number, number][] = [[0, Infinity]];
  for (const opts of vals) states = states.flatMap(([s, m]) => opts.map((v) => [s + v, Math.min(m, v)] as [number, number]));
  return states.some(([s, m]) => (exact ? s === target : s >= target && s - m < target));
}

/** Response indices (mandatory first, like bot.ts/brain.py) or null if no selection is valid. Prefers the fewest
 * cards; depth-first with pruning (a ritual's lists are short). */
export function pickSum(w: SelectSum): number[] | null {
  const must = w.selects_must.map((c) => values(c.amount));
  const sel = w.selects.map((c) => values(c.amount));
  const target = w.amount & 0xffff;
  const exact = !w.select_max;
  const lo = w.min || 0;
  const hi = w.max || 0;
  const n = must.length;
  let best: number[] | null = null;
  let steps = 0;
  const dfs = (i: number, chosen: number[], sum: number) => {
    if (++steps > 200000 || (best && chosen.length >= best.length)) return;
    const vals = [...must, ...chosen.map((k) => sel[k])];
    if (chosen.length + n > 0 && valid(vals, target, exact, lo, hi)) {
      best = [...chosen];
      return;
    }
    // `sum` = the least the chosen cards add up to: once it reaches the target, more cards cannot help in "at least"
    // (one would be spare), nor in "exact" once it is over
    if (i >= sel.length || (!exact && sum >= target) || (exact && sum > target)) return;
    dfs(i + 1, [...chosen, i], sum + Math.min(...sel[i]));
    dfs(i + 1, chosen, sum);
  };
  dfs(0, [], must.reduce((t, o) => t + Math.min(...o), 0));
  if (best === null) return null;
  return [...Array(n).keys(), ...(best as number[]).map((k) => k + n)];
}

// ---------------------------------------------------------------------------------------------------------------------
interface CoreWithMessages {
  duelGetMessage(handle: unknown): { type: number }[];
}

const MARK = Symbol.for("yo2.parche_select_sum");

/** Installs the fix on the core (idempotent). */
export function installSelectSumPatch(core: CoreWithMessages): boolean {
  const c = core as CoreWithMessages & { [MARK]?: boolean };
  if (c[MARK]) return true;
  const original = c.duelGetMessage;
  const DV = globalThis.DataView;
  const Base = DV as unknown as new (buffer: ArrayBufferLike, byteOffset?: number, byteLength?: number) => DataView;
  let fixes: Fix[] | null = null;
  class Spy extends Base {
    constructor(buffer: ArrayBufferLike, byteOffset?: number, byteLength?: number) {
      super(buffer, byteOffset, byteLength);
      if (fixes === null) {
        fixes = [];
        try {
          fixes = fixBatch(this as DataView, true);
        } catch (e) {
          console.error(`[parche lector] no pude leer el lote: ${(e as Error).message}`);
        }
      }
    }
  }
  c.duelGetMessage = function (handle: unknown) {
    fixes = null;
    (globalThis as { DataView: typeof DataView }).DataView = Spy as unknown as typeof DataView;
    let msgs: { type: number }[];
    try {
      msgs = original.call(this, handle);
    } finally {
      (globalThis as { DataView: typeof DataView }).DataView = DV;
    }
    const fixed = fixes as Fix[] | null;
    fixes = null;
    if (!fixed || !fixed.length) return msgs;
    const queue = new Map<number, Fix[]>();
    for (const a of fixed) queue.set(a.type, [...(queue.get(a.type) ?? []), a]);
    return msgs.map((m) => {
      const a = queue.get(m.type)?.shift();
      if (!a) return m;
      return (a.obj ?? { ...m, ...a.extra }) as { type: number };
    });
  };
  c[MARK] = true;
  return true;
}
