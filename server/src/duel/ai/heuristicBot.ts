// HeuristicBot: Duel Evolution's NPC AI player. A generic player with per-card rules (cardRules.ts) that reads the
// board instead of playing the first legal thing:
//   - Main phase: draw/search and tactical removal first, special-summons, plays the STRONGEST monster (tribute-
//     summoning a beater when it out-classes the board), sets a weak monster face-down to survive, sets backrow and
//     uses its spells/effects.
//   - Battle: only declares attacks that improve the position (exact 1-ply combat, scored by evaluate()), takes lethal
//     when it is there, breaks walls only with a monster big enough to risk it.
//   - Responses: springs set traps on the OPPONENT's turn when a rule says the moment is right, removes the
//     opponent's biggest threat, tributes its weakest monsters, defends when behind.
// Every loop-capable choice is de-duplicated per turn / per chain window, plus a hard per-turn action cap, so a duel
// always terminates.
//
// Optional layers (BotOpts):
//   - spy: reads the opponent's real hand / set cards / face-down stats (an unmasked board). OFF by default: the
//     honest player sees only what the select's `view` shows. Even with spy, "pick from the opponent's hidden hand"
//     stays a uniformly random pick (#removalValue).
//   - search: the elite tier scores its real decisions with replay-fork rollouts (simSearch.ts).
//   - blunder: the easy tier sometimes plays a random legal line instead of the heuristic's.
import { type CardRule, type RuleCtx, type RuleMon, rulesFor, tagRule } from "./cardRules.ts";
import { TYPE_QUICKPLAY, TYPE_TRAP } from "../brain/cards.ts";
import { COMBO_PLANS, type ComboPlan } from "./comboPlans.ts";
import { evaluate, type EvalMon, type Position } from "./evaluate.ts";
import {
  type Activatable, type BoardCard, type CardRef, type DuelBoard, type Json, type PlaceRef, type PlayerBoard, type Prompt,
  LOCATION, POS, boardFromState, boardFromView, freePlaces, isFaceDown, lowestBits, solveAnnounceCard, solveSum, toPrompt,
  respBattle, respCards, respChain, respCounter, respEffectYN, respIdle, respOption, respPlaces, respPosition, respSort,
  respTribute, respUnselect, respYesNo,
} from "./prompt.ts";
import { rolloutScore, searchable, type SearchAccess } from "./simSearch.ts";
import type { CardDB as BrainDB } from "../brain/index.ts";
import { zoneOrder } from "../zones.ts";

/** Tag-derived rules per card code (null = none), shared: card text does not change. */
const TAG_RULES = new Map<number, CardRule | null>();

const MAX_IDLE_ACTIONS = 24; // hard safety cap on plays per turn (prevents pathological loops)

/** Set cards that really answer a committed board or an attack: what a spy-vision player fears, pops first, and
 *  discounts its board eval by. */
const THREAT_BACKROW = /mirror force|sakuretsu armor|torrential tribute|ring of destruction|bottomless trap hole|magic cylinder|solemn judgment|mirror wall|spellbinding circle|draining shield|negate attack|waboku|crush card virus|book of moon/;
/** Backrow removal worth firing BEFORE committing monsters when a known threat is set. */
const BACKROW_POPPER = /mystical space typhoon|dust tornado|heavy storm|harpie's feather duster/;

/** What the player needs to know about cards: base stats, the cards.cdb name, and a flip-risk prior. */
export interface CardInfo {
  stat(code: number): { atk: number; def: number; level: number };
  /** cards.cdb English name, lowercase ("" if unknown). */
  name(code: number): string;
  /** Estimated value lost by exposing this set monster (FLIP removal/search...): 0 for a plain body. */
  flipRisk(code: number): number;
  /** For ANNOUNCE_CARD (declarable() over the whole card pool). */
  brain: BrainDB;
}

export interface BotOpts {
  /** The NPC id: its own rules (NPC_RULES) and combo plan (COMBO_PLANS). */
  npcId?: number;
  /** Spy vision: boards come from `peek` (the full duel state) instead of the select's honest `view`. */
  spy?: boolean;
  /** The duel's full state (duelcore `query`), for spy vision. */
  peek?: () => Json;
  /** Seed of the private rng (honest random picks, blunders, mistakes): deterministic per seed. */
  seed?: number;
  /** Elite tier: real decisions scored by replay-fork rollouts. */
  search?: SearchAccess;
  /** Probability of playing the 2nd-best searched line instead of the best (0 = always the best). */
  mistakeRate?: number;
  /** Easy tier: probability of a random legal line at a main/battle-phase decision. */
  blunder?: number;
}

/** One searchable line: the response, plus the bookkeeping to apply if this line is chosen (what respond() would
 *  have recorded: dedup sets, action counts, pending attacker). */
interface Candidate { resp: Json; commit?: () => void }

interface OppMon { seq: number; atk: number; def: number; faceDown: boolean; attackPos: boolean; known: boolean; flipRisk: number }
/** Live combo-assembly state: how many pieces are in hand/field and whether the payoff can be made now. */
interface ComboState { plan: ComboPlan; pieces: number; ready: boolean; haveEnabler: boolean }

type P<K extends Prompt["kind"]> = Extract<Prompt, { kind: K }>;

/** mulberry32: a small seeded PRNG. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export class HeuristicBot {
  readonly seat: number;
  #cards: CardInfo;
  #board: DuelBoard | null = null;
  #turn = -1;
  #turnPlayer = 0;
  #idleActions = 0;
  /** `${loc}:${seq}:${desc}` of effects activated this turn: stops re-activation loops. */
  #activatedThisTurn = new Set<string>();
  /** `code:desc` of chains activated in the current chain window: stops re-chain loops. */
  #chainedThisWindow = new Set<string>();
  /** ATK of the monster whose attack we just declared, consumed by the follow-up target prompt. */
  #pendingAttacker: number | null = null;
  #rules: Record<string, CardRule>;
  #combo: ComboPlan | undefined;
  #vision: boolean;
  #peek: (() => Json) | undefined;
  #rng: () => number;
  #search: SearchAccess | undefined;
  #mistakeRate: number;
  #blunder: number;

  constructor(seat: number, cards: CardInfo, opts: BotOpts = {}) {
    this.seat = seat;
    this.#cards = cards;
    this.#rules = rulesFor(opts.npcId);
    this.#combo = opts.npcId !== undefined ? COMBO_PLANS[opts.npcId] : undefined;
    this.#vision = !!opts.spy && !!opts.peek;
    this.#peek = opts.peek;
    this.#rng = mulberry32(opts.seed ?? 0x9e3779b9);
    this.#search = opts.search;
    this.#mistakeRate = opts.mistakeRate ?? 0;
    this.#blunder = opts.blunder ?? 0;
  }

  // ---- engine entry points ----------------------------------------------------------------------------------------
  /** Public duel messages (ev.ev === "msg"): chain boundaries reset the per-window guard. */
  observe(ev: Json): void {
    if (ev.type === "CHAIN_END") this.#chainedThisWindow.clear();
  }

  /** Response for a duelcore select addressed to this seat (brain mode, with `view`); null = let the engine decide. */
  choose(sel: Json): Json | null {
    this.#sync(sel);
    return this.decide(toPrompt(sel, this.seat, this.#vision), sel);
  }

  /** Turn bookkeeping and the board for this select. */
  #sync(sel: Json): void {
    const turn = Number(sel.turn ?? 0);
    this.#turnPlayer = Number(sel.turn_player ?? 0);
    if (turn !== this.#turn) {
      this.#turn = turn;
      if (this.#turnPlayer === this.seat) { this.#idleActions = 0; this.#activatedThisTurn.clear(); }
    }
    this.#board = (this.#vision && this.#peek ? boardFromState(this.#peek(), this.seat, true) : null) ?? boardFromView(sel, this.seat) ?? this.#board;
  }

  /** Copies another player's per-turn bookkeeping (a rollout pilot continuing the live player's turn). */
  copyTurnState(from: HeuristicBot): void {
    this.#turn = from.#turn;
    this.#idleActions = from.#idleActions;
    this.#activatedThisTurn = new Set(from.#activatedThisTurn);
    this.#chainedThisWindow = new Set(from.#chainedThisWindow);
  }

  /** evaluate() of a duelcore `state` from this seat (masked for it unless spy). */
  valueOf(state: Json): number {
    const b = boardFromState(state, this.seat, this.#vision);
    if (b) this.#board = b;
    return evaluate(this.#boardPosition());
  }

  /** Bookkeeping for a response injected into a rollout instead of chosen by this pilot (the follow-up target choice
   *  of an injected attack must know the attacker). */
  applyExternalResponse(ev: Prompt, r: Json): void {
    const index = typeof r.index === "number" ? r.index : -1;
    if (ev.kind === "selectBattleCmd") {
      if (r.action === "SELECT_BATTLE") {
        const a = ev.attackable[index];
        if (a) this.#pendingAttacker = this.#me()?.mzone[a.sequence]?.attack ?? this.#stat(a.code).atk;
      } else if (r.action === "SELECT_CHAIN") {
        const a = ev.activatable[index];
        if (a) this.#activatedThisTurn.add(`b:${a.location}:${a.sequence}:${a.description}`);
      }
    } else if (ev.kind === "selectIdleCmd") {
      if (r.action !== "TO_BP" && r.action !== "TO_EP") this.#idleActions++;
      if (r.action === "SELECT_ACTIVATE") {
        const a = ev.activatable[index];
        if (a) this.#activatedThisTurn.add(`${a.location}:${a.sequence}:${a.description}`);
      }
    } else if (ev.kind === "selectEffectYN" && r.yes === true) {
      this.#activatedThisTurn.add(`eff:${ev.card.code}:${ev.description}`);
    } else if (ev.kind === "selectChain" && index >= 0) {
      const c = ev.chains[index];
      if (c) this.#chainedThisWindow.add(`${c.code}:${c.description}`);
    }
  }

  // ---- combo planner ----------------------------------------------------------------------------------------------
  #nameOf(code: number): string { return this.#cards.name(code); }

  /** This NPC's combo state (by card name over hand + field), or null without a plan or with the payoff already out. */
  #comboState(): ComboState | null {
    const plan = this.#combo, me = this.#me();
    if (!plan || !me) return null;
    if (me.mzone.some((c) => c && this.#nameOf(c.code) === plan.fusion)) return null;
    const hand = me.hand.map((c) => this.#nameOf(c));
    const field = me.mzone.filter(Boolean).map((c) => this.#nameOf(c!.code));
    const pieces = [...hand, ...field].filter((n) => plan.pieces.includes(n)).length;
    const haveAssembler = hand.includes(plan.assembler);
    return { plan, pieces, ready: haveAssembler && pieces >= plan.need, haveEnabler: !!plan.graveEnabler && hand.includes(plan.graveEnabler) };
  }

  #comboPayoffLive(): boolean {
    const plan = this.#combo, me = this.#me();
    return !!plan && !!me && me.mzone.some((c) => c && this.#nameOf(c.code) === plan.fusion);
  }

  /** A declared combo outranks the search: the scalar evaluation cannot see a combo's continuous pressure. */
  #hasForcedComboAction(ev: P<"selectIdleCmd">): boolean {
    const plan = this.#combo;
    if (!plan) return false;
    const offered = new Set(ev.activatable.map((a) => this.#nameOf(a.code)));
    if (this.#comboState()?.ready && offered.has(plan.assembler)) return true;
    return this.#comboPayoffLive() && !!plan.afterPayoff?.some((name) => offered.has(name));
  }

  // ---- board helpers ----------------------------------------------------------------------------------------------
  #me(): PlayerBoard | null { return this.#board?.players[this.seat] ?? null; }
  #opp(): PlayerBoard | null { return this.#board?.players[1 - this.seat] ?? null; }
  #stat(code: number) { return this.#cards.stat(code); }

  /** A player's monsters with their current stats. A masked face-down has unknown stats (known = false). */
  #monstersOf(p: PlayerBoard | null): OppMon[] {
    if (!p) return [];
    const out: OppMon[] = [];
    p.mzone.forEach((c, seq) => {
      if (!c) return;
      const faceDown = isFaceDown(c.position);
      out.push({
        seq, atk: c.attack ?? 0, def: c.defense ?? 0, faceDown,
        attackPos: (c.position & POS.ATTACK) !== 0 && !faceDown,
        known: !faceDown || c.code !== 0,
        flipRisk: faceDown ? (c.code ? this.#cards.flipRisk(c.code) : 300) : 0,
      });
    });
    return out;
  }

  /** How many of the opponent's set cards are KNOWN board/attack answers (spy vision only: 0 otherwise). */
  #threatSetCount(): number {
    if (!this.#vision) return 0;
    const opp = this.#opp();
    if (!opp) return 0;
    return opp.szone.filter((c) => c && isFaceDown(c.position) && c.code && THREAT_BACKROW.test(this.#nameOf(c.code))).length;
  }
  #oppMonsters(): OppMon[] { return this.#monstersOf(this.#opp()); }
  #maxAttackAtk(mon: OppMon[]): number { return mon.reduce((m, o) => (o.attackPos && o.atk > m ? o.atk : m), 0); }
  #oppMaxAtk(): number { return this.#maxAttackAtk(this.#oppMonsters()); }

  // ---- card rules -------------------------------------------------------------------------------------------------
  #ruleFor(code: number): CardRule | undefined {
    if (!code) return undefined;
    const named = this.#rules[this.#nameOf(code)];
    if (named) return named;
    let r = TAG_RULES.get(code);
    if (r === undefined) { r = tagRule(this.#cards.brain.get(code)) ?? null; TAG_RULES.set(code, r); }
    return r ?? undefined;
  }

  /** Index of the backrow worth setting: a trap or a quick-play spell (a set normal spell does nothing), or -1. */
  #spellToSet(ev: P<"selectIdleCmd">): number {
    let quick = -1;
    for (let i = 0; i < ev.spellSet.length; i++) {
      const t = this.#cards.brain.get(ev.spellSet[i]!.code)?.type ?? 0;
      if (t & TYPE_TRAP) return i;
      if (quick < 0 && (t & TYPE_QUICKPLAY)) quick = i;
    }
    return quick;
  }

  /** -Infinity = a rule says HOLD. Positive values are pre-development plays. */
  #idlePriority(code: number, ctx: RuleCtx): number {
    const name = this.#nameOf(code);
    if (this.#combo?.afterPayoff?.includes(name) && !this.#comboPayoffLive()) return -Infinity;
    const rule = this.#ruleFor(code);
    if (rule?.idleActivate && !rule.idleActivate(ctx)) return -Infinity;
    return rule?.idlePriority ?? 0;
  }

  /** The board a card rule reasons over. Built once per decision. */
  #ctx(): RuleCtx {
    const me = this.#me(), opp = this.#opp();
    const myMon = this.#monstersOf(me), oppMon = this.#monstersOf(opp);
    const toRule = (o: OppMon): RuleMon => ({ atk: o.atk, def: o.def, faceDown: o.faceDown, attackPos: o.attackPos });
    const backrow = (p: PlayerBoard | null): number => (p ? p.szone.filter(Boolean).length : 0);
    const graveMaxAtk = (p: PlayerBoard | null): number => (p ? p.grave.reduce((m, c) => Math.max(m, this.#stat(c).atk), 0) : 0);
    return {
      myLp: me?.lp ?? 8000, oppLp: opp?.lp ?? 8000,
      myMon: myMon.map(toRule), oppMon: oppMon.map(toRule),
      myMaxAtk: this.#maxAttackAtk(myMon), oppMaxAtk: this.#maxAttackAtk(oppMon),
      myBackrow: backrow(me), oppBackrow: backrow(opp),
      myGraveMaxAtk: graveMaxAtk(me), oppGraveMaxAtk: graveMaxAtk(opp),
      oppHand: opp?.hand.length ?? 0,
    };
  }

  // ---- decision entry ---------------------------------------------------------------------------------------------
  /** With search (elite), the real decisions are scored by fork rollouts; with blunder (easy), a random legal line
   *  sometimes replaces the heuristic's; everything else (and any search failure) is the plain heuristic. */
  decide(ev: Prompt, sel?: Json): Json | null {
    if (ev.kind === "selectIdleCmd" && this.#hasForcedComboAction(ev)) return this.respond(ev);
    if (this.#blunder > 0 && (ev.kind === "selectIdleCmd" || ev.kind === "selectBattleCmd") && this.#rng() < this.#blunder) {
      const cands = this.#candidates(ev);
      if (cands && cands.length > 1) {
        this.#pendingAttacker = null;
        const c = cands[Math.floor(this.#rng() * cands.length)]!;
        c.commit?.();
        return c.resp;
      }
    }
    if (!this.#search || !sel || !searchable(this.#search, sel, this.seat)) return this.respond(ev);
    const cands = this.#candidates(ev);
    if (!cands || cands.length < 2) return this.respond(ev);
    return this.#searchDecide(ev, sel, cands);
  }

  #searchDecide(ev: Prompt, sel: Json, cands: Candidate[]): Json | null {
    const search = this.#search!;
    if (ev.kind !== "selectCard") this.#pendingAttacker = null;
    const t0 = performance.now();
    const scored: { c: Candidate; s: number }[] = [];
    try {
      const limit = Math.max(2, search.maxCandidates);
      // Keep the phase-exit lines (the last two) in the pool: a busy hand can offer many summons/effects.
      const pool = cands.length <= limit ? cands : [...cands.slice(0, limit - 2), ...cands.slice(-2)];
      let last = 0; // the last fork's cost: don't start one that would overrun the budget
      for (const c of pool) {
        const t1 = performance.now();
        if (scored.length > 0 && t1 - t0 + last > search.budgetMs) break;
        const s = rolloutScore(search, this.seat, sel, ev, c.resp, this);
        last = performance.now() - t1;
        if (s === null) return this.respond(ev); // replay drift: the whole decision falls back to the heuristic
        scored.push({ c, s });
        if (s >= 1e9) break; // a winning line
      }
    } catch {
      return this.respond(ev);
    }
    if (scored.length === 0) return this.respond(ev);
    // Stable sort: on a tie the earlier (heuristic-ordered) candidate wins.
    scored.sort((a, b) => b.s - a.s);
    const pick = this.#mistakeRate > 0 && scored.length > 1 && this.#rng() < this.#mistakeRate ? scored[1]! : scored[0]!;
    pick.c.commit?.();
    return pick.c.resp;
  }

  // ---- candidate enumeration (search / blunder) -------------------------------------------------------------------
  // Pure: no bookkeeping here, the chosen candidate's commit() applies it. Candidates come from the prompt's own legal
  // lists, so every line is playable.
  #candidates(ev: Prompt): Candidate[] | null {
    switch (ev.kind) {
      case "selectIdleCmd": return this.#idleActions >= MAX_IDLE_ACTIONS ? null : this.#idleCandidates(ev);
      case "selectBattleCmd": return this.#battleCandidates(ev);
      // Only on OUR OWN turn (protecting a play); on the opponent's turn the fast heuristic reacts.
      case "selectChain": return this.#turnPlayer === this.seat ? this.#chainCandidates(ev) : null;
      case "selectOption": return ev.options.map((_, i) => ({ resp: respOption(i) }));
      case "selectEffectYN": {
        const key = `eff:${ev.card.code}:${ev.description}`;
        if (this.#activatedThisTurn.has(key)) return null;
        return [
          { resp: respEffectYN(true), commit: () => { this.#activatedThisTurn.add(key); } },
          { resp: respEffectYN(false) },
        ];
      }
      default: return null;
    }
  }

  #idleCandidates(ev: P<"selectIdleCmd">): Candidate[] {
    const out: Candidate[] = [];
    const act = () => { this.#idleActions++; };
    const ctx = this.#ctx();
    const combo = this.#comboState();
    // Order matters when the budget only fits a few forks: draw/removal setup, the strongest summons, then the rest.
    const activatable = ev.activatable.map((a, i) => ({ a, i, p: this.#idlePriority(a.code, ctx) }))
      .filter(({ a, p }) => p > -Infinity && !this.#activatedThisTurn.has(`${a.location}:${a.sequence}:${a.description}`))
      .sort((a, b) => b.p - a.p);
    const pushActivation = ({ a, i }: { a: Activatable; i: number }) => {
      const key = `${a.location}:${a.sequence}:${a.description}`;
      out.push({ resp: respIdle("SELECT_ACTIVATE", i), commit: () => { this.#activatedThisTurn.add(key); this.#idleActions++; } });
    };
    activatable.filter((x) => x.p > 0).forEach(pushActivation);
    ev.spSummonable.map((a, i) => ({ i, s: this.#stat(a.code).atk + (this.#ruleFor(a.code)?.summonScore?.(ctx) ?? 0) }))
      .sort((a, b) => b.s - a.s).forEach(({ i }) => out.push({ resp: respIdle("SELECT_SPECIAL_SUMMON", i), commit: act }));
    const summonable = ev.summonable.map((a, i) => ({ a, i }))
      .filter(({ a }) => !combo || !combo.plan.pieces.includes(this.#nameOf(a.code)));
    summonable.map(({ a, i }) => ({ i, s: this.#stat(a.code).atk + (this.#ruleFor(a.code)?.summonScore?.(ctx) ?? 0) }))
      .sort((a, b) => b.s - a.s).forEach(({ i }) => out.push({ resp: respIdle("SELECT_SUMMON", i), commit: act }));
    activatable.filter((x) => x.p === 0).forEach(pushActivation);
    ev.repositionable.forEach((_, i) => out.push({ resp: respIdle("SELECT_POS_CHANGE", i), commit: act }));
    // One set-monster line (the weakest body as a wall) and one set-backrow line.
    const settable = ev.monsterSet.map((a, i) => ({ a, i }))
      .filter(({ a }) => !combo || !combo.plan.pieces.includes(this.#nameOf(a.code)));
    if (settable.length > 0) {
      let wi = 0;
      settable.forEach(({ a }, i) => { if (this.#stat(a.code).atk < this.#stat(settable[wi]!.a.code).atk) wi = i; });
      out.push({ resp: respIdle("SELECT_MONSTER_SET", settable[wi]!.i), commit: act });
    }
    const setIdx = this.#spellToSet(ev);
    if (setIdx >= 0) out.push({ resp: respIdle("SELECT_SPELL_SET", setIdx), commit: act });
    const canAttack = ev.canBattlePhase && this.#hasAttacker();
    if (canAttack) out.push({ resp: respIdle("TO_BP") });
    // Never let the hand-heavy evaluation choose "do nothing" over a clearly useful setup, summon, reposition or
    // attack. Once the productive actions are exhausted, END comes back.
    const usefulReposition = ev.repositionable.some((c) => {
      const s = this.#snap(c);
      if (!s || isFaceDown(s.position)) return false;
      const atk = s.attack ?? this.#stat(c.code).atk;
      const def = s.defense ?? this.#stat(c.code).def;
      return ((s.position & POS.DEFENSE) !== 0 && atk > def && (!ctx.oppMon.length || atk >= ctx.oppMaxAtk))
        || ((s.position & POS.ATTACK) !== 0 && def > atk && ctx.oppMaxAtk > atk);
    });
    const productive = activatable.some((x) => x.p > 0) || ev.spSummonable.length > 0 || summonable.length > 0 || usefulReposition || canAttack;
    if (ev.canEndPhase && !productive) out.push({ resp: respIdle("TO_EP") });
    return out;
  }

  #battleCandidates(ev: P<"selectBattleCmd">): Candidate[] {
    const me = this.#me();
    const out: Candidate[] = [];
    ev.attackable.forEach((a, i) => {
      const atk = me?.mzone[a.sequence]?.attack ?? this.#stat(a.code).atk;
      out.push({ resp: respBattle("SELECT_BATTLE", i), commit: () => { this.#pendingAttacker = atk; } });
    });
    ev.activatable.forEach((a, i) => {
      const key = `b:${a.location}:${a.sequence}:${a.description}`;
      if (this.#activatedThisTurn.has(key)) return;
      out.push({ resp: respBattle("SELECT_CHAIN", i), commit: () => { this.#activatedThisTurn.add(key); } });
    });
    if (ev.canMain2) out.push({ resp: respBattle("TO_M2") });
    if (ev.canEndPhase) out.push({ resp: respBattle("TO_EP") });
    return out;
  }

  /** Chain candidates: pass + each fresh chainable (on our own turn: protect our play or not). */
  #chainCandidates(ev: P<"selectChain">): Candidate[] | null {
    if (ev.chains.length === 0 || ev.forced) return null;
    const out: Candidate[] = [{ resp: respChain(null) }];
    ev.chains.forEach((c, i) => {
      const key = `${c.code}:${c.description}`;
      if (this.#chainedThisWindow.has(key)) return;
      out.push({ resp: respChain(i), commit: () => { this.#chainedThisWindow.add(key); } });
    });
    return out;
  }

  // ---- the heuristic ----------------------------------------------------------------------------------------------
  respond(ev: Prompt): Json | null {
    // Any prompt that isn't the attack-target follow-up clears the pending attacker.
    if (ev.kind !== "selectCard") this.#pendingAttacker = null;
    switch (ev.kind) {
      case "selectIdleCmd": return this.#idle(ev);
      case "selectBattleCmd": return this.#battle(ev);
      case "selectChain": return this.#chain(ev);
      case "selectCard": return this.#selectCard(ev);
      case "selectUnselectCard": return this.#selectUnselect(ev);
      case "selectTribute": return this.#selectTribute(ev);
      case "selectPosition": return respPosition(this.#position(ev.code, ev.positions));
      case "selectPlace": return respPlaces(ev.isDisfield, this.#selectPlace(ev));
      case "selectEffectYN": return this.#effectYN(ev);
      // A bare yes/no is usually a cost or a risk: no. Except the engine's own battle questions: 30 "the attack was
      // repeated, keep attacking?" and 31 "attack directly?".
      case "selectYesNo": return respYesNo(ev.description === "30" || ev.description === "31");
      case "selectOption": return respOption(0);
      case "selectCounter": return this.#selectCounter(ev);
      case "announceRace": return { type: "ANNOUNCE_RACE", races: lowestBits(ev.available, ev.count) };
      case "announceAttrib": return { type: "ANNOUNCE_ATTRIB", attributes: lowestBits(ev.available, ev.count) };
      case "announceNumber": return { type: "ANNOUNCE_NUMBER", value: 0 };
      case "sortCard": return respSort();
      case "selectSum": return solveSum(ev);
      case "announceCard": return solveAnnounceCard(ev.opcodes, this.#cards.brain);
      default: return null; // rock-paper-scissors and the rest: the engine decides
    }
  }

  #selectCounter(ev: P<"selectCounter">): Json {
    const counts = ev.cards.map(() => 0);
    let need = ev.count;
    for (let i = 0; i < ev.cards.length && need > 0; i++) {
      const take = Math.min(need, ev.cards[i]!.counters);
      counts[i] = take;
      need -= take;
    }
    return respCounter(counts);
  }

  /** Zones. A normal PLACE goes on our own side; a DISFIELD (zones that can't be used) locks the OPPONENT's free
   *  Monster Zones first. */
  #selectPlace(ev: P<"selectPlace">): PlaceRef[] {
    if (ev.isDisfield) {
      const opp = 1 - this.seat;
      const oppMZone: PlaceRef[] = [];
      for (const s of zoneOrder(7)) if ((ev.disabledFlag & (1 << (16 + s))) === 0) oppMZone.push({ controller: opp, location: LOCATION.MZONE, sequence: s });
      if (oppMZone.length > 0) {
        const fill = freePlaces(this.seat, ev.count, ev.disabledFlag).filter((p) => !oppMZone.some((o) => o.controller === p.controller && o.sequence === p.sequence && o.location === p.location));
        return [...oppMZone, ...fill].slice(0, ev.count);
      }
    }
    return freePlaces(this.seat, ev.count, ev.disabledFlag);
  }

  // ---- main phase -------------------------------------------------------------------------------------------------
  #idle(ev: P<"selectIdleCmd">): Json {
    const ctx = this.#ctx();
    const oppMax = ctx.oppMaxAtk;
    const oppHasMon = ctx.oppMon.length > 0;
    const combo = this.#comboState();

    // 0. (spy vision) A KNOWN board answer is set and we hold backrow removal: pop it BEFORE committing monsters.
    if (this.#idleActions < MAX_IDLE_ACTIONS && this.#threatSetCount() > 0) {
      for (let i = 0; i < ev.activatable.length; i++) {
        const a = ev.activatable[i]!;
        if (!BACKROW_POPPER.test(this.#nameOf(a.code))) continue;
        const key = `${a.location}:${a.sequence}:${a.description}`;
        if (this.#activatedThisTurn.has(key)) continue;
        const rule = this.#ruleFor(a.code);
        if (rule?.idleActivate && !rule.idleActivate(ctx)) continue;
        this.#activatedThisTurn.add(key);
        this.#idleActions++;
        return respIdle("SELECT_ACTIVATE", i);
      }
    }

    // 0b. Draw/search and tactical removal BEFORE choosing the normal summon.
    if (this.#idleActions < MAX_IDLE_ACTIONS) {
      let best = -1, priority = 0;
      for (let i = 0; i < ev.activatable.length; i++) {
        const a = ev.activatable[i]!;
        if (this.#activatedThisTurn.has(`${a.location}:${a.sequence}:${a.description}`)) continue;
        if (combo && combo.plan.enableField && this.#nameOf(a.code) === combo.plan.enableField) continue;
        const p = this.#idlePriority(a.code, ctx);
        if (p > priority) { priority = p; best = i; }
      }
      if (best >= 0) {
        const a = ev.activatable[best]!;
        this.#activatedThisTurn.add(`${a.location}:${a.sequence}:${a.description}`);
        this.#idleActions++;
        return respIdle("SELECT_ACTIVATE", best);
      }
    }

    // 1. Special summon when possible (almost always free advantage): the strongest.
    if (this.#idleActions < MAX_IDLE_ACTIONS && ev.spSummonable.length > 0) {
      const idx = this.#argBestSummon(ev.spSummonable.map((c) => c.code), ctx);
      this.#idleActions++;
      return respIdle("SELECT_SPECIAL_SUMMON", idx);
    }

    // 2. Normal/tribute summon the strongest worthwhile monster (set it if it can't hold attack).
    const play = this.#chooseMonsterPlay(ev, oppMax, oppHasMon, ctx, combo);
    if (play && this.#idleActions < MAX_IDLE_ACTIONS) { this.#idleActions++; return respIdle(play.cmd, play.index); }

    // 2b. Stand a face-up DEFENSE monster up into ATTACK once it can swing and hold against the board.
    if (this.#idleActions < MAX_IDLE_ACTIONS) {
      for (let i = 0; i < ev.repositionable.length; i++) {
        const s = this.#snap(ev.repositionable[i]!);
        if (!s || isFaceDown(s.position) || (s.position & POS.DEFENSE) === 0) continue;
        const atk = s.attack ?? this.#stat(ev.repositionable[i]!.code).atk;
        if (atk > (s.defense ?? 0) && (!oppHasMon || atk >= oppMax)) { this.#idleActions++; return respIdle("SELECT_POS_CHANGE", i); }
      }
    }

    // 3. An effect / spell not used yet this turn. A card rule can say "hold this" in a bad spot: skip it.
    if (this.#idleActions < MAX_IDLE_ACTIONS) {
      let best = -1, priority = -Infinity;
      for (let i = 0; i < ev.activatable.length; i++) {
        const a = ev.activatable[i]!;
        if (this.#activatedThisTurn.has(`${a.location}:${a.sequence}:${a.description}`)) continue;
        if (combo && combo.plan.enableField && this.#nameOf(a.code) === combo.plan.enableField) continue;
        const p = this.#idlePriority(a.code, ctx);
        if (p > priority) { priority = p; best = i; }
      }
      if (best >= 0) {
        const a = ev.activatable[best]!;
        this.#activatedThisTurn.add(`${a.location}:${a.sequence}:${a.description}`);
        this.#idleActions++;
        return respIdle("SELECT_ACTIVATE", best);
      }
    }

    // 4. Set backrow (traps / quick-plays) to have answers on the opponent's turn.
    const setIdx = this.#spellToSet(ev);
    if (this.#idleActions < MAX_IDLE_ACTIONS && setIdx >= 0) {
      this.#idleActions++;
      return respIdle("SELECT_SPELL_SET", setIdx);
    }

    // 5. Into battle with something that can swing; otherwise end.
    if (ev.canBattlePhase && this.#hasAttacker()) return respIdle("TO_BP");
    if (ev.canEndPhase) return respIdle("TO_EP");
    return respIdle(ev.canBattlePhase ? "TO_BP" : "TO_EP");
  }

  /** The best monster to commit this main phase, and whether to summon it or set it. Greedy "play the strongest"
   *  (a 1-ply evaluation here under-develops: it prices the card spent, not the tempo gained); card rules'
   *  summonScore still biases the pick. */
  #chooseMonsterPlay(ev: P<"selectIdleCmd">, oppMax: number, oppHasMon: boolean, ctx: RuleCtx, combo: ComboState | null): { cmd: "SELECT_SUMMON" | "SELECT_MONSTER_SET"; index: number } | null {
    if (ev.summonable.length === 0) return null;
    const bonus = (code: number): number => this.#ruleFor(code)?.summonScore?.(ctx) ?? 0;
    const summonable = combo ? ev.summonable.filter((c) => !combo.plan.pieces.includes(this.#nameOf(c.code))) : ev.summonable;
    if (summonable.length === 0) return null;
    const cands = summonable.map((c) => {
      const index = ev.summonable.indexOf(c);
      const st = this.#stat(c.code);
      return { index, code: c.code, ...st, score: st.atk + bonus(c.code) };
    });
    const noTrib = cands.filter((c) => c.level <= 4).sort((a, b) => b.score - a.score);
    const trib = cands.filter((c) => c.level >= 5).sort((a, b) => b.score - a.score);
    const bestNoTrib = noTrib[0] ?? null;
    const bestTrib = trib[0] ?? null;

    // Tribute up only when the big monster meaningfully beats the board and the cheap options can't.
    let chosen = bestNoTrib;
    if (bestTrib && bestTrib.atk > oppMax && (!bestNoTrib || bestNoTrib.atk <= oppMax)) chosen = bestTrib;
    else if (bestTrib && !bestNoTrib) chosen = bestTrib;
    if (bestTrib && bestTrib.score > bestTrib.atk && (!chosen || bestTrib.score > chosen.score)) chosen = bestTrib;
    if (!chosen) return null;

    // A small monster that can't survive the opponent's board is better set face-down (unless a rule wants it up).
    const weak = chosen.level <= 4 && oppHasMon && chosen.atk < oppMax && chosen.score <= chosen.atk;
    if (weak) {
      const setIdx = ev.monsterSet.findIndex((c) => c.code === chosen!.code);
      if (setIdx >= 0) return { cmd: "SELECT_MONSTER_SET", index: setIdx };
    }
    return { cmd: "SELECT_SUMMON", index: chosen.index };
  }

  // ---- battle phase -----------------------------------------------------------------------------------------------
  // Combat is deterministic, so the battle phase gets a real 1-ply lookahead: resolve each candidate attack exactly
  // (who dies, the LP swing) and score the RESULTING board with evaluate(); lethal evaluates as a win.
  #boardPosition(): Position {
    const me = this.#me(), opp = this.#opp();
    const toEval = (o: OppMon): EvalMon => ({
      atk: o.atk, def: o.faceDown && !o.known ? Math.max(o.def, 1500) : o.def,
      faceDown: o.faceDown, attackPos: o.attackPos, known: o.known, flipRisk: o.flipRisk,
    });
    return {
      myMon: this.#monstersOf(me).map(toEval), oppMon: this.#monstersOf(opp).map(toEval),
      myLp: me?.lp ?? 8000, oppLp: opp?.lp ?? 8000,
      myHand: me?.hand.length ?? 0,
      myBackrow: me ? me.szone.filter(Boolean).length : 0,
      // With spy vision the backrow risk is exact: only known board answers count.
      oppBackrow: opp ? (this.#vision ? this.#threatSetCount() : opp.szone.filter(Boolean).length) : 0,
    };
  }

  /** Combat view: with spy vision and two or more set monsters, every set monster gets the SAME unknown-wall prior
   *  (no attacking just because x-ray vision found the convenient one). */
  #battlePosition(): Position {
    const base = this.#boardPosition();
    const sets = base.oppMon.filter((m) => m.faceDown);
    if (!this.#vision || sets.length < 2) return base;
    return { ...base, oppMon: base.oppMon.map((m) => (m.faceDown ? { ...m, atk: 0, def: 1500, known: false, flipRisk: 300 } : m)) };
  }

  /** The board after attacker (ATK a) hits t (null = a direct attack). An unknown face-down is a ~1500 DEF wall. */
  #resolveAttack(base: Position, a: number, t: EvalMon | null): Position {
    let { myLp, oppLp } = base;
    let oppMon = base.oppMon, myMon = base.myMon;
    if (t === null) oppLp -= a;
    else {
      const guard = t.faceDown ? (t.known ? t.def : Math.max(t.def, 1500)) : t.attackPos ? t.atk : t.def;
      const dropOne = (m: EvalMon[], x: EvalMon) => {
        const i = m.findIndex((y) => y.atk === x.atk && y.def === x.def && y.attackPos === x.attackPos && y.faceDown === x.faceDown);
        return i < 0 ? m : [...m.slice(0, i), ...m.slice(i + 1)];
      };
      if (t.attackPos) {
        if (a > guard) { oppLp -= a - guard; oppMon = dropOne(oppMon, t); }
        else if (a === guard) {
          oppMon = dropOne(oppMon, t);
          const ai = myMon.findIndex((y) => y.attackPos && y.atk === a);
          if (ai >= 0) myMon = [...myMon.slice(0, ai), ...myMon.slice(ai + 1)];
        } else myLp -= guard - a;
      } else {
        if (a > guard) oppMon = dropOne(oppMon, t);
        else if (a < guard) myLp -= guard - a;
      }
    }
    return { ...base, myLp, oppLp, myMon, oppMon };
  }

  #attackScore(base: Position, atk: number, target: EvalMon | null): number {
    return evaluate(this.#resolveAttack(base, atk, target)) - (target?.faceDown ? target.flipRisk ?? 0 : 0);
  }

  #battle(ev: P<"selectBattleCmd">): Json {
    const ctx = this.#ctx();
    for (let i = 0; i < ev.activatable.length; i++) {
      const a = ev.activatable[i]!;
      const key = `b:${a.location}:${a.sequence}:${a.description}`;
      if (this.#activatedThisTurn.has(key)) continue;
      if (!this.#ruleFor(a.code)?.battleActivate?.(ctx)) continue;
      this.#activatedThisTurn.add(key);
      return respBattle("SELECT_CHAIN", i);
    }
    const base = this.#battlePosition();
    const me = this.#me();
    let bestIdx = -1, bestScore = evaluate(base), bestAtk = 0;
    for (let index = 0; index < ev.attackable.length; index++) {
      const a = ev.attackable[index]!;
      const atk = me?.mzone[a.sequence]?.attack ?? this.#stat(a.code).atk;
      // The target comes in a follow-up prompt: score this attacker by its BEST target.
      const targets: (EvalMon | null)[] = (a.directAttackable || base.oppMon.length === 0) ? [null] : base.oppMon;
      let bodyBest = -Infinity;
      for (const t of targets) bodyBest = Math.max(bodyBest, this.#attackScore(base, atk, t));
      if (bodyBest > bestScore) { bestScore = bodyBest; bestIdx = index; bestAtk = atk; }
    }
    if (bestIdx >= 0) { this.#pendingAttacker = bestAtk; return respBattle("SELECT_BATTLE", bestIdx); }
    if (ev.canMain2) return respBattle("TO_M2");
    return respBattle("TO_EP");
  }

  // ---- chains / responses -----------------------------------------------------------------------------------------
  #chain(ev: P<"selectChain">): Json {
    if (ev.chains.length === 0) return respChain(null);
    if (ev.forced) return respChain(0);
    // Set traps / quick effects on the OPPONENT's turn (removal and negation timing); on our own turn, no optional
    // self-chains that would interrupt our own plays.
    if (this.#turnPlayer === this.seat) return respChain(null);
    const ctx = this.#ctx();
    for (let i = 0; i < ev.chains.length; i++) {
      const c = ev.chains[i]!;
      const key = `${c.code}:${c.description}`;
      if (this.#chainedThisWindow.has(key)) continue;
      const rule = this.#ruleFor(c.code);
      if (rule?.chainReact && !rule.chainReact(ctx)) continue;
      this.#chainedThisWindow.add(key);
      return respChain(i);
    }
    return respChain(null);
  }

  #selectCard(ev: P<"selectCard">): Json {
    // The attack-target follow-up: the best monster this attacker can destroy.
    if (this.#pendingAttacker !== null) {
      const atk = this.#pendingAttacker;
      this.#pendingAttacker = null;
      const idx = this.#bestAttackTarget(ev.cards, atk);
      if (idx >= 0) return respCards([idx]);
    }
    // Combo plan: the goal fusion when the assembler offers Extra Deck choices; for a from-hand cost, protect the
    // pieces (send them last) and dump the grave-enabler first.
    const combo = this.#comboState();
    if (combo) {
      const goalIdx = ev.cards.findIndex((c) => (c.location & LOCATION.EXTRA) !== 0 && this.#nameOf(c.code) === combo.plan.fusion);
      if (goalIdx >= 0 && ev.min <= 1 && ev.max >= 1) return respCards([goalIdx]);
      const fromHandCost = ev.min >= 1 && ev.cards.length > 0 && ev.cards.every((c) => c.controller === this.seat && (c.location & LOCATION.HAND) !== 0);
      if (fromHandCost) {
        const rank = (i: number): number => { const n = this.#nameOf(ev.cards[i]!.code); return n === combo.plan.graveEnabler ? 0 : combo.plan.pieces.includes(n) ? 2 : 1; };
        const order = ev.cards.map((_, i) => i).sort((a, b) => rank(a) - rank(b));
        return respCards(order.slice(0, Math.min(Math.max(ev.min, 1), ev.cards.length)));
      }
    }
    return respCards(this.#pickTargets(ev.cards, ev.min, ev.max));
  }

  #selectUnselect(ev: P<"selectUnselectCard">): Json {
    if (ev.min <= 0 || ev.finishable || ev.selectable.length === 0) return respUnselect(null);
    const pick = this.#pickTargets(ev.selectable, 1, 1)[0];
    return respUnselect(pick ?? 0);
  }

  #selectTribute(ev: P<"selectTribute">): Json {
    // Feed the weakest monsters, enough to satisfy the minimum.
    const ranked = ev.cards
      .map((c, index) => ({ index, atk: this.#liveAtk(c) ?? this.#stat(c.code).atk, param: c.releaseParam }))
      .sort((a, b) => a.atk - b.atk);
    const picks: number[] = [];
    let weight = 0;
    for (const r of ranked) {
      if (weight >= ev.min) break;
      picks.push(r.index);
      weight += Math.max(1, r.param & 0xf); // low nibble: how many tributes this card counts as
    }
    while (picks.length < ev.min) { const next = ranked[picks.length]; if (!next) break; picks.push(next.index); }
    return respTribute(picks);
  }

  /** Target indices for a card prompt, through the controller-aware chooseTargets() below. */
  #pickTargets(cards: CardRef[], min: number, max: number): number[] {
    const acquisition = cards.length > 0 && cards.every((c) => c.controller === this.seat && (c.location & (LOCATION.DECK | LOCATION.EXTRA)) !== 0);
    const ctx = acquisition ? this.#ctx() : null;
    const valued = cards.map((c) => ({
      controller: c.controller,
      location: c.location,
      // Deck searches should find engine starters, not merely the highest printed ATK.
      value: this.#removalValue(c) + (ctx && c.code ? (this.#ruleFor(c.code)?.summonScore?.(ctx) ?? 0) : 0),
    }));
    return chooseTargets(valued, this.seat, min, max);
  }

  /** Among the offered attack targets, the one whose post-combat board evaluates best (exact combat). */
  #bestAttackTarget(cards: CardRef[], atk: number): number {
    const base = this.#battlePosition();
    const built = cards.map((c) => {
      const s = this.#snap(c);
      const pos = s?.position ?? c.position ?? 0;
      const faceDown = isFaceDown(pos);
      const code = s?.code || c.code;
      const st = this.#stat(code);
      const exact: EvalMon = {
        atk: s?.attack ?? st.atk, def: s?.defense ?? st.def, faceDown,
        attackPos: (pos & POS.ATTACK) !== 0 && !faceDown,
        known: !faceDown || !!code,
        flipRisk: faceDown ? (code ? this.#cards.flipRisk(code) : 300) : 0,
      };
      return { faceDown, exact };
    });
    const hidden = built.map((x, i) => (x.faceDown ? i : -1)).filter((i) => i >= 0);
    const anonymize = this.#vision && hidden.length >= 2;
    let best = 0, bestScore = -Infinity;
    built.forEach(({ faceDown, exact }, index) => {
      const mon = anonymize && faceDown ? { ...exact, atk: 0, def: 1500, known: false, flipRisk: 300 } : exact;
      const score = this.#attackScore(base, atk, mon);
      if (score > bestScore) { bestScore = score; best = index; }
    });
    // All anonymised set targets score the same: sample uniformly among them.
    if (anonymize && built[best]?.faceDown) return hidden[Math.floor(this.#rng() * hidden.length)] ?? best;
    return best;
  }

  #removalValue(c: CardRef): number {
    // HONESTY GUARD: a prompt offering the opponent's HAND is a random pick, even with spy vision: equal value plus
    // rng jitter = a uniformly random pick.
    if (c.controller !== this.seat && (c.location & LOCATION.HAND) !== 0) return 1000 + this.#rng();
    const live = this.#liveAtk(c);
    if (live !== undefined) return live;
    // Face-down on the FIELD: spy vision reads it off the (unmasked) board.
    if (this.#vision) {
      const s = this.#snap(c);
      if (s?.code) {
        if ((s.location & LOCATION.MZONE) !== 0) return Math.max(s.attack ?? 0, s.defense ?? 0);
        return THREAT_BACKROW.test(this.#nameOf(s.code)) ? 1800 : 300;
      }
    }
    return isFaceDown(c.position ?? 0) ? 1500 : (c.code ? this.#stat(c.code).atk : 0);
  }

  /** Current ATK of a known face-up monster (board first, base stats as fallback). */
  #liveAtk(c: CardRef): number | undefined {
    if (isFaceDown(c.position ?? 0)) return undefined;
    const s = this.#snap(c);
    if (s && !isFaceDown(s.position) && s.attack !== undefined) return s.attack;
    return c.code ? this.#stat(c.code).atk : undefined;
  }

  /** The referenced card on the board (its current, buffed stats). */
  #snap(c: CardRef): BoardCard | null {
    const p = this.#board?.players[c.controller];
    if (!p) return null;
    const zone = c.location & LOCATION.MZONE ? p.mzone : c.location & LOCATION.SZONE ? p.szone : null;
    return zone ? zone[c.sequence] ?? null : null;
  }

  // ---- small choices ----------------------------------------------------------------------------------------------
  #effectYN(ev: P<"selectEffectYN">): Json {
    // A card's optional effect once per turn (yes again on a re-trigger would loop).
    const key = `eff:${ev.card.code}:${ev.description}`;
    if (this.#activatedThisTurn.has(key)) return respEffectYN(false);
    this.#activatedThisTurn.add(key);
    return respEffectYN(true);
  }

  /** Face-up attack for a real attacker that can hold; a wall (DEF > ATK) or an outclassed body defends. */
  #position(code: number, positions: number): number {
    const { atk, def } = this.#stat(code);
    const oppMax = this.#oppMaxAtk();
    const safeAttack = !this.#oppMonsters().length || atk >= oppMax;
    const order = (safeAttack && def <= atk)
      ? [POS.FACEUP_ATTACK, POS.FACEUP_DEFENSE, POS.FACEDOWN_DEFENSE, POS.FACEDOWN_ATTACK]
      : (def >= atk
        ? [POS.FACEUP_DEFENSE, POS.FACEDOWN_DEFENSE, POS.FACEUP_ATTACK, POS.FACEDOWN_ATTACK]
        : [POS.FACEUP_ATTACK, POS.FACEUP_DEFENSE, POS.FACEDOWN_DEFENSE, POS.FACEDOWN_ATTACK]);
    for (const p of order) if (positions & p) return p;
    return POS.FACEUP_ATTACK;
  }

  #hasAttacker(): boolean {
    const me = this.#me();
    return !!me && me.mzone.some((c) => c && (c.position & POS.ATTACK) !== 0 && !isFaceDown(c.position));
  }

  /** Index of the best monster to summon: ATK plus its rule's summon bonus. */
  #argBestSummon(codes: number[], ctx: RuleCtx): number {
    let best = 0, bestScore = -Infinity;
    codes.forEach((code, i) => {
      const s = this.#stat(code).atk + (this.#ruleFor(code)?.summonScore?.(ctx) ?? 0);
      if (s > bestScore) { bestScore = s; best = i; }
    });
    return best;
  }
}

/**
 * Up to `max` (>= `min`) target indices for a card prompt, CONTROLLER-AWARE so the player never targets its own board
 * with removal:
 *   - the opponent controls ANY offered card: removal / disruption / a steal: take THEIR highest-value cards;
 *   - deck / extra / graveyard prompts: searches and revivals: take our HIGHEST-value card;
 *   - any other own-only prompt is a cost: give up our LOWEST-value card.
 */
export function chooseTargets(cards: { controller: number; location: number; value: number }[], seat: number, min: number, max: number): number[] {
  if (cards.length === 0) return [];
  const n = Math.min(Math.max(min, 0), max > 0 ? max : cards.length);
  if (n === 0) return [];
  const all = cards.map((_, i) => i);
  const theirs = all.filter((i) => cards[i]!.controller !== seat);
  if (theirs.length > 0) {
    const picks = theirs.slice().sort((a, b) => cards[b]!.value - cards[a]!.value).slice(0, n);
    if (picks.length < n) {
      const mine = all.filter((i) => cards[i]!.controller === seat).sort((a, b) => cards[a]!.value - cards[b]!.value);
      picks.push(...mine.slice(0, n - picks.length));
    }
    return picks;
  }
  const gain = cards.every((c) => (c.location & (LOCATION.DECK | LOCATION.EXTRA)) !== 0);
  const revival = cards.some((c) => (c.location & LOCATION.GRAVE) !== 0);
  return all.sort((a, b) => ((gain || revival) ? cards[b]!.value - cards[a]!.value : cards[a]!.value - cards[b]!.value)).slice(0, n);
}
