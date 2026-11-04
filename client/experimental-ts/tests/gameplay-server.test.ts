/** End-to-end payload evidence through real server handlers; no browser/network implementation dependency. */
import { afterEach, expect, it, vi } from 'vitest';
import { tagApi, TAG_INVITE_COOLDOWN } from '../../../server/src/duel/tagRelay';
import { decodeTagState, decodeDuelInvite, decodeFriends, gameplayHttp } from '../src/gameplay';
import { harness, pc } from '../../../server/test/notes-harness';
import type { Client, Link } from '../../../server/test/notes-harness';
import { decodeGameplayMessage, decodeMatchOffer, decodeNpcs, decodePlayers, decodeRooms, decodeTeamHeader, decodeTeamInvite, decodeTeamMembers, decodeTradeMessage, decodeWatchResult, duelCommands, socialCommands, tradeCommands, worldCommands } from '../src/gameplay';
import type { GameplayCommand } from '../src/gameplay';

afterEach(() => { vi.useRealTimers(); });
function send(link: Link, c: GameplayCommand): void { expect(c.channel).toBe('lobby'); link.send(c.id, c.data); }
async function ask(link: Link, c: GameplayCommand, reply: number): Promise<Uint8Array> {
  const mark = link.mark(); send(link, c); const data = await link.wait(reply, mark); expect(data).not.toBeNull(); return data!;
}
async function two() {
  const h = harness();
  const a = h.client('A', 'A', 'pw', 'user-a'), b = h.client('B', 'B', 'pw', 'user-b');
  await a.account(0, 'Alice'); await b.account(0, 'Bob');
  await a.enterRoom(); await b.enterRoom();
  return { h, a, b };
}
it('real NPC list -> raw NPC challenge -> create acknowledgement, opponent card, endpoint', async () => {
  const h = harness(), a = h.client('A'); await a.account(0, 'Alice'); await a.enterRoom();
  let mark = a.room!.mark(); send(a.room!, worldCommands.npcs());
  expect(await a.room!.wait(0x4233, mark)).not.toBeNull();
  const npcs = a.room!.all(0x4232, mark).flatMap(decodeNpcs);
  expect(npcs.find(n => n.id === 53)).toMatchObject({ previous: 52, threshold: 9, spot: 204 });
  mark = a.room!.mark(); send(a.room!, duelCommands.challengeNpc(51));
  const endpoint = await a.room!.wait(0x4306, mark);
  expect(endpoint).not.toBeNull();
  expect(a.room!.ids(mark)).toEqual(expect.arrayContaining([0x428a, 0x43a0, 0x4306]));
  expect(decodeGameplayMessage(0x428a, a.room!.all(0x428a, mark)[0])).toMatchObject({ code: 0 });
  expect(decodeGameplayMessage(0x43a0, a.room!.all(0x43a0, mark)[0])).toMatchObject({ value: { pid: 51, npcWindow: 0 } });
  expect(decodeGameplayMessage(0x4306, endpoint!)).toMatchObject({ value: { port: h.game.ports.duel + h.game.cfg.portOffset } });
});
it('real private PvP invite -> room challenge -> reject, and regular room -> accept -> both endpoints', async () => {
  const { h, a, b } = await two();
  const [status, response] = h.game.lp.duelInvite('user-a', b.pid!);
  const invitation = decodeDuelInvite(response);
  expect(status).toBe(200);
  let markB = b.room!.mark(), markA = a.room!.mark();
  send(a.room!, duelCommands.challengeRoom(invitation.room as number));
  const offer = await b.room!.wait(0x4302, markB);
  expect(decodeMatchOffer(offer!)).toMatchObject({ pid: a.pid, name: 'Alice' });
  send(b.room!, duelCommands.rejectInvite());
  const rejected = await a.room!.wait(0x4301, markA);
  expect(decodeGameplayMessage(0x4301, rejected!)).toMatchObject({ code: -618 });
  // A normal hosted room provides a second independent path, without invite cooldown.
  const roomMark = b.room!.mark(); send(b.room!, duelCommands.createRoom());
  const room = decodeRooms((await b.room!.wait(0x3113, roomMark))!)[0];
  markB = b.room!.mark(); markA = a.room!.mark();
  send(a.room!, duelCommands.challengeRoom(room.id));
  expect(await b.room!.wait(0x4302, markB)).not.toBeNull();
  send(b.room!, duelCommands.acceptInvite());
  expect(await a.room!.wait(0x4306, markA)).not.toBeNull();
  expect(await b.room!.wait(0x4306, markB)).not.toBeNull();
  expect(decodeGameplayMessage(0x4301, a.room!.all(0x4301, markA)[0])).toMatchObject({ code: 0 });
});
it('real player list, friends, ignore and teams consume semantic builders', async () => {
  const { h, a, b } = await two();
  const listMark = a.room!.mark(); send(a.room!, worldCommands.players());
  await a.room!.wait(0x4213, listMark);
  expect(a.room!.all(0x4212, listMark).flatMap(decodePlayers).map(p => p.pid)).toContain(b.pid);
  const friendMark = b.room!.mark();
  await ask(a.room!, socialCommands.requestFriend(b.pid!), 0x4511);
  expect(decodeGameplayMessage(0x4512, (await b.room!.wait(0x4512, friendMark))!)).toMatchObject({ value: { pid: a.pid, name: 'Alice' } });
  const replyMark = a.room!.mark(); send(b.room!, socialCommands.replyFriend(a.pid!, true));
  expect(decodeGameplayMessage(0x4515, (await a.room!.wait(0x4515, replyMark))!)).toMatchObject({ value: { accepted: true, pid: b.pid } });
  expect(decodeGameplayMessage(0x4531, await ask(a.room!, socialCommands.ignore(b.pid!), 0x4531))).toMatchObject({ code: 0 });
  await ask(a.room!, socialCommands.unignore(b.pid!), 0x4541);
  await ask(a.room!, socialCommands.createTeam('Team'), 0x4566);
  expect(decodeFriends(h.game.lp.friendsInfo('user-a')[1]).friends).toMatchObject([{ pid: b.pid, name: 'Bob', online: true }]);
  const inviteMark = b.room!.mark(); send(a.room!, socialCommands.inviteToTeam(b.pid!));
  const invite = decodeTeamInvite((await b.room!.wait(0x4567, inviteMark))!);
  const joinedMark = a.room!.mark(); send(b.room!, socialCommands.replyTeamInvite(invite.teamId, invite.inviterPid, true));
  expect(await a.room!.wait(0x4561, joinedMark)).not.toBeNull();
  const teamMark = a.room!.mark(); send(a.room!, socialCommands.team()); await a.room!.wait(0x4565, teamMark);
  expect(decodeTeamHeader(a.room!.all(0x4564, teamMark)[0])).toMatchObject({ count: 2, name: 'Team' });
  expect(a.room!.all(0x4559, teamMark).flatMap(decodeTeamMembers)).toMatchObject([{ pid: a.pid, authority: 14 }, { pid: b.pid, authority: 0 }]);
});
it('real trade offer, start, u32 passcode movement and acknowledgement; unknown spectate fails explicitly', async () => {
  const { a, b } = await two();
  const markB = b.room!.mark();
  expect(decodeTradeMessage(0x7103, await ask(a.room!, tradeCommands.request(b.pid!), 0x7103))).toMatchObject({ code: 0 });
  expect(decodeTradeMessage(0x7104, (await b.room!.wait(0x7104, markB))!)).toMatchObject({ type: 'offer', pid: a.pid });
  expect(decodeTradeMessage(0x7105, await ask(b.room!, tradeCommands.accept(), 0x7105))).toMatchObject({ code: 0 });
  for (const c of [a, b] as Client[]) {
    await ask(c.room!, tradeCommands.loadCollection(), 0x7131);
    await ask(c.room!, tradeCommands.start(), 0x7133);
  }
  const movementMark = b.room!.mark();
  await ask(a.room!, tradeCommands.addCard(89631139), 0x7113);
  expect(decodeTradeMessage(0x7116, (await b.room!.wait(0x7116, movementMark))!)).toEqual({ type: 'move', operation: 'add', value: 89631139 });
  const ackMark = a.room!.mark(); send(b.room!, tradeCommands.acknowledgeMove());
  expect(await a.room!.wait(0x7122, ackMark)).not.toBeNull();
  send(a.room!, tradeCommands.exit());
  const watch = decodeWatchResult(await ask(a.room!, duelCommands.spectate(999999), 0x4321));
  expect(watch).toEqual({ result: 1, endpoint: { host: '', port: 0 } });
});

it('real mail send/receive keeps the 653-byte server layout and sender identity', async () => {
  const { a, b } = await two();
  await ask(a.room!, socialCommands.sendMail(b.pid!, 'Hello', 'Body'), 0x4601);
  const mark = b.room!.mark(); send(b.room!, socialCommands.receiveMail());
  expect(await b.room!.wait(0x4613, mark)).not.toBeNull();
  expect(decodeGameplayMessage(0x4612, b.room!.all(0x4612, mark)[0])).toMatchObject({ value: { fromPid: a.pid, fromName: 'Alice', toPid: b.pid, subject: 'Hello', body: 'Body', read: false } });
});
it('tag descriptors reach real tagApi: decline, cancel, then unanimous acceptance starts four seats', async () => {
  const { h, a, b } = await two();
  const c = h.client('C', 'C', 'pw', 'user-c'), d = h.client('D', 'D', 'pw', 'user-d');
  await c.account(0, 'Carol'); await d.account(0, 'Dave'); await c.enterRoom(); await d.enterRoom();
  const apply = (user: string, request: ReturnType<typeof gameplayHttp.tagState>) => tagApi(h.game, user, request.method, request.path.slice('/api/de/tag'.length).replace(/^\//, ''), request.body);
  const invite = () => {
    const [status, response] = apply('user-a', gameplayHttp.inviteTag(c.pid!, b.pid!, d.pid!));
    expect(status).toBe(200); return decodeTagState(response).invitations[0];
  };
  const first = invite();
  expect(first.seats.map(s => s.pid)).toEqual([a.pid, b.pid, c.pid, d.pid]);
  expect(first.expires).toBeGreaterThan(Math.floor(Date.now() / 1000));
  let [status, response] = apply('user-b', gameplayHttp.respondTag('decline', first.id));
  expect(status).toBe(200); expect(decodeTagState(response).event?.kind).toBe('declined');
  await h.tick(TAG_INVITE_COOLDOWN);
  const second = invite();
  [status, response] = apply('user-a', gameplayHttp.respondTag('cancel', second.id));
  expect(status).toBe(200); expect(decodeTagState(response).event?.kind).toBe('cancelled');
  await h.tick(TAG_INVITE_COOLDOWN);
  const third = invite();
  for (const user of ['user-b', 'user-c', 'user-d']) {
    [status, response] = apply(user, gameplayHttp.respondTag('accept', third.id)); expect(status).toBe(200);
  }
  expect(decodeTagState(response)).toMatchObject({ started: true, active: true, invitations: [] });
});

it.each([false, true])('real final trade settlement validates bound cards (bound=%s)', async bound => {
  const { h, a, b } = await two();
  const giveA = pc(1), keepA = pc(3), giveB = pc(2), keepB = pc(4);
  const state = h.state();
  const accounts = Object.values(state.accounts ?? {}) as { idx: number; profiles: Record<string, { trunk: Record<string, number>; bound: Record<string, number> }> }[];
  const accountA = accounts.find(x => x.idx === 1)!, accountB = accounts.find(x => x.idx === 2)!;
  accountA.profiles['0'].trunk = { [giveA]: 1, [keepA]: 39 }; accountA.profiles['0'].bound = bound ? { [giveA]: 1 } : {};
  accountB.profiles['0'].trunk = { [giveB]: 1, [keepB]: 39 }; accountB.profiles['0'].bound = {};
  h.game.store.saveRaw(state);
  await ask(a.room!, tradeCommands.request(b.pid!), 0x7103);
  await ask(b.room!, tradeCommands.accept(), 0x7105);
  for (const who of [a, b]) { await ask(who.room!, tradeCommands.loadCollection(), 0x7131); await ask(who.room!, tradeCommands.start(), 0x7133); }
  for (const [who, other, card] of [[a, b, giveA], [b, a, giveB]] as const) {
    const mark = other.room!.mark(); send(who.room!, tradeCommands.addCard(card));
    expect(await other.room!.wait(0x7116, mark)).not.toBeNull(); send(other.room!, tradeCommands.acknowledgeMove());
  }
  const markA = a.room!.mark(), markB = b.room!.mark();
  send(a.room!, tradeCommands.ready()); send(b.room!, tradeCommands.ready());
  expect(await a.room!.wait(0x7118, markA)).not.toBeNull();
  expect(await b.room!.wait(0x7118, markB)).not.toBeNull();
  send(a.room!, tradeCommands.confirm(true)); send(b.room!, tradeCommands.confirm(true));
  const end = await a.room!.wait(0x7121, markA);
  expect(decodeTradeMessage(0x7121, end!)).toEqual({ type: 'end', success: !bound });
  expect(decodeTradeMessage(0x7120, a.room!.all(0x7120, markA)[0])).toEqual({ type: 'confirmResult', result: 3 });
  const after = Object.values(h.state().accounts ?? {}) as typeof accounts;
  expect(after.find(x => x.idx === 1)!.profiles['0'].trunk).toEqual(bound ? { [giveA]: 1, [keepA]: 39 } : { [giveB]: 1, [keepA]: 39 });
});
