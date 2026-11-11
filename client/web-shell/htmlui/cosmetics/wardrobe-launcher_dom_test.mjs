// The Wardrobe's menu-bar button (cosmetics/wardrobe-launcher.js) in headless Chrome, driven frame by frame as bridge.js
// drives it: up with the menu bar in the overworld (on the bar's free stretch, in its plate), gone in the shop and the
// duel and through a scene load, a click opens the Wardrobe (and the button steps aside until it closes), no key
// reaches the game. SHOTS=<dir>: a PNG of the bar and of the open Wardrobe (BG=<png>: under them).
//   node client/web-shell/htmlui/cosmetics/wardrobe-launcher_dom_test.mjs
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { launch } from '../tools/cdp.mjs';
const here = path.dirname(fileURLToPath(import.meta.url));
const PORT = 32000 + process.pid % 9000;
const srv = spawn('node', [path.join(here, '../serve.mjs'), String(PORT)], { stdio: ['ignore', 'pipe', 'inherit'] });
process.on('exit', () => srv.kill());
await new Promise(ok => srv.stdout.once('data', ok));
const b = await launch({ profile: process.env.HOME + '/.cache/de-scratch/wardrobe2/test-launcher-' + process.pid, port: 9790 + process.pid % 30, dpr: process.env.SHOTS ? 2 : 1 });
await b.go(`http://127.0.0.1:${PORT}/htmlui/skin.html`);
const sleep = ms => new Promise(r => setTimeout(r, ms));
const SHOTS = process.env.SHOTS, BG = process.env.BG ? 'data:image/png;base64,' + readFileSync(process.env.BG).toString('base64') : '';
if (SHOTS) mkdirSync(SHOTS, { recursive: true });
const shot = async name => { if (SHOTS) writeFileSync(path.join(SHOTS, name + '.png'), await b.shot()); };
const until = async (js, ms = 4000) => { for (const t = Date.now(); Date.now() - t < ms; await sleep(50)) if (await b.ev(js)) return true; throw new Error('timed out: ' + js); };

const look = [0, 0xa, 0x20, 0x30, 0x40, 0x60, 0x87, 0x90, 0xb4, 0x50, 0, 0, 0, 0, 0, 0];
const INFO = { available: true, boxes: [], catalog: [], inventory: [{ id: 'outfit:jaden', name: "Jaden's Costume", kind: 'outfit', slot: 6, rarity: 'common',
  variants: [{ gender: 'male', bit: 0x87, number: 0x87, worlds: [0, 1] }], bodies: ['male'], owned: true, copies: 0, compatible: true }],
  appearance: { gender: 'male', world: 1, parts: look, looks: { 0: look, 1: look } }, rank: { bestSchool: 'slifer', uniforms: ['slifer'], graduated: false } };
await b.ev(`(async () => {
  document.body.innerHTML = '<div id="canvas" style="position:absolute;left:0;top:0;width:1024px;height:768px;background:#345 0 0/1024px 768px ${BG ? `url(${BG})` : ''}"></div>';
  window.__gameKeys = 0; addEventListener('keydown', () => __gameKeys++);
  window.fetch = async () => ({ ok: true, status: 200, json: async () => (${JSON.stringify(INFO)}) });
  window.Module = { yo2Lazy: { files: new Map(), files2: { has: () => false }, entry: async () => null } };
  const { wardrobeLauncherFrame, launcherPlace, SPOT } = await import('/htmlui/cosmetics/wardrobe-launcher.js');
  window.__place = launcherPlace; window.__spot = SPOT;
  window.__snap = { scene: 12, windows: [{ cls: 'CWindowModelMenu', x: 0, y: 736, w: 384, h: 32, shown: true,
    controls: [0, 80, 160].map(x => ({ cls: 'CWindowTaskPictureSwitch', x, y: 0, w: 80, h: 32, shown: true })) }] };
  window.__wait = false;
  setInterval(() => wardrobeLauncherFrame(__snap, __wait), 30);
})()`);

// the lobby (scene 12) with the bar: the button, on the bar's free stretch, in its plate
await until(`!!document.querySelector('.de-wdl button')`);
assert.deepEqual(await b.ev(`(() => { const r = document.querySelector('.de-wdl button').getBoundingClientRect(); return [r.left, r.top, r.width, r.height]; })()`), [240, 736, 80, 32]);
assert.equal(await b.ev(`document.querySelector('.de-wdl button').getAttribute('aria-label')`), 'Wardrobe');
assert.equal(await b.ev(`document.querySelector('.de-wdl button').dataset.look`), 'normal');
await b.ev(`document.querySelector('.de-wdl button').dispatchEvent(new MouseEvent('mouseenter'))`);
assert.equal(await b.ev(`document.querySelector('.de-wdl button').dataset.look`), 'hover');
await shot('launcher-bar');
// a start screen (Select Player): the bar is up with none of the game's buttons, so no Wardrobe either
assert.equal(await b.ev(`__place({ scene: 12, windows: [{ cls: 'CWindowModelMenu', x: 0, y: 736, w: 384, h: 32, shown: true, controls: [] }] })`), null);
// character creation: the bar is up, the Wardrobe is not
assert.equal(await b.ev(`__place({ ...__snap, windows: [...__snap.windows, { cls: 'CWindowDialogAvatarSwitch', x: 0, y: 0, w: 336, h: 550, shown: false }] })`), null);
// the shop, a duel, a scene load, no bar: none
for (const [what, js] of [['shop', `__snap.scene = 14`], ['duel', `__snap.scene = 0x1c`], ['load', `__snap.scene = 12; __wait = true`],
  ['no bar', `__wait = false; __snap.windows[0].shown = false`]]) {
  await b.ev(js);
  await until(`!document.querySelector('.de-wdl')`, 2000).catch(() => { throw new Error('still up: ' + what); });
}
assert.equal(await b.ev(`__place({ scene: 10, windows: [{ cls: 'CWindowModelMenu', shown: true }] })`), null, 'a bar without buttons');
// Follow the native button slots, including My Room's single button and the lobby's three.
assert.deepEqual(await b.ev(`__place({ scene: 10, windows: [{ cls: 'CWindowModelMenu', shown: true, x: 0, y: 736,
  controls: [{ cls: 'CWindowTaskPictureSwitch', shown: true, x: 0, w: 80 }] }] })`), { x: 80, y: 736, w: 80, h: 32 });
assert.equal(await b.ev(`__place({ scene: 12, windows: [{ cls: 'CWindowModelMenu', shown: true, controls:
  [0, 80, 160].map(x => ({ cls: 'CWindowTaskPictureSwitch', shown: true, x, w: 80 })) }] }).x`), 240);
assert.equal(await b.ev(`__place({ scene: 12, windows: [{ cls: 'CWindowModelMenu', shown: true, controls:
  [{ cls: 'CWindowTaskPictureSwitch', shown: true, x: 160, w: 80 }, { cls: 'CNoticeIconFriend', shown: true, x: 248, w: 32 }] }] }).x`), 320);
// back in the lobby: the button reports its slot to the bar (the message field starts after it), held it shows pressed,
// a click opens the Wardrobe and the button stays pressed, over the window's dim, until it closes
await b.ev(`__snap.windows[0].shown = true`);
await until(`!!document.querySelector('.de-wdl button')`);
assert.equal(await b.ev(`import('/htmlui/screens/lobby_icons.js').then(m => m.barReserve())`), 320);
await b.ev(`document.querySelector('.de-wdl button').dispatchEvent(new MouseEvent('mousedown'))`);
assert.equal(await b.ev(`document.querySelector('.de-wdl button').dataset.look`), 'pressed');
await b.ev(`document.querySelector('.de-wdl button').dispatchEvent(new MouseEvent('mouseup'))`);
await b.ev(`document.querySelector('.de-wdl button').click()`);
await until(`!!document.querySelector('.de-wd .wd-tile')`);
assert.equal(await b.ev(`document.querySelector('.de-wdl').hidden`), false, 'still on the bar');
await until(`document.querySelector('.de-wdl').hasAttribute('data-open')`);
assert.equal(await b.ev(`document.querySelector('.de-wdl button').dataset.look`), 'pressed');
assert.equal(await b.ev(`document.querySelector('.de-wdl button').getAttribute('aria-pressed')`), 'true');
assert.ok(await b.ev(`+getComputedStyle(document.querySelector('.de-wdl')).zIndex > +getComputedStyle(document.querySelector('.de-wd')).zIndex`), 'over the dim');
await b.ev(`document.querySelector('.de-wdl button').dispatchEvent(new MouseEvent('mouseleave'))`);
assert.equal(await b.ev(`document.querySelector('.de-wdl button').dataset.look`), 'pressed', 'pressed while open, hovered or not');
await sleep(800);
await shot('launcher-wardrobe');
const keys = await b.ev('__gameKeys');
await b.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
await until(`!document.querySelector('.de-wd')`);
assert.equal(await b.ev('__gameKeys'), keys, 'no key reached the game');
await until(`!document.querySelector('.de-wdl').hasAttribute('data-open') && document.querySelector('.de-wdl button').dataset.look === 'normal'`);
// a click on the open window's button closes it
await b.ev(`document.querySelector('.de-wdl button').click()`);
await until(`!!document.querySelector('.de-wd')`);
await b.ev(`document.querySelector('.de-wdl button').click()`);
await until(`!document.querySelector('.de-wd') && document.querySelector('.de-wdl button').dataset.look !== 'pressed'`);
// away: its slot is free again
await b.ev(`__snap.scene = 14`);
await until(`!document.querySelector('.de-wdl')`);
assert.equal(await b.ev(`import('/htmlui/screens/lobby_icons.js').then(m => m.barReserve())`), 0);
assert.deepEqual(b.logs.filter(l => /^(error|exception)/.test(l)), []);
console.log('wardrobe-launcher_dom_test: ok');
b.close(); process.exit(0);
