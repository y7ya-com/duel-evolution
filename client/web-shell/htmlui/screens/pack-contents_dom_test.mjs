// The details sheet's DOM in headless Chrome (skin.html as the page, fetch stubbed with synthetic data): the band, the
// odds tables, the duplicates note, the card grid with its badges and filters, the fixed deck, Your Pulls, data given
// (no fetch), the loading and failure states with retry, Esc and Close, the keyboard kept from the game, and the native
// Booster Packs window's hotspots over the pack art (which pack each opens, the page, a click while the confirm window is
// up going to the game).
//   node client/web-shell/htmlui/screens/pack-contents_dom_test.mjs
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { launch } from '../tools/cdp.mjs';
import { PACK } from './pack-contents_test.mjs';
const here = path.dirname(fileURLToPath(import.meta.url));
const PORT = 20000 + process.pid % 10000;
const srv = spawn('node', [path.join(here, '../serve.mjs'), String(PORT)], { stdio: ['ignore', 'pipe', 'inherit'] });
process.on('exit', () => srv.kill());
await new Promise(ok => srv.stdout.once('data', ok));
const b = await launch({ port: 9650 + process.pid % 40, profile: process.env.HOME + '/.cache/de-scratch/shopA/pc-chrome-' + process.pid });
await b.go(`http://127.0.0.1:${PORT}/htmlui/skin.html`, 'document.readyState === "complete"');
const DECK = { packId: 7001, name: 'Test Deck', kind: 'deck', size: 3, slots: [], perCard: { N: 1, R: 1 }, perCardMeaning: '',
  cards: [{ passcode: 1, internalId: 1, name: 'Deck One', rarity: 'R', owned: 0, copies: 2 }, { passcode: 2, internalId: 2, name: 'Deck Two', rarity: 'N', owned: 1 }],
  collected: { owned: 1, total: 2 } };

await b.ev(`(async () => {
  document.body.innerHTML = '<canvas id="canvas" width="1024" height="768" style="position:absolute;left:0;top:0"></canvas><div id="htmlui-host" style="position:absolute;left:0;top:0;width:1024px;height:768px"><div class="win" id="packwin" style="position:absolute;left:264px;top:0;width:760px;height:600px"></div></div>';
  window.__calls = []; window.__fail = 0; window.__hold = null;
  window.fetch = async u => {
    __calls.push(u);
    if (__hold) await __hold;
    if (__fail) { __fail--; return { ok: false, status: 503, json: async () => { throw new SyntaxError(); } }; }
    const id = new URL(u, location.href).searchParams.get('id');
    return { ok: true, status: 200, json: async () => id === '7001' ? ${JSON.stringify(DECK)} : ${JSON.stringify(PACK)} };
  };
  window.M = await import('/htmlui/screens/pack-contents.js');
  window.host = document.getElementById('htmlui-host');
  window.gameKeys = []; window.gameMouse = [];
  document.addEventListener('keydown', e => gameKeys.push(e.key));
  document.getElementById('canvas').addEventListener('mousedown', e => gameMouse.push(['down', e.clientX, e.clientY]));
})()`);
const tick = () => new Promise(r => setTimeout(r, 150));
const q = js => b.ev(js);

// the pack: the band, the odds tables, the duplicates note, the grid (rarity badges, copies, missing greyed)
await q(`window.m = M.openPackContents(host, { id: 4 })`);
await tick();
assert.deepEqual(await q(`__calls`), ['/api/de/shop/pack?id=4']);
assert.equal(await q(`document.activeElement.getAttribute('aria-label')`), 'Close');
assert.equal(await q(`m.el.querySelector('#pc-title').textContent`), 'Pack 4 · 5 cards · 5 a pack');
assert.equal(await q(`m.el.querySelector('.sa-title').textContent`), 'Details');
assert.deepEqual(await q(`[...m.el.querySelectorAll('table.odds')[0].rows].map(r => r.textContent)`), ['SlotNRSRUR', 'Cards 1–470%25%4%1%', 'Card 5–75%20%5%']);
assert.equal(await q(`m.el.querySelector('table.odds + .t12').textContent`), 'The 5th card is always Rare or better.');
assert.deepEqual(await q(`[...m.el.querySelectorAll('table.odds')[1].rows].map(r => r.cells[0].textContent)`),
  ['At least one', 'Ultra Rare', 'Super Rare or better', 'Each UR card', 'Each SR card', 'Each R card', 'Each N card']);
assert.match(await q(`m.el.textContent`), /Spare copies can be dismantled for shards in the Deck Editor, and missing cards crafted there\./);
assert.deepEqual(await q(`[...m.el.querySelectorAll('.gc')].map(c => [c.querySelector('.rb')?.textContent || '', c.querySelector('.nm').textContent, c.querySelector('.own')?.textContent || '', 'miss' in c.querySelector('.rf').dataset])`), [
  ['UR', 'Test Dragon', '×1', false], ['SR', 'Test Knight', '', true], ['R', 'Test Spell', '×2', false],
  ['', 'Test Trap', '', true], ['', 'Test Imp', '×3', false]]);
assert.equal(await q(`m.el.querySelectorAll('.gc .ph').length`), 1);   // no internal id: the name stands in
assert.equal(await q(`getComputedStyle(m.el.querySelector('.grid')).overflowY`), 'auto');   // the grid scrolls, not the page

// filters: the counts, a rarity, missing only, both
assert.deepEqual(await q(`[...m.el.querySelectorAll('[role=tab]')].map(t => t.textContent)`), ['All5', 'UR1', 'SR1', 'R1', 'N2']);
assert.equal(await q(`m.el.querySelector('[data-k=miss]').textContent`), 'Missing2');
await q(`m.el.querySelector('[data-k=r-N]').click()`);
assert.deepEqual(await q(`[...m.el.querySelectorAll('.gc .nm')].map(n => n.textContent)`), ['Test Trap', 'Test Imp']);
assert.equal(await q(`m.el.querySelector('[data-k=r-N]').getAttribute('aria-selected')`), 'true');
await q(`m.el.querySelector('[data-k=miss]').click()`);
assert.deepEqual(await q(`[...m.el.querySelectorAll('.gc .nm')].map(n => n.textContent)`), ['Test Trap']);
assert.equal(await q(`m.el.querySelector('[data-k=miss]').getAttribute('aria-pressed')`), 'true');
await q(`m.el.querySelector('[data-k=r-R]').click()`);
assert.equal(await q(`m.el.querySelector('.grid .ghd').textContent`), 'No cards to show.');
await q(`m.el.querySelector('[data-k=r-all]').click()`);
assert.deepEqual(await q(`[...m.el.querySelectorAll('.gc .nm')].map(n => n.textContent)`), ['Test Knight', 'Test Trap']);

// keys: the game sees none; Tab stays inside; Esc closes and calls back
await b.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'a', text: 'a' });
assert.deepEqual(await q(`gameKeys`), []);
await q(`m.el.querySelector('.grid').focus()`);
await b.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Tab', code: 'Tab', windowsVirtualKeyCode: 9 });
assert.equal(await q(`document.activeElement.getAttribute('aria-label')`), 'Close');
await b.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
await tick();
assert.equal(await q(`document.querySelectorAll('.sheet').length`), 0);
assert.equal(await q(`document.querySelectorAll('.pc').length`), 0);   // its own .ns root goes with it
await b.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'b', text: 'b' });
assert.deepEqual(await q(`gameKeys`), ['b']);   // the game has the keyboard back

// the fixed deck: its rarity table, copies; the close button; the dim closes too
await q(`window.shut = 0; window.m = M.openPackContents(host, { id: 7001, onClose: () => shut++ })`);
await tick();
assert.equal(await q(`m.el.querySelector('#pc-title').textContent`), 'Test Deck · 3 cards');
assert.equal(await q(`m.el.querySelector('.sa-title').textContent`), 'Deck Details');
assert.deepEqual(await q(`[...m.el.querySelector('table.odds').rows].map(r => r.textContent)`), ['RarityCardsOwned', 'Rare20 / 1', 'Normal11 / 1']);
assert.deepEqual(await q(`[...m.el.querySelectorAll('.gc .nm')].map(n => n.textContent)`), ['2× Deck One', 'Deck Two']);
await q(`m.el.querySelector('[data-k=x]').click()`);
assert.equal(await q(`shut`), 1);
await q(`window.m = M.openPackContents(host, { id: 7001 })`);
await tick();
await q(`m.el.querySelector('.dim').dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }))`);
assert.equal(await q(`document.querySelectorAll('.sheet').length`), 0);

// given its data (the shop's pack page): no fetch; "Your Pulls" lists the pulls, NEW where it was new
await q(`window.n0 = __calls.length; window.m = M.openPackContents(host, { id: 4, view: 'pulls', data: { ...${JSON.stringify(PACK)}, kind: 'pack',
  pulls: [{ count: 1, at: Date.now() - 120000, cards: [{ passcode: 2, internalId: 11, name: 'Test Knight', rarity: 'SR', isNew: true }, { passcode: 5, internalId: 14, name: 'Test Imp', rarity: 'N', isNew: false }] }] } })`);
await tick();
assert.equal(await q(`__calls.length - n0`), 0);
assert.equal(await q(`m.el.querySelector('.sa-title').textContent`), 'Your Pulls');
assert.equal(await q(`m.el.querySelector('.grid .ghd').textContent`), '1 pack· 2 min ago');
assert.deepEqual(await q(`[...m.el.querySelectorAll('.gc')].map(c => [c.querySelector('.nm').textContent, c.querySelector('.own')?.textContent || ''])`), [['Test Knight', ''], ['Test Imp', '×3']]);
await q(`m.close()`);

// loading, then a failure and its retry
await q(`window.__hold = new Promise(r => window.__go = r); window.__fail = 1; window.m = M.openPackContents(host, { id: 4 })`);
await tick();
assert.equal(await q(`m.el.querySelector('#pc-title').textContent`), 'Loading the pack…');
assert.ok(await q(`m.el.querySelectorAll('.grid .skel').length`) > 0);
await q(`__hold = null; __go()`);
await tick();
assert.equal(await q(`m.el.querySelector('.msg').getAttribute('role')`), 'alert');
assert.match(await q(`m.el.querySelector('.msg').textContent`), /restarting/);
assert.equal(await q(`document.activeElement.textContent`), 'Try again');
await q(`m.el.querySelector('[data-k=retry]').click()`);
await tick();
assert.equal(await q(`m.el.querySelectorAll('.gc').length`), 5);
await q(`m.close()`);

// the shop's hotspots: one over each of the page's art, each its pack; a click opens it
const win = { id: 1, cls: 'CShopPackWindow', x: 264, y: 0, shown: true, page: 1, packs: Array.from({ length: 13 }, (_, i) => i + 1) };
await q(`M.packHotspots(document.getElementById('packwin'), ${JSON.stringify(win)})`);
assert.deepEqual(await q(`[...document.querySelectorAll('.pc-art')].map(a => [a.getAttribute('aria-label'), a.style.left, a.style.top])`),
  [["What's in pack 11", '299px', '114px'], ["What's in pack 12", '398px', '114px'], ["What's in pack 13", '497px', '114px']]);
const center = await q(`(() => { const r = document.querySelectorAll('.pc-art')[1].getBoundingClientRect(); return [r.left + 40, r.top + 80]; })()`);
const click = async ([x, y]) => { for (const type of ['mouseMoved', 'mousePressed', 'mouseReleased']) await b.send('Input.dispatchMouseEvent', { type, x, y, button: 'left', buttons: type === 'mousePressed' ? 1 : 0, clickCount: 1 }); };
await click(center);
await tick();
assert.equal(await q(`__calls.at(-1)`), '/api/de/shop/pack?id=12');
await q(`document.querySelector('.sheet [data-k=x]').click()`);
// the confirm window up over the art: the click goes to the game, nothing opens
await q(`(() => { const w = document.createElement('div'); w.className = 'win'; w.setAttribute('aria-label', 'CShopConfirmWindow'); host.append(w); })()`);
const n = await q(`__calls.length`);
await click(center);
await tick();
assert.equal(await q(`__calls.length`), n);
assert.equal(await q(`document.querySelectorAll('.sheet').length`), 0);
assert.equal(await q(`gameMouse.length`), 1);
// the window gone: no hotspots
await q(`M.dropPackHotspots()`);
assert.equal(await q(`document.querySelectorAll('.pc-art').length`), 0);
if (b.logs.some(l => l.startsWith('exception'))) { console.log(b.logs.join('\n')); process.exitCode = 1; }
console.log('pack-contents dom ok');
b.close();
process.exit(process.exitCode || 0);
