// Duel Log (src/ui/htmlui/duellog.ts: CWindowModelDuellogTop / List / Search) over GET /api/de/duellog.
import { describe, expect, it } from 'vitest';
import { duellogUi, duellogUrl, duellogWindow, fetchDuellog, duellogLine, type DuellogPage, type DuellogSearch } from '../src/ui/htmlui/duellog';
import { Ids } from '../src/ui/htmlui/snapshot';

const page = (o: Partial<DuellogPage> = {}): DuellogPage => ({ you: 'Alice', stats: { total: 3, wins: 2, losses: 1, draws: 0 }, matched: 3, page: 1, pages: 2, per: 8,
  rows: [{ t: 1_700_000_000, opp: 'Bob', opp_pid: 7, result: 'win', turns: 12, ranked: true, origin: 'autoduel', match: false }], ...o });
const deps = () => { const loads: [DuellogSearch, number][] = []; let closed = 0; return { loads, closed: () => closed, d: { load: (s: DuellogSearch, p: number) => { loads.push([{ ...s }, p]); }, close: () => { closed++; }, rerender: () => {} } }; };
const click = (spec: ReturnType<typeof duellogWindow>, name: string) => spec.handlers.get(spec.win.controls.find(c => c.name === name)!.id)!.click!();
const ctl = (spec: ReturnType<typeof duellogWindow>, name: string) => spec.win.controls.find(c => c.name === name);

describe('Duel Log', () => {
  it('the URL carries the search, valid dates only, and the page', () => {
    expect(duellogUrl({ opp: ' Bob ', result: 'lose', from: '2026-01-02', to: 'x' }, 3)).toBe('/api/de/duellog?opp=Bob&result=lose&from=2026-01-02&page=3&per=8');
  });
  it('fetch: a page, or the server error in words', async () => {
    const ok = (async () => new Response(JSON.stringify(page()), { status: 200 })) as unknown as typeof fetch;
    expect(await fetchDuellog(duellogUi().search, 1, ok)).toMatchObject({ you: 'Alice' });
    const bad = (async () => new Response(JSON.stringify({ error: 'not-in-game' }), { status: 409 })) as unknown as typeof fetch;
    expect(await fetchDuellog(duellogUi().search, 1, bad)).toEqual({ error: 'Enter the game to see your Duel Log.' });
  });
  it('top: the stats; Duel History opens the list and loads page 1; Close closes', () => {
    const ui = duellogUi(); ui.data = page(); const t = deps();
    const top = duellogWindow(new Ids(), ui, t.d);
    expect(top.win.cls).toBe('CWindowModelDuellogTop');
    expect(ctl(top, 'stats')!.text).toBe('Duels: 3     Wins: 2     Losses: 1     Draws: 0');
    expect(ctl(top, 'rate')!.text).toBe('Win rate: 67%');
    click(top, 'history');
    expect(ui.view).toBe('list'); expect(t.loads).toEqual([[ui.search, 1]]);
    click(duellogWindow(new Ids(), ui, t.d), 'close'); expect(t.closed()).toBe(1);
  });
  it('list: rows, paging, a row chosen', () => {
    const ui = duellogUi(); ui.view = 'list'; ui.data = page(); const t = deps();
    const list = duellogWindow(new Ids(), ui, t.d);
    expect(list.win.cls).toBe('CWindowModelDuellogList');
    expect((ctl(list, 'list')!.items as string[])[0]).toBe(duellogLine(page().rows[0]!));
    expect(duellogLine(page().rows[0]!)).toContain('vs Bob   Win   12 turns   Autoduel (Ranked)');
    expect(ctl(list, 'prev')!.state).toBe('disabled');
    click(list, 'next'); expect(t.loads.at(-1)![1]).toBe(2);
    list.handlers.get(ctl(list, 'list')!.id)!.click!([500, 282 + 32 + 4]); expect(ui.selected).toBe(0);
  });
  it('search: opponent, result, dates; Search loads page 1 of it; a bad date disables Search', () => {
    const ui = duellogUi(); ui.view = 'search'; ui.data = page(); const t = deps();
    let w = duellogWindow(new Ids(), ui, t.d);
    expect(w.win.cls).toBe('CWindowModelDuellogSearch');
    w.handlers.get(ctl(w, 'opp')!.id)!.text!('bo');
    click(w, 'result:lose');
    w.handlers.get(ctl(w, 'from')!.id)!.text!('2026-1');
    w = duellogWindow(new Ids(), ui, t.d);
    expect(ctl(w, 'run')!.state).toBe('disabled');
    w.handlers.get(ctl(w, 'from')!.id)!.text!('2026-01-01');
    click(duellogWindow(new Ids(), ui, t.d), 'run');
    expect(ui.view).toBe('list');
    expect(t.loads.at(-1)).toEqual([{ opp: 'bo', result: 'lose', from: '2026-01-01', to: '' }, 1]);
  });
});
