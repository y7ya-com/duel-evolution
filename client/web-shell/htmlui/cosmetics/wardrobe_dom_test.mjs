// The Wardrobe's DOM in headless Chrome (skin.html as the page; fetch stubbed with a server-shaped state; Module.yo2Lazy
// stubbed with synthetic PNGs drawn here, no game art): it opens over the page, the tabs, the rows' art (drawn, the
// placeholder for a missing picture, the other body's art dimmed), Wearing per world, the world switch, the rank
// uniforms (earned / locked rows), the spares, a Domino outfit in the Academy refused with the reason, an equip (its
// request, the confirmation, the refresh), the server's refusal text, keys kept from the game, Esc, focusId, empty.
//   node client/web-shell/htmlui/cosmetics/wardrobe_dom_test.mjs
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { launch } from '../tools/cdp.mjs';
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
const domino = [0, 0xa, 0x20, 0, 0x40, 0x60, 0x87, 0x90, 0xb4, 0x50, 0, 0, 0, 0, 0, 0];
const academy = [0, 0xa, 0x20, 0, 0x40, 0x60, 0x80, 0x90, 0xb8, 0x20, 0, 0, 0, 0, 0, 0];
const INFO = { available: true, inventory: INV, boxes: [], catalog: [],
  appearance: { gender: 'male', world: 1, parts: academy, looks: { 0: domino, 1: academy } },
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
      __info.appearance.looks[world][item.slot] = item.variants.find(x => x.gender === 'male').number;
      return ok({ ...__info, equipped: { id, world, parts: __info.appearance.looks[world] } });
    }
    return ok(__info);
  };
  // lazyfs.js's yo2Lazy with entry(): a coloured shape per picture, none for the disk's (the placeholder)
  const png = async name => {
    if (name.includes('mapdisk')) return null;
    const c = new OffscreenCanvas(128, 128), g = c.getContext('2d');
    let hsh = 0; for (const ch of name) hsh = (hsh * 31 + ch.charCodeAt(0)) >>> 0;
    g.fillStyle = 'hsl(' + hsh % 360 + ' 70% 50%)'; g.fillRect(40, 30, 48, 70);
    return new Uint8Array(await (await c.convertToBlob()).arrayBuffer());
  };
  window.__read = [];
  window.Module = { yo2Lazy: { files: new Map(), files2: { has: n => /^data\\/(avatar\\/chibi|map\\/map_switch)\\//.test(n) },
    entry: async n => { __read.push(n); return png(n); } } };
  window.W = await import('/htmlui/cosmetics/wardrobe.js');
  window.__close = W.openWardrobe();
})()`);
const until = async (js, ms = 4000) => { for (const t = Date.now(); Date.now() - t < ms; await sleep(50)) if (await b.ev(js)) return true; throw new Error('timed out: ' + js); };
const q = js => b.ev(`(() => { const R = document.querySelector('.de-wd'); return ${js}; })()`);
await until(`document.querySelectorAll('.de-wd .wd-row[data-id]').length > 0`);
await until(`[...document.querySelectorAll('.de-wd .wd-row .de-art')].every(e => e.dataset.state !== 'loading')`);
const row = id => `R.querySelector('[data-id="${id}"]')`;

// the overlay: over the canvas, modal, built from the shop's pieces (the glass window, its band, the title plate)
assert.equal(await q(`R.getAttribute('role') + R.getAttribute('aria-modal')`), 'dialogtrue');
assert.equal(await q(`R.querySelector('.sa-title').textContent`), 'Wardrobe');
assert.ok(await q(`R.classList.contains('de-c') && !!R.querySelector('.sa-glass') && !!R.querySelector('.sa-band') && !!document.getElementById('de-shop-skin')`));
assert.equal(await q(`document.activeElement === R`), true);
// tabs (plates; counts kept as data, no bubbles); the Academy by default (the character's world)
assert.deepEqual(await q(`[...R.querySelectorAll('.wd-tab')].map(t => t.dataset.tab + ':' + t.dataset.count + ':' + t.getAttribute('aria-selected') + ':' + t.hasAttribute('data-on'))`),
  ['outfit:5:true:true', 'hair:1:false:false', 'accessory:1:false:false', 'dueldisk:1:false:false']);
assert.deepEqual(await q(`[...R.querySelectorAll('.wd-tab')].map(t => t.textContent)`), ['Outfits', 'Hair', 'Accessories', 'Duel Disks']);
assert.deepEqual(await q(`[...R.querySelectorAll('.wd-worlds .sa-plate')].map(p => p.getAttribute('aria-pressed') + p.hasAttribute('data-on'))`), ['falsefalse', 'truetrue']);
// the rows: the outfits, then the rank uniforms as plain rows
assert.deepEqual(await q(`[...R.querySelectorAll('.wd-row[data-id]')].map(t => t.dataset.id)`),
  ['outfit:jaden', 'outfit:tea', 'outfit:black-suit', 'uniform:slifer', 'uniform:ra', 'uniform:obelisk']);
assert.ok(await q(`[...R.querySelectorAll('.wd-row')].every(r => r.classList.contains('sa-row'))`), 'the Avatar Parts row plates');
assert.equal(await q(`R.querySelector('.wd-row[data-on]').dataset.id`), 'outfit:jaden', 'the cyan row: the selection');
// art: drawn into a canvas at the device's pixels; the other body's art marked (dimmed by its frame), no glyph cue
assert.equal(await q(`${row('outfit:jaden')}.querySelector('.de-art').dataset.state`), 'ready');
assert.ok(await q(`${row('outfit:jaden')}.querySelector('canvas').width >= 26`));
assert.ok(await q(`${row('outfit:tea')}.querySelector('.de-art').hasAttribute('data-fallback') && ${row('outfit:tea')}.querySelector('.de-rf').hasAttribute('data-dim')`));
assert.equal(await q(`R.querySelector('.de-art-only')`), null);
assert.doesNotMatch(await q(`R.textContent`), /♂|♀|🎓/);
assert.ok((await b.ev('__read')).includes('data/avatar/chibi/cw_dc_04_c01_n01_01.png'));
assert.equal(await q(`${row('outfit:tea')}.querySelector('.de-rf').dataset.rarity`), 'ultra', 'rarity on the art frame');
// the rank uniforms: Obelisk locked (the dark plate, "Locked"), Slifer worn in the Academy look
assert.ok(await q(`${row('uniform:obelisk')}.hasAttribute('data-off') && ${row('uniform:obelisk')}.hasAttribute('data-locked')`));
assert.equal(await q(`${row('uniform:obelisk')}.querySelector('.wr').textContent`), 'Locked');
assert.equal(await q(`${row('uniform:slifer')}.querySelector('.wr').textContent`), 'Wearing');
assert.ok(await q(`${row('uniform:slifer')}.hasAttribute('data-hi')`), 'the worn row: the light plate');
assert.equal(await q(`R.querySelector('.wd-foot').textContent`), 'Graduation: LV 12/20 · 7/25 rivals beaten');
// the spares: a plain ×3 in the row's text; the trade note only in the detail
assert.equal(await q(`${row('outfit:black-suit')}.querySelector('.nm').textContent`), 'Black Suit  ×3');
await b.ev(`document.querySelector('[data-id="uniform:obelisk"]').click()`);
assert.ok(await q(`${row('uniform:obelisk')}.hasAttribute('data-on') && !${row('uniform:obelisk')}.hasAttribute('data-off')`), 'selected: cyan even when locked');
assert.match(await q(`R.querySelector('.wd-info').textContent`), /Reach Obelisk Blue in ranked Autoduel to unlock/);
assert.equal(await q(`R.querySelector('.wd-equip').textContent + R.querySelector('.wd-equip').disabled`), 'Lockedtrue');

// a Domino outfit in the Academy: Equip disabled, the reason shown, the trade note
await b.ev(`document.querySelector('[data-id="outfit:black-suit"]').click()`);
assert.equal(await q(`R.querySelector('.wd-name').textContent`), 'Black Suit');
assert.equal(await q(`R.querySelector('.wd-rl').textContent`), 'Rare outfit');
assert.equal(await q(`R.querySelector('.wd-equip').disabled`), true);
assert.match(await q(`R.querySelector('.wd-why').textContent`), /outside Duel Academy until you graduate/);
assert.match(await q(`R.querySelector('.wd-info').textContent`), /You have 3\. Trading spare copies is coming soon\./);
assert.equal(await q(`R.querySelector('.wd-stage').dataset.rarity`), 'rare');
// a female-only item: its notice
await b.ev(`document.querySelector('[data-id="outfit:tea"]').click()`);
assert.match(await q(`R.querySelector('.wd-why').textContent`), /female|male version/);
assert.match(await q(`R.querySelector('.wd-info').textContent`), /Female body only for now/);

// Domino City: the suit is wearable; equip it -> POST {id, world: 0}, the confirmation, the row now Wearing
await b.ev(`document.querySelector('.wd-worlds [data-world="0"]').click()`);
assert.equal(await q(`${row('outfit:jaden')}.querySelector('.wr').textContent`), 'Wearing');   // Domino wears Jaden's
await b.ev(`document.querySelector('[data-id="outfit:black-suit"]').click()`);
assert.equal(await q(`R.querySelector('.wd-equip').disabled`), false);
await b.ev(`document.querySelector('.wd-equip').click()`);
assert.equal(await q(`R.querySelector('.wd-equip').textContent`), 'Equipping…');
await until(`document.querySelector('.de-wd .wd-why[data-tone=ok]')`);
assert.equal(await q(`R.querySelector('.wd-why').textContent`), 'Equipped in Domino City. Other players see your new look.');
assert.deepEqual((await b.ev('__calls')).find(c => c[0].endsWith('/equip')), ['/cosmetics/equip', { id: 'outfit:black-suit', world: 0 }]);
assert.equal(await q(`${row('outfit:black-suit')}.querySelector('.wr').textContent + '|' + ${row('outfit:jaden')}.querySelector('.wr').textContent`), 'Wearing|');
assert.equal(await q(`R.querySelector('.wd-equip').textContent`), 'Wearing');
// the server refuses: its error text (api.js errorText) in the detail
await b.ev(`__fail = { error: 'no-compatible-variant', status: 409, reason: 'world', worlds: [0] }; document.querySelector('[data-id="outfit:jaden"]').click()`);
await b.ev(`document.querySelector('.wd-equip').click()`);
await until(`document.querySelector('.de-wd .wd-why')?.textContent.includes('only be worn in Domino City')`);
assert.equal(await q(`R.querySelector('.wd-why').getAttribute('role')`), 'alert');
await b.ev(`__fail = null`);

// keys: arrows move the selection, none reaches the game; the disk tab: no picture -> the placeholder
const before = await b.ev('__gameKeys');
await b.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'ArrowDown', code: 'ArrowDown', windowsVirtualKeyCode: 40 });
await b.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'ArrowDown', code: 'ArrowDown', windowsVirtualKeyCode: 40 });
assert.equal(await b.ev('__gameKeys'), before);
await b.ev(`document.querySelector('[data-tab="dueldisk"]').click()`);
await until(`document.querySelector('.de-wd [data-id="dueldisk:3417"] .de-art')?.dataset.state === 'none'`);
assert.equal(await q(`R.querySelector('.wd-name').textContent`), 'Battle City Alpha Gold');
assert.equal(await q(`R.querySelector('.wd-rl').textContent`), 'Ultra Rare duel disk');
// Esc closes, and a second open with focusId lands on that item's tab
await b.ev(`document.querySelector('.de-wd').focus()`);
await b.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
assert.equal(await b.ev(`!!document.querySelector('.de-wd')`), false);
assert.equal(await b.ev('__gameKeys'), before);
await b.ev(`window.__close = W.openWardrobe({ focusId: 'accessory:sunglasses', world: 0 })`);
await until(`document.querySelector('.de-wd .wd-name')?.textContent === 'Sunglasses'`);
assert.equal(await q(`R.querySelector('.wd-tab[aria-selected=true]').dataset.tab`), 'accessory');
assert.equal(await b.ev(`(W.openWardrobe({ focusId: 'hair:afro' }), document.querySelectorAll('.de-wd').length)`), 1);   // one at a time
await until(`document.querySelector('.de-wd .wd-name')?.textContent === 'Afro'`);
await b.ev(`__close()`);
// empty: the hint (the outfits tab keeps its rank uniforms; the hair tab is empty)
await b.ev(`__info.inventory = []; window.__close = W.openWardrobe({ focusId: 'x' })`);
await until(`!!document.querySelector('.de-wd .wd-row[data-id="uniform:slifer"]')`);
await b.ev(`document.querySelector('[data-tab="hair"]').click()`);
await until(`!!document.querySelector('.de-wd .wd-empty')`);
assert.match(await q(`R.querySelector('.wd-empty').textContent`), /Open boxes in the Card Shop to get wearables\./);
await b.ev(`__close()`);
assert.equal(await b.ev(`!!document.querySelector('.de-wd')`), false);
assert.deepEqual(b.logs.filter(l => /^(error|exception)/.test(l)), []);
console.log('wardrobe_dom_test: ok');
b.close(); process.exit(0);
