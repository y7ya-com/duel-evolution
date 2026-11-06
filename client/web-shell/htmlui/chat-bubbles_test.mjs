// node client/web-shell/htmlui/chat-bubbles_test.mjs: an All Chat line's speaker among the shown avatars
import assert from 'node:assert/strict';
import { speaker } from './chat-bubbles.js';

const av = [{ pid: 1, name: '@0Ann', x: 0, y: 0 }, { pid: 2, name: '@0Ann B', x: 0, y: 0 }];
assert.deepEqual(speaker('Ann:hi there', av), { pid: 1, text: 'hi there' });
assert.deepEqual(speaker('Ann B:a:b', av), { pid: 2, text: 'a:b' }, 'the longest name that fits; colons in the text stay');
assert.equal(speaker('Bob:hi', av), null, 'not on screen: no bubble');
assert.equal(speaker('Ann', av), null, 'no text');
console.log('chat-bubbles ok');
