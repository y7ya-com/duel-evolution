// The rule language's named-card operators and the card facts inside a pick (src/duel/ai/ruleExpr.ts).
import { describe, expect, it } from "vitest";
import type { RuleCard, RuleCtx } from "../src/duel/ai/cardRules.ts";
import { compileRule } from "../src/duel/ai/ruleExpr.ts";

const ctx: RuleCtx = {
  myLp: 8000, oppLp: 8000, myMon: [], oppMon: [], myMaxAtk: 0, oppMaxAtk: 0, myBackrow: 0, oppBackrow: 0, myGraveMaxAtk: 0,
  oppGraveMaxAtk: 0, oppHand: 5, myNames: [], myHand: 2, myHandTributes: 0, myRemoved: 0, myTurn: true, oppEndPhase: false,
  attackAtk: 0, attackLethal: false, attackOnDefense: false, oppChained: false,
  zones: { hand: ["metamorphosis", "polymerization"], deck: ['spirit message "a"', "destiny board"], field: ["destiny board"], grave: ["sangan"], fieldSpells: ["mystic plasma zone"] },
};

describe("named-card operators", () => {
  it("count my cards by zone and read the Field Spell", () => {
    const r = compileRule({
      idleActivate: { all: [{ ">=": [{ inMyHand: "metamorphosis" }, 1] }, { "==": [{ inMyDeck: "spirit message" }, 1] },
        { ">=": [{ onMyField: "destiny board" }, 1] }, { ">=": [{ inMyGrave: "sangan" }, 1] }, { fieldSpellIs: "mystic plasma" }] },
      ownTurn: true,
    }, "test");
    expect(r.idleActivate!(ctx)).toBe(true);
    expect(r.ownTurn).toBe(true);
    expect(r.idleActivate!({ ...ctx, zones: { ...ctx.zones!, hand: [] } })).toBe(false);
    expect(r.idleActivate!({ ...ctx, zones: undefined })).toBe(false);
  });

  it("score a pick by the card's own facts", () => {
    const r = compileRule({ pick: { score: { "+": ["worth", { if: ["canAttack", 1000, 0] }, { if: ["alreadyHave", -5000, 0] }, { if: ["copyOnField", 1, 0] }] } } }, "test");
    const card = { atk: 1800, def: 1000, level: 4, faceDown: false, attackPos: true, fusion: false, mine: true, onField: true, inHand: false,
      inGrave: false, inDeck: false, inExtra: false, banished: false, isMonster: true, isSpell: false, isTrap: false, name: "x",
      copyInHand: false, canAttack: true, alreadyHave: false, copyOnField: true, worth: 1800 } as RuleCard;
    expect(r.pick!.score(ctx, card)).toBe(2801);
    expect(r.pick!.score(ctx, { ...card, canAttack: false, alreadyHave: true })).toBe(1800 - 5000 + 1);
  });
});
