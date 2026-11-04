import { afterEach, describe, expect, it, vi } from 'vitest';
import { ClientApp } from '../src/app';
import { GameApi, HttpClient, type DeckList } from '../src/services';
import { starterInfo, starterClaim } from '../../../server/src/game/starter';
import { createNodeDuelCore } from '../../../server/src/duel/engine/node';
import { shopView, shopPurchaseApi } from '../../../server/src/game/shop-api';
import { NPC_DECKS, setDuelCore } from '../../../server/src/duel/data';
import { setup, drive, sessionFactory } from './network-server-fixture';
import type { ClientCommand } from '../src/ui/contracts';
const apps: ClientApp[] = [];
afterEach(() => { apps.splice(0).forEach(app => app.dispose()); setDuelCore(null); vi.restoreAllMocks(); vi.clearAllTimers(); vi.useRealTimers(); });
function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>(r => { resolve = r; }); return { promise, resolve }; }
function harness(env: Record<string, unknown> = {}) {
  const { server, session: unused } = setup(undefined, 'unused', env); unused.dispose();
  const transport = sessionFactory(server, 'lifecycle');
  const intervals = vi.spyOn(globalThis, 'setInterval'), clears = vi.spyOn(globalThis, 'clearInterval');
  const games: ReturnType<typeof transport.factory>[] = [];
  const deck: DeckList = { current: { world: 'Fixture', free: null }, decks: [{ name: 'Fixture', ...NPC_DECKS['51'], side: [], updated: 1 }], deleted: [] };
  const pending = new Map<string, ReturnType<typeof deferred<Response>>>();
  const signals: AbortSignal[] = [];
  const fetcher: typeof fetch = async (input, init) => {
    signals.push(init!.signal as AbortSignal);
    const path = new URL(String(input)).pathname, key = `${init?.method ?? 'GET'} ${path}`;
    // Deliberately ignore abort: late completion must still not revive a disconnected view.
    if (pending.has(key)) return pending.get(key)!.promise;
    if (path === '/api/de/session') return Response.json({ signedIn: true, userId: 'lifecycle', name: 'Lifecycle', roles: [], discord: false, password: true });
    if (path === '/api/de/shop') return Response.json(shopView(server.game, 'lifecycle'));
    if (path === '/api/de/starter') return Response.json(starterInfo(server.game, 'lifecycle'));
    if (path === '/api/de/decks' && init?.method === 'GET') return Response.json(deck);
    if (path === '/api/de/decks/current' || path === '/api/de/decks') return Response.json({ updated: 2 });
    if (path === '/api/auth/sign-in/username') return Response.json({ token: 'fixture', user: {} });
    throw new Error(`Unexpected fixture route ${key}`);
  };
  const persist = vi.fn();
  const app = new ClientApp({ gatewayUrl: 'ws://localhost/net', sessionFactory: options => { const game = transport.factory(options); games.push(game); return game; }, api: new GameApi(new HttpClient({ origin: 'http://localhost', fetch: fetcher })), persistSettings: persist });
  apps.push(app);
  const send = (command: ClientCommand) => drive(app.dispatch(command));
  const connect = async () => { await drive(app.initialize()); await send({ type: 'connect' }); await send({ type: 'createCharacter', slot: 0, name: 'Lifecycle' }); };
  const enter = async () => { await connect(); await send({ type: 'selectCharacter', slot: 0 }); };
  const hold = (key: string) => { const wait = deferred<Response>(); pending.set(key, wait); return wait; };
  return { app, server, games, intervals, clears, sockets: transport.sockets, signals, persist, deck, send, connect, enter, hold };
}
async function flush() { for (let i = 0; i < 40; i++) await Promise.resolve(); }

describe('ClientApp lifecycle and late completion regressions', () => {
  it('keeps title after disconnect during character boot deck refresh', async () => {
    const f = harness(); await f.connect(); const wait = f.hold('GET /api/de/decks');
    const boot = f.app.dispatch({ type: 'selectCharacter', slot: 0 }); await vi.advanceTimersByTimeAsync(200);
    await f.send({ type: 'disconnect' }); wait.resolve(Response.json(f.deck)); await drive(boot).catch(() => {});
    expect(f.app.getState()).toMatchObject({ scene: 'title', connection: 'offline', player: null, deckEditor: null });
  });
  it('does not repopulate deck editor when selectDeck mutation completes after disconnect', async () => {
    const f = harness(); await f.enter(); const wait = f.hold('PUT /api/de/decks/current');
    const selecting = f.app.dispatch({ type: 'selectDeck', name: 'Fixture' }); await flush();
    await f.send({ type: 'disconnect' }); wait.resolve(Response.json({ updated: 2 })); await drive(selecting).catch(() => {});
    expect(f.app.getState()).toMatchObject({ scene: 'title', connection: 'offline', player: null, deckEditor: null });
  });
  it.each(['saveDeck', 'selectDeck'] as const)('keeps connection state empty when %s finishes after disconnect', async type => {
    const f = harness(); await f.enter();
    const wait = f.hold(type === 'saveDeck' ? 'PUT /api/de/decks' : 'PUT /api/de/decks/current');
    const command: ClientCommand = type === 'saveDeck' ? { type } : { type, name: 'Fixture' };
    const action = f.app.dispatch(command); await flush(); await f.send({ type: 'disconnect' });
    wait.resolve(Response.json({ updated: 2 })); await expect(drive(action)).rejects.toMatchObject({ name: 'AbortError' });
    expect(f.app.getState()).toMatchObject({ scene: 'title', player: null, deckEditor: null, shop: null });
    expect(f.app.services.decks.state.data).toBeNull();
  });
  it('does not resume starter installation after an authoritative claim response arrives after disconnect', async () => {
    setDuelCore(await createNodeDuelCore()); const f = harness({ PROGRESSION: '1' }); await f.enter();
    const id = f.app.getState().starter!.decks[0].id, wait = f.hold('POST /api/de/starter/claim');
    const action = f.app.dispatch({ type: 'claimStarter', id }); await flush();
    const [status, result] = starterClaim(f.server.game, 'lifecycle', id); expect(status).toBe(200);
    await f.send({ type: 'disconnect' }); wait.resolve(Response.json(result));
    await expect(drive(action)).rejects.toMatchObject({ name: 'AbortError' });
    expect(f.app.getState()).toMatchObject({ scene: 'title', player: null, deckEditor: null });
    expect(f.app.services.decks.state.data).toBeNull();
  });
  it('does not project an authoritative purchase response after disconnect', async () => {
    const f = harness(); await f.enter(); await f.send({ type: 'openScene', scene: 'shop' });
    const catalog = f.app.services.shop.state.data!, item = catalog.items.find(i => i.price > 0 && i.price <= catalog.wallet.total)!;
    expect(item).toBeDefined(); const wait = f.hold('POST /api/de/shop/buy');
    const action = f.app.dispatch({ type: 'buy', itemId: item.id, count: 1 }); await flush();
    const result = shopPurchaseApi(f.server.game, 'lifecycle', { itemId: item.id, count: 1, requestId: catalog.nextRequestId });
    expect(result).not.toHaveProperty('error'); await f.send({ type: 'disconnect' }); wait.resolve(Response.json(result));
    await expect(drive(action)).rejects.toMatchObject({ name: 'AbortError' });
    expect(f.app.getState()).toMatchObject({ scene: 'title', player: null, shop: null });
    expect(f.app.services.shop.state.data).toBeNull(); expect(f.app.services.pendingPurchase).toBeNull();
  });
  it('old mutation finally cannot unlock a new connection request', async () => {
    const f = harness(); await f.enter(); const oldWait = f.hold('PUT /api/de/decks/current');
    const old = f.app.dispatch({ type: 'selectDeck', name: 'Fixture' }); await flush(); await f.send({ type: 'disconnect' });
    await f.send({ type: 'connect' }); await f.send({ type: 'selectCharacter', slot: 0 });
    const newWait = f.hold('GET /api/de/decks'); const current = f.app.dispatch({ type: 'refresh', scene: 'deck' }); await vi.advanceTimersByTimeAsync(200);
    oldWait.resolve(Response.json({ updated: 2 })); await drive(old).catch(() => {});
    expect(f.app.getState().busy).toBe(true); await expect(f.app.dispatch({ type: 'newDeck', name: 'Overlap' })).rejects.toThrow('Wait');
    newWait.resolve(Response.json(f.deck)); await drive(current); expect(f.app.getState().busy).toBe(false);
  });
  it('rejects overlapping commands while allowing settings and disconnect during a mutation', async () => {
    const f = harness(); await f.enter(); const wait = f.hold('PUT /api/de/decks/current');
    const selecting = f.app.dispatch({ type: 'selectDeck', name: 'Fixture' }); await flush();
    await expect(f.app.dispatch({ type: 'refresh', scene: 'deck' })).rejects.toThrow('Wait');
    await f.app.dispatch({ type: 'settings', settings: { music: 0.2 } }); expect(f.persist).toHaveBeenCalledTimes(1);
    await f.app.dispatch({ type: 'disconnect' }); wait.resolve(Response.json({ updated: 2 })); await drive(selecting).catch(() => {});
    expect(f.app.getState().settings.music).toBe(0.2);
  });
  it('keeps the current editor intact after rejecting an invalid new deck name', async () => {
    const f = harness(); await f.enter(); const current = f.app.getState().deckEditor!.current;
    await expect(f.app.dispatch({ type: 'newDeck', name: '' })).rejects.toThrow('Invalid deck name');
    await f.send({ type: 'openScene', scene: 'deck' });
    expect(f.app.getState().deckEditor?.current).toEqual(current);
  });
  it('validates settings atomically and preserves them through reconnect', async () => {
    const f = harness(); await f.enter();
    await f.send({ type: 'settings', settings: { sound: 0, music: 1, reducedMotion: true, showCardNames: false } });
    const saved = f.app.getState().settings;
    await expect(f.app.dispatch({ type: 'settings', settings: { sound: NaN } })).rejects.toThrow('Invalid volume');
    expect(f.app.getState().settings).toEqual(saved); expect(f.persist).toHaveBeenCalledTimes(1);
    await f.send({ type: 'disconnect' }); await f.send({ type: 'connect' }); expect(f.app.getState().settings).toEqual(saved);
  });
  it('disposes the actual socket, gateway channels and timers without notifying subscribers again', async () => {
    const f = harness(); await f.enter(); const listener = vi.fn(), unsubscribe = f.app.subscribe(listener);
    expect(f.sockets[0].readyState).toBe(1);
    f.app.dispose(); f.app.dispose(); await vi.advanceTimersByTimeAsync(120000);
    expect(f.sockets.every(s => s.readyState === 3)).toBe(true);
    expect(f.app.diagnostics.resources).toBe(0); expect(listener).not.toHaveBeenCalled(); expect(f.games.every(g => g.gateway.diagnostics.channels === 0 && g.gateway.diagnostics.pendingRequests === 0)).toBe(true); for (const timer of f.intervals.mock.results) expect(f.clears).toHaveBeenCalledWith(timer.value);
    unsubscribe(); await expect(f.app.dispatch({ type: 'connect' })).rejects.toThrow('disposed');
  });
  it('aborts an in-flight HTTP request on disposal and never emits the late response', async () => {
    const f = harness(); await f.enter(); const wait = f.hold('PUT /api/de/decks/current'); const listener = vi.fn();
    const selecting = f.app.dispatch({ type: 'selectDeck', name: 'Fixture' }); await flush(); f.app.subscribe(listener);
    const signal = f.signals.at(-1)!; expect(signal.aborted).toBe(false); f.app.dispose(); expect(signal.aborted).toBe(true);
    wait.resolve(Response.json({ updated: 2 })); await expect(drive(selecting)).rejects.toMatchObject({ name: 'AbortError' });
    expect(listener).not.toHaveBeenCalled(); await vi.advanceTimersByTimeAsync(120000); expect(f.games.every(g => g.gateway.diagnostics.channels === 0 && g.gateway.diagnostics.pendingRequests === 0)).toBe(true); for (const timer of f.intervals.mock.results) expect(f.clears).toHaveBeenCalledWith(timer.value);
  });
});
