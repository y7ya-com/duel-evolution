// py research/persistencia/proposal.py notes (its selftest «Lote L5» and the round trip: B05 valid cards, B06 NPCBIN,
// B07 挑戦権, B08 chains, B09 prize queue, B10 titles, B12 active slot, B24, B51 duel stats, B74 titles, 12-10 LV and
// country, 08-10 per-connection duel deck, rx/XP 13-10) -> src/game/persist.ts.
// Not here: B70 DUELPASS, §13 DP cost and §14 start DP once per account: Duel Evolution drops the 2008 DP economy
// (persist.ts WIRE_UNUSED_DP).
import { afterEach, describe, expect, it, vi } from "vitest";
import * as PP from "../src/game/persist.ts";
import { harness, be32, cards32, i32, pairs, pc, u16, u32 } from "./notes-harness.ts";

afterEach(() => { vi.useRealTimers(); });

const game = () => harness().game;
/** The last card with art in py's valid_cards.json (YO2 3254, Dark Simorgh). */
const TOP = pc(3254);
/** A card in the client's table without art (YO2 1111, Insect Monster Token; py's example was the art-less id 171). */
const NOART = pc(1111);
/** A real passcode the 2008 client has no card for (Ash Blossom & Joyous Spring; py's example was id 3256). */
const UNKNOWN = 14558127;
/** Decode a spec back to values (py decode). */
function decode(spec: typeof PP.PSELECT_SPEC, b: Uint8Array): Record<string, any> {
  const dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
  const o: Record<string, any> = {};
  let i = 0;
  for (const [k, t] of spec) {
    if (t === "u8") o[k] = b[i++];
    else if (t === "u16") { o[k] = dv.getUint16(i); i += 2; }
    else if (t === "u32") { o[k] = dv.getUint32(i); i += 4; }
    else if (t === "s32") { o[k] = dv.getInt32(i); i += 4; }
    else { o[k] = b.subarray(i, i + 16); i += 16; }
  }
  return o;
}

describe("round trip (proposal.py selftest)", () => {
  it("trunk 0x3101 + 0x3102 chunks of (u32 passcode, u8 copies), <= 204 pairs each, + 0x3103", () => {
    const p = PP.blankProfile("Prueba"); p.trunk = {};
    PP.trunkAdd(null, p, [pc(1), pc(1), pc(2), TOP, 0, NOART, UNKNOWN]);
    const msgs = PP.trunkMessages(p);
    expect(msgs.map(([m]) => m)).toEqual([0x3101, 0x3102, 0x3103]);
    const got = pairs(msgs.filter(([m]) => m === 0x3102).map(([, d]) => d));
    expect(got).toEqual([[pc(1), 2], [pc(2), 1], [TOP, 1]].sort((a, b) => a[0] - b[0]));
    // every valid card: as many chunks as it takes, each within 1024 B
    const all = PP.blankProfile("Todo"); all.trunk = Object.fromEntries([...PP.validCardIds()].map((c) => [c, 3]));
    const big = PP.trunkMessages(all).filter(([m]) => m === 0x3102).map(([, d]) => d);
    expect([big.length, Math.max(...big.map((d) => d.length)), pairs(big).length])
      .toEqual([Math.ceil(PP.validCardIds().size / 204), 204 * 5, PP.validCardIds().size]);
  });

  it("PBIN is 128 B (bit b -> byte b >> 3, mask 1 << (b & 7)); NPCBIN is 512 B, 4 per NPC", () => {
    const p = PP.blankProfile("x");
    PP.pbinSet(p, 0x302);
    expect(PP.pbinBytes(p)[0x302 >> 3] & (1 << (0x302 & 7))).toBeTruthy();
    PP.npcbinSet(p, 51, [1, 2, 3, 4]);
    const nb = PP.npcbinBytes(p);
    expect([nb.length, ...nb.subarray(51 * 4, 51 * 4 + 4)]).toEqual([512, 1, 2, 3, 4]);
  });

  it("PSELECTRESULT 0x4101 is 133 B (MP at offset 31, TP at 22, champ_pending 0); PDU 0x4140 125 B; PLAYERLIST entry 76 B", () => {
    const p = PP.blankProfile("Prueba");
    Object.assign(p.rec, { mp: 12345, wins: 7, losses: 3, lv: 5, title: 0xf102, tp: 99, score: -5 });
    PP.npcbinSet(p, 51, [1, 2, 3, 4]);
    const ps = PP.pselectResult(p, 1);
    const d = decode(PP.PSELECT_SPEC, ps);
    expect([ps.length, d.mp, d.player_id, d.champ_pending, u32(ps, 31), u32(ps, 22)]).toEqual([133, 12345, 1, 0, 12345, 99]);
    const pdu = PP.playerDataUpdate(p, 51);
    const e = decode(PP.PDU_SPEC, pdu);
    expect([pdu.length, e.npc_index, e.npc_b0, e.npc_b3]).toEqual([125, 51, 1, 4]);
    const pe = PP.playerEntry("0", p);
    expect(pe.length).toBe(76);
    expect(i32(pe, 18)).toBe(-5);                       // score is s32
  });

  it("the duel deck: 0x6600 counts, 0x6601 main, 0x6603 extra (the side never comes)", () => {
    const dd = new PP.DuelDeck();
    dd.feed(0x6600, be32(2, 0, 1));
    dd.feed(0x6601, cards32(pc(5), pc(6)));
    expect(dd.feed(0x6603, cards32(pc(10)))).toBe(true);
    expect([dd.main, dd.extra]).toEqual([[pc(5), pc(6)], [pc(10)]]);
  });
});

describe("B05 valid cards", () => {
  // (py also checked TOP <= CARD_ID_MAX: passcodes have no id ceiling, the client's card table decides)
  it("B05: a card the client lacks and 0 out, the last card with art in; a card without art out", () => {
    expect([PP.cardOk(UNKNOWN), PP.cardOk(0), PP.cardOk(TOP), PP.cardOk(NOART)]).toEqual([false, false, true, false]);
  });
  it("B05: sanitize_trunk drops a card the client lacks, one without art and junk keys", () => {
    const q = { trunk: { [pc(1)]: 3, [UNKNOWN]: 3, [NOART]: 2, x: 1 } };
    expect([PP.sanitizeTrunk(q).sort(), q.trunk]).toEqual([[String(NOART), String(UNKNOWN), "x"].sort(), { [pc(1)]: 3 }]);
  });
  it("B05: the trunk table never sends a saved card the client lacks", () => {
    expect(PP.trunkPairs({ trunk: { [UNKNOWN]: 3, [pc(1)]: 1 } })).toEqual([[pc(1), 1]]);
  });
  it("B05: DuelDeck.bad_ids reports ids the client can't paint", () => {
    const dd = new PP.DuelDeck();
    dd.feed(0x6601, cards32(pc(5), UNKNOWN));
    expect(dd.badIds()).toEqual([UNKNOWN]);
  });
  it("B05: the 0x3100 trunk a client gets has no invalid id, even if state.json has one", async () => {
    const h = harness();
    const A = h.client("A");
    await A.account(0, "Alice");
    const st = h.state(); const acc = Object.values(st.accounts)[0] as any;
    acc.profiles["0"].trunk = { [pc(1)]: 2, [NOART]: 3, [UNKNOWN]: 3 }; h.game.store.saveRaw(st);
    const a = A.link(5731);
    a.send(0x3003, A.key); await a.wait(0x3004);
    const n = a.mark(); a.send(0x3100, [0]); await a.wait(0x3103, n);
    expect(pairs(a.all(0x3102, n))).toEqual([[pc(1), 2]]);
    expect((Object.values(h.state().accounts)[0] as any).profiles["0"].trunk).toEqual({ [pc(1)]: 2 });
  });
});

describe("B06/B08/B09 NPC results, chains and prizes", () => {
  it("B06: npc_result lose -> b1, draw -> b2 (b0 wins, b1 LOSSES, b2 draws)", () => {
    expect(PP.npcResult([0, 0, 0, 1], "lose")).toEqual([0, 1, 0, 1]);
    expect(PP.npcResult([0, 0, 0, 1], "draw")).toEqual([0, 0, 1, 1]);
  });
  it("B06: a lost NPC duel counts in b1 and leaves b3 alone", () => {
    const g = game();
    const p = PP.profile({ players: { 0: "Player1" } }, 0)!;
    PP.npcDuelResult(g, p, 18, "lose");
    expect(PP.npcbinGet(p, 18)).toEqual([0, 1, 0, 0]);
  });
  it("B07 + research/mundo «challenge»: ITEMGET(1) gives Marik's 挑戦権 (594) free; it stays in the PBIN and the 2nd ITEMGET(1) is empty", () => {
    const g = game();
    const p = PP.profile({ players: { 0: "X" } }, 0)!;
    p.trunk = {};
    const r = PP.onItemget(g, p, 1, 0);
    expect([u16(r), u16(r, 2), u16(r, 4)]).toEqual([1, 594, 0]);
    expect(PP.pbinTest(p, 594)).toBe(true);
    expect([...PP.onItemget(g, p, 1, 0)]).toEqual([0, 0, 0, 0]);
  });
  it("research/mundo «challenge»: Kaiba's 挑戦権 (592) after 5 wins against one of his originals (KC Dragon 6); 4 against lalala (31) are not enough for 593", () => {
    const g = game();
    const p = PP.blankProfile("x"); p.trunk = {};
    PP.npcbinSet(p, 6, [5, 0, 0, 1]); PP.npcbinSet(p, 31, [4, 0, 0, 1]);
    expect(PP.challengeRightsDue(p, g)).toEqual([594, 592]);
  });
  it("B08: chain_fields(53) = (T, 52); without 52 in the list the previous is 0; outside chains (T, 0)", () => {
    const T = PP.CHAIN_THRESHOLD;
    expect([PP.chainFields(53, [51, 52, 53]), PP.chainFields(53, [51, 53]), PP.chainFields(18), PP.chainFields(96)])
      .toEqual([[T, 52], [T, 0], [T, 0], [T, 0]]);
  });
  it("B08 + B09: a win raises b3; 1st win (b3 1->2) sets the 途中景品 GET済み, but alone it is no present (blank gift: DESIGN.md)", () => {
    const g = game();
    const p = PP.profile({ players: { 0: "X" } }, 0)!;
    PP.onItemget(g, p, 4, 53);
    const r1 = PP.npcDuelResult(g, p, 53, "win");
    const prize = PP.NPC_PRIZE_BITS;
    expect([PP.npcbinGet(p, 53), r1.present, r1.pkg, PP.pbinTest(p, prize["53"].mid_got)]).toEqual([[1, 0, 0, 2], 0, null, true]);
    expect(PP.takePresent(p)).toBe(0);
  });
  it("B09: 3rd win (b3 = 4): コンプ (619) + Yugi friendship title (160) + clothes (121); ITEMGET(3) hands it over once", () => {
    const g = game();
    const p = PP.profile({ players: { 0: "X" } }, 0)!;
    p.trunk = {};                                       // (a full trunk would also queue the collection titles)
    PP.onItemget(g, p, 4, 53);
    PP.npcDuelResult(g, p, 53, "win"); PP.npcDuelResult(g, p, 53, "win");
    const r3 = PP.npcDuelResult(g, p, 53, "win");
    expect(r3.pkg.bits).toEqual([619, 160, 121]);
    const rep = PP.onItemget(g, p, 3, 0);
    expect([rep.length, ...rep.subarray(0, 4)]).toEqual([10, 0, 3, 2, 0x6b]);
    expect([619, 160, 121].every((b) => PP.pbinTest(p, b))).toBe(true);
    expect(p.pending.filter((x: any) => x.via === "npc")).toEqual([]);
    expect([...PP.onItemget(g, p, 3, 0)]).toEqual([0, 0, 0, 0]);
  });
  it("B09: the login scene's right: ITEMGET(3) clears it and sets its «済み», which is not listed (class 6: a blank page)", () => {
    const g = game();
    const prize = PP.NPC_PRIZE_BITS;
    const q = PP.blankProfile("y"); PP.pbinSet(q, prize["18"].mid_right);
    const rep = PP.onItemget(g, q, 3, 0);
    expect([PP.pbinTest(q, prize["18"].mid_right), PP.pbinTest(q, prize["18"].mid_got), [...rep]])
      .toEqual([false, true, [0, 0, 0, 0]]);
    const r = PP.blankProfile("r"); PP.pbinSet(r, prize["18"].comp_right);   // the コンプ «済み» is a recipe (class 8): listed
    expect([...PP.onItemget(g, r, 3, 0)]).toEqual([0, 1, prize["18"].comp_got >> 8, prize["18"].comp_got & 0xff, 0, 0]);
  });
  it("B09: an old unclaimed prize does not come out with another NPC", () => {
    const g = game();
    const q = PP.blankProfile("z");
    // the 3rd win gives the コンプ recipe (the 1st win's 途中景品 flag alone is no package: blank gift, DESIGN.md)
    for (const n of [18, 20]) for (let i = 0; i < 3; i++) PP.npcDuelResult(g, q, n, "win");
    expect(q.pending.map((x: any) => x.src.slice(0, 6))).toEqual(["NPC 20"]);
  });
});

describe("B10 titles (and research/mundo title_owned)", () => {
  it("B10: 0x4174 brings the BIT, the record keeps the ID: 224 -> 0, 230 -> 0xf102, 160 -> 0xf124", () => {
    expect([PP.titleIdFromBit(224), PP.titleIdFromBit(230), PP.titleIdFromBit(160)]).toEqual([0, 0xf102, 0xf124]);
  });
  it("B10: on_title stores the id of an owned title; an unknown or not owned bit -> 0x4175 = 1, unchanged", () => {
    const q = PP.blankProfile("t");
    PP.pbinSet(q, 230);
    expect([[...PP.onTitle(q, 230)], q.rec.title]).toEqual([[0, 0, 0, 0], 0xf102]);
    expect([[...PP.onTitle(q, 5)], q.rec.title]).toEqual([[0, 0, 0, 1], 0xf102]);
    expect([[...PP.onTitle(q, 160)], q.rec.title]).toEqual([[0, 0, 0, 1], 0xf102]);   // not owned
  });
  it("research/mundo: staff titles (225, 226) only for GM accounts", () => {
    const g = game();
    const q = PP.blankProfile("t"); PP.pbinSet(q, 226);
    expect(i32(PP.onTitle(q, 226, g))).toBe(1);
  });
  it("B10: an old bit saved as title comes out as its id in PSELECT", () => {
    const q = PP.blankProfile("t"); q.rec.title = 230;
    expect(decode(PP.PSELECT_SPEC, PP.pselectResult(q, 1)).title).toBe(0xf102);
  });
  it("B10 (h_title over the wire): 0x4174 bit -> 0x4175 s32 0 and the id saved", async () => {
    const h = harness();
    const A = h.client("A");
    await A.account(0, "Alice");
    const st = h.state(); PP.pbinSet((Object.values(st.accounts)[0] as any).profiles["0"], 230); h.game.store.saveRaw(st);
    await A.enterRoom();
    const n = A.room!.mark(); A.room!.send(0x4174, be32(230));
    expect(i32((await A.room!.wait(0x4175, n))!)).toBe(0);
    expect((Object.values(h.state().accounts)[0] as any).profiles["0"].rec.title).toBe(0xf102);
  });
});

describe("B51/B74 duel stats and achievement titles", () => {
  it("B51: duel stats, surrender and turns add to the record; unknown keys ignored", () => {
    const g = game();
    const q = PP.blankProfile("s");
    PP.npcDuelResult(g, q, 18, "lose", 3, 0, { tribute1: 2, spell_me: 5, nope: 9 }, "me");
    expect([q.rec.tribute1, q.rec.spell_me, q.rec.surrender_me, q.rec.turns, q.rec.nope]).toEqual([2, 5, 1, 3, undefined]);
  });
  it("B51: a u16 counter saturates at 65535", () => {
    const r = { tribute1: 2 };
    PP.recInc(r, "tribute1", 70000);
    expect(r.tribute1).toBe(0xffff);
  });
  it("B74: the 10th win -> DUELISTA DE BRONCE (250) by ITEMGET(1)", () => {
    const g = game();
    const q = PP.blankProfile("t74"); q.trunk = {}; q.rec.duels_won = 9;
    PP.npcDuelResult(g, q, 18, "win");
    const r = PP.onItemget(g, q, 1, 0);
    const bits = Array.from({ length: u16(r) }, (_, i) => u16(r, 2 + 2 * i));
    expect(bits.includes(250) || PP.pbinTest(q, 250)).toBe(true);
  });
  it("B74: surrendering on turn 1 -> title 255", () => {
    const g = game();
    const q = PP.blankProfile("t255"); q.trunk = {};
    PP.npcDuelResult(g, q, 18, "lose", 1, 0, null, "me");
    expect(PP.pbinTest(q, 255)).toBe(true);
  });
});

describe("profiles (B12, B24, 12-10)", () => {
  it("B24: wallet() saves only when it had to create the profile", () => {
    const h = harness({ players: { 0: "Player1" }, profiles: {} });
    let saves = 0;
    h.game.store.onSave = () => { saves++; };
    const H = h.game.ph as any;
    H.wallet(); const n1 = saves; H.wallet(); H.wallet();
    expect([n1, saves]).toEqual([1, 1]);
  });

  it("B12: the active slot is the last 0x3100 (GETTRUNK) / 0x4100 (PSELECT)", async () => {
    const h = harness();
    const A = h.client("A");
    await A.account(0, "Uno"); await A.account(2, "Tres");
    const acc = () => Object.values(h.state().accounts)[0] as any;
    expect(acc().active_slot).toBe(2);
    await A.enterRoom(0, 5, 0);
    expect(acc().active_slot).toBe(0);
  });

  it("12-10: a new character starts at LV 1 and gets the flag of the client's language (0x4100 byte 0)", async () => {
    const h = harness();
    const A = h.client("A");
    await A.account(0, "Alice");
    await A.enterRoom(0, 2);                            // German client
    const p = (Object.values(h.state().accounts)[0] as any).profiles["0"];
    expect([p.rec.lv, p.country]).toEqual([1, "DE"]);
    const n = A.room!.mark(); A.room!.send(0x4210, be32(0xffffffff)); await A.room!.wait(0x4213, n);
    const me = A.room!.all(0x4212, n)[0];
    expect(String.fromCharCode(...me.subarray(30, 32))).toBe("DE");
  });

  it("12-10: an existing character keeps its country when the client's language changes", async () => {
    const h = harness();
    const A = h.client("A");
    await A.account(0, "Alice");
    await A.enterRoom(0, 2);
    A.room!.send(0x0003); await h.tick(400); A.room!.close(); await h.tick(50);
    await A.enterRoom(0, 5);
    expect((Object.values(h.state().accounts)[0] as any).profiles["0"].country).toBe("DE");
  });

  it("08-10: the duel deck is collected PER CONNECTION and saved as the character's last_duel", () => {
    const h = harness({ players: { 0: "Uno" } });
    const g = h.game;
    const mk = () => ({ ext: {}, sess: null } as any);
    const c1 = mk(), c2 = mk();
    PP.saveDuelDeck(g, c1, 0x6600, be32(2, 0, 1));
    PP.saveDuelDeck(g, c2, 0x6600, be32(1, 0, 1));
    PP.saveDuelDeck(g, c1, 0x6601, cards32(pc(5), pc(6)));
    PP.saveDuelDeck(g, c2, 0x6601, cards32(pc(7)));
    PP.saveDuelDeck(g, c1, 0x6603, cards32(pc(10)));
    const ld = h.state().profiles["0"].decks.last_duel;
    expect([ld.main, ld.extra]).toEqual([[pc(5), pc(6)], [pc(10)]]);
  });
});

describe("§14 a card after the PvP (07-10)", () => {
  it("§14: 1 card per duel from PVP_CARD_PACKS, 3 for a prepared match", () => {
    const g = game();
    const pv = PP.blankProfile("P");
    const e1 = PP.pvpCardOffer(g, pv)!;
    expect([e1.n, e1.packs]).toEqual([1, PP.PVP_CARD_PACKS]);
    expect(PP.pvpCardEntry(g, true)!.n).toBe(3);
  });
  it("§14: 0x4802 with an offered pack gives n and removes it; again 0; a pack not offered 0", () => {
    const g = game();
    const pv = PP.blankProfile("P");
    PP.pvpCardOffer(g, pv);
    const p0 = PP.PVP_CARD_PACKS[0];
    expect([PP.pvpCardTake(pv, 99999), PP.pvpCardTake(pv, p0), PP.pvpCardTake(pv, p0), PP.PVP_CARD_KEY in pv]).toEqual([0, 1, 0, false]);
  });
  it("§14: at most PVP_CARD_DUE_MAX (5) pending", () => {
    const g = game();
    const pv = PP.blankProfile("P");
    for (let i = 0; i < 8; i++) PP.pvpCardOffer(g, pv);
    expect(pv[PP.PVP_CARD_KEY].length).toBe(5);
  });
  it("§14: without a chooser (disconnected) the card goes straight to the trunk", () => {
    const g = game();
    const pg = PP.blankProfile("G"); pg.trunk = {};
    const [pk, cs] = PP.pvpCardGrant(g, pg, PP.pvpCardEntry(g)!, (_k, n) => new Array(n).fill(pc(1)));
    expect([PP.PVP_CARD_PACKS.includes(pk), cs, pg.trunk]).toEqual([true, [pc(1)], { [pc(1)]: 1 }]);
  });
  it("§14 over the wire: 0x4802 with the offered pack -> 0x4803 with 1 card, into the trunk", async () => {
    const h = harness();
    const A = h.client("A"); await A.account(0, "Alice"); await A.enterRoom();
    const st = h.state(); const p = (Object.values(st.accounts)[0] as any).profiles["0"];
    PP.pvpCardOffer(h.game, p); p.trunk = {}; h.game.store.saveRaw(st);
    const n = A.room!.mark(); A.room!.send(0x4802, [0, PP.PVP_CARD_PACKS[0]]);
    const d = (await A.room!.wait(0x4803, n))!;
    expect([i32(d), d.length]).toEqual([0, 4 + 5]);   // s32, then (u32 passcode, u8 new) per card
    const q = (Object.values(h.state().accounts)[0] as any).profiles["0"];
    expect([Object.keys(q.trunk).length, PP.PVP_CARD_KEY in q]).toEqual([1, false]);
  });
});

describe("B55/B56 NPC duel knobs", () => {
  it("B56 NPC_IN_RECORD: an NPC duel counts in Wins/Losses (outside the npcreglas no_record context)", () => {
    const g = game();
    const p = PP.blankProfile("x"); p.trunk = {};
    PP.npcDuelResult(g, p, 18, "win"); PP.npcDuelResult(g, p, 18, "lose");
    expect([p.rec.wins, p.rec.losses, p.rec.duels]).toEqual([1, 1, 2]);
  });
  it("B55: no Miles (MP) for an NPC result by default", () => {
    const g = game();
    const p = PP.blankProfile("x"); p.trunk = {};
    const mp = p.rec.mp;
    PP.npcDuelResult(g, p, 18, "win");
    expect(p.rec.mp).toBe(mp);
  });
});

describe("rx/XP 13-10 (score and LV after a PvP)", () => {
  it("13-10: a beginner stays LV 1 for the first 36 PvP duels, then the score decides the LV", () => {
    const p = PP.blankProfile("x");
    for (let i = 0; i < 35; i++) PP.pvpXp(p, 1, "win");
    expect(p.rec.lv).toBe(1);
    PP.pvpXp(p, 1, "win");
    expect(p.rec.lv).toBe(PP.xpLevelForScore(p.rec.score));
    expect(p.rec.lv).toBeGreaterThan(1);
  });
  it("13-10: a win gives 40, +7 against a higher LV; losing to a lower LV costs 16; the score never goes below 0", () => {
    expect(PP.xpGameDelta(5, 5, "win")).toBe(40);
    expect(PP.xpGameDelta(5, 6, "win")).toBe(47);
    expect(PP.xpGameDelta(5, 4, "lose")).toBe(-16);
    const p = PP.blankProfile("x"); p.rec.score = 3; p.rec.lv = 5;
    PP.pvpXp(p, 4, "lose");
    expect(p.rec.score).toBe(0);
  });
});
