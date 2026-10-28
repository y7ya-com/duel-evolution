// py pvp_hub.py + yo2srv/cuentas/* notes (sessions V02, −240/−242/−200, in-use, sweep, pids P1-15, LIST1/LIST2/0x3112
// formats P0-4, areas 06-10, B12, B75, 24-10) -> src/game/hub.ts, src/game/accounts.ts.
import { afterEach, describe, expect, it, vi } from "vitest";
import { harness, i32, u16, u32, be32, cat, cstr, type Client, type Harness } from "./notes-harness.ts";

afterEach(() => { vi.useRealTimers(); });

const authCode = (d: Uint8Array | null) => (d ? i32(d) : null);
const list1 = (ds: Uint8Array[]) => ds.flatMap((d) => Array.from({ length: d.length / 36 }, (_, i) => d.subarray(36 * i, 36 * i + 36)));

async function two(h: Harness): Promise<[Client, Client]> {
  const A = h.client("A"), B = h.client("B");
  await A.account(0, "Alice"); await B.account(0, "Bob");
  await A.enterRoom(); await B.enterRoom();
  return [A, B];
}

describe("sessions and login (pvp_hub.login, personajes.game_reply)", () => {
  it("V02/P1-15: pid = 1000 + 4·account index + slot (never 1-98, never ≥ 100000)", async () => {
    const h = harness();
    const A = h.client("A"), B = h.client("B");
    await A.account(0, "Alice"); await A.account(2, "Alice2"); await B.account(0, "Bob");
    expect(await A.enterRoom(0, 5, 2)).toBe(1006);
    expect(await B.enterRoom(0, 5, 0)).toBe(1008);
    const A2 = h.client("A2", "A");
    A.room!.send(0x0003); await h.tick(300); A.room!.close(); await h.tick(10);
    expect(await A2.enterRoom(0, 5, 0)).toBe(1004);
  });

  it("0x3004 OK = s32 0, u32 1 | sanction bits, \"ESP\"", async () => {
    const h = harness();
    const a = h.client("A").link(5731);
    a.send(0x3003, h.client("x", "A").key);
    const d = (await a.wait(0x3004))!;
    expect([i32(d), u32(d, 4), cstr(d.subarray(8, 12))]).toEqual([0, 1, "ESP"]);
  });

  it("07-10: a 0x3003 shorter than 32 B gets −240 and the connection closes ~1.5 s later", async () => {
    const h = harness();
    const A = h.client("A");
    const a = A.link(5731);
    a.send(0x3003, [1, 2]);
    expect(authCode(await a.wait(0x3004))).toBe(-240);
    await h.tick(1000);
    expect(a.closedByServer).toBe(false);
    await h.tick(1000);
    expect(a.closedByServer).toBe(true);
  });

  it("07-10 (CARGA.md §4.6): a refused login never answers anything after its 0x3004 (no ok without a session)", async () => {
    const h = harness();
    const a = h.client("A").link(5731);
    a.send(0x3003, [1, 2]);
    await a.wait(0x3004);
    a.send(0x3010);
    await h.tick(1000);
    expect(a.ids()).toEqual([0x3004]);
  });

  it("07-10 −242: a second client logging into an account in use gets −242 and is closed; the first keeps playing", async () => {
    const h = harness();
    const A = h.client("A");
    await A.account(0, "Alice"); await A.enterRoom();
    const X = h.client("X", "A");                       // same user and password, another machine
    const x = X.link(5731);
    x.send(0x3001); await x.wait(0x3002);
    x.send(0x3003, X.key);
    expect(authCode(await x.wait(0x3004))).toBe(-242);
    await h.tick(2000);
    expect(x.closedByServer).toBe(true);
    const n = A.room!.mark();
    A.room!.send(0x0005);
    expect(await A.room!.wait(0x0004, n)).not.toBeNull();
  });

  it("07-10 −242: the client's own overlap 5731 -> 5732 -> room is not «in use»", async () => {
    const h = harness();
    const A = h.client("A");
    await A.account(0, "Alice");
    const a = A.link(5731);                             // still open, not said goodbye
    a.send(0x3001); await a.wait(0x3002);
    a.send(0x3003, A.key); expect(authCode(await a.wait(0x3004))).toBe(0);
    const l = A.link(5732);
    l.send(0x3001); await l.wait(0x3002);
    l.send(0x3003, A.key); expect(authCode(await l.wait(0x3004))).toBe(0);
    const r = A.link(5740);
    r.send(0x3001); await r.wait(0x3002);
    r.send(0x3003, A.key); expect(authCode(await r.wait(0x3004))).toBe(0);
  });

  it("07-10 −242: after its 0x0003 (goodbye) the connection no longer holds the account", async () => {
    const h = harness();
    const A = h.client("A");
    const a = A.link(5731);
    a.send(0x3003, A.key); await a.wait(0x3004);
    a.send(0x0003); await h.tick(400);                  // said goodbye, socket not closed yet
    const b = h.client("X", "A").link(5731);
    b.send(0x3003, A.key);
    expect(authCode(await b.wait(0x3004))).toBe(0);
  });

  it("07-10 −242 LOGIN_EN_USO_VIVA_S: a connection silent for > 90 s (dead network) stops counting", async () => {
    const h = harness();
    const A = h.client("A");
    const a = A.link(5731);
    a.send(0x3003, A.key); await a.wait(0x3004);
    await h.tick(60_000);
    let b = h.client("X", "A").link(5731);
    b.send(0x3003, A.key);
    expect(authCode(await b.wait(0x3004))).toBe(-242);
    await h.tick(31_000);
    b = h.client("Y", "A").link(5731);
    b.send(0x3003, A.key);
    expect(authCode(await b.wait(0x3004))).toBe(0);
  });

  it("07-10 −200: at MAX_SESIONES (64) live sessions the next new account gets −200", async () => {
    const h = harness();
    const links = [];
    for (let i = 0; i < 64; i++) {
      const l = h.client(`u${i}`).link(5731);
      l.send(0x3003, h.client(`k${i}`, `u${i}`).key);
      links.push(l);
    }
    await h.tick(500);
    expect(links.map((l) => authCode(l.all(0x3004)[0] ?? null)).every((c) => c === 0)).toBe(true);
    const z = h.client("z").link(5731);
    z.send(0x3003, h.client("kz", "z").key);
    expect(authCode(await z.wait(0x3004))).toBe(-200);
  });

  it("07-10 SESSION_RELEASE_S: a session with no live connection is released after 120 s; the account keeps its index (same pid)", async () => {
    const h = harness();
    const A = h.client("A");
    await A.account(0, "Alice");
    const pid = await A.enterRoom();
    A.room!.close();
    await h.tick(1000);
    expect(h.game.hub.sessions.size).toBe(1);
    await h.tick(121_000 * 2);                          // one sweep timer at a time: it re-arms while one is pending
    expect(h.game.hub.sessions.size).toBe(0);
    expect(await h.client("A2", "A").enterRoom()).toBe(pid);
  });

  it("heartbeat: 0x0005 on 5731 -> 0x3113 (FUN_0068eca0 ignores it); on the lobby -> 0x0004", async () => {
    const h = harness();
    const A = h.client("A");
    const a = A.link(5731);
    a.send(0x3003, A.key); await a.wait(0x3004);
    let n = a.mark(); a.send(0x0005);
    expect(await a.wait(0x3113, n)).not.toBeNull();
    await A.enterRoom();
    n = A.room!.mark(); A.room!.send(0x0005);
    const d = await A.room!.wait(0x0004, n);
    expect(d && u32(d)).toBe(0);
  });
});

describe("characters (personajes.py)", () => {
  it("B75: deleting a character archives its profile; the next one created in that slot starts clean", async () => {
    const h = harness();
    const A = h.client("A");
    await A.account(0, "Alice");
    const acct = () => Object.values(h.state().accounts)[0] as any;
    const st = h.state(); (Object.values(st.accounts)[0] as any).profiles["0"].rec.mp = 1; h.game.store.saveRaw(st); // must not be inherited
    const a = A.link(5731);
    a.send(0x3003, A.key); await a.wait(0x3004);
    let n = a.mark(); a.send(0x3030, [0]); await a.wait(0x3032, n);
    expect(acct().profiles["0"]).toBeUndefined();
    expect(acct().profiles_borrados.map((x: any) => [x.slot, x.motivo, x.perfil.name])).toEqual([["0", "borrar", "Alice"]]);
    a.send(0x0003); await h.tick(100); a.close();
    await A.account(0, "Carol");
    expect(acct().profiles["0"].rec.mp).not.toBe(1);
    expect(acct().profiles["0"].name).toBe("Carol");
  });

  it("before B75: creating another character over a slot whose profile has another name archives it (\"crear\")", async () => {
    const h = harness();
    const A = h.client("A");
    await A.account(0, "Alice");
    const a = A.link(5731);
    a.send(0x3003, A.key); await a.wait(0x3004);
    const n = a.mark(); a.send(0x3020, cat([0], new TextEncoder().encode("Dave\0".padEnd(16, "\0")))); await a.wait(0x3022, n);
    const acc = Object.values(h.state().accounts)[0] as any;
    expect(acc.players["0"]).toBe("Dave");
    expect(acc.profiles_borrados.map((x: any) => [x.motivo, x.perfil.name])).toEqual([["crear", "Alice"]]);
  });

  it("B12: the active character is not always slot 0: PSELECTRESULT and LIST1 use the same pid", async () => {
    const h = harness();
    const A = h.client("A");
    await A.account(1, "Second");
    const pid = await A.enterRoom(0, 5, 1);
    expect(pid).toBe(1005);
    const n = A.room!.mark(); A.room!.send(0x4210, be32(0xffffffff)); await A.room!.wait(0x4213, n);
    const me = list1(A.room!.all(0x4212, n))[0];
    expect([u32(me), cstr(me.subarray(4, 20))]).toEqual([1005, "Second"]);
  });
});

describe("presence (pvp_hub P0-4 formats, V04, P1-9)", () => {
  it("P0-4: LIST1 0x4212 entries are 36 B, me first, ≤ 28 per message; the newcomer sees both", async () => {
    const h = harness();
    const [A, B] = await two(h);
    const n = B.room!.mark(); B.room!.send(0x4210, be32(0xffffffff)); await B.room!.wait(0x4213, n);
    const ds = B.room!.all(0x4212, n);
    expect(ds.every((d) => d.length % 36 === 0 && d.length <= 28 * 36)).toBe(true);
    expect(list1(ds).map((e) => u32(e))).toEqual([B.pid, A.pid]);
    expect(u32(B.room!.all(0x4211, n)[0])).toBe(1);
  });

  it("prueba 3: the 0x3112 op 1 others get when someone enters is 100 B with LIST2 state 1 at byte 42", async () => {
    const h = harness();
    const [A, B] = await two(h);
    const j = A.room!.all(0x3112).find((d) => u32(d) === B.pid && d[4] === 1)!;
    expect(j.length).toBe(100);
    expect(j[42]).toBe(1);
    expect(u32(j, 6)).toBe(B.pid);                     // LIST1 entry right after pid, op, block
  });

  it("0x5300 is forwarded with the session's pid (a client can't move another); 0x5300 that isn't 10 B is dropped", async () => {
    const h = harness();
    const [A, B] = await two(h);
    const n = A.room!.mark();
    B.room!.send(0x5300, cat(be32(A.pid!), [0, 123, 0, 234, 3, 0]));
    B.room!.send(0x5300, [0]);
    const mv = await A.room!.wait(0x5300, n, (d) => u32(d) === B.pid);
    expect(mv && [u32(mv), u16(mv, 4), u16(mv, 6), mv[8]]).toEqual([B.pid, 123, 234, 3]);
    await h.tick(500);
    expect(A.room!.all(0x5300, n).length).toBe(1);
  });

  it("LIST2 0x4216: pid, state, 16 B parts, x, y, dir; me first (LIST_SELF, prueba 3 skins)", async () => {
    const h = harness();
    const [A, B] = await two(h);
    A.room!.send(0x5300, cat(be32(0), [0x01, 0x2c, 0, 200, 0, 0]));
    await h.tick(500);
    const n = B.room!.mark(); B.room!.send(0x4214, be32(0xffffffff)); await B.room!.wait(0x4217, n);
    const d = cat(...B.room!.all(0x4216, n));
    expect(d.length).toBe(2 * 26);
    expect(u32(d)).toBe(B.pid);
    expect([u32(d, 26), d[30], u16(d, 26 + 21), u16(d, 26 + 23)]).toEqual([A.pid, 1, 300, 200]);
  });

  it("LIST2_DUEL_23: after a state 0x67..0x6a LIST2 carries 23 B (16 B name, u8, 3×u16), not 25", async () => {
    const h = harness();
    const [A, B] = await two(h);
    const sa = h.game.hub.byPid(A.pid!)!;
    h.game.hub.setState(sa, 0x67, "Bob", 7, [1, 2, 3]);
    const n = B.room!.mark(); B.room!.send(0x4214, be32(0xffffffff)); await B.room!.wait(0x4217, n);
    const d = cat(...B.room!.all(0x4216, n));
    expect(d.length).toBe(26 + 26 + 23);
    const a = d.subarray(26);
    expect([a[4], cstr(a.subarray(26, 42)), a[42], u16(a, 43), u16(a, 45), u16(a, 47)]).toEqual([0x67, "Bob", 7, 1, 2, 3]);
  });

  it("set_state: 0x3112 op 0x67..0x6a = pid, state, block, 16 B rival name, u8, 3×u16", async () => {
    const h = harness();
    const [A, B] = await two(h);
    const n = B.room!.mark();
    h.game.hub.setState(h.game.hub.byPid(A.pid!)!, 0x67, "Bob", 9, [4, 5, 6]);
    const d = (await B.room!.wait(0x3112, n, (x) => u32(x) === A.pid))!;
    expect(d.length).toBe(6 + 23);
    expect([d[4], cstr(d.subarray(6, 22)), d[22], u16(d, 23), u16(d, 25), u16(d, 27)]).toEqual([0x67, "Bob", 9, 4, 5, 6]);
  });

  it("07-10 LIST1_STATE (§9b): LIST1 byte 34 carries another player's state (100 = room open)", async () => {
    const h = harness();
    const [A, B] = await two(h);
    B.room!.send(0x4288, new Uint8Array(28).fill(0).map((_, i) => (i === 0 ? 3 : 0)));   // open a duel room
    await h.tick(1500);
    const n = A.room!.mark(); A.room!.send(0x4210, be32(0xffffffff)); await A.room!.wait(0x4213, n);
    const b = list1(A.room!.all(0x4212, n)).find((e) => u32(e) === B.pid)!;
    expect(b[34]).toBe(100);
  });

  it("prueba 3: back on the map from a duel (0x4210/0x4202) a 0x67..0x6a state clears (others get 0x3112 op 1); 100 «room open» stays", async () => {
    const h = harness();
    const [A, B] = await two(h);
    const sa = h.game.hub.byPid(A.pid!)!;
    h.game.hub.setState(sa, 0x67, "Bob");
    let n = B.room!.mark();
    A.room!.send(0x4210, be32(0xffffffff));
    const j = (await B.room!.wait(0x3112, n, (d) => u32(d) === A.pid && d[4] === 1))!;
    expect([sa.state, j[42]]).toEqual([0, 1]);
    A.room!.send(0x4288, Uint8Array.of(3, ...new Array(27).fill(0)));
    await h.tick(1500);
    expect(sa.state).toBe(100);
    n = B.room!.mark();
    A.room!.send(0x4210, be32(0xffffffff));
    await A.room!.wait(0x4213); await h.tick(1000);
    expect(sa.state).toBe(100);
  });

  it("P1-9: a lobby connection closed without goodbye leaves the block: the others get 0x3112 op 0", async () => {
    const h = harness();
    const [A, B] = await two(h);
    const n = A.room!.mark();
    B.room!.close();
    const lv = await A.room!.wait(0x3112, n, (d) => u32(d) === B.pid);
    expect(lv && [...lv]).toEqual([...be32(B.pid!), 0, 0]);
  });

  it("0x0003 on the room: the others get 0x3112 op 0 (6 B)", async () => {
    const h = harness();
    const [A, B] = await two(h);
    const n = A.room!.mark();
    B.room!.send(0x0003);
    const lv = await A.room!.wait(0x3112, n, (d) => u32(d) === B.pid);
    expect(lv?.length).toBe(6);
    expect(lv![4]).toBe(0);
  });

  it("24-10 (§9d): a new lobby connection of the same account supersedes the old mute one: it leaves and its rooms go", async () => {
    const h = harness();
    const [A, B] = await two(h);
    B.room!.send(0x4288, Uint8Array.of(3, ...new Array(27).fill(0)));
    await h.tick(1500);
    const rid = h.game.lp.mem.rooms.size;
    expect(rid).toBe(1);
    const old = B.room!;                                // network died: the socket stays open and mute
    await h.tick(91_000);
    const pid = await h.client("B2", "B").enterRoom();
    expect(pid).toBe(B.pid);
    expect(h.game.lp.mem.rooms.size).toBe(0);
    const hub = h.game.hub, s = hub.byPid(pid!)!;
    expect(hub.blocks.get(s.block!)?.get(pid!)).toBe(s);
    expect(old.closedByServer).toBe(false);
    void A;
  });

  it("24-10 (§9c): someone entering while my LIST1 is going out still reaches me (0x3112 after 0x4213)", async () => {
    const h = harness();
    const A = h.client("A"), B = h.client("B");
    await A.account(0, "Alice"); await B.account(0, "Bob");
    await A.enterRoom();
    B.room = B.link(5740);
    B.room.send(0x3001); await B.room.wait(0x3002);
    B.room.send(0x3003, B.key); await B.room.wait(0x3004);
    const nb = B.room.mark(); B.room.send(0x4100, [5, 0]); B.pid = u32((await B.room.wait(0x4101, nb))!, 4);
    B.room.send(0x4200); await B.room.wait(0x4201, nb);
    const n = A.room!.mark();
    A.room!.send(0x4210, be32(0xffffffff));
    B.room.send(0x4202, [0, 0]);
    await A.room!.wait(0x4213, n);
    await h.tick(2000);
    const inList = list1(A.room!.all(0x4212, n)).some((e) => u32(e) === B.pid);
    const joined = A.room!.all(0x3112, n).some((d) => u32(d) === B.pid && d[4] === 1);
    expect(inList || joined).toBe(true);
  });
});

describe("areas = blocks (AREA_BLOCKS, 06-10)", () => {
  it("GetInitPos(13,8): entering a room (0x4202 [_, 0]) the 0x4203 area is the world's entry, 5 red door / 0 blue door", async () => {
    const h = harness();
    const A = h.client("A");
    await A.account(0, "Alice");
    for (const [kindIndex, area] of [[0, 0], [4, 5], [5, 5]]) {     // kinds 13 (blue), 14 and 1 (red)
      const r = A.link(5740 + kindIndex);
      r.send(0x3003, A.key); await r.wait(0x3004);
      let n = r.mark(); r.send(0x4100, [5, 0]); await r.wait(0x4101, n);
      n = r.mark(); r.send(0x4202, [0, 0]);
      const d = (await r.wait(0x4203, n))!;
      expect(d[5], `kind index ${kindIndex}`).toBe(area);
      r.send(0x0003); await h.tick(400); r.close(); await h.tick(50);
    }
  });

  it("BLOCKLIST 0x4201 has one entry per area of the room's world: u16 8, then u16 0, u8 area, u8 kind, u8 id", async () => {
    const h = harness();
    const A = h.client("A");
    await A.account(0, "Alice");
    const r = A.link(5744);                            // kind 14, Duel Academy (world 1)
    r.send(0x3003, A.key); await r.wait(0x3004);
    let n = r.mark(); r.send(0x4100, [5, 0]); await r.wait(0x4101, n);
    n = r.mark(); r.send(0x4200);
    const d = (await r.wait(0x4201, n))!;
    expect(u16(d)).toBe(8);
    const ents = Array.from({ length: (d.length - 2) / 5 }, (_, i) => [...d.subarray(2 + 5 * i, 7 + 5 * i)]);
    expect(ents).toEqual([[0, 0, 4, 14, 0], [0, 0, 5, 14, 1], [0, 0, 6, 14, 2], [0, 0, 7, 14, 3]]);
  });

  it("crossing a door (0x4202 [id, 1]) moves me to that area's block: 0x4203 says it, the others get 0x3112 op 1 with it", async () => {
    const h = harness();
    const A = h.client("A"), B = h.client("B");
    await A.account(0, "Alice"); await B.account(0, "Bob");
    await A.enterRoom(4); await B.enterRoom(4);
    const n = A.room!.mark(), m = B.room!.mark();
    B.room!.send(0x4202, [2, 1]);
    const r = (await B.room!.wait(0x4203, m))!;
    expect([i32(r), r[4]]).toEqual([0, 2]);              // area: the client decides the destination on a change
    const j = await A.room!.wait(0x3112, n, (d) => u32(d) === B.pid && d[4] === 1);
    expect(j && j[5]).toBe(2);
  });
});
