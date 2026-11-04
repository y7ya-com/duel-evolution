import { afterEach, describe, expect, it, vi } from "vitest";
vi.mock("cloudflare:workers", () => ({ DurableObject: class { constructor(readonly ctx: any, readonly env: any) {} } }));
vi.mock("../src/duel/boot.ts", () => ({ bootDuel: vi.fn(async () => {}) }));
import { WorldDO } from "../src/do.ts";
import { harness } from "./notes-harness.ts";
import * as PP from "../src/game/persist.ts";

afterEach(() => { vi.clearAllTimers(); vi.useRealTimers(); PP.setProgression(false); });
async function setup() {
  const h = harness({ players: {} }, { PROGRESSION: "1" });
  const a = h.client("Alice", "alice", "pw", "api-user");
  await a.account(0, "Alice"); await a.enterRoom();
  const acct = h.game.hub.acctOfUser("api-user");
  const st = h.state(); st.accounts[acct].profiles[0].rec.mp = 7000;
  h.game.store.saveRaw(st);
  const ctx = { blockConcurrencyWhile: () => Promise.resolve() };
  const resident = new WorldDO(ctx as any, {} as any);
  const internals = resident as any; internals.srv = h.srv;
  const flush = vi.fn(async () => {}); internals.sink = { flush };
  const call = (path: string, body?: unknown, user = "api-user") => resident.fetch(new Request(`https://world.test/__de/${path}`, {
    method: body === undefined ? "GET" : "POST", headers: user ? { "x-de-user": user } : {},
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  }));
  return { h, resident, internals, flush, call, profile: () => h.state().accounts[acct].profiles[0] };
}
describe("game feature Durable Object routing and persistence", () => {
  it("requires forwarded identity, unwraps room chat, and forwards query cursors", async () => {
    const f = await setup();
    expect((await f.call("cosmetics", undefined, "")).status).toBe(401);
    const sent = await f.call("chat", { channel: "global", text: "Room hello", requestId: "room-0001" });
    expect(sent.status).toBe(200); const message = await sent.json() as any;
    expect(message.text).toBe("Room hello");
    const next = await f.call(`chat?after=${message.id}`);
    expect((await next.json() as any).messages).toEqual([]);
  });
  it("awaits D1 before acknowledging a cosmetic payment and safely replays the result", async () => {
    const f = await setup(), info = await (await f.call("cosmetics")).json() as any;
    let release!: () => void;
    f.flush.mockImplementationOnce(() => new Promise<void>((resolve) => { release = resolve; }));
    let done = false;
    const body = { boxId: "hair", requestId: info.nextRequestId };
    const pending = f.call("cosmetics/open", body).then((r) => { done = true; return r; });
    for (let i = 0; i < 20 && !release; i++) await Promise.resolve();
    expect(release).toBeTypeOf("function"); expect(done).toBe(false);
    release(); const result = await pending;
    expect(result.status).toBe(200); const reward = await result.json() as any;
    expect(f.profile().rec.mp).toBe(6500);
    expect(PP.mpBalances(f.profile()).bound).toBe(5000);
    const replay = await (await f.call("cosmetics/open", body)).json() as any;
    expect(replay.reward.id).toBe(reward.reward.id);
    expect(f.profile().rec.mp).toBe(6500);
  });
  it("does not falsely acknowledge a failed persistence flush or accept malformed JSON", async () => {
    const f = await setup(); f.flush.mockRejectedValueOnce(new Error("D1 unavailable"));
    expect((await f.call("cosmetics")).status).toBe(503);
    const response = await f.resident.fetch(new Request("https://world.test/__de/cosmetics/open", {
      method: "POST", headers: { "x-de-user": "api-user" }, body: "not-json",
    }));
    expect(response.status).toBe(400); expect(f.profile().rec.mp).toBe(7000);
  });
});
