import { afterEach, describe, expect, it } from "vitest";
import { harness } from "./notes-harness.ts";
import { shopView, shopPurchaseApi } from "../src/game/shop-api.ts";
import * as PP from "../src/game/persist.ts";
import { rowsToState, stateToRows } from "../src/db/project.ts";

afterEach(() => PP.setProgression(false));
async function setup() {
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
    expect(v.items.some((i: any) => i.category === "singles" && i.internalId > 0 && i.rarity)).toBe(true);
    expect(v.items.filter((i: any) => i.kind === 2).every((i: any) => i.category === "accessories")).toBe(true);
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
