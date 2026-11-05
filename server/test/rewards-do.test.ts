import { afterEach, expect, it, vi } from "vitest";
vi.mock("cloudflare:workers", () => ({ DurableObject: class { constructor(readonly ctx: any, readonly env: any) {} } }));
vi.mock("../src/duel/boot.ts", () => ({ bootDuel: vi.fn(async () => {}) }));
import { WorldDO } from "../src/do.ts";
import { harness } from "./notes-harness.ts";
import * as PP from "../src/game/persist.ts";
import { REWARDS, rewardEvent } from "../src/game/rewards.ts";
afterEach(() => { PP.setProgression(false); REWARDS.enabled = false; });
it("rewards HTTP authenticates, validates, flushes and replays a claim after acknowledgement loss", async () => {
  REWARDS.enabled = true;
  const h = harness({ players: {} }, { PROGRESSION: "1" });
  const a = h.client("Alice", "alice", "pw", "reward-http"); await a.account(0, "Alice"); await a.enterRoom();
  const acct = h.game.hub.acctOfUser("reward-http"), session = h.game.hub.sessions.get(acct)!;
  h.game.withCtx(session, () => { const st = h.game.loadState(); rewardEvent(h.game, PP.profile(st, 0)!, "shop"); h.game.saveState(st); });
  const resident = new WorldDO({ blockConcurrencyWhile: () => Promise.resolve() } as any, {} as any);
  const internal = resident as any; internal.srv = h.srv; internal.sink = { flush: vi.fn(async () => {}) };
  PP.setProgression(true);
  const call = (path: string, body?: unknown, user = "reward-http") => resident.fetch(new Request(`https://x/__de/rewards${path}`, {
    headers: user ? { "x-de-user": user } : {}, method: body ? "POST" : "GET", ...(body ? { body: JSON.stringify(body) } : {}),
  }));
  expect((await call("", undefined, "")).status).toBe(401);
  const view = await (await call("")).json() as any;
  expect(view.missions.find((m: any) => m.id === "first:shop").claimable).toBe(true);
  expect(view.login.calendar[9].mp).toBe(100);
  const body = { id: "first:shop", requestId: view.nextRequestId };
  internal.sink.flush.mockRejectedValueOnce(new Error("lost acknowledgement"));
  expect((await call("/claim", body)).status).toBe(503);
  const replay = await (await call("/claim", body)).json() as any;
  expect(replay).toMatchObject({ replayed: true, grant: { mp: 1000 } });
  expect((await call("/claim", { id: "bad" })).status).toBe(400);
  expect(internal.sink.flush).toHaveBeenCalled();
});
