import { PayloadReader } from './binary';
import { decodeAvatars, decodeBlockList, decodeComments, decodeDuelEndpoint, decodeEnterBlock, decodeMatchOffer, decodeNpcs, decodeOpponent, decodePlayers, decodePosition, decodePresence, decodeRooms, decodeTeamAppearances, decodeWatchResult } from './world';
import { decodeFriendOffer, decodeFriendReply, decodeMail, decodeOnlineFriends, decodePlayerLookup, decodeResult, decodeTeamHeader, decodeTeamInvite, decodeTeamMemberNotice, decodeTeamMembers } from './social';
import { decodeTradeMessage } from './trade';
import type { TradeEvent } from './trade';

/** Chat output layout: lobby.ts hChat and chat.ts wire. Text is literal Latin-1, including control codes. */
export function decodeChat(data: Uint8Array) {
  const r = new PayloadReader(data), flags = r.u8(), kind = r.u8(), fromPid = r.u32(), toPid = r.u32(), name = r.text(16), text = r.text(r.remaining);
  return { flags, kind, fromPid, toPid, name, text };
}
export function decodeAvatarParts(data: Uint8Array) {
  const r = new PayloadReader(data), result = { pid: r.u32(), world: r.u32(), parts: r.raw(16) }; r.end(); return result;
}
export function decodeAvatarInfo(data: Uint8Array) {
  const r = new PayloadReader(data), result = { result: r.i32(), pid: r.u32(), name: r.text(16), x: r.u16(), y: r.u16(), direction: r.u8() }; r.end(); return result;
}
export function decodeCommentNotice(data: Uint8Array) {
  const r = new PayloadReader(data), result = { pid: r.u32(), line: r.u8(), text: r.text(32) }; r.end(); return result;
}
function decodeTeamDisbanded(data: Uint8Array) {
  const r = new PayloadReader(data), result = { teamId: r.u32() }; r.end(); return result;
}
function decodeMark(data: Uint8Array) {
  const r = new PayloadReader(data), result = { pid: r.u32(), a: r.u8(), b: r.u8() }; r.end(); return result;
}
/** All application decoders are pure. Unknown messages return null for other feature owners. */
const decoders = {
  0x4201: decodeBlockList, 0x4203: decodeEnterBlock,
  0x4212: decodePlayers, 0x4216: decodeAvatars, 0x421a: decodeComments, 0x421e: decodeComments, 0x4223: decodeTeamAppearances,
  0x4232: decodeNpcs, 0x4284: decodeRooms, 0x3113: decodeRooms, 0x3112: decodePresence,
  0x5300: decodePosition, 0x5310: decodeMark, 0x5340: decodeAvatarInfo, 0x4181: decodeAvatarParts, 0x4180: decodeCommentNotice,
  0x4302: decodeMatchOffer, 0x4306: decodeDuelEndpoint, 0x43a0: decodeOpponent, 0x4321: decodeWatchResult,
  0x4501: decodePlayerLookup, 0x4512: decodeFriendOffer, 0x4515: decodeFriendReply, 0x3604: decodeOnlineFriends,
  0x4612: decodeMail, 0x4564: decodeTeamHeader, 0x4559: decodeTeamMembers, 0x4567: decodeTeamInvite,
  0x4561: decodeTeamMemberNotice, 0x4562: decodeTeamMemberNotice, 0x4570: decodeTeamMemberNotice, 0x4571: decodeTeamAppearances,
  0x4402: decodeChat, 0x4560: decodeTeamDisbanded,
} as const;
type Decoders = typeof decoders;
export type GameplayDataEvent = { [I in keyof Decoders]: { type: 'data'; id: I; value: ReturnType<Decoders[I]> } }[keyof Decoders];
export type GameplayEvent = GameplayDataEvent | { type: 'result'; id: number; code: number }
  | { type: 'boundary'; id: number; value: number | null } | { type: 'notice'; id: number }
  | { type: 'trade'; id: number; event: TradeEvent };
// Start values often indicate status, NOT a count. E.g. LIST1 starts with 1 despite multiple players.
const boundaries = new Set([0x4211, 0x4213, 0x4215, 0x4217, 0x4219, 0x421b, 0x421d, 0x421f, 0x4222, 0x4224, 0x4231, 0x4233, 0x4282, 0x4286, 0x4611, 0x4613, 0x4565]);
const results = new Set([0x4171, 0x4173, 0x428a, 0x4292, 0x4301, 0x4309, 0x42a2, 0x4511, 0x4531, 0x4541, 0x4551, 0x4553, 0x4566, 0x4601, 0x4621]);
const notices = new Set([0x4305, 0x4308, 0x4603]);
export function decodeGameplayMessage(id: number, data: Uint8Array): GameplayEvent | null {
  const trade = decodeTradeMessage(id, data);
  if (trade) return { type: 'trade', id, event: trade };
  if (id in decoders) {
    const key = id as keyof Decoders;
    // Correlated union is preserved by the numeric key; TS cannot express indexed function invocation here.
    return { type: 'data', id: key, value: decoders[key](data) } as GameplayDataEvent;
  }
  if (boundaries.has(id)) return { type: 'boundary', id, value: data.length ? decodeResult(data) : null };
  if (results.has(id)) return { type: 'result', id, code: decodeResult(data) };
  if (notices.has(id)) { new PayloadReader(data).end(); return { type: 'notice', id }; }
  return null;
}
