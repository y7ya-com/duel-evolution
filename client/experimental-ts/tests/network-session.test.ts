import { createHash } from 'node:crypto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { GameSession } from '../src/network/session';
import { createNodeDuelCore } from '../../../server/src/duel/engine/node';
import { NPC_DECKS, setDuelCore } from '../../../server/src/duel/data';
import { BinaryReader, BinaryWriter } from '../src/network/codec';

import { createDuelState, reduceDuelMessage, encodeDuelResponse, type DuelResponse, type DuelState } from '../src/duel';
import { defaultAvatar } from '../src/avatars/appearance';
import { setup, drive } from './network-server-fixture';

afterEach(() => { vi.clearAllTimers(); vi.useRealTimers(); });

describe('independent client against actual server/World', () => {
  it('boots via real v2 handshake, creates a character, enters the lobby, reads collection and moves across worlds', async () => {
    const { session, server, logs } = setup();
    expect(await drive(session.start())).toEqual([]);
    await drive(session.createCharacter(0, 'TS Duelist'));
    expect(session.state.characters[0]).toMatchObject({ slot:0, name:'TS Duelist', level:1 });
    await drive(session.selectCharacter(0));
    expect(session.state.phase).toBe('lobby');
    expect(session.state.collection.size).toBeGreaterThan(3000);
    expect(session.state.npcs.length).toBeGreaterThan(20);
    expect(session.state.area).toBe(5);
    expect(session.state.profile?.pid).toBeGreaterThanOrEqual(1000);
    expect(session.state.players.some((p) => p.pid === session.state.profile?.pid)).toBe(true);
    const state = [...server.game.hub.sessions.values()][0];
    expect(state.slot).toBe(0);
    session.move(410, 310, 1);
    expect(session.state.players.find(p=>p.pid===state.pid)).toMatchObject({ x:410,y:310,direction:1 });
    const observed: number[] = []; session.options.onState = snapshot => { const player = snapshot.players.find(p=>p.pid===state.pid); if (player?.x !== undefined) observed.push(player.x); };
    session.move(420, 315, 2); await vi.advanceTimersByTimeAsync(100);
    expect(observed.every(x=>x===420)).toBe(true);
    const position = session.state.players.find((p) => p.pid === state.pid)!;
    expect(position).toMatchObject({ x:420, y:315, direction:2 });
    await drive(session.enterArea(0));
    expect(session.state.area).toBe(0); expect(state.ablock).toBe(0);
    await drive(session.refreshCollection());
    expect(logs.some((line) => /bad MD5|sequence gap|no card-wire hello/.test(line))).toBe(false);
    expect(session.gateway.diagnostics.bufferedBytes).toBe(0);
    session.dispose(); expect(session.gateway.diagnostics.channels).toBe(0);
    expect(session.state.collection.size).toBe(0);
  });

  it('uploads source-default new-character appearances for each world and preserves every nonempty custom byte', async () => {
    const { session,server,logs } = setup(undefined,'native-avatar-default');
    const uploads:Uint8Array[] = [];
    session.gateway.options.onOutgoing = (_,message) => { if (message.id === 0x4170) uploads.push(message.data.slice()); };
    try {
      await drive(session.start()); await drive(session.createCharacter(0,'Native Look'));
      expect([...session.state.characters[0].avatarA,...session.state.characters[0].avatarB].every(byte => byte === 0)).toBe(true);
      await drive(session.selectCharacter(0));
      const world = new BinaryReader(uploads[0]).u32() as 0|1;
      expect(uploads[0].slice(4,20)).toEqual(defaultAvatar(0,world));
      const player = [...server.game.hub.sessions.values()][0];
      expect(player.partsW.get(world)).toEqual(defaultAvatar(0,world));
      expect(session.state.players.find(p=>p.pid===player.pid)?.parts).toEqual(defaultAvatar(0,world));
      await drive(session.enterArea(0));
      expect(uploads.at(-1)!.slice(4,20)).toEqual(defaultAvatar(0,0));
      expect(player.partsW.get(0)).toEqual(defaultAvatar(0,0));
      expect(logs.some(line=>line.includes("items this character doesn't own"))).toBe(false);
      const state = server.game.store.loadRaw(), account = server.game.store.accountOfUser('native-avatar-default')!;
      state.accounts[account].profiles['0'].avatar.b = '01000000000000000000000000000000'; server.game.store.saveRaw(state);
      await drive(session.refreshCharacters()); await drive(session.enterArea(5));
      // A partial/unknown custom look remains unchanged; the server owns its validation.
      expect(uploads.at(-1)!.slice(4,20)).toEqual(Uint8Array.of(1,...Array(15).fill(0)));
    } finally { session.dispose(); }
  });

  it('resumes an interrupted WebSocket without replacing the session or repeating packet sequence numbers', async () => {
    const { session, sockets, server } = setup();
    await drive(session.start()); await drive(session.createCharacter(0, 'Reconnect')); await drive(session.selectCharacter(0));
    const pid = session.state.profile!.pid, account = session.account, lobby = session.lobby;
    sockets[0].close(); expect(session.state.connection).toBe('reconnecting');
    await vi.advanceTimersByTimeAsync(2000);
    expect(session.state.connection).toBe('connected');
    expect(sockets.length).toBe(2); expect(session.account).toBe(account); expect(session.lobby).toBe(lobby);
    expect(session.state.profile!.pid).toBe(pid); expect(server.game.hub.sessions.size).toBe(1);
    const heartbeat = lobby!.request(0x0005, new Uint8Array(0), 0x0004);
    expect(new BinaryReader((await drive(heartbeat)).data).u32()).toBe(0);
    session.dispose();
  });

  it('sets free mode before authentication and keeps the server session isolated from MMO economy', async () => {
    const fixture = setup(); fixture.session.dispose();
    const session = new GameSession({ ...fixture.session.options, freeMode:true, onMessage:undefined });
    await drive(session.start()); await drive(session.createCharacter(0, 'Free Duelist')); await drive(session.selectCharacter(0));
    expect([...fixture.server.game.hub.sessions.values()][0].ext.free).toBe(true);
    await expect(session.startNpcDuel(51, { main:[], extra:[] })).rejects.toThrow('free mode');
    session.dispose();
  });
  it('prepares a real NPC duel, resolves RPS and first player, receives authoritative gameplay, and confirms surrender', async () => {
    const core = await createNodeDuelCore(); setDuelCore(core);
    const { session, server } = setup();
    const records: Uint8Array[] = [];
    try {
      await drive(session.start()); await drive(session.createCharacter(0, 'NPC Tester')); await drive(session.selectCharacter(0));
      await drive(session.startNpcDuel(51, NPC_DECKS['51']));
      expect(session.state.phase).toBe('rock-paper-scissors');
      session.duel!.subscribe((message) => { if (message.id === 0x6202) records.push(message.data); });
      let result: 'draw' | 'win' | 'lose' = 'draw';
      for (let round = 0; result === 'draw' && round < 20; round++) result = await drive(session.chooseHand(round % 3));
      expect(result).not.toBe('draw');
      if (result === 'win') await drive(session.chooseFirst(true));
      else await vi.advanceTimersByTimeAsync(100);
      expect(session.state.duelFirst).not.toBeNull();
      session.beginDuel();
      for (let ms = 0; ms < 30000 && !records.some((bytes) => [0x1a,0x1b].includes(new BinaryReader(bytes).u32())); ms += 100)
        await vi.advanceTimersByTimeAsync(100);
      expect(records.length).toBeGreaterThan(0);
      expect(records.some((bytes) => [0x1a,0x1b].includes(new BinaryReader(bytes).u32()))).toBe(true);
      const before = records.length;
      session.sendDuel(0x6350, new BinaryWriter().u32(0).u32(13).u32(0).u32(10).bytes());
      await vi.advanceTimersByTimeAsync(1000);
      expect(records.slice(before).some((bytes) => {
        const r = new BinaryReader(bytes); return r.u32() === 0x1b && r.u32() === 0x32;
      })).toBe(true);
      session.sendDuel(0x6423, new BinaryWriter().u32(1).bytes());
      await vi.advanceTimersByTimeAsync(1000);
      expect(records.slice(before).some((bytes) => new BinaryReader(bytes).u32() === 0x4d)).toBe(true);
      await drive(session.finishDuel());
      expect(session.state.phase).toBe('lobby');
      expect([...server.game.hub.sessions.values()][0].slot).toBe(0);
    } finally { session.dispose(); setDuelCore(null); }
  });

  it('preserves unsolicited PvP reservations, both clients prepare, a spectator sees only public state, and a prompt survives tunnel resume', async () => {
    const core = await createNodeDuelCore(); setDuelCore(core);
    const a = setup(undefined,'pvp-a',{ PVP_TEST:'1' }), b = setup(a.server,'pvp-b'), spectator = setup(a.server,'watcher');
    const sessions = [a.session,b.session,spectator.session];
    try {
      for (let i = 0; i < sessions.length; i++) {
        await drive(sessions[i].start()); await drive(sessions[i].createCharacter(0,['Alpha','Beta','Watcher'][i])); await drive(sessions[i].selectCharacter(0));
      }
      await drive(a.session.createDuelRoom());
      const room = a.session.state.rooms.find(r => r.owner === a.session.state.profile!.pid)!;
      expect(room).toBeDefined();
      b.session.challengeRoom(room.id); await vi.advanceTimersByTimeAsync(200);
      expect(a.session.state.challenge).toMatchObject({ pid:b.session.state.profile!.pid, name:'Beta' });
      a.session.replyToChallenge(true); await vi.advanceTimersByTimeAsync(200);
      expect(a.session.state.duelOffer?.source).toBe('pvp'); expect(b.session.state.duelOffer?.source).toBe('pvp');
      await drive(Promise.all([a.session.acceptDuelOffer(NPC_DECKS['51']),b.session.acceptDuelOffer(NPC_DECKS['54'])]));
      expect(await drive(Promise.all([a.session.chooseHand(0),b.session.chooseHand(1)]))).toEqual(['win','lose']);
      // The loser waits for the winner's choice instead of being offered another hand.
      expect([a.session.state.rpsLost,b.session.state.rpsLost]).toEqual([false,true]);
      await drive(a.session.chooseFirst(true)); await vi.advanceTimersByTimeAsync(100);
      const recordsA: Uint8Array[] = [], publicRecords: Uint8Array[] = [];
      a.session.duel!.subscribe(m => { if (m.id === 0x6202) recordsA.push(m.data); });
      a.session.beginDuel(); b.session.beginDuel(); await vi.advanceTimersByTimeAsync(4000);
      expect(recordsA.some(d => [0x1a,0x1b].includes(new BinaryReader(d).u32()))).toBe(true);
      await drive(spectator.session.watchDuel(a.session.state.profile!.pid));
      spectator.session.duel!.subscribe(m => { if (m.id === 0x6202) publicRecords.push(m.data); });
      await vi.advanceTimersByTimeAsync(4000);
      expect(spectator.session.state.spectating).toBe(true); expect(publicRecords.length).toBeGreaterThan(0);
      expect(publicRecords.some(d => {
        const r = new BinaryReader(d), type = r.u32(), command = r.u32();
        return type === 0x1a || type === 0x1b && [0x32,0x33].includes(command);
      })).toBe(false);
      expect(() => spectator.session.sendDuel(0x6350,new Uint8Array(16))).toThrow('Spectators');
      const oldChannel = a.session.duel, before = recordsA.length;
      a.sockets[0].close(); await vi.advanceTimersByTimeAsync(2000);
      expect(a.session.state.connection).toBe('connected'); expect(a.session.duel).toBe(oldChannel);
      expect(recordsA.length).toBe(before); // held prompt is unchanged, never replayed twice
      a.session.sendDuel(0x6350,new BinaryWriter().u32(0).u32(13).u32(0).u32(10).bytes());
      await vi.advanceTimersByTimeAsync(500); a.session.sendDuel(0x6423,new BinaryWriter().u32(1).bytes());
      await vi.advanceTimersByTimeAsync(3000);
      expect(recordsA.some(d => new BinaryReader(d).u32() === 0x4d)).toBe(true);
      await drive(Promise.all([a.session.finishDuel(),b.session.finishDuel(),spectator.session.finishDuel()]));
      expect(sessions.every(s => s.state.phase === 'lobby')).toBe(true);
    } finally { sessions.forEach(s => s.dispose()); setDuelCore(null); }
  });

  it.each([35,51,60,75])('plays a real NPC %i duel to a natural result using only exposed client prompts and phase actions', async (npcId) => {
    const core = await createNodeDuelCore(); setDuelCore(core);
    const { session } = setup(undefined,`natural-npc-${npcId}`);
    let board = createDuelState(), answered = 0, actions = 0;
    const pick = (state: DuelState): DuelResponse => {
      const prompt = state.prompt!;
      if (prompt.kind === 'actions' && prompt.buttons.includes(5)) return { type:'phase',phase:5 };
      if (prompt.kind === 'yesno') return { type:'yesno',yes:false };
      if (prompt.kind === 'cards') return { type:'cards',indices:Array.from({ length:Math.max(1,prompt.min) },(_,i) => i).slice(0,prompt.max) };
      if (prompt.kind === 'attribute') return { type:'answer',value:prompt.options.slice(0,prompt.min).reduce((v,o) => v | o.value,0) };
      if (prompt.options.length) return { type:'answer',value:prompt.options[0].value };
      const target = prompt.actions.find(a => a.command === 11) ?? prompt.actions.find(a => a.command === 0);
      if (target) return { type:'action',...target };
      if (prompt.cancelable) return { type:'cancel' };
      throw new Error(`No deterministic response for ${prompt.kind}`);
    };
    try {
      await drive(session.start()); await drive(session.createCharacter(0,'Natural NPC')); await drive(session.selectCharacter(0));
      await drive(session.startNpcDuel(npcId,NPC_DECKS['51']));
      session.duel!.subscribe(message => {
        if ([0x6202,0x6610,0x6611,0x6612,0x6461,0x6613,0x649b].includes(message.id)) board = reduceDuelMessage(board,message);
      });
      let result: 'draw'|'win'|'lose' = 'draw';
      for (let round = 0; result === 'draw' && round < 20; round++) result = await drive(session.chooseHand(round % 3));
      if (result === 'win') await drive(session.chooseFirst(true)); else await vi.advanceTimersByTimeAsync(100);
      session.beginDuel(false);
      for (let step = 0; step < 4000 && board.status !== 'finished'; step++) {
        await vi.advanceTimersByTimeAsync(100);
        if (board.status === 'error' || board.errors.length || board.unsupported.length)
          throw new Error(JSON.stringify({ errors:board.errors, unsupported:board.unsupported }));
        if (board.acceptingInput && board.prompt && board.prompt.id !== answered) {
          answered = board.prompt.id;
          for (const packet of encodeDuelResponse(board,pick(board))) session.sendDuel(packet.id,packet.data);
          actions++;
        }
      }
      expect(board.status,JSON.stringify({ prompt:board.prompt,turn:board.turn,actions,errors:board.errors })).toBe('finished');
      expect(board.result?.result).toBe(2); // No summons: the NPC wins through ordinary card effects/attacks.
      expect(actions).toBeGreaterThan(0); expect(board.turn).toBeGreaterThan(1);
      expect(board.errors).toEqual([]); expect(board.unsupported).toEqual([]);
      await drive(session.finishDuel()); expect(session.state.phase).toBe('lobby');
      expect(session.state.players.find(player=>player.pid===session.state.profile!.pid)?.parts).toHaveLength(16);
    } finally { session.dispose(); setDuelCore(null); }
  },15000);

  // Main's server (93ea733 / b70a104): open duels, no room passwords. The client still sends native MD5 bytes, but the
  // server stores a zero digest, never sets the room's pw flag, and lets any challenger (any password) through.
  it('sends native MD5 room-password bytes, which main\'s password-free server ignores in both directions', async () => {
    const a = setup(undefined,'password-a'), b = setup(a.server,'password-b'), password = Array.from({ length: 16 }, (_, i) => String(i % 10)).join('');
    try {
      for (const [session,name] of [[a.session,'Password A'],[b.session,'Password B']] as const) {
        await drive(session.start()); await drive(session.createCharacter(0,name)); await drive(session.selectCharacter(0));
      }
      await drive(a.session.createDuelRoom({ password }));
      let room = a.session.state.rooms.find(r => r.owner === a.session.state.profile!.pid)!;
      expect(a.server.game.lp.mem.rooms.get(room.id)!.pwd).toEqual(new Uint8Array(16));
      expect(a.server.game.lp.mem.rooms.get(room.id)!.pw).toBe(false);
      b.session.sendLobby(0x4300,new BinaryWriter().u32(room.id).raw(createHash('md5').update(password,'latin1').digest()).bytes());
      await vi.advanceTimersByTimeAsync(100); expect(a.session.state.challenge?.pid).toBe(b.session.state.profile!.pid);
      a.session.replyToChallenge(false); await vi.advanceTimersByTimeAsync(100); await drive(a.session.deleteDuelRoom());
      // A native reqCreateRoom with a digest at byte 4 still opens an open room: a wrong password reaches the owner.
      const payload = new BinaryWriter().u8(3).u8(0).u8(0).u8(1).raw(createHash('md5').update(password,'latin1').digest())
        .u8(0).u8(1).u8(1).u8(1).u32(0).bytes();
      await drive(a.session.lobby!.request(0x4288,payload,0x428a)); await drive(a.session.refreshRooms());
      room = a.session.state.rooms.find(r => r.owner === a.session.state.profile!.pid)!;
      b.session.challengeRoom(room.id,'wrong'); await vi.advanceTimersByTimeAsync(100);
      expect(a.session.state.challenge?.pid).toBe(b.session.state.profile!.pid);
      a.session.replyToChallenge(false); await vi.advanceTimersByTimeAsync(100);
    } finally { a.session.dispose(); b.session.dispose(); }
  });

});
