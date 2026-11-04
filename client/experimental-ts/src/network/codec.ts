/** Browser-only implementation of server/src/net/proto.ts. All wire fields are big endian. */
export interface WireMessage { id: number; param: number; data: Uint8Array }
export const HEADER_SIZE = 24;
export const MAX_CLIENT_DATA = 1024;
export const MAX_SERVER_DATA = 0xffff;
const KEY = [0x5a, 0xa5, 0x5a, 0x55] as const;
const SHIFTS = [7,12,17,22,5,9,14,20,4,11,16,23,6,10,15,21];
const MD5_K = Array.from({ length: 64 }, (_, i) => Math.floor(Math.abs(Math.sin(i + 1)) * 0x100000000) >>> 0);
const rotate = (x: number, n: number) => (x << n) | (x >>> (32 - n));

/** MD5 is protocol integrity only, never password hashing or authentication. */
export function md5(input: Uint8Array): Uint8Array {
  const size = Math.ceil((input.length + 9) / 64) * 64;
  const padded = new Uint8Array(size); padded.set(input); padded[input.length] = 0x80;
  const view = new DataView(padded.buffer);
  view.setUint32(size - 8, (input.length * 8) >>> 0, true);
  view.setUint32(size - 4, Math.floor(input.length / 0x20000000), true);
  let a0 = 0x67452301, b0 = 0xefcdab89, c0 = 0x98badcfe, d0 = 0x10325476;
  for (let offset = 0; offset < size; offset += 64) {
    let a = a0, b = b0, c = c0, d = d0;
    for (let i = 0; i < 64; i++) {
      let f: number, g: number;
      if (i < 16) { f = (b & c) | (~b & d); g = i; }
      else if (i < 32) { f = (d & b) | (~d & c); g = (5 * i + 1) % 16; }
      else if (i < 48) { f = b ^ c ^ d; g = (3 * i + 5) % 16; }
      else { f = c ^ (b | ~d); g = (7 * i) % 16; }
      const previousD = d; d = c; c = b;
      b = (b + rotate((a + f + MD5_K[i] + view.getUint32(offset + g * 4, true)) | 0,
        SHIFTS[Math.floor(i / 16) * 4 + i % 4])) | 0;
      a = previousD;
    }
    a0 = (a0 + a) | 0; b0 = (b0 + b) | 0; c0 = (c0 + c) | 0; d0 = (d0 + d) | 0;
  }
  const out = new Uint8Array(16), result = new DataView(out.buffer);
  [a0,b0,c0,d0].forEach((v, i) => result.setUint32(i * 4, v >>> 0, true));
  return out;
}

export function concat(...parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((n, b) => n + b.length, 0));
  let offset = 0; for (const part of parts) { out.set(part, offset); offset += part.length; }
  return out;
}
export function xor(bytes: Uint8Array, offset = 0): Uint8Array {
  return bytes.map((v, i) => v ^ KEY[(i + offset) % 4]);
}
export function pack(id: number, data: Uint8Array = new Uint8Array(0), param = 0): Uint8Array {
  if (!Number.isInteger(id) || id < 0 || id > 0xffff || data.length > MAX_SERVER_DATA)
    throw new RangeError('Invalid wire message');
  const plain = new Uint8Array(HEADER_SIZE + data.length), view = new DataView(plain.buffer);
  view.setUint16(0, id); view.setUint16(2, data.length); view.setUint32(4, param >>> 0);
  plain.set(data, HEADER_SIZE); plain.set(md5(concat(plain.subarray(0, 8), data)), 8);
  return xor(plain);
}

/** Bounded stream parser. Throws on integrity failures before exposing any packet. */
export class PacketReader {
  private buffer: Uint8Array = new Uint8Array(0);
  constructor(readonly maxBufferedBytes = 1024 * 1024, readonly maxDataBytes = MAX_SERVER_DATA) {}
  get bufferedBytes(): number { return this.buffer.length; }
  clear(): void { this.buffer = new Uint8Array(0); }
  feed(chunk: Uint8Array): WireMessage[] {
    if (chunk.length + this.buffer.length > this.maxBufferedBytes) throw new RangeError('Wire receive buffer limit exceeded');
    this.buffer = concat(this.buffer, chunk);
    const out: WireMessage[] = []; let offset = 0;
    while (this.buffer.length - offset >= HEADER_SIZE) {
      const header = xor(this.buffer.subarray(offset, offset + HEADER_SIZE));
      const view = new DataView(header.buffer), size = view.getUint16(2);
      if (size > this.maxDataBytes) throw new RangeError('Wire payload limit exceeded');
      if (this.buffer.length - offset < HEADER_SIZE + size) break;
      const data = xor(this.buffer.subarray(offset + HEADER_SIZE, offset + HEADER_SIZE + size), HEADER_SIZE);
      const digest = md5(concat(header.subarray(0, 8), data));
      if (!digest.every((v, i) => v === header[8 + i])) throw new Error('Wire integrity check failed');
      out.push({ id: view.getUint16(0), param: view.getUint32(4), data });
      offset += HEADER_SIZE + size;
    }
    if (offset) this.buffer = this.buffer.slice(offset);
    return out;
  }
}

export class BinaryReader {
  private readonly view: DataView;
  pos = 0;
  constructor(readonly data: Uint8Array) { this.view = new DataView(data.buffer, data.byteOffset, data.byteLength); }
  get remaining(): number { return this.data.length - this.pos; }
  private take(size: number): number {
    if (!Number.isInteger(size) || size < 0 || size > this.remaining) throw new RangeError('Truncated wire payload');
    const at = this.pos; this.pos += size; return at;
  }
  u8(): number { return this.view.getUint8(this.take(1)); }
  u16(): number { return this.view.getUint16(this.take(2)); }
  u32(): number { return this.view.getUint32(this.take(4)); }
  i32(): number { return this.view.getInt32(this.take(4)); }
  bytes(size: number): Uint8Array { const at = this.take(size); return this.data.slice(at, at + size); }
  s(size: number): string { return latin1(this.bytes(size)); }
}
export function latin1(data: Uint8Array): string {
  const zero = data.indexOf(0), end = zero < 0 ? data.length : zero;
  let out = ''; for (let i = 0; i < end; i++) out += String.fromCharCode(data[i]); return out;
}
export class BinaryWriter {
  private values: number[] = [];
  u8(v: number): this { this.values.push(v & 255); return this; }
  u16(v: number): this { return this.u8(v >>> 8).u8(v); }
  u32(v: number): this { return this.u8(v >>> 24).u8(v >>> 16).u8(v >>> 8).u8(v); }
  raw(data: ArrayLike<number>): this { for (let i = 0; i < data.length; i++) this.values.push(data[i] & 255); return this; }
  s(text: string, size: number): this {
    for (let i = 0; i < size; i++) this.u8(i < text.length ? text.charCodeAt(i) <= 255 ? text.charCodeAt(i) : 63 : 0);
    return this;
  }
  bytes(): Uint8Array { return Uint8Array.from(this.values); }
}
