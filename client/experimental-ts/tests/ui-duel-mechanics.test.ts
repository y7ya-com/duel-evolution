import { afterEach, describe, expect, it, vi } from 'vitest';
import { mountClient } from '../src/ui';
import type { ClientCommand, ClientController, ClientView } from '../src/ui/contracts';
import { findButton, TestDocument } from './ui-dom-fixture';

function fixture() {
  const document = new TestDocument();
  vi.stubGlobal('document', document); vi.stubGlobal('window', { confirm: () => true });
  const root = document.createElement('div');
  let state: ClientView = { scene: 'title', connection: 'offline', status: 'Offline', auth: { signedIn: false }, player: null, characters: [], lobby: null, deckEditor: null, shop: null, duel: null, social: null, settings: { sound: 1, music: 1, reducedMotion: false, showCardNames: true } };
  const commands: ClientCommand[] = [], listeners = new Set<(s: ClientView) => void>();
  const controller: ClientController = { getState: () => state, subscribe: fn => { listeners.add(fn); return () => { listeners.delete(fn); }; }, dispatch: command => { commands.push(command); } };
  const mounted = mountClient(root as unknown as HTMLElement, controller);
  const update = (patch: Partial<ClientView>) => { state = { ...state, ...patch }; for (const listener of listeners) listener(state); };
  return { root, commands, mounted, update };
}
afterEach(() => { vi.unstubAllGlobals(); });
const players = [{ name: 'A', lp: 8000 }, { name: 'B', lp: 8000 }] as const;

describe('duel board mechanics', () => {
  it("names the player's own set cards to them and never the opponent's", async () => {
    const f = fixture();
    f.update({ scene: 'duel', duel: { players, turn: 2, turnPlayer: 0, phase: 'Main', log: [], prompt: null, cards: [
      { id: 'mine', passcode: 46986414, name: 'Dark Magician', controller: 0, zone: 'monster', index: 2, faceUp: false, position: 'defense' },
      { id: 'theirs', name: 'Hidden card', controller: 1, zone: 'spell', index: 1, faceUp: false },
    ] } }); await Promise.resolve();
    const mine = f.root.querySelectorAll('button').find(b => b.dataset.key === 'field-card:mine')!, theirs = f.root.querySelectorAll('button').find(b => b.dataset.key === 'field-card:theirs')!;
    expect(mine.getAttribute('aria-label')).toBe('Dark Magician (set face-down), your monster, defense');
    expect(mine.dataset).toMatchObject({ side: 'your', zone: 'monster', index: '2', position: 'defense' });
    expect(theirs.getAttribute('aria-label')).toBe('Face-down card, opponent spell');
    expect(theirs.dataset).toMatchObject({ side: 'opponent', zone: 'spell', index: '1' });
    theirs.onclick?.({}); await Promise.resolve();
    expect(f.root.textContent).not.toContain('Card details');
    mine.onclick?.({}); await Promise.resolve();
    expect(f.root.textContent).toContain('Dark Magician'); expect(f.root.textContent).toContain('Set face-down');
    f.mounted.dispose();
  });
  it('binds server actions to the prompt they were rendered for', async () => {
    const f = fixture();
    f.update({ scene: 'duel', duel: { players, turn: 2, turnPlayer: 0, phase: 'Main', log: [], prompt: null, cards: [], actions: [{ id: 'phase:5', label: 'End Turn' }], actionsFor: '7' } }); await Promise.resolve();
    findButton(f.root, 'End Turn').onclick?.({});
    expect(f.commands).toEqual([{ type: 'duelAction', actionId: 'phase:5', promptId: '7' }]);
    f.mounted.dispose();
  });
  it('makes a single server-issued selection on a card (an attack target) a direct, highlighted control', async () => {
    const f = fixture();
    f.update({ scene: 'duel', duel: { players, turn: 3, turnPlayer: 0, phase: 'Battle', log: [], prompt: null, actionsFor: '12', cards: [
      { id: 'foe', passcode: 46986414, name: 'Dark Magician', controller: 1, zone: 'monster', index: 0, faceUp: true, position: 'attack' },
      { id: 'hidden', name: 'Hidden card', controller: 1, zone: 'monster', index: 1, faceUp: false, position: 'defense' },
    ], actions: [{ id: 'action:1:0:0:11', cardId: 'foe', label: 'Select: Dark Magician' }, { id: 'action:1:1:0:11', cardId: 'hidden', label: 'Select: opponent’s monster zone 2' }] } }); await Promise.resolve();
    const foe = f.root.querySelectorAll('button').find(b => b.dataset.key === 'field-card:foe')!, hidden = f.root.querySelectorAll('button').find(b => b.dataset.key === 'field-card:hidden')!;
    expect(foe.className).toContain('de-card-target'); expect(foe.getAttribute('aria-label')).toBe('Dark Magician, opponent monster, attack, Select: Dark Magician');
    expect(hidden.getAttribute('aria-label')).toBe('Face-down card, opponent monster, Select: opponent’s monster zone 2');
    hidden.onclick?.({});
    expect(f.commands).toEqual([{ type: 'duelAction', actionId: 'action:1:1:0:11', promptId: '12' }]);
    f.mounted.dispose();
  });
  it('marks prompt dialogs with their kind and identity', async () => {
    const f = fixture();
    f.update({ scene: 'duel', duel: { players, turn: 2, turnPlayer: 0, phase: 'Main', log: [], cards: [], prompt: { id: '9', kind: 'yes-no', text: 'Chain?', options: [{ id: 'answer:1', label: 'Yes' }, { id: 'answer:0', label: 'No' }] } } }); await Promise.resolve();
    const dialog = f.root.querySelectorAll('section').find(s => s.getAttribute('role') === 'dialog')!;
    expect(dialog.dataset).toMatchObject({ kind: 'yes-no', prompt: '9' });
    f.mounted.dispose();
  });
});
