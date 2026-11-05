// The speech bubbles (live-chat.js) in headless Chrome, a stand-in #canvas and a fake /api/de/chat: a public line bubbles
// over its speaker's avatar and follows it; the newest line per player; whispers and team lines never bubble; text stays
// text; the first poll's lines (said before the page was here) don't bubble; bubbles expire; none out of the online world;
// the server's clock a minute ahead of the page's changes none of it.
//   node client/web-shell/htmlui/live-chat_dom_test.mjs
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { launch } from './tools/cdp.mjs';
const here = path.dirname(fileURLToPath(import.meta.url)), port = 9340 + process.pid % 10;
const server = spawn('node', [path.join(here, 'serve.mjs'), String(port)], { stdio: ['ignore', 'pipe', 'inherit'] });
let browser;
try {
  await new Promise(r => server.stdout.once('data', r));
  browser = await launch({ port: 9840 + process.pid % 20 });
  await browser.go(`http://127.0.0.1:${port}/htmlui/mock.html?s=chat`);
  await browser.ev(`(async () => {
    const { makeLiveChat } = await import('/htmlui/live-chat.js');
    document.getElementById('canvas')?.remove();
    const canvas = document.createElement('canvas'); canvas.id = 'canvas'; canvas.width = 1024; canvas.height = 768;
    canvas.style.cssText = 'position:fixed;left:0;top:0;width:1024px;height:768px;pointer-events:none';
    document.body.prepend(canvas);
    window.__clock = Date.now(); window.__polls = 0; const skew = 60000;
    window.__messages = [{ id: 1, at: window.__clock + skew, pid: 1002, name: 'Bob', channel: 'global', text: 'said before the page' }];
    window.__chat = makeLiveChat({ clock: () => window.__clock, fetcher: async url => {
      window.__polls++;
      const after = Number(new URL(url, location.href).searchParams.get('after')) || 0;
      return { ok: true, json: async () => ({ cursor: window.__messages.length, now: window.__clock + skew, pid: 1001, name: 'Alice', messages: window.__messages.filter(m => m.id > after) }) };
    } });
    window.__snapshot = { chatOnline: true, scene: 11, windows: [], chatAvatars: [{ pid: 1001, x: 250, y: 200 }, { pid: 1002, x: 400, y: 200 }] };
    window.__tick = async (ms = 2100) => { window.__clock += ms; window.__chat.update(window.__snapshot); await new Promise(r => setTimeout(r, 30)); window.__chat.update(window.__snapshot); };
    window.__say = (pid, channel, text) => window.__messages.push({ id: window.__messages.length + 1, at: window.__clock + skew, pid, name: pid === 1001 ? 'Alice' : 'Bob', channel, text });
    window.__bubbles = () => [...document.querySelectorAll('#de-chat-bubbles .speech')].map(n => [n.textContent, parseFloat(n.style.left), parseFloat(n.style.top)]);
    await window.__tick(0);
  })()`);
  const bubbles = () => browser.ev('window.__bubbles()');
  assert.deepEqual(await bubbles(), [], "the first poll's lines are history: no bubble");

  await browser.ev(`window.__say(1001, 'global', 'Hello from the lobby'); window.__tick()`);
  await new Promise(r => setTimeout(r, 60));
  assert.deepEqual(await bubbles(), [['Hello from the lobby', 250, 200]], 'a Global line over its speaker');
  await browser.ev(`window.__snapshot.chatAvatars[0].x = 350; window.__chat.update(window.__snapshot)`);
  assert.equal((await bubbles())[0][1], 350, 'the bubble follows the avatar');

  await browser.ev(`window.__say(1002, 'whisper', 'private <img src=x onerror=alert(1)>'); window.__say(1002, 'team', 'team only'); window.__tick()`);
  await new Promise(r => setTimeout(r, 60));
  assert.deepEqual((await bubbles()).map(b => b[0]), ['Hello from the lobby'], 'whispers and team lines never bubble');

  await browser.ev(`window.__say(1002, 'trade', 'WTS <b>Dark Magician</b>'); window.__say(1001, 'global', 'newest'); window.__tick()`);
  await new Promise(r => setTimeout(r, 60));
  assert.deepEqual((await bubbles()).map(b => b[0]).sort(), ['WTS <b>Dark Magician</b>', 'newest'], 'Trade bubbles; the newest per player');
  assert.equal(await browser.ev(`document.querySelector('#de-chat-bubbles b, #de-chat-bubbles img')`), null, 'untrusted text stays text');

  await browser.ev(`window.__snapshot.chatAvatars = window.__snapshot.chatAvatars.filter(a => a.pid !== 1002); window.__chat.update(window.__snapshot)`);
  assert.deepEqual((await bubbles()).map(b => b[0]), ['newest'], 'no avatar on screen: no bubble');

  await browser.ev(`window.__tick(7000)`);
  assert.deepEqual(await bubbles(), [], 'bubbles expire');

  await browser.ev(`window.__say(1001, 'global', 'again'); window.__tick()`);
  await new Promise(r => setTimeout(r, 60));
  assert.equal((await bubbles()).length, 1);
  const polls = await browser.ev('window.__polls');
  await browser.ev(`window.__snapshot.chatOnline = false; window.__tick()`);
  assert.deepEqual(await bubbles(), [], 'out of the online world: no bubbles');
  assert.equal(await browser.ev('window.__polls'), polls, 'and no polling');
  assert.deepEqual(browser.logs.filter(l => l.startsWith('exception:')), []);
  await browser.ev(`window.__chat.destroy()`);
  assert.equal(await browser.ev(`document.getElementById('de-chat-bubbles')`), null);
  console.log('live-chat_dom_test: bubbles over speakers, following them, public only, safe text, expiry and online-only passed');
} finally { browser?.close(); server.kill(); }
