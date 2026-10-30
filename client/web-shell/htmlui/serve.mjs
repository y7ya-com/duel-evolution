// Dev server for htmlui/mock.html: client/web-shell as the root, /ui.js from client/html-ui, /ui/* from the private
// art (ART=<dir with the atlases + glyphs-dejavu16.json>, default client/html-ui/assets from infra/fetch-private.sh).
//   node client/web-shell/htmlui/serve.mjs [port]   ->   http://127.0.0.1:8941/htmlui/mock.html?s=playerselect
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
const here = path.dirname(fileURLToPath(import.meta.url)), shell = path.join(here, '..');
const ART = process.env.ART || path.join(shell, '../html-ui/assets');
const MIME = { html: 'text/html', js: 'text/javascript', mjs: 'text/javascript', json: 'application/json', png: 'image/png', css: 'text/css' };
createServer(async (req, res) => {
  const p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  if (p.includes('..')) { res.writeHead(403); return res.end(); }
  const f = p === '/ui.js' ? path.join(shell, '../html-ui/ui.js') : p.startsWith('/ui/') ? path.join(ART, p.slice(4)) : path.join(shell, p);
  try {
    const b = await readFile(f);
    res.writeHead(200, { 'Content-Type': MIME[f.split('.').pop()] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    res.end(b);
  } catch { res.writeHead(404); res.end(); }
}).listen(+(process.argv[2] || 8941), '127.0.0.1', () => console.log('htmlui dev on', process.argv[2] || 8941));
