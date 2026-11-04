# Deck-testing scope investigation

The inspected current client exposes five editor actions: Load, Save, Recipe, Clear and Exit. No separate Deck Test action or existing practice API was established. The rewrite therefore adds no speculative practice controller, mirror opponent or server endpoint. Ordinary NPC challenges retain their normal progression and rewards.

Evidence: `client/src/Deck/DeckEntry.cpp::CDeckScene::init` (0x008da960), `DeckEntry.h`, and the existing `client/web-shell/htmlui/svelte/modern/deck/DeckScene.svelte` enumerate those five actions. `DeckEntryMain.cpp::frameTail` handles an already lobby-booked duel; it does not start a local editor test. `Deck/DuelCalls.cpp` forwards scene-mode bookkeeping. Files named `deck_test.mjs` are read-model/UI unit tests. Source and static PE identifier searches did not find EntryTest, DeckTest or TestDuel; negative searches alone do not prove absence from every historical release.

The original acceptance inventory included `deck.test` before this source investigation. That item is unconfirmed scope, not evidence that the current client has a missing test button. It must be reconciled against the supported current build before treating it as a release requirement; this investigation does not grant whole-flow parity credit.

The current server offers ordinary NPC and PvP reservations. NPC completion or disconnect can change persistent progression; free mode refuses NPC challenges and keeps its own PvP record. Consequently neither path can honestly be labelled no-economy practice. A future practice feature would need an explicit server-authoritative policy that suppresses all settlement, with validation and lifecycle tests. It is outside the established current editor behavior and has not been added here.
