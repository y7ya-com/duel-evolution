// Local testing only (README.md "Local check"): stands in for the production Worker `duel-evolution` under wrangler
// dev, so the front's LIVE binding reaches a local live-server stack. The front has already pointed the request at
// LIVE_ORIGIN (the stack's http://127.0.0.1:<port>), so this passes it on as it is, WebSocket upgrades included.
// The game's own files (/game/*, /ui/*: R2 in production, absent from a local stack) are read from GAME_FILES
// (default https://original.ygoevolution.com, public and read-only: the same files the Vite dev server proxies), with
// no cookie or Origin, only the range and cache validators.
interface Env { GAME_FILES?: string }
const FILES = /^\/(?:game|ui)\//;
const PASS = ["Range", "If-Range", "If-None-Match", "If-Modified-Since", "Accept", "Accept-Encoding"];
export default {
  fetch(req: Request, env: Env) {
    const url = new URL(req.url);
    if (FILES.test(url.pathname) && (req.method === "GET" || req.method === "HEAD")) {
      const headers = new Headers();
      for (const h of PASS) { const v = req.headers.get(h); if (v) headers.set(h, v); }
      return fetch(new URL(url.pathname + url.search, env.GAME_FILES || "https://original.ygoevolution.com"), { method: req.method, headers });
    }
    return fetch(req);
  },
} satisfies ExportedHandler<Env>;
