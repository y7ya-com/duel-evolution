import { describe, expect, it } from 'vitest';
import { W } from '../../../server/src/net/proto';
import { decodeGameplayMessage, decodeAvatars, decodeMail, decodeMatchOffer, decodeNpcs, decodePlayers, decodePresence, decodeRooms, decodeTradeMessage, duelCommands, gameplayHttp, initialTradeView, reduceTradeView, socialCommands, tradeCommands, worldCommands } from '../src/gameplay';

const cat = (...parts: Uint8Array[]) => Uint8Array.from(parts.flatMap(p => [...p]));
const parts = Uint8Array.from({ length: 16 }, (_, i) => i);
// Server W is deliberately independent of the browser writer: offsets are server/src/game encodings.
const player = (pid: number) => new W().u32(pid).s('André', 16).u8(7).u16(90).u16(12).u16(4).u16(0).u8(0).s('ES', 4).u8(0).u8(3).bytes();
const avatarBody = (state = 1) => new W().u8(state).raw(parts).u16(400).u16(300).u8(2).bytes();
const rival = () => new W().s('Rival', 16).u8(9).u16(11).u16(2).u16(5).bytes();

describe('gameplay wire contracts from current server encodings', () => {
  it('creates NPC requests with raw NPC id at offset 24; uses room id for PvP', () => {
    const npc = duelCommands.challengeNpc(51);
    expect(npc).toEqual({ channel: 'lobby', id: 0x4288, data: new W().u8(3).u8(0).u8(0).u8(0).raw(new Uint8Array(16)).u8(0).u8(1).u8(1).u8(1).u32(51).bytes() });
    expect(new DataView(npc.data.buffer).getUint32(24)).toBe(51);
    expect(() => duelCommands.challengeNpc(100051)).toThrow();
    expect(duelCommands.challengeRoom(1000).data).toEqual(new W().u32(1000).raw(new Uint8Array(16)).bytes());
    expect(duelCommands.acceptInvite().data).toEqual(new W().u32(1).bytes());
    expect(duelCommands.rejectInvite().data).toEqual(new W().u32(0).bytes());
    expect(duelCommands.spectate(1004)).toMatchObject({ id: 0x4320, data: new W().u32(1004).bytes() });
  });
  it('distinguishes match offer from NPC/PvP opponent card and duel endpoint', () => {
    const offer = new W().u32(1004).s('Bob', 16).u8(0).u8(9).u16(5).u16(0).raw(parts).bytes();
    expect(decodeMatchOffer(offer)).toMatchObject({ pid: 1004, level: 9, title: 5, parts });
    const card = new W().u32(51).s('Yugi', 16).u8(0).u16(0).u16(0).raw(parts).u8(0).bytes();
    expect(decodeGameplayMessage(0x43a0, card)).toMatchObject({ type: 'data', value: { pid: 51, name: 'Yugi', npcWindow: 0 } });
    expect(decodeGameplayMessage(0x4306, new W().s('127.0.0.1', 15).u16(5733).bytes())).toMatchObject({ value: { host: '127.0.0.1', port: 5733 } });
    expect(decodeGameplayMessage(0x4301, new W().u32(-618).bytes())).toEqual({ type: 'result', id: 0x4301, code: -618 });
    expect(decodeGameplayMessage(0x4321, new W().u32(1).s('', 15).u16(0).bytes())).toMatchObject({ value: { result: 1, endpoint: { host: '', port: 0 } } });
  });
  it('decodes concatenated LIST1, mixed variable-length LIST2, and full/compact presence', () => {
    expect(decodePlayers(cat(player(1000), player(1004)))).toMatchObject([{ pid: 1000, name: 'André', wins: 90, block: 3 }, { pid: 1004 }]);
    const av = cat(new W().u32(1000).raw(avatarBody()).bytes(), new W().u32(1004).raw(avatarBody(0x67)).raw(rival()).bytes());
    expect(decodeAvatars(av)).toMatchObject([{ pid: 1000, x: 400, y: 300 }, { pid: 1004, rival: { name: 'Rival', wins: 11 } }]);
    const join = new W().u32(1000).u8(1).u8(3).raw(player(1000)).raw(avatarBody()).u32(9).s('Team', 16).raw(parts).bytes();
    expect(decodePresence(join)).toMatchObject({ kind: 'join', pid: 1000, player: { level: 7 }, avatar: { parts }, team: { teamId: 9, flag: parts } });
    expect(decodePresence(new W().u32(1000).u8(0x67).u8(3).raw(rival()).bytes())).toMatchObject({ kind: 'state', state: 0x67, rival: { title: 5 } });
    expect(decodePresence(new W().u32(1000).u8(0).u8(0).bytes())).toEqual({ kind: 'leave', pid: 1000, block: 0 });
  });
  it('decodes exact 61-byte NPC entry and 19-byte room removal', () => {
    const npc = new W().u32(53).s('Yugi', 16).raw(parts).u8(0).u32(0).u32(0).u32(9).u32(204).u32(0).u32(52).bytes();
    expect(npc.length).toBe(61);
    expect(decodeNpcs(npc)).toMatchObject([{ id: 53, threshold: 9, spot: 204, previous: 52 }]);
    expect(decodeRooms(new W().u32(1001).u32(0).u32(0).u8(0).u8(3).u8(0).u8(0).u8(1).u8(1).u8(1).bytes())).toMatchObject([{ id: 1001, hostPid: 0, guestPid: 0, rules: [1, 1, 1] }]);
  });
  it('uses current social field order and preserves Latin-1', () => {
    expect(socialCommands.replyFriend(1004, true).data).toEqual(new W().u32(1004).u32(1).bytes());
    expect(socialCommands.replyTeamInvite(8, 1000, false).data).toEqual(new W().u32(0).u32(8).u32(1000).bytes());
    expect(socialCommands.inviteToTeam(1004)).toMatchObject({ id: 0x4554, data: new W().u32(1004).bytes() });
    const mail = new W().u32(1000).s('André', 16).u32(1004).s('Bob', 16).u32(123).s('Hi', 32).s('Body', 512).s('', 64).u8(1).bytes();
    expect(mail.length).toBe(653);
    expect(decodeMail(mail)).toMatchObject({ fromName: 'André', timestamp: 123, subject: 'Hi', body: 'Body', read: true });
    expect(socialCommands.sendMail(1004, 'Hi', 'Body').data.length).toBe(612);
    expect(socialCommands.ignore(1004).id).toBe(0x4530);
    expect(socialCommands.unignore(1004).id).toBe(0x4540);
    expect(worldCommands.registerAvatar(1, parts).data.length).toBe(24);
  });
  it('keeps HTTP-only direct invitations and tag decline/cancel outside binary commands', () => {
    expect(gameplayHttp.inviteDuel(1004)).toEqual({ method: 'POST', path: '/api/de/duel/challenge', body: { pid: 1004 } });
    expect(gameplayHttp.inviteTag(1004, 1008, 1012).body).toEqual({ teammatePid: 1004, opponentPid: 1008, opponentTeammatePid: 1012 });
    expect(gameplayHttp.respondTag('decline', 'uuid')).toEqual({ method: 'POST', path: '/api/de/tag/decline', body: { id: 'uuid' } });
    expect(() => gameplayHttp.inviteTag(1, 1, 2)).toThrow();
  });
  it('wraps trade commands and follows incoming move/ready/back/end semantics immutably', () => {
    expect(tradeCommands.addCard(89631139)).toMatchObject({ id: 0x7000, data: new W().u16(0x7113).u32(89631139).bytes() });
    expect(tradeCommands.removeCard(2).data).toEqual(new W().u16(0x7114).u16(2).bytes());
    expect(tradeCommands.confirm(false).data).toEqual(new W().u16(0x7119).u8(2).bytes());
    expect(tradeCommands.abort().data).toEqual(new W().u16(0x7128).bytes());
    expect(tradeCommands.acknowledgeMove().data).toEqual(new W().u16(0x7122).bytes());
    const initial = initialTradeView();
    let state = reduceTradeView(initial, decodeTradeMessage(0x7116, new W().u32(89631139).u8(0).bytes())!);
    state = reduceTradeView(state, { type: 'otherReady', ready: true });
    state = reduceTradeView(state, { type: 'ready', ready: true });
    state = reduceTradeView(state, { type: 'allReady' });
    expect(state).toMatchObject({ otherOffer: [89631139], allReady: true });
    state = reduceTradeView(state, decodeTradeMessage(0x7120, Uint8Array.of(2))!);
    expect(state).toMatchObject({ otherOffer: [89631139], ready: false, otherReady: false, allReady: false });
    state = reduceTradeView(state, { type: 'move', operation: 'remove', value: 0 });
    expect(state.otherOffer).toEqual([]);
    expect(initial.otherOffer).toEqual([]);
    expect(decodeTradeMessage(0x7126, new W().u32(89631139).u8(3).bytes())).toEqual({ type: 'cards', table: 'trunk', cards: [{ passcode: 89631139, count: 3 }] });
    expect(decodeTradeMessage(0x7103, new W().u32(-493).bytes())).toMatchObject({ code: -493 });
    expect(decodeTradeMessage(0x7121, Uint8Array.of(0))).toEqual({ type: 'end', success: false });
  });
  it('rejects truncated known packets, ignores unknown opcodes, respects byte offsets and copies data', () => {
    for (const [id, size] of [[0x4212, 36], [0x4232, 61], [0x4302, 42], [0x4612, 653], [0x7116, 5], [0x5340, 29]]) {
      for (let length = 1; length < size; length++) expect(() => decodeGameplayMessage(id, new Uint8Array(length))).toThrow();
    }
    expect(decodeGameplayMessage(0xdead, new Uint8Array())).toBeNull();
    const padded = cat(Uint8Array.of(99), player(1000), Uint8Array.of(99));
    expect(decodePlayers(padded.subarray(1, 37))[0].pid).toBe(1000);
    const data = new W().u32(1000).raw(avatarBody()).bytes();
    const decoded = decodeAvatars(data)[0]; data.fill(255);
    expect(decoded.parts).toEqual(parts);
    expect(() => worldCommands.move(1, -1, 0, 0)).toThrow();
  });
});
