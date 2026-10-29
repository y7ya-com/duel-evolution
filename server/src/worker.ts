// Front door (Hono): the updater's files, the game WebSocket handoff to the singleton WorldDO, admin and dev routes,
// the account API (src/auth), and the recompiled client's files from R2.
// The Durable Objects stay plain DurableObject classes speaking the YO2 binary protocol over WebSockets.
import { Hono } from "hono";
import rootTxt from "../static/yo2/root.txt";
import mergeTxt from "../static/yo2/merge.txt";
import type { Env } from "./env.ts";
import type { AuthEnv } from "./auth/env.ts";
import { verifySession } from "./auth/auth.ts";
import { gateUpgrade, originAllowed } from "./auth/binding.ts";
import { authApp, isAuthPath } from "./auth/routes.ts";

export { WorldDO } from "./do.ts";

type E = { Bindings: Env };
const ADMIN_HEADER = "x-de-admin";

const world = (env: Env) => env.WORLD.get(env.WORLD.idFromName("world"));
const toWorld = (env: Env, req: Request, path: string, init: Request = req) => world(env).fetch(new Request(new URL(path, req.url), init));

const routes = new Hono<E>();

// the updater (py www/): plain text, GET/HEAD
const text = (body: string) => (c: { req: { method: string } }) =>
  new Response(c.req.method === "HEAD" ? null : body, { headers: { "content-type": "text/plain" } });
routes.get("/yo2/root.txt", text(rootTxt));
routes.get("/yo2/merge.txt", text(mergeTxt));

// the landing page pings this before ONLINE (the old container needed a warm-up; the WorldDO doesn't)
routes.get("/__warm", (c) => c.text("ok"));

// the game channel needs a DE session; the WorldDO gets its user id (auth/binding.ts). /net is the client's default
// (index.html: gateway = <host>/net); /boxedwine-network stays for builds and links that name it
routes.on("GET", ["/boxedwine-network", "/net"], async (c) => {
  const fwd = await gateUpgrade(c.req.raw, c.env as unknown as AuthEnv);
  return fwd instanceof Response ? fwd : toWorld(c.env, c.req.raw, "/boxedwine-network", fwd);
});

// admin actions on live players: a session with the admin role (role_grant); the header is always ours
routes.all("/__admin/*", async (c) => {
  const fwd = new Request(c.req.raw);
  fwd.headers.delete(ADMIN_HEADER);
  if (c.env.DEV !== "1") {
    const v = await verifySession(c.req.raw, c.env as unknown as AuthEnv);
    if (!v) return c.text("sign in first", 401);
    if (!v.roles.includes("admin")) return c.text("forbidden", 403);
    fwd.headers.set(ADMIN_HEADER, v.userId);
  }
  return toWorld(c.env, c.req.raw, new URL(c.req.url).pathname, fwd);
});

// client reports, stored privately (private/ is never served) and never echoed:
//   /__crash  the page shell POSTs once per crash: JSON up to 64 KB -> R2 private/crashes/<iso-ts>-<rand>.json, 10 per IP per hour
//   /__stall  web/stall.js POSTs batches of long frames (anonymous): JSON up to 16 KB -> private/stalls/, 30 per IP per hour
// The rate is counted in a tiny R2 object per (hour, hashed IP). GET /__crashes, /__stalls (admin role) list them
// (key, size, uploaded); ?key=<key> returns one.
// ponytail: read-modify-write, so a burst can slip one or two past the cap; a Durable Object if that matters
const ipFamily = (r: Request) => ((r.headers.get("cf-connecting-ip") ?? "").includes(":") ? "v6" : "v4");

for (const [path, dir, max, perHour] of [["crash", "crashes", 65536, 10], ["stall", "stalls", 16384, 30]] as const) {
  const prefix = `private/${dir}/`;
  routes.post(`/__${path}`, async (c) => {
    const bucket = c.env.BUCKET;
    if (!bucket) return c.body(null, 503);
    if (+(c.req.header("content-length") ?? 0) > max) return c.body(null, 413);
    const body = await c.req.text();
    if (body.length > max) return c.body(null, 413);
    let row: unknown;
    try { row = JSON.parse(body); } catch { return c.body(null, 400); }
    const now = new Date().toISOString();
    const ip = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(c.req.header("cf-connecting-ip") ?? "?")));
    const rateKey = `${prefix}_rate/${now.slice(0, 13)}/${[...ip.slice(0, 8)].map((b) => b.toString(16).padStart(2, "0")).join("")}`;
    const n = +((await (await bucket.get(rateKey))?.text()) || 0);
    if (n >= perHour) return c.body(null, 429);
    await bucket.put(rateKey, String(n + 1));
    // the client's IP family: one ISP's IPv6 route to the zone ran at ~76 KB/s against 0.8 MB/s over IPv4 (2026-10-28)
    const out = row && typeof row === "object" && !Array.isArray(row) ? JSON.stringify({ ...row, ip_family: ipFamily(c.req.raw) }) : body;
    await bucket.put(`${prefix}${now}-${crypto.randomUUID().slice(0, 8)}.json`, out, { httpMetadata: { contentType: "application/json" } });
    return c.body(null, 204);
  });
  routes.all(`/__${path}`, (c) => c.body(null, 405));
  routes.get(`/__${dir}`, async (c) => {
    if (c.env.DEV !== "1") {
      const v = await verifySession(c.req.raw, c.env as unknown as AuthEnv);
      if (!v) return c.text("sign in first", 401);
      if (!v.roles.includes("admin")) return c.text("forbidden", 403);
    }
    const bucket = c.env.BUCKET;
    if (!bucket) return c.text("not found", 404);
    const key = c.req.query("key");
    if (key) {
      if (!key.startsWith(prefix) || key.includes("/_rate/")) return c.text("bad key", 400);
      const o = await bucket.get(key);
      return o ? new Response(o.body, { headers: { "content-type": "application/json" } }) : c.body(null, 404);
    }
    const out: { key: string; size: number; uploaded: Date }[] = [];
    let cursor: string | undefined;
    do {
      const r = await bucket.list({ prefix, cursor });
      for (const o of r.objects) if (!o.key.includes("/_rate/")) out.push({ key: o.key, size: o.size, uploaded: o.uploaded });
      cursor = r.truncated ? r.cursor : undefined;
    } while (cursor);
    return c.json(out);
  });
}

// old /recomp/ links (the site used to live there): same page and files at the root
routes.get("/recomp/*", (c) => {
  const url = new URL(c.req.url);
  return c.redirect(url.pathname.replace(/^\/recomp/, "") + url.search, 301);
});
routes.get("/recomp", (c) => c.redirect("/" + new URL(c.req.url).search, 301));

// parity/e2e seeding: wrangler dev only
routes.all("/__dev/*", (c) =>
  c.env.DEV === "1" ? toWorld(c.env, c.req.raw, new URL(c.req.url).pathname) : c.text("not found", 404));

// the web client's art prefetch: the NPC deck of the signed-in player's current NPC duel (204 without one; never a
// player's deck). The session decides whose; the WorldDO knows the duel.
routes.get("/api/de/prefetch/duel", async (c) => {
  const v = await verifySession(c.req.raw, c.env as unknown as AuthEnv);
  if (!v) return c.body(null, 204);
  const fwd = new Request(c.req.raw);
  fwd.headers.set("x-de-user", v.userId);
  return toWorld(c.env, c.req.raw, "/__de/prefetch", fwd);
});

// the free starter deck (game/starter.ts): the web client's picker, for the signed-in player's active character
routes.get("/api/de/starter", async (c) => {
  const v = await verifySession(c.req.raw, c.env as unknown as AuthEnv);
  if (!v) return c.json({ error: "signed out" }, 401);
  const fwd = new Request(c.req.raw);
  fwd.headers.set("x-de-user", v.userId);
  return toWorld(c.env, c.req.raw, "/__de/starter", fwd);
});
routes.post("/api/de/starter/claim", async (c) => {
  if (!originAllowed(c.req.raw, c.env as unknown as AuthEnv)) return c.json({ error: "forbidden" }, 403);
  const v = await verifySession(c.req.raw, c.env as unknown as AuthEnv);
  if (!v) return c.json({ error: "signed out" }, 401);
  const fwd = new Request(c.req.raw);
  fwd.headers.set("x-de-user", v.userId);
  return toWorld(c.env, c.req.raw, "/__de/starter/claim", fwd);
});

// the account API (src/auth)
routes.use("*", async (c, next) => {
  if (isAuthPath(new URL(c.req.url).pathname)) return authApp.fetch(c.req.raw, c.env, c.executionCtx);
  await next();
});

// everything else: the recompiled web client and its game files (R2 keys under recomp/, or CLIENT_PREFIX), as the live site serves them
// at its root: cross-origin isolated, with Range for its lazy file reads. private/ is never reachable.
const TYPES: Record<string, string> = { html: "text/html; charset=utf-8", js: "text/javascript", wasm: "application/wasm", css: "text/css",
  zip: "application/zip", txt: "text/plain", woff2: "font/woff2", png: "image/png", json: "application/json" };
const ISOLATION = { "Cross-Origin-Opener-Policy": "same-origin", "Cross-Origin-Embedder-Policy": "require-corp",
  "Cross-Origin-Resource-Policy": "same-origin", "X-Robots-Tag": "noindex, nofollow" };
routes.on(["GET", "HEAD"], "*", async (c) => {
  const url = new URL(c.req.url);
  const path = url.pathname;
  // the game page without the root page's parameters (Discord's sign-in returns to the bare path, ?online=1): back through
  // the root, which adds gateway/http/server/YO2_PORT_OFFSET and keeps the rest. Without them the client opens the
  // game ports with no +1000 offset, the server refuses those sockets, and the client shows its empty gate error.
  // Only page loads: the client's own fetches of yo2rc.html (build checks) get the file.
  if (path === "/yo2rc.html" && !url.searchParams.has("YO2_PORT_OFFSET") && c.req.header("sec-fetch-mode") === "navigate")
    return c.redirect("/" + url.search, 302);
  const bucket = c.env.BUCKET;
  if (!bucket) return c.text("not found", 404);
  const pre = /^[\w-]+\/$/.test(c.env.CLIENT_PREFIX ?? "") && c.env.CLIENT_PREFIX !== "private/" ? c.env.CLIENT_PREFIX! : "recomp/";
  const rel = decodeURIComponent(path.slice(1)).replace(/(^|\/)$/, "$1index.html");
  const key = pre + rel;
  // A content-hashed client file (ship-client.sh: yo2rc-<10 hex>.wasm, loader-<10 hex>.js, ...) never changes under
  // its name: immutable, and kept whole in the edge cache like the chunks below.
  const hashed = /^[\w-]+-[0-9a-f]{10}\.(js|wasm)$/.test(rel);
  // A versioned range (lazyfs's 1 MB chunks, ?v=<ETag>) comes from the edge cache once any player in that colo read it:
  // R2 through this Worker streamed at ~130 KB/s live (2026-10-28), against a sync read the game waits on. The Cache API
  // refuses 206, so a chunk is kept as a 200 under its URL + range, and turned back into the 206 here.
  const range = c.req.header("range");
  const t0 = Date.now();
  /** A range's body, timed until its last byte leaves this Worker (R2 or the cache, not the player's download: the
   *  edge buffers it, so a slow route to the player shows only in web/stall.js's rows): one log line per range, for
   *  `wrangler tail duel-evolution` (src/do.ts LOG is separate). */
  const timed = (b: ReadableStream, how: string, bytes: number) => b.pipeThrough(new TransformStream({
    flush: () => console.log(`[range] ${ipFamily(c.req.raw)} ${how} ${rel} ${bytes} B ${Date.now() - t0} ms`),
  }));
  // A hashed .wasm with its pre-compressed sidecar <key>.br (ship-client.sh, brotli -q 9): sent as it is, ~30% smaller
  // than the edge's own brotli (6.7 -> 4.7 MB a cold boot). Its own edge-cache key, so a client without br never
  // gets it; a Range (loader.js resuming a dropped download at a decoded offset) stays on the plain object.
  if (hashed && rel.endsWith(".wasm") && !range && c.req.method === "GET" && /\bbr\b/.test(c.req.header("accept-encoding") ?? "")) {
    // the edge cache keeps the br bytes as an opaque body (stored with Content-Encoding it decodes them, and the edge
    // then re-compresses at its own, weaker level): the encoding is added only on the way out
    const brKey = new Request(`${url.origin}${url.pathname}?enc=br1`);
    const send = (body: ReadableStream | null, from: Headers) => {
      const h = new Headers(from);
      h.set("Content-Type", "application/wasm");
      h.set("Content-Encoding", "br");
      h.set("Vary", "Accept-Encoding");
      return new Response(body, { headers: h, encodeBody: "manual" });
    };
    const hit = await caches.default.match(brKey);
    if (hit) return send(hit.body, hit.headers);
    const o = await bucket.get(key + ".br");
    if (o) {
      const h = new Headers(ISOLATION);
      h.set("Content-Type", "application/octet-stream");
      h.set("Content-Length", String(o.size));
      h.set("ETag", o.httpEtag);
      h.set("Cache-Control", "public, max-age=31536000, immutable");
      const [out, keep] = o.body.tee();
      c.executionCtx.waitUntil(caches.default.put(brKey, new Response(keep, { headers: h })));
      return send(out, h);
    }
  }
  const edgeKey = c.req.method !== "GET" ? null
    : range && url.searchParams.has("v") ? new Request(`${url.origin}${url.pathname}?v=${encodeURIComponent(url.searchParams.get("v")!)}&range=${encodeURIComponent(range)}`)
    : !range && hashed ? new Request(url.origin + url.pathname) : null;
  if (edgeKey) {
    const hit = await caches.default.match(edgeKey);
    if (hit && !range) return hit;
    if (hit) {
      const h = new Headers(hit.headers);
      h.set("Content-Range", h.get("X-Content-Range") ?? ""), h.delete("X-Content-Range");
      return new Response(timed(hit.body!, "hit", +(h.get("Content-Length") ?? 0)), { status: 206, headers: h });
    }
  }
  const get = (k: string) => bucket.get(k, { range: c.req.raw.headers, onlyIf: c.req.raw.headers });
  // a staged client holds only its own files: the game data (game/, fonts/, …) comes from recomp/
  const obj = (await get(key)) ?? (pre === "recomp/" ? null : await get("recomp/" + rel));
  if (!obj) return new Response("not found", { status: 404, headers: ISOLATION });
  const headers = new Headers(ISOLATION);
  obj.writeHttpMetadata(headers);
  headers.set("Content-Type", TYPES[key.split(".").pop() ?? ""] ?? "application/octet-stream");
  headers.set("ETag", obj.httpEtag);
  headers.set("Accept-Ranges", "bytes");
  // ?v=<ETag> (the client's prefetch) names this exact version: cache it for good; a stale v gets the usual headers.
  // Compared as word characters only: lazyfs sends the ETag that way, and a multipart upload's ("<md5>-14", merge.dat)
  // never matched, so every live chunk went out no-cache
  const v = url.searchParams.get("v")?.replace(/\W/g, "");
  headers.set("Cache-Control", hashed || (v && v === obj.etag.replace(/\W/g, "")) ? "public, max-age=31536000, immutable"
    : key.endsWith(".zip") ? "public, max-age=86400" : "no-cache");
  if (!("body" in obj)) return new Response(null, { status: 304, headers });
  const body = (obj as R2ObjectBody).body;
  const r = obj.range as { offset?: number; length?: number } | undefined;
  if (r && c.req.raw.headers.has("range")) {
    const offset = r.offset ?? 0, length = r.length ?? obj.size - offset;
    headers.set("Content-Range", `bytes ${offset}-${offset + length - 1}/${obj.size}`);
    headers.set("Content-Length", String(length));
    if (edgeKey && length <= 4 << 20 && headers.get("Cache-Control")!.includes("immutable")) {   // this version, chunk-sized
      const [out, keep] = body.tee(), stored = new Headers(headers);
      stored.set("X-Content-Range", headers.get("Content-Range")!), stored.delete("Content-Range");
      c.executionCtx.waitUntil(caches.default.put(edgeKey, new Response(keep, { headers: stored })));
      return new Response(timed(out, "miss", length), { status: 206, headers });
    }
    return new Response(c.req.method === "HEAD" ? null : timed(body, "r2", length), { status: 206, headers });
  }
  headers.set("Content-Length", String(obj.size));
  if (edgeKey && hashed) {
    const [out, keep] = body.tee();
    c.executionCtx.waitUntil(caches.default.put(edgeKey, new Response(keep, { headers })));
    return new Response(out, { headers });
  }
  return new Response(c.req.method === "HEAD" ? null : body, { headers });
});
routes.all("*", (c) => c.text("method not allowed", 405));

// The game is served on the apex and on original. (kept so players find it where they're used to): each request sees
// its own host as PUBLIC_ORIGIN, so sign-in, the Discord callback and the WebSocket Origin check work on both. www -> apex.
const GAME_HOSTS = new Set(["ygoevolution.com", "original.ygoevolution.com"]);
export default {
  fetch(req: Request, env: Env, ctx: ExecutionContext) {
    const url = new URL(req.url);
    if (url.hostname === "www.ygoevolution.com") return Response.redirect(`https://ygoevolution.com${url.pathname}${url.search}`, 301);
    if ((env as unknown as AuthEnv).DEPLOY_ENV === "production" && GAME_HOSTS.has(url.hostname)) env = { ...env, PUBLIC_ORIGIN: `https://${url.hostname}` } as Env;
    return routes.fetch(req, env, ctx);
  },
};
