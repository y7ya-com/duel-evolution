// node client/web-shell/htmlui/cosmetics/api_test.mjs: cosmetics/api.js over a stubbed fetch: the cache and its
// coalescing, the open's requestId (replayed on a retry, advanced by a success), the stale / conflicting ids, the error
// texts. Synthetic data only. Exit 1 on the first failure.
import assert from 'node:assert/strict';

let calls = [], replies = [];
const json = (status, body) => ({ ok: status >= 200 && status < 300, status, json: async () => body });
const text = (status) => ({ ok: false, status, json: async () => { throw new SyntaxError('not json'); } });
globalThis.fetch = async (url, opts = {}) => {
  calls.push({ url, method: opts.method || 'GET', body: opts.body ? JSON.parse(opts.body) : undefined });
  const next = replies.shift();
  if (!next) throw new Error('no reply queued for ' + url);
  if (next === 'down') throw new TypeError('Failed to fetch');
  return typeof next === 'function' ? next(url, opts) : next;
};
const api = await import('./api.js');
const reset = () => { calls = []; replies = []; api._reset({ wait: async () => {} }); };
const state = (seq, extra = {}) => ({ available: true, wallet: { total: 6000, bound: 5000, earned: 1000 }, nextRequestId: String(seq),
  boxes: [{ id: 'head', price: 500, pity: { superMisses: 0, ultraMisses: 0, superAt: 8, ultraAt: 15 }, pool: [] }], ...extra });
const item = { id: 'hair:test', name: 'Test Hair', kind: 'hair', rarity: 'rare', bodies: ['male', 'female'], owned: true, copies: 0 };

// ---- getInfo: one request for calls in flight together, the answer cached, force asks again
reset();
replies = [json(200, state(3))];
const [a, b] = await Promise.all([api.getInfo(), api.getInfo()]);
assert.equal(calls.length, 1);
assert.equal(calls[0].url, '/api/de/cosmetics');
assert.equal(a, b);
assert.equal(a.nextRequestId, '3');
await api.getInfo();
assert.equal(calls.length, 1, 'cached');
replies = [json(200, state(4))];
assert.equal((await api.getInfo({ force: true })).nextRequestId, '4');
assert.equal(calls.length, 2);
assert.equal(api.peekInfo().nextRequestId, '4');
// a failed read is a { error, message } and isn't cached
replies = [json(401, { error: 'signed out' })];
await assert.rejects(api.getInfo({ force: true }), e => e.error === 'signed out' && /sign in/i.test(e.message));
// the base: the page's ENV.YO2_DE_HTTP (the game page's same-origin http server)
globalThis.ENV = { YO2_DE_HTTP: 'http://127.0.0.1:9' };
replies = [json(200, state(4))];
await api.getInfo({ force: true });
assert.equal(calls.at(-1).url, 'http://127.0.0.1:9/api/de/cosmetics');
delete globalThis.ENV;

// ---- openBox: the server's requestId, the state advanced, onChange told (not about the reward fields)
reset();
const seen = [];
const off = api.onChange(i => seen.push(i));
replies = [json(200, state(7)), json(200, { ...state(8), requestId: '7', reward: { ...item, duplicate: false } })];
const r1 = await api.openBox('head');
assert.deepEqual(calls.map(c => c.method), ['GET', 'POST']);
assert.equal(calls[1].url, '/api/de/cosmetics/open');
assert.deepEqual(calls[1].body, { boxId: 'head', requestId: '7' });
assert.equal(r1.reward.id, 'hair:test');
assert.equal(r1.replay, false);
assert.equal(r1.info.nextRequestId, '8');
assert.equal(api.peekInfo().nextRequestId, '8');
assert.equal(seen.length, 1);
assert.equal(seen[0].reward, undefined, 'the cached state has no reward');
// a network failure (and a 503) retries the SAME id; the server's replay answers
replies = ['down', json(503, { error: 'temporarily-unavailable' }), json(200, { ...state(9), requestId: '8', reward: { ...item, duplicate: true, copies: 2 }, replay: true })];
const r2 = await api.openBox('head');
assert.deepEqual(calls.slice(-3).map(c => c.body.requestId), ['8', '8', '8']);
assert.equal(r2.replay, true);
assert.equal(r2.reward.duplicate, true);
assert.equal(seen.length, 2);
// out of retries: the network error, and the id kept for the next press (no double charge)
replies = ['down', 'down', 'down', 'down'];
await assert.rejects(api.openBox('head'), e => e.error === 'network' && /connection/.test(e.message));
assert.equal(calls.length, 2 + 3 + 4, "one try and three retries");
assert.equal(api.peekInfo().nextRequestId, '9');
replies = [json(200, { ...state(10), requestId: '9', reward: item })];
await api.openBox('head');
assert.equal(calls.at(-1).body.requestId, '9');
off();
replies = [json(200, { ...state(11), requestId: '10', reward: item })];
await api.openBox('head');
assert.equal(seen.length, 3, 'unsubscribed');

// ---- a stale id: the state refreshed, the player asked to press again (nothing opened behind their back)
reset();
replies = [json(200, state(2)), json(409, { error: 'stale-request', status: 409 }), json(200, state(5))];
await assert.rejects(api.openBox('head'), e => e.error === 'stale-request' && /press the button again/.test(e.message));
assert.deepEqual(calls.map(c => c.method), ['GET', 'POST', 'GET']);
assert.equal(api.peekInfo().nextRequestId, '5');
// a conflicting id (spent on another box whose answer was lost): refreshed and retried once with the fresh id
reset();
replies = [json(200, state(2)), json(409, { error: 'request-conflict' }), json(200, state(3)), json(200, { ...state(4), requestId: '3', reward: item })];
const r3 = await api.openBox('head');
assert.deepEqual(calls.filter(c => c.method === 'POST').map(c => c.body.requestId), ['2', '3']);
assert.equal(r3.reward.id, 'hair:test');

// ---- the texts
reset();
replies = [json(200, state(1)), json(409, { error: 'insufficient-earned-mp', status: 409 })];
await assert.rejects(api.openBox('head'), e => e.error === 'insufficient-earned-mp' && /costs 500 earned MP and you have 1,000/.test(e.message) && /Starter MP/.test(e.message));
replies = [json(409, { error: 'in-duel' })];
await assert.rejects(api.openBox('head'), e => e.error === 'in-duel' && /duel/.test(e.message));
replies = [json(409, { error: 'unavailable-pool' })];
await assert.rejects(api.openBox('head'), e => /closed for now/.test(e.message));
replies = [text(503), text(503), text(503), text(503)];   // the DO's plain "server restarting" (retried, then given up)
await assert.rejects(api.openBox('head'), e => e.error === 'server-restarting' && /restarting/.test(e.message));
const notice = 'The female version of this item is still being made. You can keep or trade it now and wear it once it\'s added.';
replies = [json(409, { error: 'no-compatible-variant', status: 409, reason: 'body', id: 'hair:test', bodies: ['male'], notice })];
await assert.rejects(api.equip('hair:test'), e => e.error === 'no-compatible-variant' && e.message === notice && e.reason === 'body');
replies = [json(409, { error: 'no-compatible-variant', reason: 'world', worlds: [0] })];
await assert.rejects(api.equip('hair:test', 1), e => /only be worn in Domino City/.test(e.message));
assert.deepEqual(calls.at(-1).body, { id: 'hair:test', world: 1 });
assert.match(api.errorText('something-new'), /went wrong/);

// ---- equip: the new state, onChange told
reset();
const eq = [];
api.onChange(i => eq.push(i));
replies = [json(200, { ...state(1), equipped: { id: 'hair:test', world: 0, parts: [] } })];
const e1 = await api.equip('hair:test');
assert.deepEqual(calls[0].body, { id: 'hair:test' });
assert.equal(calls[0].url, '/api/de/cosmetics/equip');
assert.equal(e1.equipped.id, 'hair:test');
assert.equal(eq.length, 1);
assert.equal(eq[0].equipped, undefined);

// ---- setAppearance: a whole look for one world (rank uniforms), the new state, onChange told
reset();
const ap = [];
api.onChange(i => ap.push(i));
const parts = [0, 4, 32, 48, 64, 97, 129, 144, 184, 32, 0, 0, 0, 0, 6, 0];
replies = [json(200, { ...state(1), appearance: { world: 1, parts } })];
const a1 = await api.setAppearance(1, parts);
assert.equal(calls[0].url, '/api/de/cosmetics/appearance');
assert.deepEqual(calls[0].body, { world: 1, parts });
assert.deepEqual(a1.appearance.parts, parts);
assert.equal(ap.length, 1);
replies = [json(403, { error: 'unowned-or-invalid-appearance' })];
await assert.rejects(api.setAppearance(1, parts), e => e.error === 'unowned-or-invalid-appearance' && /unavailable or unowned/.test(e.message));
console.log('cosmetics/api ok');

assert.match(api.errorText('slifer-until-lv5'), /level 5/);
assert.match(api.errorText('rank-uniform-locked'), /ranked/);
assert.match(api.errorText('appearance-not-owned'), /own every item/);
assert.match(api.errorText('invalid-appearance'), /invalid avatar part/);
