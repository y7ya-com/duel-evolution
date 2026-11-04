import { command, fixedBytes, payload } from './binary';
import type { GameplayCommand } from './binary';

/** Exact field order: client/src/Net/NetLobby.cpp; server/src/game/lobby.ts and hub.ts. */
export const worldCommands = {
  blocks: () => command(0x4200),
  enterBlock: (block: number, change = true) => command(0x4202, payload().u8(block).u8(Number(change)).build()),
  players: (pid = 0xffffffff) => command(0x4210, payload().u32(pid).build()),
  avatars: (pid = 0xffffffff) => command(0x4214, payload().u32(pid).build()),
  comments: (line: 0 | 1, pid = 0xffffffff) => command(line === 0 ? 0x4218 : 0x421c, payload().u32(pid).build()),
  teams: (pid = 0xffffffff) => command(0x4221, payload().u32(pid).build()),
  npcs: () => command(0x4230),
  playerInfo: (pid: number) => command(0x4150, payload().u32(pid).build()),
  avatarInfo: (pid: number) => command(0x5320, payload().u32(pid).build()),
  registerAvatar: (world: 0 | 1, parts: Uint8Array, extra = 0) => command(0x4170, payload().u32(world).raw(fixedBytes(parts, 16)).u32(extra).build()),
  comment: (line: 0 | 1, text: string) => command(0x4172, payload().u8(line).text(text, 32).build()),
  move: (pid: number, x: number, y: number, direction: number, flags = 0) => command(0x5300, payload().u32(pid).u16(x).u16(y).u8(direction).u8(flags).build()),
  mark: (pid: number, a: number, b: number) => command(0x5310, payload().u32(pid).u8(a).u8(b).build()),
};

export interface RoomOptions {
  duelStyle?: number; watchMode?: number; matchState?: number;
  /** Precomputed legacy MD5, not plaintext. Omit for an unlocked room. */
  passwordDigest?: Uint8Array;
  rules?: readonly [number, number, number];
}
function createRoom(options: RoomOptions, rival: number): GameplayCommand {
  const rules = options.rules ?? [1, 1, 1];
  return command(0x4288, payload().u8(options.duelStyle ?? 3).u8(options.watchMode ?? 0).u8(options.matchState ?? 0)
    .u8(Number(options.passwordDigest !== undefined)).raw(options.passwordDigest ? fixedBytes(options.passwordDigest, 16) : new Uint8Array(16))
    .u8(0).u8(rules[0]).u8(rules[1]).u8(rules[2]).u32(rival).build());
}
/** Server lobbyReply handles NPC 0x4288 after Lobby.hCreateroom deliberately returns false. */
export const duelCommands = {
  rooms: () => command(0x4280, payload().u32(0xffffffff).build()),
  createRoom: (options: RoomOptions = {}) => createRoom(options, 0),
  challengeNpc: (npcId: number, options: RoomOptions = {}) => {
    if (!Number.isInteger(npcId) || npcId < 1 || npcId > 98) throw new RangeError('NPC id must be 1..98, not its fake player id');
    return createRoom(options, npcId);
  },
  deleteRoom: () => command(0x4290),
  /** Room id, never player id. Password digest is ignored by unlocked rooms (Lobby.challenge). */
  challengeRoom: (roomId: number, passwordDigest: Uint8Array = new Uint8Array(16)) => command(0x4300, payload().u32(roomId).raw(fixedBytes(passwordDigest, 16)).build()),
  acceptInvite: () => command(0x4303, payload().u32(1).build()),
  rejectInvite: () => command(0x4303, payload().u32(0).build()),
  cancelChallenge: () => command(0x4304),
  /** Server hWatch expects the duelist's PID despite the legacy client's argument being named room. */
  spectate: (duelistPid: number) => command(0x4320, payload().u32(duelistPid).build()),
  resetAutoWait: () => command(0x42a0),
};

/** server/src/game/lobby.ts hChat; Latin-1 wire, max 128 characters for ordinary chat. */
export function chatCommand(text: string, kind: 0 | 1 | 2 | 3 | 5 = 1, targetPid = 0): GameplayCommand {
  const chars = Array.from(text);
  if (chars.length > 128 || text.includes('\0')) throw new RangeError('Chat must be at most 128 characters without NUL');
  return command(0x4400, payload().u8(0).u8(kind).u32(0).u32(targetPid).u32(0).text(text, chars.length + 1).build());
}
/** Compatibility path in server/src/duel/tagRelay.ts chat. Full tag controls use HTTP in social.ts. */
export const tagChatCommands = {
  invite: (teammate: string, opponent: string, opponentTeammate: string) => {
    for (const name of [teammate, opponent, opponentTeammate]) if (!name.trim() || /[,\r\n\0]/.test(name)) throw new RangeError('Invalid tag player name');
    return chatCommand(`/tag invite ${teammate},${opponent},${opponentTeammate}`);
  },
  accept: (host = '') => chatCommand(`/tag accept${host ? ` ${host}` : ''}`),
};
