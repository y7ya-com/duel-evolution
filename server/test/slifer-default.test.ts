import { describe, expect, it } from "vitest";
import * as PP from "../src/game/persist.ts";
import * as RK from "../src/game/ranking.ts";
import { wearNewUniform } from "../src/game/cosmetics.ts";

// The default outfit is Slifer Red at any LV (owner, 2026-11-06): the Domino starter clothes (0x70-0x73) of a look
// that was never edited came back on every character past LV 5.
const hex = (outfit: number, girl = 0) => Buffer.from([girl, 0, 0x20, 0x30, 0x40, 0x60, outfit, 0x90, 0xb8, 0x20, 0, 0, 0, 0, 0, 0]).toString("hex");
const outfit = (p: PP.P, world = 1) => PP.avatarParts(p, world)[6];

describe("Slifer Red is the default outfit", () => {
  it("a Domino starter outfit nobody picked is Slifer Red, past LV 5 too", () => {
    for (const o of [0x70, 0x71, 0x72, 0x73]) {
      const p: PP.P = { rec: { lv: 12 }, avatar: { a: hex(o), b: hex(o) } };
      expect([outfit(p, 0), outfit(p, 1)]).toEqual([0x80, 0x80]);
    }
    expect(outfit({ rec: { lv: 12 }, avatar: { a: hex(0x70, 1), b: hex(0x70, 1) } })).toBe(0x80);   // a girl's
  });
  it("two saved looks with no world: the Academy one, not Domino's starter clothes", () => {
    const p: PP.P = { rec: { lv: 12 }, avatar: { a: hex(0x73), b: hex(0x88) } };
    expect([outfit(p, 0), outfit(p, 1)]).toEqual([0x88, 0x88]);
  });
  it("an outfit the player picked stays, Domino starter clothes included", () => {
    const p: PP.P = { rec: { lv: 12 }, avatar: { a: hex(0x80), b: hex(0x80) } };
    const picked = Buffer.from(hex(0x71), "hex");
    PP.outfitPicked(p, picked); PP.setLook(p, PP.normalizeLook(p, picked), 0);
    expect([outfit(p, 0), outfit(p, 1)]).toEqual([0x71, 0x71]);
    const back = Buffer.from(hex(0x80), "hex");   // and back to Slifer Red: the pick is gone
    PP.outfitPicked(p, back); PP.setLook(p, PP.normalizeLook(p, back), 1);
    expect(p.avatar.pick).toBeUndefined();
  });
  it("other outfits are untouched", () => {
    expect(outfit({ rec: { lv: 12 }, avatar: { a: hex(0x76), b: hex(0x76) } })).toBe(0x76);
  });
});

describe("a school's uniform is put on when it is reached", () => {
  const rank = (rating: number) => ({ ...RK.rankOf(null), rating, rd: 60, games: 20, wins: 10, losses: 10,
    school: RK.schoolAfter("beginner", rating, true), best: RK.schoolAfter("beginner", rating, true), last: 0 });
  const char = (rating: number, o = 0x80): PP.P => ({ rec: { lv: 12 }, rank: rank(rating), avatar: { a: hex(o), b: hex(o) } });
  it("Ra Yellow, then Obelisk Blue, each once", () => {
    const p = char(1500);
    p.rank = rank(1600); expect(wearNewUniform(p, "slifer")).toBe(true); expect(outfit(p)).toBe(0x81);
    p.rank = rank(1900); expect(wearNewUniform(p, "ra")).toBe(true); expect(outfit(p)).toBe(0x82);
    const q = char(1900, 0x76);   // already Obelisk: a rated game changes nothing
    expect(wearNewUniform(q, "obelisk")).toBe(false); expect(outfit(q)).toBe(0x76);
  });
  it("only the outfit changes", () => {
    const p = char(1600, 0x76); p.avatar.a = p.avatar.b = hex(0x76).replace(/^0000/, "0004");   // hair 4
    expect(wearNewUniform(p, "slifer")).toBe(true);
    expect([...PP.avatarParts(p, 0).slice(0, 7)]).toEqual([0, 4, 0x20, 0x30, 0x40, 0x60, 0x81]);
  });
  it("a school not reached, Slifer Red or Master puts nothing on", () => {
    expect(wearNewUniform(char(1500, 0x76), "beginner")).toBe(false);
    const m = char(2200, 0x76);   // Master: left alone, even straight from Ra Yellow
    expect([wearNewUniform(m, "obelisk"), wearNewUniform(m, "ra"), outfit(m)]).toEqual([false, false, 0x76]);
  });
});
