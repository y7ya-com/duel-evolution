// The translator's mirror against ocgcore's piles (_pile_drift): the client's piles follow the mirror, so a mirror pile
// of another size than the engine's is logged ([AVISO] reaches Workers Logs), once per side and pile.
import { describe, expect, it } from "vitest";
import { YO2Duel } from "../src/duel/translator/translator.ts";
import { cardmap } from "../src/duel/data.ts";
import { PyRandom } from "../src/util/pyrandom.ts";

const MEGAMORPH = 22046459;

describe("pile drift", () => {
  it("logs a hand of another size than the engine's, once", () => {
    const decks = [{ main: Array(40).fill(MEGAMORPH), extra: [] }, { main: Array(40).fill(MEGAMORPH), extra: [] }];
    const log: string[] = [];
    const d = new YO2Duel(decks, { first: 0, cardmap: cardmap(), cfg: {}, log: (s: string) => log.push(s), rng: new PyRandom() });
    d.start();
    const pl = (hand: number, deck: number) => ({ hand: Array(hand).fill(MEGAMORPH), grave: [], removed: [], deck_count: deck });
    d.sync_stats({ players: [pl(0, 40), pl(0, 40)] });
    expect(log.filter((s) => s.includes("[AVISO]"))).toEqual([]);
    d.sync_stats({ players: [pl(0, 40), pl(1, 39)] });
    d.sync_stats({ players: [pl(0, 40), pl(2, 38)] });
    expect(log.filter((s) => s.includes("[AVISO]"))).toEqual([
      "[AVISO] [traductor] desfase de hand j1: espejo 0, ocgcore 1 (turno 0)",
      "[AVISO] [traductor] desfase de deck j1: espejo 40, ocgcore 39 (turno 0)",
    ]);
  });
});
