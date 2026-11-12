import { afterEach, describe, expect, it, vi } from 'vitest';
import { mountClient } from '../src/ui';
import type { ClientCommand, ClientController, ClientView } from '../src/ui/contracts';
import { findButton, TestDocument, TestNode } from './ui-dom-fixture';

function fixture(loadCardImage?: ClientController['loadCardImage'], configureDocument?: (document: TestDocument) => void) {
  const document = new TestDocument();
  configureDocument?.(document);
  vi.stubGlobal('document', document); vi.stubGlobal('window', { confirm: () => true });
  const root = document.createElement('div'); document.connected = new Set([root]);
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
// main's HTML lobby windows (src/ui/htmlui/lobby.ts, windows.ts) by their controls' data-keys
const control = (f: { mounted: { htmlUi: { windows(): import('../src/ui/htmlui/snapshot').WindowSpec[] } } }, key: string) => {
  for (const spec of f.mounted.htmlUi.windows()) for (const [id, h] of spec.handlers) if (h.key === key) return spec.win.controls.find(c => c.id === id);
  return undefined;
};

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
  // main's Duel menu (menu bar Duel) -> Auto Duel (CWindowModelDuelFind): Both, a similar level, OK
  it('starts matchmaking with exact preferences and updates queue controls authoritatively', async () => {
    const f = fixture(), matchmaking: NonNullable<ClientView['matchmaking']> = { status: 'idle', style: 3, similarLevel: false, opponent: null, counts: { single: 2, match: 1, either: 3 }, matchSupported: false };
    f.update({ scene: 'lobby', connection: 'online', player: { id: 1, name: 'A' }, lobby: { name: 'Academy', avatars: [], channels: [], chat: [], connected: true }, matchmaking }); await Promise.resolve();
    expect(f.mounted.htmlUi.press('menubar-duel')).toBe(true); expect(f.mounted.htmlUi.text().split('\n')).toContain('6');   // the queue's searchers, all styles
    expect(f.mounted.htmlUi.press('duel-auto')).toBe(true); expect(f.mounted.htmlUi.press('find-both')).toBe(true); expect(f.mounted.htmlUi.press('find-similar-level')).toBe(true);
    f.update({ status: 'Unrelated world update' }); await Promise.resolve();
    expect(control(f, 'find-similar-level')?.checked).toBe(true); expect(control(f, 'find-any-level')?.checked).toBe(false); expect(control(f, 'find-both')?.checked).toBe(true);
    expect(f.mounted.htmlUi.press('find-ok')).toBe(true); expect(f.commands).toEqual([{ type: 'startMatchmaking', style: 6, similarLevel: true }]); expect(f.mounted.htmlUi.text()).not.toContain('Searching for an opponent');
    expect(control(f, 'find-ok')).toBeUndefined();
    f.update({ matchmaking: { ...matchmaking, status: 'searching' } }); await Promise.resolve(); expect(f.mounted.htmlUi.text()).toContain('Searching for an opponent');
    // the bar's Duel key while queued asks to cancel the search
    expect(f.mounted.htmlUi.press('menubar-duel')).toBe(true); expect(control(f, 'duel-auto')).toBeUndefined(); expect(f.mounted.htmlUi.press('room-close-yes')).toBe(true);
    expect(f.commands.at(-1)).toEqual({ type: 'cancelMatchmaking' }); f.mounted.dispose();
  });
  it('leaves a purchase receipt to main\'s HTML shop and Card Get (no rewrite receipt panel)', async () => {
    const release = vi.fn(), loader = vi.fn(async () => ({ url: 'blob:https://game.test/card1', release })), f = fixture(loader);
    f.update({ scene: 'shop', shop: { items: [], mp: 100, purchased: [{ id: '1', passcode: 1, name: 'Actual reward', description: 'A real effect' }], replayed: true } }); await Promise.resolve(); await Promise.resolve();
    // The receipt is main's Card Get (card-get.ts, from shop.opening) over the HTML shop, not the old receipt panel.
    expect(f.root.textContent).not.toContain('Acquired Cards'); f.update({ scene: 'title' }); await Promise.resolve(); expect(release.mock.calls.length).toBe(loader.mock.calls.length); f.mounted.dispose();
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
    expect(f.root.textContent).not.toContain('Secret Trap'); expect(f.mounted.htmlUi.text()).not.toContain('Secret Trap'); expect(f.mounted.htmlUi.press('duel-cmd:activate')).toBe(true);
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
  // Create Duel through the Duel menu; a room's challenge and a duel's watching through the player's card (CPlayerListMenu)
  it('routes duel-room invitations and spectator exit through semantic commands', async () => {
    const profileDetail: NonNullable<ClientView['profileDetail']> = { selfPid: 1, selectedPid: null, details: null, location: null, summary: null, comments: [null, null], drafts: { playerId: '', comment: '', title: '' }, loading: false, pending: null, status: '', error: null };
    const f = fixture(); f.update({ scene: 'lobby', connection: 'online', player: { id: 1, name: 'A' }, profileDetail, lobby: { name: 'Academy', avatars: [{ id: 2, name: 'B', x: 100, y: 100 }, { id: 3, name: 'C', x: 200, y: 100, duelling: true }], chat: [], channels: ['global'], connected: true, rooms: [{ id: 9, owner: 2, name: 'B room', state: 0 }, { id: 10, owner: 3, name: 'C room', state: 1, opponent: 4, watch: true }], invitation: { name: 'B', pid: 2 } } }); await Promise.resolve();
    expect(f.mounted.htmlUi.press('menubar-duel')).toBe(true); expect(f.mounted.htmlUi.press('duel-create')).toBe(true); expect(f.mounted.htmlUi.press('room-ok')).toBe(true);
    f.update({ profileDetail: { ...profileDetail, selectedPid: 2 } }); await Promise.resolve(); expect(control(f, 'card-watch')).toBeUndefined(); expect(f.mounted.htmlUi.press('card-duel')).toBe(true);
    f.update({ profileDetail: { ...profileDetail, selectedPid: 3 } }); await Promise.resolve(); expect(control(f, 'card-duel')).toBeUndefined(); expect(f.mounted.htmlUi.press('card-watch')).toBe(true);
    f.mounted.htmlUi.press('duel-accept'); f.mounted.htmlUi.press('duel-decline');
    const close = { type: 'profileAction', action: { type: 'close' } };
    expect(f.commands).toEqual([{ type: 'createDuelRoom', options: { style: 4, timeLimit: true, allowWatch: true, allowSurrender: true } }, close, { type: 'challengeRoom', roomId: 9 }, close, { type: 'spectate', pid: 3 }, { type: 'replyChallenge', accept: true }, { type: 'replyChallenge', accept: false }]);
    f.update({ scene: 'duel', duel: { players: [{ name: 'A', lp: 8000 }, { name: 'B', lp: 8000 }], cards: [], prompt: null, turn: 1, turnPlayer: 0, phase: 'Main', log: [], spectating: true } }); await Promise.resolve();
    // a spectator has no Surrender: the deck's command list (live's CUSummonDialogSp) leaves the duel
    f.root.querySelectorAll('button').find(n => n.dataset.key === 'field-deck:0')!.onclick?.({}); await Promise.resolve();
    expect(control(f, 'duel-surrender')).toBeUndefined(); expect(f.mounted.htmlUi.press('duel-leave')).toBe(true); expect(f.commands.at(-1)).toEqual({ type: 'leaveDuel' }); f.mounted.dispose();
  });
  it("shows the duel's information box as live's OK dialog until OK", async () => {
    const f = fixture(), duel: NonNullable<ClientView['duel']> = { players: [{ name: 'A', lp: 8000 }, { name: 'B', lp: 8000 }], cards: [], prompt: null, turn: 1, turnPlayer: 0, phase: 'Main', log: [], notice: { id: 1, text: 'You cannot surrender before the 10th turn.' } };
    f.update({ scene: 'duel', duel }); await Promise.resolve();
    const box = f.mounted.htmlUi.windows().find(s => s.win.cls === 'CUOkDialog');
    expect(box?.win.controls.find(c => c.cls === 'CWindowTaskTextField')?.text).toBe('You cannot surrender before the 10th turn.');
    expect(f.root.textContent).not.toContain('10th turn');   // no rewrite box on the stage
    expect(f.mounted.htmlUi.press('duel-notice-ok')).toBe(true); await Promise.resolve();
    expect(f.mounted.htmlUi.windows().some(s => s.win.cls === 'CUOkDialog')).toBe(false);
    f.update({ duel: { ...duel, notice: { id: 2, text: 'Time is up!' } } }); await Promise.resolve();
    expect(f.mounted.htmlUi.text()).toContain('Time is up!'); f.mounted.dispose();
  });
  it('renders index zero as the deck top and preserves access to nonrendered pile actions', async () => {
    const f = fixture(); f.update({ scene: 'duel', duel: { players: [{ name: 'A', lp: 8000 }, { name: 'B', lp: 8000 }], cards: [{ id: 'top', name: 'Hidden', controller: 0, zone: 'deck', index: 0, faceUp: false }, { id: 'bottom', name: 'Hidden', controller: 0, zone: 'deck', index: 1, faceUp: false }], prompt: null, turn: 1, turnPlayer: 0, phase: 'Main', log: [], actions: [{ id: 'pile-action', cardId: 'bottom', label: 'Server pile action' }] } }); await Promise.resolve();
    const keys = f.root.querySelectorAll('button').map(n => n.dataset.key); expect(keys).toContain('field-card:top'); expect(keys).not.toContain('field-card:bottom');
    // live's command list: the pile's top card opens it, the hidden card's action a row of it
    f.root.querySelectorAll('button').find(n => n.dataset.key === 'field-card:top')!.onclick?.({}); await Promise.resolve();
    expect(control(f, 'duel-cmd:pile-action')).toBeDefined(); expect(control(f, 'duel-surrender')).toBeDefined();
    expect(f.mounted.htmlUi.press('duel-cmd:pile-action')).toBe(true); expect(f.commands.at(-1)).toEqual({ type: 'duelAction', actionId: 'pile-action' }); f.mounted.dispose();
  });
  it('updates walking avatars in place and keyboard navigation reads the latest position', async () => {
    const f = fixture(), lobby: NonNullable<ClientView['lobby']> = { name: 'Academy', width: 1024, height: 768, avatars: [{ id: 1, name: 'A', x: 100, y: 100, self: true }], chat: [], channels: ['global'], connected: true };
    f.update({ scene: 'lobby', player: { id: 1, name: 'A' }, lobby }); await Promise.resolve(); const avatar = f.root.querySelectorAll('button').find(n => n.dataset.key === 'avatar:1')!, map = f.root.querySelectorAll('[data-key]').find(n => n.dataset.key === 'lobby-map')!;
    f.update({ lobby: { ...lobby, avatars: [{ ...lobby.avatars[0], x: 200, y: 200 }] } }); await Promise.resolve();
    expect(f.root.querySelectorAll('button').find(n => n.dataset.key === 'avatar:1')).toBe(avatar); expect(avatar.style.left).toBe(`${200 / 1024 * 100}%`);
    map.onkeydown?.({ key: 'ArrowRight', preventDefault() {} }); expect(f.commands.at(-1)).toEqual({ type: 'move', x: 232, y: 200 }); f.mounted.dispose();
  });
  it('updates animation transforms and LP in place without replacing field nodes', async () => {
    const f = fixture(), card = { id: 'c1', name: 'Card', controller: 0 as const, zone: 'monster' as const, index: 0, faceUp: true };
    const duel: NonNullable<ClientView['duel']> = { players: [{ name: 'A', lp: 8000 }, { name: 'B', lp: 8000 }], cards: [card], prompt: null, turn: 1, turnPlayer: 0, phase: 'Main', log: [] };
    f.update({ scene: 'duel', duel }); await Promise.resolve(); const node = f.root.querySelectorAll('button').find(n => n.dataset.key === 'field-card:c1')!;
    f.update({ duel: { ...duel, players: [{ name: 'A', lp: 7500 }, { name: 'B', lp: 8000 }], cards: [{ ...card, motion: { x: 512, y: 384, rotation: 45, scaleX: 0.5 } }] } }); await Promise.resolve();
    expect(f.root.querySelectorAll('button').find(n => n.dataset.key === 'field-card:c1')).toBe(node);
    expect(node.style.left).toBe('50%'); expect(node.style.top).toBe('50%'); expect(node.style.transform).toContain('rotate(45deg) scaleX(0.5)'); expect(f.root.textContent).toContain('LP7,500'); f.mounted.dispose();
  });
  // main's Duel menu and Main Menu stay open across unrelated updates
  it('preserves open game-menu disclosures and nonfocused form drafts across updates', async () => {
    const f = fixture(); f.update({ scene: 'lobby', connection: 'online', player: { id: 1, name: 'A' }, lobby: { name: 'Academy', avatars: [], chat: [], channels: ['global'], connected: true, rooms: [] } }); await Promise.resolve();
    expect(f.mounted.htmlUi.press('menubar-duel')).toBe(true); expect(f.mounted.htmlUi.press('main-menu')).toBe(true);
    f.update({ status: 'Another player arrived' }); await Promise.resolve(); expect(control(f, 'duel-create')).toBeDefined(); expect(control(f, 'menu:deck')).toBeDefined();
    // Select Player's name dialog (main's screens, src/ui/htmlui) keeps its draft across updates
    f.update({ scene: 'characters', characters: [] }); await Promise.resolve(); expect(f.mounted.htmlUi.press('character-create:0')).toBe(true); f.mounted.htmlUi.type('character-name', 'Draft');
    f.update({ status: 'Character list refreshed' }); await Promise.resolve();
    expect(f.mounted.htmlUi.windows().flatMap(w => w.win.controls).find(c => c.cls === 'CWindowTaskInput')?.value).toBe('Draft'); f.mounted.dispose();
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
  // the deck editor's card faces are main's deck screen's (htmlui/deck-dom.ts): <img> elements over its holes, art leased
  // per card and let go a few frames after its last picture leaves the page
  const deckImages = (f: ReturnType<typeof fixture>) => ((f.mounted.htmlUi.deck() as unknown as TestNode | null)?.querySelectorAll('img') ?? []).filter(i => (i as unknown as { src: string }).src);
  const frames = async (f: ReturnType<typeof fixture>, n = 4) => { for (let i = 0; i < n; i++) { f.update({ status: `Frame ${i}` }); await Promise.resolve(); } };
  it('leases a repeated card image once and releases it when the scene leaves', async () => {
    const release = vi.fn(), loader = vi.fn(async () => ({ url: 'blob:https://game.test/card1', release })); const f = fixture(loader);
    f.update({ scene: 'deck', deckEditor: { decks: [], current: { name: 'Deck', main: [1], side: [], extra: [] }, collection: [{ id: '1', passcode: 1, name: 'Card One', owned: 3 }] } }); await Promise.resolve(); await Promise.resolve(); await frames(f, 1);
    // the Main grid's card and the trunk's row are two pictures of the one lease
    expect(deckImages(f).length).toBeGreaterThanOrEqual(2); expect(deckImages(f).every(i => (i as unknown as { src: string }).src === 'blob:https://game.test/card1')).toBe(true);
    expect(loader).toHaveBeenCalledTimes(1); expect(release).not.toHaveBeenCalled(); f.update({ scene: 'settings' }); await Promise.resolve(); await frames(f);
    expect(release).toHaveBeenCalledTimes(1); f.mounted.dispose(); expect(release).toHaveBeenCalledTimes(1);
  });
  it('aborts removed pending artwork and releases a late lease instead of retaining it', async () => {
    let resolve!: (lease: { url: string; release(): void }) => void; let signal: AbortSignal | undefined;
    const loader = vi.fn((_code: number, passed: AbortSignal) => { signal = passed; return new Promise<{ url: string; release(): void }>(r => { resolve = r; }); }); const release = vi.fn(), f = fixture(loader);
    f.update({ scene: 'deck', deckEditor: { decks: [], current: null, collection: [{ id: '1', passcode: 1, name: 'Card One', owned: 1 }] } }); await Promise.resolve();
    expect(loader).toHaveBeenCalledOnce(); expect(signal?.aborted).toBe(false); f.update({ scene: 'title' }); await Promise.resolve(); await frames(f);
    expect(signal?.aborted).toBe(true); resolve({ url: 'blob:https://game.test/card1', release }); await Promise.resolve(); await Promise.resolve(); expect(release).toHaveBeenCalledTimes(1);
    f.mounted.dispose(); expect(release).toHaveBeenCalledTimes(1);
  });
  it('unpins failed decoded artwork without retrying it on every rerender', async () => {
    const release = vi.fn(), loader = vi.fn(async () => ({ url: 'blob:https://game.test/card1', release })), f = fixture(loader);
    const deckEditor: NonNullable<ClientView['deckEditor']> = { decks: [], current: null, collection: [{ id: '1', passcode: 1, name: 'Card One', owned: 1 }] };
    f.update({ scene: 'deck', deckEditor }); await Promise.resolve(); await Promise.resolve(); await frames(f, 1); const image = deckImages(f)[0]!; image.onerror?.();
    expect(release).toHaveBeenCalledOnce(); expect((image as unknown as { src: string }).src).toBe(''); expect(image.style.visibility).toBe('hidden'); expect(deckImages(f)).toHaveLength(0);
    await frames(f); expect(loader).toHaveBeenCalledOnce(); expect(deckImages(f)).toHaveLength(0); f.mounted.dispose(); expect(release).toHaveBeenCalledOnce();
  });
  it('clears detached image sources on same-card rerenders while retaining a shared lease', async () => {
    const release = vi.fn(), loader = vi.fn(async () => ({ url: 'blob:https://game.test/card1', release })), f = fixture(loader);
    const deckEditor: NonNullable<ClientView['deckEditor']> = { decks: [], current: { name: 'Deck', main: [1], side: [], extra: [] }, collection: [{ id: '1', passcode: 1, name: 'Card One', owned: 3 }] };
    f.update({ scene: 'deck', deckEditor }); await Promise.resolve(); await Promise.resolve(); await frames(f, 1);
    const image = deckImages(f).find(i => i.parentNode?.parentNode && (f.mounted.htmlUi.deck() as unknown as TestNode).querySelectorAll('*').some(n => n.dataset.zone === 'main' && n === i))!;
    expect(image).toBeDefined();
    // the same card again: the Main grid is drawn anew, its old picture leaves the page
    f.update({ deckEditor: { ...deckEditor, current: { ...deckEditor.current!, main: [1, 1] } } }); await Promise.resolve(); await frames(f, 1);
    expect(image.isConnected).toBe(false); expect((image as unknown as { src: string }).src).toBe(''); expect(image.onerror).toBeNull();
    expect(deckImages(f).length).toBeGreaterThanOrEqual(2); expect(release).not.toHaveBeenCalled(); expect(loader).toHaveBeenCalledOnce();
    f.mounted.dispose(); expect(release).toHaveBeenCalledOnce();
  });
  it('tracks a selected deck card after authoritative reordering', async () => {
    const f = fixture(), deckEditor: NonNullable<ClientView['deckEditor']> = { decks: [], current: { name: 'Deck', main: [1, 2], side: [], extra: [] }, collection: [{ id: '1', passcode: 1, name: 'One', owned: 1 }, { id: '2', passcode: 2, name: 'Two', owned: 1 }] };
    // main's deck screen (htmlui/deck-scene.ts): a drag inside the Main grid reorders, a drag onto the trunk removes
    // deck-dom.ts: each card an element (data-zone, data-index, data-passcode), each zone a drop target
    const all = () => (f.mounted.htmlUi.deck() as unknown as TestNode).querySelectorAll('*');
    const ev = (type: string) => ({ type, button: 0, clientX: 0, clientY: 0, preventDefault() {}, stopPropagation() {} }) as unknown as Event;
    const at = (index: number) => all().find(n => n.dataset.zone === 'main' && n.dataset.index === String(index) && n.dataset.passcode)!;
    const drag = (from: TestNode, to: TestNode) => { from.dispatchEvent(ev('mousedown')); to.dispatchEvent(ev('mouseup')); };
    f.update({ scene: 'deck', deckEditor }); await Promise.resolve();
    drag(at(1), at(0)); expect(f.commands.at(-1)).toEqual({ type: 'deckReorder', zone: 'main', fromIndex: 1, toIndex: 0 });
    f.update({ deckEditor: { ...deckEditor, current: { ...deckEditor.current!, main: [2, 1] } } }); await Promise.resolve(); drag(at(0), all().find(n => n.dataset.dropZone === 'trunk')!);
    expect(f.commands.at(-1)).toEqual({ type: 'deckCard', passcode: 2, from: 'main', to: 'collection', index: 0 }); f.mounted.dispose();
  });
  // My Profile is the Main Menu's entry (CMainMenu); the profile is main's window (CWindowModelProfile)
  it('opens player profiles through semantic commands and renders authoritative identity', async () => {
    const f = fixture(), profileDetail: NonNullable<ClientView['profileDetail']> = { selfPid: 1, selectedPid: null, details: null, location: null, summary: null, comments: [null, null], drafts: { playerId: '', comment: '', title: '' }, loading: false, pending: null, status: 'Choose a player.', error: null };
    f.update({ scene: 'lobby', connection: 'online', player: { id: 1, name: 'A' }, lobby: { name: 'Academy', avatars: [], channels: [], chat: [], connected: true }, profileDetail }); await Promise.resolve();
    expect(f.mounted.htmlUi.press('main-menu')).toBe(true); expect(f.mounted.htmlUi.press('menu:profile')).toBe(true);
    expect(f.commands).toEqual([{ type: 'profileAction', action: { type: 'open', pid: 1 } }]); expect(f.mounted.htmlUi.text()).not.toContain('My Profile');
    f.update({ profileDetail: { ...profileDetail, selectedPid: 1, comments: ['Received comment', null] } }); await Promise.resolve(); expect(f.mounted.htmlUi.text()).toContain('My Profile'); expect(f.mounted.htmlUi.text()).toContain('Received comment'); f.mounted.dispose();
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
    const f = fixture(); f.update({ scene: 'lobby', connection: 'online', lobby: { name: 'Academy', avatars: [], connected: true, channels: ['global'], chat: [{ id: '1', sender: '<script>', text: '<img src=x onerror=alert(1)>', channel: 'global' }] } }); await Promise.resolve();
    // the chat is main's (textContent rows, chat.js ownList); its log holds the line as text
    expect(f.mounted.htmlUi.text()).toContain('<script>:<img src=x onerror=alert(1)>');
    expect(f.root.querySelectorAll('script')).toHaveLength(0); expect(f.root.querySelectorAll('img')).toHaveLength(0); f.mounted.dispose();
  });
});
