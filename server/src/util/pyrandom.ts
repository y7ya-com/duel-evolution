// CPython's `random` (3.12): MT19937 seeded like random.seed(int), plus the methods the py server uses, so a seeded
// parity run draws the same packs, shuffles, RPS and duel seeds as py does (py paridad/semilla: random.seed(1)).
const N = 624, M = 397;

export class PyRandom {
  private mt = new Uint32Array(N);
  private mti = N + 1;

  constructor(seed?: number | bigint) { this.seed(seed ?? BigInt(Date.now()) * 1000003n + BigInt(Math.floor(Math.random() * 2 ** 32))); }

  private initGenrand(s: number) {
    const mt = this.mt;
    mt[0] = s >>> 0;
    for (let i = 1; i < N; i++) {
      const p = mt[i - 1] ^ (mt[i - 1] >>> 30);
      mt[i] = (Math.imul(1812433253, p) + i) >>> 0;
    }
    this.mti = N;
  }

  private initByArray(key: number[]) {
    const mt = this.mt;
    this.initGenrand(19650218);
    let i = 1, j = 0;
    for (let k = Math.max(N, key.length); k; k--) {
      const p = mt[i - 1] ^ (mt[i - 1] >>> 30);
      mt[i] = ((mt[i] ^ Math.imul(p, 1664525)) + key[j] + j) >>> 0;
      i++; j++;
      if (i >= N) { mt[0] = mt[N - 1]; i = 1; }
      if (j >= key.length) j = 0;
    }
    for (let k = N - 1; k; k--) {
      const p = mt[i - 1] ^ (mt[i - 1] >>> 30);
      mt[i] = ((mt[i] ^ Math.imul(p, 1566083941)) - i) >>> 0;
      i++;
      if (i >= N) { mt[0] = mt[N - 1]; i = 1; }
    }
    mt[0] = 0x80000000;
  }

  /** random.seed(int): key = 32-bit words of abs(n), least significant first. */
  seed(n: number | bigint) {
    let v = BigInt(n);
    if (v < 0n) v = -v;
    const key: number[] = [];
    while (v > 0n) { key.push(Number(v & 0xffffffffn)); v >>= 32n; }
    if (!key.length) key.push(0);
    this.initByArray(key);
  }

  genrandUint32(): number {
    const mt = this.mt;
    if (this.mti >= N) {
      let kk = 0, y: number;
      for (; kk < N - M; kk++) { y = (mt[kk] & 0x80000000) | (mt[kk + 1] & 0x7fffffff); mt[kk] = mt[kk + M] ^ (y >>> 1) ^ (y & 1 ? 0x9908b0df : 0); }
      for (; kk < N - 1; kk++) { y = (mt[kk] & 0x80000000) | (mt[kk + 1] & 0x7fffffff); mt[kk] = mt[kk + (M - N)] ^ (y >>> 1) ^ (y & 1 ? 0x9908b0df : 0); }
      y = (mt[N - 1] & 0x80000000) | (mt[0] & 0x7fffffff);
      mt[N - 1] = mt[M - 1] ^ (y >>> 1) ^ (y & 1 ? 0x9908b0df : 0);
      this.mti = 0;
    }
    let y = mt[this.mti++];
    y ^= y >>> 11;
    y ^= (y << 7) & 0x9d2c5680;
    y ^= (y << 15) & 0xefc60000;
    y ^= y >>> 18;
    return y >>> 0;
  }

  random(): number {
    const a = this.genrandUint32() >>> 5, b = this.genrandUint32() >>> 6;
    return (a * 67108864.0 + b) * (1.0 / 9007199254740992.0);
  }

  /** getrandbits(k) for k ≤ 53 as a number (k > 32 builds from little-endian words like CPython). */
  getrandbits(k: number): number {
    if (k <= 32) return k === 0 ? 0 : this.genrandUint32() >>> (32 - k);
    return Number(this.getrandbitsBig(k));
  }

  getrandbitsBig(k: number): bigint {
    let out = 0n, shift = 0n;
    for (let left = k; left > 0; left -= 32) {
      let r = this.genrandUint32();
      if (left < 32) r >>>= 32 - left;
      out |= BigInt(r) << shift;
      shift += 32n;
    }
    return out;
  }

  randbelow(n: number): number {
    const k = n === 0 ? 0 : Math.floor(Math.log2(n)) + 1;
    let r = this.getrandbits(k);
    while (r >= n) r = this.getrandbits(k);
    return r;
  }

  randrange(start: number, stop?: number): number {
    if (stop === undefined) {
      if (start <= 0) throw new RangeError("empty range for randrange()");
      return this.randbelow(start);
    }
    const width = stop - start;
    if (width <= 0) throw new RangeError("empty range for randrange()");
    return start + this.randbelow(width);
  }

  randint(a: number, b: number): number { return this.randrange(a, b + 1); }

  choice<T>(seq: readonly T[]): T {
    if (!seq.length) throw new RangeError("Cannot choose from an empty sequence");
    return seq[this.randbelow(seq.length)];
  }

  shuffle<T>(x: T[]): void {
    for (let i = x.length - 1; i > 0; i--) {
      const j = this.randbelow(i + 1);
      [x[i], x[j]] = [x[j], x[i]];
    }
  }

  sample<T>(population: readonly T[], k: number): T[] {
    const n = population.length;
    if (k < 0 || k > n) throw new RangeError("Sample larger than population or is negative");
    const result: T[] = new Array(k);
    let setsize = 21;
    if (k > 5) setsize += 4 ** Math.ceil(Math.log(k * 3) / Math.log(4));
    if (n <= setsize) {
      const pool = population.slice();
      for (let i = 0; i < k; i++) {
        const j = this.randbelow(n - i);
        result[i] = pool[j];
        pool[j] = pool[n - i - 1];
      }
    } else {
      const selected = new Set<number>();
      for (let i = 0; i < k; i++) {
        let j = this.randbelow(n);
        while (selected.has(j)) j = this.randbelow(n);
        selected.add(j);
        result[i] = population[j];
      }
    }
    return result;
  }

  uniform(a: number, b: number): number { return a + (b - a) * this.random(); }
}
