import { describe, expect, it } from 'vitest';
import { npcPackSelect, npcPackUi } from '../src/ui/htmlui/npc-pack';
import { Ids } from '../src/ui/htmlui/snapshot';
import type { NpcState } from '../src/features/npc';

const won = (packs: number[]): NpcState => ({ stage: 'won', npc: { id: 7, name: 'NPC' }, dialogue: null, result: 1, present: 0, packs, packStatus: 'idle', giftStatus: 'idle', cards: [], giftCards: [], giftBits: [], firstContactStatus: 'idle', settlementReceived: true, refreshPending: false, error: null, eligibility: { status: 'idle', refreshing: false, bits: [], cards: [] } } as NpcState);

describe('what a pack holds (main\'s screens/pack-contents.js) outside the card shop', () => {
  it('the NPC pack picker has a Contents key that opens the chosen pack', () => {
    const opened: [number, string][] = [], ui = npcPackUi();
    const deps = { ids: new Ids(), ui, packName: (id: number) => ({ 3: 'Legend of Blue Eyes', 5: 'Metal Raiders' } as Record<number, string>)[id], send: () => {}, rerender: () => {}, contents: (id: number, name: string) => { opened.push([id, name]); } };
    npcPackSelect(won([3, 5]), deps); ui.selected = 1;   // the second row chosen
    const spec = npcPackSelect(won([3, 5]), deps)!, key = spec.win.controls.find(c => c.name === 'contents')!;
    expect(key.label).toBe('Contents');
    spec.handlers.get(key.id)!.click!();
    expect(opened).toEqual([[5, 'Metal Raiders']]);
    // without a way to open it the picker is main's alone
    expect(npcPackSelect(won([3]), { ...deps, contents: undefined })!.win.controls.some(c => c.name === 'contents')).toBe(false);
  });
});
