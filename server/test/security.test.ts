// Hostile-client checks (security-audit.md in the notes): every one sends what a modified client could, over the
// World's real framing, on channels bound to DE users (no DEV parity bridge).
import { afterEach, describe, expect, it, vi } from "vitest";
import { be32, harness } from "./notes-harness.ts";
import type { Session } from "../src/game/hub.ts";
import * as PP from "../src/game/persist.ts";

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

describe("0x5400 SD_GET (a structure deck by its right)", () => {
  it("gives nothing without the deck's right, and sets no PBIN bit the client names", async () => {
    const h = harness({ players: {} }, { DEV: "0", PROGRESSION: "1" });
    try {
      const a = h.client("alice", "alice", "pw", "user-a");
      await a.account(0, "Alice");
      await a.enterRoom();
      const prof = () => h.state().accounts["u:user-a"].profiles["0"];
      const before = JSON.stringify(prof().trunk);
      for (const [deck, bit] of [[7001, 768], [10001, 999], [8004, 0]]) {
        const n = a.room!.mark();
        a.room!.send(0x5400, [deck >> 8, deck & 0xff, bit >> 8, bit & 0xff]);
        const r = await a.room!.wait(0x5401, n);
        expect(r && r[3]).toBe(1);                      // u32 1: refused
      }
      expect(JSON.stringify(prof().trunk)).toBe(before);
      expect(prof().pbin).not.toContain(1000);          // 999 + 1
      const st = h.state(); st.accounts["u:user-a"].profiles["0"].pbin.push(768); h.game.store.saveRaw(st);
      for (const want of [0, 1]) {                       // control: the held right gives deck 7001 once
        const n = a.room!.mark();
        a.room!.send(0x5400, [7001 >> 8, 7001 & 0xff, 768 >> 8, 768 & 0xff]);
        expect((await a.room!.wait(0x5401, n))![3]).toBe(want);
      }
    } finally { PP.setProgression(false); }
  });
});
