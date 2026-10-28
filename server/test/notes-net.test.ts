// py yo2srv/red/conexion.py + servidor.py notes (Conn seq rules, B04, B59, 13-10, untrusted input) -> src/net/conn.ts,
// src/world.ts.
import { afterEach, describe, expect, it, vi } from "vitest";
import { Conn, type ConnHost } from "../src/net/conn.ts";
import { pack, Reader } from "../src/net/proto.ts";
import { harness, xor } from "./notes-harness.ts";

afterEach(() => { vi.useRealTimers(); });

/** A bare Conn on a host whose "current connection" per (peer, port) is the last one registered. */
function bare() {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "Date"] });
  const cur = new Map<string, Conn>();
  const log: string[] = [];
  const host: ConnHost = { currentConn: (c) => cur.get(`${c.peer}|${c.port}`), log: (s) => log.push(s) };
  const table = Conn.newSeqTable();
  const mk = (port = 5731, peer = "p1", ok: () => boolean = () => true) => {
    const out: { id: number; param: number; len: number }[] = [];
    const rd = new Reader();
    const c = new Conn(host, table, port, peer, (b) => {
      if (!ok()) return false;
      for (const m of rd.feed(b)) out.push({ id: m.id, param: m.param, len: m.data.length });
      return true;
    }, 5760);
    cur.set(`${peer}|${port}`, c);
    return { c, out };
  };
  return { mk, cur, log, flush: () => vi.advanceTimersByTimeAsync(5000) };
}

describe("conexion.py Conn", () => {
  it("V01: every accounts/lobby/room connection starts its own count at #1", async () => {
    const h = harness();
    const A = h.client("A"), B = h.client("B");
    await A.gate(); await B.gate();
    await A.account(0, "Alice"); await B.account(0, "Bob");
    await A.enterRoom(); await B.enterRoom();
    for (const cl of [A, B])
      for (const l of cl.links.values()) if (l.port !== 5730) expect(l.msgs[0]?.param, `${cl.name}:${l.port}`).toBe(1);
    expect([...A.errors(), ...B.errors()]).toEqual([]); // two clients on the same ports never shift each other
  });

  it("V01/GATE_SEQ: a second gate connection of the same client continues the server's count (#3, #5…)", async () => {
    const h = harness();
    const A = h.client("A");
    await A.gate();
    const first = [...A.links.values()][0];
    const last = first.msgs.at(-1)!.param;
    await A.gate();
    const second = [...A.links.values()][1];
    expect(second.msgs[0].param).toBe(last + 1);
    expect(A.errors()).toEqual([]);
  });

  it("27-10: re-entering accounts from the title in the same process (0x3001 #29) continues the server's count", async () => {
    const h = harness();
    const A = h.client("A");
    const a1 = A.link(5731);
    a1.send(0x3001); await a1.wait(0x3002);
    a1.send(0x3003, A.key); await a1.wait(0x3004);
    const srvLast = a1.msgs.at(-1)!.param, cliLast = a1.txBox[0];
    a1.close(); await h.tick(10);
    const a2 = A.link(5731, [srvLast], [cliLast]);     // the client keeps both counters on the port
    a2.send(0x3001); await a2.wait(0x3002);
    expect(a2.msgs[0].param).toBe(srvLast + 1);
    expect(A.errors()).toEqual([]);
  });

  it("V01: a connection that starts again at #1 restarts the server's count", async () => {
    const h = harness();
    const A = h.client("A");
    const a1 = A.link(5731);
    a1.send(0x3001); await a1.wait(0x3002);
    a1.send(0x3003, A.key); await a1.wait(0x3004);
    a1.close(); await h.tick(10);
    const a2 = A.link(5731);
    a2.send(0x3001); await a2.wait(0x3002);
    expect(a2.msgs[0].param).toBe(1);
  });

  it("26-10 (web): two clients behind the same IP keep separate continued counts", async () => {
    const h = harness();
    const A = h.client("A"), B = h.client("B");
    await A.gate(); await B.gate(); await B.gate(); await A.gate(); await B.gate();
    expect([...A.errors(), ...B.errors()]).toEqual([]);
  });

  it("B04: a reply over 1024 B is never sent (and spends no seq number)", async () => {
    const t = bare();
    const { c, out } = t.mk();
    c.sawClient(1);
    c.send(0x3002, new Uint8Array(1025));
    c.send(0x3004, new Uint8Array(1024));
    await t.flush();
    expect(out).toEqual([{ id: 0x3004, param: 1, len: 1024 }]);
    expect(t.log.some((l) => l.includes("NOT sent"))).toBe(true);
  });

  it("B59: nothing goes out on a closed connection", async () => {
    const t = bare();
    const { c, out } = t.mk();
    c.sawClient(1);
    c.closed = true;
    c.send(0x3002);
    await t.flush();
    expect(out).toEqual([]);
  });

  it("B59: nothing goes out on a stale connection (this client already talks on a newer one)", async () => {
    const t = bare();
    const old = t.mk(5732), neu = t.mk(5732);
    old.c.sawClient(1); neu.c.sawClient(1);
    old.c.send(0x4101); neu.c.send(0x4101);
    await t.flush();
    expect(old.out).toEqual([]);
    expect(neu.out.map((m) => m.param)).toEqual([1]);
  });

  it("B59: the seq number is spent only if the write succeeds", async () => {
    const t = bare();
    let ok = false;
    const { c, out } = t.mk(5731, "p1", () => ok);
    c.sawClient(1);
    c.send(0x3002);
    await t.flush();
    expect(c.closed).toBe(true);
    expect(c.seq).toBe(0);
    ok = true; c.closed = false;
    c.send(0x3002);
    await t.flush();
    expect(out.map((m) => m.param)).toEqual([1]);
  });

  it("13-10: a connection that has not spoken yet does not make a talking one stale", async () => {
    const t = bare();
    const talking = t.mk(5730);
    talking.c.sawClient(1);
    const silent = t.mk(5730);                    // the host launcher's gate check from the same peer
    expect(talking.c.stale()).toBe(false);
    talking.c.send(0x2003, new Uint8Array(48));
    await t.flush();
    expect(talking.out.length).toBe(1);
    silent.c.sawClient(1);                         // once the new one talks, the old one is stale
    expect(talking.c.stale()).toBe(true);
  });

  it("2026-10-06: a new duel connection arriving with the client's continued number continues the account's count", () => {
    const t = bare();
    const sess = { acct: "acctA", conns: new Map() };
    const d1 = t.mk(5760, "p1");
    d1.c.sess = sess; d1.c.sawClient(1);
    d1.c.seq = 7;                                  // seven replies out on the first duel
    const lastClient = 24;
    for (let p = 2; p <= lastClient; p++) d1.c.sawClient(p);
    d1.c.seq = 9;
    const d2 = t.mk(5760, "p1");
    d2.c.sawClient(lastClient + 1);                // 0x6001 #25 before the session is known
    d2.c.sess = sess;                              // attach by the 0x6001 pid
    expect(d2.c.seq).toBe(9);
  });
});

describe("servidor.py serve/_handle (untrusted input)", () => {
  it("a header with length > 1024 closes the connection before waiting for the data", async () => {
    const h = harness();
    const A = h.client("A");
    const l = A.link(5731);
    const hdr = new Uint8Array(24);
    new DataView(hdr.buffer).setUint16(0, 0x3001); new DataView(hdr.buffer).setUint16(2, 60000); new DataView(hdr.buffer).setUint32(4, 1);
    l.raw(xor(hdr));
    await h.tick(100);
    expect(l.closedByServer).toBe(true);
  });

  it("a bad MD5 closes the connection", async () => {
    const h = harness();
    const A = h.client("A");
    const l = A.link(5732);
    const bad = pack(0x3001, new Uint8Array(0), 1); bad[10] ^= 0xff;
    l.raw(bad);
    await h.tick(100);
    expect(l.closedByServer).toBe(true);
    expect(l.msgs).toEqual([]);
  });

  it("64 KB of garbage closes; short or odd well-formed messages crash nothing; a normal client still gets in", async () => {
    const h = harness();
    const X = h.client("X");
    const junk = X.link(5740);
    junk.raw(new Uint8Array(65536).map((_, i) => (i * 131 + 7) & 0xff));
    await h.tick(100);
    expect(junk.closedByServer).toBe(true);
    const r = X.link(5740);
    for (const [mid, d] of [[0x3003, [1, 2]], [0x4100, []], [0x3003, new Array(32).fill(7)], [0x4100, [5]], [0x4202, []],
      [0x5300, [0]], [0x5310, []], [0x4170, [0, 0]], [0x4172, [9]], [0x5320, []], [0x4214, []], [0x4288, [0]],
      [0x9999, new Array(1024).fill(0)]] as [number, number[]][]) r.send(mid, d);
    await h.tick(3000);
    const Y = h.client("Y");
    expect(await Y.gate()).not.toBeNull();
    expect((await Y.account(0, "Nuevo"))[0]).toBe("Nuevo");
    expect(await Y.enterRoom()).not.toBeNull();
    expect(h.log.some((l) => l.includes("handler error"))).toBe(false);
  });

  it("07-10 MAX_CONNS_PER_IP: a client's 33rd open socket is refused", () => {
    const h = harness();
    const A = h.client("A");
    for (let i = 0; i < 33; i++) A.link(5730);
    const st = [...A.openStatus.values()];
    expect(st.filter((s) => s === 0).length).toBe(32);
    expect(st.at(-1)).toBe(-111);
  });

  it("read model: a connection's next request is handled only after the replies to the previous one went out", async () => {
    const h = harness();
    const A = h.client("A");
    const a = A.link(5731);
    a.send(0x3001);
    a.send(0x3003, A.key);                         // back to back, like a client that does not wait
    await a.wait(0x3004);
    const iRep = h.log.findIndex((l) => l.includes("-> 0x3002"));
    const iReq = h.log.findIndex((l) => l.includes("<- 0x3003"));
    expect(iRep).toBeGreaterThan(-1);
    expect(iReq).toBeGreaterThan(iRep);
  });

  it("07-10 (CARGA.md §4.6): a message on a game connection without a session touches no profile", async () => {
    const h = harness();
    const A = h.client("A");
    const a = A.link(5731);
    a.send(0x3001); await a.wait(0x3002);
    a.send(0x3020, [0, ...new Array(16).fill(0x41)]);   // REGPLAYER without 0x3003
    await h.tick(1000);
    const st = h.state();
    expect(st.players).toEqual({});
    expect(Object.keys(st.accounts ?? {})).toEqual([]);
  });

  it.todo("servidor.py IDLE_TIMEOUT: a socket with nothing received in 600 s is closed (not ported: no idle timer in World)");
});
