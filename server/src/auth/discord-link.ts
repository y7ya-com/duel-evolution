// What the Discord bot does with a game account (discord/interactions.ts; POST /api/de/discord-forward kept for the old
// shared endpoint): /verify <code> links the Discord account and verifies the player, /reset hands out a reset code,
// and a #duels Accept mints a one-time sign-in link straight into that duel (GET /api/auth/de/duel-link, auth.ts).
import { sha256hex } from "./auth.ts";
import { issueCode, peekCode, RESET_TTL_MS, takeCode } from "./codes.ts";

export type DiscordUser = { id: string; username: string };
/** ok: false = the code is unknown or expired; grantVerified: give the Verified and Password User roles. */
export type LinkAnswer = { ok: boolean; message: string; grantVerified?: boolean };

export async function verifyByCode(db: D1Database, who: DiscordUser, code: unknown): Promise<LinkAnswer> {
  const userId = await peekCode(db, "verify-code", code);
  if (!userId) return { ok: false, message: "unknown code" };
  // one Discord account per game account
  const other = await db.prepare("SELECT user_id FROM account WHERE provider_id = 'discord' AND account_id = ? AND user_id != ?").bind(who.id, userId).first();
  if (other) return { ok: true, message: "This Discord account is already linked to another Duel Evolution player.", grantVerified: false };
  if (!(await takeCode(db, "verify-code", code))) return { ok: false, message: "unknown code" };
  const now = Date.now();
  await db.batch([
    db.prepare("UPDATE user SET email_verified = 1, updated_at = ? WHERE id = ?").bind(now, userId),
    // a real linked account, so "Sign in with Discord" later reaches this same user
    db.prepare(`INSERT INTO account (id, account_id, provider_id, user_id, created_at, updated_at)
      SELECT ?, ?, 'discord', ?, ?, ? WHERE NOT EXISTS (SELECT 1 FROM account WHERE provider_id = 'discord' AND account_id = ?)`)
      .bind(crypto.randomUUID(), who.id, userId, now, now, who.id),
  ]);
  return { ok: true, message: `✅ Verified! Your Discord **${who.username}** is now linked. Head back to Duel Evolution and hit Continue.`, grantVerified: true };
}

/** A reset code for the name + password account linked to this Discord (ok: false without one). */
export async function resetCode(db: D1Database, who: DiscordUser): Promise<LinkAnswer> {
  const u = await db.prepare(`SELECT a.user_id AS id FROM account a WHERE a.provider_id = 'discord' AND a.account_id = ?
    AND EXISTS (SELECT 1 FROM account p WHERE p.user_id = a.user_id AND p.provider_id = 'credential')`).bind(who.id).first<{ id: string }>();
  if (!u) return { ok: false, message: "no linked account" };
  const code = await issueCode(db, "reset-code", u.id, RESET_TTL_MS);
  return { ok: true, message: `Duel Evolution reset code: **${code}**` };
}

/** The game account linked to a Discord account, or null. */
export async function linkedUser(db: D1Database, discordId: string): Promise<string | null> {
  return (await db.prepare("SELECT user_id FROM account WHERE provider_id = 'discord' AND account_id = ?").bind(discordId).first<{ user_id: string }>())?.user_id ?? null;
}

/** How long a #duels sign-in link works (once). */
export const DUEL_LINK_TTL_MS = 10 * 60_000;
const linkId = async (token: string) => `duel-link:${await sha256hex(token)}`;
/** A one-time link token that signs `userId` in and opens duel `duel`: 256 random bits, only its hash stored. */
export async function issueDuelLink(db: D1Database, userId: string, duel: number): Promise<string> {
  const token = btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(32)))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  const now = Date.now();
  await db.prepare("INSERT INTO verification (id, identifier, value, expires_at, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)")
    .bind(crypto.randomUUID(), await linkId(token), JSON.stringify({ userId, duel }), now + DUEL_LINK_TTL_MS, now, now).run();
  return token;
}
/** Consume a link token: its user and duel, or null (unknown, used or expired). Deleting it is the claim, so two
 *  racing opens can't both sign in. */
export async function takeDuelLink(db: D1Database, token: unknown): Promise<{ userId: string; duel: number } | null> {
  if (typeof token !== "string" || !/^[\w-]{43}$/.test(token)) return null;
  const row = await db.prepare("DELETE FROM verification WHERE identifier = ? AND expires_at > ? RETURNING value")
    .bind(await linkId(token), Date.now()).first<{ value: string }>();
  return row ? JSON.parse(row.value) : null;
}
