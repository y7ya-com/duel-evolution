# ClientApp integration review

Assigned scope: tests/app-server.test.ts, tests/app-lifecycle.test.ts, this report. No production edits, commits, pushes, branch changes, or browser claims.

No new public API is required. Tests use ClientApp.dispatch/getState/diagnostics, GameApi(HttpClient), and the network fixture's exported setup/drive/sessionFactory. This report carries the integration notes because a separate integration.md is outside the assigned file ownership.

The HTTP fixture supplies authenticated session JSON and minimal account deck storage. Starter, purchase, shop, and friends payloads come from actual server functions. All character/lobby/PvP/NPC traffic uses real GameSession against the in-process World. No fabricated duel packets are injected. Delayed mutation responses deliberately ignore fetch abort so the real HttpClient's abort handling and app epoch boundaries are exercised.

Latest targeted command:

```
node tools/run.mjs vitest run tests/app-server.test.ts tests/app-lifecycle.test.ts
```

Result: 16 tests, 14 passed, 2 failed. The failures below remain ordinary failing regression tests; they are not skipped or marked as expected failures.

1. **Unfinished duel navigation guard can be bypassed through Settings.** Start an actual NPC duel, openScene(settings), then openScene(lobby). The last command resolves, although opening Lobby directly during a duel is supposed to reject with "Finish or surrender the duel first." app.ts gates this on view.scene === 'duel'; Settings changes that scene without ending the duel. Regression: app-server.test.ts, "cannot leave an unfinished duel through the settings scene". Use actual session/duel activity rather than visible scene as the navigation guard.
2. **Invalid newDeck mutates the editor before rejecting.** Enter with a saved deck, dispatch newDeck with an empty name (rejects), then openScene(deck). The editor now contains an empty deck named ''. app.ts assigns this.editor before validating rename. Regression: app-lifecycle.test.ts, "keeps the current editor intact after rejecting an invalid new deck name". Validate a candidate before replacing the current editor.

An earlier run also found phase:5 exposed during a real yes/no dialog, which the encoder rejected as "Phase is not enabled". The latest production changes fix that: the natural-result test now passes, including its dialog assertion. No reviewer production edit was made.

Passing coverage:

- Actual character creation/selection, lobby/NPC and collection projection, exact deck save payload and real friends response.
- Both real PvP offers automatically attach, complete RPS/first-player preparation, and produce authoritative gameplay for both apps.
- Actual NPC 51 reaches a natural authoritative Defeat through projected semantic UI prompts/actions; no surrender or fabricated result. Stale prompt and duplicate submission rejection are checked along the way.
- Disconnect during character boot, saveDeck, selectDeck, real starter claim, and real purchase does not revive player/deck/shop state or repopulate service resources.
- An old request's finally cannot unlock a new connection request.
- Settings validate atomically, persist, and survive reconnect; permitted settings/disconnect remain available while a mutation holds the command lock.
- Disposal is idempotent, aborts in-flight HTTP, closes actual sockets and gateway channels/requests, clears client interval handles, and never notifies removed subscribers afterward.

Global fake timer counts include server card-wire hello timeouts and Hub session sweeps; they do not measure client timer leaks. Tests check actual client interval handles via clearInterval calls and gateway diagnostics, and advance server cleanup time before those assertions.

Limits: tests establish protocol/controller behavior, not browser rendering or visual parity. Only one NPC naturally finishes in this app suite (the network lead owns broader NPC coverage). Auth/deck fixtures do not validate production HTTP routing, cookies, or persistent deck database integration. Awaited mutation tests validate the actual GameApi/HttpClient boundary; they do not assert safety for arbitrary injected API implementations that violate abort semantics.

## Parent integration follow-up

Both reported application defects were fixed: unfinished-duel navigation now checks session activity even from Settings, and a candidate new deck is validated before replacing the editor. All 16 app-server/lifecycle regression tests subsequently passed. Later integrations add bounded animation, account management, audio, live capture and collision navigation; their separate tests and final verification record should be consulted for current scope.
