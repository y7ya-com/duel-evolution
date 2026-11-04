/** JSON response contracts from Lobby.friendsInfo/duelInvite and tagRelay.ts state(). No I/O. */
function object(v: unknown): Record<string, unknown> { if (!v || typeof v !== 'object' || Array.isArray(v)) throw new TypeError('Expected gameplay object'); return v as Record<string, unknown>; }
function string(v: unknown): string { if (typeof v !== 'string') throw new TypeError('Expected gameplay string'); return v; }
function integer(v: unknown): number { if (typeof v !== 'number' || !Number.isSafeInteger(v) || v < 0) throw new TypeError('Expected gameplay integer'); return v; }
function boolean(v: unknown): boolean { if (typeof v !== 'boolean') throw new TypeError('Expected gameplay boolean'); return v; }
function array<T>(v: unknown, read: (value: unknown) => T): T[] { if (!Array.isArray(v)) throw new TypeError('Expected gameplay array'); return v.map(read); }
export interface NamedPlayer { pid: number; name: string }
function player(v: unknown): NamedPlayer { const o = object(v); return { pid: integer(o.pid), name: string(o.name) }; }
export interface TagSeat extends NamedPlayer { role: 'captain' | 'opponent' | 'teammate' | 'opponent-teammate'; accepted: boolean }
export interface TagInvitation { id: string; hostPid: number; expires: number; outbound: boolean; seats: TagSeat[] }
export interface TagState { self: NamedPlayer; active: boolean; available: boolean; reason?: string; players: NamedPlayer[]; invitations: TagInvitation[]; event?: { id: string; kind: string; at: number; name?: string }; started?: boolean }
export function decodeTagState(value: unknown): TagState {
  const o = object(value);
  const invitations = array(o.invitations, v => {
    const inv = object(v);
    const roles = ['captain', 'opponent', 'teammate', 'opponent-teammate'] as const;
    const seats = array(inv.seats, seat => {
      const s = object(seat), role = string(s.role);
      if (!(roles as readonly string[]).includes(role)) throw new TypeError('Invalid tag role');
      return { ...player(s), role: role as TagSeat['role'], accepted: boolean(s.accepted) };
    });
    if (seats.length !== 4 || new Set(seats.map(s => s.pid)).size !== 4 || seats.some((s, i) => s.role !== roles[i])) throw new TypeError('Invalid tag seats');
    return { id: string(inv.id), hostPid: integer(inv.hostPid), expires: integer(inv.expires), outbound: boolean(inv.outbound), seats };
  });
  let event: TagState['event'];
  if (o.event !== undefined) { const e = object(o.event); event = { id: string(e.id), kind: string(e.kind), at: integer(e.at), ...(e.name === undefined ? {} : { name: string(e.name) }) }; }
  return { self: player(o.self), active: boolean(o.active), available: boolean(o.available), players: array(o.players, player), invitations,
    ...(o.reason === undefined ? {} : { reason: string(o.reason) }), ...(event ? { event } : {}), ...(o.started === undefined ? {} : { started: boolean(o.started) }) };
}
export function decodeDuelInvite(value: unknown): { ok: true; room: number } {
  const o = object(value); if (o.ok !== true) throw new TypeError('Duel invitation failed'); return { ok: true, room: integer(o.room) };
}
export interface FriendInfo extends NamedPlayer { online: boolean; place?: string }
export function decodeFriends(value: unknown): { friends: FriendInfo[] } {
  return { friends: array(object(value).friends, v => {
    const o = object(v); return { ...player(o), online: boolean(o.online), ...(o.place === undefined ? {} : { place: string(o.place) }) };
  }) };
}
