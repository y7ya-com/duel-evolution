// The bot's HTTP interactions endpoint, POST /api/discord/interactions (the app's Interactions Endpoint URL; moved here
// from duelforge, which forwarded DE's codes to /api/de/discord-forward). Discord signs every request (Ed25519) and
// tests the endpoint with bad signatures, which must get a 401.
// - /verify <code>, the #verify button's form: links the Discord account to the game account that showed the code, and
//   grants the Verified and Password User roles;
// - /reset, the #reset-password button: a reset code for the linked name + password account;
// - a #duels Accept (duel_join:<room id>): a private link that opens the game signed in and sends the duel request.
import type { AuthEnv } from "../auth/env.ts";
import { issueDuelLink, linkedUser, resetCode, verifyByCode, DUEL_LINK_TTL_MS, type DiscordUser } from "../auth/discord-link.ts";
import type { OpenDuel } from "../game/lobby.ts";
import { grantRole, verifyInteraction, type DiscordEnv } from "./rest.ts";

const T_PING = 1, T_COMMAND = 2, T_COMPONENT = 3, T_MODAL_SUBMIT = 5;
const R_PONG = 1, R_MESSAGE = 4, R_MODAL = 9;
const EPHEMERAL = 64;
type Env = AuthEnv & DiscordEnv & { WORLD: DurableObjectNamespace };

const ephemeral = (content: string, components?: unknown[]) => ({ type: R_MESSAGE, data: { content, flags: EPHEMERAL, allowed_mentions: { parse: [] }, ...(components && { components }) } });
/** A row with one link button (style 5: opens the URL; Discord asks the player before leaving for an unknown site). */
const linkRow = (label: string, url: string) => [{ type: 1, components: [{ type: 2, style: 5, label, url }] }];

const verifyModal = () => ({
  type: R_MODAL,
  data: {
    custom_id: "verify_modal",
    title: "Verify: paste your game code, then Submit",
    components: [{ type: 1, components: [{ type: 4, custom_id: "code", label: "Type or paste the code the game shows", style: 1,
      min_length: 6, max_length: 16, required: true, placeholder: "e.g. ABC234" }] }],
  },
});

async function verify(env: Env, who: DiscordUser, code: unknown) {
  if (typeof code !== "string" || !code.trim()) return ephemeral("Enter the code shown in the game.");
  const r = await verifyByCode(env.DB, who, code);
  if (!r.ok) return ephemeral("That code is invalid or expired. Generate a fresh one in the game and try again.");
  if (r.grantVerified) await Promise.all([grantRole(env, who.id, env.DISCORD_VERIFIED_ROLE_ID), grantRole(env, who.id, env.DISCORD_PASSWORD_ROLE_ID)]);
  return ephemeral(r.message);
}

async function reset(env: Env, who: DiscordUser) {
  const r = await resetCode(env.DB, who);
  if (!r.ok) return ephemeral("No Duel Evolution account with a password is linked to this Discord yet. Create one in the game and verify first.");
  return ephemeral(`${r.message}\nPaste it into the game's reset-password screen within 15 minutes.`);
}

/** A #duels Accept: still open? then a link that signs the player in and joins (a linked Discord), or the game's page with
 *  the duel to join after signing in (not linked yet: "Sign in with Discord" there links it). */
async function join(env: Env, origin: string, who: DiscordUser, id: number) {
  const userId = await linkedUser(env.DB, who.id);
  const world = env.WORLD.get(env.WORLD.idFromName("world"));
  const q = new URLSearchParams({ id: String(id), ...(userId && { user: userId }) });
  const r = await world.fetch(`https://world/__de/discord/duel?${q}`).then((x) => x.json() as Promise<{ duel: OpenDuel | null; self: boolean }>).catch(() => null);
  if (!r) return ephemeral("The game didn't answer. Try again in a moment.");
  if (!r.duel) return ephemeral("That duel is no longer open.");
  if (r.self) return ephemeral("That's your own duel. It stays here until someone accepts it or you close it in the game.");
  if (!userId) {
    return ephemeral(`To duel **${r.duel.name}**, open the game and choose **Sign in with Discord** (it links this Discord to your duelist). The duel request is sent once you're in the world.`,
      linkRow("Open Duel Evolution", `${origin}/?online=1&duel=${id}`));
  }
  const token = await issueDuelLink(env.DB, userId, id);
  return ephemeral(`Duel **${r.duel.name}**: this link opens Duel Evolution signed in as you and sends the duel request once you're in the world. `
    + `It works once, for ${DUEL_LINK_TTL_MS / 60_000} minutes. Don't share it.`, linkRow("Open the game and join", `${origin}/api/auth/de/duel-link?t=${token}`));
}

export async function handleInteraction(req: Request, env: Env): Promise<Response> {
  const sig = req.headers.get("x-signature-ed25519") ?? "", ts = req.headers.get("x-signature-timestamp") ?? "";
  const body = await req.text();
  if (!(await verifyInteraction(env.DISCORD_PUBLIC_KEY ?? "", sig, ts, body))) return new Response("invalid request signature", { status: 401 });
  const i = JSON.parse(body);
  if (i.type === T_PING) return Response.json({ type: R_PONG });
  const u = i.member?.user ?? i.user;
  if (!u?.id) return Response.json(ephemeral("Couldn't read your Discord account."));
  const who: DiscordUser = { id: String(u.id), username: String(u.username ?? "") };
  const origin = env.PUBLIC_ORIGIN;
  if (i.type === T_COMMAND && i.data?.name === "verify")
    return Response.json(await verify(env, who, (i.data.options ?? []).find((o: { name: string }) => o.name === "code")?.value));
  if (i.type === T_COMMAND && i.data?.name === "reset") return Response.json(await reset(env, who));
  if (i.type === T_COMPONENT) {
    const cid = String(i.data?.custom_id ?? "");
    if (cid === "verify_button") return Response.json(verifyModal());
    if (cid === "reset_button") return Response.json(await reset(env, who));
    const m = /^duel_join:(\d{1,9})$/.exec(cid);
    if (m) return Response.json(await join(env, origin, who, Number(m[1])));
  }
  if (i.type === T_MODAL_SUBMIT && i.data?.custom_id === "verify_modal")
    return Response.json(await verify(env, who, i.data.components?.[0]?.components?.[0]?.value));
  return Response.json(ephemeral("Unknown action."));
}
