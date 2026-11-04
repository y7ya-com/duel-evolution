// node client/web-shell/htmlui/cosmetics/boxes_test.mjs: the box shop's view model (cosmetics/boxes-model.js): the odds
// bar, the pity meters, the showcase's state (affordable, short of earned MP, closed), the contents sheet, the
// reveal's card. Synthetic items only. Exit 1 on the first failure.
import assert from 'node:assert/strict';
import { wearWorld, pct, pityMeters, oddsBar, pityActive, boxView, contents, revealView, worldsText, bodiesText, featured, TABS } from './boxes-model.js';
import { RARITY, rarityColor, rarityLabel, THEME_CSS } from './theme.js';

// theme: the shared rarity colours and labels
assert.equal(rarityColor('rare'), '#3fd0ff'); assert.equal(rarityColor('super'), '#b98cff'); assert.equal(rarityColor('ultra'), '#ffc23d');
assert.deepEqual(['common', 'rare', 'super', 'ultra'].map(rarityLabel), ['Common', 'Rare', 'Super Rare', 'Ultra Rare']);
assert.equal(rarityLabel('bogus'), 'Common');
assert.match(THEME_CSS, /\.de-btn/); assert.ok(RARITY.common.color);

// percentages as the disclosure prints them
assert.equal(pct(55), '55%'); assert.equal(pct(4), '4%'); assert.equal(pct(100 / 3), '33.3%'); assert.equal(pct(4 / 7), '0.57%');
assert.equal(pct(5.5), '5.5%'); assert.equal(pct(0), '0%'); assert.equal(pct(12.5), '12.5%'); assert.equal(pct(0.5), '0.5%');

const v = (gender, worlds) => ({ gender, bit: 1, number: 1, worlds });
const it = (id, rarity, extra = {}) => ({ id, name: id.toUpperCase(), kind: 'hair', rarity, slot: 1, variants: [v('male', [0, 1]), v('female', [0, 1])],
  bodies: ['male', 'female'], owned: false, copies: 0, compatible: true, ...extra });
const pool = [it('c1', 'common', { owned: true }), it('c2', 'common', { owned: true, copies: 2 }), it('r1', 'rare'),
  it('s1', 'super', { bodies: ['male'], notice: 'The female version is still being made.', variants: [v('male', [0])] }), it('u1', 'ultra'), it('u2', 'ultra')];
const box = { id: 'head', name: 'Test Box', price: 500, superAt: 8, ultraAt: 15, available: true, notice: 'Some items exist for one body only for now.',
  configuredOdds: { common: 55, rare: 30, super: 11, ultra: 4 }, baseOdds: { common: 55, rare: 30, super: 11, ultra: 4 },
  nextOdds: { common: 55, rare: 30, super: 11, ultra: 4 }, pity: { superMisses: 2, ultraMisses: 5, superAt: 8, ultraAt: 15 },
  pool: pool.map(i => ({ ...i, baseChance: { common: 27.5, rare: 30, super: 11, ultra: 2 }[i.rarity] })),
  poolByRarity: { common: { count: 2 }, rare: { count: 1 }, super: { count: 1 }, ultra: { count: 2 } } };
const info = { wallet: { total: 5800, bound: 5000, earned: 800 }, boxes: [box, { ...box, id: 'outfit', price: 1200 }], appearance: { gender: 'male', world: 0 } };

// pity: the Nth miss is guaranteed (superAt 8 with 2 misses: in 6 opens); the last one says "next open!"
const [sup, ult] = pityMeters(box);
assert.equal(sup.key, 'super'); assert.equal(sup.left, 6); assert.equal(sup.text, 'in 6 opens'); assert.equal(sup.label, 'Super Rare or better');
assert.equal(ult.left, 10); assert.equal(ult.text, 'in 10 opens'); assert.equal(ult.label, 'Ultra Rare guaranteed');
assert.ok(Math.abs(sup.progress - 2 / 7) < 1e-9);
const near = pityMeters({ ...box, pity: { superMisses: 7, ultraMisses: 13, superAt: 8, ultraAt: 15 } });
assert.equal(near[0].left, 1); assert.equal(near[0].next, true); assert.equal(near[0].text, 'next open!'); assert.equal(near[0].progress, 1);
assert.equal(near[1].text, 'in 2 opens');
assert.equal(pityMeters({ ...box, pity: { superMisses: 99, ultraMisses: 0 } })[0].left, 1, 'clamped');
assert.deepEqual(pityMeters({ ...box, superAt: null, ultraAt: null, pity: { superMisses: 0, ultraMisses: 0, superAt: null, ultraAt: null } }), []);

// the odds bar: a segment per rarity with a chance; pity makes it the next open's
assert.deepEqual(oddsBar(box).map(s => [s.rarity, s.base, s.count]), [['common', 55, 2], ['rare', 30, 1], ['super', 11, 1], ['ultra', 4, 2]]);
assert.equal(pityActive(box), false);
const pityBox = { ...box, nextOdds: { common: 0, rare: 0, super: 0, ultra: 100 } };
assert.equal(pityActive(pityBox), true);
assert.deepEqual(oddsBar(pityBox).map(s => [s.rarity, s.next]), [['common', 0], ['rare', 0], ['super', 0], ['ultra', 100]]);
// a rarity with no items (renormalised away) has no segment
assert.deepEqual(oddsBar({ ...box, baseOdds: { common: 60, rare: 40, super: 0, ultra: 0 }, nextOdds: { common: 60, rare: 40, super: 0, ultra: 0 } }).map(s => s.rarity), ['common', 'rare']);

// the showcase: affordable with earned MP only
const head = boxView(info, 'head');
assert.equal(head.affordable, true); assert.equal(head.disabled, ''); assert.equal(head.priceText, '500 MP');
assert.equal(head.count, 6); assert.equal(head.owned, 2); assert.equal(head.hero.id, 'u1');
assert.deepEqual(head.featured.map(i => i.id), ['u1', 'u2', 's1']);
assert.equal(head.notice, 'Some items exist for one body only for now.');
const outfit = boxView(info, 'outfit');
assert.equal(outfit.affordable, false); assert.equal(outfit.short, 400);
assert.match(outfit.disabled, /You need 400 more earned MP/); assert.match(outfit.disabled, /Starter MP/);
assert.match(boxView(info, 'head', 0) && boxView({ ...info, boxes: [{ ...box, available: false }] }, 'head').disabled, /closed/);
assert.equal(boxView(null, 'head').box, null, 'loading');
assert.deepEqual(TABS.map(t => t.id), ['head', 'outfit', 'dueldisk']);
assert.equal(featured({ pool: [it('a', 'common')] }).length, 0);

// the contents sheet: rarest first, each item's chance, owned counts
const c = contents(box);
assert.deepEqual(c.map(g => [g.rarity, g.items.length, g.owned]), [['ultra', 2, 0], ['super', 1, 0], ['rare', 1, 0], ['common', 2, 2]]);
assert.equal(c[0].each, 2); assert.equal(c[3].items[1].chance, 27.5); assert.equal(c[3].items[1].copies, 2);

// bodies and worlds
assert.equal(bodiesText(pool[0]), 'both bodies'); assert.equal(bodiesText(pool[3]), '♂ male only for now');
assert.equal(worldsText(pool[0], 'male'), 'both worlds'); assert.equal(worldsText(pool[3], 'male'), 'Domino City');
assert.equal(worldsText({ variants: [v('female', [1])] }, 'male'), 'Duel Academy', "another body's worlds when this one has none");

// equipping: in the character's world if the item is worn there, else in the one it is
assert.deepEqual(wearWorld(pool[3], 'male', 1), { world: 0, here: false });
assert.deepEqual(wearWorld(pool[3], 'male', 0), { world: 0, here: true });
assert.deepEqual(wearWorld(pool[0], 'female', 1), { world: 1, here: true });
assert.equal(wearWorld(pool[3], 'female', 0), null);

// the reveal card: new or duplicate, single-body notice, the pace by rarity
const nu = revealView({ ...pool[4], duplicate: false, owned: true }, 'male');
assert.equal(nu.label, 'Ultra Rare'); assert.equal(nu.isNew, true); assert.equal(nu.dupText, ''); assert.equal(nu.tempo, 'special');
assert.ok(nu.anticipation >= 1200 && nu.anticipation <= 1500, 'about 1.2-1.5 s before an ultra');
const dup = revealView({ ...pool[1], duplicate: true, copies: 3 }, 'male');
assert.equal(dup.duplicate, true); assert.equal(dup.dupText, 'Duplicate: +1 tradable copy (you now have 3)');
assert.equal(dup.tempo, 'quick'); assert.ok(dup.anticipation < nu.anticipation, 'commons are quick');
const one = revealView({ ...pool[3], duplicate: false, compatible: false }, 'female');
assert.equal(one.notice, 'The female version is still being made.'); assert.equal(one.compatible, false);
assert.equal(one.bodiesText, '♂ male only for now'); assert.equal(one.worlds, 'Domino City'); assert.equal(one.tempo, 'normal');
assert.equal(one.item.id, 's1', 'the whole item, for its art');
assert.equal(revealView({ ...pool[3], duplicate: false }, 'male').notice, '', 'no "female version" notice for the body that can wear it');
assert.equal(revealView({ rarity: 'weird' }).rarity, 'common');
console.log('cosmetics/boxes model ok');
