// The per-block cap (hub.ts BLOCK_CAP): a room past 48 players opens another block; moves and block chat stay in a
// block, global chat crosses them, the gate counts the whole room, and a player joins the block of its friends.
import { expect, it } from "vitest";
import { BLOCK_CAP, baseKey } from "../src/game/hub.ts";
import { harness, cat, str, type Client } from "./notes-harness.ts";
import { ROOM_KINDS } from "../src/config.ts";

it("past BLOCK_CAP a room opens block #2; moves stay in a block, global chat crosses, friends join friends", async () => {
  const h = harness();
  const cs: Client[] = [];
  for (let i = 0; i < BLOCK_CAP + 2; i++) {
    const c = h.client(`P${i}`, `user${i}`); await c.account(0, `P${i}`); await c.enterRoom(); cs.push(c);
  }
  const sess = (i: number) => h.game.hub.byPid(cs[i].pid!)!;
  const key = baseKey(sess(0).block!);
  expect([sess(BLOCK_CAP - 1).block, sess(BLOCK_CAP).block, sess(BLOCK_CAP + 1).block]).toEqual([key, `${key}#2`, `${key}#2`]);
  expect(h.game.hub.roomCount(key)).toBe(BLOCK_CAP + 2);

  // a move in #2 reaches #2 only
  const [a, b, z] = [cs[0].room!, cs[BLOCK_CAP].room!, cs[BLOCK_CAP + 1].room!];
  let na = a.mark(), nz = z.mark();
  b.send(0x5300, cat([0, 0, 0, 0], [0, 100, 0, 100, 0, 0])); await h.tick(300);
  expect([a.all(0x5300, na).length, z.all(0x5300, nz).length]).toEqual([0, 1]);
  // global chat (kind 1) crosses blocks
  na = a.mark();
  b.send(0x4400, cat([0, 1], new Uint8Array(12), str("hola", 5))); await h.tick(300);
  expect(a.all(0x4402, na).length).toBe(1);

  // two leave block 1; a newcomer with a friend in #2 goes there, one without fills block 1
  for (const i of [1, 2]) { cs[i].room!.send(0x0003); await h.tick(300); cs[i].room!.close(); }
  await h.tick(300);
  const fr = h.client("F", "userF"); await fr.account(0, "F");
  const nf = h.client("N", "userN"); await nf.account(0, "N");
  const st2 = h.state();
  const acctF = Object.keys(st2.accounts).find((k) => st2.accounts[k].players?.["0"] === "F")!;
  st2.accounts[acctF].profiles["0"].friends = [cs[BLOCK_CAP].pid];
  h.game.store.saveRaw(st2);
  await fr.enterRoom(); await nf.enterRoom();
  expect([h.game.hub.byPid(fr.pid!)!.block, h.game.hub.byPid(nf.pid!)!.block]).toEqual([`${key}#2`, key]);
}, 60000);

it("[sala]: entering a room logs its kind and an account hash (same account, same hash; it isn't the account id)", async () => {
  const h = harness();
  const a = h.client("A", "userA"), b = h.client("B", "userB");
  await a.account(0, "A"); await b.account(0, "B");
  await a.enterRoom(0); await a.enterRoom(2); await b.enterRoom(2);
  const lines = h.log.filter((s) => s.startsWith("[sala]"));
  const hash = (i: number) => lines[i].split(" ").pop()!;
  expect(lines.map((s) => s.replace(/ [0-9a-f]{8}$/, ""))).toEqual([
    `[sala] kind ${ROOM_KINDS[0]}: enter`, `[sala] kind ${ROOM_KINDS[2]}: enter`, `[sala] kind ${ROOM_KINDS[2]}: enter`]);
  expect([hash(0) === hash(1), hash(1) === hash(2)]).toEqual([true, false]);
  expect(lines.join(" ")).not.toContain(h.game.hub.byPid(a.pid!)!.acct.slice(0, 8));
}, 30000);
