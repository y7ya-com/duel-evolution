// The duel record (the 2008 client's Duel Record, live's duellogs\): what the server sends once a duel ends, NPC
// (server/src/duel/npcWatch.ts) and PvP (pvpMatch.ts duellogRecord) alike, in server/src/duel/duellog.ts's format:
// 0x6010 header, 0x6011 x k (the RLE blob in 1024-byte chunks), 0x6016 (u32 0), 0x6012, each next one after the
// client's 0x6013. The blob holds both players and every 0x6202 the player received (47-byte entries: the 43-byte
// card-wire record, LE): decoded back to 0x6202 messages they replay through the duel model (model.ts) as they were
// played. Pure: no DOM, no storage (services/duel-records.ts keeps them).
import type { WireMessage } from '../network/codec';

export const RECORD_HEADER = 0x6010, RECORD_CHUNK = 0x6011, RECORD_FINISH = 0x6012, RECORD_ACK = 0x6013, RECORD_SEARCH = 0x6016;
export const RECORD_IDS: ReadonlySet<number> = new Set([RECORD_HEADER, RECORD_CHUNK, RECORD_FINISH, RECORD_SEARCH]);
const MAGIC = 0x080a;
/** Blob offsets (duellog.ts buildBlob): the players' blocks, the entry count, the first entry. */
const PLAYER0 = 130, PLAYER_SIZE = 172, COUNT_AT = PLAYER0 + 2 * PLAYER_SIZE + 1, ENTRIES_AT = COUNT_AT + 4 + 8 + 32, ENTRY = 47;

export interface RecordPlayer { pid: number; level: number; name: string; main: number; extra: number }
export interface DuelRecord {
  /** The header's title (pvpYYYYMMDDhhmmss), the duel's end (unix seconds), 3 single / 4 match. */
  title: string; when: number; mode: number;
  players: [RecordPlayer, RecordPlayer];
  /** Every 0x6202 of the record (43 bytes each), with the side it was sent to. */
  entries: { side: number; data: Uint8Array }[];
}

export function rleDecode(body: Uint8Array): Uint8Array {
  let n = 0; for (let i = 1; i < body.length; i += 2) n += body[i]!;
  const out = new Uint8Array(n); let o = 0;
  for (let i = 0; i + 1 < body.length; i += 2) { out.fill(body[i]!, o, o + body[i + 1]!); o += body[i + 1]!; }
  return out;
}
const latin1 = (b: Uint8Array) => { let s = ''; for (const c of b) { if (!c) break; s += String.fromCharCode(c); } return s; };

/** The header (0x6010) + the chunks (0x6011) -> the record. Throws on a record that is not one. */
export function decodeDuelRecord(header: Uint8Array, chunks: readonly Uint8Array[]): DuelRecord {
  const hv = new DataView(header.buffer, header.byteOffset, header.byteLength);
  if (header.length < 8 || hv.getUint16(0) !== MAGIC) throw new Error('Not a duel record');
  const nul = header.indexOf(0, 4); if (nul < 0) throw new Error('Duel record header has no title');
  const title = latin1(header.subarray(4, nul));
  const nSent = hv.getUint32(nul + 1), nDecoded = hv.getUint32(nul + 5);   // the header is big-endian (the wire), the blob little-endian (the 2008 file)
  const body = new Uint8Array(chunks.reduce((n, c) => n + c.length, 0)); let o = 0; for (const c of chunks) { body.set(c, o); o += c.length; }
  if (body.length !== nSent) throw new Error(`Duel record is incomplete (${body.length} of ${nSent} bytes)`);
  const blob = rleDecode(body); if (blob.length !== nDecoded || blob.length < ENTRIES_AT) throw new Error('Duel record does not decode');
  const v = new DataView(blob.buffer, blob.byteOffset, blob.byteLength);
  const player = (k: number): RecordPlayer => {
    const at = PLAYER0 + k * PLAYER_SIZE;
    return { pid: v.getUint32(at, true), level: v.getUint32(at + 4, true), name: latin1(blob.subarray(at + 8, at + 24)), main: v.getUint32(at + 24, true), extra: v.getUint32(at + 28, true) };
  };
  const count = v.getUint32(COUNT_AT, true);
  if (ENTRIES_AT + count * ENTRY > blob.length) throw new Error('Duel record entries run past its end');
  const entries: DuelRecord['entries'] = [];
  for (let i = 0; i < count; i++) {
    const at = ENTRIES_AT + i * ENTRY, data = new Uint8Array(43), dv = new DataView(data.buffer);
    // u32 type, u32 B, u8 side, 3 pad, 8 x u32 P (LE) -> the 0x6202's 10 big-endian words, then its 3 card-wire bytes
    dv.setUint32(0, v.getUint32(at, true)); dv.setUint32(4, v.getUint32(at + 4, true));
    for (let k = 0; k < 8; k++) dv.setUint32(8 + 4 * k, v.getUint32(at + 12 + 4 * k, true));
    data.set(blob.subarray(at + 44, at + 47), 40);
    entries.push({ side: blob[at + 8]!, data });
  }
  return { title, when: v.getUint32(64, true), mode: v.getUint32(69, true), players: [player(0), player(1)], entries };
}

/** The record's commands as the player received them: the 0x6202s of one side (the player's own, side 0 by default). */
export function recordMessages(record: DuelRecord, side = record.entries[0]?.side ?? 0): WireMessage[] {
  return record.entries.filter(e => e.side === side).map(e => ({ id: 0x6202, param: 0, data: e.data }));
}

/** The names as the client's list writes them (duellog.ts: a space is an underscore in the header and the blob). */
export const recordName = (name: string): string => name.replace(/_/g, ' ');

/** Collects a record off the duel connection. receive() returns the message to answer (0x6013) or null, and the
 *  record once its 0x6012 arrives. */
export class DuelRecordCollector {
  private header: Uint8Array | null = null;
  private chunks: Uint8Array[] = [];
  /** A record is being received (between its 0x6010 and its 0x6012). */
  get active(): boolean { return this.header !== null; }
  receive(id: number, data: Uint8Array): { ack: boolean; record?: DuelRecord; error?: string } {
    if (id === RECORD_HEADER) { this.header = data.slice(); this.chunks = []; return { ack: true }; }
    if (!this.header) return { ack: false };
    if (id === RECORD_CHUNK) { this.chunks.push(data.slice()); return { ack: true }; }
    if (id === RECORD_SEARCH) return { ack: true };
    if (id !== RECORD_FINISH) return { ack: false };
    const header = this.header, chunks = this.chunks; this.header = null; this.chunks = [];
    try { return { ack: false, record: decodeDuelRecord(header, chunks) }; }
    catch (e) { return { ack: false, error: e instanceof Error ? e.message : String(e) }; }
  }
  reset(): void { this.header = null; this.chunks = []; }
}
