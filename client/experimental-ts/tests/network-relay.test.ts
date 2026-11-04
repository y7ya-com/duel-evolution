import { afterEach, describe, expect, it, vi } from 'vitest';
import { NPC_DECKS, setDuelCore } from '../../../server/src/duel/data';
import { createNodeDuelCore } from '../../../server/src/duel/engine/node';
import { tagApi } from '../../../server/src/duel/tagRelay';
import { createDuelState, reduceDuelMessage, encodeDuelResponse } from '../src/duel';
import { decodeRelayIdentity } from '../src/network/session';
import { drive, setup } from './network-server-fixture';
afterEach(() => { vi.clearAllTimers(); vi.useRealTimers(); setDuelCore(null); });

describe('four-seat relay through actual game authority', () => {
  it('rejects malformed or ambiguous identity control messages', () => {
    expect(decodeRelayIdentity('TAG1:')).toBeNull();
    expect(decodeRelayIdentity('TAG1:'+'00'.repeat(211))).toBeNull();
    expect(decodeRelayIdentity('TAG1:'+'00'.repeat(212))).toBeNull();
  });
  it('attaches both partners without RPS, waits for all four, rotates control, rejects inactive input and returns all four', async () => {
    setDuelCore(await createNodeDuelCore());
    const a = setup(undefined,'relay-a',{ PVP_TEST:'1' }), b = setup(a.server,'relay-b'), c = setup(a.server,'relay-c'), d = setup(a.server,'relay-d');
    const fixtures = [a,b,c,d], sessions = fixtures.map(f => f.session), users = ['relay-a','relay-b','relay-c','relay-d'];
    const boards = sessions.map(() => createDuelState()), answered = [0,0,0,0], actions = [0,0,0,0];
    try {
      for (let i = 0; i < 4; i++) { await drive(sessions[i].start()); await drive(sessions[i].createCharacter(0,['Captain A','Captain B','Partner A','Partner B'][i])); await drive(sessions[i].selectCharacter(0)); }
      let response: ReturnType<typeof tagApi> | undefined;
      await a.server.world.run(() => { response = tagApi(a.server.game,users[0],'POST','invite',{ teammatePid:sessions[2].state.profile!.pid,opponentPid:sessions[1].state.profile!.pid,opponentTeammatePid:sessions[3].state.profile!.pid }); });
      expect(response![0]).toBe(200);
      const id = (response![1].invitations as { id:string }[])[0].id;
      for (const i of [1,2,3]) await a.server.world.run(() => { response = tagApi(a.server.game,users[i],'POST','accept',{ id }); });
      expect(response![1].started).toBe(true); await vi.advanceTimersByTimeAsync(100);
      // Captains can prepare before partner tunnels attach. Partners get the buffered preparation.
      const captains = Promise.all(sessions.slice(0,2).map(s => s.acceptDuelOffer(NPC_DECKS['51'])));
      await drive(captains).catch(error => { throw new Error(String(error)+'\n'+a.logs.join('\n')+'\n'+JSON.stringify(fixtures.map(f => f.received.map(id=>id.toString(16))))); });
      await drive(Promise.all(sessions.slice(2).map(s => s.acceptDuelOffer(NPC_DECKS['51']))));
      expect(sessions.map(s => s.state.duelRole)).toEqual(['player','player','partner','partner']);
      expect(sessions.slice(2).every(s => s.state.phase === 'preparing-duel')).toBe(true);
      await drive(Promise.all([sessions[0].chooseHand(0),sessions[1].chooseHand(1)])); await drive(sessions[0].chooseFirst(true)); await vi.advanceTimersByTimeAsync(100);
      expect(sessions.map(s => s.state.duelFirst)).toEqual([0,1,0,1]);
      sessions.forEach((s,i) => s.duel!.subscribe(message => { if ([0x6202,0x6610,0x6611,0x6612,0x6461,0x6613,0x649b].includes(message.id)) boards[i] = reduceDuelMessage(boards[i],message); }));
      // Partners report ready on attach (their screen offers no Start Duel); the relay then waits for both captains.
      sessions[0].beginDuel(false); await vi.advanceTimersByTimeAsync(500);
      expect(boards.every(board => board.status === 'idle')).toBe(true);
      expect(sessions.slice(2).map(s => s.state.phase)).toEqual(['preparing-duel','preparing-duel']);
      sessions[1].beginDuel(false);
      for (let step = 0; step < 1000 && !sessions[2].state.relay?.canAct; step++) {
        await vi.advanceTimersByTimeAsync(20);
        for (let i = 0; i < 4; i++) {
          const state = boards[i], prompt = state.prompt;
          if (!sessions[i].state.relay?.canAct || !state.acceptingInput || !prompt || answered[i] === prompt.id) continue;
          answered[i] = prompt.id;
          const response = prompt.kind === 'actions' && prompt.buttons.includes(5) ? { type:'phase' as const,phase:5 }
            : prompt.kind === 'yesno' ? { type:'yesno' as const,yes:false }
            : prompt.kind === 'cards' ? { type:'cards' as const,indices:Array.from({ length:Math.max(1,prompt.min) },(_,j) => j).slice(0,prompt.max) }
            : prompt.options.length ? { type:'answer' as const,value:prompt.options[0].value }
            : { type:'cancel' as const };
          for (const packet of encodeDuelResponse(state,response)) sessions[i].sendDuel(packet.id,packet.data);
          actions[i]++;
        }
      }
      expect(sessions.every(s => s.state.relay?.players.length === 4)).toBe(true);
      expect(sessions.map(s => s.state.phase)).toEqual(['duel','duel','duel','duel']);
      expect(sessions[2].state.relay).toMatchObject({ self:1,active:[1,0],canAct:true });
      expect(sessions[0].state.relay?.canAct).toBe(false);
      expect(sessions[2].state.relay!.players.map(p => p.name)).toEqual(['Captain A','Partner A','Captain B','Partner B']);
      expect(actions[0]+actions[1]).toBeGreaterThan(0);
      expect(() => sessions[0].sendDuel(0x6351)).toThrow('active relay pilot');
      // Pilot receives an ordinary prompt; no test opcodes or engine auto-action calls are used.
      for (let step = 0; step < 200 && !boards[2].acceptingInput; step++) await vi.advanceTimersByTimeAsync(20);
      expect(boards[2].acceptingInput).toBe(true);
      expect(boards.every(board => !board.errors.length && !board.unsupported.length)).toBe(true);
      sessions[2].sendDuel(0x6350,new Uint8Array([0,0,0,0,0,0,0,13,0,0,0,0,0,0,0,10])); await vi.advanceTimersByTimeAsync(100);
      sessions[2].sendDuel(0x6423,new Uint8Array([0,0,0,1])); await vi.advanceTimersByTimeAsync(3000);
      expect(boards.map(board => board.result?.result)).toEqual([2,1,2,1]);
      await drive(Promise.all(sessions.map(s => s.finishDuel())));
      expect(sessions.every(s => s.state.phase === 'lobby')).toBe(true);
    } finally { sessions.forEach(s => s.dispose()); }
  },20000);
});
