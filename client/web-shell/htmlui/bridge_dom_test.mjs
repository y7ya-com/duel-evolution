// The bridge's layer in headless Chrome (mock.html): a pass window over an owned HTML window hands the pointer to the
// game, not to the owned window's DOM under it (htmlui-select: the find menu over the chat took no click). The chat
// (owned) with the lobby's Main Menu (pass) over its left end, a stand-in #canvas recording what reaches it: a press
// on the menu reaches the canvas; the chat elsewhere keeps its own; no catcher without an owned window under.
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
const menu = (x, y) => ({ id: 10, cls: 'CMainMenu', x, y, w: 240, h: 200, z: chat.z + 50, wz: 0, shown: true, alpha: 1, controls: [
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

// the menu over the chat's left end (x 124..260, y 632..760 shared)
assert.equal(await render(snap([chat, menu(20, 600)])), 1);
const onMenu = await press(200, 700);
assert.equal(onMenu.hit, 'htmlui-catch', 'the menu takes the pointer where it is over the chat');
assert.deepEqual(onMenu.got.filter(t => t !== 'mousemove'), ['mousedown', 'mouseup'], 'the press reaches the game');
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
