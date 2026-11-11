// HeuristicBot: Duel Evolution's NPC AI player. A generic player with per-card rules (cardRules.ts) that reads the
// board instead of playing the first legal thing:
//   - Main phase: counts lethal first (every body that can swing against the opponent's LP: then it turns them all
//     up and goes to battle without over-committing); draw/search and tactical removal, special-summons, plays the
//     STRONGEST monster (tribute-summoning a boss over a weak body, a stolen monster or a token), sets a wall, a flip
//     monster or an outclassed body face-down, turns set attackers up onto an open field and outclassed ones to
//     defense, sets backrow and uses its spells/effects when a rule (cardRules.ts) says they pay.
//   - Battle: only declares attacks that improve the position (exact 1-ply combat, scored by evaluate()), takes lethal
//     when it is there, breaks walls only with a monster big enough to risk it, never trades evenly for nothing.
//   - Responses: springs set cards when a rule says the moment is right (an attack worth it, the opponent's End
//     Phase, something to negate; one answer per chain), removes the opponent's biggest threat, equips its own best
//     monster, tributes its weakest monsters, defends when behind.
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
import { H_EQUIP, TAGS_NO_BOOST, TYPE_MONSTER, TYPE_QUICKPLAY, TYPE_TRAP } from "../brain/cards.ts";
import { COMBO_PLANS, type ComboPlan } from "./comboPlans.ts";
import { evaluate, type EvalMon, type Position } from "./evaluate.ts";
import {
  type Activatable, type BoardCard, type CardRef, type DuelBoard, type Json, type PlaceRef, type PlayerBoard, type Prompt,
  LOCATION, PHASE, POS, boardFromState, boardFromView, freePlaces, isFaceDown, lowestBits, solveAnnounceCard, solveSum, toPrompt,
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

interface OppMon { seq: number; atk: number; def: number; faceDown: boolean; attackPos: boolean; known: boolean; flipRisk: number;
  /** Taken from the other player until the End Phase (Brain Control): it goes back, so it is the first tribute. */
  stolen: boolean }
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
  /** Keep the declared monster across chain/target prompts: a replay must reassess the NEW board. */
  #declaredAttacker: CardRef | null = null;
  /** The declared attack reached its declaration (the engine's ATTACK). When it did not (an attack cost refused:
   *  Panther Warrior's tribute), that monster is not declared again this turn: it looped to the decision cap. */
  #attackSeen = true;
  #deadAttackers = new Set<number>();
  /** The opponent's attack of this Battle Phase (their monster's zone), until the phase changes. */
  #attack: { sequence: number; direct: boolean } | null = null;
  /** Who activated the chain's last link (null outside a chain). */
  #chainTop: number | null = null;
  /** The engine's hint for this seat's next card pick (HINT type 3: 518 = equip...). */
  #hint = 0;
  /** The card this seat activated last (what a following target pick belongs to). */
  #lastActivated = 0;
  /** The turn a control card that gives the monster back at the End Phase was activated (Brain Control): what it
   *  took is a free tribute that turn. */
  #lentTurn = -1;
  /** Lethal was counted this turn: turn every body up, summon the strongest, attack. */
  #allIn = false;
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
    switch (ev.type) {
      case "CHAIN_END": this.#chainedThisWindow.clear(); this.#chainTop = null; break;
      case "CHAINING": this.#chainTop = Number(ev.controller); break;
      case "NEW_PHASE": case "NEW_TURN": this.#attack = null; break;
      case "ATTACK": {
        const a = ev.card as Json | undefined;
        if (a && Number(a.controller) !== this.seat) this.#attack = { sequence: Number(a.sequence), direct: !ev.target };
        else this.#attackSeen = true;
        break;
      }
      case "HINT": if (ev.hint_type === 3 && ev.player === this.seat) this.#hint = Number(ev.hint); break;
    }
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
      this.#declaredAttacker = null;
      this.#attackSeen = true;
      this.#deadAttackers.clear();
      if (this.#turnPlayer === this.seat) { this.#idleActions = 0; this.#activatedThisTurn.clear(); this.#allIn = false; }
    }
    this.#board = (this.#vision && this.#peek ? boardFromState(this.#peek(), this.seat, true) : null) ?? boardFromView(sel, this.seat) ?? this.#board;
  }

  /** Copies another player's per-turn bookkeeping (a rollout pilot continuing the live player's turn). */
  copyTurnState(from: HeuristicBot): void {
    this.#turn = from.#turn;
    this.#idleActions = from.#idleActions;
    this.#activatedThisTurn = new Set(from.#activatedThisTurn);
    this.#chainedThisWindow = new Set(from.#chainedThisWindow);
    this.#allIn = from.#allIn;
    this.#lentTurn = from.#lentTurn;
    this.#attackSeen = from.#attackSeen;
    this.#deadAttackers = new Set(from.#deadAttackers);
    this.#attack = from.#attack;
    this.#chainTop = from.#chainTop;
    this.#hint = from.#hint;
    this.#lastActivated = from.#lastActivated;
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
        if (a) { this.#declaredAttacker = a; this.#attackSeen = false; this.#pendingAttacker = this.#me()?.mzone[a.sequence]?.attack ?? this.#stat(a.code).atk; }
      } else if (r.action === "SELECT_CHAIN") {
        const a = ev.activatable[index];
        if (a) { this.#activatedThisTurn.add(`b:${a.location}:${a.sequence}:${a.description}`); this.#activated(a.code); }
      }
    } else if (ev.kind === "selectIdleCmd") {
      if (r.action !== "TO_BP" && r.action !== "TO_EP") this.#idleActions++;
      if (r.action === "SELECT_ACTIVATE") {
        const a = ev.activatable[index];
        if (a) { this.#activatedThisTurn.add(`${a.location}:${a.sequence}:${a.description}`); this.#activated(a.code); }
      }
    } else if (ev.kind === "selectEffectYN" && r.yes === true) {
      this.#activatedThisTurn.add(`eff:${ev.card.code}:${ev.description}`);
    } else if (ev.kind === "selectChain" && index >= 0) {
      const c = ev.chains[index];
      if (c) { this.#chainedThisWindow.add(`${c.code}:${c.description}`); this.#activated(c.code); }
    }
  }

  /** Bookkeeping for a card this seat activates: what a following target pick belongs to. */
  #activated(code: number): void {
    this.#lastActivated = code;
    const k = this.#cards.brain.get(code);
    if (k && k.has("control") && k.descTemporal) this.#lentTurn = this.#turn;
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
        stolen: c.owner !== undefined && c.owner !== c.controller && this.#lentTurn === this.#turn,
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
  /** The card's rule: its named rule over the rule from its type and tags, field by field. */
  #ruleFor(code: number): CardRule | undefined {
    if (!code) return undefined;
    let r = TAG_RULES.get(code);
    if (r === undefined) { r = tagRule(this.#cards.brain.get(code)) ?? null; TAG_RULES.set(code, r); }
    const named = this.#rules[this.#nameOf(code)];
    return named ? (r ? { ...r, ...named } : named) : r ?? undefined;
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
    const attacker = this.#attack && this.#turnPlayer !== this.seat ? opp?.mzone[this.#attack.sequence] : null;
    const attackAtk = attacker && !isFaceDown(attacker.position) ? Math.max(1, attacker.attack ?? 0) : 0;
    return {
      myLp: me?.lp ?? 8000, oppLp: opp?.lp ?? 8000,
      myMon: myMon.map(toRule), oppMon: oppMon.map(toRule),
      myMaxAtk: this.#maxAttackAtk(myMon), oppMaxAtk: this.#maxAttackAtk(oppMon),
      myBackrow: backrow(me), oppBackrow: backrow(opp),
      myGraveMaxAtk: graveMaxAtk(me), oppGraveMaxAtk: graveMaxAtk(opp),
      oppHand: opp?.hand.length ?? 0,
      myHand: me?.hand.length ?? 0,
      myHandTributes: me ? me.hand.filter((c) => { const k = this.#cards.brain.get(c); return !!k && k.tributes() > 0; }).length : 0,
      myRemoved: me ? me.removed.filter((c) => ((this.#cards.brain.get(c)?.type ?? 0) & TYPE_MONSTER) !== 0).length : 0,
      myTurn: this.#turnPlayer === this.seat,
      oppEndPhase: this.#turnPlayer !== this.seat && this.#board?.phase === PHASE.END,
      attackAtk, attackLethal: attackAtk > 0 && attackAtk >= (me?.lp ?? 8000) && (this.#attack!.direct || myMon.length === 0),
      oppChained: this.#chainTop !== null && this.#chainTop !== this.seat,
    };
  }

  // ---- decision entry ---------------------------------------------------------------------------------------------
  /** With search (elite), the real decisions are scored by fork rollouts; with blunder (easy), a random legal line
   *  sometimes replaces the heuristic's; everything else (and any search failure) is the plain heuristic. */
  decide(ev: Prompt, sel?: Json): Json | null {
    if (ev.kind === "selectIdleCmd" && this.#hasForcedComboAction(ev)) return this.respond(ev);
    if (this.#blunder > 0 && ev.kind === "selectIdleCmd" && this.#rng() < this.#blunder) {
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
    // Order matters when the budget only fits a few forks: draw/removal setup, the strongest summons, then the rest.
    const activatable = ev.activatable.map((a, i) => ({ a, i, p: this.#idlePriority(a.code, ctx) }))
      .filter(({ a, p }) => p > -Infinity && !this.#activatedThisTurn.has(`${a.location}:${a.sequence}:${a.description}`))
      .sort((a, b) => b.p - a.p);
    const pushActivation = ({ a, i }: { a: Activatable; i: number }) => {
      const key = `${a.location}:${a.sequence}:${a.description}`;
      out.push({ resp: respIdle("SELECT_ACTIVATE", i), commit: () => { this.#activatedThisTurn.add(key); this.#idleActions++; this.#activated(a.code); } });
    };
    activatable.filter((x) => x.p > 0).forEach(pushActivation);
    ev.spSummonable.map((a, i) => ({ a, i, s: this.#stat(a.code).atk + (this.#ruleFor(a.code)?.summonScore?.(ctx) ?? 0) }))
      .filter(({ a }) => this.#ruleFor(a.code)?.specialSummon?.(ctx) ?? true)
      .sort((a, b) => b.s - a.s).forEach(({ i }) => out.push({ resp: respIdle("SELECT_SPECIAL_SUMMON", i), commit: act }));
    // Fusion materials remain usable on the field: do not give up all board presence while waiting to draw Polymerization.
    const summonable = ev.summonable.map((a, i) => ({ a, i }));
    summonable.map(({ a, i }) => ({ i, s: this.#stat(a.code).atk + (this.#ruleFor(a.code)?.summonScore?.(ctx) ?? 0) }))
      .sort((a, b) => b.s - a.s).forEach(({ i }) => out.push({ resp: respIdle("SELECT_SUMMON", i), commit: act }));
    activatable.filter((x) => x.p === 0).forEach(pushActivation);
    ev.repositionable.forEach((_, i) => out.push({ resp: respIdle("SELECT_POS_CHANGE", i), commit: act }));
    // One set-monster line (the weakest body as a wall) and one set-backrow line.
    const settable = ev.monsterSet.map((a, i) => ({ a, i }));
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
    this.#noteDeadAttacker();
    ev.attackable.forEach((a, i) => {
      if (this.#deadAttackers.has(a.sequence)) return;
      const atk = me?.mzone[a.sequence]?.attack ?? this.#stat(a.code).atk;
      out.push({ resp: respBattle("SELECT_BATTLE", i), commit: () => { this.#declaredAttacker = a; this.#attackSeen = false; this.#pendingAttacker = atk; } });
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
      case "selectYesNo": return this.#battleYesNo(ev.description);
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

    // 00. Lethal on an open field: with it already standing, straight to battle (nothing more to lose to a trap);
    // with it in reach, every body turned up and the strongest summoned, then battle.
    if (ev.canBattlePhase && !oppHasMon && this.#idleActions < MAX_IDLE_ACTIONS) {
      const reach = this.#reach(ev);
      if (reach.standing >= ctx.oppLp) return respIdle("TO_BP");
      if (reach.standing + reach.turned + reach.summon >= ctx.oppLp) this.#allIn = true;
      if (this.#allIn) {
        if (reach.turnIndex >= 0) { this.#idleActions++; return respIdle("SELECT_POS_CHANGE", reach.turnIndex); }
        if (reach.summonIndex >= 0) { this.#idleActions++; return respIdle("SELECT_SUMMON", reach.summonIndex); }
        if (reach.standing > 0) return respIdle("TO_BP");
      }
    }

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
        this.#activated(a.code);
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
        this.#activated(a.code);
        return respIdle("SELECT_ACTIVATE", best);
      }
    }

    // 1. Special summon when possible (almost always free advantage): the strongest.
    if (this.#idleActions < MAX_IDLE_ACTIONS) {
      const offered = ev.spSummonable.map((c, i) => ({ c, i })).filter(({ c }) => this.#ruleFor(c.code)?.specialSummon?.(ctx) ?? true);
      if (offered.length > 0) {
        const idx = offered[this.#argBestSummon(offered.map(({ c }) => c.code), ctx)]!.i;
        this.#idleActions++;
        return respIdle("SELECT_SPECIAL_SUMMON", idx);
      }
    }

    // 2. Normal/tribute summon the strongest worthwhile monster (set it if it can't hold attack).
    const play = this.#chooseMonsterPlay(ev, oppMax, oppHasMon, ctx);
    if (play && this.#idleActions < MAX_IDLE_ACTIONS) { this.#idleActions++; return respIdle(play.cmd, play.index); }

    // 2b. Stand a DEFENSE monster up into ATTACK once it can swing and hold against the board: a face-up one, a set
    // attacker (a Flip Summon), and a set flip monster whose effect has something to hit.
    if (this.#idleActions < MAX_IDLE_ACTIONS && ev.canBattlePhase) {
      for (let i = 0; i < ev.repositionable.length; i++) {
        const r = ev.repositionable[i]!;
        const s = this.#snap(r);
        if (!s) continue;
        const st = this.#stat(r.code);
        const atk = s.attack ?? st.atk, def = s.defense ?? st.def;
        const holds = !oppHasMon || atk >= oppMax;
        let up = false;
        if (isFaceDown(s.position)) up = (holds && atk >= 1400 && (atk >= def || atk >= 1500 || oppHasMon)) || (oppHasMon && this.#cards.flipRisk(r.code) >= 2200);
        else if ((s.position & POS.DEFENSE) !== 0) up = atk > def && holds;
        if (up) { this.#idleActions++; return respIdle("SELECT_POS_CHANGE", i); }
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
        this.#activated(a.code);
        return respIdle("SELECT_ACTIVATE", best);
      }
    }

    // 4. Set backrow (traps / quick-plays) to have answers on the opponent's turn.
    const setIdx = this.#spellToSet(ev);
    if (this.#idleActions < MAX_IDLE_ACTIONS && setIdx >= 0) {
      this.#idleActions++;
      return respIdle("SELECT_SPELL_SET", setIdx);
    }

    // 4b. An attacker that stands under a bigger one only feeds LP: to defense. After the battle (Main Phase 2: the
    // ones that did not attack), or before it when no monster of ours has a battle to win.
    if (this.#idleActions < MAX_IDLE_ACTIONS && oppMax > 0) {
      const wins = (atk: number): boolean => this.#oppMonsters().some((m) => (m.attackPos ? atk > m.atk : m.faceDown && !m.known ? atk > 1500 : atk > m.def));
      const after = this.#board?.phase === PHASE.MAIN2 || !ev.canBattlePhase || !this.#monstersOf(this.#me()).some((m) => m.attackPos && wins(m.atk));
      for (let i = 0; after && i < ev.repositionable.length; i++) {
        const r = ev.repositionable[i]!;
        const s = this.#snap(r);
        if (!s || isFaceDown(s.position) || (s.position & POS.ATTACK) === 0) continue;
        if ((s.attack ?? this.#stat(r.code).atk) < oppMax) { this.#idleActions++; return respIdle("SELECT_POS_CHANGE", i); }
      }
    }

    // 5. Into battle with something that can swing; otherwise end.
    if (ev.canBattlePhase && this.#hasAttacker()) return respIdle("TO_BP");
    if (ev.canEndPhase) return respIdle("TO_EP");
    return respIdle(ev.canBattlePhase ? "TO_BP" : "TO_EP");
  }

  /** Damage on an open field this turn: what stands in attack, what a position change adds (the first such
   *  monster's index) and the strongest Normal Summon without tribute (its index). */
  #reach(ev: P<"selectIdleCmd">): { standing: number; turned: number; turnIndex: number; summon: number; summonIndex: number } {
    const standing = this.#monstersOf(this.#me()).reduce((n, m) => n + (m.attackPos ? m.atk : 0), 0);
    let turned = 0, turnIndex = -1;
    ev.repositionable.forEach((r, i) => {
      const s = this.#snap(r);
      if (!s || (!isFaceDown(s.position) && (s.position & POS.ATTACK) !== 0)) return;
      const atk = s.attack ?? this.#stat(r.code).atk;
      if (atk <= 0) return;
      turned += atk;
      if (turnIndex < 0) turnIndex = i;
    });
    let summon = 0, summonIndex = -1;
    ev.summonable.forEach((c, i) => {
      const st = this.#stat(c.code);
      if (st.level <= 4 && st.atk > summon && !this.#ruleFor(c.code)?.keepInHand) { summon = st.atk; summonIndex = i; }
    });
    return { standing, turned, turnIndex, summon, summonIndex };
  }

  /** The best monster to commit this main phase, and whether to summon it or set it. Greedy "play the strongest"
   *  (a 1-ply evaluation here under-develops: it prices the card spent, not the tempo gained); card rules'
   *  summonScore still biases the pick. */
  #chooseMonsterPlay(ev: P<"selectIdleCmd">, oppMax: number, oppHasMon: boolean, ctx: RuleCtx): { cmd: "SELECT_SUMMON" | "SELECT_MONSTER_SET"; index: number } | null {
    if (ev.summonable.length === 0) return null;
    const bonus = (code: number): number => this.#ruleFor(code)?.summonScore?.(ctx) ?? 0;
    const cands = ev.summonable.map((c, index) => ({ index, code: c.code, ...this.#stat(c.code), score: this.#stat(c.code).atk + bonus(c.code) }))
      .filter((c) => !this.#ruleFor(c.code)?.keepInHand);
    if (cands.length === 0) return null;
    const noTrib = cands.filter((c) => c.level <= 4).sort((a, b) => b.score - a.score);
    // What a tribute gives up: a stolen monster goes back anyway, so it is free.
    const material = this.#monstersOf(this.#me()).map((m) => (m.stolen ? 0 : 1000 + Math.max(m.atk, m.def) * 0.4)).sort((a, b) => a - b);
    const tributes = (level: number): number => (level >= 7 ? 2 : 1);
    const costOf = (level: number): number => material.slice(0, tributes(level)).reduce((sum, value) => sum + value, 0);
    const trib = cands.filter((c) => {
      if (c.level < 5) return false;
      const b = bonus(c.code);
      if (c.atk < oppMax && b <= 0) return false; // a tribute for a body the board already beats
      const breaksWall = c.atk > oppMax && ctx.myMaxAtk <= oppMax && oppHasMon;
      return breaksWall || 1000 + c.atk * 0.4 + b > costOf(c.level);
    }).sort((a, b) => b.score - a.score);
    const bestNoTrib = noTrib[0] ?? null;
    const bestTrib = trib[0] ?? null;

    // Tribute up when the big monster beats the board and the cheap options can't, when the tributes are free
    // (stolen) or weak bodies (a boss for a 1000-ATK searcher: tribute monsters must not rot in the hand).
    let chosen = bestNoTrib;
    if (bestTrib) {
      const n = tributes(bestTrib.level), cost = costOf(bestTrib.level), gain = bestTrib.atk - (bestNoTrib?.atk ?? 0);
      const free = material.length >= n && cost <= 600 * n && gain > 0;
      const upgrade = material.length >= n && bestTrib.atk >= 2200 && cost <= 1600 * n && gain >= 500;
      if (bestTrib.atk > oppMax && (!bestNoTrib || bestNoTrib.atk <= oppMax)) chosen = bestTrib;
      else if (!bestNoTrib || free || upgrade) chosen = bestTrib;
      if (bestTrib.score > bestTrib.atk && (!chosen || bestTrib.score > chosen.score)) chosen = bestTrib;
    }
    if (!chosen) return null;

    // Face-down instead: a small monster that can't survive the opponent's board, a wall, a body too feeble to
    // stand in attack and a FLIP monster (unless a rule wants it up, or the turn is the lethal push).
    const oppAttacks = ctx.oppMon.some((m) => m.attackPos);
    const setIt = (c: { code: number; atk: number; def: number; level: number; score: number }): boolean => {
      if (c.level > 4 || c.score > c.atk || this.#allIn) return false;
      return (oppAttacks && c.atk < oppMax) || (c.def > c.atk && c.atk < 1500) || c.atk < 1000 || !!this.#cards.brain.get(c.code)?.is_flip;
    };
    if (setIt(chosen)) {
      // Among the bodies that would be set anyway, the best one face-down: a disruptive FLIP, then the highest DEF.
      const wallValue = (code: number): number => (this.#cards.flipRisk(code) >= 2200 ? 5000 : 0) + this.#stat(code).def;
      let best = -1, bestValue = -Infinity;
      ev.monsterSet.forEach((c, i) => {
        const st = this.#stat(c.code);
        if (this.#ruleFor(c.code)?.keepInHand || !setIt({ code: c.code, ...st, score: st.atk + bonus(c.code) })) return;
        const v = wallValue(c.code);
        if (v > bestValue) { bestValue = v; best = i; }
      });
      if (best >= 0) return { cmd: "SELECT_MONSTER_SET", index: best };
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
    // Combat compares boards before and after one attack: no backrow discount on our own bodies here (halving
    // them made an even trade, our 1300 for their 1300, read as a gain).
    const base = { ...this.#boardPosition(), oppBackrow: 0 };
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
        } else {
          myLp -= guard - a;
          const ai = myMon.findIndex((y) => y.attackPos && y.atk === a);
          if (ai >= 0) myMon = [...myMon.slice(0, ai), ...myMon.slice(ai + 1)];
        }
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
      this.#activated(a.code);
      return respBattle("SELECT_CHAIN", i);
    }
    const base = this.#battlePosition();
    const me = this.#me();
    this.#noteDeadAttacker();
    let bestIdx = -1, bestScore = evaluate(base), bestAtk = 0;
    for (let index = 0; index < ev.attackable.length; index++) {
      const a = ev.attackable[index]!;
      if (this.#deadAttackers.has(a.sequence)) continue;
      const atk = me?.mzone[a.sequence]?.attack ?? this.#stat(a.code).atk;
      // The target comes in a follow-up prompt: score this attacker by its BEST target.
      const targets: (EvalMon | null)[] = (a.directAttackable || base.oppMon.length === 0) ? [null] : base.oppMon;
      let bodyBest = -Infinity;
      for (const t of targets) bodyBest = Math.max(bodyBest, this.#attackScore(base, atk, t));
      if (bodyBest > bestScore) { bestScore = bodyBest; bestIdx = index; bestAtk = atk; }
    }
    if (bestIdx >= 0) { this.#declaredAttacker = ev.attackable[bestIdx]!; this.#attackSeen = false; this.#pendingAttacker = bestAtk; return respBattle("SELECT_BATTLE", bestIdx); }
    if (ev.canMain2) return respBattle("TO_M2");
    return respBattle("TO_EP");
  }

  /** Back at the battle command with the last declared attack never declared by the engine: that monster is out. */
  #noteDeadAttacker(): void {
    if (this.#declaredAttacker && !this.#attackSeen) this.#deadAttackers.add(this.#declaredAttacker.sequence);
    this.#attackSeen = true;
  }

  // ---- chains / responses -----------------------------------------------------------------------------------------
  #battleYesNo(description: string): Json {
    if (description !== "30" && description !== "31") {
      // A card's own question (its string: code << 20 | n), an upkeep cost say: its rule answers, else no.
      const code = Math.floor(Number(description) / 0x100000);
      const rule = code > 0 ? this.#ruleFor(code) : undefined;
      return respYesNo(!!rule?.yesNo?.(this.#ctx()));
    }
    const card = this.#declaredAttacker;
    const live = card ? this.#snap(card) : null;
    if (!live || isFaceDown(live.position) || !(live.position & POS.ATTACK)) return respYesNo(false);
    const atk = live.attack ?? this.#stat(live.code).atk;
    const base = this.#battlePosition();
    const targets: (EvalMon | null)[] = description === "31" || base.oppMon.length === 0 ? [null] : base.oppMon;
    const yes = targets.some((target) => this.#attackScore(base, atk, target) > evaluate(base));
    if (yes) this.#pendingAttacker = atk;
    return respYesNo(yes);
  }

  #chain(ev: P<"selectChain">): Json {
    if (ev.chains.length === 0) return respChain(null);
    if (ev.forced) return respChain(0);
    // Set traps / quick effects on the OPPONENT's turn (removal and negation timing), one answer per chain (a second
    // trap on the same attack is a card wasted). On our own turn only a negation of the opponent's link: no
    // optional self-chains that would interrupt our own plays.
    if (this.#chainedThisWindow.size > 0) return respChain(null);
    const ctx = this.#ctx();
    const own = this.#turnPlayer === this.seat;
    if (own && !ctx.oppChained) return respChain(null);
    for (let i = 0; i < ev.chains.length; i++) {
      const c = ev.chains[i]!;
      const key = `${c.code}:${c.description}`;
      if (this.#chainedThisWindow.has(key)) continue;
      if (own && !this.#cards.brain.get(c.code)?.has("negate")) continue;
      const rule = this.#ruleFor(c.code);
      if (rule?.chainReact && !rule.chainReact(ctx)) continue;
      this.#chainedThisWindow.add(key);
      this.#activated(c.code);
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
    // An equip that buffs goes on our own strongest monster (the engine offers both fields; a steal or a weakening
    // equip keeps the opponent's).
    const hint = this.#hint;
    this.#hint = 0;
    if (hint === H_EQUIP && ev.min <= 1 && !this.#cards.brain.get(this.#lastActivated)?.any(TAGS_NO_BOOST)) {
      let best = -1, bestAtk = -1;
      ev.cards.forEach((c, i) => {
        if (c.controller !== this.seat || (c.location & LOCATION.MZONE) === 0 || isFaceDown(c.position ?? 0)) return;
        const atk = this.#liveAtk(c) ?? 0;
        if (atk > bestAtk) { bestAtk = atk; best = i; }
      });
      if (best >= 0) return respCards([best]);
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
    // Feed a stolen monster first (it goes back otherwise), then the weakest, enough to satisfy the minimum.
    const stolen = (c: CardRef): boolean => { const b = this.#snap(c); return !!b && b.owner !== undefined && b.owner !== b.controller && this.#lentTurn === this.#turn; };
    const ranked = ev.cards
      .map((c, index) => ({ index, atk: stolen(c) ? -1 : this.#liveAtk(c) ?? this.#stat(c.code).atk, param: c.releaseParam }))
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
      // An unknown set monster is the same ~1500 DEF wall the base position holds (so the kill is found in it).
      const known = !faceDown || !!code;
      const exact: EvalMon = {
        atk: known ? s?.attack ?? st.atk : 0, def: known ? s?.defense ?? st.def : 1500, faceDown,
        attackPos: (pos & POS.ATTACK) !== 0 && !faceDown,
        known,
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
    // Our own hand / deck / Extra Deck: the card for what it is (their position reads face-down: all were 1500, so
    // a discard or a search took the first one listed).
    if (c.controller === this.seat && c.code && (c.location & (LOCATION.HAND | LOCATION.DECK | LOCATION.EXTRA)) !== 0) return this.#worth(c.code);
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

  /** A card of ours off the field, for a discard (the lowest goes) or a search (the highest comes): a monster by its
   *  ATK, less when it needs tributes; a spell or trap above a plain body, more with a rule that plays it first. */
  #worth(code: number): number {
    if (this.#ruleFor(code)?.keepInHand) return 9000;
    const k = this.#cards.brain.get(code);
    if (!k) return this.#stat(code).atk || 1000;
    if (k.type & TYPE_MONSTER) {
      const t = k.is_extra ? 0 : k.tributes();
      return this.#stat(code).atk * (t === 0 ? 1 : t === 1 ? 0.7 : 0.45);
    }
    return 1300 + (this.#ruleFor(code)?.idlePriority ?? 0) * 4;
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
    // In attack only when it holds there: nothing bigger across, and not a wall by nature.
    const up = this.#allIn || (atk >= oppMax && !(def > atk && atk < 1500));
    const order = up
      ? [POS.FACEUP_ATTACK, POS.FACEUP_DEFENSE, POS.FACEDOWN_DEFENSE, POS.FACEDOWN_ATTACK]
      : [POS.FACEUP_DEFENSE, POS.FACEDOWN_DEFENSE, POS.FACEUP_ATTACK, POS.FACEDOWN_ATTACK];
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
  // Reborn can revive from EITHER graveyard: control is not removal intent in this prompt.
  if (cards.every((c) => (c.location & LOCATION.GRAVE) !== 0)) {
    return all.sort((a, b) => cards[b]!.value - cards[a]!.value).slice(0, n);
  }
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
