// The Wardrobe's DOM in headless Chrome (skin.html as the page; fetch stubbed with a server-shaped state with ONE look,
// both worlds the same; Module.yo2Lazy stubbed with synthetic PNGs drawn here, no game art): it opens over the page, no
// world switch, the Head / Outfit / Disk tabs, the grid (four to a row, the worn tile cyan, the selection's brackets,
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
const b = await launch({ port: 9700 + process.pid % 40 });   // off the tools' 9440-9579 and boxes_dom_test's 9650-9689
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

// the overlay: over the canvas, modal, built from the shop's pieces (the glass window, its band, the title plate)
assert.equal(await q(`R.getAttribute('role') + R.getAttribute('aria-modal')`), 'dialogtrue');
assert.equal(await q(`R.querySelector('.sa-title').textContent`), 'Wardrobe');
assert.ok(await q(`R.classList.contains('de-c') && !!R.querySelector('.sa-glass') && !!R.querySelector('.sa-band') && !!document.getElementById('de-shop-skin')`));
assert.equal(await q(`document.activeElement === R`), true);
assert.equal(await q(`R.querySelectorAll('.wd-worlds, [data-world]').length`), 0, 'one look: no world switch');
// the tabs: Head, Outfit, Disk (counts kept as data)
assert.deepEqual(await q(`[...R.querySelectorAll('.wd-tab')].map(t => t.textContent + ':' + t.dataset.count + ':' + t.hasAttribute('data-on'))`),
  ['Head:2:false', 'Outfit:5:true', 'Disk:1:false']);
// the grid: worn first, the rank uniforms after the outfits; four to a row
assert.deepEqual(await q(`[...R.querySelectorAll('.wd-tile')].map(t => t.dataset.id)`),
  ['outfit:jaden', 'outfit:black-suit', 'outfit:tea', 'uniform:slifer', 'uniform:ra', 'uniform:obelisk']);
assert.deepEqual(await q(`[...R.querySelectorAll('.wd-tile')].slice(0, 5).map(t => t.style.left + ',' + t.style.top)`), ['0px,0px', '78px,0px', '156px,0px', '234px,0px', '0px,78px']);
assert.ok(await q(`[...R.querySelectorAll('.wd-tile')].every(r => r.classList.contains('sa-plate'))`), 'the shop\'s plates');
assert.ok(await q(`${row('outfit:jaden')}.hasAttribute('data-on') && ${row('outfit:jaden')}.hasAttribute('data-equipped')`), 'the worn tile: cyan');
assert.equal(await q(`[...R.querySelectorAll('.wd-tile .sa-brackets')].filter(e => !e.hidden).map(e => e.parentNode.dataset.id).join()`), 'outfit:jaden', 'the brackets: the selection');
// art: drawn into a canvas; rarity on the art frame; the other body's art dimmed
assert.equal(await q(`${row('outfit:jaden')}.querySelector('.de-art').dataset.state`), 'ready');
assert.ok(await q(`${row('outfit:tea')}.querySelector('.de-art').hasAttribute('data-fallback') && ${row('outfit:tea')}.querySelector('.de-rf').hasAttribute('data-dim')`));
assert.equal(await q(`${row('outfit:tea')}.querySelector('.de-rf').dataset.rarity`), 'ultra');
assert.ok((await b.ev('__read')).includes('data/avatar/chibi/cw_dc_04_c01_n01_01.png'));
// the locked uniform: the dark plate, its reason in one short line
assert.ok(await q(`${row('uniform:obelisk')}.hasAttribute('data-off') && ${row('uniform:obelisk')}.hasAttribute('data-locked')`));
// the bust, large in the middle: the saved look (Jaden's worn, selected)
let wu = await bust();
assert.deepEqual([wu.state, wu.text, wu.drawn], ['wearing', 'Wearing', 'ready']);
assert.ok(await q(`R.querySelector('.wd-wu canvas').width >= 266`), 'drawn at the device pixels');
const saved = wu.layers;
assert.equal(await q(`R.querySelector('.wd-equip').textContent + R.querySelector('.wd-equip').disabled`), 'Worntrue');
assert.equal(await q(`R.querySelector('.wd-foot').textContent`), 'Graduation: LV 12/20 · 7/25 rivals beaten');
assert.ok((await aligned('the Wardrobe, wearing')) > 30);
// a Domino outfit, in the Academy, by a student not graduated: a plain try-on (no world rule any more)
await b.ev(`document.querySelector('[data-id="outfit:black-suit"]').click()`);
assert.equal(await q(`R.querySelector('.wd-name').textContent`), 'Black Suit');
assert.equal(await q(`R.querySelector('.wd-rl').textContent`), 'Rare outfit');
assert.equal(await q(`R.querySelector('.wd-equip').disabled`), false);
assert.match(await q(`R.querySelector('.wd-info').textContent`), /2 spares: trade in Card Swap\./);
wu = await bust();
assert.deepEqual([wu.state, wu.text], ['preview', 'Previewing']);
assert.deepEqual(wu.layers.map((n, i) => n === saved[i] ? '' : saved[i] + '>' + n).filter(Boolean), ['wm_ac_08_c01_r>wm_dc_03_c01_r'], 'only the clothes change');
await aligned('the Wardrobe, previewing');
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
// Head: the glasses worn can be taken off (POST /appearance with "none"); hair can't
await b.ev(`document.querySelector('[data-tab="head"]').click()`);
await b.ev(`document.querySelector('[data-id="accessory:sunglasses"]').click()`);
assert.equal(await q(`R.querySelector('.wd-off').hidden`), false);
await aligned('the Wardrobe, glasses worn');
await b.ev(`document.querySelector('.wd-off').click()`);
await until(`document.querySelector('.de-wd .wd-why[data-tone=ok]')?.textContent === 'Taken off.'`);
assert.deepEqual((await b.ev('__calls')).filter(c => c[0].endsWith('/appearance')).at(-1)[1].parts[9], 0x20);
assert.equal(await q(`R.querySelector('.wd-off').hidden`), true);
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
assert.equal(await q(`R.querySelector('.wd-tab[aria-selected=true]').dataset.tab`), 'head');
assert.equal(await b.ev(`(W.openWardrobe({ focusId: 'hair:afro' }), document.querySelectorAll('.de-wd').length)`), 1);   // one at a time
await until(`document.querySelector('.de-wd .wd-name')?.textContent === 'Afro'`);
await b.ev(`__close()`);
// empty: the hint (the outfits tab keeps its rank uniforms; the head tab is empty)
await b.ev(`__info.inventory = []; window.__close = W.openWardrobe({ focusId: 'x' })`);
await until(`!!document.querySelector('.de-wd .wd-tile[data-id="uniform:slifer"]')`);
await b.ev(`document.querySelector('[data-tab="head"]').click()`);
await until(`!!document.querySelector('.de-wd .wd-empty')`);
assert.match(await q(`R.querySelector('.wd-empty').textContent`), /Win items from the Cosmetic Boxes in the Card Shop\./);
await b.ev(`__close()`);
assert.equal(await b.ev(`!!document.querySelector('.de-wd')`), false);
assert.deepEqual(b.logs.filter(l => /^(error|exception)/.test(l)), []);
console.log('wardrobe_dom_test: ok');
b.close(); process.exit(0);
