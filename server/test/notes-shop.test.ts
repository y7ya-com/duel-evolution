// py yo2srv/tienda/* + research/avatar shop notes (B33 cart, B04 78 entries per 0x5212, B40 «new», B68 deck recipes,
// B69 no 0x5205 for clothes, B71 prize packs not sold) -> src/game/shop.ts.
import { afterEach, describe, expect, it, vi } from "vitest";
import * as PP from "../src/game/persist.ts";
import { harness, be32, cat, i32, u32, type Client, type Harness } from "./notes-harness.ts";

afterEach(() => { vi.useRealTimers(); });

type Item = { iid: number; kind: number; prm: number; cost: number };
async function setup(): Promise<[Harness, Client, Item[]]> {
  const h = harness();
  const A = h.client("A"); await A.account(0, "Alice"); await A.enterRoom();
  const n = A.room!.mark(); A.room!.send(0x5208); await A.room!.wait(0x5214, n);
  expect(A.room!.ids(n)[0]).toBe(0x5213);
  const ds = A.room!.all(0x5209, n);
  expect(ds.every((d) => d.length % 17 === 0 && d.length <= 60 * 17)).toBe(true);
  const items = ds.flatMap((d) => Array.from({ length: d.length / 17 }, (_, i) => {
    const e = d.subarray(17 * i); return { iid: u32(e), kind: e[4], prm: u32(e, 5), cost: u32(e, 9) };
  }));
  return [h, A, items];
}
const prof = (h: Harness) => (Object.values(h.state().accounts)[0] as any).profiles["0"];
const setProf = (h: Harness, f: (p: any) => void) => { const st = h.state(); f((Object.values(st.accounts)[0] as any).profiles["0"]); h.game.store.saveRaw(st); };
const cart = (...rows: [number, number][]) => cat(...rows.map(([iid, n]) => [...be32(iid), n]));
async function buy(A: Client, data: Uint8Array) {
  const n = A.room!.mark(); A.room!.send(0x5210, data); await A.room!.wait(0x5211, n);
  await A.room!.wait(0x4140, n, undefined, 1000);
  const ents = A.room!.all(0x5212, n).flatMap((d) => Array.from({ length: (d.length - 4) / 13 }, (_, i) => {
    const e = d.subarray(4 + 13 * i); return { iid: u32(e), kind: e[4], card: u32(e, 5), nw: e[9] };
  }));
  return { ids: A.room!.ids(n), r5212: A.room!.all(0x5212, n), r5211: i32(A.room!.all(0x5211, n)[0]), ents };
}

describe("shop (tienda.py)", () => {
  it("B71: the prize packs (type 2: 9001 TP3, 9002 Startup Present) are not sold", async () => {
    const [, , items] = await setup();
    const packs = items.filter((i) => i.kind === 1).map((i) => i.prm);
    expect(packs).not.toContain(9001);
    expect(packs).not.toContain(9002);
    expect(packs.length).toBeGreaterThan(0);
  });

  it("B33: 0x5210 is a CART (u32 item + u8 count per row): every row is bought and the total is charged", async () => {
    const [h, A, items] = await setup();
    const card = items.find((i) => i.kind === 0)!, pack = items.find((i) => i.kind === 1 && i.prm < 1000)!;
    const mp0 = prof(h).rec.mp;
    const r = await buy(A, cart([card.iid, 2], [pack.iid, 1]));
    expect(r.r5211).toBe(0);
    expect(r.ents.filter((e) => e.iid === card.iid).length).toBe(2);
    expect(r.ents.filter((e) => e.iid === pack.iid).length).toBe(5);
    expect(prof(h).rec.mp).toBe(mp0 - 2 * card.cost - pack.cost);
  });

  it("B33: all or nothing: a cart over the balance -> 0x5212 s32 1 + 0x5211 s32 1, nothing changes", async () => {
    const [h, A, items] = await setup();
    setProf(h, (p) => { p.rec.mp = 150; });
    const card = items.find((i) => i.kind === 0)!;
    const before = JSON.stringify(prof(h).trunk);
    const r = await buy(A, cart([card.iid, 1], [card.iid + 1, 1]));
    expect([i32(r.r5212[0]), r.r5211]).toEqual([1, 1]);
    expect([prof(h).rec.mp, JSON.stringify(prof(h).trunk)]).toEqual([150, before]);
  });

  it("B04: 0x5212 goes in chunks of ≤ 78 entries (4 + 13·78 = 1018 B), each with its s32 0, one 0x5211 at the end, then 0x4140", async () => {
    const [, A, items] = await setup();
    const pack = items.find((i) => i.kind === 1 && i.prm < 1000)!;
    const r = await buy(A, cart([pack.iid, 20]));
    expect(r.ents.length).toBe(100);
    expect(r.r5212.map((d) => d.length)).toEqual([4 + 13 * 78, 4 + 13 * 22]);
    expect(r.r5212.every((d) => i32(d) === 0)).toBe(true);
    expect(r.ids.filter((x) => x === 0x5211).length).toBe(1);
    expect(r.ids.indexOf(0x4140)).toBeGreaterThan(r.ids.indexOf(0x5211));
  });

  it("B40: each card's u8 «new» is 1 only if the trunk did not have it before this purchase (2nd copy in the same cart: 0)", async () => {
    const [h, A, items] = await setup();
    setProf(h, (p) => { p.trunk = { 1: 1 }; });
    const c1 = items.find((i) => i.kind === 0 && i.prm === 1)!, c2 = items.find((i) => i.kind === 0 && i.prm === 2)!;
    const r = await buy(A, cart([c1.iid, 1], [c2.iid, 2]));
    expect(r.ents.map((e) => [e.card, e.nw])).toEqual([[1, 0], [2, 1], [2, 0]]);
    expect(prof(h).trunk).toEqual({ 1: 2, 2: 2 });
  });

  it("B68: buying a structure deck (type 1 with a PBIN right) sets PBIN[bit + 1] (its recipe in the deck editor); no 0x5205", async () => {
    const [h, A, items] = await setup();
    const decks = items.filter((i) => i.kind === 1 && i.prm >= 7000);
    expect(decks.length).toBeGreaterThan(0);
    const before = new Set<number>(prof(h).pbin);
    const r = await buy(A, cart([decks[0].iid, 1]));
    const added = (prof(h).pbin as number[]).filter((b) => !before.has(b));
    expect(added.length).toBe(1);
    expect(r.ids).not.toContain(0x5205);
  });

  it("B69: clothes (type 2, param = PBIN bit): one unit, the bit saved, no 0x5205 (the client sets it itself)", async () => {
    const [h, A, items] = await setup();
    const cl = items.find((i) => i.kind === 2 && !PP.pbinTest(prof(h), i.prm))!;
    const r = await buy(A, cart([cl.iid, 3]));
    expect(r.ents).toEqual([{ iid: cl.iid, kind: 2, card: cl.prm, nw: 1 }]);
    expect(PP.pbinTest(prof(h), cl.prm)).toBe(true);
    expect(r.ids).not.toContain(0x5205);
  });

  it("B69: a piece of clothing already owned is never bought again", async () => {
    const [h, A, items] = await setup();
    const cl = items.find((i) => i.kind === 2 && !PP.pbinTest(prof(h), i.prm))!;
    await buy(A, cart([cl.iid, 1]));
    const mp = prof(h).rec.mp;
    const r = await buy(A, cart([cl.iid, 1]));
    expect(r.r5211).toBe(1);                          // nothing left in the cart
    expect(prof(h).rec.mp).toBe(mp);
  });
});
