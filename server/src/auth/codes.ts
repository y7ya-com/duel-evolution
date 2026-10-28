// Short one-time codes that carry a user between the game and Discord, in better-auth's `verification` table:
//   verify-code → { userId }  (in-game sign-up → the player runs /verify <code> in Discord)
//   reset-code  → { userId }  (/reset in Discord → the player types the code into the game)
// Only the code's SHA-256 is stored, so a table dump holds no live code.
import { sha256hex } from "./auth.ts";

export type CodeKind = "verify-code" | "reset-code";
export const VERIFY_TTL_MS = 60 * 60_000;
export const RESET_TTL_MS = 15 * 60_000;

// unambiguous: no 0/O/1/I/L, easy to read off one screen and type into another
const CODE_CHARS = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
// ponytail: 6 chars = 31^6 ≈ 8.9e8, 1 h / 15 min TTL, redeemed only by rate-limited or HMAC-signed callers
const genCode = () => [...crypto.getRandomValues(new Uint8Array(6))].map((b) => CODE_CHARS[b % CODE_CHARS.length]).join("");

export const codeNorm = (raw: unknown) => (typeof raw === "string" ? raw.trim().toUpperCase() : "");
const ident = async (kind: CodeKind, code: string) => `${kind}:${await sha256hex(code)}`;

/** A fresh code for `userId`; any earlier code of the same kind for that user is dropped. */
export async function issueCode(db: D1Database, kind: CodeKind, userId: string, ttlMs: number): Promise<string> {
  const code = genCode();
  const now = Date.now();
  await db.batch([
    db.prepare("DELETE FROM verification WHERE identifier LIKE ? AND value = ?").bind(`${kind}:%`, JSON.stringify({ userId })),
    db.prepare("INSERT INTO verification (id, identifier, value, expires_at, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)")
      .bind(crypto.randomUUID(), await ident(kind, code), JSON.stringify({ userId }), now + ttlMs, now, now),
  ]);
  return code;
}

/** The user a live code belongs to, or null (missing or expired). Doesn't consume it. */
export async function peekCode(db: D1Database, kind: CodeKind, raw: unknown): Promise<string | null> {
  const code = codeNorm(raw);
  if (!/^[A-Z2-9]{6}$/.test(code)) return null;
  const row = await db.prepare("SELECT value FROM verification WHERE identifier = ? AND expires_at > ?")
    .bind(await ident(kind, code), Date.now()).first<{ value: string }>();
  return row ? (JSON.parse(row.value) as { userId: string }).userId : null;
}

/** Consume a code: true if it was live (so two racing redemptions can't both win). */
export async function takeCode(db: D1Database, kind: CodeKind, raw: unknown): Promise<boolean> {
  const r = await db.prepare("DELETE FROM verification WHERE identifier = ? AND expires_at > ?")
    .bind(await ident(kind, codeNorm(raw)), Date.now()).run();
  return r.meta.changes > 0;
}
