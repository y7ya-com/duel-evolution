// Auth rules, against a real (miniflare) D1 with the generated migrations applied. Discord's OAuth endpoints are mocked.
import { readdirSync, readFileSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { getPlatformProxy } from "wrangler";
import type { AuthEnv } from "../src/auth/env.ts";
import { authApp } from "../src/auth/routes.ts";
import { canUseAccount, gateUpgrade, USER_HEADER } from "../src/auth/binding.ts";
import { makeAuth, SIGNIN_LOCK_AFTER } from "../src/auth/auth.ts";
import { nameProblem } from "../src/auth/names.ts";

const ORIGIN = "https://de.test";
const TEST_SECRET = "t".repeat(40);
const FWD_SECRET = "f".repeat(40);
let discordN = 300000000000000000n;
const nextDiscordId = () => String(++discordN);
const PW = "correct horse battery";
let proxy: Awaited<ReturnType<typeof getPlatformProxy<{ DB: D1Database }>>>;
let env: AuthEnv;
let ipN = 0;
const freshIp = () => `203.0.113.${++ipN}`;
/** What the mocked Discord /users/@me answers next. */
let discordProfile = { id: "100000000000000001", username: "someone", global_name: null, avatar: null, discriminator: "0" };

beforeAll(async () => {
  proxy = await getPlatformProxy<{ DB: D1Database }>({ configPath: "test/auth.wrangler.jsonc", persist: false });
  const DB = proxy.env.DB;
  for (const f of readdirSync("migrations").filter((f) => f.endsWith(".sql")).sort()) {
    const stmts = readFileSync(`migrations/${f}`, "utf8").split("--> statement-breakpoint").map((s) => s.trim()).filter(Boolean);
    await DB.batch(stmts.map((s) => DB.prepare(s)));
  }
  env = {
    DB, PUBLIC_ORIGIN: ORIGIN, BETTER_AUTH_SECRET: "test-secret-0123456789abcdef0123456789",
    DISCORD_CLIENT_ID: "cid", DISCORD_CLIENT_SECRET: "csecret", DE_FORWARD_SECRET: FWD_SECRET, DISCORD_INVITE_URL: "https://discord.gg/test",
    WORLD: fakeWorld(DB),
  };
  const realFetch = globalThis.fetch;
  vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    if (url.startsWith("https://discord.com/api/oauth2/token")) return Response.json({ access_token: "at", token_type: "Bearer", expires_in: 3600, scope: "identify" });
    if (/^https:\/\/discord\.com\/api\/users\/(@|%40)me/.test(url)) return Response.json(discordProfile);
    return realFetch(input, init);
  });
}, 60_000);

/** The WorldDO's admin "claim" action as agreed with the game side, over the D1 accounts table. */
const doCalls: { acct: string; userId: string; admin: string | null }[] = [];
function fakeWorld(DB: D1Database): DurableObjectNamespace {
  const stub = {
    async fetch(url: string, init: RequestInit) {
      expect(new URL(url).pathname).toBe("/__admin/claim");
      const { acct, userId } = JSON.parse(String(init.body)) as { acct: string; userId: string };
      doCalls.push({ acct, userId, admin: new Headers(init.headers).get("x-de-admin") });
      const a = await DB.prepare("SELECT user_id FROM accounts WHERE acct = ?").bind(acct).first<{ user_id: string | null }>();
      let out = "ok";
      if (!a) out = "no_account";
      else if (a.user_id) out = a.user_id === userId ? "ok" : "taken";
      else if (await DB.prepare("SELECT 1 FROM accounts WHERE user_id = ?").bind(userId).first()) out = "has_account";
      else await DB.prepare("UPDATE accounts SET user_id = ? WHERE acct = ?").bind(userId, acct).run();
      return Response.json({ result: out });
    },
  };
  return { idFromName: () => ({}), get: () => stub } as unknown as DurableObjectNamespace;
}
const legacy = (acct: string, userId: string | null = null) =>
  env.DB.prepare("INSERT INTO accounts (acct, user_id, is_owner) VALUES (?, ?, 0)").bind(acct, userId).run();

afterAll(async () => { vi.restoreAllMocks(); await proxy?.dispose(); });

interface Call { body?: unknown; cookie?: string; ip?: string; method?: string; origin?: string | null; headers?: Record<string, string>; env?: AuthEnv }
function call(path: string, o: Call = {}) {
  const h = new Headers({ "cf-connecting-ip": o.ip ?? "198.51.100.1" });
  if (o.origin !== null) h.set("origin", o.origin ?? ORIGIN);
  if (o.body !== undefined) h.set("content-type", "application/json");
  if (o.cookie) h.set("cookie", o.cookie);
  for (const [k, v] of Object.entries(o.headers ?? {})) h.set(k, v);
  return authApp.fetch(new Request(ORIGIN + path, {
    method: o.method ?? (o.body === undefined ? "GET" : "POST"), headers: h, body: o.body === undefined ? undefined : JSON.stringify(o.body),
  }), o.env ?? env);
}
/** Node's Headers (workers-types lacks getSetCookie). */
const setCookies = (r: Response) => (r.headers as unknown as { getSetCookie(): string[] }).getSetCookie();
const cookieOf = (r: Response) => setCookies(r).map((c) => c.split(";")[0]).join("; ");
const db = () => env.DB;
const idOf = async (name: string) => (await db().prepare("SELECT id FROM user WHERE username = ?").bind(name.toLowerCase()).first<{ id: string }>())!.id;

/** A name + password user, made server-side (there's no HTTP sign-up: accounts come from Discord). */
const signUp = (username: string, password = PW, extra: Record<string, unknown> = {}) =>
  makeAuth(env).api.signUpEmail({ body: { username, password, name: "x", email: "x@x.invalid", ...extra }, asResponse: true })
    .catch((e: { statusCode?: number }) => new Response(null, { status: e.statusCode ?? 500 }));
const signIn = (username: string, password = PW, ip = freshIp()) =>
  call("/api/auth/sign-in/username", { body: { username, password }, ip });
async function hmacHex(secret: string, body: string) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return Buffer.from(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(body))).toString("hex");
}
/** What the shared bot's interactions endpoint sends for /verify and /reset. */
async function forward(body: Record<string, unknown>, o: { secret?: string; ts?: number; e?: AuthEnv } = {}) {
  const raw = JSON.stringify({ ts: o.ts ?? Date.now(), ...body });
  const r = await authApp.fetch(new Request(`${ORIGIN}/api/de/discord-forward`, { method: "POST", body: raw,
    headers: { "content-type": "application/json", "x-de-signature": await hmacHex(o.secret ?? FWD_SECRET, raw) } }), o.e ?? env);
  return { status: r.status, json: await r.json().catch(() => null) as { ok: boolean; message: string; grantVerified?: boolean } | null };
}
const register = (username: string, password = PW) => call("/api/de/register", { body: { username, password }, ip: freshIp() });
/** A name + password user, registered in-game and verified with /verify in Discord: session cookie, id, Discord id. */
async function user(name: string) {
  const reg = await register(name);
  expect(reg.status).toBe(200);
  const { code } = await reg.json() as { code: string };
  const discordId = nextDiscordId();
  expect((await forward({ action: "verify", code, discord: { id: discordId, username: `d${name}` } })).json?.ok).toBe(true);
  const r = await signIn(name);
  expect(r.status).toBe(200);
  return { cookie: cookieOf(r), id: await idOf(name), discordId, setCookie: setCookies(r) };
}
/** The Discord round trip: sign-in/social (or link-social), then the callback with the mocked token and profile. */
async function viaDiscord(profileId: string, o: { cookie?: string; link?: boolean } = {}) {
  discordProfile = { ...discordProfile, id: profileId, username: `discord${profileId.slice(-4)}` };
  const start = o.link
    ? await call("/api/auth/link-social", { body: { provider: "discord", callbackURL: "/" }, cookie: o.cookie })
    : await call("/api/auth/sign-in/discord?return=/", { cookie: o.cookie });
  expect(start.status).toBe(o.link ? 200 : 302);
  const url = o.link ? (await start.json() as { url: string }).url : start.headers.get("location")!;
  const auth = new URL(url);
  expect(auth.origin + auth.pathname).toBe("https://discord.com/api/oauth2/authorize");
  expect(auth.searchParams.get("scope")).toBe("identify");
  expect(auth.searchParams.get("redirect_uri")).toBe(`${ORIGIN}/api/auth/callback/discord`); // the one registered URI, also on staging
  const jar = [o.cookie, cookieOf(start)].filter(Boolean).join("; ");
  const cb = await call(`/api/auth/callback/discord?code=c0de&state=${auth.searchParams.get("state")}`, { cookie: jar });
  expect(cb.status).toBe(302);
  return { res: cb, cookie: cookieOf(cb).includes("session_token") ? cookieOf(cb) : o.cookie ?? "" };
}
const ws = (o: { cookie?: string; origin?: string | null; host?: string; forged?: string } = {}) => {
  const h = new Headers({ Upgrade: "websocket" });
  if (o.origin !== null) h.set("Origin", o.origin ?? ORIGIN);
  if (o.cookie) h.set("cookie", o.cookie);
  if (o.forged) h.set(USER_HEADER, o.forged);
  return new Request(`${o.host ?? ORIGIN}/boxedwine-network`, { headers: h });
};

describe("name + password", () => {
  it("sign-in gives a __Secure-, HttpOnly, Secure, SameSite=Lax session cookie", async () => {
    await user("CookieDuelist");
    const s = setCookies(await signIn("CookieDuelist")).find((c) => c.startsWith("__Secure-de.session_token="))!;
    expect(s).toBeDefined();
    expect(s).toMatch(/; HttpOnly/i);
    expect(s).toMatch(/; Secure/i);
    expect(s).toMatch(/; SameSite=Lax/i);
    expect(s).toMatch(/; Path=\//i);
  });

  it("never stores a client-sent email or name", async () => {
    await signUp("Sneaky", PW, { email: "victim@example.com", name: "admin" });
    const row = await db().prepare("SELECT email, name, display_username FROM user WHERE username = 'sneaky'").first<{ email: string; name: string; display_username: string }>();
    expect(row!.email).toMatch(/@users\.duel-evolution\.invalid$/);
    expect(row!.name).toBe("Sneaky");
    expect(row!.display_username).toBe("Sneaky");
  });

  it("there's no HTTP sign-up", async () => {
    expect((await call("/api/auth/sign-up/email", { body: { username: "Walkin", password: PW }, ip: freshIp() })).status).toBe(404);
  });

  it("names are unique case-insensitively and follow the rules", async () => {
    await user("Kaiba");
    expect((await signUp("kAIBA")).status).toBe(400);
    expect((await signUp("ab")).status).toBeGreaterThanOrEqual(400);
    expect((await signUp("Admin_Bob")).status).toBeGreaterThanOrEqual(400);
    expect(await db().prepare("SELECT count(*) AS n FROM user WHERE username IN ('ab', 'admin_bob')").first("n")).toBe(0);
  });

  it("sign-in: unknown name and wrong password say the same, and create nothing", async () => {
    await user("Known");
    const unknown = await signIn("Nobody");
    const wrong = await signIn("Known", "wrong password!!");
    expect(unknown.status).toBe(401);
    expect(wrong.status).toBe(401);
    expect((await unknown.json() as { message: string }).message).toBe((await wrong.json() as { message: string }).message);
    expect(await db().prepare("SELECT count(*) AS n FROM user WHERE username = 'nobody'").first("n")).toBe(0);
    expect((await signIn("KNOWN")).status).toBe(200);
  });

  it("each sign-in gets a new token; sign-out revokes it at once", async () => {
    const a = await user("Rotate");
    const b = cookieOf(await signIn("Rotate"));
    expect(b).not.toBe(a.cookie);
    expect((await call("/api/auth/sign-out", { body: {}, cookie: a.cookie })).status).toBe(200);
    expect(await gateUpgrade(ws({ cookie: a.cookie }), env)).toHaveProperty("status", 401);
    expect(await gateUpgrade(ws({ cookie: b }), env)).toBeInstanceOf(Request);
  });

  it("no email paths exist", async () => {
    for (const p of ["/api/auth/sign-in/email", "/api/auth/request-password-reset", "/api/auth/reset-password", "/api/auth/send-verification-email"]) {
      expect((await call(p, { body: { email: "x@y.z", password: PW, newPassword: PW, token: "t" }, ip: freshIp() })).status, p).toBe(404);
    }
  });
});

describe("lockout per name", () => {
  it(`a name locks after ${SIGNIN_LOCK_AFTER} failures (any IP), until the window passes`, async () => {
    await user("Guess");
    for (let i = 0; i < SIGNIN_LOCK_AFTER; i++) expect((await signIn("Guess", "nope nope nope")).status).toBe(401);
    const locked = await signIn("Guess"); // even the right password
    expect(locked.status).toBe(429);
    expect(await locked.json()).toMatchObject({ code: "LOCKED" });
    await db().prepare("UPDATE signin_failure SET first_at = ?").bind(Date.now() - 16 * 60_000).run();
    expect((await signIn("Guess")).status).toBe(200);
  });
});

describe("rate limiting", () => {
  it("password sign-in is limited per IP, counted in D1", async () => {
    const ip = freshIp();
    const codes: number[] = [];
    for (let i = 0; i < 6; i++) codes.push((await signIn(`Spray${i}`, "whatever pass", ip)).status);
    expect(codes.slice(0, 5).every((c) => c === 401)).toBe(true);
    expect(codes[5]).toBe(429);
    expect(await db().prepare("SELECT count(*) AS n FROM rate_limit WHERE key LIKE ?").bind(`%${ip}%`).first("n")).toBeGreaterThan(0);
  });
});

describe("Discord", () => {
  it("GET sign-in/discord: first sign-in creates a user keyed by the Discord id, then back to the game with online=1", async () => {
    const { cookie, res } = await viaDiscord("200000000000000001");
    expect(res.headers.get("location")).toBe("/?online=1");
    const acc = await db().prepare("SELECT user_id FROM account WHERE provider_id = 'discord' AND account_id = '200000000000000001'").first<{ user_id: string }>();
    const u = await db().prepare("SELECT username, email FROM user WHERE id = ?").bind(acc!.user_id).first<{ username: string | null; email: string }>();
    expect(u!.username).toBeNull(); // no name from Discord; the game's Create Player step names characters
    expect(u!.email).toBe("discord-200000000000000001@users.duel-evolution.invalid");
    expect(await (await call("/api/de/session", { cookie })).json()).toMatchObject({ signedIn: true, userId: acc!.user_id, discord: true, password: false, roles: [] });
    expect(await gateUpgrade(ws({ cookie }), env)).toBeInstanceOf(Request);
  });

  it("return must be a same-site path", async () => {
    for (const bad of ["https://evil.test/", "//evil.test/", "/x?y=1", "javascript:alert(1)"]) {
      const r = await call(`/api/auth/sign-in/discord?return=${encodeURIComponent(bad)}`);
      const state = new URL(r.headers.get("location")!).searchParams.get("state");
      expect(state, bad).toBeTruthy();
      const cb = await call(`/api/auth/callback/discord?code=c&state=${state}`, { cookie: cookieOf(r) });
      expect(cb.headers.get("location"), bad).toBe("/?online=1");
    }
  });

  it("session says signed out without a cookie", async () => {
    expect(await (await call("/api/de/session")).json()).toEqual({ signedIn: false });
  });

  it("the same Discord account signs back into the same user", async () => {
    await viaDiscord("200000000000000002");
    const again = await viaDiscord("200000000000000002");
    expect(await db().prepare("SELECT count(*) AS n FROM account WHERE account_id = '200000000000000002'").first("n")).toBe(1);
    expect(await gateUpgrade(ws({ cookie: again.cookie }), env)).toBeInstanceOf(Request);
  });

  it("a verified password account signs in with its Discord too: same user", async () => {
    const u = await user("Linker");
    expect(await (await call("/api/de/session", { cookie: u.cookie })).json()).toMatchObject({ name: "Linker", discord: true, password: true });
    const d = await viaDiscord(u.discordId);
    expect((await gateUpgrade(ws({ cookie: d.cookie }), env) as Request).headers.get(USER_HEADER)).toBe(u.id);
  });

  it("a Discord account adds a name + password (fresh session only) for the game's login dialog", async () => {
    const { cookie } = await viaDiscord("200000000000000004");
    expect((await call("/api/de/password", { body: { newPassword: "new password 123" }, cookie })).status).toBe(400); // needs a name
    await user("Taken2");
    expect((await call("/api/de/password", { body: { newPassword: "new password 123", username: "taken2" }, cookie })).status).toBe(409);
    expect((await call("/api/de/password", { body: { newPassword: "new password 123", username: "Joey" }, cookie })).status).toBe(200);
    expect((await signIn("Joey", "new password 123")).status).toBe(200);
    const id = await idOf("Joey");
    await db().prepare("UPDATE session SET created_at = ? WHERE user_id = ?").bind(Date.now() - 11 * 60_000, id).run();
    expect((await call("/api/de/password", { body: { newPassword: "another pass 1" }, cookie })).status).toBe(403);
  });
});

describe("in-game sign-up, verified through Discord (the shared bot forwards /verify and /reset)", () => {
  it("register answers a code + invite; sign-in says EMAIL_NOT_VERIFIED until /verify", async () => {
    const reg = await register("Fresh");
    expect(reg.status).toBe(200);
    const body = await reg.json() as { code: string; inviteUrl: string };
    expect(body.code).toMatch(/^[A-HJ-NP-Z2-9]{6}$/);
    expect(body.inviteUrl).toBe("https://discord.gg/test");
    const r = await signIn("Fresh");
    expect(r.status).toBe(403);
    expect(await r.json()).toMatchObject({ code: "EMAIL_NOT_VERIFIED" });
    expect(cookieOf(r)).not.toContain("session_token=");
    expect(await db().prepare("SELECT count(*) AS n FROM verification WHERE identifier LIKE ?").bind(`%${body.code}%`).first("n")).toBe(0); // hashed
    const v = await forward({ action: "verify", code: body.code.toLowerCase(), discord: { id: nextDiscordId(), username: "fresh_d" } });
    expect(v.json).toMatchObject({ ok: true, grantVerified: true });
    expect(v.json!.message).toContain("fresh_d");
    expect((await signIn("Fresh")).status).toBe(200);
    expect((await forward({ action: "verify", code: body.code, discord: { id: nextDiscordId(), username: "x" } })).json?.ok).toBe(false); // used up
  });

  it("re-register: the unverified name's own password reissues the code; anyone else gets 409", async () => {
    await register("Lost");
    expect((await register("Lost", "someone elses pw")).status).toBe(409);
    const again = await register("Lost");
    expect(again.status).toBe(200);
    await user("Done1");
    expect((await register("Done1")).status).toBe(409); // verified: taken
  });

  it("one Discord account per game account", async () => {
    const a = await user("OwnerA");
    const reg = await register("OwnerB");
    const { code } = await reg.json() as { code: string };
    const v = await forward({ action: "verify", code, discord: { id: a.discordId, username: "a" } });
    expect(v.json).toMatchObject({ ok: true, grantVerified: false });
    expect((await signIn("OwnerB")).status).toBe(403); // still unverified
  });

  it("the forward endpoint checks the HMAC and the timestamp, and is off without a secret", async () => {
    const reg = await register("Signed");
    const { code } = await reg.json() as { code: string };
    expect((await forward({ action: "verify", code, discord: { id: nextDiscordId(), username: "s" } }, { secret: "g".repeat(40) })).status).toBe(401);
    expect((await forward({ action: "verify", code, discord: { id: nextDiscordId(), username: "s" } }, { ts: Date.now() - 61_000 })).status).toBe(400);
    expect((await forward({ action: "verify", code, discord: { id: nextDiscordId(), username: "s" } }, { e: { ...env, DE_FORWARD_SECRET: undefined } })).status).toBe(404);
    expect((await signIn("Signed")).status).toBe(403);
  });

  it("/reset in Discord → code → in-game reset: new password, old sessions gone, signed in", async () => {
    const u = await user("Forgetful");
    const fw = await forward({ action: "reset", discord: { id: u.discordId, username: "f" } });
    expect(fw.json?.ok).toBe(true);
    const code = fw.json!.message.match(/\*\*([A-Z2-9]{6})\*\*/)![1];
    expect((await call("/api/de/reset", { body: { code, newPassword: "short" }, ip: freshIp() })).status).toBe(400);
    const r = await call("/api/de/reset", { body: { code, newPassword: "brand new password" }, ip: freshIp() });
    expect(r.status).toBe(200);
    expect(cookieOf(r)).toContain("__Secure-de.session_token=");
    expect(await gateUpgrade(ws({ cookie: u.cookie }), env)).toHaveProperty("status", 401);
    expect((await signIn("Forgetful", "brand new password")).status).toBe(200);
    expect((await call("/api/de/reset", { body: { code, newPassword: "another new password" }, ip: freshIp() })).status).toBe(400); // used up
  });

  it("/reset for a Discord with no password account is ok:false (the bot says so)", async () => {
    const d = await viaDiscord("200000000000000099");
    expect(d.cookie).toContain("session_token");
    expect((await forward({ action: "reset", discord: { id: "200000000000000099", username: "x" } })).json?.ok).toBe(false);
    expect((await forward({ action: "reset", discord: { id: nextDiscordId(), username: "x" } })).json?.ok).toBe(false);
  });
});

describe("staging-only test sign-in", () => {
  const staging = () => ({ ...env, DEPLOY_ENV: "staging", TEST_SIGNIN_SECRET: TEST_SECRET });
  const testIn = (path: string, e: AuthEnv, secret = TEST_SECRET, name = "TestBot1") =>
    call(path, { body: { name }, headers: { "x-test-signin": secret }, env: e, ip: freshIp() });

  it("on staging, signs in (creating on first use) a Test* user with a session cookie", async () => {
    const a = await testIn("/api/de/test-sign-in", staging());
    expect(a.status).toBe(200);
    expect(cookieOf(a)).toContain("__Secure-de.session_token=");
    const b = await testIn("/api/de/test-sign-in", staging());
    expect(b.status).toBe(200);
    expect(await db().prepare("SELECT count(*) AS n FROM user WHERE username = 'testbot1'").first("n")).toBe(1);
    expect(await gateUpgrade(ws({ cookie: cookieOf(b) }), staging())).toBeInstanceOf(Request);
    expect((await testIn("/api/de/test-sign-in", staging(), TEST_SECRET, "Kaiba")).status).toBe(400); // Test* names only
  });

  it("is a 404 in production, with no DEPLOY_ENV, with a wrong or short secret", async () => {
    expect((await testIn("/api/de/test-sign-in", { ...staging(), DEPLOY_ENV: "production" })).status).toBe(404);
    expect((await testIn("/api/de/test-sign-in", { ...staging(), DEPLOY_ENV: undefined })).status).toBe(404);
    expect((await testIn("/api/de/test-sign-in", staging(), TEST_SECRET, "TestRoot")).status).toBe(200); // staging at a host root
    expect((await testIn("/api/de/test-sign-in", staging(), "t".repeat(39))).status).toBe(404);
    expect((await testIn("/api/de/test-sign-in", { ...staging(), TEST_SIGNIN_SECRET: "short" }, "short")).status).toBe(404);
  });

  it("production's wrangler config can't turn it on", () => {
    const cfg = readFileSync("wrangler.jsonc", "utf8");
    const prod = cfg.slice(cfg.indexOf('"production"'));
    expect(prod).toMatch(/"DEPLOY_ENV":\s*"production"/);
    expect(prod).not.toMatch(/TEST_SIGNIN_SECRET/);
  });
});

describe("sign-in names", () => {
  it("rules: shape, reserved words, profanity", () => {
    for (const ok of ["Yugi", "Seto_Kaiba", "joey-w", "Abc", "Duelist123456789", "Peacock", "Document"]) expect(nameProblem(ok), ok).toBeNull();
    for (const bad of ["ab", "1yugi", "_yugi", "yu gi", "yügi", "a".repeat(17), "admin", "Admin2", "GM", "m0d", "moderator_x", "Staff", "f4ggot", "sh1t_head"]) {
      expect(nameProblem(bad), bad).not.toBeNull();
    }
  });

  it("can't be changed through /update-user", async () => {
    const u = await user("Mai");
    expect((await call("/api/auth/update-user", { body: { username: "Valon" }, cookie: u.cookie })).status).toBe(400);
    expect(await db().prepare("SELECT display_username FROM user WHERE id = ?").bind(u.id).first("display_username")).toBe("Mai");
  });
});

describe("game WebSocket upgrade", () => {
  it("needs a session", async () => {
    expect(await gateUpgrade(ws(), env)).toHaveProperty("status", 401);
    expect(await gateUpgrade(ws({ cookie: "__Secure-de.session_token=forged.sig" }), env)).toHaveProperty("status", 401);
  });

  it("rejects a bad or missing Origin, even with a session", async () => {
    const u = await user("OriginTest");
    expect(await gateUpgrade(ws({ cookie: u.cookie, origin: "https://evil.test" }), env)).toHaveProperty("status", 403);
    expect(await gateUpgrade(ws({ cookie: u.cookie, origin: "https://de.test.evil.test" }), env)).toHaveProperty("status", 403);
    expect(await gateUpgrade(ws({ cookie: u.cookie, origin: null }), env)).toHaveProperty("status", 403);
  });

  it("forwards the session's user id, never the client's", async () => {
    const u = await user("WsUser");
    const fwd = await gateUpgrade(ws({ cookie: u.cookie, forged: "someone-else" }), env);
    expect(fwd).toBeInstanceOf(Request);
    expect((fwd as Request).headers.get(USER_HEADER)).toBe(u.id);
  });

  it("parity bypass only for DEV, localhost, no Origin", async () => {
    const dev = { ...env, DEV: "1" };
    const bridge = await gateUpgrade(ws({ origin: null, host: "http://localhost:8787", forged: "x" }), dev);
    expect(bridge).toBeInstanceOf(Request);
    expect((bridge as Request).headers.get(USER_HEADER)).toBeNull();
    expect(await gateUpgrade(ws({ origin: null, host: "http://localhost:8787" }), env)).toHaveProperty("status", 403);
    expect(await gateUpgrade(ws({ origin: "http://localhost:8787", host: "http://localhost:8787" }), dev)).toHaveProperty("status", 403);
  });
});

describe("0x3003 is only 'which account'", () => {
  it("a replayed or forged 0x3003 for someone else's account is refused", () => {
    expect(canUseAccount("user-b", "user-a")).toBe("refuse"); // A's captured 0x3003 replayed on B's socket
    expect(canUseAccount("user-a", "user-a")).toBe("ok");
    expect(canUseAccount("user-a", null)).toBe("refuse"); // unclaimed legacy account: claim it first
    expect(canUseAccount("user-a", undefined)).toBe("create");
  });
});

describe("roles and legacy claims", () => {
  const issue = (cookie: string, accountKey: string) => call("/api/de/admin/legacy-claims", { body: { accountKey }, cookie });
  const claim = (cookie: string, code: string) => call("/api/de/claim", { body: { code }, cookie });
  const admin = async (name: string) => {
    const a = await user(name);
    await db().prepare("INSERT INTO role_grant (user_id, role) VALUES (?, 'admin')").bind(a.id).run();
    return a;
  };

  it("admin comes from role_grant only, never the name", async () => {
    await legacy("acct1");
    const fake = await user("TheAdmn"); // reads like staff, passes the name rules
    expect((await issue(fake.cookie, "acct1")).status).toBe(403);
    const real = await user("Kemo");
    await db().prepare("INSERT INTO role_grant (user_id, role) VALUES (?, 'moderator')").bind(real.id).run();
    expect((await issue(real.cookie, "acct1")).status).toBe(403);
    await db().prepare("INSERT INTO role_grant (user_id, role) VALUES (?, 'admin')").bind(real.id).run();
    expect((await issue(real.cookie, "acct1")).status).toBe(200);
    expect(await (await call("/api/de/session", { cookie: real.cookie })).json()).toMatchObject({ roles: expect.arrayContaining(["admin", "moderator"]) });
  });

  it("a claim code works once, for one account, and is stored hashed", async () => {
    const a = await admin("Issuer");
    expect((await issue(a.cookie, "nosuch")).status).toBe(404);
    await legacy("legacy42");
    const { code } = await (await issue(a.cookie, "legacy42")).json() as { code: string };
    expect(await db().prepare("SELECT count(*) AS n FROM legacy_claim WHERE code_hash = ?").bind(code).first("n")).toBe(0);
    const owner = await user("Owner2008");
    const thief = await user("Thief");
    expect((await claim(thief.cookie, "AAAA-AAAA-AAAA-AAAA-AAAA-AAAA")).status).toBe(400);
    const ok = await claim(owner.cookie, code.toLowerCase());
    expect(ok.status).toBe(200);
    expect(await ok.json()).toEqual({ accountKey: "legacy42" });
    expect(doCalls.at(-1)).toEqual({ acct: "legacy42", userId: owner.id, admin: `claim:${owner.id}` });
    expect(await db().prepare("SELECT user_id FROM accounts WHERE acct = 'legacy42'").first("user_id")).toBe(owner.id);
    expect((await claim(thief.cookie, code)).status).toBe(400);
    expect((await issue(a.cookie, "legacy42")).status).toBe(409); // owned: no reissue
  });

  it("an expired code is refused; claiming needs a session and our Origin", async () => {
    const a = await admin("Issuer2");
    await legacy("legacy43");
    const { code } = await (await issue(a.cookie, "legacy43")).json() as { code: string };
    const u = await user("Late");
    expect((await call("/api/de/claim", { body: { code } })).status).toBe(401);
    expect((await call("/api/de/claim", { body: { code }, cookie: u.cookie, origin: "https://evil.test" })).status).toBe(403);
    await db().prepare("UPDATE legacy_claim SET expires_at = ? WHERE account_key = 'legacy43'").bind(Date.now() - 1).run();
    expect((await claim(u.cookie, code)).status).toBe(400);
  });

  it("refused while the user owns a game account with characters; the code stays usable", async () => {
    const a = await admin("Issuer3");
    await legacy("legacy44");
    const { code } = await (await issue(a.cookie, "legacy44")).json() as { code: string };
    const u = await user("Busy");
    await legacy(`u:${u.id}`, u.id); // the game side answers has_account only when that account has characters
    expect((await claim(u.cookie, code)).status).toBe(409);
    expect(await db().prepare("SELECT claimed_by FROM legacy_claim WHERE account_key = 'legacy44'").first("claimed_by")).toBeNull();
    await db().prepare("DELETE FROM accounts WHERE acct = ?").bind(`u:${u.id}`).run();
    expect((await claim(u.cookie, code)).status).toBe(200);
  });
});

describe("no pages", () => {
  it("/account is gone; only the API is served", async () => {
    for (const p of ["/account", "/account/sign-up"]) expect((await call(p)).status, p).toBe(404);
  });
});
