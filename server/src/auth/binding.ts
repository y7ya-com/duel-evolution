// Binds the game channel to a DE account. The /boxedwine-network upgrade needs an allowed Origin and a live session;
// the Worker then hands the WorldDO the user id in USER_HEADER (always overwritten, so a client can't supply it).
// The 2008 0x3003 login blob is never identity: it only says which game account, and that account must be the
// peer's own (canUseAccount).
import { verifySession } from "./auth.ts";
import type { AuthEnv } from "./env.ts";

export const USER_HEADER = "x-de-user";

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);

export function originAllowed(request: Request, env: AuthEnv): boolean {
  const origin = request.headers.get("Origin");
  if (!origin) return false;
  const extra = (env.ALLOWED_ORIGINS ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  return [env.PUBLIC_ORIGIN, ...extra].includes(origin);
}

/**
 * Gate for the game WebSocket upgrade: a Response to return (401/403), or the request to forward to the WorldDO with
 * USER_HEADER set. The one exception is the parity bridge: wrangler dev (DEV=1) on localhost with no Origin (not a
 * browser) is forwarded with no user, so py's fake_client scenarios run unchanged.
 */
export async function gateUpgrade(request: Request, env: AuthEnv): Promise<Response | Request> {
  const fwd = new Request(request);
  fwd.headers.delete(USER_HEADER);
  if (env.DEV === "1" && !request.headers.has("Origin") && LOCAL_HOSTS.has(new URL(request.url).hostname)) return fwd;
  if (!originAllowed(request, env)) return new Response("forbidden", { status: 403 });
  const v = await verifySession(request, env);
  if (!v) return new Response("sign in first", { status: 401 });
  fwd.headers.set(USER_HEADER, v.userId);
  return fwd;
}

/**
 * What the hub does with a 0x3003 for a game account, given the WebSocket's user (null only on the parity bridge)
 * and that account's owner (`null` = unowned, e.g. an imported legacy account not claimed yet; `undefined` = no such
 * account): use it, create it bound to the peer, or refuse. A replayed or forged 0x3003 names someone else's
 * account and is refused.
 */
export function canUseAccount(peerUserId: string | null, owner: string | null | undefined): "ok" | "create" | "refuse" {
  if (peerUserId === null) return owner === undefined ? "create" : "ok";
  if (owner === undefined) return "create";
  return owner === peerUserId ? "ok" : "refuse";
}
