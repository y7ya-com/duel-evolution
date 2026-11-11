import { afterEach, expect, it } from "vitest";
import DATA from "../gamedata/shop.json";
import { secretObtained, secretUnlocked, secretPackAvailable, SECRET_BOOSTERS } from "../src/game/secret-packs.ts";
import { cardRarity } from "../src/game/card-rarity.ts";
import { SHARDS } from "../src/game/shards-config.ts";
import * as PP from "../src/game/persist.ts";
afterEach(() => { SHARDS.secretPacks = true; PP.setProgression(false); });
const pools = DATA.iid as Record<string, number[]>;
const pc = SECRET_BOOSTERS.flatMap((id) => pools[id]).find((pc) => cardRarity(pc) === "SR")!;
const ids = SECRET_BOOSTERS.filter((id) => pools[id].includes(pc));
function fixture() {
  let now = 1000;
  const g = { clock: { time: () => now }, log: () => {}, ctxAcct: () => "a", shopPurchase: (_kind: number, id: number) => pools[id].slice(0, 5).map((pc) => [0, pc]) } as any;
  return { g, p: { trunk: {}, bound: {} } as any, setTime: (n: number) => { now = n; } };
}
it("pulls and crafts unlock every containing booster, reset to 24 hours, and expire exactly at the deadline", () => {
  const f = fixture(); secretObtained(f.g, f.p, [pc], "booster");
  expect(Object.keys(secretUnlocked(f.p, 1000)).map(Number)).toEqual(ids);
  expect(Object.values(secretUnlocked(f.p, 1000))).toEqual(ids.map(() => 87400));
  expect(secretPackAvailable(f.p, ids[0], false, 87399)).toBe(true);
  expect(secretPackAvailable(f.p, ids[0], false, 87400)).toBe(false);
  expect(secretPackAvailable(f.p, ids[0], true, 87400)).toBe(true);
  f.setTime(2000); secretObtained(f.g, f.p, [pc], "booster"); expect(f.p.secret_packs.unlocked[ids[0]]).toBe(88400);
});
it("only the first craft key grants one bound free pack per booster, even after a pull unlock, and never cascades", () => {
  const f = fixture(); expect(secretObtained(f.g, f.p, [pc], "booster").freePacks).toEqual([]);
  const first = secretObtained(f.g, f.p, [pc, pc], "craft"); expect(first.freePacks.map((p) => p.packId)).toEqual(ids);
  expect(f.p.trunk).toEqual(f.p.bound);
  expect(secretObtained(f.g, f.p, [pc], "craft").freePacks).toEqual([]);
  f.setTime(100000); expect(secretObtained(f.g, f.p, [pc], "craft").freePacks).toEqual([]);
});
it("ignores N/R, structures, beginner packs, prizes, trades and free packs; flag disables keys and availability", () => {
  const f = fixture();
  for (const source of ["beginner", "structure", "prize", "trade", "free"] as const) secretObtained(f.g, f.p, [pc], source);
  secretObtained(f.g, f.p, SECRET_BOOSTERS.flatMap((id) => pools[id]).filter((pc) => cardRarity(pc) === "N"), "craft");
  expect(f.p.secret_packs).toBeUndefined();
  secretObtained(f.g, f.p, [pc], "craft"); SHARDS.secretPacks = false;
  expect(secretUnlocked(f.p, 1000)).toEqual({}); expect(secretPackAvailable(f.p, ids[0], false, 1000)).toBe(false);
  const other = fixture(); secretObtained(other.g, other.p, [pc], "craft"); expect(other.p.secret_packs).toBeUndefined();
});
it("binds prize claims based on reward eligibility at offer time, not claim time", () => {
  const p: any = { trunk: { [pc]: 2 }, bound: {}, prize_unbound: true, prize_bind_pending: true };
  PP.bindClaimedPrize(p, [pc]); expect(p.bound[pc]).toBe(1);
  p.prize_bind_pending = false; p.prize_unbound = false;
  PP.bindClaimedPrize(p, [pc]); expect(p.bound[pc]).toBe(1);
  const npc: any = { trunk: { [pc]: 2 }, npc_card_due: [2], npc_prize_binding: [{ pack: 1, bound: true }, { pack: 2, bound: false }] };
  PP.bindClaimedPrize(npc, [pc]); expect(npc.bound[pc]).toBe(1);
});
it("duplicate NPC pack claims keep the first occurrence's binding decision", () => {
  const p: any = { trunk: { [pc]: 2 }, npc_card_due: [1], npc_prize_binding: [{ pack: 1, bound: true }, { pack: 1, bound: false }] };
  PP.bindClaimedPrize(p, [pc]); expect(p.bound[pc]).toBe(1);
  p.npc_card_due = []; PP.bindClaimedPrize(p, [pc]); expect(p.bound[pc]).toBe(1);
});
it("the fortieth paid duel is eligible; the forty-first and unpaid duels bind their prizes", () => {
  PP.setProgression(true);
  const p: any = { rec: { mp: 0 }, trunk: {}, econ: { day: new Date().toISOString().slice(0, 10), duels: 39, wins: 0, pairs: {}, earned: 0, spent: 0, packs: 0 } };
  expect(PP.mpReward(null, p, "win", 10)).toBeGreaterThan(0); expect(p.prize_unbound).toBe(true);
  expect(PP.mpReward(null, p, "win", 10)).toBeGreaterThan(0); expect(p.prize_unbound).toBe(false);
  expect(PP.mpReward(null, p, "win", 1, { opp: "x", secs: 1 })).toBe(0); expect(p.prize_unbound).toBe(false);
});
