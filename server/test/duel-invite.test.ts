// POST /api/de/duel/challenge (Lobby.duelInvite): a player's card's Duel. The target is shown as a room owner to the
// challenger alone; the challenger's own 0x4300 then runs the game's challenge; the rules refuse with a reason.
import { expect, it } from "vitest";
import { harness, be32, cat } from "./notes-harness.ts";

const u32 = (d: Uint8Array, o = 0) => new DataView(d.buffer, d.byteOffset + o, 4).getUint32(0);
const i32 = (d: Uint8Array, o = 0) => new DataView(d.buffer, d.byteOffset + o, 4).getInt32(0);

it("duelInvite: a private room for the challenger only; decline then cooldown; the rules", async () => {
  const h = harness();
  const A = h.client("A", "A", "pw", "user-a"), B = h.client("B", "B", "pw", "user-b");
  await A.account(0, "Alice"); await B.account(0, "Bob");
  await A.enterRoom(); await B.enterRoom();
  const lp = h.game.lp;
  expect(lp.duelInvite("user-a", A.pid!)[1]).toMatchObject({ error: "self" });
  expect(lp.duelInvite("user-a", 999999)[1]).toMatchObject({ error: "offline" });

  const ma = A.room!.mark(), mb = B.room!.mark();
  const [st, out] = lp.duelInvite("user-a", 0, "Bob");
  expect(st).toBe(200);
  const rid = out.room as number;
  const entry = await A.room!.wait(0x3113, ma, (d) => u32(d) === rid);
  expect(entry && u32(entry, 4)).toBe(B.pid);                                      // Bob owns it, as Alice sees it
  await h.tick(50);
  expect(B.room!.all(0x3113, mb).some((d) => u32(d) === rid)).toBe(false);         // Bob is told nothing
  expect(lp.duelInvite("user-b", A.pid!)[1]).toMatchObject({ error: "busy" });     // Alice waits on her own challenge

  // Alice's own request for that room: Bob gets the game's prompt; he declines; Alice is told so
  const nb = B.room!.mark(), na = A.room!.mark();
  A.room!.send(0x4300, cat(be32(rid), new Uint8Array(16)));
  expect(await B.room!.wait(0x4302, nb)).not.toBeNull();
  expect(lp.duelInvite("user-a", B.pid!)[1]).toMatchObject({ error: "pending" });
  B.room!.send(0x4303, be32(0));
  const res = await A.room!.wait(0x4301, na);
  expect(res && i32(res)).toBe(-618);
  expect(A.room!.all(0x3113, na).some((d) => u32(d) === rid && u32(d, 4) === 0)).toBe(true);   // the room gone for her
  expect(lp.duelInvite("user-a", B.pid!)[1]).toMatchObject({ error: "cooldown" });
});

it("duelInvite: the private room goes the moment the target goes busy (a room of its own)", async () => {
  const h = harness();
  const A = h.client("A", "A", "pw", "user-a"), B = h.client("B", "B", "pw", "user-b");
  await A.account(0, "Alice"); await B.account(0, "Bob");
  await A.enterRoom(); await B.enterRoom();
  const lp = h.game.lp;
  const ma = A.room!.mark();
  const [st, out] = lp.duelInvite("user-a", B.pid!);
  expect(st).toBe(200);
  const rid = out.room as number;
  // Bob opens a duel room of his own (0x4288: style, watch, mode, no password, ...)
  B.room!.send(0x4288, new Uint8Array(28).fill(0).map((_, i) => (i === 0 ? 3 : 0)));
  const gone = await A.room!.wait(0x3113, ma, (d) => u32(d) === rid && u32(d, 4) === 0);
  expect(gone).not.toBeNull();                                                      // Alice's private room for Bob, gone
  expect(lp.duelInvite("user-a", B.pid!)[1]).toMatchObject({ error: "busy" });
});
