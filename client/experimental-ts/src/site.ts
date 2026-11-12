// What the build knows about the site it is served from (vite: VITE_* at build time; none in development).
// infra/ship-v2.sh builds v2.ygoevolution.com with VITE_DE_ASSETS=/game/ (live's game files, through the v2 front) and
// VITE_DE_DISCORD_OAUTH=1: Sign in with Discord works on v2 (the v2 front keeps the OAuth paths' redirects on live's
// host, infra/v2/worker.ts DISCORD_OAUTH). A build with VITE_DE_DISCORD_OAUTH=0 says in the sign-in window that Discord
// sign-in is not available there instead of offering a button that can't finish.
const env = (import.meta as ImportMeta & { env?: Record<string, string | boolean | undefined> }).env ?? {};
const str = (v: unknown): string => (typeof v === 'string' ? v.trim() : '');
/** The game files' base when the page's URL names none (?assets=); '' = no game files (the plain view). */
export const DEFAULT_ASSETS = str(env.VITE_DE_ASSETS);
/** Whether Discord's OAuth (Sign in with Discord, Link Discord) can return to this site. */
export const DISCORD_OAUTH = str(env.VITE_DE_DISCORD_OAUTH) !== '0';
