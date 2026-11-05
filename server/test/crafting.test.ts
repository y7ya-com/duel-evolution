import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { harness } from "./notes-harness.ts";
import * as PP from "../src/game/persist.ts";
import { craftView, craftOperation, deckNeeds } from "../src/game/crafting.ts";
import { SHARDS, shardValues } from "../src/game/shards-config.ts";
import { cardRarityCatalog, cardRarity } from "../src/game/card-rarity.ts";
import { cardUnits } from "../src/game/trade-units.ts";
import { craftedMove, craftedOffered } from "../src/game/crafted-copies.ts";
import { rowsToState, stateToRows } from "../src/db/project.ts";
import { SHOP_CARDS } from "../src/game/shop.ts";
const byRarity = cardRarityCatalog().byPasscode as Record<string, string>;
const pc = Number(Object.keys(byRarity).find((pc) => byRarity[pc] === "N"));
// the live table, read before any test changes it; the mechanics tests below use the "stingy" numbers they were written in
const SHIPPED_TABLE = SHARDS.table;
beforeEach(() => { SHARDS.table = "stingy"; SHARDS.craftedDismantlable = false; });   // the lock mode, kept as an option
afterEach(() => { PP.setProgression(false); SHARDS.table = SHIPPED_TABLE; SHARDS.craftedTradeable = true; SHARDS.craftedDismantlable = true; SHARDS.tradeRarityWeights = false; SHARDS.secretPacks = true; });
async function setup() {
  const h = harness({ players: {} }, { PROGRESSION: "1" });
  const a = h.client("alice", "alice", "pw", "craft-user");
  await a.account(0, "Alice"); await a.enterRoom();
  const acct = h.game.hub.acctOfUser("craft-user");
  const edit = (fn: (p: any) => void) => { const raw = h.game.store.loadRaw(); fn(raw.accounts[acct].profiles[0]); h.game.store.saveRaw(raw); };
  edit((p) => { p.trunk = { [pc]: 8 }; p.bound = {}; p.shards = 1000; });
  const view = (need = {}) => craftView(h.game, "craft-user", need);
  const op = (action: any, body: any, need = {}) => craftOperation(h.game, "craft-user", action, { requestId: view().nextRequestId, ...body }, need);
  const profile = () => h.state().accounts[acct].profiles[0];
  return { h, a, acct, edit, view, op, profile };
}
describe("shard crafting", () => {
  it("centralizes both owner tables and every tier loses value on recrafting", () => {
    expect(SHIPPED_TABLE).toBe("economic");
    SHARDS.table = "economic";
    expect(shardValues()).toEqual({ craft: { N: 5, R: 20, SR: 450, UR: 1500 }, dismantle: { N: 1, R: 2, SR: 150, UR: 500 } });
    for (const r of ["SR", "UR"] as const) expect(shardValues().craft[r]).toBe(3 * shardValues().dismantle[r]);   // 3 dismantles = 1 craft
    expect(shardValues().craft.UR / shardValues().dismantle.N).toBeGreaterThanOrEqual(1000);   // LOADS of Normals per UR
    SHARDS.table = "proposed";
    expect(shardValues().craft).toEqual({ N: 15, R: 40, SR: 100, UR: 300 });
    for (const table of Object.values(SHARDS.tables)) for (const r of ["N", "R", "SR", "UR"] as const) expect(table.dismantle[r]).toBeLessThan(table.craft[r]);
  });
  it("dismantles ordinary trade receipts but refuses all bound copies including structure copies", async () => {
    const f = await setup();
    f.edit((p) => { p.bound = { [pc]: 7 }; });
    expect(f.op("dismantle", { passcode: pc, count: 2 })).toMatchObject({ error: "not-dismantlable" });
    expect(f.op("dismantle", { passcode: pc, count: 1 })).toMatchObject({ shardDelta: 1 });
    expect(f.op("dismantle", { passcode: pc, count: 1 })).toMatchObject({ error: "not-dismantlable" });
    f.edit((p) => PP.trunkAdd(null, p, [pc], 1, "intercambio"));
    expect(f.op("dismantle", { passcode: pc, count: 1 })).toMatchObject({ shardDelta: 1 });
  });
  it("lets crafted copies be dismantled by default, at a loss (3 dismantles pay 1 craft)", async () => {
    SHARDS.craftedDismantlable = true;
    const f = await setup(); f.edit((p) => { p.trunk = {}; p.bound = {}; p.crafted = {}; });
    const made = f.op("make", { passcode: pc, count: 1 }) as any, back = f.op("dismantle", { passcode: pc, count: 1 }) as any;
    expect(made.shardDelta).toBeLessThan(0); expect(back.shardDelta).toBeGreaterThan(0);
    expect(made.shardDelta + back.shardDelta).toBeLessThan(0);
  });
  it("caps crafts at three, including bound copies, and supports soulbound or transferable locked crafts", async () => {
    const f = await setup(); f.edit((p) => { p.trunk = { [pc]: 2 }; p.bound = { [pc]: 2 }; });
    expect(f.op("make", { passcode: pc, count: 2 })).toMatchObject({ error: "copy-cap" });
    expect(f.op("make", { passcode: pc, count: 1 })).toMatchObject({ shardDelta: -20 });
    expect(f.profile().bound[pc]).toBe(2); expect(f.profile().crafted[pc]).toBe(1);
    expect(f.op("dismantle", { passcode: pc, count: 1 })).toHaveProperty("error");
    SHARDS.craftedTradeable = false;
    f.edit((p) => { p.trunk = {}; p.bound = {}; p.crafted = {}; });
    f.op("make", { passcode: pc, count: 1 }); expect(f.profile().bound[pc]).toBe(1);
  });
  it("keeps a crafted copy locked across trades without locking ordinary received cards", () => {
    const a: any = { crafted: { [pc]: 2 } }, b: any = {};
    const give = craftedOffered(a, [pc, pc, pc]); expect(give).toEqual([pc, pc]);
    craftedMove(a, give, []); craftedMove(b, [], give);
    expect(a.crafted).toEqual({}); expect(b.crafted[pc]).toBe(2);
  });
  it("a real trade commit transfers crafted locks and leaves ordinary received copies dismantlable", async () => {
    const f = await setup(), b = f.h.client("bob", "bob", "pw", "craft-bob");
    await b.account(0, "Bob"); await b.enterRoom();
    const raw = f.h.game.store.loadRaw(), other = f.h.game.hub.acctOfUser("craft-bob");
    const ur = Number(Object.keys(byRarity).find((pc) => byRarity[pc] === "UR"));
    for (const acct of [f.acct, other]) Object.assign(raw.accounts[acct].profiles[0], { trunk: { [pc]: 40 }, bound: {}, earned: { duels: 20 } });
    raw.accounts[f.acct].profiles[0].trunk[ur] = 2;
    raw.accounts[f.acct].profiles[0].crafted = { [ur]: 1 };
    f.h.game.store.saveRaw(raw);
    const aSession = f.h.game.hub.sessions.get(f.acct)!, bSession = f.h.game.hub.sessions.get(other)!;
    const trade = { a: aSession, b: bSession, offer: new Map([[aSession.pid, [ur, ur]], [bSession.pid, []]]),
      cos: new Map([[aSession.pid, []], [bSession.pid, []]]) };
    expect((f.h.game.tp as any).check(trade)).toBe("done");
    const receiver = f.h.state().accounts[other].profiles[0];
    expect(receiver.crafted[ur]).toBe(1); expect(receiver.bound[ur]).toBeUndefined();
    const v = craftView(f.h.game, "craft-bob"); expect(v.cards[ur].dismantlable).toBe(1);
    expect(craftOperation(f.h.game, "craft-bob", "dismantle", { passcode: ur, count: 2, requestId: v.nextRequestId }).error).toBe("not-dismantlable");
    expect(craftOperation(f.h.game, "craft-bob", "dismantle", { passcode: ur, count: 1, requestId: v.nextRequestId }).shardDelta).toBe(150);
  });
  it("crafts unlock keys and bound first-craft packs in the same durable receipt without duplicate free grants", async () => {
    const f = await setup();
    const data = await import("../gamedata/shop.json");
    const pools = data.default.iid as Record<string, number[]>;
    const sr = Object.entries(pools).filter(([id]) => Number(id) < 1000).flatMap(([, cards]) => cards).find((c) => cardRarity(c) === "SR")!;
    f.edit((p) => { p.trunk = {}; });
    const requestId = f.view().nextRequestId, body = { passcode: sr, count: 1, requestId };
    const result = f.op("make", body);
    expect(result.secret.freePacks.length).toBeGreaterThan(0);
    expect(f.profile().crafted[sr]).toBe(1);
    const before = f.profile(); f.h.game.store.saveRaw(rowsToState(stateToRows(f.h.state())));
    expect(f.op("make", body)).toMatchObject({ replayed: true, secret: result.secret });
    expect(f.profile()).toEqual(before);
  });
  it("persists one atomic wallet/inventory/audit/receipt snapshot and replays across D1 roundtrips", async () => {
    const f = await setup(), requestId = f.view().nextRequestId, snapshots: any[] = [];
    f.h.game.store.onSave = (st) => snapshots.push(structuredClone(st));
    const body = { passcode: pc, count: 2, requestId };
    expect(f.op("dismantle", body)).toMatchObject({ shardDelta: 2, replayed: false });
    expect(snapshots).toHaveLength(1);
    f.h.game.store.onSave = null;
    f.h.game.store.saveRaw(rowsToState(stateToRows(f.h.state())));
    expect(f.op("dismantle", body)).toMatchObject({ shardDelta: 2, replayed: true });
    expect(f.profile().shards).toBe(1002); expect(f.profile().shard_audit).toHaveLength(1);
    expect(f.op("dismantle", { ...body, count: 1 })).toMatchObject({ error: "request-id-conflict" });
    expect(f.op("dismantle", { ...body, requestId: "forged" })).toMatchObject({ error: "stale-request" });
  });
  it("previews extras, defaults to keep three, supports keep one and protects the maximum saved-deck need", async () => {
    const f = await setup();
    const need = deckNeeds([{ main: [pc, pc], side: [pc], extra: [pc] }, { main: [pc] }]);
    expect(need[pc]).toBe(4);
    f.view(); const before = f.profile();
    expect(f.op("dismantle-extras", { preview: true }, need)).toMatchObject({ preview: true, changes: { [pc]: 4 }, shardDelta: 4 });
    expect(f.profile()).toEqual(before);
    expect(f.op("dismantle-extras", {}, need)).toMatchObject({ changes: { [pc]: 4 } });
    expect(f.profile().trunk[pc]).toBe(4);
    expect(f.op("dismantle-extras", { keep: 1 })).toMatchObject({ changes: { [pc]: 3 } });
    expect(f.profile().trunk[pc]).toBe(1);
  });
  it("keeps bound copies and rejects invalid, unaffordable and uncraftable operations without mutations", async () => {
    const f = await setup(); f.edit((p) => { p.bound = { [pc]: 6 }; });
    f.op("dismantle-extras", { keep: 1 }); expect(f.profile().trunk[pc]).toBe(6);
    const before = f.profile();
    for (const body of [{ passcode: pc, count: 0 }, { passcode: 501000000, count: 1 }, { passcode: -1, count: 1 }]) expect(f.op("make", body)).toHaveProperty("error");
    expect(f.profile()).toEqual(before);
    f.edit((p) => { p.shards = 0; p.trunk = {}; });
    expect(f.op("make", { passcode: pc, count: 1 })).toMatchObject({ error: "insufficient-shards" });
  });
  it("refuses trade, PvP, NPC and free mode", async () => {
    const f = await setup(), s = f.h.game.hub.sessions.get(f.acct)!;
    const tp = f.h.game.tp, pvp = f.h.game.pvp, duel = f.h.game.duel;
    (f.h.game as any).tp = { inTrade: () => true };
    expect(f.op("dismantle", { passcode: pc, count: 1 })).toMatchObject({ error: "busy" });
    f.h.game.tp = tp;
    (f.h.game as any).pvp = { byPid: () => ({}) };
    expect(f.op("dismantle", { passcode: pc, count: 1 })).toMatchObject({ error: "busy" });
    f.h.game.pvp = pvp;
    (f.h.game as any).duel = { duelState: () => ({ df: { sess: { end: { over: false } } } }) };
    expect(f.op("dismantle", { passcode: pc, count: 1 })).toMatchObject({ error: "busy" });
    f.h.game.duel = duel;
    s.ext.free = true;
    expect(f.view()).toMatchObject({ error: "free-mode" });
  });
  it("preserves shard costs and balances above 32-bit range and refuses unsafe arithmetic atomically", async () => {
    const f = await setup(), original = SHARDS.tables.stingy.craft.N;
    try {
      SHARDS.tables.stingy.craft.N = 5_000_000_000;
      f.edit((p) => { p.trunk = {}; p.shards = 20_000_000_000; });
      expect(f.view().values.craft.N).toBe(5_000_000_000);
      expect(f.op("make", { passcode: pc, count: 1 })).toMatchObject({ shards: 15_000_000_000, shardDelta: -5_000_000_000 });
      f.h.game.store.saveRaw(rowsToState(stateToRows(f.h.state())));
      expect(f.profile().shards).toBe(15_000_000_000);
      f.edit((p) => { p.trunk = { [pc]: 5 }; p.crafted = {}; p.shards = Number.MAX_SAFE_INTEGER; });
      const before = f.profile();
      expect(f.op("dismantle", { passcode: pc, count: 1 })).toMatchObject({ error: "shard-overflow" });
      expect(f.profile()).toEqual(before);
    } finally { SHARDS.tables.stingy.craft.N = original; }
  });
  it("supports weighted trade intake as a switch, defaulting to one per card", () => {
    const pcs = ["N", "R", "SR", "UR"].map((r) => Number(Object.keys(byRarity).find((pc) => byRarity[pc] === r)));
    expect(cardUnits(pcs)).toBe(4); SHARDS.tradeRarityWeights = true; expect(cardUnits(pcs)).toBe(24);
  });
  it("every former single card, including gamedata-only singles, is craftable", async () => {
    const f = await setup(), cards = f.view().cards;
    expect(SHOP_CARDS).toHaveLength(46);
    for (const pc of SHOP_CARDS) expect(cards[pc]?.craftable, `former single ${pc}`).toBe(true);
  });
});
