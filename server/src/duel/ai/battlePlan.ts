// The battle planner. Which attack the NPC makes is Master Duel's decision (nextAttack, at the end of this file): one
// attack at a time, only when it gains something. The whole-phase planner below answers whether lethal is on this turn
// (and how), and feeds the rule facts that ask about a battle.
//
// The whole-phase planner: the Battle Phase planned at once instead of one attack at a time. Every order of the
// attackers and every target (an opponent's monster, or a direct attack once the field is clear or the attacker may
// attack directly anyway) is resolved exactly, and the end boards are compared in a fixed order of what matters:
//   1. a line where our own LP reaches 0 is never taken;
//   2. lethal wins, with the fewest attacks (fewer attacks walk into fewer traps);
//   3. a board the opponent's next Battle Phase kills us from loses to one it does not;
//   3b. Master Duel's battle verdict on the end board (outcomeScore): who is ahead, by how much ATK and how immediately
//      (3: lethal on the board, 1: an attacker that wins a battle, 0: raw ATK only), the tier first;
//   4. then the board, evaluate(), after what the opponent's next Battle Phase would take from it (the reply ply: its
//      attackers are already on the field, so it counts in full: at half, a body sure to die still counted half);
//   5. then fewer attacks; then the strongest attacker first (a lead with the weakest into set backrow was tried: the
//      opponent's trap waits for the big attacker anyway, and the weak lead only gave up damage).
// The reply ply is a shallow, honest opponent: only the face-up attackers it already has, each hitting what it beats
// for the most damage (it summons nothing, springs nothing, and never suicides). A monster that cannot be destroyed by
// battle (EvalMon.battleProof) survives every attack on it, in both directions; the damage still applies. The planner
// re-runs at every battle command, so after each real attack (a trap, a flip effect) the rest of the plan is rebuilt.
import { evaluate, type EvalMon, type Position } from "./evaluate.ts";

/** A monster with its Monster Zone (the planner removes the right one when it dies). */
export interface PlanMon extends EvalMon { seq: number }
/** One monster able to attack now: its index in the battle command, its zone, its ATK, and whether it may attack
 *  directly while the opponent still has monsters. */
export interface PlanAttacker { index: number; seq: number; atk: number; canDirect: boolean;
  /** Its attack returns the target and itself to the hand before damage (Neo-Spacian Grand Mole). */
  bounces?: boolean }
export interface PlannedAttack { index: number; seq: number; atk: number; /** The opponent's zone, null = direct. */ target: number | null }

export interface Outcome {
  dies: boolean;
  lethal: boolean;
  diesToReply: boolean;
  /** Master Duel's battle verdict on the end board (outcomeScore). */
  verdict: number;
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
export const PLAN_DEFAULTS: PlanOpts = { reply: true, replyWeight: 1, maxNodes: 20000 };

interface State { myLp: number; oppLp: number; my: PlanMon[]; opp: PlanMon[]; used: number; flipCost: number }

const EPS = 1;
/** What an unknown face-down monster is taken to hold: a wall of at least this DEF (Master Duel's estimate for a set
 *  Level 4 or lower monster, the band a set monster nearly always is; it peeks at the real level, we do not). */
export const UNKNOWN_WALL = 1600;

/** The stat a target defends with (an unknown face-down is a ~1500 DEF wall). */
function guardOf(t: EvalMon): number {
  if (t.faceDown) return t.known ? t.def : Math.max(t.def, UNKNOWN_WALL);
  return t.attackPos ? t.atk : t.def;
}

/** The board after `a` attacks `t` (null = directly). Exact combat, as the engine resolves it. */
function resolve(s: State, a: PlanAttacker, t: PlanMon | null, bit: number): State {
  let { myLp, oppLp, my, opp, flipCost } = s;
  const used = s.used | bit;
  const me = my.find((m) => m.seq === a.seq);
  const atk = me?.atk ?? a.atk;
  if (t === null) return { myLp, oppLp: oppLp - atk, my, opp, used, flipCost };
  // a bounce: both leave the field, no battle (a battle-proof target goes too)
  if (a.bounces) return { myLp, oppLp, my: my.filter((m) => m.seq !== a.seq), opp: opp.filter((m) => m.seq !== t.seq), used, flipCost };
  const guard = guardOf(t);
  const dropOpp = () => { if (!t.battleProof) opp = opp.filter((m) => m.seq !== t.seq); };
  const dropMine = () => { if (!me?.battleProof) my = my.filter((m) => m.seq !== a.seq); };
  if (t.faceDown) flipCost += t.flipRisk ?? 0;
  // a kill that hands the opponent its afterlife (Sangan's search, Treeborn Frog's return) is worth that much less
  const kill = () => { if (!t.battleProof) flipCost += t.afterlife ?? 0; };
  if (t.attackPos) {
    if (atk > guard) { oppLp -= atk - guard; dropOpp(); kill(); }
    else if (atk === guard) { dropOpp(); dropMine(); kill(); }
    else { myLp -= guard - atk; dropMine(); }
  } else if (atk > guard) { dropOpp(); kill(); }
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
  const attackers = p.oppMon.filter((m) => m.attackPos && !m.faceDown && !m.noAttack).map((m) => m.atk).sort((a, b) => b - a);
  for (const atk of attackers) {
    if (my.length === 0) { myLp -= atk; continue; }
    let best = -1, bestLoss = 0;
    my.forEach((m, i) => {
      // our own face-down monsters are known to us
      const guard = m.faceDown ? m.def : m.attackPos ? m.atk : m.def;
      if (atk <= guard) return;
      const damage = m.attackPos && !m.faceDown ? atk - guard : 0;
      // a battle-proof monster only costs the damage through it; one with an afterlife costs less
      const loss = (m.battleProof ? 0 : Math.max(0, bodyValue(m) - (m.afterlife ?? 0))) + damage * 0.05;
      if (loss > bestLoss) { bestLoss = loss; best = i; }
    });
    if (best < 0) continue;
    const m = my[best]!;
    if (m.attackPos && !m.faceDown) myLp -= atk - m.atk;
    if (!m.battleProof) my = [...my.slice(0, best), ...my.slice(best + 1)];
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

/** The stat a monster holds its zone with (attack position: ATK; defence: DEF, an unknown set one the wall estimate). */
const holdOf = (m: EvalMon): number => (m.faceDown && !m.known ? Math.max(m.def, UNKNOWN_WALL) : m.attackPos ? m.atk : m.def);

/**
 * Master Duel's battle verdict on a board (its CPU's outcome score), from my side once my Battle Phase is over: the sign
 * says who is ahead, the size the ATK that puts them ahead, rounded down to 4, the low 2 bits how immediately:
 * 3 = a monster that is lethal on its own against the board, 1 = a best attacker that wins a battle there, 0 = raw ATK
 * only. +-1 / 0: even. Its attacks are spent, so only the opponent's lethal counts (theirs comes next).
 */
export function outcomeScore(p: Position): number {
  const side = (mine: EvalMon[], theirs: EvalMon[], theirLp: number) => {
    const attackers = mine.filter((m) => m.attackPos && !m.faceDown && !m.noAttack);
    const best = attackers.reduce((n, m) => Math.max(n, m.atk), 0);                               // S1
    const wins = (a: number) => theirs.length === 0 || theirs.some((t) => !t.battleProof && a > holdOf(t));
    const productive = attackers.filter((m) => wins(m.atk)).reduce((n, m) => Math.max(n, m.atk), 0);   // S3
    const hold = mine.reduce((n, m) => Math.max(n, holdOf(m)), 0);                                 // S6
    const lethal = attackers.some((m) => (theirs.length === 0 ? m.atk >= theirLp
      : theirs.some((t) => t.attackPos && !t.faceDown && !t.battleProof && m.atk - t.atk >= theirLp && theirs.length === 1)));
    return { best, productive, hold, lethal };
  };
  const S = side(p.myMon, p.oppMon, p.oppLp), O = side(p.oppMon, p.myMon, p.myLp);
  const tag = (v: number, t: number, min: number) => Math.max(min, (v & ~3) + t);
  if (O.productive && O.lethal) return -tag(O.productive, 3, 2);
  if (S.productive > O.best || (S.productive > O.hold && S.hold >= O.hold)) return tag(S.productive, 1, 1);
  if (O.productive > S.best || (O.productive > S.hold && O.hold >= S.hold)) return -tag(O.productive, 1, 2);
  if ((S.productive === 0 && (O.productive === 0 || S.best > O.productive)) || (S.best > 0 && S.best <= O.best)) {
    if (p.myLp <= 0 && p.oppLp > 0) return -Math.max(3, O.best & ~3);
    if (p.myLp > 0 && p.oppLp <= 0) return Math.max(2, S.best & ~3);
    if (S.best > O.best) return Math.max(1, S.best & ~3);
    if (S.best < O.best) return -Math.max(2, O.best & ~3);
    return -1;
  }
  return 0;
}

/** Master Duel's comparison of two verdicts: > 0 when x is the better. The tier decides before the size, except that
 *  a lead of 2000 ATK or more beats a tier; leaving the opponent lethal on the board is the worst. */
export function compareVerdicts(x: number, y: number): number {
  const near = (v: number) => (v >= -2 && v <= 1 ? 0 : v);
  x = near(x); y = near(y);
  if (x === y) return 0;
  const tx = Math.abs(x) & 3, ty = Math.abs(y) & 3;
  if (x >= 2 && y >= 2) {
    if (x > y && tx < ty) return -1;
    if (x < y && tx > ty) return x < 2000 && y >= 2000 ? x - y : 1;
    return x - y;
  }
  if (x <= -3 && y <= -3) {
    if (tx === 3 && ty !== 3) return -32767;
    if (ty === 3 && tx !== 3) return 32767;
    if (y < x && ty < tx) return -1;
    if (x <= y && tx < ty) return 1;
  }
  return x - y;
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
  return { dies, lethal, diesToReply, verdict: outcomeScore(end), value, attacks: attacks.length, lead: attacks[0]?.atk ?? 0 };
}

/** > 0 when `a` is the better outcome. */
export function compareOutcomes(a: Outcome, b: Outcome): number {
  if (a.dies !== b.dies) return a.dies ? -1 : 1;
  if (a.lethal !== b.lethal) return a.lethal ? 1 : -1;
  if (a.lethal) return b.attacks - a.attacks;
  if (a.diesToReply !== b.diesToReply) return a.diesToReply ? -1 : 1;
  const v = compareVerdicts(a.verdict, b.verdict);
  if (v !== 0) return v;
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

// ---- Master Duel's attack decision ---------------------------------------------------------------------------------
// Master Duel's CPU never compares "attack" with "don't attack" end boards: it commits one attack at a time. Every
// attacker against every target is resolved, each single attack gets a result class, the best class wins (attacker
// order breaks ties), and an attack is made only when its class is above 0 (it gains something). After the attack
// resolves the CPU decides again on the new board. Comparing whole end boards by the verdict was wrong: with Lyla
// (DEF 200) and a battle-indestructible Spirit Reaper on the opponent's field, killing Lyla left a board whose verdict
// was a tier lower (only an unbeatable monster left), so production attacked nothing for three turns (duel 303).

/** A single attack's result, best last: 0 it gains nothing (or loses the attacker for nothing), 1 a trade that costs
 *  them more than it costs us (an equal trade is not made), 2 damage with the attacker kept, 3 a kill with the attacker kept, 7 lethal. */
export const ATTACK_CLASS = { NOTHING: 0, TRADE: 1, DAMAGE: 2, KILL: 3, LETHAL: 7 } as const;

const bodyWorth = (m: EvalMon): number => 1000 + Math.max(m.atk, m.def) * 0.4 + (m.afterlife ? -m.afterlife : 0);

/** The class of one attack on this board (`t` null = direct). */
export function attackClass(input: PlanInput, a: PlanAttacker, t: PlanMon | null): number {
  const s: State = { myLp: input.base.myLp, oppLp: input.base.oppLp, my: input.my, opp: input.opp, used: 0, flipCost: 0 };
  const r = resolve(s, a, t, 1);
  if (r.oppLp <= 0) return ATTACK_CLASS.LETHAL;
  const kept = r.my.some((m) => m.seq === a.seq);
  const killed = t !== null && !r.opp.some((m) => m.seq === t.seq);
  const damage = s.oppLp - r.oppLp;
  if (kept && killed) return ATTACK_CLASS.KILL;
  if (kept && damage > 0) return ATTACK_CLASS.DAMAGE;
  if (!kept && killed) {
    const me = input.my.find((m) => m.seq === a.seq);
    return me && bodyWorth(t!) > bodyWorth(me) ? ATTACK_CLASS.TRADE : ATTACK_CLASS.NOTHING;
  }
  return ATTACK_CLASS.NOTHING;
}

/** Master Duel's attacker order: the attackers that can run over one of the opponent's attack-position monsters first,
 *  strongest first (they clear blockers); then the rest, weakest first (the least valuable attacks probe first). */
export function attackerOrder(input: PlanInput): PlanAttacker[] {
  const weakest = input.opp.filter((m) => m.attackPos && !m.faceDown && !m.battleProof).reduce((n, m) => Math.min(n, m.atk), Infinity);
  const bumped = (a: PlanAttacker) => a.atk > weakest;
  return [...input.attackers].sort((x, y) => {
    const bx = bumped(x), by = bumped(y);
    if (bx !== by) return bx ? -1 : 1;
    return bx ? y.atk - x.atk : x.atk - y.atk;
  });
}

/** The attack to make now, Master Duel's way, or null: no attack gains anything (go to Main Phase 2). */
export function nextAttack(input: PlanInput): PlannedAttack | null {
  const openDirect = input.opp.length === 0;
  let best: { attack: PlannedAttack; cls: number; gain: number; order: number; worth: number } | null = null;
  const s0: State = { myLp: input.base.myLp, oppLp: input.base.oppLp, my: input.my, opp: input.opp, used: 0, flipCost: 0 };
  attackerOrder(input).forEach((a, order) => {
    const targets: (PlanMon | null)[] = [...input.opp, ...(openDirect || a.canDirect ? [null] : [])];
    for (const t of targets) {
      const cls = attackClass(input, a, t);
      if (cls === ATTACK_CLASS.NOTHING) continue;
      // among equal classes Master Duel takes the bigger net gain (what the opponent loses: damage and the monster's
      // worth), then the earlier attacker, then the target worth the most (an attack-position monster first)
      const r = resolve(s0, a, t, 1);
      const killed = t !== null && !r.opp.some((m) => m.seq === t.seq);
      const gain = (s0.oppLp - r.oppLp) + (killed ? bodyWorth(t!) : 0) - (s0.myLp - r.myLp);
      const worth = t ? bodyWorth(t) + (t.attackPos ? 1 : 0) : -1;
      const better = !best || cls > best.cls || (cls === best.cls && (gain > best.gain + EPS
        || (Math.abs(gain - best.gain) <= EPS && (order < best.order || (order === best.order && worth > best.worth)))));
      if (better) best = { attack: { index: a.index, seq: a.seq, atk: a.atk, target: t ? t.seq : null }, cls, gain, order, worth };
    }
  });
  return best ? (best as { attack: PlannedAttack }).attack : null;
}

/** The attacks Master Duel's CPU would make this Battle Phase on this board: nextAttack, resolved, again (at most 10).
 *  Its attackers are "the plan": only they are raised to attack position before the battle. */
export function planAttacks(input: PlanInput): PlannedAttack[] {
  const out: PlannedAttack[] = [];
  let cur = input;
  for (let n = 0; n < 10; n++) {
    const a = nextAttack(cur);
    if (!a) break;
    out.push(a);
    const attacker = cur.attackers.find((x) => x.seq === a.seq)!;
    const target = a.target === null ? null : cur.opp.find((m) => m.seq === a.target) ?? null;
    const s = resolve({ myLp: cur.base.myLp, oppLp: cur.base.oppLp, my: cur.my, opp: cur.opp, used: 0, flipCost: 0 }, attacker, target, 1);
    if (s.oppLp <= 0 || s.myLp <= 0) break;
    cur = { base: { ...cur.base, myLp: s.myLp, oppLp: s.oppLp }, my: s.my, opp: s.opp, attackers: cur.attackers.filter((x) => x.seq !== a.seq) };
  }
  return out;
}

/**
 * What this board's Battle Phase (Master Duel's attacks, planEnd) wins against what the opponent's next Battle Phase
 * (replyPosition) takes back, in one currency: LP 1:1 and a monster at its body worth. Choosing between two boards
 * that differ by one monster's position: raise Marshmallon to attack a 200/100 Ryko and it hits for 100, then three
 * attackers take 5,600 LP through it (production, duel 393); evaluate() weighs LP at 0.05 and saw the kill as worth
 * more. A line that leaves me dead to the reply is -1e6.
 */
export function tradeValue(input: PlanInput): number {
  const { end } = planEnd(input);
  const worth = (ms: EvalMon[]) => ms.reduce((n, m) => n + bodyWorth(m), 0);
  const won = (input.base.oppLp - end.oppLp) + worth(input.opp) - worth(end.oppMon);
  if (end.oppLp <= 0) return 1e6;
  const lost = (input.base.myLp - end.myLp) + worth(input.my) - worth(end.myMon);
  const reply = replyPosition(end);
  if (reply.myLp <= 0) return -1e6;
  return won - lost - (end.myLp - reply.myLp) - (worth(end.myMon) - worth(reply.myMon));
}

/** The board after planAttacks' Battle Phase on this one: the attacks and the end position (for comparing plays). */
export function planEnd(input: PlanInput): { attacks: PlannedAttack[]; end: Position } {
  let cur = input;
  const attacks: PlannedAttack[] = [];
  for (let n = 0; n < 10; n++) {
    const a = nextAttack(cur);
    if (!a) break;
    attacks.push(a);
    const attacker = cur.attackers.find((x) => x.seq === a.seq)!;
    const target = a.target === null ? null : cur.opp.find((m) => m.seq === a.target) ?? null;
    const s = resolve({ myLp: cur.base.myLp, oppLp: cur.base.oppLp, my: cur.my, opp: cur.opp, used: 0, flipCost: 0 }, attacker, target, 1);
    cur = { base: { ...cur.base, myLp: s.myLp, oppLp: s.oppLp }, my: s.my, opp: s.opp, attackers: cur.attackers.filter((x) => x.seq !== a.seq) };
    if (s.oppLp <= 0 || s.myLp <= 0) break;
  }
  return { attacks, end: { ...cur.base, myMon: cur.my, oppMon: cur.opp } };
}
