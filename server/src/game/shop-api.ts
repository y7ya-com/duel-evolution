// The HTML shop uses the same validated purchase path as the native shop, without paging/input emulation.
import type { Game } from "./game.ts";
import type { Session } from "./hub.ts";
import type { Conn } from "../net/conn.ts";
import { W } from "../net/proto.ts";
import * as PP from "./persist.ts";
import { isFree } from "./freemode.ts";
import { shopCatalog, shopBuy } from "./shop.ts";
import { STARTER_DECKS } from "./starter.ts";
import { DECK_CARDS } from "../duel/data.ts";
import { cardInternalId, cardRarity } from "./card-rarity.ts";
import { BOXES, boxDisclosure } from "./cosmetics-catalog.ts";
import { rankView } from "./ranking.ts";

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
export function shopView(g: Game, user: string): Record<string, any> | Fail {
  const s = active(g, user); if ("error" in s) return s;
  return g.withCtx(s, () => {
    const st = g.loadState(), p = PP.profile(st, s.slot!, false);
    if (!p) return fail("no-character");
    const wallet = PP.mpBalances(p);
    const items = shopCatalog(g).map((row) => {
      const id = u32(row), kind = row[4], param = u32(row, 5), price = u32(row, 9);
      const deck = STARTER_DECKS[param];
      return { id, itemId: id, kind, param, price, internalId: kind === 0 ? cardInternalId(param) : null,
        rarity: kind === 0 ? cardRarity(param) : null,
        category: kind === 0 ? "singles" : kind === 2 ? "accessories" : deck ? "decks" : "packs",
        name: kind === 0 ? DECK_CARDS[String(param)]?.[2] ?? `Card ${param}` : deck?.[0] ?? "",
        owned: kind === 2 && PP.pbinTest(p, param) };
    });
    // Wearables are only obtained from cosmetic boxes: publish each box's pool per rarity (each item with
    // its `bodies` and, if one body is missing, its notice) and its effective odds (renormalised over
    // rarities with eligible items). The pool is the same for every body. Pity is per account: /__de/cosmetics.
    const cosmeticBoxes = BOXES.map((box) => {
      const { pool: _pool, ...odds } = boxDisclosure(box);
      return { id: box.id, name: box.name, kinds: box.kinds, price: box.price, superAt: box.superAt, ultraAt: box.ultraAt, ...odds };
    });
    return { available: true, wallet, items, cosmeticBoxes, nextRequestId: ledger(g, s).token };
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
  if (!shopCatalog(g).some((r) => u32(r) === b.itemId)) return fail("unavailable-item", 400);
  return g.withCtx(s, () => {
    let result = 1;
    const purchased: { itemId: number; kind: number; passcode: number; internalId: number | null; rarity: string | null }[] = [];
    const updates: [number, Uint8Array][] = [];
    // Capture the purchase result and defer the native wallet update until the transaction commits.
    const capture = { send(id: number, data: Uint8Array) {
      if (id === 0x5211) result = u32(data);
      if (id === 0x5212 && data.length > 4 && u32(data) === 0) {
        for (let at = 4; at + 13 <= data.length; at += 13) {
          const passcode = u32(data, at + 5);
          purchased.push({ itemId: u32(data, at), kind: data[at + 4], passcode,
            internalId: cardInternalId(passcode), rarity: cardRarity(passcode) });
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
      l.receipts[b.requestId as string] = { itemId: b.itemId, count: b.count, purchased };
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
