// Render the real Modern HUD components in isolated headless Chromium with native API calls recorded.
// No game session or production service is involved.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { launch } from '../../tools/cdp.mjs';
const here = path.dirname(fileURLToPath(import.meta.url));
const port = 9260 + process.pid % 10;
const server = spawn('node', [path.join(here, '../../serve.mjs'), String(port)], { stdio: ['ignore', 'pipe', 'inherit'] });
process.on('exit', () => server.kill());
await new Promise(resolve => server.stdout.once('data', resolve));
let browser;
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
const control = (id, cls, fields) => ({ id, cls: 'CWindowTask' + cls, parent: 0, x: 0, y: 0, w: 0, h: 0, shown: true, enabled: true, ...fields });
function snapshot(id, mode) {
  return { v: 1, scene: 12, focus: 0, tasks: [], windows: [
    { id, cls: 'CChatWindow', x: 248, y: 640, w: 776, h: mode === 2 ? 32 : 128, z: 1, wz: 1, shown: true, alpha: 1, online: true, world: true, mode,
      pairs: [{ tab: 100, log: 200, visible: true }, { tab: 101, log: 201, visible: true }], controls: [
        control(100, 'Tab', { label: 'All Chat', active: true, w: 72, h: 24 }),
        control(101, 'Tab', { label: 'TRADE', active: false, w: 72, h: 24 }),
        control(200, 'Textlist', { items: ['Test2:Anyone for a duel?'], w: 760, h: 80 }),
        control(201, 'Textlist', { items: [], shown: false, w: 760, h: 80 }),
        control(300, 'Input', { value: '', maxLen: 128, w: 760, h: 24, shown: mode !== 2 }),
        control(301, 'IconExpand', { w: 16, h: 24 }), control(302, 'IconHide', { w: 16, h: 24 }),
      ] },
    { id: 50, cls: 'CWindowModelPlace', x: 0, y: 0, w: 500, h: 40, z: 1, wz: 1, shown: true, alpha: 1, controls: [control(501, 'ShadowText', { text: 'Duelist Academy (2/1000)', w: 250, h: 24 })] },
    { id: 60, cls: 'CPlayerListDlg', x: 780, y: 400, w: 232, h: 172, z: 1, wz: 1, shown: true, alpha: 1, controls: [control(601, 'ActiveListbox', { items: ['Test2'], selected: -1, rows: 6, w: 200, h: 162 })] },
  ] };
}
try {
  browser = await launch({ port: 9790 + process.pid % 20 });
  await browser.go(`http://127.0.0.1:${port}/htmlui/mock.html?s=chat&modern=1`);
  await browser.ev(`(() => {
    const render = window.__render;
    window.__render = snapshot => { window.__last = snapshot; render(snapshot); };
    window.yo2Html = { snapshot: () => window.__last, modernScreens: new Map([['CChatWindow', 1]]) };
    const world = document.createElement('button'); world.id = 'world-hit'; world.textContent = 'World';
    Object.assign(world.style, { position: 'absolute', inset: '0', width: '1024px', height: '768px' });
    document.body.prepend(world);
  })()`);
  const render = async value => { await browser.ev(`window.__render(${JSON.stringify(value)})`); await pause(80); };
  // A lagging/failed native collapse must not reopen the DOM chat after its two-second wait.
  await render(snapshot(10, 1));
  await pause(2250);
  assert.equal(await browser.ev(`!!document.querySelector('.chat-heading')`), false, 'native failure cannot bring idle chrome back');
  await render(snapshot(11, 2));
  assert.equal(await browser.ev(`!!document.querySelector('.chat-heading')`), false);
  assert.equal(await browser.ev(`!!document.querySelector('.composer input')`), false);
  assert.equal(await browser.ev(`getComputedStyle(document.querySelector('.idle-log')).pointerEvents`), 'none');
  assert.equal(await browser.ev(`document.elementFromPoint(30, 670)?.id`), 'world-hit', 'idle message area passes clicks into the world');
  const location = await browser.ev(`(() => { const r = document.querySelector('.location').getBoundingClientRect(); return { right:r.right, top:r.top }; })()`);
  assert.deepEqual(location, { right: 1012, top: 12 });
  assert.equal(await browser.ev(`document.querySelector('.launcher').getAttribute('aria-expanded')`), 'false');
  await browser.ev(`document.querySelector('.launcher').click()`);
  assert.equal(await browser.ev(`document.querySelector('.roster').getBoundingClientRect().top`), 77);
  await browser.ev(`document.querySelector('.roster .icon:last-child').click()`);
  // Model only the native height transition; the real component still emits its own API actions.
  await browser.ev(`(() => {
    const log = console.log; console.log = (...args) => {
      log(...args);
      if (args[0] !== 'api.click' || ![301,302].includes(args[1])) return;
      setTimeout(() => { const s = structuredClone(window.__last), w = s.windows.find(w => w.cls === 'CChatWindow');
        w.mode = args[1] === 301 ? (w.mode === 2 ? 1 : 0) : 2;
        w.controls.find(c => c.id === 300).shown = w.mode !== 2; window.__render(s);
      }, 0);
    };
  })()`);
  await browser.ev(`document.body.dispatchEvent(new KeyboardEvent('keydown', { key:'Enter', bubbles:true }))`);
  await pause(250);
  assert.equal(await browser.ev(`document.activeElement === document.querySelector('.composer input')`), true, 'Enter reveals chat and focuses the composer');
  await browser.ev(`(() => { const first = document.querySelector('.log p'); first.dataset.survived = 'yes';
    const s = structuredClone(window.__last), w = s.windows.find(w => w.cls === 'CChatWindow');
    w.controls.find(c => c.id === 200).items.push('Test2:I have a new deck.');
    w.controls.find(c => c.id === 201).items.push('Trader:Trading spare cards'); window.__render(s);
  })()`);
  await pause(80);
  assert.equal(await browser.ev(`document.querySelector('.log p').dataset.survived`), 'yes', 'new messages retain existing history DOM');
  assert.match(await browser.ev(`document.querySelector('.chat-heading option[value="101"]').textContent`), /Trade.*1/, 'other channel counts unread messages');
  await browser.ev(`(() => { const select = document.querySelector('.chat-heading select'); select.value = '101'; select.dispatchEvent(new Event('change', { bubbles:true })); })()`);
  assert(browser.logs.some(line => line.includes('api.click 101')), 'changing channel clicks its native tab');
  await browser.ev(`(() => { const s = structuredClone(window.__last), w = s.windows.find(w => w.cls === 'CChatWindow');
    w.controls.find(c => c.id === 100).active = false; w.controls.find(c => c.id === 101).active = true;
    w.controls.find(c => c.id === 200).shown = false; w.controls.find(c => c.id === 201).shown = true; window.__render(s);
  })()`);
  await pause(80);
  assert.equal(await browser.ev(`document.querySelector('.composer input').placeholder`), 'Message Trade');
  await browser.ev(`(() => { const input = document.querySelector('.composer input'); input.value = 'Ready to duel'; input.dispatchEvent(new InputEvent('input', { bubbles:true })); input.dispatchEvent(new KeyboardEvent('keydown', { key:'Enter', bubbles:true })); })()`);
  await pause(100);
  assert(browser.logs.some(line => line.includes('api.setText 300 Ready to duel')), 'typing commits through the native input');
  assert(browser.logs.some(line => line.includes('api.char 13')), 'sending uses the native chat action');
  await pause(1350);
  assert.equal(await browser.ev(`!!document.querySelector('.composer input')`), true, 'typing focus keeps chat open');
  await browser.ev(`document.activeElement.dispatchEvent(new KeyboardEvent('keydown', { key:'Escape', bubbles:true }))`);
  await pause(100);
  assert.equal(await browser.ev(`!!document.querySelector('.chat-heading')`), false, 'Escape returns to transparent idle');
  // Hover opens without stealing focus; leaving closes it after a short grace period.
  await browser.ev(`document.querySelector('.chat-handle').dispatchEvent(new PointerEvent('pointerenter', { pointerType:'mouse' }))`);
  await pause(150);
  assert.equal(await browser.ev(`!!document.querySelector('.chat-heading')`), true);
  await browser.ev(`document.querySelector('.chat').dispatchEvent(new PointerEvent('pointerleave', { pointerType:'mouse' }))`);
  await pause(1350);
  assert.equal(await browser.ev(`!!document.querySelector('.chat-heading')`), false, 'hover-only interaction settles back to idle');
  await browser.ev(`(() => { const s = structuredClone(window.__last), w = s.windows.find(w => w.cls === 'CChatWindow'); w.online = false; w.world = false; window.__render(s); })()`);
  assert.equal(await browser.ev(`!!document.querySelector('.chat-handle,.idle-log,.chat-heading')`), false, 'signed-out scenes show no chat');
  assert.deepEqual(browser.logs.filter(line => line.startsWith('exception:')), [], 'no browser runtime errors');
  console.log('quiet-hud_dom_test: idle click-through, native lag, Enter/send/Esc, focus/hover and top-right HUD pass');
} finally { browser?.close(); server.kill(); }
