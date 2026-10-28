// PROGRESSION=1 (persist.ts progression): a new character owns no cards, picks its 40 starter cards with the 2008
// Startup Present (0x8401 -> 0x8402), duels only with owned cards (deck check bloquear), earns MP and buys packs.
// A character from before progression restarts the same way (the owner's "reset everyone").
import { afterEach, describe, expect, it, vi } from "vitest";
import * as PP from "../src/game/persist.ts";
import { check } from "../src/duel/deckCheck.ts";
import { harness, be32, cat, i32, u32, type Harness } from "./notes-harness.ts";

afterEach(() => { vi.useRealTimers(); PP.setProgression(false); });

const prof = (h: Harness) => (Object.values(h.state().accounts)[0] as any).profiles["0"];
const sum = (t: Record<string, number>) => Object.values(t).reduce((a, b) => a + b, 0);

describe("progression", () => {
  it("new character: starter present, owned-only decks, MP from duels, a pack from the shop", async () => {
    const h = harness({ players: {} }, { PROGRESSION: "1" });
    const A = h.client("A"); await A.account(0, "Alice"); await A.enterRoom();
    let p = prof(h);
    expect([sum(p.trunk), p.pbin.includes(PP.STARTER_RIGHT), p.rec.mp]).toEqual([0, true, PP.START_MP]);
    expect(h.game.duel!.dk.mode).toBe("bloquear");

    const ids = [...PP.validCardIds()].sort((a, b) => a - b).slice(0, 14);
    const pick = Array.from({ length: 40 }, (_, i) => ids[Math.floor(i / 3)]);
    let n = A.room!.mark(); A.room!.send(0x8401, [40, ...pick.flatMap((c) => [c >> 8, c & 0xff])]);
    expect(i32((await A.room!.wait(0x8402, n))!)).toBe(0);
    p = prof(h);
    expect([sum(p.trunk), p.pbin.includes(PP.STARTER_RIGHT + 1)]).toEqual([40, true]);
    n = A.room!.mark(); A.room!.send(0x8401, [1, ids[0] >> 8, ids[0] & 0xff]);
    expect(i32((await A.room!.wait(0x8402, n))!)).toBe(1); // once only

    const baul = (main: number[]) => check(main, [], p.trunk).filter((x) => x.regla === "baul");
    expect(baul(pick)).toEqual([]);
    const unowned = [...PP.validCardIds()].find((c) => !(String(c) in p.trunk))!;
    expect(baul([...pick.slice(1), unowned]).map((x) => x.id)).toEqual([unowned]);

    PP.npcDuelResult(h.game, p, 1, "win");
    PP.npcDuelResult(h.game, p, 1, "lose");
    expect(p.rec.mp).toBe(PP.START_MP + 300 + 100);
    const st = h.state(); (Object.values(st.accounts)[0] as any).profiles["0"] = p; h.game.store.saveRaw(st);

    n = A.room!.mark(); A.room!.send(0x5208); await A.room!.wait(0x5214, n);
    const items = A.room!.all(0x5209, n).flatMap((d) => Array.from({ length: d.length / 17 }, (_, i) => {
      const e = d.subarray(17 * i); return { iid: u32(e), kind: e[4], prm: u32(e, 5), cost: u32(e, 9) };
    }));
    const pack = items.find((i) => i.kind === 1 && i.prm === 1001)!;
    n = A.room!.mark(); A.room!.send(0x5210, cat(be32(pack.iid), [1])); await A.room!.wait(0x5211, n);
    expect(i32(A.room!.all(0x5211, n)[0])).toBe(0);
    p = prof(h);
    expect([sum(p.trunk), p.rec.mp]).toEqual([45, PP.START_MP + 400 - pack.cost]);
  });

  it("a character from before progression restarts: no cards, the startup present again, MP kept (at least the start)", () => {
    PP.setProgression(true);
    const old = { name: "Old", rec: { mp: 50 }, trunk: { "1": 3, "2": 3 }, pbin: [5, PP.STARTER_RIGHT, PP.STARTER_RIGHT + 1, 900] };
    const st: any = { profiles: { "0": old } };
    const p = PP.profile(st, 0)!;
    expect([p.trunk, p.pbin, p.rec.mp, p.prog]).toEqual([{}, [5, PP.STARTER_RIGHT, 900], PP.START_MP, 1]);
    p.trunk = { "7": 1 };
    expect(PP.profile(st, 0)!.trunk).toEqual({ "7": 1 }); // once
    PP.setProgression(false);
    const off: any = { profiles: { "0": { name: "X", rec: {}, trunk: { "1": 3 }, pbin: [] } } };
    expect(PP.profile(off, 0)!.trunk).toEqual({ "1": 3 });
  });
});
