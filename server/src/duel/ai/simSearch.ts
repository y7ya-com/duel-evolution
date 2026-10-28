// Fork-based lookahead: the elite tier's "thinks a few steps ahead" layer.
//
// The engine cannot clone a live duel, but it IS deterministic: the same `new` (seed included) and the same commands
// give the same events. So to evaluate a candidate move we FORK the duel: a new duel with the live duel's `new`
// arguments in the same DuelCore, every recorded command replayed (arriving at exactly the live select; anything else
// is drift and the decision falls back to the heuristic), the candidate injected, then the duel rolled FORWARD with
// heuristic pilots on both seats up to a horizon, and the final board scored with evaluate().
//
// Two horizons:
//   - honest (the default): only decisions in the NPC's own main phase are searched; the rollout ends when that main
//     phase ends (battle or end phase, or the turn changes); the opponent's seat never answers optionally (no chains,
//     no optional effects: its hidden cards stay out of the picture) and the end board is scored from the NPC's
//     masked view. What remains: a rollout that draws a card draws the real top card of the NPC's own deck.
//   - spy (the flag, off by default): every real decision, up to the start of the NPC's next turn, with full-vision
//     pilots on both seats holding the opponent's ACTUAL hand, scored on the unmasked board.
import type { Deck, DuelCore, Json, NewOptions } from "../engine/core.ts";
import type { HeuristicBot } from "./heuristicBot.ts";
import { PHASE, type Prompt } from "./prompt.ts";

/** One command of the live duel since its `new`: a response (r, by player p) or, without r, an `auto`. */
export interface LoggedCmd { r?: Json; p?: number }

/** What a fork needs from the live duel. */
export interface ForkLink {
  dc: DuelCore;
  decks: Deck[];
  /** The live duel's `new` options (seed included). */
  opts: NewOptions;
  log: readonly LoggedCmd[];
}

export interface SearchAccess {
  /** The live duel at decision time (null = no fork possible: plain heuristic). */
  link: () => ForkLink | null;
  /** A rollout pilot for a seat (`own` = the deciding NPC: its own rules), reading the fork through `peek`. */
  makePolicy: (seat: number, own: boolean, peek: () => Json) => HeuristicBot;
  /** CPU budget per decision (ms): stop exploring once spent, keep the best line found. */
  budgetMs: number;
  /** Max candidate lines per decision. */
  maxCandidates: number;
  /** Spy horizon (see above) instead of the honest one. */
  spy: boolean;
}

const SIM_PROMPT_CAP = 400; // prompts answered after the injection before a rollout is cut short
const WIN = 1e9;
let forkSeq = 0;

/** Cumulative fork counters. `drift` = forks whose replay did NOT reach the live select: should stay 0. */
export const simStats = { forks: 0, ms: 0, drift: 0 };

/** Is this select worth a search (honest: the NPC's own main phase only)? */
export function searchable(access: SearchAccess, sel: Json, seat: number): boolean {
  if (access.spy) return true;
  const phase = Number(sel.phase);
  return Number(sel.turn_player) === seat && (phase === PHASE.MAIN1 || phase === PHASE.MAIN2);
}

/** The same select (id and timing aside). */
function sameSelect(a: Json | undefined, b: Json): boolean {
  if (!a || a.ev !== "select") return false;
  const strip = (x: Json) => JSON.stringify({ ...x, id: null, ms: null });
  return strip(a) === strip(b);
}

/** The opponent's seat in an honest rollout: no optional answers; whatever it MUST answer goes to its pilot. */
function passive(pilot: HeuristicBot, sel: Json): Json | null {
  switch (sel.type) {
    case "SELECT_CHAIN": return sel.forced ? pilot.choose(sel) : { type: "SELECT_CHAIN", index: null };
    case "SELECT_EFFECTYN": return { type: "SELECT_EFFECTYN", yes: false };
    default: return pilot.choose(sel);
  }
}

/**
 * Fork + replay + inject + roll out. The end-of-horizon score for `seat` (+-1e9 on a decided duel), or null when the
 * fork failed structurally (the replay did not reach the live select): the caller falls back to the heuristic.
 */
export function rolloutScore(access: SearchAccess, seat: number, live: Json, prompt: Prompt, inject: Json, liveBot: HeuristicBot): number | null {
  const t0 = performance.now();
  const L = access.link();
  if (!L) return null;
  const { dc } = L;
  const id = `ai-fork-${++forkSeq}`;
  const peek = () => dc.query(id);
  const pol = [access.makePolicy(0, seat === 0, peek), access.makePolicy(1, seat === 1, peek)];
  pol[seat]!.copyTurnState(liveBot);
  let open = false;
  try {
    let evs = dc.new(id, L.decks, { ...L.opts, brain: [true, true] });
    open = true;
    for (const c of L.log) evs = c.r ? dc.respond(id, c.r, c.p) : dc.auto(id);
    if (!sameSelect(evs[evs.length - 1], live)) { simStats.drift++; return null; }
    pol[seat]!.applyExternalResponse(prompt, inject);
    evs = dc.respond(id, inject, seat);
    let prompts = 0;
    for (;;) {
      let stop = false;
      for (const e of evs) {
        if (e.ev !== "msg") continue;
        pol[0]!.observe(e);
        pol[1]!.observe(e);
        if (access.spy && e.type === "NEW_TURN" && e.player === seat) stop = true;
      }
      const last = evs[evs.length - 1]!;
      if (last.ev === "end") { open = false; return last.winner === seat ? WIN : last.winner === 1 - seat ? -WIN : 0; }
      if (stop || last.ev !== "select") break;
      if (!access.spy && (last.turn !== live.turn || last.phase !== live.phase)) break;
      if (++prompts > SIM_PROMPT_CAP) break;
      const p = Number(last.player);
      const r = last.retry ? null : !access.spy && p !== seat ? passive(pol[p]!, last) : pol[p]!.choose(last);
      evs = r ? dc.respond(id, r, p) : dc.auto(id);
    }
    return pol[seat]!.valueOf(dc.query(id));
  } finally {
    if (open) dc.end(id);
    simStats.forks++;
    simStats.ms += performance.now() - t0;
  }
}
