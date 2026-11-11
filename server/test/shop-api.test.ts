import { afterEach, describe, expect, it } from "vitest";
import { harness } from "./notes-harness.ts";
import { shopView, shopPurchaseApi, shopPackView } from "../src/game/shop-api.ts";
import * as PP from "../src/game/persist.ts";
import { rowsToState, stateToRows } from "../src/db/project.ts";
import { BODY_WIP_NOTICE, BOX_BODY_NOTICE } from "../src/game/cosmetics-catalog.ts";
import { SHOP_ROTATION, shopBuy, packContents } from "../src/game/shop.ts";
import { SECRET_BOOSTERS, SECRET_WINDOW_S } from "../src/game/secret-packs.ts";
import { cardRarity } from "../src/game/card-rarity.ts";
import { W } from "../src/net/proto.ts";
import SD from "../gamedata/shop.json";

afterEach(() => { PP.setProgression(false); SHOP_ROTATION.forceOn = []; SHOP_ROTATION.forceOff = []; });
async function setup() {
  // These purchase/metadata fixtures exercise Cyber Dragon independently of the schedule.
  if (!SHOP_ROTATION.forceOn.includes(37)) SHOP_ROTATION.forceOn.push(37);
  const h = harness({ players: {} }, { PROGRESSION: "1" });
  const a = h.client("alice", "alice", "pw", "shop-user");
  await a.account(0, "Alice"); await a.enterRoom();
  const view = () => shopView(h.game, "shop-user") as any;
  const p = () => h.state().accounts[h.game.hub.acctOfUser("shop-user")].profiles[0];
  return { h, a, view, p };
}
describe("authenticated HTML card shop", () => {
  it("retains affordable cards while boxed categories cannot be directly purchased", async () => {
    const { view } = await setup();
    const v = view();
    expect(v.wallet).toEqual({ total: 5000, bound: 5000, earned: 0 });
    expect(v.items.find((i: any) => i.kind === 1 && i.param === 1).price).toBe(200);
    expect(v.items.some((i: any) => i.kind === 0 || i.category === "singles")).toBe(false);
    expect(v.items.filter((i: any) => i.kind === 2).every((i: any) => i.category === "accessories")).toBe(true);
  });
  it("discloses every cosmetic box's pool per rarity and its effective, renormalised odds", async () => {
    const boxes = (await setup()).view().cosmeticBoxes;
    expect(boxes.map((b: any) => b.id)).toEqual(["head", "dueldisk", "outfit"]);
    for (const box of boxes) {
      expect(box.available).toBe(true);
      expect(Object.values(box.baseOdds as Record<string, number>).reduce((a, b) => a + b, 0)).toBeCloseTo(100);
      for (const [tier, row] of Object.entries(box.poolByRarity as Record<string, any>)) {
        expect(row.ids).toHaveLength(row.count);
        expect(row.odds).toBe(row.count ? box.baseOdds[tier] : 0);
      }
    }
    const outfit = boxes.find((b: any) => b.id === "outfit");
    expect(outfit.poolByRarity.rare.ids).toEqual(["outfit:black-suit", "outfit:joey"]);
    expect(outfit.poolByRarity.ultra.ids).toEqual(["outfit:yugi", "outfit:marik", "outfit:tea"]);
    expect(boxes.find((b: any) => b.id === "head").poolByRarity.common.ids).toContain("accessory:green-specs");
  });
  it("discloses which bodies can wear each pool item, with the work-in-progress notices", async () => {
    const boxes = (await setup()).view().cosmeticBoxes;
    const items = (box: any) => Object.values(box.poolByRarity as Record<string, any>).flatMap((row: any) => row.items);
    for (const box of boxes) {
      for (const row of Object.values(box.poolByRarity as Record<string, any>)) {
        expect(row.items.map((i: any) => i.id)).toEqual(row.ids);
        expect(row.singleBody).toBe(row.items.filter((i: any) => i.bodies.length === 1).length);
      }
      for (const item of items(box)) {
        expect(item.bodies.length).toBeGreaterThan(0);
        if (item.bodies.length === 2) expect(item.notice).toBeUndefined();
        else expect(item.notice).toBe(BODY_WIP_NOTICE[item.bodies[0] === "male" ? "female" : "male"]);
      }
      expect(box.notice).toBe(box.singleBody ? BOX_BODY_NOTICE : undefined);
    }
    const outfit = boxes.find((b: any) => b.id === "outfit");
    expect(items(outfit).find((i: any) => i.id === "outfit:kaiba")).toMatchObject({ bodies: ["male"], notice: BODY_WIP_NOTICE.female });
    expect(items(outfit).find((i: any) => i.id === "outfit:punk-red")).toMatchObject({ bodies: ["female"], notice: BODY_WIP_NOTICE.male });
    expect(items(outfit).find((i: any) => i.id === "outfit:marik")).toMatchObject({ name: "Rare Hunter Cloak", bodies: ["male", "female"] });
    expect(boxes.find((b: any) => b.id === "dueldisk")).toMatchObject({ singleBody: 0 });
    expect(boxes.find((b: any) => b.id === "dueldisk").notice).toBeUndefined();
  });
  it("retries a purchase across a D1 roundtrip without charging or granting twice", async () => {
    const f = await setup(), v = f.view(), item = v.items.find((i: any) => i.kind === 1 && i.param === 1);
    const body = { itemId: item.id, count: 2, requestId: v.nextRequestId };
    const result = shopPurchaseApi(f.h.game, "shop-user", body) as any;
    expect(result.error).toBeUndefined(); expect(result.wallet.total).toBe(4600);
    expect(result.purchased).toHaveLength(10);
    const before = f.p();
    f.h.game.store.saveRaw(rowsToState(stateToRows(f.h.state())));
    const again = shopPurchaseApi(f.h.game, "shop-user", body) as any;
    expect(again.replayed).toBe(true); expect(again.purchased).toEqual(result.purchased);
    expect(f.p().rec.mp).toBe(before.rec.mp); expect(f.p().trunk).toEqual(before.trunk);
    expect(shopPurchaseApi(f.h.game, "shop-user", { ...body, count: 3 })).toMatchObject({ error: "request-id-conflict" });
    expect(f.p().rec.mp).toBe(before.rec.mp);
  });
  it("refuses every retired single id even with an admin single-price override", async () => {
    const f = await setup(), v = f.view(), before = structuredClone(f.p());
    f.h.game.admin.data.prices.carta = 1;
    // The legacy catalogue had 60 packs followed by 46 singles.
    for (let itemId = 61; itemId <= 106; itemId++) {
      expect(shopPurchaseApi(f.h.game, "shop-user", { itemId, count: 1, requestId: v.nextRequestId }))
        .toMatchObject({ error: "unavailable-item" });
    }
    expect(f.p()).toEqual(before);
    expect(f.view().items.some((i: any) => i.kind === 0)).toBe(false);
  });
  it("persists payment, card grant and retry receipt as one snapshot", async () => {
    const f = await setup(), v = f.view(), item = v.items.find((i: any) => i.kind === 1 && i.param === 1);
    const states: any[] = [];
    f.h.game.store.onSave = (state) => states.push(structuredClone(state));
    const result = shopPurchaseApi(f.h.game, "shop-user", { itemId: item.id, count: 1, requestId: v.nextRequestId }) as any;
    expect(result.error).toBeUndefined(); expect(states).toHaveLength(1);
    const a = states[0].accounts[f.h.game.hub.acctOfUser("shop-user")];
    expect(a.profiles[0].rec.mp).toBe(4800);
    expect(a.shop_api.receipts[v.nextRequestId].purchased).toHaveLength(5);
  });
  it("rejects unaffordable, invalid and forged purchases without money or inventory loss", async () => {
    const f = await setup(), v = f.view(), pack = v.items.find((i: any) => i.kind === 1 && i.param === 1), before = f.p();
    expect(shopView(f.h.game, "not-a-player")).toMatchObject({ error: "not-in-game" });
    for (const body of [
      { itemId: pack.id, count: 50, requestId: v.nextRequestId },
      { itemId: pack.id, count: 1, requestId: "forged" },
      { itemId: pack.id, count: -1, requestId: v.nextRequestId },
      { itemId: 0x7fffffff, count: 1, requestId: v.nextRequestId },
    ]) expect(shopPurchaseApi(f.h.game, "shop-user", body)).toHaveProperty("error");
    expect(f.p().rec.mp).toBe(before.rec.mp); expect(f.p().trunk).toEqual(before.trunk);
  });
});

it("discloses pack contents, collection ownership, effective odds and fixed decks", async () => {
  const f = await setup();
  const v = shopPackView(f.h.game, "shop-user", "1") as any;
  expect(Object.keys(v).sort()).toEqual(["packId", "itemId", "price", "name", "kind", "size", "slots", "perCard", "perCardMeaning", "cards",
    "collected", "collectedByRarity", "featured", "pulls", "title", "displayName", "group", "season", "art", "description", "rotation"].sort());
  expect(v).toMatchObject({ packId: 1, name: "", kind: "pack", size: 5, slots: [
    { count: 4, guaranteed: null, odds: { N: .7, R: .25, SR: .04, UR: .01 } },
    { count: 1, guaranteed: "R", odds: { R: .75, SR: .2, UR: .05 } },
  ] });
  expect(v.perCardMeaning).toContain("at least one");
  expect(v.perCard.UR).toBeCloseTo(1 - .99 ** 4 * .95);
  expect(v.collected).toEqual({ owned: v.cards.filter((c: any) => c.owned > 0).length, total: v.cards.length });
  const order = ["UR", "SR", "R", "N"];
  for (const [i, c] of v.cards.entries()) {
    expect(Object.keys(c).sort()).toEqual(["passcode", "internalId", "name", "rarity", "owned"].sort());
    expect(c.owned).toBe(Number(f.p().trunk[String(c.passcode)] ?? 0));
    if (i) expect(order.indexOf(c.rarity)).toBeGreaterThanOrEqual(order.indexOf(v.cards[i - 1].rarity));
  }
  const deck = shopPackView(f.h.game, "shop-user", "7001") as any;
  expect(deck).toMatchObject({ kind: "deck", slots: [], size: 45, name: "E-HERO EVOLUTION DECK" });
  for (const id of [null, "", "abc", "0", "1.5", "999999"]) expect(shopPackView(f.h.game, "shop-user", id)).toMatchObject({ error: "unknown-pack" });
  expect(shopPackView(f.h.game, "missing", "1")).toMatchObject({ error: "not-in-game" });
});

describe("the HTML shop's display data", () => {
  it("names every pack from one map, with its art, season, group and rotation", async () => {
    SHOP_ROTATION.forceOn = [32, 37, 48];
    const { view } = await setup();
    const packs = view().items.filter((i: any) => i.kind === 1);
    const by = (n: number) => packs.find((i: any) => i.param === n);
    expect(by(37)).toMatchObject({ title: "Cybernetic Revolution", displayName: "Pack 37 · Cybernetic Revolution", group: "booster",
      season: 4, art: "p07-1-b37.png", rotation: { group: "always", endsAt: null }, size: 5 });
    expect(by(37).description).toBe("A rearranged pack based on the Season 4 Booster “Cybernetic Revolution”.");
    expect(by(1)).toMatchObject({ displayName: "Pack 1 · Thunderstrike", art: "p05-1-f1.png", season: 1 });
    expect(by(32)).toMatchObject({ title: "Anubis' Tomb", art: "p07-1-b32.png", season: 3 });
    expect(by(48)).toMatchObject({ title: "Light of Destruction", art: "p07-1-b48.png", season: 5 });
    expect(by(1002)).toMatchObject({ displayName: "Beginner's Pack 2", group: "beginner", art: "p06-1-b2.png", price: 100 });
    expect(by(8005)).toMatchObject({ displayName: "Arrival of the 4 Emperors", group: "deck", art: "p06-1-e2.png", price: 1000 });
    for (const p of packs) {
      expect(p.displayName).toBeTruthy(); expect(p.art).toMatch(/^p0[5-7]-\d-[a-z]\d+\.png$/);
      expect(p.featured.length).toBeGreaterThan(0); expect(p.featured.length).toBeLessThanOrEqual(3);
      expect(p.collected.total).toBeGreaterThan(0);
    }
    expect(view().collection).toMatchObject({ copies: expect.any(Number), cards: expect.any(Number) });
  });
  it("features the rarest cards, counts the collection per rarity and gives a deck's copies", async () => {
    const f = await setup();
    const v = shopPackView(f.h.game, "shop-user", "37") as any, order = ["UR", "SR", "R", "N"];
    expect(v.featured).toHaveLength(5);
    expect(v.featured[0].rarity).toBe("UR");
    expect(v.cards.find((c: any) => c.passcode === 70095154).name).toBe("Cyber Dragon");   // English, not the Spanish server's
    for (const [i, c] of v.featured.entries()) if (i) expect(order.indexOf(c.rarity)).toBeGreaterThanOrEqual(order.indexOf(v.featured[i - 1].rarity));
    for (const r of order) expect(v.collectedByRarity[r].total).toBe(v.cards.filter((c: any) => c.rarity === r).length);
    expect(v.cards.every((c: any) => !("copies" in c))).toBe(true);
    const deck = shopPackView(f.h.game, "shop-user", "7001") as any;
    expect(deck.cards.reduce((n: number, c: any) => n + c.copies, 0)).toBe(deck.size);
    expect(deck.cards.some((c: any) => c.copies > 1)).toBe(true);
  });
  it("marks the cards a purchase gives for the first time and lists the pack's pulls", async () => {
    const f = await setup(), v = f.view(), item = v.items.find((i: any) => i.kind === 1 && i.param === 37);
    const had = new Set(Object.keys(f.p().trunk ?? {}).filter((k) => f.p().trunk[k] > 0).map(Number));
    const out = shopPurchaseApi(f.h.game, "shop-user", { itemId: item.id, count: 10, requestId: v.nextRequestId }) as any;
    expect(out.purchased).toHaveLength(50);
    const seen = new Set<number>();
    for (const c of out.purchased) { expect(c.isNew).toBe(!had.has(c.passcode) && !seen.has(c.passcode)); seen.add(c.passcode); }
    expect(out.wallet.total).toBe(3000);
    const pulls = (shopPackView(f.h.game, "shop-user", "37") as any).pulls;
    expect(pulls).toHaveLength(1);
    expect(pulls[0]).toMatchObject({ count: 10, at: expect.any(Number) });
    expect(pulls[0].cards.map((c: any) => c.passcode)).toEqual(out.purchased.map((c: any) => c.passcode));
  });
});

describe("secret packs and binding in the shop", () => {
  const acct = (f: any) => f.h.game.hub.acctOfUser("shop-user");
  const edit = (f: any, fn: (p: any) => void) => { const st = f.h.state(); fn(st.accounts[acct(f)].profiles[0]); f.h.game.store.saveRaw(st); };
  const now = (f: any) => Math.floor(f.h.game.clock.time());
  const sum = (o: Record<string, number> = {}) => Object.values(o).reduce((a, b) => a + b, 0);
  afterEach(() => { SHOP_ROTATION.forceOn = []; SHOP_ROTATION.forceOff = []; });
  it("GET /__de/shop lists the player's running keys as unlocked", async () => {
    const f = await setup();
    expect(f.view().unlocked).toEqual({});
    edit(f, (p) => { p.secret_packs = { unlocked: { 43: now(f) + 3600, 41: now(f) - 5 }, freeClaimed: {} }; });
    expect(f.view().unlocked).toEqual({ 43: now(f) + 3600 });
  });
  it("a rotated-out booster is on sale only with its key: catalogue, pack view, HTML and native purchase agree", async () => {
    SHOP_ROTATION.forceOn = [43];
    const f = await setup(), before = f.view(), item43 = before.items.find((i: any) => i.kind === 1 && i.param === 43);
    SHOP_ROTATION.forceOff = [43];
    const v = f.view();
    expect(v.items.some((i: any) => i.kind === 1 && i.param === 43)).toBe(false);
    // item ids never shift: every other item keeps its id
    expect(v.items.map((i: any) => i.id)).toEqual(before.items.filter((i: any) => i.id !== item43.id).map((i: any) => i.id));
    expect(shopPackView(f.h.game, "shop-user", "43")).toMatchObject({ error: "unknown-pack" });
    expect(shopPurchaseApi(f.h.game, "shop-user", { itemId: item43.id, count: 1, requestId: v.nextRequestId })).toMatchObject({ error: "unavailable-item" });
    const sent: [number, Uint8Array][] = [], conn = { send: (id: number, d: Uint8Array) => sent.push([id, d]) } as any;
    f.h.game.withCtx(f.h.game.hub.sessions.get(acct(f))!, () => shopBuy(f.h.game, conn, new W().u32(item43.id).u8(1).bytes()));
    expect(sent.find(([id]) => id === 0x5211)![1][3]).toBe(1);   // refused natively too
    expect(f.p().rec.mp).toBe(5000);
    edit(f, (p) => { p.secret_packs = { unlocked: { 43: now(f) + 600 }, freeClaimed: {} }; });
    const w = f.view();
    expect(w.items.find((i: any) => i.param === 43)).toMatchObject({ id: item43.id, price: 200 });
    expect(w.unlocked).toEqual({ 43: now(f) + 600 });
    expect(shopPackView(f.h.game, "shop-user", "43")).toMatchObject({ packId: 43, itemId: item43.id });
    expect(shopPurchaseApi(f.h.game, "shop-user", { itemId: item43.id, count: 1, requestId: w.nextRequestId })).toMatchObject({ purchased: expect.any(Array) });
    expect(f.p().rec.mp).toBe(4800);
  });
  it("permanent shelves stay on sale", async () => {
    const f = await setup(), packs = f.view().items.filter((i: any) => i.kind === 1).map((i: any) => i.param);
    expect(packs).toEqual(expect.arrayContaining([1, 14, 1001, 1002, 1003, 7001, 8006]));
  });
  it("a paid ordinary booster's SR / UR pulls unlock every booster holding them, for 24 h", async () => {
    const f = await setup(), v = f.view(), item = v.items.find((i: any) => i.kind === 1 && i.param === 37);
    const out = shopPurchaseApi(f.h.game, "shop-user", { itemId: item.id, count: 10, requestId: v.nextRequestId }) as any;
    const keys = out.purchased.map((c: any) => c.passcode).filter((pc: number) => ["SR", "UR"].includes(cardRarity(pc) ?? ""));
    const iid = SD.iid as Record<string, number[]>;
    const want = SECRET_BOOSTERS.filter((id) => keys.some((pc: number) => iid[String(id)].includes(pc))).sort((a, b) => a - b);
    expect(Object.keys(out.unlocked).map(Number).sort((a, b) => a - b)).toEqual(want);
    for (const id of want) expect(out.unlocked[id]).toBe(now(f) + SECRET_WINDOW_S);
    if (keys.length) expect(want).toContain(37);
  });
  it("Beginner's packs and structure decks give no keys", async () => {
    const f = await setup();
    edit(f, (p) => { p.rec.mp = 20000; });
    for (const param of [1001, 1002, 1003, 7001]) {
      const v = f.view(), item = v.items.find((i: any) => i.kind === 1 && i.param === param);
      expect(shopPurchaseApi(f.h.game, "shop-user", { itemId: item.id, count: param === 7001 ? 1 : 10, requestId: v.nextRequestId })).toHaveProperty("purchased");
    }
    expect(f.view().unlocked).toEqual({});
    expect(f.p().secret_packs?.unlocked ?? {}).toEqual({});
  });
  it("structure decks and Beginner's packs bind every copy, paid with earned MP too; boosters bought with earned MP don't", async () => {
    const f = await setup();
    edit(f, (p) => { p.rec.mp = 10000; p.mp_wallet = { version: 1, bound: 0 }; });
    expect(f.view().wallet).toEqual({ total: 10000, bound: 0, earned: 10000 });
    const buy = (param: number) => {
      const v = f.view(), item = v.items.find((i: any) => i.kind === 1 && i.param === param);
      const b0 = { ...(f.p().bound ?? {}) }, t0 = { ...(f.p().trunk ?? {}) };
      const out = shopPurchaseApi(f.h.game, "shop-user", { itemId: item.id, count: 1, requestId: v.nextRequestId }) as any;
      expect(out.error).toBeUndefined();
      const p = f.p(), d = (o: any, o0: any) => Object.fromEntries(Object.keys(o ?? {}).map((k) => [k, (o[k] ?? 0) - (o0[k] ?? 0)]).filter(([, n]) => n));
      return { gained: d(p.trunk, t0), bound: d(p.bound, b0), out };
    };
    const deck = buy(7001);
    expect(sum(deck.gained)).toBe(packContents(7001)!.cards.length);
    expect(deck.bound).toEqual(deck.gained);
    const beginner = buy(1001);
    expect(sum(beginner.gained)).toBe(5);
    expect(beginner.bound).toEqual(beginner.gained);
    const booster = buy(1);
    expect(sum(booster.gained)).toBe(5);
    expect(booster.bound).toEqual({});
    expect(f.view().wallet.total).toBe(10000 - 1000 - 100 - 200);
  });
});


describe("scheduled rotation at the purchase boundary", () => {
  it("publishes only the current theme and denies stale native/HTML carts after a swap, while Secret Packs bypass both", async () => {
    const f = await setup();
    let time = Date.parse(SHOP_ROTATION.epoch) / 1000;
    f.h.game.clock.time = () => time;
    const before = f.view(), pack = before.items.find((i: any) => i.param === 46);
    expect(before.update).toEqual({ index: 0, theme: "2008 Meta Showcase", blurb: SHOP_ROTATION.themes[0].blurb,
      endsAt: new Date((Date.parse(SHOP_ROTATION.epoch) / 1000 + SHOP_ROTATION.updateDays * 86400) * 1000).toISOString(), highlighted: [48, 47, 46] });
    expect(before.nextUpdateAt).toBe(before.update.endsAt);
    expect(typeof before.nextUpdate).toBe("number");
    expect(before.nextTheme).toBeUndefined();
    expect(pack.rotation).toMatchObject({ highlighted: true, endsAt: before.update.endsAt });
    time += SHOP_ROTATION.updateDays * 86400;
    expect(f.view().items.some((i: any) => i.param === 46)).toBe(false);
    expect(shopPurchaseApi(f.h.game, "shop-user", { itemId: pack.id, count: 1, requestId: before.nextRequestId })).toMatchObject({ error: "unavailable-item" });
    const native = () => {
      const sent: [number, Uint8Array][] = [];
      const conn = { send: (id: number, data: Uint8Array) => sent.push([id, data]) } as any;
      const acct = f.h.game.hub.acctOfUser("shop-user");
      f.h.game.withCtx(f.h.game.hub.sessions.get(acct)!, () => shopBuy(f.h.game, conn, new W().u32(pack.id).u8(1).bytes()));
      return sent.find(([id]) => id === 0x5211)![1][3];
    };
    expect(native()).toBe(1); expect(f.p().rec.mp).toBe(5000);
    const st = f.h.state(), acct = f.h.game.hub.acctOfUser("shop-user");
    st.accounts[acct].profiles[0].secret_packs = { unlocked: { 46: time + 600 }, freeClaimed: {} };
    f.h.game.store.saveRaw(st);
    expect(f.view().items.find((i: any) => i.param === 46)).toMatchObject({ id: pack.id, rotation: { group: "out", highlighted: false } });
    expect(native()).toBe(0);
    expect(shopPurchaseApi(f.h.game, "shop-user", { itemId: pack.id, count: 1, requestId: f.view().nextRequestId })).toHaveProperty("purchased");
    expect(f.p().rec.mp).toBe(4600);
    time += 600;
    expect(native()).toBe(1);
    expect(shopPurchaseApi(f.h.game, "shop-user", { itemId: pack.id, count: 1, requestId: f.view().nextRequestId })).toMatchObject({ error: "unavailable-item" });
  });
});
