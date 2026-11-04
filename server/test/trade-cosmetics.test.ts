// Cosmetics in the native card trade (trade.ts + game/trade-cosmetics.ts): mixed trades both ways in one commit, the
// confirmations reset by a change, atomic refusals (a missing spare, the giver gate, the intake cap), the capability
// gate for games without the panel, a disconnect, replays, the anti-alt counters and the report, Free Mode.
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { createRequire } from "node:module";
import { afterEach, describe, expect, it, vi } from "vitest";
vi.mock("cloudflare:workers", () => ({ DurableObject: class { constructor(readonly ctx: any, readonly env: any) {} } }));
vi.mock("../src/duel/boot.ts", () => ({ bootDuel: vi.fn(async () => {}) }));
import * as PP from "../src/game/persist.ts";
import type { TradeEntry } from "../src/game/trade.ts";
import { COSMETICS } from "../src/game/cosmetics-catalog.ts";
import { tradeCosmeticsInfo, tradeCosmeticsPanel, tradeCosmeticsSet } from "../src/game/trade-cosmetics.ts";
import { COSMETIC_UNITS } from "../src/game/trade-units.ts";
import { analyse, recordTrade, summary, type TradeRow } from "../src/db/audit.ts";
import { WorldDO } from "../src/do.ts";
import { harness, be32, cat, cstr, pc, u32, type Client, type Harness } from "./notes-harness.ts";

afterEach(() => { vi.useRealTimers(); PP.setProgression(false); });

const item = (rarity: string, kind = "outfit") => COSMETICS.find((c) => c.rarity === rarity && c.kind === kind)!.id;
const COMMON = item("common"), RARE = item("rare"), ULTRA = item("ultra"), DISK = item("common", "dueldisk");
const t = (sub: number, rest: ArrayLike<number> = []) => cat([sub >> 8, sub & 0xff], rest);
const filler = (k: number) => ({ [pc(9)]: 40, [pc(k)]: 10 });
interface Side { trunk?: Record<string, number>; earned?: number; tin?: number; owned?: string[]; copies?: Record<string, number> }

/** Two players in one room, progression on, these characters and wardrobes, a trade open between them (A asked, B
 *  said yes, both trade screens started). `ua` / `ub` are their DE user ids (the API's caller). */
async function open(A0: Side = {}, B0: Side = {}) {
  const h: Harness = harness({ players: {} }, { PROGRESSION: "1" });
  const ledger: TradeEntry[] = [];
  h.game.tp!.ledger = (e) => ledger.push(e);
  const [A, B] = [h.client("P0", "P0", "pw", "ua"), h.client("P1", "P1", "pw", "ub")];
  await A.account(0, "Player0"); await B.account(0, "Player1");
  await A.enterRoom(); await B.enterRoom();
  const day = new Date(h.game.clock.time() * 1000).toISOString().slice(0, 10);
  const st = h.state(), acct = (u: string) => h.game.store.accountOfUser(u)!;
  for (const [u, x, k] of [["ua", A0, 1], ["ub", B0, 2]] as const) {
    const a = st.accounts[acct(u)], p = a.profiles["0"];
    p.trunk = x.trunk ?? filler(k); p.bound = {}; p.earned = { duels: x.earned ?? 20 }; p.bind_v = 1;
    if (x.tin) p.econ = { day, duels: 0, wins: 0, pairs: {}, earned: 0, spent: 0, packs: 0, tin: x.tin };
    a.cosmetics = { version: 1, split: 1, merged: 1, owned: [...(x.owned ?? Object.keys(x.copies ?? {}))].sort(), copies: { ...(x.copies ?? {}) },
      pity: {}, sequence: 0, receipts: {}, offers: {} };
  }
  h.game.store.saveRaw(st);
  const ask = async (X: Client, data: Uint8Array, reply: number) => { const n = X.room!.mark(); X.room!.send(0x7000, data); return (await X.room!.wait(reply, n))!; };
  let m = B.room!.mark();
  await ask(A, t(0x7102, be32(B.pid!)), 0x7103);
  await B.room!.wait(0x7104, m);
  const n = A.room!.mark();
  B.room!.send(0x7000, t(0x7105, be32(1)));
  await A.room!.wait(0x7105, n, undefined, 3000);
  for (const X of [A, B]) { await ask(X, t(0x7132), 0x7131); await ask(X, t(0x7101), 0x7133); }
  const wardrobe = (u: string) => h.state().accounts[acct(u)].cosmetics;
  const prof = (u: string) => h.state().accounts[acct(u)].profiles["0"];
  const card = async (X: Client, Y: Client, c: number) => {
    const k = Y.room!.mark(); X.room!.send(0x7000, t(0x7113, be32(c)));
    expect(u32((await Y.room!.wait(0x7116, k))!)).toBe(c); Y.room!.send(0x7000, t(0x7122)); await h.tick(100);
  };
  /** Both press Ready (0x7117) and get the question (0x7118). */
  const ready = async () => {
    const k = A.room!.mark(); A.room!.send(0x7000, t(0x7117, [0])); B.room!.send(0x7000, t(0x7117, [0]));
    await A.room!.wait(0x7118, k);
  };
  const list = (cs: number[]) => [...cs.map((c) => be32(c)), ...new Array(10 - cs.length).fill(be32(-1))];
  const vote = (X: Client, yes = true) => X.room!.send(0x7000, t(0x7119, cat([yes ? 1 : 2], ...list([]), ...list([]))));
  /** Both answer yes: -> the 0x7121 byte (1 done, 0 refused) and each side's chat lines from then. */
  const confirm = async () => {
    const k = A.room!.mark(), j = B.room!.mark();
    vote(A); vote(B);
    const end = (await A.room!.wait(0x7121, k))![0];
    await h.tick(300);
    const chat = (X: Client, i: number) => X.room!.all(0x4402, i).map((d) => cstr(d.subarray(26)));
    return { end, chatA: chat(A, k), chatB: chat(B, j) };
  };
  const set = (u: string, give: { id: string; count: number }[]) => tradeCosmeticsSet(h.game, u, { give }) as any;
  const panels = () => { tradeCosmeticsPanel(h.game, "ua", { on: true }); tradeCosmeticsPanel(h.game, "ub", { on: true }); };
  return { h, A, B, ledger, wardrobe, prof, card, ready, vote, confirm, set, panels, acct, view: (u: string) => tradeCosmeticsInfo(h.game, u) as any };
}

describe("one trade, cards and cosmetics, one commit", () => {
  it("cards + a cosmetic for cosmetics + a card: both move, in a single store commit, and both clients get their bits", async () => {
    const T = await open({ copies: { [COMMON]: 2 } }, { copies: { [RARE]: 3, [DISK]: 1 } });
    T.panels();
    await T.card(T.A, T.B, pc(1)); await T.card(T.B, T.A, pc(2));
    expect(T.set("ua", [{ id: COMMON, count: 1 }]).mine).toEqual([{ id: COMMON, count: 1, item: expect.objectContaining({ id: COMMON, rarity: "common" }) }]);
    expect(T.set("ub", [{ id: RARE, count: 2 }, { id: DISK, count: 1 }]).theirs.map((l: any) => [l.id, l.count])).toEqual([[COMMON, 1]]);
    // A sees B's lines, B sees A's: both sides of the one trade
    expect(T.view("ua").theirs.map((l: any) => [l.id, l.count])).toEqual([[RARE, 2], [DISK, 1]]);
    await T.ready();
    const commit = vi.spyOn(T.h.game.store, "commit");
    const r = await T.confirm();
    expect(r.end).toBe(1);
    const trades = commit.mock.calls.filter(([, accts]) => Object.keys(accts ?? {}).length);
    expect(trades.length).toBe(1);
    expect(Object.keys(trades[0][1]!).sort()).toEqual([T.acct("ua"), T.acct("ub")].sort());
    const [wa, wb] = [T.wardrobe("ua"), T.wardrobe("ub")];
    expect([wa.copies[COMMON], wb.owned.includes(COMMON), wb.copies[COMMON] ?? 0]).toEqual([1, true, 0]);
    expect([wb.copies[RARE], wa.owned.includes(RARE), wa.copies[RARE] ?? 0, wb.copies[DISK], wa.owned.includes(DISK)]).toEqual([1, true, 1, 0, true]);
    expect([T.prof("ua").trunk[pc(2)], T.prof("ub").trunk[pc(1)]]).toEqual([1, 1]);
    // the receiver's character can wear it at once: its ownership bits (and 0x3114 to its game connection, when up)
    const bit = COSMETICS.find((c) => c.id === COMMON)!.variants[0].bit;
    expect(T.prof("ub").pbin).toContain(bit);
    expect(T.ledger).toEqual([expect.objectContaining({ result: "done",
      a: expect.objectContaining({ gave: [pc(1)], cosmetics: [{ id: COMMON, count: 1, rarity: "common" }] }),
      b: expect.objectContaining({ gave: [pc(2)], cosmetics: [{ id: RARE, count: 2, rarity: "rare" }, { id: DISK, count: 1, rarity: "common" }] }) })]);
    expect(T.view("ua")).toMatchObject({ trading: false, last: { result: "done", cosmetics: true } });
  });

  it("cosmetics for cosmetics, no cards at all", async () => {
    const T = await open({ copies: { [COMMON]: 1 } }, { copies: { [RARE]: 1 } });
    T.panels();
    T.set("ua", [{ id: COMMON, count: 1 }]); T.set("ub", [{ id: RARE, count: 1 }]);
    await T.ready();
    expect((await T.confirm()).end).toBe(1);
    expect([T.wardrobe("ua").copies[COMMON], T.wardrobe("ub").copies[RARE], T.wardrobe("ua").owned.includes(RARE), T.wardrobe("ub").owned.includes(COMMON)]).toEqual([0, 0, true, true]);
  });

  it("only spare copies: never the first unlock, never more than the spares", async () => {
    const T = await open({ owned: [COMMON], copies: {} }, {});
    T.panels();
    expect(T.set("ua", [{ id: COMMON, count: 1 }])).toMatchObject({ error: "insufficient-duplicates", spare: 0 });
    expect(T.set("ua", [{ id: "outfit:nonsense", count: 1 }])).toMatchObject({ error: "bad-request", status: 400 });
    expect(T.set("ua", Array.from({ length: 7 }, (_, i) => ({ id: COSMETICS[i].id, count: 1 })))).toMatchObject({ error: "bad-request" });
  });
});

describe("consent: a change resets both confirmations", () => {
  it("at the final question a change withdraws it: both votes and lamps cleared, both clients back to editing; a late yes is dropped", async () => {
    const T = await open({ copies: { [COMMON]: 2 } }, { copies: { [RARE]: 1 } });
    T.panels();
    T.set("ua", [{ id: COMMON, count: 1 }]);
    await T.ready();
    T.vote(T.A); await T.h.tick(100);
    expect(T.view("ub").confirmed).toEqual({ me: false, partner: true });
    const [ka, kb] = [T.A.room!.mark(), T.B.room!.mark()];
    const out = T.set("ub", [{ id: RARE, count: 1 }]);
    expect(out).toMatchObject({ ready: { me: false, partner: false }, confirmed: { me: false, partner: false }, asked: false,
      changed: { by: "me", reset: true } });
    expect(T.view("ua").changed).toMatchObject({ by: "partner", reset: true });
    await T.h.tick(300);
    // 0x7120 2 to both: the 2008 client's "back to editing", as after a No
    for (const [X, k] of [[T.A, ka], [T.B, kb]] as const) {
      expect(X.room!.all(0x7120, k).map((d) => d[0])).toEqual([2]);
      expect(X.room!.all(0x4402, k).map((d) => cstr(d.subarray(26)))).toEqual(["Player1 changed the cosmetics in the trade: both confirmations were reset."]);
    }
    // answers to the withdrawn question (dialogs still up on both screens) arrive late: no votes, nothing ends
    T.vote(T.B); T.vote(T.A); await T.h.tick(200);
    expect(T.ledger).toEqual([]);
    // a new question about the new lines, both say yes: the new lines move
    await T.ready();
    expect((await T.confirm()).end).toBe(1);
    expect([T.wardrobe("ub").owned.includes(COMMON), T.wardrobe("ua").owned.includes(RARE)]).toEqual([true, true]);
  });

  it("like the cards, the lines are locked while only one side pressed Ready", async () => {
    const T = await open({ copies: { [COMMON]: 1 } }, { copies: { [RARE]: 1 } });
    T.panels();
    T.A.room!.send(0x7000, t(0x7117, [0])); await T.h.tick(200);
    expect(T.set("ua", [{ id: COMMON, count: 1 }])).toMatchObject({ error: "ready-me" });
    expect(T.set("ub", [{ id: RARE, count: 1 }])).toMatchObject({ error: "ready-partner" });
    expect(T.view("ub").locked).toBe("ready-partner");
  });
});

describe("atomic refusals: nothing moves, both are told why", () => {
  it("a spare gone by the commit (here: taken out of the ledger) cancels everything, cards too", async () => {
    const T = await open({ copies: { [COMMON]: 1 } }, { copies: { [RARE]: 1 } });
    T.panels();
    await T.card(T.A, T.B, pc(1));
    T.set("ua", [{ id: COMMON, count: 1 }]); T.set("ub", [{ id: RARE, count: 1 }]);
    await T.ready();
    const st = T.h.state(); st.accounts[T.acct("ua")].cosmetics.copies[COMMON] = 0; T.h.game.store.saveRaw(st);
    const before = T.h.state();
    const r = await T.confirm();
    expect(r.end).toBe(0);
    expect(T.h.state().accounts).toEqual(before.accounts);
    const why = "Trade cancelled: a cosmetic in the trade is no longer a spare copy. Nothing was traded.";
    expect([r.chatA, r.chatB]).toEqual([[why], [why]]);
    expect(T.ledger.map((e) => e.result)).toEqual(["cos-missing"]);
    expect(T.view("ub").last).toMatchObject({ result: "cos-missing", text: why });
  });

  it("the giver gate: under 20 rewarded duels a character can't add cosmetics, and a gate failing at the commit moves nothing", async () => {
    const fresh = await open({ earned: 19, copies: { [COMMON]: 1 } }, {});
    fresh.panels();
    expect(fresh.set("ua", [{ id: COMMON, count: 1 }])).toMatchObject({ error: "fresh", min: 20 });
    const T = await open({ copies: { [COMMON]: 1 } }, { copies: { [RARE]: 1 } });
    T.panels();
    T.set("ua", [{ id: COMMON, count: 1 }]); T.set("ub", [{ id: RARE, count: 1 }]);
    await T.ready();
    const st = T.h.state(); st.accounts[T.acct("ua")].profiles["0"].earned = { duels: 5 }; T.h.game.store.saveRaw(st);
    const before = T.h.state().accounts;
    const r = await T.confirm();
    expect([r.end, r.chatA]).toEqual([0, ["Trade cancelled: a character can give cards or cosmetics after 20 rewarded duels."]]);
    expect(T.h.state().accounts).toEqual(before);
  });

  it("the intake cap counts a cosmetic in card units by rarity; an equal swap counts nothing", async () => {
    // B has taken in 25 units today: an Ultra (30) would put it at 55 > 30
    const T = await open({ copies: { [ULTRA]: 1 } }, { tin: 25 });
    T.panels();
    T.set("ua", [{ id: ULTRA, count: 1 }]);
    await T.ready();
    const before = T.h.state().accounts;
    const r = await T.confirm();
    expect(r.end).toBe(0);
    expect(r.chatB).toEqual(["Trade cancelled: an account can take in at most 30 more card units than it gives a day through trades (a cosmetic counts 2 to 30 by rarity)."]);
    expect(T.h.state().accounts).toEqual(before);
    expect(T.ledger[0]).toMatchObject({ result: "cap", a: { cosmetics: [{ id: ULTRA, count: 1, rarity: "ultra" }] } });
    // at 29 units: a Common (2) for 2 cards is balanced and goes through, the counter unchanged
    const S = await open({ copies: { [COMMON]: 1 } }, { tin: 29 });
    S.panels();
    await S.card(S.B, S.A, pc(2)); await S.card(S.B, S.A, pc(2));
    S.set("ua", [{ id: COMMON, count: 1 }]);
    await S.ready();
    expect((await S.confirm()).end).toBe(1);
    expect([S.prof("ub").econ.tin, S.prof("ua").econ?.tin ?? 0]).toEqual([29, 0]);
    // and a one-way Rare adds its 5 units to the receiver's day
    const U = await open({ copies: { [RARE]: 1 } }, {});
    U.panels(); U.set("ua", [{ id: RARE, count: 1 }]); await U.ready();
    expect((await U.confirm()).end).toBe(1);
    expect(U.prof("ub").econ.tin).toBe(COSMETIC_UNITS.rare);
  });
});

describe("never a trade with what a player couldn't see", () => {
  it("no lines unless both games registered the panel; a commit with lines and a panel gone is refused", async () => {
    const T = await open({ copies: { [COMMON]: 1 } }, {});
    tradeCosmeticsPanel(T.h.game, "ua", { on: true });
    expect(T.set("ua", [{ id: COMMON, count: 1 }])).toMatchObject({ error: "partner-no-panel" });
    expect(T.view("ua")).toMatchObject({ panel: { me: true, partner: false }, locked: "partner-no-panel" });
    tradeCosmeticsPanel(T.h.game, "ub", { on: true });
    expect(T.set("ua", [{ id: COMMON, count: 1 }]).error).toBeUndefined();
    tradeCosmeticsPanel(T.h.game, "ub", { on: false });   // B's game no longer shows it (an old client in its place)
    await T.ready();
    const before = T.h.state().accounts;
    const r = await T.confirm();
    expect(r.end).toBe(0);
    expect(r.chatA).toEqual(["Trade cancelled: your trade partner's game can't show cosmetics yet. Nothing was traded."]);
    expect(r.chatB).toEqual(["Trade cancelled: this trade has cosmetics your game can't show. Nothing was traded."]);
    expect(T.h.state().accounts).toEqual(before);
  });

  it("an old client (never registers) still trades cards as before", async () => {
    const T = await open();
    await T.card(T.A, T.B, pc(1));
    await T.ready();
    expect((await T.confirm()).end).toBe(1);
    expect(T.ledger[0].a.cosmetics).toBeUndefined();
  });
});

describe("cancel, disconnect, replays", () => {
  it("a disconnect leaves both ledgers untouched (nothing was escrowed) and the partner's panel says so", async () => {
    const T = await open({ copies: { [COMMON]: 1 } }, { copies: { [RARE]: 1 } });
    T.panels();
    T.set("ua", [{ id: COMMON, count: 1 }]); T.set("ub", [{ id: RARE, count: 1 }]);
    const before = T.h.state().accounts;
    T.A.room!.close(); await T.h.tick(500);
    expect(T.h.game.tp!.isTrading({ pid: T.B.pid } as any)).toBe(false);
    expect(T.h.state().accounts[T.acct("ua")].cosmetics).toEqual(before[T.acct("ua")].cosmetics);
    expect(T.h.state().accounts[T.acct("ub")].cosmetics).toEqual(before[T.acct("ub")].cosmetics);
    expect(T.view("ub")).toMatchObject({ trading: false, last: { result: "cancelled", text: "Your trade partner left the trade. Nothing was traded." } });
    expect(T.ledger).toEqual([]);
  });

  it("the same lines again change nothing (no reset); a vote after the end moves nothing twice", async () => {
    const T = await open({ copies: { [COMMON]: 3 } }, {});
    T.panels();
    const first = T.set("ua", [{ id: COMMON, count: 2 }]);
    await T.ready(); T.vote(T.B); await T.h.tick(100);
    const again = T.set("ua", [{ id: COMMON, count: 2 }]);
    expect([again.replay, again.rev, again.asked, again.confirmed.partner]).toEqual([true, first.rev, true, true]);
    await T.confirm();
    const after = T.h.state().accounts;
    T.vote(T.A); T.vote(T.B); await T.h.tick(300);
    expect(T.h.state().accounts).toEqual(after);
    expect(T.ledger.length).toBe(1);
    expect([T.wardrobe("ua").copies[COMMON], T.wardrobe("ub").copies[COMMON]]).toEqual([1, 1]);
    expect(T.set("ua", [{ id: COMMON, count: 1 }])).toMatchObject({ error: "not-trading" });
  });
});

describe("Free Mode and the route", () => {
  it("a Free Mode session can't use the trade's cosmetics", async () => {
    const T = await open({ copies: { [COMMON]: 1 } }, {});
    T.h.game.hub.sessions.get(T.acct("ua"))!.ext.free = true;
    expect(tradeCosmeticsInfo(T.h.game, "ua")).toMatchObject({ error: "free-mode" });
    expect(T.set("ua", [{ id: COMMON, count: 1 }])).toMatchObject({ error: "free-mode" });
    expect(tradeCosmeticsPanel(T.h.game, "ua", { on: true })).toMatchObject({ error: "free-mode" });
  });

  it("the WorldDO serves /__de/trade/cosmetics[/panel] for the forwarded user only", async () => {
    const T = await open({ copies: { [COMMON]: 1 } }, {});
    const resident = new WorldDO({ blockConcurrencyWhile: () => Promise.resolve() } as any, {} as any) as any;
    resident.srv = T.h.srv; resident.sink = { flush: vi.fn(async () => {}) };
    const call = (path: string, body?: unknown, user = "ua") => resident.fetch(new Request(`https://world.test/__de/${path}`, {
      method: body === undefined ? "GET" : "POST", headers: user ? { "x-de-user": user } : {}, ...(body === undefined ? {} : { body: JSON.stringify(body) }) }));
    expect((await call("trade/cosmetics", undefined, "")).status).toBe(401);
    expect((await (await call("trade/cosmetics/panel", { on: true })).json() as any).panel).toEqual({ me: true, partner: false });
    const refused = await call("trade/cosmetics", { give: [{ id: COMMON, count: 1 }] });
    expect([refused.status, ((await refused.json()) as any).error]).toEqual([409, "partner-no-panel"]);
    await call("trade/cosmetics/panel", { on: true }, "ub");
    const ok = await (await call("trade/cosmetics", { give: [{ id: COMMON, count: 1 }] })).json() as any;
    expect(ok.mine.map((l: any) => l.id)).toEqual([COMMON]);
    expect(((await (await call("trade/cosmetics", undefined, "ub")).json()) as any).theirs.map((l: any) => l.id)).toEqual([COMMON]);
    expect(resident.sink.flush).not.toHaveBeenCalled();
  });
});

// ---- trade_log and the report, on the real migrations
const { DatabaseSync } = createRequire(import.meta.url)("node:sqlite");
function d1(): any {
  const db = new DatabaseSync(":memory:");
  const dir = join(import.meta.dirname, "../migrations");
  for (const f of readdirSync(dir).filter((f) => f.endsWith(".sql")).sort()) db.exec(readFileSync(join(dir, f), "utf8").replaceAll("--> statement-breakpoint", ""));
  const stmt = (sql: string, args: unknown[] = []): any => ({ bind: (...a: unknown[]) => stmt(sql, a),
    all: async () => ({ results: db.prepare(sql).all(...(args as any[])) }), run: async () => db.prepare(sql).run(...(args as any[])) });
  return { prepare: (sql: string) => stmt(sql), raw: db };
}

describe("the anti-alt ledger counts cosmetics", () => {
  it("trade_log keeps a mixed trade's lines (null for a card-only one); the report weighs them in card units", async () => {
    const db = d1();
    const side = (acct: string, gave: number[], cosmetics?: any[]) => ({ acct, slot: 0, name: acct, gave, ...(cosmetics ? { cosmetics } : {}) });
    await recordTrade(db, { at: 1, result: "done", a: side("u:alt", [], [{ id: ULTRA, count: 1, rarity: "ultra" }]), b: side("u:main", []) });
    await recordTrade(db, { at: 2, result: "done", a: side("u:x", [1]), b: side("u:y", [2]) });
    const rows = (await db.prepare("SELECT at, result, a_acct, a_name, a_gave, b_acct, b_name, b_gave, a_cos, b_cos FROM trade_log ORDER BY at").all()).results as TradeRow[];
    expect(rows.map((r) => [r.a_cos, r.b_cos])).toEqual([[JSON.stringify([{ id: ULTRA, count: 1, rarity: "ultra" }]), "[]"], [null, null]]);
    const r = analyse(rows, [], {}, 10_000);
    expect(r.findings).toEqual([expect.objectContaining({ kind: "one_way", from: "u:alt", to: "u:main", net: 30, cosmetics: 1 })]);
    expect(summary(r, "x")).toMatch(/one-way 30 net card units \(1 cosmetic\) u:alt/);
    // relayed: the same Ultra on to a third account within the window is a relay of 30 units
    const relay = analyse([...rows, { ...rows[0], at: 600, a_acct: "u:main", b_acct: "u:third", a_cos: rows[0].a_cos, b_cos: "[]" }], [], {}, 10_000);
    expect(relay.findings.find((f) => f.kind === "relay")).toMatchObject({ from: "u:alt", via: "u:main", to: "u:third", cards: 30, cosmetics: 1 });
  });
});
