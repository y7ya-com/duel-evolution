// Local development gateway: game API and WebSockets stay local; only public, read-only
// published client assets are fetched from the live site. Never forward cookies upstream.
import http from 'node:http';
import https from 'node:https';
import net from 'node:net';
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { parseEnv } from 'node:util';

const port = 8787;
const backend = 8788;
const modern = process.env.DUEL_MODERN_UI_DIR;
const testSecret = parseEnv(fs.readFileSync(new URL('../.dev.vars', import.meta.url), 'utf8')).TEST_SIGNIN_SECRET;
const loginPath = '/__local_login/' + randomBytes(24).toString('hex');
let loginUsed = false;
const child = spawn('npx', ['--yes', 'wrangler@4.156.0', 'dev', '--local', '--port', String(backend)], { stdio: 'inherit', cwd: new URL('..', import.meta.url) });
const localPath = (p) => /^\/(?:api(?:\/|$)|__(?:[^/]*)(?:\/|$)|yo2(?:\/|$)|app(?:\/|$)|net$|boxedwine-network$)/.test(p);
const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://localhost:${port}`);
  if (url.pathname === loginPath && req.method === 'GET' && !loginUsed && testSecret) {
    loginUsed = true;
    const data = JSON.stringify({ name: 'TestLocal' });
    const up = http.request({ hostname: '127.0.0.1', port: backend, path: '/api/de/test-sign-in', method: 'POST', headers: { origin: `http://localhost:${port}`, 'content-type': 'application/json', 'content-length': Buffer.byteLength(data), 'x-test-signin': testSecret } }, response => {
      if (response.statusCode !== 200 || !response.headers['set-cookie']) { response.resume(); res.writeHead(502); return res.end('Local test sign-in failed.'); }
      response.resume(); res.writeHead(302, { 'set-cookie': response.headers['set-cookie'], location: '/?MODERN_UI=1', 'cache-control': 'no-store' }); res.end();
    });
    up.on('error', () => { res.writeHead(502); res.end('Local server unavailable.'); }); up.end(data); return;
  }
  if (modern && req.method === 'GET') {
    const match = url.pathname.match(/^\/h-[a-f0-9]+\/(htmlui\/.*|ui\.js)$/);
    if (match) {
      const file = match[1] === 'ui.js' ? path.join(modern, 'client/html-ui/ui.js') : path.join(modern, 'client/web-shell', match[1]);
      const root = path.join(modern, 'client');
      if (!path.resolve(file).startsWith(root + path.sep)) { res.writeHead(403); return res.end(); }
      try { const data = fs.readFileSync(file); res.writeHead(200, { 'Content-Type': 'text/javascript; charset=utf-8', 'Cache-Control': 'no-store', 'Cross-Origin-Resource-Policy': 'same-origin' }); return res.end(data); }
      catch { res.writeHead(404); return res.end('Local modern UI file not found'); }
    }
  }
  const local = localPath(url.pathname) || !['GET', 'HEAD'].includes(req.method);
  const headers = local ? { ...req.headers, host: `localhost:${backend}` } : Object.fromEntries(['range', 'if-range', 'if-none-match', 'if-modified-since'].filter(k => req.headers[k]).map(k => [k, req.headers[k]]));
  const options = local ? { hostname: '127.0.0.1', port: backend, path: req.url, method: req.method, headers } : { hostname: 'original.ygoevolution.com', path: url.pathname + (url.searchParams.has('v') ? `?v=${encodeURIComponent(url.searchParams.get('v'))}` : ''), method: req.method, headers };
  const up = (local ? http : https).request(options, upstream => { res.writeHead(upstream.statusCode, upstream.headers); upstream.pipe(res); });
  up.on('error', () => { if (!res.headersSent) res.writeHead(502, { 'content-type': 'text/plain' }); res.end('Local server or public client assets unavailable; retry shortly.'); });
  req.pipe(up);
});
server.on('upgrade', (req, socket, head) => {
  if (!/^\/(net|boxedwine-network)(\?|$)/.test(req.url)) return socket.destroy();
  const upstream = net.connect(backend, '127.0.0.1', () => {
    upstream.write(`${req.method} ${req.url} HTTP/${req.httpVersion}\r\n` + req.rawHeaders.reduce((s, v, i, a) => i % 2 ? s : s + `${v}: ${a[i + 1]}\r\n`, '') + '\r\n');
    if (head.length) upstream.write(head);
    socket.pipe(upstream).pipe(socket);
  });
  upstream.on('error', () => socket.destroy());
  socket.on('error', () => upstream.destroy());
});
server.listen(port, '127.0.0.1', () => console.log(`Local client: http://localhost:${port}/ (published static assets, local game server)\nTest login: http://localhost:${port}${loginPath}`));
const stop = () => { server.close(); child.kill('SIGINT'); };
process.on('SIGINT', stop); process.on('SIGTERM', stop);
child.on('exit', code => { server.close(); process.exit(code ?? 1); });
