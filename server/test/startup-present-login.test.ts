// Reproduce an established character with both the retired 40-card offer and
// its GET marker. Login must stop advertising the offer without resetting progress.
import { afterEach, expect, it, vi } from "vitest";
import * as PP from "../src/game/persist.ts";
import { starterClaim, starterInfo } from "../src/game/starter.ts";
import { rowsToState, stateToRows } from "../src/db/project.ts";
import { harness } from "./notes-harness.ts";

afterEach(() => { vi.useRealTimers(); PP.setProgression(false); });

it("retires an already-claimed 40-card offer on every PBIN login without another grant or loss of progress", async () => {
  const h = harness({ players: {} }, { PROGRESSION: "1" });
  const seed = h.client("Seed", "legacy-claimer", "pw", "legacy-user");
  await seed.account(0, "Established");
  h.srv.world.closePeer(seed.id); await h.tick(20);
  const raw = h.state(), account = Object.values(raw.accounts)[0] as any, p = account.profiles["0"];
  const cards = [...PP.validCardIds()].slice(0, 187);
  p.trunk = Object.fromEntries(cards.map((card, i) => [card, i < 43 ? 2 : 1]));
  p.prog = 1; p.rec.mp = 1800; p.rec.wins = 11; p.rec.losses = 11; p.country = "GB";
  p.decks = { last_duel: { main: cards.slice(0, 41), extra: [], side_count: 12 } };
  delete p.starter; delete p.mp_wallet;
  PP.pbinSet(p, PP.STARTER_RIGHT); PP.pbinSet(p, PP.STARTER_RIGHT + 1);
  const preserved = structuredClone({ trunk: p.trunk, rec: p.rec, decks: p.decks, claims: p.claims });
  h.game.store.saveRaw(raw);

  // A second login and a D1 round trip must not resurrect the obsolete offer.
  for (let attempt = 0; attempt < 3; attempt++) {
    if (attempt === 2) h.game.store.saveRaw(rowsToState(stateToRows(h.state())));
    const client = h.client(`Login ${attempt}`, "legacy-claimer", "pw", "legacy-user");
    await client.account();
    const accountLink = [...client.links.values()].at(-1)!;
    const wire = accountLink.all(0x3114).at(-1)!;
    const wireBit = (bit: number) => !!(wire[bit >> 3] & (1 << (bit & 7)));
    expect(wire.length).toBe(128);
    expect(wireBit(PP.STARTER_RIGHT)).toBe(false);
    expect(wireBit(PP.STARTER_RIGHT + 1)).toBe(true);
    await client.enterRoom();
    expect(starterInfo(h.game, "legacy-user")).toEqual({ claimable: false, reason: "claimed", claimed: null });
    expect(starterClaim(h.game, "legacy-user", 8001)).toEqual([409, { error: "claimed" }]);
    const saved = (Object.values(h.state().accounts)[0] as any).profiles["0"];
    expect({ trunk: saved.trunk, rec: saved.rec, decks: saved.decks, claims: saved.claims }).toEqual(preserved);
    expect(saved.prog).toBe(1);
    expect(saved.starter).toBeUndefined();
    expect(saved.pbin).not.toContain(PP.STARTER_RIGHT);
    expect(saved.pbin).toContain(PP.STARTER_RIGHT + 1);
    expect(Object.values(saved.trunk).reduce((sum: number, n) => sum + Number(n), 0)).toBe(230);
    expect(client.errors()).toEqual([]);
    h.srv.world.closePeer(client.id); await h.tick(20);
  }
});

it("leaves the original Startup Present protocol unchanged with progression off", () => {
  PP.setProgression(false);
  const p = { prog: 1, pbin: [PP.STARTER_RIGHT, PP.STARTER_RIGHT + 1], trunk: { 1: 3 }, rec: { mp: 1800 } };
  const before = structuredClone(p);
  expect(PP.progressionReset(p)).toBe(false);
  expect(p).toEqual(before);
});
