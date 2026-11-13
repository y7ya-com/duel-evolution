// Duel Log (the Main Menu's: CWindowModelDuellogTop / List / Operation / Search), live's flow: the top window's four
// plates (yo2text 5212 Latest Duel Logs, 5211 Server Duel Logs, 5213 Duel Log Collection, 5226 YOC FINAL TOURNAMENT
// DUEL LOGS) over the blue box that tells what the plate under the pointer holds (5221-5223), and Close. A plate opens
// its list (CWindowModelDuellogList: the title, the listbox, Search / Back / Close); a row opens the operation menu at
// it (CWindowModelDuellogOperation: Play, Add to Collection; in the Collection Play, Add Comment, Delete).
// Latest Duel Logs: the duel records this browser kept (services/duel-records.ts: live's client keeps its duellogs\
// folder, the newest 100). Server Duel Logs: main's duel archive, GET /api/de/replays?limit= (server/src/duel/
// duelArchive.ts: every NPC duel and PvP game of the last 90 days), each with its .yrpX (Download) and Play where this
// browser kept its record. Duel Log Collection: the logs the player kept, in this browser (localStorage). YOC: the
// 2008 finals' logs, none on this server. Layout from live's capture (the window 267, 158, 490 x 450). Pure but for
// fetchDuellog and the collection's storage: no DOM.
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
export type DuellogSource = 'latest' | 'server' | 'collection' | 'yoc';
/** A log kept in the Duel Log Collection (this browser): a local record's key and/or an archive row's id. */
export interface CollectedLog { when: number; names: [string, string]; local?: string; server?: number; result?: string; comment?: string }
export interface DuellogUi {
  /** The window shown; 'server', the top under Server Duel Logs' server list. */
  view: 'top' | 'list' | 'search' | 'server';
  /** The list open (the plate pressed) and the plate under the pointer on the top (its description). */
  source: DuellogSource; hover: DuellogSource | null;
  page: number; selected: number;
  /** The operation menu over the selected row; the comment being written (Add Comment). */
  op: boolean; comment: string | null;
  /** The search in force (the list's) and the one being typed in the Search window. */
  search: DuellogSearch; draft: DuellogSearch;
  data: DuellogPage | null; loading: boolean; error: string | null;
  /** The archive as read (the whole list), and this browser's records. */
  all: DuellogRow[] | null; local: LocalRecord[];
  /** The server ignored ?limit= and listed its default 100 (live's server, before REPLAYS_MAX). */
  capped?: boolean;
  /** A line under the list (Add to Collection's answer). */
  message?: string;
}
export const DUELLOG_ROWS = 20;
/** Live's client keeps the newest 100 duel logs (yo2text 5221). */
export const LATEST_KEEP = 100;
/** The whole 90 days (duelArchive.ts REPLAYS_MAX). */
export const DUELLOG_LIMIT = 1000;
export const replayDownloadUrl = (id: number): string => `/api/de/replays/${id}`;
const emptySearch = (): DuellogSearch => ({ opp: '', result: '', from: '', to: '' });
export const duellogUi = (): DuellogUi => ({ view: 'top', source: 'latest', hover: null, page: 1, selected: -1, op: false, comment: null, search: emptySearch(), draft: emptySearch(), data: null, loading: false, error: null, all: null, local: [] });

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
export function searchText(s: DuellogSearch): string {
  const parts = [s.opp.trim() && `opponent "${s.opp.trim()}"`, s.result && RESULT_TEXT[s.result], s.from && `from ${s.from}`, s.to && `to ${s.to}`].filter(Boolean);
  return parts.length ? `Search: ${parts.join(', ')}` : 'All duels';
}

export interface DuellogDeps {
  /** Read the archive and this browser's records (the caller sets ui.all / ui.local / ui.loading / ui.error, then rerenders). */
  load(search: DuellogSearch, page: number): void;
  close(): void;
  rerender(): void;
  /** Download a row's .yrpX. */
  open(url: string, download: boolean): void;
  /** Replay a duel record kept in this browser on the duel screen. */
  play(key: string): void;
  /** The Duel Log Collection's storage (default: this browser's localStorage). */
  collection?: { get(): CollectedLog[]; set(list: CollectedLog[]): void };
}

export const COLLECTION_KEY = 'de.duellog.collection';
export const localCollection = {
  get(): CollectedLog[] { try { const v = JSON.parse(globalThis.localStorage?.getItem(COLLECTION_KEY) ?? '[]'); return Array.isArray(v) ? v as CollectedLog[] : []; } catch { return []; } },
  set(list: CollectedLog[]): void { try { globalThis.localStorage?.setItem(COLLECTION_KEY, JSON.stringify(list)); } catch { /* storage off: the collection lives this page only */ } },
};

/** The original's texts (yo2text_e): the plates' names and what each list holds. */
export const DUELLOG_TEXT = {
  latest: 'Latest Duel Logs', server: 'Server Duel Logs', collection: 'Duel Log Collection', yoc: 'YOC FINAL TOURNAMENT DUEL LOGS',
  latestHelp: 'This is a list of logs that record every Duel you have played in this game.\nA Duel Log is saved automatically on to your computer after each Duel you play.\nYou can save up to 100 on to your PC and from the 101st onwards, the oldest Duel Log will be deleted to make space.\nIf you select a Log from the list and press the left mouse button, a menu will appear from which you can select the below options.\n"Play": Watch the selected Duel Log.\n"Add to Collection": Add the selected Duel Log to your personal "Duel Log Collection".',
  serverHelp: 'This is a list of logs that record every Duel you were allowed to watch.\nA log will be saved on to the server everytime a Duel is played.\nIf you select a Log from the list and press the left mouse button, a menu will appear from which you can select the below options.\n"Play": Watch the selected Duel Log.\n"Add to collection": Add the selected Duel Log to the "Duel Log Collection"',
  collectionHelp: 'This is a list of your favourite Duel Logs.\nYou can select Logs from "Latest Duel Logs" or "Server Duel Logs" and keep them here.\nIf you select a Log from the list and press the left mouse button, a menu will appear from which you can select the below options.\n"Play": Watch the selected Duel Log.\n"Add Comment": You can add personalized comments to Duel Logs. This will make them instantly distinguishable from the rest.\n"Delete": Delete the selected Duel Log.',
  yocHelp: 'The duel logs of the YOC finals. There are none on this server.',
  play: 'Play', add: 'Add to Collection', comment: 'Add Comment', del: 'Delete', download: 'Download',
} as const;
const HELP: Record<DuellogSource, string> = { latest: DUELLOG_TEXT.latestHelp, server: DUELLOG_TEXT.serverHelp, collection: DUELLOG_TEXT.collectionHelp, yoc: DUELLOG_TEXT.yocHelp };

/** Wrap text to lines of at most `n` characters (the blue box's width in Arial 16). */
export function wrapLines(text: string, n: number): string[] {
  const out: string[] = [];
  for (const para of text.split('\n')) {
    let line = '';
    for (const word of para.split(/\s+/).filter(Boolean)) {
      if (line && line.length + 1 + word.length > n) { out.push(line); line = word; } else line = line ? `${line} ${word}` : word;
    }
    out.push(line);
  }
  return out;
}

/** One row of a list: what it shows, what Play replays, what Download fetches. */
export interface DuellogEntry { line: string; when: number; names: [string, string]; local: string | null; server: number | null; result?: string; comment?: string; at: number }
const vs = (names: readonly string[]) => `${names[0] || 'Duelist'} vs ${names[1] || 'Duelist'}`;
/** The rows of a source (newest first), the search applied (opponent substring, result). */
export function duellogEntries(ui: DuellogUi, you: string, collection: readonly CollectedLog[]): DuellogEntry[] {
  const all = ui.all ?? [], s = ui.search, opp = s.opp.trim().toLowerCase();
  let rows: DuellogEntry[];
  if (ui.source === 'latest') {
    rows = ui.local.slice(0, LATEST_KEEP).map((r, i) => {
      const row = all.find(a => matchRecord(a, [r]) === r);
      return { line: `${duellogDate(r.when)}   ${vs(r.names)}${row ? `   ${RESULT_TEXT[row.result] ?? row.result}` : ''}`, when: r.when, names: r.names, local: r.key, server: row?.id ?? null, result: row?.result, at: i };
    });
  } else if (ui.source === 'server') {
    rows = all.map((r, i) => {
      const rec = matchRecord(r, ui.local);
      return { line: `${duellogDate(r.at)}   ${vs([r.me ?? you, r.opponent ?? ''])}   ${RESULT_TEXT[r.result] ?? r.result}   ${r.turns} turn${r.turns === 1 ? '' : 's'}${r.game > 1 ? `   Game ${r.game}` : ''}`,
        when: r.at, names: [r.me ?? you, r.opponent ?? 'Duelist'], local: rec?.key ?? null, server: r.id, result: r.result, at: i };
    });
  } else if (ui.source === 'collection') {
    rows = collection.map((c, i) => ({ line: `${duellogDate(c.when)}   ${vs(c.names)}${c.result ? `   ${RESULT_TEXT[c.result] ?? c.result}` : ''}${c.comment ? `   "${c.comment}"` : ''}`,
      when: c.when, names: c.names, local: c.local ?? null, server: c.server ?? null, result: c.result, comment: c.comment, at: i }));
  } else rows = [];
  return rows.filter(r => (!opp || r.names.some(n => n.toLowerCase().includes(opp))) && (!s.result || r.result === s.result));
}

const X = 266, Y = 158, W = 492, H = 452;
// live's list (CWindowModelDuellogList): a duel-style window 112, 229, 800 x 310: its title green in the well's dark
// header band, ten 16-pixel striped rows from 75, Card Search / Show all / Back (198 wide) at 278
const LX = 112, LY = 229, LW = 800, LH = 310, LROWS = 10;
const SHADOW = { dx: 1, dy: 1, color: [0, 0, 0, 1] };
/** Server Duel Logs' server list (live: a green-framed list of the game's languages over the top window, its close X):
 * the languages' servers, and World; this server keeps one archive, so each opens it. */
export const DUELLOG_SERVERS = ['Japanese', 'English', 'German', 'Italian', 'French', 'Spanish', 'Korean', 'World'] as const;
export function duellogServerPicker(ids: Ids, ui: DuellogUi, d: DuellogDeps): WindowSpec | null {
  if (ui.view !== 'server') return null;
  const open = (src: DuellogSource) => { ui.source = src; ui.view = 'list'; ui.selected = -1; ui.op = false; ui.page = 1; ui.message = undefined; ui.search = emptySearch(); d.load(ui.search, 1); };
  // live: 364, 178, a green frame under a lime header strip (its yellow close X at the right), a pale list well with a
  // pale scroll column at its right, eight grey rows 258 wide, 26 apart, their names white with a shadow (live's frame
  // holds seven: its "World" runs out under the frame, a bug not copied: the frame encloses the eight)
  const W2 = 298, H2 = 236, b = new WindowBuilder(ids, 'duellog:servers', 'CWindowModelDuellogServerSelect', { x: 364, y: 178, w: W2, h: H2 }, { z: 51503, modal: true, plain: { border: '#7be342', body: 'rgba(122,229,40,.9)', width: 3 } });
  const band = (name: string, x: number, y: number, w: number, h: number, css: string) => b.add('CWindowTaskBackPlane', name, { x, y, w, h }, { band: css });
  band('header', 0, 0, W2, 20, 'linear-gradient(#c9e9d1, #9de38e 30%, #7ae528)');
  band('wellEdge', 6, 20, W2 - 12, H2 - 26, 'rgb(121, 128, 123)');
  band('well', 7, 21, W2 - 14, H2 - 28, 'linear-gradient(rgb(150, 205, 236), rgb(176, 220, 242))');
  band('column', W2 - 26, 21, 18, H2 - 28, 'rgba(226, 236, 240, .75)');
  DUELLOG_SERVERS.forEach((name, i) => b.add('CWindowTaskButtonDuel', `server:${i}`, { x: 11, y: 21 + 26 * i, w: 258, h: 22 }, { label: name, align: 1, state: 'normal', color: [1, 1, 1, 1], light: true },
    { key: `duellog-server:${name}`, label: `${name} server`, click: () => open('server') }));
  b.add('CWindowTaskIconHide', 'close', { x: W2 - 24, y: 3, w: 15, h: 14 }, { pressed: false, label: '✕', closeX: true }, { key: 'duellog-server-close', label: 'Close', click: () => { ui.view = 'top'; d.rerender(); } });
  return b.spec();
}
// the plates' sprite (duel_btn_02_c01: the glossy plate, normal at 0, the pink pressed / chosen one at 32)
const PLATE = (y: number) => ({ tex: 'data/common/window/duel_btn_02_c01.png', src: [0, y, 224, 32] as [number, number, number, number] });
export function duellogWindow(ids: Ids, ui: DuellogUi, d: DuellogDeps): WindowSpec {
  const cls = { top: 'CWindowModelDuellogTop', list: 'CWindowModelDuellogList', search: 'CWindowModelDuellogSearch', server: 'CWindowModelDuellogTop' }[ui.view];
  const store = d.collection ?? localCollection;
  const rect = ui.view === 'search' ? { x: 312, y: 250, w: 400, h: 180 } : ui.view === 'list' ? { x: LX, y: LY, w: LW, h: LH } : { x: X, y: Y, w: W, h: H };
  const b = new WindowBuilder(ids, `duellog:${ui.view === 'server' ? 'top' : ui.view}`, cls, rect, { z: 51453, modal: true, ...(ui.view === 'top' || ui.view === 'server' ? { back: 'data/common/window/log_win_01_c01.png' } : {}) });
  if (ui.view !== 'top' && ui.view !== 'server') b.add('CWindowTaskFrameDuel', 'frame', { x: 0, y: 0, w: 0, h: 0 });
  const text = (name: string, x: number, y: number, w: number, t: string, align = 0) => b.add('CWindowTaskShadowText', name, { x, y, w, h: 16 }, { text: t, align, fontSize: 16, color: [1, 1, 1, 1] });
  const button = (name: string, x: number, w: number, label: string, key: string, run: (() => void) | null, y = 419) =>
    b.add('CWindowTaskButtonDuel', name, { x, y, w, h: 24 }, { label, align: 1, state: run ? 'normal' : 'disabled', color: [0, 0, 0, 1] }, { key, click: () => run?.() });
  const close = () => d.close();
  const open = (src: DuellogSource) => { ui.source = src; ui.view = 'list'; ui.selected = -1; ui.op = false; ui.page = 1; ui.message = undefined; ui.search = emptySearch(); d.load(ui.search, 1); };
  if (ui.view === 'top' || ui.view === 'server') {
    // live's top window (its own snapshot): log_win_01_c01 under four glossy plates (duel_btn_02_c01, 224 x 32 at 22 /
    // 246, 53 / 109), their white shadowed names centred over them (324 wide: YOC's runs past its plate), the plate
    // under the pointer's help in the blue box (30, 176, 424 x 208, scrolling), Close (176, 420, 140 wide)
    const plate = (src: DuellogSource, x: number, y: number) => {
      // Server Duel Logs asks which server first (live: the language list)
      const press = () => { if (src === 'server') { ui.view = 'server'; d.rerender(); } else open(src); };
      b.add('CWindowTaskPictureSwitch', `plate:${src}`, { x, y, w: 224, h: 32 }, { label: '', state: 'normal', enabled: true, checked: false, help: HELP[src],
        art: { normal: PLATE(0), hover: PLATE(0), pressed: PLATE(32), checked: PLATE(32) } }, { key: `duellog-${src}`, label: DUELLOG_TEXT[src], click: press });
      // YOC's name is longer than its plate (live lets it run out of the window: not copied): two lines on the plate
      if (src === 'yoc') (['YOC FINAL TOURNAMENT', 'DUEL LOGS'] as const).forEach((t, i) => b.add('CWindowTaskShadowText', `label:${src}:${i}`, { x, y: y + 2 + 14 * i, w: 224, h: 14 }, { text: t, align: 1, fontSize: 14, color: [1, 1, 1, 1], shadow: SHADOW }));
      else b.add('CWindowTaskShadowText', `label:${src}`, { x: x - 50, y: y + 8, w: 324, h: 16 }, { text: DUELLOG_TEXT[src], align: 1, fontSize: 16, color: [1, 1, 1, 1], shadow: SHADOW });
    };
    plate('latest', 22, 53); plate('server', 246, 53); plate('collection', 22, 109); plate('yoc', 246, 109);
    // the help of the plate the pointer was on last (it stays when the pointer leaves; behind the server list, Server Duel
    // Logs'), scrolled with the engine's scroll bar (white track and arrows) in the box's right column
    b.add('CWindowTaskShadowText', '説明', { x: 30, y: 176, w: 424, h: 208 }, { text: ui.view === 'server' ? HELP.server : '', align: 0, fontSize: 16, color: [1, 1, 1, 1], shadow: SHADOW, scroll: true, helpSlot: true,
      bar: { x: 455, y: 168, h: 232 } });
    button('close', 176, 140, 'Close', 'duellog-close', close, 420);
    return b.spec();
  }
  if (ui.view === 'list') {
    const status = ui.loading ? 'Reading the Duel Log…' : ui.source !== 'latest' && ui.source !== 'collection' ? ui.error : null;
    const collection = store.get();
    const rows = status ? [] : duellogEntries(ui, '', collection);
    const pages = Math.max(1, Math.ceil(rows.length / LROWS)), page = ui.page = Math.min(pages, Math.max(1, ui.page));
    const shown = rows.slice((page - 1) * LROWS, page * LROWS);
    if (ui.selected >= shown.length) { ui.selected = -1; ui.op = false; }
    // the title green in the well's dark header band (live), the rows striped, empty ones blank (no empty-state line)
    b.add('CWindowTaskBackPlane', 'header', { x: 13, y: 32, w: LW - 26, h: 43 }, { band: 'linear-gradient(#3f4366, #5d6283)' });
    b.add('CWindowTaskShadowText', 'title', { x: 0, y: 36, w: LW, h: 16 }, { text: DUELLOG_TEXT[ui.source], align: 1, fontSize: 16, color: [0.2, 1, 0.2, 1], shadow: SHADOW });
    const items = status ? [status] : shown.map(r => r.line);
    const list = b.add('CWindowTaskListbox', 'list', { x: 13, y: 75, w: LW - 26, h: 16 * LROWS }, { items, selected: ui.selected, top: 0, topLine: 0, rows: LROWS });
    // under the ten rows the well's grey foot (live), not more stripes
    b.add('CWindowTaskBackPlane', 'foot', { x: 13, y: 75 + 16 * LROWS, w: LW - 26, h: 33 }, { band: 'rgb(147, 162, 182)' });
    const turn = (p: number) => { if (p >= 1 && p <= pages && p !== page) { ui.page = p; ui.selected = -1; ui.op = false; d.rerender(); } };
    b.on(list, { label: DUELLOG_TEXT[ui.source], click: point => { if (!point || status) return; const i = Math.floor((point[1] - LY - 75) / 16); if (i >= 0 && i < shown.length) { ui.selected = i; ui.op = true; ui.comment = null; d.rerender(); } },
      wheel: delta => turn(page + (delta > 0 ? 1 : -1)) });
    if (ui.message) text('message', 13, 240, LW - 26, ui.message, 1);
    // Card Search (the logs whose duels used a card: here, the opponent and result the rewrite knows), Show all (the
    // search off), Back to the top
    button('search', 51, 198, 'Card Search', 'duellog-search', ui.source === 'yoc' ? null : () => { ui.draft = { ...ui.search }; ui.op = false; ui.view = 'search'; d.rerender(); }, 278);
    button('all', 301, 198, 'Show all', 'duellog-all', ui.search.opp || ui.search.result ? () => { ui.search = emptySearch(); ui.page = 1; ui.selected = -1; ui.op = false; d.rerender(); } : null, 278);
    button('back', 551, 198, 'Back', 'duellog-back', () => { ui.view = 'top'; ui.op = false; ui.selected = -1; ui.message = undefined; d.rerender(); }, 278);
    // the operation menu (CWindowModelDuellogOperation: the thin frame, its plane, a text switch per choice) at the row
    const row = ui.op && ui.selected >= 0 ? shown[ui.selected] : undefined;
    if (row) {
      const ops: [string, string, (() => void) | null][] = [];
      const done = (message?: string) => { ui.op = false; ui.comment = null; ui.message = message; d.rerender(); };
      ops.push(['play', DUELLOG_TEXT.play, row.local ? () => { ui.op = false; d.play(row.local!); } : null]);
      if (ui.source !== 'collection') {
        const kept = collection.some(c => (row.local && c.local === row.local) || (row.server !== null && c.server === row.server));
        ops.push(['add', DUELLOG_TEXT.add, kept ? null : () => { store.set([{ when: row.when, names: row.names, ...(row.local ? { local: row.local } : {}), ...(row.server !== null ? { server: row.server } : {}), ...(row.result ? { result: row.result } : {}) }, ...collection]); done('Added to the Duel Log Collection.'); }]);
      } else {
        ops.push(['comment', DUELLOG_TEXT.comment, () => { ui.comment = row.comment ?? ''; d.rerender(); }]);
        ops.push(['delete', DUELLOG_TEXT.del, () => { store.set(collection.filter((_, i) => i !== row.at)); ui.selected = -1; done(); }]);
      }
      if (row.server !== null) ops.push(['download', DUELLOG_TEXT.download, () => { ui.op = false; d.open(replayDownloadUrl(row.server!), true); d.rerender(); }]);
      ops.push(['cancel', 'Cancel', () => done()]);
      const ow = 200, editing = ui.comment !== null, oh = 8 + 28 * (editing ? 2 : ops.length);
      const ox = 300, oy = Math.min(LH - 40 - oh, 75 + 16 * ui.selected + 16);
      b.add('CWindowTaskFrameThin', 'opFrame', { x: ox, y: oy, w: ow, h: oh }, { style: 0 });
      b.add('CWindowTaskBackPlane', 'opPlane', { x: ox + 4, y: oy + 4, w: ow - 8, h: oh - 8 });
      if (editing) {
        b.add('CWindowTaskInput', 'commentInput', { x: ox + 8, y: oy + 6, w: ow - 16, h: 24 }, { value: ui.comment, focused: true, password: false, caret: null, caretOn: false, maxLen: 32, multiLine: false },
          { key: 'duellog-comment-input', label: 'Comment', text: v => { ui.comment = v; d.rerender(); }, enter: () => save() });
        const save = () => { store.set(collection.map((c, i) => i === row.at ? { ...c, comment: (ui.comment ?? '').trim() || undefined } : c)); done(); };
        b.add('CWindowTaskTextSwitch', 'op:save', { x: ox + 8, y: oy + 34, w: (ow - 24) / 2, h: 24 }, { label: 'OK', align: 1, state: 'normal', checked: false, color: [0, 0, 0, 1] }, { key: 'duellog-op-ok', click: save });
        b.add('CWindowTaskTextSwitch', 'op:back', { x: ox + 16 + (ow - 24) / 2, y: oy + 34, w: (ow - 24) / 2, h: 24 }, { label: 'Cancel', align: 1, state: 'normal', checked: false, color: [0, 0, 0, 1] }, { key: 'duellog-op-cancel', click: () => done() });
      } else ops.forEach(([name, label, run], i) => b.add('CWindowTaskTextSwitch', `op:${name}`, { x: ox + 8, y: oy + 6 + 28 * i, w: ow - 16, h: 24 },
        { label, align: 1, state: run ? 'normal' : 'disabled', checked: false, color: [0, 0, 0, 1] }, { key: `duellog-${name}`, click: () => run?.() }));
    }
    return b.spec();
  }
  // Search (CWindowModelDuellogSearch: the opponent's name, the result's three boxes, OK / Cancel)
  const s = ui.draft;
  text('title', 0, 4, 400, 'Search', 1);
  const run = () => { ui.search = { ...ui.draft, opp: ui.draft.opp.trim() }; ui.selected = -1; ui.page = 1; ui.view = 'list'; d.rerender(); };
  text('oppLabel', 30, 44, 120, 'Opponent');
  b.add('CWindowTaskInput', 'opp', { x: 120, y: 40, w: 250, h: 24 }, { value: s.opp, focused: true, password: false, caret: null, caretOn: false, maxLen: 16, multiLine: false },
    { key: 'duellog-opp', label: 'Opponent name', text: v => { s.opp = v; d.rerender(); }, enter: run });
  text('resultLabel', 30, 88, 120, 'Result');
  (['win', 'lose', 'draw'] as const).forEach((r, i) => b.add('CWindowTaskTextSwitch', `result:${r}`, { x: 120 + 85 * i, y: 84, w: 80, h: 24 },
    { label: RESULT_TEXT[r]!, align: 1, state: 'normal', checked: s.result === r, color: [0, 0, 0, 1] }, { key: `duellog-result:${r}`, click: () => { s.result = s.result === r ? '' : r; d.rerender(); } }));
  button('run', 60, 130, 'OK', 'duellog-run', run, 140);
  button('cancel', 210, 130, 'Cancel', 'duellog-cancel', () => { ui.view = 'list'; d.rerender(); }, 140);
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
