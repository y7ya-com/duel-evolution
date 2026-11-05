// Cosmetic designs, not gendered ownership bits. Native equivalents share a family;
// unrelated costumes never become equivalent just because their slot numbers match.
import LD from "../../gamedata/lobby.json";
export type CosmeticKind = "outfit" | "dueldisk" | "hair" | "accessory";
export type CosmeticRarity = "common" | "rare" | "super" | "ultra";
export type Body = "male" | "female";
export type CosmeticVariant = { gender: Body; bit: number; number: number; worlds: number[] };
export type CosmeticFamily = { id: string; name: string; kind: CosmeticKind; rarity: CosmeticRarity; slot: number; variants: CosmeticVariant[]; artwork?: string };
export type BoxId = "head" | "dueldisk" | "outfit";
export type Pity = { superMisses: number; ultraMisses: number };
export const RARITIES: CosmeticRarity[] = ["common", "rare", "super", "ultra"];
export const AVATAR_ROWS = LD.avatar_pbin as unknown as Record<string, [number, number, number, number, number, number]>;
const ROWS = AVATAR_ROWS;

// ═══════════════════════════════ BOX ECONOMY TABLE ═══════════════════════════════
// The ONLY place box prices (earned MP), rarity weights and pity thresholds live.
// Weights are relative integers per rarity (they need not sum to 100); a rarity with no
// eligible family in the pool is dropped and the rest renormalised (see boxWeights).
// superAt: the Nth open without a super-or-better is guaranteed super-or-better (null = off).
// ultraAt: the Nth open without an ultra is guaranteed ultra (null = off).
// Item rarities follow duelforge (see the mapping comments below); the odds do not. duelforge's flat
// GACHA_BASE_WEIGHTS 79/15/5/1 suit pools of hundreds with a shard-pick backstop, not pools of 6-27.
// Weights and prices: server/docs/ECONOMY.md (live data, 2026-11-04; median player earns ~525 MP on a duel
// day). Pity guarantees a RARITY, never a new item: the design is drawn from the whole tier, owned or not,
// so duplicates stay possible and become tradable copies (cosmeticTrade) to encourage trading. The disk
// box keeps duelforge's seven ultras, so its ultra pity is 10.
export const BOX_ECONOMY: Readonly<Record<BoxId, { price: number; weights: Record<CosmeticRarity, number>; superAt: number | null; ultraAt: number | null }>> = {
  head:     { price: 500,  weights: { common: 55, rare: 30, super: 11, ultra: 4 }, superAt: 8, ultraAt: 15 },
  dueldisk: { price: 1000, weights: { common: 55, rare: 30, super: 11, ultra: 4 }, superAt: 8, ultraAt: 10 },
  outfit:   { price: 1200, weights: { common: 55, rare: 30, super: 11, ultra: 4 }, superAt: 8, ultraAt: 15 },
};
// ═════════════════════════════════════════════════════════════════════════════════

/** Which family kinds each box rolls. The head box replaced the "hair" box (pity and receipts migrate). */
const BOX_META: Record<BoxId, { name: string; kinds: CosmeticKind[] }> = {
  head: { name: "Head & Hair Accessory Box", kinds: ["hair", "accessory"] },
  dueldisk: { name: "Duel Disk Box", kinds: ["dueldisk"] },
  outfit: { name: "Outfit Box", kinds: ["outfit"] },
};
export const BOX_ALIASES: Readonly<Record<string, BoxId>> = { hair: "head" };
export const BOXES = (["head", "dueldisk", "outfit"] as const).map((id) => ({ id, ...BOX_META[id], ...BOX_ECONOMY[id] }));
export type Box = typeof BOXES[number];
export const canonicalBoxId = (id: unknown): BoxId | null =>
  typeof id !== "string" ? null : BOX_ALIASES[id] ?? (BOXES.some((b) => b.id === id) ? id as BoxId : null);
export const boxById = (id: unknown): Box | null => BOXES.find((b) => b.id === canonicalBoxId(id)) ?? null;

// Native CChibiAvatarElm::clothesPart (yo2ChibiAvatarElm.cpp): the art each outfit row draws. Two
// rows drawing the same art id are NOT necessarily one design (see OUTFITS).
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
// One outfit item = one native item text (yo2text_e id): the client names both bodies' rows of one
// design with the SAME text, and the native art (outfitArtworkId, CChibiAvatarElm::clothesPart) must
// match too. Sharing an art slot is not enough: Tracksuit Red (male) and Punk Red (female) both draw
// dc_02_c01, and Yami Yugi's and Téa's garms both draw dc_04_c01, but each pair has two texts and two
// different garments, so each is two single-body items (the 2026-11 split; see SPLIT_FAMILIES).
// Verified pairs (same text, same art): 3317 Black Suit dc_03, 3318 QUALIFIER's Robe dc_99, 3532
// Marik's garms dc_98. Rarities: duelforge's OUTFITS (packages/world-protocol), which names the same
// dc_/ac_ art, unless the owner set them: Black Suit rare, Joey rare, Kaiba super, Yami Yugi / Téa
// ultra (the fitted-duelist pair was ultra), tracksuits and punk outfits common; dc_98 is ultra and
// takes duelforge's name, Rare Hunter Cloak. Academy (ac_*): Jaden common, Chazz super, Jesse common,
// Hell Kaiser ultra, Aster super (not in any box: see dropExclusion).
const OUTFITS: Record<number, [string, string, CosmeticRarity]> = {
  3314: ["tracksuit-red", "Red Tracksuit", "common"],
  3315: ["tracksuit-green", "Green Tracksuit", "common"],
  3316: ["tracksuit-yellow", "Yellow Tracksuit", "common"],
  3381: ["punk-red", "Red Punk Outfit", "common"],
  3382: ["punk-yellow", "Yellow Punk Outfit", "common"],
  3383: ["punk-blue", "Blue Punk Outfit", "common"],
  3317: ["black-suit", "Black Suit", "rare"],
  3318: ["qualifier-robe", "Qualifier's Robe", "super"],
  3319: ["yugi", "Yami Yugi's Garms", "ultra"],
  3384: ["tea", "Téa's Garms", "ultra"],
  3327: ["kaiba", "Kaiba's Costume", "super"],
  3530: ["joey", "Joey's Costume", "rare"],
  3532: ["marik", "Rare Hunter Cloak", "ultra"],
  3328: ["jaden", "Jaden's Costume", "common"],
  3329: ["chazz", "Chazz's Costume", "super"],
  3531: ["jesse", "Jesse's Costume", "common"],
  3533: ["kaiser", "Hell Kaiser's Costume", "ultra"],
  3535: ["aster", "Aster's Costume", "super"],
};
/** Old family ids that bundled two different designs (the dc_02 and dc_04 art-slot pairs), and the
 * single-body item each body's half now is. Ownership of an old family is ownership of both halves;
 * a quantity (tradable copy, receipt, offer line) cannot be doubled, so it goes to the half of the
 * account's active character's body (resolveCosmeticId). Until the split, the half ids themselves
 * were aliases of the old family (outfit:yugi -> outfit:fitted-duelist...): a ledger written before
 * the split (no `split` marker) reads them as the whole pair. */
export const SPLIT_FAMILIES: Readonly<Record<string, Readonly<Record<Body, string>>>> = {
  "outfit:street-red": { male: "outfit:tracksuit-red", female: "outfit:punk-red" },
  "outfit:street-2": { male: "outfit:tracksuit-green", female: "outfit:punk-yellow" },
  "outfit:street-3": { male: "outfit:tracksuit-yellow", female: "outfit:punk-blue" },
  "outfit:fitted-duelist": { male: "outfit:yugi", female: "outfit:tea" },
};
const LEGACY_GROUP = new Map(Object.entries(SPLIT_FAMILIES).flatMap(([old, halves]) =>
  [old, halves.male, halves.female].map((id) => [id, halves] as const)));
const splitOf = (id: string, legacy: boolean) => legacy ? LEGACY_GROUP.get(id) : SPLIT_FAMILIES[id];
/** Old item ids merged into one item (owner, 2026-11-04), and the item each now is. Afro I, II and III are three
 *  sizes of one afro (male h1_11-13, female h1_06-08: the same silhouette, a little bigger each time; yo2text_e names
 *  them Afro Lv1-Lv3), so in-game they read as one hairstyle: one item, "Afro", common. Afro IV (h1_14 / h1_10, with
 *  ram horns) is another design and stays. The item's rows are all six (HEAD below): owning Afro projects every one of
 *  them, so a look saved with any size still validates, and the first row of each body (Afro I: male 10, female 5,
 *  the NPC five-win prize's) is the one equip puts on. Ledger migration: cosmetics.ts ledger() (`merged: 1`). */
export const MERGED_FAMILIES: Readonly<Record<string, string>> = { "hair:afro-1": "hair:afro", "hair:afro-2": "hair:afro", "hair:afro-3": "hair:afro" };
/** Where ONE unit named `id` (a copy, a receipt, an offer line, a request) belongs for this body. */
export const resolveCosmeticId = (id: string, body: Body, legacy = false): string => MERGED_FAMILIES[id] ?? splitOf(id, legacy)?.[body] ?? id;
/** Every item an ownership entry named `id` covers. */
export const ownedCosmeticIds = (id: string, legacy = false): string[] => {
  if (MERGED_FAMILIES[id]) return [MERGED_FAMILIES[id]];
  const halves = splitOf(id, legacy); return halves ? [halves.male, halves.female] : [id];
};
// Head items keyed by yo2text_e id: the client names both bodies' rows of one design with the
// SAME text, which is the equivalence. Slot 1 = front hair, slot 2 = accessory (a1_*), slot 9 =
// glasses/headwear (a2_*, CChibiAvatarElm ACCESSORY2). The native art index is NOT an
// equivalence here: cm_a2_02_c01 is red, cw_a2_02_c01 green; Green Specs is male 0x52 / female
// 0x51 (checked against the decoded merge.dat art). The hoods (h1_98/h1_99) ride on the robe and
// cloak outfits and are not separate items. duelforge has no hair/headwear rarities (they are
// free there), so these tiers are this server's own. Afro I-III are one item (MERGED_FAMILIES).
const HEAD: Record<number, [CosmeticKind, number, string, string, CosmeticRarity]> = {
  3263: ["hair", 1, "skinhead", "Bald", "rare"],
  3264: ["hair", 1, "quiff-1", "Quiff I", "common"],
  3265: ["hair", 1, "quiff-2", "Quiff II", "rare"],
  3266: ["hair", 1, "quiff-3", "Quiff III", "super"],
  3267: ["hair", 1, "afro", "Afro", "common"],
  3268: ["hair", 1, "afro", "Afro", "common"],
  3269: ["hair", 1, "afro", "Afro", "common"],
  3274: ["hair", 1, "afro-4", "Afro IV", "super"],
  3335: ["hair", 1, "ponytail", "Ponytail", "rare"],
  3500: ["accessory", 2, "plaster", "Plaster", "common"],
  3402: ["accessory", 9, "sunglasses", "Sunglasses", "rare"],
  3403: ["accessory", 9, "red-specs", "Red Specs", "common"],
  3404: ["accessory", 9, "green-specs", "Green Specs", "common"],
  3405: ["accessory", 9, "black-specs", "Black Specs", "common"],
  3406: ["accessory", 9, "brown-specs", "Brown Specs", "common"],
  3407: ["accessory", 9, "blue-specs", "Blue Specs", "common"],
  3408: ["accessory", 9, "pink-specs", "Pink Specs", "common"],
  3409: ["accessory", 9, "frameless-specs", "Frameless Specs", "common"],
  3534: ["accessory", 9, "bakura", "Bakura's Eyepatch", "ultra"],
};
// Authored design descriptions; the metadata supplies actual gender bits. Male and female
// rows of a disk share number and text (e.g. 177/433), so every disk is a verified pair.
// Rarity follows duelforge's DUEL_DISKS: a colourway takes its silhouette's tier, every Gold
// colourway is legendary = ultra (diskGachaRarity: legendary->ultra, epic->super). The silhouettes
// are the native displayDiskImage art (yo2DuelDiscShelf.cpp), whose colour names line up 1:1:
//   dd_01 Standard (common) = Battle City Black/Red/Blue/Yellow; dd_02 Skywing (ultra) = Battle
//   City α; dd_03 Battle Disk = Battle City β; da_02 Vortex (rare) = Cyclone; da_03
//   Phantom (epic -> super) = Blade.
// Deliberate deviations: duelforge labels dd_01_c05 "Gold" (legendary) from a hue scan, but the
// 2008 text and art say Battle City YELLOW (same orange-yellow as Academy Yellow, unlike the true
// golds), so it stays common. Battle City β, β Silver and β Black are super (owner, 2026-11); β Gold
// stays ultra. da_01 (the Academy model's colourways) is not in duelforge: ours.
// duelforge keeps Gold colourways grant-only; here they are the box's ultras.
const DISKS: Record<number, [string, CosmeticRarity]> = {
  3412: ["Battle City Black", "common"], 3413: ["Battle City Red", "common"],
  3466: ["Battle City Blue", "common"], 3468: ["Battle City Yellow", "common"],
  3416: ["Battle City Alpha", "ultra"], 3417: ["Battle City Alpha Gold", "ultra"],
  3418: ["Battle City Alpha Silver", "ultra"], 3419: ["Battle City Alpha Black", "ultra"],
  3454: ["Battle City Beta", "super"], 3455: ["Battle City Beta Gold", "ultra"],
  3456: ["Battle City Beta Silver", "super"], 3457: ["Battle City Beta Black", "super"],
  3450: ["Cyclone", "rare"], 3451: ["Cyclone Gold", "ultra"], 3452: ["Cyclone Silver", "rare"], 3453: ["Cyclone Black", "rare"],
  3458: ["Blade", "super"], 3459: ["Blade Gold", "ultra"], 3460: ["Blade Silver", "super"], 3461: ["Blade Black", "super"],
  3414: ["Academy Black", "common"], 3415: ["Academy Red", "common"],
  3467: ["Academy Blue", "common"], 3469: ["Academy Yellow", "common"],
  3470: ["Academy Crimson", "rare"], 3471: ["Academy Azure", "rare"], 3472: ["Academy Amber", "rare"],
};
type AvatarRow = readonly [number, number, number, number, number, number];
/** Worlds (0 Domino, 1 Academy) where an avatar_pbin row can be worn. The ONE rule every server
 * path uses (catalog variants, appearance validation, the gender switch, NPC looks):
 *   - every duel disk: both worlds;
 *   - Academy outfits (ac_* art, series 3, school uniforms included): both worlds;
 *   - Domino outfits (dc_* art, the Qualifier's Robe included although its row says series 1): Domino only;
 *   - anything else (hair, accessories, face): its raw series (1 both, 2 Domino, 3 Academy). */
export function avatarRowWorlds(row: AvatarRow): number[] {
  const [number, , , slot, , series] = row;
  if (slot === 8) return [0, 1];
  if (slot === 6) return number >= 0x7f || series === 3 ? [0, 1] : [0];
  return series === 1 ? [0, 1] : series === 2 ? [0] : series === 3 ? [1] : [];
}
function catalog(): CosmeticFamily[] {
  const families = new Map<string, CosmeticFamily>();
  for (const [key, row] of Object.entries(ROWS)) {
    const [number, initial, kind, slot, text] = row;
    if (initial || ![1, 2].includes(kind)) continue;
    let def: [CosmeticKind, string, string, CosmeticRarity] | null = null;
    const artwork = slot === 6 ? outfitArtworkId(number, kind === 2) : null;
    if (slot === 6 && OUTFITS[text]) { const [id, name, rarity] = OUTFITS[text]; def = ["outfit", id, name, rarity]; }
    if (HEAD[text] && HEAD[text][1] === slot) { const [box, , id, name, rarity] = HEAD[text]; def = [box, id, name, rarity]; }
    if (slot === 8 && DISKS[text]) { const [name, rarity] = DISKS[text]; def = ["dueldisk", String(text), name, rarity]; }
    if (!def) continue; // School uniforms and unknown data cannot leak into a random paid pool.
    const [box, keyId, name, rarity] = def, id = `${box}:${keyId}`;
    let family = families.get(id);
    if (!family) families.set(id, family = { id, name, kind: box, rarity, slot, variants: [], ...(artwork ? { artwork } : {}) });
    // one look for both worlds (owner, 2026-11-05): every item is worn in either (npcs.ts keeps avatarRowWorlds for NPCs)
    family.variants.push({ gender: kind === 1 ? "male" : "female", bit: Number(key), number, worlds: [0, 1] });
  }
  return [...families.values()];
}
export const COSMETICS = catalog();
export const COSMETIC_BY_ID = new Map(COSMETICS.map((item) => [item.id, item]));
export const COSMETIC_BY_BIT = new Map(COSMETICS.flatMap((item) => item.variants.map((v) => [v.bit, item] as const)));

// ═══════════════════════ ITEMS THAT EXIST FOR ONE BODY ONLY (FOR NOW) ═══════════════════════
// No avatar_pbin row is wearable by both bodies (each is kind 1 or 2), and many designs have art for
// one body only (Kaiba's and Joey's garms, the quiffs, the split outfits...). They still drop for
// everyone: whoever wins one keeps it and can trade it, and wears it once the other body's version is
// added. Every API item carries `bodies`, plus `notice` when one body is missing.
export const BODIES: readonly Body[] = ["male", "female"];
/** Player-facing notice for an item missing one body, keyed by the MISSING body. */
export const BODY_WIP_NOTICE: Readonly<Record<Body, string>> = {
  female: "The female version of this item is still being made. You can keep or trade it now and wear it once it's added.",
  male: "The male version of this item is still being made. You can keep or trade it now and wear it once it's added.",
};
/** One box-level line for the game to show near the boxes. */
export const BOX_BODY_NOTICE = "Some items exist for one body only for now. You can keep or trade them, and wear them once the other version is added.";
export const itemBodies = (item: CosmeticFamily): Body[] => BODIES.filter((b) => item.variants.some((v) => v.gender === b));
/** The notice for an item one body cannot wear yet, or null if both bodies can. */
export function bodyNotice(item: CosmeticFamily): string | null {
  const missing = BODIES.find((b) => !item.variants.some((v) => v.gender === b));
  return missing ? BODY_WIP_NOTICE[missing] : null;
}
/** The body fields every API item carries. */
export function bodyInfo(item: CosmeticFamily): { bodies: Body[]; notice?: string } {
  const notice = bodyNotice(item);
  return { bodies: itemBodies(item), ...(notice ? { notice } : {}) };
}
// ═══════════════════════════════════════════════════════════════════════════════════════════

/** Why a family can never drop (null = droppable). Every family stays in the catalog, so owners
 * keep ownership, equip and trade; only new rolls are withheld. Missing a body is NOT a reason. */
function dropExclusion(item: CosmeticFamily): string | null {
  // Duel Academy (series 3, ac_* art) outfits are reserved for ranked rewards. Academy duel disks are not outfits.
  if (item.kind === "outfit" && item.artwork?.startsWith("ac_")) return "Duel Academy outfit: reserved for ranked rewards";
  return null;
}
export const DROP_EXCLUSIONS: ReadonlyMap<string, string> = new Map(COSMETICS.flatMap((item) => {
  const why = dropExclusion(item); return why ? [[item.id, why] as const] : [];
}));
/** Add only verified equivalents; safe for native ownership checks and legacy saves. */
export function expandCosmeticBits(bits: number[]): number[] {
  const out = new Set(bits);
  for (const bit of bits) for (const variant of COSMETIC_BY_BIT.get(bit)?.variants ?? []) out.add(variant.bit);
  return [...out].sort((a, b) => a - b);
}
/** The box's pool. It does not depend on who opens it: single-body items drop for both bodies, so
 * the odds, duplicates and pity are the same for everyone. */
export function cosmeticPool(box: BoxId): CosmeticFamily[] {
  const kinds = BOX_META[box]?.kinds ?? [];
  return COSMETICS.filter((item) => kinds.includes(item.kind) && !DROP_EXCLUSIONS.has(item.id));
}
const has = (pool: CosmeticFamily[], tier: CosmeticRarity) => pool.some((item) => item.rarity === tier);
/** Sellable only if some weighted rarity has items and every advertised pity guarantee can be honoured. */
export function boxAvailable(box: Box, pool: CosmeticFamily[]): boolean {
  return RARITIES.some((t) => box.weights[t] > 0 && has(pool, t))
    && (box.superAt === null || (["super", "ultra"] as const).some((t) => box.weights[t] > 0 && has(pool, t)))
    && (box.ultraAt === null || has(pool, "ultra"));
}
/** Effective integer weights of the next open: empty rarities removed (the rest renormalise when
 * converted to odds); with pity, only the guaranteed tiers remain. */
export function boxWeights(box: Box, pool: CosmeticFamily[], pity?: Pity): Record<CosmeticRarity, number> {
  if (pity && box.ultraAt !== null && pity.ultraMisses >= box.ultraAt - 1)
    return { common: 0, rare: 0, super: 0, ultra: has(pool, "ultra") ? 1 : 0 };
  const allowed: CosmeticRarity[] = pity && box.superAt !== null && pity.superMisses >= box.superAt - 1 ? ["super", "ultra"] : RARITIES;
  return Object.fromEntries(RARITIES.map((t) => [t, allowed.includes(t) && has(pool, t) ? box.weights[t] : 0])) as Record<CosmeticRarity, number>;
}
export function oddsPercent(weights: Record<CosmeticRarity, number>): Record<CosmeticRarity, number> {
  const total = RARITIES.reduce((n, t) => n + weights[t], 0);
  return Object.fromEntries(RARITIES.map((t) => [t, total ? 100 * weights[t] / total : 0])) as Record<CosmeticRarity, number>;
}
type PoolRow = { count: number; singleBody: number; odds: number; perItem: number; ids: string[];
  items: { id: string; name: string; kind: CosmeticKind; rarity: CosmeticRarity; bodies: Body[]; notice?: string }[] };
/** Public odds disclosure: configured odds, effective odds after renormalisation, next-open
 * odds with this player's pity, and the pool per rarity with each item's chance and bodies. */
export function boxDisclosure(box: Box, pity?: Pity) {
  const pool = cosmeticPool(box.id), baseOdds = oddsPercent(boxWeights(box, pool)), nextOdds = pity ? oddsPercent(boxWeights(box, pool, pity)) : baseOdds;
  const singleBody = pool.filter((item) => bodyNotice(item)).length;
  return { available: boxAvailable(box, pool), configuredOdds: oddsPercent(box.weights), baseOdds, nextOdds, pool,
    singleBody, ...(singleBody ? { notice: BOX_BODY_NOTICE } : {}),
    poolByRarity: Object.fromEntries(RARITIES.map((t) => {
      const items = pool.filter((item) => item.rarity === t);
      return [t, { count: items.length, singleBody: items.filter((item) => bodyNotice(item)).length, odds: baseOdds[t],
        perItem: items.length ? baseOdds[t] / items.length : 0, ids: items.map((item) => item.id),
        items: items.map((item) => ({ id: item.id, name: item.name, kind: item.kind, rarity: item.rarity, ...bodyInfo(item) })) }];
    })) as Record<CosmeticRarity, PoolRow> };
}

/** The editor's initial PBIN parts, independent of paid pools and duplicate ledgers.
 * yo2ChangeAvatar.cpp kLists/refresh: initial rows by body and slot; fixed 7/7 colours,
 * numbered 3 skin tones, and an explicit glasses None. Rank uniforms stay rank-authored.
 * Names below are yo2text_e.idx/bin English strings, indexed by avatar_pbin text id. */
export type FreeCosmetic = Omit<CosmeticFamily, "kind" | "rarity"> & {
  kind: string; rarity: null; free: true; school?: "slifer"; uniform?: true;
};
const FREE_NAMES: Record<number, string> = {
  "3250": "Brown",
  "3251": "Blonde",
  "3252": "Black",
  "3253": "White",
  "3254": "Red",
  "3255": "Blue",
  "3256": "Green",
  "3257": "Default",
  "3258": "Long Hair",
  "3259": "Short Hair",
  "3260": "Spiky Hair",
  "3261": "Centre Parting",
  "3262": "Slick Hair",
  "3270": "Default",
  "3271": "Punk Hair",
  "3272": "Long Hair",
  "3273": "Ponytail",
  "3280": "Default",
  "3281": "Cold Eyes",
  "3282": "Dark Eyes",
  "3283": "Wild Eyes",
  "3284": "Large Eyes",
  "3285": "Thin Eyes",
  "3290": "Default",
  "3291": "Small",
  "3300": "Default",
  "3301": "Small",
  "3302": "Smirking",
  "3310": "Domino: White",
  "3311": "Domino: Red",
  "3312": "Domino: Yellow",
  "3313": "Domino: Black",
  "3320": "Academy: Red",
  "3321": "Academy: Yellow",
  "3322": "Academy: Blue",
  "3330": "Default",
  "3331": "Swept Hair",
  "3332": "Centre Parting",
  "3333": "Short Hair",
  "3334": "Fringe",
  "3340": "Default",
  "3341": "Long",
  "3342": "Medium",
  "3350": "Default",
  "3351": "Cold Eyes",
  "3352": "Gentle Eyes",
  "3353": "Cat eyes",
  "3360": "Default",
  "3361": "Small",
  "3370": "Default",
  "3371": "Glossy",
  "3380": "Domino Uniform",
  "3390": "Academy: Red",
  "3391": "Academy: Yellow",
  "3392": "Academy: Blue",
  "3400": "None",
  "3401": "Cheeks",
  "3410": "Battle City Model",
  "3411": "Duel Academy Model"
};
function freeCatalog(): FreeCosmetic[] {
  const items = new Map<string, FreeCosmetic>();
  const add = (id: string, name: string, slot: number, gender: Body, number: number, bit: number) => {
    let item = items.get(id);
    if (!item) items.set(id, item = { id, name, slot, kind: slot === 6 ? "outfit" : slot === 8 ? "dueldisk" : [3, 4, 5, 13, 15].includes(slot) ? "face" : slot === 2 || slot === 9 ? "accessory" : "hair", rarity: null, free: true, variants: [] });
    item.variants.push({ gender, number, bit, worlds: [0, 1] });
  };
  for (const [bit, row] of Object.entries(AVATAR_ROWS)) {
    const [number, initial, body, slot, text] = row;
    if (!initial || ![1, 2].includes(body) || (slot === 6 && number > 0x80)) continue;
    if (slot === 6 && number === 0x80) {
      add("uniform:slifer", "Slifer Red Uniform", slot, body === 2 ? "female" : "male", number, Number(bit));
      Object.assign(items.get("uniform:slifer")!, { school: "slifer", uniform: true });
      continue;
    }
    add(`free:part:${text}`, ([1, 3, 4, 5, 7].includes(slot) ? `${({1: "Hair", 3: "Nose", 4: "Eyes", 5: "Mouth", 7: "Back Hair"} as Record<number, string>)[slot]}: ${FREE_NAMES[text]}` : FREE_NAMES[text]) || `Part ${number}`, slot, body === 2 ? "female" : "male", number, Number(bit));
  }
  for (const gender of ["male", "female"] as const) {
    add("free:none:9", "No Glasses", 9, gender, 32, (gender === "female" ? 256 : 0) + 32);
    for (const [slot, label, count] of [[13, "Skin Tone", 3], [14, "Hair Colour", 7], [15, "Eye Colour", 7]] as const)
      for (let n = 0; n < count; n++) add(`free:${slot}:${n}`, slot === 13 ? `${label} ${n + 1}` : `${label}: ${FREE_NAMES[3250 + n]}`, slot, gender, n, -1);
  }
  return [...items.values()];
}
export const FREE_COSMETICS = freeCatalog();
export const FREE_COSMETIC_BY_ID = new Map(FREE_COSMETICS.map(item => [item.id, item]));
