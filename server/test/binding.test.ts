// The game channel's account binding (AUTH.md "Game channel"): 0x3003 only says "which account".
import { describe, expect, it } from "vitest";
import { configFrom } from "../src/config.ts";
import { buildServer } from "../src/server.ts";
import { pack, Reader, type Msg } from "../src/net/proto.ts";
import { encrypt } from "../src/util/cifrado.ts";

function harness(dev: boolean) {
  const srv = buildServer(configFrom({ DEV: dev ? "1" : "0", PARITY_SEED: "1" }), { players: {} }, () => {});
  let n = 0;
  const peer = (userId: string | null) => {
    const id = `ws${++n}`, got: Msg[] = [], rd = new Reader(), closed: number[] = [];
    const frame = (sock: number, p: Uint8Array) => {
      const f = new Uint8Array(5 + p.length);
      f[0] = 1; new DataView(f.buffer).setUint32(1, sock); f.set(p, 5);
      srv.world.onBinary(id, f);
    };
    srv.world.openPeer(id, userId, (t) => { const m = JSON.parse(t); if (m.type === "close") closed.push(m.id); },
      (b) => {
        const sock = new DataView(b.buffer, b.byteOffset).getUint32(1);
        for (const m of rd.feed(b.subarray(5))) {
          // the card wire's hello (src/world.ts): answer as the client's codec does, keep it out of `got`
          if (m.id === 0xca01) queueMicrotask(() => frame(sock, pack(0xca02, m.data, 0)));
          else got.push(m);
        }
        return true;
      });
    let seq = 0;
    return {
      open: (sock: number, port: number) => srv.world.onText(id, JSON.stringify({ type: "open", id: sock, port })),
      send: (sock: number, mid: number, data: Uint8Array = new Uint8Array(0)) => frame(sock, pack(mid, data, ++seq)),
      got, closed,
    };
  };
  const settle = () => new Promise((r) => setTimeout(r, 400));
  const auth = (r: Msg[]) => r.filter((m) => m.id === 0x3004).map((m) => new DataView(m.data.buffer, m.data.byteOffset).getInt32(0));
  return { srv, peer, settle, auth };
}

describe("account binding", () => {
  it("a signed-in user gets their own account whatever the blob says; a typo creates nothing", async () => {
    const { srv, peer, settle, auth } = harness(false);
    const a = peer("user-a");
    a.open(1, 5731); a.send(1, 0x3003, encrypt("alice", "right"));
    await settle();
    const b = peer("user-a");                                     // same user, wrong password typed in the client
    b.open(1, 5731); b.send(1, 0x3003, encrypt("alice", "wrong"));
    await settle();
    expect(auth(a.got)).toEqual([0]);
    const accts = Object.entries(srv.game.store.loadRaw().accounts);
    expect(accts.map(([k, v]: [string, any]) => [k, v.user_id])).toEqual([["u:user-a", "user-a"]]);
  });

  it("a replayed 0x3003 of someone else's account doesn't reach it", async () => {
    const { srv, peer, settle } = harness(false);
    const alice = peer("user-a"), mallory = peer("user-m");
    const blob = encrypt("alice", "right");
    alice.open(1, 5731); alice.send(1, 0x3003, blob);
    mallory.open(1, 5731); mallory.send(1, 0x3003, blob);         // replay
    await settle();
    const owners = Object.values(srv.game.store.loadRaw().accounts).map((v: any) => v.user_id).sort();
    expect(owners).toEqual(["user-a", "user-m"]);                 // mallory got her own, never alice's
    const sess = [...srv.game.hub.sessions.values()].map((s) => s.acct).sort();
    expect(sess).toEqual(["u:user-a", "u:user-m"]);
  });

  it("without a user (the parity bridge) only DEV allows the legacy blob login", async () => {
    for (const dev of [false, true]) {
      const { peer, settle, auth } = harness(dev);
      const x = peer(null);
      x.open(1, 5731); x.send(1, 0x3003, encrypt("bob", "pw"));
      await settle();
      expect(auth(x.got)).toEqual([dev ? 0 : -240]);
    }
  });
});

describe("legacy account claim", () => {
  it("binds an unclaimed account once; refuses taken and users with characters; drops an empty u: account", () => {
    const srv = buildServer(configFrom({ DEV: "1" }), { players: {}, accounts: {
      leg1: { idx: 1, players: { "0": "Old" }, profiles: {} }, leg2: { idx: 2, players: { "0": "Old2" }, profiles: {} },
      "u:x": { idx: 3, players: {}, profiles: {}, user_id: "x" }, "u:y": { idx: 4, players: { "0": "Y" }, profiles: {}, user_id: "y" } } }, () => {});
    const claim = (acct: string, u: string) => srv.game.admin.claim(acct, u);
    expect(claim("nope", "x")).toBe("no_account");
    expect(claim("leg1", "y")).toBe("has_account");
    expect(claim("leg1", "x")).toBe("ok");
    expect(claim("leg1", "x")).toBe("ok");
    expect(claim("leg1", "z")).toBe("taken");
    const accts = srv.game.store.loadRaw().accounts;
    expect(accts["u:x"]).toBeUndefined();
    expect(accts.leg1.user_id).toBe("x");
    expect(srv.game.store.accountOfUser("x")).toBe("leg1");
  });
});
