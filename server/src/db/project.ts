// state.json <-> D1 rows (db/game-schema.ts), exactly: rowsToState(stateToRows(st)) is st again, deep-equal after a
// JSON round trip and with the same key order (py storage/project.py had the same goal with JSON skeletons; here
// every known value is a typed column or a row).
//
// How the exact round trip works:
//  - Every known key is a column or a child table. A record's keys come back in a fixed default order ("master"
//    order, the order py writes them in), filtered by presence: a scalar is present when its column is not NULL, a
//    "must" container (rec, trunk, decks…) is always present, an "opt" one (friends, pvp…) when it left rows. A map's
//    default order is the JS one: integer-like keys ascending, then the other keys sorted.
//  - When an object's real keys differ from that default (another order, a key holding null, an empty optional
//    list…), its key list goes to state_shapes (path -> keys). The root's is always stored.
//  - A value the tables cannot hold (unknown key, wrong type: a float, a string where an int goes, a malformed tuple)
//    goes to state_extras (path, key -> JSON). Nothing is dropped; for the real states there are none.
//  Paths are JSON pointers into state.json ("" = root, "/accounts/<acct>/profiles/0/rec").
//
// What cannot be preserved, and why it does not matter: py's insertion order of integer-like keys (trunk card ids,
// npcbin npc ids, slots, team ids). JSON.parse already puts those first and in ascending order, so the TS server never
// sees py's order to begin with, and no handler depends on it (trunk/npcbin are read by id, slots are sorted).
//
// Writes: Projector keeps the last written rows per unit (each character is a unit, the rest of the state another);
// a save re-projects only the characters whose JSON changed and diffs rows by primary key: an upsert for each new or
// changed row, a delete for each row gone (db/d1.ts turns that into one D1 batch).
import { getTableConfig, type SQLiteTable } from "drizzle-orm/sqlite-core";
import type { State } from "../game/store.ts";
import * as G from "./game-schema.ts";

export type Val = string | number | null;
export type Row = Record<string, Val>;
/** Rows per SQL table name. */
export type Rows = Record<string, Row[]>;

const STATE_TABLES: SQLiteTable[] = [
  G.accounts, G.accountPlayers, G.logins, G.loginAliases, G.characters, G.trunkCards, G.titles, G.npcProgress, G.claims,
  G.pendingItems, G.pendingItemBits, G.pendingItemCards, G.pvpCardDues, G.pvpCardDuePacks, G.npcCardDues,
  G.characterFriends, G.lastDuelDecks, G.lastDuelCards, G.lastDuelMissing, G.lastDuelBadIds, G.deckHistory,
  G.deckHistoryCards, G.deckHistoryProblems, G.archivedCharacters, G.world, G.mail, G.lobbyFriends, G.lobbyBlack,
  G.lobbyTeamMembers, G.teams, G.teamMembers, G.stateShapes, G.stateExtras,
];

export interface TableMeta { name: string; cols: string[]; pk: string[] }
export const tableMeta = (t: SQLiteTable): TableMeta => {
  const c = getTableConfig(t);
  const pk = c.primaryKeys.length ? c.primaryKeys[0].columns.map((x) => x.name) : c.columns.filter((x) => x.primary).map((x) => x.name);
  return { name: c.name, cols: c.columns.map((x) => x.name), pk };
};
/** The tables the state projects to, with their columns and primary keys (SQL names). */
export const TABLES: TableMeta[] = STATE_TABLES.map(tableMeta);
export const TABLE: Record<string, TableMeta> = Object.fromEntries(TABLES.map((t) => [t.name, t]));

export const OWNER = "_owner";
/** py ACCT_KEYS: at the root they are the owner's account. */
const ACCT_KEYS = ["players", "profiles", "active_slot", "wallet", "profiles_borrados"];

// ---------------------------------------------------------------- small helpers
type Obj = Record<string, any>;
const isObj = (v: unknown): v is Obj => typeof v === "object" && v !== null && !Array.isArray(v);
const isInt = (v: unknown): v is number => Number.isSafeInteger(v);
const isIdx = (k: string) => /^(0|[1-9]\d{0,9})$/.test(k) && Number(k) < 4294967295;
const esc = (k: string) => k.replace(/~/g, "~0").replace(/\//g, "~1");
const child = (path: string, k: string | number) => `${path}/${esc(String(k))}`;
const same = (a: string[], b: string[]) => a.length === b.length && a.every((x, i) => x === b[i]);
/** JS key order for these keys: integer-like ones ascending, then the rest (sorted, as the default). */
const canon = (keys: Iterable<string>): string[] => {
  const ints: string[] = [], strs: string[] = [];
  for (const k of new Set(keys)) (isIdx(k) ? ints : strs).push(k);
  return [...ints.sort((a, b) => Number(a) - Number(b)), ...strs.sort()];
};
const put = (o: Obj, k: string, v: unknown) => {
  if (k === "__proto__") Object.defineProperty(o, k, { value: v, enumerable: true, writable: true, configurable: true });
  else o[k] = v;
};

type T = "int" | "text" | "bool";
const fits = (t: T, v: unknown) => v === null || (t === "int" ? isInt(v) : t === "text" ? typeof v === "string" : typeof v === "boolean");
const enc = (t: T, v: unknown): Val => (v === null ? null : t === "bool" ? (v ? 1 : 0) : (v as Val));
const dec = (t: T, v: Val | undefined): unknown => (v === null || v === undefined ? null : t === "bool" ? !!v : v);

// ---------------------------------------------------------------- writer
type Emit = [table: string, row: Row];
interface Unit { json: string; rows: Emit[] }

class Out {
  units = new Map<string, Unit>();
  cur: Emit[] = [];
  private cache: Map<string, Unit> | null;
  constructor(cache: Map<string, Unit> | null) { this.cache = cache; }
  row(t: string, r: Row) { this.cur.push([t, r]); }
  shape(path: string, keys: string[]) { this.row("state_shapes", { path, keys: JSON.stringify(keys) }); }
  extra(path: string, key: string, v: unknown) { this.row("state_extras", { path, key, value: JSON.stringify(v) }); }
  /** Rows of one unit (a character): reused as they are when its JSON did not change since the cached projection. */
  unit(id: string, obj: unknown, fn: () => void, cacheable = true) {
    const json = this.cache && cacheable ? JSON.stringify(obj) : "";
    const prev = this.cache?.get(id);
    if (cacheable && prev && prev.json === json) { this.units.set(id, prev); return; }
    const saved = this.cur;
    this.cur = [];
    fn();
    this.units.set(id, { json, rows: this.cur });
    this.cur = saved;
  }
}

// ---------------------------------------------------------------- reader index
class Ix {
  shapes = new Map<string, string[]>();
  extras = new Map<string, Map<string, unknown>>();
  private groups = new Map<string, Map<string, Row[]>>();
  readonly rows: Rows;
  constructor(rows: Rows) {
    this.rows = rows;
    for (const r of rows.state_shapes ?? []) this.shapes.set(r.path as string, JSON.parse(r.keys as string));
    for (const r of rows.state_extras ?? []) {
      let m = this.extras.get(r.path as string);
      if (!m) this.extras.set(r.path as string, (m = new Map()));
      m.set(r.key as string, JSON.parse(r.value as string));
    }
  }
  shape(path: string) { return this.shapes.get(path); }
  ex(path: string) { return this.extras.get(path); }
  /** Rows of table whose `by` columns equal key (joined with \0). */
  g(table: string, by: string[], key: string): Row[] {
    const gk = table + "|" + by.join(",");
    let m = this.groups.get(gk);
    if (!m) {
      this.groups.set(gk, (m = new Map()));
      for (const r of this.rows[table] ?? []) {
        const k = by.map((c) => String(r[c])).join("\0");
        let a = m.get(k);
        if (!a) m.set(k, (a = []));
        a.push(r);
      }
    }
    return m.get(key) ?? [];
  }
}

// ---------------------------------------------------------------- record / list / map codecs
/** C = context (character id, positions…) shared by a record's fields. row = the row holding its scalar columns. */
interface F {
  k: string;
  kind: "s" | "must" | "opt";
  col?: string;
  t?: T;
  /** Writes a container; null = it does not fit (the value goes to state_extras), else whether it left a trace. */
  w?: (o: Out, path: string, v: any, c: any, row: Row) => boolean | null;
  r?: (ix: Ix, path: string, c: any, row: Row | undefined) => unknown;
  /** opt containers: did it leave a trace (rows, extras, a shape)? */
  has?: (ix: Ix, path: string, c: any, row: Row | undefined) => boolean;
}
const s = (k: string, t: T, col = k): F => ({ k, kind: "s", t, col });
const byKey = new WeakMap<F[], Map<string, F>>();
const fmap = (fs: F[]) => { let m = byKey.get(fs); if (!m) byKey.set(fs, (m = new Map(fs.map((f) => [f.k, f])))); return m; };

/** Writes one field; returns [stored?, present-by-default?]. */
function wField(o: Out, path: string, f: F | undefined, v: unknown, c: unknown, row: Row): [boolean, boolean] {
  if (!f) return [false, true];
  if (f.kind === "s") return fits(f.t!, v) ? (row[f.col!] = enc(f.t!, v), [true, v !== null]) : [false, true];
  const r = f.w!(o, child(path, f.k), v, c, row);
  return r === null ? [false, true] : [true, f.kind === "must" || r];
}

/** A record (object with known keys). Returns whether it left a trace (for an optional record). */
function wRec(o: Out, path: string, obj: Obj, fs: F[], c: unknown, row: Row): boolean {
  const by = fmap(fs);
  const gone = RETIRED.get(fs);
  const keys = gone ? Object.keys(obj).filter((k) => !gone.has(k)) : Object.keys(obj);
  const pres = new Set<string>();
  let trace = false;
  for (const k of keys) {
    const f = by.get(k);
    const [ok, p] = wField(o, path, f, obj[k], c, row);
    if (!ok) { o.extra(path, k, obj[k]); trace = true; }
    else if (f!.kind === "s" && p) trace = true;
    if (p) pres.add(k);
  }
  if (!same(keys, fs.filter((f) => f.kind === "must" || pres.has(f.k)).map((f) => f.k))) { o.shape(path, keys); trace = true; }
  return trace;
}

function rField(ix: Ix, path: string, f: F, c: unknown, row: Row | undefined): unknown {
  return f.kind === "s" ? dec(f.t!, row?.[f.col!]) : f.r!(ix, child(path, f.k), c, row);
}
function rPresent(ix: Ix, path: string, f: F, c: unknown, row: Row | undefined): boolean {
  if (f.kind === "must") return true;
  if (f.kind === "s") return row?.[f.col!] != null;
  return f.has!(ix, child(path, f.k), c, row);
}
function rRec(ix: Ix, path: string, fs: F[], c: unknown, row: Row | undefined): Obj {
  const ex = ix.ex(path);
  const by = fmap(fs);
  const keys = ix.shape(path) ?? fs.filter((f) => ex?.has(f.k) || rPresent(ix, path, f, c, row)).map((f) => f.k);
  const out: Obj = {};
  for (const k of keys) put(out, k, ex?.has(k) ? ex.get(k) : rField(ix, path, by.get(k)!, c, row));
  return out;
}
/** Did an optional record leave a trace: a scalar column, its shape or an extra. */
const recHas = (fs: F[]) => (ix: Ix, path: string, _c: unknown, row: Row | undefined) =>
  fs.some((f) => f.kind === "s" && row?.[f.col!] != null) || ix.shapes.has(path) || ix.extras.has(path);

/** A list: each item is stored by `item` (false = it goes to extras under the list's path, key = its index). */
function wList(o: Out, path: string, v: unknown, item: (i: number, x: any) => boolean): boolean | null {
  if (!Array.isArray(v)) return null;
  v.forEach((x, i) => { if (!item(i, x)) o.extra(path, String(i), x); });
  return v.length > 0;
}
function rList(ix: Ix, path: string, items: Map<number, unknown>): unknown[] {
  const ex = ix.ex(path);
  let n = 0;
  for (const i of items.keys()) n = Math.max(n, i + 1);
  if (ex) for (const k of ex.keys()) n = Math.max(n, Number(k) + 1);
  const out = new Array(n);
  for (let i = 0; i < n; i++) out[i] = ex?.has(String(i)) ? ex.get(String(i)) : items.get(i);
  return out;
}
/** A map (any keys): entries stored by `entry` (false = extras); the key order goes to a shape when not the default. */
function wMap(o: Out, path: string, v: unknown, entry: (k: string, x: any) => boolean): boolean | null {
  if (!isObj(v)) return null;
  const keys = Object.keys(v);
  for (const k of keys) if (!entry(k, v[k])) o.extra(path, k, v[k]);
  if (!same(keys, canon(keys))) o.shape(path, keys);
  return keys.length > 0;
}
function rMap(ix: Ix, path: string, entries: Map<string, unknown>): Obj {
  const ex = ix.ex(path);
  const keys = ix.shape(path) ?? canon([...entries.keys(), ...(ex?.keys() ?? [])]);
  const out: Obj = {};
  for (const k of keys) put(out, k, ex?.has(k) ? ex.get(k) : entries.get(k));
  return out;
}
const listHas = (table: string, by: string[], key: (c: any) => string) => (ix: Ix, path: string, c: any) =>
  ix.g(table, by, key(c)).length > 0 || ix.extras.has(path);
const posMap = (rows: Row[], f: (r: Row) => unknown) => new Map(rows.map((r) => [r.pos as number, f(r)]));

/** A list of integers stored one per row: table (owner columns…, pos, col). */
function intList(table: string, col: string, owner: (c: any) => Row, ownerCols: string[]): Pick<F, "w" | "r" | "has"> {
  const key = (c: any) => ownerCols.map((k) => String(owner(c)[k])).join("\0");
  return {
    w: (o, path, v, c) => wList(o, path, v, (pos, x) => isInt(x) && (o.row(table, { ...owner(c), pos, [col]: x }), true)),
    r: (ix, path, c) => rList(ix, path, posMap(ix.g(table, ownerCols, key(c)), (r) => r[col])),
    has: listHas(table, ownerCols, key),
  };
}

// ---------------------------------------------------------------- the entities
type CC = { id: string };                      // a character
type CP = { id: string; pos: number };         // an item of a character's list

const REC_FIELDS: F[] = G.REC_KEYS.map((k) => s(k, "int"));
const AVATAR_FIELDS: F[] = [s("b", "text", "avatar_b"), s("a", "text", "avatar_a")];
const LAST_NPC_FIELDS: F[] = [s("npc", "int", "last_npc"), s("result", "text", "last_result"), s("present", "int", "last_present")];
const WALLET_FIELDS: F[] = [s("mp", "int", "wallet_mp")];

const zoneCards = (table: string, zone: string, owner: (c: any) => Row, ownerCols: string[]): F => {
  const key = (c: any) => ownerCols.map((k) => String(owner(c)[k])).join("\0") + "\0" + zone;
  return {
    k: zone, kind: "must",
    w: (o, path, v, c) => wList(o, path, v, (pos, x) => isInt(x) && (o.row(table, { ...owner(c), zone, pos, card: x }), true)),
    r: (ix, path, c) => rList(ix, path, posMap(ix.g(table, [...ownerCols, "zone"], key(c)), (r) => r.card)),
  };
};

const LAST_DUEL_FIELDS: F[] = [
  zoneCards("last_duel_cards", "main", (c: CC) => ({ char_id: c.id }), ["char_id"]),
  zoneCards("last_duel_cards", "extra", (c: CC) => ({ char_id: c.id }), ["char_id"]),
  s("side_count", "int"),
  {
    k: "missing", kind: "opt",
    w: (o, path, v, c: CC) => wMap(o, path, v, (k, n) => isIdx(k) && isInt(n) && (o.row("last_duel_missing", { char_id: c.id, card: Number(k), n }), true)),
    r: (ix, path, c: CC) => rMap(ix, path, new Map(ix.g("last_duel_missing", ["char_id"], c.id).map((r) => [String(r.card), r.n]))),
    has: (ix, path, c: CC) => ix.g("last_duel_missing", ["char_id"], c.id).length > 0 || ix.extras.has(path) || ix.shapes.has(path),
  },
  { k: "bad_ids", kind: "opt", ...intList("last_duel_bad_ids", "card", (c: CC) => ({ char_id: c.id }), ["char_id"]) },
];

const PROBLEM_FIELDS: F[] = [
  s("regla", "text", "rule"), s("id", "int", "card"), s("nombre", "text", "card_name"), s("usa", "int", "uses"),
  s("tiene", "int", "has"), s("max", "int"), s("min", "int"), s("zona", "text", "zone"), s("texto", "text", "text"),
];
const HIST_FIELDS: F[] = [
  s("hash", "text"),
  zoneCards("deck_history_cards", "main", (c: CP) => ({ char_id: c.id, hist_pos: c.pos }), ["char_id", "hist_pos"]),
  zoneCards("deck_history_cards", "extra", (c: CP) => ({ char_id: c.id, hist_pos: c.pos }), ["char_id", "hist_pos"]),
  s("primera", "int", "first_at"), s("duelos", "int", "duels"), s("ultima", "int", "last_at"), s("valido", "bool", "valid"),
  {
    k: "problemas", kind: "must",
    w: (o, path, v, c: CP) => wList(o, path, v, (pos, x) => {
      if (!isObj(x)) return false;
      const row: Row = { char_id: c.id, hist_pos: c.pos, pos };
      wRec(o, child(path, pos), x, PROBLEM_FIELDS, null, row);
      o.row("deck_history_problems", row);
      return true;
    }),
    r: (ix, path, c: CP) => rList(ix, path, posMap(ix.g("deck_history_problems", ["char_id", "hist_pos"], `${c.id}\0${c.pos}`),
      (r) => rRec(ix, child(path, r.pos as number), PROBLEM_FIELDS, null, r))),
  },
];

const PENDING_FIELDS: F[] = [
  { k: "bits", kind: "must", ...intList("pending_item_bits", "bit", (c: CP) => ({ char_id: c.id, item_pos: c.pos }), ["char_id", "item_pos"]) },
  { k: "cards", kind: "must", ...intList("pending_item_cards", "card", (c: CP) => ({ char_id: c.id, item_pos: c.pos }), ["char_id", "item_pos"]) },
  s("via", "text"), s("src", "text"),
];
const PVP_DUE_FIELDS: F[] = [
  { k: "packs", kind: "must", ...intList("pvp_card_due_packs", "pack", (c: CP) => ({ char_id: c.id, due_pos: c.pos }), ["char_id", "due_pos"]) },
  s("n", "int"), s("t", "int"),
];

/** A list of records, one row each in `table` (char_id, pos, …). */
function recList(table: string, fs: F[]): Pick<F, "w" | "r" | "has"> {
  return {
    w: (o, path, v, c: CC) => wList(o, path, v, (pos, x) => {
      if (!isObj(x)) return false;
      const row: Row = { char_id: c.id, pos };
      wRec(o, child(path, pos), x, fs, { id: c.id, pos }, row);
      o.row(table, row);
      return true;
    }),
    r: (ix, path, c: CC) => rList(ix, path, posMap(ix.g(table, ["char_id"], c.id),
      (r) => rRec(ix, child(path, r.pos as number), fs, { id: c.id, pos: r.pos }, r))),
    has: listHas(table, ["char_id"], (c: CC) => c.id),
  };
}

const optRec = (k: string, fs: F[]): F => ({
  k, kind: "opt",
  w: (o, path, v, c, row) => (isObj(v) ? wRec(o, path, v, fs, c, row) : null),
  r: (ix, path, c, row) => rRec(ix, path, fs, c, row),
  has: recHas(fs),
});
const mustRec = (k: string, fs: F[]): F => ({
  k, kind: "must",
  w: (o, path, v, c, row) => (isObj(v) ? (wRec(o, path, v, fs, c, row), true) : null),
  r: (ix, path, c, row) => rRec(ix, path, fs, c, row),
});

const PVP_LAST_FIELDS: F[] = [s("result", "int", "pvp_last_result"), s("t", "int", "pvp_last_t")];
const PVP_FIELDS: F[] = [s("n", "int", "pvp_n"), optRec("last", PVP_LAST_FIELDS)];
const PROFILE_FIELDS: F[] = [
  s("name", "text"),
  mustRec("rec", REC_FIELDS),
  {
    k: "trunk", kind: "must",
    w: (o, path, v, c: CC) => wMap(o, path, v, (k, q) => isIdx(k) && isInt(q) && (o.row("trunk_cards", { char_id: c.id, card: Number(k), qty: q }), true)),
    r: (ix, path, c: CC) => rMap(ix, path, new Map(ix.g("trunk_cards", ["char_id"], c.id).map((r) => [String(r.card), r.qty]))),
  },
  {
    // py keeps PBIN as a sorted list of distinct bits; anything else goes to extras whole
    k: "pbin", kind: "must",
    w: (o, _path, v, c: CC) => {
      if (!Array.isArray(v) || !v.every((b, i) => isInt(b) && (i === 0 || b > v[i - 1]))) return null;
      for (const bit of v) o.row("titles", { char_id: c.id, bit });
      return v.length > 0;
    },
    r: (ix, _path, c: CC) => ix.g("titles", ["char_id"], c.id).map((r) => r.bit as number).sort((a, b) => a - b),
  },
  {
    k: "npcbin", kind: "must",
    w: (o, path, v, c: CC) => wMap(o, path, v, (k, e) => isIdx(k) && Array.isArray(e) && e.length === 4 && e.every(isInt) &&
      (o.row("npc_progress", { char_id: c.id, npc: Number(k), b0: e[0], b1: e[1], b2: e[2], b3: e[3] }), true)),
    r: (ix, path, c: CC) => rMap(ix, path, new Map(ix.g("npc_progress", ["char_id"], c.id).map((r) => [String(r.npc), [r.b0, r.b1, r.b2, r.b3]]))),
  },
  mustRec("avatar", AVATAR_FIELDS),
  {
    k: "decks", kind: "must",
    w: (o, path, v, c: CC) => wMap(o, path, v, (k, d) => {
      if (k === "last_duel" && isObj(d)) {
        const row: Row = { char_id: c.id };
        wRec(o, child(path, k), d, LAST_DUEL_FIELDS, c, row);
        o.row("last_duel_decks", row);
        return true;
      }
      // an empty history would leave no row to say it is there: extras
      if (k === "historial" && Array.isArray(d) && d.length) return !!HIST.w!(o, child(path, k), d, c, {});
      return false;
    }),
    r: (ix, path, c: CC) => {
      const m = new Map<string, unknown>();
      const ld = ix.g("last_duel_decks", ["char_id"], c.id)[0];
      if (ld) m.set("last_duel", rRec(ix, child(path, "last_duel"), LAST_DUEL_FIELDS, c, ld));
      if (ix.g("deck_history", ["char_id"], c.id).length) m.set("historial", HIST.r!(ix, child(path, "historial"), c, undefined));
      return rMap(ix, path, m);
    },
  },
  {
    k: "claims", kind: "must",
    w: (o, path, v, c: CC) => wList(o, path, v, (pos, x) => Array.isArray(x) && x.length === 3 && typeof x[0] === "string" &&
      isInt(x[1]) && isInt(x[2]) && (o.row("claims", { char_id: c.id, pos, kind: x[0], deck: x[1], bit: x[2] }), true)),
    r: (ix, path, c: CC) => rList(ix, path, posMap(ix.g("claims", ["char_id"], c.id), (r) => [r.kind, r.deck, r.bit])),
  },
  { k: "pending", kind: "must", ...recList("pending_items", PENDING_FIELDS) },
  s("country", "text"),
  optRec("last_npc_end", LAST_NPC_FIELDS),
  s("team", "int"),
  { k: "friends", kind: "opt", ...intList("character_friends", "pid", (c: CC) => ({ char_id: c.id }), ["char_id"]) },
  optRec("pvp", PVP_FIELDS),
  { k: "pvp_card_due", kind: "opt", ...recList("pvp_card_dues", PVP_DUE_FIELDS) },
  { k: "npc_card_due", kind: "opt", ...intList("npc_card_dues", "pack", (c: CC) => ({ char_id: c.id }), ["char_id"]) },
];
const HIST: F = { k: "historial", kind: "must", ...recList("deck_history", HIST_FIELDS) };

function wChar(o: Out, id: string, acct: string, slot: string | null, p: Obj) {
  o.unit(id, p, () => {
    const row: Row = { id, acct, slot };
    wRec(o, id, p, PROFILE_FIELDS, { id }, row);
    o.row("characters", row);
  });
}
function rChar(ix: Ix, id: string): Obj {
  return rRec(ix, id, PROFILE_FIELDS, { id }, ix.g("characters", ["id"], id)[0]);
}

type CA = { acct: string };
const ARCHIVED_FIELDS: F[] = [
  s("slot", "text"), s("motivo", "text", "reason"), s("fecha", "text", "archived_at"),
  {
    k: "perfil", kind: "must",
    w: (o, path, v, c: CA) => (isObj(v) ? (wChar(o, path, c.acct, null, v), true) : null),
    r: (ix, path) => rChar(ix, path),
  },
];

const ACCOUNT_FIELDS: F[] = [
  s("idx", "int"),
  {
    k: "players", kind: "must",
    w: (o, path, v, c: CA) => wMap(o, path, v, (slot, name) => fits("text", name) && (o.row("account_players", { acct: c.acct, slot, name }), true)),
    r: (ix, path, c: CA) => rMap(ix, path, new Map(ix.g("account_players", ["acct"], c.acct).map((r) => [r.slot as string, r.name]))),
  },
  {
    k: "profiles", kind: "must",
    w: (o, path, v, c: CA) => wMap(o, path, v, (slot, p) => isObj(p) && (wChar(o, child(path, slot), c.acct, slot, p), true)),
    r: (ix, _path, c: CA) => {
      const m = new Map<string, unknown>();
      for (const r of ix.g("characters", ["acct"], c.acct)) if (r.slot !== null) m.set(r.slot as string, rChar(ix, r.id as string));
      return rMap(ix, _path, m);
    },
  },
  s("active_slot", "int"),
  optRec("wallet", WALLET_FIELDS),
  {
    k: "profiles_borrados", kind: "opt",
    w: (o, path, v, c: CA) => wList(o, path, v, (pos, e) => {
      if (!isObj(e)) return false;
      const ep = child(path, pos);
      const row: Row = { acct: c.acct, pos, char_id: child(ep, "perfil") };
      wRec(o, ep, e, ARCHIVED_FIELDS, c, row);
      o.row("archived_characters", row);
      return true;
    }),
    r: (ix, path, c: CA) => rList(ix, path, posMap(ix.g("archived_characters", ["acct"], c.acct),
      (r) => rRec(ix, child(path, r.pos as number), ARCHIVED_FIELDS, c, r))),
    has: listHas("archived_characters", ["acct"], (c: CA) => c.acct),
  },
  s("user_id", "text"),
];

const LOGINS_FIELDS: F[] = [
  {
    k: "alias", kind: "must",
    w: (o, path, v) => wMap(o, path, v, (alias, acct) => fits("text", acct) && (o.row("login_aliases", { alias, acct }), true)),
    r: (ix, path) => rMap(ix, path, new Map((ix.rows.login_aliases ?? []).map((r) => [r.alias as string, r.acct]))),
  },
  {
    k: "usuarios", kind: "must",
    w: (o, path, v) => wMap(o, path, v, (acct, user) => fits("text", user) && (o.row("logins", { acct, user }), true)),
    r: (ix, path) => rMap(ix, path, new Map((ix.rows.logins ?? []).map((r) => [r.acct as string, r.user]))),
  },
];

/** A root-level list of ints: table (pos, col). */
const rootIntList = (table: string, col: string): Pick<F, "w" | "r"> => ({
  w: (o, path, v) => wList(o, path, v, (pos, x) => isInt(x) && (o.row(table, { pos, [col]: x }), true)),
  r: (ix, path) => rList(ix, path, posMap(ix.rows[table] ?? [], (r) => r[col])),
});
const MAIL_FIELDS: F[] = [
  s("id", "int"), s("from", "int", "from_pid"), s("from_name", "text"), s("to", "int", "to_pid"), s("to_name", "text"),
  s("subject", "text"), s("body", "text"), s("t", "int", "sent_at"), s("extra", "text"), s("read", "bool"),
];
const LOBBY_TEAM_FIELDS: F[] = [
  s("id", "int", "lobby_team_id"), s("name", "text", "lobby_team_name"),
  {
    k: "members", kind: "must",
    w: (o, path, v) => wList(o, path, v, (pos, m) => Array.isArray(m) && m.length === 2 && isInt(m[0]) && typeof m[1] === "string" &&
      (o.row("lobby_team_members", { pos, pid: m[0], name: m[1] }), true)),
    r: (ix, path) => rList(ix, path, posMap(ix.rows.lobby_team_members ?? [], (r) => [r.pid, r.name])),
  },
];
const LOBBY_FIELDS: F[] = [
  {
    k: "mail", kind: "must",
    w: (o, path, v) => wList(o, path, v, (pos, m) => {
      if (!isObj(m)) return false;
      const row: Row = { pos };
      wRec(o, child(path, pos), m, MAIL_FIELDS, null, row);
      o.row("mail", row);
      return true;
    }),
    r: (ix, path) => rList(ix, path, posMap(ix.rows.mail ?? [], (r) => rRec(ix, child(path, r.pos as number), MAIL_FIELDS, null, r))),
  },
  s("next_mail", "int", "lobby_next_mail"),
  { k: "friends", kind: "must", ...rootIntList("lobby_friends", "pid") },
  { k: "black", kind: "must", ...rootIntList("lobby_black", "pid") },
  {
    // null (no team) or {id, name, members}; world.lobby_team says which
    k: "team", kind: "opt",
    w: (o, path, v, _c, row) => {
      if (v === null) { row.lobby_team = 0; return true; }
      if (!isObj(v)) return null;
      row.lobby_team = 1;
      wRec(o, path, v, LOBBY_TEAM_FIELDS, null, row);
      return true;
    },
    r: (ix, path, _c, row) => (row?.lobby_team === 0 ? null : rRec(ix, path, LOBBY_TEAM_FIELDS, null, row)),
    has: (_ix, _path, _c, row) => row?.lobby_team != null,
  },
];
const TEAM_FIELDS: F[] = [
  s("id", "int"), s("name", "text"), s("flag", "text"), s("leader", "int"),
  {
    k: "members", kind: "must",
    w: (o, path, v, c: { key: string }) => wList(o, path, v, (pos, m) => Array.isArray(m) && m.length === 3 && isInt(m[0]) &&
      typeof m[1] === "string" && isInt(m[2]) && (o.row("team_members", { team_key: c.key, pos, pid: m[0], name: m[1], auth: m[2] }), true)),
    r: (ix, path, c: { key: string }) => rList(ix, path, posMap(ix.g("team_members", ["team_key"], c.key), (r) => [r.pid, r.name, r.auth])),
  },
  s("created", "int"),
];
const EQUIPOS_FIELDS: F[] = [
  s("next_id", "int", "equipos_next_id"),
  {
    k: "teams", kind: "must",
    w: (o, path, v) => wMap(o, path, v, (key, t) => {
      if (!isObj(t)) return false;
      const row: Row = { key };
      wRec(o, child(path, key), t, TEAM_FIELDS, { key }, row);
      o.row("teams", row);
      return true;
    }),
    r: (ix, path) => rMap(ix, path, new Map((ix.rows.teams ?? []).map((r: Row) =>
      [r.key as string, rRec(ix, child(path, r.key as string), TEAM_FIELDS, { key: r.key }, r)]))),
  },
];

/** The root's own keys (besides the owner's ACCT_KEYS and accounts). Its key order is always stored. */
const ROOT_FIELDS: F[] = [
  s("owner_acct", "text"), s("schema", "int"),
  mustRec("logins", LOGINS_FIELDS), mustRec("lobby", LOBBY_FIELDS), mustRec("equipos", EQUIPOS_FIELDS),
];
const ACCOUNTS_FIELD: F = {
  k: "accounts", kind: "must",
  w: (o, path, v) => wMap(o, path, v, (acct, ad) => {
    if (!isObj(ad) || acct === OWNER) return false;
    const row: Row = { acct, is_owner: 0 };
    wRec(o, child(path, acct), ad, ACCOUNT_FIELDS, { acct }, row);
    o.row("accounts", row);
    return true;
  }),
  r: (ix, path) => rMap(ix, path, new Map((ix.rows.accounts ?? []).filter((r: Row) => !r.is_owner).map((r: Row) =>
    [r.acct as string, rRec(ix, child(path, r.acct as string), ACCOUNT_FIELDS, { acct: r.acct }, r)]))),
};
const ACCT_F = fmap(ACCOUNT_FIELDS);

/** Keys py's state.json still carries for a feature this game does not have. They are never stored: the projection
 *  skips them (they are not extras either), so a state that has them loads back without them. The importer strips
 *  the same list (RETIRED_KEYS) before projecting. */
export const RETIRED_KEYS = { rec: ["dpp"], profile: ["dp_inicio_pend"], account: ["dp_inicio", "dp_pases"], wallet: ["dpp"] };
const RETIRED = new WeakMap<F[], Set<string>>([
  [REC_FIELDS, new Set(RETIRED_KEYS.rec)], [PROFILE_FIELDS, new Set(RETIRED_KEYS.profile)],
  [ACCOUNT_FIELDS, new Set(RETIRED_KEYS.account)], [WALLET_FIELDS, new Set(RETIRED_KEYS.wallet)],
]);
const RETIRED_ROOT = new Set(RETIRED_KEYS.account);
const ROOT_F = fmap(ROOT_FIELDS);

function project(st: State, cache: Map<string, Unit> | null): Out {
  const o = new Out(cache);
  o.unit("", st, () => {
    const keys = Object.keys(st).filter((k) => !RETIRED_ROOT.has(k));
    o.shape("", keys);
    const owner: Row = { acct: OWNER, is_owner: 1 };
    const world: Row = { id: 1 };
    let hasOwner = false;
    for (const k of keys) {
      const v = st[k];
      let ok: boolean;
      if (ACCT_KEYS.includes(k)) { hasOwner = true; [ok] = wField(o, "", ACCT_F.get(k), v, { acct: OWNER }, owner); }
      else if (k === "accounts") [ok] = wField(o, "", ACCOUNTS_FIELD, v, null, world);
      else [ok] = wField(o, "", ROOT_F.get(k), v, null, world);
      if (!ok) o.extra("", k, v);
    }
    if (hasOwner) o.row("accounts", owner);
    o.row("world", world);
  }, false);
  return o;
}

// ---------------------------------------------------------------- public API
/** Every row of a state, per table. */
export function stateToRows(st: State): Rows {
  const out: Rows = Object.fromEntries(TABLES.map((t) => [t.name, []]));
  for (const u of project(st, null).units.values()) for (const [t, r] of u.rows) out[t].push(r);
  return out;
}

/** The state back from its rows (as loadState reads them from D1: integers as numbers, booleans as 0/1). */
export function rowsToState(rows: Rows): State {
  const ix = new Ix(rows);
  const keys = ix.shape("") ?? [];
  const ex = ix.ex("");
  const owner = (rows.accounts ?? []).find((r) => r.is_owner);
  const world = (rows.world ?? [])[0];
  const st: State = {};
  for (const k of keys) {
    let v: unknown;
    if (ex?.has(k)) v = ex.get(k);
    else if (ACCT_KEYS.includes(k)) v = rField(ix, "", ACCT_F.get(k)!, { acct: OWNER }, owner);
    else if (k === "accounts") v = rField(ix, "", ACCOUNTS_FIELD, null, world);
    else v = rField(ix, "", ROOT_F.get(k)!, null, world);
    put(st, k, v);
  }
  return st;
}

export interface Op { table: string; del: boolean; row: Row }

const pkKey = (t: string, r: Row) => t + "\0" + TABLE[t].pk.map((c) => String(r[c] ?? null)).join("\0");
const sig = (t: string, r: Row) => JSON.stringify(TABLE[t].cols.map((c) => r[c] ?? null));

function diffRows(a: Emit[], b: Emit[], ops: Op[]) {
  const old = new Map<string, Emit>();
  for (const e of a) old.set(pkKey(e[0], e[1]), e);
  for (const [t, r] of b) {
    const k = pkKey(t, r);
    const o = old.get(k);
    if (o) old.delete(k);
    if (!o || sig(t, o[1]) !== sig(t, r)) ops.push({ table: t, del: false, row: r });
  }
  for (const [t, r] of old.values()) ops.push({ table: t, del: true, row: r });
}

/** Row ops from rows a to rows b: an upsert per new or changed row, a delete per row gone. Deletes come first. */
export function diff(a: Rows, b: Rows): Op[] {
  const flat = (x: Rows): Emit[] => Object.entries(x).flatMap(([t, rs]) => rs.map((r) => [t, r] as Emit));
  const ops: Op[] = [];
  diffRows(flat(a), flat(b), ops);
  return order(ops);
}
const order = (ops: Op[]) => [...ops.filter((o) => o.del), ...ops.filter((o) => !o.del)];

/** Incremental projection for the write-through: keeps the rows of the last committed state, per unit. */
export class Projector {
  private units = new Map<string, Unit>();
  constructor(st: State | null = null) { if (st) this.units = project(st, new Map()).units; }
  /** Ops to bring the committed rows to st; pass the result to commit() once they are written. */
  diff(st: State): { ops: Op[]; next: Map<string, Unit> } {
    const next = project(st, this.units).units;
    const ops: Op[] = [];
    for (const [id, u] of next) { const p = this.units.get(id); if (p !== u) diffRows(p?.rows ?? [], u.rows, ops); }
    for (const [id, p] of this.units) if (!next.has(id)) diffRows(p.rows, [], ops);
    return { ops: order(ops), next };
  }
  commit(next: Map<string, Unit>) { this.units = next; }
}
