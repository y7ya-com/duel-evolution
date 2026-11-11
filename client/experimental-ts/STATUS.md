# Experimental checkpoint — 2026-11-04

The requested completion condition is **not achieved**. The independent TypeScript client is implemented and playable for the exercised paths, but full parity with the current client plus improvements is not established. The original one-hour work window paused at 2026-11-04 08:13:48 UTC. The user resumed work and explicitly removed the time limit. The checkpoint results below are historical; resumed integration is in progress.

## Window skin and menu bar — 2026-11-04

Out-of-duel screens now use the original window language (src/ui/skin.ts over styles.ts, CSS with colours sampled from
data/common/window/* as in the htmlui replica): cyan bevel windows with the blue title bar, yellow Main Menu keys,
cream plate keys in the player menu and character list, yellow dialog boxes, the grey duel-style profile window, the
gold-rimmed place plate, outlined avatar names and the chat window's bar and translucent log. The page header and
bottom navigation are replaced by the original menu bar (src/ui/menu.ts: Menu, Duel and Move keys drawn from
menuicon_02_c01 when assets are configured, and the message strip); the former navigation entries live in the Main
Menu window it opens. Still different from the replica: title art (not in merge.dat), chat channel tabs (a select),
the deck editor and shop layouts, and the in-duel windows.

## Walkthrough with original art — 2026-11-04 (afternoon)

The client was driven end to end in Chromium against the real game authority with original art read from the archive (title → character → lobby → profile → shop → deck editor → NPC dialogue → rock-paper-scissors → full NPC duel → result → lobby), and every screen was compared with captures of the original. Fixed from that:

- Duel screen uses the original Academy backdrop (field-spell backdrops per `duel_field.txt`), the zone frame sheet, phase buttons, card back, janken cards/turn plates and YOU WIN/LOSE/DRAW banners. Zone geometry is measured from the original 1024×768 screen (`FIELD_LAYOUT`); the board keeps 4:3 and zooms on phones. Without configured assets the same layout is drawn without broken images.
- Readable duel log; NPC/PvP opponent names; option prompts no longer offer their referenced cards as selections; server information boxes (e.g. refused surrender) show as OK message boxes with original wording.
- Shop shows pack names/descriptions/art from `data/cardpack/PACK_*`; NPC reward packs use the same names. NPC dialogue joins each line's five balloon rows. Profile is a closable player card. Lobby fits the window; the player menu is no longer hidden under the area panel.

New browser evidence: `tests/browser-pvp.test.ts` (`BROWSER_PVP=1`, two accounts in two isolated browser contexts) passes: challenge → accept → RPS → ten turns with both screens agreeing on turn/phase/LP/names → refused early surrender message → confirmed surrender → Victory/Defeat → both back in a usable lobby. Full suite: 85 files / 1,017 tests pass; desktop/mobile NPC e2e and the opt-in real-asset browser checks pass.

Still open at that point: see "Known gaps" below.

## Resumed work

- Independent response oracle now compares new encoder packets through isolated copies of the actual translator: 72 recordings, 5,791 logical decisions / 5,914 new packets, including 5,235 successful core choices. It found and fixed read-only pile inspection confirmation. Remaining rejected requests are checked for hidden semantic progress rather than credited as successful choices. See `src/duel/README.md` for exact boundaries.
- Actual engine scenarios cover natural deckout victory and a Wall payment / Self-Destruct Button draw, both perspectives and repeated settlement cleanup. See DUEL_OUTCOMES.md.
- Worker/auth/WorldDO routes now have integration evidence using Miniflare D1, the real GameApi and network character selection. Browser cookie enforcement and Cloudflare host lifecycle remain outside that evidence. See HTTP_EVIDENCE.md.
- Multi-game matches, sideboarding, tag relay, richer deck editing, native .ydc files, generated card details and original scene loading are being integrated and verified. Their presence does not establish whole-flow parity.
- Asset cache admission now validates supported image headers before URL creation and charges estimated RGBA storage plus encoded/Blob bytes. This is an admission estimate, not a measured browser/GPU bound. Focused asset/cache tests pass.
- Original scene tables and paths were checked with bounded reads from the project's configured original asset host. No archive is downloaded whole or committed. Real scene rendering and browser media validation remain pending.

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

`npm run parity` passes: all 81 whole-flow acceptance items are verified by browser evidence (2026-11-04, clean trees at
cc0e0d8..bd2f03d). Chromium (Vulkan) drove the client against the real local stack: wrangler dev of `server/` with
better-auth, D1, WorldDO and the duel engine. See ACCEPTANCE.md and PARITY.md.

Duel-screen gaps closed (2026-11-04, compared with the original game and its decompiled source):
- Card-name declarations list the original's candidates (CWindowDeckList kinds 0x4b..0x4e: every card but tokens, one
  per name, narrowed by the list mode, in CARD_Sort order when `tools/duel-texts.mjs` is given `DE_CARD_SORT` and
  `DE_CARD_PROP`), filtered while typing as its search box does; picking one declares it (src/ui/duel-announce.ts).
- LP payments are logged as the original Duel Log words them ("<name> paid 1000 LP (LP 8000 -> 7000)", damage "took",
  recovery "gained"): engine 0x25's P1 type 2 is a cost.
- Board selections show an instruction line: the translator's pick-panel texts (274 a target, 18 a Tribute, 244 the
  opponent's hand), 222 an attack target, and for a zone the original's zone names. The original engine against this
  server shows no text for them (only the pink hover frame: the server's `pick_panel` is off); these are its own dialog
  lines for the same choices.
- Counters and turn counts are the original's badges (CCard::drawCounters / drawCounterRoom: magic_counter.png coins,
  pas_eff_suna.png hourglass, duel_fontm_y digits, the coin's turn and burst on a change); text badges remain only
  without the original art.
- Portraits blink as the original's: the eye parts' `_02` / `_03` frames, half-shut, shut, half-shut for 8 game frames
  each after a random 0.3-9 s (measured from a 30 fps screencast of the original duel screen).
- The attack follows CBattleManager state 4: the arrow (duel_ef_attackIcon_a) turns 8 frames and flies 8 frames on a
  1 - cos ease, then the hit movie, turned the way it flew, and the hit mark.

Known gaps, not blocking any acceptance flow:
- Presentation: accessory names read "Avatar item N"; title/character-select art missing (not in `merge.dat`); chat
  channels are a dropdown; the menu bar sits under the frame. Duel effects whose players are not decompiled (phase and
  turn banners, LP damage digits, chain plaques, summon/set sparkles, coin and die tosses) keep their measured-by-eye
  timings; the portraits' sweat frames (04..07) and talking mouths are not used (their triggers are not known).
- HTML UI: the screens are a hand-made replica of `client/web-shell/htmlui` as of 2026-10-31. Main's later htmlui
  commits (online-only chat with unread badges, Duel on a player card, the start-screen backdrop, deck/card-detail
  overflow fixes) are not ported.

Server behaviour seen during acceptance (left for the server): Watch Off is not enforced; PvP duels under ~120 s pay
0 MP; soul-bound cards are refused only at trade commit; a relay disconnect ends a tag duel; the relay log names
captains; the spectator stream needs a privacy audit; a wrong room password answers -495 ("That room no longer
exists.", as the original).

## Material remaining work

1. Camera is the original scrollTo (dead zone 300/350, instant, clamped) and clicks route with the original A* (0x00a04a30); establish original scene/avatar/art presentation; current lobby presentation is simplified. Verify real archive media decoding and card detail/rules/alternate-art completeness.
2. Verify every duel prompt/card family and outcome beyond the recorded corpus, including complete win/draw and all match/sideboarding/tag paths through the browser UI.
3. Complete and compare original animation orchestration, combat timing, effect sounds, field themes, browser audio persistence and accessibility across supported browsers/devices.
4. Replace conservative grid-only world behavior with verified height scaling, pixel/foot collision probes and exit triggers; validate original map/NPC positions.
5. Exercise every social/trade/team/shop/cosmetics/menu flow through the real browser and production-style authenticated HTTP/D1 boundaries, including failures, reconnects and duplicate requests.
6. Measure long sessions with original assets on representative desktop/mobile devices. Existing cache budgets intentionally exclude browser decoded-image/GPU memory.

The checkpoint contains only new client files. Matching server/API changes already present in the original dirty working tree were preserved and are not part of this commit. A clean checkout requires those server changes and generated data. No push, PR, deployment or replacement of the published client was performed.

## Last lifecycle corrections before the pause

A final read-only review confirmed logout/reconnect, stale account-panel auth and abandoned spectator presentation races. Logout now keeps the command lock and clears local auth while awaiting the server; account panels only publish newly received session snapshots; leaving a spectator duel cancels and retires its presentation state. Strict typecheck and 29 focused lifecycle/UI/world tests passed after the fixes; the spectator case additionally checks settings cannot restore the abandoned view. The 564-test full-suite result above predates these final focused corrections; the complete suite was not rerun afterward within the time limit.
