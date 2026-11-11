// invite.js on a stub page (node invite_test.mjs): a refusal's reason; an allowed invite reopens the player's card from
// the player list (a held click over its row) until the game's "Send Duel Request" is there, then presses it; a player
// not in the list. Exit 1 on the first failure.
import assert from 'node:assert/strict';

const events = [], clicks = [];
let replies = [], snap;
const win = (cls, controls, o = {}) => ({ cls, shown: true, x: 0, y: 0, w: 248, h: 128, controls, ...o });
const list = (items) => win('CPlayerListDlg', [{ id: 10, cls: 'CWindowTaskActiveListbox', shown: true, x: 8, y: 24, w: 232, h: 96, rows: 6, top: 0, items }], { y: 608 });
Object.assign(globalThis, {
  requestAnimationFrame: f => setTimeout(f, 5),
  document: { getElementById: () => ({ getBoundingClientRect: () => ({ left: 0, top: 0, width: 1024 }), dispatchEvent: e => events.push([e.type, e.clientX, e.clientY]) }) },
  MouseEvent: class { constructor(type, o) { Object.assign(this, o, { type }); } },
  fetch: async () => { const [status, body] = replies.shift(); return { ok: status === 200, json: async () => body }; },
  yo2Html: { snapshot: () => snap },
});
const api = { click: async id => { clicks.push(id); }, setValue() {} };
const { inviteDuel, cardName } = await import('./invite.js');

assert.equal(cardName('LV01 Duelist E'), 'Duelist E');
assert.equal(cardName('@2Lv 1@>40/Duelist F'), 'Duelist F');

// refused: the server's reason, nothing clicked
replies = [[409, { error: 'busy', message: 'That player is busy.' }]];
snap = { windows: [list(['@2Lv 1@>40/Duelist F'])] };
assert.deepEqual(await inviteDuel(api, 'Duelist F'), { ok: false, message: 'That player is busy.' });
assert.equal(events.length + clicks.length, 0);

// allowed: the row (row 0: game point 48, 640) pressed and held, then the card's own button once it shows
replies = [[200, { ok: true, room: 1000 }]];
snap = { windows: [list(['@2Lv 1@>40/Duelist F'])] };
setTimeout(() => { snap = { windows: [list(['@2Lv 1@>40/Duelist F']), win('CPlayerListMenu', [{ id: 77, cls: 'CWindowTaskTextSwitch', shown: true, label: 'Send Duel Request' }])] }; }, 1200);
const first = inviteDuel(api, 'Duelist F');
assert.equal(inviteDuel(api, 'Duelist F'), first); // shared action, one POST and click
assert.deepEqual(await first, { ok: true });
assert.deepEqual(events.slice(0, 3), [['mousemove', 48, 640], ['mousedown', 48, 640], ['mouseup', 48, 640]]);
assert.deepEqual(clicks, [77]);

// a player not in the list
replies = [[200, { ok: true, room: 1001 }]];
snap = { windows: [list(['@2Lv 1@>40/Someone Else'])] };
assert.equal((await inviteDuel(api, 'Duelist F')).ok, false);
// A stalled HTTP request also ends; shorten only its 10-second deadline.
const originalFetch = globalThis.fetch, originalTimeout = globalThis.setTimeout;
try {
  globalThis.setTimeout = (fn, ms, ...args) => originalTimeout(fn, ms === 10000 ? 1 : ms, ...args);
  globalThis.fetch = (_url, { signal }) => new Promise((_resolve, reject) => {
    signal.addEventListener('abort', () => reject(new Error('aborted')), { once: true });
  });
  assert.equal((await inviteDuel(api, 'Duelist F')).ok, false);
} finally {
  globalThis.fetch = originalFetch; globalThis.setTimeout = originalTimeout;
}
console.log('invite_test: ok');
