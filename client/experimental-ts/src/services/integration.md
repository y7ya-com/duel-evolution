# Browser service integration

Import from `./services` (extensionless). `GameApi` is the typed stateless API;
`GameplayService` adds observable resources and safe purchase tracking.

```ts
import { GameplayService, DeckEditor, toShopView } from './services';
const services = new GameplayService(); // same origin, session cookie; no token storage
const stop = services.shop.subscribe(({ data, loading, error }) => {
  // Merge into ClientView in the controller, then notify render-only UI.
  if (data) renderShop({ ...toShopView(data), loading, error: error ?? undefined });
});
await services.refreshSession();
await services.signIn(username, password); // POST auth, then GET authoritative session
await services.refreshDecks();
await services.refreshShop();
await services.buy(itemId, count);
// If buy throws, report the error. No automatic retry takes place.
// Show an explicit retry action using services.retryPurchase(): same body + requestId.
// services.pendingPurchase exposes a detached copy for the controller to display.
// Cleanup on controller teardown:
stop();
services.dispose();
```

The code above is illustrative: `renderShop`, username/password and selection values
belong to the parent controller. Handle rejected promises in dispatch; failed
refreshes retain the last successful data. Each resource exposes `.state`,
`.subscribe(listener)`, `.clear()` and `.invalidate()`. Snapshots are detached.
Refresh methods accept `{ signal }`. Superseded requests reject with `AbortError`
and cannot replace newer data; the controller can suppress that cancellation
message. Dispose aborts transport requests and clears subscriptions.

## Methods and route sources

- `session()`, `signIn(username, password)`, `signOut()` on `GameApi` use
  `/api/de/session`, `/api/auth/sign-in/username`, `/api/auth/sign-out`.
  Session carries nullable name, roles and password/Discord capabilities.
  Sources: `server/src/auth/routes.ts` and installed better-auth username/sign-out routes.
- `decks()`, `saveDeck(deck, currentMode?)`, `selectDeck(name, mode = 'world')`,
  `deleteDeck(name)` map to `GET/PUT /api/de/decks`, `PUT /api/de/decks/current`
  and `DELETE /api/de/decks/<encoded name>`. Modes are `world | free`.
  GET includes `current` per mode, updated timestamps and deletion tombstones.
  Source: `server/src/game/decks.ts`, dispatch in `server/src/do.ts`.
- `starter()` returns a discriminated claimable/reason/claimed envelope;
  `claimStarter(id)` returns `{ ok, id, cards, deck }`. Server starter decks use
  `[passcode, count]` pairs. `expandStarterDeck` converts them to `DeckView`.
  Source: `server/src/game/starter.ts`.
- `shop()`, `purchase({ itemId, count, requestId })`, `wallet()` use
  `/api/de/shop`, `POST /api/de/shop/buy`, `/api/de/wallet`. Wallet is
  `{ total, bound, earned }`. Shop includes `available`, items and
  `nextRequestId`; purchases add `purchased` and `replayed`.
  Sources: `server/src/game/shop-api.ts` and `starter.ts`.
- `friends()`, `chat(after)`, `sendChat({ channel, text, targetPid?, requestId? })`
  are optional stateless methods on `GameApi`. Friend identities are `pid`,
  not `id`. Chat reads and writes have nested `ok` envelopes. Channels are
  `global | trade | whisper | team`; whispers use numeric `targetPid`.
  Sources: `Lobby.friendsInfo` and `server/src/game/chat.ts`.
- `toShopView`, `toSocialView`, `toChatLine` adapt server shapes to
  `src/ui/contracts.ts`. `GameplayService.api` exposes all stateless methods.

`GameplayService` refresh methods are `refreshSession/Decks/Starter/Shop/Wallet/Friends`;
resources are `session/decks/starter/shop/wallet/friends`. It also exposes
`saveDeck`, `saveEditor`, `selectDeck`, `deleteDeck`, `claimStarter`,
`signIn`, `signOut`, `buy`, `retryPurchase`, `abandonPurchase`.
Deck/starter mutations invalidate concurrent refreshes but do not invent a local
server result: explicitly refresh the affected resources after success.
Character selection, collection inventory and world state must come from the
network controller. Before switching characters, clear character resources,
replace the editor and reconcile any pending purchase against its original
character. An editor or purchase must never be reused across character identities.

## Deck editing

```ts
const editor = new DeckEditor(savedDeck, collection); // CardView metadata from network/core
editor.rename('My deck');
const result = editor.move(passcode, 'collection', 'main');
// result.ok / result.reason / result.hints drive UI feedback.
editor.move(passcode, 'main', 'side', sourceIndex); // source index disambiguates copies
await services.saveEditor(editor, 'world');
// Failed save preserves edits; edits made during save remain dirty.
```

`editor.deck` is a detached passcode-array snapshot. `dirty`, `hints()`,
`available(passcode)`, `count(passcode)`, `reset()`, `load(deck)` and
`setCollection(cards)` support the UI. `markSaved(submittedSnapshot)` is available
for direct API users; call only on confirmed success. Save ordering and editor
replacement are handled by `saveEditor`.

Load never rejects, sorts, truncates or rewrites legacy decks. Additions respect
known owned copies and supplied copy limits across all three zones. Unknown
inventory does not mean zero ownership. Explicit `extra` metadata supplies zone
hints; side accepts both types. Capacities match server storage bounds (80 main,
15 side, 30 extra). There is no modern minimum-size or universal three-copy rule.
These edit constraints and hints do not gate saving an existing deck or establish
legality. Server card validity, progression and duel checks remain authoritative.
Rename edits the draft name; the server only has upsert/delete, so saving a renamed
deck creates another name. Delete the old name explicitly only after save succeeds.

## Failure behavior and limits

HTTP uses same-origin credentials, no redirects, no retries, a 4 MiB decoded body
byte limit and a 20-second timeout (configurable through `HttpClient`). Aborts,
reader cancellation, listeners and timers are cleaned up. Non-2xx JSON becomes
`ApiError` with status, code, message and payload. Invalid/oversize success bodies
become `ResponseError`. Runtime decoders validate required route fields.

A failed/aborted purchase retains its original request body, catalog and wallet.
Starting another purchase is blocked until explicit retry or abandonment. Retrying
uses the server receipt mechanism, never a guessed token. `abandonPurchase()`
clears the catalog and requires a fresh GET; use only after reconciling the uncertain
outcome. Pending receipts are memory-only; page reload recovery is not implemented.
Server receipts retain only the latest 16 purchases. No cosmetic API integration,
auth registration/reset UI, collection acquisition or browser end-to-end coverage
is claimed here.
