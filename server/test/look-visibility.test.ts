// What a player wears is what the other players see (owner, 2026-11-04): outfit, hair, glasses and accessories, duel
// disk and rank uniforms. One look for both worlds (owner, 2026-11-05): any change is the look in Domino and in the
// Academy, and the others get the 0x4181 for both worlds. Through every way a look changes: the native avatar change (0x4170), the
// wardrobe API (cosmeticEquip / cosmeticAppearance), character select and login, a world switch, and the server
// replacing a forbidden part. Two (or three) real clients over the harness: A changes, B receives A's new parts in
// the 0x4181 avatar update, its LIST2 player list (0x4214), A's joins (0x3112), and the parts the duel and watch
// screens (g.duelParts, pvpMatch) and a challenge (0x4302, Session.parts) send.
import { afterEach, describe, expect, it, vi } from "vitest";
import * as PP from "../src/game/persist.ts";
import * as RK from "../src/game/ranking.ts";
import { cosmeticAppearance, cosmeticEquip, pushRankBits } from "../src/game/cosmetics.ts";
import { be32, cat, harness, u32, type Client, type Harness } from "./notes-harness.ts";

afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); PP.setProgression(false); });

const A = "u:user-a";
const hex = (b: ArrayLike<number>) => Buffer.from(Uint8Array.from(b as number[])).toString("hex");
// Male looks: [sex, hair, accessory, nose, eyes, mouth, outfit, back hair, disk, glasses, 0 x3, skin, hair colour, eye colour]
const look = (o: Partial<Record<"hair" | "acc" | "outfit" | "disk" | "glasses", number>>, world: 0 | 1) =>
  Uint8Array.from([0, o.hair ?? 0, o.acc ?? 0x20, 0x30, 0x40, 0x60, o.outfit ?? (world ? 0x80 : 0x70), 0x90, o.disk ?? (world ? 0xb8 : 0xb0), o.glasses ?? 0x20, 0, 0, 0, 1, 2, 3]);
/** Items A owns: Afro (10-12), Afro IV (13), Plaster (33), Sunglasses (80), Bakura's Eyepatch (84), Black Suit (119,
 *  a Domino outfit), Jaden's Costume (135, an Academy outfit), Battle City Black (177), Academy Black (185); all worn in either world. */
const OWNED = [10, 11, 12, 13, 33, 80, 84, 119, 135, 177, 185];

async function enter(c: Client, port: number, world: 0 | 1, parts: Uint8Array) {
  const r = (c.room = c.link(port));
  r.send(0x3001); await r.wait(0x3002);
  r.send(0x3003, c.key); await r.wait(0x3004);
  let n = r.mark(); r.send(0x4100, [5, 0]);
  const res = (await r.wait(0x4101, n))!; c.pid = u32(res, 4);
  n = r.mark(); r.send(0x4200); await r.wait(0x4201, n);
  n = r.mark(); r.send(0x4202, [0, 0]); await r.wait(0x4213, n);
  n = r.mark(); r.send(0x4170, cat(be32(world), parts, new Uint8Array(4))); await r.wait(0x4171, n);
}
const DOMINO_PORT = 5740, ACADEMY_PORT = 5744;   // ROOM_KINDS[0] = 13 Domino City, [4] = 14 Duelist Academy

async function setup(opts: { graduated?: boolean; school?: number } = {}) {
  PP.setProgression(false);
  const h = harness({ players: {} }, { DEV: "0" });
  const a = h.client("alice", "alice", "pw", "user-a"), b = h.client("bob", "bob", "pw", "user-b"), c = h.client("carol", "carol", "pw", "user-c");
  await a.account(0, "Alice"); await b.account(0, "Bob"); await c.account(0, "Carol");
  const edit = (fn: (st: any) => void) => { const st = h.state(); fn(st); h.game.store.saveRaw(st); };
  edit((st) => {
    const p = st.accounts[A].profiles["0"];
    p.pbin = [...new Set([...(p.pbin ?? []), ...OWNED])].sort((x: number, y: number) => x - y);
    if (opts.graduated) { p.rec.lv = RK.GRADUATION_LEVEL; p.graduated = 1; }
    if (opts.school) p.rank = { ...RK.rankOf(null), rating: opts.school, rd: 60, games: 20, wins: 15, losses: 5, school: RK.schoolAfter("beginner", opts.school, true),
      best: RK.schoolAfter("beginner", opts.school, true), last: Date.now() };
  });
  return { h, a, b, c, edit, sess: () => h.game.hub.sessions.get(A)! };
}
/** The 0x4181 avatar updates B got since `n` about A: [world, parts]. */
const updates = (b: Client, pidA: number, n: number) => b.room!.all(0x4181, n).filter((d) => u32(d) === pidA).map((d) => [u32(d, 4), hex(d.subarray(8, 24))]);
/** The distinct "world:parts" of those updates (a world's copy may come more than once). */
const seen = (b: Client, pidA: number, n: number) => [...new Set(updates(b, pidA, n).map(([w, p]) => `${w}:${p}`))].sort();
/** One look shown for both worlds. */
const both = (parts: ArrayLike<number> | string) => { const p = typeof parts === "string" ? parts : hex(parts); return [`0:${p}`, `1:${p}`]; };
/** B's LIST2 (0x4214): A's parts as B's client files them. */
async function list2(h: Harness, b: Client, pidA: number): Promise<string | null> {
  const n = b.room!.mark(); b.room!.send(0x4214, be32(0)); await b.room!.wait(0x4217, n);
  for (const d of b.room!.all(0x4216, n)) for (let i = 0; i + 26 <= d.length;) {
    const pid = u32(d, i), duel = d[i + 4] >= 0x67 && d[i + 4] <= 0x6a, len = 26 + (duel ? 23 : 0);
    if (pid === pidA) return hex(d.subarray(i + 5, i + 21));
    i += len;
  }
  return null;
}
/** A's 0x3112 joins B got since `n`: A's LIST2 parts in it. */
const joins = (b: Client, pidA: number, n: number) => b.room!.all(0x3112, n).filter((d) => u32(d) === pidA && d[4] === 1).map((d) => hex(d.subarray(43, 59)));
/** What the duel screen, the watch screen and the duel log send of A for each world (pvpMatch preparation/start/watch). */
const duelParts = (h: Harness, s: any) => [0, 1].map((w) => hex(h.game.withCtx(s, () => h.game.duelParts(null, w))));
const stored = (h: Harness) => { const p = h.state().accounts[A].profiles["0"]; return [hex(PP.avatarParts(p, 0)), hex(PP.avatarParts(p, 1))]; };

describe("the native avatar change (0x4170) reaches everyone in the block", () => {
  it("every slot, from either world: B's 0x4181 (both worlds), B's player list and the duel/watch parts all show A's new look", async () => {
    const { h, a, b, sess } = await setup({ school: 1900 });
    await enter(b, ACADEMY_PORT, 1, look({}, 1)); await enter(a, ACADEMY_PORT, 1, look({}, 1));
    const cases: [0 | 1, Uint8Array][] = [
      [1, look({ hair: 11, acc: 33, outfit: 0x82, disk: 0xb1, glasses: 0x50 }, 1)],   // Afro II, Plaster, Obelisk Blue, a Domino disk, Sunglasses
      [1, look({ hair: 13, outfit: 0x77, disk: 0xb9, glasses: 0x54 }, 1)],             // Afro IV, a Domino outfit (not graduated), Academy Black, Bakura
      [0, look({ hair: 10, outfit: 0x87, disk: 0xb9, glasses: 0x50 }, 0)],             // Domino: Jaden's (an Academy outfit), an Academy disk
      [0, look({ hair: 12, outfit: 0x81, disk: 0xb1 }, 0)],                            // Domino: Ra Yellow (a rank uniform in Domino)
    ];
    for (const [world, parts] of cases) {
      const n = b.room!.mark(), na = a.room!.mark();
      a.room!.send(0x4170, cat(be32(world), parts, new Uint8Array(4)));
      await a.room!.wait(0x4171, na); await h.tick(200);
      expect(updates(b, a.pid!, n), hex(parts)).toEqual([[0, hex(parts)], [1, hex(parts)]]);
      expect(a.room!.all(0x4181, na)).toEqual([]);                                  // kept as sent: no correction to A
      expect(stored(h)).toEqual([hex(parts), hex(parts)]);                          // one look: both worlds' copies
      expect(duelParts(h, sess())).toEqual([hex(parts), hex(parts)]);
      expect(await list2(h, b, a.pid!)).toBe(hex(parts)); expect(hex(sess().parts)).toBe(hex(parts));
    }
  });
  it("the server replacing a forbidden part: others get the corrected look, never the forbidden one", async () => {
    const { h, a, b, edit } = await setup();
    await enter(b, ACADEMY_PORT, 1, look({}, 1)); await enter(a, ACADEMY_PORT, 1, look({}, 1));
    const bad = look({ hair: 11, outfit: 0x82, disk: 0xb1, glasses: 0x50 }, 1);     // Obelisk Blue in the Academy, a school never reached
    const fixed = bad.slice(); fixed[6] = 0x80;                                     // Slifer Red, the uniform everyone may wear
    let n = b.room!.mark(), na = a.room!.mark();
    a.room!.send(0x4170, cat(be32(1), bad, new Uint8Array(4))); await a.room!.wait(0x4171, na); await h.tick(200);
    expect(seen(b, a.pid!, n)).toEqual(both(fixed));
    expect(updates(a, a.pid!, na)).toEqual([[1, hex(fixed)]]);                     // A's own client is told what was kept
    expect(await list2(h, b, a.pid!)).toBe(hex(fixed)); expect(stored(h)).toEqual([hex(fixed), hex(fixed)]);
    const obelisk = look({ outfit: 0x82 }, 0);                                      // the same uniform, in Domino
    n = b.room!.mark(); na = a.room!.mark();
    a.room!.send(0x4170, cat(be32(0), obelisk, new Uint8Array(4))); await a.room!.wait(0x4171, na); await h.tick(200);
    expect(seen(b, a.pid!, n)).toEqual(both(look({ outfit: 0x80 }, 0)));                  // Slifer Red, in Domino too
    const domino = look({ hair: 11, outfit: 0x77, disk: 0xb1, glasses: 0x50 }, 1);  // a Domino outfit in the Academy, not graduated: kept as sent
    n = b.room!.mark(); na = a.room!.mark();
    a.room!.send(0x4170, cat(be32(1), domino, new Uint8Array(4))); await a.room!.wait(0x4171, na); await h.tick(200);
    expect(seen(b, a.pid!, n)).toEqual(both(domino)); expect(updates(a, a.pid!, na)).toEqual([]);
    expect(stored(h)).toEqual([hex(domino), hex(domino)]);
    edit((st) => { st.accounts[A].profiles["0"].pbin = st.accounts[A].profiles["0"].pbin.filter((x: number) => x !== 80 && x !== 336); });   // Sunglasses, both bodies' bits
    n = b.room!.mark(); na = a.room!.mark();                                        // not owned: nothing kept, nothing shown
    a.room!.send(0x4170, cat(be32(1), look({ glasses: 0x50 }, 1), new Uint8Array(4))); await a.room!.wait(0x4171, na); await h.tick(200);
    expect(updates(b, a.pid!, n)).toEqual([]); expect(stored(h)).toEqual([hex(domino), hex(domino)]);
  });
});

describe("the wardrobe API reaches everyone in the block", () => {
  it("cosmeticEquip: from the world A is in or the other world, every kind of item, to B's 0x4181 (both worlds) and list", async () => {
    const { h, a, b, sess } = await setup();
    await enter(b, ACADEMY_PORT, 1, look({}, 1)); await enter(a, ACADEMY_PORT, 1, look({}, 1));
    const n0 = b.room!.mark();
    for (const [id, world] of [["hair:afro", 1], ["accessory:sunglasses", 1], ["accessory:plaster", 1], ["dueldisk:3412", 1], ["outfit:black-suit", 1],
      ["hair:afro-4", 0], ["dueldisk:3414", 0], ["outfit:jaden", 0]] as [string, 0 | 1][]) {
      const n = b.room!.mark();
      const out = cosmeticEquip(h.game, "user-a", { id, world }) as any;
      expect(out.error, id).toBeUndefined();
      await h.tick(200);
      const p = hex(out.equipped.parts);
      expect(seen(b, a.pid!, n), id).toEqual(both(p));
      expect(stored(h), id).toEqual([p, p]); expect(duelParts(h, sess())).toEqual([p, p]);
    }
    expect(updates(b, a.pid!, n0).length).toBeGreaterThanOrEqual(16);
    const [d, ac] = stored(h);
    expect(d).toBe(ac);
    expect(await list2(h, b, a.pid!)).toBe(ac); expect(hex(sess().parts)).toBe(ac); expect(hex(sess().partsW.get(0)!)).toBe(ac);
    // one look: the Domino-world equips (Afro IV, Jaden's) replaced the Academy-world ones (Afro, Black Suit)
    expect(PP.avatarParts(h.state().accounts[A].profiles["0"], 1).slice(1, 10)).toEqual(Uint8Array.from([13, 0x21, 0x30, 0x40, 0x60, 0x87, 0x90, 0xb9, 0x50]));
  });
  it("cosmeticAppearance: a full look, and a body change (both worlds at once), to B", async () => {
    const { h, a, b } = await setup({ school: 1600 });
    await enter(b, ACADEMY_PORT, 1, look({}, 1)); await enter(a, ACADEMY_PORT, 1, look({}, 1));
    let n = b.room!.mark();
    const parts = look({ hair: 12, outfit: 0x81, disk: 0xb9, glasses: 0x50 }, 1);   // Afro III, Ra Yellow, Academy Black
    expect(cosmeticAppearance(h.game, "user-a", { world: 1, parts: [...parts] })).toMatchObject({ appearanceUpdated: true });
    await h.tick(200);
    expect(seen(b, a.pid!, n)).toEqual(both(parts)); expect(stored(h)).toEqual([hex(parts), hex(parts)]);
    n = b.room!.mark();
    const other = look({ hair: 12, outfit: 0x77 }, 0);
    expect(cosmeticAppearance(h.game, "user-a", { world: 0, parts: [...other] })).toMatchObject({ appearanceUpdated: true });
    await h.tick(200);
    expect(seen(b, a.pid!, n)).toEqual(both(other)); expect(stored(h)).toEqual([hex(other), hex(other)]);   // from the other world: the one look
    n = b.room!.mark();
    expect(cosmeticAppearance(h.game, "user-a", { gender: "female" })).toMatchObject({ appearanceUpdated: true });
    await h.tick(200);
    const [d, ac] = stored(h);
    expect(d).toBe(ac); expect(seen(b, a.pid!, n)).toEqual(both(ac));
    expect(ac.slice(0, 4)).toBe("0107");                                            // female, Afro III
    expect(await list2(h, b, a.pid!)).toBe(ac);
  });
  it("a refused edit shows nothing to anyone", async () => {
    const { h, a, b } = await setup();
    await enter(b, ACADEMY_PORT, 1, look({}, 1)); await enter(a, ACADEMY_PORT, 1, look({}, 1));
    const n = b.room!.mark(), before = stored(h);
    expect(cosmeticAppearance(h.game, "user-a", { world: 1, parts: [...look({ outfit: 0x82 }, 1)] })).toMatchObject({ error: "unowned-or-invalid-appearance" });
    expect(cosmeticEquip(h.game, "user-a", { id: "outfit:qualifier-robe", world: 1 })).toMatchObject({ error: "not-owned" });
    await h.tick(200);
    expect(updates(b, a.pid!, n)).toEqual([]); expect(stored(h)).toEqual(before);
  });
});

describe("login, character select and a world switch", () => {
  it("A's saved look (set while away; two different from before one look: the last world's) is in the join B gets and in B's list", async () => {
    const { h, a, b, edit } = await setup({ school: 2000 });
    const dom = look({ hair: 13, outfit: 0x82, disk: 0xb9, glasses: 0x54 }, 0), acad = look({ hair: 11, outfit: 0x77, disk: 0xb1, glasses: 0x50 }, 1);
    edit((st) => { st.accounts[A].profiles["0"].avatar = { a: hex(dom), b: hex(acad), w: 1 }; });   // last in the Academy
    await enter(b, ACADEMY_PORT, 1, look({}, 1));
    const n = b.room!.mark();
    await enter(a, ACADEMY_PORT, 1, acad);                                          // the client registers its saved look
    await h.tick(200);
    expect(joins(b, a.pid!, n)).toEqual([hex(acad)]);
    expect(seen(b, a.pid!, n)).toEqual(both(acad));
    expect(await list2(h, b, a.pid!)).toBe(hex(acad));
  });
  it("one look in both worlds: B in Domino and C in the Academy get the same look in the join; a world switch and a new look reach both", async () => {
    const { h, a, b, c, edit } = await setup({ school: 1900 });
    const dom = look({ hair: 10, outfit: 0x82, disk: 0xb9 }, 0), acad = look({ hair: 12, outfit: 0x77, disk: 0xb1, glasses: 0x50 }, 1);
    edit((st) => { st.accounts[A].profiles["0"].avatar = { a: hex(acad), b: hex(acad) }; });
    await enter(b, DOMINO_PORT, 0, look({}, 0));                                    // B in Domino City
    await enter(c, ACADEMY_PORT, 1, look({}, 1));                                   // C in the Academy (the same block: one world)
    let nb = b.room!.mark(), nc = c.room!.mark();
    await enter(a, ACADEMY_PORT, 1, acad);
    await h.tick(200);
    expect(joins(c, a.pid!, nc)).toEqual([hex(acad)]);
    expect(joins(b, a.pid!, nb)).toEqual([hex(acad)]);                              // B's world: the same one look
    expect(await list2(h, b, a.pid!)).toBe(hex(acad)); expect(await list2(h, c, a.pid!)).toBe(hex(acad));
    // A walks to Domino City (another area, 0x4202) and puts on a new look there (0x4170 world 0)
    nb = b.room!.mark(); nc = c.room!.mark();
    const na = a.room!.mark();
    a.room!.send(0x4202, [0, 1]); await a.room!.wait(0x4203, na);
    a.room!.send(0x4170, cat(be32(0), dom, new Uint8Array(4))); await a.room!.wait(0x4171, na); await h.tick(200);
    expect(seen(b, a.pid!, nb)).toEqual(both(dom)); expect(seen(c, a.pid!, nc)).toEqual(both(dom));
    expect(stored(h)).toEqual([hex(dom), hex(dom)]);
    expect(await list2(h, c, a.pid!)).toBe(hex(dom));
    expect(h.game.hub.sessions.get(A)!.world).toBe(0); expect(hex(h.game.hub.sessions.get(A)!.parts)).toBe(hex(dom));
    expect(await list2(h, b, a.pid!)).toBe(hex(dom));
  });
});

describe("a changed look is drawn again on screen (the client never redraws an on-screen chibi from a 0x4181)", () => {
  /** A's 0x3112 messages to B since n: "leave" or the join's parts. */
  const redraws = (b: Client, pidA: number, n: number) => b.room!.all(0x3112, n).filter((d) => u32(d) === pidA).map((d) => d[4] === 0 ? "leave" : hex(d.subarray(43, 59)));
  it("0x4170 and the wardrobe API: B in the same world gets A leaving and joining with the new look; an unchanged look, nothing", async () => {
    const { h, a, b } = await setup();
    await enter(b, ACADEMY_PORT, 1, look({}, 1)); await enter(a, ACADEMY_PORT, 1, look({}, 1)); await h.tick(1500);
    let n = b.room!.mark(), na = a.room!.mark();
    a.room!.send(0x4170, cat(be32(1), look({}, 1), new Uint8Array(4))); await a.room!.wait(0x4171, na); await h.tick(300);
    expect(redraws(b, a.pid!, n)).toEqual([]);                                     // the same look again (as at room entry)
    const next = look({ hair: 11, outfit: 0x77, glasses: 0x50 }, 1);
    n = b.room!.mark(); na = a.room!.mark();
    a.room!.send(0x4170, cat(be32(1), next, new Uint8Array(4))); await a.room!.wait(0x4171, na); await h.tick(1500);
    expect(redraws(b, a.pid!, n)).toEqual(["leave", hex(next)]);
    n = b.room!.mark();
    const out = cosmeticEquip(h.game, "user-a", { id: "hair:afro-4", world: 1 }) as any; await h.tick(1500);
    expect(redraws(b, a.pid!, n)).toEqual(["leave", hex(out.equipped.parts)]);
    n = b.room!.mark();                                                             // equipped from the other world: the one look, drawn again
    const other = cosmeticEquip(h.game, "user-a", { id: "outfit:jaden", world: 0 }) as any; await h.tick(1500);
    expect(redraws(b, a.pid!, n)).toEqual(["leave", hex(other.equipped.parts)]); expect(seen(b, a.pid!, n)).toEqual(both(other.equipped.parts));
  });
  it("rapid changes (two within the redraw's gap): one leave, then one join with the LAST look", async () => {
    const { h, a, b } = await setup();
    await enter(b, ACADEMY_PORT, 1, look({}, 1)); await enter(a, ACADEMY_PORT, 1, look({}, 1)); await h.tick(1500);
    const n = b.room!.mark(), first = look({ hair: 11 }, 1), last = look({ hair: 12, glasses: 0x50 }, 1);
    a.room!.send(0x4170, cat(be32(1), first, new Uint8Array(4))); await h.tick(60);
    a.room!.send(0x4170, cat(be32(1), last, new Uint8Array(4))); await h.tick(60);
    const out = cosmeticEquip(h.game, "user-a", { id: "hair:afro-4", world: 1 }) as any;   // and an API change in the same window
    await h.tick(1500);
    const final = hex(out.equipped.parts);
    expect(redraws(b, a.pid!, n)).toEqual(["leave", final]);
    expect(updates(b, a.pid!, n).filter(([w]) => w === 1).map(([, p]) => p)).toEqual([hex(first), hex(last), final]);
    expect(await list2(h, b, a.pid!)).toBe(final);
    // and after the gap, a new change gets its own leave and join
    const m = b.room!.mark(), again = look({ hair: 10 }, 1);
    a.room!.send(0x4170, cat(be32(1), again, new Uint8Array(4))); await h.tick(1500);
    expect(redraws(b, a.pid!, m)).toEqual(["leave", hex(again)]);
  });
  it("a corrected look: B's redraw carries what the server kept, not what A sent", async () => {
    const { h, a, b } = await setup();
    await enter(b, ACADEMY_PORT, 1, look({}, 1)); await enter(a, ACADEMY_PORT, 1, look({}, 1)); await h.tick(1500);
    const n = b.room!.mark(), sent = look({ hair: 4, outfit: 0x82 }, 1), kept = look({ hair: 4, outfit: 0x80 }, 1);   // Obelisk Blue, never reached: Slifer Red
    a.room!.send(0x4170, cat(be32(1), sent, new Uint8Array(4))); await h.tick(1500);
    expect(redraws(b, a.pid!, n)).toEqual(["leave", hex(kept)]);
    expect(seen(b, a.pid!, n)).toEqual(both(kept));
    const m = b.room!.mark();                                                       // the same forbidden look again: kept the same, nothing
    a.room!.send(0x4170, cat(be32(1), sent, new Uint8Array(4))); await h.tick(1500);
    expect(redraws(b, a.pid!, m)).toEqual([]);
  });
  it("a viewer in the other world's area gets the 0x4181s only (both worlds; it doesn't draw A there)", async () => {
    const { h, a, b, c } = await setup();
    await enter(b, DOMINO_PORT, 0, look({}, 0)); await enter(c, ACADEMY_PORT, 1, look({}, 1)); await enter(a, ACADEMY_PORT, 1, look({}, 1)); await h.tick(1500);
    const nb = b.room!.mark(), nc = c.room!.mark(), na = a.room!.mark(), next = look({ hair: 12 }, 1);
    a.room!.send(0x4170, cat(be32(1), next, new Uint8Array(4))); await a.room!.wait(0x4171, na); await h.tick(1500);
    expect(redraws(c, a.pid!, nc)).toEqual(["leave", hex(next)]);
    expect(redraws(b, a.pid!, nb)).toEqual([]); expect(updates(b, a.pid!, nb)).toEqual([[0, hex(next)], [1, hex(next)]]);
  });
});

describe("a rank change shows nothing new and takes nothing back", () => {
  it("a demoted Obelisk keeps the uniform on, in both worlds, on B's screen", async () => {
    const { h, a, b, edit } = await setup({ school: 1900 });
    await enter(b, ACADEMY_PORT, 1, look({}, 1)); await enter(a, ACADEMY_PORT, 1, look({ outfit: 0x82 }, 1));
    a.room!.send(0x4170, cat(be32(0), look({ outfit: 0x82 }, 1), new Uint8Array(4))); await h.tick(300);   // the same look, from Domino
    const n = b.room!.mark();
    edit((st) => { const r = st.accounts[A].profiles["0"].rank; Object.assign(r, { rating: 1200, school: "slifer" }); });
    pushRankBits(h.game, [A]); await h.tick(200);
    expect(updates(b, a.pid!, n)).toEqual([]);
    expect(stored(h).map((x) => x.slice(12, 14))).toEqual(["82", "82"]);
    expect(await list2(h, b, a.pid!)).toBe(hex(look({ outfit: 0x82 }, 1)));
    const na = a.room!.mark(), nb = b.room!.mark();                                // and it still goes through, sent again
    a.room!.send(0x4170, cat(be32(1), look({ outfit: 0x82 }, 1), new Uint8Array(4))); await a.room!.wait(0x4171, na); await h.tick(200);
    expect(updates(b, a.pid!, nb)).toEqual([[0, hex(look({ outfit: 0x82 }, 1))], [1, hex(look({ outfit: 0x82 }, 1))]]);
  });
});
