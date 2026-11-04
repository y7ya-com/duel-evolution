/** Payload codec only. Provenance: server/src/net/proto.ts W/R (big endian, literal Latin-1). */
export type Channel = 'account' | 'lobby' | 'duel';
export interface GameplayCommand { channel: Channel; id: number; data: Uint8Array }
export class PayloadWriter {
  private bytes: number[] = [];
  u8(n: number): this { this.check(n, 0xff); this.bytes.push(n); return this; }
  u16(n: number): this { this.check(n, 0xffff); this.bytes.push(n >>> 8, n & 255); return this; }
  u32(n: number): this { this.check(n, 0xffffffff); this.bytes.push(n >>> 24, (n >>> 16) & 255, (n >>> 8) & 255, n & 255); return this; }
  private check(n: number, max: number): void { if (!Number.isInteger(n) || n < 0 || n > max) throw new RangeError('Invalid unsigned wire integer'); }
  raw(b: Uint8Array): this { this.bytes.push(...b); return this; }
  text(s: string, size: number): this {
    const b = new Uint8Array(size);
    Array.from(s).slice(0, size).forEach((c, i) => { b[i] = c.codePointAt(0)! <= 255 ? c.charCodeAt(0) : 63; });
    return this.raw(b);
  }
  build(): Uint8Array { return Uint8Array.from(this.bytes); }
}
export class PayloadReader {
  private at = 0;
  private view: DataView;
  constructor(readonly data: Uint8Array) { this.view = new DataView(data.buffer, data.byteOffset, data.byteLength); }
  get remaining(): number { return this.data.length - this.at; }
  raw(n: number): Uint8Array { if (n < 0 || this.remaining < n) throw new RangeError('Truncated gameplay payload'); const b = this.data.slice(this.at, this.at + n); this.at += n; return b; }
  u8(): number { return this.raw(1)[0]; }
  u16(): number { const n = this.at; this.raw(2); return this.view.getUint16(n); }
  u32(): number { const n = this.at; this.raw(4); return this.view.getUint32(n); }
  i32(): number { const n = this.at; this.raw(4); return this.view.getInt32(n); }
  text(n: number): string { const b = this.raw(n); const end = b.indexOf(0); return String.fromCharCode(...b.subarray(0, end < 0 ? b.length : end)); }
  end(): void { if (this.remaining) throw new RangeError('Unexpected gameplay payload bytes'); }
}
export const payload = (): PayloadWriter => new PayloadWriter();
export function command(id: number, data: Uint8Array = new Uint8Array(0)): GameplayCommand { return { channel: 'lobby', id, data }; }
export function fixedBytes(b: Uint8Array, size: number): Uint8Array { if (b.length !== size) throw new RangeError(`Expected ${size} bytes`); return b.slice(); }
export function records<T>(data: Uint8Array, read: (r: PayloadReader) => T): T[] {
  const r = new PayloadReader(data), result: T[] = [];
  while (r.remaining) result.push(read(r));
  return result;
}
