// screens/shop.js without a browser: which parts are whose (the DOM's recipes, the engine's pictures), the swf
// buttons' state from the game's mouse, the draw plan of the mock shop snapshots.   node screens/shop_test.mjs
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { registerHooks } from 'node:module';
// web-shell/ui.js is client/html-ui/ui.js (serve.mjs and the ship map it there)
registerHooks({ resolve: (spec, ctx, next) => spec.endsWith('/ui.js')
  ? { ...next(new URL('../../../html-ui/ui.js', import.meta.url).href, ctx), format: 'module' } : next(spec, ctx) });
const { default: shop, texName, recipe, mine, passthrough, swfStates, plan } = await import('./shop.js');
const mock = n => JSON.parse(readFileSync(new URL(`../mock/${n}.json`, import.meta.url), 'utf8'));

// texture names: no folder, no extension, the language letter as English
assert.equal(texName('data/shop/shop_Introduction_02_?.png'), 'shop_introduction_02_e');
assert.equal(recipe('shop_introduction_03_e'), 'banner');
assert.equal(recipe('shop_pricetag_05_c01'), 'tag');
assert.equal(recipe('shop_arrow_11_c01'), 'arrow');
assert.equal(recipe('shop_card_02_c01'), null);   // a category banner: a picture
// the DOM's: recipes, texts, swf buttons, the game's scroll bar art; the engine's: pictures
const spr = tex => ({ id: 1, tex });
assert.ok(mine(spr('data/shop/shop_win_01_c01.png')) && mine({ id: 2, text: 'x' }) && mine({ id: 3, name: '', wx: 0, wy: 0 }));
assert.ok(mine(spr('data/common/window/scroll_bar_01_c00.png')));
assert.ok(!mine(spr('data/cardpack/pack_100.png')) && !mine(spr('data/shop/shop_pack_02_c01.png')));
assert.ok(passthrough(spr('data/shop/shop_card_01_c01.png'), { id: 9 }) && !passthrough(spr('data/shop/shop_money_01_c01.png'), { id: 9 }));
assert.ok(!passthrough({ id: 9, cls: 'CWindowTaskPictureSwitch' }));   // a control itself: hidden (its pictures pass)

// the swf buttons: the 256 x 64 shape under the mouse, the last one listed winning where two overlap; pressed with
// the left button down
const sw = [{ wx: 795, wy: 480 }, { wx: 795, wy: 540 }];
assert.deepEqual(swfStates(sw, null), ['normal', 'normal']);
assert.deepEqual(swfStates(sw, [900, 500, 0]), ['hover', 'normal']);
assert.deepEqual(swfStates(sw, [900, 542, 1]), ['normal', 'pressed']);
assert.deepEqual(swfStates(sw, [100, 100, 1]), ['normal', 'normal']);

// the menu: the panel, the banner, the Exit button (hovered), the two picked / hovered banners' frames; the three
// pictures are holes (the engine's), cut only where the picture is (not the banners' frame and glow)
const menu = mock('shop-menu').windows.find(w => w.cls === 'CShopCategoryWindow');
let P = plan(menu);
assert.equal(P.holes.length, 3);
assert.deepEqual(P.holes[0].rect, { x: 319 + 24, y: 125 + 29, w: 376, h: 112 });
assert.deepEqual(P.pills.map(p => p.state), ['hover']);
assert.equal(P.items.filter(it => it.z > 1017 && it.z < 1017.15).length, 2);   // the two frames, over their pictures
assert.ok(P.items.every((it, i) => !i || P.items[i - 1].z <= it.z));   // back to front
// hide(): its controls and the task's own parts the DOM draws (all of them here: no picture among the task's parts)
assert.equal(shop.hide(menu).length, menu.controls.length + menu.parts.sprites.length + menu.parts.swfs.length);

// the card window: the card faces' holes sit over the panel (1011) and under the confirm window (51003)
const cards = mock('shop-cards').windows.find(w => w.cls === 'CShopCardWindow');
P = plan(cards);
const faces = P.holes.filter(h => h.z === 1020);
assert.equal(faces.length, 10);
assert.ok(faces[0].z > 1011 && faces[0].z < 51003);
// the pack window: the pack art (data/cardpack, the engine's) is a hole and stays out of hide()
const packs = mock('shop-packs').windows.find(w => w.cls === 'CShopPackWindow');
assert.equal(plan(packs).holes.length, 10);
assert.ok(!shop.hide(packs).some(id => packs.parts.sprites.find(s => s.id === id && /cardpack/.test(s.tex))));
assert.deepEqual(plan(packs).pills.map(p => p.state), ['normal', 'pressed']);

// the confirm window: its ten line texts give way to the native list (every cart line), the frame and buttons stay
const conf = mock('shop-confirm').windows.find(w => w.cls === 'CShopConfirmWindow');
P = plan(conf);
assert.ok(P.items.some(it => it.id === 'list'));
assert.equal(P.items.filter(it => typeof it.id === 'number').length, 1 + 2 + 2 + 1);   // frame, 2 keys, 2 captions, message
console.log('screens/shop_test: ok');
