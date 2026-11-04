// read/lobby.js on a synthetic memory image: a player's card's pid and level.   node client/web-shell/htmlui/read/lobby_test.mjs
import assert from 'node:assert/strict';
import lobby from './lobby.js';

const dv = new DataView(new ArrayBuffer(0x2000)), card = 0x400;
dv.setInt32(card + 0x4d8, 1009, true); dv.setInt32(card + 0x4f8, 23, true);
const ext = lobby({ i32: a => dv.getInt32(a, true) });
assert.deepEqual(ext.windows.CPlayerListMenu(card), { pid: 1009, level: 23 });
assert.deepEqual(Object.keys(ext.windows), ['CPlayerListMenu']);
console.log('read/lobby_test: ok');
