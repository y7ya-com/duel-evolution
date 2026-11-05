// node client/web-shell/htmlui/cosmetics/wardrobe_test.mjs: the Wardrobe's view model (cosmetics/wardrobe-model.js) on a
// state shaped like the server's (server/src/game/cosmetics.ts state(): inventory, appearance per world, rank): the
// three tabs and counts, one look worn everywhere (no world rule), the body rule and the uniforms' rank gate with
// their short reasons, take-off, graduation as a status, spares, the empty state, the focus tab and a uniform's parts. Exit 1 on the first failure.
import assert from 'node:assert/strict';
import { wardrobeView, wornRows, subOf, shortName, thumbOf, SUBS, canWear, isEquipped, tileOf, tabOfId, uniformParts, graduationOf, uniformItem, SCHOOLS, EMPTY_HINT, previewOf, defaultLook, takeOffParts } from './wardrobe-model.js';

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

// tabs: Hair (the Afro), Face (the Sunglasses: glasses), Outfit (+ the earned uniforms: Slifer and Ra), Disk
let w = wardrobeView(info);
assert.equal(w.body, 'male'); assert.equal(w.tab, 'outfit');
assert.deepEqual(w.tabs.map(t => [t.id, t.label, t.count]), [['hair', 'Hair', 1], ['face', 'Face', 1], ['outfit', 'Outfit', 6], ['dueldisk', 'Disk', 1]]);
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

// Hair: the front hair (Afro II counts as the Afro worn); Face: the glasses, worn, can be taken off; hair can't
const head = wardrobeView(info, { tab: 'hair' }), glasses = wardrobeView(info, { tab: 'face' });
assert.equal(head.sub, 'front'); assert.deepEqual(head.subs, []);   // one sub-category with items: no row
assert.equal(glasses.sub, 'glasses');
head.tiles.unshift(glasses.tiles[0]);
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
assert.equal(wardrobeView(fresh).tabs.find(t => t.id === 'outfit').count, 5);

// the empty wardrobe: the hint, no selection but the earned uniform (outfits tab)
const empty = { ...info, inventory: [] };
w = wardrobeView(empty, { tab: 'hair' });
assert.equal(w.empty, true); assert.equal(w.emptyAll, true); assert.equal(w.hint, EMPTY_HINT); assert.equal(w.selected, null);
assert.equal(wardrobeView(empty).selected.id, 'uniform:slifer');

// openWardrobe({ focusId }): the reward's tab; a uniform's appearance parts (the look, the clothes replaced)
assert.equal(tabOfId(info, 'dueldisk:3417'), 'dueldisk'); assert.equal(tabOfId(info, 'hair:afro'), 'hair'); assert.equal(tabOfId(info, 'accessory:sunglasses'), 'face');
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
assert.equal(wardrobeView(her, { tab: 'hair' }).tiles.find(t => t.id === 'hair:afro').equipped, true);       // female Afro 0x5
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
// The model exposes the early Slifer outfit lock independently of rank-uniform ownership.
const level1 = { ...info, rank: { ...rank, graduation: { level: 1 } } };
assert.equal(wardrobeView(level1).outfitLocked, true);
assert.equal(tileOf(suit, level1, 1).wearable, false);
assert.equal(wardrobeView({ ...level1, rank: { ...rank, graduation: { level: 5 } } }).outfitLocked, false);
assert.equal(tileOf(uniformItem(SCHOOLS[0]), level1, 1).outfitLocked, true);
console.log('wardrobe_test: ok');

const beginner = { ...info, outfitLocked: true, rank: { ...rank, graduation: { ...rank.graduation, level: 4 } } };
const bw = wardrobeView(beginner);
assert.equal(bw.outfitLocked, true);
assert.equal(bw.tiles.find(t => t.id === suit.id).wearable, false);
assert.match(bw.tiles.find(t => t.id === suit.id).reason, /level 5/);
assert.equal(bw.uniforms.find(t => t.school === 'slifer').wearable, true);
assert.equal(defaultLook('male', 0)[6], 128);
assert.equal(defaultLook('female', 0)[6], 128);
assert.equal(wardrobeView({ ...beginner, outfitLocked: false, rank: { ...rank, graduation: { ...rank.graduation, level: 5 } } }).tiles.find(t => t.id === suit.id).wearable, true);

const freeHair = { ...afro, id: 'free:hair', name: 'Free Hair', free: true, rarity: null };
const freeFace = { ...freeHair, id: 'free:eyes', name: 'Cold Eyes', kind: 'face', slot: 4, variants: [v('male', 65, [0, 1])], bodies: ['male'] };
const withFree = { ...info, inventory: [...info.inventory, freeHair, freeFace] };
assert.deepEqual(wardrobeView(withFree, { tab: 'hair' }).items.map(t => [t.id, t.equipped]), [['hair:afro', true], [freeHair.id, false]], 'one equipped per sub-category');
assert.equal(wardrobeView(withFree, { tab: 'face' }).items[0].free, true);
assert.equal(tabOfId(withFree, freeFace.id), 'face');
const freeSlifer = { ...uniformItem(SCHOOLS[0]), free: true, rarity: null, owned: true };
const withSlifer = { ...withFree, inventory: [...withFree.inventory, freeSlifer] };
assert.equal(wardrobeView(withSlifer).tiles.filter(t => t.id === 'uniform:slifer').length, 1);
assert.equal(wardrobeView(withSlifer).tabs.find(t => t.id === 'outfit').count, 6);
assert.equal(wardrobeView({ ...withSlifer, outfitLocked: true }).tiles.find(t => t.id === 'uniform:slifer').wearable, true);

// the editor's categories: sub-categories by look byte, short names under them, one row per category worn
const F = (id, name, slot, kind, number) => ({ id, name, slot, kind, free: true, rarity: null, owned: true, bodies: ['male'], variants: [v('male', number, [0, 1])] });
const parts = [F('free:15:0', 'Eye Colour: Brown', 15, 'face', 0), F('free:15:2', 'Eye Colour: Black', 15, 'face', 2), F('free:part:3290', 'Mouth: Default', 5, 'face', 0x60),
  F('free:part:3280', 'Eyes: Default', 4, 'face', 0x40), F('free:13:0', 'Skin Tone 1', 13, 'face', 0), F('free:14:0', 'Hair Colour: Brown', 14, 'hair', 0),
  F('free:part:3270', 'Back Hair: Ponytail', 7, 'hair', 0x91), F('free:none:9', 'No Glasses', 9, 'accessory', 0x20), F('free:part:3400', 'None', 2, 'accessory', 0x20)];
const ed = { ...info, inventory: [...info.inventory, ...parts] };
assert.deepEqual(SUBS.filter(s => s.tab === 'face').map(s => s.label), ['Eyes', 'Eye colour', 'Nose', 'Mouth', 'Skin', 'Accessories', 'Glasses']);
assert.deepEqual(SUBS.filter(s => s.tab === 'hair').map(s => s.label), ['Front', 'Back', 'Colour']);
const face = wardrobeView(ed, { tab: 'face' });
assert.deepEqual(face.subs.map(s => [s.id, s.count]), [['eyes', 1], ['eyecolour', 2], ['mouth', 1], ['skin', 1], ['accessory', 1], ['glasses', 2]]);
assert.equal(face.sub, 'eyes');
const ec = wardrobeView(ed, { tab: 'face', sub: 'eyecolour' });
assert.deepEqual(ec.tiles.map(t => [t.name, t.equipped]), [['Brown', true], ['Black', false]], 'the prefix dropped; look[15] = 0 is Brown');
assert.equal(wardrobeView(ed, { tab: 'face', selectedId: 'free:part:3290' }).sub, 'mouth', 'a selected item opens its sub-category');
assert.equal(shortName(parts[2]), 'Default'); assert.equal(shortName(parts[4]), 'Tone 1'); assert.equal(shortName(sun), sun.name);
assert.equal(subOf(sun).id, 'glasses'); assert.equal(subOf(afro).id, 'front'); assert.equal(subOf(parts[6]).id, 'back');
// glasses: the sunglasses are worn, so No Glasses is not; a look with no glasses (0) wears No Glasses
assert.deepEqual(wardrobeView(ed, { tab: 'face', sub: 'glasses' }).tiles.map(t => [t.id, t.equipped]), [['accessory:sunglasses', true], ['free:none:9', false]]);
const bare = [...look]; bare[9] = 0;
const edBare = { ...ed, appearance: { ...ed.appearance, parts: bare, looks: { 0: bare, 1: bare } } };
assert.equal(wardrobeView(edBare, { tab: 'face', sub: 'glasses' }).tiles.find(t => t.id === 'free:none:9').equipped, true);
// wearing now: one row per category, the tabs' order
const rows = wornRows(ed, { world: 1 });
assert.deepEqual(rows.map(r => r.sub.row), ['Front hair', 'Back hair', 'Hair colour', 'Eyes', 'Eye colour', 'Nose', 'Mouth', 'Skin', 'Accessory', 'Glasses', 'Outfit', 'Disk']);
assert.deepEqual(rows.map(r => r.tile?.name ?? null), ['afro', null, 'Brown', 'Default', 'Brown', null, 'Default', 'Tone 1', 'None', 'sunglasses', 'black-suit', '3417']);
// thumbnails: framed on the part; the colours with a chip; premium items keep their art
assert.deepEqual(thumbOf(parts[0]).steps, [5]); assert.match(thumbOf(parts[0]).chip, /^#[0-9a-f]{6}$/);
assert.equal(thumbOf(parts[2]).chip, null); assert.equal(thumbOf(sun).kind, 'art'); assert.equal(thumbOf(freeSlifer).kind, 'art');
assert.equal(wardrobeView(ed, { tab: 'face', sub: 'accessory' }).tiles[0].canTakeOff, false, 'no Take off for None');
console.log('wardrobe_test: categories ok');
