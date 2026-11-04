// The anti-alt audit tables (db/audit.ts): written as they happen, never part of the state projection (db/project.ts
// STATE_TABLES), so a save neither reads nor rewrites them. Workers Logs keep about a week; these keep the evidence.
import { index, integer, primaryKey, sqliteTable, text } from "drizzle-orm/sqlite-core";

/** Every trade that reached both confirmations, done or refused (trade.ts TradeEntry). Cards: JSON arrays of passcodes,
 *  repeats are copies; cosmetics (a_cos / b_cos): the lines of a mixed trade. */
export const tradeLog = sqliteTable("trade_log", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  at: integer("at").notNull(),                 // unix seconds
  result: text("result").notNull(),            // done | missing | min | bound | fresh | cap | cos-missing | cos-client
  aAcct: text("a_acct").notNull(), aSlot: integer("a_slot"), aName: text("a_name"), aGave: text("a_gave").notNull(),
  bAcct: text("b_acct").notNull(), bSlot: integer("b_slot"), bName: text("b_name"), bGave: text("b_gave").notNull(),
  // a mixed trade's cosmetic lines per side, JSON [{id, count, rarity}] (trade-units.ts); null: the trade had none
  aCos: text("a_cos"), bCos: text("b_cos"),
}, (t) => [index("trade_log_at_idx").on(t.at), index("trade_log_a_idx").on(t.aAcct, t.at), index("trade_log_b_idx").on(t.bAcct, t.at)]);

/** Where a signed-in user's game connections came from: one row per user, IP and UTC day (the Worker, at each game
 *  WebSocket upgrade). asn / as_org / country are Cloudflare's request.cf. Pruned after LOGIN_IP_KEEP_DAYS. */
export const loginIp = sqliteTable("login_ip", {
  userId: text("user_id").notNull(),
  ip: text("ip").notNull(),                    // the address, or its /64 for IPv6 (auth.ts ipBucket)
  day: text("day").notNull(),                  // YYYY-MM-DD (UTC)
  asn: integer("asn"),
  asOrg: text("as_org"),
  country: text("country"),
  first: integer("first").notNull(),           // unix ms
  last: integer("last").notNull(),
  n: integer("n").notNull(),
}, (t) => [primaryKey({ columns: [t.userId, t.ip, t.day] }), index("login_ip_ip_idx").on(t.ip, t.day), index("login_ip_day_idx").on(t.day)]);
