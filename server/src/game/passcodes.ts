// A state saved before the card wire (schema < 3: the 2008 client's card ids) to real passcodes, in place, when the
// WorldDO loads it: the deploy that brings the passcode server converts D1 itself, with no window in which the old
// Worker could write old ids over converted rows. The same conversion as scripts/passcode_state.py (and
// scripts/passcode_d1.py, its SQL form, for checking a copy of D1). The map is gamedata/cards.json (tools/cardart.py).
import CARDS from "../../gamedata/cards.json";
import { deckHash } from "../duel/deckCheck.ts";
import { SCHEMA } from "./persist.ts";
import type { State } from "./store.ts";

type P = Record<string, any>;
const PC = new Map((CARDS as { i: number; pc: number }[]).map((c) => [c.i, c.pc]));

/** Every card field of every profile of st, rewritten by f (the shape scripts/passcode_state.py converts). */
function eachCard(st: State, f: (v: number) => number): number {
  const keys = (o: P) => Object.fromEntries(Object.entries(o).map(([k, n]) => [String(f(Number(k))), n]));
  const list = (a: unknown) => (Array.isArray(a) ? a.map((v) => f(Number(v))) : a);
  let n = 0;
  const profile = (p: P) => {
    n++;
    if (p.trunk && typeof p.trunk === "object") p.trunk = keys(p.trunk);
    const d = p.decks ?? {};
    const ld = d.last_duel;
    if (ld && typeof ld === "object") {
      for (const k of ["main", "extra", "bad_ids"]) if (Array.isArray(ld[k])) ld[k] = list(ld[k]);
      if (ld.missing && typeof ld.missing === "object" && !Array.isArray(ld.missing)) ld.missing = keys(ld.missing);
    }
    for (const h of Array.isArray(d.historial) ? d.historial : []) {
      h.main = list(h.main ?? []), h.extra = list(h.extra ?? []);
      h.hash = deckHash(h.main, h.extra);
      for (const pr of Array.isArray(h.problemas) ? h.problemas : []) if (pr?.id != null) pr.id = f(Number(pr.id));
    }
    for (const it of Array.isArray(p.pending) ? p.pending : []) if (Array.isArray(it?.cards)) it.cards = list(it.cards);
  };
  const profiles = (c: unknown) => (c && typeof c === "object" ? Object.values(c as P).filter((v) => v && typeof v === "object") : []);
  for (const p of [...profiles(st.profiles), ...profiles(st.archived)]) profile(p);
  for (const a of Object.values((st.accounts ?? {}) as P)) for (const p of [...profiles(a?.profiles), ...profiles(a?.archived)]) profile(p);
  return n;
}

/** Converts st to passcodes unless it is schema 3 already; null = nothing to do. A card id with no passcode is kept as
 *  it was (nothing is dropped; the D1 backup is the way back). A state whose ids are already passcodes (above every
 *  2008 card index) is only marked. */
export function upgradeCards(st: State, map: Map<number, number> = PC): { profiles: number; unmapped: number[]; already: boolean } | null {
  if (st.schema === SCHEMA) return null;
  const top = Math.max(...map.keys());
  let already = false;
  eachCard(structuredClone(st), (v) => { if (v > top) already = true; return v; });
  const unmapped = new Set<number>();
  const profiles = already ? 0 : eachCard(st, (v) => { const p = map.get(v); if (p === undefined) unmapped.add(v); return p ?? v; });
  st.schema = SCHEMA;
  return { profiles, unmapped: [...unmapped].sort((a, b) => a - b), already };
}
