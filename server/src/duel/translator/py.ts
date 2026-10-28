// Small Python-semantics helpers for the translator port (py research/traductor/translator.py).

/** Python truthiness: None/False/0/""/empty list/dict/set are false. */
export function truthy(v: unknown): boolean {
  if (v == null || v === false || v === 0 || v === "" || v === 0n) return false;
  if (typeof v === "number") return !Number.isNaN(v);
  if (Array.isArray(v)) return v.length > 0;
  if (v instanceof Map || v instanceof Set) return v.size > 0;
  if (v instanceof Uint8Array) return v.length > 0;
  if (typeof v === "object") return Object.keys(v as object).length > 0;
  return true;
}

/** dict.get(k, d): the default only when the key is missing (a JSON null stays None). */
export function get(o: any, k: string, d: any): any {
  return o != null && Object.prototype.hasOwnProperty.call(o, k) ? o[k] : d;
}

/** Python round() to an int (banker's rounding). */
export function pyRound(x: number): number {
  const f = Math.floor(x), diff = x - f;
  if (diff > 0.5) return f + 1;
  if (diff < 0.5) return f;
  return f % 2 === 0 ? f : f + 1;
}

/** int(x) of a JSON number / numeric string. */
export function int(x: any): number {
  if (typeof x === "bigint") return Number(x);
  if (typeof x === "string") return parseInt(x, 10);
  if (typeof x === "boolean") return x ? 1 : 0;
  return Math.trunc(Number(x));
}

/** x >> n for non-negative ints that may exceed 32 bits. */
export const shr = (x: number, n: number): number => Math.floor(x / 2 ** n);
/** x & (2**n - 1) for non-negative ints that may exceed 32 bits. */
export const low = (x: number, n: number): number => x - Math.floor(x / 2 ** n) * 2 ** n;
/** x & 0xffffffff (Python, any int < 2**53). */
export const u32 = (x: number): number => x >>> 0;

export const isInt = (v: unknown): v is number => typeof v === "number" && Number.isInteger(v);

export function popcount(x: number): number {
  let n = 0;
  for (x >>>= 0; x; x >>>= 1) n += x & 1;
  return n;
}

/** Equality of the (atk, def) / (player, uid) pairs the translator keeps (None = null). */
export function eqPair(a: readonly any[] | null | undefined, b: readonly any[] | null | undefined): boolean {
  if (a == null || b == null) return a == null && b == null;
  return a.length === b.length && a.every((v, i) => v === b[i]);
}

export function concat(...parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let o = 0;
  for (const p of parts) { out.set(p, o); o += p.length; }
  return out;
}

/** struct.pack(">4H", a, b, c, d) */
export function pack4H(a: number, b: number, c: number, d: number): Uint8Array {
  const o = new Uint8Array(8);
  [a, b, c, d].forEach((v, i) => { o[2 * i] = (v >> 8) & 0xff; o[2 * i + 1] = v & 0xff; });
  return o;
}

/** struct.pack(">BIIII", a, b, c, d, e) */
export function packBIIII(a: number, b: number, c: number, d: number, e: number): Uint8Array {
  const o = new Uint8Array(17);
  const dv = new DataView(o.buffer);
  o[0] = a & 0xff;
  [b, c, d, e].forEach((v, i) => dv.setUint32(1 + 4 * i, v >>> 0));
  return o;
}

/** struct.unpack(">nI", data[:4n]) */
export function unpackU32(data: Uint8Array, n: number): number[] {
  const dv = new DataView(data.buffer, data.byteOffset, data.byteLength);
  return Array.from({ length: n }, (_, i) => dv.getUint32(4 * i));
}

export const hex = (b: Uint8Array): string => Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");

/** Python-ish repr for log lines (not compared). */
export const repr = (v: unknown): string => {
  try { return JSON.stringify(v, (_k, x) => (typeof x === "bigint" ? x.toString() : x)); } catch { return String(v); }
};
