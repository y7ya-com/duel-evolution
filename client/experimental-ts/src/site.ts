// What the build knows about the site it is served from (vite: VITE_* at build time; none in development).
// infra/ship-v2.sh builds v2.ygoevolution.com with VITE_DE_ASSETS=/game/ (live's game files, through the v2 front) and
// VITE_DE_DISCORD_OAUTH=0: live's Discord app only returns to live's own hosts (server/src/worker.ts GAME_HOSTS and the
// app's redirect URI), so Sign in with Discord and Link Discord can't finish on v2. Password sign-in, registration and
// /verify, /reset in Discord all work there.
const env = (import.meta as ImportMeta & { env?: Record<string, string | boolean | undefined> }).env ?? {};
const str = (v: unknown): string => (typeof v === 'string' ? v.trim() : '');
/** The game files' base when the page's URL names none (?assets=); '' = no game files (the plain view). */
export const DEFAULT_ASSETS = str(env.VITE_DE_ASSETS);
/** Whether Discord's OAuth (Sign in with Discord, Link Discord) can return to this site. */
export const DISCORD_OAUTH = str(env.VITE_DE_DISCORD_OAUTH) !== '0';
