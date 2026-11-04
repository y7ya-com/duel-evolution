import { afterEach, describe, expect, it, vi } from 'vitest';
import { GameSession } from '../src/network/session';
import { BinaryReader } from '../src/network/codec';
import { Hub } from '../../../server/src/game/hub';
import { setup, drive } from './network-server-fixture';

afterEach(() => { vi.clearAllTimers(); vi.useRealTimers(); });
async function boot(session:GameSession,name:string) { await drive(session.start()); await drive(session.createCharacter(0,name)); await drive(session.selectCharacter(0)); }

describe('native My Room port transitions against actual World',() => {
  it('leaves public presence, privately registers both looks, preserves rights/economy and returns to the cached world area',async () => {
    const a=setup(undefined,'myroom-a'),b=setup(a.server,'myroom-b');
    try {
      await boot(a.session,'Room A'); await boot(b.session,'Room B');
      await drive(a.session.enterArea(0)); a.session.move(450,330,2); await vi.advanceTimersByTimeAsync(100);
      const account=a.session.account,oldLobby=a.session.lobby,collection=a.session.state.collection,pbin=a.session.state.pbin,npcbin=a.session.state.npcbin,pid=a.session.state.profile!.pid;
      const owner=a.server.game.store.accountOfUser('myroom-a')!,before=structuredClone(a.server.game.store.peek().accounts[owner].profiles['0']);
      expect(b.session.state.players.some(p=>p.pid===pid)).toBe(true);
      const uploads:{world:number;parts:Uint8Array}[]=[]; a.session.gateway.options.onOutgoing=(_,message)=>{if(message.id===0x4170){const r=new BinaryReader(message.data);uploads.push({world:r.u32(),parts:r.bytes(16)});}};
      const transition=a.session.enterMyRoom(); expect(a.session.state).toMatchObject({phase:'changing-lobby',lobbyTransition:'entering-my-room'});
      expect(a.session.enterMyRoom()).toBe(transition); await drive(transition); await vi.advanceTimersByTimeAsync(100);
      expect(a.session.state).toMatchObject({phase:'lobby',location:'my-room',area:8,returnArea:0,appearanceWorld:0,lobbyTransition:null});
      expect(a.session.state.areas.map(area=>area.area)).toEqual([8]);
      expect(uploads.map(upload=>upload.world)).toEqual([1,0]); expect(uploads.every(upload=>upload.parts.some(byte=>byte!==0))).toBe(true);
      expect(oldLobby!.closed).toBe(true); expect(a.session.account).toBe(account); expect(a.session.state.profile!.pid).toBe(pid);
      expect(a.session.state.collection).toBe(collection); expect(a.session.state.pbin).toBe(pbin); expect(a.session.state.npcbin).toBe(npcbin);
      expect(b.session.state.players.some(p=>p.pid===pid)).toBe(false);
      expect(a.session.state.players.map(p=>p.pid)).toEqual([pid]); expect(a.session.state.npcs).toEqual([]); expect(a.session.state.rooms).toEqual([]);
      const serverPlayer=a.server.game.hub.byPid(pid)!; expect(serverPlayer.block).toBeNull();
      a.session.move(680,400,0); await vi.advanceTimersByTimeAsync(100);
      await drive(a.session.lobby!.request(0x4214,new Uint8Array(),0x4217));
      expect(a.session.state.players.find(p=>p.pid===pid)).toMatchObject({x:680,y:400,direction:0});
      await drive(a.session.refreshNpcs()); expect(a.session.state.npcs).toEqual([]);
      await drive(b.session.enterMyRoom()); expect(b.session.state.players.map(p=>p.pid)).toEqual([b.session.state.profile!.pid]);
      await drive(Promise.all([a.session.leaveMyRoom(),b.session.leaveMyRoom()])); await vi.advanceTimersByTimeAsync(100);
      expect(a.session.state).toMatchObject({location:'world',area:0,appearanceWorld:0,lobbyTransition:null});
      expect(a.session.lobby!.port).toBe(oldLobby!.port); expect(a.session.account).toBe(account);
      a.session.move(470,350,2); await vi.advanceTimersByTimeAsync(100);
      expect(b.session.state.players.find(p=>p.pid===pid)).toMatchObject({x:470,y:350});
      const after=a.server.game.store.peek().accounts[owner].profiles['0'];
      expect(after.rec).toEqual(before.rec); expect(after.trunk).toEqual(before.trunk); expect(after.pbin).toEqual(before.pbin); expect(after.npcbin).toEqual(before.npcbin);
      expect(a.session.gateway.diagnostics.channels).toBe(2);
    } finally {a.session.dispose();b.session.dispose();}
  });
  it('can initially select the advertised My Room port and then use the server default world entry',async () => {
    const {session}=setup(undefined,'initial-myroom');
    try {
      await drive(session.start()); await drive(session.createCharacter(0,'Start Home'));
      const port=session.state.servers.find(server=>server.kind===3&&server.roomKind===12)!.port;
      const worlds:number[]=[];session.gateway.options.onOutgoing=(_,message)=>{if(message.id===0x4170)worlds.push(new BinaryReader(message.data).u32());};
      await drive(session.selectCharacter(0,port));
      expect(session.state).toMatchObject({location:'my-room',area:8,returnArea:null});expect(worlds).toEqual([1,0]);
      await drive(session.leaveMyRoom());expect(session.state).toMatchObject({location:'world',area:5,returnArea:5});
    } finally {session.dispose();}
  });
  it('refuses pending matchmaking/challenges and removes only a dormant room when the player deliberately leaves',async () => {
    const a=setup(undefined,'myroom-roles-a'),b=setup(a.server,'myroom-roles-b');
    try {
      await expect(a.session.leaveMyRoom()).rejects.toThrow('active character');
      await boot(a.session,'Home Host');await boot(b.session,'Home Guest');
      await drive(a.session.startMatchmaking());await expect(a.session.enterMyRoom()).rejects.toThrow('Cancel');await drive(a.session.cancelMatchmaking());
      await drive(a.session.createDuelRoom());await drive(b.session.refreshRooms());
      const room=b.session.state.rooms.find(room=>room.owner===a.session.state.profile!.pid)!;
      b.session.challengeRoom(room.id);await vi.advanceTimersByTimeAsync(100);expect(a.session.state.challenge).not.toBeNull();
      const lobby=a.session.lobby;await expect(a.session.enterMyRoom()).rejects.toThrow('current interaction');expect(a.session.lobby).toBe(lobby);expect(lobby!.closed).toBe(false);
      a.session.replyToChallenge(false);await vi.advanceTimersByTimeAsync(100);await drive(a.session.enterMyRoom());
      expect(a.server.game.lp.mem.rooms.has(room.id)).toBe(false);expect(a.session.state.location).toBe('my-room');
    } finally {a.session.dispose();b.session.dispose();}
  });
  it('resumes safely when the socket drops after native leave-block and before closing the old lobby',async () => {
    const {session,sockets,server}=setup(undefined,'myroom-reconnect');
    try {
      await boot(session,'Room Resume'); const account=session.account,oldLobby=session.lobby; let dropped=false;
      session.gateway.options.onOutgoing=(channel,message)=>{if(channel===oldLobby&&message.id===0x5310&&!dropped){dropped=true;sockets[0].close();}};
      await drive(session.enterMyRoom());
      expect(dropped).toBe(true); expect(sockets).toHaveLength(2); expect(session.account).toBe(account);
      expect(session.state).toMatchObject({connection:'connected',location:'my-room',area:8,phase:'lobby'});
      expect(session.gateway.diagnostics.channels).toBe(2);
      expect([...server.game.hub.sessions.values()][0].block).toBeNull();
      await drive(session.leaveMyRoom()); expect(session.state.location).toBe('world'); expect(session.state.area).toBe(5);
    } finally {session.dispose();}
  });
  it('keeps FREE mode isolated in My Room and restores its own free world block',async () => {
    const f=setup(undefined,'myroom-free');f.session.dispose();
    const session=new GameSession({...f.session.options,freeMode:true});
    try {
      await boot(session,'Free Home'); const account=session.account,collection=session.state.collection;
      const player=[...f.server.game.hub.sessions.values()][0];expect(player.block?.endsWith('|f')).toBe(true);
      await drive(session.enterMyRoom()); expect(player.ext.free).toBe(true);expect(player.block).toBeNull();
      expect(session.state.collection).toBe(collection);expect(session.account).toBe(account);
      await drive(session.leaveMyRoom());expect(player.block?.endsWith('|f')).toBe(true);expect(player.ext.free).toBe(true);
    } finally {session.dispose();}
  });
  it('invalidates a pending lobby change when disposed without reopening a channel or leaving live presence',async () => {
    const {session,server}=setup(undefined,'myroom-dispose');
    await boot(session,'Room Dispose');
    const authority=[...server.game.hub.sessions.values()][0].conns.get(server.game.ports.game)!,send=authority.send.bind(authority);
    let held=false;vi.spyOn(authority,'send').mockImplementation((id,data)=>{if(id===0x3012)held=true;else send(id,data);});
    const outcome=session.enterMyRoom().then(()=>null,error=>error as Error);
    for(let attempt=0;attempt<100&&!held;attempt++)await vi.advanceTimersByTimeAsync(20);
    expect(held).toBe(true);session.dispose();expect(await outcome).toBeInstanceOf(Error);await vi.advanceTimersByTimeAsync(100);
    expect(session.state).toMatchObject({phase:'closed',lobbyTransition:null});expect(session.gateway.diagnostics.channels).toBe(0);
    expect([...server.game.hub.sessions.values()].some(player=>Hub.live(player))).toBe(false);
  });
});
