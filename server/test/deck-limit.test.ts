import { afterEach, expect, it } from "vitest";
import { harness } from "./notes-harness.ts";
import { shopView, shopPackView, shopPurchaseApi } from "../src/game/shop-api.ts";
import { shopBuy, shopCatalog, packContents } from "../src/game/shop.ts";
import * as PP from "../src/game/persist.ts";
import { W } from "../src/net/proto.ts";
import { rowsToState, stateToRows } from "../src/db/project.ts";
afterEach(() => PP.setProgression(false));
async function setup() {
  const h = harness({ players: {} }, { PROGRESSION: "1" });
  const a = h.client("alice", "alice", "pw", "shop-user");
  await a.account(0, "Alice"); await a.enterRoom();
  const s = () => h.game.hub.sessions.get(h.game.hub.acctOfUser("shop-user"))!;
  const view = () => shopView(h.game, "shop-user") as any;
  const item = (param: number) => view().items.find((i: any) => i.kind === 1 && i.param === param);
  const p = () => h.state().accounts[s().acct].profiles[s().slot!];
  const buy = (param: number, count = 1) => shopPurchaseApi(h.game, "shop-user", { itemId: item(param).id, count, requestId: view().nextRequestId }) as any;
  const native = (...rows: [number, number][]) => {
    const sent: [number, Uint8Array][] = [], w = new W();
    for (const [param, count] of rows) w.u32(item(param).id).u8(count);
    h.game.withCtx(s(), () => shopBuy(h.game, { send: (id: number, data: Uint8Array) => sent.push([id, data]) } as any, w.bytes()));
    return sent.find(([id]) => id === 0x5211)![1][3];
  };
  const secondCharacter = () => {
    const st = h.state(), account = st.accounts[s().acct];
    account.profiles[1] = PP.blankProfile("Other");
    account.profiles[1].rec.mp = 5000;
    account.active_slot = 1;
    h.game.store.saveRaw(st);
    s().slot = 1;
  };
  return { h, a, s, view, item, p, buy, native, secondCharacter };
}
it("HTML deck purchases persist once-only ownership and expose both views", async () => {
  const f = await setup(), balance = f.p().rec.mp;
  expect(f.item(7001).purchased).toBe(false);
  for (const product of f.view().items.filter((i: any) => i.kind === 1 && packContents(i.param)?.kind === "deck")) {
    expect(product.purchased).toBe(false);
    expect(shopPackView(f.h.game, "shop-user", String(product.param))).toMatchObject({ purchased: false });
  }
  expect(shopPackView(f.h.game, "shop-user", "7001")).toMatchObject({ purchased: false });
  expect(f.buy(7001, 2)).toMatchObject({ error: "invalid-purchase", status: 400 });
  expect(f.p().rec.mp).toBe(balance);
  expect(f.buy(7001).error).toBeUndefined();
  expect(f.p().shop_decks).toContain(7001);
  f.h.game.store.saveRaw(rowsToState(stateToRows(f.h.state())));
  const before = structuredClone(f.p());
  expect(f.buy(7001)).toMatchObject({ error: "already-owned-deck", status: 409 });
  expect(f.native([7001, 1])).toBe(1);
  expect(f.p()).toEqual(before);
  expect(f.item(7001).purchased).toBe(true);
  expect(shopPackView(f.h.game, "shop-user", "7001")).toMatchObject({ purchased: true });
  const catalog = f.h.game.withCtx(f.s(), () => shopCatalog(f.h.game));
  expect(catalog.some((r) => new DataView(r.buffer, r.byteOffset).getUint32(5) === 7001)).toBe(false);
});
it("native refuses multiple counts and duplicate rows atomically, then allows exactly one", async () => {
  const f = await setup(), before = structuredClone(f.p());
  expect(f.native([8006, 2])).toBe(1);
  expect(f.native([1, 1], [8006, 1], [8006, 1])).toBe(1);
  expect(f.p()).toEqual(before);
  expect(f.native([8006, 1])).toBe(0);
  expect(f.p().shop_decks).toContain(8006);
  const after = structuredClone(f.p());
  expect(f.native([8006, 1])).toBe(1);
  expect(f.buy(8006)).toMatchObject({ error: "already-owned-deck", status: 409 });
  expect(f.p()).toEqual(after);
});
it("beginner packs and boosters still allow repeated purchases and multiple copies", async () => {
  const f = await setup();
  for (const param of [1001, 1002, 1003, 1]) {
    expect(f.buy(param, 2).purchased).toHaveLength(10);
    expect(f.native([param, 2])).toBe(0);
  }
});
it("starter ownership and purchases are independent per character", async () => {
  const f = await setup(), st = f.h.state();
  st.accounts[f.s().acct].profiles[0].starter = 7001;
  f.h.game.store.saveRaw(st);
  expect(f.buy(7001)).toMatchObject({ error: "already-owned-deck" });
  expect(f.buy(8006).error).toBeUndefined();
  f.secondCharacter();
  expect(f.item(7001).purchased).toBe(false);
  expect(f.item(8006).purchased).toBe(false);
  expect(f.native([8006, 1])).toBe(0);
  expect(f.buy(8006)).toMatchObject({ error: "already-owned-deck" });
});
it("legacy receipts are recovered only when their character is unambiguous", async () => {
  const f = await setup(), deck = f.item(7001), st = f.h.state();
  st.accounts[f.s().acct].shop_api.receipts.legacy = { itemId: deck.id, count: 1, purchased: [{ passcode: 1 }] };
  f.h.game.store.saveRaw(st);
  expect(f.buy(7001)).toMatchObject({ error: "already-owned-deck" });
  f.secondCharacter();
  expect(f.item(7001).purchased).toBe(false);
});
