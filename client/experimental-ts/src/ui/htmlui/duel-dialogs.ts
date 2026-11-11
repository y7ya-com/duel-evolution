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
// rewrite takes input on elements, so a row is a real <button>). Card lists (CCardListView), free number entry and card declaration are
// not main's duel.js: the duel screen keeps drawing those itself (index.ts renderPrompt).
import type { DuelPromptView, DuelResponse } from '../contracts';
import { WindowBuilder, type Ids, type WindowSpec } from './snapshot';

export interface DuelDialogContext {
  ids: Ids; busy: boolean;
  /** The rows marked in a multiple choice (attributes), the row under the pointer; kept by the caller per prompt. */
  local: { selected: Set<string>; hover?: string | null };
  respond(response: DuelResponse): void;
  rerender(): void;
}

const LH = 16, ROW = 20;
/** Whether main's duel dialogs show this prompt (else the duel screen's own panel does). */
export function duelDialogCovers(p: DuelPromptView): boolean {
  if (p.candidates?.length || p.declarable?.length) return false;
  if (p.kind === 'cards' || p.kind === 'place' || p.kind === 'announce') return false;
  if (p.kind === 'number' && !p.options.length) return false;
  return p.options.length > 0 || p.kind === 'acknowledge';
}
// a line of the question per 46 characters (Arial 16 px in the 376-px field), at most 4
const lines = (text: string, per = 46) => Math.max(1, Math.min(4, text.split('\n').reduce((n, l) => n + Math.max(1, Math.ceil(l.length / per)), 0)));
const z = 51180;

export function duelDialog(ctx: DuelDialogContext, p: DuelPromptView): WindowSpec | null {
  if (!duelDialogCovers(p)) return null;
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
// button is a game TextSwitch (main's generic controls draw it) at the top right of the duel screen.
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
  const W = 48, H = 24, b = new WindowBuilder(ids, 'duel-speed', 'CWindowDuelSpeed', { x: 1024 - W - 8, y: 8, w: W, h: H }, { z: 51100 });
  const c = b.add('CWindowTaskTextSwitch', 'speed', { x: 0, y: 0, w: W, h: H }, { label: `${speed}×`, align: 1, state: 'normal' });
  b.on(c, { key: 'duel-speed', label: `Duel speed: ${speed}×${speed === 1 ? ' (original)' : ''}. Click to change`, click: change });
  return b.spec();
}
