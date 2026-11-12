// v2.ygoevolution.com: a front for the TS client rewrite (client/experimental-ts). It serves the rewrite's build (the
// ASSETS binding) and hands every other request to LIVE's production Worker, `duel-evolution`, through a service
// binding: the same server code, D1 (duel-evolution-prod), R2 and WorldDO as original.ygoevolution.com. Nothing here
// stores anything; production's config is unchanged (README.md).
//
// To LIVE, a forwarded request carries LIVE_ORIGIN's host. Since live's 074041e that is v2's own (v2 is one of live's
// game hosts, server/src/worker.ts GAME_HOSTS), so live answers as v2: sign-in origin, cookies, the WebSocket Origin
// check and the Discord callback are v2's. (Set to original.ygoevolution.com, live would answer as original and an
// Origin equal to v2's own is rewritten to it; any other Origin passes unchanged and live refuses it as before.)
// Back to the browser: cookies stay host-only (a Domain= that names live's host is dropped), and a Location on live's
// origin points at v2 instead, except Discord OAuth's, which only live's host can finish (README.md).

export interface Env {
  ASSETS: Fetcher;
  LIVE: Fetcher;
  /** v2's own origin, https://v2.ygoevolution.com (wrangler dev: the local front's). */
  PUBLIC_ORIGIN: string;
  /** The origin LIVE sees and answers as, https://original.ygoevolution.com (wrangler dev: the local live stack's). */
  LIVE_ORIGIN: string;
}

const NOINDEX = "noindex, nofollow";
const ROBOTS = "User-agent: *\nDisallow: /\n";
/** The rewrite's own files: the page, vite's hashed bundles, the JSON tables at the root (client/experimental-ts/public).
 * Never a source map (the build makes none unless DE_SOURCEMAP=1; one left in dist is not served either). */
const CLIENT_FILE = /^\/(?!.*\.map$)(?:index\.html|assets\/.+|[\w.-]+\.(?:json|js|css|ico|png|svg|webmanifest))$/;
/** The OAuth paths whose redirects must stay on live's host: Discord's authorize URL names live's callback. */
const DISCORD_OAUTH = /^\/api\/auth\/(?:sign-in\/(?:social|discord)|callback\/discord|link-social|oauth2\/)/;

function noindex(res: Response): Response {
  const out = new Response(res.body, res);
  out.headers.set("X-Robots-Tag", NOINDEX);
  return out;
}

/** The request as LIVE gets it: live's host, and v2's own Origin as live's. /game-assets/ (the dev server's name for the
 *  game files, client/experimental-ts/tools/remote-assets.mjs) is live's /game/. */
export function toLive(req: Request, env: Env): Request {
  const url = new URL(req.url), live = new URL(env.LIVE_ORIGIN);
  url.protocol = live.protocol; url.host = live.host;
  if (url.pathname.startsWith("/game-assets/")) url.pathname = "/game/" + url.pathname.slice("/game-assets/".length);
  const headers = new Headers(req.headers);
  if (headers.get("Origin") === env.PUBLIC_ORIGIN) headers.set("Origin", live.origin);
  // a Referer on v2 (better-auth reads it when Origin is absent) is v2's own page: live's equivalent
  const ref = headers.get("Referer");
  if (ref && ref.startsWith(env.PUBLIC_ORIGIN + "/")) headers.set("Referer", live.origin + ref.slice(env.PUBLIC_ORIGIN.length));
  return new Request(url, { method: req.method, headers, body: req.body, redirect: "manual" });
}

/** A Set-Cookie with any Domain= that names live's host (or its parent) removed: the cookie stays v2's alone. */
export function hostOnlyCookie(cookie: string, liveHost: string): string {
  return cookie.split(";").filter((part) => {
    const m = /^\s*domain\s*=\s*\.?(.+?)\s*$/i.exec(part);
    if (!m) return true;
    const d = m[1]!.toLowerCase();
    return !(liveHost === d || liveHost.endsWith("." + d));
  }).join(";");
}

/** LIVE's answer as v2 gives it: host-only cookies, Locations on live's origin moved to v2's (not Discord OAuth's). */
export function fromLive(req: Request, res: Response, env: Env): Response {
  if (res.status === 101) return res;   // a WebSocket upgrade: its socket as it is
  const live = new URL(env.LIVE_ORIGIN), path = new URL(req.url).pathname;
  const out = new Response(res.body, res);
  const cookies = (res.headers as Headers & { getSetCookie(): string[] }).getSetCookie?.() ?? [];
  if (cookies.length) {
    out.headers.delete("Set-Cookie");
    for (const c of cookies) out.headers.append("Set-Cookie", hostOnlyCookie(c, live.hostname));
  }
  const loc = res.headers.get("Location");
  if (loc && !DISCORD_OAUTH.test(path)) {
    try {
      const to = new URL(loc, live.origin);
      if (to.origin === live.origin) out.headers.set("Location", env.PUBLIC_ORIGIN + to.pathname + to.search + to.hash);
    } catch { /* not a URL: as it is */ }
  }
  out.headers.set("X-Robots-Tag", NOINDEX);
  return out;
}

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url), read = req.method === "GET" || req.method === "HEAD";
    if (url.pathname === "/robots.txt") return new Response(req.method === "HEAD" ? null : ROBOTS, { headers: { "Content-Type": "text/plain; charset=utf-8", "X-Robots-Tag": NOINDEX, "Cache-Control": "public, max-age=3600" } });
    if (read && req.headers.get("Upgrade") === null && (url.pathname === "/" || CLIENT_FILE.test(url.pathname))) {
      const res = await env.ASSETS.fetch(req);
      if (res.status !== 404) return noindex(res);
    }
    // everything else is live's: /api/*, /net (the game WebSocket), /game/*, /ui/*, /replays, /__version, ...
    return fromLive(req, await env.LIVE.fetch(toLive(req, env)), env);
  },
} satisfies ExportedHandler<Env>;
