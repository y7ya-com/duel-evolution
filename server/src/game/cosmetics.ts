// Account wardrobe and quantity-bearing box duplicates. Every mutation is synchronous
// inside World.run; callers flush the D1 sink before acknowledging a successful request.
import type { Game } from "./game.ts";
import type { Session } from "./hub.ts";
import type { State } from "./store.ts";
import * as PP from "./persist.ts";
import { isFree } from "./freemode.ts";
import { W } from "../net/proto.ts";
import { BOXES, COSMETICS, COSMETIC_BY_ID, COSMETIC_BY_BIT, RARITIES, AVATAR_ROWS, canonicalCosmeticId, cosmeticPool, expandCosmeticBits,
  type CosmeticFamily, type CosmeticRarity, type BoxId } from "./cosmetics-catalog.ts";
export { BOXES, COSMETICS, expandCosmeticBits } from "./cosmetics-catalog.ts";

type Pity = { superMisses: number; ultraMisses: number };
type Receipt = { boxId: BoxId; id: string; duplicate: boolean };
type Line = { id: string; count: number };
type Offer = { id: string; requestId: string; fromAcct: string; toAcct: string; fromPid: number; fromName: string;
  toPid: number; toName: string; give: Line[]; want: Line[]; status: "pending" | "accepted" | "cancelled" | "expired"; expiresAt: number };
type Ledger = { version: 1; owned: string[]; copies: Record<string, number>; pity: Partial<Record<BoxId, Pity>>;
  sequence: number; receipts: Record<string, Receipt>; offers: Record<string, Offer> };
type Fail = { error: string; status: number };
const fail = (error: string, status = 409): Fail => ({ error, status });
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
/** No duplicate quantities are manufactured from legacy bits. Real variants share ownership. */
function ledger(a: State): Ledger {
  const l: Ledger = a.cosmetics?.version === 1 ? a.cosmetics :
    (a.cosmetics = { version: 1, owned: [], copies: {}, pity: {}, sequence: 0, receipts: {}, offers: {} });
  l.owned ??= []; l.copies ??= {}; l.pity ??= {}; l.receipts ??= {}; l.offers ??= {}; l.sequence = nat(l.sequence);
  const owned = new Set(l.owned.map(canonicalCosmeticId).filter((id) => COSMETIC_BY_ID.has(id)));
  // A design identity can be corrected without losing purchased duplicates, pending
  // trade escrow or retry receipts. Ownership merging never creates trade copies.
  for (const [id, count] of Object.entries(l.copies)) {
    const canonical = canonicalCosmeticId(id);
    if (canonical !== id) { l.copies[canonical] = nat(l.copies[canonical]) + nat(count); delete l.copies[id]; }
  }
  for (const receipt of Object.values(l.receipts)) receipt.id = canonicalCosmeticId(receipt.id);
  for (const offer of Object.values(l.offers)) for (const key of ["give", "want"] as const) {
    const counts = new Map<string, number>();
    for (const line of offer[key]) { const id = canonicalCosmeticId(line.id); counts.set(id, (counts.get(id) ?? 0) + line.count); }
    offer[key] = [...counts].map(([id, count]) => ({ id, count }));
  }
  for (const p of [...Object.values(a.profiles ?? {}), ...(a.profiles_borrados ?? []).map((v: any) => v?.perfil)] as PP.P[]) {
    for (const bit of p?.pbin ?? []) { const family = COSMETIC_BY_BIT.get(bit); if (family) owned.add(family.id); }
  }
  l.owned = [...owned].sort();
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
  if (account && !account.closed) account.post(0x3114, PP.pbinBytes(p));
}
function pity(l: Ledger, id: BoxId): Pity {
  const p = l.pity[id] ??= { superMisses: 0, ultraMisses: 0 };
  p.superMisses = Math.min(9, nat(p.superMisses)); p.ultraMisses = Math.min(19, nat(p.ultraMisses)); return p;
}
export function nextBoxOdds(id: BoxId, p: Pity): Record<CosmeticRarity, number> {
  const box = BOXES.find((b) => b.id === id)!;
  if (box.ultraAt && p.ultraMisses >= box.ultraAt - 1) return { common: 0, rare: 0, super: 0, ultra: 100 };
  if (p.superMisses >= box.superAt - 1) {
    const total = box.weights.super + box.weights.ultra;
    return { common: 0, rare: 0, super: 100 * box.weights.super / total, ultra: 100 * box.weights.ultra / total };
  }
  return { ...box.weights };
}
function itemOut(item: CosmeticFamily, l: Ledger, gender: "male" | "female") {
  return { ...item, owned: l.owned.includes(item.id), copies: nat(l.copies[item.id]), tradable: nat(l.copies[item.id]),
    compatible: item.variants.some((v) => v.gender === gender) };
}
const SLOT_NAMES: Record<number, string> = { 1: "Hair", 2: "Accessory", 3: "Nose", 4: "Eyes", 5: "Mouth", 6: "Clothes", 7: "Back Hair", 8: "Duel Disk", 9: "Glasses" };
function rowAllowed(p: PP.P, bit: number, world: number): boolean {
  const row = AVATAR_ROWS[String(bit)];
  if (!row || ![1, 2].includes(row[2]) || ![1, world === 0 ? 2 : 3].includes(row[5])) return false;
  if (!row[1] && !PP.pbinTest(p, bit)) return false;
  if ([129, 385].includes(bit) && Number(p.rec?.lv ?? 1) < 10) return false;
  if ([130, 386].includes(bit) && Number(p.rec?.lv ?? 1) < 20) return false;
  return true;
}
function appearanceOptions(p: PP.P, world: number, parts: Uint8Array) {
  const kind = parts[0] === 1 ? 2 : 1;
  const options = Object.entries(SLOT_NAMES).map(([key, label]) => {
    const index = Number(key);
    const rows = Object.entries(AVATAR_ROWS).filter(([bit, row]) => row[2] === kind && row[3] === index && rowAllowed(p, Number(bit), world));
    const choices = rows.map(([bit, row], i) => ({ value: row[0], label: COSMETIC_BY_BIT.get(Number(bit))?.name ?? (row[0] === 0x20 && [2, 9].includes(index) ? "None" : `${label} ${i + 1}`) }));
    if ([2, 9].includes(index) && !choices.some((c) => c.value === 0x20)) choices.unshift({ value: 0x20, label: "None" });
    return { index, label, choices };
  });
  for (const [index, label, count] of [[13, "Skin Tone", 3], [14, "Hair Colour", 7], [15, "Eye Colour", 7]] as const)
    options.push({ index, label, choices: Array.from({ length: count }, (_, value) => ({ value, label: `${label} ${value + 1}` })) });
  return options;
}
function validAppearance(p: PP.P, world: number, parts: Uint8Array): boolean {
  if (parts.length !== 16 || parts[0] > 1 || [10, 11, 12].some((i) => parts[i] !== 0) || parts[13] > 2 || parts[14] > 6 || parts[15] > 6) return false;
  const base = parts[0] === 1 ? 256 : 0;
  for (let slot = 1; slot <= 9; slot++) {
    if ([2, 9].includes(slot) && parts[slot] === 32) continue;
    const bit = base + parts[slot], row = AVATAR_ROWS[String(bit)];
    if (!row || row[3] !== slot || row[2] !== (parts[0] === 1 ? 2 : 1) || !rowAllowed(p, bit, world)) return false;
  }
  return PP.avatarOwned(p, parts);
}
function poolAvailable(box: typeof BOXES[number], pool: CosmeticFamily[]): boolean {
  return pool.length > 0 && RARITIES.every((tier) => box.weights[tier] === 0 || pool.some((item) => item.rarity === tier));
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
function offerOut(o: Offer, acct: string) {
  const { fromAcct: _f, toAcct: _t, requestId: _r, ...out } = o;
  const canonicalLines = (list: Line[]) => {
    const counts = new Map<string, number>();
    for (const line of list) { const id = canonicalCosmeticId(line.id); counts.set(id, (counts.get(id) ?? 0) + line.count); }
    return [...counts].map(([id, count]) => ({ id, count }));
  };
  return { ...out, give: canonicalLines(out.give), want: canonicalLines(out.want), outbound: o.fromAcct === acct };
}
function state(g: Game, s: Session, a: State, l: Ledger) {
  const p = profile(a, s)!;
  const world = s.world === 0 ? 0 : 1;
  const parts = PP.avatarParts(p, world), gender = parts[0] === 1 ? "female" : "male";
  const owned = new Set(l.owned);
  const trades: ReturnType<typeof offerOut>[] = [];
  for (const acc of Object.values(g.store.peek().accounts ?? {}) as State[]) for (const o of Object.values(acc.cosmetics?.offers ?? {}) as Offer[]) {
    if ((o.fromAcct === s.acct || o.toAcct === s.acct) && o.status === "pending" && o.expiresAt > now(g)) trades.push(offerOut(o, s.acct));
  }
  return { available: true, wallet: PP.mpBalances(p), nextRequestId: String(l.sequence), selfPid: s.pid,
    players: [...g.hub.sessions.values()].filter((x) => x !== s && x.pid !== null && x.lobby && !x.lobby.closed).map((x) => ({ pid: x.pid!, name: x.name })),
    appearance: { gender, world, parts: [...parts], looks: { "0": [...PP.avatarParts(p, 0)], "1": [...PP.avatarParts(p, 1)] } },
    appearanceOptions: appearanceOptions(p, world, parts),
    appearanceOptionsByWorld: { "0": appearanceOptions(p, 0, PP.avatarParts(p, 0)), "1": appearanceOptions(p, 1, PP.avatarParts(p, 1)) },
    boxes: BOXES.map((b) => {
      const pool = cosmeticPool(b.id, gender), nextOdds = nextBoxOdds(b.id, pity(l, b.id));
      return { ...b, available: poolAvailable(b, pool), baseOdds: b.weights, nextOdds,
        pity: { ...pity(l, b.id), superAt: b.superAt, ultraAt: b.ultraAt },
        pool: pool.map((item) => ({ ...itemOut(item, l, gender),
          baseChance: b.weights[item.rarity] / pool.filter((i) => i.rarity === item.rarity).length,
          nextChance: nextOdds[item.rarity] / pool.filter((i) => i.rarity === item.rarity).length })) };
    }),
    inventory: COSMETICS.filter((item) => owned.has(item.id) || nat(l.copies[item.id]) > 0).map((item) => itemOut(item, l, gender)),
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
  const box = BOXES.find((x) => x.id === b?.boxId);
  if (!box || typeof b?.requestId !== "string" || !/^(0|[1-9][0-9]{0,14})$/.test(b.requestId)) return fail("bad-request", 400);
  const a = accountCopy(g, s.acct); if (!a || !profile(a, s)) return fail("no-character");
  const l = ledger(a), p = profile(a, s)!;
  const prior = l.receipts[b.requestId];
  if (prior) {
    if (prior.boxId !== box.id) return fail("request-conflict");
    return { ...state(g, s, a, l), requestId: b.requestId, reward: { ...itemOut(COSMETIC_BY_ID.get(prior.id)!, l, PP.avatarParts(p, s.world ?? 1)[0] === 1 ? "female" : "male"), duplicate: prior.duplicate }, replay: true };
  }
  // Monotonic server-issued tokens retain replay protection even after old receipts are compacted.
  if (b.requestId !== String(l.sequence)) return fail("stale-request");
  const balances = PP.mpBalances(p);
  if (balances.earned < box.price) return fail("insufficient-earned-mp");
  const gender = PP.avatarParts(p, s.world ?? 1)[0] === 1 ? "female" : "male";
  const pool = cosmeticPool(box.id, gender), odds = nextBoxOdds(box.id, pity(l, box.id));
  if (!poolAvailable(box, pool) || RARITIES.some((tier) => odds[tier] > 0 && !pool.some((item) => item.rarity === tier))) return fail("unavailable-pool");
  let roll = randomInt(100), tier: CosmeticRarity = "common";
  for (const r of RARITIES) { roll -= odds[r]; if (roll < 0) { tier = r; break; } }
  const matches = pool.filter((item) => item.rarity === tier), item = matches[randomInt(matches.length)];
  const duplicate = grant(l, item), progress = pity(l, box.id);
  progress.superMisses = tier === "super" || tier === "ultra" ? 0 : progress.superMisses + 1;
  progress.ultraMisses = box.ultraAt ? tier === "ultra" ? 0 : progress.ultraMisses + 1 : 0;
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
  g.log(`[economia] cosmetic box ${box.id}: ${tier}, ${duplicate ? "duplicate" : "new"}, -${box.price} earned MP`);
  return { ...state(g, s, a, l), requestId: b.requestId, reward: { ...itemOut(item, l, gender), duplicate } };
}
export function cosmeticEquip(g: Game, who: string | Session, body: unknown) {
  const s = active(g, who); if (hasError(s)) return s;
  if (limit(s)) return fail("in-duel");
  const b = body as { id?: unknown; world?: unknown } | null, item = COSMETIC_BY_ID.get(canonicalCosmeticId(String(b?.id)));
  const world = b?.world === undefined ? (s.world === 0 ? 0 : 1) : b.world;
  if (!item || (world !== 0 && world !== 1)) return fail("bad-request", 400);
  const a = accountCopy(g, s.acct); if (!a || !profile(a, s)) return fail("no-character");
  const l = ledger(a), p = profile(a, s)!;
  if (!l.owned.includes(item.id)) return fail("not-owned", 403);
  const parts = PP.avatarParts(p, world), gender = parts[0] === 1 ? "female" : "male";
  const variant = item.variants.find((v) => v.gender === gender && v.worlds.includes(world));
  if (!variant) return fail("no-compatible-variant");
  project(p, l); parts[item.slot] = variant.number;
  (p.avatar ??= {})[world === 0 ? "a" : "b"] = Buffer.from(parts).toString("hex");
  g.store.commit({}, { [s.acct]: a });
  pushOwnership(g, s, p);
  s.partsW.set(world, parts);
  const c = s.lobby;
  if (c && !c.closed) {
    const msg = new W().u32(s.pid!).u32(world).raw(parts).bytes();
    c.post(0x4181, msg);
    if (world === (s.world ?? 1)) {
      const input = new W().u32(world).raw(parts).bytes();
      g.hub.onLobbyMsg(c, 0x4170, input);
    }
  }
  return { ...state(g, s, a, l), equipped: { id: item.id, world, parts: [...parts] } };
}
function lines(value: unknown): Line[] | null {
  if (!Array.isArray(value) || value.length > 10) return null;
  const totals = new Map<string, number>();
  for (const row of value) {
    if (!row || typeof row !== "object" || typeof row.id !== "string" || !Number.isInteger(row.count) || row.count < 1 || row.count > 99) return null;
    const id = canonicalCosmeticId(row.id);
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
  const give = lines(b.give), want = lines(b.want), other = g.hub.byPid(Number(b.targetPid));
  if (!give || !want || !give.length || !other || other === s || other.acct === s.acct || other.slot === null || !other.lobby || other.lobby.closed) return fail("bad-offer", 400);
  if (isFree(other) || limit(other) || g.tp?.isTrading(other) || (g.admin.flagsOf(other.acct) & 0x40)) return fail("unavailable");
  const a = accountCopy(g, s.acct), otherAccount = accountCopy(g, other.acct);
  if (!a || !otherAccount || !profile(a, s) || !profile(otherAccount, other)) return fail("no-character");
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
  const updates: { world: number; parts: Uint8Array }[] = [];
  const requestedGender = b.gender === "male" ? 0 : b.gender === "female" ? 1 : null;
  if (requestedGender !== null) for (const w of [0, 1]) {
    const old = PP.avatarParts(p, w), parts = old.slice(), oldBase = old[0] === 1 ? 256 : 0;
    parts[0] = requestedGender;
    for (let slot = 1; slot <= 9; slot++) {
      if (old[0] === requestedGender) continue;
      if ([2, 9].includes(slot) && old[slot] === 32) { parts[slot] = 32; continue; }
      const previous = AVATAR_ROWS[String(oldBase + old[slot])], family = COSMETIC_BY_BIT.get(oldBase + old[slot]);
      const variant = family?.variants.find((v) => v.gender === (requestedGender ? "female" : "male") && v.worlds.includes(w));
      const sameName = !family && previous ? Object.entries(AVATAR_ROWS).find(([bit, row]) => row[2] === requestedGender + 1 && row[3] === slot && row[4] === previous[4] && rowAllowed(p, Number(bit), w))?.[1] : null;
      const fallback = Object.entries(AVATAR_ROWS).find(([bit, row]) => row[1] && row[2] === requestedGender + 1 && row[3] === slot && rowAllowed(p, Number(bit), w))?.[1];
      parts[slot] = variant?.number ?? sameName?.[0] ?? fallback?.[0] ?? ([2, 9].includes(slot) ? 32 : 0);
    }
    if (!validAppearance(p, w, parts)) return fail("invalid-appearance", 400);
    updates.push({ world: w, parts });
  }
  if (b.parts !== undefined) {
    const parts = Uint8Array.from(b.parts as number[]);
    if (requestedGender !== null && parts[0] !== requestedGender) return fail("gender-conflict", 400);
    if (!validAppearance(p, world, parts)) return fail("unowned-or-invalid-appearance", 403);
    const previous = updates.findIndex((u) => u.world === world);
    if (previous >= 0) updates.splice(previous, 1);
    updates.push({ world, parts });
  }
  if (!updates.length) return fail("bad-request", 400);
  for (const u of updates) (p.avatar ??= {})[u.world === 0 ? "a" : "b"] = Buffer.from(u.parts).toString("hex");
  g.store.commit({}, { [s.acct]: a }); pushOwnership(g, s, p);
  for (const u of updates) {
    s.partsW.set(u.world, u.parts);
    const c = s.lobby;
    if (c && !c.closed) {
      c.post(0x4181, new W().u32(s.pid!).u32(u.world).raw(u.parts).bytes());
      if (u.world === (s.world ?? 1)) g.hub.onLobbyMsg(c, 0x4170, new W().u32(u.world).raw(u.parts).bytes());
    }
  }
  return { ...state(g, s, a, l), appearanceUpdated: true };
}
