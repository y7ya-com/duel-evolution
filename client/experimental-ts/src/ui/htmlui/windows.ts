// The windows the rewrite shows through main's Legacy HTML UI screens, built from its ClientView (snapshot.ts). Each
// builder returns a window snapshot in main's shape plus what its controls do (ClientApp commands). Layouts: main's
// captured windows (client/web-shell/htmlui/mock/*.json) or numbers measured from main's game (tools/flip.mjs), cited.
import type { ClientCommand, ClientView } from '../contracts';
import { Ids, WindowBuilder, levelText } from './snapshot';
import type { HtmlControl, WindowSpec } from './snapshot';
import playerSelectLive from '@htmlui/mock/playerselect-live.json';

/** A dialog the rewrite has open over a screen (the engine's CNetAccountTask prompts, NetAccountTask.cpp). */
export type HtmlDialog =
  | { kind: 'create'; slot: number; name: string }
  | { kind: 'delete'; slot: number; name: string }
  | { kind: 'ok'; text: string };
/** The HTML UI's own state between snapshots (what the engine's windows keep themselves). */
export interface HtmlUiLocal { dialog: HtmlDialog | null; chatTab: number; chatDraft: string; menu: boolean }
export const htmlUiLocal = (): HtmlUiLocal => ({ dialog: null, chatTab: 0, chatDraft: '', menu: false });
/** A Main Menu entry: its label (main's where the rewrite has the same thing), what it does. */
export interface MenuEntry { label: string; key: string; disabled?: boolean; run(): void }
/** The menu bar the scene shows: its keys (the Main Menu's, and the lobby's Duel and Move) and its message. */
export interface MenuView { entries: MenuEntry[]; message: string; duel?: () => void; move?: () => void; keys: boolean }

export interface BuildContext {
  state: ClientView; ui: HtmlUiLocal; ids: Ids;
  send(command: ClientCommand): void;
  /** Redraw after a change to `ui` alone. */
  rerender(): void;
  confirmDelete?: (name: string) => string;
  menu?: MenuView | null;
}

const byY = (cs: HtmlControl[], name: string) => cs.filter(c => c.name === name).sort((a, b) => a.y - b.y);

// Select Player (CWindowPlayerSelect, src/PlayerSelect/yo2PlayerSelect.cpp): main's capture of the live window
// (mock/playerselect-live.json: 448, 256, 480 x 272, four rows) with the rewrite's characters in it. A row is a
// character (its name, its level 'Lv01', Delete) or 'Create Player'; Back leaves for the title.
export function playerSelect(ctx: BuildContext): WindowSpec {
  const t = playerSelectLive.windows[0], b = new WindowBuilder(ctx.ids, 'select', t.cls, { x: t.x, y: t.y, w: t.w, h: t.h }, { modal: true, z: 51153 });
  const cs = b.fromTemplate(t);
  const idle = () => !ctx.ui.dialog && !ctx.state.busy;
  const rows = byY(cs, 'プレイヤ選択ボタン'), dels = byY(cs, '削除ボタン'), levels = byY(cs, 'プレイヤ選択ボタンのLV表示文字');
  rows.forEach((row, slot) => {
    const ch = ctx.state.characters.find(c => c.slot === slot), del = dels[slot], lv = levels[slot];
    row.label = ch ? ch.name : 'Create Player';
    row.state = 'normal';
    b.on(row, { key: ch ? `character-slot:${slot}` : `character-create:${slot}`, label: ch ? `${ch.name}${ch.level ? `, level ${ch.level}` : ''}` : `Create Player in slot ${slot + 1}`,
      click: () => { if (!idle()) return; if (ch) ctx.send({ type: 'selectCharacter', slot }); else { ctx.ui.dialog = { kind: 'create', slot, name: '' }; ctx.rerender(); } } });
    if (del) {
      Object.assign(del, { shown: !!ch, enabled: !!ch, state: ch ? 'normal' : 'disabled' });
      b.on(del, { key: `character-delete:${slot}`, label: ch ? `Delete ${ch.name}` : 'Delete',
        click: () => { if (!idle() || !ch) return; ctx.ui.dialog = { kind: 'delete', slot, name: ch.name }; ctx.rerender(); } });
    }
    if (lv) Object.assign(lv, { text: ch ? levelText(ch.level ?? 1) : '', shown: !!ch });
  });
  const back = cs.find(c => c.name === '選択スイッチ');
  if (back) { back.state = 'normal'; b.on(back, { key: 'character-back', click: () => { if (idle()) ctx.send({ type: 'openScene', scene: 'title' }); } }); }
  return b.spec();
}

// The engine's small dialogs, drawn by main's social.js module (owned: a FramePlane panel, real <input>s, real buttons).
// CWindowModelInput1 at 344, 312, 336 x 144 (main's create route: Enter your Player Name, the field 8, 56, 320 x 32,
// OK 44, 112 and Cancel 212, 112, 80 x 24; uiOpenInput at 344, 312 in NetAccountTask.cpp NEW_PROMPT)
export function nameDialog(ctx: BuildContext, dialog: Extract<HtmlDialog, { kind: 'create' }>): WindowSpec {
  const b = new WindowBuilder(ctx.ids, 'create', 'CWindowModelInput1', { x: 344, y: 312, w: 336, h: 144 }, { modal: true, z: 51203 });
  const close = () => { ctx.ui.dialog = null; ctx.rerender(); };
  const ok = () => { const name = dialog.name.trim(); if (!name || ctx.state.busy) return; ctx.ui.dialog = null; ctx.send({ type: 'createCharacter', slot: dialog.slot, name }); ctx.rerender(); };
  b.add('CWindowTaskFramePlane', 'frame', { x: 0, y: 0, w: 336, h: 144 }, { style: 1 });
  b.add('CWindowTaskText', 'text', { x: 0, y: 8, w: 336, h: 16 }, { text: 'Enter your Player Name', align: 1, fontSize: 16, lineGap: 0, firstLine: 0, pageLines: 1, color: [1, 1, 1, 1] });
  b.add('CWindowTaskTextSwitch', 'ok', { x: 44, y: 112, w: 80, h: 24 }, { label: 'OK', align: 1, state: dialog.name.trim() ? 'normal' : 'disabled', checked: false, color: [0, 0, 0, 1] }, { key: 'character-create-ok', click: ok });
  b.add('CWindowTaskTextSwitch', 'cancel', { x: 212, y: 112, w: 80, h: 24 }, { label: 'Cancel', align: 1, state: 'normal', checked: false, color: [0, 0, 0, 1] }, { key: 'character-create-cancel', click: close });
  b.add('CWindowTaskInput', 'name', { x: 8, y: 56, w: 320, h: 32 }, { focused: true, value: dialog.name, password: false, caret: null, caretOn: false, maxLen: 16, multiLine: false },
    { key: 'character-name', label: 'Player name', text: v => { dialog.name = v; ctx.rerender(); }, enter: ok });
  return b.spec();
}

// Yes / No over Select Player (CNetAccountTask DEL_CONFIRM: uiOpenYesNo at 332, 324), then the OK box (DEL_DONE_OPEN:
// uiOpenDialogOk at 344, 312): the same FramePlane dialog body, the text centred, the buttons as Input1's. The rewrite
// keeps no login password, so the password prompt before them (DEL_PROMPT) is not shown.
function messageDialog(ctx: BuildContext, key: string, at: { x: number; y: number }, text: string, buttons: [string, string, () => void][]): WindowSpec {
  const b = new WindowBuilder(ctx.ids, key, 'CWindowModelInput1', { ...at, w: 336, h: 144 }, { modal: true, z: 51203 });
  b.add('CWindowTaskFramePlane', 'frame', { x: 0, y: 0, w: 336, h: 144 }, { style: 1 });
  b.add('CWindowTaskTextField', 'text', { x: 8, y: 16, w: 336, h: 80 }, { text, align: 1, fontSize: 16, lineGap: 0, firstLine: 0, pageLines: 5, color: [0, 0, 0, 1] });
  const xs = buttons.length === 1 ? [128] : [44, 212];
  buttons.forEach(([label, k, click], i) => b.add('CWindowTaskTextSwitch', k, { x: xs[i], y: 112, w: 80, h: 24 }, { label, align: 1, state: 'normal', checked: false, color: [0, 0, 0, 1] }, { key: k, click }));
  return b.spec();
}
export function deleteDialog(ctx: BuildContext, dialog: Extract<HtmlDialog, { kind: 'delete' }>): WindowSpec {
  const close = () => { ctx.ui.dialog = null; ctx.rerender(); };
  const text = ctx.confirmDelete?.(dialog.name) ?? `Permanently delete character ${dialog.name} and their game progress?`;
  return messageDialog(ctx, 'delete', { x: 332, y: 324 }, text, [
    ['Yes', 'character-delete-yes', () => { if (ctx.state.busy) return; ctx.ui.dialog = null; ctx.send({ type: 'deleteCharacter', slot: dialog.slot }); ctx.rerender(); }],
    ['No', 'character-delete-no', close]]);
}
export function okDialog(ctx: BuildContext, dialog: Extract<HtmlDialog, { kind: 'ok' }>): WindowSpec {
  return messageDialog(ctx, 'ok', { x: 344, y: 312 }, dialog.text, [['OK', 'dialog-ok', () => { ctx.ui.dialog = null; ctx.rerender(); }]]);
}

// The chat (CChatWindow, main's screens/chat.js: online only, unread counts on its tabs, 'Trade', no Duel Log). Layout
// from main's lobby capture (tools/flip.mjs chat): 248, 608, 776 x 128 (mode 1, short), the icon bar 776 x 24, the tabs
// 8 px over each other along it, the ThinChop frame and its back plane, the log 8, 24, 760 x 80 (5 rows), the input
// line 0, 96, 776 x 32 (128 characters). Each tab has its own log (the reader's pairs): All Chat every line, the
// others their channel's, so main's screen counts what arrives on a tab that isn't shown.
export const CHAT_TABS: readonly { key: string; label: string; x: number; w: number; channel: string; shows: (channel: string) => boolean }[] = [
  { key: 'all', label: 'All Chat', x: 8, w: 81, channel: 'global', shows: () => true },
  // the rewrite's world has no proximity channel (its lines are 'global'): the tab is there, empty, and sends to all
  { key: 'proximity', label: 'Proximity Chat', x: 81, w: 134, channel: 'global', shows: c => c === 'local' },
  { key: 'trade', label: 'TRADE', x: 207, w: 72, channel: 'trade', shows: c => c === 'trade' },
  { key: 'team', label: 'Team ', x: 271, w: 72, channel: 'team', shows: c => c === 'team' },
];
/** '/w name text' (or /whisper, /t) whispers from any tab; the rest goes to the tab's channel. */
export function chatCommand(tab: number, line: string): Extract<ClientCommand, { type: 'chat' }> | null {
  const text = line.trim(); if (!text) return null;
  const whisper = /^\/(?:w|whisper|t)\s+(\S+)\s+([\s\S]+)$/i.exec(text);
  if (whisper) return { type: 'chat', channel: 'whisper', target: whisper[1], text: whisper[2] };
  return { type: 'chat', channel: CHAT_TABS[tab]?.channel ?? 'global', text };
}
export function chatWindow(ctx: BuildContext): WindowSpec | null {
  const lobby = ctx.state.lobby; if (!lobby) return null;
  const b = new WindowBuilder(ctx.ids, 'chat', 'CChatWindow', { x: 248, y: 608, w: 776, h: 128 }, { z: 51303, mode: 1, online: true, world: true, pairs: [] as unknown[] });
  const tab = Math.max(0, Math.min(CHAT_TABS.length - 1, ctx.ui.chatTab));
  b.add('CWindowTaskIconbar', 'bar', { x: 0, y: 0, w: 776, h: 24 }, { active: true });
  b.add('CWindowTaskThinChop', 'frame', { x: 0, y: 24, w: 776, h: 104 });
  b.add('CWindowTaskBackPlane', 'plane', { x: 8, y: 24, w: 760, h: 96 });
  const lines = lobby.chat.slice(-200);
  const pairs = CHAT_TABS.map((t, i) => {
    const tc = b.add('CWindowTaskTab', `tab${i}`, { x: t.x, y: 0, w: t.w, h: 24 }, { label: t.label, active: i === tab },
      { key: `chat-tab:${t.key}`, label: t.label.trim(), click: () => { ctx.ui.chatTab = i; ctx.rerender(); } });
    const items = lines.filter(l => t.shows(l.channel)).map(l => `@0${l.sender.trim() ? `${l.sender}:${l.text}` : l.text}`);
    const log = b.add('CWindowTaskTextlist', `log${i}`, { x: 8, y: i === tab ? 24 : 99999, w: 760, h: 80 }, { shown: i === tab, items, selected: -1, top: 0, topLine: 0, rows: 5 });
    return { tab: tc.id, log: log.id, visible: true };
  });
  b.win.pairs = pairs;
  b.add('CWindowTaskIconExpand', 'expand', { x: 757, y: 0, w: 16, h: 24 }, { pressed: false, enabled: false });
  const send = () => { const command = chatCommand(tab, ctx.ui.chatDraft); if (!command || !lobby.connected) return; ctx.ui.chatDraft = ''; ctx.send(command); ctx.rerender(); };
  b.add('CWindowTaskInput', 'input', { x: 0, y: 96, w: 776, h: 32 }, { focused: true, value: ctx.ui.chatDraft, password: false, caret: null, caretOn: false, maxLen: 128, multiLine: false },
    { key: 'chat', label: 'Chat message', text: v => { ctx.ui.chatDraft = v; }, enter: send });
  return b.spec();
}

// The menu bar (CWindowModelMenu: main's lobby.js draws its strip, message field and picture keys from
// menuicon_02_c01). main's lobby capture: 0, 736, 384 x 32; the keys MAIN 0, DUEL 80, MOVE 160 (80 x 32), their atlas
// cells normal / hover / pressed at u 0 / 80 / 160, rows v 0 (MAIN), 32 (DUEL), 96 (MOVE); checked (its window
// open) the pressed cell; the message text at 392, 8. On Select Player the bar is its strip alone (no keys).
const MENU_ICON = 'data/common/window/menuicon_02_c01.png';
const pictureArt = (v: number) => Object.fromEntries((['normal', 'hover', 'pressed', 'checked'] as const).map((k, i) =>
  [k, { id: 0, name: k, tex: MENU_ICON, src: [[0, 80, 160, 160][i], v, 80, 32], x: 0, y: 0, z: 0, wx: 0, wy: 0, wz: 0, a: 1, sx: 1, sy: 1, rgba: [1, 1, 1, 1], col: [1, 1, 1, 1], shown: i === 0 }]));
export function menuBar(ctx: BuildContext, menu: MenuView): WindowSpec {
  const b = new WindowBuilder(ctx.ids, 'menubar', 'CWindowModelMenu', { x: 0, y: 736, w: 384, h: 32 }, { z: 51203, modal: false, drawn: { x: 0, y: 736, w: 240, h: 32 } });
  b.add('CWindowTaskMenubar', 'bar', { x: 0, y: 0, w: 0, h: 0 }, { message: '', scroll: 0 });
  b.add('CWindowTaskText', 'message', { x: 392, y: 8, w: 256, h: 256 }, { text: menu.message, align: 0, fontSize: 16, color: [1, 1, 1, 1] });
  if (menu.keys) {
    const key = (name: string, x: number, v: number, run: (() => void) | undefined, dataKey: string, label: string, checked = false) =>
      b.add('CWindowTaskPictureSwitch', name, { x, y: 0, w: 80, h: 32 }, { state: run ? 'normal' : 'disabled', checked, art: pictureArt(v) }, { key: dataKey, label, click: () => run?.() });
    key('MENUBAR_MENU_MAIN', 0, 0, () => { ctx.ui.menu = !ctx.ui.menu; ctx.rerender(); }, 'main-menu', 'Main Menu', ctx.ui.menu);
    key('MENUBAR_MENU_DUEL', 80, 32, menu.duel, 'menubar-duel', 'Duel');
    key('MENUBAR_MENU_MOVE', 160, 96, menu.move, 'menubar-move', 'Move');
  }
  return b.spec();
}
// The Main Menu (CMainMenu, main's lobby.js: skin.js's panel, title bar with its close box, menu buttons): main's lobby
// capture: 0, 386, 282 x 350 for 12 entries, the title 'Main Menu' 8, 0, 264 x 24, the close box 263, 0, the entries
// 12, 27 + 26 n, 258 x 24; the window stands on the menu bar (its bottom at 736).
export function mainMenu(ctx: BuildContext, menu: MenuView): WindowSpec {
  const h = 27 + 26 * menu.entries.length + 11, b = new WindowBuilder(ctx.ids, 'mainmenu', 'CMainMenu', { x: 0, y: 736 - h, w: 282, h }, { z: 51603, modal: false, drawn: { x: 0, y: 736 - h, w: 279, h: h - 13 } });
  const close = () => { ctx.ui.menu = false; ctx.rerender(); };
  b.add('CWindowTaskFrameMain', 'frame', { x: 0, y: 0, w: 0, h: 0 });
  b.add('CWindowTaskShadowText', 'title', { x: 8, y: 0, w: 264, h: 24 }, { text: 'Main Menu', align: 1, fontSize: 16, color: [1, 1, 1, 1] });
  b.add('CWindowTaskIconHide', 'close', { x: 263, y: 0, w: 16, h: 24 }, { pressed: false }, { key: 'main-menu-close', label: 'Close the Main Menu', click: close });
  menu.entries.forEach((e, i) => b.add('CWindowTaskButtonMain', `entry:${e.key}`, { x: 12, y: 27 + 26 * i, w: 258, h: 24 },
    { label: e.label, state: e.disabled ? 'disabled' : 'normal', checked: false, align: 1, color: [1, 1, 1, 1] },
    { key: `menu:${e.key}`, click: () => { if (e.disabled) return; ctx.ui.menu = false; ctx.rerender(); e.run(); } }));
  return b.spec();
}
// The place banner (CWindowModelPlace, main's lobby.js: the plate and its four shadow texts). main's lobby capture:
// 0, 0, 270 x 52; the lobby's name 20, 9 and its count right-aligned in 150, 9, 100 wide; the map's name 20, 26 and its
// count in 150, 26. The rewrite's lobby name is 'World · Area': the world above, the area below; the counts are the
// players the client sees (the area's population, when the server lists it, above).
export function placeBanner(ctx: BuildContext): WindowSpec | null {
  const lobby = ctx.state.lobby; if (!lobby) return null;
  const [world, area = ''] = lobby.name.split(' · ');
  const here = lobby.areas?.find(a => lobby.mapId !== undefined && a.area === lobby.mapId)?.population;
  const b = new WindowBuilder(ctx.ids, 'place', 'CWindowModelPlace', { x: 0, y: 0, w: 270, h: 52 }, { z: 51253, drawn: { x: 0, y: 0, w: 300, h: 52 } });
  b.add('CWindowTaskFramePlace', 'frame', { x: 0, y: 0, w: 270, h: 52 });
  const text = (name: string, x: number, y: number, t: string, align: number) => b.add('CWindowTaskShadowText', name, { x, y, w: align ? 100 : 300, h: 16 }, { text: t, align, fontSize: 16, color: [1, 1, 1, 1] });
  text('lobby', 20, 9, world, 0);
  if (here !== undefined) text('lobbyCount', 150, 9, `(${here})`, 2);
  text('map', 20, 26, area, 0);
  text('mapCount', 150, 26, `(${lobby.avatars.length})`, 2);
  return b.spec();
}

/** Every window the current state shows through main's screens, back to front. */
export function htmlWindows(ctx: BuildContext): WindowSpec[] {
  const out: WindowSpec[] = [], { state, ui } = ctx;
  const account = ui.dialog?.kind === 'create' || ui.dialog?.kind === 'delete';
  if (account && state.scene !== 'characters') ui.dialog = null;   // its screen is gone
  // the account dialogs stand alone: main's game hides Select Player under them (its create capture)
  else if (state.scene === 'characters' && !account) out.push(playerSelect(ctx));
  if (state.scene === 'lobby' && state.connection === 'online') {
    const place = placeBanner(ctx); if (place) out.push(place);
    const chat = chatWindow(ctx); if (chat) out.push(chat);
  }
  const menu = ctx.menu;
  if (menu) { out.push(menuBar(ctx, menu)); if (ui.menu && menu.keys) out.push(mainMenu(ctx, menu)); else ui.menu = false; }
  const d = ui.dialog;
  if (d?.kind === 'create') out.push(nameDialog(ctx, d));
  else if (d?.kind === 'delete') out.push(deleteDialog(ctx, d));
  else if (d?.kind === 'ok') out.push(okDialog(ctx, d));
  return out;
}
