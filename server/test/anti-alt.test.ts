// The anti-alt rules (owner, 2026-11-04: a main fed 261 cards by alt accounts on VPNs): the earned-duels ledger, the
// one-off legacy bind, the trade's giver gate and daily intake cap, the D1 trade ledger, the sign-in IP history and the
// daily report (db/audit.ts) on the real migrations.
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { createRequire } from "node:module";
import { afterEach, describe, expect, it, vi } from "vitest";
import * as PP from "../src/game/persist.ts";
import { configFrom, TRADE_GIVE_MIN_DUELS_LIVE } from "../src/config.ts";
import type { TradeEntry } from "../src/game/trade.ts";
import { analyse, buildReport, isHosting, recordLogin, recordTrade, runTradeReport, summary, type TradeRow } from "../src/db/audit.ts";
import { harness, be32, cat, cstr, i32, pc, u32, type Client, type Harness } from "./notes-harness.ts";

afterEach(() => { vi.useRealTimers(); PP.setProgression(false); });

describe("earned duels and the legacy bind", () => {
  it("a new character starts with 0 earned duels and is never legacy-bound; a paid duel counts, an unpaid one doesn't", () => {
    PP.setProgression(true);
    const p = PP.profile({ players: { 0: "New" } }, 0)!;
    expect([p.earned, p.bind_v, p.bound]).toEqual([{ duels: 0 }, 1, undefined]);
    PP.mpReward(null, p, "win", 5);
    PP.mpReward(null, p, "lose", 1, { opp: "u:x", secs: 10 });   // short PvP: pays 0
    expect(PP.earnedDuels(p)).toBe(1);
  });

  it("an older character's earned duels are estimated once from its PvP games and NPC results", () => {
    expect(PP.earnedDuels({ pvp: { n: 7 }, npcbin: { 3: [4, 2, 1, 9], 8: [1, 0, 0, 0] } })).toBe(15);
    expect(PP.earnedDuels({ earned: { duels: 2 }, pvp: { n: 7 } })).toBe(2);
  });

  it("legacyBind: under 20 earned duels the whole trunk becomes soul-bound, at 20 or more nothing changes; once only", () => {
    PP.setProgression(true);
    const alt: PP.P = { prog: 1, trunk: { [pc(1)]: 3, [pc(2)]: 1 }, npcbin: { 3: [5, 1, 0, 0] } };
    expect(PP.legacyBind(alt)).toBe(true);
    expect([alt.bound, alt.earned, alt.bind_v]).toEqual([{ [pc(1)]: 3, [pc(2)]: 1 }, { duels: 6 }, 1]);
    alt.trunk[pc(3)] = 2;                                     // a later earned card stays free
    expect(PP.legacyBind(alt)).toBe(false);
    expect(alt.bound[pc(3)]).toBeUndefined();
    const vet: PP.P = { prog: 1, trunk: { [pc(1)]: 3 }, pvp: { n: 20 } };
    expect([PP.legacyBind(vet), vet.bound, vet.earned]).toEqual([false, undefined, { duels: 20 }]);
  });

  it("legacyBind runs at profile load (progression only)", () => {
    const st = { players: { 0: "Alt" }, profiles: { 0: { name: "Alt", prog: 1, rec: { mp: 0 }, trunk: { [pc(1)]: 2 } } } } as any;
    expect(PP.profile(structuredClone(st), 0)!.bound).toBeUndefined();     // progression off: untouched
    PP.setProgression(true);
    expect(PP.profile(st, 0)!.bound).toEqual({ [pc(1)]: 2 });
  });
});

// ---- trades on the wire, with progression on
const t = (sub: number, rest: ArrayLike<number> = []) => cat([sub >> 8, sub & 0xff], rest);
const ask = async (X: Client, mid: number, data: ArrayLike<number>, reply: number) => {
  const n = X.room!.mark(); X.room!.send(mid, data); return (await X.room!.wait(reply, n))!;
};
interface Side { trunk: Record<string, number>; earned?: number; bound?: Record<string, number>; tin?: number }

/** A whole trade between A and B (progression on) with these characters; returns the 0x7121 result, A's and B's chat
 *  lines after it, both trunks, the ledger entries and the harness. */
async function trade(A0: Side, B0: Side, giveA: number[], giveB: number[], env: Record<string, string> = {}) {
  const h: Harness = harness({ players: {} }, { PROGRESSION: "1", ...env });
  const ledger: TradeEntry[] = [];
  h.game.tp!.ledger = (e) => ledger.push(e);
  const [A, B] = [h.client("P0"), h.client("P1")];
  await A.account(0, "Player0"); await B.account(0, "Player1");
  await A.enterRoom(); await B.enterRoom();
  const day = new Date(h.game.clock.time() * 1000).toISOString().slice(0, 10);
  const st = h.state();
  for (const [i, x] of [A0, B0].entries()) {
    const p = (Object.values(st.accounts) as any[]).find((a) => a.idx === i + 1).profiles["0"];
    p.trunk = x.trunk; p.bound = x.bound ?? {}; p.earned = { duels: x.earned ?? 20 }; p.bind_v = 1;
    if (x.tin) p.econ = { day, duels: 0, wins: 0, pairs: {}, earned: 0, spent: 0, packs: 0, tin: x.tin };
  }
  h.game.store.saveRaw(st);
  let m = B.room!.mark();
  expect(i32(await ask(A, 0x7000, t(0x7102, be32(B.pid!)), 0x7103))).toBe(0);
  await B.room!.wait(0x7104, m);
  let n = A.room!.mark();
  B.room!.send(0x7000, t(0x7105, be32(1)));
  await A.room!.wait(0x7105, n, undefined, 3000);
  for (const X of [A, B]) {
    const k = X.room!.mark(); X.room!.send(0x7000, t(0x7132)); await X.room!.wait(0x7131, k);
    const j = X.room!.mark(); X.room!.send(0x7000, t(0x7101)); await X.room!.wait(0x7133, j);
  }
  for (const [X, Y, give] of [[A, B, giveA], [B, A, giveB]] as const)
    for (const card of give) {
      const k = Y.room!.mark();
      X.room!.send(0x7000, t(0x7113, be32(card)));
      const mv = (await Y.room!.wait(0x7116, k))!;
      expect(u32(mv)).toBe(card);
      Y.room!.send(0x7000, t(0x7122));
    }
  n = A.room!.mark(); m = B.room!.mark();
  A.room!.send(0x7000, t(0x7117, [0])); B.room!.send(0x7000, t(0x7117, [0]));
  await A.room!.wait(0x7118, n);
  const list = (cs: number[]) => [...cs.map((c) => be32(c)), ...new Array(10 - cs.length).fill(be32(-1))];
  const conf = (mine: number[], theirs: number[]) => cat([1], ...list(mine), ...list(theirs));
  A.room!.send(0x7000, t(0x7119, conf(giveA, giveB))); B.room!.send(0x7000, t(0x7119, conf(giveB, giveA)));
  const end = (await A.room!.wait(0x7121, n))!;
  await h.tick(300);
  const prof = (i: number) => (Object.values(h.state().accounts) as any[]).find((a) => a.idx === i + 1).profiles["0"];
  const chat = (X: Client, k: number) => X.room!.all(0x4402, k).map((d) => cstr(d.subarray(26)));
  return { end: end[0], chatA: chat(A, n), chatB: chat(B, m), a: prof(0), b: prof(1), ledger, h };
}
const filler = (k: number) => ({ [pc(9)]: 40, [pc(k)]: 10 });

describe("the dev stack's TRADE_GIVE_MIN_DUELS switch", () => {
  it("is 20 by default and only DEV=1 outside production lowers it", () => {
    expect(PP.TRADE_GIVE_MIN_DUELS).toBe(20);
    expect(TRADE_GIVE_MIN_DUELS_LIVE).toBe(PP.TRADE_GIVE_MIN_DUELS);
    const at = (env: Record<string, string>) => configFrom(env).tradeGiveMinDuels;
    expect(at({})).toBe(20);
    expect(at({ PROGRESSION: "1", DEPLOY_ENV: "production" })).toBe(20);
    expect(at({ TRADE_GIVE_MIN_DUELS: "0" })).toBe(20);
    expect(at({ TRADE_GIVE_MIN_DUELS: "0", DEV: "true" })).toBe(20);
    expect(at({ TRADE_GIVE_MIN_DUELS: "0", DEV: "1", DEPLOY_ENV: "production" })).toBe(20);
    expect(at({ TRADE_GIVE_MIN_DUELS: "-3", DEV: "1" })).toBe(20);
    expect(at({ TRADE_GIVE_MIN_DUELS: "x", DEV: "1" })).toBe(20);
    expect(at({ TRADE_GIVE_MIN_DUELS: "0", DEV: "1" })).toBe(0);
    expect(at({ TRADE_GIVE_MIN_DUELS: "5", DEV: "1", DEPLOY_ENV: "staging" })).toBe(5);
  });
  it("no deploy config sets DEV or TRADE_GIVE_MIN_DUELS", () => {
    for (const f of ["wrangler.jsonc", "scripts/deploy.sh"]) {
      const cfg = readFileSync(f, "utf8");
      expect(cfg).not.toMatch(/TRADE_GIVE_MIN_DUELS/);
      expect(cfg).not.toMatch(/"DEV"\s*:/);
    }
  });
  it("a dev stack at 0 lets a character with no rewarded duels give; in production it is ignored", async () => {
    const dev = await trade({ trunk: filler(1), earned: 0 }, { trunk: filler(2), earned: 0 }, [pc(1)], [pc(2)], { DEV: "1", TRADE_GIVE_MIN_DUELS: "0" });
    expect([dev.end, dev.a.trunk[pc(2)], dev.b.trunk[pc(1)]]).toEqual([1, 1, 1]);
    const prod = await trade({ trunk: filler(1), earned: 19 }, { trunk: filler(2) }, [pc(1)], [pc(2)], { DEV: "1", DEPLOY_ENV: "production", TRADE_GIVE_MIN_DUELS: "0" });
    expect(prod.end).toBe(0);
    expect(prod.chatA).toEqual(["Trade cancelled: a character can give cards after 20 rewarded duels."]);
    // a live Game (no override) sets the rule back for the next Game in this process
    const again = await trade({ trunk: filler(1), earned: 19 }, { trunk: filler(2) }, [pc(1)], [pc(2)]);
    expect(again.end).toBe(0);
  });
});

describe("the trade's giver gate and intake cap", () => {
  it("a character under 20 rewarded duels can't give cards (the chat says why); one at 20 can", async () => {
    const r = await trade({ trunk: filler(1), earned: 19 }, { trunk: filler(2) }, [pc(1)], [pc(2)]);
    expect([r.end, r.a.trunk, r.b.trunk]).toEqual([0, filler(1), filler(2)]);
    expect(r.chatA).toEqual(["Trade cancelled: a character can give cards after 20 rewarded duels."]);
    expect(r.ledger.map((e) => e.result)).toEqual(["fresh"]);
    const ok = await trade({ trunk: filler(1), earned: 20 }, { trunk: filler(2) }, [pc(1)], [pc(2)]);
    expect([ok.end, ok.a.trunk[pc(2)], ok.b.trunk[pc(1)]]).toEqual([1, 1, 1]);
  });

  it("a new character may receive: the gate is only on the side that gives", async () => {
    const r = await trade({ trunk: filler(1) }, { trunk: filler(2), earned: 0 }, [pc(1)], []);
    expect([r.end, r.b.trunk[pc(1)]]).toEqual([1, 1]);
  });

  it("an account takes in at most 30 net cards a day through trades; balanced swaps don't count", async () => {
    const one = Array(10).fill(pc(1));
    const r = await trade({ trunk: filler(1) }, { trunk: filler(2), tin: 21 }, one, []);    // 21 + 10 > 30
    expect([r.end, r.b.trunk[pc(1)]]).toEqual([0, undefined]);
    expect(r.chatB).toEqual(["Trade cancelled: an account can take in at most 30 more cards than it gives a day through trades."]);
    expect(r.ledger[0]).toMatchObject({ result: "cap", a: { gave: one }, b: { gave: [] } });
    const ok = await trade({ trunk: filler(1) }, { trunk: filler(2), tin: 20 }, one, []);   // exactly 30
    expect([ok.end, ok.b.econ.tin]).toEqual([1, 30]);
    const swap = await trade({ trunk: filler(1) }, { trunk: filler(2), tin: 30 }, [pc(1)], [pc(2)]);
    expect([swap.end, swap.b.econ.tin, swap.a.econ?.tin ?? 0]).toEqual([1, 30, 0]);   // net 0: untouched
  });

  it("the ledger gets every confirmed trade with both sides' accounts, slots, names and cards", async () => {
    const r = await trade({ trunk: filler(1) }, { trunk: filler(2) }, [pc(1), pc(1)], [pc(2)]);
    expect(r.ledger).toEqual([{ at: expect.any(Number), result: "done",
      a: { acct: expect.stringMatching(/./), slot: 0, name: "Player0", gave: [pc(1), pc(1)] },
      b: { acct: expect.stringMatching(/./), slot: 0, name: "Player1", gave: [pc(2)] } }]);
  });
});

// ---- the D1 side, on the real migrations
const { DatabaseSync } = createRequire(import.meta.url)("node:sqlite");
function d1(): D1Database {
  const db = new DatabaseSync(":memory:");
  const dir = join(import.meta.dirname, "../migrations");
  for (const f of readdirSync(dir).filter((f) => f.endsWith(".sql")).sort()) db.exec(readFileSync(join(dir, f), "utf8").replaceAll("--> statement-breakpoint", ""));
  const stmt = (sql: string, args: unknown[] = []): any => ({
    bind: (...a: unknown[]) => stmt(sql, a),
    first: async () => db.prepare(sql).get(...(args as any[])) ?? null,
    all: async () => ({ results: db.prepare(sql).all(...(args as any[])) }),
    run: async () => db.prepare(sql).run(...(args as any[])),
  });
  return { prepare: (sql: string) => stmt(sql), batch: async (q: any[]) => { for (const s of q) await s.run(); return []; }, raw: db } as any;
}
const req = (ip: string, asn: number, org: string) => Object.assign(new Request("https://x/net", { headers: { "cf-connecting-ip": ip } }), { cf: { asn, asOrganization: org, country: "DE" } });
const T0 = Date.parse("2026-11-04T12:00:00Z");
const entry = (at: number, a: [string, string, number[]], b: [string, string, number[]], result: TradeEntry["result"] = "done"): TradeEntry =>
  ({ at, result, a: { acct: a[0], slot: 0, name: a[1], gave: a[2] }, b: { acct: b[0], slot: 0, name: b[1], gave: b[2] } });

describe("the audit tables and the daily report", () => {
  it("recordLogin keeps one row per user, IP (an IPv6 /64) and day, with the network", async () => {
    const db = d1();
    await recordLogin(db, "u1", req("2a0a:ef40:1547:4401:d3f7::1", 5378, "Vodafone"), T0);
    await recordLogin(db, "u1", req("2a0a:ef40:1547:4401:aaaa::2", 5378, "Vodafone"), T0 + 1000);
    await recordLogin(db, "u1", req("89.36.76.138", 9009, "M247 Europe SRL"), T0 + 2000);
    const rows = (await db.prepare("SELECT user_id, ip, day, asn, n FROM login_ip ORDER BY ip").all()).results;
    expect(rows).toEqual([
      { user_id: "u1", ip: "2a0a:ef40:1547:4401::/64", day: "2026-11-04", asn: 5378, n: 2 },
      { user_id: "u1", ip: "89.36.76.138", day: "2026-11-04", asn: 9009, n: 1 }]);
  });

  it("hosting networks: by ASN or by the organisation's name", () => {
    expect([isHosting(9009, null), isHosting(5378, "Vodafone Broadband"), isHosting(1, "Some Hosting Ltd"), isHosting(null, null)]).toEqual([true, false, true, false]);
  });

  it("the report flags the 2026-11-04 pattern: relay through a middle account, one-way flows, a shared IP, refused tries, VPN-only", async () => {
    const db = d1();
    (db as any).raw.exec("PRAGMA foreign_keys = OFF");                      // accounts without their better-auth users
    for (const [acct, user] of [["u:main", "main"], ["u:mid", "mid"], ["u:alt", "alt"], ["u:vpn", "vpn"], ["u:x", "x"], ["u:y", "y"]])
      (db as any).raw.prepare("INSERT INTO accounts (acct, user_id, is_owner) VALUES (?, ?, 0)").run(acct, user);
    const s = T0 / 1000, c10 = Array.from({ length: 10 }, (_, i) => pc(i + 1));
    // the alt's own characters feed the middle account, which passes the same cards to the main minutes later
    await recordTrade(db, entry(s, ["u:alt", "Dark", c10], ["u:mid", "Master", []]));
    await recordTrade(db, entry(s + 600, ["u:mid", "Master", c10], ["u:main", "Black", []]));
    // another alt straight to the main
    for (let i = 0; i < 3; i++) await recordTrade(db, entry(s + 1000 + i, ["u:vpn", "Hero", c10], ["u:main", "Black", [pc(50)]]));
    // a fair swap between strangers: nothing
    await recordTrade(db, entry(s + 2000, ["u:x", "Abram", c10], ["u:y", "Zed", c10]));
    // a new alt hammering soul-bound cards
    for (let i = 0; i < 5; i++) await recordTrade(db, entry(s + 3000 + i, ["u:alt", "Flame", [pc(1)]], ["u:main", "Black", []], i % 2 ? "bound" : "fresh"));
    await recordLogin(db, "main", req("154.244.213.69", 36947, "Telecom Algeria"), T0);
    await recordLogin(db, "alt", req("154.244.213.69", 36947, "Telecom Algeria"), T0);
    await recordLogin(db, "vpn", req("130.195.223.5", 9009, "M247 Europe SRL"), T0);
    await recordLogin(db, "mid", req("89.36.76.138", 9009, "M247 Europe SRL"), T0);
    const r = await buildReport(db, T0 + 3600_000);
    const kinds = r.findings.map((f) => [f.kind, f.kind === "relay" ? `${f.from}>${f.via}>${f.to}:${f.cards}` : f.kind === "one_way" ? `${f.from}>${f.to}:${f.net}`
      : f.kind === "shared_ip" ? f.accounts.join("&") : `${f.acct}:${f.attempts}`]);
    // alt -> mid and mid -> main are 10 cards each: under the one-way threshold, but together a relay
    expect(kinds).toEqual([["relay", "u:alt>u:mid>u:main:10"], ["one_way", "u:vpn>u:main:27"], ["shared_ip", "u:alt&u:main"],
      ["refused", "u:alt:5"], ["refused", "u:main:5"]]);
    expect(r.accounts["u:vpn"]).toMatchObject({ user: "vpn", hosting_only: true });
    expect(r.accounts["u:main"].hosting_only).toBe(false);
    expect(summary(r, "https://x/__trade-report")).toMatch(/relay 10 cards u:alt → u:mid → u:main .*⚠ VPN\/hosting only/);
  });

  it("one-way: flagged from 20 net cards with at least 4× more going one way; a swap is not", () => {
    const row = (at: number, a: string, ga: number, b: string, gb: number): TradeRow =>
      ({ at, result: "done", a_acct: a, a_name: a, a_gave: JSON.stringify(Array(ga).fill(1)), b_acct: b, b_name: b, b_gave: JSON.stringify(Array(gb).fill(2)) });
    const f = (rows: TradeRow[]) => analyse(rows, [], {}, T0).findings.filter((x) => x.kind === "one_way").length;
    expect(f([row(1, "a", 10, "b", 0), row(2, "a", 9, "b", 0)])).toBe(0);    // 19
    expect(f([row(1, "a", 10, "b", 0), row(2, "a", 10, "b", 0)])).toBe(1);   // 20
    expect(f([row(1, "a", 10, "b", 5), row(2, "a", 10, "b", 5), row(3, "a", 10, "b", 0)])).toBe(0);   // 30 vs 10: 3×
    expect(f([row(1, "a", 10, "b", 10), row(2, "a", 10, "b", 10)])).toBe(0);
  });

  it("runTradeReport prunes old rows, keeps the report in R2 and posts a summary when there are findings", async () => {
    const db = d1();
    (db as any).raw.prepare("INSERT INTO login_ip (user_id, ip, day, first, last, n) VALUES ('u', '1.1.1.1', '2026-01-01', 0, 0, 1)").run();
    const s = T0 / 1000;
    await recordTrade(db, entry(s - 400 * 86400, ["u:a", "Old", [1]], ["u:b", "B", []]));
    for (let i = 0; i < 3; i++) await recordTrade(db, entry(s + i, ["u:a", "A", Array(10).fill(pc(1))], ["u:b", "B", []]));
    const put = vi.fn(async () => null), post = vi.fn(async () => new Response(null, { status: 204 }));
    vi.stubGlobal("fetch", post);
    try {
      const r = await runTradeReport({ DB: db, BUCKET: { put } as any, REPORT_WEBHOOK: "https://discord/webhook", PUBLIC_ORIGIN: "https://ygoevolution.com" }, T0 + 1000);
      expect(r!.findings.map((f) => f.kind)).toEqual(["one_way"]);
      expect((put.mock.calls[0] as any[])[0]).toBe("private/reports/trades/2026-11-04.json");
      const body = JSON.parse(((post.mock.calls[0] as any[])[1] as RequestInit).body as string);
      expect(body.content).toMatch(/one-way 30 net cards u:a → u:b in 3 trades[\s\S]*__trade-report\?day=2026-11-04/);
      expect(body.allowed_mentions).toEqual({ parse: [] });
    } finally { vi.unstubAllGlobals(); }
    expect((await db.prepare("SELECT count(*) n FROM login_ip").first() as any).n).toBe(0);
    expect((await db.prepare("SELECT count(*) n FROM trade_log").first() as any).n).toBe(3);
  });
});
