// The chat walked through the layer in headless Chrome (mock.html), plain screens/chat.js and the Svelte chat: the
// same DOM text and controls; new lines keep the rows already there (a selection survives) and follow the bottom
// while the player is there, never once they scrolled up; the player's typing survives snapshots that still hold the
// game's old text.   npm run build && node svelte/chat_dom_test.mjs
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { launch } from '../tools/cdp.mjs';
const here = path.dirname(fileURLToPath(import.meta.url));
const PORT = 8990 + process.pid % 9;
const srv = spawn('node', [path.join(here, '../serve.mjs'), String(PORT)], { stdio: ['ignore', 'pipe', 'inherit'] });
process.on('exit', () => srv.kill());
await new Promise(ok => srv.stdout.once('data', ok));
const b = await launch({});

const mock = JSON.parse(readFileSync(path.join(here, '../mock/chat.json')));
const at = (n, value) => {   // the mock with n log lines and the input's text
  const s = structuredClone(mock), cs = s.windows[0].controls;
  cs.find(c => c.cls.endsWith('Textlist')).items = Array.from({ length: n }, (_, i) => `line ${i + 1} ` + 'word '.repeat(i % 4));
  cs.find(c => c.cls.endsWith('Input')).value = value;
  return s;
};

const walk = async q => {
  await b.go(`http://127.0.0.1:${PORT}/htmlui/mock.html?s=chat${q}`);
  await b.ev(`new Promise(ok => { const t = setInterval(() => window.__ready && (clearInterval(t), ok()), 20); })`);
  return b.ev(`(() => {
    const root = document.getElementById('htmlui'), log = () => root.querySelector('[role=log]'), input = () => root.querySelector('input');
    const out = {};
    window.__render(${JSON.stringify(at(4, ''))});
    out.text = root.innerText.replace(/\\s+/g, ' ').trim();
    out.buttons = [...root.querySelectorAll('button')].map(e => e.textContent || e.getAttribute('aria-label'));
    const first = log().firstElementChild;
    window.__render(${JSON.stringify(at(30, ''))});
    const l = log();
    out.kept = l.firstElementChild === first;
    out.rows = l.children.length;
    out.atBottom = l.scrollHeight - l.scrollTop - l.clientHeight < 2;
    l.scrollTop = 0;
    window.__render(${JSON.stringify(at(31, ''))});
    out.stayedUp = log().scrollTop === 0;
    const i = input();
    i.focus();
    i.value = 'hello';
    i.dispatchEvent(new InputEvent('input'));
    window.__render(${JSON.stringify(at(31, 'he'))});   // a frame before the game has the whole line
    out.typed = input().value;
    out.same = input() === i;
    i.blur();
    window.__render(${JSON.stringify(at(31, 'game'))});
    out.blurred = input().value;
    return out;
  })()`);
};
const plain = await walk(''), svelte = await walk('&svelte=chat');
assert.ok(await b.ev(`performance.getEntriesByType('resource').some(r => r.name.includes('/gen/chat.js'))`), 'the Svelte build loaded');
assert.deepEqual(svelte, plain);
assert.deepEqual([svelte.kept, svelte.rows, svelte.atBottom, svelte.stayedUp, svelte.typed, svelte.same, svelte.blurred],
  [true, 30, true, true, 'hello', true, 'game']);
if (b.logs.length) console.log(b.logs.filter(l => !l.startsWith('api.')).join('\n'));
assert.ok(!b.logs.some(l => /error|svelte/i.test(l)), 'no page errors');
console.log('svelte chat_dom_test ok', JSON.stringify(svelte.buttons));
b.close();
process.exit(0);
