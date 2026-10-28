// Duel Evolution's own accounts: better-auth's tables (drizzle adapter, D1) plus the auth-side tables it does not
// ship (roles, legacy claims, sign-in failures). Game tables reference `user.id`. No email is ever collected: `email`
// is a synthetic, unique placeholder better-auth's model requires.
import { sql } from "drizzle-orm";
import { check, index, integer, primaryKey, sqliteTable, text } from "drizzle-orm/sqlite-core";

const ts = (name: string) => integer(name, { mode: "timestamp_ms" });
const now = sql`(cast(unixepoch('subsecond') * 1000 as integer))`;

export const user = sqliteTable("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: integer("email_verified", { mode: "boolean" }).notNull().default(false),
  image: text("image"),
  /** The password sign-in name (better-auth username plugin): lowercased for uniqueness; displayUsername keeps casing. */
  username: text("username").unique(),
  displayUsername: text("display_username"),
  // ponytail: unused since names lost their cooldown; drop with the next auth migration
  nameChangedAt: ts("name_changed_at"),
  createdAt: ts("created_at").notNull().default(now),
  updatedAt: ts("updated_at").notNull().default(now),
});

export const session = sqliteTable("session", {
  id: text("id").primaryKey(),
  expiresAt: ts("expires_at").notNull(),
  token: text("token").notNull().unique(),
  createdAt: ts("created_at").notNull().default(now),
  updatedAt: ts("updated_at").notNull().default(now),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
}, (t) => [index("session_user_id_idx").on(t.userId)]);

export const account = sqliteTable("account", {
  id: text("id").primaryKey(),
  accountId: text("account_id").notNull(),
  providerId: text("provider_id").notNull(),
  userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
  accessToken: text("access_token"),
  refreshToken: text("refresh_token"),
  idToken: text("id_token"),
  accessTokenExpiresAt: ts("access_token_expires_at"),
  refreshTokenExpiresAt: ts("refresh_token_expires_at"),
  scope: text("scope"),
  password: text("password"),
  createdAt: ts("created_at").notNull().default(now),
  updatedAt: ts("updated_at").notNull().default(now),
}, (t) => [index("account_user_id_idx").on(t.userId)]);

export const verification = sqliteTable("verification", {
  id: text("id").primaryKey(),
  identifier: text("identifier").notNull(),
  value: text("value").notNull(),
  expiresAt: ts("expires_at").notNull(),
  createdAt: ts("created_at").notNull().default(now),
  updatedAt: ts("updated_at").notNull().default(now),
}, (t) => [index("verification_identifier_idx").on(t.identifier)]);

/** better-auth's rate limiter, storage: "database" (shared by every isolate, unlike its memory store). */
export const rateLimit = sqliteTable("rate_limit", {
  id: text("id").primaryKey(),
  key: text("key").notNull().unique(),
  count: integer("count").notNull(),
  lastRequest: integer("last_request").notNull(),
});

/** Staff roles. The only source of admin/moderator rights: never a name, email or flag on `user`. */
export const roleGrant = sqliteTable("role_grant", {
  userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
  role: text("role", { enum: ["admin", "moderator"] }).notNull(),
  grantedBy: text("granted_by").references(() => user.id, { onDelete: "set null" }),
  createdAt: ts("created_at").notNull().default(now),
}, (t) => [primaryKey({ columns: [t.userId, t.role] }), check("role_grant_role", sql`${t.role} in ('admin', 'moderator')`)]);

/**
 * One-time codes an admin issues so the owner of an imported (2008) account can attach it to their DE user. Only the
 * SHA-256 of the code is stored; a row is redeemable once, before `expires_at`.
 */
export const legacyClaim = sqliteTable("legacy_claim", {
  accountKey: text("account_key").primaryKey(),
  codeHash: text("code_hash").notNull().unique(),
  expiresAt: ts("expires_at").notNull(),
  issuedBy: text("issued_by").references(() => user.id, { onDelete: "set null" }),
  claimedBy: text("claimed_by").references(() => user.id, { onDelete: "set null" }),
  claimedAt: ts("claimed_at"),
});

/** Recent failed password sign-ins per name: past a threshold, the name is locked for the rest of the window. */
export const signinFailure = sqliteTable("signin_failure", {
  key: text("key").primaryKey(),
  count: integer("count").notNull(),
  firstAt: integer("first_at").notNull(),
});
