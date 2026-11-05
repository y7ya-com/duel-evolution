import { expect, it } from "vitest";
import { analyseFunnel } from "../src/db/trade-funnel.ts";
import { cardRarityCatalog } from "../src/game/card-rarity.ts";
import { shardValues } from "../src/game/shards-config.ts";
it("ranks a ten-alt funnel with rarity value, shared IP, age, level and lopsided-trade evidence", () => {
  const now = Date.now(), catalog = cardRarityCatalog().byPasscode as Record<string, string>;
  const ur = Number(Object.keys(catalog).find((pc) => catalog[pc] === "UR"));
  const n = Number(Object.keys(catalog).find((pc) => catalog[pc] === "N"));
  const trades = Array.from({ length: 10 }, (_, i) => ({ at: now / 1000 - i, result: "done", a_acct: `alt${i}`, b_acct: "main",
    a_name: null, b_name: null, a_gave: JSON.stringify([ur]), b_gave: JSON.stringify([n]) }));
  const ips = ["main", ...trades.map((t) => t.a_acct)].map((acct) => ({ acct, ip: "shared", asn: null, as_org: null, country: null }));
  const meta = Object.fromEntries(trades.map((t) => [t.a_acct, { createdAt: now - 1000, level: 2 }]));
  const r = analyseFunnel(trades, ips, meta, now);
  expect(r.accounts[0]).toMatchObject({ account: "main", net: 10 * (shardValues().dismantle.UR - shardValues().dismantle.N), senderCount: 10, trades: 10, lopsidedTrades: 10 });
  expect(r.accounts[0].flags).toEqual(expect.arrayContaining(["one-way-flow", "many-senders", "shared-ip", "new-senders", "low-level-senders", "lopsided-trades"]));
  expect(r.accounts[0].topSenders[0]).toMatchObject({ net: shardValues().dismantle.UR - shardValues().dismantle.N, sharedIPs: ["shared"], newAccount: true, lowLevel: true });
  expect(analyseFunnel([{ ...trades[0], result: "bound" }], [], {}, now).accounts).toEqual([]);
  expect(analyseFunnel([{ ...trades[0], at: now / 1000 - 8 * 86400 }], [], {}, now).accounts).toEqual([]);
});
it("queries the real migrated audit, user age, levels and login tables without schema changes", async () => {
  const { createRequire } = await import("node:module");
  const { readFileSync, readdirSync } = await import("node:fs");
  const { join } = await import("node:path");
  const { DatabaseSync } = createRequire(import.meta.url)("node:sqlite");
  const sql = new DatabaseSync(":memory:");
  try {
    const dir = join(import.meta.dirname, "../migrations");
    for (const name of readdirSync(dir).filter((n) => n.endsWith(".sql")).sort()) sql.exec(readFileSync(join(dir, name), "utf8").replaceAll("--> statement-breakpoint", ""));
    const now = Date.now();
    sql.prepare("INSERT INTO user (id, name, email, created_at) VALUES ('alt-user', 'Alt', 'alt@x', ?)").run(now - 1000);
    sql.prepare("INSERT INTO accounts (acct, user_id, is_owner) VALUES ('alt', 'alt-user', 0), ('main', NULL, 0)").run();
    sql.prepare("INSERT INTO characters (id, acct, slot, lv) VALUES ('alt/0', 'alt', '0', 2)").run();
    const pc = Number(Object.keys(cardRarityCatalog().byPasscode as object)[0]);
    sql.prepare("INSERT INTO trade_log (at, result, a_acct, a_gave, b_acct, b_gave) VALUES (?, 'done', 'alt', ?, 'main', '[]')").run(Math.floor(now / 1000), JSON.stringify([pc]));
    sql.prepare("INSERT INTO login_ip (user_id, ip, day, first, last, n) VALUES ('alt-user', 'shared', ?, ?, ?, 1)").run(new Date(now).toISOString().slice(0, 10), now, now);
    const stmt = (query: string, args: any[] = []): any => ({ bind: (...a: any[]) => stmt(query, a), all: async () => ({ results: sql.prepare(query).all(...args) }) });
    const { buildFunnelReport } = await import("../src/db/trade-funnel.ts");
    const report = await buildFunnelReport({ prepare: (q: string) => stmt(q) } as any, 7, now);
    expect(report.accounts[0].account).toBe("main");
    expect(report.accounts[0].topSenders[0]).toMatchObject({ account: "alt", newAccount: true, lowLevel: true, level: 2 });
  } finally { sql.close(); }
});
