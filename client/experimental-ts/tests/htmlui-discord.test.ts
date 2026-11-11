import { describe, expect, it } from 'vitest';
import { afterTry, autoStep, capturePending, discordRows, duelLines, duelRules, finishPending, joinDuel, parseDiscordOnline, parseDuels, readPending, unseen, type FetchLike } from '../src/ui/htmlui/discord';
import { CHAT_TABS } from '../src/ui/htmlui/windows';

const mem = () => { const m = new Map<string, string>(); return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), removeItem: (k: string) => void m.delete(k) }; };
const res = (status: number, body: unknown): FetchLike => async () => ({ status, json: async () => body });
const duel = { id: 1001, pid: 7, name: 'Ann', lv: 12, match: true, timeLimit: true, surrender: false, spectators: true, at: 1, free: false, mine: false };

describe('htmlui Discord: Duels tab', () => {
  it('has a Duels chat tab after Team', () => { expect(CHAT_TABS.map(t => t.key)).toEqual(['all', 'trade', 'team', 'duels']); expect(CHAT_TABS[3]!.shows('global')).toBe(false); });
  it('describes the rules as main does', () => {
    expect(duelRules(duel)).toBe('Match (best of 3) · time limit · spectators');
    expect(duelRules({ match: false, timeLimit: false, spectators: false, surrender: true })).toBe('Single · surrender');
  });
  it('parses the server list and counts unseen', () => {
    const p = parseDuels({ you: 9, duels: [duel, { ...duel, id: 1002, mine: true }, { id: 0 }] })!;
    expect(p.you).toBe(9); expect(p.duels.map(d => d.id)).toEqual([1001, 1002]);
    expect(unseen(p.duels, new Set())).toBe(1); expect(unseen(p.duels, new Set([1001]))).toBe(0);
    expect(parseDuels({})).toBeNull();
    expect(duelLines(p.duels)[0]).toContain('[Join]'); expect(duelLines(p.duels)[1]).toContain('(yours)');
    expect(duelLines([])[0]).toContain('No open duels');
  });
  it('joins: the server check, then a challenge to the creator', async () => {
    const sent: number[] = [];
    const ok = await joinDuel(res(200, { ok: true, name: 'Ann' }), 1001, n => (n === 'Ann' ? 7 : null), p => sent.push(p));
    expect(ok).toEqual({ ok: true, name: 'Ann' }); expect(sent).toEqual([7]);
    const gone = await joinDuel(res(409, { error: 'gone', message: 'That duel is closed.' }), 1001, () => 7, p => sent.push(p));
    expect(gone).toEqual({ ok: false, error: 'gone', message: 'That duel is closed.' });
    const absent = await joinDuel(res(200, { ok: true, name: 'Bob' }), 1001, () => null, p => sent.push(p));
    expect(absent.ok).toBe(false); expect(sent).toEqual([7]);
    const net = await joinDuel(async () => { throw new Error('x'); }, 1, () => 1, () => {});
    expect(net).toMatchObject({ ok: false, error: 'net' });
  });
});

describe('htmlui Discord: ?duel= deeplink', () => {
  it('keeps the id, expires it, and never repeats a done one', () => {
    const s = mem();
    expect(capturePending('?online=1&duel=1001', s, 0)).toBe(1001);
    expect(readPending(s, 1000)).toBe(1001);
    expect(readPending(s, 11 * 60000)).toBeNull();
    capturePending('?duel=1001', s, 0); finishPending(1001, s);
    expect(readPending(s, 0)).toBeNull(); expect(capturePending('?duel=1001', s, 0)).toBeNull();
    expect(capturePending('?duel=abc', s, 0)).toBeNull();
  });
  it('joins once in the world, retries, stops on a final refusal', () => {
    const s = mem();
    expect(autoStep({ inWorld: false, now: 0, pending: 5, run: {} })).toBeNull();
    expect(autoStep({ inWorld: true, now: 0, pending: 5, run: {} })).toEqual({ join: 5 });
    let run = afterTry({ t0: 0 }, 5, { ok: false, error: 'absent', message: '' }, 1000, s);
    expect(run.next).toBe(6000);
    expect(autoStep({ inWorld: true, now: 2000, pending: 5, run })).toBeNull();
    run = afterTry(run, 5, { ok: false, error: 'gone', message: '' }, 7000, s);
    expect(run.done).toBe(5); expect(autoStep({ inWorld: true, now: 9000, pending: 5, run })).toBeNull();
    expect(afterTry({ t0: 0 }, 6, { ok: false, error: 'absent', message: '' }, 61000, s).done).toBe(6);
  });
});

describe('htmlui Discord: Players window rows', () => {
  it('parses /api/de/discord-online and skips players in the game', () => {
    const ps = parseDiscordOnline({ players: [{ pid: 3, name: 'Cy', lv: 20, rank: { label: 'Gold II' }, parts: [1, 2, 300] }, { pid: 4, name: 'Ann', lv: 1, rank: null, parts: [] }, { pid: 0 }] });
    expect(ps).toHaveLength(2); expect(ps[0]!.parts).toHaveLength(16); expect(ps[0]!.parts[2]).toBe(300 & 255);
    const rows = discordRows(ps, [{ id: 9, name: 'ann' }]);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ pid: 3, item: '@0@>40/Cy (Discord)', lv: 'LV 20', rank: 'Gold II', discord: true });
    expect(parseDiscordOnline({})).toEqual([]);
  });
});
