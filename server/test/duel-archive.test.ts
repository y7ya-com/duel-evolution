// The duel archive (src/duel/duelArchive.ts): the host (OcgSession) hands one entry per NPC duel to the game's sink as
// the duel ends (the engine's end, a surrender, an abandoned duel), with its EDOPro replay (.yrpX) and the engine's
// commands; the row in duel_archive keeps the commands (they replay the duel exactly) and the file goes to R2, which
// only a player of that duel can download. Recording does not change the duel (the elite AI's forks still replay it).
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { NPC_AI_REV, simStats } from "../src/duel/ai/index.ts";
import { NPC_DECKS, setDuelCore } from "../src/duel/data.ts";
import type { DuelCore, Json } from "../src/duel/engine/core.ts";
import { createNodeDuelCore, ENGINE_DATA_DIR } from "../src/duel/engine/node.ts";
import { MSG, readYrpx } from "../src/duel/engine/yrpx.ts";
import { ARCHIVE_KEEP_DAYS, gunzip, listReplays, pruneArchive, recordDuel, replayFile, unpackCommands, type DuelArchiveEntry } from "../src/duel/duelArchive.ts";
import { OcgSession, step } from "../src/duel/ocgSession.ts";
import { configFrom, DUEL_PORT } from "../src/config.ts";
import { buildServer } from "../src/server.ts";
import { Conn } from "../src/net/conn.ts";
import { W } from "../src/net/proto.ts";

const haveData = existsSync(join(ENGINE_DATA_DIR, "scripts.pack"));
const { DatabaseSync } = createRequire(import.meta.url)("node:sqlite"); // vite 5 drops a static node:sqlite

function d1(): D1Database {
  const db = new DatabaseSync(":memory:");
  db.exec(readFileSync(join(import.meta.dirname, "../migrations/0008_duel_archive.sql"), "utf8").replaceAll("--> statement-breakpoint", ""));
  const stmt = (sql: string, args: unknown[] = []): any => ({
    bind: (...a: unknown[]) => stmt(sql, a),
    first: async () => db.prepare(sql).get(...(args as any[])) ?? null,
    all: async () => ({ results: db.prepare(sql).all(...(args as any[])) }),
    run: async () => db.prepare(sql).run(...(args as any[])),
  });
  return { prepare: (sql: string) => stmt(sql) } as any;
}
/** An R2 bucket in memory: put / get / delete, the http metadata kept. */
function r2() {
  const m = new Map<string, { bytes: Uint8Array; meta: unknown }>();
  return { m, bucket: {
    put: async (k: string, v: Uint8Array, o?: { httpMetadata?: unknown }) => { m.set(k, { bytes: v, meta: o?.httpMetadata }); },
    get: async (k: string) => (m.has(k) ? { body: m.get(k)!.bytes } : null),
    delete: async (k: string | string[]) => { for (const x of [k].flat()) m.delete(x); },
  } as unknown as R2Bucket };
}

/** The duel's events again from its commands: its `new`, then every command. */
function replay(dc: DuelCore, r: NonNullable<DuelArchiveEntry["commands"]>): Json {
  const id = `replay-${Math.random()}`;
  let evs = dc.new(id, r.decks, r.opts);
  for (const c of r.cmds) evs = c.r ? dc.respond(id, c.r, c.p) : dc.auto(id);
  const last = evs[evs.length - 1]!;
  if (last.ev !== "end") dc.end(id);
  return last;
}

describe.skipIf(!haveData)("the duel archive", () => {
  let dc: DuelCore;
  beforeAll(async () => { dc = await createNodeDuelCore(); }, 60_000);

  /** A hosted duel against NPC 53 (the player on NPC 51's deck) whose entries land in `got`. */
  function host(got: DuelArchiveEntry[]) {
    const srv = buildServer(configFrom({ PARITY_SEED: "1", DUEL_PAUSE: "0.0005" }), { accounts: {} }, () => {});
    srv.game.duelArchive = (e) => got.push(e);
    const conn = new Conn(srv.world, srv.world.seqTable, DUEL_PORT, "peer-log", () => true, DUEL_PORT);
    const s = new OcgSession(srv.game, conn, () => {}, 53, 0.0005, ["Yugi", "Yami Yugi"]);
    s.rival = 51;
    const ids = (xs: number[]) => { const w = new W().u32(xs.length); for (const x of xs) w.u32(x); return w.bytes(); };
    s.clientDeck(0x6601, ids(NPC_DECKS["51"].main));
    s.clientDeck(0x6603, ids(NPC_DECKS["51"].extra ?? []));
    return { srv, s };
  }

  it("a surrender: one entry, the player's loss, its replay ends on EDOPro's surrender WIN; the commands stop where it did", async () => {
    setDuelCore(dc);
    try {
      const got: DuelArchiveEntry[] = [];
      const { s } = host(got);
      const d0 = simStats.drift, f0 = simStats.forks;
      await s.start(1);
      expect([simStats.forks > f0, simStats.drift - d0]).toEqual([true, 0]);   // recording on, the elite's forks still replay
      expect(got).toEqual([]);
      s.surrender();
      s.abandon();   // the connection closing after it: no second entry
      expect(got.length).toBe(1);
      const e = got[0]!;
      expect([e.kind, e.result, e.reason, e.rival, e.npc, e.tier, e.aiRev, e.first, e.b]).toEqual(["npc", "lose", "surrender", 51, 53, "elite", NPC_AI_REV, 1, null]);
      const r = readYrpx(e.yrpx!);
      expect(r.names).toEqual(["Yami Yugi", "Yugi"]);   // the NPC went first: core player 0
      const win = r.packets.at(-1)!;
      expect([win.message, win.data[0], win.data[1]]).toEqual([MSG.WIN, 0, 0]);   // the NPC (core 0) wins by surrender
      expect(e.commands!.cmds.length).toBeGreaterThan(0);
      const last = replay(dc, e.commands!);
      expect([last.ev, last.player, last.turn]).toEqual(["select", 0, s.turn]);
    } finally { setDuelCore(null); }
  }, 120_000);

  it("a duel played to its end: the row and its file; the players' list and download; old ones pruned with their files", async () => {
    setDuelCore(dc);
    try {
      const got: DuelArchiveEntry[] = [];
      const { srv, s } = host(got);
      const S = s as any;
      // the host's pump without the NPC's thinking pauses; the engine answers for the player
      const pump = async () => {
        for (;;) {
          const r = await step(srv.game, srv.game.NO_SESSION, () => S.pumpSome());
          if (typeof r === "function") { await r(); continue; }
          await S.flushEnd();
          if (r !== "think") return;
        }
      };
      await s.start(0);
      for (let n = 0; !s.over && n < 3000; n++) { await S.core().auto(s.id); await pump(); }
      expect([s.over, got.length]).toEqual([true, 1]);
      const e = { ...got[0]!, a: { acct: "u:me", slot: 0, name: "Yugi" } };
      expect(["win", "lose", "draw"]).toContain(e.result);
      expect([e.turns > 0, (e.decisions ?? 0) > 0, e.lp !== null]).toEqual([true, true, true]);
      const win = readYrpx(e.yrpx!).packets.at(-1)!;
      expect([win.message, win.data[0] === 0 ? "win" : win.data[0] === 1 ? "lose" : "draw"]).toEqual([MSG.WIN, e.result]);   // the player went first

      const db = d1(), { m, bucket } = r2();
      await recordDuel(db, bucket, e);
      await recordDuel(db, bucket, { ...e, at: e.at - (ARCHIVE_KEEP_DAYS + 1) * 86400 });
      expect(m.size).toBe(2);
      const [key, obj] = [...m.entries()].find(([k]) => k.includes(`-${Math.floor(e.at)}-`))!;
      expect(key).toMatch(/^private\/replays\/\d{4}-\d{2}\/npc-\d+-[0-9a-f]{8}\.yrpX$/);
      expect(obj.meta).toEqual({ contentType: "application/octet-stream", contentEncoding: "gzip" });
      expect(await gunzip(obj.bytes)).toEqual(e.yrpx);
      expect(obj.bytes.length).toBeLessThan(e.yrpx!.length / 10);
      if (process.env.REPLAY_SAMPLE) writeFileSync(process.env.REPLAY_SAMPLE, e.yrpx!);

      expect(await pruneArchive(db, bucket, e.at * 1000)).toBe(1);
      expect(m.size).toBe(1);
      const rows = (await db.prepare("SELECT * FROM duel_archive").all()).results as any[];
      expect(rows.length).toBe(1);
      const row = rows[0];
      if (process.env.ARCHIVE_EXPORT) writeFileSync(process.env.ARCHIVE_EXPORT, JSON.stringify([{ results: rows }]));   // for npc-lab's NPC_LAB_REPLAY
      expect([row.kind, row.a_acct, row.b_acct, row.rival, row.npc, row.tier, row.result, row.turns, row.lp_a, row.lp_b, row.file, row.file_bytes])
        .toEqual(["npc", "u:me", null, 51, 53, "elite", e.result, e.turns, e.lp![0], e.lp![1], key, e.yrpx!.length]);
      const back = await unpackCommands(row.commands);
      expect(back).toEqual(JSON.parse(JSON.stringify(e.commands)));
      const last = replay(dc, back);
      expect([last.ev, last.turns]).toEqual(["end", e.turns]);

      const name = (id: number) => (id === 51 ? "Yami Yugi" : "NPC");
      expect(await listReplays(db, "u:me", name)).toEqual([{ id: row.id, at: row.at, kind: "npc", me: "Yugi", opponent: "Yami Yugi", npc: 51, game: 1,
        result: e.result, reason: e.reason, turns: e.turns, secs: e.secs, bytes: e.yrpx!.length }]);
      expect(await listReplays(db, "u:other", name)).toEqual([]);
      expect(await replayFile(db, "u:other", row.id, name)).toBe(null);   // only a player of that duel
      const f = (await replayFile(db, "u:me", row.id, name))!;
      expect(f.key).toBe(key);
      expect(f.name).toMatch(/^\d{4}-\d{2}-\d{2}_\d{2}-\d{2}_Yugi-vs-Yami-Yugi\.yrpX$/);
    } finally { setDuelCore(null); }
  }, 300_000);

  it("a PvP row is listed for both players, each from their side", async () => {
    const db = d1(), { bucket } = r2();
    const yrpx = Uint8Array.of(1, 2, 3);
    await recordDuel(db, bucket, { at: 1794400000, kind: "pvp", a: { acct: "u:a", slot: 0, name: "Alfa" }, b: { acct: "u:b", slot: 1, name: "Beta" },
      rival: null, npc: null, tier: null, aiRev: null, game: 2, result: "win", reason: "lp", turns: 9, secs: 300, first: 1, lp: [1200, 0], decisions: null, yrpx, commands: null });
    const name = () => "?";
    const [a] = await listReplays(db, "u:a", name), [b] = await listReplays(db, "u:b", name);
    expect([a!.me, a!.opponent, a!.result, a!.game]).toEqual(["Alfa", "Beta", "win", 2]);
    expect([b!.me, b!.opponent, b!.result]).toEqual(["Beta", "Alfa", "lose"]);
    expect((await replayFile(db, "u:b", b!.id, name))!.name).toMatch(/_Alfa-vs-Beta_game2\.yrpX$/);
  });
});
