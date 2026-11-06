import { describe, expect, it } from "vitest";
import * as PP from "../src/game/persist.ts";

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
