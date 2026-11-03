import assert from 'node:assert/strict';
import { cosmeticShopController, matchingItems } from './cosmetic-shop-model.js';
const item = { id: 'black-suit', name: 'Black Suit', kind: 'outfit', rarity: 'rare', owned: true, copies: 2 };
const base = () => ({ wallet: { total: 6500, bound: 5000, earned: 1500 }, nextRequestId: '1', available: true, boxes: [{ id: 'outfit', price: 1500, pool: [item] }], inventory: [item] });
assert.deepEqual(matchingItems([item], { query: 'BLACK', kind: 'outfit', rarity: 'rare', owned: true }), [item]);
assert.deepEqual(matchingItems([item], { query: 'disk' }), []);
{
  const calls = []; let money = base();
  const c = cosmeticShopController({ request: async (path, body) => { calls.push([path, body]); return path === 'cosmetics/open' ? { ...money, nextRequestId: '2', reward: { ...item, duplicate: true } } : money; } });
  await c.refresh(); assert.equal(await c.open('outfit'), true);
  assert.deepEqual(calls[1], ['cosmetics/open', { boxId: 'outfit', requestId: '1' }]);
  assert.equal(c.state.reveal.duplicate, true);
  c.dismissReveal(); assert.equal(c.state.reveal, null);
}
{
  let calls = 0; const money = base(); money.wallet.earned = 1499;
  const c = cosmeticShopController({ request: async () => { calls++; return money; } });
  await c.refresh(); assert.equal(await c.open('outfit'), false); assert.equal(calls, 1, 'starter balance cannot fund cosmetic rolls');
}
{
  const requests = []; let fail = true;
  const c = cosmeticShopController({ request: async (path, body) => { if (path === 'cosmetics') return base(); requests.push(body); if (fail) { fail = false; throw new Error('Connection interrupted'); } return { ...base(), nextRequestId: '2', reward: item }; } });
  await c.refresh(); assert.equal(await c.open('outfit'), false);
  assert.equal(await c.open('outfit'), true); assert.equal(requests[0].requestId, requests[1].requestId, 'retry an uncertain purchase with the same server token');
}
{
  let finish; const c = cosmeticShopController({ request: () => new Promise(r => { finish = r; }) });
  const pending = c.refresh(); c.reset(); finish(base()); await pending;
  assert.equal(c.state.cosmetics, null, 'late responses cannot restore a previous character session');
}
console.log('cosmetic-shop-model: earned funding, durable opening tokens, retry safety and session reset pass');
