// The windows the rewrite shows through main's Legacy HTML UI screens, built from its ClientView (snapshot.ts). Each
// builder returns a window snapshot in main's shape plus what its controls do (ClientApp commands). Layouts: main's
// captured windows (client/web-shell/htmlui/mock/*.json) or numbers measured from main's game (tools/flip.mjs), cited.
import { discordRows, duelLines, duelRows, type DiscordDuelist, type OpenDuelView } from './discord';
import type { ClientCommand, ClientView } from '../contracts';
import { REWRITE_TEXT } from '../../features/ui-text';
import { Ids, WindowBuilder, levelText } from './snapshot';
import { AREA_FALLBACK, AREA_TEXT, WORLD_TEXT } from './lobby';
import { titleName } from '../../features/titles';
import { FLAG_ATLAS, flagCell } from '../nation-flag';
import type { HtmlControl, WindowSpec } from './snapshot';
import { avatarSwitch, freeChoices, starterLook, FIRST_CATEGORY, type AvatarDeps } from './avatar';
import playerSelectLive from './templates/playerselect-live.json';
import dialogInput1 from './templates/dialog-input1.json';
import { wrapDialogText } from './dialog-text';
export { wrapDialogText };
import dialogYesNo from './templates/dialog-yesno.json';
import dialogOk from './templates/dialog-ok.json';
import dialogError from './templates/dialog-error.json';
import lobbyCard from './templates/lobby-card.json';
import duelRequestOk from './templates/duel-request-ok.json';
import duelRequestYesNo from './templates/duel-request-yesno.json';
import duelCalledOff from './templates/duel-calledoff.json';
import playerListMock from './templates/duelsetup-plist.json';

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
export interface HtmlUiLocal { discord?: DiscordDuelist[] | null; onDiscordCard?: (p: DiscordDuelist) => void; discordCard?: DiscordDuelist | null; duels?: OpenDuelView[] | null; onJoinDuel?: (id: number) => void; dialog: HtmlDialog | null; chatTab: number; chatDraft: string; menu: boolean;
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
  /** Ignore by name (CWindowModelBlacklistInput) open: the name typed; `asked`, the name looked up for it. */
  ignoreInput?: { name: string; asked?: string } | null;
  /** Select Player's row under the pointer last (its character's waist-up portrait shows), null before one. */
  selected?: number | null }
export const htmlUiLocal = (): HtmlUiLocal => ({ dialog: null, chatTab: 0, chatDraft: '', menu: false, comment: null, commentQueue: [], commentWait: null, lists: null, mail: null, compose: null });
/** A Main Menu entry: its label (main's where the rewrite has the same thing), what it does. */
export interface MenuEntry { label: string; key: string; disabled?: boolean; run(): void }
/** The menu bar the scene shows: its keys (the Main Menu's, and the lobby's Duel and Move) and its message. */
export interface MenuView { entries: MenuEntry[]; message: string; duel?: () => void; move?: () => void; keys: boolean;
  /** The Duel / Move key's menu open: the key is drawn checked (pink), as live's; the Main Menu key too while a window
   * opened from the Main Menu is up (My Profile, Create Comment, DUEL OPTIONS, ...). */
  duelOpen?: () => boolean; moveOpen?: () => boolean; mainOpen?: () => boolean;
  /** How far main's message field moved right for the page's own bar buttons (lobby.js fieldLeft - 391: the Wardrobe and
   * Missions slots, lobby_icons.js reserveBar): the message's x follows, so main's bar redraws it at the field's start. */
  fieldShift?: number;
  /** My Room's bar: the Main Menu key alone of the game's (live: Main Menu, then the page's Wardrobe and Missions). */
  room?: boolean }

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
  /** The deck screen's chat (live's CChatWindow over the editor): 1 open under the deck windows, 2 folded to its bar,
   * 0 its bare bar (My Room: no chat there); its ▽ folds it, its △ opens it again. Absent: no chat (Free Duel). */
  deckChat?: DeckChat | null;
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
  const ok = () => { const name = dialog.name.trim(); if (!name || ctx.state.busy) return; ctx.ui.dialog = { kind: 'avatar', slot: dialog.slot, name, look: starterLook(false, Math.random), category: FIRST_CATEGORY, page: 0 }; ctx.rerender(); };
  const input = named(cs, 'CWindowTaskInput'), okButton = named(cs, 'CWindowTaskTextSwitch', 'OK'), cancel = named(cs, 'CWindowTaskTextSwitch', 'Cancel');
  // the mock is hand-made; the live game's prompt (main's create capture): its text centred at 0, 8, 336 wide, the
  // field 8, 56, 320 x 32
  const prompt = named(cs, 'CWindowTaskText'); if (prompt) Object.assign(prompt, { x: 0, y: 8, w: 336, align: 1 });
  if (input) Object.assign(input, { x: 8, y: 56, w: 320 });
  if (input) { Object.assign(input, { value: dialog.name, focused: true, maxLen: 16, caretOn: false }); b.on(input, { key: 'character-name', label: 'Player name', text: v => { dialog.name = v; ctx.rerender(); }, enter: ok }); }
  if (okButton) { okButton.state = dialog.name.trim() ? 'normal' : 'disabled'; b.on(okButton, { key: 'character-create-ok', click: ok }); }
  if (cancel) b.on(cancel, { key: 'character-create-cancel', click: close });
  // live opens it with the caret in the name field (CWindowTaskInput focused): the real input takes the focus once,
  // after the layer has drawn it, unless the player is already in another of its controls
  const spec = b.spec();
  spec.after = root => {
    const field = root.querySelector('input'); if (!field || FOCUSED.has(field)) return;
    FOCUSED.add(field);
    setTimeout(() => { const at = document.activeElement; if (field.isConnected && (!at || !root.contains(at) || at === field)) field.focus({ preventScroll: true }); }, 0);
  };
  return spec;
}
const FOCUSED = new WeakSet<HTMLInputElement>();
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
  const spec = templateDialog(ctx, key, template, text, buttons);
  if (kind === 'error') Object.assign(spec.win, { topmost: true, z: 51403 });
  return spec;
}
/** A dialog from a captured template (its window, place and frame), this text, its buttons relabelled where asked. */
function templateDialog(ctx: Pick<BuildContext, 'ids'>, key: string, template: typeof dialogYesNo, text: string, buttons: StockButton[]): WindowSpec {
  const spec = messageDialog(ctx, key, template, text, Object.fromEntries(buttons.map(b => [b.from, [b.key, b.click]])));
  for (const b of buttons) {
    const c = spec.win.controls.find(k => k.cls === 'CWindowTaskTextSwitch' && k.label === b.from); if (!c) continue;
    if (b.label && b.label !== b.from) { c.label = b.label; for (const t of spec.win.controls) if (t.parent === c.id && t.text === b.from) t.text = b.label; }
    const h = spec.handlers.get(c.id); if (h && (b.aria ?? b.label)) h.label = b.aria ?? b.label;
  }
  return spec;
}
// The duel request's boxes as live shows them (CNetDuelRequestTask and the lobby's offer prompt; captured on
// original.ygoevolution.com 2026-11-12, templates/duel-request-*.json): translucent blue lobby dialogs (frame style 1)
// at 420, 280, 336 x 144, the other duelist's waist-up portrait at the right meanwhile (BUST_AT). The challenger waits in
// "Requesting Duel" / Cancel (an Ok whose one button is Cancel); a refusal turns it into "Duel Request was refused." /
// OK; the one asked reads "\nLv1 Name\n[Title]\n\nYou have aDuel Request!\n Will you accept?" (centred) with Yes / No. A
// duel the server calls off before it starts (the other duelist gone): "<name> has disconnected." / OK, 236, 312, 552
// wide. "There is no response from your opponent." and the other refusals stay the error box (orange), as on live.
/** The words (yo2text_?) and live's English where the original data is not loaded. */
export const DUEL_REQUEST_TEXT = { requesting: 0x1481, received: 0x1482, refused: 0x1483, disconnected: 0x11a7 } as const;
const DUEL_REQUEST_FALLBACK: Record<keyof typeof DUEL_REQUEST_TEXT, string> = { requesting: 'Requesting Duel',
  received: 'You have aDuel Request!\n Will you accept?', refused: 'Duel Request was refused.', disconnected: '%s has disconnected.' };
export const duelRequestText = (text: BuildContext['text'], k: keyof typeof DUEL_REQUEST_TEXT): string => text?.(DUEL_REQUEST_TEXT[k]) ?? DUEL_REQUEST_FALLBACK[k];
export type DuelRequestBox =
  | { kind: 'requesting'; cancel(): void }
  | { kind: 'received'; name: string; level?: number; title?: string; yes(): void; no(): void }
  | { kind: 'refused'; ok(): void }
  | { kind: 'calledOff'; text: string; ok(): void };
export function duelRequestDialog(ctx: Pick<BuildContext, 'ids' | 'text'>, box: DuelRequestBox): WindowSpec {
  const ok = duelRequestOk as unknown as typeof dialogYesNo;
  if (box.kind === 'requesting') return templateDialog(ctx, 'duel-request', ok, duelRequestText(ctx.text, 'requesting'),
    [{ from: 'Cancel', key: 'duel-request-cancel', aria: 'Cancel the duel request', click: box.cancel }]);
  if (box.kind === 'refused') return templateDialog(ctx, 'duel-refused', ok, duelRequestText(ctx.text, 'refused'),
    [{ from: 'Cancel', label: 'OK', key: 'duel-refused-ok', click: box.ok }]);
  if (box.kind === 'calledOff') return templateDialog(ctx, 'duel-calledoff', duelCalledOff as unknown as typeof dialogYesNo, box.text,
    [{ from: 'OK', key: 'duel-calledoff-ok', click: box.ok }]);
  const who = `${box.level !== undefined ? `Lv${box.level} ` : ''}${box.name}`;
  const text = `\n${who}\n${box.title ? `[${box.title}]` : ''}\n\n${duelRequestText(ctx.text, 'received')}`;
  return templateDialog(ctx, 'duel-invitation', duelRequestYesNo as unknown as typeof dialogYesNo, text,
    [{ from: 'Yes', key: 'duel-accept', aria: 'Accept Duel', click: box.yes }, { from: 'No', key: 'duel-decline', aria: 'Decline', click: box.no }]);
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
/** The trade's chat tab (live: the chat window in a trade adds "Trade Partner" between Trade and Team, moving Team and
 * Duels along by its width less the 8 px overlap): the partner's whispers; what is typed there is whispered to the
 * partner. It is the CHAT_TABS index after the last, so the lobby's tab indexes never move. */
export const TRADE_PARTNER_TAB = { key: 'partner', label: 'Trade Partner', x: 145, w: 126, channel: 'whisper' } as const;
type ChatTab = { key: string; label: string; x: number; w: number; channel: string; shows: (channel: string, sender?: string) => boolean; target?: string };
/** The chat's tabs: the lobby's, and in a trade the partner's tab at live's place. */
export function chatTabsFor(partner: string | null): readonly ChatTab[] {
  if (!partner) return CHAT_TABS;
  const shift = TRADE_PARTNER_TAB.w - 8, name = partner.trim();
  return [...CHAT_TABS.map(t => t.x > 81 ? { ...t, x: t.x + shift } : t),
    { ...TRADE_PARTNER_TAB, target: name, shows: (c: string, sender?: string) => c === 'whisper' && sender?.trim() === name }];
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
/** The tabs stacked as the game stacks them (yo2WindowChat.cpp layout: along the bar the first tab at z = count, each
 * next one 1 lower, the current one count + 2; live's read.js hands main's chat.js the controls by that z), so each
 * tab lies over the one to its right and the current one over both neighbours: the Duels tab, the last, under Team
 * unless it is the current one (main bb0c7de). main's chat.js draws the controls back to front in array order, so the
 * tabs take the places they held there, rightmost first, the current one last. */
export function stackChatTabs(controls: HtmlControl[]): void {
  const at: number[] = [], tabs: HtmlControl[] = [];
  controls.forEach((c, i) => { if (c.cls === 'CWindowTaskTab') { at.push(i); tabs.push(c); } });
  const cur = tabs.find(c => c.active), n = tabs.length;
  const byX = [...tabs].sort((a, b) => a.x - b.x);
  byX.forEach((c, i) => { c.z = c === cur ? n + 2 : n - i; });
  const order = [...tabs].sort((a, b) => a.z - b.z);
  at.forEach((i, k) => { controls[i] = order[k]!; });
}
export interface DeckChat { mode: 0 | 1 | 2; fold(): void; unfold(): void }
export function chatWindow(ctx: BuildContext, deck?: DeckChat): WindowSpec | null {
  const lobby = ctx.state.lobby; if (!lobby) return null;
  // live's deck screen: the chat folded to its bar (mode 2, 248, 712 x 32, drawn 24 high: the tabs and △ only), or
  // its bare bar in My Room (no tabs)
  if (deck && deck.mode !== 1) return foldedChat(ctx, deck);
  const b = new WindowBuilder(ctx.ids, 'chat', 'CChatWindow', { x: 248, y: 608, w: 776, h: 128 }, { z: 51303, mode: 1, online: true, world: true, pairs: [] as unknown[] });
  // live's duel chat has the lobby's tabs (All Chat / Trade / Team / Duels), no duel tab of its own; a trade adds its
  // partner's tab
  const trade = ctx.state.socialDetail?.trade, partner = trade && ['open', 'closing', 'finished'].includes(trade.phase) ? trade.partner?.name ?? null : null;
  const tabs = chatTabsFor(partner);
  const tab = ctx.ui.chatTab >= 0 && ctx.ui.chatTab < tabs.length ? ctx.ui.chatTab : 0;
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
  stackChatTabs(b.win.controls);
  b.add('CWindowTaskIconExpand', 'expand', { x: 757, y: 0, w: 16, h: 24 }, { pressed: false, enabled: false });
  // on the deck screen its ▽ (live's capture there: the △ off, the ▽ over it) folds it to its bar
  if (deck) b.add('CWindowTaskIconHide', 'hide', { x: 757, y: 0, w: 16, h: 24 }, { pressed: false, enabled: true }, { key: 'chat-fold', label: 'Shorter', click: () => deck.fold() });
  // nothing while the app is busy (the old Send was disabled then): the line stays to be sent with the next Enter
  const send = () => { const partnerTab = tabs[tab]?.target, typed = ctx.ui.chatDraft.trim(), command = partnerTab && typed && !/^\//.test(typed) ? { type: 'chat' as const, channel: 'whisper' as const, target: partnerTab, text: typed } : chatCommand(tab, ctx.ui.chatDraft, lobby.avatars.map(a => a.name)); if (!command || !lobby.connected || ctx.state.busy) return; ctx.ui.chatDraft = ''; ctx.send(command); ctx.rerender(); };
  // an account the admin barred from chat (0x3004's SANCTION_CHAT): the line greyed out with the notice, nothing to type
  if (ctx.state.sanctions?.chat) {
    b.add('CWindowTaskText', 'input', { x: 8, y: 104, w: 760, h: 16 }, { text: CHAT_SANCTION_NOTICE, align: 0, fontSize: 12, color: [0.5, 0.5, 0.5, 1] });
    return b.spec();
  }
  b.add('CWindowTaskInput', 'input', { x: 0, y: 96, w: 776, h: 32 }, { focused: true, value: ctx.ui.chatDraft, password: false, caret: null, caretOn: false, maxLen: 128, multiLine: false },
    { key: 'chat', label: 'Chat message', text: v => { ctx.ui.chatDraft = v; }, enter: send });
  return b.spec();
}

// The chat folded to its bar on the deck screen (live's capture: CChatWindow mode 2 at 248, 712, 776 x 32, drawn 24
// high; its icon bar inactive, the tabs over it, the ▽ off and the △ on (it opens the chat again), the frame and the
// logs put away); in My Room the bar alone (live's chat has no tabs there).
function foldedChat(ctx: BuildContext, deck: DeckChat): WindowSpec {
  const b = new WindowBuilder(ctx.ids, 'chat', 'CChatWindow', { x: 248, y: 712, w: 776, h: 32 }, { z: 51303, mode: 2, online: true, world: true, pairs: [] as unknown[], drawn: { x: 248, y: 712, w: 776, h: 24 } });
  if (deck.mode === 2) b.add('CWindowTaskIconHide', 'hide', { x: 757, y: 0, w: 16, h: 24 }, { pressed: false, enabled: false });
  b.add('CWindowTaskThinChop', 'frame', { x: 99999, y: 0, w: 776, h: 8 });
  b.add('CWindowTaskBackPlane', 'plane', { x: 8, y: 24, w: 760, h: 0 });
  b.add('CWindowTaskIconbar', 'bar', { x: 0, y: 0, w: 776, h: 24 }, { active: false });
  if (deck.mode === 2) {
    const tabs = chatTabsFor(null), tab = ctx.ui.chatTab >= 0 && ctx.ui.chatTab < tabs.length ? ctx.ui.chatTab : 0;
    b.win.pairs = tabs.map((t, i) => {
      const tc = b.add('CWindowTaskTab', `tab${i}`, { x: t.x, y: 0, w: t.w, h: 24 }, { label: t.label, active: i === tab },
        { key: `chat-tab:${t.key}`, label: t.label.trim(), click: () => { ctx.ui.chatTab = i; ctx.rerender(); } });
      const log = b.add('CWindowTaskTextlist', `log${i}`, { x: 8, y: 99999, w: 760, h: -16 }, { shown: false, items: [], selected: -1, top: 0, topLine: 0, rows: 0 });
      return { tab: tc.id, log: log.id, visible: true };
    });
    stackChatTabs(b.win.controls);
    b.add('CWindowTaskIconExpand', 'expand', { x: 757, y: 0, w: 16, h: 24 }, { pressed: false, enabled: true }, { key: 'chat-unfold', label: 'Taller', click: () => deck.unfold() });
  }
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
    key('MENUBAR_MENU_MAIN', 0, 0, () => { ctx.ui.menu = !ctx.ui.menu; ctx.rerender(); }, 'main-menu', 'Main Menu', ctx.ui.menu || !!menu.mainOpen?.());
    if (!menu.room) {
      key('MENUBAR_MENU_DUEL', 80, 32, menu.duel, 'menubar-duel', 'Duel', !!menu.duelOpen?.());
      key('MENUBAR_MENU_MOVE', 160, 96, menu.move, 'menubar-move', 'Move', !!menu.moveOpen?.());
    }
  }
  return b.spec();
}
// The Main Menu (CMainMenu, main's lobby.js: skin.js's panel, title bar with its close box, menu buttons): main's lobby
// capture: 0, 386, 282 x 350 for 12 entries, the title 'Main Menu' 8, 0, 264 x 24, the close box 263, 0, the entries
// 12, 27 + 26 n, 258 x 24; the window stands on the menu bar (its bottom at 736).
export function mainMenu(ctx: BuildContext, menu: MenuView): WindowSpec {
  // live's capture: the entries at 12, 27 + 26 n (24 high), the panel 38 + 26 n high standing on the bar (12 entries: 0, 386, 282 x 350)
  const h = 38 + 26 * menu.entries.length, b = new WindowBuilder(ctx.ids, 'mainmenu', 'CMainMenu', { x: 0, y: 736 - h, w: 282, h }, { z: 51603, modal: false, drawn: { x: 0, y: 736 - h, w: 279, h: h - 13 } });
  const close = () => { ctx.ui.menu = false; ctx.rerender(); };
  b.add('CWindowTaskFrameMain', 'frame', { x: 0, y: 0, w: 0, h: 0 });
  b.add('CWindowTaskShadowText', 'title', { x: 8, y: 0, w: 264, h: 24 }, { text: 'Main Menu', align: 1, fontSize: 16, color: [1, 1, 1, 1] });
  b.add('CWindowTaskIconHide', 'close', { x: 263, y: 0, w: 16, h: 24 }, { pressed: false }, { key: 'main-menu-close', label: 'Close the Main Menu', click: close });
  menu.entries.forEach((e, i) => b.add('CWindowTaskButtonMain', `entry:${e.key}`, { x: 12, y: 27 + 26 * i, w: 258, h: 24 },
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
  // the area's players (live counts people, not the map's NPCs)
  const here = lobby.avatars.filter(a => !a.npc).length;
  text('mapCount', at, 26, myRoom ? `(${here})` : `(${here}/32)`, 2);
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
    // Miles: the account's MP (live: 5040 for a new character); the avatar info's own field reads 0 on this server
    ['Miles', d ? String(d.mp || ctx.state.player?.mp || ctx.state.shop?.mp || 0) : ''],
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
export interface CardActions { friend?(): void; trade?(): void; whisper?(): void; ignore?(): void; jump?(): void; team?(): void; duel?(): void; watch?(): void }
// A player's card (CPlayerListMenu, main's lobby.js: its frame, planes and Help texts from the controls' parts and
// children, the generic buttons): main's captured card (mock/lobby-card.json, 248, 279, 336 wide) with this player's
// level and name (red), title, wins / losses and comment, and a button per action the rewrite has, 36 px apart from
// 148 as the game stacks them (the window and the plane under the buttons grow with them; a card of another height
// draws main's CSS thin frame, the captured frame pieces fit the 328-high card only).
// live's order (CPlayerListMenu::layout, yo2PlayerListMenu.cpp: Friend, Trade, Chat Message, Ignore, Watch, Go to the
// same Area, Invite to Team only for a team's leader inviting someone in none; live's card puts Send Duel Request last);
// no Send D-mail (live's card has none)
const CARD_BUTTONS: [string, keyof CardActions, string][] = [
  ['フレンド申し込みボタン', 'friend', 'card-friend'], ['トレード申し込みボタン', 'trade', 'card-trade'], ['チャットメッセージボタン', 'whisper', 'card-whisper'],
  ['ブラックリストボタン', 'ignore', 'card-ignore'], ['観戦ボタン', 'watch', 'card-watch'], ['近くに飛ぶボタン', 'jump', 'card-jump'],
  ['チームに誘うボタン', 'team', 'card-team'], ['デュエル申し込みボタン', 'duel', 'card-duel'],
];
export function playerCard(ctx: BuildContext, actions: CardActions): WindowSpec | null {
  const p = ctx.state.profileDetail; if (!p || p.selectedPid === null || p.selectedPid === p.selfPid) return null;
  const t = lobbyCard.windows[0]!, shown = CARD_BUTTONS.filter(([, k]) => actions[k]), n = shown.length, h = 148 + 36 * Math.max(1, n);
  // where live has it (main's capture: 248, 279), over the player list and chat row when it grows past the capture's (live:
  // six buttons reach 643); only a card taller than that stands on the menu bar
  const y = Math.min(t.y, 736 - h);
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
/** The nation flag the engine draws at 8, 8 of the card (CPlayerListMenu: lobbyNationFlagSet(flag_, country_),
 * flag_->pos_ = {8, 8, 10}), from the small atlas over the name's plane. */
function cardFlag(ctx: BuildContext, card: WindowSpec): WindowSpec | null {
  const cell = flagCell(ctx.state.profileDetail?.summary?.country); if (!cell) return null;
  const w = card.win;
  return new WindowBuilder(ctx.ids, `card-flag:${w.id}`, 'CEnginePictures', { x: 0, y: 0, w: 1024, h: 768 }, { z: 51604,
    pics: [{ key: 'flag', source: { archive: FLAG_ATLAS }, x: w.x + 8, y: w.y + 8, w: 22, h: 15, z: 0, crop: [cell[0], cell[1], 22, 15], shown: true }] }).spec();
}
// A Discord duelist's card (live: main 4fe1425 / 2020bff, screens/playerlist.js discordCard): the game's player card
// (main's captured CPlayerListMenu, as playerCard) where it opens (336 wide, its bottom on the player list's top, from
// x 248), with "LV12  Name" in the card's red and the ranked standing under it (main's lobby.js cardRank by the pid),
// Status / the Discord logo and "Online on Discord, not in the game", and Close: live offers no duel to someone who is
// not in the game (the Discord flow is the #duels Accept link, ?duel=). The bust is the rewrite's (index.ts: the
// WaistUpComposer at BUST_AT, under the windows); the logo is drawn in the card's own root (WindowSpec.after).
export const DISCORD_ONLINE = 'Online on Discord, not in the game';
/** Where live draws the bust: its 768 x 768 waist-up canvas at 1:1 from (530, 0), cut at the screen's right edge. */
export const BUST_AT = { x: 530, y: 0, size: 768 } as const;
export const DISCORD_LOGO_SVG = 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 127.14 96.36"><path fill="#5865F2" d="M107.7 8.07A105.15 105.15 0 0 0 81.47 0a72.06 72.06 0 0 0-3.36 6.83 97.68 97.68 0 0 0-29.11 0A72.37 72.37 0 0 0 45.64 0a105.89 105.89 0 0 0-26.25 8.09C2.79 32.65-1.71 56.6.54 80.21a105.73 105.73 0 0 0 32.17 16.15 77.7 77.7 0 0 0 6.89-11.11 68.42 68.42 0 0 1-10.85-5.18c.91-.66 1.8-1.34 2.66-2a75.57 75.57 0 0 0 64.32 0c.87.71 1.76 1.39 2.66 2a68.68 68.68 0 0 1-10.87 5.19 77 77 0 0 0 6.89 11.1 105.25 105.25 0 0 0 32.19-16.14c2.64-27.38-4.51-51.11-18.9-72.15ZM42.45 65.69C36.18 65.69 31 60 31 53s5-12.74 11.43-12.74S54 46 53.89 53s-5.05 12.69-11.44 12.69Zm42.24 0C78.41 65.69 73.25 60 73.25 53s5-12.74 11.44-12.74S96.23 46 96.12 53s-5.04 12.69-11.43 12.69Z"/></svg>');
export function discordCard(ctx: BuildContext, p: DiscordDuelist): WindowSpec {
  const t = lobbyCard.windows[0]!, h = 148 + 36, x = 248, y = 608 - 1 - h;
  const b = new WindowBuilder(ctx.ids, `discord-card:${p.pid}`, t.cls, { x, y, w: t.w, h }, { modal: false, z: 51603, pid: p.pid });
  const cs = b.fromTemplate(t, true);
  const helpOf = (key: string) => cs.find(c => c.cls === 'CWindowTaskHelp' && c.name.includes(key));
  const help = (key: string, text: string) => { const hp = helpOf(key); const tx = hp && cs.find(c => c.parent === hp.id && c.cls === 'CWindowTaskText'); if (tx) tx.text = text; };
  const hide = (key: string) => { const hp = helpOf(key); if (!hp) return; hp.shown = false; for (const c of cs) if (c.parent === hp.id) c.shown = false; };
  help('レベル＆名前', `LV${String(p.lv).padStart(2, '0')}  ${p.name}\n`);
  // the card's label row and its value row: Status / the logo and the words (the value right-aligned past the logo)
  help('『称号：』', 'Status'); help('称号テキスト', `     ${DISCORD_ONLINE}`);
  for (const k of ['『勝率：』', '勝率テキスト', '『コメント:』', 'コメントテキスト']) hide(k);
  const frame = cs.find(c => c.cls === 'CWindowTaskFrameThin');
  if (frame) { frame.h = h; frame.parts = { sprites: [], labels: [], swfs: [] }; }
  const plane = cs.find(c => c.cls === 'CWindowTaskBackPlane' && !c.parent && c.name.includes('背景')); if (plane) { plane.y = 84; plane.h = 36; }
  for (const c of cs) if (c.cls === 'CWindowTaskTextSwitch' && !c.parent) { c.shown = false; c.parts = undefined; }
  const close = cs.find(c => c.cls === 'CWindowTaskTextSwitch' && c.name.trim() === 'フレンド申し込みボタン');
  if (close) {
    Object.assign(close, { shown: true, x: 24, y: 92, w: 288, h: 24, state: 'normal', label: 'Close' });
    const relabel = (id: number) => { for (const c of cs) if (c.parent === id) { if (typeof c.text === 'string') c.text = 'Close'; relabel(c.id); } };
    relabel(close.id);
    b.on(close, { key: 'discord-card-close', label: 'Close', click: () => { ctx.ui.discordCard = null; ctx.rerender(); } });
  }
  const spec = b.spec();
  return { ...spec, after: root => discordLogoIn(root, 8 + 4, 60 + 3) };
}
/** The Discord logo (13 x 10 beside 16-px text, as live's discord-logo.js) at (x, y) of a window's root, once. */
export function discordLogoIn(root: HTMLElement, x: number, y: number): void {
  if (root.querySelector('img.de-discord-logo')) return;
  const img = root.ownerDocument.createElement('img');
  img.className = 'de-discord-logo'; img.src = DISCORD_LOGO_SVG; img.alt = 'Discord'; img.draggable = false;
  Object.assign(img.style, { position: 'absolute', left: `${x}px`, top: `${y}px`, width: '13px', height: '10px', pointerEvents: 'none', zIndex: '5' });
  root.append(img);
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
  /** A name looked up (its pid when found: Ignore by name), the server's refusal, invitations waiting. */
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
  // live's Ignore List is narrower: 162, 282, 700 x 204 (Remove from Ignore List 50, Close 301, Add to Ignore List 451)
  const W = open.kind === 'ignore' ? 700 : 900;
  // Write Mail's Friend List (the recipient's pick) opens over Write Mail, as the engine stacks a window opened later
  const b = new WindowBuilder(ctx.ids, `list:${open.kind}`, cls, { x: open.kind === 'ignore' ? 162 : 62, y: 282, w: W, h: 204 }, { z: open.pick ? 51553 : 51453, modal: true });
  const close = () => { ctx.ui.lists = null; ctx.rerender(); };
  const rows = open.kind === 'friends' ? lists.friends : open.kind === 'ignore' ? lists.ignored : lists.team?.members ?? [];
  if (open.selected >= rows.length) open.selected = -1;
  b.add('CWindowTaskFrameDuel', 'frame', { x: 0, y: 0, w: 0, h: 0 });
  const title = { friends: 'Friend List', ignore: 'Ignore List', team: lists.team ? `Team List: ${lists.team.name}` : '' }[open.kind];
  // live's Team List has no title until there is a team
  b.add('CWindowTaskShadowText', 'title', { x: 0, y: 4, w: W, h: 204 }, { text: title, align: 1, fontSize: 16, color: [1, 1, 1, 1] });
  // a friend's row as the Team List's: the name at 16, where they are at 230 ("@>N/" pen moves, main's chat.js rowRuns),
  // Offline when the server doesn't report them; a name's own "@" doubled so it can't read as a pen move
  const line = (r: { name: string; online?: boolean; place?: string }) => open.kind === 'friends' && r.online !== undefined
    ? `@>16/${r.name.replace(/[@＠]/g, '$&$&')}@>230/${r.online ? r.place || 'Online' : 'Offline'}` : r.name;
  const list = b.add('CWindowTaskListbox', 'list', { x: 13, y: 32, w: W - 26, h: 128 }, { items: rows.map((r, i) => `${i === open.selected ? '> ' : ''}${line(r)}`), selected: open.selected, top: 0, topLine: 0, rows: 8 });
  b.on(list, { label: title || 'Team List', click: point => { if (!point) return; const i = Math.floor((point[1] - 282 - 32) / 16); if (i >= 0 && i < rows.length) { open.selected = i; ctx.rerender(); } } });
  const button = (name: string, x: number, w: number, label: string, key: string, run: (() => void) | null) =>
    b.add('CWindowTaskButtonDuel', name, { x, y: 173, w, h: 24 }, { label, align: 1, state: run ? 'normal' : 'disabled', color: [0, 0, 0, 1] }, { key, click: () => run?.() });
  const chosen = rows[open.selected];
  if (open.kind === 'friends' && open.pick) button('remove', 125, 200, 'Send D-mail', 'list-pick', chosen && ctx.ui.compose ? () => { ctx.ui.compose!.toPid = chosen.pid; ctx.ui.compose!.toName = chosen.name; ctx.ui.lists = null; ctx.rerender(); } : null);
  else if (open.kind === 'friends') button('remove', 125, 200, 'Remove from Friend List', 'list-remove', chosen ? () => { lists.removeFriend(chosen.pid); open.selected = -1; ctx.rerender(); } : null);
  if (open.kind === 'ignore') button('remove', 50, 200, 'Remove from Ignore List', 'list-remove', chosen ? () => { lists.unignore(chosen.pid); open.selected = -1; } : null);
  // live's Friend List has Remove from Friend List and Close alone (friend and team requests are answered in the game's
  // own Yes / No: invitationDialog); the Ignore List adds by name (CWindowModelBlacklistInput) from its Add to Ignore
  // List, right of Close, as live
  if (open.kind === 'ignore' && lists.find) button('add', 451, 200, 'Add to Ignore List', 'list-add', () => { ctx.ui.ignoreInput = { name: '' }; ctx.rerender(); });
  if (open.kind === 'team') {
    if (!lists.team) button('form', 403.5, 93, 'Form Team', 'team-form', () => { ctx.ui.dialog = { kind: 'team', name: '' }; ctx.rerender(); });
    // the original asks first (a YesNo), as it does every irreversible step
    else if (lists.team.leader) button('disband', 391, 118, 'Disband Team', 'team-disband', () => { ctx.ui.dialog = { kind: 'confirm', key: 'team-disband', text: 'Disband this team for every member?', yes: () => lists.disbandTeam() }; ctx.rerender(); });
    else button('leave', 400.5, 99, 'Leave Team', 'team-leave', () => { ctx.ui.dialog = { kind: 'confirm', key: 'team-leave', text: 'Leave your current team?', yes: () => lists.leaveTeam() }; ctx.rerender(); });
  }
  button('close', open.kind === 'ignore' ? 301 : 625, 100, 'Close', 'list-close', close);
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

// A friend or team request waiting (the server's 0x4512 / team invitation): the game's own Yes / No over the scene
// (main's stock dialog), one at a time, oldest first; Yes accepts, No declines
export function invitationDialog(ctx: BuildContext, lists: SocialLists): WindowSpec | null {
  const offer = lists.offers?.[0], team = offer ? undefined : lists.teamInvites?.[0];
  if (offer) return stockDialog(ctx, `friend-offer:${offer.pid}`, 'yesno', `${offer.name} (Lv ${offer.level}) wants to add you to their Friend List. Accept?`,
    [{ from: 'Yes', key: 'friend-offer-yes', click: () => { lists.replyFriend?.(offer.pid, true); ctx.rerender(); } }, { from: 'No', key: 'friend-offer-no', click: () => { lists.replyFriend?.(offer.pid, false); ctx.rerender(); } }]);
  if (team) return stockDialog(ctx, `team-invite:${team.teamId}`, 'yesno', `${team.inviterName} invites you to the team ${team.teamName}. Join?`,
    [{ from: 'Yes', key: 'team-invite-yes', click: () => { lists.replyTeam?.(team.teamId, team.inviterPid, true); ctx.rerender(); } }, { from: 'No', key: 'team-invite-no', click: () => { lists.replyTeam?.(team.teamId, team.inviterPid, false); ctx.rerender(); } }]);
  return null;
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

/** D-Mail's (and Write Mail's) title: white over the engine's heavy black shadow, 2 px down and right (live). */
function mailTitle(b: WindowBuilder): void {
  const title = b.add('CWindowTaskShadowText', 'title', { x: 0, y: 4, w: 512, h: 32 }, { text: 'D-Mail', align: 1, fontSize: 16, color: [1, 1, 1, 1] });
  b.add('CWindowTaskText', 'titleShadow', { x: 2, y: 6, w: 512, h: 32 }, { parent: title.id, text: title.text, align: 1, fontSize: 16, color: [0, 0, 0, 1] });
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
  mailTitle(b);
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
  mailTitle(b);
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
    // My Room shows none of the place plate, the chat and the player list (live: the room and the bar alone)
    const room = state.location === 'my-room';
    const place = !ctx.covered && !room && placeBanner(ctx); if (place) out.push(place);
    // live's free-mode lobby has the player list alone, no chat window
    const chat = !room && state.mode !== 'free' ? chatWindow(ctx) : null; if (chat) out.push(chat);
    const list = !ctx.covered && !room && (ctx.lobby ? ctx.lobby.list(ctx) : ctx.openPlayer && playerList(ctx, ctx.openPlayer)); if (list) out.push(list);
    const profile = profileWindow(ctx); if (profile) out.push(profile);
    const card = playerCard(ctx, ctx.cardActions ?? {}); if (card) { out.push(card); const flag = cardFlag(ctx, card); if (flag) out.push(flag); }
    if (card) ui.discordCard = null;   // one card at a time
    else if (ui.discordCard) out.push(discordCard(ctx, ui.discordCard));
    if (ctx.lobby) out.push(...ctx.lobby.windows(ctx));
    saveNextComment(ctx);
    if (ui.comment) out.push(commentDialog(ctx, ui.comment));
  } else { ui.comment = null; ui.discordCard = null; }
  if (ctx.scene) out.push(...ctx.scene);
  // (live's card shop and its pack reveal show no chat and no bar under them)
  // the duel keeps the chat (live: the engine's chat under the hand, 248, 608), the Duels tab and whispers with it
  // (not over the side deck screen between a match's games: its panel fills the stage down to Submit Sideboard)
  // (live: no chat window during rock-paper-scissors, nor behind the result board)
  if (state.scene === 'duel' && state.connection === 'online' && !state.sideboarding && !state.preparation && !(state.duel?.ended && !state.replay)) { const chat = chatWindow(ctx); if (chat) out.push(chat); }
  const mail = ctx.mailBox ? mailWindow(ctx, ctx.mailBox) : null; if (mail) out.push(mail); else if (!ctx.mailBox) ui.mail = null;
  const compose = ctx.mailBox ? composeWindow(ctx, ctx.mailBox.send) : null; if (compose) out.push(compose); else if (!ctx.mailBox) ui.compose = null;
  // the Friend List over Write Mail when it picks the recipient
  // the Main Menu's social windows belong to the character's session: Return to Title closes them (a Friend List left
  // open over the title stood over Go Online)
  const social = state.scene === 'title' || state.scene === 'characters' ? undefined : ctx.social;
  const lists = social ? listWindow(ctx, social) : null; if (lists) out.push(lists); else if (!social) ui.lists = null;
  const invitation = social && state.scene === 'lobby' && !ui.dialog ? invitationDialog(ctx, social) : null; if (invitation) out.push(invitation);
  if (social) settleIgnore(ctx, social);
  const ignoreInput = social ? ignoreInputDialog(ctx, social) : null; if (ignoreInput) out.push(ignoreInput); else if (!social) ui.ignoreInput = null;
  if (ctx.deckWindows) out.push(...ctx.deckWindows());
  // the deck screen keeps the chat as live's does (open under the deck windows, or folded to its bar)
  if (state.scene === 'deck' && state.connection === 'online' && ctx.deckChat) { const chat = chatWindow(ctx, ctx.deckChat); if (chat) out.push(chat); }
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
