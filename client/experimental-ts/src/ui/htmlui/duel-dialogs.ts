// The duel's question dialogs through main's screens/duel.js (scene 0x1c: CUYesNoDialog, CUSelectDialog,
// CUSelectAttributeDialog), built from the rewrite's prompt model (contracts.ts DuelPromptView). duel.js draws a
// window's frames (FrameThin / FrameBottomThick, the atlases' sampled colours), its text field, its striped list and
// its TextSwitch plates; the rewrite gives each its prompt's texts and what its controls do.
//  - two options (Yes / No, or any pair: the original's CUYesNoDialog / CUPhaseYesNoDialog): the bottom-thick frame,
//    the question in its text field, one button per option on the band
//  - more options (an effect, a position, a number from a list: CUSelectDialog): the thin frame, the question above,
//    one 16-px row per option, the row under the pointer highlighted (CUSelectDialog::tick), a click answers
//  - attributes (CUSelectAttributeDialog): the rows mark and unmark, OK answers once the count is right
// Each row is a TextSwitch button (duel.js draws a list as stripes only, and on main the engine hit-tests its rows; the
// rewrite takes input on elements, so a row is a real <button>).
//  - card lists (the original's CCardListView: a pile, a list choice; the server's min / max, ordered marks): the
//    CUSelectDialog look, one TextSwitch row per card (marked rows pressed, numbered in pick order), ten to a page,
//    OK once the count is right; a read-only pile's rows open the card's details
//  - free number entry and card-name declaration: main's dialog.js CWindowModelInput1 (a FramePlane, its Text, a real
//    <input> taking every edit and Enter, TextSwitch plates); the declaration narrows the declarable names as it is
//    typed (duel-announce.ts matchDeclarable, the original's CWindowTaskListSearch), its matches TextSwitch rows.
// Drafts (the typed number or search, the list page) live in `local`, which the caller makes anew for every prompt.
import type { DuelPromptView, DuelResponse } from '../contracts';
import { ANNOUNCE_SHOWN, matchDeclarable } from '../duel-announce';
import { WindowBuilder, type Ids, type WindowSpec } from './snapshot';

export interface DuelDialogContext {
  ids: Ids; busy: boolean;
  /** The rows marked in a multiple choice (attributes), the row under the pointer; kept by the caller per prompt. */
  local: { selected: Set<string>; hover?: string | null; draft?: string; page?: number };
  respond(response: DuelResponse): void;
  rerender(): void;
  /** A read-only list's row: show that card's details. */
  inspect?(candidateId: string): void;
}

const LH = 16, ROW = 20;
/** Whether main's duel dialogs show this prompt (else the duel screen's own panel does). */
export function duelDialogCovers(p: DuelPromptView): boolean {
  if (p.kind === 'cards') return !!p.candidates?.length;
  if (p.kind === 'announce') return !p.candidates?.length;
  // an option prompt that lists the cards it is about keeps the duel screen's panel (its cards are for reading)
  if (p.candidates?.length || p.declarable?.length) return false;
  if (p.kind === 'place') return false;
  if (p.kind === 'number' && !p.options.length) return true;
  return p.options.length > 0 || p.kind === 'acknowledge';
}
const PAGE = 10;
/** TextSwitch plates side by side across a band at `y` of a `w`-wide window. */
function plates(b: WindowBuilder, w: number, y: number, buttons: { id: string; label: string; on: boolean; key: string; click(): void }[], bw = 96): void {
  const gap = (w - bw * buttons.length) / (buttons.length + 1);
  buttons.forEach((o, i) => {
    const c = b.add('CWindowTaskTextSwitch', `btn:${o.id}`, { x: Math.round(gap + i * (bw + gap)), y, w: bw, h: 24 }, { label: o.label, align: 1, state: o.on ? 'normal' : 'disabled', enabled: o.on });
    b.on(c, { key: o.key, label: o.label, click: () => { if (o.on) o.click(); } });
  });
}
/** A page of `n` rows (the page clamped), and its Prev / Next plates when there is more than one. */
function paging(ctx: DuelDialogContext, n: number, key: string): { first: number; pages: number; nav: { id: string; label: string; on: boolean; key: string; click(): void }[] } {
  const pages = Math.max(1, Math.ceil(n / PAGE)), page = Math.min(Math.max(0, ctx.local.page ?? 0), pages - 1);
  ctx.local.page = page;
  const turn = (d: number) => () => { ctx.local.page = page + d; ctx.rerender(); };
  return { first: page * PAGE, pages, nav: pages > 1 ? [{ id: 'prev', label: '◀ Prev', on: page > 0, key: `${key}-prev`, click: turn(-1) },
    { id: 'next', label: 'Next ▶', on: page < pages - 1, key: `${key}-next`, click: turn(1) }] : [] };
}

/** A card list (CCardListView): the rows the server listed, marked in pick order, OK at the server's count. */
function cardListDialog(ctx: DuelDialogContext, p: DuelPromptView): WindowSpec {
  const cards = p.candidates ?? [], sel = ctx.local.selected, min = p.min ?? 0, max = p.max ?? cards.length;
  for (const id of [...sel]) if (!cards.some(c => c.id === id && !c.disabled)) sel.delete(id);
  const { first, pages, nav } = paging(ctx, cards.length, `prompt-page:${p.id}`);
  const rows = cards.slice(first, first + PAGE), n = lines(p.text), w = 400;
  const note = p.readOnly ? 'Select a card to read its details.' : `Choose ${min === max ? min : `${min}–${max}`}. Selected: ${sel.size}${pages > 1 ? ` · Page ${first / PAGE + 1} of ${pages}` : ''}`;
  const listY = 8 + n * LH + 4 + LH + 8, h = listY + PAGE * ROW + 8 + (nav.length ? 32 : 0) + 40, x = 512 - w / 2, y = Math.max(8, 384 - h / 2);
  const b = new WindowBuilder(ctx.ids, `duel-cards:${p.id}`, 'CUSelectDialog', { x, y, w, h }, { modal: true, z });
  b.add('CWindowTaskFrameThin', 'frame', { x: 0, y: 0, w, h }, { style: 1, alpha: 0.7 });
  b.add('CWindowTaskText', 'text', { x: 8, y: 8, w: w - 16, h: n * LH }, { text: p.text, align: 1, color: [1, 1, 1, 1] });
  b.add('CWindowTaskText', 'note', { x: 8, y: 8 + n * LH + 4, w: w - 16, h: LH }, { text: note, align: 1, color: [1, 0.9, 0.3, 1] });
  const order = [...sel];
  rows.forEach((r, i) => {
    const mark = order.indexOf(r.id), marked = mark >= 0, on = !ctx.busy && (p.readOnly ? !!r.card : !r.disabled);
    const label = `${r.label}${marked ? `  [${mark + 1}]` : ''}`;
    const c = b.add('CWindowTaskTextSwitch', `row:${r.id}`, { x: 8, y: listY + i * ROW, w: w - 16, h: ROW - 1 },
      { label, align: 1, state: on ? marked ? 'pressed' : 'normal' : 'disabled', enabled: on });
    b.on(c, { hover: !marked, key: `prompt-candidate:${p.id}:${r.id}`, label: `${r.label}${marked ? `, picked ${mark + 1}` : ''}`,
      click: () => {
        if (!on) return;
        if (p.readOnly) return ctx.inspect?.(r.id);
        if (sel.has(r.id)) sel.delete(r.id); else if (sel.size < max) sel.add(r.id); else if (max === 1) { sel.clear(); sel.add(r.id); }
        ctx.rerender();
      } });
  });
  const by = listY + PAGE * ROW + 8;
  if (nav.length) plates(b, w, by, nav, 120);
  const ok = !ctx.busy && (p.readOnly ? true : sel.size >= min && sel.size <= max);
  plates(b, w, h - 32, [{ id: 'ok', label: p.readOnly ? 'Close' : 'OK', on: ok, key: `prompt-confirm:${p.id}`, click: () => ctx.respond({ cardIds: p.readOnly ? [] : [...sel] }) },
    ...(p.cancelable && !p.readOnly ? [{ id: 'cancel', label: 'Cancel', on: !ctx.busy, key: `prompt-cancel:${p.id}`, click: () => ctx.respond({ cancel: true }) }] : [])], 120);
  return b.spec();
}

/** Free number entry (CWindowModelInput1: the question, a field, OK / Cancel; Enter is OK). */
function numberDialog(ctx: DuelDialogContext, p: DuelPromptView): WindowSpec {
  const lo = p.numberMin ?? 0, hi = p.numberMax ?? 0x7fffffff;
  if (ctx.local.draft === undefined) ctx.local.draft = String(lo);
  const draft = ctx.local.draft, value = /^\d+$/.test(draft.trim()) ? Number(draft.trim()) : NaN, valid = value >= lo && value <= hi;
  const n = lines(p.text, 40), w = 336, h = 24 + n * LH + 12 + LH + 8 + 32 + 16 + 32, x = 512 - w / 2, y = 384 - h / 2;
  const b = new WindowBuilder(ctx.ids, `duel-number:${p.id}`, 'CWindowModelInput1', { x, y, w, h }, { modal: true, z });
  b.add('CWindowTaskFramePlane', 'frame', { x: 0, y: 0, w, h }, { style: 1 });
  b.add('CWindowTaskText', 'text', { x: 16, y: 16, w: w - 32, h: n * LH }, { text: p.text, align: 1, color: [1, 1, 1, 1] });
  b.add('CWindowTaskText', 'range', { x: 16, y: 16 + n * LH + 4, w: w - 32, h: LH }, { text: `${lo}–${hi}`, align: 1, color: [1, 0.9, 0.3, 1] });
  const ok = () => { if (valid && !ctx.busy) ctx.respond({ number: value }); };
  const input = b.add('CWindowTaskInput', 'input', { x: 56, y: 16 + n * LH + 4 + LH + 8, w: 224, h: 32 }, { value: draft, focused: true, password: false, caret: null, caretOn: false, maxLen: 10, multiLine: false });
  b.on(input, { key: `prompt-number:${p.id}`, label: `${p.text} (${lo} to ${hi})`, text: v => { ctx.local.draft = v; ctx.rerender(); }, enter: ok });
  plates(b, w, h - 32, [{ id: 'ok', label: 'OK', on: valid && !ctx.busy, key: `prompt-confirm:${p.id}`, click: ok },
    ...(p.cancelable ? [{ id: 'cancel', label: 'Cancel', on: !ctx.busy, key: `prompt-cancel:${p.id}`, click: () => ctx.respond({ cancel: true }) }] : [])], 80);
  return b.spec();
}

/** A card-name declaration (CWindowDeckList 0x4b..0x4e with CWindowTaskListSearch): a search field narrowing the
 * declarable names as it is typed, the matches as rows (a click declares that card), Announce declares what is typed. */
function announceDialog(ctx: DuelDialogContext, p: DuelPromptView): WindowSpec {
  const list = p.declarable ?? [], draft = ctx.local.draft ?? '';
  const found = matchDeclarable(list, draft).slice(0, ANNOUNCE_SHOWN);
  const { first, nav } = paging(ctx, found.length, `prompt-page:${p.id}`);
  const rows = found.slice(first, first + PAGE), w = 400, n = lines(p.text);
  const inputY = 16 + n * LH + 8, countY = inputY + 40, listY = countY + LH + 8;
  const h = listY + PAGE * ROW + 8 + (nav.length ? 32 : 0) + 40, x = 512 - w / 2, y = Math.max(8, 384 - h / 2);
  const b = new WindowBuilder(ctx.ids, `duel-announce:${p.id}`, 'CWindowModelInput1', { x, y, w, h }, { modal: true, z });
  b.add('CWindowTaskFramePlane', 'frame', { x: 0, y: 0, w, h }, { style: 1 });
  b.add('CWindowTaskText', 'text', { x: 16, y: 16, w: w - 32, h: n * LH }, { text: p.text, align: 1, color: [1, 1, 1, 1] });
  const declare = (text: string) => { if (!ctx.busy && text.trim()) ctx.respond({ text }); };
  const input = b.add('CWindowTaskInput', 'search', { x: 24, y: inputY, w: w - 48, h: 32 }, { value: draft, focused: true, password: false, caret: null, caretOn: false, maxLen: 120, multiLine: false });
  b.on(input, { key: `prompt-announcement:${p.id}`, label: 'Card announcement: type part of a card name', text: v => { ctx.local.draft = v; ctx.local.page = 0; ctx.rerender(); }, enter: () => declare(rows.length === 1 && found.length === 1 ? rows[0]!.id : draft) });
  const all = matchDeclarable(list, draft).length;
  const count = !list.length ? 'Type the card name.' : !all ? 'No card name holds that text.' : all > found.length ? `${all} cards: showing the first ${found.length}. Type more of the name.` : `${all} card${all === 1 ? '' : 's'}.`;
  b.add('CWindowTaskText', 'count', { x: 16, y: countY, w: w - 32, h: LH }, { text: count, align: 1, color: [1, 0.9, 0.3, 1] });
  rows.forEach((r, i) => {
    const c = b.add('CWindowTaskTextSwitch', `row:${r.id}`, { x: 16, y: listY + i * ROW, w: w - 32, h: ROW - 1 }, { label: r.label, align: 1, state: ctx.busy ? 'disabled' : 'normal', enabled: !ctx.busy });
    b.on(c, { hover: true, key: `prompt-declare:${p.id}:${r.id}`, label: `Declare ${r.label}`, click: () => declare(r.id) });
  });
  if (nav.length) plates(b, w, listY + PAGE * ROW + 8, nav, 120);
  plates(b, w, h - 32, [{ id: 'announce', label: 'Announce', on: !ctx.busy && !!draft.trim(), key: `prompt-confirm:${p.id}`, click: () => declare(draft) }], 120);
  return b.spec();
}
// a line of the question per 46 characters (Arial 16 px in the 376-px field), at most 4
const lines = (text: string, per = 46) => Math.max(1, Math.min(4, text.split('\n').reduce((n, l) => n + Math.max(1, Math.ceil(l.length / per)), 0)));
const z = 51180;

export function duelDialog(ctx: DuelDialogContext, p: DuelPromptView): WindowSpec | null {
  if (!duelDialogCovers(p)) return null;
  if (p.kind === 'cards') return cardListDialog(ctx, p);
  if (p.kind === 'announce') return announceDialog(ctx, p);
  if (p.kind === 'number' && !p.options.length) return numberDialog(ctx, p);
  const opts = p.options, cancel = p.cancelable ? [{ id: '\0cancel', label: 'Cancel' }] : [];
  // Yes / No (CUYesNoDialog on CWindowModelDialogYesNo: 400 wide, the band 24 under the text field, buttons 120 x 24)
  if (p.kind === 'acknowledge' || opts.length + cancel.length <= 2 && p.kind !== 'attributes') {
    const buttons = [...opts.map(o => ({ id: o.id, label: o.label, disabled: !!o.disabled })), ...cancel.map(c => ({ ...c, disabled: false }))];
    if (!buttons.length) buttons.push({ id: '\0ok', label: 'OK', disabled: false });
    const n = lines(p.text), w = 400, h = 8 + n * LH + 16 + 40, x = 512 - w / 2, y = 384 - h / 2;
    const b = new WindowBuilder(ctx.ids, `duel-yesno:${p.id}`, 'CUYesNoDialog', { x, y, w, h }, { modal: true, z });
    b.add('CWindowTaskFrameBottomThick', 'frame', { x: 0, y: 0, w, h }, { style: 1, band: 40, alpha: 0.7 });
    b.add('CWindowTaskTextField', 'text', { x: 8, y: 8, w: w - 16, h: n * LH + 8 }, { text: p.text, align: 1, color: [0, 0, 0, 1] });
    const bw = 120, gap = buttons.length > 1 ? (w - bw * buttons.length) / (buttons.length + 1) : (w - bw) / 2;
    buttons.forEach((o, i) => {
      const c = b.add('CWindowTaskTextSwitch', `opt:${o.id}`, { x: Math.round(gap + i * (bw + gap)), y: h - 32, w: bw, h: 24 },
        { label: o.label, align: 1, state: o.disabled || ctx.busy ? 'disabled' : 'normal', enabled: !o.disabled && !ctx.busy });
      b.on(c, { key: o.id === '\0cancel' ? `prompt-cancel:${p.id}` : o.id === '\0ok' ? `prompt-ok:${p.id}` : `prompt-option:${p.id}:${o.id}`, label: o.label,
        click: () => { if (ctx.busy || o.disabled) return; ctx.respond(o.id === '\0cancel' ? { cancel: true } : o.id === '\0ok' ? { optionId: opts[0]?.id ?? '' } : { optionId: o.id }); } });
    });
    return b.spec();
  }
  // a list (CUSelectDialog on CWindowModelThin: the question, the striped rows; 400 wide, at most 12 rows shown)
  const multi = p.kind === 'attributes', rows = [...opts, ...(multi ? [] : cancel.map(c => ({ ...c, disabled: false })))];
  const shown = Math.min(12, rows.length), n = lines(p.text), w = 400;
  const listY = 8 + n * LH + 8, foot = multi || cancel.length && multi ? 40 : 8, h = listY + shown * ROW + foot + (multi ? 0 : 0);
  const x = 512 - w / 2, y = 384 - h / 2;
  const b = new WindowBuilder(ctx.ids, `duel-select:${p.id}`, multi ? 'CUSelectAttributeDialog' : 'CUSelectDialog', { x, y, w, h }, { modal: true, z });
  b.add('CWindowTaskFrameThin', 'frame', { x: 0, y: 0, w, h }, { style: 1, alpha: 0.7 });
  b.add('CWindowTaskText', 'text', { x: 8, y: 8, w: w - 16, h: n * LH }, { text: p.text, align: 1, color: [1, 1, 1, 1] });
  // each row a real button (main's TextSwitch, a <button>: the pointer and the keys land on its own element), marked
  // rows shown pressed; no undrawn hit rows (the layer finds a control by its element, never by position)
  rows.slice(0, shown).forEach((r, i) => {
    const marked = ctx.local.selected.has(r.id), on = !r.disabled && !ctx.busy;
    const c = b.add('CWindowTaskTextSwitch', `row:${r.id}`, { x: 8, y: listY + i * ROW, w: w - 16, h: ROW - 1 },
      { label: r.label, align: 1, state: on ? marked ? 'pressed' : 'normal' : 'disabled', enabled: on, ...(multi ? { checked: marked } : {}) });
    b.on(c, { hover: !marked, key: r.id === '\0cancel' ? `prompt-cancel:${p.id}` : `prompt-option:${p.id}:${r.id}`, label: multi ? `${r.label}${marked ? ' (marked)' : ''}` : r.label,
      click: () => {
        if (ctx.busy || r.disabled) return;
        if (r.id === '\0cancel') return ctx.respond({ cancel: true });
        if (!multi) return ctx.respond({ optionId: r.id });
        if (ctx.local.selected.has(r.id)) ctx.local.selected.delete(r.id); else if (ctx.local.selected.size < (p.max ?? 1)) ctx.local.selected.add(r.id);
        ctx.rerender();
      } });
  });
  if (multi) {
    const ok = ctx.local.selected.size >= (p.min ?? 1) && ctx.local.selected.size <= (p.max ?? 1) && !ctx.busy;
    const buttons = [{ id: 'ok', label: 'OK', on: ok }, ...(p.cancelable ? [{ id: 'cancel', label: 'Cancel', on: !ctx.busy }] : [])];
    const bw = 120, gap = (w - bw * buttons.length) / (buttons.length + 1);
    buttons.forEach((o, i) => {
      const c = b.add('CWindowTaskTextSwitch', `btn:${o.id}`, { x: Math.round(gap + i * (bw + gap)), y: h - 32, w: bw, h: 24 }, { label: o.label, align: 1, state: o.on ? 'normal' : 'disabled', enabled: o.on });
      b.on(c, { key: o.id === 'ok' ? `prompt-confirm:${p.id}` : `prompt-cancel:${p.id}`, label: o.label,
        click: () => { if (!o.on) return; ctx.respond(o.id === 'ok' ? { optionIds: [...ctx.local.selected] } : { cancel: true }); } });
    });
  }
  return b.spec();
}

// The duel speed (main's duelspeed.js): 1x the 2008 pacing, 1.5x, 2x, remembered per browser under main's key. Its
// button is a game TextSwitch (main's generic controls draw it) where live has it: at the top right of the screen, 8 px
// down, beside the page's full-screen button (duelspeed.js place(): right 8 + 40).
export const DUEL_SPEEDS = [1, 1.5, 2] as const;
const SPEED_KEY = 'yo2-duel-speed';
export function loadDuelSpeed(): number {
  try { const v = Number(globalThis.localStorage?.getItem(SPEED_KEY)); return (DUEL_SPEEDS as readonly number[]).includes(v) ? v : 1; } catch { return 1; }
}
export function nextDuelSpeed(speed: number): number {
  const k = DUEL_SPEEDS[((DUEL_SPEEDS as readonly number[]).indexOf(speed) + 1) % DUEL_SPEEDS.length]!;
  try { globalThis.localStorage?.setItem(SPEED_KEY, String(k)); } catch { /* private window: this session only */ }
  return k;
}
export function duelSpeedWindow(ids: Ids, speed: number, change: () => void): WindowSpec {
  const W = 48, H = 24, b = new WindowBuilder(ids, 'duel-speed', 'CWindowDuelSpeed', { x: 1024 - W - 48, y: 8, w: W, h: H }, { z: 51100 });
  const c = b.add('CWindowTaskTextSwitch', 'speed', { x: 0, y: 0, w: W, h: H }, { label: `${speed}×`, align: 1, state: 'normal' });
  b.on(c, { key: 'duel-speed', label: `Duel speed: ${speed}×${speed === 1 ? ' (original)' : ''}. Click to change`, click: change });
  return b.spec();
}
