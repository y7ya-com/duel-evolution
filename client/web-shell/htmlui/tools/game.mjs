// The web client with the bridge, for the htmlui tools: a recomp web build (yo2rc.{html,js,wasm}) with bridge.js
// started in the page, the game and font files, and everything the server answers (/api/, /yo2/, /app/, /__warm and
// the /net WebSocket) forwarded to a local stack.py. Cross-origin isolated, as production.
//   SERVER=http://127.0.0.1:8799 BUILD=<build-web> GAME=<web/game> FONTS=<fonts> node tools/game.mjs [port]
//   -> http://127.0.0.1:8942/  (production's query: same-origin http/gateway, server 127.0.0.1, offset 1000)
import { createServer, request } from 'node:http';
import { connect } from 'node:net';
import { createReadStream, statSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
const here = path.dirname(fileURLToPath(import.meta.url)), shell = path.join(here, '../..');
const PORT = +(process.argv[2] || 8942), SERVER = new URL(process.env.SERVER || 'http://127.0.0.1:8799');
const DATA = process.env.HOME + '/Documents/GitHub/yo2-decomp-data/web';
const BUILD = process.env.BUILD || path.join(shell, '../recomp/build-web');
const GAME = process.env.GAME || DATA + '/game', FONTS = process.env.FONTS || DATA + '/public/recomp/fonts';
const ART = process.env.ART || path.join(shell, '../html-ui/assets');
const MIME = { html: 'text/html', js: 'text/javascript', mjs: 'text/javascript', wasm: 'application/wasm', json: 'application/json', png: 'image/png', txt: 'text/plain' };
const ISO = { 'Cross-Origin-Opener-Policy': 'same-origin', 'Cross-Origin-Embedder-Policy': 'require-corp', 'Cross-Origin-Resource-Policy': 'same-origin', 'Cache-Control': 'no-store' };
const BOOT = `<script type="module">import { start } from '/htmlui/bridge.js';
const go = () => start(Module).then(h => { window.__htmlui = h; }, e => console.error('htmlui', e));
document.readyState === 'loading' ? addEventListener('DOMContentLoaded', go) : go();</script>`;

const forward = (req, res) => {
  const r = request({ host: SERVER.hostname, port: SERVER.port, path: req.url, method: req.method, headers: { ...req.headers, host: SERVER.host, origin: SERVER.origin } }, up => {
    const h = { ...up.headers, ...ISO };
    if (h['set-cookie']) h['set-cookie'] = [].concat(h['set-cookie']).map(c => c.replace(/;\s*secure/i, ''));
    res.writeHead(up.statusCode, h);
    up.pipe(res);
  });
  r.on('error', e => { res.writeHead(502, ISO); res.end(String(e)); });
  req.pipe(r);
};

const srv = createServer((req, res) => {
  const u = new URL(req.url, 'http://x'), p = decodeURIComponent(u.pathname);
  if (p.includes('..')) { res.writeHead(403, ISO); return res.end(); }
  if (/^\/(api|yo2|app)\/|^\/__warm/.test(p)) return forward(req, res);
  if (p === '/') {
    const q = new URLSearchParams(u.search);
    q.set('http', `http://127.0.0.1:${PORT}`); q.set('gateway', `ws://127.0.0.1:${PORT}/net`);
    q.set('fonts', 'fonts/'); q.set('server', '127.0.0.1'); q.has('YO2_PORT_OFFSET') || q.set('YO2_PORT_OFFSET', '1000');
    res.writeHead(302, { ...ISO, Location: '/yo2rc.html?' + q }); return res.end();
  }
  const f = p.startsWith('/htmlui/') ? path.join(shell, p) : p === '/ui.js' ? path.join(shell, '../html-ui/ui.js')
    : p.startsWith('/ui/') ? path.join(ART, p.slice(4)) : p.startsWith('/game/') ? path.join(GAME, p.slice(6))
    : p.startsWith('/fonts/') ? path.join(FONTS, p.slice(7)) : path.join(BUILD, p);
  let st;
  try { st = statSync(f); } catch { res.writeHead(404, ISO); return res.end(); }
  const type = MIME[f.split('.').pop()] || 'application/octet-stream';
  if (f.endsWith('yo2rc.html')) {
    res.writeHead(200, { ...ISO, 'Content-Type': type });
    return res.end(readFileSync(f, 'utf8').replace('</body>', BOOT + '</body>'));
  }
  const m = /bytes=(\d+)-(\d*)/.exec(req.headers.range || '');
  if (m) {
    const a = +m[1], b = m[2] ? Math.min(+m[2], st.size - 1) : st.size - 1;
    res.writeHead(206, { ...ISO, 'Content-Type': type, 'Content-Range': `bytes ${a}-${b}/${st.size}`, 'Content-Length': b - a + 1, 'Accept-Ranges': 'bytes' });
    return createReadStream(f, { start: a, end: b }).pipe(res);
  }
  res.writeHead(200, { ...ISO, 'Content-Type': type, 'Content-Length': st.size, 'Accept-Ranges': 'bytes' });
  if (req.method === 'HEAD') return res.end();
  createReadStream(f).pipe(res);
});
// the gateway WebSocket: the upgrade request and both directions, byte for byte
srv.on('upgrade', (req, sock, head) => {
  const up = connect(+SERVER.port, SERVER.hostname, () => {
    const hdr = Object.entries({ ...req.headers, host: SERVER.host, origin: SERVER.origin }).map(([k, v]) => `${k}: ${v}`).join('\r\n');
    up.write(`${req.method} ${req.url} HTTP/1.1\r\n${hdr}\r\n\r\n`);
    up.write(head);
    sock.pipe(up).pipe(sock);
  });
  const end = () => { up.destroy(); sock.destroy(); };
  up.on('error', end); sock.on('error', end);
});
srv.listen(PORT, '127.0.0.1', () => console.log('htmlui game on', PORT, '->', SERVER.origin));
