// Every reward an NPC on the map can give must be something the 2008 client can show (no blank gifts): the friendship
// prizes of src/duel/npcRules.ts (cards and PBIN bits, handed over by ITEMGET 3 after the 0x4237 present) and the
// card pack offered after every NPC duel (0x4800, drawn on 0x4802). A card must have art in the client's card table;
// a PBIN bit must be a yo2pbinmap row whose item-get page the client draws (persist.ts bitShown).
import { describe, expect, it } from "vitest";
import * as PP from "../src/game/persist.ts";
import { lobbyAfterDuelMsgs, M_CARDPACKLIST, M_NPCPRESENT, RESULT_LOSE, RESULT_WIN } from "../src/duel/duelfin.ts";
import { CARD_PACKS } from "../src/duel/npcRules.ts";
import { loadNpcs } from "../src/game/npcs.ts";
import LD from "../gamedata/lobby.json";
import SD from "../gamedata/shop.json";
import YDC from "../gamedata/ydc.json";
import DUEL from "../gamedata/duel.json";
import { harness, u16 } from "./notes-harness.ts";

/** yo2pbinmap row: [value, starter, class, slot, text id, world] */
const ROWS = LD.avatar_pbin as unknown as Record<string, [number, number, number, number, number, number]>;
const CARD_TABLE = DUEL.cards as Record<string, unknown>;

/** Why the client would show this card as a blank, or null. */
function badCard(cid: number): string | null {
  if (!PP.validCardIds().has(cid)) return "no art (valid_cards)";
  if (!(String(cid) in CARD_TABLE)) return "not in the client's card table (cards_yo2.csv)";
  return null;
}

/** Why the client's item-get window would show this bit as a blank page, or null. */
function badBit(bit: number): string | null {
  const row = ROWS[String(bit)];
  if (!row) return "no yo2pbinmap row";
  const [, , cls, slot, text] = row;
  if (!PP.bitShown(bit)) return `class ${cls}: no item-get page`;
  if ((cls === 1 || cls === 2 || cls === 3) && !(slot >= 1 && slot <= 9 && text > 0)) return `avatar part without slot/name`;
  if (cls === 7 && !(text > 0)) return "挑戦権 without text";
  if (cls === 8 && !(String(text) in YDC)) return `recipe ${text} not in cardpack/*.ydc`;
  if (cls === 10 && PP.titleIdFromBit(bit) === null) return "title not in the titles table";
  return null;
}

/** The 0x5205 ITEMGET_RESULT body: [bits, cards] */
function itemget(b: Uint8Array): [number[], number[]] {
  const n = u16(b);
  const bits = Array.from({ length: n }, (_, i) => u16(b, 2 + 2 * i));
  const m = u16(b, 2 + 2 * n);
  return [bits, Array.from({ length: m }, (_, i) => u16(b, 4 + 2 * n + 2 * i))];
}

const avatar = (sex: "M" | "F") => (sex === "F" ? "01" : "00") + "00".repeat(15);

describe("NPC rewards: every possible gift maps to a real card or item", () => {
  const npcs = loadNpcs(new Map()).map((n) => n[0]).sort((a, b) => a - b);

  it("the map has the famous chains (51-86) and the placed DC08 originals", () => {
    expect(npcs.filter((n) => n >= 51 && n <= 86)).toEqual(Array.from({ length: 36 }, (_, i) => 51 + i));
    expect(npcs.length).toBeGreaterThan(36);
  });

  it("each pack offered after a duel (CARD_PACKS) holds only displayable cards, and a draw gives one card", () => {
    const g = harness().game;
    for (const pack of CARD_PACKS) {
      const iid = (SD.iid as Record<string, number[]>)[String(pack)] ?? [];
      expect(iid.length, `pack ${pack}`).toBeGreaterThan(0);
      expect(iid.map((c) => [pack, c, badCard(c)]).filter(([, , why]) => why)).toEqual([]);
      for (let i = 0; i < 20; i++) {
        const cards = g.lpCards(pack, 1).slice(0, 1);
        expect(cards.length).toBe(1);
        expect(badCard(cards[0])).toBeNull();
      }
    }
  });

  for (const sex of ["M", "F"] as const) {
    it(`walks every NPC's prizes (sex ${sex}): wins to the end of the chain, the 200-win and 20-loss titles`, () => {
      const g = harness().game;
      const bad: unknown[] = [];
      const given = new Set<string>();
      for (const nid of npcs) {
        const p = PP.blankProfile("x"); p.trunk = {}; p.avatar = { a: avatar(sex), b: avatar(sex) };
        PP.onItemget(g, p, 4, nid);                                     // first talk: b3 = 1
        const duel = (res: number, n: number) => {
          for (let i = 0; i < n; i++) {
            const msgs = lobbyAfterDuelMsgs(g, p, nid, res);
            const packs = msgs.filter(([m]) => m === M_CARDPACKLIST).map(([, d]) => d);
            if (packs.length !== 1 || packs[0].length !== 2 || !CARD_PACKS.includes(u16(packs[0]))) bad.push([nid, "pack offer", packs]);
            const present = msgs.some(([m]) => m === M_NPCPRESENT);
            const [bits, cards] = itemget(PP.onItemget(g, p, 3, 0));
            if (present !== (bits.length + cards.length > 0)) bad.push([nid, i, "present", present, bits, cards]);
            for (const b of bits) { const why = badBit(b); if (why) bad.push([nid, "bit", b, why]); else given.add(`b${b}`); }
            for (const c of cards) { const why = badCard(c); if (why) bad.push([nid, "card", c, why]); else given.add(`c${c}`); }
          }
        };
        duel(RESULT_WIN, 205);
        duel(RESULT_LOSE, 25);
      }
      expect(bad).toEqual([]);
      // the walk reached the prizes: Yugi's 5-win card, his friendship title, the girl/boy present clothes, a recipe
      expect(["c365", "b160", "b121", "b374", `b${PP.NPC_PRIZE_BITS["51"].comp_got}`].filter((k) => !given.has(k))).toEqual([]);
      // every outfit variant of every famous NPC, boy and girl alike, whatever this player's gender
      const outfits = Object.values(PP.PRESENT_CLOTHES).flat().filter((b) => b !== null).map((b) => `b${b}`);
      expect(outfits.filter((k) => !given.has(k))).toEqual([]);
    });
  }
});
