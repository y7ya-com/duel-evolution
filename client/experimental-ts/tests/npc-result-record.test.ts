import { describe, expect, it, vi, afterEach } from 'vitest';
import { NpcController } from '../src/features/npc';
import { duelResultWindows, npcResultWindow } from '../src/ui/htmlui/duel-result';
import { Ids } from '../src/ui/htmlui/snapshot';
import { giftItemName } from '../src/npcs/gift-names';
import { npcItemGetUi, npcItemGetWindows, npcItemMessages } from '../src/ui/htmlui/npc-itemget';
import type { NpcState } from '../src/features/npc';
import type { DuelView } from '../src/ui/contracts';
import { TestDocument, type TestNode } from './ui-dom-fixture';
afterEach(() => vi.unstubAllGlobals());

const duel = (ended: string) => ({ ended, turn: 7, players: [{ name: 'Me', lp: 1200 }, { name: 'Jaden', lp: 0 }] }) as unknown as DuelView;

describe('NPC result record (CWindowResultNpc)', () => {
  it('keeps the server NPCBIN record from the talk and counts this duel’s server result once', async () => {
    const c = new NpcController({ send: vi.fn(), onStartDuel: vi.fn() });
    c.open({ id: 51, name: 'Jaden' }, 0, { npcRank: 2, record: [3, 1, 0] });
    expect(c.state.record).toEqual({ wins: 3, loses: 1, draws: 0 });
    c.advance(); expect(c.state.stage).toBe('ask'); await c.answer(true); c.afterDuel(2); c.afterDuel(2);
    expect(c.state.record).toEqual({ wins: 3, loses: 2, draws: 0 });
  });
  it('has no record when the server sent none or a malformed one, and caps at 255 as the server does', async () => {
    const c = new NpcController({ send: vi.fn(), onStartDuel: vi.fn() });
    c.open({ id: 51, name: 'Jaden' }); expect(c.state.record).toBeNull(); c.reset();
    c.open({ id: 51, name: 'Jaden' }, 0, { record: [300, 0, 0] }); expect(c.state.record).toBeNull(); c.reset();
    c.open({ id: 51, name: 'Jaden' }, 0, { record: [255, 0, 0] }); c.advance(); await c.answer(true); expect(c.state.stage).toBe('duel'); c.afterDuel(1); expect(c.state.stage).toBe('after-duel');
    expect(c.state.record).toEqual({ wins: 255, loses: 0, draws: 0 });
  });
  it('draws live\'s W-L RECORD board with the record from the talk', () => {
    const specs = duelResultWindows({ ids: new Ids(), duel: duel('Victory'), next: () => {}, npc: { name: 'Jaden', record: { wins: 4, loses: 1, draws: 2 } } });
    expect(specs.map(s => s.win.cls)).toEqual(['CWindowResultNpc', 'CEnginePictures', 'CWindowResultNext']);
    expect(specs[0]!.win.controls[0]!.label).toBe('Me: W-L RECORD against Jaden: 4 wins, 1 losses, 2 draws');
    expect(npcResultWindow({ ids: new Ids(), duel: duel('Defeat'), npc: { name: 'J', record: { wins: 0, loses: 1, draws: 0 } } }).win.controls[0]!.label).toContain('1 losses');
  });
  it('keeps the two player records for a PvP duel', () => {
    expect(duelResultWindows({ ids: new Ids(), duel: duel('Victory') }).map(s => s.win.cls)).toEqual(['CWindowResult', 'CWindowResult', 'CEnginePictures', 'CWindowResultNext']);
  });
  it('main’s result.js draws CWindowResultNpc', async () => {
    const mod = (await import('@htmlui/screens/result.js')).default as { classes: string[] };
    expect(mod.classes).toContain('CWindowResultNpc');
  });
});

describe('NPC gifts by name (CWindowModelItemGet)', () => {
  const state = (giftBits: number[]): NpcState => ({ stage: 'done', npc: { id: 1, name: 'NPC' }, dialogue: null, result: 1, present: 2, packs: [], packStatus: 'idle', giftStatus: 'confirmed', cards: [], giftCards: [], giftBits, firstContactStatus: 'idle', settlementReceived: true, refreshPending: false, error: null, eligibility: { status: 'idle', refreshing: false, bits: [], cards: [] } });
  it('names title bits from the server title table, recipes through the catalogue, nothing else', () => {
    expect(giftItemName(229)).toBe('GUNSLINGER');
    expect(giftItemName(9000)).toBeNull();
    expect(giftItemName(700, b => b === 700 ? 'Starter Recipe' : undefined)).toBe('Starter Recipe');
  });
  it('says "You got <X>!" per received card and gift, one Ok dialog at a time, and the last OK ends the talk', async () => {
    const npc = { ...state([229, 9000]), cards: [{ id: 7, isNew: true }], packs: [3], packStatus: 'confirmed' } as NpcState;
    const names = { cardName: (id: number) => id === 7 ? 'Blast Juggler' : undefined, itemName: (b: number) => giftItemName(b) };
    expect(npcItemMessages(npc, names).map(m => m.text)).toEqual(['You got Blast Juggler!', 'You got GUNSLINGER!', 'You got an item!']);
    const ui = npcItemGetUi(); let closed = 0;
    const deps = { ids: new Ids(), ui, ...names, close: () => { closed++; }, rerender: () => {} };
    for (let i = 0; i < 3; i++) {
      const [spec] = npcItemGetWindows(npc, deps);
      expect(spec!.win.cls).toBe('CWindowModelDialogOk'); expect(spec!.win.z).toBe(51620);
      const ok = [...spec!.handlers.values()].find(h => h.key === 'npc-itemget-ok')!; ok.click!();
    }
    expect(npcItemGetWindows(npc, deps)).toEqual([]); await Promise.resolve(); expect(closed).toBe(1);
    npcItemGetWindows(npc, deps); await Promise.resolve(); expect(closed).toBe(1);   // once
  });
  it('waits while a pack is still to pick or a claim is with the server; a refused claim says so first', () => {
    const deps = { ids: new Ids(), ui: npcItemGetUi(), cardName: () => undefined, itemName: () => null, close: () => {}, rerender: () => {} };
    expect(npcItemGetWindows({ ...state([]), packs: [3], packStatus: 'idle' } as NpcState, deps)).toEqual([]);
    expect(npcItemGetWindows({ ...state([]), giftStatus: 'pending', stage: 'claiming' } as NpcState, deps)).toEqual([]);
    const [err] = npcItemGetWindows({ ...state([]), packs: [3], packStatus: 'failed', error: 'Server refused NPC pack (2)' } as NpcState, deps);
    expect(err!.win.cls).toBe('CWindowModelDialogError');
  });

});
