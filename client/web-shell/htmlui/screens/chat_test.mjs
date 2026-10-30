// node client/web-shell/htmlui/screens/chat_test.mjs: a press on a scroll bar; a list's update as a delta
import assert from 'node:assert/strict';
import { scrollDir, itemsDelta } from './chat.js';

const bar = { length: 112, thumb: { pos: 30, len: 20 } };   // the thumb at 46..66 (after the 16-pixel up arrow)
assert.equal(scrollDir(bar, 3), -1);
assert.equal(scrollDir(bar, 46), 0);
assert.equal(scrollDir(bar, 66), 1);

assert.deepEqual(itemsDelta([], ['a']), [0, ['a']]);
assert.deepEqual(itemsDelta(['a', 'b'], ['a', 'b']), [0, []]);
assert.deepEqual(itemsDelta(['a', 'b'], ['a', 'b', 'c']), [0, ['c']]);
assert.deepEqual(itemsDelta(['a', 'b', 'c'], ['b', 'c', 'd']), [1, ['d']]);   // the oldest dropped (the log's cap), one new
assert.deepEqual(itemsDelta(['a', 'b'], []), [2, []]);   // cleared (a new duel's Duel Log): every row goes
assert.deepEqual(itemsDelta(['a', 'b'], ['x']), [2, ['x']]);
console.log('chat ok');
