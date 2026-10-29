// Free mode (src/game/freemode.ts): two free players with decks they don't own get a real PvP match (the forbidden list
// still applies), its end pays nothing and changes nothing but the free record; a session keeps its mode while it
// lives; free sessions sit in blocks of their own and are refused the MMO's economy.
import { existsSync } from "node:fs";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { configFrom, DUEL_PORT } from "../src/config.ts";
import { buildServer, type Server } from "../src/server.ts";
import { Conn } from "../src/net/conn.ts";
import { Reader, W } from "../src/net/proto.ts";
import { Session } from "../src/game/hub.ts";
import { connBlockKey } from "../src/game/gate.ts";
import { modeAgrees, modeFrame, refuse } from "../src/game/freemode.ts";
import { createNodeDuelCore } from "../src/duel/engine/node.ts";
import { NPC_DECKS, setDuelCore } from "../src/duel/data.ts";
import * as DFM from "../src/duel/duelfin.ts";
import type { PvpMatch } from "../src/duel/pvpMatch.ts";
import * as PP from "../src/game/persist.ts";

const GD = join(import.meta.dirname, "..", "gamedata");
const have = ["engine/scripts.pack", "translator.json", "brain_cards.json", "duel.json"].every((f) => existsSync(join(GD, f)));
const ROOM_PORT = 5740;

interface Client { s: Session; lobby: Conn; duel: Conn; got: { lobby: [number, Uint8Array][]; duel: [number, Uint8Array][] } }
const deckMsg = (ids: number[]) => { const w = new W().u32(ids.length); for (const x of ids) w.u16(x); return w.bytes(); };

describe.skipIf(!have)("free mode", () => {
  let srv: Server;
  const state = {
    accounts: {
      aaaa: { idx: 1, players: { "0": "Alfa" }, profiles: {}, active_slot: 0 },
      bbbb: { idx: 2, players: { "0": "Beta" }, profiles: {}, active_slot: 0 },
    },
  };

  beforeAll(async () => {
    setDuelCore(await createNodeDuelCore());
    srv = buildServer(configFrom({ PARITY_SEED: "1", PVP_TEST: "1", DUEL_PAUSE: "0.0005", PROGRESSION: "1" }), structuredClone(state), () => {});
  }, 60_000);
  afterAll(() => { setDuelCore(null); PP.setProgression(false); });

  function client(name: string, acct: string, idx: number): Client {
    const g = srv.game, w = srv.world;
    const s = new Session(acct, idx, false);
    s.slot = 0; s.pid = g.hub.pidFor(s, 0); s.name = name; s.ext.free = true;
    g.hub.sessions.set(acct, s);
    const got: Client["got"] = { lobby: [], duel: [] };
    const sink = (k: "lobby" | "duel") => { const r = new Reader(); return (b: Uint8Array) => { for (const m of r.feed(b)) got[k].push([m.id, m.data]); return true; }; };
    const lobby = new Conn(w, w.seqTable, ROOM_PORT, `peer-${name}`, sink("lobby"), DUEL_PORT);
    const duel = new Conn(w, w.seqTable, DUEL_PORT, `peer-${name}`, sink("duel"), DUEL_PORT);
    lobby.sess = s; s.conns.set(ROOM_PORT, lobby); s.lobby = lobby;
    lobby.ext.free = duel.ext.free = true;
    return { s, lobby, duel, got };
  }
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
  const has = (c: Client, mid: number) => c.got.duel.some(([m]) => m === mid);

  it("unowned decks duel; a forbidden card is still refused; the end pays nothing and counts only the free record", async () => {
    const A = client("Alfa", "aaaa", 1), B = client("Beta", "bbbb", 2);
    const st = srv.game.store.loadRaw();
    for (const [a, n] of [["aaaa", "Alfa"], ["bbbb", "Beta"]]) st.accounts[a].profiles = { "0": { ...PP.blankProfile(n), prog: 1 } };
    srv.game.store.saveRaw(st);
    const legal = { main: NPC_DECKS["51"].main.filter((x) => x !== 285), extra: NPC_DECKS["51"].extra };   // owns none of it
    const m = srv.game.pvp!.reserve(A.s, B.s) as unknown as PvpMatch;
    for (const [c, d] of [[A, legal], [B, NPC_DECKS["51"]]] as [Client, { main: number[]; extra: number[] }][]) {
      await send(c, 0x6001, new W().u32(c.s.pid!).bytes());
      await send(c, 0x6600, new W().u32(d.main.length).u32(0).u32(d.extra.length).bytes());
      await send(c, 0x6601, deckMsg(d.main));
      await send(c, 0x6603, deckMsg(d.extra));
      await send(c, 0x600b);
    }
    await until(() => has(A, 0x6005) && has(B, 0x6005));
    expect([...m.deckBad!]).toEqual([1]);   // B kept card 285 (forbidden); A's unowned deck passes

    await srv.world.run(() => { m.finish(0, 0, DFM.WHY_LP, 5); m.finish(1, 1, DFM.WHY_LP, 5); });
    const after = srv.game.store.loadRaw();
    const [pa, pb] = ["aaaa", "bbbb"].map((a) => after.accounts[a].profiles["0"]);
    expect([pa.free, pb.free]).toEqual([{ w: 1, l: 0 }, { w: 0, l: 1 }]);
    expect([pa.rec.mp, pb.rec.mp]).toEqual([10000, 10000]);
    expect([pa.rec.duels, pb.rec.duels, pa.trunk, pb.trunk]).toEqual([0, 0, {}, {}]);   // as blankProfile made them
  }, 60_000);

  it("a session keeps its mode while it lives; free blocks and economy are apart", () => {
    const g = srv.game, w = srv.world;
    const s = new Session("cccc", 3, false), c = new Conn(w, w.seqTable, ROOM_PORT, "peer-c", () => true, DUEL_PORT);
    expect(modeFrame(c, 0xca10, Uint8Array.of(1), () => {})).toBe(true);
    expect(c.ext.free).toBe(true);
    const late = new Conn(w, w.seqTable, ROOM_PORT, "peer-l", () => true, DUEL_PORT);
    modeFrame(late, 0x4100, new Uint8Array(2), () => {});
    modeFrame(late, 0xca10, Uint8Array.of(1), () => {});
    expect(late.ext.free).toBeUndefined();   // only a connection's first frame sets the mode
    expect(modeAgrees(s, c, true)).toBe(false);   // an MMO session that lives: no free connection joins it
    expect(modeAgrees(s, c, false)).toBe(true);   // gone quiet: the next sign-in's mode
    expect(s.ext.free).toBe(true);
    c.sess = s;
    expect(connBlockKey(g, c)).toMatch(/\|f$/);
    const sent: number[] = [];
    (c as any).send = (mid: number) => { sent.push(mid); };
    expect(refuse(g, c, 0x5210, new Uint8Array(5))).toBe(true);   // shop buy: the shop's own failure answer
    expect(sent).toEqual([0x5212, 0x5211]);
    expect(refuse(g, c, 0x4200, new Uint8Array(0))).toBe(false);
  });
});
