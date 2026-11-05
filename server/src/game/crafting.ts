import { secretObtained } from "./secret-packs.ts";
import { craftedMove } from "./crafted-copies.ts";
// Per-character shards. Durable wallet, receipts and audit are projected losslessly via state_extras.
import type { Game } from "./game.ts";
import * as PP from "./persist.ts";
import { boundOf, pushInventory } from "./starter.ts";
import { isFree } from "./freemode.ts";
import { cardRarity, cardRarityCatalog } from "./card-rarity.ts";

import { SHARDS, shardValues } from "./shards-config.ts";
export const shardEligible = (pc: number) => cardRarity(pc) !== null && !(pc >= 501000000 && pc <= 501000007);
export type Deck = { main: number[]; side?: number[]; extra?: number[] };
/** Copies needed in the most demanding saved deck, counting all three zones together. */
export function deckNeeds(decks: Deck[]): Record<string, number> {
  const need: Record<string, number> = {};
  for (const d of decks) {
    const counts: Record<string, number> = {};
    for (const pc of [...d.main, ...(d.side ?? []), ...(d.extra ?? [])]) counts[pc] = (counts[pc] ?? 0) + 1;
    for (const [pc, n] of Object.entries(counts)) need[pc] = Math.max(need[pc] ?? 0, n);
  }
  return need;
}
const fail = (error: string, status = 409) => ({ error, status });
function active(g: Game, user: string) {
  const acct = g.store.accountOfUser(user), s = acct ? g.hub.sessions.get(acct) : undefined;
  if (!s) return fail("not-in-game");
  if (s.slot === null) return fail("no-character");
  if (g.restarting) return fail("server-restarting", 503);
  if (isFree(s)) return fail("free-mode");
  return s;
}
function ledger(p: PP.P) {
  return p.craft_api ??= { token: crypto.randomUUID(), receipts: {} };
}
export function craftCards(p: PP.P, need: Record<string, number>) {
  const bound = boundOf(p), cards: Record<string, any> = {};
  for (const pc of Object.keys(cardRarityCatalog().byPasscode as object)) {
    const owned = PP.int(p.trunk?.[pc] ?? 0), b = bound[pc] ?? 0;
    cards[pc] = { owned, bound: b, crafted: p.crafted?.[pc] ?? 0, craftable: shardEligible(Number(pc)),
      dismantlable: shardEligible(Number(pc)) ? Math.max(0, Math.min(owned - b - (SHARDS.craftedDismantlable ? 0 : p.crafted?.[pc] ?? 0), owned - (need[pc] ?? 0))) : 0,
      rarity: cardRarity(Number(pc)), inDecks: need[pc] ?? 0 };
  }
  return cards;
}
export function craftView(g: Game, user: string, need: Record<string, number> = {}): any {
  const s = active(g, user); if ("error" in s) return s;
  return g.withCtx(s, () => {
    const st = g.loadState(), p = PP.profile(st, s.slot!, false);
    if (!p) return fail("no-character");
    const existed = !!p.craft_api, l = ledger(p), cards = craftCards(p, need);
    if (!existed) g.saveState(st);
    return { shards: p.shards ?? 0, values: shardValues(), cards, nextRequestId: l.token };
  });
}
export type CraftOp = "make" | "dismantle" | "dismantle-extras";
export function craftOperation(g: Game, user: string, op: CraftOp, body: unknown, need: Record<string, number> = {}): any {
  const s = active(g, user); if ("error" in s) return s;
  const b = body as Record<string, any> | null;
  if (!b || typeof b !== "object" || typeof b.requestId !== "string" || !b.requestId.length || b.requestId.length > 80
    || (op === "dismantle-extras" ? (b.keep !== undefined && b.keep !== 1 && b.keep !== 3) || (b.preview !== undefined && typeof b.preview !== "boolean")
      : !Number.isSafeInteger(b.passcode) || !Number.isSafeInteger(b.count) || b.count < 1 || b.count > 255)) return fail("invalid-craft", 400);
  const npc = g.duel?.duelState(s)?.df?.sess.end;
  if (g.tp?.inTrade(s) || (s.pid !== null && g.pvp?.byPid(s.pid)) || (npc && !npc.over)) return fail("busy");
  return g.withCtx(s, () => {
    const st = g.loadState(), p = PP.profile(st, s.slot!, false);
    if (!p) return fail("no-character");
    const l = ledger(p), signature = JSON.stringify([s.slot, op, b.passcode ?? null, b.count ?? null, op === "dismantle-extras" ? b.keep ?? 3 : null]);
    const old = Object.hasOwn(l.receipts, b.requestId) ? l.receipts[b.requestId] : undefined;
    if (old) return old.signature !== signature ? fail("request-id-conflict") : { ...craftView(g, user, need), ...old.result, replayed: true };
    if (b.requestId !== l.token) return fail("stale-request");
    const balance = p.shards ?? 0;
    if (!Number.isSafeInteger(balance) || balance < 0) return fail("invalid-shard-wallet", 503);
    if (!Object.values(shardValues()).every((table) => Object.values(table).every((n) => Number.isSafeInteger(n) && n > 0)))
      return fail("invalid-shard-config", 503);
    const catalog = craftCards(p, need), changes: Record<string, number> = {};
    let delta = 0;
    if (op === "make") {
      const c = catalog[b.passcode];
      if (!c?.craftable) return fail("uncraftable", 400);
      if (c.owned + b.count > 3) return fail("copy-cap");
      delta = -shardValues().craft[c.rarity as "N" | "R" | "SR" | "UR"] * b.count;
      if (balance + delta < 0) return fail("insufficient-shards");
      changes[b.passcode] = b.count;
    } else {
      if (op === "dismantle") {
        const c = catalog[b.passcode];
        if (!c || b.count > c.dismantlable) return fail("not-dismantlable");
        changes[b.passcode] = b.count;
      } else for (const [pc, c] of Object.entries(catalog) as [string, any][]) {
        const n = Math.min(c.dismantlable, Math.max(0, c.owned - (b.keep ?? 3)));
        if (n) changes[pc] = n;
      }
      for (const [pc, n] of Object.entries(changes)) delta += shardValues().dismantle[cardRarity(Number(pc))!] * n;
    }
    if (!Number.isSafeInteger(delta) || !Number.isSafeInteger(balance + delta)) return fail("shard-overflow");
    const result = { operation: op, changes, shardDelta: delta };
    if (op === "dismantle-extras" && b.preview === true) return { ...craftView(g, user, need), ...result, preview: true };
    const copies = Object.entries(changes).flatMap(([pc, n]) => Array(n).fill(Number(pc)));
    if (op === "make") { PP.trunkAdd(g, p, copies, 1, "craft"); if (!SHARDS.craftedTradeable) PP.bindCards(p, copies); else if (!SHARDS.craftedDismantlable) craftedMove(p, [], copies); }
    else PP.trunkRemove(p, copies, g, op);
    const secret = op === "make" ? secretObtained(g, p, copies, "craft") : { unlocked: [], freePacks: [] };
    Object.assign(result, { secret });
    p.shards = balance + delta;
    // Append-only economy audit, saved atomically with inventory, wallet and receipt. No retention truncation.
    (p.shard_audit ??= []).push({ at: g.clock.time(), requestId: b.requestId, ...result, balance: p.shards });
    l.receipts[b.requestId] = { signature, result }; l.token = crypto.randomUUID();
    g.saveState(st);
    g.log(`[economia] ${s.acct}/${s.slot}: ${op} ${JSON.stringify(changes)} shards ${delta}, balance ${p.shards}`);
    pushInventory(g, s, p);
    return { ...craftView(g, user, need), ...result, replayed: false };
  });
}
