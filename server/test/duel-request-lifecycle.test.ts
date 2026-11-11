import { afterEach, expect, it, vi } from "vitest";
import type { PvpMatch } from "../src/duel/pvpMatch.ts";
import { harness, be32, cat, i32 } from "./notes-harness.ts";
afterEach(() => vi.useRealTimers());
async function fixture() {
  const h = harness();
  const A = h.client("A", "A", "pw", "user-a"), B = h.client("B", "B", "pw", "user-b");
  await A.account(0, "Alice"); await B.account(0, "Bob");
  await A.enterRoom(); await B.enterRoom();
  const lp = h.game.lp, [, out] = lp.duelInvite("user-a", B.pid!), rid = out.room as number;
  const na = A.room!.mark(), nb = B.room!.mark();
  const ask = () => A.room!.send(0x4300, cat(be32(rid), new Uint8Array(16)));
  ask(); expect(await B.room!.wait(0x4302, nb)).not.toBeNull();
  return { h, A, B, lp, rid, na, nb, ask };
}
for (const action of ["decline", "timeout", "disconnect", "leave", "requester-leave", "busy", "ranked", "cancel"] as const) {
  it(`direct request resolves exactly once and cleans up: ${action}`, async () => {
    const { h, A, B, lp, rid, na, nb } = await fixture();
    const b = h.game.hub.byPid(B.pid!)!, a = h.game.hub.byPid(A.pid!)!;
    switch (action) {
      case "decline": B.room!.send(0x4303, be32(0)); break;
      case "timeout": await h.tick(31_000); break;
      case "disconnect": B.room!.close(); break;
      case "leave": h.game.hub.leave(b); break;
      case "requester-leave": h.game.hub.leave(a); break;
      case "busy": h.game.hub.setState(b, 100); break;
      case "ranked": h.game.hub.setState(b, 0x66); break;
      case "cancel": A.room!.send(0x4304); break;
    }
    const mid = action === "cancel" ? 0x4309 : 0x4301;
    const d = await A.room!.wait(mid, na);
    expect(d && i32(d)).toBe(action === "decline" ? -618 : action === "timeout" ? -616 : action === "cancel" ? 0 : -600);
    expect(lp.mem.challenges.size).toBe(0); expect(lp.mem.invites.size).toBe(0); expect(lp.mem.rooms.has(rid)).toBe(false);
    if (action !== "disconnect" && action !== "decline") expect(await B.room!.wait(action === "timeout" ? 0x4308 : 0x4305, nb)).not.toBeNull();
    if (action !== "disconnect") B.room!.send(0x4303, be32(1));
    await h.tick(41_000);
    expect(A.room!.all(mid, na)).toHaveLength(1); expect(A.room!.all(0x4306, na)).toHaveLength(0);
  });
}
it("duplicate request keeps its original deadline and produces only one popup", async () => {
  const { h, A, B, na, nb, ask } = await fixture();
  await h.tick(20_000); ask(); await h.tick(11_000);
  expect(B.room!.all(0x4302, nb)).toHaveLength(1);
  expect(A.room!.all(0x4301, na).map(d => i32(d))).toEqual([-616]);
});
it("crossed invites are refused; the first invite can still be declined", async () => {
  const { lp, A, B, na } = await fixture();
  expect(lp.duelInvite("user-b", A.pid!)[0]).toBe(409);
  B.room!.send(0x4303, be32(0));
  expect(i32((await A.room!.wait(0x4301, na))!)).toBe(-618);
});
it("busy target refuses a new invite without creating a wait", async () => {
  const { h, A, B, lp, na } = await fixture();
  h.game.hub.setState(h.game.hub.byPid(B.pid!)!, 0x66); await A.room!.wait(0x4301, na);
  expect(lp.duelInvite("user-a", B.pid!)[0]).toBe(409); expect(lp.mem.challenges.size).toBe(0);
});
it("same-network direct invite accepts and stays unranked", async () => {
  const { h, A, B, lp, na, nb } = await fixture();
  h.game.hub.byPid(A.pid!)!.ipbs = ["shared"]; h.game.hub.byPid(B.pid!)!.ipbs = ["shared"];
  B.room!.send(0x4303, be32(1));
  expect(i32((await A.room!.wait(0x4301, na))!)).toBe(0);
  expect(await A.room!.wait(0x4306, na)).not.toBeNull(); expect(await B.room!.wait(0x4306, nb)).not.toBeNull();
  expect((h.game.pvp!.byPid(A.pid!) as PvpMatch).origin).toBe("invite"); expect((h.game.pvp!.byPid(A.pid!) as PvpMatch).ranked).toBe(false);
  expect(lp.mem.challenges.size + lp.mem.invites.size).toBe(0);
  await h.tick(41_000); expect(A.room!.all(0x4301, na)).toHaveLength(1);
});
it("accept cannot replace a duel reserved while an offer was open", async () => {
  const { h, A, B, lp, na } = await fixture();
  const C = h.client("C"); await C.account(0, "Carol"); await C.enterRoom();
  const m = h.game.pvp!.reserve(h.game.hub.byPid(B.pid!)!, h.game.hub.byPid(C.pid!)!, "room");
  B.room!.send(0x4303, be32(1));
  expect(i32((await A.room!.wait(0x4301, na))!)).toBe(-600);
  expect(h.game.pvp!.byPid(B.pid!)).toBe(m); expect(h.game.pvp!.byPid(A.pid!)).toBeNull();
  expect(lp.mem.challenges.size + lp.mem.invites.size).toBe(0);
});
it("crossed native room challenges allow only the first popup", async () => {
  const h = harness(), A = h.client("A"), B = h.client("B");
  await A.account(0, "Alice"); await B.account(0, "Bob"); await A.enterRoom(); await B.enterRoom();
  const lp = h.game.lp;
  for (const X of [A, B]) {
    const n = X.room!.mark(), data = new Uint8Array(28); data[0] = 3;
    X.room!.send(0x4288, data); await X.room!.wait(0x428a, n);
  }
  const ra = [...lp.mem.rooms.values()].find(r => r.p1 === A.pid)!, rb = [...lp.mem.rooms.values()].find(r => r.p1 === B.pid)!;
  const na = A.room!.mark(), nb = B.room!.mark();
  A.room!.send(0x4300, cat(be32(rb.id), new Uint8Array(16)));
  await B.room!.wait(0x4302, nb);
  B.room!.send(0x4300, cat(be32(ra.id), new Uint8Array(16)));
  expect(i32((await B.room!.wait(0x4301, nb))!)).toBe(-492);
  expect(A.room!.all(0x4302, na)).toHaveLength(0); expect(lp.mem.challenges.size).toBe(1);
  B.room!.send(0x4303, be32(0)); expect(i32((await A.room!.wait(0x4301, na))!)).toBe(-618);
});
it("target becomes busy before 0x4300: missing private room returns the engine's room-gone code", async () => {
  const h = harness(), A = h.client("A", "A", "pw", "user-a"), B = h.client("B", "B", "pw", "user-b");
  await A.account(0, "Alice"); await B.account(0, "Bob"); await A.enterRoom(); await B.enterRoom();
  const lp = h.game.lp, [, out] = lp.duelInvite("user-a", B.pid!);
  h.game.hub.setState(h.game.hub.byPid(B.pid!)!, 0x66);
  const n = A.room!.mark(); A.room!.send(0x4300, cat(be32(out.room as number), new Uint8Array(16)));
  expect(i32((await A.room!.wait(0x4301, n))!)).toBe(-495);
  expect(lp.mem.challenges.size + lp.mem.invites.size).toBe(0);
});
