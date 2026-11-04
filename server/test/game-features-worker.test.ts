import { beforeEach, describe, expect, it, vi } from "vitest";
const auth = vi.hoisted(() => ({ verifySession: vi.fn() }));
vi.mock("../src/do.ts", () => ({ WorldDO: class {} }));
vi.mock("../src/auth/auth.ts", () => ({ verifySession: auth.verifySession, ipBucket: vi.fn() }));
vi.mock("../src/auth/routes.ts", () => ({ authApp: { fetch: vi.fn() }, isAuthPath: () => false }));
import worker from "../src/worker.ts";
const ORIGIN = "https://de.test";
function setup() {
  const forwarded = vi.fn(async (r: Request) => Response.json({ path: new URL(r.url).pathname, query: new URL(r.url).search, user: r.headers.get("x-de-user") }));
  const env = { PUBLIC_ORIGIN: ORIGIN, WORLD: { idFromName: () => "world", get: () => ({ fetch: forwarded }) } };
  return { forwarded, run: (path: string, init: RequestInit = {}) => worker.fetch(new Request(ORIGIN + path, init), env as any, { waitUntil() {} } as any) };
}
beforeEach(() => { auth.verifySession.mockReset(); auth.verifySession.mockResolvedValue({ userId: "real-user", roles: [] }); });
describe("shop, wardrobe and chat security boundary", () => {
  it("requires an actual session rather than client supplied identities", async () => {
    const f = setup(); auth.verifySession.mockResolvedValue(null);
    for (const path of ["shop", "cosmetics", "chat"]) expect((await f.run(`/api/de/${path}`, { headers: { "x-de-user": "victim" } })).status).toBe(401);
    expect(f.forwarded).not.toHaveBeenCalled();
  });
  it("checks mutation origin and forwards only the verified user, preserving chat cursors", async () => {
    const f = setup();
    for (const path of ["shop/buy", "cosmetics/open", "cosmetics/equip", "cosmetics/trade", "chat"]) {
      expect((await f.run(`/api/de/${path}`, { method: "POST", headers: { Origin: "https://evil.test" }, body: "{}" })).status).toBe(403);
    }
    expect(f.forwarded).not.toHaveBeenCalled();
    const r = await f.run("/api/de/chat?after=42", { headers: { "x-de-user": "victim" } });
    expect(await r.json()).toEqual({ path: "/__de/chat", query: "?after=42", user: "real-user" });
  });
  it("serves public rarity metadata without forwarding or leaking account data", async () => {
    const f = setup(), r = await f.run("/api/de/card-rarities");
    expect(r.status).toBe(200); expect((await r.json() as any).labels.UR).toBe("Ultra Rare");
    expect(auth.verifySession).not.toHaveBeenCalled(); expect(f.forwarded).not.toHaveBeenCalled();
  });
});
