// node client/web-shell/htmlui/screens/chat_test.mjs: where a press on the chat's scroll bar scrolls the log
import assert from 'node:assert/strict';
import { scrollDir } from './chat.js';

const bar = { length: 112, thumb: { pos: 30, len: 20 } };   // the thumb at 46..66 (after the 16-pixel up arrow)
assert.equal(scrollDir(bar, 3), -1);
assert.equal(scrollDir(bar, 45), -1);
assert.equal(scrollDir(bar, 46), 0);
assert.equal(scrollDir(bar, 65), 0);
assert.equal(scrollDir(bar, 66), 1);
assert.equal(scrollDir(bar, 110), 1);
console.log('chat ok');
