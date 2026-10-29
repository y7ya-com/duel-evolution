// Hostile-client checks (security-audit.md in the notes): every one sends what a modified client could, over the
// World's real framing, on channels bound to DE users (no DEV parity bridge).
import { afterEach, describe, expect, it, vi } from "vitest";
import { be32, harness } from "./notes-harness.ts";
import type { Session } from "../src/game/hub.ts";

afterEach(() => { vi.useRealTimers(); });

describe("the duel port's 0x6001", () => {
  it("never attaches a connection to another user's session", async () => {
    const h = harness({ players: {} }, { DEV: "0" });
    const alice = h.client("alice", "alice", "pw", "user-a"), mallory = h.client("mallory", "mallory", "pw", "user-m");
    await alice.account(0, "Alice"); await mallory.account(0, "Mallory");
    const pa = await alice.enterRoom(), pm = await mallory.enterRoom();
    expect(pa).not.toBeNull(); expect(pm).not.toBeNull();
    const sa = h.game.hub.byPid(pa!)!, sm = h.game.hub.byPid(pm!)!;
    const m = h.game.pvp!.reserve(sa, sm) as unknown as { c: [unknown, unknown] };
    const d = mallory.link(5760);
    d.send(0x6001, be32(pa!));                          // alice's pid, from mallory's WebSocket
    await h.tick(500);
    const conn = [...h.game.hub.sessions.values()].flatMap((s: Session) => [...s.conns.values()]).find((c) => c.peer === mallory.id && c.port === 5760);
    expect(conn?.sess ?? null).not.toBe(sa);
    expect(m.c[0]).toBeNull();                          // alice's seat in the match is not mallory's
    const own = alice.link(5760);
    own.send(0x6001, be32(pa!));                        // control: alice's own duel connection still takes her seat
    await h.tick(500);
    expect((m.c[0] as { peer?: string } | null)?.peer).toBe(alice.id);
  });
});

