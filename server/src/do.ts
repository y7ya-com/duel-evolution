// WorldDO: the singleton Durable Object that terminates every client's gateway WebSocket (see DESIGN.md).
// Resident on purpose (standard ws.accept(), no hibernation): sessions, blocks and rooms live in memory; a hibernated
// DO would keep the sockets but lose them.
import { DurableObject } from "cloudflare:workers";
import { configFrom } from "./config.ts";
import { buildServer, type Server } from "./server.ts";
import type { Env } from "./env.ts";
import { bootDuel } from "./duel/boot.ts";
import { attach, loadState, type D1Sink } from "./db/d1.ts";
import { adminSink, loadAdmin } from "./db/admin.ts";
import { starterClaim, starterInfo } from "./game/starter.ts";

const KEEPALIVE = '{"type":"ka"}', KEEPALIVE_S = 30;

export class WorldDO extends DurableObject<Env> {
  private srv!: Server;
  /** D1 write-through of the game state (db/d1.ts); null without a DB binding or without the migrations applied. */
  private sink: D1Sink | null = null;
  private nextPeer = 1;

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    const log = env.LOG === "1" ? (s: string) => console.log(s) : () => {};
    void ctx.blockConcurrencyWhile(() => bootDuel(env.BUCKET, log)); // the duel engine (async once; src/duel/boot.ts)
    const cfg = configFrom(env as unknown as Record<string, unknown>);
    const db = env.DB;
    if (!db) { this.srv = buildServer(cfg, null, log); return; }
    // the state lives in D1: nothing is served until it is loaded; every save then writes the changed rows
    void ctx.blockConcurrencyWhile(async () => {
      try {
        const st = await loadState(db);
        this.srv = buildServer(cfg, Object.keys(st).length ? st : null, log);
        this.sink = attach(this.srv.game.store, db, { baseline: st });
        // bans, GM accounts, sanction flags, shop prices, start values (admin tables)
        Object.assign(this.srv.game.admin.data, await loadAdmin(db));
        this.srv.game.admin.sink = adminSink(db);
        log(`[d1] state loaded: ${Object.keys(st.accounts ?? {}).length} accounts`);
      } catch (e) {
        // e.g. wrangler dev without `d1 migrations apply` (parity runs): run on memory only
        console.error(`[d1] game state not loaded (${e}); running without D1`);
        this.srv = buildServer(cfg, null, log);
      }
    });
  }

  override async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname.startsWith("/__admin/")) {
      // admin API (py's console/panel actions that reach players): POST JSON. The Worker forwards it only for a session
      // with the admin role (role_grant), setting x-de-admin; the DO is not reachable any other way. DEV: open.
      if (!request.headers.get("x-de-admin") && this.env.DEV !== "1") return new Response("forbidden", { status: 403 });
      const body = request.method === "POST" ? await request.json().catch(() => ({})) : {};
      const g = this.srv.game;
      const out = await new Promise<{ ok: unknown } | { error: string }>((res) => this.srv.world.run(() => {
        try { res({ ok: g.admin.run(url.pathname.slice(9), body as Record<string, unknown>) }); } catch (e) { res({ error: String(e) }); }
      }));
      return "error" in out ? Response.json(out, { status: 400 }) : Response.json(out.ok);
    }
    if (url.pathname === "/__de/prefetch") {
      // the Worker forwards GET /api/de/prefetch/duel here with x-de-user (a checked session); 204 = nothing to prefetch
      const user = request.headers.get("x-de-user");
      const out = user ? await new Promise<ReturnType<NonNullable<typeof this.srv.game.duel>["prefetchFor"]>>((res) =>
        this.srv.world.run(() => res(this.srv.game.duel?.prefetchFor(user) ?? null))) : null;
      return out ? Response.json(out, { headers: { "Cache-Control": "no-store" } }) : new Response(null, { status: 204 });
    }
    if (url.pathname === "/__de/starter" || url.pathname === "/__de/starter/claim") {
      // the Worker forwards /api/de/starter(/claim) here with x-de-user (a checked session); starter.ts
      const user = request.headers.get("x-de-user");
      if (!user) return Response.json({ error: "signed out" }, { status: 401 });
      const claim = url.pathname.endsWith("/claim") ? ((await request.json().catch(() => ({}))) as { id?: unknown }) : null;
      const [status, out] = await new Promise<[number, unknown]>((res) => this.srv.world.run(() => {
        const g = this.srv.game;
        try { res(claim ? starterClaim(g, user, Number(claim.id)) : [200, starterInfo(g, user)]); }
        catch (e) { console.error(`[starter] ${e}`); res([500, { error: "server error" }]); }
      }));
      return Response.json(out, { status, headers: { "Cache-Control": "no-store" } });
    }
    if (url.pathname === "/__dev/state" && this.env.DEV === "1") {
      // parity runs: start from the same state.json as py (never enabled outside wrangler dev). With D1 in use, the
      // seeded state replaces what D1 had (the sink diffs it against D1's rows), so D1 always mirrors the server.
      if (request.method === "POST") {
        this.srv.reset(await request.json());
        if (this.sink) { this.sink.attach(this.srv.game.store); this.sink.save(this.srv.game.store.loadRaw()); await this.sink.flush(); }
        return new Response("ok");
      }
      return Response.json(this.srv.game.store.loadRaw());
    }
    if (request.headers.get("Upgrade")?.toLowerCase() !== "websocket") return new Response("expected websocket", { status: 426 });
    const { 0: client, 1: ws } = new WebSocketPair();
    ws.accept();
    (ws as unknown as { binaryType: string }).binaryType = "arraybuffer"; // newer compat dates default to Blob
    const id = `ws${this.nextPeer++}`;
    const world = this.srv.world;
    // x-de-user: the DE account's user id, set by the Worker after checking the session (null only on the parity bridge)
    world.openPeer(id, request.headers.get("x-de-user"), (s) => { try { ws.send(s); } catch { /* closing */ } },
      (b) => { try { ws.send(b); return true; } catch { return false; } });
    ws.addEventListener("message", (e) => {
      if (typeof e.data === "string") world.onText(id, e.data);
      else world.onBinary(id, new Uint8Array(e.data as ArrayBuffer));
    });
    // keepalive: a text frame every 30 s, so a WebSocket whose client is asleep (a hidden tab sends its 60 s heartbeats
    // late) never sits idle long enough for the edge to close it. The client drops text frames without an "id".
    const ka = setInterval(() => { try { ws.send(KEEPALIVE); } catch { /* closing */ } }, KEEPALIVE_S * 1000);
    const bye = () => { clearInterval(ka); world.closePeer(id); };
    ws.addEventListener("close", bye);
    ws.addEventListener("error", bye);
    return new Response(null, { status: 101, webSocket: client });
  }
}
