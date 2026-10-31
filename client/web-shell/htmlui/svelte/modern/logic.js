// Modern UI's pure parts: what each modern window reads out of its snapshot (CONTRACT.md), with no DOM, so the state
// tests (svelte/modern_test.mjs) run them in Node. A component derives everything from these and the snapshot.
const untag = s => String(s ?? '').replace(/[@＠]\d/g, '');
const top = c => !c.parent;
const sameRow = (a, b, tol = 12) => Math.abs(a.y + a.h / 2 - (b.y + b.h / 2)) < tol;

// ---- Select Player (CWindowPlayerSelect): the four slots top to bottom; a slot's level is the LV text on its row, its
// Delete the '削除ボタン' on its row (an empty slot has neither)
const ROW = 'プレイヤ選択ボタン', LV = 'プレイヤ選択ボタンのLV表示文字', DEL = '削除ボタン', BACK = '選択スイッチ', TITLE = '説明の文字列';
export function slots(win) {
  const cs = win.controls;
  return cs.filter(c => c.name === ROW && c.shown).sort((a, b) => a.y - b.y).map(row => {
    const lv = cs.find(c => c.name === LV && c.shown && sameRow(c, row))?.text || '';
    const del = cs.find(c => c.name === DEL && c.shown && sameRow(c, row));
    return { row, name: row.label, level: /\d+/.exec(lv)?.[0] || '', del, empty: !del && !lv };
  });
}
export const backButton = win => win.controls.find(c => c.name === BACK && c.shown);
export const heading = win => win.controls.find(c => c.name === TITLE)?.text || 'Select Player';

// ---- the Main Menu (CMainMenu): its ButtonMains in four groups by label; one the game adds goes under System
export const GROUPS = [
  ['Play', ['Edit Deck', 'DUEL OPTIONS', 'Duel Log']],
  ['You', ['My Profile', 'Change Title', 'Create Comment']],
  ['Social', ['D-Mail', 'Friend List', 'Team List', 'Ignore List']],
  ['System', ['Audio', 'Return to Title']],
];
export const ICONS = { 'Edit Deck': 'deck', 'DUEL OPTIONS': 'duel', 'Duel Log': 'log', 'My Profile': 'profile', 'Change Title': 'title',
  'Create Comment': 'comment', 'D-Mail': 'mail', 'Friend List': 'friends', 'Team List': 'team', 'Ignore List': 'ignore',
  'Audio': 'audio', 'Return to Title': 'exit' };
// an all-capitals engine label in title case ('DUEL OPTIONS' -> 'Duel Options'); the rest as the game has them
export const nice = s => s === s.toUpperCase() && /[A-Z]{3}/.test(s) ? s.toLowerCase().replace(/\b\w/g, m => m.toUpperCase()) : s;
export function menuGroups(win) {
  const bs = win.controls.filter(c => c.cls === 'CWindowTaskButtonMain' && c.shown);
  const known = new Set(GROUPS.flatMap(g => g[1]));
  return GROUPS.map(([name, labels]) => [name, [...labels.map(l => bs.find(b => b.label === l)).filter(Boolean),
    ...(name === 'System' ? bs.filter(b => !known.has(b.label)) : [])]]).filter(g => g[1].length || g[0] === 'System');
}

// ---- the place banner (CWindowModelPlace): a row is its ShadowTexts left to right ('Duelist Academy' + '(1/1000)')
export const place = s => {
  const m = /^(.*?)\s*\((\d+)\s*\/\s*(\d+)\)\s*$/.exec(s);
  return m ? { name: m[1], here: m[2], cap: m[3] } : { name: s, here: '', cap: '' };
};
export function placeRows(win) {
  const ts = win.controls.filter(c => c.cls === 'CWindowTaskShadowText' && top(c) && c.shown && c.text);
  const rows = [];
  for (const t of [...ts].sort((a, b) => a.y - b.y || a.x - b.x)) {
    const r = rows.find(r => Math.abs(r.y - t.y) < 6);
    r ? r.parts.push(t) : rows.push({ y: t.y, id: t.id, parts: [t] });
  }
  return rows.map(r => ({ id: r.id, ...place(r.parts.sort((a, b) => a.x - b.x).map(t => t.text).join(' ')) }));
}

// ---- the chat (CChatWindow): 'Name: text' -> a name and its message; '[System] ...' lines are notices
export function chatLine(s) {
  const t = untag(s);
  if (/^\s*\[[^\]]+\]/.test(t)) return { notice: true, text: t };
  const m = /^([^:：]{1,24})[:：]\s?(.*)$/s.exec(t);
  return m ? { name: m[1], text: m[2] } : { text: t };
}
export function chatParts(win) {
  const cs = win.controls;
  return {
    tabs: cs.filter(c => c.cls === 'CWindowTaskTab' && c.shown).sort((a, b) => a.x - b.x),
    // one log per tab, the active tab's shown
    log: cs.find(c => c.cls === 'CWindowTaskTextlist' && c.shown) || cs.find(c => c.cls === 'CWindowTaskTextlist'),
    input: cs.find(c => /CWindowTaskInput$/.test(c.cls) && top(c)),
    taller: cs.find(c => c.cls === 'CWindowTaskIconExpand' && c.shown),
    shorter: cs.find(c => c.cls === 'CWindowTaskIconHide' && c.shown),
  };
}

// ---- lists: the game point of row i of a list control (window win), the list showing rows from top
export const rowPoint = (win, list, i, top = list.top || 0) => {
  const rows = Math.max(1, list.rows || 6), h = list.h / rows;
  return [win.x + list.x + Math.min(40, list.w / 2), win.y + list.y + h * (i - top) + h / 2];
};
export const listItems = list => (list?.items || []).map(untag);

// ---- a list window (Friend / Ignore / Team List: FrameDuel, Listbox, ButtonDuels, its title ShadowText)
export function listWindow(win) {
  const cs = win.controls.filter(c => c.shown && top(c));
  const list = cs.find(c => /Listbox$/.test(c.cls));
  return {
    title: cs.find(c => c.cls === 'CWindowTaskShadowText')?.text || '',
    list,
    bar: list && win.controls.find(c => c.parent === list.id && /Scroll$/.test(c.cls)),
    buttons: cs.filter(c => /ButtonDuel$|TextSwitch$|Switch$/.test(c.cls) && c.label).sort((a, b) => a.x - b.x),
  };
}
// the button that leaves a window (Esc): Close, Cancel, No, Back, then OK
export const leaveButton = bs => ['Close', 'Cancel', 'No', 'Back', 'OK'].map(l => bs.find(b => b.label?.trim() === l)).find(Boolean);
// the window's one primary action (gold): OK, Yes, Send, else none
export const primary = b => /^(OK|Yes|Send)$/.test(b.label?.trim() || '');

// ---- My Profile (CWindowModelProfile): its item names (align 0) each with the value right under it (align 2)
export function profile(win) {
  const ts = win.controls.filter(c => c.shown && top(c) && c.cls === 'CWindowTaskText');
  const names = ts.filter(t => t.name === 'プロフィールウィンドウの項目名').sort((a, b) => a.y - b.y);
  const values = ts.filter(t => t.name === 'プロフィールウィンドウの項目の数値');
  return {
    title: win.controls.find(c => c.cls === 'CWindowTaskShadowText' && top(c) && c.shown)?.text || 'Profile',
    rows: names.map(n => ({ id: n.id, name: n.text.trim(), value: (values.find(v => v.y === n.y + 16)?.text || '').trim() })),
    ok: win.controls.find(c => c.shown && /ButtonDuel$/.test(c.cls)),
  };
}

// ---- a Yes / No (or OK) dialog: its message and its switches
export function dialog(win) {
  const cs = win.controls.filter(c => c.shown && top(c));
  return {
    text: untag(cs.find(c => /TextField$|Text$/.test(c.cls) && c.text)?.text || ''),
    buttons: cs.filter(c => /Switch$|ButtonDuel$/.test(c.cls) && c.label).sort((a, b) => a.x - b.x),
  };
}
