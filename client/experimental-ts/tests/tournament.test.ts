import { afterEach, describe, expect, it, vi } from 'vitest';
import { Tournaments } from '../../../server/src/game/tournaments';
import { TM, TOUR_STATE, TOURNAMENT_REQUESTS, decodeAutoDuel, decodeEventInfo, emptyTournament, isTournamentMessage, reduceTournament } from '../src/network/tournament';
import type { TournamentState } from '../src/network/tournament';
import { Ids } from '../src/ui/htmlui/snapshot';
import { bracketRows, bracketWindow, duelHelpStrip, eventLines, informationWindow, joinGunslingWindow, resultWindow, tournamentUi } from '../src/ui/htmlui/tournament';

// A fake lobby connection and game: just what tournaments.ts touches.
type Sent = [number, Uint8Array];
function conn(pid: number, name: string) {
  const sent: Sent[] = [];
  const c = { closed: false, sess: { pid, name, slot: 0 }, post: (m: number, d: Uint8Array) => sent.push([m, d]), send: (m: number, d: Uint8Array) => sent.push([m, d]) };
  return { c, sent };
}
function game(now: { t: number }) {
  return { clock: { time: () => now.t }, hub: { byPid: () => null, sessions: new Map() }, world: { run: (f: () => void) => f() },
    ports: { duel: 10000 }, cfg: { portOffset: 0, publicIp: '127.0.0.1' }, pvp: null, withCtx: () => new Uint8Array(16), duelParts: () => new Uint8Array(16) };
}
const fold = (sent: Sent[], from = emptyTournament()): TournamentState => sent.reduce((t, [m, d]) => isTournamentMessage(m) ? reduceTournament(t, m, d, 0) : t, from);
const tms: Tournaments[] = [];
afterEach(() => { for (const tm of tms) clearInterval((tm as unknown as { clockT: ReturnType<typeof setInterval> }).clockT); tms.length = 0; vi.useRealTimers(); });

describe('tournament protocol (server tournaments.ts encoders)', () => {
  it('decodes the idle answers to every request', () => {
    const now = { t: 0 }, tm = new Tournaments(game(now) as never), a = conn(1, 'Alice');
    for (const id of TOURNAMENT_REQUESTS) tm.handlers.get(id)?.(a.c as never, id);
    const t = fold(a.sent);
    expect(t.state).toBe(TOUR_STATE.STANDBY); expect(t.running).toBe(false); expect(t.entryList).toEqual([]); expect(t.bracket).toEqual([]);
  });
  it('follows a two-player tournament from entry to the end result', () => {
    const now = { t: 0 }, tm = new Tournaments(game(now) as never); tms.push(tm);
    const a = conn(1, 'Alice'), b = conn(2, 'Bob');
    tm.handlers.get(TM.STATUS)!(a.c as never, TM.STATUS); tm.handlers.get(TM.STATUS)!(b.c as never, TM.STATUS);
    tm.startTournament(7, 1, 'CHAMPIONSHIP', 8);
    let t = fold(a.sent);
    expect(t).toMatchObject({ serial: 7, name: 'CHAMPIONSHIP', maxPlayers: 8, state: TOUR_STATE.ENTRY, running: true, entries: 2, alive: 2, seconds: 120 });
    expect(t.entryList.map(e => e.name)).toEqual(['Alice', 'Bob']);
    expect(t.bracket.map(s => [s.pid, s.alive, s.playing])).toEqual([[1, true, false], [2, true, false]]);
    expect(bracketRows(t, 1)[0]).toContain('Alice (you)');
    a.sent.length = 0;
    tm.tick(200); tm.tick(400);   // the draw, then round 1 pairs Alice and Bob
    const pairing = a.sent.find(([m]) => m === TM.AUTODUELSTART)!;
    expect(pairing[1].length).toBe(42); expect(decodeAutoDuel(pairing[1])).toMatchObject({ pid: 2, name: 'Bob', mode: 3 });
    t = fold(a.sent, t);
    expect(t.drawn).toBe(true); expect(t.round).toBe(1); expect(t.state).toBe(TOUR_STATE.ROUND); expect(t.bracket.every(s => s.playing)).toBe(true);
    const rec = [...tm.tour!.matches.values()][0];
    tm.report(rec, 1); now.t = 1000; tm.tick(1000);
    t = fold(a.sent, t);
    expect(t.state).toBe(TOUR_STATE.END); expect(t.running).toBe(false);
    expect(t.result).toMatchObject({ serial: 7, name: 'CHAMPIONSHIP', champion: 'Alice', runnerUp: 'Bob', entries: 2, rounds: 1 });
    expect(t.bracket.find(s => s.pid === 2)!.alive).toBe(false);
  });
  it('reads EVENTINFO (serial, world, state)', () => {
    const now = { t: 0 }, tm = new Tournaments(game(now) as never), a = conn(1, 'Alice');
    expect(tm.pushEvent(2, 6, 3, [a.c as never])).toBe(1);
    const [id, data] = a.sent[0]; expect(id).toBe(TM.EVENTINFO);
    expect(decodeEventInfo(data)).toEqual({ serial: 3, world: 6, state: 2 });
  });
});

describe('tournament windows (Legacy look)', () => {
  const t: TournamentState = { ...emptyTournament(), name: 'CHAMPIONSHIP', state: TOUR_STATE.ENTRY, running: true, entryList: [{ pid: 1, name: 'Alice', wins: 0, playing: false }] };
  it('JoinGunsling is the captured box and Join enters', () => {
    const join = vi.fn(), spec = joinGunslingWindow(new Ids(), t, { join, cancel: () => {} });
    expect(spec.win).toMatchObject({ cls: 'CWindowModelJoinGunsling', x: 352, y: 264, w: 320, h: 200 });
    const btn = spec.win.controls.find(c => c.name === 'join')!; spec.handlers.get(btn.id)!.click!(null as never); expect(join).toHaveBeenCalled();
  });
  it('the bracket lists the seats, the result and the event lines', () => {
    const spec = bracketWindow(new Ids(), tournamentUi(), t, { selfPid: 1, refresh() {}, close() {}, rerender() {}, now: 0 });
    expect(spec.win.controls.find(c => c.name === 'list')!.items).toEqual([' 1. Alice (you)   Wins 0   Waiting']);
    expect(resultWindow(new Ids(), t, () => {})).toBeNull();
    const done = { ...t, result: { serial: 1, name: 'CHAMPIONSHIP', day: 1, entries: 2, rounds: 1, champion: 'Alice', runnerUp: 'Bob' } };
    expect(String(resultWindow(new Ids(), done, () => {})!.win.controls.find(c => c.name === 'text')!.text)).toContain('Champion: Alice');
    expect(eventLines({ serial: 3, world: 6, state: 2 }, null)).toEqual(['Event 3', 'World 6', 'State 2']);
    expect(informationWindow(new Ids(), { serial: 3, world: 6, state: 2 }, t, () => {}).win.cls).toBe('CWindowModelInformation');
  });
  it('the duel help strip shows the prompt line', () => {
    expect(duelHelpStrip(new Ids(), '')).toBeNull();
    expect(duelHelpStrip(new Ids(), 'Select a card.\nmore')!.win.controls.find(c => c.cls === 'CWindowTaskHelp')!.text).toBe('Select a card.');
  });
});
