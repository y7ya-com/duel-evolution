// The card rules the NPCs play by: rules.json (bundled with the server) with the live overlay on top. The overlay is
// a version in D1 (npc_ai_rules, db/archive-schema.ts) an admin pushes through POST /__admin/ai-rules (do.ts; the
// script scripts/ai-rules.sh): the next duel plays by it, with no deploy and no restart. A duel keeps the set it
// started with (NpcAi takes it once), and the duel archive records its version (duel_archive.ai_rules).
import BUNDLED from "./rules.json";
import type { CardRule } from "./cardRules.ts";
import { compileSet, mergeSets, RuleError, type CompiledSet, type RuleSetJson } from "./ruleExpr.ts";

export interface RuleSet {
  /** The overlay's version (npc_ai_rules.id); 0 = the bundled rules alone. */
  version: number;
  compiled: CompiledSet;
  /** The overlay as pushed (null with none). */
  overlay: RuleSetJson | null;
}

const bundledJson = BUNDLED as RuleSetJson;
const bundled: RuleSet = { version: 0, compiled: compileSet(bundledJson, "rules.json"), overlay: null };
let active: RuleSet = bundled;

/** The set new duels play by. */
export const activeRules = (): RuleSet => active;
export const bundledRules = (): RuleSet => bundled;

/** The bundled rules with this overlay on top, compiled: throws RuleError with what is wrong (nothing changes). */
export function buildRules(overlay: unknown, version: number): RuleSet {
  if (overlay === null) return { ...bundled, version };
  if (!overlay || typeof overlay !== "object" || Array.isArray(overlay)) throw new RuleError("overlay: a rule set is an object");
  // the overlay alone first: its own mistakes, named where they are
  compileSet(overlay, "overlay");
  return { version, compiled: compileSet(mergeSets(bundledJson, overlay as RuleSetJson), "rules"), overlay: overlay as RuleSetJson };
}

/** Makes `set` the one new duels play by. */
export function setActiveRules(set: RuleSet): void { active = set; }

/** The staples merged with one NPC's own rules (theirs win on a name). */
export function rulesOf(set: RuleSet, npcId?: number): Record<string, CardRule> {
  const own = npcId !== undefined ? set.compiled.npcs[npcId] : undefined;
  return own ? { ...set.compiled.staples, ...own } : set.compiled.staples;
}
