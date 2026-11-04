# Experimental TypeScript duel client

`index.ts` exports the browser-only model, strict decoders, and semantic response encoder. No module in this directory imports server code, guest memory, a native library, or a WASM runtime.

## Integration

- Create a model with `createDuelState()` and reduce relevant duel-channel messages with `reduceDuelMessage(state, message)`. Relevant IDs are `0x6202`, `0x6610`, `0x6611`, `0x6612`, `0x6461`, `0x6613`, and `0x649b`. Session preparation, rock-paper-scissors, deck upload, reconnect and channel acknowledgement belong to `network/session.ts`.
- Encode an actual player choice with `encodeDuelResponse(state, response)`, sending all returned packets in order. Card list marks and card announcements require multiple packets. Never advance the board in response to a local choice; wait for server messages.
- Each new server request receives a fresh `prompt.id`. Reject callbacks from earlier prompts, and prevent duplicate submission while waiting. Repeated selections may return a new prompt with fewer legal candidates.
- Field selections, discards, and ritual materials are server-authoritative, one-at-a-time board actions. `cancel` can mean completing a partial selection. The legacy protocol omits some forced/cancel/minimum constraints; the server either accepts or resends the prompt. A cancel packet is not proof that cancellation succeeded.
- `visibleCards()` projects actual occupied slots. The card identity cache can temporarily retain displaced identities during the server's shuffled-pile reimposition.
- `events` is a bounded presentation queue. `acknowledgePresentation()` clears consumed events without affecting authoritative state. A queue overflow increments `droppedPresentationEvents`; it must not stall rule state. The current renderer does not yet reproduce all original animations or timings.
- `DuelTimeline` consumes previous/next packet states exactly once and advances in simulation frames. Its separate display queue has both a batch limit and a retained-card snapshot limit. The caller acknowledges only `timeline.acknowledgedThrough`. Skip, queue overflow and reduced motion explicitly fast-forward to the latest state while counting every consumed/skipped event. Root animation frames never delay networking or server rules.
- `applyTimeline()` overlays card positions/flip/rotation, LP interpolation and attack/chain/damage cues on a settled UI view. Interactive prompts wait until the bounded visual queue catches up. Source evidence supports the card's eight-frame glide with quarter-sine positional easing and shortest-path rotation (`CCard::step`, `SceneCard.cpp`). LP/attack/chain durations are provisional presentation policies, identified in `TIMING_EVIDENCE`. The UI's mat geometry and complete original animation orchestration are not yet verified as equivalent.
- `errors` reports rejected malformed packets transactionally. `unsupported` reports unknown categories explicitly. Both are bounded and neither should be hidden when assessing parity.

## Evidence and limits

`tests/duel-model.test.ts` uses actual server wire builders to verify state changes, hidden-card categories, owner/controller distinctions, face changes, shuffle seeds, malformed packet rejection, timers and bounded resources.

`tests/duel-responses.test.ts` roundtrips semantic commands through actual server translator handlers. `tests/presentation.test.ts` checks that visible options remain actionable, opponent targets are retained, hidden metadata stays hidden, result constants match the server, and multi-attribute selections encode correctly.

`tests/duel-fixture.test.ts` regenerates v2 server output while replaying private existing NPC/PvP recordings. It compares exact pile/field membership, card ownership and location, visible passcodes, field face and monster position, and LP at recorded boundaries. Recordings and their generated game data remain outside version control; missing data causes a visible skip. Synthetic unit recordings that directly mutate internals without emitting wire updates are excluded.

`tests/duel-timeline.test.ts` verifies the sourced movement curve, deterministic frame advancement, transactional separation from rule state, LP interpolation, same-packet acknowledgement, queue/card budgets, reduced motion, explicit skip accounting and long-stream memory bounds.

These checks establish only the tested state and response behaviors. They do not establish full gameplay, visual, animation, sound, accessibility, spectator privacy, mobile, or long-session browser memory parity. In particular, some dialog text still needs data-backed translation and the initial timeline is not the complete original animation implementation.
