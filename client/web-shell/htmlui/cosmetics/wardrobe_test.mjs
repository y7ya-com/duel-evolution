// node client/web-shell/htmlui/cosmetics/wardrobe_test.mjs: the Wardrobe's view model (cosmetics/wardrobe-model.js) on a
// state shaped like the server's (server/src/game/cosmetics.ts state(): inventory, appearance per world, rank): the
// three tabs and counts, one look worn everywhere (no world rule), the body rule and the uniforms' rank gate with
// their short reasons, take-off, graduation as a status, spares, the empty state, the focus tab and a uniform's parts. Exit 1 on the first failure.
import assert from 'node:assert/strict';
import { wardrobeView, canWear, isEquipped, tileOf, tabOfId, uniformParts, graduationOf, uniformItem, SCHOOLS, EMPTY_HINT, previewOf, defaultLook, takeOffParts } from './wardrobe-model.js';

const v = (gender, number, worlds) => ({ gender, bit: (gender === 'female' ? 256 : 0) + number, number, worlds });
const it = (id, kind, slot, rarity, variants, extra = {}) => {
  const bodies = ['male', 'female'].filter(b => variants.some(x => x.gender === b));
  return { id, name: id.split(':')[1], kind, slot, rarity, variants, bodies, owned: true, copies: 0, tradable: 0, compatible: true,
    ...(bodies.length === 1 ? { notice: `The ${bodies[0] === 'male' ? 'female' : 'male'} version of this item is still being made.` } : {}), ...extra };
};
const suit = it('outfit:black-suit', 'outfit', 6, 'rare', [v('male', 0x77, [0]), v('female', 0x74, [0])], { copies: 2, tradable: 2 });
const jaden = it('outfit:jaden', 'outfit', 6, 'common', [v('male', 0x87, [0, 1])]);
const kaiba = it('outfit:kaiba', 'outfit', 6, 'super', [v('male', 0x7a, [0])]);
const tea = it('outfit:tea', 'outfit', 6, 'ultra', [v('female', 0x76, [0])]);
const afro = it('hair:afro', 'hair', 1, 'common', [v('male', 0xa, [0, 1]), v('male', 0xb, [0, 1]), v('female', 0x5, [0, 1])]);
const sun = it('accessory:sunglasses', 'accessory', 9, 'rare', [v('male', 0x50, [0, 1]), v('female', 0x50, [0, 1])]);
const gold = it('dueldisk:3417', 'dueldisk', 8, 'ultra', [v('male', 0xb4, [0, 1]), v('female', 0xb4, [0, 1])]);
// male; one look (owner, 2026-11-05: the same in both worlds): Black Suit, Afro II (a merged size), Alpha Gold,
// Sunglasses
const look = [0, 0xb, 0x20, 0, 0x40, 0x60, 0x77, 0x90, 0xb4, 0x50, 0, 0, 0, 0, 0, 0];
const rank = { bestSchool: 'ra', uniforms: ['slifer', 'ra'], graduated: false, graduationLevel: 20,
  graduation: { level: 12, levelRequired: 20, opponents: 5, opponentsRequired: 25 } };
const info = { inventory: [suit, jaden, kaiba, tea, afro, sun, gold], rank,
  appearance: { gender: 'male', world: 1, parts: look, looks: { 0: look, 1: look } } };

// tabs: Head (hair + accessories), Outfit (+ the earned uniforms: Slifer and Ra), Disk
let w = wardrobeView(info);
assert.equal(w.body, 'male'); assert.equal(w.tab, 'outfit');
assert.deepEqual(w.tabs.map(t => [t.id, t.label, t.count]), [['head', 'Head', 2], ['outfit', 'Outfit', 6], ['dueldisk', 'Disk', 1]]);
// outfits: worn first, then the wearable ones rarest first, the other body's last; the uniforms after them
assert.deepEqual(w.items.map(t => t.id), ['outfit:black-suit', 'outfit:kaiba', 'outfit:jaden', 'outfit:tea']);
assert.deepEqual(w.uniforms.map(t => t.id), ['uniform:slifer', 'uniform:ra', 'uniform:obelisk']);
const byId = id => w.tiles.find(t => t.id === id);
// no world rule: a Domino outfit is worn in the Academy, by a student not graduated
const bs = byId('outfit:black-suit');
assert.deepEqual([bs.equipped, bs.wearable, bs.reason, bs.where], [true, true, '', 'Both worlds']);
assert.deepEqual(bs.equippedIn, [0, 1]); assert.equal(bs.spares, 2);
assert.equal(canWear(kaiba, 'male', 1, rank).ok, true);
// the rank gate stays on the dorm uniforms
assert.equal(byId('uniform:ra').locked, false); assert.equal(byId('uniform:ra').status, 'Unlocked by reaching Ra Yellow');
assert.equal(byId('uniform:obelisk').locked, true); assert.equal(byId('uniform:obelisk').status, 'Reach Obelisk Blue in ranked to unlock');
assert.equal(canWear(byId('uniform:obelisk').item, 'male', 1, rank).reason, 'Reach Obelisk Blue in ranked to unlock.');
// the other body's item: one short line
const t1 = byId('outfit:tea');
assert.deepEqual([t1.wearable, t1.reason, t1.single, t1.otherBody, t1.where], [false, 'Female body only for now.', 'female', true, 'Female body only for now']);
assert.equal(byId('outfit:kaiba').single, 'male'); assert.equal(byId('outfit:kaiba').otherBody, false);
// the selection: the first unlocked tile by default, a focused id when it is there
assert.equal(w.selected.id, 'outfit:black-suit');
assert.equal(wardrobeView(info, { selectedId: 'uniform:ra' }).selected.id, 'uniform:ra');

// Head: hair and accessories; Afro II counts as the Afro worn; glasses worn can be taken off, hair can't
const head = wardrobeView(info, { tab: 'head' });
assert.deepEqual(head.tiles.map(t => [t.id, t.equipped, t.canTakeOff]), [['accessory:sunglasses', true, true], ['hair:afro', true, false]]);
assert.equal(isEquipped(afro, 'male', look), true);
assert.equal(isEquipped(afro, 'female', look), false);   // a look of the other body never matches
assert.deepEqual(takeOffParts(info, head.tiles[0], 1), [...look.slice(0, 9), 0x20, ...look.slice(10)]);
assert.equal(takeOffParts(info, head.tiles[1], 1), null);
assert.equal(wardrobeView(info, { tab: 'dueldisk' }).tiles[0].equipped, true);
assert.equal(head.uniforms.length, 0);

// graduation: a status line only
const grad = { ...rank, graduated: true };
assert.equal(graduationOf(grad).graduated, true); assert.equal(graduationOf(grad).text, 'Graduated');
const g = graduationOf(rank);
assert.deepEqual([g.level, g.levelRequired, g.opponents, g.opponentsRequired, g.levelPct, g.opponentsPct], [12, 20, 5, 25, 60, 20]);
assert.match(g.text, /LV 12\/20 · 5\/25 rivals beaten/);
assert.equal(graduationOf(undefined).levelRequired, 20);

// a beginner: only Slifer Red unlocked
const fresh = { ...info, rank: { bestSchool: 'beginner', uniforms: ['slifer'], graduated: false } };
assert.deepEqual(wardrobeView(fresh).uniforms.map(t => t.locked), [false, true, true]);
assert.equal(wardrobeView(fresh).tabs[1].count, 5);

// the empty wardrobe: the hint, no selection but the earned uniform (outfits tab)
const empty = { ...info, inventory: [] };
w = wardrobeView(empty, { tab: 'head' });
assert.equal(w.empty, true); assert.equal(w.emptyAll, true); assert.equal(w.hint, EMPTY_HINT); assert.equal(w.selected, null);
assert.equal(wardrobeView(empty).selected.id, 'uniform:slifer');

// openWardrobe({ focusId }): the reward's tab; a uniform's appearance parts (the look, the clothes replaced)
assert.equal(tabOfId(info, 'dueldisk:3417'), 'dueldisk'); assert.equal(tabOfId(info, 'hair:afro'), 'head'); assert.equal(tabOfId(info, 'accessory:sunglasses'), 'head');
assert.equal(tabOfId(info, 'uniform:ra'), 'outfit'); assert.equal(tabOfId(info, 'nope'), null);
const ra = uniformItem(SCHOOLS[1]);
assert.deepEqual(uniformParts(info, ra, 0), [...look.slice(0, 6), 0x81, ...look.slice(7)]);
assert.equal(uniformParts({}, ra, 0), null);
// a female character: the female rows decide
const herLook = [1, 5, 0x20, 0, 0x40, 0x60, 0x74, 0x90, 0xb1, 0x20, 0, 0, 0, 0, 0, 0];
const her = { ...info, appearance: { gender: 'female', world: 0, parts: herLook, looks: { 0: herLook, 1: herLook } } };
w = wardrobeView(her);
assert.equal(w.body, 'female');
assert.equal(w.tiles.find(t => t.id === 'outfit:black-suit').equipped, true);   // female 0x74
assert.equal(w.tiles.find(t => t.id === 'outfit:tea').wearable, true);
assert.equal(w.tiles.find(t => t.id === 'outfit:kaiba').wearable, false);
assert.equal(wardrobeView(her, { tab: 'head' }).tiles.find(t => t.id === 'hair:afro').equipped, true);       // female Afro 0x5
// the bust's try-on (previewOf): the saved look with the item's own row put on; worn / refused / locked: unchanged
const pv = item => previewOf(info, tileOf(item, info, 1), 1);
assert.deepEqual(pv(jaden), { parts: [...look.slice(0, 6), 0x87, ...look.slice(7)], saved: look, state: 'preview' });
assert.equal(pv(suit).state, 'wearing');
assert.deepEqual(pv(kaiba).parts[6], 0x7a, 'a Domino outfit tried on in the Academy');
assert.deepEqual([pv(tea).state, pv(tea).parts], ['cant', look], 'the other body\'s item: unchanged');
assert.deepEqual(pv(afro).parts[1], 0xb, 'Afro worn (Afro II): wearing');
const obeliskT = tileOf(uniformItem(SCHOOLS[2]), info, 1), raT = tileOf(uniformItem(SCHOOLS[1]), info, 1);
assert.equal(previewOf(info, obeliskT, 1).state, 'cant');
assert.equal(previewOf(info, raT, 1).parts[6], 0x81);
assert.deepEqual(previewOf(info, null, 0), { parts: look, saved: look, state: 'wearing' });
// no saved look yet: the default one of the body
assert.deepEqual(previewOf({ ...info, appearance: { gender: 'female', world: 0, looks: {} } }, null, 1).parts, defaultLook('female', 1));
console.log('wardrobe_test: ok');
