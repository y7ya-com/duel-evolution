// Discord REST with the bot token (moved here from the owner's other game, duelforge clients/web/functions/_auth): role
// grants after /verify, #duels posts, the #in-game webhook. Never throws: Discord being down must not break the game.
export const API = "https://discord.com/api/v10";

/** The bot's settings (wrangler.jsonc vars; the token and the webhook URL are secrets). */
export interface DiscordEnv {
  DISCORD_BOT_TOKEN?: string;
  /** The app's public key (hex): the interactions endpoint checks Discord's Ed25519 signature with it. */
  DISCORD_PUBLIC_KEY?: string;
  DISCORD_GUILD_ID?: string;
  DISCORD_VERIFIED_ROLE_ID?: string;
  /** Granted at /verify to name + password players: it opens #reset-password. */
  DISCORD_PASSWORD_ROLE_ID?: string;
  /** #in-game: its messages come into All Chat (the gateway, bridge.ts). */
  DISCORD_CHAT_CHANNEL_ID?: string;
  /** A webhook of #in-game (secret: the URL holds its token): All Chat goes out through it, each line under its player's name. */
  DISCORD_CHAT_WEBHOOK_URL?: string;
  /** #duels: one message per open duel, with its Join button. */
  DISCORD_DUELS_CHANNEL_ID?: string;
  /** A voice channel only for show, whose name is the live count: "🟢 5 Players Online" (bridge.ts counter). */
  DISCORD_COUNTER_CHANNEL_ID?: string;
}

export type Rest = { ok: boolean; status: number; body: any; retryAfter?: number };

/** A REST call; a 429 answers its retry_after (seconds) instead of waiting here. */
export async function rest(env: DiscordEnv, method: string, path: string, body?: unknown): Promise<Rest> {
  if (!env.DISCORD_BOT_TOKEN) return { ok: false, status: 0, body: null };
  return send(`${API}${path}`, method, { Authorization: `Bot ${env.DISCORD_BOT_TOKEN}` }, body);
}

/** A webhook execution (?wait=true: the message back). */
export function webhook(url: string, body: unknown): Promise<Rest> {
  return send(url + (url.includes("?") ? "&" : "?") + "wait=true", "POST", {}, body);
}

async function send(url: string, method: string, headers: Record<string, string>, body?: unknown): Promise<Rest> {
  try {
    const r = await fetch(url, { method, headers: { ...headers, ...(body !== undefined && { "Content-Type": "application/json" }) },
      body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(8000) });
    const json: any = r.status === 204 ? null : await r.json().catch(() => null);
    return { ok: r.ok, status: r.status, body: json, ...(r.status === 429 && { retryAfter: Number(json?.retry_after ?? 1) }) };
  } catch {
    return { ok: false, status: 0, body: null };
  }
}

/** Give a guild member a role. Needs Manage Roles and the bot above the role. False when unconfigured or refused. */
export async function grantRole(env: DiscordEnv, userId: string, roleId?: string): Promise<boolean> {
  if (!env.DISCORD_GUILD_ID || !roleId) return false;
  return (await rest(env, "PUT", `/guilds/${env.DISCORD_GUILD_ID}/members/${userId}/roles/${roleId}`)).ok;
}

const hex = (h: string) => new Uint8Array((h.trim().match(/../g) ?? []).map((b) => parseInt(b, 16)));
/** Discord's Ed25519 signature of an interaction (timestamp + raw body) under the app's public key. Discord sends bad
 *  signatures while it checks the endpoint and wants a 401 for them. False on any malformed input. */
export async function verifyInteraction(publicKeyHex: string, signatureHex: string, timestamp: string, body: string): Promise<boolean> {
  if (!publicKeyHex || !signatureHex || !timestamp) return false;
  try {
    const key = await crypto.subtle.importKey("raw", hex(publicKeyHex), { name: "Ed25519" }, false, ["verify"]);
    return await crypto.subtle.verify({ name: "Ed25519" }, key, hex(signatureHex), new TextEncoder().encode(timestamp + body));
  } catch {
    return false;
  }
}
