// node client/web-shell/htmlui/screens/chat_test.mjs: a list's update as a delta
import assert from 'node:assert/strict';
import { itemsDelta } from './chat.js';

assert.deepEqual(itemsDelta([], ['a']), [0, ['a']]);
assert.deepEqual(itemsDelta(['a', 'b'], ['a', 'b']), [0, []]);
assert.deepEqual(itemsDelta(['a', 'b'], ['a', 'b', 'c']), [0, ['c']]);
assert.deepEqual(itemsDelta(['a', 'b', 'c'], ['b', 'c', 'd']), [1, ['d']]);   // the oldest dropped (the log's cap), one new
assert.deepEqual(itemsDelta(['a', 'b'], []), [2, []]);   // cleared (a new duel's Duel Log): every row goes
assert.deepEqual(itemsDelta(['a', 'b'], ['x']), [2, ['x']]);
console.log('chat ok');
