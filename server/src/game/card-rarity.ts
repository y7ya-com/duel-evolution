// One game-wide rarity per passcode, reused for shop, collections and trades.
// This is a design classification, not a claim about original printing/foil or current pack odds.
import DATA from "../../data/card-rarities.json";
import CARDS from "../../gamedata/cards.json";

export type CardRarity = "N" | "R" | "SR" | "UR";
const VALUES = new Set(["N", "R", "SR", "UR"]);
const TABLE = DATA.rarity as Record<string, string>;
const NON_COLLECTIBLE = new Set<number>(DATA.nonCollectible);
// the client's card id (its 2008 card index, what the card pictures and the trunk use) <-> passcode: gamedata/cards.json,
// as passcodes.ts. Not translator.json's wire order, which is the hello's passcode list and a different numbering.
const ROWS = CARDS as { i: number; pc: number }[];
const INDEX = new Map(ROWS.map((c) => [c.pc, c.i]));
const BY_ID = new Map(ROWS.map((c) => [c.i, c.pc]));
export const CARD_RARITY_LABELS: Record<CardRarity, string> = { N: "Normal", R: "Rare", SR: "Super Rare", UR: "Ultra Rare" };
export function cardRarity(passcode: number): CardRarity | null {
  if (NON_COLLECTIBLE.has(passcode)) return null;
  const value = TABLE[String(passcode)];
  return VALUES.has(value) ? value as CardRarity : null;
}
export const cardInternalId = (passcode: number): number | null => INDEX.get(passcode) ?? null;
export const cardPasscode = (internalId: number): number | null => BY_ID.get(internalId) ?? null;
let CATALOG: Record<string, unknown> | null = null;
export function cardRarityCatalog(): Record<string, unknown> {
  return CATALOG ??= {
    version: DATA.version, source: DATA.source, classification: DATA.classification,
    labels: CARD_RARITY_LABELS,
    byPasscode: Object.fromEntries(Object.entries(TABLE).filter(([pc, value]) => !NON_COLLECTIBLE.has(Number(pc)) && VALUES.has(value))),
    byInternalId: Object.fromEntries(ROWS.flatMap(({ i, pc }) => {
      const rarity = cardRarity(pc); return rarity ? [[String(i), rarity]] : [];
    })),
  };
}
