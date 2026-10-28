// PROGRESSION=1 (persist.ts progression): a new character owns no cards, picks its 40 starter cards with the 2008
// Startup Present (0x8401 -> 0x8402), duels only with owned cards (deck check bloquear), earns MP and buys packs.
// A character from before progression restarts the same way (the owner's "reset everyone").
import { afterEach, describe, expect, it, vi } from "vitest";
import * as PP from "../src/game/persist.ts";
import { check } from "../src/duel/deckCheck.ts";
import { rowsToState, stateToRows } from "../src/db/project.ts";
import { harness, be32, cat, i32, u32, type Harness } from "./notes-harness.ts";

afterEach(() => { vi.useRealTimers(); PP.setProgression(false); });

const prof = (h: Harness) => (Object.values(h.state().accounts)[0] as any).profiles["0"];
const sum = (t: Record<string, number>) => Object.values(t).reduce((a, b) => a + b, 0);

describe("progression", () => {
  it("new character: starter present, owned-only decks, MP from duels, a pack from the shop", async () => {
    const h = harness({ players: {} }, { PROGRESSION: "1" });
    const A = h.client("A"); await A.account(0, "Alice"); await A.enterRoom();
    let p = prof(h);
    expect([sum(p.trunk), p.pbin.includes(PP.STARTER_RIGHT), p.rec.mp]).toEqual([0, true, 5000]);
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
    expect(p.rec.mp).toBe(5000 + 150 + 300); // the day's first win carries the +300 bonus
    PP.npcDuelResult(h.game, p, 1, "lose");
    PP.npcDuelResult(h.game, p, 1, "win");
    expect(p.rec.mp).toBe(5000 + 450 + 50 + 150);
    const st = h.state(); (Object.values(st.accounts)[0] as any).profiles["0"] = p; h.game.store.saveRaw(st);

    n = A.room!.mark(); A.room!.send(0x5208); await A.room!.wait(0x5214, n);
    const items = A.room!.all(0x5209, n).flatMap((d) => Array.from({ length: d.length / 17 }, (_, i) => {
      const e = d.subarray(17 * i); return { iid: u32(e), kind: e[4], prm: u32(e, 5), cost: u32(e, 9) };
    }));
    expect(items.find((i) => i.kind === 1 && i.prm === 1)!.cost).toBe(200); // a booster
    const pack = items.find((i) => i.kind === 1 && i.prm === 1001)!;
    expect(pack.cost).toBe(100); // a beginner pack
    n = A.room!.mark(); A.room!.send(0x5210, cat(be32(pack.iid), [1])); await A.room!.wait(0x5211, n);
    expect(i32(A.room!.all(0x5211, n)[0])).toBe(0);
    p = prof(h);
    expect([sum(p.trunk), p.rec.mp]).toEqual([45, 5000 + 650 - 100]);
    expect([p.econ.spent, p.econ.packs, p.econ.earned, p.econ.duels]).toEqual([100, 1, 650, 3]);
    expect(h.log.filter((l) => l.startsWith("[economia]")).length).toBe(4);
  });

  it("PvP guards: short duels pay nobody, 5 a day per pair, first win +300, 25% after 40 duels", () => {
    PP.setProgression(true);
    const p: any = { rec: { mp: 0 } };
    const pvp = (opp: string, turns = 5, secs = 300, r = "win") => PP.mpReward(null, p, r, turns, { opp, secs });
    expect([pvp("b", 2, 60), pvp("b", 2, 200), pvp("b", 4, 10)]).toEqual([0, 250 + 300, 250]);
    expect([pvp("b", 5, 300, "lose"), pvp("b"), pvp("b"), pvp("b"), pvp("c")]).toEqual([100, 250, 250, 0, 250]); // b: 5 rewarded
    p.econ.duels = 40;
    expect([pvp("d"), PP.mpReward(null, p, "lose", 9)]).toEqual([62, 12]);
    p.econ.day = "2000-01-01";
    expect(pvp("b")).toBe(550); // a new day: the pair cap and the first-win bonus start again
  });

  it("a character from before progression restarts: no cards, the startup present again, the starting MP", () => {
    PP.setProgression(true);
    const old = { name: "Old", rec: { mp: 50 }, trunk: { "1": 3, "2": 3 }, pbin: [5, PP.STARTER_RIGHT, PP.STARTER_RIGHT + 1, 900] };
    const st: any = { profiles: { "0": old } };
    const p = PP.profile(st, 0)!;
    expect([p.trunk, p.pbin, p.rec.mp, p.prog]).toEqual([{}, [5, PP.STARTER_RIGHT, 900], 5000, 1]);
    p.trunk = { "7": 1 };
    expect(PP.profile(st, 0)!.trunk).toEqual({ "7": 1 }); // once
    // p.prog and the day's p.econ survive the D1 projection (state_extras): no schema change
    p.econ = { day: "2026-10-28", duels: 2, wins: 1, pairs: { abc: 2 }, earned: 500, spent: 200, packs: 1 };
    const full: any = { players: {}, accounts: { a1: { idx: 1, players: { "0": "Old" }, profiles: { "0": p } } } };
    const back = rowsToState(stateToRows(full)) as any;
    expect([back.accounts.a1.profiles["0"].prog, back.accounts.a1.profiles["0"].econ]).toEqual([1, p.econ]);
    PP.setProgression(false);
    const off: any = { profiles: { "0": { name: "X", rec: {}, trunk: { "1": 3 }, pbin: [] } } };
    expect(PP.profile(off, 0)!.trunk).toEqual({ "1": 3 });
  });
});
