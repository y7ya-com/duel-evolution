import type { CommandRecord, ListItem } from './types';

export class DuelProtocolError extends Error { override name = 'DuelProtocolError'; }
export class Bytes {
  private readonly view: DataView;
  pos = 0;
  constructor(readonly bytes: Uint8Array) { this.view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength); }
  need(n: number): void { if (this.pos + n > this.bytes.length) throw new DuelProtocolError(`Truncated duel payload at ${this.pos}: need ${n} bytes`); }
  u8(): number { this.need(1); return this.view.getUint8(this.pos++); }
  u16(): number { this.need(2); const n = this.view.getUint16(this.pos); this.pos += 2; return n; }
  u32(): number { this.need(4); const n = this.view.getUint32(this.pos); this.pos += 4; return n; }
  i32(): number { this.need(4); const n = this.view.getInt32(this.pos); this.pos += 4; return n; }
  done(): void { if (this.pos !== this.bytes.length) throw new DuelProtocolError(`Unexpected ${this.bytes.length - this.pos} trailing duel bytes`); }
}

/** The v2 wire uses 43-byte records; shared duelfin helpers still emit pointer-free 40-byte records. */
export function decodeCommands(data: Uint8Array): CommandRecord[] {
  if (!data.length) throw new DuelProtocolError('Empty duel command');
  const width = data.length % 43 === 0 ? 43 : data.length % 40 === 0 ? 40 : 0;
  if (!width || data.length > 43 * 1024) throw new DuelProtocolError(`Invalid duel command payload length ${data.length}`);
  const r = new Bytes(data), out: CommandRecord[] = [];
  while (r.pos < data.length) {
    const kind = r.u32(), b = r.u32(), params = Array.from({ length: 8 }, () => r.u32());
    out.push({ kind, b, params, indexSlots: width === 43 ? r.u8() : 0,
      internalSlots: width === 43 ? r.u8() : 0, hints: width === 43 ? r.u8() : 0 });
  }
  return out;
}

export function visiblePasscode(raw: number): number | null {
  return raw && raw < 0xffffff00 ? raw : null;
}

/** 0x6610: u8 owner + four u32 fields, then v2 (u32 passcode,u16 serial,u16 owner) records. */
export function decodeList(data: Uint8Array): { owner: number; mode: number; items: ListItem[] } {
  const r = new Bytes(data), owner = r.u8(), mode = r.u32();
  r.u32(); const count = r.u32(); r.u32();
  if (count > 1024 || data.length !== 17 + 8 * count) throw new DuelProtocolError('Invalid duel list size');
  const items: ListItem[] = [];
  for (let i = 0; i < count; i++) {
    const rawId = r.u32(), serial = r.u16(), owner = r.u16();
    items.push({ rawId, passcode: owner === 2 ? null : visiblePasscode(rawId), serial, owner });
  }
  return { owner, mode, items };
}

export function words(...values: number[]): Uint8Array {
  const bytes = new Uint8Array(values.length * 4), view = new DataView(bytes.buffer);
  values.forEach((value, i) => view.setUint32(i * 4, value >>> 0));
  return bytes;
}
