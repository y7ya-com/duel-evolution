// Select Player (CWindowPlayerSelect, src/PlayerSelect/yo2PlayerSelect.cpp) in HTML. The frame, help text, rows,
// levels, Delete and Back are the generic controls (controls/basic.js); what is Select Player's own is the waist-up
// avatar of the hovered character, which the engine keeps drawing under the DOM. The bust's sprites hang off the
// scene (waistUpAvatarNew(CPlayerSelectScene, this, ...)), but the parts it is composed from each frame
// (CAvatarTexMaker) hang off the window's one plain CElement child: hidden with the window, the bust stops animating
// (live: frozen on hover, owner's report), so that element passes.
// Each character's ranked standing (../rank.js, GET /api/de/rank?self=1) sits in its row left of its "Lv01", in the
// school's colour: the full form where the name leaves room, else the short one ("Ra II (1712)").
import { rankSelf, peekRank, SELF, rankFit, rankTag, labelWidth, PID_BASE } from '../rank.js';

const ROW = 'プレイヤ選択ボタン', LV = 'プレイヤ選択ボタンのLV表示文字';
// the rows top to bottom are slots 0..3 (yo2PlayerSelect.cpp: rows_[i] at 72 + 40 i); a row's level text is 8 below its top
export function rankRows(win) {
  const rows = win.controls.filter(c => c.name === ROW && !c.parent).sort((a, b) => a.y - b.y);
  return rows.map((row, slot) => ({ slot, row, lv: win.controls.find(c => c.name === LV && c.shown && c.text && Math.abs(c.y - row.y - 8) <= 2) }))
    .filter(r => r.lv);
}
// a slot's entry in the ?self=1 answer: its pid's slot (PID_BASE + 4 index + slot), the same name
export const slotRank = (ranks, slot, name) => (ranks || []).find(r => ((r.pid - PID_BASE) & 3) === slot && r.name === name.trim()) || null;

function ranks(win, st) {
  const rows = rankRows(win), list = peekRank(SELF);
  st.win = win;
  // asked once; drawn when it comes (the window may not change again to call update)
  if (list === undefined) { rankSelf().then(() => { if (st.rankLayer?.isConnected) ranks(st.win, st); }); return; }
  const key = JSON.stringify([list, rows.map(r => [r.row.label, r.row.x, r.row.y, r.lv.x])]);
  if (st.rankKey === key) return;
  st.rankKey = key;
  st.rankLayer.replaceChildren();
  for (const { slot, row, lv } of rows) {
    const r = slotRank(list, slot, row.label || '');
    if (!r) continue;
    // between the name (the caption, 8 in from the row's left) and the level text, 8 px clear of each
    const from = row.x + 8 + labelWidth((row.label || '').trim(), 16) + 8, to = lv.x - 8;
    const s = rankFit(r, to - from, 14);
    if (s) rankTag(st.rankLayer, r, { x: from, y: lv.y + 1, w: to - from, align: 2, px: 14, text: s });
  }
}

export default {
  classes: ['CWindowPlayerSelect'],
  mode: 'pass',
  passthrough: x => x.cls === 'CWaistUpAvatar' || x.cls === 'CElement',
  mount: () => new Map(),
  update(win, prev, root, api, st) {
    api.syncWindow(root, win, st);
    if (!st.rankLayer?.isConnected) { st.rankLayer = Object.assign(document.createElement('div'), { className: 'layer' }); st.rankKey = null; }
    if (root.lastChild !== st.rankLayer) root.append(st.rankLayer);   // over the rows (syncWindow orders its own before it)
    ranks(win, st);
  },
  unmount(root, st) { root.replaceChildren(); st.clear(); st.rankLayer = null; },
};
