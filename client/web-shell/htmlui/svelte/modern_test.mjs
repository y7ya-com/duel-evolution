// Modern UI's state tests (node svelte/modern_test.mjs): what each modern window reads out of a snapshot (svelte/modern/
// logic.js), on small synthetic windows shaped as the bridge reads them (CONTRACT.md), and the switch (../modern.js)
// on a stub page. Exit 1 on the first failure.
import assert from 'node:assert/strict';
import * as L from './modern/logic.js';

let id = 1;
const ctl = (cls, o = {}) => ({ id: id++, cls: 'CWindowTask' + cls, name: 'noname', parent: 0, x: 0, y: 0, w: 0, h: 0, shown: true, enabled: true, ...o });
const win = (cls, controls, o = {}) => ({ id: id++, cls, x: 0, y: 0, w: 480, h: 272, shown: true, controls, extras: [], ...o });

// Select Player: four slots, the occupied one with its level and Delete on its row, the empty ones neither
{
  const row = (y, label) => ctl('TextSwitch', { name: 'プレイヤ選択ボタン', x: 16, y, w: 344, h: 32, label, state: 'normal' });
  const w = win('CWindowPlayerSelect', [
    row(152, 'Create Player'), row(72, 'Duelist B'), row(112, 'Create Player'), row(192, 'Create Player'),
    ctl('Text', { name: 'プレイヤ選択ボタンのLV表示文字', x: 288, y: 80, w: 128, h: 16, text: 'Lv01' }),
    ctl('Text', { name: 'プレイヤ選択ボタンのLV表示文字', x: 288, y: 120, w: 128, h: 16, text: '', shown: false }),
    ctl('TextSwitch', { name: '削除ボタン', x: 376, y: 72, w: 80, h: 32, label: 'Delete', state: 'normal' }),
    ctl('TextSwitch', { name: '削除ボタン', x: 376, y: 112, w: 80, h: 32, label: 'Delete', state: 'disabled', shown: false }),
    ctl('TextSwitch', { name: '選択スイッチ', x: 376, y: 240, w: 88, h: 24, label: 'Back', state: 'normal' }),
    ctl('TextField', { name: '説明の文字列', text: 'Select Player' }),
  ]);
  const s = L.slots(w);
  assert.deepEqual(s.map(x => [x.name, x.level, !!x.del, x.empty]), [['Duelist B', '01', true, false], ['Create Player', '', false, true],
    ['Create Player', '', false, true], ['Create Player', '', false, true]], 'slots top to bottom, level and Delete by row');
  assert.equal(L.backButton(w).label, 'Back');
  assert.equal(L.heading(w), 'Select Player');
}

// Main Menu: grouped by label, an unknown button under System, a hidden one gone; titles cased
{
  const b = (label, shown = true) => ctl('ButtonMain', { label, shown, state: 'normal', w: 258, h: 24 });
  const w = win('CMainMenu', [b('Return to Title'), b('Edit Deck'), b('DUEL OPTIONS'), b('Audio'), b('Team List', false), b('Lucky Draw'), b('Friend List')]);
  const g = Object.fromEntries(L.menuGroups(w).map(([n, bs]) => [n, bs.map(x => x.label)]));
  assert.deepEqual(g, { Play: ['Edit Deck', 'DUEL OPTIONS'], Social: ['Friend List'], System: ['Audio', 'Return to Title', 'Lucky Draw'] });
  assert.equal(L.nice('DUEL OPTIONS'), 'Duel Options');
  assert.equal(L.nice('D-Mail'), 'D-Mail');
  assert.equal(L.nice('Edit Deck'), 'Edit Deck');
}

// the place banner: the name and the count are two texts on a row
{
  const t = (x, y, text) => ctl('ShadowText', { x, y, w: 100, h: 16, text });
  const w = win('CWindowModelPlace', [t(150, 26, '(1/32)'), t(20, 9, 'Duelist Academy'), t(20, 26, 'Store[15]'), t(150, 9, '(1/1000)'),
    ctl('Text', { parent: 99, x: 21, y: 10, text: 'Duelist Academy' })]);
  assert.deepEqual(L.placeRows(w).map(({ name, here, cap }) => [name, here, cap]), [['Duelist Academy', '1', '1000'], ['Store[15]', '1', '32']]);
  assert.deepEqual(L.place('My Room'), { name: 'My Room', here: '', cap: '' });
}

// the chat: names, notices, colour tags gone; the shown tab's log; tabs in order
{
  assert.deepEqual(L.chatLine('@0Duelist B:hello lobby'), { name: 'Duelist B', text: 'hello lobby' });
  assert.deepEqual(L.chatLine("[System] Welcome to the Beginner's Lobby A."), { notice: true, text: "[System] Welcome to the Beginner's Lobby A." });
  assert.deepEqual(L.chatLine('a line with no name'), { text: 'a line with no name' });
  assert.deepEqual(L.chatLine('Kaiba Fan: sure, room 3: now'), { name: 'Kaiba Fan', text: 'sure, room 3: now' });
  // tabs left to right with their logs: the reader's pairs (the Duel Log is made last, laid out second), else by order
  const tabs = [ctl('Tab', { x: 207, label: 'TRADE' }), ctl('Tab', { x: 8, label: 'All Chat', active: true }), ctl('Tab', { x: 80, label: 'Duel Log' })];
  const logs = [ctl('Textlist', { items: ['@0A:hi'] }), ctl('Textlist', { items: ['t'], shown: false }), ctl('Textlist', { items: ['d'], shown: false })];
  const w = win('CChatWindow', [...tabs, ...logs, ctl('Input', { value: '', maxLen: 128 }), ctl('IconExpand', {}), ctl('IconHide', {})]);
  w.mode = 1;
  w.pairs = [[1, 0], [0, 1], [2, 2]].map(([t, l]) => ({ tab: tabs[t].id, log: logs[l].id, visible: true }));
  const p = L.chatParts(w);
  assert.deepEqual(p.tabs.map(t => [t.short, t.log.items[0], t.active, t.readOnly]), [['All', '@0A:hi', true, false], ['Duel Log', 'd', false, true], ['TRADE', 't', false, false]]);
  assert.ok(p.input && p.expand && p.shrink && p.typing);
  // the deck editor's chat, folded to its bar (its log parked, its line hidden): collapsed, no line drawn
  const parked = L.chatParts(win('CChatWindow', [ctl('Iconbar', { w: 776, h: 24 }), ctl('Textlist', { y: 99999, h: -16, items: [] }),
    ctl('Input', { shown: false, w: 776, h: 32 })], { y: 712, w: 776, h: 32 }));
  assert.ok(parked.mode === 2 && !parked.typing, 'a folded chat draws its bar only');
  assert.equal(p.mode, 1);
  delete w.mode; delete w.pairs; w.h = 32;
  assert.equal(L.chatParts(w).mode, 2, 'no reader: the height says collapsed');
  assert.deepEqual(L.chatParts(w).tabs.map(t => t.log.items[0]), ['@0A:hi', 't', 'd'], 'no reader: logs in tab order');
}

// the engine's heights cycle 1 -> 0 -> 2 -> 1 (short, tall, collapsed): the presses from one to another
{
  const step = { expand: { 1: 0, 2: 1 }, shrink: { 0: 2 } };
  for (const a of [0, 1, 2]) for (const b of [0, 1, 2]) {
    const ks = L.sizeSteps(a, b);
    assert.equal(ks.reduce((m, k) => step[k][m], a), b, `${a} -> ${b}`);
    assert.ok(ks.length <= 2);
  }
}

// the log as keyed rows: a new line adds a row, a dropped one removes one, a repeated line is still new; history has
// no time; grouping by sender; a sender's ink is stable
{
  const a = L.logRows(null, ['@0A:hi', 'A:again'], 1);
  assert.deepEqual([a.added, a.rows.map(r => r.t)], [0, [null, null]], 'the first read is history');
  const b = L.logRows(a, ['A:again', 'B:gg', 'B:gg'], 5);
  assert.equal(b.added, 2);
  assert.equal(b.rows[0], a.rows[1], 'a kept line keeps its row');
  assert.deepEqual(b.rows.map(r => [r.name, r.text, r.t]), [['A', 'again', null], ['B', 'gg', 5], ['B', 'gg', 5]]);
  assert.equal(new Set(b.rows.map(r => r.key)).size, 3);
  const c = L.logRows(b, ['A:again', 'B:gg', 'B:gg', 'B:gg'], 6);
  assert.equal(c.added, 1, 'the same line again is a new line');
  assert.equal(L.logRows(c, c.items.slice()).added, 0);
  assert.equal(L.logRows(c, []).added, 0, 'a log emptied (a new duel): nothing new');
  assert.deepEqual(L.grouped(c.rows).map(r => r.cont), [false, false, true, true]);
  assert.deepEqual(L.grouped(L.logRows(null, ['[System] hi', 'A:x', '[System] y', 'A:z']).rows).map(r => r.cont), [false, false, false, false]);
  assert.equal(L.senderInk('Duelist B'), L.senderInk('Duelist B'));
  assert.notEqual(L.senderInk('Duelist B'), L.senderInk('raMon'));
}

// lists: a row's game point, rows from the list's top
{
  const w = { x: 62, y: 282 }, list = { x: 8, y: 40, w: 680, h: 128, rows: 8, top: 2 };
  assert.deepEqual(L.rowPoint(w, list, 3), [62 + 8 + 40, 282 + 40 + 16 * 1 + 8]);
  assert.deepEqual(L.listItems({ items: ['@1Kain', 'raMon'] }), ['Kain', 'raMon']);
  const lw = L.listWindow(win('CWindowModelFriendlist', [ctl('ShadowText', { text: 'Friend List' }), ctl('Listbox', { items: [] }),
    ctl('ButtonDuel', { x: 625, label: 'Close' }), ctl('ButtonDuel', { x: 125, label: 'Remove from Friend List' })]));
  assert.equal(lw.title, 'Friend List');
  assert.deepEqual(lw.buttons.map(b => b.label), ['Remove from Friend List', 'Close']);
  assert.equal(L.leaveButton(lw.buttons).label, 'Close');
  assert.ok(L.primary({ label: 'OK' }) && L.primary({ label: 'Yes' }) && !L.primary({ label: 'Close' }));
}

// My Profile: each name with the value under it
{
  const n = (y, text) => ctl('Text', { name: 'プロフィールウィンドウの項目名', y, text, align: 0 });
  const v = (y, text) => ctl('Text', { name: 'プロフィールウィンドウの項目の数値', y, text, align: 2 });
  const p = L.profile(win('CWindowModelProfile', [v(48, 'Duelist B'), n(32, 'Name'), n(64, 'Title'), v(80, 'Beginner Duelist'),
    n(96, 'LV'), v(112, '1'), n(320, 'Miles'), v(336, '    5000'), ctl('ShadowText', { text: 'My Profile' }), ctl('ButtonDuel', { label: 'OK' })]));
  assert.equal(p.title, 'My Profile');
  assert.deepEqual(p.rows.map(r => [r.name, r.value]), [['Name', 'Duelist B'], ['Title', 'Beginner Duelist'], ['LV', '1'], ['Miles', '5000']]);
  assert.equal(p.ok.label, 'OK');
}

// a Yes / No dialog
{
  const d = L.dialog(win('CWindowModelDialogYesNo', [ctl('FrameThin'), ctl('TextField', { text: 'Do you want to leave My Room?' }),
    ctl('TextSwitch', { x: 264, label: 'No' }), ctl('TextSwitch', { x: 120, label: 'Yes' })]));
  assert.equal(d.text, 'Do you want to leave My Room?');
  assert.deepEqual(d.buttons.map(b => b.label), ['Yes', 'No']);
  assert.equal(L.leaveButton(d.buttons).label, 'No');
  assert.equal(d.input, null);
  const q = L.dialog(win('CWindowModelInput1', [ctl('FramePlane'), ctl('Text', { text: 'Enter your Player Name' }), ctl('Input', { maxLen: 16, value: '' }),
    ctl('TextSwitch', { x: 44, label: 'OK' }), ctl('TextSwitch', { x: 212, label: 'Cancel' })]));
  assert.equal(q.text, 'Enter your Player Name');
  assert.equal(q.input.maxLen, 16);
  assert.equal(L.leaveButton(q.buttons).label, 'Cancel');
}

// D-Mail: the inbox's rows from their own texts, the body; Write Mail's fields named by their labels
{
  const item = (y, ...t) => { const r = ctl('DMailItem', { name: '件名', x: 16, y }); return [r, ...t.map((s, i) => ctl('Text', { parent: r.id, x: 20 + 200 * i, y: 4, text: s }))]; };
  const inbox = L.mail(win('CWindowModelDMail', [ctl('ShadowText', { text: 'D-Mail' }), ...item(108, 'Second', 'Kain'), ...item(72, 'First', 'raMon'),
    ctl('DMailItem', { name: '件名', y: 144, shown: false }), ctl('Text', { name: 'メール本文', text: 'hi there' }),
    ctl('TextSwitch', { x: 16, y: 40, label: 'Write Mail' }), ctl('TextSwitch', { x: 206, y: 481, label: 'Close' })], { w: 512, h: 512 }));
  assert.equal(inbox.compose, false);
  assert.deepEqual(inbox.rows.map(r => r.text), [['First', 'raMon'], ['Second', 'Kain']]);
  assert.equal(inbox.body, 'hi there');
  assert.deepEqual(inbox.buttons.map(b => b.label), ['Write Mail', 'Close']);
  const multi = ctl('MultiInput', { x: 16, y: 120, w: 480, h: 240 });
  const send = L.mail(win('CWindowModelDMailSend', [ctl('Text', { x: 16, y: 48, w: 60, h: 16, text: 'To:' }), ctl('Input', { x: 80, y: 44, w: 300, h: 24, value: '' }),
    ctl('Text', { x: 16, y: 80, w: 60, h: 16, text: 'Subject' }), ctl('Input', { x: 80, y: 76, w: 400, h: 24 }),
    ctl('Text', { x: 16, y: 100, w: 60, h: 16, text: 'Message' }), multi, ctl('Input', { parent: multi.id, x: 0, y: 0, w: 480, h: 240, multiLine: true })], { w: 512, h: 512 }));
  assert.equal(send.compose, true);
  assert.deepEqual(send.fields.map(f => [f.label, f.area]), [['To', false], ['Subject', false], ['Message', true]]);
}

// character creation: switches by size with their labels; a text on no switch stays loose
{
  const sw = (x, y, w, h, o = {}) => ctl('PictureSwitch', { x, y, w, h, state: 'normal', ...o });
  const t = (x, y, text) => ctl('Text', { x, y, w: 200, h: 32, text });
  const a = L.avatarParts(win('CWindowDialogAvatarSwitch', [sw(340, 60, 324, 44, { checked: true }), t(360, 66, 'Hair'), sw(720, 80, 254, 34), t(730, 84, 'Spiky'),
    sw(340, 680, 162, 42), t(360, 688, 'Confirm'), sw(960, 300, 32, 64), t(20, 20, 'Choose your look')], { w: 336, h: 550 }));
  assert.deepEqual(a.switches.map(s => [s.kind, s.label]), [['category', 'Hair'], ['item', 'Spiky'], ['action', 'Confirm'], ['arrow', '']]);
  assert.deepEqual(a.loose.map(x => x.text), ['Choose your look']);
}

// the deck check
{
  const d = L.deckCheck({ main: 40, side: 0, extra: 3, missing: 0 });
  assert.ok(d.ok);
  assert.deepEqual(L.deckCheck({ main: 38, side: 16, extra: 0, missing: 2 }).parts.filter(p => !p.ok).map(p => p.key), ['main', 'side', 'missing']);
  assert.equal(L.deckCheck(null), null);
}

// toasts: an OK box with a message and only its OK
{
  const ok = L.toastable(win('CWindowModelDialogOk', [ctl('FrameThin'), ctl('TextField', { text: 'The deck was saved.' }), ctl('TextSwitch', { x: 200, label: 'OK' })]));
  assert.equal(ok.text, 'The deck was saved.');
  assert.equal(ok.ok.label, 'OK');
  assert.equal(L.toastable(win('CWindowModelDialogOk', [ctl('TextField', { text: 'Sure?' }), ctl('TextSwitch', { label: 'OK' }), ctl('TextSwitch', { label: 'Cancel' })])), null);
  assert.equal(L.toastable(win('CWindowModelDialogError', [ctl('TextField', { text: 'Failed.' }), ctl('TextSwitch', { label: 'OK' })])), null, 'errors stay dialogs');
  assert.equal(L.toastable(win('CWindowModelDialogOk', [ctl('TextField', { text: '' }), ctl('TextSwitch', { label: 'OK' })])), null);
}

// friends' presence by name
{
  const m = L.presence([{ pid: 1, name: 'Kain', online: true, place: 'Duelist Academy' }, { name: 'raMon', online: false }, null, { online: true }]);
  assert.deepEqual(m.get('kain'), { online: true, place: 'Duelist Academy' });
  assert.equal(m.get('ramon').online, false);
  assert.equal(m.size, 2);
  assert.equal(L.presence(null).size, 0);
}

// the generic window: the plate from the outer frame, the title strip, each family, the engine's pictures cut out
{
  const frame = ctl('FrameThin', { x: 0, y: 0, w: 400, h: 200 }), inner = ctl('FramePlane', { x: 10, y: 60, w: 200, h: 100 });
  const title = ctl('ShadowText', { x: 12, y: 8, w: 200, h: 16, text: '@0Duel Log' });
  const body = ctl('Text', { x: 12, y: 40, w: 300, h: 32, text: 'one\ntwo\nthree', firstLine: 1, pageLines: 1 });
  const ok = ctl('TextSwitch', { x: 300, y: 160, w: 80, h: 24, label: 'OK', state: 'hover' });
  const caption = ctl('Text', { x: 0, y: 0, w: 80, h: 24, text: 'OK', parent: ok.id });
  const input = ctl('Input', { x: 12, y: 100, w: 120, h: 22, value: 'abc' }), inText = ctl('Text', { text: 'abc', parent: input.id });
  const list = ctl('Listbox', { x: 220, y: 60, w: 160, h: 72, items: ['a', '@1b', 'c', 'd', 'e'], top: 1, rows: 3, selected: 2 });
  const bar = ctl('Scroll', { x: 150, y: 0, w: 10, h: 72, parent: list.id, value: 1, max: 2, page: 3 });
  const pic = ctl('Image', { x: 20, y: 70, w: 64, h: 64 }), picText = ctl('Text', { text: 'in the picture', parent: pic.id });
  const flag = ctl('PictureSwitch', { x: 90, y: 70, w: 48, h: 32, label: '' }), okPic = ctl('PictureSwitch', { x: 200, y: 160, w: 90, h: 24, label: 'Cancel' });
  const slider = ctl('Slider', { x: 40, y: 170, w: 0, h: 0, parts: { sprites: [{ shown: true, src: [0, 0, 200, 8], wx: 140, wy: 222 }, { shown: true, src: [0, 0, 12, 20], wx: 200, wy: 216 }] } });
  const hidden = ctl('Text', { x: 0, y: 0, w: 10, h: 10, text: 'gone', shown: false });
  const w = win('CWindowModelDuellogTop', [frame, inner, title, body, ok, caption, input, inText, list, bar, pic, picText, flag, okPic, slider, hidden],
    { x: 100, y: 50, extras: [{ id: id++, cls: 'CSpriteElm', shown: true, src: [0, 0, 32, 16], sx: 2, sy: 1, wx: 150, wy: 60 }] });
  const g = L.generic(w);
  assert.deepEqual(g.plate, { x: 0, y: 0, w: 400, h: 200 });
  assert.equal(g.band.title, 'Duel Log', 'the heading ShadowText is the title strip');
  assert.deepEqual(g.items.map(i => i.kind), ['well', 'text', 'button', 'input', 'list', 'scroll', 'button', 'slider'], 'one item a control; parts and pictures not apart');
  const sl = g.items.at(-1);
  assert.deepEqual([sl.c.x, sl.c.y, sl.c.w, sl.c.h], [40, 166, 200, 20], 'a slider over its sprites');
  assert.ok(Math.abs(sl.knob.frac - .33) < .01, 'its knob where the engine put it');
  assert.equal(g.items.find(i => i.kind === 'text').text, 'two', 'the shown lines only');
  assert.equal(g.items.find(i => i.kind === 'button').gold, true, 'OK is the primary');
  assert.equal(g.items.at(-2).label, 'Cancel', 'a picture switch with a caption is a button');
  assert.deepEqual(g.items.find(i => i.kind === 'list').rows.map(r => [r.text, r.selected]), [['b', false], ['c', true], ['d', false]]);
  assert.deepEqual([g.items.find(i => i.kind === 'scroll').c.x, g.items.find(i => i.kind === 'scroll').c.y], [370, 60], 'a list\'s bar at the list\'s place');
  assert.deepEqual(g.holes, [{ x: 20, y: 70, w: 64, h: 64 }, { x: 90, y: 70, w: 48, h: 32 }, { x: 50, y: 10, w: 64, h: 16 }],
    'the picture, the captionless switch, the sprite extra: window-local');
  assert.deepEqual(g.backdrop, []);
  assert.equal(g.keep.length, 3, 'the engine keeps the picture, the flag and the extra (the slider is drawn here)');
  // a window whose look is one picture (Options: option_dai): the plate stands in for it, its texts' field a well
  const field = ctl('TextField', { x: 8, y: 8, w: 344, h: 356, text: '' }), plane = ctl('BackPlane', { x: 0, y: 0, w: 344, h: 356, parent: field.id });
  const bd = { id: id++, cls: 'CSpriteElm', shown: true, src: [0, 0, 360, 372], wx: 332, wy: 198 };
  const o = L.generic(win('COptionDlg', [plane, field, ctl('Text', { x: 8, y: 16, w: 344, h: 16, text: '[Language]' })], { x: 332, y: 198, w: 360, h: 372, extras: [bd] }));
  assert.deepEqual(o.plate, { x: 0, y: 0, w: 360, h: 372 });
  assert.deepEqual(o.backdrop, [bd.id]);
  assert.deepEqual(o.items.map(i => i.kind), ['well', 'text']);
  assert.deepEqual(o.holes, []);
  // the Duel Log: its frame a class of its own, tabs that are pictures with their captions laid over them
  const dl = L.generic(win('CWindowModelDuellogTop', [ctl('DuellogFrame', { x: 0, y: 0, w: 492, h: 452 }),
    ctl('PictureSwitch', { x: 22, y: 53, w: 224, h: 32, label: '' }), ctl('ShadowText', { x: -28, y: 61, w: 324, h: 32, text: 'Latest Duel Logs' }),
    ctl('PictureSwitch', { x: 234, y: 160, w: 24, h: 16, label: '' }),
    { id: id++, cls: 'CWindowResultScroll', parent: 0, x: 455, y: 170, w: 16, h: 230, shown: true, value: 0, max: 4, page: 8 }], { w: 492, h: 452 }));
  assert.deepEqual(dl.plate, { x: 0, y: 0, w: 492, h: 452 }, 'a class named ...Frame is a frame');
  assert.deepEqual(dl.items.map(i => [i.kind, i.label]), [['button', 'Latest Duel Logs'], ['scroll', undefined]], 'the caption on its picture switch, once');
  assert.equal(dl.keep.length, 1, 'the engine keeps only the small arrow picture');
  // Duel Options: its frame reads 80 x 24 (the plate is the window), labels in 256 x 256 default boxes (no wells)
  const dc = L.generic(win('CWindowModelDuelConfig', [ctl('DuelConfigFrame', { x: 0, y: 0, w: 80, h: 24 }),
    ctl('ShadowText', { x: 0, y: 4, w: 492, h: 16, text: 'DUEL OPTIONS' }), ctl('ShadowText', { x: 38, y: 37, w: 256, h: 256, text: 'Auto Tracking' })], { w: 492, h: 452 }));
  assert.deepEqual(dc.plate, { x: 0, y: 0, w: 492, h: 452 });
  assert.equal(dc.band.title, 'DUEL OPTIONS');
  assert.deepEqual(dc.items.map(i => i.kind), ['text']);
  // a label in a default box above a picture switch is not its caption (only a text whose first line is on it)
  const dc2 = L.generic(win('CWindowModelDuelConfig', [ctl('ShadowText', { x: 38, y: 141, w: 256, h: 256, text: 'Auto Tracking' }),
    ctl('PictureSwitch', { x: 22, y: 157, w: 224, h: 32, label: '' }), ctl('ShadowText', { x: 22, y: 165, w: 224, h: 16, align: 1, text: 'Auto Cancel' })], { w: 492, h: 452 }));
  assert.deepEqual(dc2.items.map(i => [i.kind, i.label ?? i.text]), [['text', 'Auto Tracking'], ['button', 'Auto Cancel']]);
  // its keys: Esc the way out, Enter the primary
  const k = L.genericKeys(L.generic(win('CWindowModelDuelConfig', [ctl('ButtonDuel', { x: 299, y: 420, w: 140, h: 24, label: 'Cancel' }),
    ctl('ButtonDuel', { x: 53, y: 420, w: 140, h: 24, label: 'OK' })], { w: 492, h: 452 })));
  assert.deepEqual([k.leave.label, k.primary.label], ['Cancel', 'OK']);
  assert.deepEqual(L.genericKeys(L.generic(win('CWindowModelHelp', []))), { leave: null, primary: null });
  // a well and its text share a control: the screen keys items by kind and id
  const keys = o.items.map(i => i.kind + i.c.id);
  assert.equal(new Set(keys).size, keys.length);
  assert.equal(L.generic(win('CWindowModelProgress', [ctl('Text', { x: 0, y: 0, w: 50, h: 16, text: 'Loading' })])).plate, null, 'no frame, no plate');
  assert.equal(L.thumb({ max: 0 }), null, 'nothing to scroll: no thumb');
  assert.ok(!L.GENERIC.includes('CWindowLogin'), 'the 2008 ID / password form is never drawn');
  assert.equal(new Set(L.GENERIC).size, L.GENERIC.length);
}

// Duel Options: headings (256 x 256 rects) own the switches under them; captions by the switch they sit on; the help
// is '説明' (not a heading); the checked switch is the setting
{
  const head = (y, text) => ctl('ShadowText', { name: '『オートフォーカス』', x: 38, y, w: 256, h: 256, text });
  const sw = (x, y, checked) => ctl('PictureSwitch', { x, y, w: 224, h: 32, checked, state: 'normal' });
  const cap = (x, y, text) => ctl('ShadowText', { x, y: y + 8, w: 224, h: 16, text });
  const w = win('CWindowModelDuelConfig', [
    ctl('ShadowText', { x: 0, y: 4, w: 492, h: 16, text: 'DUEL OPTIONS' }),
    head(141, 'Activation Message'), head(37, 'Auto Tracking'),
    sw(22, 53, true), sw(246, 53, false), cap(22, 53, 'ON'), cap(246, 53, 'OFF'),
    sw(22, 157, false), sw(246, 157, true), sw(134, 198, false), cap(22, 157, 'Auto Cancel'), cap(246, 157, 'Semi Auto Cancel'), cap(134, 198, 'Manual'),
    ctl('PictureSwitch', { x: 234, y: 248, w: 24, h: 16, shown: true }),   // the help's arrow: not an option
    ctl('ShadowText', { name: '『説明』', x: 38, y: 236, w: 224, h: 16, text: '' }),
    ctl('ShadowText', { name: '説明', x: 30, y: 264, w: 424, h: 128, text: 'Hold the Right Mouse button.' }),
    ctl('ButtonDuel', { x: 299, y: 420, w: 140, h: 24, label: 'Cancel', state: 'normal' }),
    ctl('ButtonDuel', { x: 53, y: 420, w: 140, h: 24, label: 'OK', state: 'normal' }),
  ], { w: 492, h: 452 });
  const d = L.duelConfig(w);
  assert.equal(d.title, 'DUEL OPTIONS');
  assert.deepEqual(d.sections.map(s => [s.title, s.options.map(o => o.label + (o.c.checked ? '*' : ''))]),
    [['Auto Tracking', ['ON*', 'OFF']], ['Activation Message', ['Auto Cancel', 'Semi Auto Cancel*', 'Manual']]]);
  assert.equal(d.help, 'Hold the Right Mouse button.');
  assert.deepEqual([d.ok.label, d.cancel.label], ['OK', 'Cancel']);
}

// the Move window: places top to bottom with their counts (the game pads the count: "(   0/1000)"), the x, the bar
{
  const b = (y, label, shown = true) => ctl('ButtonDuel', { x: 11, y, w: 258, h: 24, label, shown, state: 'normal' });
  const w = win('CWindowModelMove', [ctl('FrameMove'), ctl('IconHide', { x: 272, w: 16, h: 24 }), b(50, 'Pier ( 12/32)'), b(24, 'Duelist Academy (   0/1000)'),
    b(76, 'Gone (1/2)', false), ctl('ResultScroll', { x: 14, y: 22, w: 16, h: 158, shown: false })], { w: 296, h: 188 });
  const m = L.moveWindow(w);
  assert.deepEqual(m.places.map(p => [p.name, p.here, p.cap]), [['Duelist Academy', '0', '1000'], ['Pier', '12', '32']]);
  assert.ok(m.close && !m.bar);
  assert.deepEqual(L.place('Duel Academy [15]  0/32'), { name: 'Duel Academy [15]', here: '0', cap: '32' });
}

// an unlock announcement: its shown lines top to bottom (the empty kind line dropped), its OK picture and caption
{
  const w = win('CWindowModelItemGet', [
    ctl('ShadowText', { x: 288, y: 528, w: 448, h: 16, text: ' Now, you can challenge Yami Marik to a Duel!' }),
    ctl('ShadowText', { x: 288, y: 512, w: 448, h: 16, text: '' }),
    ctl('ShadowText', { x: 288, y: 544, w: 448, h: 16, text: 'Go to "STRUCTURE DECK" in Edit Deck.', shown: false }),
    ctl('PictureSwitch', { x: 431, y: 650, w: 162, h: 42, state: 'normal' }),
    ctl('Text', { x: 431, y: 658, w: 162, h: 42, text: 'OK' }),
  ], { w: 736, h: 700 });
  const g = L.itemGet(w);
  assert.deepEqual(g.lines.map(l => l.text), ['Now, you can challenge Yami Marik to a Duel!']);
  assert.equal(g.okLabel, 'OK');
  assert.equal(g.ok.w, 162);
}

// a duelist's card: the name, label / value pairs, the record as figures, the about text; a speech bubble; the pick list
{
  const help = (name, y, text, h = 16) => { const hc = ctl('Help', { name, x: 8, y }); return [hc, ctl('Text', { parent: hc.id, w: 320, h, text })]; };
  const w = win('CNpcListMenu', [
    ...help('CPlayerListMenuの『勝率：』テキスト', 44, 'Win%'), ...help('CPlayerListMenuの勝率テキスト', 60, 'Wins3/Losses1'),
    ...help('CPlayerListMenuのレベル＆名前表示', 8, 'Kain', 36), ...help('CNpcListMenuの『デッキ名:』テキスト', 76, 'Deck Name'),
    ...help('CNpcListMenuのデッキ名テキスト', 92, '?????'), ...help('CPlayerListMenuの対戦相手テキスト', 108, ' A duelist.\n\n He wins.', 144),
    ctl('FrameThin', { w: 336, h: 260 }),
  ]);
  const d = L.duelistCard(w);
  assert.equal(d.name, 'Kain');
  assert.deepEqual(d.record, { wins: 3, losses: 1 });
  assert.deepEqual(d.rows.map(r => [r.label, r.value]), [['Win%', 'Wins3/Losses1'], ['Deck Name', '?????']]);
  assert.equal(d.about, 'A duelist.\n\nHe wins.');
  const b = L.balloon(win('CWindowModelBalloon', [ctl('BalloonFrame', { w: 454, h: 144 }), ctl('Text', { name: 'ふきだしウィンドウの名前', text: 'Kain' }),
    ctl('Text', { name: 'ふきだしウィンドウの本文', h: 80, text: '・\nWise choice・very wise.\n\n' })]));
  assert.deepEqual([b.name, b.text, !!b.frame], ['Kain', '…\nWise choice…very wise.', true]);
  const l = ctl('ActiveListbox', { x: 8, y: 24, w: 232, h: 96, items: ['@0Alexis Rhodes', '@0Kain'], selected: 0, rows: 6 });
  const p = L.pickList(win('CWindowModelList', [ctl('Iconbar', { w: 248, h: 24 }), l, ctl('IconHide', { x: 229 })]));
  assert.deepEqual([p.title, p.names, !!p.close, p.bar], ['', ['Alexis Rhodes', 'Kain'], true, undefined]);
}

// the search menu: what to show, then how to order, each with its index in the game's list
{
  const items = ['Search for Single Duels', 'Search for Match Duels', 'Display by Level', 'Display by name', 'Search for Friends', 'Proximity Search', 'Show all'];
  const f = L.findMenu(win('CFindMenu', [ctl('FrameThin', { w: 256, h: 128 }), ctl('ActiveListbox', { x: 8, y: 8, w: 240, h: 112, items, selected: -1 })]));
  assert.deepEqual(f.groups.map(([n, es]) => [n, es.map(e => e.i)]), [['Show', [0, 1, 4, 5, 6]], ['Order', [2, 3]]]);
}

// the duel disk case: arrows by side (the grid between them), the hovered disk's name and text, Close
{
  const w = win('CDuelDiskList', [ctl('PictureSwitch', { x: 472, y: 8, w: 32, h: 144 }), ctl('PictureSwitch', { x: 8, y: 8, w: 32, h: 144 }),
    ctl('Text', { x: 9, y: 173, w: 479, h: 47, text: '@9 [Duel Academy Model]  The Official Duel Disk.\nCan switch modes.' }),
    ctl('TextSwitch', { x: 156, y: 224, w: 200, h: 24, label: 'Close' })], { w: 512, h: 256 });
  const d = L.diskCase(w);
  assert.deepEqual([d.prev.x, d.next.x, d.grid], [8, 472, { x: 8, y: 8, w: 496, h: 144 }]);
  assert.deepEqual([d.name, d.text, d.close.label], ['Duel Academy Model', 'The Official Duel Disk. Can switch modes.', 'Close']);
}

// the title's Options: flags in the art's order (the checked one English), the screens left to right, the - / +, OK / Cancel
{
  const n = (name, o) => ctl(o.cls || 'PictureSwitch', { name: 'COptionDlg::' + name, ...o });
  const flag = (x, y, checked = false) => n('m_flags[i]', { x, y, w: 48, h: 32, checked });
  const w = win('COptionDlg', [
    n('m_textLang', { cls: 'Text', x: 8, y: 16, text: '[Language]' }), n('m_textSelectedLang', { cls: 'Text', x: 8, y: 32, text: 'English' }),
    flag(232, 92), flag(152, 92), flag(72, 92), flag(272, 52), flag(192, 52), flag(112, 52, true), flag(32, 52),
    n('m_screenBtn[i]', { x: 213, y: 175, w: 80, h: 68, checked: true }), n('m_screenBtn[i]', { x: 67, y: 175, w: 80, h: 68 }),
    n('m_volumeBtn[i]', { x: 316, y: 298, w: 24, h: 24 }), n('m_volumeBtn[i]', { x: 20, y: 298, w: 24, h: 24 }),
    n('m_setBtn[i]', { x: 187, y: 339, w: 158, h: 24, label: 'Cancel' }), n('m_setBtn[i]', { x: 15, y: 339, w: 158, h: 24, label: 'OK' }),
  ], { w: 360, h: 372 });
  const o = L.options(w);
  assert.deepEqual(o.flags.map(f => f.name + (f.c.checked ? '*' : '')), ['日本語', 'English*', 'Deutsch', 'Français', 'Italiano', 'Español', '한국어']);
  assert.deepEqual(o.screens.map(f => f.name + (f.c.checked ? '*' : '')), ['Full screen', 'Window*']);
  assert.deepEqual([o.down.x, o.up.x, o.ok.label, o.cancel.label, o.lang, o.heads[0].text], [20, 316, 'OK', 'Cancel', 'English', 'Language']);
  assert.equal(o.keep.length, 9);
}

// the Duel menu: its counts by what they count, its two ways in by kind, Cancel
{
  const st = (name, x, y, text) => ctl('ShadowText', { name, x, y, w: 224, h: 32, text });
  const w = win('CWindowModelDuel', [st('『デュエルメニュー』', 0, 4, 'Duel Menu'),
    st('『自動で相手を探す』', 80, 36, 'Auto Duel'), st('『自動で相手を探す』', 0, 36, '2'), st('『申し込みを待つ』', 80, 60, 'Create Duel'), st('『申し込みを待つ』', 0, 60, '0'),
    st('『デュエル中』', 80, 84, 'Duel (n.)'), st('『デュエル中』', 0, 84, '5'),
    ctl('PictureSwitch', { name: '申し込みを待つボタン', x: 246, y: 128, w: 224, h: 32 }), ctl('PictureSwitch', { name: '自動で待つボタン', x: 22, y: 128, w: 224, h: 32 }),
    st('noname', 246, 136, 'Create Duel'), st('『自動で相手を探す』', 22, 136, 'Auto Duel'), ctl('ButtonDuel', { x: 176, y: 184, w: 140, h: 24, label: 'Cancel' })], { w: 492, h: 216 });
  const d = L.duelMenu(w);
  assert.equal(d.title, 'Duel Menu');
  assert.deepEqual(d.counts.map(r => [r.label, r.n]), [['Searching', 2], ['Waiting', 0], ['Duelling', 5]]);
  assert.deepEqual(d.ways.map(x => [x.kind, x.label]), [['auto', 'Auto Duel'], ['create', 'Create Duel']]);
  assert.equal(d.cancel.label, 'Cancel');
}

// Auto Duel's settings: the duel type and the level range, each with the game's checked switch; OK and Cancel
{
  const sw = (name, x, y, checked = false) => ctl('PictureSwitch', { name, x, y, w: 224, h: 32, checked });
  const cap = (x, y, text) => ctl('ShadowText', { x, y: y + 8, w: 224, h: 32, text });
  const w = win('CWindowModelDuelFind', [sw('レベルの近いボタン', 246, 138), sw('制限なしボタン', 22, 138, true), sw('どちらでもボタン', 134, 76),
    sw('マッチボタン', 246, 36), sw('シングルボタン', 22, 36, true), cap(246, 138, 'Level Limit OFF'), cap(22, 138, 'Level Limit ON'), cap(134, 76, 'Both'),
    cap(246, 36, 'Match Mode'), cap(22, 36, 'Single Mode'), ctl('ButtonDuel', { x: 299, y: 184, w: 140, h: 24, label: 'Cancel' }),
    ctl('ButtonDuel', { x: 50, y: 184, w: 140, h: 24, label: 'OK' })], { w: 492, h: 216 });
  const d = L.duelFind(w);
  assert.deepEqual(d.sections.map(s => [s.title, s.options.map(o => o.label + (o.c.checked ? '*' : ''))]),
    [['Duel type', ['Single Mode*', 'Match Mode', 'Both']], ['Level', ['Level Limit ON*', 'Level Limit OFF']]]);
  assert.deepEqual([d.ok.label, d.cancel.label, d.help], ['OK', 'Cancel', undefined]);
}

// an in-duel prompt that waits for a click: the discard (its text nested under a Help control), a target; a duel
// dialog with its own buttons stays the generic window
{
  const help = ctl('Help', { x: 8, y: 8, w: 0, h: 0 });
  const dd = win('CUDiscardDialog', [ctl('FrameThin', { x: 0, y: 0, w: 314, h: 112 }), help, ctl('Text', { parent: help.id, x: 0, y: 0, w: 298, h: 96, text: 'Discard from your @2hand@0.' })], { x: 355, y: 328, w: 314, h: 112 });
  const p = L.duelPrompt(dd);
  assert.deepEqual([p.kind, p.line, p.zone], ['discard', 'Discard from your hand.', L.DUEL_ZONES.hand]);
  assert.equal(L.duelPrompt(win('CULockOnDialog', [ctl('Text', { text: 'Select a target.' })])).kind, 'target');
  assert.equal(L.duelPrompt(win('CUYesNoDialog', [ctl('Text', { text: 'Activate?' }), ctl('TextSwitch', { label: 'Yes' })])), null, 'its own buttons: a dialog');
  assert.equal(L.duelPrompt(win('CWindowModelHelp', [ctl('Text', { text: 'x' })])), null, 'not a duel window');
}

// a duel request and its wait
{
  assert.deepEqual(L.duelRequest('\nLv1 Duelist F\n[Beginner Duelist]\n\nYou have aDuel Request!\n Will you accept?'), { level: '1', name: 'Duelist F', title: 'Beginner Duelist' });
  assert.equal(L.duelRequest('Start Duel?'), null);
  assert.ok(L.requesting('Requesting Duel') && !L.requesting('Cancel the Duel you created?'));
}

// Create Duel's settings: a choice per row of switches, the password field with its caption
{
  const sw = (name, x, y, checked = false) => ctl('PictureSwitch', { name, x, y, w: 224, h: 32, checked });
  const cap = (x, y, text) => ctl('ShadowText', { x, y: y + 8, w: 224, h: 32, text });
  const w = win('CWindowModelDuelWait', [sw('サレンダーなしボタン', 246, 192), sw('サレンダーありボタン', 22, 192, true), sw('制限なしボタン', 246, 96), sw('制限ありボタン', 22, 96, true),
    sw('マッチボタン', 246, 48), sw('シングルボタン', 22, 48, true), cap(246, 192, 'Surrender OFF'), cap(22, 192, 'Surrender ON'), cap(246, 96, 'Time Limit OFF'),
    cap(22, 96, 'Time Limit ON'), cap(246, 48, 'Match Mode'), cap(22, 48, 'Single Mode'), ctl('InputDuel', { x: 22, y: 269, w: 448, h: 32, maxLen: 8, value: '' }),
    ctl('ShadowText', { x: 38, y: 248, w: 256, h: 256, text: 'Password' }), ctl('ButtonDuel', { x: 299, y: 328, w: 140, h: 24, label: 'Cancel' }),
    ctl('ButtonDuel', { x: 50, y: 328, w: 140, h: 24, label: 'OK' })], { w: 492, h: 360 });
  const d = L.duelCreate(w);
  assert.deepEqual(d.sections.map(s => [s.title, s.options.map(o => o.label + (o.c.checked ? '*' : ''))]),
    [['Duel type', ['Single Mode*', 'Match Mode']], ['Time limit', ['Time Limit ON*', 'Time Limit OFF']], ['Surrender', ['Surrender ON*', 'Surrender OFF']]]);
  assert.deepEqual([d.field.label, d.field.c.maxLen, d.ok.label, d.cancel.label], ['Password', 8, 'OK', 'Cancel']);
}

// the player list's tab tag reads as a space; a player's open duel on their card as its settings
{
  assert.deepEqual(L.listItems({ items: ['@0Lv 1@>40/Duelist C'] }), ['Lv 1 Duelist C']);
  const help = (name, y, text, h = 16) => { const hc = ctl('Help', { name, x: 8, y }); return [hc, ctl('Text', { parent: hc.id, w: 320, h, text })]; };
  const d = L.duelistCard(win('CPlayerListMenu', [...help('CPlayerListMenuのレベル＆名前表示', 8, 'LV01 Duelist E', 36),
    ...help('CPlayerListMenuの対戦相手テキスト', 108, 'Single Mode\nSurrender ON\nTime Limit ON\nWatch On\nLevel Limit ON', 144),
    ctl('TextSwitch', { x: 8, y: 220, w: 120, h: 24, label: 'Chat Message' }), ctl('TextSwitch', { x: 8, y: 196, w: 120, h: 24, label: 'Send Duel Request' })]));
  assert.deepEqual([d.about, d.duel], ['', ['Single Mode', 'Surrender ON', 'Time Limit ON', 'Watch On', 'Level Limit ON']]);
}

// the switch (../modern.js) on a stub page: default off ("Legacy UI" checked), ?LEGACY_UI= / ?MODERN_UI= win, remembered, killed by htmlui.json
{
  const store = new Map();
  let box;   // the title's switch input
  const el = () => ({ style: {}, classList: { toggle() {} }, append() {}, addEventListener() {}, querySelector: s => s === 'input' ? (box ||= el()) : el(), set innerHTML(v) {}, hidden: true, checked: false });
  Object.assign(globalThis, {
    localStorage: { getItem: k => store.get(k) ?? null, setItem: (k, v) => store.set(k, String(v)) },
    document: { createElement: el, head: { append() {} }, body: { append() {} } },
    location: { search: '' },
  });
  const { modernUi } = await import('../modern.js');
  console.warn = () => {};   // turning it on loads gen/modern.js, which needs a page
  const q = s => new URLSearchParams(s), canvas = {};
  let mu = modernUi({ canvas, query: q('') });
  assert.equal(mu.on(), false, 'legacy is the default');
  assert.equal(box.checked, true, 'the switch reads "Legacy UI": on by default');
  const titleSnap = { title: [{ id: 11, name: 'btn_start' }, { id: 12, name: 'btn_option' }] };
  assert.deepEqual(mu.hide(titleSnap, false), [], 'legacy draws its own title buttons');
  assert.equal(mu.set(true), true);
  assert.deepEqual(mu.hide(titleSnap, false), [11, 12], 'modern hides the title movie\'s buttons');
  assert.equal(box.checked, false, 'Legacy UI off while modern');
  assert.deepEqual(mu.hide(titleSnap, true), [], 'not through a scene load');
  assert.equal(store.get('yo2.modernUI'), '1', 'remembered');
  assert.equal(modernUi({ canvas, query: q('') }).on(), true, 'remembered across loads');
  assert.equal(modernUi({ canvas, query: q('MODERN_UI=0') }).on(), false, '?MODERN_UI=0 wins for the page');
  store.set('yo2.modernUI', '0');
  assert.equal(modernUi({ canvas, query: q('MODERN_UI=1') }).on(), true, '?MODERN_UI=1 wins for the page');
  assert.equal(modernUi({ canvas, query: q('LEGACY_UI=0') }).on(), true, '?LEGACY_UI=0: modern for the page');
  store.set('yo2.modernUI', '1');
  assert.equal(modernUi({ canvas, query: q('LEGACY_UI=1&MODERN_UI=1') }).on(), false, '?LEGACY_UI=1: the original UI, over the rest');
  store.set('yo2.modernUI', '0');
  mu = modernUi({ canvas, query: q('MODERN_UI=1'), defaults: { modern: false } });
  assert.equal(mu.on(), false, 'htmlui.json "modern": false kills it');
  assert.equal(mu.set(true), false);
  assert.equal(mu.active(), false, 'no screens while killed');
  let seen = null;
  mu = modernUi({ canvas, query: q('') });
  mu.onChange(v => { seen = v; });
  mu.set(true);
  assert.equal(seen, true, 'listeners hear the switch');
}
// A dock quick action (macro.js menu): the Main Menu stays out of sight (html.mu-macro) until the game says it closed,
// however many browser frames that takes (at 120 Hz, or a slow frame, two browser frames were not enough: the menu
// flashed at the bottom left). The game here closes it 6 frames after its button is pressed.
{
  const { menu } = await import('./modern/macro.js');
  const cl = new Set();
  let shown = false, closeAt = -1, f = 0;
  const sw = { id: 1, cls: 'CWindowTaskPictureSwitch', shown: true, name: 'MENUBAR_MENU' };
  const btn = { id: 2, cls: 'CWindowTaskButtonMain', shown: true, label: 'Friend List' };
  const snapshot = () => ({ windows: [{ cls: 'CWindowModelMenu', shown: true, controls: [sw] }, { cls: 'CMainMenu', shown, controls: [btn] }] });
  const leaks = [];
  globalThis.yo2Html = { snapshot };
  globalThis.document = { documentElement: { classList: { add: c => cl.add(c), remove: c => cl.delete(c) } } };
  globalThis.requestAnimationFrame = r => setTimeout(() => {
    f++;
    if (closeAt >= 0 && f >= closeAt) shown = false;
    if (shown && !cl.has('mu-macro')) leaks.push(f);
    r();
  }, 0);
  const api = { click: async id => { if (id === 1) shown = true; if (id === 2) closeAt = f + 6; } };
  assert.equal(await menu(api, 'Friend List'), true);
  for (let i = 0; i < 10; i++) await new Promise(r => requestAnimationFrame(r));
  assert.deepEqual(leaks, [], 'the Main Menu never shows during a quick action');
  assert.equal(cl.has('mu-macro'), false, 'shown again once the game closed it');
  delete globalThis.yo2Html;
}
console.log('modern_test: ok');
