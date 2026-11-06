// node client/web-shell/htmlui/duels_test.mjs: duels.js's pure parts: the rules wording, the rows, the unread count,
// the deeplink's pending id (sessionStorage, expiry, done) and the auto-join's steps. Exit 1 on the first failure.
import assert from 'node:assert/strict';
const { duelRules, duelRows, unseen, capturePending, readPending, finishPending, autoStep, afterJoin, LOBBY, RETRY_FOR, TERMINAL } = await import('./duels.js');

// the rules in short words
const d = (o = {}) => ({ id: 1, pid: 9, name: 'Kaiba', lv: 12, match: false, timeLimit: false, surrender: false, spectators: false, at: 0, free: false, mine: false, ...o });
assert.equal(duelRules(d()), 'Single');
assert.equal(duelRules(d({ timeLimit: true, spectators: true })), 'Single · time limit · spectators');
assert.equal(duelRules(d({ match: true })), 'Match (best of 3)');
assert.equal(duelRules(d({ match: true, timeLimit: true, spectators: true, surrender: true })), 'Match (best of 3) · time limit · spectators · surrender');
assert.deepEqual(duelRows([d({ match: true }), d({ id: 2, name: 'Me', lv: 3, mine: true })]),
  [{ id: 1, name: 'Kaiba', lv: 'LV 12', rules: 'Match (best of 3)', mine: false }, { id: 2, name: 'Me', lv: 'LV 3', rules: 'Single', mine: true }]);
assert.deepEqual(duelRows(null), []);
// unread: others' duels not seen yet; one's own never counts
assert.equal(unseen([d(), d({ id: 2 }), d({ id: 3, mine: true })], new Set([1])), 1);
assert.equal(unseen([], new Set()), 0);

// the pending id: kept from ?duel=, for 10 minutes; done ids never again; junk ignored
const mem = () => { const m = new Map(); return { getItem: k => m.get(k) ?? null, setItem: (k, v) => m.set(k, String(v)), removeItem: k => m.delete(k), m }; };
{
  const s = mem(), t = 1e12;
  assert.equal(capturePending('?online=1&duel=1004', s, t), 1004);
  assert.equal(readPending(s, t + 9 * 60000), 1004);
  assert.equal(readPending(s, t + 10 * 60000 + 1), null, 'expired');
  assert.equal(s.m.has('yo2.duel.pending'), false, 'an expired one is dropped');
  assert.equal(capturePending('?online=1', s, t), null);
  assert.equal(capturePending('?duel=abc', s, t), null);
  assert.equal(capturePending('?duel=-3', s, t), null);
  capturePending('?duel=1004', s, t);
  finishPending(1004, s);
  assert.equal(readPending(s, t), null);
  assert.equal(capturePending('?online=1&duel=1004', s, t), null, 'the same link again (a reload): not sent twice');
  assert.equal(capturePending('?duel=1005', s, t), 1005, 'another duel is');
  assert.equal(readPending({ getItem() { throw new Error('blocked'); } }, t), null, 'storage blocked: nothing');
}

// the auto-join: only in a lobby area, one at a time, never again once done, after the retry wait
{
  const run = { t0: 0, busy: false, next: 0, done: null };
  assert.equal(autoStep({ scene: 10, now: 0, pending: 7, run }), null, 'My Room: wait');
  assert.equal(autoStep({ scene: 0x1c, now: 0, pending: 7, run }), null, 'a duel: wait');
  assert.deepEqual(autoStep({ scene: 12, now: 0, pending: 7, run }), { join: 7 }, 'a lobby area (SCENE_AREA_MAP)');
  assert.equal(autoStep({ scene: LOBBY, now: 0, pending: null, run }), null, 'nothing pending');
  assert.deepEqual(autoStep({ scene: LOBBY, now: 0, pending: 7, run }), { join: 7 });
  assert.equal(autoStep({ scene: LOBBY, now: 0, pending: 7, run: { ...run, busy: true } }), null, 'one at a time');
  assert.equal(autoStep({ scene: LOBBY, now: 100, pending: 7, run: { ...run, next: 5000 } }), null, 'retry later');
  assert.deepEqual(autoStep({ scene: LOBBY, now: 5000, pending: 7, run: { ...run, next: 5000 } }), { join: 7 });
  assert.equal(autoStep({ scene: LOBBY, now: 0, pending: 7, run: { ...run, done: 7 } }), null, 'never twice');
  // what an answer does: sent or a final refusal ends it; the creator not there yet, busy, another lobby: retried
  // for a minute
  assert.equal(afterJoin({ ok: true }, 0, 10), 'done');
  for (const e of TERMINAL) assert.equal(afterJoin({ ok: false, error: e }, 0, 10), 'done', e);
  for (const e of ['absent', 'elsewhere', 'you-busy', 'not-in-game', 'my-room', 'net', 'request']) assert.equal(afterJoin({ ok: false, error: e }, 0, 10), 'retry', e);
  assert.equal(afterJoin({ ok: false, error: 'absent' }, 0, RETRY_FOR), 'done', 'a minute is up');
}
console.log('duels ok');
