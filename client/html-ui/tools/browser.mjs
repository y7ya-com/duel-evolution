// Headless Chrome for Testing at 1024x768, DPR 1, serving client/html-ui/ over a local static server (ES modules and
// fetch need http). The owner's rule on this shared Mac: no browser while less than 20% of memory is free.
import { spawn, execSync } from 'node:child_process';
import { createServer } from 'node:http';
import { readFileSync, writeFileSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, extname } from 'node:path';

export const ROOT = resolve(new URL('..', import.meta.url).pathname);
const CHROME = process.env.CHROME || process.env.HOME + '/Library/Caches/ms-playwright/chromium-1243/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing';
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.json': 'application/json' };
const sleep = ms => new Promise(r => setTimeout(r, ms));

export async function open() {
  const free = +(/free percentage: (\d+)%/.exec(execSync('memory_pressure').toString())?.[1] ?? 100);
  if (free < 20) throw new Error(`only ${free}% memory free; not starting a browser`);
  const srv = createServer((q, r) => {
    const f = join(ROOT, decodeURIComponent(new URL(q.url, 'http://x').pathname));
    if (!f.startsWith(ROOT) || !existsSync(f)) { r.writeHead(404); return r.end(); }
    r.writeHead(200, { 'Content-Type': TYPES[extname(f)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    r.end(readFileSync(f));
  }).listen(0, '127.0.0.1');
  await new Promise(r => srv.on('listening', r));
  const base = `http://127.0.0.1:${srv.address().port}/`;
  const profile = join(tmpdir(), 'html-ui-chrome-' + process.pid), port = 9450 + (process.pid % 40);
  const ch = spawn('nice', ['-n', '5', CHROME, '--headless=new', '--remote-debugging-port=' + port, '--user-data-dir=' + profile,
    '--window-size=1024,768', '--force-device-scale-factor=1', '--hide-scrollbars', '--no-first-run', '--use-angle=metal',
    '--ignore-gpu-blocklist', '--disable-background-timer-throttling', ...(process.env.CHROME_FLAGS || '').split(' ').filter(Boolean), 'about:blank'], { stdio: 'ignore' });
  const close = () => { try { ch.kill('SIGKILL'); } catch {} rmSync(profile, { recursive: true, force: true }); srv.close(); };
  process.on('exit', close);
  let ws;
  for (let i = 0; i < 50 && !ws; i++) {
    await sleep(200);
    try { ws = (await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()).find(x => x.type === 'page')?.webSocketDebuggerUrl; } catch {}
  }
  const sock = new WebSocket(ws);
  await new Promise(r => sock.onopen = r);
  let id = 0; const pend = new Map();
  sock.onmessage = m => { const d = JSON.parse(m.data); if (d.id && pend.has(d.id)) { pend.get(d.id)(d); pend.delete(d.id); } };
  const send = (method, params = {}) => new Promise(r => { const i = ++id; pend.set(i, r); sock.send(JSON.stringify({ id: i, method, params })); });
  const ev = async js => {
    const r = await send('Runtime.evaluate', { expression: js, awaitPromise: true, returnByValue: true });
    if (r.result?.exceptionDetails) throw new Error(JSON.stringify(r.result.exceptionDetails).slice(0, 600));
    return r.result?.result?.value;
  };
  await send('Page.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: 1024, height: 768, deviceScaleFactor: 1, mobile: false });
  const version = (await send('Browser.getVersion')).result.product;
  // load a page, wait for window.__ready (if the page sets it), run js, settle two frames, screenshot (base64 PNG)
  async function shot(page, out, js) {
    await send('Page.navigate', { url: /^[a-z]+:/i.test(page) ? page : base + page });
    await sleep(100);
    for (let i = 0; i < 100; i++) {
      if (await ev("document.readyState === 'complete' && (window.__ready === true || !document.querySelector('script[type=module]'))").catch(() => false)) break;
      await sleep(50);
    }
    if (js) await ev(js);
    await ev('new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)))');
    const png = (await send('Page.captureScreenshot', { format: 'png', clip: { x: 0, y: 0, width: 1024, height: 768, scale: 1 } })).result.data;
    if (out) writeFileSync(out, Buffer.from(png, 'base64'));
    return png;
  }
  return { base, send, ev, shot, close, version };
}
