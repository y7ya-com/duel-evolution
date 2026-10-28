// The NPC AI (src/duel/ai) against the parity brain (src/duel/brain), in-process on DuelCore: seeded mirror duels
// (both seats play the same NPC deck; the parity brain with that NPC's profile). Every duel must end (no stall at the
// decision cap) with no illegal AI response (no RETRY, no engine error, no exception).
//
// The quick part always runs (one duel per tier). The A/B table is slow and opt-in:
//   AI_AB=<duels per deck and tier> [AI_AB_DECKS=35,53,56,77] [AI_AB_TIERS=easy,hard,elite] nice npx vitest run test/duel-ai.test.ts
import { existsSync } from "node:fs";
import { join } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { NpcAi, TIERS, cardInfo, simStats, tierFor, type LoggedCmd, type Tier } from "../src/duel/ai/index.ts";
import { NpcBrain, loadNpcProfile } from "../src/duel/brain/index.ts";
import { brainDb, npcDeck, NPC_PROFILES, toCodes } from "../src/duel/data.ts";
import { PY_DUEL_RULE, type DuelCore, type Json, type NewOptions } from "../src/duel/engine/core.ts";
import { createNodeDuelCore, ENGINE_DATA_DIR } from "../src/duel/engine/node.ts";
import { configFrom, DUEL_PORT } from "../src/config.ts";
import { buildServer } from "../src/server.ts";
import { Conn } from "../src/net/conn.ts";
import { W } from "../src/net/proto.ts";
import { OcgSession } from "../src/duel/ocgSession.ts";
import { NPC_DECKS, setDuelCore } from "../src/duel/data.ts";

const haveData = existsSync(join(ENGINE_DATA_DIR, "scripts.pack"));
const MAX_DECISIONS = 3000; // ocgSession.MAX_NPC_DECISIONS

interface Result {
  winner: "ai" | "old" | "draw" | "stall" | "error";
  turns: number;
  aiDecisions: number;
  aiMs: number;
  aiMaxMs: number;
  /** RETRY selects, engine errors and AI exceptions on the AI's seat. */
  illegal: number;
}

let seq = 0;
function duel(dc: DuelCore, npcId: number, tier: Tier, aiSeat: 0 | 1, first: 0 | 1, seed: number): Result {
  const d = npcDeck(npcId)!;
  const deck = { main: toCodes(d.main), extra: toCodes(d.extra) };
  const decks = [deck, deck];
  const opts: NewOptions = { first, seed, shuffle: true, rule: PY_DUEL_RULE, brain: [true, true], auto_chain: true };
  const id = `ab-${++seq}`;
  const log: LoggedCmd[] = [];
  const ai = new NpcAi({ npcId, seat: aiSeat, seed, cards: cardInfo(dc.cardDB, brainDb()), tier, link: () => ({ dc, decks, opts, log }), peek: () => dc.query(id) });
  const old = new NpcBrain(loadNpcProfile(npcId, NPC_PROFILES), 1 - aiSeat, seed + 1, brainDb());
  let evs = dc.new(id, decks, opts);
  let decisions = 0, illegal = 0, errors = 0;
  const done = (winner: Result["winner"], turns: number): Result =>
    ({ winner, turns, aiDecisions: ai.stats.decisions, aiMs: ai.stats.ms, aiMaxMs: ai.stats.maxMs, illegal: illegal + ai.stats.errors });
  for (;;) {
    for (const e of evs) if (e.ev === "msg") { ai.observe(e); old.observe(e); }
    const last = evs[evs.length - 1]!;
    if (last.ev === "end") {
      const w = last.winner;
      return done(w === aiSeat ? "ai" : w === 1 - aiSeat ? "old" : last.reason === "error" ? "error" : "draw", Number(last.turns));
    }
    if (++decisions > MAX_DECISIONS) { dc.end(id); return done("stall", Number(last.turn ?? 0)); }
    if (last.ev === "error") {
      // as the host: an engine error on a response is answered by the engine (auto)
      if (++errors > 1) { dc.end(id); return done("error", 0); }
      illegal++;
      log.push({});
      evs = dc.auto(id);
      continue;
    }
    errors = 0;
    const p = Number(last.player);
    if (last.retry) {
      if (p === aiSeat) illegal++;
      log.push({});
      evs = dc.auto(id);
      continue;
    }
    const r = (p === aiSeat ? ai.choose(last) : old.choose(last)) as Json | null;
    if (r) { log.push({ r, p }); evs = dc.respond(id, r, p); }
    else { log.push({}); evs = dc.auto(id); }
  }
}

describe("tiers", () => {
  it("NPC level -> tier (1-3 easy, 4-6 hard, 7-9 elite)", () => {
    const at = (nivel: number) => tierFor(1, { 1: { nivel, perfil: {} } });
    expect([1, 2, 3, 4, 5, 6, 7, 8, 9].map(at)).toEqual(["easy", "easy", "easy", "hard", "hard", "hard", "elite", "elite", "elite"]);
    expect(tierFor(999, NPC_PROFILES)).toBe("easy"); // no profile: level 2
    expect([tierFor(28, NPC_PROFILES), tierFor(35, NPC_PROFILES), tierFor(53, NPC_PROFILES)]).toEqual(["easy", "hard", "elite"]);
  });
});

describe.skipIf(!haveData)("NPC AI duels", () => {
  let dc: DuelCore;
  beforeAll(async () => { dc = await createNodeDuelCore(); }, 60_000);

  it.each(["easy", "hard", "elite"] as Tier[])("%s: a full duel vs the parity brain, no stall, no illegal response", (tier) => {
    const r = duel(dc, 35, tier, 1, 0, 4242);
    expect(["ai", "old", "draw"]).toContain(r.winner);
    expect(r.illegal).toBe(0);
    expect(r.aiDecisions).toBeGreaterThan(0);
  }, 120_000);

  it("the fork replays the live duel (no drift)", () => {
    const before = simStats.drift;
    const forks = simStats.forks;
    duel(dc, 53, "elite", 0, 0, 77);
    expect(simStats.forks).toBeGreaterThan(forks);
    expect(simStats.drift).toBe(before);
  }, 120_000);

  // The duel host (OcgSession): the NPC AI by default, the parity brain with NPC_AI=py. The NPC (53, elite) goes first
  // and plays its whole first turn through the host before the player's first decision.
  it.each([["", NpcAi], ["py", NpcBrain]] as const)("NPC_AI=%s: the host's NPC player", async (flag, cls) => {
    setDuelCore(dc);
    try {
      const srv = buildServer(configFrom({ PARITY_SEED: "1", DUEL_PAUSE: "0.0005", NPC_AI: flag }), { accounts: {} }, () => {});
      const conn = new Conn(srv.world, srv.world.seqTable, DUEL_PORT, "peer-ai", () => true, DUEL_PORT);
      const s = new OcgSession(srv.game, conn, () => {}, 53, 0.0005);
      const ids = (xs: number[]) => { const w = new W().u32(xs.length); for (const x of xs) w.u16(x); return w.bytes(); };
      s.clientDeck(0x6601, ids(NPC_DECKS["51"].main));
      s.clientDeck(0x6603, ids(NPC_DECKS["51"].extra ?? []));
      const f0 = simStats.forks, d0 = simStats.drift;
      await s.start(1);
      if (!flag) expect([simStats.forks > f0, simStats.drift - d0]).toEqual([true, 0]); // the elite forks the host's duel
      expect(s.brain).toBeInstanceOf(cls);
      expect([s.over, s.npcDecisions > 0, s.coreErrors]).toEqual([false, true, 0]);
      if (s.brain instanceof NpcAi) expect([s.brain.tier, s.brain.stats.decisions > 0, s.brain.stats.errors]).toEqual(["elite", true, 0]);
      s.surrender();
    } finally { setDuelCore(null); }
  }, 120_000);

  const N = Number(process.env.AI_AB ?? 0);
  it.skipIf(!N)("A/B: the AI vs the parity brain, mirror duels per NPC deck and tier", () => {
    const decks = (process.env.AI_AB_DECKS ?? "35,53,56,77").split(",").map(Number);
    const tiers = (process.env.AI_AB_TIERS ?? "easy,hard,elite").split(",") as Tier[];
    const rows: string[] = [];
    const total = { duels: 0, stall: 0, illegal: 0 };
    for (const tier of tiers) {
      for (const npc of decks) {
        let ai = 0, old = 0, draw = 0, stall = 0, error = 0, illegal = 0, turns = 0, dec = 0, ms = 0, maxMs = 0;
        const t0 = performance.now();
        const f0 = simStats.forks, d0 = simStats.drift;
        for (let g = 0; g < N; g++) {
          // both seats and both first players, fixed seeds
          const r = duel(dc, npc, tier, (g % 2) as 0 | 1, ((g >> 1) % 2) as 0 | 1, 1000 * npc + g);
          if (r.winner === "ai") ai++; else if (r.winner === "old") old++; else if (r.winner === "draw") draw++; else if (r.winner === "stall") stall++; else error++;
          illegal += r.illegal; turns += r.turns; dec += r.aiDecisions; ms += r.aiMs; maxMs = Math.max(maxMs, r.aiMaxMs);
        }
        total.duels += N; total.stall += stall + error; total.illegal += illegal;
        const row = `${tier.padEnd(5)} npc ${String(npc).padStart(2)} (lvl ${NPC_PROFILES[String(npc)]?.nivel}): AI ${ai}-${old}${draw ? `-${draw}` : ""} `
          + `= ${((100 * ai) / N).toFixed(0)}% | turns ${(turns / N).toFixed(1)} | ${(ms / Math.max(1, dec)).toFixed(1)} ms/decision (max ${maxMs.toFixed(0)}) `
          + `| forks ${simStats.forks - f0}, drift ${simStats.drift - d0} | stall/error ${stall}/${error}, illegal ${illegal} | ${((performance.now() - t0) / 1000).toFixed(1)} s`;
        rows.push(row);
        console.log(row);
      }
    }
    console.log(`\nA/B (${N} duels per deck and tier; elite budget ${TIERS.elite.budgetMs} ms):\n${rows.join("\n")}`);
    expect(total).toEqual({ duels: total.duels, stall: 0, illegal: 0 });
  }, 3_600_000);
});
