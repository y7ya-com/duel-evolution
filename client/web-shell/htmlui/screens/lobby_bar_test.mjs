// The menu bar (screens/lobby.js and its Svelte group, svelte/lobby/MenuBar.svelte: CWindowModelMenu) never leaves the
// player without its buttons (Free Duel's lobby on
// live: the page's art had no menuicon_02_c01, the bar showed empty, no way out). Headless (mock.html), the live
// Free Duel bar (mock/menubar-free.json: Main Menu, Duel, Move):
// - plain lobby.js: its plates are CSS and its pictograms hand-drawn until the atlas loads (lobby_icons.js glyph), so
//   with the atlas missing or there it draws the three buttons and passes none;
// - the Svelte group, its art missing: the page draws nothing in the bar and every control of it passes to the game,
//   which draws it; its art there: the page draws the three buttons and passes none.
//   npm run build && node client/web-shell/htmlui/screens/lobby_bar_test.mjs
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { launch } from '../tools/cdp.mjs';
const here = path.dirname(fileURLToPath(import.meta.url));
const PORT = 8970 + process.pid % 9;
const srv = spawn('node', [path.join(here, '../serve.mjs'), String(PORT)], { stdio: ['ignore', 'pipe', 'inherit'] });
process.on('exit', () => srv.kill());
await new Promise(ok => srv.stdout.once('data', ok));
const b = await launch({});
const snap = JSON.parse(readFileSync(path.join(here, '../mock/menubar-free.json'), 'utf8'));
const win = snap.windows[0], ids = win.controls.map(c => c.id);
const switches = win.controls.filter(c => c.cls === 'CWindowTaskPictureSwitch' && c.shown);
assert.equal(switches.length, 3);

// each version: its page query, its module, its buttons' and strip's selectors
const PLAIN = ['', '/htmlui/screens/lobby.js', '.lb-icon', '.lb-bar', true], SVELTE = ['&svelte=lobby', '/htmlui/gen/lobby.js', '.icon', '.bar', false];
async function bar(missing, [q, mod, icon, strip]) {
  // the bar's atlas missing from the art set: its image fails to load, as a 404 does
  await b.send('Page.enable');
  const add = missing && await b.send('Page.addScriptToEvaluateOnNewDocument', { source:
    `{ const d = HTMLImageElement.prototype.decode; HTMLImageElement.prototype.decode = function () { return /menuicon/.test(this.src) ? Promise.reject(new Error('404 ' + this.src)) : d.call(this); }; }` });
  await b.go(`http://127.0.0.1:${PORT}/htmlui/mock.html?s=chat${q}`);
  if (add) await b.send('Page.removeScriptToEvaluateOnNewDocument', { identifier: add.result.identifier });
  await b.ev(`window.__render(${JSON.stringify(snap)})`);
  await new Promise(r => setTimeout(r, 800));   // the atlas loads (or fails)
  await b.ev(`window.__render(${JSON.stringify({ ...snap, frame: 2 })})`);
  return b.ev(`(async () => {
    const m = (await import('${mod}')).default, win = ${JSON.stringify(win)};
    const root = [...document.querySelectorAll('#htmlui > .win')].find(r => r.style.top === '${win.y}px');
    return { icons: root.querySelectorAll('${icon}').length, strip: root.querySelectorAll('${strip}').length,
      pass: win.controls.filter(c => m.passthrough(c)).map(c => c.id) };
  })()`);
}

for (const v of [PLAIN, SVELTE]) {
  const without = await bar(true, v);
  if (v[4]) {
    assert.equal(without.icons, 3, v[0] + ' no art: the page still draws the three buttons (CSS plates, drawn pictograms)');
    assert.equal(without.strip, 1);
    assert.deepEqual(without.pass, [], 'no art: nothing of the bar passes');
  } else {
    assert.equal(without.icons, 0, v[0] + ' no art: no page buttons');
    assert.equal(without.strip, 0, 'no art: no page strip over the game\'s buttons');
    assert.deepEqual(without.pass.sort(), [...ids].sort(), 'no art: the whole bar is the game\'s');
  }
  const withArt = await bar(false, v);
  assert.equal(withArt.icons, 3, v[0] + ' the art there: the page draws the three buttons');
  assert.equal(withArt.strip, 1);
  assert.deepEqual(withArt.pass, [], 'the art there: nothing of the bar passes');
}
b.close();
console.log('lobby_bar_test: ok');
process.exit(0);
