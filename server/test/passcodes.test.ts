// The on-load upgrade of a pre-card-wire state (game/passcodes.ts): 2008 card ids -> passcodes, once.
import { describe, expect, it } from "vitest";
import { deckHash } from "../src/duel/deckCheck.ts";
import { upgradeCards } from "../src/game/passcodes.ts";
import { pc } from "./notes-harness.ts";

const old = () => ({
  accounts: { a1: { profiles: { "0": {
    trunk: { "1": 3, "365": 1 },
    decks: { last_duel: { main: [1, 1, 365], extra: [], missing: { "365": 1 }, bad_ids: [] },
             historial: [{ main: [1, 365], extra: [], hash: "x", problemas: [{ id: 365 }] }] },
    pending: [{ bits: [1], cards: [365, 1] }],
  } } } },
});

describe("upgradeCards", () => {
  it("converts every card field and the history's hash, then marks schema 3", () => {
    const st: any = old();
    expect(upgradeCards(st)).toEqual({ profiles: 1, unmapped: [], already: false });
    const p = st.accounts.a1.profiles["0"], a = pc(1), b = pc(365);
    expect(p.trunk).toEqual({ [a]: 3, [b]: 1 });
    expect(p.decks.last_duel).toMatchObject({ main: [a, a, b], missing: { [b]: 1 } });
    expect(p.decks.historial[0]).toEqual({ main: [a, b], extra: [], hash: deckHash([a, b], []), problemas: [{ id: b }] });
    expect(p.pending[0].cards).toEqual([b, a]);
    expect(st.schema).toBe(3);
    expect(upgradeCards(st)).toBeNull();   // never twice
  });
  it("a state already in passcodes without the mark is only marked", () => {
    const st: any = { accounts: { a1: { profiles: { "0": { trunk: { [pc(1)]: 3 } } } } } };
    expect(upgradeCards(st)).toEqual({ profiles: 0, unmapped: [], already: true });
    expect(st.accounts.a1.profiles["0"].trunk).toEqual({ [pc(1)]: 3 });
  });
});
