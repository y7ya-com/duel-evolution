// D1 end to end (miniflare through wrangler's getPlatformProxy): migrations + importer SQL + loadState give the same
// state back; the write-through sink keeps D1 equal to the Store (retrying failed writes); the admin tables; and the
// real CLI path (wrangler d1 migrations apply / d1 execute --file on a --persist-to dir).
import { execFileSync } from "node:child_process";
import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { getPlatformProxy } from "wrangler";
import { importSql, stripRetired } from "../scripts/import_state.ts";
import { adminSink, loadAdmin } from "../src/db/admin.ts";
import { attach, D1Sink, loadState } from "../src/db/d1.ts";
import { upgradeCards } from "../src/game/passcodes.ts";
import { Store, type State } from "../src/game/store.ts";
import { fullState, pyEraState, realStates, RETIRED_RX } from "./db-fixtures.ts";
import * as schema from "../src/db/schema.ts";
import { getTableConfig, SQLiteTable } from "drizzle-orm/sqlite-core";

const SERVER = join(import.meta.dirname, "..");
const MIG = join(SERVER, "migrations");
const tmp = mkdtempSync(join(tmpdir(), "ygo-db-"));
const config = (name: string) => {
  const f = join(tmp, `${name}.jsonc`);
  writeFileSync(f, JSON.stringify({ name, compatibility_date: "2026-06-01",
    d1_databases: [{ binding: "DB", database_name: name, database_id: name, migrations_dir: MIG }] }));
  return f;
};
let proxy: Awaited<ReturnType<typeof getPlatformProxy>>;
let DB: D1Database;

async function migrate(db: D1Database) {
  for (const f of readdirSync(MIG).filter((f) => f.endsWith(".sql")).sort()) {
    const stmts = readFileSync(join(MIG, f), "utf8").split("--> statement-breakpoint").map((s) => s.trim()).filter(Boolean);
    await db.batch(stmts.map((s) => db.prepare(s)));
  }
}
async function runSql(db: D1Database, stmts: string[]) {
  for (let i = 0; i < stmts.length; i += 200) await db.batch(stmts.slice(i, i + 200).map((s) => db.prepare(s)));
}
const json = (x: unknown) => JSON.stringify(x);

beforeAll(async () => {
  proxy = await getPlatformProxy({ configPath: config("ygo-db-test"), persist: false });
  DB = (proxy.env as { DB: D1Database }).DB;
  await migrate(DB);
}, 120_000);
afterAll(async () => { await proxy?.dispose(); rmSync(tmp, { recursive: true, force: true }); });

describe("import + loadState", () => {
  const cases: [string, () => State][] = [
    ...realStates().map(([f, text]) => [f.replace(/.*\/(parity|yo2emu)\//, "$1/"), () => stripRetired(JSON.parse(text))] as [string, () => State]),
    ["synthetic: every known part", fullState],
  ];
  for (const [name, mk] of cases) {
    it(name, async () => {
      const st = mk();
      await runSql(DB, importSql(json(st)));
      expect(json(await loadState(DB))).toBe(json(st));
    }, 60_000);
  }
  it("re-importing replaces the previous state", async () => {
    await runSql(DB, importSql(json(fullState())));
    await runSql(DB, importSql(json({ players: { "0": "x" } })));
    expect(await loadState(DB)).toEqual({ players: { "0": "x" } });
  });
});

describe("write-through sink", () => {
  it("keeps D1 equal to the store over many saves", async () => {
    const base = fullState();
    await runSql(DB, importSql(json(base)));
    const store = new Store(await loadState(DB));
    const sink = attach(store, DB, { log: () => {} });
    for (let i = 0; i < 20; i++) {
      const st = store.loadRaw();
      st.profiles["0"].trunk[String(100 + i)] = i % 3 + 1;
      st.profiles["0"].rec.mp += i;
      if (i % 4 === 0) st.lobby.mail.push({ id: 100 + i, from: 1, from_name: "a", to: 2, to_name: "b", subject: "s", body: `m${i}`, t: i });
      if (i % 5 === 0) st.lobby.mail.shift();
      if (i === 7) delete st.accounts.e4acacac2bea0931;
      if (i === 9) st.accounts.nuevo = { idx: 9, players: { "0": "N" }, profiles: { "0": { name: "N", rec: { lv: 1 } } }, active_slot: 0 };
      store.saveRaw(st);
    }
    await sink.flush();
    expect(json(await loadState(DB))).toBe(json(store.loadRaw()));
    expect(sink.stats.writes).toBeGreaterThan(0);
    expect(sink.stats.writes).toBeLessThanOrEqual(20); // saves made while a write is in flight coalesce
  }, 60_000);

  it("a pre-card-wire state: upgraded on load and written back (do.ts)", async () => {
    const [, text] = realStates()[0];
    await runSql(DB, importSql(json(stripRetired(JSON.parse(text)))));
    const loaded = await loadState(DB);
    const st = structuredClone(loaded);
    expect(upgradeCards(st)?.profiles).toBeGreaterThan(0);
    const store = new Store(st);
    const sink = attach(store, DB, { baseline: loaded, log: () => {} });
    sink.save(store.loadRaw());
    await sink.flush();
    expect(json(await loadState(DB))).toBe(json(st));
  }, 60_000);

  it("retries a failed write and loses nothing", async () => {
    await runSql(DB, importSql(json(fullState())));
    const store = new Store(await loadState(DB));
    let fail = 2;
    const flaky = new Proxy(DB, {
      get(t, k) {
        if (k === "batch") return async (s: D1PreparedStatement[]) => { if (fail-- > 0) throw new Error("injected"); return t.batch(s); };
        const v = Reflect.get(t, k);
        return typeof v === "function" ? v.bind(t) : v;
      },
    });
    const logs: string[] = [];
    const sink = new D1Sink(flaky, store.loadRaw(), (s) => logs.push(s)).attach(store);
    const st = store.loadRaw();
    st.profiles["0"].name = "Renamed";
    store.saveRaw(st);
    const st2 = store.loadRaw();
    st2.equipos.teams["3"] = { id: 3, name: "Tres", flag: "", leader: 1, members: [], created: 5 };
    store.saveRaw(st2);
    await sink.flush();
    expect(sink.stats.failures).toBe(2);
    expect(logs.length).toBe(2);
    expect(json(await loadState(DB))).toBe(json(store.loadRaw()));
  }, 60_000);

  it("accounts.user_id: a de-auth claim in D1 survives saves from a server that has not seen it", async () => {
    await runSql(DB, importSql(json(fullState())));
    await DB.batch(["usr_a", "usr_b"].map((id) => DB.prepare(`INSERT OR IGNORE INTO "user" (id, name, email) VALUES (?, ?, ?)`).bind(id, id, `${id}@de.test`)));
    const store = new Store(await loadState(DB));
    const sink = attach(store, DB, { log: () => {} });
    // an account made by a signed-in user carries its user id
    let st = store.loadRaw();
    st.accounts["u:usr_b"] = { idx: 9, players: {}, profiles: {}, active_slot: 0, user_id: "usr_b" };
    store.saveRaw(st);
    await sink.flush();
    // de-auth claims a legacy account directly in D1
    const r = await DB.prepare(`UPDATE accounts SET user_id = ? WHERE acct = ? AND user_id IS NULL`).bind("usr_a", "e4acacac2bea0931").run();
    expect(r.meta.changes).toBe(1);
    st = store.loadRaw();
    st.accounts.e4acacac2bea0931.idx = 42; // same row, stale user_id (none) in memory
    store.saveRaw(st);
    await sink.flush();
    const back = await loadState(DB);
    expect(back.accounts.e4acacac2bea0931.user_id).toBe("usr_a");
    expect(back.accounts.e4acacac2bea0931.idx).toBe(42);
    expect(back.accounts["u:usr_b"].user_id).toBe("usr_b");
    // deleting the user unclaims (ON DELETE SET NULL)
    await DB.prepare(`DELETE FROM "user" WHERE id = ?`).bind("usr_a").run();
    expect((await loadState(DB)).accounts.e4acacac2bea0931.user_id).toBeUndefined();
  }, 60_000);

  it("the importer leaves user_id NULL", async () => {
    const st = fullState();
    st.accounts.e4acacac2bea0931.user_id = "usr_b";
    await runSql(DB, importSql(json(st)));
    delete st.accounts.e4acacac2bea0931.user_id;
    expect(json(await loadState(DB))).toBe(json(st));
  });

  it("an empty database loads as {}", async () => {
    await runSql(DB, importSql("{}"));
    expect(await loadState(DB)).toEqual({});
  });
});

describe("admin tables", () => {
  it("upserts, deletes and loads", async () => {
    const sink = adminSink(DB);
    sink("bans", "a1", { reason: "spam", since: "2026-10-28 10:00" });
    sink("bans", "a2", { reason: "x", since: "s" });
    sink("bans", "a2", null);
    sink("gm", "g1", { note: "staff", since: "2026-10-01 00:00" });
    sink("flags", "a1", 0x60);
    sink("flags", "a3", 0x20);
    sink("flags", "a3", 0);
    sink("prices", "sobre", 300);
    sink("prices", "12", 500);
    sink("prices", "12", 450);
    sink("start", "start", { mp: 500, baul: "all3" });
    await sink.flush();
    const a = await loadAdmin(DB);
    expect([...a.bans]).toEqual([["a1", { reason: "spam", since: "2026-10-28 10:00" }]]);
    expect([...a.gm]).toEqual([["g1", { note: "staff", since: "2026-10-01 00:00" }]]);
    expect([...a.flags]).toEqual([["a1", 0x60]]);
    expect(a.prices).toEqual({ sobre: 300, "12": 450 });
    expect(a.start).toEqual({ mp: 500, baul: "all3" });
  });
  it("imports py's admin files", async () => {
    const d = mkdtempSync(join(tmp, "adm-"));
    writeFileSync(join(d, "admin_vetados.json"), json({ b1: { nombres: ["X"], motivo: "trampas", fecha: "2026-10-01 12:00" } }));
    writeFileSync(join(d, "gm_cuentas.json"), json({ g9: { nota: "mod", desde: "2026-09-01 08:00" } }));
    writeFileSync(join(d, "admin_tienda.json"), json({ precios: { sobre: 250, carta: 0 }, sobres: { "7": 900 } }));
    // py files of features this game does not have are not imported (a whole file, or keys of one)
    writeFileSync(join(d, "admin_duelpass.json"), json({ K: { estado: "libre", creado: "c", dpp: 1, carta: 2, mazo: 3, nota: "" } }));
    writeFileSync(join(d, "admin_regalos.json"), json({ mp: 1, dpp: 2, baul: "deck" }));
    await runSql(DB, importSql(json(fullState()), d));
    const a = await loadAdmin(DB);
    expect([...a.bans]).toEqual([["b1", { reason: "trampas", since: "2026-10-01 12:00" }]]);
    expect([...a.gm]).toEqual([["g9", { note: "mod", since: "2026-09-01 08:00" }]]);
    expect(a.prices).toEqual({ sobre: 250, "7": 900 });
    expect(a.start).toEqual({ mp: 1, baul: "deck" });
    expect(Object.keys(a)).not.toContain("codes");
  });
});

describe("nothing in D1 tracks the retired economy", () => {
  const RX = /dp|duelpass/i;
  it("in the drizzle schema", () => {
    const tables = (Object.values(schema) as unknown[]).filter((t): t is SQLiteTable => t instanceof SQLiteTable).map((t) => getTableConfig(t));
    expect(tables.length).toBeGreaterThan(30);
    for (const t of tables) {
      expect(t.name).not.toMatch(RX);
      for (const c of t.columns) expect(`${t.name}.${c.name}`).not.toMatch(RX);
    }
  });
  it("in the database the migrations build", async () => {
    const tables = (await DB.prepare(`SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE '\\_%' ESCAPE '\\' AND name NOT LIKE 'sqlite%'`).all<{ name: string }>()).results;
    expect(tables.length).toBeGreaterThan(30);
    for (const { name } of tables) {
      expect(name).not.toMatch(RX);
      const cols = (await DB.prepare(`SELECT name FROM pragma_table_info(?)`).bind(name).all<{ name: string }>()).results;
      for (const c of cols) expect(`${name}.${c.name}`).not.toMatch(RX);
    }
  });
  it("importing a py-era state.json gives a state without any of it", async () => {
    for (const text of [json(pyEraState()), ...realStates().map(([, t]) => t)]) {
      expect(text).toMatch(RETIRED_RX);
      await runSql(DB, importSql(text));
      const back = json(await loadState(DB));
      expect(back).not.toMatch(RETIRED_RX);
      expect(back).toBe(json(stripRetired(JSON.parse(text))));
    }
    expect(json(stripRetired(pyEraState()))).toBe(json(fullState()));
  }, 120_000);
});

describe("wrangler CLI", () => {
  it("d1 migrations apply + d1 execute --file, then loadState", async () => {
    const real = realStates();
    const st: State = real.length ? stripRetired(JSON.parse(real[0][1])) : fullState();
    const cfg = config("ygo-db-cli");
    const persist = join(tmp, "persist");
    const sqlFile = join(tmp, "import.sql");
    writeFileSync(sqlFile, importSql(json(st)).join("\n") + "\n");
    const wr = (...a: string[]) => execFileSync("nice", ["npx", "wrangler", ...a, "--config", cfg, "--local", "--persist-to", persist],
      { cwd: SERVER, stdio: "pipe", env: { ...process.env, CI: "1", WRANGLER_SEND_METRICS: "false" }, timeout: 180_000 });
    wr("d1", "migrations", "apply", "ygo-db-cli");
    wr("d1", "execute", "ygo-db-cli", "--file", sqlFile, "--yes");
    const p = await getPlatformProxy({ configPath: cfg, persist: { path: join(persist, "v3") } }); // the CLI writes under <persist-to>/v3
    try { expect(json(await loadState((p.env as { DB: D1Database }).DB))).toBe(json(st)); } finally { await p.dispose(); }
  }, 400_000);
});
