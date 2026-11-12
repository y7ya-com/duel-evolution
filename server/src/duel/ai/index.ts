// Duel Evolution's NPC AI: the default NPC player of NPC duels (ocgSession.ts). Every NPC plays at the same strength,
// the elite tier: the heuristic player (heuristicBot.ts) plus replay-fork lookahead (simSearch.ts) on its own main
// phase, within a CPU budget per decision. An NPC's level only decides its deck (owner, 2026-11-11: difficulty comes
// from the deck, not from an AI that plays badly on purpose).
//
// The easy and hard tiers remain for the A/B tools (test/duel-ai.test.ts AI_AB_TIERS): easy demands more before it
// commits a monster (strength 40) and thinks one step less; hard is the heuristic player without the lookahead.
//
// Honest play by default: the AI sees only what the select's `view` shows (and its own cards). SPY (`spy: true`, off
// by default, elite only) reads the opponent's hidden cards and widens the lookahead to the opponent's whole turn.
// STYLE_BY_NPC can give an NPC a personality (heuristicBot.ts BotStyle: attackOnly, myTurnOnly, def, fool, light).
//
// Interface as the parity brain's: observe(ev) for every duelcore "msg" event, choose(sel) for the NPC's select
// (not a retry); null = no answer, the host lets the engine decide (`auto`).
import type { CardDB as EngineCardDB } from "../engine/data.ts";
import type { Json } from "../engine/core.ts";
import { tagMask, type CardDB as BrainDB } from "../brain/cards.ts";
import type { NpcProfilesJson } from "../brain/index.ts";
import { HeuristicBot, type BotStyle, type CardInfo } from "./heuristicBot.ts";
import { activeRules, type RuleSet } from "./ruleSet.ts";
import type { ForkLink, SearchAccess } from "./simSearch.ts";

export { HeuristicBot, type BotStyle, type CardInfo } from "./heuristicBot.ts";
export { simStats, type ForkLink, type LoggedCmd } from "./simSearch.ts";
export { activeRules, buildRules, setActiveRules, type RuleSet } from "./ruleSet.ts";

export type Tier = "easy" | "hard" | "elite";

/** Which AI played, in the duel record (npcDuelLog.ts): one more whenever the AI's play changes. */
export const NPC_AI_REV = 6;

/** Per-NPC personalities (NPC id -> style). */
export const STYLE_BY_NPC: Record<number, BotStyle> = {};

export interface TierConfig {
  /** Probability of a random legal line at a main/battle-phase decision. */
  blunder: number;
  /** 0-100: how demanding before committing a monster (heuristicBot.ts BotOpts.strength). */
  strength: number;
  /** One step less of thinking: no reply ply in the battle plan. */
  light: boolean;
  search: boolean;
  /** Max candidate lines per searched decision, and a safety ceiling (ms) that normal play never reaches. */
  budgetMs: number;
  maxCandidates: number;
}

export const TIERS: Record<Tier, TierConfig> = {
  easy: { blunder: 0, strength: 40, light: true, search: false, budgetMs: 0, maxCandidates: 0 },
  hard: { blunder: 0, strength: 100, light: false, search: false, budgetMs: 0, maxCandidates: 0 },
  elite: { blunder: 0, strength: 100, light: false, search: true, budgetMs: 3000, maxCandidates: 6 },
};

/** The NPC's tier: elite for every NPC, whatever its level (npc_profiles.json's level only picks the deck). */
export function tierFor(_npcId: number, _profiles?: NpcProfilesJson | null): Tier {
  return "elite";
}

const DISRUPTIVE = tagMask("destroy_monster", "destroy_st", "destroy_any", "nuke_opp", "nuke_all", "storm_opp", "storm_all",
  "bounce", "control", "search", "draw", "revive");

const INFO = new WeakMap<EngineCardDB, CardInfo>();
/** Card knowledge for the AI: stats and names from the engine's cards.cdb, flip effects from the brain's card tags. */
export function cardInfo(db: EngineCardDB, brain: BrainDB): CardInfo {
  let info = INFO.get(db);
  if (info) return info;
  const names = new Map<number, string>();
  info = {
    stat(code) {
      const c = db.get(code);
      return { atk: c?.attack ?? 0, def: c?.defense ?? 0, level: c?.level ?? 0 };
    },
    name(code) {
      let n = names.get(code);
      if (n === undefined) { n = code && db.get(code) ? db.name(code).toLowerCase() : ""; names.set(code, n); }
      return n;
    },
    flipRisk(code) {
      const c = brain.get(code);
      if (!c || !c.is_flip) return 0;
      return c.any(DISRUPTIVE) ? 2200 : 700;
    },
    brain,
  };
  INFO.set(db, info);
  return info;
}

export interface NpcAiOptions {
  npcId: number;
  /** The NPC's protocol player. */
  seat: number;
  /** Seed of the AI's private rng (the duel's seed: deterministic per duel). */
  seed: number;
  cards: CardInfo;
  tier: Tier;
  /** Spy vision + spy horizon (elite). Off by default: honest play. */
  spy?: boolean;
  /** The live duel for the elite's forks (null/absent = no search). */
  link?: () => ForkLink | null;
  /** The live duel's full state (duelcore `query`), for spy vision only. */
  peek?: () => Json;
  /** The card rules (ruleSet.ts): the set active when the duel starts, kept for the whole duel. */
  rules?: RuleSet;
  /** A personality over the tier (STYLE_BY_NPC by default). */
  style?: BotStyle;
}

export class NpcAi {
  readonly tier: Tier;
  readonly bot: HeuristicBot;
  readonly rules: RuleSet;
  /** Decisions answered, the CPU spent in choose() (ms) and the exceptions caught (answered by the engine instead). */
  readonly stats = { decisions: 0, ms: 0, maxMs: 0, errors: 0 };

  constructor(o: NpcAiOptions) {
    this.tier = o.tier;
    const rules = this.rules = o.rules ?? activeRules();
    const cfg = TIERS[o.tier];
    const spy = !!o.spy && o.tier === "elite";
    const style: BotStyle = { ...(cfg.light ? { light: true } : {}), ...(o.style ?? STYLE_BY_NPC[o.npcId] ?? {}) };
    let search: SearchAccess | undefined;
    if (cfg.search && o.link) {
      search = {
        link: o.link,
        // the NPC's own seat plays on as the NPC would (its strength and style); the other seat at full strength
        makePolicy: (seat, own, peek) => new HeuristicBot(seat, o.cards, own
          ? { npcId: o.npcId, spy, peek, rules, strength: cfg.strength, style }
          : { spy, peek, rules }),
        budgetMs: cfg.budgetMs,
        maxCandidates: cfg.maxCandidates,
        spy,
      };
    }
    this.bot = new HeuristicBot(o.seat, o.cards, { npcId: o.npcId, seed: o.seed, spy, peek: spy ? o.peek : undefined, search, blunder: cfg.blunder, rules, strength: cfg.strength, style });
  }

  observe(ev: Json): void {
    if (ev.ev === "msg") this.bot.observe(ev);
  }

  choose(sel: Json): Json | null {
    const t0 = performance.now();
    try {
      return this.bot.choose(sel);
    } catch {
      this.stats.errors++;
      return null;
    } finally {
      const ms = performance.now() - t0;
      this.stats.decisions++;
      this.stats.ms += ms;
      if (ms > this.stats.maxMs) this.stats.maxMs = ms;
    }
  }
}
