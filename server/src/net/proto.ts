// YO2 TCP framing (py yo2srv/red/proto.py). A message = 24-byte header + data (≤ 1024), all XORed with KEY:
//   0-1 msg id u16 BE, 2-3 data length u16 BE, 4-7 param u32 BE (the client's seq), 8-23 MD5(header[0:8] + data).
// Data fields are big-endian; strings are fixed-size, zero-padded latin1.
import { createHash } from "node:crypto";

export const KEY = [0x5a, 0xa5, 0x5a, 0x55];
export const HDR = 24;
export const MAX_DATA = 1024;
/** What the server may send: on the card wire a frame can pass 1024 B (cards are u32 there); the client's codec
 *  (client/recomp/rt/cardwire.cpp) gives the 2008 exe its own <= 1024 B messages. What it accepts stays MAX_DATA. */
export const MAX_SEND = 0xffff;

export function xor(b: Uint8Array, start = 0): Uint8Array {
  const out = new Uint8Array(b.length);
  for (let i = 0; i < b.length; i++) out[i] = b[i] ^ KEY[(i + start) % 4];
  return out;
}

export const md5 = (b: Uint8Array): Uint8Array => new Uint8Array(createHash("md5").update(b).digest());

export function pack(msgId: number, data: Uint8Array = new Uint8Array(0), param = 0): Uint8Array {
  const plain = new Uint8Array(HDR + data.length);
  const dv = new DataView(plain.buffer);
  dv.setUint16(0, msgId);
  dv.setUint16(2, data.length);
  dv.setUint32(4, param >>> 0);
  plain.set(data, HDR);
  const head8 = plain.subarray(0, 8);
  const h = createHash("md5").update(head8).update(data).digest();
  plain.set(h, 8);
  return xor(plain);
}

export interface Msg { id: number; param: number; data: Uint8Array; ok: boolean }

/** Pulls complete messages out of a byte stream. */
export class Reader {
  buf: Uint8Array = new Uint8Array(0);

  /** At most `max` messages; the rest stays buffered. One copy of what is left (a 1 MB frame of tiny messages
   *  re-sliced per message cost seconds). */
  feed(chunk: Uint8Array, max = Infinity): Msg[] {
    if (chunk.length) {
      const b = new Uint8Array(this.buf.length + chunk.length);
      b.set(this.buf);
      b.set(chunk, this.buf.length);
      this.buf = b;
    }
    const out: Msg[] = [];
    let at = 0;
    while (out.length < max && this.buf.length - at >= HDR) {
      const head = xor(this.buf.subarray(at, at + HDR));
      const dv = new DataView(head.buffer);
      const id = dv.getUint16(0), n = dv.getUint16(2), param = dv.getUint32(4);
      if (this.buf.length - at < HDR + n) break;
      const data = xor(this.buf.subarray(at + HDR, at + HDR + n), HDR);
      const h = createHash("md5").update(head.subarray(0, 8)).update(data).digest();
      out.push({ id, param, data, ok: Buffer.from(h).equals(Buffer.from(head.subarray(8, 24))) });
      at += HDR + n;
    }
    if (at) this.buf = this.buf.slice(at);
    return out;
  }

  /** Data length declared by the pending header (py checks it against MAX_DATA before waiting for the body). */
  pendingLen(): number {
    if (this.buf.length < HDR) return -1;
    const h = xor(this.buf.subarray(0, 4));
    return (h[2] << 8) | h[3];
  }
}

const latin1 = (s: string): number[] => Array.from(s, (c) => c.charCodeAt(0) & 0xff);

/** Field writer (big-endian, fixed-size strings). Mirrors py proto.W. */
export class W {
  b: number[] = [];
  u8(v: number) { this.b.push(v & 0xff); return this; }
  u16(v: number) { this.b.push((v >> 8) & 0xff, v & 0xff); return this; }
  u32(v: number) { v >>>= 0; this.b.push(v >>> 24, (v >>> 16) & 0xff, (v >>> 8) & 0xff, v & 0xff); return this; }
  s(text: string, size: number) {
    const raw = latin1(text).slice(0, size);
    this.b.push(...raw);
    for (let i = raw.length; i < size; i++) this.b.push(0);
    return this;
  }
  raw(bytes: ArrayLike<number>) { for (let i = 0; i < bytes.length; i++) this.b.push(bytes[i]); return this; }
  bytes(): Uint8Array { return Uint8Array.from(this.b); }
}

/** Field reader over message data. */
export class R {
  private dv: DataView;
  pos = 0;
  constructor(readonly d: Uint8Array) { this.dv = new DataView(d.buffer, d.byteOffset, d.byteLength); }
  u8() { return this.dv.getUint8(this.pos++); }
  u16() { const v = this.dv.getUint16(this.pos); this.pos += 2; return v; }
  u32() { const v = this.dv.getUint32(this.pos); this.pos += 4; return v; }
  i32() { const v = this.dv.getInt32(this.pos); this.pos += 4; return v; }
  /** Fixed-size zero-terminated latin1 string. */
  s(size: number) { const v = cstr(this.d.subarray(this.pos, this.pos + size)); this.pos += size; return v; }
}

/** py `b.split(b"\0")[0].decode("latin1")`. */
export function cstr(b: Uint8Array): string {
  let end = b.indexOf(0);
  if (end < 0) end = b.length;
  return String.fromCharCode(...b.subarray(0, end));
}

export const u32be = (d: Uint8Array, at = 0): number =>
  ((d[at] << 24) | (d[at + 1] << 16) | (d[at + 2] << 8) | d[at + 3]) >>> 0;

/** Server list entry (0x2003), 48 bytes, field order of FUN_0069a6a0. kind 1 = accounts, 3 = lobby. */
export function serverEntry(sid: number, kind: number, name: string, ip: string, port: number,
                            extra = 0, b1 = 0, b2 = 0, b3 = 0): Uint8Array {
  return new W().u32(sid).u32(kind).s(name, 16).s(ip, 15).u16(port).u16(extra).u8(b1).u8(b2).u8(b3).u16(0).bytes();
}

export const hex = (b: Uint8Array): string => Buffer.from(b).toString("hex");
export const unhex = (s: string): Uint8Array => new Uint8Array(Buffer.from(s, "hex"));
