// screens/deck.js without a browser: tag runs, the draw plan, passthrough holes.   node screens/deck_test.mjs
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
// web-shell/ui.js is client/html-ui/ui.js (serve.mjs and the ship map it there)
registerHooks({ resolve: (spec, ctx, next) => spec.endsWith('/ui.js')
  ? { ...next(new URL('../../../html-ui/ui.js', import.meta.url).href, ctx), format: 'module' } : next(spec, ctx) });
const { runs, plan, clip, union, passthrough, artName, quickMove, DROP_DECK, DROP_TRUNK } = await import('./deck.js');

// AtConverter: @digit colours, @@ a literal @, @>N/ moves the pen (and survives a colour tag right after it)
assert.deepEqual(runs('@942'), [{ s: '42', rgb: 0xffffff, x: null }]);
assert.deepEqual(runs('a@@b'), [{ s: 'a@b', rgb: 0, x: null }]);
assert.deepEqual(runs('@>64/@2Name'), [{ s: 'Name', rgb: 0x2222ff, x: 64 }]);
assert.deepEqual(runs('@1 3@9/40'), [{ s: ' 3', rgb: 0xff0000, x: null }, { s: '/40', rgb: 0xffffff, x: null }]);

assert.equal(artName('data/deck/deck_moji_01_?.png'), 'deck_moji_01_e.png');
assert.ok(passthrough({ tex: 'data/MINI/4007.png' }) && !passthrough({ id: 1, cls: 'CWindowTaskDeckBar' }) && !passthrough({ tex: 'data/deck/x.png' }));

// a deck panel as the live snapshot has it: control depths 0, parts with world positions and world z. The bar clear of
// two overlapping cards (art passthrough, wz 51205 / 51206), a limit icon over card 1, a back plane under both cards
// (co-drawn: the engine draws it too, under the art's hole), a button (its <button> over its art)
const sp = (id, tex, wx, wy, wz, w, h, more = {}) => ({ id, tex, src: [0, 0, w, h], wx, wy, wz, sx: 1, sy: 1, rgba: [1, 1, 1, 1], shown: true, ...more });
const ctl = (id, cls, parts, more = {}) => ({ id, cls, x: 0, y: 0, w: 0, h: 0, z: 0, shown: true, parts, ...more });
const win = { id: 1, cls: 'CWindowModelDeck', x: 248, y: 0, w: 488, h: 712, extras: [], controls: [
  ctl(2, 'CWindowTaskDeckBar', { sprites: [sp(20, 'data/deck/deckbar_01_c02.png', 248, 0, 51229, 8, 88)] }),
  ctl(6, 'CWindowTaskBackPlane', { sprites: [sp(60, 'data/common/window/window_base_01_c01.png', 256, 88, 51204, 8, 8, { sx: 59, sy: 66 })] }),
  ctl(3, 'CWindowTaskDeckCard', { sprites: [sp(30, 'data/MINI/1.png', 262, 96, 51205, 50, 72), sp(31, 'data/common/icon/icon_seigen_01.png', 262, 96, 51207, 16, 16)] }),
  ctl(4, 'CWindowTaskDeckCard', { sprites: [sp(40, 'data/MINI/2.png', 290, 96, 51206, 50, 72), sp(41, 'data/x.png', 0, 0, 0, 8, 8, { shown: false })] }),
  ctl(7, 'CWindowTaskTextSwitch', { sprites: [sp(70, 'data/common/window/swich_01_c00.png', 300, 600, 51300, 96, 24)] }, { label: 'OK', state: 'hover', enabled: true }),
  ctl(5, 'CWindowTaskFrameThin', { sprites: [sp(50, 'data/x.png', 9999, 0, 1, 8, 8)] }, { x: 9999 }),   // parked = hidden
] };
const p = plan(win);
assert.deepEqual(p.items.map(i => i.id), [60, 31, 20, 70, 7]);   // plane, limit icon, bar, button art, <button>
assert.deepEqual(p.holes.map(h => [h.z, h.rect.x]), [[51205, 262], [51206, 290]]);
assert.deepEqual(p.co, [60]);   // only the plane is under a card face
assert.deepEqual(p.items[4].rect, { x: 300, y: 600, w: 96, h: 24 });
assert.equal(clip(p.items[1], p.holes, 248, 0), '');   // the limit icon is in front of card 1, clear of card 2
assert.match(clip(p.items[0], p.holes, 248, 0), /M14 96h28v72h-28zM42 96h22v72h-22zM64 96h28v72h-28z/);   // the plane, around both faces (disjoint slabs)
const drag = { z: 1e5, rect: { x: 250, y: 10, w: 50, h: 72 } };   // a card dragged over the bar punches through it
assert.match(clip(p.items[2], [...p.holes, drag], 248, 0), /M2 10h50v72h-50z/);
assert.ok(passthrough({ id: 9, name: 'SwapIconToMain', x: 0, y: 0, z: 0, wx: 1, wy: 1, shown: true }));   // a swf part
// overlapping holes (fanned cards) become disjoint rects: none cancels another under evenodd
assert.deepEqual(union([{ x: 0, y: 0, w: 50, h: 72 }, { x: 28, y: 0, w: 50, h: 72 }]),
  [{ x: 0, y: 0, w: 28, h: 72 }, { x: 28, y: 0, w: 22, h: 72 }, { x: 50, y: 0, w: 28, h: 72 }]);
assert.deepEqual(union([{ x: 0, y: 0, w: 10, h: 10 }, { x: 0, y: 20, w: 10, h: 10 }]), [{ x: 0, y: 0, w: 10, h: 10 }, { x: 0, y: 20, w: 10, h: 10 }]);
// click to add / remove: what a right-click at (x, y) moves. A trunk row anywhere (the press lands on its picture, a
// Fusion flagged for the Extra deck); the deck's fanned cards: the one on top under the pointer
const kaban = { cls: 'CWindowModelKaban', controls: [
  ctl(80, 'CWindowTaskKabanListBtn', { sprites: [sp(81, 'data/MINI/9.png', 760, 92, 51130, 25, 36, { sx: 1, sy: 1 })] },
    { card: 9, color: 6, wx: 744, wy: 88, w: 256, h: 56 })] };
const deckw = { cls: 'CWindowModelDeck', controls: [
  ctl(90, 'CWindowTaskDeckCard', { sprites: [sp(91, 'data/MINI/1.png', 262, 96, 51205, 50, 72)] }, { card: 1 }),
  ctl(92, 'CWindowTaskDeckCard', { sprites: [sp(93, 'data/MINI/2.png', 290, 96, 51206, 50, 72)] }, { card: 2 })] };
assert.deepEqual(quickMove([kaban, deckw], 900, 120), { press: [772.5, 110], drop: DROP_DECK, card: 9, fusion: true });
assert.deepEqual(quickMove([kaban, deckw], 765, 100), { press: [765, 100], drop: DROP_DECK, card: 9, fusion: true });
assert.deepEqual(quickMove([kaban, deckw], 300, 120), { press: [300, 120], drop: DROP_TRUNK, card: 2, fusion: false });
assert.deepEqual(quickMove([kaban, deckw], 270, 120).card, 1);
assert.equal(quickMove([kaban, deckw], 600, 500), null);
console.log('deck_test ok');
