// The duel archive (duel/duelArchive.ts): one row per duel, NPC and PvP (one per game of a match), written as it ends,
// never part of the state projection (db/project.ts STATE_TABLES). The replay file each player downloads is in R2
// (`file`); the engine's commands replay the duel exactly for the NPC AI's tuning (test/npc-lab.test.ts).
import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

/** Pruned after ARCHIVE_KEEP_DAYS, its R2 file with it. Player a = protocol player 0 (the human in an NPC duel). */
export const duelArchive = sqliteTable("duel_archive", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  at: integer("at").notNull(),                 // unix seconds, the end of the duel
  kind: text("kind").notNull(),                // npc | pvp
  aAcct: text("a_acct").notNull(), aSlot: integer("a_slot"), aName: text("a_name"),
  bAcct: text("b_acct"), bSlot: integer("b_slot"), bName: text("b_name"),   // the PvP opponent; null in an NPC duel
  rival: integer("rival"),                     // NPC: the NPC challenged (npc_progress's npc)
  npc: integer("npc"),                         // NPC: the recipe it played (npcRules famous_decks: the rival's current level)
  tier: text("tier"),                          // NPC: easy | hard | elite (duel/ai), py for the parity brain
  aiRev: integer("ai_rev"),                    // NPC: duel/ai NPC_AI_REV, which AI played
  aiRules: integer("ai_rules"),                // NPC: the card rules' live overlay it played by (npc_ai_rules.id; 0 = rules.json alone)
  game: integer("game").notNull(),             // the game of a PvP match (1..3); 1 otherwise
  result: text("result").notNull(),            // player a's: win | lose | draw | abandon
  reason: text("reason"),                      // the engine's end reason, or surrender | timeout | loop | error | abandon
  turns: integer("turns").notNull(), secs: integer("secs").notNull(),
  first: integer("first").notNull(),           // who went first: 0 player a, 1 player b / the NPC
  lpA: integer("lp_a"), lpB: integer("lp_b"),
  decisions: integer("decisions"),             // NPC: the NPC's decisions
  file: text("file"),                          // R2 key of the EDOPro replay (.yrpX, stored gzip)
  fileBytes: integer("file_bytes"),            // its size uncompressed
  // gzip + base64 of JSON { v, decks, opts, cmds }: the engine's `new` arguments (seed included) and every command
  // since, which replay the duel exactly (the engine is deterministic: duel/ai/simSearch.ts forks the same way)
  commands: text("commands"),
}, (t) => [index("duel_archive_at_idx").on(t.at), index("duel_archive_a_idx").on(t.aAcct, t.at), index("duel_archive_b_idx").on(t.bAcct, t.at),
  index("duel_archive_npc_idx").on(t.npc, t.at)]);

/** The NPC card rules' live overlay (duel/ai/ruleSet.ts), one row per version pushed (POST /__admin/ai-rules): the
 *  newest is the one played; a revert pushes an older one again as a new row. */
export const npcAiRules = sqliteTable("npc_ai_rules", {
  id: integer("id").primaryKey({ autoIncrement: true }),   // the version (duel_archive.ai_rules)
  at: integer("at").notNull(),                 // unix seconds
  by: text("by").notNull(),                    // who pushed it: the admin's user id, or "deploy" (the deploy token)
  note: text("note"),
  overlay: text("overlay").notNull(),          // the overlay's JSON ({} = rules.json alone)
});
