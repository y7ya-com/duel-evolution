import { describe, expect, it } from "vitest";
import { applyNpcSweepRecovery, planNpcSweepRecovery, EVENT_ID, RECOVERY_KEY } from "../src/game/npc-sweep-recovery.ts";
import { Projector, stateToRows, rowsToState } from "../src/db/project.ts";
const card = "70095154", freeCard = "1475311"; // URs
function fixture() {
  const p: any = { name: "Alice", shards: 0, trunk: {}, bound: {}, rewards: { audit: [] }, shard_audit: [] };
  const st: any = { schema: 3, accounts: { a: { players: { 0: "Alice" }, active_slot: 0, profiles: { 0: p } } } };
  let t = 1;
  const add = (operation: string, delta: number, changes = {}, extra = {}) => {
    p.shards += delta;
    const a = { at: t++, requestId: `r${t}`, operation, shardDelta: delta, changes, balance: p.shards, ...extra };
    p.shard_audit.push(a); return a;
  };
  const reward = () => { const a = add("reward", 24000, {}, { reward: EVENT_ID }); p.rewards.audit.push({ id: EVENT_ID, shards: 24000, requestId: a.requestId, at: a.at }); };
  const craft = (n: number, bonus = false) => {
    add("make", -8000 * n, { [card]: n }, bonus ? { secret: { freePacks: [{ packId: 37, cards: [Number(freeCard)] }] } } : {});
    p.trunk[card] = (p.trunk[card] ?? 0) + n;
    if (bonus) { p.trunk[freeCard] = (p.trunk[freeCard] ?? 0) + 1; p.bound[freeCard] = (p.bound[freeCard] ?? 0) + 1; }
  };
  return { st, p, add, reward, craft };
}
describe("NPC event duplicate shard recovery", () => {
  it("leaves a single legitimate grant and all its purchases alone", () => {
    const f = fixture(); f.reward(); f.craft(3);
    expect(planNpcSweepRecovery(f.st, [])).toEqual({ accounts: [], profiles: [], transfers: [] });
  });
  it("removes unspent duplicates while preserving legitimate starting shards", () => {
    const f = fixture(); f.add("admin-grant", 100); f.reward(); f.reward();
    const plan = planNpcSweepRecovery(f.st, []);
    expect(plan.accounts[0]).toMatchObject({ claims: 2, excess: 24000 });
    expect(plan.profiles[0]).toMatchObject({ before: 48100, after: 24100, cards: {} });
  });
  it("keeps affordable copies from a batch and removes only the unaffordable copy", () => {
    const f = fixture(); f.reward(); f.craft(2); f.reward(); f.craft(2);
    const plan = planNpcSweepRecovery(f.st, []);
    expect(plan.profiles[0]).toMatchObject({ before: 16000, after: 0, cards: { [card]: 1 } });
    applyNpcSweepRecovery(f.st, plan, 10);
    expect(f.p.trunk[card]).toBe(3); expect(f.p.shards).toBe(0);
    expect(() => applyNpcSweepRecovery(f.st, plan, 11)).toThrow("already applied");
  });
  it("removes bonus cards from canceled crafts, preserving unrelated bound copies", () => {
    const f = fixture(); f.p.trunk[freeCard] = 2; f.p.bound[freeCard] = 1;
    f.reward(); f.craft(3); f.reward(); f.craft(1, true);
    const plan = planNpcSweepRecovery(f.st, []);
    applyNpcSweepRecovery(f.st, plan, 10);
    expect(f.p.trunk[freeCard]).toBe(2); expect(f.p.bound[freeCard]).toBe(1);
    expect(f.p.trunk[card]).toBe(3);
  });
  it("removes proceeds of dismantling an invalid craft, without taking another copy", () => {
    const f = fixture(); f.reward(); f.craft(3); f.reward(); f.craft(1);
    f.p.trunk[card]--; f.add("dismantle", 500, { [card]: 1 });
    const row = planNpcSweepRecovery(f.st, []).profiles[0];
    expect(row).toMatchObject({ before: 16500, after: 0, cards: {} });
  });
  it("follows a funded card through a trade and revokes it at its current holder", () => {
    const f = fixture(); f.reward(); f.craft(3); f.reward(); f.craft(1);
    f.st.accounts.b = { profiles: { 0: { name: "Bob", trunk: { [card]: 1 } } } }; f.p.trunk[card]--;
    const plan = planNpcSweepRecovery(f.st, [{ id: 1, at: 8, a_acct: "a", a_slot: 0, a_gave: `[${card}]`, b_acct: "b", b_slot: 0, b_gave: "[]" }]);
    expect(plan.transfers).toHaveLength(1);
    expect(plan.profiles.find(p => p.acct === "b")?.cards).toEqual({ [card]: 1 });
    applyNpcSweepRecovery(f.st, plan, 10); expect(f.st.accounts.b.profiles[0].trunk).toEqual({});
  });
  it("counts grants across live and archived characters once per account", () => {
    const f = fixture(); f.reward();
    f.st.accounts.a.profiles_borrados = [{ perfil: structuredClone(f.p) }];
    f.p.rewards.audit = []; f.p.shard_audit = []; f.p.shards = 0;
    f.reward();
    expect(planNpcSweepRecovery(f.st, []).accounts[0]).toMatchObject({ claims: 2, excess: 24000 });
  });
  it("refuses missing evidence and missing cards without mutating the state", () => {
    const f = fixture(); f.reward(); f.craft(3); f.reward(); f.craft(1);
    f.p.trunk[card] = 0;
    const before = structuredClone(f.st);
    expect(() => planNpcSweepRecovery(f.st, [])).toThrow("missing"); expect(f.st).toEqual(before);
    f.p.trunk[card] = 4; f.p.shard_audit.pop();
    expect(() => planNpcSweepRecovery(f.st, [])).toThrow("wallet does not match ledger");
  });
  it("projects card removals, wallet, audit and marker in the same bounded batch", () => {
    const f = fixture(); f.reward(); f.craft(3); f.reward(); f.craft(1);
    const pj = new Projector(structuredClone(f.st));
    applyNpcSweepRecovery(f.st, planNpcSweepRecovery(f.st, []), 10);
    const { ops } = pj.diff(f.st);
    expect(ops.some(o => o.table === "trunk_cards")).toBe(true);
    expect(ops.some(o => o.table === "state_extras" && o.row.key === RECOVERY_KEY)).toBe(true);
    expect(ops.some(o => o.table === "state_extras" && o.row.key === "shard_audit")).toBe(true);
  });
  it("persists the recovery marker, inventory and audit through the D1 projection", () => {
    const f = fixture(); f.reward(); f.reward();
    applyNpcSweepRecovery(f.st, planNpcSweepRecovery(f.st, []), 10);
    const restored = rowsToState(stateToRows(f.st));
    expect(restored[RECOVERY_KEY]).toEqual(f.st[RECOVERY_KEY]);
    expect(restored.accounts.a.profiles[0].shards).toBe(24000);
    expect(restored.accounts.a.profiles[0].shard_audit.at(-1).operation).toBe("npc-event-recovery");
  });
});
