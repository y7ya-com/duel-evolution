// Duel Log (src/ui/htmlui/duellog.ts: CWindowModelDuellogTop / List / Operation / Search), live's flow: Latest Duel
// Logs (this browser's records), Server Duel Logs (main's duel archive, GET /api/de/replays), Duel Log Collection;
// the operation menu's Play / Add to Collection / Download; the search; the replay's controls.
import { describe, expect, it } from 'vitest';
import { duellogQuery, duellogUi, duellogUrl, duellogWindow, fetchDuellog, replayWindow, DUELLOG_TEXT, wrapLines, type CollectedLog, type DuellogRow, type DuellogSearch } from '../src/ui/htmlui/duellog';
import { Ids } from '../src/ui/htmlui/snapshot';

const DAY = 86400, T0 = 1_700_000_000;
const row = (i: number, o: Partial<DuellogRow> = {}): DuellogRow => ({ id: 100 + i, at: T0 + i * DAY, kind: i % 2 ? 'npc' : 'pvp', me: 'Alice', opponent: `Opp${i % 3}`, npc: null, game: 1,
  result: i % 4 === 0 ? 'lose' : i % 7 === 0 ? 'draw' : 'win', reason: null, turns: 5, secs: 300, bytes: 12000, ...o });
const all = Array.from({ length: 30 }, (_, i) => row(29 - i));
const none: DuellogSearch = { opp: '', result: '', from: '', to: '' };
const deps = () => {
  const loads: [DuellogSearch, number][] = [], opened: [string, boolean][] = [], played: string[] = []; let closed = 0, kept: CollectedLog[] = [];
  return { loads, opened, played, closed: () => closed, kept: () => kept, d: { load: (s: DuellogSearch, p: number) => { loads.push([{ ...s }, p]); }, close: () => { closed++; }, rerender: () => {},
    open: (u: string, dl: boolean) => { opened.push([u, dl]); }, play: (k: string) => { played.push(k); }, collection: { get: () => kept, set: (l: CollectedLog[]) => { kept = l; } } } };
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
    const q = duellogQuery(all, 'Alice', none, 1, 8);
    expect(q.stats).toEqual({ total: 30, wins: all.filter(x => x.result === 'win').length, losses: 8, draws: all.filter(x => x.result === 'draw').length });
    expect([q.page, q.pages, q.rows.length, q.matched]).toEqual([1, 4, 8, 30]);
    expect(duellogQuery(all, '', none, 9, 8).page).toBe(4);
    const o = duellogQuery(all, '', { ...none, opp: 'opp1' }, 1, 50);
    expect(o.matched).toBe(10); expect(o.rows.every(r => r.opponent === 'Opp1')).toBe(true);
    expect(duellogQuery(all, '', { ...none, result: 'lose' }, 1, 50).rows.every(r => r.result === 'lose')).toBe(true);
    const d = duellogQuery(all, '', { ...none, from: ymd(T0 + 20 * DAY), to: ymd(T0 + 21 * DAY) }, 1, 50);
    expect(d.rows.map(r => r.id)).toEqual([121, 120]);
  });
  it("top: live's four plates, the hovered plate's description in the box, Close; a plate opens its list", () => {
    const ui = duellogUi(); const t = deps();
    let top = duellogWindow(new Ids(), ui, t.d);
    expect(top.win.cls).toBe('CWindowModelDuellogTop');
    expect(['latest', 'server', 'collection', 'yoc'].map(s => ctl(top, `plate:${s}`)!.label)).toEqual(['Latest Duel Logs', 'Server Duel Logs', 'Duel Log Collection', 'YOC FINAL TOURNAMENT DUEL LOGS']);
    expect(ctl(top, 'help')!.items).toEqual([]);
    top.handlers.get(ctl(top, 'plate:latest')!.id)!.pointer!(true);
    top = duellogWindow(new Ids(), ui, t.d);
    expect((ctl(top, 'help')!.items as string[]).join(' ')).toContain('A Duel Log is saved automatically');
    expect(wrapLines(DUELLOG_TEXT.serverHelp, 50).every(l => l.length <= 50)).toBe(true);
    click(top, 'close'); expect(t.closed()).toBe(1);
    click(top, 'plate:server'); expect([ui.view, ui.source]).toEqual(['list', 'server']); expect(t.loads).toHaveLength(1);
  });
  it("Server Duel Logs: the archive rows; a row's menu: Play only for a record kept in this browser, Download, Add to Collection", () => {
    const ui = duellogUi(); ui.view = 'list'; ui.source = 'server'; ui.all = all; const t = deps();
    const first = all[0]!;
    ui.local = [{ key: 'k1', when: first.at + 40, names: ['Alice', String(first.opponent)] }];
    let list = duellogWindow(new Ids(), ui, t.d);
    expect(list.win.cls).toBe('CWindowModelDuellogList');
    expect(ctl(list, 'title')!.text).toBe('Server Duel Logs');
    expect((ctl(list, 'list')!.items as string[])[0]).toContain(`Alice vs ${first.opponent}`);
    expect((ctl(list, 'list')!.items as string[])).toHaveLength(20);
    list.handlers.get(ctl(list, 'list')!.id)!.click!([500, 158 + 56 + 4]); expect([ui.selected, ui.op]).toEqual([0, true]);
    list = duellogWindow(new Ids(), ui, t.d);
    click(list, 'op:download'); expect(t.opened.at(-1)).toEqual([`/api/de/replays/${first.id}`, true]);
    ui.op = true; list = duellogWindow(new Ids(), ui, t.d);
    click(list, 'op:add'); expect(t.kept()).toEqual([{ when: first.at, names: ['Alice', String(first.opponent)], local: 'k1', server: first.id, result: first.result }]);
    ui.op = true; list = duellogWindow(new Ids(), ui, t.d);
    expect(ctl(list, 'op:add')!.state).toBe('disabled');
    click(list, 'op:play'); expect(t.played).toEqual(['k1']);
    ui.selected = 1; ui.op = true; list = duellogWindow(new Ids(), ui, t.d);
    expect(ctl(list, 'op:play')!.state).toBe('disabled');
    // the second page by the wheel
    list.handlers.get(ctl(list, 'list')!.id)!.wheel!(1); expect(ui.page).toBe(2);
  });
  it("Latest Duel Logs: this browser's records; the Collection: Add Comment, Delete", () => {
    const ui = duellogUi(); ui.view = 'list'; ui.source = 'latest'; ui.all = []; const t = deps();
    ui.local = [{ key: 'k2', when: T0, names: ['Alice', 'Yami Yugi'] }];
    let list = duellogWindow(new Ids(), ui, t.d);
    expect((ctl(list, 'list')!.items as string[])[0]).toContain('Alice vs Yami Yugi');
    ui.selected = 0; ui.op = true; list = duellogWindow(new Ids(), ui, t.d);
    expect(ctl(list, 'op:download')).toBeUndefined();
    click(list, 'op:add'); expect(t.kept()[0]!.local).toBe('k2');
    ui.source = 'collection'; ui.selected = 0; ui.op = true; list = duellogWindow(new Ids(), ui, t.d);
    expect(ctl(list, 'title')!.text).toBe('Duel Log Collection');
    click(list, 'op:comment'); list = duellogWindow(new Ids(), ui, t.d);
    list.handlers.get(ctl(list, 'commentInput')!.id)!.text!('great duel');
    click(duellogWindow(new Ids(), ui, t.d), 'op:save'); expect(t.kept()[0]!.comment).toBe('great duel');
    expect((ctl(duellogWindow(new Ids(), ui, t.d), 'list')!.items as string[])[0]).toContain('"great duel"');
    ui.selected = 0; ui.op = true; click(duellogWindow(new Ids(), ui, t.d), 'op:delete'); expect(t.kept()).toEqual([]);
  });
  it('search: the opponent and a result; OK shows the list filtered', () => {
    const ui = duellogUi(); ui.view = 'list'; ui.source = 'server'; ui.all = all; const t = deps();
    click(duellogWindow(new Ids(), ui, t.d), 'search');
    let w = duellogWindow(new Ids(), ui, t.d);
    expect(w.win.cls).toBe('CWindowModelDuellogSearch');
    w.handlers.get(ctl(w, 'opp')!.id)!.text!('opp1');
    click(w, 'result:lose');
    click(duellogWindow(new Ids(), ui, t.d), 'run');
    expect(ui.view).toBe('list'); expect(ui.search).toEqual({ opp: 'opp1', result: 'lose', from: '', to: '' });
    const items = ctl(duellogWindow(new Ids(), ui, t.d), 'list')!.items as string[];
    expect(items.length).toBeGreaterThan(0); expect(items.every(l => l.includes('Opp1') && l.includes('Loss'))).toBe(true);
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
