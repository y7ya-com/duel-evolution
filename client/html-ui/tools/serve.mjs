// Local origin for the recompiled web client: build files from public/recomp, game files from web/game (Range),
// COOP/COEP; the updater HTTP (/yo2/, /app/, /__warm) is forwarded to the live server. node serve.mjs [port]
// PUB=<dir> serves another build's yo2rc.{html,js,wasm}; /api/de/session answers "signed out", so a build with the
// new sign-in (rt/session.cpp) shows its sign-in panel instead of the 2008 dialog (SESSION=0 turns that off: 404).
import { createServer } from 'node:http';
import { createReadStream, statSync, readFileSync } from 'node:fs';
const PORT = +(process.argv[2] || 8931), LIVE = 'https://original.ygoevolution.com';
const PUB = process.env.PUB || process.env.HOME + '/Documents/GitHub/yo2-decomp-data/web/public/recomp', FONTS = process.env.HOME + '/Documents/GitHub/yo2-decomp-data/web/public/recomp/fonts', GAME = process.env.HOME + '/Documents/GitHub/yo2-decomp-data/web/game';
const HOOK = new URL('hook.js', import.meta.url).pathname;
const MIME = { html: 'text/html', js: 'text/javascript', wasm: 'application/wasm', txt: 'text/plain', png: 'image/png', json: 'application/json' };
createServer(async (req, res) => {
  const u = new URL(req.url, 'http://x'), p = decodeURIComponent(u.pathname);
  const h = { 'Cross-Origin-Opener-Policy': 'same-origin', 'Cross-Origin-Embedder-Policy': 'require-corp', 'Cross-Origin-Resource-Policy': 'same-origin', 'Cache-Control': 'no-store' };
  if (/^\/(yo2|app)\/|^\/__warm/.test(p)) {   // updater / info pages
    try {
      const r = await fetch(LIVE + req.url, { method: req.method });
      const b = Buffer.from(await r.arrayBuffer());
      res.writeHead(r.status, { ...h, 'Content-Type': r.headers.get('content-type') || 'application/octet-stream' }); res.end(b);
    } catch (e) { res.writeHead(502, h); res.end(String(e)); }
    return;
  }
  if (p === '/api/de/session' && process.env.SESSION !== '0') { res.writeHead(200, { ...h, 'Content-Type': 'application/json' }); return res.end('{"signedIn":false}'); }
  let f = p.startsWith('/fonts/') ? FONTS + p.slice(6) : p === '/' ? PUB + '/yo2rc.html' : p === '/game/files.txt' ? FONTS + '/../game/files.txt' : p.startsWith('/game/') ? GAME + p.slice(5) : PUB + p;
  if (p === '/hook.js') f = HOOK;
  if (p.includes('..')) { res.writeHead(403, h); return res.end(); }
  let st; try { st = statSync(f); } catch { res.writeHead(404, h); return res.end(); }
  const type = MIME[f.split('.').pop()] || 'application/octet-stream';
  if (f.endsWith('yo2rc.html')) {   // the WebGL hook runs before anything else
    const html = readFileSync(f, 'utf8').replace('<script', '<script src="hook.js"></script><script');
    res.writeHead(200, { ...h, 'Content-Type': type }); return res.end(html);
  }
  const m = /bytes=(\d+)-(\d*)/.exec(req.headers.range || '');
  if (m) {
    const a = +m[1], b = m[2] ? Math.min(+m[2], st.size - 1) : st.size - 1;
    res.writeHead(206, { ...h, 'Content-Type': type, 'Content-Range': `bytes ${a}-${b}/${st.size}`, 'Content-Length': b - a + 1, 'Accept-Ranges': 'bytes' });
    return createReadStream(f, { start: a, end: b }).pipe(res);
  }
  res.writeHead(200, { ...h, 'Content-Type': type, 'Content-Length': st.size, 'Accept-Ranges': 'bytes' });
  if (req.method === 'HEAD') return res.end();
  createReadStream(f).pipe(res);
}).listen(PORT, '127.0.0.1', () => console.log('serving on', PORT));
