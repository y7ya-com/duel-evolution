// node client/web-shell/htmlui/cosmetics/wardrobe_test.mjs: the Wardrobe's view model (cosmetics/wardrobe-model.js) on a
// state shaped like the server's (server/src/game/cosmetics.ts state(): inventory, appearance per world, rank): the
// tabs and counts, equipped per world, the body and world rules with their reasons, graduation, the rank uniforms,
// spares, the empty state, the focus tab and a uniform's parts. Exit 1 on the first failure.
import assert from 'node:assert/strict';
import { wardrobeView, canWear, isEquipped, tileOf, tabOfId, uniformParts, graduationOf, uniformItem, SCHOOLS, EMPTY_HINT } from './wardrobe-model.js';

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
// male; Domino look: Black Suit, Afro II (a merged size), Alpha Gold; Academy look: Slifer Red uniform, default disk
const domino = [0, 0xb, 0x20, 0, 0x40, 0x60, 0x77, 0x90, 0xb4, 0x50, 0, 0, 0, 0, 0, 0];
const academy = [0, 0, 0x20, 0, 0x40, 0x60, 0x80, 0x90, 0xb8, 0x20, 0, 0, 0, 0, 0, 0];
const rank = { bestSchool: 'ra', uniforms: ['slifer', 'ra'], graduated: false, graduationLevel: 20,
  graduation: { level: 12, levelRequired: 20, opponents: 5, opponentsRequired: 25 } };
const info = { inventory: [suit, jaden, kaiba, tea, afro, sun, gold], rank,
  appearance: { gender: 'male', world: 1, parts: academy, looks: { 0: domino, 1: academy } } };

// tabs: counts (outfits + the earned uniforms: Slifer and Ra), the current world by default (the Academy here)
let w = wardrobeView(info);
assert.equal(w.world, 1); assert.equal(w.body, 'male'); assert.equal(w.tab, 'outfit');
assert.deepEqual(w.tabs.map(t => [t.id, t.count]), [['outfit', 6], ['hair', 1], ['accessory', 1], ['dueldisk', 1]]);
// outfits: wearable here first (Jaden), then the Domino-only ones, rarest first; the uniforms after them
assert.deepEqual(w.items.map(t => t.id), ['outfit:jaden', 'outfit:tea', 'outfit:kaiba', 'outfit:black-suit']);
assert.deepEqual(w.uniforms.map(t => t.id), ['uniform:slifer', 'uniform:ra', 'uniform:obelisk']);
const byId = id => w.tiles.find(t => t.id === id);
assert.equal(byId('uniform:slifer').equipped, true);           // the Academy look wears 0x80
assert.equal(byId('uniform:ra').locked, false); assert.equal(byId('uniform:ra').status, 'Unlocked by reaching Ra Yellow');
assert.equal(byId('uniform:obelisk').locked, true); assert.equal(byId('uniform:obelisk').status, 'Reach Obelisk Blue in ranked Autoduel to unlock');
assert.match(canWear(byId('uniform:obelisk').item, 'male', 1, rank).reason, /^Locked: reach Obelisk Blue/);
// Domino outfits in the Academy: not before graduating, with the reason
const bs = byId('outfit:black-suit');
assert.equal(bs.wearable, false); assert.match(bs.reason, /outside Duel Academy until you graduate/);
assert.deepEqual(bs.equippedIn, [0]); assert.equal(bs.equipped, false);   // worn in Domino, not here
assert.equal(bs.spares, 2); assert.equal(bs.where, 'Domino City');
// a female-only item on a male character: its notice; a male-only one is fine for him
const t1 = byId('outfit:tea');
assert.equal(t1.wearable, false); assert.equal(t1.reason, tea.notice); assert.equal(t1.single, 'female'); assert.equal(t1.otherBody, true);
assert.equal(t1.where, '♀ only for now');
assert.equal(byId('outfit:kaiba').single, 'male'); assert.equal(byId('outfit:kaiba').otherBody, false);
// the selection: the first unlocked tile by default, a focused id when it is there
assert.equal(w.selected.id, 'outfit:jaden');
assert.equal(wardrobeView(info, { selectedId: 'uniform:ra' }).selected.id, 'uniform:ra');

// Domino City: the suit is worn and wearable; Afro II counts as the Afro worn; the uniforms are wearable everywhere
w = wardrobeView(info, { world: 0 });
assert.equal(w.tiles.find(t => t.id === 'outfit:black-suit').equipped, true);
assert.equal(w.items[0].id, 'outfit:black-suit');   // the equipped one first
assert.equal(isEquipped(afro, 'male', domino), true);
assert.equal(isEquipped(afro, 'female', domino), false);   // a look of the other body never matches
const hair = wardrobeView(info, { world: 0, tab: 'hair' });
assert.deepEqual(hair.tiles.map(t => [t.id, t.equipped, t.wearable]), [['hair:afro', true, true]]);
assert.equal(hair.uniforms.length, 0);
assert.equal(wardrobeView(info, { world: 0, tab: 'dueldisk' }).tiles[0].equipped, true);
assert.equal(wardrobeView(info, { world: 1, tab: 'dueldisk' }).tiles[0].equipped, false);
assert.equal(wardrobeView(info, { world: 1, tab: 'dueldisk' }).tiles[0].where, 'Both worlds');

// graduated: any owned outfit in either world
const grad = { ...rank, graduated: true };
assert.equal(canWear(suit, 'male', 1, grad).ok, true);
assert.equal(tileOf(suit, { ...info, rank: grad }, 1).where, 'Both worlds');
assert.equal(canWear(sun, 'male', 1, grad).ok, true);
assert.equal(graduationOf(grad).graduated, true); assert.match(graduationOf(grad).text, /^Graduated/);
const g = graduationOf(rank);
assert.deepEqual([g.level, g.levelRequired, g.opponents, g.opponentsRequired, g.levelPct, g.opponentsPct], [12, 20, 5, 25, 60, 20]);
assert.match(g.text, /LV 12\/20 · 5\/25 different opponents/);
assert.equal(graduationOf(undefined).levelRequired, 20);

// a beginner: only Slifer Red unlocked
const fresh = { ...info, rank: { bestSchool: 'beginner', uniforms: ['slifer'], graduated: false } };
assert.deepEqual(wardrobeView(fresh).uniforms.map(t => t.locked), [false, true, true]);
assert.equal(wardrobeView(fresh).tabs[0].count, 5);

// the empty wardrobe: the hint, no selection but the earned uniform (outfits tab)
const empty = { ...info, inventory: [] };
w = wardrobeView(empty, { tab: 'hair' });
assert.equal(w.empty, true); assert.equal(w.emptyAll, true); assert.equal(w.hint, EMPTY_HINT); assert.equal(w.selected, null);
assert.equal(EMPTY_HINT, 'Open boxes in the Card Shop to get wearables.');
assert.equal(wardrobeView(empty).selected.id, 'uniform:slifer');

// openWardrobe({ focusId }): the reward's tab; a uniform's appearance parts (the world's look, the clothes replaced)
assert.equal(tabOfId(info, 'dueldisk:3417'), 'dueldisk'); assert.equal(tabOfId(info, 'uniform:ra'), 'outfit'); assert.equal(tabOfId(info, 'nope'), null);
const ra = uniformItem(SCHOOLS[1]);
assert.deepEqual(uniformParts(info, ra, 0), [0, 0xb, 0x20, 0, 0x40, 0x60, 0x81, 0x90, 0xb4, 0x50, 0, 0, 0, 0, 0, 0]);
assert.equal(uniformParts({}, ra, 0), null);
// a female character: the female rows decide
const her = { ...info, appearance: { gender: 'female', world: 0, parts: [1, 5, 0x20, 0, 0x40, 0x60, 0x74, 0x90, 0xb1, 0x20, 0, 0, 0, 0, 0, 0],
  looks: { 0: [1, 5, 0x20, 0, 0x40, 0x60, 0x74, 0x90, 0xb1, 0x20, 0, 0, 0, 0, 0, 0], 1: academy } } };
w = wardrobeView(her);
assert.equal(w.world, 0); assert.equal(w.body, 'female');
assert.equal(w.tiles.find(t => t.id === 'outfit:black-suit').equipped, true);   // female 0x74
assert.equal(w.tiles.find(t => t.id === 'outfit:tea').wearable, true);
assert.equal(w.tiles.find(t => t.id === 'outfit:kaiba').wearable, false);
assert.equal(wardrobeView(her, { tab: 'hair' }).tiles[0].equipped, true);       // female Afro 0x5
console.log('wardrobe_test: ok');
