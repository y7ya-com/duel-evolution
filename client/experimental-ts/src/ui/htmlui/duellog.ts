// Duel Log (the Main Menu's: CWindowModelDuellogTop / List / Search): the character's duel history from main's duel
// archive, GET /api/de/replays?limit= (server/src/duel/duelArchive.ts: every NPC duel and PvP game of the last 90 days,
// one source of truth with the /replays page). The stats, the search by opponent, result and date and the pages are
// computed here over that list. Each row: Download (its .yrpX, /api/de/replays/<id>) and Play (the duel record the
// server sent at its end, kept in this browser: services/duel-records.ts, replayed on the duel screen). main's Legacy
// look, the Main Menu's list windows' frame (windows.ts listWindow: the duel frame 62, 282, 900 x 204, the title 0, 4,
// the listbox 13, 32 of 8 rows, the duel buttons on 173). Pure but for fetchDuellog: no DOM.
import { REWRITE_TEXT } from '../../features/ui-text';
import { matchRecord } from '../../services/duel-records';
import { Ids, WindowBuilder } from './snapshot';
import type { WindowSpec } from './snapshot';

export type DuellogResult = 'win' | 'lose' | 'draw' | 'abandon';
/** One row of GET /api/de/replays (duelArchive.ts ReplayItem). */
export interface DuellogRow { id: number; at: number; kind: string; me: string | null; opponent: string | null; npc: number | null; game: number;
  result: DuellogResult | string; reason: string | null; turns: number; secs: number; bytes: number | null }
export interface DuellogPage { you: string; stats: { total: number; wins: number; losses: number; draws: number }; matched: number; page: number; pages: number; per: number; rows: DuellogRow[] }
export interface DuellogSearch { opp: string; result: '' | 'win' | 'lose' | 'draw'; from: string; to: string }
/** A duel record kept in this browser (what Play replays). */
export interface LocalRecord { key: string; when: number; names: [string, string] }
export interface DuellogUi {
  view: 'top' | 'list' | 'search';
  page: number; selected: number;
  /** The search in force (the list's) and the one being typed in the Search window. */
  search: DuellogSearch; draft: DuellogSearch;
  data: DuellogPage | null; loading: boolean; error: string | null;
  /** The archive as read (the whole list; the pages are cut from it), and this browser's records. */
  all: DuellogRow[] | null; local: LocalRecord[];
  /** The server ignored ?limit= and listed its default 100 (live's server, before REPLAYS_MAX): the stats and the search
   *  cover the latest 100 duels only, and the top view says so. */
  capped?: boolean;
}
export const DUELLOG_ROWS = 8;
/** The whole 90 days (duelArchive.ts REPLAYS_MAX). */
export const DUELLOG_LIMIT = 1000;
export const REPLAYS_PAGE = '/replays';
export const replayDownloadUrl = (id: number): string => `/api/de/replays/${id}`;
const emptySearch = (): DuellogSearch => ({ opp: '', result: '', from: '', to: '' });
export const duellogUi = (): DuellogUi => ({ view: 'top', page: 1, selected: -1, search: emptySearch(), draft: emptySearch(), data: null, loading: false, error: null, all: null, local: [] });

export const duellogUrl = (limit = DUELLOG_LIMIT): string => `/api/de/replays?limit=${limit}`;
const ERRORS: Record<string, string> = { 'no game account': 'Enter the game to see your Duel Log.', 'signed out': 'Sign in to see your Duel Log.', 'no database': 'The Duel Log is not available on this server.' };
/** The archive's list (newest first). */
export async function fetchDuellog(f: typeof fetch = globalThis.fetch): Promise<DuellogRow[] | { error: string }> {
  try {
    const r = await f(duellogUrl(), { credentials: 'same-origin', cache: 'no-store' });
    const body = await r.json().catch(() => null) as { replays?: DuellogRow[]; error?: string } | null;
    if (!r.ok || !body || body.error || !Array.isArray(body.replays)) return { error: ERRORS[body?.error ?? ''] ?? 'The Duel Log could not be read.' };
    return body.replays;
  } catch { return { error: 'The Duel Log could not be read.' }; }
}

/** A server's ?limit=-less default (duelArchive.ts listReplays): a list of exactly this many may be cut short. */
export const REPLAYS_DEFAULT = 100;
/** The archive's list and whether the server cut it at its default: a list of exactly REPLAYS_DEFAULT rows is asked
 *  again with ?limit=1, which a server honouring ?limit= answers with one row (so the 100 were all there is), and live's
 *  server, which ignores it, with its 100 again. */
export async function fetchDuellogFull(f: typeof fetch = globalThis.fetch): Promise<{ rows: DuellogRow[]; capped: boolean } | { error: string }> {
  const rows = await fetchDuellog(f);
  if ('error' in rows || rows.length !== REPLAYS_DEFAULT || DUELLOG_LIMIT <= REPLAYS_DEFAULT) return 'error' in rows ? rows : { rows, capped: false };
  try {
    const r = await f(duellogUrl(1), { credentials: 'same-origin', cache: 'no-store' });
    const body = await r.json().catch(() => null) as { replays?: unknown[] } | null;
    return { rows, capped: !!r.ok && Array.isArray(body?.replays) && body!.replays!.length > 1 };
  } catch { return { rows, capped: false }; }
}

const dayStart = (v: string, end: boolean): number | null => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v); if (!m) return null;
  const t = new Date(+m[1]!, +m[2]! - 1, +m[3]!).getTime() / 1000;   // the player's own day, as the list shows dates
  return end ? t + 86399 : t;
};
/** The stats (over everything), the search (opponent substring any case, result, a date range of local days) and a page. */
export function duellogQuery(all: readonly DuellogRow[], you: string, s: DuellogSearch, page: number, per = DUELLOG_ROWS): DuellogPage {
  const stats = { total: all.length, wins: 0, losses: 0, draws: 0 };
  for (const e of all) if (e.result === 'win') stats.wins++; else if (e.result === 'lose') stats.losses++; else if (e.result === 'draw') stats.draws++;
  const opp = s.opp.trim().toLowerCase(), from = dayStart(s.from, false), to = dayStart(s.to, true);
  const hits = all.filter(e => (!opp || String(e.opponent ?? '').toLowerCase().includes(opp)) && (!s.result || e.result === s.result)
    && (from === null || e.at >= from) && (to === null || e.at <= to));
  const pages = Math.max(1, Math.ceil(hits.length / per)), p = Math.min(pages, Math.max(1, Math.floor(page) || 1));
  return { you, stats, matched: hits.length, page: p, pages, per, rows: hits.slice((p - 1) * per, p * per) };
}

const RESULT_TEXT: Record<string, string> = { win: REWRITE_TEXT.win, lose: REWRITE_TEXT.loss, draw: REWRITE_TEXT.draw, abandon: 'Unfinished' };
const pad2 = (n: number) => String(n).padStart(2, '0');
export function duellogDate(t: number): string { const d = new Date(t * 1000); return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())} ${pad2(d.getHours())}:${pad2(d.getMinutes())}`; }
export function duellogLine(r: DuellogRow, local = false): string {
  return `${duellogDate(r.at)}   vs ${r.opponent ?? 'Duelist'}   ${RESULT_TEXT[r.result] ?? r.result}   ${r.turns} turn${r.turns === 1 ? '' : 's'}   ${r.kind === 'npc' ? 'NPC Duel' : 'Duel'}${r.game > 1 ? ` · Game ${r.game}` : ''}${local ? '   ▶' : ''}`;
}
export function searchText(s: DuellogSearch): string {
  const parts = [s.opp.trim() && `opponent "${s.opp.trim()}"`, s.result && RESULT_TEXT[s.result], s.from && `from ${s.from}`, s.to && `to ${s.to}`].filter(Boolean);
  return parts.length ? `Search: ${parts.join(', ')}` : 'All duels';
}

export interface DuellogDeps {
  /** Ask for page `page` of `search` (the caller fetches and sets ui.data / ui.loading / ui.error, then rerenders). */
  load(search: DuellogSearch, page: number): void;
  close(): void;
  rerender(): void;
  /** Download a row's .yrpX / open main's /replays page. */
  open(url: string, download: boolean): void;
  /** Replay a duel record kept in this browser on the duel screen. */
  play(key: string): void;
}

export function duellogWindow(ids: Ids, ui: DuellogUi, d: DuellogDeps): WindowSpec {
  const cls = { top: 'CWindowModelDuellogTop', list: 'CWindowModelDuellogList', search: 'CWindowModelDuellogSearch' }[ui.view];
  const b = new WindowBuilder(ids, `duellog:${ui.view}`, cls, { x: 62, y: 282, w: 900, h: 204 }, { z: 51453, modal: true });
  b.add('CWindowTaskFrameDuel', 'frame', { x: 0, y: 0, w: 0, h: 0 });
  const title = { top: 'Duel Log', list: 'Duel Log: History', search: 'Duel Log: Search' }[ui.view];
  b.add('CWindowTaskShadowText', 'title', { x: 0, y: 4, w: 900, h: 16 }, { text: title, align: 1, fontSize: 16, color: [1, 1, 1, 1] });
  const text = (name: string, x: number, y: number, w: number, t: string, align = 0) => b.add('CWindowTaskShadowText', name, { x, y, w, h: 16 }, { text: t, align, fontSize: 16, color: [1, 1, 1, 1] });
  const button = (name: string, x: number, w: number, label: string, key: string, run: (() => void) | null, y = 173) =>
    b.add('CWindowTaskButtonDuel', name, { x, y, w, h: 24 }, { label, align: 1, state: run ? 'normal' : 'disabled', color: [0, 0, 0, 1] }, { key, click: () => run?.() });
  const status = ui.loading ? 'Reading the Duel Log…' : ui.error;
  if (ui.view === 'top') {
    const s = ui.data?.stats;
    if (status) text('status', 0, 80, 900, status, 1);
    else if (s) {
      const decided = s.wins + s.losses, rate = decided ? Math.round(s.wins / decided * 100) : 0;
      text('duelist', 0, 40, 900, ui.data!.you ? `Duelist: ${ui.data!.you}` : '', 1);
      text('stats', 0, 72, 900, `Duels: ${s.total}     Wins: ${s.wins}     Losses: ${s.losses}     Draws: ${s.draws}`, 1);
      text('rate', 0, 96, 900, `Win rate: ${rate}%`, 1);
      text('note', 0, 128, 900, s.total ? `${ui.capped ? `Your latest ${REPLAYS_DEFAULT} duels.` : 'Duels of the last 90 days.'} ▶ = saved in this browser: Play replays it.` : 'No duels yet. Your duels of the last 90 days are kept here.', 1);
    }
    button('history', 125, 150, 'Duel History', 'duellog-history', s && s.total ? () => { ui.selected = -1; ui.view = 'list'; d.load(ui.search, 1); } : null);
    button('search', 300, 150, 'Search', 'duellog-search', s && s.total ? () => { ui.draft = { ...ui.search }; ui.view = 'search'; d.rerender(); } : null);
    button('replays', 465, 150, 'All Replays', 'duellog-replays', () => d.open(REPLAYS_PAGE, false));
    button('close', 625, 100, 'Close', 'duellog-close', () => d.close());
    return b.spec();
  }
  if (ui.view === 'list') {
    const rows = ui.data?.rows ?? [];
    if (ui.selected >= rows.length) ui.selected = -1;
    const saved = rows.map(r => matchRecord(r, ui.local));
    const items = status ? [status] : rows.length ? rows.map((r, i) => `${i === ui.selected ? '> ' : ''}${duellogLine(r, !!saved[i])}`) : ['No duels match the search.'];
    const list = b.add('CWindowTaskListbox', 'list', { x: 13, y: 32, w: 874, h: 128 }, { items, selected: ui.selected, top: 0, topLine: 0, rows: DUELLOG_ROWS });
    b.on(list, { label: 'Duel history', click: point => { if (!point || status) return; const i = Math.floor((point[1] - 282 - 32) / 16); if (i >= 0 && i < rows.length) { ui.selected = i; d.rerender(); } },
      wheel: delta => { const p = (ui.data?.page ?? 1) + (delta > 0 ? 1 : -1); if (ui.data && p >= 1 && p <= ui.data.pages && !ui.loading) { ui.selected = -1; d.load(ui.search, p); } } });
    const page = ui.data?.page ?? 1, pages = ui.data?.pages ?? 1;
    text('filter', 13, 164, 300, searchText(ui.search));
    text('page', 13, 180, 100, `Page ${page}/${pages}`);
    const turn = (p: number) => !ui.loading && ui.data && p >= 1 && p <= pages ? () => { ui.selected = -1; d.load(ui.search, p); } : null;
    const row = ui.selected >= 0 ? rows[ui.selected] : undefined, rec = ui.selected >= 0 ? saved[ui.selected] : null;
    button('prev', 125, 70, 'Back Page', 'duellog-prev', turn(page - 1));
    button('next', 200, 70, 'Next Page', 'duellog-next', turn(page + 1));
    button('search', 275, 80, 'Search', 'duellog-search', () => { ui.draft = { ...ui.search }; ui.view = 'search'; d.rerender(); });
    button('play', 360, 80, 'Play', 'duellog-play', rec ? () => d.play(rec.key) : null);
    button('download', 445, 90, 'Download', 'duellog-download', row ? () => d.open(replayDownloadUrl(row.id), true) : null);
    button('top', 540, 80, 'Back', 'duellog-back', () => { ui.view = 'top'; d.load(ui.search, 1); });
    button('close', 625, 100, 'Close', 'duellog-close', () => d.close());
    if (row && !rec) text('playHint', 380, 196, 500, 'Play: only duels saved in this browser (Download works for all).');
    return b.spec();
  }
  // search: the opponent's name, the result, a date range (YYYY-MM-DD)
  const s = ui.draft;
  const input = (name: string, x: number, y: number, w: number, value: string, maxLen: number, label: string, set: (v: string) => void, focused = false) =>
    b.add('CWindowTaskInput', name, { x, y, w, h: 24 }, { value, focused, password: false, caret: null, caretOn: false, maxLen, multiLine: false },
      { key: `duellog-${name}`, label, text: v => { set(v); d.rerender(); }, enter: run });
  const run = () => { ui.search = { ...ui.draft, opp: ui.draft.opp.trim() }; ui.selected = -1; ui.view = 'list'; d.load(ui.search, 1); };
  text('oppLabel', 40, 40, 160, 'Opponent'); input('opp', 200, 36, 300, s.opp, 16, 'Opponent name', v => { s.opp = v; }, true);
  text('resultLabel', 40, 76, 160, 'Result');
  (['', 'win', 'lose', 'draw'] as const).forEach((r, i) => b.add('CWindowTaskTextSwitch', `result:${r || 'all'}`, { x: 200 + 100 * i, y: 72, w: 92, h: 24 },
    { label: r ? RESULT_TEXT[r]! : 'All', align: 1, state: 'normal', checked: s.result === r, color: [0, 0, 0, 1] }, { key: `duellog-result:${r || 'all'}`, click: () => { s.result = r; d.rerender(); } }));
  text('fromLabel', 40, 112, 160, 'From (YYYY-MM-DD)'); input('from', 200, 108, 140, s.from, 10, 'From date', v => { s.from = v; });
  text('toLabel', 360, 112, 40, 'To'); input('to', 400, 108, 140, s.to, 10, 'To date', v => { s.to = v; });
  const bad = [s.from, s.to].some(v => v !== '' && !/^\d{4}-\d{2}-\d{2}$/.test(v));
  if (bad) text('dateHint', 560, 112, 330, 'Dates are written YYYY-MM-DD.');
  button('run', 125, 100, 'Search', 'duellog-run', bad ? null : run);
  button('clear', 235, 100, 'Clear', 'duellog-clear', () => { ui.draft = emptySearch(); d.rerender(); });
  button('back', 415, 100, 'Back', 'duellog-back', () => { ui.view = 'top'; d.load(ui.search, 1); });
  button('close', 625, 100, 'Close', 'duellog-close', () => d.close());
  return b.spec();
}

/** The replay's controls over the duel screen (the Duel Log's Play), the duel buttons of the Legacy look: Play/Pause,
 *  Step, Exit, the commands played of all. The duel speed's own switch (duel-dialogs.ts) paces it. */
export interface ReplayControls { names: [string, string]; when: number; index: number; total: number; playing: boolean }
export function replayWindow(ids: Ids, r: ReplayControls, act: (action: 'toggle' | 'step' | 'exit') => void): WindowSpec {
  const W = 420, H = 52, b = new WindowBuilder(ids, 'replay', 'CWindowReplayControl', { x: (1024 - W) / 2, y: 4, w: W, h: H }, { z: 51110 });
  b.add('CWindowTaskFrameDuel', 'frame', { x: 0, y: 0, w: 0, h: 0 });
  const done = r.index >= r.total;
  b.add('CWindowTaskShadowText', 'title', { x: 0, y: 4, w: W, h: 16 }, { text: `Replay: ${r.names[0]} vs ${r.names[1]}   ${r.index}/${r.total}${done ? '   (end)' : ''}`, align: 1, fontSize: 16, color: [1, 1, 1, 1] });
  const button = (name: string, x: number, w: number, label: string, action: 'toggle' | 'step' | 'exit', on: boolean) =>
    b.add('CWindowTaskButtonDuel', name, { x, y: 24, w, h: 24 }, { label, align: 1, state: on ? 'normal' : 'disabled', color: [0, 0, 0, 1] }, { key: `replay-${name}`, click: () => { if (on) act(action); } });
  button('toggle', 40, 100, r.playing ? 'Pause' : 'Play', 'toggle', !done);
  button('step', 160, 100, 'Step', 'step', !done);
  button('exit', 280, 100, 'Exit', 'exit', true);
  return b.spec();
}
