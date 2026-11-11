// The windows the rewrite shows through main's Legacy HTML UI screens, built from its ClientView (snapshot.ts). Each
// builder returns a window snapshot in main's shape plus what its controls do (ClientApp commands). Layouts: main's
// captured windows (client/web-shell/htmlui/mock/*.json) or numbers measured from main's game (tools/flip.mjs), cited.
import { discordRows, duelLines, duelRows, type DiscordDuelist, type OpenDuelView } from './discord';
import type { ClientCommand, ClientView } from '../contracts';
import { REWRITE_TEXT } from '../../features/ui-text';
import { Ids, WindowBuilder, levelText } from './snapshot';
import { AREA_FALLBACK, AREA_TEXT, WORLD_TEXT } from './lobby';
import { titleName } from '../../features/titles';
import type { HtmlControl, WindowSpec } from './snapshot';
import { avatarSwitch, freeChoices, starterLook, type AvatarDeps } from './avatar';
import playerSelectLive from '@htmlui/mock/playerselect-live.json';
import dialogInput1 from '@htmlui/mock/dialog-input1.json';
import { wrapDialogText } from './dialog-text';
export { wrapDialogText };
import dialogYesNo from '@htmlui/mock/dialog-yesno.json';
import dialogOk from '@htmlui/mock/dialog-ok.json';
import dialogError from '@htmlui/mock/dialog-error.json';
import lobbyCard from '@htmlui/mock/lobby-card.json';
import playerListMock from '@htmlui/mock/duelsetup-plist.json';

/** A dialog the rewrite has open over a screen (the engine's CNetAccountTask prompts, NetAccountTask.cpp). */
export type HtmlDialog =
  | { kind: 'create'; slot: number; name: string }
  | { kind: 'delete'; slot: number; name: string }
  /** Delete's password prompt (DEL_PROMPT) and the deletion under way (DEL_SEND .. DEL_DONE_OPEN). */
  | { kind: 'delpw'; slot: number; name: string; value: string; checking?: boolean }
  | { kind: 'deleting'; slot: number }
  /** An OK box; `at`: the account task's own (uiOpenDialogOk: style 1, 360 x 120 there, Select Player hidden under it). */
  | { kind: 'ok'; text: string; at?: [number, number] }
  | { kind: 'team'; name: string }
  /** A Yes / No question (the rewrite's confirmations: surrender, disconnect, a starter claim): main's YesNo. */
  | { kind: 'confirm'; text: string; yes: () => void; key?: string }
  /** Change Avatar (htmlui/avatar.ts): first dressing after Create Player's name (`slot`, `name`), or from the game (slot null). */
  | { kind: 'avatar'; slot: number | null; name?: string; look: number[]; category: number; page: number };
/** The HTML UI's own state between snapshots (what the engine's windows keep themselves). */
export interface HtmlUiLocal { discord?: DiscordDuelist[] | null; onDiscordCard?: (p: DiscordDuelist) => void; duels?: OpenDuelView[] | null; onJoinDuel?: (id: number) => void; dialog: HtmlDialog | null; chatTab: number; chatDraft: string; menu: boolean;
  /** Create Comment's two lines while it is open; the lines still to save once the server confirms the one before. */
  /** My Profile's first shown row (its scroll; the rows past ten scroll in). */
  profileTop?: number;
  comment: [string, string] | null; commentQueue: { line: 0 | 1; text: string }[];
  /** A line was sent: 'sent' until the profile shows it pending, then 'pending' until it is confirmed. */
  commentWait: null | 'sent' | 'pending';
  /** The Main Menu's list window open (Friend / Ignore / Team List) and the row chosen in it. */
  lists: { kind: 'friends' | 'ignore' | 'team'; selected: number; pick?: boolean } | null;
  /** Write Mail open: its recipient and what has been typed. */
  compose: { toPid: number | null; toName: string; subject: string; body: string } | null;
  /** D-Mail open: the first row shown, the mail chosen. */
  mail: { top: number; selected: number } | null;
  /** Find a Player (CWindowModelFriendEnum) open: the name typed, the player its buttons act on (a found one, or the
   * friend it was opened for), the invitation row chosen. */
  find?: { name: string; target: { pid: number; name: string } | null; selected: number; asked?: string } | null;
  /** Ignore by name (CWindowModelBlacklistInput) open: the name typed; `asked`, the name looked up for it. */
  ignoreInput?: { name: string; asked?: string } | null;
  /** Select Player's row under the pointer last (its character's waist-up portrait shows), null before one. */
  selected?: number | null }
export const htmlUiLocal = (): HtmlUiLocal => ({ dialog: null, chatTab: 0, chatDraft: '', menu: false, comment: null, commentQueue: [], commentWait: null, lists: null, mail: null, compose: null });
/** A Main Menu entry: its label (main's where the rewrite has the same thing), what it does. */
export interface MenuEntry { label: string; key: string; disabled?: boolean; run(): void }
/** The menu bar the scene shows: its keys (the Main Menu's, and the lobby's Duel and Move) and its message. */
export interface MenuView { entries: MenuEntry[]; message: string; duel?: () => void; move?: () => void; keys: boolean;
  /** How far main's message field moved right for the page's own bar buttons (lobby.js fieldLeft - 391: the Wardrobe and
   * Missions slots, lobby_icons.js reserveBar): the message's x follows, so main's bar redraws it at the field's start. */
  fieldShift?: number }

export interface BuildContext {
  state: ClientView; ui: HtmlUiLocal; ids: Ids;
  send(command: ClientCommand): void;
  /** Redraw after a change to `ui` alone. */
  rerender(): void;
  /** The original's UI strings by text id (yo2text_?), once loaded. */
  text?: (id: number) => string | undefined;
  /** The account's password check before a deletion (null: the account has no password to check). */
  checkPassword?: (password: string) => Promise<boolean | null>;
  menu?: MenuView | null;
  /** The list windows' rows and commands (the rewrite's social state). */
  social?: SocialLists | null;
  mailBox?: MailBox | null;
  /** Another player's card's actions (the rewrite's social and duel commands); opening a player's card. */
  cardActions?: CardActions; openPlayer?: (pid: number) => void;
  /** The lobby's player list and its duel / move windows (./lobby.ts), when the rewrite shows them. */
  lobby?: { list(ctx: BuildContext): WindowSpec | null; windows(ctx: BuildContext): WindowSpec[] };
  /** The profile's buttons the rewrite adds (one's own: comment, title, appearance). */
  profileActions?: { label: string; key: string; run(): void; disabled?: boolean }[];
  /** Change Avatar from the game: the server's choices for the look and saving it (htmlui/avatar.ts). */
  changeAvatar?: Omit<AvatarDeps, 'back'>;
  /** The deck editor's windows (deck-scene.ts), under the menu bar. */
  deckWindows?: () => WindowSpec[];
  /** A scene's own windows (the shop: htmlui/shop.ts; the trade: htmlui/trade.ts), under the chat and the menu bar. */
  scene?: WindowSpec[];
  /** Modal prompts over everything (the duel request / invitation, the error dialog): main's stock dialogs. */
  prompts?: WindowSpec[];
  /** The trade scene covers the lobby (main's Card Swap: its windows and the chat, no place banner or player list). */
  covered?: boolean;
}

const byY = (cs: HtmlControl[], name: string) => cs.filter(c => c.name === name).sort((a, b) => a.y - b.y);

// Select Player (CWindowPlayerSelect, src/PlayerSelect/yo2PlayerSelect.cpp): main's capture of the live window
// (mock/playerselect-live.json: 448, 256, 480 x 272, four rows) with the rewrite's characters in it. A row is a
// character (its name, its level 'Lv01', Delete) or 'Create Player'; Back leaves for the title.
export function playerSelect(ctx: BuildContext): WindowSpec {
  const t = playerSelectLive.windows[0], b = new WindowBuilder(ctx.ids, 'select', t.cls, { x: t.x, y: t.y, w: t.w, h: t.h }, { modal: true, z: 51153 });
  const cs = b.fromTemplate(t);
  // the frame and help text first, then the buttons top to bottom, left to right (the DOM and Tab order main's generic
  // controls follow), then the level labels: the engine draws them over their rows (read.js: their pos_.z), and a
  // label's box takes no pointer (layer.ts: .txt), so the 128-wide level never covers Delete
  const order = (c: HtmlControl) => c.cls === 'CWindowTaskTextSwitch' ? 1 : c.name === 'プレイヤ選択ボタンのLV表示文字' ? 2 : 0;
  b.win.controls.sort((p, q) => order(p) - order(q) || p.y - q.y || p.x - q.x);
  const idle = () => !ctx.ui.dialog && !ctx.state.busy;
  const rows = byY(cs, 'プレイヤ選択ボタン'), dels = byY(cs, '削除ボタン'), levels = byY(cs, 'プレイヤ選択ボタンのLV表示文字');
  rows.forEach((row, slot) => {
    const ch = ctx.state.characters.find(c => c.slot === slot), del = dels[slot], lv = levels[slot];
    row.label = ch ? ch.name : 'Create Player';
    row.state = 'normal';
    // the row (or its Delete) under the pointer becomes the selection: its character's portrait (CWindowPlayerSelect::onMain)
    const over = () => { if (ctx.ui.selected !== slot) { ctx.ui.selected = slot; ctx.rerender(); } };
    b.on(row, { over, key: ch ? `character-slot:${slot}` : `character-create:${slot}`, label: ch ? `${ch.name}${ch.level ? `, level ${ch.level}` : ''}` : `Create Player in slot ${slot + 1}`,
      click: () => { if (!idle()) return; if (ch) ctx.send({ type: 'selectCharacter', slot }); else { ctx.ui.dialog = { kind: 'create', slot, name: '' }; ctx.rerender(); } } });
    if (del) {
      Object.assign(del, { shown: !!ch, enabled: !!ch, state: ch ? 'normal' : 'disabled' });
      b.on(del, { over, key: `character-delete:${slot}`, label: ch ? `Delete ${ch.name}` : 'Delete',
        click: () => { if (!idle() || !ch) return; ctx.ui.dialog = { kind: 'delpw', slot, name: ch.name, value: '' }; ctx.rerender(); } });
    }
    if (lv) Object.assign(lv, { text: ch ? levelText(ch.level ?? 1) : '', shown: !!ch });
  });
  const back = cs.find(c => c.name === '選択スイッチ');
  if (back) { back.state = 'normal'; b.on(back, { key: 'character-back', click: () => { if (idle()) ctx.send({ type: 'openScene', scene: 'title' }); } }); }
  return b.spec();
}

// The account prompts (CNetAccountTask, NetAccountTask.cpp) are main's stock dialogs, drawn by main's dialog.js from
// its captured windows: the name prompt (mock/dialog-input1.json: CWindowModelInput1, 344, 312, its field and OK /
// Cancel), Yes / No (mock/dialog-yesno.json, uiOpenYesNo) and OK (mock/dialog-ok.json, uiOpenDialogOk), their texts
// and buttons the rewrite's.
const named = (cs: HtmlControl[], cls: string, label?: string) => cs.find(c => c.cls === cls && (label === undefined || c.label === label));
export function nameDialog(ctx: BuildContext, dialog: Extract<HtmlDialog, { kind: 'create' }>): WindowSpec {
  const t = dialogInput1.windows[0]!, b = new WindowBuilder(ctx.ids, 'create', t.cls, { x: t.x, y: t.y, w: t.w, h: t.h }, { modal: true, z: 51203 });
  const cs = b.fromTemplate(t, true);
  const close = () => { ctx.ui.dialog = null; ctx.rerender(); };
  // the original dresses the new character next (CHANGE_AVATAR's first dressing), then creates it
  const ok = () => { const name = dialog.name.trim(); if (!name || ctx.state.busy) return; ctx.ui.dialog = { kind: 'avatar', slot: dialog.slot, name, look: starterLook(), category: 0, page: 0 }; ctx.rerender(); };
  const input = named(cs, 'CWindowTaskInput'), okButton = named(cs, 'CWindowTaskTextSwitch', 'OK'), cancel = named(cs, 'CWindowTaskTextSwitch', 'Cancel');
  // the mock is hand-made; the live game's prompt (main's create capture): its text centred at 0, 8, 336 wide, the
  // field 8, 56, 320 x 32
  const prompt = named(cs, 'CWindowTaskText'); if (prompt) Object.assign(prompt, { x: 0, y: 8, w: 336, align: 1 });
  if (input) Object.assign(input, { x: 8, y: 56, w: 320 });
  if (input) { Object.assign(input, { value: dialog.name, focused: true, maxLen: 16, caretOn: false }); b.on(input, { key: 'character-name', label: 'Player name', text: v => { dialog.name = v; ctx.rerender(); }, enter: ok }); }
  if (okButton) { okButton.state = dialog.name.trim() ? 'normal' : 'disabled'; b.on(okButton, { key: 'character-create-ok', click: ok }); }
  if (cancel) b.on(cancel, { key: 'character-create-cancel', click: close });
  return b.spec();
}
/** One of main's stock dialogs (dialog.js: mock/dialog-yesno.json, dialog-ok.json) with this text, its buttons by label. */
export function messageDialog(ctx: Pick<BuildContext, 'ids'>, key: string, template: typeof dialogYesNo, text: string, buttons: Record<string, [string, () => void]>, z = 51203): WindowSpec {
  const t = template.windows[0]!, b = new WindowBuilder(ctx.ids, key, t.cls, { x: t.x, y: t.y, w: t.w, h: t.h }, { modal: true, z });
  const cs = b.fromTemplate(t, true);
  const field = named(cs, 'CWindowTaskTextField'), inner = cs.find(c => c.parent === field?.id && c.cls === 'CWindowTaskText');
  // every message wrapped to the box it is drawn in (the inner text's width beside the scroll bar, else the field's)
  const wrapped = wrapDialogText(text, inner?.w ?? field?.w ?? t.w - 16);
  if (field) field.text = wrapped;
  for (const child of cs) if (child.parent === field?.id && child.cls === 'CWindowTaskText') child.text = wrapped;
  for (const [label, [dataKey, click]] of Object.entries(buttons)) { const c = named(cs, 'CWindowTaskTextSwitch', label); if (c) b.on(c, { key: dataKey, click }); }
  return b.spec();
}
/** A button of a stock dialog: the template's switch it takes (its label there), its own caption, data-key, aria-label. */
export interface StockButton { from: string; label?: string; key: string; aria?: string; click(): void }
/** main's stock dialogs by the original's class: YesNo (mock/dialog-yesno.json), Ok (dialog-ok.json), Error (the
 * orange, topmost dialog-error.json); a button may take another caption (the original's Duel Request: an Ok with Cancel). */
export function stockDialog(ctx: Pick<BuildContext, 'ids'>, key: string, kind: 'yesno' | 'ok' | 'error', text: string, buttons: StockButton[]): WindowSpec {
  const template = kind === 'yesno' ? dialogYesNo : kind === 'error' ? dialogError as unknown as typeof dialogYesNo : dialogOk;
  const spec = messageDialog(ctx, key, template, text, Object.fromEntries(buttons.map(b => [b.from, [b.key, b.click]])));
  if (kind === 'error') Object.assign(spec.win, { topmost: true, z: 51403 });
  for (const b of buttons) {
    const c = spec.win.controls.find(k => k.cls === 'CWindowTaskTextSwitch' && k.label === b.from); if (!c) continue;
    if (b.label && b.label !== b.from) { c.label = b.label; for (const t of spec.win.controls) if (t.parent === c.id && t.text === b.from) t.text = b.label; }
    const h = spec.handlers.get(c.id); if (h && (b.aria ?? b.label)) h.label = b.aria ?? b.label;
  }
  return spec;
}
// Delete (CNetAccountTask DEL_PROMPT .. DEL_DONE_WAIT, NetAccountTask.cpp): the password (uiOpenInput at 332, 324, style 4,
// TXT_DELETE_PROMPT 0xc26: main's live capture, 360 x 120, its text centred at 0, 8, the masked field 8, 56, 344 x 32, OK
// 50, 88 and Cancel 230, 88), a wrong one TXT_DELETE_BAD_PASSWORD (0xc27) in an OK box; then Yes / No (uiOpenYesNo at
// 332, 324, TXT_DELETE_CONFIRM 0xc1c), the deletion, and TXT_DELETE_DONE (0xc1e). The words are the original's
// (yo2text_?); without the original data, plain ones stand in.
export const DELETE_TEXT = { prompt: 0xc26, wrong: 0xc27, confirm: 0xc1c, done: 0xc1e } as const;
const DELETE_FALLBACK: Record<keyof typeof DELETE_TEXT, string> = { prompt: REWRITE_TEXT.enterPassword, wrong: REWRITE_TEXT.wrongPassword,
  confirm: 'Delete this player? A deleted player cannot be restored.', done: 'Player deleted.' };
const deleteText = (ctx: BuildContext, k: keyof typeof DELETE_TEXT) => ctx.text?.(DELETE_TEXT[k]) ?? DELETE_FALLBACK[k];
export function deletePasswordDialog(ctx: BuildContext, dialog: Extract<HtmlDialog, { kind: 'delpw' }>): WindowSpec {
  const t = dialogInput1.windows[0]!, b = new WindowBuilder(ctx.ids, 'delpw', t.cls, { x: 332, y: 324, w: 360, h: 120 }, { modal: true, z: 51203 });
  const cs = b.fromTemplate(t, true);
  const close = () => { ctx.ui.dialog = null; ctx.rerender(); };
  const ok = () => {
    if (dialog.checking || ctx.state.busy) return;
    const confirm = () => { ctx.ui.dialog = { kind: 'delete', slot: dialog.slot, name: dialog.name }; ctx.rerender(); };
    if (!ctx.checkPassword) { confirm(); return; }
    dialog.checking = true; ctx.rerender();
    ctx.checkPassword(dialog.value).then(right => { if (ctx.ui.dialog !== dialog) return; if (right === false) { ctx.ui.dialog = { kind: 'ok', text: deleteText(ctx, 'wrong'), at: [332, 324] }; ctx.rerender(); } else confirm(); },
      (e: unknown) => { if (ctx.ui.dialog !== dialog) return; ctx.ui.dialog = { kind: 'ok', text: e instanceof Error ? e.message : String(e) }; ctx.rerender(); });
  };
  const frame = named(cs, 'CWindowTaskFramePlane'); if (frame) Object.assign(frame, { w: 360, h: 120, style: 4 });
  const prompt = named(cs, 'CWindowTaskText'); if (prompt) Object.assign(prompt, { text: deleteText(ctx, 'prompt'), x: 0, y: 8, w: 360, align: 1 });
  const input = named(cs, 'CWindowTaskInput'), okButton = named(cs, 'CWindowTaskTextSwitch', 'OK'), cancel = named(cs, 'CWindowTaskTextSwitch', 'Cancel');
  if (input) { Object.assign(input, { x: 8, y: 56, w: 344, value: dialog.value, password: true, focused: true, maxLen: 16, caretOn: false });
    b.on(input, { key: 'character-delete-password', label: 'Password', text: v => { dialog.value = v; }, enter: ok }); }
  if (okButton) { Object.assign(okButton, { x: 50, y: 88, state: dialog.checking ? 'disabled' : 'normal' }); b.on(okButton, { key: 'character-delete-password-ok', click: ok }); }
  if (cancel) { Object.assign(cancel, { x: 230, y: 88 }); b.on(cancel, { key: 'character-delete-password-cancel', click: close }); }
  return b.spec();
}
export function deleteDialog(ctx: BuildContext, dialog: Extract<HtmlDialog, { kind: 'delete' }>): WindowSpec {
  const close = () => { ctx.ui.dialog = null; ctx.rerender(); };
  const spec = messageDialog(ctx, 'delete', dialogYesNo, deleteText(ctx, 'confirm'), {
    Yes: ['character-delete-yes', () => { if (ctx.state.busy) return; ctx.ui.dialog = { kind: 'deleting', slot: dialog.slot }; ctx.send({ type: 'deleteCharacter', slot: dialog.slot }); ctx.rerender(); }],
    No: ['character-delete-no', close] });
  Object.assign(spec.win, { x: 332, y: 324, drawn: { ...spec.win.drawn!, x: 332, y: 324 } });
  return spec;
}
/** The deletion under way: "Player Deleted." once the slot is free; a refusal (the app's error) just ends it. */
function deletionDone(ctx: BuildContext, dialog: Extract<HtmlDialog, { kind: 'deleting' }>): void {
  if (ctx.state.busy) return;
  if (!ctx.state.characters.some(c => c.slot === dialog.slot)) ctx.ui.dialog = { kind: 'ok', text: deleteText(ctx, 'done'), at: [344, 312] };
  else if (ctx.state.error) ctx.ui.dialog = null;
}
export function okDialog(ctx: BuildContext, dialog: Extract<HtmlDialog, { kind: 'ok' }>): WindowSpec {
  const spec = messageDialog(ctx, 'ok', dialogOk, dialog.text, { OK: ['dialog-ok', () => { ctx.ui.dialog = null; ctx.rerender(); }] });
  if (dialog.at) {
    // main's live capture of the wrong password's box: the blue frame (style 1) 360 x 120, the text field 8, 8, 344 x 72
    // (its plane 344 x 72, its text 328 wide, the scroll column at 328 hidden), OK 140, 88
    const [x, y] = dialog.at, w = spec.win, cs = w.controls, field = cs.find(c => c.cls === 'CWindowTaskTextField');
    Object.assign(w, { x, y, w: 360, h: 120, drawn: { x, y, w: 360, h: 120 } });
    for (const c of cs) {
      if (c.cls === 'CWindowTaskFrameBottomThick') Object.assign(c, { w: 360, h: 120, style: 1 });
      else if (c === field) Object.assign(c, { w: 344, h: 72 });
      else if (c.parent === field?.id) Object.assign(c, c.cls === 'CWindowTaskScroll' ? { x: 328, h: 72, shown: false } : c.cls === 'CWindowTaskBackPlane' ? { w: 344, h: 72 } : { w: 328, h: 72 });
      else if (c.cls === 'CWindowTaskTextSwitch' && !c.parent) Object.assign(c, { x: 140, y: 88 });
    }
  }
  return spec;
}

// The chat (CChatWindow, main's screens/chat.js: online only, unread counts on its tabs, 'Trade', no Duel Log). Layout
// from main's lobby capture (tools/flip.mjs chat): 248, 608, 776 x 128 (mode 1, short), the icon bar 776 x 24, the tabs
// 8 px over each other along it, the ThinChop frame and its back plane, the log 8, 24, 760 x 80 (5 rows), the input
// line 0, 96, 776 x 32 (128 characters). Each tab has its own log (the reader's pairs): All Chat every line, the
// others their channel's, so main's screen counts what arrives on a tab that isn't shown.
export const CHAT_TABS: readonly { key: string; label: string; x: number; w: number; channel: string; shows: (channel: string) => boolean }[] = [
  // every line but the server's Duel Log lines (channel 9, app.ts 'duel-log'): live's ovr/duellog.c keeps those on its own
  // Duel Log tab, which main's chat.js hides; the duel screen has its own log strip
  { key: 'all', label: 'All Chat', x: 8, w: 81, channel: 'global', shows: c => c !== 'duel-log' },
  // the released chat has no proximity channel (main's chat-policy.js): its tab is left out, as main's chat.js hides it,
  // and the tabs after it stand where the engine moves them (8 px over each other)
  { key: 'trade', label: 'TRADE', x: 81, w: 72, channel: 'trade', shows: c => c === 'trade' },
  { key: 'team', label: 'Team ', x: 145, w: 72, channel: 'team', shows: c => c === 'team' },
  // main b70a104: the Duels tab lists the open duels (discord.ts), not chat lines; a row Joins
  { key: 'duels', label: 'Duels', x: 209, w: 72, channel: 'global', shows: () => false },
];
/** The duel scene's chat tab (live: the engine's duel chat window adds 『デュエル中』, its string 'Duel (n.)', between
 * TRADE and Team; main's chat.js keeps it, plain-cases nothing in it, and moves Team and Duels along by its width less
 * the 8 px overlap). It is the CHAT_TABS index after the last, so the lobby's tab indexes never move. The server has no
 * duel channel (chat.ts channelFor drops the 2008 client's kind 4), so the tab shows the two duelists' own lines and
 * what is typed there goes out on the public channel, where the opponent reads it. */
export const DUEL_CHAT_TAB = { key: 'duel', label: 'Duel (n.)', x: 145, w: 88, channel: 'global' } as const;
export const DUEL_CHAT_INDEX = CHAT_TABS.length;
/** The chat's tabs in a scene: the duel's adds DUEL_CHAT_TAB at live's place, `names` the two duelists. */
export function chatTabsFor(duelists: readonly string[] | null): readonly { key: string; label: string; x: number; w: number; channel: string; shows: (channel: string, sender: string) => boolean }[] {
  if (!duelists) return CHAT_TABS;
  const shift = DUEL_CHAT_TAB.w - 8, names = new Set(duelists.map(n => n.trim()).filter(Boolean));
  return [...CHAT_TABS.map(t => t.x > 81 ? { ...t, x: t.x + shift } : t),
    { ...DUEL_CHAT_TAB, shows: (c: string, sender: string) => (c === 'global' || c === 'whisper') && names.has(sender.trim()) }];
}
/** '/w name text' (or /whisper, /t) whispers from any tab; the rest goes to the tab's channel. A name may have spaces:
 * the longest name of a player the client knows wins, or the name in quotes ('/w "Ann Lee" hi'). */
export function chatCommand(tab: number, line: string, names: readonly string[] = []): Extract<ClientCommand, { type: 'chat' }> | null {
  const text = line.trim(); if (!text) return null;
  const w = /^\/(?:w|whisper|t)\s+([\s\S]+)$/i.exec(text);
  if (w) {
    const rest = w[1]!, quoted = /^"([^"]+)"\s+([\s\S]+)$/.exec(rest);
    if (quoted) return { type: 'chat', channel: 'whisper', target: quoted[1]!, text: quoted[2]! };
    const known = [...names].sort((a, b) => b.length - a.length).find(n => rest.toLowerCase().startsWith(n.toLowerCase() + ' '));
    if (known) return { type: 'chat', channel: 'whisper', target: rest.slice(0, known.length), text: rest.slice(known.length).trim() };
    const plain = /^(\S+)\s+([\s\S]+)$/.exec(rest);
    if (plain) return { type: 'chat', channel: 'whisper', target: plain[1]!, text: plain[2]! };
    return null;
  }
  return { type: 'chat', channel: CHAT_TABS[tab]?.channel ?? 'global', text };
}
/** The admin's sanctions (server/src/game/chat.ts, trade.ts refuse the same): the notices where the feature is greyed out. */
export const CHAT_SANCTION_NOTICE = 'Chat is disabled for this account.';
export const TRADE_SANCTION_NOTICE = 'Card Swap is disabled for this account.';
export function chatWindow(ctx: BuildContext): WindowSpec | null {
  const lobby = ctx.state.lobby; if (!lobby) return null;
  const b = new WindowBuilder(ctx.ids, 'chat', 'CChatWindow', { x: 248, y: 608, w: 776, h: 128 }, { z: 51303, mode: 1, online: true, world: true, pairs: [] as unknown[] });
  const duel = ctx.state.scene === 'duel' ? ctx.state.duel : null, tabs = chatTabsFor(duel ? duel.players.map(p => p.name) : null);
  const tab = ctx.ui.chatTab >= 0 && ctx.ui.chatTab < tabs.length ? ctx.ui.chatTab : 0;   // the duel's tab after the duel: All Chat
  b.add('CWindowTaskIconbar', 'bar', { x: 0, y: 0, w: 776, h: 24 }, { active: true });
  b.add('CWindowTaskThinChop', 'frame', { x: 0, y: 24, w: 776, h: 104 });
  b.add('CWindowTaskBackPlane', 'plane', { x: 8, y: 24, w: 760, h: 96 });
  const lines = lobby.chat.slice(-200);
  const pairs = tabs.map((t, i) => {
    const tc = b.add('CWindowTaskTab', `tab${i}`, { x: t.x, y: 0, w: t.w, h: 24 }, { label: t.label, active: i === tab },
      { key: `chat-tab:${t.key}`, label: t.label.trim(), click: () => { ctx.ui.chatTab = i; ctx.rerender(); } });
    const duels = t.key === 'duels';
    const items = duels ? duelLines(ctx.ui.duels) : lines.filter(l => t.shows(l.channel, l.sender)).map(l => `@0${l.sender.trim() ? `${l.sender}:${l.text}` : l.text}`);
    const log = b.add('CWindowTaskTextlist', `log${i}`, { x: 8, y: i === tab ? 24 : 99999, w: 760, h: 80 }, { shown: i === tab, items, selected: -1, top: 0, topLine: 0, rows: 5 });
    if (duels && i === tab) {
      const rows = duelRows(ctx.ui.duels);
      b.on(log, { key: 'chat-duels', label: 'Open duels', click: point => { if (!point) return; const r = rows[Math.floor((point[1] - 608 - 24) / 16)]; if (r && !r.mine) ctx.ui.onJoinDuel?.(r.id); } });
    }
    return { tab: tc.id, log: log.id, visible: true };
  });
  b.win.pairs = pairs;
  b.add('CWindowTaskIconExpand', 'expand', { x: 757, y: 0, w: 16, h: 24 }, { pressed: false, enabled: false });
  // nothing while the app is busy (the old Send was disabled then): the line stays to be sent with the next Enter
  const send = () => { const command = chatCommand(tab, ctx.ui.chatDraft, lobby.avatars.map(a => a.name)); if (!command || !lobby.connected || ctx.state.busy) return; ctx.ui.chatDraft = ''; ctx.send(command); ctx.rerender(); };
  // an account the admin barred from chat (0x3004's SANCTION_CHAT): the line greyed out with the notice, nothing to type
  if (ctx.state.sanctions?.chat) {
    b.add('CWindowTaskText', 'input', { x: 8, y: 104, w: 760, h: 16 }, { text: CHAT_SANCTION_NOTICE, align: 0, fontSize: 12, color: [0.5, 0.5, 0.5, 1] });
    return b.spec();
  }
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
  b.add('CWindowTaskText', 'message', { x: 392 + (menu.fieldShift ?? 0), y: 8, w: 256, h: 256 }, { text: menu.message, align: 0, fontSize: 16, color: [1, 1, 1, 1] });
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
  // main's lobby.js (menuFrame) lays the entries out itself, a 28 px pitch from 32 (its Modern UI row parked here, as live), the panel
  // standing on the bar: the window is that box, so the panel sits at its top
  const h = 32 + 28 * menu.entries.length + 8, b = new WindowBuilder(ctx.ids, 'mainmenu', 'CMainMenu', { x: 0, y: 736 - h, w: 282, h }, { z: 51603, modal: false, drawn: { x: 0, y: 736 - h, w: 279, h: h - 13 } });
  const close = () => { ctx.ui.menu = false; ctx.rerender(); };
  b.add('CWindowTaskFrameMain', 'frame', { x: 0, y: 0, w: 0, h: 0 });
  b.add('CWindowTaskShadowText', 'title', { x: 8, y: 0, w: 264, h: 24 }, { text: 'Main Menu', align: 1, fontSize: 16, color: [1, 1, 1, 1] });
  b.add('CWindowTaskIconHide', 'close', { x: 263, y: 0, w: 16, h: 24 }, { pressed: false }, { key: 'main-menu-close', label: 'Close the Main Menu', click: close });
  menu.entries.forEach((e, i) => b.add('CWindowTaskButtonMain', `entry:${e.key}`, { x: 12, y: 32 + 28 * i, w: 258, h: 24 },
    { label: e.label, state: e.disabled ? 'disabled' : 'normal', checked: false, align: 1, color: [1, 1, 1, 1] },
    { key: `menu:${e.key}`, click: () => { if (e.disabled) return; ctx.ui.menu = false; ctx.rerender(); e.run(); } }));
  return b.spec();
}
// The place banner (CWindowModelPlace, src/Game/yo2MenuPlace.cpp layout / onMain): the lobby's name (yo2text 3065
// Domino City / 3066 Duelist Academy) and "(n/1000)", the players in the whole lobby; the map's name (AREA_TEXT) with
// its block number "[n]" and "(n/32)", the players in this block. Names at 20, 9 and 20, 26; the counts right-aligned
// in 100 from the longer name's end + 20, and the frame 140 wider than that name (main's lobby.js draws the plate from the frame's size).
const DOMINO_MAPS = new Set([0, 1, 2, 3, 9]);
export function placeBanner(ctx: BuildContext): WindowSpec | null {
  const lobby = ctx.state.lobby; if (!lobby) return null;
  const [world, area = ''] = lobby.name.split(' · ');
  const map = lobby.mapId, myRoom = map === 8 || map === undefined;
  const worldName = myRoom ? world! : DOMINO_MAPS.has(map) ? ctx.text?.(WORLD_TEXT.domino) ?? 'Domino City' : ctx.text?.(WORLD_TEXT.academy) ?? 'Duelist Academy';
  const entry = lobby.areas?.find(a => a.block === lobby.block) ?? lobby.areas?.find(a => a.area === map);
  const mapName = myRoom || AREA_TEXT[map] === undefined ? area : `${ctx.text?.(AREA_TEXT[map]!)?.trim() ?? AREA_FALLBACK[map] ?? area}[${(entry?.kind ?? 0) + 1}]`;
  const lobbyCount = myRoom ? undefined : lobby.population ?? lobby.avatars.length;
  // the counts' column: the longer name's width (Arial 16, the shadow text's spacing) + 20; the frame 140 wider
  const width = (s: string) => Math.ceil(s.length * 8.6);
  const widest = Math.max(width(worldName), width(mapName)), at = widest + 20, w = Math.max(260, widest + 140);
  const b = new WindowBuilder(ctx.ids, 'place', 'CWindowModelPlace', { x: 0, y: 0, w, h: 52 }, { z: 51253, drawn: { x: 0, y: 0, w: w + 30, h: 52 } });
  b.add('CWindowTaskFramePlace', 'frame', { x: 0, y: 0, w, h: 52 });
  const text = (name: string, x: number, y: number, t: string, align: number) => b.add('CWindowTaskShadowText', name, { x, y, w: align ? 100 : 300, h: 16 }, { text: t, align, fontSize: 16, color: [1, 1, 1, 1] });
  text('lobby', 20, 9, worldName, 0);
  if (lobbyCount !== undefined) text('lobbyCount', at, 9, `(${lobbyCount}/1000)`, 2);
  text('map', 20, 26, mapName, 0);
  text('mapCount', at, 26, myRoom ? `(${lobby.avatars.length})` : `(${lobby.avatars.length}/32)`, 2);
  return b.spec();
}

// A player's profile (CWindowModelProfile, main's social.js: the duel frame, its rows, the green title, OK). main's My
// Room capture (tools/flip.mjs sp-profile): 212, 186, 600 x 396; the title 0, 4, 600 wide over its black shadow 1 px
// down-right; rows 32 high from 14, 32 (557 wide), each a name at 16, y and its value right-aligned 16 px lower; the
// scroll column 571, 32, 318 long; OK 250, 364, 100 x 24. The values are the rewrite's (the server's player info).
const PROFILE_ITEM = 'プロフィールウィンドウの項目名', PROFILE_VALUE = 'プロフィールウィンドウの項目の数値';
export function profileWindow(ctx: BuildContext): WindowSpec | null {
  // one's own profile (another player's is their card, playerCard)
  const p = ctx.state.profileDetail; if (!p || p.selectedPid === null || p.selectedPid !== p.selfPid) return null;
  const s = p.summary, d = p.details, self = true;
  const wins = s?.wins ?? 0, losses = s?.losses ?? 0, played = wins + losses;
  // Title: the personal title (comment line 1) when the player wrote one, else the worn title's English name
  const rows: [string, string][] = [
    ['Name', s?.name ?? d?.name ?? ''], ['Title', p.comments[1] || (d ? titleName(d.titleId) : '')], ['LV', String(s?.level ?? d?.level ?? '')],
    ['Tournament Points', d ? String(d.tp) : ''], ['Wins', String(wins)], ['Losses', String(losses)], ['Score', d ? String(d.score) : ''],
    ['Win%', played ? `${(wins * 100 / played).toFixed(2)}%` : '---.--%'],
    ...(ctx.state.cardsCollected !== undefined ? [['% of Cards Collected', `${ctx.state.cardsCollected.toFixed(2)}%`] as [string, string]] : []),
    ['Miles', d ? String(d.mp) : ''],
    ...(p.comments[0] ? [['Comment', p.comments[0]] as [string, string]] : []),
  ];
  const b = new WindowBuilder(ctx.ids, 'profile', 'CWindowModelProfile', { x: 212, y: 186, w: 600, h: 396 }, { z: 51453, modal: true });
  b.add('CWindowTaskFrameDuel', 'frame', { x: 0, y: 0, w: 0, h: 0 });
  // ten rows at a time; the scroll (drag or wheel) brings the rest in
  const max = Math.max(0, rows.length - 10), top = ctx.ui.profileTop = Math.max(0, Math.min(max, ctx.ui.profileTop ?? 0));
  const scrollTo = (v: number) => { const t = Math.max(0, Math.min(max, Math.round(v))); if (t !== ctx.ui.profileTop) { ctx.ui.profileTop = t; ctx.rerender(); } };
  const wheel = (delta: number) => scrollTo(top + Math.sign(delta));
  b.add('CWindowTaskScroll', 'scroll', { x: 571, y: 32, w: 16, h: 318 }, { value: top, max, page: 10, thumb: { pos: max ? Math.round(top * (318 - 318 * 10 / rows.length) / max) : 0, len: Math.round(318 * Math.min(1, 10 / rows.length)) }, length: 318, horizontal: false },
    { value: scrollTo, wheel });
  const shown = (i: number) => i >= top && i < top + 10, rowY = (i: number) => 32 * (i - top);
  rows.forEach((_, i) => b.add('CWindowTaskBackPlane', `plane${i}`, { x: 14, y: 32 + rowY(i), w: 557, h: 32 }, { shown: shown(i) }, { wheel }));
  rows.forEach(([name, value], i) => {
    const t = { align: 0, fontSize: 16, color: [1, 1, 1, 1], shown: shown(i) };
    // main's control names (social.js profileLevel: the LV row's value gets the player's rank, GET /api/de/rank)
    b.add('CWindowTaskText', `name${i}`, { x: 16, y: 32 + rowY(i), w: 552, h: 32 }, { ...t, text: name }).name = PROFILE_ITEM;
    b.add('CWindowTaskText', `value${i}`, { x: 16, y: 48 + rowY(i), w: 552, h: 32 }, { ...t, text: value, align: 2 }).name = PROFILE_VALUE;
  });
  const title = b.add('CWindowTaskShadowText', 'title', { x: 0, y: 4, w: 600, h: 16 }, { text: self ? 'My Profile' : 'Profile', align: 1, fontSize: 16, color: [0.2, 1, 0.2, 1] });
  b.add('CWindowTaskText', 'titleShadow', { x: 1, y: 5, w: 600, h: 16 }, { parent: title.id, text: title.text, align: 1, fontSize: 16, color: [0, 0, 0, 1] });
  // OK centred as main's; the rewrite's actions (main has them on the player card and the Main Menu) share its row,
  // the same duel buttons, 4 apart (100 wide as OK while the row fits, else 88), OK last
  const actions = ctx.profileActions ?? [], n = actions.length + 1, w = n * 104 <= 572 ? 100 : 88, x0 = Math.round((600 - (n * w + (n - 1) * 4)) / 2);
  actions.forEach((a, i) => b.add('CWindowTaskButtonDuel', `action:${a.key}`, { x: x0 + i * (w + 4), y: 364, w, h: 24 }, { label: a.label, align: 1, state: a.disabled ? 'disabled' : 'normal', color: [0, 0, 0, 1] },
    { key: `profile-${a.key}`, click: () => { if (!a.disabled) a.run(); } }));
  b.add('CWindowTaskButtonDuel', 'ok', { x: x0 + (n - 1) * (w + 4), y: 364, w, h: 24 }, { label: 'OK', align: 1, state: 'normal', color: [0, 0, 0, 1] },
    { key: 'profile-ok', label: 'Close the profile', click: () => { ctx.ui.comment = null; ctx.ui.profileTop = 0; ctx.send({ type: 'profileAction', action: { type: 'close' } }); } });
  return b.spec();
}

// Create Comment (CWindowModelSetComment, main's social.js: a FramePlane dialog with two real inputs). main's capture
// (tools/flip.mjs sp-comment): 344, 269, 336 x 230; 'Create Comment' at 103, 8; Greeting 8, 48 over its field 8, 64,
// Duel Message 8, 112 over 8, 128 (320 x 32); OK 44, 180 and Cancel 212, 180. The rewrite's profile lines: the comment
// (line 0) and the personal title (line 1), 31 Latin-1 characters each (the server's limit); saved one at a time.
export function commentDialog(ctx: BuildContext, lines: [string, string]): WindowSpec {
  const b = new WindowBuilder(ctx.ids, 'comment', 'CWindowModelSetComment', { x: 344, y: 269, w: 336, h: 230 }, { z: 51503, modal: true });
  const p = ctx.state.profileDetail, saved = [p?.comments[0] ?? '', p?.comments[1] ?? ''];
  const close = () => { ctx.ui.comment = null; ctx.rerender(); };
  const ok = () => {
    ctx.ui.commentQueue = ([0, 1] as const).filter(i => lines[i] !== saved[i]).map(line => ({ line, text: lines[line] }));
    ctx.ui.comment = null; saveNextComment(ctx); ctx.rerender();
  };
  const text = (name: string, x: number, y: number, t: string) => b.add('CWindowTaskText', name, { x, y, w: 256, h: 256 }, { text: t, align: 0, fontSize: 16, color: [1, 1, 1, 1] });
  b.add('CWindowTaskFramePlane', 'frame', { x: 0, y: 0, w: 336, h: 230 }, { style: 1 });
  text('title', 103, 8, 'Create Comment'); text('greeting', 8, 48, 'Greeting'); text('duel', 8, 112, 'Duel Message');
  b.add('CWindowTaskTextSwitch', 'cancel', { x: 212, y: 180, w: 80, h: 24 }, { label: 'Cancel', align: 1, state: 'normal', checked: false, color: [0, 0, 0, 1] }, { key: 'comment-cancel', click: close });
  b.add('CWindowTaskTextSwitch', 'ok', { x: 44, y: 180, w: 80, h: 24 }, { label: 'OK', align: 1, state: 'normal', checked: false, color: [0, 0, 0, 1] }, { key: 'comment-ok', click: ok });
  ([[1, 128, 'comment-duel', 'Duel Message'], [0, 64, 'comment-greeting', 'Greeting']] as const).forEach(([line, y, key, label]) =>
    b.add('CWindowTaskInput', `line${line}`, { x: 8, y, w: 320, h: 32 }, { focused: line === 0, value: lines[line], password: false, caret: null, caretOn: false, maxLen: 31, multiLine: false },
      { key, label, text: v => { lines[line] = v; }, enter: ok }));
  return b.spec();
}
/** The next queued comment line, once the profile has no update pending (the server confirms one at a time). */
export function saveNextComment(ctx: BuildContext): void {
  const p = ctx.state.profileDetail, ui = ctx.ui;
  if (ui.commentWait === 'sent') { if (p?.pending) ui.commentWait = 'pending'; else return; }
  if (ui.commentWait === 'pending') { if (p?.pending) return; ui.commentWait = null; }
  const next = ui.commentQueue[0];
  if (!p || !next || p.pending !== null || p.selfPid === null || p.selectedPid !== p.selfPid) return;
  ui.commentQueue.shift(); ui.commentWait = 'sent';
  ctx.send({ type: 'profileAction', action: { type: 'editDraft', field: next.line === 0 ? 'comment' : 'title', value: next.text } });
  ctx.send({ type: 'profileAction', action: { type: 'saveComment', line: next.line } });
}

/** What another player's card offers (the rewrite's social and duel commands). */
export interface CardActions { friend?(): void; trade?(): void; whisper?(): void; ignore?(): void; mail?(): void; team?(): void; duel?(): void; watch?(): void }
// A player's card (CPlayerListMenu, main's lobby.js: its frame, planes and Help texts from the controls' parts and
// children, the generic buttons): main's captured card (mock/lobby-card.json, 248, 279, 336 wide) with this player's
// level and name (red), title, wins / losses and comment, and a button per action the rewrite has, 36 px apart from
// 148 as the game stacks them (the window and the plane under the buttons grow with them; a card of another height
// draws main's CSS thin frame, the captured frame pieces fit the 328-high card only).
const CARD_BUTTONS: [string, keyof CardActions, string][] = [
  ['デュエル申し込みボタン', 'duel', 'card-duel'], ['観戦ボタン', 'watch', 'card-watch'], ['フレンド申し込みボタン', 'friend', 'card-friend'],
  ['トレード申し込みボタン', 'trade', 'card-trade'], ['チャットメッセージボタン', 'whisper', 'card-whisper'], ['メール送信ボタン', 'mail', 'card-mail'],
  ['チームに誘うボタン', 'team', 'card-team'], ['ブラックリストボタン', 'ignore', 'card-ignore'],
];
export function playerCard(ctx: BuildContext, actions: CardActions): WindowSpec | null {
  const p = ctx.state.profileDetail; if (!p || p.selectedPid === null || p.selectedPid === p.selfPid) return null;
  const t = lobbyCard.windows[0]!, shown = CARD_BUTTONS.filter(([, k]) => actions[k]), n = shown.length, h = 148 + 36 * Math.max(1, n);
  // where main's capture has it (x 248), standing on the player list and chat row (608) when it grows past the capture's
  const y = Math.min(t.y, 600 - h);
  const b = new WindowBuilder(ctx.ids, `card:${p.selectedPid}`, t.cls, { x: t.x, y, w: t.w, h }, { modal: false, z: 51603, pid: p.selectedPid });   // pid: main's lobby.js cardRank (read/lobby.js pid_), the rank under the header
  const cs = b.fromTemplate(t, true);
  const s = p.summary, d = p.details, wins = s?.wins ?? 0, losses = s?.losses ?? 0, name = s?.name ?? d?.name ?? '';
  const help = (key: string, text: string) => { const hp = cs.find(c => c.cls === 'CWindowTaskHelp' && c.name.includes(key)); const tx = hp && cs.find(c => c.parent === hp.id && c.cls === 'CWindowTaskText'); if (tx) tx.text = text; };
  help('レベル＆名前', `LV${String(s?.level ?? d?.level ?? 0).padStart(2, '0')}  ${name}\n`);
  help('称号テキスト', p.comments[1] || (d ? titleName(d.titleId) : '')); help('勝率テキスト', `Wins${wins}/Losses${losses}`); help('コメントテキスト', p.comments[0] ?? '');
  const frame = cs.find(c => c.cls === 'CWindowTaskFrameThin');
  if (frame) { frame.h = h; if (h !== t.h || y !== t.y) frame.parts = { sprites: [], labels: [], swfs: [] }; }
  const plane = cs.find(c => c.cls === 'CWindowTaskBackPlane' && !c.parent && c.name.includes('背景')); if (plane) plane.h = 36 * Math.max(1, n);
  for (const c of cs) if (c.cls === 'CWindowTaskTextSwitch' && !c.parent) { c.shown = false; c.parts = undefined; }
  shown.forEach(([nm, k, key], i) => {
    const c = cs.find(x => x.cls === 'CWindowTaskTextSwitch' && x.name.trim() === nm); if (!c) return;
    // Card Swap greyed out for an account the admin barred from trading (0x3004's SANCTION_TRADE)
    const barred = k === 'trade' && !!ctx.state.sanctions?.trade;
    Object.assign(c, { shown: true, x: 24, y: 148 + 36 * i, w: 288, h: 24, state: barred ? 'disabled' : 'normal' }, barred ? { enabled: false } : {});
    b.on(c, barred ? { key, label: TRADE_SANCTION_NOTICE } : { key, click: () => actions[k]?.() });
  });
  return b.spec();
}
// The lobby's player list (CPlayerListDlg, main's playerlist.js through duelsetup.js): main's capture with a second
// player (mock/duelsetup-plist.json: 0, 608, 248 x 128, six 16-pixel rows) listing the other players here, each row
// "Name" at the game's name column (@>40/); a row opens that player's card.
export function playerList(ctx: BuildContext, open: (pid: number) => void): WindowSpec | null {
  const lobby = ctx.state.lobby; if (!lobby) return null;
  const t = playerListMock.windows[0]!, b = new WindowBuilder(ctx.ids, 'plist', t.cls, { x: t.x, y: t.y, w: t.w, h: t.h }, { z: 51153 });
  const cs = b.fromTemplate(t, true);
  const others = lobby.avatars.filter(a => !a.self && !a.npc);
  const list = cs.find(c => c.cls === 'CWindowTaskActiveListbox' && !c.parent);
  if (list) {
    // the Discord duelists after them (main 4fe1425: the game's row, "(Discord)"; a row opens their card)
    const disc = discordRows(ctx.ui.discord ?? [], lobby.avatars), all = others.length + disc.length;
    Object.assign(list, { items: [...others.map(a => `@0@>40/${a.name}`), ...disc.map(d => d.item)], top: 0, topLine: 0, selected: -1, rows: 6 });
    const bar = cs.find(c => c.parent === list.id && /Scroll$/.test(c.cls)); if (bar) Object.assign(bar, { value: 0, max: Math.max(0, all - 6), page: 6 });
    const win = b.win;
    b.on(list, { label: 'Players here', click: point => { if (!point) return; const i = Math.floor((point[1] - win.y - list.y) / 16) + Number(list.top || 0); const a = others[i];
      if (a) open(a.id); else { const d = disc[i - others.length]; const p = d && ctx.ui.discord?.find(x => x.pid === d.pid); if (p) ctx.ui.onDiscordCard?.(p); } } });
  }
  const search = cs.find(c => c.cls === 'CWindowTaskPictureSwitch'); if (search) Object.assign(search, { state: 'disabled', enabled: false });
  return b.spec();
}

/** The Friend / Ignore / Team List windows' content (the rewrite's social state). */
export interface SocialLists {
  /** A friend's presence (the original's 0x3604 answer, the place from the server's friend list): online and where;
   * absent until the answer comes. */
  friends: { pid: number; name: string; online?: boolean; place?: string }[]; ignored: { pid: number; name: string }[];
  team: { name: string; members: { pid: number; name: string }[]; leader: boolean } | null;
  unignore(pid: number): void; formTeam(name: string): void; leaveTeam(): void; disbandTeam(): void;
  /** Remove from Friend List (the character's own list, as the original's f0001.lst). */
  removeFriend(pid: number): void;
  /** Find a Player: the last name looked up (its pid when found), the server's refusal, invitations waiting. */
  lookup?: { name: string; pid: number | null } | null; error?: string | null;
  offers?: { pid: number; name: string; level: number }[];
  teamInvites?: { teamId: number; teamName: string; inviterPid: number; inviterName: string }[];
  /** A Card Swap can start (none under way). */
  canTrade?: boolean;
  find?(name: string): void; inviteFriend?(pid: number): void; replyFriend?(pid: number, accept: boolean): void;
  inviteTeam?(pid: number): void; inviteTrade?(pid: number, name: string): void; ignore?(pid: number): void;
  replyTeam?(teamId: number, inviterPid: number, accept: boolean): void;
  whisper?(name: string): void; duel?(pid: number): void;
}
// The Main Menu's list windows (CWindowModelFriendlist / Blacklist / Teamlist, main's social.js: the duel frame, the
// list's rows a native scroller, the duel buttons). main's My Room captures (tools/flip.mjs sp-friends, sp-teams):
// 62, 282, 900 x 204; the title 0, 4, 900 wide; the list 13, 32, 874 x 128 (8 rows); Close 625, 173 (100 x 24) and the
// window's action left of the centre (Remove from Friend List 125, 173, 200 wide; the Team List's Form Team 403.5, 93
// wide, Disband Team 391, 118 wide, Leave Team 400.5, 99 wide). Remove from Friend List takes the chosen friend off the
// character's own list (the original keeps it in its f0001.lst; the server has no request for it). A team is formed by
// name (the name prompt, main's dialog.js).
export function listWindow(ctx: BuildContext, lists: SocialLists): WindowSpec | null {
  const open = ctx.ui.lists; if (!open) return null;
  const cls = { friends: 'CWindowModelFriendlist', ignore: 'CWindowModelBlacklist', team: 'CWindowModelTeamlist' }[open.kind];
  const b = new WindowBuilder(ctx.ids, `list:${open.kind}`, cls, { x: 62, y: 282, w: 900, h: 204 }, { z: 51453, modal: true });
  const close = () => { ctx.ui.lists = null; ctx.rerender(); };
  const rows = open.kind === 'friends' ? lists.friends : open.kind === 'ignore' ? lists.ignored : lists.team?.members ?? [];
  if (open.selected >= rows.length) open.selected = -1;
  b.add('CWindowTaskFrameDuel', 'frame', { x: 0, y: 0, w: 0, h: 0 });
  const title = { friends: 'Friend List', ignore: 'Ignore List', team: lists.team ? `Team List: ${lists.team.name}` : 'Team List' }[open.kind];
  b.add('CWindowTaskShadowText', 'title', { x: 0, y: 4, w: 900, h: 204 }, { text: title, align: 1, fontSize: 16, color: [1, 1, 1, 1] });
  // a friend's row as the Team List's: the name at 16, where they are at 230 ("@>N/" pen moves, main's chat.js rowRuns),
  // Offline when the server doesn't report them; a name's own "@" doubled so it can't read as a pen move
  const line = (r: { name: string; online?: boolean; place?: string }) => open.kind === 'friends' && r.online !== undefined
    ? `@>16/${r.name.replace(/[@＠]/g, '$&$&')}@>230/${r.online ? r.place || 'Online' : 'Offline'}` : r.name;
  const list = b.add('CWindowTaskListbox', 'list', { x: 13, y: 32, w: 874, h: 128 }, { items: rows.map((r, i) => `${i === open.selected ? '> ' : ''}${line(r)}`), selected: open.selected, top: 0, topLine: 0, rows: 8 });
  b.on(list, { label: title, click: point => { if (!point) return; const i = Math.floor((point[1] - 282 - 32) / 16); if (i >= 0 && i < rows.length) { open.selected = i; ctx.rerender(); } } });
  const button = (name: string, x: number, w: number, label: string, key: string, run: (() => void) | null) =>
    b.add('CWindowTaskButtonDuel', name, { x, y: 173, w, h: 24 }, { label, align: 1, state: run ? 'normal' : 'disabled', color: [0, 0, 0, 1] }, { key, click: () => run?.() });
  const chosen = rows[open.selected];
  if (open.kind === 'friends' && open.pick) button('remove', 125, 200, 'Send D-mail', 'list-pick', chosen && ctx.ui.compose ? () => { ctx.ui.compose!.toPid = chosen.pid; ctx.ui.compose!.toName = chosen.name; ctx.ui.lists = null; ctx.rerender(); } : null);
  else if (open.kind === 'friends') button('remove', 125, 200, 'Remove from Friend List', 'list-remove', chosen ? () => { lists.removeFriend(chosen.pid); open.selected = -1; ctx.rerender(); } : null);
  if (open.kind === 'ignore') button('remove', 125, 200, 'Remove from Ignore List', 'list-remove', chosen ? () => { lists.unignore(chosen.pid); open.selected = -1; } : null);
  // the original's way to add: the Friend List opens Find a Player (CWindowModelFriendEnum: for the chosen friend, else
  // a search), the Ignore List the name prompt (CWindowModelBlacklistInput)
  if (open.kind === 'friends' && !open.pick && lists.find) button('find', 345, 120, chosen ? 'Friend Options' : 'Find a Player', 'list-find', () => { ctx.ui.find = { name: chosen?.name ?? '', target: chosen ? { pid: chosen.pid, name: chosen.name } : null, selected: -1 }; ctx.ui.lists = null; ctx.rerender(); });
  if (open.kind === 'ignore' && lists.find) button('add', 345, 120, 'Add by Name', 'list-add', () => { ctx.ui.ignoreInput = { name: '' }; ctx.rerender(); });
  if (open.kind === 'team') {
    if (!lists.team) button('form', 403.5, 93, 'Form Team', 'team-form', () => { ctx.ui.dialog = { kind: 'team', name: '' }; ctx.rerender(); });
    // the original asks first (a YesNo), as it does every irreversible step
    else if (lists.team.leader) button('disband', 391, 118, 'Disband Team', 'team-disband', () => { ctx.ui.dialog = { kind: 'confirm', key: 'team-disband', text: 'Disband this team for every member?', yes: () => lists.disbandTeam() }; ctx.rerender(); });
    else button('leave', 400.5, 99, 'Leave Team', 'team-leave', () => { ctx.ui.dialog = { kind: 'confirm', key: 'team-leave', text: 'Leave your current team?', yes: () => lists.leaveTeam() }; ctx.rerender(); });
  }
  button('close', 625, 100, 'Close', 'list-close', close);
  return b.spec();
}
// The team's name, asked in main's name prompt (mock/dialog-input1.json), as the game asks for one
export function teamNameDialog(ctx: BuildContext, dialog: Extract<HtmlDialog, { kind: 'team' }>, lists: SocialLists): WindowSpec {
  const t = dialogInput1.windows[0]!, b = new WindowBuilder(ctx.ids, 'team-name', t.cls, { x: t.x, y: t.y, w: t.w, h: t.h }, { modal: true, z: 51503 });
  const cs = b.fromTemplate(t, true);
  const ok = () => { const name = dialog.name.trim(); if (!name) return; ctx.ui.dialog = null; lists.formTeam(name); ctx.rerender(); };
  const text = named(cs, 'CWindowTaskText'); if (text) Object.assign(text, { text: 'Enter your Team Name', x: 0, y: 8, w: 336, align: 1 });
  const input = named(cs, 'CWindowTaskInput'); if (input) Object.assign(input, { x: 8, y: 56, w: 320 });
  const okButton = named(cs, 'CWindowTaskTextSwitch', 'OK'), cancel = named(cs, 'CWindowTaskTextSwitch', 'Cancel');
  if (input) { Object.assign(input, { value: dialog.name, focused: true, maxLen: 16 }); b.on(input, { key: 'team-name', label: 'Team name', text: v => { dialog.name = v; ctx.rerender(); }, enter: ok }); }
  if (okButton) { okButton.state = dialog.name.trim() ? 'normal' : 'disabled'; b.on(okButton, { key: 'team-name-ok', click: ok }); }
  if (cancel) b.on(cancel, { key: 'team-name-cancel', click: () => { ctx.ui.dialog = null; ctx.rerender(); } });
  return b.spec();
}

// Find a Player (CWindowModelFriendEnum, main's social.js draws it: the duel frame, its buttons, a real input). No
// capture of it exists (web-shell/htmlui/mock) and the decomp data carries its class, not its numbers, so it stands in
// the Friend List's frame family (listWindow: 62 wide margin, 900 wide, the title 0, 4, Close 625 at the foot): the
// name field 73, 32 (15 characters, the server's limit) and Search 383, 32; the player it acts on 493, 36; the actions
// on one row at 64 (116 wide, 124 apart); the friend and team invitations waiting, one row each (its own switch) from
// 120, 28 apart; Accept 125 / Decline 235 and Close 625 at 237.
export function findWindow(ctx: BuildContext, lists: SocialLists): WindowSpec | null {
  const f = ctx.ui.find; if (!f) return null;
  const b = new WindowBuilder(ctx.ids, 'friendenum', 'CWindowModelFriendEnum', { x: 62, y: 250, w: 900, h: 268 }, { z: 51453, modal: true });
  b.add('CWindowTaskFrameDuel', 'frame', { x: 0, y: 0, w: 0, h: 0 });
  const text = (name: string, x: number, y: number, w: number, t: string, align = 0) => b.add('CWindowTaskShadowText', name, { x, y, w, h: 24 }, { text: t, align, fontSize: 16, color: [1, 1, 1, 1] });
  text('title', 0, 4, 900, 'Find a Player', 1);
  const button = (name: string, x: number, y: number, w: number, label: string, key: string, run: (() => void) | null | undefined) =>
    b.add('CWindowTaskButtonDuel', name, { x, y, w, h: 24 }, { label, align: 1, state: run ? 'normal' : 'disabled', color: [0, 0, 0, 1] }, { key, click: () => run?.() });
  const search = () => { const name = f.name.trim(); if (!name || !lists.find) return; f.asked = name; f.target = null; lists.find(name); ctx.rerender(); };
  const look = lists.lookup, asked = f.asked && look?.name === f.asked ? look : null;
  const target = f.target ?? (asked?.pid ? { pid: asked.pid, name: asked.name } : null);
  text('nameLabel', 13, 36, 60, 'Name:');
  b.add('CWindowTaskInput', 'name', { x: 73, y: 32, w: 300, h: 24 }, { value: f.name, focused: true, password: false, caret: null, caretOn: false, maxLen: 15, multiLine: false },
    { key: 'find-name', label: 'Player name', text: v => { f.name = v; ctx.rerender(); }, enter: search });
  button('search', 383, 32, 100, 'Search', 'find-search', f.name.trim() && lists.find ? search : null);
  const result = lists.error ? lists.error : target ? `${target.name} (ID ${target.pid})` : asked ? `No player called "${asked.name}" was found.` : f.asked ? 'Searching…' : '';
  text('result', 493, 36, 394, result);
  const on = (run: ((t: { pid: number; name: string }) => void) | null | undefined) => target && run ? () => { run(target); ctx.rerender(); } : null;
  const actions: [string, string, ((t: { pid: number; name: string }) => void) | null | undefined][] = [
    ['Add to Friend List', 'find-friend', lists.friends.some(x => x.pid === target?.pid) ? null : lists.inviteFriend && (t => lists.inviteFriend!(t.pid))],
    ['Send D-mail', 'find-mail', t => { ctx.ui.compose = { toPid: t.pid, toName: t.name, subject: '', body: '' }; ctx.ui.find = null; }],
    ['Invite to Team', 'find-team', lists.team && lists.inviteTeam ? t => lists.inviteTeam!(t.pid) : null],
    // Card Swap leaves for the trade (its request dialog, then its scene), as D-mail and Whisper leave for theirs: Find a
    // Player (z 51453) would otherwise sit over the trade's dialogs (51203) and cover their buttons
    ['Card Swap', 'find-trade', lists.canTrade && lists.inviteTrade && !ctx.state.sanctions?.trade ? t => { lists.inviteTrade!(t.pid, t.name); ctx.ui.find = null; } : null],
    ['Duel', 'find-duel', lists.duel && (t => lists.duel!(t.pid))],
    ['Whisper', 'find-whisper', lists.whisper && (t => { lists.whisper!(t.name); ctx.ui.find = null; })],
    ['Ignore', 'find-ignore', lists.ignored.some(x => x.pid === target?.pid) ? null : lists.ignore && (t => lists.ignore!(t.pid))],
  ];
  // each button as wide as its label (16-px duel-button text, about 8.6 px a character, 8 px padding a side: 'Add to
  // Friend List' was cut in a 116-px button), the row spread over the well's 874 px
  const widths = actions.map(([label]) => Math.round(label.length * 8.6 + 16)), gap = (874 - widths.reduce((a, w) => a + w, 0)) / (actions.length - 1);
  let ax = 13;
  actions.forEach(([label, key, run], i) => { button(key, Math.round(ax), 64, widths[i]!, label, key, on(run)); ax += widths[i]! + gap; });
  text('invitesLabel', 13, 96, 874, 'Invitations');
  const invites: { label: string; key: string; reply(accept: boolean): void }[] = [
    ...(lists.offers ?? []).map(o => ({ label: `${o.name} (Lv ${o.level}) wants to be friends.`, key: `find-offer:${o.pid}`, reply: (a: boolean) => lists.replyFriend?.(o.pid, a) })),
    ...(lists.teamInvites ?? []).map(t => ({ label: `${t.inviterName} invites you to the team ${t.teamName}.`, key: `find-teaminvite:${t.teamId}`, reply: (a: boolean) => lists.replyTeam?.(t.teamId, t.inviterPid, a) })),
  ];
  if (f.selected >= invites.length) f.selected = -1;
  invites.slice(0, 4).forEach((v, i) => b.add('CWindowTaskTextSwitch', `invite${i}`, { x: 13, y: 120 + 28 * i, w: 874, h: 24 }, { label: v.label, align: 0, state: 'normal', checked: i === f.selected, color: [0, 0, 0, 1] },
    { key: v.key, click: () => { f.selected = i; ctx.rerender(); } }));
  if (!invites.length) text('noInvites', 13, 120, 874, 'No invitations waiting.');
  const chosen = invites[f.selected];
  button('accept', 125, 237, 100, 'Accept', 'find-accept', chosen ? () => { chosen.reply(true); f.selected = -1; ctx.rerender(); } : null);
  button('decline', 235, 237, 100, 'Decline', 'find-decline', chosen ? () => { chosen.reply(false); f.selected = -1; ctx.rerender(); } : null);
  button('close', 625, 237, 100, 'Close', 'find-close', () => { ctx.ui.find = null; ctx.rerender(); });
  return b.spec();
}
// Ignore by name (CWindowModelBlacklistInput, main's social.js; skin.js: the small dialog's frame round its body): main's
// name prompt (mock/dialog-input1.json, as the team's name) asking for the player; OK looks the name up and ignores the
// player it names, or says no such player was found (main's OK box).
export function ignoreInputDialog(ctx: BuildContext, lists: SocialLists): WindowSpec | null {
  const d = ctx.ui.ignoreInput; if (!d) return null;
  const t = dialogInput1.windows[0]!, b = new WindowBuilder(ctx.ids, 'blacklist-input', 'CWindowModelBlacklistInput', { x: t.x, y: t.y, w: t.w, h: t.h }, { modal: true, z: 51503 });
  const cs = b.fromTemplate(t, true);
  const ok = () => { const name = d.name.trim(); if (!name || d.asked || !lists.find) return; d.asked = name; lists.find(name); ctx.rerender(); };
  const text = named(cs, 'CWindowTaskText'); if (text) Object.assign(text, { text: d.asked ? 'Looking up the player…' : 'Enter the name of the player to ignore', x: 0, y: 8, w: 336, align: 1 });
  const input = named(cs, 'CWindowTaskInput'); if (input) Object.assign(input, { x: 8, y: 56, w: 320 });
  const okButton = named(cs, 'CWindowTaskTextSwitch', 'OK'), cancel = named(cs, 'CWindowTaskTextSwitch', 'Cancel');
  if (input) { Object.assign(input, { value: d.name, focused: true, maxLen: 15 }); b.on(input, { key: 'ignore-name', label: 'Player name', text: v => { d.name = v; ctx.rerender(); }, enter: ok }); }
  if (okButton) { okButton.state = d.name.trim() && !d.asked ? 'normal' : 'disabled'; b.on(okButton, { key: 'ignore-name-ok', click: ok }); }
  if (cancel) b.on(cancel, { key: 'ignore-name-cancel', click: () => { ctx.ui.ignoreInput = null; ctx.rerender(); } });
  return b.spec();
}
/** The name Ignore by name looked up has come back: ignore that player, or say there is none. */
function settleIgnore(ctx: BuildContext, lists: SocialLists): void {
  const d = ctx.ui.ignoreInput, look = lists.lookup; if (!d?.asked || look?.name !== d.asked) return;
  ctx.ui.ignoreInput = null;
  if (look.pid) lists.ignore?.(look.pid);
  else ctx.ui.dialog = { kind: 'ok', text: `No player called "${look.name}" was found.` };
}

/** D-Mail's content (the rewrite's mail) and what its buttons do. */
export interface MailBox { mail: { from: string; fromPid: number; subject: string; body: string }[]; send(toPid: number, subject: string, body: string): void;
  /** Delete: the mail leaves the character's own mailbox (the original's mail\\rdm.dat; the server has no request for it). */
  delete(index: number): void }
// D-Mail (CWindowModelDMail, main's social.js: one 512 x 512 mail picture, skin.mailWindow). main's My Room capture
// (tools/flip.mjs sp-dmail): 256, 128; the title 0, 4, 512 wide; Write Mail 16, 40, Send Mail 132, 40 (a reply: on the
// chosen mail), Delete 395, 40 (100 x 24: the chosen mail), Close 206, 481; five subject
// rows (DMailItem) at 16, 72 + 36 n, the body 16, 272, 464 x 192. A row's sender and subject are main's generic text
// in the row's place; the chosen one's body below.
export function mailWindow(ctx: BuildContext, box: MailBox): WindowSpec | null {
  const open = ctx.ui.mail; if (!open) return null;
  const b = new WindowBuilder(ctx.ids, 'dmail', 'CWindowModelDMail', { x: 256, y: 128, w: 512, h: 512 }, { z: 51453, modal: true });
  const mail = box.mail.slice(open.top, open.top + 5), chosen = box.mail[open.selected];
  b.add('CWindowTaskShadowText', 'title', { x: 0, y: 4, w: 512, h: 32 }, { text: 'D-Mail', align: 1, fontSize: 16, color: [1, 1, 1, 1] });
  const button = (name: string, x: number, y: number, label: string, key: string, run: (() => void) | null) =>
    b.add('CWindowTaskTextSwitch', name, { x, y, w: 100, h: 24 }, { label, align: 1, state: run ? 'normal' : 'disabled', checked: false, color: [0, 0, 0, 1] }, { key, click: () => run?.() });
  const write = (to?: { pid: number; name: string }) => { ctx.ui.compose = { toPid: to?.pid ?? null, toName: to?.name ?? '', subject: '', body: '' }; ctx.rerender(); };
  button('write', 16, 40, 'Write Mail', 'mail-write', () => write());
  button('reply', 132, 40, 'Send Mail', 'mail-reply', chosen ? () => write({ pid: chosen.fromPid, name: chosen.from }) : null);
  button('delete', 395, 40, 'Delete', 'mail-delete', chosen ? () => { box.delete(open.selected); open.selected = -1; open.top = Math.max(0, Math.min(open.top, box.mail.length - 6)); ctx.rerender(); } : null);
  mail.forEach((m, i) => {
    const row = b.add('CWindowTaskTextSwitch', `row${i}`, { x: 16, y: 72 + 36 * i, w: 464, h: 32 }, { label: `${m.from}: ${m.subject}`, align: 0, state: 'normal', checked: open.top + i === open.selected, color: [0, 0, 0, 1] },
      { key: `mail-row:${open.top + i}`, click: () => { open.selected = open.top + i; ctx.rerender(); } });
    row.alpha = 1;
  });
  b.add('CWindowTaskText', 'body', { x: 16, y: 272, w: 464, h: 192 }, { text: chosen ? chosen.body : '', align: 0, fontSize: 16, lineGap: 0, firstLine: 0, pageLines: 12, color: [0, 0, 0, 1] });
  button('close', 206, 481, 'Close', 'mail-close', () => { ctx.ui.mail = null; ctx.rerender(); });
  return b.spec();
}

// Write Mail (CWindowModelDMailSend, main's social.js: the mail picture, real inputs). main's capture (tools/flip.mjs
// sp-dmail, typed): 256, 128; 'To:' 16, 48 and the recipient's name 40, 48; 'Subject:' 16, 72 and its field 73, 64 (32
// characters); the body a MultiInput 8, 96 holding its 464 x 272 multi-line Input (512); Friend List 395, 44 (the
// recipient picked from the Friend List), Send D-mail 206, 440 (103 wide, red), Close 395, 480.
export function composeWindow(ctx: BuildContext, send: (toPid: number, subject: string, body: string) => void): WindowSpec | null {
  const c = ctx.ui.compose; if (!c) return null;
  const b = new WindowBuilder(ctx.ids, 'dmailsend', 'CWindowModelDMailSend', { x: 256, y: 128, w: 512, h: 512 }, { z: 51503, modal: true });
  const text = (name: string, x: number, y: number, t: string, color = [0, 0, 0, 1]) => b.add('CWindowTaskShadowText', name, { x, y, w: 512, h: 32 }, { text: t, align: 0, fontSize: 16, color });
  b.add('CWindowTaskShadowText', 'title', { x: 0, y: 4, w: 512, h: 32 }, { text: 'D-Mail', align: 1, fontSize: 16, color: [1, 1, 1, 1] });
  text('to', 40, 48, c.toName); text('toLabel', 16, 48, 'To:'); text('subjectLabel', 16, 72, 'Subject:');
  const ready = c.toPid !== null && c.subject.trim() !== '' && c.body.trim() !== '';
  const button = (name: string, x: number, y: number, w: number, label: string, key: string, run: () => void, enabled = true, color = [0, 0, 0, 1]) =>
    b.add('CWindowTaskTextSwitch', name, { x, y, w, h: 24 }, { label, align: 1, state: enabled ? 'normal' : 'disabled', checked: false, color }, { key, click: () => { if (enabled) run(); } });
  button('close', 395, 480, 100, 'Close', 'compose-close', () => { ctx.ui.compose = null; ctx.rerender(); });
  button('send', 206, 440, 103, 'Send D-mail', 'compose-send', () => { if (c.toPid === null) return; send(c.toPid, c.subject, c.body); ctx.ui.compose = null; ctx.rerender(); }, ready, [1, 0, 0, 1]);
  button('friends', 395, 44, 100, 'Friend List', 'compose-friends', () => { ctx.ui.lists = { kind: 'friends', selected: -1, pick: true }; ctx.send({ type: 'socialAction', action: { type: 'refreshOnline' } }); ctx.send({ type: 'refreshFriends' }); ctx.rerender(); });
  const multi = b.add('CWindowTaskMultiInput', 'bodyBox', { x: 8, y: 96, w: 0, h: 0 });
  b.add('CWindowTaskInput', 'body', { x: 0, y: 0, w: 464, h: 272 }, { parent: multi.id, value: c.body, password: false, caret: null, caretOn: false, maxLen: 512, multiLine: true },
    { key: 'compose-body', label: 'Mail text', text: v => { c.body = v; ctx.rerender(); } });
  b.add('CWindowTaskInput', 'subject', { x: 73, y: 64, w: 496, h: 32 }, { value: c.subject, focused: true, password: false, caret: null, caretOn: false, maxLen: 32, multiLine: false },
    { key: 'compose-subject', label: 'Subject', text: v => { c.subject = v; ctx.rerender(); } });
  return b.spec();
}

/** Every window the current state shows through main's screens, back to front. */
export function htmlWindows(ctx: BuildContext): WindowSpec[] {
  const out: WindowSpec[] = [], { state, ui } = ctx;
  if (ui.dialog?.kind === 'deleting') deletionDone(ctx, ui.dialog);
  // (first dressing is its own scene, CHANGE_AVATAR: Select Player is gone under it)
  const account = ['create', 'delete', 'delpw', 'deleting'].includes(ui.dialog?.kind ?? '') || ui.dialog?.kind === 'ok' && !!ui.dialog.at || ui.dialog?.kind === 'avatar' && ui.dialog.slot !== null;
  if (account && state.scene !== 'characters') ui.dialog = null;   // its screen is gone
  // the account dialogs stand alone: main's game hides Select Player under them (its create capture)
  else if (state.scene === 'characters' && !account) out.push(playerSelect(ctx));
  if (state.scene === 'lobby' && state.connection === 'online') {
    const place = !ctx.covered && placeBanner(ctx); if (place) out.push(place);
    const chat = chatWindow(ctx); if (chat) out.push(chat);
    const list = !ctx.covered && (ctx.lobby ? ctx.lobby.list(ctx) : ctx.openPlayer && playerList(ctx, ctx.openPlayer)); if (list) out.push(list);
    const profile = profileWindow(ctx); if (profile) out.push(profile);
    const card = playerCard(ctx, ctx.cardActions ?? {}); if (card) out.push(card);
    if (ctx.lobby) out.push(...ctx.lobby.windows(ctx));
    saveNextComment(ctx);
    if (ui.comment) out.push(commentDialog(ctx, ui.comment));
  } else ui.comment = null;
  if (ctx.scene) out.push(...ctx.scene);
  // the shop keeps the chat (main's shop capture: the lobby's chat under the windows); not over the card-get reveal
  if (state.scene === 'shop' && state.connection === 'online' && ctx.scene?.length) { const chat = chatWindow(ctx); if (chat) out.push(chat); }
  // the duel keeps the chat (live: the engine's chat under the hand, 248, 608), the Duels tab and whispers with it
  // (not over the side deck screen between a match's games: its panel fills the stage down to Submit Sideboard)
  if (state.scene === 'duel' && state.connection === 'online' && !state.sideboarding) { const chat = chatWindow(ctx); if (chat) out.push(chat); }
  const mail = ctx.mailBox ? mailWindow(ctx, ctx.mailBox) : null; if (mail) out.push(mail); else if (!ctx.mailBox) ui.mail = null;
  const compose = ctx.mailBox ? composeWindow(ctx, ctx.mailBox.send) : null; if (compose) out.push(compose); else if (!ctx.mailBox) ui.compose = null;
  // the Friend List over Write Mail when it picks the recipient
  // the Main Menu's social windows belong to the character's session: Return to Title closes them (a Friend List left
  // open over the title stood over Go Online)
  const social = state.scene === 'title' || state.scene === 'characters' ? undefined : ctx.social;
  const lists = social ? listWindow(ctx, social) : null; if (lists) out.push(lists); else if (!social) ui.lists = null;
  const find = social ? findWindow(ctx, social) : null; if (find) out.push(find); else if (!social) ui.find = null;
  if (social) settleIgnore(ctx, social);
  const ignoreInput = social ? ignoreInputDialog(ctx, social) : null; if (ignoreInput) out.push(ignoreInput); else if (!social) ui.ignoreInput = null;
  if (ctx.deckWindows) out.push(...ctx.deckWindows());
  const menu = ctx.menu;
  if (menu) { out.push(menuBar(ctx, menu)); if (ui.menu && menu.keys) out.push(mainMenu(ctx, menu)); else ui.menu = false; }
  const d = ui.dialog;
  if (d?.kind === 'create') out.push(nameDialog(ctx, d));
  else if (d?.kind === 'delete') out.push(deleteDialog(ctx, d));
  else if (d?.kind === 'delpw') out.push(deletePasswordDialog(ctx, d));
  else if (d?.kind === 'ok') out.push(okDialog(ctx, d));
  else if (d?.kind === 'team' && ctx.social) out.push(teamNameDialog(ctx, d, ctx.social));
  else if (d?.kind === 'confirm') {
    const close = () => { ctx.ui.dialog = null; ctx.rerender(); }, k = d.key ?? 'confirm';
    out.push(stockDialog(ctx, `confirm:${k}`, 'yesno', d.text, [{ from: 'Yes', key: `${k}-yes`, click: () => { ctx.ui.dialog = null; d.yes(); ctx.rerender(); } }, { from: 'No', key: `${k}-no`, click: close }]));
  }
  else if (d?.kind === 'avatar') {
    const create = d.slot !== null, slot = d.slot, name = d.name ?? '';
    const deps: AvatarDeps = create
      ? { choices: (i, look) => freeChoices(i, look[0] === 1), busy: !!state.busy,
          confirm: look => { ui.dialog = null; ctx.send({ type: 'createCharacter', slot: slot!, name, appearance: look }); ctx.rerender(); } }
      : ctx.changeAvatar ? { ...ctx.changeAvatar, back: () => { ui.dialog = null; ctx.rerender(); } } : { choices: (i, look) => freeChoices(i, look[0] === 1), confirm: () => {}, back: () => { ui.dialog = null; ctx.rerender(); } };
    out.push(avatarSwitch(ctx, d, deps));
  }
  if (ctx.prompts) out.push(...ctx.prompts);
  return out;
}
