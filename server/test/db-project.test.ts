// state.json <-> rows (src/db/project.ts): exact round trip of every real state on this machine and of synthetic edge
// cases, and the row diff used by the D1 write-through.
import { describe, expect, it } from "vitest";
import { diff, Projector, rowsToState, stateToRows, TABLE, type Op, type Row, type Rows } from "../src/db/project.ts";
import type { State } from "../src/game/store.ts";
import { fullState, profile, pyEraState, realStates, rec, RETIRED_RX } from "./db-fixtures.ts";
import { stripRetired } from "../scripts/import_state.ts";

/** Rows as D1 hands them back: a JSON round trip of what was stored. */
const viaDb = (rows: Rows): Rows => JSON.parse(JSON.stringify(rows));
const roundTrip = (st: State) => rowsToState(viaDb(stateToRows(st)));
const exact = (st: State) => expect(JSON.stringify(roundTrip(st))).toBe(JSON.stringify(st));

/** Applies ops to a rows "database" keyed by primary key. */
function apply(db: Map<string, [string, Row]>, ops: Op[]) {
  for (const o of ops) {
    const k = o.table + "\0" + TABLE[o.table].pk.map((c) => String(o.row[c] ?? null)).join("\0");
    if (o.del) db.delete(k); else db.set(k, [o.table, o.row]);
  }
}
const toRows = (db: Map<string, [string, Row]>): Rows => {
  const out: Rows = {};
  for (const [t, r] of db.values()) (out[t] ??= []).push(r);
  return out;
};

describe("round trip of real states", () => {
  const states = realStates();
  it("finds the example states", () => { expect(states.length).toBeGreaterThan(0); });
  for (const [f, text] of states) {
    it(f.replace(/.*\/(parity|yo2emu)\//, "$1/"), () => {
      const st = JSON.parse(text);
      const rows = stateToRows(st);
      // py's states carry keys of features this game does not have: they come back without them
      expect(JSON.stringify(roundTrip(st))).toBe(JSON.stringify(stripRetired(JSON.parse(text))));
      expect(JSON.stringify(rows)).not.toMatch(/dp/i);
      // everything real is relational: nothing falls back to state_extras
      expect(rows.state_extras).toEqual([]);
      expect(rows.characters.length).toBeGreaterThan(0);
    });
  }
});

describe("round trip of synthetic states", () => {
  it("every known part", () => {
    const st = fullState();
    exact(st);
    expect(stateToRows(st).state_extras).toEqual([]);
  });
  it("empty and minimal states", () => {
    exact({});
    exact({ players: {} });
    exact({ accounts: {}, logins: {} });
    exact({ lobby: { mail: [], next_mail: 1, friends: [], black: [], team: null } });
    exact({ equipos: { next_id: 1, teams: {} } });
  });
  it("owner at the root only, accounts only", () => {
    const st = fullState();
    exact({ profiles: st.profiles, active_slot: 1, players: st.players });
    exact({ accounts: st.accounts, logins: st.logins });
  });
  it("missing and reordered optional keys", () => {
    const p: any = profile("P");
    delete p.rec.tp_rank; delete p.avatar; delete p.claims; p.rec.lv = null;
    const q: any = { country: "", name: "Q", rec: { mp: 1, lv: 2 }, trunk: {}, pbin: [], decks: { last_duel: { main: [], extra: [] } } };
    exact({ accounts: { a: { profiles: { "0": p, "1": q }, idx: 1 } } });
    exact({ profiles: { "0": { ...profile("E"), friends: [], pvp_card_due: [], npc_card_due: [], last_npc_end: {}, pvp: {} } } });
    exact({ profiles: { "0": { ...profile("A"), avatar: {} } }, accounts: { b: { idx: 1 } } });
  });
  it("values the tables do not model fall back to state_extras", () => {
    const weird: State = {
      profiles: {
        "0": {
          ...profile("W", { future_key: { a: [1, { b: 2 }] }, team: "x" }),
          rec: { ...rec(), lv: 1.5, mp: "100", unk_new: 3 },
          trunk: { "1": 3, "02": 1, abc: 2, "3": 2.5 },
          pbin: [3, 1, 2],
          npcbin: { "1": [1, 2, 3], "2": [1, 2, 3, 4] },
          decks: { last_duel: { main: [1, "x"], extra: null, side_count: 0 }, historial: [], otro: 1 },
          claims: [["sd", 1, 2], ["sd", 1], "x"],
          pending: [{ bits: [1, -1.5], cards: null, via: 3 }, 5],
          avatar: "ff",
        },
        "1": "not a profile",
      },
      accounts: { x: { idx: "1", players: { "0": 5 }, profiles: [], wallet: 3, profiles_borrados: [1, { slot: 0, perfil: null }] }, y: 7 },
      logins: { alias: { a: 1 }, usuarios: [] },
      lobby: { mail: [{ id: 1, read: "si" }, null], friends: [1, "2"], black: null, team: { id: 1, name: "T", members: [[1]] }, extra: true },
      equipos: { next_id: 1.5, teams: { "1": { id: 1, members: [[1, "a"]] }, z: [] } },
      owner_acct: null,
      schema: "2",
      "": "empty key",
      "a/b~c": { "x/y": 1 },
    } as State;
    const st = JSON.parse(JSON.stringify(weird).replace(/^\{/, '{"__proto__":{"x":1},'));
    expect(Object.keys(st)[0]).toBe("__proto__");
    exact(st);
    expect(stateToRows(st).state_extras.length).toBeGreaterThan(10);
  });
  it("accounts.user_id: claimed legacy accounts and accounts made by a signed-in user", () => {
    const st = fullState();
    st.accounts.e4acacac2bea0931.user_id = "usr_1";
    st.accounts["u:usr_2"] = { idx: 4, players: {}, profiles: { "0": profile("Nuevo") }, active_slot: 0, user_id: "usr_2" };
    st.accounts["8cc07a7fe40007a4"].user_id = null;
    exact(st);
    const rows = stateToRows(st);
    expect(rows.accounts.map((r) => [r.acct, r.user_id ?? null])).toEqual([
      ["e4acacac2bea0931", "usr_1"], ["0000000000000001", null], ["8cc07a7fe40007a4", null], ["u:usr_2", "usr_2"], ["_owner", null]]);
    expect(rows.characters.some((r) => r.id === "/accounts/u:usr_2/profiles/0")).toBe(true);
    expect(rows.state_extras).toEqual([]);
    // the owner's root account has no user_id: one there is not modelled (extras), but still comes back
    exact({ ...st, user_id: "x" });
  });
  it("a py-era state loads back without the retired keys, and none of them is stored", () => {
    const st = pyEraState();
    expect(JSON.stringify(st)).toMatch(RETIRED_RX);
    const rows = stateToRows(st);
    expect(rows.state_extras).toEqual([]);
    expect(JSON.stringify(rows)).not.toMatch(/dp/i);
    const back = JSON.stringify(roundTrip(st));
    expect(back).not.toMatch(RETIRED_RX);
    expect(back).toBe(JSON.stringify(stripRetired(pyEraState())));
    expect(back).toBe(JSON.stringify(fullState()));
  });
  it("integer-like keys come back in JS order, other keys in their own order", () => {
    exact({ accounts: { b: { idx: 2 }, a: { idx: 1 }, "10": { idx: 3 }, "9": { idx: 4 } }, logins: { usuarios: { z: "1", a: "2" }, alias: {} } });
    exact({ profiles: { "0": { ...profile("D"), decks: { last_duel: { main: [], extra: [], side_count: 0 }, historial: [{ hash: "h" }] } } } });
  });
});

describe("row diff", () => {
  it("diff(a, b) applied to a gives b", () => {
    const a = stateToRows(fullState());
    const st = fullState();
    st.profiles["0"].trunk["2"] = 1;
    delete st.accounts.e4acacac2bea0931;
    st.lobby.mail.splice(0, 1);
    const b = stateToRows(st);
    const db = new Map<string, [string, Row]>();
    apply(db, diff({}, a));
    apply(db, diff(a, b));
    expect(JSON.stringify(rowsToState(viaDb(toRows(db))))).toBe(JSON.stringify(st));
  });

  it("the projector writes only what changed and converges over many saves", () => {
    const real = realStates();
    let st: State = real.length ? stripRetired(JSON.parse(real[0][1])) : fullState();
    const pj = new Projector(st);
    const db = new Map<string, [string, Row]>();
    apply(db, diff({}, stateToRows(st)));
    // nothing changed: no ops
    expect(pj.diff(st).ops).toEqual([]);
    // one trunk card in one character: one upsert
    const first = (s: any): any => Object.values((Object.values(s.accounts ?? {})[0] as any)?.profiles ?? s.profiles)[0];
    st = JSON.parse(JSON.stringify(st));
    first(st).trunk["5"] = 1;
    let r = pj.diff(st);
    expect(r.ops).toEqual([{ table: "trunk_cards", del: false, row: { char_id: expect.any(String), card: 5, qty: 1 } }]);
    apply(db, r.ops); pj.commit(r.next);
    // a mix of edits, each save diffed against the committed rows
    const edits: ((s: any, p: any) => void)[] = [
      (s, p) => { delete p.trunk["5"]; s.x = 1; },
      (s) => { (s.lobby ??= { mail: [], next_mail: 1, friends: [], black: [], team: null }).mail.push({ id: 9, from: 1, from_name: "a", to: 2, to_name: "b", subject: "s", body: "b", t: 1 }); },
      (_s, p) => { p.rec.mp += 50; p.pbin.push(1000); p.npcbin["40"] = [1, 0, 0, 1]; },
      (s, p) => { (s.profiles_borrados ??= []).push({ slot: "0", motivo: "borrar", fecha: "f", perfil: JSON.parse(JSON.stringify(p)) }); },
      (s, p) => { s.lobby.mail.shift(); p.decks = {}; p.team = null; },
      (s) => { s.accounts = { nuevo: { idx: 9, players: {}, profiles: {}, active_slot: 0 }, ...(s.accounts ?? {}) }; },
      (s) => { delete s.x; s.equipos = { next_id: 2, teams: { "1": { id: 1, name: "a", flag: "", leader: 1, members: [[1, "a", 3]], created: 1 } } }; },
      (s) => { s.profiles_borrados.shift(); },
    ];
    for (const e of edits) {
      st = JSON.parse(JSON.stringify(st));
      e(st, first(st));
      r = pj.diff(st);
      apply(db, r.ops); pj.commit(r.next);
      expect(JSON.stringify(rowsToState(viaDb(toRows(db))))).toBe(JSON.stringify(st));
    }
  });
});
