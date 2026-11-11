import { BinaryReader } from './codec';

/** LIMIT_LIST (0x5600): the server's forbidden/limited list (server/src/game/lobby.ts limitationMsgs), sent after
 * character selection (0x4100) in chunks of 13-byte entries: u32 index, u32 passcode, u32 Konami id (0 here), u8
 * copies (0 forbidden, 1 limited, 2 semi-limited). An entry at index 0 starts a new list; later chunks add to it.
 * The original's CLimitationList replaced the deck editor's marks and deck check with what the server sent. */
export const LIMIT_LIST = 0x5600;
export const LIMIT_ENTRY_SIZE = 13;

export interface LimitEntry { index: number; passcode: number; copies: number }

export function decodeLimitList(data: Uint8Array): LimitEntry[] {
  if (data.length % LIMIT_ENTRY_SIZE !== 0) throw new Error('Invalid limit list payload');
  const r = new BinaryReader(data), out: LimitEntry[] = [];
  while (r.remaining >= LIMIT_ENTRY_SIZE) {
    const index = r.u32(), passcode = r.u32(); r.u32(); const copies = r.u8();
    if (passcode > 0 && copies <= 3) out.push({ index, passcode, copies });
  }
  return out;
}

/** The list after one more chunk: a chunk that starts at index 0 replaces what came before. */
export function reduceLimitList(previous: ReadonlyMap<number, number> | null | undefined, data: Uint8Array): ReadonlyMap<number, number> {
  const entries = decodeLimitList(data);
  const next = new Map(entries.some(e => e.index === 0) || !previous ? [] : previous);
  for (const e of entries) { if (e.copies >= 3) next.delete(e.passcode); else next.set(e.passcode, e.copies); }
  return next;
}
