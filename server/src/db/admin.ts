// The admin data py keeps in files next to state.json, as D1 tables (game-schema.ts): admin_bans (admin_vetados.json),
// admin_gm (gm_cuentas.json), admin_flags (sanction bits 0x20 chat / 0x40 trade), shop_prices (admin_tienda.json
// precios + sobres) and admin_start (admin_regalos.json). Not part of the state projection: loaded once at boot, then
// one row upserted/deleted per change.
import type { AdminData, AdminSink } from "../game/admin.ts";

type R = Record<string, any>;
type Table = Parameters<AdminSink>[0];
const str = (x: unknown) => (x === undefined || x === null ? "" : String(x));
const optStr = (x: unknown) => (x === undefined || x === null ? null : String(x));
const optInt = (x: unknown) => (x === undefined || x === null || x === "" ? null : Math.trunc(Number(x)) || 0);
const obj = (x: unknown): R => (x && typeof x === "object" && !Array.isArray(x) ? (x as R) : {});

/** Everything game/admin.ts holds. */
export async function loadAdmin(db: D1Database): Promise<AdminData> {
  const [bans, gm, flags, prices, start] = await db.batch([
    db.prepare(`SELECT acct, reason, since FROM admin_bans`),
    db.prepare(`SELECT acct, note, since FROM admin_gm`),
    db.prepare(`SELECT acct, flags FROM admin_flags`),
    db.prepare(`SELECT key, mp FROM shop_prices`),
    db.prepare(`SELECT mp, trunk FROM admin_start WHERE id = 1`),
  ]);
  const st = (start.results as R[])[0];
  const s: AdminData["start"] = {};
  if (st?.mp != null) s.mp = st.mp;
  if (st?.trunk != null) s.baul = st.trunk;
  return {
    start: s,
    bans: new Map((bans.results as R[]).map((r) => [r.acct, { reason: r.reason, since: r.since }])),
    gm: new Map((gm.results as R[]).map((r) => [r.acct, { note: r.note, since: r.since }])),
    flags: new Map((flags.results as R[]).map((r) => [r.acct, r.flags])),
    prices: Object.fromEntries((prices.results as R[]).map((r) => [r.key, r.mp])),
  };
}

const upsert = (db: D1Database, table: string, row: R, pk: string) => {
  const cols = Object.keys(row);
  const set = cols.filter((c) => c !== pk).map((c) => `${c} = excluded.${c}`).join(", ");
  return db.prepare(`INSERT INTO ${table} (${cols.join(", ")}) VALUES (${cols.map(() => "?").join(", ")}) ON CONFLICT (${pk}) DO UPDATE SET ${set}`)
    .bind(...Object.values(row));
};

/** The statement that stores (value) or removes (null) one admin entry. */
export function adminStatement(db: D1Database, table: Table, key: string, value: unknown): D1PreparedStatement {
  const v = value as R | number | null;
  switch (table) {
    case "bans":
      return v === null ? db.prepare(`DELETE FROM admin_bans WHERE acct = ?`).bind(key)
        : upsert(db, "admin_bans", { acct: key, reason: str((v as R).reason), since: str((v as R).since) }, "acct");
    case "gm":
      return v === null ? db.prepare(`DELETE FROM admin_gm WHERE acct = ?`).bind(key)
        : upsert(db, "admin_gm", { acct: key, note: str((v as R).note), since: str((v as R).since) }, "acct");
    case "flags":
      return v === null || v === 0 ? db.prepare(`DELETE FROM admin_flags WHERE acct = ?`).bind(key)
        : upsert(db, "admin_flags", { acct: key, flags: Number(v) | 0 }, "acct");
    case "prices":
      return v === null ? db.prepare(`DELETE FROM shop_prices WHERE key = ?`).bind(key)
        : upsert(db, "shop_prices", { key, mp: Number(v) | 0 }, "key");
    case "start": {
      const s = obj(v);
      return upsert(db, "admin_start", { id: 1, mp: optInt(s.mp), trunk: optStr(s.baul) }, "id");
    }
  }
}

/** An AdminSink writing to D1: changes are applied in order, each retried a few times; failures are logged. */
export function adminSink(db: D1Database, log: (s: string) => void = (s) => console.error(s)): AdminSink & { flush(): Promise<void> } {
  let chain: Promise<void> = Promise.resolve();
  const sink = ((table, key, value) => {
    const stmt = adminStatement(db, table, key, value); // bound now: later changes to the same object do not leak in
    chain = chain.then(async () => {
      for (let i = 0, delay = 500; ; i++, delay *= 2) {
        try { await stmt.run(); return; } catch (e) {
          if (i >= 4) { log(`[d1] admin ${table} ${key}: write failed (${e})`); return; }
          await new Promise((r) => setTimeout(r, delay));
        }
      }
    });
  }) as AdminSink & { flush(): Promise<void> };
  sink.flush = () => chain;
  return sink;
}

/** py's files -> rows, for the importer: admin_vetados.json {acct: {motivo, fecha|desde}}, gm_cuentas.json
 *  {acct: {nota, desde}}, admin_tienda.json {precios: {key: mp}, sobres: {pack: mp}} (merged, as py's shop_prices),
 *  admin_regalos.json {mp, baul} (other keys are not imported). */
export function adminRowsFromPy(files: { bans?: unknown; gm?: unknown; shop?: unknown; start?: unknown }): Record<string, R[]> {
  const shop = obj(files.shop);
  const prices = { ...obj(shop.precios), ...obj(shop.sobres) };
  const start = obj(files.start);
  return {
    admin_bans: Object.entries(obj(files.bans)).map(([acct, b]) => ({ acct, reason: str(b?.motivo), since: str(b?.desde ?? b?.fecha) })),
    admin_gm: Object.entries(obj(files.gm)).map(([acct, g]) => ({ acct, note: str(g?.nota), since: str(g?.desde) })),
    admin_flags: [],
    shop_prices: Object.entries(prices).filter(([, mp]) => Number.isInteger(mp) && mp >= 1 && mp <= 100000).map(([key, mp]) => ({ key, mp })),
    admin_start: Object.keys(start).length ? [{ id: 1, mp: optInt(start.mp), trunk: optStr(start.baul) }] : [],
  };
}
