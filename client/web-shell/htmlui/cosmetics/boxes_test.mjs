// node client/web-shell/htmlui/cosmetics/boxes_test.mjs: the box shop's view model (cosmetics/boxes-model.js): the odds
// bar, the pity meters and line, the showcase's state (affordable, short of earned MP, closed), the strip, the selected
// item's detail, the contents sheet, the reveal's card; the shop skin's pieces and digits. Synthetic items only.
import assert from 'node:assert/strict';
import { wearWorld, pct, pityMeters, previewLook, bustLook, ownLook, RCODE, wipNotice, oddsBar, pityActive, boxView, contents, revealView, worldsText, bodiesText, featured,
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

// pity: a bar per guarantee from the server's counters; the Nth miss is guaranteed (superAt 8 with 2 misses: 2/8, in 6)
const [sup, ult] = pityMeters(box);
assert.equal(sup.key, 'super'); assert.equal(sup.label, 'Super Rare'); assert.equal(sup.count, '2/8'); assert.equal(sup.left, 6); assert.equal(sup.next, false);
assert.equal(ult.label, 'Ultra Rare'); assert.equal(ult.count, '5/15'); assert.equal(ult.left, 10);
assert.ok(Math.abs(sup.progress - 2 / 8) < 1e-9);
assert.ok(!('text' in sup), 'no sentences: the bar and the count');
const near = pityMeters({ ...box, pity: { superMisses: 7, ultraMisses: 13, superAt: 8, ultraAt: 15 } });
assert.equal(near[0].left, 1); assert.equal(near[0].next, true, 'the next open lands it: the bar glows'); assert.equal(near[0].count, '7/8');
assert.equal(near[1].next, false); assert.equal(near[1].count, '13/15');
// the duel disk box's ultra guarantee is at 10 (BOX_ECONOMY): read from the box, not assumed
assert.deepEqual(pityMeters({ ...box, ultraAt: 10, pity: { superMisses: 1, ultraMisses: 9, superAt: 8, ultraAt: 10 } }).map(m => [m.count, m.next]), [['1/8', false], ['9/10', true]]);
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
assert.equal(head.priceDigits, '500MP'); assert.deepEqual(head.pity.map(m => m.count), ['2/8', '5/15']);
assert.deepEqual(itemLines(box.pool[3]), ['S1', 'Super Rare hair', 'Female version coming soon'], 'the short WIP notice');
assert.deepEqual(itemLines(box.pool[4]), ['U1', 'Ultra Rare hair'], 'nothing more for an item both bodies wear');
assert.equal(wipNotice({ bodies: ['female'] }), 'Male version coming soon'); assert.equal(wipNotice(pool[0]), '');
assert.equal(head.notice, 'Some items exist for one body only for now.');
const outfit = boxView(info, 'outfit');
assert.equal(outfit.affordable, false); assert.equal(outfit.short, 400);
assert.equal(outfit.disabled, "Needs 400 more MP · starter MP can't open boxes");
assert.equal(boxView({ ...info, wallet: { total: 800, bound: 0, earned: 800 } }, 'outfit').disabled, 'Needs 400 more MP', 'no starter MP: no word of it');
assert.equal(boxView({ ...info, wallet: { total: 2000, bound: 1200, earned: 800 } }, 'outfit').disabled, "Needs 400 more MP · starter MP can't open boxes");
assert.match(boxView(info, 'head', 0) && boxView({ ...info, boxes: [{ ...box, available: false }] }, 'head').disabled, /^Closed/);
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
assert.equal(dup.duplicate, true); assert.equal(dup.dupText, 'Duplicate ×4', 'three spares and the one worn');
assert.equal(revealView({ ...pool[1], duplicate: true, copies: 1 }).dupText, 'Duplicate ×2');
assert.equal(dup.tempo, 'quick'); assert.ok(dup.anticipation < nu.anticipation, 'commons are quick');
const one = revealView({ ...pool[3], duplicate: false, compatible: false }, 'female');
assert.equal(one.notice, 'Female version coming soon'); assert.equal(one.compatible, false);
assert.equal(one.bodiesText, 'Male body only for now'); assert.equal(one.worlds, 'Domino City'); assert.equal(one.tempo, 'normal');
assert.equal(one.item.id, 's1', 'the whole item, for its art');
assert.equal(revealView({ ...pool[3], duplicate: false }, 'male').notice, '', 'no "female version" notice for the body that can wear it');
assert.equal(revealView({ rarity: 'weird' }).rarity, 'common');
// the preview: the player's look with the item's part in its slot (the current world's look; nothing saved)
const look = [0, 0, 0x20, 0x30, 0x40, 0x60, 0x70, 0x90, 0xb0, 0x20, 0, 0, 0, 0, 0, 0];
const pinfo = { appearance: { gender: 'male', world: 1, parts: look, looks: { 0: look, 1: [...look.slice(0, 6), 0x80, 0x90, 0xb8, ...look.slice(9)] } } };
const hair = it('h', 'rare', { slot: 1, variants: [{ gender: 'male', number: 10, worlds: [0, 1] }, { gender: 'female', number: 5, worlds: [0, 1] }] });
const pl = previewLook(pinfo, hair);
assert.equal(pl.mode, 'bust'); assert.equal(pl.gender, 'male'); assert.equal(pl.world, 1);
assert.equal(pl.parts[1], 10, 'the hair in its slot'); assert.equal(pl.parts[6], 0x70, "the actual current look wins over a stale per-world copy");
assert.equal(pinfo.appearance.looks[1][1], 0, 'the saved look untouched');
const domOnly = it('o', 'super', { kind: 'outfit', slot: 6, variants: [{ gender: 'male', number: 0x77, worlds: [0] }] });
assert.equal(previewLook(pinfo, domOnly).parts[6], 0x77, 'one look for both worlds: an item of the other world still tries on');
assert.equal(previewLook({ appearance: { gender: 'female', world: 0 } }, hair).parts[0], 1, 'no saved look: the default female one');
assert.equal(previewLook({ appearance: { gender: 'male', world: 0 } }, hair).parts[6], 0x80, 'a new character starts in Slifer Red, even in Domino');
const male = previewLook({ appearance: { gender: 'female', world: 0 } }, { ...pool[3], compatible: false });
assert.deepEqual(male, { mode: 'art', notice: 'Female version coming soon' }, "a body that can't wear it: the art and the notice");
const zeroStarter = previewLook({ appearance: { gender: 'male', world: 1, parts: look.map((n,i) => i === 6 || i === 8 ? 0 : n) } }, hair);
assert.equal(zeroStarter.parts[6], 0x80, 'native zero starter outfit resolves to Slifer Red');
assert.equal(zeroStarter.parts[8], 0xb8, 'native zero starter disk resolves to Academy disk');
// the item worn wherever it is sold (the reveal, the box page, the sheet): the player's look with it in its slot, framed
// on its slot; an item for the other body only on that body's default look (own: false)
const bl = bustLook(pinfo, hair);
assert.deepEqual([bl.own, bl.focus, bl.gender, bl.parts[1], bl.parts[6]], [true, 1, 'male', 10, 0x70]);
const fem = it('p', 'rare', { slot: 1, bodies: ['female'], compatible: false, variants: [{ gender: 'female', number: 8, worlds: [0, 1] }] });
const bf = bustLook(pinfo, fem);
assert.deepEqual([bf.own, bf.gender, bf.world, bf.focus], [false, 'female', 1, 1]);
assert.deepEqual(bf.parts, [1, 8, 0x20, 0x30, 0x40, 0x60, 0x80, 0x90, 0xb8, 0x20, 0, 0, 0, 0, 0, 0], 'the female default (Slifer Red, the Academy disk) with her ponytail');
const disk = it('d', 'common', { kind: 'dueldisk', slot: 8, variants: [{ gender: 'male', number: 0xb4, worlds: [0, 1] }] });
assert.equal(bustLook(pinfo, disk).focus, 8);
assert.equal(bustLook(pinfo, { ...hair, variants: [] }), null, 'nothing to draw: the art instead');
assert.equal(bustLook(pinfo, null), null);
// the try-on with nothing selected: the player's own look (a zero starter part resolved as the native renderer does)
assert.deepEqual(ownLook(pinfo), { parts: look, gender: 'male', world: 1 });
assert.deepEqual(ownLook({ appearance: { gender: 'female', world: 0 } }).parts.slice(0, 1), [1]);
assert.equal(ownLook({ appearance: { gender: 'male', world: 1, parts: look.map((n, i) => i === 8 ? 0 : n) } }).parts[8], 0xb8);
assert.deepEqual(Object.values(RCODE), ['N', 'R', 'SR', 'UR']);
console.log('cosmetics/boxes model ok');
