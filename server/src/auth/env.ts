// Bindings and secrets the auth module reads (secrets via `wrangler secret put`, dev values in .dev.vars).
export interface AuthEnv {
  DB: D1Database;
  /** The singleton WorldDO (game state): a claim binds the game account there. */
  WORLD: DurableObjectNamespace;
  /** better-auth signing/encryption secret, 32+ random bytes. */
  BETTER_AUTH_SECRET: string;
  /** Public origin, e.g. https://original.ygoevolution.com: cookies, emailed links and the Origin allowlist. */
  PUBLIC_ORIGIN: string;
  /** Extra allowed Origins for the game WebSocket, comma separated (default: PUBLIC_ORIGIN only). */
  ALLOWED_ORIGINS?: string;
  /** The Discord server invite shown with a verify code (secret only to keep it out of the repo). */
  DISCORD_INVITE_URL?: string;
  /** HMAC key shared with the bot's interactions endpoint, which forwards DE's /verify and /reset here. */
  DE_FORWARD_SECRET?: string;
  /** "production" on the live Worker; "staging" only in local wrangler dev (wrangler.jsonc vars). */
  DEPLOY_ENV?: string;
  /** DEPLOY_ENV=staging only: the shared secret of POST /api/de/test-sign-in (automation). Ignored anywhere else. */
  TEST_SIGNIN_SECRET?: string;
  /** The Discord OAuth app. Discord sign-in is offered only when both are set. */
  DISCORD_CLIENT_ID?: string;
  DISCORD_CLIENT_SECRET?: string;
  DEV?: string;
}
