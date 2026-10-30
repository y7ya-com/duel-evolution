// The Duel Log's text (src/duel/duelText.ts): what each event reads as, and that nothing hidden is named.
import { describe, expect, it } from "vitest";
import { DuelLog, LINE_MAX } from "../src/duel/duelText.ts";

const NAMES: Record<number, [string, number, number]> = {
  1: ["Skull Archfiend of Lightning", 2500, 1200], 2: ["Megamorph", 0, 0], 3: ["Elemental HERO Avian", 1000, 1000],
  4: ["Mirror Force", 0, 0], 5: ["Secret Monster", 1800, 1000], 6: ["Secret Trap", 0, 0],
};
const cards = { name: (c: number) => NAMES[c]?.[0] ?? "", stats: (c: number) => ({ atk: NAMES[c]?.[1] ?? 0, def: NAMES[c]?.[2] ?? 0 }) };
const msg = (type: string, f: Record<string, unknown> = {}) => ({ ev: "msg", type, ...f });
const at = (controller: number, location: number, sequence: number, position: number) => ({ controller, location, sequence, position });
const log = () => new DuelLog(["MayMory", "NiaNia"], cards);

describe("Duel Log text", () => {
  it("an Archfiend's roll that negates reads as one line; summons, damage, coins, phases", () => {
    const l = log();
    expect(l.feed([msg("NEW_TURN", { player: 1 }), msg("NEW_PHASE", { phase: 4 }),
      msg("SUMMONING", { code: 1, controller: 1, location: 4, sequence: 2, position: 1 })]))
      .toEqual(["Turn 1 - NiaNia's turn", "Main Phase 1", "NiaNia Normal Summoned Skull Archfiend of Lightning (2500/1200)"]);
    expect(l.feed([msg("NEW_TURN", { player: 0 }),
      msg("CHAINING", { code: 2, controller: 0, location: 8, sequence: 1, position: 5, chain_size: 1 }), msg("CHAINED", { chain_size: 1 }),
      msg("CHAIN_SOLVING", { chain_size: 1 }), msg("HINT", { hint_type: 10, player: 0, hint: 1 }), msg("TOSS_DICE", { player: 1, results: [3] }),
      msg("CHAIN_DISABLED", { chain_size: 1 }),
      msg("MOVE", { card: 2, from: at(0, 8, 1, 5), to: at(0, 16, 0, 5), reason: 0x41 }),
      msg("CHAIN_SOLVED", { chain_size: 1 }), msg("CHAIN_END")]))
      .toEqual(["Turn 2 - MayMory's turn", "MayMory activated Megamorph",
        "Turn 2 - NiaNia's Skull Archfiend of Lightning rolled a 3 -> MayMory's Megamorph was negated",
        "Megamorph was destroyed"]);
    expect(l.feed([msg("DAMAGE", { player: 1, amount: 1800 }), msg("PAY_LPCOST", { player: 1, amount: 500 }),
      msg("RECOVER", { player: 0, amount: 300 }), msg("TOSS_COIN", { player: 0, results: [true] })]))
      .toEqual(["NiaNia took 1800 damage (LP 8000 -> 6200)", "NiaNia paid 500 LP (LP 6200 -> 5700)",
        "MayMory gained 300 LP (LP 8000 -> 8300)", "Coin toss: Heads"]);
  });

  it("a chain link that destroys several cards is one line; battle destruction says so", () => {
    const l = log();
    l.feed([msg("SUMMONING", { code: 3, controller: 0, location: 4, sequence: 0, position: 1 }),
      msg("SUMMONING", { code: 5, controller: 0, location: 4, sequence: 1, position: 1 })]);
    expect(l.feed([msg("CHAINING", { code: 4, controller: 1, location: 8, sequence: 0, position: 5, chain_size: 1 }),
      msg("CHAIN_SOLVING", { chain_size: 1 }),
      msg("MOVE", { card: 3, from: at(0, 4, 0, 1), to: at(0, 16, 0, 5), reason: 0x41 }),
      msg("MOVE", { card: 5, from: at(0, 4, 1, 1), to: at(0, 16, 1, 5), reason: 0x41 }),
      msg("CHAIN_SOLVED", { chain_size: 1 }), msg("CHAIN_END")]))
      .toEqual(["NiaNia activated Mirror Force", "Mirror Force destroyed 2 cards: Elemental HERO Avian, Secret Monster"]);
    expect(l.feed([msg("MOVE", { card: 1, from: at(1, 4, 2, 1), to: at(1, 16, 0, 5), reason: 0x21 })]))
      .toEqual(["Skull Archfiend of Lightning was destroyed by battle"]);
  });

  it("never names a hidden card: sets, draws, face-down targets, cards banished face-down", () => {
    const l = log();
    const out = l.feed([
      msg("DRAW", { player: 1, drawn: [{ code: 6, position: 10 }] }),
      msg("MOVE", { card: 5, from: at(1, 2, 0, 10), to: at(1, 4, 0, 8), reason: 0 }),
      msg("SET", { code: 5, controller: 1, location: 4, sequence: 0, position: 8 }),
      msg("MOVE", { card: 6, from: at(1, 2, 1, 10), to: at(1, 8, 0, 10), reason: 0 }),
      msg("SET", { code: 6, controller: 1, location: 8, sequence: 0, position: 10 }),
      msg("SUMMONING", { code: 3, controller: 0, location: 4, sequence: 0, position: 1 }),
      msg("ATTACK", { card: at(0, 4, 0, 1), target: at(1, 4, 0, 8) }),
      msg("MOVE", { card: 6, from: at(1, 8, 0, 10), to: at(1, 32, 0, 10), reason: 0x41 }),
      msg("SPSUMMONING", { code: 5, controller: 1, location: 4, sequence: 1, position: 8 }),
    ]);
    expect(out).toEqual(["NiaNia Set a monster", "NiaNia Set a card", "MayMory Normal Summoned Elemental HERO Avian (1000/1000)",
      "MayMory's Elemental HERO Avian attacks NiaNia's set card", "a set card was destroyed",
      "NiaNia Special Summoned a face-down monster"]);
    expect(out.join(" ")).not.toMatch(/Secret/);
  });

  it("lines stay within the chat line", () => {
    const l = new DuelLog(["A".repeat(60), "B".repeat(60)], cards);
    for (const s of l.feed([msg("SUMMONING", { code: 1, controller: 0, location: 4, sequence: 0, position: 1 })])) expect(s.length).toBeLessThanOrEqual(LINE_MAX);
  });
});
