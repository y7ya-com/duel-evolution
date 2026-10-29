// Hostile-client checks (security-audit.md in the notes): every one sends what a modified client could, over the
// World's real framing, on channels bound to DE users (no DEV parity bridge).
import { afterEach, describe, expect, it, vi } from "vitest";
import { be32, harness, pack } from "./notes-harness.ts";
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

describe("trade", () => {
  it("an offer can't change once a player has confirmed: the other side gets what it agreed to", async () => {
    const h = harness({ players: {} }, { DEV: "0" });
    const a = h.client("alice", "alice", "pw", "user-a"), m = h.client("mallory", "mallory", "pw", "user-m");
    await a.account(0, "Alice"); await m.account(0, "Mallory");
    await a.enterRoom(); const pm = await m.enterRoom();
    const trunk = (acct: string) => h.state().accounts[acct].profiles["0"].trunk as Record<string, number>;
    const [x, y] = Object.keys(trunk("u:user-a")).map(Number);
    const t = (c: typeof a, sub: number, body: number[] = []) => c.room!.send(0x7000, [sub >> 8, sub & 0xff, ...body]);
    const u32 = (v: number) => [v >>> 24, (v >>> 16) & 0xff, (v >>> 8) & 0xff, v & 0xff];
    t(a, 0x7102, u32(pm!)); await h.tick(300);              // alice asks mallory
    t(m, 0x7105, u32(1)); await h.tick(300);                // mallory accepts
    for (const c of [a, m]) { t(c, 0x7132); t(c, 0x7101); } await h.tick(500);
    t(a, 0x7113, u32(x)); t(m, 0x7113, u32(y)); await h.tick(500);
    t(a, 0x7117); t(m, 0x7117); await h.tick(300);          // both ready
    t(a, 0x7119, [1]); await h.tick(300);                   // alice confirms x for y
    t(m, 0x7114, [0, 0]); await h.tick(300);                // mallory pulls y
    t(m, 0x7119, [1]); await h.tick(500);
    const ax = trunk("u:user-a")[String(x)], my = trunk("u:user-m")[String(y)];
    expect(ax === 3 || my === 2).toBe(true);                // the trade didn't happen, or happened as agreed
    expect(!(ax === 2 && my === 3)).toBe(true);             // never: alice gave x and mallory kept y
  });
});

describe("character churn", () => {
  it("a deleted and remade character stops getting start MP and a starter deck past the account's free starts", () => {
    PP.setProgression(true);
    try {
      const st: Record<string, any> = { players: {}, profiles: {} };
      for (let i = 0; i < PP.FREE_STARTS + 2; i++) {
        const p = PP.profile(st, 0)!;
        expect([p.rec.mp, p.starter ?? 0]).toEqual(i < PP.FREE_STARTS ? [PP.ECON.START_MP, 0] : [0, -1]);
        (st.profiles_borrados ??= []).push({ slot: "0", perfil: st.profiles["0"] }); delete st.profiles["0"];   // 0x3030
      }
    } finally { PP.setProgression(false); }
  });
});

describe("floods", () => {
  it("a connection that sends far faster than it is served is cut, not buffered without bound", async () => {
    const h = harness({ players: {} }, { DEV: "0" });
    const a = h.client("alice", "alice", "pw", "user-a");
    const l = a.link(5731);
    await h.tick(50);
    const one = pack(0x0005, new Uint8Array(0), 1);
    const burst = new Uint8Array(one.length * 5000);
    for (let i = 0; i < 5000; i++) burst.set(one, i * one.length);
    l.raw(burst);
    await h.tick(50);
    expect(l.closedByServer).toBe(true);
  });
});
