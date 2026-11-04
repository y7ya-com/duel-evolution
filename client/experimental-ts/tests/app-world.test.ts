import { describe, expect, it, vi } from 'vitest';
import { ClientApp } from '../src/app';
import { HttpClient } from '../src/services';
import type { GameApi } from '../src/services';
import type { GameSession, SessionOptions, SessionState } from '../src/network/session';
import type { WorldMaps } from '../src/world';

function fixture(withMaps = true) {
  const frames = new Map<number, FrameRequestCallback>(); let frameId = 0, now = 0;
  const requestFrame = vi.fn((callback: FrameRequestCallback) => { frames.set(++frameId, callback); return frameId; });
  const cancelFrame = vi.fn((id: number) => { frames.delete(id); });
  const http = new HttpClient({ origin: 'https://game.test', timeoutMs: 0, fetch: vi.fn(async () => new Response(JSON.stringify({ signedIn: true, userId: 'user', name: 'Walker', roles: [], discord: false, password: true }), { headers: { 'content-type': 'application/json' } })) });
  const api = { http, session: vi.fn(async () => ({ signedIn: true as const, userId: 'user', name: 'Walker', roles: [], discord: false, password: true })), starter: vi.fn(async () => ({ claimable: false, reason: 'already-claimed' })), decks: vi.fn(async () => ({ current: { world: null, free: null }, decks: [], deleted: [] })), dispose: () => http.dispose() };
  const state: SessionState = { phase: 'idle', connection: 'idle', characters: [{ slot: 0, name: 'Walker', level: 1, score: 0, mp: 0, wins: 0, losses: 0, avatarA: new Uint8Array(16), avatarB: new Uint8Array(16) }], servers: [], selectedSlot: null, profile: null, collection: new Map(), players: [], areas: [], npcs: [], rooms: [], chat: [], area: 0, areaBlock: 1, matchmaking: { status: 'idle', style: 3, similarLevel: false, opponent: null, counts: { single: 0, match: 0, either: 0 }, matchSupported: false }, relay: null, duelRole: 'player', match: null, duelOffer: null, challenge: null, outgoingChallengeRoom: null, spectating: false, duelFirst: null, opponentHand: null, error: null };
  let sessionOptions!: SessionOptions;
  const emit = () => sessionOptions.onState?.(state);
  const game = {
    state, duel: null,
    start: vi.fn(async () => { state.phase = 'characters'; state.connection = 'connected'; emit(); }),
    selectCharacter: vi.fn(async () => { state.selectedSlot = 0; state.profile = { pid: 77, level: 1, score: 0, mp: 0 }; state.players = [{ pid: 77, name: 'Walker', level: 1, wins: 0, losses: 0, country: 'GB', areaBlock: 1, x: 30, y: 30, direction: 0 }]; state.phase = 'lobby'; emit(); }),
    refreshCollection: vi.fn(async () => {}), refreshPlayerBits: vi.fn(async () => {}), refreshNpcs: vi.fn(async () => {}),
    // The real session keeps its local own coordinates after a successful movement send.
    move: vi.fn((x: number, y: number, direction: number) => { state.players = state.players.map(p => p.pid === 77 ? { ...p, x, y, direction } : p); }),
    dispose: vi.fn(),
  };
  const worldMaps: WorldMaps = { version: 1, maps: [{ id: 0, name: 'Map_test', width: 100, height: 100, entries: [], exits: [], npcSpots: [], grid: { width: 5, height: 5, rows: ['11111', '11111', '11011', '11111', '11111'] } }] };
  const app = new ClientApp({ gatewayUrl: 'ws://game.test/net', api: api as unknown as GameApi, requestFrame, cancelFrame, ...(withMaps ? { worldMaps } : {}), sessionFactory: options => { sessionOptions = options; return game as unknown as GameSession; } });
  const enter = async () => { await app.initialize(); await app.dispatch({ type: 'connect' }); await app.dispatch({ type: 'selectCharacter', slot: 0 }); };
  const tick = () => { const next = frames.entries().next().value as [number, FrameRequestCallback] | undefined; if (!next) return false; frames.delete(next[0]); now += 1000 / 30; next[1](now); return true; };
  return { app, game, state, frames, requestFrame, cancelFrame, enter, emit, tick };
}

describe('ClientApp collision-aware world lifecycle', () => {
  it('refuses missing original collision data and blocked targets without sending coordinates', async () => {
    const absent = fixture(false); await absent.enter(); await expect(absent.app.dispatch({ type: 'move', x: 70, y: 30 })).rejects.toThrow('collision data'); expect(absent.game.move).not.toHaveBeenCalled(); absent.app.dispose();
    const f = fixture(); await f.enter(); await expect(f.app.dispatch({ type: 'move', x: 50, y: 50 })).rejects.toThrow('blocked'); expect(f.game.move).not.toHaveBeenCalled(); expect(f.frames.size).toBe(0); f.app.dispose();
  });
  it('walks incrementally at bounded source steps and retains position across unrelated packets', async () => {
    const f = fixture(); await f.enter(); await f.app.dispatch({ type: 'move', x: 70, y: 30 }); expect(f.game.move).not.toHaveBeenCalled();
    for (let i = 0; i < 100 && f.tick(); i++) { /* injected deterministic visual clock */ }
    const calls = f.game.move.mock.calls; expect(calls.length).toBeGreaterThan(2); expect(calls[0][0]).toBeGreaterThan(30); expect(calls[0][0]).toBeLessThan(70); expect(calls.at(-1)?.slice(0, 2)).toEqual([70, 30]);
    let previous = { x: 30, y: 30 }; for (const [x, y, direction] of calls) { expect(Math.hypot(x - previous.x, y - previous.y)).toBeLessThanOrEqual(7.1); expect(direction).toBeGreaterThanOrEqual(0); expect(direction).toBeLessThan(8); previous = { x, y }; }
    f.emit(); expect(f.app.getState().lobby?.avatars.find(a => a.self)?.x).toBe(70); expect(f.frames.size).toBe(0); f.app.dispose();
  });
  it('cancels walking when opening another scene and can start a fresh route after returning', async () => {
    const f = fixture(); await f.enter(); await f.app.dispatch({ type: 'move', x: 70, y: 30 }); for (let i = 0; i < 4; i++) f.tick();
    const before = f.game.move.mock.calls.length; expect(f.frames.size).toBeGreaterThan(0); await f.app.dispatch({ type: 'openScene', scene: 'settings' }); expect(f.cancelFrame).toHaveBeenCalled(); expect(f.tick()).toBe(false); expect(f.game.move).toHaveBeenCalledTimes(before);
    await f.app.dispatch({ type: 'openScene', scene: 'lobby' }); await f.app.dispatch({ type: 'move', x: 70, y: 30 }); for (let i = 0; i < 100 && f.tick(); i++) { /* drain route */ } expect(f.game.move.mock.calls.at(-1)?.slice(0, 2)).toEqual([70, 30]); f.app.dispose();
  });
  it('cancels scheduled frames on disconnect and disposal, including a retained late callback', async () => {
    const f = fixture(); await f.enter(); await f.app.dispatch({ type: 'move', x: 70, y: 30 }); for (let i = 0; i < 4; i++) f.tick();
    const late = [...f.frames.values()][0], count = f.game.move.mock.calls.length; await f.app.dispatch({ type: 'disconnect' }); expect(f.frames.size).toBe(0); late?.(500); expect(f.game.move).toHaveBeenCalledTimes(count); expect(f.app.getState().scene).toBe('title'); f.app.dispose();
    const disposed = fixture(); await disposed.enter(); await disposed.app.dispatch({ type: 'move', x: 70, y: 30 }); const callback = [...disposed.frames.values()][0]; disposed.app.dispose(); callback?.(500); expect(disposed.frames.size).toBe(0); expect(disposed.game.move).not.toHaveBeenCalled(); expect(disposed.game.dispose).toHaveBeenCalledTimes(1);
  });
});
