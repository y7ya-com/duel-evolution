// research/equipos, research/intercambio, research/torneos: their protocol summaries (C = seen in the client) as cases
// -> src/game/teams.ts, trade.ts, tournaments.ts. These modules carry no dated/ID notes of their own; the cases below
// are the client-visible points of each docstring.
import { afterEach, describe, expect, it, vi } from "vitest";
import { harness, be32, cat, cstr, i32, pairs, pc, str, u32, type Client, type Harness } from "./notes-harness.ts";

afterEach(() => { vi.useRealTimers(); });

async function players(h: Harness, n: number): Promise<Client[]> {
  const cs = Array.from({ length: n }, (_, i) => h.client(`P${i}`));
  for (const [i, c] of cs.entries()) await c.account(0, `Player${i}`);
  for (const c of cs) await c.enterRoom();
  return cs;
}
const ask = async (X: Client, mid: number, data: ArrayLike<number>, reply: number) => {
  const n = X.room!.mark(); X.room!.send(mid, data); return (await X.room!.wait(reply, n))!;
};

describe("teams (research/equipos)", () => {
  it("0x4550 TEAMCREATE -> 0x4551 code (0 ok, 1 name taken — case-insensitive, 4 bad name) + 0x4566 (ends the wait)", async () => {
    const h = harness();
    const [A, B] = await players(h, 2);
    let n = A.room!.mark(); A.room!.send(0x4550, str("Dragones", 16));
    expect(i32((await A.room!.wait(0x4551, n))!)).toBe(0);
    expect(await A.room!.wait(0x4566, n)).not.toBeNull();
    expect(i32(await ask(B, 0x4550, str("dragones", 16), 0x4551))).toBe(1);
    expect(i32(await ask(B, 0x4550, str("", 16), 0x4551))).toBe(4);
    n = A.room!.mark(); A.room!.send(0x4550, str("Otro", 16));
    expect(i32((await A.room!.wait(0x4551, n))!)).toBe(1);           // already in a team
  });

  it("0x4558 TEAMLIST -> 0x4564 (s32 members, u32 team, name16, flag16) + 0x4559 (u32 pid, name16, u8 authority: leader 0x0e) + 0x4565", async () => {
    const h = harness();
    const [A] = await players(h, 1);
    await ask(A, 0x4550, str("Dragones", 16), 0x4566);
    const n = A.room!.mark(); A.room!.send(0x4558); await A.room!.wait(0x4565, n);
    const hd = A.room!.all(0x4564, n)[0], ms = A.room!.all(0x4559, n)[0];
    expect([hd.length, i32(hd), cstr(hd.subarray(8, 24))]).toEqual([40, 1, "Dragones"]);
    expect([u32(ms), cstr(ms.subarray(4, 20)), ms[20]]).toEqual([A.pid, "Player0", 0x0e]);
  });

  it("invite: 0x4554 -> the invitee gets 0x4567 (inviter pid, his name, team, team name); 0x4568 yes -> 0x4561 to the members", async () => {
    const h = harness();
    const [A, B] = await players(h, 2);
    await ask(A, 0x4550, str("Dragones", 16), 0x4566);
    const m = B.room!.mark();
    A.room!.send(0x4554, be32(B.pid!));
    const inv = (await B.room!.wait(0x4567, m))!;
    const tid = u32(inv, 20);
    expect([u32(inv), cstr(inv.subarray(4, 20)), cstr(inv.subarray(24, 40))]).toEqual([A.pid, "Player0", "Dragones"]);
    const n = A.room!.mark();
    B.room!.send(0x4568, cat(be32(1), be32(u32(inv)), be32(tid)));
    const note = (await A.room!.wait(0x4561, n))!;
    expect([u32(note), u32(note, 4), cstr(note.subarray(8, 24))]).toEqual([tid, B.pid, "Player1"]);
  });

  it("LIST5 / 0x3112 carry the real team (u32 team, name16, flag16); team chat (0x4400 kind 5) reaches the members", async () => {
    const h = harness();
    const [A, B, C] = await players(h, 3);
    await ask(A, 0x4550, str("Dragones", 16), 0x4566);
    const m = B.room!.mark(); A.room!.send(0x4554, be32(B.pid!));
    const inv = (await B.room!.wait(0x4567, m))!;
    B.room!.send(0x4568, cat(be32(1), be32(u32(inv)), be32(u32(inv, 20))));
    await h.tick(1000);
    let n = C.room!.mark(); C.room!.send(0x4220, be32(0xffffffff)); await C.room!.wait(0x4224, n);
    const l5 = cat(...C.room!.all(0x4223, n));
    const ents = Array.from({ length: l5.length / 40 }, (_, i) => [u32(l5, 40 * i), cstr(l5.subarray(40 * i + 8, 40 * i + 24))]);
    expect(ents).toContainEqual([A.pid, "Dragones"]);
    const k = C.room!.mark(); n = B.room!.mark();
    A.room!.send(0x4400, cat([0, 5], be32(0), be32(0), be32(0), str("hey", 3), [0]));
    expect(await B.room!.wait(0x4402, n)).not.toBeNull();
    await h.tick(1000);
    expect(C.room!.all(0x4402, k)).toEqual([]);
  });

  it("0x4552 TEAMDISBAND: the leader gets 0x4553 s32 0, the members 0x4560 u32 team; a non-leader 0x4553 = 1", async () => {
    const h = harness();
    const [A, B] = await players(h, 2);
    await ask(A, 0x4550, str("Dragones", 16), 0x4566);
    const m = B.room!.mark(); A.room!.send(0x4554, be32(B.pid!));
    const inv = (await B.room!.wait(0x4567, m))!;
    B.room!.send(0x4568, cat(be32(1), be32(u32(inv)), be32(u32(inv, 20))));
    await h.tick(1000);
    expect(i32(await ask(B, 0x4552, [], 0x4553))).toBe(1);
    const k = B.room!.mark();
    expect(i32(await ask(A, 0x4552, [], 0x4553))).toBe(0);
    expect(u32((await B.room!.wait(0x4560, k))!)).toBe(u32(inv, 20));
  });
});

describe("trade (research/intercambio)", () => {
  const t = (sub: number, body: ArrayLike<number> = []) => cat([sub >> 8, sub & 0xff], body);

  it("REQTRADE to someone not online -> 0x7103 s32 −493 «No se pudo enviar» (its only error value)", async () => {
    const h = harness();
    const [A] = await players(h, 1);
    expect(i32(await ask(A, 0x7000, t(0x7102, be32(4321)), 0x7103))).toBe(-493);
  });

  /** A whole trade between A and B with these trunks: each offers its cards, both ready and confirm. Returns the
   *  0x7121 result (1 done, 0 failed), the chat lines A got after it, and both trunks. */
  async function trade(trunkA: Record<string, number>, trunkB: Record<string, number>, giveA: number[], giveB: number[],
    boundA: Record<string, number> = {}) {
    const h = harness();
    const [A, B] = await players(h, 2);
    const setTrunk = (i: number, trunk: Record<string, number>) => {
      const st = h.state(); (Object.values(st.accounts) as any[]).find((a) => a.idx === i + 1).profiles["0"].trunk = trunk; h.game.store.saveRaw(st);
    };
    setTrunk(0, trunkA); setTrunk(1, trunkB);
    { const st = h.state(); (Object.values(st.accounts) as any[]).find((a) => a.idx === 1).profiles["0"].bound = boundA; h.game.store.saveRaw(st); }
    let m = B.room!.mark();
    expect(i32(await ask(A, 0x7000, t(0x7102, be32(B.pid!)), 0x7103))).toBe(0);
    const off = (await B.room!.wait(0x7104, m))!;
    expect([u32(off), cstr(off.subarray(4, 20))]).toEqual([A.pid, "Player0"]);
    let n = A.room!.mark();
    B.room!.send(0x7000, t(0x7105, be32(1)));
    expect(i32((await A.room!.wait(0x7105, n, undefined, 3000))!)).toBe(0);
    for (const X of [A, B]) {
      const k = X.room!.mark(); X.room!.send(0x7000, t(0x7132)); await X.room!.wait(0x7131, k);
      const j = X.room!.mark(); X.room!.send(0x7000, t(0x7101)); await X.room!.wait(0x7133, j);
    }
    for (const [X, Y, give] of [[A, B, giveA], [B, A, giveB]] as const)
      for (const card of give) {
        const k = Y.room!.mark();
        X.room!.send(0x7000, t(0x7113, be32(card)));   // u16 sub + u32 passcode
        const mv = (await Y.room!.wait(0x7116, k))!;
        expect([u32(mv), mv[4]]).toEqual([card, 0]);   // u32 value + u8 op
        Y.room!.send(0x7000, t(0x7122));
      }
    n = A.room!.mark(); m = B.room!.mark();
    A.room!.send(0x7000, t(0x7117, [0])); B.room!.send(0x7000, t(0x7117, [0]));
    expect(await A.room!.wait(0x7118, n)).not.toBeNull();
    const list = (cs: number[]) => [...cs.map((c) => be32(c)), ...new Array(10 - cs.length).fill(be32(-1))];
    const conf = (mine: number[], theirs: number[]) => cat([1], ...list(mine), ...list(theirs));
    A.room!.send(0x7000, t(0x7119, conf(giveA, giveB))); B.room!.send(0x7000, t(0x7119, conf(giveB, giveA)));
    const end = (await A.room!.wait(0x7121, n))!;
    await h.tick(300);
    expect(A.room!.all(0x7120, n)[0][0]).toBe(3);
    const tr = (i: number) => (Object.values(h.state().accounts) as any[]).find((a) => a.idx === i + 1).profiles["0"].trunk;
    const chat = A.room!.all(0x4402, n).map((d) => cstr(d.subarray(26)));
    return { end: end[0], chat, a: tr(0), b: tr(1) };
  }

  it("the whole trade: offer 0x7104, accept 0x7105, trunk 0x7125 + 0x7126 + 0x7127, cards, ready 0x7118, confirm -> 0x7120 3 + 0x7121 1 and the cards move (both keep 40)", async () => {
    const r = await trade({ [pc(1)]: 1, [pc(3)]: 39 }, { [pc(2)]: 1, [pc(4)]: 39 }, [pc(1)], [pc(2)]);
    expect([r.end, r.a, r.b]).toEqual([1, { [pc(2)]: 1, [pc(3)]: 39 }, { [pc(1)]: 1, [pc(4)]: 39 }]);
  });

  it("a swap that leaves either side with fewer than 40 cards fails (0x7121 0), no card moves, and the chat says why", async () => {
    const A0 = { [pc(1)]: 2, [pc(3)]: 38 }, B0 = { [pc(2)]: 2, [pc(4)]: 38 };
    const r1 = await trade(A0, B0, [pc(1), pc(1)], [pc(2)]);          // A would keep 39
    expect([r1.end, r1.a, r1.b]).toEqual([0, A0, B0]);
    expect(r1.chat).toEqual(["Trade cancelled: you must keep at least 40 cards."]);
    const r2 = await trade(A0, B0, [pc(1)], [pc(2), pc(2)]);          // B would keep 39
    expect([r2.end, r2.a, r2.b]).toEqual([0, A0, B0]);
  });

  it("soul-bound copies don't move: only owned − bound can be offered (the chat says why)", async () => {
    const A0 = { [pc(1)]: 3, [pc(3)]: 40 }, B0 = { [pc(2)]: 3, [pc(4)]: 40 };
    const r1 = await trade(A0, B0, [pc(1), pc(1)], [pc(2), pc(2)], { [pc(1)]: 2 });   // 1 unbound, 2 offered
    expect([r1.end, r1.a, r1.b]).toEqual([0, A0, B0]);
    expect(r1.chat).toEqual(["Trade cancelled: starter cards can't be traded."]);
    const r2 = await trade(A0, B0, [pc(1)], [pc(2)], { [pc(1)]: 2 });                 // the unbound one moves
    expect([r2.end, r2.a[pc(1)], r2.a[pc(2)], r2.b[pc(1)]]).toEqual([1, 2, 1, 1]);
  });
});

describe("tournaments (research/torneos)", () => {
  it("07-10 TOURNAMENT_ON: the bracket burst is answered with data: 0x5115 STATUS 25 B, 0x5113 TIMER, 0x5114 PCOUNTER 20 B, 0x5111 LIST × 4 chunks", async () => {
    const h = harness();
    const [A] = await players(h, 1);
    const st = await ask(A, 0x5115, [], 0x5115);
    expect(st.length).toBe(25);
    expect((await ask(A, 0x5113, [], 0x5113)).length).toBe(4);
    expect((await ask(A, 0x5114, [], 0x5114)).length).toBe(20);
    const n = A.room!.mark(); A.room!.send(0x5111); await h.tick(3000);
    const ls = A.room!.all(0x5111, n);
    expect(ls.length).toBe(4);
    expect(ls.map((d) => d[16])).toEqual([0, 1, 2, 3]);
  });
});
