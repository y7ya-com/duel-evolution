// Card rules: per-card timing overrides the heuristic player consults before its generic fallback (a default
// executor plus per-card / per-NPC rules). Instead of firing the first available spell or trap, the player asks "does
// this card's rule say to play it NOW?" and holds it otherwise. No rule for a card = the generic behaviour, so a rule
// only ever makes the player smarter, never illegal.
//
// Three layers, per card name:
//   - the named rules: data, not code (rules.json, written in ruleExpr.ts's format, with the live overlay an admin
//     pushes on top: ruleSet.ts). The staples every NPC uses (no Heavy Storm into its own backrow, no Mirror Force on
//     a weak poke...), and per-NPC game plans (by npc_profiles.json id) that override staples by card name.
//   - tagRule(card): for a card with no named rule, a generic rule from its type and text tags (brain_cards.json:
//     draw, search, nuke, destroy...), so the cards of this game's 2008 decks get sensible timing too. A set card
//     with no rule at all is HELD until an attack is declared or the opponent's End Phase (it used to fire in the
//     first window, the opponent's Draw Phase, often onto the NPC's own cards).
//   - a named rule's fields win over the tag rule's (heuristicBot.ts #ruleFor).
//
import { TYPE_CONTINUOUS, TYPE_COUNTER, TYPE_EQUIP, TYPE_MONSTER, TYPE_QUICKPLAY, TYPE_SPELL, TYPE_TRAP, tagMask, type Card } from "../brain/cards.ts";
import { HELPERS } from "./ruleExpr.ts";
import type { RuleCtxExt } from "./ruleCtxExt.ts";

// Rules read a RuleCtx (the board the player already computes) and cover the decision points where blind play hurts
// most: activating a card in the main phase (idleActivate / idlePriority), a battle-phase effect (battleActivate),
// springing a set card on the opponent's turn (chainReact) and summon ranking (summonScore). Names are cards.cdb's
// English names, lowercase.

export interface RuleMon { atk: number; def: number; faceDown: boolean; attackPos: boolean;
  /** Its Level (0 unknown), a Fusion Monster, a pending opponent chain link targets it, and (an opponent's monster)
   *  removing it alone makes my attacks this turn lethal. */
  level?: number; fusion?: boolean; chainHit?: boolean; blocksLethal?: boolean }


/** A candidate card in a pick (CardRule.pick): where it is, whose it is, what it is, and its name (lowercase). */
export interface RuleCard extends RuleMon {
  mine: boolean; onField: boolean; inHand: boolean; inGrave: boolean; inDeck: boolean; inExtra: boolean; banished: boolean;
  isMonster: boolean; isSpell: boolean; isTrap: boolean; name: string;
  /** Another copy of it is in my hand already. */
  copyInHand: boolean;
  /** A monster of mine that can still attack this turn. */
  canAttack: boolean;
  /** A card of the same name is already on my field or in my hand (another one than this). */
  alreadyHave: boolean;
  /** A copy of it is face-up on my field. */
  copyOnField: boolean;
  /** Its worth as the NPC's own picks price it (the discard / search order). */
  worth: number;
}

/** My cards by zone, as lowercase names (the named-card operators: inMyHand, inMyDeck, onMyField, inMyGrave). */
export interface RuleZones { hand: string[]; deck: string[]; field: string[]; grave: string[]; fieldSpells: string[] }

export interface RuleCtx {
  myLp: number;
  oppLp: number;
  myMon: RuleMon[];
  oppMon: RuleMon[];
  /** Highest ATK among face-up attack-position monsters. */
  myMaxAtk: number;
  oppMaxAtk: number;
  /** Occupied spell/trap zones. */
  myBackrow: number;
  oppBackrow: number;
  /** Highest monster ATK sitting in each graveyard (revival-target gauge). */
  myGraveMaxAtk: number;
  oppGraveMaxAtk: number;
  /** Cards in the opponent's hand. */
  oppHand: number;
  /** cards.cdb names (lowercase) of my face-up monsters. */
  myNames: string[];
  /** Cards in my hand, and how many of them are monsters that need a tribute. */
  myHand: number;
  myHandTributes: number;
  /** My monsters removed from play. */
  myRemoved: number;
  /** It is my turn. */
  myTurn: boolean;
  /** The opponent's End Phase (the last window before my turn). */
  oppEndPhase: boolean;
  /** An attack on me this Battle Phase: the attacker's ATK (0 = none declared), and whether it takes my last LP. */
  attackAtk: number;
  attackLethal: boolean;
  /** That attack is on one of my Defense Position monsters (no LP of mine at stake). */
  attackOnDefense: boolean;
  /** The chain's last link is the opponent's (something to negate or answer). */
  oppChained: boolean;
  /** More board facts (EXT_NUM / EXT_BOOL). */
  ext?: RuleCtxExt;
  /** My cards by zone (deck: the NPC's deck list less every copy seen elsewhere). */
  zones?: RuleZones;
}

export interface CardRule {
  /** Main phase: should the player activate this card NOW (vs hold it)? */
  idleActivate?: (ctx: RuleCtx) => boolean;
  /** Positive = a setup/tactical play made before committing the normal summon; higher goes first
   *  (draw/search > removal > development). */
  idlePriority?: number;
  /** Battle-phase-only effect worth using before choosing an attacker. */
  battleActivate?: (ctx: RuleCtx) => boolean;
  /** Opponent's turn / response window: spring this set card NOW? */
  chainReact?: (ctx: RuleCtx) => boolean;
  /** Summon ranking: a bonus added to the card's ATK when picking what to summon (positive = prefer it now). */
  summonScore?: (ctx: RuleCtx) => number;
  /** The card's own yes/no prompt (an upkeep cost, an optional payment): pay / accept? No rule = no. */
  yesNo?: (ctx: RuleCtx) => boolean;
  /** Its own Special Summon from the hand, when the engine offers it: do it? No rule = yes. With an idlePriority > 0
   *  it is made before the search weighs the turn (Lava Golem under the NPC's own lock). */
  specialSummon?: (ctx: RuleCtx) => boolean;
  /** This monster of mine stays out of my attacks (its survival is the plan: Des Wombat under Dark Snake Syndrome). */
  noAttack?: (ctx: RuleCtx) => boolean;
  /** Never Normal Summon or Set it (an Exodia piece: it wins from the hand). */
  keepInHand?: boolean;
  /** Set, and about to be destroyed by the opponent's chain: use it now? No rule = yes (it is lost otherwise). */
  doomed?: (ctx: RuleCtx) => boolean;
  /** Its own option prompt: the option's index. No rule = the first. */
  option?: (ctx: RuleCtx) => number;
  /** Among several cards that could answer the same chain window: higher goes first (default: a negation of the
   *  opponent's link 50, else 0). */
  chainPriority?: number;
  /** Its card picks (a target, a cost, a search, a revival, a discard): each offered card's score (higher first);
   *  cards under `min` are not taken unless the prompt needs them. No rule = the generic pick (chooseTargets). */
  pick?: { score: (ctx: RuleCtx, card: RuleCard) => number; min?: number };
  /** Its chainReact is asked on my own turn too (its trigger window, a battle trick for my own attack, an answer to an
   *  opponent's link that is not a negation). Without it only negations answer on my turn. */
  ownTurn?: boolean;
  /** Its own number to declare (a cost to pay, say): the index among the values offered. No rule = the first. */
  number?: (ctx: RuleCtx, values: number[]) => number;
}

const hasMon = (m: RuleMon[]): boolean => m.length > 0;
const { realThreat, worthwhileWipe, worthwhileStorm, lastWindow, outgunned } = HELPERS;
/** An attack worth a trap: a real attacker, or any attack that ends the duel. */
const attacked = (c: RuleCtx, atk = 1500): boolean => c.attackAtk >= atk || c.attackLethal;
const never = (): boolean => false;

// ── generic rules from the card's type and text tags (cards with no named rule) ─────
const M_SEARCHER = tagMask("search", "draw");
const M_REMOVES_MON = tagMask("destroy_monster", "control", "bounce", "weaken");
const M_ATTACK_ANSWER = tagMask("destroy_monster", "nuke_opp", "negate", "burn", "control", "bounce", "stall", "heal");
/** A generic rule from a card's type and text tags, or undefined (the plain heuristic: a monster's effect, a
 *  continuous / field / normal spell with nothing harmful known about it). */
export function tagRule(c: Card | undefined): CardRule | undefined {
  if (!c) return undefined;
  if (c.type & TYPE_MONSTER) {
    // Searchers / drawers on summon: lead with them before a plain beater.
    return c.has("on_summon") && c.any(M_SEARCHER) ? { summonScore: () => 600 } : undefined;
  }
  if (c.type & TYPE_SPELL) {
    // Set quick-plays answer like traps; in the main phase a battle trick (no tag, a boost, a weaken) is held.
    const quick = (c.type & TYPE_QUICKPLAY) !== 0;
    const chainReact = quick ? trapReact(c) : undefined;
    // a continuous spell tagged draw draws on a condition (Spiral Spear Strike, Card Trader): not a draw spell to lead with
    if (c.has("draw") && !(c.type & TYPE_CONTINUOUS)) return { idleActivate: () => true, idlePriority: 130, chainReact };
    if (c.has("search") && !c.has("ritual")) return { idleActivate: () => true, idlePriority: 120, chainReact };
    if (c.has("nuke_all")) return { idleActivate: worthwhileWipe, idlePriority: 115, chainReact };
    if (c.has("nuke_opp")) return { idleActivate: (x) => hasMon(x.oppMon), idlePriority: 115, chainReact };
    if (c.has("storm_all")) return { idleActivate: worthwhileStorm, idlePriority: 105, chainReact };
    if (c.has("storm_opp")) return { idleActivate: (x) => x.oppBackrow >= 1, idlePriority: 105, chainReact };
    if (c.has("control")) return { idleActivate: (x) => x.oppMaxAtk >= 1500 || (hasMon(x.oppMon) && x.myHandTributes > 0), idlePriority: 108, chainReact };
    if (c.has("destroy_monster") && !(c.type & TYPE_EQUIP)) return { idleActivate: (x) => hasMon(x.oppMon), idlePriority: 108, chainReact };
    if (c.has("destroy_st")) return { idleActivate: (x) => x.oppBackrow >= 1, idlePriority: 100, chainReact };
    if (c.has("destroy_any")) return { idleActivate: (x) => hasMon(x.oppMon) || x.oppBackrow >= 1, idlePriority: 100, chainReact };
    if (c.has("bounce")) return { idleActivate: (x) => hasMon(x.oppMon) || x.oppBackrow > x.myBackrow, idlePriority: 95, chainReact };
    if (c.has("revive")) return { idleActivate: (x) => Math.max(x.myGraveMaxAtk, x.oppGraveMaxAtk) >= 1500, idlePriority: 95, chainReact };
    if (c.has("stall")) return { idleActivate: outgunned, chainReact };
    // An equip needs a monster of mine worth it (the engine also offers the opponent's).
    if (c.type & TYPE_EQUIP) return { idleActivate: (x) => (c.any(M_REMOVES_MON) ? x.oppMaxAtk >= 1500 : x.myMon.some((m) => !m.faceDown)) };
    if (quick) return { idleActivate: never, chainReact };
    return undefined;
  }
  if (c.type & TYPE_TRAP) return { chainReact: trapReact(c), idleActivate: trapIdle(c) };
  return undefined;
}

/** When to spring a set trap (or quick-play) on the opponent's turn, from its tags. */
function trapReact(c: Card): (x: RuleCtx) => boolean {
  // A counter trap is only offered against something: answer the opponent's, never the NPC's own link.
  if ((c.type & TYPE_COUNTER) || (c.has("negate") && !c.has("on_attack"))) return (x) => x.oppChained;
  if (c.has("on_attack")) return c.any(M_ATTACK_ANSWER) ? (x) => attacked(x) || realThreat(x) && x.attackAtk > 0 : (x) => x.attackAtk > 0;
  if (c.has("on_summon")) return c.has("nuke_all") ? worthwhileWipe : () => true;
  if (c.has("nuke_all")) return worthwhileWipe;
  if (c.has("storm_all")) return (x) => worthwhileStorm(x) && lastWindow(x);
  if (c.has("destroy_st") || c.has("storm_opp")) return (x) => x.oppBackrow >= 1 && (x.oppChained || lastWindow(x));
  if (c.any(M_REMOVES_MON) || c.has("nuke_opp")) return (x) => hasMon(x.oppMon) && (attacked(x) || (x.oppEndPhase && x.oppMaxAtk >= 1700));
  if (c.has("destroy_any")) return (x) => (hasMon(x.oppMon) || x.oppBackrow >= 1) && (attacked(x) || x.oppEndPhase);
  if (c.has("revive")) return (x) => x.myGraveMaxAtk >= 1500 && ((x.attackAtk > 0 && x.myGraveMaxAtk >= x.attackAtk) || (x.oppEndPhase && x.myGraveMaxAtk >= x.oppMaxAtk));
  if (c.has("stall")) return (x) => attacked(x, 1400) || (x.oppEndPhase && outgunned(x));
  if (c.has("pay_half")) return never;
  if (c.has("boost") || c.has("weaken")) return (x) => attacked(x, 1700);
  if (c.has("draw") || c.has("search") || c.has("heal") || c.has("burn")) return (x) => x.oppEndPhase || x.attackLethal;
  return lastWindow;
}

/** A set trap in the NPC's own main phase: only what improves its turn. */
function trapIdle(c: Card): (x: RuleCtx) => boolean {
  if (c.has("destroy_st") || c.has("storm_opp")) return (x) => x.oppBackrow >= 1;
  if (c.any(M_REMOVES_MON) || c.has("nuke_opp")) return (x) => x.oppMaxAtk >= 1700 && x.oppMaxAtk > x.myMaxAtk;
  if (c.has("destroy_any")) return (x) => x.oppMaxAtk >= 1700 || x.oppBackrow >= 2;
  if (c.has("revive")) return (x) => x.myGraveMaxAtk >= 1500 && x.myGraveMaxAtk >= x.oppMaxAtk;
  if (c.has("draw") || c.has("search")) return () => true;
  return never;
}
