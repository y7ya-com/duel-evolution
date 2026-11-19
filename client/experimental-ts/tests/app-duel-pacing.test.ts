import { describe, expect, it, vi } from 'vitest';
import { engine } from '../../../server/src/duel/translator/lockstep';
import { concat } from '../../../server/src/duel/translator/py';
import { ClientApp } from '../src/app';
import { HttpClient } from '../src/services';
import type { GameApi } from '../src/services';
import type { GameSession, SessionOptions, SessionState } from '../src/network/session';

/** A fake session in a duel, with the app's frames driven by hand (30 Hz). */
function fixture() {
  const frames = new Map<number, FrameRequestCallback>(); let frameId = 0, now = 0;
  const requestFrame = vi.fn((callback: FrameRequestCallback) => { frames.set(++frameId, callback); return frameId; });
  const cancelFrame = vi.fn((id: number) => { frames.delete(id); });
  const http = new HttpClient({ origin: 'https://game.test', timeoutMs: 0, fetch: vi.fn(async () => new Response(JSON.stringify({ signedIn: true, userId: 'user', name: 'Walker', roles: [], discord: false, password: true }), { headers: { 'content-type': 'application/json' } })) });
  const api = { http, session: vi.fn(async () => ({ signedIn: true as const, userId: 'user', name: 'Walker', roles: [], discord: false, password: true })), starter: vi.fn(async () => ({ claimable: false, reason: 'already-claimed' })), decks: vi.fn(async () => ({ current: { world: null, free: null }, decks: [], deleted: [] })), dispose: () => http.dispose() };
  const state: SessionState = { phase: 'idle', connection: 'idle', characters: [{ slot: 0, name: 'Walker', level: 1, score: 0, mp: 0, wins: 0, losses: 0, avatarA: new Uint8Array(16), avatarB: new Uint8Array(16) }], servers: [], selectedSlot: null, profile: null, collection: new Map(), players: [], areas: [], npcs: [], rooms: [], chat: [], area: 0, areaBlock: 1, matchmaking: { status: 'idle', style: 3, similarLevel: false, opponent: null, counts: { single: 0, match: 0, either: 0 }, matchSupported: false }, relay: null, duelRole: 'player', match: null, duelOffer: null, challenge: null, outgoingChallengeRoom: null, spectating: false, duelFirst: null, opponentHand: null, error: null };
  let sessionOptions!: SessionOptions;
  const emit = () => sessionOptions.onState?.(state);
  const duel = { name: 'duel' };
  const game = {
    state, duel,
    start: vi.fn(async () => { state.phase = 'characters'; state.connection = 'connected'; emit(); }),
    selectCharacter: vi.fn(async () => { state.selectedSlot = 0; state.profile = { pid: 77, level: 1, score: 0, mp: 0 }; state.players = [{ pid: 77, name: 'Walker', level: 1, wins: 0, losses: 0, country: 'GB', areaBlock: 1, x: 30, y: 30, direction: 0 }]; state.phase = 'lobby'; emit(); }),
    refreshCollection: vi.fn(async () => {}), refreshPlayerBits: vi.fn(async () => {}), refreshNpcs: vi.fn(async () => {}),
    move: vi.fn(), dispose: vi.fn(),
  };
  const app = new ClientApp({ gatewayUrl: 'ws://game.test/net', api: api as unknown as GameApi, requestFrame, cancelFrame, settings: { reducedMotion: false } as never, sessionFactory: options => { sessionOptions = options; return game as unknown as GameSession; } });
  const enter = async () => { await app.initialize(); await app.dispatch({ type: 'connect' }); await app.dispatch({ type: 'selectCharacter', slot: 0 }); state.phase = 'duel'; emit(); };
  const send = (id: number, data: Uint8Array) => sessionOptions.onMessage!(duel as never, { id, data });
  const tick = () => { const next = frames.entries().next().value as [number, FrameRequestCallback] | undefined; if (!next) return false; frames.delete(next[0]); now += 1000 / 30; next[1](now); return true; };
  return { app, state, emit, enter, send, tick };
}
const timer = (who: number, seconds: number) => { const b = new Uint8Array(10), v = new DataView(b.buffer); b[0] = who; v.setInt32(1, seconds); b[5] = 0; v.setInt32(6, 180); return b; };

describe('the duel screen follows the board, not the latest packet', () => {
  it('holds the board until the UI has taken START DUEL (a duel screen still being built plays nothing unseen)', async () => {
    const f = fixture(); await f.enter(); let seen = 0;
    f.app.duelCueSeen = () => seen;
    f.send(0x6202, engine(1)); f.send(0x6202, engine(0x25, 0, 1000));
    for (let i = 0; i < 300; i++) f.tick();
    expect(f.app.getState().duel!.players[0].lp).toBe(8000);
    seen = Math.max(...f.app.getState().duel!.cues!.map(c => c.id));
    while (f.tick()) { /* START DUEL, then the damage */ }
    expect(f.app.getState().duel!.players[0].lp).toBe(7000);
  });
  it('holds the log, an information box, the clock and the end until the board has played what came before', async () => {
    const f = fixture(); await f.enter();
    f.send(0x6202, engine(1)); while (f.tick()) { /* the start */ }
    // the opponent's direct attack, the LP it takes, the opponent's lost connection, the clock, the end
    f.send(0x6202, engine(0x1a, 1, 0)); f.send(0x6202, engine(0x25, 0, 1000)); f.send(0x649b, new Uint8Array([1, 1]));
    f.send(0x6461, timer(0, 90)); f.send(0x6202, engine(5, 0, 1));
    const duel = () => f.app.getState().duel!;
    expect(duel().ended).toBeUndefined(); expect(duel().notice).toBeUndefined(); expect(duel().timer).toBeUndefined();
    expect(duel().log.some(l => /took 1000 damage|disconnected|duel is over/.test(l))).toBe(false);
    expect(duel().players[0].lp).toBe(8000);
    const seen: Record<string, number> = {}; let frame = 0;
    const mark = (k: string, on: boolean) => { if (on && seen[k] === undefined) seen[k] = frame; };
    while (f.tick() && frame < 2000) {
      frame++; const d = duel();
      mark('damage-log', d.log.some(l => /took 1000 damage/.test(l))); mark('lp-counted', d.players[0].lp === 7000);
      mark('notice', !!d.notice); mark('timer', !!d.timer); mark('ended', !!d.ended);
    }
    // the damage's line with its packet, the box and the clock once the LP have counted, the end last
    expect(seen['damage-log']).toBeLessThan(seen['lp-counted']!);
    expect(seen.notice).toBeGreaterThanOrEqual(seen['lp-counted']!); expect(seen.timer).toBeGreaterThanOrEqual(seen['lp-counted']!);
    expect(seen.ended).toBeGreaterThanOrEqual(seen.notice!);
    expect(duel()).toMatchObject({ ended: 'Victory', notice: { text: 'Opponent has disconnected.' }, timer: { player: 0, seconds: 90 } });
    expect(duel().log.at(-1)).toBe('The duel is over.');
    // a match's sideboard clock (3) leaves the board's alone
    const clock = duel().timer; f.send(0x6461, timer(3, 60)); while (f.tick()) { /* settle */ }
    expect(duel().timer).toBe(clock);
    f.app.dispose();
  });
  it('shows everything at once with reduced motion', async () => {
    const f = fixture(); await f.enter();
    await f.app.dispatch({ type: 'settings', settings: { ...f.app.getState().settings, reducedMotion: true } } as never).catch(() => {});
    f.send(0x6202, engine(1)); f.send(0x6202, concat(engine(0x1a, 1, 0), engine(0x25, 0, 8000), engine(5, 0, 2)));
    expect(f.app.getState().duel).toMatchObject({ ended: 'Defeat', players: [{ lp: 0 }, { lp: 8000 }] });
    f.app.dispose();
  });
});
