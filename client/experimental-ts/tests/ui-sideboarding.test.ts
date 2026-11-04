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
  return { root, commands, original, update, get state() { return state; }, dispose: () => mounted.dispose() };
}
describe('MATCH sideboarding and relay UI', () => {
  it('offers an atomic swap even when both saved sections are full', async () => {
    const f = fixture(); const full = { name: 'Match Deck', main: Array<number>(80).fill(1), side: Array<number>(15).fill(3), extra: [4] }; f.update({ sideboarding: { ...f.state.sideboarding!, deck: structuredClone(full), original: full } }); await Promise.resolve();
    const main = f.root.querySelectorAll('button').find(b => b.dataset.key === 'sideboard:2:main:0')!, side = f.root.querySelectorAll('button').find(b => b.dataset.key === 'sideboard:2:side:0')!;
    main.onclick?.({}); await Promise.resolve(); side.onclick?.({}); await Promise.resolve(); findButton(f.root, 'Swap Selected Cards').onclick?.({});
    expect(f.commands).toEqual([{ type: 'sideboardSwap', mainIndex: 0, sideIndex: 0 }]);
    expect(f.root.querySelectorAll('button').some(b => b.textContent === 'Return to Lobby')).toBe(false);
    expect(f.root.textContent).toContain('Fusion Deck · 1/1');
  });
  it('refuses section-size and card-pool changes without asserting server readiness', async () => {
    const f = fixture(); f.update({ sideboarding: { ...f.state.sideboarding!, deck: { ...f.original, main: [1], side: [3, 2] } } }); await Promise.resolve();
    expect(findButton(f.root, 'Submit Sideboard').disabled).toBe(true);
    expect(sideboardDifference({ ...f.original, main: [1, 99] }, f.original)).toContain('original');
    expect(sideboardDifference({ ...f.original, extra: [99] }, f.original)).toContain('Fusion');
    expect(sideboardDifference({ ...f.original, main: [3, 2], side: [1] }, f.original)).toBeNull();
    f.update({ sideboarding: { ...f.state.sideboarding!, deck: { ...f.original, main: [3, 2], side: [1] } } }); await Promise.resolve(); findButton(f.root, 'Submit Sideboard').onclick?.({});
    expect(f.commands).toEqual([{ type: 'submitSideboard' }]); expect(f.root.textContent).not.toContain('Deck Submitted');
  });
  it('counts down an epoch-ms server deadline and releases the timer on disposal', async () => {
    vi.useFakeTimers(); vi.setSystemTime(1_000_000); const f = fixture(); f.update({ sideboarding: { ...f.state.sideboarding!, deadline: Date.now() + 5000 } }); await Promise.resolve();
    expect(f.root.textContent).toContain('0:05'); vi.advanceTimersByTime(1000); await Promise.resolve(); expect(f.root.textContent).toContain('0:04'); f.dispose(); expect(vi.getTimerCount()).toBe(0);
  });
  it('shows relay pilot roles, blocks stale partner actions and never offers partner RPS', async () => {
    const f = fixture(); f.update({ sideboarding: undefined, match: undefined, relay: { active: [1, 0], self: 0, canAct: false, players: [{ pid: 1, name: 'Captain' }, { pid: 2, name: 'Partner' }, { pid: 3, name: 'Opponent' }, { pid: 4, name: 'Their Partner' }] }, preparation: { phase: 'rock-paper-scissors', role: 'partner' }, duel: { players: [{ name: 'A', lp: 8000 }, { name: 'B', lp: 8000 }], cards: [], prompt: { id: 'old', kind: 'yes-no', text: 'Old choice', options: [{ id: 'yes', label: 'Yes' }] }, actions: [{ id: 'attack', label: 'Attack' }], turn: 1, turnPlayer: 0, phase: 'Main', log: [] } }); await Promise.resolve();
    expect(f.root.textContent).toContain('Partner playing'); expect(f.root.querySelectorAll('button').some(b => b.textContent === 'Rock')).toBe(false); findButton(f.root, 'Yes').onclick?.({}); expect(f.commands).toEqual([]); expect(f.root.textContent).toContain('captain is preparing');
  });
  it('allows readonly pile inspection without selecting or revealing a hidden card', async () => {
    const f = fixture(); f.update({ sideboarding: undefined, match: undefined, duel: { players: [{ name: 'A', lp: 8000 }, { name: 'B', lp: 8000 }], cards: [], prompt: { id: 'inspect', kind: 'cards', text: 'Graveyard', options: [], readOnly: true, min: 0, max: 0, candidates: [{ id: '0', label: 'Visible', disabled: true, card: { id: '1', name: 'Visible', description: 'Visible effect' } }, { id: '1', label: 'Hidden card', disabled: true }] }, turn: 1, turnPlayer: 0, phase: 'Main', log: [] } }); await Promise.resolve();
    const preview = f.root.querySelectorAll('button').find(b => b.dataset.key === 'prompt-candidate:inspect:0')!; expect(preview.disabled).toBe(false); preview.onclick?.({}); await Promise.resolve(); expect(f.root.textContent).toContain('Visible effect'); expect(f.commands).toEqual([]);
    const hidden = f.root.querySelectorAll('button').find(b => b.dataset.key === 'prompt-candidate:inspect:1')!; expect(hidden.disabled).toBe(true); findButton(f.root, 'Close Card List').onclick?.({}); expect(f.commands).toEqual([{ type: 'duelRespond', promptId: 'inspect', response: { cardIds: [] } }]);
  });
});
