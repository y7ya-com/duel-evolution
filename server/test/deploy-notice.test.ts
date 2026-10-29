// The deploy warning (scripts/deploy.sh, admin.ts): the online count, and a server chat line to every lobby.
import { expect, it } from "vitest";
import { harness, type Client } from "./notes-harness.ts";

it("admin online counts live players; announce puts a server line in every lobby's chat", async () => {
  const h = harness();
  const cs: Client[] = [];
  for (const n of ["A", "B"]) { const c = h.client(n, `user${n}`); await c.account(0, n); await c.enterRoom(); cs.push(c); }
  expect(h.game.admin.run("online", {})).toEqual({ online: 2 });
  const marks = cs.map((c) => c.room!.mark());
  expect(h.game.admin.run("announce", { text: "Server update in 2 min." })).toEqual({ sent: 2 });
  await h.tick(300);
  for (const [i, c] of cs.entries()) {
    const d = c.room!.all(0x4402, marks[i])[0];
    expect([d[1], String.fromCharCode(...d.subarray(10, 24)), String.fromCharCode(...d.subarray(26, 49))]).toEqual([1, "Duel Evolution", "Server update in 2 min."]);
  }
});
