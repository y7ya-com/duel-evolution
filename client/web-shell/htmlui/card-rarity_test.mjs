import assert from 'node:assert/strict';
import { setRarityCatalog, rarityForInternalId, rarityForPasscode, rarityOverlayPlan, subscribeRarities } from './card-rarity.js';

let changes = 0;
const unsubscribe = subscribeRarities(() => changes++);
setRarityCatalog({ byInternalId: { 1: 'UR', 2: 'N', 3: 'SR', 4: 'R', bad: 'UR', 5: 'fake' },
  byPasscode: { 89631139: 'UR', 1: 'N' } });
assert.equal(rarityForInternalId(1), 'UR');
assert.equal(rarityForPasscode(1), 'N', 'never confuse passcodes with native IDs');
assert.equal(rarityForInternalId(89631139), null, 'a passcode cannot accidentally supply an internal-ID rarity');
assert.equal(rarityForInternalId(5), null, 'unclassified entries are not labelled Common');
assert.equal(changes, 1); unsubscribe();
assert.equal(rarityForInternalId('3'), 'SR');
const win = { id: 20, cls: 'CWindowModelTrade', shown: true, x: 248, y: 0, w: 488, h: 608,
  controls: [{ id: 10, cls: 'CWindowTaskTradeCard', shown: true, card: 1, wx: 300, wy: 40 },
    { id: 11, cls: 'CWindowTaskTradeCard', shown: true, card: 3, wx: 400, wy: 340 },
    { id: 12, cls: 'CWindowTaskTradeCard', shown: false, card: 2, wx: 500, wy: 40 }] };
assert.deepEqual(rarityOverlayPlan(win), [{ key: '10', code: 'UR', x: 55, y: 43 }, { key: '11', code: 'SR', x: 155, y: 343 }]);
assert.equal(rarityOverlayPlan({ ...win, shown: false }).length, 0);
assert.equal(rarityOverlayPlan({ ...win, cls: 'CWindowModelDeck' }, { modernEditor: true }).length, 0, 'custom editor coordinates must not receive native badges');
assert.equal(rarityOverlayPlan(win, { modernEditor: true }).length, 2, 'trade badges remain enabled');
assert.equal(rarityOverlayPlan({ ...win, controls: [{ ...win.controls[0], dragging: true }] }).length, 0);
assert.deepEqual(rarityOverlayPlan({ id: 30, cls: 'CCardDetailViewDlg', shown: true, card: 4, mode: 3 }),
  [{ key: 'detail-30', code: 'R', x: 12, y: 28 }]);

const loader = await import('./card-rarity.js?deduplicated-fetch-test');
let requests = 0;
const fetcher = async () => { requests++; return { ok: true, json: async () => ({ byInternalId: { 2: 'R' }, byPasscode: { 42: 'R' } }) }; };
await Promise.all([loader.loadRarities(fetcher), loader.loadRarities(fetcher), loader.loadRarities(fetcher)]);
assert.equal(requests, 1);
await loader.loadRarities(fetcher); assert.equal(requests, 1, 'loaded catalogue cached');
assert.equal(loader.rarityForInternalId(2), 'R');
console.log('card-rarity_test: mapping namespaces, unknowns, trade/card geometry, visibility and fetch caching passed');
