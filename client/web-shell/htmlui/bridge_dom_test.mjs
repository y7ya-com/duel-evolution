// The bridge's layer in headless Chrome (mock.html): a pass window over an owned HTML window hands the pointer to the
// game, not to the owned window's DOM under it (htmlui-select: the find menu over the chat took no click). The chat
// (owned) with the lobby's Main Menu (pass) over its left end, a stand-in #canvas recording what reaches it: a press
// on the menu reaches the canvas; the chat elsewhere keeps its own; no catcher without an owned window under. The
// menu's own buttons (screens/lobby.js: data-modern-owned, laid out with Modern UI added, so not where the
// engine's are: live, the HTML Modern UI sat over the engine's Return to Title) take their press above the catcher and
// click their control (api.click), the canvas sees no raw press. The catcher covers the menu's frame where it outgrows
// the window (the module's occlusionBox), so a press there doesn't fall to the chat either.
//   node client/web-shell/htmlui/bridge_dom_test.mjs
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { launch } from './tools/cdp.mjs';
const here = path.dirname(fileURLToPath(import.meta.url));
const PORT = 8990 + process.pid % 9;
const srv = spawn('node', [path.join(here, 'serve.mjs'), String(PORT)], { stdio: ['ignore', 'pipe', 'inherit'] });
process.on('exit', () => srv.kill());
await new Promise(ok => srv.stdout.once('data', ok));
const b = await launch({});

const chat = JSON.parse(readFileSync(new URL('./mock/chat.json', import.meta.url))).windows[0];   // 124, 632, 776 x 128
const ctl = (id, cls, extra = {}) => ({ id, cls, parent: 0, x: 0, y: 0, w: 0, h: 0, shown: true, alpha: 1, state: 'normal', ...extra });
const menu = (x, y, h = 200) => ({ id: 10, cls: 'CMainMenu', x, y, w: 240, h, z: chat.z + 50, wz: 0, shown: true, alpha: 1, controls: [
  ctl(11, 'CWindowTaskShadowText', { text: 'Main Menu', x: 8, y: 4, w: 200 }),
  ctl(13, 'CWindowTaskButtonMain', { label: 'Duel', x: 12, y: 40, w: 216, h: 24 })] });
const snap = windows => ({ v: 1, scene: 11, windows, tasks: [] });

await b.go(`http://127.0.0.1:${PORT}/htmlui/mock.html?s=chat`);
await b.ev(`(() => {
  const c = document.createElement('canvas'); c.id = 'canvas'; window.__got = [];
  Object.assign(c.style, { position: 'fixed', left: 0, top: 0, width: '1024px', height: '768px', zIndex: -1 });
  for (const t of ['mousedown', 'mouseup', 'mousemove']) c.addEventListener(t, e => window.__got.push([t, e.clientX, e.clientY]));
  document.body.prepend(c);
})()`);
const press = async (x, y) => {
  await b.ev('window.__got = []');
  for (const type of ['mouseMoved', 'mousePressed', 'mouseReleased'])
    await b.send('Input.dispatchMouseEvent', { type, x, y, button: 'left', buttons: type === 'mousePressed' ? 1 : 0, clickCount: 1 });
  return b.ev(`({ got: window.__got.map(g => g[0]), hit: (e => e && (e.className || e.tagName))(document.elementFromPoint(${x}, ${y})) })`);
};
const render = s => b.ev(`window.__render(${JSON.stringify(s)}), document.querySelectorAll('.htmlui-catch').length`);

// the menu over the chat's left end (x 124..260, y 632..760 shared). screens/lobby.js draws it 96 high (Duel,
// Modern UI), its bottom at the bar (y 640..736), the buttons x 32..248: Duel y 672..696
assert.equal(await render(snap([chat, menu(20, 600)])), 1);
const onMenu = await press(254, 690);   // the frame right of the buttons
assert.equal(onMenu.hit, 'htmlui-catch', 'the menu takes the pointer where it is over the chat');
assert.deepEqual(onMenu.got.filter(t => t !== 'mousemove'), ['mousedown', 'mouseup'], 'the press reaches the game');
const logs = b.logs.length, onButton = await press(200, 684);
assert.equal(onButton.hit, 'yo2-mbtn', 'a menu button over the chat takes its own press');
assert.deepEqual(onButton.got, [], 'the button, not the canvas under it, has the press');
assert.ok(b.logs.slice(logs).some(l => /api\.click 13$/.test(l)), 'the button clicks its control: ' + b.logs.slice(logs));
b.logs.length = logs;
// a window 80 high (y 656..736) under a frame 96 high (640..736): over the chat, above the window's rect, the frame
assert.equal(await render(snap([chat, menu(20, 656, 80)])), 1);
const onFrame = await press(254, 648);
assert.equal(onFrame.hit, 'htmlui-catch', 'the catcher covers the frame above the window');
assert.deepEqual(onFrame.got.filter(t => t !== 'mousemove'), ['mousedown', 'mouseup'], 'that press reaches the game too');
await render(snap([chat, menu(20, 600)]));
const onChat = await press(600, 700);
assert.notEqual(onChat.hit, 'htmlui-catch');
assert.ok(!onChat.got.includes('mousedown'), "the chat's own DOM keeps its press: " + JSON.stringify(onChat));
// the menu clear of the chat: no catcher (its pointer falls through to the canvas as before)
assert.equal(await render(snap([chat, menu(20, 300)])), 0);
// the chat in front of the menu: no catcher either (a pass window behind an owned one)
assert.equal(await render(snap([{ ...chat, z: 1000 }, menu(20, 600)])), 0);
if (b.logs.length) console.log(b.logs.join('\n'));
console.log('bridge_dom_test ok', JSON.stringify(onMenu));
b.close();
process.exit(0);
