// GET /api/de/friends (Lobby.friendsInfo): the active character's friends with online and the world part they are in.
import { expect, it } from "vitest";
import { harness, be32, cat } from "./notes-harness.ts";

it("friendsInfo: a befriended player, online in a room then offline; not in game = 409", async () => {
  const h = harness();
  expect(h.game.lp.friendsInfo("user-a")).toEqual([409, { error: "not-in-game" }]);
  const A = h.client("A", "A", "pw", "user-a"), B = h.client("B", "B", "pw", "user-b");
  await A.account(0, "Alice"); await B.account(0, "Bob");
  await A.enterRoom(); await B.enterRoom();
  expect(h.game.lp.friendsInfo("user-a")).toEqual([200, { friends: [] }]);
  const m = B.room!.mark();
  A.room!.send(0x4510, be32(B.pid!));
  await B.room!.wait(0x4512, m);
  const n = A.room!.mark();
  B.room!.send(0x4513, cat(be32(A.pid!), be32(1)));
  await A.room!.wait(0x4515, n);
  expect(h.game.lp.friendsInfo("user-a")).toEqual([200, { friends: [{ name: "Bob", online: true, place: "Domino City" }] }]);
  B.room!.close(); await h.tick(100);
  expect(h.game.lp.friendsInfo("user-a")).toEqual([200, { friends: [{ name: "Bob", online: false }] }]);
});
