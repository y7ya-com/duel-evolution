import { afterEach, describe, expect, it, vi } from 'vitest';
import { NPC_DECKS, setDuelCore } from '../../../server/src/duel/data';
import { createNodeDuelCore } from '../../../server/src/duel/engine/node';
import { BinaryWriter } from '../src/network/codec';
import { validateSideboard, type DuelDeck } from '../src/network/session';
import { drive, setup } from './network-server-fixture';
afterEach(() => { vi.clearAllTimers(); vi.useRealTimers(); setDuelCore(null); });
async function matchPair() {
  setDuelCore(await createNodeDuelCore());
  const a = setup(undefined,'match-a',{ PVP_TEST:'1' }), b = setup(a.server,'match-b');
  for (const [fixture,name] of [[a,'Match A'],[b,'Match B']] as const) {
    await drive(fixture.session.start()); await drive(fixture.session.createCharacter(0,name)); await drive(fixture.session.selectCharacter(0));
  }
  await drive(a.session.createDuelRoom({ style:4 })); await drive(b.session.refreshRooms());
  const room = b.session.state.rooms.find(r => r.owner === a.session.state.profile!.pid)!;
  b.session.challengeRoom(room.id); await vi.advanceTimersByTimeAsync(100); a.session.replyToChallenge(true); await vi.advanceTimersByTimeAsync(100);
  const decks: [DuelDeck,DuelDeck] = [{ ...NPC_DECKS['51'],side:[89631139] },{ ...NPC_DECKS['54'],side:[89631139] }];
  await drive(Promise.all([a.session.acceptDuelOffer(decks[0]),b.session.acceptDuelOffer(decks[1])]));
  expect([a.session.state.match?.round,b.session.state.match?.round]).toEqual([1,1]);
  await drive(Promise.all([a.session.chooseHand(0),b.session.chooseHand(1)])); await drive(a.session.chooseFirst(true));
  a.session.beginDuel(false); b.session.beginDuel(false); await vi.advanceTimersByTimeAsync(2000);
  return { a,b,decks };
}
async function surrender(session: ReturnType<typeof setup>['session']) {
  session.sendDuel(0x6350,new BinaryWriter().u32(0).u32(13).u32(0).u32(10).bytes());
  await vi.advanceTimersByTimeAsync(100); session.sendDuel(0x6423,new BinaryWriter().u32(1).bytes()); await vi.advanceTimersByTimeAsync(2500);
}
describe('actual-server MATCH rounds and sideboarding', () => {
  it('preserves the original pool, every zone count and duplicate multiplicity', () => {
    const original = { main:[1,1,2],side:[3],extra:[4] };
    expect(() => validateSideboard(original,{ main:[1,2,3],side:[1],extra:[4] })).not.toThrow();
    expect(() => validateSideboard(original,{ main:[1,2],side:[1,3],extra:[4] })).toThrow('counts');
    expect(() => validateSideboard(original,{ main:[1,2,3],side:[3],extra:[4] })).toThrow('pool');
    expect(() => validateSideboard(original,{ main:[1,1,4],side:[3],extra:[2] })).toThrow('Extra');
  });
  it('plays three games on one reservation, swaps Main/Side, lets the loser choose, resumes during siding and reopens the next room', async () => {
    const { a,b,decks } = await matchPair();
    try {
      const channels = [a.session.duel,b.session.duel];
      await surrender(b.session);
      expect(a.session.state.match).toMatchObject({ round:1,scores:[1,0,0],stage:'sideboarding',complete:false,chooser:false });
      expect(b.session.state.match).toMatchObject({ scores:[0,1,0],chooser:true });
      expect(a.session.state.match!.sideboardDeadline).toBeGreaterThan(Date.now());
      await expect(a.session.finishDuel()).rejects.toThrow('Complete the match');
      const changed = { main:[...decks[0].main],side:[...decks[0].side!],extra:[...decks[0].extra] };
      [changed.main[0],changed.side[0]] = [changed.side[0],changed.main[0]];
      await expect(a.session.submitSideboard({ ...changed,side:[] })).rejects.toThrow('counts');
      expect(a.session.state.match?.round).toBe(1);
      a.sockets[0].close(); await vi.advanceTimersByTimeAsync(2000);
      expect(a.session.duel).toBe(channels[0]); expect(a.session.state.connection).toBe('connected');
      await drive(Promise.all([a.session.submitSideboard(changed),b.session.submitSideboard(decks[1])]));
      expect(a.session.state.match?.round).toBe(2); expect(b.session.state.phase).toBe('choose-first');
      expect(a.session.state.phase).toBe('preparing-duel');
      await drive(b.session.chooseFirst(true)); await vi.advanceTimersByTimeAsync(100);
      expect(a.session.state.duelFirst).toBe(1); expect(b.session.state.duelFirst).toBe(0);
      a.session.beginDuel(false); b.session.beginDuel(false); await vi.advanceTimersByTimeAsync(2000);
      await surrender(a.session);
      expect(a.session.state.match).toMatchObject({ round:2,scores:[1,1,0],complete:false,chooser:true });
      await drive(Promise.all([a.session.submitSideboard(decks[0]),b.session.submitSideboard(decks[1])]));
      await drive(a.session.chooseFirst(true)); a.session.beginDuel(false); b.session.beginDuel(false); await vi.advanceTimersByTimeAsync(2000);
      await surrender(b.session);
      expect(a.session.state.match).toMatchObject({ round:3,scores:[2,1,0],stage:'complete',complete:true });
      expect(b.session.state.match).toMatchObject({ scores:[1,2,0],complete:true });
      expect([a.session.duel,b.session.duel]).toEqual(channels);
      await drive(Promise.all([a.session.finishDuel(),b.session.finishDuel()]));
      await drive(b.session.createDuelRoom({ style:4 })); await drive(a.session.refreshRooms());
      expect(a.session.state.rooms.some(r => r.owner === b.session.state.profile!.pid && r.style === 4)).toBe(true);
      expect(a.logs.some(line => /bad MD5|sequence gap/.test(line))).toBe(false);
    } finally { a.session.dispose(); b.session.dispose(); }
  },20000);
  it('keeps the same round and permits retry when an interrupted tunnel outlasts the sideboard acknowledgement timer', async () => {
    const { a,b,decks } = await matchPair();
    try {
      await surrender(b.session);
      const duel = a.session.duel!, request = duel.request.bind(duel);
      vi.spyOn(duel,'request').mockImplementationOnce((id,data,responseId) => request(id,data,responseId,50));
      let interrupted = false;
      a.session.gateway.options.onOutgoing = (channel,message) => {
        if (channel === duel && message.id === 0x6100 && !interrupted) { interrupted = true; a.sockets[0].close(); }
      };
      await expect(drive(a.session.submitSideboard(decks[0]))).rejects.toThrow('Timed out');
      expect(a.session.state.match).toMatchObject({ round:1,stage:'sideboarding',complete:false });
      await expect(a.session.submitSideboard(decks[0])).rejects.toThrow('resume');
      await vi.advanceTimersByTimeAsync(1000);
      expect(a.session.state.connection).toBe('connected'); expect(a.session.duel).toBe(duel);
      await drive(Promise.all([a.session.submitSideboard(decks[0]),b.session.submitSideboard(decks[1])]));
      expect(a.session.state.match).toMatchObject({ round:2,stage:'preparing' });
      await drive(b.session.chooseFirst(true)); a.session.beginDuel(false); b.session.beginDuel(false);
      await vi.advanceTimersByTimeAsync(1000); await surrender(b.session);
      expect(a.session.state.match).toMatchObject({ round:2,scores:[2,0,0],complete:true });
    } finally { a.session.dispose(); b.session.dispose(); }
  },20000);
  it('expires the authoritative sideboard clock when one player submits and the other does not', async () => {
    const { a,b,decks } = await matchPair();
    try {
      await surrender(b.session);
      await drive(a.session.submitSideboard(decks[0]));
      await vi.advanceTimersByTimeAsync(195000);
      expect(a.session.state.match).toMatchObject({ stage:'complete',complete:true });
      expect(b.session.state.match).toMatchObject({ stage:'complete',complete:true });
      await expect(b.session.submitSideboard(decks[1])).rejects.toThrow('unavailable');
      await drive(Promise.all([a.session.finishDuel(),b.session.finishDuel()]));
      expect([a.session.state.phase,b.session.state.phase]).toEqual(['lobby','lobby']);
    } finally { a.session.dispose(); b.session.dispose(); }
  },20000);
  it('ends after two straight wins', async () => {
    const { a,b,decks } = await matchPair();
    try {
      await surrender(b.session);
      await drive(Promise.all([a.session.submitSideboard(decks[0]),b.session.submitSideboard(decks[1])]));
      await drive(b.session.chooseFirst(true)); a.session.beginDuel(false); b.session.beginDuel(false); await vi.advanceTimersByTimeAsync(2000);
      await surrender(b.session);
      expect(a.session.state.match).toMatchObject({ round:2,scores:[2,0,0],complete:true });
    } finally { a.session.dispose(); b.session.dispose(); }
  },20000);
});
