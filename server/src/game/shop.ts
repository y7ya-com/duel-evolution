// The shop (py yo2srv/tienda/tienda.py and sobres.py, plus research/avatar's clothes catalogue).
import type { Conn } from "../net/conn.ts";
import { W } from "../net/proto.ts";
import SD from "../../gamedata/shop.json";
import ROTATION_DATA from "../../data/shop-rotation.json";
const ROTATION: Omit<typeof ROTATION_DATA, "forceOn" | "forceOff"> & { forceOn: number[]; forceOff: number[] } = ROTATION_DATA;
import LD from "../../gamedata/lobby.json";
import type { Game } from "./game.ts";
import * as PP from "./persist.ts";
import { cardRarity, type CardRarity } from "./card-rarity.ts";
import { boundOf } from "./starter.ts";
import { SECRET_BOOSTERS, secretPackAvailable, secretObtained } from "./secret-packs.ts";

// packinfo_s stopped at 45, but the shipped client and card pools also include 46–48.
// Append these rather than renumbering existing shop items (carts use catalogue indices).
const PACKS = [...SD.packs] as [number, number, number | null][];
for (const pid of [46, 47, 48]) {
  if (!PACKS.some(([id]) => id === pid) && SD.iid[String(pid) as keyof typeof SD.iid]?.length) PACKS.push([pid, 0, null]);
}
const IID = SD.iid as Record<string, number[]>;
const YDC = SD.ydc as Record<string, number[]>;
/** Legacy single-card rows (ids stay reserved while sales are disabled): the first 40 of the 2008 card list, by passcode, then gamedata's `single` (the cards
 *  the 2008 client never had that no pack carries: scripts/passcode_gamedata.py) */
export const SHOP_CARDS = [67105242, 17535588, 15480588, 53153481, 49587396, 25109950, 50122883, 62403074, 12436646, 86164529, 95132338, 85639257, 97360116, 81933259, 99597615, 126218, 28725004, 81863068, 26725158, 58775978, 48365709, 43434803, 77568553, 48305365, 68870276, 91869203, 77622396, 95174353, 14708569, 17881964, 6368038, 6368039, 30606547, 87564352, 52675689, 89494469, 50287060, 31339260, 36151751, 10262698, ...((SD as { single?: number[] }).single ?? [])];
export const SHOP_SELL_SINGLES = false;
const SHOP_SELL_PRIZE_PACKS = false, SHOP_DECK_RECIPE = true, SHOP_DECK_ITEMGET = false;
export const PACK_SIZE = 5;
const SHOP_ENTRIES_PER_MSG = 78;
export const PACK_RARITY_ODDS = {
  regular: { N: 0.70, R: 0.25, SR: 0.04, UR: 0.01 },
  final: { R: 0.75, SR: 0.20, UR: 0.05 },
} as const;
export const PACK_RARITIES: CardRarity[] = ["N", "R", "SR", "UR"];
export function packContents(id: number): { kind: "pack" | "deck"; cards: number[] } | null {
  const cards = IID[String(id)] ?? YDC[String(id)];
  return cards ? { kind: IID[String(id)] ? "pack" : "deck", cards } : null;
}
/** Fixed-deck ownership belongs to the active character, independently of its remaining cards.
 * Old HTML receipts have no slot: only recover those on accounts with one character and no deleted characters.
 * Economy logs contain no product ids; never guess ownership from a trunk or aggregate spending.
 */
export function purchasedDecks(g: Game, p: PP.P): Set<number> {
  const ids = new Set<number>((p.shop_decks ?? []).filter((id: number) => packContents(id)?.kind === "deck"));
  if (packContents(p.starter)?.kind === "deck") ids.add(p.starter);
  const acct = g.ctxAcct();
  const account = acct ? g.store.loadRaw().accounts[acct] : null;
  if (account) {
    const profiles = Object.entries(account.profiles ?? {}).filter(([, profile]) => !!profile);
    const slot = PP.activeSlot(g.loadState());
    const products = PACKS.filter(([, kind]) => kind !== 2 || SHOP_SELL_PRIZE_PACKS);
    for (const r of Object.values(account.shop_api?.receipts ?? {}) as any[]) {
      // New receipts already have durable character ownership in shop_decks. Slot numbers can be reused
      // after deletion, so they cannot identify the owner of an old receipt by themselves.
      if (r.slot !== undefined || profiles.length !== 1 || account.profiles_borrados?.length || profiles[0][0] !== String(slot)) continue;
      const id = products[r.itemId - 1]?.[0];
      if (id && r.count > 0 && r.purchased?.length && packContents(id)?.kind === "deck") ids.add(id);
    }
  }
  return ids;
}
/** Purchase and disclosure share the effective odds over available rarity tiers. */
export function packRarityDistribution(cards: readonly number[]) {
  const pool: Record<CardRarity, number[]> = { N: [], R: [], SR: [], UR: [] };
  for (const card of new Set(cards)) pool[cardRarity(card) ?? "N"].push(card);
  const effective = (base: Partial<Record<CardRarity, number>>) => {
    const odds: Partial<Record<CardRarity, number>> = {};
    const total = PACK_RARITIES.reduce((sum, r) => sum + (pool[r].length ? base[r] ?? 0 : 0), 0);
    if (total) for (const r of PACK_RARITIES) {
      if (pool[r].length && base[r]) odds[r] = base[r]! / total;
    }
    else {
      const best = [...PACK_RARITIES].reverse().find((r) => pool[r].length);
      if (best) odds[best] = 1;
    }
    return odds;
  };
  return { pool, slots: [
    { count: 4, guaranteed: null, odds: effective(PACK_RARITY_ODDS.regular) },
    { count: 1, guaranteed: "R" as const, odds: effective(PACK_RARITY_ODDS.final) },
  ] };
}
/** The HTML shop's display data, in one place (owner-approved names; edit here). Boosters 33-48 carry their 2008 set
 *  names, 1-32 themed names; the Beginner's packs and the decks keep packinfo_e.txt's names (starter.ts STARTER_DECKS).
 *  art: the pack's picture in merge.dat data/cardpack/ (packinfo_e.txt's image column; 46-48 follow 45's pattern), read
 *  by the client at runtime: never in git. */
export const PACK_NAMES: Record<number, string> = {
  1: "Thunderstrike", 2: "Dark Arts", 3: "White Dragon's Roar", 4: "Shifting Tides", 5: "The Forbidden One",
  6: "Black Dragon's Rage", 7: "Charity's Gift", 8: "Royal Decree", 9: "Thief's Tools", 10: "Final Judgment",
  11: "Heavy Storm", 12: "Cyber Origins", 13: "Scapegoat Gambit", 14: "Mirror Force", 15: "Delinquent Duo",
  16: "Beast Kingdom", 17: "Imperial Order", 18: "Goblin Raid", 19: "Torrential Tide", 20: "Spirit Shrine",
  21: "Warrior's Call", 22: "Crow of Fate", 23: "Moonlit Trap", 24: "Gravekeeper's Watch", 25: "XYZ Assembly",
  26: "Magical Library", 27: "Dimensional Warriors", 28: "Moon Spirit", 29: "Envoys of Chaos", 30: "Dimension Fusion",
  31: "Thunder Monarch", 32: "Anubis' Tomb",
  33: "Soul of the Duelist", 34: "Rise of Destiny", 35: "Flaming Eternity", 36: "The Lost Millennium",
  37: "Cybernetic Revolution", 38: "Elemental Energy", 39: "Shadow of Infinity", 40: "Enemy of Justice",
  41: "Power of the Duelist", 42: "Cyberdark Impact", 43: "Strike of Neos", 44: "Force of the Breaker",
  45: "Tactical Evolution", 46: "Gladiator's Assault", 47: "Phantom Darkness", 48: "Light of Destruction",
  1001: "Beginner's Pack 1", 1002: "Beginner's Pack 2", 1003: "Beginner's Pack 3",
};
/** A pack's season (packinfo_e.txt's descriptions: 1-14 season 1, 15-23 season 2, 24-32 season 3, 33-40 season 4,
 *  41-48 season 5); 0 for the Beginner's packs and the decks. */
export const packSeason = (id: number) => id < 1 || id > 48 ? 0 : id <= 14 ? 1 : id <= 23 ? 2 : id <= 32 ? 3 : id <= 40 ? 4 : 5;
export function packArt(id: number): string | null {
  const s = (pre: string, n: number) => `${pre}${n}.png`;
  if (id === 1 || id === 2) return s("p05-1-f", id);
  if (id >= 3 && id <= 9) return s("p05-1-n", id - 2);
  if (id >= 10 && id <= 16) return s("p05-2-n", id - 9);
  if (id >= 17 && id <= 23) return s("p05-3-n", id - 16);
  if (id >= 24 && id <= 30) return s("p06-1-f", id - 23);
  if (id >= 31 && id <= 48) return s("p07-1-b", id);
  if (id >= 1001 && id <= 1003) return s("p06-1-b", id - 1000);
  if (id >= 7000 && id < 8000) return "p06-1-e1.png";
  if (id >= 8000 && id < 9000) return "p06-1-e2.png";
  return null;
}
/** Curated meta highlights last one update; filler cohorts overlap for fillerDays.
 * The schedule extends deterministically before the epoch. All dates use game-clock seconds.
 * Config overrides are evaluated each request; forceOff wins. Permanent shelves stay available.
 */
export type RotationGroup = "update" | "leaving" | "always" | "out";
export const SHOP_ROTATION = ROTATION;
const DAY_SECONDS = 24 * 60 * 60;
const rotationStep = (now: number) => Math.floor((now - Date.parse(ROTATION.epoch) / 1000) / (ROTATION.updateDays * DAY_SECONDS));
const stepTime = (step: number) => Date.parse(ROTATION.epoch) / 1000 + step * ROTATION.updateDays * DAY_SECONDS;
const themeAt = (step: number) => ROTATION.themes[((step % ROTATION.themes.length) + ROTATION.themes.length) % ROTATION.themes.length];
export function rotationUpdate(now: number) {
  const index = rotationStep(now), theme = themeAt(index), endsAt = new Date(stepTime(index + 1) * 1000).toISOString();
  const highlighted = theme.highlighted.filter(id => !ROTATION.forceOff.includes(id) || !ROTATION.pool.includes(id));
  return { update: { index, theme: theme.theme, blurb: theme.blurb, endsAt, highlighted }, nextUpdateAt: endsAt,
    nextUpdate: ROTATION.pool.filter(id => !packInRotation(id, now) && packInRotation(id, stepTime(index + 1))).length };
}
export function packRotation(id: number, now: number): { group: RotationGroup; endsAt: string | null; highlighted: boolean } {
  const step = rotationStep(now), highlighted = themeAt(step).highlighted.includes(id);
  const permanent = ROTATION.classics.includes(id) || ROTATION.beginnerPacks.includes(id) || packContents(id)?.kind === "deck" || !ROTATION.pool.includes(id);
  if (permanent) return { group: "always", endsAt: null, highlighted };
  if (ROTATION.forceOff.includes(id)) return { group: "out", endsAt: null, highlighted: false };
  if (ROTATION.forceOn.includes(id)) return { group: highlighted ? "update" : "always", endsAt: null, highlighted };
  let end = highlighted ? stepTime(step + 1) : 0, entered = -Infinity;
  for (let age = 0; age < Math.ceil(ROTATION.fillerDays / ROTATION.updateDays); age++) {
    const cohort = step - age, start = stepTime(cohort), expiry = start + ROTATION.fillerDays * DAY_SECONDS;
    if (themeAt(cohort).filler.includes(id) && expiry > now) { end = Math.max(end, expiry); entered = Math.max(entered, start); }
  }
  if (!end) return { group: "out", endsAt: null, highlighted: false };
  return { group: end - now <= ROTATION.leavingDays * DAY_SECONDS ? "leaving" : highlighted || entered === stepTime(step) ? "update" : "always",
    endsAt: new Date(end * 1000).toISOString(), highlighted };
}
/** In this rotation (on sale to everyone). */
export const packInRotation = (id: number, now: number) => packRotation(id, now).group !== "out";
/** An ordinary booster: the packs whose SR / UR pulls give secret pack keys (not the Beginner's packs, not decks). */
export const isOrdinaryBooster = (id: number) => SECRET_BOOSTERS.includes(id);
/** A product whose copies are always bound on purchase, whatever MP paid: structure decks and the Beginner's packs. */
export const bindsOnPurchase = (kind: number, prm: number) => kind === 1 && (packContents(prm)?.kind === "deck" || (prm >= 1001 && prm <= 1003));
/** Whether pack `id` is on sale to this player now: in the rotation, or (an ordinary booster) unlocked by a key. */
export function packAvailable(g: Game, p: PP.P | null, id: number): boolean {
  if (!isOrdinaryBooster(id) || !p) return packInRotation(id, g.clock.time());
  return secretPackAvailable(p, id, packInRotation(id, g.clock.time()), g.clock.time());
}
// the active character's profile, when the catalogue is asked for in a session (the native shop's 0x52xx)
function activeProfile(g: Game): PP.P | null {
  try { const st = g.loadState(); return PP.profile(st, PP.activeSlot(st), false); } catch { return null; }
}

const AV_PBIN = LD.avatar_pbin as unknown as Record<string, [number, number, number, number, number, number]>;

/** py shop_prices: the admin's price table (py admin_tienda.json), integers 1..100000 only. */
const shopPrices = (g: Game): Record<string, number> =>
  Object.fromEntries(Object.entries(g.admin.data.prices).filter(([, v]) => Number.isInteger(v) && v >= 1 && v <= 100000));

// research/avatar avatar_shop_items
const SHOP_AVATAR_TYPE = 2;
const AVATAR_PRICES: Record<number, number> = { 1: 300, 2: 200, 3: 100, 4: 200, 5: 100, 6: 1000, 7: 300, 8: 1500, 9: 500 };
const PRESENT_TEXT_IDS = new Set([3318, 3319, 3327, 3530, 3532, 3328, 3329, 3531, 3533, 3535, 3384, 3326, 3534]);
/** avatar_pbin slots (column 4, names from yo2text_e): 1 hair, 2 face mark (None / Cheeks / Plaster), 3 nose, 4 eyes,
 *  5 mouth, 6 outfit (Academy uniforms and character garms included), 7 back hair, 8 duel disk, 9 glasses. Wearables
 *  come only from cosmetic boxes (and Academy outfits later from ranked play), so the shop sells none of them. Slots
 *  3-5 are body features of the free appearance editor: every row is a default item, so nothing of theirs is listed. */
export const WEARABLE_AVATAR_SLOTS: ReadonlySet<number> = new Set([1, 2, 6, 7, 8, 9]);
function avatarShopItems(firstIid: number): Uint8Array[] {
  const items: Uint8Array[] = [];
  let iid = firstIid;
  for (const idx of Object.keys(AV_PBIN).map(Number).sort((a, b) => a - b)) {
    const [val, dflt, kind, slot, text] = AV_PBIN[String(idx)];
    if (!(kind === 1 || kind === 2) || !(slot >= 1 && slot <= 9)) continue;
    if (dflt) continue;
    if ((slot === 2 || slot === 9) && val === 0x20) continue;
    // Every 2008 catalogue row keeps its item id (iid) even when withdrawn: a stale native or HTML cart naming it finds
    // no row (skipped, never charged) and can never buy whatever item would otherwise have shifted into its id.
    // Anything appended to the catalogue later must start after this reserved range.
    const itemId = iid++;
    if (WEARABLE_AVATAR_SLOTS.has(slot)) continue;
    const cost = (AVATAR_PRICES[slot] ?? 500) * (PRESENT_TEXT_IDS.has(text) ? 3 : 1);
    items.push(new W().u32(itemId).u8(SHOP_AVATAR_TYPE).u32(idx).u32(cost).u8(0).u8(0).u8(0).u8(0).bytes());
  }
  return items;
}

/** The catalogue as player p sees it (default: the session's active character). A pack not on sale to them (rotated out,
 *  no key) or an owned deck is left out, its item id kept: ids never shift between players or rotations.
 * HTML views include owned decks so they can display Purchased. */
export function shopCatalog(g: Game, p: PP.P | null = activeProfile(g), includePurchased = false): Uint8Array[] {
  const items: Uint8Array[] = [];
  let iid = 1;
  const pr = shopPrices(g);
  const decks = p && !includePurchased ? purchasedDecks(g, p) : new Set<number>();
  for (const [pid] of PACKS.filter(([, kind]) => kind !== 2 || SHOP_SELL_PRIZE_PACKS)) {
    if (decks.has(pid) || !packAvailable(g, p, pid)) { iid++; continue; }
    let cost = pid >= 1001 && pid <= 1003 ? 100 : pid >= 7000 ? 1000 : 200;
    cost = pr[String(pid)] ?? pr[pid >= 1001 && pid <= 1003 ? "principiante" : pid >= 7000 ? "estructura" : "sobre"] ?? cost;
    items.push(new W().u32(iid).u8(1).u32(pid).u32(cost).u8(0).u8(0).u8(0).u8(0).bytes()); iid++;
  }
  for (const cid of SHOP_CARDS) {
    // Reserve withdrawn rows so avatar items and future additions never inherit a stale single-card id.
    if (!SHOP_SELL_SINGLES) { iid++; continue; }
    items.push(new W().u32(iid).u8(0).u32(cid).u32(pr.carta ?? 100).u8(0).u8(0).u8(0).u8(0).bytes()); iid++; }
  items.push(...avatarShopItems(iid));
  return items;
}

/** py shop_purchase: the cards a purchase gives, [(kind, card)]. Packs draw from py's global random. */
export function shopPurchase(g: Game, kind: number, prm: number, num: number): [number, number][] {
  let cards: number[];
  if (kind === 0) cards = SHOP_SELL_SINGLES ? Array(num).fill(prm) : [];
  else {
    cards = [];
    const iid = IID[String(prm)], ydc = YDC[String(prm)];
    if (iid) {
      const { pool, slots } = packRarityDistribution(iid);
      for (let pack = 0; pack < num; pack++) for (const slot of slots) for (let i = 0; i < slot.count; i++) {
        const roll = g.rng.random();
        let cumulative = 0;
        const tiers = PACK_RARITIES.filter((r) => slot.odds[r]);
        const rarity = tiers.find((r) => (cumulative += slot.odds[r]!) > roll) ?? tiers.at(-1);
        if (rarity) cards.push(g.rng.choice(pool[rarity]));
      }
    }
    else if (ydc) cards = Array.from({ length: num }, () => ydc).flat();
  }
  return cards.filter((x) => PP.cardOk(x)).map((x) => [kind, x]);
}

const u32at = (b: Uint8Array, i: number) => ((b[i] << 24) | (b[i + 1] << 16) | (b[i + 2] << 8) | b[i + 3]) >>> 0;

/** py shop_buy: 0x5210, a cart of (u32 item, u8 count); all or nothing. */
export function shopBuy(g: Game, c: Conn, data: Uint8Array): void {
  const fail = (why: string) => { g.log(`[tienda] purchase refused: ${why}`); c.send(0x5212, new W().u32(1).bytes()); c.send(0x5211, new W().u32(1).bytes()); };
  const cart = new Map<number, number>();
  for (let i = 0; i + 5 <= data.length - (data.length % 5); i += 5) {
    const iid = u32at(data, i);
    cart.set(iid, (cart.get(iid) ?? 0) + data[i + 4]);
  }
  const st = g.loadState();
  const p = PP.profile(st, PP.activeSlot(st))!;
  const cat = new Map(shopCatalog(g, p, true).map((row) => [u32at(row, 0), row]));
  const owned = new Set<number>(p.pbin ?? []);
  const decks = purchasedDecks(g, p);
  type Purchase = { iid: number; kind: number; prm: number; cost: number; units: [number, number][][] };
  const plan: Purchase[] = [];
  let total = 0, packs = 0;
  for (const [iid, num] of cart) {
    const it = cat.get(iid);
    if (!it || num === 0) { g.log(`[tienda] item ${iid} x${num} not valid: skipped`); continue; }
    const kind = it[4];
    const prm = u32at(it, 5), cost = u32at(it, 9);
    if (kind === 1 && packContents(prm)?.kind === "deck" && (decks.has(prm) || num !== 1)) return fail("already-owned-deck or multiple decks");
    if (kind === 2) {
      if (!(String(prm) in AV_PBIN) || owned.has(prm)) continue;
      owned.add(prm); plan.push({ iid, kind: 2, prm, cost, units: [] }); total += cost;
      continue;
    }
    const units = Array.from({ length: num }, () => shopPurchase(g, kind, prm, 1)).filter((cards) => cards.length);
    if (!units.length) continue;
    plan.push({ iid, kind, prm, cost, units }); total += cost * units.length;
    if (kind === 1) packs += units.length;
  }
  const mp = plan.length ? p.rec.mp : 0;
  const bought = plan.flatMap(({ units }) => units.flat());
  const have = p.trunk ?? {};
  const seen = new Set<number>(), newFlags: number[] = [];
  for (const [, cid] of bought) { newFlags.push(PP.int((have[String(cid)] ?? 0) || 0) === 0 && !seen.has(cid) ? 1 : 0); seen.add(cid); }
  let recipes: number[] = [];
  if (SHOP_DECK_RECIPE) {
    const deckBits = new Map(PACKS.filter(([, k, bit]) => k === 1 && bit !== null).map(([pid, , bit]) => [pid, bit!]));
    recipes = [...new Set(plan.filter(({ kind, prm }) => kind === 1 && deckBits.has(prm)).map(({ prm }) => deckBits.get(prm)! + 1))].sort((a, b) => a - b);
  }
  if (!plan.length) return fail("empty cart");
  if (!Number.isSafeInteger(total) || mp < total) return fail(`balance ${mp} < total ${total}`);
  // Promotional money is spent first per ITEM, never per card. A partly bound-funded pack/deck binds all of its
  // contents. Split/duplicate cart rows cannot turn a fraction of free currency into tradeable card output.
  let boundLeft = PP.progression() ? PP.mpBalances(p).bound : 0;
  const bind: number[] = [], added = new Map<number, number>();
  // Structure decks and the Beginner's packs bind every copy they grant, paid with earned MP too (bindsOnPurchase).
  for (const { kind, prm, cost, units } of plan) {
    if (kind === 2) { boundLeft -= Math.min(boundLeft, cost); continue; }
    const always = bindsOnPurchase(kind, prm);
    for (const cards of units) {
      const boundPaid = Math.min(boundLeft, cost);
      boundLeft -= boundPaid;
      for (const [, cid] of cards) {
        const prior = PP.int(have[String(cid)] ?? 0) + (added.get(cid) ?? 0);
        if (prior < 0xff) {
          added.set(cid, (added.get(cid) ?? 0) + 1);
          if (boundPaid > 0 || always) bind.push(cid);
        }
      }
    }
  }
  if (PP.progression()) {
    if (PP.spendMp(p, total) === null) return fail("invalid balance");
  } else p.rec.mp = mp - total;
  if (bind.length) boundOf(p); // migrate an older free starter BEFORE adding/binding purchased copies
  PP.mpSpent(g, p, total, packs);
  PP.onShopPurchase(g, p, bought);
  if (bind.length) {
    PP.bindCards(p, bind);
    g.log(`[economia] ${(g.ctxAcct() ?? "?").slice(0, 6)}: ${bind.length} purchased copies soul-bound (starting MP)`);
  }
  // secret pack keys: the SR / UR a paid ordinary booster gave (repeats as copies), in this transaction
  const pulled = plan.filter(({ kind, prm }) => kind === 1 && isOrdinaryBooster(prm)).flatMap(({ units }) => units.flat().map(([, cid]) => cid));
  if (pulled.length) secretObtained(g, p, pulled, "booster");
  for (const { kind, prm } of plan) if (kind === 2) PP.pbinSet(p, prm);
  for (const bit of recipes) PP.pbinSet(p, bit);
  for (const { kind, prm } of plan) if (kind === 1 && packContents(prm)?.kind === "deck") decks.add(prm);
  if (decks.size) p.shop_decks = [...decks];
  g.saveState(st);
  const entries: [number, number, number, number][] = [];
  let nf = 0;
  for (const { iid, kind, prm, units } of plan) {
    if (kind === 2) entries.push([iid, 2, prm, 1]);
    else for (const [k, card] of units.flat()) entries.push([iid, k, card, nf < newFlags.length ? newFlags[nf++] : 1]);
  }
  for (let i = 0; i < entries.length; i += SHOP_ENTRIES_PER_MSG) {
    const w = new W().u32(0);
    for (const [iid, k, card, nw] of entries.slice(i, i + SHOP_ENTRIES_PER_MSG)) w.u32(iid).u8(k).u32(card).u8(nw).u8(0).u8(0).u8(0);
    c.send(0x5212, w.bytes());
  }
  c.send(0x5211, new W().u32(0).bytes());
  c.send(0x4140, (g.ph as any).player_data_update() as Uint8Array);
  if (recipes.length && SHOP_DECK_ITEMGET) { const w = new W().u16(recipes.length); for (const b of recipes) w.u16(b); c.send(0x5205, w.u16(0).bytes()); }
}

/** 0x4802 chain (py sobres.pvp_card_install over instalar_npc over LP's handler): PvP card, NPC card, else base. */
export function selectpack(g: Game, c: Conn, data: Uint8Array, base: () => boolean): boolean {
  const pack = data.length >= 2 ? (data[0] << 8) | data[1] : 0;
  let n = 0;
  const st = g.loadState();
  const p = PP.profile(st, PP.activeSlot(st), false);
  if (p && pack) { n = PP.pvpCardTake(p, pack); if (n) g.saveState(st); }
  if (n) { const cards = g.lpCards(pack, n); g.lp.cardsResult(c, cards); return true; }
  // NPC_RULES_2008 card: one card of the pack the last NPC duel offered
  const st2 = g.loadState();
  const p2 = PP.profile(st2, PP.activeSlot(st2), false);
  const due: number[] = p2?.npc_card_due ?? [];
  if (!p2 || !due.length) return base();
  const take = due.includes(pack) ? pack : due[0];   // the pack that was offered, not one the client names
  due.splice(due.indexOf(take), 1);
  g.saveState(st2);
  g.lp.cardsResult(c, g.lpCards(take, 1).slice(0, 1));
  return true;
}
