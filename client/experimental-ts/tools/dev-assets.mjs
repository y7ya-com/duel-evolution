// Development-only local archive serving. Never installed in a production build or Worker.
import { constants } from 'node:fs';
import { open, realpath, lstat } from 'node:fs/promises';
import { resolve, relative, isAbsolute, sep } from 'node:path';
import { pipeline } from 'node:stream';

export const ASSET_PREFIX = '/game-assets/';
export const MAX_RANGE_BYTES = 32 * 1024 * 1024;
const ARCHIVES = new Set(['merge.dat', 'Sound.dat', 'merge/data/card.dat', 'merge/data/mini.dat']);
const LOOPBACK = new Set(['localhost', '127.0.0.1', '[::1]']);

/** One RFC-style byte range, bounded before any file bytes are read. null means invalid/unsatisfiable. */
export function parseByteRange(value, size, maxBytes = MAX_RANGE_BYTES) {
  if (typeof value !== 'string' || !Number.isSafeInteger(size) || size < 0 || !Number.isSafeInteger(maxBytes) || maxBytes <= 0) return null;
  const match = /^bytes=(\d*)-(\d*)$/.exec(value);
  if (!match || !match[1] && !match[2] || !size) return null;
  let start, end;
  if (!match[1]) {
    const suffix = Number(match[2]);
    if (!Number.isSafeInteger(suffix) || suffix <= 0) return null;
    start = Math.max(0, size - suffix); end = size - 1;
  } else {
    start = Number(match[1]); end = match[2] ? Number(match[2]) : size - 1;
    if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 0 || start >= size || end < start) return null;
    end = Math.min(end, size - 1);
  }
  if (end - start + 1 > maxBytes) return null;
  return { start, end, length:end - start + 1 };
}
function inside(root, file) {
  const path = relative(root, file); return path !== '' && path !== '..' && !path.startsWith('..' + sep) && !isAbsolute(path);
}
function end(res, status, text, headers = {}) {
  const body = Buffer.from(text); res.writeHead(status, { 'Content-Type':'text/plain; charset=utf-8', 'Content-Length':body.length, 'Cache-Control':'no-store', 'X-Content-Type-Options':'nosniff', ...headers });
  res.end(body);
}

/** Only four explicitly named game archives are exposed; no directory listing or arbitrary extracted files. */
export function createAssetMiddleware({ gameRoot, cardsRoot, maxRangeBytes = MAX_RANGE_BYTES } = {}) {
  const game = gameRoot ? resolve(gameRoot) : null, cards = cardsRoot ? resolve(cardsRoot) : null;
  return function assets(req, res, next) {
    const path = (req.url ?? '').split('?')[0];
    if (!path.startsWith(ASSET_PREFIX)) return next();
    void (async () => {
      if (!['GET','HEAD'].includes(req.method ?? '')) return end(res,405,'Read-only assets', { Allow:'GET, HEAD' });
      let name;
      try { name = decodeURIComponent(path.slice(ASSET_PREFIX.length)); }
      catch { return end(res,400,'Invalid asset path'); }
      if (!ARCHIVES.has(name)) return end(res,404,'Asset not found');
      const configured = name.startsWith('merge/data/') && cards ? cards : game;
      if (!configured) return end(res,503,'Set YO2_GAME to your local game directory');
      let handle;
      try {
        const root = await realpath(configured);
        let checked = root;
        for (const part of name.split('/')) {
          checked = resolve(checked,part);
          if ((await lstat(checked)).isSymbolicLink()) return end(res,404,'Asset not found');
        }
        const file = await realpath(resolve(root,name));
        if (!inside(root,file)) return end(res,404,'Asset not found');
        handle = await open(file, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
        const stat = await handle.stat({ bigint:true });
        if (!stat.isFile() || stat.size > BigInt(Number.MAX_SAFE_INTEGER)) { await handle.close(); return end(res,404,'Asset not found'); }
        const size = Number(stat.size);
        const etag = `"yo2-${stat.size.toString(16)}-${stat.mtimeNs.toString(16)}-${stat.ctimeNs.toString(16)}-${stat.ino.toString(16)}"`;
        const headers = { 'Content-Type':'application/octet-stream', 'Accept-Ranges':'bytes', 'Cache-Control':'no-store',
          'X-Content-Type-Options':'nosniff', ETag:etag, 'Last-Modified':new Date(Number(stat.mtimeMs)).toUTCString() };
        if (req.method === 'HEAD' && !req.headers.range) {
          await handle.close(); res.writeHead(200,{ ...headers,'Content-Length':size }); res.end(); return;
        }
        if (!req.headers.range) { await handle.close(); return end(res,400,'Archive GET requires a bounded Range header',headers); }
        const range = parseByteRange(req.headers.range,size,maxRangeBytes);
        if (!range) { await handle.close(); return end(res,416,'Invalid or oversized byte range',{ ...headers,'Content-Range':`bytes */${size}` }); }
        // Full archive fallback would defeat the client's memory budget. Ask it to reload a changed archive instead.
        const ifRange = req.headers['if-range'];
        if (ifRange && ifRange !== etag && !(Number.isFinite(Date.parse(ifRange)) && Math.floor(Number(stat.mtimeMs) / 1000) <= Math.floor(Date.parse(ifRange) / 1000))) {
          await handle.close(); return end(res,412,'Archive changed; reload the client',headers);
        }
        res.writeHead(206,{ ...headers,'Content-Length':range.length,'Content-Range':`bytes ${range.start}-${range.end}/${size}` });
        if (req.method === 'HEAD') { await handle.close(); res.end(); return; }
        const stream = handle.createReadStream({ start:range.start,end:range.end,highWaterMark:64 * 1024,autoClose:true });
        handle = undefined; // Ownership transfers to the stream; pipeline handles abort/error/close.
        pipeline(stream,res,() => {});
      } catch (error) {
        await handle?.close().catch(() => {});
        if (res.headersSent) { res.destroy(); return; }
        const missing = error && typeof error === 'object' && ['ENOENT','ENOTDIR','ELOOP','EACCES'].includes(error.code);
        end(res,missing ? 404 : 500,missing ? 'Asset not found' : 'Asset read failed');
      }
    })();
  };
}
export function devAssetsPlugin(options) {
  return { name:'duel-local-assets',apply:'serve',configureServer(server) { server.middlewares.use(createAssetMiddleware(options)); } };
}

export function localOrigin(value) {
  try { const url = new URL(value); return ['http:','https:'].includes(url.protocol) && LOOPBACK.has(url.hostname) && !url.username && !url.password ? url.origin : null; }
  catch { return null; }
}
export function localProxyOptions({ target = 'http://127.0.0.1:8787', publicOrigin = 'http://localhost:8787', port = 5174 } = {}) {
  if (!localOrigin(target) || !localOrigin(publicOrigin)) throw new Error('Experimental dev proxy requires loopback DE_SERVER and DE_PUBLIC_ORIGIN');
  const allowed = new Set([...LOOPBACK].flatMap(host => [`http://${host}:${port}`,`https://${host}:${port}`]));
  const rewrite = (proxyReq, req) => {
    if (allowed.has(req.headers.origin)) proxyReq.setHeader('Origin',new URL(publicOrigin).origin);
    // Foreign or absent origins are never promoted to trusted origins.
  };
  return { target, changeOrigin:true, configure(proxy) {
    proxy.on('proxyReq',rewrite);
    proxy.on('proxyReqWs',(proxyReq,req) => {
      if (!allowed.has(req.headers.origin)) { proxyReq.destroy(); return; }
      rewrite(proxyReq,req);
    });
  } };
}

/** Gate before Vite's proxy, including websocket upgrades, so rewriting cannot bless a foreign origin. */
export function devOriginGate({ port = 5174 } = {}) {
  const allowed = new Set([...LOOPBACK].flatMap(host => [`http://${host}:${port}`,`https://${host}:${port}`]));
  return { name:'duel-local-origin',apply:'serve',configureServer(server) {
    server.middlewares.use((req,res,next) => {
      const path = (req.url ?? '').split('?')[0], api = path === '/api' || path.startsWith('/api/'), net = path === '/net';
      if ((api && !['GET','HEAD'].includes(req.method ?? '') || net) && !allowed.has(req.headers.origin)) return end(res,403,'Local client Origin required');
      next();
    });
    // The HTTP proxy's WS listener runs separately from Connect middleware.
    server.httpServer?.prependListener('upgrade',(req,socket) => {
      if ((req.url ?? '').split('?')[0] !== '/net' || allowed.has(req.headers.origin)) return;
      socket.end('HTTP/1.1 403 Forbidden\r\nConnection: close\r\nContent-Length: 0\r\n\r\n');
      socket.destroy();
    });
  } };
}
