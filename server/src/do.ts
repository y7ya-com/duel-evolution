import { rewardsView, rewardsClaim, rewardDeckSaved, rewardShopVisited } from "./game/rewards.ts";
import { craftView, craftOperation, deckNeeds, type Deck } from "./game/crafting.ts";
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
import { aiRulesPost, aiRulesView, loadAiRules } from "./duel/aiRulesStore.ts";
import { setActiveRules } from "./duel/ai/index.ts";
import { starterClaim, starterInfo, walletInfo } from "./game/starter.ts";
import { adminDeck, currentOf, deckCurrent, deckDelete, deckIn, deckOwner, deckPut, decksGet, type Owner } from "./game/decks.ts";
import { logLevel } from "./util/loglevel.ts";
import { recordTrade } from "./db/audit.ts";
import { listReplays, recordDuel, replayFile } from "./duel/duelArchive.ts";
import { npcName } from "./game/npcs.ts";
import { upgradeCards } from "./game/passcodes.ts";
import { SCHEMA } from "./game/persist.ts";
import type { State } from "./game/store.ts";
import { cosmeticInfo, cosmeticOpen, cosmeticEquip, cosmeticAppearance, cosmeticTrade, cosmeticTradeAccept, cosmeticTradeCancel } from "./game/cosmetics.ts";
import { shopView, shopPurchaseApi, shopPackView } from "./game/shop-api.ts";
import { chatGet, chatSend, relayIn } from "./game/chat.ts";
import { rankLookup, RANK_MAX_AGE } from "./game/rank-api.ts";
import { tradeCosmeticsInfo, tradeCosmeticsPanel, tradeCosmeticsSet } from "./game/trade-cosmetics.ts";
import { CREATED_HEADER, IPB_HEADER } from "./auth/binding.ts";
import { DiscordBridge, type DiscordDuelist } from "./discord/bridge.ts";
import { publicRank } from "./game/rank-api.ts";
import { isFree } from "./game/freemode.ts";

const KEEPALIVE = '{"type":"ka"}', KEEPALIVE_S = 30;

export class WorldDO extends DurableObject<Env> {
  private srv!: Server;
  /** D1 write-through of the game state (db/d1.ts); null without a DB binding or without the migrations applied. */
  private sink: D1Sink | null = null;
  private nextPeer = 1;
  /** Every open gateway WebSocket: /__admin/shutdown closes them with 4012 before a deploy (the client reconnects). */
  private sockets = new Map<WebSocket, (hold?: boolean) => void>();
  private log: (s: string) => void;
  /** wrangler dev only (/__dev/discord-online): a fixed answer for /api/de/discord-online */
  private devDiscordOnline: DiscordDuelist[] | null = null;

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    // without LOG=1 (production) only errors, protocol anomalies and the economy reach Workers Logs (util/loglevel.ts)
    const log = env.LOG === "1" ? (s: string) => console.log(s)
      : (s: string) => { const l = logLevel(s); if (l === "error") console.error(s); else if (l) console.warn(s); };
    this.log = log;
    const cfg = configFrom(env as unknown as Record<string, unknown>);
    const db = env.DB;
    // the duel engine (async once; src/duel/boot.ts) boots AFTER the state, never beside it: a cold boot holds the D1
    // rows, the state and the projector at once, and with the engine too it went over the 128 MB isolate limit
    // ("internal error" / "Internal error in Durable Object storage caused object to be reset", 2026-10-29)
    if (!db) { this.srv = buildServer(cfg, null, log); this.discord(); void ctx.blockConcurrencyWhile(() => bootDuel(env.BUCKET, log)); return; }
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
        this.discord();
        this.sink = attach(this.srv.game.store, db, { baseline: convert ? loaded : this.srv.game.store.peek() });
        // the trade ledger (db/audit.ts): every confirmed trade, done or refused, as it happens
        if (this.srv.game.tp) this.srv.game.tp.ledger = (e) => { void recordTrade(db, e).catch((err) => console.error(`[trade_log] ${err}`)); };
        // the duel archive (duel/duelArchive.ts): every duel as it ends, its EDOPro replay in R2 for the players
        this.srv.game.duelArchive = (e) => { void recordDuel(db, this.env.BUCKET, e).catch((err) => console.error(`[duel_archive] ${err}`)); };
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
        // the NPC card rules' live overlay (duel/aiRulesStore.ts): a failure leaves rules.json alone
        try { setActiveRules(await loadAiRules(db)); } catch (e) { console.error(`[ai-rules] not loaded (${e}); rules.json alone`); }
        log(`[d1] state loaded: ${Object.keys(st.accounts ?? {}).length} accounts`);
      } catch (e) {
        // e.g. wrangler dev without `d1 migrations apply` (parity runs): run on memory only
        console.error(`[d1] game state not loaded (${e}); running without D1`);
        this.srv = buildServer(cfg, null, log);
        this.discord();
      }
      await bootDuel(env.BUCKET, log);
    });
  }

  /** The Discord bridge (discord/bridge.ts) on the game just built: All Chat <-> #in-game, #duels. */
  private discord() {
    const g = this.srv.game;
    g.discord = this.env.DISCORD_BOT_TOKEN ? new DiscordBridge(this.env, g, this.log) : null;
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
      if (url.pathname === "/__admin/trade-funnel") {
        if (!this.env.DB) return Response.json({ error: "no D1" }, { status: 503 });
        const days = Number((body as any)?.days ?? url.searchParams.get("days") ?? 7);
        if (!Number.isInteger(days) || days < 1 || days > 365) return Response.json({ error: "invalid-window" }, { status: 400 });
        return Response.json(await g.admin.tradeFunnel(this.env.DB, days));
      }
      if (url.pathname === "/__admin/ai-rules") {
        // the NPC card rules' live overlay: GET the version played and the history; POST { overlay, note, dryRun } or
        // { revert: <version> } (duel/aiRulesStore.ts). The next NPC duel plays by a pushed version.
        if (!this.env.DB) return Response.json({ error: "no D1" }, { status: 503 });
        if (request.method !== "POST") return Response.json(await aiRulesView(this.env.DB));
        const by = request.headers.get("x-de-admin") ?? "dev";
        const [st, r] = await aiRulesPost(this.env.DB, by, body as Record<string, unknown>);
        if (st === 200 && !r.dryRun) console.warn(`[ai-rules] version ${r.version} by ${by}: ${(r.cards as string[]).length} cards changed${r.note ? ` (${r.note})` : ""}`);
        return Response.json(r, { status: st });
      }
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
    if (url.pathname === "/__de/rank") {
      // GET /api/de/rank?pid=|name=|self=1 (game/rank-api.ts): public ranked standings; the browser may keep one briefly
      if (request.method !== "GET") return Response.json({ error: "method not allowed" }, { status: 405 });
      const r = await new Promise<ReturnType<typeof rankLookup>>((res) =>
        this.srv.world.run(() => { try { res(rankLookup(this.srv.game, request.headers.get("x-de-user"), url.searchParams)); } catch (e) { console.error(`[rank] ${e}`); res({ error: "server error", status: 500 }); } }));
      const failed = "error" in r, body = failed ? { error: r.error, ...(r.retryAfter ? { retryAfter: r.retryAfter } : {}) } : r;
      return Response.json(body, { status: failed ? r.status : 200, headers: failed && r.status === 429
        ? { "Cache-Control": "no-store", "Retry-After": String(r.retryAfter ?? 1) } : { "Cache-Control": failed ? "no-store" : `private, max-age=${RANK_MAX_AGE}` } });
    }
    if (/^\/__de\/(cosmetics|shop|chat|trade|craft|rewards)(?:\/|$)/.test(url.pathname)) {
      const user = request.headers.get("x-de-user");
      if (!user) return Response.json({ error: "signed out" }, { status: 401 });
      // Saved decks live in D1, not profile.decks (which only keeps duel history).
      let craftNeed: Record<string, number> = {};
      let craftCharacter: string | null = null;
      if (url.pathname.startsWith("/__de/craft")) {
        if (!this.env.DB) return Response.json({ error: "deck-store-unavailable" }, { status: 503 });
        const acct = this.srv.game.store.accountOfUser(user), session = acct ? this.srv.game.hub.sessions.get(acct) : null;
        if (session?.slot !== null && session?.slot !== undefined) {
          craftCharacter = `${acct}/${session.slot}`;
          const rows = (await this.env.DB.prepare("SELECT main, side, extra FROM user_decks WHERE char_key = ? AND deleted = 0")
            .bind(`${acct}/${session.slot}`).all<{ main: string; side: string; extra: string }>()).results;
          craftNeed = deckNeeds(rows.map((r) => ({ main: JSON.parse(r.main), side: JSON.parse(r.side), extra: JSON.parse(r.extra) } as Deck)));
        }
      }
      const reads: Record<string, () => unknown> = {
        "/__de/rewards": () => rewardsView(this.srv.game, user),
        "/__de/craft": () => craftView(this.srv.game, user, craftNeed),
        "/__de/cosmetics": () => cosmeticInfo(this.srv.game, user),
        "/__de/shop": () => {
          const result = shopView(this.srv.game, user);
          if (!("error" in result)) rewardShopVisited(this.srv.game, user);
          return result;
        },
        "/__de/shop/pack": () => shopPackView(this.srv.game, user, url.searchParams.get("id")),
        "/__de/chat": () => chatGet(this.srv.game, user, Number(url.searchParams.get("after") ?? 0)),
        "/__de/trade/cosmetics": () => tradeCosmeticsInfo(this.srv.game, user),
      };
      const writes: Record<string, (body: unknown) => unknown> = {
        "/__de/rewards/claim": (b) => rewardsClaim(this.srv.game, user, b),
        "/__de/craft/make": (b) => craftOperation(this.srv.game, user, "make", b, craftNeed),
        "/__de/craft/dismantle": (b) => craftOperation(this.srv.game, user, "dismantle", b, craftNeed),
        "/__de/craft/dismantle-extras": (b) => craftOperation(this.srv.game, user, "dismantle-extras", b, craftNeed),
        "/__de/cosmetics/open": (b) => cosmeticOpen(this.srv.game, user, b),
        "/__de/cosmetics/equip": (b) => cosmeticEquip(this.srv.game, user, b),
        "/__de/cosmetics/appearance": (b) => cosmeticAppearance(this.srv.game, user, b),
        "/__de/cosmetics/trade": (b) => cosmeticTrade(this.srv.game, user, b),
        "/__de/cosmetics/trade/accept": (b) => cosmeticTradeAccept(this.srv.game, user, b),
        "/__de/cosmetics/trade/cancel": (b) => cosmeticTradeCancel(this.srv.game, user, b),
        "/__de/cosmetics/trade/decline": (b) => cosmeticTradeCancel(this.srv.game, user, b),
        "/__de/shop/buy": (b) => shopPurchaseApi(this.srv.game, user, b),
        "/__de/chat": (b) => chatSend(this.srv.game, user, b),
        // the native trade's cosmetic lines (game/trade-cosmetics.ts): in memory until the trade's one commit
        "/__de/trade/cosmetics": (b) => tradeCosmeticsSet(this.srv.game, user, b),
        "/__de/trade/cosmetics/panel": (b) => tradeCosmeticsPanel(this.srv.game, user, b),
      };
      let body: unknown = null;
      if (request.method === "POST") {
        const raw = await request.text();
        if (raw.length > 32768) return Response.json({ error: "request too large" }, { status: 413 });
        try { body = JSON.parse(raw); } catch { return Response.json({ error: "invalid JSON" }, { status: 400 }); }
      }
      const action = request.method === "GET" ? reads[url.pathname] : request.method === "POST" && writes[url.pathname]
        ? () => writes[url.pathname](body) : null;
      if (!action) return Response.json({ error: "method not allowed" }, { status: 405 });
      try {
        const result = await new Promise<any>((resolve, reject) => {
          void this.srv.world.run(() => { try {
            if (craftCharacter) {
              const acct = this.srv.game.store.accountOfUser(user), session = acct ? this.srv.game.hub.sessions.get(acct) : null;
              if (`${acct}/${session?.slot}` !== craftCharacter) { resolve({ error: "character-changed", status: 409 }); return; }
            }
            resolve(action());
          } catch (e) { reject(e); } });
        });
        // A successful money/item response is acknowledged only after write-through persistence.
        // (chat and the trade panel write nothing to D1: a trade's commit is flushed by the next save as any trade's)
        if (!/^\/__de\/(chat|trade)/.test(url.pathname)) await this.sink?.flush();
        const failed = result && typeof result === "object" && "error" in result;
        return Response.json(result && typeof result === "object" && "ok" in result ? result.ok : result,
          { status: failed ? (result.status ?? 409) : 200, headers: { "Cache-Control": "no-store" } });
      } catch (e) {
        console.error(`[game API] ${url.pathname}: ${e}`);
        return Response.json({ error: "temporarily-unavailable" }, { status: 503, headers: { "Cache-Control": "no-store" } });
      }
    }
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
    if (url.pathname === "/__de/duels" || url.pathname === "/__de/duels/join") {
      // the Worker forwards GET /api/de/duels (the chat's Duels tab: the open duels of the viewer's world, Lobby.openDuels)
      // and POST /api/de/duels/join {id} (may this player join it from here: Lobby.duelJoinCheck) with x-de-user
      const user = request.headers.get("x-de-user");
      if (!user) return Response.json({ error: "signed out" }, { status: 401 });
      const body = request.method === "POST" ? (await request.json().catch(() => ({}))) as { id?: unknown } : null;
      const [status, out] = await new Promise<[number, unknown]>((res) => this.srv.world.run(() => {
        try {
          const g = this.srv.game, acct = g.store.accountOfUser(user), s = acct ? g.hub.sessions.get(acct) : undefined;
          if (body) return res(g.lp.duelJoinCheck(user, Number(body.id) || 0));
          const free = isFree(s ?? null);
          res([200, { you: s?.pid ?? null, duels: g.lp.openDuels().filter((d) => d.free === free).map((d) => ({ ...d, mine: d.pid === s?.pid })) }]);
        } catch (e) { console.error(`[duels] ${e}`); res([500, { error: "server error" }]); }
      }));
      return Response.json(out, { status, headers: { "Cache-Control": "no-store" } });
    }
    if (url.pathname === "/__de/discord-online") {
      // the Worker forwards GET /api/de/discord-online (the Players window's "(Discord)" rows) with x-de-user: the duelists
      // online on Discord and not in the game (discord/bridge.ts discordOnline)
      if (!request.headers.get("x-de-user")) return Response.json({ error: "signed out" }, { status: 401 });
      const players = this.devDiscordOnline ?? await (this.srv.game.discord?.discordOnline() ?? Promise.resolve([])).catch((e) => { console.error(`[discord online] ${e}`); return []; });
      return Response.json({ players }, { headers: { "Cache-Control": "private, max-age=30" } });
    }
    if (url.pathname === "/__de/discord/duel") {
      // the Worker's Discord interactions (discord/interactions.ts, a #duels Accept): is room ?id still open, and is it
      // ?user's own. Only the Worker reaches /__de/discord/*; a closed duel's #duels message is cleared now.
      const id = Number(url.searchParams.get("id")), user = url.searchParams.get("user");
      const out = await new Promise<unknown>((res) => this.srv.world.run(() => {
        const g = this.srv.game, d = g.discord?.openDuels().find((o) => o.id === id) ?? null;
        if (!d) g.duelsChanged?.();
        const acct = user ? g.store.accountOfUser(user) : null;
        res({ duel: d, self: !!d && !!acct && g.hub.sessions.get(acct)?.pid === d.pid });
      }));
      return Response.json(out, { headers: { "Cache-Control": "no-store" } });
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
    if (url.pathname === "/__de/replays" || url.pathname.startsWith("/__de/replays/")) {
      // the Worker forwards GET /api/de/replays(/<id>) here with x-de-user: the list of the account's duels, or which
      // file of theirs it may stream (it reads R2 itself)
      const user = request.headers.get("x-de-user"), db = this.env.DB;
      if (!user) return Response.json({ error: "signed out" }, { status: 401 });
      if (!db) return Response.json({ error: "no database" }, { status: 503 });
      const acct = await new Promise<string | null>((res) => this.srv.world.run(() => res(this.srv.game.store.accountOfUser(user) ?? null)));
      if (!acct) return Response.json({ error: "no game account" }, { status: 404 });
      try {
        const id = url.pathname.slice("/__de/replays/".length);
        if (!id) return Response.json({ replays: await listReplays(db, acct, npcName) }, { headers: { "Cache-Control": "no-store" } });
        const f = /^\d+$/.test(id) ? await replayFile(db, acct, Number(id), npcName) : null;
        return f ? Response.json(f, { headers: { "Cache-Control": "no-store" } }) : Response.json({ error: "not found" }, { status: 404 });
      } catch (e) { console.error(`[replays] ${e}`); return Response.json({ error: "server error" }, { status: 500 }); }
    }
    if (url.pathname === "/__de/wallet") {
      const user = request.headers.get("x-de-user");
      if (!user) return Response.json({ error: "signed out" }, { status: 401 });
      if (request.method !== "GET") return Response.json({ error: "method not allowed" }, { status: 405 });
      const [status, out] = await new Promise<[number, ReturnType<typeof walletInfo>]>((res) => this.srv.world.run(() => {
        try { const info = walletInfo(this.srv.game, user); res(["error" in info ? 409 : 200, info]); }
        catch (e) { console.error(`[wallet] ${e}`); res([500, { error: "server error" }]); }
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
          if (r[0] === 200 && typeof d !== "string") {
            await this.srv.world.run(() => rewardDeckSaved(this.srv.game, user, o.key, d.main, d.extra, body?.mode));
            await this.sink?.flush();
          }
        } else if (request.method === "DELETE" && rest) r = await deckDelete(db, o.key, rest);
        else r = [405, { error: "method not allowed" }];
      } catch (e) { console.error(`[decks] ${e}`); r = [500, { error: "server error" }]; }
      return Response.json(r[1], { status: r[0], headers: { "Cache-Control": "no-store" } });
    }
    if (url.pathname === "/__dev/discord-online" && this.env.DEV === "1") {
      // wrangler dev only: what /api/de/discord-online answers (POST {players: [{pid, name, lv, rank}]}, or {players: null}
      // for the real list; {names: [...]} for names alone, LV 1 and unranked)
      const b = (await request.json().catch(() => ({}))) as { players?: unknown; names?: unknown };
      this.devDiscordOnline = Array.isArray(b.players) ? b.players as DiscordDuelist[]
        : Array.isArray(b.names) ? b.names.map((n, i) => ({ pid: 90000 + i, name: String(n), lv: 1, rank: publicRank(90000 + i, String(n), {}), parts: [] })) : null;
      return new Response("ok");
    }
    if (url.pathname === "/__dev/discord-wake" && this.env.DEV === "1") { this.srv.game.discord?.wake(); return new Response("ok"); }
    if (url.pathname === "/__dev/discord-say" && this.env.DEV === "1") {
      // wrangler dev only: a #in-game line into All Chat as the gateway brings one (POST {name, pid, channel, text}), for the htmlui checks
      const b = (await request.json().catch(() => ({}))) as { name?: string; pid?: number; channel?: number; text?: string };
      const out = await new Promise<unknown>((res) => this.srv.world.run(() => res(relayIn(this.srv.game, { name: String(b.name ?? "[Discord]"), pid: Number(b.pid ?? 0), channel: Number(b.channel ?? 0), text: String(b.text ?? "Tester: hello from Discord") }))));
      return Response.json(out);
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
        this.discord();
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
    this.srv.game.discord?.wake();   // someone to read #in-game: the Discord gateway comes up
    (ws as unknown as { binaryType: string }).binaryType = "arraybuffer"; // newer compat dates default to Blob
    const id = `ws${this.nextPeer++}`;
    const world = this.srv.world;
    // x-de-user: the DE account's user id, set by the Worker after checking the session (null only on the parity bridge)
    // ?sid= (32 hex, the client's tunnel id) and &resume=1 after a drop: world.ts holds and hands over its sockets
    const sid = /^[0-9a-f]{32}$/.test(url.searchParams.get("sid") ?? "") ? url.searchParams.get("sid") : null;
    // x-de-ipb / x-de-user-created (auth/binding.ts, always the Worker's): the keyed IP-bucket tag and the user's age, for graduation
    const made = Number(request.headers.get(CREATED_HEADER) ?? NaN);
    world.openPeer(id, request.headers.get("x-de-user"), (s) => { try { ws.send(s); } catch { /* closing */ } },
      (b) => { try { ws.send(b); return true; } catch { return false; } }, sid, url.searchParams.get("resume") === "1",
      { ipb: request.headers.get(IPB_HEADER), userCreated: Number.isFinite(made) && made > 0 ? made : null });
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
