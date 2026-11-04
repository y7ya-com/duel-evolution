import { command, payload, PayloadReader, records } from './binary';

/** Provenance: server/src/game/lobby.ts friends/mail/ignore; teams.ts overrides legacy fallback team handlers. */
export const socialCommands = {
  findPlayer: (name: string) => command(0x4500, payload().text(name, 16).build()),
  requestFriend: (pid: number) => command(0x4510, payload().u32(pid).build()),
  replyFriend: (pid: number, accept: boolean) => command(0x4513, payload().u32(pid).u32(Number(accept)).build()),
  ignore: (pid: number) => command(0x4530, payload().u32(pid).build()),
  unignore: (pid: number) => command(0x4540, payload().u32(pid).build()),
  onlineFriends: (pids: readonly number[]) => {
    if (pids.length > 255) throw new RangeError('Online query exceeds 1024-byte payload');
    const w = payload().u32(pids.length); pids.forEach(pid => w.u32(pid)); return command(0x3603, w.build());
  },
  sendMail: (toPid: number, subject: string, body: string, extra = '') => command(0x4600, payload().u32(toPid).text(subject, 32).text(body, 512).text(extra, 64).build()),
  receiveMail: () => command(0x4610),
  mailCount: () => command(0x4620),
  createTeam: (name: string) => command(0x4550, payload().text(name, 16).build()),
  disbandTeam: () => command(0x4552),
  inviteToTeam: (targetPid: number) => command(0x4554, payload().u32(targetPid).build()),
  replyTeamInvite: (teamId: number, inviterPid: number, accept: boolean) => command(0x4568, payload().u32(Number(accept)).u32(teamId).u32(inviterPid).build()),
  banishFromTeam: (pid: number) => command(0x4556, payload().u32(pid).build()),
  leaveTeam: () => command(0x4569),
  team: () => command(0x4558),
};
export function decodeResult(data: Uint8Array): number { const r = new PayloadReader(data), code = r.i32(); r.end(); return code; }
export function decodePlayerLookup(data: Uint8Array): { result: number; pid: number } { const r = new PayloadReader(data), result = { result: r.i32(), pid: r.u32() }; r.end(); return result; }
export function decodeFriendOffer(data: Uint8Array): { pid: number; name: string; level: number } { const r = new PayloadReader(data), result = { pid: r.u32(), name: r.text(16), level: r.u8() }; r.end(); return result; }
export function decodeFriendReply(data: Uint8Array): { accepted: boolean; pid: number; name: string } { const r = new PayloadReader(data), result = { accepted: r.u32() === 1, pid: r.u32(), name: r.text(16) }; r.end(); return result; }
export interface Mail { fromPid: number; fromName: string; toPid: number; toName: string; timestamp: number; subject: string; body: string; extra: string; read: boolean }
/** 653 bytes: server lobby.ts mailEntry does NOT include its internal mail id. */
export function decodeMail(data: Uint8Array): Mail {
  const r = new PayloadReader(data), result = { fromPid: r.u32(), fromName: r.text(16), toPid: r.u32(), toName: r.text(16), timestamp: r.u32(), subject: r.text(32), body: r.text(512), extra: r.text(64), read: r.u8() !== 0 }; r.end(); return result;
}
export function decodeOnlineFriends(data: Uint8Array): { result: number; friends: { pid: number; language: number; kind: number; room: number; area: number; block: number }[] } {
  const r = new PayloadReader(data), result = r.i32(), count = r.u32(), friends = [];
  if (count > Math.floor(r.remaining / 9)) throw new RangeError('Truncated online list');
  for (let i = 0; i < count; i++) friends.push({ pid: r.u32(), language: r.u8(), kind: r.u8(), room: r.u8(), area: r.u8(), block: r.u8() });
  r.end(); return { result, friends };
}
export interface TeamHeader { count: number; id: number; name: string; flag: Uint8Array }
export interface TeamMember { pid: number; name: string; authority: number }
export function decodeTeamHeader(data: Uint8Array): TeamHeader {
  const r = new PayloadReader(data), result = { count: r.u32(), id: r.u32(), name: r.text(16), flag: r.raw(16) }; r.end(); return result;
}
export const decodeTeamMembers = (data: Uint8Array): TeamMember[] => records(data, r => ({ pid: r.u32(), name: r.text(16), authority: r.u8() }));
export function decodeTeamInvite(data: Uint8Array): { inviterPid: number; inviterName: string; teamId: number; teamName: string } {
  const r = new PayloadReader(data), result = { inviterPid: r.u32(), inviterName: r.text(16), teamId: r.u32(), teamName: r.text(16) }; r.end(); return result;
}
export function decodeTeamMemberNotice(data: Uint8Array): { teamId: number; pid: number; name: string } {
  const r = new PayloadReader(data), result = { teamId: r.u32(), pid: r.u32(), name: r.text(16) }; r.end(); return result;
}

/** HTTP has no legacy binary opcode: keep descriptors distinct from GameplayCommand.
 * Provenance: worker.ts /api/de/duel/challenge, /api/de/tag; do.ts, tagRelay.ts tagApi.
 * Caller supplies authenticated same-origin fetch; these functions never perform I/O.
 */
export interface GameplayHttpRequest { method: 'GET' | 'POST'; path: string; body?: Readonly<Record<string, unknown>> }
export const gameplayHttp = {
  friends: (): GameplayHttpRequest => ({ method: 'GET', path: '/api/de/friends' }),
  inviteDuel: (pid: number): GameplayHttpRequest => ({ method: 'POST', path: '/api/de/duel/challenge', body: { pid } }),
  tagState: (): GameplayHttpRequest => ({ method: 'GET', path: '/api/de/tag' }),
  inviteTag: (teammatePid: number, opponentPid: number, opponentTeammatePid: number): GameplayHttpRequest => {
    const ids = [teammatePid, opponentPid, opponentTeammatePid];
    if (ids.some(id => !Number.isSafeInteger(id) || id <= 0) || new Set(ids).size !== 3) throw new RangeError('Choose three different player ids');
    return { method: 'POST', path: '/api/de/tag/invite', body: { teammatePid, opponentPid, opponentTeammatePid } };
  },
  respondTag: (action: 'accept' | 'decline' | 'cancel', id: string): GameplayHttpRequest => {
    if (!id || id.length > 100) throw new RangeError('Invalid tag invitation id');
    return { method: 'POST', path: `/api/de/tag/${action}`, body: { id } };
  },
};
