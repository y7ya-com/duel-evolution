import { dirname, resolve } from 'node:path';
// Development server only: main's Legacy HTML UI art (its ui/ atlases, glyph metrics and clamp copies) for the screens
// the rewrite mounts from client/web-shell/htmlui (src/ui/htmlui). The original asset host serves them beside its game/
// folder without CORS headers, and the screens read some atlases' pixels (a canvas needs them same-origin), so the dev
// server forwards GET /ui/<name> to <host>/ui/<name>. No persistence, no query strings, plain file names only.
const PREFIX = '/ui/';
// the atlases, glyph metrics and clamp copies; the deck editor's titles' font (fonts/Audiowide-Regular.woff2, SIL OFL)
const NAME = /^((clamp\/)?[a-z0-9_-]+(\.rgb)?\.(png|json)|fonts\/[A-Za-z0-9_-]+\.woff2)$/;
const TYPES = { png:'image/png', json:'application/json', woff2:'font/woff2' };

/** The ui/ folder beside the game/ folder the remote assets come from (https://host/game/ -> https://host/ui/). */
export const uiBase = gameUrl => new URL('../ui/', new URL(gameUrl.endsWith('/') ? gameUrl : gameUrl + '/')).href;

export function createHtmlUiArtMiddleware({ baseUrl, fetch: fetcher = globalThis.fetch, timeoutMs = 15_000 } = {}) {
  if (process.env.NODE_ENV === 'production') throw new Error('HTML UI art is development-only');
  const base = new URL(baseUrl);
  if (base.protocol !== 'https:' || base.username || base.password || base.search || base.hash || !base.pathname.endsWith('/')) {
    throw new Error('HTML UI art base must be an HTTPS directory URL');
  }
  return function htmlUiArt(req, res, next) {
    const path = (req.url ?? '').split('?')[0];
    if (!path.startsWith(PREFIX)) return next();
    const name = path.slice(PREFIX.length);
    const end = (status, message) => { res.writeHead(status, { 'Content-Type':'text/plain; charset=utf-8', 'Cache-Control':'no-store' }); res.end(message); };
    if (req.method !== 'GET' && req.method !== 'HEAD') return end(405, 'Read-only art');
    if (!NAME.test(name) || req.url !== path) return end(404, 'Art not found');
    const controller = new AbortController(), timer = setTimeout(() => controller.abort(), timeoutMs);
    timer.unref?.();
    void (async () => {
      try {
        // the host now and then drops a request: a few tries (main's ui.js keeps a failed glyph load for the page)
        let upstream;
        for (let attempt = 0; ; attempt++) {
          try { upstream = await fetcher(new URL(name, base).href, { redirect:'manual', credentials:'omit', referrerPolicy:'no-referrer', signal:controller.signal }); }
          catch (e) { if (attempt >= 3 || controller.signal.aborted) throw e; upstream = null; }
          if (upstream && (upstream.status === 200 || upstream.status === 404)) break;
          if (attempt >= 3) break;
          await new Promise(r => setTimeout(r, 250 * (attempt + 1)));
        }
        if (upstream?.status !== 200) return end(upstream?.status === 404 ? 404 : 502, 'Art not available');
        const body = Buffer.from(await upstream.arrayBuffer());
        res.writeHead(200, { 'Content-Type':TYPES[name.split('.').pop()], 'Content-Length':body.length, 'Cache-Control':'max-age=3600',
          'X-Content-Type-Options':'nosniff' });
        res.end(req.method === 'HEAD' ? undefined : body);
      } catch { if (!res.headersSent) end(502, 'Art read failed'); else res.destroy(); }
      finally { clearTimeout(timer); }
    })();
  };
}

/** main's Legacy HTML UI modules in place: the '@htmlui' alias to client/web-shell/htmlui, and their '../ui.js' (shipped
 * beside htmlui/, in the repo client/html-ui/ui.js: ship-client.sh, game.mjs) resolved to it. */
export function htmlUiModules(root) {
  const htmlui = resolve(root, '../web-shell/htmlui'), shellUi = resolve(root, '../web-shell/ui.js'), ui = resolve(root, '../html-ui/ui.js');
  return { name:'htmlui-modules', enforce:'pre',
    // '@web-shell/starter.js': main's starter deck picker (a page script that also imports as a module); '@html-ui/ui.js': its ui.js
    config: () => ({ resolve:{ alias:{ '@htmlui':htmlui, '@web-shell/starter.js':resolve(root, '../web-shell/starter.js'), '@html-ui/ui.js':ui } } }),
    resolveId(id, importer) {
      if (importer && id.startsWith('.') && id.endsWith('/ui.js') && resolve(dirname(importer.split('?')[0]), id) === shellUi) return ui;
      return null;
    } };
}
