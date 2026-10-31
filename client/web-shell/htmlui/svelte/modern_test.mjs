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
  const w = win('CChatWindow', [
    ctl('Tab', { x: 207, label: 'TRADE' }), ctl('Tab', { x: 8, label: 'All Chat', active: true }),
    ctl('Textlist', { items: ['old'], shown: false }), ctl('Textlist', { items: ['@0A:hi'] }),
    ctl('Input', { value: '', maxLen: 128 }), ctl('IconExpand', {}), ctl('IconHide', { enabled: false }),
  ]);
  const p = L.chatParts(w);
  assert.deepEqual(p.tabs.map(t => t.label), ['All Chat', 'TRADE']);
  assert.deepEqual(p.log.items, ['@0A:hi'], 'the shown log, not the first');
  assert.ok(p.input && p.taller && p.shorter);
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

// the chat's new lines; the deck check
{
  assert.equal(L.newLines(undefined, ['a', 'b']), 2);
  assert.equal(L.newLines(['a', 'b'], ['a', 'b', 'c']), 1);
  assert.equal(L.newLines(['a', 'b', 'c'], ['b', 'c', 'd', 'e']), 2, 'a log that dropped its oldest line');
  assert.equal(L.newLines(['a'], ['a']), 0);
  const d = L.deckCheck({ main: 40, side: 0, extra: 3, missing: 0 });
  assert.ok(d.ok);
  assert.deepEqual(L.deckCheck({ main: 38, side: 16, extra: 0, missing: 2 }).parts.filter(p => !p.ok).map(p => p.key), ['main', 'side', 'missing']);
  assert.equal(L.deckCheck(null), null);
}

// the switch (../modern.js) on a stub page: default off, ?MODERN_UI= wins, remembered, killed by htmlui.json
{
  const store = new Map();
  const el = () => ({ style: {}, classList: { toggle() {} }, append() {}, addEventListener() {}, querySelector: () => el(), set innerHTML(v) {}, hidden: true, checked: false });
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
  assert.equal(mu.set(true), true);
  assert.equal(store.get('yo2.modernUI'), '1', 'remembered');
  assert.equal(modernUi({ canvas, query: q('') }).on(), true, 'remembered across loads');
  assert.equal(modernUi({ canvas, query: q('MODERN_UI=0') }).on(), false, '?MODERN_UI=0 wins for the page');
  store.set('yo2.modernUI', '0');
  assert.equal(modernUi({ canvas, query: q('MODERN_UI=1') }).on(), true, '?MODERN_UI=1 wins for the page');
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
console.log('modern_test: ok');
