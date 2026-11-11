// The loading screen (loader.js) over stage.js's page in headless Chrome: its box is over the HTML UI's layers (a
// stand-in #htmlui-host at its z-index 4 on <body>), at the canvas's place, from the boot through a scene load. The
// box once sat inside #stage (a stacking context at z 0): every scene load showed the next scene's HTML windows,
// unskinned, over the "Loading..." veil. With the private loader/ art (infra/fetch-private.sh): the ring's layers are
// in .spin, posed by their CSS animation, and the boot's grid scrolls while a scene's stands still.
//   node client/web-shell/loader_dom_test.mjs
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { launch } from './htmlui/tools/cdp.mjs';
const here = path.dirname(fileURLToPath(import.meta.url));
const PORT = 33000 + process.pid % 9000;
const srv = spawn('node', [path.join(here, 'htmlui/serve.mjs'), String(PORT)], { stdio: ['ignore', 'pipe', 'inherit'] });
process.on('exit', () => srv.kill());
await new Promise(ok => srv.stdout.once('data', ok));
const b = await launch({ profile: process.env.HOME + '/.cache/de-scratch/loader-test-' + process.pid, port: 9820 + process.pid % 30, width: 1440, height: 900 });
await b.go(`http://127.0.0.1:${PORT}/htmlui/skin.html`);
const sleep = ms => new Promise(r => setTimeout(r, ms));
const until = async (js, ms = 5000) => { for (const t = Date.now(); Date.now() - t < ms; await sleep(50)) if (await b.ev(js)) return true; throw new Error('timed out: ' + js); };

await b.ev(`(async () => {
  history.replaceState(null, '', '/');   // loader.js's art is page-relative (loader/), as on the game's page
  document.head.innerHTML = '<meta charset="utf-8">';
  document.body.innerHTML = '<canvas id="canvas" width="1024" height="768"></canvas>';
  window.Module = {};
  for (const src of ['/stage.js', '/loader.js']) await new Promise((ok, no) => document.body.append(Object.assign(document.createElement('script'), { src, onload: ok, onerror: no })));
  const host = document.createElement('div');   // bridge.js's layer: fixed on <body>, z-index 4, a window in it
  host.id = 'htmlui-host';
  host.style.cssText = 'position:fixed;left:0;top:0;width:100%;height:100%;z-index:4;background:rgba(0,0,0,.8)';
  document.body.append(host);
})()`);
// what is drawn on top at a point of the canvas (pointer-events on for the look: both layers take none)
const top = (x, y) => b.ev(`(() => {
  const ld = document.getElementById('loading'), host = document.getElementById('htmlui-host'), r = document.getElementById('canvas').getBoundingClientRect();
  ld.style.pointerEvents = host.style.pointerEvents = 'auto';
  for (const e of ld.querySelectorAll('*')) e.style.pointerEvents = 'none';
  const hit = document.elementsFromPoint(r.left + ${x} * r.width / 1024, r.top + ${y} * r.height / 768).find(e => e === ld || e === host);
  ld.style.pointerEvents = host.style.pointerEvents = '';
  return hit?.id;
})()`);

// the boot: the box on <body> (not in #stage), at the canvas's place, over the HTML UI
const at = await b.ev(`(() => { const ld = document.getElementById('loading'), c = document.getElementById('canvas');
  const a = ld.getBoundingClientRect(), r = c.getBoundingClientRect();
  return { parent: ld.parentElement.tagName, staged: c.parentElement.id, boot: ld.classList.contains('boot'),
    d: Math.max(Math.abs(a.left - r.left), Math.abs(a.top - r.top), Math.abs(a.width - r.width), Math.abs(a.height - r.height)) }; })()`);
assert.equal(at.parent, 'BODY', 'the box is on <body>');
assert.equal(at.staged, 'stage', 'stage.js put the canvas in #stage');
assert.ok(at.boot, 'booting');
assert.ok(at.d < 1, `the box covers the canvas (off by ${at.d}px)`);
assert.equal(await top(512, 700), 'loading', 'the boot screen is over the HTML UI');
assert.equal(await top(60, 20), 'loading');

const art = await b.ev(`fetch('/loader/ring.json').then(r => r.ok)`);
if (art) {
  await until(`document.querySelectorAll('#loading .spin img').length > 0`);
  const ring = await b.ev(`(() => { const i = document.querySelector('#loading .spin img'), s = getComputedStyle(i);
    return { inGrid: document.querySelectorAll('#loading .grid img').length, anim: s.animationName, shown: getComputedStyle(i.parentElement).display,
      grid: getComputedStyle(document.querySelector('#loading .grid i')).animationName }; })()`);
  assert.equal(ring.inGrid, 0, 'no ring layer in the grid');
  assert.match(ring.anim, /^yo2ring\d+$/, 'the ring layer plays its keyframes');
  assert.equal(ring.shown, 'block', 'the ring shows through the boot');
  assert.equal(ring.grid, 'yo2grid', 'the boot grid scrolls');
}

// booted (24 frames with draw calls on the game's canvas), then a scene load: the veil over the HTML UI again
await b.ev(`(() => { const gl = document.getElementById('canvas').getContext('webgl2'); let n = 0;
  const f = () => { gl.drawArrays(gl.POINTS, 0, 0); if (++n < 40) requestAnimationFrame(f); }; requestAnimationFrame(f); })()`);
await until(`document.getElementById('loading').style.display === 'none'`);
await b.ev(`Module.onYo2Scene('begin', 10, 7)`);
await until(`getComputedStyle(document.getElementById('loading')).opacity === '1'`);
const scene = await b.ev(`(() => { const ld = document.getElementById('loading');
  return { cls: ld.className, grid: getComputedStyle(ld.querySelector('.grid')).display, spin: getComputedStyle(ld.querySelector('.spin')).display }; })()`);
assert.equal(scene.cls, 'scene', 'a scene veil, not the boot screen');
assert.equal(scene.grid, 'none', "a scene's grid stands still (drawn on the canvas)");
assert.equal(scene.spin, 'block');
assert.equal(await top(512, 700), 'loading', "the scene veil is over the HTML UI's windows");
assert.equal(await top(60, 20), 'loading');
await b.ev(`Module.onYo2Scene('end', 10, 7)`);
await until(`document.getElementById('loading').style.display === 'none'`);
assert.equal(await top(512, 700), 'htmlui-host', 'the HTML UI after the veil');
console.log('loader_dom_test: ok');
b.close();
process.exit(0);
