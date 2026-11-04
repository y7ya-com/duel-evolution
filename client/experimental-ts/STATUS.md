# Experimental checkpoint — 2026-11-04

The requested completion condition is **not achieved**. The independent TypeScript client is implemented and playable for the exercised paths, but full parity with the current client plus improvements is not established. The one-hour work window ends at 2026-11-04 08:13:48 UTC; no automatic continuation is authorized after that pause.

## Latest verification

- Strict source TypeScript check: passed.
- Production Vite build: passed; approximately 246 KB JavaScript / 76 KB gzip, excluding private metadata, artwork, audio and source maps. This is a bundle-size result, not runtime memory use.
- Full suite: 43 files / 564 tests passed. Tests use locally supplied private game data where required.
- Two test-fixture literal adjustments made for the repository guard were rechecked separately: 35 network/tooling tests passed.
- Repository staged-file guard and whitespace check: passed. No game archives, generated private tables, artwork, binary clients, captures or source maps were staged.
- Reference-duel exercise: 72 recordings, 24,802 state boundaries, 66,966 packets and 5,235 successful semantic choices. The assertions cover the exercised board/piles, LP, identity/ownership/location, face/position and semantic-choice representability. Corpus byte equality is limited to action/phase packets. Other response categories have focused roundtrip tests; full recorded-response equivalence is not established.
- Actual server/OCGcore: four NPC decks reach natural defeats using exposed TypeScript choices. Additional tests cover PvP preparation, spectators, prompt-time tunnel resume, mixed native/new-client room-password bytes, social actions and trade settlement.
- Actual Chromium: desktop mouse and mobile touch create/select a character, claim a starter, enter NPC51, perform RPS/first-player setup, make exposed UI choices, reach a natural authoritative defeat and return to lobby. UI recording start/stop/download produces a trace that replays to the same result with no unsupported records. Authentication and HTTP deck storage are explicitly test fixtures; WebSocket framing, game authority and OCGcore are real.
- Chromium bootstrap/options smoke: desktop/mobile layouts, no old runtime or client WASM, no browser exceptions. After warmup, 100 title/options cycles retained 48 DOM nodes and about 99 KB additional JS heap after forced GC. This does not establish real-art/GPU, audio or long-duel memory bounds on target devices.

`npm run parity` deliberately exits 1. All 81 **whole-flow** acceptance items remain unverified pending the independent evidence required by that gate. Passing scoped tests does not automatically promote an entire acceptance flow. See PARITY.md and module integration notes.

## Material remaining work

1. Establish original scene/avatar/art presentation and camera behavior; current lobby presentation is simplified. Verify real archive media decoding and card detail/rules/alternate-art completeness.
2. Verify every duel prompt/card family and outcome beyond the recorded corpus, including complete win/draw and all match/sideboarding/tag paths through the browser UI.
3. Complete and compare original animation orchestration, combat timing, effect sounds, field themes, browser audio persistence and accessibility across supported browsers/devices.
4. Replace conservative grid-only world behavior with verified height scaling, pixel/foot collision probes and exit triggers; validate original map/NPC positions.
5. Exercise every social/trade/team/shop/cosmetics/menu flow through the real browser and production-style authenticated HTTP/D1 boundaries, including failures, reconnects and duplicate requests.
6. Measure long sessions with original assets on representative desktop/mobile devices. Existing cache budgets intentionally exclude browser decoded-image/GPU memory.

The checkpoint contains only new client files. Matching server/API changes already present in the original dirty working tree were preserved and are not part of this commit. A clean checkout requires those server changes and generated data. No push, PR, deployment or replacement of the published client was performed.
