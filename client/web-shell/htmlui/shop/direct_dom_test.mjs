// The direct map overlay must work without a native shop window or even an engine snapshot.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { launch } from '../tools/cdp.mjs';
import { VIEW } from './model_test.mjs';
const port = 24000 + process.pid % 5000;
const server = spawn('node', [fileURLToPath(new URL('../serve.mjs', import.meta.url)), String(port)], { stdio: ['ignore', 'pipe', 'inherit'] });
process.on('exit', () => server.kill());
await new Promise(r => server.stdout.once('data', r));
const b = await launch();
try {
  await b.go(`http://127.0.0.1:${port}/htmlui/skin.html`, 'document.readyState === "complete"');
  await b.ev(`(async () => {
    document.body.innerHTML = '<canvas id="canvas" width="1024" height="768" style="position:fixed;left:0;top:0;width:1024px;height:768px"></canvas><button id="launcher" style="position:fixed;left:250px;top:740px;z-index:2147480000">Wardrobe</button>';
    window.Module = {}; window.restart = false; window.keys = [];
    window.fetch = async u => ({ ok: !restart, status: restart ? 503 : 200, json: async () => String(u).includes('htmlui.json') ? { modern: false, on: [] } : restart ? { error: 'server-restarting' } : ${JSON.stringify(VIEW)} });
    await (await import('/htmlui/bridge.js')).start(Module, { spec: '0' });
    addEventListener('keydown', e => keys.push(e.key));
    Module.onYo2ShopOpen(); Module.onYo2ShopOpen();
  })()`);
  assert.equal(await b.ev('Module.yo2ShopOverlay'), true);
  assert.equal(await b.ev('Module.yo2ShopOverlayOpen'), true);
  assert.equal(await b.ev(`document.querySelectorAll('[aria-label="Card Shop"]').length`), 1);
  assert.equal(await b.ev(`!!document.elementFromPoint(260, 750).closest('.ns')`), true, 'overlay covers the map launchers');
  await b.ev(`document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'a', bubbles: true })); document.querySelector('.ns').dispatchEvent(new KeyboardEvent('keydown', { key: 'b', bubbles: true }));`);
  assert.deepEqual(await b.ev('keys'), []);
  await b.ev(`document.querySelector('.ns [aria-label="Leave the shop"]').click()`);
  assert.equal(await b.ev('Module.yo2ShopOverlayOpen'), false);
  await b.ev(`Module.onYo2ShopOpen(); Module.onYo2Scene('begin', 12, 28)`);
  assert.equal(await b.ev('Module.yo2ShopOverlayOpen'), false, 'duel or kick closes overlay');
  await b.ev(`Module.onYo2ShopOpen(); Module.onYo2ShopClose()`);
  assert.equal(await b.ev('Module.yo2ShopOverlayOpen'), false, 'gateway loss closes overlay');
  await b.ev(`Module.onYo2ShopOpen(); dispatchEvent(new Event('offline'))`);
  assert.equal(await b.ev('Module.yo2ShopOverlayOpen'), false);
  await b.ev(`restart = true; Module.onYo2ShopOpen()`);
  await new Promise(r => setTimeout(r, 100));
  assert.match(await b.ev(`document.querySelector('.ns').textContent`), /server is restarting/i);
  await b.ev(`document.querySelector('.ns [aria-label="Leave the shop"]').click()`);
  assert.equal(await b.ev('Module.yo2ShopOverlayOpen'), false, 'Back works on a pending restart');
  await b.ev(`Module.yo2ShopOverlay = false; Module.onYo2ShopOpen()`);
  assert.equal(await b.ev(`document.querySelectorAll('[aria-label="Card Shop"]').length`), 0);
  console.log('shop direct DOM: snapshot-free open, focus/input, layering, close, restart and scene/network teardown ok');
} finally { b.close(); server.kill(); }
