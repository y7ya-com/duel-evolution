// The bot's interactions endpoint (discord/interactions.ts), against a real (miniflare) D1: Discord's Ed25519 signature,
// /verify (code -> linked Discord, both roles), /reset, and a #duels Accept's one-time sign-in link (auth.ts duelLink).
import { readdirSync, readFileSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { getPlatformProxy } from "wrangler";
import type { AuthEnv } from "../src/auth/env.ts";
import { authApp } from "../src/auth/routes.ts";
import { verifySession } from "../src/auth/auth.ts";
import { handleInteraction } from "../src/discord/interactions.ts";
import { verifyInteraction } from "../src/discord/rest.ts";

const ORIGIN = "https://de.test";
const PW = "correct horse battery";
let proxy: Awaited<ReturnType<typeof getPlatformProxy<{ DB: D1Database }>>>;
let env: Parameters<typeof handleInteraction>[1];
let keys: CryptoKeyPair;
let ipN = 0;
/** What the fake WorldDO says of a duel: open (its owner's user id), or gone. */
const duels = new Map<number, { name: string; owner: string }>();
const roleGrants: string[] = [];
let discordN = 400000000000000000n;
const nextDiscordId = () => String(++discordN);

beforeAll(async () => {
  proxy = await getPlatformProxy<{ DB: D1Database }>({ configPath: "test/auth.wrangler.jsonc", persist: false });
  const DB = proxy.env.DB;
  for (const f of readdirSync("migrations").filter((f) => f.endsWith(".sql")).sort()) {
    const stmts = readFileSync(`migrations/${f}`, "utf8").split("--> statement-breakpoint").map((s) => s.trim()).filter(Boolean);
    await DB.batch(stmts.map((s) => DB.prepare(s)));
  }
  keys = await crypto.subtle.generateKey({ name: "Ed25519" }, true, ["sign", "verify"]) as CryptoKeyPair;
  const pub = Buffer.from(await crypto.subtle.exportKey("raw", keys.publicKey) as ArrayBuffer).toString("hex");
  const world = { async fetch(url: string) {
    const u = new URL(url);
    expect(u.pathname).toBe("/__de/discord/duel");
    const d = duels.get(Number(u.searchParams.get("id")));
    return Response.json({ duel: d ? { id: Number(u.searchParams.get("id")), name: d.name } : null, self: !!d && d.owner === u.searchParams.get("user") });
  } };
  env = { DB, PUBLIC_ORIGIN: ORIGIN, BETTER_AUTH_SECRET: "x".repeat(40), DISCORD_PUBLIC_KEY: pub,
    DISCORD_BOT_TOKEN: "bot", DISCORD_GUILD_ID: "g1", DISCORD_VERIFIED_ROLE_ID: "rv", DISCORD_PASSWORD_ROLE_ID: "rp",
    WORLD: { idFromName: () => ({}), get: () => world } as unknown as DurableObjectNamespace } as Parameters<typeof handleInteraction>[1];
  const realFetch = globalThis.fetch;
  vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
    const url = String(input instanceof Request ? input.url : input);
    const m = /\/guilds\/g1\/members\/(\d+)\/roles\/(\w+)$/.exec(url);
    if (m && init?.method === "PUT") { roleGrants.push(`${m[1]}:${m[2]}`); return new Response(null, { status: 204 }); }
    return realFetch(input, init);
  });
}, 60_000);
afterAll(async () => { vi.restoreAllMocks(); await proxy?.dispose(); });

/** An interaction as Discord sends it: signed (or signed with a wrong key). */
async function interact(body: Record<string, unknown>, o: { badKey?: boolean } = {}) {
  const raw = JSON.stringify(body), ts = String(Math.floor(Date.now() / 1000));
  const key = o.badKey ? (await crypto.subtle.generateKey({ name: "Ed25519" }, true, ["sign", "verify"]) as CryptoKeyPair).privateKey : keys.privateKey;
  const sig = Buffer.from(await crypto.subtle.sign({ name: "Ed25519" }, key, new TextEncoder().encode(ts + raw))).toString("hex");
  const r = await handleInteraction(new Request(`${ORIGIN}/api/discord/interactions`, { method: "POST", body: raw,
    headers: { "x-signature-ed25519": sig, "x-signature-timestamp": ts } }), env);
  return { status: r.status, json: await r.json().catch(() => null) as any };
}
const member = (id: string, username = "duelist") => ({ member: { user: { id, username } } });
const call = (path: string, init: RequestInit & { ip?: string } = {}) => {
  const h = new Headers(init.headers);
  h.set("cf-connecting-ip", init.ip ?? `198.51.100.${++ipN}`);
  if (init.body) { h.set("origin", ORIGIN); h.set("content-type", "application/json"); }
  return authApp.fetch(new Request(ORIGIN + path, { ...init, headers: h }), env);
};
/** A name + password player registered in-game: its verify code. */
async function register(name: string) {
  const r = await call("/api/de/register", { method: "POST", body: JSON.stringify({ username: name, password: PW }) });
  expect(r.status).toBe(200);
  return (await r.json() as { code: string }).code;
}
const idOf = async (name: string) => (await env.DB.prepare("SELECT id FROM user WHERE username = ?").bind(name.toLowerCase()).first<{ id: string }>())!.id;

describe("the bot's interactions endpoint", () => {
  it("refuses a bad signature with 401 and answers Discord's ping", async () => {
    expect((await interact({ type: 1 }, { badKey: true })).status).toBe(401);
    expect((await interact({ type: 1 })).json).toEqual({ type: 1 });
    expect(await verifyInteraction("zz", "00", "1", "x")).toBe(false);
  });

  it("/verify links the Discord account and grants Verified + Password User; the button opens the form; /reset gives a code", async () => {
    const code = await register("Verifier");
    const did = nextDiscordId();
    expect((await interact({ type: 3, data: { custom_id: "verify_button" }, ...member(did) })).json.type).toBe(9);
    const v = await interact({ type: 5, data: { custom_id: "verify_modal", components: [{ components: [{ value: code }] }] }, ...member(did, "vd") });
    expect(v.json.data).toMatchObject({ flags: 64 });
    expect(v.json.data.content).toContain("Verified");
    expect(roleGrants).toEqual(expect.arrayContaining([`${did}:rv`, `${did}:rp`]));
    expect((await interact({ type: 2, data: { name: "verify", options: [{ name: "code", value: code }] }, ...member(nextDiscordId()) })).json.data.content)
      .toContain("invalid or expired");   // used up
    const reset = await interact({ type: 2, data: { name: "reset" }, ...member(did) });
    expect(reset.json.data.content).toMatch(/reset code: \*\*[A-Z2-9]{6}\*\*/);
    expect((await interact({ type: 3, data: { custom_id: "reset_button" }, ...member(nextDiscordId()) })).json.data.content).toContain("No Duel Evolution account");
  });

  it("#duels Accept: a linked player gets a private one-time link that signs them in and opens the duel", async () => {
    const code = await register("Joiner");
    const did = nextDiscordId();
    await interact({ type: 2, data: { name: "verify", options: [{ name: "code", value: code }] }, ...member(did) });
    const uid = await idOf("Joiner");
    duels.set(41, { name: "Kaiba", owner: "someone-else" });
    duels.set(42, { name: "Joiner", owner: uid });

    expect((await interact({ type: 3, data: { custom_id: "duel_join:40" }, ...member(did) })).json.data.content).toBe("That duel is no longer open.");
    expect((await interact({ type: 3, data: { custom_id: "duel_join:42" }, ...member(did) })).json.data.content).toContain("your own duel");
    const ok = await interact({ type: 3, data: { custom_id: "duel_join:41" }, ...member(did) });
    expect(ok.json.data.flags).toBe(64);   // only the player sees it
    const button = ok.json.data.components[0].components[0];
    expect(button.style).toBe(5);
    const link = new URL(button.url);
    expect(link.origin + link.pathname).toBe(`${ORIGIN}/api/auth/de/duel-link`);

    const open = await call(link.pathname + link.search);
    expect(open.status).toBe(302);
    expect(open.headers.get("location")).toBe("/?online=1&duel=41");
    const cookie = (open.headers as unknown as { getSetCookie(): string[] }).getSetCookie().map((c) => c.split(";")[0]).join("; ");
    const v = await verifySession(new Request(ORIGIN, { headers: { cookie } }), env as AuthEnv);
    expect(v?.userId).toBe(uid);

    const again = await call(link.pathname + link.search);   // once only
    expect(again.headers.get("location")).toBe("/?online=1");
    expect((again.headers as unknown as { getSetCookie(): string[] }).getSetCookie().join()).not.toContain("session_token=");
  });

  it("#duels Accept from a Discord with no game account: the game's page with the duel, to sign in with Discord there", async () => {
    duels.set(43, { name: "Yugi", owner: "x" });
    const r = await interact({ type: 3, data: { custom_id: "duel_join:43" }, ...member(nextDiscordId()) });
    expect(r.json.data.content).toContain("Sign in with Discord");
    expect(r.json.data.components[0].components[0].url).toBe(`${ORIGIN}/?online=1&duel=43`);
  });
});
