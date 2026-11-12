import { afterEach, describe, expect, it, vi } from "vitest";
import { configFrom, DUEL_PORT } from "../src/config.ts";
import { buildServer } from "../src/server.ts";
import { Conn } from "../src/net/conn.ts";
import { Session } from "../src/game/hub.ts";
import { Reader, W } from "../src/net/proto.ts";
import { createNodeDuelCore } from "../src/duel/engine/node.ts";
import { setDuelCore } from "../src/duel/data.ts";
import { NPC_CLOCK, OcgSession } from "../src/duel/ocgSession.ts";
import { DEFAULT_CFG } from "../src/duel/translator/consts.ts";
import { SIDE_CLOCK } from "../src/duel/pvpMatch.ts";
import { whyFromOcg, WHY_TIMEOUT } from "../src/duel/duelfin.ts";

const until = async (fn: () => boolean) => {
  const end = Date.now() + 5000;
  while (!fn()) {
    if (Date.now() > end) throw new Error("timed out");
    await new Promise((r) => setTimeout(r, 5));
  }
};

describe("authoritative duel deadlines", () => {
  afterEach(() => { vi.useRealTimers(); setDuelCore(null); });

  it("NPC duels have no clock: no countdown is shown and an unanswered decision never times out", async () => {
    setDuelCore(await createNodeDuelCore());
    const oldTurn = DEFAULT_CFG.turn_timer, oldMargin = DEFAULT_CFG.tiempo_margen;
    DEFAULT_CFG.turn_timer = 0.04;
    DEFAULT_CFG.tiempo_margen = 0;
    const srv = buildServer(configFrom({ DUEL_PAUSE: "0.0001", PARITY_SEED: "1" }), { accounts: {} }, () => {});
    const ids: number[] = [];
    const rd = new Reader();
    const c = new Conn(srv.world, srv.world.seqTable, DUEL_PORT, "noclock", (b) => {
      for (const m of rd.feed(b)) ids.push(m.id);
      return true;
    }, DUEL_PORT);
    const finish = vi.fn();
    const s = new OcgSession(srv.game, c, finish, 999, 0.0001);
    const cards = new W().u32(40); for (let i = 0; i < 40; i++) cards.u32(89631139);
    s.clientDeck(0x6601, cards.bytes());
    try {
      expect(NPC_CLOCK.on).toBe(false);
      await s.start(0);
      await until(() => ids.includes(0x6202));
      await new Promise((r) => setTimeout(r, 300));
      expect(finish).not.toHaveBeenCalled();
      expect(s.over).toBe(false);
      expect(ids).not.toContain(0x6461);
    } finally {
      s.surrender(); DEFAULT_CFG.turn_timer = oldTurn; DEFAULT_CFG.tiempo_margen = oldMargin;
    }
  }, 30_000);

  it("with the NPC clock turned on, ends an unanswered NPC decision when its displayed clock expires", async () => {
    setDuelCore(await createNodeDuelCore());
    NPC_CLOCK.on = true;
    const oldTurn = DEFAULT_CFG.turn_timer, oldMargin = DEFAULT_CFG.tiempo_margen;
    DEFAULT_CFG.turn_timer = 0.04;
    DEFAULT_CFG.tiempo_margen = 0;
    const srv = buildServer(configFrom({ DUEL_PAUSE: "0.0001", PARITY_SEED: "1" }), { accounts: {} }, () => {});
    const privateMessages: [number, Uint8Array][] = [];
    const rd = new Reader();
    const c = new Conn(srv.world, srv.world.seqTable, DUEL_PORT, "timer", (b) => {
      for (const m of rd.feed(b)) privateMessages.push([m.id, m.data]);
      return true;
    }, DUEL_PORT);
    const finish = vi.fn();
    const s = new OcgSession(srv.game, c, finish, 999, 0.0001);
    const publicMessages: [number, Uint8Array][] = [];
    s.onPublic = (msgs) => publicMessages.push(...msgs);
    const cards = new W().u32(40); for (let i = 0; i < 40; i++) cards.u32(89631139);
    s.clientDeck(0x6601, cards.bytes());
    try {
      await s.start(0);
      await until(() => finish.mock.calls.length > 0);
      expect(s.over).toBe(true);
      const code = Buffer.from(new W().u32(89631139).bytes());
      expect(privateMessages.some(([mid, d]) => mid === 0x6202 && Buffer.from(d).includes(code))).toBe(true);
      expect(publicMessages.some(([mid]) => mid === 0x6202)).toBe(true);
      expect(publicMessages.some(([mid, d]) => mid === 0x6202 && Buffer.from(d).includes(code))).toBe(false);
      expect(finish.mock.calls[0].slice(1, 3)).toEqual([1, "timeout"]);
      expect(whyFromOcg("timeout")).toBe(WHY_TIMEOUT);
    } finally {
      s.surrender(); DEFAULT_CFG.turn_timer = oldTurn; DEFAULT_CFG.tiempo_margen = oldMargin; NPC_CLOCK.on = false;
    }
  }, 30_000);

  it("enforces side decking with duel time limits disabled and ignores a completed player's clock", async () => {
    vi.useFakeTimers();
    const srv = buildServer(configFrom({ PVP_TEST: "1" }), { accounts: {} }, () => {});
    const a = new Session("a", 1, false), b = new Session("b", 2, false);
    a.pid = 1; b.pid = 2;
    const m = srv.game.pvp!.reserve(a, b, "room") as any;
    m.roomTime = 0;
    m.tx = [{ put() {} }, { put() {} }];
    m.matchStyle = 4;
    const finish = vi.spyOn(m, "finish").mockImplementation(() => {});
    const old = SIDE_CLOCK.seconds; SIDE_CLOCK.seconds = 1;
    try {
      m.betweenBegin(0);
      expect(m.swapClockOn).toEqual([true, true]);
      m.swapReset(0);
      await vi.advanceTimersByTimeAsync(11_010);
      expect(m.done).toBe(true);
      expect(finish.mock.calls.map((args) => args.slice(0, 3))).toEqual([[1, 1, "timeout"], [0, 0, "timeout"]]);
    } finally { SIDE_CLOCK.seconds = old; }
  });
});
