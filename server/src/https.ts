// https only on the game hosts (worker.ts): plain http can't be cross-origin isolated (no SharedArrayBuffer: "blocked:
// shared-memory", 2026-11-01) and a proxy can strip its headers. HSTS keeps a browser that has seen it on https. No
// includeSubDomains: the zone's other names are none of the game's business.
export const HSTS = "max-age=31536000";

/** The https redirect for a plain-http request to one of `hosts` (301; 308 keeps a POST a POST), or null. */
export function toHttps(req: Request, hosts: ReadonlySet<string>): Response | null {
  const url = new URL(req.url);
  if (url.protocol !== "http:" || !hosts.has(url.hostname)) return null;
  return Response.redirect(`https://${url.host}${url.pathname}${url.search}`, req.method === "GET" || req.method === "HEAD" ? 301 : 308);
}

/** res with HSTS, for one of `hosts`; a WebSocket's 101 as it is. */
export function withHsts(req: Request, res: Response, hosts: ReadonlySet<string>): Response {
  if (!hosts.has(new URL(req.url).hostname) || res.status === 101) return res;
  const out = new Response(res.body, res);
  out.headers.set("Strict-Transport-Security", HSTS);
  return out;
}
