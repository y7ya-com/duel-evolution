// Account wardrobe and quantity-bearing box duplicates. Every mutation is synchronous
// inside World.run; callers flush the D1 sink before acknowledging a successful request.
import type { Game } from "./game.ts";
import type { Session } from "./hub.ts";
import type { State } from "./store.ts";
import * as PP from "./persist.ts";
import { isFree } from "./freemode.ts";
import { W } from "../net/proto.ts";
import { BOXES, COSMETICS, FREE_COSMETICS, FREE_COSMETIC_BY_ID, COSMETIC_BY_ID, COSMETIC_BY_BIT, RARITIES, AVATAR_ROWS, MERGED_FAMILIES, resolveCosmeticId, ownedCosmeticIds, canonicalBoxId, cosmeticPool, expandCosmeticBits,
  boxById, boxAvailable, boxWeights, boxDisclosure, bodyInfo, bodyNotice, itemBodies,
  type Body, type Box, type CosmeticFamily, type CosmeticRarity, type BoxId, type Pity } from "./cosmetics-catalog.ts";
import { RANK_SCHOOLS, rankRowAllowed, rankView, type RankSchool, type RankView, type UniformSchool } from "./ranking.ts";
export { BOXES, COSMETICS, expandCosmeticBits } from "./cosmetics-catalog.ts";

type Receipt = { boxId: BoxId; id: string; duplicate: boolean };
type Line = { id: string; count: number };
type Offer = { id: string; requestId: string; fromAcct: string; toAcct: string; fromPid: number; fromName: string;
  toPid: number; toName: string; give: Line[]; want: Line[]; status: "pending" | "accepted" | "cancelled" | "expired"; expiresAt: number };
/** `split: 1` marks a ledger migrated past the 2026-11 split of the mismatched pairs (SPLIT_FAMILIES), `merged: 1` past
 *  the 2026-11-04 merge of Afro I-III into Afro (MERGED_FAMILIES). */
type Ledger = { version: 1; split?: 1; merged?: 1; owned: string[]; copies: Record<string, number>; pity: Partial<Record<BoxId, Pity>>;
  sequence: number; receipts: Record<string, Receipt>; offers: Record<string, Offer> };
type Fail = { error: string; status: number; [extra: string]: unknown };
const fail = (error: string, status = 409, extra: Record<string, unknown> = {}): Fail => ({ error, status, ...extra });
const nat = (n: unknown) => Number.isSafeInteger(n) && Number(n) >= 0 ? Number(n) : 0;
const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v));
const now = (g: Game) => Math.floor(g.clock.time() * 1000);
const limit = (s: Session) => (s.state >= 0x67 && s.state <= 0x6a);
const hasError = (v: unknown): v is Fail => !!v && typeof v === "object" && "error" in v;
// Unpredictable server rolls, with rejection sampling rather than modulo bias.
function randomInt(max: number): number {
  const ceiling = 0x100000000 - (0x100000000 % max), word = new Uint32Array(1);
  do { crypto.getRandomValues(word); } while (word[0] >= ceiling);
  return word[0] % max;
}

function active(g: Game, who: string | Session): Session | Fail {
  const acct = typeof who === "string" ? g.store.accountOfUser(who) : who.acct;
  const s = acct ? g.hub.sessions.get(acct) : undefined;
  if (!s || (typeof who !== "string" && s !== who)) return fail("not-in-game");
  if (s.slot === null) return fail("no-character");
  if (g.restarting) return fail("server-restarting", 503);
  if (isFree(s)) return fail("free-mode");
  return s;
}
function accountCopy(g: Game, acct: string): State | null {
  const a = g.store.peek().accounts?.[acct];
  return a ? clone(a) : null;
}
function profile(a: State, s: Session): PP.P | null { return a.profiles?.[String(s.slot)] ?? null; }
const bodyOfParts = (parts: Uint8Array): Body => parts[0] === 1 ? "female" : "male";
/** The body of the account's active character (any character if that slot is empty), from its saved look. */
function accountBody(a: State): Body {
  const p = (a.profiles?.[String(PP.activeSlot(a))] ?? Object.values(a.profiles ?? {})[0]) as PP.P | undefined;
  return p ? bodyOfParts(PP.avatarParts(p, 0)) : "male";
}
/** No duplicate quantities are manufactured from legacy bits. Real variants share ownership.
 * Split migration (once per ledger, marked `split: 1`): an old paired family (outfit:street-red,
 * outfit:fitted-duelist..., or an id that aliased one) becomes ownership of EVERY item it split into;
 * its quantities cannot be doubled, so tradable copies, receipts and escrowed offer lines go to the
 * half matching the active character's body (accountBody). A pending offer's `want` lines resolve
 * with the same (offering) account's body; if the recipient holds the other half instead, accepting
 * fails with insufficient-duplicates and nothing moves.
 * Merge migration (once per ledger, marked `merged: 1`): Afro I, II and III (MERGED_FAMILIES) become Afro. Their
 * copies, receipts and offer lines are renamed and add up (one copy of I and two of II: three of Afro). Owning two or
 * three of them was owning two or three different items: each one past the first becomes a tradable copy of Afro,
 * so nothing owned is lost. Only the ledger's own `owned` list counts: legacy PBIN bits (a 2008 shop purchase, the
 * NPC prize) are ownership, never quantities, as above (and after the merge one Afro bit expands to all six rows, so
 * bits can't tell how many sizes were owned). A replayed receipt names Afro and grants nothing; a pending offer's
 * escrow moves under the new id, so cancelling or accepting it moves exactly what was escrowed. */
function ledger(a: State): Ledger {
  const l: Ledger = a.cosmetics?.version === 1 ? a.cosmetics :
    (a.cosmetics = { version: 1, owned: [], copies: {}, pity: {}, sequence: 0, receipts: {}, offers: {} });
  l.owned ??= []; l.copies ??= {}; l.pity ??= {}; l.receipts ??= {}; l.offers ??= {}; l.sequence = nat(l.sequence);
  const legacy = l.split !== 1, body = accountBody(a), resolve = (id: string) => resolveCosmeticId(id, body, legacy);
  // before the merge: how many different old items each merged item was (counted once, from the stored list)
  const mergedOwned = new Map<string, number>();
  if (l.merged !== 1) for (const id of new Set(l.owned)) { const to = MERGED_FAMILIES[id]; if (to) mergedOwned.set(to, (mergedOwned.get(to) ?? 0) + 1); }
  const owned = new Set(l.owned.flatMap((id) => ownedCosmeticIds(id, legacy)).filter((id) => COSMETIC_BY_ID.has(id)));
  // A design identity can be corrected without losing purchased duplicates, pending
  // trade escrow or retry receipts. Ownership merging or splitting never creates trade copies.
  const copies: Record<string, number> = {};
  for (const [id, count] of Object.entries(l.copies)) { const to = resolve(id); copies[to] = to === id && !Object.hasOwn(copies, to) ? count : nat(copies[to]) + nat(count); }
  for (const [to, n] of mergedOwned) if (n > 1) copies[to] = nat(copies[to]) + n - 1;
  l.copies = copies;
  for (const receipt of Object.values(l.receipts)) { receipt.id = resolve(receipt.id); receipt.boxId = canonicalBoxId(receipt.boxId) ?? receipt.boxId; }
  // A renamed box (hair -> head) keeps its pity progress; if both exist, the player keeps the better one.
  for (const [old, next] of Object.entries(l.pity) as [string, Pity | undefined][]) {
    const id = canonicalBoxId(old);
    if (!id || id === old || !next) continue;
    const cur = l.pity[id];
    l.pity[id] = cur ? { superMisses: Math.max(nat(cur.superMisses), nat(next.superMisses)), ultraMisses: Math.max(nat(cur.ultraMisses), nat(next.ultraMisses)) } : next;
    delete (l.pity as Record<string, Pity | undefined>)[old];
  }
  for (const offer of Object.values(l.offers)) for (const key of ["give", "want"] as const) {
    const counts = new Map<string, number>();
    for (const line of offer[key]) { const id = resolve(line.id); counts.set(id, (counts.get(id) ?? 0) + line.count); }
    offer[key] = [...counts].map(([id, count]) => ({ id, count }));
  }
  // Before the split, one bit of a pair (e.g. 116 Tracksuit Red) was ownership of the whole old family.
  for (const p of [...Object.values(a.profiles ?? {}), ...(a.profiles_borrados ?? []).map((v: any) => v?.perfil)] as PP.P[]) {
    for (const bit of p?.pbin ?? []) { const family = COSMETIC_BY_BIT.get(bit); if (family) for (const id of ownedCosmeticIds(family.id, legacy)) owned.add(id); }
  }
  l.owned = [...owned].sort();
  l.split = 1; l.merged = 1;
  return l;
}
export function syncCosmeticOwnership(g: Game, s: Session, p: PP.P): void {
  const a = accountCopy(g, s.acct);
  const owned = a ? ledger(a).owned : [];
  const bits = new Set<number>(p.pbin ?? []);
  for (const id of owned) for (const v of COSMETIC_BY_ID.get(id)?.variants ?? []) bits.add(v.bit);
  p.pbin = expandCosmeticBits([...bits]);
}
function grant(l: Ledger, family: CosmeticFamily): boolean {
  const duplicate = l.owned.includes(family.id);
  if (duplicate) l.copies[family.id] = nat(l.copies[family.id]) + 1;
  else { l.owned.push(family.id); l.owned.sort(); }
  return duplicate;
}
function project(p: PP.P, l: Ledger): void {
  const bits = new Set<number>(p.pbin ?? []);
  for (const id of l.owned) for (const v of COSMETIC_BY_ID.get(id)?.variants ?? []) bits.add(v.bit);
  p.pbin = [...bits].sort((a, b) => a - b);
}
function pushOwnership(g: Game, s: Session, p: PP.P): void {
  // NetAccount::onPbin updates the live dictionary without opening a gift dialog.
  const account = s.conns.get(g.ports.game);
  if (account && !account.closed) account.post(0x3114, PP.pbinBytes(p, rankView(p)));
}
function pity(l: Ledger, box: Box): Pity {
  const p = l.pity[box.id] ??= { superMisses: 0, ultraMisses: 0 };
  p.superMisses = box.superAt === null ? 0 : Math.min(box.superAt - 1, nat(p.superMisses));
  p.ultraMisses = box.ultraAt === null ? 0 : Math.min(box.ultraAt - 1, nat(p.ultraMisses));
  return p;
}
/** Every API item: its design, the player's holdings, `bodies` (who can wear it) and, when one body
 * is missing, the work-in-progress `notice`. `compatible` = this character's body can wear it. */
function itemOut(item: CosmeticFamily, l: Ledger, gender: Body) {
  return { ...item, ...bodyInfo(item), owned: l.owned.includes(item.id), copies: nat(l.copies[item.id]), tradable: nat(l.copies[item.id]),
    compatible: item.variants.some((v) => v.gender === gender) };
}
const SLOT_NAMES: Record<number, string> = { 1: "Hair", 2: "Accessory", 3: "Nose", 4: "Eyes", 5: "Mouth", 6: "Clothes", 7: "Back Hair", 8: "Duel Disk", 9: "Glasses" };
/** A part this character may wear in `world`: owned (or a default row), the world rule (any outfit in either world
 *  for a graduated student) and the rank rule (a school uniform once its school was reached: ranking.ts). The 2008
 *  LV gate (Ra Yellow at LV 10, Obelisk Blue at 20) is gone: rank uniforms follow the best PvP school. */
function rowAllowed(p: PP.P, bit: number, world: number, view: RankView): boolean {
  const row = AVATAR_ROWS[String(bit)];
  if (!row || ![1, 2].includes(row[2]) || !rankRowAllowed(bit, world, view)) return false;
  if (!row[1] && !PP.pbinTest(p, bit)) return false;
  return true;
}
/** Whether a row is its item's own for its body (the one equip puts on): every row but a merged item's other sizes. */
function ownRow(bit: number): boolean {
  const family = COSMETIC_BY_BIT.get(bit), gender = AVATAR_ROWS[String(bit)]?.[2] === 2 ? "female" : "male";
  return !family || family.variants.find((v) => v.gender === gender)?.bit === bit;
}
function appearanceOptions(p: PP.P, world: number, parts: Uint8Array, view: RankView) {
  const kind = parts[0] === 1 ? 2 : 1;
  const options = Object.entries(SLOT_NAMES).map(([key, label]) => {
    const index = Number(key);
    // a merged item (Afro: three sizes) is listed once, by the row it equips, unless another of its rows is worn
    const rows = Object.entries(AVATAR_ROWS).filter(([bit, row]) => row[2] === kind && row[3] === index && rowAllowed(p, Number(bit), world, view)
      && (row[0] === parts[index] || ownRow(Number(bit))));
    const choices = rows.map(([bit, row], i) => ({ value: row[0], label: COSMETIC_BY_BIT.get(Number(bit))?.name ?? (row[0] === 0x20 && [2, 9].includes(index) ? "None" : `${label} ${i + 1}`) }));
    if ([2, 9].includes(index) && !choices.some((c) => c.value === 0x20)) choices.unshift({ value: 0x20, label: "None" });
    return { index, label, choices };
  });
  for (const [index, label, count] of [[13, "Skin Tone", 3], [14, "Hair Colour", 7], [15, "Eye Colour", 7]] as const)
    options.push({ index, label, choices: Array.from({ length: count }, (_, value) => ({ value, label: `${label} ${value + 1}` })) });
  return options;
}
function appearanceError(p: PP.P, world: number, parts: Uint8Array, view: RankView): string | null {
  if (parts.length !== 16 || parts[0] > 1 || [10, 11, 12].some((i) => parts[i] !== 0) || parts[13] > 2 || parts[14] > 6 || parts[15] > 6) return "invalid-appearance";
  if (Number(p.rec?.lv ?? 1) < 5 && parts[6] !== 0x80) return "slifer-until-lv5";
  const base = parts[0] === 1 ? 256 : 0;
  for (let slot = 1; slot <= 9; slot++) {
    if ([2, 9].includes(slot) && parts[slot] === 32) continue;
    const bit = base + parts[slot], row = AVATAR_ROWS[String(bit)];
    if (!row || row[3] !== slot || row[2] !== (parts[0] === 1 ? 2 : 1)) return "invalid-appearance";
    if (!rankRowAllowed(bit, world, view)) return "rank-uniform-locked";
    if (!row[1] && !PP.pbinTest(p, bit)) return "appearance-not-owned";
  }
  return PP.avatarOwned(p, parts) ? null : "appearance-not-owned";
}

function expireOffers(g: Game): void {
  const changes: Record<string, State> = {};
  for (const [acct, a] of Object.entries(g.store.peek().accounts ?? {}) as [string, State][]) {
    if (!a.cosmetics?.offers || !Object.values(a.cosmetics.offers).some((o: any) => o.status === "pending" && o.expiresAt <= now(g))) continue;
    const copy = clone(a), l = ledger(copy);
    for (const offer of Object.values(l.offers)) if (offer.status === "pending" && offer.expiresAt <= now(g)) {
      for (const line of offer.give) l.copies[line.id] = nat(l.copies[line.id]) + line.count;
      offer.status = "expired";
    }
    changes[acct] = copy;
  }
  if (Object.keys(changes).length) g.store.commit({}, changes);
}
/** `holder` = the account whose ledger stores the offer (its creator): a not yet migrated ledger's
 * old ids are shown as ledger() will migrate them. */
function offerOut(o: Offer, acct: string, holder?: State) {
  const { fromAcct: _f, toAcct: _t, requestId: _r, ...out } = o;
  const body = holder ? accountBody(holder) : "male", legacy = holder?.cosmetics?.split !== 1 && !!holder;
  const canonicalLines = (list: Line[]) => {
    const counts = new Map<string, number>();
    for (const line of list) { const id = resolveCosmeticId(line.id, body, legacy); counts.set(id, (counts.get(id) ?? 0) + line.count); }
    return [...counts].map(([id, count]) => ({ id, count }));
  };
  return { ...out, give: canonicalLines(out.give), want: canonicalLines(out.want), outbound: o.fromAcct === acct };
}
function state(g: Game, s: Session, a: State, l: Ledger) {
  const p = profile(a, s)!;
  const world = s.world === 0 ? 0 : 1;
  const parts = PP.avatarParts(p, world), gender = parts[0] === 1 ? "female" : "male";
  const owned = new Set(l.owned), view = rankView(p);
  const trades: ReturnType<typeof offerOut>[] = [];
  for (const acc of Object.values(g.store.peek().accounts ?? {}) as State[]) for (const o of Object.values(acc.cosmetics?.offers ?? {}) as Offer[]) {
    if ((o.fromAcct === s.acct || o.toAcct === s.acct) && o.status === "pending" && o.expiresAt > now(g)) trades.push(offerOut(o, s.acct, acc));
  }
  return { available: true, wallet: PP.mpBalances(p), nextRequestId: String(l.sequence), selfPid: s.pid,
    players: [...g.hub.sessions.values()].filter((x) => x !== s && x.pid !== null && x.lobby && !x.lobby.closed).map((x) => ({ pid: x.pid!, name: x.name })),
    appearance: { gender, world, parts: [...parts], looks: { "0": [...PP.avatarParts(p, 0)], "1": [...PP.avatarParts(p, 1)] } },
    appearanceOptions: appearanceOptions(p, world, parts, view),
    appearanceOptionsByWorld: { "0": appearanceOptions(p, 0, PP.avatarParts(p, 0), view), "1": appearanceOptions(p, 1, PP.avatarParts(p, 1), view) },
    // Ranked PvP (ranking.ts): rating, school, the best school and the uniforms it unlocked, graduation.
    rank: view, outfitLocked: Number(p.rec?.lv ?? 1) < 5,
    // Odds disclosure: configuredOdds is the table; baseOdds/nextOdds are what is actually rolled,
    // renormalised over rarities that have eligible items (nextOdds includes this player's pity).
    boxes: BOXES.map((b) => {
      const { pool, ...odds } = boxDisclosure(b, pity(l, b));
      const count = (tier: CosmeticRarity) => pool.filter((i) => i.rarity === tier).length;
      return { ...b, ...odds, pity: { ...pity(l, b), superAt: b.superAt, ultraAt: b.ultraAt },
        pool: pool.map((item) => ({ ...itemOut(item, l, gender),
          baseChance: odds.baseOdds[item.rarity] / count(item.rarity), nextChance: odds.nextOdds[item.rarity] / count(item.rarity) })) };
    }),
    inventory: [...FREE_COSMETICS.map(item => ({ ...item, bodies: [...new Set(item.variants.map(v => v.gender))], owned: true, copies: 0, tradable: 0, compatible: item.variants.some(v => v.gender === gender) })), ...COSMETICS.filter((item) => owned.has(item.id) || nat(l.copies[item.id]) > 0).map((item) => itemOut(item, l, gender))],
    catalog: COSMETICS.map((item) => itemOut(item, l, gender)), trades };
}
export function cosmeticInfo(g: Game, who: string | Session) {
  const s = active(g, who); if (hasError(s)) return s;
  expireOffers(g);
  const a = accountCopy(g, s.acct); if (!a || !profile(a, s)) return fail("no-character");
  const before = JSON.stringify(a), l = ledger(a); project(profile(a, s)!, l);
  const out = state(g, s, a, l);
  if (JSON.stringify(a) !== before) { g.store.commit({}, { [s.acct]: a }); pushOwnership(g, s, profile(a, s)!); }
  return out;
}
export function cosmeticOpen(g: Game, who: string | Session, body: unknown) {
  const s = active(g, who); if (hasError(s)) return s;
  if (limit(s)) return fail("in-duel");
  const b = body as { boxId?: unknown; requestId?: unknown } | null;
  const box = boxById(b?.boxId); // "hair" is the head box's former id
  if (!box || typeof b?.requestId !== "string" || !/^(0|[1-9][0-9]{0,14})$/.test(b.requestId)) return fail("bad-request", 400);
  const a = accountCopy(g, s.acct); if (!a || !profile(a, s)) return fail("no-character");
  const l = ledger(a), p = profile(a, s)!;
  const prior = l.receipts[b.requestId];
  if (prior) {
    const item = COSMETIC_BY_ID.get(prior.id);
    if (prior.boxId !== box.id || !item) return fail("request-conflict");
    return { ...state(g, s, a, l), requestId: b.requestId, reward: { ...itemOut(item, l, bodyOfParts(PP.avatarParts(p, s.world ?? 1))), duplicate: prior.duplicate }, replay: true };
  }
  // Monotonic server-issued tokens retain replay protection even after old receipts are compacted.
  if (b.requestId !== String(l.sequence)) return fail("stale-request");
  const balances = PP.mpBalances(p);
  if (balances.earned < box.price) return fail("insufficient-earned-mp");
  const gender = bodyOfParts(PP.avatarParts(p, s.world ?? 1));
  // Ownership is per design family: a male variant owned makes its female equivalent a duplicate.
  // The pool is the same for every body: a single-body item the opener cannot wear is still theirs to keep or trade.
  const pool = cosmeticPool(box.id), progress = pity(l, box), weights = boxWeights(box, pool, progress);
  const total = RARITIES.reduce((n, t) => n + weights[t], 0);
  if (!boxAvailable(box, pool) || !total) return fail("unavailable-pool");
  let roll = randomInt(total), tier: CosmeticRarity = "common";
  for (const r of RARITIES) { roll -= weights[r]; if (roll < 0) { tier = r; break; } }
  // Any design of the rolled tier, owned or not: pity guarantees the tier, not a new item (duplicates are tradable).
  const matches = pool.filter((item) => item.rarity === tier), item = matches[randomInt(matches.length)];
  const duplicate = grant(l, item);
  progress.superMisses = box.superAt === null ? 0 : tier === "super" || tier === "ultra" ? 0 : progress.superMisses + 1;
  progress.ultraMisses = box.ultraAt === null ? 0 : tier === "ultra" ? 0 : progress.ultraMisses + 1;
  // Debit earned MP, preserving every unit of the starter/promotional subset.
  p.rec.mp = balances.total - box.price;
  project(p, l);
  l.receipts[b.requestId] = { boxId: box.id, id: item.id, duplicate };
  l.sequence++;
  for (const id of Object.keys(l.receipts)) if (Number(id) < l.sequence - 32) delete l.receipts[id];
  PP.mpSpent(g, p, box.price, 0);
  g.store.commit({}, { [s.acct]: a });
  pushOwnership(g, s, p);
  if (s.lobby && !s.lobby.closed) s.lobby.post(0x4140, PP.playerDataUpdate(p));
  g.log(`[economia] cosmetic box ${box.id}: ${tier}, ${duplicate ? "duplicate" : "new"}, pool ${pool.length}, pity ${progress.superMisses}/${progress.ultraMisses}, -${box.price} earned MP`);
  return { ...state(g, s, a, l), requestId: b.requestId, reward: { ...itemOut(item, l, gender), duplicate } };
}
export function cosmeticEquip(g: Game, who: string | Session, body: unknown) {
  const s = active(g, who); if (hasError(s)) return s;
  if (limit(s)) return fail("in-duel");
  const b = body as { id?: unknown; world?: unknown } | null;
  const world = b?.world === undefined ? (s.world === 0 ? 0 : 1) : b.world;
  if (world !== 0 && world !== 1) return fail("bad-request", 400);
  const a = accountCopy(g, s.acct); if (!a || !profile(a, s)) return fail("no-character");
  const l = ledger(a), p = profile(a, s)!;
  const parts = PP.avatarParts(p, world), gender = bodyOfParts(parts);
  // An old paired id (e.g. outfit:fitted-duelist from a stale client) means this body's half.
  const free = FREE_COSMETIC_BY_ID.get(String(b?.id));
  const item = free ?? COSMETIC_BY_ID.get(resolveCosmeticId(String(b?.id), gender));
  if (!item) return fail("bad-request", 400);
  if (!free && !l.owned.includes(item.id)) return fail("not-owned", 403);
  if (!item.variants.some((v) => v.gender === gender))
    return fail("no-compatible-variant", 409, { reason: "body", id: item.id, ...(free ? { bodies: item.variants.map(v => v.gender) } : { bodies: itemBodies(item as CosmeticFamily), notice: bodyNotice(item as CosmeticFamily) }) });
  // the body's first variant is the item's own (Afro: Afro I's row; the merged sizes stay wearable, see MERGED_FAMILIES);
  // one look for both worlds (owner, 2026-11-05): no world rule
  const variant = item.variants.find((v) => v.gender === gender)!;
  if (item.slot === 6 && Number(p.rec?.lv ?? 1) < 5 && variant.number !== 0x80) return fail("slifer-until-lv5", 403);
  project(p, l); parts[item.slot] = variant.number;
  const error = appearanceError(p, world, parts, rankView(p));
  if (error) return fail(error, 403);
  PP.outfitPicked(p, parts);
  PP.setLook(p, parts, world);
  g.store.commit({}, { [s.acct]: a });
  pushOwnership(g, s, p);
  showLooks(g, s, [{ world: 0, parts }, { world: 1, parts }]);
  return { ...state(g, s, a, l), equipped: { id: item.id, world, parts: [...parts] } };
}
/** `body` resolves an old paired id from a stale client to the half that account's copies went to. */
function lines(value: unknown, body: Body): Line[] | null {
  if (!Array.isArray(value) || value.length > 10) return null;
  const totals = new Map<string, number>();
  for (const row of value) {
    if (!row || typeof row !== "object" || typeof row.id !== "string" || !Number.isInteger(row.count) || row.count < 1 || row.count > 99) return null;
    const id = resolveCosmeticId(row.id, body);
    if (!COSMETIC_BY_ID.has(id)) return null;
    const count = (totals.get(id) ?? 0) + row.count;
    if (count > 99) return null;
    totals.set(id, count);
  }
  return [...totals].map(([id, count]) => ({ id, count }));
}
function canGive(l: Ledger, list: Line[]): boolean { return list.every((r) => nat(l.copies[r.id]) >= r.count); }
function take(l: Ledger, list: Line[]): void { for (const r of list) l.copies[r.id] = nat(l.copies[r.id]) - r.count; }
function receive(l: Ledger, list: Line[]): void {
  for (const r of list) for (let i = 0; i < r.count; i++) grant(l, COSMETIC_BY_ID.get(r.id)!);
}
function trimOffers(l: Ledger): void {
  const finished = Object.values(l.offers).filter((o) => o.status !== "pending").sort((a, b) => b.expiresAt - a.expiresAt);
  for (const o of finished.slice(32)) delete l.offers[o.id];
}
/** Cosmetic trade offers escrow the offered extra copies; edits require cancellation and a new consent. */
export function cosmeticTrade(g: Game, who: string | Session, body: unknown) {
  const s = active(g, who); if (hasError(s)) return s;
  if (limit(s) || g.tp?.isTrading(s)) return fail("busy");
  if (g.admin.flagsOf(s.acct) & 0x40) return fail("trade-restricted", 403);
  expireOffers(g);
  const b = body as { targetPid?: unknown; give?: unknown; want?: unknown; requestId?: unknown } | null;
  if (!b || typeof b.requestId !== "string" || !/^[a-zA-Z0-9_-]{8,80}$/.test(b.requestId)) return fail("bad-request", 400);
  const other = g.hub.byPid(Number(b.targetPid));
  if (!other || other === s || other.acct === s.acct || other.slot === null || !other.lobby || other.lobby.closed) return fail("bad-offer", 400);
  if (isFree(other) || limit(other) || g.tp?.isTrading(other) || (g.admin.flagsOf(other.acct) & 0x40)) return fail("unavailable");
  const a = accountCopy(g, s.acct), otherAccount = accountCopy(g, other.acct);
  if (!a || !otherAccount || !profile(a, s) || !profile(otherAccount, other)) return fail("no-character");
  const give = lines(b.give, accountBody(a)), want = lines(b.want, accountBody(otherAccount));
  if (!give || !want || !give.length) return fail("bad-offer", 400);
  if ((profile(otherAccount, other)?.black ?? []).includes(s.pid) || (profile(a, s)?.black ?? []).includes(other.pid)) return fail("unavailable");
  const l = ledger(a), old = Object.values(l.offers).find((o) => o.requestId === b.requestId);
  if (old) {
    if (old.toAcct !== other.acct || JSON.stringify(old.give) !== JSON.stringify(give) || JSON.stringify(old.want) !== JSON.stringify(want)) return fail("request-conflict");
    return { ...state(g, s, a, l), offer: offerOut(old, s.acct), replay: true };
  }
  if (Object.values(l.offers).filter((o) => o.status === "pending").length >= 5) return fail("too-many-offers");
  const incoming = Object.values(g.store.peek().accounts ?? {}).flatMap((x: any) => Object.values(x.cosmetics?.offers ?? {}) as Offer[])
    .filter((o) => o.toAcct === other.acct && o.status === "pending").length;
  if (incoming >= 10) return fail("unavailable");
  if (!canGive(l, give)) return fail("insufficient-duplicates");
  take(l, give);
  const id = crypto.randomUUID();
  const offer: Offer = { id, requestId: b.requestId, fromAcct: s.acct, toAcct: other.acct, fromPid: s.pid!, fromName: s.name,
    toPid: other.pid!, toName: other.name, give, want, status: "pending", expiresAt: now(g) + 10 * 60 * 1000 };
  l.offers[id] = offer; trimOffers(l);
  g.store.commit({}, { [s.acct]: a });
  return { ...state(g, s, a, l), offer: offerOut(offer, s.acct) };
}
function findOffer(g: Game, id: string): { acct: string; a: State; l: Ledger; offer: Offer } | null {
  for (const [acct, raw] of Object.entries(g.store.peek().accounts ?? {}) as [string, State][]) {
    if (!raw.cosmetics?.offers?.[id]) continue;
    const a = clone(raw), l = ledger(a); return { acct, a, l, offer: l.offers[id] };
  }
  return null;
}
export function cosmeticTradeAccept(g: Game, who: string | Session, body: unknown) {
  const s = active(g, who); if (hasError(s)) return s;
  if (limit(s) || g.tp?.isTrading(s)) return fail("busy");
  expireOffers(g);
  const id = (body as { offerId?: unknown } | null)?.offerId;
  if (typeof id !== "string") return fail("bad-request", 400);
  const found = findOffer(g, id);
  if (!found || found.offer.toAcct !== s.acct) return fail("not-found", 404);
  const { acct, a, l, offer } = found;
  if ((g.admin.flagsOf(acct) | g.admin.flagsOf(s.acct)) & 0x40) return fail("trade-restricted", 403);
  const target = accountCopy(g, s.acct); if (!target || !profile(target, s)) return fail("no-character");
  const receiver = ledger(target);
  if (offer.status === "accepted") return { ...state(g, s, target, receiver), offer: offerOut(offer, s.acct), replay: true };
  if (offer.status !== "pending") return fail("offer-closed");
  if (!canGive(receiver, offer.want)) return fail("insufficient-duplicates");
  take(receiver, offer.want); receive(l, offer.want); receive(receiver, offer.give);
  offer.status = "accepted";
  project(profile(target, s)!, receiver);
  const giverSession = g.hub.sessions.get(acct);
  if (giverSession && profile(a, giverSession)) project(profile(a, giverSession)!, l);
  g.store.commit({}, { [acct]: a, [s.acct]: target });
  pushOwnership(g, s, profile(target, s)!);
  if (giverSession && profile(a, giverSession)) pushOwnership(g, giverSession, profile(a, giverSession)!);
  g.log(`[economia] cosmetic trade accepted: ${offer.give.reduce((n, x) => n + x.count, 0)} for ${offer.want.reduce((n, x) => n + x.count, 0)} copies`);
  return { ...state(g, s, target, receiver), offer: offerOut(offer, s.acct) };
}
export function cosmeticTradeCancel(g: Game, who: string | Session, body: unknown) {
  const s = active(g, who); if (hasError(s)) return s;
  expireOffers(g);
  const id = (body as { offerId?: unknown } | null)?.offerId;
  if (typeof id !== "string") return fail("bad-request", 400);
  const found = findOffer(g, id);
  if (!found || ![found.offer.fromAcct, found.offer.toAcct].includes(s.acct)) return fail("not-found", 404);
  const { acct, a, l, offer } = found;
  if (offer.status === "pending") {
    for (const line of offer.give) l.copies[line.id] = nat(l.copies[line.id]) + line.count;
    offer.status = "cancelled"; g.store.commit({}, { [acct]: a });
  } else if (offer.status !== "cancelled" && offer.status !== "expired") return fail("offer-closed");
  const me = accountCopy(g, s.acct)!;
  return { ...state(g, s, me, ledger(me)), offer: offerOut(offer, s.acct) };
}

// ---- the native trade's cosmetic lines (trade.ts: one trade, cards and cosmetics, one commit). Only spare copies
// move (l.copies: never the first unlock, never legacy PBIN ownership). Nothing is escrowed while the trade is open:
// the lines live on the in-memory trade session and every one is checked again at the commit, so a cancel, a
// disconnect or a server restart has nothing to give back.
/** At most this many different items per side (the trade window's strip has room for them). */
export const TRADE_COSMETIC_LINES = 6;
/** An item as the trade panel draws it (its art and rarity; no holdings). */
export function tradeItem(id: string) {
  const item = COSMETIC_BY_ID.get(id);
  return item ? { ...item, ...bodyInfo(item) } : null;
}
/** A side's lines from a request (resolved like an offer's, merged per item), or null when malformed. */
export function tradeLines(value: unknown, acct: string, g: Game): Line[] | null {
  const a = accountCopy(g, acct);
  const out = lines(value, a ? accountBody(a) : "male");
  return out && out.length <= TRADE_COSMETIC_LINES ? out : null;
}
/** The account's spare copies (item -> copies), read only; null without an account. */
export function spareCopies(g: Game, acct: string): Record<string, number> | null {
  const a = accountCopy(g, acct);
  if (!a) return null;
  const l = ledger(a), out: Record<string, number> = {};
  for (const [id, n] of Object.entries(l.copies)) if (nat(n) > 0 && COSMETIC_BY_ID.has(id)) out[id] = nat(n);
  return out;
}
/** The spare copies the panel offers to add: every item with copies, as the API's items with `copies`. */
export function tradeSpares(g: Game, acct: string) {
  const spares = spareCopies(g, acct) ?? {};
  return COSMETICS.filter((item) => spares[item.id] > 0).map((item) => ({ ...item, ...bodyInfo(item), copies: spares[item.id] }));
}
/** Both sides' lines on two account entries (copies, the caller commits them together): each side's spares are
 *  checked first, then given and received. false (and the entries must be thrown away) when a side lacks a copy. */
export function swapCosmetics(ea: State, eb: State, pa: PP.P, pb: PP.P, giveA: Line[], giveB: Line[]): boolean {
  const la = ledger(ea), lb = ledger(eb);
  if (!canGive(la, giveA) || !canGive(lb, giveB)) return false;
  take(la, giveA); take(lb, giveB);
  receive(la, giveB); receive(lb, giveA);
  project(pa, la); project(pb, lb);
  return true;
}
/** The client's ownership bits again after a trade moved cosmetics (NetAccount onPbin: no gift dialog). */
export const pushCosmeticOwnership = (g: Game, s: Session, p: PP.P) => pushOwnership(g, s, p);

/** Gender changes preserve design ownership and select its actual corresponding body artwork. */
export function cosmeticAppearance(g: Game, who: string | Session, body: unknown) {
  const s = active(g, who); if (hasError(s)) return s;
  if (limit(s)) return fail("in-duel");
  const b = body as { world?: unknown; gender?: unknown; parts?: unknown } | null;
  const world = b?.world === undefined ? (s.world === 0 ? 0 : 1) : b.world;
  if (!b || (world !== 0 && world !== 1) || (b.gender !== undefined && !["male", "female"].includes(String(b.gender)))) return fail("bad-request", 400);
  if (b.parts !== undefined && (!Array.isArray(b.parts) || b.parts.length !== 16 || !b.parts.every((n) => Number.isInteger(n) && n >= 0 && n <= 255))) return fail("bad-request", 400);
  const a = accountCopy(g, s.acct); if (!a || !profile(a, s)) return fail("no-character");
  const l = ledger(a), p = profile(a, s)!; project(p, l);
  const view = rankView(p);
  const updates: { world: number; parts: Uint8Array }[] = [];
  const requestedGender = b.gender === "male" ? 0 : b.gender === "female" ? 1 : null;
  if (requestedGender !== null) for (const w of [0, 1]) {
    const old = PP.avatarParts(p, w), parts = old.slice(), oldBase = old[0] === 1 ? 256 : 0;
    parts[0] = requestedGender;
    for (let slot = 1; slot <= 9; slot++) {
      if (old[0] === requestedGender) continue;
      if ([2, 9].includes(slot) && old[slot] === 32) { parts[slot] = 32; continue; }
      const previous = AVATAR_ROWS[String(oldBase + old[slot])], family = COSMETIC_BY_BIT.get(oldBase + old[slot]);
      // the same design for the other body; of a merged item's rows (Afro's sizes), the same size if it has one
      const others = family?.variants.filter((v) => v.gender === (requestedGender ? "female" : "male")) ?? [];
      const variant = others.find((v) => AVATAR_ROWS[String(v.bit)][4] === previous?.[4]) ?? others[0];
      const sameName = !family && previous ? Object.entries(AVATAR_ROWS).find(([bit, row]) => row[2] === requestedGender + 1 && row[3] === slot && row[4] === previous[4] && rowAllowed(p, Number(bit), w, view))?.[1] : null;
      const fallback = fallbackRow(p, requestedGender, slot, w, view);
      parts[slot] = variant?.number ?? sameName?.[0] ?? fallback?.[0] ?? ([2, 9].includes(slot) ? 32 : 0);
    }
    const error = appearanceError(p, w, parts, view); if (error) return fail(error, 403);
    updates.push({ world: w, parts });
  }
  if (b.parts !== undefined) {
    const parts = Uint8Array.from(b.parts as number[]);
    if (requestedGender !== null && parts[0] !== requestedGender) return fail("gender-conflict", 400);
    const error = appearanceError(p, world, parts, view); if (error) return fail(error, 403);
    const previous = updates.findIndex((u) => u.world === world);
    if (previous >= 0) updates.splice(previous, 1);
    updates.push({ world, parts });
  }
  if (!updates.length) return fail("bad-request", 400);
  // one look for both worlds (owner, 2026-11-05): the last update (the parts asked for, else the new body's) is it
  const look = updates[updates.length - 1].parts;
  PP.outfitPicked(p, look);
  PP.setLook(p, look, world as number);
  g.store.commit({}, { [s.acct]: a }); pushOwnership(g, s, p);
  showLooks(g, s, [{ world: 0, parts: look }, { world: 1, parts: look }]);
  return { ...state(g, s, a, l), appearanceUpdated: true };
}
/** New looks to the player's own client (0x4181 with its own pid) and to everyone in its block: the world it is in
 *  as a 0x4170 would (hub.onLobbyMsg: s.parts, 0x4181 to the others, and the redraw), the other world as a 0x4181 of that world
 *  (the client keeps each player's look per world, NetLobby onUpdateAvatar, and draws the one of its own world: a
 *  player in the other world's area, or the player card, would otherwise keep the old look until the next list). */
function showLooks(g: Game, s: Session, updates: { world: number; parts: Uint8Array }[]): void {
  for (const u of updates) {
    const c = s.lobby;
    if (!c || c.closed) { s.partsW.set(u.world, u.parts); continue; }
    const msg = new W().u32(s.pid!).u32(u.world).raw(u.parts).bytes();
    c.post(0x4181, msg);
    // (onLobbyMsg compares with the look before: a changed one is drawn again on the others' screens, Hub.redraw)
    if (u.world === (s.world ?? 1)) g.hub.onLobbyMsg(c, 0x4170, new W().u32(u.world).raw(u.parts).bytes());
    else {
      s.partsW.set(u.world, u.parts);
      if (s.block !== null) for (const o of g.hub.others(s)) if (o.lobby && !o.lobby.closed) o.lobby.post(0x4181, msg, 0.02);
    }
  }
}
/** The Slifer Red uniform's part number (both bodies): the dorm uniform everyone may wear. */
const SLIFER = 0x80;
/** The first default row of this body and slot this character may wear (a body change's stand-in for a part with no
 *  version for the new body). One look for both worlds (owner, 2026-11-05): `world` is not a rule any more. */
function fallbackRow(p: PP.P, gender: number, slot: number, world: number, view: RankView) {
  if (slot === 6) return AVATAR_ROWS[String((gender === 1 ? 256 : 0) + SLIFER)];
  return Object.entries(AVATAR_ROWS).find(([bit, row]) => row[1] && row[2] === gender + 1 && row[3] === slot && rowAllowed(p, Number(bit), world, view))?.[1];
}
/** A look checked against the rank rule. `owned` false: some part is not this character's (the caller refuses the
 *  whole look, as before). Otherwise a dorm uniform of a school never reached is replaced by Slifer Red;
 *  `changed` says if any part was. There is no world rule (one look for both worlds, owner 2026-11-05), and rank
 *  unlocks are for good, so a look that passed once always passes again. */
export function lawfulLook(p: PP.P, world: number, parts: Uint8Array): { owned: boolean; changed: boolean; parts: Uint8Array } {
  const out = PP.normalizeLook(p, parts), view = rankView(p), w = world === 0 ? 0 : 1;
  if (!PP.avatarOwned(p, parts)) return { owned: false, changed: false, parts: out };
  if (out.length < 10 || out[0] > 1) return { owned: true, changed: false, parts: out };
  const kind = out[0] === 1 ? 2 : 1, base = out[0] === 1 ? 256 : 0;
  let changed = out.some((v, i) => v !== parts[i]);
  for (let i = 1; i <= 9; i++) {
    if ([2, 9].includes(i) && out[i] === 32) continue;
    const bit = base + out[i], row = AVATAR_ROWS[String(bit)];
    if (!row || row[3] !== i || row[2] !== kind || rankRowAllowed(bit, w, view)) continue;   // not an item of the slot: the client's own check
    // the clothes (a dorm uniform of a school not reached): Slifer Red, the uniform everyone may wear
    const slifer = AVATAR_ROWS[String(base + SLIFER)];
    const fallback = i === 6 && slifer?.[3] === 6 ? slifer : fallbackRow(p, out[0], i, w, view);
    out[i] = fallback?.[0] ?? ([2, 9].includes(i) ? 32 : out[i]);
    changed = true;
  }
  return { owned: true, changed, parts: out };
}
/** A school's dorm uniform, as an outfit part (both bodies: rows 0x80-0x82 and 0x180-0x182). */
const UNIFORM_PART: Readonly<Record<UniformSchool, number>> = { slifer: 0x80, ra: 0x81, obelisk: 0x82 };
/** The uniform of a school just reached is put on (owner, 2026-11-06: "when the user earns the ra/obelisk it auto
 *  equips it"); `was`: the best school before the match. Only the outfit changes; the player may change it back. */
export function wearNewUniform(p: PP.P, was: RankSchool): boolean {
  const now = rankView(p).bestSchool;   // Master is left alone (owner, 2026-11-06)
  if (now !== "ra" && now !== "obelisk" || RANK_SCHOOLS.indexOf(now) <= RANK_SCHOOLS.indexOf(was)) return false;
  const parts = PP.avatarParts(p, 1);
  parts[6] = UNIFORM_PART[now];
  PP.outfitPicked(p, parts); PP.setLook(p, parts);
  return true;
}
/** After a PvP result (ranking.ts, pvpMatch.rated): each listed online character gets its 0x3114 again, for the
 *  recompiled editor's rank bits (the uniforms of a school just reached, PBIN_GRADUATED once graduated:
 *  ranking.ts gradUpdate), and, for the `dressed` ones (wearNewUniform put a uniform on), its look. Nothing is taken
 *  back: unlocks and graduation are for good. */
export function pushRankBits(g: Game, accts: Iterable<string>, dressed: ReadonlySet<string> = new Set()): void {
  for (const acct of new Set(accts)) {
    const s = g.hub.sessions.get(acct);
    if (!s || s.slot === null) continue;
    const a = accountCopy(g, acct), p = a ? profile(a, s) : null;
    if (!p) continue;
    pushOwnership(g, s, p);
    // a uniform put on for a school just reached: shown now, and to the player's own client, whose next 0x4170 (room
    // entry) would otherwise send its old look back
    if (!dressed.has(acct)) continue;
    const look = PP.avatarParts(p, s.world ?? 1);
    showLooks(g, s, [{ world: 0, parts: look }, { world: 1, parts: look }]);
  }
}
