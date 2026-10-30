// controls/scroll.js in a headless page: scroll by hand, onTop, stick-to-bottom, the scroll position kept on update.
//   node tools/scroll_check.mjs
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import assert from 'node:assert/strict';
import { launch } from './cdp.mjs';
const here = path.dirname(fileURLToPath(import.meta.url)), PORT = 8990 + process.pid % 9;
const srv = spawn('node', [path.join(here, '../serve.mjs'), String(PORT)], { stdio: ['ignore', 'pipe', 'inherit'] });
await new Promise(ok => srv.stdout.once('data', ok));
const b = await launch({ port: 9450 + process.pid % 9 });
await b.go(`http://127.0.0.1:${PORT}/htmlui/mock.html?s=playerselect`);
const r = await b.ev(`(async () => {
  const { scrollList } = await import('/htmlui/controls/scroll.js');
  const host = document.body, row = (s) => Object.assign(document.createElement('div'), { textContent: s });
  const L = scrollList(host, { x: 0, y: 0, w: 200, h: 80, rowH: 16, stick: true });
  const items = Array.from({ length: 30 }, (_, i) => 'line ' + i);
  L.el.scrollTop = 1e6; L.set(items, row);              // starts at the bottom: stays there
  const out = { bottom1: L.atBottom() };
  items.push('line 30'); L.set(items, row);
  out.bottom2 = L.atBottom();                          // a new line, still at the bottom
  let top = -1; L.onTop = i => { top = i; };
  L.el.dispatchEvent(new WheelEvent('wheel')); L.el.scrollTop = 160;
  await new Promise(r => setTimeout(r, 50));
  out.top = top;                                       // the player scrolled: row 10 first
  items.push('line 31'); L.set(items, row);
  out.kept = L.el.scrollTop;                           // scrolled up: a new line does not move it
  out.rows = L.rows.children.length;
  return out;
})()`);
console.log(JSON.stringify(r));
assert.deepEqual(r, { bottom1: true, bottom2: true, top: 10, kept: 160, rows: 32 });
console.log('scroll_check: ok');
b.close(); srv.kill(); process.exit(0);
