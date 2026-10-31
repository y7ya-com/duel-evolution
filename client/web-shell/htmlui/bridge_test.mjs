// bridge.js without a browser: the clip paths a window root gets where an engine window stands in front.
//   node client/web-shell/htmlui/bridge_test.mjs
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
// web-shell/ui.js is client/html-ui/ui.js (serve.mjs and the ship map it there)
registerHooks({ resolve: (spec, ctx, next) => spec.endsWith('/ui.js')
  ? { ...next(new URL('../../html-ui/ui.js', import.meta.url).href, ctx), format: 'module' } : next(spec, ctx) });
const { clip, drawOrder } = await import('./bridge.js');

// the deck's Save list (164, 312, 696 x 144; its rows and buttons go on below that) under the overwrite confirm
const list = { x: 164, y: 312, w: 696, h: 144 }, confirm = { x: 344, y: 312, w: 336, h: 144 };
assert.equal(clip([confirm], list), 'path(evenodd, "M0 0h696v144h-696zM180 0h336v144h-336z")');   // a clipped window: its rect
// an unclipped one (clip: false): the whole screen less the confirm, so what it draws below its rect stays
assert.equal(clip([confirm], { x: 0, y: 0, w: 1024, h: 768 }, list), 'path(evenodd, "M-164 -312h1024v768h-1024zM180 0h336v144h-336z")');
assert.equal(clip([], list), '');
// overlapping holes merge (evenodd would cancel their overlap)
assert.equal(clip([{ x: 0, y: 0, w: 10, h: 10 }, { x: 5, y: 5, w: 10, h: 10 }], { x: 0, y: 0, w: 100, h: 100 }),
  'path(evenodd, "M0 0h100v100h-100zM0 0h15v15h-15z")');
// back to front: window z, then the frontmost drawn world z, then the list's order
assert.deepEqual(drawOrder([{ id: 1, z: 51353 }, { id: 2, z: 51153, wz: 9 }, { id: 3, z: 51153, wz: 5 }]).map(w => w.id), [3, 2, 1]);
console.log('bridge_test ok');
