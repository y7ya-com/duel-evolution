import { afterEach, describe, expect, it, vi } from 'vitest';
import { ClientApp } from '../src/app';
import { CardCatalog } from '../src/catalog';
import { mountClient } from '../src/ui';
import { HttpClient } from '../src/services';
import type { GameApi, DeckList, ShopCatalog } from '../src/services';
import type { GameSession, SessionOptions, SessionState } from '../src/network/session';
import { findButton, TestDocument } from './ui-dom-fixture';

async function flush(): Promise<void> { for (let i = 0; i < 40; i++) await Promise.resolve(); }
function harness() {
  const document = new TestDocument(); vi.stubGlobal('document', document); vi.stubGlobal('window', { confirm: () => true });
  let decks: DeckList = { current: { world: 'Starter', free: null }, deleted: [], decks: [{ name: 'Starter', main: [1], side: [], extra: [], updated: 1 }] };
  const shop: ShopCatalog = { available: true, wallet: { total: 1000, bound: 0, earned: 1000 }, items: [{ id: 10, itemId: 10, kind: 0, param: 1, price: 100, internalId: null, rarity: null, category: 'singles', name: 'Test Card', owned: false }], nextRequestId: 'server-token' };
  const http = new HttpClient({ origin: 'https://game.test', timeoutMs: 0, fetch: vi.fn(async () => new Response(JSON.stringify({ signedIn: true, userId: 'user-1', name: 'Alice', roles: [], discord: false, password: true }), { headers: { 'content-type': 'application/json' } })) });
  const api = { http,
    session: vi.fn(async () => ({ signedIn: true as const, userId: 'user-1', name: 'Alice', roles: [], discord: false, password: true })),
    signIn: vi.fn(async () => {}), signOut: vi.fn(async () => {}),
    starter: vi.fn(async () => ({ claimable: false as const, reason: 'already-claimed' })),
    decks: vi.fn(async () => structuredClone(decks)),
    saveDeck: vi.fn(async (deck: { name: string; main: number[]; side: number[]; extra: number[] }, mode: string) => { decks = { ...decks, current: { ...decks.current, [mode]: deck.name }, decks: [{ ...deck, updated: 2 }] }; return { updated: 2 }; }),
    selectDeck: vi.fn(async () => ({ updated: 2 })), deleteDeck: vi.fn(async () => ({ updated: 2 })),
    shop: vi.fn(async () => structuredClone(shop)), friends: vi.fn(async () => ({ friends: [] })),
    sendChat: vi.fn(async () => ({ ok: true })),
    purchase: vi.fn(async () => ({ ...structuredClone(shop), wallet: { total: 900, bound: 0, earned: 900 }, nextRequestId: 'next-token', purchased: [], replayed: false })),
    dispose: vi.fn(() => http.dispose()),
  };
  let options!: SessionOptions;
  const session: SessionState = { phase: 'idle', connection: 'idle', characters: [{ slot: 0, name: 'Alice', level: 1, score: 0, mp: 1000, wins: 0, losses: 0, avatarA: new Uint8Array(), avatarB: new Uint8Array() }], servers: [], selectedSlot: null, profile: null, collection: new Map([[1, 3], [2, 1]]), players: [], areas: [], npcs: [], rooms: [], chat: [], area: 1, areaBlock: 1, duelFirst: null, opponentHand: null, duelOffer: null, challenge: null, outgoingChallengeRoom: null, spectating: false, error: null };
  const emit = () => options.onState?.(session);
  const game = {
    state: session, duel: null as unknown,
    start: vi.fn(async () => { session.phase = 'characters'; session.connection = 'connected'; emit(); }),
    selectCharacter: vi.fn(async (slot: number) => { session.selectedSlot = slot; session.profile = { pid: 77, level: 1, score: 0, mp: 1000 }; session.phase = 'lobby'; session.players = [{ pid: 77, name: 'Alice', level: 1, wins: 0, losses: 0, country: 'GB', areaBlock: 1, x: 500, y: 500 }, { pid: 88, name: 'Bob', level: 1, wins: 0, losses: 0, country: 'GB', areaBlock: 1, x: 550, y: 500 }]; emit(); }),
    refreshNpcs: vi.fn(async () => {}), refreshCollection: vi.fn(async () => {}), refreshCharacters: vi.fn(async () => {}),
    enterArea: vi.fn(async (area: number) => { session.area = area; emit(); }), createDuelRoom: vi.fn(async () => {}), deleteDuelRoom: vi.fn(async () => {}), challengeRoom: vi.fn(), replyToChallenge: vi.fn((accept: boolean) => { session.challenge = null; emit(); }), watchDuel: vi.fn(async () => { game.duel = {}; session.phase = 'duel'; session.spectating = true; emit(); }), move: vi.fn(), dispose: vi.fn(), sendDuel: vi.fn(),
    beginDuel: vi.fn(() => { session.phase = 'duel'; emit(); }),
    chooseHand: vi.fn(async () => { session.phase = 'choose-first'; emit(); return 'win' as const; }),
    chooseFirst: vi.fn(async (first: boolean) => { session.duelFirst = first ? 0 : 1; emit(); }),
    startNpcDuel: vi.fn(async () => { game.duel = {}; session.phase = 'rock-paper-scissors'; emit(); }),
    finishDuel: vi.fn(async () => { session.phase = 'lobby'; session.spectating = false; emit(); }),
  };
  const catalog = new CardCatalog(); catalog.install([{ passcode: 1, name: 'Test Card', type: 'Monster', extra: false, limit: 3 }, { passcode: 2, name: 'Fusion Card', description: 'Fusion effect', type: 'Fusion', extra: true, limit: 3 }]);
  const app = new ClientApp({ gatewayUrl: 'ws://game.test/net', api: api as unknown as GameApi, catalog,
    sessionFactory: o => { options = o; return game as unknown as GameSession; } });
  const root = document.createElement('div'), mounted = mountClient(root as unknown as HTMLElement, app);
  const enter = async () => { await app.initialize(); await flush(); findButton(root, 'Go Online').onclick?.({}); await flush(); root.querySelectorAll('button').find(b => b.textContent.startsWith('Alice'))!.onclick?.({}); await flush(); };
  return { app, game, api, session, root, mounted, enter, emit, dispose: () => { mounted.dispose(); app.dispose(); } };
}
afterEach(() => vi.unstubAllGlobals());

describe('actual ClientApp mounted through semantic UI', () => {
  it('enters a real controller character lifecycle without synthetic engine input', async () => {
    const f = harness(); await f.enter();
    expect(f.game.start).toHaveBeenCalledTimes(1); expect(f.game.selectCharacter).toHaveBeenCalledWith(0);
    expect(f.app.getState().scene).toBe('lobby'); expect(f.root.textContent).toContain('Duel Academy');
    expect(f.api.starter).toHaveBeenCalledTimes(1); expect(f.api.decks).toHaveBeenCalledTimes(1); f.dispose();
  });
  it('edits Fusion Deck through UI and persists the exact server deck payload', async () => {
    const f = harness(); await f.enter(); findButton(f.root, 'Edit Deck').onclick?.({}); await flush();
    const destination = f.root.querySelectorAll('select').find(n => n.dataset.key === 'deck-destination')!;
    destination.value = 'extra'; destination.onchange?.({});
    const card = f.root.querySelectorAll('button').find(n => n.dataset.key === 'collection-card:2')!;
    (card as unknown as { ondblclick(event: unknown): void }).ondblclick({}); await flush();
    findButton(f.root, 'Save').onclick?.({}); await flush();
    expect(f.api.saveDeck).toHaveBeenCalledWith({ name: 'Starter', main: [1], side: [], extra: [2] }, 'world', expect.objectContaining({ signal: expect.any(AbortSignal) }));
    expect(f.app.getState().deckEditor?.dirty).toBe(false); f.dispose();
  });
  it('carries the selected whisper recipient from composer to authenticated API', async () => {
    const f = harness(); await f.enter();
    const channel = f.root.querySelectorAll('select').find(n => n.dataset.key === 'chat-channel')!; channel.value = 'whisper'; channel.onchange?.({}); await flush();
    const target = f.root.querySelectorAll('input').find(n => n.dataset.key === 'chat-target')!, message = f.root.querySelectorAll('input').find(n => n.dataset.key === 'chat')!;
    target.value = 'Bob'; target.oninput?.({}); message.value = 'Hello'; message.oninput?.({});
    f.root.querySelectorAll('form')[0].onsubmit?.({ preventDefault() {} }); await flush();
    expect(f.api.sendChat).toHaveBeenCalledWith(expect.objectContaining({ channel: 'whisper', text: 'Hello', targetPid: 88, requestId: expect.any(String) }), expect.any(Object)); f.dispose();
  });
  it('selects a server-listed lobby area through the UI', async () => {
    const f = harness(); await f.enter(); f.session.areas = [{ area: 3, block: 1, kind: 0, population: 2 }]; f.emit(); await flush();
    const area = f.root.querySelectorAll('select').find(n => n.dataset.key === 'lobby-area')!;
    expect(area).toBeDefined(); area.value = '3/1'; area.onchange?.({}); await flush();
    expect(f.game.enterArea).toHaveBeenCalledWith(3); expect(f.app.getState().lobby?.name).toContain('Area 3'); f.dispose();
  });
  it('buys through the authenticated idempotency token and confirms the returned balance', async () => {
    const f = harness(); await f.enter(); findButton(f.root, 'Shop').onclick?.({}); await flush(); findButton(f.root, 'Purchase').onclick?.({}); await flush();
    expect(f.api.purchase).toHaveBeenCalledWith({ itemId: 10, count: 1, requestId: 'server-token' }, expect.any(Object));
    expect(f.app.getState().shop?.mp).toBe(900); f.dispose();
  });
  it('starts the selected NPC from the explicit server NPC list without invented coordinates', async () => {
    const f = harness(); await f.enter(); f.session.npcs = [{ id: 5, name: 'A-lien', parts: new Uint8Array(), threshold: 0, spot: 42, previous: 0 }]; f.emit(); await flush();
    findButton(f.root, 'A-lien').onclick?.({}); await flush();
    expect(f.game.startNpcDuel).toHaveBeenCalledWith(5, { main: [1], side: [], extra: [] }); f.dispose();
  });
  it('shows and submits every duel-preparation step through the session controller', async () => {
    const f = harness(); await f.enter(); await f.app.dispatch({ type: 'interact', playerId: -1 }); await flush();
    findButton(f.root, 'Rock').onclick?.({}); await flush(); expect(f.game.chooseHand).toHaveBeenCalledWith(0);
    findButton(f.root, 'Go First').onclick?.({}); await flush(); expect(f.game.chooseFirst).toHaveBeenCalledWith(true);
    findButton(f.root, 'Start Duel').onclick?.({}); await flush(); expect(f.game.beginDuel).toHaveBeenCalledTimes(1);
    expect(f.app.getState().preparation).toBeUndefined(); f.dispose();
  });
  it('renders and accepts an actual session invitation through the app', async () => {
    const f = harness(); await f.enter(); f.session.challenge = { pid: 88, name: 'Bob', level: 1, title: 0, parts: new Uint8Array(16) }; f.emit(); await flush();
    findButton(f.root, 'Accept Duel').onclick?.({}); await flush(); expect(f.game.replyToChallenge).toHaveBeenCalledWith(true); expect(f.app.getState().lobby?.invitation).toBeUndefined(); f.dispose();
  });
  it('enters and leaves a server-owned spectator stream without a surrender command', async () => {
    const f = harness(); await f.enter(); f.session.rooms = [{ id: 9, owner: 88, opponent: 99, state: 1, style: 3, mode: 0, password: false, options: [1, 1, 1] }]; f.emit(); await flush();
    findButton(f.root, 'Watch').onclick?.({}); await flush(); expect(f.game.watchDuel).toHaveBeenCalledWith(88); expect(f.app.getState().duel?.spectating).toBe(true);
    findButton(f.root, 'Leave Duel').onclick?.({}); await flush(); expect(f.game.finishDuel).toHaveBeenCalledTimes(1); expect(f.game.sendDuel).not.toHaveBeenCalled(); expect(f.app.getState().scene).toBe('lobby');
    await f.app.dispatch({ type: 'settings', settings: { reducedMotion: true } });
    expect(f.app.getState().duel).toBeNull(); f.dispose();
  });
  it('does not resurrect the lobby after a character boot completes following disconnect', async () => {
    const f = harness(); await f.app.initialize(); await f.app.dispatch({ type: 'connect' });
    let resolveDecks!: (value: DeckList) => void;
    f.api.decks.mockImplementationOnce(() => new Promise<DeckList>(resolve => { resolveDecks = resolve; }));
    const boot = f.app.dispatch({ type: 'selectCharacter', slot: 0 }); await flush();
    expect(f.api.decks).toHaveBeenCalledTimes(1); await f.app.dispatch({ type: 'disconnect' });
    resolveDecks({ current: { world: null, free: null }, decks: [], deleted: [] }); await boot.catch(() => {}); await flush();
    expect(f.app.getState().connection).toBe('offline'); expect(f.app.getState().player).toBeNull(); expect(f.app.getState().scene).toBe('title'); f.dispose();
  });
  it('sends surrender as a server request and never asserts local victory or defeat', async () => {
    const f = harness(); await f.enter(); await f.app.dispatch({ type: 'interact', playerId: -1 }); await f.app.dispatch({ type: 'beginDuel' }); await flush();
    findButton(f.root, 'Surrender').onclick?.({}); await flush();
    const [id, bytes] = f.game.sendDuel.mock.calls[0] as unknown as [number, Uint8Array];
    expect(id).toBe(0x6350); expect(bytes).toHaveLength(16); expect(new DataView(bytes.buffer).getUint32(12)).toBe(10);
    expect(f.app.getState().duel?.ended).toBeUndefined(); f.dispose();
  });
});
