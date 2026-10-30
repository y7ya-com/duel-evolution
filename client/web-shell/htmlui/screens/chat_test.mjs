// node client/web-shell/htmlui/screens/chat_test.mjs: the chat window's log wrap / view, scroll bar and caret maths
import assert from 'node:assert/strict';
import { wrap, visibleLines, scrollDir, indexAt, layoutText, rowOf } from './chat.js';

const adv = ch => (ch === 'W' ? 12 : 6);   // a fake cell table (the real one is the game's glyphs, on R2)

assert.deepEqual(wrap('', 20, adv), ['']);
assert.deepEqual(wrap('abc', 18, adv), ['abc']);
assert.deepEqual(wrap('abcd', 18, adv), ['abc', 'd']);
assert.deepEqual(wrap('aWa', 18, adv), ['aW', 'a']);

const list = { items: ['abcdefgh', 'x', 'y', 'z'], w: 16 + 24, h: 32 };   // 4 cells a line, 2 lines in view
assert.deepEqual(visibleLines(list, adv), ['abcd', 'efgh']);
assert.deepEqual(visibleLines({ ...list, topLine: 2 }, adv), ['x', 'y']);
assert.deepEqual(visibleLines({ ...list, topLine: 4 }, adv), ['z']);

const bar = { length: 112, thumb: { pos: 30, len: 20 } };   // the thumb at 46..66
assert.equal(scrollDir(bar, 3), -1);
assert.equal(scrollDir(bar, 45), -1);
assert.equal(scrollDir(bar, 46), 0);
assert.equal(scrollDir(bar, 65), 0);
assert.equal(scrollDir(bar, 66), 1);
assert.equal(scrollDir(bar, 110), 1);

assert.equal(indexAt('abc', 0, adv), 0);
assert.equal(indexAt('abc', 2, adv), 0);
assert.equal(indexAt('abc', 4, adv), 1);
assert.equal(indexAt('abc', 99, adv), 3);
assert.equal(indexAt('😀b', 7, adv), 2);   // UTF-16 index after the surrogate pair
assert.deepEqual(layoutText('', Infinity, adv), [['', 0]]);
assert.deepEqual(layoutText('abc', Infinity, adv), [['abc', 0]]);
assert.deepEqual(layoutText('abcd\nef', 18, adv), [['abc', 0], ['d', 3], ['ef', 5]]);
assert.deepEqual(layoutText('a\n', 18, adv), [['a', 0], ['', 2]]);
const rows = layoutText('abcd\nef', 18, adv);
assert.equal(rowOf(rows, 0), 0);
assert.equal(rowOf(rows, 3), 1);   // the cut: the caret goes to the next row's start
assert.equal(rowOf(rows, 4), 1);   // before the '\n'
assert.equal(rowOf(rows, 7), 2);
console.log('chat ok');
