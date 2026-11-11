// Duel Log (the Main Menu's: CWindowModelDuellogTop / List / Search): the character's duel history from GET
// /api/de/duellog (server/src/game/duellogList.ts: stats, a page, the search by opponent, result and date). main's
// Legacy look, the Main Menu's list windows' frame (windows.ts listWindow: the duel frame 62, 282, 900 x 204, the title
// 0, 4, the listbox 13, 32 of 8 rows, the duel buttons on 173). The original's replay entry (CWindowModelDuellogOperation's
// Play) needs a replay viewer the rewrite does not have (PARITY-GAPS.md). Pure but for fetchDuellog: no DOM.
import { REWRITE_TEXT } from '../../features/ui-text';
import { Ids, WindowBuilder } from './snapshot';
import type { WindowSpec } from './snapshot';

export type DuellogResult = 'win' | 'lose' | 'draw';
export interface DuellogRow { t: number; opp: string; opp_pid: number; result: DuellogResult; turns: number; ranked: boolean; origin: string; match: boolean }
export interface DuellogPage { you: string; stats: { total: number; wins: number; losses: number; draws: number }; matched: number; page: number; pages: number; per: number; rows: DuellogRow[] }
export interface DuellogSearch { opp: string; result: '' | DuellogResult; from: string; to: string }
export interface DuellogUi {
  view: 'top' | 'list' | 'search';
  page: number; selected: number;
  /** The search in force (the list's) and the one being typed in the Search window. */
  search: DuellogSearch; draft: DuellogSearch;
  data: DuellogPage | null; loading: boolean; error: string | null;
}
export const DUELLOG_ROWS = 8;
const emptySearch = (): DuellogSearch => ({ opp: '', result: '', from: '', to: '' });
export const duellogUi = (): DuellogUi => ({ view: 'top', page: 1, selected: -1, search: emptySearch(), draft: emptySearch(), data: null, loading: false, error: null });

export function duellogUrl(s: DuellogSearch, page: number, per = DUELLOG_ROWS): string {
  const q = new URLSearchParams();
  if (s.opp.trim()) q.set('opp', s.opp.trim());
  if (s.result) q.set('result', s.result);
  if (/^\d{4}-\d{2}-\d{2}$/.test(s.from)) q.set('from', s.from);
  if (/^\d{4}-\d{2}-\d{2}$/.test(s.to)) q.set('to', s.to);
  q.set('page', String(Math.max(1, page))); q.set('per', String(per));
  return `/api/de/duellog?${q}`;
}
const ERRORS: Record<string, string> = { 'not-in-game': 'Enter the game to see your Duel Log.', 'no-character': 'Choose a character to see its Duel Log.', 'signed out': 'Sign in to see your Duel Log.' };
export async function fetchDuellog(s: DuellogSearch, page: number, f: typeof fetch = globalThis.fetch): Promise<DuellogPage | { error: string }> {
  try {
    const r = await f(duellogUrl(s, page), { credentials: 'same-origin', cache: 'no-store' });
    const body = await r.json().catch(() => null) as (DuellogPage & { error?: string }) | null;
    if (!r.ok || !body || body.error) return { error: ERRORS[body?.error ?? ''] ?? 'The Duel Log could not be read.' };
    return body;
  } catch { return { error: 'The Duel Log could not be read.' }; }
}

const RESULT_TEXT: Record<DuellogResult, string> = { win: REWRITE_TEXT.win, lose: REWRITE_TEXT.loss, draw: REWRITE_TEXT.draw };
const pad2 = (n: number) => String(n).padStart(2, '0');
export function duellogDate(t: number): string { const d = new Date(t * 1000); return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())} ${pad2(d.getHours())}:${pad2(d.getMinutes())}`; }
const ORIGIN_TEXT: Record<string, string> = { autoduel: REWRITE_TEXT.autoduel, room: REWRITE_TEXT.duelRoom, invite: REWRITE_TEXT.invitation, tournament: REWRITE_TEXT.tournament };
export function duellogLine(r: DuellogRow): string {
  return `${duellogDate(r.t)}   vs ${r.opp}   ${RESULT_TEXT[r.result]}   ${r.turns} turn${r.turns === 1 ? '' : 's'}   ${ORIGIN_TEXT[r.origin] ?? r.origin}${r.ranked ? ' (Ranked)' : ''}${r.match ? ' · Match' : ''}`;
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
      text('note', 0, 128, 900, s.total ? '' : 'No duels yet. Your games against other duelists are kept here.', 1);
    }
    button('history', 125, 150, 'Duel History', 'duellog-history', s && s.total ? () => { ui.selected = -1; ui.view = 'list'; d.load(ui.search, 1); } : null);
    button('search', 300, 150, 'Search', 'duellog-search', s && s.total ? () => { ui.draft = { ...ui.search }; ui.view = 'search'; d.rerender(); } : null);
    button('close', 625, 100, 'Close', 'duellog-close', () => d.close());
    return b.spec();
  }
  if (ui.view === 'list') {
    const rows = ui.data?.rows ?? [];
    if (ui.selected >= rows.length) ui.selected = -1;
    const items = status ? [status] : rows.length ? rows.map((r, i) => `${i === ui.selected ? '> ' : ''}${duellogLine(r)}`) : ['No duels match the search.'];
    const list = b.add('CWindowTaskListbox', 'list', { x: 13, y: 32, w: 874, h: 128 }, { items, selected: ui.selected, top: 0, topLine: 0, rows: DUELLOG_ROWS });
    b.on(list, { label: 'Duel history', click: point => { if (!point || status) return; const i = Math.floor((point[1] - 282 - 32) / 16); if (i >= 0 && i < rows.length) { ui.selected = i; d.rerender(); } },
      wheel: delta => { const p = (ui.data?.page ?? 1) + (delta > 0 ? 1 : -1); if (ui.data && p >= 1 && p <= ui.data.pages && !ui.loading) { ui.selected = -1; d.load(ui.search, p); } } });
    const page = ui.data?.page ?? 1, pages = ui.data?.pages ?? 1;
    text('filter', 13, 164, 300, searchText(ui.search));
    text('page', 13, 180, 100, `Page ${page}/${pages}`);
    const turn = (p: number) => !ui.loading && ui.data && p >= 1 && p <= pages ? () => { ui.selected = -1; d.load(ui.search, p); } : null;
    button('prev', 125, 80, 'Back Page', 'duellog-prev', turn(page - 1));
    button('next', 215, 80, 'Next Page', 'duellog-next', turn(page + 1));
    button('search', 305, 100, 'Search', 'duellog-search', () => { ui.draft = { ...ui.search }; ui.view = 'search'; d.rerender(); });
    button('top', 415, 100, 'Back', 'duellog-back', () => { ui.view = 'top'; d.load(ui.search, 1); });
    button('close', 625, 100, 'Close', 'duellog-close', () => d.close());
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
    { label: r ? RESULT_TEXT[r] : 'All', align: 1, state: 'normal', checked: s.result === r, color: [0, 0, 0, 1] }, { key: `duellog-result:${r || 'all'}`, click: () => { s.result = r; d.rerender(); } }));
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
