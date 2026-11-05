// py yo2srv/tienda/* + research/avatar shop notes (B33 cart, B04 78 entries per 0x5212, B40 «new», B68 deck recipes,
// B69 clothes (now withdrawn: cosmetic boxes only), B71 prize packs not sold) -> src/game/shop.ts.
import { afterEach, describe, expect, it, vi } from "vitest";
import * as PP from "../src/game/persist.ts";
import { WEARABLE_AVATAR_SLOTS } from "../src/game/shop.ts";
import LD from "../gamedata/lobby.json";
import { harness, be32, cat, i32, pc, u32, type Client, type Harness } from "./notes-harness.ts";

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
  it("later boosters 46–48 are listed and can be purchased", async () => {
    const [, A, items] = await setup();
    for (const pid of [46, 47, 48]) {
      const item = items.find((i) => i.kind === 1 && i.prm === pid);
      expect(item, `booster ${pid}`).toBeDefined();
      expect(item!.cost).toBe(200);
      const r = await buy(A, cart([item!.iid, 1]));
      expect(r.r5211).toBe(0);
      expect(r.ents).toHaveLength(5);
      expect(r.ents.every((e) => e.card > 0)).toBe(true);
    }
  });

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
    setProf(h, (p) => { p.trunk = { [pc(1)]: 1 }; });
    const c1 = items.find((i) => i.kind === 0 && i.prm === pc(1))!, c2 = items.find((i) => i.kind === 0 && i.prm === pc(2))!;
    const r = await buy(A, cart([c1.iid, 1], [c2.iid, 2]));
    expect(r.ents.map((e) => [e.card, e.nw])).toEqual([[pc(1), 0], [pc(2), 1], [pc(2), 0]]);
    expect(prof(h).trunk).toEqual({ [pc(1)]: 2, [pc(2)]: 2 });
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
});

// Wearables (outfits incl. Duel Academy, hair, face marks, glasses, duel disks) come only from cosmetic boxes.
describe("shop: wearables withdrawn, catalogue ids reserved", () => {
  const ROWS = LD.avatar_pbin as unknown as Record<string, [number, number, number, number, number, number]>;
  // The 2008 avatar catalogue in its iid order (shop.ts avatarShopItems): every non-default boy/girl part of slots 1-9.
  const avatarRows = Object.entries(ROWS).map(([id, row]) => [Number(id), row] as const).sort(([a], [b]) => a - b)
    .filter(([, [val, dflt, kind, slot]]) => [1, 2].includes(kind) && slot >= 1 && slot <= 9 && !dflt
      && !([2, 9].includes(slot) && val === 0x20));
  // The packs and single cards, by iid 1.., exactly as listed before the withdrawal.
  const PACK_IDS = [...Array.from({ length: 45 }, (_, i) => i + 1), 1001, 1002, 1003, 7001, 7003, 7005, 8001, 8002, 8003,
    8004, 8005, 8006, 46, 47, 48];
  const CARD_IDS = [67105242, 17535588, 15480588, 53153481, 49587396, 25109950, 50122883, 62403074, 12436646, 86164529,
    95132338, 85639257, 97360116, 81933259, 99597615, 126218, 28725004, 81863068, 26725158, 58775978, 48365709, 43434803,
    77568553, 48305365, 68870276, 91869203, 77622396, 95174353, 14708569, 17881964, 6368038, 6368039, 30606547, 87564352,
    52675689, 89494469, 50287060, 31339260, 36151751, 10262698, 22610082, 48948935, 76714458, 10449150, 73578229, 68811206];
  const FIRST_AVATAR_IID = PACK_IDS.length + CARD_IDS.length + 1;
  const oldIid = (bit: number) => FIRST_AVATAR_IID + avatarRows.findIndex(([b]) => b === bit);

  it("no wearable (or any avatar part) is in the catalogue", async () => {
    const [, , items] = await setup();
    expect(items.filter((i) => i.kind === 2)).toEqual([]);
    expect([...WEARABLE_AVATAR_SLOTS].sort()).toEqual([1, 2, 6, 7, 8, 9]);
    // What used to be sold: the Plaster (slot 2) and the glasses (slot 9); outfits, hair and disks went to boxes earlier.
    for (const bit of [33, 80, 81, 82, 83, 84, 336, 337, 338, 339, 340, 341, 342, 131, 135, 139, 387, 390, 7, 177, 433])
      expect(items.some((i) => i.kind === 2 && i.prm === bit), `PBIN ${bit}`).toBe(false);
  });

  it("packs and single cards keep their catalogue ids; nothing new took a withdrawn id", async () => {
    const [, , items] = await setup();
    expect(items.filter((i) => i.kind === 1).map((i) => [i.iid, i.prm])).toEqual(PACK_IDS.map((pid, i) => [i + 1, pid]));
    expect(items.filter((i) => i.kind === 0).map((i) => [i.iid, i.prm]))
      .toEqual(CARD_IDS.map((cid, i) => [PACK_IDS.length + i + 1, cid]));
    expect(items.some((i) => i.iid >= FIRST_AVATAR_IID && i.iid < FIRST_AVATAR_IID + avatarRows.length)).toBe(false);
    expect(avatarRows.length).toBeGreaterThan(0);
  });

  it("a stale cart naming only withdrawn ids is refused and costs nothing", async () => {
    const [h, A] = await setup();
    setProf(h, (p) => { p.rec.mp = 20000; });
    const before = structuredClone(prof(h));
    // Plaster, Sunglasses, Bakura's Eyepatch (boy), Academy Tracksuit (boy and girl), Jaden's garms
    const stale = [33, 80, 84, 131, 387, 135].map((bit) => [oldIid(bit), 1] as [number, number]);
    expect(stale.every(([iid]) => iid >= FIRST_AVATAR_IID)).toBe(true);
    const r = await buy(A, cart(...stale));
    expect([i32(r.r5212[0]), r.r5211]).toEqual([1, 1]);
    expect(r.ents).toEqual([]);
    expect(prof(h)).toEqual(before);
  });

  it("a withdrawn id in a mixed cart is skipped: only the card is charged and no avatar part is granted", async () => {
    const [h, A, items] = await setup();
    setProf(h, (p) => { p.rec.mp = 20000; });
    const card = items.find((i) => i.kind === 0)!, pbin = [...prof(h).pbin];
    const r = await buy(A, cart([oldIid(80), 1], [card.iid, 1], [oldIid(131), 1]));
    expect(r.r5211).toBe(0);
    expect(r.ents.map((e) => [e.iid, e.kind, e.card])).toEqual([[card.iid, 0, card.prm]]);
    expect(prof(h).rec.mp).toBe(20000 - card.cost);
    expect(prof(h).pbin).toEqual(pbin);
  });

  it("characters keep wearables they already own (bought, prizes, Academy outfits) through purchases and logins", async () => {
    const [h, A, items] = await setup();
    // Plaster, Sunglasses, Pink Specs (girl), Academy Tracksuit and Jaden's garms, Academy Blue 2 (girl), Quiff, a disk
    const owned = [33, 80, 340, 131, 135, 390, 7, 177];
    setProf(h, (p) => { p.rec.mp = 20000; p.pbin = [...new Set([...p.pbin, ...owned])].sort((a, b) => a - b); });
    const pack = items.find((i) => i.kind === 1 && i.prm === 1)!;
    expect((await buy(A, cart([pack.iid, 1]))).r5211).toBe(0);
    await A.account(0);                               // 0x3100 select (cosmetics ledger sync) + 0x3114 PBIN
    for (const bit of owned) expect(PP.pbinTest(prof(h), bit), `PBIN ${bit}`).toBe(true);
    // The appearance editor still accepts them: a boy wearing Plaster, Sunglasses, Jaden's garms and that disk.
    const parts = new Uint8Array(16);
    parts[2] = 33; parts[9] = 80; parts[6] = 135; parts[8] = 177;
    expect(PP.avatarOwned(prof(h), parts)).toBe(true);
    // and the free default parts (Academy Red uniform included) need no ownership
    const dflt = new Uint8Array(16); dflt[6] = 128;
    expect(PP.avatarOwned(PP.blankProfile("x"), dflt)).toBe(true);
  });
});
