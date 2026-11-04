# Browser UI coverage

This UI is an independent renderer/controller boundary. It does not read the original client's memory, drive synthetic canvas clicks, run card rules, or fabricate server state. `mountClient` owns its DOM subtree and subscription and can be disposed. All game mutations use semantic `ClientCommand` values.

Implemented UI paths:

- Cookie-backed sign-in status, password sign-in, Discord sign-in link, sign-out and explicit connection action.
- Character listing, selection, creation and confirmed deletion; starter-deck choice where the controller reports eligibility.
- Lobby map pointer/keyboard movement, supplied avatar/map artwork, player interaction/duel commands, bounded chat history and composer.
- Deck selection/new/save/delete, collection search/paging, Main/Fusion/Side sections, add/remove/move by drag, double click or explicit buttons, inventory/copy-limit feedback, card details.
- Shop categories, server prices/wallet, quantities and purchase confirmation.
- Rock/paper/scissors and first-player choice, explicit start-ready preparation.
- Two-sided duel field, hidden card backs, hand/zone placement, pile top/counts, LP/turn/phase, server-issued card context actions (including face-down cards without identity disclosure), card inspector, bounded log, surrender and result return.
- Prompt options, yes/no/position/place choices supplied as options, min/max multi-card choices, number and announcement entry, cancellation, stale-prompt rejection for pointer and Escape input, prompt-scoped drafts and keyboard focus restoration.
- Friends/mail read view plus integrated source social controls for mailbox, friend/ignore/team commands and acknowledged card-trade offers.
- Duel-room creation/options/password/challenge/acceptance, spectator enter/leave, and contextual tag/cosmetics panels; successful state comes from the controller/server.
- Registration, verification, reset, linked-account/claim helper and explicit gameplay-recording controls.
- Sound/music/motion/card-name settings and local audio-slot helper.
- Timeline-provided source card glides/flips and bounded provisional attack/chain/LP cues; animation ticks update field transforms without rebuilding every card tree.
- Lazy leased card art with viewport observation, per-passcode request sharing, scene/dispose cancellation and lease release.

Still required before gameplay parity can be claimed:

- Full current-client screen/menu inventory and captured visual/interaction comparisons.
- Original supplied map, avatar, card, portrait and window assets integrated through the asset service; geometric map/field fallbacks are placeholders and never parity evidence.
- Full source-verified animation/audio sequences, avatar/coin/dice/pack/reveal presentation, map art/camera and collision/pathfinding equivalence. Existing animation-policy timings are explicitly provisional outside source-evidenced card motion.
- Detailed ritual/sum/tribute/announce/filter UI constraints beyond the current prompt view contract; server validation is still authoritative.
- Complete original screen/menu interaction coverage: character appearance, deck filters/import/export/order, NPC dialogue/rewards, tournament flows, and source-verified comparisons for integrated social/cosmetics/tag/room/spectator controls. Rendering those controls and unit protocol checks do not prove every multi-player flow.
- Real browser accessibility, mobile/touch, repeated-scene memory and reconnect checks. The lightweight DOM lifecycle tests validate command/subscription safety, prompt focus/draft/hidden-action regressions and artwork ownership, not browser layout or gameplay parity.

The controller must mark unavailable scenes explicitly and map only occupied authoritative duel slots into `DuelView.cards`. Card identities and hidden information must already be filtered at the server/session boundary. A rendered mock or passing unit test is not a complete gameplay scenario.
