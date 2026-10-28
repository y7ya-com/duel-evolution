// Front door (Hono): the updater's files, the game WebSocket handoff to the singleton WorldDO, admin and dev routes,
// the account API (src/auth), and the recompiled client's files from R2.
// The Durable Objects stay plain DurableObject classes speaking the YO2 binary protocol over WebSockets.
import { Hono } from "hono";
import rootTxt from "../static/yo2/root.txt";
import mergeTxt from "../static/yo2/merge.txt";
import type { Env } from "./env.ts";
import type { AuthEnv } from "./auth/env.ts";
import { verifySession } from "./auth/auth.ts";
import { gateUpgrade } from "./auth/binding.ts";
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

// client crash reports (the page shell POSTs once per crash): JSON up to 64 KB -> R2 private/crashes/<iso-ts>-<rand>.json.
// Never echoes anything; private/ is never served. 10 per IP per hour, counted in a tiny R2 object per (hour, hashed IP).
// ponytail: read-modify-write, so a burst can slip one or two past the cap; a Durable Object if that matters
const CRASH_MAX = 65536;
routes.post("/__crash", async (c) => {
  const bucket = c.env.BUCKET;
  if (!bucket) return c.body(null, 503);
  if (+(c.req.header("content-length") ?? 0) > CRASH_MAX) return c.body(null, 413);
  const body = await c.req.text();
  if (body.length > CRASH_MAX) return c.body(null, 413);
  try { JSON.parse(body); } catch { return c.body(null, 400); }
  const now = new Date().toISOString();
  const ip = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(c.req.header("cf-connecting-ip") ?? "?")));
  const rateKey = `private/crashes/_rate/${now.slice(0, 13)}/${[...ip.slice(0, 8)].map((b) => b.toString(16).padStart(2, "0")).join("")}`;
  const n = +((await (await bucket.get(rateKey))?.text()) || 0);
  if (n >= 10) return c.body(null, 429);
  await bucket.put(rateKey, String(n + 1));
  await bucket.put(`private/crashes/${now}-${crypto.randomUUID().slice(0, 8)}.json`, body, { httpMetadata: { contentType: "application/json" } });
  return c.body(null, 204);
});
routes.all("/__crash", (c) => c.body(null, 405));

// the stored crash reports, for the admin role: GET /__crashes lists them (key, size, uploaded); ?key=<key> returns one
routes.get("/__crashes", async (c) => {
  if (c.env.DEV !== "1") {
    const v = await verifySession(c.req.raw, c.env as unknown as AuthEnv);
    if (!v) return c.text("sign in first", 401);
    if (!v.roles.includes("admin")) return c.text("forbidden", 403);
  }
  const bucket = c.env.BUCKET;
  if (!bucket) return c.text("not found", 404);
  const key = c.req.query("key");
  if (key) {
    if (!key.startsWith("private/crashes/") || key.includes("/_rate/")) return c.text("bad key", 400);
    const o = await bucket.get(key);
    return o ? new Response(o.body, { headers: { "content-type": "application/json" } }) : c.body(null, 404);
  }
  const out: { key: string; size: number; uploaded: Date }[] = [];
  let cursor: string | undefined;
  do {
    const r = await bucket.list({ prefix: "private/crashes/", cursor });
    for (const o of r.objects) if (!o.key.includes("/_rate/")) out.push({ key: o.key, size: o.size, uploaded: o.uploaded });
    cursor = r.truncated ? r.cursor : undefined;
  } while (cursor);
  return c.json(out);
});

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
  const get = (k: string) => bucket.get(k, { range: c.req.raw.headers, onlyIf: c.req.raw.headers });
  // a staged client holds only its own files: the game data (game/, fonts/, …) comes from recomp/
  const obj = (await get(key)) ?? (pre === "recomp/" ? null : await get("recomp/" + rel));
  if (!obj) return new Response("not found", { status: 404, headers: ISOLATION });
  const headers = new Headers(ISOLATION);
  obj.writeHttpMetadata(headers);
  headers.set("Content-Type", TYPES[key.split(".").pop() ?? ""] ?? "application/octet-stream");
  headers.set("ETag", obj.httpEtag);
  headers.set("Accept-Ranges", "bytes");
  // ?v=<ETag> (the client's prefetch) names this exact version: cache it for good; a stale v gets the usual headers
  const v = url.searchParams.get("v")?.replace(/^W\//, "").replace(/"/g, "");
  headers.set("Cache-Control", v && v === obj.etag ? "public, max-age=31536000, immutable"
    : key.endsWith(".zip") ? "public, max-age=86400" : "no-cache");
  if (!("body" in obj)) return new Response(null, { status: 304, headers });
  const body = (obj as R2ObjectBody).body;
  const r = obj.range as { offset?: number; length?: number } | undefined;
  if (r && c.req.raw.headers.has("range")) {
    const offset = r.offset ?? 0, length = r.length ?? obj.size - offset;
    headers.set("Content-Range", `bytes ${offset}-${offset + length - 1}/${obj.size}`);
    headers.set("Content-Length", String(length));
    return new Response(c.req.method === "HEAD" ? null : body, { status: 206, headers });
  }
  headers.set("Content-Length", String(obj.size));
  return new Response(c.req.method === "HEAD" ? null : body, { headers });
});
routes.all("*", (c) => c.text("method not allowed", 405));

export default routes;
