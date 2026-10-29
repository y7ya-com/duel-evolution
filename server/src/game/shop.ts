// The shop (py yo2srv/tienda/tienda.py and sobres.py, plus research/avatar's clothes catalogue).
import type { Conn } from "../net/conn.ts";
import { W } from "../net/proto.ts";
import SD from "../../gamedata/shop.json";
import LD from "../../gamedata/lobby.json";
import type { Game } from "./game.ts";
import * as PP from "./persist.ts";

const PACKS = SD.packs as [number, number, number | null][];
const IID = SD.iid as Record<string, number[]>;
const YDC = SD.ydc as Record<string, number[]>;
/** the single cards the shop sells: the first 40 of the 2008 card list, by passcode, then gamedata's `single` (the cards
 *  the 2008 client never had that no pack carries: scripts/passcode_gamedata.py) */
const SHOP_CARDS = [67105242, 17535588, 15480588, 53153481, 49587396, 25109950, 50122883, 62403074, 12436646, 86164529, 95132338, 85639257, 97360116, 81933259, 99597615, 126218, 28725004, 81863068, 26725158, 58775978, 48365709, 43434803, 77568553, 48305365, 68870276, 91869203, 77622396, 95174353, 14708569, 17881964, 6368038, 6368039, 30606547, 87564352, 52675689, 89494469, 50287060, 31339260, 36151751, 10262698, ...((SD as { single?: number[] }).single ?? [])];
const SHOP_SELL_PRIZE_PACKS = false, SHOP_DECK_RECIPE = true, SHOP_DECK_ITEMGET = false;
const PACK_SIZE = 5, SHOP_ENTRIES_PER_MSG = 78;
const AV_PBIN = LD.avatar_pbin as unknown as Record<string, [number, number, number, number, number, number]>;

/** py shop_prices: the admin's price table (py admin_tienda.json), integers 1..100000 only. */
const shopPrices = (g: Game): Record<string, number> =>
  Object.fromEntries(Object.entries(g.admin.data.prices).filter(([, v]) => Number.isInteger(v) && v >= 1 && v <= 100000));

// research/avatar avatar_shop_items
const SHOP_AVATAR_TYPE = 2;
const AVATAR_PRICES: Record<number, number> = { 1: 300, 2: 200, 3: 100, 4: 200, 5: 100, 6: 1000, 7: 300, 8: 1500, 9: 500 };
const PRESENT_TEXT_IDS = new Set([3318, 3319, 3327, 3530, 3532, 3328, 3329, 3531, 3533, 3535, 3384, 3326, 3534]);
function avatarShopItems(firstIid: number): Uint8Array[] {
  const items: Uint8Array[] = [];
  let iid = firstIid;
  for (const idx of Object.keys(AV_PBIN).map(Number).sort((a, b) => a - b)) {
    const [val, dflt, kind, slot, text] = AV_PBIN[String(idx)];
    if (!(kind === 1 || kind === 2) || !(slot >= 1 && slot <= 9)) continue;
    if (dflt) continue;
    if ((slot === 2 || slot === 9) && val === 0x20) continue;
    const cost = (AVATAR_PRICES[slot] ?? 500) * (PRESENT_TEXT_IDS.has(text) ? 3 : 1);
    items.push(new W().u32(iid).u8(SHOP_AVATAR_TYPE).u32(idx).u32(cost).u8(0).u8(0).u8(0).u8(0).bytes());
    iid++;
  }
  return items;
}

export function shopCatalog(g: Game): Uint8Array[] {
  const items: Uint8Array[] = [];
  let iid = 1;
  const pr = shopPrices(g);
  for (const [pid] of PACKS.filter(([, kind]) => kind !== 2 || SHOP_SELL_PRIZE_PACKS)) {
    let cost = pid >= 1001 && pid <= 1003 ? 100 : pid >= 7000 ? 1000 : 200;
    cost = pr[String(pid)] ?? pr[pid >= 1001 && pid <= 1003 ? "principiante" : pid >= 7000 ? "estructura" : "sobre"] ?? cost;
    items.push(new W().u32(iid).u8(1).u32(pid).u32(cost).u8(0).u8(0).u8(0).u8(0).bytes()); iid++;
  }
  for (const cid of SHOP_CARDS) { items.push(new W().u32(iid).u8(0).u32(cid).u32(pr.carta ?? 100).u8(0).u8(0).u8(0).u8(0).bytes()); iid++; }
  items.push(...avatarShopItems(iid));
  return items;
}

/** py shop_purchase: the cards a purchase gives, [(kind, card)]. Packs draw from py's global random. */
export function shopPurchase(g: Game, kind: number, prm: number, num: number): [number, number][] {
  let cards: number[];
  if (kind === 0) cards = Array(num).fill(prm);
  else {
    cards = [];
    const iid = IID[String(prm)], ydc = YDC[String(prm)];
    if (iid) cards = Array.from({ length: PACK_SIZE * num }, () => g.rng.choice(iid));
    else if (ydc) cards = Array.from({ length: num }, () => ydc).flat();
  }
  return cards.filter((x) => PP.cardOk(x)).map((x) => [kind, x]);
}

const u32at = (b: Uint8Array, i: number) => ((b[i] << 24) | (b[i + 1] << 16) | (b[i + 2] << 8) | b[i + 3]) >>> 0;

/** py shop_buy: 0x5210, a cart of (u32 item, u8 count); all or nothing. */
export function shopBuy(g: Game, c: Conn, data: Uint8Array): void {
  const fail = (why: string) => { g.log(`[tienda] purchase refused: ${why}`); c.send(0x5212, new W().u32(1).bytes()); c.send(0x5211, new W().u32(1).bytes()); };
  const cart: [number, number][] = [];
  for (let i = 0; i + 5 <= data.length - (data.length % 5); i += 5) cart.push([u32at(data, i), data[i + 4]]);
  const cat = shopCatalog(g);
  const st = g.loadState();
  const p = PP.profile(st, PP.activeSlot(st))!;
  const owned = new Set<number>(p.pbin ?? []);
  const plan: [number, number, number, [number, number][] | null][] = [];
  let total = 0, packs = 0;
  for (const [iid, num] of cart) {
    if (!(iid > 0 && iid <= cat.length) || num === 0) { g.log(`[tienda] item ${iid} x${num} not valid: skipped`); continue; }
    const it = cat[iid - 1], kind = it[4];
    const prm = u32at(it, 5), cost = u32at(it, 9);
    if (kind === 2) {
      if (!(String(prm) in AV_PBIN) || owned.has(prm)) continue;
      owned.add(prm); plan.push([iid, 2, prm, null]); total += cost;
      continue;
    }
    const cards = shopPurchase(g, kind, prm, num);
    if (!cards.length) continue;
    plan.push([iid, kind, prm, cards]); total += cost * num;
    if (kind === 1) packs += num;
  }
  const mp = plan.length ? p.rec.mp : 0;
  const bought = plan.filter(([, kind]) => kind !== 2).flatMap(([, , , cards]) => cards!);
  const have = p.trunk ?? {};
  const seen = new Set<number>(), newFlags: number[] = [];
  for (const [, cid] of bought) { newFlags.push(PP.int((have[String(cid)] ?? 0) || 0) === 0 && !seen.has(cid) ? 1 : 0); seen.add(cid); }
  let recipes: number[] = [];
  if (SHOP_DECK_RECIPE) {
    const deckBits = new Map(PACKS.filter(([, k, bit]) => k === 1 && bit !== null).map(([pid, , bit]) => [pid, bit!]));
    recipes = [...new Set(plan.filter(([, kind, prm]) => kind === 1 && deckBits.has(prm)).map(([, , prm]) => deckBits.get(prm)! + 1))].sort((a, b) => a - b);
  }
  if (!plan.length) return fail("empty cart");
  if (mp < total) return fail(`balance ${mp} < total ${total}`);
  p.rec.mp = mp - total;
  PP.mpSpent(g, p, total, packs);
  PP.onShopPurchase(g, p, bought);
  for (const [, kind, prm] of plan) if (kind === 2) PP.pbinSet(p, prm);
  for (const bit of recipes) PP.pbinSet(p, bit);
  g.saveState(st);
  const entries: [number, number, number, number][] = [];
  let nf = 0;
  for (const [iid, kind, prm, cards] of plan) {
    if (kind === 2) entries.push([iid, 2, prm, 1]);
    else for (const [k, card] of cards!) entries.push([iid, k, card, nf < newFlags.length ? newFlags[nf++] : 1]);
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
  if (due.includes(pack)) due.splice(due.indexOf(pack), 1); else due.shift();
  g.saveState(st2);
  g.lp.cardsResult(c, g.lpCards(pack, 1).slice(0, 1));
  return true;
}
