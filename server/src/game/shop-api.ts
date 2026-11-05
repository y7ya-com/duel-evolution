// The HTML shop uses the same validated purchase path as the native shop, without paging/input emulation.
import type { Game } from "./game.ts";
import type { Session } from "./hub.ts";
import type { Conn } from "../net/conn.ts";
import { W } from "../net/proto.ts";
import * as PP from "./persist.ts";
import { isFree } from "./freemode.ts";
import { shopCatalog, shopBuy, packContents, packRarityDistribution, PACK_RARITIES, PACK_SIZE, PACK_NAMES, packSeason, packArt,
  packRotation, rotationUpdate, purchasedDecks } from "./shop.ts";
import { secretUnlocked } from "./secret-packs.ts";
import { STARTER_DECKS } from "./starter.ts";
import { DECK_CARDS } from "../duel/data.ts";
import { cardInternalId, cardRarity } from "./card-rarity.ts";
import { BOXES, boxDisclosure } from "./cosmetics-catalog.ts";
import { rankView } from "./ranking.ts";
import CARDS from "../../gamedata/cards.json";

type Fail = { error: string; status: number };
const fail = (error: string, status = 409): Fail => ({ error, status });
const u32 = (bytes: Uint8Array, at = 0) => new DataView(bytes.buffer, bytes.byteOffset).getUint32(at);
function active(g: Game, user: string): Session | Fail {
  const acct = g.store.accountOfUser(user), s = acct ? g.hub.sessions.get(acct) : null;
  if (!s) return fail("not-in-game");
  if (s.slot === null) return fail("no-character");
  if (g.restarting) return fail("server-restarting", 503);
  if (isFree(s)) return fail("free-mode");
  return s;
}
function ledger(g: Game, s: Session) {
  const account = g.store.loadRaw().accounts[s.acct];
  const data = account.shop_api ?? { token: crypto.randomUUID(), receipts: {} as Record<string, any> };
  if (!account.shop_api) { account.shop_api = data; g.store.commit({}, { [s.acct]: account }); }
  return data as { token: string; receipts: Record<string, any> };
}
// ---- the HTML shop's display data (names, art, rotation, featured cards, collection), all additive
type Player = NonNullable<ReturnType<typeof PP.profile>>;
const SMALL = new Set(["a", "an", "and", "the", "of", "to", "in", "on"]);
/** packinfo's upper-case deck names in title case: "ARRIVAL OF THE 4 EMPERORS" -> "Arrival of the 4 Emperors". */
export const titleCase = (s: string) => s.toLowerCase().split(" ")
  .map((w, i) => (i && SMALL.has(w) ? w : w.replace(/(^|[-(])([a-z])/g, (_, a, c) => a + c.toUpperCase()))).join(" ");
/** One catalogue pack's (kind 1) display data: names, art, group, season, description and rotation. */
export function packMeta(id: number, now: number) {
  const deck = STARTER_DECKS[id], season = packSeason(id);
  const group = deck || id >= 7000 ? "deck" : id >= 1001 && id <= 1003 ? "beginner" : "booster";
  const title = PACK_NAMES[id] ?? (deck ? titleCase(deck[0]) : `Pack ${id}`);
  const displayName = group === "booster" ? `Pack ${id} · ${title}` : title;
  const description = group === "deck" ? deck?.[1] ?? ""
    : group === "beginner" ? "A pack for new duelists, with cards from Seasons 1 to 3."
    : id >= 33 ? `A rearranged pack based on the Season ${season} Booster “${title}”.`
    : `A rearranged pack of Season ${season} cards.`;
  return { title, displayName, group, season, art: packArt(id), description, rotation: packRotation(id, now) };
}
// the cards' English names (gamedata/cards.json, by passcode); DECK_CARDS' are the Spanish server's
const EN = new Map((CARDS as { pc: number; name: string }[]).map((c) => [c.pc, c.name]));
const cardName = (passcode: number) => EN.get(passcode) ?? DECK_CARDS[String(passcode)]?.[2] ?? `Card ${passcode}`;
/** A pack's distinct cards, rarest first then by name, with what the player owns (decks: copies in the deck). */
function packCards(p: Player, cards: readonly number[], deck: boolean) {
  const copies = new Map<number, number>();
  for (const c of cards) copies.set(c, (copies.get(c) ?? 0) + 1);
  const out = [...copies.keys()].map((passcode) => ({ passcode, internalId: cardInternalId(passcode), name: cardName(passcode),
    rarity: cardRarity(passcode) ?? "N", owned: PP.int(p.trunk?.[String(passcode)] ?? 0), ...(deck && { copies: copies.get(passcode)! }) }));
  out.sort((a, b) => PACK_RARITIES.indexOf(b.rarity) - PACK_RARITIES.indexOf(a.rarity) || a.name.localeCompare(b.name));
  return out;
}
/** Per rarity: different cards owned of how many. */
const byRarity = (cards: { rarity: string; owned: number }[]) => Object.fromEntries(PACK_RARITIES.map((r) => {
  const of = cards.filter((c) => c.rarity === r);
  return [r, { owned: of.filter((c) => c.owned > 0).length, total: of.length }];
}));
/** The featured cards: the rarest first (UR, then SR, ...), at most n. */
const featured = (cards: ReturnType<typeof packCards>, n: number) => cards.slice(0, n)
  .map(({ passcode, internalId, name, rarity, owned }) => ({ passcode, internalId, name, rarity, owned }));
/** The player's whole trunk: copies, different cards, different cards per rarity. */
function collection(p: Player) {
  let copies = 0;
  const own: { rarity: string; owned: number }[] = [];
  for (const [k, v] of Object.entries(p.trunk ?? {})) {
    const n = PP.int(v ?? 0);
    if (n > 0) { copies += n; own.push({ rarity: cardRarity(Number(k)) ?? "N", owned: n }); }
  }
  return { copies, cards: own.length, byRarity: Object.fromEntries(PACK_RARITIES.map((r) => [r, own.filter((c) => c.rarity === r).length])) };
}
export function shopView(g: Game, user: string): Record<string, any> | Fail {
  const s = active(g, user); if ("error" in s) return s;
  return g.withCtx(s, () => {
    const st = g.loadState(), p = PP.profile(st, s.slot!, false);
    if (!p) return fail("no-character");
    const wallet = PP.mpBalances(p);
    const decks = purchasedDecks(g, p);
    const items = shopCatalog(g, p, true).map((row) => {
      const id = u32(row), kind = row[4], param = u32(row, 5), price = u32(row, 9);
      const deck = STARTER_DECKS[param];
      return { id, itemId: id, kind, param, price, internalId: kind === 0 ? cardInternalId(param) : null,
        rarity: kind === 0 ? cardRarity(param) : null,
        category: kind === 0 ? "singles" : kind === 2 ? "accessories" : deck ? "decks" : "packs",
        name: kind === 0 ? cardName(param) : deck?.[0] ?? "",
        owned: kind === 2 && PP.pbinTest(p, param) };
    }).map((item) => {
      const contents = item.kind === 1 ? packContents(item.param) : null;
      if (!contents) return item;
      const cards = packCards(p, contents.cards, contents.kind === "deck");
      return { ...item, ...packMeta(item.param, g.clock.time()), ...(contents.kind === "deck" && { purchased: decks.has(item.param) }), size: contents.kind === "pack" ? PACK_SIZE : contents.cards.length,
        featured: featured(cards, 3), collected: { owned: cards.filter((c) => c.owned > 0).length, total: cards.length } };
    });
    // Wearables are only obtained from cosmetic boxes: publish each box's pool per rarity (each item with
    // its `bodies` and, if one body is missing, its notice) and its effective odds (renormalised over
    // rarities with eligible items). The pool is the same for every body. Pity is per account: /__de/cosmetics.
    const cosmeticBoxes = BOXES.map((box) => {
      const { pool: _pool, ...odds } = boxDisclosure(box);
      return { id: box.id, name: box.name, kinds: box.kinds, price: box.price, superAt: box.superAt, ultraAt: box.ultraAt, ...odds };
    });
    return { available: true, wallet, items, cosmeticBoxes, nextRequestId: ledger(g, s).token,
      collection: collection(p), ...rotationUpdate(g.clock.time()), unlocked: secretUnlocked(p, g.clock.time()) };
  });
}
/** Per-card disclosure measures the probability of at least one copy. */
export function shopPackView(g: Game, user: string, id: string | null): Record<string, any> | Fail {
  const s = active(g, user); if ("error" in s) return s;
  return g.withCtx(s, () => {
    const p = PP.profile(g.loadState(), s.slot!, false);
    if (!p) return fail("no-character");
    const packId = id && /^\d+$/.test(id) ? Number(id) : NaN;
    const contents = packContents(packId);
    const row = Number.isSafeInteger(packId) && contents ? shopCatalog(g, p, true).find((r) => r[4] === 1 && u32(r, 5) === packId) : null;
    if (!row || !contents) return fail("unknown-pack", 400);
    const { pool, slots } = packRarityDistribution(contents.cards);
    const cards = packCards(p, contents.cards, contents.kind === "deck");
    const itemId = u32(row);
    // the player's last pulls of this pack bought here (the ledger keeps its last 16 purchases), newest first
    const pulls = Object.values(ledger(g, s).receipts).filter((r: any) => r.itemId === itemId).reverse()
      .map((r: any) => ({ count: r.count, at: r.at ?? null, cards: (r.purchased ?? []).map((c: any) => ({ ...c, name: cardName(c.passcode) })) }));
    const perCard = Object.fromEntries(PACK_RARITIES.map((r) => [r, !pool[r].length ? 0 : contents.kind === "deck" ? 1 :
      1 - slots.reduce((absent, slot) => absent * (1 - (slot.odds[r] ?? 0) / pool[r].length) ** slot.count, 1)]));
    return { packId, itemId, price: u32(row, 9), name: STARTER_DECKS[packId]?.[0] ?? "", ...packMeta(packId, g.clock.time()), kind: contents.kind,
      ...(contents.kind === "deck" && { purchased: purchasedDecks(g, p).has(packId) }),
      size: contents.kind === "pack" ? PACK_SIZE : contents.cards.length, slots: contents.kind === "pack" ? slots : [],
      perCard, perCardMeaning: "Probability of at least one copy of one specific card of that rarity per pack; 0 if that rarity is absent.",
      cards, collected: { owned: cards.filter((c) => c.owned > 0).length, total: cards.length },
      collectedByRarity: byRarity(cards), featured: featured(cards, 5), pulls };
  });
}
export function shopPurchaseApi(g: Game, user: string, body: unknown): Record<string, any> | Fail {
  const s = active(g, user); if ("error" in s) return s;
  const b = body as Record<string, unknown> | null;
  if (!b || !Number.isSafeInteger(b.itemId) || !Number.isSafeInteger(b.count) || Number(b.count) < 1 || Number(b.count) > 50
    || typeof b.requestId !== "string" || b.requestId.length > 80) return fail("invalid-purchase", 400);
  const l = ledger(g, s), previous = l.receipts[b.requestId];
  if (previous) {
    if (previous.itemId !== b.itemId || previous.count !== b.count) return fail("request-id-conflict");
    return { ...shopView(g, user), purchased: previous.purchased, replayed: true };
  }
  if (b.requestId !== l.token) return fail("stale-request");
  const npc = g.duel?.duelState(s)?.df?.sess.end;
  if (g.tp?.inTrade(s) || (s.pid !== null && g.pvp?.byPid(s.pid)) || (npc && !npc.over)) return fail("busy");
  return g.withCtx(s, () => {
    const p = PP.profile(g.loadState(), s.slot!, false);
    const row = p && shopCatalog(g, p, true).find((r) => u32(r) === b.itemId);
    if (!p || !row) return fail("unavailable-item", 400);
    if (row[4] === 1 && packContents(u32(row, 5))?.kind === "deck") {
      if (purchasedDecks(g, p).has(u32(row, 5))) return fail("already-owned-deck");
      if (b.count !== 1) return fail("invalid-purchase", 400);
    }
    let result = 1;
    const purchased: { itemId: number; kind: number; passcode: number; internalId: number | null; rarity: string | null; isNew: boolean }[] = [];
    const updates: [number, Uint8Array][] = [];
    // Capture the purchase result and defer the native wallet update until the transaction commits.
    const capture = { send(id: number, data: Uint8Array) {
      if (id === 0x5211) result = u32(data);
      if (id === 0x5212 && data.length > 4 && u32(data) === 0) {
        for (let at = 4; at + 13 <= data.length; at += 13) {
          const passcode = u32(data, at + 5);
          purchased.push({ itemId: u32(data, at), kind: data[at + 4], passcode,
            internalId: cardInternalId(passcode), rarity: cardRarity(passcode), isNew: data[at + 9] === 1 });
        }
      }
      if (id === 0x4140) updates.push([id, data]);
    } } as unknown as Conn;
    // Suppress intermediate D1 snapshots: payment, cards and idempotency receipt must be persisted together.
    const before = g.store.peek(), notify = g.store.onSave;
    let committed = false;
    g.store.onSave = null;
    try {
      shopBuy(g, capture, new W().u32(Number(b.itemId)).u8(Number(b.count)).bytes());
      if (result !== 0) return fail("purchase-rejected");
      // shopBuy just saved the account; re-read before storing the receipt to preserve that mutation.
      const account = g.store.loadRaw().accounts[s.acct];
      l.receipts[b.requestId as string] = { slot: s.slot, itemId: b.itemId, count: b.count, purchased, at: g.clock.time() * 1000 };
      const keys = Object.keys(l.receipts); for (const key of keys.slice(0, -16)) delete l.receipts[key];
      l.token = crypto.randomUUID(); account.shop_api = l; g.store.commit({}, { [s.acct]: account });
      const out = { ...shopView(g, user), purchased, replayed: false };
      committed = true;
      return out;
    } finally {
      if (!committed) g.store.saveRaw(before);
      g.store.onSave = notify;
      if (committed) {
        notify?.(g.store.peek() as any);
        for (const [id, data] of updates) s.lobby?.post(id, data);
        const account = s.conns.get(g.ports.game);
        if (account && !account.closed) {
          const p = PP.profile(g.loadState(), s.slot!, false)!;
          for (const [id, data] of PP.trunkMessages(p)) account.post(id, data);
          account.post(0x3114, PP.pbinBytes(p, rankView(p)));
        }
      }
    }
  });
}
