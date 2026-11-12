import { afterEach, describe, expect, it, vi } from 'vitest';
import { mountClient } from '../src/ui';
import { sideboardDifference } from '../src/ui/deck';
import type { ClientCommand, ClientView } from '../src/ui/contracts';
import { findButton, TestDocument } from './ui-dom-fixture';

const cleanups: (() => void)[] = [];
afterEach(() => { for (const cleanup of cleanups.splice(0)) cleanup(); vi.clearAllTimers(); vi.useRealTimers(); vi.unstubAllGlobals(); });
function fixture() {
  const document = new TestDocument(); vi.stubGlobal('document', document); vi.stubGlobal('window', { confirm: () => true });
  const original = { name: 'Match Deck', main: [1, 2], side: [3], extra: [4] };
  let state: ClientView = { scene: 'duel', connection: 'online', status: 'sideboarding', player: { id: 1, name: 'A' }, characters: [], lobby: null, deckEditor: { decks: [], current: null, collection: [1, 2, 3, 4].map(passcode => ({ id: String(passcode), passcode, name: `Card ${passcode}`, description: `Effect ${passcode}`, owned: 1, extra: passcode === 4 })) }, shop: null, duel: null, social: null, settings: { sound: 1, music: 1, reducedMotion: false, showCardNames: true }, sideboarding: { deck: structuredClone(original), original, round: 2, scores: [1, 0, 0], ready: false }, match: { round: 2, scores: [1, 0, 0], complete: false } };
  const commands: ClientCommand[] = [], listeners = new Set<(view: ClientView) => void>(), root = document.createElement('div');
  const mounted = mountClient(root as unknown as HTMLElement, { getState: () => state, subscribe: fn => { listeners.add(fn); return () => { listeners.delete(fn); }; }, dispatch: command => { commands.push(command); } });
  cleanups.push(() => mounted.dispose());
  const update = (patch: Partial<ClientView>) => { state = { ...state, ...patch }; for (const listener of listeners) listener(state); };
  return { root, commands, original, update, mounted, get state() { return state; }, dispose: () => mounted.dispose() };
}
describe('MATCH sideboarding and relay UI', () => {
  // live's Card Swap (htmlui/side-swap.ts): the deck screen's windows, a card moved main <-> side, EXIT takes the deck on
  const windows = (f: ReturnType<typeof fixture>) => f.mounted.htmlUi.windows().map(w => w.win.cls);
  it('shows live\'s Card Swap windows: the menu, the card detail, the Deck window cut to the chat, the clock', async () => {
    const f = fixture(); await Promise.resolve();
    expect(windows(f)).toEqual(expect.arrayContaining(['CCardSwapMenu', 'CCardDetailViewDlg', 'CWindowModelDeck', 'CJankenTimer']));
    expect(windows(f)).not.toContain('CWindowModelKaban');
    const deck = f.mounted.htmlUi.windows().find(w => w.win.cls === 'CWindowModelDeck')!.win;
    // the side band at y 480, the side cards from 520 (the editor's at 584 / 624)
    expect(deck.controls.filter(c => c.cls === 'CWindowTaskDeckCard' && c.zone === 'side').map(c => c.wy)).toEqual([520]);
    expect(f.root.querySelectorAll('button').some(b => ['Submit Sideboard', 'Main → Side', 'Swap Selected Cards'].includes(b.textContent ?? ''))).toBe(false);
  });
  it('EXIT takes the deck on only with the original counts; a refusal is the deck screen\'s OK dialog', async () => {
    const f = fixture(); f.update({ sideboarding: { ...f.state.sideboarding!, deck: { ...f.original, main: [1], side: [3, 2] } } }); await Promise.resolve();
    expect(f.mounted.htmlUi.press('swap-exit')).toBe(true); await Promise.resolve();
    expect(f.commands).toEqual([]); expect(f.mounted.htmlUi.text()).toContain('Restore the original Main, Side and Fusion counts');
    expect(sideboardDifference({ ...f.original, main: [1, 99] }, f.original)).toContain('original');
    expect(sideboardDifference({ ...f.original, extra: [99] }, f.original)).toContain('Fusion');
    f.update({ sideboarding: { ...f.state.sideboarding!, deck: { ...f.original, main: [3, 2], side: [1] } } }); await Promise.resolve();
    expect(f.mounted.htmlUi.press('swap-notice-ok')).toBe(true); expect(f.mounted.htmlUi.press('swap-exit')).toBe(true);
    expect(f.commands).toEqual([{ type: 'submitSideboard' }]);
    f.update({ sideboarding: { ...f.state.sideboarding!, ready: true } }); await Promise.resolve();
    expect(f.mounted.htmlUi.text()).toContain('Waiting for your opponent');
  });
  it('counts the side deck clock down on its plate and releases the timer on disposal', async () => {
    vi.useFakeTimers(); vi.setSystemTime(1_000_000); const f = fixture(); f.update({ sideboarding: { ...f.state.sideboarding!, deadline: Date.now() + 5000 } }); await Promise.resolve();
    const clock = () => f.mounted.htmlUi.windows().find(w => w.win.cls === 'CJankenTimer')!.win.time;
    expect(clock()).toBe('00:05'); vi.advanceTimersByTime(1000); await Promise.resolve(); expect(clock()).toBe('00:04'); f.dispose(); expect(vi.getTimerCount()).toBe(0);
  });
  it('shows relay pilot roles, blocks stale partner actions and never offers partner RPS', async () => {
    const f = fixture(); f.update({ sideboarding: undefined, match: undefined, relay: { active: [1, 0], self: 0, canAct: false, players: [{ pid: 1, name: 'Captain' }, { pid: 2, name: 'Partner' }, { pid: 3, name: 'Opponent' }, { pid: 4, name: 'Their Partner' }] }, preparation: { phase: 'rock-paper-scissors', role: 'partner' }, duel: { players: [{ name: 'A', lp: 8000 }, { name: 'B', lp: 8000 }], cards: [], prompt: { id: 'old', kind: 'yes-no', text: 'Old choice', options: [{ id: 'yes', label: 'Yes' }] }, actions: [{ id: 'attack', label: 'Attack' }], turn: 1, turnPlayer: 0, phase: 'Main', log: [] } }); await Promise.resolve();
    expect(f.root.textContent).toContain('Partner playing'); expect(f.root.querySelectorAll('button').some(b => b.textContent === 'Rock')).toBe(false); expect(f.root.textContent).toContain('captain is preparing');
    // the question (main's duel dialog) on the partner's screen sends nothing
    f.update({ preparation: undefined }); await Promise.resolve();
    expect(f.mounted.htmlUi.press('prompt-option:old:yes')).toBe(true); expect(f.commands).toEqual([]);
  });
  it('allows readonly pile inspection without selecting or revealing a hidden card', async () => {
    const f = fixture(); f.update({ sideboarding: undefined, match: undefined, duel: { players: [{ name: 'A', lp: 8000 }, { name: 'B', lp: 8000 }], cards: [], prompt: { id: 'inspect', kind: 'cards', text: 'Graveyard', options: [], readOnly: true, min: 0, max: 0, candidates: [{ id: '0', label: 'Visible', disabled: true, card: { id: '1', name: 'Visible', description: 'Visible effect' } }, { id: '1', label: 'Hidden card', disabled: true }] }, turn: 1, turnPlayer: 0, phase: 'Main', log: [] } }); await Promise.resolve();
    // main's card list dialog: a readable row shows its card in the duel's card information box, a hidden one is off
    const row = (key: string) => f.mounted.htmlUi.windows().flatMap(w => w.win.controls.filter(c => w.handlers.get(c.id)?.key === key))[0];
    expect(row('prompt-candidate:inspect:0')?.enabled).toBe(true); expect(f.mounted.htmlUi.press('prompt-candidate:inspect:0')).toBe(true); expect(f.root.textContent).toContain('Visible effect'); expect(f.commands).toEqual([]);
    expect(row('prompt-candidate:inspect:1')?.enabled).toBe(false); expect(f.mounted.htmlUi.press('prompt-confirm:inspect')).toBe(true); expect(f.commands).toEqual([{ type: 'duelRespond', promptId: 'inspect', response: { cardIds: [] } }]);
  });
});
