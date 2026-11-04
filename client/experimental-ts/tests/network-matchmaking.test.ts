import { afterEach, describe, expect, it, vi } from 'vitest';
import { NPC_DECKS, setDuelCore } from '../../../server/src/duel/data';
import { createNodeDuelCore } from '../../../server/src/duel/engine/node';
import { BinaryWriter } from '../src/network/codec';
import { GameSession } from '../src/network/session';
import { drive, setup } from './network-server-fixture';
afterEach(() => { vi.clearAllTimers(); vi.useRealTimers(); setDuelCore(null); });
async function pair(freeSecond = false) {
  const a = setup(undefined,'find-a',{ PVP_TEST:'1' }), b = setup(a.server,'find-b');
  if (freeSecond) { b.session.dispose(); b.session = new GameSession({ ...b.session.options,freeMode:true }); }
  for (const [fixture,name] of [[a,'Find A'],[b,'Find B']] as const) {
    await drive(fixture.session.start()); await drive(fixture.session.createCharacter(0,name)); await drive(fixture.session.selectCharacter(0));
  }
  return { a,b };
}
const rawAutoRoom = (style:number) => new BinaryWriter().u8(style).u8(0).u8(1).u8(0).raw(new Uint8Array(16)).u8(0).u8(1).u8(1).u8(0).u32(0).bytes();

describe('automatic matchmaking against the existing server', () => {
  it('counts visible single/either queues, supports reset and cancellation, and does not manufacture a reservation', async () => {
    const { a,b } = await pair();
    try {
      await drive(a.session.startMatchmaking({ style:6,similarLevel:false })); await drive(b.session.refreshMatchmaking());
      expect(a.session.state.matchmaking).toMatchObject({ status:'searching',style:6,similarLevel:false,counts:{single:0,match:0,either:1},matchSupported:false });
      expect(b.session.state.matchmaking.counts.either).toBe(1);
      await expect(a.session.startNpcDuel(51,NPC_DECKS['51'])).rejects.toThrow('Cancel');
      await expect(a.session.createDuelRoom()).rejects.toThrow('Cancel');
      expect(() => a.session.challengeRoom(1)).toThrow('Cancel');
      await expect(a.session.watchDuel(b.session.state.profile!.pid)).rejects.toThrow('Cancel');
      await drive(a.session.retryMatchmaking()); await vi.advanceTimersByTimeAsync(1500);
      expect(a.session.state.duelOffer).toBeNull();
      await drive(a.session.cancelMatchmaking()); await vi.advanceTimersByTimeAsync(1500);
      expect(a.session.state.matchmaking.status).toBe('idle'); expect(a.session.state.duelOffer).toBeNull();
      expect(b.session.state.matchmaking.counts.either).toBe(0);
      await expect(a.session.startMatchmaking({ style:4 })).rejects.toThrow('not supported');
      await drive(a.session.startMatchmaking()); await drive(a.session.deleteDuelRoom());
      expect(a.session.state.matchmaking.status).toBe('idle');
    } finally { a.session.dispose(); b.session.dispose(); }
  });
  it('pairs single with either, retains rival identities, prepares the actual duel and returns after a result', async () => {
    setDuelCore(await createNodeDuelCore()); const { a,b } = await pair();
    try {
      await drive(a.session.startMatchmaking({ style:6 })); await drive(b.session.startMatchmaking({ style:3 })); await vi.advanceTimersByTimeAsync(1500);
      expect(a.session.state.matchmaking).toMatchObject({ status:'matched',opponent:{pid:b.session.state.profile!.pid,name:'Find B'} });
      expect(b.session.state.matchmaking).toMatchObject({ status:'matched',opponent:{pid:a.session.state.profile!.pid,name:'Find A'} });
      await expect(a.session.cancelMatchmaking()).rejects.toThrow('already been found');
      await drive(Promise.all([a.session.acceptDuelOffer(NPC_DECKS['51']),b.session.acceptDuelOffer(NPC_DECKS['54'])]));
      expect(a.session.state.match).toBeNull(); expect(b.session.state.match).toBeNull();
      await drive(Promise.all([a.session.chooseHand(0),b.session.chooseHand(1)])); await drive(a.session.chooseFirst(true));
      a.session.beginDuel(false); b.session.beginDuel(false); await vi.advanceTimersByTimeAsync(1000);
      a.session.sendDuel(0x6350,new BinaryWriter().u32(0).u32(13).u32(0).u32(10).bytes()); await vi.advanceTimersByTimeAsync(100);
      a.session.sendDuel(0x6423,new BinaryWriter().u32(1).bytes()); await vi.advanceTimersByTimeAsync(2500);
      await drive(Promise.all([a.session.finishDuel(),b.session.finishDuel()]));
      expect([a.session.state.matchmaking.status,b.session.state.matchmaking.status]).toEqual(['idle','idle']);
    } finally { a.session.dispose(); b.session.dispose(); }
  },20000);
  it('preserves the server boundary: native style-4 auto queues are visible but never paired', async () => {
    const { a,b } = await pair();
    try {
      await drive(a.session.lobby!.request(0x4288,rawAutoRoom(4),0x428a)); await drive(b.session.lobby!.request(0x4288,rawAutoRoom(4),0x428a));
      await drive(a.session.refreshMatchmaking()); await vi.advanceTimersByTimeAsync(2000);
      expect(a.session.state.matchmaking.counts.match).toBe(2);
      expect(a.session.state.duelOffer).toBeNull(); expect(b.session.state.duelOffer).toBeNull();
    } finally { a.session.dispose(); b.session.dispose(); }
  });
  it('enforces the existing five-level filter when either search requests it and pairs when both turn it off', async () => {
    const { a,b } = await pair();
    try {
      const state = a.server.game.store.loadRaw(), account = a.server.game.store.accountOfUser('find-b')!;
      state.accounts[account].profiles['0'].rec.lv = 7; a.server.game.store.saveRaw(state);
      await drive(a.session.startMatchmaking({ similarLevel:true })); await drive(b.session.startMatchmaking({ similarLevel:false }));
      await vi.advanceTimersByTimeAsync(1500);
      expect(a.session.state.duelOffer).toBeNull(); expect(b.session.state.duelOffer).toBeNull();
      await drive(a.session.startMatchmaking({ similarLevel:false })); await vi.advanceTimersByTimeAsync(1500);
      expect(a.session.state.matchmaking).toMatchObject({ status:'matched',opponent:{level:7} });
      expect(b.session.state.matchmaking).toMatchObject({ status:'matched',opponent:{level:1} });
    } finally { a.session.dispose(); b.session.dispose(); }
  });
  it('keeps FREE and MMO searches in separate actual server blocks', async () => {
    const { a,b } = await pair(true);
    try {
      await drive(a.session.startMatchmaking()); await drive(b.session.startMatchmaking()); await vi.advanceTimersByTimeAsync(2000);
      const players = [...a.server.game.hub.sessions.values()];
      expect(players[0].block).not.toBe(players[1].block);
      expect(players.some(p => p.block?.endsWith('|f'))).toBe(true);
      expect(a.session.state.duelOffer).toBeNull(); expect(b.session.state.duelOffer).toBeNull();
      expect(a.session.state.matchmaking.counts.single).toBe(1); expect(b.session.state.matchmaking.counts.single).toBe(1);
      await drive(Promise.all([a.session.cancelMatchmaking(),b.session.cancelMatchmaking()]));
    } finally { a.session.dispose(); b.session.dispose(); }
  });
});
