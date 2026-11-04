// Server behaviour the TypeScript client's browser acceptance found (client/experimental-ts/STATUS.md): a «Watch» OFF
// room, what a PvP spectator's stream carries, the trade's not-tradeable table, and the PvP economy's minimum length
// after a surrender.
import { existsSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { harness, be32, cat, i32, pairs, pc, type Client, type Harness } from "./notes-harness.ts";
import * as PP from "../src/game/persist.ts";
import { PY_DUEL_RULE } from "../src/duel/engine/core.ts";
import { createNodeDuelCore, ENGINE_DATA_DIR } from "../src/duel/engine/node.ts";
import { cardmap } from "../src/duel/data.ts";
import { type Msg, YO2Duel } from "../src/duel/translator/translator.ts";
import { PyRandom } from "../src/util/pyrandom.ts";

afterEach(() => { vi.useRealTimers(); PP.setProgression(false); });

async function players(h: Harness, n: number): Promise<Client[]> {
  const cs = Array.from({ length: n }, (_, i) => h.client(`P${i}`));
  for (const [i, c] of cs.entries()) await c.account(0, `Player${i}`);
  for (const c of cs) await c.enterRoom();
  return cs;
}
const ask = async (X: Client, mid: number, data: ArrayLike<number>, reply: number) => {
  const n = X.room!.mark(); X.room!.send(mid, data); return (await X.room!.wait(reply, n))!;
};
const sess = (h: Harness, c: Client) => h.game.hub.byPid(c.pid!)!;

describe("«Watch» OFF rooms", () => {
  /** 0x4288 CREATEROOM (dstyle, wmode, mstat, pw?, 16 B password, …, 3 B x, u32 rival): a PvP room. */
  const roomReq = (wmode: number, dstyle = 3) => {
    const d = new Uint8Array(28);
    d[0] = dstyle; d[1] = wmode;
    d.set([1, 1, 1], 21);
    return d;
  };

  for (const [wmode, dstyle, watchable] of [[0, 3, false], [1, 6, false], [1, 3, true]] as const)
    it(`a duel from a room with wmode ${wmode}, dstyle ${dstyle} ${watchable ? "can" : "can't"} be watched (0x4321 ${watchable ? 0 : 1})`, async () => {
      const h = harness();
      const [A, B, C] = await players(h, 3);
      await ask(A, 0x4288, roomReq(wmode, dstyle), 0x428a);
      h.game.pvp!.reserve(sess(h, B), sess(h, A));       // B takes A's room
      const d = await ask(C, 0x4320, be32(A.pid!), 0x4321);
      expect(i32(d)).toBe(watchable ? 0 : 1);
      expect(i32(await ask(C, 0x4320, be32(B.pid!), 0x4321))).toBe(watchable ? 0 : 1);   // by either player
    });
});

describe.skipIf(!existsSync(join(ENGINE_DATA_DIR, "scripts.pack")))("a PvP spectator's stream (PvpSession.pub: cfg public_view)", () => {
  it("never names a face-down set card, of either side, where its owner's own view does", async () => {
    const dc = (await createNodeDuelCore())!;
    const MIRROR_FORCE = 44095762;   // 40 a side: no monster to attack, so every one the bots set stays face-down
    const decks = [{ main: Array(40).fill(MIRROR_FORCE), extra: [] }, { main: Array(40).fill(MIRROR_FORCE), extra: [] }];
    const mk = (cfg: Record<string, unknown>) => new YO2Duel(decks, { first: 0, cardmap: cardmap(), cfg, rng: new PyRandom(1) });
    const own = mk({}), pub = mk({ public_view: true });
    for (const v of [own, pub]) v.query = () => dc.query("set");
    const got: [Msg[], Msg[]] = [own.start(), pub.start()];
    const all = dc.new("set", decks, { first: 0, seed: 1, shuffle: false, rule: PY_DUEL_RULE, bot: [true, true] });
    // up to turn 6: each side has set 5 (and holds at most 2 in hand: no discard to the Graveyard yet)
    const t6 = all.findIndex((e, i) => e.type === "NEW_TURN" && all.slice(0, i).filter((x) => x.type === "NEW_TURN").length === 5);
    const evs = all.slice(0, t6 < 0 ? all.length : t6);
    expect([0, 1].map((p) => evs.filter((e) => e.type === "SET" && e.controller === p).length)).toEqual([5, 5]);
    got[0].push(...own.feed_many(evs as any));
    got[1].push(...pub.feed_many(evs.filter((e) => e.ev !== "select") as any));
    const has = (out: Msg[]) => out.some(([, b]) => Buffer.from(b).includes(Buffer.from(be32(MIRROR_FORCE))));
    expect(has(got[0])).toBe(true);
    expect(has(got[1])).toBe(false);
  });
});

describe("trade: soul-bound copies are announced up front", () => {
  const t = (sub: number, body: ArrayLike<number> = []) => cat([sub >> 8, sub & 0xff], body);

  it("TRADELIMIT 0x7129 + 0x7130 + 0x7131 carries the soul-bound copies, which the 2008 card box holds back", async () => {
    const h = harness();
    const [A, B] = await players(h, 2);
    const st = h.state(), prof = (i: number) => (Object.values(st.accounts) as any[]).find((a) => a.idx === i + 1).profiles["0"];
    prof(0).trunk = { [pc(1)]: 3, [pc(3)]: 40 }; prof(0).bound = { [pc(1)]: 2, [pc(3)]: 40 };
    prof(1).trunk = { [pc(2)]: 3, [pc(4)]: 40 }; prof(1).bound = {};
    h.game.store.saveRaw(st);
    const m = B.room!.mark();
    expect(i32(await ask(A, 0x7000, t(0x7102, be32(B.pid!)), 0x7103))).toBe(0);
    await B.room!.wait(0x7104, m);
    const n = A.room!.mark();
    B.room!.send(0x7000, t(0x7105, be32(1)));
    await A.room!.wait(0x7105, n, undefined, 3000);
    const limits: [number, number][][] = [];
    for (const X of [A, B]) {
      const k = X.room!.mark(); X.room!.send(0x7000, t(0x7132));
      expect(await X.room!.wait(0x7131, k)).not.toBeNull();
      const ids = X.room!.ids(k);
      expect(ids.indexOf(0x7129)).toBeLessThan(ids.indexOf(0x7131));
      limits.push(pairs(X.room!.all(0x7130, k)));
    }
    expect(limits[0]).toEqual([[pc(1), 2], [pc(3), 40]].sort((x, y) => x[0] - y[0]));
    expect(limits[1]).toEqual([]);   // nothing bound: an empty table, as before
  });
});

describe("PvP MP: the minimum length", () => {
  /** A reserved match whose duel reached `turn` `secs` seconds ago; the challenger (player 1 of reserve) surrenders. */
  async function surrenderAt(turn: number, secs: number) {
    PP.setProgression(true);
    const h = harness({ players: {} }, { PROGRESSION: "1" });
    const [A, B] = await players(h, 2);
    const mp = (i: number) => (Object.values(h.state().accounts) as any[]).find((a) => a.idx === i + 1).profiles["0"].rec.mp;
    const before = [mp(0), mp(1)];
    const m = h.game.pvp!.reserve(sess(h, A), sess(h, B)) as unknown as Record<string, any>;   // its private t0 / surrender
    m.ps = { turn, started: true, over: false, stats: null, lastLp: null, end() {}, resend() {}, pending() { return "nobody"; } } as any;
    m.t0 = Date.now() / 1000 - secs;
    m.surrender(1);
    return [mp(0) - before[0], mp(1) - before[1]];
  }

  it("a surrender before turn 3 and 120 s pays nobody (the anti-farming rule)", async () => {
    expect(await surrenderAt(2, 30)).toEqual([0, 0]);
  });

  it("a surrender on turn 6 within 120 s still pays: the duel reached 3 turns", async () => {
    expect(await surrenderAt(6, 60)).toEqual([PP.ECON.PVP_WIN + PP.ECON.FIRST_WIN, PP.ECON.PVP_LOSS]);
  });

  it("a surrender before turn 3 after 120 s pays", async () => {
    expect(await surrenderAt(1, 130)).toEqual([PP.ECON.PVP_WIN + PP.ECON.FIRST_WIN, PP.ECON.PVP_LOSS]);
  });
});
