import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { npcPackSelect, npcPackUi } from '../src/ui/htmlui/npc-pack';
import { shopWindows, shopLocal } from '../src/ui/htmlui/shop';
import { Ids } from '../src/ui/htmlui/snapshot';
import { packAt, ART } from '@htmlui/screens/pack-contents.js';
import type { NpcState } from '../src/features/npc';
import type { ShopItem } from '../src/ui/contracts';

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
  it('the legacy shop\'s Booster Packs window carries its packs\' ids, as main\'s pack-contents.js hotspots read them', () => {
    const items: ShopItem[] = Array.from({ length: 12 }, (_, i) => ({ id: 100 + i, name: `Pack ${i}`, price: 300, category: 'packs', packId: 200 + i }));
    const ui = shopLocal(); ui.page = 'packs'; ui.index = 1;
    const specs = shopWindows({ shop: { items, mp: 1000 }, ui, ids: new Ids(), busy: false, world: 0, portrait: null, name: i => i.name, rerender: () => {}, buy: () => {}, exit: () => {} });
    const win = specs.find(s => s.win.cls === 'CShopPackWindow')!.win as unknown as { packs: number[]; page: number };
    expect(win.packs).toEqual(items.map(i => i.packId));
    expect(win.page).toBe(1);
    // main's hotspot over the second page's first art names the eleventh pack
    expect(packAt(win, ART.x + 1, ART.y[0] + 1)).toBe(210);
    // main's shop screen draws the hotspots on this window
    expect(readFileSync(new URL('../../web-shell/htmlui/screens/shop.js', import.meta.url), 'utf8')).toMatch(/CShopPackWindow'\) packHotspots/);
  });
});
