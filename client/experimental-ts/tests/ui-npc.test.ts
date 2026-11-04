import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderNpcFeature } from '../src/ui/npc';
import { mountClient } from '../src/ui';
import type { NpcCommand } from '../src/ui/npc';
import type { NpcState } from '../src/features/npc';
import type { ClientCommand, ClientView } from '../src/ui/contracts';
import { findButton, TestDocument, TestNode } from './ui-dom-fixture';
afterEach(() => vi.unstubAllGlobals());
const base = (): NpcState => ({ stage: 'ask', npc: { id: 1, name: 'NPC A' }, dialogue: null, result: null, present: 0, packs: [], packStatus: 'idle', giftStatus: 'idle', cards: [], giftCards: [], giftBits: [], firstContactStatus: 'idle', settlementReceived: false, refreshPending: false, error: null, eligibility: { status: 'idle', refreshing: false, bits: [], cards: [] } });
function panel(state: NpcState) { vi.stubGlobal('document', new TestDocument()); const commands: NpcCommand[] = [], root = renderNpcFeature(state, command => commands.push(command)) as unknown as TestNode; return { root, commands }; }
describe('source NPC interaction rendering', () => {
  it('offers duel or greeting without starting an unconfirmed duel locally', () => {
    const state = base(), f = panel(state); findButton(f.root, 'Just Talk').onclick?.({}); findButton(f.root, 'Duel NPC').onclick?.({});
    expect(f.commands).toEqual([{ type: 'npcAnswer', accept: false }, { type: 'npcAnswer', accept: true }]); expect(state.stage).toBe('ask');
  });
  it('offers Continue for an authoritative opening line and waits for first-contact confirmation', () => {
    const opening = panel({ ...base(), stage: 'opening', firstContactStatus: 'pending', dialogue: { npcId: 1, line: 0, text: 'Original opening', known: true } });
    expect(opening.root.textContent).toContain('Original opening'); findButton(opening.root, 'Continue').onclick?.({}); expect(opening.commands).toEqual([{ type: 'npcAdvance' }]);
    const asking = panel({ ...base(), firstContactStatus: 'pending' }); expect(asking.root.textContent).toContain('waiting for server confirmation'); expect(findButton(asking.root, 'Duel NPC').disabled).toBe(true); findButton(asking.root, 'Duel NPC').onclick?.({}); expect(asking.commands).toEqual([]);
  });
  it('waits for authoritative settlement before advancing the after-duel stage', () => {
    const f = panel({ ...base(), stage: 'after-duel', result: 1, dialogue: { npcId: 1, line: null, text: '[Original NPC dialogue unavailable]', known: false } });
    expect(f.root.textContent).toContain('Duel Won'); expect(f.root.textContent).not.toContain('unavailable'); const next = findButton(f.root, 'Continue'); expect(next.disabled).toBe(true); next.onclick?.({}); expect(f.commands).toEqual([]);
  });
  it('offers only server-issued packs and never replays an uncertain claim', () => {
    const f = panel({ ...base(), stage: 'done', result: 1, settlementReceived: true, packs: [4, 8], packStatus: 'uncertain' });
    expect(findButton(f.root, 'Reward Pack 4').disabled).toBe(true); findButton(f.root, 'Reward Pack 4').onclick?.({}); expect(f.commands).toEqual([]);
    findButton(f.root, 'Refresh Inventory').onclick?.({}); expect(f.commands).toEqual([{ type: 'npcRefreshInventory' }]); expect(f.root.textContent).toContain('delivery uncertain'); expect(f.root.textContent).not.toContain('confirmed by server');
  });
  it('requires an offered idle reward pack to be selected before closing', () => {
    const f = panel({ ...base(), stage: 'done', result: 1, settlementReceived: true, packs: [4] });
    expect(findButton(f.root, 'Close NPC').disabled).toBe(true); findButton(f.root, 'Close NPC').onclick?.({}); expect(f.commands).toEqual([]);
    findButton(f.root, 'Reward Pack 4').onclick?.({}); expect(f.commands).toEqual([{ type: 'npcSelectPack', pack: 4 }]);
  });
  it('bounds actual card receipts and makes unknown identities explicit', () => {
    const state = { ...base(), stage: 'done' as const, result: 1 as const, settlementReceived: true, cards: Array.from({ length: 100 }, (_, i) => ({ id: i + 1, isNew: i === 0 })), packStatus: 'confirmed' as const }, f = panel(state);
    expect(f.root.querySelectorAll('article')).toHaveLength(80); expect(f.root.textContent).toContain('Card ID 1 · New'); expect(f.root.textContent).toContain('Showing 80 of 100'); expect(f.root.querySelectorAll('img')).toHaveLength(0); expect(f.commands).toEqual([]);
  });
  it('rejects an action from a stale NPC interaction snapshot', async () => {
    const document = new TestDocument(); vi.stubGlobal('document', document); const root = document.createElement('div');
    let state: ClientView = { scene: 'lobby', connection: 'online', status: 'Online', player: { id: 1, name: 'A' }, characters: [], lobby: { name: 'Academy', avatars: [], chat: [], channels: [], connected: true }, deckEditor: null, shop: null, duel: null, social: null, settings: { sound: 0, music: 0, reducedMotion: true, showCardNames: true }, npc: base() };
    const commands: ClientCommand[] = []; let notify: (state: ClientView) => void = () => {};
    const mounted = mountClient(root as unknown as HTMLElement, { getState: () => state, subscribe: listener => { notify = listener; return () => {}; }, dispatch: command => { commands.push(command); } });
    const old = findButton(root, 'Duel NPC'); state = { ...state, npc: { ...base(), stage: 'greeting' } }; notify(state); old.onclick?.({}); await Promise.resolve();
    expect(commands).toEqual([]); expect(root.textContent).toContain('This NPC interaction has changed.'); mounted.dispose();
  });
});
