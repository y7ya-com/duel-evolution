import { afterEach, describe, expect, it, vi } from "vitest";
import { configFrom } from "../src/config.ts";
import { buildServer } from "../src/server.ts";
import { Session } from "../src/game/hub.ts";
import * as PP from "../src/game/persist.ts";
import { rowsToState, stateToRows } from "../src/db/project.ts";
import { BOXES, COSMETICS, COSMETIC_BY_ID, DROP_EXCLUSIONS, expandCosmeticBits, cosmeticPool, outfitArtworkId, AVATAR_ROWS,
  BODY_WIP_NOTICE, BOX_BODY_NOTICE, SPLIT_FAMILIES, MERGED_FAMILIES, boxDisclosure, resolveCosmeticId } from "../src/game/cosmetics-catalog.ts";
import { cosmeticInfo, cosmeticOpen, cosmeticEquip, cosmeticAppearance, cosmeticTrade, cosmeticTradeAccept, cosmeticTradeCancel, syncCosmeticOwnership } from "../src/game/cosmetics.ts";

function fixture() {
  PP.setProgression(true);
  const accounts = Object.fromEntries(["alice", "bob", "eve"].map((name, i) => {
    const p = PP.blankProfile(name); p.prog = 1; p.rec.mp = 15000; p.mp_wallet = { version: 1, bound: 5000 };
    return [name, { idx: i + 1, user_id: `user-${name}`, active_slot: 0, players: { "0": name }, profiles: { "0": p } }];
  }));
  const srv = buildServer(configFrom({ PROGRESSION: "1", PVP_TEST: "1", PARITY_SEED: "1" }), { accounts }, () => {});
  const sessions = ["alice", "bob", "eve"].map((name, i) => {
    const s = new Session(name, i + 1, false); s.slot = 0; s.pid = 1000 + 4 * (i + 1); s.name = name; s.world = 0; s.state = 0;
    const messages: [number, Uint8Array][] = [];
    s.lobby = { closed: false, post: (id: number, data: Uint8Array) => messages.push([id, data]), sess: s, port: 5730 } as any;
    srv.game.hub.sessions.set(name, s); return { s, messages };
  });
  return { ...srv, sessions, a: sessions[0].s, b: sessions[1].s, e: sessions[2].s };
}
function raw(f: ReturnType<typeof fixture>) { return f.game.store.loadRaw(); }
function mutate(f: ReturnType<typeof fixture>, fn: (st: any) => void) { const st = raw(f); fn(st); f.game.store.saveRaw(st); }
function open(f: ReturnType<typeof fixture>, boxId = "outfit", s = f.a): any {
  const state = cosmeticInfo(f.game, s) as any;
  return cosmeticOpen(f.game, s, { boxId, requestId: state.nextRequestId });
}
/** Each open draws a rarity (`tier`, an offset into the effective weights) then an item index (`item`). */
function roll(tier: number, item = 0) {
  let n = 0;
  vi.spyOn(crypto, "getRandomValues").mockImplementation(((a: Uint32Array) => { a[0] = n++ % 2 === 0 ? tier : item; return a; }) as any);
}
function copies(f: ReturnType<typeof fixture>, who: "alice" | "bob", id: string, count: number, owned = true) {
  cosmeticInfo(f.game, who === "alice" ? f.a : f.b);
  mutate(f, st => { const l = st.accounts[who].cosmetics; if (owned && !l.owned.includes(id)) l.owned.push(id); l.copies[id] = count; });
}
afterEach(() => { vi.restoreAllMocks(); PP.setProgression(false); });

describe("cosmetic box money, custody and persistent pity", () => {
  it("earned-only purchases preserve the entire promotional balance and use cryptographic server rolls", () => {
    const f = fixture(); roll(0);
    const out = open(f);
    expect(out.error).toBeUndefined();
    const price = BOXES.find((b) => b.id === "outfit")!.price;
    expect(out.wallet).toEqual({ total: 15000 - price, bound: 5000, earned: 10000 - price });
    expect(out.reward.duplicate).toBe(false); expect(out.reward.copies).toBe(0);
    expect(raw(f).accounts.alice.profiles["0"].pbin).toEqual(expect.arrayContaining(out.reward.variants.map((v: any) => v.bit)));
  });
  it("cannot pay with starter MP, rejects forged requests, and leaves rejected transactions unchanged", () => {
    const f = fixture(); mutate(f, st => { st.accounts.alice.profiles["0"].rec.mp = 5500; });
    const before = raw(f);
    expect(cosmeticOpen(f.game, f.a, { boxId: "outfit", requestId: "0" })).toMatchObject({ error: "insufficient-earned-mp" });
    for (const body of [{ boxId: "arbitrary", requestId: "0" }, { boxId: "hair", requestId: "fake" }]) expect(cosmeticOpen(f.game, f.a, body)).toMatchObject({ error: "bad-request" });
    expect(raw(f)).toEqual(before);
  });
  it("retries give the original result without any second debit or duplicate, including after a D1 round trip", () => {
    const f = fixture(); roll(0);
    const first = open(f), committed = raw(f);
    expect(cosmeticOpen(f.game, f.a, { boxId: "outfit", requestId: "0" })).toMatchObject({ requestId: "0", replay: true, reward: { id: first.reward.id, duplicate: false } });
    expect(raw(f)).toEqual(committed);
    f.game.store.saveRaw(rowsToState(stateToRows(committed)));
    expect(cosmeticOpen(f.game, f.a, { boxId: "outfit", requestId: "0" })).toMatchObject({ replay: true });
    expect(raw(f).accounts.alice.profiles["0"].rec.mp).toBe(15000 - BOXES.find((b) => b.id === "outfit")!.price);
    expect(cosmeticOpen(f.game, f.a, { boxId: "hair", requestId: "0" })).toMatchObject({ error: "request-conflict" });
  });
  it("rejects compacted historical request tokens rather than charging them again", () => {
    const f = fixture(); cosmeticInfo(f.game, f.a);
    mutate(f, st => { st.accounts.alice.cosmetics.sequence = 100; });
    const before = raw(f);
    expect(cosmeticOpen(f.game, f.a, { boxId: "hair", requestId: "1" })).toMatchObject({ error: "stale-request" });
    expect(raw(f)).toEqual(before);
  });
  it("represents repeated pulls as tradable extra copies and never converts legacy ownership into free copies", () => {
    const f = fixture(); roll(0);
    mutate(f, st => { st.accounts.alice.profiles["0"].pbin.push(116); });
    const initial = cosmeticInfo(f.game, f.a) as any;
    expect(initial.inventory.find((i: any) => i.id === "outfit:tracksuit-red")).toMatchObject({ owned: true, copies: 0 });
    expect(cosmeticTrade(f.game, f.a, { targetPid: f.b.pid, requestId: "legacy-test", give: [{ id: "outfit:tracksuit-red", count: 1 }], want: [] })).toMatchObject({ error: "insufficient-duplicates" });
    const out = open(f); expect(out.reward).toMatchObject({ id: "outfit:tracksuit-red", duplicate: true, copies: 1 });
    expect(raw(f).accounts.alice.cosmetics.copies["outfit:tracksuit-red"]).toBe(1);
  });
  it("enforces both pity counters with published next-pull odds and survives character replacement", () => {
    const f = fixture(); cosmeticInfo(f.game, f.a); roll(0);
    mutate(f, st => { st.accounts.alice.cosmetics.pity.outfit = { superMisses: 9, ultraMisses: 8 }; });
    const outfit = BOXES.find((b) => b.id === "outfit")!, share = outfit.weights.super + outfit.weights.ultra;
    const next = (cosmeticInfo(f.game, f.a) as any).boxes.find((b: any) => b.id === "outfit").nextOdds;
    expect(next).toMatchObject({ common: 0, rare: 0 });
    expect(next.super).toBeCloseTo(100 * outfit.weights.super / share); expect(next.ultra).toBeCloseTo(100 * outfit.weights.ultra / share);
    expect(open(f).reward.rarity).toBe("super");
    mutate(f, st => { st.accounts.alice.cosmetics.pity.outfit = { superMisses: 2, ultraMisses: 19 }; st.accounts.alice.profiles["0"] = PP.blankProfile("replacement"); st.accounts.alice.profiles["0"].rec.mp = 10000; });
    expect(open(f).reward.rarity).toBe("ultra");
    expect(raw(f).accounts.alice.cosmetics.pity.outfit).toEqual({ superMisses: 0, ultraMisses: 0 });
  });
  it("publishes the same pool for either body and renormalises the odds of a rarity with no eligible item", () => {
    const f = fixture();
    mutate(f, st => { st.accounts.bob.profiles["0"].avatar = { a: "0100203040607090b020000000000000" }; });
    const info = cosmeticInfo(f.game, f.a) as any, female = cosmeticInfo(f.game, f.b) as any;
    expect(info.appearance.gender).toBe("male"); expect(female.appearance.gender).toBe("female");
    for (const box of BOXES) {
      const ids = (out: any) => out.boxes.find((b: any) => b.id === box.id).pool.map((i: any) => i.id);
      expect(ids(info).length).toBeGreaterThan(0); expect(ids(female)).toEqual(ids(info));
      expect(ids(info)).toEqual(cosmeticPool(box.id).map((i) => i.id));
      const out = info.boxes.find((b: any) => b.id === box.id);
      expect(out.available).toBe(true);
      expect(Object.values(out.baseOdds as Record<string, number>).reduce((a, b) => a + b, 0)).toBeCloseTo(100);
      for (const [tier, row] of Object.entries(out.poolByRarity as Record<string, any>)) {
        expect(row.count).toBe(out.pool.filter((i: any) => i.rarity === tier).length);
        if (!row.count) expect(out.baseOdds[tier]).toBe(0);
        for (const item of out.pool.filter((i: any) => i.rarity === tier)) expect(item.baseChance).toBeCloseTo(row.perItem);
      }
    }
    // A box whose rare tier had no eligible item: its weight is shared out, not silently moved to one tier.
    const rares = COSMETICS.filter((i) => i.kind === "outfit" && i.rarity === "rare");
    expect(rares.length).toBeGreaterThan(0);
    for (const i of rares) i.rarity = "common";
    try {
      const outfit = BOXES.find((b) => b.id === "outfit")!, live = boxDisclosure(outfit);
      const kept = outfit.weights.common + outfit.weights.super + outfit.weights.ultra;
      expect(live.poolByRarity.rare.count).toBe(0); expect(live.configuredOdds.rare).toBeGreaterThan(0);
      expect(live.baseOdds.common).toBeCloseTo(100 * outfit.weights.common / kept);
      expect(live.baseOdds.ultra).toBeCloseTo(100 * outfit.weights.ultra / kept);
    } finally { for (const i of rares) i.rarity = "rare"; }
    for (const bit of [131, 132, 133, 134, 387, 388, 389, 390]) expect(COSMETICS.some((i) => i.variants.some((v) => v.bit === bit))).toBe(false);
  });
  it("refuses a broken configured rarity pool before taking currency or advancing pity", () => {
    const f = fixture(), before = raw(f);
    // An Outfit Box whose ultra tier is empty cannot honour its ultra pity, so it must not sell.
    const ultras = COSMETICS.filter((i) => i.kind === "outfit" && i.rarity === "ultra" && !DROP_EXCLUSIONS.has(i.id));
    for (const i of ultras) i.rarity = "super";
    try {
      mutate(f, st => { st.accounts.alice.profiles["0"].avatar = { a: "0100203040607090b020000000000000" }; });
      const prepared = raw(f);
      expect(cosmeticOpen(f.game, f.a, { boxId: "outfit", requestId: "0" })).toMatchObject({ error: "unavailable-pool" });
      expect(raw(f)).toEqual(prepared);
    } finally { for (const i of ultras) i.rarity = "ultra"; }
    expect(raw(f).accounts.alice.profiles["0"].rec.mp).toBe(before.accounts.alice.profiles["0"].rec.mp);
  });
  it("rejects unauthenticated, restarting and mid-duel requests without touching the wallet", () => {
    const f = fixture(), before = raw(f);
    expect(cosmeticInfo(f.game, "not-a-user")).toMatchObject({ error: "not-in-game" });
    f.a.state = 0x67;
    expect(cosmeticOpen(f.game, f.a, { boxId: "outfit", requestId: "0" })).toMatchObject({ error: "in-duel" });
    f.a.state = 0; f.game.restarting = true;
    expect(cosmeticOpen(f.game, f.a, { boxId: "outfit", requestId: "0" })).toMatchObject({ error: "server-restarting" });
    expect(raw(f)).toEqual(before);
  });
});

describe("a design owns every real body equivalent", () => {
  it("maps actual variants, not same numbered unrelated art; projects family ownership after gender changes", () => {
    expect(expandCosmeticBits([119])).toEqual([119, 372]);
    expect(expandCosmeticBits([116])).toEqual([116]); // Tracksuit Red and Punk Red are two designs.
    expect(expandCosmeticBits([10])).toEqual([10, 11, 12, 261, 262, 263]); // Afro I-III: one item (MERGED_FAMILIES)
    expect(expandCosmeticBits([13])).toEqual([13, 265]);                    // Afro IV: its own
    expect(outfitArtworkId(0x79, false)).toBe("dc_04_c01");
    expect(outfitArtworkId(0x76, true)).toBe("dc_04_c01");
    expect(expandCosmeticBits([121])).toEqual([121]); expect(expandCosmeticBits([374])).toEqual([374]); // Yugi/Téa share dc_04 art only.
    expect(expandCosmeticBits([122])).toEqual([122]); // Kaiba's dc05 art is genuinely male-only.
    const f = fixture(); mutate(f, st => { st.accounts.alice.profiles["0"].pbin.push(124); });
    cosmeticInfo(f.game, f.a);
    mutate(f, st => { st.accounts.alice.profiles["0"].avatar = { a: "0100203040607090b020000000000000" }; });
    const pbin = vi.fn(); f.a.conns.set(f.game.ports.game, { closed: false, post: pbin } as any);
    const out = cosmeticEquip(f.game, f.a, { id: "outfit:marik", world: 0 }) as any;
    expect(out.error).toBeUndefined(); expect(out.equipped.parts[0]).toBe(1); expect(out.equipped.parts[6]).toBe(0x77);
    expect(raw(f).accounts.alice.profiles["0"].pbin).toEqual(expect.arrayContaining([124, 375]));
    expect(pbin).toHaveBeenCalledWith(0x3114, expect.any(Uint8Array));
    expect(f.sessions[0].messages.some(([id, bytes]) => id === 0x4181 && bytes.length === 24 && bytes[8] === 1 && bytes[14] === 0x77)).toBe(true);
  });
  it("one look: equipping from the other world changes both worlds' looks, the visible current one too", () => {
    const f = fixture(); f.a.world = 1;
    mutate(f, st => { st.accounts.alice.profiles["0"].pbin.push(119); });
    cosmeticInfo(f.game, f.a);
    const current = new Uint8Array(16); current[6] = 0x80; f.a.parts = current;
    const out = cosmeticEquip(f.game, f.a, { id: "outfit:black-suit", world: 0 }) as any;
    expect(out.equipped.parts[6]).toBe(0x77); expect(f.a.world).toBe(1); expect(f.a.parts[6]).toBe(0x77);
    expect([f.a.partsW.get(0)?.[6], f.a.partsW.get(1)?.[6]]).toEqual([0x77, 0x77]);
    const saved = raw(f).accounts.alice.profiles["0"].avatar;
    expect(saved.a).toBe(saved.b); expect(saved.w).toBe(0);                  // both copies; the world it was put on in
    expect(cosmeticEquip(f.game, f.a, { id: "outfit:black-suit", world: 1 })).toMatchObject({ equipped: { id: "outfit:black-suit" } });
    expect(raw(f).accounts.alice.profiles["0"].avatar.w).toBe(1);
  });
  it("has no free default migration or tradable copy for counterpart projection on a new character", () => {
    const f = fixture(); mutate(f, st => { st.accounts.alice.profiles["0"].pbin.push(119); });
    cosmeticInfo(f.game, f.a);
    const p = PP.blankProfile("new"); syncCosmeticOwnership(f.game, f.a, p);
    expect(p.pbin).toEqual(expect.arrayContaining([119, 372]));
    expect(raw(f).accounts.alice.cosmetics.copies).toEqual({});
  });
  it("changes body without losing design ownership and keeps real equivalent artwork equipped", () => {
    const f = fixture();
    mutate(f, st => { const p = st.accounts.alice.profiles["0"]; p.pbin.push(119); p.avatar = { a: "0000203040607790b020000000000000" }; });
    const result = cosmeticAppearance(f.game, f.a, { gender: "female" }) as any;
    expect(result.error).toBeUndefined();
    expect(result.appearance.looks["0"][0]).toBe(1); expect(result.appearance.looks["1"][0]).toBe(1);
    expect(result.appearance.looks["0"][6]).toBe(0x74); // male Black Suit -> female Black Suit.
    expect(result.inventory.find((i: any) => i.id === "outfit:black-suit")).toMatchObject({ owned: true, copies: 0, bodies: ["male", "female"] });
    expect(cosmeticAppearance(f.game, f.a, { gender: "male" })).toMatchObject({ appearanceUpdated: true });
    expect(PP.avatarParts(raw(f).accounts.alice.profiles["0"], 0)[6]).toBe(0x77);
  });
  it("a split single-body outfit is not swapped for the other body's former partner on a body change", () => {
    const f = fixture(); cosmeticInfo(f.game, f.a); // the ledger exists (split-migrated) before the bit arrives
    mutate(f, st => { const p = st.accounts.alice.profiles["0"]; p.pbin.push(116); p.avatar = { a: "0000203040607490b020000000000000" }; });
    const result = cosmeticAppearance(f.game, f.a, { gender: "female" }) as any;
    expect(result.appearance.looks["0"][6]).toBe(0x70); // Tracksuit Red has no female version: the free uniform.
    expect(result.inventory.find((i: any) => i.id === "outfit:tracksuit-red")).toMatchObject({ owned: true, compatible: false, bodies: ["male"], notice: BODY_WIP_NOTICE.female });
    expect(result.inventory.some((i: any) => i.id === "outfit:punk-red")).toBe(false);
  });
  it("preserves a missing-body named design but uses an honest default, and validates full appearance edits", () => {
    const f = fixture();
    mutate(f, st => { const p = st.accounts.alice.profiles["0"]; p.pbin.push(122); p.avatar = { a: "0000203040607a90b020000000000000" }; });
    const result = cosmeticAppearance(f.game, f.a, { gender: "female" }) as any;
    expect(result.appearance.looks["0"][6]).toBe(0x70);
    expect(result.inventory.find((i: any) => i.id === "outfit:kaiba")).toMatchObject({ owned: true, compatible: false, bodies: ["male"], notice: BODY_WIP_NOTICE.female });
    const before = raw(f), parts = result.appearance.looks["0"].slice(); parts[6] = 0x77; // Marik not owned.
    expect(cosmeticAppearance(f.game, f.a, { world: 0, parts })).toMatchObject({ error: "unowned-or-invalid-appearance" });
    parts[6] = 0x70; parts[14] = 7;
    expect(cosmeticAppearance(f.game, f.a, { world: 0, parts })).toMatchObject({ error: "unowned-or-invalid-appearance" });
    expect(raw(f)).toEqual(before);
    parts[14] = 6; parts[13] = 2;
    expect(cosmeticAppearance(f.game, f.a, { world: 0, parts })).toMatchObject({ appearanceUpdated: true });
  });
  it("keeps rank uniforms gated by the PvP rating, not LV, in the shortcut editor (test/ranking.test.ts has the rest)", () => {
    const f = fixture(); const info = cosmeticInfo(f.game, f.a) as any;
    const parts = info.appearance.looks["1"].slice(); parts[6] = 0x81;
    expect(cosmeticAppearance(f.game, f.a, { world: 1, parts })).toMatchObject({ error: "unowned-or-invalid-appearance" });
    mutate(f, st => { st.accounts.alice.profiles["0"].rec.lv = 10; });   // the 2008 LV 10 gate no longer opens it
    expect(cosmeticAppearance(f.game, f.a, { world: 1, parts })).toMatchObject({ error: "unowned-or-invalid-appearance" });
    mutate(f, st => { st.accounts.alice.profiles["0"].rank = { rating: 1600, rd: 80, vol: 0.06, games: 5, school: "ra", last: Date.now() }; });
    expect(cosmeticAppearance(f.game, f.a, { world: 1, parts })).toMatchObject({ appearanceUpdated: true });
  });
  it("splits Yami Yugi's and Téa's garms: one dc_04 art slot, two designs, each single-body", () => {
    expect(outfitArtworkId(0x79, false)).toBe("dc_04_c01"); expect(outfitArtworkId(0x76, true)).toBe("dc_04_c01");
    expect(COSMETIC_BY_ID.get("outfit:yugi")).toMatchObject({ name: "Yami Yugi's Garms", rarity: "ultra", variants: [{ gender: "male", bit: 121 }] });
    expect(COSMETIC_BY_ID.get("outfit:tea")).toMatchObject({ name: "Téa's Garms", rarity: "ultra", variants: [{ gender: "female", bit: 374 }] });
    expect(COSMETIC_BY_ID.has("outfit:fitted-duelist")).toBe(false);
    const f = fixture();
    mutate(f, st => { const p = st.accounts.alice.profiles["0"]; p.pbin.push(121); p.avatar = { a: "0000203040607990b020000000000000" }; });
    cosmeticInfo(f.game, f.a);
    mutate(f, st => { st.accounts.alice.cosmetics.owned = ["outfit:yugi"]; st.accounts.alice.profiles["0"].pbin = st.accounts.alice.profiles["0"].pbin.filter((b: number) => b !== 374); });
    const female = cosmeticAppearance(f.game, f.a, { gender: "female" }) as any;
    expect(female.appearance.looks["0"][6]).toBe(0x70); // no Téa's garms for a Yugi-only owner after the split
    expect(female.inventory.find((i: any) => i.id === "outfit:yugi")).toMatchObject({ owned: true, compatible: false, notice: BODY_WIP_NOTICE.female });
  });
});

describe("cosmetic offers are consented, escrowed and replay safe", () => {
  it("escrows extras once; only the named recipient can accept; swaps both sides atomically", () => {
    const f = fixture(); const give = "outfit:black-suit", want = "outfit:marik";
    copies(f, "alice", give, 2); copies(f, "bob", want, 1);
    const request = { targetPid: f.b.pid, requestId: "trade-0001", give: [{ id: give, count: 1 }], want: [{ id: want, count: 1 }] };
    const created = cosmeticTrade(f.game, f.a, request) as any; expect(created.error).toBeUndefined();
    expect(raw(f).accounts.alice.cosmetics.copies[give]).toBe(1);
    const replay = cosmeticTrade(f.game, f.a, request) as any; expect(replay.offer.id).toBe(created.offer.id); expect(raw(f).accounts.alice.cosmetics.copies[give]).toBe(1);
    expect(cosmeticTradeAccept(f.game, f.e, { offerId: created.offer.id })).toMatchObject({ error: "not-found" });
    const before = raw(f); const commit = vi.spyOn(f.game.store, "commit");
    const out = cosmeticTradeAccept(f.game, f.b, { offerId: created.offer.id }) as any; expect(out.offer.status).toBe("accepted");
    expect(commit).toHaveBeenCalledTimes(1); expect(Object.keys(commit.mock.calls[0][1]!)).toEqual(expect.arrayContaining(["alice", "bob"]));
    const after = raw(f);
    expect(after.accounts.alice.cosmetics.owned).toContain(want); expect(after.accounts.bob.cosmetics.owned).toContain(give);
    expect(after.accounts.bob.cosmetics.copies[want]).toBe(0);
    expect(cosmeticTradeAccept(f.game, f.b, { offerId: created.offer.id })).toMatchObject({ replay: true });
    expect(raw(f)).toEqual(after); expect(before.accounts.alice.cosmetics.owned).not.toContain(want);
  });
  it("rejects overcommit and changed offers; cancel/expiry return exactly the escrowed copies", () => {
    const f = fixture(); const id = "hair:afro"; copies(f, "alice", id, 1);
    const request = { targetPid: f.b.pid, requestId: "trade-0002", give: [{ id, count: 1 }], want: [] };
    const out = cosmeticTrade(f.game, f.a, request) as any;
    expect(cosmeticTrade(f.game, f.a, { ...request, requestId: "trade-0003" })).toMatchObject({ error: "insufficient-duplicates" });
    expect(cosmeticTrade(f.game, f.a, { ...request, give: [{ id, count: 2 }] })).toMatchObject({ error: "request-conflict" });
    expect(cosmeticTradeCancel(f.game, f.e, { offerId: out.offer.id })).toMatchObject({ error: "not-found" });
    cosmeticTradeCancel(f.game, f.b, { offerId: out.offer.id }); cosmeticTradeCancel(f.game, f.a, { offerId: out.offer.id });
    expect(raw(f).accounts.alice.cosmetics.copies[id]).toBe(1);
    const next = cosmeticTrade(f.game, f.a, { ...request, requestId: "trade-0004" }) as any;
    mutate(f, st => { st.accounts.alice.cosmetics.offers[next.offer.id].expiresAt = 0; });
    cosmeticInfo(f.game, f.a);
    expect(raw(f).accounts.alice.cosmetics.copies[id]).toBe(1);
    expect(cosmeticTradeAccept(f.game, f.b, { offerId: next.offer.id })).toMatchObject({ error: "offer-closed" });
  });
  it("keeps escrow intact when requested copies disappear and survives a D1 trade round trip", () => {
    const f = fixture(), id = "outfit:black-suit", want = "hair:afro";
    copies(f, "alice", id, 1); copies(f, "bob", want, 1);
    const created = cosmeticTrade(f.game, f.a, { targetPid: f.b.pid, requestId: "trade-0005", give: [{ id, count: 1 }], want: [{ id: want, count: 1 }] }) as any;
    f.game.store.saveRaw(rowsToState(stateToRows(raw(f))));
    mutate(f, st => { st.accounts.bob.cosmetics.copies[want] = 0; });
    const before = raw(f);
    expect(cosmeticTradeAccept(f.game, f.b, { offerId: created.offer.id })).toMatchObject({ error: "insufficient-duplicates" });
    expect(raw(f)).toEqual(before);
    expect(raw(f).accounts.alice.cosmetics.copies[id]).toBe(0);
    cosmeticTradeCancel(f.game, f.a, { offerId: created.offer.id });
    expect(raw(f).accounts.alice.cosmetics.copies[id]).toBe(1);
  });
});

describe("every wearable comes from a box, one item per real design", () => {
  const SINGLE_BODY = ["hair:skinhead", "hair:quiff-1", "hair:quiff-2", "hair:quiff-3", "hair:ponytail", "accessory:plaster",
    "accessory:red-specs", "accessory:black-specs", "accessory:brown-specs", "accessory:blue-specs", "accessory:pink-specs", "accessory:frameless-specs",
    "outfit:kaiba", "outfit:joey", "outfit:yugi", "outfit:tea", "outfit:tracksuit-red", "outfit:tracksuit-green", "outfit:tracksuit-yellow",
    "outfit:punk-red", "outfit:punk-yellow", "outfit:punk-blue"];
  const ACADEMY = ["outfit:jaden", "outfit:chazz", "outfit:jesse", "outfit:kaiser", "outfit:aster"];
  const pools = () => BOXES.flatMap((box) => cosmeticPool(box.id));
  it("drops single-body items for everyone and withholds only Duel Academy outfits", () => {
    expect([...DROP_EXCLUSIONS.keys()].sort()).toEqual([...ACADEMY].sort());
    for (const id of SINGLE_BODY) {
      expect(pools().some((i) => i.id === id), id).toBe(true);
      expect(COSMETIC_BY_ID.get(id)!.variants.map((v) => v.gender)).toHaveLength(1);
    }
    // Exactly these pool items miss a body; everything else in a box has both.
    expect(pools().filter((i) => new Set(i.variants.map((v) => v.gender)).size === 1).map((i) => i.id).sort()).toEqual([...SINGLE_BODY].sort());
    // Glasses pair by the client's item text, not by art index (male a2_02_c01 is red, female a2_02_c01 green).
    expect(expandCosmeticBits([82])).toEqual([82, 337]); expect(expandCosmeticBits([81])).toEqual([81]);
    expect(expandCosmeticBits([80])).toEqual([80, 336]); expect(expandCosmeticBits([84])).toEqual([84, 342]);
    expect(expandCosmeticBits([177])).toEqual([177, 433]); // duel disks: one design, two body bits
  });
  it("withdraws Duel Academy outfits from every box while owners keep, equip and trade them", () => {
    for (const item of pools()) expect(item.artwork?.startsWith("ac_") ?? false, item.id).toBe(false);
    for (const item of pools()) for (const v of item.variants) expect(AVATAR_ROWS[String(v.bit)][5] === 3 && item.kind === "outfit", item.id).toBe(false);
    for (const id of ACADEMY) expect(DROP_EXCLUSIONS.get(id)).toMatch(/Duel Academy/);
    // School uniforms (series 3 outfits without a character) are not even in the catalog.
    for (const bit of [128, 129, 130, 131, 132, 133, 134, 384, 385, 386, 387, 388, 389, 390]) expect(pools().some((i) => i.variants.some((v) => v.bit === bit))).toBe(false);
    // Academy duel disks are not outfits: they stay in the Duel Disk Box.
    expect(cosmeticPool("dueldisk").some((i) => i.id === "dueldisk:3450")).toBe(true);
    const f = fixture(); f.a.world = 1;
    mutate(f, st => { st.accounts.alice.profiles["0"].pbin.push(135); });
    expect((cosmeticInfo(f.game, f.a) as any).inventory.find((i: any) => i.id === "outfit:jaden")).toMatchObject({ owned: true, copies: 0 });
    const out = cosmeticEquip(f.game, f.a, { id: "outfit:jaden", world: 1 }) as any;
    expect(out.error).toBeUndefined(); expect(out.equipped.parts[6]).toBe(0x87);
    copies(f, "alice", "outfit:jaden", 1);
    expect(cosmeticTrade(f.game, f.a, { targetPid: f.b.pid, requestId: "academy-01", give: [{ id: "outfit:jaden", count: 1 }], want: [] })).toMatchObject({ offer: { status: "pending" } });
  });
  it("drops head accessories, not only hair, from the Head & Hair Accessory Box", () => {
    const head = cosmeticPool("head").map((i) => i.id);
    expect(head).toEqual(expect.arrayContaining(["hair:afro", "hair:afro-4", "accessory:sunglasses", "accessory:green-specs", "accessory:bakura"]));
    const f = fixture(); roll(99); // the last unit of weight: ultra
    const out = open(f, "head");
    expect(out.reward).toMatchObject({ id: "accessory:bakura", kind: "accessory", slot: 9, rarity: "ultra", duplicate: false });
    expect(raw(f).accounts.alice.profiles["0"].pbin).toEqual(expect.arrayContaining([84, 342]));
    expect(cosmeticEquip(f.game, f.a, { id: "accessory:bakura", world: 0 })).toMatchObject({ equipped: { parts: expect.any(Array) } });
    expect(PP.avatarParts(raw(f).accounts.alice.profiles["0"], 0)[9]).toBe(0x54);
  });
  it("counts either body's variant as the same design: owning the male one makes the female roll a duplicate", () => {
    const f = fixture();
    mutate(f, st => { const p = st.accounts.alice.profiles["0"]; p.pbin.push(119, 80); p.avatar = { a: "0100203040607090b020000000000000" }; });
    const rares = cosmeticPool("outfit").filter((i) => i.rarity === "rare").map((i) => i.id);
    roll(BOXES.find((b) => b.id === "outfit")!.weights.common, rares.indexOf("outfit:black-suit"));
    const outfit = open(f);
    expect(outfit.reward).toMatchObject({ id: "outfit:black-suit", duplicate: true, copies: 1 });
    expect(outfit.reward.variants.map((v: any) => v.bit)).toEqual([119, 372]);
    vi.restoreAllMocks();
    const rare = cosmeticPool("head").filter((i) => i.rarity === "rare").map((i) => i.id);
    const head = BOXES.find((b) => b.id === "head")!;
    roll(head.weights.common, rare.indexOf("accessory:sunglasses"));
    expect(open(f, "head").reward).toMatchObject({ id: "accessory:sunglasses", duplicate: true, copies: 1 });
    expect(raw(f).accounts.alice.profiles["0"].pbin).toEqual(expect.arrayContaining([80, 336, 119, 372]));
  });
  it("can give a duplicate before the tier is complete; the extra copy is tradable", () => {
    const f = fixture(); roll(0, 0);
    const first = open(f).reward, second = open(f).reward;
    expect(first).toMatchObject({ duplicate: false, copies: 0 });
    expect(second).toMatchObject({ id: first.id, duplicate: true, copies: 1 });
    expect(cosmeticPool("outfit").filter((i) => i.rarity === "common").length).toBeGreaterThan(1);
    // A pity-guaranteed pull guarantees the rarity only: it can still repeat a design the player owns.
    const superId = cosmeticPool("outfit").find((i) => i.rarity === "super")!.id;
    copies(f, "alice", superId, 0);
    mutate(f, st => { st.accounts.alice.cosmetics.pity.outfit = { superMisses: 7, ultraMisses: 0 }; });
    expect(open(f).reward).toMatchObject({ id: superId, rarity: "super", duplicate: true, copies: 1 });
  });
  it("migrates the old hair box's pity and receipts to the head box, accepting the old id on retries", () => {
    const f = fixture(); cosmeticInfo(f.game, f.a);
    mutate(f, st => { const l = st.accounts.alice.cosmetics;
      l.pity = { hair: { superMisses: 9, ultraMisses: 0 } }; l.sequence = 1; l.receipts = { "0": { boxId: "hair", id: "hair:afro-1", duplicate: false } }; l.owned = ["hair:afro-1"]; });
    const info = cosmeticInfo(f.game, f.a) as any, l = raw(f).accounts.alice.cosmetics;
    // 9 misses under the old superAt 10 meant "next is guaranteed"; it clamps to the new superAt - 1.
    const head = BOXES.find((b) => b.id === "head")!;
    expect(l.pity.head).toEqual({ superMisses: head.superAt! - 1, ultraMisses: 0 }); expect(l.pity.hair).toBeUndefined(); expect(l.receipts["0"].boxId).toBe("head");
    expect(info.boxes.find((b: any) => b.id === "head").nextOdds).toMatchObject({ common: 0, rare: 0 });
    const before = raw(f);
    // the receipt named Afro I: it now names Afro (MERGED_FAMILIES), and a retry grants and charges nothing
    for (const boxId of ["hair", "head"]) expect(cosmeticOpen(f.game, f.a, { boxId, requestId: "0" })).toMatchObject({ replay: true, reward: { id: "hair:afro", duplicate: false } });
    expect(cosmeticOpen(f.game, f.a, { boxId: "outfit", requestId: "0" })).toMatchObject({ error: "request-conflict" });
    expect(raw(f)).toEqual(before);
    roll(0);
    expect((cosmeticOpen(f.game, f.a, { boxId: "hair", requestId: "1" }) as any).reward.rarity).toBe("super");
    expect(raw(f).accounts.alice.cosmetics.pity.head).toEqual({ superMisses: 0, ultraMisses: 1 }); // a super is still an ultra miss
    mutate(f, st => { st.accounts.alice.cosmetics.pity = { hair: { superMisses: 7, ultraMisses: 0 }, head: { superMisses: 3, ultraMisses: 0 } }; });
    cosmeticInfo(f.game, f.a);
    expect(raw(f).accounts.alice.cosmetics.pity).toMatchObject({ head: { superMisses: 7, ultraMisses: 0 } });
    expect(raw(f).accounts.alice.cosmetics.pity.hair).toBeUndefined();
  });
  it("still guarantees super-or-better at superAt and ultra at ultraAt with the worst possible luck", () => {
    for (const box of BOXES) {
      const f = fixture(); roll(0); mutate(f, st => { st.accounts.alice.profiles["0"].rec.mp = 5000 + box.price * 40; });
      const tiers: string[] = [];
      for (let i = 0; i < 40; i++) { const out = open(f, box.id); expect(out.error, box.id).toBeUndefined(); tiers.push(out.reward.rarity); }
      const best = (from: number, to: number, set: string[]) => tiers.slice(from, to).some((t) => set.includes(t));
      for (let i = 0; i + box.superAt! <= tiers.length; i++) expect(best(i, i + box.superAt!, ["super", "ultra"]), `${box.id}@${i}`).toBe(true);
      if (box.ultraAt) for (let i = 0; i + box.ultraAt <= tiers.length; i++) expect(best(i, i + box.ultraAt, ["ultra"]), `${box.id}@${i}`).toBe(true);
      expect(tiers[0]).toBe("common");
    }
  });
});


describe("2026-11 owner rules: split pairs, single-body drops, rarities, worlds and migration", () => {
  const female = (f: ReturnType<typeof fixture>, who: "alice" | "bob" | "eve" = "alice") =>
    mutate(f, st => { st.accounts[who].profiles["0"].avatar = { a: "0100203040607090b020000000000000" }; });
  const tierOffset = (box: string, tier: "common" | "rare" | "super" | "ultra") => {
    const w = BOXES.find((b) => b.id === box)!.weights;
    return { common: 0, rare: w.common, super: w.common + w.rare, ultra: w.common + w.rare + w.super }[tier];
  };
  it("one item per real design: a pair shares one native text and one art; the mismatched pairs are split", () => {
    for (const item of COSMETICS) {
      // Afro is the one merged item: Afro I-III's three texts (MERGED_FAMILIES)
      expect(new Set(item.variants.map((v) => AVATAR_ROWS[String(v.bit)][4])).size, item.id).toBe(item.id === "hair:afro" ? 3 : 1);
      if (item.kind === "outfit") expect(new Set(item.variants.map((v) => outfitArtworkId(v.number, v.gender === "female"))).size, item.id).toBe(1);
    }
    const pairs = COSMETICS.filter((i) => i.variants.length === 2).map((i) => i.id);
    expect(pairs.filter((id) => !id.startsWith("dueldisk:")).sort()).toEqual(["accessory:bakura", "accessory:green-specs", "accessory:sunglasses",
      "hair:afro-4", "outfit:black-suit", "outfit:marik", "outfit:qualifier-robe"]);
    expect(Object.values(SPLIT_FAMILIES).flatMap((h) => [h.male, h.female]).map((id) => [id, COSMETIC_BY_ID.get(id)!.variants.map((v) => [v.gender, v.bit])]))
      .toEqual([["outfit:tracksuit-red", [["male", 116]]], ["outfit:punk-red", [["female", 369]]], ["outfit:tracksuit-green", [["male", 117]]],
        ["outfit:punk-yellow", [["female", 370]]], ["outfit:tracksuit-yellow", [["male", 118]]], ["outfit:punk-blue", [["female", 371]]],
        ["outfit:yugi", [["male", 121]]], ["outfit:tea", [["female", 374]]]]);
    for (const old of Object.keys(SPLIT_FAMILIES)) expect(COSMETIC_BY_ID.has(old)).toBe(false);
  });
  it("sets the owner's rarities and names, and leaves the others alone", () => {
    const tier = (id: string) => COSMETIC_BY_ID.get(id)!.rarity;
    expect(tier("outfit:black-suit")).toBe("rare");
    for (const id of ["dueldisk:3454", "dueldisk:3456", "dueldisk:3457"]) expect(tier(id)).toBe("super");
    expect(tier("dueldisk:3455")).toBe("ultra");
    expect(COSMETIC_BY_ID.get("outfit:marik")).toMatchObject({ name: "Rare Hunter Cloak", rarity: "ultra", artwork: "dc_98_c01" });
    expect([tier("outfit:yugi"), tier("outfit:tea"), tier("outfit:kaiba"), tier("outfit:joey")]).toEqual(["ultra", "ultra", "super", "rare"]);
    for (const id of Object.values(SPLIT_FAMILIES).flatMap((h) => [h.male, h.female]).filter((id) => !["outfit:yugi", "outfit:tea"].includes(id))) expect(tier(id)).toBe("common");
    expect(tier("outfit:qualifier-robe")).toBe("super");
    expect(["hair:quiff-1", "hair:quiff-2", "hair:quiff-3", "hair:ponytail", "accessory:sunglasses", "accessory:bakura"].map(tier)).toEqual(["common", "rare", "super", "rare", "rare", "ultra"]);
  });
  it("publishes the per-box pool table (count per rarity, single-body in brackets)", () => {
    const table = Object.fromEntries(BOXES.map((box) => {
      const d = boxDisclosure(box);
      return [box.id, Object.fromEntries((["common", "rare", "super", "ultra"] as const).map((t) => [t, [d.poolByRarity[t].count, d.poolByRarity[t].singleBody]]))];
    }));
    expect(table).toEqual({
      head: { common: [10, 8], rare: [4, 3], super: [2, 1], ultra: [1, 0] },   // Afro I-III (c, c, r) are one Afro (c); Bald (single-body) is rare
      dueldisk: { common: [8, 0], rare: [6, 0], super: [6, 0], ultra: [7, 0] },
      outfit: { common: [6, 6], rare: [2, 1], super: [2, 1], ultra: [3, 2] },
    });
    expect(boxDisclosure(BOXES.find((b) => b.id === "outfit")!).notice).toBe(BOX_BODY_NOTICE);
  });
  it("a female who wins Kaiba's costume keeps it, gets the notice, cannot equip it and can trade the copy", () => {
    const f = fixture(); female(f);
    const supers = cosmeticPool("outfit").filter((i) => i.rarity === "super").map((i) => i.id);
    roll(tierOffset("outfit", "super"), supers.indexOf("outfit:kaiba"));
    const first = open(f);
    expect(first.reward).toMatchObject({ id: "outfit:kaiba", duplicate: false, bodies: ["male"], notice: BODY_WIP_NOTICE.female, compatible: false });
    expect(first.inventory.find((i: any) => i.id === "outfit:kaiba")).toMatchObject({ owned: true, notice: BODY_WIP_NOTICE.female });
    expect(first.boxes.find((b: any) => b.id === "outfit").pool.find((i: any) => i.id === "outfit:kaiba")).toMatchObject({ bodies: ["male"], notice: BODY_WIP_NOTICE.female });
    expect(first.boxes.find((b: any) => b.id === "outfit").notice).toBe(BOX_BODY_NOTICE);
    const before = raw(f);
    for (const world of [0, 1]) expect(cosmeticEquip(f.game, f.a, { id: "outfit:kaiba", world })).toMatchObject({
      error: "no-compatible-variant", reason: "body", bodies: ["male"], notice: BODY_WIP_NOTICE.female });
    expect(raw(f)).toEqual(before);
    expect(open(f).reward).toMatchObject({ id: "outfit:kaiba", duplicate: true, copies: 1 });
    vi.restoreAllMocks();
    const offer = cosmeticTrade(f.game, f.a, { targetPid: f.b.pid, requestId: "kaiba-0001", give: [{ id: "outfit:kaiba", count: 1 }], want: [] }) as any;
    expect(offer.offer).toMatchObject({ status: "pending", give: [{ id: "outfit:kaiba", count: 1 }] });
    expect(cosmeticTradeAccept(f.game, f.b, { offerId: offer.offer.id })).toMatchObject({ offer: { status: "accepted" } });
    expect(raw(f).accounts.alice.cosmetics.owned).toContain("outfit:kaiba"); expect(raw(f).accounts.alice.cosmetics.copies["outfit:kaiba"]).toBe(0);
    expect(raw(f).accounts.bob.cosmetics.owned).toContain("outfit:kaiba");
    expect(cosmeticEquip(f.game, f.b, { id: "outfit:kaiba", world: 0 })).toMatchObject({ equipped: { parts: expect.any(Array) } });
  });
  it("migrates an old Street Duelist / Fitted Duelist owner to every split item without multiplying copies", () => {
    const f = fixture(); female(f);
    for (const s of [f.a, f.b, f.e]) cosmeticInfo(f.game, s);
    mutate(f, st => {
      for (const who of ["alice", "bob", "eve"]) delete st.accounts[who].cosmetics.split; // ledgers written before the split
      const l = st.accounts.alice.cosmetics;
      l.owned = ["outfit:street-red", "outfit:fitted-duelist"];
      l.copies = { "outfit:street-red": 2, "outfit:tracksuit-red": 1, "outfit:fitted-duelist": 0 }; // the alias was the same pair's copies
      l.sequence = 2; l.receipts = { "0": { boxId: "outfit", id: "outfit:street-red", duplicate: true }, "1": { boxId: "outfit", id: "outfit:tea", duplicate: false } };
      l.offers = { "legacy-offer": { id: "legacy-offer", requestId: "legacy-0001", fromAcct: "alice", toAcct: "bob", fromPid: f.a.pid, fromName: "alice", toPid: f.b.pid, toName: "bob",
        status: "pending", expiresAt: 2000000000000, give: [{ id: "outfit:street-red", count: 1 }], want: [{ id: "outfit:fitted-duelist", count: 1 }] } };
      const e = st.accounts.eve.cosmetics; e.owned = ["outfit:fitted-duelist"]; e.copies = { "outfit:fitted-duelist": 2 };
      st.accounts.bob.cosmetics.owned = ["outfit:tea"]; st.accounts.bob.cosmetics.copies = { "outfit:tea": 1 }; st.accounts.bob.cosmetics.split = 1;
    });
    // Bob's view of Alice's not yet migrated offer already shows the ids it migrates to.
    expect((cosmeticInfo(f.game, f.b) as any).trades[0]).toMatchObject({ give: [{ id: "outfit:punk-red", count: 1 }], want: [{ id: "outfit:tea", count: 1 }] });
    const info = cosmeticInfo(f.game, f.a) as any, l = raw(f).accounts.alice.cosmetics;
    expect(l.owned).toEqual(["outfit:punk-red", "outfit:tea", "outfit:tracksuit-red", "outfit:yugi"]);
    expect(l.copies).toEqual({ "outfit:punk-red": 3, "outfit:tea": 0 }); // Alice is female: the copies go to the female halves
    expect(l.split).toBe(1);
    expect(l.receipts["0"].id).toBe("outfit:punk-red"); expect(l.receipts["1"].id).toBe("outfit:tea");
    expect(l.offers["legacy-offer"]).toMatchObject({ give: [{ id: "outfit:punk-red", count: 1 }], want: [{ id: "outfit:tea", count: 1 }] });
    expect(info.inventory.find((i: any) => i.id === "outfit:yugi")).toMatchObject({ owned: true, compatible: false, notice: BODY_WIP_NOTICE.female });
    cosmeticInfo(f.game, f.e);
    expect(raw(f).accounts.eve.cosmetics).toMatchObject({ owned: ["outfit:tea", "outfit:yugi"], copies: { "outfit:yugi": 2 } }); // Eve is male
    // Idempotent, and replays never charge or grant again, also after a D1 round trip.
    const migrated = raw(f); cosmeticInfo(f.game, f.a); expect(raw(f)).toEqual(migrated);
    f.game.store.saveRaw(rowsToState(stateToRows(migrated)));
    expect(cosmeticOpen(f.game, f.a, { boxId: "outfit", requestId: "0" })).toMatchObject({ replay: true, reward: { id: "outfit:punk-red", duplicate: true } });
    expect(cosmeticOpen(f.game, f.a, { boxId: "outfit", requestId: "1" })).toMatchObject({ replay: true, reward: { id: "outfit:tea" } });
    expect(raw(f)).toEqual(rowsToState(stateToRows(migrated)));
    // The migrated offer settles once: Bob's Téa copy for Alice's Punk Red copy.
    expect(cosmeticTradeAccept(f.game, f.b, { offerId: "legacy-offer" })).toMatchObject({ offer: { status: "accepted" } });
    const settled = raw(f);
    expect(settled.accounts.alice.cosmetics.copies).toMatchObject({ "outfit:punk-red": 3, "outfit:tea": 1 }); // the given copy was escrowed when offered
    expect(settled.accounts.bob.cosmetics.owned).toContain("outfit:punk-red"); expect(settled.accounts.bob.cosmetics.copies["outfit:tea"]).toBe(0);
    expect(cosmeticTradeAccept(f.game, f.b, { offerId: "legacy-offer" })).toMatchObject({ replay: true });
    expect(raw(f)).toEqual(settled);
    // After the split a single bit is just that item: Eve winning Punk Red does not gain a tracksuit.
    mutate(f, st => { st.accounts.eve.profiles["0"].pbin.push(369); });
    cosmeticInfo(f.game, f.e);
    expect(raw(f).accounts.eve.cosmetics.owned).toEqual(["outfit:punk-red", "outfit:tea", "outfit:yugi"]);
  });
  it("migrates a pre-split owner known only by one bit of the old pair, and resolves old ids from stale clients", () => {
    const f = fixture();
    mutate(f, st => { st.accounts.alice.profiles["0"].pbin.push(116, 374); }); // no ledger yet: owned street-red and fitted-duelist
    const info = cosmeticInfo(f.game, f.a) as any;
    for (const id of ["outfit:tracksuit-red", "outfit:punk-red", "outfit:yugi", "outfit:tea"]) expect(info.inventory.find((i: any) => i.id === id), id).toMatchObject({ owned: true, copies: 0 });
    expect(raw(f).accounts.alice.profiles["0"].pbin).toEqual(expect.arrayContaining([116, 369, 121, 374]));
    const out = cosmeticEquip(f.game, f.a, { id: "outfit:fitted-duelist", world: 0 }) as any; // male: Yami Yugi's garms
    expect(out).toMatchObject({ equipped: { id: "outfit:yugi", parts: expect.any(Array) } }); expect(out.equipped.parts[6]).toBe(0x79);
  });
  it("worlds: one look for both worlds, every item (Domino outfits too) worn in either", () => {
    for (const item of COSMETICS) for (const v of item.variants) expect(v.worlds, `${item.id} ${v.bit}`).toEqual([0, 1]);
    expect(COSMETIC_BY_ID.get("outfit:qualifier-robe")!.variants.map((v) => v.worlds)).toEqual([[0, 1], [0, 1]]);
    const f = fixture();
    mutate(f, st => { st.accounts.alice.profiles["0"].pbin.push(177, 187, 135, 119, 120); });
    cosmeticInfo(f.game, f.a);
    for (const [id, value] of [["dueldisk:3412", 0xb1], ["dueldisk:3450", 0xbb]] as const) for (const world of [0, 1]) {
      const out = cosmeticEquip(f.game, f.a, { id, world }) as any;
      expect(out.error, `${id} ${world}`).toBeUndefined(); expect(out.equipped.parts[8]).toBe(value);
      expect(PP.avatarParts(raw(f).accounts.alice.profiles["0"], world)[8]).toBe(value);
    }
    const academy = cosmeticEquip(f.game, f.a, { id: "outfit:jaden", world: 0 }) as any;
    expect(academy.error).toBeUndefined(); expect(academy.equipped.parts[6]).toBe(0x87);
    for (const [id, value] of [["outfit:black-suit", 0x77], ["outfit:qualifier-robe", 0x78]] as const) {
      const out = cosmeticEquip(f.game, f.a, { id, world: 1 }) as any;           // a Domino outfit in the Academy
      expect(out.error, id).toBeUndefined(); expect(out.equipped.parts[6]).toBe(value);
      for (const world of [0, 1]) expect(PP.avatarParts(raw(f).accounts.alice.profiles["0"], world)[6]).toBe(value);
    }
    const info = cosmeticInfo(f.game, f.a) as any;
    const values = (world: string, slot: number) => info.appearanceOptionsByWorld[world].find((o: any) => o.index === slot).choices.map((c: any) => c.value);
    for (const w of ["0", "1"]) expect(values(w, 6)).toEqual(expect.arrayContaining([0x70, 0x77, 0x78, 0x80, 0x87]));
    expect(values("0", 8)).toEqual(expect.arrayContaining([0xb0, 0xb1, 0xb8, 0xbb])); expect(values("1", 8)).toEqual(expect.arrayContaining([0xb0, 0xb1, 0xb8, 0xbb]));
    // The full-look editor and the native ownership check agree: an owned look is kept in either world, a Domino outfit in the Academy too.
    const look = info.appearance.looks["0"].slice(); look[6] = 0x87; look[8] = 0xb8;
    expect(cosmeticAppearance(f.game, f.a, { world: 0, parts: look })).toMatchObject({ appearanceUpdated: true });
    const academyLook = info.appearance.looks["1"].slice(); academyLook[6] = 0x78; academyLook[8] = 0xb1;
    expect(cosmeticAppearance(f.game, f.a, { world: 1, parts: academyLook })).toMatchObject({ appearanceUpdated: true });
    expect([...PP.avatarParts(raw(f).accounts.alice.profiles["0"], 0)]).toEqual([...academyLook]);   // the one look, both worlds
    academyLook[6] = 0x80;
    expect(cosmeticAppearance(f.game, f.a, { world: 1, parts: academyLook })).toMatchObject({ appearanceUpdated: true });
    // A body change keeps the disk instead of resetting it, the same look in both worlds.
    const switched = cosmeticAppearance(f.game, f.a, { gender: "female" }) as any;
    expect(switched.error).toBeUndefined(); expect(switched.appearance.looks["0"][8]).toBe(0xb1); expect(switched.appearance.looks["1"]).toEqual(switched.appearance.looks["0"]);
  });
});

describe("Afro I, II and III are one item, Afro (owner, 2026-11-04)", () => {
  const afro = () => COSMETIC_BY_ID.get("hair:afro")!;
  it("one common item with every size's rows; Afro I's row is the one it equips; Afro IV stays; the old ids resolve", () => {
    expect(afro()).toMatchObject({ name: "Afro", kind: "hair", slot: 1, rarity: "common" });
    expect(afro().variants.map((v) => [v.gender, v.bit, v.number])).toEqual([["male", 10, 10], ["male", 11, 11], ["male", 12, 12],
      ["female", 261, 5], ["female", 262, 6], ["female", 263, 7]]);
    expect(COSMETIC_BY_ID.get("hair:afro-4")).toMatchObject({ name: "Afro IV", rarity: "super" });
    for (const old of ["hair:afro-1", "hair:afro-2", "hair:afro-3"]) {
      expect(COSMETIC_BY_ID.has(old)).toBe(false);
      for (const body of ["male", "female"] as const) for (const legacy of [false, true]) expect(resolveCosmeticId(old, body, legacy)).toBe("hair:afro");
    }
    expect(Object.keys(MERGED_FAMILIES).sort()).toEqual(["hair:afro-1", "hair:afro-2", "hair:afro-3"]);
    const head = cosmeticPool("head").map((i) => i.id);
    expect(head.filter((id) => id.startsWith("hair:afro"))).toEqual(["hair:afro", "hair:afro-4"]);
    const d = boxDisclosure(BOXES.find((b) => b.id === "head")!);
    expect(d.poolByRarity.common.ids).toContain("hair:afro"); expect(d.poolByRarity.rare.ids).not.toContain("hair:afro-3");
  });
  it("migrates a ledger once: ownership, summed copies, one copy per extra size owned, receipts and escrowed offers", () => {
    const f = fixture(); cosmeticInfo(f.game, f.a); cosmeticInfo(f.game, f.b);
    mutate(f, st => {
      const l = st.accounts.alice.cosmetics; delete l.merged;
      l.owned = ["hair:afro-1", "hair:afro-2", "hair:afro-3", "outfit:black-suit"];
      l.copies = { "hair:afro-1": 1, "hair:afro-2": 2 };   // 1 of them is escrowed below: 1 + 2 + 1 copies were bought
      l.sequence = 3; l.receipts = { "2": { boxId: "head", id: "hair:afro-3", duplicate: false } };
      l.offers = { o1: { id: "o1", requestId: "afro-trade-1", fromAcct: "alice", toAcct: "bob", fromPid: f.a.pid, fromName: "alice", toPid: f.b.pid, toName: "bob",
        give: [{ id: "hair:afro-1", count: 1 }], want: [{ id: "hair:afro-2", count: 1 }, { id: "hair:afro-3", count: 1 }], status: "pending", expiresAt: Date.now() + 600000 } };
      const lb = st.accounts.bob.cosmetics; delete lb.merged; lb.owned = ["hair:afro-2"]; lb.copies = { "hair:afro-2": 1, "hair:afro-3": 1 };
    });
    const info = cosmeticInfo(f.game, f.a) as any, l = raw(f).accounts.alice.cosmetics;
    // 3 sizes owned = 3 items: Afro, and 2 copies of it; plus the 3 bought copies
    expect(l.owned.filter((id: string) => id.startsWith("hair:afro"))).toEqual(["hair:afro"]);
    expect(l.copies).toEqual({ "hair:afro": 5 }); expect(l.merged).toBe(1);
    expect(l.receipts["2"].id).toBe("hair:afro");
    expect(l.offers.o1.give).toEqual([{ id: "hair:afro", count: 1 }]); expect(l.offers.o1.want).toEqual([{ id: "hair:afro", count: 2 }]);
    expect(info.inventory.find((i: any) => i.id === "hair:afro")).toMatchObject({ owned: true, copies: 5, tradable: 5 });
    expect(info.trades[0]).toMatchObject({ give: [{ id: "hair:afro", count: 1 }], want: [{ id: "hair:afro", count: 2 }] });
    // once only: again, and after a D1 round trip, nothing more
    const once = raw(f); cosmeticInfo(f.game, f.a); expect(raw(f).accounts.alice.cosmetics).toEqual(once.accounts.alice.cosmetics);
    f.game.store.saveRaw(rowsToState(stateToRows(raw(f)))); cosmeticInfo(f.game, f.a);
    expect(raw(f).accounts.alice.cosmetics.copies).toEqual({ "hair:afro": 5 });
    // a replayed receipt that named Afro III: no charge, no grant
    const mp = raw(f).accounts.alice.profiles["0"].rec.mp;
    expect(cosmeticOpen(f.game, f.a, { boxId: "head", requestId: "2" })).toMatchObject({ replay: true, reward: { id: "hair:afro" } });
    expect(raw(f).accounts.alice.profiles["0"].rec.mp).toBe(mp); expect(raw(f).accounts.alice.cosmetics.copies["hair:afro"]).toBe(5);
    // bob (1 size owned, copies of II and III): Afro and 2 copies, no extra; accepting moves exactly the escrow
    expect(cosmeticTradeAccept(f.game, f.b, { offerId: "o1" })).toMatchObject({ offer: { status: "accepted" } });
    expect(raw(f).accounts.bob.cosmetics.copies["hair:afro"]).toBe(1);    // 2 - 2 wanted + 1 given
    expect(raw(f).accounts.alice.cosmetics.copies["hair:afro"]).toBe(7);  // 5 + 2 received (already owned: copies)
    expect(cosmeticTradeAccept(f.game, f.b, { offerId: "o1" })).toMatchObject({ replay: true });
    expect(raw(f).accounts.alice.cosmetics.copies["hair:afro"]).toBe(7);
  });
  it("a cancelled migrated offer returns its escrow under the new id; a stale client's old id still works", () => {
    const f = fixture(); cosmeticInfo(f.game, f.a);
    mutate(f, st => { const l = st.accounts.alice.cosmetics; delete l.merged; l.owned = ["hair:afro-1"]; l.copies = { "hair:afro-1": 0 };
      l.offers = { o2: { id: "o2", requestId: "afro-trade-2", fromAcct: "alice", toAcct: "bob", fromPid: f.a.pid, fromName: "alice", toPid: f.b.pid, toName: "bob",
        give: [{ id: "hair:afro-1", count: 1 }], want: [], status: "pending", expiresAt: Date.now() + 600000 } }; });
    cosmeticTradeCancel(f.game, f.a, { offerId: "o2" });
    expect(raw(f).accounts.alice.cosmetics.copies).toEqual({ "hair:afro": 1 });
    expect(cosmeticTrade(f.game, f.a, { targetPid: f.b.pid, requestId: "afro-trade-3", give: [{ id: "hair:afro-2", count: 1 }], want: [] }))
      .toMatchObject({ offer: { give: [{ id: "hair:afro", count: 1 }] } });
    expect((cosmeticEquip(f.game, f.a, { id: "hair:afro-3", world: 0 }) as any).equipped).toMatchObject({ id: "hair:afro" });
  });
  it("legacy PBIN bits of two sizes are one Afro, never copies", () => {
    const f = fixture();
    mutate(f, st => { st.accounts.alice.profiles["0"].pbin.push(10, 11); });
    cosmeticInfo(f.game, f.a);
    const l = raw(f).accounts.alice.cosmetics;
    expect(l.owned).toContain("hair:afro"); expect(l.copies["hair:afro"] ?? 0).toBe(0);
    expect(raw(f).accounts.alice.profiles["0"].pbin).toEqual(expect.arrayContaining([10, 11, 12, 261, 262, 263]));
  });
  it("equips Afro I's row per body, keeps every size's saved look valid, lists one Afro unless another size is on, keeps the size on a body change", () => {
    const f = fixture(); mutate(f, st => { st.accounts.alice.profiles["0"].pbin.push(12); });
    expect((cosmeticEquip(f.game, f.a, { id: "hair:afro", world: 0 }) as any).equipped.parts[1]).toBe(10);
    const opts = (info: any, w: string) => info.appearanceOptionsByWorld[w].find((o: any) => o.index === 1).choices.filter((c: any) => c.label === "Afro").map((c: any) => c.value);
    expect(opts(cosmeticInfo(f.game, f.a), "0")).toEqual([10]);
    const parts = [...PP.avatarParts(raw(f).accounts.alice.profiles["0"], 0)]; parts[1] = 12;   // Afro III, from an old look
    expect(cosmeticAppearance(f.game, f.a, { world: 0, parts })).toMatchObject({ appearanceUpdated: true });
    expect(opts(cosmeticInfo(f.game, f.a), "0")).toEqual([10, 12]);
    expect(cosmeticAppearance(f.game, f.a, { gender: "female" })).toMatchObject({ appearanceUpdated: true });
    expect(PP.avatarParts(raw(f).accounts.alice.profiles["0"], 0)[1]).toBe(7);   // female Afro III
    expect((cosmeticEquip(f.game, f.a, { id: "hair:afro", world: 1 }) as any).equipped.parts[1]).toBe(5);
  });
});
