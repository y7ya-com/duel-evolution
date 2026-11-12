import { afterEach, describe, expect, it, vi } from 'vitest';
import { ClientApp } from '../src/app';
import { CardCatalog } from '../src/catalog';
import { mountClient } from '../src/ui';
import { HttpClient } from '../src/services';
import { ApiError } from '../src/services/http';
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
  const session: SessionState = { phase: 'idle', connection: 'idle', characters: [{ slot: 0, name: 'Alice', level: 1, score: 0, mp: 1000, wins: 0, losses: 0, avatarA: new Uint8Array(), avatarB: new Uint8Array() }], servers: [], selectedSlot: null, profile: null, collection: new Map([[1, 3], [2, 1]]), players: [], areas: [], npcs: [], rooms: [], chat: [], area: 1, areaBlock: 1, duelFirst: null, opponentHand: null, matchmaking: { status: 'idle', style: 3, similarLevel: false, opponent: null, counts: { single: 0, match: 0, either: 0 }, matchSupported: false }, relay: null, duelRole: 'player', match: null, duelOffer: null, challenge: null, outgoingChallengeRoom: null, spectating: false, error: null };
  const emit = () => options.onState?.(session);
  const game = {
    state: session, duel: null as unknown,
    start: vi.fn(async () => { session.phase = 'characters'; session.connection = 'connected'; emit(); }),
    selectCharacter: vi.fn(async (slot: number) => { session.selectedSlot = slot; session.profile = { pid: 77, level: 1, score: 0, mp: 1000 }; session.phase = 'lobby'; session.players = [{ pid: 77, name: 'Alice', level: 1, wins: 0, losses: 0, country: 'GB', areaBlock: 1, x: 500, y: 500 }, { pid: 88, name: 'Bob', level: 1, wins: 0, losses: 0, country: 'GB', areaBlock: 1, x: 550, y: 500 }]; emit(); }),
    refreshNpcs: vi.fn(async () => {}), refreshCollection: vi.fn(async () => {}), refreshPlayerBits: vi.fn(async () => {}), refreshCharacters: vi.fn(async () => {}),
    enterArea: vi.fn(async (area: number) => { session.area = area; emit(); }), createDuelRoom: vi.fn(async () => {}), deleteDuelRoom: vi.fn(async () => {}), challengeRoom: vi.fn(), replyToChallenge: vi.fn((accept: boolean) => { session.challenge = null; emit(); }), watchDuel: vi.fn(async () => { game.duel = {}; session.phase = 'duel'; session.spectating = true; emit(); }), move: vi.fn(), dispose: vi.fn(), sendDuel: vi.fn(),
    beginDuel: vi.fn(() => { session.phase = 'duel'; emit(); }),
    chooseHand: vi.fn(async () => { session.phase = 'choose-first'; emit(); return 'win' as const; }),
    chooseFirst: vi.fn(async (first: boolean) => { session.duelFirst = first ? 0 : 1; emit(); }),
    startNpcDuel: vi.fn(async () => { game.duel = {}; session.phase = 'rock-paper-scissors'; emit(); }),
    finishDuel: vi.fn(async () => { session.phase = 'lobby'; session.spectating = false; emit(); }),
    leaveCalledOffDuel: vi.fn(async () => { session.phase = 'lobby'; session.duelCalledOff = null; emit(); }), cancelChallenge: vi.fn(async () => {}),
  };
  const catalog = new CardCatalog(); catalog.install([{ passcode: 1, name: 'Test Card', type: 'Monster', extra: false, limit: 3 }, { passcode: 2, name: 'Fusion Card', description: 'Fusion effect', type: 'Fusion', extra: true, limit: 3 }]);
  const app = new ClientApp({ gatewayUrl: 'ws://game.test/net', api: api as unknown as GameApi, catalog,
    sessionFactory: o => { options = o; return game as unknown as GameSession; } });
  const root = document.createElement('div'), mounted = mountClient(root as unknown as HTMLElement, app);
  const enter = async () => { await app.initialize(); await flush(); findButton(root, 'Go Online').onclick?.({}); await flush(); expect(mounted.htmlUi.text()).toContain('Alice'); expect(mounted.htmlUi.press('character-slot:0')).toBe(true); await flush(); };
  // main's lobby windows (htmlui/lobby.ts): the player list's search menu, its row, and a list row pressed at its game
  // point (the row's centre), as main's screens press it
  const control = (label: string, cls?: string) => { for (const spec of mounted.htmlUi.windows()) if (!cls || spec.win.cls === cls) for (const [id, h] of spec.handlers) if (h.label === label && !h.key) return { spec, h, c: spec.win.controls.find(c => c.id === id)! }; return undefined; };
  const pressRow = (label: string, row: number, cls?: string) => { const t = control(label, cls); expect(t).toBeDefined(); t!.h.click!([t!.spec.win.x + t!.c.x + 8, t!.spec.win.y + t!.c.y + 16 * row + 8]); };
  // an NPC on the map: live starts its talk at once, its card beside it (the map's button sends this interaction; the
  // test map places no NPC)
  const pickNpc = async (name: string, id: number) => {
    expect(app.getState().lobby?.npcs?.some(n => n.id === id && n.name === name)).toBe(true);
    const avatar = root.querySelectorAll('button').find(n => n.dataset.key === `avatar:${-id}`);
    if (avatar) avatar.onclick?.({}); else await app.dispatch({ type: 'interact', playerId: -id });
    await flush();
  };
  const openPlayer = async (name: string) => {
    const rows = control('Players here', 'CPlayerListDlg')!.c.items as string[], row = rows.findIndex(r => r.endsWith(`/${name}`));
    expect(row).toBeGreaterThanOrEqual(0); pressRow('Players here', row, 'CPlayerListDlg'); await flush();
  };
  const startNpc = async () => { session.npcs = [{ id: 1, name: 'Test NPC', parts: new Uint8Array(16), threshold: 0, spot: 42, previous: 0 }]; emit(); await flush(); await pickNpc('Test NPC', 1); expect(mounted.htmlUi.press('npc-start:yes')).toBe(true); await flush(); };
  return { app, game, api, session, root, mounted, enter, startNpc, pickNpc, openPlayer, emit, dispose: () => { mounted.dispose(); app.dispose(); } };
}
afterEach(() => vi.unstubAllGlobals());

describe('actual ClientApp mounted through semantic UI', () => {
  it('tells a refused sign-in apart from an ended session', async () => {
    const f = harness(); await f.app.initialize(); await flush();
    f.api.signIn.mockRejectedValueOnce(new ApiError('Invalid username or password', 401));
    await expect(f.app.dispatch({ type: 'signIn', username: 'Alice', password: 'wrong' })).rejects.toThrow('Incorrect User ID or Password.'); await flush();
    expect(f.app.getState().error).toBe('Incorrect User ID or Password.'); f.dispose();
  });
  it('enters a real controller character lifecycle without synthetic engine input', async () => {
    const f = harness(); await f.enter();
    expect(f.game.start).toHaveBeenCalledTimes(1); expect(f.game.selectCharacter).toHaveBeenCalledWith(0, 'my-room');
    expect(f.app.getState().scene).toBe('lobby'); expect(f.root.textContent).toContain('Duel Academy');
    expect(f.api.starter).toHaveBeenCalledTimes(1); expect(f.api.decks).toHaveBeenCalledTimes(1); f.dispose();
  });
  it('edits Fusion Deck through UI and persists the exact server deck payload', async () => {
    const f = harness(); await f.enter(); f.mounted.htmlUi.press('main-menu'); expect(f.mounted.htmlUi.press('menu:deck')).toBe(true); await flush();
    // main's deck screen (htmlui/deck-scene.ts): the Fusion Card's trunk row (the second) dragged onto the Main grid
    // goes to the Fusion Deck; then Save (the side menu's second button) and the list's OK over the deck being edited
    // deck-dom.ts: the trunk row's element picked up, released on the Main grid's drop zone; the Save Deck button
    const all = () => (f.mounted.htmlUi.deck() as unknown as { querySelectorAll(s: string): any[] }).querySelectorAll('*');
    const ev = (type: string) => ({ type, button: 0, clientX: 0, clientY: 0, preventDefault() {}, stopPropagation() {} });
    all().find(n => n.dataset.zone === 'trunk' && n.dataset.index === '1' && n.dataset.passcode)!.dispatchEvent(ev('mousedown'));
    all().find(n => n.dataset.dropZone === 'main')!.dispatchEvent(ev('mouseup')); await flush();
    all().find(n => n.getAttribute?.('aria-label') === 'Save Deck')!.onclick({}); await flush();
    // (live's list opens with no row chosen: the deck's own row first)
    expect(f.mounted.htmlUi.press('deck-file:Starter')).toBe(true); await flush();
    expect(f.mounted.htmlUi.press('deck-files-ok')).toBe(true); await flush();
    expect(f.api.saveDeck).toHaveBeenCalledWith({ name: 'Starter', main: [1], side: [], extra: [2] }, 'world', expect.objectContaining({ signal: expect.any(AbortSignal) }));
    expect(f.app.getState().deckEditor?.dirty).toBe(false); f.dispose();
  });
  it('carries the selected whisper recipient from composer to authenticated API', async () => {
    const f = harness(); await f.enter();
    // main's chat (CChatWindow): a whisper is '/w <name> <text>' on the input line, sent with Enter
    expect(f.mounted.htmlUi.type('chat', '/w Bob Hello')).toBe(true); expect(f.mounted.htmlUi.enter('chat')).toBe(true); await flush();
    expect(f.api.sendChat).toHaveBeenCalledWith(expect.objectContaining({ channel: 'whisper', text: 'Hello', targetPid: 88, requestId: expect.any(String) }), expect.any(Object)); f.dispose();
  });
  it('selects a server-listed lobby area through the UI', async () => {
    const f = harness(); await f.enter(); f.session.areas = [{ area: 3, block: 1, kind: 0, population: 2 }]; f.emit(); await flush();
    // the menu bar's Move key opens main's Move list (CWindowModelMove), a row per server-listed area
    expect(f.mounted.htmlUi.press('menubar-move')).toBe(true); await flush();
    expect(f.mounted.htmlUi.press('move-area:3/1')).toBe(true); await flush();
    expect(f.game.enterArea).toHaveBeenCalledWith(3); expect(f.app.getState().lobby?.name).toContain('Area 3'); f.dispose();
  });
  it('the wheel over the Move list moves its rows a row a notch, so every area past the sixth can be reached', async () => {
    const f = harness(); await f.enter(); f.session.areas = Array.from({ length: 9 }, (_, i) => ({ area: i, block: 1, kind: 0, population: 1 })); f.emit(); await flush();
    expect(f.mounted.htmlUi.press('menubar-move')).toBe(true); await flush();
    const rowShown = (area: number) => f.mounted.htmlUi.windows().flatMap(w => w.win.controls).some(c => c.shown && String(c.name).startsWith(`area:${area}:`));
    expect(rowShown(0)).toBe(true); expect(rowShown(8)).toBe(false);
    for (let i = 0; i < 5; i++) { const spec = f.mounted.htmlUi.windows().find(w => w.win.controls.some(c => String(c.name).startsWith('area:')))!; [...spec.handlers.values()].find(h => h.wheel)!.wheel!(100); await flush(); }
    expect(rowShown(8)).toBe(true); expect(rowShown(0)).toBe(false);
    expect(f.mounted.htmlUi.press('move-area:8/1')).toBe(true); await flush();
    expect(f.game.enterArea).toHaveBeenCalledWith(8); f.dispose();
  });
  it('buys through the authenticated idempotency token and confirms the returned balance', async () => {
    // the store's door opens the shop (live has no Main Menu entry for it); the purchase itself is the app's buy command
    const f = harness(); await f.enter(); await f.app.dispatch({ type: 'openScene', scene: 'shop' }); await flush();
    expect(f.mounted.htmlUi.press('main-menu')).toBe(false);
    await f.app.dispatch({ type: 'buy', itemId: 10, count: 1 }); await flush();
    expect(f.api.purchase).toHaveBeenCalledWith({ itemId: 10, count: 1, requestId: 'server-token' }, expect.any(Object));
    expect(f.app.getState().shop?.mp).toBe(900); f.dispose();
  });
  it('starts the selected NPC from the explicit server NPC list without invented coordinates', async () => {
    const f = harness(); await f.enter(); f.session.npcs = [{ id: 5, name: 'A-lien', parts: new Uint8Array(), threshold: 0, spot: 42, previous: 0 }]; f.emit(); await flush();
    await f.pickNpc('A-lien', 5);
    expect(f.game.startNpcDuel).not.toHaveBeenCalled(); expect(f.app.getState().npc?.stage).toBe('ask'); expect(f.mounted.htmlUi.press('npc-start:yes')).toBe(true); await flush();
    expect(f.game.startNpcDuel).toHaveBeenCalledWith(5, { main: [1], side: [], extra: [] }); f.dispose();
  });
  it('shows and submits every duel-preparation step through the session controller', async () => {
    const f = harness(); await f.enter(); await f.startNpc();
    findButton(f.root, 'Rock').onclick?.({}); await flush(); expect(f.game.chooseHand).toHaveBeenCalledWith(0);
    findButton(f.root, 'Go First').onclick?.({}); await flush(); expect(f.game.chooseFirst).toHaveBeenCalledWith(true);
    // live starts the duel itself once who goes first is known (no Start Duel step: the server's 90 s attach window)
    await flush(); expect(f.game.beginDuel).toHaveBeenCalledTimes(1); expect(f.root.textContent).not.toContain('Start Duel');
    expect(f.app.getState().preparation).toBeUndefined(); f.dispose();
  });
  it('hides the opponent\'s last hand while the hands are asked again after a draw', async () => {
    const f = harness(); await f.enter(); await f.startNpc();
    f.session.opponentHand = 0; f.emit(); await flush();
    expect(f.app.getState().preparation?.opponentHand).toBeNull(); expect(f.mounted.htmlUi.text() + f.root.textContent).not.toContain('Opponent chose');
    f.dispose();
  });
  it('shows live\'s box for a duel called off before it began and goes back to the lobby on its OK', async () => {
    const f = harness(); await f.enter(); await f.startNpc();
    f.session.duelCalledOff = { aboutOpponent: true }; f.emit(); await flush();
    expect(f.app.getState().preparation).toBeUndefined(); expect(f.mounted.htmlUi.text()).toContain('has disconnected.');
    expect(f.mounted.htmlUi.press('duel-calledoff-ok')).toBe(true); await flush();
    expect(f.game.leaveCalledOffDuel).toHaveBeenCalledTimes(1); expect(f.app.getState().scene).toBe('lobby'); f.dispose();
  });
  it('shows live\'s duel request boxes: Requesting Duel, the challenger\'s level and title, and the refusal', async () => {
    const f = harness(); await f.enter();
    f.session.outgoingChallengeRoom = 9; f.emit(); await flush();
    expect(f.mounted.htmlUi.text()).toContain('Requesting Duel'); expect(f.mounted.htmlUi.press('duel-request-cancel')).toBe(true);
    f.session.outgoingChallengeRoom = null; f.session.challengeRefusals = 1; f.emit(); await flush();
    expect(f.mounted.htmlUi.text()).toContain('Duel Request was refused.'); expect(f.mounted.htmlUi.press('duel-refused-ok')).toBe(true); await flush();
    expect(f.mounted.htmlUi.text()).not.toContain('Duel Request was refused.');
    f.session.challenge = { pid: 88, name: 'Bob', level: 3, title: 0, parts: new Uint8Array(16) }; f.emit(); await flush();
    expect(f.mounted.htmlUi.text()).toContain('Lv3 Bob'); expect(f.mounted.htmlUi.text()).toContain('You have aDuel Request!');
    f.dispose();
  });
  it('renders and accepts an actual session invitation through the app', async () => {
    const f = harness(); await f.enter(); f.session.challenge = { pid: 88, name: 'Bob', level: 1, title: 0, parts: new Uint8Array(16) }; f.emit(); await flush();
    expect(f.mounted.htmlUi.press('duel-accept')).toBe(true); await flush(); expect(f.game.replyToChallenge).toHaveBeenCalledWith(true); expect(f.app.getState().lobby?.invitation).toBeUndefined(); f.dispose();
  });
  it('enters and leaves a server-owned spectator stream without a surrender command', async () => {
    const f = harness(); await f.enter(); f.session.rooms = [{ id: 9, owner: 88, opponent: 99, state: 1, style: 3, mode: 1, password: false, options: [1, 1, 0] }];
    f.session.players.find(p => p.pid === 88)!.state = 0x68; f.emit(); await flush();   // Bob is duelling (the server's 0x67..0x6a)
    // main's lobby: Bob's row in the player list opens his card (CPlayerListMenu), whose Watch button spectates his duel
    await f.openPlayer('Bob'); expect(f.mounted.htmlUi.press('card-watch')).toBe(true); await flush(); expect(f.game.watchDuel).toHaveBeenCalledWith(88); expect(f.app.getState().duel?.spectating).toBe(true);
    // no Surrender for a spectator: a deck's command list (live's CUSummonDialogSp) leaves the duel
    const deck = f.root.querySelectorAll('button').find(b => b.dataset.zone === 'deck' && b.dataset.side === 'your')!; deck.onclick?.({}); await flush();
    expect(f.mounted.htmlUi.press('duel-surrender')).toBe(false); expect(f.mounted.htmlUi.press('duel-leave')).toBe(true); await flush(); expect(f.game.finishDuel).toHaveBeenCalledTimes(1); expect(f.game.sendDuel).not.toHaveBeenCalled(); expect(f.app.getState().scene).toBe('lobby');
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
    const f = harness(); await f.enter(); await f.startNpc(); await f.app.dispatch({ type: 'beginDuel' }); await flush();
    // live's Surrender: the player's deck's command list (CUSummonDialogSp)
    const deck = f.root.querySelectorAll('button').find(b => b.dataset.zone === 'deck' && b.dataset.side === 'your')!; deck.onclick?.({}); await flush();
    expect(f.mounted.htmlUi.press('duel-surrender')).toBe(true); await flush();
    // the confirmation is main's Yes / No dialog (dialog.js); nothing is sent until Yes
    expect(f.game.sendDuel).not.toHaveBeenCalled(); expect(f.mounted.htmlUi.press('surrender-yes')).toBe(true); await flush();
    const [id, bytes] = f.game.sendDuel.mock.calls[0] as unknown as [number, Uint8Array];
    expect(id).toBe(0x6350); expect(bytes).toHaveLength(16); expect(new DataView(bytes.buffer).getUint32(12)).toBe(10);
    expect(f.app.getState().duel?.ended).toBeUndefined(); f.dispose();
  });
});
