# Focused core lifecycle review

Reviewed 2026-11-04 around 07:22 UTC on the existing `experimental/typescript-client-rewrite` branch. Only `tests/core-scope.test.ts`, `tests/core-cache.test.ts`, and this report were written. Implementations and configuration were not changed.

## Confirmed findings for the parent

### Cache insertion can resurrect an entry after disposal (lifecycle defect)

In `cache.ts:36-38`, eviction calls user destruction code before insertion commits. That destructor can synchronously call `cache.dispose()`. The insertion then resumes without checking `closed` and adds a new entry to the disposed cache. Later `dispose()` returns immediately, and `acquire()` returns null, so the new entry cannot be acquired or destroyed through the public API.

Deterministic reproduction: budget 4; insert A with 4 bytes; its destructor calls `cache.dispose()`; insert B with 4 bytes. Observed: insertion returns true, `bytes === 4`, `size === 1`, destruction log contains only A, and a subsequent disposal leaves those counters unchanged. Expected: no retained entry in the closed cache, with incoming-value ownership resolved explicitly. Consider guarding/revalidating the commit after destruction callbacks or explicitly preventing cache mutation from destruction callbacks. A callback that inserts/acquires other entries could also invalidate a precomputed eviction plan; that broader behavior has not been exhaustively tested.

Regression: `does not retain an unreachable entry when an eviction destructor disposes the cache` uses `it.fails`. Its current assertion models successful insertion transferring ownership of B to the cache; a fix that rejects insertion instead should also update the regression to verify caller ownership on rejection.

### NaN replacement violates capacity rejection atomicity and byte budget

In `cache.ts:33`, `k !== key` does not match Map's SameValueZero key equality for NaN. The existing NaN entry is credited once as the replaced entry at line 29 and again as an eviction candidate at line 33.

Deterministic reproduction: budget 10; insert NaN -> OLD with 3 bytes; insert 1 -> PINNED with 7 bytes and acquire its lease; replace NaN with NEW of 5 bytes. Observed: true, 12 bytes used, OLD destroyed. Expected: false, original entries retained, 10 bytes used, no destruction. Use Map-compatible key equality or compare the candidate entry with `old`. String-only keys avoid this case, but the exported generic API accepts numeric keys.

Regression: `never double-counts a NaN replacement as an additional eviction candidate` uses `it.fails`. Convert it to ordinary `it` after the implementation is fixed. Both expected-failure tests were temporarily run as ordinary tests and failed with the exact states above, then restored.

## Verified behavior

- ResourceScope: repeated/manual release and disposal execute cleanup once; abort precedes disposal cleanup; reverse cleanup ordering; aggregation and continued cleanup after exceptions; immediate cleanup after closure; reentrant sibling release/registration; recursive child disposal and unlinking, including throwing children.
- Timers/listeners: pending timeout and interval cancellation; explicit timeout cancellation; timeout detaches before a throwing callback; disposal inside a timeout suppresses later callbacks; closed scopes allocate no timers/listeners; invalid intervals reject without allocating.
- 1,000 deterministic scenes: child panel detach, listener dispatch/removal, an interval tick, a pending timeout, two cleanup callbacks, and repeated disposal on each scene. Parent registration count and timer count return to zero every iteration. Exactly 1,000 listener callbacks and interval ticks, zero pending timeout callbacks, 2,000 cleanup callbacks, and 1,000 listener removals.
- BudgetCache: independent leases and idempotent release; unleased LRU eviction; pinned replacement refusal; atomic ordinary insertion/replacement capacity rejection; oversized rejection retains caller ownership; grow/shrink replacement byte accounting; zero budget/zero-byte values; safe-integer bounds; aggregate destructor exceptions; disposal with outstanding leases; repeated disposal.
- 1,000 deterministic cache pressure rounds: a persistent pinned entry, a 6-byte scene entry in an 8-byte budget, rejection while both are leased, release and eviction each round. All 1,001 accepted values are destroyed exactly once and no rejected value is destroyed.
- Destructor exceptions during ordinary eviction propagate after partial mutation, but counters remain consistent and subsequent disposal cleans remaining entries. This is characterized explicitly; transactional rollback on arbitrary destructor failure is not provided.

## Actual validation and gaps

From `client/experimental-ts`:

```sh
node tools/run.mjs vitest run tests/core-scope.test.ts tests/core-cache.test.ts
```

Result: 39 cases, comprising 37 ordinary passes plus 2 confirmed expected failures; 2 test files pass. The green Vitest summary includes the expected failures and does not mean the reported defects are fixed.

Strict isolated checking of both test files and imported core modules also passed, using server-installed tooling without editing configuration:

```sh
node tools/run.mjs tsc --noEmit --strict --skipLibCheck --verbatimModuleSyntax --target ES2022 --module ESNext --moduleResolution Bundler --lib ES2022,DOM,DOM.Iterable --baseUrl ../../server/node_modules tests/core-scope.test.ts tests/core-cache.test.ts
```

Project-wide `node tools/run.mjs tsc --noEmit` failed at this snapshot with TS2345 Uint8Array<ArrayBufferLike>/Uint8Array<ArrayBuffer> incompatibilities in `src/gameplay/commands.ts`, `social.ts`, and `trade.ts`; these are outside this ownership scope and may be changing concurrently. Project tsconfig includes source files only, so that command alone would not check test typing.

These are deterministic Node-environment unit tests with fake timers and EventTarget. They do not establish browser heap/GC behavior, GPU/image ownership, real fetch cancellation, scene integration, application/browser parity, or behavior under every destruction-callback reentrancy pattern. Outstanding cache leases do not delay explicit whole-cache disposal; callers must order scope/cache lifetimes appropriately. No full parity claim is made.

## Parent follow-up

The two reported cache defects were fixed during integration: eviction now excludes the replaced entry by identity (Map-compatible for NaN), and insertion rejects reentrant cache mutation and stops if destruction disposes the cache. Rejected incoming values remain caller-owned. Both regressions are ordinary passing tests; all 39 core tests passed after the changes. The earlier expected-failure summary above describes the review snapshot, not the final implementation.
