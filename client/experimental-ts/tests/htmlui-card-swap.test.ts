import { describe, expect, it, vi } from 'vitest';
import { tradeWindows, tradeLocal, partnerLeft } from '../src/ui/htmlui/trade';
import { cardSwapMenu } from '../src/ui/htmlui/card-swap-menu';
import { Ids } from '../src/ui/htmlui/snapshot';
import { initialTradeView } from '../src/gameplay/trade';
import type { SocialTrade } from '../src/features/social';

const trade = (patch: Partial<SocialTrade> = {}, view: Partial<SocialTrade['view']> = {}): SocialTrade => ({ phase: 'open', partner: { pid: 2, name: 'Sr1100' }, ownOffer: [], pendingMove: null,
  view: { ...initialTradeView(), trunk: [{ passcode: 11, count: 1 }], ...view }, ...patch });
const deps = (t: SocialTrade, status = '') => ({ trade: t, ui: tradeLocal(), ids: new Ids(), dispatch: vi.fn(), rerender: vi.fn(), name: (pc: number) => `Card ${pc}`, status });
const keys = (specs: ReturnType<typeof tradeWindows>) => specs.flatMap(s => [...s.handlers.values()].map(h => h.key));

describe("Card Swap (live's trade scene)", () => {
  it('has Ready to Trade. and no Cancel or "Close this trade?" question: EXIT leaves', () => {
    const d = deps(trade()), specs = tradeWindows(d);
    expect(keys(specs)).toContain('trade-ready'); expect(keys(specs)).not.toContain('trade-cancel');
    const exit = vi.fn(), menu = cardSwapMenu(new Ids(), { exit });
    expect(menu.win.cls).toBe('CCardSwapMenu'); expect(menu.win).toMatchObject({ x: 0, y: 0, w: 248, h: 175 });
    [...menu.handlers.values()].find(h => h.key === 'trade-exit')!.click!(); expect(exit).toHaveBeenCalledTimes(1);
  });
  it('keeps the scene when the partner left, the line on the strip between the areas, no dialog', () => {
    const left = trade({ phase: 'finished', ownOffer: [11] }, { success: false, finished: true }), d = deps(left);
    expect(partnerLeft(d)).toBe(true);
    const specs = tradeWindows(d), strip = specs.find(s => s.win.cls === 'CTradeStrip')!;
    expect(strip.win).toMatchObject({ x: 256, y: 291, w: 472 });
    expect(strip.win.text).toBe('Your trade partner left the trade. Nothing was traded.');
    // the areas stay 488 wide beside the trunk
    expect(specs.find(s => s.win.cls === 'CWindowTaskCardArea')!.win.drawn).toMatchObject({ w: 472 });
    expect(keys(specs)).not.toContain('trade-close');
    // a refusal or a decline is still the result dialog
    expect(partnerLeft({ ...d, reason: 'Trade cancelled: soul-bound card.' })).toBe(false);
    expect(keys(tradeWindows({ ...d, reason: 'Trade cancelled: soul-bound card.' }))).toContain('trade-close');
  });
});
