// The battle planner (src/duel/ai/battlePlan.ts): whole Battle Phase plans compared by survival, lethal, the
// opponent's reply, the board, then the fewest attacks.
import { describe, expect, it } from "vitest";
import { compareVerdicts, nextAttack, outcomeScore, planBattle, planEnd, replyPosition, UNKNOWN_WALL, type PlanAttacker, type PlanMon } from "../src/duel/ai/battlePlan.ts";
import type { Position } from "../src/duel/ai/evaluate.ts";

const up = (seq: number, atk: number, def = 0): PlanMon => ({ seq, atk, def, faceDown: false, attackPos: true, known: true, flipRisk: 0 });
const guard = (seq: number, atk: number, def: number): PlanMon => ({ seq, atk, def, faceDown: false, attackPos: false, known: true, flipRisk: 0 });
// as heuristicBot builds an unknown set monster: the UNKNOWN_WALL DEF prior
const set = (seq: number): PlanMon => ({ seq, atk: 0, def: UNKNOWN_WALL, faceDown: true, attackPos: false, known: false, flipRisk: 300 });
const atk = (index: number, m: PlanMon, canDirect = false): PlanAttacker => ({ index, seq: m.seq, atk: m.atk, canDirect });

function plan(my: PlanMon[], opp: PlanMon[], o: { myLp?: number; oppLp?: number } = {}) {
  const base: Position = { myMon: my, oppMon: opp, myLp: o.myLp ?? 8000, oppLp: o.oppLp ?? 8000, myHand: 3, myBackrow: 1, oppBackrow: 0 };
  return planBattle({ base, my, opp, attackers: my.filter((m) => m.attackPos).map((m, i) => atk(i, m)) });
}

describe("battle planner", () => {
  const guarded = (my: PlanMon[], opp: PlanMon[], negates: number, oppLp = 8000) => ({
    base: { myMon: my, oppMon: opp, myLp: 8000, oppLp, myHand: 3, myBackrow: 0, oppBackrow: 0 },
    my, opp, attackers: my.map((m, i) => atk(i, m)), oppAttackNegates: negates,
  });

  it("plays around public attack negation instead of wasting its strongest attack (duel 911)", () => {
    const input = guarded([up(0, 2500), up(1, 1700)], [{ ...up(2, 1700), effectThreat: 1000 }], 1);
    expect(planBattle(input).attacks[0]).toMatchObject({ target: 2 });
    // If Gardna negates Horn, Hunter still trades for the removal threat instead of passing.
    expect(nextAttack({ ...input, oppAttackNegates: 0, attackers: [input.attackers[1]!] })).toMatchObject({ seq: 1, target: 2 });
    expect(planEnd(input).end.oppMon).toHaveLength(0);
  });

  it("does not promise lethal through a public negation unless the remaining attacks also win", () => {
    expect(planBattle(guarded([up(0, 2500)], [], 1, 2400)).outcome.lethal).toBe(false);
    expect(planBattle(guarded([up(0, 2500), up(1, 2500)], [], 1, 2400)).outcome.lethal).toBe(true);
    expect(planBattle(guarded([up(0, 2500), up(1, 2500)], [], 2, 2400)).outcome.lethal).toBe(false);
  });

  it("makes the defender spend an answer instead of passing forever", () => {
    expect(nextAttack(guarded([up(0, 2500)], [], 1))).toMatchObject({ seq: 0, target: null });
  });

  it("allows the opponent to save its answer rather than assuming it will negate a bad attack", () => {
    expect(nextAttack(guarded([up(0, 1000)], [up(1, 3000)], 1))).toBeNull();
  });

  it("keeps the ordinary strongest-first decision when no public answer remains", () => {
    expect(nextAttack(guarded([up(0, 2500), up(1, 1700)], [up(2, 1700)], 0))).toMatchObject({ seq: 0 });
  });
  it("takes lethal with the fewest attacks", () => {
    const a = up(0, 2500), b = up(1, 1800), c = up(2, 1200);
    const p = plan([a, b, c], [], { oppLp: 2400 });
    expect(p.outcome.lethal).toBe(true);
    expect(p.attacks).toHaveLength(1);
    expect(p.attacks[0]).toMatchObject({ seq: 0, target: null });
  });

  it("clears the blocker first, then swings for lethal", () => {
    const a = up(0, 2000), b = up(1, 1900);
    const p = plan([a, b], [up(3, 1500)], { oppLp: 2400 });
    expect(p.outcome.lethal).toBe(true);
    expect(p.attacks.map((x) => x.target)).toEqual([3, null]);
  });

  it("never attacks into a bigger monster for nothing", () => {
    const p = plan([up(0, 1400)], [up(2, 1800)]);
    expect(p.attacks).toHaveLength(0);
  });

  it("does not leave itself dead to the opponent's next Battle Phase", () => {
    // attacking with both clears their 1000 but leaves our 1200 alone in attack under a 2600: their reply would hit for
    // 1400 + 2600 on an empty field... the plan keeps us alive at 2500 LP
    const p = plan([up(0, 1200), up(1, 1100)], [up(4, 2600), up(5, 1000)], { myLp: 2500 });
    expect(p.outcome.diesToReply).toBe(false);
  });

  it("leads with the strongest attacker", () => {
    const p = plan([up(0, 1600), up(1, 2400)], []);
    expect(p.attacks[0]!.seq).toBe(1);
  });

  it("an unknown set monster is a 1600-DEF wall: a 1600 does not attack it, a 1700 does", () => {
    expect(UNKNOWN_WALL).toBe(1600);
    expect(plan([up(0, 1600)], [set(2)]).attacks).toHaveLength(0);
    expect(plan([up(0, 1700)], [set(2)]).attacks[0]).toMatchObject({ target: 2 });
  });

  it("Master Duel's verdict: leaving the opponent lethal on the board is the worst end", () => {
    // ending with their 2000 able to kill us at 1500 LP on an open field ranks below a board that blocks it
    const open: Position = { myMon: [], oppMon: [up(3, 2000)], myLp: 1500, oppLp: 8000, myHand: 0, myBackrow: 0, oppBackrow: 0 };
    const walled: Position = { ...open, myMon: [guard(0, 0, 2100)] };
    expect(compareVerdicts(outcomeScore(walled), outcomeScore(open))).toBeGreaterThan(0);
  });

  it("a battle-proof monster survives the attack; the damage through it still counts", () => {
    const reaper = { ...up(2, 300, 200), battleProof: true };
    // attacking it gains no kill: a 1600 does not bother
    expect(plan([up(0, 1600)], [{ ...reaper, attackPos: false }]).attacks).toHaveLength(0);
    // in attack position it still takes the damage (lethal through it at 1300 LP)
    const p = plan([up(0, 1600)], [reaper], { oppLp: 1300 });
    expect(p.outcome.lethal).toBe(true);
    // the reply: their 2000 cannot destroy our defending Spirit Reaper and cannot attack past it
    const after = replyPosition({ myMon: [{ ...guard(0, 300, 200), battleProof: true }], oppMon: [up(3, 2000)], myLp: 50, oppLp: 8000, myHand: 0, myBackrow: 0, oppBackrow: 0 });
    expect(after.myMon).toHaveLength(1);
    expect(after.myLp).toBe(50);
  });

  it("counts the reply in full: a body sure to die is not worth its board power", () => {
    // their 1800 runs over our 1250 in attack position (550 damage); the reply leaves the same board either way
    const atkPos = replyPosition({ myMon: [up(0, 1250, 700)], oppMon: [up(3, 1800)], myLp: 8000, oppLp: 8000, myHand: 4, myBackrow: 0, oppBackrow: 0 });
    expect(atkPos.myMon).toHaveLength(0);
    expect(atkPos.myLp).toBe(7450);
  });

  it("the reply ply: their attackers hit what they beat, then our LP", () => {
    const after = replyPosition({ myMon: [guard(0, 0, 2000), up(1, 1000)], oppMon: [up(3, 1800), up(4, 1700)], myLp: 3000, oppLp: 8000, myHand: 0, myBackrow: 0, oppBackrow: 0 });
    // 1800 destroys our 1000 (800 damage); 1700 cannot beat the 2000 wall and does not attack
    expect(after.myMon).toHaveLength(1);
    expect(after.myLp).toBe(2200);
  });
});

// Master Duel's attack decision: one attack at a time, made only when it gains something.
function next(my: PlanMon[], opp: PlanMon[], o: { myLp?: number; oppLp?: number } = {}) {
  const base: Position = { myMon: my, oppMon: opp, myLp: o.myLp ?? 8000, oppLp: o.oppLp ?? 8000, myHand: 3, myBackrow: 1, oppBackrow: 0 };
  return nextAttack({ base, my, opp, attackers: my.filter((m) => m.attackPos).map((m, i) => atk(i, m)) });
}
const proof = (m: PlanMon): PlanMon => ({ ...m, battleProof: true });

describe("next attack (Master Duel's decision)", () => {
  it("kills the monster it beats although a battle-indestructible one stays (duel 303: Lyla + Spirit Reaper)", () => {
    const a = next([up(0, 2500), up(1, 1400)], [guard(3, 1700, 200), proof(guard(4, 300, 200))]);
    expect(a).toMatchObject({ target: 3 });
  });

  it("does not attack a lone battle-indestructible defender, nor into a bigger monster", () => {
    expect(next([up(0, 2500)], [proof(guard(3, 300, 200))])).toBeNull();
    expect(next([up(0, 1400)], [up(3, 1800)])).toBeNull();
  });

  it("does not trade for an equal monster, does for a better one", () => {
    expect(next([up(0, 2000)], [up(3, 2000)])).toBeNull();
    expect(next([up(0, 2000, 0)], [up(3, 2000, 2500)])).toMatchObject({ target: 3 });
  });

  it("attacks directly onto an empty field; a set unknown monster only above the 1600 wall", () => {
    expect(next([up(0, 1000)], [])).toMatchObject({ target: null });
    expect(next([up(0, 1600)], [set(3)])).toBeNull();
    expect(next([up(0, 1700)], [set(3)])).toMatchObject({ target: 3 });
  });

  it("a blocker the strongest attacker runs over goes first: the strongest, so the next can follow", () => {
    expect(next([up(0, 1900), up(1, 2000)], [up(3, 1500)])).toMatchObject({ seq: 1, target: 3 });
  });

  // ---- rev 9 (AI rev 8's live duels)
  const input = (my: PlanMon[], opp: PlanMon[], attackers: PlanAttacker[]) => ({
    base: { myMon: my, oppMon: opp, myLp: 8000, oppLp: 8000, myHand: 3, myBackrow: 0, oppBackrow: 0 } as Position, my, opp, attackers });

  it("a piercing attacker hits a defending Spirit Reaper for the difference (duel 467)", () => {
    const spear = up(0, 700);
    const reaper = { ...guard(2, 300, 200), battleProof: true };
    expect(nextAttack(input([spear], [reaper], [atk(0, spear)]))).toBeNull();
    expect(nextAttack(input([spear], [reaper], [{ ...atk(0, spear), pierce: true }]))).toMatchObject({ seq: 0, target: 2 });
  });

  it("does not attack a Gladiator Beast it cannot destroy (duel 446)", () => {
    const maiden = up(0, 850);
    const secutor = { ...up(2, 400, 300), battleProof: true, battleTrigger: true };
    expect(nextAttack(input([maiden], [secutor], [atk(0, maiden)]))).toBeNull();
  });

  it("killing Newdoria costs the attacker (duel 457)", () => {
    const newdoria = { ...up(2, 1200, 800), revenge: true };
    const big = up(0, 2400);
    expect(nextAttack(input([big], [newdoria], [atk(0, big)]))).toBeNull();
  });

  it("a borrowed monster probes a lone set monster (duel 435)", () => {
    const tomato = up(0, 1400, 1100);
    expect(nextAttack(input([tomato], [set(2)], [atk(0, tomato)]))).toBeNull();
    expect(nextAttack(input([tomato], [set(2)], [{ ...atk(0, tomato), lent: true }]))).toMatchObject({ seq: 0, target: 2 });
  });
});
