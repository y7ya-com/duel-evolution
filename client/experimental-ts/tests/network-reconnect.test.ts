// Live's reconnect (client/recomp/ovr/duelreattach.c, lobbyretry.c) against the real in-process server: a duel
// connection the server cut mid-duel re-attaches with 0x6001 pid + count and the missed 0x6202s come back; a lobby (or
// the whole game connection) lost in an area returns to that area; a deploy's 4012 and its refusal window are ridden out
// with live's 1, 2, 4, 8, 15 s backoff, and 15 failures in a row give up.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createNodeDuelCore } from '../../../server/src/duel/engine/node';
import { NPC_DECKS, setDuelCore } from '../../../server/src/duel/data';
import { BinaryReader } from '../src/network/codec';
import { createDuelState, reduceDuelMessage, encodeDuelResponse } from '../src/duel';
import { GameSession, RECONNECT } from '../src/network/session';
import type { WebSocketLike } from '../src/network/gateway';
import { InProcessSocket, setup, drive } from './network-server-fixture';

afterEach(() => { vi.clearAllTimers(); vi.useRealTimers(); });

/** A WebSocket the server refuses (a deploy's restart): it closes without ever opening. */
class RefusedSocket implements WebSocketLike {
  readyState = 0; bufferedAmount = 0; binaryType = 'arraybuffer';
  onopen: WebSocketLike['onopen'] = null; onclose: WebSocketLike['onclose'] = null; onerror: WebSocketLike['onerror'] = null; onmessage: WebSocketLike['onmessage'] = null;
  constructor() { queueMicrotask(() => { if (this.readyState === 3) return; this.readyState = 3; this.onerror?.({} as Event); this.onclose?.({ code:1006 } as CloseEvent); }); }
  send(): void { throw new Error('Socket closed'); }
  close(): void { if (this.readyState === 3) return; this.readyState = 3; this.onclose?.({ code:1006 } as CloseEvent); }
}

/** A session whose WebSockets can be refused, like the gateway during a deploy. */
function refusable(user: string) {
  const base = setup(undefined, user);
  const ctl = { refusing:false, sockets:[] as InProcessSocket[] };
  base.session.dispose();
  const session = new GameSession({ url:'ws://localhost/net', sid:Buffer.from(user).toString('hex').padEnd(32,'0').slice(0,32),
    socketFactory: (url) => {
      if (ctl.refusing) return new RefusedSocket();
      const socket = new InProcessSocket(base.server, `${user}-r${ctl.sockets.length}`, new URL(url), user); ctl.sockets.push(socket); return socket;
    } });
  return { server:base.server, logs:base.logs, session, ctl };
}

/** The server goes down for an update: its gateway closes every WebSocket with 4012, holding nothing for a resume. */
function serverUpdate(socket: InProcessSocket): void {
  socket.server.world.closePeer(socket.id, false);
  socket.readyState = 3; socket.onclose?.({ code:4012 } as CloseEvent);
}

describe('reconnect parity with live (duelreattach.c, lobbyretry.c)', () => {
  it('re-attaches a duel connection the server cut mid-duel: 0x6001 pid + count, the missed commands replayed, the duel goes on', async () => {
    const core = await createNodeDuelCore(); setDuelCore(core);
    const a = setup(undefined,'re-a',{ PVP_TEST:'1' }), b = setup(a.server,'re-b');
    try {
      for (const [i, s] of [a.session, b.session].entries()) { await drive(s.start()); await drive(s.createCharacter(0, ['Alpha','Beta'][i])); await drive(s.selectCharacter(0)); }
      await drive(a.session.createDuelRoom());
      const room = a.session.state.rooms.find(r => r.owner === a.session.state.profile!.pid)!;
      b.session.challengeRoom(room.id); await vi.advanceTimersByTimeAsync(200);
      a.session.replyToChallenge(true); await vi.advanceTimersByTimeAsync(200);
      await drive(Promise.all([a.session.acceptDuelOffer(NPC_DECKS['51']), b.session.acceptDuelOffer(NPC_DECKS['54'])]));
      expect(await drive(Promise.all([a.session.chooseHand(0), b.session.chooseHand(1)]))).toEqual(['win','lose']);
      await drive(a.session.chooseFirst(true)); await vi.advanceTimersByTimeAsync(100);
      // every 0x6202 B's duel connections deliver, across the re-attach (what B's board is reduced from)
      const records: Uint8Array[] = [];
      b.session.options.onMessage = (channel, m) => { if (channel === b.session.duel && m.id === 0x6202) records.push(m.data); };
      let boardA = createDuelState();
      a.session.options.onMessage = (channel, m) => { if (channel === a.session.duel && [0x6202,0x6610,0x6611,0x6612,0x6461,0x6613,0x649b].includes(m.id)) boardA = reduceDuelMessage(boardA, m); };
      a.session.beginDuel(); b.session.beginDuel(); await vi.advanceTimersByTimeAsync(4000);
      const before = records.length; expect(before).toBeGreaterThan(0);
      const sent6001: Uint8Array[] = [];
      b.session.gateway.options.onOutgoing = (_c, m) => { if (m.id === 0x6001) sent6001.push(m.data); };
      // B's first reconnect waits 1.5 s (a slow line), so A's plays in that gap are commands B misses
      const gw = b.session.gateway, open = gw.open.bind(gw); let slow = true;
      gw.open = async (port: number) => { if (slow) { slow = false; await new Promise(r => setTimeout(r, 1500)); } return open(port); };
      // the server cuts B's duel connection (not the WebSocket): live's dispatchSocket cut, +0xc58 = 2
      const pid = b.session.state.profile!.pid, match = a.server.game.pvp!.pids.get(pid)!, side = match.pids.indexOf(pid);
      const oldChannel = b.session.duel!;
      const seen: unknown[] = []; b.session.options.onState = st => { if (st.net?.reconnecting) seen.push({ ...st.net }); };
      a.server.world.close(match.c[side]!, 'test cut'); await vi.advanceTimersByTimeAsync(0);
      expect(seen[0]).toMatchObject({ reconnecting:true, what:'duel' });
      expect(b.session.state.phase).toBe('duel');
      // meanwhile A (whose turn it is) ends the turn: the duel goes on to B's turn while B is away
      expect(boardA.acceptingInput && boardA.prompt?.kind).toBe('actions');
      for (const packet of encodeDuelResponse(boardA, { type:'phase', phase:5 })) a.session.sendDuel(packet.id, packet.data);
      await vi.advanceTimersByTimeAsync(1000);
      expect(records.length).toBe(before);   // B is still away
      await vi.advanceTimersByTimeAsync(3000);
      expect(b.session.state.net?.reconnecting).toBe(false);
      expect(b.session.duel).not.toBe(oldChannel);
      expect(sent6001).toHaveLength(1);
      const r = new BinaryReader(sent6001[0]); expect([r.u32(), r.u32()]).toEqual([pid, before]);
      const back = a.logs.find(line => /vuelve con \d+ mensajes/.test(line)) ?? a.logs.filter(l => /pvp|reserva|6001/.test(l)).slice(-8).join(" // ") + " ERR=" + b.session.state.error;
      const again = Number(/vuelve con \d+ mensajes: (\d+) otra vez/.exec(back)?.[1]);
      expect(back).toContain(`vuelve con ${before} mensajes`); expect(again).toBeGreaterThan(0);
      // exactly the missed ones, once: B's board now holds everything the server sent B, and the duel goes on
      expect(records.length).toBe(before + again);
      expect(b.session.state.phase).toBe('duel'); expect(b.session.duel?.closed).toBe(false); expect(b.session.state.error).toBeNull();
      expect(a.logs.some(line => /bad MD5|sequence gap/.test(line))).toBe(false);
    } finally { a.session.dispose(); b.session.dispose(); setDuelCore(null); }
  }, 30000);

  it('a refused re-attach (a duel the server no longer has) ends it as live\'s disconnected box', async () => {
    const core = await createNodeDuelCore(); setDuelCore(core);
    const { session, server } = setup(undefined, 're-npc');
    try {
      await drive(session.start()); await drive(session.createCharacter(0, 'Npc Cut')); await drive(session.selectCharacter(0));
      await drive(session.startNpcDuel(35, NPC_DECKS['51']));
      expect(session.state.phase).toBe('rock-paper-scissors');
      const conn = [...server.game.hub.sessions.values()][0].conns.get(session.duel!.port)!;
      expect(conn).toBeDefined();
      const seen: unknown[] = []; session.options.onState = st => { if (st.net?.reconnecting) seen.push({ ...st.net }); };
      server.world.close(conn, 'test cut'); await vi.advanceTimersByTimeAsync(0);
      expect(seen[0]).toMatchObject({ reconnecting:true, what:'duel' });
      // an NPC duel's server keeps nothing to come back to: 0x6007 0 = refused = the box
      await vi.advanceTimersByTimeAsync(3000);
      expect(session.state.net?.reconnecting).toBe(false);
      expect(session.state.error).toMatch(/no longer has/);
      expect(session.duel).toBeNull();
    } finally { session.dispose(); setDuelCore(null); }
  }, 30000);

  it('a lobby connection the server cut in an area rejoins that same area', async () => {
    const { session, server } = setup(undefined, 're-lobby');
    try {
      await drive(session.start()); await drive(session.createCharacter(0, 'Lobby Cut')); await drive(session.selectCharacter(0));
      await drive(session.enterArea(0)); expect(session.state.area).toBe(0);
      const s = [...server.game.hub.sessions.values()][0];
      const seen: unknown[] = []; session.options.onState = st => { if (st.net?.reconnecting) seen.push({ ...st.net }); };
      server.world.close(s.lobby!, 'test cut'); await vi.advanceTimersByTimeAsync(0);
      expect(seen[0]).toMatchObject({ reconnecting:true, what:'lobby' });
      await vi.advanceTimersByTimeAsync(3000);
      expect(session.state.net?.reconnecting).toBe(false);
      expect(session.state).toMatchObject({ phase:'lobby', location:'world', area:0, connection:'connected' });
      expect(session.lobby?.closed).toBe(false);
      expect(session.state.players.some(p => p.pid === session.state.profile!.pid)).toBe(true);
    } finally { session.dispose(); }
  }, 30000);

  it('a lost game connection in My Room (the WebSocket gone, its resume refused) reconnects to My Room on a new connection', async () => {
    const { session, server, ctl } = refusable('re-room');
    try {
      await drive(session.start()); await drive(session.createCharacter(0, 'Room Cut')); await drive(session.selectCharacter(0));
      await drive(session.enterMyRoom()); expect(session.state.location).toBe('my-room');
      const oldGateway = session.gateway, socket = ctl.sockets.at(-1)!;
      server.world.closePeer(socket.id, false);   // the server forgets the tunnel: a resume can only be refused
      socket.close();
      await vi.advanceTimersByTimeAsync(5000);
      expect(session.gateway).not.toBe(oldGateway);
      expect(session.state).toMatchObject({ phase:'lobby', location:'my-room', connection:'connected' });
      expect(session.state.net?.reconnecting).toBe(false);
    } finally { session.dispose(); }
  }, 30000);

  it('rides out a deploy: 4012, then refused connections for ~2 minutes, back in the same area; 15 failures in a row give up', async () => {
    const { session, ctl } = refusable('re-deploy');
    try {
      await drive(session.start()); await drive(session.createCharacter(0, 'Deploy')); await drive(session.selectCharacter(0));
      await drive(session.enterArea(0));
      const yo2Net: { attempt:number; at:number }[] = [];
      session.options.onState = s => { if (s.net?.reconnecting) yo2Net.push({ attempt:s.net.attempt, at:Date.now() }); };
      ctl.refusing = true; const t0 = Date.now();
      serverUpdate(ctl.sockets.at(-1)!); await vi.advanceTimersByTimeAsync(0);
      expect(session.state.connection).toBe('reconnecting');   // 4012 goes straight to the reconnect, no 40 s resume
      await vi.advanceTimersByTimeAsync(110_000);
      // live's waits after each failure: 1, 2, 4, 8, then 15 s
      const firsts = [1,2,3,4,5,6].map(n => yo2Net.find(e => e.attempt === n)!.at - t0);
      const gaps = firsts.slice(1).map((t, i) => Math.round((t - firsts[i]) / 1000));
      expect(gaps).toEqual([1,2,4,8,15]);
      expect(session.state.phase).toBe('lobby');
      ctl.refusing = false; await vi.advanceTimersByTimeAsync(16_000);
      expect(session.state).toMatchObject({ phase:'lobby', location:'world', area:0, connection:'connected' });
      expect(session.state.net?.reconnecting).toBe(false);
      // and a server that never comes back: the box (the session's error) after 15 failures in a row, ~3 minutes
      ctl.refusing = true; const t1 = Date.now();
      serverUpdate(ctl.sockets.at(-1)!);
      for (let ms = 0; session.state.phase !== 'error' && ms < 300_000; ms += 1000) await vi.advanceTimersByTimeAsync(1000);
      expect(session.state.phase).toBe('error'); expect(session.state.connection).toBe('error');
      expect(session.state.net).toMatchObject({ reconnecting:false, attempt:RECONNECT.lobbyMaxFails });
      expect((Date.now() - t1) / 1000).toBeGreaterThan(150); expect((Date.now() - t1) / 1000).toBeLessThan(200);
    } finally { session.dispose(); }
  }, 60000);
});
