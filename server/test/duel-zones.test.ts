// Automatic card placement goes centre-first (OCGcore sequences 2, 1, 3, 0, 4), on every path that picks a zone: the
// engine's `auto` (engine/bot.ts), the translator's answer for a client with "Auto Card Placing" on, the NPC AI
// (src/duel/ai) and the py-parity brain. PLACE_ORDER=py (parity runs) keeps py's first-free-from-the-left order on
// the engine and translator paths. Needs gamedata/ (engine data, translator.json, brain_cards.json, duel.json).
import { existsSync } from "node:fs";
import { join } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { configFrom } from "../src/config.ts";
import { NpcAi, cardInfo } from "../src/duel/ai/index.ts";
import { freePlaces } from "../src/duel/ai/prompt.ts";
import { NpcBrain, loadNpcProfile } from "../src/duel/brain/index.ts";
import { brainDb, cardmap, npcDeck, NPC_PROFILES, toCodes } from "../src/duel/data.ts";
import { PY_DUEL_RULE, type DuelCore, type Json, type NewOptions } from "../src/duel/engine/core.ts";
import { createNodeDuelCore, ENGINE_DATA_DIR } from "../src/duel/engine/node.ts";
import { _free_places } from "../src/duel/translator/helpers.ts";
import { YO2Duel } from "../src/duel/translator/translator.ts";
import { placeOrderFrom, zoneOrder } from "../src/duel/zones.ts";
import { PyRandom } from "../src/util/pyrandom.ts";

const GD = join(import.meta.dirname, "..", "gamedata");
const haveData = existsSync(join(ENGINE_DATA_DIR, "scripts.pack")) && ["translator.json", "brain_cards.json", "duel.json"].every((f) => existsSync(join(GD, f)));

const MZONE = 4, SZONE = 8;
const ELF = 15025844, TRAP_HOLE = 4206964; // Mystical Elf (normal monster), Trap Hole (a trap to set)
const ALL_FREE = 0xffffffe0;                // own monster zones 0-4 free, everything else taken
/** SELECT_PLACE mask (1 = taken) with own region `base` (0 MZONE, 8 SZONE) free except `taken`. */
const maskWith = (base: number, taken: number[]) => (~(0x1f << base) | taken.reduce((m, s) => m | (1 << (base + s)), 0)) >>> 0;
/** What centre-first answers for a SELECT_PLACE mask: own monster zones, then own spell/trap zones. */
function centreFirst(mask: number): [number, number] {
  for (const [base, loc] of [[0, MZONE], [8, SZONE]]) for (const s of zoneOrder(5)) if (!((mask >>> (base + s)) & 1)) return [loc, s];
  throw new Error("no free zone");
}

describe("zone order helper", () => {
  it("official order: centre, then next to it, then the edges", () => {
    expect(zoneOrder(5)).toEqual([2, 1, 3, 0, 4]);
    expect(zoneOrder(7)).toEqual([2, 1, 3, 0, 4, 5, 6]);
    expect(zoneOrder(8)).toEqual([2, 1, 3, 0, 4, 5, 6, 7]);
  });
  it("PLACE_ORDER=py keeps py's first free zone from the left", () => {
    expect(zoneOrder(5, "py")).toEqual([0, 1, 2, 3, 4]);
    expect(placeOrderFrom("py")).toBe("py");
    expect(placeOrderFrom(undefined)).toBe("centre");
    expect(configFrom({}).placeOrder).toBe("centre");
    expect(configFrom({ PLACE_ORDER: "py" }).placeOrder).toBe("py");
  });
});

describe("translator: Auto Card Placing answers centre-first", () => {
  it("_free_places fills 2, 1, 3, 0, 4 (py order with place_order py)", () => {
    const fill = (order?: "py") => {
      const got: number[] = [];
      for (let k = 0; k < 5; k++) got.push(_free_places(maskWith(0, got), 1, order)[0]!.sequence);
      return got;
    };
    expect(fill()).toEqual([2, 1, 3, 0, 4]);
    expect(fill("py")).toEqual([0, 1, 2, 3, 4]);
    expect(_free_places(maskWith(8, [2]), 2)).toEqual([{ player: 0, location: SZONE, sequence: 1 }, { player: 0, location: SZONE, sequence: 3 }]);
  });
  it.skipIf(!haveData)("auto_response of a SELECT_PLACE the client does not choose", () => {
    const answer = (cfg: Record<string, unknown>, mask: number) => {
      const deck = { main: Array(40).fill(ELF), extra: [] };
      const d = new YO2Duel([deck, deck], { first: 0, cardmap: cardmap(), cfg, rng: new PyRandom(1) });
      d.start();
      d.feed_many([{ ev: "select", type: "SELECT_PLACE", player: 0, count: 1, field_mask: mask, turn: 1 }]);
      expect(d.needs_auto()).toBe(true);
      return (d.auto_response() as { response: { places: { sequence: number }[] } }).response.places[0]!.sequence;
    };
    expect(answer({}, ALL_FREE)).toBe(2);
    expect(answer({}, maskWith(0, [2]))).toBe(1);
    expect(answer({}, maskWith(0, [2, 1]))).toBe(3);
    expect(answer({ place_order: "py" }, ALL_FREE)).toBe(0);
  });
});

describe.skipIf(!haveData)("duels on the engine", () => {
  let dc: DuelCore;
  beforeAll(async () => { dc = await createNodeDuelCore(); }, 60_000);

  /** Plays a duel where `place` answers player 0's SELECT_PLACE; the rest of player 0's turn summons or sets one card
   *  at a time, player 1 passes. Returns player 0's (location, sequence) placements in order. */
  function placements(id: string, opts: NewOptions, place: (sel: Json) => Json[], turns = 9): [number, number][] {
    const deck = { main: Array.from({ length: 40 }, (_, i) => (i % 2 ? TRAP_HOLE : ELF)) };
    let evs = dc.new(id, [deck, deck], { seed: 1, rule: "MR1", bot: [false, false], shuffle: false, ...opts });
    const out: [number, number][] = [];
    for (let n = 0; n < 2000; n++) {
      for (const e of evs) {
        const to = e.to as Json | undefined;
        if (e.ev === "msg" && e.type === "MOVE" && to && to.controller === 0 && (to.location === MZONE || to.location === SZONE)) out.push([to.location as number, to.sequence as number]);
      }
      const last = evs.at(-1)!;
      if (last.ev !== "select" || Number(last.turn) > turns) break;
      const me = last.player === 0;
      const idle = (action: string, index: number | null = null) => dc.respond(id, { type: "SELECT_IDLECMD", action, index });
      if (last.type === "SELECT_PLACE" && me) evs = place(last);
      else if (last.type === "SELECT_IDLECMD") {
        const s = last as unknown as { summons: unknown[]; spell_sets: unknown[] };
        if (me && s.summons.length) evs = idle("SELECT_SUMMON", 0);
        else if (me && s.spell_sets.length) evs = idle("SELECT_SPELL_SET", 0);
        else evs = idle("TO_EP");
      } else if (last.type === "SELECT_CHAIN" && !last.forced) evs = dc.respond(id, { type: "SELECT_CHAIN", index: null });
      else evs = dc.auto(id);
    }
    dc.end(id);
    return out;
  }
  const seqs = (ps: [number, number][], loc: number) => ps.filter(([l]) => l === loc).map(([, s]) => s).slice(0, 5);

  it("engine auto: monsters and spells/traps go 2, 1, 3, 0, 4", () => {
    const ps = placements("auto-centre", {}, () => dc.auto("auto-centre"));
    expect(seqs(ps, MZONE)).toEqual([2, 1, 3, 0, 4]);
    expect(seqs(ps, SZONE)).toEqual([2, 1, 3, 0, 4]);
  });

  it("engine auto with place_order py (parity): 0, 1, 2, 3, 4", () => {
    const ps = placements("auto-py", { place_order: "py" }, () => dc.auto("auto-py"));
    expect(seqs(ps, MZONE)).toEqual([0, 1, 2, 3, 4]);
    expect(seqs(ps, SZONE)).toEqual([0, 1, 2, 3, 4]);
  });

  it("translator's auto answer, sent to the engine: 2, 1, 3, 0, 4", () => {
    const ps = placements("tr-centre", {}, (sel) => dc.respond("tr-centre", { type: "SELECT_PLACE", places: _free_places(sel.field_mask as number, 1) }));
    expect(seqs(ps, MZONE)).toEqual([2, 1, 3, 0, 4]);
    expect(seqs(ps, SZONE)).toEqual([2, 1, 3, 0, 4]);
  });

  /** An NPC deck duel: the NPC under test plays seat 0 (its selects carry `view`), seat 1 only passes. Every
   *  SELECT_PLACE the NPC answers must be the centre-first zone of its mask. */
  function npcPlaces(id: string, npcId: number, chooser: (sel: Json) => Json | null, observe: (e: Json) => void) {
    const d = npcDeck(npcId)!;
    const deck = { main: toCodes(d.main), extra: toCodes(d.extra) };
    let evs = dc.new(id, [deck, deck], { first: 0, seed: 7, shuffle: true, rule: PY_DUEL_RULE, brain: [true, false], auto_chain: true });
    const got: { mask: number; place: [number, number] }[] = [];
    for (let n = 0; n < 3000; n++) {
      for (const e of evs) if (e.ev === "msg") observe(e);
      const last = evs.at(-1)!;
      if (last.ev !== "select" || Number(last.turn) > 12) break;
      if (last.player === 0 && !last.retry) {
        const r = chooser(last);
        if (last.type === "SELECT_PLACE" && r) {
          const p = (r.places as Json[])[0]!;
          got.push({ mask: last.field_mask as number, place: [p.location as number, p.sequence as number] });
        }
        evs = r ? dc.respond(id, r, 0) : dc.auto(id);
      } else if (last.player === 1 && last.type === "SELECT_IDLECMD") evs = dc.respond(id, { type: "SELECT_IDLECMD", action: "TO_EP", index: null }, 1);
      else if (last.player === 1 && last.type === "SELECT_BATTLECMD") evs = dc.respond(id, { type: "SELECT_BATTLECMD", action: "TO_EP", index: null }, 1);
      else if (last.player === 1 && last.type === "SELECT_CHAIN" && !last.forced) evs = dc.respond(id, { type: "SELECT_CHAIN", index: null }, 1);
      else evs = dc.auto(id);
    }
    dc.end(id);
    return got;
  }

  for (const npcId of [1, 35]) {
    it(`NPC AI (NPC ${npcId}): its placements are centre-first`, () => {
      const id = `ai-${npcId}`;
      const d = npcDeck(npcId)!;
      const deck = { main: toCodes(d.main), extra: toCodes(d.extra) };
      const opts: NewOptions = { first: 0, seed: 7, shuffle: true, rule: PY_DUEL_RULE, brain: [true, false], auto_chain: true };
      const ai = new NpcAi({ npcId, seat: 0, seed: 7, cards: cardInfo(dc.cardDB, brainDb()), tier: "easy", link: () => ({ dc, decks: [deck, deck], opts, log: [] }), peek: () => dc.query(id) });
      const got = npcPlaces(id, npcId, (s) => ai.choose(s), (e) => ai.observe(e));
      expect(got.length).toBeGreaterThanOrEqual(3);
      expect(got.map((g) => g.place)).toEqual(got.map((g) => centreFirst(g.mask)));
    }, 60_000);

    it(`py-parity brain (NPC ${npcId}): its placements are centre-first`, () => {
      const brain = new NpcBrain(loadNpcProfile(npcId, NPC_PROFILES), 0, 7, brainDb());
      const got = npcPlaces(`brain-${npcId}`, npcId, (s) => brain.choose(s) as Json | null, (e) => brain.observe(e));
      expect(got.length).toBeGreaterThanOrEqual(3);
      expect(got.map((g) => g.place)).toEqual(got.map((g) => centreFirst(g.mask)));
    }, 60_000);
  }
});

describe("NPC AI zone pickers", () => {
  it("freePlaces: own monster zones centre-first", () => {
    const got: number[] = [];
    for (let k = 0; k < 5; k++) got.push(freePlaces(0, 1, maskWith(0, got))[0]!.sequence);
    expect(got).toEqual([2, 1, 3, 0, 4]);
    expect(freePlaces(1, 1, ALL_FREE)[0]).toEqual({ controller: 1, location: MZONE, sequence: 2 });
  });
});
