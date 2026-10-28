// Shared fixtures of the db-*.test.ts files: the real states on this machine and a synthetic state with every part.
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { State } from "../src/game/store.ts";

const PY_STATE = process.env.HOME + "/Documents/GitHub/YOLaucher-web/tools/yo2emu/state.json";
const OUT = join(import.meta.dirname, "..", "parity", "_out");

/** Every state.json py wrote that exists here (the parity outputs are gitignored; the py checkout is local). */
export function realStates(): [string, string][] {
  const files: string[] = [];
  if (existsSync(PY_STATE)) files.push(PY_STATE);
  if (existsSync(OUT)) {
    for (const sc of readdirSync(OUT)) {
      const d = join(OUT, sc);
      if (sc.endsWith(".json")) { files.push(d); continue; }
      try { for (const r of readdirSync(d)) if (r.startsWith("py-") && existsSync(join(d, r, "state.json"))) files.push(join(d, r, "state.json")); } catch { /* not a dir */ }
    }
  }
  return files.map((f) => [f, readFileSync(f, "utf8")]);
}

export const rec = (over: Record<string, number> = {}) => ({
  player_id: 7, lv: 1, score: 0, mp: 10000, unk_b0: 0, wins: 0, unk_b4: 0, unk_b6: 0, unk_b8: 0, losses: 0, match_wins: 0,
  match_losses: 0, single_wins: 0, single_losses: 0, duels: 0, unk_c6: 0, duels_won: 0, duels_lost: 0, duels_drawn: 0,
  duels_void: 0, turns: 0, surrender_me: 0, surrender_opp: 0, lp_total: 0, side_swaps: 0, tribute1: 0, tribute2: 0,
  tribute3: 0, fusions: 0, ss_grave: 0, ss_total: 0, trap_me: 0, trap_opp: 0, spell_me: 0, spell_opp: 0, effect_me: 0,
  effect_opp: 0, comeback_wins: 0, comeback_losses: 0, unk_108: 0, unk_10c: 0, unk_110: 0, title: 0, unk_116: 0,
  recovery_flags: 0, champ_pending: 0, tp: 0, tp_rank: 0, ...over,
});
export const profile = (name: string, extra: Record<string, unknown> = {}) => ({
  name, rec: rec(), trunk: { "1": 3, "2": 3, "10": 1 }, pbin: [0, 1, 5, 300], npcbin: { "35": [0, 2, 0, 1] },
  avatar: { b: "00".repeat(16), a: "01".repeat(16) }, decks: {}, claims: [], pending: [], country: "ES", ...extra,
});

/** A state with every known part filled in. */
export function fullState(): State {
  return {
    profiles: {
      "0": profile("Dueno", {
        decks: {
          historial: [
            { hash: "ac356b31da807169", main: [1, 1, 2], extra: [10], primera: 1793047258, duelos: 3, ultima: 1793114558, valido: true, problemas: [] },
            { hash: "bb", main: [3], extra: [], primera: 1, duelos: 1, ultima: 2, valido: false, problemas: [
              { regla: "tamano", id: null, nombre: "", usa: 1, tiene: null, max: 80, min: 40, zona: "principal", texto: "principal de 1 cartas (mínimo 40)" },
              { regla: "baul", id: 3, nombre: "X", usa: 3, tiene: 1, max: 1 },
            ] },
          ],
          last_duel: { main: [1, 1, 2], extra: [10], side_count: 0, missing: { "2": 1 }, bad_ids: [4000] },
        },
        claims: [["sd", 3, 770]],
        pending: [{ bits: [770, 771], cards: [1, 2], via: "npc", src: "NPC 35 b3 1->2" }, { bits: [], cards: [], via: "any", src: "" }],
        last_npc_end: { npc: 35, result: "lose", present: 0 },
        team: 4, friends: [1012, 1013], pvp: { n: 3 },
        pvp_card_due: [{ packs: [1, 2, 3], n: 1, t: 1793152496 }], npc_card_due: [5, 7],
      }),
    },
    active_slot: 0,
    players: { "0": "Dueno", "1": "Otro" },
    wallet: { mp: 5 },
    profiles_borrados: [{ slot: "1", motivo: "crear", fecha: "2026-10-27 11:00:00", perfil: profile("Viejo") }],
    accounts: {
      e4acacac2bea0931: { idx: 1, players: { "0": "WebDuelist" }, profiles: { "0": profile("WebDuelist", { country: "" }) }, active_slot: 0 },
      "0000000000000001": { idx: 2, players: {}, profiles: {}, active_slot: 0 },
      "8cc07a7fe40007a4": {
        idx: 3, players: { "0": "Parked" }, profiles: { "0": profile("Parked", { team: null }) }, active_slot: 0,
        profiles_borrados: [{ slot: "0", motivo: "borrar", fecha: "2026-10-27 11:00:01", perfil: profile("Gone") }],
      },
    },
    owner_acct: "0000000000000000",
    logins: { alias: { "759f201a2214991f": "0000000000000000" }, usuarios: { e4acacac2bea0931: "webtest", "0000000000000001": "b" } },
    lobby: {
      mail: [
        { id: 1, from: 1012, from_name: "Sonda", to: 0, to_name: "Jugador 0", subject: "", body: "línea\ny\0nul", t: 1793152496 },
        { id: 2, from: 0, from_name: "J", to: 1012, to_name: "Sonda", subject: "Re: ", body: "", t: 1793152517, extra: "x", read: true },
      ],
      next_mail: 3, friends: [1012], black: [99],
      team: { id: 1, name: "Equipo", members: [[1, "Dueno"], [1012, "Sonda"]] },
    },
    equipos: {
      next_id: 3,
      teams: {
        "1": { id: 1, name: "Uno", flag: "00".repeat(16), leader: 1, members: [[1, "Dueno", 3], [1012, "Sonda", 0]], created: 1793152496 },
        "2": { id: 2, name: "Dos", flag: "11".repeat(16), leader: 5, members: [[5, "Cinco", 3]], created: 1793152497 },
      },
    },
    schema: 2,
  };
}


/** A py-era state: the same plus the keys of features this game does not have (project.ts RETIRED_KEYS), everywhere
 *  py put them. */
export function pyEraState(): State {
  const st = fullState();
  const prof = (p: any) => { p.rec.dpp = 10; p.dp_inicio_pend = 10; };
  Object.assign(st, { dp_inicio: 1, dp_pases: 2 });
  st.wallet.dpp = 6;
  prof(st.profiles["0"]);
  prof(st.profiles_borrados[0].perfil);
  for (const a of Object.values(st.accounts) as any[]) {
    Object.assign(a, { dp_inicio: 1, dp_pases: 3 });
    for (const p of Object.values(a.profiles)) prof(p);
    for (const e of a.profiles_borrados ?? []) prof(e.perfil);
  }
  return st;
}
/** Matches any of those keys in a JSON text. */
export const RETIRED_RX = /"(dpp|dp_[a-z_]+)":/;
