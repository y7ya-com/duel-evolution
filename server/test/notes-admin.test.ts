// py yo2srv/admin/moderacion.py notes (07-10 sanciones 1:1: ban −246, the 0x3004 sanction bits, kick, 0x4700
// maintenance notice) -> src/game/admin.ts.
import { afterEach, describe, expect, it, vi } from "vitest";
import { harness, i32, u32 } from "./notes-harness.ts";

afterEach(() => { vi.useRealTimers(); });

describe("moderation (moderacion.py)", () => {
  it("07-10 (sanciones 1:1): a banned account gets 0x3004 −246 (4583 «Tienes una prohibición de ingreso») and the socket closes 1.5 s later", async () => {
    const h = harness();
    const A = h.client("A");
    await A.account(0, "Alice");
    const acct = Object.keys(h.state().accounts)[0];
    h.game.admin.ban(acct, "test");
    const a = A.link(5731);
    a.send(0x3001); await a.wait(0x3002);
    a.send(0x3003, A.key);
    const d = (await a.wait(0x3004))!;
    expect(i32(d)).toBe(-246);
    a.send(0x3010);
    await h.tick(1000);
    expect(a.closedByServer).toBe(false);
    expect(a.ids()).toEqual([0x3002, 0x3004]);             // nothing after the refusal
    await h.tick(1000);
    expect(a.closedByServer).toBe(true);
    h.game.admin.unban(acct);
    const b = A.link(5731);
    b.send(0x3003, A.key);
    expect(i32((await b.wait(0x3004))!)).toBe(0);
  });

  it("07-10: banning kicks the account's live connections", async () => {
    const h = harness();
    const A = h.client("A");
    await A.account(0, "Alice"); await A.enterRoom();
    h.game.admin.ban(h.game.hub.byPid(A.pid!)!.acct);
    await h.tick(100);
    expect(A.room!.closedByServer).toBe(true);
  });

  it("07-10: the sanction bits ride in 0x3004's 2nd u32 (0x20 chat -> 4581, 0x40 trade -> 4580); other bits never", async () => {
    const h = harness();
    const A = h.client("A");
    await A.account(0, "Alice");
    h.game.admin.setFlags(Object.keys(h.state().accounts)[0], 0x20 | 0x40 | 0x08);
    const a = A.link(5731);
    a.send(0x3003, A.key);
    const d = (await a.wait(0x3004))!;
    expect([i32(d), u32(d, 4)]).toEqual([0, 1 | 0x20 | 0x40]);
  });

  it("0x4700 MAINTENOTICE (s32 seconds left) goes to every session's lobby connection; negative -> 0", async () => {
    const h = harness();
    const A = h.client("A"), B = h.client("B");
    await A.account(0, "Alice"); await B.account(0, "Bob");
    await A.enterRoom(); await B.enterRoom();
    const n = A.room!.mark(), m = B.room!.mark();
    expect(h.game.admin.maintenance(600)).toBe(2);
    expect(i32((await A.room!.wait(0x4700, n))!)).toBe(600);
    expect(i32((await B.room!.wait(0x4700, m))!)).toBe(600);
    const k = A.room!.mark();
    h.game.admin.maintenance(-5);
    expect(i32((await A.room!.wait(0x4700, k))!)).toBe(0);
  });
});
