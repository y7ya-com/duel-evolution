// Duel Log (src/ui/htmlui/duellog.ts: CWindowModelDuellogTop / List / Search) over main's duel archive, GET
// /api/de/replays: the stats, search and pages cut here; Download and Play per row; the replay's controls.
import { describe, expect, it } from 'vitest';
import { duellogQuery, duellogUi, duellogUrl, duellogWindow, fetchDuellog, duellogLine, replayWindow, REPLAYS_PAGE, type DuellogRow, type DuellogSearch } from '../src/ui/htmlui/duellog';
import { Ids } from '../src/ui/htmlui/snapshot';

const DAY = 86400, T0 = 1_700_000_000;
const row = (i: number, o: Partial<DuellogRow> = {}): DuellogRow => ({ id: 100 + i, at: T0 + i * DAY, kind: i % 2 ? 'npc' : 'pvp', me: 'Alice', opponent: `Opp${i % 3}`, npc: null, game: 1,
  result: i % 4 === 0 ? 'lose' : i % 7 === 0 ? 'draw' : 'win', reason: null, turns: 5, secs: 300, bytes: 12000, ...o });
const all = Array.from({ length: 30 }, (_, i) => row(29 - i));
const none: DuellogSearch = { opp: '', result: '', from: '', to: '' };
const deps = () => {
  const loads: [DuellogSearch, number][] = [], opened: [string, boolean][] = [], played: string[] = []; let closed = 0;
  return { loads, opened, played, closed: () => closed, d: { load: (s: DuellogSearch, p: number) => { loads.push([{ ...s }, p]); }, close: () => { closed++; }, rerender: () => {},
    open: (u: string, dl: boolean) => { opened.push([u, dl]); }, play: (k: string) => { played.push(k); } } };
};
const click = (spec: ReturnType<typeof duellogWindow>, name: string) => spec.handlers.get(spec.win.controls.find(c => c.name === name)!.id)!.click!();
const ctl = (spec: ReturnType<typeof duellogWindow>, name: string) => spec.win.controls.find(c => c.name === name);
const ymd = (t: number) => { const d = new Date(t * 1000); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };

describe('Duel Log over the duel archive', () => {
  it('reads the whole archive list; the server error in words', async () => {
    expect(duellogUrl()).toBe('/api/de/replays?limit=1000');
    const ok = (async () => new Response(JSON.stringify({ replays: all }), { status: 200 })) as unknown as typeof fetch;
    expect(await fetchDuellog(ok)).toHaveLength(30);
    const bad = (async () => new Response(JSON.stringify({ error: 'no game account' }), { status: 404 })) as unknown as typeof fetch;
    expect(await fetchDuellog(bad)).toEqual({ error: 'Enter the game to see your Duel Log.' });
  });
  it('stats over everything; search by opponent (substring, any case), result, local days; pages', () => {
    const q = duellogQuery(all, 'Alice', none, 1);
    expect(q.stats).toEqual({ total: 30, wins: all.filter(x => x.result === 'win').length, losses: 8, draws: all.filter(x => x.result === 'draw').length });
    expect([q.page, q.pages, q.rows.length, q.matched]).toEqual([1, 4, 8, 30]);
    expect(duellogQuery(all, '', none, 9).page).toBe(4);
    const o = duellogQuery(all, '', { ...none, opp: 'opp1' }, 1, 50);
    expect(o.matched).toBe(10); expect(o.rows.every(r => r.opponent === 'Opp1')).toBe(true);
    expect(duellogQuery(all, '', { ...none, result: 'lose' }, 1, 50).rows.every(r => r.result === 'lose')).toBe(true);
    const d = duellogQuery(all, '', { ...none, from: ymd(T0 + 20 * DAY), to: ymd(T0 + 21 * DAY) }, 1, 50);
    expect(d.rows.map(r => r.id)).toEqual([121, 120]);
  });
  it('top: the stats; Duel History opens the list; All Replays opens main\'s /replays; Close closes', () => {
    const ui = duellogUi(); ui.all = all; ui.data = duellogQuery(all, 'Alice', none, 1); const t = deps();
    const top = duellogWindow(new Ids(), ui, t.d);
    expect(top.win.cls).toBe('CWindowModelDuellogTop');
    expect(ctl(top, 'stats')!.text).toBe(`Duels: 30     Wins: ${ui.data.stats.wins}     Losses: 8     Draws: ${ui.data.stats.draws}`);
    click(top, 'replays'); expect(t.opened).toEqual([[REPLAYS_PAGE, false]]);
    click(top, 'history');
    expect(ui.view).toBe('list'); expect(t.loads).toEqual([[ui.search, 1]]);
    click(duellogWindow(new Ids(), ui, t.d), 'close'); expect(t.closed()).toBe(1);
  });
  it('list: rows, paging; a chosen row downloads its .yrpX; Play only for a record kept in this browser', () => {
    const ui = duellogUi(); ui.view = 'list'; ui.all = all; ui.data = duellogQuery(all, 'Alice', none, 1); const t = deps();
    const first = ui.data.rows[0]!;
    ui.local = [{ key: 'k1', when: first.at + 40, names: ['Alice', String(first.opponent).replace(' ', '_')] }];
    let list = duellogWindow(new Ids(), ui, t.d);
    expect(list.win.cls).toBe('CWindowModelDuellogList');
    expect((ctl(list, 'list')!.items as string[])[0]).toBe(duellogLine(first, true));
    expect(duellogLine(row(1, { opponent: 'Bob', result: 'win', turns: 12, game: 2 }))).toContain('vs Bob   Win   12 turns   NPC Duel · Game 2');
    expect(ctl(list, 'prev')!.state).toBe('disabled');
    expect([ctl(list, 'play')!.state, ctl(list, 'download')!.state]).toEqual(['disabled', 'disabled']);
    click(list, 'next'); expect(t.loads.at(-1)![1]).toBe(2);
    list.handlers.get(ctl(list, 'list')!.id)!.click!([500, 282 + 32 + 4]); expect(ui.selected).toBe(0);
    list = duellogWindow(new Ids(), ui, t.d);
    click(list, 'download'); expect(t.opened.at(-1)).toEqual([`/api/de/replays/${first.id}`, true]);
    click(list, 'play'); expect(t.played).toEqual(['k1']);
    ui.selected = 1; list = duellogWindow(new Ids(), ui, t.d);
    expect(ctl(list, 'play')!.state).toBe('disabled'); expect(ctl(list, 'playHint')).toBeTruthy();
  });
  it('search: opponent, result, dates; Search loads page 1 of it; a bad date disables Search', () => {
    const ui = duellogUi(); ui.view = 'search'; ui.all = all; ui.data = duellogQuery(all, 'Alice', none, 1); const t = deps();
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
  it('the replay controls: Play/Pause, Step, Exit; the end disables play and step', () => {
    const acts: string[] = [];
    let w = replayWindow(new Ids(), { names: ['Alice', 'Yami Marik'], when: T0, index: 3, total: 10, playing: true }, a => acts.push(a));
    expect(w.win.controls.find(c => c.name === 'title')!.text).toBe('Replay: Alice vs Yami Marik   3/10');
    expect(w.win.controls.find(c => c.name === 'toggle')!.label).toBe('Pause');
    for (const n of ['toggle', 'step', 'exit']) w.handlers.get(w.win.controls.find(c => c.name === n)!.id)!.click!();
    expect(acts).toEqual(['toggle', 'step', 'exit']);
    w = replayWindow(new Ids(), { names: ['A', 'B'], when: T0, index: 10, total: 10, playing: false }, a => acts.push(a));
    expect(['toggle', 'step', 'exit'].map(n => w.win.controls.find(c => c.name === n)!.state)).toEqual(['disabled', 'disabled', 'normal']);
  });
});
