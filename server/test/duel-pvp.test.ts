// A PvP match driven through the real duel port (src/duel: port.ts -> pvpMatch.ts -> ocgSession.ts PvpSession ->
// the in-process engine and translator), two clients on in-memory Conns: it starts (decks, rock-paper-scissors, both
// 0x61fe), the challenger surrenders at its first decision, and both get their end (0x4d) and their lobby result.
// PvP is free: the match leaves no duel-point history in the state (no balance field, no charge, nothing about it).
// Needs gamedata/ (engine data, translator.json, brain_cards.json, duel.json).
import { existsSync } from "node:fs";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { configFrom, DUEL_PORT } from "../src/config.ts";
import { buildServer, type Server } from "../src/server.ts";
import { Conn } from "../src/net/conn.ts";
import { Reader, W } from "../src/net/proto.ts";
import { Session } from "../src/game/hub.ts";
import { createNodeDuelCore } from "../src/duel/engine/node.ts";
import { NPC_DECKS, setDuelCore } from "../src/duel/data.ts";
import { AFK, DUEL_GRACE, type PvpMatch } from "../src/duel/pvpMatch.ts";
import type { DuelArchiveEntry } from "../src/duel/duelArchive.ts";
import { MSG, readYrpx } from "../src/duel/engine/yrpx.ts";

const GD = join(import.meta.dirname, "..", "gamedata");
const have = ["engine/scripts.pack", "translator.json", "brain_cards.json", "duel.json"].every((f) => existsSync(join(GD, f)));
const ROOM_PORT = 5740;

interface Client { name: string; s: Session; lobby: Conn; duel: Conn; got: { lobby: [number, Uint8Array][]; duel: [number, Uint8Array][] } }

const u32 = (d: Uint8Array, at = 0) => new DataView(d.buffer, d.byteOffset, d.byteLength).getUint32(at);
const type6202 = (d: Uint8Array) => u32(d, 0) & 0xff;
const deckMsg = (ids: number[]) => { const w = new W().u32(ids.length); for (const x of ids) w.u16(x); return w.bytes(); };

describe.skipIf(!have)("PvP through the duel port", () => {
  const logs: string[] = [];
  let srv: Server;
  const state = {
    accounts: {
      aaaa: { idx: 1, players: { "0": "Alfa" }, profiles: {}, active_slot: 0 },
      bbbb: { idx: 2, players: { "0": "Beta" }, profiles: {}, active_slot: 0 },
    },
  };

  beforeAll(async () => {
    setDuelCore(await createNodeDuelCore());
    srv = buildServer(configFrom({ PARITY_SEED: "1", PVP_TEST: "1", DUEL_PAUSE: "0.0005" }), structuredClone(state), (x) => logs.push(x));
  }, 60_000);
  afterAll(() => setDuelCore(null));

  function client(name: string, acct: string, idx: number): Client {
    const g = srv.game, w = srv.world;
    const s = new Session(acct, idx, false);
    s.slot = 0; s.pid = g.hub.pidFor(s, 0); s.name = name;
    g.hub.sessions.set(acct, s);
    const got: Client["got"] = { lobby: [], duel: [] };
    const sink = (k: "lobby" | "duel") => { const r = new Reader(); return (b: Uint8Array) => { for (const m of r.feed(b)) got[k].push([m.id, m.data]); return true; }; };
    const lobby = new Conn(w, w.seqTable, ROOM_PORT, `peer-${name}`, sink("lobby"), DUEL_PORT);
    const duel = new Conn(w, w.seqTable, DUEL_PORT, `peer-${name}`, sink("duel"), DUEL_PORT);
    lobby.sess = s; s.conns.set(ROOM_PORT, lobby); s.lobby = lobby;
    return { name, s, lobby, duel, got };
  }

  /** a client message on its duel connection, as the World runs it (0x6001 attaches the session by pid) */
  const send = (c: Client, mid: number, data: Uint8Array = new Uint8Array(0)) => srv.world.run(() => {
    const g = srv.game;
    if (mid === 0x6001 && !c.duel.sess) g.hub.attach(c.duel, c.s.pid!);
    g.enter(c.duel);
    g.duel!.duelReply(c.duel, mid, 0, data);
  });
  const until = async (cond: () => boolean, ms = 30_000) => {
    const end = Date.now() + ms;
    while (!cond()) { if (Date.now() > end) throw new Error("timeout"); await new Promise((r) => setTimeout(r, 10)); }
  };
  const has = (c: Client, mid: number, pred: (d: Uint8Array) => boolean = () => true, from = 0) => c.got.duel.slice(from).some(([m, d]) => m === mid && pred(d));

  it("starts, the challenger surrenders, both get their end; no duel-point history", async () => {
    const archived: DuelArchiveEntry[] = [];
    srv.game.duelArchive = (e) => archived.push(e);
    const A = client("Alfa", "aaaa", 1), B = client("Beta", "bbbb", 2);
    const m = srv.game.pvp!.reserve(A.s, B.s, "room") as unknown as PvpMatch;
    for (const [c, nid] of [[A, 51], [B, 54]] as [Client, number][]) {
      const d = NPC_DECKS[String(nid)];
      await send(c, 0x6001, new W().u32(c.s.pid!).bytes());
      await send(c, 0x6600, new W().u32(d.main.length).u32(0).u32(d.extra.length).bytes());
      await send(c, 0x6601, deckMsg(d.main));
      await send(c, 0x6603, deckMsg(d.extra));
      await send(c, 0x600b);
    }
    await until(() => has(A, 0x6005) && has(B, 0x6005));
    expect(u32(A.got.duel.find(([x]) => x === 0x600c)![1], 32)).toBe(A.s.pid);
    for (const c of [A, B]) await send(c, 0x6100);
    await send(A, 0x6101, Uint8Array.of(0));
    await send(B, 0x6101, Uint8Array.of(1));          // (1 - 0) % 3 = 1: A wins and chooses
    for (const c of [A, B]) await send(c, 0x6102);
    await send(A, 0x6103, Uint8Array.of(0));          // A starts
    await until(() => has(B, 0x6103, (d) => d[0] === 1));
    const na = A.got.duel.length;
    for (const c of [A, B]) await send(c, 0x61fe, Uint8Array.of(1));
    await until(() => has(A, 0x6202, (d) => type6202(d) === 0x1a, na));
    await send(A, 0x6350, new W().u32(0).u32(0xd).u32(0).u32(10).bytes());
    await until(() => has(A, 0x6202, (d) => type6202(d) === 0x1b && u32(d, 4) === 0x32));
    await send(A, 0x6423, new W().u32(1).bytes());
    await until(() => has(A, 0x6202, (d) => type6202(d) === 0x4d) && has(B, 0x6202, (d) => type6202(d) === 0x4d));
    await until(() => [A, B].every((c) => c.got.lobby.some(([x]) => x === 0x4800)));
    const fin = (c: Client) => u32(c.got.duel.filter(([x, d]) => x === 0x6202 && type6202(d) === 0x4d).at(-1)![1], 8);
    expect([fin(A), fin(B)]).toEqual([2, 1]);
    expect(B.got.duel.find(([x]) => x === 0x649b)?.[1]).toEqual(Uint8Array.of(2, 1));
    for (const c of [A, B]) {
      const ids = c.got.lobby.map(([x]) => x);
      expect(ids.indexOf(0x4140)).toBeGreaterThanOrEqual(0);
      expect(ids.indexOf(0x4140)).toBeLessThan(ids.indexOf(0x4800));
    }
    expect(m.done).toBe(true);
    expect(srv.game.pvp!.byPid(A.s.pid!)).toBeNull();
    // the surrender says, where Workers Logs keeps it, whom the duel was waiting on (a "frozen" duel's answer)
    expect(logs.find((l) => l.includes("se rinde el jugador 0"))).toMatch(/^\[AVISO\] \[pvp\] .*el duelo esperaba a player 0 \(SELECT_IDLECMD, mode \w+\) for \d+ s$/);
    // the match was recorded (duels, result) and nothing about duel points was
    const st = srv.game.store.loadRaw();
    for (const acct of ["aaaa", "bbbb"]) {
      const p = st.accounts[acct].profiles["0"];
      expect(p.rec.duels).toBe(1);
      const keys = JSON.stringify(st.accounts[acct]).match(/"[a-z_]*dp[a-z_]*"/gi) ?? [];
      expect(keys).toEqual([]);
    }
    expect(st.accounts.aaaa.profiles["0"].rec.losses).toBe(1);
    expect(st.accounts.bbbb.profiles["0"].rec.wins).toBe(1);
    // the game is archived once, both players named, with its EDOPro replay: A went first (core player 0), B won by
    // surrender (EDOPro's MSG_WIN 1, reason 0)
    srv.game.duelArchive = null;
    expect(archived.length).toBe(1);
    const e = archived[0]!;
    expect([e.kind, e.a.acct, e.b?.acct, e.a.name, e.b?.name, e.result, e.game, e.first]).toEqual(["pvp", "aaaa", "bbbb", "Alfa", "Beta", "lose", 1, 0]);
    const r = readYrpx(e.yrpx!);
    expect(r.names).toEqual(["Alfa", "Beta"]);
    expect(r.packets[0]!.message).toBe(MSG.START);
    const win = r.packets.at(-1)!;
    expect([win.message, win.data[0], win.data[1]]).toEqual([MSG.WIN, 1, 0]);
  }, 120_000);

  it("a room with «Time Limit» OFF shows no clock, but the player who never answers loses on time", async () => {
    const A = client("Alfa2", "aaaa", 1), B = client("Beta2", "bbbb", 2);
    const m = srv.game.pvp!.reserve(A.s, B.s, "room") as unknown as PvpMatch;
    m.roomTime = 0;
    AFK.s = 2;
    try {
      for (const [c, nid] of [[A, 51], [B, 54]] as [Client, number][]) {
        const d = NPC_DECKS[String(nid)];
        await send(c, 0x6001, new W().u32(c.s.pid!).bytes());
        await send(c, 0x6600, new W().u32(d.main.length).u32(0).u32(d.extra.length).bytes());
        await send(c, 0x6601, deckMsg(d.main));
        await send(c, 0x6603, deckMsg(d.extra));
        await send(c, 0x600b);
      }
      await until(() => has(A, 0x6005) && has(B, 0x6005));
      for (const c of [A, B]) await send(c, 0x6100);
      await send(A, 0x6101, Uint8Array.of(0));
      await send(B, 0x6101, Uint8Array.of(1));
      for (const c of [A, B]) await send(c, 0x6102);
      await send(A, 0x6103, Uint8Array.of(0));
      await until(() => has(B, 0x6103, (d) => d[0] === 1));
      const na = A.got.duel.length;
      for (const c of [A, B]) await send(c, 0x61fe, Uint8Array.of(1));
      await until(() => has(A, 0x6202, (d) => type6202(d) === 0x1a, na));   // A's first decision: A never answers
      await until(() => m.done, 20_000);
      expect([A, B].some((c) => c.got.duel.some(([x]) => x === 0x6461))).toBe(false);   // no clock shown
      expect(B.got.duel.find(([x]) => x === 0x649b)?.[1][0]).toBe(3);                    // SVR_TIMEUP
      const st = srv.game.store.loadRaw();
      expect(st.accounts.bbbb.profiles["0"].rec.wins).toBe(2);
      // the duel's kept [pvp] lines, once, as one [AVISO] line (production drops info lines)
      const tr = logs.filter((x) => x.startsWith("[AVISO] [pvp]") && x.includes(" trace ("));
      expect(tr.length).toBe(1);
      expect(tr[0]).toMatch(/aaaa vs bbbb, timeout, \d+ s\): .*arranca.* \| .*se acaba el tiempo/);
    } finally { AFK.s = 600; }
  }, 120_000);

  it("spectators get the public view: neither player's hand", async () => {
    const A = client("Alfa3", "aaaa", 1), B = client("Beta3", "bbbb", 2);
    const m = srv.game.pvp!.reserve(A.s, B.s, "room") as unknown as PvpMatch;
    const BLUE_EYES = 89631139, deck = Array(40).fill(BLUE_EYES);   // nothing can be summoned: every card stays hidden
    const deck32 = (ids: number[]) => { const w = new W().u32(ids.length); for (const x of ids) w.u32(x); return w.bytes(); };
    for (const c of [A, B]) {
      await send(c, 0x6001, new W().u32(c.s.pid!).bytes());
      await send(c, 0x6600, new W().u32(40).u32(0).u32(0).bytes());
      await send(c, 0x6601, deck32(deck));
      await send(c, 0x6603, deck32([]));
      await send(c, 0x600b);
    }
    await until(() => has(A, 0x6005) && has(B, 0x6005));
    for (const c of [A, B]) await send(c, 0x6100);
    await send(A, 0x6101, Uint8Array.of(0));
    await send(B, 0x6101, Uint8Array.of(1));
    for (const c of [A, B]) await send(c, 0x6102);
    await send(A, 0x6103, Uint8Array.of(0));
    await until(() => has(B, 0x6103, (d) => d[0] === 1));
    const na = A.got.duel.length;
    for (const c of [A, B]) await send(c, 0x61fe, Uint8Array.of(1));
    await until(() => has(A, 0x6202, (d) => type6202(d) === 0x1a, na));
    const seen: [number, Uint8Array][] = [];
    const rd = new Reader();
    const wc = new Conn(srv.world, srv.world.seqTable, DUEL_PORT, "peer-watch", (b) => { for (const x of rd.feed(b)) seen.push([x.id, x.data]); return true; }, DUEL_PORT);
    m.watchAttach(wc);
    await until(() => seen.some(([x]) => x === 0x6701));
    m.on(wc, 0x6702, 0, new Uint8Array(0));
    await until(() => seen.some(([x]) => x === 0x6202));
    const code = Buffer.from(new W().u32(BLUE_EYES).bytes());
    expect(A.got.duel.some(([x, d]) => x === 0x6202 && Buffer.from(d).includes(code))).toBe(true);   // A sees its own hand
    expect(seen.some(([x, d]) => x === 0x6202 && Buffer.from(d).includes(code))).toBe(false);       // the spectator doesn't
    await send(A, 0x6350, new W().u32(0).u32(0xd).u32(0).u32(10).bytes());
    await until(() => has(A, 0x6202, (d) => type6202(d) === 0x1b && u32(d, 4) === 0x32));
    await send(A, 0x6423, new W().u32(1).bytes());
    await until(() => m.done);
    // A spectator must receive the terminal command too, even when the match ends
    // outside duelcore (surrender / disconnect / server deadline).
    const terminal = () => seen.some(([mid, data]) => mid === 0x6202 && type6202(data) === 0x4d);
    for (let i = 0; i < 20 && !terminal(); i++) {
      m.on(wc, 0x6702, 0, new Uint8Array(0));
      await new Promise((r) => setTimeout(r, 10));
    }
    expect(terminal()).toBe(true);
  }, 120_000);

  describe("a duel socket that closes mid-duel (Cloudflare cut every socket at once, 2026-10-31)", () => {
    /** A and B in a duel, at A's first decision */
    async function duelOn(tag: string) {
      const A = client("Alfa" + tag, "aaaa", 1), B = client("Beta" + tag, "bbbb", 2);
      const m = srv.game.pvp!.reserve(A.s, B.s, "room") as unknown as PvpMatch;
      for (const [c, nid] of [[A, 51], [B, 54]] as [Client, number][]) {
        const d = NPC_DECKS[String(nid)];
        await send(c, 0x6001, new W().u32(c.s.pid!).bytes());
        await send(c, 0x6600, new W().u32(d.main.length).u32(0).u32(d.extra.length).bytes());
        await send(c, 0x6601, deckMsg(d.main));
        await send(c, 0x6603, deckMsg(d.extra));
        await send(c, 0x600b);
      }
      await until(() => has(A, 0x6005) && has(B, 0x6005));
      for (const c of [A, B]) await send(c, 0x6100);
      await send(A, 0x6101, Uint8Array.of(0));
      await send(B, 0x6101, Uint8Array.of(1));
      for (const c of [A, B]) await send(c, 0x6102);
      await send(A, 0x6103, Uint8Array.of(0));
      await until(() => has(B, 0x6103, (d) => d[0] === 1));
      const na = A.got.duel.length;
      for (const c of [A, B]) await send(c, 0x61fe, Uint8Array.of(1));
      await until(() => has(A, 0x6202, (d) => type6202(d) === 0x1a, na));
      return { A, B, m };
    }
    const rec = () => { const st = srv.game.store.loadRaw(); return ["aaaa", "bbbb"].map((a) => ({ ...st.accounts[a].profiles["0"].rec })); };
    const drop = (m: PvpMatch, c: Client) => srv.world.run(() => m.onClose(c.duel));
    beforeAll(() => { DUEL_GRACE.s = 1; });
    afterAll(() => { DUEL_GRACE.s = 45; });

    it("both drop at once and neither comes back: no result for either", async () => {
      const { A, B, m } = await duelOn("4");
      const duels = () => (srv.game.admin.run("online", {}) as { duels: number }).duels;   // deploys wait for 0
      expect(duels()).toBe(1);
      const before = rec();
      await drop(m, A); await drop(m, B);
      expect(m.done).toBe(false);                                   // the grace first
      expect(duels(), "a duel in its reconnect grace still counts").toBe(1);
      await until(() => m.done, 10_000);
      expect(rec().map((r) => [r.duels, r.wins, r.losses])).toEqual(before.map((r) => [r.duels, r.wins, r.losses]));
      expect(logs.some((l) => l.includes(`${m.name}: neither player came back`))).toBe(true);
      expect(duels()).toBe(0);
    }, 120_000);

    it("one drops and doesn't come back: the other is told to wait, then wins", async () => {
      const { A, B, m } = await duelOn("5");
      const before = rec();
      await drop(m, A);
      await until(() => m.done, 10_000);
      expect(B.got.lobby.some(([x, d]) => x === 0x4402 && Buffer.from(d).includes(Buffer.from("Your opponent lost the connection")))).toBe(true);
      const after = rec();
      expect([after[0].losses - (before[0].losses ?? 0), after[1].wins - (before[1].wins ?? 0)]).toEqual([1, 1]);
    }, 120_000);

    it("one drops and comes back on a new duel connection in time: the pending prompt again, the duel goes on", async () => {
      const { A, m } = await duelOn("6");
      await drop(m, A);
      const rd = new Reader(), got2: [number, Uint8Array][] = [];
      A.duel = new Conn(srv.world, srv.world.seqTable, DUEL_PORT, "peer-Alfa6b", (b) => { for (const x of rd.feed(b)) got2.push([x.id, x.data]); return true; }, DUEL_PORT);
      await send(A, 0x6001, new W().u32(A.s.pid!).bytes());
      await until(() => got2.some(([x, d]) => x === 0x6202 && type6202(d) === 0x1a));   // A's decision, resent
      await new Promise((r) => setTimeout(r, 1500));                                       // past the grace
      expect(m.done).toBe(false);
      await send(A, 0x6350, new W().u32(0).u32(0xd).u32(0).u32(10).bytes());             // and A can still play: surrender
      await until(() => got2.some(([x, d]) => x === 0x6202 && type6202(d) === 0x1b && u32(d, 4) === 0x32));
      await send(A, 0x6423, new W().u32(1).bytes());
      await until(() => m.done);
    }, 120_000);

    it("a re-attach that says how many 0x6202 it got (u32 pid + u32 n) gets every later one again, in order", async () => {
      const { A, m } = await duelOn("8");
      const seen = A.got.duel.filter(([x]) => x === 0x6202).map(([, d]) => Buffer.from(d).toString("hex"));
      await drop(m, A);
      const rd = new Reader(), got2: [number, Uint8Array][] = [];
      A.duel = new Conn(srv.world, srv.world.seqTable, DUEL_PORT, "peer-Alfa8b", (b) => { for (const x of rd.feed(b)) got2.push([x.id, x.data]); return true; }, DUEL_PORT);
      await send(A, 0x6001, new W().u32(A.s.pid!).u32(seen.length - 2).bytes());   // as if the last two never arrived
      await until(() => got2.filter(([x]) => x === 0x6202).length >= 2);
      await new Promise((r) => setTimeout(r, 200));
      expect(got2.filter(([x]) => x === 0x6202).map(([, d]) => Buffer.from(d).toString("hex"))).toEqual(seen.slice(-2));
      await send(A, 0x6350, new W().u32(0).u32(0xd).u32(0).u32(10).bytes());
      await until(() => got2.some(([x, d]) => x === 0x6202 && type6202(d) === 0x1b && u32(d, 4) === 0x32));
      await send(A, 0x6423, new W().u32(1).bytes());
      await until(() => m.done);
    }, 120_000);

    it("a re-attach with no live duel (u32 pid + u32 n) is refused (0x6007 s32 0); a new duel's 4-byte 0x6001 is booked", async () => {
      const A = client("Alfa9", "aaaa", 1);
      await send(A, 0x6001, new W().u32(A.s.pid!).u32(130).bytes());
      await until(() => has(A, 0x6007));
      expect(A.got.duel.find(([x]) => x === 0x6007)![1]).toEqual(new W().u32(0).bytes());
      const B = client("Beta9", "bbbb", 2);
      await send(B, 0x6001, new W().u32(B.s.pid!).bytes());
      await until(() => has(B, 0x6007));
      expect(B.got.duel.find(([x]) => x === 0x6007)![1]).toEqual(new W().u32(1).bytes());
    }, 30_000);

    it("a deploy's shutdown (g.stopping): the duel ends at once with no result", async () => {
      const { A, m } = await duelOn("7");
      const before = rec();
      srv.game.stopping = true;
      try {
        await drop(m, A);
        await until(() => m.done, 500);                              // well before the 1 s grace
        expect(rec().map((r) => [r.duels, r.wins, r.losses])).toEqual(before.map((r) => [r.duels, r.wins, r.losses]));
      } finally { srv.game.stopping = false; }
    }, 120_000);
  });
});
