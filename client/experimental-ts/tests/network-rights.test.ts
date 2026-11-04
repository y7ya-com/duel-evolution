import { afterEach, describe, expect, it, vi } from 'vitest';
import * as PP from '../../../server/src/game/persist';
import { shopView, shopPurchaseApi } from '../../../server/src/game/shop-api';
import { drive, setup } from './network-server-fixture';

afterEach(() => { PP.setProgression(false); vi.clearAllTimers(); vi.useRealTimers(); });
const bit = (bytes:Uint8Array|undefined,index:number) => bytes === undefined ? undefined : !!(bytes[index>>3] & (1<<(index&7)));

describe('authoritative native ownership and NPC progression snapshots',() => {
  it('keeps unknown rights unknown, reads real account snapshots, detaches event buffers, accepts shop pushes and refreshes progression',async () => {
    const user = 'rights-user', {session,server} = setup(undefined,user,{PROGRESSION:'1'});
    try {
      expect(session.state.pbin).toBeUndefined(); expect(session.state.npcbin).toBeUndefined();
      await drive(session.start()); await drive(session.createCharacter(0,'Rights Duelist'));
      const account = server.game.store.accountOfUser(user)!;
      let state = server.game.store.loadRaw(), profile = state.accounts[account].profiles['0'];
      PP.pbinSet(profile,1000); PP.npcbinSet(profile,51,[7,2,1,3]); server.game.store.saveRaw(state);
      // An external observer may reuse/mutate its packet buffer; authority snapshots must own their copies.
      session.options.onMessage = (_,message) => { if ([0x3114,0x4234].includes(message.id)) message.data.fill(255); };
      await drive(session.selectCharacter(0));
      expect(session.state.pbin?.length).toBe(128); expect(session.state.npcbin?.length).toBe(512);
      expect(bit(session.state.pbin,1000)).toBe(true); expect(bit(session.state.pbin,1001)).toBe(false);
      expect([...session.state.npcbin!.slice(51*4,51*4+4)]).toEqual([7,2,1,3]);
      const oldPbin = session.state.pbin, oldNpcbin = session.state.npcbin;
      // An authoritative fixture-side grant changes persisted rights, then a real purchase pushes its account state.
      state = server.game.store.loadRaw(); profile = state.accounts[account].profiles['0'];
      PP.pbinSet(profile,1001); PP.npcbinSet(profile,51,[8,2,1,4]); server.game.store.saveRaw(state);
      const view = shopView(server.game,user) as {items:{id:number;kind:number;param:number}[];nextRequestId:string};
      const pack = view.items.find(item=>item.kind===1&&item.param===1)!; expect(pack).toBeDefined();
      let response:unknown;
      await server.world.run(() => { response = shopPurchaseApi(server.game,user,{itemId:pack.id,count:1,requestId:view.nextRequestId}); });
      expect(response).not.toHaveProperty('error'); await vi.advanceTimersByTimeAsync(200);
      expect(session.state.pbin).not.toBe(oldPbin); expect(bit(session.state.pbin,1001)).toBe(true);
      // A PBIN push conveys no NPCBIN update: preserve the previous known snapshot until the next complete reply.
      expect(session.state.npcbin).toBe(oldNpcbin); expect(session.state.npcbin![51*4+3]).toBe(3);
      await drive(session.refreshPlayerBits());
      expect(session.state.npcbin).not.toBe(oldNpcbin);
      expect([...session.state.npcbin!.slice(51*4,51*4+4)]).toEqual([8,2,1,4]);
      expect(session.state.pbin).toEqual(PP.pbinBytes(server.game.store.peek().accounts[account].profiles['0']));
      session.dispose(); expect(session.state.pbin).toBeUndefined(); expect(session.state.npcbin).toBeUndefined();
    } finally { session.dispose(); }
  });

  it('shares concurrent refreshes and drains a timed-out reply before retrying on the resumed account channel',async () => {
    const {session,server,sockets} = setup(undefined,'rights-retry');
    try {
      await drive(session.start()); await drive(session.createCharacter(0,'Retry Rights')); await drive(session.selectCharacter(0));
      let requests = 0;
      session.gateway.options.onOutgoing = (_,message) => { if (message.id === 0x3114) requests++; };
      const one = session.refreshPlayerBits(), two = session.refreshPlayerBits();
      expect(one).toBe(two); await drive(Promise.all([one,two])); expect(requests).toBe(1);
      const account = session.account!, request = account.request.bind(account);
      vi.spyOn(account,'request').mockImplementationOnce((id,data,responseId) => request(id,data,responseId,50));
      let interrupted = false;
      session.gateway.options.onOutgoing = (_,message) => { if (message.id === 0x3114 && !interrupted) { interrupted = true; sockets[0].close(); } };
      await expect(drive(session.refreshPlayerBits())).rejects.toThrow('Timed out');
      await vi.advanceTimersByTimeAsync(1000); expect(session.state.connection).toBe('connected');
      const stored = server.game.store.loadRaw(), owner = server.game.store.accountOfUser('rights-retry')!;
      PP.npcbinSet(stored.accounts[owner].profiles['0'],51,[0,0,0,4]); server.game.store.saveRaw(stored);
      const ids:number[] = []; session.gateway.options.onOutgoing = (_,message) => ids.push(message.id);
      await drive(session.refreshPlayerBits());
      expect(ids.filter(id=>[0x3001,0x3114].includes(id))).toEqual([0x3001,0x3114]);
      expect(session.state.npcbin![51*4+3]).toBe(4); expect(session.account).toBe(account);
    } finally { session.dispose(); }
  });

  it('invalidates held replies when selecting another character and serializes the new account query',async () => {
    const {session,server} = setup(undefined,'rights-character');
    try {
      await drive(session.start()); await drive(session.createCharacter(0,'Old Rights')); await drive(session.createCharacter(1,'New Rights'));
      const stored = server.game.store.loadRaw(), owner = server.game.store.accountOfUser('rights-character')!;
      PP.npcbinSet(stored.accounts[owner].profiles['0'],51,[0,0,0,1]);
      PP.npcbinSet(stored.accounts[owner].profiles['1'],51,[0,0,0,2]); server.game.store.saveRaw(stored);
      const authority = [...server.game.hub.sessions.values()][0].conns.get(server.game.ports.game)!, send = authority.send.bind(authority);
      const held:{id:number;data:Uint8Array}[] = []; let holding = true;
      vi.spyOn(authority,'send').mockImplementation((id,data) => { if (holding && [0x3114,0x4234].includes(id)) held.push({id,data:data.slice()}); else send(id,data); });
      const oldSelection = session.selectCharacter(0).then(()=>null,error=>error as Error);
      for (let attempt=0;attempt<100&&held.length<2;attempt++) await vi.advanceTimersByTimeAsync(20);
      expect(held).toHaveLength(2); holding = false;
      const observed:number[] = []; session.options.onState = state => { if (state.selectedSlot===1&&state.npcbin) observed.push(state.npcbin[51*4+3]); };
      const nextSelection = session.selectCharacter(1);
      await vi.advanceTimersByTimeAsync(100);
      expect(session.state.selectedSlot).toBe(1); expect(session.state.pbin).toBeUndefined(); expect(session.state.npcbin).toBeUndefined();
      for (const packet of held) send(packet.id,packet.data);
      await drive(nextSelection); const cancelled = await oldSelection;
      expect(cancelled?.name).toBe('AbortError'); expect(session.state.selectedSlot).toBe(1);
      expect(session.state.npcbin![51*4+3]).toBe(2); expect(observed.every(rank=>rank===2)).toBe(true);
      expect(session.state.phase).toBe('lobby'); expect(session.state.error).toBeNull();
    } finally { session.dispose(); }
  });

  it('invalidates an outstanding refresh on disposal and preserves the closed phase',async () => {
    const {session,server} = setup(undefined,'rights-dispose');
    await drive(session.start()); await drive(session.createCharacter(0,'Dispose Rights')); await drive(session.selectCharacter(0));
    const authority = [...server.game.hub.sessions.values()][0].conns.get(server.game.ports.game)!, send = authority.send.bind(authority);
    const held:{id:number;data:Uint8Array}[] = [];
    vi.spyOn(authority,'send').mockImplementation((id,data) => { if ([0x3114,0x4234].includes(id)) held.push({id,data:data.slice()}); else send(id,data); });
    const outcome = session.refreshPlayerBits().then(()=>null,error=>error as Error);
    for (let attempt=0;attempt<100&&held.length<2;attempt++) await vi.advanceTimersByTimeAsync(20);
    expect(held).toHaveLength(2); session.dispose();
    for (const packet of held) send(packet.id,packet.data);
    expect(await outcome).toBeInstanceOf(Error); await vi.advanceTimersByTimeAsync(100);
    expect(session.state.phase).toBe('closed'); expect(session.state.pbin).toBeUndefined(); expect(session.state.npcbin).toBeUndefined();
  });

  it.each([[0x3114,127],[0x4234,511]])('refuses malformed account packet %i without manufacturing ownership or progression',async (id,length) => {
    const {session,server} = setup(undefined,`bad-rights-${id}`);
    try {
      await drive(session.start()); await drive(session.createCharacter(0,'Strict Rights')); await drive(session.selectCharacter(0));
      const pbin = session.state.pbin, npcbin = session.state.npcbin;
      const authority = [...server.game.hub.sessions.values()][0].conns.get(server.game.ports.game)!;
      authority.post(id,new Uint8Array(length)); await vi.advanceTimersByTimeAsync(100);
      expect(session.state.connection).toBe('error'); expect(session.state.error).toMatch(/snapshot/);
      expect(session.state.pbin).toBe(pbin); expect(session.state.npcbin).toBe(npcbin);
    } finally { session.dispose(); }
  });
});
