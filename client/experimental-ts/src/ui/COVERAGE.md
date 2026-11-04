# Browser UI coverage

This UI is an independent renderer/controller boundary. It does not read the original client's memory, drive synthetic canvas clicks, run card rules, or fabricate server state. `mountClient` owns its DOM subtree and subscription and can be disposed. All game mutations use semantic `ClientCommand` values.

Implemented UI paths:

- Cookie-backed sign-in status, password sign-in, Discord sign-in link, sign-out and explicit connection action.
- Character listing, selection, creation and confirmed deletion; starter-deck choice where the controller reports eligibility.
- Lobby map pointer/keyboard movement, leased original scene tiles/objects/front layers, camera coordinates, player interaction/duel commands, bounded chat history and composer. Original avatar movies render only for supplied appearance parts; nearest visible actors are capped at 24 with explicit artwork fallbacks.
- Deck selection/new/save/delete, fuzzy collection search/paging, type/attribute/race/numeric/owned filters and sorting, Main/Fusion/Side sections, add/remove/move/reorder by drag, keyboard or explicit buttons, inventory/copy-limit feedback, card details. Native YDC, YDK and JSON imports/exports and controller-supplied recipes preserve ordered cards for independent service validation.
- Shop categories, server prices/wallet, quantities and purchase confirmation; bounded acquired-card receipts and replay labels use actual purchase results.
- Rock/paper/scissors and first-player choice, explicit start-ready preparation.
- Two-sided duel field, hidden card backs, hand/zone placement, pile top/counts, LP/turn/phase, server-issued card context actions (including face-down cards without identity disclosure), card inspector, bounded log, surrender and result return.
- Prompt options, yes/no/position/place choices supplied as options, min/max multi-card choices, number and announcement entry, cancellation, stale-prompt rejection for pointer and Escape input, prompt-scoped drafts and keyboard focus restoration.
- Friends/mail read view plus integrated source social controls for mailbox, friend/ignore/team commands and acknowledged card-trade offers.
- Duel-room creation/options/password/challenge/acceptance, spectator enter/leave, and contextual tag/cosmetics panels; successful state comes from the controller/server.
- Automatic opponent search/preferences/cancel/refresh/retry, with queued-room counts and explicit unsupported automatic match-format pairing. Free Duel/Deck Editor mode is separate from world connection mode.
- Match score/round display, timed sideboarding, Main/Side swaps at full storage capacity, immutable Fusion pool and exact original section/pool checks before submission. Relay pilots/preparation roles block inactive partner actions.
- Authoritative player profiles, own comment/title controls and social interaction routing. Readonly duel pile inspection and public card/player turn counters remain visible without sending selections or revealing hidden cards.
- Source-stage NPC duel-or-talk invitation, greeting/result/gift progression, authoritative pack choices, confirmed receipts and inventory reconciliation for uncertain grants. Missing original dialogue and unmapped receipt identities are labeled explicitly.
- Original world-initialization NPC eligibility request and authoritative PBIN refresh; special-NPC refusal text uses the recovered private five-string blocks. Actual server tests verify first contact, natural win/loss, grants/pack consumption and earning Kaiba eligibility on a natural fifth win. World avatar drawing preserves the native root with direction-dependent foot offsets; previews retain centered feet.
- Registration, verification, reset, linked-account/claim helper and explicit gameplay-recording controls.
- Sound/music/motion/card-name settings and local audio-slot helper.
- Browser fullscreen on an explicit click, actual fullscreen/Escape observation, actionable permission/unsupported errors and scoped listener cleanup. Fullscreen is never persisted or requested at boot. Other renderer languages remain unavailable; `LANGUAGE.md` records the distinct resource/server language enumerations and missing localization requirements.
- Timeline-provided source card glides/flips and bounded provisional attack/chain/LP cues; animation ticks update field transforms without rebuilding every card tree.
- Lazy leased card art with viewport observation, per-passcode request sharing, scene/dispose cancellation and lease release.

Still required before gameplay parity can be claimed:

- Full current-client screen/menu inventory and captured visual/interaction comparisons.
- Original portraits/window skins, pack/reveal/coin/dice presentation and complete original visual comparisons. Map/card decoding has actual-asset browser evidence; generic field/window fallbacks remain placeholders and never parity evidence.
- Full source-verified animation/audio sequences and original camera behavior. The current world camera follows/clamps at a centered viewport, while original dead zones remain unimplemented. Existing animation-policy timings are explicitly provisional outside source-evidenced card motion.
- Detailed ritual/sum/tribute/announce/filter UI constraints beyond the current prompt view contract; server validation is still authoritative.
- Complete original screen/menu interaction coverage: NPC result-line category mapping, balloon substitutions/voice/styles and original result-record presentation, tournament flows, and source-verified comparisons for character appearance and integrated social/cosmetics/tag/room/spectator/match controls. Rendering controls and focused real-server checks do not prove every multiplayer flow.
- Broader real browser accessibility/mobile/touch/reconnect and memory coverage. A real original-assets probe now passes 30 map/deck cycles with constant DOM nodes (493), object URLs (84), listeners (94) and one document after correcting Blink's clear-src-after-detach retention; heap grew approximately 0.5 MiB. This scenario does not establish whole-client memory or gameplay parity.

The controller must mark unavailable scenes explicitly and map only occupied authoritative duel slots into `DuelView.cards`. Card identities and hidden information must already be filtered at the server/session boundary. A rendered mock or passing unit test is not a complete gameplay scenario.
