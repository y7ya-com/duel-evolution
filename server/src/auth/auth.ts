// better-auth for Duel Evolution, D1 through the drizzle adapter. Two ways in, as on the owner's other game:
// - Discord sign-in, passwordless (identify scope only); a first sign-in creates the account;
// - a name + password (scrypt) for the game's own login dialog: registered in-game (POST /api/de/register) and VERIFIED
//   THROUGH DISCORD (/verify <code> on the shared bot, forwarded here) before it can sign in. A Discord account can add
//   one too (POST /api/de/password).
// No web pages, no email (`user.email` is a synthetic placeholder; `emailVerified` means "verified through Discord"),
// no captcha: Discord is the gate; D1 rate limits and a per-name lockout guard password sign-in.
// Built per request because it closes over the request's env.
import { betterAuth, type BetterAuthPlugin } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { APIError, createAuthMiddleware, isAPIError } from "better-auth/api";
import { username } from "better-auth/plugins";
import { drizzle } from "drizzle-orm/d1";
import * as schema from "../db/auth-schema.ts";
import type { AuthEnv } from "./env.ts";
import { NAME_MAX, NAME_MIN, nameProblem } from "./names.ts";

export type Role = "admin" | "moderator";

/** Failed password sign-ins for one name (any IP) inside the window after which that name is locked until it ends. */
export const SIGNIN_LOCK_AFTER = 10;
export const SIGNIN_FAILURE_WINDOW_MS = 15 * 60_000;
const DAY = 24 * 3600;
/** better-auth's user model needs a unique email; DE never asks for one. */
export const placeholderEmail = (local: string) => `${local}@users.duel-evolution.invalid`;

export interface AuthOptions {
  waitUntil?: (p: Promise<unknown>) => void;
}

export function makeAuth(env: AuthEnv, opts: AuthOptions = {}) {
  if (!env.BETTER_AUTH_SECRET || env.BETTER_AUTH_SECRET.length < 32) throw new Error("BETTER_AUTH_SECRET is missing or shorter than 32 chars");
  const discord = env.DISCORD_CLIENT_ID && env.DISCORD_CLIENT_SECRET
    ? {
      discord: {
        clientId: env.DISCORD_CLIENT_ID, clientSecret: env.DISCORD_CLIENT_SECRET,
        disableDefaultScope: true, scope: ["identify"], // no email, no guilds
        // the one URI registered with Discord; staging serves it too (route original.ygoevolution.com/api/auth/*)
        redirectURI: `${env.PUBLIC_ORIGIN}/api/auth/callback/discord`,
        // keyed by the Discord account id (account.account_id); the duelist name is picked on /account/name
        mapProfileToUser: (p: { id: string; username: string }) => ({ email: placeholderEmail(`discord-${p.id}`), emailVerified: true, name: p.username }),
      },
    }
    : {};
  return betterAuth({
    appName: "Duel Evolution",
    baseURL: env.PUBLIC_ORIGIN,
    basePath: "/api/auth",
    secret: env.BETTER_AUTH_SECRET,
    trustedOrigins: [env.PUBLIC_ORIGIN],
    database: drizzleAdapter(drizzle(env.DB, { schema }), { provider: "sqlite", schema }),
    // requireEmailVerification: password sign-in answers 403 EMAIL_NOT_VERIFIED until /verify ran in Discord
    emailAndPassword: { enabled: true, requireEmailVerification: true, autoSignIn: false, minPasswordLength: 10, maxPasswordLength: 128 },
    // over HTTP only Discord, name + password sign-in and session upkeep are live: accounts come from Discord, nothing
    // email-shaped is reachable (server-side calls, e.g. the staging test sign-in, still reach sign-up)
    disabledPaths: ["/sign-up/email", "/sign-in/email", "/send-verification-email", "/verify-email", "/change-email",
      "/request-password-reset", "/reset-password", "/forget-password", "/is-username-available"],
    session: {
      expiresIn: 7 * DAY,
      updateAge: DAY, // sliding expiry, extended at most once a day
      // no cookie cache: every check reads D1, so a revoked session is dead on the next request
      cookieCache: { enabled: false },
    },
    // OAuth never attaches itself to an existing user implicitly; a signed-in user links Discord with /link-social
    // (trusted: emails are placeholders on both sides, so better-auth's "verified email" test means nothing here)
    account: { accountLinking: { enabled: true, disableImplicitLinking: true, trustedProviders: ["discord"], allowDifferentEmails: true } },
    socialProviders: discord,
    rateLimit: {
      enabled: true,
      storage: "database",
      window: 60,
      max: 100,
      customRules: {
        "/sign-in/username": { window: 60, max: 5 },
        "/sign-in/social": { window: 60, max: 10 },
        "/change-password": { window: 600, max: 5 },
      },
    },
    advanced: {
      useSecureCookies: true,
      cookiePrefix: "de",
      defaultCookieAttributes: { httpOnly: true, secure: true, sameSite: "lax", path: "/" },
      // set by Cloudflare's edge; x-forwarded-for would be client-controlled
      ipAddress: { ipAddressHeaders: ["cf-connecting-ip"] },
      ...(opts.waitUntil ? { backgroundTasks: { handler: opts.waitUntil } } : {}),
    },
    plugins: [
      username({ minUsernameLength: NAME_MIN, maxUsernameLength: NAME_MAX, usernameValidator: (n) => nameProblem(n) === null }),
      guard(env),
    ],
  });
}

export type Auth = ReturnType<typeof makeAuth>;

/**
 * - sign-up (server-side only) takes {username, password}; the server picks the email and name;
 * - the name (the password sign-in id) never changes through /update-user;
 * - a name with SIGNIN_LOCK_AFTER recent failed password sign-ins is locked until the window passes.
 */
function guard(env: AuthEnv): BetterAuthPlugin {
  const keyOf = async (name: unknown) => `n:${await sha256hex(String(name ?? "").trim().toLowerCase())}`;
  return {
    id: "de-guard",
    onRequest: async (request) => {
      if (request.method !== "POST" || !new URL(request.url).pathname.endsWith("/sign-in/username")) return;
      const body = await request.clone().json().catch(() => null) as { username?: unknown } | null;
      const row = await env.DB.prepare("SELECT count FROM signin_failure WHERE key = ? AND first_at >= ?")
        .bind(await keyOf(body?.username), Date.now() - SIGNIN_FAILURE_WINDOW_MS).first<{ count: number }>();
      if ((row?.count ?? 0) < SIGNIN_LOCK_AFTER) return;
      return { response: Response.json({ code: "LOCKED", message: "Too many tries for this name. Wait 15 minutes." }, { status: 429 }) };
    },
    hooks: {
      before: [{
        matcher: (ctx) => ctx.path === "/sign-up/email" || ctx.path === "/update-user",
        handler: createAuthMiddleware(async (ctx) => {
          const body = (ctx.body ?? {}) as Record<string, unknown>;
          if (ctx.path === "/update-user") {
            if ("username" in body || "displayUsername" in body) throw new APIError("BAD_REQUEST", { message: "The name can't be changed here." });
            return;
          }
          const name = String(body.username ?? "");
          return { context: { body: { ...body, username: name, displayUsername: name, name, email: placeholderEmail(crypto.randomUUID()) } } };
        }),
      }],
      after: [{
        matcher: (ctx) => ctx.path === "/sign-in/username",
        handler: createAuthMiddleware(async (ctx) => {
          const key = await keyOf(ctx.body?.username);
          const r = ctx.context.returned;
          if (isAPIError(r) && r.statusCode === 401) await hit(env.DB, key, SIGNIN_FAILURE_WINDOW_MS);
          else if (!isAPIError(r)) {
            await env.DB.prepare("DELETE FROM signin_failure WHERE key = ?").bind(key).run();
          }
        }),
      }],
    },
  };
}

/** Count one attempt under `key` in a fixed window (signin_failure doubles as a small D1 counter); the new count. */
export async function hit(db: D1Database, key: string, windowMs: number): Promise<number> {
  const now = Date.now();
  const row = await db.prepare(
    `INSERT INTO signin_failure (key, count, first_at) VALUES (?1, 1, ?2) ON CONFLICT (key) DO UPDATE SET
       count = CASE WHEN first_at < ?3 THEN 1 ELSE count + 1 END,
       first_at = CASE WHEN first_at < ?3 THEN ?2 ELSE first_at END RETURNING count`).bind(key, now, now - windowMs).first<{ count: number }>();
  return row?.count ?? 1;
}

/** What a per-IP rate limit counts: the IP, or its /64 for IPv6 (one subscriber holds a whole /64 and can rotate in it). */
export function ipBucket(ip: string): string {
  if (!ip.includes(":")) return ip;
  const [a, b] = ip.toLowerCase().split("::");
  const head = a ? a.split(":") : [], tail = b ? b.split(":") : [];
  const all = b === undefined ? head : [...head, ...Array(Math.max(0, 8 - head.length - tail.length)).fill("0"), ...tail];
  return all.slice(0, 4).map((x) => x.replace(/^0+(?=.)/, "")).join(":") + "::/64";
}

export async function sha256hex(s: string): Promise<string> {
  const d = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** Roles come from role_grant only. */
export async function rolesOf(db: D1Database, userId: string): Promise<Role[]> {
  const { results } = await db.prepare("SELECT role FROM role_grant WHERE user_id = ?").bind(userId).all<{ role: Role }>();
  return results.map((r) => r.role);
}

export interface Verified { userId: string; roles: Role[]; /** the sign-in name as shown (username plugin), else the display name */ name: string }

/** The signed-in DE user behind this request's session cookie, or null. */
export async function verifySession(request: Request, env: AuthEnv): Promise<Verified | null> {
  const s = await makeAuth(env).api.getSession({ headers: request.headers }).catch(() => null);
  if (!s) return null;
  const u = s.user as { displayUsername?: string | null; username?: string | null; name: string };
  return { userId: s.user.id, roles: await rolesOf(env.DB, s.user.id), name: u.displayUsername || u.username || u.name };
}
