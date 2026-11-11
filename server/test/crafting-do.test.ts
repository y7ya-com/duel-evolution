import { afterEach, expect, it, vi } from "vitest";
vi.mock("cloudflare:workers", () => ({ DurableObject: class { constructor(readonly ctx: any, readonly env: any) {} } }));
vi.mock("../src/duel/boot.ts", () => ({ bootDuel: vi.fn(async () => {}) }));
import { WorldDO } from "../src/do.ts";
import { harness } from "./notes-harness.ts";
import * as PP from "../src/game/persist.ts";
import { cardRarityCatalog } from "../src/game/card-rarity.ts";
afterEach(() => PP.setProgression(false));
it("craft HTTP reads actual D1 saved decks, protects their counts, and flushes an atomic mutation", async () => {
  const h = harness({ players: {} }, { PROGRESSION: "1" });
  const a = h.client("Alice", "alice", "pw", "craft-http");
  await a.account(0, "Alice"); await a.enterRoom();
  const acct = h.game.hub.acctOfUser("craft-http");
  const pc = Number(Object.keys(cardRarityCatalog().byPasscode as object)[0]);
  const st = h.state(); Object.assign(st.accounts[acct].profiles[0], { trunk: { [pc]: 8 }, bound: {}, shards: 1000 }); h.game.store.saveRaw(st);
  const bind = vi.fn();
  const db = { prepare: vi.fn(() => ({ bind: (...args: any[]) => { bind(...args); return { all: async () => ({ results: [{ main: JSON.stringify([pc, pc]), side: JSON.stringify([pc]), extra: JSON.stringify([pc]) }] }) }; } })) };
  const resident = new WorldDO({ blockConcurrencyWhile: () => Promise.resolve() } as any, { DB: db } as any);
  const internal = resident as any; internal.srv = h.srv; internal.sink = { flush: vi.fn(async () => {}) };
  const call = (path: string, body?: unknown, user = "craft-http") => resident.fetch(new Request(`https://x/__de/craft${path}`, {
    headers: user ? { "x-de-user": user } : {}, method: body ? "POST" : "GET", ...(body ? { body: JSON.stringify(body) } : {}),
  }));
  expect((await call("", undefined, "")).status).toBe(401);
  const view = await (await call("")).json() as any;
  expect(bind).toHaveBeenCalledWith(`${acct}/0`); expect(view.cards[pc].inDecks).toBe(4);
  const preview = await (await call("/dismantle-extras", { keep: 1, preview: true, requestId: view.nextRequestId })).json() as any;
  expect(preview.changes[pc]).toBe(4); expect(preview.nextRequestId).toBe(view.nextRequestId);
  const done = await call("/dismantle-extras", { keep: 1, requestId: view.nextRequestId }); expect(done.status).toBe(200);
  expect(h.state().accounts[acct].profiles[0].trunk[pc]).toBe(4); expect(internal.sink.flush).toHaveBeenCalled();
});
