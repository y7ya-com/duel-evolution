// The deck screen's LOAD DECK / SAVE DECK / STRUCTURE DECK list (CWindowModelFileList) as live shows it: live's engine
// draws this window itself (its htmlui.json names no screen for it), so here it is drawn the way the engine draws it,
// from the controls deck.ts fileListWindow builds: the window's eighteen window_base_01_c01 tiles and its frame, opaque
// (CWindowModelFileList::init sets the tiles' blend 0: live's body is a flat (89, 198, 255) whatever lies under it), the
// listbox's stripes (CWindowTaskBackStripe::applyLooks: (8, 8) white and (56, 8) #eeeeed every other row, the chosen
// row (72, 16) #0084ff; the stretched 8 x 8 cells soften their ends as the engine's bilinear sampler does), the rows'
// text (black; decks centred, packs after the structure icon), the pack's text field (white), the switches (main's
// button plates) and the white title. Rows and switches are real buttons: the layer tags them with their keys and
// labels (layer.ts tag) and a press clicks their control.
import { sprite, SHEET } from '@html-ui/ui.js';
import { renderControl, textBox, bottomThickPieces } from '@htmlui/controls/basic.js';
import type { HtmlWindow } from './snapshot';

const LH = 16;
const STRIPE = { plain: [8, 8], alt: [56, 8], sel: [72, 16] } as const;
interface State { key: string }

function draw(win: HtmlWindow, root: HTMLElement, api: HtmlUiApi): void {
  root.replaceChildren();
  const layer = (z: number) => { const d = document.createElement('div'); Object.assign(d.style, { position: 'absolute', left: '0', top: '0', width: win.w + 'px', height: '0', zIndex: String(z) }); root.append(d); return d; };
  const back = layer(0), mid = layer(1), front = layer(2);
  // the frame (z 30) under the tiles (z 31), both opaque
  const frame = win.controls.find(c => c.cls === 'CWindowTaskFrameBottomThick');
  if (frame) for (const [x, y, w, h, u, v] of bottomThickPieces(frame.w, frame.h, Number(frame.band ?? 32))) sprite(back, SHEET.window, u, v, 8, 8, frame.x + x, frame.y + y, w, h);
  for (const t of win.extras as unknown as { src: number[]; x: number; y: number; w: number; h: number; shown: boolean }[])
    if (t.shown) sprite(back, SHEET.window, t.src[0]!, t.src[1]!, 8, 8, t.x, t.y, t.w, t.h);
  // the list: its eight striped rows (the stripe by the item's place, from the top item's parity), the chosen one blue
  const list = win.controls.find(c => c.cls === 'CWindowTaskListbox');
  if (list) {
    const items = (list.items as string[]) ?? [], icons = (list.icons as (number | null)[]) ?? [], top = Number(list.top ?? 0), selected = Number(list.selected ?? -1);
    const rows = Number(list.rows ?? 8), indent = Number(list.indent ?? 0), align = Number(list.align ?? 1);
    const box = document.createElement('div');
    box.setAttribute('role', 'list');
    Object.assign(box.style, { position: 'absolute', left: list.x + 'px', top: list.y + 'px', width: list.w + 'px', height: list.h + 'px', overflow: 'hidden' });
    mid.append(box);
    for (let r = 0; r < rows; r++) {
      const i = top + r, look = i === selected && i < items.length ? 'sel' : (i % 2 === 0 ? 'alt' : 'plain');
      const [u, v] = STRIPE[look];
      sprite(box, SHEET.window, u, v, 8, 8, 0, LH * r, list.w, LH);
    }
    for (let r = 0; r < rows && top + r < items.length; r++) {
      const i = top + r, icon = icons[i];
      if (icon !== null && icon !== undefined) {
        const d = document.createElement('div');
        Object.assign(d.style, { position: 'absolute', left: 24 - list.x + 'px', top: LH * r + 'px', width: '32px', height: '16px', pointerEvents: 'none',
          backgroundImage: `url(${api.art('icon_deck_01.png')})`, backgroundPosition: `${-(icon <= 3 ? 16 + 32 * icon : 16)}px 0`, backgroundRepeat: 'no-repeat' });
        box.append(d);
      }
      // (the text in w - 16: the scroll bar's column, as the generic listbox; live's centred names sit 8 left of centre)
      textBox(box, items[i]!, { x: indent, y: LH * r, w: list.w - 16 - indent, align: align === 1 ? 1 : 0 });
    }
  }
  // the rows' buttons (over their text), the field, the switches and the title
  for (const c of win.controls) {
    if (!c.shown) continue;
    if (c.cls === 'CWindowTaskText' && typeof c.row === 'number') {
      const b = document.createElement('button');
      b.type = 'button'; b.className = 'htmlui-deck-file-row'; b.dataset.fileRow = String(c.row);
      Object.assign(b.style, { position: 'absolute', left: c.x + 'px', top: c.y + 'px', width: c.w + 'px', height: c.h + 'px', background: 'transparent', border: '0', padding: '0', margin: '0', cursor: 'pointer' });
      b.addEventListener('click', () => { void api.click(c.id); });
      front.append(b);
    } else if (c.cls === 'CWindowTaskTextField') {
      const d = document.createElement('div');
      Object.assign(d.style, { position: 'absolute', left: c.x + 'px', top: c.y + 'px', width: c.w + 'px', height: c.h + 'px', background: '#ffffff', overflow: 'hidden' });
      textBox(d, String(c.text ?? ''), { w: c.w - 16, wrap: true });
      mid.append(d);
    } else if (c.cls === 'CWindowTaskTextSwitch') renderControl(c, front, { ...api, owned: true });
    else if (c.name === 'Title') textBox(front, String(c.text ?? ''), { x: c.x, y: c.y, w: c.w, align: 1, px: 24, color: [1, 1, 1, 1], white: true });
  }
}

const key = (win: HtmlWindow) => JSON.stringify(win, (k, v) => k === 'id' || k === 'wz' ? undefined : v);
export const fileListScreen: HtmlUiScreen = {
  classes: ['CWindowModelFileList'],
  mode: 'owned',
  clip: false,   // its frame's band and switches stand under the window's nominal 144 (live's drawn rect: 200 high)
  mount(win, root, api) { const st: State = { key: '' }; this.update!(win, null, root, api, st); return st; },
  update(win, _prev, root, api, st) {
    const w = win as HtmlWindow, s = st as State, k = key(w);
    if (k === s.key) return;
    s.key = k;
    draw(w, root, api);
  },
  unmount(root) { root.replaceChildren(); },
};
