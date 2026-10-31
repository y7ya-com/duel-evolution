// Tunnel resume (world.ts; client: phase2-net's net_ws.cpp): a dropped WebSocket's virtual sockets are held 45 s,
// their output kept; the same user's new WebSocket with the same sid takes them over, byte-exact, and the game never
// sees the drop.
import { afterEach, describe, expect, it, vi } from "vitest";
import { harness, u32, Client, type Harness } from "./notes-harness.ts";
import { RESUME_HOLD_MS } from "../src/world.ts";

afterEach(() => { vi.useRealTimers(); });

const SID = "0123456789abcdef0123456789abcdef";

/** A client on a WebSocket with a sid; `ws(id, resume)` (re)opens its WebSocket and returns that socket's text frames. */
function tunnelClient(h: Harness, name: string, userId: string | null = null) {
  const c = new Client(h, name, "", h.client(name).key);   // the key only (h.client's own WebSocket stays unused)
  const rx = new Map<number, number>();
  const ws = (id: string, resume: boolean, sid = SID, user = userId) => {
    const texts: Record<string, unknown>[] = [];
    (c as { id: string }).id = id;
    h.srv.world.openPeer(id, user, (t) => texts.push(JSON.parse(t)),
      (b) => { const sock = u32(b, 1); rx.set(sock, (rx.get(sock) ?? 0) + b.length - 5); c.links.get(sock)?.rx(b.subarray(5)); return true; },
      sid, resume);
    return texts;
  };
  return { c, rx, ws };
}

describe("tunnel resume", () => {
  it("the same sid takes the held sockets over: what was sent meanwhile arrives once, in order, and the room goes on", async () => {
    const h = harness();
    const A = tunnelClient(h, "A");
    A.ws("wsA1", false);
    await A.c.account(0, "Alice"); await A.c.enterRoom();
    const room = A.c.room!;
    h.srv.world.closePeer("wsA1");                                   // the WebSocket drops
    const B = h.client("B"); await B.account(0, "Bob");
    const n = room.mark();
    await B.enterRoom();                                             // A's room gets B's 0x3112 while A is away
    expect(room.mark()).toBe(n);                                     // nothing reached A yet
    const texts = A.ws("wsA2", true);
    h.srv.world.onText("wsA2", JSON.stringify({ type: "resume", sid: SID, socks: [{ id: room.sock, rx: A.rx.get(room.sock) }] }));
    const r = texts.find((t) => t.type === "resumed") as { socks: { id: number; rx: number }[] };
    expect(r.socks.map((s) => s.id)).toEqual([room.sock]);
    expect(room.all(0x3112, n).length).toBeGreaterThan(0);          // B's join, resent after the client's rx
    const k = room.mark(); room.send(0x0005); expect(await room.wait(0x0004, k)).not.toBeNull();   // still live
    expect(A.c.errors()).toEqual([]);                                // byte-exact: no gap, no repeat in the seq numbers
    expect(h.log.some((l) => /\[srv:5740\] closed/.test(l))).toBe(false);
  });

  it("refused for an unknown sid, another sid's URL or another user; the held sockets close when the hold ends", async () => {
    const h = harness();
    const A = tunnelClient(h, "A", "user-a");
    A.ws("wsA1", false);
    await A.c.account(0, "Alice"); await A.c.enterRoom();
    h.srv.world.closePeer("wsA1");
    const other = "f".repeat(32);
    for (const [id, sid, user, ask] of [["x1", other, "user-a", other], ["x2", SID, "user-m", SID], ["x3", other, "user-a", SID]] as const) {
      const t = A.ws(id, true, sid, user);
      h.srv.world.onText(id, JSON.stringify({ type: "resume", sid: ask, socks: [] }));
      expect(t).toContainEqual({ type: "resume", ok: false });
    }
    await h.tick(RESUME_HOLD_MS + 100);
    await h.srv.world.idle();
    expect(h.log.some((l) => /\[srv:5740\] closed/.test(l))).toBe(true);
  });

  it("a WebSocket without a sid closes its sockets at once, as before", async () => {
    const h = harness();
    const A = tunnelClient(h, "A");
    A.ws("wsA1", false, null as unknown as string);
    await A.c.account(0, "Alice"); await A.c.enterRoom();
    h.srv.world.closePeer("wsA1");
    await h.srv.world.idle(); await h.tick(100);
    expect(h.log.some((l) => /\[srv:5740\] closed/.test(l))).toBe(true);
  });
});
