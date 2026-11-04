// Cosmetic designs, not gendered ownership bits. Native equivalents share a family;
// unrelated costumes never become equivalent just because their slot numbers match.
import LD from "../../gamedata/lobby.json";
export type CosmeticKind = "outfit" | "dueldisk" | "hair";
export type CosmeticRarity = "common" | "rare" | "super" | "ultra";
export type CosmeticVariant = { gender: "male" | "female"; bit: number; number: number; worlds: number[]; name?: string };
export type CosmeticFamily = { id: string; name: string; kind: CosmeticKind; rarity: CosmeticRarity; slot: number; variants: CosmeticVariant[]; artwork?: string };
export type BoxId = CosmeticKind;
export const RARITIES: CosmeticRarity[] = ["common", "rare", "super", "ultra"];
export const AVATAR_ROWS = LD.avatar_pbin as unknown as Record<string, [number, number, number, number, number, number]>;
const ROWS = AVATAR_ROWS;
// Native CChibiAvatarElm::clothesPart (yo2ChibiAvatarElm.cpp) is authoritative:
// two differently named NPC rewards can be the SAME design's male/female art.
export function outfitArtworkId(number: number, female: boolean): string | null {
  const pad = (n: number) => String(n).padStart(2, "0");
  if (number >= 0x7f) return `ac_${pad(Math.max(1, number - 0x7f))}_c01`;
  const k = number - 0x6f;
  if (k < 0) return null;
  if (!female) {
    if (k < 5) return `dc_01_c${pad(Math.max(1, k))}`;
    if (k < 8) return `dc_02_c${pad(number - 0x73)}`;
    return ["dc_03_c01", "dc_99_c01", "dc_04_c01", "dc_05_c01", "dc_06_c01", "dc_98_c01"][k - 8] ?? null;
  }
  if (k <= 1) return "dc_01_c01";
  if (k < 5) return `dc_02_c${pad(number - 0x70)}`;
  return ["dc_03_c01", "dc_99_c01", "dc_04_c01", "dc_98_c01"][k - 5] ?? null;
}
const OUTFITS: Record<string, [string, string, CosmeticRarity]> = {
  dc_02_c01: ["street-red", "Street Duelist I", "common"],
  dc_02_c02: ["street-2", "Street Duelist II", "common"],
  dc_02_c03: ["street-3", "Street Duelist III", "common"],
  dc_03_c01: ["black-suit", "Black Suit", "rare"],
  dc_99_c01: ["qualifier-robe", "Qualifier's Robe", "ultra"],
  dc_04_c01: ["fitted-duelist", "Fitted Duelist Outfit", "ultra"],
  dc_05_c01: ["kaiba", "Kaiba's Costume", "super"],
  dc_06_c01: ["joey", "Joey's Costume", "rare"],
  dc_98_c01: ["marik", "Marik's Costume", "super"],
  ac_08_c01: ["jaden", "Jaden's Costume", "super"],
  ac_09_c01: ["chazz", "Chazz's Costume", "super"],
  ac_10_c01: ["jesse", "Jesse's Costume", "rare"],
  ac_11_c01: ["kaiser", "Hell Kaiser's Costume", "ultra"],
  ac_12_c01: ["aster", "Aster's Costume", "super"],
};
const ID_ALIASES: Record<string, string> = {
  "outfit:yugi": "outfit:fitted-duelist", "outfit:tea": "outfit:fitted-duelist",
  "outfit:tracksuit-red": "outfit:street-red", "outfit:punk-red": "outfit:street-red",
  "outfit:tracksuit-green": "outfit:street-2", "outfit:punk-yellow": "outfit:street-2",
  "outfit:tracksuit-yellow": "outfit:street-3", "outfit:punk-blue": "outfit:street-3",
};
export const canonicalCosmeticId = (id: string): string => ID_ALIASES[id] ?? id;
const HAIR: Record<number, [string, string, CosmeticRarity]> = {
  3263: ["skinhead", "Shaved Hair", "common"],
  3264: ["quiff-1", "Quiff I", "common"],
  3265: ["quiff-2", "Quiff II", "rare"],
  3266: ["quiff-3", "Quiff III", "super"],
  3267: ["afro-1", "Afro I", "common"],
  3268: ["afro-2", "Afro II", "common"],
  3269: ["afro-3", "Afro III", "rare"],
  3274: ["afro-4", "Afro IV", "super"],
  3335: ["ponytail", "Ponytail", "rare"],
};
// Authored design descriptions; the metadata supplies actual gender/world bits.
const DISKS: Record<number, [string, CosmeticRarity]> = {
  3412: ["Battle City Black", "common"], 3413: ["Battle City Red", "common"],
  3416: ["Battle City Alpha", "rare"], 3417: ["Battle City Alpha Gold", "ultra"],
  3418: ["Battle City Alpha Silver", "super"], 3419: ["Battle City Alpha Black", "rare"],
  3454: ["Battle City Beta", "rare"], 3414: ["Academy Black", "common"], 3415: ["Academy Red", "common"],
  3450: ["Cyclone", "rare"], 3451: ["Cyclone Gold", "ultra"], 3452: ["Cyclone Silver", "super"], 3453: ["Cyclone Black", "rare"],
  3458: ["Blade", "rare"], 3455: ["Battle City Beta Gold", "ultra"], 3456: ["Battle City Beta Silver", "super"],
  3457: ["Battle City Beta Black", "rare"], 3466: ["Battle City Blue", "common"], 3468: ["Battle City Yellow", "common"],
  3459: ["Blade Gold", "ultra"], 3460: ["Blade Silver", "super"], 3461: ["Blade Black", "rare"],
  3467: ["Academy Blue", "common"], 3469: ["Academy Yellow", "common"],
  3470: ["Academy Crimson", "rare"], 3471: ["Academy Azure", "rare"], 3472: ["Academy Amber", "rare"],
};
function catalog(): CosmeticFamily[] {
  const families = new Map<string, CosmeticFamily>();
  for (const [key, [number, initial, kind, slot, text, series]] of Object.entries(ROWS)) {
    if (initial || ![1, 2].includes(kind)) continue;
    let def: [CosmeticKind, string, string, CosmeticRarity] | null = null;
    const artwork = slot === 6 ? outfitArtworkId(number, kind === 2) : null;
    if (artwork && OUTFITS[artwork]) { const [id, name, rarity] = OUTFITS[artwork]; def = ["outfit", id, name, rarity]; }
    if (slot === 1 && HAIR[text]) { const [id, name, rarity] = HAIR[text]; def = ["hair", id, name, rarity]; }
    if (slot === 8 && DISKS[text]) { const [name, rarity] = DISKS[text]; def = ["dueldisk", String(text), name, rarity]; }
    if (!def) continue; // School uniforms and unknown data cannot leak into a random paid pool.
    const [box, keyId, name, rarity] = def, id = `${box}:${keyId}`;
    let family = families.get(id);
    if (!family) families.set(id, family = { id, name, kind: box, rarity, slot, variants: [], ...(artwork ? { artwork } : {}) });
    const variantNames: Record<number, string> = { 3314: "Red Tracksuit", 3315: "Green Tracksuit", 3316: "Yellow Tracksuit", 3381: "Red Punk Outfit", 3382: "Yellow Punk Outfit", 3383: "Blue Punk Outfit", 3319: "Yami Yugi's garms", 3384: "Téa's garms" };
    family.variants.push({ gender: kind === 1 ? "male" : "female", bit: Number(key), number, worlds: series === 1 ? [0, 1] : series === 2 ? [0] : series === 3 ? [1] : [], ...(variantNames[text] ? { name: variantNames[text] } : {}) });
  }
  return [...families.values()];
}
export const COSMETICS = catalog();
export const COSMETIC_BY_ID = new Map(COSMETICS.map((item) => [item.id, item]));
export const COSMETIC_BY_BIT = new Map(COSMETICS.flatMap((item) => item.variants.map((v) => [v.bit, item] as const)));
/** Product eligibility is stricter than sharing a native renderer slot. The original
 * Yugi/Téa rewards both use dc_04_c01, but that does not establish a matching female
 * Yugi costume. Keep legacy family ownership/IDs intact; do not sell new rolls of it. */
export const OUTFIT_DROP_EXCLUSIONS: Readonly<Record<string, string>> = Object.freeze({
  "outfit:fitted-duelist": "Named Yugi/Téa costumes lack confirmed matching-body costume artwork",
});
export const BOXES: { id: BoxId; name: string; price: number; weights: Record<CosmeticRarity, number>; superAt: number; ultraAt: number | null }[] = [
  { id: "hair", name: "Hair Box", price: 500, weights: { common: 60, rare: 30, super: 10, ultra: 0 }, superAt: 10, ultraAt: null },
  { id: "dueldisk", name: "Duel Disk Box", price: 1000, weights: { common: 60, rare: 30, super: 8, ultra: 2 }, superAt: 10, ultraAt: 20 },
  { id: "outfit", name: "Outfit Box", price: 1500, weights: { common: 60, rare: 30, super: 8, ultra: 2 }, superAt: 10, ultraAt: 20 },
];
/** Add only verified equivalents; safe for native ownership checks and legacy saves. */
export function expandCosmeticBits(bits: number[]): number[] {
  const out = new Set(bits);
  for (const bit of bits) for (const variant of COSMETIC_BY_BIT.get(bit)?.variants ?? []) out.add(variant.bit);
  return [...out].sort((a, b) => a - b);
}
export function cosmeticPool(box: BoxId, gender: "male" | "female"): CosmeticFamily[] {
  return COSMETICS.filter((item) => item.kind === box && item.variants.some((v) => v.gender === gender)
    && (box !== "outfit" || !OUTFIT_DROP_EXCLUSIONS[item.id])
    // New outfit purchases must keep their actual design when the player changes body.
    // Preserve legacy single-body ownership in the wardrobe, but never sell unusable new ownership.
    && (box !== "outfit" || ["male", "female"].every((body) => item.variants.some((v) => v.gender === body))));
}
