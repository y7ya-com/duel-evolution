import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeAll, expect, it } from "vitest";
import { NpcAi, cardInfo, simStats, type LoggedCmd } from "../src/duel/ai/index.ts";
import { brainDb } from "../src/duel/data.ts";
import { createNodeDuelCore } from "../src/duel/engine/node.ts";
import type { DuelCore, Json, NewOptions } from "../src/duel/engine/core.ts";
import { readYrpx, MSG } from "../src/duel/engine/yrpx.ts";
import { CardMap } from "../src/duel/translator/cardmap.ts";
import { YO2Duel } from "../src/duel/translator/translator.ts";
import { YUGI_DECKS } from "../src/duel/yugiDecks.ts";
import { YUGI_HEART_POOL } from "../src/duel/yugiHeartPool.ts";
import { PyRandom } from "../src/util/pyrandom.ts";
import { WireDecoder } from "./cardwire.ts";
import { code, passive } from "./npcScenario.ts";

const GD = join(import.meta.dirname, "..", "gamedata");
let dc: DuelCore;
beforeAll(async () => { dc = await createNodeDuelCore(); }, 60000);
const canonical = (evs: Json[]) => evs.map(({ id, ms, ...ev }) => ev);

it.each([[0, false], [1, false], [0, true], [1, true]] as const)("keeps client packets and replay aligned, first seat %i, selected opening %s", (first, selected) => {
  const decks: { main: number[]; extra: number[] }[] = [0, 1].map(() => ({ main: Array(40).fill(code("Mystical Elf")), extra: [] }));
  const opts: NewOptions = { seed: 701, first, rule: "MR1", shuffle: false, brain: [true, true], record: true, heart_of_cards: 1, heart_copy_limit: 3, heart_pool: [...YUGI_HEART_POOL] };
  if (selected) {
    decks[1] = YUGI_DECKS["53"]!;
    opts.heart_opening = ["Valkyrion the Magna Warrior", "Alpha The Magnet Warrior", "Beta The Magnet Warrior",
      "Gamma The Magnet Warrior", "Pot of Greed"].map(code);
  }
  const id = `yugi-wire-${first}-${selected}`, log: LoggedCmd[] = [], batches: Json[][] = [];
  const mirror = new YO2Duel(decks, { first, cardmap: new CardMap(JSON.parse(readFileSync(join(GD, "translator.json"), "utf8"))), rng: new PyRandom(701) });
  const wire = new WireDecoder(GD);
  wire.decode(mirror.start());
  const ai = new NpcAi({ npcId: 53, seat: 1, seed: 701, tier: "elite", cards: cardInfo(dc.cardDB, brainDb()), link: () => ({ dc, decks, opts, log }) });
  const drift = simStats.drift;
  let evs = dc.new(id, decks, opts), end: Json | undefined;
  try {
    for (let n = 0; n < 300; n++) {
      batches.push(canonical(evs));
      // OcgSession consumes NPC prompts privately, before feeding the human's translator.
      const translated = wire.decode(mirror.feed_many(evs.filter(e => e.ev === "msg")));
      expect(wire.announce).toBe(false);
      expect(translated.every(([mid]) => [0x6202, 0x6610, 0x6461].includes(mid))).toBe(true);
      for (const e of evs) ai.observe(e);
      const sel = evs.at(-1)!;
      if (sel.ev === "end") { end = sel; break; }
      expect(sel.ev).toBe("select");
      expect(sel.retry).toBeFalsy();
      const state = dc.query(id) as any;
      for (const p of [0, 1]) {
        expect(mirror.side[p].deck.length).toBe(state.players[p].deck_count);
        expect(mirror.side[p].hand.map(uid => mirror.card(uid).code).sort()).toEqual(state.players[p].hand.map((c: any) => c.code).sort());
      }
      const p = Number(sel.player), r = p === 1 ? ai.choose(sel) : passive(sel);
      log.push(r ? { r, p } : {});
      evs = r ? dc.respond(id, r, p) : dc.auto(id);
    }
    expect(end?.winner).toBe(1);
    expect(ai.stats.errors).toBe(0);
    expect(simStats.drift).toBe(drift);
    expect(mirror.unknown).toEqual([]);
    expect(log.filter(c => c.r?.type === "ANNOUNCE_CARD").length).toBeGreaterThan(1);
    expect(end?.reason).not.toBe(16); // Wins by dueling, not the removed Exodia strategy.
    const file = dc.takeReplay(id, { names: ["Player", "Yugi"], at: 1794930000 });
    expect(file).not.toBeNull();
    const packets = readYrpx(file!).packets;
    expect(packets.some(p => p.message === 142)).toBe(false); // No private announce-card prompt in the downloadable replay.
    expect(packets.filter(p => p.message === MSG.DRAW).length).toBeGreaterThan(3);
    expect(packets.at(-1)?.message).toBe(MSG.WIN);
  } finally { if (!end) dc.end(id); }

  const replay = id + "-replay";
  let replayEnd = false;
  try {
    let got = dc.new(replay, decks, opts);
    expect(canonical(got)).toEqual(batches[0]);
    log.forEach((c, i) => {
      got = c.r ? dc.respond(replay, c.r, c.p) : dc.auto(replay);
      expect(canonical(got)).toEqual(batches[i + 1]);
    });
    replayEnd = got.at(-1)?.ev === "end";
    expect(replayEnd).toBe(true);
  } finally { if (!replayEnd) dc.end(replay); }
}, 60000);

it("keeps every physical fallback deck at 40 cards with supported themed fusions", () => {
  const wire = new WireDecoder(GD);
  for (const d of Object.values(YUGI_DECKS)) {
    expect(d.main.length).toBe(40);
    expect(d.extra.length).toBe(12);
    for (const c of [...d.main, ...d.extra]) {
      expect(dc.cardDB.get(c)).toBeTruthy();
      expect(wire.index(c)).toBeGreaterThan(0);
    }
  }
  expect(YUGI_HEART_POOL.every(c => wire.index(c) > 0)).toBe(true);
});
