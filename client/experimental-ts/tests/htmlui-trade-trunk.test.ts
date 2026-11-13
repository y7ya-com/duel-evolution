import { describe, expect, it, vi } from 'vitest';
import { TradeTrunk, isTradeTrunk } from '../src/ui/htmlui/trade-trunk';
import { Ids } from '../src/ui/htmlui/snapshot';
import { initialTradeView } from '../src/gameplay/trade';
import type { SocialTrade } from '../src/features/social';

const trade = (patch: Partial<SocialTrade> = {}, view: Partial<SocialTrade['view']> = {}): SocialTrade => ({ phase: 'open', partner: { pid: 2, name: 'B' }, ownOffer: [], pendingMove: null,
  view: { ...initialTradeView(), trunk: [{ passcode: 11, count: 2 }, { passcode: 22, count: 1 }, { passcode: 33, count: 1 }], limit: [{ passcode: 33, count: 1 }], ...view }, ...patch });
const card = (passcode: number) => ({ id: String(passcode), passcode, name: `Card ${passcode}`, type: 'Spell Card', limit: 0, rarity: 'SR' });

describe("the trade's trunk (the deck screen's CWindowModelKaban)", () => {
  it('lists the copies this side may offer as trunk rows, and offers the card a row is dragged onto the offer area from', () => {
    const dispatch = vi.fn(), rerender = vi.fn(), t = new TradeTrunk({ card, dispatch, rerender, editable: () => true });
    const spec = t.window(new Ids(), trade({ ownOffer: [11] }), true)!;
    expect(spec.win.cls).toBe('CWindowModelKaban'); expect(spec.win).toMatchObject({ x: 736, y: 0, w: 288, h: 608 }); expect(isTradeTrunk(spec.win)).toBe(true);
    const rows = spec.win.controls.filter(c => c.cls === 'CWindowTaskKabanListBtn' && Number(c.card) > 0);
    // a soul-bound copy is no row (33); 11 has one copy left besides the one offered, 22 its one
    expect(rows.map(r => r.passcode)).toEqual([11, 22]);
    const figure = (r: number) => (spec.win.controls.find(c => c.name === 'Number' && c.y === 88 + 56 * r - spec.win.y)?.parts as { sprites: { src: number[] }[] }).sprites.slice(1).map(s => s.src[0]! / 8).join('');
    expect(figure(0)).toBe('001'); expect(figure(1)).toBe('001');
    // no banlist dimming in a trade: the rows' pictures at full brightness
    expect(rows.every(r => (r.parts as { sprites: { col: number[] }[] }).sprites.every(s => s.col[0] === 1))).toBe(true);
    // the count box: the trunk's copies, the offered one too (live: 53 for 50 rows)
    expect(spec.win.controls.find(c => c.cls === 'CWindowTaskKabanNumber')?.count).toBe(3);
    // the engine's header (Trunk over Rearrange, the colour keys and filter icons) and the list's scroll bar
    expect((spec.win.controls.find(c => c.cls === 'CWindowTaskDeckBar')?.parts as { sprites: { src: number[] }[] }).sprites.some(s => s.src[1] === 112)).toBe(true);
    expect(spec.win.controls.find(c => c.cls === 'CWindowTaskKabanScroll')).toMatchObject({ wx: 1000, wy: 88, h: 512 });
    expect(t.card(22)?.rarity).toBeUndefined();   // no crafting rarity badge on a trade's rows
    // nine rows above the chat window (live), the frame to 608
    expect(spec.win.controls.filter(c => c.cls === 'CWindowTaskKabanListBtn' && c.shown).length).toBe(9);
    expect(spec.win.controls.find(c => c.cls === 'CWindowTaskFrameThin')?.h).toBe(528);
    // a press shows the card (no offer); a click or a double-click offers nothing (live)
    t.pick('trunk', 1, 22, [870, 150]); expect(t.ui.shown).toBe(22); t.dropOn('trunk'); t.quick(); expect(dispatch).not.toHaveBeenCalled();
    // dragged onto this side's offer area: offered
    t.pick('trunk', 1, 22, [870, 150]); t.dragTo([700, 300]); t.dragTo([490, 450]); expect(t.dragView()?.passcode).toBe(22);
    t.dropOn('main'); expect(dispatch).toHaveBeenCalledWith({ type: 'addTradeCard', passcode: 22 }); expect(dispatch).toHaveBeenCalledTimes(1); expect(t.ui.drag).toBeNull();
  });
  it('closes once this side is ready and offers nothing while it may not', () => {
    const dispatch = vi.fn(), t = new TradeTrunk({ card, dispatch, rerender: vi.fn(), editable: () => false });
    expect(t.window(new Ids(), trade(), false)).toBeNull();
    t.window(new Ids(), trade(), true); t.pick('trunk', 0, 11, [870, 100]); t.dragTo([490, 450]); t.dropOn('main'); expect(dispatch).not.toHaveBeenCalled();
  });
  it('scrolls a row a notch within the list', () => {
    const many = Array.from({ length: 20 }, (_, i) => ({ passcode: 100 + i, count: 1 })), rerender = vi.fn();
    const t = new TradeTrunk({ card, dispatch: vi.fn(), rerender, editable: () => true });
    t.window(new Ids(), trade({}, { trunk: many, limit: [] }), true);
    t.wheel(1); expect(t.ui.top).toBe(1); t.wheel(50); expect(t.ui.top).toBe(11); t.wheel(-50); expect(t.ui.top).toBe(0); expect(rerender).toHaveBeenCalledTimes(3);
  });
});
