// One game-wide rarity per passcode, reused for shop, collections and trades.
// This is a design classification, not a claim about original printing/foil or current pack odds.
import DATA from "../../data/card-rarities.json";
import TD from "../../gamedata/translator.json";

export type CardRarity = "N" | "R" | "SR" | "UR";
const VALUES = new Set(["N", "R", "SR", "UR"]);
const TABLE = DATA.rarity as Record<string, string>;
const WIRE = TD.wire as number[];
const INDEX = new Map(WIRE.map((passcode, index) => [passcode, index + 1]));
export const CARD_RARITY_LABELS: Record<CardRarity, string> = { N: "Common", R: "Rare", SR: "Super Rare", UR: "Ultra Rare" };
export function cardRarity(passcode: number): CardRarity | null {
  const value = TABLE[String(passcode)];
  return VALUES.has(value) ? value as CardRarity : null;
}
export const cardInternalId = (passcode: number): number | null => INDEX.get(passcode) ?? null;
export const cardPasscode = (internalId: number): number | null => WIRE[internalId - 1] ?? null;
let CATALOG: Record<string, unknown> | null = null;
export function cardRarityCatalog(): Record<string, unknown> {
  return CATALOG ??= {
    version: DATA.version, source: DATA.source, classification: DATA.classification,
    labels: CARD_RARITY_LABELS,
    byPasscode: Object.fromEntries(Object.entries(TABLE).filter(([, value]) => VALUES.has(value))),
    byInternalId: Object.fromEntries(WIRE.flatMap((pc, i) => {
      const rarity = cardRarity(pc); return rarity ? [[String(i + 1), rarity]] : [];
    })),
  };
}
