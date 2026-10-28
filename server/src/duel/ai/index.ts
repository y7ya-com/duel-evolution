// Duel Evolution's NPC AI: the default NPC player of NPC duels (ocgSession.ts), in three tiers.
//
//   easy  (NPC level 1-3): the heuristic player (heuristicBot.ts) with blunders: now and then a random legal line in
//                          the main / battle phase.
//   hard  (level 4-6):     the heuristic player, no blunders.
//   elite (level 7-9):     the heuristic player plus replay-fork lookahead (simSearch.ts) on its own main phase, within
//                          a CPU budget per decision.
//
// Honest play by default: the AI sees only what the select's `view` shows (and its own cards). SPY (`spy: true`, off
// by default, elite only) reads the opponent's hidden cards and widens the lookahead to the opponent's whole turn.
// The level comes from npc_profiles.json; TIER_BY_NPC overrides it per NPC id.
//
// Interface as the parity brain's: observe(ev) for every duelcore "msg" event, choose(sel) for the NPC's select
// (not a retry); null = no answer, the host lets the engine decide (`auto`).
import type { CardDB as EngineCardDB } from "../engine/data.ts";
import type { Json } from "../engine/core.ts";
import { tagMask, type CardDB as BrainDB } from "../brain/cards.ts";
import type { NpcProfilesJson } from "../brain/index.ts";
import { HeuristicBot, type CardInfo } from "./heuristicBot.ts";
import type { ForkLink, SearchAccess } from "./simSearch.ts";

export { HeuristicBot, type CardInfo } from "./heuristicBot.ts";
export { simStats, type ForkLink, type LoggedCmd } from "./simSearch.ts";

export type Tier = "easy" | "hard" | "elite";

/** Per-NPC tier overrides (NPC id -> tier), for later tuning. */
export const TIER_BY_NPC: Record<number, Tier> = {};

export interface TierConfig {
  /** Probability of a random legal line at a main/battle-phase decision. */
  blunder: number;
  search: boolean;
  /** CPU budget per searched decision (ms) and max candidate lines. */
  budgetMs: number;
  maxCandidates: number;
}

export const TIERS: Record<Tier, TierConfig> = {
  easy: { blunder: 0.2, search: false, budgetMs: 0, maxCandidates: 0 },
  hard: { blunder: 0, search: false, budgetMs: 0, maxCandidates: 0 },
  elite: { blunder: 0, search: true, budgetMs: 150, maxCandidates: 6 },
};

/** The NPC's tier: TIER_BY_NPC, else its npc_profiles.json level (1-3 easy, 4-6 hard, 7-9 elite; none = 2). */
export function tierFor(npcId: number, profiles?: NpcProfilesJson | null): Tier {
  const own = TIER_BY_NPC[npcId];
  if (own) return own;
  const level = Number(profiles?.[String(npcId)]?.nivel ?? 2) || 2;
  return level >= 7 ? "elite" : level >= 4 ? "hard" : "easy";
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
}

export class NpcAi {
  readonly tier: Tier;
  readonly bot: HeuristicBot;
  /** Decisions answered, the CPU spent in choose() (ms) and the exceptions caught (answered by the engine instead). */
  readonly stats = { decisions: 0, ms: 0, maxMs: 0, errors: 0 };

  constructor(o: NpcAiOptions) {
    this.tier = o.tier;
    const cfg = TIERS[o.tier];
    const spy = !!o.spy && o.tier === "elite";
    let search: SearchAccess | undefined;
    if (cfg.search && o.link) {
      search = {
        link: o.link,
        makePolicy: (seat, own, peek) => new HeuristicBot(seat, o.cards, { npcId: own ? o.npcId : undefined, spy, peek }),
        budgetMs: cfg.budgetMs,
        maxCandidates: cfg.maxCandidates,
        spy,
      };
    }
    this.bot = new HeuristicBot(o.seat, o.cards, { npcId: o.npcId, seed: o.seed, spy, peek: spy ? o.peek : undefined, search, blunder: cfg.blunder });
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
