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

// the chat's logs by tab: the Textlists in the order the window made them, a tab each, left to right
export const chatLogs = win => win.controls.filter(c => c.cls === 'CWindowTaskTextlist');
// new lines in a log since its last snapshot (old, now: its items): the items past the last line it had; a log that
// dropped its oldest lines still counts only what was added
export function newLines(old = [], now = []) {
  if (!old.length) return now.length;
  const last = old[old.length - 1];
  for (let i = now.length - 1; i >= 0; i--) if (now[i] === last) return now.length - 1 - i;
  return now.length;
}

// ---- the deck editor's check (the deck panel's CWindowTaskDeck counts, read/deck.js): Main 40-60, Fusion and Side up
// to 15 each, no card the trunk doesn't hold (missing). ok: a legal deck
export function deckCheck(counts) {
  if (!counts) return null;
  const { main = 0, side = 0, extra = 0, missing = 0 } = counts;
  const parts = [
    { key: 'main', label: 'Main', n: main, rule: '40–60', ok: main >= 40 && main <= 60 },
    { key: 'extra', label: 'Fusion', n: extra, rule: '0–15', ok: extra <= 15 },
    { key: 'side', label: 'Side', n: side, rule: '0–15', ok: side <= 15 },
  ];
  if (missing) parts.push({ key: 'missing', label: 'Missing', n: missing, rule: 'none', ok: false });
  return { parts, ok: parts.every(p => p.ok) };
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

// ---- a Yes / No (or OK) dialog: its message and its switches; a prompt (CWindowModelInput1: the player's name ...)
// also its one-line input
export function dialog(win) {
  const cs = win.controls.filter(c => c.shown && top(c));
  return {
    text: untag(cs.find(c => /TextField$|Text$/.test(c.cls) && c.text)?.text || ''),
    input: cs.find(c => /CWindowTaskInput$/.test(c.cls)) || null,
    buttons: cs.filter(c => /Switch$|ButtonDuel$/.test(c.cls) && c.label).sort((a, b) => a.x - b.x),
  };
}

// ---- D-Mail (CWindowModelDMail: the inbox; CWindowModelDMailSend: Write Mail). Its switches by label; the inbox's
// rows are its shown DMailItems, each read from its own texts; the open mail's body is 'メール本文'; a form's fields are
// its Inputs (a MultiInput's Input child), each named by the label text on its row, left of it, or just above it.
export function mail(win) {
  const cs = win.controls, shown = cs.filter(c => c.shown);
  const isInput = c => /CWindowTaskInput$/.test(c.cls);
  // labels: plain texts and the form's ShadowText captions ('『件名』' Subject:, '『宛先』' To:), not the title
  const title = shown.find(c => c.cls === 'CWindowTaskShadowText' && top(c) && c.y < 16);
  const texts = shown.filter(c => /CWindowTask(Shadow)?Text$/.test(c.cls) && top(c) && c.text && c !== title && c.name !== 'メール本文');
  const used = new Set();   // a caption names one field (the message box sits under Subject's)
  const fields = shown.filter(c => isInput(c) && (top(c) || cs.find(p => p.id === c.parent)?.cls.endsWith('MultiInput'))).map(c => {
    const up = cs.find(p => p.id === c.parent);
    return { c, up, at: up?.cls.endsWith('MultiInput') ? { ...c, x: c.x + up.x, y: c.y + up.y } : c };
  }).sort((a, b) => a.at.y - b.at.y).map(({ c, up, at }) => {
    const lab = texts.filter(t => !used.has(t.id) && ((sameRow(t, at, 10) && t.x < at.x) || (t.y < at.y && at.y - t.y <= 28 && Math.abs(t.x - at.x) < 40)))
      .sort((a, b) => b.y - a.y || b.x - a.x)[0];
    if (lab) used.add(lab.id);
    return { c, y: at.y, label: untag(lab?.text || '').replace(/[:：]\s*$/, ''), area: !!c.multiLine || /MultiInput$/.test(up?.cls || '') };
  });
  return {
    compose: /Send$/.test(win.cls),
    title: title?.text || 'D-Mail',
    // Write Mail's recipient: picked through Friend List, shown in the ShadowText '宛先' after the 'To:' caption
    to: shown.some(c => c.name === '『宛先』') ? { label: untag(shown.find(c => c.name === '『宛先』').text).replace(/[:：]\s*$/, ''),
      name: untag(shown.find(c => c.name === '宛先')?.text || '').trim() } : null,
    buttons: shown.filter(c => /TextSwitch$|ButtonDuel$/.test(c.cls) && top(c) && c.label),
    rows: shown.filter(c => /DMailItem$/.test(c.cls)).sort((a, b) => a.y - b.y).map(r => ({
      r, text: cs.filter(t => t.parent === r.id && t.shown && t.text).sort((a, b) => a.x - b.x).map(t => untag(t.text).trim()).filter(Boolean),
    })),
    body: untag(cs.find(c => c.name === 'メール本文' && c.shown)?.text || ''),
    fields,
  };
}

// ---- character creation (CWindowDialogAvatarSwitch): its picture switches by size (categories 324, items 254, Confirm /
// Back 162, the page arrows 32 x 64), each with the text that sits on it; texts on no switch stay loose
export function avatarParts(win) {
  const sw = win.controls.filter(c => c.cls === 'CWindowTaskPictureSwitch' && c.shown);
  const texts = win.controls.filter(c => c.cls === 'CWindowTaskText' && !c.parent && c.shown && c.text);
  const inside = (t, c) => t.x + t.w / 2 >= c.x - 8 && t.x <= c.x + c.w && t.y >= c.y - 12 && t.y < c.y + c.h;
  const label = c => texts.find(t => inside(t, c))?.text || '';
  const kind = c => c.w === 324 ? 'category' : c.w === 254 ? 'item' : c.w === 162 ? 'action' : c.w <= 40 && c.h >= 56 ? 'arrow' : 'other';
  const all = sw.map(c => ({ c, kind: kind(c), label: label(c) }));
  const used = new Set(all.flatMap(s => texts.filter(t => inside(t, s.c)).map(t => t.id)));
  return { switches: all.filter(s => s.kind !== 'other'), loose: texts.filter(t => !used.has(t.id)) };
}
