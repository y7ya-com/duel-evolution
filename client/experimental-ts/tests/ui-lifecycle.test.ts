import { afterEach, describe, expect, it, vi } from 'vitest';
import { mountClient } from '../src/ui';
import type { ClientCommand, ClientController, ClientView } from '../src/ui/contracts';
import { findButton, TestDocument, TestNode } from './ui-dom-fixture';

function fixture(loadCardImage?: ClientController['loadCardImage'], configureDocument?: (document: TestDocument) => void) {
  const document = new TestDocument();
  configureDocument?.(document);
  vi.stubGlobal('document', document); vi.stubGlobal('window', { confirm: () => true });
  const root = document.createElement('div');
  let state: ClientView = { scene: 'title', connection: 'offline', status: 'Offline', auth: { signedIn: false }, player: null, characters: [], lobby: null, deckEditor: null, shop: null, duel: null, social: null, settings: { sound: 1, music: 1, reducedMotion: false, showCardNames: true } };
  const commands: ClientCommand[] = [], listeners = new Set<(s: ClientView) => void>();
  const controller: ClientController = {
    getState: () => state,
    subscribe: fn => { listeners.add(fn); return () => { listeners.delete(fn); }; },
    dispatch: command => { commands.push(command); },
    ...(loadCardImage ? { loadCardImage } : {}),
  };
  const mounted = mountClient(root as unknown as HTMLElement, controller);
  const update = (patch: Partial<ClientView>) => { state = { ...state, ...patch }; for (const listener of listeners) listener(state); };
  return { document, root, commands, mounted, update, listeners };
}
afterEach(() => { vi.unstubAllGlobals(); });

describe('UI ownership and semantic interaction', () => {
  it('submits credentials through the controller, then clears the password field', () => {
    const f = fixture(), inputs = f.root.querySelectorAll('input');
    const username = inputs.find(i => i.dataset.key === 'username')!, password = inputs.find(i => i.dataset.key === 'password')!;
    username.value = 'Duelist'; password.value = 'private-password';
    f.root.querySelectorAll('form')[0].onsubmit?.({ preventDefault() {} });
    expect(f.commands).toEqual([{ type: 'signIn', username: 'Duelist', password: 'private-password' }]);
    expect(password.value).toBe('');
    expect(f.root.textContent).not.toContain('private-password'); f.mounted.dispose();
  });
  it('does not invent online readiness and invokes connect explicitly', async () => {
    const f = fixture(); f.update({ auth: { signedIn: true, name: 'Duelist' } }); await Promise.resolve();
    findButton(f.root, 'Go Online').onclick?.({});
    expect(f.commands).toEqual([{ type: 'connect', freeMode: false }]);
    expect(f.root.textContent).toContain('Offline'); f.mounted.dispose();
  });
  it('enters free-duel mode explicitly and hides paid-world controls', async () => {
    const f = fixture(); f.update({ auth: { signedIn: true } }); await Promise.resolve(); findButton(f.root, 'Free Duel & Deck Editor').onclick?.({});
    expect(f.commands).toEqual([{ type: 'connect', freeMode: true }]);
    f.update({ scene: 'lobby', mode: 'free', player: { id: 1, name: 'A' }, lobby: { name: 'Free Duel', avatars: [], channels: [], chat: [], connected: true, npcs: [{ id: 1, name: 'NPC A' }] }, starter: { claimable: true, decks: [{ id: 1, name: 'Starter A' }] } }); await Promise.resolve();
    expect(f.root.querySelectorAll('button').some(b => b.textContent === 'Shop' || b.textContent === 'NPC A')).toBe(false); expect(f.root.textContent).not.toContain('Choose your Starter Deck'); expect(f.root.textContent).toContain('Free Duel'); f.mounted.dispose();
  });
  it('starts matchmaking with exact preferences and updates queue controls authoritatively', async () => {
    const f = fixture(), matchmaking: NonNullable<ClientView['matchmaking']> = { status: 'idle', style: 3, similarLevel: false, opponent: null, counts: { single: 2, match: 1, either: 3 }, matchSupported: false };
    f.update({ scene: 'lobby', player: { id: 1, name: 'A' }, lobby: { name: 'Academy', avatars: [], channels: [], chat: [], connected: true }, matchmaking }); await Promise.resolve();
    f.root.querySelectorAll('select').find(n => n.dataset.key === 'matchmaking-style')!.value = '6'; const preference = f.root.querySelectorAll('input').find(n => n.dataset.key === 'matchmaking-similar')!; preference.checked = true; preference.onchange?.({});
    f.update({ status: 'Unrelated world update' }); await Promise.resolve(); expect(f.root.querySelectorAll('input').find(n => n.dataset.key === 'matchmaking-similar')!.checked).toBe(true);
    findButton(f.root, 'Find Opponent').onclick?.({}); expect(f.commands).toEqual([{ type: 'startMatchmaking', style: 6, similarLevel: true }]); expect(f.root.textContent).not.toContain('Searching for an opponent');
    f.update({ matchmaking: { ...matchmaking, status: 'searching' } }); await Promise.resolve(); findButton(f.root, 'Cancel Search').onclick?.({}); expect(f.commands.at(-1)).toEqual({ type: 'cancelMatchmaking' }); expect(f.root.textContent).toContain('Room counts include all queued rooms'); f.mounted.dispose();
  });
  it('renders server purchase receipts with bounded artwork and preserves replay labels', async () => {
    const release = vi.fn(), loader = vi.fn(async () => ({ url: 'blob:https://game.test/card1', release })), f = fixture(loader);
    f.update({ scene: 'shop', shop: { items: [], mp: 100, purchased: [{ id: '1', passcode: 1, name: 'Actual reward', description: 'A real effect' }], replayed: true } }); await Promise.resolve(); await Promise.resolve();
    expect(f.root.textContent).toContain('Acquired Cards (1) · Previous receipt'); const preview = f.root.querySelectorAll('button').find(n => n.getAttribute('aria-label') === 'Inspect Actual reward')!; preview.onclick?.({}); await Promise.resolve(); expect(f.root.textContent).toContain('A real effect');
    expect(loader).toHaveBeenCalledOnce(); f.update({ scene: 'title' }); await Promise.resolve(); expect(release).toHaveBeenCalledOnce(); f.mounted.dispose();
  });
  it('disposes its subscription, mounted nodes and queued renders; detached actions do nothing', async () => {
    const f = fixture(), oldButton = findButton(f.root, 'Options'), oldHost = f.root.childNodes[0];
    expect(f.listeners.size).toBe(1); f.update({ status: 'Queued update' }); f.mounted.dispose();
    await Promise.resolve(); oldButton.onclick?.({}); f.mounted.render();
    expect(f.listeners.size).toBe(0); expect(f.root.childNodes).toHaveLength(0); expect(oldHost.childNodes).toHaveLength(0); expect(f.commands).toHaveLength(0);
    f.mounted.dispose();
  });
  it('rejects a prompt that changed before its rendered action is clicked', async () => {
    const f = fixture();
    const duel: NonNullable<ClientView['duel']> = { players: [{ name: 'A', lp: 8000 }, { name: 'B', lp: 8000 }], cards: [], turn: 1, turnPlayer: 0, phase: 'Main', log: [], prompt: { id: 'old', kind: 'yes-no', text: 'Activate?', options: [{ id: 'yes', label: 'Yes' }] } };
    f.update({ scene: 'duel', duel }); await Promise.resolve();
    const old = findButton(f.root, 'Yes');
    f.update({ duel: { ...duel, prompt: { ...duel.prompt!, id: 'new' } } });
    old.onclick?.({});
    expect(f.commands).toHaveLength(0); await Promise.resolve(); expect(f.root.textContent).toContain('expired'); f.mounted.dispose();
  });
  it('shows unavailable features as unavailable and never renders their controls', async () => {
    const f = fixture(); f.update({ scene: 'shop', unavailable: { shop: 'Shop protocol is not implemented.' } }); await Promise.resolve();
    expect(f.root.textContent).toContain('Shop protocol is not implemented.');
    expect(f.root.querySelectorAll('button').some(b => b.textContent === 'Purchase')).toBe(false); f.mounted.dispose();
  });
  it('exposes actions on a face-down card without revealing its identity', async () => {
    const f = fixture(); f.update({ scene: 'duel', duel: { players: [{ name: 'A', lp: 8000 }, { name: 'B', lp: 8000 }], turn: 1, turnPlayer: 0, phase: 'Main', log: [], prompt: null, cards: [{ id: 'set1', name: 'Secret Trap', controller: 0, zone: 'spell', index: 0, faceUp: false }], actions: [{ id: 'activate', cardId: 'set1', label: 'Activate trap' }] } }); await Promise.resolve();
    f.root.querySelectorAll('button').find(b => b.dataset.key === 'field-card:set1')!.onclick?.({}); await Promise.resolve();
    expect(f.root.textContent).not.toContain('Secret Trap'); findButton(f.root, 'Activate trap').onclick?.({});
    expect(f.commands).toEqual([{ type: 'duelAction', actionId: 'activate' }]); f.mounted.dispose();
  });
  it('accepts a server-issued card prompt with a legal empty selection', async () => {
    const f = fixture(); f.update({ scene: 'duel', duel: { players: [{ name: 'A', lp: 8000 }, { name: 'B', lp: 8000 }], cards: [], turn: 1, turnPlayer: 0, phase: 'Main', log: [], prompt: { id: 'zero', kind: 'cards', text: 'Choose zero', min: 0, max: 0, candidates: [], options: [] } } }); await Promise.resolve();
    findButton(f.root, 'Confirm Selection').onclick?.({});
    expect(f.commands).toEqual([{ type: 'duelRespond', promptId: 'zero', response: { cardIds: [] } }]); f.mounted.dispose();
  });
  it('uses current-state validation and busy gating for Escape cancellation', async () => {
    const f = fixture(); const duel: NonNullable<ClientView['duel']> = { players: [{ name: 'A', lp: 8000 }, { name: 'B', lp: 8000 }], cards: [], turn: 1, turnPlayer: 0, phase: 'Main', log: [], prompt: { id: 'old', kind: 'cards', text: 'Choose', options: [], candidates: [], min: 0, max: 0, cancelable: true } };
    f.update({ scene: 'duel', duel }); await Promise.resolve(); const host = f.root.childNodes[0];
    f.update({ duel: { ...duel, prompt: { ...duel.prompt!, id: 'new', cancelable: false } } }); host.onkeydown?.({ key: 'Escape', preventDefault() {} });
    expect(f.commands).toHaveLength(0); await Promise.resolve();
    f.update({ duel, busy: true }); await Promise.resolve(); host.onkeydown?.({ key: 'Escape', preventDefault() {} }); expect(f.commands).toHaveLength(0); f.mounted.dispose();
  });
  it('preserves candidate button focus and isolates number drafts by prompt identity', async () => {
    const f = fixture(); const duel: NonNullable<ClientView['duel']> = { players: [{ name: 'A', lp: 8000 }, { name: 'B', lp: 8000 }], cards: [], turn: 1, turnPlayer: 0, phase: 'Main', log: [], prompt: { id: 'cards', kind: 'cards', text: 'Choose', options: [], candidates: [{ id: 'a', label: 'Choice A' }], min: 0, max: 1 } };
    f.update({ scene: 'duel', duel }); await Promise.resolve(); const candidate = findButton(f.root, 'Choice A'); candidate.focus(); candidate.onclick?.({}); await Promise.resolve();
    expect(f.root.contains(f.document.activeElement)).toBe(true); expect(f.document.activeElement?.getAttribute('aria-pressed')).toBe('true');
    f.update({ duel: { ...duel, prompt: { id: 'number-one', kind: 'number', text: 'Number one', options: [], numberMin: 0, numberMax: 100 } } }); await Promise.resolve();
    const number = f.root.querySelectorAll('input').find(i => i.dataset.key === 'prompt-number:number-one')!; number.focus(); number.value = '73';
    f.update({ duel: { ...duel, prompt: { id: 'number-two', kind: 'number', text: 'Number two', options: [], numberMin: 1, numberMax: 100 } } }); await Promise.resolve();
    expect(f.root.querySelectorAll('input').find(i => i.dataset.key === 'prompt-number:number-two')?.value).toBe('1'); f.mounted.dispose();
  });
  it('submits attribute checklists as one semantic set and supports board target clicks', async () => {
    const f = fixture(); const duel: NonNullable<ClientView['duel']> = { players: [{ name: 'A', lp: 8000 }, { name: 'B', lp: 8000 }], cards: [], turn: 1, turnPlayer: 0, phase: 'Main', log: [], prompt: { id: 'attrs', kind: 'attributes', text: 'Choose two attributes', min: 2, max: 2, options: [{ id: 'light', label: 'LIGHT' }, { id: 'dark', label: 'DARK' }] } };
    f.update({ scene: 'duel', duel }); await Promise.resolve();
    for (const key of ['light', 'dark']) { const check = f.root.querySelectorAll('input').find(n => n.dataset.key === `prompt-attribute:attrs:${key}`)!; check.checked = true; check.onchange?.({}); await Promise.resolve(); }
    findButton(f.root, 'Confirm Attributes').onclick?.({}); expect(f.commands).toEqual([{ type: 'duelRespond', promptId: 'attrs', response: { optionIds: ['light', 'dark'] } }]);
    f.update({ duel: { ...duel, cards: [{ id: 'target1', name: 'Target', controller: 1, zone: 'monster', index: 0, faceUp: true }], prompt: { id: 'target', kind: 'place', text: 'Choose a target', options: [{ id: 'server-target', label: 'Target monster', cardId: 'target1' }] } } }); await Promise.resolve();
    f.root.querySelectorAll('button').find(n => n.dataset.key === 'field-card:target1')!.onclick?.({});
    expect(f.commands.at(-1)).toEqual({ type: 'duelRespond', promptId: 'target', response: { optionId: 'server-target' } }); f.mounted.dispose();
  });
  it('routes duel-room invitations and spectator exit through semantic commands', async () => {
    const f = fixture(); f.update({ scene: 'lobby', player: { id: 1, name: 'A' }, lobby: { name: 'Academy', avatars: [], chat: [], channels: ['global'], connected: true, rooms: [{ id: 9, owner: 2, name: 'B room', state: 0 }, { id: 10, owner: 3, name: 'C room', state: 1, opponent: 4, watch: true }], invitation: { name: 'B', pid: 2 } } }); await Promise.resolve();
    findButton(f.root, 'Create Duel').onclick?.({}); findButton(f.root, 'Challenge').onclick?.({}); findButton(f.root, 'Watch').onclick?.({}); findButton(f.root, 'Accept Duel').onclick?.({}); findButton(f.root, 'Decline').onclick?.({});
    expect(f.commands).toEqual([{ type: 'createDuelRoom' }, { type: 'challengeRoom', roomId: 9 }, { type: 'spectate', pid: 3 }, { type: 'replyChallenge', accept: true }, { type: 'replyChallenge', accept: false }]);
    f.update({ scene: 'duel', duel: { players: [{ name: 'A', lp: 8000 }, { name: 'B', lp: 8000 }], cards: [], prompt: null, turn: 1, turnPlayer: 0, phase: 'Main', log: [], spectating: true } }); await Promise.resolve();
    expect(f.root.querySelectorAll('button').some(b => b.textContent === 'Surrender')).toBe(false); findButton(f.root, 'Leave Duel').onclick?.({}); expect(f.commands.at(-1)).toEqual({ type: 'leaveDuel' }); f.mounted.dispose();
  });
  it('renders index zero as the deck top and preserves access to nonrendered pile actions', async () => {
    const f = fixture(); f.update({ scene: 'duel', duel: { players: [{ name: 'A', lp: 8000 }, { name: 'B', lp: 8000 }], cards: [{ id: 'top', name: 'Hidden', controller: 0, zone: 'deck', index: 0, faceUp: false }, { id: 'bottom', name: 'Hidden', controller: 0, zone: 'deck', index: 1, faceUp: false }], prompt: null, turn: 1, turnPlayer: 0, phase: 'Main', log: [], actions: [{ id: 'pile-action', cardId: 'bottom', label: 'Server pile action' }] } }); await Promise.resolve();
    const keys = f.root.querySelectorAll('button').map(n => n.dataset.key); expect(keys).toContain('field-card:top'); expect(keys).not.toContain('field-card:bottom');
    findButton(f.root, 'Server pile action').onclick?.({}); expect(f.commands.at(-1)).toEqual({ type: 'duelAction', actionId: 'pile-action' }); f.mounted.dispose();
  });
  it('updates walking avatars in place and keyboard navigation reads the latest position', async () => {
    const f = fixture(), lobby: NonNullable<ClientView['lobby']> = { name: 'Academy', width: 1024, height: 768, avatars: [{ id: 1, name: 'A', x: 100, y: 100, self: true }], chat: [], channels: ['global'], connected: true };
    f.update({ scene: 'lobby', player: { id: 1, name: 'A' }, lobby }); await Promise.resolve(); const avatar = f.root.querySelectorAll('button').find(n => n.dataset.key === 'avatar:1')!, canvas = f.root.querySelectorAll('canvas')[0];
    f.update({ lobby: { ...lobby, avatars: [{ ...lobby.avatars[0], x: 200, y: 200 }] } }); await Promise.resolve();
    expect(f.root.querySelectorAll('button').find(n => n.dataset.key === 'avatar:1')).toBe(avatar); expect(avatar.style.left).toBe(`${200 / 1024 * 100}%`);
    canvas.onkeydown?.({ key: 'ArrowRight', preventDefault() {} }); expect(f.commands.at(-1)).toEqual({ type: 'move', x: 232, y: 200 }); f.mounted.dispose();
  });
  it('updates animation transforms and LP in place without replacing field nodes', async () => {
    const f = fixture(), card = { id: 'c1', name: 'Card', controller: 0 as const, zone: 'monster' as const, index: 0, faceUp: true };
    const duel: NonNullable<ClientView['duel']> = { players: [{ name: 'A', lp: 8000 }, { name: 'B', lp: 8000 }], cards: [card], prompt: null, turn: 1, turnPlayer: 0, phase: 'Main', log: [] };
    f.update({ scene: 'duel', duel }); await Promise.resolve(); const node = f.root.querySelectorAll('button').find(n => n.dataset.key === 'field-card:c1')!;
    f.update({ duel: { ...duel, players: [{ name: 'A', lp: 7500 }, { name: 'B', lp: 8000 }], cards: [{ ...card, motion: { x: 512, y: 384, rotation: 45, scaleX: 0.5 } }] } }); await Promise.resolve();
    expect(f.root.querySelectorAll('button').find(n => n.dataset.key === 'field-card:c1')).toBe(node);
    expect(node.style.left).toBe('50%'); expect(node.style.top).toBe('50%'); expect(node.style.transform).toContain('rotate(45deg) scaleX(0.5)'); expect(f.root.textContent).toContain('LP7,500'); f.mounted.dispose();
  });
  it('preserves open game-menu disclosures and nonfocused form drafts across updates', async () => {
    const f = fixture(); f.update({ scene: 'lobby', player: { id: 1, name: 'A' }, lobby: { name: 'Academy', avatars: [], chat: [], channels: ['global'], connected: true, rooms: [] } }); await Promise.resolve();
    const rooms = f.root.querySelectorAll('details').find(n => n.dataset.key === 'lobby-duel-rooms')!; rooms.open = true;
    f.update({ status: 'Another player arrived' }); await Promise.resolve(); expect(f.root.querySelectorAll('details').find(n => n.dataset.key === 'lobby-duel-rooms')?.open).toBe(true);
    f.update({ scene: 'characters', characters: [] }); await Promise.resolve(); const name = f.root.querySelectorAll('input').find(n => n.dataset.key === 'character-name')!; name.value = 'Draft';
    f.update({ status: 'Character list refreshed' }); await Promise.resolve(); expect(f.root.querySelectorAll('input').find(n => n.dataset.key === 'character-name')?.value).toBe('Draft'); f.mounted.dispose();
  });
  it('routes registration without retaining the submitted password through a rerender', async () => {
    const f = fixture(); f.update({ accountDetail: { panel: 'register', busy: false, status: 'Account', error: null, errorCode: null, session: null, verification: null, inviteUrl: null, redirectUrl: null, claimedAccount: null } }); await Promise.resolve();
    const account = f.root.querySelectorAll('section').find(n => n.getAttribute('aria-label') === 'Account')!;
    const name = account.querySelectorAll('input').find(n => n.name === 'username')!, password = account.querySelectorAll('input').find(n => n.type === 'password')!;
    name.value = 'Duelist'; password.value = 'private-registration-password';
    password.parentNode!.parentNode!.onsubmit?.({ preventDefault() {} });
    expect(f.commands.at(-1)).toEqual({ type: 'accountAction', action: { type: 'register', username: 'Duelist', password: 'private-registration-password' } }); expect(password.value).toBe('');
    f.update({ status: 'Waiting for account confirmation' }); await Promise.resolve(); expect(f.root.querySelectorAll('section').find(n => n.getAttribute('aria-label') === 'Account')!.querySelectorAll('input').find(n => n.type === 'password')?.value).toBe(''); expect(f.root.textContent).not.toContain('private-registration-password'); f.mounted.dispose();
  });
  it('starts, stops and downloads only explicitly requested gameplay recordings', async () => {
    const f = fixture(), capture: NonNullable<ClientView['capture']> = { state: 'idle', recording: false, records: 0, payloadBytes: 0, jsonBytes: 26, partial: false, initializedDuels: 0, gateEligible: false, reason: null };
    f.update({ scene: 'settings', capture }); await Promise.resolve(); findButton(f.root, 'Start Recording').onclick?.({}); expect(f.commands).toEqual([{ type: 'captureStart' }]); expect(f.root.textContent).toContain('idle');
    f.update({ capture: { ...capture, state: 'recording', recording: true, records: 3, payloadBytes: 100, jsonBytes: 200 } }); await Promise.resolve(); expect(findButton(f.root, 'Download Recording').disabled).toBe(true); findButton(f.root, 'Stop Recording').onclick?.({});
    f.update({ capture: { ...capture, state: 'stopped', records: 3, payloadBytes: 100, jsonBytes: 200 } }); await Promise.resolve(); findButton(f.root, 'Download Recording').onclick?.({});
    expect(f.commands).toEqual([{ type: 'captureStart' }, { type: 'captureStop' }, { type: 'captureDownload' }]); f.mounted.dispose();
  });
  it('leases a repeated card image once and releases it when the scene leaves', async () => {
    const release = vi.fn(), loader = vi.fn(async () => ({ url: 'blob:https://game.test/card1', release })); const f = fixture(loader);
    f.update({ scene: 'deck', deckEditor: { decks: [], current: { name: 'Deck', main: [1], side: [], extra: [] }, collection: [{ id: '1', passcode: 1, name: 'Card One', owned: 3 }] } }); await Promise.resolve(); await Promise.resolve();
    expect(loader).toHaveBeenCalledTimes(1); f.update({ scene: 'settings' }); await Promise.resolve();
    expect(release).toHaveBeenCalledTimes(1); f.mounted.dispose(); expect(release).toHaveBeenCalledTimes(1);
  });
  it('aborts removed pending artwork and releases a late lease instead of retaining it', async () => {
    let resolve!: (lease: { url: string; release(): void }) => void; let signal: AbortSignal | undefined;
    const loader = vi.fn((_code: number, passed: AbortSignal) => { signal = passed; return new Promise<{ url: string; release(): void }>(r => { resolve = r; }); }); const release = vi.fn(), f = fixture(loader);
    f.update({ scene: 'deck', deckEditor: { decks: [], current: null, collection: [{ id: '1', passcode: 1, name: 'Card One', owned: 1 }] } }); await Promise.resolve(); f.update({ scene: 'title' }); await Promise.resolve();
    expect(signal?.aborted).toBe(true); resolve({ url: 'blob:https://game.test/card1', release }); await Promise.resolve(); expect(release).toHaveBeenCalledTimes(1); f.mounted.dispose();
  });
  it('unpins failed decoded artwork without retrying it on every rerender', async () => {
    const release = vi.fn(), loader = vi.fn(async () => ({ url: 'blob:https://game.test/card1', release })), f = fixture(loader);
    const deckEditor: NonNullable<ClientView['deckEditor']> = { decks: [], current: null, collection: [{ id: '1', passcode: 1, name: 'Card One', owned: 1 }] };
    f.update({ scene: 'deck', deckEditor }); await Promise.resolve(); await Promise.resolve(); const image = f.root.querySelectorAll('img')[0]; image.onerror?.();
    expect(release).toHaveBeenCalledOnce(); expect((image as unknown as { src: string }).src).toBe(''); expect(image.parentNode).toBeNull();
    f.update({ status: 'Updated' }); await Promise.resolve(); expect(loader).toHaveBeenCalledOnce(); f.mounted.dispose(); expect(release).toHaveBeenCalledOnce();
  });
  it('clears detached image sources on same-card rerenders while retaining a shared lease', async () => {
    const release = vi.fn(), loader = vi.fn(async () => ({ url: 'blob:https://game.test/card1', release })), f = fixture(loader);
    f.update({ scene: 'deck', deckEditor: { decks: [], current: null, collection: [{ id: '1', passcode: 1, name: 'Card One', owned: 1 }] } }); await Promise.resolve(); await Promise.resolve(); const image = f.root.querySelectorAll('img')[0];
    f.update({ status: 'Updated' }); await Promise.resolve(); expect((image as unknown as { src: string }).src).toBe(''); expect(image.onerror).toBeNull(); expect(release).not.toHaveBeenCalled(); expect(loader).toHaveBeenCalledOnce();
    f.mounted.dispose(); expect(release).toHaveBeenCalledOnce();
  });
  it('tracks a selected deck card after authoritative reordering', async () => {
    const f = fixture(), deckEditor: NonNullable<ClientView['deckEditor']> = { decks: [], current: { name: 'Deck', main: [1, 2], side: [], extra: [] }, collection: [{ id: '1', passcode: 1, name: 'One', owned: 1 }, { id: '2', passcode: 2, name: 'Two', owned: 1 }] };
    f.update({ scene: 'deck', deckEditor }); await Promise.resolve(); f.root.querySelectorAll('button').find(n => n.dataset.key === 'deck-card:main:1')!.onclick?.({}); await Promise.resolve();
    findButton(f.root, 'Move earlier').onclick?.({}); expect(f.commands.at(-1)).toEqual({ type: 'deckReorder', zone: 'main', fromIndex: 1, toIndex: 0 });
    f.update({ deckEditor: { ...deckEditor, current: { ...deckEditor.current!, main: [2, 1] } } }); await Promise.resolve(); findButton(f.root, 'Remove selected card').onclick?.({});
    expect(f.commands.at(-1)).toEqual({ type: 'deckCard', passcode: 2, from: 'main', to: 'collection', index: 0 }); f.mounted.dispose();
  });
  it('opens player profiles through semantic commands and renders authoritative identity', async () => {
    const f = fixture(), profileDetail: NonNullable<ClientView['profileDetail']> = { selfPid: 1, selectedPid: null, details: null, location: null, summary: null, comments: [null, null], drafts: { playerId: '', comment: '', title: '' }, loading: false, pending: null, status: 'Choose a player.', error: null };
    f.update({ scene: 'lobby', player: { id: 1, name: 'A' }, lobby: { name: 'Academy', avatars: [], channels: [], chat: [], connected: true }, profileDetail }); await Promise.resolve();
    findButton(f.root, 'My Profile').onclick?.({}); expect(f.commands).toEqual([{ type: 'profileAction', action: { type: 'open', pid: 1 } }]); expect(f.root.textContent).not.toContain('Player id: 1');
    f.update({ profileDetail: { ...profileDetail, selectedPid: 1, comments: ['Received comment', null] } }); await Promise.resolve(); expect(f.root.textContent).toContain('Player id: 1'); expect(f.root.textContent).toContain('Received comment'); f.mounted.dispose();
  });
  it('retries missing game data explicitly without pretending it loaded', async () => {
    const f = fixture(); f.update({ scene: 'settings', dataStatus: { loading: false, issues: ['Maps', 'Card names'] } }); await Promise.resolve();
    findButton(f.root, 'Retry loading game data').onclick?.({}); expect(f.commands).toEqual([{ type: 'reloadData' }]); expect(f.root.textContent).toContain('Maps'); expect(f.root.textContent).toContain('Some game data is unavailable.');
    f.update({ dataStatus: { loading: true, issues: ['Maps'] } }); await Promise.resolve(); expect(findButton(f.root, 'Loading Game Data…').disabled).toBe(true); f.mounted.dispose();
  });
  it('reflects actual fullscreen entry and Escape in Options without game commands', async () => {
    const listeners = new Map<string, () => void>(); let current: TestNode | null = null;
    const f = fixture(undefined, document => {
      Object.defineProperty(document, 'fullscreenElement', { get: () => current });
      Object.assign(document, { fullscreenEnabled: true, exitFullscreen: async () => { current = null; listeners.get('fullscreenchange')?.(); }, addEventListener: (name: string, fn: () => void) => listeners.set(name, fn), removeEventListener: (name: string) => listeners.delete(name) });
      const create = document.createElement.bind(document); document.createElement = tag => { const node = create(tag); Object.assign(node, { requestFullscreen: async () => { current = node; listeners.get('fullscreenchange')?.(); } }); return node; };
    });
    expect(current).toBeNull(); f.update({ scene: 'settings' }); await Promise.resolve(); const enter = findButton(f.root, 'Enter Fullscreen'); enter.focus(); enter.onclick?.({}); for (let i = 0; i < 6; i++) await Promise.resolve();
    expect(current).toBe(f.root.childNodes[0]); const exit = findButton(f.root, 'Exit Fullscreen'); expect(f.document.activeElement).toBe(exit); expect(exit.getAttribute('aria-pressed')).toBe('true'); expect(f.commands).toEqual([]);
    current = null; listeners.get('fullscreenchange')?.(); await Promise.resolve(); expect(findButton(f.root, 'Enter Fullscreen').getAttribute('aria-pressed')).toBe('false');
    f.mounted.dispose(); expect(listeners.size).toBe(0);
  });
  it('renders user messages as text nodes rather than markup', async () => {
    const f = fixture(); f.update({ scene: 'lobby', lobby: { name: 'Academy', avatars: [], connected: true, channels: ['global'], chat: [{ id: '1', sender: '<script>', text: '<img src=x onerror=alert(1)>', channel: 'global' }] } }); await Promise.resolve();
    expect(f.root.textContent).toContain('<img src=x onerror=alert(1)>');
    expect(f.root.querySelectorAll('script')).toHaveLength(0); expect(f.root.querySelectorAll('img')).toHaveLength(0); f.mounted.dispose();
  });
});
