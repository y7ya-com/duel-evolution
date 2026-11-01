// Two PvP duels in a row between the same pair, through the gateway as the client plays them: B opens a room, A
// challenges (0x4300), B accepts (0x4303), both duel on 5760 until A surrenders, both go back to the map (0x4210),
// then A challenges B's room again and the second duel must start (live report: "2 PvP duels in a row: it doesn't
// start"). Needs gamedata/ (engine data, translator.json, duel.json).
import { existsSync } from "node:fs";
import { join } from "node:path";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { harness, be32, cat, i32, str, u32, type Client, type Harness, type Link } from "./notes-harness.ts";
import { createNodeDuelCore } from "../src/duel/engine/node.ts";
import { NPC_DECKS, setDuelCore } from "../src/duel/data.ts";

const GD = join(import.meta.dirname, "..", "gamedata");
const have = ["engine/scripts.pack", "translator.json", "duel.json"].every((f) => existsSync(join(GD, f)));
const type6202 = (d: Uint8Array) => u32(d) & 0xff;
const deckMsg = (ids: number[]) => { const b = new Uint8Array(4 + 2 * ids.length); const v = new DataView(b.buffer); v.setUint32(0, ids.length); ids.forEach((x, i) => v.setUint16(4 + 2 * i, x)); return b; };
const roomReq = () => { const d = new Uint8Array(28); d[0] = 3; d.set([1, 1, 1], 21); return d; };

describe.skipIf(!have)("two PvP duels in a row", () => {
  beforeAll(async () => { setDuelCore(await createNodeDuelCore()); }, 60_000);
  afterAll(() => setDuelCore(null));
  afterEach(() => { vi.useRealTimers(); });

  /** A challenges B's room, B accepts, the duel runs until A surrenders; both end back on the map (0x4210). */
  async function duel(h: Harness, A: Client, B: Client, rid: number, keep: Record<string, Link> | null = null) {
    const na = A.room!.mark(), nb = B.room!.mark();
    A.room!.send(0x4300, cat(be32(rid), str("", 16)));
    expect(await B.room!.wait(0x4302, nb), "B gets the challenge").not.toBeNull();
    B.room!.send(0x4303, be32(1));
    const r = await A.room!.wait(0x4301, na);
    expect(r && i32(r), "A's challenge result").toBe(0);
    for (const X of [A, B]) expect(await X.room!.wait(0x4306, X === A ? na : nb)).not.toBeNull();
    const d: Record<string, Link> = keep ?? {};
    const from: Record<string, number> = {};
    for (const [X, nid] of [[A, 51], [B, 54]] as [Client, number][]) {
      const l = (d[X.name] ??= X.link(5760)), deck = NPC_DECKS[String(nid)];
      from[X.name] = l.mark();
      l.send(0x6001, be32(X.pid!));
      l.send(0x6600, be32(deck.main.length, 0, deck.extra.length));
      l.send(0x6601, deckMsg(deck.main));
      l.send(0x6603, deckMsg(deck.extra));
      l.send(0x600b);
    }
    const [dA, dB] = [d[A.name], d[B.name]], fA = from[A.name], fB = from[B.name];
    for (const [l, f] of [[dA, fA], [dB, fB]] as [Link, number][]) expect(await l.wait(0x6005, f, undefined, 30_000), "0x6005: the duel starts").not.toBeNull();
    for (const l of [dA, dB]) l.send(0x6100);
    dA.send(0x6101, [0]); dB.send(0x6101, [1]);   // A wins rock-paper-scissors
    for (const l of [dA, dB]) l.send(0x6102);
    dA.send(0x6103, [0]);
    await dB.wait(0x6103, fB, undefined, 10_000);
    const n = dA.mark();
    for (const l of [dA, dB]) l.send(0x61fe, [1]);
    expect(await dA.wait(0x6202, n, (x) => type6202(x) === 0x1a, 30_000)).not.toBeNull();
    dA.send(0x6350, be32(0, 0xd, 0, 10));
    await dA.wait(0x6202, n, (x) => type6202(x) === 0x1b && u32(x, 4) === 0x32, 30_000);
    dA.send(0x6423, be32(1));
    for (const [l, f] of [[dA, fA], [dB, fB]] as [Link, number][]) expect(await l.wait(0x6202, f, (x) => type6202(x) === 0x4d, 30_000), "0x4d: the duel's end").not.toBeNull();
    await h.tick(5000);
    if (!keep) for (const l of [dA, dB]) { l.send(0x0003); await h.tick(400); l.close(); }
    for (const X of [A, B]) { const m = X.room!.mark(); X.room!.send(0x4210, be32(0xffffffff)); await X.room!.wait(0x4213, m); }
    await h.tick(1000);
  }

  async function pair() {
    const h = harness({ players: {} }, { PVP_TEST: "1", DUEL_PAUSE: "0.0005" });
    const A = h.client("A"), B = h.client("B");
    await A.account(0, "Alfa"); await B.account(0, "Beta");
    await A.enterRoom(); await B.enterRoom();
    const n = B.room!.mark();
    B.room!.send(0x4288, roomReq());
    return { h, A, B, rid: u32((await B.room!.wait(0x3113, n))!) };
  }

  it("two NPC duels in a row on the duel connection kept from the first (live report 2026-11-01: the second never started)", async () => {
    const h = harness({ players: {} }, { PVP_TEST: "1", DUEL_PAUSE: "0.0005" });
    const A = h.client("A"); await A.account(0, "Alfa"); await A.enterRoom();
    const npcRoom = (rival: number) => { const b = new Uint8Array(28); b[0] = 3; b.set([1, 1, 1], 20); new DataView(b.buffer).setUint32(24, rival); return b; };
    const d = A.link(5760), deck = NPC_DECKS["51"];
    for (const round of [1, 2]) {
      const n = A.room!.mark();
      A.room!.send(0x4288, npcRoom(84));
      expect(await A.room!.wait(0x43a0, n, undefined, 15_000), `round ${round}: the NPC challenge`).not.toBeNull();
      const f = d.mark();
      d.send(0x6001, be32(A.pid!));
      expect(await d.wait(0x6007, f)).not.toBeNull();
      d.send(0x6600, be32(deck.main.length, 0, deck.extra.length)); d.send(0x6601, deckMsg(deck.main)); d.send(0x6603, deckMsg(deck.extra)); d.send(0x600b);
      expect(await d.wait(0x6005, f, undefined, 30_000)).not.toBeNull();
      for (const [mid, data] of [[0x6100, []], [0x6101, [0]], [0x6102, []], [0x6103, [0]]] as [number, number[]][]) { const k = d.mark(); d.send(mid, data); await d.wait(mid, k, undefined, 15_000); }
      const k = d.mark();
      d.send(0x61fe, [1]);
      expect(await d.wait(0x6202, k, undefined, 30_000), `round ${round}: the duel starts`).not.toBeNull();
      expect(await d.wait(0x6202, k, (x) => type6202(x) === 0x4d, 120_000), `round ${round}: the duel's end`).not.toBeNull();
      await h.tick(3000);
      const m = A.room!.mark(); A.room!.send(0x4210, be32(0xffffffff)); await A.room!.wait(0x4213, m);   // back to the map, the duel connection kept
    }
    expect(h.log.some((l) => l.includes("0x61fe repeated"))).toBe(false);
  }, 240_000);

  it("the same pair duels twice, a new duel connection each time", async () => {
    const { h, A, B, rid } = await pair();
    await duel(h, A, B, rid);
    await duel(h, A, B, rid);
  }, 240_000);

  it("a match whose duel hasn't started 90 s after the challenge (a frozen tab at rock-paper-scissors) is called off for both", async () => {
    const { h, A, B, rid } = await pair();
    const na = A.room!.mark(), nb = B.room!.mark();
    A.room!.send(0x4300, cat(be32(rid), str("", 16)));
    await B.room!.wait(0x4302, nb); B.room!.send(0x4303, be32(1));
    await A.room!.wait(0x4301, na);
    const ls: Link[] = [];
    for (const [X, nid] of [[A, 51], [B, 54]] as [Client, number][]) {
      const l = X.link(5760), deck = NPC_DECKS[String(nid)];
      ls.push(l);
      l.send(0x6001, be32(X.pid!)); l.send(0x6600, be32(deck.main.length, 0, deck.extra.length));
      l.send(0x6601, deckMsg(deck.main)); l.send(0x6603, deckMsg(deck.extra)); l.send(0x600b);
    }
    for (const l of ls) expect(await l.wait(0x6005, 0, undefined, 30_000)).not.toBeNull();
    const ml = ls.map((l) => l.mark());
    ls[0].send(0x6100); ls[0].send(0x6101, [0]);   // A plays; B's tab is frozen (heartbeats only)
    for (let t = 0; t < 95 && ls.some((l, k) => !l.all(0x649b, ml[k]).length); t++) { ls[1].send(0x0005); await h.tick(1000); }
    expect(ls.map((l, k) => l.all(0x649b, ml[k]).length), "the called-off notice").toEqual([1, 1]);
    expect(h.game.pvp!.byPid(A.pid!), "the match is gone").toBeNull();
  }, 240_000);

  it("the same pair duels twice on the duel connections kept from the first duel", async () => {
    const { h, A, B, rid } = await pair();
    const keep: Record<string, Link> = {};
    await duel(h, A, B, rid, keep);
    await duel(h, A, B, rid, keep);
  }, 240_000);
});
