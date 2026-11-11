// node client/web-shell/htmlui/screens/chat_test.mjs: a list's update as a delta; the chat's tabs (chatTabs)
import assert from 'node:assert/strict';
import { DUELS_TEXT, discordLine, itemsDelta, chatTabs, duelsView, duelsTab } from './chat.js';

assert.deepEqual(itemsDelta([], ['a']), [0, ['a']]);
assert.deepEqual(itemsDelta(['a', 'b'], ['a', 'b']), [0, []]);
assert.deepEqual(itemsDelta(['a', 'b'], ['a', 'b', 'c']), [0, ['c']]);
assert.deepEqual(itemsDelta(['a', 'b', 'c'], ['b', 'c', 'd']), [1, ['d']]);   // the oldest dropped (the log's cap), one new
assert.deepEqual(itemsDelta(['a', 'b'], []), [2, []]);   // cleared (a new duel's Duel Log): every row goes
assert.deepEqual(itemsDelta(['a', 'b'], ['x']), [2, ['x']]);

// the chat's tabs: the Duel Log and Proximity Chat left out and the tabs after them moved back over their places;
// 'TRADE' as 'Trade'; lines landing in a log whose tab isn't shown counted on it ('(2)'), the tab grown by that text and
// the rest moved along; opening the tab clears it; a repeated line still counts
{
  const ctl = (id, cls, extra = {}) => ({ id, cls, parent: 0, x: 0, y: 0, w: 10, h: 10, shown: true, ...extra });
  const tab = (id, x, w, label, active = false) => ctl(id, 'CWindowTaskTab', { x, w, label, active });
  const chat = (active, items) => ({ id: 50, cls: 'CChatWindow', w: 776, h: 128, controls: [
    tab(11, 8, 80, 'All Chat', active === 11), tab(12, 80, 72, 'Duel Log', active === 12), tab(13, 144, 120, 'Proximity Chat', active === 13),
    tab(14, 256, 64, 'TRADE', active === 14), tab(15, 312, 64, 'Team ', active === 15),
    ...items.map((it, i) => ctl(21 + i, 'CWindowTaskTextlist', { items: it }))],
    pairs: [[11, 21], [12, 24], [13, 22], [14, 23], [15, 25]].map(([tab, log]) => ({ tab, log, visible: true })) });
  const tabs = w => chatTabs(w).controls.filter(c => c.cls === 'CWindowTaskTab').map(c => [c.label, c.x, c.w]);
  assert.deepEqual(tabs(chat(11, [['a'], [], [], ['duel'], []])), [['All Chat', 8, 80], ['Trade', 80, 64], ['Team', 136, 64]]);
  const two = tabs(chat(11, [['a', 'b'], [], [], ['duel', 'more'], ['hi', 'hi']]));
  assert.deepEqual(two.map(t => t[0]), ['All Chat', 'Trade', 'Team (2)']);
  assert.ok(two[2][2] > 64 && two[2][1] === 136, 'grown in place');
  assert.equal(tabs(chat(11, [['a', 'b'], [], [], ['duel', 'more'], ['hi', 'hi', 'hi']]))[2][0], 'Team (3)', 'the same line again counts');
  assert.equal(tabs(chat(15, [['a', 'b'], [], [], ['duel', 'more'], ['hi', 'hi', 'hi']]))[2][0], 'Team', 'opened: cleared');
}

// the chat only in the online world (owner): every online sign-in goes through My Room (10); Free mode goes from Select
// Player (7) to the deck scene (0x24) or the Free Duel lobby (11); the title (4) ends either; not known: online
{
  const { onlineAfter } = await import('../read/chat.js');
  const walk = scenes => scenes.reduce((o, s) => onlineAfter(o, s), null);
  assert.equal(walk([1, 4]), false, 'the title');
  assert.equal(walk([1, 4, 6, 7, 10, 11, 0x24, 0x1c, 0x20, 11]), true, 'online: My Room, then the lobby, the deck editor, a duel');
  assert.equal(walk([1, 4, 6, 7, 0x24]), false, "the title's Deck Editor");
  assert.equal(walk([1, 4, 6, 7, 11, 0x1c, 0x20, 11]), false, 'Free Duel, its duels too');
  assert.equal(walk([1, 4, 6, 7, 10, 11, 4, 6, 7, 11]), false, 'online, back to the title, then Free Duel');
  assert.equal(walk([11]), null, 'a reader started mid-session knows nothing (taken as online)');
}
// the Duels tab (DOM only): after the last shown game tab, 8 px over it, as wide as its caption plus the room the game
// gives its own; '(n)' its unread; open: the log and the input line not drawn by us, no game tab drawn current, the
// panel over the log's place and the input's text line; closed: the window untouched
{
  const ctl = (id, cls, extra = {}) => ({ id, cls, parent: 0, x: 0, y: 0, w: 10, h: 10, shown: true, ...extra });
  const win = { id: 60, cls: 'CChatWindow', w: 776, h: 128, controls: [
    ctl(1, 'CWindowTaskTab', { x: 8, w: 81, label: 'All Chat', active: true }), ctl(2, 'CWindowTaskTab', { x: 207, w: 72, label: 'TRADE' }),
    ctl(3, 'CWindowTaskTab', { x: 271, w: 72, label: 'Team', active: false }), ctl(4, 'CWindowTaskTab', { x: 271, w: 126, label: 'Trade Partner', shown: false }),
    ctl(5, 'CWindowTaskTextlist', { x: 8, y: 24, w: 760, h: 80 }), ctl(6, 'CWindowTaskTextlist', { x: 8, y: 99999, w: 760, h: 80, shown: false }),
    ctl(7, 'CWindowTaskScroll', { parent: 5, x: 752, y: 24, w: 16, h: 80 }), ctl(8, 'CWindowTaskInput', { x: 0, y: 96, w: 776, h: 32 }),
    ctl(9, 'CWindowTaskBackPlane', { x: 8, y: 24, w: 760, h: 96 })] };
  const t = duelsTab(win, false), tw = 7 * 'Team'.length, pad = 72 - tw;   // (textW under node: 7 px a letter)
  assert.deepEqual(t, { x: 271 + 72 - 8, y: 0, w: 7 * 'Duels'.length + pad, label: 'Duels', active: false });
  assert.deepEqual(duelsTab(win, true, 2), { x: 335, y: 0, w: 7 * 'Duels (2)'.length + pad, label: 'Duels (2)', active: true });
  assert.equal(duelsTab(win, false, 120).label, 'Duels (99+)');
  assert.equal(duelsTab({ ...win, controls: win.controls.filter(c => c.cls !== 'CWindowTaskTab') }, false), null, 'no tab row: no tab');
  assert.deepEqual(duelsView(win, false), { win, panel: null });
  const v = duelsView(win, true), by = id => v.win.controls.find(c => c.id === id);
  assert.deepEqual(v.panel, { list: { x: 8, y: 24, w: 760, h: 80 }, status: { x: 8, y: 104, w: 760, h: 16 } });
  assert.deepEqual([by(5).shown, by(8).shown, by(9).shown, by(7).shown], [false, false, true, true], 'log and input off, the plane kept');
  assert.ok(v.win.controls.filter(c => c.cls === 'CWindowTaskTab').every(c => !c.active), 'no game tab current');
  assert.equal(win.controls[0].active, true, 'the snapshot itself untouched');
  assert.equal(duelsView({ ...win, controls: win.controls.filter(c => c.id !== 5) }, true).panel, null, 'collapsed (no log): no panel');
  // the tab after chatTabs: the game tab hidden by the Duels view counts lines again ('All Chat (1)')
  const items = it => ({ ...win, pairs: [{ tab: 1, log: 5 }], controls: win.controls.map(c => c.id === 5 ? { ...c, items: it } : c) });
  chatTabs(duelsView(items(['a']), true).win);
  const labels = chatTabs(duelsView(items(['a', 'b']), true).win).controls.filter(c => c.cls === 'CWindowTaskTab' && c.shown).map(c => c.label);
  assert.deepEqual(labels, ['All Chat (1)', 'Trade', 'Team']);
}
// the Duels tab's words: no "also on Discord" (owner)
assert.deepEqual(DUELS_TEXT.EMPTY, ['No open duels right now.', 'To list yours: Duel menu → Create Duel.']);
assert.equal(DUELS_TEXT.MINE, 'Your duel stays listed here until someone joins.');
assert.ok(![DUELS_TEXT.HINT, DUELS_TEXT.MINE, ...DUELS_TEXT.EMPTY].some(t => /Discord/.test(t)));
console.log('chat ok');

// a line from Discord: the sender's name marked (server discord/bridge.ts), shown with the Discord logo
assert.equal(discordLine('\u00a4Yugi:hi there'), 'Yugi:hi there');
assert.equal(discordLine('\uff64Yugi:hi there'), 'Yugi:hi there', 'as the game widens it (Shift-JIS 0xA4)');
assert.equal(discordLine('Yugi:hi there'), null);
