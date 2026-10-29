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
import { AFK, type PvpMatch } from "../src/duel/pvpMatch.ts";

const GD = join(import.meta.dirname, "..", "gamedata");
const have = ["engine/scripts.pack", "translator.json", "brain_cards.json", "duel.json"].every((f) => existsSync(join(GD, f)));
const ROOM_PORT = 5740;

interface Client { name: string; s: Session; lobby: Conn; duel: Conn; got: { lobby: [number, Uint8Array][]; duel: [number, Uint8Array][] } }

const u32 = (d: Uint8Array, at = 0) => new DataView(d.buffer, d.byteOffset, d.byteLength).getUint32(at);
const type6202 = (d: Uint8Array) => u32(d, 0) & 0xff;
const deckMsg = (ids: number[]) => { const w = new W().u32(ids.length); for (const x of ids) w.u16(x); return w.bytes(); };

describe.skipIf(!have)("PvP through the duel port", () => {
  let srv: Server;
  const state = {
    accounts: {
      aaaa: { idx: 1, players: { "0": "Alfa" }, profiles: {}, active_slot: 0 },
      bbbb: { idx: 2, players: { "0": "Beta" }, profiles: {}, active_slot: 0 },
    },
  };

  beforeAll(async () => {
    setDuelCore(await createNodeDuelCore());
    srv = buildServer(configFrom({ PARITY_SEED: "1", PVP_TEST: "1", DUEL_PAUSE: "0.0005" }), structuredClone(state), () => {});
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
    const A = client("Alfa", "aaaa", 1), B = client("Beta", "bbbb", 2);
    const m = srv.game.pvp!.reserve(A.s, B.s) as unknown as PvpMatch;
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
  }, 120_000);

  it("a room with «Time Limit» OFF shows no clock, but the player who never answers loses on time", async () => {
    const A = client("Alfa2", "aaaa", 1), B = client("Beta2", "bbbb", 2);
    const m = srv.game.pvp!.reserve(A.s, B.s) as unknown as PvpMatch;
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
    } finally { AFK.s = 600; }
  }, 120_000);

  it("spectators get the public view: neither player's hand", async () => {
    const A = client("Alfa3", "aaaa", 1), B = client("Beta3", "bbbb", 2);
    const m = srv.game.pvp!.reserve(A.s, B.s) as unknown as PvpMatch;
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
  }, 120_000);
});
