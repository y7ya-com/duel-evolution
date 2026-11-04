import { beforeEach, describe, expect, it, vi } from "vitest";
const auth = vi.hoisted(() => ({ verifySession: vi.fn() }));
vi.mock("../src/do.ts", () => ({ WorldDO: class {} }));
vi.mock("../src/auth/auth.ts", () => ({ verifySession: auth.verifySession, ipBucket: vi.fn() }));
vi.mock("../src/auth/routes.ts", () => ({ authApp: { fetch: vi.fn() }, isAuthPath: () => false }));
import worker from "../src/worker.ts";

const ORIGIN = "https://de.test";
function setup() {
  const fetch = vi.fn(async (request: Request) => Response.json({ path: new URL(request.url).pathname, user: request.headers.get("x-de-user"), method: request.method }, { headers: { "Cache-Control": "no-store" } }));
  const env = { PUBLIC_ORIGIN: ORIGIN, WORLD: { idFromName: () => "world", get: () => ({ fetch }) } };
  const run = (path: string, init: RequestInit = {}) => worker.fetch(new Request(ORIGIN + path, init), env as any, { waitUntil() {} } as any);
  return { fetch, run };
}
beforeEach(() => { auth.verifySession.mockReset(); auth.verifySession.mockResolvedValue({ userId: "real-user", roles: [], name: "Real" }); });

describe("Tag Duel and wallet Worker session boundary", () => {
  it("requires a verified session for lobby state and wallet reads", async () => {
    const h = setup(); auth.verifySession.mockResolvedValue(null);
    for (const path of ["/api/de/tag", "/api/de/wallet"]) {
      const r = await h.run(path, { headers: { "x-de-user": "forged-user" } });
      expect(r.status).toBe(401);
      expect(await r.json()).toEqual({ error: "signed out" });
    }
    expect(h.fetch).not.toHaveBeenCalled();
  });
  it("rejects cross-origin invitation mutations before forwarding anything", async () => {
    const h = setup();
    for (const action of ["invite", "accept", "decline", "cancel"]) {
      const r = await h.run(`/api/de/tag/${action}`, { method: "POST", headers: { Origin: "https://evil.test" }, body: "{}" });
      expect(r.status).toBe(403);
    }
    expect(auth.verifySession).not.toHaveBeenCalled();
    expect(h.fetch).not.toHaveBeenCalled();
  });
  it("overwrites forged identities with the checked session for reads and same-origin responses", async () => {
    const h = setup();
    for (const [path, method] of [["/api/de/tag", "GET"], ["/api/de/tag/invite", "POST"], ["/api/de/tag/accept", "POST"], ["/api/de/wallet", "GET"]]) {
      const r = await h.run(path, { method, headers: { Origin: ORIGIN, "x-de-user": "victim" }, ...(method === "POST" ? { body: "{}" } : {}) });
      expect(r.status).toBe(200);
      expect(await r.json()).toEqual({ path: path.replace("/api/de/", "/__de/"), user: "real-user", method });
      expect(r.headers.get("Cache-Control")).toBe("no-store");
    }
  });
});
