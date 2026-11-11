import type { DiscordEnv } from "./discord/rest.ts";

export interface Env extends DiscordEnv {
  WORLD: DurableObjectNamespace;
  DB?: D1Database;
  /** The site's R2 bucket: the recomp client under recomp/, the duel engine data under duel-evolution/engine/. */
  BUCKET?: R2Bucket;
  PORT_OFFSET?: string;
  PUBLIC_IP?: string;
  SINGLE_LOBBY?: string;
  PARITY_SEED?: string;
  DEV?: string;
  /** "py": the py-parity NPC brain (parity runs); otherwise the NPC AI. */
  NPC_AI?: string;
  NPC_AI_SPY?: string;
  /** "py": py's automatic zone order, the first free zone from the left (parity runs); otherwise the centre first. */
  PLACE_ORDER?: string;
  LOG?: string;
  /** R2 prefix of the web client's files (default "recomp/", what the old site serves); a build staged elsewhere goes
   *  live with the switch. Must end in "/" and never be "private/". */
  CLIENT_PREFIX?: string;
  ADMIN_TOKEN?: string;
  /** scripts/deploy.sh's token (wrangler secret, 32+ chars): /__admin/{online,announce,maintenance,prepare-restart,shutdown,version}. */
  DEPLOY_TOKEN?: string;
  /** wrangler.jsonc version_metadata: the deployed version (GET /__version). */
  CF_VERSION_METADATA?: { id: string; tag?: string; timestamp?: string };
  /** The daily trade report's Discord webhook (wrangler secret; db/audit.ts). Unset: the report is only kept in R2. */
  REPORT_WEBHOOK?: string;
  PUBLIC_ORIGIN?: string;
}
