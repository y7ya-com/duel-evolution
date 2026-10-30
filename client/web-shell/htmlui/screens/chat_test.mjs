// node client/web-shell/htmlui/screens/chat_test.mjs: the chat window's log wrap / view, scroll bar and caret maths
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
// as an ES module whatever package.json says .js is (a home-folder package.json makes it CommonJS)
const src = readFileSync(new URL('chat.js', import.meta.url), 'utf8');
const { wrap, visibleLines, scrollValue, indexAt } = await import('data:text/javascript,' + encodeURIComponent(src));

const adv = ch => (ch === 'W' ? 12 : 6);   // a fake cell table (the real one is the game's glyphs, on R2)

assert.deepEqual(wrap('', 20, adv), ['']);
assert.deepEqual(wrap('abc', 18, adv), ['abc']);
assert.deepEqual(wrap('abcd', 18, adv), ['abc', 'd']);
assert.deepEqual(wrap('aWa', 18, adv), ['aW', 'a']);

const list = { items: ['abcdefgh', 'x', 'y', 'z'], w: 16 + 24, h: 32 };   // 4 cells a line, 2 lines in view
assert.deepEqual(visibleLines(list, null, adv), ['abcd', 'efgh']);
assert.deepEqual(visibleLines(list, { value: 2 }, adv), ['x', 'y']);
assert.deepEqual(visibleLines(list, { value: 4 }, adv), ['z']);

const bar = { value: 5, max: 10, length: 112, thumb: { len: 20 } };   // track: 112 - 32 - 20 = 60 px over 0..10
assert.equal(scrollValue(bar, 3), 4);
assert.equal(scrollValue(bar, 110), 6);
assert.equal(scrollValue({ ...bar, value: 0 }, 3), 0);
assert.equal(scrollValue({ ...bar, value: 10 }, 110), 10);
assert.equal(scrollValue(bar, 16 + 10), 0);
assert.equal(scrollValue(bar, 16 + 10 + 30), 5);
assert.equal(scrollValue(bar, 16 + 10 + 60), 10);
assert.equal(scrollValue({ ...bar, max: 0, value: 0, thumb: { len: 80 } }, 50), 0);

assert.equal(indexAt('abc', 0, adv), 0);
assert.equal(indexAt('abc', 2, adv), 0);
assert.equal(indexAt('abc', 4, adv), 1);
assert.equal(indexAt('abc', 99, adv), 3);
assert.equal(indexAt('😀b', 7, adv), 2);   // UTF-16 index after the surrogate pair
console.log('chat ok');
