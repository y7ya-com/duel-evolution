// OcgSession.pump's NPC_THINK (duel-pacing.md): the first visible NPC decision after a client's play goes at once
// (the client has caught up and its screen would stand still); the later ones keep the pause.
import { afterEach, expect, it, vi } from "vitest";
import { NPC_THINK, OcgSession } from "../src/duel/ocgSession.ts";

afterEach(() => { vi.useRealTimers(); });

/** A session whose engine loop is scripted: pumpSome answers "think" `thinks` times, then "stop". */
function scripted(thinks: number) {
  const g = { world: { run: (f: () => void) => f() }, NO_SESSION: {} } as any;
  const s = new OcgSession(g, {} as any, () => {}, 0, 0) as any;
  let calls = 0;
  s.pumpSome = () => (++calls <= thinks ? "think" : "stop");
  s.flushEnd = async () => {};
  return { s, calls: () => calls };
}

it("after a client's play the first NPC decision has no pause, the next ones do", async () => {
  vi.useFakeTimers();
  const a = scripted(3);
  const done = a.s.pump(true);
  await vi.advanceTimersByTimeAsync(0);
  expect(a.calls()).toBe(2);                                   // think 1 went straight on to think 2
  await vi.advanceTimersByTimeAsync(NPC_THINK * 1000 - 1);
  expect(a.calls()).toBe(2);                                   // think 2 waits NPC_THINK
  await vi.advanceTimersByTimeAsync(NPC_THINK * 2000);
  await done;
  expect(a.calls()).toBe(4);

  const b = scripted(1);
  const done2 = b.s.pump();                                    // the duel's start: no client play before it
  await vi.advanceTimersByTimeAsync(0);
  expect(b.calls()).toBe(1);
  await vi.advanceTimersByTimeAsync(NPC_THINK * 1000);
  await done2;
  expect(b.calls()).toBe(2);
});
