// Dice and coins through the duel path: duelcore -> the translator -> the 2008 client's engine commands. The client
// draws a die (0x5d) or a coin (0x5c) at (player, zone); both have to name the card that tosses.
import { existsSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { createNodeDuelCore, ENGINE_DATA_DIR } from "../src/duel/engine/node.ts";
import { PY_DUEL_RULE, type Json } from "../src/duel/engine/core.ts";
import { YO2Duel } from "../src/duel/translator/translator.ts";
import { cardmap } from "../src/duel/data.ts";
import { PyRandom } from "../src/util/pyrandom.ts";
import { DuelLog } from "../src/duel/duelText.ts";

const MEGAMORPH = 22046459, VILEPAWN = 73219648, TIME_WIZARD = 71625222;
const C_COIN = 0x5c, C_DICE = 0x5d;

/** The engine commands in the translator's output: [player, cmd, p0, p1, p2]. */
const cmds = (out: [number, Uint8Array][]) => out.filter(([id, b]) => id === 0x6202 && b.length >= 20)
  .map(([, b]) => { const v = new DataView(b.buffer, b.byteOffset); return v.getUint32(0) === 0 ? [v.getUint32(4) >> 15 & 1, v.getUint32(4) & 0xfff, v.getUint32(8), v.getUint32(12), v.getUint32(16)] : null; })
  .filter((c): c is number[] => c !== null);

describe.skipIf(!existsSync(join(ENGINE_DATA_DIR, "scripts.pack")))("dice and coins", () => {
  it("an Archfiend's die is drawn on the Archfiend; Time Wizard's coin on Time Wizard", async () => {
    const dc = await createNodeDuelCore();
    // the NPC (1) opens with Vilepawn Archfiend; the player summons Time Wizard, calls its coin, then targets
    // Vilepawn with Megamorph (Vilepawn rolls on the player's chain link)
    const decks = [{ main: [...Array(20).fill(TIME_WIZARD), ...Array(20).fill(MEGAMORPH)], extra: [] }, { main: Array(40).fill(VILEPAWN), extra: [] }];
    const d = new YO2Duel(decks, { first: 1, cardmap: cardmap(), cfg: {}, log: () => {}, rng: new PyRandom() });
    d.start();
    let evs = dc.new("t", decks, { first: 1, seed: 7, shuffle: true, rule: PY_DUEL_RULE, bot: [false, false], auto_chain: true }) as Json[];
    const dlog = new DuelLog(["Player", "NPC"], { name: (c) => dc.cardDB.name(c), stats: () => ({ atk: 0, def: 0 }) });
    const lines: string[] = [];
    const dice: number[][] = [], coins: number[][] = [];
    let wizard = -1, vilepawn = -1;
    for (let i = 0; i < 300 && !(dice.length && coins.length); i++) {
      const out = cmds(d.feed_many(evs) as [number, Uint8Array][]);
      lines.push(...dlog.feed(evs));
      dice.push(...out.filter((c) => c[1] === C_DICE));
      coins.push(...out.filter((c) => c[1] === C_COIN));
      for (const e of evs as any[]) if (e.type === "MOVE" && e.to.location === 4) {
        if (e.card === TIME_WIZARD) wizard = e.to.sequence;
        if (e.card === VILEPAWN) vilepawn = e.to.sequence;
      }
      const last = evs[evs.length - 1];
      expect(last.ev).not.toBe("end");
      const p = Number(last.player);
      let r: Json | null = null;
      if (p === 0 && last.type === "SELECT_IDLECMD") {
        const sum = (last.summons as Json[]).findIndex((c) => c.code === TIME_WIZARD);
        const act = (last.activates as Json[]).findIndex((c) => c.code === TIME_WIZARD || (c.code === MEGAMORPH && coins.length));
        if (wizard < 0 && sum >= 0) r = { type: "SELECT_IDLECMD", action: "SELECT_SUMMON", index: sum };
        else if (act >= 0) r = { type: "SELECT_IDLECMD", action: "SELECT_ACTIVATE", index: act };
      } else if (p === 0 && last.type === "SELECT_CARD") {
        r = { type: "SELECT_CARD", indicies: [(last.selects as Json[]).findIndex((c) => c.code === VILEPAWN)] };
      }
      evs = r ? dc.respond("t", r, p) : dc.auto("t");
    }
    expect(coins.length).toBeGreaterThan(0);
    expect(dice.length).toBeGreaterThan(0);
    const coin = coins[0], die = dice[0];
    expect(coin[2] & 1).toBe(0);                       // the coin's card: player 0, Time Wizard's monster zone
    expect(coin[2] >> 1 & 0x1f).toBe(wizard);
    expect([die[0], die[2]]).toEqual([1, vilepawn]);   // the die: player 1, Vilepawn's monster zone (not Megamorph's)
    expect(die[3]).toBeGreaterThanOrEqual(1);
    expect(die[3]).toBeLessThanOrEqual(6);
    // the Duel Log names both tosses
    expect(lines).toContain(`Turn 2 - NPC's Vilepawn Archfiend rolled a ${die[3]}` + (die[3] === 3 ? " -> Player's Megamorph was negated" : ""));
    expect(lines.some((s) => /^Coin toss: (Heads|Tails)$/.test(s))).toBe(true);
  }, 120_000);
});
