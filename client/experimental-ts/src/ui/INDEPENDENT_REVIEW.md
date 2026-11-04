# Independent UI review

Reviewed 2026-11-04, starting 07:24 UTC. Scope: `src/ui/**`, existing `tests/ui*.test.ts` and their DOM fixture. Production and existing test files were not modified. Parent application is not yet integrated: findings below concern valid renderer contracts, not claims about a live server session or completed gameplay parity.

## Priority findings

### 1. P1 — Server-issued actions on face-down cards cannot be reached

**Locations:** `index.ts:272`, `index.ts:281`, `index.ts:289–292`.

Card-specific actions are removed from the global action bar. Opening their inspector requires `c.faceUp`, and the inspector itself requires a currently face-up card. Consequently an authoritative action targeting a player's set spell/trap or face-down monster has no UI entry point. This blocks activation or flipping whenever the controller represents the actual face-down position in `faceUp`.

**Reproduction:** Supply one card `{ id: 'set1', name: 'Known Trap', controller: 0, zone: 'spell', index: 0, faceUp: false }` and `actions: [{ id: 'activate', cardId: 'set1', label: 'Activate trap' }]`. Click the card labelled `Face-down card, your spell`, flush a microtask, then inspect the buttons and dispatched commands.

**Observed in the DOM fixture:** zero `Activate trap` buttons; zero commands. The hidden name also does not appear, which is correct. Preserve that secrecy while exposing the supplied action labels independently of whether artwork/details may be revealed. Do not solve this by marking set cards face-up.

The same action routing also deserves attention for non-top cards of piles: `index.ts:270` removes their tiles and there is no pile browser, while `index.ts:281` still removes their card-specific actions from the bar. This consequence is source-derived, not separately exercised against a controller.

### 2. P2 — Legal empty card selections have no submission control

**Locations:** `index.ts:313–320`, `index.ts:330`; `helpers.ts`, `validatePromptResponse` card-selection branch.

The entire selection UI, including Confirm Selection, is conditional on a nonempty candidates array. The contract and validator allow an empty selection when `min` is zero. Such a prompt can therefore be valid but impossible to answer.

**Reproduction:** Supply `{ id: 'zero', kind: 'cards', text: 'Select zero cards', min: 0, max: 0, candidates: [], options: [] }` with no cancellation.

**Observed in the DOM fixture:** only Surrender/navigation controls are available; the prompt says `Waiting for supported choices from the server.` There is no way to send `{ cardIds: [] }`, which satisfies the declared validator. Render an explicit confirmation for valid zero-choice responses rather than interpreting an empty candidate list as unsupported.

### 3. P2 — Escape bypasses stale-prompt validation

**Locations:** `index.ts:393–395`, compared with `index.ts:302–306`; existing test `tests/ui-lifecycle.test.ts:46–53`.

The prompt button path re-reads `controller.getState()` and validates the current prompt. Escape instead uses the cached state from the last render and dispatches directly. The existing stale-prompt test covers buttons only.

**Reproduction:** Render a cancelable prompt with id `old`. Publish a new, noncancelable prompt with id `new`, then invoke the host Escape handler before the queued render microtask runs, exactly as the existing stale-button test invokes an old handler before rendering.

**Observed command:** `{ type: 'duelRespond', promptId: 'old', response: { cancel: true } }`. No expired-choice rejection occurs. A server may reject this, but the renderer's stated stale-response guarantee is incomplete. Route keyboard cancellation through the same current-state check as prompt buttons.

### 4. P2 — Candidate selection and state updates discard keyboard focus

**Locations:** `index.ts:315–317`, `index.ts:371–389`, `index.ts:118–127`.

Every render replaces the stage subtree. Focus preservation only handles controls with `data-key`, which excludes candidate buttons, field cards, selects and the lobby canvas. Selecting a candidate immediately queues a render that removes the focused button. A subsequent authoritative update similarly removes the focused movement canvas. Keyboard users must repeatedly locate the controls again.

**Reproduction:** Render a two-candidate card prompt, focus candidate A, activate its click handler, and flush a microtask. Query whether the UI contains `document.activeElement`.

**Observed in the DOM fixture:** `activeInUI: false`; the newly rendered A button correctly has `aria-pressed="true"`, but focus still references the removed A node. Real-browser focus destination and screen-reader behavior were not measured; removal of the focused node and absence of restoration are established. Preserve focus for interactive controls across updates, including the canvas, and establish prompt focus deliberately.

### 5. P2 — A new prompt inherits the previous prompt's edited input

**Locations:** `index.ts:322`, `index.ts:326`, `index.ts:371–373`, `index.ts:387–389`.

Number and announcement controls use keys shared across every prompt. Render restoration copies the previous focused input value into the new node without checking prompt identity. The prompt selection set is reset by id, but typed input is not isolated the same way. This can submit a previous choice for a different question.

**Reproduction:** Render number prompt `one`, bounds 0–100; focus its input and enter `73`. Publish number prompt `two`, bounds 1–100, then flush the render microtask.

**Observed in the DOM fixture:** the second prompt displays `73`, overriding its freshly created default `1`. Pressing Confirm accepts it because it remains within the new bounds. Scope input preservation to the prompt id; preserve drafts on updates of the same prompt only. The announcement input shares the same problematic key pattern.

### 6. P2 — Mobile deck editing removes access to card rules/details

**Locations:** `styles.ts:95`; `index.ts:171–173`, `index.ts:205–211`.

At viewport widths up to 700px, `.de-card-inspector { display:none; }` hides the only deck view containing card descriptions, type/attribute/level and ATK/DEF. The remaining selection controls offer add/remove/move commands, but no alternate details disclosure. A mobile user can select a card and modify the deck without being able to read its effect in this scene.

**Reproduction from source/CSS:** Use a deck collection card with a description and select it at a viewport width of 390px. Its details are rendered exclusively in the hidden inspector; no mobile replacement is produced. This is a source/CSS finding, not a browser-layout measurement. Provide a mobile detail sheet or expandable inspector.

## Verification and boundaries

- Ran `node tools/run.mjs vitest run tests/ui-helpers.test.ts tests/ui-lifecycle.test.ts` from `client/experimental-ts`: **2 files, 12 tests passed**.
- Reproduced findings 1–5 using an ephemeral Node stdin harness: transpile the UI and existing `tests/ui-dom-fixture.ts` in memory with TypeScript, mount a controller whose `getState` returns a mutable `ClientView`, publish updates through its subscription, and flush renders with `await Promise.resolve()`. No test files or harness files were written. Findings give the concrete input, interaction and observed output needed to repeat them in that fixture.
- Extensionless relative TS imports are present in the reviewed UI and test files; no import changes were made.
- Text construction uses text nodes rather than HTML interpolation. The existing hostile-chat test passes. Face-down card tiles omit name/artwork, and duel inspection rechecks current face-up visibility. No newly hidden card identity leak was demonstrated. Candidate labels/cards and duel logs still require the controller/session boundary to supply authorized information; this review does not validate that unintegrated boundary.
- Disposal unsubscribes, removes the mounted subtree, suppresses queued renders and prevents further dispatch through `send`; the existing lifecycle test passes. No additional timer/socket/global listener resource is owned by this renderer. Heap retention and browser lifecycle behavior were not measured.
- Connection labels come from authoritative state; unavailable scenes suppress scene controls, as tested. No fabricated successful state transition was demonstrated. Preparation phase heuristics and parent action adapters still need integration validation.
- No real-browser accessibility, touch, screen-reader, layout, network/reconnect or complete gameplay validation was performed. The fixture deliberately does not emulate browser rendering. Passing these 12 tests is not evidence of those behaviors or parent integration.

## Parent integration follow-up

The UI lead fixed all six findings and added regressions: face-down actions, zero selections, stale Escape, focus preservation, prompt-scoped inputs and mobile details. Subsequent UI/app suites pass; the findings above remain historical review evidence, not unresolved status. Full original visual equivalence is still unproven.
