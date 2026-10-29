// py yo2srv/lobby/lobby.py + research/lobby/proposal.py notes (its selftests L6 / espectador / mensajes: LIMIT_LIST,
// ROOM_REOPEN, WATCH, B11, B12, B13/B40, B58, B60, B63; the PvP challenge sequence P0-5 with −618/−616/−600/−608/−495/
// −492/−602; autoduel; 0x3604 «illegal rank»; mail time 07-10; 0x4309; PLAYERINFO; chat P1-11 and research/mundo GM
// colour codes; PIDNAME_PLAYERS 06-10) -> src/game/lobby.ts.
import { afterEach, describe, expect, it, vi } from "vitest";
import { harness, be32, cat, cstr, i32, pc, str, u16, u32, type Client, type Harness } from "./notes-harness.ts";
import * as PP from "../src/game/persist.ts";

afterEach(() => { vi.useRealTimers(); });

/** 0x4288 CREATEROOM: dstyle, wmode, mstat, pw?, 16 B password, …, 3 B x, u32 rival (0 = PvP room). */
const roomReq = (o: { dstyle?: number; mstat?: number; pw?: string; rival?: number } = {}) => {
  const d = new Uint8Array(28);
  d[0] = o.dstyle ?? 3; d[2] = o.mstat ?? 0; d[3] = o.pw ? 1 : 0;
  if (o.pw) d.set(str(o.pw, 16), 4);
  d.set([1, 1, 1], 21);
  new DataView(d.buffer).setUint32(24, o.rival ?? 0);
  return d;
};
const room = (d: Uint8Array) => ({ id: u32(d), p1: u32(d, 4), p2: u32(d, 8), mstat: d[12] });

async function players(h: Harness, n: number, kind = 0): Promise<Client[]> {
  const cs = Array.from({ length: n }, (_, i) => h.client(`P${i}`));
  for (const [i, c] of cs.entries()) await c.account(0, `Player${i}`);
  for (const c of cs) await c.enterRoom(kind);
  return cs;
}
/** B opens a PvP room: its id. */
async function openRoom(h: Harness, B: Client, o: Parameters<typeof roomReq>[0] = {}): Promise<number> {
  const n = B.room!.mark();
  B.room!.send(0x4288, roomReq(o));
  await B.room!.wait(0x428a, n);
  return room((await B.room!.wait(0x3113, n))!).id;
}
const challenge = (A: Client, rid: number, pw = "") => A.room!.send(0x4300, cat(be32(rid), str(pw, 16)));
const ask8303 = async (A: Client) => { const n = A.room!.mark(); A.room!.send(0x8303); return (await A.room!.wait(0x8304, n))!; };
const result = async (A: Client, n: number, ms = 5000) => { const d = await A.room!.wait(0x4301, n, undefined, ms); return d && i32(d); };

describe("rooms (LIMIT_LIST, B63, B12, ROOM_REOPEN)", () => {
  it("06-10 LIMIT_LIST: 0x4100 sends the banned/limited list (0x5600: ≤ 1024 B, 13 B entries, indices 0..n-1) before PSELECTRESULT", async () => {
    const h = harness();
    const A = h.client("A");
    await A.account(0, "Alice");
    const r = A.link(5740);
    r.send(0x3003, A.key); await r.wait(0x3004);
    const n = r.mark(); r.send(0x4100, [5, 0]); await r.wait(0x4101, n);
    const ids = r.ids(n);
    expect(ids.indexOf(0x4101)).toBeGreaterThan(ids.lastIndexOf(0x5600));
    const ds = r.all(0x5600, n);
    expect(ds.every((d) => d.length <= 1024 && d.length % 13 === 0)).toBe(true);
    const all = cat(...ds);
    const ents = Array.from({ length: all.length / 13 }, (_, i) => [u32(all, 13 * i), u32(all, 13 * i + 4), u32(all, 13 * i + 8), all[13 * i + 12]]);
    expect(ents.map((e) => e[0])).toEqual(ents.map((_, i) => i));
    // (u32 i, u32 passcode, u32 0, u8 copies): the client's codec fills its YO2 and Konami ids from the passcode
    expect(ents.some((e) => e[1] === 55144522 && e[2] === 0 && e[3] === 0)).toBe(true);   // Pot of Greed banned
    expect(ents.some((e) => e[1] === 44095762 && e[2] === 0 && e[3] === 1)).toBe(true);   // Mirror Force limited
    expect(ents.every((e) => [0, 1, 2].includes(e[3]) && e[2] === 0 && PP.cardOk(e[1]))).toBe(true);
  });

  it("B63: no NPC rooms are announced: 0x4280 -> 0x4282 u32 0, no 0x4284, 0x4286", async () => {
    const h = harness();
    const [A] = await players(h, 1);
    const n = A.room!.mark(); A.room!.send(0x4280); await A.room!.wait(0x4286, n);
    expect(A.room!.ids(n)).toEqual([0x4282, 0x4286]);
    expect(u32(A.room!.all(0x4282, n)[0])).toBe(0);
  });

  it("V05/P0-5: a new room goes to the whole block (0x3113) and to its owner (0x428a 0 + 0x3113), P1 = the active slot's pid (B12)", async () => {
    const h = harness();
    const A = h.client("A"), B = h.client("B");
    await A.account(0, "Alice"); await B.account(1, "Bob");
    await A.enterRoom(); await B.enterRoom(0, 5, 1);
    const n = A.room!.mark();
    const rid = await openRoom(h, B);
    const seen = room((await A.room!.wait(0x3113, n))!);
    expect(seen).toEqual({ id: rid, p1: B.pid, p2: 0, mstat: 0 });
    expect(B.pid).toBe(1009);
    const m = A.room!.mark(); A.room!.send(0x4280); await A.room!.wait(0x4286, m);
    expect(u32(A.room!.all(0x4282, m)[0])).toBe(1);
    expect(room(A.room!.all(0x4284, m)[0]).p1).toBe(B.pid);
  });

  it("06-10 ROOM_REOPEN: after the duel, 0x4210 reopens my room (0x3113 P2 = 0, mstat back) once; not while the duel is on", async () => {
    const h = harness();
    const [A] = await players(h, 1);
    const rid = await openRoom(h, A);
    const r = h.game.lp.mem.rooms.get(rid)!;
    r.p2 = 4321; r.mstat = 1;
    const pvp = h.game.pvp!, byPid = pvp.byPid.bind(pvp);
    (pvp as any).byPid = () => ({});
    let n = A.room!.mark(); A.room!.send(0x4210, be32(0xffffffff)); await A.room!.wait(0x4213, n); await h.tick(500);
    expect(A.room!.all(0x3113, n)).toEqual([]);
    (pvp as any).byPid = byPid;
    n = A.room!.mark(); A.room!.send(0x4210, be32(0xffffffff)); await A.room!.wait(0x4213, n); await h.tick(500);
    expect(A.room!.all(0x3113, n).map(room)).toEqual([{ id: rid, p1: A.pid, p2: 0, mstat: 0 }]);
    n = A.room!.mark(); A.room!.send(0x4210, be32(0xffffffff)); await A.room!.wait(0x4213, n); await h.tick(500);
    expect(A.room!.all(0x3113, n)).toEqual([]);
  });
});

describe("PvP challenges (V05/P0-5)", () => {
  it("P0-5: A 0x4300 -> B 0x4302 MATCHOFFER (pid, name16, u8, u8 LV, u16 title, u16, 16 B parts); A gets no 0x4301 yet", async () => {
    const h = harness();
    const [A, B] = await players(h, 2);
    const rid = await openRoom(h, B);
    const n = A.room!.mark(), m = B.room!.mark();
    challenge(A, rid);
    const off = (await B.room!.wait(0x4302, m))!;
    expect([off.length, u32(off), cstr(off.subarray(4, 20))]).toEqual([4 + 16 + 6 + 16, A.pid, "Player0"]);
    await h.tick(2000);
    expect(A.room!.all(0x4301, n)).toEqual([]);
  });

  it("P0-5: B accepts (0x4303 1): A 0x4301 0, the block sees 0x3113 P2 = A mstat 1, both get 0x4306 (ip15 + duel port)", async () => {
    const h = harness();
    const [A, B, C] = await players(h, 3);
    const rid = await openRoom(h, B);
    const n = A.room!.mark(), m = B.room!.mark(), k = C.room!.mark();
    challenge(A, rid); await B.room!.wait(0x4302, m);
    B.room!.send(0x4303, be32(1));
    expect(await result(A, n)).toBe(0);
    for (const X of [A, B]) {
      const t = (await X.room!.wait(0x4306, n > m ? m : n))!;
      expect([t.length, cstr(t.subarray(0, 15)), u16(t, 15)]).toEqual([17, "127.0.0.1", 5760]);
    }
    const seen = await C.room!.wait(0x3113, k, (d) => u32(d) === rid && u32(d, 8) !== 0);
    expect(seen && room(seen)).toEqual({ id: rid, p1: B.pid, p2: A.pid, mstat: 1 });
  });

  it("−618: B rejects (0x4303 0) -> A 0x4301 −618 «La Solicitud de Duelo fue rechazada»", async () => {
    const h = harness();
    const [A, B] = await players(h, 2);
    const rid = await openRoom(h, B);
    const n = A.room!.mark(), m = B.room!.mark();
    challenge(A, rid); await B.room!.wait(0x4302, m);
    B.room!.send(0x4303, be32(0));
    expect(await result(A, n)).toBe(-618);
  });

  it("−616: no answer in OFFER_TIMEOUT (30 s) -> B 0x4308, A 0x4301 −616", async () => {
    const h = harness();
    const [A, B] = await players(h, 2);
    const rid = await openRoom(h, B);
    const n = A.room!.mark(), m = B.room!.mark();
    challenge(A, rid); await B.room!.wait(0x4302, m);
    await h.tick(29_000);
    expect(A.room!.all(0x4301, n)).toEqual([]);
    expect(await result(A, n, 3000)).toBe(-616);
    expect(B.room!.all(0x4308, m).length).toBe(1);
  });

  it("0x4309: A cancels (0x4304) -> A 0x4309 s32 0, B 0x4305 (clears the rival's card)", async () => {
    const h = harness();
    const [A, B] = await players(h, 2);
    const rid = await openRoom(h, B);
    const n = A.room!.mark(), m = B.room!.mark();
    challenge(A, rid); await B.room!.wait(0x4302, m);
    A.room!.send(0x4304);
    expect(i32((await A.room!.wait(0x4309, n))!)).toBe(0);
    expect(await B.room!.wait(0x4305, m)).not.toBeNull();
  });

  it("−600: the owner deletes the room (0x4290) -> the block sees 0x3113 P1 = P2 = 0; A 0x4301 −600 «El oponente ha salido»", async () => {
    const h = harness();
    const [A, B] = await players(h, 2);
    const rid = await openRoom(h, B);
    const n = A.room!.mark(), m = B.room!.mark();
    challenge(A, rid); await B.room!.wait(0x4302, m);
    B.room!.send(0x4290);
    expect(await result(A, n)).toBe(-600);
    expect(A.room!.all(0x3113, n).map(room)).toContainEqual({ id: rid, p1: 0, p2: 0, mstat: 0 });
  });

  it("B58: the owner's connection goes (0x0003) with a challenge pending -> A 0x4301 −600; its room is gone for the block", async () => {
    const h = harness();
    const [A, B] = await players(h, 2);
    const rid = await openRoom(h, B);
    const n = A.room!.mark(), m = B.room!.mark();
    challenge(A, rid); await B.room!.wait(0x4302, m);
    B.room!.send(0x0003);
    expect(await result(A, n)).toBe(-600);
    expect(A.room!.all(0x3113, n).map(room)).toContainEqual({ id: rid, p1: 0, p2: 0, mstat: 0 });
    expect(h.game.lp.mem.rooms.size).toBe(0);
  });

  it("−495: wrong password (no code of its own: «Ya no existe esa sala»); also for a room that is gone", async () => {
    const h = harness();
    const [A, B] = await players(h, 2);
    const rid = await openRoom(h, B, { pw: "secret" });
    let n = A.room!.mark();
    challenge(A, rid, "nope");
    expect(await result(A, n)).toBe(-495);
    n = A.room!.mark(); const m = B.room!.mark();
    challenge(A, rid, "secret");
    expect(await B.room!.wait(0x4302, m)).not.toBeNull();
    void n;
  });

  it("−492: a room with a challenge pending is busy for a third player", async () => {
    const h = harness();
    const [A, B, C] = await players(h, 3);
    const rid = await openRoom(h, B);
    const m = B.room!.mark();
    challenge(A, rid); await B.room!.wait(0x4302, m);
    const k = C.room!.mark();
    challenge(C, rid);
    expect(await result(C, k)).toBe(-492);
  });

  it("−608: challenging someone already in a duel", async () => {
    const h = harness();
    const [A, B, C] = await players(h, 3);
    const rid = await openRoom(h, B);
    const m = B.room!.mark();
    challenge(A, rid); await B.room!.wait(0x4302, m);
    B.room!.send(0x4303, be32(1));
    await A.room!.wait(0x4306);
    const rid2 = await openRoom(h, A);              // A, now reserved for the duel, opens another room
    const k = C.room!.mark();
    challenge(C, rid2);
    expect(await result(C, k)).toBe(-608);
  });

  it("−602: an autoduel room (mstat 1) can't be challenged", async () => {
    const h = harness();
    const [A, B] = await players(h, 2);
    const rid = await openRoom(h, B, { mstat: 1 });
    const n = A.room!.mark();
    challenge(A, rid);
    expect(await result(A, n)).toBe(-602);
  });

  it("07-10 AUTODUEL_MATCH: two autoduel rooms in the same block pair after ~1 s: each gets 0x43a0 (the rival) and 0x4306", async () => {
    const h = harness();
    const [A, B] = await players(h, 2);
    const n = A.room!.mark(), m = B.room!.mark();
    await openRoom(h, A, { mstat: 1 });
    await openRoom(h, B, { mstat: 1 });
    const ra = await A.room!.wait(0x43a0, n), rb = await B.room!.wait(0x43a0, m);
    expect([ra && u32(ra), rb && u32(rb)]).toEqual([B.pid, A.pid]);
    expect(await A.room!.wait(0x4306, n)).not.toBeNull();
    expect(await B.room!.wait(0x4306, m)).not.toBeNull();
  });
});

describe("NPC duel (B11)", () => {
  it("B11: 0x4288 with an NPC rival -> 0x428a 0, 0x43a0 (rival, name), 0x4306; this connection is LOBBY_ROOM for the results", async () => {
    const h = harness();
    const [A] = await players(h, 1);
    const n = A.room!.mark();
    A.room!.send(0x4288, roomReq({ rival: 51 }));
    const t = await A.room!.wait(0x4306, n);
    expect(t).not.toBeNull();
    expect(A.room!.ids(n).filter((x) => [0x428a, 0x43a0, 0x4306].includes(x))).toEqual([0x428a, 0x43a0, 0x4306]);
    const r = A.room!.all(0x43a0, n)[0];
    expect([u32(r), cstr(r.subarray(4, 20))]).toEqual([51, h.game.npcs.find((x) => x[0] === 51)![1]]);
    expect(h.game.lobbyRoom.c).toBe(h.game.hub.byPid(A.pid!)!.lobby);
    expect(h.game.lp.mem.rooms.size).toBe(0);         // no PvP room for an NPC rival
  });
});

describe("watching (06-10 WATCH)", () => {
  it("06-10 WATCH: 0x4320 for a pid that is not in a duel -> 0x4321 s32 1 (21 B)", async () => {
    const h = harness();
    const [A] = await players(h, 1);
    const n = A.room!.mark(); A.room!.send(0x4320, be32(77));
    const d = (await A.room!.wait(0x4321, n))!;
    expect([d.length, i32(d)]).toEqual([21, 1]);
  });
});

describe("cards into the trunk (B13/B40)", () => {
  for (const mid of [0x4910, 0x4915, 0x4802]) {
    it(`B13/B40 0x${mid.toString(16)}: 0x4803 cards are saved in the active slot's trunk before sending, with the real «new» u8`, async () => {
      const h = harness();
      const A = h.client("A");
      await A.account(1, "Second");
      await A.enterRoom(0, 5, 1);
      const st = h.state(); (Object.values(st.accounts)[0] as any).profiles["1"].trunk = { [pc(5)]: 3 }; h.game.store.saveRaw(st);
      // 14558127 (Ash Blossom): a real card the 2008 client has no card for (py: id 3257)
      h.game.shopPurchase = () => [[1, pc(5)], [1, pc(9)], [1, pc(9)], [1, 14558127], [1, 0], [1, pc(11)]];
      const n = A.room!.mark();
      A.room!.send(mid, mid === 0x4802 ? [0, 1] : []);
      const d = (await A.room!.wait(0x4803, n))!;
      expect([...d]).toEqual([...be32(0), ...be32(pc(5)), 0, ...be32(pc(9)), 1, ...be32(pc(9)), 0, ...be32(pc(11)), 1]);
      expect((Object.values(h.state().accounts)[0] as any).profiles["1"].trunk).toEqual({ [pc(5)]: 4, [pc(9)]: 2, [pc(11)]: 1 });
    });
  }

  it("B13: if saving fails, 0x4803 still goes out (the client must not hang)", async () => {
    const h = harness();
    const [A] = await players(h, 1);
    h.game.shopPurchase = () => [[1, pc(5)]];
    const save = h.game.saveState.bind(h.game);
    h.game.saveState = () => { throw new Error("disk"); };
    const n = A.room!.mark(); A.room!.send(0x4910);
    const d = await A.room!.wait(0x4803, n);
    h.game.saveState = save;
    expect(d && [...d.subarray(4)]).toEqual([...be32(pc(5)), 1]);
  });

  it("B13: without a shop draw, 5 valid ids", async () => {
    const h = harness();
    const [A] = await players(h, 1);
    h.game.shopPurchase = () => [];
    const n = A.room!.mark(); A.room!.send(0x4910);
    const d = (await A.room!.wait(0x4803, n))!;
    expect(d.length).toBe(4 + 25);   // (u32 passcode, u8 new) per card
    expect(Array.from({ length: 5 }, (_, i) => u32(d, 4 + 5 * i)).every((x) => PP.cardOk(x))).toBe(true);
  });
});

describe("handle (B58, B60)", () => {
  it("B58: 0x0003 on the room is handled in silence (FUN_0068cf60 waits for nothing)", async () => {
    const h = harness();
    const [A] = await players(h, 1);
    await openRoom(h, A);
    const n = A.room!.mark(); A.room!.send(0x0003);
    await h.tick(2000);
    expect(A.room!.ids(n)).toEqual([]);
    expect(h.game.lp.mem.rooms.size).toBe(0);
  });

  it("B60: a handler that fails after sending counts as answered (no double reply); failing before sending falls through", () => {
    const h = harness();
    const lp = h.game.lp;
    const out: number[] = [];
    class FakeConn { port = 5745; ext = {}; sess = null; closed = false; stale() { return false; } send(m: number) { out.push(m); } }
    const c: any = new FakeConn();
    lp.handlers.set(0x7ffe, (cc) => { cc.send(0x4292, new Uint8Array(4)); throw new Error("half way"); });
    lp.handlers.set(0x7fff, () => { throw new Error("before"); });
    expect(lp.handle(c, 0x7ffe, 0, new Uint8Array(0))).toBe(true);
    expect(out).toEqual([0x4292]);
    expect(lp.handle(c, 0x7fff, 0, new Uint8Array(0))).toBe(false);
    expect(Object.prototype.hasOwnProperty.call(c, "send")).toBe(false);  // c.send restored (the class's own)
    out.length = 0; c.send(0x1);
    expect(out).toEqual([0x1]);
  });
});

describe("social (chat P1-11, friends, 0x3604, mail, PLAYERINFO)", () => {
  it("P1-11 / 06-10: 0x4402 = u8 0, u8 kind, u32 pid, u32 2, name16, text, 0; room chat (kind 0) reaches the block, sender included", async () => {
    const h = harness();
    const [A, B] = await players(h, 2);
    const n = A.room!.mark(), m = B.room!.mark();
    A.room!.send(0x4400, cat([0, 0], be32(0), be32(0), be32(0), str("hola", 4), [0]));
    const mine = (await A.room!.wait(0x4402, n))!, theirs = (await B.room!.wait(0x4402, m))!;
    expect([...mine]).toEqual([...theirs]);
    expect([mine[0], mine[1], u32(mine, 2), u32(mine, 6), cstr(mine.subarray(10, 26)), cstr(mine.subarray(26))]).toEqual([0, 0, A.pid, 2, "Player0", "hola"]);
  });

  it("P1-11: a whisper (kind 3) reaches only its target", async () => {
    const h = harness();
    const [A, B, C] = await players(h, 3);
    const m = B.room!.mark(), k = C.room!.mark();
    A.room!.send(0x4400, cat([0, 3], be32(0), be32(B.pid!), be32(0), str("psst", 4), [0]));
    expect(await B.room!.wait(0x4402, m)).not.toBeNull();
    await h.tick(1000);
    expect(C.room!.all(0x4402, k)).toEqual([]);
  });

  it("research/mundo: a non-GM account loses its «@n» colour codes; «@@» stays", async () => {
    const h = harness();
    const [A, B] = await players(h, 2);
    const m = B.room!.mark();
    A.room!.send(0x4400, cat([0, 0], be32(0), be32(0), be32(0), str("@1red@@x", 8), [0]));
    const d = (await B.room!.wait(0x4402, m))!;
    expect(cstr(d.subarray(26))).toBe("red@@x");
  });

  it("06-10 PIDNAME_PLAYERS: 0x4500 finds a player by name (not just yourself and the NPCs)", async () => {
    const h = harness();
    const [A, B] = await players(h, 2);
    const n = A.room!.mark(); A.room!.send(0x4500, str("player1", 16));
    const d = (await A.room!.wait(0x4501, n))!;
    expect([i32(d), u32(d, 4)]).toEqual([0, B.pid]);
    const k = A.room!.mark(); A.room!.send(0x4500, str("nobody", 16));
    expect(i32((await A.room!.wait(0x4501, k))!)).toBe(1);
  });

  it("friends: 0x4510 to a player -> 0x4511 0, the other gets 0x4512 (pid, name, LV); 0x4513 yes -> 0x4515 1 to the asker", async () => {
    const h = harness();
    const [A, B] = await players(h, 2);
    const n = A.room!.mark(), m = B.room!.mark();
    A.room!.send(0x4510, be32(B.pid!));
    expect(i32((await A.room!.wait(0x4511, n))!)).toBe(0);
    const ask = (await B.room!.wait(0x4512, m))!;
    expect([u32(ask), cstr(ask.subarray(4, 20))]).toEqual([A.pid, "Player0"]);
    B.room!.send(0x4513, cat(be32(A.pid!), be32(1)));
    const ok = (await A.room!.wait(0x4515, n))!;
    expect([u32(ok), u32(ok, 4)]).toEqual([1, B.pid]);
  });

  it("0x3604 «illegal rank»: an online friend's 5 B are never zeros (kind 0 asserts): [block language, kind, 0, area, 0] in a room, My Room [0, 12, 0, 8, 0]; offline friends are left out", async () => {
    const h = harness();
    const [A, B] = await players(h, 2);
    const C = h.client("C"); await C.account(0, "Carol");
    const my = C.link(5732);
    my.send(0x3003, C.key); await my.wait(0x3004);
    let k = my.mark(); my.send(0x4100, [5, 0]); const cpid = u32((await my.wait(0x4101, k))!, 4);
    k = my.mark(); my.send(0x4202, [0, 0]); await my.wait(0x4213, k);
    const n = A.room!.mark();
    A.room!.send(0x3603, be32(3, B.pid!, cpid, 4321));
    const d = (await A.room!.wait(0x3604, n))!;
    expect([i32(d), u32(d, 4)]).toEqual([0, 2]);
    const ents = [[u32(d, 8), ...d.subarray(12, 17)], [u32(d, 17), ...d.subarray(21, 26)]];
    expect(ents).toEqual([[B.pid, 0, 13, 0, 0, 0], [cpid, 0, 12, 0, 8, 0]]);   // ROOM_LANG_MERGE: block language 0
  });

  it("07-10 mail time: 0x4612's s32 is the send date (time_t), increasing even within one second", async () => {
    const h = harness();
    const [A, B] = await players(h, 2);
    vi.setSystemTime(new Date("2026-10-07T12:00:00Z"));
    for (const subj of ["one", "two"]) {
      const n = A.room!.mark();
      A.room!.send(0x4600, cat(be32(B.pid!), str(subj, 32), str("body", 512)));
      await A.room!.wait(0x4601, n);
    }
    const n = B.room!.mark(); B.room!.send(0x4610); await B.room!.wait(0x4613, n);
    const ms = B.room!.all(0x4612, n);
    expect(ms.map((m) => m.length)).toEqual([653, 653]);
    const t = ms.map((m) => u32(m, 40));
    expect(t[0]).toBeGreaterThanOrEqual(Date.UTC(2026, 9, 7, 12) / 1000);
    expect(t[1]).toBe(t[0] + 1);
    expect(cstr(ms[0].subarray(44, 76))).toBe("one");
  });

  it("PLAYERINFO: 0x4150 -> 0x4160 of 137 B (s32 0, u32 pid, name16, the rest zeros)", async () => {
    const h = harness();
    const [A, B] = await players(h, 2);
    const n = A.room!.mark(); A.room!.send(0x4150, be32(B.pid!));
    const d = (await A.room!.wait(0x4160, n))!;
    expect([d.length, i32(d), u32(d, 4)]).toEqual([137, 0, B.pid]);
  });
});

describe("messages that were missing (NOTES §10)", () => {
  it("B61: 0x8303 -> 0x8304 of 21 B (auto_overrides; 13 B in 2008, its cards are u32 on the card wire)", async () => {
    const h = harness();
    const [A] = await players(h, 1);
    const d = await ask8303(A);
    expect(d.length).toBe(21);
  });
  it("10-10: «in the original no NPC challenges you»: an open PvP room gets no NPC MATCHOFFER", async () => {
    const h = harness();
    const [A] = await players(h, 1);
    const n = A.room!.mark();
    await openRoom(h, A);
    await h.tick(120_000);
    expect(A.room!.all(0x4302, n)).toEqual([]);
  });
  it("0x42a0 -> 0x42a2 s32 0", async () => {
    const h = harness();
    const [A] = await players(h, 1);
    const n = A.room!.mark(); A.room!.send(0x42a0);
    expect(i32((await A.room!.wait(0x42a2, n))!)).toBe(0);
  });
  it("0x8203 (USB DUELPASS auth) -> 0x8204 s32 1 (4 B)", async () => {
    const h = harness();
    const [A] = await players(h, 1);
    const n = A.room!.mark(); A.room!.send(0x8203, new Uint8Array(16));
    const d = (await A.room!.wait(0x8204, n))!;
    expect([d.length, i32(d)]).toEqual([4, 1]);
  });
  it("07-10 STARTUP_PRESENT 0x8401: without the right s32 1; with it the cards (and its GET済み bit); a 2nd time s32 1; more cards than the gift s32 1", async () => {
    const h = harness();
    const [A] = await players(h, 1);
    const ask = async (d: number[]) => { const n = A.room!.mark(); A.room!.send(0x8401, d); return (await A.room!.wait(0x8402, n))!; };
    const req = [3, ...be32(pc(1), pc(2), pc(3))];   // u8 n + n x u32 passcode
    expect([...await ask(req)]).toEqual([0, 0, 0, 1, 0]);
    const setBits = (bits: number[]) => {
      const st = h.state(); const p = (Object.values(st.accounts)[0] as any).profiles["0"];
      p.pbin = [...new Set([...(p.pbin ?? []), ...bits])].sort((a, b) => a - b); h.game.store.saveRaw(st);
    };
    setBits([0x30e, 0x316]);
    const r = await ask(req);
    expect([...r]).toEqual([...be32(0), 3, ...be32(pc(1), pc(2), pc(3))]);
    const p = (Object.values(h.state().accounts)[0] as any).profiles["0"];
    expect(p.pbin.includes(0x317)).toBe(true);
    expect(i32(await ask(req))).toBe(1);
    const st = h.state(); (Object.values(st.accounts)[0] as any).profiles["0"].pbin = [0x316]; h.game.store.saveRaw(st);
    expect(i32(await ask([11, ...be32(...new Array(11).fill(pc(1)))]))).toBe(1);
  });
});
