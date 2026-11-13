// Change Title (CWindowModelTitleConfig, the My Room Main Menu's) as live's engine draws it: the Duel Log's window
// (log_win_01_c01, 266, 158, 492 x 452) titled "Change Title" with the page "1/14" at the right of its band; every title
// of the game on a 2 x 4 grid of plates (duel_btn_02_c01: the white plate, the chosen one pink), the ones not earned
// "?????"; the gold page arrows (shop_arrow_04 next at the window's right edge, 10 previous at its left); under them the
// blue box with the description of the plate the pointer was on last (yo2text 7600.., "?????" for one not earned; at
// first the chosen title's) and its scroll bar; OK wears the chosen title (0x4174 with its PBIN bit; the server checks
// it is owned), Cancel leaves. Drawn by option-dlg.ts (layer.ts EXTRA). Pure: no DOM.
import { TITLES, type OwnedTitle } from '../../features/titles';
import { Ids, WindowBuilder } from './snapshot';
import type { WindowSpec } from './snapshot';

/** `selected`: the chosen title's PBIN bit (null: the one worn); `page`: the grid's page (0..). */
export interface TitleConfigUi { selected: number | null; page: number }
export interface TitleConfigDeps {
  titles: readonly OwnedTitle[];
  /** The PBIN bit of the title worn now (the profile's), when known. */
  worn?: number;
  busy?: boolean;
  /** The original's UI texts by id (the descriptions, yo2text 7600..), once read. */
  text?: (id: number) => string | undefined;
  wear(bit: number): void;
  close(): void;
  rerender(): void;
}
export const TITLE_PER_PAGE = 8;
/** Every title in the engine's order (by title id: Beginner Duelist, KONAMI, GAME MASTER, JUMP FESTA, then 0xF100..). */
export const TITLE_GRID: readonly (readonly [number, string, number])[] = [...TITLES].sort((a, b) => a[2] - b[2]);
/** A title's description (yo2text: 7600 + id for the first four, 7604 + id - 0xF100 for the rest). */
export const titleTextId = (titleId: number): number => titleId < 4 ? 7600 + titleId : 7604 + titleId - 0xf100;
export const TITLE_TEXTS: readonly number[] = TITLE_GRID.map(t => titleTextId(t[2]));
/** The title id worn, as its PBIN bit (the profile reports the id). */
export const titleBit = (titleId: number | null | undefined): number | undefined => titleId == null ? undefined : TITLES.find(t => t[2] === titleId)?.[0];

const SHADOW = { dx: 1, dy: 1, color: [0, 0, 0, 1] };
const PLATE = (y: number) => ({ tex: 'data/common/window/duel_btn_02_c01.png', src: [0, y, 224, 32] as [number, number, number, number] });
const ARROW = (k: number) => ({ tex: `data/shop/shop_arrow_${String(k).padStart(2, '0')}_c01.png`, src: [0, 0, 32, 64] as [number, number, number, number] });
const BACK = 'data/common/window/log_win_01_c01.png';
const X = 266, Y = 158, W = 492, H = 452;

export function titleConfigWindow(ids: Ids, ui: TitleConfigUi, d: TitleConfigDeps): WindowSpec {
  const b = new WindowBuilder(ids, 'titleconfig', 'CWindowModelTitleConfig', { x: X, y: Y, w: W, h: H }, { z: 51453, modal: true, back: BACK });
  const owned = new Map(d.titles.map(t => [t.bit, t] as const));
  const pages = Math.ceil(TITLE_GRID.length / TITLE_PER_PAGE);
  ui.page = Math.max(0, Math.min(pages - 1, ui.page));
  const chosen = ui.selected ?? d.worn ?? null;
  const describe = (t: readonly [number, string, number]) => owned.has(t[0]) ? d.text?.(titleTextId(t[2]))?.trim() || t[1] : '?????';
  // the window's picture has its blue box from 167: the grid's lower rows stand on the well, so the well's foot
  // (its strip 140..164) is drawn over the box's top down to 258, where the box's edge (163..169) is drawn again
  [0, 1, 2, 3].forEach(k => b.add('CWindowTaskPicture', `well${k}`, { x: 12, y: 167 + 24 * k, w: 468, h: k < 3 ? 24 : 19 }, { tex: BACK, src: [12, 140, 468, 24] }));
  b.add('CWindowTaskPicture', 'boxEdge', { x: 12, y: 254, w: 468, h: 6 }, { tex: BACK, src: [12, 163, 468, 6] });
  b.add('CWindowTaskShadowText', 'title', { x: 0, y: 4, w: W, h: 16 }, { text: 'Change Title', align: 1, fontSize: 16, color: [1, 1, 1, 1], shadow: SHADOW });
  b.add('CWindowTaskShadowText', 'pages', { x: 0, y: 4, w: W - 10, h: 16 }, { text: `${ui.page + 1}/${pages}`, align: 2, fontSize: 16, color: [1, 1, 1, 1], shadow: SHADOW });
  const shown = TITLE_GRID.slice(ui.page * TITLE_PER_PAGE, ui.page * TITLE_PER_PAGE + TITLE_PER_PAGE);
  shown.forEach((t, i) => {
    const x = i % 2 ? 246 : 22, y = 53 + 52 * Math.floor(i / 2), mine = owned.has(t[0]), on = mine && t[0] === chosen;
    // a plate keeps its look under the pointer (live): the description is what follows it
    b.add('CWindowTaskPictureSwitch', `plate${i}`, { x, y, w: 224, h: 32 }, { label: '', state: 'normal', enabled: true, checked: on, help: describe(t),
      art: { normal: PLATE(0), hover: PLATE(0), pressed: PLATE(mine ? 32 : 0), checked: PLATE(32) } },
    { key: `title-plate:${mine ? t[0] : `locked${i}`}`, label: mine ? t[1] : 'Title not earned', click: () => { if (mine && !d.busy) { ui.selected = t[0]; d.rerender(); } } });
    b.add('CWindowTaskShadowText', `label${i}`, { x, y: y + 8, w: 224, h: 16 }, on
      ? { text: t[1], align: 1, fontSize: 16, color: [1, 1, 1, 1], shadow: SHADOW }
      : { text: mine ? t[1] : '?????', align: 1, fontSize: 16, color: [0, 0, 0, 1] });
  });
  const first = TITLE_GRID.find(t => t[0] === chosen);
  b.add('CWindowTaskShadowText', '説明', { x: 30, y: 266, w: 424, h: 128 }, { text: first ? describe(first) : '', align: 0, fontSize: 16, color: [1, 1, 1, 1], shadow: SHADOW, scroll: true, helpSlot: true,
    bar: { x: 455, y: 259, h: 140 } });
  const button = (name: string, x: number, label: string, key: string, run: (() => void) | null) =>
    b.add('CWindowTaskButtonDuel', name, { x, y: 420, w: 140, h: 24 }, { label, align: 1, state: run ? 'normal' : 'disabled', color: [0, 0, 0, 1] }, { key, click: () => run?.() });
  const wear = chosen !== null && owned.has(chosen) ? chosen : null;
  button('wear', 53, 'OK', 'title-wear', !d.busy ? () => { if (wear !== null && wear !== d.worn) d.wear(wear); d.close(); } : null);
  button('close', 299, 'Cancel', 'title-close', () => d.close());
  return b.spec();
}
/** The page arrows: live's stand across the window's edges (the next one at its right, 474, 122; the previous one at its
 * left, -14), so each is a window of its own over it (a window's root clips what runs out of it). */
export function titleConfigArrows(ids: Ids, ui: TitleConfigUi, d: Pick<TitleConfigDeps, 'rerender'>): WindowSpec[] {
  const pages = Math.ceil(TITLE_GRID.length / TITLE_PER_PAGE), out: WindowSpec[] = [];
  const turn = (p: number) => { if (p >= 0 && p < pages) { ui.page = p; d.rerender(); } };
  const arrow = (name: 'prev' | 'next', x: number, first: number, label: string, to: number) => {
    const b = new WindowBuilder(ids, `titleconfig:${name}`, 'CWindowModelTitleConfigArrow', { x: X + x, y: Y + 122, w: 32, h: 64 }, { z: 51454, modal: true });
    b.add('CWindowTaskPictureSwitch', name, { x: 0, y: 0, w: 32, h: 64 }, { label: '', state: 'normal', enabled: true, checked: false, art: { normal: ARROW(first), hover: ARROW(first + 1), pressed: ARROW(first + 2) } },
      { key: `title-page-${name}`, label, click: () => turn(to) });
    out.push(b.spec());
  };
  if (ui.page > 0) arrow('prev', -14, 10, 'Previous page', ui.page - 1);
  if (ui.page < pages - 1) arrow('next', 474, 4, 'Next page', ui.page + 1);
  return out;
}
