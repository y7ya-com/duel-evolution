// SQL for the projection's rows: parametrized statements for the D1 write-through (db/d1.ts) and literal ones for the
// importer (scripts/import_state.ts). D1 allows at most 100 bound parameters per statement and 100 KB of SQL.
import { TABLE, TABLES, type Op, type Row, type Rows, type TableMeta, type Val } from "./project.ts";

export const MAX_PARAMS = 100;
const q = (id: string) => `"${id.replace(/"/g, '""')}"`;

export interface Stmt { sql: string; params: Val[] }

function upsertHead(table: string): [string, string] {
  const m = TABLE[table];
  const rest = m.cols.filter((c) => !m.pk.includes(c));
  const set = (c: string) => (table === "accounts" && c === "user_id"
    // a claim is written to D1 directly by de-auth (UPDATE … WHERE user_id IS NULL): a save from a server that has not
    // seen it yet must not undo it
    ? `${q(c)} = COALESCE(excluded.${q(c)}, ${q(table)}.${q(c)})` : `${q(c)} = excluded.${q(c)}`);
  const tail = rest.length ? ` ON CONFLICT (${m.pk.map(q).join(", ")}) DO UPDATE SET ${rest.map(set).join(", ")}`
    : " ON CONFLICT DO NOTHING";
  return [`INSERT INTO ${q(table)} (${m.cols.map(q).join(", ")}) VALUES `, tail];
}

/** Parametrized statements for row ops, in their order (deletes first), each within D1's parameter limit. */
export function opStatements(ops: Op[]): Stmt[] {
  const out: Stmt[] = [];
  let i = 0;
  while (i < ops.length) {
    const { table, del } = ops[i];
    const m = TABLE[table];
    const width = del ? m.pk.length : m.cols.length;
    const per = Math.max(1, Math.floor(MAX_PARAMS / width));
    const batch: Row[] = [];
    while (i < ops.length && ops[i].table === table && ops[i].del === del && batch.length < per) batch.push(ops[i++].row);
    const params: Val[] = [];
    if (del) {
      for (const r of batch) for (const c of m.pk) params.push(r[c] ?? null);
      const sql = m.pk.length === 1
        ? `DELETE FROM ${q(table)} WHERE ${q(m.pk[0])} IN (${batch.map(() => "?").join(", ")})`
        : `DELETE FROM ${q(table)} WHERE (${m.pk.map(q).join(", ")}) IN (VALUES ${batch.map(() => `(${m.pk.map(() => "?").join(", ")})`).join(", ")})`;
      out.push({ sql, params });
    } else {
      for (const r of batch) for (const c of m.cols) params.push(r[c] ?? null);
      const [head, tail] = upsertHead(table);
      out.push({ sql: head + batch.map(() => `(${m.cols.map(() => "?").join(", ")})`).join(", ") + tail, params });
    }
  }
  return out;
}

/** A SQL literal. Control characters go through char() so that every statement stays on one line. */
export function literal(v: Val): string {
  if (v === null || v === undefined) return "NULL";
  if (typeof v === "number") {
    if (!Number.isFinite(v)) throw new TypeError(`not a SQL number: ${v}`);
    return String(v);
  }
  const parts: string[] = [];
  let cur = "";
  for (const ch of v) {
    const c = ch.codePointAt(0)!;
    if (c < 0x20 || c === 0x7f || c === 0x2028 || c === 0x2029) {
      if (cur) parts.push(`'${cur.replace(/'/g, "''")}'`);
      cur = "";
      parts.push(`char(${c})`);
    } else cur += ch;
  }
  if (cur || !parts.length) parts.push(`'${cur.replace(/'/g, "''")}'`);
  return parts.length === 1 ? parts[0] : `(${parts.join(" || ")})`;
}

/** Literal INSERT statements for all rows (one line each, under maxBytes; ≤ maxRows rows per statement). */
export function insertStatements(rows: Rows, tables: TableMeta[] = TABLES, maxRows = 100, maxBytes = 90_000): string[] {
  const out: string[] = [];
  for (const m of tables) {
    const rs = rows[m.name] ?? [];
    const head = `INSERT INTO ${q(m.name)} (${m.cols.map(q).join(", ")}) VALUES `;
    let vals: string[] = [], size = head.length;
    const flush = () => { if (vals.length) out.push(head + vals.join(", ") + ";"); vals = []; size = head.length; };
    for (const r of rs) {
      const v = `(${m.cols.map((c) => literal(r[c] ?? null)).join(", ")})`;
      if (vals.length && (vals.length >= maxRows || size + v.length + 2 > maxBytes)) flush();
      vals.push(v);
      size += v.length + 2;
    }
    flush();
  }
  return out;
}

/** Empties every table of the state projection (not the auth or admin tables). */
export const clearStatements = (tables: TableMeta[] = TABLES): string[] => tables.map((m) => `DELETE FROM ${q(m.name)};`);
