// The battle planner: the whole Battle Phase planned at once instead of one attack at a time. Every order of the
// attackers and every target (an opponent's monster, or a direct attack once the field is clear or the attacker may
// attack directly anyway) is resolved exactly, and the end boards are compared in a fixed order of what matters:
//   1. a line where our own LP reaches 0 is never taken;
//   2. lethal wins, with the fewest attacks (fewer attacks walk into fewer traps);
//   3. a board the opponent's next Battle Phase kills us from loses to one it does not;
//   4. then the board, evaluate(), counting what the opponent's next Battle Phase would take from it (the reply ply);
//   5. then fewer attacks; then the strongest attacker first (a lead with the weakest into set backrow was tried: the
//      opponent's trap waits for the big attacker anyway, and the weak lead only gave up damage).
// The reply ply is a shallow, honest opponent: only the face-up attackers it already has, each hitting what it beats
// for the most damage (it summons nothing, springs nothing, and never suicides). The planner re-runs at every battle
// command, so after each real attack (a trap, a flip effect) the rest of the plan is rebuilt from what happened.
import { evaluate, type EvalMon, type Position } from "./evaluate.ts";

/** A monster with its Monster Zone (the planner removes the right one when it dies). */
export interface PlanMon extends EvalMon { seq: number }
/** One monster able to attack now: its index in the battle command, its zone, its ATK, and whether it may attack
 *  directly while the opponent still has monsters. */
export interface PlanAttacker { index: number; seq: number; atk: number; canDirect: boolean }
export interface PlannedAttack { index: number; seq: number; atk: number; /** The opponent's zone, null = direct. */ target: number | null }

export interface Outcome {
  dies: boolean;
  lethal: boolean;
  diesToReply: boolean;
  value: number;
  attacks: number;
  /** ATK of the first attacker (the order tie-break). */
  lead: number;
}
export interface BattlePlan { attacks: PlannedAttack[]; outcome: Outcome }

export interface PlanInput {
  /** The board now; myMon / oppMon in it are ignored in favour of the zone-aware lists below. */
  base: Position;
  my: PlanMon[];
  opp: PlanMon[];
  attackers: PlanAttacker[];
}

export interface PlanOpts {
  /** Price the opponent's next Battle Phase into the end board. */
  reply: boolean;
  /** How much of the reply's damage counts (it may never come: the opponent can change its board first). */
  replyWeight: number;
  /** Search cap (nodes). */
  maxNodes: number;
}
export const PLAN_DEFAULTS: PlanOpts = { reply: true, replyWeight: 0.5, maxNodes: 20000 };

interface State { myLp: number; oppLp: number; my: PlanMon[]; opp: PlanMon[]; used: number; flipCost: number }

const EPS = 1;
/** What an unknown face-down monster is taken to hold: a wall of at least this DEF. */
export const UNKNOWN_WALL = 1500;

/** The stat a target defends with (an unknown face-down is a ~1500 DEF wall). */
function guardOf(t: EvalMon): number {
  if (t.faceDown) return t.known ? t.def : Math.max(t.def, UNKNOWN_WALL);
  return t.attackPos ? t.atk : t.def;
}

/** The board after `a` attacks `t` (null = directly). Exact combat, as the engine resolves it. */
function resolve(s: State, a: PlanAttacker, t: PlanMon | null, bit: number): State {
  let { myLp, oppLp, my, opp, flipCost } = s;
  const used = s.used | bit;
  const atk = my.find((m) => m.seq === a.seq)?.atk ?? a.atk;
  if (t === null) return { myLp, oppLp: oppLp - atk, my, opp, used, flipCost };
  const guard = guardOf(t);
  const dropOpp = () => { opp = opp.filter((m) => m.seq !== t.seq); };
  const dropMine = () => { my = my.filter((m) => m.seq !== a.seq); };
  if (t.faceDown) flipCost += t.flipRisk ?? 0;
  if (t.attackPos) {
    if (atk > guard) { oppLp -= atk - guard; dropOpp(); }
    else if (atk === guard) { dropOpp(); dropMine(); }
    else { myLp -= guard - atk; dropMine(); }
  } else if (atk > guard) dropOpp();
  else {
    if (atk < guard) myLp -= guard - atk;
    // a face-down that survived is face-up now: its DEF is what it showed
    if (t.faceDown) opp = opp.map((m) => (m.seq === t.seq ? { ...m, faceDown: false, known: true, def: guard } : m));
  }
  return { myLp, oppLp, my, opp, used, flipCost };
}

/** Monster value lost (what the reply ply's attacker aims for). */
const bodyValue = (m: EvalMon): number => 1000 + Math.max(m.atk, m.def) * 0.4;

/**
 * The opponent's next Battle Phase against this board, shallowly: its face-up attack-position monsters, strongest
 * first, each attacking what it can beat for the most value (my monster, or my LP when my field is empty).
 */
export function replyPosition(p: Position): Position {
  let my = [...p.myMon];
  let myLp = p.myLp;
  const attackers = p.oppMon.filter((m) => m.attackPos && !m.faceDown).map((m) => m.atk).sort((a, b) => b - a);
  for (const atk of attackers) {
    if (my.length === 0) { myLp -= atk; continue; }
    let best = -1, bestLoss = 0;
    my.forEach((m, i) => {
      // our own face-down monsters are known to us
      const guard = m.faceDown ? m.def : m.attackPos ? m.atk : m.def;
      if (atk <= guard) return;
      const loss = bodyValue(m) + (m.attackPos && !m.faceDown ? (atk - guard) * 0.05 : 0);
      if (loss > bestLoss) { bestLoss = loss; best = i; }
    });
    if (best < 0) continue;
    const m = my[best]!;
    if (m.attackPos && !m.faceDown) myLp -= atk - m.atk;
    my = [...my.slice(0, best), ...my.slice(best + 1)];
  }
  return { ...p, myMon: my, myLp };
}

/** evaluate() of a board, counting what the opponent's next Battle Phase would take from it. */
export function valueWithReply(p: Position, weight: number): number {
  const now = evaluate(p);
  if (now >= 1e9 || now <= -1e9 || weight <= 0) return now;
  const after = evaluate(replyPosition(p));
  return after <= -1e9 ? now - 5e5 : now + weight * (after - now);
}

function outcomeOf(input: PlanInput, s: State, attacks: PlannedAttack[], opts: PlanOpts): Outcome {
  const end: Position = { ...input.base, myLp: s.myLp, oppLp: s.oppLp, myMon: s.my, oppMon: s.opp };
  const lethal = s.oppLp <= 0, dies = s.myLp <= 0;
  let diesToReply = false;
  let value = evaluate(end) - s.flipCost;
  if (!lethal && !dies && opts.reply) {
    const after = replyPosition(end);
    diesToReply = after.myLp <= 0;
    if (!diesToReply) value += opts.replyWeight * (evaluate(after) - evaluate(end));
  }
  return { dies, lethal, diesToReply, value, attacks: attacks.length, lead: attacks[0]?.atk ?? 0 };
}

/** > 0 when `a` is the better outcome. */
export function compareOutcomes(a: Outcome, b: Outcome): number {
  if (a.dies !== b.dies) return a.dies ? -1 : 1;
  if (a.lethal !== b.lethal) return a.lethal ? 1 : -1;
  if (a.lethal) return b.attacks - a.attacks;
  if (a.diesToReply !== b.diesToReply) return a.diesToReply ? -1 : 1;
  if (Math.abs(a.value - b.value) > EPS) return a.value - b.value;
  if (a.attacks !== b.attacks) return b.attacks - a.attacks;
  if (a.attacks > 0 && a.lead !== b.lead) return a.lead - b.lead;
  return 0;
}

/** The best plan for this Battle Phase (an empty plan = attack no more). */
export function planBattle(input: PlanInput, opts: PlanOpts = PLAN_DEFAULTS): BattlePlan {
  const openDirect = input.opp.length === 0;
  let best: BattlePlan | null = null;
  let nodes = 0;
  const seen = new Set<string>();
  const consider = (s: State, attacks: PlannedAttack[]) => {
    const outcome = outcomeOf(input, s, attacks, opts);
    if (!best || compareOutcomes(outcome, best.outcome) > 0) best = { attacks, outcome };
  };
  const walk = (s: State, attacks: PlannedAttack[]) => {
    if (++nodes > opts.maxNodes) return;
    consider(s, attacks);
    if (s.myLp <= 0 || s.oppLp <= 0) return;
    const key = `${s.used}|${s.myLp}|${s.oppLp}|${s.opp.map((m) => `${m.seq}${m.faceDown ? "d" : ""}`).join(",")}|${s.my.map((m) => m.seq).join(",")}`;
    if (seen.has(key)) return;
    seen.add(key);
    input.attackers.forEach((a, i) => {
      const bit = 1 << i;
      if (s.used & bit || !s.my.some((m) => m.seq === a.seq)) return;
      for (const t of s.opp) walk(resolve(s, a, t, bit), [...attacks, { index: a.index, seq: a.seq, atk: a.atk, target: t.seq }]);
      if (s.opp.length === 0 || (a.canDirect && !openDirect)) walk(resolve(s, a, null, bit), [...attacks, { index: a.index, seq: a.seq, atk: a.atk, target: null }]);
    });
  };
  walk({ myLp: input.base.myLp, oppLp: input.base.oppLp, my: input.my, opp: input.opp, used: 0, flipCost: 0 }, []);
  return best!;
}
