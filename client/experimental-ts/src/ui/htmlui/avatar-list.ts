// The "which avatar?" list (CTgtAvaListDlg, client/src/Game/yo2TgtAvaListDlg.cpp): live's click on the map's avatars
// does not open a card or a talk at once; it lists every avatar under the click but one's own, in a CWindowModelList
// at the click's point - (120, 30) (main's dialog.js draws it), even for one avatar. A pick opens that player's card
// or that NPC's talk and closes the list; its x and a press of the right button close it. Live's capture
// (live-avalist.json): the window 248 x 128 at (x - 120, y - 30), alpha .7 for its bar, frame and stripes; the list 8,
// 24, 232 x 96, six 16-px rows, the first row lit; the x 229, 0.
import { WindowBuilder, type Ids, type WindowSpec } from './snapshot';
import { iconbar, chop, icon } from '@htmlui/controls/skin.js';

/** An avatar's box live's click finds it by (CChibiAvatarMng's hit test, measured on live: 39 x 129 px over its feet,
 * from 131 above them to 3 above them). */
export const AVATAR_HIT = { left: 19, right: 19, top: 131, bottom: 3 } as const;

export interface AvatarListOpen { x: number; y: number; rows: { id: number; name: string }[] }
export interface AvatarListDeps { ids: Ids; pick(id: number): void; close(): void }

export function avatarListWindow(list: AvatarListOpen | null, d: AvatarListDeps): WindowSpec | null {
  if (!list || !list.rows.length) return null;
  const b = new WindowBuilder(d.ids, 'avatar-list', 'CWindowModelList', { x: list.x - 120, y: list.y - 30, w: 248, h: 128 }, { z: 51303, wz: 51305, modal: true });
  b.add('CWindowTaskIconbar', 'bar', { x: 0, y: 0, w: 248, h: 24 }, { alpha: 0.7, active: true });
  const items = list.rows.map(r => `@0${r.name}`);
  const lb = b.add('CWindowTaskActiveListbox', 'list', { x: 8, y: 24, w: 232, h: 96 }, { items, selected: 0, marks: items.map(() => true), top: 0, topLine: 0, rows: 6 });
  b.add('CWindowTaskBackStripe', 'stripe', { x: 0, y: 0, w: 232, h: 96 }, { parent: lb.id, alpha: 0.7, rows: 6, selected: 0 });
  b.add('CWindowTaskThinChop', 'frame', { x: 0, y: 24, w: 248, h: 104 }, { alpha: 0.7 });
  b.add('CWindowTaskIconHide', 'close', { x: 229, y: 0, w: 16, h: 24 }, { pressed: false }, { key: 'avatar-list-close', label: 'Close the list', click: () => d.close() });
  b.add('CWindowTaskText', 'count', { x: 0, y: 0, w: 216, h: 96 }, { parent: lb.id, text: `${items.join('\n')}\n`, align: 1, fontSize: 16, lineGap: 0, firstLine: 0, pageLines: 6, color: [1, 1, 1, 1] });
  const win = b.win;
  b.on(lb, { key: 'avatar-list', label: 'Avatars here', click: point => {
    if (!point) return; const row = list.rows[Math.floor((point[1] - win.y - lb.y) / 16)]; if (row) d.pick(row.id);
  } });
  return b.spec();
}

// ---- the window as live's engine draws it (live's htmlui.json leaves CWindowModelList to the engine: main's dialog.js
// list is left-aligned and unlit): the icon bar and the thin chop at 70 %, the list's 16-px stripes, each name centred
// in the engine's letter-spaced Arial, the row under the pointer lit blue (the first at the click), the x at 229, 0
const CSS = `.ava-list { position: absolute; left: 0; top: 0; width: 248px; height: 128px; }
.ava-list .rows { position: absolute; left: 8px; top: 24px; width: 232px; height: 96px; overflow: hidden; opacity: .7;
  background: repeating-linear-gradient(to bottom, rgba(255,255,255,.75) 0 16px, rgba(214,222,226,.75) 16px 32px); }
.ava-list button.row { position: absolute; left: 8px; width: 232px; height: 16px; margin: 0; padding: 0; border: 0; background: none;
  font: 16px/16px Arial, Helvetica, sans-serif; letter-spacing: 1px; color: #000; text-align: center; white-space: pre; cursor: inherit; }
.ava-list button.row[data-lit] { background: linear-gradient(to bottom, #2c7df0, #0e5fd8 60%, #0b4fc0); }
.ava-list button.row[data-lit] ~ i { display: none; }`;
type ListWin = { id: number; x: number; y: number; controls: { cls: string; id: number; items?: string[]; selected?: number }[] };
export const avatarListScreen: HtmlUiScreen = {
  classes: ['CWindowModelList'],
  mode: 'owned',
  mount(_win, root) {
    if (!document.getElementById('ava-list-css')) { const st = document.createElement('style'); st.id = 'ava-list-css'; st.textContent = CSS; document.head.append(st); }
    const box = document.createElement('div'); box.className = 'ava-list'; root.append(box);
    const stripes = document.createElement('div'); stripes.className = 'rows';
    iconbar(box, { x: 0, y: 0, w: 248, h: 24 }); box.append(stripes); chop(box, { x: 0, y: 24, w: 248, h: 104 });
    const x = icon(box, { x: 229, y: 0, kind: 'hide', label: 'Close the list' });
    return { box, x, rows: [] as HTMLButtonElement[], key: '', win: null as ListWin | null };
  },
  update(win, _prev, _root, api, st) {
    const w = win as ListWin, s = st as { box: HTMLElement; x: HTMLButtonElement; rows: HTMLButtonElement[]; key: string; win: ListWin | null }; s.win = w;
    const list = w.controls.find(c => c.cls === 'CWindowTaskActiveListbox'), close = w.controls.find(c => c.cls === 'CWindowTaskIconHide');
    s.x.onclick = () => { if (close) void api.click(close.id); };
    const items = (list?.items ?? []).map(t => t.replace(/@\d/g, '')), key = items.join('\n');
    if (key !== s.key || s.rows.length && !s.rows.some(r => 'lit' in r.dataset)) {
      s.key = key; for (const r of s.rows) r.remove();
      s.rows = items.slice(0, 6).map((name, i) => {
        const r = document.createElement('button'); r.type = 'button'; r.className = 'row'; r.style.top = `${24 + 16 * i}px`; r.textContent = name;
        r.dataset.key = `avatar-list:${i}`; r.setAttribute('aria-label', name);
        // the row under the pointer is the lit one, as the engine's list
        r.onpointerenter = () => { for (const o of s.rows) delete o.dataset.lit; r.dataset.lit = ''; };
        r.onclick = () => { const v = s.win, l = v?.controls.find(c => c.cls === 'CWindowTaskActiveListbox'); if (v && l) void api.click(l.id, [v.x + 8 + 116, v.y + 24 + 16 * i + 8]); };
        s.box.append(r); return r;
      });
      if (s.rows[list?.selected ?? 0]) s.rows[list?.selected ?? 0]!.dataset.lit = '';
    }
  },
  unmount(root) { root.replaceChildren(); },
};
