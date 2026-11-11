// The lobby's duel and move windows through main's screens (screens/duelsetup.js: the Duel menu, Auto Duel, Create
// Duel, the bar's Move list, the player list's search menu; screens/lobby.js: an NPC's card; screens/dialog.js: the
// prompts), built from main's captured windows (mock/duelsetup-*.json, lobby-npc.json, dialog-*.json) with the rewrite's
// lobby in them: its rooms, its matchmaking queue, its areas and NPCs. What a control does is a ClientApp command.
// Owned screens (duelsetup.js) take the pointer themselves, so a choice switch's look (normal / checked) is set here.
import type { ClientView } from '../contracts';
import { WindowBuilder } from './snapshot';
import type { HtmlControl, WindowSpec } from './snapshot';
import type { BuildContext } from './windows';
import duelMenuMock from '@htmlui/mock/duelsetup-menu.json';
import duelFindMock from '@htmlui/mock/duelsetup-find.json';
import duelWaitMock from '@htmlui/mock/duelsetup-wait.json';
import moveMock from '@htmlui/mock/duelsetup-move.json';
import findMenuMock from '@htmlui/mock/duelsetup-findmenu.json';
import playerListMock from '@htmlui/mock/duelsetup-plist.json';
import npcCardMock from '@htmlui/mock/lobby-npc.json';
import dialogInput1 from '@htmlui/mock/dialog-input1.json';
import dialogYesNo from '@htmlui/mock/dialog-yesno.json';

/** The original's words these windows say (yo2text_?), by text id; the rewrite's stand in without the original data. */
export const LOBBY_TEXT = { cancelRoom: 0x1484, seeking: 0x13cb, searching: 0xfbf, password: 0x13c3, noMove: 0x13e4 } as const;
const LOBBY_FALLBACK: Record<keyof typeof LOBBY_TEXT, string> = { cancelRoom: 'Close the duel you created?', seeking: 'Waiting for an opponent',
  searching: 'Searching for an opponent', password: 'Password', noMove: 'Close your duel before moving.' };
/** The areas' names (yo2text_?): Domino City's 0x1fa4.. (maps 0..3, then the R&D Lab, map 9), Duel Academy's 0x1fd6.. (4..7). */
export const AREA_TEXT: Record<number, number> = { 0: 0x1fa4, 1: 0x1fa5, 2: 0x1fa6, 3: 0x1fa7, 9: 0x1fa8, 4: 0x1fd6, 5: 0x1fd7, 6: 0x1fd8, 7: 0x1fd9 };

/** The player list's search (CFindMenu's rows, in order). */
export const SEARCHES = ['single', 'match', 'level', 'name', 'friends', 'near', 'all'] as const;
export type Search = typeof SEARCHES[number];
/** What the lobby's windows keep between snapshots (the engine's windows keep it themselves). */
export interface LobbyLocal {
  open: null | 'duel' | 'find' | 'wait' | 'move';
  /** The player list's search menu open; the search the list shows (null: the players here). */
  searching: boolean; search: Search | null;
  find: { style: 3 | 4 | 6; similar: boolean };
  wait: { style: 3 | 4; timeLimit: boolean; watch: boolean; surrender: boolean; password: string };
  /** The NPC whose card is open; a room's password prompt; the Duel key's "cancel the duel you created?". */
  npc: number | null; join: { roomId: number; password: string } | null; cancel: boolean;
  /** The Move list's first row shown. */
  moveTop: number;
}
export const lobbyLocal = (): LobbyLocal => ({ open: null, searching: false, search: null, find: { style: 3, similar: false },
  wait: { style: 3, timeLimit: true, watch: true, surrender: true, password: '' }, npc: null, join: null, cancel: false, moveTop: 0 });

export interface LobbyDeps {
  ui: LobbyLocal;
  /** The character's friends (the search's Search for Friends). */
  friends: readonly number[];
}

type Tmpl = { windows: { cls: string; x: number; y: number; w: number; h: number; controls: Record<string, unknown>[] }[] };
const start = (ctx: BuildContext, key: string, t: Tmpl, z: number, rect?: Partial<{ x: number; y: number; w: number; h: number }>, fields: Record<string, unknown> = {}) => {
  const w = t.windows[0]!, b = new WindowBuilder(ctx.ids, key, w.cls, { x: w.x, y: w.y, w: w.w, h: w.h, ...rect }, { z, modal: true, ...fields });
  return { b, cs: b.fromTemplate(w, true) };
};
const top = (c: HtmlControl) => !c.parent;
const say = (ctx: BuildContext, k: keyof typeof LOBBY_TEXT) => ctx.text?.(LOBBY_TEXT[k]) ?? LOBBY_FALLBACK[k];
/** A ShadowText's words (its own and its two drawn copies, the children). */
function words(cs: HtmlControl[], c: HtmlControl | undefined, text: string): void {
  if (!c) return; c.text = text;
  for (const k of cs) if (k.parent === c.id && 'text' in k) k.text = text;
}
/** A choice switch at rest: checked shows its checked sprite (duelsetup.js glow), else its normal one. */
function choice(c: HtmlControl | undefined, checked: boolean, enabled = true): HtmlControl | undefined {
  if (!c) return c;
  Object.assign(c, { checked, state: enabled ? 'normal' : 'disabled', enabled });
  const art = c.art as Record<string, { shown: boolean } | null> | undefined;
  if (art) for (const [k, v] of Object.entries(art)) if (v) v.shown = k === (checked ? 'checked' : 'normal');
  return c;
}
const byName = (cs: HtmlControl[], name: string, cls?: string) => cs.find(c => top(c) && c.name === name && (!cls || c.cls === cls));
const button = (cs: HtmlControl[], label: string) => cs.find(c => top(c) && c.cls === 'CWindowTaskButtonDuel' && c.label === label);

/** The rewrite's rooms as the Duel menu counts them: waiting (no opponent yet), duelling; the queue's searchers. */
export function duelCounts(state: ClientView): { auto: number; waiting: number; duelling: number } {
  const rooms = state.lobby?.rooms ?? [], q = state.matchmaking?.counts;
  return { auto: q ? q.single + q.match + q.either : 0, waiting: rooms.filter(r => !r.opponent).length, duelling: rooms.filter(r => !!r.opponent).length };
}
/** The duel this player created and waits in (a room of theirs), or the matchmaking queue it waits in. */
export const ownRoom = (state: ClientView) => state.player ? state.lobby?.rooms?.find(r => r.owner === state.player!.id) : undefined;
export const waiting = (state: ClientView) => !!ownRoom(state) || state.matchmaking?.status === 'searching';

// The Duel menu (CWindowModelDuel, mock/duelsetup-menu.json: 266, 276, 492 x 216): the three counts (Auto Duel,
// Create Duel, Duel (n.)), the two choice switches (Auto Duel 22, 128; Create Duel 246, 128), Cancel; main's
// duelsetup.js adds Tag Duel under the switches (its own control: yo2-tag-lobby-open, which the rewrite answers).
function duelMenu(ctx: BuildContext, deps: LobbyDeps): WindowSpec {
  const { b, cs } = start(ctx, 'duelmenu', duelMenuMock, 51403), ui = deps.ui, n = duelCounts(ctx.state);
  const shadows = cs.filter(c => top(c) && c.cls === 'CWindowTaskShadowText');
  ([[36, n.auto], [60, n.waiting], [84, n.duelling]] as const).forEach(([y, v]) => words(cs, shadows.find(c => c.x === 0 && c.y === y), String(v)));
  const close = () => { ui.open = null; ctx.rerender(); };
  const auto = choice(byName(cs, '自動で待つボタン'), false, !!ctx.state.matchmaking && !ctx.state.busy);
  if (auto) b.on(auto, { key: 'duel-auto', label: 'Auto Duel', click: () => { if (ctx.state.matchmaking) { ui.open = 'find'; ctx.rerender(); } } });
  const create = choice(byName(cs, '申し込みを待つボタン'), false, !ctx.state.busy);
  if (create) b.on(create, { key: 'duel-create', label: 'Create Duel', click: () => { ui.open = 'wait'; ctx.rerender(); } });
  const cancel = button(cs, 'Cancel'); if (cancel) b.on(cancel, { key: 'duel-cancel', click: close });
  return b.spec();
}

// Auto Duel (CWindowModelDuelFind, mock/duelsetup-find.json): Single Mode 22, 36 / Match Mode 246, 36 / Both 134, 76,
// Level Limit ON 22, 138 (制限なし: any level) / OFF 246, 138 (レベルの近い: a similar level), OK 50, 184 / Cancel 299, 184.
// The rewrite's server pairs single duels only (its queue's matchSupported): Match Mode stays off.
function findWindow(ctx: BuildContext, deps: LobbyDeps): WindowSpec {
  const { b, cs } = start(ctx, 'duelfind', duelFindMock, 51403), ui = deps.ui, f = ui.find, q = ctx.state.matchmaking;
  const set = (patch: Partial<LobbyLocal['find']>) => () => { Object.assign(f, patch); ctx.rerender(); };
  const pick = (name: string, on: boolean, key: string, label: string, patch: Partial<LobbyLocal['find']>, enabled = true) => {
    const c = choice(byName(cs, name), on, enabled); if (c) b.on(c, { key, label, click: enabled ? set(patch) : () => {} });
  };
  pick('シングルボタン', f.style === 3, 'find-single', 'Single Mode', { style: 3 });
  pick('マッチボタン', f.style === 4, 'find-match', 'Match Mode', { style: 4 }, !!(q as { matchSupported?: boolean } | undefined)?.matchSupported);
  pick('どちらでもボタン', f.style === 6, 'find-both', 'Both', { style: 6 });
  pick('制限なしボタン', !f.similar, 'find-any-level', 'Any level', { similar: false });
  pick('レベルの近いボタン', f.similar, 'find-similar-level', 'A similar level', { similar: true });
  const ok = button(cs, 'OK');
  if (ok) { ok.state = ctx.state.busy || !q ? 'disabled' : 'normal';
    b.on(ok, { key: 'find-ok', click: () => { if (ctx.state.busy || !q) return; ui.open = null; ctx.send({ type: 'startMatchmaking', style: f.style === 4 ? 3 : f.style, similarLevel: f.similar }); ctx.rerender(); } }); }
  const cancel = button(cs, 'Cancel'); if (cancel) b.on(cancel, { key: 'find-cancel', click: () => { ui.open = 'duel'; ctx.rerender(); } });
  return b.spec();
}

// Create Duel (CWindowModelDuelWait, mock/duelsetup-wait.json: 266, 204, 492 x 360): Single / Match, Time Limit ON / OFF,
// Watch On / Off, Surrender ON / OFF (the left of each pair 22, the right 246; rows 48, 96, 144, 192), the password
// (InputDuel 22, 269, 448 x 32, 8 characters), OK 50, 328 / Cancel 299, 328. OK opens the rewrite's room.
function waitWindow(ctx: BuildContext, deps: LobbyDeps): WindowSpec {
  const { b, cs } = start(ctx, 'duelwait', duelWaitMock, 51403), ui = deps.ui, w = ui.wait;
  const set = (patch: Partial<LobbyLocal['wait']>) => () => { Object.assign(w, patch); ctx.rerender(); };
  const pick = (name: string, on: boolean, key: string, label: string, patch: Partial<LobbyLocal['wait']>) => {
    const c = choice(byName(cs, name), on); if (c) b.on(c, { key, label, click: set(patch) });
  };
  pick('シングルボタン', w.style === 3, 'room-single', 'Single Mode', { style: 3 }); pick('マッチボタン', w.style === 4, 'room-match', 'Match Mode', { style: 4 });
  pick('制限ありボタン', w.timeLimit, 'room-time-on', 'Time Limit ON', { timeLimit: true }); pick('制限なしボタン', !w.timeLimit, 'room-time-off', 'Time Limit OFF', { timeLimit: false });
  pick('観戦許可ボタン', w.watch, 'room-watch-on', 'Watch On', { watch: true }); pick('観戦不許可ボタン', !w.watch, 'room-watch-off', 'Watch Off', { watch: false });
  pick('サレンダーありボタン', w.surrender, 'room-surrender-on', 'Surrender ON', { surrender: true }); pick('サレンダーなしボタン', !w.surrender, 'room-surrender-off', 'Surrender OFF', { surrender: false });
  const ok = () => {
    if (ctx.state.busy || !ctx.state.lobby?.connected) return;
    ui.open = null;
    ctx.send({ type: 'createDuelRoom', options: { style: w.style, timeLimit: w.timeLimit, allowWatch: w.watch, allowSurrender: w.surrender, ...(w.password ? { password: w.password } : {}) } });
    w.password = ''; ctx.rerender();
  };
  const input = cs.find(c => top(c) && c.cls === 'CWindowTaskInputDuel');
  if (input) { Object.assign(input, { value: w.password, password: true, focused: false, maxLen: 8 }); b.on(input, { key: 'room-password', label: 'Room password', text: v => { w.password = v.slice(0, 8); }, enter: ok }); }
  const okButton = button(cs, 'OK'); if (okButton) { okButton.state = ctx.state.busy ? 'disabled' : 'normal'; b.on(okButton, { key: 'room-ok', click: ok }); }
  const cancel = button(cs, 'Cancel'); if (cancel) b.on(cancel, { key: 'room-cancel', click: () => { ui.open = 'duel'; w.password = ''; ctx.rerender(); } });
  return b.spec();
}

// The bar's Move list (CWindowModelMove, mock/duelsetup-move.json: 168, 548, 296 x 188, standing on the bar): a duel
// button per area, "Name[kind]  people/32", from 11, 24 every 26 px, six shown (the hidden scroll bar moves them: the
// wheel), the x at the frame's right (duelsetup.js moveFrame: the widest + 3). A row moves there (moveArea).
const MOVE_ROWS = 6;
function moveWindow(ctx: BuildContext, deps: LobbyDeps): WindowSpec | null {
  const lobby = ctx.state.lobby, areas = lobby?.areas ?? []; if (!lobby) return null;
  const t = moveMock.windows[0]!, b = new WindowBuilder(ctx.ids, 'move', t.cls, { x: t.x, y: t.y, w: t.w, h: t.h }, { z: 51403, modal: false });
  const ui = deps.ui, topRow = Math.max(0, Math.min(ui.moveTop, areas.length - MOVE_ROWS));
  const label = (a: typeof areas[number]) => `${ctx.text?.(AREA_TEXT[a.area] ?? -1) ?? a.name}[${(a.kind ?? 0) + 1}]  ${a.population ?? 0}/32`;
  const widths = areas.map(a => Math.max(258, Math.ceil(label(a).length * 8.5)));
  const right = 11 + Math.max(258, ...widths);
  b.add('CWindowTaskFrameMove', 'frame', { x: 0, y: 0, w: 0, h: 0 }, { alpha: 0.9 });
  const bar = b.add('CWindowResultScroll', 'scroll', { x: right + 3, y: 22, w: 16, h: 158 }, { shown: false, value: topRow, max: Math.max(0, areas.length - MOVE_ROWS), page: MOVE_ROWS, horizontal: false });
  b.on(bar, { value: v => { ui.moveTop = Math.round(v); ctx.rerender(); } });
  const blocked = waiting(ctx.state);
  areas.forEach((a, i) => {
    const row = i - topRow, shown = row >= 0 && row < MOVE_ROWS, text = label(a);
    const c = b.add('CWindowTaskButtonDuel', `area:${a.area}:${a.block}`, shown ? { x: 11, y: 24 + 26 * row, w: widths[i]!, h: 24 } : { x: 0, y: 0, w: widths[i]!, h: 24 },
      { shown, label: text, align: 0, state: ctx.state.busy ? 'disabled' : 'normal', color: [1, 1, 1, 1], shadow: { dx: 1, dy: 1, color: [0, 0, 0, 1] } },
      { key: `move-area:${a.area}/${a.block}`, label: text, click: () => {
        if (ctx.state.busy) return;
        // the original keeps a player waiting for a duel where they are (0x13e4)
        if (blocked) { ctx.ui.dialog = { kind: 'ok', text: say(ctx, 'noMove') }; ui.open = null; ctx.rerender(); return; }
        ui.open = null; ctx.send({ type: 'moveArea', area: a.area, block: a.block }); ctx.rerender(); } });
    void c;
  });
  b.add('CWindowTaskIconHide', 'close', { x: right + 3, y: 0, w: 16, h: 24 }, { pressed: false }, { key: 'move-close', label: 'Close', click: () => { ui.open = null; ctx.rerender(); } });
  return b.spec();
}

/** Who a search lists: the other players here, NPCs too for Show all (the search's last row). */
export interface ListRow { kind: 'player' | 'npc'; id: number; name: string }
export function listRows(state: ClientView, search: Search | null, friends: readonly number[]): ListRow[] {
  const lobby = state.lobby; if (!lobby) return [];
  const players = lobby.avatars.filter(a => !a.self && !a.npc), self = lobby.avatars.find(a => a.self);
  const rooms = lobby.rooms ?? [], room = (pid: number) => rooms.find(r => r.owner === pid && !r.opponent);
  const row = (a: { id: number; name: string }): ListRow => ({ kind: 'player', id: a.id, name: a.name });
  switch (search) {
    case 'single': case 'match': return players.filter(a => { const r = room(a.id); return r && (search === 'match' ? r.style === 4 : r.style !== 4); }).map(row);
    case 'name': return [...players].sort((a, b) => a.name.localeCompare(b.name)).map(row);
    case 'friends': return players.filter(a => friends.includes(a.id)).map(row);
    case 'near': return self ? [...players].sort((a, b) => Math.hypot(a.x - self.x, a.y - self.y) - Math.hypot(b.x - self.x, b.y - self.y)).map(row) : players.map(row);
    case 'all': return [...players.map(row), ...(state.mode !== 'free' ? lobby.npcs ?? [] : []).map(n => ({ kind: 'npc' as const, id: n.id, name: n.name }))];
    // the levels are not in the lobby's list: the players here, as listed
    default: return players.map(row);
  }
}

// The lobby's player list (CPlayerListDlg, main's playerlist.js through duelsetup.js): main's capture (mock/duelsetup-
// plist.json: 0, 608, 248 x 128, six 16-pixel rows) listing what its search finds, each row "Name" at the game's name
// column (@>40/): a player's row opens their card, an NPC's its card; the magnifier (検索ボタン 197, 0) its search menu.
export function lobbyList(ctx: BuildContext, deps: LobbyDeps, openPlayer: (pid: number) => void): WindowSpec | null {
  const lobby = ctx.state.lobby; if (!lobby) return null;
  const t = playerListMock.windows[0]!, b = new WindowBuilder(ctx.ids, 'plist', t.cls, { x: t.x, y: t.y, w: t.w, h: t.h }, { z: 51153 });
  const cs = b.fromTemplate(t, true), ui = deps.ui, rows = listRows(ctx.state, ui.search, deps.friends);
  const list = cs.find(c => c.cls === 'CWindowTaskActiveListbox' && !c.parent);
  if (list) {
    Object.assign(list, { items: rows.map(r => `@0@>40/${r.name}`), top: 0, topLine: 0, selected: -1, rows: 6 });
    const bar = cs.find(c => c.parent === list.id && /Scroll$/.test(c.cls)); if (bar) Object.assign(bar, { value: 0, max: Math.max(0, rows.length - 6), page: 6 });
    const win = b.win;
    b.on(list, { label: 'Players here', click: point => {
      if (!point) return; const r = rows[Math.floor((point[1] - win.y - list.y) / 16) + Number(list.top || 0)]; if (!r) return;
      if (r.kind === 'npc') { ui.npc = r.id; if (ctx.state.profileDetail?.selectedPid != null) ctx.send({ type: 'profileAction', action: { type: 'close' } }); ctx.rerender(); }
      else { ui.npc = null; openPlayer(r.id); }
    } });
  }
  const search = cs.find(c => c.cls === 'CWindowTaskPictureSwitch' && top(c));
  if (search) { Object.assign(search, { state: 'normal', enabled: true }); b.on(search, { key: 'plist-search', label: 'Search', click: () => { ui.searching = !ui.searching; ctx.rerender(); } }); }
  return b.spec();
}

// The search menu (CFindMenu, mock/duelsetup-findmenu.json: 230, 620, 256 x 128, the list 8, 8, 240 x 112: seven 16-px
// rows): a row is the list's search (duelsetup.js FindRows clicks the row's game point).
function searchMenu(ctx: BuildContext, deps: LobbyDeps): WindowSpec {
  const { b, cs } = start(ctx, 'findmenu', findMenuMock, 51453, undefined, { modal: false }), ui = deps.ui;
  const list = cs.find(c => top(c) && c.cls === 'CWindowTaskActiveListbox');
  if (list) b.on(list, { label: 'Search', click: point => {
    if (!point) return; const i = Math.floor((point[1] - b.win.y - list.y) / 16), s = SEARCHES[i]; if (!s) return;
    ui.search = s === 'all' || ui.search !== s ? s : null; ui.searching = false; ctx.rerender();
  } });
  return b.spec();
}

// An NPC's card (CNpcListMenu, main's lobby.js card; mock/lobby-npc.json at 0, 219, 336 wide): the NPC's name in red on
// its plane, then Send Duel Request on the card's button plane (the game's TextSwitch, 24, +6, 288 x 24). The rewrite
// knows an NPC's name only: the record, deck and profile helps are left out and the card ends under the name.
function npcCard(ctx: BuildContext, deps: LobbyDeps): WindowSpec | null {
  const ui = deps.ui, npc = ctx.state.lobby?.npcs?.find(n => n.id === ui.npc);
  if (!npc || ctx.state.mode === 'free') { ui.npc = null; return null; }
  const t = npcCardMock.windows[0]!, h = 8 + 36 + 36 + 8;
  const b = new WindowBuilder(ctx.ids, `npc:${npc.id}`, t.cls, { x: t.x, y: t.y, w: t.w, h }, { z: 51603, modal: false });
  const cs = b.fromTemplate(t, true);
  for (const c of cs) if (top(c) && c.cls === 'CWindowTaskHelp' && !c.name.includes('レベル＆名前')) c.shown = false;
  const name = cs.find(c => c.cls === 'CWindowTaskHelp' && c.name.includes('レベル＆名前')), text = name && cs.find(c => c.parent === name.id && c.cls === 'CWindowTaskText');
  if (text) Object.assign(text, { text: npc.name, color: [1, 0, 0, 1] });
  const frame = cs.find(c => c.cls === 'CWindowTaskFrameThin'); if (frame) Object.assign(frame, { h, parts: { sprites: [], labels: [], swfs: [] } });
  const plane = cs.find(c => c.cls === 'CWindowTaskBackPlane' && top(c) && c.name.includes('背景')); if (plane) Object.assign(plane, { y: 44, h: 36 });
  const eligibility = ctx.state.npc?.eligibility, checking = eligibility?.status === 'pending' || !!eligibility?.refreshing;
  const enabled = !!ctx.state.lobby?.connected && !ctx.state.busy && !checking && eligibility?.status !== 'uncertain';
  for (const c of cs) if (top(c) && c.cls === 'CWindowTaskTextSwitch') { c.shown = false; c.parts = undefined; }
  const duel = cs.find(c => top(c) && c.cls === 'CWindowTaskTextSwitch' && c.name.trim() === 'デュエル申し込みボタン');
  if (duel) { Object.assign(duel, { shown: true, x: 24, y: 50, w: 288, h: 24, state: enabled ? 'normal' : 'disabled' });
    b.on(duel, { key: `npc-duel:${npc.id}`, label: `Send Duel Request to ${npc.name}`, click: () => { if (!enabled) return; ui.npc = null; ctx.send({ type: 'interact', playerId: -Math.abs(npc.id) }); ctx.rerender(); } }); }
  return b.spec();
}

// A room's password (the name prompt's window, mock/dialog-input1.json; its text the original's 0x13c3), sent once and
// never kept; and the Duel key while this player waits in a duel it created or in the queue: "Cancel the Duel you
// created?" (0x1484, main's Yes / No: mock/dialog-yesno.json).
function joinPrompt(ctx: BuildContext, deps: LobbyDeps): WindowSpec {
  const join = deps.ui.join!, { b, cs } = start(ctx, 'room-join', dialogInput1, 51503);
  const close = () => { deps.ui.join = null; ctx.rerender(); };
  const ok = () => { if (ctx.state.busy) return; const password = join.password; deps.ui.join = null; ctx.send({ type: 'challengeRoom', roomId: join.roomId, password }); ctx.rerender(); };
  const prompt = cs.find(c => c.cls === 'CWindowTaskText' && top(c)); if (prompt) Object.assign(prompt, { text: say(ctx, 'password'), x: 0, y: 8, w: 336, align: 1 });
  const input = cs.find(c => c.cls === 'CWindowTaskInput');
  if (input) { Object.assign(input, { x: 8, y: 56, w: 320, value: join.password, password: true, focused: true, maxLen: 8, caretOn: false });
    b.on(input, { key: 'room-join-password', label: 'Room password', text: v => { join.password = v.slice(0, 8); }, enter: ok }); }
  const okButton = cs.find(c => c.cls === 'CWindowTaskTextSwitch' && c.label === 'OK'), cancel = cs.find(c => c.cls === 'CWindowTaskTextSwitch' && c.label === 'Cancel');
  if (okButton) b.on(okButton, { key: 'room-join-ok', click: ok });
  if (cancel) b.on(cancel, { key: 'room-join-cancel', click: close });
  return b.spec();
}
function cancelPrompt(ctx: BuildContext, deps: LobbyDeps): WindowSpec {
  const { b, cs } = start(ctx, 'room-close', dialogYesNo, 51503), text = say(ctx, 'cancelRoom');
  const field = cs.find(c => c.cls === 'CWindowTaskTextField'); if (field) field.text = text;
  for (const c of cs) if (c.parent === field?.id && c.cls === 'CWindowTaskText') c.text = text;
  const close = () => { deps.ui.cancel = false; ctx.rerender(); };
  const yes = cs.find(c => c.cls === 'CWindowTaskTextSwitch' && c.label === 'Yes'), no = cs.find(c => c.cls === 'CWindowTaskTextSwitch' && c.label === 'No');
  if (yes) b.on(yes, { key: 'room-close-yes', click: () => {
    if (ctx.state.busy) return; deps.ui.cancel = false;
    if (ownRoom(ctx.state)) ctx.send({ type: 'deleteDuelRoom' }); else if (ctx.state.matchmaking?.status === 'searching') ctx.send({ type: 'cancelMatchmaking' });
    ctx.rerender(); } });
  if (no) b.on(no, { key: 'room-close-no', click: close });
  return b.spec();
}

/** The menu bar's Duel key: the Duel menu, or (waiting in a duel this player made, or in the queue) its cancel. */
export function duelKey(state: ClientView, ui: LobbyLocal): void {
  if (waiting(state)) { ui.cancel = true; ui.open = null; return; }
  ui.open = ui.open === 'duel' || ui.open === 'find' || ui.open === 'wait' ? null : 'duel';
}
export function moveKey(ui: LobbyLocal): void { ui.open = ui.open === 'move' ? null : 'move'; }
/** The bar's message while this player waits for a duel (the original's "Seeking Opponents" / "Searching…"). */
export function waitingMessage(ctx: Pick<BuildContext, 'state' | 'text'>): string | null {
  if (ownRoom(ctx.state)) return ctx.text?.(LOBBY_TEXT.seeking) ?? LOBBY_FALLBACK.seeking;
  if (ctx.state.matchmaking?.status === 'searching') return ctx.text?.(LOBBY_TEXT.searching) ?? LOBBY_FALLBACK.searching;
  return null;
}

/** The lobby's windows open now, back to front (the Duel menu or its windows, the Move list, the search menu, an NPC's
 * card, the prompts). */
export function lobbyWindows(ctx: BuildContext, deps: LobbyDeps): WindowSpec[] {
  const ui = deps.ui, out: WindowSpec[] = [];
  if (ctx.state.scene !== 'lobby' || !ctx.state.lobby) { Object.assign(ui, { open: null, searching: false, npc: null, join: null, cancel: false }); return out; }
  if (ui.join && !ctx.state.lobby.rooms?.some(r => r.id === ui.join!.roomId)) ui.join = null;
  if (ui.cancel && !waiting(ctx.state)) ui.cancel = false;
  const npc = npcCard(ctx, deps); if (npc) out.push(npc);
  if (ui.searching) out.push(searchMenu(ctx, deps));
  if (ui.open === 'duel') out.push(duelMenu(ctx, deps));
  else if (ui.open === 'find') out.push(findWindow(ctx, deps));
  else if (ui.open === 'wait') out.push(waitWindow(ctx, deps));
  else if (ui.open === 'move') { const m = moveWindow(ctx, deps); if (m) out.push(m); }
  if (ui.join) out.push(joinPrompt(ctx, deps));
  if (ui.cancel) out.push(cancelPrompt(ctx, deps));
  return out;
}
