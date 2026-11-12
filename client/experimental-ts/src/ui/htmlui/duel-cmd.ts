// A card's command menu through main's screens/duel.js: CUSummonDialogSp on CWindowModelListDuelCmd (client/src/duel/
// SceneDialogs3.cpp), as live draws it (mock/duel-cmd.json, LIVE 2026-11-04): a thin frame in style 6 (gold), 158 wide,
// one 16-px row per command plus 8 px above and below, its bottom left 79 px left of the card's centre and on the
// card's top edge (a hand card's menu ends at 496). The rows are a CWindowTaskListboxDuelCmd: the stripes (the row under
// the pointer selected, the first one when it opens), each row's icon (CWindowTaskImageDuelCmd: duelcmd_icon_01's
// 16 x 16 cell of the command) and its text 24 px right of it (CWindowTaskViewImgAndTextItem). The commands are the
// mask's in menu order (kSummonCommands: the wire's command bit -> the menu's command), each named by DuelCmdKind::text
// (yo2text 0x1013 + c below 5, 0x1012 + c from 5 on, 0x1990 for 19).
// duel.js draws the rows as stripes the engine hit-tests; the rewrite has no engine, so each drawn row is the control:
// after each draw the row's element takes the pointer (hover selects it, a click picks it, Enter / Space too) and
// carries its data-key and label. The captions are black (live: x-duel-cmd.png). Pure but for `after` (DOM).
import { WindowBuilder, type Ids, type WindowSpec } from './snapshot';

/** The menu's command of each wire command bit (DAT_00cd4a10). */
export const SUMMON_COMMANDS = [8, 0, 12, 7, 6, 3, 4, 5, 2, 1, 10, 13, 9, 19] as const;
/** The menu command's name (DuelCmdKind::text: yo2text_e 0x1013.. / 0x1012.., 0x1990). */
const CMD_TEXT: Record<number, string> = { 0: 'See Details', 1: 'Change to Defence Position', 2: 'Change to Attack Position', 3: 'Flip Summon',
  4: 'Set', 5: 'Set', 6: 'Summon', 7: 'Activate Effect', 8: 'Attack', 9: 'Draw', 10: 'Surrender', 11: 'Fusion', 12: 'Special Summon', 13: '!', 19: 'Shuffle' };
/** The menu command of a server action id (presentation.ts actionId: `action:<player>:<zone>:<index>:<command bit>`), or -1. */
export function menuCommand(actionId: string): number {
  const m = /^action:\d+:\d+:\d+:(\d+)$/.exec(actionId), bit = m ? Number(m[1]) : -1;
  return SUMMON_COMMANDS[bit] ?? -1;
}
export const SURRENDER_COMMAND = 10;
export const commandText = (cmd: number): string | undefined => CMD_TEXT[cmd];

export interface DuelCmdRow {
  /** The menu command (its icon and name), or -1: a row named by `text` alone. */
  cmd: number; text?: string;
  key: string; label: string; disabled?: boolean;
  pick(): void;
}
/** The menu's own state while open: the row under the pointer. */
export interface DuelCmdUi { hover: number }
export interface DuelCmdContext {
  ids: Ids;
  /** The card's centre and top edge (game px), and whether it is a hand card (the menu then ends at 496). */
  at: { x: number; top: number; hand: boolean };
  rows: DuelCmdRow[];
  ui: DuelCmdUi;
  rerender(): void;
  /** The menu's name for assistive technology ('<card>: commands'). */
  name: string;
}
export const CMD_W = 158, CMD_ROW = 16;
/** The menu's place (game px): CUSummonDialogSp::open. */
export function duelCmdRect(at: DuelCmdContext['at'], count: number): { x: number; y: number; w: number; h: number } {
  const h = (count + 1) * CMD_ROW, bottom = at.hand ? 496 : at.top;
  return { x: Math.max(0, Math.min(1024 - CMD_W, Math.round(at.x - 79))), y: Math.max(0, Math.round(bottom - h)), w: CMD_W, h };
}

export function duelCmdWindow(ctx: DuelCmdContext): WindowSpec {
  const n = ctx.rows.length, r = duelCmdRect(ctx.at, n), hover = Math.max(0, Math.min(n - 1, ctx.ui.hover));
  const b = new WindowBuilder(ctx.ids, 'duel-cmd', 'CUSummonDialogSp', r, { modal: true, z: 51203, cmd: { count: n, open: true, chosen: -1 } });
  b.add('CWindowTaskFrameThin', 'frame', { x: 0, y: 0, w: r.w, h: r.h }, { style: 6, alpha: 0.7 });
  const list = b.add('CWindowTaskListboxDuelCmd', 'list', { x: 8, y: 8, w: r.w - 16, h: n * CMD_ROW },
    { items: [], selected: hover, marks: ctx.rows.map((_, i) => i === hover), top: 0, topLine: 0, rows: n });
  const stripe = b.add('CWindowTaskBackStripe', 'stripe', { x: 0, y: 0, w: r.w - 16, h: n * CMD_ROW }, { alpha: 0.7, rows: n, selected: hover });
  stripe.parent = list.id;
  ctx.rows.forEach((row, i) => {
    const text = row.cmd >= 0 ? CMD_TEXT[row.cmd] ?? row.text ?? '' : row.text ?? '';
    const t = b.add('CWindowTaskText', `text:${i}`, { x: 24, y: i * CMD_ROW, w: 240, h: CMD_ROW },
      { text, align: 0, fontSize: 16, lineGap: 0, firstLine: 0, pageLines: 1, color: row.disabled ? [0.45, 0.45, 0.45, 1] : [0, 0, 0, 1] });
    t.parent = list.id;
    // the row's control (the driver and assistive tools find it by its key; the drawn row takes the pointer: `after`)
    b.on(t, { key: row.key, label: row.label, click: () => { if (!row.disabled) row.pick(); } });
    if (row.cmd >= 0 && row.cmd < 21) {
      const icon = b.add('CWindowTaskImageDuelCmd', `icon:${i}`, { x: 0, y: i * CMD_ROW, w: 16, h: 16 },
        { texture: 'data/common/icon/duelcmd_icon_01.png', src: { x: 16 * row.cmd, y: 0, w: 16, h: 16 }, value: row.cmd });
      icon.parent = list.id;
    }
  });
  const spec = b.spec();
  // each drawn row (duel.js Listbox: one <i> per row, in order) is the row's control
  spec.after = root => {
    const box = root.querySelector('.yo2d-list');
    if (box) { box.setAttribute('role', 'menu'); box.setAttribute('aria-label', ctx.name); }
    const els = box ? Array.from(box.children) as HTMLElement[] : [];
    els.forEach((el, i) => {
      const row = ctx.rows[i]; if (!row) return;
      el.dataset.key = row.key; el.setAttribute('role', 'menuitem'); el.setAttribute('aria-label', row.label); el.tabIndex = 0;
      if (row.disabled) el.setAttribute('aria-disabled', 'true'); else el.removeAttribute('aria-disabled');
      el.style.cursor = row.disabled ? 'default' : 'pointer';
      const pick = () => { if (!row.disabled) row.pick(); };
      el.onclick = e => { e.stopPropagation(); pick(); };
      el.onkeydown = e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); pick(); } };
      el.onpointerenter = () => { if (ctx.ui.hover !== i) { ctx.ui.hover = i; ctx.rerender(); } };
    });
  };
  return spec;
}
