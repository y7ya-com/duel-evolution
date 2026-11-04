# Real engine outcome coverage

`tests/duel-outcomes.test.ts` proves two deterministic outcomes using two real
`GameSession`s, actual `World` handlers and OCGCore. Both clients receive and reduce
their own server packets; every game choice goes through `encodeDuelResponse`.
There is no surrender, injected result, server-state mutation, mock core or engine
rule bypass.

## Observed outcomes

- **Win:** passive 42-card vs 40-card normal-monster decks. Both players pass turns
  and legally discard excess hand cards. The 40-card deck exhausts on turn 72.
  The respective local model results are `1` (win) and `2` (loss), mode `0`.
  Both authoritative finish logs explicitly identify `deckout`.
- **Draw:** 40-card deck containing one Wall of Revealing Light (`17078030`), three
  Self-Destruct Buttons (`57585212`) and normal-monster filler, vs a passive 42-card
  deck. The first client sets its traps, pays 7000 LP for Wall, then activates
  Self-Destruct Button at a 7000 LP difference. Both models observe the 1000/8000 LP
  state, then 0/0 LP and result `3` (draw), mode `0`, on turn 40.

Both tests assert one terminal packet and score packet per view, one persisted duel
record per profile, correct win/loss/draw counters, zero surrender counters, one
lobby profile update and one reward-pack notice per player, and exactly one pending
one-card PvP reward offer per profile. Both sessions return to the lobby; repeated
`finishDuel()` and draining late timers leave the entire settled profiles unchanged
and generate no duplicate reward notices. Reward **offers** are covered; subsequent
pack selection/card redemption and production MP-economy settings are outside these
fixtures.

## Integration notes

Subscribe to each attached `session.duel` before `beginDuel(false)`; reduce incoming
duel packets using `reduceDuelMessage`, then submit choices through
`encodeDuelResponse` and `session.sendDuel`. `false` requests server-managed placement.
Each view uses local player zero, including the second seat. `finishDuel()` returns
each session to the lobby.

Use the prompt kind when choosing responses: old board masks can remain visible
under a dialog. A trap activation opportunity first asks yes/no, then exposes a
field-selection action. Wall's numeric prompt displays **7000 LP** with wire option
value **7**, not 7000. The existing encoder correctly accepts this sequence; no
encoder defect was found in these paths.

The fixture enables `DECK_CHECK=bloquear`, disables room surrender and the optional
room turn clock, and uses fixed `PARITY_SEED=1`. It does not enable `PVP_TEST`.
The server logs assert MR1. Decks are checked against actual development character
collections and the server's runtime card/limit tables (including Wall's one-copy
limit). Normal gameplay resolves on the server throughout.

Only hand-authored public passcodes appear in source. Private runtime databases,
engine scripts and recordings remain read-only; no derived asset fixtures are
copied, and no archives are downloaded.

## Verification

From the repository root:

```sh
node client/experimental-ts/tools/run.mjs vitest run tests/duel-outcomes.test.ts tests/network-session.test.ts tests/duel-model.test.ts tests/duel-responses.test.ts
```

These tests cover the session/model/semantic-encoder boundary. They do not prove
DOM rendering, best-of-three sideboarding, NPC victory rewards, every draw effect,
or full client parity.
