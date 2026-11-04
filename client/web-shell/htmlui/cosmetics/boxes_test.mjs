// node client/web-shell/htmlui/cosmetics/boxes_test.mjs: the box shop's view model (cosmetics/boxes-model.js): the odds
// bar, the pity meters and line, the showcase's state (affordable, short of earned MP, closed), the strip, the selected
// item's detail, the contents sheet, the reveal's card; the shop skin's pieces and digits. Synthetic items only.
import assert from 'node:assert/strict';
import { wearWorld, pct, pityMeters, pityLine, oddsBar, pityActive, boxView, contents, revealView, worldsText, bodiesText, featured,
  itemLines, stripItems, TABS, BOX_LOOK, STRIP } from './boxes-model.js';
import { RARITY, rarityColor, rarityLabel, THEME_CSS, mpDigits } from './theme.js';
import { PIECES, BANNER, SHOP_SKIN_CSS, digitsWidth } from './shopart.js';

// theme: the rarity words and frame colours (ultra gold, super purple, rare cyan, common silver)
assert.equal(rarityColor('rare'), '#2fc6f4'); assert.equal(rarityColor('super'), '#a46cf0'); assert.equal(rarityColor('ultra'), '#e8b42a');
assert.deepEqual(['common', 'rare', 'super', 'ultra'].map(rarityLabel), ['Common', 'Rare', 'Super Rare', 'Ultra Rare']);
assert.equal(rarityLabel('bogus'), 'Common');
assert.match(THEME_CSS, /\.de-rf\[data-rarity=ultra\]/); assert.ok(RARITY.common.frame);
assert.doesNotMatch(THEME_CSS + SHOP_SKIN_CSS, /text-transform|letter-spacing: [1-9]|♂|♀/, 'no letter-spaced capitals, no gender glyphs');
assert.equal(mpDigits(1200), '1200MP'); assert.equal(mpDigits(-5), '0MP');

// the shop skin: every piece cut from data/shop (or the card get's glow), every box a banner
for (const [k, [tex, u, v, w, h]] of Object.entries(PIECES)) {
  assert.ok(/^shop|^data\/y\/result\//.test(tex), k); assert.ok(u >= 0 && v >= 0 && w > 0 && h > 0, k);
}
assert.deepEqual(BANNER, { outfit: 'bnOutfit', head: 'bnHead', dueldisk: 'bnDisk' });
for (const id of ['head', 'outfit', 'dueldisk']) assert.ok(PIECES[BOX_LOOK[id].banner], id);
assert.equal(digitsWidth('1200MP'), 12 * 4 + 14 + 13 + 1); assert.equal(digitsWidth('1,200'), 49, 'the comma is dropped');

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
assert.equal(pityLine(box), 'Super Rare or better within 6 · Ultra Rare within 10');
assert.equal(sup.key, 'super'); assert.equal(sup.left, 6); assert.equal(sup.text, 'in 6 opens'); assert.equal(sup.label, 'Super Rare or better');
assert.equal(ult.left, 10); assert.equal(ult.text, 'in 10 opens'); assert.equal(ult.label, 'Ultra Rare guaranteed');
assert.ok(Math.abs(sup.progress - 2 / 7) < 1e-9);
const near = pityMeters({ ...box, pity: { superMisses: 7, ultraMisses: 13, superAt: 8, ultraAt: 15 } });
assert.equal(near[0].left, 1); assert.equal(near[0].next, true); assert.equal(near[0].text, 'next open!'); assert.equal(near[0].progress, 1);
assert.equal(near[1].text, 'in 2 opens');
assert.equal(pityLine({ ...box, pity: { superMisses: 7, ultraMisses: 13, superAt: 8, ultraAt: 15 } }), 'Super Rare or better on the next open · Ultra Rare within 2');
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
assert.deepEqual(head.items.map(i => i.id), ['u1', 'u2', 's1', 'r1', 'c1', 'c2'], 'the strip: rarest first');
assert.deepEqual(stripItems({ pool: [] }), []); assert.equal(STRIP, 5);
assert.equal(head.priceDigits, '500MP'); assert.equal(head.pityLine, 'Super Rare or better within 6 · Ultra Rare within 10');
assert.deepEqual(itemLines(box.pool[3], 'female'), ['S1', 'Super Rare hair', 'Male body only for now · Domino City']);
assert.deepEqual(itemLines(box.pool[4], 'male'), ['U1', 'Ultra Rare hair', 'Both bodies · Both worlds']);
assert.equal(head.notice, 'Some items exist for one body only for now.');
const outfit = boxView(info, 'outfit');
assert.equal(outfit.affordable, false); assert.equal(outfit.short, 400);
assert.equal(outfit.disabled, 'Needs 400 more earned MP. Starter MP buys cards only.');
assert.match(boxView(info, 'head', 0) && boxView({ ...info, boxes: [{ ...box, available: false }] }, 'head').disabled, /closed/);
assert.equal(boxView(null, 'head').box, null, 'loading');
assert.deepEqual(TABS.map(t => t.id), ['head', 'outfit', 'dueldisk']);
assert.equal(featured({ pool: [it('a', 'common')] }).length, 0);

// the contents sheet: rarest first, each item's chance, owned counts
const c = contents(box);
assert.deepEqual(c.map(g => [g.rarity, g.items.length, g.owned]), [['ultra', 2, 0], ['super', 1, 0], ['rare', 1, 0], ['common', 2, 2]]);
assert.equal(c[0].each, 2); assert.equal(c[3].items[1].chance, 27.5); assert.equal(c[3].items[1].copies, 2);

// bodies and worlds
assert.equal(bodiesText(pool[0]), 'Both bodies'); assert.equal(bodiesText(pool[3]), 'Male body only for now');
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
assert.equal(dup.duplicate, true); assert.equal(dup.dupText, 'Duplicate: you now have 4', 'three spares and the one worn');
assert.equal(revealView({ ...pool[1], duplicate: true, copies: 1 }).dupText, 'Duplicate: you now have 2');
assert.equal(dup.tempo, 'quick'); assert.ok(dup.anticipation < nu.anticipation, 'commons are quick');
const one = revealView({ ...pool[3], duplicate: false, compatible: false }, 'female');
assert.equal(one.notice, 'The female version is still being made.'); assert.equal(one.compatible, false);
assert.equal(one.bodiesText, 'Male body only for now'); assert.equal(one.worlds, 'Domino City'); assert.equal(one.tempo, 'normal');
assert.equal(one.item.id, 's1', 'the whole item, for its art');
assert.equal(revealView({ ...pool[3], duplicate: false }, 'male').notice, '', 'no "female version" notice for the body that can wear it');
assert.equal(revealView({ rarity: 'weird' }).rarity, 'common');
console.log('cosmetics/boxes model ok');
