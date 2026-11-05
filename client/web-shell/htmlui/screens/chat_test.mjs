// node client/web-shell/htmlui/screens/chat_test.mjs: a list's update as a delta; the chat's tabs (chatTabs)
import assert from 'node:assert/strict';
import { itemsDelta, chatTabs } from './chat.js';

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
    tab(14, 256, 64, 'TRADE', active === 14), tab(15, 312, 56, 'Team', active === 15), ...items.map((it, i) => ctl(21 + i, 'CWindowTaskTextlist', { items: it }))],
    pairs: [[11, 21], [12, 24], [13, 22], [14, 23], [15, 25]].map(([tab, log]) => ({ tab, log, visible: true })) });
  const tabs = w => chatTabs(w).controls.filter(c => c.cls === 'CWindowTaskTab').map(c => [c.label, c.x, c.w]);
  assert.deepEqual(tabs(chat(11, [['a'], ['near'], [], ['duel'], []])), [['All Chat', 8, 80], ['Trade', 80, 64], ['Team', 136, 56]]);
  const two = tabs(chat(11, [['a', 'b'], ['near', 'by'], ['t1', 't2'], ['duel', 'more'], []]));
  assert.deepEqual(two.map(t => t[0]), ['All Chat', 'Trade (2)', 'Team'], 'no Proximity Chat tab, its lines counted nowhere');
  assert.ok(two[1][2] > 64 && two[2][1] === 136 + two[1][2] - 64, 'grown, and the next one moved along');
  assert.equal(tabs(chat(11, [['a', 'b'], ['near', 'by'], ['t1', 't2', 't2'], ['duel', 'more'], []]))[1][0], 'Trade (3)', 'the same line again counts');
  assert.equal(tabs(chat(14, [['a', 'b'], ['near', 'by'], ['t1', 't2', 't2'], ['duel', 'more'], []]))[1][0], 'Trade', 'opened: cleared');
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
console.log('chat ok');
