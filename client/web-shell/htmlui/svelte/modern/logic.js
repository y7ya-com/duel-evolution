// Modern UI's pure parts: what each modern window reads out of its snapshot (CONTRACT.md), with no DOM, so the state
// tests (svelte/modern_test.mjs) run them in Node. A component derives everything from these and the snapshot.
// the game's text tags: '@<digit>' a colour, '@>n/' a move to x n (the player list's 'Lv 1@>40/Name': a space here)
const untag = s => String(s ?? '').replace(/[@＠]>\d+\/?/g, ' ').replace(/[@＠]\d/g, '');
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

// ---- the place banner (CWindowModelPlace): a row is its ShadowTexts left to right ('Duelist Academy' + '(1/1000)');
// a count is '(n/cap)' or, on the lobby's Move rows, a bare 'n/cap' after the name
export const place = s => {
  const m = /^(.*?)\s*(?:\(\s*(\d+)\s*\/\s*(\d+)\s*\)|\s(\d+)\s*\/\s*(\d+))\s*$/.exec(s);
  return m ? { name: m[1], here: m[2] ?? m[4], cap: m[3] ?? m[5] } : { name: s, here: '', cap: '' };
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
    // the window folded to its bar (the deck editor's chat: 32 high, its log parked at 99999, no line): the log and the
    // line are drawn only as the game shows them, never past the window's rect
    open: cs.some(c => c.cls === 'CWindowTaskTextlist' && c.shown && c.h >= 0 && c.y < 9999),
    typing: cs.some(c => /CWindowTaskInput$/.test(c.cls) && top(c) && c.shown),
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

// ---- an OK box that is only news (CWindowModelDialogOk: a message and its one OK): a toast, its OK pressed at once.
// null: not one (no message, or more than the OK button: then it stays a dialog)
export function toastable(win) {
  const d = dialog(win);
  return win.cls === 'CWindowModelDialogOk' && d.text.trim() && d.buttons.length === 1 && /^OK$/i.test(d.buttons[0].label.trim())
    ? { text: d.text.trim(), ok: d.buttons[0] } : null;
}

// ---- friends' presence (GET /api/de/friends, same origin: [{ pid, name, online, place }]) by name, lower case; a name
// the list has and the answer lacks has no presence (shown as the list shows it)
export function presence(rows) {
  const m = new Map();
  for (const r of Array.isArray(rows) ? rows : []) if (r && typeof r.name === 'string') m.set(r.name.trim().toLowerCase(), { online: !!r.online, place: String(r.place || '') });
  return m;
}

// ---- the generic window (Generic.svelte): any window with no bespoke modern screen, drawn from its controls in the
// modern look at the engine's own places. Pass mode: the engine keeps every input (click, hover, keys, typing, wheel,
// drag) and the DOM only paints, so a window nobody has looked at can't gain an input bug. Pictures, Flash and controls
// the bridge doesn't know stay the engine's (passthrough), cut out of the plate.
// The windows it takes (svelte/modern/DESIGN.md "Coverage"; the inventory: every CWindowTaskModel subclass in
// client/include/yo2): the generic ones, and htmlui-select's until their bespoke screens land. Not here: the bespoke
// ones (svelte/modern.js), base classes, CDeckCardLoader (no controls), CWindowTaskCardArea (trade's drag: the
// engine's), CWindowModelTitleConfig, and CWindowLogin (the 2008 ID / password form, which must never show).
export const GENERIC = [
  // htmlui-select's, until theirs land
 'CFixedsentenceList',
  'CWindowModelDueldiskRearrenge', 'CWindowOptionDlg',
  'CWindowModelInformation', 'CWindowModelGoEvent', 'CWindowModelAboutEvent', 
  // the rest
  'CHelpDialog', 'CShopNpcProfile', 'CWindowModelBlacklistInput', 'CWindowModelCardDetail', 'CWindowModelDuellogList',
  'CWindowModelDuellogOperation', 'CWindowModelDuellogSearch', 'CWindowModelDuellogTop', 'CWindowModelDuellogTour',
  'CWindowModelDuelpass150', 'CWindowModelDuelpassInputCode', 'CWindowModelDuelpassUSB', 'CWindowModelFriendEnum', 'CWindowModelHelp',
  'CWindowModelInput2', 'CWindowModelInputValue', 'CWindowModelJoinGunsling', 'CWindowModelListCard',
  'CWindowModelListCardAttr', 'CWindowModelListCardForbi', 'CWindowModelListCardIcon', 'CWindowModelListCardPack',
  'CWindowModelListCardStar', 'CWindowModelListCardType', 'CWindowModelPictureButton', 'CWindowModelPresent', 'CWindowModelProgress',
  'CWindowModelReturnButton', 'CWindowModelThin', 'CWindowModelThinImg', 'CWindowModelTp', 'CWindowModelTrade', 'ParamWindow',
  // the duel's
  'CUDiceDialog', 'CUDiscardDialog', 'CUGHelpManager', 'CULockOnDialog', 'CUOkDialog', 'CUPhaseSelectDialog', 'CUPhaseYesNoDialog',
  'CURitualDialog', 'CUSelectAttributeDialog', 'CUSelectCoinDialog', 'CUSelectDialog', 'CUSelectNumDialog', 'CUSelectStandDialog',
  'CUSelectTypeDialog', 'CUSummonDialogSp', 'CUYesNoDialog', 'CWindowDeckList', 'CWindowModelListDuelCmd', 'CWindowPackSelect',
  'CWindowResult', 'CWindowResultNext', 'CWindowResultNpc',
];

// a control's family (CONTRACT.md's), by class; 'engine': the engine keeps drawing it (pictures, Flash, unknown)
const FAMILIES = [
  ['frame', /^(Frame|PictureFrame|BackPlane|BackStripe|ThinChop)|Frame$/], ['text', /^(Text|ShadowText|TextField|TextItem)$/],
  ['button', /^(Switch|TextSwitch|ButtonMain|ButtonDuel|ResultNext)$/], ['check', /^Checkbox$/], ['tab', /^Tab$/],
  ['input', /^(Input|InputDuel|MultiInput)$/], ['list', /Listbox|Textlist|NoBackList/], ['scroll', /Scroll/],
  ['icon', /^Icon(Show|Hide|Expand|Shrink)$/], ['bar', /^(Iconbar|Menubar)$/], ['slider', /^Slider$/],
];
export function family(c) {
  if (/^CWindow\w*Scroll$/.test(c.cls || '')) return 'scroll';   // CWindowResultScroll
  if (!/^CWindowTask/.test(c.cls || '')) return 'engine';
  const k = c.cls.slice(11);
  // a picture switch with a caption (Options' OK / Cancel) is a button; one without (a flag, a screen mode) a picture
  if (k === 'PictureSwitch') return untag(c.label || '').trim() ? 'button' : 'engine';
  return FAMILIES.find(([, r]) => r.test(k))?.[0] || 'engine';
}
const area = r => r.w * r.h;
const has = r => r.w > 0 && r.h > 0;
// the box around rects
const union = rs => {
  if (!rs.length) return null;
  const x = Math.min(...rs.map(r => r.x)), y = Math.min(...rs.map(r => r.y));
  return { x, y, w: Math.max(...rs.map(r => r.x + r.w)) - x, h: Math.max(...rs.map(r => r.y + r.h)) - y };
};
// a sprite's drawn rect, window-local
const spriteRect = (s, win) => s.shown === false || !s.src || s.wx == null ? null
  : { x: s.wx - win.x, y: s.wy - win.y, w: s.src[2] * (s.sx ?? 1), h: s.src[3] * (s.sy ?? 1) };

// what a generic window shows: { plate, band, items, holes, backdrop, keep }.
// - Only top-level controls are drawn (a nested one is a part its parent draws: a caption, a field's plane), and a
//   list's scroll bar (nested: its x / y are the list's, as every nested control's are its parent's).
// - plate: the outermost frame's rect, else the whole window when a picture is its backdrop (backdrop: those sprite
//   extras, covering most of the window: not drawn, the plate instead), else none.
// - band: the title strip ({ h, title }) when a ShadowText heads the plate.
// - items: { kind, c, ... } back to front. holes: the rects the engine still draws (cut out of the plate): pictures,
//   Flash, unknown controls (with no size of their own: the box around their sprites, `parts`), sprite extras.
// - keep: what the engine keeps drawing (passthrough): those top-level controls (their parts follow them) and extras.
export function generic(win) {
  const shown = win.controls.filter(c => c.shown !== false);
  const top = shown.filter(c => !c.parent);
  const kids = id => shown.filter(c => c.parent === id);
  const backdrop = [], extras = [];
  for (const e of win.extras || []) {
    const r = spriteRect(e, win);
    if (r && has(r)) (area(r) >= win.w * win.h * .6 ? backdrop : extras).push({ e, r });
  }
  // an unknown control over most of the window is its frame too (drawn as the plate, not cut out)
  const big = c => has(c) && area(c) >= win.w * win.h * .6;
  const fam = new Map(top.map(c => [c.id, family(c) === 'engine' && big(c) ? 'frame' : family(c)]));
  // a captionless picture switch with a text laid over it (the Duel Log's tabs): a button with that caption
  // a caption's box about its button's height: its centre (the Duel Log's are wider than their tabs, centred on them);
  // a taller box (256 x 256 by default: Duel Options' labels): where its first line starts
  const inside = (t, b) => {
    const tall = t.h > b.h * 1.5;
    const x = !tall || t.align === 1 ? t.x + t.w / 2 : t.align === 2 ? t.x + t.w - 8 : t.x + 8, y = tall ? t.y + (t.fontSize || 16) / 2 : t.y + t.h / 2;
    return x > b.x && x < b.x + b.w && y > b.y && y < b.y + b.h;
  };
  const captions = new Map(), used = new Set();
  for (const b of top) {
    if (!/PictureSwitch$/.test(b.cls) || fam.get(b.id) !== 'engine' || area(b) < 1500) continue;
    const ts = top.filter(t => !used.has(t.id) && family(t) === 'text' && t.text?.trim() && inside(t, b));
    if (!ts.length) continue;
    ts.forEach(t => used.add(t.id));
    captions.set(b.id, ts.map(t => untag(t.text).trim()).join(' '));
    fam.set(b.id, 'button');
  }
  const frames = top.filter(c => fam.get(c.id) === 'frame' && has(c)).sort((a, b) => area(b) - area(a));
  // a frame that reads far smaller than its window (Duel Options' DuelConfigFrame: 80 x 24) stands for the whole window
  const plate = frames[0] && area(frames[0]) >= win.w * win.h * .5 ? { x: frames[0].x, y: frames[0].y, w: frames[0].w, h: frames[0].h }
    : frames[0] || backdrop.length ? { x: 0, y: 0, w: win.w, h: win.h } : null;
  const title = plate && top.find(c => /ShadowText$/.test(c.cls) && c.text?.trim() && c.y - plate.y < 30 && c.y >= plate.y - 4);
  const band = title ? { h: Math.max(30, Math.min(44, title.y - plate.y + title.h + 7)), title: untag(title.text).trim(), c: title } : null;
  const items = [], holes = [], keep = [];
  for (const c of top) {
    const f = fam.get(c.id);
    if (c === title || used.has(c.id)) continue;
    if (f === 'engine') {
      keep.push(c.id);
      const r = has(c) ? c : union((c.parts?.sprites || []).map(s => spriteRect(s, win)).filter(r => r && has(r)));
      if (r) holes.push({ x: r.x, y: r.y, w: r.w, h: r.h });
      continue;
    }
    if (f === 'frame') {
      // an inner frame (not the plate, not a list's stripes): a well
      if (c !== frames[0] && has(c) && area(c) < area(plate) * .85 && !/BackStripe/.test(c.cls)) items.push({ kind: 'well', c });
      continue;
    }
    if (f === 'text') {
      // a text field with its own back plane, or a large text area (the Duel Log's log): a well under its text
      // (256 x 256 is a text's default box, not an area: Duel Options' labels)
      const well = has(c) && (/TextField$/.test(c.cls) && kids(c.id).some(k => family(k) === 'frame') || c.w >= 160 && c.h >= 64 && !(c.w === 256 && c.h === 256));
      if (well) items.push({ kind: 'well', c });
      const t = shownText(c);
      if (t.trim()) items.push({ kind: 'text', c, text: t, heading: /ShadowText$/.test(c.cls), well });
      continue;
    }
    if (f === 'list') {
      items.push({ kind: 'list', c, rows: listRows(c) });
      for (const k of kids(c.id)) {
        const t = family(k) === 'scroll' && thumb(k);
        if (t) items.push({ kind: 'scroll', c: { ...k, x: c.x + k.x, y: c.y + k.y }, thumb: t });
      }
      continue;
    }
    if (f === 'scroll') { const t = thumb(c); if (t) items.push({ kind: 'scroll', c, thumb: t }); continue; }
    if (f === 'bar') { if (/Menubar$/.test(c.cls) && c.message) items.push({ kind: 'text', c, text: untag(c.message) }); continue; }
    if (f === 'button') { const label = captions.get(c.id) ?? untag(c.label || '').trim(); items.push({ kind: 'button', c, label, gold: primary({ label }) }); continue; }
    if (f === 'slider') {
      // no fields of its own: its sprites (parts) are the track and the knob (the narrowest), drawn here at their places
      const rs = (c.parts?.sprites || []).map(s => spriteRect(s, win)).filter(r => r && has(r));
      const box = union(rs), knob = rs.length > 1 ? rs.reduce((a, b) => b.w < a.w ? b : a) : null;
      if (box) items.push({ kind: 'slider', c: { ...c, ...box }, knob: knob && { x: knob.x - box.x + knob.w / 2, frac: box.w ? (knob.x + knob.w / 2 - box.x) / box.w : 0 } });
      continue;
    }
    items.push({ kind: f, c });
  }
  for (const { e, r } of extras) { holes.push(r); keep.push(e.id); }
  return { plate, band, items, holes, backdrop: backdrop.map(b => b.e.id), keep };
}
// a generic window's keys (DESIGN.md UX spec 1): Esc its way out (Close, Cancel, No, Back, OK), Enter its primary (OK,
// Yes, Send): { leave, primary } controls or null, from what generic() drew as buttons (enabled ones only)
export function genericKeys(g) {
  const bs = g.items.filter(i => i.kind === 'button' && i.c.enabled !== false && i.c.state !== 'disabled').map(i => ({ ...i.c, label: i.label }));
  return { leave: leaveButton(bs) || null, primary: bs.find(primary) || null };
}
// a text control's shown lines (from firstLine, pageLines of them), colour tags out
export const shownText = c => { const f = c.firstLine || 0; return untag(c.text || '').split('\n').slice(f, f + (c.pageLines || Infinity)).join('\n'); };
// a list's shown rows: [{ i, text, selected, marked }] from its top, as many as fit
export function listRows(c) {
  const items = c.items || [], top = c.top || 0, n = c.rows || Math.max(1, Math.floor((c.h || 0) / 18));
  return items.slice(top, top + n).map((s, k) => ({ i: top + k, text: untag(s), selected: c.selected === top + k, marked: !!c.marks?.[top + k] }));
}
// a scroll bar's thumb as fractions of its track ({ at, len }), or null when there's nothing to scroll
export function thumb(c) {
  const max = c.max || 0, page = Math.max(1, c.page || 1);
  if (max <= 0) return null;
  const len = Math.max(.08, Math.min(1, page / (max + page)));
  return { at: Math.min(1, Math.max(0, (c.value || 0) / max)) * (1 - len), len };
}

// ---- Duel Options (CWindowModelDuelConfig): its settings top to bottom, each a heading ShadowText and the option
// PictureSwitches under it (the one the game has checked is the setting), each option's caption the ShadowText on it;
// the description the ShadowText '説明' (else the widest one: a heading reads 256 x 256; the engine writes the hovered
// option's help there); OK and Cancel its ButtonDuels
export function duelConfig(win) {
  const cs = win.controls.filter(c => c.shown && top(c));
  const inside = (t, c) => t.x >= c.x - 2 && t.x < c.x + c.w && t.y >= c.y && t.y < c.y + c.h;
  const texts = cs.filter(c => c.cls === 'CWindowTaskShadowText' && c.y > 16);
  const opts = cs.filter(c => c.cls === 'CWindowTaskPictureSwitch' && c.w >= 64).sort((a, b) => a.y - b.y || a.x - b.x)
    .map(c => ({ c, label: texts.find(t => t.text && inside(t, c))?.text || '' }));
  const desc = texts.find(t => t.name === '説明') || texts.filter(t => t.h >= 64).sort((a, b) => b.w - a.w)[0];
  const heads = texts.filter(t => t.text && t !== desc && !opts.some(o => inside(t, o.c))).sort((a, b) => a.y - b.y);
  const sections = heads.map(h => ({ id: h.id, title: h.text, options: [] }));
  for (const o of opts) {
    const i = heads.findLastIndex(h => h.y < o.c.y);
    if (i >= 0) sections[i].options.push(o);
  }
  const buttons = cs.filter(c => /ButtonDuel$/.test(c.cls) && c.label).sort((a, b) => a.x - b.x);
  return {
    title: cs.find(c => c.cls === 'CWindowTaskShadowText' && c.y <= 16)?.text || 'Duel Options',
    sections: sections.filter(s => s.options.length),
    help: untag(desc?.text || ''),
    ok: buttons.find(primary), cancel: leaveButton(buttons),
  };
}

// ---- the Move window (CWindowModelMove, the bar's door: where to go): its place buttons top to bottom, each its name
// and head count; the x; the scroll bar the game shows past six places (then only six buttons are shown at a time)
export function moveWindow(win) {
  const cs = win.controls.filter(c => c.shown && top(c));
  return {
    places: cs.filter(c => /ButtonDuel$/.test(c.cls) && c.label).sort((a, b) => a.y - b.y).map(c => ({ c, ...place(untag(c.label).trim()) })),
    close: cs.find(c => c.cls === 'CWindowTaskIconHide'),
    bar: cs.find(c => /Scroll$/.test(c.cls)),
  };
}

// ---- an item / unlock announcement (CWindowModelItemGet: "Now, you can challenge Yami Marik to a Duel!"): its kind
// line, its item line, the Structure Deck hint when shown, its OK (a picture switch with the OK text on it). The
// portrait card behind them is the window's sprite extras, which the engine keeps drawing
export function itemGet(win) {
  const cs = win.controls.filter(c => c.shown && top(c));
  const texts = cs.filter(c => /ShadowText$/.test(c.cls)).sort((a, b) => a.y - b.y);
  const ok = cs.find(c => /PictureSwitch$/.test(c.cls) && c.w >= 64);
  return {
    lines: texts.map(t => ({ id: t.id, text: untag(t.text).trim(), c: t })).filter(l => l.text),
    ok, okLabel: (ok && cs.find(c => c.cls === 'CWindowTaskText' && c.text?.trim() && Math.abs(c.x - ok.x) < 4 && Math.abs(c.y - ok.y) < 16)?.text.trim()) || 'OK',
  };
}

// ---- a duelist's card (CNpcListMenu, CPlayerListMenu: the lobby's character click): its CWindowTaskHelps top to
// bottom, each showing its child text; the first is the name, a 『』 one is the label of the help under it (Win% over
// "Wins0/Losses0"), one left over is the about text; the buttons the menu shows (a player's)
const helpText = (win, h) => win.controls.find(c => c.parent === h.id && c.cls === 'CWindowTaskText')?.text ?? '';
export function duelistCard(win) {
  const cs = win.controls.filter(c => c.shown && top(c));
  const helps = cs.filter(c => c.cls === 'CWindowTaskHelp').sort((a, b) => a.y - b.y).map(h => ({ h, text: untag(helpText(win, h)).trim() }));
  const name = helps.find(x => /名前/.test(x.h.name)) || helps[0];
  const rows = [], about = [];
  for (let i = 0; i < helps.length; i++) {
    const x = helps[i];
    if (x === name) continue;
    if (/『/.test(x.h.name) && helps[i + 1] && !/『/.test(helps[i + 1].h.name) && helps[i + 1] !== name) { rows.push({ label: x.text, value: helps[++i].text }); continue; }
    if (x.text) about.push(x.text.split('\n').map(l => l.trim()).join('\n'));
  }
  // "Wins0/Losses0" as figures
  const rec = rows.map(r => /^Wins\s*(\d+)\s*\/\s*Losses\s*(\d+)$/i.exec(r.value)).find(Boolean);
  // a player whose duel is open: its settings are the about text, a line each ("Single Mode", "Surrender ON" ...)
  const lines = about.join('\n').split('\n').map(l => l.trim()).filter(Boolean);
  const duel = lines.length && lines.every(l => /Mode|Limit|Surrender|Watch/i.test(l) && l.length <= 24) ? lines : null;
  return {
    name: name?.text || '', rows, about: duel ? '' : about.join('\n\n'), duel,
    record: rec ? { wins: +rec[1], losses: +rec[2] } : null,
    buttons: cs.filter(c => /ButtonDuel$|TextSwitch$/.test(c.cls) && c.label).sort((a, b) => a.y - b.y || a.x - b.x),
  };
}

// ---- an NPC's speech bubble (CWindowModelBalloon): the speaker and the line (its '・' marks are pauses, a glyph the
// 2008 font lacks: '…'; trailing blank lines dropped); the frame is what a click advances
export function balloon(win) {
  const cs = win.controls.filter(c => c.shown && top(c));
  const body = cs.find(c => c.name === 'ふきだしウィンドウの本文') || cs.filter(c => c.cls === 'CWindowTaskText' && c.text).sort((a, b) => b.h - a.h)[0];
  const who = cs.find(c => c.name === 'ふきだしウィンドウの名前') || cs.find(c => c.cls === 'CWindowTaskText' && c !== body && c.text);
  const text = untag(body?.text || '').replace(/・/g, '…').split('\n').map(l => l.trimEnd()).join('\n').replace(/\s+$/, '');
  return { name: untag(who?.text || '').trim(), text, frame: cs.find(c => /BalloonFrame$/.test(c.cls)) };
}

// ---- the pick list (CWindowModelList: who is under the click): its title (the Iconbar's, often none), its names,
// the selected one, the list and its scroll bar, the x
export function pickList(win) {
  const cs = win.controls.filter(c => c.shown && top(c));
  const list = cs.find(c => /Listbox$/.test(c.cls));
  return {
    title: untag(cs.find(c => /Iconbar$/.test(c.cls))?.text || '').trim(),
    list, names: listItems(list).map(s => s.trim()),
    bar: list && win.controls.find(c => c.parent === list.id && /Scroll$/.test(c.cls) && c.shown),
    close: cs.find(c => c.cls === 'CWindowTaskIconHide'),
  };
}

// ---- the player list's search menu (CFindMenu: one ActiveListbox of filters and orders): its entries in two groups,
// what to show (Single / Match Duels, Friends, Proximity, Show all) and how to order ('Display by ...'), each with its
// index in the game's list
export function findMenu(win) {
  const list = win.controls.find(c => c.shown && top(c) && /Listbox$/.test(c.cls));
  const all = listItems(list).map((label, i) => ({ i, label: label.trim() }));
  const sort = all.filter(e => /^Display by/i.test(e.label));
  return { list, groups: [['Show', all.filter(e => !sort.includes(e))], ['Order', sort]].filter(g => g[1].length),
    bar: list && win.controls.find(c => c.parent === list.id && /Scroll$/.test(c.cls) && c.shown) };
}

// ---- My Room's duel disk case (CDuelDiskList, the shelf's case: a 6 x 2 grid of the disks you own, its pages, the
// hovered disk's text, Close): the page arrows by side, the text split into its name ('[Duel Academy Model]') and
// the rest, Close; the grid and the disks are the window's sprite extras, which the engine keeps drawing
export function diskCase(win) {
  const cs = win.controls.filter(c => c.shown && top(c));
  const arrows = cs.filter(c => /PictureSwitch$/.test(c.cls) && c.h >= 64).sort((a, b) => a.x - b.x);
  const t = untag(cs.find(c => c.cls === 'CWindowTaskText' && !c.label && c.w >= 200)?.text || '').trim();
  const m = /^\[([^\]]+)\]\s*([\s\S]*)$/.exec(t);
  return {
    prev: arrows.length > 1 ? arrows[0] : null, next: arrows.length > 1 ? arrows[arrows.length - 1] : null,
    grid: arrows.length > 1 ? { x: arrows[0].x, y: arrows[0].y, w: arrows.at(-1).x + arrows.at(-1).w - arrows[0].x, h: arrows[0].h } : null,
    name: m ? m[1].trim() : '', text: m ? m[2].replace(/\s*\n\s*/g, ' ').trim() : t,
    close: cs.find(c => /TextSwitch$|ButtonDuel$/.test(c.cls) && c.label),
  };
}

// ---- the title's Options (COptionDlg): language flags (the art's order: Japanese, English, German, French / Italian,
// Spanish, Korean; the checked one is the language), the two screen modes (full screen, then window), the volume
// slider (its track and knob from its sprites, as generic draws it) with its - / + buttons, OK and Cancel; the game's own
// texts for the section names and the chosen language / screen
export const LANGS = ['日本語', 'English', 'Deutsch', 'Français', 'Italiano', 'Español', '한국어'];
export function options(win) {
  const cs = win.controls.filter(c => c.shown && top(c));
  const byName = n => cs.filter(c => c.name === 'COptionDlg::' + n);
  const text = n => untag(byName(n)[0]?.text || '').trim();
  const flags = byName('m_flags[i]').sort((a, b) => a.y - b.y || a.x - b.x).map((c, i) => ({ c, name: LANGS[i] || '' }));
  const screens = byName('m_screenBtn[i]').sort((a, b) => a.x - b.x).map((c, i) => ({ c, name: ['Full screen', 'Window'][i] || '' }));
  const vol = byName('m_volumeBtn[i]').sort((a, b) => a.x - b.x);
  const slider = generic(win).items.find(i => i.kind === 'slider') || null;
  const set = byName('m_setBtn[i]').sort((a, b) => a.x - b.x);
  return {
    heads: ['m_textLang', 'm_textScreen', 'm_textVolume'].map(n => byName(n)[0]).filter(Boolean).map(c => ({ c, text: untag(c.text).replace(/^\[|\]$/g, '').trim() })),
    lang: text('m_textSelectedLang'), screen: text('m_textSelectedScreen'),
    flags, screens, down: vol[0] || null, up: vol[1] || null, slider,
    ok: set.find(c => primary(c)) || null, cancel: leaveButton(set) || null,
    keep: [...flags, ...screens].map(f => f.c.id),
  };
}

// ---- the lobby's Duel menu (CWindowModelDuel, the dock's Duel): its counts (a name and a figure on one row: Auto
// Duel, Create Duel, Duel (n.)), its two ways in (picture switches with their captions; 自動で待つ = Auto Duel, the game
// finds you an opponent; 申し込みを待つ = Create Duel, you wait for a challenger), Cancel; the title strip's text
export function duelMenu(win) {
  const cs = win.controls.filter(c => c.shown && top(c));
  const sw = cs.filter(c => /PictureSwitch$/.test(c.cls) && c.w >= 64).sort((a, b) => a.x - b.x);
  const on = (t, c) => t.x >= c.x - 2 && t.x < c.x + c.w && t.y >= c.y && t.y < c.y + c.h;
  const texts = cs.filter(c => /ShadowText$/.test(c.cls) && c.text?.trim() && !sw.some(s => on(c, s)));
  const title = texts.find(t => t.y < 16);
  const rows = new Map();
  // a count says what it counts (by its row's name: 自動で相手を探す, 申し込みを待つ, デュエル中), else the game's label
  const SAYS = [[/自動/, 'Searching'], [/申し込み/, 'Waiting'], [/デュエル中/, 'Duelling']];
  for (const t of texts) if (t !== title) {
    const r = rows.get(t.y) || {};
    if (/^\d+$/.test(t.text.trim())) r.n = +t.text.trim(); else { r.label = SAYS.find(([re]) => re.test(t.name))?.[1] || untag(t.text).trim(); r.game = untag(t.text).trim(); }
    rows.set(t.y, r);
  }
  return {
    title: untag(title?.text || 'Duel').trim(),
    counts: [...rows.entries()].sort((a, b) => a[0] - b[0]).map(([, r]) => r).filter(r => r.label),
    ways: sw.map(c => ({ c, label: untag(cs.find(t => /ShadowText$/.test(t.cls) && on(t, c))?.text || '').trim(),
      kind: /自動/.test(c.name) ? 'auto' : /申し込み/.test(c.name) ? 'create' : '' })),
    cancel: leaveButton(cs.filter(c => /ButtonDuel$|TextSwitch$/.test(c.cls) && c.label)),
  };
}

// ---- Auto Duel's settings (CWindowModelDuelFind, the Duel menu's Auto Duel): two choices, as duelConfig reads them:
// the duel type (シングル Single, マッチ Match, どちらでも Both) and the level range (制限なし / レベルの近い: their
// captions are the game's own, "Level Limit ON" / "OFF"), OK (start looking) and Cancel. No help text
export function duelFind(win) {
  const cs = win.controls.filter(c => c.shown && top(c));
  const inside = (t, c) => t.x >= c.x - 2 && t.x < c.x + c.w && t.y >= c.y && t.y < c.y + c.h;
  const texts = cs.filter(c => c.cls === 'CWindowTaskShadowText' && c.text);
  const opt = c => ({ c, label: untag(texts.find(t => inside(t, c))?.text || '').trim() });
  const sw = cs.filter(c => /PictureSwitch$/.test(c.cls) && c.w >= 64).sort((a, b) => a.y - b.y || a.x - b.x);
  const buttons = cs.filter(c => /ButtonDuel$/.test(c.cls) && c.label);
  return {
    title: 'Auto Duel',
    sections: [['type', 'Duel type', /シングル|マッチ|どちらでも/], ['level', 'Level', /制限なし|レベルの近い/]]
      .map(([id, title, re]) => ({ id, title, options: sw.filter(c => re.test(c.name)).map(opt) })).filter(s => s.options.length),
    ok: buttons.find(primary), cancel: leaveButton(buttons), note: 'OK starts looking for an opponent',
  };
}

// ---- Create Duel's settings (CWindowModelDuelWait, the Duel menu's Create Duel): its rows of two switches, each a
// choice (by the switches' names: シングル / マッチ the duel type, 制限あり / なし the time limit, 観戦 spectators,
// サレンダー surrender; captions the game's own), its password field (InputDuel, 8 characters) with its caption, OK
// (open the duel) and Cancel
export function duelCreate(win) {
  const cs = win.controls.filter(c => c.shown && top(c));
  const inside = (t, c) => t.x >= c.x - 2 && t.x < c.x + c.w && t.y >= c.y && t.y < c.y + c.h;
  const texts = cs.filter(c => c.cls === 'CWindowTaskShadowText' && c.text);
  const sw = cs.filter(c => /PictureSwitch$/.test(c.cls) && c.w >= 64).sort((a, b) => a.y - b.y || a.x - b.x);
  const NAMES = [[/シングル|マッチ/, 'Duel type'], [/制限/, 'Time limit'], [/観戦/, 'Spectators'], [/サレンダー/, 'Surrender']];
  const rows = [];
  for (const c of sw) { const r = rows.find(r => Math.abs(r.y - c.y) < 8); r ? r.cs.push(c) : rows.push({ y: c.y, cs: [c] }); }
  const field = cs.find(c => /CWindowTaskInput/.test(c.cls));
  const buttons = cs.filter(c => /ButtonDuel$/.test(c.cls) && c.label);
  return {
    title: 'Create Duel',
    sections: rows.map(r => ({ id: r.cs[0].id, title: NAMES.find(([re]) => re.test(r.cs[0].name))?.[1] || '',
      options: r.cs.map(c => ({ c, label: untag(texts.find(t => inside(t, c))?.text || '').trim() })) })),
    field: field ? { c: field, label: untag(texts.filter(t => t.y < field.y && field.y - t.y <= 32).sort((a, b) => b.y - a.y)[0]?.text || '').trim() || 'Password' } : null,
    ok: buttons.find(primary), cancel: leaveButton(buttons), note: 'OK opens your duel for a challenger',
  };
}

// ---- a duel request (the Yes / No the game shows the duel's owner: "\nLv1 Duelist F\n[Beginner Duelist]\n\nYou have
// aDuel Request!\n Will you accept?"): the challenger's level, name and title; null for any other message. And the
// challenger's own wait ("Requesting Duel", with its Cancel)
export function duelRequest(text) {
  if (!/Duel\s*Request/i.test(text || '')) return null;
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
  const who = lines.map(l => /^Lv\s*(\d+)\s+(.+)$/.exec(l)).find(Boolean);
  return { level: who?.[1] || '', name: who?.[2] || '', title: lines.map(l => /^\[(.+)\]$/.exec(l)?.[1]).find(Boolean) || '' };
}
export const requesting = text => /^\s*Requesting\s+Duel\s*$/i.test(text || '');
