import { describe, expect, it, vi, afterEach } from 'vitest';
import { NpcController } from '../src/features/npc';
import { duelResultWindows, npcResultWindow } from '../src/ui/htmlui/duel-result';
import { Ids } from '../src/ui/htmlui/snapshot';
import { giftItemName } from '../src/npcs/gift-names';
import { renderNpcFeature } from '../src/ui/npc';
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
  it('draws the two records of live (the player\'s and the NPC\'s, WIN / LOSE against each other) with the record from the talk', () => {
    const specs = duelResultWindows({ ids: new Ids(), duel: duel('Victory'), next: () => {}, npc: { name: 'Jaden', record: { wins: 4, loses: 1, draws: 2 } } });
    expect(specs.map(s => s.win.cls)).toEqual(['CWindowResult', 'CWindowResult', 'CEnginePictures', 'CWindowResultNext']);
    expect(specs[0]!.win.controls[0]!.label).toBe('Me: WIN, WIN 4, LOSE 1, SCORE 0');
    expect(specs[1]!.win.controls[0]!.label).toBe('Jaden: LOSE, WIN 1, LOSE 4, SCORE 0');
    expect(npcResultWindow({ ids: new Ids(), duel: duel('Defeat'), npc: { name: 'J', record: { wins: 0, loses: 1, draws: 0 } } }).win.controls[0]!.label).toContain('LOSE');
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
  it('says "You got <item>!" per named gift and counts the rest', () => {
    vi.stubGlobal('document', new TestDocument());
    const root = renderNpcFeature(state([229, 9000, 9001]), () => {}, { itemName: giftItemName }) as unknown as TestNode;
    expect(root.textContent).toContain('You got GUNSLINGER!');
    expect(root.textContent).toContain('2 item rewards confirmed. Item names are unavailable.');
  });
});
