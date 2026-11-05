import { describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import SD from "../gamedata/shop.json";
import LD from "../gamedata/lobby.json";
import OV from "../data/structure-decks.json";
import { cardRarity } from "../src/game/card-rarity.ts";
import { cardOk } from "../src/game/persist.ts";
import { DECK_CARDS, cardmap } from "../src/duel/data.ts";
import { check } from "../src/duel/deckCheck.ts";

const decks = OV.decks as Record<string, { name: string; cards: number[] }>;
const ydc = SD.ydc as Record<string, number[]>;
const explicit = new Set<number>(OV.staples);
const staple = (c: number) => explicit.has(c) || ["SR", "UR"].includes(cardRarity(c) ?? "");
const limits = new Map(LD.limits as [number, number][]);
const counts = (cards: number[]) => {
  const out = new Map<number, number>();
  for (const c of cards) out.set(c, (out.get(c) ?? 0) + 1);
  return out;
};

describe("curated shop structure decks", () => {
  it("covers every sold structure deck and applies during regeneration", () => {
    expect(Object.keys(decks).sort()).toEqual(SD.packs.filter(([id, kind]) => kind === 1 && id! >= 7000).map(([id]) => String(id)).sort());
    const script = `import sys,json; sys.path.insert(0,sys.argv[1]); from structure_decks import apply_structure_decks; s=json.load(open(sys.argv[2])); s['ydc']={k:[0]*len(v) for k,v in s['ydc'].items()}; apply_structure_decks(s); print(json.dumps(s['ydc']))`;
    const generated = JSON.parse(execFileSync("python3", ["-c", script,
      fileURLToPath(new URL("../scripts", import.meta.url)), fileURLToPath(new URL("../gamedata/shop.json", import.meta.url))], { encoding: "utf8" }));
    for (const [id, deck] of Object.entries(decks)) expect(generated[id]).toEqual(deck.cards);
  });
  for (const [id, deck] of Object.entries(decks)) it(`${id} ${deck.name}: legal, playable and single-copy staples`, () => {
    expect(deck.cards).toEqual(ydc[id]);
    expect(deck.cards).toHaveLength(id === "7001" ? 45 : 40);
    const main: number[] = [], extra: number[] = [];
    for (const [c, n] of counts(deck.cards)) {
      expect(cardOk(c), String(c)).toBe(true);
      expect(DECK_CARDS[c], String(c)).toBeDefined();
      expect(cardRarity(c), String(c)).not.toBeNull();
      expect(n, String(c)).toBeLessThanOrEqual(limits.get(c) ?? 3);
      if (staple(c)) expect(n, String(c)).toBe(1);
    }
    for (const c of deck.cards) ([2, 3].includes((DECK_CARDS[c][0] >> 1) & 0x1f) ? extra : main).push(c);
    expect(main).toHaveLength(40);
    expect(check(main, extra, Object.fromEntries(counts(deck.cards)))).toEqual([]);
  });
  it("never repeats a staple across decks, including alternate art aliases", () => {
    const owner = new Map<number, string>();
    for (const [id, deck] of Object.entries(decks)) for (const c of new Set(deck.cards)) if (staple(c)) {
      const key = cardmap().rulesKey(c);
      expect(owner.get(key), `${c} repeats in ${owner.get(key)} and ${id}`).toBeUndefined();
      owner.set(key, id);
    }
  });
});
