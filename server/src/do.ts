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
import { adminDeck, currentOf, deckCurrent, deckDelete, deckIn, deckOwner, deckPut, decksGet, type Owner } from "./game/decks.ts";
import { logLevel } from "./util/loglevel.ts";
import { upgradeCards } from "./game/passcodes.ts";
import { SCHEMA } from "./game/persist.ts";
import type { State } from "./game/store.ts";

const KEEPALIVE = '{"type":"ka"}', KEEPALIVE_S = 30;

export class WorldDO extends DurableObject<Env> {
  private srv!: Server;
  /** D1 write-through of the game state (db/d1.ts); null without a DB binding or without the migrations applied. */
  private sink: D1Sink | null = null;
  private nextPeer = 1;
  /** Every open gateway WebSocket: /__admin/shutdown closes them with 4012 before a deploy (the client reconnects). */
  private sockets = new Map<WebSocket, (hold?: boolean) => void>();

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    // without LOG=1 (production) only errors, protocol anomalies and the economy reach Workers Logs (util/loglevel.ts)
    const log = env.LOG === "1" ? (s: string) => console.log(s)
      : (s: string) => { const l = logLevel(s); if (l === "error") console.error(s); else if (l) console.warn(s); };
    const cfg = configFrom(env as unknown as Record<string, unknown>);
    const db = env.DB;
    // the duel engine (async once; src/duel/boot.ts) boots AFTER the state, never beside it: a cold boot holds the D1
    // rows, the state and the projector at once, and with the engine too it went over the 128 MB isolate limit
    // ("internal error" / "Internal error in Durable Object storage caused object to be reset", 2026-10-29)
    if (!db) { this.srv = buildServer(cfg, null, log); void ctx.blockConcurrencyWhile(() => bootDuel(env.BUCKET, log)); return; }
    // the state lives in D1: nothing is served until it is loaded; every save then writes the changed rows
    void ctx.blockConcurrencyWhile(async () => {
      try {
        let loaded: State | null = await loadState(db);
        // a state from before the card wire: to passcodes on a copy, written back below (the diff against what D1
        // holds); otherwise no copy: the Store's own is the only one kept, and the projector starts from it
        const fresh = !Object.keys(loaded).length;
        const convert = !fresh && loaded.schema !== SCHEMA;
        const st = fresh ? { players: {}, schema: SCHEMA } : convert ? structuredClone(loaded) : loaded;
        const up = upgradeCards(st);
        this.srv = buildServer(cfg, st, log);
        this.sink = attach(this.srv.game.store, db, { baseline: convert ? loaded : this.srv.game.store.peek() });
        loaded = null;
        if (up) {
          console.warn(`[d1] card ids to passcodes: ${up.already ? "already passcodes, marked" : `${up.profiles} profiles`}` +
            (up.unmapped.length ? `; kept without a passcode: ${up.unmapped.slice(0, 20).join(",")}` : ""));
          this.sink.save(this.srv.game.store.loadRaw());
          await this.sink.flush();
        }
        // bans, GM accounts, sanction flags, shop prices, start values (admin tables)
        Object.assign(this.srv.game.admin.data, await loadAdmin(db));
        this.srv.game.admin.sink = adminSink(db);
        log(`[d1] state loaded: ${Object.keys(st.accounts ?? {}).length} accounts`);
      } catch (e) {
        // e.g. wrangler dev without `d1 migrations apply` (parity runs): run on memory only
        console.error(`[d1] game state not loaded (${e}); running without D1`);
        this.srv = buildServer(cfg, null, log);
      }
      await bootDuel(env.BUCKET, log);
    });
  }

  override async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname.startsWith("/__admin/")) {
      // admin API (py's console/panel actions that reach players): POST JSON. The Worker forwards it only for a session
      // with the admin role (role_grant), setting x-de-admin; the DO is not reachable any other way. DEV: open.
      if (!request.headers.get("x-de-admin") && this.env.DEV !== "1") return new Response("forbidden", { status: 403 });
      // the version this instance runs: after a deploy the old instance keeps serving its sockets for minutes
      if (url.pathname === "/__admin/version") return Response.json({ v: this.env.CF_VERSION_METADATA?.id ?? "dev" });
      if (url.pathname === "/__admin/prepare-restart" || url.pathname === "/__admin/shutdown") {
        if (request.method !== "POST") return new Response("method not allowed", { status: 405 });
        // Latch and stop all result paths BEFORE flushing saves or closing any transport.
        // World.run logs handler exceptions; explicitly propagate preparation failures.
        await new Promise<void>((resolve, reject) => {
          void this.srv.world.run(() => {
            try { this.srv.game.duel!.prepareRestart(); resolve(); }
            catch (error) { reject(error); }
          });
        });
        await this.sink?.flush();
        if (url.pathname === "/__admin/prepare-restart") return Response.json({ ready: true, duelsVoided: true });
        const n = this.sockets.size;
        this.srv.game.stopping = true;
        for (const [ws, bye] of this.sockets) { try { ws.close(4012, "server-update"); } catch { /* closing */ } bye(false); }
        await this.srv.world.run(() => {});
        await this.sink?.flush();
        return Response.json({ closed: n, duelsVoided: true });
      }
      const body = request.method === "POST" ? await request.json().catch(() => ({})) : {};
      const g = this.srv.game;
      if (url.pathname === "/__admin/deck") {
        if (!this.env.DB) return Response.json({ error: "no D1" }, { status: 503 });
        const [st, r] = await adminDeck(this.env.DB, g.store.peek().accounts, body as Record<string, unknown>);
        if (st === 200) console.warn(`[economia] admin: deck "${(body as any).name}" for ${String((body as any).acct).slice(0, 8)} set as current`);
        return Response.json(r, { status: st });
      }
      if (url.pathname === "/__admin/reset-account") {
        // backup first (the account's state + its deck store, to a private R2 object), then admin.resetAccount, then
        // the deck store rows (user_decks / user_deck_current, keyed "<acct>/<slot>"); a failed backup changes nothing
        const acct = String((body as any).acct ?? ""), db = this.env.DB, bucket = this.env.BUCKET;
        const account = g.store.peek().accounts?.[acct];
        if (!account) return Response.json({ error: "no_account" }, { status: 404 });
        if (!db || !bucket) return Response.json({ error: "no D1/R2" }, { status: 503 });
        const keys = [0, 1, 2, 3].map((slot) => `${acct}/${slot}`);   // every slot: a deleted character's decks too
        const rows = async (t: string) =>
          (await db.prepare(`SELECT * FROM ${t} WHERE char_key IN (${keys.map(() => "?").join(",")})`).bind(...keys).all()).results;
        const decks = await rows("user_decks"), current = await rows("user_deck_current");
        const tag = String((body as any).tag ?? "").replace(/[^A-Za-z0-9_-]/g, "").slice(0, 32) || acct.slice(0, 8).replace(/[^A-Za-z0-9]/g, "");
        const at = new Date().toISOString();
        const backup = `private/backups/account-${tag}-${at}.json`;
        await bucket.put(backup, JSON.stringify({ acct, at, account, user_decks: decks, user_deck_current: current }));
        const r = await new Promise<ReturnType<typeof g.admin.resetAccount>>((res) => this.srv.world.run(() => res(g.admin.resetAccount(acct))));
        if ("error" in r) return Response.json({ ...r, backup }, { status: 409 });
        await db.batch(["user_decks", "user_deck_current"].map((t) =>
          db.prepare(`DELETE FROM ${t} WHERE char_key IN (${keys.map(() => "?").join(",")})`).bind(...keys)));
        return Response.json({ ...r, backup, user_decks: decks.length, user_deck_current: current.length });
      }
      const out = await new Promise<{ ok: unknown } | { error: string }>((res) => this.srv.world.run(() => {
        try { res({ ok: g.admin.run(url.pathname.slice(9), body as Record<string, unknown>) }); } catch (e) { res({ error: String(e) }); }
      }));
      return "error" in out ? Response.json(out, { status: 400 }) : Response.json(out.ok);
    }
    if (this.srv.game.restarting) return new Response("server restarting", { status: 503, headers: { "Retry-After": "10" } });
    if (url.pathname === "/__de/prefetch") {
      // the Worker forwards GET /api/de/prefetch/duel here with x-de-user (a checked session); 204 = nothing to prefetch
      const user = request.headers.get("x-de-user");
      const out = user ? await new Promise<ReturnType<NonNullable<typeof this.srv.game.duel>["prefetchFor"]>>((res) =>
        this.srv.world.run(() => res(this.srv.game.duel?.prefetchFor(user) ?? null))) : null;
      return out ? Response.json(out, { headers: { "Cache-Control": "no-store" } }) : new Response(null, { status: 204 });
    }
    if (url.pathname === "/__de/friends") {
      // the Worker forwards GET /api/de/friends here with x-de-user (a checked session); Lobby.friendsInfo
      const user = request.headers.get("x-de-user");
      if (!user) return Response.json({ error: "signed out" }, { status: 401 });
      const [status, out] = await new Promise<[number, unknown]>((res) => this.srv.world.run(() => {
        try { res(this.srv.game.lp.friendsInfo(user)); } catch (e) { console.error(`[friends] ${e}`); res([500, { error: "server error" }]); }
      }));
      return Response.json(out, { status, headers: { "Cache-Control": "no-store" } });
    }
    if (url.pathname === "/__de/duel/challenge") {
      // the Worker forwards POST /api/de/duel/challenge {pid} here with x-de-user (a checked session); Lobby.duelInvite
      const user = request.headers.get("x-de-user");
      if (!user) return Response.json({ error: "signed out" }, { status: 401 });
      const body = (await request.json().catch(() => ({}))) as { pid?: unknown; name?: unknown };
      const [status, out] = await new Promise<[number, unknown]>((res) => this.srv.world.run(() => {
        try { res(this.srv.game.lp.duelInvite(user, Number(body.pid) || 0, typeof body.name === "string" ? body.name.slice(0, 32) : "")); } catch (e) { console.error(`[duel invite] ${e}`); res([500, { error: "server error" }]); }
      }));
      return Response.json(out, { status, headers: { "Cache-Control": "no-store" } });
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
    if (url.pathname.startsWith("/__de/decks")) {
      // the Worker forwards /api/de/decks(/current|/<name>) here with x-de-user (a checked session); game/decks.ts
      const user = request.headers.get("x-de-user"), db = this.env.DB;
      if (!user) return Response.json({ error: "signed out" }, { status: 401 });
      if (!db) return Response.json({ error: "no database" }, { status: 503 });
      // a claimed starter deck reaches the list through GET (decksGet: once, the World's current if none)
      const o = await new Promise<Owner | [number, Record<string, unknown>]>((res) => this.srv.world.run(() => res(deckOwner(this.srv.game, user))));
      const rest = decodeURIComponent(url.pathname.slice("/__de/decks".length).replace(/^\//, ""));
      const body = request.method === "PUT" ? await request.json().catch(() => null) as Record<string, unknown> | null : null;
      let r: [number, Record<string, unknown>];
      try {
        if (Array.isArray(o)) r = o;
        else if (request.method === "GET" && !rest) r = await decksGet(db, o);
        else if (request.method === "PUT" && rest === "current") r = await deckCurrent(db, o.key, body);
        else if (request.method === "PUT" && !rest) {
          const d = deckIn(body), cur = currentOf(body);
          r = typeof d === "string" ? [400, { error: d }] : cur === "bad mode" ? [400, { error: cur }] : await deckPut(db, o.key, d, cur);
        } else if (request.method === "DELETE" && rest) r = await deckDelete(db, o.key, rest);
        else r = [405, { error: "method not allowed" }];
      } catch (e) { console.error(`[decks] ${e}`); r = [500, { error: "server error" }]; }
      return Response.json(r[1], { status: r[0], headers: { "Cache-Control": "no-store" } });
    }
    if (url.pathname === "/__dev/cut" && this.env.DEV === "1") {
      // wrangler dev only: the server side cuts one player's virtual socket (POST {acct, port: 5760}), as a duel-socket
      // drop does: phase2-net's duel re-attach test
      const b = (await request.json().catch(() => ({}))) as { acct?: string; port?: number };
      const out = await new Promise<number>((res) => this.srv.world.run(() => {
        const c = this.srv.game.hub.sessions.get(String(b.acct))?.conns.get(Number(b.port ?? 5760));
        if (c && !c.closed) this.srv.world.close(c, "cut (dev)");
        res(c ? 1 : 0);
      }));
      return Response.json({ cut: out });
    }
    if (url.pathname === "/__dev/state" && this.env.DEV === "1") {
      // parity runs: start from the same state.json as py (never enabled outside wrangler dev). With D1 in use, the
      // seeded state replaces what D1 had (the sink diffs it against D1's rows), so D1 always mirrors the server.
      if (request.method === "POST") {
        const st = await request.json() as Record<string, unknown>;
        upgradeCards(st);   // py's states carry the 2008 card ids (schema 2)
        this.srv.reset(st);
        if (this.sink) { this.sink.attach(this.srv.game.store); this.sink.save(this.srv.game.store.loadRaw()); await this.sink.flush(); }
        return new Response("ok");
      }
      return Response.json(this.srv.game.store.loadRaw());
    }
    if (request.headers.get("Upgrade")?.toLowerCase() !== "websocket") return new Response("expected websocket", { status: 426 });
    if (this.srv.game.stopping) return new Response("server-update", { status: 503 });
    if (!this.srv.world.canOpen(request.headers.get("x-de-user"))) return new Response("too many game connections", { status: 429 });
    const { 0: client, 1: ws } = new WebSocketPair();
    ws.accept();
    (ws as unknown as { binaryType: string }).binaryType = "arraybuffer"; // newer compat dates default to Blob
    const id = `ws${this.nextPeer++}`;
    const world = this.srv.world;
    // x-de-user: the DE account's user id, set by the Worker after checking the session (null only on the parity bridge)
    // ?sid= (32 hex, the client's tunnel id) and &resume=1 after a drop: world.ts holds and hands over its sockets
    const sid = /^[0-9a-f]{32}$/.test(url.searchParams.get("sid") ?? "") ? url.searchParams.get("sid") : null;
    world.openPeer(id, request.headers.get("x-de-user"), (s) => { try { ws.send(s); } catch { /* closing */ } },
      (b) => { try { ws.send(b); return true; } catch { return false; } }, sid, url.searchParams.get("resume") === "1");
    ws.addEventListener("message", (e) => {
      if (this.srv.game.restarting) return;
      if (typeof e.data === "string") world.onText(id, e.data);
      else world.onBinary(id, new Uint8Array(e.data as ArrayBuffer));
    });
    // keepalive: a text frame every 30 s, so a WebSocket whose client is asleep (a hidden tab sends its 60 s heartbeats
    // late) never sits idle long enough for the edge to close it. The client drops text frames without an "id".
    const ka = setInterval(() => { try { ws.send(KEEPALIVE); } catch { /* closing */ } }, KEEPALIVE_S * 1000);
    // hold: a dropped WebSocket's sockets wait for a resume; a deploy's shutdown closes them at once
    const bye = (hold = true) => { clearInterval(ka); this.sockets.delete(ws); world.closePeer(id, hold); };
    this.sockets.set(ws, bye);
    ws.addEventListener("close", () => bye());
    ws.addEventListener("error", () => bye());
    return new Response(null, { status: 101, webSocket: client });
  }
}
