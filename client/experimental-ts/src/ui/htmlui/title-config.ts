// Change Title (CWindowModelTitleConfig, the Main Menu's): the titles the character has earned in a list, Set Title wears
// the chosen one (0x4174 with its PBIN bit; the server checks it is owned), Close leaves. main's Legacy look, the Main
// Menu's list windows' frame (windows.ts listWindow: the duel frame, the title 0, 4, the listbox 13, 32 of 8 rows, the
// duel buttons on 173). Pure: no DOM.
import type { OwnedTitle } from '../../features/titles';
import { Ids, WindowBuilder } from './snapshot';
import type { WindowSpec } from './snapshot';

export interface TitleConfigUi { selected: number; top: number }
export interface TitleConfigDeps {
  titles: readonly OwnedTitle[];
  /** The title worn now (the profile's title line), marked in the list. */
  current?: string;
  busy?: boolean;
  wear(bit: number): void;
  close(): void;
  rerender(): void;
}
export const TITLE_ROWS = 8;
export function titleConfigWindow(ids: Ids, ui: TitleConfigUi, d: TitleConfigDeps): WindowSpec {
  const b = new WindowBuilder(ids, 'titleconfig', 'CWindowModelTitleConfig', { x: 62, y: 282, w: 900, h: 204 }, { z: 51453, modal: true });
  if (ui.selected >= d.titles.length) ui.selected = -1;
  ui.top = Math.max(0, Math.min(ui.top, d.titles.length - TITLE_ROWS));
  b.add('CWindowTaskFrameDuel', 'frame', { x: 0, y: 0, w: 0, h: 0 });
  b.add('CWindowTaskShadowText', 'title', { x: 0, y: 4, w: 900, h: 16 }, { text: 'Change Title', align: 1, fontSize: 16, color: [1, 1, 1, 1] });
  const items = d.titles.map((t, i) => `${i === ui.selected ? '> ' : ''}${t.name}${d.current && t.name === d.current ? '  (worn)' : ''}`);
  const list = b.add('CWindowTaskListbox', 'list', { x: 13, y: 32, w: 874, h: 128 }, { items, selected: ui.selected, top: ui.top, topLine: ui.top, rows: TITLE_ROWS });
  b.on(list, { label: 'Earned titles', click: point => { if (!point) return; const i = ui.top + Math.floor((point[1] - 282 - 32) / 16); if (i >= 0 && i < d.titles.length) { ui.selected = i; d.rerender(); } },
    wheel: delta => { ui.top = Math.max(0, Math.min(ui.top + (delta > 0 ? 1 : -1), d.titles.length - TITLE_ROWS)); d.rerender(); } });
  const chosen = d.titles[ui.selected];
  const button = (name: string, x: number, w: number, label: string, key: string, run: (() => void) | null) =>
    b.add('CWindowTaskButtonDuel', name, { x, y: 173, w, h: 24 }, { label, align: 1, state: run ? 'normal' : 'disabled', color: [0, 0, 0, 1] }, { key, click: () => run?.() });
  button('wear', 125, 200, 'Set Title', 'title-wear', chosen && !d.busy ? () => { d.wear(chosen.bit); d.close(); } : null);
  button('close', 625, 100, 'Close', 'title-close', () => d.close());
  return b.spec();
}
