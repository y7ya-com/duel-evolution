// A PvP match driven through the real duel port (src/duel: port.ts -> pvpMatch.ts -> ocgSession.ts PvpSession ->
// the in-process engine and translator), two clients on in-memory Conns: it starts (decks, rock-paper-scissors, both
// 0x61fe), the challenger surrenders at its first decision, and both get their end (0x4d) and their lobby result.
// PvP is free: the match leaves no duel-point history in the state (no balance field, no charge, nothing about it).
// Needs gamedata/ (engine data, translator.json, brain_cards.json, duel.json).
import { existsSync } from "node:fs";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { configFrom, DUEL_PORT } from "../src/config.ts";
import { buildServer, type Server } from "../src/server.ts";
import { Conn } from "../src/net/conn.ts";
import { Reader, W } from "../src/net/proto.ts";
import { Session } from "../src/game/hub.ts";
import { createNodeDuelCore } from "../src/duel/engine/node.ts";
import { NPC_DECKS, setDuelCore } from "../src/duel/data.ts";
import { tagChat, type TagRelayMatch } from "../src/duel/tagRelay.ts";

const GD = join(import.meta.dirname, "..", "gamedata");
const have = ["engine/scripts.pack", "translator.json", "brain_cards.json", "duel.json"].every((f) => existsSync(join(GD, f)));
const ROOM_PORT = 5740;

interface Client { name: string; s: Session; lobby: Conn; duel: Conn; got: { lobby: [number, Uint8Array][]; duel: [number, Uint8Array][] } }

const u32 = (d: Uint8Array, at = 0) => new DataView(d.buffer, d.byteOffset, d.byteLength).getUint32(at);
const type6202 = (d: Uint8Array) => u32(d, 0) & 0xff;
const deckMsg = (ids: number[]) => { const w = new W().u32(ids.length); for (const x of ids) w.u16(x); return w.bytes(); };

describe.skipIf(!have)("Four-player tag relay through the duel port", () => {
  let srv: Server;
  const state = {
    accounts: {
      aaaa: { idx: 1, players: { "0": "Alfa" }, profiles: {}, active_slot: 0 },
      bbbb: { idx: 2, players: { "0": "Beta" }, profiles: {}, active_slot: 0 },
      cccc: { idx: 3, players: { "0": "Gamma" }, profiles: {}, active_slot: 0 },
      dddd: { idx: 4, players: { "0": "Delta" }, profiles: {}, active_slot: 0 },
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
    s.slot = 0; s.block = "5740|0"; s.pid = g.hub.pidFor(s, 0); s.name = name;
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

  it("requires four acceptances, starts all four, rotates pilot authority and ends both teams on a disconnect", async () => {
    const A = client("Alfa", "aaaa", 1), B = client("Beta", "bbbb", 2), C = client("Gamma", "cccc", 3), D = client("Delta", "dddd", 4);
    const clients = [A, B, C, D];
    const chat = (c: Client, t: string) => srv.game.withCtx(c.s, () => tagChat(srv.game, c.s, c.lobby, new TextEncoder().encode(t)));
    expect(chat(A, "/tag invite Gamma, Beta, Delta")).toBe(true);
    for (const c of [B, C]) chat(c, "/tag accept Alfa");
    expect(srv.game.pvp!.byPid(A.s.pid!)).toBeNull();
    chat(D, "/tag accept Alfa");
    const m = srv.game.pvp!.byPid(A.s.pid!) as TagRelayMatch;
    expect(m.seats).toEqual(clients.map(c => c.s));
    expect(clients.every(c => srv.game.pvp!.byPid(c.s.pid!) === m)).toBe(true);
    // Captains can reach preparation before partners attach; each partner must receive the buffered handshake.
    for (const c of clients) {
      const d = NPC_DECKS["51"];
      await send(c, 0x6001, new W().u32(c.s.pid!).bytes());
      await send(c, 0x6601, deckMsg(d.main));
      await send(c, 0x6603, deckMsg(d.extra));
      await send(c, 0x600b);
    }
    await until(() => clients.every(c => has(c, 0x6005)));
    for (const c of [A, B]) await send(c, 0x6100);
    await send(A, 0x6101, Uint8Array.of(0));
    await send(B, 0x6101, Uint8Array.of(1));
    for (const c of [A, B]) await send(c, 0x6102);
    await send(A, 0x6103, Uint8Array.of(0));
    await until(() => has(B, 0x6103));
    for (const c of [A, B, C]) await send(c, 0x61fe);
    expect(m.ps).toBeNull();
    await send(D, 0x61fe);
    await until(() => !!m.ps?.started && m.ps.decider !== null);
    expect(m.active).toEqual([0, 1]);
    const auto = vi.spyOn(m.ps!, "auto");
    await send(C, 0x7ffe);
    await new Promise(r => setTimeout(r, 30));
    expect(auto).not.toHaveBeenCalled(); // an inactive teammate cannot submit a play
    const captainOutput = vi.spyOn(m.senders[0]!, "put"), partnerOutput = vi.spyOn(m.senders[2]!, "put");
    let switchMarks: number[] | null = null;
    const identities = m.identities.bind(m);
    vi.spyOn(m, "identities").mockImplementation(() => {
      identities();
      if (m.active[0] === 2 && !switchMarks) switchMarks = [captainOutput.mock.calls.length, partnerOutput.mock.calls.length];
    });
    for (let n = 0; n < 150 && !m.ps!.over && (m.ps!.turn < 3 || m.ps!.decider !== 0); n++) await m.ps!.auto(m.ps!.decider!);
    expect(switchMarks).not.toBeNull();
    const hasPrompt = (calls: typeof captainOutput.mock.calls, from: number) => calls.slice(from).some(([msgs]) => msgs.some(msg => {
      const p = msg instanceof Uint8Array ? msg : Array.isArray(msg) && msg[0] === 0x6202 ? msg[1] : null;
      return p && p.length >= 4 && type6202(p) === 0x1a;
    }));
    // These are real translator decision prompts from turn 3, not synthetic test commands.
    expect(hasPrompt(partnerOutput.mock.calls, switchMarks![1])).toBe(true);
    expect(hasPrompt(captainOutput.mock.calls, switchMarks![0])).toBe(false);
    expect(m.ps!.turn).toBeGreaterThanOrEqual(3);
    expect(m.active[0]).toBe(2);
    auto.mockClear();
    await send(A, 0x7ffe);
    await new Promise(r => setTimeout(r, 30));
    expect(auto).not.toHaveBeenCalled();
    // The new pilot's input is routed through the same team translator.
    if (m.ps!.decider === 0) {
      await send(C, 0x7ffe);
      await until(() => auto.mock.calls.length > 0);
      expect(auto.mock.calls[0][0]).toBe(0);
    }
    m.onClose(D.duel);
    await until(() => m.done);
    expect(clients.every(c => srv.game.pvp!.byPid(c.s.pid!) === null)).toBe(true);
    await until(() => clients.every(c => c.got.lobby.some(([id]) => id === 0x4800)));
    await until(() => clients.every(c => has(c, 0x6202, d => type6202(d) === 0x4d)));
  }, 60_000);
});
