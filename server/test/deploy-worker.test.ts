// A client cannot opt out of disconnect losses by forging a restart header.
import { beforeEach, expect, it, vi } from "vitest";
const auth = vi.hoisted(() => ({ verifySession: vi.fn() }));
vi.mock("../src/do.ts", () => ({ WorldDO: class {} }));
vi.mock("../src/auth/auth.ts", () => ({ verifySession: auth.verifySession, ipBucket: vi.fn() }));
vi.mock("../src/auth/routes.ts", () => ({ authApp: { fetch: vi.fn() }, isAuthPath: () => false }));
import worker from "../src/worker.ts";
const ORIGIN = "https://duel.test";
function setup() {
  const forwarded = vi.fn(async (r: Request) => Response.json({ admin: r.headers.get("x-de-admin"), path: new URL(r.url).pathname }));
  const env = { PUBLIC_ORIGIN: ORIGIN, WORLD: { idFromName: () => "world", get: () => ({ fetch: forwarded }) } };
  const call = (action: string, headers: HeadersInit = {}) => worker.fetch(new Request(`${ORIGIN}/__admin/${action}`, { method: "POST", headers }), env as any, { waitUntil() {} } as any);
  return { forwarded, call };
}
beforeEach(() => auth.verifySession.mockReset());
it("rejects a signed-out client claiming to be a deployment", async () => {
  auth.verifySession.mockResolvedValue(null);
  const f = setup();
  expect((await f.call("prepare-restart", { "x-de-admin": "deploy" })).status).toBe(401);
  expect(f.forwarded).not.toHaveBeenCalled();
});
it("rejects ordinary players forging the admin header", async () => {
  auth.verifySession.mockResolvedValue({ userId: "player", roles: [] });
  const f = setup();
  for (const action of ["prepare-restart", "shutdown"]) expect((await f.call(action, { "x-de-admin": "deploy" })).status).toBe(403);
  expect(f.forwarded).not.toHaveBeenCalled();
});
it("forwards the verified admin identity for legitimate preparation", async () => {
  auth.verifySession.mockResolvedValue({ userId: "real-admin", roles: ["admin"] });
  const f = setup(), response = await f.call("prepare-restart", { "x-de-admin": "forged" });
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({ admin: "real-admin", path: "/__admin/prepare-restart" });
});
