// The in-game Ignore List (0x4530 / 0x4540, Lobby.hBlack): each character's own, persisted in its profile. A blocking
// B affects A <-> B only: B's room chat, whispers, D-Mail and duel invites don't reach A; C is untouched.
import { afterEach, expect, it, vi } from "vitest";
import { harness, be32, cat, str } from "./notes-harness.ts";

afterEach(() => { vi.useRealTimers(); });

it("A blocks B: B's chat, whisper, D-Mail and invites stop at A only; unblock restores; the list is A's own, capped", async () => {
  const h = harness();
  const [A, B, C] = ["A", "B", "C"].map((n) => h.client(n, n, "pw", `user-${n.toLowerCase()}`));
  await A.account(0, "Alice"); await B.account(0, "Bob"); await C.account(0, "Carol");
  for (const X of [A, B, C]) await X.enterRoom();
  let n = A.room!.mark();
  A.room!.send(0x4530, be32(B.pid!));
  await A.room!.wait(0x4531, n);
  const prof = (who: string) => (Object.values(h.state().accounts) as any[]).find((a) => a.profiles?.["0"]?.name === who).profiles["0"];
  expect(prof("Alice").black).toEqual([B.pid]);
  expect(prof("Carol").black ?? []).toEqual([]);
  expect(h.state().lobby?.black ?? []).toEqual([]);   // nothing server-wide any more

  const say = (kind: number, to = 0) => cat([0, kind], be32(0), be32(to), be32(0), str("hi", 2), [0]);
  const ma = A.room!.mark(), mc = C.room!.mark();
  B.room!.send(0x4400, say(0)); B.room!.send(0x4400, say(3, A.pid!));
  B.room!.send(0x4600, cat(be32(A.pid!), str("s", 32), str("b", 512)));
  await h.tick(2000);
  expect(A.room!.all(0x4402, ma)).toEqual([]);                 // neither the room line nor the whisper
  expect(C.room!.all(0x4402, mc).length).toBe(1);              // C still hears B
  n = A.room!.mark(); A.room!.send(0x4610); await A.room!.wait(0x4613, n);
  expect(A.room!.all(0x4612, n)).toEqual([]);                  // no D-Mail from B
  expect(h.game.lp.duelInvite("user-b", A.pid!)[1]).toMatchObject({ error: "refused" });
  expect(h.game.lp.duelInvite("user-b", C.pid!)[0]).toBe(200);   // B can still challenge others
  expect(h.game.lp.duelInvite("user-c", A.pid!)[0]).toBe(200);   // and others can challenge A

  n = A.room!.mark(); A.room!.send(0x4540, be32(B.pid!)); await A.room!.wait(0x4541, n);
  const m2 = A.room!.mark(); B.room!.send(0x4400, say(0)); await h.tick(1000);
  expect(A.room!.all(0x4402, m2).length).toBe(1);

  for (let i = 0; i < 260; i++) { A.room!.send(0x4530, be32(9000 + i)); if (i % 10 === 9) await h.tick(4000); }
  await h.tick(4000);
  expect(prof("Alice").black.length).toBe(200);
}, 60_000);
