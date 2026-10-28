// D1 adapter for the game state: loadState() reads every table of the projection back into py's state.json shape,
// and attach() makes D1 a write-through copy of a Store (every save -> the changed rows, in one batch).
import type { State, Store } from "../game/store.ts";
import { Projector, rowsToState, TABLES, type Op, type Row, type Rows } from "./project.ts";
import { opStatements } from "./sql.ts";

const PAGE = 5000;
/** Statements per D1 batch; a save that changes more (an import-sized change) is split in several batches. */
export const MAX_BATCH = 500;

/** Every row of the projection's tables (paged by rowid, so a big trunk table never comes back in one result). */
export async function loadRows(db: D1Database): Promise<Rows> {
  const out: Rows = {};
  await Promise.all(TABLES.map(async (m) => {
    const rows: Row[] = (out[m.name] = []);
    let after = Number.MIN_SAFE_INTEGER;
    for (;;) {
      const r = await db.prepare(`SELECT rowid AS "__rowid", * FROM "${m.name}" WHERE rowid > ? ORDER BY rowid LIMIT ${PAGE}`)
        .bind(after).all<Row & { __rowid: number }>();
      for (const x of r.results) { after = x.__rowid; delete (x as Partial<typeof x>).__rowid; rows.push(x); }
      if (r.results.length < PAGE) break;
    }
  }));
  return out;
}

/** The state stored in D1 ({} when the tables are empty). Throws if the tables do not exist (no migrations). */
export async function loadState(db: D1Database): Promise<State> {
  return rowsToState(await loadRows(db));
}

/** Writes row ops: one batch (several if there are more than MAX_BATCH statements; each batch is atomic). */
export async function writeOps(db: D1Database, ops: Op[]): Promise<void> {
  const stmts = opStatements(ops).map((s) => db.prepare(s.sql).bind(...s.params));
  for (let i = 0; i < stmts.length; i += MAX_BATCH) await db.batch(stmts.slice(i, i + MAX_BATCH));
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * The write-through sink. Each Store save hands it the new state; it diffs it against the rows it last wrote
 * (Projector) and writes the difference. Writes are serialized: while one is in flight, later saves coalesce into
 * the next write (it carries all of them, since the diff is against what D1 has). A failed write is retried with
 * backoff, diffing again from the last committed rows, so a change is never lost (the server keeps running on its
 * in-memory state meanwhile).
 */
export class D1Sink {
  private pj: Projector;
  private latest: State | null = null;
  private running: Promise<void> | null = null;
  private db: D1Database;
  private log: (s: string) => void;
  /** Number of batches written, rows written, failed attempts (for logs and tests). */
  stats = { writes: 0, rows: 0, failures: 0 };

  constructor(db: D1Database, baseline: State, log: (s: string) => void = (s) => console.error(s)) {
    this.db = db;
    this.log = log;
    this.pj = new Projector(baseline);
  }

  /** Makes this sink the Store's onSave (a Store built again by a reset is attached again). */
  attach(store: Store): this {
    store.onSave = (st) => this.save(st);
    return this;
  }

  save(st: State): void {
    this.latest = st;
    if (this.running) return;
    this.running = this.run().finally(() => {
      this.running = null;
      if (this.latest) this.save(this.latest);
    });
  }

  /** Resolves when every save so far is in D1. */
  async flush(): Promise<void> {
    while (this.running) await this.running;
  }

  private async run(): Promise<void> {
    let delay = 500;
    while (this.latest) {
      const st = this.latest;
      this.latest = null;
      let r: ReturnType<Projector["diff"]>;
      try { r = this.pj.diff(st); } catch (e) {
        // a projection bug: nothing is committed, so the next save diffs from the same rows and carries this change
        this.log(`[d1] projection failed: ${(e as Error)?.stack ?? e}`);
        continue;
      }
      if (!r.ops.length) { this.pj.commit(r.next); continue; }
      try {
        await writeOps(this.db, r.ops);
        this.pj.commit(r.next);
        this.stats.writes++;
        this.stats.rows += r.ops.length;
        delay = 500;
      } catch (e) {
        this.stats.failures++;
        this.log(`[d1] write of ${r.ops.length} row changes failed (${e}); retrying in ${delay} ms`);
        this.latest ??= st;
        await sleep(delay);
        delay = Math.min(delay * 2, 30_000);
      }
    }
  }
}

/** D1 write-through for a Store; baseline = what D1 holds now (default: the store's state, as loaded from D1). */
export function attach(store: Store, db: D1Database, opts: { baseline?: State; log?: (s: string) => void } = {}): D1Sink {
  return new D1Sink(db, opts.baseline ?? store.loadRaw(), opts.log).attach(store);
}
