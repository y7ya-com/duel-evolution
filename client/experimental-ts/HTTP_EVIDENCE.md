# Local HTTP/auth/D1 integration evidence

Recorded 2026-11-04. This is a local integration suite, not browser, deployment, full-client parity, or Cloudflare-runtime parity evidence.

Run from `client/experimental-ts`:

```sh
node tools/run.mjs vitest run tests/http-client-e2e.test.ts tests/services-http.test.ts tests/services-api.test.ts
```

Observed result: **3 files passed, 18 tests passed**, including **3 new HTTP integration tests** (2026-11-04 10:04 UTC; 11.57 seconds total). The expected invalid-password test produces a better-auth warning. The process exits normally after fixture teardown.

## Actual implementation exercised

`tests/http-worker-fixture.ts` hosts an ephemeral loopback HTTP server. Its HTTP adapter converts incoming bytes into Requests for the unmodified `server/src/worker.ts` Hono Worker. Auth requests reach the actual `authApp` and better-auth implementation. Authenticated game HTTP requests reach the actual `WorldDO.fetch` handlers. Those handlers execute real game/deck/shop code; no asserted API payload is synthesized, replaced, or intercepted by a mock.

The database is an in-memory Miniflare D1 database obtained with the installed Wrangler `getPlatformProxy`, using `server/test/auth.wrangler.jsonc`, `persist: false`, and **all** checked-out SQL migrations. Auth, rate limits, deck rows/current pointers/tombstones, and the game-state write-through sink all use that database. Tests query D1 directly and reload game state through the actual D1 adapter to verify persisted identities and character data.

The client path is **`GameApi(new HttpClient(...))`**, the API implementation used by ClientApp and exported by `src/services/api.ts`.

## Assertions in the new suite

- Signed-out session; signup through `/api/de/register`; actual D1 unverified flag; username login refused before verification.
- Verification through the real `/api/de/discord-forward` HMAC/timestamp route, using a locally generated signing key and synthetic Discord identity. No Discord endpoint is called.
- Wrong password rejected; successful username login; signed cookie stored; both `/api/de/session` and better-auth `/api/auth/get-session` resolve the D1 user.
- Actual Worker `/net` authorization and forwarding to `/boxedwine-network` replaces a forged `x-de-user` with the authenticated user's identity. The real `GameSession` then uses a local WebSocket and actual World/game wire handlers to create/select a character and enter the lobby.
- Deck access before game login and before character selection returns the real 409 errors.
- Deck create/read/update/delete, world/free current selection, UTF-8 deck name, tombstone, clearing current pointers, and refusing selection of a deleted deck. Direct D1 assertions check saved cards and deletion.
- Actual progression-mode shop response decoded by the client; two packs grant ten cards and debit the returned wallet once. Retrying the same server-issued request ID returns the same cards/wallet; conflicting reuse and stale IDs are rejected.
- Real staging-only `/api/de/test-sign-in` authenticates another synthetic user with a runtime-generated test key; its WebSocket identity, deck ownership, and different-character deck scope are checked.
- Sign-out deletes the actual D1 session. Replaying its formerly valid cookie returns signed out, refuses protected HTTP, and refuses a new WebSocket before world binding.
- Forged signed-cookie text and forged identity headers cannot access decks; a forged cookie cannot establish a game binding.

## Exact remaining fixture boundaries

1. Node HTTP transports logical `https://http-client.test` Requests over a loopback HTTP socket. A small explicit cookie jar adds Origin/Cookie and stores/deletes Set-Cookie pairs. This is **not** browser enforcement of Secure/HttpOnly/SameSite, TLS, CORS, CSRF in a browser, or real browser fetch credential behavior. The HTTP body/status under assertion is still produced by the actual Worker/routes.
2. The `cloudflare:workers` DurableObject base class is a test shim. The fixture creates a `WorldDO` from its actual prototype and supplies its actual game server, environment, and D1 sink. Its constructor, cold-start D1 bootstrap/fallback, `blockConcurrencyWhile`, isolate lifecycle, alarms, and R2 boot are not exercised.
3. Duel boot is mocked solely to avoid loading the Cloudflare/raw-WASM engine module. No duel core, duel result, engine boot, or full game parity is asserted. Character/protocol and HTTP game handlers use their actual implementations.
4. Node `ws` replaces the Cloudflare WebSocketPair/101 host. Actual Worker auth and forwarding run first. A private 204 sentinel from the namespace adapter signals the Node host to complete the real network handshake and call `world.openPeer` with the forwarded identity. That sentinel is not an asserted game/API response. `WorldDO`'s WebSocketPair branch, keepalive, production transport resume, and Cloudflare upgrade semantics remain outside this evidence.
5. Discord verification is a synthetic, locally signed bot message through the real verifier. No Discord bot interaction, OAuth round trip, external provider, production connection, or deployed secret is used. All signing/auth/test-sign-in keys are generated per fixture run.
6. Logout invalidation is asserted for HTTP and **new** WebSocket attempts. Automatic closure/revocation of an already-open socket is not asserted.
7. Data comes from the checkout's existing server modules/catalogs plus synthetic users, characters, and small deck requests. The fixture downloads no game archive and adds no game-derived dataset.

Teardown disposes client APIs/sessions, terminates local sockets, drains world work and D1 writes, clears the game's idle sweep, closes WebSocket/HTTP listeners, and disposes Miniflare. Setup failure follows the same cleanup path after proxy creation.
