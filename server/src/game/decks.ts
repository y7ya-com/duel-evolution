// The player's own decks on the server (phase2-duel's Deck folder sync): per character, in D1 (user_decks,
// user_deck_current), never in the WorldDO's state. The World and Free Duel share the list; each mode has its own
// current deck. The web client's page JS reads them at player select and writes each Edit Deck save/delete; last
// write wins (server time). Ownership isn't checked here: in the World the duel's deck check (duel/deckCheck.ts,
// against the trunk, bloquear with progression) keeps an unowned deck out of play.
import type { Game } from "./game.ts";
import * as PP from "./persist.ts";
import { legalDeck, STARTER_DECKS } from "./starter.ts";

export const DECKS_MAX = 60, MAIN_MAX = 80, SIDE_MAX = 15, EXTRA_MAX = 30, NAME_MAX = 40;
export const MODES = ["world", "free"] as const;
type Mode = typeof MODES[number];
// any Unicode (the client maps it to Shift-JIS file names) but what a Windows file name can't hold
const BAD_NAME = /[\\/:*?"<>|\u0000-\u001f\u007f]/;

export type DeckIn = { name: string; main: number[]; side: number[]; extra: number[] };
export type Owner = { key: string; starter: number | null };
type Res = [number, Record<string, unknown>];

/** The signed-in player's active character ("<acct>/<slot>") and its claimed starter deck, or why there is none. */
export function deckOwner(g: Game, userId: string): Owner | Res {
  const acct = g.store.accountOfUser(userId);
  const s = acct ? g.hub.sessions.get(acct) : undefined;
  if (!s) return [409, { error: "not-in-game" }];
  if (s.slot === null) return [409, { error: "no-character" }];
  const p = g.withCtx(s, () => PP.profile(g.loadState(), s.slot!, false));
  const st = p && PP.int(p.starter ?? 0);
  return { key: `${acct}/${s.slot}`, starter: st && st in STARTER_DECKS ? st : null };
}

export const nameOk = (n: unknown): n is string =>
  typeof n === "string" && n.trim() !== "" && [...n].length <= NAME_MAX && !BAD_NAME.test(n);
const modeOf = (m: unknown): Mode | null => (MODES as readonly unknown[]).includes(m) ? m as Mode : null;
const cards = (v: unknown, max: number): number[] | null =>
  Array.isArray(v) && v.length <= max && v.every((c) => Number.isInteger(c) && PP.cardOk(c)) ? (v as number[]) : null;

/** A PUT body checked: the name, and the three zones as passcodes that exist, in order, within the limits. */
export function deckIn(b: unknown): DeckIn | string {
  const o = (b ?? {}) as Record<string, unknown>;
  if (!nameOk(o.name)) return "bad name";
  const main = cards(o.main ?? [], MAIN_MAX), side = cards(o.side ?? [], SIDE_MAX), extra = cards(o.extra ?? [], EXTRA_MAX);
  if (!main || !side || !extra) return "bad cards";
  return { name: o.name, main, side, extra };
}

type Row = { name: string; main: string; side: string; extra: string; updated: number; deleted: number };

const one = (db: D1Database, key: string, name: string) =>
  db.prepare("SELECT * FROM user_decks WHERE char_key = ? AND name = ?").bind(key, name).first<Row>();
const setCurrent = (db: D1Database, key: string, mode: Mode, name: string, now: number) =>
  db.prepare(`INSERT INTO user_deck_current (char_key, mode, name, updated) VALUES (?, ?, ?, ?)
    ON CONFLICT (char_key, mode) DO UPDATE SET name = excluded.name, updated = excluded.updated`).bind(key, mode, name, now);

export async function decksGet(db: D1Database, o: Owner, now = Date.now()): Promise<Res> {
  // a starter claimed before the deck store: its deck once (not over the player's tombstone), the World's current if none
  if (o.starter !== null) {
    const name = STARTER_DECKS[o.starter][0];
    if (!(await one(db, o.key, name))) {
      const d = legalDeck(o.starter);
      const cur = await db.prepare("SELECT 1 FROM user_deck_current WHERE char_key = ? AND mode = 'world'").bind(o.key).first();
      await deckPut(db, o.key, { name, main: d.main, side: [], extra: d.extra }, cur ? null : "world", now);
    }
  }
  const rows = (await db.prepare("SELECT * FROM user_decks WHERE char_key = ? ORDER BY name").bind(o.key).all<Row>()).results;
  const curs = (await db.prepare("SELECT mode, name FROM user_deck_current WHERE char_key = ?").bind(o.key).all<{ mode: string; name: string }>()).results;
  const live = rows.filter((r) => !r.deleted);
  const current = Object.fromEntries(MODES.map((m) => [m, curs.find((c) => c.mode === m && live.some((r) => r.name === c.name))?.name ?? null]));
  return [200, {
    current,
    decks: live.map((r) => ({ name: r.name, main: JSON.parse(r.main), side: JSON.parse(r.side), extra: JSON.parse(r.extra), updated: r.updated })),
    deleted: rows.filter((r) => r.deleted).map((r) => ({ name: r.name, updated: r.updated })),
  }];
}

/** Upsert (a tombstone comes back to life); `current` = the mode whose current deck it becomes. */
export async function deckPut(db: D1Database, key: string, d: DeckIn, current: Mode | null = null, now = Date.now()): Promise<Res> {
  const old = await one(db, key, d.name);
  if (!old || old.deleted) {
    const n = await db.prepare("SELECT count(*) AS n FROM user_decks WHERE char_key = ? AND deleted = 0").bind(key).first<{ n: number }>();
    if ((n?.n ?? 0) >= DECKS_MAX) return [409, { error: "too many decks" }];
  }
  const q = [db.prepare(`INSERT INTO user_decks (char_key, name, main, side, extra, updated, deleted) VALUES (?, ?, ?, ?, ?, ?, 0)
    ON CONFLICT (char_key, name) DO UPDATE SET main = excluded.main, side = excluded.side, extra = excluded.extra,
    updated = excluded.updated, deleted = 0`).bind(key, d.name, JSON.stringify(d.main), JSON.stringify(d.side), JSON.stringify(d.extra), now)];
  if (current) q.push(setCurrent(db, key, current, d.name, now));
  await db.batch(q);
  return [200, { updated: now }];
}

/** A PUT body's `current: true` with its `mode` (null when it isn't asked; a string when the mode is wrong). */
export function currentOf(b: Record<string, unknown> | null): Mode | null | "bad mode" {
  if (b?.current !== true) return null;
  return modeOf(b.mode) ?? "bad mode";
}

export async function deckCurrent(db: D1Database, key: string, b: Record<string, unknown> | null, now = Date.now()): Promise<Res> {
  const mode = modeOf(b?.mode);
  if (!mode) return [400, { error: "bad mode" }];
  const old = nameOk(b?.name) ? await one(db, key, b!.name as string) : null;
  if (!old || old.deleted) return [404, { error: "no such deck" }];
  await setCurrent(db, key, mode, old.name, now).run();
  return [200, { updated: now }];
}

/** A tombstone: the cards are dropped, the name kept with the time, so another device doesn't upload it again. */
export async function deckDelete(db: D1Database, key: string, name: string, now = Date.now()): Promise<Res> {
  const old = await one(db, key, name);
  if (!old || old.deleted) return [404, { error: "no such deck" }];
  await db.batch([
    db.prepare("UPDATE user_decks SET main = '[]', side = '[]', extra = '[]', updated = ?, deleted = 1 WHERE char_key = ? AND name = ?").bind(now, key, name),
    db.prepare("DELETE FROM user_deck_current WHERE char_key = ? AND name = ?").bind(key, name),
  ]);
  return [200, { updated: now }];
}
