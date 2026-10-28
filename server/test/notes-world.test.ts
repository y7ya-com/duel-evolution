// py yo2srv/mundo/* + research/mundo, research/avatar, research/npcreglas notes (NPC list and spots 06-10, friendship
// chains, V09 parts per world, 07-10 npc_window off, GM accounts and title_owned, My Room's own avatar, 0x5340 P0-4)
// -> src/game/npcs.ts, lobby.ts, persist.ts. The NPC duel itself (npcreglas dp/no_record/card/famous_decks) is duel code.
import { afterEach, describe, expect, it, vi } from "vitest";
import { loadNpcs, nrChainFields, nrThreshold, ORIGINALS } from "../src/game/npcs.ts";
import * as PP from "../src/game/persist.ts";
import { harness, be32, cat, cstr, i32, u16, u32, type Client, type Harness } from "./notes-harness.ts";

afterEach(() => { vi.useRealTimers(); });

const AREA_BASE: Record<number, number> = { 4: 1, 5: 9, 6: 17, 7: 25, 0: 33, 1: 41, 2: 49, 3: 57 };

async function npcList(A: Client): Promise<Uint8Array[]> {
  const n = A.room!.mark(); A.room!.send(0x4230); await A.room!.wait(0x4233, n);
  const ds = A.room!.all(0x4232, n);
  expect(ds.every((d) => d.length % 61 === 0 && d.length <= 16 * 61)).toBe(true);
  return ds.flatMap((d) => Array.from({ length: d.length / 61 }, (_, i) => d.subarray(61 * i, 61 * i + 61)));
}
const entry = (e: Uint8Array) => ({ id: u32(e), name: cstr(e.subarray(4, 20)), parts: e.subarray(20, 36), thr: u32(e, 45), spot: u32(e, 49), prev: u32(e, 57) });
async function one(h: Harness, kind = 0): Promise<Client> {
  const A = h.client("A"); await A.account(0, "Alice"); await A.enterRoom(kind); return A;
}

describe("NPC list (mundo/npc.py, research/mundo, research/npcreglas)", () => {
  it("research/mundo: 24 DC08 originals placed (6 retired out), no two on one point, each in its area", () => {
    const npcs = loadNpcs(new Map());
    const orig = npcs.filter((n) => n[0] in ORIGINALS);
    expect(orig.length).toBe(24);
    expect(new Set(orig.map((n) => n[2])).size).toBe(24);
    for (const [nid, , spot] of orig) {
      const area = ORIGINALS[nid][1]!;
      expect(spot >= AREA_BASE[area] && spot < AREA_BASE[area] + 8, `${nid}`).toBe(true);
    }
  });

  it("06-10 NPC_SPOTS_2008: Abigail (43) and NiaNia (26) on their points of always (2, 4); Robert (17) in Clock Square (area 0)", () => {
    const spot = new Map(loadNpcs(new Map()).map((n) => [n[0], n[2]]));
    expect([spot.get(43), spot.get(26)]).toEqual([2, 4]);
    expect(spot.get(17)! >= 33 && spot.get(17)! <= 40).toBe(true);
  });

  it("06-10 NPC_SPOTS_2008: the famous NPCs on their 2008 points (Yami Yugi 204, Kaiba 206 …)", () => {
    const spot = new Map(loadNpcs(new Map()).map((n) => [n[0], n[2]]));
    expect([spot.get(51), spot.get(54), spot.get(75), spot.get(84)]).toEqual([204, 206, 214, 209]);
  });

  it("npcreglas friendship: levels 2 and 3 of each famous NPC on the same point", () => {
    const spot = new Map(loadNpcs(new Map()).map((n) => [n[0], n[2]]));
    for (const b of [51, 54, 57, 60, 63, 66, 69, 72, 75, 78, 81, 84]) expect([spot.get(b + 1), spot.get(b + 2)]).toEqual([spot.get(b), spot.get(b)]);
  });

  it("npcreglas: chain_fields 53 / 51 / 17 = (9, 52) / (9, 0) / (10, 0); without the previous in the list 0; Jaden and Alexis 9 wins", () => {
    const ids = new Set(loadNpcs(new Map()).map((n) => n[0]));
    expect([nrChainFields(53, ids), nrChainFields(51, ids), nrChainFields(17, ids)]).toEqual([[9, 52], [9, 0], [10, 0]]);
    expect(nrChainFields(52, new Set([52]))).toEqual([9, 0]);
    expect([nrThreshold(60), nrThreshold(68)]).toEqual([10, 10]);
  });

  it("0x4230 -> 0x4231 s32 0, 0x4232 × N (61 B entries, ≤ 16 per message), 0x4233; the threshold and previous ride in each entry", async () => {
    const h = harness();
    const A = await one(h);
    const es = (await npcList(A)).map(entry);
    expect(es.length).toBe(h.game.npcs.length);
    const e53 = es.find((e) => e.id === 53)!;
    expect([e53.thr, e53.prev, e53.spot]).toEqual([9, 52, 204]);
  });

  it("V09: a normal NPC's parts are valid in the world of whoever asks (Domino clothes 0x7x, Academia 0x8x)", async () => {
    const h = harness();
    const A = await one(h);
    const clothes = async (world: number) => {
      const n = A.room!.mark(); A.room!.send(0x4170, cat(be32(world), new Uint8Array(16), new Uint8Array(4))); await A.room!.wait(0x4171, n);
      return (await npcList(A)).map(entry).filter((e) => e.id === 17).map((e) => e.parts[6] & 0xf0)[0];
    };
    expect(await clothes(0)).toBe(0x70);
    expect(await clothes(1)).toBe(0x80);
  });

  it("07-10 npc_window OFF: 0x43a0 for an NPC duel ends with u8 0 (with 1 the client can't move after the duel)", async () => {
    const h = harness();
    const A = await one(h);
    const d = new Uint8Array(28); d[0] = 3; new DataView(d.buffer).setUint32(24, 51);
    const n = A.room!.mark(); A.room!.send(0x4288, d);
    const r = (await A.room!.wait(0x43a0, n))!;
    expect([r.length, r.at(-1)]).toEqual([4 + 16 + 5 + 16 + 1, 0]);
  });
});

describe("avatar (mundo/avatar.py, research/avatar)", () => {
  it("P0-4: 0x5320 for another connected player -> 0x5340 with his name and last position", async () => {
    const h = harness();
    const A = h.client("A"), B = h.client("B");
    await A.account(0, "Alice"); await B.account(0, "Bob");
    await A.enterRoom(); await B.enterRoom();
    B.room!.send(0x5300, cat(be32(0), [0, 123, 0, 45, 6, 0]));
    await h.tick(500);
    const n = A.room!.mark(); A.room!.send(0x5320, be32(B.pid!));
    const d = (await A.room!.wait(0x5340, n))!;
    expect([i32(d), u32(d, 4), cstr(d.subarray(8, 24)), u16(d, 24), u16(d, 26), d[28]]).toEqual([0, B.pid, "Bob", 123, 45, 6]);
    const m = A.room!.mark(); A.room!.send(0x5320, be32(A.pid!));
    const me = (await A.room!.wait(0x5340, m))!;
    expect([cstr(me.subarray(8, 24)), u16(me, 24), u16(me, 26)]).toEqual(["Alice", 400, 300]);
  });

  it("My Room (MYROOM_SELF_AVATAR): 0x4170 on the lobby port also sends my own 0x4181 (pid, world, 16 B parts)", async () => {
    const h = harness();
    const A = h.client("A"); await A.account(0, "Alice");
    const my = A.link(5732);
    my.send(0x3003, A.key); await my.wait(0x3004);
    let n = my.mark(); my.send(0x4100, [5, 0]); const pid = u32((await my.wait(0x4101, n))!, 4);
    const parts = Uint8Array.from([0, 1, 0x20, 0x30, 0x40, 0x60, 0x70, 0x90, 0xb0, 0x20, 0, 0, 0, 0, 0, 0]);
    n = my.mark(); my.send(0x4170, cat(be32(0), parts, new Uint8Array(4)));
    const d = (await my.wait(0x4181, n))!;
    expect([u32(d), u32(d, 4), [...d.subarray(8)]]).toEqual([pid, 0, [...parts]]);
    const p = (Object.values(h.state().accounts)[0] as any).profiles["0"];
    expect(p.avatar.a).toBe(Buffer.from(parts).toString("hex"));   // 0x4170 world 0 -> avatar «a»
  });

  it("0x4170 in a room: the others get 0x4181 with the new parts (FUN_006b9930)", async () => {
    const h = harness();
    const A = h.client("A"), B = h.client("B");
    await A.account(0, "Alice"); await B.account(0, "Bob");
    await A.enterRoom(); await B.enterRoom();
    const parts = Uint8Array.from([0, 2, 0x20, 0x30, 0x40, 0x60, 0x80, 0x90, 0xb8, 0x20, 0, 0, 0, 0, 0, 0]);
    const n = A.room!.mark();
    B.room!.send(0x4170, cat(be32(1), parts, new Uint8Array(4)));
    const d = (await A.room!.wait(0x4181, n, (x) => u32(x) === B.pid))!;
    expect([u32(d, 4), [...d.subarray(8)]]).toEqual([1, [...parts]]);
  });
});

describe("GM accounts (research/mundo, 07-10)", () => {
  const gm = async (h: Harness, A: Client) => { h.game.admin.setGm(h.game.hub.byPid(A.pid!)!.acct, true); };

  it("07-10: a GM account gets GAME MASTER (226) on its next map entry (ITEMGET 1); not twice; a player never", () => {
    const h = harness();
    const g = h.game;
    const p = PP.blankProfile("x"); p.trunk = {};
    g.admin.setGm(g.cfg.ownerAcct!, true);              // no session = the owner's account
    expect(PP.challengeRightsDue(p, g)).toContain(226);
    PP.pbinSet(p, 226);
    expect(PP.challengeRightsDue(p, g)).not.toContain(226);
    g.admin.setGm(g.cfg.ownerAcct!, false);
    expect(PP.challengeRightsDue(PP.blankProfile("y"), g)).not.toContain(226);
  });

  it("07-10: a GM equips KONAMI (225) and GAME MASTER (226); a player is refused (0x4175 = 1), JUMP FESTA (227) is not staff", () => {
    const h = harness();
    const g = h.game;
    const p = PP.blankProfile("x"); for (const b of [225, 226, 227]) PP.pbinSet(p, b);
    expect([225, 226, 227].map((b) => i32(PP.onTitle(p, b, g)))).toEqual([1, 1, 0]);
    g.admin.setGm(g.cfg.ownerAcct!, true);
    expect([225, 226].map((b) => i32(PP.onTitle(p, b, g)))).toEqual([0, 0]);
  });

  it("07-10: a GM's «@1» colour codes reach the others", async () => {
    const h = harness();
    const A = h.client("A"), B = h.client("B");
    await A.account(0, "Alice"); await B.account(0, "Bob");
    await A.enterRoom(); await B.enterRoom();
    await gm(h, A);
    const m = B.room!.mark();
    A.room!.send(0x4400, cat([0, 0], be32(0), be32(0), be32(0), Uint8Array.from(Buffer.from("@1hola")), [0]));
    const d = (await B.room!.wait(0x4402, m))!;
    expect(cstr(d.subarray(26))).toBe("@1hola");
  });
});
