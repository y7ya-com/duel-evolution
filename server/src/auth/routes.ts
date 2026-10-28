// Hono app for accounts: better-auth at /api/auth/*, plus DE's own account API at /api/de/*. No pages: the game boots
// straight to its own title, and its UI drives these endpoints (AUTH.md, "Client contract").
import { Hono, type Context } from "hono";
import { hit, makeAuth, rolesOf, sha256hex, verifySession } from "./auth.ts";
import { issueCode, peekCode, RESET_TTL_MS, takeCode, VERIFY_TTL_MS } from "./codes.ts";
import type { AuthEnv } from "./env.ts";
import { nameProblem } from "./names.ts";

type C = Context<{ Bindings: AuthEnv }>;

export const CLAIM_TTL_MS = 7 * 24 * 3600_000;
const BAD_CODE = "That code isn't valid. Ask an admin for a new one.";

export function authFor(c: C) {
  let waitUntil: ((p: Promise<unknown>) => void) | undefined;
  try { const ec = c.executionCtx; waitUntil = (p) => ec.waitUntil(p); } catch { /* no ExecutionContext (tests): awaited */ }
  return makeAuth(c.env, { waitUntil });
}

/** Cookie-authenticated JSON POSTs: same-origin only (SameSite=Lax already keeps the cookie off cross-site POSTs). */
const sameOrigin = (c: C) => c.req.header("Origin") === c.env.PUBLIC_ORIGIN && !!c.req.header("Content-Type")?.startsWith("application/json");

/** A claim code: 120 random bits as 24 Crockford base32 chars, shown in groups of 4. */
export function newClaimCode(): string {
  const A = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
  const b = crypto.getRandomValues(new Uint8Array(15));
  let bits = 0, n = 0, out = "";
  for (const x of b) { n = (n << 8) | x; bits += 8; while (bits >= 5) { bits -= 5; out += A[(n >> bits) & 31]; } }
  return out.match(/.{4}/g)!.join("-");
}
const normCode = (s: unknown) => String(s ?? "").toUpperCase().replace(/[^0-9A-Z]/g, "").replace(/O/g, "0").replace(/[IL]/g, "1");

/** The signed-in user as /api/de/session shows it. */
export async function me(db: D1Database, userId: string) {
  const u = await db.prepare("SELECT display_username FROM user WHERE id = ?").bind(userId).first<{ display_username: string | null }>();
  const { results } = await db.prepare("SELECT provider_id FROM account WHERE user_id = ?").bind(userId).all<{ provider_id: string }>();
  const p = new Set(results.map((r) => r.provider_id));
  return { userId, name: u?.display_username ?? null, roles: await rolesOf(db, userId), discord: p.has("discord"), password: p.has("credential") };
}

export const authApp = new Hono<{ Bindings: AuthEnv }>();

/**
 * Discord sign-in started by the game: GET ?return=/ → Discord → /api/auth/callback/discord (sets the session
 * cookie) → back to `return` with ?online=1 (or ?online=0&error=… when it didn't finish). `return` is a same-site path.
 */
authApp.get("/api/auth/sign-in/discord", async (c) => {
  if (!c.env.DISCORD_CLIENT_ID || !c.env.DISCORD_CLIENT_SECRET) return c.text("not found", 404);
  const ret = c.req.query("return") ?? "";
  const back = /^\/[\w/.-]*$/.test(ret) && !ret.startsWith("//") ? ret : "/";
  const res = await authFor(c).api.signInSocial({
    body: { provider: "discord", callbackURL: `${back}?online=1`, errorCallbackURL: `${back}?online=0` },
    headers: c.req.raw.headers, asResponse: true,
  });
  const { url } = await res.json<{ url?: string }>();
  if (!res.ok || !url) return c.text("Discord sign-in is unavailable.", 502);
  const out = new Response(null, { status: 302, headers: { Location: url, "Cache-Control": "no-store" } });
  for (const ck of (res.headers as unknown as { getSetCookie(): string[] }).getSetCookie()) out.headers.append("Set-Cookie", ck);
  return out;
});

authApp.on(["GET", "POST"], "/api/auth/*", (c) => authFor(c).handler(c.req.raw));

/** Is this browser signed in: for the game's own UI before it goes online. */
authApp.get("/api/de/session", async (c) => {
  c.header("Cache-Control", "no-store");
  const s = await authFor(c).api.getSession({ headers: c.req.raw.headers }).catch(() => null);
  if (!s) return c.json({ signedIn: false });
  return c.json({ signedIn: true, ...(await me(c.env.DB, s.user.id)) });
});

/**
 * Staging only (automation, since Discord can't be clicked headless): POST /api/de/test-sign-in {name} with header
 * x-test-signin = TEST_SIGNIN_SECRET signs in (creating on first use) the throwaway name + password user `name`
 * ("Test" + 1-12 letters/digits), and answers like a password sign-in, session cookie included. A 404 unless
 * DEPLOY_ENV is "staging" and the secret is set (32+ chars) and matches; production's config is checked by a test.
 */
export const TEST_NAME = /^Test[A-Za-z0-9]{1,12}$/;
export async function testSignInAllowed(env: AuthEnv, given: string | undefined): Promise<boolean> {
  const secret = env.TEST_SIGNIN_SECRET;
  if (env.DEPLOY_ENV !== "staging" || !secret || secret.length < 32 || !given) return false;
  return (await sha256hex(given)) === (await sha256hex(secret)); // compares digests, not the secret
}
authApp.post("/api/de/test-sign-in", async (c) => {
  if (!(await testSignInAllowed(c.env, c.req.header("x-test-signin")))) return c.text("not found", 404);
  const { name } = await c.req.json<{ name?: unknown }>().catch(() => ({ name: undefined }));
  if (typeof name !== "string" || !TEST_NAME.test(name)) return c.json({ message: "name: Test + 1-12 letters/digits" }, 400);
  const password = await sha256hex(`${c.env.TEST_SIGNIN_SECRET}:${name}`);
  const auth = authFor(c);
  await auth.api.signUpEmail({ body: { username: name, password, name, email: "set-by-hook@x.invalid" } }).catch(() => null); // exists: fine
  await c.env.DB.prepare("UPDATE user SET email_verified = 1 WHERE username = ?").bind(name.toLowerCase()).run();
  return auth.api.signInUsername({ body: { username: name, password }, headers: c.req.raw.headers, asResponse: true });
});

/**
 * Set a new password without the old one: for Discord accounts adding one (with {username}, their password sign-in name,
 * if they have none yet), and for "forgot password" (sign in with a linked Discord, then set it here). Needs a session
 * younger than 10 minutes; every other session is revoked. Knowing the old password, /api/auth/change-password works.
 */
authApp.post("/api/de/password", async (c) => {
  if (!sameOrigin(c)) return c.json({ message: "forbidden" }, 403);
  const auth = authFor(c);
  const s = await auth.api.getSession({ headers: c.req.raw.headers }).catch(() => null);
  if (!s) return c.json({ message: "sign in first" }, 401);
  if (Date.now() - new Date(s.session.createdAt).getTime() > 10 * 60_000) return c.json({ code: "STALE", message: "For safety, sign in again first." }, 403);
  const { newPassword, username } = await c.req.json<{ newPassword?: unknown; username?: unknown }>().catch(() => ({ newPassword: undefined, username: undefined }));
  if (typeof newPassword !== "string" || newPassword.length < 10 || newPassword.length > 128) return c.json({ message: "Passwords are 10 to 128 characters." }, 400);
  const info = await me(c.env.DB, s.user.id);
  if (!info.name) {
    const problem = typeof username === "string" ? nameProblem(username) : "Choose a name to sign in with.";
    if (problem) return c.json({ message: problem }, 400);
    const n = username as string;
    try {
      await c.env.DB.prepare("UPDATE user SET username = ?, display_username = ? WHERE id = ? AND username IS NULL").bind(n.toLowerCase(), n, s.user.id).run();
    } catch (e) {
      if (/UNIQUE/i.test(String(e))) return c.json({ message: "That name is taken." }, 409);
      throw e;
    }
  }
  await c.env.DB.prepare("UPDATE user SET email_verified = 1 WHERE id = ?").bind(s.user.id).run(); // its Discord vouches
  const ctx = await auth.$context;
  const hash = await ctx.password.hash(newPassword);
  if (info.password) await ctx.internalAdapter.updatePassword(s.user.id, hash);
  else await ctx.internalAdapter.linkAccount({ userId: s.user.id, providerId: "credential", accountId: s.user.id, password: hash });
  await auth.api.revokeOtherSessions({ headers: c.req.raw.headers });
  return c.json({ ok: true });
});

const ipOf = (c: C) => c.req.header("cf-connecting-ip") ?? "none";
const tooMany = (c: C) => c.json({ code: "RATE_LIMITED", message: "Too many tries. Wait a while and try again." }, 429);
const passwordProblem = (p: unknown) => (typeof p === "string" && p.length >= 10 && p.length <= 128 ? null : "Passwords are 10 to 128 characters.");

/**
 * In-game sign-up: creates the name + password account, unverified, and answers a 6-char code plus the Discord invite.
 * The player runs /verify <code> on the Discord server; until then sign-in answers 403 EMAIL_NOT_VERIFIED. Registering
 * an unverified name again with ITS password reissues the code ("I lost my code"); otherwise a taken name is a 409.
 */
authApp.post("/api/de/register", async (c) => {
  if (!sameOrigin(c)) return c.json({ message: "forbidden" }, 403);
  if ((await hit(c.env.DB, `reg:${ipOf(c)}`, 3600_000)) > 5) return tooMany(c);
  const { username, password } = await c.req.json<{ username?: unknown; password?: unknown }>().catch(() => ({ username: undefined, password: undefined }));
  const problem = typeof username === "string" ? nameProblem(username) : "Choose a name.";
  if (problem) return c.json({ code: "BAD_NAME", message: problem }, 400);
  const pwProblem = passwordProblem(password);
  if (pwProblem) return c.json({ code: "BAD_PASSWORD", message: pwProblem }, 400);
  const name = username as string, pw = password as string;
  const auth = authFor(c);
  let userId = await auth.api.signUpEmail({ body: { username: name, password: pw, name, email: "set-by-hook@x.invalid" } })
    .then((r) => r.user.id).catch(() => null);
  if (!userId) {
    // taken: only the unverified account's own password gets a fresh code (sign-in says EMAIL_NOT_VERIFIED only then)
    const again = await auth.api.signInUsername({ body: { username: name, password: pw } }).then(() => "verified", (e: { body?: { code?: string } }) => e?.body?.code);
    if (again !== "EMAIL_NOT_VERIFIED") return c.json({ code: "NAME_TAKEN", message: "That name is taken." }, 409);
    userId = (await c.env.DB.prepare("SELECT id FROM user WHERE username = ?").bind(name.toLowerCase()).first<{ id: string }>())!.id;
  }
  const code = await issueCode(c.env.DB, "verify-code", userId, VERIFY_TTL_MS);
  return c.json({ ok: true, code, inviteUrl: c.env.DISCORD_INVITE_URL ?? null, expiresInMinutes: VERIFY_TTL_MS / 60_000 });
});

/** In-game password reset with the code /reset gave in Discord: sets the password, revokes sessions, signs in. */
authApp.post("/api/de/reset", async (c) => {
  if (!sameOrigin(c)) return c.json({ message: "forbidden" }, 403);
  if ((await hit(c.env.DB, `reset:${ipOf(c)}`, 15 * 60_000)) > 10) return tooMany(c);
  const { code, newPassword } = await c.req.json<{ code?: unknown; newPassword?: unknown }>().catch(() => ({ code: undefined, newPassword: undefined }));
  const pwProblem = passwordProblem(newPassword);
  if (pwProblem) return c.json({ code: "BAD_PASSWORD", message: pwProblem }, 400);
  const userId = await peekCode(c.env.DB, "reset-code", code);
  if (!userId || !(await takeCode(c.env.DB, "reset-code", code))) {
    return c.json({ code: "BAD_CODE", message: "That reset code is invalid or expired. Run /reset in Discord again." }, 400);
  }
  const auth = authFor(c);
  const ctx = await auth.$context;
  await ctx.internalAdapter.updatePassword(userId, await ctx.password.hash(newPassword as string));
  await ctx.internalAdapter.deleteUserSessions(userId);
  const name = (await me(c.env.DB, userId)).name!;
  await c.env.DB.prepare("DELETE FROM signin_failure WHERE key = ?").bind(`n:${await sha256hex(name.toLowerCase())}`).run(); // unlock
  return auth.api.signInUsername({ body: { username: name, password: newPassword as string }, headers: c.req.raw.headers, asResponse: true });
});

/**
 * The shared Discord bot's interactions endpoint forwards DE's /verify and /reset here (it checks Discord's signature;
 * this checks its HMAC). Body {action, code?, discord: {id, username}, ts}; header x-de-signature = hex
 * HMAC-SHA256(DE_FORWARD_SECRET, raw body), ts within 60 s. Answers {ok, message, grantVerified?}; ok:false makes the
 * bot say "invalid or expired". Must answer in about 1.5 s.
 */
async function hmacHex(secret: string, body: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return [...new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(body)))].map((b) => b.toString(16).padStart(2, "0")).join("");
}
authApp.post("/api/de/discord-forward", async (c) => {
  const secret = c.env.DE_FORWARD_SECRET;
  if (!secret || secret.length < 32) return c.text("not found", 404);
  const raw = await c.req.text();
  const sig = c.req.header("x-de-signature") ?? "";
  if ((await sha256hex(sig)) !== (await sha256hex(await hmacHex(secret, raw)))) return c.json({ ok: false, message: "bad signature" }, 401);
  const m = JSON.parse(raw) as { action?: string; code?: unknown; discord?: { id?: unknown; username?: unknown }; ts?: number };
  const who = { id: String(m.discord?.id ?? ""), username: String(m.discord?.username ?? "") };
  if (!m.ts || Math.abs(Date.now() - m.ts) > 60_000 || !/^\d{5,25}$/.test(who.id)) return c.json({ ok: false, message: "stale or malformed" }, 400);
  const db = c.env.DB;

  if (m.action === "verify") {
    const userId = await peekCode(db, "verify-code", m.code);
    if (!userId) return c.json({ ok: false, message: "unknown code" });
    // one Discord account per game account
    const other = await db.prepare("SELECT user_id FROM account WHERE provider_id = 'discord' AND account_id = ? AND user_id != ?").bind(who.id, userId).first();
    if (other) return c.json({ ok: true, message: "This Discord account is already linked to another Duel Evolution player.", grantVerified: false });
    if (!(await takeCode(db, "verify-code", m.code))) return c.json({ ok: false, message: "unknown code" });
    const now = Date.now();
    await db.batch([
      db.prepare("UPDATE user SET email_verified = 1, updated_at = ? WHERE id = ?").bind(now, userId),
      // a real linked account, so "Sign in with Discord" later reaches this same user
      db.prepare(`INSERT INTO account (id, account_id, provider_id, user_id, created_at, updated_at)
        SELECT ?, ?, 'discord', ?, ?, ? WHERE NOT EXISTS (SELECT 1 FROM account WHERE provider_id = 'discord' AND account_id = ?)`)
        .bind(crypto.randomUUID(), who.id, userId, now, now, who.id),
    ]);
    return c.json({ ok: true, message: `✅ Verified! Your Discord **${who.username}** is now linked. Head back to Duel Evolution and hit Continue.`, grantVerified: true });
  }

  if (m.action === "reset") {
    const u = await db.prepare(`SELECT a.user_id AS id FROM account a WHERE a.provider_id = 'discord' AND a.account_id = ?
      AND EXISTS (SELECT 1 FROM account p WHERE p.user_id = a.user_id AND p.provider_id = 'credential')`).bind(who.id).first<{ id: string }>();
    if (!u) return c.json({ ok: false, message: "no linked account" });
    const code = await issueCode(db, "reset-code", u.id, RESET_TTL_MS);
    return c.json({ ok: true, message: `Duel Evolution reset code: **${code}**` });
  }
  return c.json({ ok: false, message: "unknown action" }, 400);
});

/** Admin: issue (or reissue, while unclaimed) the one-time claim code of an imported, still unowned game account. */
authApp.post("/api/de/admin/legacy-claims", async (c) => {
  if (!sameOrigin(c)) return c.json({ message: "forbidden" }, 403);
  const v = await verifySession(c.req.raw, c.env);
  if (!v) return c.json({ message: "sign in first" }, 401);
  if (!v.roles.includes("admin")) return c.json({ message: "forbidden" }, 403);
  const { accountKey } = await c.req.json<{ accountKey?: unknown }>().catch(() => ({ accountKey: undefined }));
  if (typeof accountKey !== "string" || !/^[\w:-]{1,80}$/.test(accountKey)) return c.json({ message: "bad accountKey" }, 400);
  const acct = await c.env.DB.prepare("SELECT user_id FROM accounts WHERE acct = ?").bind(accountKey).first<{ user_id: string | null }>();
  if (!acct) return c.json({ message: "no such game account" }, 404);
  if (acct.user_id) return c.json({ message: "already owned" }, 409);
  const code = newClaimCode();
  const expiresAt = Date.now() + CLAIM_TTL_MS;
  const r = await c.env.DB.prepare(
    `INSERT INTO legacy_claim (account_key, code_hash, expires_at, issued_by) VALUES (?1, ?2, ?3, ?4)
     ON CONFLICT (account_key) DO UPDATE SET code_hash = ?2, expires_at = ?3, issued_by = ?4 WHERE claimed_by IS NULL`,
  ).bind(accountKey, await sha256hex(normCode(code)), expiresAt, v.userId).run();
  if (!r.meta.changes) return c.json({ message: "already claimed" }, 409);
  return c.json({ accountKey, code, expiresAt });
});

/**
 * A signed-in user redeems a claim code: the game account becomes theirs. The WorldDO (which holds the game state)
 * binds it: single-threaded, so its "still unowned" check is the atomic guard. Only then is the code spent.
 */
authApp.post("/api/de/claim", async (c) => {
  if (!sameOrigin(c)) return c.json({ message: "forbidden" }, 403);
  const v = await verifySession(c.req.raw, c.env);
  if (!v) return c.json({ message: "sign in first" }, 401);
  const { code } = await c.req.json<{ code?: unknown }>().catch(() => ({ code: undefined }));
  const norm = normCode(code);
  if (norm.length !== 24) return c.json({ message: BAD_CODE }, 400);
  const hash = await sha256hex(norm);
  const now = Date.now();
  const row = await c.env.DB.prepare("SELECT account_key FROM legacy_claim WHERE code_hash = ? AND claimed_by IS NULL AND expires_at > ?")
    .bind(hash, now).first<{ account_key: string }>();
  if (!row) return c.json({ message: BAD_CODE }, 400);
  const res = await c.env.WORLD.get(c.env.WORLD.idFromName("world")).fetch("https://world/__admin/claim", {
    method: "POST", headers: { "content-type": "application/json", "x-de-admin": `claim:${v.userId}` },
    body: JSON.stringify({ acct: row.account_key, userId: v.userId }),
  });
  const out = res.ok ? (await res.json<{ result?: string }>()).result : "error";
  if (out === "has_account") return c.json({ message: "This sign-in already has a game account with characters. Ask an admin." }, 409);
  if (out !== "ok") return c.json({ message: BAD_CODE }, 400);
  await c.env.DB.prepare("UPDATE legacy_claim SET claimed_by = ?1, claimed_at = ?2 WHERE code_hash = ?3 AND claimed_by IS NULL")
    .bind(v.userId, now, hash).run();
  return c.json({ accountKey: row.account_key });
});

/** Paths the Worker hands to authApp. */
export const isAuthPath = (path: string) => path.startsWith("/api/auth/") || path.startsWith("/api/de/");
