// Development server only: live's page (yo2rc.html, which carries Module.yo2EraCards) and the 2008 printed card faces it
// names (c-<hash>/merge/data/card|mini/<passcode>.png|jpg), from the host beside the remote game/ folder, so the dev
// client reads them same-origin as v2 does through its front (src/cards/era.ts). GET/HEAD of those exact names only.
const PAGE = '/yo2rc.html';
const FACE = /^\/c-[0-9a-f]{8,64}\/merge\/data\/(card|mini)\/\d{1,10}\.(png|jpg)$/;

/** The site root holding yo2rc.html beside the game/ folder (https://host/game/ -> https://host/). */
export const eraBase = gameUrl => new URL('../', new URL(gameUrl.endsWith('/') ? gameUrl : gameUrl + '/')).href;

export function createEraMiddleware({ baseUrl, fetch: fetcher = globalThis.fetch, timeoutMs = 15_000 } = {}) {
  if (process.env.NODE_ENV === 'production') throw new Error('2008 card faces are development-only');
  const base = new URL(baseUrl);
  if (base.protocol !== 'https:' || base.username || base.password || base.search || base.hash || !base.pathname.endsWith('/')) {
    throw new Error('2008 card base must be an HTTPS directory URL');
  }
  return function eraAssets(req, res, next) {
    const url = req.url ?? '', path = url.split('?')[0];
    if (path !== PAGE && !FACE.test(path)) return next();
    const end = (status, message) => { res.writeHead(status, { 'Content-Type':'text/plain; charset=utf-8', 'Cache-Control':'no-store' }); res.end(message); };
    if (req.method !== 'GET' && req.method !== 'HEAD') return end(405, 'Read-only');
    if (url !== path) return end(404, 'Not found');
    const controller = new AbortController(), timer = setTimeout(() => controller.abort(), timeoutMs);
    timer.unref?.();
    void (async () => {
      try {
        const upstream = await fetcher(new URL(path.slice(1), base).href, { redirect:'manual', credentials:'omit', referrerPolicy:'no-referrer', signal:controller.signal });
        if (upstream.status !== 200) return end(upstream.status === 404 ? 404 : 502, 'Not available');
        const body = Buffer.from(await upstream.arrayBuffer());
        const type = path === PAGE ? 'text/html; charset=utf-8' : path.endsWith('.png') ? 'image/png' : 'image/jpeg';
        res.writeHead(200, { 'Content-Type':type, 'Content-Length':body.length, 'Cache-Control':'no-cache', 'X-Content-Type-Options':'nosniff' });
        res.end(req.method === 'HEAD' ? undefined : body);
      } catch { if (!res.headersSent) end(502, 'Read failed'); else res.destroy(); }
      finally { clearTimeout(timer); }
    })();
  };
}
