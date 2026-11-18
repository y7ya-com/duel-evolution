// Fork-based lookahead: the elite tier's "thinks a few steps ahead" layer.
//
// The engine cannot clone a live duel, but it IS deterministic: the same `new` (seed included) and the same commands
// give the same events. So to evaluate a candidate move we FORK the duel: a new duel with the live duel's `new`
// arguments in the same DuelCore, every recorded command replayed (arriving at exactly the live select; anything else
// is drift and the decision falls back to the heuristic), the candidate injected, then the duel rolled FORWARD with
// heuristic pilots on both seats up to a horizon, and the final board scored with evaluate().
//
// Two horizons:
//   - honest (the default): only decisions in the NPC's own main phase are searched; the rollout runs to the end of
//     the NPC's own turn, so the battle a line leads to is scored (ending it with the main phase priced a summon as a
//     card spent and nothing gained: the elite sat on its hand and summoned after the battle); the opponent's seat
//     never answers optionally (no chains, no optional effects: its hidden cards stay out of the picture) and the
//     end board is scored from the NPC's masked view. What remains: a rollout that draws a card draws the real top
//     card of the NPC's own deck.
//     Yugi additionally tests available face-up negates both immediately and
//     saved for the payoff. Unknown traps remain unknown; their risk is estimated
//     in the draw planner instead of reading their real identities.
//   - spy (the flag, off by default): every real decision, up to the start of the NPC's next turn, with full-vision
//     pilots on both seats holding the opponent's ACTUAL hand, scored on the unmasked board.
import type { Deck, DuelCore, Json, NewOptions } from "../engine/core.ts";
import type { HeuristicBot } from "./heuristicBot.ts";
import { LOCATION, PHASE, POS, type Prompt } from "./prompt.ts";

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
  makePolicy: (seat: number, own: boolean, peek: () => Json, vision?: boolean) => HeuristicBot;
  /** A safety ceiling per decision (ms), never reached in normal play: the search is bounded by maxCandidates, not by
   *  the clock, so the same position gets the same answer on any machine (production's slower CPU played different
   *  lines from the lab's under a 150 ms clock budget). */
  budgetMs: number;
  /** Max candidate lines per decision. */
  maxCandidates: number;
  /** Spy horizon (see above) instead of the honest one. */
  spy: boolean;
  /** Yugi's public negation forecasts; never reveals or activates a hidden set card. */
  publicReplies?: boolean;
  /** Yugi can use the opposing hand to shortlist and forecast a skill draw. */
  opposingHand?: () => readonly number[];
}

const PUBLIC_COUNTERS = new Set([34487429, 48229808, 93016201]); // Rainbow Ruins, Horus LV8, Royal Oppression
/** The native engine offers legal effects; only face-up, public field cards may
 * answer an honest forecast. Do not consult the defender's hand or set identities. */
export function publicCounterReply(sel: Json, deferDraw: boolean): Json | null {
  if (sel.type !== "SELECT_CHAIN" || deferDraw) return null;
  const options = (Array.isArray(sel.selects) ? sel.selects : []) as Json[];
  const i = options.findIndex(c => PUBLIC_COUNTERS.has(Number(c.code))
    && (Number(c.location) & (LOCATION.MZONE | LOCATION.SZONE)) !== 0
    && (Number(c.position) & (POS.FACEUP_ATTACK | POS.FACEUP_DEFENSE)) !== 0);
  return i < 0 ? null : { type: "SELECT_CHAIN", index: i };
}

function hasPublicCounter(live: Json, seat: number): boolean {
  const players = (live.view as Json | undefined)?.players as Json[] | undefined;
  const foe = players?.[1 - seat];
  return [foe?.szone, foe?.mzone].some(zone => Array.isArray(zone) && zone.some(c => c
    && PUBLIC_COUNTERS.has(Number((c as Json).code)) && (Number((c as Json).position) & 5) !== 0));
}

const SIM_PROMPT_CAP = 400; // prompts answered after the injection before a rollout is cut short
const WIN = 1e9;
let forkSeq = 0;

/** Cumulative fork counters. `drift` = forks whose replay did NOT reach the live select: should stay 0. */
export const simStats = { forks: 0, ms: 0, drift: 0 };

/** Is this select worth a search (honest: the NPC's own main phase only)? */
export function searchable(access: SearchAccess, sel: Json, seat: number): boolean {
  if (access.spy) return true;
  if (sel.heart_of_cards === true && sel.type === "ANNOUNCE_CARD" && Number(sel.player) === seat) return Number(sel.turn_player) === seat;
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

/** Where a fork stops: the default rollout horizon (searchable decisions), or a what-if's (the action's consequences). */
type Horizon = (sel: Json, events: Json[], live: Json) => boolean;

/**
 * Fork + replay + inject + play forward to the horizon. The fork's state at the horizon (duelcore `query`), a number
 * (+-1e9: the duel ended), or null when the fork failed structurally (the replay did not reach the live select).
 */
function forkPlay(access: SearchAccess, seat: number, live: Json, prompt: Prompt, inject: Json, liveBot: HeuristicBot, stopAt: Horizon, reply: "first" | "payoff" = "first", playOpponent = false): Json | number | null {
  const t0 = performance.now();
  const L = access.link();
  if (!L) return null;
  const { dc } = L;
  const id = `ai-fork-${++forkSeq}`;
  const peek = () => dc.query(id);
  // A draw forecast plays the opponent as a player who reads Yugi's set cards: it removes or plays around them, as
  // people do. A pilot that attacked into every set card made Mirror Force the best draw in every position.
  const pol = [0, 1].map(s => access.makePolicy(s, s === seat, peek, playOpponent && s !== seat));
  pol[seat]!.copyTurnState(liveBot);
  let open = false;
  try {
    let evs = dc.new(id, L.decks, { ...L.opts, brain: [true, true], record: false });
    open = true;
    for (const c of L.log) evs = c.r ? dc.respond(id, c.r, c.p) : dc.auto(id);
    if (!sameSelect(evs[evs.length - 1], live)) { simStats.drift++; return null; }
    pol[seat]!.applyExternalResponse(prompt, inject);
    evs = dc.respond(id, inject, seat);
    let prompts = 0, incomingResolved = false, ownDrawLink = false;
    for (;;) {
      let stop = false;
      for (const e of evs) {
        if (e.ev !== "msg") continue;
        if (e.type === "BATTLE" || e.type === "ATTACK_DISABLED") incomingResolved = true;
        if (e.type === "CHAINING" && Number(e.controller) === seat) ownDrawLink = liveBot.isResourceDraw(Number(e.code));
        if (e.type === "CHAIN_END") ownDrawLink = false;
        pol[0]!.observe(e);
        pol[1]!.observe(e);
        if (access.spy && e.type === "NEW_TURN" && e.player === seat) stop = true;
      }
      const last = evs[evs.length - 1]!;
      if (last.ev === "end") { open = false; return last.winner === seat ? WIN : last.winner === 1 - seat ? -WIN : 0; }
      if (stop || last.ev !== "select") break;
      if (stopAt(last, evs, live)) break;
      if (++prompts > SIM_PROMPT_CAP) break;
      const p = Number(last.player);
      const publicReply = access.publicReplies && !access.spy && p !== seat
        ? publicCounterReply(last, reply === "payoff" && ownDrawLink) : null;
      // The Crystal Beast replacement is a public choice (97 = place this
      // destroyed monster in the Spell/Trap Zone), not Pegasus's deck search.
      const crystalReplacement = access.publicReplies && !access.spy && p !== seat && last.type === "SELECT_EFFECTYN"
        && Number(last.description) === 97 && Number(last.location) === LOCATION.MZONE && (Number(last.position) & 5) !== 0
        && /^Crystal Beast /.test(dc.cardDB.name(Number(last.code))) ? { type: "SELECT_EFFECTYN", yes: true } : null;
      const costs = (Array.isArray(last.selects) ? last.selects : []) as Json[];
      const publicCost = access.publicReplies && !access.spy && p !== seat && last.type === "SELECT_CARD"
        && Number(last.min) === Number(last.max) && Number(last.min) > 0 && costs.length > 0
        && costs.every(c => Number(c.controller) === p && Number(c.location) === LOCATION.MZONE && (Number(c.position) & 5) !== 0)
        ? { type: "SELECT_CARD", indicies: costs.map((c, i) => ({i, atk: dc.cardDB.get(Number(c.code))?.attack ?? 0}))
          .sort((a, b) => a.atk - b.atk || a.i - b.i).slice(0, Number(last.min)).map(c => c.i) } : null;
      const r = last.retry ? null : publicReply ?? crystalReplacement ?? publicCost
        ?? (!access.spy && !playOpponent && p !== seat ? passive(pol[p]!, last) : pol[p]!.choose(last));
      evs = r ? dc.respond(id, r, p) : dc.auto(id);
    }
    // A passed attack window can reach damage before the next prompt; a revival can stop at its replay.
    return { ...dc.query(id), ai_pending_attack_resolved: incomingResolved || evs.at(-1)?.type === "SELECT_BATTLECMD" };
  } finally {
    if (open) dc.end(id);
    simStats.forks++;
    simStats.ms += performance.now() - t0;
  }
}

/**
 * Fork + replay + inject + roll out. The end-of-horizon score for `seat` (+-1e9 on a decided duel), or null when the
 * fork failed structurally (the replay did not reach the live select): the caller falls back to the heuristic.
 */
export function rolloutScore(access: SearchAccess, seat: number, live: Json, prompt: Prompt, inject: Json, liveBot: HeuristicBot): number | null {
  const pilot = access.makePolicy(seat, true, () => ({}));
  const forecast = !!access.opposingHand && prompt.kind === "announceCard" && prompt.heart;
  // honest: the end of the NPC's own turn (spy: its next turn, stopped in forkPlay)
  const scores: number[] = [];
  const replies = access.publicReplies && !access.spy && hasPublicCounter(live, seat) ? ["first", "payoff"] as const : ["first"] as const;
  for (const reply of replies) {
    const r = forkPlay(access, seat, live, prompt, inject, liveBot, (sel, _events, l) => forecast
      ? Number(sel.turn) >= Number(l.turn) + (Number(l.turn_player) === seat ? 2 : 1)
      : !access.spy && sel.turn !== l.turn, reply, forecast);
    if (r === null) return null;
    pilot.copyTurnState(liveBot);
    scores.push(typeof r === "number" ? r : pilot.valueOf(r, forecast));
  }
  return Math.min(...scores);
}

/**
 * What-if: the duel right after this one action has played out under the real rules (the engine resolves it: its
 * chain, its summons, its targets as the pilots pick them), stopped when control is back with the NPC at its next main
 * or battle command, when that chain is over, or at the end of the turn. The fork's state (duelcore `query`), +-1e9 if
 * the duel ended, or null.
 */
export function whatIf(access: SearchAccess, seat: number, live: Json, prompt: Prompt, inject: Json, liveBot: HeuristicBot): Json | number | null {
  let chained = false;
  return forkPlay(access, seat, live, prompt, inject, liveBot, (sel, events, l) => {
    if (events.some((e) => e.ev === "msg" && e.type === "CHAIN_END")) chained = true;
    if (sel.turn !== l.turn) return true;
    // Once either player can choose a new main/battle action, this action is over.
    // In particular a passed summon-response window has no CHAIN_END: continuing
    // until our next command would let the opposing pilot use its hidden hand.
    const command = sel.type === "SELECT_IDLECMD" || sel.type === "SELECT_BATTLECMD";
    return command || (chained && Number(sel.player) !== seat);
  });
}
