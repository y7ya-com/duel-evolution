import { describe, expect, it } from 'vitest';
import { trunkCards, emptyKabanFilter } from '../src/ui/htmlui/deck';
import { craftableNow } from '../src/ui/htmlui/deck-scene';
import { ownedTitles, DEFAULT_TITLE_BIT } from '../src/features/titles';
import { titleConfigWindow } from '../src/ui/htmlui/title-config';
import { Ids } from '../src/ui/htmlui/snapshot';
import type { CardView } from '../src/ui/contracts';

const card = (passcode: number, owned: number, rarity: string): CardView => ({ id: String(passcode), passcode, name: `Card ${passcode}`, type: 'Spell Card', owned, rarity } as CardView);
const cards = [card(1, 2, 'N'), card(2, 0, 'SR'), card(3, 0, 'UR'), card(4, 1, 'UR')];
const order = (c: CardView) => c.passcode ?? 0;
const pcs = (list: CardView[]) => list.map(c => c.passcode);

describe('deck editor Show / Rarity filters', () => {
  it('lists owned cards by default, every card for All, the unowned for Missing', () => {
    expect(pcs(trunkCards(cards, emptyKabanFilter(), order))).toEqual([1, 4]);
    expect(pcs(trunkCards(cards, { ...emptyKabanFilter(), show: 'all' }, order))).toEqual([1, 2, 3, 4]);
    expect(pcs(trunkCards(cards, { ...emptyKabanFilter(), show: 'missing' }, order))).toEqual([2, 3]);
  });
  it('narrows by rarity', () => {
    expect(pcs(trunkCards(cards, { ...emptyKabanFilter(), show: 'all', rarity: ['UR'] }, order))).toEqual([3, 4]);
    expect(pcs(trunkCards(cards, { ...emptyKabanFilter(), rarity: ['N'] }, order))).toEqual([1]);
  });
  it('Craftable now follows the crafting view and the shard costs (SR 4,500 / UR 8,000)', () => {
    const view = { shards: 5000, cards: { 2: { owned: 0, craftable: true, rarity: 'SR' }, 3: { owned: 0, craftable: true, rarity: 'UR' }, 4: { owned: 1, craftable: false, rarity: 'UR' } } };
    expect(craftableNow(cards[1]!, view)).toBe(true);
    expect(craftableNow(cards[2]!, view)).toBe(false);
    expect(craftableNow(cards[3]!, view)).toBe(false);
    expect(craftableNow(cards[1]!, null)).toBe(false);
    expect(pcs(trunkCards(cards, { ...emptyKabanFilter(), show: 'craftable' }, order, c => craftableNow(c, { ...view, shards: 9000 })))).toEqual([2, 3]);
    // the server's own costs win over the fallback
    expect(craftableNow(cards[2]!, { ...view, values: { craft: { UR: 5000 } } })).toBe(true);
  });
});

describe('Change Title', () => {
  it('lists the starting title and the PBIN-earned ones, never the GM titles', () => {
    const pbin = new Uint8Array(128);
    for (const bit of [225, 226, 230]) pbin[bit >> 3]! |= 1 << (bit & 7);
    const titles = ownedTitles(pbin);
    expect(titles.map(t => t.bit)).toEqual([DEFAULT_TITLE_BIT, 230]);
    expect(ownedTitles(undefined).map(t => t.bit)).toEqual([DEFAULT_TITLE_BIT]);
  });
  it('wears the chosen title and closes', () => {
    const worn: number[] = []; let closed = 0;
    const ui = { selected: 1, top: 0 };
    const spec = titleConfigWindow(new Ids(), ui, { titles: [{ bit: 224, name: 'A' }, { bit: 230, name: 'B' }], wear: b => worn.push(b), close: () => { closed++; }, rerender: () => {} });
    expect(spec.win.cls).toBe('CWindowModelTitleConfig');
    const wear = spec.win.controls.find(c => c.name === 'wear')!;
    spec.handlers.get(wear.id)!.click!();
    expect(worn).toEqual([230]); expect(closed).toBe(1);
    const none = titleConfigWindow(new Ids(), { selected: -1, top: 0 }, { titles: [], wear: () => {}, close: () => {}, rerender: () => {} });
    expect(none.win.controls.find(c => c.name === 'wear')!.state).toBe('disabled');
  });
});
