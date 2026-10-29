// game/decks.ts on the real migration (node:sqlite behind a D1-shaped adapter): upsert, case-folded names,
// tombstones, the current deck of each mode, the starter backfill, limits and the PUT body checks.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createRequire } from "node:module";
import { expect, it } from "vitest";
import { currentOf, DECKS_MAX, deckCurrent, deckDelete, deckIn, deckPut, decksGet, nameOk } from "../src/game/decks.ts";
import { STARTER_DECKS } from "../src/game/starter.ts";

const { DatabaseSync } = createRequire(import.meta.url)("node:sqlite"); // vite 5 drops a static node:sqlite

function d1(): D1Database {
  const db = new DatabaseSync(":memory:");
  db.exec(readFileSync(join(import.meta.dirname, "../migrations/0005_user_decks.sql"), "utf8").replaceAll("--> statement-breakpoint", ""));
  const stmt = (sql: string, args: unknown[] = []): any => ({
    bind: (...a: unknown[]) => stmt(sql, a),
    first: async () => db.prepare(sql).get(...(args as any[])) ?? null,
    all: async () => ({ results: db.prepare(sql).all(...(args as any[])) }),
    run: async () => db.prepare(sql).run(...(args as any[])),
  });
  return { prepare: (sql: string) => stmt(sql), batch: async (q: any[]) => { for (const s of q) await s.run(); return []; } } as any;
}

const DM = 46986414, DMG = 38033121; // Dark Magician, Dark Magician Girl
const K = "acct/0", O = { key: K, starter: null };

it("a deck round-trips in order; names are exact keys; delete leaves a tombstone; each mode has its current", async () => {
  const db = d1();
  expect(await deckPut(db, K, { name: "Spells", main: [DMG, DM, DM], side: [], extra: [] }, "world", 1)).toEqual([200, { updated: 1 }]);
  await deckPut(db, K, { name: "Spells", main: [DM], side: [DMG], extra: [] }, null, 2);
  await deckPut(db, K, { name: "spells", main: [], side: [], extra: [] }, "free", 3);                  // another deck
  let [, g] = await decksGet(db, O) as any;
  expect(g).toEqual({ current: { world: "Spells", free: "spells" }, deleted: [], decks: [
    { name: "Spells", main: [DM], side: [DMG], extra: [], updated: 2 }, { name: "spells", main: [], side: [], extra: [], updated: 3 }] });
  expect((await decksGet(db, { key: "other/0", starter: null }))[1]).toEqual({ current: { world: null, free: null }, decks: [], deleted: [] });
  expect(await deckDelete(db, K, "Spells", 4)).toEqual([200, { updated: 4 }]);
  [, g] = await decksGet(db, O) as any;
  expect([g.current, g.decks.map((d: any) => d.name), g.deleted]).toEqual([{ world: null, free: "spells" }, ["spells"], [{ name: "Spells", updated: 4 }]]);
  expect((await deckCurrent(db, K, { name: "Spells", mode: "world" }))[0]).toBe(404);
  expect((await deckCurrent(db, K, { name: "spells", mode: "nope" }))[0]).toBe(400);
  await deckPut(db, K, { name: "Spells", main: [DM], side: [], extra: [] }, null, 5);                   // re-saved: live again
  expect(await deckCurrent(db, K, { name: "Spells", mode: "world" }, 6)).toEqual([200, { updated: 6 }]);
  expect(((await decksGet(db, O))[1] as any).current).toEqual({ world: "Spells", free: "spells" });
});

it("a starter claimed before the store: added once by GET, the World's current only when there is none", async () => {
  const db = d1(), name = STARTER_DECKS[8001][0];
  let [, g] = await decksGet(db, { key: K, starter: 8001 }, 1) as any;
  expect([g.current, g.decks.length, g.decks[0].name, g.decks[0].main.length]).toEqual([{ world: name, free: null }, 1, name, 40]);
  await deckDelete(db, K, name, 2);
  [, g] = await decksGet(db, { key: K, starter: 8001 }, 3) as any;                                        // the tombstone wins
  expect([g.decks.length, g.deleted.map((d: any) => d.name)]).toEqual([0, [name]]);
  const db2 = d1();
  await deckPut(db2, K, { name: "Mine", main: [DM], side: [], extra: [] }, "world");
  [, g] = await decksGet(db2, { key: K, starter: 8001 }) as any;
  expect([g.current.world, g.decks.map((d: any) => d.name).sort()]).toEqual(["Mine", ["Mine", name].sort()]);
});

it("at most DECKS_MAX live decks; bodies are checked", async () => {
  const db = d1();
  for (let i = 0; i < DECKS_MAX; i++) await deckPut(db, K, { name: `D${i}`, main: [DM], side: [], extra: [] });
  expect((await deckPut(db, K, { name: "one more", main: [DM], side: [], extra: [] }))[0]).toBe(409);
  expect((await deckPut(db, K, { name: "D0", main: [DMG], side: [], extra: [] }))[0]).toBe(200);     // an update is fine
  for (const bad of ["a/b", "a\\b", "a:b", "a*b", "a?b", 'a"b', "a<b", "a|b", "a\u0001b", "", "  ", "x".repeat(41)])
    expect(deckIn({ name: bad, main: [DM] })).toBe("bad name");
  expect(deckIn({ name: "ok", main: [123] })).toBe("bad cards");                                       // no such card
  expect(deckIn({ name: "ok", main: Array(81).fill(DM) })).toBe("bad cards");
  expect(deckIn({ name: "ok", main: [DM], side: Array(16).fill(DM) })).toBe("bad cards");
  expect(deckIn({ name: "ブルーアイズ・デッキ", main: [] })).toEqual({ name: "ブルーアイズ・デッキ", main: [], side: [], extra: [] });
  expect(deckIn({ name: "DOGS, CATS AND SPACE", main: [DM] })).toEqual({ name: "DOGS, CATS AND SPACE", main: [DM], side: [], extra: [] });
  expect(nameOk("あ".repeat(40))).toBe(true);
  expect([currentOf({ current: true, mode: "free" }), currentOf({ current: true }), currentOf({})]).toEqual(["free", "bad mode", null]);
});
