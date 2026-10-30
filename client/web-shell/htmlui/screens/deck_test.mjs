// screens/deck.js without a browser: tag runs, the draw plan, passthrough holes.   node screens/deck_test.mjs
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
// web-shell/ui.js is client/html-ui/ui.js (serve.mjs and the ship map it there)
registerHooks({ resolve: (spec, ctx, next) => spec.endsWith('/ui.js')
  ? { ...next(new URL('../../../html-ui/ui.js', import.meta.url).href, ctx), format: 'module' } : next(spec, ctx) });
const { runs, plan, clip, passthrough, artName } = await import('./deck.js');

// AtConverter: @digit colours, @@ a literal @, @>N/ moves the pen (and survives a colour tag right after it)
assert.deepEqual(runs('@942'), [{ s: '42', rgb: 0xffffff, x: null }]);
assert.deepEqual(runs('a@@b'), [{ s: 'a@b', rgb: 0, x: null }]);
assert.deepEqual(runs('@>64/@2Name'), [{ s: 'Name', rgb: 0x2222ff, x: 64 }]);
assert.deepEqual(runs('@1 3@9/40'), [{ s: ' 3', rgb: 0xff0000, x: null }, { s: '/40', rgb: 0xffffff, x: null }]);

assert.equal(artName('data/deck/deck_moji_01_?.png'), 'deck_moji_01_e.png');
assert.ok(passthrough({ tex: 'data/MINI/4007.png' }) && !passthrough({ id: 1, cls: 'CWindowTaskDeckBar' }) && !passthrough({ tex: 'data/deck/x.png' }));

// a deck panel: the bar sprite (control depth 26) clear of two overlapping cards (art passthrough, depth 2 and 3), a
// limit icon over card 1, a frame under both cards (co-drawn: the engine draws it too, under the art's hole)
const sp = (tex, wx, wy, z, w, h, more = {}) => ({ id: wx * 1000 + wy + z, tex, src: [0, 0, w, h], wx, wy, z, sx: 1, sy: 1, rgba: [1, 1, 1, 1], shown: true, ...more });
const win = { id: 1, cls: 'CWindowModelDeck', x: 248, y: 0, w: 488, h: 712, ex: 0, ey: 0, extras: [], controls: [
  { id: 2, cls: 'CWindowTaskDeckBar', x: 0, y: 0, z: 26, shown: true, parts: { sprites: [sp('data/deck/deckbar_01_c02.png', 248, 0, 0, 8, 88)] } },
  { id: 6, cls: 'CWindowTaskFrameThin', x: 256, y: 88, w: 472, h: 400, z: 1, shown: true, parts: { sprites: [sp('data/common/window/window_base_01_c01.png', 256, 88, 0, 8, 8, { id: 66, sx: 59, sy: 50 })] } },
  { id: 3, cls: 'CWindowTaskDeckCard', x: 262, y: 96, z: 2, shown: true,
    parts: { sprites: [sp('data/MINI/1.png', 262, 96, 0, 50, 72), sp('data/common/icon/icon_seigen_01.png', 262, 96, 1, 16, 16, { id: 77 })] } },
  { id: 4, cls: 'CWindowTaskDeckCard', x: 290, y: 96, z: 3, shown: true,
    parts: { sprites: [sp('data/MINI/2.png', 290, 96, 0, 50, 72), sp('data/x.png', 0, 0, 9, 8, 8, { shown: false })] } },
  { id: 7, cls: 'CWindowTaskTextField', x: 8, y: 88, w: 100, h: 16, z: 5, shown: true },   // drawn by controls/, moved by ex - x
  { id: 5, cls: 'CWindowTaskFrameThin', x: 9999, y: 0, w: 10, h: 10, z: 1, shown: true },   // parked = hidden
] };
const p = plan(win, c => c.cls === 'CWindowTaskTextField');
assert.deepEqual(p.items.map(i => i.id), [66, 77, 7, 248000]);   // frame, limit icon, text field, bar
assert.deepEqual(p.holes.map(h => [h.z, h.rect.x]), [[2, 262], [3, 290]]);
assert.deepEqual(p.co, [66]);   // only the frame is under a card face
assert.deepEqual(p.items[2].rect, { x: 8, y: 88, w: 100, h: 16 });   // window-local 8 -> screen 8, not 256
assert.equal(clip(p.items[1], p.holes, 248, 0), '');   // the limit icon is in front of card 1, clear of card 2
assert.match(clip(p.items[0], p.holes, 248, 0), /M14 96h50v72h-50z/);   // the frame, around card 1's face
const drag = { z: 4500, rect: { x: 250, y: 10, w: 50, h: 72 } };   // a card dragged over the bar punches through it
assert.match(clip(p.items[3], [...p.holes, drag], 248, 0), /M2 10h50v72h-50z/);
assert.ok(passthrough({ id: 9, name: 'SwapIconToMain', x: 0, y: 0, z: 0, wx: 1, wy: 1, shown: true }));   // a swf part
console.log('deck_test ok');
