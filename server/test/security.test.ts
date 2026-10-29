// Hostile-client checks (security-audit.md in the notes): every one sends what a modified client could, over the
// World's real framing, on channels bound to DE users (no DEV parity bridge).
import { afterEach, describe, expect, it, vi } from "vitest";
import { be32, harness, pack } from "./notes-harness.ts";
import type { Session } from "../src/game/hub.ts";
import * as PP from "../src/game/persist.ts";
import SHOP from "../gamedata/shop.json";
import { makeDf, WHY_SURRENDER } from "../src/duel/duelfin.ts";
import { MAX_PEERS_PER_USER } from "../src/world.ts";
import { ipBucket } from "../src/auth/auth.ts";

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
        expect([p.rec.mp, p.starter ?? 0]).toEqual(i < PP.FREE_STARTS ? [PP.ECON.START_MP, 0] : [0, 0]); // past the cap: no MP, the starter claim kept
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

  it("a 1 MB frame of tiny messages costs one parse, not seconds (the singleton DO serves everyone)", async () => {
    const h = harness({ players: {} }, { DEV: "0" });
    const l = h.client("alice", "alice", "pw", "user-a").link(5731);
    await h.tick(50);
    const one = pack(0x0005, new Uint8Array(0), 1), n = Math.floor((1 << 20) / one.length);
    const frame = new Uint8Array(one.length * n);
    for (let i = 0; i < n; i++) frame.set(one, i * one.length);
    const t = performance.now();
    l.raw(frame);
    expect(performance.now() - t).toBeLessThan(250);
    await h.tick(50);
    expect(l.closedByServer).toBe(true);
  });
});

describe("0x4802 SELECTPACK / 0x4910 0x4915 GIFTCARDS", () => {
  it("give no cards without a PvP or NPC card due; a due card comes from the pack that was due", async () => {
    const h = harness({ players: {} }, { DEV: "0", PROGRESSION: "1" });
    try {
      const a = h.client("alice", "alice", "pw", "user-a");
      await a.account(0, "Alice");
      await a.enterRoom();
      const prof = () => h.state().accounts["u:user-a"].profiles["0"];
      const count = () => Object.values(prof().trunk as Record<string, number>).reduce((n, x) => n + x, 0);
      const before = count();
      for (const [mid, body] of [[0x4802, [0, 1]], [0x4802, [0xff, 0xff]], [0x4910, []], [0x4915, []]] as [number, number[]][]) {
        const n = a.room!.mark();
        a.room!.send(mid, body);
        expect(await a.room!.wait(0x4803, n)).not.toBeNull();
      }
      expect(count()).toBe(before);
      const st = h.state(); st.accounts["u:user-a"].profiles["0"].npc_card_due = [3]; h.game.store.saveRaw(st);
      const was = { ...prof().trunk } as Record<string, number>;
      const n = a.room!.mark();
      a.room!.send(0x4802, [0xff, 0xff]);                    // asks another pack than the one due
      await a.room!.wait(0x4803, n);
      const got = Object.keys(prof().trunk).filter((k) => prof().trunk[k] > (was[k] ?? 0)).map(Number);
      expect(got.length).toBe(1);
      expect((SHOP.iid as Record<string, number[]>)["3"]).toContain(got[0]);
    } finally { PP.setProgression(false); }
  });
});

describe("the shared lobby lists (mail, friends, black list)", () => {
  it("stay bounded however much one player sends", async () => {
    const h = harness({ players: {} }, { DEV: "0" });
    const a = h.client("alice", "alice", "pw", "user-a");
    await a.account(0, "Alice");
    await a.enterRoom();
    const body = (to: number) => [...be32(to), ...new Array(544).fill(0x41)];
    for (let i = 0; i < 1500; i++) {
      a.room!.send(0x4600, body(i % 3 ? 5000 + i : 1004));
      a.room!.send(0x4530, [...be32(9000 + i)]);
      if (i % 10 === 9) await h.tick(400);
    }
    await h.tick(2000);
    const lob = h.state().lobby;
    expect(a.room!.closedByServer).toBe(false);
    expect(lob.mail.length).toBeLessThanOrEqual(1000);
    expect(lob.mail.filter((m: { to: number }) => m.to === 1004).length).toBe(50);
    expect(lob.black.length).toBeLessThanOrEqual(200);
  }, 60_000);
});

describe("moderation", () => {
  it("a banned DE account can't log back in, and its chat and trade sanctions hold on the server", async () => {
    const h = harness({ players: {} }, { DEV: "0" });
    const a = h.client("alice", "alice", "pw", "user-a"), b = h.client("bob", "bob", "pw", "user-b");
    await a.account(0, "Alice"); await b.account(0, "Bob");
    await a.enterRoom(); const pb = await b.enterRoom();
    // sanctions: 0x20 chat, 0x40 trade (db/admin.ts)
    h.game.admin.setFlags("u:user-a", 0x60);
    let n = b.room!.mark();
    a.room!.send(0x4400, [0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, ...Array.from("hello all", (ch) => ch.charCodeAt(0)), 0]);
    await h.tick(500);
    expect(b.room!.all(0x4402, n)).toEqual([]);
    n = b.room!.mark();
    a.room!.send(0x7000, [0x71, 0x02, ...be32(pb!)]);
    await h.tick(500);
    expect(b.room!.all(0x7104, n)).toEqual([]);
    h.game.admin.ban("u:user-a", "test");
    await h.tick(2000);
    const l = a.link(5731);
    l.send(0x3001); await l.wait(0x3002);
    l.send(0x3003, a.key);
    const r = await l.wait(0x3004);
    expect(r && new DataView(r.buffer, r.byteOffset).getInt32(0)).toBe(-246);
  });
});

describe("NPC duel results", () => {
  it("one result per NPC duel begun; a surrender gives no NPC card", async () => {
    const h = harness({ players: {} }, { DEV: "0", PROGRESSION: "1" });
    try {
      const a = h.client("alice", "alice", "pw", "user-a");
      await a.account(0, "Alice");
      await a.enterRoom();
      const g = h.game, s = [...g.hub.sessions.values()][0];
      const sink = { send() {}, closed: false } as unknown as import("../src/net/conn.ts").Conn;
      const df = makeDf(g, () => sink);
      const prof = () => h.state().accounts["u:user-a"].profiles["0"];
      g.withCtx(s, () => {
        df.h_autoduelstart(1, 0);
        expect(df.finish(sink, 1, WHY_SURRENDER)).toBe(true);
        expect(df.finish(sink, 1, WHY_SURRENDER)).toBe(false);   // the dialog again: nothing more
        expect(df.finish(sink, 0, "lp", 9)).toBe(false);         // nor a late finish
      });
      expect([prof().rec.duels ?? 0, prof().npc_card_due ?? []]).toEqual([0, []]);   // no_record; no card for giving up
      expect(PP.npcbinGet(prof(), 1)[1]).toBe(1);   // NPCBIN b1, losses: one against NPC 1
      g.withCtx(s, () => { df.h_autoduelstart(1, 0); expect(df.finish(sink, 0, "lp", 6)).toBe(true); });   // the player wins
      expect(prof().npc_card_due.length).toBe(1);                // a duel played to its end: the card
      expect(prof().rec.mp).toBe(PP.ECON.START_MP + PP.ECON.NPC_LOSS + PP.ECON.NPC_WIN + PP.ECON.FIRST_WIN);   // NPC MP is paid
    } finally { PP.setProgression(false); }
  });
});

describe("PvP spectators", () => {
  it("a player of the match can't watch it (the stream is player 0's own view)", async () => {
    const h = harness({ players: {} }, { DEV: "0" });
    const [a, b, c] = ["alice", "bob", "carol"].map((n) => h.client(n, n, "pw", `user-${n}`));
    for (const x of [a, b, c]) { await x.account(0, x.name); await x.enterRoom(); }
    const [sa, sb, sc] = [a, b, c].map((x) => h.game.hub.byPid(x.pid!)!);
    h.game.pvp!.reserve(sa, sb);
    expect(h.game.pvp!.watchRequest(b.id, a.pid!, sb)).toBeNull();
    expect(h.game.pvp!.watchRequest(a.id, b.pid!, sa)).toBeNull();
    expect(h.game.pvp!.watchRequest(c.id, a.pid!, sc)).not.toBeNull();
  });
});

describe("connections per user", () => {
  it("a DE user holds at most MAX_PEERS_PER_USER game WebSockets; a closed one frees its place", () => {
    const h = harness({ players: {} }, { DEV: "0" });
    const w = h.srv.world, nop = () => true;
    for (let i = 0; i < MAX_PEERS_PER_USER; i++) { expect(w.canOpen("user-a")).toBe(true); w.openPeer(`p${i}`, "user-a", nop, nop); }
    expect(w.canOpen("user-a")).toBe(false);
    expect(w.canOpen("user-b")).toBe(true);
    w.closePeer("p0");
    expect(w.canOpen("user-a")).toBe(true);
  });
});

describe("per-IP rate limits", () => {
  it("count an IPv6 caller by its /64 (rotating inside it gets nothing), IPv4 by its address", () => {
    expect(ipBucket("2001:db8:aa:bb:1:2:3:4")).toBe("2001:db8:aa:bb::/64");
    expect(ipBucket("2001:0db8:00aa:00bb::ffff")).toBe("2001:db8:aa:bb::/64");
    expect(ipBucket("2001:db8::1")).toBe("2001:db8:0:0::/64");
    expect(ipBucket("2001:DB8::")).toBe(ipBucket("2001:db8:0:0:9::1"));
    expect(ipBucket("203.0.113.7")).toBe("203.0.113.7");
  });
});

describe("economy caps", () => {
  it("are per account: another character's (or a deleted one's) duels today count toward the pair cap, first win and soft cap", async () => {
    const h = harness({ players: {} }, { DEV: "0", PROGRESSION: "1" });
    try {
      const a = h.client("alice", "alice", "pw", "user-a");
      await a.account(0, "Alice");
      await a.enterRoom();
      const g = h.game, s = [...g.hub.sessions.values()][0];
      const day = new Date(g.clock.time() * 1000).toISOString().slice(0, 10);
      const st = h.state(), acct = st.accounts["u:user-a"];
      acct.profiles["1"] = { ...PP.blankProfile("Alt"), econ: { day, duels: 30, wins: 1, pairs: { "u:user-b": 3 }, earned: 0, spent: 0, packs: 0 } };
      acct.profiles_borrados = [{ slot: "2", perfil: { econ: { day, duels: 10, wins: 0, pairs: { "u:user-b": 2 } } } }];
      g.store.saveRaw(st);
      const pay = (result: string, pvp: { opp: string; secs: number } | null) => g.withCtx(s, () => {
        const v = g.loadState(), p = PP.profile(v, PP.activeSlot(v))!;
        const mp = PP.mpReward(g, p, result, 5, pvp);
        g.saveState(v);
        return mp;
      });
      expect(pay("win", { opp: "u:user-b", secs: 300 })).toBe(0);                          // 3 + 2 = the pair's 5 today
      expect(pay("win", null)).toBe(Math.floor(PP.ECON.NPC_WIN * PP.ECON.SOFT_RATE));       // 40 duels today: soft cap, no first-win bonus
    } finally { PP.setProgression(false); }
  });
});

describe("character names", () => {
  it("a new name is unique across all accounts, ignoring case; names from before stay", async () => {
    const h = harness({ players: {}, accounts: {
      "u:user-x": { idx: 1, players: { "0": "Dup" }, profiles: {}, active_slot: 0, user_id: "user-x" },
      "u:user-y": { idx: 2, players: { "0": "Dup" }, profiles: {}, active_slot: 0, user_id: "user-y" } } }, { DEV: "0" });
    const create = async (who: ReturnType<typeof h.client>, slot: number, name: string) => {
      const l = who.link(5731);
      l.send(0x3001); await l.wait(0x3002);
      l.send(0x3003, who.key); await l.wait(0x3004);
      const n = l.mark();
      l.send(0x3020, [slot, ...Array.from(name.padEnd(16, "\0"), (ch) => ch.charCodeAt(0)), 0]);
      const r = await l.wait(0x3022, n);
      l.send(0x0003); await h.tick(400); l.close(); await h.tick(10);   // goodbye: the next login isn't "in use"
      return r ? new DataView(r.buffer, r.byteOffset).getInt32(0) : null;
    };
    const a = h.client("alice", "alice", "pw", "user-a"), b = h.client("bob", "bob", "pw", "user-b"), y = h.client("y", "y", "pw", "user-y");
    expect(await create(a, 0, "Alice")).toBe(0);
    expect(await create(b, 0, "aLiCe")).toBe(-260);                  // taken, whatever the case
    expect(await create(b, 1, "DUP")).toBe(-260);
    expect(await create(b, 0, "Bob")).toBe(0);
    expect(await create(y, 0, "Dup")).toBe(0);                     // a grandfathered duplicate keeps its own name
    expect(await create(a, 1, "Alice")).toBe(-260);                  // one's own other slot counts too
    expect(await create(a, 2, "   ")).toBe(-262);                    // empty: "incompatible characters"
    expect(Object.values(h.state().accounts["u:user-b"].players)).toEqual(["Bob"]);
  });
});

describe("avatar parts (0x4170)", () => {
  it("an item the character doesn't own is neither kept nor shown to others; owned, it goes through", async () => {
    const h = harness({ players: {} }, { DEV: "0" });
    const a = h.client("alice", "alice", "pw", "user-a"), b = h.client("bob", "bob", "pw", "user-b");
    await a.account(0, "Alice"); await b.account(0, "Bob");
    await a.enterRoom(); await b.enterRoom();
    const parts = Uint8Array.from([0, 0x00, 0x20, 0x30, 0x40, 0x60, 0x78, 0x90, 0xb0, 0x20, 0, 0, 0, 0, 0, 0]);   // clothes 0x78: PBIN 120, a present
    const wear = async () => {
      const n = a.room!.mark(), nb = b.room!.mark();
      a.room!.send(0x4170, [...be32(0), ...parts, 0, 0, 0, 0]);
      const r = await a.room!.wait(0x4171, n);
      await h.tick(200);
      return [r && r[3], b.room!.all(0x4181, nb).length];
    };
    expect(await wear()).toEqual([0, 0]);                         // answered, but not kept nor shown
    expect(h.state().accounts["u:user-a"].profiles["0"].avatar?.a).not.toBe(Buffer.from(parts).toString("hex"));
    const st = h.state(); st.accounts["u:user-a"].profiles["0"].pbin.push(120); h.game.store.saveRaw(st);
    expect(await wear()).toEqual([0, 1]);
    expect(h.state().accounts["u:user-a"].profiles["0"].avatar.a).toBe(Buffer.from(parts).toString("hex"));
  });
});
