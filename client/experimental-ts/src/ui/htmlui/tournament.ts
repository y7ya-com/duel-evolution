// Tournaments, the event window and the duel help strip, in main's Legacy look. Pure: no DOM.
//  - JoinGunsling (CWindowModelJoinGunsling, main's dialog.js; mock/dialog-gunsling.json: 352, 264, 320 x 200, the duel
//    frame, 'Gunslinger Event' 0, 5, the question 24, 64, Join 48, 164 and Cancel 176, 164, 96 x 24). Join asks the
//    server (STATUS / REQENTRY: the server enters the player while its entry is open).
//  - The bracket (the tournament scene's board; the original drew it as a picture: here main's list window, the duel
//    frame, the title 0, 4, a listbox of the seats 13, 32, the status lines and the duel buttons, as Change Title's).
//  - The end result (CWindowModelAboutEvent: an OK dialog, dialog.js's bottom-thick frame) with the champion.
//  - The event window (CWindowModelInformation, dialog.js: the icon bar, the chop, the list 8, 24, the × at w - 19).
//  - The duel help strip (CWindowModelHelp, main's duel.js: a thin frame and a CWindowTaskHelp) with the current
//    prompt's text while the duel screen's own panel (not a dialog) asks.
import { wrapDialogText } from './dialog-text';
import type { EventInfo, TournamentState } from '../../network/tournament';
import { SUBTITLE_TEXT, TOUR_STATE, TOUR_STATE_TEXT, secondsLeft } from '../../network/tournament';
import { Ids, WindowBuilder } from './snapshot';
import type { WindowSpec } from './snapshot';

const WHITE = [1, 1, 1, 1], BLACK = [0, 0, 0, 1];
export interface TournamentUi { join: boolean; bracket: boolean; joined: boolean; resultSeen: unknown; eventSeen: string | null; top: number }
export function tournamentUi(): TournamentUi { return { join: false, bracket: false, joined: false, resultSeen: null, eventSeen: null, top: 0 }; }

export function joinGunslingWindow(ids: Ids, t: TournamentState | null, d: { join(): void; cancel(): void }): WindowSpec {
  const b = new WindowBuilder(ids, 'joingunsling', 'CWindowModelJoinGunsling', { x: 352, y: 264, w: 320, h: 200 }, { z: 51403, modal: true });
  b.add('CWindowTaskFrameDuel', 'frame', { x: 0, y: 0, w: 320, h: 200 });
  b.add('CWindowTaskShadowText', 'title', { x: 0, y: 5, w: 320, h: 16 }, { text: 'Gunslinger Event', align: 1, fontSize: 16, color: WHITE });
  const name = t?.name ? `${t.name}\n` : '';
  b.add('CWindowTaskShadowText', 'question', { x: 24, y: 64, w: 272, h: 48 }, { text: `${name}Join the Gunslinger Duel event?`, align: 1, fontSize: 16, color: BLACK });
  b.add('CWindowTaskButtonDuel', 'join', { x: 48, y: 164, w: 96, h: 24 }, { label: 'Join', align: 1, state: 'normal', color: BLACK }, { key: 'gunsling-join', click: () => d.join() });
  b.add('CWindowTaskButtonDuel', 'cancel', { x: 176, y: 164, w: 96, h: 24 }, { label: 'Cancel', align: 1, state: 'normal', color: BLACK }, { key: 'gunsling-cancel', click: () => d.cancel() });
  return b.spec();
}

/** The bracket's rows: each seat with its wins, in play or out (LIST), named from the entry list (ENTRY_DATA). */
export function bracketRows(t: TournamentState, selfPid: number | null = null): string[] {
  const names = new Map(t.entryList.map(e => [e.pid, e.name]));
  const seats = t.bracket.length ? t.bracket : t.entryList.map(e => ({ pid: e.pid, wins: e.wins, playing: e.playing, alive: true }));
  return seats.map((s, i) => {
    const name = names.get(s.pid) ?? `Duelist ${s.pid}`, mark = s.pid === selfPid ? ' (you)' : '';
    const state = s.playing ? 'Duelling' : !s.alive ? 'Out' : t.state === TOUR_STATE.END ? 'Champion' : 'Waiting';
    return `${String(i + 1).padStart(2, ' ')}. ${name}${mark}   Wins ${s.wins}   ${state}`;
  });
}
export function statusLine(t: TournamentState, now = Date.now()): string {
  const st = TOUR_STATE_TEXT[t.state] ?? `State ${t.state}`, sub = SUBTITLE_TEXT[t.subtitle] ?? '';
  const round = t.round ? `  Round ${t.round}${t.totalRounds ? ` of ${t.totalRounds}` : ''}${sub ? ` (${sub})` : ''}` : '';
  const left = t.seconds ? `  ${secondsLeft(t, now)} s` : '';
  return `${st}${round}${left}`;
}
export const BRACKET_ROWS = 10;
export function bracketWindow(ids: Ids, ui: TournamentUi, t: TournamentState, d: { selfPid: number | null; refresh(): void; close(): void; rerender(): void; now?: number }): WindowSpec {
  const b = new WindowBuilder(ids, 'tournament', 'CWindowModelTournament', { x: 212, y: 170, w: 600, h: 428 }, { z: 51453, modal: true });
  const rows = bracketRows(t, d.selfPid);
  ui.top = Math.max(0, Math.min(ui.top, rows.length - BRACKET_ROWS));
  b.add('CWindowTaskFrameDuel', 'frame', { x: 0, y: 0, w: 0, h: 0 });
  b.add('CWindowTaskShadowText', 'title', { x: 0, y: 4, w: 600, h: 16 }, { text: t.name || 'Tournament', align: 1, fontSize: 16, color: [0.2, 1, 0.2, 1] });
  const text = (name: string, y: number, s: string) => b.add('CWindowTaskText', name, { x: 16, y, w: 568, h: 16 }, { text: s, align: 0, fontSize: 16, color: WHITE });
  text('status', 32, statusLine(t, d.now));
  text('counts', 52, `Entries ${t.entries || t.entryList.length}${t.maxPlayers ? ` / ${t.maxPlayers}` : ''}   Remaining ${t.alive}   Watching ${t.audience}`);
  const list = b.add('CWindowTaskListbox', 'list', { x: 13, y: 76, w: 574, h: 16 * BRACKET_ROWS }, { items: rows, selected: -1, top: ui.top, topLine: ui.top, rows: BRACKET_ROWS });
  b.on(list, { label: 'Tournament bracket', wheel: delta => { ui.top = Math.max(0, Math.min(ui.top + (delta > 0 ? 1 : -1), rows.length - BRACKET_ROWS)); d.rerender(); } });
  const notice = t.opponent ? `Your opponent: ${t.opponent.name}. The duel is starting.` : t.walkover ? 'Your opponent did not come: you go through.'
    : t.drawn === false ? 'You were not drawn for this tournament.' : t.result ? `Champion: ${t.result.champion}${t.result.runnerUp ? `   Runner-up: ${t.result.runnerUp}` : ''}` : '';
  text('notice', 252, notice);
  const button = (name: string, x: number, label: string, key: string, run: () => void) =>
    b.add('CWindowTaskButtonDuel', name, { x, y: 396, w: 100, h: 24 }, { label, align: 1, state: 'normal', color: BLACK }, { key, click: run });
  button('refresh', 196, 'Refresh', 'tournament-refresh', () => d.refresh());
  button('close', 304, 'Close', 'tournament-close', () => d.close());
  return b.spec();
}

/** AboutEvent (an OK dialog: dialog.js's bottom-thick frame, band 32, the text field 8 in, OK centred). */
export function resultWindow(ids: Ids, t: TournamentState, ok: () => void): WindowSpec | null {
  const r = t.result; if (!r) return null;
  const b = new WindowBuilder(ids, 'aboutevent', 'CWindowModelAboutEvent', { x: 312, y: 304, w: 400, h: 160 }, { z: 51503, modal: true });
  b.add('CWindowTaskFrameBottomThick', 'frame', { x: 0, y: 0, w: 400, h: 160 }, { style: 1, band: 32 });
  const field = b.add('CWindowTaskTextField', 'text', { x: 8, y: 8, w: 384, h: 104 }, { text: wrapDialogText(`${r.name || 'Tournament'} is over.\nChampion: ${r.champion || '-'}\nRunner-up: ${r.runnerUp || '-'}\nEntries ${r.entries}, ${r.rounds} rounds`, 368),
    lines: [], align: 0, fontSize: 16, color: BLACK, firstLine: 0, pageLines: 6, lineGap: 0 });
  field.lines = String(field.text).split('\n');
  b.add('CWindowTaskTextSwitch', 'ok', { x: 160, y: 128, w: 80, h: 24 }, { label: 'OK', align: 1, state: 'normal', checked: false, color: BLACK }, { key: 'aboutevent-ok', click: ok });
  return b.spec();
}

export function eventKey(e: EventInfo): string { return `${e.serial}/${e.world}/${e.state}`; }
/** The event lines the window lists: the server sends only (serial, world, state), no texts (PARITY-GAPS.md). */
export function eventLines(e: EventInfo, t: TournamentState | null): string[] {
  const lines = [`Event ${e.serial}`, `World ${e.world}`, `State ${e.state}`];
  if (t?.running) lines.push(`${t.name || 'Tournament'}: ${TOUR_STATE_TEXT[t.state] ?? ''}`, 'Open the Main Menu\'s Tournament to take part.');
  return lines;
}
export function informationWindow(ids: Ids, e: EventInfo, t: TournamentState | null, close: () => void): WindowSpec {
  const lines = eventLines(e, t), w = 336, h = 24 + 16 * Math.max(4, lines.length) + 8;
  const b = new WindowBuilder(ids, 'information', 'CWindowModelInformation', { x: 1024 - w - 8, y: 64, w, h }, { z: 51303 });
  b.add('CWindowTaskIconbar', 'bar', { x: 0, y: 0, w, h: 20 }, { text: 'Information', align: 0, fontSize: 16, color: WHITE });
  b.add('CWindowTaskThinChop', 'chop', { x: 0, y: 20, w, h: h - 20 });
  b.add('CWindowTaskActiveListbox', 'list', { x: 8, y: 24, w: w - 16, h: 16 * Math.max(4, lines.length) }, { items: lines, selected: -1, top: 0, topLine: 0, rows: Math.max(4, lines.length) });
  b.add('CWindowTaskIconHide', 'close', { x: w - 19, y: 2, w: 16, h: 16 }, { pressed: false }, { key: 'information-close', label: 'Close the information', click: close });
  return b.spec();
}

/** CWindowModelHelp: the duel's thin-framed strip with the prompt's guidance (the duel screen's panel asks). */
export function duelHelpStrip(ids: Ids, text: string): WindowSpec | null {
  const line = text.split('\n')[0]?.trim(); if (!line) return null;
  const b = new WindowBuilder(ids, 'duelhelp', 'CWindowModelHelp', { x: 262, y: 6, w: 500, h: 32 }, { z: 51170 });
  b.add('CWindowTaskFrameThin', 'frame', { x: 0, y: 0, w: 500, h: 32 }, { style: 0 });
  b.add('CWindowTaskHelp', 'help', { x: 8, y: 8, w: 484, h: 16 }, { text: line, align: 1, fontSize: 16, color: BLACK });
  return b.spec();
}
