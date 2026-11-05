// The Missions button (rewards/launcher.js) in headless Chrome, driven frame by frame as bridge.js drives it beside the
// Wardrobe's: the slot after the Wardrobe's on the menu bar, the red dot with the claimable count (and its label),
// none while rewards are off on the server, gone in the shop / duel / a scene load / character creation, asked again
// when back on the bar, a click opens the Missions window (both buttons step aside until it closes), no key reaches
// the game. SHOTS=<dir>: a PNG of the bar (BG=<png>: under it).
//   node client/web-shell/htmlui/rewards/launcher_dom_test.mjs
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { launch } from '../tools/cdp.mjs';
const here = path.dirname(fileURLToPath(import.meta.url));
const PORT = 34000 + process.pid % 9000;
const srv = spawn('node', [path.join(here, '../serve.mjs'), String(PORT)], { stdio: ['ignore', 'pipe', 'inherit'] });
process.on('exit', () => srv.kill());
await new Promise(ok => srv.stdout.once('data', ok));
const b = await launch({ profile: process.env.HOME + '/.cache/de-scratch/rewardsui/test-launcher-' + process.pid, port: 9860 + process.pid % 30, dpr: process.env.SHOTS ? 2 : 1 });
await b.go(`http://127.0.0.1:${PORT}/htmlui/skin.html`);
const sleep = ms => new Promise(r => setTimeout(r, ms));
const SHOTS = process.env.SHOTS, BG = process.env.BG ? 'data:image/png;base64,' + readFileSync(process.env.BG).toString('base64') : '';
if (SHOTS) mkdirSync(SHOTS, { recursive: true });
const until = async (js, ms = 4000) => { for (const t = Date.now(); Date.now() - t < ms; await sleep(50)) if (await b.ev(js)) return true; throw new Error('timed out: ' + js); };
const btn = `document.querySelector('.de-rwl button')`;

const m = (id, kind, progress, claimed = false) => ({ id, label: id, event: 'play', target: 1, progress, mp: 80, kind, claimed, claimable: !claimed && progress >= 1 });
const VIEW = { wallet: { total: 1000, bound: 0, earned: 1000 }, day: '2026-11-05', week: '2026-11-02', stockpileCap: 9, nextRequestId: 'r1',
  login: { day: '2026-11-05', count: 1, streak: 1, cycleDay: 1, calendar: [] },
  missions: [m('daily:a', 'daily', 1), m('daily:b', 'daily', 0), m('first:deck', 'first', 1), m('first:shop', 'first', 1, true)] };
await b.ev(`(async () => {
  document.body.innerHTML = '<div id="canvas" style="position:absolute;left:0;top:0;width:1024px;height:768px;background:#345 0 0/1024px 768px ${BG ? `url(${BG})` : ''}"></div>';
  window.__gameKeys = 0; addEventListener('keydown', () => __gameKeys++);
  window.Module = { yo2Lazy: { files: new Map(), files2: { has: () => false }, entry: async () => null } };
  window.__off = true; window.__gets = 0;
  window.fetch = async url => {
    if (String(url).includes('/rewards')) { __gets++; return __off ? { ok: false, status: 503, json: async () => ({ error: 'rewards-disabled' }) } : { ok: true, status: 200, json: async () => (${JSON.stringify(VIEW)}) }; }
    return { ok: true, status: 200, json: async () => ({ available: true, boxes: [], catalog: [], inventory: [], appearance: { gender: 'male', world: 1, parts: [], looks: {} } }) };
  };
  const { missionsLauncherFrame, missionsPlace, _resetMissionsLauncher } = await import('/htmlui/rewards/launcher.js');
  const { wardrobeLauncherFrame } = await import('/htmlui/cosmetics/wardrobe-launcher.js');
  window.__place = missionsPlace; window.__resetL = _resetMissionsLauncher;
  window.__snap = { scene: 12, windows: [{ cls: 'CWindowModelMenu', x: 0, y: 736, w: 384, h: 32, shown: true, controls:
    [0, 80, 160].map(x => ({ cls: 'CWindowTaskPictureSwitch', shown: true, x, w: 80 })) }] };
  window.__wait = false;
  setInterval(() => { wardrobeLauncherFrame(__snap, __wait); missionsLauncherFrame(__snap, __wait); }, 30);
})()`);

// rewards off on the server: the Wardrobe's button only, and the server was asked once
await until(`!!document.querySelector('.de-wdl button') && __gets === 1`);
await sleep(300);
assert.equal(await b.ev(`!!document.querySelector('.de-rwl')`), false, 'no button while rewards are off');
assert.equal(await b.ev('__gets'), 1, 'not asked every frame');

// on: the slot after the Wardrobe's (the lobby's three buttons, the Wardrobe at 240, Missions at 320), the count
await b.ev(`__off = false; __resetL()`);
await until(`!!${btn}`);
assert.deepEqual(await b.ev(`(() => { const r = ${btn}.getBoundingClientRect(); return [r.left, r.top, r.width, r.height]; })()`), [320, 736, 80, 32]);
assert.deepEqual(await b.ev(`(() => { const r = document.querySelector('.de-wdl button').getBoundingClientRect(); return [r.left, r.top]; })()`), [240, 736]);
await until(`${btn}.querySelector('b').hidden === false`);
assert.equal(await b.ev(`${btn}.querySelector('b').textContent`), '2');
assert.equal(await b.ev(`${btn}.getAttribute('aria-label')`), 'Missions, 2 rewards to claim');
await b.ev(`${btn}.dispatchEvent(new MouseEvent('mouseenter'))`);
assert.equal(await b.ev(`${btn}.dataset.look`), 'hover');
if (SHOTS) writeFileSync(path.join(SHOTS, 'launcher-bar.png'), await b.shot({ x: 0, y: 700, width: 480, height: 68 }));
await b.ev(`${btn}.dispatchEvent(new MouseEvent('mouseleave'))`);
// My Room's one button: Wardrobe at 80, Missions at 160; a notice reserves its slot
assert.equal(await b.ev(`__place({ scene: 10, windows: [{ cls: 'CWindowModelMenu', shown: true, x: 0, y: 736, controls: [{ cls: 'CWindowTaskPictureSwitch', shown: true, x: 0, w: 80 }] }] }).x`), 160);
assert.equal(await b.ev(`__place({ scene: 12, windows: [{ cls: 'CWindowModelMenu', shown: true, controls:
  [{ cls: 'CWindowTaskPictureSwitch', shown: true, x: 160, w: 80 }, { cls: 'CNoticeIconFriend', shown: true, x: 248, w: 32 }] }] }).x`), 400);
// character creation: none
assert.equal(await b.ev(`__place({ ...__snap, windows: [...__snap.windows, { cls: 'CWindowDialogAvatarSwitch', shown: false }] })`), null);
// the shop, a duel, a scene load, no bar: gone; back on the bar it asks again (the progress may have moved)
for (const [what, js] of [['shop', `__snap.scene = 14`], ['duel', `__snap.scene = 0x1c`], ['load', `__snap.scene = 12; __wait = true`],
  ['no bar', `__wait = false; __snap.windows[0].shown = false`]]) {
  await b.ev(js);
  await until(`!document.querySelector('.de-rwl')`, 2000).catch(() => { throw new Error('still up: ' + what); });
}
const before = await b.ev('__gets');
await sleep(2100);
await b.ev(`__snap.windows[0].shown = true`);
await until(`!!${btn}`);
await until(`__gets === ${before + 1}`);

// a click opens the Missions window; its button stays on the bar, pressed, until it closes; no key reaches the game
await b.ev(`${btn}.click()`);
await until(`!!document.querySelector('.de-rw .rw-row')`);
assert.equal(await b.ev(`document.querySelector('.de-rwl').hidden`), false);
await until(`document.querySelector('.de-rwl').hasAttribute('data-open') && ${btn}.dataset.look === 'pressed'`);
const keys = await b.ev('__gameKeys');
await b.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
await until(`!document.querySelector('.de-rw')`);
assert.equal(await b.ev('__gameKeys'), keys, 'no key reached the game');
await until(`!document.querySelector('.de-rwl').hasAttribute('data-open') && ${btn}.dataset.look === 'normal'`);
// Enter on the focused button opens it, the key stays with the button
await b.ev(`${btn}.focus()`);
await b.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13, text: '\r' });
await until(`!!document.querySelector('.de-rw')`);
assert.equal(await b.ev('__gameKeys'), keys, 'Enter stayed with the button');
assert.deepEqual(b.logs.filter(l => /^(error|exception)/.test(l)), []);
console.log('rewards launcher_dom_test: ok');
b.close(); process.exit(0);
