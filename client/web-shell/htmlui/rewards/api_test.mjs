// node client/web-shell/htmlui/rewards/api_test.mjs: rewards/api.js over a stubbed fetch: the cache and its coalescing,
// a claim's requestId (replayed on a retry, advanced by a success), the stale / conflicting ids, Claim all's chain of
// ids, the error texts for every server code. Synthetic data only. Exit 1 on the first failure.
import assert from 'node:assert/strict';

let calls = [], replies = [];
const json = (status, body) => ({ ok: status >= 200 && status < 300, status, json: async () => body });
const text = status => ({ ok: false, status, json: async () => { throw new SyntaxError('not json'); } });
globalThis.fetch = async (url, opts = {}) => {
  calls.push({ url, method: opts.method || 'GET', body: opts.body ? JSON.parse(opts.body) : undefined });
  const next = replies.shift();
  if (!next) throw new Error('no reply queued for ' + url);
  if (next === 'down') throw new TypeError('Failed to fetch');
  return typeof next === 'function' ? next(url, opts) : next;
};
const api = await import('./api.js');
const reset = () => { calls = []; replies = []; api._reset({ wait: async () => {} }); };
const mission = (id, extra = {}) => ({ id, label: 'Play a rewarded duel', event: 'play', target: 1, progress: 1, mp: 80, kind: 'daily', claimed: false, claimable: true, ...extra });
const view = (token, extra = {}) => ({ wallet: { total: 6000, bound: 5000, earned: 1000 }, nextRequestId: token, day: '2026-11-05', week: '2026-11-02', stockpileCap: 9,
  missions: [mission('daily:2026-11-05:0'), mission('daily:2026-11-05:1')], login: { day: '2026-11-05', count: 1, streak: 1, cycleDay: 1, calendar: [] }, ...extra });

// ---- getView: one request for calls in flight together, cached, force asks again
reset();
replies = [json(200, view('t1'))];
const [a, b] = await Promise.all([api.getView(), api.getView()]);
assert.equal(calls.length, 1);
assert.equal(calls[0].url, '/api/de/rewards');
assert.equal(a, b);
await api.getView();
assert.equal(calls.length, 1, 'cached');
replies = [json(200, view('t2'))];
assert.equal((await api.getView({ force: true })).nextRequestId, 't2');
assert.equal(api.peekView().nextRequestId, 't2');
// switched off: final, not retried
replies = [json(503, { error: 'rewards-disabled' })];
await assert.rejects(api.getView({ force: true }), e => e.error === 'rewards-disabled' && /switched off/.test(e.message) && e.retry === false);
globalThis.ENV = { YO2_DE_HTTP: 'http://127.0.0.1:9' };
replies = [json(200, view('t2'))];
await api.getView({ force: true });
assert.equal(calls.at(-1).url, 'http://127.0.0.1:9/api/de/rewards');
delete globalThis.ENV;

// ---- claim: the view's id, the grant, the new view stored and announced
reset();
replies = [json(200, view('t1'))];
await api.getView();
let heard = 0;
const off = api.onChange(() => heard++);
replies = [json(200, { ...view('t2', { missions: [mission('daily:2026-11-05:0', { claimed: true, claimable: false })], wallet: { total: 6080, bound: 5000, earned: 1080 } }),
  grant: { id: 'daily:2026-11-05:0', mp: 80 }, replayed: false })];
let r = await api.claim('daily:2026-11-05:0');
assert.deepEqual(calls.at(-1).body, { id: 'daily:2026-11-05:0', requestId: 't1' });
assert.equal(calls.at(-1).url, '/api/de/rewards/claim');
assert.deepEqual(r.grant, { id: 'daily:2026-11-05:0', mp: 80 });
assert.equal(r.replayed, false);
assert.equal(r.view.wallet.earned, 1080);
assert.equal(r.view.grant, undefined, 'the claim extras stay off the cached view');
assert.equal(api.peekView().nextRequestId, 't2');
assert.equal(heard, 1);
off();

// a network failure and a bare 503 retry with the same id; the replay says so
reset();
replies = [json(200, view('t1'))];
await api.getView();
replies = ['down', text(503), json(200, { ...view('t2'), grant: { id: 'daily:2026-11-05:0', mp: 80 }, replayed: true })];
r = await api.claim('daily:2026-11-05:0');
assert.deepEqual(calls.slice(1).map(c => c.body.requestId), ['t1', 't1', 't1']);
assert.equal(r.replayed, true);
// the persistence failure (503 with a code) is retried with the same id too, at most three times
reset();
replies = [json(200, view('t1'))];
await api.getView();
replies = [json(503, { error: 'server-restarting' }), json(503, { error: 'server-restarting' }), json(503, { error: 'server-restarting' }), json(503, { error: 'server-restarting' })];
await assert.rejects(api.claim('daily:2026-11-05:0'), e => e.error === 'server-restarting' && /restarting/.test(e.message));
assert.equal(calls.length, 5);

// a stale id: the view is refreshed, the player asked to press again
reset();
replies = [json(200, view('t1'))];
await api.getView();
replies = [json(409, { error: 'stale-request' }), json(200, view('t9'))];
await assert.rejects(api.claim('daily:2026-11-05:0'), e => e.error === 'stale-request' && /press Claim again/.test(e.message));
assert.equal(api.peekView().nextRequestId, 't9');
// a conflicting id: refreshed and retried once with the fresh id
reset();
replies = [json(200, view('t1'))];
await api.getView();
replies = [json(409, { error: 'request-id-conflict' }), json(200, view('t5')), json(200, { ...view('t6'), grant: { id: 'daily:2026-11-05:0', mp: 80 } })];
r = await api.claim('daily:2026-11-05:0');
assert.deepEqual(calls.slice(1).map(c => c.method + ' ' + (c.body?.requestId || '')), ['POST t1', 'GET ', 'POST t5']);
assert.equal(r.grant.mp, 80);
// not claimable: refreshed, and the text knows whether it was already claimed
reset();
replies = [json(200, view('t1', { missions: [mission('x', { claimed: true, claimable: false })] }))];
await api.getView();
replies = [json(409, { error: 'not-claimable' }), json(200, view('t1'))];
await assert.rejects(api.claim('x'), e => e.error === 'not-claimable' && /already claimed/.test(e.message));
replies = [json(409, { error: 'reward-wallet-overflow' })];
await assert.rejects(api.claim('daily:2026-11-05:0'), e => /too full.*80 MP/.test(e.message));

// ---- claimAll: each claim with the id the previous one returned; stops at the first failure
reset();
replies = [json(200, view('t1'))];
await api.getView();
replies = [json(200, { ...view('t2'), grant: { id: 'a', mp: 80 } }), json(200, { ...view('t3'), grant: { id: 'b', mp: 600 } })];
let all = await api.claimAll(['a', 'b']);
assert.deepEqual(calls.slice(1).map(c => [c.body.id, c.body.requestId]), [['a', 't1'], ['b', 't2']]);
assert.equal(all.mp, 680);
assert.equal(all.grants.length, 2);
assert.equal(all.error, null);
replies = [json(200, { ...view('t4'), grant: { id: 'c', mp: 80 } }), json(409, { error: 'busy' })];
all = await api.claimAll(['c', 'd', 'e']);
assert.equal(all.grants.length, 1);
assert.equal(all.error.error, 'busy');
assert.equal(calls.length, 5, 'stopped at the failure');

// ---- every server code has its own words
const codes = ['rewards-disabled', 'not-claimable', 'reward-wallet-overflow', 'busy', 'stale-request', 'request-id-conflict', 'invalid-reward',
  'server-restarting', 'temporarily-unavailable', 'network', 'not-in-game', 'no-character', 'free-mode', 'invalid JSON'];
const generic = api.errorText('???');
for (const c of codes) assert.notEqual(api.errorText(c), generic, c);
assert.match(api.errorText('busy'), /duel or a trade/);
assert.match(api.errorText('free-mode'), /free mode/);
console.log('rewards api_test: ok');
