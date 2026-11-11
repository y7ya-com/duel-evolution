// The player's own record of an NPC duel (npcWatch.ts + duellog.ts), through the real duel port: an NPC duel starts
// (decks, rock-paper-scissors, 0x61fe), the player surrenders, and after the end (0x4d) the server sends the duel
// record the 2008 client saves in its Duel Record menu: 0x6010, then on each 0x6013 of the client 0x6011 chunks,
// 0x6016 and 0x6012. The blob (RLE) carries both players (the NPC's id as its pid) and every 0x6202 the player got,
// without the surrender dialogue. Needs gamedata/ (engine data, translator.json, brain_cards.json, duel.json).
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
import { surrenderConfirmMsgs } from "../src/duel/duelfin.ts";

const GD = join(import.meta.dirname, "..", "gamedata");
const have = ["engine/scripts.pack", "translator.json", "brain_cards.json", "duel.json"].every((f) => existsSync(join(GD, f)));
const ROOM_PORT = 5740;
const u32 = (d: Uint8Array, at = 0) => new DataView(d.buffer, d.byteOffset, d.byteLength).getUint32(at);
const u32le = (d: Uint8Array, at = 0) => new DataView(d.buffer, d.byteOffset, d.byteLength).getUint32(at, true);
const type6202 = (d: Uint8Array) => u32(d, 0) & 0xff;
const deckMsg = (ids: number[]) => { const w = new W().u32(ids.length); for (const x of ids) w.u32(x); return w.bytes(); };   // passcodes
const hex = (b: Uint8Array) => Buffer.from(b).toString("hex");

describe.skipIf(!have)("the NPC duel record", () => {
  let srv: Server;
  const logs: string[] = [];
  beforeAll(async () => {
    setDuelCore(await createNodeDuelCore());
    srv = buildServer(configFrom({ PARITY_SEED: "1", DUEL_PAUSE: "0.0005" }),
      { accounts: { aaaa: { idx: 1, players: { "0": "Alfa" }, profiles: {}, active_slot: 0 } } }, (x) => logs.push(x));
  }, 60_000);
  afterAll(() => setDuelCore(null));

  it("after the end, the record follows, one message per 0x6013: the player's 0x6202s, the NPC as player 1", async () => {
    const g = srv.game, w = srv.world;
    const s = new Session("aaaa", 1, false);
    s.slot = 0; s.pid = g.hub.pidFor(s, 0); s.name = "Alfa";
    g.hub.sessions.set("aaaa", s);
    const got: [number, Uint8Array][] = [];
    const sink = () => { const r = new Reader(); return (b: Uint8Array) => { for (const m of r.feed(b)) got.push([m.id, m.data]); return true; }; };
    const lobby = new Conn(w, w.seqTable, ROOM_PORT, "peer-alfa", () => true, DUEL_PORT);
    const duel = new Conn(w, w.seqTable, DUEL_PORT, "peer-alfa", sink(), DUEL_PORT);
    lobby.sess = s; s.conns.set(ROOM_PORT, lobby); s.lobby = lobby;
    const send = (mid: number, data: Uint8Array = new Uint8Array(0)) => w.run(() => {
      if (mid === 0x6001 && !duel.sess) g.hub.attach(duel, s.pid!);
      g.enter(duel);
      g.duel!.duelReply(duel, mid, 0, data);
    });
    const until = async (cond: () => boolean, ms = 30_000) => {
      const end = Date.now() + ms;
      while (!cond()) { if (Date.now() > end) throw new Error("timeout"); await new Promise((r) => setTimeout(r, 10)); }
    };
    const has = (mid: number, pred: (d: Uint8Array) => boolean = () => true) => got.some(([m, d]) => m === mid && pred(d));

    await w.run(() => { g.enter(lobby); g.duel!.duelBegin(lobby, 53, 0); });
    const d = NPC_DECKS["51"];
    await send(0x6001, new W().u32(s.pid!).bytes());
    await send(0x6600, new W().u32(d.main.length).u32(0).u32(d.extra.length).bytes());
    await send(0x6601, deckMsg(d.main));
    await send(0x6603, deckMsg(d.extra));
    await send(0x600b);
    await until(() => has(0x6005));
    await send(0x6100);
    await send(0x6101, Uint8Array.of(0));
    await send(0x6102);
    await until(() => has(0x6101));
    await send(0x6103, Uint8Array.of(0));
    await send(0x61fe, Uint8Array.of(1));
    await until(() => has(0x6202, (x) => type6202(x) === 0x1a || type6202(x) === 0x1b));   // the player's first decision
    await send(0x6350, new W().u32(0).u32(0xd).u32(0).u32(10).bytes());
    const dialogAt = got.length;
    await until(() => got.slice(dialogAt).some(([m, x]) => m === 0x6202 && type6202(x) === 0x1b && u32(x, 4) === 0x32));
    await send(0x6423, new W().u32(1).bytes());
    await until(() => has(0x6202, (x) => type6202(x) === 0x4d) && has(0x6010));

    // the client answers each record message (but 0x6012) with 0x6013
    for (let n = 0; n < 200 && !has(0x6012); n++) {
      const before = got.length;
      await send(0x6013);
      await until(() => got.length > before || has(0x6012), 5000).catch(() => {});
    }
    const ids = got.map(([m]) => m);
    const head = ids.indexOf(0x6010), fin = ids.indexOf(0x6012);
    expect(head).toBeGreaterThan(ids.lastIndexOf(0x6202));          // after the end
    const rec = got.slice(head, fin + 1);
    expect(rec.map(([m]) => m).filter((m) => m !== 0x6011)).toEqual([0x6010, 0x6016, 0x6012]);
    const body = Buffer.concat(rec.filter(([m]) => m === 0x6011).map(([, x]) => x));
    expect(u32(rec[0]![1], 4 + "pvpYYYYmmddHHMMSS".length + 1)).toBe(body.length);   // the header's byte count
    const blob: number[] = [];
    for (let i = 0; i + 1 < body.length; i += 2) for (let k = 0; k < body[i + 1]!; k++) blob.push(body[i]!);
    const b = Uint8Array.from(blob);
    expect(u32(rec[0]![1], 4 + "pvpYYYYmmddHHMMSS".length + 1 + 4)).toBe(b.length);  // its decoded size
    // the players (172 B each from 130): pid, list value, name; the NPC's id as its pid
    expect([u32le(b, 130), Buffer.from(b.subarray(138, 142)).toString("latin1")]).toEqual([s.pid, "Alfa"]);
    expect(u32le(b, 130 + 172)).toBe(53);
    // the entries: every 0x6202 the player got before the record, the surrender dialogue left out
    const dialog = new Set(surrenderConfirmMsgs().map(([, x]) => hex(x)));
    const sent = got.slice(0, head).filter(([m, x]) => m === 0x6202 && !dialog.has(hex(x)));
    expect(u32le(b, 475)).toBe(sent.length);
    expect(sent.at(-1)![1][3]).toBe(0x4d);
  }, 120_000);
});
