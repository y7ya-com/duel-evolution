// Card rules: per-card timing overrides the heuristic player consults before its generic fallback (a default
// executor plus per-card / per-NPC rules). Instead of firing the first available spell or trap, the player asks "does
// this card's rule say to play it NOW?" and holds it otherwise. No rule for a card = the generic behaviour, so a rule
// only ever makes the player smarter, never illegal.
//
// Two layers, merged per duel by rulesFor(npcId):
//   - STAPLE_RULES: shared timing for cards that appear across many decks (no Heavy Storm into your own backrow, no
//     Mirror Force on a weak poke, no Dark Hole on your own better board...).
//   - tagRule(card): for a card with no named rule, a generic rule from its type and text tags (brain_cards.json:
//     draw, search, nuke, destroy...), so the cards of this game's 2008 decks get sensible timing too. A set card
//     with no rule at all is HELD until an attack is declared or the opponent's End Phase (it used to fire in the
//     first window, the opponent's Draw Phase, often onto the NPC's own cards).
//   - NPC_RULES[npcId]: one NPC's game plan, keyed by this game's NPC ids (npc_profiles.json).
//     NPC rules override staples by card name.
//
import { TYPE_CONTINUOUS, TYPE_COUNTER, TYPE_EQUIP, TYPE_MONSTER, TYPE_QUICKPLAY, TYPE_SPELL, TYPE_TRAP, tagMask, type Card } from "../brain/cards.ts";

// Rules read a RuleCtx (the board the player already computes) and cover the decision points where blind play hurts
// most: activating a card in the main phase (idleActivate / idlePriority), a battle-phase effect (battleActivate),
// springing a set card on the opponent's turn (chainReact) and summon ranking (summonScore). Names are cards.cdb's
// English names, lowercase.

export interface RuleMon { atk: number; def: number; faceDown: boolean; attackPos: boolean }

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
  /** The chain's last link is the opponent's (something to negate or answer). */
  oppChained: boolean;
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
  /** Its own Special Summon from the hand, when the engine offers it: do it? No rule = yes. */
  specialSummon?: (ctx: RuleCtx) => boolean;
  /** Never Normal Summon or Set it (an Exodia piece: it wins from the hand). */
  keepInHand?: boolean;
}

const hasMon = (m: RuleMon[]): boolean => m.length > 0;
const attackers = (m: RuleMon[]): number => m.filter((x) => x.attackPos).length;
/** A threat worth answering — a real attacker, or several of them. */
const realThreat = (c: RuleCtx): boolean => c.oppMaxAtk >= 1700 || attackers(c.oppMon) >= 2;
/** Count resources and their current power, including defense walls, before trading a whole board. */
const boardValue = (mon: RuleMon[]): number => mon.reduce((sum, m) => sum + 1000 + Math.max(m.atk, m.def) * 0.4, 0);
const worthwhileWipe = (c: RuleCtx): boolean => hasMon(c.oppMon) && boardValue(c.oppMon) > boardValue(c.myMon);
const worthwhileStorm = (c: RuleCtx): boolean => c.oppBackrow > c.myBackrow;
/** An attack worth a trap: a real attacker, or any attack that ends the duel. */
const attacked = (c: RuleCtx, atk = 1500): boolean => c.attackAtk >= atk || c.attackLethal;
/** A set card with no better moment: an attack on me, or the opponent's End Phase. */
const lastWindow = (c: RuleCtx): boolean => c.attackAtk > 0 || c.oppEndPhase;
/** I am losing the board: their best attacker beats mine. */
const outgunned = (c: RuleCtx): boolean => c.oppMaxAtk > 0 && c.oppMaxAtk >= c.myMaxAtk;
/** LP left to pay a cost with. */
const canPay = (c: RuleCtx, cost: number): boolean => c.myLp > cost + 1000;
const never = (): boolean => false;

// ── shared staples (every NPC, unless its own rules override) ──────────────────────
export const STAPLE_RULES: Record<string, CardRule> = {
  // Draw/search first: widening the hand before choosing a summon prevents avoidable weak openings.
  "pot of greed": { idleActivate: () => true, idlePriority: 140 },
  "graceful charity": { idleActivate: () => true, idlePriority: 135 },
  "allure of darkness": { idleActivate: () => true, idlePriority: 130 },
  "reinforcement of the army": { idleActivate: () => true, idlePriority: 125 },
  "e - emergency call": { idleActivate: () => true, idlePriority: 125 },

  // Mass / targeted removal — only when there's actually something to remove, and don't self-destruct.
  "dark hole": { idleActivate: worthwhileWipe, idlePriority: 120 },
  "raigeki": { idleActivate: (c) => hasMon(c.oppMon), idlePriority: 120 },
  "lightning vortex": { idleActivate: (c) => hasMon(c.oppMon), idlePriority: 115 },
  "smashing ground": { idleActivate: (c) => hasMon(c.oppMon), idlePriority: 110 },
  "fissure": { idleActivate: (c) => hasMon(c.oppMon), idlePriority: 110 },
  "tribute to the doomed": { idleActivate: (c) => hasMon(c.oppMon), idlePriority: 105 },
  "nobleman of crossout": { idleActivate: (c) => c.oppMon.some((m) => m.faceDown), idlePriority: 110 },

  // Backrow removal — only with a target, and Heavy Storm only when it nets us cards (don't nuke our own set).
  // Set, they wait for a target too: with none the engine offers the NPC's own cards.
  "heavy storm": { idleActivate: worthwhileStorm, idlePriority: 105 },
  "giant trunade": { idleActivate: (c) => c.oppBackrow >= 2 && c.oppBackrow > c.myBackrow && c.myMaxAtk > 0, idlePriority: 104 },
  "harpie's feather duster": { idleActivate: (c) => c.oppBackrow >= 1, idlePriority: 110 },
  "mystical space typhoon": { idleActivate: (c) => c.oppBackrow >= 1, idlePriority: 100, chainReact: (c) => c.oppBackrow >= 1 && (c.oppChained || lastWindow(c)) },
  "dust tornado": { idleActivate: (c) => c.oppBackrow >= 1, idlePriority: 100, chainReact: (c) => c.oppBackrow >= 1 && (c.oppChained || lastWindow(c)) },
  "raigeki break": { idleActivate: (c) => c.myHand >= 1 && c.oppMaxAtk >= 1700, chainReact: (c) => c.myHand >= 1 && (attacked(c, 1700) || (c.oppEndPhase && c.oppMaxAtk >= 1900)) },
  "compulsory evacuation device": { idleActivate: (c) => c.oppMaxAtk >= 1900 && c.oppMaxAtk > c.myMaxAtk, chainReact: (c) => attacked(c, 1700) },

  // Steal / revive — only when there's something worth it.
  // A stolen monster is also a free tribute: with a big monster in hand any target is worth it.
  "snatch steal": { idleActivate: (c) => c.oppMaxAtk >= 1500 || (hasMon(c.oppMon) && (c.myHandTributes > 0 || !hasMon(c.myMon))), idlePriority: 108 },
  "brain control": { idleActivate: (c) => canPay(c, 800) && (c.oppMaxAtk >= 1500 || (c.oppMon.some((m) => !m.faceDown) && c.myHandTributes > 0)), idlePriority: 108 },
  "creature swap": { idleActivate: (c) => hasMon(c.myMon) && c.oppMaxAtk >= 1500 && c.myMon.some((m) => Math.max(m.atk, m.def) <= 1000), idlePriority: 100 },
  "soul exchange": { idleActivate: (c) => c.myHandTributes > 0 && hasMon(c.oppMon), idlePriority: 112 },
  // A revived monster has to hold the field: not into a bigger attacker (production 2026-11-11: Summoned Skull revived
  // for 800 LP at 2500 into a 2800 Despair, then stolen with Brain Control and turned on the NPC).
  "premature burial": { idleActivate: (c) => c.myGraveMaxAtk >= 1700 && c.myGraveMaxAtk >= c.oppMaxAtk && canPay(c, 800), idlePriority: 90 },
  "monster reborn": { idleActivate: (c) => { const best = Math.max(c.myGraveMaxAtk, c.oppGraveMaxAtk); return best >= 1700 && best >= c.oppMaxAtk; }, idlePriority: 95 },
  // Pierces and draws only while Gaia The Fierce Knight attacks: nothing without him on the field.
  "spiral spear strike": { idleActivate: (c) => c.myNames.some((n) => n.startsWith("gaia the fierce knight") || n.startsWith("gaia the dragon champion")) },
  // Revived in Attack Position: not into a bigger attacker, and on the opponent's turn only as a blocker that holds.
  "call of the haunted": {
    idleActivate: (c) => c.myGraveMaxAtk >= 1500 && c.myGraveMaxAtk >= c.oppMaxAtk,
    chainReact: (c) => c.myGraveMaxAtk >= 1500 && ((c.attackAtk > 0 && c.myGraveMaxAtk >= c.attackAtk) || (c.oppEndPhase && c.myGraveMaxAtk >= c.oppMaxAtk)),
  },
  "birthright": {
    idleActivate: (c) => c.myGraveMaxAtk >= 1500 && c.myGraveMaxAtk >= c.oppMaxAtk,
    chainReact: (c) => c.myGraveMaxAtk >= 1500 && ((c.attackAtk > 0 && c.myGraveMaxAtk >= c.attackAtk) || (c.oppEndPhase && c.myGraveMaxAtk >= c.oppMaxAtk)),
  },
  // These spend real cards for marginal healing/self-mill. None of the official decks here has a payoff for
  // blindly milling three cards and burning its own LP on every available response window.
  "destruction of destiny": { idleActivate: () => false, chainReact: () => false },
  "elemental recharge": { idleActivate: (c) => c.myLp <= 1500, chainReact: (c) => c.myLp <= 1500 },

  // Fusion spells are only offered by the core when a legal payoff exists. Give them development
  // priority, below draw/removal so those cards can improve the material pool first.
  "polymerization": { idleActivate: () => true, idlePriority: 55 },
  "miracle fusion": { idleActivate: () => true, idlePriority: 60 },
  "fusion destiny": { idleActivate: () => true, idlePriority: 65 },
  "red-eyes fusion": { idleActivate: () => true, idlePriority: 65 },
  "cyberload fusion": { idleActivate: () => true, idlePriority: 60 },

  // Doubles every Machine and destroys them at the End Phase: for the last push only, never in the main phase.
  "limiter removal": {
    idleActivate: never, chainReact: never,
    battleActivate: (c) => c.myMaxAtk > 0 && c.myMon.reduce((n, m) => n + (m.attackPos ? m.atk : 0), 0) * 2 >= c.oppLp + c.oppMon.reduce((n, m) => n + (m.attackPos ? m.atk : m.def), 0),
  },

  // Stall: when the board is being lost, not onto an empty field.
  "swords of revealing light": { idleActivate: (c) => outgunned(c) || (attackers(c.oppMon) >= 2 && c.myMon.length < 2) },
  "nightmare's steelcage": { idleActivate: (c) => outgunned(c) && c.myMaxAtk === 0 },
  "gravity bind": { chainReact: (c) => attacked(c, 1400) || (c.oppEndPhase && outgunned(c)), idleActivate: outgunned },
  "level limit - area b": { idleActivate: (c) => outgunned(c) || c.myMaxAtk === 0 },
  "messenger of peace": { idleActivate: (c) => outgunned(c) || c.myMaxAtk < 1500, yesNo: (c) => c.myLp > 600 },
  "wall of revealing light": { chainReact: (c) => attacked(c, 1500), idleActivate: never },
  "scapegoat": { idleActivate: never, chainReact: (c) => (c.attackAtk > 0 && c.myMon.length === 0) || (c.oppEndPhase && c.myMon.length === 0 && c.myHandTributes > 0) },
  "book of moon": { idleActivate: never, chainReact: (c) => attacked(c, 1800) },
  "shrink": { idleActivate: never, chainReact: (c) => attacked(c, 1800) },
  "rush recklessly": { idleActivate: never, chainReact: never },
  "enemy controller": { idleActivate: never, chainReact: (c) => attacked(c, 1700) },

  // Costs a card, a monster or LP for something the deck rarely has the follow-up for: hold unless it pays.
  "reload": { idleActivate: (c) => c.myHand >= 4 && c.myHandTributes >= 2 && !hasMon(c.myMon), chainReact: never },
  "card destruction": { idleActivate: (c) => c.myHand >= 3 && c.myHandTributes * 2 >= c.myHand - 1 },
  "magical stone excavation": { idleActivate: (c) => c.myHand >= 5 },
  "monster gate": { idleActivate: (c) => c.myMon.length >= 1 && c.myMon.every((m) => Math.max(m.atk, m.def) <= 1500) && c.myMaxAtk < c.oppMaxAtk },
  "reasoning": { idleActivate: (c) => c.myMon.length < 3, idlePriority: 60 },
  "dimension fusion": { idleActivate: (c) => c.myRemoved >= 2 && c.myLp > 4000 },
  "return from the different dimension": {
    idleActivate: (c) => c.myRemoved >= 2 && c.myLp > 2000 && !c.oppMon.some((m) => m.attackPos && m.atk >= 2000),
    chainReact: never,
  },
  "reckless greed": { chainReact: (c) => c.oppEndPhase && c.myHand <= 2, idleActivate: (c) => c.myHand <= 1 },
  "ceasefire": { chainReact: (c) => c.oppEndPhase || c.attackLethal, idleActivate: never },
  "crush card virus": { chainReact: (c) => c.myMon.length >= 2 && (c.oppMaxAtk >= 1500 || c.oppHand >= 3), idleActivate: never },
  "deck devastation virus": { chainReact: (c) => c.myMon.length >= 2, idleActivate: never },
  "eradicator epidemic virus": { chainReact: (c) => c.myMon.length >= 2 && c.oppBackrow >= 2, idleActivate: never },
  "the transmigration prophecy": { chainReact: (c) => c.oppEndPhase && c.myTurn, idleActivate: never },
  "a feather of the phoenix": { idleActivate: never },
  // 1000 to them, 500 to us: not the shot that takes our own last LP (a draw at best).
  "tremendous fire": { idleActivate: (c) => c.myLp > 500, idlePriority: 80 },
  "guard penalty": { idleActivate: never, chainReact: never },
  // The Alien deck (NPC 35). Alien Skull's Special Summon goes to the OPPONENT's field (their weak monster for a
  // 1600/1800 of theirs) and spends the Normal Summon; Scatter Burst destroys an Alien of ours for its counters and
  // Crop Circles sends ours away for one from the Deck: none of them pays without the deck's counter engine running.
  "alien skull": { specialSummon: never },
  "\"a\" cell scatter burst": { idleActivate: never, chainReact: never, battleActivate: never },
  "crop circles": { idleActivate: never, chainReact: never },
  // "You cannot Normal Summon or Set": the deck it is in summons its monsters that way.
  "boss rush": { idleActivate: never },
  // Exodia wins from the hand: its pieces are never summoned, set, tributed or discarded.
  "exodia the forbidden one": { keepInHand: true },
  "left arm of the forbidden one": { keepInHand: true },
  "right arm of the forbidden one": { keepInHand: true },
  "left leg of the forbidden one": { keepInHand: true },
  "right leg of the forbidden one": { keepInHand: true },
  // Tribute-for-burn: only the shot that ends the duel (it empties the NPC's own field).
  "cannon soldier": { idleActivate: (c) => c.oppLp <= 500 * c.myMon.length },
  "toon cannon soldier": { idleActivate: (c) => c.oppLp <= 500 * c.myMon.length },
  "mass driver": { idleActivate: (c) => c.oppLp <= 400 * c.myMon.length },
  "catapult turtle": { idleActivate: (c) => c.oppLp <= c.myMon.reduce((n, m) => n + Math.floor(m.atk / 2), 0) },
  "exiled force": { idleActivate: (c) => c.oppMaxAtk >= 1500 || c.oppMon.some((m) => m.faceDown) },
  // Without tribute it is 1400/1000 on the field, not its printed 2800.
  "fusilier dragon, the dual-mode beast": { summonScore: () => -1400 },
  // Power Bond / Megamorph double a monster and bill for it later: only onto a real attacker.
  "megamorph": { idleActivate: (c) => c.myMaxAtk >= 1500 && c.myLp < c.oppLp },

  // Reactive traps — spring only on a real threat (not a 1000-ATK poke) or to survive, and never suicide.
  "mirror force": { chainReact: (c) => realThreat(c) || c.attackLethal },
  "sakuretsu armor": { chainReact: (c) => attacked(c, 1600) },
  "magic cylinder": { chainReact: (c) => attacked(c, 1600) },
  "dimensional prison": { chainReact: (c) => attacked(c, 1600) },
  "ring of destruction": {
    idleActivate: (c) => c.oppMaxAtk >= 2000 && c.oppMaxAtk < c.myLp && (c.oppMaxAtk >= c.oppLp || c.oppMaxAtk > c.myMaxAtk),
    chainReact: (c) => c.oppMaxAtk < c.myLp && (c.oppMaxAtk >= c.oppLp || attacked(c, 1700)),
  },
  "torrential tribute": { chainReact: (c) => worthwhileWipe(c) && (c.oppMon.length >= 2 || c.oppMaxAtk >= 1800 || !hasMon(c.myMon) && c.oppMaxAtk >= 1600) },
  "bottomless trap hole": { chainReact: () => true },
  "solemn judgment": { chainReact: (c) => c.myLp > 4000 && c.oppChained },
  "negate attack": { chainReact: (c) => c.attackLethal || (c.attackAtk > 0 && c.attackAtk >= c.myMaxAtk && c.attackAtk >= 1500) },
  "draining shield": { chainReact: (c) => attacked(c, 1600) },
  "waboku": { chainReact: (c) => attacked(c, 1500) },
  "mirror wall": { chainReact: (c) => attacked(c, 1500) && c.attackAtk >= c.myMaxAtk },
  "spellbinding circle": { chainReact: (c) => c.oppMaxAtk >= 1900 },
};

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

// ── per-NPC game plans (by NPC id) ──────────────────────────────────────────────────
export const NPC_RULES: Record<number, Record<string, CardRule>> = {
  // Hell Kaiser's only fusion is Chimeratech Overdragon, which sends the rest of his field to the Graveyard, Future
  // Fusion with it (and then Overdragon goes too).
  80: { "future fusion": { idleActivate: never } },
  84: {
    "elemental hero stratos": { summonScore: () => 1000 },
    "reinforcement of the army": { idleActivate: () => true, idlePriority: 145 },
  },
  85: {
    "destiny hero - diamond dude": { summonScore: () => 600 },
    "clock tower prison": { idleActivate: () => true, idlePriority: 100 },
    "destiny draw": { idleActivate: () => true, idlePriority: 140 },
  },
  86: {
    "destiny hero - diamond dude": { summonScore: () => 600 },
    "destiny draw": { idleActivate: () => true, idlePriority: 140 },
  },
};

/** The shared staples merged with an NPC's own plan (NPC rules win on name collisions). */
export function rulesFor(npcId?: number): Record<string, CardRule> {
  const own = npcId !== undefined ? NPC_RULES[npcId] : undefined;
  return own ? { ...STAPLE_RULES, ...own } : STAPLE_RULES;
}
