// The Wardrobe's DOM in headless Chrome (skin.html as the page; fetch stubbed with a server-shaped state with ONE look,
// both worlds the same; Module.yo2Lazy stubbed with synthetic PNGs drawn here, no game art): it opens over the page, no
// world switch, the Hair / Face / Outfit / Disk tabs and their sub-categories, the grid (three to a row, the worn tile cyan, the selection's brackets,
// the art drawn, the placeholder, the other body's art dimmed), the large bust's try-on and state, the rank uniforms
// (earned / locked with its short reason), a Domino outfit worn in the Academy, Equip (its request, the confirmation,
// the new look), the server's refusal, Take off for glasses (not hair), keys kept from the game, Esc, focusId, empty,
// and the layout's alignment (align.js).
//   node client/web-shell/htmlui/cosmetics/wardrobe_dom_test.mjs
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { launch } from '../tools/cdp.mjs';
import { WM_CSV, WW_CSV } from './waistup_fixture.mjs';
const here = path.dirname(fileURLToPath(import.meta.url));
const PORT = 30000 + process.pid % 10000;   // its own server: never another session's
const srv = spawn('node', [path.join(here, '../serve.mjs'), String(PORT)], { stdio: ['ignore', 'pipe', 'inherit'] });
process.on('exit', () => srv.kill());
await new Promise(ok => srv.stdout.once('data', ok));
const b = await launch({ profile: process.env.HOME + '/.cache/de-scratch/freewardrobe/test-wardrobe-' + process.pid, port: 9700 + process.pid % 40 });   // off the tools' 9440-9579 and boxes_dom_test's 9650-9689
await b.go(`http://127.0.0.1:${PORT}/htmlui/skin.html`);
const sleep = ms => new Promise(r => setTimeout(r, ms));

const v = (gender, number, worlds) => ({ gender, bit: (gender === 'female' ? 256 : 0) + number, number, worlds });
const it = (id, name, kind, slot, rarity, variants, extra = {}) => {
  const bodies = ['male', 'female'].filter(x => variants.some(y => y.gender === x));
  return { id, name, kind, slot, rarity, variants, bodies, owned: true, copies: 0, tradable: 0, compatible: bodies.includes('male'),
    ...(bodies.length === 1 ? { notice: `The ${bodies[0] === 'male' ? 'female' : 'male'} version of this item is still being made.` } : {}), ...extra };
};
const INV = [
  it('outfit:black-suit', 'Black Suit', 'outfit', 6, 'rare', [v('male', 0x77, [0]), v('female', 0x74, [0])], { copies: 2, tradable: 2 }),
  it('outfit:jaden', "Jaden's Costume", 'outfit', 6, 'common', [v('male', 0x87, [0, 1])]),
  it('outfit:tea', "Téa's Garms", 'outfit', 6, 'ultra', [v('female', 0x76, [0])]),
  it('hair:afro', 'Afro', 'hair', 1, 'common', [v('male', 0xa, [0, 1]), v('female', 0x5, [0, 1])]),
  it('accessory:sunglasses', 'Sunglasses', 'accessory', 9, 'rare', [v('male', 0x50, [0, 1]), v('female', 0x50, [0, 1])]),
  it('dueldisk:3417', 'Battle City Alpha Gold', 'dueldisk', 8, 'ultra', [v('male', 0xb4, [0, 1]), v('female', 0xb4, [0, 1])]),
];
// one look (owner, 2026-11-05: the same in both worlds): Afro, Jaden's, Alpha Gold, Sunglasses, in the Academy
const look = [0, 0xa, 0x20, 0x30, 0x40, 0x60, 0x87, 0x90, 0xb4, 0x50, 0, 0, 0, 0, 0, 0];
const INFO = { available: true, inventory: INV, boxes: [], catalog: [],
  appearance: { gender: 'male', world: 1, parts: look, looks: { 0: look, 1: [...look] } },
  rank: { bestSchool: 'ra', uniforms: ['slifer', 'ra'], graduated: false, graduationLevel: 20, graduation: { level: 12, levelRequired: 20, opponents: 7, opponentsRequired: 25 } } };

await b.ev(`(async () => {
  document.body.innerHTML = '<div id="canvas" style="position:absolute;left:0;top:0;width:1024px;height:768px;background:#345"></div>';
  window.__info = ${JSON.stringify(INFO)}; window.__calls = []; window.__fail = null; window.__gameKeys = 0;
  addEventListener('keydown', () => __gameKeys++);   // the game (SDL) listens on window, bubbling
  window.fetch = async (u, o) => {
    u = String(u); __calls.push([u.replace(/^.*\\/api\\/de/, ''), o?.body ? JSON.parse(o.body) : null]);
    const ok = body => ({ ok: true, status: 200, json: async () => body });
    if (u.endsWith('/equip')) {
      await new Promise(r => setTimeout(r, 60));
      if (__fail) return { ok: false, status: 409, json: async () => __fail };
      const { id, world } = JSON.parse(o.body), item = __info.inventory.find(i => i.id === id);
      for (const w of [0, 1]) __info.appearance.looks[w][item.slot] = item.variants.find(x => x.gender === 'male').number;
      return ok({ ...__info, equipped: { id, world, parts: __info.appearance.looks[world] } });
    }
    if (u.endsWith('/appearance')) {
      const { parts } = JSON.parse(o.body);
      for (const w of [0, 1]) __info.appearance.looks[w] = [...parts];
      return ok(__info);
    }
    return ok(__info);
  };
  // lazyfs.js's yo2Lazy with entry(): a coloured shape per picture, none for the disk's (the placeholder)
  const csv = { 'data/avatar/wu/wm_data.csv': ${JSON.stringify(WM_CSV)}, 'data/avatar/wu/ww_data.csv': ${JSON.stringify(WW_CSV)} };
  const png = async name => {
    if (csv[name]) return new TextEncoder().encode(csv[name]);
    if (name.includes('mapdisk')) return null;
    const c = new OffscreenCanvas(128, 128), g = c.getContext('2d');
    let hsh = 0; for (const ch of name) hsh = (hsh * 31 + ch.charCodeAt(0)) >>> 0;
    g.fillStyle = 'hsl(' + hsh % 360 + ' 70% 50%)'; g.fillRect(40, 30, 48, 70);
    return new Uint8Array(await (await c.convertToBlob()).arrayBuffer());
  };
  window.__read = [];
  window.Module = { yo2Lazy: { files: new Map(), files2: { has: n => /^data\\/(avatar\\/(chibi|wu)|map\\/map_switch)\\//.test(n) },
    entry: async n => { __read.push(n); return png(n); } } };
  window.W = await import('/htmlui/cosmetics/wardrobe.js');
  window.__close = W.openWardrobe();
})()`);
const until = async (js, ms = 4000) => { for (const t = Date.now(); Date.now() - t < ms; await sleep(50)) if (await b.ev(js)) return true; throw new Error('timed out: ' + js); };
const q = js => b.ev(`(() => { const R = document.querySelector('.de-wd'); return ${js}; })()`);
await until(`document.querySelectorAll('.de-wd .wd-tile[data-id]').length > 0`);
await until(`[...document.querySelectorAll('.de-wd .wd-tile .de-art')].every(e => e.dataset.state !== 'loading')`);
const row = id => `R.querySelector('[data-id="${id}"]')`;
// the bust: its state, its state plate's text, its layers once drawn (waistup.js: the picture names, bottom first)
const bust = async () => {
  await until(`(() => { const w = document.querySelector('.de-wd .wd-wu'); return w && w.dataset.state !== 'loading'; })()`);
  return q(`({ state: R.querySelector('.wd-bust').dataset.state, text: R.querySelector('.wd-state').textContent,
    layers: R.querySelector('.wd-wu').dataset.layers.split(' '), drawn: R.querySelector('.wd-wu').dataset.state })`);
};
// the alignment checks (align.js) on the screen that is up: every centred group and column stack within 1 game px
const aligned = async label => {
  const r = await b.ev(`import('/htmlui/cosmetics/align.js').then(m => m.checkAlign())`);
  assert.equal(r.screen, 'wardrobe', label);
  const bad = r.checks.filter(c => !c.ok);
  assert.deepEqual(bad, [], label + ': ' + JSON.stringify(bad));
  return r.checks.length;
};

// the overlay: over the canvas, modal, flat panels over the shop's skin (its glass and band kept, hidden)
assert.equal(await q(`R.getAttribute('role') + R.getAttribute('aria-modal')`), 'dialogtrue');
assert.equal(await q(`R.querySelector('.sa-title').textContent`), 'Wardrobe');
assert.ok(await q(`R.classList.contains('de-c') && !!R.querySelector('.sa-glass') && !!R.querySelector('.sa-band') && !!document.getElementById('de-shop-skin')`));
assert.equal(await q(`document.activeElement === R`), true);
assert.equal(await q(`R.querySelectorAll('.wd-worlds, [data-world]').length`), 0, 'one look: no world switch');
// the tabs: a segmented control, Hair, Face, Outfit, Disk, each with its count
assert.deepEqual(await q(`[...R.querySelectorAll('.wd-tab')].map(t => t.querySelector('.wd-tl').textContent + ':' + t.querySelector('.wd-n').textContent + ':' + t.hasAttribute('data-on'))`),
  ['Hair:1:false', 'Face:1:false', 'Outfit:5:true', 'Disk:1:false']);
// the grid: worn first, the rank uniforms after the outfits; three to a row
assert.deepEqual(await q(`[...R.querySelectorAll('.wd-tile')].map(t => t.dataset.id)`),
  ['outfit:jaden', 'outfit:black-suit', 'outfit:tea', 'uniform:slifer', 'uniform:ra', 'uniform:obelisk']);
assert.deepEqual(await q(`[...R.querySelectorAll('.wd-tile')].slice(0, 5).map(t => t.style.left + ',' + t.style.top)`), ['0px,0px', '104px,0px', '208px,0px', '0px,132px', '104px,132px']);
assert.deepEqual(await q(`[...new Set([...R.querySelectorAll('.wd-tile')].map(t => t.offsetWidth + 'x' + t.offsetHeight))]`), ['96x124'], 'uniform cards');
assert.ok(await q(`${row('outfit:jaden')}.hasAttribute('data-on') && ${row('outfit:jaden')}.hasAttribute('data-equipped')`), 'the worn tile: cyan');
assert.equal(await q(`${row('outfit:jaden')}.querySelector('.wd-badge').dataset.mark`), 'check', 'the worn tile: its check badge');
assert.equal(await q(`[...R.querySelectorAll('.wd-tile[aria-selected=true]')].map(e => e.dataset.id).join()`), 'outfit:jaden', 'the selection');
// Each card keeps art above its two-line name and visible state label.
assert.ok(await q(`[...R.querySelectorAll('.wd-tile')].every(tile => {
  const art = tile.querySelector('.de-rf').getBoundingClientRect(), name = tile.querySelector('.wd-tile-name').getBoundingClientRect();
  const card = tile.getBoundingClientRect(); return art.top >= card.top && art.bottom <= name.top && name.bottom <= card.bottom;
})`));
// art: drawn into a canvas; rarity on the art frame; the other body's art dimmed
assert.equal(await q(`${row('outfit:jaden')}.querySelector('.de-art').dataset.state`), 'ready');
assert.ok(await q(`${row('outfit:tea')}.querySelector('.de-art').hasAttribute('data-fallback') && ${row('outfit:tea')}.querySelector('.de-rf').hasAttribute('data-dim')`));
assert.equal(await q(`${row('outfit:tea')}.querySelector('.de-rf').dataset.rarity`), 'ultra');
assert.ok((await b.ev('__read')).includes('data/avatar/chibi/cw_dc_04_c01_n01_01.png'));
// the locked uniform: dimmed, a lock badge, its reason on hover
assert.ok(await q(`${row('uniform:obelisk')}.hasAttribute('data-off') && ${row('uniform:obelisk')}.hasAttribute('data-locked')`));
assert.equal(await q(`${row('uniform:obelisk')}.querySelector('.wd-badge').dataset.mark`), 'lock');
assert.equal(await q(`${row('uniform:obelisk')}.title`), 'Reach Obelisk Blue in ranked to unlock');
// the bust, large in the middle: the saved look (Jaden's worn, selected)
let wu = await bust();
assert.deepEqual([wu.state, wu.text, wu.drawn], ['wearing', 'Wearing', 'ready']);
assert.ok(await q(`R.querySelector('.wd-wu canvas').width >= 266`), 'drawn at the device pixels');
const saved = wu.layers;
assert.equal(await q(`R.querySelector('.wd-equip').textContent + R.querySelector('.wd-equip').disabled`), 'Equippedtrue');
assert.equal(await q(`R.querySelector('.wd-header .wd-meta').textContent`), 'Graduation: LV 12/20 · 7/25 rivals beaten');
// the current look at the details' foot: each slot's worn item
assert.deepEqual(await q(`[...R.querySelectorAll('.wd-look > button')].map(b => b.textContent)`),
  ['Front hairAfro', 'Back hairDefault', 'Hair colourDefault', 'EyesDefault', 'Eye colourDefault', 'NoseDefault', 'MouthDefault', 'SkinDefault',
    'AccessoryDefault', 'GlassesSunglasses', "OutfitJaden's Costume", 'DiskBattle City Alpha Gold']);
assert.ok((await aligned('the Wardrobe, wearing')) > 25);
// a Domino outfit, in the Academy, by a student not graduated: a plain try-on (no world rule any more)
await b.ev(`document.querySelector('[data-id="outfit:black-suit"]').click()`);
assert.equal(await q(`R.querySelector('.wd-name').textContent`), 'Black Suit');
assert.equal(await q(`R.querySelector('.wd-rl').textContent`), 'Rare outfit');
assert.equal(await q(`R.querySelector('.wd-equip').disabled`), false);
assert.match(await q(`R.querySelector('.wd-side').textContent`), /2 spares: trade in Card Swap\./);
wu = await bust();
assert.deepEqual([wu.state, wu.text], ['preview', 'Previewing']);
assert.deepEqual(wu.layers.map((n, i) => n === saved[i] ? '' : saved[i] + '>' + n).filter(Boolean), ['wm_ac_08_c01_r>wm_dc_03_c01_r'], 'only the clothes change');
await aligned('the Wardrobe, previewing');
// Hover previews another look without changing the selected item's Equip target.
await b.ev(`document.querySelector('[data-id="outfit:jaden"]').dispatchEvent(new MouseEvent('mouseenter'))`);
assert.equal((await bust()).state, 'wearing');
assert.equal(await q(`R.querySelector('.wd-name').textContent`), 'Black Suit');
await b.ev(`document.querySelector('[data-id="outfit:jaden"]').dispatchEvent(new MouseEvent('mouseleave'))`);
assert.equal((await bust()).state, 'preview');
assert.equal(await q(`${row('outfit:jaden')}.querySelector('.wd-badge').textContent`), 'Equipped');
// Equip: POST {id, world}, the confirmation, the tile now worn, the bust the new saved look
await b.ev(`document.querySelector('.wd-equip').click()`);
assert.equal(await q(`R.querySelector('.wd-equip').textContent`), 'Saving…');
await until(`document.querySelector('.de-wd .wd-why[data-tone=ok]')`);
assert.equal(await q(`R.querySelector('.wd-why').textContent`), 'Equipped. Others see your new look.');
assert.deepEqual((await b.ev('__calls')).find(c => c[0].endsWith('/equip')), ['/cosmetics/equip', { id: 'outfit:black-suit', world: 1 }]);
assert.ok(await q(`${row('outfit:black-suit')}.hasAttribute('data-on') && !${row('outfit:jaden')}.hasAttribute('data-on')`));
wu = await bust();
assert.deepEqual([wu.state, wu.layers[9]], ['wearing', 'wm_dc_03_c01_r']);
// the other body's item: the bust unchanged, one short line
await b.ev(`document.querySelector('[data-id="outfit:tea"]').click()`);
assert.equal(await q(`R.querySelector('.wd-why').textContent`), 'Female body only for now.');
assert.equal((await bust()).state, 'cant');
// a locked uniform: Locked, its reason
await b.ev(`document.querySelector('[data-id="uniform:obelisk"]').click()`);
assert.deepEqual([(await bust()).state, await q(`R.querySelector('.wd-why').textContent`)], ['locked', 'Reach Obelisk Blue in ranked to unlock.']);
assert.equal(await q(`R.querySelector('.wd-equip').disabled`), true);
// the server refuses: its error text
await b.ev(`__fail = { error: 'not-owned', status: 403 }; document.querySelector('[data-id="outfit:jaden"]').click()`);
await b.ev(`document.querySelector('.wd-equip').click()`);
await until(`document.querySelector('.de-wd .wd-why')?.textContent === "You don't own this item yet."`);
assert.equal(await q(`R.querySelector('.wd-why').getAttribute('role')`), 'alert');
await b.ev(`__fail = null`);
// Face: the glasses worn can be taken off (POST /appearance with "none"); hair can't
await b.ev(`document.querySelector('[data-tab="face"]').click()`);
await b.ev(`document.querySelector('[data-id="accessory:sunglasses"]').click()`);
assert.equal(await q(`R.querySelector('.wd-off').hidden`), false);
await aligned('the Wardrobe, glasses worn');
await b.ev(`document.querySelector('.wd-off').click()`);
await until(`document.querySelector('.de-wd .wd-why[data-tone=ok]')?.textContent === 'Taken off.'`);
assert.deepEqual((await b.ev('__calls')).filter(c => c[0].endsWith('/appearance')).at(-1)[1].parts[9], 0x20);
assert.equal(await q(`R.querySelector('.wd-off').hidden`), true);
await b.ev(`document.querySelector('[data-tab="hair"]').click()`);
await b.ev(`document.querySelector('[data-id="hair:afro"]').click()`);
assert.equal(await q(`R.querySelector('.wd-off').hidden`), true, 'hair: no take-off');
// keys: arrows move the selection, none reaches the game; the disk tab: no picture -> the placeholder
const before = await b.ev('__gameKeys');
await b.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'ArrowRight', code: 'ArrowRight', windowsVirtualKeyCode: 39 });
await b.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'ArrowRight', code: 'ArrowRight', windowsVirtualKeyCode: 39 });
assert.equal(await b.ev('__gameKeys'), before);
await b.ev(`document.querySelector('[data-tab="dueldisk"]').click()`);
await until(`document.querySelector('.de-wd [data-id="dueldisk:3417"] .de-art')?.dataset.state === 'none'`);
assert.equal(await q(`R.querySelector('.wd-name').textContent`), 'Battle City Alpha Gold');
assert.equal(await q(`R.querySelector('.wd-rl').textContent`), 'Ultra Rare duel disk');
assert.equal((await bust()).state, 'wearing');
// Esc closes, and a second open with focusId lands on that item's tab
await b.ev(`document.querySelector('.de-wd').focus()`);
await b.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
assert.equal(await b.ev(`!!document.querySelector('.de-wd')`), false);
assert.equal(await b.ev('__gameKeys'), before);
await b.ev(`window.__close = W.openWardrobe({ focusId: 'accessory:sunglasses' })`);
await until(`document.querySelector('.de-wd .wd-name')?.textContent === 'Sunglasses'`);
assert.equal(await q(`R.querySelector('.wd-tab[aria-selected=true]').dataset.tab`), 'face');
assert.equal(await b.ev(`(W.openWardrobe({ focusId: 'hair:afro' }), document.querySelectorAll('.de-wd').length)`), 1);   // one at a time
await until(`document.querySelector('.de-wd .wd-name')?.textContent === 'Afro'`);
await b.ev(`__close()`);
// empty: the hint (the outfits tab keeps its rank uniforms; the head tab is empty)
await b.ev(`__info.inventory = []; window.__close = W.openWardrobe({ focusId: 'x' })`);
await until(`!!document.querySelector('.de-wd .wd-tile[data-id="uniform:slifer"]')`);
await b.ev(`document.querySelector('[data-tab="hair"]').click()`);
await until(`!!document.querySelector('.de-wd .wd-empty')`);
assert.match(await q(`R.querySelector('.wd-empty').textContent`), /Win items from the Cosmetic Boxes in the Card Shop\./);
await b.ev(`__close()`);
assert.equal(await b.ev(`!!document.querySelector('.de-wd')`), false);
// The model's outfit lock keeps the equipped Slifer uniform visibly locked below level 5.
await b.ev(`__info.rank.graduation.level = 1; __info.outfitLocked = true;
  for (const w of [0, 1]) __info.appearance.looks[w][6] = 0x80;
  window.__close = W.openWardrobe({ focusId: 'uniform:slifer' })`);
await until(`document.querySelector('.wd-tile[data-id="uniform:slifer"][data-pinned]')`);
assert.match(await q(`R.querySelector('.wd-why').textContent`), /locked until level 5/);
assert.equal(await q(`R.querySelector('.wd-equip').disabled`), true);
assert.equal(await q(`R.querySelector('.wd-off').hidden`), true);
assert.equal(await q(`${row('uniform:slifer')}.querySelector('.wd-badge').textContent`), 'Locked · LV 5');
assert.equal(await q(`${row('uniform:slifer')}.querySelector('.wd-badge').dataset.mark`), 'lock');
await aligned('the Wardrobe, Slifer locked');
await b.ev(`__close()`);
// Free entries use their own tag, remain after premium items, and equip through the same endpoint.
const freeHair = it('free:hair', 'Hair: Long Hair', 'hair', 1, null, [v('male', 1, [0, 1])], { free: true });
const freeFace = it('free:eyes', 'Eyes: Cold Eyes', 'face', 4, null, [v('male', 65, [0, 1])], { free: true });
const freeEyeColour = it('free:15:2', 'Eye Colour: Black', 'face', 15, null, [v('male', 2, [0, 1])], { free: true });
await b.ev(`__info.outfitLocked = false; __info.rank.graduation.level = 5;
  __info.inventory = ${JSON.stringify([INV[3], freeHair, freeFace, freeEyeColour])};
  window.__close = W.openWardrobe({ focusId: 'free:hair' })`);
await until(`document.querySelector('.wd-name')?.textContent === 'Long Hair'`);
assert.deepEqual(await q(`[...R.querySelectorAll('.wd-tile')].map(e => e.dataset.id)`), ['hair:afro', 'free:hair']);
assert.equal(await q(`R.querySelector('.wd-rl').textContent`), 'Free front hair');
assert.equal(await q(`${row('free:hair')}.querySelector('.de-rf').hasAttribute('data-free')`), true);
await b.ev(`document.querySelector('.wd-equip').click()`);
await until(`document.querySelector('.wd-why')?.textContent.includes('Equipped.')`);
assert.equal(await q(`${row('free:hair')}.hasAttribute('data-equipped')`), true);
await b.ev(`document.querySelector('[data-tab="face"]').click()`);
await until(`document.querySelector('.wd-name')?.textContent === 'Cold Eyes'`);
// the sub-categories: one grid at a time (Eyes, then Eye colour), the colour's chip on its card
assert.deepEqual(await q(`[...R.querySelectorAll('.wd-sub')].map(e => [e.dataset.sub, e.textContent, e.getAttribute('aria-selected')])`), [['eyes', 'Eyes1', 'true'], ['eyecolour', 'Eye colour1', 'false']]);
assert.deepEqual(await q(`[...R.querySelectorAll('.wd-tile')].map(e => e.dataset.id)`), ['free:eyes']);
await aligned('the Wardrobe, free Face parts');
await b.ev(`document.querySelector('.wd-sub[data-sub="eyecolour"]').click()`);
await until(`document.querySelector('.wd-name')?.textContent === 'Black'`);
assert.deepEqual(await q(`[...R.querySelectorAll('.wd-tile')].map(e => e.dataset.id)`), ['free:15:2']);
assert.equal(await q(`!!${row('free:15:2')}.querySelector('.wd-chip')`), true);
assert.deepEqual(await q(`[...R.querySelectorAll('.wd-look > button > .k')].map(e => e.textContent)`), ['Front hair', 'Back hair', 'Hair colour', 'Eyes', 'Eye colour', 'Nose', 'Mouth', 'Skin', 'Accessory', 'Glasses', 'Outfit', 'Disk']);
await aligned('the Wardrobe, a colour sub-category');
await b.ev(`__close()`);
assert.deepEqual(b.logs.filter(l => /^(error|exception)/.test(l)), []);
console.log('wardrobe_dom_test: ok');
b.close(); process.exit(0);
