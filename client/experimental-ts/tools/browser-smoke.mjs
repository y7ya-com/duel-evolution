// Real Chromium bootstrap/layout smoke with explicit HTTP fixture; no original executable or live account.
import { createServer } from 'node:http';
import { readFileSync, existsSync } from 'node:fs';
import { resolve, extname } from 'node:path';
import assert from 'node:assert/strict';
import { launch } from '../../web-shell/htmlui/tools/cdp.mjs';
const root = resolve(import.meta.dirname, '..', 'dist');
if (!existsSync(resolve(root, 'index.html'))) throw new Error('Build the client first.');
const requests = [];
const server = createServer((req, res) => {
  const path = new URL(req.url, 'http://localhost').pathname; requests.push(path);
  if (path === '/api/de/session') { res.setHeader('content-type', 'application/json'); res.end('{"signedIn":false}'); return; }
  if (path === '/card-catalog.json') { res.setHeader('content-type', 'application/json'); res.end('[]'); return; }
  const file = resolve(root, '.' + path);
  if (!file.startsWith(root + '/') || !existsSync(file)) { res.statusCode = 404; res.end('Missing fixture resource'); return; }
  res.setHeader('content-type', extname(file) === '.js' ? 'application/javascript' : 'text/html');
  res.end(readFileSync(file));
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
let browser;
try {
  const port = server.address().port;
  browser = await launch({ port: 9571, width: 1024, height: 768 });
  const url = `http://127.0.0.1:${port}/index.html`;
  await browser.go(url, "document.querySelector('input[autocomplete=username]')");
  const desktop = await browser.ev(`({title:document.title,password:!!document.querySelector('input[type=password]'),legacy:typeof Module,wasmRequests:performance.getEntriesByType('resource').filter(x=>x.name.endsWith('.wasm')).length,overflow:document.documentElement.scrollWidth>innerWidth})`);
  assert.equal(desktop.password, true); assert.equal(desktop.legacy, 'undefined'); assert.equal(desktop.wasmRequests, 0); assert.equal(desktop.overflow, false);
  await browser.send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  assert.equal(await browser.ev('document.documentElement.scrollWidth <= innerWidth'), true);
  assert.equal(browser.logs.some(line => line.startsWith('exception:')), false, browser.logs.join('\n'));
  console.log(JSON.stringify({ desktop, mobileWidth:390, exceptionCount:0, requests, scope:'Bootstrap/account with fixture HTTP; no gameplay or original-visual parity claim.' },null,2));
} finally { browser?.close(); await new Promise(resolve => server.close(resolve)); }
