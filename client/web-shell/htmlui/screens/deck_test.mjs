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
assert.ok(passthrough({ tex: 'data/MINI/4007.png' }) && passthrough({ cls: 'CSwfEngine' }) && !passthrough({ tex: 'data/deck/x.png' }));

// a deck panel: the bar sprite (z 26) under two overlapping cards (art passthrough z 2, 3) and a limit icon on card 1
const sp = (tex, wx, wy, wz, w, h, more = {}) => ({ tex, src: [0, 0, w, h], wx, wy, wz, sx: 1, sy: 1, rgba: [1, 1, 1, 1], shown: true, ...more });
const win = { id: 1, cls: 'CWindowModelDeck', x: 0, y: 0, w: 336, h: 144, controls: [
  { id: 2, cls: 'CWindowTaskDeckBar', x: 248, y: 0, w: 0, h: 0, z: 26, shown: true, sprites: [sp('data/deck/deckbar_01_c02.png', 248, 0, 26, 8, 88)] },
  { id: 3, cls: 'CWindowTaskDeckCard', x: 262, y: 96, w: 50, h: 72, z: 2, shown: true,
    sprites: [sp('data/MINI/1.png', 262, 96, 2, 50, 72), sp('data/common/icon/icon_seigen_01.png', 262, 96, 2.5, 16, 16)] },
  { id: 4, cls: 'CWindowTaskDeckCard', x: 290, y: 96, w: 50, h: 72, z: 3, shown: true,
    sprites: [sp('data/MINI/2.png', 290, 96, 3, 50, 72), sp('data/x.png', 0, 0, 9, 8, 8, { shown: false })] },
  { id: 5, cls: 'CWindowTaskFrameThin', x: 9999, y: 0, w: 10, h: 10, z: 1, shown: true },   // parked = hidden
] };
const p = plan(win, c => c.cls === 'CWindowTaskFrameThin');
assert.deepEqual(p.items.map(i => i.z), [2.5, 26]);   // limit icon, bar; the art and hidden / parked parts are not drawn
assert.deepEqual(p.holes.map(h => [h.z, h.rect.x]), [[2, 262], [3, 290]]);
// the limit icon (z 2.5, 262..278) sits over card 1 (z 2): no hole; card 2 starts at 290: no overlap either
assert.equal(clip(p.items[0], p.holes, 0, 0), '');
// a card dragged over the bar (z 4500) punches through it
const drag = { z: 4500, rect: { x: 250, y: 10, w: 50, h: 72 } };
assert.match(clip(p.items[1], [...p.holes, drag], 0, 0), /M250 10h50v72h-50z/);
console.log('deck_test ok');
