// Planned restarts void unfinished duels before transport close callbacks run.
// Exercise real session/duel/persistence paths; only the duel engine is stubbed.
import { afterEach, describe, expect, it, vi } from "vitest";
import { configFrom, DUEL_PORT } from "../src/config.ts";
import { buildServer } from "../src/server.ts";
import { Conn } from "../src/net/conn.ts";
import { Reader as WireReader } from "../src/net/proto.ts";
import { Session } from "../src/game/hub.ts";
import * as PP from "../src/game/persist.ts";
import { makeDf, WHY_LP } from "../src/duel/duelfin.ts";
import { DUEL_GRACE, type Matches, type PvpMatch } from "../src/duel/pvpMatch.ts";
import { type PvpSession } from "../src/duel/ocgSession.ts";
import { X } from "../src/duel/port.ts";
import { WorldDO } from "../src/do.ts";
import type { Env } from "../src/env.ts";

vi.mock("cloudflare:workers", () => ({ DurableObject: class {
  constructor(readonly ctx: unknown, readonly env: unknown) {}
} }));
vi.mock("../src/duel/boot.ts", () => ({ bootDuel: vi.fn(async () => {}) }));


function setup(count = 2) {
  vi.useFakeTimers();
  const accounts = Object.fromEntries(Array.from({ length: count }, (_, i) => {
    const name = `Player${i + 1}`, profile = PP.blankProfile(name);
    profile.prog = 1;
    profile.mp_wallet = { version: 1, bound: 0 };
    profile.rec.mp = 4321;
    profile.rec.wins = 3;
    profile.rec.losses = 2;
    profile.trunk = { "89631139": 2 };
    return [`acct${i + 1}`, { idx: i + 1, players: { "0": name }, profiles: { "0": profile }, active_slot: 0 }];
  }));
  const srv = buildServer(configFrom({ PROGRESSION: "1", PVP_TEST: "1", DUEL_PAUSE: "0.0001", PARITY_SEED: "1" }), { accounts }, () => {});
  const { game: g, world } = srv;
  const players = Object.keys(accounts).map((acct, i) => {
    const s = new Session(acct, i + 1, false);
    s.pid = g.hub.pidFor(s, 0); s.slot = 0; s.name = `Player${i + 1}`; s.block = "5740|0";
    g.hub.sessions.set(acct, s);
    const messages: { lobby: [number, Uint8Array][]; duel: [number, Uint8Array][] } = { lobby: [], duel: [] };
    const conn = (port: number, kind: "lobby" | "duel") => {
      const reader = new WireReader();
      const c = new Conn(world, world.seqTable, port, `peer-${i}`, bytes => {
        for (const message of reader.feed(bytes)) messages[kind].push([message.id, message.data]);
        return true;
      }, DUEL_PORT);
      c.sess = s; s.conns.set(port, c); return c;
    };
    const lobby = conn(5740, "lobby"), duel = conn(DUEL_PORT, "duel"); s.lobby = lobby;
    return { s, lobby, duel, messages };
  });
  const profiles = () => Object.values(g.store.loadRaw().accounts).map((a: any) => a.profiles["0"]);
  const settle = async () => { await vi.advanceTimersByTimeAsync(2000); await world.idle(); };
  return { srv, g, players, profiles, settle };
}

function engine() {
  const e = { started: true, over: false, ended: false, turn: 12, stats: null, lastLp: [4000, 5000], pending: () => 0,
    end: vi.fn(() => { e.over = e.ended = true; }),
    surrender: vi.fn(() => { e.over = e.ended = true; }),
    abandon: vi.fn(() => { e.over = e.ended = true; }),
  };
  return e;
}

function match(f: ReturnType<typeof setup>, mode: "live" | "side" | "pending" | "reserved") {
  const [a, b] = f.players;
  const m = f.g.pvp!.reserve(a.s, b.s) as unknown as PvpMatch;
  if (mode !== "reserved") { m.attach(a.duel); m.attach(b.duel); }
  if (mode !== "pending" && mode !== "reserved") m.ps = engine() as unknown as PvpSession;
  if (mode === "side") { m.matchStyle = 4; m.between = m.needStart = true; m.games = [1]; m.swapClockOn = [true, false]; }
  return m;
}

const hasResult = (messages: [number, Uint8Array][]) => messages.some(([id, data]) => id === 0x6202 && data.length >= 4 && (new DataView(data.buffer, data.byteOffset).getUint32(0) & 0xff) === 0x4d);

afterEach(() => { vi.clearAllTimers(); vi.useRealTimers(); PP.setProgression(false); });

describe("planned deployments do not decide duels", () => {
  it("NPC finish and disconnect callbacks ignore restart even with an armed result handler", () => {
    const f = setup(1), a = f.players[0];
    const df = makeDf(f.g, () => a.lobby);
    const baseline = f.profiles();
    f.g.restarting = true;
    f.g.withCtx(a.s, () => {
      df.h_autoduelstart(1, 0);
      expect(df.finish(a.duel, 0, WHY_LP, 12)).toBe(false);
      df.h_autoduelstart(1, 0);
      df.h_disconnect(a.duel);
    });
    expect(f.profiles()).toEqual(baseline);
    expect(a.messages.lobby.some(([id]) => id === 0x4140 || id === 0x4800 || id === 0x4237)).toBe(false);
  });

  it("preparing a restart stops NPC play before a socket close or late victory can record anything", async () => {
    const f = setup(1), a = f.players[0];
    f.g.withCtx(a.s, () => f.g.duel!.duelBegin(a.lobby, 1));
    const df = f.g.duel!.duelState(a.s)!.df!;
    const e = engine(); X(a.duel).ocg = e as any; X(a.duel).dfEnd = df.sess.end;
    const baseline = f.profiles();
    f.g.duel!.prepareRestart();
    expect(f.g.restarting).toBe(true);
    expect(e.over).toBe(true);
    f.g.withCtx(a.s, () => {
      f.g.onConnClosed(a.duel, "deployment");
      df.finish(a.duel, 0, WHY_LP, 12);
    });
    await f.settle();
    expect(f.profiles()).toEqual(baseline);
    expect(hasResult(a.messages.duel)).toBe(false);
  });

  it.each(["live", "side", "pending", "reserved"] as const)("voids a %s PvP match without outcomes, rewards or a tournament winner", async mode => {
    const f = setup(), m = match(f, mode), baseline = f.profiles();
    const finish = vi.spyOn(m, "finish"), winner = vi.fn(), close = vi.fn();
    f.g.pvpHookMatch!(m, winner, close);
    f.g.duel!.prepareRestart();
    f.g.duel!.prepareRestart(); // repeated shutdown requests are harmless
    expect(m.done).toBe(true);
    expect(f.players.every(p => f.g.pvp!.byPid(p.s.pid!) === null)).toBe(true);
    // Transport closes, queued decisions and timers may arrive after shutdown preparation.
    for (const p of f.players) f.g.withCtx(p.s, () => f.g.onConnClosed(p.duel, "deployment"));
    m.gameEnd(0, WHY_LP, 12);
    m.q(["clock", 1, Date.now() / 1000]);
    m.q(["between", m.btwGen]);
    await f.settle();
    expect(finish).not.toHaveBeenCalled();
    expect(winner).not.toHaveBeenCalled();
    expect(close).not.toHaveBeenCalled();
    expect(f.profiles()).toEqual(baseline);
    for (const p of f.players) {
      expect(hasResult(p.messages.duel)).toBe(false);
      expect(p.messages.lobby.some(([id]) => id === 0x4140 || id === 0x4800)).toBe(false);
    }
  });

  it("an ordinary NPC disconnect still records the loss", () => {
    const f = setup(1), a = f.players[0], df = makeDf(f.g, () => a.lobby);
    const losses = PP.npcbinGet(f.profiles()[0], 1)[1];
    f.g.withCtx(a.s, () => { df.h_autoduelstart(1, 0); df.h_disconnect(a.duel); });
    expect(PP.npcbinGet(f.profiles()[0], 1)[1]).toBe(losses + 1);
    expect(f.profiles()[0].rec.duels_void).toBe(1);
  });

  it("an ordinary mid-duel PvP disconnect still awards the opponent a win", async () => {
    const f = setup(), m = match(f, "live"), before = f.profiles();
    m.onClose(f.players[0].duel);
    await f.settle();
    await vi.advanceTimersByTimeAsync((DUEL_GRACE.s + 1) * 1000);
    await f.settle();
    const after = f.profiles();
    expect(m.done).toBe(true);
    expect(after[0].rec.losses).toBe(before[0].rec.losses + 1);
    expect(after[1].rec.wins).toBe(before[1].rec.wins + 1);
    expect(hasResult(f.players[1].messages.duel)).toBe(true);
  });
});


describe("WorldDO restart lifecycle", () => {
  function resident(f: ReturnType<typeof setup>, flush: () => Promise<void>, env: Env = { DEV: "1" } as Env) {
    const ctx = { blockConcurrencyWhile: (fn: () => Promise<unknown>) => fn() } as unknown as DurableObjectState;
    const resident = new WorldDO(ctx, env);
    const internals = resident as unknown as { srv: typeof f.srv; sink: { flush: () => Promise<void> }; sockets: Map<WebSocket, (hold?: boolean) => void> };
    internals.srv = f.srv;
    PP.setProgression(f.g.cfg.progression); // restore mode after constructing the temporary resident server
    internals.sink = { flush };
    return { resident, internals };
  }
  const request = (path: string) => new Request(`https://world.test/__admin/${path}`, { method: "POST", headers: { "x-de-admin": "deployment" } });

  it("requires authenticated POSTs before a restart can exempt any duel", async () => {
    const f = setup(), m = match(f, "live"), baseline = f.profiles();
    const flush = vi.fn(async () => {});
    const { resident: instance } = resident(f, flush, {} as Env);
    expect((await instance.fetch(new Request("https://world.test/__admin/prepare-restart", { method: "POST" }))).status).toBe(403);
    expect((await instance.fetch(new Request("https://world.test/__admin/shutdown", { headers: { "x-de-admin": "admin" } }))).status).toBe(405);
    expect(f.g.restarting).toBe(false);
    expect(m.done).toBe(false);
    expect(flush).not.toHaveBeenCalled();
    expect(f.profiles()).toEqual(baseline);
  });

  it("voids duels and awaits persistence before 4012 closes can fire disconnect callbacks", async () => {
    const f = setup(), m = match(f, "live"), baseline = f.profiles(), events: string[] = [];
    let persisted!: () => void;
    const pendingWrite = new Promise<void>(resolve => { persisted = resolve; });
    const prepare = f.g.duel!.prepareRestart.bind(f.g.duel);
    vi.spyOn(f.g.duel!, "prepareRestart").mockImplementation(() => { prepare(); events.push("void"); });
    const flush = vi.fn(async () => {
      events.push("flush-start");
      expect(f.g.restarting).toBe(true);
      expect(m.done).toBe(true);
      await pendingWrite;
      events.push("flush-complete");
    });
    const { resident: instance, internals } = resident(f, flush);
    const close = vi.fn((code: number, reason: string) => {
      events.push("socket-close");
      expect(code).toBe(4012); expect(reason).toBe("server-update");
      for (const p of f.players) void f.srv.world.run(() => f.g.withCtx(p.s, () => f.g.onConnClosed(p.duel, "closed")));
    });
    internals.sockets.set({ close } as unknown as WebSocket, () => {});
    const response = instance.fetch(request("shutdown"));
    await vi.advanceTimersByTimeAsync(0);
    expect(events).toEqual(["void", "flush-start"]);
    expect(close).not.toHaveBeenCalled();
    persisted();
    const done = await response;
    expect(done.status).toBe(200);
    expect(await done.json()).toEqual({ closed: 1, duelsVoided: true });
    await f.settle();
    expect(events).toEqual(["void", "flush-start", "flush-complete", "socket-close", "flush-start", "flush-complete"]);
    expect(f.profiles()).toEqual(baseline);
    // A draining resident cannot accept new gameplay or another gateway connection.
    expect((await instance.fetch(new Request("https://world.test/net"))).status).toBe(503);
  });

  it("retries cleanup after a partial preparation failure with gameplay still blocked", () => {
    const f = setup(), m = match(f, "live"), baseline = f.profiles();
    const prep = vi.spyOn(f.g.pvp as Matches, "prepareRestart").mockImplementationOnce(() => { throw new Error("partial cleanup"); });
    expect(() => f.g.duel!.prepareRestart()).toThrow("partial cleanup");
    expect(f.g.restarting).toBe(true);
    expect(m.done).toBe(false);
    f.g.duel!.prepareRestart();
    expect(prep).toHaveBeenCalledTimes(2);
    expect(m.done).toBe(true);
    expect(f.profiles()).toEqual(baseline);
  });

  it("never confirms or closes sockets when restart preparation fails", async () => {
    const f = setup(), flush = vi.fn(async () => {}), close = vi.fn();
    const { resident: instance, internals } = resident(f, flush);
    internals.sockets.set({ close } as unknown as WebSocket, () => {});
    vi.spyOn(f.g.duel!, "prepareRestart").mockImplementation(() => { throw new Error("preparation failed"); });
    await expect(instance.fetch(request("shutdown"))).rejects.toThrow("preparation failed");
    expect(flush).not.toHaveBeenCalled();
    expect(close).not.toHaveBeenCalled();
  });

  it("refuses transport shutdown after a failed D1 flush and allows a safe retry", async () => {
    const f = setup(), m = match(f, "live"), baseline = f.profiles(), close = vi.fn();
    const flush = vi.fn(async () => {}).mockRejectedValueOnce(new Error("D1 unavailable"));
    const { resident: instance, internals } = resident(f, flush);
    internals.sockets.set({ close } as unknown as WebSocket, () => {});
    await expect(instance.fetch(request("shutdown"))).rejects.toThrow("D1 unavailable");
    expect(close).not.toHaveBeenCalled();
    expect(f.g.restarting).toBe(true);
    expect(m.done).toBe(true);
    expect((await instance.fetch(request("shutdown"))).status).toBe(200);
    expect(close).toHaveBeenCalledOnce();
    expect(f.profiles()).toEqual(baseline);
  });

  it("prepare-restart flushes the voided state without closing existing sockets", async () => {
    const f = setup(), m = match(f, "side"), baseline = f.profiles();
    const flush = vi.fn(async () => {}), close = vi.fn();
    const { resident: instance, internals } = resident(f, flush);
    internals.sockets.set({ close } as unknown as WebSocket, () => {});
    const response = await instance.fetch(request("prepare-restart"));
    expect(await response.json()).toEqual({ ready: true, duelsVoided: true });
    expect(m.done).toBe(true);
    expect(flush).toHaveBeenCalledOnce();
    expect(close).not.toHaveBeenCalled();
    expect(f.profiles()).toEqual(baseline);
  });
});
