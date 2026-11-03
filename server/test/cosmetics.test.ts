import { afterEach, describe, expect, it, vi } from "vitest";
import { configFrom } from "../src/config.ts";
import { buildServer } from "../src/server.ts";
import { Session } from "../src/game/hub.ts";
import * as PP from "../src/game/persist.ts";
import { rowsToState, stateToRows } from "../src/db/project.ts";
import { BOXES, COSMETICS, expandCosmeticBits, cosmeticPool, outfitArtworkId } from "../src/game/cosmetics-catalog.ts";
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
function roll(tier: number) {
  let n = 0;
  vi.spyOn(crypto, "getRandomValues").mockImplementation(((a: Uint32Array) => { a[0] = n++ % 2 === 0 ? tier : 0; return a; }) as any);
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
    expect(out.wallet).toEqual({ total: 13500, bound: 5000, earned: 8500 });
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
    expect(raw(f).accounts.alice.profiles["0"].rec.mp).toBe(13500);
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
    expect(initial.inventory.find((i: any) => i.id === "outfit:street-red")).toMatchObject({ owned: true, copies: 0 });
    expect(cosmeticTrade(f.game, f.a, { targetPid: f.b.pid, requestId: "legacy-test", give: [{ id: "outfit:street-red", count: 1 }], want: [] })).toMatchObject({ error: "insufficient-duplicates" });
    const out = open(f); expect(out.reward).toMatchObject({ id: "outfit:street-red", duplicate: true, copies: 1 });
    expect(raw(f).accounts.alice.cosmetics.copies["outfit:street-red"]).toBe(1);
  });
  it("enforces both pity counters with published next-pull odds and survives character replacement", () => {
    const f = fixture(); cosmeticInfo(f.game, f.a); roll(0);
    mutate(f, st => { st.accounts.alice.cosmetics.pity.outfit = { superMisses: 9, ultraMisses: 8 }; });
    expect((cosmeticInfo(f.game, f.a) as any).boxes.find((b: any) => b.id === "outfit").nextOdds).toEqual({ common: 0, rare: 0, super: 80, ultra: 20 });
    expect(open(f).reward.rarity).toBe("super");
    mutate(f, st => { st.accounts.alice.cosmetics.pity.outfit = { superMisses: 2, ultraMisses: 19 }; st.accounts.alice.profiles["0"] = PP.blankProfile("replacement"); st.accounts.alice.profiles["0"].rec.mp = 10000; });
    expect(open(f).reward.rarity).toBe("ultra");
    expect(raw(f).accounts.alice.cosmetics.pity.outfit).toEqual({ superMisses: 0, ultraMisses: 0 });
  });
  it("has nonempty advertised pools for either body and never silently moves an empty rarity's probability", () => {
    for (const gender of ["male", "female"] as const) for (const box of BOXES) {
      const pool = cosmeticPool(box.id, gender);
      for (const [tier, weight] of Object.entries(box.weights)) if (weight) expect(pool.some((item) => item.rarity === tier), `${box.id}/${gender}/${tier}`).toBe(true);
    }
    for (const bit of [131, 132, 133, 134, 387, 388, 389, 390]) expect(COSMETICS.some((i) => i.variants.some((v) => v.bit === bit))).toBe(false);
  });
  it("refuses a broken configured rarity pool before taking currency or advancing pity", () => {
    const f = fixture(), before = raw(f);
    const item = COSMETICS.find((i) => i.id === "outfit:marik")!;
    const old = item.variants; item.variants = old.filter((v) => v.gender !== "female");
    try {
      mutate(f, st => { st.accounts.alice.profiles["0"].avatar = { a: "0100203040607090b020000000000000" }; });
      const prepared = raw(f);
      expect(cosmeticOpen(f.game, f.a, { boxId: "outfit", requestId: "0" })).toMatchObject({ error: "unavailable-pool" });
      expect(raw(f)).toEqual(prepared);
    } finally { item.variants = old; }
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
    expect(expandCosmeticBits([116])).toEqual([116, 369]);
    expect(expandCosmeticBits([10])).toEqual([10, 261]);
    expect(outfitArtworkId(0x79, false)).toBe("dc_04_c01");
    expect(outfitArtworkId(0x76, true)).toBe("dc_04_c01");
    expect(expandCosmeticBits([121])).toEqual([121, 374]); // Yugi/Téa are actual native body variants.
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
  it("updates an inactive world's appearance without changing the visible current world", () => {
    const f = fixture(); f.a.world = 1;
    mutate(f, st => { st.accounts.alice.profiles["0"].pbin.push(119); });
    cosmeticInfo(f.game, f.a);
    const current = new Uint8Array(16); current[6] = 0x80; f.a.parts = current;
    const out = cosmeticEquip(f.game, f.a, { id: "outfit:black-suit", world: 0 }) as any;
    expect(out.equipped.parts[6]).toBe(0x77); expect(f.a.world).toBe(1); expect(f.a.parts).toEqual(current);
    expect(f.a.partsW.get(0)?.[6]).toBe(0x77);
    expect(cosmeticEquip(f.game, f.a, { id: "outfit:black-suit", world: 1 })).toMatchObject({ error: "no-compatible-variant" });
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
    mutate(f, st => { const p = st.accounts.alice.profiles["0"]; p.pbin.push(116); p.avatar = { a: "0000203040607490b020000000000000" }; });
    const result = cosmeticAppearance(f.game, f.a, { gender: "female" }) as any;
    expect(result.error).toBeUndefined();
    expect(result.appearance.looks["0"][0]).toBe(1); expect(result.appearance.looks["1"][0]).toBe(1);
    expect(result.appearance.looks["0"][6]).toBe(0x71); // male Tracksuit Red -> female Punk Red.
    expect(result.inventory.find((i: any) => i.id === "outfit:street-red")).toMatchObject({ owned: true, copies: 0 });
    expect(cosmeticAppearance(f.game, f.a, { gender: "male" })).toMatchObject({ appearanceUpdated: true });
    expect(PP.avatarParts(raw(f).accounts.alice.profiles["0"], 0)[6]).toBe(0x74);
  });
  it("preserves a missing-body named design but uses an honest default, and validates full appearance edits", () => {
    const f = fixture();
    mutate(f, st => { const p = st.accounts.alice.profiles["0"]; p.pbin.push(122); p.avatar = { a: "0000203040607a90b020000000000000" }; });
    const result = cosmeticAppearance(f.game, f.a, { gender: "female" }) as any;
    expect(result.appearance.looks["0"][6]).toBe(0x70);
    expect(result.inventory.find((i: any) => i.id === "outfit:kaiba")).toMatchObject({ owned: true, compatible: false });
    const before = raw(f), parts = result.appearance.looks["0"].slice(); parts[6] = 0x77; // Marik not owned.
    expect(cosmeticAppearance(f.game, f.a, { world: 0, parts })).toMatchObject({ error: "unowned-or-invalid-appearance" });
    parts[6] = 0x70; parts[14] = 7;
    expect(cosmeticAppearance(f.game, f.a, { world: 0, parts })).toMatchObject({ error: "unowned-or-invalid-appearance" });
    expect(raw(f)).toEqual(before);
    parts[14] = 6; parts[13] = 2;
    expect(cosmeticAppearance(f.game, f.a, { world: 0, parts })).toMatchObject({ appearanceUpdated: true });
  });
  it("keeps level-gated rank uniforms gated in the shortcut editor", () => {
    const f = fixture(); const info = cosmeticInfo(f.game, f.a) as any;
    const parts = info.appearance.looks["1"].slice(); parts[6] = 0x81;
    expect(cosmeticAppearance(f.game, f.a, { world: 1, parts })).toMatchObject({ error: "unowned-or-invalid-appearance" });
    mutate(f, st => { st.accounts.alice.profiles["0"].rec.lv = 10; });
    expect(cosmeticAppearance(f.game, f.a, { world: 1, parts })).toMatchObject({ appearanceUpdated: true });
  });
  it("uses native asset identity for the differently named fitted outfit and keeps it across both bodies", () => {
    const f = fixture();
    mutate(f, st => { const p = st.accounts.alice.profiles["0"]; p.pbin.push(121); p.avatar = { a: "0000203040607990b020000000000000" }; });
    const female = cosmeticAppearance(f.game, f.a, { gender: "female" }) as any;
    expect(female.appearance.looks["0"][6]).toBe(0x76);
    const item = female.inventory.find((i: any) => i.id === "outfit:fitted-duelist");
    expect(item).toMatchObject({ artwork: "dc_04_c01", compatible: true, owned: true, copies: 0 });
    expect(item.variants.map((v: any) => v.bit)).toEqual([121, 374]);
    const male = cosmeticAppearance(f.game, f.a, { gender: "male" }) as any;
    expect(male.appearance.looks["0"][6]).toBe(0x79);
    expect(male.inventory.find((i: any) => i.id === "outfit:fitted-duelist")).toMatchObject({ copies: 0 });
  });
  it("only offers new outfits with actual artwork for both bodies, while preserving legacy single-body looks", () => {
    for (const gender of ["male", "female"] as const) {
      const pool = cosmeticPool("outfit", gender);
      for (const item of pool) {
        expect(item.variants.some((v) => v.gender === "male")).toBe(true);
        expect(item.variants.some((v) => v.gender === "female")).toBe(true);
        expect(new Set(item.variants.map((v) => outfitArtworkId(v.number, v.gender === "female"))).size).toBe(1);
      }
      for (const id of ["outfit:fitted-duelist", "outfit:kaiba", "outfit:joey", "outfit:jaden", "outfit:chazz", "outfit:jesse", "outfit:kaiser", "outfit:aster"])
        expect(pool.some((item) => item.id === id)).toBe(false);
      for (const bit of [121, 374]) expect(pool.some((item) => item.variants.some((variant) => variant.bit === bit))).toBe(false);
      expect(pool.filter((item) => item.rarity === "ultra").map((item) => item.id)).toEqual(["outfit:qualifier-robe"]);
      for (const rarity of ["common", "rare", "super", "ultra"]) expect(pool.some((item) => item.rarity === rarity)).toBe(true);
    }
    const f = fixture(); mutate(f, st => st.accounts.alice.profiles["0"].pbin.push(122));
    expect((cosmeticInfo(f.game, f.a) as any).inventory.some((i: any) => i.id === "outfit:kaiba")).toBe(true);
  });
  it("migrates old family IDs without rerolling, losing duplicate copies or manufacturing ownership copies", () => {
    const f = fixture(); cosmeticInfo(f.game, f.a);
    mutate(f, st => {
      const l = st.accounts.alice.cosmetics;
      l.owned = ["outfit:yugi", "outfit:tea"];
      l.copies = { "outfit:yugi": 2, "outfit:tea": 3 };
      l.sequence = 1; l.receipts = { "0": { boxId: "outfit", id: "outfit:tea", duplicate: false } };
      l.offers = { "legacy-offer": { id: "legacy-offer", requestId: "legacy-0001", fromAcct: "alice", toAcct: "bob", fromPid: f.a.pid, fromName: "alice", toPid: f.b.pid, toName: "bob", status: "pending", expiresAt: 2000000000000,
        give: [{ id: "outfit:yugi", count: 1 }, { id: "outfit:tea", count: 1 }], want: [{ id: "outfit:tea", count: 1 }] } };
    });
    cosmeticInfo(f.game, f.a);
    const l = raw(f).accounts.alice.cosmetics;
    expect(l.owned).toEqual(["outfit:fitted-duelist"]);
    expect(l.copies).toEqual({ "outfit:fitted-duelist": 5 });
    expect(l.receipts["0"].id).toBe("outfit:fitted-duelist");
    expect(l.offers["legacy-offer"].give).toEqual([{ id: "outfit:fitted-duelist", count: 2 }]);
    const before = raw(f);
    expect(cosmeticOpen(f.game, f.a, { boxId: "outfit", requestId: "0" })).toMatchObject({ replay: true, reward: { id: "outfit:fitted-duelist", duplicate: false } });
    expect(raw(f)).toEqual(before);
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
    const f = fixture(); const id = "hair:afro-1"; copies(f, "alice", id, 1);
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
    const f = fixture(), id = "outfit:black-suit", want = "hair:afro-1";
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
