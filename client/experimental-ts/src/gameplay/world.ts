import { PayloadReader, records } from './binary';

export interface PlayerSummary { pid: number; name: string; level: number; wins: number; losses: number; title: number; reserved: number; flags: number; country: string; state: number; block: number }
export interface Position { pid: number; x: number; y: number; direction: number; flags: number }
export interface Rival { name: string; level: number; wins: number; losses: number; title: number }
export interface Avatar { pid: number; state: number; parts: Uint8Array; x: number; y: number; direction: number; rival?: Rival }
export interface Npc { id: number; name: string; parts: Uint8Array; flags: number; unknown1: number; unknown2: number; threshold: number; spot: number; unknown3: number; previous: number }
export interface DuelRoom { id: number; hostPid: number; guestPid: number; matchState: number; duelStyle: number; watchMode: number; locked: boolean; rules: readonly [number, number, number] }
export interface TeamAppearance { pid: number; teamId: number; name: string; flag: Uint8Array }
export interface Endpoint { host: string; port: number }
function readPlayer(r: PayloadReader): PlayerSummary {
  return { pid: r.u32(), name: r.text(16), level: r.u8(), wins: r.u16(), losses: r.u16(), title: r.u16(), reserved: r.u16(), flags: r.u8(), country: r.text(4), state: r.u8(), block: r.u8() };
}
function readRival(r: PayloadReader): Rival { return { name: r.text(16), level: r.u8(), wins: r.u16(), losses: r.u16(), title: r.u16() }; }
function readAvatar(r: PayloadReader): Avatar {
  return readAvatarBody(r, r.u32());
}
function readAvatarBody(r: PayloadReader, pid: number): Avatar {
  const state = r.u8(), parts = r.raw(16), x = r.u16(), y = r.u16(), direction = r.u8();
  return { pid, state, parts, x, y, direction, ...(state >= 0x67 && state <= 0x6a ? { rival: readRival(r) } : {}) };
}
function readRoom(r: PayloadReader): DuelRoom { return { id: r.u32(), hostPid: r.u32(), guestPid: r.u32(), matchState: r.u8(), duelStyle: r.u8(), watchMode: r.u8(), locked: r.u8() !== 0, rules: [r.u8(), r.u8(), r.u8()] }; }
/** Provenance: lobby.ts blockPlayer/roomEntry; hub.ts listChunks/list2Body (23-byte duel extra). */
export const decodePlayers = (data: Uint8Array): PlayerSummary[] => records(data, readPlayer);
export const decodeAvatars = (data: Uint8Array): Avatar[] => records(data, readAvatar);
export const decodeRooms = (data: Uint8Array): DuelRoom[] => records(data, readRoom);
/** Provenance: server/src/game/npcs.ts npcEntry: 61 bytes, including progression chain fields. */
export const decodeNpcs = (data: Uint8Array): Npc[] => records(data, r => ({ id: r.u32(), name: r.text(16), parts: r.raw(16), flags: r.u8(), unknown1: r.u32(), unknown2: r.u32(), threshold: r.u32(), spot: r.u32(), unknown3: r.u32(), previous: r.u32() }));
export const decodeComments = (data: Uint8Array): { pid: number; text: string }[] => records(data, r => ({ pid: r.u32(), text: r.text(32) }));
export const decodeTeamAppearances = (data: Uint8Array): TeamAppearance[] => records(data, r => ({ pid: r.u32(), teamId: r.u32(), name: r.text(16), flag: r.raw(16) }));
export function decodePosition(data: Uint8Array): Position {
  const r = new PayloadReader(data), result = { pid: r.u32(), x: r.u16(), y: r.u16(), direction: r.u8(), flags: r.u8() }; r.end(); return result;
}
export function decodeDuelEndpoint(data: Uint8Array): Endpoint {
  const r = new PayloadReader(data), result = { host: r.text(15), port: r.u16() }; r.end(); return result;
}
export function decodeWatchResult(data: Uint8Array): { result: number; endpoint: Endpoint } {
  const r = new PayloadReader(data), result = r.i32(), endpoint = { host: r.text(15), port: r.u16() }; r.end(); return { result, endpoint };
}
export function decodeMatchOffer(data: Uint8Array): { pid: number; name: string; flags: number; level: number; title: number; reserved: number; parts: Uint8Array } {
  // lobby.ts challenge/npcChallenge: the extra u8 before level differs from 0x43a0.
  const r = new PayloadReader(data), result = { pid: r.u32(), name: r.text(16), flags: r.u8(), level: r.u8(), title: r.u16(), reserved: r.u16(), parts: r.raw(16) }; r.end(); return result;
}
export function decodeOpponent(data: Uint8Array): { pid: number; name: string; level: number; title: number; reserved: number; parts: Uint8Array; npcWindow: number } {
  const r = new PayloadReader(data), result = { pid: r.u32(), name: r.text(16), level: r.u8(), title: r.u16(), reserved: r.u16(), parts: r.raw(16), npcWindow: r.u8() }; r.end(); return result;
}
export type Presence = { kind: 'leave'; pid: number; block: number } | { kind: 'join'; pid: number; block: number; player: PlayerSummary; avatar: Avatar; team: Omit<TeamAppearance, 'pid'> } | { kind: 'state'; pid: number; block: number; state: number; rival: Rival };
export function decodePresence(data: Uint8Array): Presence {
  // hub.ts joinMsg/stateMsg: full join contains LIST1+LIST2+LIST5; compact duel update has 23 bytes.
  const r = new PayloadReader(data), pid = r.u32(), state = r.u8(), block = r.u8();
  if (state === 0) { r.end(); return { kind: 'leave', pid, block }; }
  if (state >= 0x67 && state <= 0x6a && r.remaining === 23) { const rival = readRival(r); r.end(); return { kind: 'state', pid, block, state, rival }; }
  const player = readPlayer(r);
  const avatar = readAvatarBody(r, pid);
  const team = { teamId: r.u32(), name: r.text(16), flag: r.raw(16) }; r.end();
  if (player.pid !== pid) throw new RangeError('Presence player id mismatch');
  return { kind: 'join', pid, block, player, avatar, team };
}
export function decodeBlockList(data: Uint8Array): { maximum: number; entries: { population: number; area: number; kind: number; block: number }[] } {
  const r = new PayloadReader(data), maximum = r.u16(), entries = [];
  while (r.remaining) entries.push({ population: r.u16(), area: r.u8(), kind: r.u8(), block: r.u8() });
  return { maximum, entries };
}
export function decodeEnterBlock(data: Uint8Array): { result: number; block: number; area: number; reserved: number } {
  const r = new PayloadReader(data), result = { result: r.i32(), block: r.u8(), area: r.u8(), reserved: r.u8() }; r.end(); return result;
}
