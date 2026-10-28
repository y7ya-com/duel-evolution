// Card rules: per-card timing overrides the heuristic player consults before its generic fallback (a default
// executor plus per-card / per-NPC rules). Instead of firing the first available spell or trap, the player asks "does
// this card's rule say to play it NOW?" and holds it otherwise. No rule for a card = the generic behaviour, so a rule
// only ever makes the player smarter, never illegal.
//
// Two layers, merged per duel by rulesFor(npcId):
//   - STAPLE_RULES: shared timing for cards that appear across many decks (no Heavy Storm into your own backrow, no
//     Mirror Force on a weak poke, no Dark Hole on your own better board...).
//   - tagRule(card): for a card with no named rule, a generic rule from its text tags (brain_cards.json: draw,
//     search, nuke, destroy...), so the cards of this game's 2008 decks get sensible timing too.
//   - NPC_RULES[npcId]: one NPC's game plan, keyed by this game's NPC ids (npc_profiles.json). Empty for now: to be
//     tuned per deck. NPC rules override staples by card name.
//
import { TYPE_MONSTER, TYPE_SPELL, TYPE_TRAP, tagMask, type Card } from "../brain/cards.ts";

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
}

const hasMon = (m: RuleMon[]): boolean => m.length > 0;
const attackers = (m: RuleMon[]): number => m.filter((x) => x.attackPos).length;
/** A threat worth answering — a real attacker, or several of them. */
const realThreat = (c: RuleCtx): boolean => c.oppMaxAtk >= 1700 || attackers(c.oppMon) >= 2;

// ── shared staples (every NPC, unless its own rules override) ──────────────────────
export const STAPLE_RULES: Record<string, CardRule> = {
  // Draw/search first: widening the hand before choosing a summon prevents avoidable weak openings.
  "pot of greed": { idleActivate: () => true, idlePriority: 140 },
  "graceful charity": { idleActivate: () => true, idlePriority: 135 },
  "allure of darkness": { idleActivate: () => true, idlePriority: 130 },
  "reinforcement of the army": { idleActivate: () => true, idlePriority: 125 },
  "e - emergency call": { idleActivate: () => true, idlePriority: 125 },

  // Mass / targeted removal — only when there's actually something to remove, and don't self-destruct.
  "dark hole": { idleActivate: (c) => hasMon(c.oppMon) && (c.oppMon.length > c.myMon.length || c.oppMaxAtk > c.myMaxAtk), idlePriority: 120 },
  "raigeki": { idleActivate: (c) => hasMon(c.oppMon), idlePriority: 120 },
  "lightning vortex": { idleActivate: (c) => hasMon(c.oppMon), idlePriority: 115 },
  "smashing ground": { idleActivate: (c) => hasMon(c.oppMon), idlePriority: 110 },
  "fissure": { idleActivate: (c) => hasMon(c.oppMon), idlePriority: 110 },
  "tribute to the doomed": { idleActivate: (c) => hasMon(c.oppMon), idlePriority: 105 },
  "nobleman of crossout": { idleActivate: (c) => c.oppMon.some((m) => m.faceDown), idlePriority: 110 },

  // Backrow removal — only with a target, and Heavy Storm only when it nets us cards (don't nuke our own set).
  "heavy storm": { idleActivate: (c) => c.oppBackrow >= 2 || (c.oppBackrow >= 1 && c.myBackrow === 0), idlePriority: 105 },
  "harpie's feather duster": { idleActivate: (c) => c.oppBackrow >= 1, idlePriority: 110 },
  "mystical space typhoon": { idleActivate: (c) => c.oppBackrow >= 1, idlePriority: 100 },
  "dust tornado": { idleActivate: (c) => c.oppBackrow >= 1, idlePriority: 100 },

  // Steal / revive — only when there's something worth it.
  "snatch steal": { idleActivate: (c) => c.oppMaxAtk >= 1500, idlePriority: 108 },
  "premature burial": { idleActivate: (c) => c.myGraveMaxAtk >= 1700, idlePriority: 90 },
  "monster reborn": { idleActivate: (c) => Math.max(c.myGraveMaxAtk, c.oppGraveMaxAtk) >= 1700, idlePriority: 95 },

  // Fusion spells are only offered by the core when a legal payoff exists. Give them development
  // priority, below draw/removal so those cards can improve the material pool first.
  "polymerization": { idleActivate: () => true, idlePriority: 55 },
  "miracle fusion": { idleActivate: () => true, idlePriority: 60 },
  "fusion destiny": { idleActivate: () => true, idlePriority: 65 },
  "red-eyes fusion": { idleActivate: () => true, idlePriority: 65 },
  "cyberload fusion": { idleActivate: () => true, idlePriority: 60 },

  "limiter removal": {
    battleActivate: (c) => c.myMaxAtk > 0 && (c.myMaxAtk < c.oppMaxAtk || c.myMaxAtk * 2 >= c.oppLp),
  },

  // Reactive traps — spring only on a real threat (not a 1000-ATK poke), and never suicide.
  "mirror force": { chainReact: realThreat },
  "sakuretsu armor": { chainReact: (c) => c.oppMaxAtk >= 1700 },
  "magic cylinder": { chainReact: (c) => c.oppMaxAtk >= 1700 },
  "ring of destruction": { chainReact: (c) => c.oppMaxAtk >= 1700 && c.oppMaxAtk < c.myLp },
  "torrential tribute": { chainReact: (c) => c.oppMon.length > c.myMon.length || (c.oppMaxAtk > c.myMaxAtk && hasMon(c.oppMon)) },
  "solemn judgment": { chainReact: (c) => c.myLp > 4000 },
  "negate attack": { chainReact: (c) => c.oppMaxAtk > 0 && c.oppMaxAtk >= c.myMaxAtk },
  "draining shield": { chainReact: (c) => c.oppMaxAtk >= 1700 },
  "waboku": { chainReact: realThreat },
  "mirror wall": { chainReact: (c) => c.oppMaxAtk > 0 && c.oppMaxAtk >= c.myMaxAtk },
  "spellbinding circle": { chainReact: (c) => c.oppMaxAtk >= 1900 },
};

// ── generic rules from the card's text tags (cards with no named rule) ──────────────
const M_SEARCHER = tagMask("search", "draw");
/** A generic rule from a card's text tags, or undefined (the plain heuristic). */
export function tagRule(c: Card | undefined): CardRule | undefined {
  if (!c) return undefined;
  if (c.type & TYPE_MONSTER) {
    // Searchers / drawers on summon: lead with them before a plain beater.
    return c.has("on_summon") && c.any(M_SEARCHER) ? { summonScore: () => 600 } : undefined;
  }
  if (c.type & TYPE_SPELL) {
    if (c.has("draw")) return { idleActivate: () => true, idlePriority: 130 };
    if (c.has("search") && !c.has("ritual")) return { idleActivate: () => true, idlePriority: 120 };
    if (c.has("nuke_all")) return { idleActivate: (x) => hasMon(x.oppMon) && (x.oppMon.length > x.myMon.length || x.oppMaxAtk > x.myMaxAtk), idlePriority: 115 };
    if (c.has("nuke_opp")) return { idleActivate: (x) => hasMon(x.oppMon), idlePriority: 115 };
    if (c.has("storm_all")) return { idleActivate: (x) => x.oppBackrow >= 2 || (x.oppBackrow >= 1 && x.myBackrow === 0), idlePriority: 105 };
    if (c.has("storm_opp")) return { idleActivate: (x) => x.oppBackrow >= 1, idlePriority: 105 };
    if (c.has("control") || c.has("destroy_monster")) return { idleActivate: (x) => x.oppMaxAtk >= 1000 || x.oppMon.length > 0, idlePriority: 108 };
    if (c.has("destroy_st")) return { idleActivate: (x) => x.oppBackrow >= 1, idlePriority: 100 };
    if (c.has("bounce")) return { idleActivate: (x) => hasMon(x.oppMon) || x.oppBackrow > x.myBackrow, idlePriority: 95 };
    if (c.has("revive")) return { idleActivate: (x) => Math.max(x.myGraveMaxAtk, x.oppGraveMaxAtk) >= 1500, idlePriority: 95 };
    return undefined;
  }
  if (c.type & TYPE_TRAP) {
    // Attack-response traps: not on a weak poke.
    if (c.has("on_attack") && c.any(tagMask("destroy_monster", "nuke_opp", "negate", "burn", "control"))) return { chainReact: realThreat };
  }
  return undefined;
}

// ── per-NPC game plans (by NPC id), to be tuned per deck ──────────────────────────────
export const NPC_RULES: Record<number, Record<string, CardRule>> = {
  // 35: { "card name": { summonScore: () => 500 } },
};

/** The shared staples merged with an NPC's own plan (NPC rules win on name collisions). */
export function rulesFor(npcId?: number): Record<string, CardRule> {
  const own = npcId !== undefined ? NPC_RULES[npcId] : undefined;
  return own ? { ...STAPLE_RULES, ...own } : STAPLE_RULES;
}
