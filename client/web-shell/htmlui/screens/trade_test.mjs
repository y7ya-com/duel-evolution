// screens/trade.js without a browser: skin pieces as CSS, the corner cut, the draw plan (holes, kept art, buttons)
// on mock/trade-swap.json.   node screens/trade_test.mjs
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { registerHooks } from 'node:module';
// web-shell/ui.js is client/html-ui/ui.js (serve.mjs and the ship map it there)
registerHooks({ resolve: (spec, ctx, next) => spec.endsWith('/ui.js')
  ? { ...next(new URL('../../../html-ui/ui.js', import.meta.url).href, ctx), format: 'module' } : next(spec, ctx) });
const { pieceCss, cornerClip, plan, isSkin, default: mod } = await import('./trade.js');

// a synthetic 8 x 8 sheet (no game art): rows of colour (a top edge), columns (a side), a flat plane, a corner
const sheet = f => { const px = new Uint8ClampedArray(8 * 8 * 4); for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) px.set(f(x, y), 4 * (8 * y + x)); return { w: 8, h: 8, px }; };
const rows = pieceCss(sheet((x, y) => y < 3 ? [255, 255, 255, 255] : [204, 204, 203, 255]), [0, 0, 8, 8]);
assert.equal(rows.bg, 'linear-gradient(to bottom, rgb(255 255 255) 0.000% 37.500%, rgb(204 204 203) 37.500% 100.000%)');
assert.match(pieceCss(sheet(x => x ? [0, 0, 0, 255] : [255, 0, 0, 255]), [0, 0, 8, 8]).bg, /^linear-gradient\(to right, rgb\(255 0 0\) 0\.000% 12\.500%/);
// the drawn colour multiplies (a back plane's 0.5 grey), the alpha stays the texel's
assert.equal(pieceCss(sheet(() => [255, 255, 255, 255]), [0, 0, 8, 8], [0.5, 0.5, 0.5, 1]).bg, 'rgb(128 128 128)');
// a bottom-right corner: a 45-degree staircase of transparent texels -> an SVG and a diagonal clip
const corner = pieceCss(sheet((x, y) => x + y < 11 ? [160, 160, 160, 255] : [255, 255, 255, 0]), [0, 0, 8, 8]);
assert.match(corner.bg, /^url\("data:image\/svg\+xml/);
assert.match(corner.clip, /^polygon\(/);
assert.equal(cornerClip(Array.from({ length: 8 }, () => Array(8).fill(255)), 8, 8), '');
assert.ok(isSkin('data/skin/window_base_01_c07.png') && !isSkin('data/deck/deck_carddai_01_c04.png'));

// Card Swap: the areas' frames and planes are CSS items, the cards and the lamp are holes, the switches are buttons
const snap = JSON.parse(readFileSync(new URL('../mock/trade-swap.json', import.meta.url)));
const [, partner, mine, model] = snap.windows;
const pa = plan(partner), pm = plan(mine), pt = plan(model);
assert.equal(pa.items.length, 15);   // 14 frame pieces + the plane (its switches hidden)
assert.equal(pm.items.length, 17);   // + the ready and cancel switches
assert.ok(pm.items.slice(-2).every(it => it.z === 11.5));   // the switches over the plane
assert.equal(pa.holes.length, 0);
assert.equal(pt.holes.length, 6);   // five card faces and the lamp swf (136 x 150)
assert.deepEqual(pt.holes.find(h => h.rect.w === 136).rect, { x: 600, y: 330, w: 136, h: 150 });
assert.equal(pt.items.length, 1);   // the partner's name
// passthrough: card faces and swfs; not the frame pieces
assert.ok(mod.passthrough({ tex: 'data/CARD/4007.png' }) && mod.passthrough({ id: 9, name: 'x', x: 0, y: 0, wx: 0, wy: 0, shown: true }));
assert.ok(!mod.passthrough({ id: partner.extras[0].id, cls: 'CSpriteElm', tex: partner.extras[0].tex }));
// art it doesn't know stays the engine's (a hole, kept)
const odd = structuredClone(mine);
odd.extras.push({ id: 77, cls: 'CSpriteElm', tex: 'data/deck/unknown_01.png', src: [0, 0, 16, 16], wx: 300, wy: 330, wz: 12, sx: 1, sy: 1, shown: true });
const po = plan(odd);
assert.ok(po.kept.has(77) && po.holes.some(h => h.rect.x === 300 && h.z === 12));
console.log('screens/trade_test: ok');
