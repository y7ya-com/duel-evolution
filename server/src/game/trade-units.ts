// How a mixed trade (cards + cosmetics, trade.ts) counts against the anti-alt intake cap (persist.ts TRADE_IN_DAY_MAX)
// and in the daily report (db/audit.ts). One budget, in card units: a card is 1, a cosmetic copy is its rarity's weight.
// The weights follow what a copy costs out of the boxes (earned MP only: an Outfit Box is 1500 MP, a booster 200), and
// stop at the whole day's cap: an account takes in at most one Ultra Rare net a day, or 15 Commons, or 30 cards, or a
// mix. A swap of equal units counts nothing, so a card-for-cosmetic trade of equal weight is balanced.
export type CosmeticRarity = "common" | "rare" | "super" | "ultra";
export const COSMETIC_UNITS: Record<CosmeticRarity, number> = { common: 2, rare: 5, super: 15, ultra: 30 };
/** A cosmetic trade line as the ledger and trade_log keep it: the item, its copies and its rarity at the time. */
export interface CosmeticLine { id: string; count: number; rarity?: string }
export const cosmeticUnits = (lines: readonly CosmeticLine[]): number =>
  lines.reduce((n, l) => n + (COSMETIC_UNITS[l.rarity as CosmeticRarity] ?? COSMETIC_UNITS.common) * Math.max(0, Math.floor(l.count) || 0), 0);
export const cosmeticCopies = (lines: readonly CosmeticLine[]): number => lines.reduce((n, l) => n + Math.max(0, Math.floor(l.count) || 0), 0);
