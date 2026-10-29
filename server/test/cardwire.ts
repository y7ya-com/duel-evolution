// What the client's codec (client/recomp/rt/cardwire.cpp) makes of the server's card wire, for tests that compare
// against the 2008 client's own bytes (the py fixtures): passcodes -> card index / Konami internal id, from
// gamedata/cards.json (the client's card table, tools/cardart.py).
import { readFileSync } from "node:fs";
import { join } from "node:path";
type Msg = [number, Uint8Array];

type Card = { i: number; internal: number; pc: number };
const HIDDEN = { 0xffffff01: 1, 0xffffff02: 19, 0xffffff03: 16 } as Record<number, number>;   // the placeholders (monster, spell, trap)

export class WireDecoder {
  private idx = new Map<number, number>();
  private internal = new Map<number, number>();
  private byInternal = new Map<number, number>();
  announce = false;
  /** per decoded 0x6202 message: per record the slots that held a card ([index mask, internal mask]) */
  cardSlots = new WeakMap<Uint8Array, [number, number][]>();
  constructor(gamedata: string) {
    const cards = JSON.parse(readFileSync(join(gamedata, "cards.json"), "utf8")) as Card[];
    for (const c of cards) {
      this.idx.set(c.pc, c.i), this.internal.set(c.i, c.internal);
      if (!this.byInternal.has(c.internal)) this.byInternal.set(c.internal, c.pc);
    }
  }
  index(pc: number): number { return pc === 0 ? 0 : HIDDEN[pc] ?? this.idx.get(pc) ?? 0; }
  toInternal(pc: number): number { return this.internal.get(this.index(pc)) ?? 0; }
  fromInternal(v: number): number { return this.byInternal.get(v) ?? 0; }

  /** Server -> client messages as the exe gets them. */
  decode(out: Msg[]): Msg[] {
    return out.map(([id, b]) => {
      const dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
      if (id === 0x6202 && b.length % 43 === 0) {
        const o = new Uint8Array(b.length / 43 * 40), ov = new DataView(o.buffer);
        const slots: [number, number][] = [];
        this.cardSlots.set(o, slots);
        for (let k = 0; k < b.length / 43; k++) {
          o.set(b.subarray(43 * k, 43 * k + 40), 40 * k);
          const toIdx = b[43 * k + 40], toInt = b[43 * k + 41], hints = b[43 * k + 42];
          slots.push([toIdx, toInt]);
          for (let s = 0; s < 8; s++) {
            const at = 40 * k + 8 + 4 * s, v = ov.getUint32(at);
            if (toIdx >> s & 1) ov.setUint32(at, this.index(v));
            else if (toInt >> s & 1) ov.setUint32(at, this.toInternal(v));
          }
          if (hints & 1) this.announce = true;
        }
        return [id, o];
      }
      if (id === 0x6610 && b.length >= 17) {
        const o = new Uint8Array(b.length), ov = new DataView(o.buffer);
        o.set(b.subarray(0, 17));
        for (let p = 17; p + 8 <= b.length; p += 8) {
          const v = dv.getUint32(p), owner = dv.getUint16(p + 6);
          ov.setUint16(p, owner === 2 ? v : this.index(v) & 0x3fff), ov.setUint16(p + 2, dv.getUint16(p + 4)), ov.setUint16(p + 4, owner);
        }
        return [id, o];
      }
      return [id, b];
    });
  }

  /** A 0x6202 message (40-byte records) with its card slots replaced by `key` of that card: two arts of one card, or the
   *  tokens one card makes, compare equal (which art a passcode shows is the card table's choice, tools/cardart.py). */
  canon(b: Uint8Array, slots: [number, number][], key: (pc: number) => number): string {
    const o = b.slice(), ov = new DataView(o.buffer);
    slots.forEach(([toIdx, toInt], k) => {
      for (let s = 0; s < 8; s++) {
        const at = 40 * k + 8 + 4 * s, v = ov.getUint32(at);
        if (toIdx >> s & 1) ov.setUint32(at, key(this.pcOfIndex(v)) >>> 0);
        else if (toInt >> s & 1) ov.setUint32(at, key(this.fromInternal(v)) >>> 0);
      }
    });
    return Buffer.from(o).toString("hex");
  }
  private pcByIndex = new Map<number, number>();
  pcOfIndex(i: number): number {
    if (!this.pcByIndex.size) for (const [pc, ix] of this.idx) this.pcByIndex.set(ix, pc);
    return this.pcByIndex.get(i) ?? i;
  }

  /** `out` (decoded) is `want` (py's hex), cards compared by `key`: two arts of a card, or a card's tokens, are one; and
   *  an identity py did not resend because the NPC's real card was the placeholder card itself (1, 16 or 19: v1 could
   *  not tell them apart) is skipped. */
  same(out: Msg[], want: [number, string][], key: (pc: number) => number): boolean {
    const hex = (b: Uint8Array) => Buffer.from(b).toString("hex");
    const eq = (o: Msg, w: [number, string]): boolean => {
      if (o[0] !== w[0]) return false;
      const h = hex(o[1]);
      if (h === w[1]) return true;
      const wb = new Uint8Array(Buffer.from(w[1], "hex"));
      if (wb.length !== o[1].length) return false;
      const slots = o[0] === 0x6202 ? this.cardSlots.get(o[1]) : undefined;
      if (slots) return this.canon(o[1], slots, key) === this.canon(wb, slots, key);
      if (o[0] === 0x6610 && o[1].length >= 17) {
        const items = (b: Uint8Array) => { const out: number[] = [], dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
          for (let p = 17; p + 8 <= b.length; p += 8) out.push(dv.getUint16(p + 4) === 2 ? dv.getUint16(p) : key(this.pcOfIndex(dv.getUint16(p))), dv.getUint16(p + 2), dv.getUint16(p + 4));
          return out.join(","); };
        return hex(o[1].subarray(0, 17)) === w[1].slice(0, 34) && items(o[1]) === items(wb);
      }
      return false;
    };
    const placeholderId = (o: Msg | undefined) => !!o && o[0] === 0x6202 && o[1].length === 40 &&
      new DataView(o[1].buffer, o[1].byteOffset).getUint32(0) === 0x40 && [1, 16, 19].includes(new DataView(o[1].buffer, o[1].byteOffset).getUint32(20));
    for (let i = 0, j = 0; ; ) {
      if (i === out.length || j === want.length) return i === out.length && j === want.length;
      if (eq(out[i], want[j])) { i++, j++; continue; }
      if (!placeholderId(out[i])) return false;
      i++;   // the resent identity (and its view refresh, 0x1c)
      if (out[i] && out[i][0] === 0x6202 && new DataView(out[i][1].buffer, out[i][1].byteOffset).getUint32(0) === 0x1c &&
          !(want[j] && eq(out[i], want[j]))) i++;
    }
  }

  /** A client -> server message of the exe, as the codec sends it on. */
  encode(id: number, b: Uint8Array): Uint8Array {
    if (id !== 0x6423 || b.length < 4) return b;
    const v = new DataView(b.buffer, b.byteOffset).getUint32(0);
    if (!this.announce || v <= 1) { this.announce = false; return b; }
    const o = b.slice();
    new DataView(o.buffer).setUint32(0, this.fromInternal(v));
    return o;
  }
}
