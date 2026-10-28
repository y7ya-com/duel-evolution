// The 32 B of 0x3003 AUTH (py research/cuentas/cifrado.py): Blowfish-ECB(16 B user field + MD5(user + challenge +
// password)) with the exe's key. The account id is sha256 of the canonical blob (zeros after the user's NUL), 16 hex.
import { createHash } from "node:crypto";

const KEY = Buffer.from(
  "017f5642869a6b827519efd00273145f2bc992ac239391da8627881e72940d3763fc079a14089196843bbc76280a1f39655cdd217b98183c", "hex");

/** n 32-bit words of pi's fractional part (Blowfish's initial tables), Machin's formula on BigInt. */
function piWords(n: number): number[] {
  const bits = BigInt(32 * n + 64);
  const one = 1n << (bits + 32n);
  const atanInv = (x: bigint) => {
    let s = 0n, t = one / x, k = 1n, sign = 1n;
    const x2 = x * x;
    while (t) { s += sign * (t / k); t /= x2; k += 2n; sign = -sign; }
    return s;
  };
  const pi = (16n * atanInv(5n) - 4n * atanInv(239n)) >> 32n;
  const frac = pi - (3n << bits);
  const out: number[] = [];
  for (let i = 0; i < n; i++) out.push(Number((frac >> (bits - 32n * BigInt(i + 1))) & 0xffffffffn));
  return out;
}

class Blowfish {
  P: Uint32Array;
  S: Uint32Array[];
  constructor(key: Uint8Array) {
    const w = piWords(18 + 1024);
    this.P = Uint32Array.from(w.slice(0, 18));
    this.S = [0, 1, 2, 3].map((i) => Uint32Array.from(w.slice(18 + 256 * i, 18 + 256 * (i + 1))));
    let j = 0;
    for (let i = 0; i < 18; i++) {
      let v = 0;
      for (let k = 0; k < 4; k++) { v = ((v << 8) | key[j % key.length]) >>> 0; j++; }
      this.P[i] ^= v;
    }
    let l = 0, r = 0;
    for (let i = 0; i < 18; i += 2) { [l, r] = this.enc(l, r); this.P[i] = l; this.P[i + 1] = r; }
    for (const s of this.S) for (let i = 0; i < 256; i += 2) { [l, r] = this.enc(l, r); s[i] = l; s[i + 1] = r; }
  }
  private f(x: number) {
    const [s0, s1, s2, s3] = this.S;
    return ((((s0[x >>> 24] + s1[(x >>> 16) & 0xff]) >>> 0) ^ s2[(x >>> 8) & 0xff]) + s3[x & 0xff]) >>> 0;
  }
  enc(l: number, r: number): [number, number] {
    for (let i = 0; i < 16; i++) { l = (l ^ this.P[i]) >>> 0; r = (r ^ this.f(l)) >>> 0; [l, r] = [r, l]; }
    [l, r] = [r, l];
    return [(l ^ this.P[17]) >>> 0, (r ^ this.P[16]) >>> 0];
  }
  dec(l: number, r: number): [number, number] {
    for (let i = 17; i > 1; i--) { l = (l ^ this.P[i]) >>> 0; r = (r ^ this.f(l)) >>> 0; [l, r] = [r, l]; }
    [l, r] = [r, l];
    return [(l ^ this.P[0]) >>> 0, (r ^ this.P[1]) >>> 0];
  }
  ecb(data: Uint8Array, fn: (l: number, r: number) => [number, number]): Uint8Array {
    const out = new Uint8Array(data.length);
    const di = new DataView(data.buffer, data.byteOffset, data.byteLength), dv = new DataView(out.buffer);
    for (let k = 0; k < data.length; k += 8) {
      const [l, r] = fn.call(this, di.getUint32(k), di.getUint32(k + 4));
      dv.setUint32(k, l); dv.setUint32(k + 4, r);
    }
    return out;
  }
}

let bf: Blowfish | null = null;
const cipher = () => (bf ??= new Blowfish(KEY));

const md5 = (...parts: Uint8Array[]) => { const h = createHash("md5"); for (const p of parts) h.update(p); return new Uint8Array(h.digest()); };

/** The 32 B a client sends for this user and password (canonical form). cp1252 ≈ latin1 for the test logins. */
export function encrypt(user: string, password: string, challenge = new Uint8Array(16)): Uint8Array {
  const u = Buffer.from(user, "latin1"), c = Buffer.from(password, "latin1");
  const raw = new Uint8Array(16); raw.set(u);
  const body = new Uint8Array(32); body.set(raw); body.set(md5(u, challenge, c), 16);
  return cipher().ecb(body, cipher().enc);
}

export function canonical(blob: Uint8Array): Uint8Array {
  const plain = cipher().ecb(blob.subarray(0, 32), cipher().dec);
  let n = plain.indexOf(0);
  if (n < 0 || n > 16) n = 16;
  const body = new Uint8Array(32);
  body.set(plain.subarray(0, n));
  body.set(plain.subarray(16, 32), 16);
  return cipher().ecb(body, cipher().enc);
}

export const legacyId = (blob: Uint8Array) => createHash("sha256").update(blob.subarray(0, 32)).digest("hex").slice(0, 16);
export const accountId = (blob: Uint8Array) => legacyId(canonical(blob));

/** Blowfish-ECB decrypt with the exe's key (py research/persistencia/duelpass.norm for DUELPASS codes). */
export const decryptEcb = (b: Uint8Array): Uint8Array => cipher().ecb(b, cipher().dec);
