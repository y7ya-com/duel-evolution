// Units of the duel port (src/duel) checked against py's own selftests (research/duelfin, research/lockstep,
// research/repeticion/duellog.py, pvp_match.watch_oculta). The full flows are checked by the parity harness
// (parity/run.py npc / pvp / pvpmatch / npcmirar).
import { describe, expect, it } from "vitest";
import * as DFM from "../src/duel/duelfin.ts";
import * as DL from "../src/duel/duellog.ts";
import { comid_field, duelscore, duelsvrinfomsg, DuelSim, newDuelCfg, janken_npc, setcommand, timeup_warning } from "../src/duel/lockstep.ts";
import { watchOculta } from "../src/duel/pvpMatch.ts";
import { pc } from "./notes-harness.ts";

const u32s = (d: Uint8Array, n: number, at = 0) => Array.from({ length: n }, (_, i) => new DataView(d.buffer, d.byteOffset).getUint32(at + 4 * i));
const be4 = (...v: number[]) => { const o = new Uint8Array(4 * v.length); v.forEach((x, i) => new DataView(o.buffer).setUint32(4 * i, x)); return o; };

describe("lockstep", () => {
  it("message sizes (protocol.json)", () => {
    expect(timeup_warning(0, 180).length).toBe(10);
    expect(duelsvrinfomsg(1).length).toBe(2);
    expect(duelscore().length).toBe(36);
    expect(comid_field().length).toBe(110);
    expect(setcommand(0x1a).length).toBe(43);   // 40 + the card wire's index-slot mask, internal-slot mask, hints
  });
  it("rock-paper-scissors without luck: the player always wins", () => {
    const cfg = newDuelCfg(true);
    for (const mine of [0, 1, 2]) expect(janken_npc(cfg, mine)[1]).toBe(1);
  });
  it("skeleton duel: stage 4 sequence and hands", () => {
    const sim = new DuelSim(Array.from({ length: 40 }, (_, i) => pc(i + 1)), Array.from({ length: 40 }, (_, i) => pc(100 + i)), 0, 1);
    const seq = sim.start_sequence(4);
    expect(seq.every((m) => (m instanceof Uint8Array ? m.length === 43 : true))).toBe(true);
    expect([sim.hand[0].length, sim.hand[1].length, sim.deck[0].length]).toEqual([5, 5, 35]);
  });
});

describe("duelfin", () => {
  it("win by LP: ids and fields", () => {
    const seq = DFM.endDuelMsgs(0, DFM.WHY_LP);
    expect(seq.map(([m]) => m)).toEqual([0x6202, 0x6613, 0x6202]);
    expect(u32s(seq[0][1], 5)).toEqual([0, 5, 1, 1, 1]);
    expect([u32s(seq[2][1], 1)[0], ...u32s(seq[2][1], 2, 8)]).toEqual([0x4d, 1, 0]);
  });
  it("surrender: 0x23 first; only command 10 on the own deck is a surrender", () => {
    const seq = DFM.endDuelMsgs(1, DFM.WHY_SURRENDER);
    expect(seq.map(([m]) => m)).toEqual([0x6202, 0x6202, 0x6613, 0x6202]);
    expect(u32s(seq[0][1], 2)).toEqual([0, 0x23]);
    expect(DFM.isSurrender(be4(0, 0xd, 0, 10))).toBe(true);
    expect(DFM.isSurrender(be4(0, 0xb, 0, 10))).toBe(false);
    expect(DFM.isSurrender(be4(0, 0xd, 0, 11))).toBe(false);
  });
  it("official surrender (PvP): no 0x23, reason 12", () => {
    const seq = DFM.endDuelMsgs(1, DFM.WHY_SURRENDER, { finish: DFM.FINISH_SURRENDER, officialSurrender: true });
    expect(seq.map(([m]) => m)).toEqual([0x6202, 0x6613, 0x6202]);
    expect(u32s(seq[0][1], 5)).toEqual([0, 5, 2, 0, 12]);
    expect(u32s(seq[2][1], 2, 8)).toEqual([2, 2]);
  });
  it("confirmation dialog and why_from_ocg", () => {
    expect(DFM.surrenderConfirmMsgs().map(([, d]) => u32s(d, 4))).toEqual([[0x60, 0, 1, 0], [0x61, 0, 6, 2], [0x1b, 0x32, 2, 0]]);
    expect([1, 2, 0x10, 0x11, 0x15, 0x16, "error", "loop"].map(DFM.whyFromOcg)).toEqual(["lp", "deckout", "exodia", "finalcount", "destiny", "lp", "abort", "lp"]);
  });
  it("NPC match closed after one game (P1 = 5)", () => {
    const de = new DFM.DuelEnd(1);
    expect(u32s(de.gameOver(1, DFM.WHY_LP)[0].at(-1)![1], 2, 8)).toEqual([2, DFM.FINISH_CLOSE]);
  });
});

describe("duellog", () => {
  it("RLE pairs", () => {
    expect([...DL.rleEncode(Uint8Array.from([1, 1, 1, 2, 0, 0]))]).toEqual([1, 3, 2, 1, 0, 2]);
    expect(DL.rleEncode(new Uint8Array(300)).length).toBe(4);
  });
  it("replay start never ties", () => {
    expect(DL.replayStart([0, 0], 1).slice(0, 2)).toEqual([[1, 0], 1]);
    expect(DL.replayStart([0, 1], 0).slice(0, 2)).toEqual([[0, 1], 0]);
  });
  it("messages: header, chunks, 0x6016, 0x6012", () => {
    const pl = (pid: number): DL.LogPlayer => ({ pid, listval: pid, name: "A", parts: [], main: 40, extra: 0, country: Uint8Array.of(0x45, 0x53, 0x50, 0), hand: pid % 3 });
    const m = DL.messages([pl(1000), pl(1004)], [[0, new Uint8Array(40)]], { when: 0, roomKind: 13, games: [0, 0xff, 0xff] });
    expect(m.map(([id]) => id)).toEqual([0x6010, 0x6011, 0x6016, 0x6012]);
  });
});

describe("pvp_match", () => {
  it("watch_oculta: requests and decision windows", () => {
    const sc = (t: number, b: number, p0: number) => setcommand(t, b, [p0]);
    expect(watchOculta(sc(0x1a, 0, 3))).toBe(true);
    expect(watchOculta(sc(0x1b, 0x32, 2))).toBe(true);
    expect(watchOculta(sc(0x1b, 0x32, 0xff))).toBe(false);
    expect(watchOculta(sc(0x1b, 0x33, 0))).toBe(true);
    expect(watchOculta(sc(0x00, 0x55, 0xffff))).toBe(false);
  });
});
