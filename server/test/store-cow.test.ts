// Copy-on-write saves (store.ts commit, game.ts loadState/saveState): a session's load and save cost its own account,
// not every registered one, and the D1 projector writes only that account's rows.
import { expect, it } from "vitest";
import { Projector } from "../src/db/project.ts";
import { harness } from "./notes-harness.ts";

it("a session's save copies only its account; the D1 diff is that account's rows", async () => {
  const accounts: any = {};
  for (let i = 0; i < 20; i++) accounts[`a${i}`] = { idx: i + 1, players: { "0": `P${i}` }, active_slot: 0, profiles: { "0": { name: `P${i}`, rec: { mp: 100 }, trunk: { "1": 3 } } } };
  const h = harness({ players: {}, lobby: { x: 1 }, gone: 1, accounts } as any);
  const A = h.client("A"); await A.account(0, "Alice"); // a new account a21 (DEV login)
  const store = h.game.store, before = store.peek();
  const pj = new Projector(store.loadRaw());
  const acct = Object.keys(store.peek().accounts).find((k) => !(k in accounts))!;
  const s = h.game.hub.sessions.get(acct)!;
  h.game.withCtx(s, () => {
    const st = h.game.loadState();
    st.profiles["0"].rec.mp = 777;
    delete st.gone;
    expect(store.peek().accounts[acct].profiles["0"].rec.mp).not.toBe(777); // the view is a copy
    h.game.saveState(st);
  });
  const after = store.peek();
  expect(after.accounts[acct].profiles["0"].rec.mp).toBe(777);
  expect(["gone" in after, after.lobby]).toEqual([false, { x: 1 }]);
  for (const k of Object.keys(accounts)) expect(after.accounts[k]).toBe(before.accounts[k]); // untouched: same object
  const ops = pj.diff(after).ops;
  expect(ops.length).toBeGreaterThan(0);
  expect(ops.every((o) => !Object.values(o.row).some((v) => typeof v === "string" && /^\/accounts\/a\d+\//.test(v)))).toBe(true);
});
