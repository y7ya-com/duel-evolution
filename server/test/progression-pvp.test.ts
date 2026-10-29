// PROGRESSION=1 in a real PvP match (the duel port, as duel-pvp.test.ts drives it): a deck with cards its owner does
// not have is refused gracefully, the way py's deck check (bloquear) does: 0x6100 is answered and 0x649b sends both
// clients back (the bad deck's player with code 0), the match closes, and no MP is paid for a duel never played.
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
import type { PvpMatch } from "../src/duel/pvpMatch.ts";
import * as PP from "../src/game/persist.ts";

const GD = join(import.meta.dirname, "..", "gamedata");
const have = ["engine/scripts.pack", "translator.json", "brain_cards.json", "duel.json"].every((f) => existsSync(join(GD, f)));
const ROOM_PORT = 5740;

interface Client { name: string; s: Session; lobby: Conn; duel: Conn; got: { lobby: [number, Uint8Array][]; duel: [number, Uint8Array][] } }

const u32 = (d: Uint8Array, at = 0) => new DataView(d.buffer, d.byteOffset, d.byteLength).getUint32(at);
const type6202 = (d: Uint8Array) => u32(d, 0) & 0xff;
const deckMsg = (ids: number[]) => { const w = new W().u32(ids.length); for (const x of ids) w.u32(x); return w.bytes(); };   // passcodes
const SNATCH_STEAL = 45986603;   // YO2 285

describe.skipIf(!have)("PROGRESSION: a PvP deck with unowned cards", () => {
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

  it("is refused before the duel: both players get 0x649b (the bad deck's code 0), the match closes, nobody is paid", async () => {
    const A = client("Alfa", "aaaa", 1), B = client("Beta", "bbbb", 2);
    // A owns its deck (NPC 51's without Snatch Steal, forbidden on the 2008 list); B (a new character) owns nothing
    const own = { main: NPC_DECKS["51"].main.filter((x) => x !== SNATCH_STEAL), extra: NPC_DECKS["51"].extra };
    const st = srv.game.store.loadRaw();
    st.accounts.aaaa.profiles = { "0": { ...PP.blankProfile("Alfa"), prog: 1 } };
    PP.trunkAdd(null, st.accounts.aaaa.profiles["0"], [...own.main, ...own.extra]);
    st.accounts.bbbb.profiles = { "0": { ...PP.blankProfile("Beta"), prog: 1 } };
    srv.game.store.saveRaw(st);
    const m = srv.game.pvp!.reserve(A.s, B.s) as unknown as PvpMatch;
    for (const [c, d] of [[A, own], [B, NPC_DECKS["54"]]] as [Client, { main: number[]; extra: number[] }][]) {
      await send(c, 0x6001, new W().u32(c.s.pid!).bytes());
      await send(c, 0x6600, new W().u32(d.main.length).u32(0).u32(d.extra.length).bytes());
      await send(c, 0x6601, deckMsg(d.main));
      await send(c, 0x6603, deckMsg(d.extra));
      await send(c, 0x600b);
    }
    await until(() => has(A, 0x6005) && has(B, 0x6005));
    expect([...m.deckBad!]).toEqual([1]);
    for (const c of [A, B]) await send(c, 0x6100);
    await until(() => has(A, 0x649b) && has(B, 0x649b));
    const svr = (c: Client) => [...c.got.duel.find(([x]) => x === 0x649b)![1]];
    expect([svr(A)[1], svr(B)[1]]).toEqual([1, 0]);
    expect(m.done).toBe(true);
    const after = srv.game.store.loadRaw();
    expect([after.accounts.aaaa.profiles["0"].rec.mp, after.accounts.bbbb.profiles["0"].rec.mp]).toEqual([10000, 10000]); // as the test made them: unchanged
  }, 60_000);
});
