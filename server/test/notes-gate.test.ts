// py yo2srv/red/puerta.py + mundo/bloques.py notes (gate list, GATE_PAUSE, 10-10 ROOM_PER_LANG, 10-28 SINGLE_LOBBY,
// ROOM_LANG_MERGE) -> src/game/gate.ts.
import { afterEach, describe, expect, it, vi } from "vitest";
import { harness, cstr, u16, u32 } from "./notes-harness.ts";

afterEach(() => { vi.useRealTimers(); });

type Entry = { sid: number; kind: number; name: string; ip: string; port: number; extra: number; b1: number; b2: number; b3: number };
const entries = (ds: Uint8Array[]): Entry[] => ds.flatMap((d) => Array.from({ length: d.length / 48 }, (_, i) => {
  const e = d.subarray(48 * i, 48 * i + 48);
  return { sid: u32(e), kind: u32(e, 4), name: cstr(e.subarray(8, 24)), ip: cstr(e.subarray(24, 39)), port: u16(e, 39),
    extra: u16(e, 41), b1: e[43], b2: e[44], b3: e[45] };
}));

describe("gate 5730 (puerta.gate_reply)", () => {
  it("0x2005 -> 0x2002 (u32 0), 0x2003 × N of ≤ 21 entries of 48 B, 0x2004", async () => {
    const h = harness();
    const g = h.client("A").link(5730);
    g.send(0x2005, new Uint8Array(4));
    await g.wait(0x2004);
    const ids = g.ids();
    expect(ids[0]).toBe(0x2002);
    expect(u32(g.all(0x2002)[0])).toBe(0);
    expect(ids.at(-1)).toBe(0x2004);
    const ls = g.all(0x2003);
    expect(ls.every((d) => d.length % 48 === 0 && d.length <= 21 * 48)).toBe(true);
    const es = entries(ls);
    expect(es[0]).toMatchObject({ sid: 1, kind: 1, name: "DuelCards", port: 5731 });
    expect(es[1]).toMatchObject({ sid: 2, kind: 3, name: "MyRoom", port: 5732, b1: 0, b2: 12, b3: 0 });
    expect(es.length).toBe(2 + 8 * 11);                 // every language (b1 0-7) × every room kind
    expect(es.slice(2).every((e) => e.kind === 3 && e.b3 === 0)).toBe(true);
  });

  it("GATE_PAUSE: the list goes out almost without pause (a half list between 0x2002 and 0x2004 crashes the client)", async () => {
    const h = harness();
    const g = h.client("A").link(5730);
    const t0 = Date.now();
    g.send(0x2005, new Uint8Array(4));
    await g.wait(0x2004);
    expect(Date.now() - t0).toBeLessThan(500);
  });

  it("«extra» = players in that room (FUN_0082e170 paints «%4d/1000»)", async () => {
    const h = harness();
    const A = h.client("A"), B = h.client("B");
    await A.account(0, "Alice"); await B.account(0, "Bob");
    await A.enterRoom(4); await B.enterRoom(4);         // kind 14
    const es = entries((await h.client("C").gate())!);
    expect(es.filter((e) => e.b2 === 14).map((e) => e.extra)).toEqual(new Array(8).fill(2));   // ROOM_LANG_MERGE
    expect(es.filter((e) => e.b2 === 13).every((e) => e.extra === 0)).toBe(true);
  });

  it("PORT_OFFSET: every announced port carries the offset", async () => {
    const h = harness(undefined, { PORT_OFFSET: "1000" });
    h.off = 1000;
    const es = entries((await h.client("A").gate())!);
    expect(es[0].port).toBe(6731);
    expect(Math.min(...es.slice(2).map((e) => e.port))).toBe(6740);
  });

  it("10-28 SINGLE_LOBBY: the gate announces only the world (b1 6) Duel Academy room (b2 14)", async () => {
    const h = harness(undefined, { SINGLE_LOBBY: "1" });
    const es = entries((await h.client("A").gate())!);
    expect(es.slice(2).map((e) => [e.b1, e.b2, e.port])).toEqual([[6, 14, 5744]]);
  });

  it("10-10 ROOM_PER_LANG: a language room L ≠ 6 has its own port 5800 + franja(L)·11 + i; the world room keeps 5740 + i", async () => {
    const h = harness(undefined, { ROOM_PER_LANG: "1" });
    const es = entries((await h.client("A").gate())!).slice(2);
    const port = (b1: number, b2: number) => es.find((e) => e.b1 === b1 && e.b2 === b2)!.port;
    expect(port(6, 13)).toBe(5740);
    expect(port(6, 20)).toBe(5750);
    expect(port(0, 13)).toBe(5800);
    expect(port(5, 14)).toBe(5800 + 5 * 11 + 4);
    expect(port(7, 13)).toBe(5800 + 6 * 11);           // Korean (7) takes franja 6
    expect(new Set(es.map((e) => e.port)).size).toBe(88);
  });

  it("10-10 ROOM_PER_LANG: the block key carries the room's language, not the client's", async () => {
    const h = harness(undefined, { ROOM_PER_LANG: "1" });
    const A = h.client("A"), B = h.client("B");
    await A.account(0, "Alice"); await B.account(0, "Bob");
    await A.enterRoom(0, 1, 0, undefined, 5800 + 5 * 11);   // Spanish room, English client
    await B.enterRoom(0, 5, 0, undefined, 5740);            // world room, Spanish client
    const keys = [...h.game.hub.blocks.keys()].sort();
    expect(keys).toEqual(["5740|5", "5740|6"]);
  });

  it("ROOM_LANG_MERGE: without ROOM_PER_LANG clients of every language share the block (key language 0)", async () => {
    const h = harness();
    const A = h.client("A"), B = h.client("B");
    await A.account(0, "Alice"); await B.account(0, "Bob");
    await A.enterRoom(0, 1); await B.enterRoom(0, 5);
    expect([...h.game.hub.blocks.keys()]).toEqual(["5740|0"]);
    expect(h.game.hub.blocks.get("5740|0")!.size).toBe(2);
  });
});
