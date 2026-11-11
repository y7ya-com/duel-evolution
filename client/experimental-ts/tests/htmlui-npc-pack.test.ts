import { describe, expect, it } from 'vitest';
import { FRAME, npcPackOpen, npcPackSelect, npcPackUi, packLine } from '../src/ui/htmlui/npc-pack';
import { Ids } from '../src/ui/htmlui/snapshot';
import { columns } from '@htmlui/screens/packselect.js';
import type { NpcState } from '../src/features/npc';
import type { ClientCommand } from '../src/ui/contracts';

const won = (packs: number[], extra: Partial<NpcState> = {}): NpcState => ({ stage: 'won', npc: { id: 7, name: 'NPC' }, dialogue: null, result: 1, present: 0, packs, packStatus: 'idle', giftStatus: 'idle', cards: [], giftCards: [], giftBits: [], firstContactStatus: 'idle', settlementReceived: true, refreshPending: false, error: null, eligibility: { status: 'idle', refreshing: false, bits: [], cards: [] }, ...extra });
const deps = (sent: ClientCommand[], ui = npcPackUi(), names: Record<number, string> = { 3: 'Legend of Blue Eyes', 5: 'Metal Raiders' }) =>
  ({ ids: new Ids(), ui, packName: (id: number) => names[id], send: (c: ClientCommand) => { sent.push(c); }, rerender: () => {} });

describe('NPC reward pack pick in main\'s CWindowPackSelect', () => {
  it('is up only while the server offered packs and none is claimed', () => {
    expect(npcPackOpen(won([3]))).toBe(true);
    expect(npcPackOpen(won([]))).toBe(false);
    expect(npcPackOpen(won([3], { settlementReceived: false }))).toBe(false);
    expect(npcPackOpen(won([3], { packStatus: 'pending' }))).toBe(false);
    expect(npcPackSelect(won([3], { packStatus: 'confirmed' }), deps([]))).toBeNull();
  });
  it('builds the rows in main\'s columns and claims the chosen row on OK', () => {
    const sent: ClientCommand[] = [], ui = npcPackUi(), spec = npcPackSelect(won([3, 5]), deps(sent, ui))!;
    expect(spec.win.cls).toBe('CWindowPackSelect');
    const list = spec.win.controls.find(c => c.cls === 'CWindowTaskNoBackList')!;
    expect(list.items).toEqual(['@>64/Legend of Blue Eyes', '@>64/Metal Raiders']);
    expect(columns((list.items as string[])[1])).toEqual([{ x: 64, s: 'Metal Raiders', blue: false }]);
    expect(columns(packLine('Pack', 12.34))).toEqual([{ x: 64, s: 'Pack', blue: false }, { x: 600, s: '12.3 %', blue: true }]);
    // main's row press: the row's centre in game px (packselect.js rowPoint)
    spec.handlers.get(list.id)!.click!([FRAME.x + 8 + 40, FRAME.y + 8 + 16 + 8]);
    expect(ui.selected).toBe(1);
    const again = npcPackSelect(won([3, 5]), deps(sent, ui))!, ok = again.win.controls.find(c => c.name === 'ok')!;
    expect(again.handlers.get(ok.id)!.key).toBe('npc-pack:ok');
    again.handlers.get(ok.id)!.click!();
    expect(sent).toEqual([{ type: 'npcSelectPack', pack: 5 }]);
  });
  it('gives the list the bar main scrolls when more than six packs are offered', () => {
    const ui = npcPackUi(), spec = npcPackSelect(won([1, 2, 3, 4, 5, 6, 7, 8]), deps([], ui, {}))!;
    const list = spec.win.controls.find(c => c.cls === 'CWindowTaskNoBackList')!, bar = spec.win.controls.find(c => c.parent === list.id)!;
    expect(bar).toMatchObject({ thumb: 0, max: 2 });
    spec.handlers.get(bar.id)!.value!(5); expect(ui.top).toBe(2);
    expect((list.items as string[])[0]).toBe('@>64/Reward Pack 1');
  });
  it('a new offer starts from its first row', () => {
    const ui = npcPackUi(); npcPackSelect(won([3, 5]), deps([], ui)); ui.selected = 1;
    npcPackSelect(won([3, 5], { npc: { id: 8, name: 'Other' } }), deps([], ui)); expect(ui.selected).toBe(0);
  });
});
