// node client/web-shell/htmlui/crafting/api_test.mjs: crafting/api.js over a stubbed fetch: the cache and its
// coalescing, an operation's requestId (kept on a retry, advanced by a success), stale and conflicting ids, the preview
// (no id spent), onChange, and a friendly text for every server error code. Synthetic data only. Exit 1 on failure.
import assert from 'node:assert/strict';

let calls = [], replies = [];
const json = (status, body) => ({ ok: status >= 200 && status < 300, status, json: async () => body });
const text = status => ({ ok: false, status, json: async () => { throw new SyntaxError('not json'); } });
globalThis.fetch = async (url, opts = {}) => {
  calls.push({ url, method: opts.method || 'GET', body: opts.body ? JSON.parse(opts.body) : undefined });
  const next = replies.shift();
  if (!next) throw new Error('no reply queued for ' + url);
  if (next === 'down') throw new TypeError('Failed to fetch');
  return next;
};
const api = await import('./api.js');
const reset = () => { calls = []; replies = []; api._reset({ wait: async () => {} }); };
const values = { craft: { N: 20, R: 50, SR: 150, UR: 450 }, dismantle: { N: 1, R: 2, SR: 15, UR: 150 } };
const view = (seq, shards = 1000, owned = 0) => ({ shards, values, nextRequestId: String(seq),
  cards: { 89631139: { owned, bound: 0, crafted: 0, craftable: true, dismantlable: owned, rarity: 'UR', inDecks: 0 } } });
const done = (seq, extra) => ({ ...view(seq, 550, 1), operation: 'make', changes: { 89631139: 1 }, shardDelta: -450,
  secret: { unlocked: [37], freePacks: [{ packId: 37, cards: [1, 2, 3, 4, 5] }] }, replayed: false, ...extra });

// ---- getView: coalesced, cached, forced
reset();
replies = [json(200, view(3))];
const [a, b] = await Promise.all([api.getView(), api.getView()]);
assert.equal(calls.length, 1);
assert.equal(calls[0].url, '/api/de/craft');
assert.equal(a, b);
await api.getView();
assert.equal(calls.length, 1, 'cached');
replies = [json(200, view(4))];
assert.equal((await api.getView({ force: true })).nextRequestId, '4');
replies = [json(409, { error: 'not-in-game', status: 409 })];
await assert.rejects(api.getView({ force: true }), e => e.error === 'not-in-game' && /sign in/i.test(e.message));
assert.equal(api.peekView().nextRequestId, '4', 'a failure keeps the last view');

// ---- make: the body, the id; the result's extras off the cached view; onChange told
reset();
replies = [json(200, view(7))];
await api.getView();
const seen = [];
api.onChange(v => seen.push(v.shards));
replies = [json(200, done(8))];
let out = await api.make(89631139);
assert.deepEqual(calls[1], { url: '/api/de/craft/make', method: 'POST', body: { passcode: 89631139, count: 1, requestId: '7' } });
assert.deepEqual([out.operation, out.shardDelta, out.secret.unlocked, out.view.shards, out.view.nextRequestId], ['make', -450, [37], 550, '8']);
assert.ok(!('operation' in api.peekView()) && !('secret' in api.peekView()), 'the cache is the plain view');
assert.deepEqual(seen, [550]);

// ---- a lost answer: retried with the SAME id (the receipt replays it), then the id advances
reset();
replies = [json(200, view(10)), 'down', text(503), json(200, done(11, { replayed: true }))];
await api.getView();
out = await api.make(89631139);
assert.deepEqual(calls.slice(1).map(c => c.body.requestId), ['10', '10', '10']);
assert.ok(out.replayed);
replies = [json(200, { ...view(12, 700, 0), operation: 'dismantle', changes: { 89631139: 1 }, shardDelta: 150, secret: { unlocked: [], freePacks: [] } })];
await api.dismantle(89631139);
assert.deepEqual(calls.at(-1), { url: '/api/de/craft/dismantle', method: 'POST', body: { passcode: 89631139, count: 1, requestId: '11' } });

// ---- a stale id: the view refreshed, the player asked to press again (not resent)
reset();
replies = [json(200, view(20)), json(409, { error: 'stale-request', status: 409 }), json(200, view(21))];
await api.getView();
await assert.rejects(api.make(89631139), e => e.error === 'stale-request' && /press the button again/.test(e.message));
assert.equal(api.peekView().nextRequestId, '21');
assert.equal(calls.length, 3);

// ---- a conflicting id: refreshed and retried once with the fresh id
reset();
replies = [json(200, view(30)), json(409, { error: 'request-id-conflict', status: 409 }), json(200, view(31)), json(200, done(32))];
await api.getView();
out = await api.make(89631139);
assert.deepEqual(calls.filter(c => c.method === 'POST').map(c => c.body.requestId), ['30', '31']);
assert.equal(out.view.nextRequestId, '32');

// ---- insufficient shards: the text names the cost and the balance
reset();
replies = [json(200, view(40, 100)), json(409, { error: 'insufficient-shards', status: 409 })];
await api.getView();
await assert.rejects(api.make(89631139), e => e.error === 'insufficient-shards' && /costs 450 and you have 100/.test(e.message));

// ---- dismantle extras: preview (keep, preview: true; no id spent, no change event), then the real one
reset();
replies = [json(200, view(50, 0, 3)), json(200, { ...view(50, 0, 3), operation: 'dismantle-extras', changes: { 89631139: 2 }, shardDelta: 300, preview: true })];
await api.getView();
const seen2 = [];
api.onChange(v => seen2.push(v.shards));
const pv = await api.previewExtras(1);
assert.deepEqual(calls[1].body, { keep: 1, preview: true, requestId: '50' });
assert.deepEqual([pv.changes, pv.shardDelta], [{ 89631139: 2 }, 300]);
assert.equal(api.peekView().nextRequestId, '50');
replies = [json(200, { ...view(51, 300, 1), operation: 'dismantle-extras', changes: { 89631139: 2 }, shardDelta: 300, secret: { unlocked: [], freePacks: [] } })];
out = await api.dismantleExtras(1);
assert.deepEqual(calls[2].body, { keep: 1, requestId: '50' });
assert.deepEqual([out.operation, out.shardDelta, seen2], ['dismantle-extras', 300, [300]]);

// ---- a friendly, distinct message for every code the server sends (HANDOFF "Errors"), and the transport's
const generic = api.errorText('???');
for (const code of ['invalid-craft', 'uncraftable', 'not-in-game', 'no-character', 'free-mode', 'busy', 'copy-cap', 'insufficient-shards',
  'not-dismantlable', 'stale-request', 'request-id-conflict', 'shard-overflow', 'character-changed', 'server-restarting',
  'invalid-shard-wallet', 'invalid-shard-config', 'deck-store-unavailable', 'network', 'temporarily-unavailable']) {
  const t = api.errorText(code);
  assert.ok(t && t !== generic && /[.!]$/.test(t), code + ': ' + t);
}
assert.match(api.errorText('copy-cap'), /3 copies/);
assert.match(api.errorText('not-dismantlable'), /bound .* or in a saved deck/);
assert.doesNotMatch(api.errorText('not-dismantlable'), /crafted/i);
assert.match(api.errorText('busy'), /duel or trade/);
// a plain-text 503 (the restart) is retried, then reported as the restart
reset();
replies = [json(200, view(60)), text(503), text(503), text(503), text(503)];
await api.getView();
await assert.rejects(api.make(89631139), e => e.error === 'server-restarting');
assert.equal(calls.length, 5, 'first try + 3 retries');
// a 409 is never retried
reset();
replies = [json(200, view(70)), json(409, { error: 'busy', status: 409 })];
await api.getView();
await assert.rejects(api.dismantle(89631139), e => e.error === 'busy');
assert.equal(calls.length, 2);
console.log('crafting/api_test: ok');
